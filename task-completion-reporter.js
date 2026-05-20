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
  const result = compactText(task?.result || "任务已完成，但没有返回可朗读结果。", 760);
  const operationId = compactText(task?.operationId || "", 120);
  return [
    "任务完成汇报：" + id,
    "任务：" + title,
    "结果：" + result,
    operationId ? "Lobe operation：" + operationId : "",
    "完成时间：" + formatTime(now),
  ].filter(Boolean).join("\n");
}

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

function hasSuccessfulCompletionReport(task) {
  const report = task?.completionReport || {};
  return Boolean(report.sentAt || report.status === "sent" || report.status === "skipped");
}

function shouldSendCompletionReport(previousTask, nextTask) {
  const wasDone = normalizeStatus(previousTask?.status) === "done";
  const isDone = normalizeStatus(nextTask?.status) === "done";
  return !wasDone && isDone && !hasSuccessfulCompletionReport(nextTask);
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

module.exports = {
  buildCompletionReport,
  compactText,
  maskTopic,
  resolveNotifyTopic,
  shouldSendCompletionReport,
};
