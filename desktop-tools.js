const { execFile, spawn } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const os = require("os");

const allowedApps = {
  chrome: "Google Chrome",
  浏览器: "Google Chrome",
  微信: "WeChat",
  wechat: "WeChat",
  终端: "Terminal",
  terminal: "Terminal",
  备忘录: "Notes",
  notes: "Notes",
  日历: "Calendar",
  calendar: "Calendar",
  邮件: "Mail",
  mail: "Mail",
  访达: "Finder",
  finder: "Finder",
  codex: "Codex",
  claude: "Claude",
  "claude code": "Terminal",
  "Claude Code": "Terminal",
  lobe: "Google Chrome",
  "lobe ai": "Google Chrome",
  "Lobe AI": "Google Chrome",
  obsidian: "Obsidian",
  黑曜石: "Obsidian",
  豆包: "豆包",
  豆包输入法: "豆包输入法",
  telegram: "Telegram",
};

const closeAllowedApps = new Set([
  "Google Chrome",
  "WeChat",
  "Terminal",
  "Notes",
  "Calendar",
  "Mail",
  "Finder",
  "Obsidian",
  "豆包",
  "豆包输入法",
  "Telegram",
]);

const allowedMenuItems = {
  "Google Chrome": {
    appMenu: ["About Google Chrome", "Check for Updates...", "Settings..."],
    File: ["New Window", "New Incognito Window", "Close Window"],
    Edit: ["Find", "Find..."],
  },
  Obsidian: {
    appMenu: ["About Obsidian", "Check for Updates...", "Settings..."],
    File: ["New Note", "Open Vault...", "Close Window"],
    Edit: ["Find", "Find..."],
  },
  Notes: {
    appMenu: ["About Notes", "Settings..."],
    File: ["New Note", "New Folder", "Close Window"],
    Edit: ["Find", "Find..."],
  },
  Mail: {
    appMenu: ["About Mail", "Settings..."],
    Mailbox: ["Get All New Mail"],
    File: ["New Message", "Close Window"],
  },
  Calendar: {
    appMenu: ["About Calendar", "Settings..."],
    File: ["New Event", "Close Window"],
  },
  Finder: {
    appMenu: ["About Finder", "Settings..."],
    File: ["New Finder Window", "New Folder", "Close Window"],
  },
  WeChat: {
    appMenu: ["About WeChat", "Check for Updates...", "Settings..."],
  },
  Telegram: {
    appMenu: ["About Telegram", "Check for Updates...", "Settings..."],
  },
  Codex: {
    appMenu: ["About Codex", "Check for Updates...", "Settings..."],
  },
};

const workbenches = {
  小智控制台: [
    process.env.XIAOZHI_CONSOLE_URL || "https://xiaozhi.me/console",
    "https://xiaozhi.me/console/knowledge-base",
  ],
  知识库: [
    process.env.OBSIDIAN_URI || "obsidian://open",
    "https://xiaozhi.me/console/knowledge-base",
  ],
  今日工作: [
    process.env.WORKBENCH_MAIL_URL || "https://mail.google.com/mail/u/0/#inbox",
    process.env.WORKBENCH_CALENDAR_URL || "https://calendar.google.com/calendar/u/0/r",
    process.env.OBSIDIAN_URI || "obsidian://open",
  ],
};

const obsidianVaultPath = process.env.OBSIDIAN_VAULT_PATH || path.join(os.homedir(), "Documents", "Obsidian Vault");
const jarvisModePath = path.join(__dirname, "jarvis-mode.json");
const aiTaskQueuePath = path.join(__dirname, "xiaoqinglong-ai-tasks.json");
const lobeDispatchWorkerPath = path.join(__dirname, "lobe-dispatch-worker.js");
const AI_TASK_LIST_LIMIT = 8;
const AI_TASK_DETAIL_LIMIT = 420;
const AI_TASK_RESPONSE_LIMIT = 6500;

const allowedShortcuts = new Set([
  "打开工作台",
  "开始工作",
  "记录灵感",
  "今日计划",
]);

const lobeCliPath = process.env.LOBE_CLI_PATH || path.join(os.homedir(), "Library/Application Support/LobeHub/bin/lobe");
const defaultLobeAgentId = process.env.LOBE_AGENT_ID || "your-lobe-agent-id";
const defaultLobeAgentName = process.env.LOBE_AGENT_NAME || "Hermes · 小青龙";

const aiWorkers = {
  codex: {
    name: "Codex",
    open: async () => openFirstApp(["Codex"]),
  },
  "claude-code": {
    name: "Claude Code",
    open: async () => run("open", ["-a", "Terminal"]),
  },
  lobe: {
    name: "Lobe AI",
    open: async () => run("open", ["https://lobechat.com/chat"]),
  },
};

function run(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          content: [{ type: "text", text: `执行失败：${stderr || error.message}` }],
          isError: true,
        });
        return;
      }

      resolve({
        content: [{ type: "text", text: stdout.trim() || "已完成" }],
      });
    });
  });
}

function runRaw(command, args, timeout = 15000) {
  return new Promise((resolve) => {
    try {
      execFile(command, args, { timeout }, (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          error: error?.message || "",
        });
      });
    } catch (error) {
      resolve({
        ok: false,
        stdout: "",
        stderr: "",
        error: error.message || String(error),
      });
    }
  });
}


function stripAnsi(text) {
  return String(text || "").replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function extractLobeAgentText(stdout) {
  const raw = stripAnsi(stdout).trim();
  if (!raw) return "";
  try {
    const events = JSON.parse(raw);
    let finalContent = "";
    let streamed = "";
    let operationId = "";
    for (const event of Array.isArray(events) ? events : [events]) {
      if (event.operationId) operationId = event.operationId;
      const data = event.data || {};
      if (event.type === "stream_chunk" && data.chunkType === "text" && data.content) {
        streamed += data.content;
      }
      if (event.type === "stream_end" && data.finalContent) {
        finalContent = data.finalContent;
      }
    }
    const answer = (finalContent || streamed || "Lobe Agent 已完成，但没有返回可朗读文本。").trim();
    return operationId ? answer + "\n\nLobe operation: " + operationId : answer;
  } catch {
    return raw
      .split(/\r?\n/)
      .filter((line) => !/^\d{2}:\d{2}:\d{2} \[INFO\]/.test(line))
      .join("\n")
      .trim();
  }
}

function runLobeAgent(prompt, agentId = defaultLobeAgentId) {
  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt) {
    return Promise.resolve({
      content: [{ type: "text", text: "请先告诉我要交给 Lobe AI 处理的问题。" }],
      isError: true,
    });
  }

  return new Promise((resolve) => {
    execFile(
      lobeCliPath,
      [
        "agent",
        "run",
        "--agent-id",
        agentId || defaultLobeAgentId,
        "--prompt",
        cleanPrompt,
        "--json",
      ],
      {
        timeout: 180000,
        maxBuffer: 25 * 1024 * 1024,
        env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stripAnsi(stderr || stdout || error.message).trim();
          resolve({
            content: [{ type: "text", text: "Lobe AI 调用失败：" + (detail || error.message) }],
            isError: true,
          });
          return;
        }
        const answer = extractLobeAgentText(stdout);
        resolve({
          content: [{ type: "text", text: answer || "Lobe AI 已完成。" }],
        });
      },
    );
  });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "未知";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function safeRead(fallback, reader) {
  try {
    return reader();
  } catch {
    return fallback;
  }
}

