/**
 * 飞书渠道：配置迁移、状态去重、过程展示三态、消息桥门禁、控制器端点。
 *
 * 上下文增强引擎用的是 hub 那份真实实现（渠道运行期就是通过 deps 拿到它），
 * 因此这里同时覆盖了"需求 4 在飞书链路上真的生效"。
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import * as accessPolicy from '../packages/dsh-chat/shared/access-policy.mjs';
import { captureContextEnhancementSource, enhanceContent } from '../packages/dsh-chat/shared/context-enhancement.mjs';
import { createFeishuBridge } from '../packages/dsh-chat-feishu/host/bridge.mjs';
import { createFeishuConfigStore, normalizeBot } from '../packages/dsh-chat-feishu/host/config-store.mjs';
import { createFeishuController } from '../packages/dsh-chat-feishu/host/controller.mjs';
import { createFeishuStateStore } from '../packages/dsh-chat-feishu/host/state-store.mjs';
import { createTurnPresenter, renderStepCard } from '../packages/dsh-chat-feishu/host/turn-presenter.mjs';

const silentLogger = { info() {}, warn() {}, error() {} };

const BOT = Object.freeze({
  id: 'bot_test',
  appId: 'cli_test_app',
  secretRef: 'DSH_FEISHU_APP_SECRET',
  ownerOpenIds: ['ou_owner'],
  domain: 'feishu',
  botName: '测试机器人',
  botOpenId: 'ou_bot',
  groupResponseMode: 'mention',
  groupTopicReply: false,
  stepPushDirect: 'off',
  stepPushGroup: 'off',
});

/** 1x1 透明 PNG，用来验证"字节 → base64 → PromptContentPart"这条链路。 */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

function createFakeGateway() {
  const calls = {
    replies: [], texts: [], cards: [], patches: [], resources: [], files: [], images: [],
    questionCards: [], approvalCards: [], markedCards: [], connects: 0, disconnects: 0,
  };
  const gatewayState = {
    downloadBytes: TINY_PNG,
    downloadContentType: 'image/png',
    downloadError: null,
    /** 按方法名注入失败，用于验证呈现层失败时的回退与可见性。 */
    failures: {},
  };
  return {
    calls,
    connected: false,
    isConnected() {
      return this.connected;
    },
    async connect({ onMessage }) {
      calls.connects += 1;
      calls.onMessage = onMessage;
      this.connected = true;
    },
    async disconnect() {
      calls.disconnects += 1;
      this.connected = false;
    },
    async replyText({ messageId, text }) {
      if (gatewayState.failures.replyText) throw gatewayState.failures.replyText;
      calls.replies.push({ messageId, text });
      return { messageId: 'om_reply' };
    },
    async sendText({ chatId, openId, text }) {
      if (gatewayState.failures.sendText) throw gatewayState.failures.sendText;
      calls.texts.push({ chatId, openId, text });
      return { messageId: 'om_sent' };
    },
    async replyCard({ messageId, card }) {
      if (gatewayState.failures.replyCard) throw gatewayState.failures.replyCard;
      calls.cards.push({ messageId, card });
      return { messageId: 'om_card' };
    },
    async patchCard({ messageId, card }) {
      if (gatewayState.failures.patchCard) throw gatewayState.failures.patchCard;
      calls.patches.push({ messageId, card });
      return { messageId };
    },
    /** 假资源下载：默认给一张 1x1 PNG，可由用例替换成失败/超限。 */
    async downloadResource({ messageId, fileKey, type }) {
      calls.resources.push({ messageId, fileKey, type });
      if (gatewayState.downloadError) throw gatewayState.downloadError;
      return {
        bytes: Buffer.from(gatewayState.downloadBytes),
        contentType: gatewayState.downloadContentType,
      };
    },
    setDownload(next) {
      Object.assign(gatewayState, next);
    },
    /** 注入某个方法的下一次失败（传 null 清除）。 */
    setFailure(method, error) {
      gatewayState.failures[method] = error;
    },
    /** 一批问题一张卡：messageId 有值即为就地更新。 */
    async sendQuestionsCard({ chatId, openId, questions, answered, final, messageId }) {
      if (gatewayState.failures.sendQuestionsCard) throw gatewayState.failures.sendQuestionsCard;
      calls.questionCards.push({ chatId, openId, ids: questions?.map((q) => q.id), answered, final, messageId });
      return { messageId: messageId ?? 'om_question_card' };
    },
    /** 提问/审批卡片（交互回传用）。 */
    async sendQuestionCard({ chatId, openId, question, position, total }) {
      if (gatewayState.failures.sendQuestionCard) throw gatewayState.failures.sendQuestionCard;
      calls.questionCards.push({ chatId, openId, question, position, total });
      return { messageId: 'om_question_card' };
    },
    async sendApprovalCard({ chatId, openId, request }) {
      if (gatewayState.failures.sendApprovalCard) throw gatewayState.failures.sendApprovalCard;
      calls.approvalCards.push({ chatId, openId, request });
      return { messageId: 'om_approval_card' };
    },
    async markCardAnswered({ messageId, title, content }) {
      calls.markedCards.push({ messageId, title, content });
      return { messageId };
    },
    /** 主动发文件/图片（投递用）。 */
    async sendFile({ chatId, openId, path, name }) {
      if (gatewayState.failures.sendFile) throw gatewayState.failures.sendFile;
      calls.files.push({ chatId, openId, path, name });
      return { messageId: 'om_file', fileKey: 'file_key_1', name, size: 2048 };
    },
    async sendImage({ chatId, openId, path }) {
      if (gatewayState.failures.sendImage) throw gatewayState.failures.sendImage;
      calls.images.push({ chatId, openId, path });
      return { messageId: 'om_image', imageKey: 'image_key_1' };
    },
  };
}

