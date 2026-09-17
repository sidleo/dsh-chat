# dsh-chat 渠道插件契约 v1

本文件是**新写一个聊天软件插件时唯一需要读的文档**。目标：新增飞书/微信之外的聊天软件，
只新增一个包，`dsh-chat` 仓库零改动。

---

## 0. 一句话架构

| 角色 | 包 | 负责 |
|---|---|---|
| Hub | `dsh-chat` | 设置页入口「Chat机器人」、渠道注册表、每机器人共享设置、上下文增强引擎、提示词登记、会话桥、RPC 载体、共享 UI 组件 |
| 渠道 | `dsh-chat-<name>` | 平台协议、凭据、机器人/账号列表与状态、渠道专属设置、自己的设置页 |

**唯一硬规则：渠道包不得 `import` hub 包。** 共享能力全部经运行期服务传递。
这条规则让三个包可以独立装卸、独立升级，也避免了跨包版本与去重问题。

判断某个东西放哪一边：

- 单例状态、跨会话共享、与平台无关（设置存储、上下文增强、会话桥、UI 组件）→ **hub**；
- 平台概念（群响应方式、话题回复、任务过程展示、扫码登录、消息分段）→ **渠道**。

---

## 1. 渠道包最小骨架

```js
// host/index.mjs
export const name = 'dsh-chat-demo-host';
export const inject = ['dshChat'];            // hub 未就绪时 Cordis 自动挂起等待

const EXPECTED_CONTRACT = 1;
const CHANNEL_ID = 'demo';

export function apply(ctx) {
  const service = ctx.dshChat;
  if (service.contractVersion !== EXPECTED_CONTRACT) {
    throw new Error(`dsh-chat-demo 需要契约 v${EXPECTED_CONTRACT}，当前 v${service.contractVersion}`);
  }
  ctx.effect(() => service.registerChannel({
    id: CHANNEL_ID,
    label: '演示',
    order: 30,                                 // 左栏排序
    legacy: { dir: 'dsh-demo' },               // 可选：沿用既有数据目录（零重绑）
    async createChannel(deps) {
      // 这里放协议实现：读配置、建长连接、收消息、调 deps.sessions 跑会话
      return {
        async start() {},
        async stop() {},
        endpoints: {
          'connection.status': async () => ({ ok: true, value: { phase: 'idle' } }),
        },
      };
    },
  }), 'dsh-chat-demo: 注册渠道');
}
```

```js
// client/index.js
import * as React from 'react';

export const name = 'dsh-chat-demo-client';
export const inject = ['slots', 'locale', 'connection', 'chatChannels', 'chatUi'];

const CHANNEL_ID = 'demo';
const PAGE_SLOT = 'chat.channel.page';
const NS = 'dsh-chat-demo';

function DemoPage({ chatUi, connection, translate }) {
  const t = (key) => translate(key);
  const { Panel } = chatUi.components;
  return React.createElement(Panel, { title: t('演示渠道') });
}

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh: { '演示渠道': '演示渠道' }, en: { '演示渠道': 'Demo' } }),
    'dsh-chat-demo: 文案');
  const t = ctx.locale.bind(NS);
  ctx.effect(() => ctx.chatChannels.register({
    id: CHANNEL_ID, order: 30, label: () => t('演示渠道'),
  }), 'dsh-chat-demo: 渠道元数据');
  ctx.effect(() => ctx.slots.inject(PAGE_SLOT, () => ctx.slots.register({
    name: PAGE_SLOT, key: CHANNEL_ID, locale: NS,
    inject: () => ({ chatUi: ctx.chatUi, connection: ctx.connection, translate: t }),
  }, DemoPage)), 'dsh-chat-demo: 设置页');
}
```

`package.json` 需要（照抄 `packages/dsh-chat-feishu/package.json`）：

```jsonc
{
  "main": "./lib/index.js",
  "exports": { ".": "./lib/index.js", "./client": "./lib/client.js", "./package.json": "./package.json" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "inject": [
      "@deepseek-ai/dsh-client-connection",
      "@deepseek-ai/dsh-client-ui-slots",
      "@deepseek-ai/dsh-client-locale"
    ], "platform": "web" }
  }
}
```

```yaml
# cordis.patch.yml
- insert:
    - id: dsh-chat-demo
      name: dsh-chat-demo
```

安装：`dsh plugin --profile <profile> add <包目录或包名>`。
DSH 会按 `dsh.bundle.patch` 自动把这行加进 `dsh.profile.bundles`；顺序无关（靠 `inject` 等待）。

---

## 2. Host 服务 `dshChat`

