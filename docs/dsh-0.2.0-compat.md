# dsh-chat × DSH 0.2.0-rc.1 兼容性对账

**结论：兼容。0.1.5-rc.2 → 0.2.0-rc.1 没有破坏本插件的改动。**

- 本插件在 **0.1.x 与 0.2.x 上都能跑**，所以 `engines.dsh` 保持 `>=0.1.5-rc.2`，
  并且**故意不声明 DSH `peerDependencies`**（声明了会把 0.1.x 用户挡在安装门外）。
- **真不兼容（BROKEN）：0 条。**
- **类型面收窄（DRIFT，运行时仍成立）：1 类** —— `Agent` 接口声明收窄，见 §3.1。已按"先读 `agent.id`"加固。
- **过期声明（STALE）：1 批** —— 版本常量 / 注释里的旧版本号，见 §3.2。已更新。
- **环境问题（ENV，真坏过）：1 条** —— workspace 依赖链接丢失导致构建失败，见 §3.3。已修。
- 未核实项见 §5（**没有查过的事不写成 PASS**）。

对账日期：2026-09-29　|　被测插件版本：0.2.1　|　被测 DSH：`0.2.0-rc.1`（桌面端）

---

## 1. 判定方法（三条独立的证据链）

单读源码或单读文档都会漏，所以每一条判定都必须至少落在下面某一条链上：

| 链 | 是什么 | 怎么取 |
|---|---|---|
| **A. 活体契约** | 正在运行的 DSH 自报的 Service / Event / Slot 契约（含类型声明） | `cordis_inspect_list` → `cordis_inspect_query`（host: Service/Event/Config/Tool；client: Service/Event/Builtin/Slots/Theme） |
| **B. 生成产物** | DSH 源码在 `app.asar` 里；**`@Remote` 方法的 wire 键名**只出现在生成的 `typert.host.js` 里，源码形参名**不等于** wire 名 | `node /tmp/asar.mjs cat dsh/node_modules/@deepseek-ai/<包>/lib/typert.host.js` |
| **C. 真启动一次** | 在临时 `DSH_HOME` + 临时 profile 上真装三个包、真起 web、真打设置页那条 RPC | `npm run check:dsh`（新增门禁，10 项断言） |

> 链 B 为什么必须有：`commands/execute` 的**源码形参叫 `agent`，wire 键却叫 `agentId`**。
> 只看源码或只看我们自己的调用点，都会得出错误结论（详见 §2.7）。

## 2. 逐项对账

`PASS` = 契约与插件用法一致；`DRIFT` = 类型面/语义有偏移但运行时仍成立；`STALE` = 只是版本号或注释过期。

### 2.1 Host Service —— 注入与调用

