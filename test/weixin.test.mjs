/**
 * 微信渠道：id 推导（零重扫）、协议客户端、运行时（收/发/输入状态/放行）、控制器端点。
 */

import assert from 'node:assert/strict';
import { createCipheriv, createHash } from 'node:crypto';
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
import {
  aesEcbPaddedSize,
  decryptMedia,
  mediaDownloadUrl,
  mediaUploadUrl,
  parseMediaAesKey,
  sniffImageMediaType,
  trustedUploadUrl,
  uploadMediaToCdn,
} from '../packages/dsh-chat-weixin/host/media.mjs';
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
  const calls = {
    updates: [], texts: [], typing: [], config: [], files: [], images: [], starts: 0, stops: 0,
  };
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
    async sendFile(options) {
      calls.files.push(options);
      return { providerMessageIds: ['file-id'] };
    },
    async sendImage(options) {
      calls.images.push(options);
      return { providerMessageIds: ['image-id'] };
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
  fetchImpl = null,
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
  /** 假的交互回传服务：claim 为 true 表示"这条消息是回答"。 */
  const attached = [];
  const offers = [];
  const interactions = {
    claimed: false,
    attach(options) {
      attached.push(options);
      return () => { options.detached = true; };
    },
    offer(request) {
      offers.push(request);
      return interactions.claimed;
    },
  };
  /** 入站文件经 uploadFile 换 receipt 的记录。 */
  const uploads = [];
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
    interactions,
    guidance: { publish: (sessionId, text) => published.push({ sessionId, text }) },
    sessions: {
      ask: async (options) => {
        onAsk(options);
        deps.guidance.publish('session-1', options.sourceGuidance ?? '');
        return askResult;
      },
      ensure: async () => ({ sessionId: 'session-1' }),
      uploadFile: async ({ name, bytes }) => {
        uploads.push({ name, bytes });
        return { receiptId: `receipt-${uploads.length}` };
      },
      bindings: { adopt: async () => 0 },
    },
  };
  const runtime = createWeixinRuntime({
    account, token: 'tok', deps, client, state, logger: silentLogger,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  return {
    runtime, client, state, deps, published, uploads, dataDir, account,
    interactions, attached, offers,
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

test('运行时：重复投递只处理一次；不支持的消息类型给出提示', async () => {
  const app = await makeRuntime();
  try {
    await app.runtime.accept(inbound({ message_id: 'm_dup' }), new AbortController().signal);
    await app.runtime.accept(inbound({ message_id: 'm_dup' }), new AbortController().signal);
    assert.equal(app.client.calls.texts.length, 1, '同一条消息只回一次');

    await app.runtime.accept(inbound({
      message_id: 'm_video', item_list: [{ type: 4, video_item: {} }],
    }), new AbortController().signal);
    assert.match(app.client.calls.texts.at(-1).text, /目前支持文本、语音转写、图片与文件/);
  } finally {
    await app.cleanup();
  }
});


// ── 入站媒体（图片/文件）：CDN 下载 + AES-128-ECB 解密 ─────────────────────────

/** 造一条 iLink 媒体项：AES-128-ECB 加密后的密文 + 两种密钥编码 + CDN 查询串。 */
function makeMediaItem({
  plaintext, keyEncoding = 'aeskey', media = {}, extra = {},
}) {
  const key = Buffer.from('0123456789abcdef', 'utf8');
  const cipher = createCipheriv('aes-128-ecb', key, null);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const query = 'enc_param_abc';
  const mediaField = { encrypt_query_param: query, ...media };
  if (keyEncoding !== 'aeskey') {
    // 文件项没有 aeskey 字段，密钥在 media.aes_key 上（base64 编码的十六进制字符串）。
    mediaField.aes_key = Buffer.from(key.toString('hex'), 'utf8').toString('base64');
  }
  return {
    ciphertext,
    item: {
      ...(keyEncoding === 'aeskey' ? { aeskey: key.toString('hex') } : {}),
      media: mediaField,
      ...extra,
    },
  };
}

/** 只认 CDN 下载地址、返回密文的假 fetch。 */
function makeMediaFetch(ciphertext) {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    if (!String(url).startsWith('https://novac2c.cdn.weixin.qq.com/c2c/download?encrypted_query_param=')) {
      return { ok: false, status: 403, headers: { get: () => null } };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => ciphertext,
    };
  };
  return { fetchImpl, urls };
}

test('媒体：两种密钥编码都能解开，CDN 地址只认受信主机', () => {
  const key = Buffer.from('0123456789abcdef', 'utf8');
  // ① 图片：aeskey 是 32 位十六进制
  assert.deepEqual(parseMediaAesKey({ aeskey: key.toString('hex') }), key);
  // ② 文件：media.aes_key 是 base64（16 字节原文 / 32 位十六进制字符串两种形态）
  assert.deepEqual(parseMediaAesKey({ media: { aes_key: key.toString('base64') } }), key);
  assert.deepEqual(
    parseMediaAesKey({ media: { aes_key: Buffer.from(key.toString('hex')).toString('base64') } }),
    key,
  );
  assert.throws(() => parseMediaAesKey({ aeskey: 'zz' }), (error) => error.code === 'invalid-media-key');

  // 加密 → 解密往返
  const cipher = createCipheriv('aes-128-ecb', key, null);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from('图片字节')), cipher.final()]);
  assert.equal(decryptMedia(ciphertext, key).toString('utf8'), '图片字节');
  assert.throws(() => decryptMedia(ciphertext.subarray(0, 5), key), (error) => error.code === 'invalid-media-ciphertext');

  // encrypt_query_param 自己拼地址；full_url 必须落在 CDN 主机
  assert.match(
    mediaDownloadUrl({ encrypt_query_param: 'a b&c' }),
    /^https:\/\/novac2c\.cdn\.weixin\.qq\.com\/c2c\/download\?encrypted_query_param=a%20b%26c$/,
  );
  assert.equal(
    mediaDownloadUrl({ full_url: 'https://novac2c.cdn.weixin.qq.com/c2c/download?x=1' }),
    'https://novac2c.cdn.weixin.qq.com/c2c/download?x=1',
  );
  assert.throws(
    () => mediaDownloadUrl({ full_url: 'https://evil.example.com/c2c/download?x=1' }),
    (error) => error.code === 'untrusted-media-url',
  );
  assert.throws(() => mediaDownloadUrl({}), (error) => error.code === 'missing-media-url');
});

