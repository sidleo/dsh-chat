/**
 * 微信渠道：id 推导（零重扫）、协议客户端、运行时（收/发/输入状态/放行）、控制器端点。
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import * as accessPolicy from '../packages/dsh-chat/shared/access-policy.mjs';
import { captureContextEnhancementSource, enhanceContent } from '../packages/dsh-chat/shared/context-enhancement.mjs';
import { createJsonStore } from '../packages/dsh-chat/host/json-store.mjs';
import { createWeixinConfigStore } from '../packages/dsh-chat-weixin/host/config-store.mjs';
import { createWeixinController, deriveIdentity } from '../packages/dsh-chat-weixin/host/controller.mjs';
import {
  IlinkError,
  createIlinkClient,
  extractText,
  normalizeBaseUrl,
  rejectedResponse,
  splitText,
} from '../packages/dsh-chat-weixin/host/ilink-client.mjs';
import { createWeixinRuntime } from '../packages/dsh-chat-weixin/host/runtime.mjs';
import { createWeixinStateStore } from '../packages/dsh-chat-weixin/host/state-store.mjs';

const silentLogger = { info() {}, warn() {}, error() {} };

/** 真实账号数据：确保现有绑定零重扫（推导公式与上游一致）。 */
test('id 推导与既有账号一致（零重扫的关键）', () => {
  const identity = deriveIdentity('a1b2c3d4e5f6@im.bot');
  assert.equal(identity.botId, 'wx_0f2d168cd6b0883e2ab7a445');
  assert.equal(identity.tokenRef, 'DSH_WEIXIN_BOT_TOKEN_6954168CD6B0883E2AB7A445');
  assert.throws(() => deriveIdentity(''), /accountId/);
});

test('协议客户端：只允许微信域名，拒绝其余主机', () => {
  assert.equal(normalizeBaseUrl('https://ilinkai.weixin.qq.com/'), 'https://ilinkai.weixin.qq.com/');
  assert.throws(() => normalizeBaseUrl('http://ilinkai.weixin.qq.com/'), /不受信任/);
  assert.throws(() => normalizeBaseUrl('https://evil.example.com/'), /不受信任/);
  assert.equal(rejectedResponse({ ret: 0, errcode: 0 }), null);
  assert.equal(rejectedResponse({ ret: -14 }), '-14');
  assert.equal(rejectedResponse({ errcode: 40001 }), '40001');
});

test('协议客户端：登录、长轮询、发送的请求形状与容错', async () => {
  const calls = [];
  const responses = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null, method: init.method });
    const next = responses.shift() ?? { ret: 0 };
    return {
      ok: next.status === undefined || next.status < 400,
      status: next.status ?? 200,
      json: async () => next.body ?? {},
    };
  };
  const client = createIlinkClient({ fetchImpl });

  // 申请二维码
  responses.push({ body: { qrcode: 'qr_1', qrcode_img_content: 'https://ilinkai.weixin.qq.com/qr.png' } });
  const login = await client.beginLogin({ localTokens: ['t1', ''] });
  assert.equal(login.qrcode, 'qr_1');
  assert.ok(calls[0].url.includes('ilink/bot/get_bot_qrcode?bot_type=3'));

  // 轮询状态（未登录，不带 token）
  responses.push({ body: { status: 'scaned' } });
  assert.equal((await client.pollLogin({ qrcode: 'qr_1' })).status, 'scaned');

  // 确认后拿到凭据
  responses.push({ body: { status: 'confirmed', bot_token: 'tok', ilink_bot_id: 'acc@im.bot', ilink_user_id: 'u@im.wechat' } });
  const confirmed = await client.pollLogin({ qrcode: 'qr_1' });
  assert.equal(confirmed.bot_token, 'tok');

  // 长轮询正常返回
  responses.push({ body: { ret: 0, msgs: [{ message_id: 'm1' }], get_updates_buf: 'buf2' } });
  const updates = await client.getUpdates({ baseUrl: 'https://ilinkai.weixin.qq.com/', token: 'tok', getUpdatesBuf: 'buf1' });
  assert.equal(updates.get_updates_buf, 'buf2');
  assert.equal(calls.at(-1).body.get_updates_buf, 'buf1');
  assert.ok(calls.at(-1).url.endsWith('ilink/bot/getupdates'));

  // 长轮询超时视为"本轮无消息"，不抛错。
  // 假 fetch 必须真的等到 signal 被 abort（真实 fetch 就是这样），
  // 否则测不到"我们的计时器触发超时"这条路径。
  const timeoutFetch = (url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
  const timeoutClient = createIlinkClient({ fetchImpl: timeoutFetch });
  const empty = await timeoutClient.getUpdates({
    baseUrl: 'https://ilinkai.weixin.qq.com/', token: 'tok', getUpdatesBuf: 'buf9', timeoutMs: 5,
  });
  assert.deepEqual(empty.msgs, []);

  // 发送被服务端拒绝 → 抛带 providerCode 的错误
  responses.push({ body: { ret: -1 } });
  await assert.rejects(
    () => client.sendText({ baseUrl: 'https://ilinkai.weixin.qq.com/', token: 'tok', toUserId: 'u', text: 'hi' }),
    (error) => error instanceof IlinkError && error.code === 'send-rejected',
  );

  // 发送请求体形状
  responses.push({ body: { ret: 0 } });
  await client.sendText({
    baseUrl: 'https://ilinkai.weixin.qq.com/', token: 'tok', toUserId: 'u@im.wechat',
    text: '你好', contextToken: 'ctx', runId: 'run',
  });
  const sent = calls.at(-1).body.msg;
  assert.equal(sent.to_user_id, 'u@im.wechat');
  assert.equal(sent.message_type, 2);
  assert.deepEqual(sent.item_list, [{ type: 1, text_item: { text: '你好' } }]);
  assert.equal(sent.context_token, 'ctx');
  assert.equal(sent.run_id, 'run');
  assert.ok(sent.client_id.startsWith('dsh-chat-weixin-'));
});