| 触面 | 插件用法 | 0.2.0 实际契约 | 证据 | 判定 |
|---|---|---|---|---|
| `typertGateway` | `inject = ['connection','credentials','typertGateway']`；`invoke/stream` 传 `{namespace, method, args, signal}` | `invoke(request: InvokeRemoteRequest)`；`InvokeRemoteRequest = { readonly namespace: string; readonly method: string; readonly args: Readonly<Record<string, unknown>>; readonly uplink?: AsyncIterable<unknown>; readonly peer?: PeerScope; readonly signal?: AbortSignal }` | A: host/Service `typertGateway` 的 `referencedTypes` 原文 | PASS |
| `systemPrompt.section` | `section({ name, order, text: (context) => string })`（`packages/dsh-chat/host/prompt-context.mjs:51-59`、`:127-131`） | `PromptSection = { readonly name: string; readonly order: number; readonly text: string \| ((context: AssembleContext) => string); readonly interpolate?: boolean; readonly complete?: boolean }` | A: host/Service `systemPrompt` 的 `referencedTypes` | PASS |
| `AssembleContext.agent` | 靠 `context.agent` 取会话 id（`prompt-context.mjs:34-38`） | 类型声明里**只有** `{scope?, signal?}`，**没有** `agent`；但运行时由 `dsh-agent` 的 `assembleContextFor(agent, signal)` 组装成 `{ agent, scope, ...signal===void 0?{}:{signal} }`，`dsh-agent-loop` 用它调 `assemble()` | A + B: `dsh/node_modules/@deepseek-ai/dsh-agent/lib/index.js` 的 `assembleContextFor`（`{agent, scope, …}`）；`dsh-agent-loop/lib/index.js` 的 `systemPrompt.assemble(assembleContextFor(this, signal))` | PASS（类型面见 §3.1） |
| `shellEnv.register` | `register({ name, variables: { DSH_CHAT_LARK_PROFILE: {description}, … }, resolve })`（`packages/dsh-chat-feishu/host/index.mjs:327+`） | `BashEnvContributor = { name: string; variables: Readonly<Record<DshEnvironmentKey, BashEnvVariable>>; resolve(execution: ToolExecution): Readonly<Partial<Record<DshEnvironmentKey, string>>> }`；`BashEnvVariable = { description: string }` | A: host/Service `shellEnv` 的 `referencedTypes` | PASS |
| `connection.fetch.register`（host 侧 RPC 载体） | `register({ path, methods: ['POST'], requestBody: 'buffered', fetch })`（`packages/dsh-chat/host/rpc.mjs:90-122`） | `HostConnectionFetch.register(route: ConnectionFetchRoute): () => Promise<void>`；`ConnectionFetchRoute = { path: string; methods: readonly ConnectionFetchMethod[]; requestBody: ConnectionRequestBodyMode; fetch: (request: Request) => Promise<Response> }`；`ConnectionFetchMethod = 'GET'\|'HEAD'\|'POST'`；`ConnectionRequestBodyMode = 'buffered'\|'streaming'` | A: host/Service `connection` 的 `referencedTypes` | PASS |
| `tools`（注册 agent 工具） | `ctx.inject(['tools'], …)` 注册 `chat_targets` / `chat_send` / `chat_send_file` / `chat_save_target`（`packages/dsh-chat/host/tools.mjs`） | `ToolRuntime.register(definition: ToolDefinition)` 仍在；`ToolDefinition extends ToolSchema` | A: host/Service `tools`；**活体反证**：host/Tool 的 `listTools` 里四个工具**都在** | PASS |

### 2.2 Host Event —— 审批与提问回传

| 触面 | 插件用法 | 0.2.0 实际契约 | 证据 | 判定 |
|---|---|---|---|---|
| `tools/pre-execute` | `ctx.on('tools/pre-execute', async (exec, next) => …)`；不拦时 `return next()`；拦时返回 `{ kind:'deny', reason, botId }`（`packages/dsh-chat-feishu/host/index.mjs:71-85`、`lark-guard.mjs:214/229`） | waterfall：`(this: Scoped<ToolRuntime>, exec: ToolExecution, next: () => Promise<PreToolDecision>) => Promise<PreToolDecision>`；`PreToolDecision = {kind:'allow'} \| {kind:'deny'; reason: string; info?: ToolErrorInfo} \| {kind:'cancel'} \| {kind:'ask'; reason?; displayReason?}`。**运行时按属性直接读，不做 schema 校验**：`dsh-tools/lib/index.js` 里 `decision.kind === 'deny' ? decision.info : void 0`、`decision.kind === 'allow' ? … : decision.reason` | A: host/Event `tools/pre-execute`；B: `dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js` 中 `waterfall(carrier, "tools/pre-execute", exec, () => Promise.resolve({kind:"allow"}))` 及其后的 `decision.kind/reason/info` 读取 | PASS —— **多带的 `botId` 字段被忽略，不报错**（那条是给插件自己日志/测试用的） |
| `approval/request` | `ctx.on('approval/request', handler, { prepend: true })`；认领时返回 `interactions.handle(...)` 的结果，否则 `next()` | waterfall：`(this: Scoped<Agent>, req: ApprovalRequestEvent, next: () => Promise<ApprovalOutcome>)`；`ApprovalRequestEvent = { agent: Agent; toolName: string; callId?; reason?; displayReason?; signal? }`；`ApprovalOutcome = 'allowed-once' \| 'rejected' \| 'cancelled' \| 'unavailable'` | A: host/Event `approval/request` 的 `referencedTypes` | PASS |
| `user-questions/request` | 同上（`packages/dsh-chat/host/sessions.mjs:1146-1165`） | waterfall：`(this: Scoped<Agent>, request: AskUserQuestionRequestEvent, next: () => Promise<AskUserQuestionAnswer>)` | A: host/Event 目录里存在且为 `waterfall` | PASS |

