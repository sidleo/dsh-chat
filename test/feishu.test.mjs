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

function createFakeGateway() {
  const calls = { replies: [], texts: [], cards: [], patches: [], connects: 0, disconnects: 0 };
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
      calls.replies.push({ messageId, text });
      return { messageId: 'om_reply' };
    },
    async sendText({ chatId, text }) {
      calls.texts.push({ chatId, text });
      return { messageId: 'om_sent' };
    },
    async replyCard({ messageId, card }) {
      calls.cards.push({ messageId, card });
      return { messageId: 'om_card' };
    },
    async patchCard({ messageId, card }) {
      calls.patches.push({ messageId, card });
      return { messageId };
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
} = {}) {
  return {
    sender: { sender_id: { open_id: senderId } },
    message: {
      message_id: messageId,
      chat_id: chatId,
      chat_type: chatType,
      message_type: messageType,
      content: messageType === 'text' ? JSON.stringify({ text }) : '{}',
      ...(mentions ? { mentions } : {}),
    },
  };
}

async function makeBridge({
  bot = BOT,
  contextEnhancement = null,
  accessPolicy = null,
  askResult = { text: '最终答案', reason: { kind: 'completed' }, tools: [] },
  onAsk = () => {},
} = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-feishu-'));
  const gateway = createFakeGateway();
  const state = createFeishuStateStore({ path: join(dataDir, 'state.json'), logger: silentLogger });
  await state.load();
  const published = [];
  const deps = {
    channelId: 'feishu',
    dataDir,
    logger: silentLogger,
    ready: async () => {},
    storage: {
      read: () => ({
        workspace: '/ws', contextEnhancement, accessPolicy, model: null, agentPreset: null,
      }),
    },
    contextEnhancement: { captureContextEnhancementSource, enhanceContent },
    guidance: { publish: (sessionId, text) => published.push({ sessionId, text }) },
    sessions: {
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
    accessPolicy: { direct: { mode: 'open' }, group: { mode: 'allowlist' } },
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
    accessPolicy: { direct: { mode: 'allowlist' }, group: { mode: 'allowlist' } },
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

    // 非文本消息给出明确提示。
    await app.bridge.accept(messageEvent({
      messageId: 'om_img', messageType: 'image', text: undefined,
    }));
    assert.match(app.gateway.calls.replies.at(-1).text, /只支持文本消息/);
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
