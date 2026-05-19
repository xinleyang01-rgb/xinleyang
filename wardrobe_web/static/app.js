const MODE_LABELS = {
  0: "手动",
  1: "智能",
  2: "定时"
};

const SWITCH_LABELS = {
  0: "关闭",
  1: "开启"
};

const VENT_ON_THRESHOLD = 0;
const VENT_OFF_THRESHOLD = 101;
const POLL_INTERVAL_MS = 5000;
const LOOKUP_STORAGE_KEY = "wardrobe-web-schedule-draft";

const LOOKUP_ITEMS = [
  {
    name: "白衬衫",
    zone: "A区上层",
    season: "四季",
    tag: "答辩通勤",
    material: "棉质",
    scene: "答辩 / 正装 / 面试",
    note: "适合答辩、面试和正式场合，建议与深色西裤搭配收纳。"
  },
  {
    name: "牛仔外套",
    zone: "B区中层",
    season: "春秋",
    tag: "外穿",
    material: "牛仔",
    scene: "通勤 / 校园 / 日常",
    note: "靠近照明区域，适合天气转凉时快速取放。"
  },
  {
    name: "羊毛大衣",
    zone: "C区长衣位",
    season: "冬季",
    tag: "长款",
    material: "羊毛",
    scene: "冬季出行 / 正式场合",
    note: "需要保持干燥环境，避免长时间高湿存放。"
  },
  {
    name: "运动卫衣",
    zone: "B区下层",
    season: "休闲",
    tag: "周末",
    material: "抓绒",
    scene: "运动 / 周末 / 休闲",
    note: "建议与运动裤一并收纳，方便周末快速搭配。"
  },
  {
    name: "真丝连衣裙",
    zone: "A区防尘罩内",
    season: "精细衣物",
    tag: "防皱",
    material: "真丝",
    scene: "聚会 / 约会 / 精细收纳",
    note: "建议在低湿度环境下悬挂收纳，避免压叠。"
  },
  {
    name: "围巾与配饰盒",
    zone: "抽屉1",
    season: "配饰",
    tag: "小件",
    material: "混合材质",
    scene: "配饰 / 临出门整理",
    note: "后续可接入 RFID 做精确定位，适合小件快速查找。"
  },
  {
    name: "深灰西裤",
    zone: "A区下层",
    season: "四季",
    tag: "正装",
    material: "混纺",
    scene: "答辩 / 通勤 / 正式场合",
    note: "建议与白衬衫组成成套收纳，提高正式场合取衣效率。"
  },
  {
    name: "黑色休闲裤",
    zone: "B区裤架",
    season: "四季",
    tag: "高频",
    material: "棉质",
    scene: "日常 / 通勤 / 周末",
    note: "使用频率高，建议放在中层方便早晚快速取用。"
  },
  {
    name: "羽绒服",
    zone: "C区长衣位",
    season: "冬季",
    tag: "厚外套",
    material: "羽绒",
    scene: "寒冷天气 / 外出",
    note: "收纳前建议保持柜内干燥，避免受潮结块。"
  },
  {
    name: "针织毛衣",
    zone: "A区叠放层",
    season: "秋冬",
    tag: "保暖",
    material: "针织",
    scene: "降温 / 教室 / 日常",
    note: "适合叠放收纳，建议与围巾类配件分区整理。"
  },
  {
    name: "短袖T恤",
    zone: "B区叠放层",
    season: "夏季",
    tag: "基础款",
    material: "棉质",
    scene: "夏季 / 宿舍 / 日常",
    note: "建议按颜色叠放，提升换季查找效率。"
  },
  {
    name: "家居服",
    zone: "抽屉2",
    season: "四季",
    tag: "居家",
    material: "棉质",
    scene: "睡眠 / 居家 / 夜间",
    note: "放在抽屉区可减少折叠褶皱并方便夜间拿取。"
  },
  {
    name: "运动短裤",
    zone: "抽屉3",
    season: "夏季",
    tag: "运动",
    material: "速干",
    scene: "跑步 / 健身 / 夏季",
    note: "建议与运动卫衣、运动上衣一起归类收纳。"
  },
  {
    name: "衬衣领带盒",
    zone: "抽屉4",
    season: "正装配件",
    tag: "配件",
    material: "混合材质",
    scene: "答辩 / 面试 / 演讲",
    note: "适合和白衬衫、西裤形成正式出行组合。"
  },
  {
    name: "防晒外套",
    zone: "B区挂衣区",
    season: "夏季",
    tag: "轻薄",
    material: "防晒面料",
    scene: "夏季通勤 / 户外",
    note: "轻薄易取，建议靠近前侧挂放提高使用效率。"
  }
];

