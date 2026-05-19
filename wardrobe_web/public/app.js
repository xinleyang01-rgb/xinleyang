const ONENET = {
  productId: "PU3721W9C4",
  deviceName: "stm32",
  deviceId: "2592570552",
  statusUrl: "https://iot-api.heclouds.com/datapoint/current-datapoints",
  commandUrl: "https://api.heclouds.com/v1/synccmds",
  statusAuth: {
    accessKey: "azlraXdmMlBsVkRxcTRTNHR4OFZWRGJ1dmhqUURuV3o=",
    resource: "products/PU3721W9C4/devices/stm32",
    version: "2018-10-31",
    method: "sha1",
    ttlSeconds: 3600
  },
  commandAuth: {
    accessKey: "f2XN78l/az93zz+HUwH1J30V529HwR+vh50bTVXB2x0=",
    resource: "products/PU3721W9C4",
    version: "2018-10-31",
    method: "sha1",
    ttlSeconds: 3600
  }
};

const MODE_LABELS = { 0: "手动", 1: "智能", 2: "定时" };
const BINARY_LABELS = { 0: "关闭", 1: "开启" };
const VENT_ON_THRESHOLD = 0;
const VENT_OFF_THRESHOLD = 101;

const CLOTHES = [
  { name: "白衬衫", note: "A区上层 / 常穿 / 可与深灰西裤搭配" },
  { name: "浅蓝牛仔外套", note: "B区中层 / 春秋 / 靠近照明区" },
  { name: "黑色卫衣", note: "B区下层 / 秋冬 / 日常高频取用" }
];

const state = {
  current: {
    temp: "--",
    humi: "--",
    tvoc: "--",
    pm25: "--",
    mode: null,
    sg: null,
    r1: null,
    r2: null,
    h_y: "--",
    p_y: "--",
    at: "--"
  },
  pollTimer: null,
  isPolling: false,
  pendingCommand: null
};

const dom = {};

function $(id) {
  return document.getElementById(id);
}

function initDom() {
  dom.platformStatus = $("platform-status");
  dom.platformStatusText = $("platform-status-text");
  dom.updatedAt = $("updated-at");
  dom.feedbackBox = $("feedback-box");
  dom.metricTemp = $("metric-temp");
  dom.metricHumi = $("metric-humi");
  dom.metricTvoc = $("metric-tvoc");
  dom.metricPm25 = $("metric-pm25");
  dom.stateMode = $("state-mode");
  dom.stateDoor = $("state-door");
  dom.stateSterilize = $("state-sterilize");
  dom.stateVent = $("state-vent");
  dom.stateHThreshold = $("state-h-threshold");
  dom.statePThreshold = $("state-p-threshold");
  dom.humidityInput = $("humidity-input");
  dom.pmInput = $("pm-input");
  dom.startInput = $("start-input");
  dom.endInput = $("end-input");
  dom.settingsBtn = $("settings-btn");
  dom.modeButtons = Array.from(document.querySelectorAll(".mode-btn"));
  dom.doorOpenBtn = $("door-open-btn");
  dom.doorCloseBtn = $("door-close-btn");
  dom.sterOpenBtn = $("ster-open-btn");
  dom.sterCloseBtn = $("ster-close-btn");
  dom.ventOpenBtn = $("vent-open-btn");
  dom.ventCloseBtn = $("vent-close-btn");
}

function setPlatformStatus(kind, text) {
  dom.platformStatus.className = `status-pill ${kind}`;
  dom.platformStatusText.textContent = text;
}

function setFeedback(text) {
  dom.feedbackBox.textContent = text;
}

