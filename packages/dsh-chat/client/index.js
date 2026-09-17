/**
 * dsh-chat Hub：client 侧插件入口。
 *
 * 在设置页注册唯一的「Chat机器人」入口，向渠道插件发布两个服务：
 * - `chatChannels`：渠道元数据注册表（驱动左栏）；
 * - `chatUi`：共享组件、样式、RPC 助手。
 * 并在 section 内声明 `chat.channel.page` 子槽，由渠道包注册自己的页面。
 *
 * @module dsh-chat/client/index
 */

import {
  CHANNEL_PAGE_SLOT,
  CLIENT_CHANNEL_SERVICE,
  CLIENT_UI_SERVICE,
  CONTRACT_VERSION,
  SETTINGS_LABEL_KEY,
  SETTINGS_SECTION_ID,
  SETTINGS_SECTION_ORDER,
  SETTINGS_SECTION_SLOT,
} from '../shared/contract.mjs';
import { createChannelRail } from '../shared/channel-rail.mjs';
import { createChatUi } from './chat-ui.js';
import { LOCALE_NAMESPACE, bindTranslator, en, zh } from './i18n.js';
import { ChatSettingsSection } from './section.js';
import { installChatStyles } from './styles.js';

export const name = 'dsh-chat-client';

/** client 侧需要的浏览器服务。 */
export const inject = ['slots', 'connection', 'locale'];

function provideService(ctx, serviceName, value) {
  if (typeof ctx?.reflect?.provide === 'function') return ctx.reflect.provide(serviceName, value);
  if (typeof ctx?.provide === 'function') return ctx.provide(serviceName, value);
  throw new TypeError(`dsh-chat 需要 Cordis 的 provide 能力来发布 ${serviceName} 服务。`);
}

/**
 * Cordis client 插件入口。
 *
 * @param ctx - client 上下文。
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
    'dsh-chat: 双语文案');
  const t = typeof ctx.locale?.bind === 'function'
    ? ctx.locale.bind(LOCALE_NAMESPACE)
    : bindTranslator(ctx.locale);

  const channels = createChannelRail();
  const chatUi = createChatUi({ ctx, translate: t });

  ctx.effect(() => provideService(ctx, CLIENT_CHANNEL_SERVICE, channels),
    'dsh-chat: 渠道 rail 服务');
  ctx.effect(() => provideService(ctx, CLIENT_UI_SERVICE, chatUi),
    'dsh-chat: 共享 UI 套件');
  ctx.effect(() => installChatStyles(), 'dsh-chat: 共享样式');

  ctx.slots.inject(SETTINGS_SECTION_SLOT, () => ctx.slots.register({
    name: SETTINGS_SECTION_SLOT,
    id: SETTINGS_SECTION_ID,
    order: SETTINGS_SECTION_ORDER,
    label: () => t(SETTINGS_LABEL_KEY),
    locale: LOCALE_NAMESPACE,
    inject: () => ({ channels, chatUi, translate: t, contractVersion: CONTRACT_VERSION }),
    children: {
      [CHANNEL_PAGE_SLOT]: { kind: 'keyed', scope: 'root' },
    },
  }, ChatSettingsSection));
}