const state = {
  bridge: {},
  device: {},
  command: {},
  pendingCommand: null,
  shadowPatch: null,
  shadowUntil: 0,
  pollTimer: null,
  isPolling: false,
  timeline: [],
  commandFingerprint: null,
  bridgeErrorFingerprint: null,
  lookupQuery: "",
  settingsDirty: false,
  scheduleDraft: {
    humidity: 60,
    dustPercent: 10,
    start: "05:00",
    end: "12:00"
  }
};

const dom = {};

function $(id) {
  return document.getElementById(id);
}

function initDom() {
  dom.bridgePill = $("bridge-pill");
  dom.bridgePillText = $("bridge-pill-text");
  dom.deviceName = $("device-name");
  dom.bridgeProvider = $("bridge-provider");
  dom.lastSyncAt = $("last-sync-at");
  dom.dataFreshness = $("data-freshness");
  dom.pendingIndicator = $("pending-indicator");
  dom.heroMode = $("hero-mode");
  dom.heroDoor = $("hero-door");
  dom.heroVent = $("hero-vent");
  dom.heroSterilize = $("hero-sterilize");
  dom.stageTempHumi = $("stage-temp-humi");
  dom.stageAirQuality = $("stage-air-quality");
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
  dom.healthAir = $("health-air");
  dom.healthHumi = $("health-humi");
  dom.healthFeedback = $("health-feedback");
  dom.commandState = $("command-state");
  dom.commandUpdatedAt = $("command-updated-at");
  dom.timelineList = $("timeline-list");
  dom.lookupGrid = $("lookup-grid");
  dom.lookupInput = $("lookup-input");
  dom.humidityInput = $("humidity-input");
  dom.pmInput = $("pm-input");
  dom.startInput = $("start-input");
  dom.endInput = $("end-input");
  dom.settingsForm = $("settings-form");
  dom.settingsBtn = $("settings-btn");
  dom.modeButtons = Array.from(document.querySelectorAll(".mode-btn"));
  dom.doorOpenBtn = $("door-open-btn");
  dom.doorCloseBtn = $("door-close-btn");
  dom.sterOpenBtn = $("ster-open-btn");
  dom.sterCloseBtn = $("ster-close-btn");
  dom.ventOpenBtn = $("vent-open-btn");
  dom.ventCloseBtn = $("vent-close-btn");
}

function safeNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMetric(value, digits = 1) {
  const numeric = safeNumber(value);
  if (numeric === null) {
    return "--";
  }
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(digits);
}

function formatStateValue(value, suffix = "") {
  const numeric = safeNumber(value);
  if (numeric === null) {
    return "--";
  }
  return `${numeric}${suffix}`;
}

function normalizeDustThresholdToPercent(value) {
  const numeric = safeNumber(value);
  if (numeric === null) {
    return null;
  }
  return numeric <= 1 ? numeric * 100 : numeric;
}

function dustPercentToDeviceValue(value) {
  const numeric = safeNumber(value);
  if (numeric === null) {
    return null;
  }
  return numeric / 100;
}

function isHumiditySentinel(value) {
  const numeric = safeNumber(value);
  return numeric === 0 || numeric === 101;
}

