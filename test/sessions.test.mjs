/**
 * 会话桥：绑定、创建、prompt、follow 流式回合、取消、审批回传。
 *
 * 假 gateway 严格按 DSH 0.1.5-rc.2 的 wire 契约实现（`request` 包装、
 * `session/list` 用 `_request`、follow 用 stream），因此这些测试同时固定住了
 * "我们调用得对不对"这件事。
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionStore } from '../packages/dsh-chat/host/session-store.mjs';
import { createSessionBridge } from '../packages/dsh-chat/host/sessions.mjs';

const silentLogger = { info() {}, warn() {}, error() {} };

function remoteError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  error.details = {};
  return error;
}

/** 一个可编排的假 DSH：记录调用，并按脚本逐个产出 follow 帧。 */
function createFakeGateway({
  script = [], stuckReturn = false, stuckPrompt = false, failPrompt = false,
  pageRecords = [], frameDelayMs = 0, stuckStream = false, sessionTitles = {},
  commandResult = { commandId: 'cmd_1', result: { kind: 'success', text: 'Compaction finished.' } },
  failSelectModel = null,
  /** 一次性让 prompt 抛错（模拟"会话选的模型被删了"这类失败）。 */
  failPromptOnce = null,
  /** 模型目录（自救要用它挑一个可用模型）。 */
  catalog = { default: { provider: 'p', model: 'm' }, groups: [{ id: 'p', models: [{ id: 'm' }] }] },
  /** 每次 invoke 的旁路回调（断言调了哪些方法）。 */
  onInvoke = null,
  /** true：每次都从脚本头开始（自救会开第二条 follow 流，用同一条脚本更稳定）。 */
  repeatScript = false,
} = {}) {
  const calls = [];
  const sessions = new Set();
  const knownWorkspaces = new Map();
  let sessionSeq = 0;
  let scriptIndex = 0;

  const gateway = {
    calls,
    sessions,
    /** 预先让某个会话"已被删除"。 */
    forget(sessionId) {
      sessions.delete(sessionId);
    },
    async invoke({ namespace, method, args }) {
      calls.push({ namespace, method, args });
      onInvoke?.({ namespace, method, args });
      if (namespace === 'session' && method === 'modelCatalog') return catalog;
      if (namespace === 'workspace' && method === 'create') {
        const path = args?.request?.path;
        if (!knownWorkspaces.has(path)) knownWorkspaces.set(path, `ws_${knownWorkspaces.size + 1}`);
        return {
          workspace: { workspaceId: knownWorkspaces.get(path), path, title: path, sessionIds: [] },
          created: false,
        };
      }
      if (namespace === 'session' && method === 'create') {
        sessionSeq += 1;
        const sessionId = `session-${sessionSeq}`;
        sessions.add(sessionId);
        return { sessionId };
      }
      if (namespace === 'session' && method === 'page') {
        const sessionId = args?.request?.address?.sessionId;
        if (!sessions.has(sessionId)) throw remoteError('session/not-found');
        return { records: pageRecords, hasMore: false };
      }
      if (namespace === 'commands' && method === 'execute') {
        return commandResult;
      }
      if (namespace === 'session' && method === 'prompt') {
        if (args?.request?.mode !== 'queue' && args?.request?.mode !== 'steer') {
          throw remoteError('gateway/arguments-invalid');
        }
        if (failPromptOnce) {
          const error = failPromptOnce;
          failPromptOnce = null;
          throw error;
        }
        // 真机上出现过"提示词已受理，但收据迟迟不回"的情况。
        if (stuckPrompt) return new Promise(() => {});
        if (failPrompt) throw remoteError('session/not-found');
        return { accepted: true };
      }
      if (namespace === 'session' && method === 'selectModel') {
        if (failSelectModel) throw failSelectModel;
        const request = args?.request ?? {};
        if (!sessions.has(request.sessionId)) throw remoteError('session/not-found');
        return { selected: { provider: request.provider, model: request.model, reasoningEffort: request.reasoningEffort ?? null } };
      }
      if (namespace === 'session' && method === 'list') {
        return {
          items: [...sessions].map((sessionId, index) => ({
            sessionId,
            running: index === 0,
            ...(sessionTitles[sessionId]
              ? { projections: { asOfSeq: 1, values: { title: sessionTitles[sessionId] } } }
              : {}),
          })),
        };
      }
      if (namespace === 'session' && method === 'cancel') {
        if (!sessions.has(args?.request?.sessionId)) throw remoteError('session/not-found');
        return { accepted: true };
      }
      throw remoteError('gateway/method-unavailable', `未实现的假方法 ${namespace}/${method}`);
    },
    async stream({ namespace, method, args }) {
      calls.push({ namespace, method, args, streaming: true });
      if (namespace !== 'session' || method !== 'follow') {
        throw remoteError('gateway/method-unavailable');
      }
      const frames = script[scriptIndex] ?? (repeatScript ? (script.at(-1) ?? []) : []);
      if (!repeatScript) scriptIndex += 1;
      const iterator = (async function* iterate() {
        for (const frame of frames) {
          if (frameDelayMs > 0) await new Promise((resolve) => { setTimeout(resolve, frameDelayMs); });
          yield frame;
        }
        // 模拟"流既不结束也不再产出"：卡死判定必须兜住这种局面。
        if (stuckStream) await new Promise(() => {});
      })();
      if (!stuckReturn) return iterator;
      // 模拟"订阅关闭请求永远不落地"
      return Object.assign(Object.create(null), {
        [Symbol.asyncIterator]: () => iterator,
        next: (...args) => iterator.next(...args),
        return: () => new Promise(() => {}),
      });
    },
  };
  return gateway;
}

