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
  '找不到这台机器人': '找不到这台机器人',
  '它不在当前渠道的名单里（可能已被移除，或 Host 与页面版本不一致）': '它不在当前渠道的名单里（可能已被移除，或 Host 与页面版本不一致）',
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
  '找不到这台机器人': 'Bot not found',
  '它不在当前渠道的名单里（可能已被移除，或 Host 与页面版本不一致）':
    "It is not in this channel's bot list (it may have been removed, or the Host and the page are on different versions)",
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
    description: bot.appIdMasked,
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
  /**
   * 从机器人列表点「设置」进来时带上 botId：**只渲染这一台**。
   * 这时渠道级的东西（dataDir、读取状态）一概不渲染——用户点的是"这台机器人的设置"。
   */
  const scoped = Boolean(botId);
  const bots = scoped
    ? allBots.filter((bot) => (bot?.botId ?? bot?.id ?? null) === botId)
    : allBots;
  // 指定了 botId 却一台都没匹配到：明确报出来，**绝不退回"显示全部"**——
  // 静默显示全部会让人以为自己点错了机器人，而真正的问题（版本错位/已被移除）被藏起来。
  const missing = scoped && state.phase === 'ready' && bots.length === 0;

  return h(React.Fragment, null,
    scoped ? null : h(Panel, {
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
    scoped && state.error
      ? h('p', { className: 'dchat-error', role: 'alert' }, state.error.message)
      : null,
    missing
      ? h(EmptyState, {
        title: t('找不到这台机器人'),
        description: `${t('它不在当前渠道的名单里（可能已被移除，或 Host 与页面版本不一致）')}：${botId}`,
      })
      : null,
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
    // 图标：**飞书开放平台官网的矢量标志**（open.feishu.cn 的 favicon-logo.svg，三条 path
    // 逐字节未改）。相对原件只做两件事：去掉官方文件里那层白色圆角底 `rect`（否则是白底方图），
    // 并把 viewBox 按官方 48px favicon 的留白比例收到标志外框；出处见 THIRD_PARTY_NOTICES.md。
    icon: { svg: '<svg viewBox="0.977 0.673 14.655 14.655" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M8.5611 8.26287L8.59322 8.23075C8.6141 8.20988 8.63658 8.18739 8.65906 8.16652L8.70402 8.12316L8.8373 7.99148L9.02037 7.81324L9.17613 7.65908L9.32226 7.51456L9.47481 7.36361L9.61452 7.22551L9.81043 7.03281C9.84737 6.99588 9.8859 6.96055 9.92444 6.92522C9.9951 6.86099 10.069 6.79836 10.1428 6.73734C10.2119 6.68274 10.2825 6.62975 10.3548 6.57836C10.456 6.5061 10.5603 6.44026 10.6663 6.37603C10.7707 6.31501 10.8783 6.2572 10.9875 6.2026C11.0903 6.15282 11.1963 6.10625 11.3038 6.0645C11.3633 6.04041 11.4243 6.01954 11.4853 5.99866C11.5158 5.98903 11.5463 5.97779 11.5784 5.96815C11.3071 4.90028 10.8109 3.90468 10.122 3.04556C9.98868 2.88016 9.78634 2.78381 9.57438 2.78381H3.94598C3.88817 2.78381 3.84 2.83038 3.84 2.8898C3.84 2.92352 3.85605 2.95403 3.88335 2.97491C5.80391 4.38321 7.39689 6.19297 8.54826 8.27732L8.5611 8.26287Z" fill="#00D6B9"/> <path d="M6.32424 13.2168C9.23077 13.2168 11.7631 11.6126 13.0831 9.24238C13.1297 9.15887 13.1747 9.07537 13.218 8.99026C13.1522 9.11712 13.0783 9.23917 12.9964 9.35478C12.9675 9.39493 12.9386 9.43508 12.9081 9.47522C12.8696 9.525 12.831 9.57157 12.7909 9.61814C12.7588 9.65507 12.7266 9.6904 12.6929 9.72573C12.6255 9.79638 12.5548 9.86383 12.4809 9.92646C12.4392 9.96178 12.3991 9.99551 12.3557 10.0276C12.3059 10.0662 12.2545 10.1031 12.2031 10.1368C12.171 10.1593 12.1373 10.1802 12.1036 10.2011C12.0699 10.2219 12.0345 10.2428 11.9976 10.2637C11.9253 10.3038 11.8499 10.3424 11.7744 10.3761C11.7085 10.405 11.6411 10.4323 11.5737 10.458C11.4998 10.4853 11.4259 10.5094 11.3488 10.5302C11.2348 10.5624 11.1208 10.5864 11.0036 10.6041C10.9201 10.617 10.8334 10.6266 10.7483 10.633C10.6583 10.6394 10.5668 10.641 10.4753 10.641C10.3741 10.6394 10.2729 10.633 10.1702 10.6218C10.0947 10.6137 10.0192 10.6025 9.94375 10.5897C9.87791 10.5784 9.81208 10.564 9.74624 10.5479C9.71091 10.5399 9.67719 10.5302 9.64186 10.5206C9.54551 10.4949 9.44916 10.4676 9.35281 10.4403C9.30464 10.4259 9.25646 10.413 9.20989 10.3986C9.13763 10.3777 9.06698 10.3552 8.99632 10.3327C8.93851 10.3151 8.8807 10.2958 8.82289 10.2765C8.76829 10.2589 8.71209 10.2412 8.65749 10.2219L8.54508 10.1834C8.50012 10.1673 8.45355 10.1513 8.40859 10.1352L8.31224 10.0999C8.24801 10.0774 8.18378 10.0533 8.12115 10.0292C8.08421 10.0148 8.04728 10.0019 8.01035 9.98748C7.96057 9.96821 7.91239 9.94894 7.86261 9.92967C7.81123 9.90879 7.75823 9.88792 7.70685 9.86704L7.60568 9.82529L7.48043 9.7739L7.38408 9.73376L7.28452 9.6904L7.1978 9.65186L7.11912 9.61653L7.03883 9.5796L6.95693 9.54106L6.85255 9.49288L6.74336 9.4415C6.70482 9.42223 6.66628 9.40456 6.62774 9.38529L6.52978 9.33712C4.80192 8.4748 3.24267 7.31218 1.92269 5.90227C1.88254 5.86052 1.8167 5.85731 1.77335 5.89746C1.75247 5.91673 1.73962 5.94563 1.73962 5.97454L1.74284 10.9413V11.3444C1.74284 11.5788 1.85845 11.7972 2.05276 11.9273C3.31654 12.772 4.80353 13.22 6.32424 13.2168Z" fill="#3370FF"/> <path d="M14.8656 6.21539C13.8844 5.73525 12.7619 5.63248 11.7101 5.92795C11.6652 5.94079 11.6218 5.95364 11.5784 5.96649C11.5479 5.97612 11.5174 5.98576 11.4853 5.997C11.4243 6.01787 11.3633 6.04036 11.3039 6.06284C11.1963 6.10459 11.0919 6.15116 10.9875 6.20094C10.8783 6.25393 10.7707 6.31174 10.6663 6.37276C10.5588 6.43539 10.456 6.50283 10.3548 6.57509C10.2825 6.62648 10.2119 6.67947 10.1428 6.73407C10.0674 6.79509 9.99511 6.85611 9.92445 6.92195C9.88591 6.95728 9.84898 6.99261 9.81044 7.02954L9.61453 7.22224L9.47482 7.36034L9.32227 7.51129L9.17614 7.65581L9.02038 7.80997L8.83892 7.98982L8.70564 8.1215L8.66067 8.16485C8.6398 8.18573 8.61732 8.20821 8.59483 8.22909L8.56272 8.2612L8.51294 8.30777C8.49367 8.32544 8.476 8.34149 8.45673 8.35916C7.97338 8.80397 7.43383 9.18455 6.85413 9.49447L6.9585 9.54265L7.0404 9.58119L7.12069 9.61812L7.19938 9.65345L7.28609 9.69199L7.38565 9.73534L7.482 9.77549L7.60725 9.82688L7.70842 9.86863C7.75981 9.8895 7.8128 9.91038 7.86419 9.93125C7.91236 9.95052 7.96214 9.9698 8.01192 9.98907C8.04886 10.0035 8.08579 10.0164 8.12272 10.0308C8.18696 10.0549 8.25119 10.0774 8.31382 10.1015L8.41016 10.1368C8.45513 10.1529 8.50009 10.1689 8.54666 10.185L8.65907 10.2235C8.71366 10.2412 8.76826 10.2604 8.82447 10.2781C8.88228 10.2974 8.94008 10.315 8.99789 10.3343C9.06855 10.3568 9.14081 10.3777 9.21147 10.4002C9.25964 10.4146 9.30782 10.4291 9.35439 10.4419C9.45073 10.4692 9.54708 10.4965 9.64343 10.5222C9.67876 10.5318 9.71248 10.5399 9.74781 10.5495C9.81365 10.5656 9.87949 10.5784 9.94533 10.5912C10.0208 10.6041 10.0963 10.6153 10.1717 10.6234C10.2745 10.6346 10.3757 10.641 10.4769 10.6426C10.5684 10.6442 10.6599 10.641 10.7498 10.6346C10.8366 10.6282 10.9217 10.6185 11.0052 10.6057C11.1208 10.588 11.2364 10.5623 11.3504 10.5318C11.4259 10.511 11.5014 10.4869 11.5752 10.4596C11.6427 10.4355 11.7101 10.4082 11.776 10.3777C11.8514 10.344 11.9269 10.3054 11.9992 10.2653C12.0345 10.246 12.0698 10.2251 12.1052 10.2026C12.1405 10.1818 12.1726 10.1593 12.2047 10.1384C12.2561 10.1031 12.3075 10.0677 12.3573 10.0292C12.4006 9.99709 12.4424 9.96337 12.4825 9.92804C12.5548 9.86542 12.6254 9.79797 12.6929 9.72732C12.7266 9.69199 12.7587 9.65666 12.7908 9.61973C12.831 9.57316 12.8711 9.52498 12.9081 9.47681C12.9386 9.43827 12.9675 9.39812 12.9964 9.35637C13.0767 9.24075 13.1505 9.12032 13.2164 8.99506L13.2919 8.84572L13.9631 7.50807L13.9711 7.49202C14.1927 7.01348 14.4946 6.58312 14.8656 6.21539Z" fill="#133C9A"/> </svg>' },
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
