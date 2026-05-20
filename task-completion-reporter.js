const DEFAULT_LIMIT = 900;

function stripAnsi(text) {
  return String(text || "").replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function compactText(value, limit = DEFAULT_LIMIT) {
  const text = stripAnsi(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return text.slice(0, Math.max(0, limit - 18)).trim() + "...（内容已截断）";
}

function formatTime(date = new Date()) {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return new Date().toLocaleString("zh-CN");
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

function buildCompletionReport(task, now = new Date()) {
  const id = compactText(task?.id || "未知任务", 80);
  const title = compactText(task?.title || task?.text || task?.prompt || "未命名任务", 220);
  const status = normalizeStatus(task?.status);
  const heading = status === "blocked" ? "任务阻塞汇报：" : "任务完成汇报：";
  const result = compactText(task?.result || task?.error || "任务已结束，但没有返回可朗读结果。", 760);
  const operationId = compactText(task?.operationId || "", 120);
  return [
    heading + id,
    "任务：" + title,
    "结果：" + result,
    operationId ? "Lobe operation：" + operationId : "",
    "完成时间：" + formatTime(now),
  ].filter(Boolean).join("\n");
}

function buildSpokenCompletionReport(task) {
  const id = compactText(task?.id || "未知任务", 40);
  const title = compactText(task?.title || task?.text || task?.prompt || "未命名任务", 90);
  const status = normalizeStatus(task?.status);
  const state = status === "blocked" ? "遇到阻塞" : "已完成";
  const result = compactText(task?.result || task?.error || "任务已结束，但没有返回可朗读结果。", 180);
  return "领导，任务 " + id + " " + state + "。" + title + "。结果：" + result;
}

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function hasSuccessfulCompletionReport(task) {
  const report = task?.completionReport || {};
  return Boolean(report.sentAt || report.status === "sent" || report.status === "skipped");
}

function shouldSendCompletionReport(previousTask, nextTask) {
  const terminalStates = new Set(["done", "blocked"]);
  const wasTerminal = terminalStates.has(normalizeStatus(previousTask?.status));
  const isTerminal = terminalStates.has(normalizeStatus(nextTask?.status));
  return !wasTerminal && isTerminal && !hasSuccessfulCompletionReport(nextTask);
}

function resolveNotifyTopic(env = process.env) {
  return (
    env.XIAOQINGLONG_NOTIFY_TOPIC ||
    env.LOBE_NOTIFY_TOPIC ||
    env.XIAOZHI_NOTIFY_TOPIC ||
    env.LOBE_TOPIC_ID ||
    ""
  ).trim();
}

function maskTopic(topic) {
  const text = String(topic || "");
  if (text.length <= 8) return text ? "***" : "";
  return text.slice(0, 5) + "..." + text.slice(-4);
}

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

function resolveLocalCompletionReport(env = process.env, platform = process.platform) {
  const available = platform === "darwin";
  return {
    available,
    speech: available && channelEnabled(env, "XIAOQINGLONG_COMPLETION_REPORT_SPEECH", "macos_speech"),
    notification: available && channelEnabled(env, "XIAOQINGLONG_COMPLETION_REPORT_NOTIFICATION", "macos_notification"),
  };
}

module.exports = {
  buildCompletionReport,
  buildSpokenCompletionReport,
  compactText,
  maskTopic,
  resolveLocalCompletionReport,
  resolveNotifyTopic,
  shouldSendCompletionReport,
};
