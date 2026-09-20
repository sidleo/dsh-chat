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
import { chatKeyLabel } from '../packages/dsh-chat/host/session-keys.mjs';

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
  /** 渠道自带的面板字段（飞书的「任务过程展示」）：注入后 hub 会读它并透传 apply。 */
  channelRpc = null,
  /** true：`session/list` 直接抛错（DSH 侧不可用）——读失败不能说成"从没选过模型"。 */
  listFailing = false,
  sessionCheckFailing = false,
  /** 覆盖 `session/list` 的返回（会话下拉用）。 */
  sessionItems = null,
  /** 哪些会话"存在"（`sessionExists` 的桩）；给数组时按它判。 */
  existingSessions = null,
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
        if (sessionItems) return { items: sessionItems };
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
      if (Array.isArray(existingSessions)) return existingSessions.includes(sessionId);
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
    ...(channelRpc ? { channelRpc } : {}),
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

test('读面板：会话下拉只列同工作区的会话（别人正在用的不列），排除空会话与子代理', async () => {
  const now = Date.now();
  const { panel } = makePanel({
    record: { workspace: '/ws/current' },
    entries: { 'p2p:ou_a': { sessionId: 'session-1' }, 'group:oc_g': { sessionId: 'session-9' } },
    sessionItems: [
      { sessionId: 'session-1', updatedAt: now - 60_000, cwd: '/ws/current', projections: { asOfSeq: 1, values: { title: '当前聊天' } } },
      { sessionId: 'session-9', updatedAt: now - 3_600_000, cwd: '/ws/other', projections: { asOfSeq: 1, values: { title: '别的聊天' } } },
      { sessionId: 'session-8', updatedAt: now - 10_000, cwd: '/ws/current', projections: { asOfSeq: 1, values: {} } },
      { sessionId: 'session-7', updatedAt: now, cwd: '/ws/current', blank: true },
      { sessionId: 'session-6', updatedAt: now, cwd: '/ws/current', origin: 'subagent' },
      { sessionId: 'session-5', updatedAt: now, cwd: '/ws/elsewhere', projections: { asOfSeq: 1, values: { title: '无关项目' } } },
    ],
  });
  const view = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });

  assert.equal(view.session.current, 'session-1');
  assert.deepEqual(view.session.options.map((item) => item.id), ['session-8', 'session-1'],
    '只列同工作区的会话（按最近更新排序）；空会话/子代理/无关项目/**别人正在用的会话**都排除');
  assert.equal(view.session.withheld, 1, '被别的聊天占着的会话要计数（卡片上要说清为什么不在列表里）');
  assert.equal(view.session.options[1].label, '当前聊天 · 1 分钟前');
  assert.match(view.session.options[0].label, /^session-8 · /, '没有标题时用会话 id 短写');
});

test('读面板：会话列表读不到时也要带出当前绑定，并标 failed', async () => {
  const { panel } = makePanel({ listFailing: true });
  const view = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
  assert.equal(view.session.failed, true);
  assert.deepEqual(view.session.options, [{ id: 'session-1', label: 'session-1' }],
    '读失败不能显示成"没绑定会话"');
});

test('应用：切换会话时拒绝"别的聊天正在用"的会话（会话级提示词不能被两个聊天共用）', async () => {
  const now = Date.now();
  const { panel } = makePanel({
    record: { workspace: '/ws/current' },
    existingSessions: ['session-1', 'session-known'],
    entries: {
      'p2p:ou_a': { sessionId: 'session-1' },
      'group:oc_g': { sessionId: 'session-known' },
    },
    sessionItems: [
      { sessionId: 'session-1', updatedAt: now, cwd: '/ws/current', projections: { values: { title: '当前聊天' } } },
      { sessionId: 'session-known', updatedAt: now, cwd: '/ws/current', projections: { values: { title: '别的聊天' } } },
    ],
  });

  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'session', value: 'session-known',
    }),
    (error) => {
      assert.equal(error.code, 'chat/session-in-use');
      // 说清是哪个会话、被哪个聊天占着——用户要能照着去解绑。
      assert.match(error.message, /别的聊天/);
      assert.match(error.message, /群 oc_g/);
      assert.match(error.message, /新会话/);
      return true;
    },
  );

  // 同一个聊天切回自己的会话照旧可以。
  const ok = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'session', value: 'session-1',
  });
  assert.match(ok.message, /已切换到会话 session-1/);
});

