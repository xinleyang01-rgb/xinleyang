from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any
import ssl

from flask import Flask, jsonify, request, send_from_directory


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
CONFIG_PATH = Path(os.environ.get("BRIDGE_CONFIG_PATH", BASE_DIR / "bridge_config.json"))

ENV_CONFIG_KEYS = {
    "mode": "BRIDGE_MODE",
    "api_base": "API_BASE",
    "current_datapoints_base": "CURRENT_DATAPOINTS_BASE",
    "current_datapoints_authorization": "CURRENT_DATAPOINTS_AUTHORIZATION",
    "current_datapoints_access_key": "CURRENT_DATAPOINTS_ACCESS_KEY",
    "current_datapoints_resource": "CURRENT_DATAPOINTS_RESOURCE",
    "current_datapoints_token_version": "CURRENT_DATAPOINTS_TOKEN_VERSION",
    "current_datapoints_method": "CURRENT_DATAPOINTS_METHOD",
    "current_datapoints_ttl_seconds": "CURRENT_DATAPOINTS_TTL_SECONDS",
    "product_id": "PRODUCT_ID",
    "device_name": "DEVICE_NAME",
    "device_id": "DEVICE_ID",
    "api_access_key": "API_ACCESS_KEY",
    "device_access_key": "DEVICE_ACCESS_KEY",
    "api_resource": "API_RESOURCE",
    "token_ttl_seconds": "TOKEN_TTL_SECONDS",
}


def load_config() -> dict[str, Any]:
    loaded: dict[str, Any] = {}
    if CONFIG_PATH.exists():
        with CONFIG_PATH.open("r", encoding="utf-8") as fh:
            loaded = json.load(fh)

    for config_key, env_key in ENV_CONFIG_KEYS.items():
        env_value = os.environ.get(env_key)
        if env_value is not None and env_value != "":
            loaded[config_key] = env_value

    env_streams = os.environ.get("DATASTREAM_IDS")
    if env_streams:
        loaded["datastream_ids"] = [item.strip() for item in env_streams.split(",") if item.strip()]

    if "device_id" in loaded and loaded["device_id"] is not None:
        loaded["device_id"] = str(loaded["device_id"])

    for int_key in ("token_ttl_seconds", "current_datapoints_ttl_seconds"):
        if int_key in loaded and loaded[int_key] not in (None, ""):
            loaded[int_key] = int(loaded[int_key])

    return loaded


config = load_config()

app = Flask(__name__, static_folder=str(STATIC_DIR), static_url_path="/static")

state_lock = threading.Lock()
latest_state: dict[str, Any] = {}
last_state_refresh_at = 0.0
state_refresh_in_progress = False
last_command_status = {
    "state": "idle",
    "message": None,
    "command": None,
    "updated_at": None,
}
bridge_status = {
    "provider": config.get("mode", "onenet_api"),
    "connected": False,
    "auth_expired": False,
    "last_message_at": None,
    "last_publish_at": None,
    "last_error": None,
    "auth_mode": None,
    "device_id": config.get("device_id"),
    "device_name": config.get("device_name"),
}

SSL_UNVERIFIED_CONTEXT = ssl._create_unverified_context()


DEFAULT_AUTH_CONTEXTS = []
if config.get("api_access_key"):
    DEFAULT_AUTH_CONTEXTS.append(
        {
            "name": "product",
            "access_key": config["api_access_key"],
            "resource": config.get("api_resource", f"products/{config['product_id']}"),
        }
    )
if config.get("device_access_key"):
    DEFAULT_AUTH_CONTEXTS.append(
        {
            "name": "device",
            "access_key": config["device_access_key"],
            "resource": f"products/{config['product_id']}/devices/{config['device_name']}",
        }
    )


def build_onenet_token(access_key_b64: str, resource: str, expires_at: int | None = None) -> str:
    expires = expires_at or int(time.time()) + int(config.get("token_ttl_seconds", 3600))
    version = "2018-10-31"
    method = "sha1"
    sign_input = f"{expires}\n{method}\n{resource}\n{version}"
    raw_key = base64.b64decode(access_key_b64)
    sign = base64.b64encode(hmac.new(raw_key, sign_input.encode("utf-8"), hashlib.sha1).digest()).decode("utf-8")
    return (
        f"version={version}"
        f"&res={urllib.parse.quote(resource, safe='')}"
        f"&et={expires}"
        f"&method={method}"
        f"&sign={urllib.parse.quote(sign, safe='')}"
    )