### 2.3 client Service 与 Slot

| 触面 | 插件用法 | 0.2.0 实际契约 | 证据 | 判定 |
|---|---|---|---|---|
| `slots.inject` / `slots.register` | `ctx.slots.inject('settings.section', () => ctx.slots.register({ name, id, order, label, locale, inject, children }, Component))`（`packages/dsh-chat/client/index.js:64-76`） | `settings.section` 是 `list` 槽，注册字段 `{ id 必填, order?, label? }`；插件额外带的 `locale` / `inject` / `children` 被接受 | A: client/Slots `listSubTree(root:'settings.section')` —— **`occupants` 里有 `{registrant:"dsh-chat-client", id:"dsh-chat", order:21, active:true}`**，且其 `children` 里**真的有** `chat.channel.page`（插件声明过的那条 keyed 子槽） | PASS |
| `locale.register` / `locale.bind` | `ctx.locale.register('dsh-chat', { zh, en })` + `ctx.locale.bind(ns)`（`client/index.js:46-50`） | `register(ns, dicts)` / `bind(ns)` 都在 | A: client/Service `locale` 的方法签名 | PASS |
| client `connection` | `connection.rpc.call('/api', 'dsh-chat/<channel>', { method, payload }, signal)`（`packages/dsh-chat/client/rpc.js:28-33`） | `createWebConnectionRpc` 的 `async call(channel, endpoint, payload, signal)`；请求体 `{ type:'client-request', rpcId, method: endpoint, payload }`，响应 `{ type:'server-response', rpcId, result }` | B: `dsh/node_modules/@deepseek-ai/dsh-client-connection/lib/client.js`（`call(channel, endpoint, payload, signal)` 与 `client-request` 信封）；`lib/index.js`（`server-response` 校验） | PASS |
| `dsh.client.inject` 四个包名 | `@deepseek-ai/dsh-client-connection` / `-ui-settings` / `-ui-slots` / `-locale` | 四个包在 0.2.0 都在（版本同为 `0.2.0-rc.1`） | B: app 内 `dsh/node_modules/@deepseek-ai/` 目录清单 | PASS |

> **client `connection` 为什么不在活体 client/Service 目录里**：那个目录只列**有 Typert 类型信息**的服务。
> 插件自发布的 `dshChat` / `chatChannels` / `chatUi` 同样不出现——**host 侧也一样**（`dshChat` 不在 host/Service 目录里，
> 而它的四个工具确实在线）。所以"目录里没有" ≠ "服务不存在"；判定"存在"要靠**行为证据**（见 §2.6 与 §4）。

### 2.4 client 插件图（bundle 与加载）

| 触面 | 0.2.0 实测 | 证据 | 判定 |
|---|---|---|---|
| 客户端插件**进了 host 合成的插件图** | index HTML 里含 `{"id":"@sidleo3/dsh-chat","url":"plugins/??@sidleo3/dsh-chat/client.js&rev=…","inject":[…]}` | C: 真 DSH 启动后取带 token 的 index | PASS |
| host 半真的激活 | 四个 agent 工具在线；`hub.log` 出现 `hub 已就绪（契约 v1）` | A（host/Tool）+ C | PASS |
| 渠道包真的注册进 hub | `channel.list` 返回的渠道**同时含 `feishu` 与 `weixin`**，`hubVersion=0.2.1` | C: `POST /api/dsh-chat/control`，`method='channel.list'` | PASS |

