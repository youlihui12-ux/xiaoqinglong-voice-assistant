const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCompletionReport,
  buildSpokenCompletionReport,
  shouldSendCompletionReport,
  resolveLocalCompletionReport,
  resolveNotifyTopic,
} = require("../task-completion-reporter");

test("buildCompletionReport creates a voice-friendly completion summary", () => {
  const report = buildCompletionReport(
    {
      id: "ai-123",
      title: "检查 Hermes 和小智桥接状态",
      result: "Hermes 正常，小智 Mission Control 已恢复。",
      operationId: "op_abc",
    },
    new Date("2026-05-20T11:05:10.000Z"),
  );

  assert.match(report, /任务完成/);
  assert.match(report, /ai-123/);
  assert.match(report, /检查 Hermes 和小智桥接状态/);
  assert.match(report, /Hermes 正常/);
  assert.match(report, /op_abc/);
});

test("buildSpokenCompletionReport creates a concise audible summary", () => {
  const report = buildSpokenCompletionReport({
    id: "AI-063",
    title: "重载后完成汇报链路复测",
    result: "Lobe 通知已发送，本机语音播报也已触发。",
  });

  assert.match(report, /领导/);
  assert.match(report, /AI-063/);
  assert.match(report, /已完成/);
  assert.match(report, /本机语音播报/);
});

test("buildCompletionReport includes blocked task errors", () => {
  const report = buildCompletionReport({
    id: "AI-064",
    title: "完成汇报链路真实测试",
    status: "blocked",
    error: "429 quota exceeded",
  });

  assert.match(report, /任务阻塞汇报/);
  assert.match(report, /429 quota exceeded/);
});

test("shouldSendCompletionReport only fires on the first transition to a terminal state", () => {
  assert.equal(
    shouldSendCompletionReport({ status: "running" }, { status: "done" }),
    true,
  );
  assert.equal(
    shouldSendCompletionReport({ status: "running" }, { status: "blocked", error: "quota exceeded" }),
    true,
  );
  assert.equal(
    shouldSendCompletionReport({ status: "done" }, { status: "done" }),
    false,
  );
  assert.equal(
    shouldSendCompletionReport({ status: "blocked" }, { status: "blocked" }),
    false,
  );
  assert.equal(
    shouldSendCompletionReport(
      { status: "running" },
      { status: "done", completionReport: { status: "sent", sentAt: "2026-05-20T11:05:10.000Z" } },
    ),
    false,
  );
  assert.equal(
    shouldSendCompletionReport({ status: "running" }, { status: "assigned" }),
    false,
  );
});

test("resolveLocalCompletionReport enables macOS channels only when configured", () => {
  assert.deepEqual(resolveLocalCompletionReport({}, "linux"), {
    available: false,
    speech: false,
    notification: false,
  });
  assert.deepEqual(resolveLocalCompletionReport({}, "darwin"), {
    available: true,
    speech: false,
    notification: false,
  });
  assert.deepEqual(resolveLocalCompletionReport({ XIAOQINGLONG_COMPLETION_REPORT_SPEECH: "1" }, "darwin"), {
    available: true,
    speech: true,
    notification: false,
  });
  assert.deepEqual(resolveLocalCompletionReport({ XIAOQINGLONG_COMPLETION_REPORT_CHANNELS: "macos_speech,macos_notification" }, "darwin"), {
    available: true,
    speech: true,
    notification: true,
  });
});

test("resolveNotifyTopic accepts the local notification topic aliases", () => {
  assert.equal(resolveNotifyTopic({ XIAOQINGLONG_NOTIFY_TOPIC: "tpc_xiaoqinglong" }), "tpc_xiaoqinglong");
  assert.equal(resolveNotifyTopic({ LOBE_NOTIFY_TOPIC: "tpc_lobe" }), "tpc_lobe");
  assert.equal(resolveNotifyTopic({}), "");
});