async function readJarvisMode() {
  try {
    const text = await fs.readFile(jarvisModePath, "utf8");
    return {
      enabled: true,
      mode: "xiaoqinglong",
      note: "我是小智，是小青龙的语音智能助手和现场指挥官，不是传话筒。我的职责是听懂你的自然语言、保留上下文、先做安全判断；简单电脑动作我直接执行，复杂推理、调试、CLI、知识库和跨工具任务交给 LobeHub Hermes · 小青龙大脑深度处理，并把结果用适合语音的方式讲清楚。",
      ...JSON.parse(text),
    };
  } catch {
    return {
      enabled: true,
      mode: "xiaoqinglong",
      updatedAt: new Date().toISOString(),
      note: "我是小智，是小青龙的语音智能助手和现场指挥官，不是传话筒。我的职责是听懂你的自然语言、保留上下文、先做安全判断；简单电脑动作我直接执行，复杂推理、调试、CLI、知识库和跨工具任务交给 LobeHub Hermes · 小青龙大脑深度处理，并把结果用适合语音的方式讲清楚。",
    };
  }
}

async function writeJarvisMode(enabled) {
  const state = {
    enabled,
    mode: enabled ? "xiaoqinglong" : "manual",
    updatedAt: new Date().toISOString(),
    note: enabled
      ? "我是小智，是小青龙的语音智能助手和现场指挥官，不是传话筒。我的职责是听懂你的自然语言、保留上下文、先做安全判断；简单电脑动作我直接执行，复杂推理、调试、CLI、知识库和跨工具任务交给 LobeHub Hermes · 小青龙大脑深度处理，并把结果用适合语音的方式讲清楚。"
      : "小青龙 AI 智能模式已暂停：保留本机工具，但复杂任务不会自动交给 LobeHub。",
  };
  await fs.writeFile(jarvisModePath, JSON.stringify(state, null, 2), "utf8");
  return state;
}

function parseVmStat(text) {
  const pageSizeMatch = text.match(/page size of (\d+) bytes/i);
  const pageSize = pageSizeMatch ? Number(pageSizeMatch[1]) : 16384;
  const stats = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^Pages\s+([^:]+):\s+([\d.]+)/i);
    if (!match) continue;
    stats[match[1].trim().toLowerCase()] = Number(match[2].replace(/\./g, ""));
  }
  const free = (stats.free || 0) * pageSize;
  const active = (stats.active || 0) * pageSize;
  const inactive = (stats.inactive || 0) * pageSize;
  const speculative = (stats.speculative || 0) * pageSize;
  const wired = (stats["wired down"] || stats.wired || 0) * pageSize;
  const compressed = (stats["occupied by compressor"] || 0) * pageSize;
  return { free, active, inactive, speculative, wired, compressed };
}

function parseDf(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const line = lines.find((item) => /\s\/$/.test(item));
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  return {
    total: Number(parts[1]) * 1024,
    used: Number(parts[2]) * 1024,
    available: Number(parts[3]) * 1024,
    percent: parts[4],
  };
}

async function getTopProcesses() {
  const result = await runRaw("ps", ["-axo", "pid,comm,%cpu,rss", "-r"], 15000);
  if (!result.ok) return [];
  return result.stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+?)\s+([\d.]+)\s+(\d+)$/);
      if (!match) return null;
      return {
        pid: match[1],
        command: path.basename(match[2]),
        cpu: Number(match[3]),
        memory: Number(match[4]) * 1024,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.memory - a.memory)
    .slice(0, 8);
}

async function buildSystemStatus() {
  const [vmStat, disk, pressure, cpuBrand] = await Promise.all([
    runRaw("vm_stat", []),
    runRaw("df", ["-k", "/"]),
    runRaw("memory_pressure", []),
    runRaw("sysctl", ["-n", "machdep.cpu.brand_string"]),
  ]);
  const memory = vmStat.ok ? parseVmStat(vmStat.stdout) : null;
  const diskInfo = disk.ok ? parseDf(disk.stdout) : null;
  const topProcesses = await getTopProcesses();
  const cpus = safeRead([], () => os.cpus());
  const load = safeRead([], () => os.loadavg()).map((value) => value.toFixed(2)).join(" / ") || "未知";
  const uptime = safeRead(null, () => os.uptime());
  const uptimeHours = Number.isFinite(uptime) ? (uptime / 3600).toFixed(1) : "未知";
  const totalMemory = safeRead(NaN, () => os.totalmem());
  const freeMemory = safeRead(NaN, () => os.freemem());
  const usedMemory = totalMemory - freeMemory;
  const pressureLine = pressure.stdout
    .split(/\r?\n/)
    .find((line) => /System-wide memory free percentage|System-wide memory pressure/i.test(line));

  const lines = [
    "电脑性能状态：",
    `- 芯片/CPU：${cpuBrand.stdout || cpus[0]?.model || "未知"}`,
    `- CPU 核心：${cpus.length || "未知"} 核`,
    `- 系统负载：${load}`,
    `- 已开机：${uptimeHours} 小时`,
    `- 内存：已用 ${formatBytes(usedMemory)} / 总计 ${formatBytes(totalMemory)}，系统空闲 ${formatBytes(freeMemory)}`,
  ];

  if (memory) {
    lines.push(
      `- 可回收/空闲：free ${formatBytes(memory.free)}，inactive ${formatBytes(memory.inactive)}，compressed ${formatBytes(memory.compressed)}`,
    );
  }
  if (pressureLine) lines.push(`- 内存压力：${pressureLine.trim()}`);
  if (diskInfo) {
    lines.push(`- 系统盘：已用 ${formatBytes(diskInfo.used)} / 总计 ${formatBytes(diskInfo.total)}，剩余 ${formatBytes(diskInfo.available)} (${diskInfo.percent})`);
  }
  if (topProcesses.length) {
    lines.push(
      "- 内存占用靠前：",
      ...topProcesses.map((process) => `  ${process.command} PID ${process.pid}，内存 ${formatBytes(process.memory)}，CPU ${process.cpu.toFixed(1)}%`),
    );
  }

  return lines.join("\n");
}

async function lightMemoryOptimize() {
  const before = await buildSystemStatus();
  const purgePath = await runRaw("/usr/bin/which", ["purge"], 5000);
  let purgeMessage = "未找到系统 purge 工具，已跳过缓存回收。";
  if (purgePath.ok && purgePath.stdout) {
    const purgeResult = await runRaw(purgePath.stdout, [], 30000);
    purgeMessage = purgeResult.ok
      ? "已请求 macOS 回收可释放的文件缓存。"
      : `缓存回收未完成：${purgeResult.stderr || purgeResult.error}`;
  }
  const after = await buildSystemStatus();
  return [
    "轻量优化完成。",
    purgeMessage,
    "",
    "优化前：",
    before,
    "",
    "优化后：",
    after,
    "",
    "我没有关闭应用、没有删除文件。如果还需要更多内存，请先确认要关闭哪些应用，再让我执行。",
  ].join("\n");
}