> ⚠️ **"进了插件图"不等于"bundle 能被浏览器加载成功"**（审查指出的证据强度问题，已核实）：
> 那个插件图是 **host 侧合成**的——`dsh-client-modules` 按 `ctx.loader.entries()` 扫 `dsh.client` 字段、
> 把 `bootInjections` 塞进 index，**只校验 `exports` 里有 `./client`，从不读 bundle 内容**；
> bundle 由浏览器之后按 `url` 去拉。所以 `lib/client.js` 语法坏掉（AGENTS.md 记过那次
> "styles.js 模板字符串里放反引号 → 整个 bundle 解析失败 → 页面白屏"）**不会**被本行证据发现。
> 本表判 PASS 的只是"**注册与引用链成立**"；"bundle 能被解析"另见 §4 第 6 步（门禁已加真拉一次 bundle）。

### 2.5 plugin manifest 与安装预检

| 触面 | 0.2.0 实测 | 证据 | 判定 |
|---|---|---|---|
| `dsh.bundle.patch` | `dsh plugin add <包路径>` 后**自动把包名追加进** `dsh.profile.bundles`；`--dump-config` 里 `- id: dsh-chat` / `dsh-chat-feishu` / `dsh-chat-weixin` 都在且**都没有 `disabled:`** | C（三个包） | PASS |
| 安装前的兼容性预检 | `evaluatePluginCompatibility(manifest, exemptions, runtimeVersion)` **只遍历 `peerDependencies`** 里名字等于 `@deepseek-ai/dsh` 或以 `@deepseek-ai/dsh-` 开头的项，用 `semver.satisfies(runtimeVersion, requirement, { includePrerelease: true })` 判定；**完全不读 `engines.dsh`**。本插件**没有**这类 peer → 预检不产生任何 issue | B: `dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js` 的 `evaluatePluginCompatibility` | PASS |
| `engines.dsh: ">=0.1.5-rc.2"` | `satisfies('0.2.0-rc.1', '>=0.1.5-rc.2', { includePrerelease: true }) === true`，不带 `includePrerelease` 则为 false（用 DSH 自带的 semver 7.8.5 实跑） | B + 实跑 | PASS |
| 市场侧（dshmarket）的发现判定 | **未就地复核**——本机没装市场包。按既定口径记录：它用 `includePrerelease: true` 判定 `engines.dsh` / DSH peer，`dshmarket/lib/discovery-compatibility.js` 的 `rangeResult` 里 `satisfiesRange(hostVersion, declared, { includePrerelease: true })` | 读 `dshmarket/lib/discovery-compatibility.js`（本机 profile 内的副本）+ 未就地跑 | **未核实**（见 §5.6） |
| `files` 白名单 | `lib` / `host` / `client` / `cordis.patch.yml` / `package.json` 覆盖了发布所需全部文件；`shared/` 属于 hub 且已在 hub 的 `files` 里 | 代码走查 + C（装包成功） | PASS |

> **故意不声明 DSH `peerDependencies`**：声明了会启用上面那道预检，把 0.1.x 用户挡在安装门外，
> 而本插件在 0.1.x 与 0.2.x 上都工作。这是**有意的取舍**，不是遗漏。

### 2.6 RPC 方法 wire 键名（逐个核对）

DSH 的 `@Remote` 方法在 wire 上的键名由**生成的描述符**决定，可能与源码形参名不同。
逐个从 `typert.host.js` 的 `wire:` 字段核对：

