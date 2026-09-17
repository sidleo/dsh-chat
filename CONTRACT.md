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
}
```

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

新的渠道无关设置请加在控制端点（hub 一份实现，所有渠道共用），不要在渠道里各写一份。

---

## 5. 会话桥 `sessions`

| 方法 | 语义 |
|---|---|
| `invoke(namespace, method, args, signal)` | 直通 `typertGateway`（`session.*` / `workspace.*`） |

> hub 已在自身 `inject` 中声明 `typertGateway`，会话能力随 DSH modern 路径提供；
> 渠道不需要（也不应该）自己 inject 它。
| `ask({ channelId, botId, key, text, content, sourceGuidance, signal, onDelta, onStep, onDone, onApproval, onQuestion })` | 跑一次会话回合；呈现方式由渠道决定 |
| `stop(key)` / `steer(key, text)` / `isRunning(key)` | 停止 / 补充指令 / 是否在跑 |
| `reset(key)` | 解除会话绑定，下一条消息开新会话 |

P0 只有 `invoke` 可用，其余方法抛 `chat/not-implemented`；P1 补齐。渠道可以照此先写调用点。

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
| `chatUi` | hub | `components`（`Panel` / `EmptyState` / `StatusPill`）、`installStyles()`、`callChannelRpc`、`callControlRpc`、`unwrapRpc`、`translate`、`react`、`createElement` |

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
