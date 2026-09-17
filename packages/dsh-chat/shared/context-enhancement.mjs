/**
 * dsh-chat 上下文增强引擎。
 *
 * 浏览器安全：host 侧捕获/拼装与 client 侧设置界面共用这一份实现，因此校验规则
 * 不可能前后端漂移。渠道包通过 `dshChat.contextEnhancement` 使用它，不直接 import。
 *
 * 两级配置：
 * - 全局：`group` / `direct` 各自一份 { enabled, fields, guidance }；
 * - 指定设置：`targets[]`，`kind:'user'` 只在私聊按 senderId 命中，
 *   `kind:'group'` 只在群聊按 chatId 命中；命中时用自己的来源字段与提示词，
 *   `merge:'append'` 再把该会话类型的全局提示词叠在其后。
 *
 * @module dsh-chat/shared/context-enhancement
 */

/** 可用于来源块的字段（顺序即界面顺序）。 */
export const CONTEXT_FIELDS = Object.freeze([
  'channel',
  'conversationType',
  'senderId',
  'senderName',
  'conversationTitle',
  'chatId',
  'threadId',
  'botId',
]);

/**
 * 注入内容的标签语法。producer（渠道拼前缀）与 host 侧 splitter（把来源块
 * 拆成独立会话上下文行）共用这组字面量，前缀不可能与解析器漂移。
 */
export const CONTEXT_TAGS = Object.freeze({
  sourceOpen: '<dsh_im_source>',
  sourceClose: '</dsh_im_source>',
  guidanceOpen: '<dsh_im_source_guidance>',
  guidanceClose: '</dsh_im_source_guidance>',
});

/** 多块前缀之间的分隔符；splitter 按同一个值消费。 */
export const CONTEXT_BLOCK_SEPARATOR = '\n\n';

/** 单个作用域增强提示词上限。 */
export const GUIDANCE_MAX_LENGTH = 8_000;

/** 指定设置条数上限。 */
export const TARGET_LIMIT = 50;

/** 指定设置备注名上限。 */
export const TARGET_LABEL_MAX_LENGTH = 80;

/** 指定设置标识上限。 */
export const TARGET_ID_MAX_LENGTH = 256;

/** 指定设置的合法命中类型。 */
export const TARGET_KINDS = Object.freeze(['user', 'group']);

/** 提示词叠加方式：叠加全局提示词 / 只用自己的提示词。 */
export const TARGET_MERGES = Object.freeze(['append', 'replace']);

/** 群聊 / 私聊的提示词示例（界面的「填入示例」用）。 */
export const GROUP_GUIDANCE_EXAMPLE = `仅依据当前消息的 ${CONTEXT_TAGS.sourceOpen} 中实际提供的字段理解来源；没有提供的字段不要猜测或补全。
当前消息来自群聊，请使用严肃、克制、简洁的表达方式。`;
export const DIRECT_GUIDANCE_EXAMPLE = `仅依据当前消息的 ${CONTEXT_TAGS.sourceOpen} 中实际提供的字段理解来源；没有提供的字段不要猜测或补全。
当前消息来自私聊，可以使用更轻松、幽默、详细的表达方式。`;

/** 一个作用域的默认值。 */
export const DEFAULT_SCOPE = Object.freeze({
  enabled: false,
  fields: Object.freeze(['senderId']),
  guidance: '',
});

/** 完整默认配置（含指定设置）。 */
export const DEFAULT_CONTEXT_CONFIG = Object.freeze({
  group: DEFAULT_SCOPE,
  direct: DEFAULT_SCOPE,
  targets: Object.freeze([]),
});

const CONFIG_KEYS = Object.freeze(['group', 'direct', 'targets']);
const SCOPE_KEYS = Object.freeze(['enabled', 'fields', 'guidance']);
const TARGET_KEYS = Object.freeze([
  'kind', 'id', 'label', 'enabled', 'fields', 'guidance', 'merge',
]);
const LEGACY_KEYS = Object.freeze(['groupEnabled', 'directEnabled', 'fields', 'guidance']);

const SOURCE_LIMITS = Object.freeze({
  channel: 16,
  conversationType: 6,
  senderId: 256,
  senderName: 256,
  conversationTitle: 256,
  chatId: 256,
  threadId: 256,
  botId: 128,
});

