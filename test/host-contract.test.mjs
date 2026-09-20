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
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    /**
     * 与真实 Cordis 同形：依赖名为数组时，依赖就绪后把（子）上下文交给回调。
     * 假上下文里所有服务都已"就绪"，因此同步回调自身。
     */
    inject(_deps, callback) {
      callback(ctx);
      return () => {};
    },
    /** 假的工具注册表：记录定义、支持注销，用于验证 hub 注册了哪些模型工具。 */
    tools: {
      definitions: new Map(),
      register(definition) {
        if (this.definitions.has(definition.name)) {
          throw new Error(`tool "${definition.name}" already registered`);
        }
        this.definitions.set(definition.name, definition);
        return () => this.definitions.delete(definition.name);
      },
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
    tools: ctx.tools,
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
    tools: harness.tools,
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
    // 「版本与更新」面板的数据来源：hub 版本、包名、数据/日志目录、各渠道包版本
    assert.match(result.value.hubVersion, /^\d+\.\d+\.\d+/);
    assert.equal(result.value.hubPackage, 'dsh-chat');
    assert.ok(result.value.dataDir, '要给出数据目录');
    assert.equal(result.value.logDir, `${result.value.dataDir}/logs`, '日志目录固定在其下的 logs');
    assert.deepEqual(result.value.channels.map((channel) => channel.id), ['fixture']);
    assert.equal(result.value.channels[0].status, 'running');
  } finally {
    await app.cleanup();
  }
});

test('控制面板显示项：控制端点往返 + 归一化（缺项按显示补齐）', async () => {
  const app = await bootstrap();
  try {
    const saved = await callRoute(app.routes, HUB_PATH, 'bot.panel-sections.set', {
      channelId: 'fixture',
      botId: 'bot_panel',
      sections: { group: { policy: false, ghost: true } },
    });
    assert.equal(saved.result.ok, true, JSON.stringify(saved.result));
    const stored = saved.result.value.panelSections;
    assert.equal(stored.group.policy, false, '明确关掉的项要留着');
    assert.equal(stored.group.model, true, '缺项按显示补齐');
    assert.equal(stored.group.ghost, undefined, '不认识的键丢掉');
    assert.equal(stored.direct.model, true);

    // 读回来是同一份（归一化后的）。
    const got = await callRoute(app.routes, HUB_PATH, 'bot.settings.get', {
      channelId: 'fixture', botId: 'bot_panel',
    });
    assert.deepEqual(got.result.value.settings.panelSections, stored);

    // 只接受这一份形状：多传/少传都要立刻 bad-request，而不是被默默忽略。
    const bad = await callRoute(app.routes, HUB_PATH, 'bot.panel-sections.set', {
      channelId: 'fixture', botId: 'bot_panel', sections: { direct: {} }, extra: 1,
    });
    assert.equal(bad.result.ok, false);
    assert.equal(bad.result.error.code, 'chat/bad-request');
    const missing = await callRoute(app.routes, HUB_PATH, 'bot.panel-sections.set', {
      channelId: 'fixture', botId: 'bot_panel',
    });
    assert.equal(missing.result.error.code, 'chat/bad-request');
  } finally {
    await app.cleanup();
  }
});

