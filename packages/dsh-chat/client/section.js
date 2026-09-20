/**
 * 设置页「Chat机器人」入口：一个 hub 入口 + 由已安装渠道插件动态生成的左栏。
 *
 * 渠道页由各渠道包注册到 hub 声明的子槽 `chat.channel.page`（keyed，key = 渠道 id）。
 *
 * @module dsh-chat/client/section
 */

import * as React from 'react';

import { channelIconUri } from '../shared/channel-rail.mjs';
import { CHANNEL_PAGE_SLOT } from '../shared/contract.mjs';
import { BotList } from './bot-list.js';
import { DiagnosticsPanel } from './diagnostics.js';
import { CHANNEL_ORDER_KEY, orderedItems, useListOrder } from './list-order.js';
import { VersionPanel } from './version-panel.js';

const h = React.createElement;

/** 未安装任何渠道插件时给出的安装提示。 */
const KNOWN_CHANNEL_PACKAGES = Object.freeze([
  'dsh-chat-feishu',
  'dsh-chat-weixin',
]);

function ChannelMark({ entry }) {
  // 渠道图标（和侧边栏会话行徽标同一份）；没有图标才退回首字母。
  const iconUri = channelIconUri(entry.icon);
  if (iconUri) {
    return h('span', {
      // 有真图标就不套那个"字母块"的边框与底色，让它看起来就是应用图标。
      className: 'dchat-channelMark dchat-channelMarkIcon',
      'aria-hidden': 'true',
    }, h('img', { src: iconUri, alt: '', width: 20, height: 20 }));
  }
  if (typeof entry.logo === 'function') {
    return h('span', { className: 'dchat-channelMark', 'aria-hidden': 'true' }, h(entry.logo));
  }
  const initial = entry.id.slice(0, 1).toUpperCase();
  return h('span', { className: 'dchat-channelMark', 'aria-hidden': 'true' }, initial);
}

/**
 * 设置页 section 组件。props 由 slot 框架注入：`t` / `renderSlot` 与注册时的 `inject`。
 *
 * @param props - { channels, chatUi, translate, t, renderSlot }。
 * @returns React 元素。
 */