async function openFirstApp(appNames) {
  const failures = [];
  for (const appName of appNames) {
    const result = await run("open", ["-a", appName]);
    if (!result.isError) return result;
    failures.push(`${appName}: ${result.content?.[0]?.text || "打开失败"}`);
  }
  return {
    content: [{ type: "text", text: `没有打开可用的输入法应用：${failures.join("；")}` }],
    isError: true,
  };
}

function resolveAllowedApp(app) {
  const raw = app.trim();
  return allowedApps[raw.toLowerCase()] || allowedApps[raw] || null;
}

async function closeAllowedApp(app) {
  const appName = resolveAllowedApp(app);
  if (!appName) {
    return {
      content: [{ type: "text", text: `不在白名单中：${app}` }],
      isError: true,
    };
  }
  if (!closeAllowedApps.has(appName)) {
    return {
      content: [{ type: "text", text: `这个应用暂不允许由小智关闭：${appName}` }],
      isError: true,
    };
  }
  return run("osascript", [
    "-e",
    "on run argv",
    "-e",
    "tell application (item 1 of argv) to quit",
    "-e",
    "end run",
    appName,
  ]);
}

async function focusAllowedApp(app) {
  const appName = resolveAllowedApp(app);
  if (!appName) {
    return {
      content: [{ type: "text", text: `不在白名单中：${app}` }],
      isError: true,
    };
  }
  return run("osascript", [
    "-e",
    "on run argv",
    "-e",
    "tell application (item 1 of argv) to activate",
    "-e",
    "end run",
    appName,
  ]);
}

async function getFrontmostApp() {
  const result = await runRaw("osascript", [
    "-e",
    "tell application \"System Events\" to get name of first application process whose frontmost is true",
  ]);
  return result.ok ? result.stdout : "未知";
}

async function takeDesktopScreenshot() {
  const file = path.join(__dirname, `xiaozhi-screenshot-${Date.now()}.png`);
  const result = await runRaw("screencapture", ["-x", file], 15000);
  if (!result.ok) {
    return {
      content: [{ type: "text", text: `截图失败：${result.stderr || result.error}` }],
      isError: true,
    };
  }
  return {
    content: [{ type: "text", text: `已保存当前屏幕截图：${file}` }],
  };
}

function resolveMenuName(appName, menu) {
  const normalized = menu.trim();
  if (/^(app|应用|程序|主菜单)$/i.test(normalized)) return appName;
  if (/^file$|^文件$|^檔案$/i.test(normalized)) return "File";
  if (/^edit$|^编辑$|^編輯$/i.test(normalized)) return "Edit";
  if (/^mailbox$|^邮箱$|^邮箱菜单$|^郵箱$/i.test(normalized)) return "Mailbox";
  return normalized;
}

function isAllowedMenuItem(appName, menuName, itemName) {
  const appRules = allowedMenuItems[appName];
  if (!appRules) return false;
  const key = menuName === appName ? "appMenu" : menuName;
  const allowed = appRules[key] || [];
  return allowed.includes(itemName);
}

async function clickAllowedMenuItem(app, menu, item) {
  const appName = resolveAllowedApp(app);
  if (!appName) {
    return {
      content: [{ type: "text", text: `不在白名单中：${app}` }],
      isError: true,
    };
  }
  const menuName = resolveMenuName(appName, menu);
  const itemName = item.trim();
  if (!isAllowedMenuItem(appName, menuName, itemName)) {
    return {
      content: [{ type: "text", text: `这个菜单动作未加入白名单：${appName} / ${menuName} / ${itemName}` }],
      isError: true,
    };
  }

  return run("osascript", [
    "-e",
    "on run argv",
    "-e",
    "set appName to item 1 of argv",
    "-e",
    "set menuName to item 2 of argv",
    "-e",
    "set itemName to item 3 of argv",
    "-e",
    "tell application appName to activate",
    "-e",
    "tell application \"System Events\"",
    "-e",
    "tell process appName",
    "-e",
    "click menu item itemName of menu menuName of menu bar 1",
    "-e",
    "end tell",
    "-e",
    "end tell",
    "-e",
    "end run",
    appName,
    menuName,
    itemName,
  ]);
}

async function checkUpdates(app = "") {
  const target = app.trim();
  if (!target || /系统|macos|电脑|mac|全部/.test(target.toLowerCase())) {
    const result = await runRaw("softwareupdate", ["-l"], 60000);
    if (result.ok) {
      return {
        content: [{ type: "text", text: result.stdout || "系统更新检查完成：当前没有可用更新。" }],
      };
    }
    return {
      content: [{ type: "text", text: `系统更新检查没有完成：${result.stderr || result.error}` }],
      isError: true,
    };
  }

  const appName = resolveAllowedApp(target);
  if (!appName) {
    return {
      content: [{ type: "text", text: `不在白名单中：${app}` }],
      isError: true,
    };
  }

  const menuResult = await clickAllowedMenuItem(appName, "app", "Check for Updates...");
  if (!menuResult.isError) return menuResult;
  return {
    content: [{
      type: "text",
      text: `已尝试打开 ${appName} 的更新检查菜单，但这个应用可能没有标准更新入口。你也可以说“打开 App Store 更新页”。`,
    }],
  };
}

async function openAppStoreUpdates() {
  return run("open", ["macappstore://showUpdatesPage"]);
}

async function performAppAction(app, action, text = "") {
  const normalizedAction = action.trim().toLowerCase();
  const appName = resolveAllowedApp(app);
  if (!appName) {
    return {
      content: [{ type: "text", text: `不在白名单中：${app}` }],
      isError: true,
    };
  }

  if (["open", "打开", "启动"].includes(normalizedAction)) return run("open", ["-a", appName]);
  if (["focus", "聚焦", "切换", "切到"].includes(normalizedAction)) return focusAllowedApp(appName);
  if (["close", "quit", "关闭", "退出"].includes(normalizedAction)) return closeAllowedApp(appName);
  if (["check_updates", "update", "检查更新", "更新"].includes(normalizedAction)) return checkUpdates(appName);
  if (["preferences", "settings", "设置", "偏好设置"].includes(normalizedAction)) {
    return clickAllowedMenuItem(appName, "app", "Settings...");
  }
  if (["find", "search", "搜索", "查找"].includes(normalizedAction)) {
    await focusAllowedApp(appName);
    const findResult = await run("osascript", [
      "-e",
      "tell application \"System Events\" to keystroke \"f\" using command down",
    ]);
    if (text.trim()) return pasteTextToActiveInput(text);
    return findResult;
  }
  if (["new", "new_note", "新建", "新建笔记"].includes(normalizedAction)) {
    if (appName === "Notes" && text.trim()) {
      return run("osascript", [
        "-e",
        "on run argv",
        "-e",
        "tell application \"Notes\"",
        "-e",
        "activate",
        "-e",
        "make new note at folder \"Notes\" with properties {body:item 1 of argv}",
        "-e",
        "end tell",
        "-e",
        "end run",
        text.trim(),
      ]);
    }
    if (appName === "Obsidian") return clickAllowedMenuItem(appName, "File", "New Note");
    if (appName === "Google Chrome") return clickAllowedMenuItem(appName, "File", "New Window");
    if (appName === "Finder") return clickAllowedMenuItem(appName, "File", "New Finder Window");
  }

  return {
    content: [{
      type: "text",
      text: `这个应用动作暂不支持：${appName} / ${action}。可用动作：打开、聚焦、关闭、检查更新、设置、搜索、新建。`,
    }],
    isError: true,
  };
}