function messageEvent({
  messageId = 'om_1',
  chatType = 'p2p',
  chatId = 'oc_chat',
  text = '你好',
  senderId = 'ou_owner',
  mentions = undefined,
  messageType = 'text',
  imageKey = 'img_v2_test',
  fileKey = 'file_v3_test',
  fileName = '报表.xlsx',
} = {}) {
  const content = messageType === 'text'
    ? JSON.stringify({ text })
    : messageType === 'image' ? JSON.stringify({ image_key: imageKey })
      : messageType === 'file' ? JSON.stringify({ file_key: fileKey, file_name: fileName }) : '{}';
  return {
    sender: { sender_id: { open_id: senderId } },
    message: {
      message_id: messageId,
      chat_id: chatId,
      chat_type: chatType,
      message_type: messageType,
      content,
      ...(mentions ? { mentions } : {}),
    },
  };
}

async function makeBridge({
  bot = BOT,
  contextEnhancement = null,
  policy = null,
  askResult = { text: '最终答案', reason: { kind: 'completed' }, tools: [] },
  onAsk = () => {},
} = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-'));
  const gateway = createFakeGateway();
  /** 假的交互回传服务：记录接入与认领调用，claim 为 true 表示"这条消息是回答"。 */
  const attached = [];
  const offers = [];
  const interactions = {
    /** claimed=true：任何会话都认领；claimKey=xxx：只认领这个会话键（用于验证路由）。 */
    claimed: false,
    claimKey: null,
    attached,
    attach(options) {
      attached.push(options);
      return () => { options.detached = true; };
    },
    offer(request) {
      offers.push(request);
      if (interactions.claimKey) return request.key === interactions.claimKey;
      return interactions.claimed;
    },
  };
  const state = createFeishuStateStore({ path: join(dataDir, 'state.json'), logger: silentLogger });
  await state.load();
  const published = [];
  /** 记录上传给会话的文件（入站文件链路用）；uploadFailure 可注入失败。 */
  const uploads = [];
  let uploadFailure = null;
  const deps = {
    channelId: 'feishu',
    dataDir,
    logger: silentLogger,
    ready: async () => {},
    storage: {
      read: () => ({
        workspace: '/ws', contextEnhancement, accessPolicy: policy, model: null, agentPreset: null,
      }),
    },
    contextEnhancement: { captureContextEnhancementSource, enhanceContent },
    interactions,
    accessPolicy,
    guidance: { publish: (sessionId, text) => published.push({ sessionId, text }) },
    sessions: {
      ensure: async ({ key }) => ({ sessionId: `session-${key}`, created: false }),
      uploadFile: async (options) => {
        uploads.push({ name: options.name, bytes: options.bytes?.length ?? 0 });
        if (uploadFailure) throw uploadFailure;
        return { receiptId: 'receipt-test-1', file: { attachmentId: 'sha256:x', name: options.name, bytes: options.bytes?.length ?? 0 } };
      },
      ask: async (options) => {
        onAsk(options);
        // 模拟 hub 的会话桥：发布 guidance 后回调过程事件。
        deps.guidance.publish('session-1', options.sourceGuidance ?? '');
        for (const handler of [options.handlers?.onToolCall]) {
          if (typeof handler === 'function') handler({ data: { name: 'bash' } });
        }
        if (typeof options.handlers?.onTurnEnd === 'function' && askResult.reason) {
          options.handlers.onTurnEnd({ data: { reason: askResult.reason } });
        }
        return askResult;
      },
      bindings: { adopt: async () => 0 },
    },
  };
  const bridge = createFeishuBridge({ bot, deps, gateway, state, logger: silentLogger });
  return {
    bridge,
    gateway,
    state,
    deps,
    published,
    interactions,
    attached,
    offers,
    uploads,
    setUploadFailure(error) { uploadFailure = error; },
    dataDir,
    async cleanup() {
      await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
    },
  };
}

test('配置迁移：旧的全局 stepPush/stepPushMode 变成私聊/群聊两份', () => {
  const migrated = normalizeBot({
    id: 'bot_1',
    appId: 'cli_x',
    secretRef: 'DSH_FEISHU_APP_SECRET',
    ownerOpenIds: ['ou_a'],
    stepPush: true,
    stepPushMode: 'streaming_card',
  });
  assert.equal(migrated.stepPushDirect, 'streaming_card');
  assert.equal(migrated.stepPushGroup, 'streaming_card');
  assert.equal(migrated.stepPush, undefined, '旧字段不再出现在归一化结果里');

  const off = normalizeBot({
    id: 'bot_2', appId: 'cli_x', secretRef: 'DSH_FEISHU_APP_SECRET', ownerOpenIds: ['ou_a'],
    stepPush: false, stepPushMode: 'post',
  });
  assert.equal(off.stepPushDirect, 'off');
  assert.equal(off.stepPushGroup, 'off');

  // 新字段存在时优先，且非法值回落 off。
  const explicit = normalizeBot({
    id: 'bot_3', appId: 'cli_x', secretRef: 'DSH_FEISHU_APP_SECRET', ownerOpenIds: ['ou_a'],
    stepPush: true, stepPushMode: 'streaming_card',
    stepPushDirect: 'post', stepPushGroup: '乱填',
  });
  assert.equal(explicit.stepPushDirect, 'post');
  assert.equal(explicit.stepPushGroup, 'off');
});