test('会话键的人话名字：私聊/群/未知三种形态', () => {
  assert.equal(chatKeyLabel('p2p:ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5'), '私聊 ou_2b7e4d1a9…');
  assert.equal(chatKeyLabel('group:oc_3e5f7b9d1a2c4068b2d4f6a8c0e1b3d5'), '群 oc_3e5f7b9d1…');
  assert.equal(chatKeyLabel(''), '未知聊天');
});

test('应用：会话下拉的空值（哨兵翻译回来）等于"新会话"，不是"找不到会话"', async () => {
  const { panel, calls } = makePanel();
  const result = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'session', value: '',
  });
  assert.match(result.message, /新会话/);
  assert.equal(calls.some((call) => call.method === 'sessionExists'), false, '空值不该去校验会话存在');
  assert.ok(calls.some((call) => call.kind === 'reset'));
});

test('渠道自带的面板字段：读得到就带出来，apply 透传给渠道；渠道没实现就当没有', async () => {
  const calls = [];
  const withFields = makePanel({
    channelRpc: async (channelId, method, payload) => {
      calls.push({ channelId, method, payload });
      if (method === 'panel.fields') {
        return { ok: true, value: { fields: [{
          field: 'stepPush',
          label: '任务过程展示（私聊）',
          value: 'post',
          options: [{ value: 'off', label: '不显示' }, { value: 'post', label: '逐步直播' }],
        }] } };
      }
      return { ok: true, value: { value: payload.value, message: '已生效。' } };
    },
  });
  const view = await withFields.panel.read({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', conversationType: 'direct',
  });
  assert.deepEqual(view.fields.map((item) => item.field), ['stepPush']);
  assert.equal(calls[0].method, 'panel.fields');
  assert.equal(calls[0].payload.conversationType, 'direct', '按会话类型取值（私聊/群聊各一份）');

  const applied = await withFields.panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', conversationType: 'direct',
    field: 'stepPush', value: 'off',
  });
  assert.equal(applied.message, '已生效。');
  assert.equal(calls.at(-1).method, 'panel.apply');
  assert.equal(calls.at(-1).payload.field, 'stepPush');

  // 渠道没实现（老版本渠道/这渠道没有这类设置）：当没有，不当失败。
  const warns = [];
  const noFields = makePanel({
    channelRpc: async () => {
      const error = new Error('渠道 feishu 不支持 panel.fields。');
      error.code = 'chat/unknown-method';
      throw error;
    },
  });
  noFields.warns.push(...warns);
  const plain = await noFields.panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
  assert.deepEqual(plain.fields, []);
  assert.equal(plain.fieldsFailed, false);
  assert.deepEqual(noFields.warns, [], '渠道没实现不该刷日志');

  // 渠道报错（真的失败）：fieldsFailed + warn，用户能看到。
  const failing = makePanel({
    channelRpc: async () => ({ ok: false, error: { code: 'feishu/boom', message: '渠道炸了' } }),
  });
  const broken = await failing.panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
  assert.deepEqual(broken.fields, []);
  assert.equal(broken.fieldsFailed, true);
  assert.ok(failing.warns.some((line) => line.includes('渠道面板字段')), '真失败要留痕');

  // apply 失败要抛带 code 的可见错误。
  await assert.rejects(
    () => failing.panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'stepPush', value: 'off',
    }),
    (error) => error.code === 'feishu/boom' && /渠道炸了/.test(error.message),
  );
});

