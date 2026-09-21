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
import { enhanceReplyReference } from '../packages/dsh-chat/shared/reply-reference.mjs';
import { createFeishuBridge } from '../packages/dsh-chat-feishu/host/bridge.mjs';
import { FEISHU_SCAN_REGISTER_OPTIONS } from '../packages/dsh-chat-feishu/host/app-manifest.mjs';
import { createFeishuConfigStore, normalizeBot } from '../packages/dsh-chat-feishu/host/config-store.mjs';
import { createFeishuController, deriveFeishuIdentity } from '../packages/dsh-chat-feishu/host/controller.mjs';
import { createFeishuStateStore } from '../packages/dsh-chat-feishu/host/state-store.mjs';
import {
  createTurnPresenter, renderStepCard, thinkRow, todoRows, toolRow,
} from '../packages/dsh-chat-feishu/host/turn-presenter.mjs';

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
    deliverables: [], deliverableImages: [], tokenUpdates: [],
    questionCards: [], approvalCards: [], markedCards: [], reactions: [], removedReactions: [],
    connects: 0, disconnects: 0,
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
    /** 主动发卡片（如 /menu 菜单卡）。此前假 gateway 没有这个方法，于是菜单卡一直走"退回文本"。 */
    async sendCard({ chatId, card }) {
      if (gatewayState.failures.sendCard) throw gatewayState.failures.sendCard;
      calls.cards.push({ chatId, card });
      return { messageId: 'om_card' };
    },
    async patchCard({ messageId, card }) {
      if (gatewayState.failures.patchCard) throw gatewayState.failures.patchCard;
      calls.patches.push({ messageId, card });
      return { messageId };
    },
    /**
     * 交互驱动的卡片更新（飞书延迟更新 token 路径）。
     * 真机上用 message.patch 更新交互卡片会被客户端还原，所以交互必须走这里。
     */
    async updateCard({ token, card }) {
      calls.tokenUpdates.push({ token, card });
      if (gatewayState.failures.updateCard) throw gatewayState.failures.updateCard;
      return { updated: true };
    },
    /** 假"读被引用的消息"：默认读得到，可由用例替换成失败。 */
    async getMessageText({ messageId }) {
      calls.quoted = calls.quoted ?? [];
      calls.quoted.push({ messageId });
      if (gatewayState.quotedError) throw gatewayState.quotedError;
      return {
        messageId,
        senderId: 'ou_owner',
        kind: gatewayState.quotedKind ?? 'text',
        text: gatewayState.quotedText ?? '昨天销售额多少？',
        fileName: gatewayState.quotedFileName ?? null,
      };
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
    /** 表情回复（"收到，在做了"）。 */
    async addReaction({ messageId, emojiType }) {
      if (gatewayState.failures.addReaction) throw gatewayState.failures.addReaction;
      calls.reactions.push({ messageId, emojiType });
      return { reactionId: 'reaction_1' };
    },
    async removeReaction({ messageId, reactionId }) {
      if (gatewayState.failures.removeReaction) throw gatewayState.failures.removeReaction;
      calls.removedReactions.push({ messageId, reactionId });
      return { removed: true };
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
    async markCardAnswered({ messageId, token = null, openIds = null, title, content }) {
      calls.markedCards.push({ messageId, token, openIds, title, content });
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
    /** 交付文件：一条消息带多个附件（真实网关用 post 的 files 附件区，正文不带文字）。 */
    async sendDeliverables({ chatId, openId, items }) {
      if (gatewayState.failures.sendDeliverables) throw gatewayState.failures.sendDeliverables;
      calls.deliverables.push({ chatId, openId, items });
      return {
        messageId: 'om_deliverables',
        files: items.filter((item) => !item.path.endsWith('.png')).map((item) => item.name),
        images: items.filter((item) => item.path.endsWith('.png')).map((item) => item.name),
        failed: [],
      };
    },
    /** 交付图片：只上传，给卡片内嵌用（真实网关调 image.create 拿 img_key）。 */
    async uploadDeliverableImages(items) {
      if (gatewayState.failures.uploadDeliverableImages) throw gatewayState.failures.uploadDeliverableImages;
      const uploaded = items.map((item) => ({ name: item.name, imageKey: `img_key_${item.name}` }));
      calls.deliverableImages.push(...uploaded);
      return { uploaded, failed: [] };
    },
  };
}

/**
 * 这一轮**最终答案**的投递结果（与 `最终答案投递方式` 那行日志同一个口径）。
 *
 * 「不显示过程」现在把答案放在**卡片**里（保留 Markdown），其它模式是文本——
 * 断言"答案到了"时不该假定是哪一种，否则每次改投递方式都要动一堆用例。
 *
 * @param app - makeBridge 的返回值。
 * @returns { kind: 'card'|'text'|'none', text: string, card: object|null }。
 */
function lastAnswer(app) {
  const card = app.gateway.calls.cards.at(-1);
  const reply = app.gateway.calls.replies.at(-1);
  // off 模式只发一张答案卡：正文就是答案，取它最后一个 markdown 元素。
  if (card && (!reply || app.gateway.calls.replies.length === 0)) {
    const elements = card.card?.body?.elements ?? [];
    const markdown = [...elements].reverse().find((el) => el?.tag === 'markdown');
    return { kind: 'card', text: markdown?.content ?? '', card: card.card };
  }
  if (reply) return { kind: 'text', text: reply.text ?? '', card: null };
  return { kind: 'none', text: '', card: null };
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
  parentId = null,
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
      ...(parentId ? { parent_id: parentId } : {}),
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
  commands = null,
  panel = null,
  statePath = null,
  /** 采集渠道注册的补发函数：`{ channelId, botId, deliver }`。 */
  deferred = null,
  /** true：模拟"设置还没读完盘"——ready() 之前 storage.read() 读到空文档。 */
  holdSettings = false,
  /** 会话标题里的聊天名解析器（控制器在真机上注入；不传就退回掩码 id）。 */
  resolveChatLabel = null,
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
    offers,
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
  /** holdSettings=false 时一开始就算"读完了"，与改动前行为一致。 */
  let settingsLoaded = !holdSettings;
  /**
   * 交互回传的卡片更新要排在**回调应答之后**（先更新再应答会被客户端还原）。
   * 测试里把那些任务收集起来，由 `flushPaints()` 跑完——从而能显式断言顺序。
   */
  const paints = [];
  const state = createFeishuStateStore({
    path: statePath ?? join(dataDir, 'state.json'), logger: silentLogger,
  });
  await state.load();
  const published = [];
  /** 记录上传给会话的文件（入站文件链路用）；uploadFailure 可注入失败。 */
  const uploads = [];
  let uploadFailure = null;
  const deps = {
    channelId: 'feishu',
    dataDir,
    logger: silentLogger,
    ready: async () => { settingsLoaded = true; },
    // 注入调度器：**只收集、不立刻执行**——真实环境里它们在回调应答之后才发生。
    scheduleAfterResponse: (task) => { paints.push(task); },
    storage: {
      read: () => {
        // 启动竞态：设置文档还没读进来时读到的就是空文档（门禁因此读不到访问策略）。
        if (!settingsLoaded) return {};
        return {
          workspace: '/ws', contextEnhancement, accessPolicy: policy, model: null, agentPreset: null,
        };
      },
    },
    contextEnhancement: { captureContextEnhancementSource, enhanceContent },
    replyReference: { enhanceReplyReference },
    interactions,
    accessPolicy,
    guidance: { publish: (sessionId, text) => published.push({ sessionId, text }) },
    ...(commands ? { commands } : {}),
    ...(panel ? { panel } : {}),
    ...(deferred ? { deferred: { register: (options) => deferred.push(options) } } : {}),
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
  const bridge = createFeishuBridge({
    bot, deps, gateway, state, logger: silentLogger, resolveChatLabel,
  });
  return {
    bridge,
    gateway,
    state,
    deps,
    panel,
    published,
    interactions,
    attached,
    offers,
    uploads,
    setUploadFailure(error) { uploadFailure = error; },
    paints,
    /** 跑完所有"排在应答之后"的卡片更新（真实环境里它们在应答发出后才发生）。 */
    async flushPaints() {
      for (let index = 0; index < paints.length; index += 1) await paints[index]();
      paints.length = 0;
    },
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

test('设属主：落盘 + 立刻生效（重连），非法 id 与 `['*']` 的语义', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-owner-'));
  try {
    await writeFile(join(dataDir, 'config.json'), JSON.stringify({
      version: 2,
      bots: [{
        id: 'bot_ctl',
        appId: 'cli_ctl_12345678',
        secretRef: 'DSH_FEISHU_APP_SECRET',
        ownerOpenIds: ['*'],
        botName: '控制器机器人',
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
    replyReference: { enhanceReplyReference },
        accessPolicy,
        sessions: {
          ask: async () => ({ text: '', reason: { kind: 'completed' } }),
          bindings: { adopt: async () => 0 },
        },
      },
      logger: silentLogger,
      internals: {
        sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
        createGateway: () => gateway,
      },
    });
    await controller.start();

    // 初始是 `*`：状态里要能看出来"没有属主"。
    const before = await controller.endpoints['connection.status']({});
    assert.equal(before.value.bots[0].ownersWildcard, true);
    assert.equal(before.value.bots[0].ownerCount, 0, '`*` 不该被算成一个属主');

    // 设一个具体属主：落盘 + 状态立刻反映。
    const saved = await controller.endpoints['bot.owner.set']({
      botId: 'bot_ctl', ownerOpenIds: ['ou_zhangzhiwei'],
    });
    assert.equal(saved.ok, true);
    assert.deepEqual(saved.value.ownerOpenIds, ['ou_zhangzhiwei']);
    assert.equal(saved.value.ownersWildcard, false);
    assert.equal(saved.value.ownerCount, 1);
    const onDisk = JSON.parse(await readFile(join(dataDir, 'config.json'), 'utf8'));
    assert.deepEqual(onDisk.bots[0].ownerOpenIds, ['ou_zhangzhiwei']);

    // 清空回"没有属主"：写 `*`（配置里不允许空名单）。
    const cleared = await controller.endpoints['bot.owner.set']({
      botId: 'bot_ctl', ownerOpenIds: ['*'],
    });
    assert.equal(cleared.ok, true);
    assert.equal(cleared.value.ownersWildcard, true);

    // 投递目标的 id（`p2p_ou_…`）不是属主 id（`ou_…`）：真机上就是这样点出过一次报错，
    // 所以这里钉住：拒绝，且报错要点出是哪个值不合法。
    const wrongShape = await controller.endpoints['bot.owner.set']({
      botId: 'bot_ctl', ownerOpenIds: ['p2p_ou_9a1c3e5f7b2d4068a2c4e6f8b0d1a3c5'],
    });
    assert.equal(wrongShape.ok, false);
    assert.match(wrongShape.error.message, /ou_…/, '要说清正确形状');
    assert.match(wrongShape.error.message, /p2p_ou_/, '要点出不合法的值');
    assert.deepEqual(wrongShape.error.details.offending, ['p2p_ou_9a1c3e5f7b2d4068a2c4e6f8b0d1a3c5']);

    // 非法输入要被拒绝：空数组、坏 id、超上限、未知机器人。
    for (const payload of [
      { botId: 'bot_ctl', ownerOpenIds: [] },
      { botId: 'bot_ctl', ownerOpenIds: ['ou_ok', '不是 id'] },
      { botId: 'bot_ctl', ownerOpenIds: Array.from({ length: 11 }, (_, i) => `ou_${i}`) },
      { botId: 'bot_nope', ownerOpenIds: ['ou_ok'] },
    ]) {
      const result = await controller.endpoints['bot.owner.set'](payload);
      assert.equal(result.ok, false, `应当拒绝：${JSON.stringify(payload).slice(0, 60)}`);
    }
    await controller.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('放行规则：指定属主绕过策略；`*` 只表示"没有属主"，不授权任何人绕过', async () => {
  // 指定属主：绕过策略，照常放行。
  const owner = await makeBridge({ bot: { ...BOT, ownerOpenIds: ['ou_owner'] } });
  try {
    await owner.bridge.accept(messageEvent({ messageId: 'om_o', senderId: 'ou_owner' }));
    assert.equal(lastAnswer(owner).text, '最终答案');
  } finally {
    await owner.cleanup();
  }

  /**
   * `['*']`（绑定时没记录属主）**不是**"人人都是属主"。
   * 上游把它当成人人属主，于是这台机器人的访问策略完全失效——真机上的表现是
   * "我没配黄忠，但他在群里 @ 一下就把任务跑起来了"。
   */
  const wildcard = await makeBridge({ bot: { ...BOT, ownerOpenIds: ['*'] } });
  try {
    await wildcard.bridge.accept(messageEvent({ messageId: 'om_w', senderId: 'ou_anyone' }));
    assert.equal(wildcard.gateway.calls.replies.length, 0, '`*` 不能让任何人绕过策略');
    assert.equal(wildcard.gateway.calls.cards.length, 0);
  } finally {
    await wildcard.cleanup();
  }

  // 同一台 `*` 机器人：名单内的人照样能用（策略才是唯一的判据）。
  const listed = await makeBridge({
    bot: { ...BOT, ownerOpenIds: ['*'] },
    policy: {
      direct: { mode: 'allowlist', open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] }, allowlist: { users: [{ id: 'ou_listed', canExecuteCommands: true }] } },
      group: { mode: 'allowlist', open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] }, allowlist: { users: [{ id: 'ou_listed', canExecuteCommands: true }] } },
    },
  });
  try {
    await listed.bridge.accept(messageEvent({ messageId: 'om_l', senderId: 'ou_listed' }));
    assert.equal(lastAnswer(listed).text, '最终答案');
  } finally {
    await listed.cleanup();
  }

  // 访问策略 open（旧配置里 direct 为 open 的机器人）：任何人可用，与属主无关。
  const open = await makeBridge({
    bot: { ...BOT, ownerOpenIds: ['ou_someone_else'] },
    policy: {
      direct: { mode: 'open', open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] }, allowlist: { users: [] } },
      group: { mode: 'allowlist', open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] }, allowlist: { users: [] } },
    },
  });
  try {
    await open.bridge.accept(messageEvent({ messageId: 'om_p', senderId: 'ou_anyone' }));
    assert.equal(lastAnswer(open).text, '最终答案');
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

test('过程展示 off：不产生任何过程消息，最终答案用**卡片**发（保留 Markdown 格式）', async () => {
  const app = await makeBridge({ bot: { ...BOT, stepPushDirect: 'off' } });
  try {
    await app.bridge.accept(messageEvent());
    // 不推过程：没有过程文本、也没有过程卡的 patch。
    assert.equal(app.gateway.calls.texts.length, 0);
    assert.equal(app.gateway.calls.replies.length, 0);
    assert.equal(app.gateway.calls.patches.length, 0);
    // 答案走一张新卡（不是过程卡）：正文就是答案，头是「✅ 已完成」。
    assert.equal(app.gateway.calls.cards.length, 1);
    const card = app.gateway.calls.cards[0].card;
    assert.equal(card.schema, '2.0');
    assert.match(JSON.stringify(card), /最终答案/);
    assert.match(JSON.stringify(card.header), /已完成/);
    assert.equal(card.body.elements.length, 1, '答案卡只有正文一块，不带过程面板');
    assert.equal(card.body.elements[0].tag, 'markdown');
  } finally {
    await app.cleanup();
  }
});

test('过程展示 off：答案太长（超单卡预算）时不截断，退回文本发送', async () => {
  const long = '答'.repeat(13_000);
  const app = await makeBridge({
    bot: { ...BOT, stepPushDirect: 'off' },
    askResult: { text: long, reason: { kind: 'completed' }, tools: [] },
  });
  try {
    await app.bridge.accept(messageEvent());
    assert.equal(app.gateway.calls.cards.length, 0, '超预算不该硬塞进卡片（会截断答案）');
    assert.equal(app.gateway.calls.replies.at(-1).text, long, '答案必须完整送达');
  } finally {
    await app.cleanup();
  }
});

test('过程展示 off：并发卡片失败时退回文本，原因记进状态', async () => {
  const app = await makeBridge({ bot: { ...BOT, stepPushDirect: 'off' } });
  try {
    app.gateway.setFailure('replyCard', new Error('卡片接口 500'));
    await app.bridge.accept(messageEvent());
    assert.equal(app.gateway.calls.cards.length, 0);
    assert.equal(app.gateway.calls.replies.at(-1).text, '最终答案', '卡片发不出去也要把答案给到');
    assert.match(app.bridge.status().lastError, /发送答案卡片失败：卡片接口 500/);
  } finally {
    await app.cleanup();
  }
});

test('过程展示 post：工具调用逐步回消息，最后单独回答案', async () => {
  const app = await makeBridge({ bot: { ...BOT, stepPushDirect: 'post' } });
  try {
    await app.bridge.accept(messageEvent());
    const stepReplies = app.gateway.calls.replies.filter((reply) => reply.text.startsWith('Bash'));
    assert.equal(stepReplies.length, 1);
    assert.equal(stepReplies[0].text, 'Bash', '没有参数时只显示标题（与 Web 一致）');
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
    assert.ok(body.includes('Bash'), '工具行用 Web 的标题（bash → Bash）');
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
    assert.equal(app.gateway.calls.replies.filter((reply) => reply.text.startsWith('Bash')).length, 0);

    // 私聊走私聊设置 → 推过程。
    await app.bridge.accept(messageEvent({ messageId: 'om_direct' }));
    assert.equal(app.gateway.calls.replies.filter((reply) => reply.text.startsWith('Bash')).length, 1);
  } finally {
    await app.cleanup();
  }
});

test('交付文件：多个成品合成一条消息（post 附件区），本地校验失败要说出来', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-deliver-'));
  try {
    const report = join(dir, '永辉销售日报_20260916.md');
    const chart = join(dir, 'chart.png');
    const empty = join(dir, 'empty.csv');
    await writeFile(report, '# 日报\n', 'utf8');
    await writeFile(chart, TINY_PNG);
    await writeFile(empty, '');

    const app = await makeBridge({
      bot: { ...BOT, stepPushDirect: 'streaming_card' },
      askResult: {
        text: '做好了',
        reason: { kind: 'completed' },
        tools: [],
        files: [
          { path: report, description: '销售日报' },
          { path: chart },
          { path: empty },
          { path: join(dir, '不存在.xlsx') },
        ],
      },
    });
    try {
      await app.bridge.accept(messageEvent({ messageId: 'om_files' }));
      // 全部合成一条消息（图片也算附件），不再一条一个
      assert.equal(app.gateway.calls.deliverables.length, 1, '全部成品只发一条消息');
      assert.deepEqual(
        app.gateway.calls.deliverables[0].items.map((item) => item.name),
        ['永辉销售日报_20260916.md', 'chart.png'],
        '图片与其他文件在同一条附件消息里',
      );
      assert.deepEqual(app.gateway.calls.deliverableImages, [], '图片不再单独内嵌进卡片');
      assert.deepEqual(app.gateway.calls.files, [], '不再一条一个文件地刷屏');
      const failures = app.gateway.calls.replies.filter((reply) => reply.text.includes('没能发出去'));
      assert.equal(failures.length, 1, '本地校验失败的合并成一条说明');
      assert.match(failures[0].text, /empty\.csv/);
      assert.match(failures[0].text, /不存在\.xlsx/);
    } finally {
      await app.cleanup();
    }

    // 发送接口失败：也要回一句可读原因，并写进状态
    const failing = await makeBridge({
      bot: { ...BOT, stepPushDirect: 'streaming_card' },
      askResult: {
        text: '做好了',
        reason: { kind: 'completed' },
        tools: [],
        files: [{ path: report }],
      },
    });
    try {
      failing.gateway.setFailure('sendDeliverables', new Error('im:resource:upload 权限不足'));
      await failing.bridge.accept(messageEvent({ messageId: 'om_files_2' }));
      assert.match(
        failing.gateway.calls.replies.at(-1).text,
        /交付文件「永辉销售日报_20260916\.md」没能发出去：im:resource:upload 权限不足/,
      );
    } finally {
      await failing.cleanup();
    }
  } finally {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
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
    assert.equal(app.gateway.calls.cards.length + app.gateway.calls.replies.length, 1,
      '同一条消息只处理一次');

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

test('会话标题的聊天名：问控制器拿群名/人名，拿不到就退回掩码 id（绝不挡住消息）', async () => {
  // ① 群聊：名字来自 resolveChatLabel。
  let asked = null;
  const app = await makeBridge({
    onAsk: (options) => { asked = options; },
    resolveChatLabel: async ({ conversationType, chatId }) => (
      conversationType === 'group' && chatId === 'oc_chat' ? '日报临时推送群' : null
    ),
  });
  try {
    await app.bridge.accept(messageEvent({
      messageId: 'om_label_1',
      chatType: 'group',
      mentions: [{ key: '@_user_1', id: { open_id: 'ou_bot' } }],
      text: '@_user_1 你好',
    }));
    assert.equal(asked.chatLabel, '群 日报临时推送群');
  } finally {
    await app.cleanup();
  }

  // ② 私聊：查不到名字（缺通讯录权限）→ 掩码 id，消息照常处理。
  //    发送者用属主（否则门禁会先挡下，测不到标题这条）。
  const ownerId = 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5';
  let privateAsked = null;
  const fallback = await makeBridge({
    bot: { ...BOT, ownerOpenIds: [ownerId] },
    onAsk: (options) => { privateAsked = options; },
    resolveChatLabel: async () => null,
  });
  try {
    await fallback.bridge.accept(messageEvent({
      messageId: 'om_label_2', chatType: 'p2p', text: '你好', senderId: ownerId,
    }));
    assert.equal(privateAsked.chatLabel, '私聊 ou_2b7e4d1a9…');
  } finally {
    await fallback.cleanup();
  }

  // ③ 解析器抛错：标题退回掩码 id，消息继续（取名字失败绝不能挡住消息）。
  let throwingAsked = null;
  const throwing = await makeBridge({
    bot: { ...BOT, ownerOpenIds: [ownerId] },
    onAsk: (options) => { throwingAsked = options; },
    resolveChatLabel: async () => { throw new Error('contact api down'); },
  });
  try {
    await throwing.bridge.accept(messageEvent({
      messageId: 'om_label_3', chatType: 'p2p', text: '你好', senderId: ownerId,
    }));
    assert.ok(throwingAsked, '取名字失败不能挡住消息');
    assert.equal(throwingAsked.chatLabel, '私聊 ou_2b7e4d1a9…');
  } finally {
    await throwing.cleanup();
  }
});

test('过程卡内容在被截断时仍是合法卡片（不产出坏 JSON）', () => {
  const card = renderStepCard({
    title: 't',
    lines: Array.from({ length: 40 }, (_, index) => `第 ${index} 步`),
    answer: '答'.repeat(20_000),
  });
  // Card 2.0：正文在 body.elements，文本元素是 markdown/div
  assert.equal(card.schema, '2.0');
  assert.ok(Array.isArray(card.body.elements));
  assert.ok(JSON.stringify(card).length < 14_000);
  const body = card.body.elements
    .map((element) => element.content ?? element.text?.content ?? '')
    .join('');
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
    replyReference: { enhanceReplyReference },
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

    /**
     * 渠道自带的面板字段：hub 的 panel.read/apply 调这两个，卡片上就能改过程展示。
     * **私聊与群聊两份都列出来**：在群里也能改私聊那份，不用先回私聊发一次 /menu。
     */
    const fields = await controller.endpoints['panel.fields']({ botId: 'bot_ctl', conversationType: 'direct' });
    assert.equal(fields.ok, true);
    assert.deepEqual(fields.value.fields.map((item) => item.field), ['stepPushDirect', 'stepPushGroup']);
    assert.match(fields.value.fields[0].label, /私聊/);
    assert.match(fields.value.fields[1].label, /群聊/);
    assert.equal(fields.value.fields[0].value, 'off', '私聊那份刚被改成 off');
    assert.equal(fields.value.fields[1].value, 'streaming_card', '群聊那份是另一份设置');
    // 卡片在哪不影响列出什么：群卡里同样是两份。
    const groupFields = await controller.endpoints['panel.fields']({ botId: 'bot_ctl', conversationType: 'group' });
    assert.deepEqual(groupFields.value.fields.map((item) => item.field), ['stepPushDirect', 'stepPushGroup']);

    const applied = await controller.endpoints['panel.apply']({
      botId: 'bot_ctl', field: 'stepPushDirect', value: 'post', conversationType: 'group',
    });
    assert.equal(applied.ok, true);
    assert.equal(applied.value.value, 'post');
    assert.match(applied.value.message, /私聊过程展示已设为/);
    const afterApply = await controller.endpoints['connection.status']({});
    assert.deepEqual(afterApply.value.bots[0].stepPush, { direct: 'post', group: 'streaming_card' },
      '改完要立刻生效（运行期那份 bot 对象就地改掉）');
    // 改群聊那份：只动群聊，私聊不受影响。
    const groupApply = await controller.endpoints['panel.apply']({
      botId: 'bot_ctl', field: 'stepPushGroup', value: 'off',
    });
    assert.equal(groupApply.ok, true);
    assert.match(groupApply.value.message, /群聊过程展示已设为/);
    const afterGroup = await controller.endpoints['connection.status']({});
    assert.deepEqual(afterGroup.value.bots[0].stepPush, { direct: 'post', group: 'off' });
    // 旧的会话类型字段名仍然认（老卡片/老客户端还在用）。
    const legacy = await controller.endpoints['panel.apply']({
      botId: 'bot_ctl', field: 'stepPush', value: 'streaming_card', conversationType: 'group',
    });
    assert.equal(legacy.ok, true);
    assert.deepEqual(
      (await controller.endpoints['connection.status']({})).value.bots[0].stepPush,
      { direct: 'post', group: 'streaming_card' },
      'stepPush 按会话类型落到对应那一份',
    );

    const badValue = await controller.endpoints['panel.apply']({
      botId: 'bot_ctl', field: 'stepPushDirect', value: 'nope', conversationType: 'direct',
    });
    assert.equal(badValue.ok, false);
    const unknownField = await controller.endpoints['panel.apply']({
      botId: 'bot_ctl', field: 'ghost', value: 'x',
    });
    assert.equal(unknownField.error.code, 'chat/unknown-field');

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

test('过程展示改完立刻生效：桥持有的那份 bot 必须**就地**更新（换引用 = 设置静默失效）', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-patch-'));
  try {
    await mkdir(join(dataDir, 'bots'), { recursive: true });
    await writeFile(join(dataDir, 'config.json'), JSON.stringify({
      version: 2,
      bots: [{
        id: 'bot_patch',
        appId: 'cli_patch_12345678',
        secretRef: 'DSH_FEISHU_APP_SECRET',
        ownerOpenIds: ['ou_owner'],
        botName: '配置机器人',
        stepPushDirect: 'streaming_card',
        stepPushGroup: 'streaming_card',
      }],
    }), 'utf8');

    /** 捕获"桥拿到的到底是哪份 bot 对象"，并记下 dispose。 */
    const handedToBridge = [];
    const gateway = createFakeGateway();
    const controller = createFeishuController({
      deps: {
        channelId: 'feishu',
        dataDir,
        logger: silentLogger,
        credentials: { resolve: async () => ({ value: 'secret-value', configured: true }) },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
        replyReference: { enhanceReplyReference },
        accessPolicy,
        sessions: { ask: async () => ({ text: '', reason: { kind: 'completed' } }), bindings: { adopt: async () => 0 } },
      },
      logger: silentLogger,
      internals: {
        sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
        createGateway: () => gateway,
        createBridge: (options) => {
          handedToBridge.push(options.bot);
          return {
            accept: async () => {},
            handleCardAction: async () => {},
            status: () => ({ handled: 0, lastError: null }),
            dispose: () => {},
          };
        },
      },
    });
    await controller.start();
    assert.equal(handedToBridge.length, 1);
    const liveBot = handedToBridge[0];
    assert.equal(liveBot.stepPushGroup, 'streaming_card');

    // 真机现场：群里设成"不显示过程"，下一轮却还带着工具与思考面板——
    // 根因是 patchRuntime 换了引用，而桥闭包住的是旧对象。
    const saved = await controller.endpoints['bot.step-push.set']({
      botId: 'bot_patch', stepPush: { direct: 'post', group: 'off' },
    });
    assert.equal(saved.ok, true);
    assert.equal(liveBot.stepPushGroup, 'off', '桥持有的那份必须就地更新（设置页那条路）');
    assert.equal(liveBot.stepPushDirect, 'post');

    // 控制面板那条路（卡上下拉）同样要就地生效。
    const applied = await controller.endpoints['panel.apply']({
      botId: 'bot_patch', field: 'stepPushGroup', value: 'streaming_card',
    });
    assert.equal(applied.ok, true);
    assert.equal(liveBot.stepPushGroup, 'streaming_card', '面板那条路也要就地更新');

    // 状态页读到的仍是同一份值。
    const status = await controller.endpoints['connection.status']({});
    assert.deepEqual(status.value.bots[0].stepPush, { direct: 'post', group: 'streaming_card' });

    await controller.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('控制器：渠道动作按钮只给属主；点重连会真的重建长连接', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-act-'));
  try {
    await mkdir(join(dataDir, 'bots'), { recursive: true });
    await writeFile(join(dataDir, 'config.json'), JSON.stringify({
      version: 2,
      bots: [{
        id: 'bot_act',
        appId: 'cli_act_12345678',
        secretRef: 'DSH_FEISHU_APP_SECRET',
        ownerOpenIds: ['ou_owner'],
        botName: '动作机器人',
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
        replyReference: { enhanceReplyReference },
        accessPolicy,
        sessions: {
          ask: async () => ({ text: '', reason: { kind: 'completed' } }),
          bindings: { adopt: async () => 0 },
        },
      },
      logger: silentLogger,
      internals: {
        sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
        createGateway: () => gateway,
      },
    });
    await controller.start();
    const connectsBefore = gateway.calls.connects;

    const noOwner = await controller.endpoints['panel.actions']({ botId: 'bot_act', isOwner: false });
    assert.deepEqual(noOwner.value.actions, [], '非属主不给动作按钮');
    const listed = await controller.endpoints['panel.actions']({ botId: 'bot_act', isOwner: true });
    assert.deepEqual(listed.value.actions.map((item) => item.action), ['reconnect']);
    assert.equal(listed.value.actions[0].label, '🔌 重连');
    assert.ok(listed.value.actions[0].confirm?.title, '重连要带原生二次确认（误触就是掉线）');
    assert.equal(listed.value.actions[0].deferred, true,
      '重连会掐掉送回执的长连接：必须声明 deferred，让桥先应答再执行');
    assert.equal((await controller.endpoints['panel.actions']({ botId: 'bot_none', isOwner: true })).ok, false);

    // 非属主 / 未知动作都被挡下；属主点了才真的重连（断开再连上）。
    const denied = await controller.endpoints['panel.act']({ botId: 'bot_act', action: 'reconnect' });
    assert.equal(denied.error.code, 'chat/owner-only');
    assert.equal((await controller.endpoints['panel.act']({ botId: 'bot_act', action: 'ghost', isOwner: true })).error.code,
      'chat/unknown-action');
    assert.equal((await controller.endpoints['panel.act']({ botId: 'bot_act', action: 'reconnect' })).error.code,
      'chat/owner-only');
    assert.equal(gateway.calls.disconnects, 0, '被拒时不该碰连接');

    const done = await controller.endpoints['panel.act']({ botId: 'bot_act', action: 'reconnect', isOwner: true });
    assert.equal(done.ok, true);
    assert.match(done.value.message, /已重连|未连上/, '要如实报告重连结果');
    assert.equal(gateway.calls.disconnects, 1, '重连 = 先断开');
    assert.equal(gateway.calls.connects, connectsBefore + 1, '再连上');
    const status = await controller.endpoints['connection.status']({});
    assert.equal(status.value.bots[0].state, 'running');

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
    replyReference: { enhanceReplyReference },
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
    assert.equal(lastAnswer(app).text, '最终答案');
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
    replyFail.gateway.setFailure('replyCard', new Error('卡片被拒'));
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
    allFail.gateway.setFailure('replyCard', new Error('卡片被拒'));
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
    assert.equal(app.gateway.calls.cards.length + app.gateway.calls.replies.length, 1,
      '被认领的回答不产生额外回复（只投递上面那条提问）');
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

  // 「不显示过程」= 答案走一张新卡片（保留 Markdown），过程一条不发
  const offMode = await makeBridge({ bot: { ...BOT, stepPushDirect: 'off', stepPushGroup: 'off' } });
  try {
    await offMode.bridge.accept(messageEvent({ messageId: 'om_d2' }));
    assert.equal(lastAnswer(offMode).kind, 'card', 'off 模式的答案必须走卡片');
    assert.equal(lastAnswer(offMode).text, '最终答案');
    assert.equal(offMode.gateway.calls.replies.length, 0, '不显示过程：一条过程/文本消息都不发');
  } finally {
    await offMode.cleanup();
  }

  // 全失败：状态里必须留下原因（用户没收到时才有得查）
  const broken = await makeBridge({ bot: { ...BOT, stepPushDirect: 'off' } });
  try {
    broken.gateway.setFailure('replyCard', new Error('卡片被拒'));
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
    replyReference: { enhanceReplyReference },
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
    assert.equal(lastAnswer(app).text, '最终答案');
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

test('交互回传：多选/自由文本走表单值（action.form_value[组件名]），按组件名后缀认领到题', async () => {
  const app = await makeBridge();
  try {
    app.interactions.claimKey = 'p2p:ou_owner';

    // 多选：先发一页（桥要记住批次，才能把 chk_序号 反查成选项原文）
    const questions = [{
      id: 'q_multi', header: '多选', question: '选哪些？', multiSelect: true,
      options: [{ label: '知识库检索' }, { label: '数据分析取数' }, { label: '运维确认' }],
    }];
    await app.attached[0].sendQuestions({ key: 'p2p:ou_owner', questions, answered: {}, final: false });

    // 勾选器提交：勾上第 1、2 个（值为 true），第三个没勾
    const multi = await app.bridge.handleCardAction({
      messageId: 'om_card_multi', chatId: 'oc_chat', operator: { openId: 'ou_owner' },
      action: {
        tag: 'button',
        value: {},
        formValue: { 'chk_0_q_multi': true, 'chk_1_q_multi': true, 'chk_2_q_multi': false },
      },
    });
    assert.equal(multi.toast.type, 'success');
    assert.equal(app.offers.at(-1).text, '知识库检索、数据分析取数', '用「、」拼接，parseAnswer 会拆成多选');
    assert.equal(app.offers.at(-1).questionId, 'q_multi', '问题 id 从组件名里取');

    // 文本输入框提交：form_value 里是字符串，组件名 text_<问题id>
    const text = await app.bridge.handleCardAction({
      messageId: 'om_card_text', chatId: 'oc_chat', operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: {}, formValue: { text_q_free: '顺便看看 5 月数据' } },
    });
    assert.equal(text.toast.type, 'success');
    assert.equal(app.offers.at(-1).text, '顺便看看 5 月数据');
    assert.equal(app.offers.at(-1).questionId, 'q_free');

    // 空提交：提示，不认领
    const before = app.offers.length;
    const empty = await app.bridge.handleCardAction({
      messageId: 'om_card_empty', chatId: 'oc_chat', operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: {}, formValue: { text_q_free: '   ' } },
    });
    assert.match(empty.toast.content, /还没有勾选或填写内容/);
    assert.equal(app.offers.length, before);

    // 表单提交同样受身份门禁约束
    const before2 = app.offers.length;
    await app.bridge.handleCardAction({
      messageId: 'om_card_stranger', chatId: 'oc_chat', operator: { openId: 'ou_stranger' },
      action: { tag: 'button', value: {}, formValue: { text_q_free: '越权试试' } },
    });
    assert.equal(app.offers.length, before2, '陌生人不能替答');
  } finally {
    await app.cleanup();
  }
});

test('提问内嵌进"正在处理"那张卡：题目画在同一张卡里，答完收起', async () => {
  const patches = [];
  const replies = [];
  const gateway = {
    async replyCard({ card, messageId }) {
      replies.push({ card, messageId });
      return { messageId: 'om_progress' };
    },
    async patchCard({ card, messageId }) {
      patches.push({ card, messageId });
      return { messageId };
    },
    renderQuestionElements({ questions, answered, final }) {
      // 与真实渲染器同一形状：已答的给行（进工具面板），未答的给交互元素（面板外）
      const elements = [];
      const current = final ? null : questions.find((q) => answered[q.id] === undefined);
      const rows = questions
        .filter((q) => answered[q.id] !== undefined)
        .map((q) => ({ id: q.id, text: `提问 · ${q.question} → ${[...(answered[q.id].selected ?? [])].join('、')}` }));
      if (current) {
        elements.push({ tag: 'markdown', content: `题目：${current.question}` });
        elements.push({ tag: 'button', text: { tag: 'plain_text', content: 'A' } });
      }
      return { rows, elements, current };
    },
  };
  const presenter = createTurnPresenter({
    mode: 'streaming_card',
    gateway,
    message: { message_id: 'om_msg', chat_id: 'oc_chat' },
    chatType: 'direct',
    bot: { botName: '张三-DSH', groupTopicReply: false },
    logger: silentLogger,
  });

  const questions = [{ id: 'q1', question: '选一个', options: [{ label: 'A' }] }];
  await presenter.setQuestion({ questions, answered: {}, final: false });

  const first = patches.at(-1)?.card ?? replies.at(-1)?.card;
  assert.ok(first, '要创建/更新那张进度卡');
  const firstBody = JSON.stringify(first);
  assert.match(firstBody, /题目：选一个/, '题目要画进进度卡');
  assert.match(firstBody, /等你确认/, '标题要提示在等确认');

  // 答完一题 → 同一张卡上交互控件消失，答案变成工具面板里的一行
  await presenter.setQuestion({
    questions, answered: { q1: { selected: ['A'] } }, final: false,
  });
  const second = JSON.stringify(patches.at(-1).card);
  assert.doesNotMatch(second, /题目：选一个/, '答过的题不再占位');
  assert.match(second, /提问 · 选一个 → A/, '答案变成工具面板里的一行（与 Web 一致）');

  // 收尾：提问行**收起但不消失**——面板仍在卡里，可展开回看，控件消失
  await presenter.finish('最终答案', { kind: 'completed' });
  const last = JSON.stringify(patches.at(-1).card);
  assert.doesNotMatch(last, /题目：选一个/, '答过的交互控件要收掉');
  assert.doesNotMatch(last, /等你确认/);
  assert.match(last, /collapsible_panel/, '收起要保留可展开的面板，而不是整块删掉');
  assert.match(last, /"expanded":false/, '默认收起');
  assert.match(last, /提问 · 选一个 → A/, '提问行还在面板里，可展开回看');
  assert.match(last, /工具与思考\(1\)/, '本轮结束后标题显示条数');
  assert.match(last, /最终答案/);
});

test('过程展示为 off 时，setQuestion 明确说不支持（桥据此退回独立卡片）', async () => {
  const presenter = createTurnPresenter({
    mode: 'off',
    gateway: { renderQuestionElements: () => ({ elements: [], current: null }) },
    message: { message_id: 'om_msg', chat_id: 'oc_chat' },
    chatType: 'direct',
    bot: { botName: 'x', groupTopicReply: false },
    logger: silentLogger,
  });
  assert.equal(await presenter.setQuestion({ questions: [], answered: {}, final: false }), false);
});

test('收到即打「在做了」表情，处理完撤掉；表情失败不影响处理', async () => {
  const app = await makeBridge();
  try {
    await app.bridge.accept(messageEvent({ messageId: 'om_react_1' }));
    assert.deepEqual(app.gateway.calls.reactions,
      [{ messageId: 'om_react_1', emojiType: 'OnIt' }], '收到就打表情');
    assert.deepEqual(app.gateway.calls.removedReactions,
      [{ messageId: 'om_react_1', reactionId: 'reaction_1' }], '处理完要撤掉');
    assert.equal(lastAnswer(app).text, '最终答案');
  } finally {
    await app.cleanup();
  }

  // 下载失败这条早退路径也要撤表情
  const failing = await makeBridge();
  try {
    const failure = new Error('下载飞书资源失败：resource not found（code 234043）');
    failure.code = 'feishu/resource-failed';
    failing.gateway.setDownload({ downloadError: failure });
    await failing.bridge.accept(messageEvent({
      messageId: 'om_react_2', messageType: 'image', text: undefined,
    }));
    assert.equal(failing.gateway.calls.reactions.length, 1);
    assert.equal(failing.gateway.calls.removedReactions.length, 1, '早退路径不能把表情留在那儿');
  } finally {
    await failing.cleanup();
  }

  // 表情接口本身失败（如缺权限）：只记日志，处理照常
  const noPermission = await makeBridge();
  try {
    noPermission.gateway.setFailure('addReaction', new Error('permission denied: im:message.reaction:write'));
    await noPermission.bridge.accept(messageEvent({ messageId: 'om_react_3' }));
    assert.equal(lastAnswer(noPermission).text, '最终答案', '没权限也要正常回复');
    assert.equal(noPermission.gateway.calls.removedReactions.length, 0, '没加上就不用撤');
  } finally {
    await noPermission.cleanup();
  }

  // 门禁挡下的消息不该被打表情（陌生人不给任何反馈）
  const gated = await makeBridge();
  try {
    await gated.bridge.accept(messageEvent({ messageId: 'om_react_4', senderId: 'ou_stranger' }));
    assert.deepEqual(gated.gateway.calls.reactions, []);
  } finally {
    await gated.cleanup();
  }
});

test('处理完卡片标题不再是"正在处理"', async () => {
  const cards = [];
  const gateway = {
    async replyCard({ card }) {
      cards.push(card);
      return { messageId: 'om_progress' };
    },
    async patchCard({ card }) {
      cards.push(card);
      return { messageId: 'om_progress' };
    },
  };
  const presenter = createTurnPresenter({
    mode: 'streaming_card',
    gateway,
    message: { message_id: 'om_1', chat_id: 'oc_1' },
    chatType: 'direct',
    bot: { botName: '张三-DSH', groupTopicReply: false },
    logger: silentLogger,
  });
  await presenter.tool({ name: 'bash', arguments: JSON.stringify({ command: 'grep -n try bridge.mjs', description: '检查 try 结构' }) });
  await presenter.think('先看 bridge 的 try 块');
  const running = JSON.stringify(cards.at(-1));
  assert.match(running, /"content":"正在处理"/, '标题不带机器人名前缀');
  assert.doesNotMatch(running, /张三-DSH/, '标题里不要机器人名');
  assert.match(running, /collapsible_panel/, '工具与思考放进一个折叠面板');
  assert.match(running, /"expanded":false/, '默认收起');
  // 本轮没结束时，收起状态的面板标题是**最新一项**（真机要求：一眼看到在干什么）
  assert.match(running, /"content":"Bash · 检查 try 结构"/, '未结束时标题显示最新一项');
  assert.doesNotMatch(running, /工具与思考\(/, '没结束就不显示条数');
  // 第二条（思考）会被节流合并，收尾时一定会补上
  await presenter.finish('答案', { kind: 'completed' });
  const withThink = JSON.stringify(cards.at(-1));
  assert.match(withThink, /思考 · 先看 bridge 的 try 块/, '思考也在同一个面板里（Web 的"思考 ·"行）');
  assert.match(withThink, /工具与思考\(2\)/, '本轮结束后才显示 工具与思考(N)');

  const done = JSON.stringify(cards.at(-1));
  assert.match(done, /✅ 已完成/, '完成后标题要变成已完成');
  assert.doesNotMatch(done, /正在处理/);
  assert.doesNotMatch(done, /张三-DSH/, '完成状态同样不带机器人名');
  assert.match(done, /"template":"green"/, '配色也变绿');

  // 非正常结束：标题提示未正常完成
  const broken = createTurnPresenter({
    mode: 'streaming_card',
    gateway,
    message: { message_id: 'om_2', chat_id: 'oc_1' },
    chatType: 'direct',
    bot: { botName: '张三-DSH', groupTopicReply: false },
    logger: silentLogger,
  });
  await broken.finish('', { kind: 'timeout' });
  const failed = JSON.stringify(cards.at(-1));
  assert.match(failed, /未正常完成/);
  assert.match(failed, /"template":"orange"/);
});

test('面板内容按发生顺序：提问嵌在它出现的位置，不在底部', () => {
  const card = renderStepCard({
    title: '正在处理',
    panelItems: [
      { kind: 'rows', rows: ['Bash · 检查 try 结构', '思考 · 先看有没有外层 try'] },
      {
        kind: 'ask',
        title: '❓ 1/1 已回答',
        expanded: false,
        rows: [{ id: 'q1', text: '提问 · 商行口径 → 全部 19 个小商行' }],
      },
      { kind: 'rows', rows: ['读取 · bridge.mjs'] },
    ],
    panelTitle: '工具与思考(4)',
  });
  const panel = card.body.elements.find((element) => element.tag === 'collapsible_panel');
  assert.ok(panel, '工具与思考要在一个折叠面板里');
  assert.equal(panel.expanded, false, '默认收起');
  assert.equal(panel.header.title.content, '工具与思考(4)', '标题只留名称与条数');

  // 顺序：工具行 → 提问嵌层 → 后面的工具行
  assert.deepEqual(panel.elements.map((element) => element.tag), ['markdown', 'collapsible_panel', 'markdown']);
  assert.match(panel.elements[0].content, /Bash · 检查 try 结构/, '提问之前的行在前');
  assert.match(panel.elements[2].content, /读取 · bridge.mjs/, '提问之后的行在提问后面');
  const nested = panel.elements[1];
  assert.equal(nested.header.title.content, '❓ 1/1 已回答');
  assert.equal(nested.expanded, false, '答完默认收起');
  assert.match(nested.elements[0].content, /提问 · 商行口径 → 全部 19 个小商行/, '展开能回看答案');
});

test('一批提问结束后再来的提问算新的一批，各自留在自己的位置', async () => {
  const cards = [];
  const gateway = {
    async replyCard({ card }) { cards.push(card); return { messageId: 'om_p' }; },
    async patchCard({ card }) { cards.push(card); return { messageId: 'om_p' }; },
    renderQuestionElements({ questions, answered, final }) {
      const current = final ? null : questions.find((q) => answered[q.id] === undefined);
      return {
        rows: questions
          .filter((q) => answered[q.id] !== undefined)
          .map((q) => ({ id: q.id, text: `提问 · ${q.id} → ${answered[q.id].selected?.join('、')}` })),
        elements: current ? [{ tag: 'markdown', content: `题目：${current.id}` }] : [],
        current,
      };
    },
  };
  const presenter = createTurnPresenter({
    mode: 'streaming_card',
    gateway,
    message: { message_id: 'om_1', chat_id: 'oc_1' },
    chatType: 'direct',
    bot: { groupTopicReply: false },
    logger: silentLogger,
  });

  const first = [{ id: 'a1', question: '第一问题' }];
  const second = [{ id: 'b1', question: '第二问题' }];
  await presenter.tool({ name: 'bash', arguments: '{"command":"ls"}' });
  await presenter.setQuestion({ questions: first, answered: { a1: { selected: ['A'] } }, final: false });
  await presenter.tool({ name: 'read', arguments: '{"path":"/ws/x"}' });
  await presenter.setQuestion({ questions: second, answered: { b1: { selected: ['B'] } }, final: false });
  await presenter.finish('答案', { kind: 'completed' });

  const panel = cards.at(-1).body.elements.find((element) => element.tag === 'collapsible_panel');
  assert.deepEqual(
    panel.elements.map((element) => element.tag),
    ['markdown', 'collapsible_panel', 'markdown', 'collapsible_panel'],
    '两批提问各自嵌在自己出现的位置',
  );
  assert.equal(panel.elements[1].header.title.content, '❓ 1/1 已回答');
  assert.equal(panel.elements[3].header.title.content, '❓ 1/1 已回答');
  assert.match(panel.elements[1].elements[0].content, /提问 · a1 → A/);
  assert.match(panel.elements[3].elements[0].content, /提问 · b1 → B/);
});

test('任务清单单独一个面板：没结束时展开看进度，结束后收起', () => {
  const todo = todoRows('{"todos":[{"content":"第一步","status":"completed"},{"content":"第二步","status":"in_progress"},{"content":"第三步","status":"pending"}]}');
  assert.deepEqual(todo.rows, ['✅ 第一步', '🔄 第二步', '⬜ 第三步']);
  assert.equal(todo.done, 1);
  assert.equal(todo.total, 3);
  assert.equal(todoRows('{"todos":[]}'), null, '空清单不显示');
  assert.equal(todoRows('not-json'), null);

  const running = renderStepCard({
    title: '正在处理',
    panelItems: [{ kind: 'rows', rows: ['Bash · ls'] }],
    panelTitle: 'Bash · ls',
    todos: { ...todo, expanded: true },
  });
  const panels = running.body.elements.filter((element) => element.tag === 'collapsible_panel');
  assert.equal(panels.length, 2, '任务清单是工具面板下面的另一个面板');
  assert.equal(panels[1].header.title.content, '任务清单 · 1/3 已完成');
  assert.equal(panels[1].expanded, true, '没结束时展开，看得到完成进度');
  assert.match(panels[1].elements[0].content, /🔄 第二步/);

  const done = renderStepCard({
    title: '✅ 已完成',
    panelItems: [{ kind: 'rows', rows: ['Bash · ls'] }],
    panelTitle: '工具与思考(1)',
    todos: { ...todo, expanded: false },
  });
  const donePanels = done.body.elements.filter((element) => element.tag === 'collapsible_panel');
  assert.equal(donePanels[1].expanded, false, '结束后收起');
});

test('工具行按 Web 的口径渲染：种类标题 + 摘要参数', () => {
  assert.equal(toolRow({ name: 'bash', arguments: '{"command":"ls","description":"看看目录"}' }), 'Bash · 看看目录');
  assert.equal(toolRow({ name: 'bash', arguments: '{"command":"ls -la"}' }), 'Bash · ls -la', '没有 description 时用 command');
  assert.equal(toolRow({ name: 'read', arguments: '{"file_path":"/ws/a.mjs"}' }), '读取 · /ws/a.mjs');
  assert.equal(
    toolRow({ name: 'wiki_search', arguments: '{"query":"商行 firm_s_id"}' }),
    '工具调用 · wiki_search · 商行 firm_s_id',
    '未知工具保留工具名（与 Web 一致）',
  );
  assert.equal(toolRow({ name: 'skill', arguments: '{"name":"yh-bigdata"}' }), 'Skill · yh-bigdata');
  assert.equal(toolRow({ name: 'grep', arguments: '{"pattern":"try","path":"host"}' }), '搜索 · try');
  assert.equal(toolRow({ name: 'web_search', arguments: '{"queries":["a","b"]}' }), '搜索 · a, b');
  // 参数不是 JSON：不抛错，退化成第一行原文
  assert.equal(toolRow({ name: 'wiki_list', arguments: 'not-json' }), '工具调用 · wiki_list · not-json');
  assert.equal(toolRow({ name: 'wiki_list' }), '工具调用 · wiki_list', '连参数都没有时只留工具名');
  assert.equal(toolRow({ name: 'wiki_list', arguments: '{}' }), '工具调用 · wiki_list · {}', '空参数照 Web 原样显示');
  // 思考行：压成一行并截断
  assert.equal(thinkRow('先看一眼\n再看第二眼'), '思考 · 先看一眼');
  assert.ok(thinkRow('x'.repeat(500)).length <= 126);
});

test('名字解析：并发查询合并成一次、缺权限长退避、「重新连接」立刻重取', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-name-'));
  try {
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

    const calls = { chats: 0, users: 0 };
    let failure = null;
    const gateway = createFakeGateway();
    gateway.listChats = async () => {
      calls.chats += 1;
      if (failure) throw failure;
      return [{ chatId: 'oc_group_1', name: '日报临时推送群' }];
    };
    gateway.getUserName = async (openId) => {
      calls.users += 1;
      if (failure) throw failure;
      return `名字(${openId})`;
    };

    const controller = createFeishuController({
      deps: {
        channelId: 'feishu',
        dataDir,
        logger: silentLogger,
        credentials: { resolve: async () => ({ value: 'secret-value', configured: true }) },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
    replyReference: { enhanceReplyReference },
        accessPolicy,
        sessions: {
          ask: async () => ({ text: '', reason: { kind: 'completed' } }),
          bindings: { adopt: async () => 0 },
        },
      },
      logger: silentLogger,
      internals: {
        sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
        createGateway: () => gateway,
      },
    });
    await controller.start();

    const direct = (openId) => ({
      id: `p2p:${openId}`, name: '私聊', kind: 'direct', route: { openId },
    });

    // ① 群列表：打开设置页会并发问几次，接口只能被打一次。
    const [first, second] = await Promise.all([
      controller.delivery.discover({ botId: 'bot_ctl' }),
      controller.delivery.discover({ botId: 'bot_ctl' }),
    ]);
    assert.equal(calls.chats, 1, '同一瞬间的并发查询要合并成一次');
    assert.equal(first.find((t) => t.kind === 'group')?.name, '日报临时推送群');
    assert.equal(second.length, first.length);

    // ② 人名：同一个人的并发查询也合成一次。
    const paired = await Promise.all([
      controller.delivery.decorateTargets({ botId: 'bot_ctl', targets: [direct('ou_c')] }),
      controller.delivery.decorateTargets({ botId: 'bot_ctl', targets: [direct('ou_c')] }),
    ]);
    assert.equal(calls.users, 1, '同一个 open_id 的并发查询要合并成一次');
    assert.equal(paired[0][0].name, '名字(ou_c)');
    assert.equal(paired[1][0].name, '名字(ou_c)');

    // ③ 缺权限：失败一次之后不再逐人重试（换个人也不重试），避免每次刷新都刷日志。
    failure = Object.assign(new Error(
      'Access denied. One of the following scopes is required: [im:chat:readonly].'
      + ' https://open.feishu.cn/app/cli_ctl_12345678/auth?q=im:chat:readonly',
    ), { code: 99991672 });
    await controller.delivery.decorateTargets({ botId: 'bot_ctl', targets: [direct('ou_d')] });
    assert.equal(calls.users, 2, '失败那次要真去问一次');
    await controller.delivery.decorateTargets({ botId: 'bot_ctl', targets: [direct('ou_e')] });
    assert.equal(calls.users, 2, '缺权限期间不该继续重试');
    const hinted = await controller.endpoints['connection.status']({});
    assert.equal(hinted.value.bots[0].nameHint.code, 'feishu/scope-missing');
    assert.match(hinted.value.bots[0].nameHint.url, /open\.feishu\.cn\/app\/cli_ctl_12345678\/auth/);

    // ④ 「重新连接」= 用户刚去开了权限：缓存与退避一起清掉，下次立刻重取。
    const reconnected = await controller.endpoints['bot.reconnect']({ botId: 'bot_ctl' });
    assert.equal(reconnected.ok, true);
    failure = null;
    const after = await controller.delivery.decorateTargets({
      botId: 'bot_ctl', targets: [direct('ou_f')],
    });
    assert.equal(calls.users, 3, '重连后要重新取一次');
    assert.equal(after[0].name, '名字(ou_f)');

    await controller.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('names.resolve：白名单里的 id 换成名字（人 / 群各按各的查，查不到就不编）', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-names-'));
  try {
    await writeFile(join(dataDir, 'config.json'), JSON.stringify({
      version: 2,
      bots: [{
        id: 'bot_ctl',
        appId: 'cli_ctl_12345678',
        secretRef: 'DSH_FEISHU_APP_SECRET',
        ownerOpenIds: ['ou_owner'],
        botName: '控制器机器人',
      }],
    }), 'utf8');

    const calls = { chats: 0, users: [] };
    const gateway = createFakeGateway();
    gateway.listChats = async () => {
      calls.chats += 1;
      return [{ chatId: 'oc_group_1', name: '日报临时推送群' }];
    };
    gateway.getUserName = async (openId) => {
      calls.users.push(openId);
      if (openId === 'ou_unknown') throw new Error('user not found');
      return `名字(${openId})`;
    };

    const makeController = () => createFeishuController({
      deps: {
        channelId: 'feishu',
        dataDir,
        logger: silentLogger,
        credentials: { resolve: async () => ({ value: 'secret-value', configured: true }) },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
    replyReference: { enhanceReplyReference },
        accessPolicy,
        sessions: {
          ask: async () => ({ text: '', reason: { kind: 'completed' } }),
          bindings: { adopt: async () => 0 },
        },
      },
      logger: silentLogger,
      internals: {
        sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
        createGateway: () => gateway,
      },
    });
    const controller = makeController();
    await controller.start();

    const resolved = await controller.endpoints['names.resolve']({
      botId: 'bot_ctl',
      // 重复的 id 只查一次；查不到的**不进结果**（界面退回显示 id）。
      ids: ['ou_a', 'oc_group_1', 'ou_a', 'ou_unknown'],
    });
    assert.equal(resolved.ok, true);
    assert.deepEqual(resolved.value.names, {
      ou_a: '名字(ou_a)',
      oc_group_1: '日报临时推送群',
    }, '群按群名查、人按人名查；查不到的留空');
    assert.equal(resolved.value.truncated, false);
    assert.equal(calls.users.filter((id) => id === 'ou_a').length, 1, '同一个 id 只查一次');
    assert.equal(calls.chats, 1, '群列表只取一次（缓存）');

    // 非字符串 / 空白 id 不该被当成 id 去查（粘贴时带空格是常态）。
    const messy = await controller.endpoints['names.resolve']({
      botId: 'bot_ctl', ids: ['  ou_b  ', null, 42, ''],
    });
    assert.deepEqual(Object.keys(messy.value.names), ['ou_b']);
    assert.equal(calls.users.includes('  ou_b  '), false, '要先 trim 再查');

    // 名单特别长时只查前 50 个，并如实告诉界面被截断了。
    const many = await controller.endpoints['names.resolve']({
      botId: 'bot_ctl', ids: Array.from({ length: 51 }, (_, index) => `ou_many_${index}`),
    });
    assert.equal(many.value.truncated, true);
    await controller.stop();

    // 缺权限且没有共同群：名字一个都拿不到，但说明必须**能行动**——
    // 指出要开通的权限，并给出这台应用的开通链接（原始报错 41050 本身没法行动）。
    gateway.listChats = async () => {
      throw Object.assign(new Error(
        'Access denied. One of the following scopes is required: [im:chat:readonly]',
      ), { code: 99991672 });
    };
    gateway.getUserName = async () => {
      throw Object.assign(new Error(
        'Access denied. One of the following scopes is required: [contact:user.base:readonly]',
      ), { code: 99991672 });
    };
    const denied = makeController();
    await denied.start();
    const failed = await denied.endpoints['names.resolve']({ botId: 'bot_ctl', ids: ['ou_z'] });
    assert.deepEqual(failed.value.names, {});
    assert.equal(failed.value.hint.code, 'feishu/name-scope-missing');
    assert.match(failed.value.hint.message, /通讯录/);
    assert.match(failed.value.hint.url, /open\.feishu\.cn\/app\/cli_ctl_12345678\/auth/);
    await denied.stop();

    // 非法输入：缺 ids、未知机器人。
    assert.equal((await controller.endpoints['names.resolve']({ botId: 'bot_ctl' })).ok, false);
    assert.equal((await controller.endpoints['names.resolve']({ ids: [] })).ok, false);
    assert.equal((await controller.endpoints['names.resolve']({ botId: 'bot_nope', ids: [] })).ok, false);
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('names.resolve：通讯录权限不够时，从"共同群成员"里把人名换出来', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-members-'));
  try {
    await writeFile(join(dataDir, 'config.json'), JSON.stringify({
      version: 2,
      bots: [{
        id: 'bot_ctl',
        appId: 'cli_ctl_12345678',
        secretRef: 'DSH_FEISHU_APP_SECRET',
        ownerOpenIds: ['ou_owner'],
        botName: '控制器机器人',
      }],
    }), 'utf8');

    const calls = { members: 0 };
    const gateway = createFakeGateway();
    gateway.listChats = async () => [
      { chatId: 'oc_group_1', name: '日报临时推送群' },
      { chatId: 'oc_group_2', name: '另一个群' },
    ];
    // 通讯录这条路真机上的常见失败：41050（没权限 / 不在应用的可见范围）。
    gateway.getUserName = async () => {
      throw new Error('读取用户信息失败：no user authority error（code 41050）');
    };
    gateway.listChatMembers = async ({ chatId }) => {
      calls.members += 1;
      if (chatId === 'oc_group_1') {
        return [{ openId: 'ou_4f6a8c0e2b1d9753a5c7e9f1b3d5a7c9', name: '李四' }];
      }
      return [{ openId: 'ou_other', name: '王五' }];
    };

    const controller = createFeishuController({
      deps: {
        channelId: 'feishu',
        dataDir,
        logger: silentLogger,
        credentials: { resolve: async () => ({ value: 'secret-value', configured: true }) },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
    replyReference: { enhanceReplyReference },
        accessPolicy,
        sessions: {
          ask: async () => ({ text: '', reason: { kind: 'completed' } }),
          bindings: { adopt: async () => 0 },
        },
      },
      logger: silentLogger,
      internals: {
        sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
        createGateway: () => gateway,
      },
    });
    await controller.start();

    const resolved = await controller.endpoints['names.resolve']({
      botId: 'bot_ctl',
      ids: ['ou_4f6a8c0e2b1d9753a5c7e9f1b3d5a7c9', 'ou_other', 'ou_nowhere'],
    });
    assert.equal(resolved.ok, true);
    assert.equal(resolved.value.names['ou_4f6a8c0e2b1d9753a5c7e9f1b3d5a7c9'], '李四',
      '通讯录失败时要退回到共同群成员');
    assert.equal(resolved.value.names.ou_other, '王五');
    assert.equal('ou_nowhere' in resolved.value.names, false, '哪里都查不到就不编名字');

    // 群成员表按 TTL 缓存：再问一次不该把两个群的成员接口重打一遍。
    const first = calls.members;
    await controller.endpoints['names.resolve']({ botId: 'bot_ctl', ids: ['ou_other'] });
    assert.equal(calls.members, first, '同一份群成员表要复用（设置页每次刷新都会问）');

    await controller.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('bot.add：验凭据 → 写凭据 → 落盘 → 起连接；重复接入与坏凭据都如实拒绝', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-add-'));
  try {
    await writeFile(join(dataDir, 'config.json'), JSON.stringify({
      version: 2,
      bots: [{
        id: 'bot_ctl',
        appId: 'cli_existing_0001',
        secretRef: 'DSH_FEISHU_APP_SECRET',
        ownerOpenIds: ['ou_owner'],
        botName: '已经在的机器人',
      }],
    }), 'utf8');

    const secrets = new Map();
    const gateway = createFakeGateway();
    /** 探针替身：不改代码就能模拟"凭据不对"与"读不到机器人名字"。 */
    const probes = [];
    let probeResult = { botName: '新机器人', botOpenId: 'ou_new_bot' };
    let probeFails = null;
    const controller = createFeishuController({
      deps: {
        channelId: 'feishu',
        dataDir,
        logger: silentLogger,
        credentials: {
          resolve: async (ref) => ({ value: secrets.get(ref), configured: secrets.has(ref) }),
          set: async (ref, value) => { secrets.set(ref, value); },
          unset: async (ref) => { secrets.delete(ref); },
        },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
    replyReference: { enhanceReplyReference },
        accessPolicy,
        sessions: {
          ask: async () => ({ text: '', reason: { kind: 'completed' } }),
          bindings: { adopt: async () => 0 },
        },
      },
      logger: silentLogger,
      internals: {
        sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
        createGateway: () => gateway,
        createProbe: (options) => {
          probes.push(options);
          return {
            async verify() {
              if (probeFails) throw probeFails;
              return probeResult;
            },
          };
        },
      },
    });
    await controller.start();

    // ① 正常接入：凭据写进服务、配置落盘、机器人被拉起来。
    const added = await controller.endpoints['bot.add']({
      appId: 'cli_brand_new_2026', appSecret: 'secret-value-1234', ownerOpenIds: ['ou_zhangzhiwei'],
    });
    assert.equal(added.ok, true, added.error?.message);
    assert.equal(added.value.bot.name, '新机器人');
    assert.equal(added.value.bot.state, 'running');
    const onDisk = JSON.parse(await readFile(join(dataDir, 'config.json'), 'utf8'));
    const saved = onDisk.bots.find((bot) => bot.appId === 'cli_brand_new_2026');
    assert.ok(saved, '新机器人要写进 config.json');
    assert.equal(saved.secretRef, deriveFeishuIdentity('cli_brand_new_2026').secretRef);
    assert.deepEqual(saved.ownerOpenIds, ['ou_zhangzhiwei']);
    assert.equal(secrets.get(saved.secretRef), 'secret-value-1234', 'App Secret 存进凭据服务');
    assert.equal(probes[0].appSecret, 'secret-value-1234');
    // 探针只看得到 id/secret/domain：状态里不该回显 Secret。
    assert.equal(JSON.stringify(added.value).includes('secret-value-1234'), false);

    // ② 同一个应用（同一个 appId）重复接入：拒绝，并指出已经有了。
    const duplicate = await controller.endpoints['bot.add']({
      appId: 'cli_brand_new_2026', appSecret: 'secret-value-1234',
    });
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.error.code, 'feishu/bot-exists');
    assert.match(duplicate.error.message, /新机器人/, '要说清是哪一个已经在列表里');

    // ③ 属主留空 = 没有属主（`['*']`），不是"人人都是属主"。
    const noOwner = await controller.endpoints['bot.add']({
      appId: 'cli_no_owner_2026', appSecret: 'secret-value-5678',
    });
    assert.equal(noOwner.ok, true, noOwner.error?.message);
    assert.equal(noOwner.value.bot.ownersWildcard, true);
    assert.equal(noOwner.value.bot.ownerCount, 0);

    // ④ 凭据不对：一个字节都不写（磁盘与凭据服务都不许动）。
    const before = await readFile(join(dataDir, 'config.json'), 'utf8');
    probeFails = Object.assign(new Error('App ID 或 App Secret 不对：app_id or app_secret invalid'),
      { code: 'feishu/credential-invalid' });
    const rejected = await controller.endpoints['bot.add']({
      appId: 'cli_wrong_secret', appSecret: 'nope-nope-nope',
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.error.code, 'feishu/credential-invalid');
    probeFails = null;
    assert.equal(await readFile(join(dataDir, 'config.json'), 'utf8'), before, '拒绝时配置不许改');
    assert.equal([...secrets.values()].includes('nope-nope-nope'), false, '拒绝时凭据不许写');

    // ⑤ 名字读不到（没开机器人能力）：照样接入，只是名字为空。
    probeResult = { botName: null, botOpenId: null };
    const unnamed = await controller.endpoints['bot.add']({
      appId: 'cli_no_bot_cap', appSecret: 'secret-value-9012',
    });
    assert.equal(unnamed.ok, true, unnamed.error?.message);
    assert.equal(unnamed.value.bot.name, null);

    // ⑥ 形状不对：非 cli_ 前缀、Secret 太短、属主写成投递目标 id。
    for (const payload of [
      { appId: 'not-a-cli-id', appSecret: 'secret-value-1234' },
      { appId: 'cli_ok_2026', appSecret: 'short' },
      { appId: 'cli_ok_2026', appSecret: 'secret-value-1234', ownerOpenIds: ['p2p_ou_x'] },
      { appId: 'cli_ok_2026', appSecret: 'secret-value-1234', ownerOpenIds: [] },
      {},
    ]) {
      const result = await controller.endpoints['bot.add'](payload);
      assert.equal(result.ok, false, `应当拒绝：${JSON.stringify(payload)}`);
      assert.equal(result.error.code, 'chat/bad-request');
    }

    await controller.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('扫码接入的应用清单：形状合法、最小权限（平台不校验 id，形状错了也不会有人告诉你）', () => {
  const { addons, appPreset, createOnly } = FEISHU_SCAN_REGISTER_OPTIONS;
  // SDK 的 normalizeAddons 会拒掉空清单（"addons must contain at least one scope, event or callback"），
  // 但**不校验权限点是否存在**（写错的 id 会被确认页静默忽略）——所以至少把形状钉在这里。
  assert.equal(createOnly, true, '只允许新建');
  assert.equal(addons.preset, false);
  const all = [...addons.scopes.tenant, ...addons.events.items.tenant, ...addons.callbacks.items];
  assert.ok(all.length > 0);
  for (const item of all) {
    assert.equal(typeof item, 'string');
    assert.equal(item, item.trim());
    assert.ok(item.length > 0);
  }
  assert.equal(new Set(all).size, all.length, '清单里不该有重复项');
  for (const scope of addons.scopes.tenant) {
    // 最小权限：这台机器人只碰 IM 与"把 id 换成名字"要用的通讯录字段，别的数据面一概不要。
    assert.match(scope, /^(im|contact):/u, `清单里出现了与本渠道无关的权限点：${scope}`);
  }
  assert.match(appPreset.name, /\{user\}/u);
});

test('bot.register：扫码接入（新建机器人）——扫码的人成为属主，成功后才落盘', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-register-'));
  try {
    const secrets = new Map();
    const gateway = createFakeGateway();
    /** 假 SDK 的 registerApp：把回调攥在手里，测试自己决定什么时候"扫码成功"。 */
    const pending = {};
    const controller = createFeishuController({
      deps: {
        channelId: 'feishu',
        dataDir,
        logger: silentLogger,
        credentials: {
          resolve: async (ref) => ({ value: secrets.get(ref), configured: secrets.has(ref) }),
          set: async (ref, value) => { secrets.set(ref, value); },
          unset: async (ref) => { secrets.delete(ref); },
        },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
    replyReference: { enhanceReplyReference },
        accessPolicy,
        sessions: {
          ask: async () => ({ text: '', reason: { kind: 'completed' } }),
          bindings: { adopt: async () => 0 },
        },
      },
      logger: silentLogger,
      internals: {
        sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
        createGateway: () => gateway,
        createProbe: () => ({ async verify() { return { botName: '扫码建的机器人', botOpenId: 'ou_bot' }; } }),
        encodeQr: async (url) => `data:image/png;base64,${Buffer.from(url).toString('base64')}`,
        registerApp: (options) => {
          pending.options = options;
          return new Promise((resolve, reject) => {
            pending.resolve = resolve;
            pending.reject = reject;
          });
        },
      },
    });
    await controller.start();

    // ① 发起：状态是 starting 且没有二维码；SDK 回链接后变 qr_ready（含 data URL 与剩余秒数）。
    const started = await controller.endpoints['bot.register.start']({});
    assert.equal(started.ok, true);
    assert.equal(started.value.state, 'starting');
    assert.equal(started.value.qrCodeDataUrl, null);

    // ①b 交给 SDK 的参数必须是**带清单的新建**：权限/事件/回调预填进确认页，且只允许新建。
    //     这几条是"扫码建出来的应用有没有权限"的唯一保障——少传一个参数，真机上就是
    //     "扫码建好了、发消息缺权限"，而单测全绿（所以必须在这里钉住）。
    assert.equal(pending.options.createOnly, true, '新建这条路必须钉死"只能新建"，别让用户误改已有应用');
    assert.deepEqual(pending.options.addons.events.items.tenant, ['im.message.receive_v1']);
    assert.deepEqual(pending.options.addons.callbacks.items, ['card.action.trigger']);
    assert.equal(pending.options.addons.preset, false, '不要平台默认模板，确认页上只列我们声明的项');
    for (const scope of [
      'im:message.p2p_msg:readonly',
      'im:message.group_at_msg:readonly',
      'im:message.group_at_msg.include_bot:readonly',
      'im:message:readonly',
      'im:message:send_as_bot',
      'im:resource',
      'im:chat:readonly',
      'contact:user.base:readonly',
    ]) {
      assert.ok(pending.options.addons.scopes.tenant.includes(scope), `清单里少了 ${scope}`);
    }
    assert.match(pending.options.appPreset.name, /\{user\}/u, '应用名要能用扫码人的名字');

    pending.options.onQRCodeReady({ url: 'https://open.feishu.cn/register/abc', expireIn: 600 });
    const ready = await controller.endpoints['bot.register.status']({});
    assert.equal(ready.value.state, 'qr_ready');
    assert.equal(ready.value.verificationUrl, 'https://open.feishu.cn/register/abc');
    assert.match(ready.value.qrCodeDataUrl, /^data:image\/png;base64,/);
    assert.ok(ready.value.remainingSeconds > 0 && ready.value.remainingSeconds <= 600);
    assert.equal(ready.value.bot, null, '还没成功时不该有机器人');

    // 轮询状态（SDK 的回调）要如实反映。
    pending.options.onStatusChange({ status: 'polling' });
    assert.equal((await controller.endpoints['bot.register.status']({})).value.state, 'polling');

    // ② 成功：凭据落进凭据服务 + config.json，**属主 = 扫码的人**，机器人被拉起来。
    pending.resolve({
      client_id: 'cli_registered_0001',
      client_secret: 'registered-secret-0001',
      user_info: { open_id: 'ou_scanner', tenant_brand: 'feishu' },
    });
    let done = null;
    for (let index = 0; index < 50 && done?.state !== 'succeeded'; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      done = (await controller.endpoints['bot.register.status']({})).value;
    }
    assert.equal(done.state, 'succeeded', JSON.stringify(done));
    assert.equal(done.qrCodeDataUrl, null, '成功后不该再回二维码');
    assert.equal(done.bot.name, '扫码建的机器人');
    assert.equal(done.bot.state, 'running');
    const onDisk = JSON.parse(await readFile(join(dataDir, 'config.json'), 'utf8'));
    const saved = onDisk.bots.find((bot) => bot.appId === 'cli_registered_0001');
    assert.deepEqual(saved.ownerOpenIds, ['ou_scanner'], '扫码的人就是属主');
    assert.equal(saved.domain, 'feishu');
    assert.equal(secrets.get(saved.secretRef), 'registered-secret-0001');
    assert.equal(JSON.stringify(done).includes('registered-secret-0001'), false, 'Secret 不进状态');

    // ③ 已经结束的尝试再取消：原样返回（不把成功改写成 cancelled），之后可以重新发起。
    const cancelled = await controller.endpoints['bot.register.cancel']({});
    assert.equal(cancelled.value.state, 'succeeded', '没有进行中的尝试时取消不改写状态');
    const idleAgain = await controller.endpoints['bot.register.start']({});
    assert.equal(idleAgain.value.state, 'starting');
    assert.equal((await controller.endpoints['bot.register.cancel']({})).value.state, 'cancelled');

    await controller.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('bot.register：SDK 报错/没有二维码能力时如实回报（不静默、不落盘）', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-register-fail-'));
  try {
    const secrets = new Map();
    const gateway = createFakeGateway();
    let rejectWith = null;
    let registerAvailable = true;
    const controller = createFeishuController({
      deps: {
        channelId: 'feishu',
        dataDir,
        logger: silentLogger,
        credentials: {
          resolve: async (ref) => ({ value: secrets.get(ref), configured: secrets.has(ref) }),
          set: async (ref, value) => { secrets.set(ref, value); },
          unset: async (ref) => { secrets.delete(ref); },
        },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
    replyReference: { enhanceReplyReference },
        accessPolicy,
        sessions: {
          ask: async () => ({ text: '', reason: { kind: 'completed' } }),
          bindings: { adopt: async () => 0 },
        },
      },
      logger: silentLogger,
      internals: {
        sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
        createGateway: () => gateway,
        createProbe: () => ({ async verify() { return { botName: null, botOpenId: null }; } }),
        encodeQr: async () => null,
        ...(registerAvailable
          ? { registerApp: () => Promise.reject(rejectWith ?? new Error('未知失败')) }
          : {}),
      },
    });
    await controller.start();

    // ① SDK 拒绝：状态变 error，原因带出来。
    registerAvailable = true;
    rejectWith = Object.assign(new Error('access denied'), { code: 'access_denied' });
    await controller.endpoints['bot.register.start']({});
    let state = null;
    for (let index = 0; index < 50 && state?.state !== 'error'; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      state = (await controller.endpoints['bot.register.status']({})).value;
    }
    assert.equal(state.state, 'error');
    assert.equal(state.error.code, 'access_denied');
    assert.match(state.error.message, /access denied/);

    // ② 二维码过期：SDK 报 expired_token → 状态是 expired。
    rejectWith = Object.assign(new Error('expired'), { code: 'expired_token' });
    await controller.endpoints['bot.register.start']({});
    for (let index = 0; index < 50 && state?.state !== 'expired'; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      state = (await controller.endpoints['bot.register.status']({})).value;
    }
    assert.equal(state.state, 'expired');

    // ③ 没有 registerApp（SDK 版本不对）：给一句能照做的提示，别的什么都不写。
    await controller.stop();
    registerAvailable = false;
    const bare = createFeishuController({
      deps: {
        channelId: 'feishu',
        dataDir,
        logger: silentLogger,
        credentials: {
          resolve: async () => ({ value: 'x', configured: true }),
          set: async () => {},
          unset: async () => {},
        },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
    replyReference: { enhanceReplyReference },
        accessPolicy,
        sessions: {
          ask: async () => ({ text: '', reason: { kind: 'completed' } }),
          bindings: { adopt: async () => 0 },
        },
      },
      logger: silentLogger,
      internals: {
        sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
        createGateway: () => gateway,
        createProbe: () => ({ async verify() { return { botName: null, botOpenId: null }; } }),
      },
    });
    await bare.start();
    await bare.endpoints['bot.register.start']({});
    let missing = null;
    for (let index = 0; index < 50 && missing?.state !== 'error'; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      missing = (await bare.endpoints['bot.register.status']({})).value;
    }
    assert.equal(missing.state, 'error');
    assert.equal(missing.error.code, 'feishu/register-unsupported');
    assert.match(missing.error.message, /手动接入/);
    await bare.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('bot.add：配置写不进去时，刚写的凭据要回滚掉（不留孤儿引用）', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-add-rollback-'));
  try {
    const secrets = new Map();
    const gateway = createFakeGateway();
    const controller = createFeishuController({
      deps: {
        channelId: 'feishu',
        dataDir,
        logger: silentLogger,
        credentials: {
          resolve: async (ref) => ({ value: secrets.get(ref), configured: secrets.has(ref) }),
          set: async (ref, value) => { secrets.set(ref, value); },
          unset: async (ref) => { secrets.delete(ref); },
        },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
    replyReference: { enhanceReplyReference },
        accessPolicy,
        sessions: {
          ask: async () => ({ text: '', reason: { kind: 'completed' } }),
          bindings: { adopt: async () => 0 },
        },
      },
      logger: silentLogger,
      internals: {
        sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
        createGateway: () => gateway,
        createProbe: () => ({ async verify() { return { botName: null, botOpenId: null }; } }),
      },
    });
    await controller.start();
    // 把 config.json 换成一个**目录**：读取退回空文档，但落盘时的 rename 必然失败
    // （真实故障里也可能是磁盘/权限——这里只要能稳定复现"落盘失败"）。
    await rm(join(dataDir, 'config.json'), { force: true });
    await mkdir(join(dataDir, 'config.json'), { recursive: true });

    const failed = await controller.endpoints['bot.add']({
      appId: 'cli_rollback_2026', appSecret: 'secret-value-0001',
    });
    assert.equal(failed.ok, false);
    const ref = deriveFeishuIdentity('cli_rollback_2026').secretRef;
    assert.equal(secrets.has(ref), false, '落盘失败要把刚写的凭据删掉');
    await controller.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('菜单卡片：点按钮就地更新同一张卡（显示点了什么 + 输出，按钮保留）', async () => {
  const menu = [{ label: '帮助', command: '/help' }, { label: '状态', command: '/status' }];
  const calls = [];
  const commands = {
    async handle(request) {
      calls.push(request.text);
      if (request.text === '/menu') return { handled: true, reply: '可用命令见下', menu };
      return { handled: true, reply: `输出：${request.text}` };
    },
  };
  const app = await makeBridge({ commands });
  try {
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_menu',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_menu: '/status' } },
    });

    assert.deepEqual(calls, ['/status', '/menu'], '执行被点的命令，并重取一次菜单');
    assert.equal(answer.toast.type, 'success');
    assert.match(answer.toast.content, /\/status/);
    assert.equal(app.gateway.calls.patches.length, 0, '卡片更新必须排在回调应答之后（先更新会被客户端还原）');

    await app.flushPaints();
    const patch = app.gateway.calls.patches.at(-1);
    assert.equal(patch.messageId, 'om_menu', '要更新的是被点的那张卡片');
    const json = JSON.stringify(patch.card);
    assert.match(json, /"\*\*\/status\*\*/, '卡片上要写明点了哪个命令');
    assert.match(json, /输出：\/status/, '命令输出要落回卡片');
    assert.match(json, /"dsh_menu":"\/help"/, '按钮要留着，可以接着点');
    assert.equal(app.gateway.calls.cards.length, 0, '就地更新，不该另发一张新卡');
  } finally {
    await app.cleanup();
  }
});

test('菜单卡片：就地更新失败时退回回文字，用户不会什么都收不到', async () => {
  const commands = {
    async handle(request) {
      if (request.text === '/menu') return { handled: true, reply: '菜单', menu: [{ label: '状态', command: '/status' }] };
      return { handled: true, reply: `输出：${request.text}` };
    },
  };
  const app = await makeBridge({ commands });
  try {
    app.gateway.setFailure('patchCard', new Error('卡片被删了'));
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_menu',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_menu: '/status' } },
    });
    assert.equal(answer.toast.type, 'success');
    await app.flushPaints();
    assert.equal(app.gateway.calls.replies.at(-1)?.text, '输出：/status', '退回"回复文字"这条路');
  } finally {
    await app.cleanup();
  }
});

test('菜单卡片：命令一个都不能少（曾经 slice(0,12) 把后半截静默丢掉）', async () => {
  // 真机上的命令表就是这么多：17 条（不含 /menu 自己），字母序后半截是
  // /session /status /stop /version /whoami —— 正好被 slice(0,12) 丢掉的五个。
  const names = [
    'allow', 'compact', 'deny', 'help', 'history', 'model',
    'models', 'new', 'preset', 'presets', 'reasoning', 'reasonings',
    'session', 'status', 'stop', 'version', 'whoami',
  ];
  const menu = names.map((name) => ({ label: `/${name}`, command: `/${name}` }));
  const commands = {
    async handle(request) {
      if (request.text === '/menu') return { handled: true, reply: '可用命令见下', menu };
      return { handled: true, reply: `输出：${request.text}` };
    },
  };
  // 命令权限：直接放行（这条用例测的是卡片里的按钮，不是门禁）。
  const app = await makeBridge({
    commands,
    policy: {
      direct: { mode: 'open', open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] }, allowlist: { users: [] } },
      group: { mode: 'open', open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] }, allowlist: { users: [] } },
    },
  });
  try {
    await app.bridge.accept(messageEvent({ text: '/menu' }));
    const card = app.gateway.calls.cards.at(-1)?.card;
    assert.ok(card, '要发一张菜单卡片');

    assert.equal(card.schema, '2.0', '命令清单卡也必须是 2.0（否则 patch 会报 schemaV2 can not change schemaV1）');
    const rows = card.body.elements.filter((element) => element.tag === 'column_set');
    const buttons = rows.flatMap((row) => row.columns.flatMap((column) => column.elements));
    const commandButtons = buttons
      .filter((button) => typeof button.behaviors?.[0]?.value?.dsh_menu === 'string');
    assert.deepEqual(
      commandButtons.map((button) => button.behaviors[0].value.dsh_menu),
      names.map((name) => `/${name}`),
      '每个命令都要有按钮，且顺序不变',
    );
    assert.ok(rows.length > 1, '命令多的时候要分行，而不是截断');
    assert.ok(rows.every((row) => row.columns.length > 0 && row.columns.length <= 4), '每行不超过 4 个');
    // 每个命令按钮都要带命令行本身（点它等于手打）。
    assert.ok(commandButtons.every((button) => button.tag === 'button'
      && button.behaviors[0].value.dsh_menu.startsWith('/')));
    // 从控制面板点进来的用户要能回去。
    assert.ok(buttons.some((button) => button.behaviors?.[0]?.value?.dsh_panel === 'panel'),
      '命令清单卡上要有「返回控制面板」');
  } finally {
    await app.cleanup();
  }
});

/** 只有名单里的 ou_listed 能执行命令；其余人连卡片按钮都不许点。 */
const restrictCommands = {
  direct: { mode: 'open', open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] }, allowlist: { users: [] } },
  group: { mode: 'open', open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] }, allowlist: { users: [] } },
};

test('卡片动作过命令门禁：非授权者点菜单按钮不执行命令（此前是个洞）', async () => {
  const calls = [];
  const commands = {
    async handle(request) {
      calls.push(request.text);
      return { handled: true, reply: '不该走到这里' };
    },
  };
  const app = await makeBridge({ commands, policy: restrictCommands });
  try {
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_menu',
      operator: { openId: 'ou_other' },
      action: { tag: 'button', value: { dsh_menu: '/whoami' } },
    });

    assert.deepEqual(calls, [], '命令一次都不该执行');
    assert.equal(app.gateway.calls.patches.length, 0, '卡片不该被更新');
    assert.equal(answer.toast.type, 'error');
    assert.match(answer.toast.content, /权限/);
    assert.match(app.gateway.calls.replies.at(-1)?.text ?? '', /权限/, '群里要留一条可见的拒绝');
  } finally {
    await app.cleanup();
  }
});

test('提问/审批按钮不走命令门禁：它们是交互回传，受限策略下照样能点', async () => {
  const app = await makeBridge({ policy: restrictCommands });
  try {
    app.interactions.claimed = true;
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_q',
      operator: { openId: 'ou_other' },
      action: { tag: 'button', value: { dsh: 'answer', questionId: 'q1', label: '选项一', index: '1' } },
    });
    assert.ok(answer, '应该被认领而不是被门禁拒掉');
    assert.equal(answer.toast.type, 'success');
    assert.equal(app.gateway.calls.replies.length, 0, '不该出现"没有权限"的回复');
  } finally {
    await app.cleanup();
  }
});

/** 控制面板桩：状态可改，apply 记录调用并按需失败。 */
/**
 * 卡片的组件可能嵌在 `column_set` 的列里（模型/推理、预设/工作区各一行两格）：
 * 这几条测试要能按名字找到它们。
 */
function cardElements(card) {
  const out = [];
  const walk = (list) => {
    for (const el of list ?? []) {
      out.push(el);
      if (el.tag === 'column_set') for (const column of el.columns ?? []) walk(column.elements);
    }
  };
  walk(card.body.elements);
  return out;
}

const cardSelects = (card) => cardElements(card).filter((el) => el.tag === 'select_static');

function makePanelStub({ fail = null } = {}) {
  const applied = [];
  const state = {
    bound: true,
    sessionId: 'session-1',
    model: {
      current: { provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: 'low' },
      options: [
        { value: 'deepseek/deepseek-v4.1-flash', provider: 'deepseek', model: 'deepseek-v4.1-flash' },
        { value: 'anthropic/claude-x', provider: 'anthropic', model: 'claude-x' },
      ],
      efforts: [{ id: 'low', label: '低' }, { id: 'high', label: '高' }],
      currentEffort: 'low',
    },
    preset: { current: null, options: [{ id: 'standard' }] },
    workspace: { current: '/ws/a', options: ['/ws/a', '/ws/b'] },
  };
  const acted = [];
  return {
    applied,
    acted,
    async read() {
      return state;
    },
    async apply({ field, value, key, isOwner }) {
      applied.push({ field, value, key, isOwner });
      if (fail && fail.field === field) throw Object.assign(new Error(fail.message), { code: fail.code });
      return { field, value, message: `已应用 ${field}=${value}` };
    },
    async act({ action, key, isOwner }) {
      acted.push({ action, key, isOwner });
      if (fail && fail.action === action) throw Object.assign(new Error(fail.message), { code: fail.code });
      return { action, message: `已执行 ${action}` };
    },
  };
}

test('控制面板：/menu 发可交互卡（下拉直接选，选完立即生效并就地重画）', async () => {
  const panel = makePanelStub();
  const commands = {
    async handle(request) {
      if (request.text === '/menu') {
        return { handled: true, reply: '可用命令：…', panel: await panel.read(), menu: [{ label: '/help', command: '/help' }] };
      }
      return { handled: true, reply: 'x' };
    },
  };
  const app = await makeBridge({ commands, panel });
  try {
    await app.bridge.accept(messageEvent({ text: '/menu' }));
    const card = JSON.stringify(app.gateway.calls.cards.at(-1)?.card);
    assert.match(card, /机器人控制面板/);
    assert.match(card, /select_static/, '要有下拉，而不是只有命令按钮');
    assert.match(card, /model_pick/);
    assert.match(card, /"depth"|"initial_index"/);

    // 下拉回调：选中值在 action.options（网关归一化的字段名）。
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_panel',
      operator: { openId: 'ou_owner' },
      action: { tag: 'select_static', name: 'model_pick', options: ['anthropic/claude-x'], value: { action: 'model_pick' } },
    });
    assert.deepEqual(
      panel.applied.map((item) => ({ field: item.field, value: item.value })),
      [{ field: 'model', value: 'anthropic/claude-x' }],
    );
    assert.equal(answer.toast.type, 'success');
    assert.match(answer.toast.content, /claude-x/);
    assert.equal(app.gateway.calls.patches.length, 0, '重画排在应答之后');

    await app.flushPaints();
    const patched = app.gateway.calls.patches.at(-1);
    assert.equal(patched.messageId, 'om_panel', '要重画被操作的那张卡片');
    assert.match(JSON.stringify(patched.card), /✅/, '卡上要留下"刚做了什么、结果如何"');
  } finally {
    await app.cleanup();
  }
});

test('控制面板：应用失败就地写明原因（❌），并且不假装成功', async () => {
  const panel = makePanelStub({
    fail: { field: 'workspace', code: 'chat/workspace-invalid', message: '目录不存在或读不到：/ws/nope' },
  });
  const app = await makeBridge({ panel });
  try {
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_panel',
      operator: { openId: 'ou_owner' },
      action: { tag: 'select_static', name: 'workspace_pick', options: '/ws/nope', value: { action: 'workspace_pick' } },
    });
    assert.equal(answer.toast.type, 'error');
    await app.flushPaints();
    const card = JSON.stringify(app.gateway.calls.patches.at(-1)?.card);
    assert.match(card, /❌/);
    assert.match(card, /目录不存在/);
  } finally {
    await app.cleanup();
  }
});

test('控制面板：无会话时选模型 → 面板自己说清楚要先建会话', async () => {
  const panel = makePanelStub({
    fail: { field: 'model', code: 'chat/no-session', message: '当前聊天还没有会话：先发一条消息。' },
  });
  const app = await makeBridge({ panel });
  try {
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_panel',
      operator: { openId: 'ou_owner' },
      action: { tag: 'select_static', name: 'model_pick', options: 'deepseek/deepseek-v4.1-flash', value: { action: 'model_pick' } },
    });
    assert.equal(answer.toast.type, 'error');
    assert.match(answer.toast.content, /还没有会话/);
  } finally {
    await app.cleanup();
  }
});

test('控制面板：按钮 —— 新会话走面板、命令清单切卡、状态画回面板', async () => {
  const panel = makePanelStub();
  const commands = {
    async handle(request) {
      if (request.text === '/menu') {
        return { handled: true, reply: '可用命令', panel: await panel.read(), menu: [{ label: '/help', command: '/help' }] };
      }
      if (request.text === '/status') return { handled: true, reply: '渠道：飞书' };
      return { handled: true, reply: `输出：${request.text}` };
    },
  };
  const app = await makeBridge({ commands, panel });
  try {
    // 新会话：直接调面板（field=session），不绕命令行。
    const fresh = await app.bridge.handleCardAction({
      chatId: 'oc_chat', messageId: 'om_panel', operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_panel: 'new' } },
    });
    assert.deepEqual(
      panel.applied.map((item) => ({ field: item.field, value: item.value })),
      [{ field: 'session', value: 'new' }],
    );
    assert.equal(fresh.toast.type, 'success');
    await app.flushPaints();
    assert.match(JSON.stringify(app.gateway.calls.patches.at(-1)?.card), /机器人控制面板/);

    // 命令清单：切成命令卡，卡上有返回控制面板的按钮。
    const list = await app.bridge.handleCardAction({
      chatId: 'oc_chat', messageId: 'om_panel', operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_panel: 'commands' } },
    });
    assert.equal(list.toast.type, 'info');
    await app.flushPaints();
    const listCard = JSON.stringify(app.gateway.calls.patches.at(-1)?.card);
    assert.match(listCard, /机器人菜单/);
    assert.match(listCard, /返回控制面板/);

    // 状态：命令输出画回面板（不把面板换成命令卡）。
    const status = await app.bridge.handleCardAction({
      chatId: 'oc_chat', messageId: 'om_panel', operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_panel: 'status' } },
    });
    assert.equal(status.toast.type, 'success');
    await app.flushPaints();
    const statusCard = JSON.stringify(app.gateway.calls.patches.at(-1)?.card);
    assert.match(statusCard, /机器人控制面板/);
    assert.match(statusCard, /渠道：飞书/);

    // 返回面板。
    const back = await app.bridge.handleCardAction({
      chatId: 'oc_chat', messageId: 'om_panel', operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_panel: 'panel' } },
    });
    assert.equal(back.toast.type, 'info');
    await app.flushPaints();
    assert.match(JSON.stringify(app.gateway.calls.patches.at(-1)?.card), /机器人控制面板/);
  } finally {
    await app.cleanup();
  }
});

