/**
 * 设置页「Chat机器人」入口：一个 hub 入口 + 由已安装渠道插件动态生成的左栏。
 *
 * 渠道页由各渠道包注册到 hub 声明的子槽 `chat.channel.page`（keyed，key = 渠道 id）。
 *
 * @module dsh-chat/client/section
 */

import * as React from 'react';

import { CHANNEL_PAGE_SLOT } from '../shared/contract.mjs';
import { VersionPanel } from './version-panel.js';

const h = React.createElement;

/** 未安装任何渠道插件时给出的安装提示。 */
const KNOWN_CHANNEL_PACKAGES = Object.freeze([
  'dsh-chat-feishu',
  'dsh-chat-weixin',
]);

function ChannelMark({ entry }) {
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

  const EmptyState = chatUi?.components?.EmptyState;
  const body = entries.length === 0
    ? (EmptyState
      ? h(EmptyState, {
        title: t('未安装任何聊天软件插件'),
        description: t('安装渠道插件后，这里会出现对应的聊天软件。'),
      }, h('ul', { className: 'dchat-list' },
        h('li', { className: 'dchat-listItem' }, t('已知渠道插件')),
        ...KNOWN_CHANNEL_PACKAGES.map((name) => h('li', {
          key: name, className: 'dchat-listItem',
        }, h('code', { className: 'dchat-code' }, `dsh plugin --profile web add ${name}`)))))
      : null)
    : h('div', { className: 'dchat-layout' },
      h('nav', { className: 'dchat-rail', role: 'tablist', 'aria-label': t('渠道导航') },
        entries.map((entry) => h('button', {
          key: entry.id,
          type: 'button',
          role: 'tab',
          id: `dchat-tab-${entry.id}`,
          className: 'dchat-channel',
          'aria-selected': entry.id === activeId,
          'aria-controls': `dchat-panel-${entry.id}`,
          onClick: () => setSelected(entry.id),
        },
        h(ChannelMark, { entry }),
        h('span', { className: 'dchat-channelLabel' },
          h('strong', null, entry.label()),
          entry.capabilities?.note
            ? h('small', null, entry.capabilities.note)
            : null)))),
      h('main', {
        className: 'dchat-panel',
        role: 'tabpanel',
        id: `dchat-panel-${activeId}`,
        'aria-labelledby': `dchat-tab-${activeId}`,
      }, typeof renderSlot === 'function'
        ? renderSlot(CHANNEL_PAGE_SLOT, { channelId: activeId }, { entryKey: activeId })
        : h('p', { className: 'dchat-cardDescription' }, '当前页面不支持渠道子槽。')));

  return h('section', { className: 'dchat-page', 'aria-label': t('Chat机器人设置') },
    h('header', { className: 'dchat-header' },
      h('div', { className: 'dchat-brand' },
        h('strong', { className: 'dchat-brandName' }, 'DSH-Chat'),
        h('span', { className: 'dchat-brandHint' }, t('Chat机器人')))),
    body,
    // 版本与更新固定在底部：现在跑的是哪个版本、渠道有没有启动失败、升级怎么做。
    h(VersionPanel, { connection, chatUi, translate: t }));
}