| 插件的调用点 | 插件发的 args | 0.2.0 的 wire 键 | 判定 |
|---|---|---|---|
| `session/list`（`sessions.mjs:277,574,1359`；`panel.mjs:287,538,568`；`commands.mjs:211`） | `{ _request: {} }` | `_request` | PASS |
| `session/modelCatalog`（`sessions.mjs:440`；`panel.mjs:66`；`commands.mjs:171`） | `{}` | **零参数**（`parameters: []`） | PASS |
| `session/create`（`sessions.mjs:409,414`） | `{ request: { workspaceId, agentPreset? } }` | `request` | PASS |
| `session/prompt`（`sessions.mjs:551`） | `{ request: { requestId, sessionId, mode, content } }` | `request` | PASS |
| `session/page`（`sessions.mjs:384`） | `{ request: { address, throughSeq, maxMessages } }` | `request` | PASS |
| `session/rename`（`sessions.mjs:289,583`） | `{ request: { sessionId, title } }` | `request` | PASS |
| `session/cancel`（`sessions.mjs:565`） | `{ request: { sessionId } }` | `request` | PASS |
| `session/selectModel`（`sessions.mjs:459,484`；`panel.mjs:905,932`；`commands.mjs:711,796,806`） | `{ request: { sessionId, provider, model, reasoningEffort? } }` | `request` | PASS |
| `workspace/create`（`sessions.mjs:362`） | `{ request: { path } }` | `request` | PASS |
| `workspace/rename`（`sessions.mjs:373`） | `{ request: { workspaceId, title } }` | `request` | PASS |
| `commands/execute`（`sessions.mjs:1325`） | `{ agentId, line, submittedAttachments }` | **`agentId`**（源码形参叫 `agent`，描述符 `wire: 'agentId'`）、`line`、`submittedAttachments` | PASS |

**证据（链 B）**：
- `dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/typert.host.js`：`session/list` → `wire: '_request'`；`create` / `prompt` / `page` / `rename` / `cancel` / `selectModel` → `wire: 'request'`；`modelCatalog` → `parameters: []`
- `dsh/node_modules/@deepseek-ai/dsh-api-workspace-controller/lib/typert.host.js`：`namespace: 'workspace'` 的 `create` / `rename` → `wire: 'request'`
- `dsh/node_modules/@deepseek-ai/dsh-commands/lib/typert.host.js`：`commands/execute` 的 `parameter_0` 声明为 `wire: 'agentId'`

> 这一节是**唯一一个"看起来像不一致、实际一致"**的地方：`commands/execute` 源码是
> `execute(agent, line, submittedAttachments, signal)`，插件传的是 `agentId`。
> 只看源码会误判成 BROKEN——必须读生成描述符。历史上 `session/list` 就因为键名不对
> 在真机上留下一行 `typert gateway: session/list: args fields do not match the descriptor: missing "_request"`。

### 2.7 依赖与构建面

| 触面 | 实测 | 判定 |
|---|---|---|
| `@larksuiteoapi/node-sdk`（构建期打进 host bundle，6.5MB） | workspace 依赖装齐后 `npm run build` 正常产出 | PASS（修复过程见 §3.3） |
| `qrcode`（构建期**外置**，运行期按真实路径解析） | 已声明在 `packages/dsh-chat-feishu` 的 `dependencies`，`pnpm install` 后 `${包}/node_modules/qrcode` 与工作区 `node_modules/qrcode` 都能解析 | PASS |
| `build-client.mjs` 的 DSH 模块加载器包装 | 真 DSH 启动后客户端插件被登记进出包图（见 §2.4） | PASS |

---

## 3. 本次发现的问题与处置

### 3.1 DRIFT：`Agent` 接口声明收窄（运行时仍成立）

- **现象**：0.2.0 里面向插件的 `Agent` 接口**只声明** `{ readonly id: SessionId }`（活体契约原文），
  `.session` 不再出现在该声明里；但运行时实现仍赋 `this.id = id; this.session = session`
  （`dsh-agent-loop/lib/index.js` 的 Agent 实现构造函数），且 `Session.header.id` 仍存在
  （`dsh-session/lib/index.js` 的 `snapshotSessionHeader` 默认 `{ version: 4, id, createdAt, isSeeded: false }`）。
- **风险**：靠 `.session` 取会话 id 属于"**侥幸成立**"。取法一漂，**没有任何日志**：
  - `lark-guard.mjs` 拿不到 sessionId 就 `return null` = **放行** → "设置页写着只用应用身份，模型照样用用户身份发消息"这条安全承诺静默失效；
  - `sessions.mjs` 的审批/提问中继拿不到 → **认领=否** → 问题被丢给浏览器 UI，IM 侧用户看到"机器人不问了、卡住不动"。
  两者都正是本项目最忌讳的"静默失效"形态。