function modeLabel(mode) {
  const numeric = safeNumber(mode);
  return numeric === null ? "--" : MODE_LABELS[numeric] || `模式 ${numeric}`;
}

function binaryLabel(value, onLabel = "开启", offLabel = "关闭") {
  const numeric = safeNumber(value);
  if (numeric === null) {
    return "--";
  }
  return numeric === 1 ? onLabel : offLabel;
}

function loadScheduleDraft() {
  try {
    const raw = window.localStorage.getItem(LOOKUP_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      state.scheduleDraft = {
        humidity: safeNumber(parsed.humidity) ?? state.scheduleDraft.humidity,
        dustPercent: safeNumber(parsed.dustPercent) ?? state.scheduleDraft.dustPercent,
        start: parsed.start || state.scheduleDraft.start,
        end: parsed.end || state.scheduleDraft.end
      };
    }
  } catch (error) {
    pushTimeline("warn", "本地草稿读取失败", error.message);
  }
}

function saveScheduleDraft() {
  window.localStorage.setItem(LOOKUP_STORAGE_KEY, JSON.stringify(state.scheduleDraft));
}

function applyDraftInputs() {
  dom.humidityInput.value = state.scheduleDraft.humidity;
  dom.pmInput.value = state.scheduleDraft.dustPercent;
  dom.startInput.value = state.scheduleDraft.start;
  dom.endInput.value = state.scheduleDraft.end;
}

function setBridgeStatus(kind, text) {
  dom.bridgePill.className = `connection-pill ${kind}`;
  dom.bridgePillText.textContent = text;
}

function setPendingText(text, kind = "neutral") {
  dom.pendingIndicator.className = `inline-tag ${kind}`;
  dom.pendingIndicator.textContent = text;
}

function setButtonState(button, { active = false, pending = false, disabled = false } = {}) {
  button.classList.toggle("active", Boolean(active));
  button.classList.toggle("pending", Boolean(pending));
  button.disabled = Boolean(disabled);
}

function commandsEqual(left, right) {
  if (!left || !right) {
    return false;
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key, index) => {
    if (key !== rightKeys[index]) {
      return false;
    }
    const leftValue = left[key];
    const rightValue = right[key];
    const leftNumber = safeNumber(leftValue);
    const rightNumber = safeNumber(rightValue);
    if (leftNumber !== null || rightNumber !== null) {
      return leftNumber === rightNumber;
    }
    return String(leftValue) === String(rightValue);
  });
}

function buildShadowPatch(command) {
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(command, "mode")) {
    patch.mode = safeNumber(command.mode);
  }
  if (Object.prototype.hasOwnProperty.call(command, "SG")) {
    patch.SG = safeNumber(command.SG);
  }
  if (Object.prototype.hasOwnProperty.call(command, "R1")) {
    patch.R1 = safeNumber(command.R1);
  }
  if (Object.prototype.hasOwnProperty.call(command, "Hu")) {
    const humidityValue = safeNumber(command.Hu);
    if (!isHumiditySentinel(humidityValue)) {
      patch.humidity_threshold = humidityValue;
    }
    if (humidityValue <= VENT_ON_THRESHOLD) {
      patch.R2 = 1;
    }
    if (humidityValue >= VENT_OFF_THRESHOLD) {
      patch.R2 = 0;
    }
  }
  if (Object.prototype.hasOwnProperty.call(command, "PM")) {
    patch.pm_threshold = safeNumber(command.PM);
  }

  return patch;
}

function applyShadowPatch(command, holdMs = 8000) {
  state.shadowPatch = buildShadowPatch(command);
  state.shadowUntil = Date.now() + holdMs;
}

function clearShadowPatch() {
  state.shadowPatch = null;
  state.shadowUntil = 0;
}

