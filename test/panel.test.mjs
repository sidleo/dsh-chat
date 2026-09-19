/**
 * 控制面板（hub）：读"当前值 + 可选项"、应用"用户的选择"。
 *
 * 这是 IM 可交互卡片的语义层：卡片只负责画下拉，能不能改、改成什么、失败怎么说，全在这里。
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createPanelService, workspaceCandidates } from '../packages/dsh-chat/host/panel.mjs';

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * 真形状（照 `session/modelCatalog` 的 schema 写）：
 * `{ default, routableProviders, groups: [{ id, name, models: [{ id, name, reasoning }] }] }`。
 * provider 是 `group.id`、effort 的展示名是 `name`——这两个字段名写错，测试就该红。
 */
const CATALOG = {
  default: { provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: 'low' },
  routableProviders: ['deepseek', 'anthropic'],
  groups: [
    {
      id: 'deepseek',
      name: 'DeepSeek',
      models: [{
        id: 'deepseek-v4.1-flash',
        name: 'V4.1 Flash',
        reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }], defaultEffort: 'low' },
      }],
    },
    { id: 'anthropic', name: 'Anthropic', models: [{ id: 'claude-x', name: 'Claude X' }] },
  ],
};

function makePanel({
  record = {},
  selection = null,
  bound = 'session-1',
  presets = [{ id: 'standard', isDefault: true }, { id: 'yh-olap' }],
  presetsFailing = false,
  /** true：`session/list` 直接抛错（DSH 侧不可用）——读失败不能说成"从没选过模型"。 */
  listFailing = false,
  sessionCheckFailing = false,
  entries = { 'p2p:ou_a': { sessionId: 'session-1', workspacePath: '/ws/from-binding' } },
} = {}) {
  const state = { ...record };
  const calls = [];
  const settings = {
    ready: async () => {},
    read: () => ({ ...state }),
    write: async (channelId, botId, patch) => {
      Object.assign(state, patch);
      calls.push({ kind: 'write', channelId, botId, patch });
      return { ...state };
    },
  };
  const sessions = {
    invoke: async (namespace, method, args) => {
      calls.push({ kind: 'invoke', namespace, method, args });
      if (method === 'modelCatalog') return CATALOG;
      if (method === 'list') {
        if (listFailing) throw new Error('session service down');
        /**
         * 真形状：`modelSelection = { lastUsed, next }`，`next = pending ?? lastUsed`。
         * 桩里刻意让两者不同：`next` 是"刚选的"，`lastUsed` 是"上一轮真正跑过的" ——
         * 读错字段就会把刚换的模型显示成旧的。
         */
        return {
          items: selection
            ? [{
              sessionId: 'session-1',
              projections: {
                values: {
                  modelSelection: {
                    lastUsed: { provider: 'anthropic', model: 'claude-x', reasoningEffort: 'low' },
                    next: selection,
                  },
                },
              },
            }]
            : [{ sessionId: 'session-1', projections: { values: {} } }],
        };
      }
      if (method === 'selectModel') {
        return { selected: { ...args.request } };
      }
      throw new Error(`未打桩的 gateway 方法：${method}`);
    },
    bindings: {
      get: (channelId, botId, key) => (bound ? { sessionId: bound } : null),
      bind: async (channelId, botId, key, patch) => {
        calls.push({ kind: 'bind', key, patch });
      },
    },
    reset: async (options) => calls.push({ kind: 'reset', options }),
    sessionExists: async (sessionId) => {
      if (sessionCheckFailing) throw new Error('gateway timeout');
      return sessionId === 'session-known';
    },
  };
  const sessionStore = { entries: () => entries };
  /** 记下 warn：几条"失败必须可见"的约定只能这样验（静默吞掉就查不出来）。 */
  const warns = [];
  const panel = createPanelService({
    settings,
    sessions,
    sessionStore,
    agentPresets: {
      remoteExportList: async () => {
        if (presetsFailing) throw new Error('preset service down');
        return { presets };
      },
    },
    logger: { ...silentLogger, warn: (...args) => warns.push(args.join(' ')) },
  });
  return { panel, calls, state, warns };
}

