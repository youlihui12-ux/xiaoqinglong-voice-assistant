const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");
const {
  buildCompletionReport,
  compactText,
  maskTopic,
  resolveNotifyTopic,
  shouldSendCompletionReport,
} = require("./task-completion-reporter");

const rootDir = __dirname;
const envPath = path.join(rootDir, ".env");
const legacyEnvPath = path.join(rootDir, "doubao-asr-frontdoor.env");
const aiTaskQueuePath = path.join(rootDir, "xiaoqinglong-ai-tasks.json");
const workerLogPath = path.join(rootDir, "logs", "lobe-dispatch-worker.log");
const STORED_TEXT_LIMIT = 2400;

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
  try {
    return parseEnv(require("fs").readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function loadEnv() {
  return { ...readEnvFile(legacyEnvPath), ...readEnvFile(envPath), ...process.env };
}

const runtimeEnv = loadEnv();
const lobeCliPath = runtimeEnv.LOBE_CLI_PATH || path.join(os.homedir(), "Library/Application Support/LobeHub/bin/lobe");
const defaultLobeAgentId = runtimeEnv.LOBE_AGENT_ID || "your-lobe-agent-id";
const notifyTopic = resolveNotifyTopic(runtimeEnv);

function stripAnsi(text) {
  return String(text || "").replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function compactStoredText(value, limit = STORED_TEXT_LIMIT) {
  const text = stripAnsi(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "...（已截断，原长 " + text.length + " 字）";
}

async function appendWorkerLog(message) {
  try {
    await fs.mkdir(path.dirname(workerLogPath), { recursive: true });
    await fs.appendFile(workerLogPath, new Date().toISOString() + " " + message + "\n", "utf8");
  } catch {}
}

function summarizeLobeFailure(error, stdout, stderr, parsed) {
  const parts = [];
  if (parsed.operationId) parts.push("operationId=" + parsed.operationId);
  if (parsed.reasonDetail) parts.push("runtime=" + parsed.reasonDetail);
  const primary = stderr || error?.message || stdout || "Lobe 默认大脑调用失败";
  parts.push(compactStoredText(primary, 1800));
  const summary = parts.filter(Boolean).join("；");
  return compactStoredText(summary || "Lobe 默认大脑调用失败");
}

function checkLobeConnected() {
  return new Promise((resolve) => {
    execFile(lobeCliPath, ["status", "--timeout", "5000"], { timeout: 8000 }, (error, stdout, stderr) => {
      const detail = [stdout, stderr, error?.message].filter(Boolean).join("\n");
      resolve({
        connected: /Connection\s*:\s*connected/i.test(detail) || /\bCONNECTED\b/i.test(detail),
        detail: compactStoredText(detail, 900),
      });
    });
  });
}

async function readAiTasks() {
  try {
    const parsed = JSON.parse(await fs.readFile(aiTaskQueuePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAiTasks(tasks) {
  await fs.writeFile(aiTaskQueuePath, JSON.stringify(tasks, null, 2), "utf8");
}

async function updateTask(id, patch) {
  const tasks = await readAiTasks();
  const task = tasks.find((item) => item.id === id);
  if (!task) return null;
  Object.assign(task, patch, { updatedAt: new Date().toLocaleString("zh-CN") });
  await writeAiTasks(tasks);
  return task;
}

function collectLobeEvents(rawOutput) {
  const raw = stripAnsi(rawOutput).trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {}
  const events = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^\d{2}:\d{2}:\d{2} \[INFO\]/.test(trimmed)) continue;
    try { events.push(JSON.parse(trimmed)); } catch {}
  }
  return events;
}

function extractLobeAgentResult(stdout) {
  const raw = stripAnsi(stdout).trim();
  const events = collectLobeEvents(raw);
  let finalContent = "";
  let streamed = "";
  let operationId = "";
  let completed = false;
  let reasonDetail = "";
  for (const event of events) {
    if (event.operationId) operationId = event.operationId;
    const data = event.data || {};
    if (data.operationId) operationId = data.operationId;
    if (event.type === "stream_chunk" && data.chunkType === "text" && data.content) streamed += data.content;
    if (event.type === "stream_end" && data.finalContent) finalContent = data.finalContent;
    if (!finalContent && typeof data.content === "string" && event.type === "message") finalContent = data.content;
    if (event.type === "agent_runtime_end") {
      const reasonText = [event.reason, event.reasonDetail, data.reason, data.reasonDetail].filter(Boolean).join(" ");
      if (/done|completed|success/i.test(reasonText)) completed = true;
      if (reasonText) reasonDetail = compactStoredText(reasonText, 300);
    }
  }
  const fallback = raw
    .split(/\r?\n/)
    .filter((line) => !/^\d{2}:\d{2}:\d{2} \[INFO\]/.test(line))
    .join("\n")
    .trim();
  return {
    answer: compactStoredText((finalContent || streamed || fallback || "Lobe Agent 已完成，但没有返回可朗读文本。").trim(), 4000),
    operationId,
    completed,
    reasonDetail,
    eventCount: events.length,
  };
}
function buildLobeDispatchPrompt(task) {
  return [
    "你是 LobeHub 的 Hermes · 小青龙 Agent，小智是你的语音智能助手前台。小智负责听懂用户、保持上下文、给出即时回应；你负责深度推理、工具调用和长任务执行。",
    "请以 Agent 模式处理小智转来的文本任务：你负责理解意图、必要时拆解步骤、选择可用工具或 MCP、本地知识库和网络能力，推进到可交付结果。",
    "输出必须适合语音播报：先给一句结论，再给最多 3 条关键进展或下一步。",
    "如果任务涉及删除文件、发送消息、付款、授权、系统设置、固件、OTA 或刷机，不要擅自执行，必须要求用户确认。",
    "如果需要调用本机能力，请通过当前 local device 的 MCP 工具完成，不要只建议用户手动打开窗口。",
    "",
    "任务 ID：" + task.id,
    "来源：" + task.source,
    "优先级：" + task.priority,
    task.context ? "上下文：" + task.context : "上下文：无",
    "用户原始任务：",
    task.title,
  ].join("\n");
}

async function runLobeAgentDetailed(prompt) {
  const status = await checkLobeConnected();
  if (!status.connected) {
    return { ok: false, answer: "", operationId: "", error: "Lobe Local Device 未连接或状态不可用：" + (status.detail || "无状态输出") };
  }
  return new Promise((resolve) => {
    execFile(
      lobeCliPath,
      ["agent", "run", "--agent-id", defaultLobeAgentId, "--prompt", prompt, "--json", "--device", "local"],
      {
        timeout: 180000,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...runtimeEnv, NO_COLOR: "1", FORCE_COLOR: "0" },
      },
      async (error, stdout, stderr) => {
        const parsed = extractLobeAgentResult(stdout);
        if (error) {
          const failure = summarizeLobeFailure(error, stdout, stderr, parsed);
          if (parsed.completed && parsed.answer && !/maxBuffer|timed out/i.test(error.message || "")) {
            await appendWorkerLog("nonzero-exit-but-completed " + (parsed.operationId || "") + " " + compactStoredText(error.message, 400));
            resolve({ ok: true, answer: parsed.answer, operationId: parsed.operationId });
            return;
          }
          await appendWorkerLog("blocked " + (parsed.operationId || "") + " " + failure);
          resolve({ ok: false, answer: "", operationId: parsed.operationId, error: failure });
          return;
        }
        await appendWorkerLog("done " + (parsed.operationId || "") + " events=" + parsed.eventCount);
        resolve({ ok: true, answer: parsed.answer, operationId: parsed.operationId });
      },
    );
  });
}

async function sendCompletionReport(task) {
  const message = buildCompletionReport(task);
  const base = {
    channel: "lobe-notify",
    message,
    attemptedAt: new Date().toISOString(),
  };

  if (!notifyTopic) {
    await appendWorkerLog("completion-report-skipped missing-notify-topic task=" + task.id);
    return {
      ...base,
      status: "skipped",
      error: "未配置 XIAOQINGLONG_NOTIFY_TOPIC 或 LOBE_NOTIFY_TOPIC",
    };
  }

  return new Promise((resolve) => {
    execFile(
      lobeCliPath,
      ["notify", "--topic", notifyTopic, "-c", message, "--agent-id", defaultLobeAgentId, "--json"],
      {
        timeout: 30000,
        maxBuffer: 1024 * 1024,
        env: { ...runtimeEnv, NO_COLOR: "1", FORCE_COLOR: "0" },
      },
      async (error, stdout, stderr) => {
        const detail = compactText([stdout, stderr, error?.message].filter(Boolean).join("\n"), 1200);
        if (error) {
          await appendWorkerLog("completion-report-failed task=" + task.id + " " + detail);
          resolve({
            ...base,
            status: "failed",
            topic: maskTopic(notifyTopic),
            error: detail || "Lobe notify 调用失败",
          });
          return;
        }
        await appendWorkerLog("completion-report-sent task=" + task.id + " topic=" + maskTopic(notifyTopic));
        resolve({
          ...base,
          status: "sent",
          sentAt: new Date().toISOString(),
          topic: maskTopic(notifyTopic),
          detail,
        });
      },
    );
  });
}
(async () => {
  const id = process.argv[2];
  if (!id) process.exit(2);
  const tasks = await readAiTasks();
  const task = tasks.find((item) => item.id === id);
  if (!task) process.exit(3);
  await updateTask(id, { status: "running", error: "" });
  const result = await runLobeAgentDetailed(buildLobeDispatchPrompt(task));
  if (!result.ok) {
    await updateTask(id, { status: "blocked", operationId: result.operationId || "", error: result.error || "Lobe 默认大脑调用失败" });
    process.exit(1);
  }
  const beforeDoneTasks = await readAiTasks();
  const beforeDoneTask = beforeDoneTasks.find((item) => item.id === id);
  const completedTask = await updateTask(id, { status: "done", operationId: result.operationId || "", result: result.answer || "Lobe 默认大脑已完成。", error: "" });
  if (shouldSendCompletionReport(beforeDoneTask, completedTask)) {
    const completionReport = await sendCompletionReport(completedTask);
    await updateTask(id, { completionReport });
  }
})().catch(async (error) => {
  const id = process.argv[2];
  if (id) await updateTask(id, { status: "blocked", error: error.message || String(error) });
  process.exit(1);
});
