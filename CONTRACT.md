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
    version: CHANNEL_VERSION,                   // 本包版本（设置页「版本与更新」面板显示；check 会与 package.json 对账）
    legacy: { dir: 'dsh-demo' },               // 可选：沿用既有数据目录（零重绑）
    async createChannel(deps) {
      // 这里放协议实现：读配置、建长连接、收消息、调 deps.sessions 跑会话
      return {
        async start() {},
        async stop() {},
        endpoints: {
          // 规范化名单：hub 的机器人列表按 `bots` 渲染（字段见 §4；渠道自己的额外字段随便加）
          'connection.status': async () => ({ ok: true, value: { bots: [] } }),
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
    // 可选：渠道图标（设置页左栏卡片与侧边栏会话行徽标共用）。
    // 官方标志常是位图，所以 svg 与 data URI 两种来源都支持。
    icon: { uri: 'data:image/png;base64,…' },   // 或 { svg: '<svg …></svg>' }
    // 可选：没有图标时的字徽标回退
    sessionBadge: { text: '演', color: '#3370ff' },
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
  /**
   * 合并转发（如飞书的 `merge_forward`）：渠道只负责把**外壳 id 与查回来的原始条目**
   * 交进来，展开由 hub 做一次（所有渠道复用）。
   * enhanceForwardedMessages(content, forward) -> 拼好展开块的内容（没有可展开内容时原样返回）。
   *   forward = { messageId?, items?, reason? }；`items` 是平台原样的条目数组（飞书是**扁平**数组，
   *   子消息靠 `upper_message_id` 指回父级，父消息自己也在数组里且没有该字段）。
   *   `reason` 有值表示**读不到**（无权限/超时/已删除）：只出"内容不可用"标记，当前消息照常进模型。
   *   展开有限条（50）与限深（3），嵌套的合并转发递归展开。
   * forwardedMessagesText(forward) -> 只要展开后的**纯文本**（不带标签）。给"引用回复"那条路用：
   *   引用块自己会写"被引用的是合并转发的消息"，再塞标签就成了块里套块。
   */
  /**
   * 引用回复：渠道只把平台字段映射成 `reply`，拼装由 hub 做一次（所有渠道复用）。
   * enhanceReplyReference(content, reply) -> 拼好引用块的内容（`reply` 为 null 时原样返回）。
   *   reply = { messageId?, senderId?, kind?, text?, fileName?, reason? }
   *   `reason` 有值表示**读不到**被引用消息（删除/无权限/超时）：只出"引用内容不可用"的标记，
   *   当前消息照常进模型。渠道自己的超时要有界（飞书是 3 秒），引用读不到不能拖住提问。
   */
  guidance: { publish(sessionId, text), forget(sessionId) },
  sessions: { invoke, ask, stop, steer, isRunning, reset },   // §5
  /**
   * 控制面板（可交互卡片用）：读"当前值 + 可选项"，把用户的选择应用下去。
   * read({ channelId, botId, key, isOwner }) -> { sessionId, bound, model{current,botDefault,hostDefault,
   *                                        failures,options,efforts,currentEffort,selectionFailed},
   *                                        session{current,options,withheld,failed}, preset{current,options,failed},
   *                                        workspace{current,options},
   *                                        fields[{field,label,value,options}], fieldsFailed }
   *      `workspace.options` 是这台机器人各会话的工作区候选（含绝对路径）：**只给属主，
   *      且只在私聊**（`key` 不带 `group:` 前缀）；群聊卡片是一条群里所有人都能展开的消息，
   *      属主也要在私聊或设置页改工作区。
   *      `session.withheld` 是**被扣下的会话数**——正被这台机器人其它聊天绑定的会话不能切过去
   *      （会话级增强提示词一个会话只有一个槽位，共用会互相覆盖）：渠道要在卡上说清这一点，
   *      不能只把它们从列表里去掉。
   *      `model.failures` 是读不到模型的 provider 及原因，`model.selectionFailed` 表示当前会话的
   *      模型选择**读失败**（不是"没选过"），`preset.failed` 表示预设列表**读失败**（与"列表为空"
   *      是两回事）——渠道要如实呈现，不能显示成"没有可用模型/没有预设/跟随 Host 默认"。
   *      `model.botDefault` 是**机器人默认模型** `{provider,model,reasoningEffort}`（可能为 null）：
   *      未绑定时它就是"当前生效的模型"，由 `sessions.ensure()` 在新建会话后 `selectModel` 应用。
   *      `session.options` 是**可以切过去的会话**（`[{id,label}]`，label 含标题与相对时间）：
   *      同一工作目录的会话 ∪ 这台机器人其它聊天绑定过的会话，排除空会话与子代理会话；
   *      `session.failed` 表示会话列表**读失败**（此时 options 只含当前绑定，不能显示成"没绑定"）。
   *      `sections` 是**本会话类型该显示哪些项**（设置页里配的，私聊/群聊分开）：
   *      `{ model, session, preset, context, policy, fields, actions, commands }`，值都是布尔。
   *      渠道按它决定画不画某一块；**hub 仍然把数据都读出来**（少一次"字段被谁吞了"的排查）。
   *      全关掉时卡片不能是空 body（平台会拒）——渠道至少要画一行"去设置页打开"。
   *      `actions` 是**渠道自带的动作按钮**（如飞书的「🔌 重连」），来自渠道可选方法
   *      `panel.actions({ botId, key, conversationType, isOwner })` → `{ actions: [{ action, label,
   *      type?: default|primary|danger, confirm?: { title, text } }] }`。
   *      与"面板字段"的区别：字段是"选一个值存起来"，动作是"点一下做一件事"。
   *      形状认不出的条目会被丢掉（宁可不画，也不画一个点了没反应的按钮）；
   *      `confirm` 由渠道给文案、渠道用平台原生确认弹窗渲染（飞书是 button.confirm）；
   *      `deferred: true` 表示"这个动作慢，或会**断开当前这条长连接**"——渠道必须**先把卡片
   *      回调应答发出去、再执行**（飞书的回执走的正是那条长连接，抢在它前面执行等于没有回执，
   *      客户端会弹「目标回调服务超时未响应」；真机上点「重连」就是这样）；
   *      `actionsFailed` 为真表示**读失败**（与"这个渠道没有动作"不是一回事）。
   *      `fields` 是**渠道自带的面板字段**（渠道相关设置，如飞书的「任务过程展示」）：
   *      渠道实现可选方法 `panel.fields({ botId, key, conversationType, isOwner })` 就多一行下拉，
   *      hub 只做形状校验与透传——hub 不认识这些字段的语义，所以字段名/标签/选项全部由渠道给。
   *      渠道想列几项就列几项（飞书把「任务过程展示」私聊/群聊两份都列出来，
   *      卡片在哪不影响能改哪一份）；`isOwner` 也一并透传，渠道要按身份收窄候选就自己判。
   *      `policy` 是**本会话类型的访问策略**（谁能跟机器人说话），只给属主、
   *      且必须知道是私聊还是群聊（`conversationType` 认不出就不给）：
   *      `{ current: 'open'|'allowlist'|null, label, conversationType, kindLabel, allowlistCount, options }`。
   *      `current = null` 表示**从没设过**（口径是"仅属主可用"）——如实显示，不冒充某种模式。
   *      `context` 是**本会话的上下文增强**（用哪一份设置），只给属主（写的是机器人级配置）：
   *      `{ current, label, identity, kind, scopeEnabled, own, options }`。
   *      `current = ''` 跟随该会话类型的全局设置、`'own'` 本会话有专属设置；
   *      `options` 里还有 `copy:<指定设置 id>`（套用另一条同类设置的字段与提示词）。
   *      **会话语义**：会话键 `p2p:<平台用户 id>` / `group:<平台群 id>` 决定命中身份
   *      （私聊按 senderId 命中 user 目标、群聊按 chatId 命中 group 目标），
   *      认不出的键就不提供这一项（宁可不给，也不能照错方向改设置）。
   *      `own` 有值时带 `{ label, fields, guidanceLength }`——卡片据此显示"已有专属设置"，
   *      **内容（来源字段与提示词）在设置页编辑**，卡片只决定"本会话用哪一份"。
   * act({ channelId, botId, key, action, isOwner, conversationType })
   *      执行一个**渠道动作**（卡上按 `actions` 画出来的按钮）：调渠道的
   *      `panel.act({ botId, key, conversationType, action, isOwner }) -> { message }`，
   *      失败把渠道的 code/message 原样抛出去（渠道自己按 isOwner 判能不能点）。
   * apply({ channelId, botId, key, field, value, isOwner })
   *      field ∈ model | reasoning | preset | workspace | session | context | policy
   *      **不在内置字段表（model/reasoning/preset/workspace/session）里的 field 一律透传给渠道**：
   *      调渠道的 `panel.apply({botId,key,conversationType,field,value}) -> {value,message}`，
   *      渠道返回 `ok:false` 时原样抛它的 code/message（失败必须可见）。
   *      `field: 'session'` 的值：会话 id = 切换绑定；**`''` / `'new'` / null = 解除绑定**
   *      （下一条消息开新会话）——渠道下拉的哨兵值翻译回来就是空串。
   *      **model / reasoning 的落点看有没有会话**：有会话 → 会话级（`session/selectModel`，立即生效）；
   *      没有会话 → **机器人默认模型**（只对新会话生效）。后者是机器人级设置，同样只限属主
   *      （DSH 的 `session/create` 没有模型参数，`selectModel` 必须带 sessionId，所以未绑定时
   *      只能先存成机器人默认，由建会话时应用）。
   *      `isOwner` 由渠道判定后传入：**preset / workspace（以及未绑定时的 model / reasoning）只限属主**
   *      （非属主改会拿到 chat/owner-only；工作区候选来自这台机器人所有会话，不能给普通成员改）
   *      -> { field, value, message }；失败抛带 code 的错（chat/no-session / chat/unknown-model /
   *         chat/unknown-effort / chat/unknown-preset / chat/preset-unavailable / chat/workspace-invalid /
   *         chat/unknown-session / chat/session-check-failed / chat/model-selection-unavailable /
   *         chat/owner-only / chat/context-target-limit / chat/unknown-context-target /
   *         chat/requires-confirm（见下） /
   *         chat/unknown-field），渠道把 message 原样给用户看。
   *      **需要确认的改动**：`apply` 可以返回 `{ requiresConfirm: true, confirmPrompt, message }`——
   *      这时**什么都没写**，渠道要把 `confirmPrompt` 渲染成二次确认；用户确认后再带
   *      `confirm: true` 调一次同样的 `apply` 才真正落盘。当前只有 `policy` 放宽到 `open`
   *      （任何人可用）走这条路：一次误选就把机器人对所有人开放。`confirm` 不是安全边界
   *      （门禁是 owner-only），它防的是误触。
   * 语义：模型与推理等级是**会话级**（立即生效）；预设与工作区是**机器人级、只对新会话生效**；
   * `context` 是**机器人级**且**下一条消息生效**（上下文增强在收到消息时捕获），
   * 它只动本会话那一条指定设置（`own` 复制全局、`copy:<id>` 复制另一条、`''` 删掉本会话那条），
   * 不改其他会话的设置，也不改全局那份。
   */
  panel: { read, apply },
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
| `interactions` | 人在环回传：`attach({ channelId, botId, send })` + 入站 `offer({ channelId, botId, key, text })` |
| `deferred` | 延迟交付：`register({ channelId, botId, deliver })`。`ask()` 判定**超时**时会登记一条待交付记录，之后有界复查（probe 由 hub 提供），拿到结果就调 `deliver({ key, text, record })` 补发。渠道建桥时注册一次即可；补发只发文字（见 §5） |
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
    targetFromKey(key) { /* 会话键（'p2p:ou_x' / 'group:oc_y'）→ 目标或 null，可选 */ },
    async decorateTargets({ botId, targets }) { /* 把 oc_xxx/ou_xxx 换成群名/人名，可选 */ },
  },
}
```

**属主语义（所有渠道一致）**：属主名单里的 `*` 表示**没有记录属主**（公开机器人），
**不授权任何人绕过访问策略**。上游 dsh-im 把它当成"人人都是属主"，那会让这台机器人的
访问策略完全失效（名单外的人 @ 一下就执行任务，真机上出现过）。
判定用 `accessPolicy.isOwnerId(ownerOpenIds, senderId)`（渠道经运行期服务取用，不要自己写）。

属主名单由渠道自己持有与持久化，并需要给设置页一个"读写属主"的端点（飞书：`bot.owner.set`，
载荷 `{ botId, ownerOpenIds }`，`['*']` = 没有属主）。**改属主要立刻生效**：桥通常在创建时
捕获了机器人配置对象，因此渠道应在写入后重连该机器人（飞书就是这么做的）。
纯公开机器人（`*` + `open`）行为不变；`*` + `allowlist` 时名单才真正生效。

**主动投递**：hub 持有目标清单（每机器人设置的 `deliveryTargets`）与调度；
渠道只实现"怎么发"和"能发给谁"。`send` 只会收到**已保存**的目标，
`discover` 返回的候选在用户保存前不可发送——避免误发到没确认过的会话。

候选有**两个来源**，缺一不可：

1. `discover()` —— 渠道运行时的会话状态（进程内，重启即空）；
2. `targetFromKey()` + hub 的**持久**会话绑定表（`sessions.json`）—— 该机器人真实聊过的每个会话。

只做 ① 的话，重启后设置页一个候选都没有，用户看到的是"没有添加入口"而不是"还没有会话"。
`targetFromKey` 只做纯翻译（不查运行时、不异步）；不认识或不适用的键返回 `null`
（例如仅私聊的渠道对 `group:` 键返回 `null`）。

**目标必须是"人能认出的"**：`oc_xxx` / `ou_xxx` 对用户没有意义。渠道用可选的
`decorateTargets({ botId, targets })` 返回**同长度、同顺序**的数组，hub 只取里面的 `name`
覆盖展示名（已保存目标也覆盖——存下来的常常就是当时的掩码 id）。要点：

- 只改 `name`，`id` / `kind` / `route` 由 hub 保持原样（判重与发送都靠它们）；
- 名字解析失败、权限没开通、渠道没实现 —— 都必须**降级为原名称**，不能少列目标；
- 名字变得很慢，渠道侧要缓存，别让每次打开设置页都打一遍平台接口。

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

### 命令内核（hub 实现，渠道只负责把文本交进来、把回复发出去）

命令可以返回字符串（纯文本），也可以返回 `{ reply, menu, panel }`：

- `menu` = `[{ label, command }]`：命令清单（**按钮值就是命令行**，点击走与"用户手打"完全同一条路径）；
- `panel` = 上面 `panel.read()` 的状态：渠道有卡片能力就渲染成**可交互卡**（下拉直接选模型/推理
  等级/预设/工作区），没有卡片能力就用 `reply` 的文本兜底；
- `reply`：文本兜底（微信等）。

| 命令 | 作用 |
|---|---|
| `/help` `/version` `/status` `/new` `/stop` `/session` `/history [轮数]` `/compact` | 会话与运行状态 |
| `/models` `/model` `/reasoning-efforts` `/reasoning` | 模型与推理等级（会话级） |
| `/presets` `/preset` | Agent Preset（**对新会话生效**） |
| `/whoami` | 你的平台 id、是否属主、本次消息的放行判定 |
| `/allow [平台id] [--commands]` `/deny <平台id>` | 维护当前会话类型的访问名单（**仅属主**） |
| `/menu`（别名 `/m`） | 打开控制面板：飞书是可交互卡，其它渠道是命令清单文本 |

**卡片动作 = 命令，必须过同一条门禁**：手打文字与卡片点击都走 `accessPolicy.evaluateAccess(...,
isCommand: true)`（属主绕过）。提问/审批按钮是人在环回传，不走命令门禁。

可交互卡的线格式（飞书）：

- 下拉：`{ tag: 'select_static', name, initial_index, options: [{ text, value }], behaviors: [{ type: 'callback', value: { action } }] }`
  —— 选中即回调；`initial_index` 是 **1 起**（0 = 不预选），且 `options` 上**不能**写 `selected`（会报 230099）；
- 回调到达时的取值字段是 `action.option`（多选 `action.options`，也可能是逗号串或
  `form_value[组件名]`）——渠道的 `normalizeCardAction` 统一归一化成 `action.options: string[]`；
- 动作：`model_pick` / `reasoning_pick` / `preset_pick` / `workspace_pick`（值即选项 `value`），
  按钮 `value.dsh_panel ∈ new | status | commands | stop | panel`。


同一会话的多个回合在 hub 里**串行**：DSH 的 `session/prompt` 虽然会排队，但渠道侧每条消息
各自开一条 `follow` 流、会在飞的时候互相抢答案。`ask()` 因此按会话键排队，并支持
`onQueued(ahead)` 让渠道回一句"已排队"。

### hub 控制端点（渠道无需重复实现）

| method | 载荷 | 说明 |
|---|---|---|
| `channel.list` | `{}` | 契约版本 + hub 版本/包名 + 数据/日志目录 + 全部渠道状态与**渠道包版本**（设置页的「版本与更新」面板用它） |
| `bot.settings.get` | `{ channelId, botId }` | 读每机器人共享设置 |
| `bot.settings.options` | `{ channelId, botId }` | 设置页的下拉候选：该机器人用过的目录、Host 的 Agent Preset 列表、**模型目录（`models` + `hostDefault` + `modelFailures`）**、当前值 |
| `bot.workspace.set` | `{ channelId, botId, workspace }` | 设工作区（校验存在且是目录，一律存绝对路径）；**只对新会话生效** |
| `bot.agent-preset.set` | `{ channelId, botId, agentPreset }` | 设 Agent Preset（先与当前 Host 的列表对账）；**只对新会话生效** |
| `bot.model.set` | `{ channelId, botId, model }` | 设**机器人默认模型** `{provider,model,reasoningEffort?}` 或 null；模型目录读得到时先对账（`chat/unknown-model` / `chat/unknown-effort`），**只对新会话生效**——无会话时聊天里改的也是它 |
| `bot.access-policy.set` | `{ channelId, botId, policy }` | 设访问策略（与 host 拦消息同一份校验）；**立即生效** |
| `bot.access-policy.open-scope` | `{ channelId, botId, conversationType }` | 把某一个会话类型**放宽到「任何人可用」**，另一份与名单原样保留；策略形状与默认值都在 hub，所以这一步也由 hub 做。「新建机器人接入」用它把新机器人的私聊放开（新机器人还没有属主，默认 `allowlist` + 空名单 = 谁都进不来） |
| `bot.conversations` | `{ channelId, botId }` | 该机器人聊过的会话（带名字），给"指定用户/指定群"这类选择器用 |
| `bot.context-enhancement.set` | `{ channelId, botId, config }` | 原子保存上下文增强（含指定设置） |
| `bot.panel-sections.set` | `{ channelId, botId, sections }` | 设**控制面板卡片的显示项** `{ direct: { model, session, preset, context, policy, fields, actions, commands }, group: {…} }`——只影响卡片的显示，不影响功能；缺项/写错按"显示"补齐（见 §6） |
| `maintenance.import-legacy` | `{ channelId, force }` | 重跑旧 `workspaces.json` 导入（`force:true` 时以旧文件为准刷新） |
| `delivery.list` | `{ channelId, botId }` | 已保存目标 + 渠道发现的候选 |
| `diagnostics.read` | `{}` | 自助排查现场：数据/日志目录 + 各渠道各机器人的状态与最近错误（含缺权限提示）+ 每个渠道日志文件的尾部若干行（读不到日志返回 `exists:false`，不算失败） |
| `delivery.save` / `delivery.remove` | `{ channelId, botId, target }` / `{ …, targetId }` | 目标增删 |
| `delivery.target.rename` | `{ channelId, botId, targetId, name }` | 给已保存目标起个自定义名（`name` 为空 = 取消自定义，回到渠道给的名字）；自定义名不会被渠道补名顶掉 |
| `delivery.send` | `{ channelId, botId, targetId, text }` | 主动发一条文本 |
| `delivery.sendFile` | `{ channelId, botId, targetId, path, name? }` | 主动发文件/图片（≤30MB）；渠道没实现 `sendFile` 时明确报 `chat/delivery-unsupported` |

新的渠道无关设置请加在控制端点（hub 一份实现，所有渠道共用），不要在渠道里各写一份。

### 渠道自己的端点（`/api/dsh-chat/<channelId>`）

契约只规定形状，方法名由渠道定；下面这些是**约定俗成的名字**，hub 与共享组件会按名字调用：

| method | 载荷 | 谁调用 | 说明 |
|---|---|---|---|
| `connection.status` | `{}` | hub 机器人列表 | 见下一节（**必须**实现） |
| `panel.fields` / `panel.apply` / `panel.actions` / `panel.act` | 见 §4 上方 | hub 的 `/menu` 卡片 | 渠道自带的面板字段与动作；**可选** |
| `names.resolve` | `{ botId, ids }` | 渠道自己的设置页 | 白名单里的 id → 名字；**可选**（见下） |
| `bot.add` | `{ appId, appSecret, domain?, ownerOpenIds? }` | 渠道自己的设置页 | 「手动接入已有机器人」：**先验凭据再写任何东西**，成功后返回新机器人的状态；**可选**，名字自定 |
| `bot.register.start` / `bot.register.status` / `bot.register.cancel` | 三者都无参数 | 渠道自己的设置页 | 「扫码接入」那条路：`start` 向平台申请一次性授权链接（同一时刻只有一个进行中的尝试），前端轮 `status` 拿 `{ state, verificationUrl, qrCodeDataUrl, remainingSeconds, error, bot }`，`cancel` 取消。**可选**，状态名与状态机由渠道自己定 |
| `bot.lark-identity.get` | `{ botId }` | 渠道自己的设置页 | 飞书：**只读**体检——返回分层身份策略 `identity`（`{ global, direct, group, targets }`，每层 `{ bot, user }`）、一行 `summary`、钉住的 `pinnedUserOpenId`，以及 `lark-cli` 自己的体检（`profile` / `larkCli.bot` / `larkCli.user`，看登录的是谁）。不建 profile、不写盘 |
| `bot.card-answer.set` | `{ botId, cardAnswer: boolean }` | 渠道自己的设置页 | 飞书：「卡片友好回答」开关（默认**开**）。它只决定**是否往会话的系统提示词里注入一段「卡片能怎么写」的写作建议**（表格 ≤5 行、别用 `#` 当正文标题、图片走交付文件…），**插件不改写答案内容**——怎么写由模型自己定。只接受布尔，落盘后**就地改运行态**、下一条消息生效（不必重连）|
| `bot.lark-identity.set` | `{ botId, identity, confirm? }` | 渠道自己的设置页 | 飞书：设置**分层**的 `lark-cli` 身份策略（`targets → 群聊/私聊 → global` 就近覆盖；每层两个开关各自独立）。传的是**整份** `identity`（不做字段级合并：合并语义表达不了"删掉一条指定设置"）。**放开用户身份要先确认**：任一层把 `user` 从关到开且还没钉住用户时，不带 `confirm: true` 就只回 `requiresConfirm` + `confirmPrompt`，一个字节都不写；收窄（关掉 user）立即生效、不用确认。开启时由 `lark-cli` 自己回答"登录的是谁"并钉住；**已钉住后改配置不重复确认、也不清掉那个人** |

渠道的投递实现（`instance.delivery`）有三块，后两块可选、缺席要能被查出来（`supportsFile`）：

```js
delivery: {
  async send({ botId, target, text }) {},                       // 必选
  async sendFile({ botId, target, file }) {},                   // 可选：file = { path, name, size, kind: 'file'|'image' }
                                                                // kind 由扩展名判定：image 走图片气泡，file 走文件消息
  async discover({ botId }) { return [ /* 候选目标 */ ]; },
  targetFromKey(key) { return /* 目标或 null */; },
}
```

`kind` 由 hub 按扩展名给出（png/jpg/jpeg/gif/webp/bmp → `image`）：能当图片发就发图片（有预览），
否则按普通文件发。路径解析、存在性、非空与 30MB 上限都在 hub 校验，渠道直接吃 `file.path`。

### agent 可调用的聊天工具（hub 注册，渠道无需实现）

hub 把投递能力暴露成三个模型工具，会话里的 agent 因此能自己把结果发到 IM：

| 工具 | 参数 | 说明 |
|---|---|---|
| `chat_targets` | `{ channel_id?, bot_id? }` | 只读发现：不给参数列渠道，只给渠道列机器人与目标，给全了列目标（已保存 + 候选） |
| `chat_send` | `{ channel_id, bot_id, target_id, text }` | **只能发已保存目标**，候选一律拒绝 |
| `chat_send_file` | `{ channel_id, bot_id, target_id, path, name? }` | 发本地文件/图片（≤30MB）；相对路径按该机器人的工作区解析；同样只发已保存目标 |
| `chat_save_target` | `{ channel_id, bot_id, target_id, name? }` | 只收编 `chat_targets` 里标记为候选的目标 |

发现顺序（agent 不需要提前知道任何 id）：`chat_targets {}` → `{ channel_id }` → `{ channel_id, bot_id }`
→ `chat_save_target`（若目标还是候选）→ `chat_send`。

安全边界：agent 不能凭空捏造投递对象——候选来自渠道自己的 `discover()`（即该机器人真实对话过的
会话），而"能发"必须由用户在设置页或 `chat_save_target` 显式确认一次。

### 人在环回传（agent 的提问与审批）

agent 会在回合中途反问用户（`ask_user_question`）或请求授权（危险操作）。**这两件事默认只会出现在
浏览器 UI 里**——对 IM 用户就是"发了没反应"。渠道必须把这一侧接上：

```js
// 1) 启动时接入"怎么发到某个会话"（key 就是渠道自己用的会话键）
const detach = deps.interactions.attach({
  channelId: deps.channelId,
  botId: bot.id,
  send: async ({ key, text }) => { /* 发到 key 对应的会话 */ },
  // 可选：能把**一批问题**渲染成平台原生交互（如飞书按钮卡片）就提供，用户点一下即可回答。
  // 关键约定：一批问题只用**一条**消息，回答后就地更新它（answered 是 {问题id: 答案}），
  // final=true 表示全部答完，可以收尾成"已完成"的样子。缺席或首发失败时 hub 自动退回纯文本。
  // 怎么呈现由渠道决定：飞书把提问**内嵌进本轮"正在处理"的进度卡**（Card 2.0，一页一题：
  // 单选=按钮+自定义输入框；多选=表单里每个选项一个勾选器 checker 平铺 + 提交；
  // 自由文本=表单里原生输入框 + 提交），答完就地翻页、全部答完收起提问区；
  // 没有进度卡可用（如过程展示为 off）时退回独立卡片。
  // 表单值回调在 action.form_value[组件name]：勾选器名 `chk_<序号>_<问题id>`（值为布尔，
  // 选项原文由渠道按批次反查），输入框名 `text_<问题id>`。
  sendQuestions: async ({ key, questions, answered, final }) => {},
  // 可选：审批（允许/拒绝）。同提问一样，渠道可以优先内嵌进本轮进度卡：
  // 待处理时放「允许一次 / 拒绝」按钮，决定后换成工具面板里的一行记录；
  // 没有进度卡可用时才另发独立审批卡。按钮回调仍走 `dsh: 'approval'`。
  sendApproval: async ({ key, request }) => {},
});

// 2) 入站文本在"门禁之后、@ 检查之前"先让交互服务认领
if (text && deps.interactions.offer({ channelId, botId, key, text })) return; // 这是回答，不要进模型

// 3) 停机时 detach()
```

要点：
- **位置**：门禁之后（陌生人不能替人回答）、群聊 @ 检查之前（回答提问不用再 @）。
- 渲染、解析、超时兜底都在 hub（`host/interactions.mjs`），渠道不要各写一份；
- 10 分钟没人回答就**交回其他应答方**（浏览器 UI），不会把这一轮卡死；
- 审批回复认不出来时 fail closed（按拒绝）；
- 渠道没 `attach` 时 hub 一律不认领——能力缺失只退化成旧行为，不会静默丢消息。
- **原生交互（按钮）与文本回答必须走同一条认领路径**：按钮 `value` 里带的就是选项原文、
  外加 `questionId`；点击后由渠道调用同一个 `offer({ key, text, questionId })`——
  两条路共用解析与门禁，不许各写一套。带 `questionId` 才能支持"任意顺序作答"，
  不带的文本回复按"第一个还没答的问题"处理。
  渠道侧的卡片回调也要过身份门禁（谁能回答，谁能打字回答，二者必须一致）。
- **即时反馈**：飞书渠道在放行后立刻给消息打「在做了」表情、处理完撤掉（下载失败/命令/模型失败等
  每条早退路径都要撤）；表情接口失败（多为缺 `im:message.reaction:write`）只记 info 日志，不影响处理。
- **卡片要反应状态，但状态只写在卡片头那一条线上**：过程卡标题＝桌面的整轮控件文案——
  **只在运行中**写 running `深度求索中，用时 X`（「用时」后**没有空格**，秒数不补零）；
  **结束之后一个字都不写**（完成/失败/中断都不写状态词，**也不显示已用时**），
  配色同步（蓝 → 橙）——失败原因在正文里（`本轮运行失败（<reason>）。`）。
  **正常结束不给 `header`**（不带颜色、不含标题）。
  为什么不能"要颜色但不要字"：Card 2.0 的 `header.title` 传**空串**会让飞书连整条配色头一起不画；
  **完全不传 `title`** 也画不出颜色（实测 `header:{template:"green"}` 服务端收下、客户端纯白）——
  所以"不要颜色"＝整块 `header` 都不给（`headerFor()` 返回 `null`）。
  标题也不带机器人名前缀（卡片本就在该机器人的会话里）。
  "处理完还写着正在处理"是最容易被当成卡住的呈现问题。
- **答案上方那条分割线只在它上面真有东西时才画**：没有过程面板 / 任务清单 / 待答提问时，
  卡里第一块就是答案，再顶一条 `hr` 纯属噪声（真机截图反馈过"只有一条线和答案"）。
- **运行中那行自带时钟，但只能是慢时钟**：桌面端是**客户端 1 秒定时器、零网络**；飞书每刷一次都是
  整卡 JSON 走 `im.v1.message.patch`，两者成本结构不同。所以运行中的用时按 **10 秒**刷新
  （`CLOCK_INTERVAL_MS`）：事件到达时照旧按 1.2s 合并刷，时钟只补"没有事件"的空档。
  1 秒时钟**故意不做**（5 分钟回合 = 300 次整卡 patch，比现状高一个数量级）。
- **被限频要退避，不能把卡片判死**：飞书应用级频控超限是 HTTP 400 + `99991400`（官方要求退避重试）。
  命中后记 `nextAllowedAt = now + 30s`：期间事件驱动的刷新**顺延**（行都攒在面板里，下次一次全上）、
  时钟跳过一个周期，但**收尾那次照发**（答案优先），且**不设 `cardBroken`**——判死会让整轮退回纯文本、
  表格与代码块全丢。限频只记一条 warn：它自愈，不算"卡片坏了"。
- **关掉过程也要用卡片发答案**：`off`（不显示过程）不等于退回纯文本——答案里的表格/代码块/链接
  发纯文本会被拍平。发一张**只装答案的卡**（同一套标题与配色，正文只有答案 markdown，
  不带任何过程面板），两条退路都要留：超过单卡内容预算（12000 字）**不截断**、改发文本并打日志；
  卡片接口失败也退回文本，原因进 `lastError`。
- **过程信息要收进折叠面板**：工具调用、思考（reasoning 摘要）、中间叙述、**已答的提问**合并进
  **一个** `collapsible_panel`，默认收起、展开看全部。标题分两态，正好对上桌面的两层折叠：
  **本轮没结束时显示最新的一项**（收起状态下用户要知道此刻在干什么），
  **结束后换成桌面的组头摘要**——按类别出现次数取前 3 类拼一句（`执行了命令并已调用工具`，
  超过 3 类结尾加「等」），**不带计数**（桌面端也不带，计数只在 DOM 属性里）。
- **一行一项，形态对齐桌面会话**：`工具调用 · wiki_get · 永辉/组织架构/品类架构`、
  `运行命令 · 描述`、`读取 · 路径`、`搜索文件内容 · query`、`Skill · 技能名`、`思考 · …`、
  `提问 · 口径 → 答案`；**失败的工具行前面加「失败」**，未知工具保留工具名。只有工具名等于没信息，
  因此摘要必须从参数里挑（口径见 `turn-presenter.mjs` 的 `TOOL_SPECS` / `TOOL_TITLES`，
  与 DSH 的 `process-activity.ts`（类别）和 `tool.title.*`（标题）一致）。
- **未回答的提问控件必须在面板外**：Card 2.0 的 `collapsible_panel` 里放不了 `form`/输入框，
  所以"已答的行"进面板、"当前题的控件"留在面板下面。
- **已答提问在工具面板里再嵌一层**可折叠控件（Card 2.0 允许嵌套，最多 5 层）：
  标题 `❓ N/M 已回答`，还有题要答时展开、答完收起；内容仍是 `提问 · 题 → 答案` 行。
  **位置必须在它本来出现的顺序上**（工具行 → 该批提问 → 后面的行），不能被推到面板底部；
  面板里出现新工具行之后再来一批提问，算新的一批，各自嵌在自己的位置。
- **任务清单单独一个面板，放在工具面板下面**：内容取 `todo_write` 的**最后一次全量**
  清单（`✅/🔄/⬜ 内容`），标题 `任务清单 · N/M 已完成`；本轮没结束时**展开**（看得见进度），
  结束后收起。
- **交付文件要真发出去**：hub 会把会话里的 `deliverables/presented`（agent 用 `present`
  声明的成品）放进 `ask()` 的返回 `files`，渠道必须在回复之后按附件发送。
  发送前先本地校验（存在、是普通文件、非空、不超上限），失败要把**具体原因**回给用户并落
  `lastError`——只把文件名写在回复文字里，用户是拿不到文件的。
- **交付物合成一条不带文字的消息，图片在上、文件在下**（真机要求）：
  飞书用 `post`（富文本）消息——**图片按图片发**（正文里的 `{"tag":"img","image_key":…}`，
  显示成图片而不是可下载的附件卡片），**文件放进顶层 `files` 附件区**（可多个 `file_key`，
  渲染位置固定在正文下面，天然得到"图片在前、文件在后"的排版）。
  正文里**不写任何文字**：不要"交付文件"之类的前缀，也不要逐行列文件名；
  上传前按类型重排一次（图片先传、文件后传），文件名/大小由服务端按文件元数据回填。
  卡片组件里**没有文件/附件组件**（只有 `img`），所以不要把交付物塞进过程卡。
- 过程行数有上限（超出丢最旧的）。一轮可能有上百次工具调用，因此过程刷新按最小间隔合并（1.2s），
  收尾一定再刷一次——一次 patch 是整卡重写，不能每个事件都刷。
- 多选提问（`multiSelect: true`）按钮表达不了，标准做法是**留在同一张卡片里**用 `form` + 原生勾选器，
  不要另发一条消息——否则一批问题会把聊天记录撑满。

### 命令：自己的命令 vs DSH 的命令（两个命名空间，别混）

- **hub 的命令内核**（`/help`、`/new`、`/model`、`/history`、`/compact`…）在渠道入口拦截，
  渠道把文本交给 `deps.commands.handle(...)`；命令**不进模型、也不做上下文增强**。
- **DSH 自己的斜杠命令**（`/compact`、`/goal`、`/plan`…）注册在 Agent 上，只有 `ctx.commands`
  认识。hub 的 `/compact` 是通过会话桥 `runCommand()` 调 `commands/execute`（wire 参数
  `{ agentId, line, submittedAttachments }`，`agentId` 就是会话 id）转发的——**别自己实现压缩**。
- 两个 wire 陷阱（真机探针踩出来的）：
  1. `session/page` 的 `throughSeq: -1` 是**空页**（拿它探测会话存在性），取尾部要用
     `session/follow` 的 **snapshot**（`records` + `cursor`）；`session/page` 得先有 seq 才能翻页。
  2. `session/follow` 的 `assistantStream` 只接受 `true` 或省略，传 `false` 会被边界校验拒掉。

### 逐机器人状态：`connection.status` 的规范形状

设置页的「机器人列表」是 **hub 渲染**的（渠道 → 机器人 → 机器人设置 三级导航），
所以 `connection.status` 必须给出**统一的 `bots` 名单**（渠道自己的额外字段随便加）：

```js
{ bots: [{ botId, name, state, errorMessage, handled, lastHandledAt }] }
```

- `state`：`running | starting | reconnecting | failed | stopped`（hub 据此渲染状态点）；
- `handled` / `lastHandledAt` / `errorMessage`：用户能直接看到的运行现场，
  失败原因绝不能只留在终端日志里；
- 机器人的**设置页**仍然是渠道自己的页面（`chat.channel.page`）；hub 点「设置」时会把
  `botId` 一起传给该槽，渠道页可据此只渲染这一台机器人。

### 会话渠道标识（两个层次）

- **host 侧**：hub 把工作区命名成「渠道 · 机器人」（`飞书 · 张三-DSH`），并给会话标题加
  「渠道 · 聊天 · 」前缀（`飞书 · 群 张三 · 日报整理`）——两者都幂等、失败只打日志。
  渠道通过 `ensure()`/`ask()` 的 `channelLabel` / `botLabel` / `chatLabel` 提供中文名（hub 不认平台）；
  `chatLabel` 是"哪个群/哪个人"（如 `群 张三` / `私聊 张三`），同样的聊天**名字可能晚一轮才有**，
  所以 hub 允许前缀**升级**：前缀变了就替换旧的，绝不叠加；`/retitle` 只能按绑定键给
  （`私聊 ou_…`），真名等下一次消息由渠道补上。
- **client 侧**：DSH 的会话列表**没有可注册的插槽**（`sidebar.workspaces` 是整块替换，
  换掉会盖掉搜索/分组/对话框），所以徽标是**纯装饰的 DOM 增强**（`client/session-badges.js`）：
  保留文字前缀作为匹配依据与降级形态，只给叶子标题元素加两个自有 data 属性（
  `data-dsh-chat-channel` / `data-dsh-chat-title`），再用一张样式表把前缀隐藏并画上徽标。
  三条纪律：只加属性不动 React 的节点/类名；**认结构不认类名**（谁前缀匹配谁是标题）；
  图片没加载成功就不替换。

### 入站内容（文本与图片）

hub 的 `sessions.ask({ content })` 直接吃 DSH 的 `PromptContentPart[]`，所以渠道只要把入站内容
翻成这些块即可（图片字节由 Host 落盘为持久附件，渠道不必自己存）：

```js
[{ type: 'text', text: '<已做上下文增强的文本>' }]
[{ type: 'text', text: '<来源块>' }, { type: 'image', mediaType: 'image/png', data: '<base64>', name? }]
```

- 图片 `mediaType` 只认 `image/png | image/jpeg | image/webp | image/gif`；平台给不出类型时用魔数兜底，
  仍认不出就**明确拒绝并回复原因**，不要把非图片字节当图片交出去。
- **文件不能直接塞字节**：文件块是 `{ type:'file', receiptId }`，receipt 必须由**同一会话**的上传产生，
  因此入站文件要 `sessions.ensure(...)` 拿到 `sessionId` → `sessions.uploadFile({ sessionId, name, bytes })`
  → 用返回的 `receiptId` 拼内容块。上传失败要回可读原因并记 `lastError`（没入库就不能进模型）。
- `contextEnhancement.enhanceContent(parts, snapshot, source)` 对内容数组会在前面插一个上下文文本块，
  因此图片消息同样带得上来来源块。**拼不拼增强提示词由 hub 决定**：Host 有 `systemPrompt` 服务时
  提示词走会话级系统提示词段，正文里只留来源块（同一段提示词不该两处都出现）；拿不到该服务时
  自动退回"提示词也拼在正文里"。渠道不需要知道这件事，契约不变（可用 `config.guidanceTarget`
  强制 `prefix` 走老路）。
- 下载失败、类型不支持、超过大小上限都要"日志 + 用户可见回复"，并让失败能出现在 `connection.status` 里。
- **带媒体的消息不参与交互回答与命令**：正在等用户回答提问时，用户顺手发来的图片/文件不该被当成选项答案；
  文字以 `/` 开头但同一条消息带媒体时也按普通消息进模型（两个官方渠道都是这么判的）。
- 平台媒体加密时先解密再判定类型（微信 iLink 是 AES-128-ECB + CDN，见
  `packages/dsh-chat-weixin/host/media.mjs`）；下载地址只信任平台自己的域名，重定向与超限一律中止。

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
| `ask({ channelId, botId, key, workspacePath, content, sourceGuidance, chatLabel, mode, signal, handlers })` | 跑完一轮：先开 follow 基线再发 prompt，`turn/end` 时返回 `{ sessionId, text, reason, tools, files }`（`files` = 本轮 `present` 的交付文件，渠道要当附件发出去）。`sourceGuidance` = 本会话生效的增强提示词（走系统提示词段）；`chatLabel` = "哪个群/哪个人"（只用于会话标题，可缺席） |
| `imagesAsFiles`（内部） | 图片回退：会话当前模型不收图片时，`ask` 会把图片块换成 `{ type:'file', receiptId }`（同一个会话上传）并**重试一次**，答案前加一句说明；一张都没存下就原样抛错。渠道不用管，`ask` 的结果里会带 `imageFallback: { saved, failed }` |
| `uploadFile({ sessionId, name, bytes })` | 把一段字节入库成**该会话可引用**的文件，返回 `{ receiptId, file }`（入站文件必须走它） |
| `cancel({ channelId, botId, key })` / `reset({ channelId, botId, key })` | 停止当前回合 / 解除绑定（`/new`） |
| `isRunning(sessionId, signal)` / `rename(sessionId, title, signal)` | 运行态 / 改标题 |
| `history({ channelId, botId, key, maxMessages })` | 回看最近几轮：取 `session/follow` 首个 snapshot 的尾部记录，只挑真实对话（注入的上下文与思考不算） |
| `probeTurn({ channelId, botId, key, sessionId, maxMessages })` | 复查某一轮的终态：`{ exists, running, text, rebound? }`。`exists:false` = 会话没了；`rebound:true` = 这个聊天已经绑到别的会话（补发是错的，作废）。延迟交付用它当 probe，渠道一般不用直接调 |
| `runCommand({ channelId, botId, key, line })` | 执行一条 DSH 斜杠命令（如 `/compact`），**不经过模型**；`matched:false` = 当前部署没注册这条命令 |
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

**面板动作（`panel.actions` / `panel.act`）**：字段是"选一个值存起来"，动作是"点一下做一件事"
（飞书的「🔌 重连」= 断开并重建长连接，用户刚去开了权限时用）。按钮由渠道在自己的
`panel.actions` 里声明，`isOwner` 由 hub 透传、渠道据此决定给不给（重连是机器人级操作），
点击时 hub 只做透传。危险动作的二次确认由渠道用**平台原生**的确认弹窗渲染
（`confirm: { title, text }`）——它不是安全边界，真正的门禁在渠道的 `isOwner` 判定与 hub 的属主口径。

**图片与"非视觉模型"**：`session/prompt` 会拿**会话当前模型**的模态直接拒掉图片内容块
（`session/attachment-invalid` + `details.reason = MODEL_DOES_NOT_SUPPORT_IMAGES`）。`ask()` 认这个拒绝，
把图片块换成"本会话的文件"（同一个会话上传得到的 `receiptId`）再试一次——纯文本模型拿到的是
"只读副本已保存在 <path>"，可以用工具读字节/图像处理/OCR 去分析；同时补一段模型侧说明
（"不要假设自己能直接看到图片内容"）与一句用户可见的说明（含"想直接看图用 /model 换模型"）。
**一张都没存下就原样抛错**（不静默丢图片），部分失败会在说明里写清几张没交出去。

**延迟交付（超时≠结束）**：`ask()` 的兜底按**静默时长**判超时，判超时只说明"流不再产出"，
**不代表那一轮没跑完**。所以超时时 hub 只做两件事：回一句"回合未正常结束"+ 登记一条待交付记录
（`deps.deferred` 由 hub 内部使用，渠道只需要 `register` 补发函数）。之后 hub 用 `probeTurn` 有界复查
（先等 1 分钟、之后每 30 秒、最多盯 30 分钟）：会话空闲且拿到非空正文 → 调渠道的 `deliver`
补发；会话没了 / 聊天已换绑 / 盯满时限 → 作废记录。三种结局都写日志，`/diag` 与设置页诊断里
能看到还没交付的记录。
渠道的 `deliver` 只发**文字**（几十分钟后卡片上下文早变了）：飞书按会话键发私聊/群聊，
微信用该用户最近一次记下的 `context token`——没有 token 就如实抛错（不静默）。

**旧绑定接管**：渠道读自己的旧 `state.json` 后调用
`deps.sessions.bindings.adopt(channelId, botId, { 'p2p:ou_xxx': 'session-…' })`，
已有绑定不会被覆盖。

**调 `lark-cli`（飞书/Lark 命令行）有两个入口，职责不同**：插件自己调走
`packages/dsh-chat-feishu/host/lark-cli.mjs`（唯一会拉起 lark-cli 的地方）；**模型在聊天会话里自己调**
（skill + bash）由 `host/lark-guard.mjs` 接 `tools/pre-execute` 拦——两者都只允许本应用那一份
profile（按 appId 从 `lark-cli profile list` 读回真实名字）与显式身份。下面是"插件自己调"那条的规矩：

lark-cli 允许同一台机器登录**多个应用**，还有一个**全局可变的"生效 profile"**：谁不显式指定 profile，
谁就可能在用**别人的授权**（甚至是别人的用户身份）。那个模块是全仓库**唯一**会拉起 lark-cli 的地方
（`scripts/verify-package.mjs` 会检查"没有别的文件引入 `node:child_process`"），它每次调用都带
`--profile <本机器人 appId 对应的 profile>` 与显式 `--as`，并在调用前核对自己的 `appId`（用户身份还要核对
钉住的 `openId`）——对不上就失败，**绝不回退**。不要自己 spawn、不要 `profile use`、不要 `strict-mode --global`。

**能不能用某个身份是分层的**（`host/lark-identity.mjs`）：`targets → 群聊/私聊 → global` 就近覆盖，
每层 `{ bot, user }` 两个开关各自独立，默认全局仅应用。**门禁按会话键解析**——`policyFor` 收的是
owner（`{ botId, key }`）而不是 botId，只给 botId 会让 A 群放开的用户身份泄漏到 B 群。
⚠️ 语义边界：打开 `user` 只是"**允许**以用户身份调用"，**不等于换成发言人的授权**——
lark-cli 一个 appId 只有一份 profile、一份 profile 只挂一个登录人，实际是谁由 `assertIdentity`
核对钉住的 `openId`。要做"按发言人切身份"得绕开 lark-cli 的登录态，本契约不提供。

⚠️ **解析不到 profile 时三方都要按"没有授权"处理，但不能交 `null` 出去**：拉起 dsh 的环境 PATH 里
没有 `~/.local/bin` 时 `lark-cli` 根本找不到，解析结果就是 `profileName = null`。此时：
① **会话环境事实不注入 `DSH_CHAT_LARK_PROFILE`**（值必须是字符串——给非字符串会让 DSH 的 shell env
判错，`bash env contributor "dsh-chat-feishu" returned a non-string value`，**整个 bash 工具起不来**，
表现是"机器人干不了活、只会反复问用户要口径"）；② 提示词段**不印 `--profile null`**，改成
"本会话不要调用 lark-cli + 怎么修"；③ 门禁对"有策略但没 profile"的场合**失败关闭**，
只放 `profile list` / `whoami` / `--help` 这类本机自查命令（拿不到策略时仍放行：那分不清该不该管，
误拦会把正常用法一起打死）。

**可选：`names.resolve({ botId, ids })`** —— 把平台 id 换成人能认出的名字，给设置页的
「访问策略」白名单用（名单里只存 id，一排 `ou_4f6a8c0e…` 认不出是谁，也没法确认自己加错了人）。
返回 `{ names: { id: name }, truncated, hint }`：**查不到的 id 不要放进 `names`**（界面退回显示 id），
`hint` 放"为什么没换到"（多为缺权限，形如 `{ code, message, url }`）；接口本身失败也没关系——
hub 的编辑器 `AccessPolicyEditor` 收不到 `names` 就只显示 id，不会因此挡住改名单。
只有能查名字的渠道才实现它（飞书查群名要 `im:chat:readonly`、人名要通讯录权限；微信没有名字，不实现）。

---

## 6. 每机器人共享设置

位置：`<hub dataDir>/bots.json`（默认 `~/.dsh/integrations/dsh-chat/bots.json`）。

```jsonc
{ "version": 1, "channels": { "feishu": { "bot_xxx": {
  "workspace": "/Users/me", "model": null, "agentPreset": null,
  "contextEnhancement": { "group": {...}, "direct": {...}, "targets": [...] },
  "accessPolicy": null,
  // 控制面板卡片的显示项：私聊/群聊各一份；null = 全显示
  "panelSections": { "direct": { "model": true, "commands": false }, "group": { ... } }
} } } }
```

`panelSections` 的**归一化方向是"缺项 = 显示"**：显示项配置残缺时把卡片变得更空，是"设置页
静默失效"那一类最难查的问题（用户只会觉得"我明明开着"）；多显示一项只是啰嗦。

- 写入是**合并**语义：`write(channelId, botId, { workspace })` 只改这一个键；
- 未知键会被拒绝（防止把渠道私有配置混进来）；
- 原子写（temp + rename），首次覆盖已有文件前落 `.bak-<时间戳>`；
- 渠道自己的协议配置（凭据引用、机器人列表、会话状态、任务过程展示）**不要**放这里，
  放在渠道自己的 `dataDir` 里（例如飞书沿用 `~/.dsh/integrations/dsh-feishu`）。

---

## 7. Client 契约

| 服务 | 提供方 | 用途 |
|---|---|---|
| `chatChannels` | hub | `register({ id, order, label, logo, icon, sessionBadge, capabilities })` → disposer；`entries()` / `get(id)` / `subscribe(fn)` / `getSnapshot()`。`icon` = `{ svg }` 或 `{ uri }`：渠道图标（设置页卡片与会话行徽标共用，取值走 `channelIconUri`）；`sessionBadge` = `{ text, color }`：没有图标时的字徽标回退 |
| `chatUi` | hub | `components` / `hooks` / `installStyles()` / `callChannelRpc` / `callControlRpc` / `unwrapRpc` / `translate` / `react` |

`chatChannels.register` 的 `capabilities` **只影响画不画，不影响功能**：

- `note` —— 机器人列表标题下的一句说明（如「仅私聊」）；
- `setup.label` —— **有**才在机器人列表头部显示通往渠道设置页的入口，名称用它给的
  （如「扫码接入」）。渠道设置页与机器人设置页没区别时**不要给**：那会多出一个点进去
  什么都改不了的空壳入口；
- `setup.hint` —— 该渠道还没有机器人时用来说明怎么接入（"填凭据"还是"扫码"只有渠道
  自己说得清）；没给就退回 hub 的一句中性说明；
- `groups` —— 这个渠道支不支持群聊（微信 `false`）。设置页据此**不画**只有群聊才有的东西，
  文案里也不该出现"群里…"这种只对一个渠道成立的说法；
- `sourceFields` —— 上下文增强的**来源字段**里，这个渠道真能给出值的那些
  （`CONTEXT_FIELDS` 的子集）。**不声明就全列**（向后兼容），但默认全列会带上两个
  **没有任何渠道实现**的字段（`senderName` / `conversationTitle`）——勾了永远没值。
  微信只给 `['channel','senderId','botId']`：它的 `chatId` 恒等于 `senderId`、
  `conversationType` 恒为 `direct`、`threadId` 根本没有。布局守门会把声明与画出来
  的勾选框对起来（多画、少画都红）。
- `panel` —— 这个渠道**有没有卡片控制面板**（默认算有）。`false` = `/menu` 只发文本
  （微信就是：`commands.mjs` 走 `reply` 那条路），此时 `panel.sections` 根本用不上，
  渠道页**不要挂 `PanelSectionsEditor`**——那张卡的开关一个都不生效。
  布局守门会把这条声明与页面画了什么对起来：
  **声明 `panel: false` 却画了「控制面板显示项」（或反之）都会红**。

各项独立：只给 `hint`（飞书：凭据写在渠道自己的配置里，没有渠道级表单）、只给
`label`（微信：有入口、说明用中性句）都是合法形态。

⚠️ **渠道特有的能力，别只靠"把卡挂上去"表达**。微信页上曾经挂过「控制面板显示项」，
而它的 `/menu` 是文本、不画卡片——8 个开关全是摆设（其中「渠道设置」「渠道动作按钮」
微信更是压根没有这两个东西）。判断标准一句话：**这张卡/这个开关，在这个渠道上有没有一条
真实的代码路径会读它？** 没有就别画。

⚠️ **hub 共享组件的文案不许引用页面结构**（"去某张卡里设置"）：hub 不知道各渠道页上有哪些卡。
访问策略的帮助里曾写"属主在「权限与身份」那一组里单独设置"，而微信页上**没有属主卡**
（它的属主 = 扫码绑定的人，不可改），把用户指向了不存在的东西。渠道有特殊语义就通过
props 传（如 `ownerHint`），没传时用中性说法。

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
