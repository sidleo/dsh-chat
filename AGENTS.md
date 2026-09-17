# dsh-chat 项目规范

把聊天软件接入 DeepSeek Harness（DSH）的插件工作区。**一切皆插件**：`dsh-chat` 只做管理入口与共享内核，每种聊天软件是独立渠道插件；新增聊天软件 = 新增一个包，`dsh-chat` 零改动。

## 架构不变量（改代码前先读这一节）

1. **渠道包不得 `import` hub 包**。共享能力一律经运行期服务传递（host 侧 `dshChat`、client 侧 `chatChannels`/`chatUi`）。`npm run check` 会强制这一条。
2. **契约版本对账**：渠道在 `apply()` 里比对 `ctx.dshChat.contractVersion`，不匹配就抛出可读错误。破坏性改动才递增 `CONTRACT_VERSION`（在 `packages/dsh-chat/shared/contract.mjs`）。
3. **数据与凭据零迁移**：沿用上游目录与凭据引用名（`~/.dsh/integrations/dsh-feishu`、`dsh-weixin`、`.credentials.yaml` 里的 `DSH_FEISHU_APP_SECRET_<HASH>` / `DSH_WEIXIN_BOT_TOKEN_<HASH>`）。改这些名字 = 用户要重新扫码/重新填 Secret，**不要动**。
4. **渠道无关的逻辑放 hub**：命令、访问策略、上下文增强、会话桥、每机器人设置、投递——实现一次，所有渠道复用。渠道只做协议、平台概念（话题回复、过程展示、扫码）和自己的设置页。
5. **失败必须可见**：任何异常都要 → 日志 + 用户可见回复 + 落盘（`lastError`）。**绝不静默**——"发了没反应"是最难排查的故障形态，本项目已经栽过两次。
6. **静默丢弃必须打日志**：门禁挡下的消息、群聊未 @ 的消息，都要留下可检索的日志。
7. **容错归一化按保守方向补齐**，不要判成"谁都进不来"/"谁都放行"。残缺的历史配置不能让机器人锁死或裸奔。
8. **互斥**：`@xmanrui/dsh-im` 与本插件不能同时启用（同一批凭据会双连，表现为双份回复或消息随机分流）。
9. **平台 id 是应用维度的**：同一个用户在不同飞书应用里 `open_id` 不同，属主/白名单必须按"该应用的 id"存。

## 目录结构

```
packages/dsh-chat/             Hub：设置页入口 + 渠道注册表 + 共享内核（命令/策略/上下文增强/会话桥/设置）
  shared/                      浏览器安全：契约、上下文增强引擎、访问策略、渠道 rail
  host/                        Node：plugin、registry、rpc、bot-settings、session-store、sessions、commands、delivery、tools、interactions、json-store
  client/                      浏览器：设置页 section、共享 UI 组件与 hook
packages/dsh-chat-feishu/      飞书渠道（Lark SDK 长连接）
packages/dsh-chat-weixin/      微信渠道（iLink 协议：扫码登录 + 长轮询，仅私聊）
packages/dsh-chat-fixture/     契约验证假渠道（不发布）
CONTRACT.md                    **新渠道作者唯一需要读的文档**
UPSTREAM.md                    与上游 dsh-im 的对照关系、移植范围与出处
```

## 常用命令

```bash
npm run build   # esbuild 打 host（ESM）+ client（DSH 模块加载器包装），产物在各自 lib/
npm test        # node --test，覆盖契约/引擎/渠道/命令/策略
npm run check   # build + test + 打包自检（含"渠道不得 import hub"与互斥检查）
DSH_CHAT_PROFILE_MANIFEST=~/.dsh/profiles/web/package.json npm run check   # 额外检查双绑
```

## 上线与排查