- **处置**：所有取会话 id 的地方统一成 **先读 `agent.id`，再退回 `agent.session?.header?.id ?? agent.session?.id`**：
  `packages/dsh-chat/host/prompt-context.mjs`、`packages/dsh-chat-feishu/host/lark-guard.mjs`、
  `packages/dsh-chat-feishu/host/index.mjs`（身份段 / 卡片友好回答段 / 会话环境事实）、
  `packages/dsh-chat/host/sessions.mjs`（审批与提问中继）。
  每个改动点都有单测钉住"**agent 只有 `.id`、没有 `.session`** 时仍然成立"，并反向验证过（改回旧写法测试立刻红）。

### 3.2 STALE：版本常量与注释

- `packages/{dsh-chat,dsh-chat-feishu,dsh-chat-weixin}/package.json` → `0.2.1`；
  对应常量 `HUB_VERSION`（`packages/dsh-chat/shared/contract.mjs`）、
  两个 `CHANNEL_VERSION`（飞书/微信 `host/index.mjs`）同步为 `'0.2.1'`。
  `npm run check` 的打包自检会强制这三者与各自的 `package.json` 一致（漂移即红）。
- `UPSTREAM.md` 与 `packages/dsh-chat/host/sessions.mjs` 文件头里"契约依据（DSH **0.1.5-rc.2** 实测源码）"
  一类表述 → 更新为"0.1.5-rc.2 起、**已在 0.2.0-rc.1 复核**"，并补上本次核实的契约事实。
- `packages/dsh-chat-fixture`（`private: true`、不发布、无 `CHANNEL_VERSION`）**不动**。

### 3.3 ENV：workspace 依赖链接丢失（**本次唯一真正坏掉的东西**）

- **现象**：`npm run build` 直接失败 —— `packages/dsh-chat-feishu/host/controller.mjs:91`
  `ERROR: Could not resolve "@larksuiteoapi/node-sdk"`，整个飞书渠道的 host bundle 因此**产不出来**
  （`lib/index.js` 停在旧构建上）。`pnpm install` 报 `Already up to date`——因为
  `.pnpm/` 里的包是好的，只是工作区包的 `node_modules` **链接**没了（`packages/dsh-chat-feishu/node_modules/` 不存在）。
- **处置**：跑一次 `pnpm install`（它补出了 `packages/dsh-chat-feishu/node_modules/{@larksuiteoapi/node-sdk,qrcode}` 与
  `packages/dsh-chat-weixin/node_modules`），构建恢复绿。
- **为什么值得写进文档**：这个故障的表现是"**改完源码构建静默失败、跑的还是旧产物**"，
  很容易在真机上被误判成"改了没生效"。它与 DSH 版本无关，但**恰好发生在这台机器的升级前后**。
  **自查**：`node -e "console.log(require.resolve('@larksuiteoapi/node-sdk',{paths:['packages/dsh-chat-feishu/host']}))"`
  必须打得出来；`npm run build` 的 8 行 `Wrote …` 一行都不能少。

---

## 4. 真机门禁（可重复执行）

`npm run check:dsh`（新增，**不在 `npm run check` 里**——check 要保持快、离线、零副作用）：

临时 `DSH_HOME` + 临时 profile（`desktop` 是 CLI 保留名，不能用）：

1. 从出厂模板建临时 profile 并打印合成树（离线）
2. 三个包逐个 `dsh plugin add`（走真实安装预检）
3. 合成树里三个入口都在、且都没有 `disabled`
4. 起 `dsh web`（自动找空闲端口）并拿到带 token 的地址
5. `hub.log` 出现 `hub 已就绪（契约 v1）` → host 半真的激活
6. 带 token 取 index：HTTP 200 且客户端插件图里有 `@sidleo3/dsh-chat` → client 半真的注册
7. 用**设置页完全相同的信封格式**打 hub 路由 → HTTP 200 + 合法 `server-response`
8. `channel.list` → `ok:true`，渠道**同时**含 `feishu` 与 `weixin`，且 `hubVersion` 与 `package.json` 一致
9. `feishu.log` / `weixin.log` 落在临时 home 里 → 渠道 host 半真的跑了
10. 收尾：自己起的进程组全部回收