test('控制面板卡：下拉的 initial_index 是 1 起，且不写 options.selected（230099 的坑）', async () => {
  const { panelCard } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  const card = panelCard({
    bound: true,
    sessionId: 'session-1',
    model: {
      current: { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' },
      options: [
        { value: 'deepseek/flash', model: 'flash' },
        { value: 'anthropic/claude-x', model: 'claude-x' },
      ],
      efforts: [{ id: 'low', label: '低' }, { id: 'high', label: '高' }],
      currentEffort: 'high',
    },
    preset: { current: 'standard', options: [{ id: 'standard' }, { id: 'yh-olap' }] },
    workspace: { current: '/ws/b', options: ['/ws/a', '/ws/b'] },
  });

  const picks = cardSelects(card);
  const byName = Object.fromEntries(picks.map((el) => [el.name, el]));
  assert.equal(byName.model_pick.initial_index, 1, '第一个选项 = 1（不是 0）');
  assert.equal(byName.reasoning_pick.initial_index, 3, '高 是第 3 项：默认 + 低 + 高');
  assert.equal(byName.preset_pick.initial_index, 2, '当前预设 standard 是第 2 项（第 1 项是「跟随 Host 默认」）');
  assert.equal(byName.workspace_pick.initial_index, 2);
  assert.ok(picks.every((el) => el.options.every((option) => option.selected === undefined)),
    'options 上不能有 selected（会 230099）');
  // 选项值不能是空串（飞书对 value:'' 不可靠）："恢复默认"用哨兵，回调时再翻译回空串。
  assert.ok(picks.every((el) => el.options.every((option) => option.value !== '')),
    '下拉选项值不能为空串');
  assert.equal(byName.reasoning_pick.options[0].value, '__default__');
  // 当前值要有 ✓ 标记，用户一眼看到现在是什么。
  assert.match(byName.model_pick.options[0].text.content, /^✓ /);
});

test('渠道动作：会断长连接的动作用「先应答、再执行」，不让飞书等到超时', async () => {
  const panel = makePanelStub();
  panel.read = async () => ({
    bound: true, sessionId: 'session-1',
    model: { current: null, options: [], efforts: [], currentEffort: null },
    preset: { current: null, options: [] }, workspace: { current: null, options: [] },
    actions: [{ action: 'reconnect', label: '🔌 重连', type: 'default', deferred: true }],
  });
  const app = await makeBridge({ panel });
  try {
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_card',
      token: 'tk_reconnect',
      operator: { openId: 'ou_owner' },
      action: {
        tag: 'button',
        value: { dsh_action: 'reconnect', dsh_action_label: '🔌 重连', dsh_action_deferred: true },
      },
    });
    // 关键：应答这一刻**还没执行**——重连会掐掉正在送回执的那条长连接（真机上就是"回调超时"）。
    assert.deepEqual(panel.acted, [], '应答之前一次都不该执行动作');
    assert.match(answer.toast.content, /正在执行/);
    assert.equal(app.gateway.calls.tokenUpdates.length, 0, '应答之前也不该更新卡片');

    await app.flushPaints();
    assert.deepEqual(panel.acted.map((item) => item.action), ['reconnect']);
    assert.equal(app.gateway.calls.tokenUpdates.length, 1, '执行完画回卡片（延迟更新接口是 HTTP，不受断连影响）');
    assert.match(JSON.stringify(app.gateway.calls.tokenUpdates[0].card), /已执行 reconnect/);
  } finally {
    await app.cleanup();
  }

  // 不带的（快动作）：照旧同步执行，应答里就带上结果。
  const fast = makePanelStub();
  const quick = await makeBridge({ panel: fast });
  try {
    const answer = await quick.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_card',
      token: 'tk_fast',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_action: 'ping', dsh_action_label: 'Ping' } },
    });
    assert.deepEqual(fast.acted.map((item) => item.action), ['ping'], '没声明 deferred 的照旧同步执行');
    assert.match(answer.toast.content, /已执行 ping/);
  } finally {
    await quick.cleanup();
  }
});

