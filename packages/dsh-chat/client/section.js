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
  const [selected, setSelected] = React.useState(null);
  const activeId = entries.some((entry) => entry.id === selected)
    ? selected
    : (entries[0]?.id ?? null);

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
        entries.map((entry) => h('button', {
          key: entry.id,
          type: 'button',
          role: 'tab',
          id: `dchat-tab-${entry.id}`,
          className: 'dchat-channel',
          'aria-selected': entry.id === activeId,
          'aria-controls': `dchat-panel-${entry.id}`,
          onClick: () => {
            setSelected(entry.id);
            backToBots();
          },
        },
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
      // 右上角入口：版本与更新（展开后是同一块面板，收起时不请求数据）。
      // 用文字链接形态，避免和 DSH 自己的实心按钮（打开配置文件）平级抢注意力。
      h('button', {
        type: 'button',
        className: 'dchat-button dchat-buttonLink',
        'aria-expanded': showVersions,
        onClick: () => setShowVersions((open) => !open),
      }, showVersions ? t('收起版本与更新') : t('版本与更新'))),
    showVersions
      ? h(VersionPanel, { connection, chatUi, translate: t })
      : null,
    body);
}