test('文本提取与分段', () => {
  assert.equal(extractText({ item_list: [{ type: 1, text_item: { text: ' 你好 ' } }] }), '你好');
  assert.equal(extractText({ item_list: [{ type: 3, voice_item: { text: '语音转写' } }] }), '语音转写');
  assert.equal(extractText({ item_list: [{ type: 2, image_item: {} }] }), null);
  assert.deepEqual(splitText('短'), ['短']);
  const long = `${'a'.repeat(1_500)}\n${'b'.repeat(1_500)}`;
  const chunks = splitText(long);
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((chunk) => chunk.length <= 1_800));
});

function createFakeClient(script = {}) {
  const calls = { updates: [], texts: [], typing: [], config: [], starts: 0, stops: 0 };
  let queue = [...(script.updates ?? [])];
  return {
    calls,
    async beginLogin() {
      return { qrcode: 'qr_test', qrcodeUrl: 'https://ilinkai.weixin.qq.com/qr.png' };
    },
    async pollLogin() {
      return script.poll ?? { status: 'wait' };
    },
    async getUpdates() {
      calls.updates.push({ buf: script.currentBuf });
      if (queue.length > 0) return queue.shift();
      return { ret: 0, msgs: [], get_updates_buf: 'buf-idle' };
    },
    async getConfig({ toUserId }) {
      calls.config.push(toUserId);
      return { typingTicket: 'ticket-1' };
    },
    async sendTyping(options) {
      calls.typing.push(options);
      return true;
    },
    async sendText(options) {
      calls.texts.push(options);
      return { providerMessageIds: ['id'] };
    },
    async notifyStart() {
      calls.starts += 1;
      return { ret: 0 };
    },
    async notifyStop() {
      calls.stops += 1;
      return { ret: 0 };
    },
  };
}

