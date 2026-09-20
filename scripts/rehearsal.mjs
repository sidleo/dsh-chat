#!/usr/bin/env node
/**
 * 离线端到端演练（`npm run rehearsal`）。
 *
 * 为什么要有它：真机验证要先重启 `dsh web`、还要有一台能用的机器人；而"改完这一步到底
 * 通不通"这件事，本仓库栽过的几次都是**逻辑层**的问题（卡片动作没排在应答之后、一轮答案
 * 只取最后一段、图片被拒后静默丢掉…）。这个脚本用**真实的 hub 与真实的飞书卡片构建器**、
 * 配一个脚本化的假 DSH 网关，把主要用户路径从头走一遍——不需要凭据、不联网、不动真数据。
 *
 * 范围：hub 服务面（会话桥 / 命令内核 / 访问策略 / 控制面板 / 上下文增强 / 延迟交付 / 诊断）
 * ＋ 飞书卡片的渲染与回调翻译。**不含** Lark SDK 长连接与真实平台（那只能真机验）。
 *
 * 用法：`npm run rehearsal`（先 `npm run build`，再在本进程里跑一遍）。
 * 退出码：全部通过 0；任何一步失败 1（并打印失败原因）。
 *
 * @module dsh-chat/scripts/rehearsal
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { apply as applyFixture } from '../packages/dsh-chat-fixture/host/index.mjs';
import { createFeishuBridge } from '../packages/dsh-chat-feishu/host/bridge.mjs';
import { panelCard } from '../packages/dsh-chat-feishu/host/panel-card.mjs';
import { createFeishuStateStore } from '../packages/dsh-chat-feishu/host/state-store.mjs';
import { apply as applyHub } from '../packages/dsh-chat/host/plugin.mjs';
import * as accessPolicy from '../packages/dsh-chat/shared/access-policy.mjs';
import { evaluateAccess } from '../packages/dsh-chat/shared/access-policy.mjs';
import { resolveContextScope } from '../packages/dsh-chat/shared/context-enhancement.mjs';
import { enhanceReplyReference } from '../packages/dsh-chat/shared/reply-reference.mjs';

const BOT = 'bot_rehearsal';
const KEY = 'p2p:ou_owner';
const OWNER = 'ou_owner';

/* ------------------------------------------------------------------ 假的宿主环境 */

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

function makeLogger(sink) {
  const logger = () => logger;
  for (const level of ['debug', 'info', 'warn', 'error']) {
    logger[level] = (message) => sink.push(`${level}: ${String(message)}`);
  }
  return logger;
}

