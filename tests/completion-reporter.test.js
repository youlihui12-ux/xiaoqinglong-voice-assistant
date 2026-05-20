const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCompletionReport,
  shouldSendCompletionReport,
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

test("shouldSendCompletionReport only fires on the first transition to done", () => {
  assert.equal(
    shouldSendCompletionReport({ status: "running" }, { status: "done" }),
    true,
  );
  assert.equal(
    shouldSendCompletionReport({ status: "done" }, { status: "done" }),
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
    shouldSendCompletionReport({ status: "running" }, { status: "blocked" }),
    false,
  );
});

test("resolveNotifyTopic accepts the local notification topic aliases", () => {
  assert.equal(resolveNotifyTopic({ XIAOQINGLONG_NOTIFY_TOPIC: "tpc_xiaoqinglong" }), "tpc_xiaoqinglong");
  assert.equal(resolveNotifyTopic({ LOBE_NOTIFY_TOPIC: "tpc_lobe" }), "tpc_lobe");
  assert.equal(resolveNotifyTopic({}), "");
});