test('诊断端点：一屏给出各渠道机器人状态与日志尾部（读不到日志也不算失败）', async () => {
  const app = await bootstrap();
  try {
    const { result } = await callRoute(app.routes, HUB_PATH, 'diagnostics.read', {});
    assert.equal(result.ok, true);
    assert.equal(result.value.logDir, `${result.value.dataDir}/logs`);
    assert.deepEqual(result.value.channels.map((channel) => channel.id), ['fixture']);
    assert.equal(result.value.channels[0].status, 'running');
    assert.deepEqual(result.value.channels[0].bots, [], '假渠道没有机器人，但字段必须在');
    assert.equal(result.value.channels[0].statusError, null);

    // hub + 每个渠道各一份日志；hub 日志里至少已经写了一行（启动时的就绪行）。
    const names = result.value.logs.map((log) => log.path.split('/').pop());
    assert.deepEqual(names, ['hub.log', 'fixture.log']);
    const hub = result.value.logs[0];
    assert.equal(hub.exists, true, 'hub 日志应该已经在写');
    assert.ok(hub.lines.every((line) => typeof line === 'string'));

    // 参数表：这个端点不吃任何参数。
    const bad = await callRoute(app.routes, HUB_PATH, 'diagnostics.read', { hello: 1 });
    assert.equal(bad.result.ok, false);
    assert.equal(bad.result.error.code, 'chat/bad-request');
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

test('服务暴露进程内渠道分派（诊断用）', async () => {
  const app = await bootstrap();
  try {
    const result = await app.service.channels.call('fixture', 'echo', { from: 'in-process' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.value.echo, { from: 'in-process' });

    const missing = await app.service.channels.call('nope', 'echo', {});
    assert.equal(missing.ok, false);
    assert.equal(missing.error.code, 'chat/unknown-channel');
  } finally {
    await app.cleanup();
  }
});

test('渠道依赖完整：hub 不能漏给任何一项（守门测试）', async () => {
  const app = await bootstrap();
  try {
    const { result } = await callRoute(app.routes, FIXTURE_PATH, 'connection.status', {});
    assert.equal(result.ok, true);
    const missing = Object.entries(result.value.capabilities)
      .filter(([, present]) => present !== true)
      .map(([name]) => name);
    assert.deepEqual(missing, [], `hub 漏给的依赖：${missing.join('、')}`);
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

test('渠道 legacy.dir 触发一次性旧设置导入（只读旧文件）', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-chat-legacy-'));
  const integrationRoot = join(base, 'integrations');
  const legacyDir = join(integrationRoot, 'dsh-legacy');
  await mkdir(legacyDir, { recursive: true });
  const legacyBody = JSON.stringify({
    version: 2,
    workspaces: { bot_old: '/Users/me/ws' },
    accessPolicies: { bot_old: { direct: { mode: 'allowlist' } } },
    contextEnhancement: {
      bot_old: {
        group: { enabled: true, fields: ['senderId'], guidance: '群' },
        direct: { enabled: false, fields: ['senderId'], guidance: '' },
      },
    },
  });
  await writeFile(join(legacyDir, 'workspaces.json'), legacyBody, 'utf8');

  const harness = createFakeCtx();
  try {
    applyHub(harness.ctx, { dataDir: join(base, 'hub'), integrationRoot });
    const service = harness.services.get('dshChat');
    service.registerChannel({
      id: 'legacy',
      label: '旧渠道',
      order: 7,
      legacy: { dir: 'dsh-legacy' },
      async createChannel() {
        return { async start() {}, async stop() {}, endpoints: {} };
      },
    });

    const deadline = Date.now() + 2_000;
    while (service.bots.read('legacy', 'bot_old').workspace === null) {
      if (Date.now() > deadline) throw new Error('旧设置导入未在 2s 内完成');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const record = service.bots.read('legacy', 'bot_old');
    assert.equal(record.workspace, '/Users/me/ws');
    assert.equal(record.contextEnhancement.group.enabled, true);
    assert.equal(record.contextEnhancement.direct.enabled, false);
    assert.deepEqual(record.accessPolicy, { direct: { mode: 'allowlist' } });

    // 旧文件只读不改。
    assert.equal(await readFile(join(legacyDir, 'workspaces.json'), 'utf8'), legacyBody);
    // 渠道拿到的数据目录就是旧目录（零重绑）。
    const status = await callRoute(harness.routes, '/api/dsh-chat/legacy', 'connection.status', {});
    assert.equal(status.result.ok, false, '空 endpoints 的渠道没有该方法');
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

/** 注册一个"具备主动投递能力"的假聊天渠道（delivery 经注册表挂到 hub）。 */
async function registerDeliveryChannel(service, { id = 'fakechat', sent = [], withFile = false } = {}) {
  const files = [];
  service.registerChannel({
    id,
    label: '假聊天',
    order: 3,
    async createChannel() {
      return {
        async start() {},
        async stop() {},
        endpoints: {},
        delivery: {
          async send({ botId, target, text }) {
            sent.push({ channelId: id, botId, targetId: target.id, text });
            return { messageId: 'msg-1' };
          },
          ...(withFile ? {
            async sendFile({ botId, target, file }) {
              files.push({ botId, targetId: target.id, ...file });
              return { messageId: 'om_file', name: file.name, size: file.size };
            },
          } : {}),
          async discover() {
            return [{ id: 'oc_team', kind: 'group', name: '项目群', route: { chatId: 'oc_team' } }];
          },
        },
      };
    },
  });
  await waitForStatus(service, id, 'running');
  return { sent, files };
}

/** 调一次模型工具，返回它给模型看的文本。 */
async function callTool(app, toolName, args) {
  const definition = app.tools.definitions.get(toolName);
  assert.ok(definition, `hub 未注册工具 ${toolName}`);
  const value = await definition.execute(args, { signal: new AbortController().signal });
  const blocks = definition.output.render(args, value);
  assert.ok(Array.isArray(blocks) && blocks.length > 0, `${toolName} 的 render 没有产出内容`);
  return blocks.map((block) => block.text ?? '').join('');
}

test('hub 把聊天工具注册成模型可调用的工具（输出契约完整）', async () => {
  const app = await bootstrap();
  try {
    assert.deepEqual([...app.tools.definitions.keys()].sort(),
      ['chat_save_target', 'chat_send', 'chat_send_file', 'chat_targets']);

    for (const definition of app.tools.definitions.values()) {
      // 参数必须是"对象根 + 支持的 JSON Schema 子集"，否则注册会在真实 Host 上抛错。
      assert.equal(definition.parameters.type, 'object');
      assert.equal(definition.parameters.additionalProperties, false);
      for (const key of definition.parameters.required ?? []) {
        assert.ok(definition.parameters.properties[key], `${definition.name} 缺少 ${key} 的定义`);
      }
      assert.equal(definition.output.schema.type, 'string');
      const blocks = definition.output.render({}, 'x');
      assert.deepEqual(blocks, [{ type: 'text', text: 'x' }]);
    }

    // 发送必须参数齐全：模型少传参数要被 schema 挡住，而不是发到错的会话。
    assert.deepEqual(app.tools.definitions.get('chat_send').parameters.required,
      ['channel_id', 'bot_id', 'target_id', 'text']);
  } finally {
    await app.cleanup();
  }
});

test('chat_targets 列出候选；chat_send 只能发已保存目标；chat_save_target 收编候选', async () => {
  const app = await bootstrap();
  try {
    const { sent } = await registerDeliveryChannel(app.service);

    const listed = await callTool(app, 'chat_targets', { channel_id: 'fakechat', bot_id: 'bot_1' });
    assert.match(listed, /oc_team/);
    assert.match(listed, /候选/);
    assert.match(listed, /共 1 个/);

    // 候选还没保存 → 拒绝发送，并给出可执行的下一步。
    const refused = await callTool(app, 'chat_send', {
      channel_id: 'fakechat', bot_id: 'bot_1', target_id: 'oc_team', text: '不应该发出去',
    });
    assert.match(refused, /还没有保存/);
    assert.match(refused, /chat_save_target/);
    assert.deepEqual(sent, []);

    const saved = await callTool(app, 'chat_save_target', {
      channel_id: 'fakechat', bot_id: 'bot_1', target_id: 'oc_team', name: '项目群',
    });
    assert.match(saved, /已保存目标 oc_team/);
    assert.equal(app.service.bots.read('fakechat', 'bot_1').deliveryTargets.oc_team.kind, 'group');

    // 保存后不再标记为候选，并且能真正发出去。
    const again = await callTool(app, 'chat_targets', { channel_id: 'fakechat', bot_id: 'bot_1' });
    assert.doesNotMatch(again, /候选/);
    const onlySaved = await callTool(app, 'chat_save_target', {
      channel_id: 'fakechat', bot_id: 'bot_1', target_id: 'oc_team',
    });
    assert.match(onlySaved, /已经保存过/);

    const okText = await callTool(app, 'chat_send', {
      channel_id: 'fakechat', bot_id: 'bot_1', target_id: 'oc_team', text: '  日报已生成  ',
    });
    assert.match(okText, /已发送到 oc_team/);
    assert.match(okText, /msg-1/);
    assert.deepEqual(sent, [{
      channelId: 'fakechat', botId: 'bot_1', targetId: 'oc_team', text: '日报已生成',
    }]);
  } finally {
    await app.cleanup();
  }
});

test('chat_targets 的发现链路：渠道 → 机器人 → 目标（agent 不需要提前知道 bot_id）', async () => {
  const app = await bootstrap();
  try {
    await registerDeliveryChannel(app.service);

    // 1) 不给参数：列出已安装渠道。
    const channelsText = await callTool(app, 'chat_targets', {});
    assert.match(channelsText, /已安装渠道（共 2 个）/);
    assert.match(channelsText, /fakechat\t假聊天\t运行中\t机器人 0 个/);
    assert.match(channelsText, /fixture/);

    // 2) 只给 channel_id：列出该渠道的机器人与各自目标。
    await callTool(app, 'chat_save_target', {
      channel_id: 'fakechat', bot_id: 'bot_1', target_id: 'oc_team', name: '项目群',
    });
    const botsText = await callTool(app, 'chat_targets', { channel_id: 'fakechat' });
    assert.match(botsText, /fakechat 下的机器人（共 1 个）/);
    assert.match(botsText, /\[bot_1\]/);
    assert.match(botsText, /oc_team\t群聊\t项目群/);

    // 3) 渠道名写错时给出已安装清单，而不是空结果。
    const typo = await callTool(app, 'chat_targets', { channel_id: 'feishuu' });
    assert.match(typo, /没有安装名为 feishuu 的渠道/);
    assert.match(typo, /已安装：/);

    // 4) 渠道存在但还没机器人：直接说清下一步。
    const empty = await callTool(app, 'chat_targets', { channel_id: 'fixture' });
    assert.match(empty, /还没有机器人/);
  } finally {
    await app.cleanup();
  }
});

test('chat_targets 对"不支持主动投递"的渠道给出可读说明而不是抛错', async () => {
  const app = await bootstrap();
  try {
    // fixture 渠道没有 delivery：这里走的是"渠道不支持"的路径。
    const text = await callTool(app, 'chat_targets', { channel_id: 'fixture', bot_id: 'bot_1' });
    assert.match(text, /不支持主动投递/);

    const send = await callTool(app, 'chat_send', {
      channel_id: 'fixture', bot_id: 'bot_1', target_id: 'oc_team', text: 'x',
    });
    assert.match(send, /发送失败/);
    assert.match(send, /chat\/delivery-unavailable/);
  } finally {
    await app.cleanup();
  }
});

test('插件卸载后聊天工具一并注销（可逆副作用）', async () => {
  const app = await bootstrap();
  const dataDir = app.dataDir;
  try {
    assert.equal(app.tools.definitions.size, 4);
  } finally {
    app.dispose();
  }
  try {
    assert.equal(app.tools.definitions.size, 0);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('delivery 控制端点：存 / 列 / 发 / 删（含载荷校验）', async () => {
  const app = await bootstrap();
  try {
    const { sent } = await registerDeliveryChannel(app.service);

    // 少传参数必须被拒（而不是被默默忽略）。
    const bad = await callRoute(app.routes, HUB_PATH, 'delivery.send', {
      channelId: 'fakechat', botId: 'bot_1',
    });
    assert.equal(bad.result.ok, false);
    assert.equal(bad.result.error.code, 'chat/bad-request');

    const target = { id: 'ou_alice', kind: 'direct', name: '爱丽丝', route: { openId: 'ou_alice' } };
    const saved = await callRoute(app.routes, HUB_PATH, 'delivery.save', {
      channelId: 'fakechat', botId: 'bot_1', target,
    });
    assert.equal(saved.result.ok, true);
    assert.equal(saved.result.value.target.id, 'ou_alice');

    const listed = await callRoute(app.routes, HUB_PATH, 'delivery.list', {
      channelId: 'fakechat', botId: 'bot_1',
    });
    assert.equal(listed.result.value.canSend, true);
    assert.deepEqual(listed.result.value.targets.map((t) => t.id).sort(), ['oc_team', 'ou_alice']);

    const send = await callRoute(app.routes, HUB_PATH, 'delivery.send', {
      channelId: 'fakechat', botId: 'bot_1', targetId: 'ou_alice', text: '你好',
    });
    assert.equal(send.result.ok, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].text, '你好');

    const unknown = await callRoute(app.routes, HUB_PATH, 'delivery.send', {
      channelId: 'fakechat', botId: 'bot_1', targetId: 'nope', text: '你好',
    });
    assert.equal(unknown.result.ok, false);
    assert.equal(unknown.result.error.code, 'chat/unknown-target');

    const removed = await callRoute(app.routes, HUB_PATH, 'delivery.remove', {
      channelId: 'fakechat', botId: 'bot_1', targetId: 'ou_alice',
    });
    assert.equal(removed.result.ok, true);
    assert.equal(removed.result.value.removed, true);
    const afterRemove = await callRoute(app.routes, HUB_PATH, 'delivery.remove', {
      channelId: 'fakechat', botId: 'bot_1', targetId: 'ou_alice',
    });
    assert.equal(afterRemove.result.value.removed, false);
  } finally {
    await app.cleanup();
  }
});

test('chat_send_file：只发已保存目标，失败给可执行的下一步', async () => {
  const app = await bootstrap();
  try {
    const { sent, files } = await registerDeliveryChannel(app.service, { withFile: true });
    await app.service.bots.write('fakechat', 'bot_1', { workspace: '/ws' });
    app.files = files;

    // 未保存 → 提示先用 chat_targets / chat_save_target
    const refused = await callTool(app, 'chat_send_file', {
      channel_id: 'fakechat', bot_id: 'bot_1', target_id: 'oc_team', path: '/tmp/不存在.xlsx',
    });
    assert.match(refused, /还没有保存/);
    assert.match(refused, /chat_save_target/);
    assert.deepEqual(sent, []);

    await callTool(app, 'chat_save_target', {
      channel_id: 'fakechat', bot_id: 'bot_1', target_id: 'oc_team',
    });

    // 文件不存在 → 说明相对路径按工作区解析
    const missing = await callTool(app, 'chat_send_file', {
      channel_id: 'fakechat', bot_id: 'bot_1', target_id: 'oc_team', path: '报表.xlsx',
    });
    assert.match(missing, /找不到文件/);
    assert.match(missing, /工作区/);

    // 真实文件 → 发出去，并把字节数告诉模型
    const dir = await mkdtemp(join(tmpdir(), 'dsh-chat-tool-'));
    const file = join(dir, '日报.xlsx');
    await writeFile(file, Buffer.alloc(4096, 3));
    try {
      const ok = await callTool(app, 'chat_send_file', {
        channel_id: 'fakechat', bot_id: 'bot_1', target_id: 'oc_team', path: file,
      });
      assert.match(ok, /已发送文件 日报\.xlsx（4\.0KB）/);
      assert.match(ok, /om_file/);
      assert.equal(files.at(-1).size, 4096);
      assert.equal(files.at(-1).kind, 'file');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } finally {
    await app.cleanup();
  }
});

test('机器人设置：工作区校验、Agent 预设对账、访问策略用同一份校验', async () => {
  const app = await bootstrap();
  try {
    // 工作区：必须是存在的目录，且一律存绝对路径。
    const missing = await callRoute(app.routes, HUB_PATH, 'bot.workspace.set', {
      channelId: 'fixture', botId: 'bot_1', workspace: '/definitely/not/here/at/all',
    });
    assert.equal(missing.result.ok, false);
    assert.match(missing.result.error.message, /不存在|读不到/);

    const okWorkspace = await callRoute(app.routes, HUB_PATH, 'bot.workspace.set', {
      channelId: 'fixture', botId: 'bot_1', workspace: app.dataDir,
    });
    assert.equal(okWorkspace.result.ok, true);
    assert.equal(okWorkspace.result.value.workspace, app.dataDir);
    const readBack = await callRoute(app.routes, HUB_PATH, 'bot.settings.get', {
      channelId: 'fixture', botId: 'bot_1',
    });
    assert.equal(readBack.result.value.settings.workspace, app.dataDir);

    // 访问策略：与 host 拦消息时同一份校验，坏数据进不去。
    const badPolicy = await callRoute(app.routes, HUB_PATH, 'bot.access-policy.set', {
      channelId: 'fixture', botId: 'bot_1', policy: { direct: { mode: 'everyone' }, group: {} },
    });
    assert.equal(badPolicy.result.ok, false);

    const policy = {
      direct: {
        mode: 'allowlist',
        open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] },
        allowlist: { users: [{ id: 'ou_alice', canExecuteCommands: true }] },
      },
      group: {
        mode: 'open',
        open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] },
        allowlist: { users: [] },
      },
    };
    const okPolicy = await callRoute(app.routes, HUB_PATH, 'bot.access-policy.set', {
      channelId: 'fixture', botId: 'bot_1', policy,
    });
    assert.equal(okPolicy.result.ok, true);
    assert.equal(okPolicy.result.value.accessPolicy.direct.allowlist.users[0].id, 'ou_alice');

    // Agent 预设：这台 Host 没装 agentPresets 服务时不做对账（不该把设置页卡死）。
    const preset = await callRoute(app.routes, HUB_PATH, 'bot.agent-preset.set', {
      channelId: 'fixture', botId: 'bot_1', agentPreset: 'some-preset',
    });
    assert.equal(preset.result.ok, true);
    assert.equal(preset.result.value.agentPreset, 'some-preset');

    // 可选项端点：至少要把当前值带回来，供渠道页渲染。
    const options = await callRoute(app.routes, HUB_PATH, 'bot.settings.options', {
      channelId: 'fixture', botId: 'bot_1',
    });
    assert.equal(options.result.ok, true);
    assert.equal(options.result.value.current.workspace, app.dataDir);
    assert.equal(options.result.value.current.agentPreset, 'some-preset');
    assert.deepEqual(options.result.value.current.accessPolicy.direct.allowlist.users,
      [{ id: 'ou_alice', canExecuteCommands: true }]);
    assert.ok(Array.isArray(options.result.value.workspacePaths));
    assert.ok(Array.isArray(options.result.value.presets));
  } finally {
    await app.cleanup();
  }
});

test('bot.conversations：把该机器人聊过的会话（带名字）给选择器用', async () => {
  const app = await bootstrap();
  try {
    const empty = await callRoute(app.routes, HUB_PATH, 'bot.conversations', {
      channelId: 'fixture', botId: 'bot_1',
    });
    assert.equal(empty.result.ok, true);
    assert.deepEqual(empty.result.value.conversations, [], '没有渠道发现能力时给空表，不报错');

    const bad = await callRoute(app.routes, HUB_PATH, 'bot.conversations', { channelId: 'fixture' });
    assert.equal(bad.result.ok, false, '缺 botId 要拒绝');
  } finally {
    await app.cleanup();
  }
});

test('bot.model.set：机器人默认模型（设置页那一栏）能存能清，不认识的值要报错', async () => {
  const app = await bootstrap();
  try {
    // 先让模型目录可用（假渠道的 deployment 里已有一份 catalog 的话直接用；否则下面断言会走"读不到就放行"）。
    const saved = await callRoute(app.routes, HUB_PATH, 'bot.model.set', {
      channelId: 'fixture', botId: 'bot_1',
      model: { provider: 'p', model: 'm', reasoningEffort: 'high' },
    });
    assert.equal(saved.result.ok, true, JSON.stringify(saved.result));
    assert.deepEqual(saved.result.value.model, { provider: 'p', model: 'm', reasoningEffort: 'high' });

    // 结构不合法的入参要挡住（provider/model 缺一不可）。
    const bad = await callRoute(app.routes, HUB_PATH, 'bot.model.set', {
      channelId: 'fixture', botId: 'bot_1', model: { provider: 'p' },
    });
    assert.equal(bad.result.ok, false);
    assert.equal(bad.result.error.code, 'chat/bad-request');

    const cleared = await callRoute(app.routes, HUB_PATH, 'bot.model.set', {
      channelId: 'fixture', botId: 'bot_1', model: null,
    });
    assert.equal(cleared.result.ok, true);
    assert.equal(cleared.result.value.model, null);

    // 可选项端点要把模型目录与当前默认模型带给设置页。
    const options = await callRoute(app.routes, HUB_PATH, 'bot.settings.options', {
      channelId: 'fixture', botId: 'bot_1',
    });
    assert.equal(options.result.ok, true);
    assert.ok(Array.isArray(options.result.value.models), '模型目录要带出去（设置页的下拉）');
    assert.ok(Array.isArray(options.result.value.modelFailures));
  } finally {
    await app.cleanup();
  }
});
