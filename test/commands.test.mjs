/**
 * 机器人命令内核：解析、权限、内置命令行为，以及渠道侧的分发。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import * as accessPolicy from '../packages/dsh-chat/shared/access-policy.mjs';
import { captureContextEnhancementSource, enhanceContent } from '../packages/dsh-chat/shared/context-enhancement.mjs';
import {
  createCommandRegistry,
  registerBuiltinCommands,
} from '../packages/dsh-chat/host/commands.mjs';
import { createFeishuBridge } from '../packages/dsh-chat-feishu/host/bridge.mjs';
import { createFeishuStateStore } from '../packages/dsh-chat-feishu/host/state-store.mjs';
import { createWeixinRuntime } from '../packages/dsh-chat-weixin/host/runtime.mjs';
import { createWeixinStateStore } from '../packages/dsh-chat-weixin/host/state-store.mjs';
import { createJsonStore } from '../packages/dsh-chat/host/json-store.mjs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const silentLogger = { info() {}, warn() {}, error() {} };

/** 真形状：provider 在 `group.id`；effort 的展示名是 `name`。 */
const MODEL_CATALOG = {
  default: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
  routableProviders: ['opencode-go'],
  groups: [{
    id: 'opencode-go',
    name: 'OpenCode Go',
    models: [
      {
        id: 'deepseek-v4.1-flash',
        name: 'DeepSeek V4.1 Flash',
        reasoning: { defaultEffort: 'high', efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }] },
      },
      { id: 'glm-5.3-flash', name: 'GLM 5.3 Flash' },
    ],
  }],
};

const PRESETS = {
  presets: [
    { id: 'standard', isDefault: true, name: 'Standard' },
    { id: 'ptc', isDefault: false },
  ],
};

function createServices({
  bound = true,
  presets = PRESETS,
  record = { workspace: '/ws', agentPreset: 'ptc' },
  runCommandResult = { matched: true, kind: 'success', text: 'Compaction finished.' },
  historyMessages = [
    { role: 'user', text: '帮我看看昨天的销售' },
    { role: 'assistant', text: '昨天销售额 1234 万。' },
  ],
  /** true：`session/list` 抛错（DSH 侧不可用）——读失败不能说成"你从没选过模型"。 */
  listFailing = false,
  /** true：`sessionExists` 抛错（不是"会话不存在"）。 */
  sessionExistsFailing = false,
} = {}) {
  const calls = {
    reset: [], cancel: [], selectModel: [], bind: [], writes: [], runCommand: [], history: [],
  };
  const sessions = {
    async invoke(namespace, method, args) {
      if (method === 'modelCatalog') return MODEL_CATALOG;
      if (method === 'list') {
        if (listFailing) throw new Error('session service down');
        return {
          items: [{
            sessionId: 'session-1',
            running: true,
            projections: {
              values: {
                // 真形状：next = pending ?? lastUsed；桩里让两者不同，读错字段就会被测出来。
                modelSelection: {
                  lastUsed: { provider: 'anthropic', model: 'claude-x' },
                  next: { provider: 'opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' },
                },
              },
            },
          }],
        };
      }
      if (method === 'selectModel') {
        calls.selectModel.push(args.request);
        return { selected: args.request };
      }
      throw new Error(`未预期的调用 ${namespace}/${method}`);
    },
    async isRunning() {
      return true;
    },
    async sessionExists(id) {
      if (sessionExistsFailing) throw new Error('gateway timeout');
      return id === 'session-1';
    },
    async reset(options) {
      calls.reset.push(options);
    },
    async cancel(options) {
      calls.cancel.push(options);
      return { accepted: true };
    },
    async runCommand(options) {
      calls.runCommand.push(options);
      return runCommandResult;
    },
    async history(options) {
      calls.history.push(options);
      return { sessionId: 'session-1', messages: historyMessages };
    },
    bindings: {
      get: (channelId, botId, key) => (bound && key === 'p2p:bound' ? { sessionId: 'session-1' } : undefined),
      async bind(...args) {
        calls.bind.push(args);
      },
    },
  };
  const bots = {
    read: () => ({ ...record }),
    async write(channelId, botId, patch) {
      calls.writes.push({ channelId, botId, patch });
      Object.assign(record, patch);
      return record;
    },
  };
  return {
    calls,
    services: {
      sessions,
      bots,
      channels: { list: () => [{ id: 'feishu', label: '飞书', status: 'running' }] },
      agentPresets: presets && {
        async remoteExportList() {
          return presets;
        },
      },
    },
  };
}