function getEffectiveDeviceState() {
  const merged = { ...state.device };
  if (state.shadowPatch && Date.now() < state.shadowUntil) {
    Object.assign(merged, state.shadowPatch);
    return merged;
  }

  clearShadowPatch();
  return merged;
}

function commandMatchesDevice(command, device) {
  if (!command || !device) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(command, "mode") && safeNumber(device.mode) !== safeNumber(command.mode)) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(command, "SG") && safeNumber(device.SG) !== safeNumber(command.SG)) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(command, "R1") && safeNumber(device.R1) !== safeNumber(command.R1)) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(command, "Hu")) {
    const target = safeNumber(command.Hu);
    if (!isHumiditySentinel(target) && safeNumber(device.humidity_threshold) !== target) {
      return false;
    }
    if (target <= 0 && safeNumber(device.R2) !== 1) {
      return false;
    }
    if (target >= 101 && safeNumber(device.R2) !== 0) {
      return false;
    }
  }
  if (Object.prototype.hasOwnProperty.call(command, "PM") && safeNumber(device.pm_threshold) !== safeNumber(command.PM)) {
    return false;
  }

  return true;
}

function pushTimeline(level, title, detail) {
  const now = new Date();
  state.timeline.unshift({
    level,
    title,
    detail,
    time: now.toLocaleTimeString("zh-CN", { hour12: false })
  });
  state.timeline = state.timeline.slice(0, 14);
  renderTimeline();
}

function renderTimeline() {
  dom.timelineList.innerHTML = "";

  if (state.timeline.length === 0) {
    const item = document.createElement("li");
    item.className = "timeline-item";
    item.innerHTML = `
      <div class="timeline-time">--</div>
      <div>
        <strong>等待事件</strong>
        <p>页面初始化后，状态同步和命令反馈会显示在这里。</p>
      </div>
    `;
    dom.timelineList.appendChild(item);
    return;
  }

  state.timeline.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "timeline-item";
    item.innerHTML = `
      <div class="timeline-time">${entry.time}</div>
      <div>
        <strong>${entry.title}</strong>
        <p>${entry.detail}</p>
      </div>
    `;
    dom.timelineList.appendChild(item);
  });
}

function updateBridgeBlock(bridge) {
  dom.deviceName.textContent = bridge.device_name || "stm32";
  dom.bridgeProvider.textContent = bridge.provider || "onenet_api";
  dom.lastSyncAt.textContent = bridge.last_message_at || "等待首帧状态";

  if (bridge.connected) {
    setBridgeStatus("connected", bridge.auth_expired ? "连接异常，鉴权过期" : "OneNET 在线");
  } else if (bridge.last_error) {
    setBridgeStatus("error", "云桥异常");
  } else {
    setBridgeStatus("pending", "正在连接云桥");
  }

  if (bridge.last_message_at) {
    dom.dataFreshness.textContent = `最近上报 ${bridge.last_message_at}`;
  } else {
    dom.dataFreshness.textContent = "等待数据";
  }

  const bridgeErrorFingerprint = `${bridge.connected}|${bridge.auth_expired}|${bridge.last_error || ""}`;
  if (bridge.last_error && bridgeErrorFingerprint !== state.bridgeErrorFingerprint) {
    pushTimeline("error", "桥接服务异常", bridge.last_error);
  }
  state.bridgeErrorFingerprint = bridgeErrorFingerprint;
}