/** 清理用（带 g）；测试是否存在用不带 g 的同一集合，避免 lastIndex 状态。 */
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
const CONTROL_CHARACTER_TEST = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

/** 渠道名白名单：来源块里的 channel 只能是这些值。 */
const KNOWN_CHANNELS = new Set(['feishu', 'weixin']);

/**
 * 构造一个带稳定 code 的校验错误，便于 RPC 层区分"用户填错"与"服务端故障"。
 *
 * @param message - 面向用户的中文错误文案。
 * @returns 带 code 的 TypeError。
 */
function invalid(message) {
  const error = new TypeError(message);
  error.code = 'context-enhancement-invalid';
  return error;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(input, keys) {
  return isPlainObject(input)
    && Reflect.ownKeys(input).length === keys.length
    && keys.every((key) => Object.hasOwn(input, key));
}

function offlineText(value, maxLength) {
  return typeof value === 'string' ? value.replace(CONTROL_CHARACTERS, '').slice(0, maxLength) : '';
}

/**
 * 校验一个作用域（群聊或私聊的全局设置）。
 *
 * @param input - { enabled, fields, guidance }。
 * @param where - 报错文案里指明是哪个作用域。
 * @returns 冻结后的作用域。
 */
function validateScope(input, where) {
  if (!hasExactKeys(input, SCOPE_KEYS)) throw invalid(`${where}设置不完整，请重新保存。`);
  const { enabled, fields, guidance } = input;
  if (typeof enabled !== 'boolean') throw invalid(`${where}的启用开关必须是布尔值。`);
  if (!Array.isArray(fields) || !fields.every((field) => CONTEXT_FIELDS.includes(field))) {
    throw invalid(`${where}的来源字段只能从已定义的八个字段中选择。`);
  }
  if (typeof guidance !== 'string' || guidance.length > GUIDANCE_MAX_LENGTH) {
    throw invalid(`${where}的增强提示词不得超过 ${GUIDANCE_MAX_LENGTH} 个字符。`);
  }
  return Object.freeze({
    enabled,
    fields: Object.freeze(CONTEXT_FIELDS.filter((field) => fields.includes(field))),
    guidance: guidance.trim() ? guidance : '',
  });
}

/**
 * 校验一条指定设置。
 *
 * @param input - 七个字段的完整对象。
 * @returns 冻结后的指定设置。
 */
function validateTarget(input) {
  if (!hasExactKeys(input, TARGET_KEYS)) throw invalid('指定设置不完整，请重新保存。');
  const {
    kind, id, label, enabled, fields, guidance, merge,
  } = input;
  if (!TARGET_KINDS.includes(kind)) throw invalid('指定设置的类型只能是"指定用户"或"指定群"。');
  const targetId = typeof id === 'string' ? id.trim() : '';
  if (!targetId || targetId.length > TARGET_ID_MAX_LENGTH || CONTROL_CHARACTER_TEST.test(targetId)
    || /\s/.test(targetId)) {
    throw invalid('指定设置的标识不能为空、不能包含空白或控制字符，且不得超过 256 个字符。');
  }
  if (typeof label !== 'string' || label.length > TARGET_LABEL_MAX_LENGTH) {
    throw invalid(`指定设置的备注名不得超过 ${TARGET_LABEL_MAX_LENGTH} 个字符。`);
  }
  if (typeof enabled !== 'boolean') throw invalid('指定设置的启用开关必须是布尔值。');
  if (!Array.isArray(fields) || !fields.every((field) => CONTEXT_FIELDS.includes(field))) {
    throw invalid('指定设置的来源字段只能从已定义的八个字段中选择。');
  }
  if (typeof guidance !== 'string' || guidance.length > GUIDANCE_MAX_LENGTH) {
    throw invalid(`指定设置的增强提示词不得超过 ${GUIDANCE_MAX_LENGTH} 个字符。`);
  }
  if (!TARGET_MERGES.includes(merge)) throw invalid('指定设置的提示词叠加方式只支持"叠加"或"覆盖"。');
  return Object.freeze({
    kind,
    id: targetId,
    label: offlineText(label, TARGET_LABEL_MAX_LENGTH).trim(),
    enabled,
    fields: Object.freeze(CONTEXT_FIELDS.filter((field) => fields.includes(field))),
    guidance: guidance.trim() ? guidance : '',
    merge,
  });
}

/**
 * 严格校验一份完整配置（保存路径用；调用方提交什么就必须完整提交什么）。
 *
 * @param input - { group, direct, targets }。
 * @returns 冻结后的完整配置。
 */
export function validateContextConfig(input) {
  if (!hasExactKeys(input, CONFIG_KEYS)) throw invalid('请提交完整的上下文增强设置。');
  if (!Array.isArray(input.targets)) throw invalid('指定设置必须是列表。');
  if (input.targets.length > TARGET_LIMIT) {
    throw invalid(`指定设置最多 ${TARGET_LIMIT} 条。`);
  }
  const targets = input.targets.map(validateTarget);
  const seen = new Set();
  for (const target of targets) {
    const key = `${target.kind}:${target.id}`;
    if (seen.has(key)) throw invalid(`指定设置中「${target.id}」重复，请合并后再保存。`);
    seen.add(key);
  }
  return Object.freeze({
    group: validateScope(input.group, '群聊'),
    direct: validateScope(input.direct, '私聊'),
    targets: Object.freeze(targets),
  });
}

/** 旧版（群聊/私聊共用一个开关与一份提示词）配置的迁移。 */
function migrateLegacyConfig(input) {
  if (!hasExactKeys(input, LEGACY_KEYS)) throw invalid('请提交完整的上下文增强设置。');
  return validateContextConfig({
    group: { enabled: input.groupEnabled, fields: input.fields, guidance: input.guidance },
    direct: { enabled: input.directEnabled, fields: input.fields, guidance: input.guidance },
    targets: [],
  });
}

/**
 * 容错归一化：损坏或缺失的配置永远不能让机器人起不来。
 *
 * @param input - 任意历史数据。
 * @returns 一份合法配置。
 */
export function normalizeContextConfig(input) {
  try {
    return validateContextConfig(input);
  } catch {
    try {
      return migrateLegacyConfig(input);
    } catch {
      // 已是 v2 形态但缺 targets（dsh-im 4.x 的数据）时补空列表。
      try {
        if (isPlainObject(input)) {
          return validateContextConfig({ ...input, targets: input.targets ?? [] });
        }
      } catch { /* 继续回落默认值 */ }
      return DEFAULT_CONTEXT_CONFIG;
    }
  }
}

/**
 * 按会话类型与身份挑出本次生效的作用域。
 *
 * @param config - 原始配置（内部会归一化）。
 * @param conversationType - 'direct' 或 'group'。
 * @param identity - { senderId, chatId }，缺字段即视为无法命中。
 * @returns 生效作用域 { enabled, fields, guidance }，未启用时为 null。
 */
export function resolveContextScope(config, conversationType, identity = {}) {
  if (conversationType !== 'direct' && conversationType !== 'group') return null;
  const normalized = normalizeContextConfig(config);
  const scope = normalized[conversationType];
  const target = normalized.targets.find((candidate) => {
    if (candidate.enabled !== true) return false;
    if (conversationType === 'direct') {
      return candidate.kind === 'user' && candidate.id === identity.senderId;
    }
    return candidate.kind === 'group' && candidate.id === identity.chatId;
  });
  if (!target) return scope.enabled === true ? scope : null;
  const stacks = target.merge === 'append' && scope.enabled === true;
  const guidance = stacks
    ? [target.guidance.trim(), scope.guidance.trim()].filter(Boolean).join('\n\n')
    : target.guidance;
  return Object.freeze({ enabled: true, fields: target.fields, guidance });
}

/**
 * 在消息入队前捕获生效配置。捕获而不是事后读取，保证排队中的消息用收到它时的设置。
 *
 * @param provider - { botId, channel, readConfig }。
 * @param conversationType - 'direct' 或 'group'。
 * @param identity - { senderId, chatId }。
 * @returns 快照，或作用域未启用时的 null。
 */
export function captureContextEnhancement(provider, conversationType, identity) {
  try {
    const scope = resolveContextScope(provider?.readConfig?.(), conversationType, identity);
    if (!scope) return null;
    return Object.freeze({
      botId: typeof provider?.botId === 'string' ? provider.botId : '',
      channel: typeof provider?.channel === 'string' ? provider.channel : '',
      conversationType,
      scope,
    });
  } catch {
    return null;
  }
}

/**
 * 捕获生效配置与其来源字段工厂。控制命令（不排队）在运行时捕获，普通消息在
 * 接收时捕获，因此补充指令的来源字段属于发出补充指令的人。
 *
 * @param provider - 同 captureContextEnhancement。
 * @param conversationType - 'direct' 或 'group'。
 * @param identity - { senderId, chatId }。
 * @param sourceFactory - 返回当前消息可用来源字段的函数。
 * @returns { snapshot, source } 或 null。
 */
export function captureContextEnhancementSource(provider, conversationType, identity, sourceFactory) {
  const snapshot = captureContextEnhancement(provider, conversationType, identity);
  return snapshot === null ? null : Object.freeze({ snapshot, source: sourceFactory });
}

function sourceValue(value, field) {
  if (field === 'senderId' && (typeof value === 'bigint' || Number.isFinite(value))) {
    value = String(value);
  }
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(CONTROL_CHARACTERS, '').trim().slice(0, SOURCE_LIMITS[field]);
  if (!normalized) return undefined;
  if (field === 'channel' && !KNOWN_CHANNELS.has(normalized)) return undefined;
  return normalized;
}

function jsonForTag(value) {
  return JSON.stringify(value).replace(/[<>&]/g, (character) => ({
    '<': '\\u003c', '>': '\\u003e', '&': '\\u0026',
  })[character]);
}

function sourceBlock(snapshot, sourceFactory) {
  const { fields } = snapshot.scope;
  const needsSource = fields.some((field) => (
    field !== 'botId' && field !== 'conversationType' && field !== 'channel'
  ));
  const source = needsSource && typeof sourceFactory === 'function' ? sourceFactory() : null;
  const projected = {};
  for (const field of fields) {
    const raw = field === 'botId' || field === 'conversationType' || field === 'channel'
      ? snapshot[field]
      : source?.[field];
    const value = sourceValue(raw, field);
    if (value !== undefined) projected[field] = value;
  }
  if (Object.keys(projected).length === 0) return '';
  return `${CONTEXT_TAGS.sourceOpen}${jsonForTag(projected)}${CONTEXT_TAGS.sourceClose}`;
}

function guidanceBlock(guidance) {
  if (typeof guidance !== 'string' || !guidance.trim()) return '';
  const body = guidance.replace(
    /<\/?dsh_im_source_guidance\b[^>]*(?:>|$)/gi,
    (tag) => tag.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  );
  return `${CONTEXT_TAGS.guidanceOpen}\n${body}\n${CONTEXT_TAGS.guidanceClose}`;
}

/**
 * 给正文加前缀。关闭时原样返回，不做任何检查、格式化或复制。
 *
 * @param content - 字符串或内容块数组。
 * @param snapshot - captureContextEnhancement 的结果。
 * @param sourceFactory - 来源字段工厂。
 * @returns 加前缀后的正文。
 */
export function enhanceContent(content, snapshot, sourceFactory) {
  if (!snapshot) return content;
  try {
    const blocks = [
      sourceBlock(snapshot, sourceFactory),
      guidanceBlock(snapshot.scope.guidance),
    ].filter(Boolean);
    if (blocks.length === 0) return content;
    const prefix = blocks.join(CONTEXT_BLOCK_SEPARATOR);
    if (typeof content === 'string') return `${prefix}${CONTEXT_BLOCK_SEPARATOR}${content}`;
    if (Array.isArray(content)) return [{ type: 'text', text: prefix }, ...content];
    return content;
  } catch {
    // 只有增强本身被隔离；调用方原有流程照常进行。
    return content;
  }
}

/**
 * 设置页入口上显示的一句话状态。
 *
 * @param config - 原始配置。
 * @returns 中文状态文案。
 */
export function contextStatusLabel(config) {
  const { group, direct, targets } = normalizeContextConfig(config);
  const parts = [];
  if (group.enabled) parts.push('群聊');
  if (direct.enabled) parts.push('私聊');
  const active = targets.filter((target) => target.enabled).length;
  if (parts.length === 0 && active === 0) return '未开启';
  const scopeText = parts.length === 0 ? '未开启全局' : `${parts.join('和')}全局`;
  return active === 0 ? scopeText : `${scopeText} · ${active} 项指定`;
}