function createRegistry(services, logger = silentLogger) {
  const registry = createCommandRegistry({ logger, services });
  registerBuiltinCommands(registry, { hubVersion: '9.9.9' });
  return registry;
}

const context = (text, overrides = {}) => ({
  text,
  channelId: 'feishu',
  botId: 'bot_1',
  key: 'p2p:bound',
  conversationType: 'direct',
  senderId: 'ou_owner',
  botLabel: '测试机器人',
  channelLabel: '飞书',
  ...overrides,
});

test('内核：非命令文本不处理；未知命令给提示；别名可用', async () => {
  const { services } = createServices();
  const registry = createRegistry(services);

  assert.deepEqual(await registry.handle(context('你好')), { handled: false });

  const unknown = await registry.handle(context('/nope'));
  assert.equal(unknown.handled, true);
  assert.match(unknown.reply, /未知命令/);

  const alias = await registry.handle(context('/h'));
  assert.match(alias.reply, /可用命令/);
});

test('内核：命令执行抛错时回可读文案，不影响后续', async () => {
  const { services } = createServices();
  const registry = createCommandRegistry({ logger: silentLogger, services });
  registry.register({
    name: 'boom',
    summary: '',
    execute: () => {
      throw new Error('炸了');
    },
  });
  const result = await registry.handle(context('/boom'));
  assert.equal(result.handled, true);
  assert.match(result.reply, /命令执行失败：炸了/);
});

test('内核：scope 限制生效', async () => {
  const { services } = createServices();
  const registry = createCommandRegistry({ logger: silentLogger, services });
  registry.register({ name: 'directonly', summary: '', scope: 'direct', execute: () => 'ok' });
  assert.equal((await registry.handle(context('/directonly'))).reply, 'ok');
  const group = await registry.handle(context('/directonly', { conversationType: 'group' }));
  assert.match(group.reply, /不能在当前会话类型下使用/);
});

test('/version 与 /help 输出', async () => {
  const { services } = createServices();
  const registry = createRegistry(services);
  assert.equal((await registry.handle(context('/version'))).reply, 'dsh-chat 9.9.9（渠道契约 v1）');
  const help = (await registry.handle(context('/help'))).reply;
  assert.ok(help.includes('/new'));
  assert.ok(help.includes('/model'));
});

test('/status 汇总渠道、会话、工作区与设置', async () => {
  const { services } = createServices();
  const registry = createRegistry(services);
  const reply = (await registry.handle(context('/status'))).reply;
  assert.match(reply, /渠道：飞书（running）/);
  assert.match(reply, /会话：session-1/);
  assert.match(reply, /运行中：是/);
  assert.match(reply, /工作区：\/ws/);
  assert.match(reply, /Agent Preset：ptc/);
});

test('/new 与 /stop 调用会话桥', async () => {
  const { services, calls } = createServices();
  const registry = createRegistry(services);

  assert.match((await registry.handle(context('/new'))).reply, /已解除当前会话绑定/);
  assert.equal(calls.reset.length, 1);
  assert.deepEqual(calls.reset[0], { channelId: 'feishu', botId: 'bot_1', key: 'p2p:bound' });

  assert.match((await registry.handle(context('/stop'))).reply, /已请求停止/);
  assert.equal(calls.cancel.length, 1);
});

test('/stop 在没有会话时给出提示', async () => {
  const { services, calls } = createServices({ bound: false });
  const registry = createRegistry(services);
  assert.match((await registry.handle(context('/stop'))).reply, /还没有绑定会话/);
  assert.equal(calls.cancel.length, 0);
});