test('媒体：按魔数认图片类型，不认扩展名', () => {
  assert.equal(sniffImageMediaType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), 'image/png');
  assert.equal(sniffImageMediaType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffImageMediaType(Buffer.from('GIF89a', 'latin1')), 'image/gif');
  assert.equal(sniffImageMediaType(Buffer.from('RIFF0000WEBP', 'latin1')), 'image/webp');
  assert.equal(sniffImageMediaType(Buffer.from('not an image')), null);
});

test('运行时：收到图片 → 解密成内容块进模型；文字与图片混排都带上', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const { ciphertext, item } = makeMediaItem({ plaintext: png });
  const { fetchImpl, urls } = makeMediaFetch(ciphertext);
  let asked = null;
  const app = await makeRuntime({ fetchImpl, onAsk: (options) => { asked = options; } });
  try {
    await app.runtime.accept(inbound({
      message_id: 'm_img',
      item_list: [
        { type: 1, text_item: { text: '看看这张图' } },
        { type: 2, image_item: item },
      ],
    }), new AbortController().signal);

    assert.equal(urls.length, 1, '要按 CDN 地址下载一次');
    assert.equal(asked.content.length, 2, '文字 + 图片两个内容块');
    assert.equal(asked.content[0].type, 'text');
    assert.equal(asked.content[0].text, '看看这张图');
    assert.equal(asked.content[1].type, 'image');
    assert.equal(asked.content[1].mediaType, 'image/png');
    assert.equal(Buffer.from(asked.content[1].data, 'base64').toString('hex'), png.toString('hex'));
    assert.equal(app.client.calls.texts[0].text, '答案', '模型结果照常回复');
  } finally {
    await app.cleanup();
  }
});