async function makeRuntime({
  owner = 'u@im.wechat',
  policy = null,
  contextEnhancement = null,
  askResult = { text: '答案', reason: { kind: 'completed' } },
  onAsk = () => {},
} = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-weixin-'));
  const account = {
    botId: 'wx_test',
    accountId: 'acc@im.bot',
    tokenRef: 'DSH_WEIXIN_BOT_TOKEN_TEST',
    ownerUserId: owner,
    baseUrl: 'https://ilinkai.weixin.qq.com/',
  };
  const state = createWeixinStateStore({
    path: join(dataDir, 'state.json'), createJsonStore,
  });
  await state.ready();
  const client = createFakeClient();
  const published = [];
  const deps = {
    channelId: 'weixin',
    dataDir,
    logger: silentLogger,
    ready: async () => {},
    createJsonStore,
    storage: {
      read: () => ({
        workspace: '/ws', contextEnhancement, accessPolicy: policy, model: null, agentPreset: null,
      }),
    },
    contextEnhancement: { captureContextEnhancementSource, enhanceContent },
    accessPolicy,
    guidance: { publish: (sessionId, text) => published.push({ sessionId, text }) },
    sessions: {
      ask: async (options) => {
        onAsk(options);
        deps.guidance.publish('session-1', options.sourceGuidance ?? '');
        return askResult;
      },
      bindings: { adopt: async () => 0 },
    },
  };
  const runtime = createWeixinRuntime({
    account, token: 'tok', deps, client, state, logger: silentLogger,
  });
  return {
    runtime, client, state, deps, published, dataDir, account,
    async cleanup() {
      await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
    },
  };
}

const inbound = (overrides = {}) => ({
  message_id: 'm_1',
  from_user_id: 'u@im.wechat',
  message_type: 1,
  context_token: 'ctx-1',
  run_id: 'run-1',
  item_list: [{ type: 1, text_item: { text: '你好' } }],
  ...overrides,
});

test('运行时：收消息 → 会话 → 分段回复，输入状态开/关', async () => {
  const app = await makeRuntime();
  try {
    await app.runtime.accept(inbound(), new AbortController().signal);
    assert.equal(app.client.calls.texts.length, 1);
    assert.equal(app.client.calls.texts[0].text, '答案');
    assert.equal(app.client.calls.texts[0].contextToken, 'ctx-1', '回复要带回 context_token');
    assert.equal(app.client.calls.texts[0].runId, 'run-1');
    assert.deepEqual(app.client.calls.typing.map((call) => call.status), [1, 2]);
    assert.equal(app.runtime.status().handled, 1);
  } finally {
    await app.cleanup();
  }
});

test('运行时：长回复按上限分段发送', async () => {
  const app = await makeRuntime({ askResult: { text: 'x'.repeat(4_000), reason: { kind: 'completed' } } });
  try {
    await app.runtime.accept(inbound(), new AbortController().signal);
    assert.ok(app.client.calls.texts.length >= 3, `应分段发送，实际 ${app.client.calls.texts.length} 条`);
    assert.ok(app.client.calls.texts.every((call) => call.text.length <= 1_800));
  } finally {
    await app.cleanup();
  }
});

test('运行时：门禁——属主放行、访问策略 open 放行、陌生人忽略、自己发的忽略', async () => {
  const owner = await makeRuntime();
  try {
    await owner.runtime.accept(inbound({ message_id: 'm_owner' }), new AbortController().signal);
    assert.equal(owner.client.calls.texts.length, 1);
  } finally {
    await owner.cleanup();
  }

  const open = await makeRuntime({
    owner: 'someone-else',
    policy: { direct: { mode: 'open' } },
  });
  try {
    await open.runtime.accept(inbound({ message_id: 'm_open' }), new AbortController().signal);
    assert.equal(open.client.calls.texts.length, 1);
  } finally {
    await open.cleanup();
  }

  const stranger = await makeRuntime({
    owner: 'someone-else',
    accessPolicy: { direct: { mode: 'allowlist' } },
  });
  try {
    await stranger.runtime.accept(inbound({ message_id: 'm_stranger' }), new AbortController().signal);
    assert.equal(stranger.client.calls.texts.length, 0);
    // 自己发出的消息（message_type 2）必须忽略，且不算"已见"。
    await stranger.runtime.accept(inbound({ message_id: 'm_self', message_type: 2 }), new AbortController().signal);
    assert.equal(stranger.client.calls.texts.length, 0);
  } finally {
    await stranger.cleanup();
  }
});

test('运行时：重复投递只处理一次；非文本消息给出提示', async () => {
  const app = await makeRuntime();
  try {
    await app.runtime.accept(inbound({ message_id: 'm_dup' }), new AbortController().signal);
    await app.runtime.accept(inbound({ message_id: 'm_dup' }), new AbortController().signal);
    assert.equal(app.client.calls.texts.length, 1, '同一条消息只回一次');

    await app.runtime.accept(inbound({
      message_id: 'm_img', item_list: [{ type: 2, image_item: {} }],
    }), new AbortController().signal);
    assert.match(app.client.calls.texts.at(-1).text, /只支持文本/);
  } finally {
    await app.cleanup();
  }
});