/** 假 DSH 网关：把 `session/*` 的桩数据编成脚本，可编排"这一轮产出什么"。 */
function createFakeAgent() {
  const state = {
    sessions: new Set(),
    seq: 0,
    prompts: [],
    selects: [],
    /** 每次 follow 用一段帧；用完后重复最后一段。 */
    scripts: [],
    scriptIndex: 0,
    invites: 0,
    /** 下一次 `session/prompt` 抛的错（用来演"模型不收图片"）。 */
    failPromptOnce: null,
    /** `session/rename` 的入参（`/retitle` 用）。 */
    renames: [],
    /** 会话标题：rename 之后 `session/list` 要能读到新标题（`/retitle` 的幂等靠它）。 */
    titles: new Map(),
  };
  /**
   * 一段脚本化回合。
   *
   * snapshot 的 `records` 里也放上助手正文：延迟交付的探针复盘读的是**历史**（首个 snapshot），
   * 只放事件流的话它会以为"跑完但没内容"。
   */
  const frames = (parts) => [
    {
      type: 'snapshot',
      cursor: 1,
      hasMore: false,
      records: parts.map((text, index) => ({
        type: 'event',
        event: {
          type: 'assistant/message',
          seq: 10 + index,
          data: { turn: 1, message: { role: 'assistant', content: [{ type: 'text', text }] } },
        },
      })),
    },
    { type: 'event', event: { type: 'turn/start', seq: 2, data: { turn: 1 } } },
    ...parts.flatMap((text, index) => [
      {
        type: 'event',
        event: {
          type: 'assistant/message',
          seq: 3 + index * 2,
          data: { turn: 1, step: index + 1, message: { content: [{ type: 'text', text }] } },
        },
      },
      ...(index === 0
        ? [{
          type: 'event',
          event: {
            type: 'tool/call',
            seq: 4,
            data: { turn: 1, step: 1, callId: 'call-1', name: 'bash', arguments: '{"cmd":"ls"}' },
          },
        }]
        : []),
    ]),
    { type: 'event', event: { type: 'turn/end', seq: 90, data: { turn: 1, reason: { kind: 'completed' } } } },
  ];
  /** 卡死的流：产出到一半就再也不动了（演超时；迭代器永远不结束）。 */
  const stuck = () => [
    { type: 'snapshot', cursor: 1, records: [], hasMore: false },
    { type: 'event', event: { type: 'turn/start', seq: 2, data: { turn: 1 } } },
  ];

  return {
    state,
    frames,
    stuck,
    gateway: {
      async invoke({ namespace, method, args }) {
        if (namespace === 'session' && method === 'modelCatalog') {
          return {
            default: { provider: 'demo', model: 'text-only' },
            routableProviders: ['demo'],
            groups: [{
              id: 'demo',
              name: 'Demo',
              models: [
                { id: 'text-only', name: '纯文本' },
                { id: 'vision', name: '能看图' },
              ],
            }],
          };
        }
        if (namespace === 'workspace' && method === 'create') {
          const path = args?.request?.path;
          return { workspace: { workspaceId: 'ws_1', path, title: path, sessionIds: [] }, created: false };
        }
        if (namespace === 'session' && method === 'create') {
          state.seq += 1;
          const sessionId = `rehearsal-${state.seq}`;
          state.sessions.add(sessionId);
          return { sessionId };
        }
        if (namespace === 'session' && method === 'list') {
          return {
            items: [...state.sessions].map((sessionId, index) => ({
              sessionId,
              running: index === 0,
              cwd: '/tmp/rehearsal-ws',
              updatedAt: Date.now(),
              projections: { values: { title: state.titles.get(sessionId) ?? '演练会话' } },
            })),
          };
        }
        if (namespace === 'session' && method === 'prompt') {
          state.prompts.push(args?.request ?? {});
          if (state.failPromptOnce) {
            const error = state.failPromptOnce;
            state.failPromptOnce = null;
            throw error;
          }
          return { accepted: true };
        }
        if (namespace === 'session' && method === 'selectModel') {
          state.selects.push(args?.request ?? {});
          return { selected: { ...(args?.request ?? {}) } };
        }
        if (namespace === 'session' && method === 'page') {
          const sessionId = args?.request?.address?.sessionId;
          if (!state.sessions.has(sessionId)) {
            throw Object.assign(new Error('session not found'), { code: 'session/not-found', details: {} });
          }
          return { records: [], hasMore: false };
        }
        if (namespace === 'session' && method === 'cancel') return { accepted: true };
        if (namespace === 'session' && method === 'rename') {
          const request = args?.request ?? {};
          state.renames.push(request);
          if (request.sessionId) state.titles.set(request.sessionId, request.title);
          return {};
        }
        if (namespace === 'commands' && method === 'execute') {
          return { commandId: 'cmd_1', result: { kind: 'success', text: '压缩完成。' } };
        }
        throw Object.assign(new Error(`未打桩的网关方法 ${namespace}/${method}`), {
          code: 'gateway/method-unavailable',
        });
      },
      async stream({ namespace, method }) {
        if (namespace !== 'session' || method !== 'follow') {
          throw Object.assign(new Error('只有 session/follow 是流式'), { code: 'gateway/method-unavailable' });
        }
        const entry = state.scripts[state.scriptIndex] ?? state.scripts.at(-1) ?? [];
        state.scriptIndex += 1;
        const script = Array.isArray(entry) ? entry : (entry.frames ?? []);
        const hang = !Array.isArray(entry) && entry.hang === true;
        return (async function* iterate() {
          for (const frame of script) yield frame;
          // 卡死："既不结束也不再产出"——真机上超时兜底盯的就是这个。
          if (hang) await new Promise(() => {});
        })();
      },
    },
  };
}

/** 最小假 Cordis 上下文（与 DSH 的 provide/inject/effect 同形）。 */
function createFakeCtx(agent) {
  const services = new Map();
  const routes = new Map();
  const effects = [];
  const logs = [];
  const uploads = [];
  /** 假 systemPrompt：只收段，并按 agent 组装出文本（够演练"提示词走系统提示词"这条）。 */
  const promptSections = new Map();
  const systemPrompt = {
    section(definition) {
      promptSections.set(definition.name, definition);
      return () => promptSections.delete(definition.name);
    },
    /** 按 agent 组装：把所有已注册段按 order 拼起来（空段丢掉）。 */
    assembleFor(agent = {}) {
      return [...promptSections.values()]
        .sort((a, b) => a.order - b.order)
        .map((definition) => (typeof definition.text === 'function'
          ? definition.text({ agent })
          : definition.text))
        .filter((text) => typeof text === 'string' && text.trim())
        .join('\n\n');
    },
  };
  const ctx = {
    logger: makeLogger(logs),
    provide(name, value) {
      services.set(name, value);
      return () => services.delete(name);
    },
    effect(fn) {
      const dispose = fn();
      effects.push(dispose);
      return dispose;
    },
    inject(_deps, callback) {
      callback(ctx);
      return () => {};
    },
    get(name) {
      if (name === 'systemPrompt') return systemPrompt;
      if (name === 'agentPresets') {
        return { remoteExportList: async () => ({ presets: [{ id: 'standard', isDefault: true }] }) };
      }
      if (name === 'fileUploads') {
        return {
          async uploadStream(request) {
            const chunks = [];
            for await (const chunk of request.data) chunks.push(chunk);
            const bytes = Buffer.concat(chunks);
            uploads.push({ name: request.name, bytes: bytes.length });
            return {
              receiptId: `receipt-${uploads.length}`,
              file: { attachmentId: 'sha256:x', name: request.name, bytes: bytes.length },
            };
          },
        };
      }
      return undefined;
    },
    tools: { register: () => () => {} },
    connection: {
      fetch: {
        register(route) {
          routes.set(route.path, route);
          return () => routes.delete(route.path);
        },
      },
    },
    credentials: { resolve: async () => ({ configured: true, value: 'x' }) },
    typertGateway: agent.gateway,
  };
  return {
    ctx,
    systemPrompt,
    promptSections,
    services,
    routes,
    logs,
    uploads,
    disposeAll() {
      for (const dispose of effects.reverse()) if (typeof dispose === 'function') dispose();
    },
  };
}