test('读面板：带上本会话类型该显示哪些项（设置页里配的，私聊/群聊分开）', async () => {
  const { panel } = makePanel({
    record: { panelSections: { direct: { policy: false }, group: { actions: false, commands: false } } },
  });
  const direct = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', isOwner: true });
  assert.equal(direct.sections.policy, false);
  assert.equal(direct.sections.model, true);
  assert.equal(direct.sections.commands, true, '私聊那份没动');
  const group = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'group:oc_g', isOwner: true });
  assert.equal(group.sections.actions, false);
  assert.equal(group.sections.commands, false);
  assert.equal(group.sections.policy, true, '群里那份没关 policy');
  // 数据本身照旧都给（少一次"字段被谁吞了"的排查）——显示与否由渠道按 sections 决定。
  assert.ok(group.policy, '关掉显示不等于不读数据');
  // 从没配过：全显示。
  const fresh = await makePanel({}).panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
  assert.ok(Object.values(fresh.sections).every((value) => value === true));
});

test('会话类型漏传时从会话键兜底：不能把「本会话的访问策略」静默丢掉', async () => {
  const { panel } = makePanel({});
  // 群里发 /menu：命令内核与渠道都可能漏传 conversationType。
  const group = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'group:oc_g', isOwner: true });
  assert.ok(group.policy, '从 group: 前缀要能推出群聊');
  assert.equal(group.policy.conversationType, 'group');
  assert.equal(group.policy.kindLabel, '群聊');
  const direct = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', isOwner: true });
  assert.equal(direct.policy.kindLabel, '私聊');
  // 显式给的值优先（渠道最清楚），但键与它不一致时以显式值为准。
  const explicit = await panel.read({
    channelId: 'feishu', botId: 'bot_1', key: 'group:oc_g', isOwner: true, conversationType: 'direct',
  });
  assert.equal(explicit.policy.kindLabel, '私聊');
  // 认不出的键仍然不给（宁可不提供，也不能改错一份）。
  const unknown = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'ou_a', isOwner: true });
  assert.equal(unknown.policy, null);
  // apply 同理：漏传也要能落到群聊那一份。
  const applied = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'group:oc_g', field: 'policy', value: 'open',
    isOwner: true, confirm: true,
  });
  assert.match(applied.message, /群聊的访问策略/);
});