```js
{
  contractVersion: 1,

  registerChannel(definition) -> disposer,   // 见 §3
  channels: { list(), subscribe(fn) },       // [{ id, label, order, status, error, startedAt }]
  ready(): Promise<void>,                    // 读取设置前 await

  bots: {
    read(channelId, botId), write(channelId, botId, patch), list(channelId), subscribe(fn),
    storageFor(channelId),                   // 渠道通常用 deps.storage（已按渠道绑定）
  },

  delivery: {
    send({ channelId, botId, targetId, text }),   // 定时任务/脚本用这个
    list({ channelId, botId }), save({ channelId, botId, target }),
    remove({ channelId, botId, targetId }), supports(channelId),
  },

  contextEnhancement: { /* §4 全部导出，见 CONTRACT 附录 A */ },
  guidance: { publish(sessionId, text), forget(sessionId) },
  sessions: { invoke, ask, stop, steer, isRunning, reset },   // §5
}
```

### 渠道 `deps`（`createChannel(deps)` 的入参）

| 字段 | 说明 |
|---|---|
| `channelId` | 本渠道 id |
| `logger` | 已按渠道加作用域的 logger（`info/warn/error`） |
| `credentials` | DSH 凭据服务；App Secret / Token 只走它，绝不写进 settings |
| `dataDir` | 渠道历史数据目录（按 `legacy.dir` 解析，默认 hub 数据目录） |
| `resolveDataDir(name)` | 需要多个目录时用 |
| `storage` | 本渠道的每机器人共享设置：`read/write/list` |
| `createJsonStore` | 渠道自建存储用的 JSON 文档工厂（原子写/首次覆盖备份/串行队列/订阅），签名见 §6 末尾 |
| `ready()` | 等设置文档就绪 |
| `contextEnhancement` | 上下文增强引擎（校验/解析/拼装） |
| `guidance` | 每会话提示词登记 |
| `sessions` | 会话桥 |
| `reportStatus(status, error?)` | 上报 `starting/running/failed/stopped` 与错误 |

---

## 3. 渠道定义与生命周期

```js
{
  id: 'demo',              // ^[a-z][a-z0-9-]{1,31}$，同时用作 URL 片段
  label: '演示' | () => string,
  order: 30,
  createChannel(deps) => Promise<instance>,
  legacy: { dir: 'dsh-demo' },   // 可选
}
```

`instance`：

```js
{
  start(): Promise<void>,   // 可选
  stop(): Promise<void>,    // 可选
  endpoints: { '<method>': async (payload, { signal, channelId }) => result },  // 可选
  delivery: {               // 可选：声明后该渠道自动获得"主动投递"能力
    async send({ botId, target, text }) { /* 按 target.route 发 */ },
    async discover({ botId }) { /* 返回候选目标，不落盘 */ },
  },
}
```

**主动投递**：hub 持有目标清单（每机器人设置的 `deliveryTargets`）与调度；
渠道只实现"怎么发"和"能发给谁"。`send` 只会收到**已保存**的目标，
`discover` 返回的候选在用户保存前不可发送——避免误发到没确认过的会话。

目标结构：`{ id, name?, kind: 'direct'|'group', route: { ... } }`，`route` 只允许
1–8 个短标量字段（不放 Secret）；`id` 需满足 `[A-Za-z0-9_-]{1,64}`。

- `registerChannel` **同步返回注销函数**（Cordis `ctx.effect` 要求），创建与启动在后台进行；
- 启动失败不会抛出到调用方，而是把该渠道状态标成 `failed` 并在 RPC 上返回可读错误；
- RPC 路由在渠道就绪前就已挂上，因此设置页能看到 `starting` / `failed`。

---

## 4. RPC 线路

- 通用端点：`/api/dsh-chat/<channelId>`；hub 控制端点：`/api/dsh-chat/control`。
- 请求：`{ type:'client-request', rpcId, method:'dsh-chat/<channelId>', payload:{ method, payload } }`
- 响应：`{ type:'server-response', rpcId, result }`，`result` 为

```js
{ ok: true, value }                              // 成功
{ ok: false, error: { code, message, details } } // 失败
```

浏览器侧（渠道设置页）：

```js
const result = await chatUi.callChannelRpc(connection, 'demo', 'connection.status', {});
const value = chatUi.unwrapRpc(result);   // 失败时抛 Error（带 code/details）
```

### hub 控制端点（渠道无需重复实现）

| method | 载荷 | 说明 |
|---|---|---|
| `channel.list` | `{}` | 契约版本 + 全部渠道状态 |
| `bot.settings.get` | `{ channelId, botId }` | 读每机器人共享设置 |
| `bot.context-enhancement.set` | `{ channelId, botId, config }` | 原子保存上下文增强（含指定设置） |
| `maintenance.import-legacy` | `{ channelId, force }` | 重跑旧 `workspaces.json` 导入（`force:true` 时以旧文件为准刷新） |
| `delivery.list` | `{ channelId, botId }` | 已保存目标 + 渠道发现的候选 |
| `delivery.save` / `delivery.remove` | `{ channelId, botId, target }` / `{ …, targetId }` | 目标增删 |
| `delivery.send` | `{ channelId, botId, targetId, text }` | 主动发一条文本 |