test('/session 查看与切换绑定', async () => {
  const { services, calls } = createServices();
  const registry = createRegistry(services);

  const current = (await registry.handle(context('/session'))).reply;
  assert.match(current, /当前会话：session-1（运行中）/);

  const missing = (await registry.handle(context('/session nope'))).reply;
  assert.match(missing, /找不到会话/);

  const switched = (await registry.handle(context('/session session-1'))).reply;
  assert.match(switched, /已切换到会话 session-1/);
  assert.equal(calls.bind.length, 1);
});

test('/models 与 /model：按序号选择模型并带推理等级', async () => {
  const { services, calls } = createServices();
  const registry = createRegistry(services);

  const models = (await registry.handle(context('/models'))).reply;
  assert.match(models, /1\. opencode-go\/deepseek-v4\.1-flash/);
  assert.match(models, /2\. opencode-go\/glm-5\.3-flash/);

  const selected = (await registry.handle(context('/model 2'))).reply;
  assert.match(selected, /已切换为 opencode-go\/glm-5\.3-flash/);
  assert.deepEqual(calls.selectModel.at(-1), {
    sessionId: 'session-1', provider: 'opencode-go', model: 'glm-5.3-flash',
  });

  const withEffort = (await registry.handle(context('/model opencode-go/deepseek-v4.1-flash low'))).reply;
  assert.match(withEffort, /推理等级 low/);
  assert.equal(calls.selectModel.at(-1).reasoningEffort, 'low');

  const badEffort = (await registry.handle(context('/model 1 nope'))).reply;
  assert.match(badEffort, /不支持推理等级/);
});

test('/model 在无会话时提示先发消息', async () => {
  const { services } = createServices({ bound: false });
  const registry = createRegistry(services);
  assert.match((await registry.handle(context('/model'))).reply, /还没有会话/);
  assert.match((await registry.handle(context('/model 1'))).reply, /还没有会话/);
});

test('/reasonings 与 /reasoning 切换与恢复默认', async () => {
  const { services, calls } = createServices();
  const registry = createRegistry(services);

  const list = (await registry.handle(context('/reasonings'))).reply;
  assert.match(list, /推理等级/);
  assert.match(list, /默认：high/);

  const set = (await registry.handle(context('/reasoning 1'))).reply;
  assert.match(set, /已切换推理等级为 low/);
  assert.equal(calls.selectModel.at(-1).reasoningEffort, 'low');

  const reset = (await registry.handle(context('/reasoning --default'))).reply;
  assert.match(reset, /已恢复/);
  assert.equal(calls.selectModel.at(-1).reasoningEffort, undefined);
});

test('/presets 与 /preset：写入机器人设置并提示需 /new', async () => {
  const { services, calls } = createServices();
  const registry = createRegistry(services);

  const list = (await registry.handle(context('/presets'))).reply;
  assert.match(list, /1\. standard（Host 默认）/);
  assert.match(list, /2\. ptc（当前机器人）/);

  const set = (await registry.handle(context('/preset 1'))).reply;
  assert.match(set, /已设置 Agent Preset 为 standard/);
  assert.match(set, /需要先发送 \/new/);
  assert.deepEqual(calls.writes.at(-1).patch, { agentPreset: 'standard' });

  const cleared = (await registry.handle(context('/preset --default'))).reply;
  assert.match(cleared, /跟随 Host 默认/);
  assert.deepEqual(calls.writes.at(-1).patch, { agentPreset: null });
});

test('未安装 Agent Preset 服务时给出可读提示，而不是崩掉', async () => {
  const { services } = createServices({ presets: null });
  const registry = createRegistry(services);
  assert.match((await registry.handle(context('/presets'))).reply, /不支持读取 Agent Preset/);
  assert.match((await registry.handle(context('/preset 1'))).reply, /不支持设置 Agent Preset/);
});