test('运行时：纯图片消息（无文字）也能进模型', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
  const { ciphertext, item } = makeMediaItem({ plaintext: jpeg, keyEncoding: 'media-chain' });
  const { fetchImpl } = makeMediaFetch(ciphertext);
  let asked = null;
  const app = await makeRuntime({ fetchImpl, onAsk: (options) => { asked = options; } });
  try {
    await app.runtime.accept(inbound({
      message_id: 'm_img_only', item_list: [{ type: 2, image_item: item }],
    }), new AbortController().signal);
    assert.equal(asked.content.length, 1, '没有文字时只发图片块');
    assert.equal(asked.content[0].mediaType, 'image/jpeg');
  } finally {
    await app.cleanup();
  }
});

test('运行时：收到文件 → 先入会话换 receipt，再把 receipt 交给模型', async () => {
  const bytes = Buffer.from('col1,col2\n1,2\n', 'utf8');
  const { ciphertext, item } = makeMediaItem({
    plaintext: bytes, keyEncoding: 'media-chain', extra: { file_name: '指标.csv', len: bytes.length },
  });
  const { fetchImpl } = makeMediaFetch(ciphertext);
  let asked = null;
  const app = await makeRuntime({ fetchImpl, onAsk: (options) => { asked = options; } });
  try {
    await app.runtime.accept(inbound({
      message_id: 'm_file', item_list: [{ type: 5, file_item: item }],
    }), new AbortController().signal);

    assert.equal(app.uploads.length, 1);
    assert.equal(app.uploads[0].name, '指标.csv');
    assert.equal(Buffer.from(app.uploads[0].bytes).toString('utf8'), bytes.toString('utf8'));
    assert.deepEqual(asked.content, [{ type: 'file', receiptId: 'receipt-1' }]);
  } finally {
    await app.cleanup();
  }
});

test('运行时：媒体下载失败要让用户看见，并且不进模型', async () => {
  const { item } = makeMediaItem({ plaintext: Buffer.from([1, 2, 3, 4]) });
  const fetchImpl = async () => { throw new Error('connection reset'); };
  let asked = null;
  const app = await makeRuntime({ fetchImpl, onAsk: (options) => { asked = options; } });
  try {
    await app.runtime.accept(inbound({
      message_id: 'm_bad', item_list: [{ type: 2, image_item: item }],
    }), new AbortController().signal);

    assert.equal(asked, null, '失败绝不进模型');
    assert.match(app.client.calls.texts.at(-1).text, /这个图片没能收下：/);
    assert.match(app.client.calls.texts.at(-1).text, /connection reset/);
    assert.match(app.runtime.status().error, /微信媒体下载失败/, '错误要写进状态，便于排查');
  } finally {
    await app.cleanup();
  }
});

