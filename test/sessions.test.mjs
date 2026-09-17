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
        return { records: [], hasMore: false };
      }
      if (namespace === 'session' && method === 'prompt') {
        if (args?.request?.mode !== 'queue' && args?.request?.mode !== 'steer') {
          throw remoteError('gateway/arguments-invalid');
        }
        // 真机上出现过"提示词已受理，但收据迟迟不回"的情况。
        if (stuckPrompt) return new Promise(() => {});
        if (failPrompt) throw remoteError('session/not-found');
        return { accepted: true };
      }
      if (namespace === 'session' && method === 'list') {
        return { items: [...sessions].map((sessionId, index) => ({ sessionId, running: index === 0 })) };
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
      const frames = script[scriptIndex] ?? [];
      scriptIndex += 1;
      const iterator = (async function* iterate() {
        for (const frame of frames) yield frame;
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
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-sessions-'));
  const store = createSessionStore({ dataDir, logger: silentLogger });
  const gateway = createFakeGateway(options);
  const published = [];
  const bridge = createSessionBridge({
    ctx: { typertGateway: gateway },
    logger: silentLogger,
    store,
    guidance: { publish: (sessionId, text) => published.push({ sessionId, text }) },
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
