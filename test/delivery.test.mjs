/**
 * 主动投递：目标校验与存储、渠道能力挂载、发送分派。
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createBotSettingsStore } from '../packages/dsh-chat/host/bot-settings.mjs';
import { createDeliveryService, normalizeTarget } from '../packages/dsh-chat/host/delivery.mjs';
import { createSessionStore } from '../packages/dsh-chat/host/session-store.mjs';

const silentLogger = { info() {}, warn() {}, error() {} };

async function makeService({ withSessionStore = false } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-delivery-'));
  const settings = createBotSettingsStore({ dataDir, logger: silentLogger });
  await settings.ready();
  let sessionStore = null;
  if (withSessionStore) {
    sessionStore = createSessionStore({ dataDir, logger: silentLogger });
    await sessionStore.ready();
  }
  const service = createDeliveryService({ settings, sessionStore, logger: silentLogger });
  return {
    settings,
    service,
    sessionStore,
    dataDir,
    async cleanup() {
      await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
    },
  };
}

/** 一个装着真实文件的工作区：用来验证"相对路径按工作区解析"。 */
async function makeWorkspace() {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-chat-ws-'));
  await writeFile(join(dir, '报表.xlsx'), Buffer.alloc(2048, 7));
  await writeFile(join(dir, '图表.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]));
  return dir;
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

test('同一会话的两套 id（旧 tgt_xxx 与渠道 group_xxx）只出现一次', async () => {
  const app = await makeService();
  try {
    // 旧 dsh-im 设置里的目标 id 与渠道现在派生出来的 id 不一样，但路由是同一个群。
    await app.service.save({
      channelId: 'feishu', botId: 'bot_1',
      target: {
        id: 'tgt_d0b1cfe07dc87567',
        name: '项目群',
        kind: 'group',
        route: { chatId: 'oc_5086' },
      },
    });
    app.service.attach('feishu', {
      async send() {
        throw new Error('本用例不该发送');
      },
      async discover() {
        return [
          { id: 'group_oc_5086', kind: 'group', route: { chatId: 'oc_5086' } },
          // 同一个候选重复返回也只算一个。
          { id: 'group_oc_5086_dup', kind: 'group', route: { chatId: 'oc_5086' } },
          { id: 'group_oc_other', kind: 'group', route: { chatId: 'oc_9999' } },
        ];
      },
    });

    const listed = await app.service.list({ channelId: 'feishu', botId: 'bot_1' });
    assert.deepEqual(listed.targets.map((item) => item.id), ['tgt_d0b1cfe07dc87567', 'group_oc_other']);
    assert.equal(listed.targets[0].discovered, undefined);
    assert.equal(listed.targets[1].discovered, true);
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

test('发文件：相对路径按机器人工作区解析；未保存目标不能发', async () => {
  const app = await makeService();
  const workspace = await makeWorkspace();
  try {
    await app.settings.write('feishu', 'bot_1', { workspace });
    const sent = [];
    app.service.attach('feishu', {
      async send() { return { messageId: 'x' }; },
      async sendFile({ botId, target: item, file }) {
        sent.push({ botId, targetId: item.id, ...file });
        return { messageId: 'om_file', name: file.name, size: file.size };
      },
    });

    // 未保存的目标：先拦住（不能临时指定任意会话）
    await assert.rejects(
      () => app.service.sendFile({
        channelId: 'feishu', botId: 'bot_1', targetId: 'ou_1', path: '报表.xlsx',
      }),
      (error) => error.code === 'chat/unknown-target',
    );

    await app.service.save({
      channelId: 'feishu', botId: 'bot_1',
      target: { id: 'ou_1', kind: 'direct', route: { openId: 'ou_1' } },
    });

    const result = await app.service.sendFile({
      channelId: 'feishu', botId: 'bot_1', targetId: 'ou_1', path: '报表.xlsx',
    });
    assert.equal(result.messageId, 'om_file');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].path, join(workspace, '报表.xlsx'));
    assert.equal(sent[0].name, '报表.xlsx');
    assert.equal(sent[0].kind, 'file');
    assert.equal(sent[0].size, 2048, '要带上真实字节数');
  } finally {
    await app.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('发文件：图片按 image 分类、可改名；缺文件/渠道不支持都有稳定错误码', async () => {
  const app = await makeService();
  const workspace = await makeWorkspace();
  try {
    await app.settings.write('feishu', 'bot_1', { workspace });
    const sent = [];
    app.service.attach('feishu', {
      async send() { return {}; },
      async sendFile({ file }) {
        sent.push(file);
        return { messageId: 'm', name: file.name, size: file.size };
      },
    });
    await app.service.save({
      channelId: 'feishu', botId: 'bot_1',
      target: { id: 'ou_1', kind: 'direct', route: { openId: 'ou_1' } },
    });

    const png = await app.service.sendFile({
      channelId: 'feishu', botId: 'bot_1', targetId: 'ou_1',
      path: '图表.png', name: '月度趋势.png',
    });
    assert.equal(png.name, '月度趋势.png');
    assert.equal(sent.at(-1).kind, 'image', '图片要有预览，不能当附件发');

    await assert.rejects(
      () => app.service.sendFile({
        channelId: 'feishu', botId: 'bot_1', targetId: 'ou_1', path: '不存在.xlsx',
      }),
      (error) => {
        assert.equal(error.code, 'chat/file-not-found');
        assert.match(error.message, /找不到文件/);
        return true;
      },
    );

    const empty = join(workspace, '空文件.txt');
    await writeFile(empty, '');
    await assert.rejects(
      () => app.service.sendFile({
        channelId: 'feishu', botId: 'bot_1', targetId: 'ou_1', path: '空文件.txt',
      }),
      (error) => error.code === 'chat/bad-file',
    );

    // 渠道只实现了 send：能力缺席要说清楚，而不是静默失败
    app.service.attach('fixture', { async send() { return {}; } });
    await app.service.save({
      channelId: 'fixture', botId: 'bot_1',
      target: { id: 'ou_2', kind: 'direct', route: { openId: 'ou_2' } },
    });
    await assert.rejects(
      () => app.service.sendFile({
        channelId: 'fixture', botId: 'bot_1', targetId: 'ou_2', path: '报表.xlsx',
      }),
      (error) => error.code === 'chat/delivery-unsupported',
    );
    assert.equal(app.service.supportsFile('fixture'), false);
    assert.equal(app.service.supportsFile('feishu'), true);
  } finally {
    await app.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('候选来自 hub 的持久会话绑定表：重启后渠道运行时是空的，也要有可添加项', async () => {
  const app = await makeService({ withSessionStore: true });
  try {
    await app.sessionStore.bind('feishu', 'bot_1', 'group:oc_1', { sessionId: 'session-a' });
    await app.sessionStore.bind('feishu', 'bot_1', 'p2p:ou_1', { sessionId: 'session-b' });
    // 渠道只提供"会话键 → 目标"的翻译（平台概念留在渠道里），运行时发现为空——正是重启后的样子。
    app.service.attach('feishu', {
      async send() { return { messageId: 'om_1' }; },
      async discover() { return []; },
      targetFromKey(key) {
        const [kind, id] = key.split(':', 2);
        if (!id) return null;
        return kind === 'p2p'
          ? { id: key.replace(/[^A-Za-z0-9_-]/g, '_'), name: `私聊 · ${id}`, kind: 'direct', route: { openId: id } }
          : { id: key.replace(/[^A-Za-z0-9_-]/g, '_'), name: `群聊 · ${id}`, kind: 'group', route: { chatId: id } };
      },
    });

    const listed = await app.service.list({ channelId: 'feishu', botId: 'bot_1' });
    assert.deepEqual(listed.targets.map((item) => item.id), ['group_oc_1', 'p2p_ou_1']);
    assert.ok(listed.targets.every((item) => item.discovered === true), '绑定表来的都是候选，未保存不可发送');

    // 保存其中一个后：它变成已保存目标，不再以候选身份重复出现（按"类型 + 路由"判重）。
    await app.service.save({ channelId: 'feishu', botId: 'bot_1', target: listed.targets[0] });
    const after = await app.service.list({ channelId: 'feishu', botId: 'bot_1' });
    assert.deepEqual(after.targets.map((item) => item.id), ['group_oc_1', 'p2p_ou_1']);
    assert.deepEqual(after.targets.map((item) => Boolean(item.discovered)), [false, true]);
  } finally {
    await app.cleanup();
  }
});

test('目标名称由渠道补充：已保存目标也要补，补不到就保持原名、绝不少列', async () => {
  const app = await makeService();
  try {
    const release = app.service.attach('feishu', {
      async send() { return { messageId: 'om_1' }; },
      async discover() {
        return [{ id: 'group_oc_2', name: '群聊 · oc_2****', kind: 'group', route: { chatId: 'oc_2' } }];
      },
      async decorateTargets({ targets }) {
        return targets.map((target) => (target.route.chatId === 'oc_1'
          ? { ...target, name: '日报临时推送群' }
          : target));
      },
    });
    // oc_1 是已保存但名字还是掩码 id 的历史目标；oc_2 是新候选。
    await app.service.save({
      channelId: 'feishu',
      botId: 'bot_1',
      target: { id: 'group_oc_1', name: '群聊 · oc_1****', kind: 'group', route: { chatId: 'oc_1' } },
    });

    const listed = await app.service.list({ channelId: 'feishu', botId: 'bot_1' });
    assert.deepEqual(listed.targets.map((item) => item.name), ['日报临时推送群', '群聊 · oc_2****']);
    assert.deepEqual(listed.targets.map((item) => item.id), ['group_oc_1', 'group_oc_2'], 'id 不能被改名动到');
    assert.deepEqual(listed.targets[0].route, { chatId: 'oc_1' }, 'route 也不能被改名动到');
    assert.equal(listed.targets[0].discovered, undefined, '已保存目标不该被标成候选');

    // 渠道改名失败（比如没权限）：沿用原名称，目标一个都不能少。
    release();
    app.service.attach('feishu', {
      async send() { return { messageId: 'om_1' }; },
      async discover() { return []; },
      async decorateTargets() { throw new Error('no scope'); },
    });
    const degraded = await app.service.list({ channelId: 'feishu', botId: 'bot_1' });
    assert.deepEqual(degraded.targets.map((item) => item.name), ['群聊 · oc_1****']);
  } finally {
    await app.cleanup();
  }
});
