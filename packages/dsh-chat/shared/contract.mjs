/**
 * dsh-chat 渠道插件契约（v1）。
 *
 * 设计规则：**渠道包不 import hub 包**。共享能力一律经运行期服务传递——
 * host 侧 `dshChat`，client 侧 `chatChannels` + `chatUi`。因此本文件只放
 * 通道无关的常量与校验，且必须保持浏览器安全（会被 client bundle 打进浏览器）。
 *
 * @module dsh-chat/shared/contract
 */

/** 契约版本。渠道包激活时校验，不匹配即大声失败。 */
export const CONTRACT_VERSION = 1;

/** hub 版本（与 package.json 的 version 保持一致，用于 /version 命令）。 */
export const HUB_VERSION = '0.0.1';

/** hub 包名与行 id。 */
export const HUB_PACKAGE = 'dsh-chat';

/** host 侧服务名：渠道注册表与共享内核。 */
export const HOST_SERVICE = 'dshChat';

/** client 侧服务名：渠道元数据注册表（驱动设置页左栏）。 */
export const CLIENT_CHANNEL_SERVICE = 'chatChannels';

/** client 侧服务名：hub 提供的共享 UI 组件与样式。 */
export const CLIENT_UI_SERVICE = 'chatUi';

/** 设置页 section 槽与 hub 占用的 id / 排序 / 标签。 */
export const SETTINGS_SECTION_SLOT = 'settings.section';
export const SETTINGS_SECTION_ID = 'dsh-chat';
export const SETTINGS_SECTION_ORDER = 21;
export const SETTINGS_LABEL_KEY = 'Chat机器人';

/** hub 在 section 内声明、由各渠道包注册页面的子槽（keyed）。 */
export const CHANNEL_PAGE_SLOT = 'chat.channel.page';

/** RPC 前缀：`/api/dsh-chat/<channelId>`；hub 自身的控制端点用 `<channelId> = control`。 */
export const RPC_PREFIX = 'dsh-chat';
export const CONTROL_CHANNEL_ID = 'control';

/** 渠道 id 语法（同时用作 URL 片段，因此限定为安全字符）。 */
export const CHANNEL_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

const LEGACY_DIR_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 校验渠道契约版本。渠道包在 apply() 里调用，不匹配就抛出可读错误。
 *
 * @param service - host 侧 `dshChat` 服务（或 client 侧 `chatChannels`）。
 * @param owner - 报错里显示的调用方包名。
 * @returns 服务本身的版本号。
 */
export function requireContract(service, owner) {
  const actual = service?.contractVersion;
  if (actual === CONTRACT_VERSION) return actual;
  throw new Error(
    `${owner} 需要 dsh-chat 契约 v${CONTRACT_VERSION}，当前 hub 提供 v${String(actual)}；`
    + '请升级 dsh-chat 或安装与该契约匹配的渠道插件版本。',
  );
}

/**
 * 校验并冻结一份渠道定义。任何字段不合法都抛出，而不是让半成品渠道默默上线。
 *
 * @param definition - 渠道包提交的定义。
 * @returns 冻结后的定义（`label` 归一化为函数）。
 */
export function validateChannelDefinition(definition) {
  if (!isPlainObject(definition)) throw new TypeError('registerChannel 需要一份渠道定义对象。');
  const { id, label, order, createChannel, legacy, version } = definition;
  if (typeof id !== 'string' || !CHANNEL_ID_PATTERN.test(id)) {
    throw new TypeError('渠道 id 必须是 2–32 位小写字母/数字/连字符，且以字母开头。');
  }
  if (typeof label !== 'string' && typeof label !== 'function') {
    throw new TypeError('渠道 label 必须是字符串或返回字符串的函数。');
  }
  if (!Number.isFinite(order)) throw new TypeError('渠道 order 必须是有限数字。');
  if (typeof createChannel !== 'function') {
    throw new TypeError('渠道定义缺少 createChannel(deps) 函数。');
  }
  if (legacy !== undefined) {
    if (!isPlainObject(legacy) || typeof legacy.dir !== 'string'
      || !LEGACY_DIR_PATTERN.test(legacy.dir)) {
      throw new TypeError('渠道 legacy 只接受 { dir: "dsh-<name>" } 形式的迁移来源。');
    }
  }
  if (version !== undefined && (typeof version !== 'string' || !/^\d+\.\d+\.\d+/u.test(version))) {
    throw new TypeError('渠道 version 必须是形如 1.2.3 的版本号。');
  }
  const resolveLabel = typeof label === 'function' ? label : () => label;
  return Object.freeze({
    id,
    label: resolveLabel,
    order,
    createChannel,
    // 渠道包的版本（设置页的"版本与更新"面板用它对照 package.json）。
    version: version === undefined ? null : version,
    legacy: legacy === undefined ? null : Object.freeze({ dir: legacy.dir }),
  });
}

/**
 * 读取一份渠道定义里可能动态变化的显示名。
 *
 * @param definition - 已冻结的渠道定义。
 * @returns 当前显示名；取值失败时回落到 id。
 */
export function channelLabel(definition) {
  try {
    const value = definition.label();
    return typeof value === 'string' && value.trim() ? value.trim() : definition.id;
  } catch {
    return definition.id;
  }
}