test('读面板：当前值、模型选项与推理等级、预设、工作区候选都在', async () => {
  const { panel } = makePanel({
    record: { workspace: '/ws/current', agentPreset: 'yh-olap' },
    selection: { provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' },
  });
  const state = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', isOwner: true });

  assert.equal(state.bound, true);
  assert.equal(state.sessionId, 'session-1');
  assert.deepEqual(state.model.options.map((item) => item.value), ['deepseek/deepseek-v4.1-flash', 'anthropic/claude-x']);
  assert.deepEqual(state.model.current, {
    provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: 'high',
  });
  // 推理等级跟着当前模型走（另一个模型没有 efforts）。
  assert.deepEqual(state.model.efforts.map((effort) => effort.id), ['low', 'high']);
  assert.deepEqual(state.model.hostDefault, {
    provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: 'low',
  }, 'Host 默认模型要带出来（卡片在"跟随默认"时写明具体是哪个）');
  assert.equal(state.model.currentEffort, 'high');
  assert.equal(state.preset.current, 'yh-olap');
  assert.deepEqual(state.preset.options.map((item) => item.id), ['standard', 'yh-olap']);
  // 工作区候选 = 当前值 + 这台机器人用过的目录（与设置页同一来源，去重）。
  assert.deepEqual(state.workspace.options, ['/ws/current', '/ws/from-binding']);
});

test('读面板：没有会话时不假装能改模型', async () => {
  const { panel } = makePanel({ bound: null });
  const state = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
  assert.equal(state.bound, false);
  assert.equal(state.sessionId, null);
  assert.equal(state.model.current, null);
  assert.ok(state.model.options.length > 0, '模型列表本身照旧给出，便于先看再选');
});

test('应用：选模型 → session/selectModel；没会话时写"机器人默认模型"（只限属主）', async () => {
  const { panel, calls } = makePanel();
  const result = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
    field: 'model', value: 'deepseek/deepseek-v4.1-flash',
  });
  assert.match(result.message, /deepseek\/deepseek-v4.1-flash/);
  const select = calls.find((call) => call.method === 'selectModel');
  assert.deepEqual(select.args.request, {
    sessionId: 'session-1', provider: 'deepseek', model: 'deepseek-v4.1-flash',
  });

  /**
   * 没有会话时不能改会话（DSH 的模型选择是会话级的），但也不该逼用户"先随便发一条消息"：
   * 落点是**机器人默认模型**（只对新会话生效）。它是机器人级设置 → 只限属主。
   */
  const noSession = makePanel({ bound: null });
  await assert.rejects(
    () => noSession.panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'model', value: 'deepseek/deepseek-v4.1-flash',
    }),
    (error) => error.code === 'chat/owner-only' && /机器人默认模型/.test(error.message),
  );

  const asOwner = await noSession.panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'model',
    value: 'deepseek/deepseek-v4.1-flash', isOwner: true,
  });
  assert.match(asOwner.message, /机器人默认模型已设为 deepseek\/deepseek-v4.1-flash/);
  assert.match(asOwner.message, /下一条消息新建的会话/);
  assert.deepEqual(noSession.state.model, {
    provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: null,
  });
  assert.equal(
    noSession.calls.some((call) => call.method === 'selectModel'), false,
    '没有会话就不该调 session/selectModel（它必须带 sessionId）',
  );

  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'model', value: 'nope/nope',
    }),
    (error) => error.code === 'chat/unknown-model',
  );
});

test('应用：推理等级要有显式模型，等级要在该模型的支持列表里', async () => {
  const withModel = makePanel({
    selection: { provider: 'deepseek', model: 'deepseek-v4.1-flash' },
  });
  const ok = await withModel.panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'reasoning', value: 'high',
  });
  assert.match(ok.message, /high/);
  const select = withModel.calls.find((call) => call.method === 'selectModel');
  assert.equal(select.args.request.reasoningEffort, 'high');
  assert.equal(select.args.request.provider, 'deepseek', '等级跟着当前模型走，模型不能变');

  await assert.rejects(
    () => withModel.panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'reasoning', value: 'ultra',
    }),
    (error) => error.code === 'chat/unknown-effort',
  );

  // 没显式选过模型：等级没有落点，明确说要先选模型（不要静默按默认模型改）。
  const noModel = makePanel();
  await assert.rejects(
    () => noModel.panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'reasoning', value: 'high',
    }),
    (error) => error.code === 'chat/no-model',
  );
});

