/**
 * 「Chat机器人」页的机器人列表：左栏选聊天软件，右栏列出它的机器人。
 *
 * 每个机器人一行（名称 / 账号 / 状态 / 已处理条数 / 最近处理时间 / 失败原因），
 * 行上带一个「设置」按钮进入该机器人的设置页——和 dsh-im 一样的层次：
 * **渠道 → 机器人 → 机器人设置**。
 *
 * 数据来自渠道自己的 `connection.status`（契约里的规范化 `bots` 名单），
 * hub 只负责渲染，不认识任何平台概念。
 *
 * @module dsh-chat/client/bot-list
 */

import * as React from 'react';

import { botOrderKey, orderedItems, useListOrder } from './list-order.js';

const h = React.createElement;

/** 渠道状态 → 文案键。 */
const STATE_TEXT = Object.freeze({
  running: '运行正常',
  starting: '正在启动',
  reconnecting: '重连中',
  failed: '启动失败',
  stopped: '已停止',
});

const TONES = Object.freeze({
  running: 'success',
  starting: 'warning',
  reconnecting: 'warning',
  failed: 'error',
});

/**
 * 从渠道的 `connection.status` 里取机器人名单。
 *
 * 契约里的规范字段是 `bots`；早期渠道只返回 `accounts`（微信就是这样），
 * 所以这里按**保守方向**兼容两种键——否则升级期会出现"明明配了机器人却显示没有"。
 *
 * @param value - `connection.status` 的业务值。
 * @returns 机器人数组（永远不是 undefined）。
 */
export function normalizeBots(value) {
  if (Array.isArray(value?.bots)) return value.bots;
  if (Array.isArray(value?.accounts)) return value.accounts;
  return [];
}

/**
 * 机器人身份键。
 *
 * 契约字段是 `botId`；但 **host 与 client 的版本可以错位**（改 host 要重启 dsh，
 * 改 client 刷新页面即可）：老 host 只给 `id`。这时如果读 `bot.botId` 会拿到
 * undefined，点「设置」就把 undefined 传进渠道页，渠道页只能退回"显示全部机器人"
 * ——**表面正常、实际进错页**，正是最难查的故障形态。所以这里按 `id` 保守兜底。
 *
 * @param bot - 渠道 `connection.status` 里的一台机器人。
 * @returns 身份字符串，取不到时 null。
 */
export function botKeyOf(bot) {
  if (!bot || typeof bot !== 'object') return null;
  const key = bot.botId ?? bot.id ?? null;
  return typeof key === 'string' && key.length > 0 ? key : null;
}

function formatTime(value) {
  if (!value) return '—';
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return '—';
  const pad = (number) => String(number).padStart(2, '0');
  return `${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`;
}

/**
 * 机器人列表。
 *
 * @param props - {
 *   channelId, label, note, connection, chatUi, translate, t, onOpenSettings, setup,
 * }。
 *   `setup` 来自渠道注册的 `capabilities.setup`：
 *   - 有 `label` → 头部显示一个通往渠道设置页的入口（用渠道给的名称，如「扫码接入」）；
 *   - 有 `hint` → 空列表时用它说明怎么接入（渠道自己才说得清，如"填凭据"/"扫码"）；
 *   - 两样都没有（或整个 `setup` 缺席）→ 既不放入口也不编接入说明——避免出现一个点进去
 *     跟机器人设置长得一样的空壳入口。
 *
 * @returns React 元素。
 */
