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
| `interactions` | 人在环回传：`attach({ channelId, botId, send })` + 入站 `offer({ channelId, botId, key, text })` |
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

### hub 控制端点（渠道无需重复实现）

| method | 载荷 | 说明 |
|---|---|---|
| `channel.list` | `{}` | 契约版本 + hub 版本/包名 + 数据/日志目录 + 全部渠道状态与**渠道包版本**（设置页的「版本与更新」面板用它） |
| `bot.settings.get` | `{ channelId, botId }` | 读每机器人共享设置 |
| `bot.context-enhancement.set` | `{ channelId, botId, config }` | 原子保存上下文增强（含指定设置） |
| `maintenance.import-legacy` | `{ channelId, force }` | 重跑旧 `workspaces.json` 导入（`force:true` 时以旧文件为准刷新） |
| `delivery.list` | `{ channelId, botId }` | 已保存目标 + 渠道发现的候选 |
| `delivery.save` / `delivery.remove` | `{ channelId, botId, target }` / `{ …, targetId }` | 目标增删 |
| `delivery.send` | `{ channelId, botId, targetId, text }` | 主动发一条文本 |
| `delivery.sendFile` | `{ channelId, botId, targetId, path, name? }` | 主动发文件/图片（≤30MB）；渠道没实现 `sendFile` 时明确报 `chat/delivery-unsupported` |

新的渠道无关设置请加在控制端点（hub 一份实现，所有渠道共用），不要在渠道里各写一份。

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
  // 可选：审批（允许/拒绝）
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
- **卡片要反应状态**：过程卡标题有 running / 等你确认 / ✅ 已完成 / ⚠️ 未正常完成 四态，配色同步
  （蓝 → 绿 → 橙）；标题不带机器人名前缀（卡片本就在该机器人的会话里）。"处理完还写着正在处理"
  是最容易被当成卡住的呈现问题。
- **过程信息要收进折叠面板**：工具调用、思考（reasoning 摘要）、**已答的提问**合并进**一个**
  `collapsible_panel`，默认收起、展开看全部。标题分两态：**本轮没结束时显示最新的一项**
  （收起状态下用户要知道此刻在干什么），**结束后才显示 `工具与思考(N)`**。
- **一行一项，形态对齐 Web 会话**：`工具调用 · wiki_get · 永辉/组织架构/品类架构`、
  `思考 · …`、`提问 · 口径 → 答案`；已知工具用自己的标题（`Bash · 描述`、`读取 · 路径`、
  `搜索 · query`、`Skill · 技能名`），未知工具保留工具名。只有工具名等于没信息，
  因此摘要必须从参数里挑（口径见 `turn-presenter.mjs` 的 `TOOL_VARIANTS`/`SUMMARY_KEYS`，
  与 DSH Web 的 `dsh-client-ui-tool` 一致）。
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
  「渠道 · 」前缀——两者都幂等、失败只打日志。渠道通过 `ensure()`/`ask()` 的
  `channelLabel` / `botLabel` 提供中文名（hub 不认平台）。
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
  因此图片消息同样带得上来来源与提示词。
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
| `ask({ channelId, botId, key, workspacePath, content, sourceGuidance, mode, signal, handlers })` | 跑完一轮：先开 follow 基线再发 prompt，`turn/end` 时返回 `{ sessionId, text, reason, tools, files }`（`files` = 本轮 `present` 的交付文件，渠道要当附件发出去） |
| `uploadFile({ sessionId, name, bytes })` | 把一段字节入库成**该会话可引用**的文件，返回 `{ receiptId, file }`（入站文件必须走它） |
| `cancel({ channelId, botId, key })` / `reset({ channelId, botId, key })` | 停止当前回合 / 解除绑定（`/new`） |
| `isRunning(sessionId, signal)` / `rename(sessionId, title, signal)` | 运行态 / 改标题 |
| `history({ channelId, botId, key, maxMessages })` | 回看最近几轮：取 `session/follow` 首个 snapshot 的尾部记录，只挑真实对话（注入的上下文与思考不算） |
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
| `chatChannels` | hub | `register({ id, order, label, logo, icon, sessionBadge, capabilities })` → disposer；`entries()` / `get(id)` / `subscribe(fn)` / `getSnapshot()`。`icon` = `{ svg }` 或 `{ uri }`：渠道图标（设置页卡片与会话行徽标共用，取值走 `channelIconUri`）；`sessionBadge` = `{ text, color }`：没有图标时的字徽标回退 |
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