test('配置存储：读写既有格式、按 id 保存、原子设置两份过程展示', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-cfg-'));
  try {
    const path = join(dataDir, 'config.json');
    await writeFile(path, JSON.stringify({
      version: 2,
      bots: [{
        id: 'bot_a',
        appId: 'cli_a',
        secretRef: 'DSH_FEISHU_APP_SECRET_A',
        ownerOpenIds: ['ou_owner'],
        botName: '张三-DSH',
        stepPush: true,
        stepPushMode: 'streaming_card',
      }],
    }), 'utf8');

    const store = createFeishuConfigStore({ path, logger: silentLogger });
    await store.load();
    assert.equal(store.list().length, 1);
    assert.equal(store.get('bot_a').stepPushDirect, 'streaming_card');

    const saved = await store.setStepPush('bot_a', { direct: 'post', group: 'off' });
    assert.deepEqual({ direct: saved.stepPushDirect, group: saved.stepPushGroup }, { direct: 'post', group: 'off' });

    const onDisk = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(onDisk.bots[0].stepPushDirect, 'post');
    assert.equal(onDisk.bots[0].stepPushGroup, 'off');
    assert.equal(onDisk.bots[0].stepPush, undefined, '旧字段在保存后消失');
    assert.equal(onDisk.bots[0].botName, '张三-DSH', '无关字段保持原样');

    assert.equal(await store.removeBot('bot_a'), true);
    assert.equal(store.list().length, 0);
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('状态存储：按消息 id 去重且能读出旧的会话绑定', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-state-'));
  try {
    const path = join(dataDir, 'state.json');
    await writeFile(path, JSON.stringify({
      version: 1,
      sessions: { 'p2p:ou_owner': 'session-old' },
      seenMessageIds: ['om_old'],
    }), 'utf8');
    const state = createFeishuStateStore({ path, logger: silentLogger });
    await state.load();
    assert.deepEqual(state.sessions(), { 'p2p:ou_owner': 'session-old' });
    assert.equal(state.markSeen('om_old'), false, '已处理过的消息不再处理');
    assert.equal(state.markSeen('om_new'), true);
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('放行规则：通配属主、指定属主、访问策略 open 三种都放行', async () => {
  // 通配属主（现实里群机器人就是这样绑的：ownerOpenIds=['*']）
  const wildcard = await makeBridge({ bot: { ...BOT, ownerOpenIds: ['*'] } });
  try {
    await wildcard.bridge.accept(messageEvent({ messageId: 'om_w', senderId: 'ou_anyone' }));
    assert.equal(wildcard.gateway.calls.replies.at(-1).text, '最终答案');
  } finally {
    await wildcard.cleanup();
  }

  // 指定属主
  const owner = await makeBridge({ bot: { ...BOT, ownerOpenIds: ['ou_owner'] } });
  try {
    await owner.bridge.accept(messageEvent({ messageId: 'om_o', senderId: 'ou_owner' }));
    assert.equal(owner.gateway.calls.replies.at(-1).text, '最终答案');
  } finally {
    await owner.cleanup();
  }

  // 访问策略 open（旧配置里 direct 为 open 的机器人）
  const open = await makeBridge({
    bot: { ...BOT, ownerOpenIds: ['ou_someone_else'] },
    policy: { direct: { mode: 'open' }, group: { mode: 'allowlist' } },
  });
  try {
    await open.bridge.accept(messageEvent({ messageId: 'om_p', senderId: 'ou_anyone' }));
    assert.equal(open.gateway.calls.replies.at(-1).text, '最终答案');
  } finally {
    await open.cleanup();
  }
});

test('放行规则：allowlist 且不在名单里的人被静默忽略', async () => {
  const app = await makeBridge({
    bot: { ...BOT, ownerOpenIds: ['ou_owner'] },
    policy: { direct: { mode: 'allowlist' }, group: { mode: 'allowlist' } },
  });
  try {
    await app.bridge.accept(messageEvent({ messageId: 'om_x', senderId: 'ou_other' }));
    assert.equal(app.gateway.calls.replies.length, 0);
    assert.equal(app.gateway.calls.cards.length, 0);
  } finally {
    await app.cleanup();
  }
});

test('过程展示 off：不产生任何过程消息，只回最终答案', async () => {
  const app = await makeBridge({ bot: { ...BOT, stepPushDirect: 'off' } });
  try {
    await app.bridge.accept(messageEvent());
    assert.equal(app.gateway.calls.cards.length, 0);
    assert.equal(app.gateway.calls.texts.length, 0);
    assert.equal(app.gateway.calls.replies.at(-1).text, '最终答案');
  } finally {
    await app.cleanup();
  }
});

test('过程展示 post：工具调用逐步回消息，最后单独回答案', async () => {
  const app = await makeBridge({ bot: { ...BOT, stepPushDirect: 'post' } });
  try {
    await app.bridge.accept(messageEvent());
    const stepReplies = app.gateway.calls.replies.filter((reply) => reply.text.startsWith('🛠'));
    assert.equal(stepReplies.length, 1);
    assert.equal(stepReplies[0].text, '🛠 bash');
    assert.equal(app.gateway.calls.replies.at(-1).text, '最终答案');
    assert.equal(app.gateway.calls.cards.length, 0);
  } finally {
    await app.cleanup();
  }
});

test('过程展示 streaming_card：一张卡原地刷新，最终答案进同一张卡', async () => {
  const app = await makeBridge({ bot: { ...BOT, stepPushDirect: 'streaming_card' } });
  try {
    await app.bridge.accept(messageEvent());
    assert.equal(app.gateway.calls.cards.length, 1);
    assert.ok(app.gateway.calls.patches.length >= 2, '过程与答案都应 patch 到同一张卡');
    const last = app.gateway.calls.patches.at(-1).card;
    const body = JSON.stringify(last);
    assert.ok(body.includes('bash'));
    assert.ok(body.includes('最终答案'));
    assert.equal(app.gateway.calls.replies.length, 0, '卡片模式下不再另发文本');
  } finally {
    await app.cleanup();
  }
});

test('过程展示按会话类型各取一份：私聊 post、群聊 off', async () => {
  const app = await makeBridge({ bot: { ...BOT, stepPushDirect: 'post', stepPushGroup: 'off' } });
  try {
    // 群聊（@ 机器人）走群聊设置 → 不推过程。
    await app.bridge.accept(messageEvent({
      messageId: 'om_group',
      chatType: 'group',
      mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' } }],
      text: '@_user_1 帮我看下',
    }));
    assert.equal(app.gateway.calls.replies.filter((reply) => reply.text.startsWith('🛠')).length, 0);

    // 私聊走私聊设置 → 推过程。
    await app.bridge.accept(messageEvent({ messageId: 'om_direct' }));
    assert.equal(app.gateway.calls.replies.filter((reply) => reply.text.startsWith('🛠')).length, 1);
  } finally {
    await app.cleanup();
  }
});

test('门禁：非属主不响应、群聊未 @ 不响应、重复消息只处理一次', async () => {
  const app = await makeBridge();
  const asked = [];
  try {
    await app.bridge.accept(messageEvent({ senderId: 'ou_stranger' }));
    assert.equal(app.gateway.calls.replies.length, 0);

    await app.bridge.accept(messageEvent({ messageId: 'om_g', chatType: 'group', text: '大家好' }));
    assert.equal(app.gateway.calls.replies.length, 0);

    await app.bridge.accept(messageEvent({ messageId: 'om_dup' }));
    await app.bridge.accept(messageEvent({ messageId: 'om_dup' }));
    assert.equal(app.gateway.calls.replies.length, 1, '同一条消息只处理一次');

    // 暂时不支持的富媒体类型给出明确提示（带类型名）。
    await app.bridge.accept(messageEvent({
      messageId: 'om_sticker', messageType: 'sticker', text: undefined,
    }));
    assert.match(app.gateway.calls.replies.at(-1).text, /暂时还不能处理「sticker」/);
    void asked;
  } finally {
    await app.cleanup();
  }
});

test('群聊 @ 后剥掉 @ 占位符再交给会话；上下文增强前缀与提示词生效', async () => {
  const contextEnhancement = {
    group: { enabled: true, fields: ['senderId', 'chatId'], guidance: '群聊全局提示词' },
    direct: { enabled: false, fields: ['senderId'], guidance: '' },
    targets: [{
      kind: 'group', id: 'oc_chat', label: '', enabled: true,
      fields: ['senderId', 'chatId'], guidance: '本群专属', merge: 'append',
    }],
  };
  let asked = null;
  const app = await makeBridge({ contextEnhancement, onAsk: (options) => { asked = options; } });
  try {
    await app.bridge.accept(messageEvent({
      messageId: 'om_g2',
      chatType: 'group',
      mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' } }],
      text: '@_user_1 帮我查下昨天的数据',
    }));
    assert.ok(asked, '应当进入会话');
    const text = asked.content[0].text;
    assert.ok(text.startsWith('<dsh_im_source>'), '应带来源块前缀');
    assert.ok(text.includes('"chatId":"oc_chat"'));
    assert.ok(text.endsWith('帮我查下昨天的数据'), '@ 占位符应被剥掉');
    assert.equal(asked.sourceGuidance, '本群专属\n\n群聊全局提示词', '指定群叠加全局提示词');
    assert.equal(asked.key, 'group:oc_chat');
    assert.equal(asked.workspacePath, '/ws');
  } finally {
    await app.cleanup();
  }
});

test('过程卡内容在被截断时仍是合法卡片（不产出坏 JSON）', () => {
  const card = renderStepCard({
    title: 't',
    lines: Array.from({ length: 40 }, (_, index) => `第 ${index} 步`),
    answer: '答'.repeat(20_000),
  });
  assert.ok(Array.isArray(card.elements));
  assert.ok(JSON.stringify(card).length < 14_000);
  const body = card.elements.map((element) => element.text?.content ?? '').join('');
  assert.ok(body.includes('答'));
});

test('控制器：状态、过程展示保存立即生效、未知机器人可读报错', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-ctl-'));
  try {
    await mkdir(join(dataDir, 'bots'), { recursive: true });
    await writeFile(join(dataDir, 'config.json'), JSON.stringify({
      version: 2,
      bots: [{
        id: 'bot_ctl',
        appId: 'cli_ctl_12345678',
        secretRef: 'DSH_FEISHU_APP_SECRET',
        ownerOpenIds: ['ou_owner'],
        botName: '控制器机器人',
        stepPushDirect: 'post',
        stepPushGroup: 'off',
      }],
    }), 'utf8');

    const gateway = createFakeGateway();
    const adopted = [];
    const controller = createFeishuController({
      deps: {
        channelId: 'feishu',
        dataDir,
        logger: silentLogger,
        credentials: { resolve: async () => ({ value: 'secret-value', configured: true }) },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
        accessPolicy,
        sessions: {
          ask: async () => ({ text: '', reason: { kind: 'completed' } }),
          bindings: { adopt: async (channelId, botId, entries) => { adopted.push({ channelId, botId, entries }); return 0; } },
        },
      },
      logger: silentLogger,
      internals: {
        sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
        createGateway: () => gateway,
      },
    });

    await controller.start();
    const status = await controller.endpoints['connection.status']({});
    assert.equal(status.ok, true);
    assert.equal(status.value.bots.length, 1);
    assert.equal(status.value.bots[0].state, 'running');
    assert.equal(status.value.bots[0].connected, true);
    assert.deepEqual(status.value.bots[0].stepPush, { direct: 'post', group: 'off' });
    assert.equal(status.value.bots[0].appIdMasked, 'cli_ctl_****');
    assert.equal(adopted.length, 1, '启动时应接管旧会话绑定');

    // 保存过程展示：落盘 + 运行态立即生效。
    const saved = await controller.endpoints['bot.step-push.set']({
      botId: 'bot_ctl', stepPush: { direct: 'off', group: 'streaming_card' },
    });
    assert.deepEqual(saved.value.stepPush, { direct: 'off', group: 'streaming_card' });
    const after = await controller.endpoints['connection.status']({});
    assert.deepEqual(after.value.bots[0].stepPush, { direct: 'off', group: 'streaming_card' });
    const onDisk = JSON.parse(await readFile(join(dataDir, 'config.json'), 'utf8'));
    assert.equal(onDisk.bots[0].stepPushGroup, 'streaming_card');

    // 非法载荷与未知机器人。
    const bad = await controller.endpoints['bot.step-push.set']({ botId: 'bot_ctl', stepPush: { direct: 'post' } });
    assert.equal(bad.ok, false);
    const unknown = await controller.endpoints['bot.reconnect']({ botId: 'bot_nope' });
    assert.equal(unknown.ok, false);
    assert.equal(unknown.error.code, 'feishu/unknown-bot');

    // 删除：断开连接并从配置中移除。
    const removed = await controller.endpoints['bot.delete']({ botId: 'bot_ctl', confirm: true });
    assert.equal(removed.value.removed, true);
    assert.equal(gateway.calls.disconnects, 1);
    const empty = await controller.endpoints['connection.status']({});
    assert.equal(empty.value.bots.length, 0);
    await controller.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('控制器：凭据缺失时该机器人标记失败，但不影响其他机器人', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-ctl2-'));
  try {
    await mkdir(join(dataDir, 'bots'), { recursive: true });
    await writeFile(join(dataDir, 'config.json'), JSON.stringify({
      version: 2,
      bots: [
        { id: 'bot_ok', appId: 'cli_ok_12345678', secretRef: 'REF_OK', ownerOpenIds: ['ou_owner'], stepPushDirect: 'off', stepPushGroup: 'off' },
        { id: 'bot_bad', appId: 'cli_bad_1234567', secretRef: 'REF_MISSING', ownerOpenIds: ['ou_owner'], stepPushDirect: 'off', stepPushGroup: 'off' },
      ],
    }), 'utf8');

    const controller = createFeishuController({
      deps: {
        channelId: 'feishu',
        dataDir,
        logger: silentLogger,
        credentials: {
          resolve: async (ref) => (ref === 'REF_OK' ? { value: 'ok' } : { configured: false }),
        },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
        accessPolicy,
        sessions: { ask: async () => ({ text: '', reason: { kind: 'completed' } }), bindings: { adopt: async () => 0 } },
      },
      logger: silentLogger,
      internals: {
        sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
        createGateway: () => createFakeGateway(),
      },
    });

    await controller.start();
    const { value } = await controller.endpoints['connection.status']({});
    const byId = Object.fromEntries(value.bots.map((bot) => [bot.id, bot]));
    assert.equal(byId.bot_ok.state, 'running');
    assert.equal(byId.bot_bad.state, 'failed');
    assert.equal(byId.bot_bad.error, 'feishu/credential-missing');
    assert.match(byId.bot_bad.errorMessage, /未配置/);
    await controller.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('过程展示模式非法取值在 UI 侧就被归一化（不会写坏配置）', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-cfg2-'));
  try {
    const path = join(dataDir, 'config.json');
    const store = createFeishuConfigStore({ path, logger: silentLogger });
    await store.load();
    await store.saveBot({ ...BOT });
    const saved = await store.setStepPush('bot_test', { direct: 'nonsense', group: 'post' });
    assert.equal(saved.stepPushDirect, 'off');
    assert.equal(saved.stepPushGroup, 'post');
    void createTurnPresenter;
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('图片消息：下载后按 PromptContentPart 交给会话（bytes → base64 + mediaType）', async () => {
  let asked = null;
  const app = await makeBridge({ onAsk: (options) => { asked = options; } });
  try {
    await app.bridge.accept(messageEvent({
      messageId: 'om_img_1', messageType: 'image', imageKey: 'img_v2_abc', text: undefined,
    }));

    assert.deepEqual(app.gateway.calls.resources,
      [{ messageId: 'om_img_1', fileKey: 'img_v2_abc', type: 'image' }]);
    assert.ok(asked, '图片也要进入会话');
    assert.equal(asked.content.length, 1);
    assert.deepEqual(asked.content[0], {
      type: 'image',
      mediaType: 'image/png',
      data: TINY_PNG.toString('base64'),
      name: 'feishu-image',
    });
    assert.equal(app.gateway.calls.replies.at(-1).text, '最终答案');
  } finally {
    await app.cleanup();
  }
});

test('图片消息：裸 octet-stream 用魔数识别；识别不了就明确拒绝而不是当图片交出去', async () => {
  let asked = null;
  const app = await makeBridge({ onAsk: (options) => { asked = options; } });
  try {
    app.gateway.setDownload({ downloadContentType: 'application/octet-stream' });
    await app.bridge.accept(messageEvent({
      messageId: 'om_img_2', messageType: 'image', text: undefined,
    }));
    assert.equal(asked?.content?.[0]?.mediaType, 'image/png', '魔数应能认出 PNG');

    asked = null;
    app.gateway.setDownload({
      downloadBytes: Buffer.from('not an image at all'),
      downloadContentType: 'application/octet-stream',
    });
    await app.bridge.accept(messageEvent({
      messageId: 'om_img_3', messageType: 'image', text: undefined,
    }));
    assert.equal(asked, null, '认不出的格式不能进模型');
    assert.match(app.gateway.calls.replies.at(-1).text, /格式暂不支持/);
  } finally {
    await app.cleanup();
  }
});

test('图片下载失败：回复可读原因、lastError 进状态、不把失败当成功', async () => {
  let asked = null;
  const app = await makeBridge({ onAsk: (options) => { asked = options; } });
  try {
    const failure = new Error('下载飞书资源失败：resource not found（code 234043）');
    failure.code = 'feishu/resource-failed';
    app.gateway.setDownload({ downloadError: failure });

    await app.bridge.accept(messageEvent({
      messageId: 'om_img_4', messageType: 'image', text: undefined,
    }));

    assert.equal(asked, null);
    assert.match(app.gateway.calls.replies.at(-1).text, /图片下载失败：.*234043/);
    assert.match(app.bridge.status().lastError, /234043/, 'lastError 要留下现场供设置页查看');
  } finally {
    await app.cleanup();
  }
});

test('图片消息：群聊仍受 @ 约束，未 @ 时既不下载也不进模型', async () => {
  const app = await makeBridge();
  try {
    await app.bridge.accept(messageEvent({
      messageId: 'om_img_g', chatType: 'group', messageType: 'image', text: undefined,
    }));
    assert.deepEqual(app.gateway.calls.resources, []);
    assert.equal(app.gateway.calls.replies.length, 0);
  } finally {
    await app.cleanup();
  }
});

test('图片消息：开着上下文增强时，来源文本块插在图片前面', async () => {
  const contextEnhancement = {
    group: { enabled: false, fields: ['senderId'], guidance: '' },
    direct: { enabled: true, fields: ['senderId'], guidance: '私聊全局提示词' },
    targets: [],
  };
  let asked = null;
  const app = await makeBridge({ contextEnhancement, onAsk: (options) => { asked = options; } });
  try {
    await app.bridge.accept(messageEvent({
      messageId: 'om_img_5', messageType: 'image', text: undefined,
    }));
    assert.equal(asked.content.length, 2, '先上下文文本块，再图片');
    assert.equal(asked.content[0].type, 'text');
    assert.ok(asked.content[0].text.startsWith('<dsh_im_source>'));
    assert.ok(asked.content[0].text.includes('"senderId":"ou_owner"'));
    assert.equal(asked.content[1].type, 'image');
    assert.equal(asked.sourceGuidance, '私聊全局提示词');
  } finally {
    await app.cleanup();
  }
});

test('呈现层失败绝不静默：建卡失败/刷卡失败都退化成文本回复，并把原因交给状态', async () => {
  const contextEnhancement = null;
  const cardMode = {
    ...BOT,
    stepPushDirect: 'streaming_card',
    stepPushGroup: 'streaming_card',
  };

  // ① 建卡失败 → 必须改用普通消息，用户一定收得到答案
  const noCard = await makeBridge({ bot: cardMode, contextEnhancement });
  try {
    noCard.gateway.setFailure('replyCard', new Error('飞书拒绝建卡'));
    await noCard.bridge.accept(messageEvent({ messageId: 'om_cardfail' }));
    assert.equal(noCard.gateway.calls.cards.length, 0);
    assert.equal(noCard.gateway.calls.replies.at(-1).text, '最终答案', '建卡失败也要把答案发出去');
    assert.match(noCard.bridge.status().lastError, /创建过程卡失败：飞书拒绝建卡/);
  } finally {
    await noCard.cleanup();
  }

  // ② 建卡成功但刷卡失败 → 也要退化成文本，而不是留一张"正在处理…"的卡片
  const patchFail = await makeBridge({ bot: cardMode });
  try {
    patchFail.gateway.setFailure('patchCard', new Error('飞书拒绝更新卡片'));
    await patchFail.bridge.accept(messageEvent({ messageId: 'om_patchfail' }));
    assert.equal(patchFail.gateway.calls.cards.length, 1, '卡片先建出来了');
    assert.equal(patchFail.gateway.calls.replies.at(-1).text, '最终答案', '刷卡失败后要补一条文本');
    assert.match(patchFail.bridge.status().lastError, /更新过程卡失败/);
  } finally {
    await patchFail.cleanup();
  }

  // ③ 回复原消息失败 → 退到"发到这个会话"
  const replyFail = await makeBridge({ bot: { ...BOT, stepPushDirect: 'off' } });
  try {
    replyFail.gateway.setFailure('replyText', new Error('回复被拒'));
    await replyFail.bridge.accept(messageEvent({ messageId: 'om_replyfail' }));
    assert.equal(replyFail.gateway.calls.texts.at(-1).text, '最终答案');
    assert.equal(replyFail.gateway.calls.texts.at(-1).chatId, 'oc_chat');
  } finally {
    await replyFail.cleanup();
  }

  // ④ 两条路都失败：状态里必须留下原因（用户没收到时才有得查）
  const allFail = await makeBridge({ bot: { ...BOT, stepPushDirect: 'off' } });
  try {
    allFail.gateway.setFailure('replyText', new Error('回复被拒'));
    allFail.gateway.setFailure('sendText', new Error('发送也被拒'));
    await allFail.bridge.accept(messageEvent({ messageId: 'om_allfail' }));
    assert.match(allFail.bridge.status().lastError, /回退发送失败：发送也被拒/);
  } finally {
    await allFail.cleanup();
  }

  // ⑤ 一切正常时不留下"错误"噪音
  const ok = await makeBridge({ bot: cardMode, contextEnhancement });
  try {
    await ok.bridge.accept(messageEvent({ messageId: 'om_ok' }));
    assert.equal(ok.bridge.status().lastError, null);
    assert.equal(ok.gateway.calls.cards.length, 1);
  } finally {
    await ok.cleanup();
  }
});

test('交互回传：agent 的提问发到飞书、飞书回复被认领为答案且不再进模型', async () => {
  let asked = null;
  const app = await makeBridge({ onAsk: (options) => { asked = options; } });
  try {
    // 构造时就把"怎么发到会话"交给了 hub
    assert.equal(app.attached.length, 1);
    assert.equal(app.attached[0].channelId, 'feishu');
    assert.equal(app.attached[0].botId, BOT.id);

    // 私聊发一条普通消息时，先问交互服务；没人认领才进模型
    await app.bridge.accept(messageEvent({ messageId: 'om_plain', text: '普通问题' }));
    assert.equal(app.offers.length, 1, '每条消息都要先让交互服务看一眼');
    assert.equal(app.offers[0].key, 'p2p:ou_owner');
    assert.ok(asked, '没被认领的消息照常进模型');

    // 被认领：这条消息是回答，不该再跑一轮
    asked = null;
    app.interactions.claimed = true;
    await app.bridge.accept(messageEvent({ messageId: 'om_answer', text: '2' }));
    assert.equal(asked, null, '回答不能再进模型');
    assert.equal(app.offers.at(-1).text, '2');
    assert.equal(app.gateway.calls.replies.length, 1, '被认领的回答不产生任何回复');
  } finally {
    await app.cleanup();
  }
});

test('交互回传：身份门禁依然优先，群聊里回答可以不 @ 机器人', async () => {
  const app = await makeBridge();
  try {
    // 未被放行的人不能替别人回答问题
    app.interactions.claimed = true;
    await app.bridge.accept(messageEvent({ messageId: 'om_stranger', senderId: 'ou_stranger', text: '1' }));
    assert.equal(app.offers.length, 0, '门禁在认领之前');

    // 群聊里回答提问不需要 @（否则没法在群里回答）
    await app.bridge.accept(messageEvent({
      messageId: 'om_group_answer', chatType: 'group', text: '生产', mentions: undefined,
    }));
    assert.equal(app.offers.length, 1);
    assert.equal(app.offers[0].key, 'group:oc_chat');
  } finally {
    await app.cleanup();
  }
});

test('交互回传：发送器按会话键路由，停机时摘掉（停掉的机器人不接单）', async () => {
  const app = await makeBridge();
  try {
    const { send } = app.attached[0];
    await send({ key: 'p2p:ou_a', text: '私聊提问' });
    await send({ key: 'group:oc_g', text: '群聊提问' });
    assert.deepEqual(app.gateway.calls.texts, [
      { chatId: undefined, openId: 'ou_a', text: '私聊提问' },
      { chatId: 'oc_g', openId: undefined, text: '群聊提问' },
    ]);
    assert.equal(app.attached[0].detached, undefined);
    app.bridge.dispose();
    assert.equal(app.attached[0].detached, true, 'dispose 要摘掉发送器');
  } finally {
    await app.cleanup();
  }
});

test('收尾报告投递方式：卡片 / 文本 / 失败三种都要说清楚', async () => {
  const cardMode = { ...BOT, stepPushDirect: 'streaming_card', stepPushGroup: 'streaming_card' };
  const card = await makeBridge({ bot: cardMode });
  try {
    await card.bridge.accept(messageEvent({ messageId: 'om_d1' }));
    assert.equal(card.gateway.calls.cards.length, 1);
  } finally {
    await card.cleanup();
  }

  const textMode = await makeBridge({ bot: { ...BOT, stepPushDirect: 'off', stepPushGroup: 'off' } });
  try {
    await textMode.bridge.accept(messageEvent({ messageId: 'om_d2' }));
    assert.equal(textMode.gateway.calls.replies.at(-1).text, '最终答案');
  } finally {
    await textMode.cleanup();
  }

  // 全失败：状态里必须留下原因（用户没收到时才有得查）
  const broken = await makeBridge({ bot: { ...BOT, stepPushDirect: 'off' } });
  try {
    broken.gateway.setFailure('replyText', new Error('回复被拒'));
    broken.gateway.setFailure('sendText', new Error('也发不出去'));
    await broken.bridge.accept(messageEvent({ messageId: 'om_d3' }));
    assert.match(broken.bridge.status().lastError, /回退发送失败/);
  } finally {
    await broken.cleanup();
  }
});

test('控制器投递：文件走 file 消息、图片走 image 消息，机器人离线时拒绝', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-ctl-'));
  try {
    await mkdir(join(dataDir, 'bots'), { recursive: true });
    await writeFile(join(dataDir, 'config.json'), JSON.stringify({
      version: 2,
      bots: [{
        id: 'bot_ctl',
        appId: 'cli_ctl_12345678',
        secretRef: 'DSH_FEISHU_APP_SECRET',
        ownerOpenIds: ['ou_owner'],
        botName: '控制器机器人',
        stepPushDirect: 'off',
        stepPushGroup: 'off',
      }],
    }), 'utf8');

    const gateway = createFakeGateway();
    const controller = createFeishuController({
      deps: {
        channelId: 'feishu',
        dataDir,
        logger: silentLogger,
        credentials: { resolve: async () => ({ value: 'secret-value', configured: true }) },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
        accessPolicy,
        sessions: { ask: async () => ({ text: '', reason: { kind: 'completed' } }), bindings: { adopt: async () => 0 } },
      },
      logger: silentLogger,
      internals: {
        sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
        createGateway: () => gateway,
      },
    });

    await controller.start();

    const target = { id: 'ou_1', kind: 'direct', route: { openId: 'ou_1' } };
    const file = await controller.delivery.sendFile({
      botId: 'bot_ctl',
      target,
      file: { path: '/tmp/报表.xlsx', name: '报表.xlsx', size: 2048, kind: 'file' },
    });
    assert.equal(file.messageId, 'om_file');
    assert.equal(file.kind, 'file');
    assert.deepEqual(gateway.calls.files, [
      { chatId: undefined, openId: 'ou_1', path: '/tmp/报表.xlsx', name: '报表.xlsx' },
    ]);

    const image = await controller.delivery.sendFile({
      botId: 'bot_ctl',
      target,
      file: { path: '/tmp/图表.png', name: '图表.png', size: 512, kind: 'image' },
    });
    assert.equal(image.messageId, 'om_image');
    assert.equal(image.kind, 'image');
    assert.equal(image.name, '图表.png');
    assert.deepEqual(gateway.calls.images, [{ chatId: undefined, openId: 'ou_1', path: '/tmp/图表.png' }]);

    // 机器人不在线（这里用未知 id 走同一条判断）：稳定错误码，而不是静默失败
    await assert.rejects(
      () => controller.delivery.sendFile({
        botId: 'bot_not_running',
        target,
        file: { path: '/tmp/报表.xlsx', name: '报表.xlsx', size: 1, kind: 'file' },
      }),
      (error) => error.code === 'feishu/bot-offline',
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('入站文件：下载 → 上传到会话 → 以 file 内容块交给模型', async () => {
  let asked = null;
  const app = await makeBridge({ onAsk: (options) => { asked = options; } });
  try {
    await app.bridge.accept(messageEvent({
      messageId: 'om_file_1',
      messageType: 'file',
      text: undefined,
      fileKey: 'file_v3_abc',
      fileName: '月度报表.xlsx',
    }));

    assert.deepEqual(app.gateway.calls.resources, [
      { messageId: 'om_file_1', fileKey: 'file_v3_abc', type: 'file' },
    ]);
    assert.deepEqual(app.uploads, [{ name: '月度报表.xlsx', bytes: TINY_PNG.length }]);
    assert.equal(asked.content.length, 1);
    assert.deepEqual(asked.content[0], { type: 'file', receiptId: 'receipt-test-1' });
    assert.equal(app.gateway.calls.replies.at(-1).text, '最终答案');
  } finally {
    await app.cleanup();
  }
});

test('入站文件：上传失败要回可读原因并记进状态，绝不当成收下来了', async () => {
  let asked = null;
  const app = await makeBridge({ onAsk: (options) => { asked = options; } });
  try {
    const failure = new Error('上传文件失败：磁盘满了');
    failure.code = 'attachment/io';
    app.setUploadFailure(failure);
    await app.bridge.accept(messageEvent({
      messageId: 'om_file_2', messageType: 'file', text: undefined, fileName: '大文件.zip',
    }));

    assert.equal(asked, null, '没入库就不能进模型');
    assert.match(app.gateway.calls.replies.at(-1).text, /这个文件暂时没能收下：上传文件失败：磁盘满了/);
    assert.match(app.bridge.status().lastError, /上传文件失败/);
  } finally {
    await app.cleanup();
  }
});

test('入站文件：群聊未 @ 时连下载都不做', async () => {
  const app = await makeBridge();
  try {
    await app.bridge.accept(messageEvent({
      messageId: 'om_file_g', chatType: 'group', messageType: 'file', text: undefined,
    }));
    assert.deepEqual(app.gateway.calls.resources, []);
    assert.deepEqual(app.uploads, []);
    assert.equal(app.gateway.calls.replies.length, 0);
  } finally {
    await app.cleanup();
  }
});

test('交互回传：单选提问发按钮卡片；点按钮即答案（与手打文字同一条认领路径）', async () => {
  const app = await makeBridge();
  try {
    app.interactions.claimKey = 'p2p:ou_owner';
    const attach = app.attached[0];
    assert.equal(typeof attach.sendQuestions, 'function', '桥要提供批量卡片渲染能力');
    assert.equal(typeof attach.sendApproval, 'function');

    const questions = [
      {
        id: 'intent',
        header: '确认需求',
        question: '这份指标表你想怎么处理？',
        options: [{ label: '映射到知识库口径' }, { label: '只做格式检查' }],
      },
      { id: 'scope', question: '口径按哪个版本？', options: [{ label: '最新' }] },
    ];
    await attach.sendQuestions({ key: 'p2p:ou_owner', questions, answered: {}, final: false });
    assert.equal(app.gateway.calls.questionCards.length, 1);
    assert.deepEqual(app.gateway.calls.questionCards[0].ids, ['intent', 'scope'], '一批问题只发一张卡');
    assert.equal(app.gateway.calls.questionCards[0].openId, 'ou_owner');
    assert.equal(app.gateway.calls.questionCards[0].messageId, null);

    // 答完第一个就地更新同一张卡（不新发消息）
    await attach.sendQuestions({
      key: 'p2p:ou_owner', questions,
      answered: { intent: { selected: ['映射到知识库口径'] } },
      final: false,
    });
    assert.equal(app.gateway.calls.questionCards.length, 2);
    assert.equal(app.gateway.calls.questionCards[1].messageId, 'om_question_card', '要带上原卡片 id');
    assert.deepEqual(app.gateway.calls.questionCards[1].answered, { intent: { selected: ['映射到知识库口径'] } });

    // 全部答完：更新成最终态并忘掉这张卡
    await attach.sendQuestions({ key: 'p2p:ou_owner', questions, answered: {}, final: true });
    assert.equal(app.gateway.calls.questionCards[2].final, true);

    // 用户点了第一个按钮：operator/chatId 由飞书给出
    const response = await app.bridge.handleCardAction({
      messageId: 'om_card_1',
      chatId: 'oc_chat',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh: 'answer', questionId: 'intent', label: '映射到知识库口径', index: '1' } },
    });
    assert.equal(response.toast.type, 'success');
    assert.match(response.toast.content, /映射到知识库口径/);
    assert.equal(app.offers.at(-1).text, '映射到知识库口径');
    assert.equal(app.offers.at(-1).questionId, 'intent', '按题认领，才能支持任意顺序作答');
    assert.equal(app.offers.at(-1).key, 'p2p:ou_owner', '群聊键没等待者时回落到私聊键');
    assert.equal(app.gateway.calls.markedCards.length, 0,
      '批量卡片模式下不能把卡替换成静态卡（会抹掉其余问题），由 hub 带着已答状态重渲染');
  } finally {
    await app.cleanup();
  }
});

test('交互回传：卡片回调同样过身份门禁，且不越权回答别人的问题', async () => {
  const app = await makeBridge();
  try {
    const attach = app.attached[0];
    await attach.sendQuestions({
      key: 'p2p:ou_owner',
      questions: [{ id: 'q', question: '选哪个？', options: [{ label: 'A' }] }],
      answered: {},
      final: false,
    });

    // 未被放行的人点按钮：不能认领
    await app.bridge.handleCardAction({
      messageId: 'om_card_2',
      chatId: 'oc_chat',
      operator: { openId: 'ou_stranger' },
      action: { value: { dsh: 'answer', questionId: 'q', label: 'A' } },
    });
    assert.equal(app.offers.length, 0, '门禁在认领之前');

    // 无关的卡片动作：不认领也不报错
    await app.bridge.handleCardAction({
      messageId: 'om_card_3', chatId: 'oc_chat', operator: { openId: 'ou_owner' },
      action: { value: { dsh: 'other' } },
    });
    assert.equal(app.offers.length, 0);
  } finally {
    await app.cleanup();
  }
});

test('交互回传：审批卡片点「允许」→ allowed-once；卡片发不出去时退回文本', async () => {
  const app = await makeBridge();
  try {
    app.interactions.claimKey = 'p2p:ou_owner';
    const attach = app.attached[0];
    await attach.sendApproval({ key: 'p2p:ou_owner', request: { toolName: 'bash', reason: '删除临时目录' } });
    assert.equal(app.gateway.calls.approvalCards.length, 1);

    const response = await app.bridge.handleCardAction({
      messageId: 'om_card_4', chatId: 'oc_chat', operator: { openId: 'ou_owner' },
      action: { value: { dsh: 'approval', decision: 'allowed-once' } },
    });
    assert.equal(response.toast.type, 'success');
    assert.equal(app.offers.at(-1).text, '允许');
  } finally {
    await app.cleanup();
  }

  // 卡片发送失败 → 回退纯文本，用户仍然有办法回答
  const fallback = await makeBridge();
  try {
    fallback.gateway.setFailure('sendQuestionsCard', new Error('飞书拒绝卡片'));
    await assert.rejects(
      () => fallback.attached[0].sendQuestions({
        key: 'p2p:ou_owner',
        questions: [{ id: 'q', question: '选哪个？', options: [{ label: 'A' }] }],
        answered: {}, final: false,
      }),
      /飞书拒绝卡片/,
      '渲染失败要抛给 hub，由 hub 决定是否退回文本（静默吞掉会让用户什么都看不到）',
    );
  } finally {
    await fallback.cleanup();
  }
});