export function BotList(props) {
  const {
    channelId, label, note, connection, chatUi, translate, t: frameworkT, onOpenSettings,
    setup = null,
  } = props;
  const t = typeof translate === 'function' ? translate
    : (typeof frameworkT === 'function' ? frameworkT : (key) => key);
  /** 渠道设置入口的名称（没有就不显示这个入口）。 */
  const setupLabel = typeof setup?.label === 'string' && setup.label.trim() ? setup.label.trim() : null;
  /** 空列表时的接入说明：优先用渠道给的，没给就退回一句中性的。 */
  const setupHint = typeof setup?.hint === 'string' && setup.hint.trim()
    ? setup.hint.trim()
    : t('在渠道自己的配置里完成接入后，机器人会出现在这里。');
  const [state, setState] = React.useState({ phase: 'loading', bots: [], error: null });

  const load = React.useCallback(() => {
    setState((current) => ({ ...current, phase: 'loading', error: null }));
    chatUi.callChannelRpc(connection, channelId, 'connection.status', {})
      .then((result) => {
        setState({ phase: 'ready', bots: normalizeBots(chatUi.unwrapRpc(result)), error: null });
      })
      .catch((error) => {
        setState({ phase: 'error', bots: [], error: error?.message ?? String(error) });
      });
  }, [channelId, chatUi, connection]);

  React.useEffect(() => {
    load();
  }, [load]);

  const { Panel, EmptyState, StatusPill } = chatUi.components;
  /**
   * 机器人顺序：用户拖动过就按用户顺序（每个渠道一份，存浏览器）。
   * 身份取不到的机器人（老 host 没给 botId）用行下标兜底，至少不会被排到看不见的地方。
   */
  const botOrder = useListOrder(botOrderKey(channelId), (row) => botKeyOf(row.bot));
  const rows = React.useMemo(
    () => orderedItems(
      state.bots.map((bot, index) => ({ bot, fallback: `row-${index}` })),
      botOrder.order,
      (row) => botKeyOf(row.bot) ?? row.fallback,
    ),
    [state.bots, botOrder.order],
  );
  /**
   * 拖动中的机器人：**ref 记"拖的是谁"**，state 只管高亮（原因同 section.js：
   * 同一任务里连着派发 dragstart/drop 时，state 的闭包可能还是旧值）。
   */
  const dragBotRef = React.useRef(null);
  const [dragBot, setDragBot] = React.useState(null);
  const [dropBot, setDropBot] = React.useState(null);

  return h(Panel, {
    title: `${label()} · ${t('机器人')}`,
    description: note || null,
    actions: h('div', { className: 'dchat-actions' },
      /**
       * 渠道设置入口**只在渠道声明了名称时**显示。
       *
       * 真机反馈：飞书那个入口点进去跟"机器人设置"几乎一样（渠道级只有一行 dataDir，
       * 而 dataDir 在诊断/版本面板里、读取状态就是右边的「重新读取」）——那就不该有它。
       * 微信的入口就是「扫码接入」，名称与说明都由渠道给（hub 不认识这些语义）。
       */
      setupLabel ? h('button', {
        type: 'button',
        className: 'dchat-button dchat-buttonLink',
        onClick: () => onOpenSettings(null),
      }, t(setupLabel)) : null,
      h('button', {
        type: 'button',
        className: 'dchat-button',
        onClick: load,
        disabled: state.phase === 'loading',
      }, state.phase === 'loading' ? t('读取中…') : t('重新读取'))),
  },
  state.error
    ? h('p', { className: 'dchat-error' }, `${t('读取失败')}：${state.error}`)
    : null,
  state.phase !== 'loading' && state.bots.length === 0
    ? h(EmptyState, {
      title: t('这个渠道还没有机器人'),
      description: t(setupHint),
    }, setupLabel ? h('button', {
      type: 'button',
      className: 'dchat-button',
      onClick: () => onOpenSettings(null),
    }, t(setupLabel)) : null)
    : null,
  state.bots.length > 0
    ? h('ul', { className: 'dchat-botList' }, rows.map((row) => {
      const { bot } = row;
      const identity = botKeyOf(bot);
      const rowKey = identity ?? row.fallback;
      const title = bot.name || identity || t('未命名机器人');
      // 没有名称时标题已经兜底成身份串，账号这一项就不再重复一遍。
      const showIdentity = Boolean(identity) && identity !== title;
      return h('li', {
        key: rowKey,
        className: `dchat-botRow${dropBot === rowKey && dragBot !== rowKey ? ' dchat-dropTarget' : ''}`,
        onDragOver: (event) => {
          const from = dragBotRef.current;
          if (!from || from === rowKey) return;
          event.preventDefault();
          setDropBot(rowKey);
        },
        onDrop: (event) => {
          event.preventDefault();
          const from = dragBotRef.current;
          if (from && from !== rowKey) botOrder.move(rows, from, rowKey);
          dragBotRef.current = null;
          setDropBot(null);
          setDragBot(null);
        },
      },
      h('span', {
        className: 'dchat-grip',
        draggable: true,
        title: t('拖动可调整顺序'),
        'aria-hidden': 'true',
        onDragStart: (event) => {
          dragBotRef.current = rowKey;
          setDragBot(rowKey);
          // Firefox 不设 dataTransfer 就不会开始拖。
          event.dataTransfer?.setData('text/plain', rowKey);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        },
        onDragEnd: () => {
          dragBotRef.current = null;
          setDragBot(null);
          setDropBot(null);
        },
      }, '⋮⋮'),
      h('div', { className: 'dchat-botMain' },
        h('div', { className: 'dchat-botTitle' },
          h('strong', { title }, title),
          h(StatusPill, { status: bot.state, label: t(STATE_TEXT[bot.state] ?? '已停止') })),
        h('div', { className: 'dchat-botMeta' },
          showIdentity ? h('span', { className: 'dchat-code' }, identity) : null,
          h('span', null, `${t('已处理')} ${bot.handled ?? 0}`),
          h('span', null, `${t('最近')} ${formatTime(bot.lastHandledAt)}`)),
        bot.errorMessage || bot.lastError
          ? h('div', { className: 'dchat-botError' }, bot.errorMessage ?? bot.lastError)
          : null),
      h('button', {
        type: 'button',
        className: 'dchat-button',
        // 身份取不到就不能进"这台机器人的设置"——那会静默变成"整个渠道的设置"。
        disabled: identity === null,
        title: identity ?? t('这台机器人没有可用的身份标识，无法单独配置'),
        onClick: () => onOpenSettings(identity),
      }, t('设置')));
    }))
    : null);
}