test('访问策略下拉：放宽到"任何人可用"必须先确认一次；只改当前会话类型那一份', async () => {
  const defaultScope = () => ({
    mode: 'allowlist',
    open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] },
    allowlist: { users: [{ id: 'ou_a', canExecuteCommands: true }] },
  });
  const { panel, state, calls } = makePanel({
    record: { accessPolicy: { direct: defaultScope(), group: { ...defaultScope(), mode: 'open' } } },
  });

  // ① 读：只给属主，且必须知道是私聊还是群聊；从没设过时 current 为 null（不冒充某种模式）。
  const read = await panel.read({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', isOwner: true, conversationType: 'direct',
  });
  assert.equal(read.policy.current, 'allowlist');
  assert.equal(read.policy.conversationType, 'direct');
  assert.equal(read.policy.kindLabel, '私聊');
  assert.match(read.policy.label, /名单内 1 人可用/);
  assert.deepEqual(read.policy.options.map((item) => item.value), ['allowlist', 'open']);
  assert.match(read.policy.options[0].label, /当前 1 人/);
  assert.match(read.policy.options[1].label, /任何人可用/);

  const asMember = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', conversationType: 'direct' });
  assert.equal(asMember.policy, null, '非属主不给');
  const derivedScope = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', isOwner: true });
  assert.equal(derivedScope.policy.conversationType, 'direct',
    '调用方漏传会话类型时从会话键兜底（否则这一项会静默消失）');
  const unknownScope = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'ou_a', isOwner: true });
  assert.equal(unknownScope.policy, null, '认不出会话键时不给（免得改错一份）');

  const never = await panel.read({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', isOwner: true, conversationType: 'direct',
  });

  // ② 放宽到 open：没带 confirm 就不落盘，回一个可渲染的确认说明。
  const asked = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'policy', value: 'open',
    isOwner: true, conversationType: 'direct',
  });
  assert.equal(asked.requiresConfirm, true);
  assert.match(asked.confirmPrompt, /不在名单里的人也能跟机器人对话/);
  assert.equal(calls.some((call) => call.kind === 'write'), false, '确认之前绝不能落盘');
  assert.equal(state.accessPolicy.direct.mode, 'allowlist', '设置原样');

  // ③ 带 confirm 才真的改；只动私聊那一份，群聊那份原样。
  const done = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'policy', value: 'open',
    isOwner: true, conversationType: 'direct', confirm: true,
  });
  assert.match(done.message, /私聊的访问策略已改为「任何人可用」/);
  assert.match(done.message, /下一条消息生效/);
  assert.equal(state.accessPolicy.direct.mode, 'open');
  assert.deepEqual(state.accessPolicy.direct.allowlist.users, [{ id: 'ou_a', canExecuteCommands: true }],
    '名单与命令权限照旧');
  assert.equal(state.accessPolicy.group.mode, 'open', '群聊那份没被碰');

  // ④ 收窄回 allowlist 不需要确认；本来就是那个值时如实说"没有改动"。
  const narrowed = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'policy', value: 'allowlist',
    isOwner: true, conversationType: 'direct',
  });
  assert.match(narrowed.message, /已改为「仅名单内可用」/);
  assert.equal(narrowed.requiresConfirm, undefined);
  const same = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'policy', value: 'allowlist',
    isOwner: true, conversationType: 'direct',
  });
  assert.match(same.message, /本来就是/);

  // ⑤ 从没设过策略的机器人：先得到默认策略再改（默认是 allowlist）。
  const fresh = makePanel({});
  const freshRead = await fresh.panel.read({
    channelId: 'feishu', botId: 'bot_1', key: 'group:oc_g', isOwner: true, conversationType: 'group',
  });
  assert.equal(freshRead.policy.current, null);
  assert.match(freshRead.policy.label, /未设置（仅属主可用）/);
  // 未设置 ≡ allowlist 空名单 ≡ 仅属主：选它就是无操作（如实说"本来就是"，不凭空写盘）。
  const noop = await fresh.panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'group:oc_g', field: 'policy', value: 'allowlist',
    isOwner: true, conversationType: 'group',
  });
  assert.match(noop.message, /本来就是/);
  assert.equal(fresh.state.accessPolicy, undefined, '没有变化就不该写盘');
  // 真要开放时才落盘：写出来的是**成对完整**的策略（另一份补默认值）。
  await fresh.panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'group:oc_g', field: 'policy', value: 'open',
    isOwner: true, conversationType: 'group', confirm: true,
  });
  assert.equal(fresh.state.accessPolicy.group.mode, 'open');
  assert.equal(fresh.state.accessPolicy.direct.mode, 'allowlist', '另一份补上默认值（策略必须成对完整）');

  // ⑥ 门禁与非法值。
  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'policy', value: 'open', conversationType: 'direct',
    }),
    (error) => error.code === 'chat/owner-only',
  );
  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'policy', value: 'nope',
      isOwner: true, conversationType: 'direct',
    }),
    (error) => error.code === 'chat/bad-request',
  );
});