def build_custom_onenet_token(
    access_key_b64: str,
    resource: str,
    *,
    version: str,
    method: str,
    ttl_seconds: int,
) -> str:
    expires = int(time.time()) + int(ttl_seconds)
    raw_key = base64.b64decode(access_key_b64)
    sign_input = f"{expires}\n{method}\n{resource}\n{version}".encode("utf-8")
    digest = getattr(hashlib, method)
    sign = base64.b64encode(hmac.new(raw_key, sign_input, digest).digest()).decode("utf-8")
    return (
        f"version={version}"
        f"&res={urllib.parse.quote(resource, safe='')}"
        f"&et={expires}"
        f"&method={method}"
        f"&sign={urllib.parse.quote(sign, safe='')}"
    )


def decode_cmd_response(value: str | None) -> str | None:
    if not value:
        return value
    try:
        decoded = base64.b64decode(value).decode("utf-8")
    except Exception:
        return value
    return urllib.parse.unquote(decoded)


def api_error_message(payload: dict[str, Any]) -> str | None:
    if "errno" in payload and payload.get("errno") not in (0, "0", None):
        return str(payload.get("error") or payload.get("msg") or payload.get("message") or f"errno={payload.get('errno')}")
    code_no = payload.get("code_no")
    if code_no and code_no != "000000":
        return str(payload.get("message") or payload.get("error") or code_no)
    code = payload.get("code")
    if code and code not in ("onenet_common_success", "success"):
        return str(payload.get("message") or payload.get("msg") or payload.get("error") or code)
    return None


def is_auth_expired_error(message: str | None) -> bool:
    if not message:
        return False
    lowered = message.lower()
    return "request has expired" in lowered or "token expired" in lowered or "已过期" in message


def request_json(method: str, path: str, *, body: dict[str, Any] | None = None, allow_api_error: bool = False) -> tuple[dict[str, Any], str]:
    errors: list[str] = []
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    url = f"{config['api_base'].rstrip('/')}{path}"

    for auth_context in DEFAULT_AUTH_CONTEXTS:
        token = build_onenet_token(auth_context["access_key"], auth_context["resource"])
        headers = {
            "Authorization": token,
            "Accept": "application/json",
        }
        if payload is not None:
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=payload, method=method.upper(), headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                api_error = api_error_message(data)
                if api_error and not allow_api_error:
                    errors.append(f"{auth_context['name']} auth API error: {api_error}")
                    continue
                return data, auth_context["name"]
        except urllib.error.HTTPError as exc:
            body_text = exc.read().decode("utf-8", errors="replace")
            errors.append(f"{auth_context['name']} auth HTTP {exc.code}: {body_text}")
        except Exception as exc:  # pragma: no cover - defensive
            errors.append(f"{auth_context['name']} auth error: {exc}")

    raise RuntimeError(" | ".join(errors) if errors else "OneNET request failed")


def get_device_info() -> tuple[dict[str, Any], str]:
    path = f"/mqtt/v1/devices/{urllib.parse.quote(config['device_name'], safe='')}"
    payload, auth_name = request_json("GET", path)
    return payload, auth_name


