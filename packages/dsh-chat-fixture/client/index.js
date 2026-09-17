/**
 * dsh-chat-fixture（client 侧）：契约验证用的假渠道页面。
 *
 * 同时充当"渠道页怎么写"的参考实现：用 hub 的 chatUi 组件与 useBotSettings 钩子
 * 接好每机器人设置，不重复实现 RPC、加载态与错误处理。
 *
 * @module dsh-chat-fixture/client
 */

import * as React from 'react';

export const name = 'dsh-chat-fixture-client';

export const inject = ['slots', 'locale', 'connection', 'chatChannels', 'chatUi'];

const CHANNEL_ID = 'fixture';
const PAGE_SLOT = 'chat.channel.page';
const LOCALE_NAMESPACE = 'dsh-chat-fixture';
const DEMO_BOT_ID = 'fixture-bot';

const zh = {
  '试用渠道': '试用渠道',
  '契约验证用假渠道：不连接任何平台。': '契约验证用假渠道：不连接任何平台。',
  '回显': '回显',
  '解析上下文增强': '解析上下文增强',
  '机器人设置': '机器人设置',
  '过程展示（组件演示）': '过程展示（组件演示）',
  '结果': '结果',
};
const en = {
  '试用渠道': 'Fixture channel',
  '契约验证用假渠道：不连接任何平台。': 'Contract fixture channel: connects to nothing.',
  '回显': 'Echo',
  '解析上下文增强': 'Resolve context enhancement',
  '机器人设置': 'Bot settings',
  '过程展示（组件演示）': 'Progress display (component demo)',
  '结果': 'Result',
};

const h = React.createElement;

/** 演示"指定用户 + 叠加全局提示词"的解析结果。 */
const SAMPLE_CONFIG = {
  group: { enabled: true, fields: ['senderId'], guidance: '群聊全局提示词' },
  direct: { enabled: true, fields: ['senderId', 'senderName'], guidance: '私聊全局提示词' },
  targets: [
    {
      kind: 'user',
      id: 'ou_demo_user',
      label: '演示用户',
      enabled: true,
      fields: ['senderId'],
      guidance: '该用户专属提示词',
      merge: 'append',
    },
  ],
};

const MODE_OPTIONS = [
  { value: 'off', label: '不显示过程', help: '只回复最终答案。' },
  { value: 'card', label: '实时过程卡', help: '过程与答案在同一张卡片里原地刷新。' },
  { value: 'steps', label: '逐步直播', help: '每一步单独发一条消息。' },
];

function FixturePage(props) {
  const { chatUi, connection, translate } = props;
  const t = typeof translate === 'function' ? translate : (key) => key;
  const [output, setOutput] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [mode, setMode] = React.useState({ direct: 'off', group: 'off' });

  const bot = chatUi.hooks.useBotSettings({
    connection, channelId: CHANNEL_ID, botId: DEMO_BOT_ID,
  });

  const run = React.useCallback(async (method, payload) => {
    setBusy(true);
    setError(null);
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, method, payload);
      setOutput(chatUi.unwrapRpc(result));
    } catch (cause) {
      setError(cause);
      setOutput(null);
    } finally {
      setBusy(false);
    }
  }, [chatUi, connection]);

  const { Panel } = chatUi.components;

  return h(React.Fragment, null,
    h(Panel, {
      title: t('试用渠道'),
      description: t('契约验证用假渠道：不连接任何平台。'),
      actions: h('div', { className: 'dchat-actions' },
        h('button', {
          type: 'button', className: 'dchat-button', disabled: busy,
          onClick: () => run('echo', { hello: 'world' }),
        }, t('回显')),
        h('button', {
          type: 'button', className: 'dchat-button', disabled: busy,
          onClick: () => run('context.resolve', {
            config: SAMPLE_CONFIG,
            conversationType: 'direct',
            identity: { senderId: 'ou_demo_user' },
          }),
        }, t('解析上下文增强'))),
    },
    error ? h('p', { className: 'dchat-error', role: 'alert' }, error.message) : null,
    output ? h('div', { className: 'dchat-list' },
      h('div', { className: 'dchat-listItem' },
        h('span', null, t('结果')),
        h('code', { className: 'dchat-code' }, JSON.stringify(output)))) : null),

    h(Panel, { title: t('机器人设置'), description: `botId：${DEMO_BOT_ID}` },
      h(chatUi.components.ContextEnhancementEditor, {
        config: bot.record?.contextEnhancement ?? null,
        disabled: bot.phase !== 'ready',
        translate: t,
        onSave: bot.saveContextEnhancement,
      })),

    h(chatUi.components.ScopedModeEditor, {
      title: t('过程展示（组件演示）'),
      description: '通用"两作用域 × 多选项"组件，飞书渠道会用它承载任务过程展示。',
      scopes: [{ key: 'direct', label: '私聊' }, { key: 'group', label: '群聊' }],
      options: MODE_OPTIONS,
      value: mode,
      translate: t,
      onSave: async (next) => setMode(next),
    }));
}

/**
 * Cordis client 插件入口。
 *
 * @param ctx - client 上下文。
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
    'dsh-chat-fixture: 双语文案');
  const t = typeof ctx.locale?.bind === 'function'
    ? ctx.locale.bind(LOCALE_NAMESPACE)
    : (key) => zh[key] ?? key;

  ctx.effect(() => ctx.chatChannels.register({
    id: CHANNEL_ID,
    order: 90,
    label: () => t('试用渠道'),
    capabilities: { fixture: true },
  }), 'dsh-chat-fixture: 渠道元数据');

  ctx.effect(() => ctx.slots.inject(PAGE_SLOT, () => ctx.slots.register({
    name: PAGE_SLOT,
    key: CHANNEL_ID,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ chatUi: ctx.chatUi, connection: ctx.connection, translate: t }),
  }, FixturePage)), 'dsh-chat-fixture: 渠道设置页');
}
