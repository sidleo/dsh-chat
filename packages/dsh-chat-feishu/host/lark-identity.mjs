/**
 * lark-cli 身份策略的**分层作用域**（飞书渠道自己的模块）。
 *
 * 为什么要有它：早期只有**一个**机器人级开关（`bot-only | user-allowed`），
 * 而"谁能用用户身份"实际上是按场合变的——私聊里可以放开，几百人的大群里不该放开；
 * 同一个群里也常常只信得过某一个人。所以身份策略要能**分层就近覆盖**：
 *
 *     targets 命中（具体群 / 群里具体的人 / 私聊具体的人）
 *       ↓ 没配就往下继承
 *     群聊 / 私聊 分类
 *       ↓ 没配就往下继承
 *     global 全局默认（永远有值，不会再往下掉）
 *
 * **语义边界（重要，别误读）**：某一层把 `user` 打开**只是"允许以用户身份调用"**，
 * 并**不会**因为发言人变了就自动换成那个人的授权——lark-cli 一个 appId 只有一份 profile、
 * 一份 profile 只挂一个登录人（真机实测 `each profile must have a unique app-id`），
 * `lark-cli.mjs` 的 `assertIdentity` 仍然会核对"实际身份就是钉住的那个人"。
 * 换句话说：这里管的是**收窄 / 放开**，不是**换人**。
 *
 * 命中方式（B 方案，与上下文增强的 targets 相比多一种组合键）：
 * - `kind: 'user'`：私聊按 `senderId`；**群聊按 `chatId` + `senderId` 组合**——
 *   即"在这个群里，只有这个人触发这条策略"。群里只按 senderId 会让同一个人在**所有**群
 *   同时命中，那不是用户要的语义；
 * - `kind: 'group'`：只认群聊的 `chatId`。
 *
 * 模块放在渠道包内而不是 hub 的 shared：**渠道包不得 import hub 包**
 * （`scripts/verify-package.mjs` 会红），身份判定又是渠道自己的平台概念。
 *
 * @module dsh-chat-feishu/lark-identity
 */

/** 指定设置条数上限。 */
export const LARK_IDENTITY_TARGET_LIMIT = 50;

/** 备注名 / id 上限。 */
const TARGET_LABEL_MAX_LENGTH = 80;
const TARGET_ID_MAX_LENGTH = 256;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;

/**
 * 全局默认：**只允许应用身份**。
 *
 * 保守方向是有意的——历史配置里没有这个字段时（或写坏了）必须落回"最不允许放权"的那一档，
 * 否则一次解析失败就等于静默放开用户身份。
 */
export const DEFAULT_LARK_IDENTITY = Object.freeze({
  global: Object.freeze({ bot: true, user: false }),
  direct: null,
  group: null,
  targets: Object.freeze([]),
});

function cleanString(value, max = TARGET_ID_MAX_LENGTH) {
  if (typeof value !== 'string') return null;
  const text = value.replace(CONTROL_CHARACTERS, '').trim();
  if (!text) return null;
  return text.slice(0, max);
}

/**
 * 归一化一层身份取值。
 *
 * @param value - 任意历史值（对象 / null）。
 * @param fallback - 该层缺失时用的值；null 表示"继承上一层"。
 * @returns `{ bot, user }` 或 null（冻结）。
 */
function normalizeScope(value, fallback) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback ? Object.freeze({ bot: fallback.bot === true, user: fallback.user === true }) : null;
  }
  // 两个字段互相独立：`user` 打开不再隐含要求 `bot` 关闭（这正是"多选"的含义）。
  return Object.freeze({ bot: value.bot === true, user: value.user === true });
}

/**
 * 归一化一条指定设置。
 *
 * @param value - 磁盘上的条目。
 * @returns 冻结的条目，或 null（信息不足）。
 */
function normalizeTarget(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = cleanString(value.id);
  if (!id) return null;
  const kind = value.kind === 'group' ? 'group' : 'user';
  return Object.freeze({
    kind,
    id,
    // 群聊里的"人"必须同时给出群 id；缺了它这条策略在群聊里无处生效（按组合命中）。
    chatId: kind === 'user' ? cleanString(value.chatId) : null,
    label: cleanString(value.label, TARGET_LABEL_MAX_LENGTH),
    // 条目级取值**必须写全**：它要覆盖上层，缺字段无从上文继承（没有"继承一半"这回事）。
    bot: value.bot === true,
    user: value.user === true,
  });
}

/**
 * 归一化整份配置（host 判定与 client 界面共用，规则不可能前后端漂移）。
 *
 * @param value - 原始配置。
 * @returns 冻结的分层配置。
 */