test('访问策略：下拉放宽要二次确认，确认/取消都在同一张卡上，确认之前绝不落盘', async () => {
  const panel = makePanelStub();
  panel.read = async () => ({
    bound: true, sessionId: 'session-1',
    model: { current: null, options: [], efforts: [], currentEffort: null },
    preset: { current: null, options: [] }, workspace: { current: null, options: [] },
    policy: {
      current: 'allowlist', label: '名单内 1 人可用', conversationType: 'group', kindLabel: 'group',
      options: [
        { value: 'allowlist', label: '仅名单内可用（当前 1 人）' },
        { value: 'open', label: '任何人可用（群聊里任何成员都能 @ 它）' },
      ],
    },
  });
  // 放宽时第一次 apply 只回 requiresConfirm；带 confirm:true 才"落盘"。
  panel.apply = async ({ field, value, confirm }) => {
    panel.applied.push({ field, value, confirm });
    if (field === 'policy' && value === 'open' && confirm !== true) {
      return {
        field, value, requiresConfirm: true,
        confirmPrompt: '把群聊改成「任何人可用」后，不在名单里的人也能跟机器人对话（群里任何成员 @ 它就行）。确定要放开吗？',
        message: '需要确认：群聊将改为任何人可用。',
      };
    }
    return { field, value, message: `${field}=${value} 已生效` };
  };
  const app = await makeBridge({ panel });
  try {
    const asked = await app.bridge.handleCardAction({
      chatId: 'oc_group',
      messageId: 'om_card',
      token: 'tk_policy',
      operator: { openId: 'ou_owner' },
      action: { tag: 'select_static', name: 'policy_pick', options: ['open'], value: { action: 'policy_pick' } },
    });
    assert.match(asked.toast.content, /需要确认/);
    assert.equal(panel.applied.length, 1, '第一次不带 confirm（hub 侧不落盘）');
    assert.equal(panel.applied[0].confirm, undefined);
    await app.flushPaints();
    const card = JSON.stringify(app.gateway.calls.tokenUpdates.at(-1).card);
    assert.match(card, /待确认/);
    assert.match(card, /确定要放开吗/);
    assert.match(card, /✅ 确认/, '确认做在同一张卡上（toast 会消失，卡不会）');

    // 取消：什么都不改。
    const cancelled = await app.bridge.handleCardAction({
      chatId: 'oc_group',
      messageId: 'om_card',
      token: 'tk_policy2',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_cancel: true } },
    });
    assert.match(cancelled.toast.content, /已取消/);
    assert.equal(panel.applied.length, 1, '取消不产生任何 apply');
    await app.flushPaints();
    assert.doesNotMatch(JSON.stringify(app.gateway.calls.tokenUpdates.at(-1).card), /待确认/);

    // 确认：带上 confirm:true 再调一次，结果画回卡上。
    await app.bridge.handleCardAction({
      chatId: 'oc_group',
      messageId: 'om_card',
      token: 'tk_policy3',
      operator: { openId: 'ou_owner' },
      action: { tag: 'select_static', name: 'policy_pick', options: ['open'], value: { action: 'policy_pick' } },
    });
    await app.flushPaints();
    const confirmed = await app.bridge.handleCardAction({
      chatId: 'oc_group',
      messageId: 'om_card',
      token: 'tk_policy4',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_confirm: true } },
    });
    assert.match(confirmed.toast.content, /已生效/);
    assert.deepEqual(panel.applied.at(-1), { field: 'policy', value: 'open', confirm: true });
    await app.flushPaints();
    assert.doesNotMatch(JSON.stringify(app.gateway.calls.tokenUpdates.at(-1).card), /待确认/);
  } finally {
    await app.cleanup();
  }

  // 待确认项没了（重启/换卡）时如实说失效，绝不猜一个值去改设置。
  const stale = await makeBridge({ panel: makePanelStub() });
  try {
    const answer = await stale.bridge.handleCardAction({
      chatId: 'oc_group',
      messageId: 'om_ghost',
      token: 'tk_ghost',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_confirm: true } },
    });
    assert.match(answer.toast.content, /已失效/);
    await stale.flushPaints();
    assert.match(JSON.stringify(stale.gateway.calls.tokenUpdates.at(-1).card), /已经失效/);
  } finally {
    await stale.cleanup();
  }
});

