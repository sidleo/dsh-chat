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
                               （bot-shared-settings.js = 工作区/Agent 预设/访问策略三块，
                                 delivery-targets.js = 主动投递，context-enhancement.js = 上下文增强）
packages/dsh-chat-feishu/      飞书渠道（Lark SDK 长连接）
packages/dsh-chat-weixin/      微信渠道（iLink 协议：扫码登录 + 长轮询，入站媒体解密，仅私聊）
packages/dsh-chat-fixture/     契约验证假渠道（不发布）
scripts/check-layout.mjs       布局守门：真实组件在 549/360/320px 下渲染并断言不溢出、不逐字竖排
scripts/layout-fixture.mjs     上面那个守门的页面入口（headless Chrome 里跑，用 flushSync 同步提交）：
                               共享组件 + **整张飞书/微信渠道卡** + hub 整页（页头两个入口、左栏、机器人列表），
                               交互态（改名输入、展开日志尾部、展开诊断/版本面板）靠 aria-expanded 只展开不收起
CONTRACT.md                    **新渠道作者唯一需要读的文档**
UPSTREAM.md                    与上游 dsh-im 的对照关系、移植范围与出处
```

## 常用命令

```bash
npm run build   # esbuild 打 host（ESM）+ client（DSH 模块加载器包装），产物在各自 lib/
npm test        # node --test，覆盖契约/引擎/渠道/命令/策略
npm run check        # build + test + 打包自检（含"渠道不得 import hub"与互斥检查）+ 布局守门
npm run check:layout # 只跑布局守门：真实组件在 549/360/320px 下渲染，断言不溢出、不逐字竖排
DSH_CHAT_PROFILE_MANIFEST=~/.dsh/profiles/web/package.json npm run check   # 额外检查双绑
```

## 上线与排查

- **装/卸**：`dsh plugin --profile web add <包绝对路径>` / `remove <包名>`。改 host 代码必须**重启 dsh**；改 client 代码刷新页面即可。
- **逐账号状态**：`POST /api/dsh-chat/<channel>` 方法 `connection.status`（或渠道服务 `dshChat.channels.call`）。返回每个机器人的 `state/connected/handled/lastHandledAt/errorMessage`。
- **排查顺序**：① `~/.dsh/integrations/dsh-chat/logs/<渠道>.log`（hub 统一落盘，含 `[dsh-chat-*]` 全部 warn/error，>2MB 轮转） → ② `state.json` 的 `lastError` → ③ 会话日志（`~/.dsh/sessions/<cwd>/<sessionId>/session.v3.jsonl.zstd`，zstd 多帧拼接）→ ④ 终端输出。
- **界面样式改完**：跑 `npm run check`（含布局守门）。窄栏下的两类问题是"构建通过、单测全绿、
  真机才炸"——① 中文被 flex 压成一字一行（`min-content` 只有一个字）；② `flex: none` 打在
  `width: 100%` 的下拉框上、或打在操作块上（内容再宽也不缩），把同排按钮挤出容器、整页横向滚动。
  守门失败会指出是哪个元素伸出去的，**并且覆盖整张渠道卡与 hub 页头**——"只测共享组件"曾经
  漏掉 hub 页头在 320px 下溢出 15px 这种问题。
- **隔离调试**：`config.channelDataDirs` 可把渠道数据目录指到临时目录，避免用真实凭据建长连接；覆盖时**不做**旧设置导入。
- **飞书卡片按钮没反应**：按"事件到没到"分三步查——
  ① 重启时带 `DSH_CHAT_FEISHU_SDK_LOG=debug`（SDK 日志会进 `logs/feishu.log`），点一次按钮后看日志：
  出现 `收到卡片回调` = 事件到了（查路由/解析）；只有 SDK 的 `receive message … type: event` 而没有它 = 到了但不是卡片回调；
  一条新帧都没有 = 飞书没有往这条长连接推（开放平台的回调订阅未生效、应用版本未发布，或回调配置的是"请求地址"而非长连接）。
  ② 后台确认：事件与回调 → 回调里有 `card.action.trigger`，订阅方式为**长连接**，且**应用版本已发布**。
  ③ 兜底：无论回调是否可用，"直接回复选项文字"始终有效（两条路共用同一条认领逻辑）。
- **回合被判定超时怎么查**：兜底看的是**静默时长**（默认 15 分钟没有任何事件），不是整轮总时长；
  绝对上限 2 小时只防死循环（见 `sessions.mjs` 的 `TURN_IDLE_TIMEOUT_MS` / `TURN_TOTAL_TIMEOUT_MS`）。
  先看会话日志里那个 turn 的 `turn/start` 与 `turn/end` 的 `time`（毫秒）：相差很小且 reason=interrupted
  = 被我们中断；再数一下这轮的事件密度与最长工具耗时——**帧一直在来就不该判超时**，
  所以出现 timeout 只可能是"流真的不再产出"，那要往 DSH/长连接/单个工具挂死方向查。
- **"回合跑完但用户没收到"怎么查**：在日志里对齐四行——hub 的 `发送提示词` → hub 的 `回合结束` → 渠道的 `回合结束，准备回复` → 渠道的 `最终答案投递方式`。
  第 2 行有、第 3 行没有 = 结果没交回渠道（`ask()` 的返回路径被卡住：关流或提示词收据永不落地，二者都必须有界，见 `sessions.mjs`）；
  第 3 行有、第 4 行是 `failed` = 呈现层发不出去（会同时写进 `connection.status.lastError`）。
- **模型/推理相关都对不上时先查这两个字段名**（照着 `session/modelCatalog` 的 schema 读）：
  ① provider 在 **`groups[].id`**（不是 `provider`/`providerId`）——读错会一个选项都拼不出来，
  真机表现是控制面板写「当前 Host 没有可用模型」、`/models` 印 `undefined/xxx`；
  ② 当前模型在 **`projections.values.modelSelection.next`**（不是顶层 `provider/model`，也不是 `lastUsed`）
  （读**失败**与"没选过"也是两回事：面板状态里 `model.selectionFailed` 为真、`/model` 会回「读不到」，
  别把读失败显示成"跟随 Host 默认"）
  —— `next = pending ?? lastUsed`，而 `selectModel` 只写 `pending`；读 `lastUsed` 会把"刚切完的模型"
  显示成旧的、并在改推理等级时把模型静默改回去（官方 UI 读的也是 `next`）。
  `session/modelCatalog` 的 args 是 `{}`（不需要 `_request`）。
- **"为什么要先发一条消息才能改模型"**：DSH 的模型选择**是会话级的**——
  `session/create` 的参数里没有模型（只有 `workspaceId/cwd/sessionId/agentPreset`），
  `session/selectModel` 又必须带 `sessionId`；而我们的会话是"第一条消息"时才建的。
  所以未绑定时 `/model`、`/reasoning` 与面板下拉改的是**机器人默认模型**（`record.model`，
  形状 `{provider,model,reasoningEffort}`，兼容旧 `{providerId,modelId}`），
  由 `sessions.ensure()` 建完会话立刻应用——与预设/工作区同一条口径（只对新会话生效、只限属主）。
- **卡片"闪一下又变回原样"怎么查**（日志里那次 update 还是成功的，只看日志会误判）：
  飞书客户端在**回调应答落地时会把卡片还原成"点击前"的快照**——所以对卡片的更新必须排在
  应答**之后**（延迟更新接口就是为这个设计的）。桥里统一走 `afterResponse(...)` 排期
  （`deps.scheduleAfterResponse` 可注入，测试用它断言"应答前一次都没更新"）。
  症状：卡片先显示新内容、随后回到点击前；日志里 `已就地更新（token 路径 …）` 却是成功的。
- **卡片下拉点了没反应怎么查**：先看 `logs/feishu.log` 里那行 `收到卡片回调 … 原始=`——
  原始体里有 `action.option`（或 `action.options`）就说明回调到了、是归一化没认；连这行都没有
  就先按上面「飞书卡片按钮没反应」的三步查订阅方式。归一化后的取值在 `event.action.options`，
  `normalizeCardAction` 认三种形态（单选 `option` / 多选数组或逗号串 / `form_value[组件名]`），
  **单选的取值是原子的**（工作区路径里可能有逗号），只有多选/表单提交才按逗号拆。
- **发了 `/menu` 好像没反应**：先看 `logs/feishu.log` 里那行 `渲染控制面板 source=menu … 目标=`——
  `目标=新发` 才是正常（聊天底部会出现新卡）；若是 `目标=om_…` + `已就地更新（patch 路径 …）`，
  说明它把上面那张老卡就地改了，用户在当前视野里看不到任何新消息。
- **卡片动作算哪个会话**：回调里只有 `chat_id`，而**群和私聊的 `chat_id` 长得一样**，
  所以「这张卡是我们发的」才是唯一可靠判据——发卡时用 `rememberCardConversation` 把
  会话键记进 `state.json` 的 `cardConversations`（重启后仍在）。**新发一类卡片就要记得登记**，
  漏了只会在「群绑定被清掉 + 点击者有自己的私聊绑定」时判错方向（按私聊判门禁 = 放宽）。
- **设置页投递目标只显示 `oc_xxx` / `ou_xxx`**：名字解析要 `im:chat:readonly`（群名）与通讯录权限（人名），
  缺权限时卡片上会直接写明原因并给开通链接（`connection.status` 的 `nameHint`），日志里是 `读取群列表失败` / `读取用户信息失败`。
  这类失败会退避 30 分钟、期间不再重试（并发查询也合并成一次，免得把日志刷满），**开通权限后点「重新连接」即刻重取**。

## 阶段与进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | 三包骨架、契约与 RPC 闭环、设置页入口 | ✅ |
| P1 | 共享内核：会话桥、旧设置导入、上下文增强 UI、共享组件 | ✅ |
| P2 | 飞书渠道：长连接、私聊/群聊、任务过程展示分私聊/群聊、设置页 | ✅ 真实机器人验证通过 |
| P3 | 微信渠道：iLink 协议、扫码登录、私聊收发 | ✅ 真实账号验证通过 |
| P4 | 命令内核 + 访问策略 | ✅ `/help` `/version` `/status` `/new` `/stop` `/session` `/history` `/compact`、`/models` `/model` `/reasoning`、`/presets` `/preset`、`/whoami`、`/allow` `/deny`（**仅属主**，命令内部再判一次，否则被授权者能给自己人授权）、`/menu`（别名 `/m`）：飞书发**可交互控制卡**——下拉直接选模型 / 推理等级 / Agent 预设 / 工作区（`select_static` + `behaviors.callback`，选中即生效、同一张卡就地重画并带 ✅/❌ 与原因；模型与推理是会话级立即生效，预设与工作区只对新会话生效、且**只限属主**——它们是机器人级设置，与设置页同一条口径，非属主拿到 `chat/owner-only`（工作区候选还含属主其它会话的绝对路径：**只给属主、且只在私聊**——群卡是群里所有人都能展开的消息，属主在群里也不行））；卡上还有「新会话 / 状态 / 命令清单 / 历史 / 压缩 / 停止」——**历史与压缩的输出走文字消息**
（压缩动辄超过回调应答的 3 秒、历史几十行会把设置区埋掉），所以它们排在应答之后执行、结果用文字回；
另有一行「会话」下拉：列出**可以切过去的会话**（同一工作目录 ∪ 这台机器人其它聊天绑定过的会话，
排除空会话/子代理；`session.failed` 时只显示当前绑定），选一个就把当前聊天绑到那个会话——
命令清单是另一张卡且有「返回控制面板」；控制面板与卡片动作的语义在 hub（`dshChat.panel.read/apply`），渠道只画卡与收回调。**卡片动作与手打同一条命令门禁**（曾经卡片能绕过命令权限，是个洞）；提问/审批按钮属于**人在环回传**，免命令门禁，但**审批要另过身份门禁**——谁能替属主批准是另一回事，按这张卡实际所在的会话类型判（群聊 allowlist 下非属主点不动；曾经是任何能看到卡的人都能替属主批准）。判门禁前先 `await ready()`，否则启动窗口内读到空设置会把**非属主**误拒。**命令一条不落**——一行 4 个、超了另开一行 `column_set`（Card 2.0 里按钮要放在 `column` 里），绝不截断（曾经 `slice(0,12)` 把 `/session` `/status` `/stop` `/version` `/whoami` 静默丢掉，真机上就是卡片里缺按钮）；**点完就地更新同一张卡片**——标题下方显示"点了哪个命令 + 输出"，按钮保留可继续点，取不到 messageId 或更新失败时退回回文字；这个更新**必须排在回调应答之后**（客户端在应答落地时会把卡片还原成点击前的快照，先更新 = 闪一下又变回去，日志里 update 却是成功的）；卡片**每个下拉都有名称**——`select_static` 查过 Card 2.0 文档**没有 label 字段**，
  所以名称做成"同一列里的 markdown + 下拉"（`column_set` 一行两格：模型/推理等级、Agent 预设/工作区，
  `flex_mode: 'stretch'` 让窄屏自动堆叠，格子里的下拉 `width: 'fill'`）；两格并排后卡片比四个全宽下拉还矮；
  卡片**只放"能改的东西 + 当前值"**——当前值由各自下拉的 ✓ 表达，不再重复一整块
  「当前会话/模型/预设/工作区」状态行，也不要页脚那行手打提示（真机上那些重复行把卡片撑到 1000+ px）；
  只在"下拉说不出话"的地方补一行（读不到目录 / 没有会话 / 候选被扣下 / 列表被截断）；
  工作区路径自己折中截断到 22 字符（飞书从尾巴截，正好截掉目录名）；
  **但手打 `/menu` 每次都新发一张**——复用并 patch 上面那张老卡时，聊天底部一条新消息都没有，真机上就是"卡片滚上去之后，再发 /menu 像是没反应"；微信用文本兜底）；**模型选择在 DSH 里是会话级的**（`session/create` 没有模型参数、`selectModel` 必须带 sessionId），
  所以"还没有会话时先挑模型"存在**机器人默认模型**（`record.model`，与预设/工作区同一条口径：只对新会话生效、只限属主），
  由 `sessions.ensure()` 建完会话立刻应用（失败只记 warn，不能让会话建不出来）——不必再"先随便发一条消息"；
  **批量输入**：同一会话的回合在 hub 里串行（`ask()` 按会话键排队 + `onQueued(ahead)` 回执），因为渠道侧每条消息各开一条 follow 流、会在飞时抢答案 |
| P5 | 富媒体（图片/文件）与主动投递 | ✅  主动投递文本+出站文件/图片（飞书）、**投递目标可自定义名字**（微信没有昵称、飞书缺权限时只有掩码 id，一排认不出的 id 里挑不出要发给谁；自定义名不会被渠道补名顶掉，留空即回到自动名字）、飞书入站图片+入站文件已通；人在环回传已通：工具/思考/**已答提问**收进同一个折叠面板（默认收起、展开看全部；一行一项、形态对齐 DSH Web 会话：`工具调用 · wiki_get · …`/`Bash · 描述`/`Skill · 技能名`/`思考 · …`/`提问 · 口径 → 答案`；标题在本轮没结束时显示最新一项、结束后才显示「工具与思考(N)」）、已答提问**按发生顺序**在工具面板里**再嵌一层**「❓ N/M 已回答」折叠控件（控件本身留在面板外；Card 2.0，一页一题：单选按钮+输入框 / 多选勾选器 / 文本输入框；无进度卡时退回独立卡片）、**任务清单**单独一个面板放在工具面板下面（未结束展开、结束收起）、**交付文件**（`present` 声明）在回复后合成**一条不带任何文字的 `post` 消息**发出（图片按图片内嵌在前、文件进附件区在后）；微信入站图片+入站文件（CDN 下载 + AES-128-ECB 解密）与出站文件/图片（getuploadurl + 加密上传 CDN）已通 |
| P6 | 平台化：会话渠道标识、更新面板、i18n 完整化 | 会话渠道标识 ✅（host 侧：工作区命名「渠道 · 机器人」+ 会话标题加「渠道 · 」前缀，均幂等；client 侧：侧边栏会话行把前缀换渠道徽标——会话列表没有插槽，做的是纯装饰、可还原、**认结构不认类名**的 DOM 增强，见 `client/session-badges.js`）；版本与更新 ✅（Chat机器人 页右上角入口展开：内核/契约/各渠道包版本与状态、数据与日志目录、更新方式，`check` 会与 package.json 对账）；i18n 完整化 ✅（共享组件与上下文增强表单全部走 `t()`，渠道字典同步补齐）；⚠️ 会话标题前缀自 P6-① 起一直是坏的（`session/list` 漏 `_request`），已修，重启后每个会话在**下一次消息**结束时补上 |

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
