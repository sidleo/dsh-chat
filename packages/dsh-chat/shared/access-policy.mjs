/**
 * 访问策略：谁能跟机器人说话、谁能执行命令。
 *
 * 数据结构与 dsh-im 的 `workspaces.json → accessPolicies[botId]` 完全一致，
 * 因此从旧实现导入的策略可以直接用（`mode: open | allowlist`）。
 *
 * 判定语义（调用方负责"属主绕过"）：
 * - `open`：任何人可对话；命令权限取"命中的 per-user 覆盖"，没有覆盖则取
 *   `open.defaultCanExecuteCommands`；
 * - `allowlist`：只有名单内用户可对话；命令权限要求命中的用户全部允许。
 *
 * 浏览器安全：host 与设置页共用这份实现。
 *
 * @module dsh-chat/shared/access-policy
 */

export const ACCESS_POLICY_MODES = Object.freeze(['open', 'allowlist']);
export const ACCESS_CONVERSATION_TYPES = Object.freeze(['direct', 'group']);

const USER_ID_MAX_LENGTH = 256;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
const CONTROL_CHARACTER_TEST = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

/** 判定结果码。 */
export const ACCESS_RESULTS = Object.freeze({
  OWNER: 'owner',
  OPEN: 'open',
  ALLOWLIST: 'allowlist',
  NOT_LISTED: 'sender-not-allowed',
  COMMAND_DENIED: 'command-not-allowed',
  NO_POLICY: 'no-policy',
  INVALID: 'invalid-context',
});

function invalid(message) {
  const error = new TypeError(message);
  error.code = 'access-policy-invalid';
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

function normalizeUserId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  if (typeof value !== 'string') throw invalid('用户标识必须是字符串。');
  const normalized = value.replace(CONTROL_CHARACTERS, '').trim();
  if (!normalized || normalized.length > USER_ID_MAX_LENGTH) throw invalid('用户标识无效。');
  return normalized;
}

function validateUser(input) {
  if (!hasExactKeys(input, ['id', 'canExecuteCommands'])) throw invalid('白名单条目格式不正确。');
  if (typeof input.canExecuteCommands !== 'boolean') throw invalid('命令权限必须是布尔值。');
  return Object.freeze({
    id: normalizeUserId(input.id),
    canExecuteCommands: input.canExecuteCommands,
  });
}

function validateScope(input) {
  if (!hasExactKeys(input, ['mode', 'open', 'allowlist'])) throw invalid('访问策略缺少字段。');
  if (!ACCESS_POLICY_MODES.includes(input.mode)) throw invalid('访问模式只能是 open 或 allowlist。');
  if (!hasExactKeys(input.open, ['defaultCanExecuteCommands', 'commandPermissionOverrides'])) {
    throw invalid('open 段格式不正确。');
  }
  if (typeof input.open.defaultCanExecuteCommands !== 'boolean') {
    throw invalid('默认命令权限必须是布尔值。');
  }
  if (!Array.isArray(input.open.commandPermissionOverrides)
    || !Array.isArray(input.allowlist?.users)) {
    throw invalid('访问策略的名单必须是数组。');
  }
  return Object.freeze({
    mode: input.mode,
    open: Object.freeze({
      defaultCanExecuteCommands: input.open.defaultCanExecuteCommands,
      commandPermissionOverrides: Object.freeze(input.open.commandPermissionOverrides.map(validateUser)),
    }),
    allowlist: Object.freeze({ users: Object.freeze(input.allowlist.users.map(validateUser)) }),
  });
}

/**
 * 属主名单里的通配符。
 *
 * 历史配置（上游 dsh-im 绑定时没记录属主）会写成 `['*']`。它表示**这台机器人没有属主**
 * （公开机器人），**不是**"人人都是属主"——后者会让策略引擎第一步的属主绕过生效，
 * 于是这台机器人的访问策略完全失效：名单里没有的人也能照常使用（真机上出现过）。
 */
export const OWNER_WILDCARD = '*';

/** @returns 该机器人是否"公开"（属主名单里只有通配符）。 */
export function hasWildcardOwner(ownerIds) {
  return Array.isArray(ownerIds) && ownerIds.includes(OWNER_WILDCARD);
}

/**
 * 判定发送者是否是属主（属主由调用方绕过访问策略）。
 *
 * 通配符**不算属主**：它只说明"没记录属主"，不授权任何人绕过策略。
 *
 * @param ownerIds - 该应用的属主 id 名单。
 * @param senderId - 发送者在**该应用**里的平台 id。
 * @returns true 表示属主。
 */
export function isOwnerId(ownerIds, senderId) {
  if (!Array.isArray(ownerIds) || typeof senderId !== 'string' || !senderId) return false;
  return ownerIds.some((id) => id !== OWNER_WILDCARD && id === senderId);
}

/**
 * 严格校验一份完整策略（保存路径用）。
 *
 * @param input - `{ direct, group }`。
 * @returns 冻结后的策略。
 */