test('控制面板卡：渠道动作按钮带原生二次确认；点击走 panel.act 并排在应答之后重画', async () => {
  const { panelCard, panelAction } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  const card = panelCard({
    bound: true,
    sessionId: 'session-1',
    model: { current: null, options: [], efforts: [], currentEffort: null },
    preset: { current: null, options: [] },
    workspace: { current: null, options: [] },
    actions: [{
      action: 'reconnect', label: '🔌 重连', type: 'default', deferred: true,
      confirm: { title: '重连这台机器人？', text: '会断开并重建长连接。' },
    }],
  });
  const buttons = cardElements(card).filter((el) => el.tag === 'button'
    && el.behaviors?.some((behavior) => behavior.value?.dsh_action === 'reconnect'));
  assert.equal(buttons.length, 1, '动作按钮要画在卡上');
  assert.deepEqual(buttons[0].confirm, {
    title: { tag: 'plain_text', content: '重连这台机器人？' },
    text: { tag: 'plain_text', content: '会断开并重建长连接。' },
  }, 'confirm 用卡片原生的二次确认弹窗');
  assert.equal(buttons[0].behaviors[0].value.dsh_action_deferred, true,
    'deferred 要带进按钮值：桥据此"先应答再执行"');
  assert.deepEqual(panelAction(buttons[0].behaviors[0].value), { action: 'reconnect', label: '🔌 重连' });
  assert.equal(panelAction({ dsh_panel: 'status' }), null, '面板按钮不是渠道动作');
  assert.match(JSON.stringify(panelCard({
    bound: true, sessionId: null,
    model: { current: null, options: [], efforts: [], currentEffort: null },
    preset: { current: null, options: [] }, workspace: { current: null, options: [] },
    actionsFailed: true,
  })), /读不到渠道动作按钮/);

  // 点击：调 panel.act（带上会话与属主身份），并把结果排在应答之后重画。
  const panel = makePanelStub();
  panel.read = async () => ({
    bound: true, sessionId: 'session-1',
    model: { current: null, options: [], efforts: [], currentEffort: null },
    preset: { current: null, options: [] }, workspace: { current: null, options: [] },
    actions: [{ action: 'reconnect', label: '🔌 重连' }],
  });
  const app = await makeBridge({ panel });
  try {
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_card',
      token: 'tk_1',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_action: 'reconnect', dsh_action_label: '🔌 重连' } },
    });
    assert.match(answer.toast.content, /已执行 reconnect/);
    assert.deepEqual(panel.acted.map((item) => item.action), ['reconnect']);
    assert.equal(panel.acted[0].isOwner, true, '属主身份要传给渠道（渠道据此判能不能点）');
    assert.equal(app.gateway.calls.tokenUpdates.length, 0, '应答之前一次都不该更新卡片');
    await app.flushPaints();
    assert.equal(app.gateway.calls.tokenUpdates.length, 1, '重画排在应答之后');
    assert.match(JSON.stringify(app.gateway.calls.tokenUpdates[0].card), /已执行 reconnect/);
  } finally {
    await app.cleanup();
  }

  // 失败：卡片上留 ❌ 一行并写 lastError。
  const broken = makePanelStub({ fail: { action: 'reconnect', code: 'feishu/boom', message: '连接失败' } });
  const failing = await makeBridge({ panel: broken });
  try {
    const answer = await failing.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_card',
      token: 'tk_2',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_action: 'reconnect', dsh_action_label: '🔌 重连' } },
    });
    assert.match(answer.toast.content, /连接失败/);
    await failing.flushPaints();
    assert.match(JSON.stringify(failing.gateway.calls.tokenUpdates.at(-1).card), /❌/);
    assert.match(String(failing.bridge.status().lastError), /控制面板动作失败/);
  } finally {
    await failing.cleanup();
  }
});