test('运行时：带媒体的消息不抢交互回答、也不当命令', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const { ciphertext, item } = makeMediaItem({ plaintext: png });
  const { fetchImpl } = makeMediaFetch(ciphertext);
  let handled = 0;
  const app = await makeRuntime({ fetchImpl, onAsk: () => { handled += 1; } });
  app.interactions.claimed = true;
  try {
    await app.runtime.accept(inbound({
      message_id: 'm_mix', item_list: [{ type: 1, text_item: { text: '/new' } }, { type: 2, image_item: item }],
    }), new AbortController().signal);
    assert.equal(app.offers.length, 0, '带媒体不算交互答案');
    assert.equal(handled, 1, '带媒体的 /new 不当命令，直接进模型');
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

test('运行时：会话失败时回复可读错误，并把错误写进状态文件', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-weixin-fail-'));
  try {
    const state = createWeixinStateStore({ path: join(dataDir, 'state.json'), createJsonStore });
    await state.ready();
    const texts = [];
    const runtime = createWeixinRuntime({
      account: {
        botId: 'wx_fail', accountId: 'acc@im.bot', tokenRef: 'REF',
        ownerUserId: 'u@im.wechat', baseUrl: 'https://ilinkai.weixin.qq.com/',
      },
      token: 'tok',
      deps: {
        channelId: 'weixin',
        logger: { info() {}, warn() {}, error() {} },
        ready: async () => {},
        createJsonStore,
        accessPolicy,
        storage: { read: () => ({ workspace: '/ws', contextEnhancement: null, accessPolicy: null }) },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
        sessions: {
          async ask() {
            const error = new Error('工作区不可用');
            error.code = 'chat/workspace-required';
            throw error;
          },
        },
      },
      client: {
        async getConfig() {
          return { typingTicket: 't' };
        },
        async sendTyping() {
          return true;
        },
        async sendText({ text }) {
          texts.push(text);
          return { providerMessageIds: ['x'] };
        },
      },
      state,
      logger: { info() {}, warn() {}, error() {} },
    });

    await runtime.accept({
      message_id: 'm_fail',
      from_user_id: 'u@im.wechat',
      message_type: 1,
      context_token: 'ctx',
      item_list: [{ type: 1, text_item: { text: '你好' } }],
    }, new AbortController().signal);

    assert.match(texts.at(-1), /处理失败：工作区不可用/, '失败必须让用户看见，不能静默');
    await state.flush();
    const onDisk = JSON.parse(await readFile(join(dataDir, 'state.json'), 'utf8'));
    assert.match(onDisk.lastError.message, /工作区不可用/);
    assert.ok(onDisk.lastError.at, '要带时间戳');
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
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

test('控制器：delivery.sendFile 只发给在线账号的 p2p 目标，账号离线/目标缺 userId 都明确报错', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-weixin-ctl3-'));
  const dir = await mkdtemp(join(tmpdir(), 'dsh-chat-weixin-ctl3-out-'));
  const client = createFakeClient();
  const controller = createWeixinController({
    deps: {
      channelId: 'weixin',
      dataDir,
      logger: silentLogger,
      createJsonStore,
      credentials: { resolve: async () => ({ value: 'tok' }) },
      contextEnhancement: { captureContextEnhancementSource, enhanceContent },
      accessPolicy,
      storage: { read: () => ({ workspace: dir, contextEnhancement: null, accessPolicy: null }) },
      ready: async () => {},
      sessions: {
        ask: async () => ({ text: '', reason: { kind: 'completed' } }),
        ensure: async () => ({ sessionId: 's' }),
        uploadFile: async () => ({ receiptId: 'r' }),
        bindings: { adopt: async () => 0 },
      },
    },
    logger: silentLogger,
    internals: { createClient: () => client },
  });

  try {
    await writeFile(join(dataDir, 'config.json'), JSON.stringify({
      version: 1,
      accounts: [{
        botId: 'wx_delivery', accountId: 'a@im.bot', tokenRef: 'REF',
        ownerUserId: 'u@im.wechat', baseUrl: 'https://ilinkai.weixin.qq.com/',
      }],
    }), 'utf8');

    const file = join(dir, '报表.csv');
    await writeFile(file, 'a,b\n1,2\n', 'utf8');

    // 未启动 → 明确的离线错误，不发任何东西
    await assert.rejects(
      () => controller.delivery.sendFile({
        botId: 'wx_delivery',
        target: { route: { userId: 'u@im.wechat' } },
        file: { path: file, name: '报表.csv', kind: 'file' },
      }),
      (error) => error.code === 'weixin/account-offline',
    );

    await controller.start();
    const sent = await controller.delivery.sendFile({
      botId: 'wx_delivery',
      target: { route: { userId: 'u@im.wechat' } },
      file: { path: file, name: '报表.csv', kind: 'file' },
    });
    assert.equal(sent.kind, 'file');
    assert.equal(sent.size, 8);
    assert.equal(client.calls.files.length, 1);

    await assert.rejects(
      () => controller.delivery.sendFile({
        botId: 'wx_delivery', target: { route: {} }, file: { path: file, kind: 'file' },
      }),
      (error) => error.code === 'chat/bad-target',
    );
    await controller.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('媒体：上传前按 AES 填充算长度，上传地址只信任 CDN 的 /c2c/upload', () => {
  assert.equal(aesEcbPaddedSize(0), 16);
  assert.equal(aesEcbPaddedSize(15), 16);
  assert.equal(aesEcbPaddedSize(16), 32);
  assert.equal(aesEcbPaddedSize(1_000), 1_008);

  const ok = trustedUploadUrl('https://novac2c.cdn.weixin.qq.com/c2c/upload?filekey=x');
  assert.equal(ok.pathname, '/c2c/upload');
  for (const bad of [
    'http://novac2c.cdn.weixin.qq.com/c2c/upload',
    'https://evil.example.com/c2c/upload',
    'https://novac2c.cdn.weixin.qq.com/c2c/download',
    'https://novac2c.cdn.weixin.qq.com:8443/c2c/upload',
  ]) {
    assert.throws(() => trustedUploadUrl(bad), /不受信任|无效/, bad);
  }

  // upload_full_url 优先但要过校验；只有 upload_param 时自己拼
  assert.equal(
    mediaUploadUrl({ upload_full_url: 'https://novac2c.cdn.weixin.qq.com/c2c/upload?filekey=abc' }, 'abc').toString(),
    'https://novac2c.cdn.weixin.qq.com/c2c/upload?filekey=abc',
  );
  const built = mediaUploadUrl({ upload_param: 'p q' }, 'fk/1');
  assert.match(
    built.toString(),
    /^https:\/\/novac2c\.cdn\.weixin\.qq\.com\/c2c\/upload\?encrypted_query_param=p\+q&filekey=fk%2F1$/,
  );
  assert.throws(() => mediaUploadUrl({}, 'fk'), (error) => error.code === 'missing-upload-url');
});

test('媒体：加密上传是流式推送，长度按填充后算，下载参数取响应头', async () => {
  const key = Buffer.from('0123456789abcdef', 'utf8');
  const plaintext = Buffer.alloc(200, 7);
  let seen = null;
  const fetchImpl = async (url, init) => {
    const chunks = [];
    for await (const chunk of init.body) chunks.push(Buffer.from(chunk));
    seen = {
      url: String(url),
      method: init.method,
      duplex: init.duplex,
      contentLength: Number(init.headers['content-length']),
      ciphertext: Buffer.concat(chunks),
    };
    return {
      status: 200,
      headers: { get: (name) => (name === 'x-encrypted-param' ? 'download-param-1' : null) },
    };
  };

  const param = await uploadMediaToCdn({
    url: 'https://novac2c.cdn.weixin.qq.com/c2c/upload?filekey=k',
    bytes: plaintext,
    key,
    fetchImpl,
  });

  assert.equal(param, 'download-param-1');
  assert.equal(seen.method, 'POST');
  assert.equal(seen.duplex, 'half', '要边加密边推流');
  assert.equal(seen.contentLength, aesEcbPaddedSize(plaintext.byteLength));
  assert.equal(seen.ciphertext.byteLength, seen.contentLength);
  assert.deepEqual(decryptMedia(seen.ciphertext, key), plaintext, '上传的密文要能被同一把钥匙解开');
});

test('媒体：上传响应缺参数 / 被拒 / 5xx 重试后仍失败，都要抛出可读错误', async () => {
  const key = Buffer.from('0123456789abcdef', 'utf8');
  const url = 'https://novac2c.cdn.weixin.qq.com/c2c/upload?filekey=k';
  const bytes = Buffer.alloc(32, 1);

  await assert.rejects(
    () => uploadMediaToCdn({
      url, bytes, key,
      fetchImpl: async () => ({ status: 200, headers: { get: () => null } }),
    }),
    (error) => error.code === 'invalid-upload-response',
  );

  await assert.rejects(
    () => uploadMediaToCdn({
      url, bytes, key,
      fetchImpl: async () => ({ status: 403, headers: { get: () => null } }),
    }),
    (error) => error.code === 'upload-rejected',
  );

  let attempts = 0;
  await assert.rejects(
    () => uploadMediaToCdn({
      url, bytes, key,
      fetchImpl: async () => { attempts += 1; return { status: 500, headers: { get: () => null } }; },
    }),
    (error) => error.code === 'upload-failed',
  );
  assert.equal(attempts, 3, '5xx 要重试 3 次');
});

test('协议客户端：发文件的请求形状（getuploadurl → CDN → sendmessage）', async () => {
  const calls = [];
  const uploads = [];
  const fetchImpl = async (url, init) => {
    const target = String(url);
    if (target.includes('/c2c/upload')) {
      const chunks = [];
      for await (const chunk of init.body) chunks.push(Buffer.from(chunk));
      uploads.push({ target, ciphertext: Buffer.concat(chunks), contentLength: Number(init.headers['content-length']) });
      return { status: 200, headers: { get: (name) => (name === 'x-encrypted-param' ? 'dl-param' : null) } };
    }
    calls.push({ url: target, body: init.body ? JSON.parse(init.body) : null });
    if (target.endsWith('ilink/bot/getuploadurl')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ret: 0, upload_full_url: 'https://novac2c.cdn.weixin.qq.com/c2c/upload?filekey=x' }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ ret: 0 }) };
  };
  const client = createIlinkClient({ fetchImpl });
  const bytes = Buffer.from('指标,数值\n销售额,100\n', 'utf8');

  const sent = await client.sendFile({
    baseUrl: 'https://ilinkai.weixin.qq.com/', token: 'tok', toUserId: 'u@im.wechat',
    fileName: '指标.csv', bytes, contextToken: 'ctx', runId: 'run',
  });

  // ① getuploadurl：报备原始大小/MD5/填充后大小与 AES 密钥
  const uploadRequest = calls[0].body;
  const aesKeyHex = uploadRequest.aeskey;
  assert.match(aesKeyHex, /^[0-9a-f]{32}$/);
  assert.equal(uploadRequest.media_type, 3, '文件用 media_type 3');
  assert.equal(uploadRequest.to_user_id, 'u@im.wechat');
  assert.equal(uploadRequest.rawsize, bytes.byteLength);
  assert.equal(uploadRequest.filesize, aesEcbPaddedSize(bytes.byteLength));
  assert.equal(uploadRequest.rawfilemd5, createHash('md5').update(bytes).digest('hex'));
  assert.equal(uploadRequest.no_need_thumb, true);
  assert.equal(typeof uploadRequest.filekey, 'string');

  // ② 上传到 CDN：密文用报备过的那把钥匙能解开
  assert.equal(uploads.length, 1);
  assert.deepEqual(
    decryptMedia(uploads[0].ciphertext, Buffer.from(aesKeyHex, 'hex')),
    bytes,
  );

  // ③ sendmessage：file_item 引用 CDN 上的密文
  const msg = calls.at(-1).body.msg;
  assert.equal(msg.message_type, 2);
  assert.equal(msg.to_user_id, 'u@im.wechat');
  assert.equal(msg.context_token, 'ctx');
  assert.equal(msg.run_id, 'run');
  assert.equal(msg.item_list.length, 1);
  const item = msg.item_list[0];
  assert.equal(item.type, 4);
  assert.equal(item.file_item.file_name, '指标.csv');
  assert.equal(item.file_item.len, String(bytes.byteLength));
  assert.equal(item.file_item.media.encrypt_query_param, 'dl-param');
  assert.equal(item.file_item.media.encrypt_type, 1);
  // 发出去的 aes_key 用**我们自己的入站解析器**能读回来（收发两个方向必须自洽）
  assert.deepEqual(
    parseMediaAesKey({ media: item.file_item.media }),
    Buffer.from(aesKeyHex, 'hex'),
  );
  assert.deepEqual(sent.providerMessageIds, [msg.client_id]);
});

test('协议客户端：发图片走 image_item，缺少接收人/文件名时明确报错', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/c2c/upload')) {
      if (init.body?.[Symbol.asyncIterator]) {
        for await (const _chunk of init.body) { /* 消费掉推流 */ }
      }
      return { status: 200, headers: { get: () => 'dl-img' } };
    }
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    if (String(url).endsWith('getuploadurl')) {
      return { ok: true, status: 200, json: async () => ({ upload_param: 'up-param' }) };
    }
    return { ok: true, status: 200, json: async () => ({ ret: 0 }) };
  };
  const client = createIlinkClient({ fetchImpl });
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  await client.sendImage({
    baseUrl: 'https://ilinkai.weixin.qq.com/', token: 'tok', toUserId: 'u@im.wechat', bytes: png,
  });
  assert.equal(calls[0].body.media_type, 1, '图片用 media_type 1');
  const item = calls.at(-1).body.msg.item_list[0];
  assert.equal(item.type, 2);
  assert.equal(item.image_item.mid_size, aesEcbPaddedSize(png.byteLength));
  assert.equal(item.image_item.media.encrypt_query_param, 'dl-img');

  await assert.rejects(
    () => client.sendFile({
      baseUrl: 'https://ilinkai.weixin.qq.com/', token: 'tok', toUserId: 'u@im.wechat', fileName: '  ', bytes: png,
    }),
    /fileName/,
  );
  await assert.rejects(
    () => client.sendImage({
      baseUrl: 'https://ilinkai.weixin.qq.com/', token: 'tok', toUserId: '', bytes: png,
    }),
    /toUserId/,
  );
});

