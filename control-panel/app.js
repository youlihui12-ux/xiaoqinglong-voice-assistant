const API = "http://127.0.0.1:43173";
const navItems = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");
const toast = document.querySelector(".toast");
let toastTimer;
let state = null;
let selectedTaskId = null;
const $ = (selector) => document.querySelector(selector);
function showToast(message) { toast.textContent = message; toast.classList.add("is-visible"); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200); }
function showView(viewName) { navItems.forEach((item) => item.classList.toggle("is-active", item.dataset.view === viewName)); views.forEach((view) => view.classList.toggle("is-visible", view.id === viewName)); }
navItems.forEach((item) => item.addEventListener("click", () => showView(item.dataset.view)));
function levelClass(ok, warn = false) { return ok ? "good" : warn ? "warn" : "danger"; }
function statusText(status) { return String(status || "unknown").toLowerCase(); }
function formatDate(value) { if (!value) return "未刷新"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString("zh-CN", { hour12: false }); }
async function apiGet(path) { const response = await fetch(API + path, { cache: "no-store" }); if (!response.ok) throw new Error(await response.text()); return response.json(); }
function getApiToken() {
  let token = localStorage.getItem("xiaoqinglong_api_token") || "";
  if (!token) {
    token = prompt("请输入 .env 里的 XIAOQINGLONG_API_TOKEN，用于本机受控操作。") || "";
    if (token) localStorage.setItem("xiaoqinglong_api_token", token);
  }
  return token;
}
function setApiToken() {
  const current = localStorage.getItem("xiaoqinglong_api_token") || "";
  const token = prompt("设置本机控制 API Token", current) || "";
  if (!token) return;
  localStorage.setItem("xiaoqinglong_api_token", token);
  showToast("Token 已保存在当前浏览器");
}
async function apiAction(action, extra = {}) { const token = getApiToken(); const headers = { "content-type": "application/json" }; if (token) headers["x-api-token"] = token; const response = await fetch(API + "/api/action", { method: "POST", headers, body: JSON.stringify({ action, ...extra }) }); const data = await response.json(); if (!response.ok || data.ok === false) { if (response.status === 401) localStorage.removeItem("xiaoqinglong_api_token"); throw new Error(data.error || data.stderr || "操作失败"); } return data; }
function renderLiveStatus(data) {
  $("[data-live-status]").innerHTML = data.liveStatus.map((item) => { const cls = levelClass(item.ok, item.key === "asr" && !item.ok); return `<article class="live-node ${cls}"><div class="node-head"><span>${item.label}</span><span class="status-light ${cls}"></span></div><strong>${item.value}</strong><p>${item.detail || "-"}</p></article>`; }).join("");
  const allOk = data.liveStatus.every((item) => item.ok);
  const global = $("[data-global-light]");
  global.className = `status-light ${allOk ? "good" : "warn"}`;
  $("[data-global-title]").textContent = allOk ? "全链路在线" : "需要关注";
  $("[data-global-subtitle]").textContent = data.config.agentName || "Hermes · 小青龙";
  const pill = $("[data-overall-pill]");
  pill.textContent = allOk ? "全链路健康" : "链路有告警";
  pill.className = `pill ${allOk ? "good" : "warn"}`;
}
function renderMetrics(data) {
  Object.entries(data.queue).forEach(([key, value]) => { const target = document.querySelector(`[data-count="${key}"]`); if (target) target.textContent = value; });
  $("[data-watchdog-summary]").textContent = data.watchdog.ok
    ? `Watchdog 定时任务已加载${data.watchdog.pid ? `，PID ${data.watchdog.pid}` : ""}。最近连接记录：${data.watchdog.lastSelfHeal}`
    : `Watchdog 是按分钟启动的短任务，当前不常驻。最近连接记录：${data.watchdog.lastSelfHeal}`;
  $("[data-watchdog-log]").textContent = data.watchdog.log?.length ? data.watchdog.log.join("\n") : "暂无 Watchdog 日志";
}
function renderTasks(data) { const tasks = data.tasks || []; if (!selectedTaskId && tasks.length) selectedTaskId = tasks[0].id; const list = $("[data-task-list]"); list.innerHTML = tasks.length ? tasks.map((task) => { const status = statusText(task.status); return `<button class="task-row ${task.id === selectedTaskId ? "is-active" : ""}" data-task-id="${task.id}"><strong>${task.id} · ${task.title || "无标题"}</strong><span>${status} · ${task.createdAt || ""}</span></button>`; }).join("") : `<div class="task-row"><strong>暂无任务</strong><span>队列文件为空</span></div>`; list.querySelectorAll("[data-task-id]").forEach((button) => button.addEventListener("click", () => { selectedTaskId = button.dataset.taskId; renderTasks(state); })); const selected = tasks.find((task) => task.id === selectedTaskId) || tasks[0]; renderTaskDetail(selected, data); }
function renderTaskDetail(task, data) { const title = $("[data-task-title]"); const badge = $("[data-task-status]"); const stages = $("[data-trace-stages]"); const monitor = $("[data-json-monitor]"); if (!task) { title.textContent = "选择一个任务"; badge.textContent = "idle"; badge.className = "status-badge"; stages.innerHTML = ""; monitor.textContent = JSON.stringify(data.mcp.toolCalls?.slice(-3) || [], null, 2); return; } const status = statusText(task.status); title.textContent = `${task.id} · ${task.title || "无标题"}`; badge.textContent = status; badge.className = `status-badge ${status}`; stages.innerHTML = (task.trace || []).map((stage) => `<div class="trace-stage"><b>${stage.elapsed}</b><div><strong>${stage.name}</strong><p>${stage.state} · ${stage.detail || ""}</p></div></div>`).join(""); monitor.textContent = JSON.stringify({ task, recentToolCalls: data.mcp.toolCalls?.slice(-8) || [] }, null, 2); }
function renderLogs(data) { $("[data-raw-log]").textContent = (data.mcp.raw || []).slice(-60).join("\n") || "暂无 MCP 日志"; }
function renderApprovals(data) { const list = $("[data-approval-list]"); const approvals = (data.approvals || []).filter((item) => !item.status || item.status === "pending"); if (!approvals.length) { list.innerHTML = `<article class="approval-card"><h3>当前没有待审批高危操作</h3><p class="hint">检测到删除、付款、发送、授权、系统配置等动作时会出现在这里。</p></article>`; return; } list.innerHTML = approvals.map((item) => `<article class="approval-card"><h3>${item.title || "高危操作待确认"}</h3><p>${item.reason || "需要人工确认后继续。"}</p><code>${item.command || item.payload || "无 payload"}</code><div class="actions"><button class="primary" data-approve="${item.id}">允许执行</button><button class="danger" data-reject="${item.id}">拒绝并回复 AI</button></div></article>`).join(""); list.querySelectorAll("[data-approve]").forEach((button) => button.addEventListener("click", () => runAction("approve-risk", { id: button.dataset.approve }))); list.querySelectorAll("[data-reject]").forEach((button) => button.addEventListener("click", () => runAction("reject-risk", { id: button.dataset.reject }))); }
function render(data) { state = data; $("[data-updated-at]").textContent = `刷新 ${formatDate(data.updatedAt)}`; renderLiveStatus(data); renderMetrics(data); renderTasks(data); renderLogs(data); renderApprovals(data); }
async function refresh() { try { render(await apiGet("/api/mission-control")); } catch (error) { showToast("刷新失败：" + error.message.slice(0, 180)); } }
async function runAction(action, extra = {}) { try { if (["clear-active-queue", "abort-current-task"].includes(action) && !confirm("确认执行这个急救操作？")) return; if (action === "dispatch-test") extra.text = $("#test-input")?.value.trim(); const result = await apiAction(action, extra); showToast(result.task ? `已注入 ${result.task.id}` : "操作已执行"); await refresh(); } catch (error) { showToast("操作失败：" + error.message.slice(0, 180)); } }
document.addEventListener("click", async (event) => { const actionButton = event.target.closest("[data-action]"); if (actionButton) { const action = actionButton.dataset.action; if (action === "refresh") await refresh(); else if (action === "set-api-token") setApiToken(); else await runAction(action); } const copyButton = event.target.closest("[data-copy]"); if (copyButton) { try { await navigator.clipboard.writeText(copyButton.dataset.copy); showToast("已复制：" + copyButton.dataset.copy); } catch { showToast(copyButton.dataset.copy); } } });
refresh(); setInterval(refresh, 2000);