test('应用：预设与工作区落盘，且都说明只对新会话生效', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-chat-panel-'));
  try {
    const { panel, state } = makePanel();
    const preset = await panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'preset', value: 'yh-olap', isOwner: true,
    });
    assert.equal(state.agentPreset, 'yh-olap');
    assert.match(preset.message, /只对新会话生效/);

    const cleared = await panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'preset', value: '', isOwner: true,
    });
    assert.equal(state.agentPreset, null, '空值 = 跟随 Host 默认');
    assert.match(cleared.message, /Host 默认/);

    await assert.rejects(
      () => panel.apply({
        channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'preset', value: 'nope', isOwner: true,
      }),
      (error) => error.code === 'chat/unknown-preset',
    );

    const workspace = await panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'workspace', value: dir, isOwner: true,
    });
    assert.equal(state.workspace, dir);
    assert.match(workspace.message, /只对新会话生效/);

    await assert.rejects(
      () => panel.apply({
        channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'workspace', value: join(dir, 'nope'), isOwner: true,
      }),
      (error) => error.code === 'chat/workspace-invalid',
    );

    // 不是目录也不行（拿一个文件当工作区，建会话时才炸就太晚了）。
    const file = join(dir, 'file.txt');
    await writeFile(file, 'x');
    await assert.rejects(
      () => panel.apply({
        channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'workspace', value: file, isOwner: true,
      }),
      (error) => error.code === 'chat/workspace-invalid' && /不是目录/.test(error.message),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('应用：新会话 / 切会话 / 未知操作', async () => {
  const { panel, calls } = makePanel();
  const fresh = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'session', value: 'new',
  });
  assert.match(fresh.message, /下一条消息将开启新会话/);
  assert.equal(calls.filter((call) => call.kind === 'reset').length, 1);

  const bound = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'session', value: 'session-known',
  });
  assert.match(bound.message, /session-known/);
  assert.deepEqual(calls.find((call) => call.kind === 'bind').patch, { sessionId: 'session-known' });

  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'session', value: 'session-nope',
    }),
    (error) => error.code === 'chat/unknown-session',
  );
  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'avatar', value: 'x',
    }),
    (error) => error.code === 'chat/unknown-field',
  );
});

test('工作区候选：当前值在前、用过的目录去重（与设置页共用）', () => {
  const options = workspaceCandidates({
    record: { workspace: '/ws/current' },
    sessionStore: {
      entries: () => ({
        a: { workspacePath: '/ws/from-binding' },
        b: { workspacePath: '/ws/current' },
        c: {},
      }),
    },
    channelId: 'feishu',
    botId: 'bot_1',
  });
  assert.deepEqual(options, ['/ws/current', '/ws/from-binding']);
});

test('当前模型取 next（刚选的那个），不是 lastUsed（上一轮跑过的）', async () => {
  // 桩里 lastUsed=anthropic/claude-x、next=deepseek/flash：读错字段就会显示成 claude-x。
  const { panel, calls } = makePanel({
    selection: { provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' },
  });
  const state = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
  assert.deepEqual(state.model.current, {
    provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: 'high',
  });
  // 推理等级也必须按 next 的模型给（读 lastUsed 会拿到另一个模型的 efforts）。
  assert.deepEqual(state.model.efforts.map((effort) => effort.id), ['low', 'high']);

  // 改推理等级时用的也必须是 next 的模型，否则会把用户刚选的模型静默改回去。
  await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'reasoning', value: 'low',
  });
  const call = calls.find((item) => item.method === 'selectModel');
  assert.equal(call.args.request.provider, 'deepseek');
  assert.equal(call.args.request.model, 'deepseek-v4.1-flash');
});

test('读不到预设列表：不当成"没有预设"放行，报错且不写设置', async () => {
  const { panel, calls, state } = makePanel({ presetsFailing: true, record: {} });

  const view = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
  assert.equal(view.preset.failed, true, '读失败必须如实带出来，否则卡片会显示"一个预设都没有"');
  assert.deepEqual(view.preset.options, []);

  // fail-closed：读不到列表就没法对账，不能把任意 id 写进设置（写进去只会在下次建会话时才炸）。
  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'preset', value: 'ghost', isOwner: true,
    }),
    (error) => error.code === 'chat/preset-unavailable',
  );
  assert.equal(state.agentPreset, undefined);
  assert.equal(calls.some((call) => call.kind === 'write'), false);
});

test('读不到会话模型选择：记 warn 并降级，不能静默当成"没选过"', async () => {
  const { panel, warns } = makePanel({ listFailing: true });

  const view = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
  assert.equal(view.model.current, null);
  assert.equal(view.model.selectionFailed, true, '读失败要显式带出来，卡片才不会再谎报"跟随 Host 默认"');
  assert.equal(
    warns.some((line) => line.includes('读取会话模型选择失败')), true,
    '静默降级会让卡片显示"跟随 Host 默认"、日志里一行线索都没有',
  );

  // 改推理等级时不能把"读失败"说成"你从没选过模型"。
  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'reasoning', value: 'high',
    }),
    (error) => error.code === 'chat/model-selection-unavailable' && /session service down/.test(error.message),
  );
});