新的渠道无关设置请加在控制端点（hub 一份实现，所有渠道共用），不要在渠道里各写一份。

### agent 可调用的聊天工具（hub 注册，渠道无需实现）

hub 把投递能力暴露成三个模型工具，会话里的 agent 因此能自己把结果发到 IM：

| 工具 | 参数 | 说明 |
|---|---|---|
| `chat_targets` | `{ channel_id?, bot_id? }` | 只读发现：不给参数列渠道，只给渠道列机器人与目标，给全了列目标（已保存 + 候选） |
| `chat_send` | `{ channel_id, bot_id, target_id, text }` | **只能发已保存目标**，候选一律拒绝 |
| `chat_save_target` | `{ channel_id, bot_id, target_id, name? }` | 只收编 `chat_targets` 里标记为候选的目标 |

发现顺序（agent 不需要提前知道任何 id）：`chat_targets {}` → `{ channel_id }` → `{ channel_id, bot_id }`
→ `chat_save_target`（若目标还是候选）→ `chat_send`。

安全边界：agent 不能凭空捏造投递对象——候选来自渠道自己的 `discover()`（即该机器人真实对话过的
会话），而"能发"必须由用户在设置页或 `chat_save_target` 显式确认一次。

### 入站消息的推荐顺序（两个官方渠道就是这么做的）

1. 去重（平台消息 id）；
2. 属主/访问策略判定：`deps.accessPolicy.evaluateAccess({ policy, conversationType, senderIds, isOwner })`，
   不允许就**静默忽略但必须打日志**（否则"发了没反应"无从排查）；
3. 命令：`text` 以 `/` 开头时先用 `isCommand: true` 再判一次权限，被拒就回"没有执行命令的权限"；
   放行则交给 `deps.commands.handle(...)`，`handled: true` 时直接回复命令结果——**命令不进模型、也不做上下文增强**；
4. 普通消息：捕获上下文增强 → `deps.sessions.ask(...)` → 按渠道方式呈现回复。

---

## 5. 会话桥 `sessions`

hub 已经把 DSH 会话的复杂部分实现好了：渠道只需要把消息交进来、把回调接出去。

| 方法 | 语义 |
|---|---|
| `invoke(namespace, method, args, signal)` | 一元调用（返回原始业务值，失败抛带 `code` 的 Error） |
| `stream(namespace, method, args, signal)` | 流式调用；`session/follow`、`session/control`、`workspace/follow` **必须**用它 |
| `ensure({ channelId, botId, key, workspacePath, signal })` | 找到或创建该会话键对应的 DSH 会话（`{ sessionId, created }`）；绑定的会话被删会自动重建 |
| `ask({ channelId, botId, key, workspacePath, content, sourceGuidance, mode, signal, handlers })` | 跑完一轮：先开 follow 基线再发 prompt，`turn/end` 时返回 `{ sessionId, text, reason, tools }` |
| `cancel({ channelId, botId, key })` / `reset({ channelId, botId, key })` | 停止当前回合 / 解除绑定（`/new`） |
| `isRunning(sessionId, signal)` / `rename(sessionId, title, signal)` | 运行态 / 改标题 |
| `bindings` | 会话绑定表：`get` / `entries` / `bind` / `unbind` / `adopt` / `locate` |
| `registerInteractionHandler(channelId, handle)` | 注册本渠道的审批/提问回传处理器（返回注销函数） |

`ask` 的 `handlers`：`onTurnStart` / `onAssistantMessage` / `onToolCall` / `onToolResult` /
`onDelta`（token 级增量）/ `onEvent`（原始事件）/ `onTurnEnd`。
`content` 是 DSH 内容块数组，如 `[{ type: 'text', text }]`。

> hub 已在自身 `inject` 中声明 `typertGateway`，渠道不需要（也不应该）自己 inject 它。
> 调用参数必须与 DSH 的 wire 契约一致，这部分已由 hub 封好，渠道不要绕过 `sessions` 直接调。

**审批与提问**：hub 已在 root 上参与 `approval/request` 与 `user-questions/request`
两个 waterfall，并按会话绑定定位到渠道；渠道只需注册处理器：

```js
const off = deps.sessions.registerInteractionHandler(deps.channelId, async (payload) => {
  // payload.kind === 'approval' → 返回 'allowed-once' | 'rejected' | 'cancelled'
  // payload.kind === 'question' → 返回 { answers: [{ id, selected, custom? }] }
  return askUserInIm(payload)
})
```

