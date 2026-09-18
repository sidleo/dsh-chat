/**
 * dsh-chat-weixin（client 侧）：微信设置页（扫码接入 + 账号状态）。
 *
 * 渠道无关的面板（上下文增强等）直接用 hub 的共享组件与 hook。
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
  '已绑定的账号': '已绑定的账号',
  '扫码接入': '扫码接入',
  '重新连接': '重新连接',
  '移除接入': '移除接入',
  '确认移除': '确认移除',
  '取消': '取消',
  '读取状态': '读取状态',
  '读取中…': '读取中…',
  '正在生成二维码…': '正在生成二维码…',
  '用手机微信扫描二维码并在手机上确认。': '用手机微信扫描二维码并在手机上确认。',
  '二维码由腾讯微信 iLink 服务签发；账号凭据只写入本机 Host，浏览器拿不到 token。':
    '二维码由腾讯微信 iLink 服务签发；账号凭据只写入本机 Host，浏览器拿不到 token。',
  '等待扫码': '等待扫码',
  '已扫码，请在手机上确认': '已扫码，请在手机上确认',
  '需要配对码，请在下方输入手机上显示的配对码': '需要配对码，请在下方输入手机上显示的配对码',
  '提交配对码': '提交配对码',
  '二维码已失效，请重新生成': '二维码已失效，请重新生成',
  '该微信账号已在别处绑定': '该微信账号已在别处绑定',
  '已接入，正在启动长轮询…': '已接入，正在启动长轮询…',
  '重新生成二维码': '重新生成二维码',
  '没有已绑定的微信账号': '没有已绑定的微信账号',
  '本机还没有微信账号。点上方「扫码接入」用手机微信扫码绑定。':
    '本机还没有微信账号。点上方「扫码接入」用手机微信扫码绑定。',
  '已处理消息': '已处理消息',
  '状态': '状态',
  '启动中': '启动中',
  '运行正常': '运行正常',
  '重连中': '重连中',
  '启动失败': '启动失败',
  '已停止': '已停止',
  '仅私聊': '仅私聊',
  // hub 的共享组件（上下文增强编辑器）用本渠道的 t 取文案，因此这些键必须在渠道字典里。
  '保存': '保存',
  '保存中…': '保存中…',
  '保存失败，请重试。': '保存失败，请重试。',
};

const en = {
  '微信': 'WeChat',
  '微信渠道': 'WeChat channel',
  '已绑定的账号': 'Linked accounts',
  '扫码接入': 'Scan to link',
  '重新连接': 'Reconnect',
  '移除接入': 'Remove',
  '确认移除': 'Confirm removal',
  '取消': 'Cancel',
  '读取状态': 'Reload',
  '读取中…': 'Loading…',
  '正在生成二维码…': 'Requesting a QR code…',
  '用手机微信扫描二维码并在手机上确认。':
    'Scan the QR code with WeChat on your phone and confirm there.',
  '二维码由腾讯微信 iLink 服务签发；账号凭据只写入本机 Host，浏览器拿不到 token。':
    'The QR code is issued by Tencent iLink; credentials are written on the Host only.',
  '等待扫码': 'Waiting for a scan',
  '已扫码，请在手机上确认': 'Scanned — confirm on your phone',
  '需要配对码，请在下方输入手机上显示的配对码':
    'A pairing code is required; enter the code shown on your phone',
  '提交配对码': 'Submit code',
  '二维码已失效，请重新生成': 'The QR code expired; generate a new one',
  '该微信账号已在别处绑定': 'This WeChat account is already linked elsewhere',
  '已接入，正在启动长轮询…': 'Linked — starting the message connection…',
  '重新生成二维码': 'Generate a new QR code',
  '没有已绑定的微信账号': 'No WeChat account linked',
  '本机还没有微信账号。点上方「扫码接入」用手机微信扫码绑定。':
    'No WeChat account on this Host yet. Use “Scan to link” above.',
  '已处理消息': 'Messages handled',
  '状态': 'State',
  '启动中': 'Starting',
  '运行正常': 'Connected',
  '重连中': 'Reconnecting',
  '启动失败': 'Failed',
  '已停止': 'Stopped',
  '仅私聊': 'Direct messages only',
  '保存': 'Save',
  '保存中…': 'Saving…',
  '保存失败，请重试。': 'Could not save. Try again.',
};

const h = React.createElement;

const STATE_TEXT = {
  starting: '启动中',
  running: '运行正常',
  reconnecting: '重连中',
  failed: '启动失败',
  stopped: '已停止',
};

const STATUS_TEXT = {
  wait: '等待扫码',
  scaned: '已扫码，请在手机上确认',
  need_verifycode: '需要配对码，请在下方输入手机上显示的配对码',
  expired: '二维码已失效，请重新生成',
  verify_code_blocked: '二维码已失效，请重新生成',
  binded_redirect: '该微信账号已在别处绑定',
  connected: '已接入，正在启动长轮询…',
};

function QrLogin({ chatUi, connection, translate, onDone }) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  const [state, setState] = React.useState({ phase: 'idle' });
  const [verifyCode, setVerifyCode] = React.useState('');
  const aliveRef = React.useRef(true);

  React.useEffect(() => () => { aliveRef.current = false; }, []);

  const begin = React.useCallback(async () => {
    setState({ phase: 'starting' });
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'login.begin', {});
      const value = chatUi.unwrapRpc(result);
      if (!aliveRef.current) return;
      setState({ phase: 'waiting', attemptId: value.attemptId, qrcodeUrl: value.qrcodeUrl, status: 'wait' });
    } catch (error) {
      if (aliveRef.current) setState({ phase: 'error', error });
    }
  }, [chatUi, connection]);

  // 轮询扫码状态（服务端长轮询，这里每 2s 一次）。
  React.useEffect(() => {
    if (state.phase !== 'waiting' || !state.attemptId) return undefined;
    let stopped = false;
    const tick = async () => {
      try {
        const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'login.poll', {
          attemptId: state.attemptId,
          ...(verifyCode ? { verifyCode } : {}),
        });
        const value = chatUi.unwrapRpc(result);
        if (stopped || !aliveRef.current) return;
        if (value.status === 'connected') {
          setState({ phase: 'done' });
          onDone?.();
          return;
        }
        setState((current) => ({ ...current, status: value.status }));
        if (value.status === 'expired' || value.status === 'verify_code_blocked') return;
      } catch (error) {
        if (!stopped && aliveRef.current) setState((current) => ({ ...current, error }));
        return;
      }
      if (!stopped) timer = setTimeout(tick, 2_000);
    };
    let timer = setTimeout(tick, 500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [state.phase, state.attemptId, verifyCode, chatUi, connection, onDone]);

  const { Panel } = chatUi.components;

  if (state.phase === 'idle') {
    return h(Panel, {
      title: t('扫码接入'),
      description: t('二维码由腾讯微信 iLink 服务签发；账号凭据只写入本机 Host，浏览器拿不到 token。'),
      actions: h('button', {
        type: 'button', className: 'dchat-button dchat-buttonPrimary', onClick: () => { void begin(); },
      }, t('扫码接入')),
    });
  }
  if (state.phase === 'starting') {
    return h(Panel, { title: t('扫码接入'), description: t('正在生成二维码…') });
  }
  if (state.phase === 'done') {
    return h(Panel, { title: t('扫码接入'), description: t('已接入，正在启动长轮询…') });
  }
  if (state.phase === 'error') {
    return h(Panel, {
      title: t('扫码接入'),
      actions: h('button', {
        type: 'button', className: 'dchat-button', onClick: () => { void begin(); },
      }, t('重新生成二维码')),
    }, h('p', { className: 'dchat-error', role: 'alert' }, state.error?.message ?? '发起扫码失败。'));
  }

  const expired = status => status === 'expired' || status === 'verify_code_blocked';
  return h(Panel, {
    title: t('扫码接入'),
    description: t('用手机微信扫描二维码并在手机上确认。'),
    actions: h('button', {
      type: 'button', className: 'dchat-button', onClick: () => { void begin(); },
    }, t('重新生成二维码')),
  },
  state.qrcodeUrl
    ? h('img', {
      src: state.qrcodeUrl,
      alt: t('扫码接入'),
      style: { width: 200, height: 200, imageRendering: 'pixelated' },
    })
    : null,
  h('p', { className: 'dchat-cardDescription' }, t(STATUS_TEXT[state.status] ?? '等待扫码')),
  state.status === 'need_verifycode'
    ? h('div', { className: 'dchat-actions' },
      h('input', {
        type: 'text', value: verifyCode, placeholder: t('提交配对码'),
        onChange: (event) => setVerifyCode(event.target.value),
      }))
    : null,
  expired(state.status) ? h('p', { className: 'dchat-error' }, t('二维码已失效，请重新生成')) : null);
}

function AccountCard({ account, chatUi, connection, translate, onChanged }) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  const { Panel, StatusPill, ContextEnhancementEditor, DeliveryTargetsEditor } = chatUi.components;
  const settings = chatUi.hooks.useBotSettings({
    connection, channelId: CHANNEL_ID, botId: account.botId,
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

  return h(Panel, {
    title: account.botName ?? account.accountIdMasked,
    description: `${account.accountIdMasked} · ${t('仅私聊')}`,
    actions: h('div', { className: 'dchat-actions' },
      h(StatusPill, { status: account.state, label: t(STATE_TEXT[account.state] ?? '状态') }),
      h('button', {
        type: 'button', className: 'dchat-button', disabled: busy,
        onClick: async () => {
          try {
            await run('account.reconnect', { botId: account.botId });
            await onChanged?.();
          } catch { /* 错误已展示 */ }
        },
      }, t('重新连接')),
      confirming
        ? h(React.Fragment, null,
          h('button', {
            type: 'button', className: 'dchat-button', disabled: busy,
            onClick: async () => {
              try {
                await run('account.delete', { botId: account.botId, confirm: true });
                setConfirming(false);
                await onChanged?.();
              } catch { /* 错误已展示 */ }
            },
          }, t('确认移除')),
          h('button', {
            type: 'button', className: 'dchat-button', disabled: busy,
            onClick: () => setConfirming(false),
          }, t('取消')))
        : h('button', {
          type: 'button', className: 'dchat-button', disabled: busy,
          onClick: () => setConfirming(true),
        }, t('移除接入'))),
  },
  account.errorMessage
    ? h('p', { className: 'dchat-error', role: 'alert' }, account.errorMessage)
    : null,
  error ? h('p', { className: 'dchat-error', role: 'alert' }, error) : null,
  h('div', { className: 'dchat-list' },
    h('div', { className: 'dchat-listItem' },
      h('span', null, t('已处理消息')),
      h('span', null, String(account.handled ?? 0)))),
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
    botId: account.botId,
  }));
}