- **装/卸**：`dsh plugin --profile web add <包绝对路径>` / `remove <包名>`。改 host 代码必须**重启 dsh**；改 client 代码刷新页面即可。
- **逐账号状态**：`POST /api/dsh-chat/<channel>` 方法 `connection.status`（或渠道服务 `dshChat.channels.call`）。返回每个机器人的 `state/connected/handled/lastHandledAt/errorMessage`。
- **排查顺序**：① `~/.dsh/integrations/dsh-chat/logs/<渠道>.log`（hub 统一落盘，含 `[dsh-chat-*]` 全部 warn/error，>2MB 轮转） → ② `state.json` 的 `lastError` → ③ 会话日志（`~/.dsh/sessions/<cwd>/<sessionId>/session.v3.jsonl.zstd`，zstd 多帧拼接）→ ④ 终端输出。
- **隔离调试**：`config.channelDataDirs` 可把渠道数据目录指到临时目录，避免用真实凭据建长连接；覆盖时**不做**旧设置导入。
- **飞书卡片按钮没反应**：按"事件到没到"分三步查——
  ① 重启时带 `DSH_CHAT_FEISHU_SDK_LOG=debug`（SDK 日志会进 `logs/feishu.log`），点一次按钮后看日志：
  出现 `收到卡片回调` = 事件到了（查路由/解析）；只有 SDK 的 `receive message … type: event` 而没有它 = 到了但不是卡片回调；
  一条新帧都没有 = 飞书没有往这条长连接推（开放平台的回调订阅未生效、应用版本未发布，或回调配置的是"请求地址"而非长连接）。
  ② 后台确认：事件与回调 → 回调里有 `card.action.trigger`，订阅方式为**长连接**，且**应用版本已发布**。
  ③ 兜底：无论回调是否可用，"直接回复选项文字"始终有效（两条路共用同一条认领逻辑）。
- **"回合跑完但用户没收到"怎么查**：在日志里对齐四行——hub 的 `发送提示词` → hub 的 `回合结束` → 渠道的 `回合结束，准备回复` → 渠道的 `最终答案投递方式`。
  第 2 行有、第 3 行没有 = 结果没交回渠道（`ask()` 的返回路径被卡住：关流或提示词收据永不落地，二者都必须有界，见 `sessions.mjs`）；
  第 3 行有、第 4 行是 `failed` = 呈现层发不出去（会同时写进 `connection.status.lastError`）。

## 阶段与进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | 三包骨架、契约与 RPC 闭环、设置页入口 | ✅ |
| P1 | 共享内核：会话桥、旧设置导入、上下文增强 UI、共享组件 | ✅ |
| P2 | 飞书渠道：长连接、私聊/群聊、任务过程展示分私聊/群聊、设置页 | ✅ 真实机器人验证通过 |
| P3 | 微信渠道：iLink 协议、扫码登录、私聊收发 | ✅ 真实账号验证通过 |
| P4 | 命令内核 + 访问策略 | ✅（菜单卡片、批量输入、压缩待做） |
| P5 | 富媒体（图片/文件）与主动投递 | 主动投递文本+出站文件/图片（飞书）、飞书入站图片+入站文件已通；人在环回传已通且**飞书用按钮卡片交互**（点一下即回答，不再卡流程）；未做：微信收图、微信出站文件 |
| P6 | 平台化：会话渠道标识、更新面板、i18n 完整化 | 待开始 |

## 工作方式

- **目标驱动**：每个阶段有可验证的成功标准；改完必须 `npm run check` 全绿，并尽量在真实机器人/账号上验证一次。
- **外科手术式改动**：只动与当前任务相关的地方；发现无关问题先记录、不擅自改。
- **提交粒度**：一个阶段/一个修复一个 commit，提交信息写清"改了什么 + 为什么"。
- **移植外部代码**：必须标明出处与 MIT 声明（见 `THIRD_PARTY_NOTICES.md`），收窄接口面，并在文件头写清移植范围。

## 多工具指令文件（软链接约定）

| 文件 | 类型 | 读取方 |
|---|---|---|
| `AGENTS.md` | **实际文件（唯一内容来源）** | pi / Codex / Trae / ZCode |
| `CLAUDE.md` | 软链接 → `AGENTS.md` | Claude Code |
| `CODEBUDDY.md` | 软链接 → `AGENTS.md` | Workbuddy |

软链接用**相对路径**，保证 git 可移植：`ln -s AGENTS.md CLAUDE.md`。