function updateEnvironment(device) {
  const humidityThreshold = isHumiditySentinel(device.humidity_threshold)
    ? state.scheduleDraft.humidity
    : safeNumber(device.humidity_threshold);
  const dustThresholdPercent = normalizeDustThresholdToPercent(device.pm_threshold);

  dom.metricTemp.textContent = formatMetric(device.temp_c, 1);
  dom.metricHumi.textContent = formatMetric(device.humi, 0);
  dom.metricTvoc.textContent = formatMetric(device.tvoc_mg, 2);
  dom.metricPm25.textContent = formatMetric(device.pm25_mg, 2);

  dom.heroMode.textContent = modeLabel(device.mode);
  dom.heroDoor.textContent = binaryLabel(device.SG, "打开", "关闭");
  dom.heroVent.textContent = binaryLabel(device.R2, "通风中", "已停止");
  dom.heroSterilize.textContent = binaryLabel(device.R1, "运行中", "已停止");

  dom.stageTempHumi.textContent = `${formatMetric(device.temp_c, 1)}°C / ${formatMetric(device.humi, 0)}%RH`;
  dom.stageAirQuality.textContent = buildAirSummary(device);

  dom.stateMode.textContent = modeLabel(device.mode);
  dom.stateDoor.textContent = binaryLabel(device.SG, "打开", "关闭");
  dom.stateSterilize.textContent = binaryLabel(device.R1, "开启", "关闭");
  dom.stateVent.textContent = binaryLabel(device.R2, "开启", "关闭");
  dom.stateHThreshold.textContent = formatStateValue(humidityThreshold, "%RH");
  dom.statePThreshold.textContent = formatStateValue(dustThresholdPercent, "%");

  dom.healthAir.textContent = buildAirSummary(device);
  dom.healthHumi.textContent = buildHumiditySummary(device);
  dom.healthFeedback.textContent = buildFeedbackSummary();

  if (!state.settingsDirty) {
    if (humidityThreshold !== null) {
      dom.humidityInput.value = humidityThreshold;
      state.scheduleDraft.humidity = humidityThreshold;
    }
    if (dustThresholdPercent !== null) {
      dom.pmInput.value = dustThresholdPercent;
      state.scheduleDraft.dustPercent = dustThresholdPercent;
    }
    dom.startInput.value = state.scheduleDraft.start;
    dom.endInput.value = state.scheduleDraft.end;
  }
}

function buildAirSummary(device) {
  const pm = safeNumber(device.pm25_mg);
  const tvoc = safeNumber(device.tvoc_mg);
  const pmThreshold = safeNumber(device.pm_threshold);

  if (pm === null && tvoc === null) {
    return "等待数据";
  }
  if ((pmThreshold !== null && pm !== null && pm >= pmThreshold) || (tvoc !== null && tvoc >= 1.0)) {
    return "建议处理";
  }
  return "空气稳定";
}

function buildHumiditySummary(device) {
  const humi = safeNumber(device.humi);
  const threshold = safeNumber(device.humidity_threshold);
  if (humi === null) {
    return "等待数据";
  }
  if (threshold !== null && humi >= threshold) {
    return "湿度偏高";
  }
  return "湿度正常";
}

function buildFeedbackSummary() {
  if (state.pendingCommand) {
    return "等待设备确认";
  }
  if (state.command && state.command.state === "error") {
    return "命令执行异常";
  }
  if (state.bridge && state.bridge.connected) {
    return "链路稳定";
  }
  return "等待同步";
}

