# 上游参考

本仓库是**从零实现**，不是 fork。架构与行为规范参考了
[`xmanrui/dsh-im`](https://github.com/xmanrui/dsh-im)（MIT，v4.21.1），用于确认"一个可用的
IM ↔ DSH 桥接需要哪些能力、数据放在哪里、边界怎么划"。

## 参考的对照关系

| dsh-im | 本仓库 | 说明 |
|---|---|---|
| 单体包 `@xmanrui/dsh-im`（11 渠道） | `dsh-chat` + 每渠道一个包 | 拆成 hub + 渠道插件，新增渠道不改 hub |
| `src/channels/{feishu,weixin,shared}` | `packages/dsh-chat-*/host`、`packages/dsh-chat/shared` | 重新实现 |
| `plugin-src/host`、`plugin-src/client` | `host/`、`client/` + 根 `scripts/build-*.mjs` | 重新实现（esbuild 双端打包方式一致） |
| `src/channels/shared/context-enhancement.mjs` | `packages/dsh-chat/shared/context-enhancement.mjs` | **重新设计**：在群聊/私聊全局之上增加"指定用户/指定群 + 是否叠加全局提示词" |
| `src/channels/shared/im-source-guidance.mjs` | `packages/dsh-chat/host/guidance.mjs` | 同一机制：提示词按会话发布为动态提示词上下文 |
| `workspaces.json`（每渠道一份） | `dsh-chat/bots.json`（hub 统一持有）+ 一次性导入 | 渠道无关设置收归 hub |
| 飞书 `stepPush` + `stepPushMode`（机器人级） | 飞书 `stepPushDirect` / `stepPushGroup` | 拆成私聊/群聊两份独立设置 |

注入标签沿用 `<dsh_im_source>` / `<dsh_im_source_guidance>`，以保持既有会话历史的可读性与
前缀解析的一致性。

## 计划移植（MIT，保留版权与出处）

| 内容 | 阶段 | 原因 |
|---|---|---|
| 微信 iLink 协议客户端（扫码登录、长轮询、发消息、输入状态） | P3 ✅ | 协议无公开文档，只能按参考实现的协议行为重写客户端；已收窄到私聊文本链路，文件头注明出处（图片/文件的 AES 与 CDN 上传留到 P5） |
| ~~`@larksuiteoapi/node-sdk@1.73.0` WSClient 生命周期构建期补丁~~ | — | **不移植**：改为让 SDK 永远不走那条有缺陷的路径——网关显式传 `handshakeTimeoutMs: 0`（该超时路径会先摘掉 socket 的全部 error 监听再 terminate，随后任何 error 都会变成未捕获异常），握手超时与重连由 `lark-gateway.mjs` 自己用 Promise.race + 丢弃旧 WSClient 实现。少一处需要跟着 SDK 版本维护的源码补丁 |

| 飞书「扫码接入」（应用注册：`registerApp` 一次性授权链接 → 自动创建应用并拿到凭据） | P7 ✅ | **收窄重写**（`packages/dsh-chat-feishu/host/provision.mjs`）：同一套状态（starting/qr_ready/polling/slow_down/domain_switched/saving/succeeded/expired/cancelled/error）、同一个 SDK 入口与同样的"Secret 只经回调交出去、不进状态"；只做**新建**，不做上游那条"用扫码给已有应用增量补权限"（`repair-manager.mjs`）。二维码在上游由 `qrcode` 编码成 data URL，我们沿用同一条路 |
| 接入机器人的**两种方式**（扫码新建 / 手动填 App ID + App Secret） | P7 ✅ | 上游客户端是"扫码接入机器人" + 可展开的"手动接入"；我们做成渠道页上的两条路。**属主**沿用上游口径：扫码返回的 `user_info.open_id` 就是属主、`user_info.tenant_brand` 决定域名；手动那条路属主可留空（留空 = 没有属主，接入后把私聊放宽到「任何人可用」，让属主先聊上第一句） |
| 超时后的延迟交付（deferred delivery） | P5⁺ ✅ | **收窄重写**（`packages/dsh-chat/host/deferred.mjs`，未逐行移植）：沿用"超时只登记、之后有界复查、拿到结果补发"的思路与"不承诺恰好一次"的语义，复查节奏与字段形状按本仓库定；probe 由 hub 提供（`probeTurn`），渠道只注册 `deliver` |

移植进来的文件必须在文件头写明来源与 MIT 许可，并在 `THIRD_PARTY_NOTICES.md` 登记。

## 参考过的具体实现（逐条对照）

| 本仓库 | dsh-im 出处 | 对照点 |
|---|---|---|
| `packages/dsh-chat-feishu/host/panel-card.mjs` | `src/channels/feishu/feishu-cards.mjs` 的 `menuCard` / `modelCard` / `button` / `initialIndex`（commit `34a370b`） | 可交互控制卡：`schema:'2.0'` + `select_static` + `behaviors:[{type:'callback',value:{action}}]` 让下拉选中即回调；`initial_index` 是 **1 起**、`options` 上不能写 `selected`（会报 230099）——这两条都是他们踩出来的 |
| 同上 | `src/channels/feishu/bridge.mjs` 的 `onCardAction`（`_pick` 归一化） | 单选值在 `action.option`、多选在 `action.options`（可能是逗号串）、有的版本在 `form_value[组件名]`；我们把三种都归一化进 `action.options` |
| `bridge.mjs` 的 `commandAccessFor` | 同上 `evaluateInboundAccess(..., isCommand: true)` | **卡片动作与手打同一条命令门禁**；提问/审批按钮是交互回传、不走命令门禁 |
| `packages/dsh-chat/host/panel.mjs` | `bridge.mjs` 的 `#handleModelSelect` / `#switchWorkspace` / `#bindSession` | 语义分层：模型/推理是会话级、工作区/预设是机器人级（只对新会话生效） |
| `packages/dsh-chat/host/deferred.mjs` | `src/channels/shared/deferred-delivery.mjs`（思路） | 超时 ≠ 结束：把"待交付"落盘、有界复查、空闲且有正文才补发；会话没了/换绑/超时上限即作废。我们收窄成"probe 由 hub 给、渠道只注册 deliver"，并明确写出**不承诺恰好一次** |

不移植的部分：dsh-im 用内存 `#cardKeys`（messageId → 会话）做路由，重启后旧卡提示"菜单已过期，
请回复 /m 重开"；我们从回调里的 chatId + operator 反推会话键，**重启后卡片仍可用**。

## 上游功能对照（2026-09-20 调研 `xmanrui/dsh-im` main）

按「上游有、我们没有、且与我们现有飞书插件不冲突」逐条过了一遍，结果分三类。

**这一轮对齐的（都已实现 + 测试）**

| 上游 | 我们 | 说明 |
|---|---|---|
| Issue #112「多 step 回答只剩最后一段」 | `sessions.mjs` 的 `turn/end` | 一轮里每个 step 各有一条定稿 `assistant/message`，最终答案改为**全部拼接**（空行分隔、相邻重复去重） |
| Issue #192「模型失效自救」 | `sessions.mjs` 的 `recoverUnavailableModel` | 识别 `session/model-unavailable`，切回可用模型（优先 Host 默认）并重试一次，答案前加一行说明 |
| 「入站图片在非视觉模型下回退为文件」 | `sessions.ask()` 的图片回退（`imagesAsFiles`） | 拒绝信号与文案沿用上游（`MODEL_DOES_NOT_SUPPORT_IMAGES`），但降级目标改为"本会话的文件"而不是自写工作区文件——复用已验证的 `uploadFile` 通道；转换失败**原样抛**，不静默丢图片 |
| Issue #106「引用/回复消息」 | `shared/reply-reference.mjs` + 飞书 `getMessageText` | 用户引用一条消息再提问时，被引用正文一起进提示词；读不到只加"引用内容不可用"标记，不丢当前问题 |
| Issue #188「机器人别名」 | 已有等价物 | 飞书自身的机器人名 + 我们设置页的机器人卡片，不再单做一层别名 |
| `stepPush` 过程展示 | 设置页已有，这一轮又搬进**聊天面板** | 走新加的「渠道自带面板字段」契约（`panel.fields` / `panel.apply`），hub 不认渠道语义 |
| Issue #61「npm 更新检查」 | **不适用** | 我们是按路径安装的本地工作区，不是 npm 包；已有「版本与更新」面板显示版本与更新方式 |
| `inbound-ttl`（入站临时文件清理） | **不适用** | 我们的入站媒体直接在内存里上传给 Host，不落临时文件 |
| 其余渠道（钉钉/企微/QQ/Slack/Telegram/Discord/WhatsApp/Email/iMessage） | 不在范围 | 本仓库只有飞书 + 微信两个渠道 |

**看过但决定先不做的（记在这里，等用户决定）**

| 上游 | 为什么先不做 |
|---|---|
| ~~「入站图片在非视觉模型下回退为文件」~~ | **已对齐**（P5⁺⁺）：不查模型目录，改用 Host 自己的拒绝信号——`session/prompt` 抛 `session/attachment-invalid` + `details.reason = MODEL_DOES_NOT_SUPPORT_IMAGES` 时，`sessions.ask()` 把图片块上传成同一会话的文件（`{type:'file',receiptId}`）重试一次，并补一段模型侧说明（"不要假设自己能直接看到图片内容"）。上游是自己写工作区文件，我们复用已有的 `uploadFile` 通道 |
| `session-reply-recovery`（流中断后从历史补回答案） | 我们的失败路径已经有界（`stream-ended` 会如实返回空并留日志），要从历史补回就必须可靠区分"这一轮"与"上一轮"，判错会把上一轮答案当成本轮结果——风险大于收益 |

## 行为比对流程

同一批机器人凭据与同一批数据目录可以同时被两边读取（但**不能同时运行**）。

1. `dsh plugin --profile <profile> remove dsh-chat dsh-chat-feishu dsh-chat-weixin`
2. `dsh plugin --profile <profile> add @xmanrui/dsh-im`，重启 dsh
3. 复现问题 → 记录实际行为
4. 切回本仓库重装，逐项对齐

数据格式保持兼容，因此切换不需要重新扫码或重新填 Secret。
