/**
 * dsh-chat-feishu（client 侧）：飞书设置页。
 *
 * 页面里只放"飞书特有"的东西（机器人卡片、连接状态、任务过程展示），
 * 渠道无关的面板（上下文增强等）直接用 hub 的共享组件与 hook。
 *
 * @module dsh-chat-feishu/client
 */

import * as React from 'react';

export const name = 'dsh-chat-feishu-client';

export const inject = ['slots', 'locale', 'connection', 'chatChannels', 'chatUi'];

const CHANNEL_ID = 'feishu';
const PAGE_SLOT = 'chat.channel.page';
const LOCALE_NAMESPACE = 'dsh-chat-feishu';

const zh = {
  '飞书': '飞书',
  '飞书渠道': '飞书渠道',
  '已接入的机器人': '已接入的机器人',
  '读取状态': '读取状态',
  '读取中…': '读取中…',
  '重新连接': '重新连接',
  '移除接入': '移除接入',
  '确认移除': '确认移除',
  '取消': '取消',
  '任务过程展示': '任务过程展示',
  '设置执行过程的呈现方式；私聊与群聊分别生效': '设置执行过程的呈现方式；私聊与群聊分别生效',
  '不显示过程（只发送最终答案）': '不显示过程（只发送最终答案）',
  '适合日常问答：执行过程中不显示工具调用等中间步骤，只回复最终结果':
    '适合日常问答：执行过程中不显示工具调用等中间步骤，只回复最终结果',
  '实时过程卡（全程一张卡片动态更新）': '实时过程卡（全程一张卡片动态更新）',
  '推荐长任务使用：过程与最终答案都在同一张卡片里实时更新，不刷屏':
    '推荐长任务使用：过程与最终答案都在同一张卡片里实时更新，不刷屏',
  '逐步直播（每一步单独发一条消息）': '逐步直播（每一步单独发一条消息）',
  '每一步都单独发一条消息（含工具调用）；长任务会连续发送较多消息':
    '每一步都单独发一条消息（含工具调用）；长任务会连续发送较多消息',
  '机器人与 DeepSeek Harness 的连接状态': '机器人与 DeepSeek Harness 的连接状态',
  '已处理消息': '已处理消息',
  '没有已接入的飞书机器人': '没有已接入的飞书机器人',
  '本机还没有飞书机器人配置。': '本机还没有飞书机器人配置。',
  '状态': '状态',
  '启动中': '启动中',
  '运行正常': '运行正常',
  '启动失败': '启动失败',
  '已停止': '已停止',
  '正在运行': '正在运行',
  // hub 的共享组件（上下文增强编辑器）用本渠道的 t 取文案，因此这些键必须在渠道字典里。
  '保存': '保存',
  '保存中…': '保存中…',
  '保存失败，请重试。': '保存失败，请重试。',
};

const en = {
  '飞书': 'Feishu',
  '飞书渠道': 'Feishu channel',
  '已接入的机器人': 'Connected bots',
  '读取状态': 'Reload',
  '读取中…': 'Loading…',
  '重新连接': 'Reconnect',
  '移除接入': 'Remove',
  '确认移除': 'Confirm removal',
  '取消': 'Cancel',
  '任务过程展示': 'Task progress display',
  '设置执行过程的呈现方式；私聊与群聊分别生效':
    'Choose how the execution is presented; direct and group chats are configured separately',
  '不显示过程（只发送最终答案）': 'Hide the process (final answer only)',
  '适合日常问答：执行过程中不显示工具调用等中间步骤，只回复最终结果':
    'For everyday Q&A: interim steps stay hidden and only the final result is sent',
  '实时过程卡（全程一张卡片动态更新）': 'Live process card (one card updated throughout)',
  '推荐长任务使用：过程与最终答案都在同一张卡片里实时更新，不刷屏':
    'Recommended for long tasks: process and answer update in one card without flooding the chat',
  '逐步直播（每一步单独发一条消息）': 'Step-by-step feed (one message per step)',
  '每一步都单独发一条消息（含工具调用）；长任务会连续发送较多消息':
    'Every step is its own message; long tasks send many messages',
  '机器人与 DeepSeek Harness 的连接状态':
    'Connection state between the bot and DeepSeek Harness',
  '已处理消息': 'Messages handled',
  '没有已接入的飞书机器人': 'No Feishu bot connected',
  '本机还没有飞书机器人配置。': 'This Host has no Feishu bot configured yet.',
  '状态': 'State',
  '启动中': 'Starting',
  '运行正常': 'Connected',
  '启动失败': 'Failed',
  '已停止': 'Stopped',
  '正在运行': 'Running',
  '保存': 'Save',
  '保存中…': 'Saving…',
  '保存失败，请重试。': 'Could not save. Try again.',
};

const h = React.createElement;

const STATE_TEXT = {
  starting: '启动中',
  running: '运行正常',
  failed: '启动失败',
  stopped: '已停止',
};

const STEP_PUSH_OPTIONS = [
  {
    value: 'off',
    label: '不显示过程（只发送最终答案）',
    help: '适合日常问答：执行过程中不显示工具调用等中间步骤，只回复最终结果',
  },
  {
    value: 'streaming_card',
    label: '实时过程卡（全程一张卡片动态更新）',
    help: '推荐长任务使用：过程与最终答案都在同一张卡片里实时更新，不刷屏',
  },
  {
    value: 'post',
    label: '逐步直播（每一步单独发一条消息）',
    help: '每一步都单独发一条消息（含工具调用）；长任务会连续发送较多消息',
  },
];