function renderControls(device = getEffectiveDeviceState()) {
  const currentMode = safeNumber(device.mode);
  const currentDoor = safeNumber(device.SG);
  const currentSter = safeNumber(device.R1);
  const currentVent = safeNumber(device.R2);
  const pendingCommand = state.pendingCommand ? state.pendingCommand.command : null;
  const pendingMode = pendingCommand && Object.prototype.hasOwnProperty.call(pendingCommand, "mode")
    ? safeNumber(pendingCommand.mode)
    : null;
  const pendingDoor = pendingCommand && Object.prototype.hasOwnProperty.call(pendingCommand, "SG")
    ? safeNumber(pendingCommand.SG)
    : null;
  const pendingSter = pendingCommand && Object.prototype.hasOwnProperty.call(pendingCommand, "R1")
    ? safeNumber(pendingCommand.R1)
    : null;
  const pendingVent = pendingCommand && Object.prototype.hasOwnProperty.call(pendingCommand, "Hu")
    ? (safeNumber(pendingCommand.Hu) <= 0 ? 1 : safeNumber(pendingCommand.Hu) >= 101 ? 0 : null)
    : null;

  dom.modeButtons.forEach((button) => {
    const mode = safeNumber(button.dataset.mode);
    setButtonState(button, {
      active: pendingMode === null && currentMode === mode,
      pending: pendingMode === mode
    });
  });

  setButtonState(dom.doorOpenBtn, { active: pendingDoor === null && currentDoor === 1, pending: pendingDoor === 1 });
  setButtonState(dom.doorCloseBtn, { active: pendingDoor === null && currentDoor === 0, pending: pendingDoor === 0 });
  setButtonState(dom.sterOpenBtn, { active: pendingSter === null && currentSter === 1, pending: pendingSter === 1 });
  setButtonState(dom.sterCloseBtn, { active: pendingSter === null && currentSter === 0, pending: pendingSter === 0 });
  setButtonState(dom.ventOpenBtn, { active: pendingVent === null && currentVent === 1, pending: pendingVent === 1 });
  setButtonState(dom.ventCloseBtn, { active: pendingVent === null && currentVent === 0, pending: pendingVent === 0 });

  if (state.pendingCommand) {
    setPendingText(`待确认命令：${state.pendingCommand.label}`, "pending");
  } else {
    setPendingText("当前无待确认命令", "neutral");
  }
}

function updateCommandSummary(command) {
  dom.commandState.textContent = command.state || "idle";
  dom.commandUpdatedAt.textContent = command.updated_at || "--";

  const fingerprint = `${command.state || ""}|${command.updated_at || ""}|${command.message || ""}`;
  if (!command.updated_at || fingerprint === state.commandFingerprint) {
    return;
  }

  if (command.state === "sending") {
    pushTimeline("info", "命令已进入桥接队列", command.message || "命令正在发送");
  } else if (command.state === "ok") {
    pushTimeline("success", "设备已响应命令", command.message || "设备返回成功");
  } else if (command.state === "error") {
    pushTimeline("error", "设备命令失败", command.message || "设备返回错误");
  }

  state.commandFingerprint = fingerprint;
}

function maybeResolvePending(device, command) {
  if (!state.pendingCommand) {
    return;
  }

  if (commandMatchesDevice(state.pendingCommand.command, device)) {
    clearShadowPatch();
    pushTimeline("success", "设备状态已更新", `${state.pendingCommand.label} 已在最新上报中确认。`);
    state.pendingCommand = null;
    renderControls();
    return;
  }

  if (command.state === "error") {
    clearShadowPatch();
    pushTimeline("warn", "待确认命令结束", `${state.pendingCommand.label} 未成功执行，请检查设备和网络。`);
    state.pendingCommand = null;
    renderControls();
    return;
  }

  if (command.state === "ok" && commandsEqual(command.command, state.pendingCommand.command)) {
    applyShadowPatch(state.pendingCommand.command);
    pushTimeline("success", "设备已回执命令", `${state.pendingCommand.label} 已收到设备回执，界面先按已执行显示，等待设备状态上报同步。`);
    state.pendingCommand = null;
    renderControls();
  }
}