export function validateAccessPolicy(input) {
  if (!hasExactKeys(input, ['direct', 'group'])) throw invalid('请提交完整的访问策略。');
  return Object.freeze({
    direct: validateScope(input.direct),
    group: validateScope(input.group),
  });
}

/**
 * 容错归一化（运行路径用）。
 *
 * 关键取舍：**不完整的历史数据不能被判成"谁都进不来"**——那等于把机器人锁死，
 * 而且现象是"发了没反应"，极难排查。因此这里对缺字段做保守填充：
 * - 缺失/非法的 mode → `allowlist`（保守方向）；
 * - 缺失的名单 → 空名单（配合属主绕过，等价于"仅属主可用"）；
 * - 无法识别的条目直接丢弃。
 * 只有"压根没有策略对象"才返回 null（调用方回落"仅属主"）。
 *
 * @param input - 任意历史数据。
 * @returns 合法策略或 null。
 */
export function normalizeAccessPolicy(input) {
  if (!isPlainObject(input)) return null;
  const scopeOf = (value) => {
    const source = isPlainObject(value) ? value : {};
    const open = isPlainObject(source.open) ? source.open : {};
    const allowlist = isPlainObject(source.allowlist) ? source.allowlist : {};
    const usersOf = (value2) => (Array.isArray(value2)
      ? value2.map((user) => {
        try {
          return validateUser(user);
        } catch {
          return null;
        }
      }).filter(Boolean)
      : []);
    return {
      mode: ACCESS_POLICY_MODES.includes(source.mode) ? source.mode : 'allowlist',
      open: {
        defaultCanExecuteCommands: open.defaultCanExecuteCommands === true,
        commandPermissionOverrides: usersOf(open.commandPermissionOverrides),
      },
      allowlist: { users: usersOf(allowlist.users) },
    };
  };
  return Object.freeze({
    direct: Object.freeze(scopeOf(input.direct)),
    group: Object.freeze(scopeOf(input.group)),
  });
}

/**
 * 默认策略：私聊/群聊都只允许名单内用户，且默认不允许命令。
 *
 * @returns 冻结的默认策略。
 */
export function defaultAccessPolicy() {
  const scope = () => ({
    mode: 'allowlist',
    open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] },
    allowlist: { users: [] },
  });
  return validateAccessPolicy({ direct: scope(), group: scope() });
}

/**
 * 判定一条消息（或一条命令）是否放行。
 *
 * @param options - {
 *   policy, conversationType, senderIds, isCommand?, isOwner?,
 * }。
 * @returns `{ allowed, reason }`。
 */
export function evaluateAccess({
  policy,
  conversationType,
  senderIds,
  isCommand = false,
  isOwner = false,
} = {}) {
  if (isOwner) return { allowed: true, reason: ACCESS_RESULTS.OWNER };
  if (!ACCESS_CONVERSATION_TYPES.includes(conversationType)) {
    return { allowed: false, reason: ACCESS_RESULTS.INVALID };
  }
  const normalized = normalizeAccessPolicy(policy);
  if (!normalized) return { allowed: false, reason: ACCESS_RESULTS.NO_POLICY };

  const candidates = (Array.isArray(senderIds) ? senderIds : [senderIds])
    .map((candidate) => {
      try {
        return normalizeUserId(candidate);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (candidates.length === 0) return { allowed: false, reason: ACCESS_RESULTS.NOT_LISTED };

  const scope = normalized[conversationType];
  const users = scope.mode === 'open' ? scope.open.commandPermissionOverrides : scope.allowlist.users;
  const matched = users.filter((user) => candidates.includes(user.id));

  if (scope.mode === 'allowlist' && matched.length === 0) {
    return { allowed: false, reason: ACCESS_RESULTS.NOT_LISTED };
  }
  if (isCommand) {
    const canExecute = scope.mode === 'open'
      ? (matched.length > 0
        ? matched.every((user) => user.canExecuteCommands)
        : scope.open.defaultCanExecuteCommands)
      : matched.every((user) => user.canExecuteCommands);
    if (!canExecute) return { allowed: false, reason: ACCESS_RESULTS.COMMAND_DENIED };
  }
  return {
    allowed: true,
    reason: scope.mode === 'open' ? ACCESS_RESULTS.OPEN : ACCESS_RESULTS.ALLOWLIST,
  };
}

/**
 * 一句话描述某个作用域当前放行谁（设置页与命令输出用）。
 *
 * @param policy - 策略（任意历史数据）。
 * @param conversationType - 'direct' | 'group'。
 * @returns 中文描述。
 */
export function describeAccessScope(policy, conversationType) {
  const normalized = normalizeAccessPolicy(policy);
  if (!normalized) return '未设置（仅属主可用）';
  const scope = normalized[conversationType];
  if (scope.mode === 'open') {
    return `任何人可用（命令默认${scope.open.defaultCanExecuteCommands ? '允许' : '不允许'}）`;
  }
  const count = scope.allowlist.users.length;
  // 名单为空 + allowlist 模式下，只有属主能对话（属主由调用方绕过）。
  return count === 0 ? '仅属主可用' : `名单内 ${count} 人可用`;
}