function turnFrames({ turn = 1, text = '你好', deltas = [] } = {}) {
  return [
    { type: 'snapshot', cursor: 3, records: [], hasMore: false },
    { type: 'event', event: { type: 'turn/start', seq: 4, data: { turn } } },
    ...deltas.map((delta, index) => ({
      type: 'assistant-stream',
      frame: { type: 'chunk', chunk: { type: 'text-delta', text: delta }, index },
    })),
    {
      type: 'event',
      event: {
        type: 'tool/call',
        seq: 5,
        data: { turn, step: 1, callId: 'call-1', name: 'bash', arguments: '{"cmd":"ls"}' },
      },
    },
    {
      type: 'event',
      event: {
        type: 'assistant/message',
        seq: 6,
        data: { turn, message: { content: [{ type: 'text', text }] } },
      },
    },
    {
      type: 'event',
      event: { type: 'turn/end', seq: 7, data: { turn, reason: { kind: 'completed' } } },
    },
  ];
}

/** 在 turnFrames 里插一次 `present` 工具调用（不含 deliverables 事件，用于验证兜底）。 */
function withPresentCall(frames, args) {
  const call = {
    type: 'event',
    event: {
      type: 'tool/call',
      seq: 5.5,
      data: { turn: 1, step: 1, callId: 'call-present', name: 'present', arguments: JSON.stringify(args) },
    },
  };
  const at = frames.findIndex((frame) => frame.event?.type === 'turn/end');
  return [...frames.slice(0, at), call, ...frames.slice(at)];
}

/** 在 turnFrames 里插一条 `deliverables/presented`（agent 用 present 声明交付文件）。 */
function withDeliverables(frames, files) {
  const presented = {
    type: 'event',
    event: { type: 'deliverables/presented', seq: 6.5, data: { turn: 1, callId: 'call-present', files } },
  };
  const at = frames.findIndex((frame) => frame.event?.type === 'turn/end');
  return [...frames.slice(0, at), presented, ...frames.slice(at)];
}

async function makeBridge(options = {}) {
  const { settings = null, deferred = null, ...gatewayOptions } = options;
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-sessions-'));
  const store = createSessionStore({ dataDir, logger: silentLogger });
  const gateway = createFakeGateway(gatewayOptions);
  const published = [];
  const bridge = createSessionBridge({
    ctx: { typertGateway: gateway },
    logger: silentLogger,
    store,
    guidance: { publish: (sessionId, text) => published.push({ sessionId, text }) },
    ...(settings ? { settings } : {}),
    ...(deferred ? { deferred } : {}),
  });
  return {
    bridge,
    store,
    gateway,
    published,
    dataDir,
    async cleanup() {
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

test('首次发消息：按路径建工作区 → 建会话 → 绑定；第二次复用同一会话', async () => {
  const app = await makeBridge({ script: [turnFrames(), turnFrames({ text: '第二次' })] });
  try {
    const first = await app.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
      workspacePath: '/Users/me/ws',
      content: [{ type: 'text', text: '你好' }],
      sourceGuidance: '礼貌一点',
    });
    assert.equal(first.text, '你好');
    assert.equal(first.reason.kind, 'completed');

    const bound = app.store.get('feishu', 'bot_1', 'p2p:ou_a');
    assert.equal(bound.sessionId, 'session-1');
    assert.equal(bound.workspacePath, '/Users/me/ws');
    assert.deepEqual(app.published, [{ sessionId: 'session-1', text: '礼貌一点' }]);

    const second = await app.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
      workspacePath: '/Users/me/ws',
      content: [{ type: 'text', text: '再来一次' }],
    });
    assert.equal(second.text, '第二次');
    // 复用会话：只创建过一次 session。
    assert.equal(app.gateway.calls.filter((call) => call.method === 'create' && call.namespace === 'session').length, 1);
    // workspace/create 按路径幂等，但仍会调用（DSH 自身去重）。
    assert.equal(app.store.get('feishu', 'bot_1', 'p2p:ou_a').sessionId, 'session-1');
  } finally {
    await app.cleanup();
  }
});

test('调用参数符合 DSH wire 契约（request 包装与 _request 例外）', async () => {
  const app = await makeBridge({ script: [turnFrames()] });
  try {
    await app.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
      workspacePath: '/ws',
      content: [{ type: 'text', text: '你好' }],
    });
    const byMethod = (namespace, method) => app.gateway.calls.find(
      (call) => call.namespace === namespace && call.method === method,
    );
    assert.deepEqual(Object.keys(byMethod('workspace', 'create').args), ['request']);
    assert.equal(byMethod('workspace', 'create').args.request.path, '/ws');
    assert.deepEqual(Object.keys(byMethod('session', 'create').args), ['request']);
    assert.deepEqual(byMethod('session', 'create').args.request.workspaceId, 'ws_1');
    // 首次使用不探测存在性，直接创建；探测发生在复用路径上。
    assert.equal(byMethod('session', 'page'), undefined);
    await app.bridge.sessionExists('session-1');
    assert.deepEqual(Object.keys(byMethod('session', 'page').args), ['request']);
    assert.equal(byMethod('session', 'page').args.request.throughSeq, -1);
    const promptCall = byMethod('session', 'prompt');
    assert.deepEqual(Object.keys(promptCall.args), ['request']);
    assert.equal(promptCall.args.request.mode, 'queue');
    assert.deepEqual(promptCall.args.request.content, [{ type: 'text', text: '你好' }]);
    assert.ok(typeof promptCall.args.request.requestId === 'string' && promptCall.args.request.requestId);
    const follow = byMethod('session', 'follow');
    assert.equal(follow.streaming, true, 'follow 必须走 stream');
    assert.equal(follow.args.request.assistantStream, true);

    // session/list 的 wire 是 _request。
    await app.bridge.isRunning('session-1');
    const list = byMethod('session', 'list');
    assert.deepEqual(Object.keys(list.args), ['_request']);
    assert.equal(await app.bridge.isRunning('session-1'), true);
  } finally {
    await app.cleanup();
  }
});

