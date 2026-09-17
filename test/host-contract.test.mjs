/**
 * hub ↔ 渠道 契约的端到端验证。
 *
 * 用假 Cordis ctx 把 hub 与假渠道（dsh-chat-fixture）真正挂起来，走完整的
 * RPC 线路（Request → 路由 → 渠道 endpoints），并验证 hub 侧共享内核
 * （每机器人设置、上下文增强）确实经服务暴露给渠道。
 *
 * 这个文件就是"新增聊天软件只需新增插件包、hub 零改动"的可执行证明。
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { apply as applyFixture } from '../packages/dsh-chat-fixture/host/index.mjs';
import { apply as applyHub } from '../packages/dsh-chat/host/plugin.mjs';

const HUB_PATH = '/api/dsh-chat/control';
const FIXTURE_PATH = '/api/dsh-chat/fixture';

function makeLogger(sink, scope) {
  const logger = (childScope) => makeLogger(sink, childScope);
  for (const level of ['debug', 'info', 'warn', 'error']) {
    logger[level] = (message) => sink.push({ level, scope, message: String(message) });
  }
  return logger;
}

function createFakeCtx() {
  const services = new Map();
  const routes = new Map();
  const effects = [];
  const logs = [];
  const ctx = {
    logger: makeLogger(logs, 'root'),
    provide(serviceName, value) {
      if (services.has(serviceName)) throw new Error(`service "${serviceName}" already registered`);
      services.set(serviceName, value);
      return () => services.delete(serviceName);
    },
    effect(fn) {
      const dispose = fn();
      effects.push(dispose);
      return dispose;
    },
    connection: {
      fetch: {
        register(route) {
          routes.set(route.path, route);
          return () => routes.delete(route.path);
        },
      },
    },
    credentials: {
      resolve: async () => ({ configured: false }),
      describe: async () => ({ configured: false }),
      set: async () => {},
      unset: async () => {},
    },
    // 与真实 Host 一致：hub 声明 inject: ['...','typertGateway']，这里提供最小实现。
    typertGateway: {
      calls: [],
      async invoke(request) {
        this.calls.push(request);
        return { echoed: request };
      },
    },
  };
  return {
    ctx,
    services,
    routes,
    logs,
    /** 逆序释放所有 effect，模拟插件卸载。 */
    disposeAll() {
      for (const dispose of effects.reverse()) {
        if (typeof dispose === 'function') dispose();
      }
    },
  };
}