test('控制面板卡：本会话的上下文增强下拉——只决定用哪一份，内容指路设置页', async () => {
  const { panelCard, panelPick } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  const base = {
    bound: true,
    sessionId: 'session-1',
    model: { current: null, options: [], efforts: [], currentEffort: null },
    preset: { current: null, options: [] },
    workspace: { current: null, options: [] },
  };
  const options = [
    { value: '', label: '跟随私聊全局（已启用）' },
    { value: 'own', label: '本会话专属设置（复制私聊全局作为起点）' },
    { value: 'copy:ou_b', label: '套用「爱丽丝」的字段与提示词' },
  ];
  const following = panelCard({
    ...base,
    context: { current: '', label: '本私聊', identity: 'ou_a', own: null, options },
  });
  const picker = cardSelects(following).find((el) => el.name === 'context_pick');
  assert.ok(picker, '卡上要有本会话的上下文增强下拉');
  assert.equal(picker.initial_index, 1, '跟随全局是第 1 项并被勾选');
  assert.match(picker.options[0].text.content, /^✓ /);
  // 空值是"没认出来"的信号，也是飞书不可靠的取值：'跟随全局' 有自己的哨兵。
  assert.equal(picker.options[0].value, '__global__');
  const body = JSON.stringify(following);
  assert.match(body, /上下文增强（本私聊）/);
  assert.match(body, /内容（来源字段与提示词）在设置页编辑/);

  const owned = panelCard({
    ...base,
    context: {
      current: 'own', label: '本群', identity: 'oc_g',
      own: { label: '客户群', fields: 3, guidanceLength: 128 },
      options,
    },
  });
  assert.match(JSON.stringify(owned), /已有专属设置（来源字段 3 个、提示词 128 字）/);
  assert.match(JSON.stringify(owned), /oc_g/, '把平台 id 写出来，便于与设置页对账');

  // 非属主时 hub 不给这一项：卡上不能出现"改得动"的假控件。
  assert.equal(cardSelects(panelCard(base)).some((el) => el.name === 'context_pick'), false);

  // 回调翻译：值原样交给 hub（含空串 = 跟随全局、own、copy:<id>）。
  assert.deepEqual(panelPick('context_pick', ['own']), { field: 'context', value: 'own', label: '设置本会话的上下文增强' });
  assert.deepEqual(panelPick('context_pick', ['copy:ou_b']).value, 'copy:ou_b');
  assert.equal(panelPick('context_pick', ['__global__']).value, '', '哨兵翻译回空串（= 跟随全局）');
  assert.deepEqual(panelPick('context_pick', ['']), { field: 'context', label: '设置本会话的上下文增强', invalid: true },
    '空取值 = 回调里没认出来，不能当成"跟随全局"静默改设置');
});