test('运行时：上下文增强前缀与提示词经 hub 引擎生效（私聊指定用户叠加）', async () => {
  const contextEnhancement = {
    group: { enabled: false, fields: ['senderId'], guidance: '' },
    direct: { enabled: true, fields: ['senderId'], guidance: '私聊全局' },
    targets: [{
      kind: 'user', id: 'u@im.wechat', label: '', enabled: true,
      fields: ['senderId'], guidance: '该用户专属', merge: 'append',
    }],
  };
  let asked = null;
  const app = await makeRuntime({ contextEnhancement, onAsk: (options) => { asked = options; } });
  try {
    await app.runtime.accept(inbound(), new AbortController().signal);
    assert.ok(asked.content[0].text.startsWith('<dsh_im_source>'));
    assert.ok(asked.content[0].text.includes('"senderId":"u@im.wechat"'));
    assert.equal(asked.sourceGuidance, '该用户专属\n\n私聊全局');
    assert.equal(asked.key, 'p2p:u@im.wechat');
    assert.equal(asked.workspacePath, '/ws');
  } finally {
    await app.cleanup();
  }
});

test('状态存储：去重、长轮询游标与 context_token', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-weixin-state-'));
  try {
    const path = join(dataDir, 'state.json');
    await writeFile(path, JSON.stringify({
      version: 1,
      sessions: { 'p2p:u@im.wechat': 'session-old' },
      seenMessageIds: ['m_old'],
      getUpdatesBuf: 'buf-old',
    }), 'utf8');
    const state = createWeixinStateStore({ path, createJsonStore });
    await state.ready();
    assert.deepEqual(state.sessions(), { 'p2p:u@im.wechat': 'session-old' });
    assert.equal(state.getUpdatesBuf(), 'buf-old');
    assert.equal(state.markSeen('m_old'), false);
    assert.equal(state.markSeen('m_new'), true);

    await state.saveGetUpdatesBuf('buf-new');
    await state.rememberContextToken('u@im.wechat', 'ctx-new');
    await state.flush();
    const onDisk = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(onDisk.getUpdatesBuf, 'buf-new');
    assert.equal(onDisk.contextTokens['u@im.wechat'], 'ctx-new');
    assert.deepEqual(onDisk.sessions, { 'p2p:u@im.wechat': 'session-old' }, '旧会话绑定不能被写丢');
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('配置存储：读既有账号格式并可增删', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-weixin-cfg-'));
  try {
    const path = join(dataDir, 'config.json');
    await writeFile(path, JSON.stringify({
      version: 1,
      accounts: [{
        botId: 'wx_0f2d168cd6b0883e2ab7a445',
        accountId: 'a1b2c3d4e5f6@im.bot',
        tokenRef: 'DSH_WEIXIN_BOT_TOKEN_6954168CD6B0883E2AB7A445',
        ownerUserId: 'o0abcdefghijklmnopqrstuvwx@im.wechat',
        baseUrl: 'https://ilinkai.weixin.qq.com/',
      }],
    }), 'utf8');
    const store = createWeixinConfigStore({ path, createJsonStore });
    await store.ready();
    assert.equal(store.list().length, 1);
    assert.equal(store.get('wx_0f2d168cd6b0883e2ab7a445').accountId, 'a1b2c3d4e5f6@im.bot');

    await store.saveAccount({
      botId: 'wx_aaaaaaaaaaaaaaaaaaaaaaaa',
      accountId: 'other@im.bot',
      tokenRef: 'DSH_WEIXIN_BOT_TOKEN_AAAAAAAAAAAAAAAAAAAAAAAA',
      ownerUserId: 'u@im.wechat',
    });
    assert.equal(store.list().length, 2);
    assert.equal(await store.removeAccount('wx_aaaaaaaaaaaaaaaaaaaaaaaa'), true);
    assert.equal(store.list().length, 1);
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('控制器：扫码确认后落盘账号、写入凭据并启动长轮询', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-weixin-ctl-'));
  try {
    const credentials = {
      store: new Map(),
      async resolve(ref) {
        const value = this.store.get(ref);
        return value ? { value, configured: true } : { configured: false };
      },
      async set(ref, value) {
        this.store.set(ref, value);
      },
      async unset(ref) {
        this.store.delete(ref);
      },
    };
    const client = createFakeClient({
      poll: {
        status: 'confirmed',
        bot_token: 'tok-new',
        ilink_bot_id: 'acc@im.bot',
        ilink_user_id: 'u@im.wechat',
      },
    });
    const adopted = [];
    const controller = createWeixinController({
      deps: {
        channelId: 'weixin',
        dataDir,
        logger: silentLogger,
        createJsonStore,
        credentials,
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
        accessPolicy,
        storage: { read: () => ({ workspace: '/ws', contextEnhancement: null, accessPolicy: null }) },
        ready: async () => {},
        sessions: {
          ask: async () => ({ text: '', reason: { kind: 'completed' } }),
          bindings: { adopt: async (channelId, botId) => { adopted.push(botId); return 0; } },
        },
      },
      logger: silentLogger,
      internals: { createClient: () => client },
    });

    const before = await controller.endpoints['connection.status']({});
    assert.equal(before.value.accounts.length, 0);

    const begun = await controller.endpoints['login.begin']({});
    assert.equal(begun.ok, true);
    assert.equal(begun.value.qrcodeUrl, 'https://ilinkai.weixin.qq.com/qr.png');

    const polled = await controller.endpoints['login.poll']({ attemptId: begun.value.attemptId });
    assert.equal(polled.ok, true);
    assert.equal(polled.value.status, 'connected');
    const botId = polled.value.botId;
    assert.equal(botId, deriveIdentity('acc@im.bot').botId);
    assert.equal(credentials.store.get(deriveIdentity('acc@im.bot').tokenRef), 'tok-new');
    assert.equal(adopted.length, 1, '启动时应接管旧会话绑定');

    const after = await controller.endpoints['connection.status']({});
    assert.equal(after.value.accounts.length, 1);
    assert.equal(after.value.accounts[0].state, 'running');
    assert.match(after.value.accounts[0].accountIdMasked, /\*\*\*\*/);

    // 再次轮询同一个 attempt 已经失效
    const again = await controller.endpoints['login.poll']({ attemptId: begun.value.attemptId });
    assert.equal(again.ok, false);
    assert.equal(again.error.code, 'weixin/unknown-attempt');

    // 删除账号：凭据一并清除
    const removed = await controller.endpoints['account.delete']({ botId, confirm: true });
    assert.equal(removed.value.removed, true);
    assert.equal(credentials.store.size, 0);
    await controller.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('控制器：凭据缺失时账号标记失败但不影响其他账号', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-weixin-ctl2-'));
  try {
    await writeFile(join(dataDir, 'config.json'), JSON.stringify({
      version: 1,
      accounts: [
        {
          botId: 'wx_ok', accountId: 'ok@im.bot', tokenRef: 'REF_OK',
          ownerUserId: 'u@im.wechat', baseUrl: 'https://ilinkai.weixin.qq.com/',
        },
        {
          botId: 'wx_bad', accountId: 'bad@im.bot', tokenRef: 'REF_MISSING',
          ownerUserId: 'u@im.wechat', baseUrl: 'https://ilinkai.weixin.qq.com/',
        },
      ],
    }), 'utf8');
    const controller = createWeixinController({
      deps: {
        channelId: 'weixin',
        dataDir,
        logger: silentLogger,
        createJsonStore,
        credentials: { resolve: async (ref) => (ref === 'REF_OK' ? { value: 'tok' } : { configured: false }) },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
        accessPolicy,
        storage: { read: () => ({ workspace: '/ws', contextEnhancement: null, accessPolicy: null }) },
        ready: async () => {},
        sessions: { ask: async () => ({ text: '', reason: { kind: 'completed' } }), bindings: { adopt: async () => 0 } },
      },
      logger: silentLogger,
      internals: { createClient: () => createFakeClient() },
    });

    await controller.start();
    const { value } = await controller.endpoints['connection.status']({});
    const byId = Object.fromEntries(value.accounts.map((account) => [account.botId, account]));
    assert.equal(byId.wx_ok.state, 'running');
    assert.equal(byId.wx_bad.state, 'failed');
    assert.equal(byId.wx_bad.error, 'weixin/token-missing');
    await controller.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});