test('渠道动作按钮：读出来透传，点击走 panel.act，失败原样抛 code', async () => {
  const seen = [];
  const channelRpc = async (channelId, method, payload) => {
    seen.push({ channelId, method, payload });
    if (method === 'panel.actions') {
      return {
        ok: true,
        value: {
          actions: [
            {
              action: 'reconnect', label: '🔌 重连', type: 'default',
              confirm: { title: '重连？', text: '会断开几秒' },
              deferred: true,
            },
            // 形状不对的（没有 label / 动作名非法）要丢掉：不能画出一个点了没反应的按钮。
            { action: 'ghost' },
            { label: '没有动作名' },
            { action: 'bad_type', label: '类型不认识', type: 'rainbow' },
          ],
        },
      };
    }
    if (method === 'panel.act') {
      if (payload.action === 'boom') {
        return { ok: false, error: { code: 'feishu/boom', message: '连接失败' } };
      }
      return { ok: true, value: { action: payload.action, message: '已重连（长连接已重建）。' } };
    }
    return { ok: false, error: { code: 'chat/unknown-method', message: '渠道 feishu 不支持这个面板方法。' } };
  };
  const { panel } = makePanel({ channelRpc });

  const state = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', isOwner: true });
  assert.deepEqual(state.actions.map((item) => item.action), ['reconnect', 'bad_type'],
    '只丢掉认不出形状的（没有 label / 没有动作名），type 不认识回落 default');
  assert.deepEqual(state.actions[0].confirm, { title: '重连？', text: '会断开几秒' });
  assert.equal(state.actions[1].type, 'default');
  assert.equal(state.actions[0].deferred, true, 'deferred 要透传给卡片（决定"先应答再执行"）');
  assert.equal(state.actions[1].deferred, false, '没声明就是同步执行');
  assert.equal(state.actionsFailed, false);
  const listed = seen.find((call) => call.method === 'panel.actions');
  assert.equal(listed.payload.isOwner, true, '属主要透传给渠道（渠道据此决定给不给按钮）');
  assert.equal(listed.payload.conversationType, 'direct', 'p2p: 键推出私聊，透传给渠道');

  const done = await panel.act({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', action: 'reconnect', isOwner: true,
  });
  assert.equal(done.message, '已重连（长连接已重建）。');
  const acted = seen.find((call) => call.method === 'panel.act');
  assert.equal(acted.payload.action, 'reconnect');
  assert.equal(acted.payload.isOwner, true);

  await assert.rejects(
    () => panel.act({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', action: 'boom', isOwner: true }),
    (error) => error.code === 'feishu/boom' && /连接失败/.test(error.message),
  );
  await assert.rejects(
    () => panel.act({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', action: '', isOwner: true }),
    (error) => error.code === 'chat/bad-request',
  );

  // 渠道没实现这两个方法（老版本渠道）：不算失败、不刷日志。
  const plain = makePanel({});
  const none = await plain.panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
  assert.deepEqual(none.actions, []);
  assert.equal(none.actionsFailed, false);
  assert.deepEqual(plain.warns, []);
  await assert.rejects(
    () => plain.panel.act({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', action: 'reconnect' }),
    (error) => error.code === 'chat/unknown-action',
  );

  // 真失败（渠道报错）：actionsFailed + warn，用户能看到"读不到"。
  const failing = makePanel({
    channelRpc: async () => ({ ok: false, error: { code: 'feishu/boom', message: '渠道炸了' } }),
  });
  const broken = await failing.panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
  assert.equal(broken.actionsFailed, true);
  assert.ok(failing.warns.some((line) => line.includes('渠道面板动作')), '真失败要留痕');
});

test('本会话的上下文增强：跟全局 / 本会话专属 / 套用另一条（只限属主）', async () => {
  const globalDirect = {
    enabled: true, fields: ['senderId', 'senderName'], guidance: '私聊全局提示词',
  };
  const other = {
    kind: 'user', id: 'ou_b', label: '爱丽丝', enabled: true,
    fields: ['senderName'], guidance: '给爱丽丝的提示词', merge: 'replace',
  };
  const { panel, state, calls } = makePanel({
    record: { contextEnhancement: { direct: globalDirect, group: { enabled: false, fields: ['senderId'], guidance: '' }, targets: [other] } },
  });

  // ① 读：私聊里认出"本私聊"，给出跟随全局 / 专属 / 套用另一条三种选择。
  const read = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', isOwner: true });
  assert.equal(read.context.current, '', '还没有专属设置 = 跟随全局');
  assert.equal(read.context.label, '本私聊');
  assert.equal(read.context.identity, 'ou_a');
  assert.equal(read.context.own, null);
  assert.deepEqual(read.context.options.map((item) => item.value), ['', 'own', 'copy:ou_b']);
  assert.match(read.context.options[0].label, /跟随私聊全局（已启用）/);
  assert.match(read.context.options[2].label, /套用「爱丽丝」的字段与提示词/);

  // ② 非属主 / 认不出的会话键：不给这一项（也不给"改得动"的错觉）。
  const asMember = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a' });
  assert.equal(asMember.context, null, '非属主不给');
  const unknownKey = await panel.read({ channelId: 'feishu', botId: 'bot_1', key: 'ou_a', isOwner: true });
  assert.equal(unknownKey.context, null, '认不出会话键就不提供（免得照错方向改设置）');

  // ③ 创建专属设置：把全局那份复制过来作为起点（merge=replace，效果与跟随全局一致）。
  const own = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'context', value: 'own', isOwner: true,
  });
  assert.match(own.message, /已为本私聊创建专属设置/);
  assert.match(own.message, /设置页/);
  assert.match(own.message, /下一条消息生效/);
  const created = state.contextEnhancement.targets.find((item) => item.id === 'ou_a');
  assert.equal(created.kind, 'user');
  assert.deepEqual([...created.fields], ['senderId', 'senderName']);
  assert.equal(created.guidance, '私聊全局提示词');
  assert.equal(created.merge, 'replace');
  assert.equal(created.enabled, true);
  assert.equal(state.contextEnhancement.targets.length, 2, '另一条设置不受影响');

  const again = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'context', value: 'own', isOwner: true,
  });
  assert.match(again.message, /已经是专属设置/);
  assert.equal(state.contextEnhancement.targets.length, 2, '重复选不叠加');

  // ④ 套用另一条指定设置：复制字段与提示词，不动原来那条。
  const copied = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'context', value: 'copy:ou_b', isOwner: true,
  });
  assert.match(copied.message, /已把「爱丽丝」的字段与提示词套用到本私聊/);
  const mine = state.contextEnhancement.targets.find((item) => item.id === 'ou_a');
  assert.deepEqual([...mine.fields], ['senderName']);
  assert.equal(mine.guidance, '给爱丽丝的提示词');
  assert.equal(state.contextEnhancement.targets.find((item) => item.id === 'ou_b').guidance, '给爱丽丝的提示词',
    '复制不影响被套用的那条');

  // ⑤ 回到跟随全局：只删本会话这一条。
  const back = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'context', value: '', isOwner: true,
  });
  assert.match(back.message, /已删除本私聊的专属设置/);
  assert.deepEqual(state.contextEnhancement.targets.map((item) => item.id), ['ou_b']);
  assert.equal(state.contextEnhancement.direct.guidance, '私聊全局提示词', '全局那份原样');

  // ⑥ 群会话：按群 id 建 group 目标；非属主与未知取值都被挡下。
  const group = await panel.apply({
    channelId: 'feishu', botId: 'bot_1', key: 'group:oc_g', field: 'context', value: 'own', isOwner: true,
  });
  assert.match(group.message, /全局的群聊增强本来是关闭的/);
  const groupTarget = state.contextEnhancement.targets.find((item) => item.id === 'oc_g');
  assert.equal(groupTarget.kind, 'group');
  assert.equal(groupTarget.enabled, true);
  assert.equal(groupTarget.guidance, '', '全局关闭时提示词为空，等用户在设置页填');

  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'context', value: 'own',
    }),
    (error) => error.code === 'chat/owner-only',
  );
  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'context', value: 'nope', isOwner: true,
    }),
    (error) => error.code === 'chat/bad-request',
  );
  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', field: 'context', value: 'copy:ou_ghost', isOwner: true,
    }),
    (error) => error.code === 'chat/unknown-context-target',
  );
  const writes = calls.filter((call) => call.kind === 'write');
  assert.ok(writes.every((call) => Object.keys(call.patch).length === 1
    && Object.hasOwn(call.patch, 'contextEnhancement')), '只写 contextEnhancement 一个键');
});

test('本会话的上下文增强：指定设置条数到顶时给出可读错误', async () => {
  const targets = Array.from({ length: 50 }, (_, index) => ({
    kind: 'user', id: `ou_${index}`, label: '', enabled: true, fields: ['senderId'], guidance: '', merge: 'replace',
  }));
  const { panel } = makePanel({
    record: { contextEnhancement: { direct: { enabled: true, fields: ['senderId'], guidance: 'x' }, group: { enabled: false, fields: ['senderId'], guidance: '' }, targets } },
  });
  await assert.rejects(
    () => panel.apply({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_new', field: 'context', value: 'own', isOwner: true,
    }),
    (error) => error.code === 'chat/context-target-limit' && /最多 50 条/.test(error.message),
  );
});