test('流式回合：增量、工具调用、最终文本都回调到位', async () => {
  const app = await makeBridge({ script: [turnFrames({ text: '最终答案', deltas: ['最', '终'] })] });
  try {
    const deltas = [];
    const tools = [];
    let turnStarts = 0;
    const result = await app.bridge.ask({
      channelId: 'weixin', botId: 'wx_1', key: 'p2p:user@im.wechat',
      workspacePath: '/ws',
      content: [{ type: 'text', text: '在吗' }],
      handlers: {
        onDelta: (text) => deltas.push(text),
        onToolCall: (event) => tools.push(event.data.name),
        onTurnStart: () => { turnStarts += 1; },
      },
    });
    assert.deepEqual(deltas, ['最', '终']);
    assert.deepEqual(tools, ['bash']);
    assert.equal(turnStarts, 1);
    assert.equal(result.text, '最终答案');
    assert.deepEqual(result.tools.map((tool) => tool.name), ['bash']);
  } finally {
    await app.cleanup();
  }
});

test('回合里 present 交付的文件要带回给渠道（渠道据此当附件发送）', async () => {
  const files = [
    { path: '/ws/永辉销售日报_20260916.md', description: '销售日报' },
    { path: '/ws/报表.xlsx' },
    { path: '' },
  ];
  const app = await makeBridge({
    script: [withDeliverables(turnFrames({ text: '写好了' }), files)],
  });
  try {
    const seen = [];
    const result = await app.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1',
      workspacePath: '/ws',
      content: [{ type: 'text', text: '做份日报' }],
      handlers: { onDeliverables: (list) => seen.push(...list.map((file) => file.path)) },
    });
    assert.deepEqual(seen, ['/ws/永辉销售日报_20260916.md', '/ws/报表.xlsx']);
    assert.deepEqual(result.files, [
      { path: '/ws/永辉销售日报_20260916.md', description: '销售日报' },
      { path: '/ws/报表.xlsx' },
    ], '空路径要丢掉，描述要有就带上');
  } finally {
    await app.cleanup();
  }
});

test('事件流不带 deliverables 时，退回 present 的工具参数（交付文件不能静默丢）', async () => {
  const app = await makeBridge({
    script: [withPresentCall(turnFrames({ text: '写好了' }), {
      files: [
        { path: '/ws/永辉销售日报_20260916.md', description: '销售日报' },
        { path: '/ws/报表.xlsx' },
      ],
    })],
  });
  try {
    const result = await app.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1',
      workspacePath: '/ws',
      content: [{ type: 'text', text: '做份日报' }],
    });
    assert.deepEqual(result.files.map((file) => file.path), [
      '/ws/永辉销售日报_20260916.md',
      '/ws/报表.xlsx',
    ]);
  } finally {
    await app.cleanup();
  }
});