test('切换会话时校验失败不能说成"找不到会话"', async () => {
  const { panel } = makePanel({ sessionCheckFailing: true });
  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'session', value: 'session-x',
    }),
    (error) => error.code === 'chat/session-check-failed' && /gateway timeout/.test(error.message),
  );
});

test('机器人级字段（预设/工作区）只限属主：非属主改不动，也写不进设置', async () => {
  const { panel, calls, state } = makePanel({ record: { workspace: '/ws/owner-project' } });

  for (const [field, value] of [['workspace', '/ws/other'], ['preset', 'yh-olap']]) {
    await assert.rejects(
      () => panel.apply({
        channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_member', field, value,
      }),
      (error) => error.code === 'chat/owner-only',
      `${field} 是机器人级设置，非属主不能改`,
    );
  }
  assert.equal(state.workspace, '/ws/owner-project', '被拒后设置必须原样');
  assert.equal(state.agentPreset, undefined);
  assert.equal(calls.some((call) => call.kind === 'write'), false);

  // 会话级字段不受这条影响（它只作用于当前聊天）。
  const reasoning = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'session', value: 'new',
  });
  assert.match(reasoning.message, /新会话/);
});

test('读面板：工作区候选只给属主（群卡是一条所有人可见的消息）', async () => {
  const { panel } = makePanel({ record: { workspace: '/ws/current' } });

  const owner = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', isOwner: true });
  assert.deepEqual(owner.workspace.options, ['/ws/current', '/ws/from-binding'],
    '属主能看到候选（含这台机器人其它会话的工作区）');

  // 非属主拿到空清单：卡片就不渲染那个下拉，看不到属主其它项目的绝对路径。
  const guest = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_member' });
  assert.deepEqual(guest.workspace.options, []);
  assert.equal(guest.workspace.current, '/ws/current', '当前值本身是机器人级设置，仍然如实显示');

  // 属主在**群里**开面板也不行：那张卡群里所有人都能展开。
  const ownerInGroup = await panel.read({
    channelId: 'feishu', botId: 'bot_1', key: 'group:oc_g', isOwner: true,
  });
  assert.deepEqual(ownerInGroup.workspace.options, [], '群卡不给候选，属主去私聊或设置页改');
});

test('读面板：会话模型选择读成功时 selectionFailed 是 false（别把它当默认值）', async () => {
  const { panel } = makePanel({
    selection: { provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: 'high' },
  });
  const view = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
  assert.equal(view.model.selectionFailed, false);
  assert.equal(view.model.current?.model, 'deepseek-v4.1-flash');
});

test('未绑定时的推理等级改的是机器人默认模型，且只限属主', async () => {
  const { panel, state, calls } = makePanel({ bound: null, record: {} });

  // 还没有机器人默认模型：先选模型。
  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'reasoning', value: 'high', isOwner: true,
    }),
    (error) => error.code === 'chat/no-model',
  );

  await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'model',
    value: 'deepseek/deepseek-v4.1-flash', isOwner: true,
  });
  const set = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'reasoning', value: 'high', isOwner: true,
  });
  assert.match(set.message, /机器人默认推理等级已设为 high/);
  assert.equal(state.model.reasoningEffort, 'high');

  // 非属主改不动。
  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'reasoning', value: 'low',
    }),
    (error) => error.code === 'chat/owner-only',
  );

  // 换模型时重置等级（等级是模型自己的能力，跨模型沿用会给出不支持的取值）。
  await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'model',
    value: 'anthropic/claude-x', isOwner: true,
  });
  assert.deepEqual(state.model, { provider: 'anthropic', model: 'claude-x', reasoningEffort: null });
  assert.equal(calls.some((call) => call.method === 'selectModel'), false);
});

test('读面板：未绑定时给出机器人默认模型与它的推理等级选项', async () => {
  const { panel } = makePanel({
    bound: null,
    record: { model: { provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: 'low' } },
  });
  const view = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', isOwner: true });

  assert.equal(view.bound, false);
  assert.deepEqual(view.model.botDefault, {
    provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: 'low',
  });
  assert.deepEqual(view.model.efforts.map((item) => item.id), ['low', 'high'], '推理等级按机器人默认模型给');
  assert.equal(view.model.currentEffort, 'low');
});

test('读面板：兼容旧 dsh-im 的 { providerId, modelId } 形状', async () => {
  const { panel } = makePanel({
    bound: null,
    record: { model: { providerId: 'deepseek', modelId: 'deepseek-v4.1-flash' } },
  });
  const view = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
  assert.deepEqual(view.model.botDefault, {
    provider: 'deepseek', model: 'deepseek-v4.1-flash', reasoningEffort: null,
  });
});