async function pasteTextToActiveInput(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      content: [{ type: "text", text: "没有可输入的文字。" }],
      isError: true,
    };
  }

  return run("osascript", [
    "-e",
    "on run argv",
    "-e",
    "set the clipboard to item 1 of argv",
    "-e",
    "tell application \"System Events\" to keystroke \"v\" using command down",
    "-e",
    "end run",
    trimmed,
  ]);
}

function normalizeUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
  return `https://${url}`;
}

async function openMany(urls) {
  const results = [];
  for (const url of urls) {
    const result = await run("open", [normalizeUrl(url)]);
    const text = result.content?.[0]?.text || "已完成";
    results.push(text);
  }
  return {
    content: [{ type: "text", text: `已打开 ${urls.length} 个工作入口。` }],
  };
}

async function readIfExists(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

async function readAiTasks() {
  const text = await readIfExists(aiTaskQueuePath);
  if (!text.trim()) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAiTasks(tasks) {
  await fs.writeFile(aiTaskQueuePath, JSON.stringify(tasks, null, 2), "utf8");
}

function normalizeAiWorker(worker) {
  const text = String(worker || "").trim().toLowerCase();
  if (/codex|代码|编程|实现/.test(text)) return "codex";
  if (/claude|cloud|克劳德|终端/.test(text)) return "claude-code";
  if (/lobe|聊天|知识|默认大脑/.test(text)) return "lobe";
  return "codex";
}

function nextAiTaskId(tasks) {
  const maxId = tasks.reduce((max, task) => {
    const match = String(task.id || "").match(/^AI-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return "AI-" + String(maxId + 1).padStart(3, "0");
}

function compactAiText(value, limit = AI_TASK_DETAIL_LIMIT) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "...（已截断，原长 " + text.length + " 字）";
}

function limitMcpText(value, limit = AI_TASK_RESPONSE_LIMIT) {
  const text = String(value || "").trim();
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "\n\n（输出已截断，完整详情请到 Hermes 控制台查看。原长 " + text.length + " 字）";
}

function summarizeAiTaskCounts(tasks) {
  const counts = { assigned: 0, running: 0, done: 0, blocked: 0 };
  for (const task of tasks) {
    const status = String(task.status || "unknown").toLowerCase();
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function formatAiTask(task) {
  return [
    "- " + task.id + " [" + task.status + "] " + task.workerName + ": " + compactAiText(task.title, 180),
    task.source ? "  来源：" + compactAiText(task.source, 80) : "",
    task.priority ? "  优先级：" + compactAiText(task.priority, 40) : "",
    task.operationId ? "  Lobe operation：" + compactAiText(task.operationId, 120) : "",
    task.createdAt ? "  创建：" + task.createdAt : "",
    task.updatedAt ? "  更新：" + task.updatedAt : "",
    task.result ? "  结果：" + compactAiText(task.result) : "",
    task.error ? "  阻塞原因：" + compactAiText(task.error) : "",
  ].filter(Boolean).join("\n");
}
async function createLobeDispatchTask(title, { source = "xiaozhi-voice", context = "", priority = "normal", notes = "" } = {}) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) {
    return null;
  }
  const tasks = await readAiTasks();
  const now = new Date().toLocaleString("zh-CN");
  const task = {
    id: nextAiTaskId(tasks),
    worker: "lobe",
    workerName: "Lobe AI",
    title: cleanTitle,
    notes: String(notes || "").trim(),
    source: String(source || "xiaozhi-voice").trim() || "xiaozhi-voice",
    context: String(context || "").trim(),
    priority: String(priority || "normal").trim() || "normal",
    status: "assigned",
    createdAt: now,
    updatedAt: now,
    operationId: "",
    result: "",
    error: "",
  };
  tasks.push(task);
  await writeAiTasks(tasks);
  return task;
}

function startLobeDispatchWorker(taskId) {
  const child = spawn(process.execPath, [lobeDispatchWorkerPath, taskId], {
    cwd: __dirname,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  child.unref();
}

async function dispatchToLobeAsync(taskText, options = {}) {
  const task = await createLobeDispatchTask(taskText, options);
  if (!task) {
    return {
      content: [{ type: "text", text: "我没有收到要交给 Lobe 默认大脑的任务。" }],
      isError: true,
    };
  }
  startLobeDispatchWorker(task.id);
  return {
    content: [{
      type: "text",
      text: [
        `已分发给 Lobe 默认大脑：${task.id}`,
        `任务：${task.title}`,
        "状态：assigned，后台正在处理。",
        "你可以说“查看 AI 任务”追踪结果。",
      ].join("\n"),
    }],
  };
}

async function assignAiTask(worker, title, notes = "") {
  const workerId = normalizeAiWorker(worker);
  const requested = aiWorkers[workerId]?.name || worker || "Codex";
  const taskTitle = String(title || notes || "").trim();
  return dispatchToLobeAsync(taskTitle, {
    source: "legacy-ai-dispatch",
    context: [
      "用户通过旧调度入口请求执行者：" + requested + "。",
      "当前策略是先交给 Lobe 默认大脑，由它判断是否需要再调度 Codex、Claude Code 或其他工具。",
      notes ? "补充说明：" + notes : "",
    ].filter(Boolean).join("\n"),
    priority: "normal",
    notes,
  });
}

async function showAiTasks(status = "") {
  const tasks = await readAiTasks();
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const filtered = normalizedStatus
    ? tasks.filter((task) => String(task.status || "").toLowerCase() === normalizedStatus)
    : tasks;
  const counts = summarizeAiTaskCounts(tasks);
  const recent = filtered.slice(-AI_TASK_LIST_LIMIT).reverse();
  const hidden = Math.max(0, filtered.length - recent.length);
  const header = [
    "AI 执行队列：共 " + tasks.length + " 条",
    "assigned " + (counts.assigned || 0),
    "running " + (counts.running || 0),
    "done " + (counts.done || 0),
    "blocked " + (counts.blocked || 0),
  ].join("；");
  const filterLine = normalizedStatus ? "当前筛选：" + normalizedStatus + "，命中 " + filtered.length + " 条。" : "显示最近 " + Math.min(recent.length, AI_TASK_LIST_LIMIT) + " 条。";
  const body = recent.length ? recent.map(formatAiTask).join("\n\n") : "当前没有匹配的 AI 执行任务。";
  const footer = hidden ? "还有 " + hidden + " 条未在语音端展开；请到 Hermes 控制台查看完整列表。" : "";
  return {
    content: [{
      type: "text",
      text: limitMcpText([header, filterLine, body, footer].filter(Boolean).join("\n\n")),
    }],
  };
}
async function updateAiTask(id, status, result = "") {
  const tasks = await readAiTasks();
  const task = tasks.find((item) => item.id.toLowerCase() === id.trim().toLowerCase());
  if (!task) {
    return {
      content: [{ type: "text", text: `找不到任务：${id}` }],
      isError: true,
    };
  }
  task.status = status.trim() || task.status;
  task.result = result.trim() || task.result;
  task.updatedAt = new Date().toLocaleString("zh-CN");
  await writeAiTasks(tasks);
  return {
    content: [{ type: "text", text: `已更新 ${task.id}：${task.status}${task.result ? `\n结果：${task.result}` : ""}` }],
  };
}

async function listMarkdownFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(fullPath));
    } else if (/\.md$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

async function buildObsidianSnapshot() {
  const files = await listMarkdownFiles(obsidianVaultPath);
  const parts = [
    "# Obsidian 个人知识库",
    "",
    `来源：${obsidianVaultPath}`,
    `导入时间：${new Date().toLocaleString("zh-CN")}`,
    `包含 Markdown 笔记数：${files.length}`,
    "",
    "---",
  ];

  for (const file of files.sort((a, b) => a.localeCompare(b, "zh-CN"))) {
    const relative = path.relative(obsidianVaultPath, file);
    const content = (await fs.readFile(file, "utf8")).trim();
    parts.push("", `# ${relative.replace(/\.md$/i, "")}`, "", `文件：${relative}`, "", content || "（空文档）", "", "---");
  }

  return parts.join("\n");
}

function stripCommandPrefix(text) {
  return text
    .trim()
    .replace(/^小智[,，\s]*/i, "")
    .replace(/^你好小智[,，\s]*/i, "")
    .replace(/^帮我\s*/, "")
    .trim();
}

function findNamedApp(text) {
  const keys = Object.keys(allowedApps).sort((a, b) => b.length - a.length);
  return keys.find((key) => text.toLowerCase().includes(key.toLowerCase())) || "";
}

function findWorkbench(text) {
  return Object.keys(workbenches).find((name) => text.includes(name)) || "";
}


function shouldRouteToLobeAgent(text) {
  return /小青龙|青龙|lobe|lobehub|ai能力|智能模式|智能体|agent|代理|终端|terminal|cli|命令行|shell|运行命令|执行命令|调试|debug|报错|错误|代码|项目|仓库|工程|部署|接口|api|为什么|原因|分析|规划|方案|研究|搜索|联网|总结|优化|自动化|多步骤|复杂|真正的AI/i.test(text);
}

function buildLobeVoicePrompt(text) {
  return [
    "你现在与小智组成小青龙智能语音系统。小智是语音智能助手和现场指挥官，负责听懂用户、保留上下文、安全判断和即时播报；你是 LobeHub Hermes · 小青龙默认大脑，负责深度推理、工具调用和复杂任务执行。",
    "用户通过小智语音发来任务。请把它当作连续对话处理，不要把小智降级成传话筒；需要澄清时直接给小智一段可播报的追问。",
    "要求：回答简洁、适合语音播报；给出结论、关键进展和下一步；需要终端 CLI、调试、搜索、知识库或插件时自行调度 LobeHub 能力；不要只说已提交或已转交；涉及删除、发送、付款、授权等高风险动作时先要求小智向用户确认。",
    "用户任务：" + text,
  ].join("\n");
}

async function dispatchJarvisCommand(input) {
  const mode = await readJarvisMode();
  const text = stripCommandPrefix(input);
  if (!text) {
    return {
      content: [{ type: "text", text: "我没有收到要执行的指令。" }],
      isError: true,
    };
  }

  if (/开启贾维斯|启动贾维斯|进入贾维斯|打开贾维斯模式|开启小青龙|启动小青龙|进入小青龙|智能模式|AI模式/.test(text)) {
    const state = await writeJarvisMode(true);
    return {
      content: [{ type: "text", text: `${state.note}\n你现在可以直接说：小青龙调试一下项目、帮我运行 CLI 检查状态、分析为什么小智没进 AI 模式。` }],
    };
  }

  if (/关闭贾维斯|暂停贾维斯|退出贾维斯模式|关闭小青龙|暂停小青龙|退出小青龙模式/.test(text)) {
    const state = await writeJarvisMode(false);
    return { content: [{ type: "text", text: state.note }] };
  }

  if (/能做什么|有什么能力|能力状态|控制电脑|模式状态|贾维斯状态|小青龙状态/.test(text)) {
    return {
      content: [{
        type: "text",
        text: [
          `小青龙 AI 智能模式：${mode.enabled ? "已开启" : "已暂停"}`,
          "我是小智，是小青龙的语音智能助手和现场指挥官，不是传话筒。我的职责是听懂你的自然语言、保留上下文、先做安全判断；简单电脑动作我直接执行，复杂推理、调试、CLI、知识库和跨工具任务交给 LobeHub Hermes · 小青龙大脑深度处理，并把结果用适合语音的方式讲清楚。",
          "我的两层能力：",
          "- 快速现场动作：打开应用、截图、查状态、记任务、搜索 Obsidian、做轻量系统检查。",
          "- 小青龙大脑能力：终端 CLI、项目调试、复杂分析、联网搜索、知识库、插件和跨工具调度。",
          "你可以直接说：小智，帮我调试这个项目；或者小青龙，检查当前链路哪里断了。",
          "高风险动作如删除、发送、付款、授权、系统配置，会先停下来向你确认。",
        ].join("\n"),
      }],
    };
  }

  if (/查看.*AI.*任务|AI.*任务|执行队列|任务队列|追踪结果|查看.*结果/.test(text)) {
    return showAiTasks();
  }

  if (/分配|派给|交给|让.*(codex|claude|cloud|lobe|代码|默认大脑)/i.test(text)) {
    const workerMatch = text.match(/codex|claude\s*code|claude|cloud\s*code|lobe\s*ai|lobe|代码|默认大脑/i);
    const worker = workerMatch?.[0] || "codex";
    const title = text
      .replace(/小青龙|小智|请|帮我|把|任务|分配|派给|交给|让|执行|处理/gi, "")
      .replace(/codex|claude\s*code|claude|cloud\s*code|lobe\s*ai|lobe|代码|默认大脑/gi, "")
      .trim();
    return assignAiTask(worker, title || text, text);
  }

  if (mode.enabled && shouldRouteToLobeAgent(text)) {
    return dispatchToLobeAsync(text, { source: "jarvis-agent-command", context: "小智智能模式路由；复杂任务异步交给 Lobe 默认大脑。" });
  }

  if (/性能|硬件|cpu|内存占用|磁盘|状态|占用最高/.test(text) && !/释放|优化/.test(text)) {
    const status = await buildSystemStatus();
    const frontApp = await getFrontmostApp();
    return { content: [{ type: "text", text: `${status}\n- 当前前台应用：${frontApp}` }] };
  }

  if (/释放.*内存|优化.*内存|清理.*内存|电脑.*优化/.test(text)) {
    const result = await lightMemoryOptimize();
    return { content: [{ type: "text", text: result }] };
  }

  if (/截图|截屏|屏幕快照/.test(text)) return takeDesktopScreenshot();

  if (/app store.*更新|应用商店.*更新|打开.*更新页/.test(text.toLowerCase())) return openAppStoreUpdates();

  if (/检查.*更新|更新.*检查|有没有.*更新/.test(text)) {
    const app = findNamedApp(text);
    if (app) return checkUpdates(app);
    return checkUpdates("系统");
  }

  if (/开始工作|进入工作|启动工作|工作模式/.test(text)) {
    await openMany(workbenches["今日工作"]);
    const status = await buildSystemStatus();
    const tasks = await readIfExists(path.join(__dirname, "xiaozhi-tasks.md"));
    return {
      content: [{
        type: "text",
        text: [
          "已进入工作模式：今日工作入口已打开。",
          "",
          status,
          "",
          "当前任务：",
          tasks.trim() || "当前没有本地任务。",
        ].join("\n"),
      }],
    };
  }

  if (/打开豆包输入法|启动豆包输入法|语音输入/.test(text)) {
    return openFirstApp(["豆包输入法", "豆包"]);
  }

  if (/打开|启动/.test(text)) {
    const bench = findWorkbench(text);
    if (bench) return openMany(workbenches[bench]);
    const app = findNamedApp(text);
    if (app) return run("open", ["-a", resolveAllowedApp(app)]);
  }

  if (/设置|偏好设置/.test(text)) {
    const app = findNamedApp(text);
    if (app) return performAppAction(app, "settings");
  }

  if (/新建.*笔记|创建.*笔记/.test(text)) {
    const app = text.toLowerCase().includes("obsidian") || text.includes("黑曜石") ? "obsidian" : "备忘录";
    const content = text.replace(/在|用|新建|创建|笔记|obsidian|黑曜石|备忘录|notes/g, "").trim();
    return performAppAction(app, "new_note", content);
  }

  if (/聚焦|切到|切换到|回到/.test(text)) {
    const app = findNamedApp(text);
    if (app) return focusAllowedApp(app);
  }

  if (/关闭|退出/.test(text)) {
    const app = findNamedApp(text);
    if (app) return closeAllowedApp(app);
  }

  if (/搜索|查找/.test(text) && /obsidian|黑曜石|知识库|笔记/.test(text.toLowerCase())) {
    const query = text
      .replace(/搜索|查找|在|obsidian|黑曜石|知识库|笔记|里面|里的/g, "")
      .trim();
    return searchObsidian(query || text);
  }

  if (/加入任务|添加任务|待办|提醒我/.test(text)) {
    const task = text
      .replace(/把|加入任务|添加任务|加入待办|待办|提醒我/g, "")
      .trim();
    const file = path.join(__dirname, "xiaozhi-tasks.md");
    await fs.appendFile(file, `- [ ] ${task || text} (${new Date().toLocaleString("zh-CN")}，智能分发)\n`, "utf8");
    return { content: [{ type: "text", text: `已加入任务：${task || text}` }] };
  }

  if (/记录|短写|记一下|保存/.test(text)) {
    const content = text.replace(/记录|短写|记一下|保存/g, "").trim() || text;
    const file = path.join(__dirname, "xiaozhi-short-writes.md");
    await fs.appendFile(file, `## ${new Date().toLocaleString("zh-CN")}\n${content}\n\n`, "utf8");
    return { content: [{ type: "text", text: "已保存到短写记录。" }] };
  }

  if (mode.enabled) {
    return dispatchToLobeAsync(text, { source: "jarvis-agent-command", context: "小智智能模式兜底路由；异步交给 Lobe 默认大脑。" });
  }

  return {
    content: [{
      type: "text",
      text: `这句我还不能安全判断要做什么：${text}\n你可以说：查看电脑性能、轻量释放内存、打开 Obsidian、把某事加入任务、搜索知识库、保存截图，或开启小青龙 AI 智能模式。`,
    }],
    isError: true,
  };
}

function extractSection(text, heading) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return "";
  const out = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^##\s+/.test(line) && out.length) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

async function searchObsidian(query) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return {
      content: [{ type: "text", text: "请提供要搜索的关键词。" }],
      isError: true,
    };
  }

  const files = await listMarkdownFiles(obsidianVaultPath);
  const matches = [];
  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    const lower = content.toLowerCase();
    const index = lower.indexOf(keyword);
    if (index === -1 && !path.basename(file).toLowerCase().includes(keyword)) continue;
    const start = Math.max(0, index - 160);
    const end = index === -1 ? Math.min(content.length, 320) : Math.min(content.length, index + keyword.length + 240);
    matches.push(`文件：${path.relative(obsidianVaultPath, file)}\n摘录：${content.slice(start, end).trim() || "（文件名匹配，内容为空）"}`);
    if (matches.length >= 6) break;
  }

  return {
    content: [{ type: "text", text: matches.join("\n\n---\n\n") || `没有在 Obsidian 中找到：${query}` }],
  };
}

module.exports = {
  configureMcp(server, ResourceTemplate, z) {
    server.tool(
      "desktop_open_app",
      "打开 Mac 上的白名单应用。支持：Chrome、微信、终端、备忘录、日历、邮件、访达、Codex、Obsidian、豆包、豆包输入法、Telegram。",
      {
        app: z.string().describe("要打开的应用名称，例如 微信、Chrome、Codex"),
      },
      async ({ app }) => {
        const appName = resolveAllowedApp(app);
        if (!appName) {
          return {
            content: [{ type: "text", text: `不在白名单中：${app}` }],
            isError: true,
          };
        }
        return run("open", ["-a", appName]);
      },
    );

    server.tool(
      "desktop_focus_app",
      "把一个白名单应用切到前台。",
      {
        app: z.string().describe("要切到前台的应用名称，例如 Obsidian、Chrome、Codex"),
      },
      async ({ app }) => focusAllowedApp(app),
    );

    server.tool(
      "desktop_close_app",
      "关闭白名单应用。不会关闭 Codex，也不会关闭非白名单应用。",
      {
        app: z.string().describe("要关闭的白名单应用名称，例如 Chrome、微信、Obsidian"),
      },
      async ({ app }) => closeAllowedApp(app),
    );

    server.tool(
      "desktop_take_screenshot",
      "保存当前 Mac 屏幕截图到本地桥接器目录。需要 macOS 截屏权限。",
      {},
      async () => takeDesktopScreenshot(),
    );

    server.tool(
      "desktop_click_menu_item",
      "在白名单应用中点击一个白名单菜单项。适合检查更新、打开设置、新建窗口、新建笔记等人类常见菜单动作。",
      {
        app: z.string().describe("应用名称，例如 Chrome、Obsidian、备忘录、邮件"),
        menu: z.string().describe("菜单名称，例如 app、File、Edit、Mailbox"),
        item: z.string().describe("菜单项名称，例如 Check for Updates...、Settings...、New Note"),
      },
      async ({ app, menu, item }) => clickAllowedMenuItem(app, menu, item),
    );

    server.tool(
      "desktop_app_action",
      "在白名单应用里执行常见动作：打开、聚焦、关闭、检查更新、设置、搜索、新建。适合代替用户完成应用内基础操作。",
      {
        app: z.string().describe("应用名称，例如 Chrome、Obsidian、备忘录、邮件"),
        action: z.string().describe("动作：open、focus、close、check_updates、settings、search、new_note"),
        text: z.string().optional().describe("可选文字，例如搜索词或新建笔记内容"),
      },
      async ({ app, action, text }) => performAppAction(app, action, text || ""),
    );

    server.tool(
      "desktop_check_updates",
      "检查系统或白名单应用更新。系统更新只查询可用更新；应用更新会打开该应用自己的检查更新菜单。",
      {
        target: z.string().optional().describe("检查对象，例如 系统、Chrome、Obsidian、Telegram；留空检查系统更新"),
      },
      async ({ target }) => checkUpdates(target || "系统"),
    );

    server.tool(
      "desktop_open_app_store_updates",
      "打开 Mac App Store 的更新页面，方便用户或小智继续处理应用更新。",
      {},
      async () => openAppStoreUpdates(),
    );

    server.tool(
      "jarvis_agent_command",
      "小智的角色入口：小智是小青龙语音智能助手和现场指挥官，不是传话筒。它会理解用户意图、保留上下文、做安全判断；简单本机动作直接执行，复杂任务交给 LobeHub Hermes · 小青龙大脑。",
      {
        command: z.string().describe("用户对小智说的一整句自然语言指令"),
      },
      async ({ command }) => dispatchJarvisCommand(command),
    );

    server.tool(
      "desktop_execute_task",
      "小智执行任务的默认入口。小智负责语音理解、上下文、风险确认和现场执行；复杂推理、调试、CLI、知识库和跨工具任务路由到 LobeHub Hermes · 小青龙默认大脑，并返回可播报结果。",
      {
        task: z.string().describe("用户自然语言任务，例如 查看电脑状态、小青龙调试项目、运行 CLI 检查服务、分析一个复杂问题"),
      },
      async ({ task }) => dispatchJarvisCommand(task),
    );

    server.tool(
      "jarvis_mode",
      "兼容旧名称：开启、暂停或查看小青龙 AI 智能模式。开启后，小智会把复杂任务、终端 CLI、调试和跨工具调度优先交给 LobeHub 小青龙 Agent。",
      {
        action: z.string().describe("支持：enable、disable、status"),
      },
      async ({ action }) => {
        const normalized = action.trim().toLowerCase();
        if (["enable", "on", "开启", "启动"].includes(normalized)) {
          const state = await writeJarvisMode(true);
          return { content: [{ type: "text", text: state.note }] };
        }
        if (["disable", "off", "关闭", "暂停"].includes(normalized)) {
          const state = await writeJarvisMode(false);
          return { content: [{ type: "text", text: state.note }] };
        }
        const state = await readJarvisMode();
        return {
          content: [{ type: "text", text: `小青龙 AI 智能模式：${state.enabled ? "已开启" : "已暂停"}\n${state.note}` }],
        };
      },
    );

    server.tool(
      "jarvis_capabilities",
      "查看小智当前已经接入的电脑控制能力和安全边界。",
      {},
      async () => dispatchJarvisCommand("小智能做什么"),
    );

    server.tool(
      "xiaoqinglong_lobe_dispatch",
      "兼容旧缓存入口，但角色仍是小智语音智能助手：不要后台派单，不返回任务号；按小青龙 AI 智能模式理解上下文、判断风险、执行简单动作，复杂任务进入 LobeHub Hermes · 小青龙大脑，并把真实结果返回给语音端。",
      {
        task: z.string().describe("用户通过小智语音发来的自然语言任务；按小青龙智能模式理解和执行，不要当作后台队列工单"),
        source: z.string().optional().describe("兼容旧字段，当前只用于标记来源"),
        context: z.string().optional().describe("补充上下文；会合并进任务文本帮助小青龙理解"),
        priority: z.string().optional().describe("兼容旧字段，当前不触发后台派单"),
      },
      async ({ task, context }) => {
        const fullTask = [context ? "上下文：" + context : "", task].filter(Boolean).join("\n");
        return dispatchToLobeAsync(fullTask, {
          source: "xiaoqinglong-lobe-dispatch",
          context: context || "兼容旧缓存入口；直接异步交给 Lobe 默认大脑。",
          priority: "normal",
        });
      },
    );

    server.tool(
      "desktop_type_text",
      "把一段文字输入到当前光标所在的输入框。适合让小智把语音转写内容直接写进当前应用。",
      {
        text: z.string().describe("要输入到当前输入框的文字"),
      },
      async ({ text }) => pasteTextToActiveInput(text),
    );

    server.tool(
      "desktop_open_doubao_input",
      "打开豆包输入法或豆包应用，方便用户开始语音转写。",
      {},
      async () => openFirstApp(["豆包输入法", "豆包"]),
    );

    server.tool(
      "jarvis_open_workbench",
      "打开预设工作台。支持：赚钱项目、小智控制台、知识库、今日工作。",
      {
        name: z.string().describe("工作台名称，例如 赚钱项目、知识库、今日工作"),
      },
      async ({ name }) => {
        const benchName = name.trim();
        const urls = workbenches[benchName];
        if (!urls) {
          return {
            content: [{ type: "text", text: `没有这个工作台：${benchName}` }],
            isError: true,
          };
        }
        return openMany(urls);
      },
    );

    server.tool(
      "desktop_open_url",
      "在默认浏览器中打开网页。",
      {
        url: z.string().describe("要打开的网址，例如 https://openai.com 或 xiaozhi.me"),
      },
      async ({ url }) => run("open", [normalizeUrl(url.trim())]),
    );

    server.tool(
      "desktop_run_shortcut",
      "运行 Mac 快捷指令。只允许运行预先加入白名单的快捷指令。",
      {
        name: z.string().describe("快捷指令名称"),
      },
      async ({ name }) => {
        const shortcutName = name.trim();
        if (!allowedShortcuts.has(shortcutName)) {
          return {
            content: [{ type: "text", text: `快捷指令不在白名单中：${shortcutName}` }],
            isError: true,
          };
        }
        return run("shortcuts", ["run", shortcutName]);
      },
    );

    server.tool(
      "desktop_note",
      "把一段文字追加到本地小智桌面记录文件。",
      {
        text: z.string().describe("要记录的文字"),
      },
      async ({ text }) => {
        const file = path.join(__dirname, "xiaozhi-notes.txt");
        const line = `[${new Date().toISOString()}] ${text.trim()}\n`;
        await fs.appendFile(file, line, "utf8");
        return { content: [{ type: "text", text: "已记录到本地小智桌面记录。" }] };
      },
    );

    server.tool(
      "jarvis_add_task",
      "把待办任务追加到本地小智任务列表。",
      {
        task: z.string().describe("要记录的任务"),
      },
      async ({ task }) => {
        const file = path.join(__dirname, "xiaozhi-tasks.md");
        const line = `- [ ] ${task.trim()} (${new Date().toLocaleString("zh-CN")})\n`;
        await fs.appendFile(file, line, "utf8");
        return { content: [{ type: "text", text: "已加入本地任务列表。" }] };
      },
    );

    server.tool(
      "jarvis_add_spoken_task",
      "把小智听到的一句话整理成任务，追加到本地小智任务列表。",
      {
        text: z.string().describe("小智语音识别到的任务内容"),
      },
      async ({ text }) => {
        const task = text.trim().replace(/^把|加入任务列表$/g, "").trim();
        if (!task) {
          return {
            content: [{ type: "text", text: "没有识别到任务内容。" }],
            isError: true,
          };
        }
        const file = path.join(__dirname, "xiaozhi-tasks.md");
        const line = `- [ ] ${task} (${new Date().toLocaleString("zh-CN")}，语音)\n`;
        await fs.appendFile(file, line, "utf8");
        return { content: [{ type: "text", text: `已把语音任务加入列表：${task}` }] };
      },
    );

    server.tool(
      "jarvis_short_write",
      "把小智听到的一段短写文字保存到本地记录，也可同时粘贴到当前输入框。",
      {
        text: z.string().describe("要短写或转写的文字"),
        paste: z.boolean().optional().describe("是否同时输入到当前光标所在输入框"),
      },
      async ({ text, paste }) => {
        const content = text.trim();
        if (!content) {
          return {
            content: [{ type: "text", text: "没有识别到短写内容。" }],
            isError: true,
          };
        }
        const file = path.join(__dirname, "xiaozhi-short-writes.md");
        await fs.appendFile(file, `## ${new Date().toLocaleString("zh-CN")}\n${content}\n\n`, "utf8");
        if (paste) return pasteTextToActiveInput(content);
        return { content: [{ type: "text", text: "已保存短写文字。" }] };
      },
    );

    server.tool(
      "jarvis_dispatch_spoken_text",
      "根据小智听到的话分发动作。mode=task 加入任务，mode=note 保存短写，mode=type 输入到当前输入框。",
      {
        text: z.string().describe("小智语音识别到的内容"),
        mode: z.string().describe("处理方式：task、note 或 type"),
      },
      async ({ text, mode }) => {
        const normalizedMode = mode.trim().toLowerCase();
        if (normalizedMode === "task") {
          const file = path.join(__dirname, "xiaozhi-tasks.md");
          await fs.appendFile(file, `- [ ] ${text.trim()} (${new Date().toLocaleString("zh-CN")}，语音)\n`, "utf8");
          return { content: [{ type: "text", text: "已加入语音任务列表。" }] };
        }
        if (normalizedMode === "note") {
          const file = path.join(__dirname, "xiaozhi-short-writes.md");
          await fs.appendFile(file, `## ${new Date().toLocaleString("zh-CN")}\n${text.trim()}\n\n`, "utf8");
          return { content: [{ type: "text", text: "已保存为短写文字。" }] };
        }
        if (normalizedMode === "type") return pasteTextToActiveInput(text);
        return {
          content: [{ type: "text", text: "mode 只支持 task、note、type。" }],
          isError: true,
        };
      },
    );

    server.tool(
      "jarvis_show_tasks",
      "查看本地小智任务列表。",
      {},
      async () => {
        const file = path.join(__dirname, "xiaozhi-tasks.md");
        const text = await readIfExists(file);
        return {
          content: [{ type: "text", text: text.trim() || "当前没有本地任务。" }],
        };
      },
    );

    server.tool(
      "xiaoqinglong_assign_ai_task",
      "小青龙把任务分配给电脑上的 AI 执行者，并记录到本地执行队列。支持 Codex、Claude Code、Lobe AI。",
      {
        worker: z.string().describe("AI 执行者：codex、claude-code、lobe"),
        title: z.string().describe("要执行的任务标题"),
        notes: z.string().optional().describe("任务补充说明或验收标准"),
      },
      async ({ worker, title, notes }) => assignAiTask(worker, title, notes || ""),
    );

    server.tool(
      "xiaoqinglong_show_ai_tasks",
      "查看小青龙分配给 Codex、Claude Code、Lobe AI 的任务队列和结果。",
      {
        status: z.string().optional().describe("可选状态过滤，例如 assigned、running、done、blocked"),
      },
      async ({ status }) => showAiTasks(status || ""),
    );

    server.tool(
      "xiaoqinglong_update_ai_task",
      "更新小青龙 AI 执行队列里的任务状态和结果。",
      {
        id: z.string().describe("任务 ID，例如 AI-001"),
        status: z.string().describe("状态，例如 assigned、running、done、blocked"),
        result: z.string().optional().describe("执行结果、链接、文件或阻塞原因"),
      },
      async ({ id, status, result }) => updateAiTask(id, status, result || ""),
    );

    server.tool(
      "desktop_system_status",
      "查看本机电脑性能、硬件、CPU、内存、磁盘和占用靠前的进程。只读取状态，不做任何修改。",
      {},
      async () => {
        const text = await buildSystemStatus();
        return { content: [{ type: "text", text }] };
      },
    );

    server.tool(
      "desktop_memory_optimize",
      "轻量释放电脑内存。只请求 macOS 回收可释放缓存，并返回优化前后状态；不会关闭应用，不会删除文件。",
      {},
      async () => {
        const text = await lightMemoryOptimize();
        return { content: [{ type: "text", text }] };
      },
    );

    server.tool(
      "jarvis_money_brief",
      "读取 Obsidian 导入文档里的赚钱项目简报和推荐执行顺序。",
      {},
      async () => {
        const file = path.join(
          __dirname,
          "obsidian-vault-for-xiaozhi.md",
        );
        const text = await readIfExists(file);
        if (!text) {
          return {
            content: [{ type: "text", text: "还没有找到 Obsidian 导入文档。" }],
            isError: true,
          };
        }
        const summary = extractSection(text, "## 总览");
        const order = extractSection(text, "## 推荐执行顺序");
        return {
          content: [
            {
              type: "text",
              text: [summary, order].filter(Boolean).join("\n\n") || "没有找到赚钱项目简报。",
            },
          ],
        };
      },
    );


    server.tool(
      "lobe_ai_agent",
      "把明确要求交给 Lobe AI、小青龙或 LobeHub Agent 的用户任务转交给 LobeHub 的 Hermes · 小青龙 智能体处理。适合复杂推理、知识库、插件和跨工具调度；回答应简洁适合语音播报。",
      {
        prompt: z.string().describe("要交给 Lobe AI Agent 处理的完整用户问题或任务"),
        agentId: z.string().optional().describe("可选 LobeHub Agent ID；默认使用小青龙总控智能体"),
      },
      async ({ prompt, agentId }) => runLobeAgent(prompt, agentId || defaultLobeAgentId),
    );

    server.tool(
      "lobe_ai_status",
      "检查 LobeHub CLI 和设备网关是否可连接。",
      {},
      async () => run(lobeCliPath, ["status", "--timeout", "5000"]),
    );

    server.tool(
      "jarvis_obsidian_search",
      "在本机 Obsidian Vault 白名单目录中搜索 Markdown 笔记。",
      {
        query: z.string().describe("要搜索的关键词，例如 赚钱项目、Upwork、今日计划"),
      },
      async ({ query }) => searchObsidian(query),
    );

    server.tool(
      "jarvis_refresh_obsidian_snapshot",
      "刷新桥接器里的 Obsidian 快照，供小智本机工具读取最新笔记。",
      {},
      async () => {
        const snapshot = await buildObsidianSnapshot();
        const file = path.join(__dirname, "obsidian-vault-for-xiaozhi.md");
        await fs.writeFile(file, snapshot, "utf8");
        return { content: [{ type: "text", text: "Obsidian 快照已刷新。" }] };
      },
    );
  },
};
