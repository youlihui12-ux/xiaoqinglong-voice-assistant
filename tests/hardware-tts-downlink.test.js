const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  readHardwareTtsOutbox,
  resolveHardwareTtsDownlink,
  safeEndpointStatus,
  sendHardwareTtsDownlink,
  summarizeHardwareTtsOutbox,
} = require("../hardware-tts-downlink");

async function tempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "xiaoqinglong-htts-"));
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}

const task = {
  id: "AI-099",
  status: "done",
  title: "验证硬件 TTS 下行",
  result: "下行消息已经生成。",
  operationId: "op_htts",
};

test("hardware TTS config only accepts loopback endpoints", () => {
  assert.equal(safeEndpointStatus("http://127.0.0.1:43173/api/hardware-tts").ok, true);
  assert.equal(safeEndpointStatus("http://localhost:43173/api/hardware-tts").ok, true);
  assert.equal(safeEndpointStatus("https://example.com/api/hardware-tts").ok, false);
  assert.equal(safeEndpointStatus("file:///tmp/hardware-tts").ok, false);
});

test("hardware TTS stays disabled until explicitly enabled", () => {
  const config = resolveHardwareTtsDownlink({});
  assert.equal(config.enabled, false);
  assert.equal(config.status, "disabled");
});

test("missing hardware TTS endpoint queues a completion report", async (t) => {
  const root = await tempRoot(t);
  const report = await sendHardwareTtsDownlink(task, {
    rootDir: root,
    env: { XIAOQINGLONG_HARDWARE_TTS: "1" },
  });

  assert.equal(report.status, "queued");
  assert.equal(report.channel, "xiaozhi-hardware-tts");
  const outbox = await readHardwareTtsOutbox(root);
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].status, "queued");
  assert.equal(outbox[0].payload.taskId, "AI-099");
});

test("loopback hardware TTS endpoint sends through the local gateway", async (t) => {
  const root = await tempRoot(t);
  let captured;
  const report = await sendHardwareTtsDownlink(task, {
    rootDir: root,
    env: {
      XIAOQINGLONG_HARDWARE_TTS: "1",
      XIAOQINGLONG_HARDWARE_TTS_ENDPOINT: "http://127.0.0.1:43173/api/hardware-tts",
    },
    request: async (endpoint, payload) => {
      captured = { endpoint, payload };
      return { ok: true, statusCode: 200, body: "ok" };
    },
  });

  assert.equal(report.status, "sent");
  assert.equal(captured.endpoint, "http://127.0.0.1:43173/api/hardware-tts");
  assert.equal(captured.payload.taskId, "AI-099");
  assert.match(captured.payload.text, /领导/);
  const summary = await summarizeHardwareTtsOutbox(root, { XIAOQINGLONG_HARDWARE_TTS: "1" });
  assert.equal(summary.counts.sent, 1);
});

test("non-loopback hardware TTS endpoint is blocked and recorded", async (t) => {
  const root = await tempRoot(t);
  const report = await sendHardwareTtsDownlink(task, {
    rootDir: root,
    env: {
      XIAOQINGLONG_HARDWARE_TTS: "1",
      XIAOQINGLONG_HARDWARE_TTS_ENDPOINT: "https://example.com/api/hardware-tts",
    },
  });

  assert.equal(report.status, "failed");
  assert.match(report.error, /不是本机回环地址/);
  const summary = await summarizeHardwareTtsOutbox(root, { XIAOQINGLONG_HARDWARE_TTS: "1" });
  assert.equal(summary.counts.blocked, 1);
});
