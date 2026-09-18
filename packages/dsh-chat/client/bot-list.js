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
 * @param props - { channelId, label, connection, chatUi, translate, t, onOpenSettings }。
 * @returns React 元素。
 */
export function BotList(props) {
  const { channelId, label, connection, chatUi, translate, t: frameworkT, onOpenSettings } = props;
  const t = typeof translate === 'function' ? translate
    : (typeof frameworkT === 'function' ? frameworkT : (key) => key);
  const [state, setState] = React.useState({ phase: 'loading', bots: [], error: null });

  const load = React.useCallback(() => {
    setState((current) => ({ ...current, phase: 'loading', error: null }));
    chatUi.callChannelRpc(connection, channelId, 'connection.status', {})
      .then((result) => {
        const value = chatUi.unwrapRpc(result);
        setState({ phase: 'ready', bots: value?.bots ?? [], error: null });
      })
      .catch((error) => {
        setState({ phase: 'error', bots: [], error: error?.message ?? String(error) });
      });
  }, [channelId, chatUi, connection]);

  React.useEffect(() => {
    load();
  }, [load]);

  const { Panel, EmptyState, StatusPill } = chatUi.components;
  const bots = state.bots;

  return h(Panel, {
    title: `${label()} · ${t('机器人')}`,
    description: t('每个机器人一行；点「设置」进入它的设置页（上下文增强、主动投递、工作区…）。'),
    actions: h('button', {
      type: 'button',
      className: 'dchat-button',
      onClick: load,
      disabled: state.phase === 'loading',
    }, state.phase === 'loading' ? t('读取中…') : t('重新读取')),
  },
  state.error
    ? h('p', { className: 'dchat-error' }, `${t('读取失败')}：${state.error}`)
    : null,
  state.phase !== 'loading' && bots.length === 0
    ? h(EmptyState, {
      title: t('这个渠道还没有机器人'),
      description: t('在渠道设置页完成接入（飞书填应用凭据、微信扫码）后，机器人会出现在这里。'),
    }, h('button', {
      type: 'button',
      className: 'dchat-button',
      onClick: () => onOpenSettings(null),
    }, t('打开渠道设置页')))
    : null,
  bots.length > 0
    ? h('ul', { className: 'dchat-botList' }, bots.map((bot) => h('li', {
      key: bot.botId, className: 'dchat-botRow',
    },
    h('div', { className: 'dchat-botMain' },
      h('div', { className: 'dchat-botTitle' },
        h('strong', null, bot.name || bot.botId),
        h(StatusPill, { status: bot.state, label: t(STATE_TEXT[bot.state] ?? '已停止') })),
      h('div', { className: 'dchat-botMeta' },
        h('span', { className: 'dchat-code' }, bot.botId),
        h('span', null, `${t('已处理')} ${bot.handled ?? 0}`),
        h('span', null, `${t('最近')} ${formatTime(bot.lastHandledAt)}`)),
      bot.errorMessage || bot.lastError
        ? h('div', { className: 'dchat-botError' }, bot.errorMessage ?? bot.lastError)
        : null),
    h('button', {
      type: 'button',
      className: 'dchat-button',
      onClick: () => onOpenSettings(bot.botId),
    }, t('设置')))))
    : null);
}