test('控制面板卡：被别的聊天占着的会话要说明（不能只是不显示）', async () => {
  const { panelCard } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  const base = {
    bound: true,
    sessionId: 'session-1',
    session: { current: 'session-1', options: [{ id: 'session-1', label: '飞书 · 群 张三 · 日报' }] },
    model: { current: null, options: [], efforts: [], currentEffort: null },
    preset: { current: null, options: [] },
    workspace: { current: null, options: [] },
  };
  const plain = JSON.stringify(panelCard(base));
  assert.ok(!plain.includes('其它聊天使用'), '没有扣下的会话时不该多这一行');

  const withWithheld = JSON.stringify(panelCard({ ...base, session: { ...base.session, withheld: 2 } }));
  assert.match(withWithheld, /有 2 个会话正被这台机器人的其它聊天使用/);
  assert.match(withWithheld, /不能切过去/);

  // 读不到列表那条路不受影响。
  const failed = JSON.stringify(panelCard({ ...base, session: { ...base.session, failed: true } }));
  assert.match(failed, /读不到会话列表/);
});

test('控制面板卡：渠道自带字段一行两格——过程展示（私聊）与（群聊）都在卡上', async () => {
  const { panelCard } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  const options = [
    { value: 'off', label: '不显示过程（只回最终答案）' },
    { value: 'streaming_card', label: '实时过程卡（一张卡动态更新）' },
    { value: 'post', label: '逐步直播（每步一条消息）' },
  ];
  const card = panelCard({
    bound: true,
    sessionId: 'session-1',
    model: { current: null, options: [], efforts: [], currentEffort: null },
    preset: { current: null, options: [] },
    workspace: { current: null, options: [] },
    fields: [
      { field: 'stepPushDirect', label: '任务过程展示（私聊）', value: 'streaming_card', options },
      { field: 'stepPushGroup', label: '任务过程展示（群聊）', value: 'post', options },
    ],
  });
  const byName = Object.fromEntries(cardSelects(card).map((el) => [el.name, el]));
  assert.ok(byName.panel_field_stepPushDirect, '私聊那份要在卡上');
  assert.ok(byName.panel_field_stepPushGroup, '群聊那份也要在卡上（在群里就能改私聊的）');
  assert.equal(byName.panel_field_stepPushDirect.options[byName.panel_field_stepPushDirect.initial_index - 1].value,
    'streaming_card');
  assert.equal(byName.panel_field_stepPushGroup.options[byName.panel_field_stepPushGroup.initial_index - 1].value,
    'post');
  // 两格并排：同一个 column_set 里，名称也各自写在格子内（select_static 没有 label 字段）。
  const paired = cardElements(card).filter((el) => el.tag === 'column_set'
    && JSON.stringify(el).includes('panel_field_stepPushDirect')
    && JSON.stringify(el).includes('panel_field_stepPushGroup'));
  assert.equal(paired.length, 1, '两个渠道字段渲染在同一行里');
  const body = JSON.stringify(card);
  assert.match(body, /任务过程展示（私聊）/);
  assert.match(body, /任务过程展示（群聊）/);
});

test('控制面板卡：没有会话也能选模型——改的是"机器人默认模型"，文案要写清生效范围', async () => {
  const { panelCard } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  const card = panelCard({
    bound: false,
    sessionId: null,
    model: {
      current: null,
      // 已经设过一个机器人默认模型：下拉与推理等级都按它来。
      botDefault: { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' },
      hostDefault: { provider: 'deepseek', model: 'flash' },
      options: [{
        value: 'deepseek/flash', provider: 'deepseek', model: 'flash', efforts: [{ id: 'low' }, { id: 'high' }],
      }],
      efforts: [{ id: 'low', label: '低' }, { id: 'high', label: '高' }],
      currentEffort: 'low',
    },
    preset: { current: null, options: [] },
    workspace: { current: null, options: [] },
  });
  const names = cardSelects(card).map((el) => el.name);
  assert.ok(names.includes('model_pick'), '没有会话也要能选模型（存成机器人默认模型）');
  assert.ok(names.includes('reasoning_pick'), '机器人默认模型有推理等级时也要能调');
  const body = JSON.stringify(card);
  assert.match(body, /机器人默认模型/);
  assert.match(body, /只对新会话生效/, '要写明"对新会话生效"，别让用户以为马上生效');
  assert.match(body, /只有属主能改/, '它是机器人级设置，文案要说明谁改得动');
  // 少说废话：每个设置的当前值由它自己的下拉 ✓ 表示，不再重复一整块状态行，也不要页脚提示。
  assert.doesNotMatch(body, /\*\*当前会话\*\*/, '不再重复状态行');
  assert.doesNotMatch(body, /不便点下拉时/, '页脚那行手打提示已删');
});

test('控制面板：哨兵值回调时翻译回空串（"恢复默认"的语义在 hub 侧是空值）', async () => {
  const { panelPick } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  // 没认出取值 ≠ 恢复默认：必须走 invalid，调用方据此报错（否则会静默清掉等级/预设）。
  assert.deepEqual(
    panelPick('reasoning_pick', []),
    { field: 'reasoning', label: '设置推理等级', invalid: true },
  );
  assert.deepEqual(
    panelPick('preset_pick', ['', null]),
    { field: 'preset', label: '设置 Agent 预设', invalid: true },
  );
  assert.deepEqual(panelPick('reasoning_pick', ['__default__']), { field: 'reasoning', value: '', label: '设置推理等级' });
  assert.deepEqual(panelPick('preset_pick', ['__default__']), { field: 'preset', value: '', label: '设置 Agent 预设' });
  assert.deepEqual(panelPick('model_pick', ['deepseek/flash']), { field: 'model', value: 'deepseek/flash', label: '切换模型' });
  assert.deepEqual(panelPick('workspace_pick', ['/ws/a']), { field: 'workspace', value: '/ws/a', label: '切换工作区' });
  assert.equal(panelPick('other_pick', ['x']), null, '不是面板下拉就返回 null（别把别人的回调当自己的）');
});

test('控制面板：手打 /menu 每次新发一张卡（复用老卡 = 聊天里一条新消息都没有）', async () => {
  const panel = makePanelStub();
  const commands = {
    async handle(request) {
      if (request.text === '/menu') {
        return { handled: true, reply: '可用命令', panel: await panel.read(), menu: [{ label: '/help', command: '/help' }] };
      }
      return { handled: true, reply: 'x' };
    },
  };
  const app = await makeBridge({ commands, panel });
  try {
    await app.bridge.accept(messageEvent({ messageId: 'om_m1', text: '/menu' }));
    assert.equal(app.gateway.calls.cards.length, 1, '第一次 /menu 发一张');

    /**
     * 第二次 /menu：**要新发一张**。
     *
     * 曾经这里复用了本会话记住的那张卡并 patch 它——真机上的后果是：卡片滚到上面看不见之后，
     * 用户再发 /menu 时聊天底部**一条新消息都没有**（卡片确实在历史里被就地更新了），
     * 看起来就是"发 /menu 没反应、连卡片都不给了"。
     */
    await app.bridge.accept(messageEvent({ messageId: 'om_m2', text: '/menu' }));
    assert.equal(app.gateway.calls.cards.length, 2, '手打 /menu 要在聊天底部新发一张');
    assert.equal(app.gateway.calls.patches.length, 0, '不能偷偷 patch 那张可能已经滚走的老卡');

    // 标题带渲染时间：多张卡时"哪张最新"一眼可辨。
    const title = app.gateway.calls.cards.at(-1).card.header.title.content;
    assert.match(title, /^机器人控制面板 · \d{2}:\d{2}:\d{2}$/);
  } finally {
    await app.cleanup();
  }
});

test('交互驱动的卡片更新走延迟更新 token（用 message.patch 会被客户端还原）', async () => {
  const panel = makePanelStub();
  const app = await makeBridge({ panel });
  try {
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_panel',
      token: 'tk_click_1',
      operator: { openId: 'ou_owner' },
      action: { tag: 'select_static', name: 'model_pick', options: ['anthropic/claude-x'], value: { action: 'model_pick' } },
    });
    assert.equal(answer.toast.type, 'success');
    /**
     * 关键顺序：应答发出去之前**不能**动卡片。
     *
     * 飞书客户端在回调应答落地时会把卡片还原成"点击前"的快照——先更新再应答 = 更新被还原，
     * 真机表现就是"卡片闪一下又变回原样"（日志里那次 update 还是成功的，所以只看日志会误判）。
     */
    assert.equal(app.gateway.calls.tokenUpdates.length, 0, '卡片更新必须排在应答之后');
    await app.flushPaints();
    assert.equal(app.gateway.calls.tokenUpdates.length, 1, '要走延迟更新接口');
    assert.equal(app.gateway.calls.tokenUpdates[0].token, 'tk_click_1');
    assert.match(app.gateway.calls.tokenUpdates[0].card.header.title.content, /机器人控制面板/);
    assert.equal(app.gateway.calls.patches.length, 0, '不能再走 message.patch');
  } finally {
    await app.cleanup();
  }
});

test('token 用掉/过期时退回 message.patch，不能让卡片就此不更新', async () => {
  const panel = makePanelStub();
  const commands = {
    async handle(request) {
      return { handled: true, reply: `输出：${request.text}` };
    },
  };
  const app = await makeBridge({ panel, commands });
  try {
    app.gateway.setFailure('updateCard', Object.assign(new Error('token expired'), { code: 200340 }));
    await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_panel',
      token: 'tk_used',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_panel: 'status' } },
    });
    await app.flushPaints();
    assert.equal(app.gateway.calls.tokenUpdates.length, 1, '先试 token 路径');
    assert.ok(app.gateway.calls.patches.length >= 1, '失败后仍要 patch 兜底');
  } finally {
    await app.cleanup();
  }
});

test('命令清单切换同样优先走 token 路径', async () => {
  const panel = makePanelStub();
  const commands = {
    async handle(request) {
      if (request.text === '/menu') {
        return { handled: true, reply: '可用命令', panel: await panel.read(), menu: [{ label: '/help', command: '/help' }] };
      }
      return { handled: true, reply: 'x' };
    },
  };
  const app = await makeBridge({ commands, panel });
  try {
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_panel',
      token: 'tk_menu',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_panel: 'commands' } },
    });
    assert.equal(answer.toast.type, 'info');
    await app.flushPaints();
    assert.equal(app.gateway.calls.tokenUpdates.length, 1);
    assert.match(JSON.stringify(app.gateway.calls.tokenUpdates[0].card), /机器人菜单/);
  } finally {
    await app.cleanup();
  }
});

test('审批按钮把回调 token 交给渠道（标记已处理的更新同样不能被还原）', async () => {
  const app = await makeBridge();
  try {
    app.interactions.claimed = true;
    await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_approval',
      token: 'tk_approval',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh: 'approval', decision: 'allowed-once' } },
    });
    // 回答按钮不替换卡片（由 hub 带"已回答"状态重渲染整张卡），所以这里验审批那条路。
    await app.flushPaints();
    assert.equal(app.gateway.calls.markedCards.at(-1)?.token, 'tk_approval');
    assert.equal(app.gateway.calls.markedCards.at(-1)?.messageId, 'om_approval');
    // 审批卡是 1.0：延迟更新必须带 open_ids，否则网关本地就会拒（300090）。
    assert.deepEqual(app.gateway.calls.markedCards.at(-1)?.openIds, ['ou_owner']);
  } finally {
    await app.cleanup();
  }
});

test('表单提交（多选/自由文本）是交互回传，不受命令门禁影响（否则这些人再也答不了题）', async () => {
  const app = await makeBridge({ policy: restrictCommands });
  try {
    app.interactions.claimed = true;
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_form',
      token: 'tk_form',
      operator: { openId: 'ou_other' },
      // 飞书没有 form_submit 事件：表单提交就是 button + form_value（value 为空）。
      action: { tag: 'button', value: {}, formValue: { text_q1: '我的答案' }, name: 'submit' },
    });
    assert.ok(answer, '应被认领为回答');
    assert.equal(answer.toast.type, 'success');
    assert.equal(app.gateway.calls.replies.length, 0, '不该出现"没有权限"的回复');
  } finally {
    await app.cleanup();
  }
});

test('群里的卡片即使还没有群绑定，也按群处理（别把动作落到操作者的私聊上）', async () => {
  const panel = makePanelStub();
  const commands = {
    async handle(request) {
      if (request.text === '/menu') {
        return { handled: true, reply: '可用命令', panel: await panel.read(), menu: [{ label: '/help', command: '/help' }] };
      }
      return { handled: true, reply: `输出：${request.text}` };
    },
  };
  const app = await makeBridge({ commands, panel });
  try {
    // 群里发 /menu：这一步会记住"这张卡属于 group:<chatId>"。
    await app.bridge.accept(messageEvent({ messageId: 'om_g1', chatType: 'group', chatId: 'oc_group', text: '/menu' }));
    // 模拟"操作者在群里，但群里还没有会话绑定"。
    await app.bridge.handleCardAction({
      chatId: 'oc_group',
      messageId: 'om_card',
      token: 'tk_g',
      operator: { openId: 'ou_owner' },
      action: { tag: 'select_static', name: 'model_pick', options: ['deepseek/flash'], value: { action: 'model_pick' } },
    });
    // 面板卡是 sendCard 发的（假 gateway 固定回 om_card），registry 里记的就是它。
    assert.equal(panel.applied.at(-1)?.key, 'group:oc_group', '动作必须落在群会话键上');
  } finally {
    await app.cleanup();
  }
});

test('命令清单卡上点命令也走延迟更新 token（否则输出会被客户端还原）', async () => {
  const panel = makePanelStub();
  const commands = {
    async handle(request) {
      if (request.text === '/menu') {
        return { handled: true, reply: '可用命令', panel: await panel.read(), menu: [{ label: '/help', command: '/help' }] };
      }
      return { handled: true, reply: `输出：${request.text}` };
    },
  };
  const app = await makeBridge({ commands, panel });
  try {
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_menu',
      token: 'tk_cmd',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_menu: '/status' } },
    });
    assert.equal(answer.toast.type, 'success');
    await app.flushPaints();
    assert.equal(app.gateway.calls.tokenUpdates.length, 1, '要走 token 路径');
    assert.match(JSON.stringify(app.gateway.calls.tokenUpdates[0].card), /\/status/);
  } finally {
    await app.cleanup();
  }
});

test('返回控制面板失败时不谎报成功：toast 不宣称已完成，失败落 lastError', async () => {
  const panel = makePanelStub();
  const app = await makeBridge({ panel });
  try {
    app.gateway.setFailure('updateCard', new Error('token expired'));
    app.gateway.setFailure('patchCard', new Error('卡片被删了'));
    app.gateway.setFailure('sendCard', new Error('发不出去'));
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_panel',
      token: 'tk_bad',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_panel: 'panel' } },
    });
    // 重画排在应答之后，所以此刻只能说"正在返回"，不能说"已回到"。
    assert.equal(answer.toast.type, 'info');
    assert.match(answer.toast.content, /正在返回/);
    await app.flushPaints();
    assert.match(String(app.bridge.status().lastError), /控制面板应答后重画失败/, '失败要落 lastError');
  } finally {
    await app.cleanup();
  }
});

test('控制面板卡：下拉超出上限时不静默丢——当前项一定在列表里，并写明还有多少没列出', async () => {
  const { panelCard } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  const options = Array.from({ length: 40 }, (_, index) => ({ value: `p/m${index}`, model: `m${index}` }));
  const card = panelCard({
    bound: true,
    sessionId: 'session-1',
    // 当前模型排在第 36 个：截断时必须把它带进可见列表，并且选中它。
    model: { current: { provider: 'p', model: 'm35' }, options, efforts: [], currentEffort: null },
    preset: { current: null, options: [] },
    workspace: { current: null, options: [] },
  });
  const picker = cardSelects(card).find((el) => el.name === 'model_pick');
  assert.ok(picker.options.some((option) => option.value === 'p/m35'), '当前项必须在列表里');
  assert.equal(picker.options[picker.initial_index - 1].value, 'p/m35', 'initial_index 要指向当前项');
  assert.ok(picker.options.length > 30, '为了带上当前项可以略微超出上限');
  assert.match(JSON.stringify(card), /还有 9 个模型未列出/, '要写明还有多少没列出（不静默丢）');
});

test('卡片→会话映射落盘：重启后群里的卡片仍被判成群，不会落到操作者私聊', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-cardmap-'));
  try {
    const path = join(dataDir, 'state.json');
    // 第一次运行：群里发 /menu 并把卡片映射写进 state.json。
    const firstPanel = makePanelStub();
    const commands = {
      async handle() {
        return { handled: true, reply: '可用命令', panel: await firstPanel.read(), menu: [] };
      },
    };
    const first = await makeBridge({ panel: firstPanel, commands, statePath: path });
    await first.bridge.accept(messageEvent({
      messageId: 'om_g1',
      chatType: 'group',
      chatId: 'oc_group',
      text: '@_user_1 /menu',
      mentions: [{ key: '@_user_1', id: { open_id: BOT.botOpenId } }],
    }));
    await first.state.flush();
    await first.cleanup();

    const onDisk = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(
      Object.values(onDisk.cardConversations ?? {}).includes('group:oc_group'), true,
      '卡片→会话映射要落盘（重启后不再靠猜）',
    );

    // 重启（同一个 state.json，新的 bridge）：操作者自己有私聊绑定，但卡片是群里的。
    const panel = makePanelStub();
    const second = await makeBridge({ panel, statePath: path });
    try {
      await second.bridge.handleCardAction({
        chatId: 'oc_group',
        messageId: 'om_card',
        token: 'tk_after_restart',
        operator: { openId: 'ou_owner' },
        action: { tag: 'select_static', name: 'model_pick', options: ['deepseek/flash'], value: { action: 'model_pick' } },
      });
      assert.equal(panel.applied.at(-1)?.key, 'group:oc_group', '重启后仍按群处理');
    } finally {
      await second.cleanup();
    }
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('控制面板卡：预设/工作区下拉被截断时也写明还有多少没列出（工作区还要指路设置页）', async () => {
  const { panelCard } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  const presetOptions = Array.from({ length: 35 }, (_, index) => ({ id: `preset-${index}` }));
  const workspaces = Array.from({ length: 33 }, (_, index) => `/ws/${index}`);
  const card = panelCard({
    bound: true,
    sessionId: 'session-1',
    model: { current: null, options: [], efforts: [], currentEffort: null },
    preset: { current: null, options: presetOptions },
    workspace: { current: null, options: workspaces },
  });
  const body = JSON.stringify(card);
  assert.match(body, /还有 6 个预设未列出：手打 `\/preset <id>`/, '预设要写明没列出的数量');
  assert.match(body, /还有 3 个工作区未列出（其余在设置页里选）/, '工作区要写明数量并指路设置页');
});

test('下拉取值认不出时报可见错误，而不是当成"恢复默认"静默清状态', async () => {
  const panel = makePanelStub();
  const app = await makeBridge({ panel });
  try {
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_panel',
      token: 'tk_bad_pick',
      operator: { openId: 'ou_owner' },
      // 飞书没把选中值放进 action.option/options/form_value（归一化后就是空数组）
      action: { tag: 'select_static', name: 'reasoning_pick', value: { action: 'reasoning_pick' } },
    });
    assert.equal(answer.toast.type, 'error');
    assert.match(answer.toast.content, /没认出/);
    assert.deepEqual(panel.applied, [], '绝不能把认不出的取值当成"恢复默认"应用下去');
    assert.equal(app.gateway.calls.tokenUpdates.length, 0, '也不该改动卡片');
  } finally {
    await app.cleanup();
  }
});