test('history：只取真实对话（注入的上下文不算），并从最新往回截断', async () => {
  const records = [
    { type: 'event', event: { type: 'user/message', seq: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '第一问' }] } } },
    // 注入的上下文（agent-instructions / plugin snapshot）不算一轮对话
    { type: 'event', event: { type: 'user/message', seq: 2, data: { source: { kind: 'agent-instructions' }, content: [{ type: 'text', text: '  <system-reminder> 一大坨注入 ' }] } } },
    { type: 'event', event: { type: 'assistant/message', seq: 3, data: { message: { content: [{ type: 'reasoning', text: '想想' }, { type: 'text', text: '第一答' }] } } } },
    { type: 'event', event: { type: 'user/message', seq: 4, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '第二问' }] } } },
    { type: 'event', event: { type: 'assistant/message', seq: 5, data: { message: { content: [{ type: 'text', text: '第二答' }] } } } },
  ];
  // 历史走 follow 的首个 snapshot（`session/page` 需要先拿到 seq，用 -1 只会拿到空页）
  const snapshot = [{ type: 'snapshot', cursor: 5, records, hasMore: true }];
  const app = await makeBridge({ script: [snapshot, snapshot] });
  try {
    await app.bridge.ensure({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', workspacePath: '/ws' });
    const all = await app.bridge.history({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1' });
    assert.deepEqual(all.messages, [
      { role: 'user', text: '第一问' },
      { role: 'assistant', text: '第一答' },
      { role: 'user', text: '第二问' },
      { role: 'assistant', text: '第二答' },
    ], '注入内容与思考都不进历史，助手只取文本');

    const followCall = app.gateway.calls.findLast((call) => call.streaming === true);
    assert.equal(followCall.method, 'follow');
    assert.equal(followCall.args.request.maxMessages, 12, '按需要的条数开流');
    assert.equal('assistantStream' in followCall.args.request, false, 'assistantStream 只接受 true，历史就不传');

    const tail = await app.bridge.history({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', maxMessages: 2 });
    assert.deepEqual(tail.messages.map((message) => message.text), ['第二问', '第二答'], '从最新往回截断');

    // 没有绑定会话：不建会话，直接说没有
    const none = await app.bridge.history({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:other' });
    assert.equal(none.sessionId, null);
    assert.deepEqual(none.messages, []);
  } finally {
    await app.cleanup();
  }
});

test('runCommand：走 commands/execute 打到绑定会话；没有会话时给可读错误', async () => {
  const app = await makeBridge({
    commandResult: { commandId: 'cmd_9', result: { kind: 'success', text: 'No compactable history yet.' } },
  });
  try {
    await assert.rejects(
      () => app.bridge.runCommand({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', line: '/compact' }),
      (error) => error.code === 'chat/session-required',
    );

    await app.bridge.ensure({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', workspacePath: '/ws' });
    const result = await app.bridge.runCommand({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', line: '/compact',
    });
    assert.deepEqual(result, {
      matched: true, commandId: 'cmd_9', kind: 'success', text: 'No compactable history yet.',
    });
    const call = app.gateway.calls.findLast((entry) => entry.namespace === 'commands');
    assert.equal(call.method, 'execute');
    assert.equal(call.args.line, '/compact');
    assert.deepEqual(call.args.submittedAttachments, []);
    assert.equal(call.args.agentId, 'session-1', 'agentId 用绑定的会话 id');
  } finally {
    await app.cleanup();
  }
});

test('回合兜底按"静默时长"判定：一直在产出就不打断，彻底没动静才超时', async () => {
  // ① 有进展：事件每 120ms 来一条，阈值设成 300ms —— 一直重置，绝不能被打断。
  const active = await makeBridge({
    script: [turnFrames({ text: '干完了' })],
    frameDelayMs: 120,
  });
  try {
    const result = await active.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', workspacePath: '/ws',
      content: [{ type: 'text', text: '跑个长任务' }],
      turnTimeoutMs: 300,
    });
    assert.equal(result.text, '干完了');
    assert.equal(result.reason.kind, 'completed', '一直在产出就不该判超时');
  } finally {
    await active.cleanup();
  }

  // ② 卡死：事件流不再产出、也不结束 —— 到点收尾，reason 带 idleMs。
  const stuck = await makeBridge({
    script: [[
      { type: 'snapshot', cursor: 1, records: [], hasMore: false },
      { type: 'event', event: { type: 'turn/start', seq: 2, data: { turn: 1 } } },
    ]],
    stuckStream: true,
  });
  try {
    const startedAt = Date.now();
    const result = await stuck.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', workspacePath: '/ws',
      content: [{ type: 'text', text: '卡住吧' }],
      turnTimeoutMs: 300,
    });
    assert.equal(result.reason.kind, 'timeout');
    assert.equal(result.aborted, true);
    assert.ok(result.reason.idleMs >= 300, `idleMs 应达到阈值，实际 ${result.reason.idleMs}`);
    assert.ok(Date.now() - startedAt < 5_000, '不该被绝对上限拖住');
  } finally {
    await stuck.cleanup();
  }
});

test('渠道标识：工作区命名「渠道 · 机器人」，会话标题加渠道前缀（都只做一次）', async () => {
  const app = await makeBridge({});
  try {
    await app.bridge.ensure({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', workspacePath: '/ws',
      channelLabel: '飞书', botLabel: '张三-DSH',
    });
    const rename = app.gateway.calls.find((call) => call.namespace === 'workspace' && call.method === 'rename');
    assert.ok(rename, '工作区要命名成「渠道 · 机器人」');
    assert.equal(rename.args.request.title, '飞书 · 张三-DSH');

    // 再 ensure 一次：同一个工作区不再重复 rename
    await app.bridge.ensure({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', workspacePath: '/ws',
      channelLabel: '飞书', botLabel: '张三-DSH',
    });
    assert.equal(
      app.gateway.calls.filter((call) => call.method === 'rename' && call.namespace === 'workspace').length,
      1,
      '命名是幂等的',
    );
  } finally {
    await app.cleanup();
  }
});

test('渠道标识：会话标题加「渠道 · 」前缀，已有前缀或没有标题就跳过', async () => {
  // ① 有标题且没前缀 → rename 一次
  const app = await makeBridge({ sessionTitles: { 'session-1': '哈喽' } });
  try {
    await app.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', workspacePath: '/ws',
      content: [{ type: 'text', text: '你好' }],
      channelLabel: '飞书',
    });
    const renamed = app.gateway.calls.find((call) => call.namespace === 'session' && call.method === 'rename');
    assert.ok(renamed, '会话标题要加上渠道前缀');
    assert.equal(renamed.args.request.title, '飞书 · 哈喽');
  } finally {
    await app.cleanup();
  }

  // ② 已经有前缀 → 不动
  const prefixed = await makeBridge({ sessionTitles: { 'session-1': '飞书 · 哈喽' } });
  try {
    await prefixed.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', workspacePath: '/ws',
      content: [{ type: 'text', text: '你好' }],
      channelLabel: '飞书',
    });
    assert.equal(
      prefixed.gateway.calls.filter((call) => call.method === 'rename' && call.namespace === 'session').length,
      0,
      '已有前缀就不重复加',
    );
  } finally {
    await prefixed.cleanup();
  }
});

test('绑定的会话已被删除时自动重建并重新绑定', async () => {
  const app = await makeBridge({ script: [turnFrames(), turnFrames({ text: '重建后' })] });
  try {
    await app.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
      workspacePath: '/ws', content: [{ type: 'text', text: '第一次' }],
    });
    assert.equal(app.store.get('feishu', 'bot_1', 'p2p:ou_a').sessionId, 'session-1');

    app.gateway.forget('session-1');
    const second = await app.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
      workspacePath: '/ws', content: [{ type: 'text', text: '第二次' }],
    });
    assert.equal(second.text, '重建后');
    assert.equal(app.store.get('feishu', 'bot_1', 'p2p:ou_a').sessionId, 'session-2');
  } finally {
    await app.cleanup();
  }
});

test('没有工作区时给出可读错误；取消会中断回合并调用 session/cancel', async () => {
  const app = await makeBridge({ script: [turnFrames()] });
  try {
    await assert.rejects(() => app.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
      content: [{ type: 'text', text: '你好' }],
    }), (error) => error.code === 'chat/workspace-required');

    await app.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
      workspacePath: '/ws', content: [{ type: 'text', text: '你好' }],
    });
    const cancelled = await app.bridge.cancel({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
    assert.equal(cancelled.accepted, true);
    assert.ok(app.gateway.calls.some((call) => call.method === 'cancel'));
  } finally {
    await app.cleanup();
  }
});

