/**
 * 「版本与更新」面板：hub / 契约 / 各渠道包版本 + 连接状态 + 更新做法。
 *
 * 数据来自 hub 控制端点的 `channel.list`（`{ hubVersion, hubPackage, contractVersion,
 * dataDir, logDir, channels }`）——版本一律由 host 侧给，浏览器不猜。
 * 放在设置页底部：一眼能看到"现在跑的是哪个版本、有没有渠道启动失败、怎么升级"。
 *
 * @module dsh-chat/client/version-panel
 */

import * as React from 'react';

const h = React.createElement;

/** 升级命令里的包名（本地 link 安装时指向仓库路径）。 */
const CHANNEL_PACKAGE_HINTS = Object.freeze({
  feishu: 'dsh-chat-feishu',
  weixin: 'dsh-chat-weixin',
});

/**
 * 版本与更新面板。
 *
 * @param props - { connection, chatUi, translate, t }。
 * @returns React 元素。
 */
export function VersionPanel(props) {
  const { connection, chatUi, translate, t: frameworkT } = props;
  const t = typeof translate === 'function' ? translate
    : (typeof frameworkT === 'function' ? frameworkT : (key) => key);
  const [state, setState] = React.useState({ loading: true, error: null, info: null });

  const load = React.useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    chatUi.callControlRpc(connection, 'channel.list', {})
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

  return h(Panel, {
    title: t('版本与更新'),
    description: t('升级插件后需要重启 dsh；只改设置页代码则刷新页面即可。'),
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
  h('ul', { className: 'dchat-list' },
    h('li', { className: 'dchat-listItem' },
      h('span', null, t('Chat机器人内核')),
      h('code', { className: 'dchat-code' },
        `${info?.hubPackage ?? '@sidleo3/dsh-chat'} ${info?.hubVersion ?? '…'}`)),
    h('li', { className: 'dchat-listItem' },
      h('span', null, t('渠道契约版本')),
      h('code', { className: 'dchat-code' }, `v${info?.contractVersion ?? '…'}`)),
    ...(info?.channels ?? []).map((channel) => h('li', {
      key: channel.id, className: 'dchat-listItem',
    },
    h('span', null, `${channel.label} · ${CHANNEL_PACKAGE_HINTS[channel.id] ?? channel.id}`),
    h('span', { className: 'dchat-versionMeta' },
      h('code', { className: 'dchat-code' }, channel.version ?? '—'),
      h(StatusPill, {
        status: channel.status,
        label: channel.status === 'running' ? t('渠道已就绪') : (channel.error ? t('渠道启动失败') : t('渠道正在启动')),
      }))))),
  info?.dataDir
    ? h('ul', { className: 'dchat-list' },
      h('li', { className: 'dchat-listItem' },
        h('span', null, t('数据目录')),
        h('code', { className: 'dchat-code' }, info.dataDir)),
      h('li', { className: 'dchat-listItem' },
        h('span', null, t('日志目录')),
        h('code', { className: 'dchat-code' }, info.logDir)))
    : null,
  h('div', { className: 'dchat-updateHint' },
    h('p', { className: 'dchat-cardDescription' }, t('更新方式：`dsh plugin --profile web add @sidleo3/dsh-chat`（从 npm），或从仓库重新打包后让 DSH 重新加载。')),
    h('code', { className: 'dchat-code dchat-codeBlock' }, 'npm run check'),
    h('code', { className: 'dchat-code dchat-codeBlock' },
      'dsh plugin --profile web add @sidleo3/dsh-chat')));;
}
