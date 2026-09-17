/**
 * 主动投递：目标校验与存储、渠道能力挂载、发送分派。
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createBotSettingsStore } from '../packages/dsh-chat/host/bot-settings.mjs';
import { createDeliveryService, normalizeTarget } from '../packages/dsh-chat/host/delivery.mjs';

const silentLogger = { info() {}, warn() {}, error() {} };

async function makeService() {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-delivery-'));
  const settings = createBotSettingsStore({ dataDir, logger: silentLogger });
  await settings.ready();
  const service = createDeliveryService({ settings, logger: silentLogger });
  return {
    settings,
    service,
    dataDir,
    async cleanup() {
      await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
    },
  };
}

const target = (overrides = {}) => ({
  id: 'tgt_1',
  name: '测试群',
  kind: 'group',
  route: { chatId: 'oc_1' },
  ...overrides,
});

test('目标校验：id/kind/route 逐项把关，坏数据不落盘', () => {
  assert.deepEqual(normalizeTarget(target()), {
    id: 'tgt_1', name: '测试群', kind: 'group', route: { chatId: 'oc_1' },
  });
  assert.throws(() => normalizeTarget(target({ id: '带空格 的' })), /投递目标 id/);
  assert.throws(() => normalizeTarget(target({ kind: 'channel' })), /kind/);
  assert.throws(() => normalizeTarget(target({ route: {} })), /route/);
  assert.throws(() => normalizeTarget(target({ route: { chatId: '' } })), /route\.chatId/);
  assert.throws(() => normalizeTarget(target({ route: { chatId: 'a'.repeat(300) } })), /route\.chatId/);
  assert.throws(() => normalizeTarget(target({ route: { chatId: { nested: 1 } } })), /route\.chatId/);
  assert.throws(() => normalizeTarget(target({ name: 'x'.repeat(200) })), /名称/);
});

test('保存、列出与删除：落进每机器人设置的 deliveryTargets', async () => {
  const app = await makeService();
  try {
    await app.service.save({ channelId: 'feishu', botId: 'bot_1', target: target() });
    const listed = await app.service.list({ channelId: 'feishu', botId: 'bot_1' });
    assert.equal(listed.targets.length, 1);
    assert.equal(listed.targets[0].id, 'tgt_1');
    assert.equal(listed.canSend, false, '还没挂渠道实现');

    const onDisk = app.settings.read('feishu', 'bot_1').deliveryTargets;
    assert.deepEqual(onDisk.tgt_1.route, { chatId: 'oc_1' });

    assert.equal(await app.service.remove({ channelId: 'feishu', botId: 'bot_1', targetId: 'tgt_1' }), true);
    assert.equal(await app.service.remove({ channelId: 'feishu', botId: 'bot_1', targetId: 'tgt_1' }), false);
    assert.equal(app.settings.read('feishu', 'bot_1').deliveryTargets.tgt_1, undefined);
  } finally {
    await app.cleanup();
  }
});

test('坏的历史目标被丢弃，但同表里好条目仍可用', async () => {
  const app = await makeService();
  try {
    await app.settings.write('feishu', 'bot_1', {
      deliveryTargets: {
        good: { name: '好', kind: 'group', route: { chatId: 'oc_ok' } },
        bad: { name: '坏', kind: 'channel', route: {} },
      },
    });
    const listed = await app.service.list({ channelId: 'feishu', botId: 'bot_1' });
    assert.deepEqual(listed.targets.map((item) => item.id), ['good']);
  } finally {
    await app.cleanup();
  }
});

test('渠道挂载：发现候选、发送分派、注销后能力消失', async () => {
  const app = await makeService();
  try {
    const sent = [];
    const release = app.service.attach('feishu', {
      async send({ botId, target: targetValue, text }) {
        sent.push({ botId, target: targetValue, text });
        return { messageId: 'om_sent' };
      },
      async discover({ botId }) {
        return [{
          id: `dm_${botId}`,
          name: '私聊 · ou_x',
          kind: 'direct',
          route: { openId: 'ou_x' },
        }];
      },
    });
    assert.equal(app.service.supports('feishu'), true);

    // 未保存的候选会出现在 list 里，但不能直接 send（避免误发到没确认过的目标）。
    const listed = await app.service.list({ channelId: 'feishu', botId: 'bot_1' });
    assert.equal(listed.canSend, true);
    assert.deepEqual(listed.targets.map((item) => item.id), ['dm_bot_1']);
    assert.equal(listed.targets[0].discovered, true);
    await assert.rejects(
      () => app.service.send({ channelId: 'feishu', botId: 'bot_1', targetId: 'dm_bot_1', text: 'hi' }),
      (error) => error.code === 'chat/unknown-target',
    );

    // 保存后即可发送
    await app.service.save({
      channelId: 'feishu', botId: 'bot_1',
      target: { id: 'dm_bot_1', name: '私聊', kind: 'direct', route: { openId: 'ou_x' } },
    });
    const result = await app.service.send({
      channelId: 'feishu', botId: 'bot_1', targetId: 'dm_bot_1', text: '报表已生成',
    });
    assert.deepEqual(result, { messageId: 'om_sent' });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].botId, 'bot_1');
    assert.deepEqual(sent[0].target.route, { openId: 'ou_x' });
    assert.equal(sent[0].text, '报表已生成');

    // 已保存的目标不再作为候选重复出现
    const after = await app.service.list({ channelId: 'feishu', botId: 'bot_1' });
    assert.equal(after.targets.length, 1);
    assert.equal(after.targets[0].discovered, undefined);

    release();
    assert.equal(app.service.supports('feishu'), false);
    await assert.rejects(
      () => app.service.send({ channelId: 'feishu', botId: 'bot_1', targetId: 'dm_bot_1', text: 'x' }),
      (error) => error.code === 'chat/delivery-unavailable',
    );
  } finally {
    await app.cleanup();
  }
});

test('发送前的兜底：空文本、未知渠道、渠道实现抛错都给出稳定错误码', async () => {
  const app = await makeService();
  try {
    await assert.rejects(
      () => app.service.send({ channelId: 'nope', botId: 'b', targetId: 't', text: 'x' }),
      (error) => error.code === 'chat/delivery-unavailable',
    );

    app.service.attach('weixin', {
      async send() {
        const error = new Error('账号不在线');
        error.code = 'weixin/account-offline';
        throw error;
      },
    });
    await app.service.save({
      channelId: 'weixin', botId: 'wx_1',
      target: { id: 'tgt_wx', kind: 'direct', route: { userId: 'u@im.wechat' } },
    });
    await assert.rejects(
      () => app.service.send({ channelId: 'weixin', botId: 'wx_1', targetId: 'tgt_wx', text: '   ' }),
      (error) => error.code === 'chat/empty-text',
    );
    await assert.rejects(
      () => app.service.send({ channelId: 'weixin', botId: 'wx_1', targetId: 'tgt_wx', text: 'hi' }),
      (error) => error.code === 'weixin/account-offline',
    );
  } finally {
    await app.cleanup();
  }
});