function setMetric(element, value) {
  element.textContent = value === null || value === undefined || value === "" ? "--" : String(value);
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function buildToken(authConfig) {
  const expires = Math.floor(Date.now() / 1000) + Number(authConfig.ttlSeconds || 3600);
  const signInput = `${expires}\n${authConfig.method}\n${authConfig.resource}\n${authConfig.version}`;
  const keyBytes = Uint8Array.from(atob(authConfig.accessKey), (ch) => ch.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(signInput));
  const sign = encodeURIComponent(bytesToBase64(new Uint8Array(signature)));
  return `version=${authConfig.version}&res=${encodeURIComponent(authConfig.resource)}&et=${expires}&method=${authConfig.method}&sign=${sign}`;
}

function normalizeState(payload) {
  const device = (((payload || {}).data || {}).devices || [])[0] || {};
  const datastreams = device.datastreams || [];
  const map = {};

  datastreams.forEach((stream) => {
    map[stream.id] = stream.value;
  });

  return {
    temp: map.temp ?? "--",
    humi: map.humi ?? "--",
    tvoc: map.tvoc ?? "--",
    pm25: map.pm25 ?? "--",
    mode: map.mode === undefined ? null : Number(map.mode),
    sg: map.sg === undefined ? null : Number(map.sg),
    r1: map.r1 === undefined ? null : Number(map.r1),
    r2: map.r2 === undefined ? null : Number(map.r2),
    h_y: map.h_y ?? "--",
    p_y: map.p_y ?? "--",
    at: datastreams[0] ? datastreams[0].at : "--"
  };
}

function applyState(nextState) {
  state.current = nextState;

  setMetric(dom.metricTemp, nextState.temp);
  setMetric(dom.metricHumi, nextState.humi);
  setMetric(dom.metricTvoc, nextState.tvoc);
  setMetric(dom.metricPm25, nextState.pm25);
  setMetric(dom.stateHThreshold, nextState.h_y);
  setMetric(dom.statePThreshold, nextState.p_y);

  dom.stateMode.textContent = nextState.mode === null ? "--" : MODE_LABELS[nextState.mode] || "--";
  dom.stateDoor.textContent = nextState.sg === null ? "--" : (nextState.sg === 1 ? "打开" : "关闭");
  dom.stateSterilize.textContent = nextState.r1 === null ? "--" : (BINARY_LABELS[nextState.r1] || "--");
  dom.stateVent.textContent = nextState.r2 === null ? "--" : (BINARY_LABELS[nextState.r2] || "--");
  dom.updatedAt.textContent = nextState.at || "等待设备上报";

  if (nextState.h_y !== "--") {
    dom.humidityInput.value = nextState.h_y;
  }
  if (nextState.p_y !== "--") {
    dom.pmInput.value = nextState.p_y;
  }

  renderControlStates();
}

function markActive(button, active) {
  button.classList.toggle("active", Boolean(active));
}

function markPending(button, pending) {
  button.classList.toggle("pending", Boolean(pending));
}

function renderControlStates() {
  dom.modeButtons.forEach((button) => {
    const mode = Number(button.dataset.mode);
    const isCurrent = state.current.mode === mode;
    const isPending = state.pendingCommand && state.pendingCommand.command.mode === mode;
    markActive(button, isCurrent);
    markPending(button, isPending);
  });

  const activeBinary = (onButton, offButton, currentValue, pendingValue) => {
    markActive(onButton, currentValue === 1);
    markActive(offButton, currentValue === 0);
    markPending(onButton, pendingValue === 1);
    markPending(offButton, pendingValue === 0);
  };

  const pendingDoor = state.pendingCommand && Object.prototype.hasOwnProperty.call(state.pendingCommand.command, "SG")
    ? Number(state.pendingCommand.command.SG)
    : null;
  const pendingSter = state.pendingCommand && Object.prototype.hasOwnProperty.call(state.pendingCommand.command, "R1")
    ? Number(state.pendingCommand.command.R1)
    : null;
  const pendingVent = state.pendingCommand && Object.prototype.hasOwnProperty.call(state.pendingCommand.command, "Hu")
    ? (Number(state.pendingCommand.command.Hu) <= 0 ? 1 : Number(state.pendingCommand.command.Hu) >= 101 ? 0 : null)
    : null;

  activeBinary(dom.doorOpenBtn, dom.doorCloseBtn, state.current.sg, pendingDoor);
  activeBinary(dom.sterOpenBtn, dom.sterCloseBtn, state.current.r1, pendingSter);
  activeBinary(dom.ventOpenBtn, dom.ventCloseBtn, state.current.r2, pendingVent);
}

function clearPendingCommand() {
  state.pendingCommand = null;
  renderControlStates();
}

function optimisticApply(command) {
  const next = { ...state.current };

  if (Object.prototype.hasOwnProperty.call(command, "mode")) {
    next.mode = Number(command.mode);
  }
  if (Object.prototype.hasOwnProperty.call(command, "SG")) {
    next.sg = Number(command.SG);
  }
  if (Object.prototype.hasOwnProperty.call(command, "R1")) {
    next.r1 = Number(command.R1);
  }
  if (Object.prototype.hasOwnProperty.call(command, "Hu")) {
    next.h_y = Number(command.Hu);
    if (Number(command.Hu) <= 0) next.r2 = 1;
    if (Number(command.Hu) >= 101) next.r2 = 0;
  }
  if (Object.prototype.hasOwnProperty.call(command, "PM")) {
    next.p_y = Number(command.PM);
  }

  applyState(next);
}

function commandMatchesState(command, current) {
  const numericEqual = (a, b) => Number(a) === Number(b);

  if (Object.prototype.hasOwnProperty.call(command, "mode") && !numericEqual(current.mode, command.mode)) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(command, "SG") && !numericEqual(current.sg, command.SG)) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(command, "R1") && !numericEqual(current.r1, command.R1)) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(command, "Hu")) {
    if (!numericEqual(current.h_y, command.Hu)) return false;
    if (Number(command.Hu) <= 0 && !numericEqual(current.r2, 1)) return false;
    if (Number(command.Hu) >= 101 && !numericEqual(current.r2, 0)) return false;
  }
  if (Object.prototype.hasOwnProperty.call(command, "PM") && !numericEqual(current.p_y, command.PM)) {
    return false;
  }

  return true;
}