function WeixinPage(props) {
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
  const allAccounts = state.value?.accounts ?? [];
  const accounts = botId ? allAccounts.filter((account) => account.botId === botId) : allAccounts;

  return h(React.Fragment, null,
    h(Panel, {
      title: t('微信渠道'),
      description: `dataDir：${state.value?.dataDir ?? '—'}`,
      actions: h('button', {
        type: 'button', className: 'dchat-button',
        disabled: state.phase === 'loading',
        onClick: () => { void load(); },
      }, state.phase === 'loading' ? t('读取中…') : t('读取状态')),
    },
    state.error ? h('p', { className: 'dchat-error', role: 'alert' }, state.error.message) : null,
    state.phase === 'ready' && accounts.length === 0
      ? h(EmptyState, {
        title: t('没有已绑定的微信账号'),
        description: t('本机还没有微信账号。点上方「扫码接入」用手机微信扫码绑定。'),
      })
      : null),
    h(QrLogin, { chatUi, connection, translate: t, onDone: load }),
    accounts.map((account) => h(AccountCard, {
      key: account.botId, account, chatUi, connection, translate: t, onChanged: load,
    })));
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
    // 侧边栏会话行的渠道徽标（微信品牌绿）。
    // 图标（SVG 字符串）：左栏渠道卡片与侧边栏会话行徽标共用同一份，避免两处画风不一致。
    // 出处见 THIRD_PARTY_NOTICES.md。
    icon: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="#07C160" d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>' },
    sessionBadge: { text: '微', color: '#07c160' },
    capabilities: { groups: false, note: t('仅私聊') },
  }), 'dsh-chat-weixin: 渠道元数据');

  ctx.effect(() => ctx.slots.inject(PAGE_SLOT, () => ctx.slots.register({
    name: PAGE_SLOT,
    key: CHANNEL_ID,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ chatUi: ctx.chatUi, connection: ctx.connection, translate: t }),
  }, WeixinPage)), 'dsh-chat-weixin: 渠道设置页');
}