test('审批按钮要过身份门禁：群聊 allowlist 下未授权成员不能替属主批准', async () => {
  // 群里只允许 ou_owner；ou_other 既不是属主也不在名单里。
  const policy = {
    direct: { mode: 'open', open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] }, allowlist: { users: [] } },
    group: {
      mode: 'allowlist',
      open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] },
      allowlist: { users: [{ id: 'ou_owner', canExecuteCommands: true }] },
    },
  };
  const app = await makeBridge({ policy });
  try {
    app.interactions.claimed = true;
    const denied = await app.bridge.handleCardAction({
      chatId: 'oc_group',
      messageId: 'om_approval',
      token: 'tk_a',
      operator: { openId: 'ou_other' },
      action: { tag: 'button', value: { dsh: 'approval', decision: 'allowed-once' } },
    });
    assert.equal(denied.toast.type, 'error');
    assert.match(denied.toast.content, /权限/);
    assert.deepEqual(app.interactions.offers, [], '未授权者不该触发任何认领');
    assert.equal(app.gateway.calls.markedCards.length, 0, '卡片也不该被标成已允许');

    // 属主自己点：照常放行。
    const allowed = await app.bridge.handleCardAction({
      chatId: 'oc_group',
      messageId: 'om_approval',
      token: 'tk_b',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh: 'approval', decision: 'allowed-once' } },
    });
    assert.equal(allowed.toast.type, 'success');
    assert.equal(app.interactions.offers.at(-1)?.text, '允许');
  } finally {
    await app.cleanup();
  }
});

test('面板改动生效但卡片刷不出去时，失败要落进 lastError（toast 只承诺设置已生效）', async () => {
  const panel = makePanelStub();
  const app = await makeBridge({ panel });
  try {
    app.gateway.setFailure('updateCard', new Error('token 用完'));
    app.gateway.setFailure('patchCard', new Error('卡片被删'));
    app.gateway.setFailure('sendCard', new Error('发不出去'));
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_panel',
      token: 'tk_x',
      operator: { openId: 'ou_owner' },
      action: { tag: 'select_static', name: 'model_pick', options: ['anthropic/claude-x'], value: { action: 'model_pick' } },
    });
    // toast 说的是"设置已生效"（这是真的）；卡片没刷出去这件事必须有落盘现场。
    assert.equal(answer.toast.type, 'success');
    assert.match(answer.toast.content, /claude-x/);
    assert.equal(panel.applied.length, 1, '改动本身是生效的');
    await app.flushPaints();
    assert.match(String(app.bridge.status().lastError), /重画失败/, '卡片没刷出去要在状态里看到');
  } finally {
    await app.cleanup();
  }
});

test('卡片动作要等设置读完盘再判门禁：启动窗口内不该把被授权的非属主误拒', async () => {
  // 群里放行 ou_member（不是属主）；holdSettings 让 ready() 之前 storage 读到空文档。
  const policy = {
    direct: { mode: 'open', open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] }, allowlist: { users: [] } },
    group: {
      mode: 'allowlist',
      open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] },
      allowlist: { users: [{ id: 'ou_member', canExecuteCommands: true }] },
    },
  };
  const app = await makeBridge({ policy, holdSettings: true });
  try {
    app.interactions.claimed = true;
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_group',
      messageId: 'om_approval',
      token: 'tk_race',
      operator: { openId: 'ou_member' },
      action: { tag: 'button', value: { dsh: 'approval', decision: 'allowed-once' } },
    });
    assert.equal(answer.toast.type, 'success', '放行名单里的成员不该因为"读盘没读完"被误拒');
    assert.equal(app.interactions.offers.length, 1);
  } finally {
    await app.cleanup();
  }
});

test('控制面板卡：推理等级为空时要说清是"读不到目录"，不能断言"模型不支持"', async () => {
  const { panelCard } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  const current = { provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' };

  // ① 目录整体读不到（failures 有值）：选项为空是"读不到"，不是"这个模型没有推理等级"。
  const failed = JSON.stringify(panelCard({
    bound: true,
    sessionId: 'session-1',
    model: {
      current,
      options: [],
      efforts: [],
      currentEffort: 'high',
      failures: [{ id: 'anthropic', name: 'Anthropic', message: '连接超时' }],
    },
    preset: { current: null, options: [] },
    workspace: { current: null, options: [] },
  }));
  assert.match(failed, /读不到模型目录/);
  assert.doesNotMatch(failed, /当前模型不支持调节推理等级/);

  // ② 目录读到了、但当前模型不在里面（比如目录变了）：同样是"列不出来"，不能反过来说不支持。
  const missing = JSON.stringify(panelCard({
    bound: true,
    sessionId: 'session-1',
    model: {
      current,
      options: [{ value: 'deepseek/other', provider: 'deepseek', model: 'other', efforts: [{ id: 'low', label: '低' }] }],
      efforts: [],
      currentEffort: 'high',
      failures: [],
    },
    preset: { current: null, options: [] },
    workspace: { current: null, options: [] },
  }));
  assert.match(missing, /读不到模型目录/);

  // ③ 目录里有这个模型、它确实没有 efforts：这才是"不支持调节推理等级"。
  const noEffort = JSON.stringify(panelCard({
    bound: true,
    sessionId: 'session-1',
    model: {
      current,
      options: [{ value: 'deepseek/deepseek-v4.1-flash', provider: 'deepseek', model: 'deepseek-v4.1-flash', efforts: [] }],
      efforts: [],
      currentEffort: null,
      failures: [],
    },
    preset: { current: null, options: [] },
    workspace: { current: null, options: [] },
  }));
  assert.match(noEffort, /当前模型不支持调节推理等级/);

  // ④ 别的 provider 读失败，但这个模型在目录里且确实没有 efforts → 仍是"不支持"，不能借别人的失败说"读不到"。
  const otherFailed = JSON.stringify(panelCard({
    bound: true,
    sessionId: 'session-1',
    model: {
      current,
      options: [{ value: 'deepseek/deepseek-v4.1-flash', provider: 'deepseek', model: 'deepseek-v4.1-flash', efforts: [] }],
      efforts: [],
      currentEffort: null,
      failures: [{ id: 'anthropic', name: 'Anthropic', message: '连接超时' }],
    },
    preset: { current: null, options: [] },
    workspace: { current: null, options: [] },
  }));
  assert.match(otherFailed, /当前模型不支持调节推理等级/);

  // ⑤ 当前模型**自己**的 provider 读失败才说"读不到"。
  const ownFailed = JSON.stringify(panelCard({
    bound: true,
    sessionId: 'session-1',
    model: {
      current,
      options: [],
      efforts: [],
      currentEffort: null,
      failures: [{ id: 'deepseek', name: 'DeepSeek', message: '连接超时' }],
    },
    preset: { current: null, options: [] },
    workspace: { current: null, options: [] },
  }));
  assert.match(ownFailed, /读不到模型目录/);
});

test('控制面板卡：预设列表读不到时如实说明，不能显示成"一个预设都没有"', async () => {
  const { panelCard } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  const card = JSON.stringify(panelCard({
    bound: true,
    sessionId: 'session-1',
    model: { current: null, options: [], efforts: [], currentEffort: null, failures: [] },
    preset: { current: null, options: [], failed: true },
    workspace: { current: null, options: [] },
  }));
  assert.match(card, /读不到 Agent Preset 列表/);
});

test('提问/审批卡片也要登记会话映射：群卡不能在群解绑后被当成私聊', async () => {
  const app = await makeBridge();
  try {
    const attach = app.attached[0];

    // 审批卡：发出去时就记下"这张卡属于 group:oc_group"。
    await attach.sendApproval({ key: 'group:oc_group', request: { toolName: 'bash' } });
    assert.equal(
      app.state.cardConversation('om_approval_card'), 'group:oc_group',
      '审批卡不登记映射，就只能在"群已解绑 + 点击者有私聊绑定"时按私聊判门禁',
    );

    // 提问卡：同样是"我们发的卡"，也要记。
    await attach.sendQuestions({
      key: 'group:oc_group',
      questions: [{ id: 'q1', question: '选哪个', options: ['A', 'B'], type: 'single' }],
      answered: {},
      final: false,
    });
    assert.equal(app.state.cardConversation('om_question_card'), 'group:oc_group');
  } finally {
    await app.cleanup();
  }
});

test('控制面板卡：工作区未设置时如实说"新会话会失败"，预设下拉带展示名', async () => {
  const { panelCard } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  const card = JSON.stringify(panelCard({
    bound: true,
    sessionId: 'session-1',
    model: { current: null, options: [], efforts: [], currentEffort: null, failures: [] },
    // hub 算好的展示名与默认标记要出现在卡片上（只有裸 id 认不出是哪个预设）。
    preset: { current: null, options: [{ id: 'yh-olap', label: 'yh-olap · 有货率', isDefault: true }] },
    workspace: { current: null, options: [] },
  }));

  // 工作区为空 = 建会话会失败（chat/workspace-required），没有"默认目录"这回事。
  assert.match(card, /还没有工作区：先在设置页填一个绝对路径，否则新会话建不出来/);
  assert.doesNotMatch(card, /用默认目录/);
  assert.match(card, /yh-olap · 有货率（Host 默认）/, '预设下拉用展示名并标出 Host 默认');
});

test('审批按钮先认领卡片自己的会话，再退到另一个候选', async () => {
  const app = await makeBridge();
  try {
    // 先让机器人往群 `oc_group` 发一张审批卡（登记了卡片→会话映射）。
    const attach = app.attached[0];
    await attach.sendApproval({ key: 'group:oc_group', request: { toolName: 'bash' } });

    // 只让"群那个 waiter"认领：旧实现固定先试 p2p，会把私聊那轮先决定掉。
    app.interactions.claimKey = 'group:oc_group';
    const response = await app.bridge.handleCardAction({
      messageId: 'om_approval_card',
      chatId: 'oc_group',
      token: 'tk_scope',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh: 'approval', decision: 'allowed-once' } },
    });

    assert.equal(response.toast.type, 'success');
    assert.deepEqual(
      app.interactions.offers.map((item) => item.key), ['group:oc_group'],
      '第一个候选必须是这张卡真实所在的会话（映射给出来的 key），私聊那轮不该被顺手决定',
    );
  } finally {
    await app.cleanup();
  }
});

test('面板动作把 isOwner 传下去：非属主改机器人级设置由 hub 拒（渠道不自己判）', async () => {
  // 策略 open：成员能执行命令（过得了命令门禁），但 preset/workspace 是机器人级的。
  const policy = {
    direct: { mode: 'open', open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] }, allowlist: { users: [] } },
    group: { mode: 'open', open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] }, allowlist: { users: [] } },
  };
  const panel = makePanelStub();
  const app = await makeBridge({ panel, policy });
  try {
    await app.bridge.handleCardAction({
      chatId: 'oc_group',
      messageId: 'om_panel',
      token: 'tk_owner_flag',
      operator: { openId: 'ou_member' },
      action: { tag: 'select_static', name: 'workspace_pick', options: ['/ws/b'], value: { action: 'workspace_pick' } },
    });
    assert.equal(app.panel.applied.at(-1)?.isOwner, false, '非属主要如实传 false，由 hub 落 chat/owner-only');
  } finally {
    await app.cleanup();
  }
});

test('卡片路径的失败要落 lastError：状态页里要有现场', async () => {
  const panel = makePanelStub({ fail: { field: 'model', message: '网关超时', code: 'chat/model-selection-unavailable' } });
  const app = await makeBridge({ panel });
  try {
    await app.bridge.handleCardAction({
      chatId: 'oc_chat',
      messageId: 'om_panel',
      token: 'tk_fail',
      operator: { openId: 'ou_owner' },
      action: { tag: 'select_static', name: 'model_pick', options: ['deepseek/deepseek-v4.1-flash'], value: { action: 'model_pick' } },
    });
    assert.match(
      String(app.bridge.status().lastError), /网关超时/,
      '只写日志的话，connection.status 上看不到"点了卡片没反应"的原因',
    );
  } finally {
    await app.cleanup();
  }
});

test('控制面板卡：整目录读失败说"读不到模型目录"，不说"没有可用模型"', async () => {
  const { panelCard } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  const card = JSON.stringify(panelCard({
    bound: true,
    sessionId: 'session-1',
    // hub 在整目录 RPC 失败时造的那条失败项（没有 provider id，只有显示名与原因）。
    model: {
      current: null, options: [], efforts: [], currentEffort: null,
      failures: [{ id: '', name: '模型目录', message: 'RPC 超时' }],
    },
    preset: { current: null, options: [] },
    workspace: { current: null, options: [] },
  }));
  assert.match(card, /读不到模型目录：RPC 超时/, '读失败要如实说读不到，并带上原因');
  assert.doesNotMatch(card, /没有可用模型/, '读不到 ≠ 没有');
  assert.doesNotMatch(card, /· ：/, '失败行不能没有名字');
});

test('控制面板卡：读不到模型选择 / 工作区候选被扣下时，都不能说成事实的反面', async () => {
  const { panelCard } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');

  // ① session/list 读失败：不能说"跟随 Host 默认"（用户的选择没丢，是这次读不到）。
  const unreadable = JSON.stringify(panelCard({
    bound: true,
    sessionId: 'session-1',
    model: {
      current: null, selectionFailed: true, options: [], efforts: [], currentEffort: null, failures: [],
    },
    preset: { current: null, options: [] },
    workspace: { current: '/ws/a', options: [] },
  }));
  assert.match(unreadable, /读不到当前会话的模型选择（Host 暂时不可用）/);
  // 读失败时不能退回"跟随 Host 默认"（那是与事实相反的状态）。
  assert.doesNotMatch(unreadable, /跟随 Host 默认（deepseek/);

  // ② 工作区候选被扣下（群会话/非属主）：当前值仍要看得见，不能说"还没有工作区"。
  assert.match(unreadable, /候选只在私聊里给属主/);
  assert.match(unreadable, /\/ws\/a/, '被扣下候选时当前工作区仍要看得见');
  assert.doesNotMatch(unreadable, /还没有工作区/);
});

test('控制面板卡：按设置页的显示项过滤（关掉的项不画，功能不受影响）', async () => {
  const { panelCard } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  const base = {
    bound: true,
    sessionId: 'session-1',
    model: {
      current: { provider: 'yh', model: 'gpt-5.5-luna' },
      options: [{ value: 'yh/gpt-5.5-luna', provider: 'yh', model: 'gpt-5.5-luna', efforts: [] }],
      efforts: [], currentEffort: null, failures: [],
    },
    preset: { current: null, options: [] },
    workspace: { current: '/ws', options: ['/ws'] },
    session: { current: 'session-1', options: [{ id: 'session-1', label: '会话一 · 刚刚' }] },
    context: { current: '', label: '本私聊', identity: 'ou_a', own: null, options: [{ value: '', label: '跟随私聊全局（已启用）' }] },
    policy: {
      current: 'allowlist', label: '仅属主可用', conversationType: 'direct', kindLabel: 'direct',
      options: [{ value: 'allowlist', label: '仅名单内可用' }],
    },
    fields: [{ field: 'stepPushDirect', label: '任务过程展示（私聊）', value: 'off', options: [{ value: 'off', label: '不显示' }] }],
    actions: [{ action: 'reconnect', label: '🔌 重连' }],
  };

  // 全显示：该有的都在。
  const all = JSON.stringify(panelCard(base));
  for (const text of ['模型', '会话', 'Agent 预设', '上下文增强', '访问策略', '任务过程展示', '🔌 重连', '🆕 新会话']) {
    assert.ok(all.includes(text), `全显示时应有 ${text}`);
  }

  // 只留命令按钮（群里常见的最小面板）：别的项一律不画，但仍能操作命令。
  const minimal = panelCard({
    ...base,
    sections: {
      model: false, session: false, preset: false, context: false,
      policy: false, fields: false, actions: false, commands: true,
    },
  });
  const body = JSON.stringify(minimal);
  for (const text of ['访问策略', '上下文增强', '任务过程展示', '🔌 重连', 'Agent 预设']) {
    assert.ok(!body.includes(text), `关掉的项不该画出来：${text}`);
  }
  assert.match(body, /🆕 新会话/, '命令按钮留着');
  assert.ok(minimal.body.elements.length <= 4, `只剩按钮区：${minimal.body.elements.length} 个元素`);

  // 全关掉：不能产出空 body（平台会拒），要指路设置页。
  const empty = panelCard({
    ...base,
    sections: {
      model: false, session: false, preset: false, context: false,
      policy: false, fields: false, actions: false, commands: false,
    },
  });
  assert.equal(empty.body.elements.length, 1);
  assert.match(JSON.stringify(empty), /控制面板的显示项都被关掉了/);
  assert.match(JSON.stringify(empty), /设置页/);
});

test('控制面板卡：只放能改的东西——不重复状态行、不留页脚、路径短到不会被截', async () => {
  const { panelCard } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');
  const card = panelCard({
    bound: true,
    sessionId: 'session-880fd592-b257-4527-b2be-d8535a362f75',
    model: {
      current: { provider: 'yh', model: 'gpt-5.5-luna', reasoningEffort: 'high' },
      options: [{
        value: 'yh/gpt-5.5-luna', provider: 'yh', model: 'gpt-5.5-luna', efforts: [{ id: 'high', label: '高' }],
      }],
      efforts: [{ id: 'high', label: '高' }],
      currentEffort: 'high',
      failures: [],
    },
    preset: { current: 'yh-olap', options: [{ id: 'yh-olap', label: 'yh-olap · 有货率', isDefault: true }] },
    workspace: { current: '/Users/zhang3/yh_zhang3/张三bot', options: ['/Users/zhang3/yh_zhang3/张三bot'] },
    session: { current: 'session-880fd592-b257', options: [{ id: 'session-880fd592-b257', label: '上次那个会话 · 3 分钟前' }] },
  });
  const body = JSON.stringify(card);

  // 每个设置的当前值由它自己的下拉 ✓ 表达，不再重复一整块"当前会话/模型/预设/工作区"。
  assert.doesNotMatch(body, /\*\*当前会话\*\*/);
  assert.doesNotMatch(body, /不便点下拉时/, '页脚那行手打提示是废话，已删');

  // 顶层只剩：会话行、模型/推理行、hr、生效范围说明、预设/工作区行、hr、三行按钮。
  assert.deepEqual(
    card.body.elements.map((el) => el.tag),
    ['column_set', 'column_set', 'hr', 'markdown', 'column_set', 'hr',
      'column_set', 'column_set', 'column_set'],
  );
  const buttonRows = card.body.elements
    .filter((el) => el.tag === 'column_set' && el.columns[0].elements[0].tag === 'button');
  const buttonLabels = buttonRows.map((el) => el.columns.map((column) => column.elements[0].text.content));
  assert.deepEqual(buttonLabels, [
    ['🆕 新会话', '📊 状态', '📖 命令'],
    ['🩺 诊断', '📜 历史', '🗜 压缩'],
    ['⏹ 停止'],
  ], '7 个按钮分三行（一行 3 个：手机端一行 4 个会把标签截成图标）');
  // 一行的按钮数有硬上限：手机端比桌面窄得多，4 个就会截字（真机截图如此）。
  assert.ok(buttonRows.every((el) => el.columns.length <= 3), '一行最多 3 个按钮');
  // 标签本身也要短：卡片上的按钮宽度有限，超过 5 个字符就有被截的风险。
  assert.ok(buttonLabels.flat().every((label) => label.length <= 6),
    `按钮标签要短：${JSON.stringify(buttonLabels)}`);

  // 每个下拉都有自己的名称：名称是同一列里的 markdown，控件在下（select_static 没有 label 字段）。
  const labelled = (name) => {
    const grids = card.body.elements.filter((el) => el.tag === 'column_set');
    for (const grid of grids) {
      for (const column of grid.columns) {
        const pick = column.elements.find((el) => el.name === name);
        if (pick) return { label: column.elements[0].content, pick, flexMode: grid.flex_mode };
      }
    }
    return null;
  };
  assert.equal(labelled('session_pick').label, '**会话**');
  assert.equal(labelled('model_pick').label, '**模型**');
  assert.equal(labelled('reasoning_pick').label, '**推理等级**');
  assert.equal(labelled('preset_pick').label, '**Agent 预设**');
  assert.equal(labelled('workspace_pick').label, '**工作区**');
  assert.ok(cardSelects(card).every((el) => el.width === 'fill'), '格子里要撑满列宽');

  // 并排两格 + 窄屏自动堆叠（`stretch`）：手机上半栏会压扁模型 id / 路径。
  const grids = card.body.elements.filter((el) => el.tag === 'column_set' && el.columns.length === 2);
  assert.equal(grids.length, 2, '两组设置各一行两格（会话那一行是全宽单格）');
  assert.ok(grids.every((el) => el.flex_mode === 'stretch'));

  // 长路径自己截断（飞书会从尾巴截，正好截掉目录名），取值仍是完整路径。
  const workspace = cardSelects(card).find((el) => el.name === 'workspace_pick');
  assert.match(workspace.options[0].text.content, /\/…\/yh_zhang3\/张三bot/);
  assert.equal(workspace.options[0].value, '/Users/zhang3/yh_zhang3/张三bot');
  assert.ok(workspace.options[0].text.content.length <= 24, '要短到飞书不再二次截断（含 ✓ 前缀）');
});