function renderLookup() {
  dom.lookupGrid.innerHTML = "";
  const query = state.lookupQuery.trim().toLowerCase();
  const items = LOOKUP_ITEMS.filter((item) => {
    if (!query) return true;
    return [item.name, item.zone, item.season, item.tag, item.material, item.scene, item.note].some((field) =>
      field.toLowerCase().includes(query)
    );
  }).map((item) => {
    const reasons = [];
    const humi = safeNumber(state.device.humi);
    const tvoc = safeNumber(state.device.tvoc_mg);

    if (query && [item.scene, item.tag, item.material].some((field) => field.toLowerCase().includes(query))) {
      reasons.push("匹配你的搜索场景");
    }
    if ((item.material === "真丝" || item.material === "羊毛") && humi !== null && humi >= 60) {
      reasons.push("当前湿度偏高，建议优先检查精细衣物");
    }
    if (item.tag === "答辩通勤" || item.tag === "正装") {
      reasons.push("适合作为正式场合快速取衣");
    }
    if (tvoc !== null && tvoc >= 0.1 && (item.material === "真丝" || item.material === "棉质")) {
      reasons.push("建议保持通风后再长期密闭存放");
    }

    return {
      ...item,
      reasons: reasons.slice(0, 2)
    };
  });

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "lookup-empty";
    empty.textContent = "没有匹配结果，可以继续扩展为 RFID / 分类 / 历史穿搭检索。";
    dom.lookupGrid.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "lookup-card";
    card.innerHTML = `
      <h4>${item.name}</h4>
      <div class="lookup-meta">
        <span>${item.zone}</span>
        <span>${item.season}</span>
        <span>${item.tag}</span>
        <span>${item.material}</span>
      </div>
      <p>${item.scene} · ${item.note}</p>
      ${item.reasons.length ? `<p>${item.reasons.join("；")}</p>` : ""}
    `;
    dom.lookupGrid.appendChild(card);
  });
}

async function fetchStatus() {
  const response = await fetch("/api/status", {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`状态接口返回 ${response.status}`);
  }

  return response.json();
}

async function refreshStatus({ silent = false } = {}) {
  if (state.isPolling) {
    return;
  }
  state.isPolling = true;

  try {
    const payload = await fetchStatus();
    state.bridge = payload.bridge || {};
    state.device = payload.state || {};
    state.command = payload.command || {};

    updateBridgeBlock(state.bridge);
    updateCommandSummary(state.command);
    maybeResolvePending(state.device, state.command);
    const deviceView = getEffectiveDeviceState();
    updateEnvironment(deviceView);
    renderControls(deviceView);
  } catch (error) {
    setBridgeStatus("error", "状态读取失败");
    dom.dataFreshness.textContent = "状态读取失败";
    if (!silent) {
      pushTimeline("error", "状态同步失败", error.message);
    }
  } finally {
    state.isPolling = false;
  }
}

function schedulePolling() {
  window.clearInterval(state.pollTimer);
  state.pollTimer = window.setInterval(() => {
    refreshStatus({ silent: true });
  }, POLL_INTERVAL_MS);
}

async function sendCommand(command, label) {
  const response = await fetch("/api/command", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ command })
  });

  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `命令接口返回 ${response.status}`);
  }

  return payload;
}

async function queueCommand(command, label) {
  try {
    clearShadowPatch();
    state.pendingCommand = {
      command,
      label,
      startedAt: Date.now()
    };
    renderControls();
    pushTimeline("info", "命令已下发", `${label}，等待设备下一次状态上报。`);
    await sendCommand(command, label);
    await refreshStatus({ silent: true });
  } catch (error) {
    pushTimeline("error", "命令发送失败", error.message);
    state.pendingCommand = null;
    renderControls();
  }
}

function validateSettings() {
  const humidity = safeNumber(dom.humidityInput.value);
  const dustPercent = safeNumber(dom.pmInput.value);
  const start = dom.startInput.value;
  const end = dom.endInput.value;

  if (humidity === null || humidity < 0 || humidity > 100) {
    throw new Error("湿度阈值需要在 0 到 100 之间。");
  }
  if (dustPercent === null || dustPercent < 0 || dustPercent > 100) {
    throw new Error("粉尘阈值需要填写为 0 到 100 之间的百分比。");
  }
  if (!start || !end) {
    throw new Error("请填写定时开始和结束时间。");
  }

  const pm = dustPercentToDeviceValue(dustPercent);
  state.settingsDirty = false;
  state.scheduleDraft.start = start;
  state.scheduleDraft.end = end;
  state.scheduleDraft.humidity = humidity;
  state.scheduleDraft.dustPercent = dustPercent;
  saveScheduleDraft();

  return {
    Hu: humidity,
    PM: pm,
    ST: start,
    ET: end
  };
}

