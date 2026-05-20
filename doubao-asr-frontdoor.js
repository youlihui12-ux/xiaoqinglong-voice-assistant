const http = require("http");
const tls = require("tls");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile, spawn } = require("child_process");
const os = require("os");

const rootDir = __dirname;
const envPath = path.join(rootDir, ".env");
const legacyEnvPath = path.join(rootDir, "doubao-asr-frontdoor.env");
const brainConfigPath = path.join(rootDir, "xiaoqinglong-default-brain.json");
const taskQueuePath = path.join(rootDir, "xiaoqinglong-ai-tasks.json");
const approvalsPath = path.join(rootDir, "xiaoqinglong-approvals.json");
const lobeWorkerPath = path.join(rootDir, "lobe-dispatch-worker.js");
const logDir = path.join(rootDir, "logs");
const logPath = path.join(logDir, "doubao-asr-frontdoor.log");
const bridgeLogPath = path.join(logDir, "launchd.out.log");
const bridgeErrPath = path.join(logDir, "launchd.err.log");
const watchdogLogPath = path.join(logDir, "lobehub-connect-watchdog.out.log");

function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq !== -1) out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}
function readEnvFile(file) {
  return fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {};
}
function loadEnv() {
  return { ...readEnvFile(legacyEnvPath), ...readEnvFile(envPath), ...process.env };
}

const bootEnv = loadEnv();
const lobeCliPath = bootEnv.LOBE_CLI_PATH || path.join(os.homedir(), "Library/Application Support/LobeHub/bin/lobe");
const defaultLobeAgentId = bootEnv.LOBE_AGENT_ID || "your-lobe-agent-id";
const defaultLobeAgentName = bootEnv.LOBE_AGENT_NAME || "Hermes · 小青龙";
const launchUser = bootEnv.XIAOQINGLONG_LAUNCH_USER || "gui/" + (typeof process.getuid === "function" ? process.getuid() : 501);
const launchLabels = {
  bridge: bootEnv.XIAOQINGLONG_BRIDGE_LABEL || launchUser + "/com.xiaoqinglong.desktop-bridge",
  watchdog: bootEnv.XIAOQINGLONG_WATCHDOG_LABEL || launchUser + "/com.xiaoqinglong.lobehub-connect-watchdog",
  frontdoor: bootEnv.XIAOQINGLONG_FRONTDOOR_LABEL || launchUser + "/com.xiaoqinglong.doubao-asr-frontdoor",
  panel: bootEnv.XIAOQINGLONG_PANEL_LABEL || launchUser + "/com.xiaoqinglong.control-panel",
};

function escapeRegex(value) {
  return String(value || "")
    .split("")
    .map((char) => "\\^$.*+?()[]{}|/".includes(char) ? "\\" + char : char)
    .join("");
}

