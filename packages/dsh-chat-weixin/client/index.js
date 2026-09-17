/**
 * dsh-chat-weixin（client 侧）：把微信渠道的元数据与设置页注册进 hub。
 *
 * @module dsh-chat-weixin/client
 */

import * as React from 'react';

export const name = 'dsh-chat-weixin-client';

export const inject = ['slots', 'locale', 'connection', 'chatChannels', 'chatUi'];

const CHANNEL_ID = 'weixin';
const PAGE_SLOT = 'chat.channel.page';
const LOCALE_NAMESPACE = 'dsh-chat-weixin';

const zh = {
  '微信': '微信',
  '微信渠道': '微信渠道',
  '渠道插件已加载，iLink 协议实现将在 P3 提供（当前仅私聊）。':
    '渠道插件已加载，iLink 协议实现将在 P3 提供（当前仅私聊）。',
  '读取状态': '读取状态',
  '读取中…': '读取中…',
  '状态': '状态',
};
const en = {
  '微信': 'WeChat',
  '微信渠道': 'WeChat channel',
  '渠道插件已加载，iLink 协议实现将在 P3 提供（当前仅私聊）。':
    'Channel plugin loaded; iLink protocol lands in P3 (direct messages only).',
  '读取状态': 'Load status',
  '读取中…': 'Loading…',
  '状态': 'Status',
};

const h = React.createElement;

function WeixinPage(props) {
  const { chatUi, connection, translate } = props;
  const t = typeof translate === 'function' ? translate : (key) => key;
  const [state, setState] = React.useState({ phase: 'idle', value: null, error: null });

  const load = React.useCallback(async () => {
    setState({ phase: 'loading', value: null, error: null });
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'connection.status', {});
      setState({ phase: 'done', value: chatUi.unwrapRpc(result), error: null });
    } catch (error) {
      setState({ phase: 'error', value: null, error });
    }
  }, [chatUi, connection]);

  const { Panel, StatusPill } = chatUi.components;

  return h(Panel, {
    title: t('微信渠道'),
    description: t('渠道插件已加载，iLink 协议实现将在 P3 提供（当前仅私聊）。'),
    actions: h('button', {
      type: 'button',
      className: 'dchat-button',
      disabled: state.phase === 'loading',
      onClick: load,
    }, state.phase === 'loading' ? t('读取中…') : t('读取状态')),
  },
  state.phase === 'idle' ? null : h('div', { className: 'dchat-list' },
    h('div', { className: 'dchat-listItem' },
      h('span', null, t('状态')),
      state.error
        ? h(StatusPill, { status: 'failed', label: state.error.message })
        : h(StatusPill, {
          status: state.value?.phase === 'skeleton' ? 'starting' : 'running',
          label: state.value?.phase ?? 'ok',
        })),
    state.value
      ? h('div', { className: 'dchat-listItem' },
        h('span', null, 'dataDir'),
        h('code', { className: 'dchat-code' }, state.value.dataDir ?? '—'))
      : null));
}

/**
 * Cordis client 插件入口。
 *
 * @param ctx - client 上下文。
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
    'dsh-chat-weixin: 双语文案');
  const t = typeof ctx.locale?.bind === 'function'
    ? ctx.locale.bind(LOCALE_NAMESPACE)
    : (key) => zh[key] ?? key;

  ctx.effect(() => ctx.chatChannels.register({
    id: CHANNEL_ID,
    order: 10,
    label: () => t('微信'),
    capabilities: { groups: false, note: t('仅私聊') },
  }), 'dsh-chat-weixin: 渠道元数据');

  ctx.effect(() => ctx.slots.inject(PAGE_SLOT, () => ctx.slots.register({
    name: PAGE_SLOT,
    key: CHANNEL_ID,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ chatUi: ctx.chatUi, connection: ctx.connection, translate: t }),
  }, WeixinPage)), 'dsh-chat-weixin: 渠道设置页');
}