**边界（每条都是刻意的）**：全程只用自己的临时 `DSH_HOME`（**不碰 `~/.dsh`**）、
子进程带 `npm_config_offline=true`（**不联网**）、临时 home 里没有凭据所以**不连任何真实平台**、
不碰保留的 `desktop` profile。本机没装 `dsh` 时**跳过并退出 0**（不让没装 DSH 的机器变红）。

**已验证这道门禁真的会红**（不是永远绿）：
- 改坏 `packages/dsh-chat-feishu/cordis.patch.yml` 的 `name` → 第 3、8、9 三条同时红，退出码 1；
- 把已构建产物里的 `HUB_VERSION` 改回 `0.2.0` → 第 8 条红（运行期自报版本与 `package.json` 不一致）；
- 路由未注册时返回的是 404 纯文本，第 7 条要求"HTTP 200 + 能 JSON.parse + `rpcId` 对 + `code` 以 `chat/` 开头"，所以放不过去。

---

## 5. 未核实（**没有查过的不写成 PASS**）

1. **`packages/dsh-chat/client/session-badges.js` 的 DOM 假设**：它直接改侧边栏会话行（AGENTS.md 记过"会话列表没有插槽"）。
   0.2.0 的活体槽位树里**新出现了** `sidebar.session.row.leading`（"每行标题前那个 16px 单元格"），
   看起来正好是这件事的**正规插槽**。但**没有核对该文件依赖的选择器/类名在 0.2.0 客户端产物里是否仍然成立**，
   也没评估改用该槽位。→ 待查；在真机上看一眼会话行的渠道徽标是否正常显示即可判定。
2. **`scripts/build-client.mjs` 生成的加载器包装**：只验到"真 DSH 启动后客户端插件被登记进出包图并能被请求"，
   **没有**逐字段对照 0.2.0 官方 client 插件产物的形态。
3. **`credentials` 服务的方法逐个形状**（`resolve` / `describe` / `set` / `unset`）：只确认了服务存在与插件调用点，
   没有把每个方法的参数与返回结构逐字段对账。
4. ~~**`approval/request` 认领时返回值的字面量**~~ → **已由审查关闭**：插件只会返回
   `'allowed-once'` / `'rejected'` 或 `next()`（`packages/dsh-chat/host/interactions.mjs`、
   `packages/dsh-chat/host/sessions.mjs`），且越界值会被 `@deepseek-ai/dsh-user-approval`
   规范化成 `'unavailable'`（**失败关闭**）。不再列为空白。
5. **Lark 长连接与真实平台回调**：`npm run check:dsh` 只用临时 home（无凭据），
   长连接、卡片回调、真机卡片渲染**只能重启 DSH 后真机验证**——这一条永远不会被任何离线/临时门禁覆盖。
6. **市场侧（dshmarket）判定**：本机没装市场包，"它用 `includePrerelease: true`"那句是**按口径记录**、
   **未就地复核**（§2.5 已单独拆行，不再与已实跑的那半句合并成 PASS）。
   它只是 `engines.dsh` 决策的**次要**依据；主要依据（DSH 自己的安装/启动预检只读 `peerDependencies`）
   已在链 B 核实。
7. **`lib/client.js` 能否被浏览器真正解析**：见 §2.4 的警告。§4 的门禁第 6 步已改为**真拉一次 bundle**
   并断言 HTTP 200 + 非空，但**没有**在真浏览器里执行它。

## 6. 下次升级 DSH 时的操作顺序

1. `pnpm install`（先确认依赖链接没丢，见 §3.3）
2. `npm run build` —— 8 行 `Wrote …` 一行都不能少
3. `npm run check`（契约/单测/打包自检/布局守门，全离线）
4. `npm run rehearsal`（离线端到端演练）
5. **`npm run check:dsh`**（真启动一次当前 DSH；升级后**必跑**）
6. 重启 DSH 做真机验证（长连接、卡片、扫码——**只有这一步能验**）
