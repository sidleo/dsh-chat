/**
 * dsh-chat-feishu（client 侧）：把飞书渠道的元数据与设置页注册进 hub。
 *
 * 只依赖运行期契约：client 服务 `chatChannels` / `chatUi`，以及 hub 声明的子槽
 * `chat.channel.page`（keyed，key = 渠道 id）。见仓库 CONTRACT.md。
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
  '渠道插件已加载，协议实现将在 P2 提供。': '渠道插件已加载，协议实现将在 P2 提供。',
  '读取状态': '读取状态',
  '读取中…': '读取中…',
  '状态': '状态',
};
const en = {
  '飞书': 'Feishu',
  '飞书渠道': 'Feishu channel',
  '渠道插件已加载，协议实现将在 P2 提供。':
    'Channel plugin loaded; protocol implementation lands in P2.',
  '读取状态': 'Load status',
  '读取中…': 'Loading…',
  '状态': 'Status',
};

const h = React.createElement;

function FeishuPage(props) {
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
    title: t('飞书渠道'),
    description: t('渠道插件已加载，协议实现将在 P2 提供。'),
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