/**
 * 最小的假 Lark 网关：只实现"卡片交互"这条路要用到的几个方法。
 *
 * 用真实桥跑这一步是为了验**顺序**——"卡片更新排在回调应答之后"这条真机教训，
 * 只有在真实桥上跑一遍才算数（hub 侧看不出来）。
 */
function createFakeLarkGateway() {
  const calls = { created: [], updated: [], patched: [], texts: [], cards: [] };
  return {
    calls,
    async sendCard({ chatId, card }) {
      calls.created.push({ chatId, card });
      return { messageId: `om_sent_${calls.created.length}` };
    },
    /** 「不显示过程」的答案走这里（新卡，不是 patch 过程卡）。 */
    async replyCard({ messageId, card }) {
      calls.cards.push({ messageId, card });
      return { messageId: `om_card_${calls.cards.length}` };
    },
    async updateCard({ token, card }) {
      calls.updated.push({ token, card });
      return {};
    },
    async patchCard({ messageId, card }) {
      calls.patched.push({ messageId, card });
      return {};
    },
    async replyText({ messageId, text }) {
      calls.texts.push({ messageId, text });
      return {};
    },
    async addReaction() { return {}; },
    async removeReaction() { return {}; },
    async markCardAnswered() { return {}; },
  };
}

/* ------------------------------------------------------------------ 演练本身 */

const results = [];
let current = '';

/** 记一步：抛错 = 这一步失败，后续步骤继续跑（一次看全）。 */
async function step(title, run) {
  current = title;
  try {
    const detail = await run();
    results.push({ title, ok: true, detail: detail ?? '' });
    console.log(`✅ ${title}${detail ? `\n   ${detail}` : ''}`);
  } catch (error) {
    results.push({ title, ok: false, detail: error?.message ?? String(error) });
    console.log(`❌ ${title}\n   ${error?.message ?? error}`);
    if (process.env.DSH_CHAT_REHEARSAL_DEBUG) console.log(error?.stack ?? '');
  }
}

function callRpc(app, method, payload) {
  return app.rpc(method, payload);
}