test('会话绑定表：locate 能反查、adopt 只补空缺、unbind 生效', async () => {
  const app = await makeBridge();
  try {
    const adopted = await app.store.adopt('feishu', 'bot_1', {
      'p2p:ou_a': 'session-old-1',
      'group:oc_1': { sessionId: 'session-old-2', workspacePath: '/ws' },
    });
    assert.equal(adopted, 2);
    // 已有绑定不被覆盖。
    assert.equal(await app.store.adopt('feishu', 'bot_1', { 'p2p:ou_a': 'session-new' }), 0);
    assert.equal(app.store.get('feishu', 'bot_1', 'p2p:ou_a').sessionId, 'session-old-1');

    assert.deepEqual(app.store.locate('session-old-2'), {
      channelId: 'feishu', botId: 'bot_1', key: 'group:oc_1',
    });
    assert.equal(app.store.locate('session-unknown'), undefined);

    await app.store.unbind('feishu', 'bot_1', 'p2p:ou_a');
    assert.equal(app.store.get('feishu', 'bot_1', 'p2p:ou_a'), undefined);
  } finally {
    await app.cleanup();
  }
});

test('审批与提问只接管自己名下的会话，其余 next() 让给浏览器 UI', async () => {
  const app = await makeBridge();
  try {
    const listeners = new Map();
    const listenerOptions = new Map();
    const seen = [];
    /** 只有 feishu 接入了 IM 回传；weixin 没接入，一律让给浏览器。 */
    const interactions = {
      has: (channelId) => channelId === 'feishu',
      handle: async ({ kind }) => {
        seen.push(kind);
        return kind === 'approval'
          ? 'allowed-once'
          : { answers: [{ id: 'q1', selected: ['是'] }] };
      },
    };
    const maybeBridge = createSessionBridge({
      ctx: {
        typertGateway: app.gateway,
        on: (name, handler, options) => {
          listeners.set(name, handler);
          listenerOptions.set(name, options);
          return () => listeners.delete(name);
        },
      },
      logger: silentLogger,
      store: app.store,
      guidance: { publish() {} },
      interactions,
    });
    await app.store.bind('feishu', 'bot_1', 'p2p:ou_a', { sessionId: 'session-bound' });
    await app.store.bind('weixin', 'bot_1', 'p2p:ou_w', { sessionId: 'session-weixin' });

    const dispose = maybeBridge.installInteractionRelays();
    assert.ok(listeners.has('approval/request'));
    assert.ok(listeners.has('user-questions/request'));
    // 必须前置：否则浏览器的应答器会先把提问扣在网页 UI 上，IM 永远轮不到
    assert.deepEqual(listenerOptions.get('approval/request'), { prepend: true });
    assert.deepEqual(listenerOptions.get('user-questions/request'), { prepend: true });

    const approval = listeners.get('approval/request');
    const mine = await approval({ agent: { session: { id: 'session-bound' } }, toolName: 'bash' }, () => 'fallthrough');
    assert.equal(mine, 'allowed-once');
    const other = await approval({ agent: { session: { id: 'session-other' } }, toolName: 'bash' }, () => 'fallthrough');
    assert.equal(other, 'fallthrough');
    // 该渠道没接入 IM 回传：同样让给浏览器，而不是把问题留在 IM 里干等
    const notAttached = await approval(
      { agent: { session: { id: 'session-weixin' } }, toolName: 'bash' },
      () => 'fallthrough',
    );
    assert.equal(notAttached, 'fallthrough');

    const questions = listeners.get('user-questions/request');
    const answered = await questions(
      { agent: { session: { id: 'session-bound' } }, questions: [{ id: 'q1', question: '?' }] },
      () => 'fallthrough',
    );
    assert.deepEqual(answered, { answers: [{ id: 'q1', selected: ['是'] }] });
    assert.deepEqual(seen, ['approval', 'question']);

    dispose();
    assert.equal(listeners.size, 0);
  } finally {
    await app.cleanup();
  }
});

test('网关错误按 code 透出，不吞掉也不伪造', async () => {
  const app = await makeBridge();
  try {
    await assert.rejects(() => app.bridge.invoke('session', 'nope', { request: {} }),
      (error) => error.code === 'gateway/method-unavailable');
    await assert.rejects(() => app.bridge.stream('session', 'nope', { request: {} }),
      (error) => error.code === 'gateway/method-unavailable');
  } finally {
    await app.cleanup();
  }
});

test('ask 的返回必须有界：关流永不落地 / 提示词收据不回，都不能把结果吞掉', async () => {
  // ① follow 流的 return() 永不落地（真机上就是这么丢回复的）
  const app = await makeBridge({
    script: [[
      { event: { seq: 1, type: 'turn/start', data: { turn: 1 } } },
      { event: { seq: 2, type: 'assistant/message', data: { turn: 1, message: { role: 'assistant', content: [{ type: 'text', text: '答案' }] } } } },
      { event: { seq: 3, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } } },
    ]],
    // 让流的 return() 永远不 settle
    stuckReturn: true,
  });
  try {
    const { sessionId } = await app.bridge.ensure({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', workspacePath: '/ws',
    });
    const started = Date.now();
    const result = await app.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', workspacePath: '/ws',
      content: [{ type: 'image', mediaType: 'image/png', data: 'AA==' }],
      sourceGuidance: '',
    });
    assert.equal(result.sessionId, sessionId);
    assert.equal(result.text, '答案', '结果必须交回渠道');
    assert.equal(result.reason.kind, 'completed');
    assert.ok(Date.now() - started < 5_000, '不能被关流拖住');
  } finally {
    await app.cleanup();
  }
});

test('ask 的返回必须有界：提示词收据一直不回，也不影响回合结束', async () => {
  const app = await makeBridge({
    script: [[
      { event: { seq: 1, type: 'turn/start', data: { turn: 1 } } },
      { event: { seq: 2, type: 'assistant/message', data: { turn: 1, message: { role: 'assistant', content: [{ type: 'text', text: '答案' }] } } } },
      { event: { seq: 3, type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } } },
    ]],
    stuckPrompt: true,
  });
  try {
    const result = await app.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', workspacePath: '/ws',
      content: [{ type: 'text', text: '在吗' }],
      sourceGuidance: '',
    });
    assert.equal(result.text, '答案');
  } finally {
    await app.cleanup();
  }
});