def get_current_datapoints() -> tuple[dict[str, Any], str]:
    dynamic_access_key = config.get("current_datapoints_access_key")
    dynamic_resource = config.get("current_datapoints_resource")
    base_url = config.get("current_datapoints_base", "https://iot-api.heclouds.com").rstrip("/")
    query = urllib.parse.urlencode(
        {
            "product_id": config["product_id"],
            "device_name": config["device_name"],
        }
    )
    url = f"{base_url}/datapoint/current-datapoints?{query}"
    errors: list[str] = []

    auth_candidates: list[tuple[str, str]] = []
    if dynamic_access_key and dynamic_resource:
        auth_candidates.append(
            (
                "custom",
                build_custom_onenet_token(
                    dynamic_access_key,
                    dynamic_resource,
                    version=config.get("current_datapoints_token_version", "2022-05-01"),
                    method=config.get("current_datapoints_method", "sha1"),
                    ttl_seconds=int(config.get("current_datapoints_ttl_seconds", 3600)),
                ),
            )
        )

    if config.get("api_access_key"):
        auth_candidates.append(
            (
                "product",
                build_custom_onenet_token(
                    config["api_access_key"],
                    config.get("api_resource", f"products/{config['product_id']}"),
                    version="2022-05-01",
                    method="sha1",
                    ttl_seconds=int(config.get("token_ttl_seconds", 3600)),
                ),
            )
        )

    if config.get("device_access_key"):
        auth_candidates.append(
            (
                "device",
                build_custom_onenet_token(
                    config["device_access_key"],
                    f"products/{config['product_id']}/devices/{config['device_name']}",
                    version="2022-05-01",
                    method="sha1",
                    ttl_seconds=int(config.get("token_ttl_seconds", 3600)),
                ),
            )
        )

    static_authorization = config.get("current_datapoints_authorization")
    if static_authorization:
        auth_candidates.append(("static", static_authorization))

    if not auth_candidates:
        raise RuntimeError("missing current_datapoints authorization configuration")

    for auth_name, authorization in auth_candidates:
        req = urllib.request.Request(
            url,
            method="GET",
            headers={
                "Authorization": authorization,
                "Accept": "application/json, text/plain, */*",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=12, context=SSL_UNVERIFIED_CONTEXT) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            api_error = api_error_message(payload)
            if api_error:
                errors.append(f"{auth_name} auth API error: {api_error}")
                continue
            return payload, auth_name
        except Exception as exc:
            errors.append(f"{auth_name} auth error: {exc}")

    raise RuntimeError(" | ".join(errors))


def get_latest_datapoints() -> tuple[dict[str, Any], str]:
    stream_ids = ",".join(config["datastream_ids"])
    path = (
        f"/devices/{config['device_id']}/datapoints"
        f"?datastream_id={urllib.parse.quote(stream_ids, safe=',')}"
        f"&limit=1&sort=DESC"
    )
    payload, auth_name = request_json("GET", path)
    return payload, auth_name


def normalize_state(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data", {})
    devices = data.get("devices") or []
    if devices:
        raw_streams = devices[0].get("datastreams", [])
    else:
        raw_streams = data.get("datastreams", [])
    stream_map: dict[str, Any] = {}
    for stream in raw_streams:
        stream_id = stream.get("id")
        if not stream_id:
            continue
        datapoints = stream.get("datapoints") or []
        if datapoints:
            value = datapoints[0].get("value")
        else:
            value = stream.get("value")
        stream_map[stream_id] = value

    normalized = {
        "temp_c": stream_map.get("temp"),
        "humi": stream_map.get("humi"),
        "tvoc_mg": stream_map.get("tvoc"),
        "pm25_mg": stream_map.get("pm25"),
        "mode": stream_map.get("mode"),
        "R1": stream_map.get("r1"),
        "R2": stream_map.get("r2"),
        "SG": stream_map.get("sg"),
        "humidity_threshold": stream_map.get("h_y"),
        "pm_threshold": stream_map.get("p_y"),
        "received_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    return normalized


def fetch_state_snapshot() -> tuple[dict[str, Any], str]:
    normalized = {
        "temp_c": None,
        "humi": None,
        "tvoc_mg": None,
        "pm25_mg": None,
        "mode": None,
        "R1": None,
        "R2": None,
        "SG": None,
        "humidity_threshold": None,
        "pm_threshold": None,
        "received_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    auth_name = None
    primary_error: Exception | None = None

    try:
        payload, auth_name = get_current_datapoints()
        normalized = normalize_state(payload)
    except Exception as exc:
        primary_error = exc
        try:
            payload, _ = get_latest_datapoints()
            normalized = normalize_state(payload)
        except Exception as fallback_exc:
            if primary_error and is_auth_expired_error(str(primary_error)):
                raise primary_error
            raise fallback_exc

    return normalized, auth_name or "unknown"


def refresh_state_sync() -> None:
    global last_state_refresh_at

    normalized, auth_name = fetch_state_snapshot()
    with state_lock:
        latest_state.clear()
        latest_state.update(normalized)
        bridge_status["connected"] = True
        bridge_status["auth_expired"] = False
        bridge_status["auth_mode"] = auth_name
        bridge_status["last_message_at"] = latest_state["received_at"]
        bridge_status["last_error"] = None
        last_state_refresh_at = time.time()


def refresh_state_async() -> None:
    global state_refresh_in_progress
    try:
        refresh_state_sync()
    except Exception as exc:
        with state_lock:
            bridge_status["connected"] = False
            bridge_status["auth_expired"] = is_auth_expired_error(str(exc))
            bridge_status["last_error"] = str(exc)
    finally:
        with state_lock:
            state_refresh_in_progress = False


def ensure_state_refresh(force: bool = False) -> None:
    global state_refresh_in_progress

    with state_lock:
        stale = not latest_state or (time.time() - last_state_refresh_at) >= 12
        should_start = (force or stale) and not state_refresh_in_progress
        if should_start:
            state_refresh_in_progress = True
        else:
            return

    worker = threading.Thread(target=refresh_state_async, daemon=True)
    worker.start()


def send_command_sync(command: dict[str, Any]) -> dict[str, Any]:
    path = f"/v1/synccmds?device_id={config['device_id']}&timeout=6"
    response, auth_name = request_json("POST", path, body=command)
    decoded_resp = decode_cmd_response(response.get("data", {}).get("cmd_resp"))
    with state_lock:
        bridge_status["connected"] = True
        bridge_status["auth_expired"] = False
        bridge_status["auth_mode"] = auth_name
        bridge_status["last_publish_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        bridge_status["last_error"] = None
    return {
        "sent": command,
        "cmd_uuid": response.get("data", {}).get("cmd_uuid"),
        "cmd_resp": decoded_resp,
    }


def dispatch_command_async(command: dict[str, Any]) -> None:
    try:
        result = send_command_sync(command)
        with state_lock:
            last_command_status["state"] = "ok"
            last_command_status["message"] = result.get("cmd_resp") or "ok"
            last_command_status["command"] = command
            last_command_status["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    except Exception as exc:
        with state_lock:
            bridge_status["connected"] = False
            bridge_status["auth_expired"] = is_auth_expired_error(str(exc))
            bridge_status["last_error"] = str(exc)
            last_command_status["state"] = "error"
            last_command_status["message"] = str(exc)
            last_command_status["command"] = command
            last_command_status["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")


@app.get("/")
def index() -> Any:
    return send_from_directory(STATIC_DIR, "index.html")


@app.get("/app.js")
def app_js() -> Any:
    return send_from_directory(STATIC_DIR, "app.js")


@app.get("/styles.css")
def styles_css() -> Any:
    return send_from_directory(STATIC_DIR, "styles.css")


@app.get("/api/status")
def api_status() -> Any:
    force_refresh = request.args.get("force") == "1"
    need_sync_refresh = force_refresh
    with state_lock:
        need_sync_refresh = need_sync_refresh or not latest_state

    if need_sync_refresh:
        try:
            refresh_state_sync()
        except Exception as exc:
            with state_lock:
                bridge_status["connected"] = False
                bridge_status["auth_expired"] = is_auth_expired_error(str(exc))
                bridge_status["last_error"] = str(exc)
    else:
        ensure_state_refresh()
    with state_lock:
        return jsonify({"bridge": dict(bridge_status), "state": dict(latest_state), "command": dict(last_command_status)})


@app.post("/api/command")
def api_command() -> Any:
    payload = request.get_json(silent=True) or {}
    command = payload.get("command", {})
    if not isinstance(command, dict) or not command:
        return jsonify({"ok": False, "error": "command payload is required"}), 400

    with state_lock:
        last_command_status["state"] = "sending"
        last_command_status["message"] = "sending"
        last_command_status["command"] = command
        last_command_status["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")

    worker = threading.Thread(target=dispatch_command_async, args=(dict(command),), daemon=True)
    worker.start()

    return jsonify(
        {
            "ok": True,
            "queued": True,
            "sent": command,
        }
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
