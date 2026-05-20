# 小青龙语音助手

小青龙语音助手是一个本地优先的 macOS 语音执行桥：小智负责语音入口，Hermes / LobeHub 负责深度推理和本机工具调度，Mission Control 控制台负责查看链路状态、队列、日志和手动测试。

这个开源版只包含源码、示例配置和安全边界说明，不包含任何个人日志、任务记录、密钥、Agent ID 或本机私有路径。

## 能做什么

- 连接小智 MCP WebSocket，把语音指令转成本机工具调用。
- 通过 LobeHub CLI 调度本地 Agent。
- 提供豆包 ASR 前门健康检查、Lobe 连接检查和 Mission Control 聚合接口。
- 提供浏览器控制台查看语音链路、任务队列、Watchdog、MCP 调用和高风险审批。
- 默认使用安全白名单控制本机应用、菜单、快捷动作和 Obsidian 检索。

## 组件

| 文件 | 作用 |
| --- | --- |
| `desktop-tools.js` | 小智 MCP 工具集合，负责本机动作、任务创建和 Lobe 调度入口 |
| `doubao-asr-frontdoor.js` | 诊断与 Mission Control API，端口默认 `43173` |
| `lobe-dispatch-worker.js` | 后台执行单个 Lobe 任务 |
| `control-panel-server.js` | 控制台静态服务，端口默认 `43174` |
| `control-panel/` | Mission Control 前端 |
| `run-bridge.sh` | 启动小智 MCP 桥 |
| `ensure-lobehub-connect.sh` | 检查并拉起 LobeHub Local Device 连接 |

## 快速开始

```bash
npm install
cp .env.example .env
open .env
```

至少填写：

```text
XIAOZHI_MCP_WS -> <your_xiaozhi_mcp_websocket_url>
DOUBAO_ASR_API_KEY -> <your_doubao_asr_api_key>
LOBE_AGENT_ID -> <your_lobehub_agent_id>
XIAOQINGLONG_API_TOKEN -> <set_a_long_random_local_token>
```

启动前门：

```bash
npm run start:frontdoor
```

启动控制台：

```bash
npm run start:panel
```

打开控制台：

- http://127.0.0.1:43174
- http://127.0.0.1:43173/health
- http://127.0.0.1:43173/api/mission-control

连接小智 MCP：

```bash
npm run start:bridge
```

## 配置

所有敏感信息都通过 `.env` 或环境变量提供，不要提交到 Git。

| 变量 | 说明 |
| --- | --- |
| `XIAOZHI_MCP_WS` | 小智控制台提供的 MCP WebSocket 地址 |
| `DOUBAO_ASR_API_KEY` | 豆包 ASR API Key |
| `LOBE_CLI_PATH` | LobeHub CLI 路径，留空时使用 macOS 默认路径 |
| `LOBE_AGENT_ID` | 负责执行任务的 Lobe Agent ID |
| `LOBE_AGENT_NAME` | 控制台展示的 Agent 名称 |
| `XIAOQINGLONG_API_TOKEN` | 本机控制台执行重启、清队列、注入测试等受控操作时使用的 Header Token |
| `OBSIDIAN_VAULT_PATH` | 可选，Obsidian Vault 路径 |

## 安全边界

- 项目不会自动上传本地日志、任务记录或个人记忆。
- `.env`、日志、任务队列、截图和备份文件默认被 `.gitignore` 排除。
- `POST /api/action` 默认要求 `X-API-Token`，Token 来自 `.env` 的 `XIAOQINGLONG_API_TOKEN`。
- 高风险操作应由控制台审批后再执行。
- 默认白名单限制了可打开、可关闭和可操作的本机应用。
- 在终端窗口处于焦点时谨慎使用语音粘贴能力，避免误把转写文本当作命令执行。

## 开发检查

```bash
npm test
node scripts/smoke-test.js
```

## 开源状态

当前版本是本地桥接和诊断控制台的开源起点。真实运行前，需要你在本机填入自己的小智、豆包 ASR 和 LobeHub 配置。