export function normalizeLarkIdentity(value) {
  // 迁移旧形态：`mode: 'user-allowed'` 等价于"全局允许 bot + user"。
  const legacy = value && typeof value === 'object' && typeof value.mode === 'string'
    ? (value.mode === 'user-allowed'
      ? { global: { bot: true, user: true } }
      : { global: { bot: true, user: false } })
    : null;
  const source = legacy ?? (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

  const global = normalizeScope(source.global, DEFAULT_LARK_IDENTITY.global);
  const direct = normalizeScope(source.direct, null);
  const group = normalizeScope(source.group, null);

  const seen = new Set();
  const targets = [];
  for (const entry of Array.isArray(source.targets) ? source.targets : []) {
    const target = normalizeTarget(entry);
    if (!target) continue;
    // 同 (kind, chatId, id) 只留第一条：重复条目会让"哪条生效"变得不可判定。
    const dedupeKey = `${target.kind}:${target.chatId ?? ''}:${target.id}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    targets.push(target);
    if (targets.length >= LARK_IDENTITY_TARGET_LIMIT) break;
  }

  return Object.freeze({
    global: global ?? Object.freeze({ ...DEFAULT_LARK_IDENTITY.global }),
    direct,
    group,
    targets: Object.freeze(targets),
  });
}

/**
 * 解析某个场合实际生效的身份权限。
 *
 * @param config - 原始配置（内部会归一化）。
 * @param conversationType - 'direct' 或 'group'。
 * @param identity - `{ senderId, chatId }`。
 * @returns `{ bot, user, source }`，source ∈ 'target' | 'scope' | 'global'。
 */
export function resolveLarkIdentity(config, conversationType, identity = {}) {
  const normalized = normalizeLarkIdentity(config);
  const senderId = cleanString(identity?.senderId);
  const chatId = cleanString(identity?.chatId);
  const isGroup = conversationType === 'group';
  const isDirect = conversationType === 'direct';

  if (isGroup || isDirect) {
    const target = normalized.targets.find((candidate) => {
      if (candidate.kind === 'group') {
        // 群条目只对群聊、且群 id 必须对上。
        return isGroup && chatId !== null && candidate.id === chatId;
      }
      // 人条目：私聊按人；群聊要求"同一个群里同一个人"（B 方案）。
      if (isDirect) return senderId !== null && candidate.id === senderId;
      return chatId !== null && senderId !== null
        && candidate.chatId === chatId && candidate.id === senderId;
    });
    if (target) return Object.freeze({ bot: target.bot, user: target.user, source: 'target' });

    const scope = isGroup ? normalized.group : normalized.direct;
    if (scope) return Object.freeze({ bot: scope.bot, user: scope.user, source: 'scope' });
  }

  // 未知会话类型（或该分类没配）→ 落到全局：**永远有确定答案**，不存在"继承到空"。
  return Object.freeze({
    bot: normalized.global.bot,
    user: normalized.global.user,
    source: 'global',
  });
}

/**
 * 从会话键取 `{ conversationType, chatId, senderId }`。
 *
 * 会话键的口径由 hub 定死：`p2p:<平台用户 id>` / `group:<平台群 id>`。
 * 群聊的 senderId 不在键里（键是会话维度），所以要由调用方另外带上。
 *
 * @param key - 会话键。
 * @returns `{ conversationType, chatId, senderId }`（取不到的字段为 null）。
 */
export function identityFromConversationKey(key) {
  const raw = typeof key === 'string' ? key : '';
  const separator = raw.indexOf(':');
  if (separator <= 0) return { conversationType: null, chatId: null, senderId: null };
  const kind = raw.slice(0, separator);
  const id = raw.slice(separator + 1);
  if (kind === 'p2p') return { conversationType: 'direct', chatId: null, senderId: id || null };
  if (kind === 'group') return { conversationType: 'group', chatId: id || null, senderId: null };
  return { conversationType: null, chatId: null, senderId: null };
}

/**
 * 给界面用的一行摘要。
 *
 * @param config - 原始配置。
 * @returns 一行中文描述。
 */
export function describeLarkIdentity(config) {
  const normalized = normalizeLarkIdentity(config);
  const label = (scope) => {
    if (!scope) return '继承上一层';
    if (scope.bot && scope.user) return '应用 + 用户';
    if (scope.user) return '仅用户';
    if (scope.bot) return '仅应用';
    return '都不允许';
  };
  return [
    `全局：${label(normalized.global)}`,
    `私聊：${label(normalized.direct)}`,
    `群聊：${label(normalized.group)}`,
    `指定：${normalized.targets.length} 条`,
  ].join(' · ');
}