function appendLog(message) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, new Date().toISOString() + " " + message + "\n", "utf8");
}
function mask(value) { return !value ? "" : value.length <= 8 ? "****" : value.slice(0, 4) + "..." + value.slice(-4); }
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
function writeJson(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8"); }
function tailFile(file, maxLines = 80) { try { return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).slice(-maxLines); } catch { return []; } }
function sanitizeMissionLogLine(line) {
  return String(line || "")
    .replace(/wss:\/\/api\.xiaozhi\.me\/mcp\/\?token=[A-Za-z0-9._~-]+/gi, "wss://api.xiaozhi.me/mcp/?token=<redacted>")
    .replace(/([?&]token=)[A-Za-z0-9._~-]+/gi, "$1<redacted>")
    .replace(/("token"\s*:\s*")[^"]+(")/gi, "$1<redacted>$2");
}
function sanitizeMissionLogLines(lines) { return lines.map(sanitizeMissionLogLine); }
const MISSION_TASK_TEXT_LIMIT = 900;
function compactMissionText(value, limit = MISSION_TASK_TEXT_LIMIT) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "...（已截断，原长 " + text.length + " 字）";
}
function summarizeMissionTask(task) {
  const originalResult = String(task.result || "");
  const originalError = String(task.error || "");
  const compactTask = {
    ...task,
    result: compactMissionText(originalResult, 700),
    error: compactMissionText(originalError, 700),
    resultChars: originalResult.length,
    errorChars: originalError.length,
  };
  return { ...compactTask, trace: buildTrace(compactTask), highRisk: isHighRisk(task) };
}
function defaultBrainConfig(env) {
  return {
    identity: "小青龙 / Lobe 默认大脑",
    updatedAt: new Date().toISOString(),
    voiceFrontdoor: { provider: "volcengine-doubao-asr", endpoint: env.DOUBAO_ASR_ENDPOINT || "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel", resourceId: env.DOUBAO_ASR_RESOURCE_ID || "volc.seedasr.sauc.duration", keyConfigured: Boolean(env.DOUBAO_ASR_API_KEY) },
    lobeBrain: { provider: "LobeHub CLI", agentName: defaultLobeAgentName, agentId: defaultLobeAgentId, cliPath: lobeCliPath },
    xiaozhiBridge: { mcpServer: "xiaozhi-desktop-bridge", tools: ["desktop_execute_task", "jarvis_agent_command", "xiaoqinglong_lobe_dispatch", "lobe_ai_agent", "xiaoqinglong_show_ai_tasks", "xiaoqinglong_update_ai_task"] },
  };
}
function ensureBrainConfig() {
  const env = loadEnv();
  const current = readJson(brainConfigPath, {});
  const defaults = defaultBrainConfig(env);
  const next = { ...defaults, ...current, updatedAt: new Date().toISOString() };
  next.voiceFrontdoor = { ...defaults.voiceFrontdoor, ...(current.voiceFrontdoor || {}) };
  next.lobeBrain = { ...defaults.lobeBrain, ...(current.lobeBrain || {}) };
  next.xiaozhiBridge = { ...defaults.xiaozhiBridge, ...(current.xiaozhiBridge || {}) };
  writeJson(brainConfigPath, next);
  return next;
}
function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "http://127.0.0.1:43174", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,x-api-token" });
  res.end(JSON.stringify(body, null, 2));
}
function authorizeAction(req, env) {
  const expected = String(env.XIAOQINGLONG_API_TOKEN || "").trim();
  if (!expected && env.XIAOQINGLONG_ALLOW_UNAUTH_LOCAL === "1") return { ok: true };
  if (!expected) return { ok: false, status: 503, error: "Set XIAOQINGLONG_API_TOKEN in .env before using POST /api/action." };
  const received = String(req.headers["x-api-token"] || "").trim();
  if (received !== expected) return { ok: false, status: 401, error: "Invalid X-API-Token." };
  return { ok: true };
}
function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); } });
  });
}
function execRaw(command, args, timeout = 8000) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout }, (error, stdout, stderr) => resolve({ ok: !error, stdout: stdout.trim(), stderr: stderr.trim(), error: error?.message || "" }));
  });
}
function wsProbe(env) {
  return new Promise((resolve) => {
    const endpoint = env.DOUBAO_ASR_ENDPOINT || "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel";
    const resourceId = env.DOUBAO_ASR_RESOURCE_ID || "volc.seedasr.sauc.duration";
    const apiKey = env.DOUBAO_ASR_API_KEY || "";
    if (!apiKey) return resolve({ ok: false, latencyMs: null, error: "missing DOUBAO_ASR_API_KEY" });
    const startedAt = Date.now();
    const url = new URL(endpoint);
    const connectId = crypto.randomUUID();
    const wsKey = crypto.randomBytes(16).toString("base64");
    const socket = tls.connect({ host: url.hostname, port: url.port ? Number(url.port) : 443, servername: url.hostname, timeout: 8000 });
    let response = "";
    const done = (result) => { try { socket.destroy(); } catch {} resolve({ latencyMs: Date.now() - startedAt, ...result }); };
    socket.once("secureConnect", () => {
      socket.write(["GET " + url.pathname + url.search + " HTTP/1.1", "Host: " + url.hostname, "Upgrade: websocket", "Connection: Upgrade", "Sec-WebSocket-Key: " + wsKey, "Sec-WebSocket-Version: 13", "X-Api-Key: " + apiKey, "X-Api-Access-Key: " + apiKey, "X-Api-Resource-Id: " + resourceId, "X-Api-Connect-Id: " + connectId, "", ""].join("\r\n"));
    });
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (!response.includes("\r\n\r\n")) return;
      const header = response.split("\r\n\r\n")[0];
      const statusLine = header.split("\r\n")[0] || "";
      const ok = /^HTTP\/1\.[01]\s+101\b/.test(statusLine);
      const ttLogId = (header.match(/^X-Tt-Logid:\s*(.+)$/im) || [])[1] || "";
      done({ ok, statusLine, connectId, resourceId, ttLogId });
    });
    socket.on("timeout", () => done({ ok: false, error: "timeout" }));
    socket.on("error", (error) => done({ ok: false, error: error.message }));
  });
}
async function lobeStatus() {
  const result = await execRaw(lobeCliPath, ["status", "--timeout", "5000"], 8000);
  const text = [result.stdout, result.stderr, result.error].filter(Boolean).join("\n");
  const activeHints = [defaultLobeAgentName, defaultLobeAgentId, "Hermes", "小青龙"].filter(Boolean).map(escapeRegex).join("|");
  return {
    ...result,
    connected: /Connection\s*:\s*connected/i.test(text) || /\bCONNECTED\b/i.test(text),
    activeAgent: activeHints ? new RegExp(activeHints, "i").test(text) : false,
    detail: text.split(/\r?\n/).slice(0, 20).join("\n"),
  };
}
async function launchStatus(key) {
  const label = launchLabels[key];
  const result = await execRaw("launchctl", ["print", label], 8000);
  const text = result.stdout + "\n" + result.stderr;
  return { ok: result.ok && /state = running/.test(text), label, pid: (text.match(/pid = (\d+)/) || [])[1] || "", runs: (text.match(/runs = (\d+)/) || [])[1] || "", raw: text.split(/\r?\n/).slice(0, 14).join("\n") };
}
function taskCounts(tasks) {
  return tasks.reduce((acc, task) => { const status = String(task.status || "unknown").toLowerCase(); acc[status] = (acc[status] || 0) + 1; return acc; }, { assigned: 0, running: 0, done: 0, blocked: 0 });
}
function isHighRisk(task) {
  const text = [task.title, task.notes, task.context].filter(Boolean).join("\n");
  return /rm\s+-rf|删除|抹掉|付款|支付|发送|授权|sudo|系统设置|刷机|固件|OTA|清空/.test(text);
}
function safeJsonString(value) {
  try { return JSON.parse("\"" + value + "\""); } catch { return value; }
}
function extractToolCalls(lines) {
  return lines.filter((line) => line.includes('"method":"tools/call"')).slice(-20).map((line) => {
    const idMatch = line.match(/"id"\s*:\s*([^,}]+)/);
    const nameMatch = line.match(/"name"\s*:\s*"((?:\\.|[^"\\])*)"/);
    const taskMatch = line.match(/"task"\s*:\s*"((?:\\.|[^"\\])*)"/);
    return {
      time: line.slice(0, 24).replace(/^.*\[/, ""),
      id: idMatch ? idMatch[1] : "",
      name: nameMatch ? safeJsonString(nameMatch[1]) : "tools/call",
      task: taskMatch ? safeJsonString(taskMatch[1]) : "",
    };
  });
}
function buildTrace(task) {
  const created = task.createdAt || "";
  const updated = task.updatedAt || "";
  return [
    { name: "收音与转写", state: "done", detail: task.source || "xiaozhi-voice", elapsed: "0.0s - 0.5s" },
    { name: "MCP 智能入口", state: "done", detail: task.workerName || "小青龙", elapsed: "0.5s - 0.8s" },
    { name: "Lobe 思考与工具决策", state: task.status === "assigned" ? "waiting" : task.status === "blocked" ? "blocked" : "done", detail: task.operationId || "等待 operationId", elapsed: "0.8s - ?" },
    { name: "Local Device 执行", state: task.status === "done" ? "done" : task.status === "blocked" ? "blocked" : "running", detail: compactMissionText(task.error || task.result || "处理中", 420), elapsed: updated && created ? created + " → " + updated : "等待更新" },
  ];
}
async function missionControl() {
  const env = loadEnv();
  const config = ensureBrainConfig();
  const tasks = readJson(taskQueuePath, []);
  const approvals = readJson(approvalsPath, []);
  const [bridge, frontdoor, panel, watchdog, lobe, probe] = await Promise.all([launchStatus("bridge"), launchStatus("frontdoor"), launchStatus("panel"), launchStatus("watchdog"), lobeStatus(), wsProbe(env)]);
  const bridgeLogs = sanitizeMissionLogLines(tailFile(bridgeLogPath, 160));
  const watchdogLogs = sanitizeMissionLogLines(tailFile(watchdogLogPath, 80));
  const counts = taskCounts(tasks);
  const today = new Date().toLocaleDateString("zh-CN");
  const todayHighRisk = tasks.filter((task) => String(task.createdAt || "").includes(today) && isHighRisk(task)).length + approvals.length;
  const lastSelfHeal = watchdogLogs.slice().reverse().find((line) => /kickstart|restart|disconnected|connected|Connection/i.test(line)) || "暂无自愈记录";
  const watchdogRecentText = watchdogLogs.slice(-40).join("\n");
  const watchdogHealthy = Boolean(watchdog.ok || (lobe.connected && /Connection\s*:\s*connected|\bCONNECTED\b/i.test(watchdogRecentText)));
  const watchdogService = {
    ...watchdog,
    ok: watchdogHealthy,
    periodic: !watchdog.ok && watchdogHealthy,
    state: watchdog.ok ? "running" : watchdogHealthy ? "checked" : "not_running",
    detail: watchdog.ok ? "巡检脚本运行中" : watchdogHealthy ? "定时巡检正常，Lobe 保持 connected" : "巡检未运行且未发现近期 connected 记录",
  };
  return {
    ok: bridge.ok && frontdoor.ok && panel.ok,
    updatedAt: new Date().toISOString(),
    config: { identity: config.identity, agentName: config.lobeBrain?.agentName || "Hermes · 小青龙", agentId: config.lobeBrain?.agentId || defaultLobeAgentId, asrEndpoint: config.voiceFrontdoor?.endpoint || env.DOUBAO_ASR_ENDPOINT || "" },
    liveStatus: [
      { key: "voice", label: "小智语音端", ok: bridge.ok, value: bridge.ok ? "在线" : "断开", detail: bridge.pid ? "PID " + bridge.pid : bridge.label },
      { key: "asr", label: "豆包转写服务", ok: probe.ok, value: probe.ok ? "正常" : "异常", detail: probe.latencyMs ? probe.latencyMs + "ms" : (probe.error || probe.statusLine || "未验证") },
      { key: "lobe", label: "Lobe 默认大脑", ok: lobe.ok && lobe.connected, value: lobe.connected ? "活跃" : "未连接", detail: config.lobeBrain?.agentName || "Hermes" },
      { key: "mcp", label: "MCP 调度入口", ok: bridge.ok, value: bridge.ok ? "连接正常" : "连接异常", detail: bridge.runs ? "runs " + bridge.runs : "launchd" },
      { key: "device", label: "Local Device", ok: lobe.connected, value: lobe.connected ? "运行中" : "断开告警", detail: lobe.connected ? "connected" : (lobe.error || "local device offline") },
    ],
    queue: { assigned: counts.assigned || 0, running: counts.running || 0, done: counts.done || 0, blocked: counts.blocked || 0, todayHighRisk, total: tasks.length },
    watchdog: { ok: watchdogHealthy, pid: watchdog.pid, lastSelfHeal, log: watchdogLogs.slice(-8), periodic: watchdogService.periodic, state: watchdogService.state, detail: watchdogService.detail },
    services: { bridge, frontdoor, panel, watchdog: watchdogService, lobe, probe },
    tasks: tasks.slice(-30).reverse().map(summarizeMissionTask),
    approvals: approvals.slice(-20).reverse(),
    mcp: { toolCalls: extractToolCalls(bridgeLogs), raw: bridgeLogs.slice(-80), errors: sanitizeMissionLogLines(tailFile(bridgeErrPath, 50)) },
  };
}
function nextAiTaskId(tasks) {
  const maxId = tasks.reduce((max, task) => { const match = String(task.id || "").match(/^AI-(\d+)$/i); return match ? Math.max(max, Number(match[1])) : max; }, 0);
  return "AI-" + String(maxId + 1).padStart(3, "0");
}
function createDispatchTask(text, source = "control-panel") {
  const tasks = readJson(taskQueuePath, []);
  const now = new Date().toLocaleString("zh-CN");
  const task = { id: nextAiTaskId(tasks), worker: "lobe", workerName: "Lobe AI", title: String(text || "").trim(), notes: "Mission Control 注入测试", source, context: "由小青龙 Mission Control 控制台注入，用于排障验证链路。", priority: "normal", status: "assigned", createdAt: now, updatedAt: now, operationId: "", result: "", error: "" };
  tasks.push(task);
  writeJson(taskQueuePath, tasks);
  const child = spawn(process.execPath, [lobeWorkerPath, task.id], { detached: true, stdio: "ignore", env: { ...loadEnv(), NO_COLOR: "1", FORCE_COLOR: "0" } });
  child.unref();
  appendLog("dispatch " + task.id + " " + task.title);
  return task;
}
async function action(name, payload = {}) {
  appendLog("action " + name);
  if (name === "restart-watchdog") return execRaw("launchctl", ["kickstart", "-k", launchLabels.watchdog], 10000);
  if (name === "restart-bridge") return execRaw("launchctl", ["kickstart", "-k", launchLabels.bridge], 10000);
  if (name === "restart-frontdoor") { setTimeout(() => execFile("launchctl", ["kickstart", "-k", launchLabels.frontdoor], () => {}), 50); return { ok: true, stdout: "frontdoor restart requested" }; }
  if (name === "clear-active-queue") {
    const tasks = readJson(taskQueuePath, []);
    const now = new Date().toLocaleString("zh-CN");
    const next = tasks.map((task) => ["assigned", "running"].includes(String(task.status || "").toLowerCase()) ? { ...task, status: "blocked", updatedAt: now, error: "已由 Mission Control 清空当前活动队列" } : task);
    writeJson(taskQueuePath + ".bak-" + Date.now(), tasks);
    writeJson(taskQueuePath, next);
    return { ok: true, stdout: "active queue marked blocked" };
  }
  if (name === "abort-current-task") {
    const tasks = readJson(taskQueuePath, []);
    const now = new Date().toLocaleString("zh-CN");
    let target = -1;
    for (let i = tasks.length - 1; i >= 0; i -= 1) { if (["running", "assigned"].includes(String(tasks[i].status || "").toLowerCase())) { target = i; break; } }
    if (target < 0) return { ok: false, error: "no running or assigned task" };
    tasks[target] = { ...tasks[target], status: "blocked", updatedAt: now, error: "已由 Mission Control 强制中止" };
    writeJson(taskQueuePath, tasks);
    return { ok: true, stdout: tasks[target].id + " aborted" };
  }
  if (name === "dispatch-test") { if (!payload.text || !String(payload.text).trim()) return { ok: false, error: "empty test text" }; return { ok: true, task: createDispatchTask(payload.text, "control-panel") }; }
  if (name === "approve-risk" || name === "reject-risk") { const approvals = readJson(approvalsPath, []); const next = approvals.map((item) => item.id === payload.id ? { ...item, status: name === "approve-risk" ? "approved" : "rejected", decidedAt: new Date().toISOString() } : item); writeJson(approvalsPath, next); return { ok: true, stdout: payload.id + " " + name }; }
  return { ok: false, error: "unknown action" };
}
const server = http.createServer(async (req, res) => {
  const env = loadEnv();
  const config = ensureBrainConfig();
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });
  const url = new URL(req.url, "http://127.0.0.1");
  try {
    if (url.pathname === "/health") return sendJson(res, 200, { ok: true, service: "xiaoqinglong-doubao-asr-frontdoor", endpoint: env.DOUBAO_ASR_ENDPOINT, resourceId: env.DOUBAO_ASR_RESOURCE_ID, apiKey: mask(env.DOUBAO_ASR_API_KEY), lobeAgent: config.lobeBrain, updatedAt: new Date().toISOString() });
    if (url.pathname === "/probe") { const result = await wsProbe(env); appendLog("probe " + JSON.stringify({ ...result, apiKey: mask(env.DOUBAO_ASR_API_KEY) })); return sendJson(res, result.ok ? 200 : 502, result); }
    if (url.pathname === "/lobe-status") { const result = await lobeStatus(); appendLog("lobe-status " + JSON.stringify({ ok: result.ok, connected: result.connected })); return sendJson(res, result.ok ? 200 : 502, result); }
    if (url.pathname === "/config") return sendJson(res, 200, { ...config, voiceFrontdoor: { ...config.voiceFrontdoor, apiKey: mask(env.DOUBAO_ASR_API_KEY) } });
    if (url.pathname === "/api/mission-control") return sendJson(res, 200, await missionControl());
    if (url.pathname === "/api/action" && req.method === "POST") {
      const auth = authorizeAction(req, env);
      if (!auth.ok) return sendJson(res, auth.status, { ok: false, error: auth.error });
      const body = await readBody(req);
      const result = await action(body.action, body);
      return sendJson(res, result.ok ? 200 : 400, result);
    }
  } catch (error) { appendLog("error " + (error.stack || error.message)); return sendJson(res, 500, { ok: false, error: error.message || String(error) }); }
  sendJson(res, 404, { ok: false, error: "not found", routes: ["/health", "/probe", "/lobe-status", "/config", "/api/mission-control", "/api/action"] });
});
const port = Number(bootEnv.XIAOQINGLONG_FRONTDOOR_PORT || 43173);
server.listen(port, "127.0.0.1", () => { ensureBrainConfig(); appendLog("listening http://127.0.0.1:" + port); });