async function callRoute(routes, path, method, payload) {
  const route = routes.get(path);
  assert.ok(route, `路由 ${path} 未注册`);
  const response = await route.fetch(new Request(`http://127.0.0.1:3080${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'rpc-1',
      method: path.slice('/api/'.length),
      payload: { method, payload },
    }),
  }));
  const body = await response.json();
  assert.equal(body.type, 'server-response');
  assert.equal(body.rpcId, 'rpc-1');
  return { status: response.status, result: body.result };
}

async function waitForStatus(service, id, expected, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const entry = service.channels.list().find((channel) => channel.id === id);
    if (entry?.status === expected) return entry;
    if (Date.now() > deadline) {
      throw new Error(`渠道 ${id} 未在 ${timeoutMs}ms 内达到 ${expected}，当前：${JSON.stringify(service.channels.list())}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** 挂起 hub + 假渠道，并把清理函数交回测试。 */
async function bootstrap() {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-test-'));
  const harness = createFakeCtx();
  applyHub(harness.ctx, { dataDir });
  const service = harness.services.get('dshChat');
  assert.ok(service, 'hub 未发布 dshChat 服务');

  const channelCtx = {
    dshChat: service,
    effect: (fn) => harness.ctx.effect(fn),
  };
  applyFixture(channelCtx);
  await waitForStatus(service, 'fixture', 'running');

  return {
    dataDir,
    service,
    routes: harness.routes,
    logs: harness.logs,
    /** 只释放插件，保留数据目录（用于验证持久化）。 */
    dispose() {
      harness.disposeAll();
    },
    async cleanup() {
      harness.disposeAll();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

test('hub 发布契约版本与控制端点', async () => {
  const app = await bootstrap();
  try {
    assert.equal(app.service.contractVersion, 1);

    const { result } = await callRoute(app.routes, HUB_PATH, 'channel.list', {});
    assert.equal(result.ok, true);
    assert.equal(result.value.contractVersion, 1);
    assert.deepEqual(result.value.channels.map((channel) => channel.id), ['fixture']);
    assert.equal(result.value.channels[0].status, 'running');
  } finally {
    await app.cleanup();
  }
});

test('渠道 endpoints 经 hub 的 RPC 载体可达', async () => {
  const app = await bootstrap();
  try {
    const { result } = await callRoute(app.routes, FIXTURE_PATH, 'echo', { hello: 'world' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.echo, { hello: 'world' });

    const status = await callRoute(app.routes, FIXTURE_PATH, 'connection.status', {});
    assert.equal(status.result.ok, true);
    assert.equal(status.result.value.channel, 'fixture');
    assert.ok(status.result.value.dataDir.endsWith('dsh-fixture') === false);
  } finally {
    await app.cleanup();
  }
});

test('未知方法与畸形请求都被拒绝，且不泄漏堆栈', async () => {
  const app = await bootstrap();
  try {
    const unknown = await callRoute(app.routes, FIXTURE_PATH, 'nope', {});
    assert.equal(unknown.result.ok, false);
    assert.equal(unknown.result.error.code, 'chat/unknown-method');
    assert.deepEqual(unknown.result.error.details, {});

    const route = app.routes.get(FIXTURE_PATH);
    const bad = await route.fetch(new Request(`http://127.0.0.1:3080${FIXTURE_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: 'x' }),
    }));
    assert.equal(bad.status, 200);
    const body = await bad.json();
    assert.equal(body.result.ok, false);
    assert.equal(body.result.error.code, 'chat/bad-request');

    const wrongType = await route.fetch(new Request(`http://127.0.0.1:3080${FIXTURE_PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hi',
    }));
    assert.equal(wrongType.status, 415);

    const notFound = await callRoute(app.routes, HUB_PATH, 'nope', {});
    assert.equal(notFound.result.error.code, 'chat/unknown-method');
  } finally {
    await app.cleanup();
  }
});

test('hub 控制端点：上下文增强读写落盘', async () => {
  const app = await bootstrap();
  try {
    const config = {
      group: { enabled: false, fields: ['senderId'], guidance: '' },
      direct: { enabled: true, fields: ['senderId'], guidance: '私聊全局' },
      targets: [{
        kind: 'user',
        id: 'ou_alice',
        label: '爱丽丝',
        enabled: true,
        fields: ['senderId', 'senderName'],
        guidance: '专属',
        merge: 'append',
      }],
    };
    const saved = await callRoute(app.routes, HUB_PATH, 'bot.context-enhancement.set', {
      channelId: 'fixture',
      botId: 'bot_1',
      config,
    });
    assert.equal(saved.result.ok, true);
    assert.equal(saved.result.value.contextEnhancement.targets[0].id, 'ou_alice');

    const read = await callRoute(app.routes, HUB_PATH, 'bot.settings.get', {
      channelId: 'fixture',
      botId: 'bot_1',
    });
    assert.equal(read.result.value.settings.contextEnhancement.direct.guidance, '私聊全局');

    // 非法配置被拒绝，且不写坏已有内容。
    const rejected = await callRoute(app.routes, HUB_PATH, 'bot.context-enhancement.set', {
      channelId: 'fixture',
      botId: 'bot_1',
      config: { group: {}, direct: {}, targets: [] },
    });
    assert.equal(rejected.result.ok, false);

    // 落盘内容包含 targets（P0 的持久化契约）。
    const onDisk = JSON.parse(await readFile(join(app.dataDir, 'bots.json'), 'utf8'));
    assert.equal(onDisk.channels.fixture.bot_1.contextEnhancement.targets.length, 1);
  } finally {
    await app.cleanup();
  }
});

test('渠道经服务使用 hub 的上下文增强引擎（指定用户 + 叠加）', async () => {
  const app = await bootstrap();
  try {
    const config = {
      group: { enabled: true, fields: ['senderId'], guidance: '群聊全局' },
      direct: { enabled: true, fields: ['senderId'], guidance: '私聊全局' },
      targets: [{
        kind: 'user',
        id: 'ou_alice',
        label: '',
        enabled: true,
        fields: ['senderId'],
        guidance: '专属',
        merge: 'append',
      }],
    };

    const hit = await callRoute(app.routes, FIXTURE_PATH, 'context.resolve', {
      config,
      conversationType: 'direct',
      identity: { senderId: 'ou_alice' },
    });
    assert.equal(hit.result.ok, true);
    assert.equal(hit.result.value.scope.guidance, '专属\n\n私聊全局');
    assert.ok(hit.result.value.text.includes('"senderId":"ou_alice"'));
    assert.ok(hit.result.value.text.includes('专属'));

    const miss = await callRoute(app.routes, FIXTURE_PATH, 'context.resolve', {
      config,
      conversationType: 'group',
      identity: { senderId: 'ou_alice', chatId: 'oc_1' },
    });
    assert.equal(miss.result.value.scope.guidance, '群聊全局');
  } finally {
    await app.cleanup();
  }
});

test('每机器人设置可重复读写（同一目录再次加载保持数据）', async () => {
  const app = await bootstrap();
  const dataDir = app.dataDir;
  try {
    const written = await callRoute(app.routes, FIXTURE_PATH, 'settings.roundtrip', {
      botId: 'bot_9',
      patch: { workspace: '/tmp/ws' },
    });
    assert.equal(written.result.ok, true);
    assert.equal(written.result.value.read.workspace, '/tmp/ws');
  } finally {
    app.dispose();
  }

  const second = createFakeCtx();
  applyHub(second.ctx, { dataDir });
  const service = second.services.get('dshChat');
  await service.ready();
  assert.equal(service.bots.read('fixture', 'bot_9').workspace, '/tmp/ws');
  second.disposeAll();
  await rm(dataDir, { recursive: true, force: true });
});

test('数据目录不存在时首次写入会自行创建（含嵌套路径）', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-chat-test-'));
  const dataDir = join(base, 'nested', 'integrations', 'dsh-chat');
  const harness = createFakeCtx();
  try {
    applyHub(harness.ctx, { dataDir });
    const service = harness.services.get('dshChat');
    await service.bots.write('fixture', 'bot_1', { workspace: '/tmp/ws' });
    const onDisk = JSON.parse(await readFile(join(dataDir, 'bots.json'), 'utf8'));
    assert.equal(onDisk.channels.fixture.bot_1.workspace, '/tmp/ws');
  } finally {
    harness.disposeAll();
    await rm(base, { recursive: true, force: true });
  }
});

test('注销渠道后状态与路由一并消失，且不能重复注册', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-test-'));
  const harness = createFakeCtx();
  try {
    applyHub(harness.ctx, { dataDir });
    const service = harness.services.get('dshChat');
    const channelCtx = { dshChat: service, effect: (fn) => harness.ctx.effect(fn) };

    applyFixture(channelCtx);
    await waitForStatus(service, 'fixture', 'running');

    // 同一渠道 id 再注册一次必须失败（Cordis effect 里抛出会冒到调用方）。
    assert.throws(() => applyFixture(channelCtx), /已注册/);

    const disposers = [];
    const off = service.registerChannel({
      id: 'temp',
      label: '临时',
      order: 1,
      async createChannel() {
        return { async start() {}, async stop() {}, endpoints: {} };
      },
    });
    disposers.push(off);
    await waitForStatus(service, 'temp', 'running');
    assert.ok(harness.routes.has('/api/dsh-chat/temp'));

    off();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(!harness.routes.has('/api/dsh-chat/temp'));
    assert.equal(service.channels.list().some((channel) => channel.id === 'temp'), false);
    off(); // 幂等
  } finally {
    harness.disposeAll();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('契约版本不匹配时渠道启动即失败', async () => {
  const harness = createFakeCtx();
  try {
    applyHub(harness.ctx, { dataDir: await mkdtemp(join(tmpdir(), 'dsh-chat-test-')) });
    const service = harness.services.get('dshChat');
    const fake = { dshChat: { ...service, contractVersion: 99 }, effect: (fn) => harness.ctx.effect(fn) };
    assert.throws(() => applyFixture(fake), /契约 v1/);
  } finally {
    harness.disposeAll();
  }
});

test('渠道 createChannel 抛错时状态为 failed 且 RPC 返回可读错误', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-test-'));
  const harness = createFakeCtx();
  try {
    applyHub(harness.ctx, { dataDir });
    const service = harness.services.get('dshChat');
    service.registerChannel({
      id: 'broken',
      label: '坏渠道',
      order: 5,
      async createChannel() {
        const error = new Error('连接凭据缺失');
        error.code = 'broken/no-credential';
        throw error;
      },
    });
    const entry = await waitForStatus(service, 'broken', 'failed');
    assert.equal(entry.error.code, 'broken/no-credential');

    const { result } = await callRoute(harness.routes, '/api/dsh-chat/broken', 'anything', {});
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'chat/channel-failed');
    assert.equal(result.error.details.channelCode, 'broken/no-credential');
  } finally {
    harness.disposeAll();
    await rm(dataDir, { recursive: true, force: true });
  }
});