/** 渠道侧分发：命令不进模型。 */
test('飞书：命令不进会话，直接回复命令结果', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-cmd-feishu-'));
  try {
    const state = createFeishuStateStore({ path: join(dataDir, 'state.json'), logger: silentLogger });
    await state.load();
    const replies = [];
    let asked = 0;
    const commands = createRegistry(createServices().services);
    const bridge = createFeishuBridge({
      bot: {
        id: 'bot_1', ownerOpenIds: ['ou_owner'], botOpenId: 'ou_bot',
        groupResponseMode: 'mention', stepPushDirect: 'off', stepPushGroup: 'off',
      },
      deps: {
        channelId: 'feishu',
        logger: silentLogger,
        ready: async () => {},
        commands: { handle: (options) => commands.handle(options) },
        storage: { read: () => ({ workspace: '/ws', contextEnhancement: null, accessPolicy: null }) },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
        accessPolicy,
        sessions: {
          async ask() {
            asked += 1;
            return { text: '模型答案', reason: { kind: 'completed' } };
          },
          bindings: { adopt: async () => 0 },
        },
      },
      gateway: {
        async replyText({ text }) {
          replies.push(text);
          return { messageId: 'om_1' };
        },
      },
      state,
      logger: silentLogger,
    });

    await bridge.accept({
      sender: { sender_id: { open_id: 'ou_owner' } },
      message: {
        message_id: 'om_cmd',
        chat_id: 'oc_chat',
        chat_type: 'p2p',
        message_type: 'text',
        content: JSON.stringify({ text: '/version' }),
      },
    });
    assert.equal(asked, 0, '命令不能进入模型');
    assert.match(replies.at(-1), /dsh-chat 9\.9\.9/);

    await bridge.accept({
      sender: { sender_id: { open_id: 'ou_owner' } },
      message: {
        message_id: 'om_plain',
        chat_id: 'oc_chat',
        chat_type: 'p2p',
        message_type: 'text',
        content: JSON.stringify({ text: '你好' }),
      },
    });
    assert.equal(asked, 1, '普通消息照常进入会话');
    assert.equal(replies.at(-1), '模型答案');
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('微信：命令不进会话，直接分段回复命令结果', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-cmd-weixin-'));
  try {
    const state = createWeixinStateStore({ path: join(dataDir, 'state.json'), createJsonStore });
    await state.ready();
    const texts = [];
    let asked = 0;
    const commands = createRegistry(createServices().services);
    const runtime = createWeixinRuntime({
      account: {
        botId: 'wx_1', accountId: 'acc@im.bot', tokenRef: 'REF',
        ownerUserId: 'u@im.wechat', baseUrl: 'https://ilinkai.weixin.qq.com/',
      },
      token: 'tok',
      deps: {
        channelId: 'weixin',
        logger: silentLogger,
        ready: async () => {},
        createJsonStore,
        commands: { handle: (options) => commands.handle(options) },
        storage: { read: () => ({ workspace: '/ws', contextEnhancement: null, accessPolicy: null }) },
        contextEnhancement: { captureContextEnhancementSource, enhanceContent },
        accessPolicy,
        sessions: {
          async ask() {
            asked += 1;
            return { text: '模型答案', reason: { kind: 'completed' } };
          },
          bindings: { adopt: async () => 0 },
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
      logger: silentLogger,
    });

    const message = (text, id) => ({
      message_id: id,
      from_user_id: 'u@im.wechat',
      message_type: 1,
      context_token: 'ctx',
      item_list: [{ type: 1, text_item: { text } }],
    });

    await runtime.accept(message('/version', 'm1'), new AbortController().signal);
    assert.equal(asked, 0);
    assert.match(texts.at(-1), /dsh-chat 9\.9\.9/);

    await runtime.accept(message('你好', 'm2'), new AbortController().signal);
    assert.equal(asked, 1);
    assert.equal(texts.at(-1), '模型答案');
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('/compact：走 DSH 的 commands 服务，不经过模型；成功/失败/未注册分别给可读回复', async () => {
  const okServices = createServices();
  const ok = createRegistry(okServices.services);
  assert.equal(
    await ok.handle(context('/compact')).then((result) => result.reply),
    '✅ 上下文已压缩。\nCompaction finished.',
  );
  assert.equal(okServices.calls.runCommand[0].line, '/compact');
  assert.equal(okServices.calls.runCommand[0].key, 'p2p:bound');

  const failed = createRegistry(createServices({
    runCommandResult: { matched: true, kind: 'error', text: 'Compaction cancelled.' },
  }).services);
  assert.match(await failed.handle(context('/compact')).then((r) => r.reply), /⚠️ 压缩未完成：Compaction cancelled\./);

  const missing = createRegistry(createServices({ runCommandResult: { matched: false } }).services);
  assert.match(await missing.handle(context('/compact')).then((r) => r.reply), /没有注册 \/compact 命令/);

  // 没有绑定会话时给出可读提示（不抛）
  const unbound = createRegistry(createServices().services);
  assert.match(await unbound.handle(context('/compact', { key: 'p2p:other' })).then((r) => r.reply), /还没有会话/);
});

test('/history：按轮数回看最近对话，条数与截断都有上限', async () => {
  const { services, calls } = createServices({
    historyMessages: [
      { role: 'user', text: '第一轮问题' },
      { role: 'assistant', text: '第一轮回答' },
      { role: 'user', text: 'x'.repeat(400) },
      { role: 'assistant', text: '最后一条回答' },
    ],
  });
  const registry = createRegistry(services);

  const reply = await registry.handle(context('/history')).then((result) => result.reply);
  assert.match(reply, /最近 2 轮/);
  assert.match(reply, /1\. 你：第一轮问题/);
  assert.match(reply, / {3}bot：第一轮回答/);
  assert.match(reply, /2\. 你：x+…/, '长消息要截断');
  assert.match(reply, /最后一条回答/);
  assert.ok(!reply.includes('x'.repeat(200)), '截断后不该出现整段长文');
  assert.equal(calls.history[0].maxMessages, 12, '默认 5 轮 → 多取两条兜底');

  // 轮数上限 20：/history 99 也只取 20 轮
  const many = createServices();
  await createRegistry(many.services).handle(context('/history 99'));
  assert.equal(many.calls.history[0].maxMessages, 42, '20 轮 → 42 条上限');

  // 指定轮数：/history 2 → 2 轮
  const some = createServices();
  await createRegistry(some.services).handle(context('/history 2'));
  assert.equal(some.calls.history[0].maxMessages, 6);
});

test('/history：没有历史时说清楚；/help 里能看到新命令', async () => {
  const { services } = createServices({ historyMessages: [] });
  const registry = createRegistry(services);
  assert.match(await registry.handle(context('/history')).then((r) => r.reply), /还没有对话历史/);

  const help = await registry.handle(context('/help')).then((result) => result.reply);
  assert.match(help, /\/compact — 压缩当前会话的上下文/);
  assert.match(help, /\/history \[轮数\] — 回看最近几轮对话/);
});

test('访问策略自助：/whoami 说明判定，/allow 与 /deny 只有属主能改', async () => {
  const { services, calls } = createServices();
  const registry = createCommandRegistry({ logger: silentLogger, services });
  registerBuiltinCommands(registry);

  // 非属主：能看自己的身份与判定，但不能改名单。
  const guest = await registry.handle(context('/whoami', { senderId: 'ou_guest' }));
  assert.match(guest.reply, /ou_guest/);
  assert.match(guest.reply, /是否属主：否/);

  const refused = await registry.handle(context('/allow ou_guest', { senderId: 'ou_guest' }));
  assert.match(refused.reply, /只有属主/);
  assert.equal(calls.writes.length, 0, '非属主不能写策略');

  // 属主：加人进当前会话类型（私聊）的名单，并保留完整的策略形状。
  const added = await registry.handle(context('/allow ou_alice', { isOwner: true }));
  assert.match(added.reply, /已把 ou_alice 加入私聊名单/);
  const patch = calls.writes.at(-1).patch.accessPolicy;
  assert.deepEqual(patch.direct.allowlist.users, [{ id: 'ou_alice', canExecuteCommands: false }]);
  // 层结构：global 必在（保存路径要求完整策略）；group 可以继承它。
  assert.equal(patch.global.mode, 'allowlist', '全局层要在（保存路径要求完整策略）');
  assert.equal(accessPolicy.scopeFor(patch, 'group').mode, 'allowlist', '另一个作用域的生效值与原来一致');

  // 带 --commands：允许执行命令。
  await registry.handle(context('/allow ou_bob --commands', { isOwner: true }));
  const second = calls.writes.at(-1).patch.accessPolicy;
  assert.deepEqual(second.direct.allowlist.users.map((user) => [user.id, user.canExecuteCommands]),
    [['ou_alice', false], ['ou_bob', true]]);

  // 不带参数：列名单。
  const listed = await registry.handle(context('/allow', { isOwner: true }));
  assert.match(listed.reply, /ou_alice/);
  assert.match(listed.reply, /ou_bob（可执行命令）/);

  // 群聊作用域独立：群里的授权不会写进私聊名单。
  await registry.handle(context('/allow oc_group_user', { isOwner: true, conversationType: 'group' }));
  const groupPatch = calls.writes.at(-1).patch.accessPolicy;
  assert.deepEqual(groupPatch.group.allowlist.users, [{ id: 'oc_group_user', canExecuteCommands: false }]);
  assert.deepEqual(groupPatch.direct.allowlist.users.map((user) => user.id), ['ou_alice', 'ou_bob']);

  // 移除：名单与 open 例外一起清掉。
  const removed = await registry.handle(context('/deny ou_bob', { isOwner: true }));
  assert.match(removed.reply, /已把 ou_bob 移出私聊名单/);
  assert.deepEqual(calls.writes.at(-1).patch.accessPolicy.direct.allowlist.users.map((user) => user.id),
    ['ou_alice']);

  const noop = await registry.handle(context('/deny ou_not_there', { isOwner: true }));
  assert.match(noop.reply, /本来就不在/);
});

test('菜单：/menu 列出当前会话可用的命令，属主专属的只给属主看', async () => {
  const { services } = createServices();
  const registry = createCommandRegistry({ logger: silentLogger, services });
  registerBuiltinCommands(registry, { listCommands: () => registry.list() });

  const guest = await registry.handle(context('/menu', { isOwner: false }));
  assert.ok(Array.isArray(guest.menu) && guest.menu.length > 0, '要给出可点的菜单项');
  const names = guest.menu.map((item) => item.command);
  assert.ok(names.includes('/status'));
  assert.ok(!names.includes('/menu'), '菜单里不该再有菜单');
  assert.ok(!names.includes('/allow'), '非属主不该看到属主专属命令');
  assert.match(guest.reply, /可用命令/, '没有卡片能力的渠道用这个文本兜底');

  const owner = await registry.handle(context('/menu', { isOwner: true }));
  assert.ok(owner.menu.map((item) => item.command).includes('/allow'), '属主能看到 /allow');

  // 命令按钮里带的就是命令行，点它等价于手打这条命令。
  for (const item of owner.menu) {
    assert.match(item.command, /^\/[a-z][a-z0-9-]*$/u);
    assert.equal(item.label, item.command);
  }
});

test('菜单：/menu（及短写 /m）带上控制面板状态，卡片据此渲染下拉', async () => {
  const { services } = createServices();
  const readCalls = [];
  const withPanel = {
    ...services,
    panel: {
      async read(options) {
        readCalls.push(options);
        return {
          bound: true,
          sessionId: 'session-1',
          model: { current: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' }, options: [], efforts: [] },
          preset: { current: 'ptc', options: [] },
          workspace: { current: '/ws', options: ['/ws'] },
        };
      },
    },
  };
  const registry = createCommandRegistry({ logger: silentLogger, services: withPanel });
  registerBuiltinCommands(registry, { listCommands: () => registry.list() });

  const result = await registry.handle(context('/menu', { isOwner: true }));
  assert.ok(result.panel, '要把面板状态带给渠道');
  assert.equal(result.panel.workspace.current, '/ws');
  // 工作区候选只给属主——群里的卡片所有人都能展开（这条也是"谁在读"传下去的证据）。
  assert.deepEqual(readCalls, [{
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:bound', isOwner: true,
    // 会话类型必须传下去：漏了「本会话的访问策略」会在卡上静默消失（真机出现过）。
    conversationType: 'direct',
  }]);

  const guestMenu = await registry.handle(context('/menu', { isOwner: false }));
  assert.deepEqual(readCalls.at(-1), {
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:bound', isOwner: false,
    conversationType: 'direct',
  }, '非属主要如实传 false，由 hub 决定不给工作区候选');
  assert.ok(result.menu.length > 0, '命令清单仍然带着（卡片里作为子入口）');
  assert.match(result.reply, /可用命令/, '文本兜底仍要在（微信没有卡片）');

  // 短写 /m 等价。
  const short = await registry.handle(context('/m', { isOwner: true }));
  assert.ok(short.panel, '/m 与 /menu 同一条命令');
  assert.equal(short.menu.length, result.menu.length);

  // 没有面板能力时（旧部署/测试桩）不报错：退回纯命令清单。
  const plain = createCommandRegistry({ logger: silentLogger, services });
  registerBuiltinCommands(plain, { listCommands: () => plain.list() });
  const fallback = await plain.handle(context('/menu', { isOwner: true }));
  assert.equal(fallback.panel, undefined);
  assert.ok(fallback.menu.length > 0);
});

test('读不到会话状态时说"读不到"，不能说成"你从没选过模型"或"找不到会话"', async () => {
  // 读失败与"没有显式选择"是两回事：混为一谈就是一句与事实相反的话，日志里还没线索。
  const warns = [];
  const readFailing = createServices({ listFailing: true });
  const failing = createRegistry(readFailing.services, { ...silentLogger, warn: (line) => warns.push(line) });

  const model = await failing.handle(context('/model'));
  assert.match(model.reply, /读不到当前会话的模型选择/);
  assert.doesNotMatch(model.reply, /没有显式选择模型/);

  const reasoning = await failing.handle(context('/reasoning'));
  assert.match(reasoning.reply, /读不到当前会话的模型选择/);

  const setReasoning = await failing.handle(context('/reasoning high'));
  assert.match(setReasoning.reply, /读不到当前会话的模型选择/);

  assert.equal(warns.filter((line) => /读取会话模型选择失败/.test(line)).length, 3, '三次读失败都要留痕');

  // `sessionExists` 抛错 ≠ 会话不存在。
  const checkFailing = createServices({ sessionExistsFailing: true });
  const checked = createRegistry(checkFailing.services, { ...silentLogger, warn: (line) => warns.push(line) });
  const session = await checked.handle(context('/session session-9'));
  assert.match(session.reply, /校验会话失败/);
  assert.doesNotMatch(session.reply, /找不到会话/);
  assert.equal(checkFailing.calls.bind.length, 0, '校验没过就不该绑定');
});

test('没有会话时 /model 与 /reasoning 改的是机器人默认模型（只限属主）', async () => {
  const { services, calls } = createServices({ bound: false });
  const registry = createRegistry(services);

  // 还没设过：如实说明，并给出怎么设。
  const before = await registry.handle(context('/model', { isOwner: true }));
  assert.match(before.reply, /还没设过机器人默认模型/);

  const model = await registry.handle(context('/model opencode-go/deepseek-v4.1-flash', { isOwner: true }));
  assert.match(model.reply, /机器人默认模型已设为 opencode-go\/deepseek-v4.1-flash/);
  assert.match(model.reply, /下一条消息新建的会话/);
  assert.deepEqual(calls.writes.at(-1)?.patch, {
    model: { provider: 'opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: null },
  });

  const effort = await registry.handle(context('/reasoning high', { isOwner: true }));
  assert.match(effort.reply, /机器人默认推理等级已设为 high/);
  assert.deepEqual(calls.writes.at(-1)?.patch, {
    model: { provider: 'opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' },
  });

  // 机器人级设置：非属主改不动。
  const denied = await registry.handle(context('/model opencode-go/glm-5.3-flash', { isOwner: false }));
  assert.match(denied.reply, /只有属主能改/);

  // /status 要如实写"机器人默认模型"。
  const status = await registry.handle(context('/status', { isOwner: true }));
  assert.match(status.reply, /机器人默认 opencode-go\/deepseek-v4.1-flash · 推理 high/);
});

test('/retitle：只限属主；把历史绑定会话逐个补上渠道前缀并汇总结果', async () => {
  const outcomes = ['renamed', 'skipped', 'no-title', 'failed'];
  const seen = [];
  const services = {
    ...createServices().services,
    sessions: {
      ...createServices().services.sessions,
      boundSessions: (channelId, botId) => {
        assert.equal(channelId, 'feishu');
        assert.equal(botId, 'bot_1');
        return outcomes.map((_outcome, index) => ({ key: `p2p:ou_${index}`, sessionId: `session-${index}` }));
      },
      markSessionChannel: async (sessionId, labels) => {
        seen.push({ sessionId, labels });
        return outcomes[Number(sessionId.split('-')[1])];
      },
    },
  };
  const registry = createRegistry(services);

  const denied = await registry.handle(context('/retitle', { isOwner: false }));
  assert.match(denied.reply, /只限属主/);
  assert.equal(seen.length, 0, '非属主不该动任何会话');

  const report = await registry.handle(context('/retitle', { isOwner: true }));
  assert.match(report.reply, /检查了 4 个绑定会话/);
  assert.match(report.reply, /补上 1 个/);
  assert.match(report.reply, /已有前缀 1 个/);
  assert.match(report.reply, /还没有标题 1 个/);
  assert.match(report.reply, /失败 1 个/);
  // hub 拿不到昵称，聊天名按绑定键给（`p2p:ou_0` → 「私聊 ou_0」）；真名等下一次消息由渠道补上。
  assert.deepEqual(seen.map((row) => row.labels), [
    { channelLabel: '飞书', chatLabel: '私聊 ou_0' },
    { channelLabel: '飞书', chatLabel: '私聊 ou_1' },
    { channelLabel: '飞书', chatLabel: '私聊 ou_2' },
    { channelLabel: '飞书', chatLabel: '私聊 ou_3' },
  ], '渠道名 + 聊天名');
});

test('/diag：只有属主能看；把连接状态、最近错误与日志尾部拼成可读文本', async () => {
  const services = {
    ...createServices().services,
    diagnostics: {
      read: async () => ({
        dataDir: '/tmp/data',
        logDir: '/tmp/data/logs',
        channels: [{
          id: 'feishu',
          label: '飞书',
          status: 'running',
          error: null,
          bots: [{
            botId: 'bot_1', name: '张三', connected: true, handled: 12,
            lastHandledAt: '2026-09-19T15:40:02.000Z', errorMessage: null,
          }],
        }],
        deferred: [{
          channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', sessionId: 'session-1',
          turn: 1, timedOutAt: Date.now(), attempts: 2, lastError: '平台 500',
        }],
        logs: [
          { path: '/tmp/data/logs/hub.log', exists: true, lines: ['INFO 正常一行', 'WARN 读不到模型列表', 'ERROR 卡片更新失败'] },
          { path: '/tmp/data/logs/feishu.log', exists: false, lines: [] },
        ],
      }),
    },
  };
  const registry = createRegistry(services);

  const denied = await registry.handle(context('/diag', { isOwner: false }));
  assert.match(denied.reply, /只有属主/);

  const report = await registry.handle(context('/diag', { isOwner: true }));
  assert.match(report.reply, /🩺 诊断/);
  assert.match(report.reply, /渠道 飞书：running/);
  assert.match(report.reply, /张三 已连接 · 已处理 12 条/);
  assert.match(report.reply, /hub\.log（最近 2 条 WARN\/ERROR）/, '有问题只回 WARN/ERROR');
  assert.match(report.reply, /ERROR 卡片更新失败/);
  assert.doesNotMatch(report.reply, /INFO 正常一行/, '正常行不占篇幅');
  assert.match(report.reply, /feishu\.log：还没有日志文件/);
  assert.match(report.reply, /待补发：1 条/, '超时后还没补发的记录要出现在诊断里');
  assert.match(report.reply, /p2p:ou_a 会话=session-1 · ⚠️ 平台 500/);
});