test('会话下拉：映射到 field=session，空值 = 新会话；历史/压缩按钮走文字回', async () => {
  const { panelPick, panelButton } = await import('../packages/dsh-chat-feishu/host/panel-card.mjs');

  assert.deepEqual(panelPick('session_pick', ['session-9']), {
    field: 'session', value: 'session-9', label: '切换会话',
  });
  // 哨兵（下拉里的"新会话"）翻译回空串，hub 侧空值 = 新会话（不是"找不到会话"）。
  assert.deepEqual(panelPick('session_pick', ['__default__']), {
    field: 'session', value: '', label: '切换会话',
  });

  // 历史/压缩：输出是文本、压缩还可能超过回调应答的 3 秒 → 排在应答之后，用文字消息回。
  assert.deepEqual(panelButton('history'), { command: '/history', label: '历史', asText: true });
  assert.deepEqual(panelButton('diag'), { command: '/diag', label: '诊断', asText: true });
  assert.deepEqual(panelButton('compact'), { command: '/compact', label: '压缩', asText: true });
});

test('面板上的「历史/压缩」：排在应答之后执行，结果用文字回（不往卡片上写）', async () => {
  const panel = makePanelStub();
  const commands = {
    async handle(request) {
      if (request.text === '/history') return { handled: true, reply: '最近 2 轮：\n1. 你：你好\n   bot：你好' };
      if (request.text === '/compact') return { handled: true, reply: '压缩完成。' };
      return { handled: true, reply: 'x' };
    },
  };
  const app = await makeBridge({ panel, commands });
  try {
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat', messageId: 'om_panel', token: 'tk_hist',
      operator: { openId: 'ou_owner' },
      action: { tag: 'button', value: { dsh_panel: 'history' } },
    });
    // 不能在应答前跑（压缩可能几十秒，回调只有 3 秒）。
    assert.equal(answer.toast.type, 'info');
    assert.match(answer.toast.content, /正在执行 \/history/);
    assert.equal(app.gateway.calls.replies.length, 0, '结果要等应答之后再回');

    await app.flushPaints();
    assert.match(app.gateway.calls.replies.at(-1)?.text ?? '', /最近 2 轮/, '历史走文字消息');
    assert.equal(app.gateway.calls.tokenUpdates.length, 0, '不往卡片上写');
  } finally {
    await app.cleanup();
  }
});

test('会话下拉：选一个会话就绑定到当前聊天（走 hub 的 field=session）', async () => {
  const panel = makePanelStub();
  const app = await makeBridge({ panel });
  try {
    const answer = await app.bridge.handleCardAction({
      chatId: 'oc_chat', messageId: 'om_panel', token: 'tk_session',
      operator: { openId: 'ou_owner' },
      action: { tag: 'select_static', name: 'session_pick', options: ['session-9'], value: { action: 'session_pick' } },
    });
    assert.equal(answer.toast.type, 'success');
    assert.deepEqual(
      panel.applied.map((item) => ({ field: item.field, value: item.value })),
      [{ field: 'session', value: 'session-9' }],
    );
  } finally {
    await app.cleanup();
  }
});

test('引用回复：用户引用一条消息后提问，被引用正文要一起进提示词（读不到也不能丢当前问题）', async () => {
  const asked = [];
  const app = await makeBridge({ onAsk: (options) => asked.push(options) });
  try {
    await app.bridge.accept(messageEvent({ text: '这条你怎么看', parentId: 'om_parent' }));
    assert.deepEqual(app.gateway.calls.quoted, [{ messageId: 'om_parent' }], '要按 parent_id 查一次');
    const prompt = asked.at(-1).content.map((part) => part.text ?? `[${part.type}]`).join('');
    assert.match(prompt, /<dsh_im_reply>/, '要有引用块');
    assert.match(prompt, /昨天销售额多少？/, '被引用的正文要在');
    assert.match(prompt, /这条你怎么看/, '当前提问也要在（不能被引用顶掉）');
    assert.equal((prompt.match(/<dsh_im_reply>/g) ?? []).length, 1, '只出现一次');

    // 读不到（删除/无权限）：给结构化标记，当前问题照常进模型。
    asked.length = 0;
    app.gateway.setDownload({ quotedError: Object.assign(new Error('message not found'), { code: 230002 }) });
    await app.bridge.accept(messageEvent({ messageId: 'om_2', text: '那这个呢', parentId: 'om_gone' }));
    const prompt2 = asked.at(-1).content.map((part) => part.text ?? `[${part.type}]`).join('');
    assert.match(prompt2, /引用内容不可用/, '读不到要有结构化标记');
    assert.match(prompt2, /那这个呢/, '当前问题照样进模型');
  } finally {
    await app.cleanup();
  }
});

test('延迟交付：飞书按会话键把补发结果发回私聊/群聊（带一句说明）', async () => {
  const registrations = [];
  const app = await makeBridge({ deferred: registrations });
  try {
    assert.equal(registrations.length, 1, '建桥时要注册补发函数');
    assert.equal(registrations[0].channelId, 'feishu');
    assert.equal(registrations[0].botId, BOT.id);

    const deliver = registrations[0].deliver;
    await deliver({ key: 'p2p:ou_owner', text: '超时之后才跑完的答案' });
    assert.deepEqual(app.gateway.calls.texts.at(-1), {
      chatId: undefined,
      openId: 'ou_owner',
      text: '（上一轮超时之后跑完了，补发结果）\n\n超时之后才跑完的答案',
    });

    await deliver({ key: 'group:oc_group', text: '群里的答案' });
    assert.equal(app.gateway.calls.texts.at(-1).chatId, 'oc_group');
    assert.equal(app.gateway.calls.texts.at(-1).openId, undefined);
    assert.match(app.gateway.calls.texts.at(-1).text, /群里的答案/);
  } finally {
    await app.cleanup();
  }
});

test('过程卡不再显示「已注入会话上下文」那行（真机反馈：纯占地方）', () => {
  const card = renderStepCard({
    title: '正在处理',
    panelItems: [{ kind: 'tool', rows: ['· Bash · 看时间'] }],
    answer: '今天几号',
  });
  const body = JSON.stringify(card);
  assert.doesNotMatch(body, /已注入会话上下文/, '这行已经删掉了');
  // 面板与答案都还在（只删提示，不删内容）。
  assert.match(body, /Bash · 看时间/);
  assert.match(body, /今天几号/);
  // 第一个元素就是面板，不再插一行说明占空间。
  assert.equal(card.body.elements[0].tag, 'collapsible_panel');
});

test('配置：lark-cli 身份策略默认 bot-only，写坏的值也回落 bot-only', () => {
  const base = { id: 'b1', appId: 'cli_abc_12345', secretRef: 'REF', ownerOpenIds: ['ou_owner'] };
  assert.equal(normalizeBot(base).larkUserIdentity, 'bot-only', '缺字段 = 只用应用身份');
  assert.equal(normalizeBot(base).larkUserOpenId, null);
  assert.equal(normalizeBot({ ...base, larkUserIdentity: 'user' }).larkUserIdentity, 'bot-only');
  assert.equal(normalizeBot({ ...base, larkUserIdentity: true }).larkUserIdentity, 'bot-only');
  // 允许了但没钉住用户：值是允许的（设置页要如实显示"需要重新开启"），但 openId 为空。
  const openNoUser = normalizeBot({ ...base, larkUserIdentity: 'user-allowed', larkUserOpenId: '' });
  assert.equal(openNoUser.larkUserIdentity, 'user-allowed');
  assert.equal(openNoUser.larkUserOpenId, null);
  const pinned = normalizeBot({
    ...base, larkUserIdentity: 'user-allowed', larkUserOpenId: 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5',
  });
  assert.equal(pinned.larkUserOpenId, 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5');
  // 关掉时必须把钉住的人一起清掉（留着只会让下次误用时更迷惑）。
  const off = normalizeBot({
    ...base, larkUserIdentity: 'bot-only', larkUserOpenId: 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5',
  });
  assert.equal(off.larkUserOpenId, null);
});

test('配置：setLarkIdentity 落盘并清空/拒绝可疑的 openId', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-larkid-'));
  try {
    const store = createFeishuConfigStore({ path: join(dataDir, 'config.json'), logger: silentLogger });
    await store.load();
    await store.saveBot({ id: 'b1', appId: 'cli_abc_12345', secretRef: 'REF', ownerOpenIds: ['ou_owner'] });

    const on = await store.setLarkIdentity('b1', { value: 'user-allowed', userOpenId: 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5' });
    assert.equal(on.larkUserIdentity, 'user-allowed');
    assert.equal(on.larkUserOpenId, 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5');

    const off = await store.setLarkIdentity('b1', { value: 'bot-only' });
    assert.equal(off.larkUserIdentity, 'bot-only');
    assert.equal(off.larkUserOpenId, null, '关掉时要把钉住的用户清掉');

    await assert.rejects(
      store.setLarkIdentity('b1', { value: 'user-allowed', userOpenId: 'not-an-open-id' }),
      /open_id/,
    );
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

/** 门禁/环境事实测试用的会话 id（假绑定表里指向本渠道的 bot_lark）。 */
const IDENTITY_SESSION = 'session-lark-guard-1';

/** 控制器测试用的假 lark-cli：只实现设置页/端点会碰的那几个方法。 */
function createFakeLarkCli(options = {}) {
  const calls = { inspect: 0, whoami: [], ensureProfile: 0 };
  return {
    calls,
    cli: {
      appId: options.appId ?? 'cli_lark_identity_1',
      // 真机形态：profile 名就是应用当初被命名的那个（lark-cli 一个 appId 只有一份 profile）。
      profileName: options.profileName ?? 'cli_lark_identity_1',
      async ensureProfile() {
        calls.ensureProfile = (calls.ensureProfile ?? 0) + 1;
        if (options.ensureProfileError) throw options.ensureProfileError;
        return { name: options.profileName ?? 'cli_lark_identity_1', appId: options.appId ?? 'cli_lark_identity_1' };
      },
      async inspect() {
        calls.inspect += 1;
        if (options.inspectError) throw options.inspectError;
        return options.inspect ?? {
          policy: { mode: 'bot-only', userOpenId: null },
          profile: { found: true, name: 'dsh-chat-cli_lark_identity_1', appId: 'cli_lark_identity_1', brand: 'feishu' },
          identity: {
            bot: { appId: 'cli_lark_identity_1', identity: 'bot', available: true },
            user: { onBehalfOf: { userName: '张三', openId: 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5' } },
          },
          checkedAt: '2026-09-20T10:00:00.000Z',
        };
      },
      async whoami({ as }) {
        calls.whoami.push(as);
        if (options.whoamiError) throw options.whoamiError;
        return options.whoami ?? {
          appId: 'cli_lark_identity_1',
          identity: as,
          available: true,
          onBehalfOf: { userName: '张三', openId: 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5' },
        };
      },
    },
  };
}

async function createIdentityController(dataDir, options = {}) {
  const bot = {
    id: 'bot_lark',
    appId: 'cli_lark_identity_1',
    secretRef: 'DSH_FEISHU_APP_SECRET',
    ownerOpenIds: ['ou_owner'],
    stepPushDirect: 'off',
    stepPushGroup: 'off',
    ...(options.bot ?? {}),
  };
  await mkdir(join(dataDir, 'bots'), { recursive: true });
  await writeFile(join(dataDir, 'config.json'), JSON.stringify({ version: 2, bots: [bot] }), 'utf8');
  const fake = createFakeLarkCli(options.larkCli);
  const controller = createFeishuController({
    deps: {
      channelId: 'feishu',
      dataDir,
      logger: silentLogger,
      credentials: { resolve: async () => ({ value: 'secret-value', configured: true }) },
      contextEnhancement: { captureContextEnhancementSource, enhanceContent },
      replyReference: { enhanceReplyReference },
      accessPolicy,
      sessions: {
        ask: async () => ({ text: '', reason: { kind: 'completed' } }),
        bindings: {
          adopt: async () => 0,
          // 会话绑定表（真机上是 hub 那份）：门禁/环境事实/提示词段共用同一份判据。
          locate: (sessionId) => (sessionId === IDENTITY_SESSION
            ? { channelId: 'feishu', botId: 'bot_lark', key: 'p2p:ou_owner' }
            : undefined),
        },
      },
    },
    logger: silentLogger,
    internals: {
      sdk: async () => ({ Client: class {}, WSClient: class {}, Domain: {}, LoggerLevel: {} }),
      createGateway: () => createFakeGateway(),
      createLarkCli: () => fake.cli,
    },
  });
  return { controller, fake };
}

test('lark-cli 身份：只读体检把 profile 与两个身份都报出来（不写盘）', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-larkget-'));
  try {
    const { controller, fake } = await createIdentityController(dataDir);
    const before = await readFile(join(dataDir, 'config.json'), 'utf8');
    const result = await controller.endpoints['bot.lark-identity.get']({ botId: 'bot_lark' });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.value.policy.mode, 'bot-only');
    assert.equal(result.value.profile.appId, 'cli_lark_identity_1');
    assert.equal(result.value.identity.user.onBehalfOf.userName, '张三');
    assert.equal(fake.calls.inspect, 1);
    assert.deepEqual(fake.calls.whoami, [], '只读体检走 inspect，不额外问 whoami');
    assert.equal(await readFile(join(dataDir, 'config.json'), 'utf8'), before, '读接口不该写盘');

    assert.equal((await controller.endpoints['bot.lark-identity.get']({})).error.code, 'chat/bad-request');
    assert.equal((await controller.endpoints['bot.lark-identity.get']({ botId: 'ghost' })).error.code, 'feishu/unknown-bot');
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('lark-cli 身份：开启用户身份必须先确认，确认前一个字节都不写', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-larkconfirm-'));
  try {
    const { controller } = await createIdentityController(dataDir);
    const before = await readFile(join(dataDir, 'config.json'), 'utf8');

    const asked = await controller.endpoints['bot.lark-identity.set']({ botId: 'bot_lark', value: 'user-allowed' });
    assert.equal(asked.ok, true, JSON.stringify(asked));
    assert.equal(asked.value.requiresConfirm, true, '放权必须先确认');
    assert.match(asked.value.confirmPrompt, /张三/, '确认文案要说清"以谁的名义"');
    assert.equal(asked.value.candidate.openId, 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5');
    assert.equal(await readFile(join(dataDir, 'config.json'), 'utf8'), before, '确认前不许落盘');

    const done = await controller.endpoints['bot.lark-identity.set']({
      botId: 'bot_lark', value: 'user-allowed', confirm: true,
    });
    assert.equal(done.ok, true, JSON.stringify(done));
    assert.equal(done.value.mode, 'user-allowed');
    assert.equal(done.value.userOpenId, 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5', '要钉住 lark-cli 报回来的那个人');
    const saved = JSON.parse(await readFile(join(dataDir, 'config.json'), 'utf8'));
    assert.equal(saved.bots[0].larkUserIdentity, 'user-allowed');
    assert.equal(saved.bots[0].larkUserOpenId, 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5');

    // 运行期那份 bot 对象必须就地改（桥上拿的就是它；换引用 = 改了不生效）。
    const status = await controller.endpoints['connection.status']({});
    assert.equal(status.value.bots[0].larkIdentity.mode, 'user-allowed');

    // 关回 bot-only：收窄不用确认，立刻落盘并清掉钉住的用户。
    const narrowed = await controller.endpoints['bot.lark-identity.set']({ botId: 'bot_lark', value: 'bot-only' });
    assert.equal(narrowed.value.requiresConfirm, undefined);
    assert.equal(narrowed.value.mode, 'bot-only');
    assert.equal(narrowed.value.userOpenId, null);
    const back = JSON.parse(await readFile(join(dataDir, 'config.json'), 'utf8'));
    assert.equal(back.bots[0].larkUserOpenId, null);
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('lark-cli 身份：lark-cli 里没有用户登录时拒绝开启，并给出能照做的命令', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-larknouser-'));
  try {
    const { controller } = await createIdentityController(dataDir, {
      larkCli: { whoami: { appId: 'cli_lark_identity_1', identity: 'user', available: false } },
    });
    const result = await controller.endpoints['bot.lark-identity.set']({
      botId: 'bot_lark', value: 'user-allowed', confirm: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'feishu/lark-cli-user-unavailable');
    assert.match(result.error.details.hint, /auth login/, '要说清怎么把用户登录补上');
    const saved = JSON.parse(await readFile(join(dataDir, 'config.json'), 'utf8'));
    assert.equal(saved.bots[0].larkUserIdentity ?? 'bot-only', 'bot-only', '失败不能留下"已开启"');
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('lark-cli 身份：生效的应用不是这台机器人时拒绝开启', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-larkmismatch-'));
  try {
    const { controller } = await createIdentityController(dataDir, {
      larkCli: { whoami: { appId: 'cli_another_app', identity: 'user', available: true, onBehalfOf: { openId: 'ou_x' } } },
    });
    const result = await controller.endpoints['bot.lark-identity.set']({
      botId: 'bot_lark', value: 'user-allowed', confirm: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'feishu/lark-cli-app-mismatch');
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('lark-cli 身份：读不到 lark-cli 时如实报错，且取值必须合法', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-larkbad-'));
  try {
    const probeError = new Error('没找到 lark-cli');
    probeError.code = 'feishu/lark-cli-missing';
    const { controller } = await createIdentityController(dataDir, { larkCli: { whoamiError: probeError } });
    const failed = await controller.endpoints['bot.lark-identity.set']({
      botId: 'bot_lark', value: 'user-allowed', confirm: true,
    });
    assert.equal(failed.error.code, 'feishu/lark-cli-missing', '保留底层错误码，便于排查');

    for (const payload of [
      { botId: 'bot_lark' },
      { botId: 'bot_lark', value: 'user' },
      { botId: 'bot_lark', value: true },
      { value: 'bot-only' },
    ]) {
      assert.equal((await controller.endpoints['bot.lark-identity.set'](payload)).error.code, 'chat/bad-request');
    }
    assert.equal((await controller.endpoints['bot.lark-identity.set']({ botId: 'ghost', value: 'bot-only' })).error.code,
      'feishu/unknown-bot');
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('lark-cli 门禁：聊天会话里的调用按身份策略判，别的会话一概不管', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-larkguard-'));
  try {
    const { controller } = await createIdentityController(dataDir);
    await controller.start();

    const owner = controller.chatOwnership(IDENTITY_SESSION);
    assert.equal(owner.botId, 'bot_lark');
    assert.equal(owner.mode, 'bot-only', '默认只用应用身份');
    assert.equal(owner.profileName, 'cli_lark_identity_1', 'profile 名来自 lark-cli（不是猜的）');
    assert.equal(controller.chatOwnership('session-not-ours'), null, '不是聊天会话就不管');

    /** 一次 bash 调用（真机上就是模型跑 lark-cli 的那条路）。 */
    const call = (command, sessionId = IDENTITY_SESSION) => ({
      name: 'bash',
      arguments: { command },
      agent: { session: { header: { id: sessionId } } },
    });

    // 真机那次：没带 profile、还用了 --as user → 必须拦下。
    const denied = await controller.larkGuard.evaluate(call(
      'lark-cli im +messages-send --as user --user-id ou_x --text "测试"',
    ));
    assert.equal(denied?.kind, 'deny');
    assert.match(denied.reason, /cli_lark_identity_1/);

    // 合规写法放行。
    assert.equal(await controller.larkGuard.evaluate(call(
      'lark-cli --profile cli_lark_identity_1 im +messages-send --as bot --text x',
    )), null);

    // 用户自己的会话（不是聊天会话）跑同样的命令，不管。
    assert.equal(await controller.larkGuard.evaluate(call(
      'lark-cli im +messages-send --as user --text x', 'session-user-own',
    )), null);

    // 设置页改成「允许用户身份」后，同一条命令立刻放行（门禁现读运行期策略）。
    const enabled = await controller.endpoints['bot.lark-identity.set']({
      botId: 'bot_lark', value: 'user-allowed', confirm: true,
    });
    assert.equal(enabled.ok, true, JSON.stringify(enabled));
    assert.equal(await controller.larkGuard.evaluate(call(
      'lark-cli --profile cli_lark_identity_1 im +messages-send --as user --text x',
    )), null);

    // 关回 bot-only：再次拦下（不用重启）。
    await controller.endpoints['bot.lark-identity.set']({ botId: 'bot_lark', value: 'bot-only' });
    assert.equal((await controller.larkGuard.evaluate(call(
      'lark-cli --profile cli_lark_identity_1 im +messages-send --as user --text x',
    )))?.kind, 'deny');

    await controller.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});