function bindEvents() {
  dom.modeButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const mode = safeNumber(button.dataset.mode);
      await queueCommand({ mode }, `切换到${modeLabel(mode)}模式`);
    });
  });

  dom.doorOpenBtn.addEventListener("click", async () => queueCommand({ SG: 1 }, "打开柜门"));
  dom.doorCloseBtn.addEventListener("click", async () => queueCommand({ SG: 0 }, "关闭柜门"));

  dom.sterOpenBtn.addEventListener("click", async () => {
    const label = safeNumber(state.device.mode) === 0 ? "开启消毒" : "切换到手动模式并开启消毒";
    await queueCommand({ mode: 0, R1: 1 }, label);
  });

  dom.sterCloseBtn.addEventListener("click", async () => {
    const label = safeNumber(state.device.mode) === 0 ? "关闭消毒" : "切换到手动模式并关闭消毒";
    await queueCommand({ mode: 0, R1: 0 }, label);
  });

  dom.ventOpenBtn.addEventListener("click", async () => queueCommand({ Hu: VENT_ON_THRESHOLD }, "开启通风"));
  dom.ventCloseBtn.addEventListener("click", async () => queueCommand({ Hu: VENT_OFF_THRESHOLD }, "关闭通风"));

  dom.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const command = validateSettings();
      dom.settingsBtn.classList.add("pending");
      await queueCommand(command, "更新阈值与定时设置");
    } catch (error) {
      pushTimeline("warn", "设置未发送", error.message);
    } finally {
      dom.settingsBtn.classList.remove("pending");
    }
  });

  dom.lookupInput.addEventListener("input", (event) => {
    state.lookupQuery = event.target.value || "";
    renderLookup();
  });

  dom.humidityInput.addEventListener("input", (event) => {
    state.settingsDirty = true;
    state.scheduleDraft.humidity = safeNumber(event.target.value) ?? state.scheduleDraft.humidity;
  });

  dom.pmInput.addEventListener("input", (event) => {
    state.settingsDirty = true;
    state.scheduleDraft.dustPercent = safeNumber(event.target.value) ?? state.scheduleDraft.dustPercent;
  });

  dom.startInput.addEventListener("input", (event) => {
    state.settingsDirty = true;
    state.scheduleDraft.start = event.target.value || state.scheduleDraft.start;
  });

  dom.endInput.addEventListener("input", (event) => {
    state.settingsDirty = true;
    state.scheduleDraft.end = event.target.value || state.scheduleDraft.end;
  });

  dom.startInput.addEventListener("change", (event) => {
    state.scheduleDraft.start = event.target.value || state.scheduleDraft.start;
    saveScheduleDraft();
  });

  dom.humidityInput.addEventListener("change", (event) => {
    state.settingsDirty = false;
    state.scheduleDraft.humidity = safeNumber(event.target.value) ?? state.scheduleDraft.humidity;
    saveScheduleDraft();
  });

  dom.pmInput.addEventListener("change", (event) => {
    state.settingsDirty = false;
    state.scheduleDraft.dustPercent = safeNumber(event.target.value) ?? state.scheduleDraft.dustPercent;
    saveScheduleDraft();
  });

  dom.endInput.addEventListener("change", (event) => {
    state.settingsDirty = false;
    state.scheduleDraft.end = event.target.value || state.scheduleDraft.end;
    saveScheduleDraft();
  });
}

async function init() {
  initDom();
  loadScheduleDraft();
  applyDraftInputs();
  renderTimeline();
  renderLookup();
  bindEvents();
  pushTimeline("info", "页面已启动", "正在通过 Flask 云桥读取设备状态。");
  await refreshStatus();
  schedulePolling();
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((error) => {
    pushTimeline("error", "页面初始化失败", error.message);
    setBridgeStatus("error", "初始化失败");
  });
});