test('运行时：主动发文件/图片读字节后交给客户端，空文件明确报错', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-chat-weixin-out-'));
  const app = await makeRuntime();
  try {
    // 先让用户说过一句话：主动投递要复用他最近一次的 context_token。
    await app.runtime.accept(inbound({ message_id: 'm_ctx' }), new AbortController().signal);

    const csv = join(dir, '报表.csv');
    await writeFile(csv, 'a,b\n1,2\n', 'utf8');
    const asFile = await app.runtime.sendFileProactive({
      userId: 'u@im.wechat', path: csv, name: '报表.csv', kind: 'file',
    });
    assert.equal(asFile.kind, 'file');
    assert.equal(asFile.name, '报表.csv');
    assert.equal(app.client.calls.files.length, 1);
    assert.equal(app.client.calls.files[0].fileName, '报表.csv');
    assert.equal(app.client.calls.files[0].contextToken, 'ctx-1', '主动投递也要带该用户的 context_token');
    assert.equal(Buffer.from(app.client.calls.files[0].bytes).toString('utf8'), 'a,b\n1,2\n');

    const png = join(dir, '图.png');
    await writeFile(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const asImage = await app.runtime.sendFileProactive({
      userId: 'u@im.wechat', path: png, kind: 'image',
    });
    assert.equal(asImage.kind, 'image');
    assert.equal(asImage.name, '图.png', '没给显示名时用文件名');
    assert.equal(app.client.calls.images.length, 1);

    const empty = join(dir, 'empty.txt');
    await writeFile(empty, '');
    await assert.rejects(
      () => app.runtime.sendFileProactive({ userId: 'u@im.wechat', path: empty, kind: 'file' }),
      /空的/,
    );
    await assert.rejects(() => app.runtime.sendFileProactive({ userId: '', path: csv }), /userId/);
  } finally {
    await app.cleanup();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('交互回传：提问发给微信用户；用户回复被认领为答案且不再进模型', async () => {
  const asked = [];
  const app = await makeRuntime({ onAsk: (options) => asked.push(options) });
  try {
    assert.equal(app.attached.length, 1);
    assert.equal(app.attached[0].channelId, 'weixin');

    // 普通消息：交互服务没认领 → 照常跑一轮
    await app.runtime.accept(inbound(), new AbortController().signal);
    assert.equal(asked.length, 1);
    assert.equal(app.offers[0].key, 'p2p:u@im.wechat');

    // 认领：这条消息是答案，不能再跑一轮，也不能回"答案"出去
    app.interactions.claimed = true;
    const before = app.client.calls.texts.length;
    await app.runtime.accept(inbound({ message_id: 'm_2', item_list: [{ type: 1, text_item: { text: '2' } }] }),
      new AbortController().signal);
    assert.equal(asked.length, 1, '回答不能再进模型');
    assert.equal(app.offers.at(-1).text, '2');
    assert.equal(app.client.calls.texts.length, before, '认领的消息不产生回复');

    // 发送器：把提问发到这个用户（走 sendProactive，带最近一次的 context_token）
    await app.attached[0].send({ key: 'p2p:u@im.wechat', text: '❓ 需要你确认' });
    assert.equal(app.client.calls.texts.at(-1).text, '❓ 需要你确认');
    assert.equal(app.client.calls.texts.at(-1).contextToken, 'ctx-1');

    app.runtime.stop?.();
    void app;
  } finally {
    await app.cleanup();
  }
});
