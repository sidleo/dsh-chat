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

const MODEL_CATALOG = {
  groups: [{
    provider: 'opencode-go',
    providerName: 'OpenCode Go',
    models: [
      {
        id: 'deepseek-v4.1-flash',
        name: 'DeepSeek V4.1 Flash',
        reasoning: { defaultEffort: 'high', efforts: [{ id: 'low' }, { id: 'high' }] },
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
} = {}) {
  const calls = { reset: [], cancel: [], selectModel: [], bind: [], writes: [] };
  const sessions = {
    async invoke(namespace, method, args) {
      if (method === 'modelCatalog') return MODEL_CATALOG;
      if (method === 'list') {
        return {
          items: [{
            sessionId: 'session-1',
            running: true,
            projections: {
              values: { modelSelection: { provider: 'opencode-go', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' } },
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
      return id === 'session-1';
    },
    async reset(options) {
      calls.reset.push(options);
    },
    async cancel(options) {
      calls.cancel.push(options);
      return { accepted: true };
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

function createRegistry(services) {
  const registry = createCommandRegistry({ logger: silentLogger, services });
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