test('提示词投递被拒时要立刻抛出，而不是等超时', async () => {
  const app = await makeBridge({
    script: [[{ event: { seq: 1, type: 'turn/start', data: { turn: 1 } } }]],
    failPrompt: true,
  });
  try {
    await assert.rejects(
      () => app.bridge.ask({
        channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', workspacePath: '/ws',
        content: [{ type: 'text', text: '在吗' }],
        sourceGuidance: '',
      }),
      (error) => error.code === 'session/not-found',
    );
  } finally {
    await app.cleanup();
  }
});

test('uploadFile：把入站文件交给会话（内容块要的是同会话的 receiptId）', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-sessions-'));
  const store = createSessionStore({ dataDir, logger: silentLogger });
  const uploaded = [];
  const ctx = {
    typertGateway: createFakeGateway({ script: [[]] }),
    get: (name) => (name === 'fileUploads' ? {
      async uploadStream(request) {
        const chunks = [];
        for await (const chunk of request.data) chunks.push(chunk);
        uploaded.push({ sessionId: request.sessionId, name: request.name, bytes: Buffer.concat(chunks).length });
        return { receiptId: 'receipt-1', file: { attachmentId: 'sha256:x', name: request.name, bytes: 3 } };
      },
    } : undefined),
  };
  const bridge = createSessionBridge({ ctx, logger: silentLogger, store });
  try {
    const result = await bridge.uploadFile({
      sessionId: 'session-1', name: '报表.xlsx', bytes: new Uint8Array([1, 2, 3]),
    });
    assert.equal(result.receiptId, 'receipt-1');
    assert.deepEqual(uploaded, [{ sessionId: 'session-1', name: '报表.xlsx', bytes: 3 }]);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('uploadFile：服务缺席/内容为空/服务报错都有稳定错误码', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-sessions-'));
  const store = createSessionStore({ dataDir, logger: silentLogger });
  try {
    // 没装 fileUploads：要给出可读原因，而不是静默丢文件
    const noService = createSessionBridge({
      ctx: { typertGateway: createFakeGateway({ script: [[]] }), get: () => undefined },
      logger: silentLogger,
      store,
    });
    await assert.rejects(
      () => noService.uploadFile({ sessionId: 's', name: 'a.txt', bytes: new Uint8Array([1]) }),
      (error) => error.code === 'chat/upload-unavailable',
    );

    const failing = createSessionBridge({
      ctx: {
        typertGateway: createFakeGateway({ script: [[]] }),
        get: () => ({ async uploadStream() { const e = new Error('磁盘满了'); e.code = 'attachment/io'; throw e; } }),
      },
      logger: silentLogger,
      store,
    });
    await assert.rejects(
      () => failing.uploadFile({ sessionId: 's', name: 'a.txt', bytes: new Uint8Array([1]) }),
      (error) => error.code === 'attachment/io' && /上传文件失败：磁盘满了/.test(error.message),
    );
    await assert.rejects(
      () => failing.uploadFile({ sessionId: 's', name: 'a.txt', bytes: new Uint8Array([]) }),
      (error) => error.code === 'chat/bad-request',
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('同一会话的回合串行：第二条消息等第一条结束，不会互相抢答案', async () => {
  const { createSessionBridge } = await import('../packages/dsh-chat/host/sessions.mjs');
  const { createSessionStore } = await import('../packages/dsh-chat/host/session-store.mjs');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-queue-'));
  const store = createSessionStore({ dataDir, logger: { info() {}, warn() {}, error() {} } });
  await store.ready();
  await store.bind('feishu', 'bot_1', 'p2p:ou_1', { sessionId: 'session-1' });

  const events = [];
  let releaseFirst;
  const ctx = {
    // 第一轮：一直挂着，直到测试放行；第二轮必须排在它后面。
    typertGateway: {
      invoke: async (namespace, method) => {
        if (namespace === 'session' && method === 'page') return { records: [], cursor: 0 };
        if (namespace === 'session' && method === 'list') return { items: [{ sessionId: 'session-1', running: true }] };
        if (namespace === 'session' && method === 'prompt') {
          events.push(`prompt:${method}`);
          return { accepted: true };
        }
        return {};
      },
    },
  };
  const bridge = createSessionBridge({
    ctx, logger: { info() {}, warn() {}, error() {} }, store,
    settings: { read: () => ({ workspace: '/tmp' }) },
  });

  const queued = [];
  const first = bridge.ask({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', workspacePath: '/tmp',
    content: [{ type: 'text', text: '第一条' }],
    onQueued: (ahead) => queued.push(ahead),
  }).catch((error) => error);
  const second = bridge.ask({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', workspacePath: '/tmp',
    content: [{ type: 'text', text: '第二条' }],
    onQueued: (ahead) => queued.push(ahead),
  }).catch((error) => error);

  // 第二条必须给出"前面还有 1 条"的回执。
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(queued, [1], '第二条要收到排队回执');
  await Promise.allSettled([first, second]);
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

test('会话标题标渠道：标题还没生成时不记"已标记"，下一轮要能补上', async () => {
  const { createSessionBridge } = await import('../packages/dsh-chat/host/sessions.mjs');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const renamed = [];
  let titleReady = false;
  const ctx = {
    typertGateway: {
      // 网关是 `invoke({ namespace, method, args, signal })` 的对象形式。
      invoke: async ({ namespace, method, args }) => {
        if (namespace !== 'session') return {};
        if (method === 'list') {
          return {
            items: [{
              sessionId: 'session-1',
              projections: { values: titleReady ? { title: '看看昨天的销售' } : {} },
            }],
          };
        }
        if (method === 'rename') {
          renamed.push(args?.request?.title);
          return {};
        }
        return {};
      },
    },
  };
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-mark-'));
  const bridge = createSessionBridge({
    ctx, logger: { info() {}, warn() {}, error() {} },
    store: null, settings: { read: () => ({}) },
  });

  // 第一次：标题还没生成 —— 不能记成"已标记"（返回值给 /retitle 那条路用）。
  assert.equal(await bridge.markSessionChannel?.('session-1', '飞书'), 'no-title');
  assert.deepEqual(renamed, [], '标题没生成时不该重命名');
  // 第二次（标题已生成）——要补上前缀。
  titleReady = true;
  assert.equal(await bridge.markSessionChannel?.('session-1', '飞书'), 'renamed');
  assert.deepEqual(renamed, ['飞书 · 看看昨天的销售']);
  // 第三次：已经有前缀 → skipped（幂等，不重复改）。
  assert.equal(await bridge.markSessionChannel?.('session-1', '飞书'), 'skipped');
  assert.deepEqual(renamed, ['飞书 · 看看昨天的销售']);

  // 一次性回填要用到的绑定清单：只列这台机器人自己的会话。
  const bound = bridge.boundSessions?.('feishu', 'bot_1');
  assert.ok(Array.isArray(bound), 'boundSessions 要可用');
  await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

test('新建会话后应用机器人默认模型（建会话不能带模型，只能建好再 selectModel）', async () => {
  const app = await makeBridge({
    script: [turnFrames()],
    settings: {
      read: () => ({
        workspace: '/ws',
        model: { provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' },
      }),
    },
  });
  try {
    const { sessionId } = await app.bridge.ensure({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', workspacePath: '/ws',
    });
    const select = app.gateway.calls.find((call) => call.method === 'selectModel');
    assert.ok(select, '建完会话要立刻把机器人默认模型选上');
    assert.deepEqual(select.args.request, {
      sessionId, provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: 'high',
    });

    // 复用已有绑定时不重复应用（只对新会话生效）。
    app.gateway.calls.length = 0;
    await app.bridge.ensure({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
    assert.equal(app.gateway.calls.some((call) => call.method === 'selectModel'), false);
  } finally {
    await app.cleanup();
  }
});

test('机器人默认模型应用失败不能让会话建不出来（记 warn，退回 Host 默认）', async () => {
  const app = await makeBridge({
    script: [turnFrames()],
    failSelectModel: remoteError('gateway/method-unavailable'),
    settings: {
      read: () => ({ workspace: '/ws', model: { provider: 'ghost', model: 'gone' } }),
    },
  });
  try {
    const { sessionId } = await app.bridge.ensure({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', workspacePath: '/ws',
    });
    assert.ok(sessionId, '模型选不上也要把会话建出来');
    assert.equal(app.store.get('feishu', 'bot_1', 'p2p:ou_a').sessionId, sessionId);
  } finally {
    await app.cleanup();
  }
});

test('多 step 的正文都要带回：不是只给最后一个 step（上游 Issue #112 的同一根因）', async () => {
  // 一轮里：工具调用前写了一段，工具调用后又写了一段，最后还有一段收尾说明。
  const frames = [
    { type: 'snapshot', cursor: 3, records: [], hasMore: false },
    { type: 'event', event: { type: 'turn/start', seq: 4, data: { turn: 1 } } },
    {
      type: 'event',
      event: {
        type: 'assistant/message',
        seq: 5,
        data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '我先查一下数据。' }] } },
      },
    },
    { type: 'event', event: { type: 'tool/call', seq: 6, data: { turn: 1, step: 1, callId: 'c1', name: 'bash', arguments: '{}' } } },
    {
      type: 'event',
      event: {
        type: 'assistant/message',
        seq: 7,
        data: { turn: 1, step: 2, message: { content: [{ type: 'text', text: '昨天销售额 1234 万。' }] } },
      },
    },
    {
      type: 'event',
      event: {
        type: 'assistant/message',
        seq: 8,
        data: { turn: 1, step: 3, message: { content: [{ type: 'text', text: '昨天销售额 1234 万。' }] } },
      },
    },
    { type: 'event', event: { type: 'turn/end', seq: 9, data: { turn: 1, reason: { kind: 'completed' } } } },
  ];
  const app = await makeBridge({ script: [frames] });
  try {
    const result = await app.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
      workspacePath: '/ws', content: [{ type: 'text', text: '昨天卖了多少' }], sourceGuidance: '',
    });
    assert.equal(result.text, '我先查一下数据。\n\n昨天销售额 1234 万。',
      '每一段正文都要在，相邻重复的段只留一次');
    assert.equal(result.reason.kind, 'completed');
  } finally {
    await app.cleanup();
  }
});

test('模型不可用自救：切回可用模型、重试一轮，并在答案前说明换了模型', async () => {
  // 第一轮：提示词收据直接抛 session/model-unavailable；第二轮（切完模型）正常返回。
  const calls = [];
  const app = await makeBridge({
    script: [turnFrames({ text: '换完模型后的答案' })],
    repeatScript: true,
    failPromptOnce: Object.assign(new Error('model gone'), {
      code: 'session/model-unavailable',
      details: { provider: 'yh', model: 'ghost' },
    }),
    onInvoke: (call) => calls.push(call),
    catalog: {
      default: { provider: 'yh', model: 'gpt-5.5-luna' },
      groups: [{ id: 'yh', name: 'YH', models: [{ id: 'gpt-5.5-luna', name: 'Luna' }] }],
    },
  });
  try {
    const result = await app.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
      workspacePath: '/ws', content: [{ type: 'text', text: '你好' }], sourceGuidance: '',
    });
    const select = calls.filter((call) => call.method === 'selectModel');
    assert.equal(select.length, 1, '要切一次模型（切回可用模型）');
    assert.deepEqual(select[0].args.request,
      { sessionId: 'session-1', provider: 'yh', model: 'gpt-5.5-luna' });
    assert.match(result.text, /^⚠️ 会话原来选的模型 yh\/ghost 已不可用/);
    assert.match(result.text, /已自动切到 yh\/gpt-5.5-luna/);
    assert.match(result.text, /换完模型后的答案/, '重试那一轮的答案要在');
    assert.equal(result.reason.kind, 'completed');
  } finally {
    await app.cleanup();
  }
});

test('模型不可用但不是"模型被删"以外的错误：不救援、原样抛出', async () => {
  const app = await makeBridge({
    script: [turnFrames()],
    failPromptOnce: Object.assign(new Error('boom'), { code: 'session/not-found', details: {} }),
  });
  try {
    await assert.rejects(
      () => app.bridge.ask({
        channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
        workspacePath: '/ws', content: [{ type: 'text', text: '你好' }], sourceGuidance: '',
      }),
      (error) => error.code === 'session/not-found',
    );
  } finally {
    await app.cleanup();
  }
});

/** 回合的兜底定时器都是 unref 的（不能拖住进程退出），所以靠它们推进的测试要自己按住事件循环。 */
function holdEventLoop() {
  const timer = setTimeout(() => {}, 30_000);
  return () => clearTimeout(timer);
}

test('超时之后登记延迟交付；正常结束不登记；/stop 作废该会话的待交付', async () => {
  const releaseLoop = holdEventLoop();
  const scheduled = [];
  const forgotten = [];
  const deferred = {
    schedule: async (record) => { scheduled.push(record); return 'df-1'; },
    forgetKey: async (options) => { forgotten.push(options); return 1; },
  };

  // ① 卡死 → timeout：必须把"会话 + 回合 + 原因"交给延迟交付，且不能重跑这一轮。
  const stuck = await makeBridge({
    script: [[
      { type: 'snapshot', cursor: 1, records: [], hasMore: false },
      { type: 'event', event: { type: 'turn/start', seq: 2, data: { turn: 1 } } },
    ]],
    stuckStream: true,
    deferred,
  });
  try {
    const result = await stuck.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', workspacePath: '/ws',
      content: [{ type: 'text', text: '跑个长任务' }], turnTimeoutMs: 200,
    });
    assert.equal(result.reason.kind, 'timeout');
    assert.equal(scheduled.length, 1, '超时要登记一条待交付');
    assert.deepEqual(
      {
        channelId: scheduled[0].channelId,
        botId: scheduled[0].botId,
        key: scheduled[0].key,
        sessionId: scheduled[0].sessionId,
        turn: scheduled[0].turn,
        reason: scheduled[0].reason,
      },
      {
        channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1',
        sessionId: 'session-1', turn: 1, reason: 'timeout',
      },
    );
    assert.equal(typeof scheduled[0].startedAt, 'number', '要带超时那一刻的起点（算补发延迟用）');

    // /stop：这条会话的待交付一并作废（否则过一会儿又冒出一条补充结果）。
    await stuck.bridge.cancel({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1' });
    assert.deepEqual(forgotten, [{ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', reason: '用户 /stop' }]);
  } finally {
    await stuck.cleanup();
  }

  // ② 正常结束：不该登记（补发只服务"超时之后才跑完"这一种情况）。
  const done = await makeBridge({ script: [turnFrames({ text: '正常答完' })], deferred });
  try {
    const result = await done.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', workspacePath: '/ws',
      content: [{ type: 'text', text: '你好' }],
    });
    assert.equal(result.reason.kind, 'completed');
    assert.equal(scheduled.length, 1, '正常结束不登记（还只有①那一条）');
  } finally {
    await done.cleanup();
  }

  // ③ 登记失败不能把超时结果本身弄丢：用户仍会收到"回合未正常结束"。
  const broken = await makeBridge({
    script: [[
      { type: 'snapshot', cursor: 1, records: [], hasMore: false },
      { type: 'event', event: { type: 'turn/start', seq: 2, data: { turn: 1 } } },
    ]],
    stuckStream: true,
    deferred: {
      schedule: async () => { throw new Error('磁盘满了'); },
      forgetKey: async () => 0,
    },
  });
  try {
    const result = await broken.bridge.ask({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', workspacePath: '/ws',
      content: [{ type: 'text', text: '跑个长任务' }], turnTimeoutMs: 200,
    });
    assert.equal(result.reason.kind, 'timeout');
    assert.equal(result.aborted, true);
  } finally {
    await broken.cleanup();
    releaseLoop();
  }
});

test('probeTurn：还在跑 / 已换绑 / 空闲且有正文（延迟交付的复查口径）', async () => {
  const records = [
    { type: 'event', event: { type: 'user/message', seq: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '第一问' }] } } },
    { type: 'event', event: { type: 'assistant/message', seq: 2, data: { message: { content: [{ type: 'text', text: '超时之后才跑完的答案' }] } } } },
  ];
  const snapshot = [{ type: 'snapshot', cursor: 2, records, hasMore: false }];
  const app = await makeBridge({ script: [snapshot, snapshot, snapshot] });
  try {
    // 让另一个会话排在前面：假 DSH 只把 `session/list` 的第一条当成 running。
    app.gateway.sessions.add('session-0');
    await app.bridge.ensure({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', workspacePath: '/ws' });

    // ① 空闲且仍绑着这个会话 → 读历史拿最后一条助手正文。
    const idle = await app.bridge.probeTurn({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', sessionId: 'session-1',
    });
    assert.deepEqual(idle, { exists: true, running: false, text: '超时之后才跑完的答案' });

    // ② 还在跑 → 什么都不给（半截正文绝不能当最终答案补发）。
    const running = await app.bridge.probeTurn({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', sessionId: 'session-0',
    });
    assert.deepEqual(running, { exists: true, running: true, text: '' });

    // ③ 这个聊天已经不绑它了（换绑/解绑）→ 补发是错的，交回 rebound 让上层作废。
    await app.bridge.ensure({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_2', workspacePath: '/ws' });
    const rebound = await app.bridge.probeTurn({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_2', sessionId: 'session-1',
    });
    assert.equal(rebound.rebound, true);
    assert.equal(rebound.text, '');

    // ④ 会话已经没了。
    app.gateway.forget('session-1');
    const gone = await app.bridge.probeTurn({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', sessionId: 'session-1',
    });
    assert.deepEqual(gone, { exists: false, running: false, text: '' });
  } finally {
    await app.cleanup();
  }
});
