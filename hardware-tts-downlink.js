const fs = require("fs/promises");
const http = require("http");
const https = require("https");
const path = require("path");

const {
  buildSpokenCompletionReport,
  compactText,
} = require("./task-completion-reporter");

const OUTBOX_FILE = "xiaoqinglong-hardware-tts-outbox.json";
const DEFAULT_TIMEOUT_MS = 8000;
const TEXT_LIMIT = 360;

function isTruthy(value) {
  return /^(1|true|yes|on|enabled)$/i.test(String(value || "").trim());
}

function parseChannels(value) {
  return new Set(
    String(value || "")
      .split(/[,\s]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function channelEnabled(env, flagKey, channelName) {
  const channels = parseChannels(env.XIAOQINGLONG_COMPLETION_REPORT_CHANNELS);
  return channels.has("all") || channels.has(channelName) || isTruthy(env[flagKey]);
}

function getOutboxPath(rootDir = __dirname) {
  return path.join(rootDir, OUTBOX_FILE);
}

function safeEndpointStatus(endpoint) {
  if (!endpoint) return { ok: false, reason: "missing_endpoint" };
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    return { ok: false, reason: "invalid_endpoint" };
  }
  const protocolOk = parsed.protocol === "http:" || parsed.protocol === "https:";
  const host = String(parsed.hostname || "").replace(/^\[|\]$/g, "").toLowerCase();
  const loopback = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (!protocolOk) return { ok: false, reason: "unsupported_protocol" };
  if (!loopback) return { ok: false, reason: "non_loopback_endpoint" };
  return { ok: true, reason: "loopback_endpoint", url: parsed };
}

function resolveHardwareTtsDownlink(env = process.env) {
  const endpoint = String(env.XIAOQINGLONG_HARDWARE_TTS_ENDPOINT || env.XIAOZHI_HARDWARE_TTS_ENDPOINT || "").trim();
  const enabled = channelEnabled(env, "XIAOQINGLONG_HARDWARE_TTS", "xiaozhi_hardware_tts");
  const endpointSafety = safeEndpointStatus(endpoint);
  const tokenConfigured = Boolean(String(env.XIAOQINGLONG_HARDWARE_TTS_TOKEN || "").trim());
  let status = "disabled";
  let mode = "disabled";
  let detail = "未启用小智硬件 TTS 下行通道。";
  if (enabled && endpointSafety.ok) {
    status = "ready";
    mode = "webhook";
    detail = "已配置本地硬件 TTS 网关，完成汇报会投递到该网关。";
  } else if (enabled && endpoint) {
    status = "unsafe_endpoint";
    mode = "blocked";
    detail = "硬件 TTS 端点不是本机回环地址，已按安全边界阻止。";
  } else if (enabled) {
    status = "waiting_for_gateway";
    mode = "outbox";
    detail = "硬件 TTS 已启用，但未配置本地设备网关；完成汇报会进入待播队列。";
  }
  return {
    enabled,
    status,
    mode,
    endpoint,
    safeEndpoint: endpointSafety.ok,
    safetyReason: endpointSafety.reason,
    tokenConfigured,
    detail,
  };
}

async function readHardwareTtsOutbox(rootDir = __dirname) {
  try {
    const parsed = JSON.parse(await fs.readFile(getOutboxPath(rootDir), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeHardwareTtsOutbox(items, rootDir = __dirname) {
  await fs.writeFile(getOutboxPath(rootDir), JSON.stringify(items, null, 2), "utf8");
}

function createHardwareTtsPayload(task, options = {}) {
  const text = compactText(options.message || buildSpokenCompletionReport(task), TEXT_LIMIT);
  return {
    type: "completion_report",
    version: 1,
    taskId: String(task?.id || "unknown"),
    taskStatus: String(task?.status || "unknown"),
    title: compactText(task?.title || task?.text || task?.prompt || "未命名任务", 180),
    result: compactText(task?.result || task?.error || "任务已结束，但没有返回可朗读结果。", 260),
    operationId: compactText(task?.operationId || "", 120),
    text,
    voice: options.voice || "xiaozhi",
    createdAt: new Date().toISOString(),
    route: "xiaoqinglong.hardware_tts.downlink",
    source: options.source || "lobe-dispatch-worker",
  };
}

async function appendHardwareTtsOutbox(entry, rootDir = __dirname) {
  const items = await readHardwareTtsOutbox(rootDir);
  const next = {
    id: entry.id || "HTTS-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    createdAt: entry.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: entry.status || "queued",
    attempts: Number(entry.attempts || 0),
    ...entry,
  };
  items.push(next);
  await writeHardwareTtsOutbox(items.slice(-200), rootDir);
  return next;
}

function postJson(endpoint, payload, options = {}) {
  if (options.request) return options.request(endpoint, payload, options);
  return new Promise((resolve) => {
    const parsed = new URL(endpoint);
    const body = JSON.stringify(payload);
    const client = parsed.protocol === "https:" ? https : http;
    const req = client.request(
      {
        method: "POST",
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        timeout: options.timeoutMs || DEFAULT_TIMEOUT_MS,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-length": Buffer.byteLength(body),
          ...(options.token ? { "x-api-token": options.token } : {}),
        },
      },
      (res) => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { responseBody += chunk; });
        res.on("end", () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            body: compactText(responseBody, 700),
          });
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (error) => {
      resolve({ ok: false, statusCode: 0, body: "", error: error.message || String(error) });
    });
    req.end(body);
  });
}

async function sendHardwareTtsDownlink(task, options = {}) {
  const env = options.env || process.env;
  const rootDir = options.rootDir || __dirname;
  const config = resolveHardwareTtsDownlink(env);
  const payload = createHardwareTtsPayload(task, options);
  const base = {
    channel: "xiaozhi-hardware-tts",
    attemptedAt: new Date().toISOString(),
    message: payload.text,
    mode: config.mode,
    status: "skipped",
  };

  if (!config.enabled) {
    return { ...base, error: config.detail };
  }

  if (!config.endpoint) {
    const queued = await appendHardwareTtsOutbox({ status: "queued", reason: config.status, payload }, rootDir);
    return {
      ...base,
      status: "queued",
      outboxId: queued.id,
      detail: "已进入硬件 TTS 待播队列，等待本地设备下行网关接入。",
    };
  }

  if (!config.safeEndpoint) {
    const blocked = await appendHardwareTtsOutbox({ status: "blocked", reason: config.safetyReason, payload }, rootDir);
    return {
      ...base,
      status: "failed",
      outboxId: blocked.id,
      error: "硬件 TTS 端点不是本机回环地址：" + config.safetyReason,
    };
  }

  const response = await postJson(config.endpoint, payload, {
    request: options.request,
    timeoutMs: options.timeoutMs,
    token: env.XIAOQINGLONG_HARDWARE_TTS_TOKEN,
  });
  const entry = await appendHardwareTtsOutbox({
    status: response.ok ? "sent" : "failed",
    attempts: 1,
    endpoint: config.endpoint,
    payload,
    response: {
      ok: response.ok,
      statusCode: response.statusCode,
      body: response.body,
      error: response.error || "",
    },
  }, rootDir);

  if (response.ok) {
    return {
      ...base,
      status: "sent",
      sentAt: new Date().toISOString(),
      outboxId: entry.id,
      detail: "硬件 TTS 网关已接收完成汇报。",
    };
  }
  return {
    ...base,
    status: "failed",
    outboxId: entry.id,
    error: compactText(response.error || response.body || "硬件 TTS 网关投递失败", 700),
  };
}

async function summarizeHardwareTtsOutbox(rootDir = __dirname, env = process.env) {
  const items = await readHardwareTtsOutbox(rootDir);
  const counts = items.reduce((acc, item) => {
    const status = String(item.status || "unknown");
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { queued: 0, sent: 0, failed: 0, blocked: 0 });
  return {
    ...resolveHardwareTtsDownlink(env),
    outboxPath: getOutboxPath(rootDir),
    total: items.length,
    pending: (counts.queued || 0) + (counts.failed || 0),
    counts,
    latest: items.slice(-8).reverse().map((item) => ({
      id: item.id,
      status: item.status,
      taskId: item.payload?.taskId || "",
      text: compactText(item.payload?.text || "", 180),
      reason: item.reason || item.response?.error || "",
      updatedAt: item.updatedAt || item.createdAt,
    })),
  };
}

module.exports = {
  OUTBOX_FILE,
  appendHardwareTtsOutbox,
  createHardwareTtsPayload,
  readHardwareTtsOutbox,
  resolveHardwareTtsDownlink,
  safeEndpointStatus,
  sendHardwareTtsDownlink,
  summarizeHardwareTtsOutbox,
};