export function ChatSettingsSection(props) {
  const { channels, chatUi, translate, t: frameworkT, renderSlot, connection } = props;
  /** 版本与更新默认收起：右上角入口按需展开（只在展开时读一次数据）。 */
  const [showVersions, setShowVersions] = React.useState(false);
  /** 诊断同理：不看时不请求（读日志要碰文件系统，没必要常驻）。 */
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);
  /**
   * 右栏两级视图：`{ kind: 'bots' }` 机器人列表 → `{ kind: 'channel', botId }` 机器人设置页。
   * 和 dsh-im 同构：渠道 → 机器人 → 设置。
   */
  const [view, setView] = React.useState({ kind: 'bots', botId: null });
  const t = typeof translate === 'function' ? translate
    : (typeof frameworkT === 'function' ? frameworkT : (key) => key);

  const entries = React.useSyncExternalStore(
    (onChange) => channels.subscribe(onChange),
    () => channels.getSnapshot(),
    () => channels.getSnapshot(),
  );
  /**
   * 左栏渠道顺序：用户拖动过就按用户顺序排，没排过的（新装的渠道）排在后面。
   *
   * 纯显示偏好（存浏览器），所以拖动只影响这台浏览器看到的顺序——渠道注册时的 `order`
   * 仍然是所有机器的默认顺序。
   */
  const channelOrder = useListOrder(CHANNEL_ORDER_KEY, (entry) => entry?.id);
  const orderedEntries = React.useMemo(
    () => orderedItems(entries, channelOrder.order, (entry) => entry?.id),
    [entries, channelOrder.order],
  );
  /**
   * 正在拖动的渠道：**用 ref 记住"拖的是谁"**，state 只负责高亮。
   *
   * 一开始只用 state，结果同一个任务里连着派发 dragstart/drop 时（React 把几次 setState
   * 批到一起，drop 的闭包里读到的还是 null）顺序不会变——真实浏览器里两次事件分属不同任务，
   * 所以只在自动化里暴露。用 ref 更稳：互不依赖渲染时机。
   */
  const dragChannelRef = React.useRef(null);
  const [dragChannel, setDragChannel] = React.useState(null);
  const [dropChannel, setDropChannel] = React.useState(null);

  const [selected, setSelected] = React.useState(null);
  /**
   * 当前选中的渠道：用户点过就用他点的那个，否则用**排在最前面的那个**。
   *
   * 这里必须用 `orderedEntries`：用注册顺序的 `entries[0]` 时，用户把顺序调成
   * 「飞书在前、微信在后」，一进设置页却仍然默认打开微信（真机反馈）——
   * 默认项当然应该跟他自己排的第一项一致。
   */
  const activeId = entries.some((entry) => entry.id === selected)
    ? selected
    : (orderedEntries[0]?.id ?? null);

  // 切换渠道时回到"机器人列表"，否则会带着上一个渠道的 botId 进错页。
  const activeEntry = entries.find((entry) => entry.id === activeId) ?? null;
  const openSettings = (botId) => setView({ kind: 'channel', botId });
  const backToBots = () => setView({ kind: 'bots', botId: null });

  const EmptyState = chatUi?.components?.EmptyState;

  /** 一级视图：机器人列表。 */
  function botListView() {
    if (!activeEntry) return null;
    return h(BotList, {
      key: activeEntry.id,
      channelId: activeEntry.id,
      label: activeEntry.label,
      // 渠道能力说明（如「仅私聊」）放右栏标题下：左栏只留"图标 + 渠道名"，形态才整齐。
      note: activeEntry.capabilities?.note ?? null,
      connection,
      chatUi,
      translate: t,
      onOpenSettings: openSettings,
    });
  }

  /** 二级视图：机器人（或整个渠道）的设置页（返回条由外层给）。 */
  function channelView() {
    return h(React.Fragment, null,
      typeof renderSlot === 'function'
        ? renderSlot(
          CHANNEL_PAGE_SLOT,
          { channelId: activeId, botId: view.botId },
          { entryKey: activeId },
        )
        : h('p', { className: 'dchat-cardDescription' }, t('当前页面不支持渠道子槽。')));
  }

  /** 二级视图的返回条。 */
  function backBar() {
    return h('div', { className: 'dchat-panelBar' },
      h('button', {
        type: 'button', className: 'dchat-button', onClick: backToBots,
      }, t('← 机器人列表')));
  }

  let body = null;
  if (entries.length === 0) {
    body = EmptyState
      ? h(EmptyState, {
        title: t('未安装任何聊天软件插件'),
        description: t('安装渠道插件后，这里会出现对应的聊天软件。'),
      }, h('ul', { className: 'dchat-list' },
        h('li', { className: 'dchat-listItem' }, t('已知渠道插件')),
        ...KNOWN_CHANNEL_PACKAGES.map((name) => h('li', {
          key: name, className: 'dchat-listItem',
        }, h('code', { className: 'dchat-code' }, `dsh plugin --profile web add ${name}`)))))
      : null;
  } else if (view.kind !== 'bots') {
    // 进了机器人设置：不再保留左栏渠道列表——这时它没用，还占掉一半宽度。
    body = h('div', { className: 'dchat-solo' }, backBar(), channelView());
  } else {
    body = h('div', { className: 'dchat-layout' },
      h('nav', { className: 'dchat-rail', role: 'tablist', 'aria-label': t('渠道导航') },
        orderedEntries.map((entry) => h('button', {
          key: entry.id,
          type: 'button',
          role: 'tab',
          id: `dchat-tab-${entry.id}`,
          className: `dchat-channel${dropChannel === entry.id && dragChannel !== entry.id ? ' dchat-dropTarget' : ''}`,
          'aria-selected': entry.id === activeId,
          'aria-controls': `dchat-panel-${entry.id}`,
          onClick: () => {
            setSelected(entry.id);
            backToBots();
          },
          // 拖动排序：把手是那个 grip（button 自己 draggable 在部分浏览器上不灵，
          // 而且整行可拖会与"点一下切换渠道"抢手势）。
          onDragOver: (event) => {
            const from = dragChannelRef.current;
            if (!from || from === entry.id) return;
            event.preventDefault();
            setDropChannel(entry.id);
          },
          onDrop: (event) => {
            event.preventDefault();
            const from = dragChannelRef.current;
            if (from && from !== entry.id) channelOrder.move(orderedEntries, from, entry.id);
            dragChannelRef.current = null;
            setDropChannel(null);
            setDragChannel(null);
          },
        },
        h('span', {
          className: 'dchat-grip',
          draggable: true,
          title: t('拖动可调整顺序'),
          'aria-hidden': 'true',
          onDragStart: (event) => {
            dragChannelRef.current = entry.id;
            setDragChannel(entry.id);
            // Firefox 不设 dataTransfer 就不会开始拖。
            event.dataTransfer?.setData('text/plain', entry.id);
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
          },
          onDragEnd: () => {
            dragChannelRef.current = null;
            setDragChannel(null);
            setDropChannel(null);
          },
        }, '⋮⋮'),
        h(ChannelMark, { entry }),
        h('span', { className: 'dchat-channelLabel' },
          h('strong', null, entry.label()))))),
      h('main', {
        className: 'dchat-panel',
        role: 'tabpanel',
        id: `dchat-panel-${activeId}`,
        'aria-labelledby': `dchat-tab-${activeId}`,
      }, botListView()));
  }

  return h('section', { className: 'dchat-page', 'aria-label': t('Chat机器人设置') },
    h('header', { className: 'dchat-header' },
      h('div', { className: 'dchat-brand' },
        h('strong', { className: 'dchat-brandName' }, 'DSH-Chat'),
        h('span', { className: 'dchat-brandHint' }, t('Chat机器人'))),
      // 右上角入口：版本与更新 / 诊断（展开后是同一块面板，收起时不请求数据）。
      // 用文字链接形态，避免和 DSH 自己的实心按钮（打开配置文件）平级抢注意力。
      h('div', { className: 'dchat-headerActions' },
        h('button', {
          type: 'button',
          className: 'dchat-button dchat-buttonLink',
          'aria-expanded': showDiagnostics,
          onClick: () => setShowDiagnostics((open) => !open),
        }, showDiagnostics ? t('收起诊断') : t('诊断')),
        h('button', {
          type: 'button',
          className: 'dchat-button dchat-buttonLink',
          'aria-expanded': showVersions,
          onClick: () => setShowVersions((open) => !open),
        }, showVersions ? t('收起版本与更新') : t('版本与更新')))),
    showDiagnostics
      ? h(DiagnosticsPanel, { connection, chatUi, translate: t })
      : null,
    showVersions
      ? h(VersionPanel, { connection, chatUi, translate: t })
      : null,
    body);
}