async function main() {
  console.log('dsh-chat 离线演练：真实 hub + 真实飞书卡片 + 脚本化假 DSH（不需要凭据、不联网）\n');
  /**
   * 按住事件循环。
   *
   * 会话桥的兜底定时器是 `unref` 的（真实进程里由 DSH 自己的句柄撑着，它们不该拖住退出），
   * 这里没有别的句柄——不按住的话，脚本会在"等超时"那一步被 Node 直接收摊。
   */
  const keepAlive = setInterval(() => {}, 60_000);
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-rehearsal-'));
  const agent = createFakeAgent();
  const harness = createFakeCtx(agent);
  // 延迟交付的时间窗压到毫秒级：演练要在几秒内跑完整条补发链路。
  applyHub(harness.ctx, {
    dataDir,
    deferred: { firstCheckMs: 50, intervalMs: 50, maxAgeMs: 3_000 },
  });
  const service = harness.services.get('dshChat');
  assert.ok(service, 'hub 没有发布 dshChat 服务');
  await service.ready();
  // 挂上契约验证假渠道：下面所有流程都经真实的"hub → 渠道 deps"这条路。
  applyFixture({ dshChat: service, effect: (fn) => harness.ctx.effect(fn) });

  /** RPC：直接打 hub 的控制端点（与浏览器走同一条路）。 */
  const app = {
    async rpc(method, payload) {
      const routed = harness.routes?.get?.('/api/dsh-chat/control');
      assert.ok(routed, '控制端点未注册');
      const response = await routed.fetch(new Request('http://127.0.0.1/api/dsh-chat/control', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request', rpcId: 'rehearsal-1',
          method: 'dsh-chat/control', payload: { method, payload },
        }),
      }));
      const body = await response.json();
      if (body?.result === undefined) {
        throw new Error(`控制端点返回了意外载荷（HTTP ${response.status}）：${JSON.stringify(body).slice(0, 200)}`);
      }
      return body.result;
    },
  };

  try {
    // ① 渠道注册：hub 把该给的依赖全给了（少一个这里就亮红）
    await step('渠道注册：假渠道启动，hub 给齐全部依赖（少一个就报出来）', async () => {
      const deadline = Date.now() + 2_000;
      let entry = service.channels.list().find((row) => row.id === 'fixture');
      while (entry?.status !== 'running' && Date.now() < deadline) {
        await new Promise((resolve) => { setTimeout(resolve, 10); });
        entry = service.channels.list().find((row) => row.id === 'fixture');
      }
      assert.equal(entry?.status, 'running', `渠道未就绪：${JSON.stringify(entry)}`);
      const status = await service.channels.call('fixture', 'connection.status', {});
      assert.equal(status.ok, true);
      const missing = Object.entries(status.value.capabilities)
        .filter(([, ok]) => ok !== true).map(([name]) => name);
      assert.deepEqual(missing, [], `hub 没给这些依赖：${missing.join('、')}`);
      return `依赖自检 ${Object.keys(status.value.capabilities).length} 项全通过`;
    });

    // ② 会话桥：一问一答（多段正文都要带上，工具调用不能丢）
    await step('私聊一问一答：建工作区 → 建会话 → 绑定 → 回答（多段正文拼接）', async () => {
      agent.state.scripts.push(agent.frames(['我先查一下数据。', '昨天销售额 1234 万。']));
      const result = await service.sessions.ask({
        channelId: 'fixture', botId: BOT, key: KEY, workspacePath: '/tmp/rehearsal-ws',
        content: [{ type: 'text', text: '昨天卖了多少' }], sourceGuidance: '',
      });
      assert.equal(result.reason.kind, 'completed');
      assert.equal(result.text, '我先查一下数据。\n\n昨天销售额 1234 万。');
      assert.equal(result.tools.length, 1, '工具调用要带出来（过程展示要用）');
      const bound = service.sessions.bindings.get('fixture', BOT, KEY);
      assert.equal(bound.sessionId, 'rehearsal-1');
      return `会话=${result.sessionId} 工具=${result.tools.length} 字=${result.text.length}`;
    });

    // ③ 命令内核（属主 / 非属主两条路）
    await step('命令内核：/whoami 认身份、/help 列出命令、非属主拿不到属主命令', async () => {
      const owner = await service.commands.handle({
        channelId: 'fixture', botId: BOT, key: KEY, text: '/whoami', senderId: OWNER, isOwner: true,
      });
      assert.match(owner.reply, /属主/);
      const help = await service.commands.handle({
        channelId: 'fixture', botId: BOT, key: KEY, text: '/help', senderId: OWNER, isOwner: true,
      });
      assert.match(help.reply, /\/menu/);
      const member = await service.commands.handle({
        channelId: 'fixture', botId: BOT, key: KEY, text: '/diag', senderId: 'ou_member', isOwner: false,
      });
      assert.match(member.reply, /只有属主/);
      return `命令数=${service.commands.list().length}`;
    });

    // ④ 控制面板：读状态 → 飞书卡片 → 下拉回调 → 应用
    await step('控制面板 → 飞书卡片：下拉带 ✓ 当前值，回调翻译后真的落盘', async () => {
      const read = await service.panel.read({
        channelId: 'fixture', botId: BOT, key: KEY, isOwner: true, conversationType: 'direct',
      });
      assert.equal(read.bound, true);
      assert.ok(read.model.options.length >= 2, '模型目录要读出来');
      const card = panelCard(read, { at: '12:00:00' });
      assert.equal(card.schema, '2.0');
      const picks = JSON.stringify(card);
      assert.match(picks, /模型/, '卡片要有模型下拉');
      assert.match(picks, /访问策略/, '卡片要有访问策略下拉');
      assert.match(picks, /✓ /, '当前值要勾出来');

      const applied = await service.panel.apply({
        channelId: 'fixture', botId: BOT, key: KEY, field: 'model',
        value: 'demo/vision', isOwner: true, conversationType: 'direct',
      });
      assert.match(applied.message, /demo\/vision/);
      assert.deepEqual(agent.state.selects.at(-1), {
        sessionId: 'rehearsal-1', provider: 'demo', model: 'vision',
      });
      return `卡片字节=${JSON.stringify(card).length} 选项=${read.model.options.length}`;
    });

    // ⑤ 放宽访问策略必须先确认；确认之前一个字节都不写盘
    await step('访问策略：放宽到「任何人可用」先要确认，确认后才落盘', async () => {
      const asked = await service.panel.apply({
        channelId: 'fixture', botId: BOT, key: KEY, field: 'policy', value: 'open',
        isOwner: true, conversationType: 'group',
      });
      assert.equal(asked.requiresConfirm, true);
      assert.equal(service.bots.read('fixture', BOT).accessPolicy ?? null, null, '确认前不该落盘');
      const done = await service.panel.apply({
        channelId: 'fixture', botId: BOT, key: KEY, field: 'policy', value: 'open',
        isOwner: true, conversationType: 'group', confirm: true,
      });
      assert.match(done.message, /任何人可用/);
      const saved = service.bots.read('fixture', BOT).accessPolicy;
      assert.equal(saved.group.mode, 'open');
      assert.equal(saved.direct.mode, 'allowlist', '另一份补默认值，策略永远是成对的');
      // 放宽之后：不在名单里的陌生人也能对话（真实策略引擎判定）；私聊那份仍是 allowlist。
      const groupGate = evaluateAccess({
        policy: saved, conversationType: 'group', senderIds: ['ou_stranger'], isOwner: false,
      });
      assert.equal(groupGate.allowed, true, 'open 之后群里陌生人可对话');
      const directGate = evaluateAccess({
        policy: saved, conversationType: 'direct', senderIds: ['ou_stranger'], isOwner: false,
      });
      assert.equal(directGate.allowed, false, '私聊那份没动，仍是名单制');
      return '确认前不落盘 → 确认后 group=open、direct=allowlist（成对）';
    });

    // ⑥ 上下文增强：为本会话建一份专属设置（复制全局），解析结果随之改变
    await step('上下文增强：本会话专属设置（复制全局）立刻改变注入内容', async () => {
      const global = {
        direct: { enabled: true, fields: ['senderId'], guidance: '全局：礼貌一点' },
        group: { enabled: false, fields: ['senderId'], guidance: '' },
        targets: [],
      };
      await service.bots.write('fixture', BOT, { contextEnhancement: global });
      const applied = await service.panel.apply({
        channelId: 'fixture', botId: BOT, key: KEY, field: 'context', value: 'own',
        isOwner: true, conversationType: 'direct',
      });
      assert.match(applied.message, /专属设置/);
      const saved = service.bots.read('fixture', BOT).contextEnhancement;
      const own = saved.targets.find((item) => item.id === OWNER);
      assert.equal(own.guidance, '全局：礼貌一点', '把全局那份复制过来作为起点');
      // 改成本会话专用的提示词后，解析结果只认它（不再叠全局）。
      await service.bots.write('fixture', BOT, {
        contextEnhancement: { ...saved, targets: [{ ...own, guidance: '只对这个人说的' }] },
      });
      const scope = resolveContextScope(
        service.bots.read('fixture', BOT).contextEnhancement, 'direct', { senderId: OWNER },
      );
      assert.equal(scope.guidance, '只对这个人说的');

      // 提示词本身走**系统提示词段**（不是拼在飞书那条消息前面）：
      // ① 段已注册；② 按 agent 组装得到本会话的提示词；③ 别的会话组装不到东西；
      // ④ 消息正文里只剩来源块，没有 <dsh_im_source_guidance>。
      agent.state.scripts.push(agent.frames(['收到。']));
      /**
       * 走**渠道 deps**那条路拼正文（不是服务面那份）：真机上翻过一次车——
       * 服务面给了包装版 enhanceContent、渠道 deps 拿的是原始模块，于是正文里还是带着提示词，
       * 而这里若直接调服务面就永远发现不了。假渠道的 `context.resolve` 用的就是它自己的 deps。
       */
      const resolved = await service.channels.call('fixture', 'context.resolve', {
        config: service.bots.read('fixture', BOT).contextEnhancement,
        conversationType: 'direct',
        identity: { senderId: OWNER },
      });
      assert.equal(resolved.ok, true);
      const content = [{ type: 'text', text: resolved.value.text }];
      assert.ok(!resolved.value.text.includes('只对这个人说的'),
        '提示词已在系统提示词段里，渠道拼正文时不该再拼一份');
      await service.sessions.ask({
        channelId: 'fixture', botId: BOT, key: KEY, workspacePath: '/tmp/rehearsal-ws',
        content, sourceGuidance: scope.guidance,
      });
      const section = harness.promptSections.get('dsh-chat:source-guidance');
      assert.ok(section, '增强提示词段没有注册到 systemPrompt');
      assert.equal(section.order, 400);
      assert.equal(harness.systemPrompt.assembleFor({ id: 'rehearsal-1' }), '只对这个人说的');
      assert.equal(harness.systemPrompt.assembleFor({ id: '别的会话' }), '',
        '不是我们的会话不该拿到这段提示词');
      const prompted = agent.state.prompts.at(-1).content
        .filter((part) => part.type === 'text').map((part) => part.text).join('\n');
      assert.ok(!prompted.includes('<dsh_im_source_guidance>'),
        '提示词已经在系统提示词里，正文不该再拼一份');
      assert.ok(prompted.includes('<dsh_im_source>'), '来源块仍然跟着这条消息');
      return `target=${own.kind}:${own.id} fields=${own.fields.length} 段=${section.order}`;
    });

    // ⑦ 图片回退：模型不收图片 → 换成同一会话的文件重试一次
    await step('图片回退：模型拒绝图片后改成会话文件重试，答案前有说明', async () => {
      agent.state.scripts.push(agent.frames(['我看不到图，但读了这个文件。']));
      agent.state.failPromptOnce = Object.assign(new Error('Model "text-only" does not support image input.'), {
        code: 'session/attachment-invalid',
        details: { reason: 'MODEL_DOES_NOT_SUPPORT_IMAGES' },
      });
      const before = harness.uploads.length;
      const result = await service.sessions.ask({
        channelId: 'fixture', botId: BOT, key: 'p2p:ou_pic', workspacePath: '/tmp/rehearsal-ws',
        content: [
          { type: 'text', text: '看看这张图' },
          { type: 'image', mediaType: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'), name: 'feishu-image' },
        ],
        sourceGuidance: '',
      });
      assert.match(result.text, /^⚠️ 当前模型不支持图片输入/);
      assert.match(result.text, /我看不到图/);
      assert.deepEqual(harness.uploads.slice(before), [{ name: 'feishu-image.png', bytes: 4 }]);
      const last = agent.state.prompts.at(-1);
      assert.deepEqual(last.content.map((part) => part.type), ['text', 'file', 'text']);
      return `上传=${harness.uploads.length} 重试内容=${last.content.map((part) => part.type).join('+')}`;
    });

    // ⑧ 延迟交付：超时 → 登记 → 跑完之后补发
    await step('延迟交付：判定超时后不等死，之后跑完的结果会补发', async () => {
      const delivered = [];
      service.deferred.register({
        channelId: 'fixture',
        botId: BOT,
        deliver: async ({ key, text }) => delivered.push({ key, text }),
      });
      agent.state.scripts.push({ frames: agent.stuck(), hang: true });
      const result = await service.sessions.ask({
        channelId: 'fixture', botId: BOT, key: 'p2p:ou_slow', workspacePath: '/tmp/rehearsal-ws',
        content: [{ type: 'text', text: '跑个长任务' }], sourceGuidance: '', turnTimeoutMs: 200,
      });
      assert.equal(result.reason.kind, 'timeout');
      const pending = service.deferred.list().filter((row) => row.key === 'p2p:ou_slow');
      assert.equal(pending.length, 1, '超时要登记一条待交付');
      // 会话真的跑完了：桥的探针读到正文，延迟交付服务随即补发。
      agent.state.scripts.push(agent.frames(['超时之后才跑完的答案']));
      const deadline = Date.now() + 5_000;
      while (delivered.length === 0 && Date.now() < deadline) {
        await new Promise((resolve) => { setTimeout(resolve, 25); });
      }
      assert.equal(delivered.length, 1, '盯到结果后要补发');
      assert.equal(delivered[0].text, '超时之后才跑完的答案');
      assert.equal(service.deferred.list().filter((row) => row.key === 'p2p:ou_slow').length, 0,
        '补发后记录清掉');
      return `待交付=${pending.length} → 补发 ${delivered[0].text.length} 字`;
    });

    // ⑨ 诊断：一屏现场（渠道状态 + 待补发）
    await step('诊断：一屏给出数据目录、渠道状态与待补发记录', async () => {
      const result = await callRpc(app, 'diagnostics.read', {});
      assert.equal(result.ok, true);
      assert.ok(result.value.dataDir.includes('dsh-chat-rehearsal-'));
      assert.ok(Array.isArray(result.value.deferred));
      const diag = await service.commands.handle({
        channelId: 'fixture', botId: BOT, key: KEY, text: '/diag', senderId: OWNER, isOwner: true,
      });
      assert.match(diag.reply, /🩺 诊断/);
      assert.match(diag.reply, /数据目录/);
      return `渠道=${result.value.channels.length}`;
    });
    // ⑩ 真实飞书桥：卡片更新排在应答之后（真机栽过"闪一下又变回去"），访问策略确认走完整回路
    await step('真实飞书桥：按钮更新排在应答之后；访问策略放宽先在卡上确认', async () => {
      const gateway = createFakeLarkGateway();
      const feishuState = createFeishuStateStore({
        path: join(dataDir, 'feishu-state.json'), logger: silentLogger,
      });
      await feishuState.load();
      /** 应答之后的重画排期先收集起来：这样能显式断言"应答前一次都没更新"。 */
      const paints = [];
      const deps = {
        channelId: 'feishu',
        dataDir,
        logger: silentLogger,
        ready: () => service.ready(),
        scheduleAfterResponse: (task) => { paints.push(task); },
        storage: service.bots.storageFor('feishu'),
        contextEnhancement: service.contextEnhancement,
        replyReference: service.replyReference,
        accessPolicy,
        commands: service.commands,
        panel: service.panel,
        sessions: service.sessions,
        deferred: service.deferred,
      };
      const bot = {
        id: 'bot_rehearsal_feishu',
        appId: 'cli_rehearsal',
        ownerOpenIds: [OWNER],
        botName: '演练机器人',
        stepPushDirect: 'off',
        stepPushGroup: 'off',
      };
      const bridge = createFeishuBridge({ bot, deps, gateway, state: feishuState, logger: silentLogger });
      // 先把这个会话绑上，面板状态才是"有会话"的样子。
      await service.bots.write('feishu', bot.id, { workspace: '/tmp/rehearsal-ws' });
      await service.sessions.ensure({
        channelId: 'feishu', botId: bot.id, key: KEY, workspacePath: '/tmp/rehearsal-ws',
      });

      const button = await bridge.handleCardAction({
        chatId: 'oc_rehearsal',
        messageId: 'om_card_1',
        token: 'tk_button',
        operator: { openId: OWNER },
        action: { tag: 'button', value: { dsh_panel: 'status' } },
      });
      assert.ok(button?.toast, '按钮要有应答');
      assert.equal(gateway.calls.updated.length, 0, '应答之前一次都不该更新卡片');
      assert.equal(gateway.calls.patched.length, 0);
      for (const task of paints.splice(0)) await task();
      assert.equal(gateway.calls.updated.length, 1, '重画发生在应答之后（token 路径）');
      assert.match(JSON.stringify(gateway.calls.updated[0].card), /机器人/);

      const picked = await bridge.handleCardAction({
        chatId: 'oc_rehearsal',
        messageId: 'om_card_1',
        token: 'tk_policy',
        operator: { openId: OWNER },
        action: {
          tag: 'select_static', name: 'policy_pick', options: ['open'], value: { action: 'policy_pick' },
        },
      });
      assert.match(picked.toast.content, /需要确认/);
      for (const task of paints.splice(0)) await task();
      const pendingCard = JSON.stringify(gateway.calls.updated.at(-1).card);
      assert.match(pendingCard, /待确认/, '确认做在同一张卡上');
      assert.match(pendingCard, /✅ 确认/);
      const saved = service.bots.read('feishu', bot.id).accessPolicy;
      assert.notEqual(saved?.direct?.mode, 'open', '确认之前一个字节都不该写盘');

      const confirmed = await bridge.handleCardAction({
        chatId: 'oc_rehearsal',
        messageId: 'om_card_1',
        token: 'tk_confirm',
        operator: { openId: OWNER },
        action: { tag: 'button', value: { dsh_confirm: true } },
      });
      assert.match(confirmed.toast.content, /任何人可用|已生效/);
      for (const task of paints.splice(0)) await task();
      assert.equal(service.bots.read('feishu', bot.id).accessPolicy?.direct?.mode, 'open',
        '确认后才真的落盘');

      /**
       * 「不显示过程」（这台机器人就是 off）：**答案仍要走卡片**——表格/代码块/链接
       * 用纯文本发出去格式全没了。这里在真实桥上跑一遍，断言"新卡 + 正文是答案 + 没有文本回复"。
       */
      agent.state.scripts.push(agent.frames(['| 门店 | 销售额 |\n| --- | --- |\n| A | 12 |']));
      const before = { cards: gateway.calls.cards.length, texts: gateway.calls.texts.length };
      await bridge.accept({
        sender: { sender_id: { open_id: OWNER } },
        message: {
          message_id: 'om_off_1',
          chat_id: 'oc_rehearsal',
          chat_type: 'p2p',
          message_type: 'text',
          content: JSON.stringify({ text: '给我一张表' }),
        },
      });
      const answerCard = gateway.calls.cards.at(-1)?.card;
      assert.ok(gateway.calls.cards.length === before.cards + 1, 'off 模式的答案要发一张新卡');
      assert.equal(gateway.calls.texts.length, before.texts, 'off 模式不发文本回复');
      assert.match(JSON.stringify(answerCard), /门店/);
      assert.match(JSON.stringify(answerCard), /\| --- \|/, 'Markdown 表格原样进卡片');
      return `应答后更新=${gateway.calls.updated.length} 次、确认前未落盘、确认后 direct=open、`
        + 'off 答案=卡片';
    });

    // ⑪ 引用回复：被引用正文进提示词；读不到也不能丢当前问题
    await step('引用回复：被引用正文进提示词，读不到只加标记、不丢当前问题', async () => {
      const ok = enhanceReplyReference(
        [{ type: 'text', text: '那昨天呢' }],
        { messageId: 'om_q', senderId: 'ou_boss', kind: 'text', text: '上周的销售额是多少？' },
      );
      const text = ok.map((part) => part.text ?? '').join('');
      assert.match(text, /<dsh_im_reply>/);
      assert.match(text, /上周的销售额是多少？/);
      assert.match(text, /那昨天呢/);
      const missing = enhanceReplyReference(
        [{ type: 'text', text: '那昨天呢' }],
        { messageId: 'om_gone', kind: 'text', reason: '读不到被引用的消息' },
      );
      const missingText = missing.map((part) => part.text ?? '').join('');
      assert.match(missingText, /引用内容不可用/);
      assert.match(missingText, /那昨天呢/, '读不到引用也要保住当前问题');
      return `<dsh_im_reply> 标签 + 读不到时的标记都在`;
    });

    // ⑫ /retitle：一次性给历史会话补「渠道 · 聊天 ·」前缀（幂等，且聊天身份可升级）
    await step('/retitle：历史会话补「渠道 · 聊天 ·」前缀，重复执行不重复加', async () => {
      // 数**增量**：别的步骤（例如飞书桥那条）也会改标题，绝对值会被它们影响。
      const renamedBefore = agent.state.renames.length;
      const first = await service.commands.handle({
        channelId: 'fixture', botId: BOT, key: KEY, text: '/retitle',
        senderId: OWNER, isOwner: true, channelLabel: '试用渠道',
      });
      assert.match(first.reply, /检查了 3 个绑定会话：补上 3 个/, first.reply);
      assert.equal(agent.state.renames.length - renamedBefore, 3, '三个绑定会话各改一次标题');
      assert.match(
        agent.state.renames[renamedBefore].title,
        /^试用渠道 · (私聊|群) [^·]+ · /,
        `标题要带"渠道 + 哪个聊天"：${JSON.stringify(agent.state.renames[renamedBefore])}`,
      );
      const second = await service.commands.handle({
        channelId: 'fixture', botId: BOT, key: KEY, text: '/retitle',
        senderId: OWNER, isOwner: true, channelLabel: '试用渠道',
      });
      assert.match(second.reply, /已有前缀 3 个/, `第二次应是幂等的：${second.reply}`);
      assert.equal(agent.state.renames.length - renamedBefore, 3, '幂等：第二次不再改名');
      const member = await service.commands.handle({
        channelId: 'fixture', botId: BOT, key: KEY, text: '/retitle', senderId: 'ou_x', isOwner: false,
      });
      assert.match(member.reply, /只限属主/);
      return `重命名 ${agent.state.renames.length - renamedBefore} 次，第二次幂等（已有前缀 3 个）`;
    });

    // ⑬ 会话不能共用：别人正在用的会话不出现在候选里，硬切也被拒（并说清是谁占着）
    await step('会话共享限制：别人正在用的会话不列、切换被拒且给出可读理由', async () => {
      const otherKey = 'group:oc_shared';
      await service.sessions.bindings.bind('fixture', BOT, otherKey, { sessionId: 'rehearsal-1' });
      const current = service.sessions.bindings.get('fixture', BOT, KEY);
      const view = await service.panel.read({
        channelId: 'fixture', botId: BOT, key: otherKey, conversationType: 'group',
      });
      assert.ok(view.session, '面板要给出会话段');
      assert.equal(view.session.options.some((item) => item.id === 'rehearsal-1'), true,
        '当前绑定的那个会话本身要在列表里');

      // KEY 这个聊天想切到别人正在用的 rehearsal-1 → 拒绝，并说清是谁占着。
      await assert.rejects(
        () => service.panel.apply({
          channelId: 'fixture', botId: BOT, key: KEY, field: 'session',
          value: current.sessionId, isOwner: true, conversationType: 'direct',
        }),
        (error) => {
          assert.equal(error.code, 'chat/session-in-use');
          assert.match(error.message, /群 oc_shared/);
          return true;
        },
      );
      // 归还绑定，别影响后续步骤。
      await service.sessions.bindings.bind('fixture', BOT, otherKey, { sessionId: 'rehearsal-9' });
      return '候选里不列 + 硬切被拒（群 oc_shared）';
    });

  } finally {
    harness.disposeAll();
    clearInterval(keepAlive);
    // 让日志落盘这类收尾动作先跑完：立刻删目录会在末尾喷一条 ENOENT（会误导人）。
    await new Promise((resolve) => { setTimeout(resolve, 50); });
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }

  const failed = results.filter((row) => !row.ok);
  console.log(`\n演练结果：${results.length - failed.length}/${results.length} 通过`
    + `${failed.length > 0 ? `，失败：${failed.map((row) => row.title).join('、')}` : ''}`);
  if (harness.logs.some((line) => line.startsWith('error'))) {
    console.log('\n（期间有 error 级日志，可能是被断言覆盖的负路径；设 DSH_CHAT_REHEARSAL_DEBUG=1 看细节）');
  }
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`演练没能跑起来（这一步之前就崩了）：${error?.message ?? error}`);
  if (process.env.DSH_CHAT_REHEARSAL_DEBUG) console.error(error?.stack ?? '');
  process.exitCode = 1;
});
