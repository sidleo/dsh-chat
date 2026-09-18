/**
 * 「诊断」面板：出故障时的自助现场。
 *
 * 为什么要有它：这个项目的排查一直在"用户描述现象 → 我去读日志"之间来回，而日志就在
 * `~/.dsh/integrations/dsh-chat/logs/`。把**每台机器人的连接状态、最近错误、日志尾部**
 * 直接摆进设置页，用户自己就能看明白"是没连上、还是缺权限、还是呈现层发不出去"。
 *
 * 数据全部来自 hub 控制端点的 `diagnostics.read`（host 侧读文件；浏览器不猜路径、不碰文件系统）。
 *
 * @module dsh-chat/client/diagnostics
 */

import * as React from 'react';

const h = React.createElement;

const STATE_TEXT = Object.freeze({
  running: '运行中',
  starting: '启动中',
  stopped: '已停止',
  failed: '启动失败',
});

function formatSize(bytes) {
  if (typeof bytes !== 'number' || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatTime(iso) {
  if (typeof iso !== 'string' || !iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * 诊断面板。
 *
 * @param props - { connection, chatUi, translate, t }。
 * @returns React 元素。
 */
export function DiagnosticsPanel(props) {
  const { connection, chatUi, translate, t: frameworkT } = props;
  const t = typeof translate === 'function' ? translate
    : (typeof frameworkT === 'function' ? frameworkT : (key) => key);
  const [state, setState] = React.useState({ loading: true, error: null, info: null });
  /** 展开的日志文件路径（一次只看一个，免得面板被日志压满）。 */
  const [openLog, setOpenLog] = React.useState(null);

  const load = React.useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    chatUi.callControlRpc(connection, 'diagnostics.read', {})
      .then((result) => {
        setState({ loading: false, error: null, info: chatUi.unwrapRpc(result) });
      })
      .catch((error) => {
        setState({ loading: false, error: error?.message ?? String(error), info: null });
      });
  }, [chatUi, connection]);

  React.useEffect(() => {
    load();
  }, [load]);

  const Panel = chatUi.components.Panel;
  const StatusPill = chatUi.components.StatusPill;
  const info = state.info;

  const statusLabel = (channel) => {
    if (channel.status === 'running') return t('渠道已就绪');
    if (channel.status === 'failed') return t('渠道启动失败');
    if (channel.status === 'stopped') return t('渠道已停止');
    return t('渠道正在启动');
  };

  const botRow = (bot) => h('li', { key: bot.id, className: 'dchat-diagBot' },
    // 一行放不下就整块换行：id 会省略号收缩，右侧元信息不拆字。
    h('div', { className: 'dchat-listItem dchat-diagRow' },
      h('span', { className: 'dchat-code' }, bot.id),
      h('span', { className: 'dchat-diagMeta' },
        `${STATE_TEXT[bot.state] ? t(STATE_TEXT[bot.state]) : (bot.state ?? '—')}`
        + ` · ${bot.connected ? t('已连接') : t('未连接')}`
        + ` · ${t('已处理')} ${bot.handled ?? 0}`
        + (bot.lastHandledAt ? ` · ${formatTime(bot.lastHandledAt)}` : ''))),
    // 失败必须可见：连接错误、最近一次处理错误、名字拿不到（多为缺权限，带开通链接）。
    bot.errorMessage
      ? h('p', { className: 'dchat-error', role: 'alert' }, bot.errorMessage)
      : null,
    bot.lastError
      ? h('p', { className: 'dchat-error', role: 'alert' }, `${t('最近一次错误')}：${bot.lastError}`)
      : null,
    bot.nameHint
      ? h('p', { className: 'dchat-cardDescription' },
        `${bot.nameHint.message} `,
        bot.nameHint.url
          ? h('a', { href: bot.nameHint.url, target: '_blank', rel: 'noreferrer' }, t('去开通权限'))
          : null)
      : null);

  return h(Panel, {
    title: t('诊断'),
    description: t('出故障时先看这里：连接状态、最近错误、日志尾部。'),
    actions: h('button', {
      type: 'button',
      className: 'dchat-button',
      onClick: load,
      disabled: state.loading,
    }, state.loading ? t('读取中…') : t('重新读取')),
  },
  state.error
    ? h('p', { className: 'dchat-error' }, `${t('读取失败')}：${state.error}`)
    : null,
  ...(info?.channels ?? []).map((channel) => h('div', {
    key: channel.id, className: 'dchat-diagSection',
  },
  h('div', { className: 'dchat-diagHead' },
    h('span', { className: 'dchat-groupTitle' }, `${channel.label} · ${channel.version ?? '—'}`),
    h(StatusPill, { status: channel.status, label: statusLabel(channel) })),
  channel.statusError
    ? h('p', { className: 'dchat-error', role: 'alert' }, channel.statusError)
    : null,
  channel.bots.length === 0
    ? h('p', { className: 'dchat-cardDescription' }, t('这台渠道下还没有机器人。'))
    : h('ul', { className: 'dchat-list' }, ...channel.bots.map(botRow)))),
  info
    ? h('ul', { className: 'dchat-list' },
      h('li', { className: 'dchat-listItem' },
        h('span', null, t('数据目录')),
        h('code', { className: 'dchat-code' }, info.dataDir ?? '—')),
      h('li', { className: 'dchat-listItem' },
        h('span', null, t('日志目录')),
        h('code', { className: 'dchat-code' }, info.logDir ?? '—')))
    : null,
  ...(info?.logs ?? []).map((log) => {
    const name = String(log.path ?? '').split('/').pop();
    const open = openLog === log.path;
    return h('div', { key: log.path, className: 'dchat-diagSection' },
      // 与机器人行同构：文件名 + 大小时间一行，展开按钮单独一行（窄栏下挤不下）。
      h('div', { className: 'dchat-diagBot' },
        h('div', { className: 'dchat-listItem dchat-diagRow' },
          h('span', { className: 'dchat-code' }, name),
          h('span', { className: 'dchat-diagMeta' },
            log.exists
              ? `${formatSize(log.size)} · ${formatTime(log.modifiedAt)}`
              : t('还没有日志'))),
        h('div', { className: 'dchat-actions' },
          h('button', {
            type: 'button',
            className: 'dchat-button dchat-buttonLink',
            disabled: !log.exists,
            'aria-expanded': open,
            onClick: () => setOpenLog(open ? null : log.path),
          }, open ? t('收起') : t('看最后 40 行')))),
      open
        ? h('pre', { className: 'dchat-code dchat-codeBlock dchat-logTail' }, log.lines.join('\n'))
        : null);
  }));
}