async function fetchStatus() {
  const authorization = await buildToken(ONENET.statusAuth);
  const query = new URLSearchParams({
    product_id: ONENET.productId,
    device_name: ONENET.deviceName
  });
  const response = await fetch(`${ONENET.statusUrl}?${query.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json, text/plain, */*",
      Authorization: authorization
    }
  });

  const payload = await response.json();
  if (Number(payload.code) !== 0) {
    throw new Error(payload.msg || "状态读取失败");
  }

  return normalizeState(payload);
}

async function refreshStatus() {
  if (state.isPolling) return;
  state.isPolling = true;

  try {
    const next = await fetchStatus();
    applyState(next);
    setPlatformStatus("connected", "OneNET 已连接");
  } catch (error) {
    setPlatformStatus("error", "OneNET 状态读取失败");
    setFeedback(`状态读取失败：${error.message}`);
  } finally {
    state.isPolling = false;
  }
}

function schedulePolling() {
  window.clearTimeout(state.pollTimer);
  state.pollTimer = window.setInterval(() => {
    if (!state.pendingCommand) {
      refreshStatus();
    }
  }, 6000);
}

async function waitForDeviceReflection(pending) {
  const deadline = Date.now() + 12000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 1500));
    const current = await fetchStatus();
    applyState(current);
    setPlatformStatus("connected", "OneNET 已连接");
    if (commandMatchesState(pending.command, current)) {
      return true;
    }
  }

  return false;
}

async function sendCommand(command, pendingText) {
  window.clearInterval(state.pollTimer);
  state.pendingCommand = { command, startedAt: Date.now() };
  optimisticApply(command);
  setFeedback(`${pendingText}，正在等待设备上报新状态...`);

  try {
    const authorization = await buildToken(ONENET.commandAuth);
    const response = await fetch(`${ONENET.commandUrl}?device_id=${encodeURIComponent(ONENET.deviceId)}&timeout=6`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        Authorization: authorization
      },
      body: JSON.stringify(command)
    });

    const payload = await response.json();
    if (Number(payload.errno) !== 0) {
      throw new Error(payload.error || "命令发送失败");
    }

    const matched = await waitForDeviceReflection(state.pendingCommand);
    if (matched) {
      setFeedback("设备已上报新状态，控制已生效");
    } else {
      setFeedback("平台已接收命令，但设备未在预期时间内上报匹配状态");
    }
  } catch (error) {
    if (/timeout/i.test(error.message || "")) {
      try {
        const matched = await waitForDeviceReflection(state.pendingCommand);
        if (matched) {
          setFeedback("设备虽未及时回执，但已上报新状态");
        } else {
          setFeedback("平台回执超时，且设备未上报匹配状态");
        }
      } catch (verifyError) {
        setFeedback(`命令发送失败：${verifyError.message}`);
      }
    } else {
      setFeedback(`命令发送失败：${error.message}`);
    }
  } finally {
    clearPendingCommand();
    schedulePolling();
  }
}

function bindControlEvents() {
  dom.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const mode = Number(button.dataset.mode);
      sendCommand({ mode }, `已发送${MODE_LABELS[mode]}模式命令`);
    });
  });

  dom.doorOpenBtn.addEventListener("click", () => sendCommand({ SG: 1 }, "已发送开柜门命令"));
  dom.doorCloseBtn.addEventListener("click", () => sendCommand({ SG: 0 }, "已发送关柜门命令"));
  dom.sterOpenBtn.addEventListener("click", () => {
    if (state.current.mode !== 0) {
      setFeedback("消毒手动控制仅在手动模式下可用，请先切换到手动模式");
      return;
    }
    sendCommand({ R1: 1 }, "已发送消毒开启命令");
  });
  dom.sterCloseBtn.addEventListener("click", () => {
    if (state.current.mode !== 0) {
      setFeedback("消毒手动控制仅在手动模式下可用，请先切换到手动模式");
      return;
    }
    sendCommand({ R1: 0 }, "已发送消毒关闭命令");
  });
  dom.ventOpenBtn.addEventListener("click", () => sendCommand({ Hu: VENT_ON_THRESHOLD }, "已发送通风开启命令"));
  dom.ventCloseBtn.addEventListener("click", () => sendCommand({ Hu: VENT_OFF_THRESHOLD }, "已发送通风关闭命令"));
  dom.settingsBtn.addEventListener("click", () => {
    const humidity = Number(dom.humidityInput.value);
    const pm = Number(dom.pmInput.value);
    const start = dom.startInput.value;
    const end = dom.endInput.value;
    sendCommand({ Hu: humidity, PM: pm, ST: start, ET: end }, "已发送阈值与定时设置");
  });
}

function renderFinder() {
  const cards = document.querySelectorAll(".finder-card");
  cards.forEach((card, index) => {
    if (!CLOTHES[index]) return;
    card.querySelector("h3").textContent = CLOTHES[index].name;
    card.querySelector("p").textContent = CLOTHES[index].note;
  });
}

async function init() {
  initDom();
  renderFinder();
  bindControlEvents();
  setPlatformStatus("pending", "正在连接 OneNET");
  setFeedback("页面已准备好，正在读取设备状态");
  await refreshStatus();
  schedulePolling();
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    setPlatformStatus("error", "页面初始化失败");
    if (dom.feedbackBox) {
      setFeedback(`初始化失败：${error.message}`);
    }
  });
});
