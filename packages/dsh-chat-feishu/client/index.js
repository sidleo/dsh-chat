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
  '最近一次错误': '最近一次错误',
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
  '最近一次错误': 'Last error',
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
  // 处理最近一条消息失败时留下的现场（与终端日志对应）。
  status.lastError
    ? h('p', { className: 'dchat-error', role: 'alert' },
      `${t('最近一次错误')}：${status.lastError}`)
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
  // hub 从机器人列表点「设置」进来时会带上 botId：只展示这一台机器人的设置。
  const { chatUi, connection, translate, botId = null } = props;
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
  const allBots = state.value?.bots ?? [];
  const bots = botId ? allBots.filter((bot) => bot.botId === botId || bot.id === botId) : allBots;

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
    // 侧边栏会话行的渠道徽标（飞书品牌蓝）。
    // 图标：从**飞书官网** favicon.ico 提取的官方标志（48×48 PNG，data URI）。
    // 不要用上游 dsh-im 的自绘图形——它跟官方标志有差异。出处见 THIRD_PARTY_NOTICES.md。
    icon: { uri: 'data:image/png;base64,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' },
    sessionBadge: { text: '飞', color: '#3370ff' },
    capabilities: { groups: true },
  }), 'dsh-chat-feishu: 渠道元数据');

  ctx.effect(() => ctx.slots.inject(PAGE_SLOT, () => ctx.slots.register({
    name: PAGE_SLOT,
    key: CHANNEL_ID,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ chatUi: ctx.chatUi, connection: ctx.connection, translate: t }),
  }, FeishuPage)), 'dsh-chat-feishu: 渠道设置页');
}