function BotCard({ bot, status, chatUi, connection, translate, onChanged }) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  const { Panel, StatusPill, ScopedModeEditor, ContextEnhancementEditor,
    DeliveryTargetsEditor } = chatUi.components;
  const settings = chatUi.hooks.useBotSettings({
    connection, channelId: CHANNEL_ID, botId: bot.id,
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [confirming, setConfirming] = React.useState(false);

  const run = async (method, payload) => {
    setBusy(true);
    setError(null);
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, method, payload);
      return chatUi.unwrapRpc(result);
    } catch (cause) {
      setError(cause.message);
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  const tone = status.state === 'running' ? 'success'
    : status.state === 'failed' ? 'error' : 'warning';

  return h(Panel, {
    title: bot.name ?? bot.id,
    description: `${bot.appIdMasked} · ${t('机器人与 DeepSeek Harness 的连接状态')}`,
    actions: h('div', { className: 'dchat-actions' },
      h(StatusPill, { status: status.state, label: t(STATE_TEXT[status.state] ?? '状态') }),
      h('button', {
        type: 'button',
        className: 'dchat-button',
        disabled: busy,
        onClick: async () => {
          try {
            await run('bot.reconnect', { botId: bot.id });
            await onChanged?.();
          } catch { /* 错误已展示 */ }
        },
      }, t('重新连接')),
      confirming
        ? h(React.Fragment, null,
          h('button', {
            type: 'button',
            className: 'dchat-button',
            disabled: busy,
            onClick: async () => {
              try {
                await run('bot.delete', { botId: bot.id, confirm: true });
                setConfirming(false);
                await onChanged?.();
              } catch { /* 错误已展示 */ }
            },
          }, t('确认移除')),
          h('button', {
            type: 'button',
            className: 'dchat-button',
            disabled: busy,
            onClick: () => setConfirming(false),
          }, t('取消')))
        : h('button', {
          type: 'button',
          className: 'dchat-button',
          disabled: busy,
          onClick: () => setConfirming(true),
        }, t('移除接入'))),
  },
  status.errorMessage
    ? h('p', { className: 'dchat-error', role: 'alert' }, status.errorMessage)
    : null,
  error ? h('p', { className: 'dchat-error', role: 'alert' }, error) : null,
  h('div', { className: 'dchat-list' },
    h('div', { className: 'dchat-listItem' },
      h('span', null, t('已处理消息')),
      h('span', null, String(status.handled ?? 0)))),

  h(ScopedModeEditor, {
    title: t('任务过程展示'),
    description: t('设置执行过程的呈现方式；私聊与群聊分别生效'),
    scopes: [{ key: 'direct', label: '私聊' }, { key: 'group', label: '群聊' }],
    options: STEP_PUSH_OPTIONS,
    value: status.stepPush,
    translate: t,
    onSave: async (next) => {
      await run('bot.step-push.set', { botId: bot.id, stepPush: next });
      await onChanged?.();
    },
  }),

  h(ContextEnhancementEditor, {
    config: settings.record?.contextEnhancement ?? null,
    disabled: settings.phase !== 'ready',
    translate: t,
    onSave: settings.saveContextEnhancement,
  }),

  // 渠道无关面板：目标清单与测试发送都由 hub 的共享组件负责。
  h(DeliveryTargetsEditor, {
    chatUi,
    connection,
    channelId: CHANNEL_ID,
    botId: bot.id,
  }));
}

function FeishuPage(props) {
  const { chatUi, connection, translate } = props;
  const t = typeof translate === 'function' ? translate : (key) => key;
  const [state, setState] = React.useState({ phase: 'idle', value: null, error: null });

  const load = React.useCallback(async () => {
    setState((current) => ({ ...current, phase: 'loading' }));
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'connection.status', {});
      setState({ phase: 'ready', value: chatUi.unwrapRpc(result), error: null });
    } catch (error) {
      setState({ phase: 'error', value: null, error });
    }
  }, [chatUi, connection]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const { Panel, EmptyState } = chatUi.components;
  const bots = state.value?.bots ?? [];

  return h(React.Fragment, null,
    h(Panel, {
      title: t('飞书渠道'),
      description: `dataDir：${state.value?.dataDir ?? '—'}`,
      actions: h('button', {
        type: 'button',
        className: 'dchat-button',
        disabled: state.phase === 'loading',
        onClick: () => { void load(); },
      }, state.phase === 'loading' ? t('读取中…') : t('读取状态')),
    },
    state.error ? h('p', { className: 'dchat-error', role: 'alert' }, state.error.message) : null,
    state.phase === 'ready' && bots.length === 0
      ? h(EmptyState, {
        title: t('没有已接入的飞书机器人'),
        description: t('本机还没有飞书机器人配置。'),
      })
      : null),
    bots.map((bot) => h(BotCard, {
      key: bot.id,
      bot,
      status: bot,
      chatUi,
      connection,
      translate: t,
      onChanged: load,
    })));
}

/**
 * Cordis client 插件入口。
 *
 * @param ctx - client 上下文。
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
    'dsh-chat-feishu: 双语文案');
  const t = typeof ctx.locale?.bind === 'function'
    ? ctx.locale.bind(LOCALE_NAMESPACE)
    : (key) => zh[key] ?? key;

  ctx.effect(() => ctx.chatChannels.register({
    id: CHANNEL_ID,
    order: 20,
    label: () => t('飞书'),
    capabilities: { groups: true },
  }), 'dsh-chat-feishu: 渠道元数据');

  ctx.effect(() => ctx.slots.inject(PAGE_SLOT, () => ctx.slots.register({
    name: PAGE_SLOT,
    key: CHANNEL_ID,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ chatUi: ctx.chatUi, connection: ctx.connection, translate: t }),
  }, FeishuPage)), 'dsh-chat-feishu: 渠道设置页');
}