处理器抛错即由 hub 交还 `next()`，浏览器 UI 仍能接管；不属于本插件的会话从不拦截。

**旧绑定接管**：渠道读自己的旧 `state.json` 后调用
`deps.sessions.bindings.adopt(channelId, botId, { 'p2p:ou_xxx': 'session-…' })`，
已有绑定不会被覆盖。

---

## 6. 每机器人共享设置

位置：`<hub dataDir>/bots.json`（默认 `~/.dsh/integrations/dsh-chat/bots.json`）。

```jsonc
{ "version": 1, "channels": { "feishu": { "bot_xxx": {
  "workspace": "/Users/me", "model": null, "agentPreset": null,
  "contextEnhancement": { "group": {...}, "direct": {...}, "targets": [...] },
  "accessPolicy": null
} } } }
```

- 写入是**合并**语义：`write(channelId, botId, { workspace })` 只改这一个键；
- 未知键会被拒绝（防止把渠道私有配置混进来）；
- 原子写（temp + rename），首次覆盖已有文件前落 `.bak-<时间戳>`；
- 渠道自己的协议配置（凭据引用、机器人列表、会话状态、任务过程展示）**不要**放这里，
  放在渠道自己的 `dataDir` 里（例如飞书沿用 `~/.dsh/integrations/dsh-feishu`）。

---

## 7. Client 契约

| 服务 | 提供方 | 用途 |
|---|---|---|
| `chatChannels` | hub | `register({ id, order, label, logo, capabilities })` → disposer；`entries()` / `get(id)` / `subscribe(fn)` / `getSnapshot()` |
| `chatUi` | hub | `components` / `hooks` / `installStyles()` / `callChannelRpc` / `callControlRpc` / `unwrapRpc` / `translate` / `react` |

`chatUi.components`：
- `Panel`、`EmptyState`、`StatusPill` —— 基础块；
- `ContextEnhancementEditor({ config, disabled, translate, onSave })` —— **上下文增强**
  （群聊/私聊全局 + 指定用户/指定群 + 是否叠加全局提示词），渠道页直接放一个即可；
- `ScopedModeEditor({ title, scopes, options, value, onSave })` —— 通用"两作用域 × 多选项"
  设置块（飞书的任务过程展示就用它）。

`chatUi.hooks.useBotSettings({ connection, channelId, botId })` →
`{ record, phase, error, reload, saveContextEnhancement }`：把 hub 持有的每机器人设置
（工作区/模型/预设/上下文增强）一次接好，渠道不必自己写 RPC 与加载态。

页面挂载：hub 在 `settings.section` 上声明了子槽 `chat.channel.page`（`kind: 'keyed'`），
渠道注册页时用 `key: <channelId>`：

```js
ctx.slots.inject('chat.channel.page', () => ctx.slots.register({
  name: 'chat.channel.page', key: CHANNEL_ID, locale: NS,
  inject: () => ({ chatUi: ctx.chatUi, connection: ctx.connection, translate: t }),
}, DemoPage));
```

- 未注册页面的渠道仍会出现在左栏，点击时显示空面板；
- `label` 可以是函数，语言切换后由框架重新渲染；
- 样式：直接用 `chatUi.installStyles()` 提供的 `dchat-*` 类，或自带样式并用包名做前缀。

---

## 8. 数据与凭据

- 凭据一律走 `deps.credentials`（DSH 凭据服务），settings / RPC 响应里**永不**出现 Secret；
- 沿用历史数据目录（`legacy.dir`）可让用户零重绑：目录名与文件名要与旧实现一致；
- 卸载渠道包不会删除任何数据目录。

---

## 9. 版本兼容

- 渠道在 `apply()` 里对账 `ctx.dshChat.contractVersion`，不匹配就抛出可读错误；
- hub 升版时只做**加法**（新服务字段），破坏性改动才递增 `CONTRACT_VERSION`；
- 客户端同理：`ctx.chatChannels` / `ctx.chatUi` 存在即兼容，`chatUi.version` 可用于降级提示。

---

## 10. 自检清单（提交新渠道前）

- [ ] 只 `inject` 契约里声明的服务，源码里没有 `import 'dsh-chat'`（`npm run check` 会强制）
- [ ] `package.json` 有 `dsh.bundle.patch` 与 `dsh.client.platform: 'web'`
- [ ] `cordis.patch.yml` 插入的行 id/name 与本包名一致
- [ ] client bundle 的模块 id 等于包名
- [ ] 卸载本包后 hub 仍正常、左栏自动少一项
- [ ] Secret 只经 `deps.credentials`，RPC 响应里检索不到
- [ ] 契约版本不匹配时给出可读报错
