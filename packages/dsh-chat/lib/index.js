import { createRequire as __dshCreateRequire } from 'node:module';
import { dirname as __dshDirname } from 'node:path';
import { fileURLToPath as __dshFileURLToPath } from 'node:url';
const require = __dshCreateRequire(import.meta.url);
const __filename = __dshFileURLToPath(import.meta.url);
const __dirname = __dshDirname(__filename);
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};

// packages/dsh-chat/host/plugin.mjs
import { stat as stat5 } from "node:fs/promises";
import { join as join5, resolve as resolve3 } from "node:path";

// packages/dsh-chat/shared/contract.mjs
var CONTRACT_VERSION = 1;
var HUB_VERSION = "0.0.1";
var HOST_SERVICE = "dshChat";
var RPC_PREFIX = "dsh-chat";
var CONTROL_CHANNEL_ID = "control";
var CHANNEL_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;
var LEGACY_DIR_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validateChannelDefinition(definition) {
  if (!isPlainObject(definition)) throw new TypeError("registerChannel \u9700\u8981\u4E00\u4EFD\u6E20\u9053\u5B9A\u4E49\u5BF9\u8C61\u3002");
  const { id, label, order, createChannel, legacy, version } = definition;
  if (typeof id !== "string" || !CHANNEL_ID_PATTERN.test(id)) {
    throw new TypeError("\u6E20\u9053 id \u5FC5\u987B\u662F 2\u201332 \u4F4D\u5C0F\u5199\u5B57\u6BCD/\u6570\u5B57/\u8FDE\u5B57\u7B26\uFF0C\u4E14\u4EE5\u5B57\u6BCD\u5F00\u5934\u3002");
  }
  if (typeof label !== "string" && typeof label !== "function") {
    throw new TypeError("\u6E20\u9053 label \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6216\u8FD4\u56DE\u5B57\u7B26\u4E32\u7684\u51FD\u6570\u3002");
  }
  if (!Number.isFinite(order)) throw new TypeError("\u6E20\u9053 order \u5FC5\u987B\u662F\u6709\u9650\u6570\u5B57\u3002");
  if (typeof createChannel !== "function") {
    throw new TypeError("\u6E20\u9053\u5B9A\u4E49\u7F3A\u5C11 createChannel(deps) \u51FD\u6570\u3002");
  }
  if (legacy !== void 0) {
    if (!isPlainObject(legacy) || typeof legacy.dir !== "string" || !LEGACY_DIR_PATTERN.test(legacy.dir)) {
      throw new TypeError('\u6E20\u9053 legacy \u53EA\u63A5\u53D7 { dir: "dsh-<name>" } \u5F62\u5F0F\u7684\u8FC1\u79FB\u6765\u6E90\u3002');
    }
  }
  if (version !== void 0 && (typeof version !== "string" || !/^\d+\.\d+\.\d+/u.test(version))) {
    throw new TypeError("\u6E20\u9053 version \u5FC5\u987B\u662F\u5F62\u5982 1.2.3 \u7684\u7248\u672C\u53F7\u3002");
  }
  const resolveLabel = typeof label === "function" ? label : () => label;
  return Object.freeze({
    id,
    label: resolveLabel,
    order,
    createChannel,
    // 渠道包的版本（设置页的"版本与更新"面板用它对照 package.json）。
    version: version === void 0 ? null : version,
    legacy: legacy === void 0 ? null : Object.freeze({ dir: legacy.dir })
  });
}
function channelLabel(definition) {
  try {
    const value = definition.label();
    return typeof value === "string" && value.trim() ? value.trim() : definition.id;
  } catch {
    return definition.id;
  }
}

// packages/dsh-chat/shared/access-policy.mjs
var access_policy_exports = {};
__export(access_policy_exports, {
  ACCESS_CONVERSATION_TYPES: () => ACCESS_CONVERSATION_TYPES,
  ACCESS_POLICY_MODES: () => ACCESS_POLICY_MODES,
  ACCESS_RESULTS: () => ACCESS_RESULTS,
  OWNER_WILDCARD: () => OWNER_WILDCARD,
  defaultAccessPolicy: () => defaultAccessPolicy,
  describeAccessScope: () => describeAccessScope,
  evaluateAccess: () => evaluateAccess,
  hasWildcardOwner: () => hasWildcardOwner,
  isOwnerId: () => isOwnerId,
  normalizeAccessPolicy: () => normalizeAccessPolicy,
  validateAccessPolicy: () => validateAccessPolicy
});
var ACCESS_POLICY_MODES = Object.freeze(["open", "allowlist"]);
var ACCESS_CONVERSATION_TYPES = Object.freeze(["direct", "group"]);
var USER_ID_MAX_LENGTH = 256;
var CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
var ACCESS_RESULTS = Object.freeze({
  OWNER: "owner",
  OPEN: "open",
  ALLOWLIST: "allowlist",
  NOT_LISTED: "sender-not-allowed",
  COMMAND_DENIED: "command-not-allowed",
  NO_POLICY: "no-policy",
  INVALID: "invalid-context"
});
function invalid(message) {
  const error = new TypeError(message);
  error.code = "access-policy-invalid";
  return error;
}
function isPlainObject2(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function hasExactKeys(input, keys) {
  return isPlainObject2(input) && Reflect.ownKeys(input).length === keys.length && keys.every((key) => Object.hasOwn(input, key));
}
function normalizeUserId(value) {
  if (typeof value === "number" && Number.isFinite(value)) value = String(value);
  if (typeof value !== "string") throw invalid("\u7528\u6237\u6807\u8BC6\u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u3002");
  const normalized = value.replace(CONTROL_CHARACTERS, "").trim();
  if (!normalized || normalized.length > USER_ID_MAX_LENGTH) throw invalid("\u7528\u6237\u6807\u8BC6\u65E0\u6548\u3002");
  return normalized;
}
function validateUser(input) {
  if (!hasExactKeys(input, ["id", "canExecuteCommands"])) throw invalid("\u767D\u540D\u5355\u6761\u76EE\u683C\u5F0F\u4E0D\u6B63\u786E\u3002");
  if (typeof input.canExecuteCommands !== "boolean") throw invalid("\u547D\u4EE4\u6743\u9650\u5FC5\u987B\u662F\u5E03\u5C14\u503C\u3002");
  return Object.freeze({
    id: normalizeUserId(input.id),
    canExecuteCommands: input.canExecuteCommands
  });
}
function validateScope(input) {
  if (!hasExactKeys(input, ["mode", "open", "allowlist"])) throw invalid("\u8BBF\u95EE\u7B56\u7565\u7F3A\u5C11\u5B57\u6BB5\u3002");
  if (!ACCESS_POLICY_MODES.includes(input.mode)) throw invalid("\u8BBF\u95EE\u6A21\u5F0F\u53EA\u80FD\u662F open \u6216 allowlist\u3002");
  if (!hasExactKeys(input.open, ["defaultCanExecuteCommands", "commandPermissionOverrides"])) {
    throw invalid("open \u6BB5\u683C\u5F0F\u4E0D\u6B63\u786E\u3002");
  }
  if (typeof input.open.defaultCanExecuteCommands !== "boolean") {
    throw invalid("\u9ED8\u8BA4\u547D\u4EE4\u6743\u9650\u5FC5\u987B\u662F\u5E03\u5C14\u503C\u3002");
  }
  if (!Array.isArray(input.open.commandPermissionOverrides) || !Array.isArray(input.allowlist?.users)) {
    throw invalid("\u8BBF\u95EE\u7B56\u7565\u7684\u540D\u5355\u5FC5\u987B\u662F\u6570\u7EC4\u3002");
  }
  return Object.freeze({
    mode: input.mode,
    open: Object.freeze({
      defaultCanExecuteCommands: input.open.defaultCanExecuteCommands,
      commandPermissionOverrides: Object.freeze(input.open.commandPermissionOverrides.map(validateUser))
    }),
    allowlist: Object.freeze({ users: Object.freeze(input.allowlist.users.map(validateUser)) })
  });
}
var OWNER_WILDCARD = "*";
function hasWildcardOwner(ownerIds) {
  return Array.isArray(ownerIds) && ownerIds.includes(OWNER_WILDCARD);
}
function isOwnerId(ownerIds, senderId) {
  if (!Array.isArray(ownerIds) || typeof senderId !== "string" || !senderId) return false;
  return ownerIds.some((id) => id !== OWNER_WILDCARD && id === senderId);
}
function validateAccessPolicy(input) {
  if (!hasExactKeys(input, ["direct", "group"])) throw invalid("\u8BF7\u63D0\u4EA4\u5B8C\u6574\u7684\u8BBF\u95EE\u7B56\u7565\u3002");
  return Object.freeze({
    direct: validateScope(input.direct),
    group: validateScope(input.group)
  });
}
function normalizeAccessPolicy(input) {
  if (!isPlainObject2(input)) return null;
  const scopeOf = (value) => {
    const source = isPlainObject2(value) ? value : {};
    const open2 = isPlainObject2(source.open) ? source.open : {};
    const allowlist = isPlainObject2(source.allowlist) ? source.allowlist : {};
    const usersOf = (value2) => Array.isArray(value2) ? value2.map((user) => {
      try {
        return validateUser(user);
      } catch {
        return null;
      }
    }).filter(Boolean) : [];
    return {
      mode: ACCESS_POLICY_MODES.includes(source.mode) ? source.mode : "allowlist",
      open: {
        defaultCanExecuteCommands: open2.defaultCanExecuteCommands === true,
        commandPermissionOverrides: usersOf(open2.commandPermissionOverrides)
      },
      allowlist: { users: usersOf(allowlist.users) }
    };
  };
  return Object.freeze({
    direct: Object.freeze(scopeOf(input.direct)),
    group: Object.freeze(scopeOf(input.group))
  });
}
function defaultAccessPolicy() {
  const scope = () => ({
    mode: "allowlist",
    open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] },
    allowlist: { users: [] }
  });
  return validateAccessPolicy({ direct: scope(), group: scope() });
}
function evaluateAccess({
  policy,
  conversationType,
  senderIds,
  isCommand = false,
  isOwner = false
} = {}) {
  if (isOwner) return { allowed: true, reason: ACCESS_RESULTS.OWNER };
  if (!ACCESS_CONVERSATION_TYPES.includes(conversationType)) {
    return { allowed: false, reason: ACCESS_RESULTS.INVALID };
  }
  const normalized = normalizeAccessPolicy(policy);
  if (!normalized) return { allowed: false, reason: ACCESS_RESULTS.NO_POLICY };
  const candidates = (Array.isArray(senderIds) ? senderIds : [senderIds]).map((candidate) => {
    try {
      return normalizeUserId(candidate);
    } catch {
      return null;
    }
  }).filter(Boolean);
  if (candidates.length === 0) return { allowed: false, reason: ACCESS_RESULTS.NOT_LISTED };
  const scope = normalized[conversationType];
  const users = scope.mode === "open" ? scope.open.commandPermissionOverrides : scope.allowlist.users;
  const matched = users.filter((user) => candidates.includes(user.id));
  if (scope.mode === "allowlist" && matched.length === 0) {
    return { allowed: false, reason: ACCESS_RESULTS.NOT_LISTED };
  }
  if (isCommand) {
    const canExecute = scope.mode === "open" ? matched.length > 0 ? matched.every((user) => user.canExecuteCommands) : scope.open.defaultCanExecuteCommands : matched.every((user) => user.canExecuteCommands);
    if (!canExecute) return { allowed: false, reason: ACCESS_RESULTS.COMMAND_DENIED };
  }
  return {
    allowed: true,
    reason: scope.mode === "open" ? ACCESS_RESULTS.OPEN : ACCESS_RESULTS.ALLOWLIST
  };
}
function describeAccessScope(policy, conversationType) {
  const normalized = normalizeAccessPolicy(policy);
  if (!normalized) return "\u672A\u8BBE\u7F6E\uFF08\u4EC5\u5C5E\u4E3B\u53EF\u7528\uFF09";
  const scope = normalized[conversationType];
  if (scope.mode === "open") {
    return `\u4EFB\u4F55\u4EBA\u53EF\u7528\uFF08\u547D\u4EE4\u9ED8\u8BA4${scope.open.defaultCanExecuteCommands ? "\u5141\u8BB8" : "\u4E0D\u5141\u8BB8"}\uFF09`;
  }
  const count = scope.allowlist.users.length;
  return count === 0 ? "\u4EC5\u5C5E\u4E3B\u53EF\u7528" : `\u540D\u5355\u5185 ${count} \u4EBA\u53EF\u7528`;
}

// packages/dsh-chat/shared/context-enhancement.mjs
var context_enhancement_exports = {};
__export(context_enhancement_exports, {
  CONTEXT_BLOCK_SEPARATOR: () => CONTEXT_BLOCK_SEPARATOR,
  CONTEXT_FIELDS: () => CONTEXT_FIELDS,
  CONTEXT_TAGS: () => CONTEXT_TAGS,
  DEFAULT_CONTEXT_CONFIG: () => DEFAULT_CONTEXT_CONFIG,
  DEFAULT_SCOPE: () => DEFAULT_SCOPE,
  DIRECT_GUIDANCE_EXAMPLE: () => DIRECT_GUIDANCE_EXAMPLE,
  GROUP_GUIDANCE_EXAMPLE: () => GROUP_GUIDANCE_EXAMPLE,
  GUIDANCE_MAX_LENGTH: () => GUIDANCE_MAX_LENGTH,
  TARGET_ID_MAX_LENGTH: () => TARGET_ID_MAX_LENGTH,
  TARGET_KINDS: () => TARGET_KINDS,
  TARGET_LABEL_MAX_LENGTH: () => TARGET_LABEL_MAX_LENGTH,
  TARGET_LIMIT: () => TARGET_LIMIT,
  TARGET_MERGES: () => TARGET_MERGES,
  captureContextEnhancement: () => captureContextEnhancement,
  captureContextEnhancementSource: () => captureContextEnhancementSource,
  contextStatusLabel: () => contextStatusLabel,
  enhanceContent: () => enhanceContent,
  normalizeContextConfig: () => normalizeContextConfig,
  resolveContextScope: () => resolveContextScope,
  validateContextConfig: () => validateContextConfig
});
var CONTEXT_FIELDS = Object.freeze([
  "channel",
  "conversationType",
  "senderId",
  "senderName",
  "conversationTitle",
  "chatId",
  "threadId",
  "botId"
]);
var CONTEXT_TAGS = Object.freeze({
  sourceOpen: "<dsh_im_source>",
  sourceClose: "</dsh_im_source>",
  guidanceOpen: "<dsh_im_source_guidance>",
  guidanceClose: "</dsh_im_source_guidance>"
});
var CONTEXT_BLOCK_SEPARATOR = "\n\n";
var GUIDANCE_MAX_LENGTH = 8e3;
var TARGET_LIMIT = 50;
var TARGET_LABEL_MAX_LENGTH = 80;
var TARGET_ID_MAX_LENGTH = 256;
var TARGET_KINDS = Object.freeze(["user", "group"]);
var TARGET_MERGES = Object.freeze(["append", "replace"]);
var GROUP_GUIDANCE_EXAMPLE = `\u4EC5\u4F9D\u636E\u5F53\u524D\u6D88\u606F\u7684 ${CONTEXT_TAGS.sourceOpen} \u4E2D\u5B9E\u9645\u63D0\u4F9B\u7684\u5B57\u6BB5\u7406\u89E3\u6765\u6E90\uFF1B\u6CA1\u6709\u63D0\u4F9B\u7684\u5B57\u6BB5\u4E0D\u8981\u731C\u6D4B\u6216\u8865\u5168\u3002
\u5F53\u524D\u6D88\u606F\u6765\u81EA\u7FA4\u804A\uFF0C\u8BF7\u4F7F\u7528\u4E25\u8083\u3001\u514B\u5236\u3001\u7B80\u6D01\u7684\u8868\u8FBE\u65B9\u5F0F\u3002`;
var DIRECT_GUIDANCE_EXAMPLE = `\u4EC5\u4F9D\u636E\u5F53\u524D\u6D88\u606F\u7684 ${CONTEXT_TAGS.sourceOpen} \u4E2D\u5B9E\u9645\u63D0\u4F9B\u7684\u5B57\u6BB5\u7406\u89E3\u6765\u6E90\uFF1B\u6CA1\u6709\u63D0\u4F9B\u7684\u5B57\u6BB5\u4E0D\u8981\u731C\u6D4B\u6216\u8865\u5168\u3002
\u5F53\u524D\u6D88\u606F\u6765\u81EA\u79C1\u804A\uFF0C\u53EF\u4EE5\u4F7F\u7528\u66F4\u8F7B\u677E\u3001\u5E7D\u9ED8\u3001\u8BE6\u7EC6\u7684\u8868\u8FBE\u65B9\u5F0F\u3002`;
var DEFAULT_SCOPE = Object.freeze({
  enabled: false,
  fields: Object.freeze(["senderId"]),
  guidance: ""
});
var DEFAULT_CONTEXT_CONFIG = Object.freeze({
  group: DEFAULT_SCOPE,
  direct: DEFAULT_SCOPE,
  targets: Object.freeze([])
});
var CONFIG_KEYS = Object.freeze(["group", "direct", "targets"]);
var SCOPE_KEYS = Object.freeze(["enabled", "fields", "guidance"]);
var TARGET_KEYS = Object.freeze([
  "kind",
  "id",
  "label",
  "enabled",
  "fields",
  "guidance",
  "merge"
]);
var LEGACY_KEYS = Object.freeze(["groupEnabled", "directEnabled", "fields", "guidance"]);
var SOURCE_LIMITS = Object.freeze({
  channel: 16,
  conversationType: 6,
  senderId: 256,
  senderName: 256,
  conversationTitle: 256,
  chatId: 256,
  threadId: 256,
  botId: 128
});
var CONTROL_CHARACTERS2 = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
var CONTROL_CHARACTER_TEST = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
var KNOWN_CHANNELS = /* @__PURE__ */ new Set(["feishu", "weixin"]);
function invalid2(message) {
  const error = new TypeError(message);
  error.code = "context-enhancement-invalid";
  return error;
}
function isPlainObject3(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function hasExactKeys2(input, keys) {
  return isPlainObject3(input) && Reflect.ownKeys(input).length === keys.length && keys.every((key) => Object.hasOwn(input, key));
}
function offlineText(value, maxLength) {
  return typeof value === "string" ? value.replace(CONTROL_CHARACTERS2, "").slice(0, maxLength) : "";
}
function validateScope2(input, where) {
  if (!hasExactKeys2(input, SCOPE_KEYS)) throw invalid2(`${where}\u8BBE\u7F6E\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u4FDD\u5B58\u3002`);
  const { enabled, fields, guidance } = input;
  if (typeof enabled !== "boolean") throw invalid2(`${where}\u7684\u542F\u7528\u5F00\u5173\u5FC5\u987B\u662F\u5E03\u5C14\u503C\u3002`);
  if (!Array.isArray(fields) || !fields.every((field) => CONTEXT_FIELDS.includes(field))) {
    throw invalid2(`${where}\u7684\u6765\u6E90\u5B57\u6BB5\u53EA\u80FD\u4ECE\u5DF2\u5B9A\u4E49\u7684\u516B\u4E2A\u5B57\u6BB5\u4E2D\u9009\u62E9\u3002`);
  }
  if (typeof guidance !== "string" || guidance.length > GUIDANCE_MAX_LENGTH) {
    throw invalid2(`${where}\u7684\u589E\u5F3A\u63D0\u793A\u8BCD\u4E0D\u5F97\u8D85\u8FC7 ${GUIDANCE_MAX_LENGTH} \u4E2A\u5B57\u7B26\u3002`);
  }
  return Object.freeze({
    enabled,
    fields: Object.freeze(CONTEXT_FIELDS.filter((field) => fields.includes(field))),
    guidance: guidance.trim() ? guidance : ""
  });
}
function validateTarget(input) {
  if (!hasExactKeys2(input, TARGET_KEYS)) throw invalid2("\u6307\u5B9A\u8BBE\u7F6E\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u4FDD\u5B58\u3002");
  const {
    kind,
    id,
    label,
    enabled,
    fields,
    guidance,
    merge
  } = input;
  if (!TARGET_KINDS.includes(kind)) throw invalid2('\u6307\u5B9A\u8BBE\u7F6E\u7684\u7C7B\u578B\u53EA\u80FD\u662F"\u6307\u5B9A\u7528\u6237"\u6216"\u6307\u5B9A\u7FA4"\u3002');
  const targetId = typeof id === "string" ? id.trim() : "";
  if (!targetId || targetId.length > TARGET_ID_MAX_LENGTH || CONTROL_CHARACTER_TEST.test(targetId) || /\s/.test(targetId)) {
    throw invalid2("\u6307\u5B9A\u8BBE\u7F6E\u7684\u6807\u8BC6\u4E0D\u80FD\u4E3A\u7A7A\u3001\u4E0D\u80FD\u5305\u542B\u7A7A\u767D\u6216\u63A7\u5236\u5B57\u7B26\uFF0C\u4E14\u4E0D\u5F97\u8D85\u8FC7 256 \u4E2A\u5B57\u7B26\u3002");
  }
  if (/^(p2p|group)_/.test(targetId)) {
    throw invalid2("\u8FD9\u91CC\u8981\u586B\u5E73\u53F0 id\uFF08\u5982 ou_\u2026 / oc_\u2026\uFF09\uFF0C\u4E0D\u662F\u6295\u9012\u76EE\u6807\u7684 id\uFF08p2p_\u2026 / group_\u2026\uFF09\u3002");
  }
  if (typeof label !== "string" || label.length > TARGET_LABEL_MAX_LENGTH) {
    throw invalid2(`\u6307\u5B9A\u8BBE\u7F6E\u7684\u5907\u6CE8\u540D\u4E0D\u5F97\u8D85\u8FC7 ${TARGET_LABEL_MAX_LENGTH} \u4E2A\u5B57\u7B26\u3002`);
  }
  if (typeof enabled !== "boolean") throw invalid2("\u6307\u5B9A\u8BBE\u7F6E\u7684\u542F\u7528\u5F00\u5173\u5FC5\u987B\u662F\u5E03\u5C14\u503C\u3002");
  if (!Array.isArray(fields) || !fields.every((field) => CONTEXT_FIELDS.includes(field))) {
    throw invalid2("\u6307\u5B9A\u8BBE\u7F6E\u7684\u6765\u6E90\u5B57\u6BB5\u53EA\u80FD\u4ECE\u5DF2\u5B9A\u4E49\u7684\u516B\u4E2A\u5B57\u6BB5\u4E2D\u9009\u62E9\u3002");
  }
  if (typeof guidance !== "string" || guidance.length > GUIDANCE_MAX_LENGTH) {
    throw invalid2(`\u6307\u5B9A\u8BBE\u7F6E\u7684\u589E\u5F3A\u63D0\u793A\u8BCD\u4E0D\u5F97\u8D85\u8FC7 ${GUIDANCE_MAX_LENGTH} \u4E2A\u5B57\u7B26\u3002`);
  }
  if (!TARGET_MERGES.includes(merge)) throw invalid2('\u6307\u5B9A\u8BBE\u7F6E\u7684\u63D0\u793A\u8BCD\u53E0\u52A0\u65B9\u5F0F\u53EA\u652F\u6301"\u53E0\u52A0"\u6216"\u8986\u76D6"\u3002');
  return Object.freeze({
    kind,
    id: targetId,
    label: offlineText(label, TARGET_LABEL_MAX_LENGTH).trim(),
    enabled,
    fields: Object.freeze(CONTEXT_FIELDS.filter((field) => fields.includes(field))),
    guidance: guidance.trim() ? guidance : "",
    merge
  });
}
function validateContextConfig(input) {
  if (!hasExactKeys2(input, CONFIG_KEYS)) throw invalid2("\u8BF7\u63D0\u4EA4\u5B8C\u6574\u7684\u4E0A\u4E0B\u6587\u589E\u5F3A\u8BBE\u7F6E\u3002");
  if (!Array.isArray(input.targets)) throw invalid2("\u6307\u5B9A\u8BBE\u7F6E\u5FC5\u987B\u662F\u5217\u8868\u3002");
  if (input.targets.length > TARGET_LIMIT) {
    throw invalid2(`\u6307\u5B9A\u8BBE\u7F6E\u6700\u591A ${TARGET_LIMIT} \u6761\u3002`);
  }
  const targets = input.targets.map(validateTarget);
  const seen = /* @__PURE__ */ new Set();
  for (const target of targets) {
    const key = `${target.kind}:${target.id}`;
    if (seen.has(key)) throw invalid2(`\u6307\u5B9A\u8BBE\u7F6E\u4E2D\u300C${target.id}\u300D\u91CD\u590D\uFF0C\u8BF7\u5408\u5E76\u540E\u518D\u4FDD\u5B58\u3002`);
    seen.add(key);
  }
  return Object.freeze({
    group: validateScope2(input.group, "\u7FA4\u804A"),
    direct: validateScope2(input.direct, "\u79C1\u804A"),
    targets: Object.freeze(targets)
  });
}
function migrateLegacyConfig(input) {
  if (!hasExactKeys2(input, LEGACY_KEYS)) throw invalid2("\u8BF7\u63D0\u4EA4\u5B8C\u6574\u7684\u4E0A\u4E0B\u6587\u589E\u5F3A\u8BBE\u7F6E\u3002");
  return validateContextConfig({
    group: { enabled: input.groupEnabled, fields: input.fields, guidance: input.guidance },
    direct: { enabled: input.directEnabled, fields: input.fields, guidance: input.guidance },
    targets: []
  });
}
function normalizeContextConfig(input) {
  try {
    return validateContextConfig(input);
  } catch {
    try {
      return migrateLegacyConfig(input);
    } catch {
      try {
        if (isPlainObject3(input)) {
          return validateContextConfig({ ...input, targets: input.targets ?? [] });
        }
      } catch {
      }
      return DEFAULT_CONTEXT_CONFIG;
    }
  }
}
function resolveContextScope(config, conversationType, identity = {}) {
  if (conversationType !== "direct" && conversationType !== "group") return null;
  const normalized = normalizeContextConfig(config);
  const scope = normalized[conversationType];
  const target = normalized.targets.find((candidate) => {
    if (candidate.enabled !== true) return false;
    if (conversationType === "direct") {
      return candidate.kind === "user" && candidate.id === identity.senderId;
    }
    return candidate.kind === "group" && candidate.id === identity.chatId;
  });
  if (!target) return scope.enabled === true ? scope : null;
  const stacks = target.merge === "append" && scope.enabled === true;
  const guidance = stacks ? [target.guidance.trim(), scope.guidance.trim()].filter(Boolean).join("\n\n") : target.guidance;
  return Object.freeze({ enabled: true, fields: target.fields, guidance });
}
function captureContextEnhancement(provider, conversationType, identity) {
  try {
    const scope = resolveContextScope(provider?.readConfig?.(), conversationType, identity);
    if (!scope) return null;
    return Object.freeze({
      botId: typeof provider?.botId === "string" ? provider.botId : "",
      channel: typeof provider?.channel === "string" ? provider.channel : "",
      conversationType,
      scope
    });
  } catch {
    return null;
  }
}
function captureContextEnhancementSource(provider, conversationType, identity, sourceFactory) {
  const snapshot = captureContextEnhancement(provider, conversationType, identity);
  return snapshot === null ? null : Object.freeze({ snapshot, source: sourceFactory });
}
function sourceValue(value, field) {
  if (field === "senderId" && (typeof value === "bigint" || Number.isFinite(value))) {
    value = String(value);
  }
  if (typeof value !== "string") return void 0;
  const normalized = value.replace(CONTROL_CHARACTERS2, "").trim().slice(0, SOURCE_LIMITS[field]);
  if (!normalized) return void 0;
  if (field === "channel" && !KNOWN_CHANNELS.has(normalized)) return void 0;
  return normalized;
}
function jsonForTag(value) {
  return JSON.stringify(value).replace(/[<>&]/g, (character) => ({
    "<": "\\u003c",
    ">": "\\u003e",
    "&": "\\u0026"
  })[character]);
}
function sourceBlock(snapshot, sourceFactory) {
  const { fields } = snapshot.scope;
  const needsSource = fields.some((field) => field !== "botId" && field !== "conversationType" && field !== "channel");
  const source = needsSource && typeof sourceFactory === "function" ? sourceFactory() : null;
  const projected = {};
  for (const field of fields) {
    const raw = field === "botId" || field === "conversationType" || field === "channel" ? snapshot[field] : source?.[field];
    const value = sourceValue(raw, field);
    if (value !== void 0) projected[field] = value;
  }
  if (Object.keys(projected).length === 0) return "";
  return `${CONTEXT_TAGS.sourceOpen}${jsonForTag(projected)}${CONTEXT_TAGS.sourceClose}`;
}
function guidanceBlock(guidance) {
  if (typeof guidance !== "string" || !guidance.trim()) return "";
  const body = guidance.replace(
    /<\/?dsh_im_source_guidance\b[^>]*(?:>|$)/gi,
    (tag) => tag.replace(/</g, "&lt;").replace(/>/g, "&gt;")
  );
  return `${CONTEXT_TAGS.guidanceOpen}
${body}
${CONTEXT_TAGS.guidanceClose}`;
}
function enhanceContent(content, snapshot, sourceFactory) {
  if (!snapshot) return content;
  try {
    const blocks = [
      sourceBlock(snapshot, sourceFactory),
      guidanceBlock(snapshot.scope.guidance)
    ].filter(Boolean);
    if (blocks.length === 0) return content;
    const prefix = blocks.join(CONTEXT_BLOCK_SEPARATOR);
    if (typeof content === "string") return `${prefix}${CONTEXT_BLOCK_SEPARATOR}${content}`;
    if (Array.isArray(content)) return [{ type: "text", text: prefix }, ...content];
    return content;
  } catch {
    return content;
  }
}
function contextStatusLabel(config) {
  const { group, direct, targets } = normalizeContextConfig(config);
  const parts = [];
  if (group.enabled) parts.push("\u7FA4\u804A");
  if (direct.enabled) parts.push("\u79C1\u804A");
  const active = targets.filter((target) => target.enabled).length;
  if (parts.length === 0 && active === 0) return "\u672A\u5F00\u542F";
  const scopeText = parts.length === 0 ? "\u672A\u5F00\u542F\u5168\u5C40" : `${parts.join("\u548C")}\u5168\u5C40`;
  return active === 0 ? scopeText : `${scopeText} \xB7 ${active} \u9879\u6307\u5B9A`;
}

// packages/dsh-chat/host/bot-settings.mjs
import { readFile as readFile2 } from "node:fs/promises";
import { join } from "node:path";

// packages/dsh-chat/host/json-store.mjs
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
function createJsonStore({
  path,
  normalize,
  empty,
  logger = console,
  label = "JSON \u6587\u6863"
}) {
  if (typeof path !== "string" || !path.trim()) throw new TypeError("json store \u9700\u8981 path\u3002");
  if (typeof normalize !== "function") throw new TypeError("json store \u9700\u8981 normalize\u3002");
  if (typeof empty !== "function") throw new TypeError("json store \u9700\u8981 empty\u3002");
  let document = normalize(empty());
  let loaded = false;
  let loading = null;
  let queue = Promise.resolve();
  let backedUp = false;
  const listeners = /* @__PURE__ */ new Set();
  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener(document);
      } catch {
      }
    }
  }
  async function persist() {
    const body = `${JSON.stringify(document, null, 2)}
`;
    await mkdir(dirname(path), { recursive: true });
    if (!backedUp) {
      try {
        const previous = await readFile(path, "utf8");
        if (previous.trim()) {
          const stamp2 = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
          await writeFile(`${path}.bak-${stamp2}`, previous, "utf8");
          backedUp = true;
        }
      } catch {
      }
    }
    const temporary = `${path}.tmp-${randomBytes(6).toString("hex")}`;
    await writeFile(temporary, body, "utf8");
    await rename(temporary, path);
  }
  function enqueue(task) {
    const next = queue.then(task, task);
    queue = next.then(() => void 0, () => void 0);
    return next;
  }
  async function load() {
    if (loaded) return document;
    try {
      document = normalize(JSON.parse(await readFile(path, "utf8")));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        logger.warn?.(`[dsh-chat] \u8BFB\u53D6 ${path} \u5931\u8D25\uFF0C\u4F7F\u7528\u7A7A${label}\uFF1A${error?.message ?? error}`);
      }
      document = normalize(empty());
    }
    loaded = true;
    return document;
  }
  return {
    path,
    /** 等磁盘文档就绪（并发多次调用只读一次盘）。 */
    async ready() {
      if (loaded) return document;
      loading = loading ?? load();
      return loading;
    },
    /** @returns 当前文档。 */
    snapshot() {
      return document;
    },
    /**
     * 串行地读-改-写。
     *
     * @param updater - `(current) => next | null`；返回 null 表示不写盘。
     * @returns 写入后的文档。
     */
    async update(updater) {
      return enqueue(async () => {
        await this.ready();
        const next = updater(document);
        if (next === null || next === void 0) return document;
        document = normalize(next);
        await persist();
        notify();
        return document;
      });
    },
    /** 等待已排队的写入落定（停机前调用，避免和进程退出抢时间）。 */
    async flush() {
      await queue;
    },
    /**
     * 订阅文档变更（写入成功后触发）。
     *
     * @param listener - `(document) => void`。
     * @returns 取消订阅函数。
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

// packages/dsh-chat/host/bot-settings.mjs
var DOCUMENT_VERSION = 1;
var EMPTY_RECORD = Object.freeze({
  workspace: null,
  model: null,
  agentPreset: null,
  contextEnhancement: null,
  accessPolicy: null,
  deliveryTargets: null
});
var RECORD_KEYS = Object.freeze(Object.keys(EMPTY_RECORD));
var LEGACY_SOURCES = Object.freeze({
  workspaces: "workspace",
  models: "model",
  agentPresets: "agentPreset",
  contextEnhancement: "contextEnhancement",
  accessPolicies: "accessPolicy",
  deliveryTargets: "deliveryTargets"
});
function isPlainObject4(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function cloneRecord(record) {
  return {
    ...EMPTY_RECORD,
    ...isPlainObject4(record) ? record : {}
  };
}
function normalizeDocument(value) {
  const source = isPlainObject4(value) && value.version === DOCUMENT_VERSION ? value : {};
  const imports = isPlainObject4(source.imports) ? { ...source.imports } : {};
  const channels = {};
  if (isPlainObject4(source.channels)) {
    for (const [channelId, bots] of Object.entries(source.channels)) {
      if (!isPlainObject4(bots)) continue;
      const entries = {};
      for (const [botId, record] of Object.entries(bots)) {
        if (!isPlainObject4(record)) continue;
        entries[botId] = cloneRecord(record);
      }
      channels[channelId] = entries;
    }
  }
  return { version: DOCUMENT_VERSION, imports, channels };
}
function createBotSettingsStore({ dataDir, logger = console } = {}) {
  if (typeof dataDir !== "string" || !dataDir.trim()) {
    throw new TypeError("bot settings \u9700\u8981 dataDir\u3002");
  }
  const store = createJsonStore({
    path: join(dataDir, "bots.json"),
    normalize: normalizeDocument,
    empty: () => ({ version: DOCUMENT_VERSION, imports: {}, channels: {} }),
    logger,
    label: "\u6BCF\u673A\u5668\u4EBA\u8BBE\u7F6E"
  });
  function readRecord(channelId, botId) {
    const stored = store.snapshot().channels?.[channelId]?.[botId];
    const record = cloneRecord(stored);
    record.contextEnhancement = stored?.contextEnhancement === void 0 || stored?.contextEnhancement === null ? null : normalizeContextConfig(stored.contextEnhancement);
    return Object.freeze(record);
  }
  return {
    path: store.path,
    /** 等待磁盘文档就绪；渠道读取设置前应 await 它。 */
    ready: () => store.ready(),
    /** @returns 冻结的机器人记录（缺失时为默认值）。 */
    read: readRecord,
    /** 合并写入若干字段（未知键一律拒绝）。 */
    async write(channelId, botId, patch) {
      if (typeof channelId !== "string" || !channelId) throw new TypeError("channelId \u5FC5\u586B\u3002");
      if (typeof botId !== "string" || !botId) throw new TypeError("botId \u5FC5\u586B\u3002");
      if (!isPlainObject4(patch)) throw new TypeError("patch \u5FC5\u987B\u662F\u5BF9\u8C61\u3002");
      const unknown = Object.keys(patch).filter((key) => !RECORD_KEYS.includes(key));
      if (unknown.length > 0) throw new TypeError(`\u672A\u77E5\u7684\u8BBE\u7F6E\u5B57\u6BB5\uFF1A${unknown.join("\u3001")}`);
      const normalized = Object.hasOwn(patch, "contextEnhancement") && patch.contextEnhancement !== null ? { ...patch, contextEnhancement: normalizeContextConfig(patch.contextEnhancement) } : patch;
      await store.update((current) => {
        const channels = { ...current.channels };
        const bots = { ...channels[channelId] ?? {} };
        bots[botId] = { ...cloneRecord(bots[botId]), ...normalized };
        channels[channelId] = bots;
        return { ...current, channels };
      });
      return readRecord(channelId, botId);
    },
    /** @returns 该渠道下的全部记录（含 botId）。 */
    list(channelId) {
      const bots = store.snapshot().channels?.[channelId] ?? {};
      return Object.freeze(Object.keys(bots).map((botId) => Object.freeze({
        botId,
        ...readRecord(channelId, botId)
      })));
    },
    /** 订阅变更。 */
    subscribe: (listener) => store.subscribe(listener),
    /**
     * 一次性把旧渠道的 `workspaces.json` 导入为每机器人设置。
     *
     * 只读旧文件，绝不改写；导入过后记 `imports[channelId]`，因此用户在 dsh-chat 里
     * 清空某条设置后不会在下次启动被"复活"。`force: true` 时忽略标记并以旧文件为准刷新。
     *
     * @param channelId - 渠道 id。
     * @param legacyDir - 旧数据目录（绝对路径）。
     * @param options - { force }。
     * @returns { imported, bots } 或 { skipped }。
     */
    async importLegacy(channelId, legacyDir, { force = false } = {}) {
      if (!force) {
        await store.ready();
        if (store.snapshot().imports[channelId]) {
          return { skipped: "\u5DF2\u5BFC\u5165\u8FC7", imported: 0, bots: [] };
        }
      }
      const source = join(legacyDir, "workspaces.json");
      let legacy = null;
      try {
        legacy = JSON.parse(await readFile2(source, "utf8"));
      } catch (error) {
        if (error?.code === "ENOENT") {
          await store.update((current) => ({
            ...current,
            imports: {
              ...current.imports,
              [channelId]: { path: source, importedAt: (/* @__PURE__ */ new Date()).toISOString(), bots: [] }
            }
          }));
          return { imported: 0, bots: [] };
        }
        logger.warn?.(`[dsh-chat] \u65E7\u8BBE\u7F6E ${source} \u65E0\u6CD5\u89E3\u6790\uFF0C\u7A0D\u540E\u91CD\u8BD5\uFF1A${error?.message ?? error}`);
        return { skipped: "\u65E7\u8BBE\u7F6E\u65E0\u6CD5\u89E3\u6790", imported: 0, bots: [] };
      }
      const perBot = /* @__PURE__ */ new Map();
      for (const [legacyKey, recordKey] of Object.entries(LEGACY_SOURCES)) {
        const table = legacy?.[legacyKey];
        if (!isPlainObject4(table)) continue;
        for (const [botId, value] of Object.entries(table)) {
          if (value === null || value === void 0) continue;
          const entry = perBot.get(botId) ?? {};
          entry[recordKey] = recordKey === "contextEnhancement" ? normalizeContextConfig(value) : value;
          perBot.set(botId, entry);
        }
      }
      await store.update((current) => {
        const channels = { ...current.channels };
        if (perBot.size > 0) {
          const bots = { ...channels[channelId] ?? {} };
          for (const [botId, patch] of perBot) {
            const merged = cloneRecord(bots[botId]);
            for (const [key, value] of Object.entries(patch)) {
              if (force || merged[key] === null) merged[key] = value;
            }
            bots[botId] = merged;
          }
          channels[channelId] = bots;
        }
        return {
          ...current,
          imports: {
            ...current.imports,
            [channelId]: {
              path: source,
              importedAt: (/* @__PURE__ */ new Date()).toISOString(),
              bots: [...perBot.keys()]
            }
          },
          channels
        };
      });
      if (perBot.size > 0) {
        logger.info?.(`[dsh-chat] \u5DF2\u4ECE ${source} \u5BFC\u5165 ${perBot.size} \u4E2A\u673A\u5668\u4EBA\u7684\u8BBE\u7F6E`);
      }
      return { imported: perBot.size, bots: [...perBot.keys()] };
    },
    /** @returns 已导入来源的快照（调试与测试用）。 */
    imports() {
      return Object.freeze({ ...store.snapshot().imports });
    }
  };
}

// packages/dsh-chat/host/rpc.mjs
function rpcEndpoint(channelId) {
  return `${RPC_PREFIX}/${channelId}`;
}
function rpcPath(channelId) {
  return `/api/${rpcEndpoint(channelId)}`;
}
function ok(value) {
  return { ok: true, value };
}
function fail(code, message, details = {}) {
  return { ok: false, error: { code, message, details } };
}
function failFrom(error, fallbackCode = "chat/internal") {
  const code = typeof error?.code === "string" ? error.code : fallbackCode;
  const message = typeof error?.message === "string" && error.message ? error.message : "\u804A\u5929\u63D2\u4EF6\u5185\u90E8\u9519\u8BEF\u3002";
  return fail(code, message);
}
function jsonResponse(rpcId, result) {
  const value = result?.ok === false ? { ...result, error: { ...result.error, details: result.error?.details ?? {} } } : result;
  return Response.json({ type: "server-response", rpcId, result: value });
}
function createRpcCarrier(ctx, { logger = console } = {}) {
  if (typeof ctx?.connection?.fetch?.register !== "function") {
    throw new TypeError("dsh-chat \u9700\u8981 DSH \u7684 connection.fetch \u6CE8\u518C\u8868\u3002");
  }
  const releases = /* @__PURE__ */ new Map();
  function register(channelId, handler) {
    const path = rpcPath(channelId);
    const endpoint = rpcEndpoint(channelId);
    if (releases.has(path)) throw new Error(`RPC \u8DEF\u5F84 ${path} \u5DF2\u88AB\u6CE8\u518C\u3002`);
    if (typeof handler !== "function") throw new TypeError("RPC handler \u5FC5\u987B\u662F\u51FD\u6570\u3002");
    const dispose = ctx.connection.fetch.register({
      path,
      methods: ["POST"],
      requestBody: "buffered",
      async fetch(request) {
        if (request.method !== "POST") return new Response("method not allowed", { status: 405 });
        const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
        if (contentType !== "application/json") {
          return new Response("content type must be application/json", { status: 415 });
        }
        let message;
        try {
          message = await request.json();
        } catch {
          return new Response("body is not JSON", { status: 400 });
        }
        const rpcId = typeof message?.rpcId === "string" ? message.rpcId : "invalid-request";
        const call = message?.payload;
        if (message?.type !== "client-request" || typeof message.rpcId !== "string" || message.method !== endpoint || call === null || typeof call !== "object" || Array.isArray(call) || typeof call.method !== "string" || !Object.hasOwn(call, "payload")) {
          return jsonResponse(rpcId, fail("chat/bad-request", "\u65E0\u6548\u7684\u804A\u5929\u63D2\u4EF6\u7BA1\u7406\u8BF7\u6C42\u3002"));
        }
        try {
          return jsonResponse(rpcId, await handler(call.method, call.payload, request.signal));
        } catch (error) {
          logger.warn?.(`[dsh-chat] ${endpoint} \u5904\u7406 ${call.method} \u5931\u8D25\uFF1A${error?.message ?? error}`);
          return jsonResponse(rpcId, failFrom(error));
        }
      }
    });
    const release = () => {
      if (!releases.delete(path)) return;
      try {
        dispose?.();
      } catch {
      }
    };
    releases.set(path, release);
    return release;
  }
  return {
    register,
    /** @returns 已注册的路径数。 */
    get registered() {
      return releases.size;
    },
    /** 释放全部路由（插件卸载时）。 */
    disposeAll() {
      for (const release of [...releases.values()]) release();
    }
  };
}

// packages/dsh-chat/host/channel-registry.mjs
var STATUSES = /* @__PURE__ */ new Set(["starting", "running", "failed", "stopped"]);
function describeError(error) {
  if (!error) return null;
  return Object.freeze({
    code: typeof error.code === "string" ? error.code : "chat/channel-error",
    message: typeof error.message === "string" && error.message ? error.message : String(error)
  });
}
function createChannelRegistry({
  logger = console,
  rpc,
  createDeps,
  onRegistered,
  onDelivery
}) {
  if (typeof rpc?.register !== "function") throw new TypeError("\u6E20\u9053\u6CE8\u518C\u8868\u9700\u8981 rpc \u8F7D\u4F53\u3002");
  if (typeof createDeps !== "function") throw new TypeError("\u6E20\u9053\u6CE8\u518C\u8868\u9700\u8981 createDeps\u3002");
  const channels = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  let snapshot = Object.freeze([]);
  function publish() {
    snapshot = Object.freeze([...channels.values()].map((record) => Object.freeze({
      id: record.definition.id,
      label: channelLabel(record.definition),
      order: record.definition.order,
      version: record.definition.version ?? null,
      status: record.status,
      error: record.error,
      startedAt: record.startedAt
    })).sort((left, right) => left.order === right.order ? left.id.localeCompare(right.id) : left.order - right.order));
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
      }
    }
  }
  function setStatus(record, status, error = null) {
    if (!STATUSES.has(status)) throw new TypeError(`\u672A\u77E5\u6E20\u9053\u72B6\u6001\uFF1A${status}`);
    record.status = status;
    record.error = describeError(error);
    publish();
  }
  async function start(record) {
    const { definition } = record;
    try {
      const instance = await definition.createChannel(record.deps);
      if (record.disposed) {
        await instance?.stop?.();
        return;
      }
      if (instance === null || typeof instance !== "object") {
        throw new TypeError(`\u6E20\u9053 ${definition.id} \u7684 createChannel \u5FC5\u987B\u8FD4\u56DE\u5B9E\u4F8B\u5BF9\u8C61\u3002`);
      }
      if (instance.endpoints !== void 0 && (typeof instance.endpoints !== "object" || instance.endpoints === null || Array.isArray(instance.endpoints))) {
        throw new TypeError(`\u6E20\u9053 ${definition.id} \u7684 endpoints \u5FC5\u987B\u662F\u65B9\u6CD5\u8868\u3002`);
      }
      record.instance = instance;
      if (instance.delivery !== void 0 && typeof onDelivery === "function") {
        record.releaseDelivery = onDelivery(definition.id, instance.delivery);
      }
      await instance.start?.();
      if (record.disposed) {
        await instance.stop?.();
        record.releaseDelivery?.();
        return;
      }
      if (record.status === "starting") setStatus(record, "running");
    } catch (error) {
      setStatus(record, "failed", error);
      logger.error?.(`[dsh-chat] \u6E20\u9053 ${definition.id} \u542F\u52A8\u5931\u8D25\uFF1A${error?.message ?? error}`);
    }
  }
  async function stop(record) {
    record.disposed = true;
    record.releaseRoutes?.();
    record.releaseRoutes = null;
    record.releaseDelivery?.();
    record.releaseDelivery = null;
    try {
      await record.instance?.stop?.();
    } catch (error) {
      logger.warn?.(`[dsh-chat] \u6E20\u9053 ${record.definition.id} \u505C\u6B62\u65F6\u62A5\u9519\uFF1A${error?.message ?? error}`);
    }
    record.instance = null;
    record.status = "stopped";
  }
  function register(definition) {
    const validated = validateChannelDefinition(definition);
    if (channels.has(validated.id)) {
      throw new Error(`\u6E20\u9053 ${validated.id} \u5DF2\u6CE8\u518C\uFF0C\u4E0D\u80FD\u91CD\u590D\u6CE8\u518C\u3002`);
    }
    const record = {
      definition: validated,
      deps: null,
      instance: null,
      status: "starting",
      error: null,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      disposed: false,
      releaseRoutes: null
    };
    record.deps = Object.freeze({
      ...createDeps(validated.id, validated),
      reportStatus: (status, error) => {
        if (record.disposed) return;
        setStatus(record, status, error);
      }
    });
    channels.set(validated.id, record);
    if (typeof onRegistered === "function") {
      try {
        onRegistered(validated.id, validated.legacy);
      } catch (error) {
        logger.warn?.(`[dsh-chat] \u6E20\u9053 ${validated.id} \u6CE8\u518C\u540E\u52A8\u4F5C\u5931\u8D25\uFF1A${error?.message ?? error}`);
      }
    }
    record.releaseRoutes = rpc.register(validated.id, (method, payload, signal) => handleRpc(validated.id, method, payload, signal));
    publish();
    void start(record);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (!channels.delete(validated.id)) return;
      void stop(record);
      publish();
    };
  }
  function list() {
    return snapshot;
  }
  function get(id) {
    return snapshot.find((entry) => entry.id === id);
  }
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  async function handleRpc(channelId, method, payload, signal) {
    const record = channels.get(channelId);
    if (!record) return fail("chat/unknown-channel", `\u6E20\u9053 ${channelId} \u672A\u5B89\u88C5\u3002`);
    if (record.status === "failed") {
      return fail(
        "chat/channel-failed",
        record.error?.message ?? `\u6E20\u9053 ${channelId} \u542F\u52A8\u5931\u8D25\u3002`,
        record.error?.code ? { channelCode: record.error.code } : {}
      );
    }
    const endpoint = record.instance?.endpoints?.[method];
    if (typeof endpoint !== "function") {
      return fail("chat/unknown-method", `\u6E20\u9053 ${channelId} \u4E0D\u652F\u6301 ${method}\u3002`);
    }
    return endpoint(payload, { signal, channelId });
  }
  function disposeAll() {
    for (const [id, record] of [...channels.entries()]) {
      channels.delete(id);
      void stop(record);
    }
    publish();
  }
  return { register, list, get, subscribe, handleRpc, disposeAll };
}

// packages/dsh-chat/host/bot-model.mjs
function normalizeBotModel(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const pick = (...values) => {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  };
  const provider = pick(raw.provider, raw.providerId);
  const model = pick(raw.model, raw.modelId);
  if (!provider || !model) return null;
  return { provider, model, reasoningEffort: pick(raw.reasoningEffort, raw.effort) };
}
function botModelForSelection(previous, { provider, model, reasoningEffort = null }) {
  const same = previous?.provider === provider && previous?.model === model;
  return {
    provider,
    model,
    reasoningEffort: same ? previous?.reasoningEffort ?? null : reasoningEffort ?? null
  };
}
function describeBotModel(value) {
  const normalized = normalizeBotModel(value);
  if (!normalized) return null;
  return `${normalized.provider}/${normalized.model}${normalized.reasoningEffort ? ` \xB7 \u63A8\u7406 ${normalized.reasoningEffort}` : ""}`;
}

// packages/dsh-chat/host/commands.mjs
var PREFIX = "/";
var MAX_LINE = 120;
function line(text) {
  const value = String(text ?? "").replace(/\s+$/u, "");
  return value.length > MAX_LINE ? `${value.slice(0, MAX_LINE)}\u2026` : value;
}
var OWNER_ONLY_COMMANDS = /* @__PURE__ */ new Set(["allow", "deny", "diag", "retitle"]);
var MAX_HISTORY_CHARS = 160;
function clip(text) {
  const value = String(text ?? "").replace(/\s+/gu, " ").trim();
  return value.length > MAX_HISTORY_CHARS ? `${value.slice(0, MAX_HISTORY_CHARS)}\u2026` : value;
}
function parseArgs(text) {
  const raw = text.slice(1);
  const match = /^(\S+)\s*(.*)$/su.exec(raw);
  if (!match) return { name: "", args: [] };
  const name2 = match[1].toLowerCase();
  const rest = match[2].trim();
  if (!rest) return { name: name2, args: [] };
  const args = rest.match(/"[^"]*"|\S+/gu) ?? [];
  return { name: name2, args: args.map((arg) => arg.startsWith('"') && arg.endsWith('"') ? arg.slice(1, -1) : arg) };
}
function indexOf(value) {
  if (!/^\d{1,3}$/u.test(value)) return null;
  const index = Number(value) - 1;
  return index >= 0 ? index : null;
}
function createCommandRegistry({ logger = console, services = {} } = {}) {
  const commands = /* @__PURE__ */ new Map();
  const aliasIndex = /* @__PURE__ */ new Map();
  function register(definition) {
    const { name: name2, summary, usage, scope = "both", execute } = definition;
    if (!/^[a-z][a-z0-9-]{0,31}$/u.test(name2 ?? "")) {
      throw new TypeError(`\u547D\u4EE4\u540D\u4E0D\u5408\u6CD5\uFF1A${String(name2)}`);
    }
    if (typeof execute !== "function") throw new TypeError(`\u547D\u4EE4 ${name2} \u7F3A\u5C11 execute\u3002`);
    if (commands.has(name2)) throw new Error(`\u547D\u4EE4 ${name2} \u91CD\u590D\u6CE8\u518C\u3002`);
    const record = Object.freeze({
      name: name2,
      summary: String(summary ?? ""),
      usage: usage ?? `/${name2}`,
      scope,
      execute,
      aliases: Object.freeze([...definition.aliases ?? []])
    });
    commands.set(name2, record);
    for (const alias of record.aliases) aliasIndex.set(alias, name2);
    return () => {
      if (commands.get(name2) !== record) return;
      commands.delete(name2);
      for (const alias of record.aliases) aliasIndex.delete(alias);
    };
  }
  function lookup(name2) {
    return commands.get(name2) ?? commands.get(aliasIndex.get(name2));
  }
  async function handle(options) {
    const text = typeof options?.text === "string" ? options.text.trim() : "";
    if (!text.startsWith(PREFIX)) return { handled: false };
    const { name: name2, args } = parseArgs(text);
    const command = lookup(name2);
    if (!command) {
      return {
        handled: true,
        reply: `\u672A\u77E5\u547D\u4EE4 ${PREFIX}${name2}\u3002\u53D1\u9001 ${PREFIX}help \u67E5\u770B\u53EF\u7528\u547D\u4EE4\u3002`
      };
    }
    if (command.scope !== "both" && command.scope !== options.conversationType) {
      return { handled: true, reply: `\u547D\u4EE4 ${PREFIX}${command.name} \u4E0D\u80FD\u5728\u5F53\u524D\u4F1A\u8BDD\u7C7B\u578B\u4E0B\u4F7F\u7528\u3002` };
    }
    const context = {
      ...options,
      args,
      rawArgs: args.join(" "),
      services,
      log: logger
    };
    try {
      const result = await command.execute(context);
      if (result !== null && typeof result === "object" && !Array.isArray(result)) {
        return {
          handled: true,
          reply: typeof result.reply === "string" ? result.reply : "",
          ...Array.isArray(result.menu) && result.menu.length > 0 ? { menu: result.menu } : {},
          // 控制面板状态：渠道有卡片能力就渲染成可交互卡，没有就用 reply 里的文本。
          ...result.panel && typeof result.panel === "object" ? { panel: result.panel } : {}
        };
      }
      return { handled: true, reply: result ?? "" };
    } catch (error) {
      const message = error?.message ?? String(error);
      logger.warn?.(`[dsh-chat] \u547D\u4EE4 ${command.name} \u6267\u884C\u5931\u8D25\uFF1A${message}`);
      return { handled: true, reply: `\u547D\u4EE4\u6267\u884C\u5931\u8D25\uFF1A${message}` };
    }
  }
  function list() {
    return Object.freeze([...commands.values()].sort((left, right) => left.name.localeCompare(right.name)));
  }
  return { register, handle, list, names: () => [...commands.keys()] };
}
async function boundSession(context) {
  const { services, channelId, botId, key } = context;
  return services.sessions?.bindings?.get?.(channelId, botId, key)?.sessionId ?? null;
}
async function modelCatalog(context) {
  const catalog = await context.services.sessions.invoke("session", "modelCatalog", {});
  const rows = [];
  for (const group of catalog?.groups ?? []) {
    const provider = group.id ?? group.provider ?? group.providerId;
    for (const model of group.models ?? []) {
      rows.push({
        provider,
        providerName: group.name ?? group.providerName ?? group.displayName ?? provider,
        model: model.id ?? model.model,
        name: model.name ?? model.id,
        efforts: (model.reasoning?.efforts ?? []).map((effort) => ({
          id: effort.id,
          label: effort.name ?? effort.label ?? effort.id
        })),
        defaultEffort: model.reasoning?.defaultEffort ?? null
      });
    }
  }
  return { catalog, rows };
}
function selectionOf(item) {
  const projection = item?.projections?.values?.modelSelection;
  return projection?.next ?? projection?.lastUsed ?? null;
}
async function readSelection(context, sessionId) {
  try {
    const list = await context.services.sessions.invoke("session", "list", { _request: {} });
    const item = list?.items?.find((entry) => entry.sessionId === sessionId);
    return { selection: selectionOf(item), failed: false };
  } catch (error) {
    context.log?.warn?.(`[dsh-chat] \u8BFB\u53D6\u4F1A\u8BDD\u6A21\u578B\u9009\u62E9\u5931\u8D25\uFF08${sessionId}\uFF09\uFF1A${error?.message ?? error}`);
    return { selection: null, failed: true };
  }
}
function botModelOf(context) {
  return normalizeBotModel(context.services.bots?.read?.(context.channelId, context.botId)?.model);
}
var DIAG_LOG_LINES = 8;
function clipText(value, max = 160) {
  const text = String(value ?? "").replace(/\s+/gu, " ").trim();
  return text.length > max ? `${text.slice(0, max)}\u2026` : text;
}
function findModel(rows, token) {
  const byIndex = indexOf(token);
  if (byIndex !== null) return rows[byIndex] ?? null;
  const [provider, model] = String(token).split("/");
  if (!provider || !model) return null;
  return rows.find((row) => row.provider === provider && row.model === model) ?? null;
}
function registerBuiltinCommands(registry, { hubVersion = "0.0.1", listCommands = null } = {}) {
  registry.register({
    name: "help",
    aliases: ["h"],
    summary: "\u663E\u793A\u673A\u5668\u4EBA\u652F\u6301\u7684\u547D\u4EE4\u4E0E\u7528\u6CD5",
    execute: () => {
      const rows = registry.list().map((command) => line(`${command.usage} \u2014 ${command.summary}`));
      return ["\u53EF\u7528\u547D\u4EE4\uFF1A", ...rows].join("\n");
    }
  });
  const scopeKeyOf = (context) => context.conversationType === "group" ? "group" : "direct";
  const scopeLabelOf = (context) => context.conversationType === "group" ? "\u7FA4\u804A" : "\u79C1\u804A";
  function currentPolicy(context) {
    const record = context.services.bots.read(context.channelId, context.botId);
    return normalizeAccessPolicy(record.accessPolicy) ?? defaultAccessPolicy();
  }
  function withAllowlist(context, mutate) {
    const policy = currentPolicy(context);
    const key = scopeKeyOf(context);
    const scope = policy[key];
    return {
      ...policy,
      [key]: {
        ...scope,
        allowlist: { users: mutate(scope.allowlist.users) },
        open: {
          ...scope.open,
          // 名单变动时同步清掉 open 里的例外，避免"已移除却还能执行命令"。
          commandPermissionOverrides: mutate(scope.open.commandPermissionOverrides)
        }
      }
    };
  }
  registry.register({
    name: "menu",
    // `/m` 是常用入口的短写（dsh-im 也是这个）。
    aliases: ["m"],
    summary: "\u6253\u5F00\u63A7\u5236\u9762\u677F\uFF08\u9009\u6A21\u578B/\u63A8\u7406\u7B49\u7EA7/\u9884\u8BBE/\u5DE5\u4F5C\u533A\uFF09\uFF0C\u5E76\u5217\u51FA\u5168\u90E8\u547D\u4EE4",
    execute: async (context) => {
      const rows = typeof listCommands === "function" ? listCommands() : [];
      const items = rows.filter((row) => row.name !== "menu").filter((row) => row.scope === "both" || row.scope === context.conversationType).filter((row) => context.isOwner === true || !OWNER_ONLY_COMMANDS.has(row.name)).map((row) => ({ label: `${PREFIX}${row.name}`, command: `${PREFIX}${row.name}` }));
      let panel = null;
      if (typeof context.services.panel?.read === "function") {
        panel = await context.services.panel.read({
          channelId: context.channelId,
          botId: context.botId,
          key: context.key,
          // 工作区候选含属主其它会话的绝对路径：非属主（比如群里被授权执行命令的成员）不给。
          isOwner: context.isOwner === true
        }).catch((error) => {
          context.log?.warn?.(`[dsh-chat] \u8BFB\u53D6\u63A7\u5236\u9762\u677F\u72B6\u6001\u5931\u8D25\uFF1A${error?.message ?? error}`);
          return null;
        });
      }
      if (items.length === 0 && !panel) return "\u5F53\u524D\u6CA1\u6709\u53EF\u7528\u547D\u4EE4\u3002";
      return {
        ...panel ? { panel } : {},
        menu: items,
        // 没有卡片能力的渠道（微信）直接把这个文本列表发出去。
        reply: [
          "\u53EF\u7528\u547D\u4EE4\uFF1A",
          ...items.map((item, index) => line(`${index + 1}. ${item.label}`)),
          "\u4E5F\u53EF\u4EE5\u76F4\u63A5\u53D1\u6587\u5B57\u547D\u4EE4\u3002"
        ].join("\n")
      };
    }
  });
  registry.register({
    name: "diag",
    summary: "\u67E5\u770B\u8FDE\u63A5\u72B6\u6001\u3001\u6700\u8FD1\u9519\u8BEF\u4E0E\u65E5\u5FD7\u5C3E\u90E8\uFF08\u4EC5\u5C5E\u4E3B\uFF09",
    execute: async (context) => {
      if (context.isOwner !== true) return "\u8BCA\u65AD\u91CC\u6709\u673A\u5668\u4EBA id \u4E0E\u65E5\u5FD7\u5185\u5BB9\uFF0C\u53EA\u6709\u5C5E\u4E3B\u80FD\u770B\u3002";
      if (typeof context.services.diagnostics?.read !== "function") return "\u8FD9\u4E2A\u90E8\u7F72\u6CA1\u6709\u5F00\u542F\u8BCA\u65AD\u3002";
      let data;
      try {
        data = await context.services.diagnostics.read();
      } catch (error) {
        context.log?.warn?.(`[dsh-chat] \u8BCA\u65AD\u8BFB\u53D6\u5931\u8D25\uFF1A${error?.message ?? error}`);
        return `\u8BCA\u65AD\u8BFB\u53D6\u5931\u8D25\uFF1A${error?.message ?? error}`;
      }
      const lines = ["\u{1FA7A} \u8BCA\u65AD"];
      if (data?.dataDir) lines.push(`\u6570\u636E\u76EE\u5F55\uFF1A${data.dataDir}`);
      for (const channel of data?.channels ?? []) {
        lines.push("", `\u6E20\u9053 ${channel.label ?? channel.id}\uFF1A${channel.status ?? "\u672A\u77E5"}${channel.error ? `\uFF08\u6700\u8FD1\u9519\u8BEF\uFF1A${clipText(channel.error)}\uFF09` : ""}`);
        if (channel.statusError) lines.push(`  \u26A0\uFE0F \u72B6\u6001\u8BFB\u53D6\u5931\u8D25\uFF1A${clipText(channel.statusError)}`);
        for (const bot of channel.bots ?? []) {
          const handled = Number.isFinite(bot.handled) ? ` \xB7 \u5DF2\u5904\u7406 ${bot.handled} \u6761` : "";
          const last = bot.lastHandledAt ? ` \xB7 \u6700\u540E ${clipText(bot.lastHandledAt)}` : "";
          const bad = bot.errorMessage ?? bot.error ?? null;
          lines.push(`  \xB7 ${bot.name ?? bot.botId ?? "\u672A\u547D\u540D"} ${bot.connected === true ? "\u5DF2\u8FDE\u63A5" : "\u672A\u8FDE\u63A5"}${handled}${last}${bad ? ` \xB7 \u26A0\uFE0F ${clipText(bad)}` : ""}`);
        }
      }
      for (const log of data?.logs ?? []) {
        const name2 = String(log?.path ?? "").split("/").pop() ?? "log";
        if (!log?.exists) {
          lines.push("", `${name2}\uFF1A\u8FD8\u6CA1\u6709\u65E5\u5FD7\u6587\u4EF6`);
          continue;
        }
        const bad = (log.lines ?? []).filter((row) => /\b(WARN|ERROR)\b/.test(row));
        const picked = (bad.length > 0 ? bad : log.lines ?? []).slice(-DIAG_LOG_LINES);
        lines.push("", `${name2}${bad.length > 0 ? `\uFF08\u6700\u8FD1 ${picked.length} \u6761 WARN/ERROR\uFF09` : "\uFF08\u5C3E\u90E8\uFF09"}\uFF1A`);
        for (const row of picked) lines.push(`  ${clipText(row)}`);
      }
      return lines.join("\n");
    }
  });
  registry.register({
    name: "whoami",
    summary: "\u67E5\u770B\u4F60\u7684\u5E73\u53F0\u6807\u8BC6\u3001\u662F\u5426\u5C5E\u4E3B\uFF0C\u4EE5\u53CA\u672C\u6B21\u6D88\u606F\u7684\u8BBF\u95EE\u5224\u5B9A",
    execute: (context) => {
      const decision = evaluateAccess({
        policy: currentPolicy(context),
        conversationType: context.conversationType,
        senderIds: [context.senderId],
        isOwner: context.isOwner === true
      });
      return [
        `\u4F60\u7684\u5E73\u53F0 id\uFF1A${context.senderId ?? "\u672A\u77E5"}`,
        `\u662F\u5426\u5C5E\u4E3B\uFF1A${context.isOwner === true ? "\u662F" : "\u5426"}`,
        `\u5F53\u524D\u4F1A\u8BDD\uFF1A${scopeLabelOf(context)}`,
        `\u672C\u6B21\u5224\u5B9A\uFF1A${decision.allowed ? "\u653E\u884C" : "\u62E6\u622A"}\uFF08${decision.reason}\uFF09`,
        context.isOwner === true ? `\u5C5E\u4E3B\u59CB\u7EC8\u53EF\u7528\u3002\u7528 ${PREFIX}allow \u67E5\u770B/\u7EF4\u62A4${scopeLabelOf(context)}\u540D\u5355\u3002` : null
      ].filter(Boolean).join("\n");
    }
  });
  registry.register({
    name: "allow",
    summary: "\u67E5\u770B\u6216\u7EF4\u62A4\u5F53\u524D\u4F1A\u8BDD\u7C7B\u578B\u7684\u8BBF\u95EE\u540D\u5355\uFF08\u4EC5\u5C5E\u4E3B\uFF09",
    usage: "/allow [\u5E73\u53F0id] [--commands]",
    execute: async (context) => {
      if (context.isOwner !== true) return "\u53EA\u6709\u5C5E\u4E3B\u80FD\u7EF4\u62A4\u8BBF\u95EE\u540D\u5355\u3002";
      const scope = scopeKeyOf(context);
      const { policy } = { policy: currentPolicy(context) };
      const id = context.args.find((arg) => !arg.startsWith("--"));
      if (!id) {
        const users = policy[scope].allowlist.users;
        if (users.length === 0) return `${scopeLabelOf(context)}\u540D\u5355\u662F\u7A7A\u7684\uFF08\u5F53\u524D\u53EA\u6709\u5C5E\u4E3B\u53EF\u7528\uFF09\u3002`;
        return [
          `${scopeLabelOf(context)}\u540D\u5355\uFF08${users.length} \u4EBA\uFF09\uFF1A`,
          ...users.map((user, index) => line(
            `${index + 1}. ${user.id}${user.canExecuteCommands ? "\uFF08\u53EF\u6267\u884C\u547D\u4EE4\uFF09" : ""}`
          )),
          `\u7528 ${PREFIX}allow <\u5E73\u53F0id> [--commands] \u6DFB\u52A0\uFF0C${PREFIX}deny <\u5E73\u53F0id> \u79FB\u9664\u3002`
        ].join("\n");
      }
      const withCommands = context.args.includes("--commands");
      const next = withAllowlist(context, (users) => [
        ...users.filter((user) => user.id !== id),
        { id, canExecuteCommands: withCommands }
      ]);
      await context.services.bots.write(context.channelId, context.botId, {
        accessPolicy: validateAccessPolicy(next)
      });
      return `\u5DF2\u628A ${id} \u52A0\u5165${scopeLabelOf(context)}\u540D\u5355${withCommands ? "\uFF08\u5141\u8BB8\u6267\u884C\u547D\u4EE4\uFF09" : ""}\u3002`;
    }
  });
  registry.register({
    name: "deny",
    summary: "\u628A\u67D0\u4EBA\u79FB\u51FA\u5F53\u524D\u4F1A\u8BDD\u7C7B\u578B\u7684\u8BBF\u95EE\u540D\u5355\uFF08\u4EC5\u5C5E\u4E3B\uFF09",
    usage: "/deny <\u5E73\u53F0id>",
    execute: async (context) => {
      if (context.isOwner !== true) return "\u53EA\u6709\u5C5E\u4E3B\u80FD\u7EF4\u62A4\u8BBF\u95EE\u540D\u5355\u3002";
      const id = context.args[0];
      if (!id) return `\u7528\u6CD5\uFF1A${PREFIX}deny <\u5E73\u53F0id>`;
      const before = currentPolicy(context);
      const next = withAllowlist(context, (users) => users.filter((user) => user.id !== id));
      const key = scopeKeyOf(context);
      const removed = before[key].allowlist.users.some((user) => user.id === id) || before[key].open.commandPermissionOverrides.some((user) => user.id === id);
      if (!removed) return `${id} \u672C\u6765\u5C31\u4E0D\u5728${scopeLabelOf(context)}\u540D\u5355\u91CC\u3002`;
      await context.services.bots.write(context.channelId, context.botId, {
        accessPolicy: validateAccessPolicy(next)
      });
      return `\u5DF2\u628A ${id} \u79FB\u51FA${scopeLabelOf(context)}\u540D\u5355\u3002`;
    }
  });
  registry.register({
    name: "version",
    summary: "\u67E5\u770B dsh-chat \u63D2\u4EF6\u7248\u672C",
    execute: () => `dsh-chat ${hubVersion}\uFF08\u6E20\u9053\u5951\u7EA6 v${CONTRACT_VERSION}\uFF09`
  });
  registry.register({
    name: "status",
    summary: "\u67E5\u770B\u5F53\u524D\u673A\u5668\u4EBA\u3001\u4F1A\u8BDD\u4E0E\u8FD0\u884C\u72B6\u6001",
    execute: async (context) => {
      const { services, channelId, botId, key } = context;
      const channel = services.channels?.list?.().find((item) => item.id === channelId);
      const record = services.bots?.read?.(channelId, botId) ?? {};
      const bound = services.sessions?.bindings?.get?.(channelId, botId, key);
      let running = null;
      if (bound?.sessionId) {
        running = await context.services.sessions.isRunning(bound.sessionId).catch(() => null);
      }
      return [
        `\u6E20\u9053\uFF1A${channel?.label ?? channelId}\uFF08${channel?.status ?? "\u672A\u77E5"}\uFF09`,
        `\u673A\u5668\u4EBA\uFF1A${context.botLabel ?? botId}`,
        `\u4F1A\u8BDD\uFF1A${bound?.sessionId ?? "\u672A\u7ED1\u5B9A\uFF08\u53D1\u4E00\u6761\u6D88\u606F\u5373\u53EF\u521B\u5EFA\uFF09"}`,
        `\u8FD0\u884C\u4E2D\uFF1A${running === null ? "\u672A\u77E5" : running ? "\u662F" : "\u5426"}`,
        `\u5DE5\u4F5C\u533A\uFF1A${record.workspace ?? "\u672A\u8BBE\u7F6E"}`,
        `\u6A21\u578B\uFF1A${describeBotModel(record.model) ? `\u673A\u5668\u4EBA\u9ED8\u8BA4 ${describeBotModel(record.model)}` : "\u672A\u8BBE\u673A\u5668\u4EBA\u9ED8\u8BA4\uFF08\u8DDF\u968F Host \u9ED8\u8BA4\uFF09"}`,
        `Agent Preset\uFF1A${record.agentPreset ?? "\u8DDF\u968F Host \u9ED8\u8BA4"}`
      ].join("\n");
    }
  });
  registry.register({
    name: "new",
    summary: "\u89E3\u9664\u5F53\u524D\u804A\u5929\u7684\u4F1A\u8BDD\u7ED1\u5B9A\uFF0C\u4E0B\u4E00\u6761\u6D88\u606F\u5F00\u542F\u65B0\u4F1A\u8BDD",
    execute: async (context) => {
      await context.services.sessions.reset({
        channelId: context.channelId,
        botId: context.botId,
        key: context.key
      });
      return "\u5DF2\u89E3\u9664\u5F53\u524D\u4F1A\u8BDD\u7ED1\u5B9A\uFF0C\u4E0B\u4E00\u6761\u6D88\u606F\u5C06\u5F00\u542F\u65B0\u4F1A\u8BDD\u3002";
    }
  });
  registry.register({
    name: "stop",
    summary: "\u505C\u6B62\u5F53\u524D\u804A\u5929\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1",
    execute: async (context) => {
      const sessionId = await boundSession(context);
      if (!sessionId) return "\u5F53\u524D\u804A\u5929\u8FD8\u6CA1\u6709\u7ED1\u5B9A\u4F1A\u8BDD\u3002";
      const result = await context.services.sessions.cancel({
        channelId: context.channelId,
        botId: context.botId,
        key: context.key
      });
      return result?.accepted ? "\u5DF2\u8BF7\u6C42\u505C\u6B62\u5F53\u524D\u4EFB\u52A1\u3002" : "\u5F53\u524D\u6CA1\u6709\u6B63\u5728\u8FD0\u884C\u7684\u4EFB\u52A1\u3002";
    }
  });
  registry.register({
    name: "compact",
    summary: "\u538B\u7F29\u5F53\u524D\u4F1A\u8BDD\u7684\u4E0A\u4E0B\u6587\uFF08\u4F1A\u8BDD\u592A\u957F\u65F6\u7528\uFF09",
    execute: async (context) => {
      const sessionId = await boundSession(context);
      if (!sessionId) return "\u5F53\u524D\u804A\u5929\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF08\u5148\u53D1\u4E00\u6761\u6D88\u606F\u5373\u53EF\u521B\u5EFA\uFF09\u3002";
      const result = await context.services.sessions.runCommand({
        channelId: context.channelId,
        botId: context.botId,
        key: context.key,
        line: "/compact"
      });
      if (!result?.matched) {
        return "\u5F53\u524D\u90E8\u7F72\u6CA1\u6709\u6CE8\u518C /compact \u547D\u4EE4\uFF08\u9700\u8981\u5728 profile \u91CC\u542F\u7528\u538B\u7F29\u63D2\u4EF6\uFF09\u3002";
      }
      if (result.kind === "success") {
        return `\u2705 \u4E0A\u4E0B\u6587\u5DF2\u538B\u7F29\u3002${result.text ? `
${result.text}` : ""}`;
      }
      return `\u26A0\uFE0F \u538B\u7F29\u672A\u5B8C\u6210\uFF1A${result.text || "\u672A\u77E5\u539F\u56E0"}`;
    }
  });
  registry.register({
    name: "history",
    summary: "\u56DE\u770B\u6700\u8FD1\u51E0\u8F6E\u5BF9\u8BDD",
    usage: "/history [\u8F6E\u6570]",
    execute: async (context) => {
      const requested = indexOf(context.args[0]);
      const turns = requested === null ? 5 : Math.min(requested + 1, 20);
      const { messages } = await context.services.sessions.history({
        channelId: context.channelId,
        botId: context.botId,
        key: context.key,
        // 一轮大致对应"用户 + 助手"两条消息，多取几条保证凑得齐。
        maxMessages: turns * 2 + 2
      });
      if (messages.length === 0) return "\u8FD9\u4E2A\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u5BF9\u8BDD\u5386\u53F2\u3002";
      const lines = [];
      let index = 0;
      for (const message of messages) {
        if (message.role === "user") {
          index += 1;
          lines.push(`${index}. \u4F60\uFF1A${line(clip(message.text))}`);
        } else {
          lines.push(`   bot\uFF1A${line(clip(message.text))}`);
        }
      }
      return [`\u6700\u8FD1 ${index} \u8F6E\uFF08\u6700\u591A\u56DE\u770B 20 \u8F6E\uFF09\uFF1A`, ...lines].join("\n");
    }
  });
  registry.register({
    name: "session",
    summary: "\u67E5\u770B\u5F53\u524D\u4F1A\u8BDD\uFF1B\u5E26\u4F1A\u8BDD id \u65F6\u5207\u6362\u7ED1\u5B9A",
    usage: "/session [\u4F1A\u8BDDid]",
    execute: async (context) => {
      const { services } = context;
      if (context.args.length === 0) {
        const bound = services.sessions.bindings.get(context.channelId, context.botId, context.key);
        if (!bound) return "\u5F53\u524D\u804A\u5929\u672A\u7ED1\u5B9A\u4F1A\u8BDD\uFF08\u53D1\u4E00\u6761\u6D88\u606F\u5373\u53EF\u521B\u5EFA\uFF09\u3002";
        const running = await services.sessions.isRunning(bound.sessionId).catch(() => null);
        return `\u5F53\u524D\u4F1A\u8BDD\uFF1A${bound.sessionId}${running ? "\uFF08\u8FD0\u884C\u4E2D\uFF09" : ""}`;
      }
      const target = context.args[0];
      let exists = false;
      try {
        exists = await services.sessions.sessionExists(target);
      } catch (error) {
        context.log?.warn?.(`[dsh-chat] \u6821\u9A8C\u4F1A\u8BDD\u5931\u8D25\uFF08${target}\uFF09\uFF1A${error?.message ?? error}`);
        return `\u6821\u9A8C\u4F1A\u8BDD\u5931\u8D25\uFF08${error?.message ?? error}\uFF09\uFF0C\u7A0D\u540E\u518D\u8BD5\u3002`;
      }
      if (!exists) return `\u627E\u4E0D\u5230\u4F1A\u8BDD ${target}\u3002`;
      await services.sessions.bindings.bind(context.channelId, context.botId, context.key, {
        sessionId: target
      });
      return `\u5DF2\u5207\u6362\u5230\u4F1A\u8BDD ${target}\u3002`;
    }
  });
  registry.register({
    name: "retitle",
    aliases: ["fixtitles"],
    summary: "\u7ED9\u5386\u53F2\u4F1A\u8BDD\u8865\u4E0A\u300C\u6E20\u9053 \xB7\u300D\u6807\u9898\u524D\u7F00\uFF08\u4EC5\u5C5E\u4E3B\uFF09",
    execute: async (context) => {
      if (context.isOwner !== true) return "\u6539\u4F1A\u8BDD\u6807\u9898\u53EA\u9650\u5C5E\u4E3B\u3002";
      if (typeof context.services.sessions?.boundSessions !== "function" || typeof context.services.sessions?.markSessionChannel !== "function") {
        return "\u8FD9\u4E2A\u90E8\u7F72\u4E0D\u652F\u6301\u6279\u91CF\u56DE\u586B\u4F1A\u8BDD\u6807\u9898\u3002";
      }
      const channelLabel2 = String(context.channelLabel ?? "").trim();
      if (!channelLabel2) return "\u62FF\u4E0D\u5230\u6E20\u9053\u540D\uFF0C\u65E0\u6CD5\u56DE\u586B\u6807\u9898\u3002";
      const rows = context.services.sessions.boundSessions(context.channelId, context.botId);
      if (rows.length === 0) return "\u8FD9\u53F0\u673A\u5668\u4EBA\u8FD8\u6CA1\u6709\u7ED1\u5B9A\u8FC7\u4EFB\u4F55\u4F1A\u8BDD\u3002";
      const counts = { renamed: 0, skipped: 0, "no-title": 0, failed: 0 };
      for (const row of rows) {
        const outcome = await context.services.sessions.markSessionChannel(row.sessionId, channelLabel2);
        if (Object.hasOwn(counts, outcome ?? "")) counts[outcome] += 1;
      }
      context.log?.info?.(`[dsh-chat] \u4F1A\u8BDD\u6807\u9898\u56DE\u586B\uFF1A${JSON.stringify(counts)}`);
      const detail = [
        counts.renamed > 0 ? `\u8865\u4E0A ${counts.renamed} \u4E2A` : null,
        counts.skipped > 0 ? `\u5DF2\u6709\u524D\u7F00 ${counts.skipped} \u4E2A` : null,
        counts["no-title"] > 0 ? `\u8FD8\u6CA1\u6709\u6807\u9898 ${counts["no-title"]} \u4E2A\uFF08\u7B49\u5B83\u8DD1\u5B8C\u4E00\u8F6E\u518D\u6267\u884C\u4E00\u6B21\uFF09` : null,
        counts.failed > 0 ? `\u5931\u8D25 ${counts.failed} \u4E2A\uFF08\u7EC6\u8282\u89C1\u65E5\u5FD7\uFF09` : null
      ].filter(Boolean).join("\u3001");
      return `\u68C0\u67E5\u4E86 ${rows.length} \u4E2A\u7ED1\u5B9A\u4F1A\u8BDD\uFF1A${detail || "\u6CA1\u6709\u9700\u8981\u5904\u7406\u7684"}\u3002`;
    }
  });
  registry.register({
    name: "models",
    summary: "\u6309\u5E8F\u53F7\u5217\u51FA\u5F53\u524D\u53EF\u7528\u7684\u6A21\u578B",
    execute: async (context) => {
      const { rows } = await modelCatalog(context);
      if (rows.length === 0) return "\u5F53\u524D Host \u6CA1\u6709\u53EF\u7528\u6A21\u578B\u3002";
      const body = rows.map((row, index) => line(
        `${index + 1}. ${row.provider}/${row.model}${row.name && row.name !== row.model ? `\uFF08${row.name}\uFF09` : ""}${row.efforts.length > 0 ? ` \xB7 \u63A8\u7406\u7B49\u7EA7 ${row.efforts.map((effort) => effort.id).join("/")}` : ""}`
      ));
      return ["\u53EF\u7528\u6A21\u578B\uFF1A", ...body, `\u7528 /model <\u5E8F\u53F7\u6216 provider/\u6A21\u578Bid> [\u63A8\u7406\u7B49\u7EA7] \u5207\u6362\u3002`].join("\n");
    }
  });
  registry.register({
    name: "model",
    summary: "\u67E5\u770B\u6216\u5207\u6362\u5F53\u524D\u4F1A\u8BDD\u4F7F\u7528\u7684\u6A21\u578B",
    usage: "/model [\u5E8F\u53F7\u6216 provider/\u6A21\u578Bid] [\u63A8\u7406\u7B49\u7EA7]",
    execute: async (context) => {
      const sessionId = await boundSession(context);
      const botModel = botModelOf(context);
      if (context.args.length === 0) {
        if (!sessionId) {
          return botModel ? `\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF1A\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B ${describeBotModel(botModel)}\uFF08\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u7528\u5B83\uFF09\u3002\u7528 /model <\u5E8F\u53F7\u6216 provider/\u6A21\u578Bid> \u5C31\u80FD\u73B0\u5728\u5C31\u6539\u3002` : "\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF0C\u4E5F\u8FD8\u6CA1\u8BBE\u8FC7\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B\uFF08\u5F53\u524D\u8DDF\u968F Host \u9ED8\u8BA4\uFF09\u3002\u7528 /model <\u5E8F\u53F7\u6216 provider/\u6A21\u578Bid> \u8BBE\u4E00\u4E2A\uFF0C\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u5C31\u7528\u5B83\u3002";
        }
        const { selection, failed } = await readSelection(context, sessionId);
        if (failed) return "\u8BFB\u4E0D\u5230\u5F53\u524D\u4F1A\u8BDD\u7684\u6A21\u578B\u9009\u62E9\uFF08Host \u6682\u65F6\u4E0D\u53EF\u7528\uFF09\uFF0C\u7A0D\u540E\u518D\u8BD5\u3002";
        return selection ? `\u5F53\u524D\u6A21\u578B\uFF1A${selection.provider}/${selection.model}${selection.reasoningEffort ? `\uFF08\u63A8\u7406\u7B49\u7EA7 ${selection.reasoningEffort}\uFF09` : ""}` : "\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u663E\u5F0F\u9009\u62E9\u6A21\u578B\uFF08\u8DDF\u968F Host \u9ED8\u8BA4\uFF09\u3002";
      }
      const { rows } = await modelCatalog(context);
      const target = findModel(rows, context.args[0]);
      if (!target) return `\u627E\u4E0D\u5230\u6A21\u578B ${context.args[0]}\uFF1B\u7528 /models \u67E5\u770B\u53EF\u7528\u5217\u8868\u3002`;
      const effort = context.args[1];
      if (effort && !target.efforts.some((item) => item.id === effort)) {
        return `\u6A21\u578B ${target.provider}/${target.model} \u4E0D\u652F\u6301\u63A8\u7406\u7B49\u7EA7 ${effort}\u3002`;
      }
      if (!sessionId) {
        if (context.isOwner !== true) {
          return "\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF1A\u8FD9\u65F6\u6539\u7684\u662F\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B\uFF08\u673A\u5668\u4EBA\u7EA7\u8BBE\u7F6E\uFF09\uFF0C\u53EA\u6709\u5C5E\u4E3B\u80FD\u6539\u3002";
        }
        const next = botModelForSelection(botModel, {
          provider: target.provider,
          model: target.model,
          reasoningEffort: effort || null
        });
        await context.services.bots.write(context.channelId, context.botId, { model: next });
        return `\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B\u5DF2\u8BBE\u4E3A ${target.provider}/${target.model}${next.reasoningEffort ? `\uFF08\u63A8\u7406\u7B49\u7EA7 ${next.reasoningEffort}\uFF09` : ""}\uFF08\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF1A\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u7528\u5B83\uFF09\u3002`;
      }
      const selected = await context.services.sessions.invoke("session", "selectModel", {
        request: {
          sessionId,
          provider: target.provider,
          model: target.model,
          ...effort ? { reasoningEffort: effort } : {}
        }
      });
      const value = selected?.selected ?? {};
      return `\u5DF2\u5207\u6362\u4E3A ${value.provider ?? target.provider}/${value.model ?? target.model}${value.reasoningEffort ? `\uFF08\u63A8\u7406\u7B49\u7EA7 ${value.reasoningEffort}\uFF09` : ""}\u3002`;
    }
  });
  registry.register({
    name: "reasonings",
    aliases: ["reasoninglist"],
    summary: "\u5217\u51FA\u5F53\u524D\u6A21\u578B\u652F\u6301\u7684\u63A8\u7406\u7B49\u7EA7",
    execute: async (context) => {
      const { rows } = await modelCatalog(context);
      const sessionId = await boundSession(context);
      const current = rows.find((row) => row.efforts.length > 0) ?? rows[0];
      if (!current) return "\u5F53\u524D Host \u6CA1\u6709\u53EF\u7528\u6A21\u578B\u3002";
      const efforts = current.efforts.length > 0 ? current.efforts : [];
      if (efforts.length === 0) return `\u6A21\u578B ${current.provider}/${current.model} \u4E0D\u652F\u6301\u63A8\u7406\u7B49\u7EA7\u3002`;
      return [
        `\u6A21\u578B ${current.provider}/${current.model} \u652F\u6301\u7684\u63A8\u7406\u7B49\u7EA7\uFF1A`,
        ...efforts.map((effort, index) => line(`${index + 1}. ${effort.id}${effort.label ? `\uFF08${effort.label}\uFF09` : ""}`)),
        `\u9ED8\u8BA4\uFF1A${current.defaultEffort ?? "\u2014"}`,
        `\u7528 /reasoning <\u5E8F\u53F7\u6216\u7B49\u7EA7id> \u5207\u6362\uFF0C/reasoning --default \u6062\u590D\u9ED8\u8BA4\u3002`,
        sessionId ? "" : "\uFF08\u5F53\u524D\u804A\u5929\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF0C\u5207\u6362\u4F1A\u5728\u6709\u4F1A\u8BDD\u540E\u751F\u6548\u3002\uFF09"
      ].filter(Boolean).join("\n");
    }
  });
  registry.register({
    name: "reasoning",
    summary: "\u67E5\u770B\u6216\u5207\u6362\u5F53\u524D\u6A21\u578B\u7684\u63A8\u7406\u7B49\u7EA7",
    usage: "/reasoning [\u5E8F\u53F7\u6216\u7B49\u7EA7id|--default]",
    execute: async (context) => {
      const sessionId = await boundSession(context);
      const botModel = botModelOf(context);
      if (context.args.length === 0) {
        if (!sessionId) {
          return botModel ? `\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF1A\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B ${describeBotModel(botModel)}\uFF08\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u7528\u5B83\uFF09\u3002` : "\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF0C\u4E5F\u8FD8\u6CA1\u8BBE\u8FC7\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B\uFF1A\u5148 /model \u9009\u4E00\u4E2A\u6A21\u578B\u3002";
        }
        const { selection: selection2, failed: failed2 } = await readSelection(context, sessionId);
        if (failed2) return "\u8BFB\u4E0D\u5230\u5F53\u524D\u4F1A\u8BDD\u7684\u6A21\u578B\u9009\u62E9\uFF08Host \u6682\u65F6\u4E0D\u53EF\u7528\uFF09\uFF0C\u7A0D\u540E\u518D\u8BD5\u3002";
        if (!selection2) return "\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u663E\u5F0F\u9009\u62E9\u6A21\u578B\u3002";
        return `\u5F53\u524D\u6A21\u578B ${selection2.provider}/${selection2.model}\uFF0C\u63A8\u7406\u7B49\u7EA7 ${selection2.reasoningEffort ?? "\uFF08\u9ED8\u8BA4\uFF09"}\u3002`;
      }
      if (!sessionId) {
        if (context.isOwner !== true) {
          return "\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF1A\u8FD9\u65F6\u6539\u7684\u662F\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B\uFF08\u673A\u5668\u4EBA\u7EA7\u8BBE\u7F6E\uFF09\uFF0C\u53EA\u6709\u5C5E\u4E3B\u80FD\u6539\u3002";
        }
        if (!botModel) return "\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF0C\u4E5F\u6CA1\u8BBE\u8FC7\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B\uFF1A\u5148 /model \u9009\u4E00\u4E2A\u6A21\u578B\u3002";
        const { rows: rows2 } = await modelCatalog(context);
        const current2 = rows2.find((row) => row.provider === botModel.provider && row.model === botModel.model);
        if (!current2) return `\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B ${botModel.provider}/${botModel.model} \u4E0D\u5728\u53EF\u7528\u5217\u8868\u91CC\u3002`;
        const wanted = context.args[0] === "--default" ? null : indexOf(context.args[0]) !== null ? current2.efforts[indexOf(context.args[0])]?.id : context.args[0];
        if (wanted && !current2.efforts.some((item) => item.id === wanted)) {
          return `\u627E\u4E0D\u5230\u63A8\u7406\u7B49\u7EA7 ${context.args[0]}\uFF1B\u7528 /reasonings \u67E5\u770B\u53EF\u7528\u5217\u8868\u3002`;
        }
        await context.services.bots.write(context.channelId, context.botId, {
          model: { ...botModel, reasoningEffort: wanted ?? null }
        });
        return wanted ? `\u673A\u5668\u4EBA\u9ED8\u8BA4\u63A8\u7406\u7B49\u7EA7\u5DF2\u8BBE\u4E3A ${wanted}\uFF08\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF1A\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u7528\u5B83\uFF09\u3002` : `\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B\u5DF2\u6062\u590D ${current2.provider}/${current2.model} \u7684\u9ED8\u8BA4\u63A8\u7406\u7B49\u7EA7${current2.defaultEffort ? `\uFF08${current2.defaultEffort}\uFF09` : ""}\uFF08\u5BF9\u65B0\u4F1A\u8BDD\u751F\u6548\uFF09\u3002`;
      }
      const { selection, failed } = await readSelection(context, sessionId);
      if (failed) return "\u8BFB\u4E0D\u5230\u5F53\u524D\u4F1A\u8BDD\u7684\u6A21\u578B\u9009\u62E9\uFF08Host \u6682\u65F6\u4E0D\u53EF\u7528\uFF09\uFF0C\u7A0D\u540E\u518D\u8BD5\u3002";
      if (!selection) return "\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u663E\u5F0F\u9009\u62E9\u6A21\u578B\uFF0C\u65E0\u6CD5\u5355\u72EC\u8BBE\u7F6E\u63A8\u7406\u7B49\u7EA7\u3002";
      const { rows } = await modelCatalog(context);
      const current = rows.find((row) => row.provider === selection.provider && row.model === selection.model);
      if (!current) return "\u5F53\u524D\u6A21\u578B\u4E0D\u5728\u53EF\u7528\u5217\u8868\u91CC\u3002";
      if (context.args[0] === "--default") {
        await context.services.sessions.invoke("session", "selectModel", {
          request: { sessionId, provider: current.provider, model: current.model }
        });
        return `\u5DF2\u6062\u590D ${current.provider}/${current.model} \u7684\u9ED8\u8BA4\u63A8\u7406\u7B49\u7EA7${current.defaultEffort ? `\uFF08${current.defaultEffort}\uFF09` : ""}\u3002`;
      }
      const index = indexOf(context.args[0]);
      const effort = index !== null ? current.efforts[index]?.id : context.args[0];
      if (!effort || !current.efforts.some((item2) => item2.id === effort)) {
        return `\u627E\u4E0D\u5230\u63A8\u7406\u7B49\u7EA7 ${context.args[0]}\uFF1B\u7528 /reasonings \u67E5\u770B\u53EF\u7528\u5217\u8868\u3002`;
      }
      await context.services.sessions.invoke("session", "selectModel", {
        request: {
          sessionId,
          provider: current.provider,
          model: current.model,
          reasoningEffort: effort
        }
      });
      return `\u5DF2\u5207\u6362\u63A8\u7406\u7B49\u7EA7\u4E3A ${effort}\u3002`;
    }
  });
  registry.register({
    name: "presets",
    aliases: ["presetlist"],
    summary: "\u5217\u51FA\u5F53\u524D Host \u53EF\u7528\u7684 Agent Preset",
    execute: async (context) => {
      const presets = context.services.agentPresets;
      if (!presets?.remoteExportList) return "\u5F53\u524D Host \u4E0D\u652F\u6301\u8BFB\u53D6 Agent Preset \u5217\u8868\u3002";
      const { presets: rows } = await presets.remoteExportList();
      if (!rows || rows.length === 0) return "\u5F53\u524D Host \u6CA1\u6709\u53EF\u7528 Agent Preset\u3002";
      const record = context.services.bots.read(context.channelId, context.botId);
      return [
        "\u53EF\u7528 Agent Preset\uFF1A",
        ...rows.map((row, index) => line(
          `${index + 1}. ${row.id}${row.isDefault ? "\uFF08Host \u9ED8\u8BA4\uFF09" : ""}${record.agentPreset === row.id ? "\uFF08\u5F53\u524D\u673A\u5668\u4EBA\uFF09" : ""}${row.name && row.name !== row.id ? ` \xB7 ${row.name}` : ""}`
        )),
        "\u7528 /preset <\u5E8F\u53F7\u6216 id> \u8BBE\u7F6E\uFF0C/preset --default \u8DDF\u968F Host \u9ED8\u8BA4\u3002"
      ].join("\n");
    }
  });
  registry.register({
    name: "preset",
    summary: "\u67E5\u770B\u6216\u8BBE\u7F6E\u5F53\u524D\u673A\u5668\u4EBA\u7684 Agent Preset\uFF08\u5BF9\u65B0\u4F1A\u8BDD\u751F\u6548\uFF09",
    usage: "/preset [\u5E8F\u53F7\u6216 id|--default]",
    execute: async (context) => {
      const { services } = context;
      const record = services.bots.read(context.channelId, context.botId);
      if (context.args.length === 0) {
        return record.agentPreset ? `\u5F53\u524D\u673A\u5668\u4EBA Agent Preset\uFF1A${record.agentPreset}` : "\u5F53\u524D\u673A\u5668\u4EBA\u8DDF\u968F Host \u9ED8\u8BA4 Agent Preset\u3002";
      }
      if (context.args[0] === "--default") {
        await services.bots.write(context.channelId, context.botId, { agentPreset: null });
        return "\u5DF2\u6E05\u9664\u673A\u5668\u4EBA\u7EA7 Agent Preset\uFF0C\u4E4B\u540E\u7684\u65B0\u4F1A\u8BDD\u8DDF\u968F Host \u9ED8\u8BA4\u3002";
      }
      if (!services.agentPresets?.remoteExportList) return "\u5F53\u524D Host \u4E0D\u652F\u6301\u8BBE\u7F6E Agent Preset\u3002";
      const { presets: rows } = await services.agentPresets.remoteExportList();
      const index = indexOf(context.args[0]);
      const target = index !== null ? rows[index]?.id : context.args[0];
      if (!target || !rows.some((row) => row.id === target)) {
        return `\u627E\u4E0D\u5230 Agent Preset ${context.args[0]}\uFF1B\u7528 /presets \u67E5\u770B\u5217\u8868\u3002`;
      }
      await services.bots.write(context.channelId, context.botId, { agentPreset: target });
      return `\u5DF2\u8BBE\u7F6E Agent Preset \u4E3A ${target}\uFF1B\u5F53\u524D\u804A\u5929\u9700\u8981\u5148\u53D1\u9001 /new\uFF0C\u518D\u53D1\u4E00\u6761\u6D88\u606F\u624D\u4F1A\u7528\u65B0\u9884\u8BBE\u521B\u5EFA\u4F1A\u8BDD\u3002`;
    }
  });
}

// packages/dsh-chat/host/delivery.mjs
import { stat } from "node:fs/promises";
import { basename, isAbsolute, resolve } from "node:path";
var TARGET_ID = /^[A-Za-z0-9_-]{1,64}$/;
var MAX_FILE_BYTES = 30 * 1024 * 1024;
var FILE_NAME_MAX = 120;
var IMAGE_EXTENSIONS = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
var TARGET_NAME_MAX = 80;
var ROUTE_MAX_KEYS = 8;
var ROUTE_VALUE_MAX = 256;
var CONTROL_CHARACTERS3 = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
var CONTROL_CHARACTER_TEST2 = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
function isPlainObject5(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function deliveryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function normalizeRoute(route) {
  if (!isPlainObject5(route)) throw deliveryError("chat/bad-target", "\u6295\u9012\u76EE\u6807\u7684 route \u5FC5\u987B\u662F\u5BF9\u8C61\u3002");
  const keys = Object.keys(route);
  if (keys.length === 0 || keys.length > ROUTE_MAX_KEYS) {
    throw deliveryError("chat/bad-target", `\u6295\u9012\u76EE\u6807\u7684 route \u9700\u8981 1\u2013${ROUTE_MAX_KEYS} \u4E2A\u5B57\u6BB5\u3002`);
  }
  const normalized = {};
  for (const key of keys) {
    const value = route[key];
    if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/u.test(key)) {
      throw deliveryError("chat/bad-target", `route \u5B57\u6BB5\u540D\u4E0D\u5408\u6CD5\uFF1A${key}`);
    }
    if (typeof value !== "string" || !value.trim() || value.length > ROUTE_VALUE_MAX || CONTROL_CHARACTER_TEST2.test(value)) {
      throw deliveryError("chat/bad-target", `route.${key} \u5FC5\u987B\u662F\u975E\u7A7A\u77ED\u5B57\u7B26\u4E32\u3002`);
    }
    normalized[key] = value.replace(CONTROL_CHARACTERS3, "").trim();
  }
  return Object.freeze(normalized);
}
function normalizeTarget(input) {
  if (!isPlainObject5(input)) throw deliveryError("chat/bad-target", "\u6295\u9012\u76EE\u6807\u5FC5\u987B\u662F\u5BF9\u8C61\u3002");
  const { id, name: name2, kind, route, renamed } = input;
  if (typeof id !== "string" || !TARGET_ID.test(id)) {
    throw deliveryError("chat/bad-target", "\u6295\u9012\u76EE\u6807 id \u53EA\u80FD\u662F 1\u201364 \u4F4D\u5B57\u6BCD/\u6570\u5B57/\u4E0B\u5212\u7EBF/\u8FDE\u5B57\u7B26\u3002");
  }
  if (kind !== "direct" && kind !== "group") {
    throw deliveryError("chat/bad-target", "\u6295\u9012\u76EE\u6807 kind \u53EA\u80FD\u662F direct \u6216 group\u3002");
  }
  const label = typeof name2 === "string" ? name2.replace(CONTROL_CHARACTERS3, "").trim() : "";
  if (label.length > TARGET_NAME_MAX) {
    throw deliveryError("chat/bad-target", `\u6295\u9012\u76EE\u6807\u540D\u79F0\u4E0D\u5F97\u8D85\u8FC7 ${TARGET_NAME_MAX} \u4E2A\u5B57\u7B26\u3002`);
  }
  return Object.freeze({
    id,
    name: label,
    kind,
    route: normalizeRoute(route),
    // 空名字等于"取消自定义"，这时渠道给什么名字就用什么。
    renamed: renamed === true && label.length > 0
  });
}
async function resolveOutboundFile({ path: inputPath, name: name2, workspace }) {
  const raw = typeof inputPath === "string" ? inputPath.trim() : "";
  if (!raw) throw deliveryError("chat/bad-file", "\u53D1\u9001\u6587\u4EF6\u9700\u8981 path\u3002");
  const absolute = isAbsolute(raw) ? raw : resolve(workspace ?? process.cwd(), raw);
  let stats;
  try {
    stats = await stat(absolute);
  } catch {
    throw deliveryError("chat/file-not-found", `\u627E\u4E0D\u5230\u6587\u4EF6\uFF1A${absolute}`);
  }
  if (!stats.isFile()) throw deliveryError("chat/bad-file", `\u4E0D\u662F\u666E\u901A\u6587\u4EF6\uFF1A${absolute}`);
  if (stats.size === 0) throw deliveryError("chat/bad-file", `\u6587\u4EF6\u662F\u7A7A\u7684\uFF0C\u65E0\u6CD5\u53D1\u9001\uFF1A${absolute}`);
  if (stats.size > MAX_FILE_BYTES) {
    const mb = (stats.size / 1024 / 1024).toFixed(1);
    throw deliveryError(
      "chat/file-too-large",
      `\u6587\u4EF6 ${mb}MB \u8D85\u8FC7 ${MAX_FILE_BYTES / 1024 / 1024}MB \u4E0A\u9650\uFF1A${absolute}`
    );
  }
  const label = typeof name2 === "string" ? name2.replace(CONTROL_CHARACTERS3, "").trim() : "";
  const finalName = (label || basename(absolute)).slice(0, FILE_NAME_MAX);
  const ext = finalName.split(".").pop()?.toLowerCase() ?? "";
  const kind = IMAGE_EXTENSIONS.has(ext) ? "image" : "file";
  return Object.freeze({ path: absolute, name: finalName, size: stats.size, kind });
}
function routeKey(target) {
  const route = Object.entries(target.route).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("");
  return `${target.kind}\0${route}`;
}
function normalizeStoredTargets(value) {
  if (!isPlainObject5(value)) return {};
  const targets = {};
  for (const [id, target] of Object.entries(value)) {
    try {
      targets[id] = normalizeTarget({ ...target, id });
    } catch {
    }
  }
  return targets;
}
function createDeliveryService({ settings, sessionStore = null, logger = console }) {
  if (!settings?.read) throw new TypeError("\u6295\u9012\u670D\u52A1\u9700\u8981\u6BCF\u673A\u5668\u4EBA\u8BBE\u7F6E\u5B58\u50A8\u3002");
  const providers = /* @__PURE__ */ new Map();
  return Object.freeze({
    /**
     * 渠道注册投递实现（实例创建时由注册表调用，注销时释放）。
     *
     * @param channelId - 渠道 id。
     * @param provider - `{ send({ botId, target, text }), discover?({ botId }) }`。
     * @returns 注销函数。
     */
    attach(channelId, provider) {
      if (typeof provider?.send !== "function") {
        throw new TypeError(`\u6E20\u9053 ${channelId} \u7684\u6295\u9012\u5B9E\u73B0\u7F3A\u5C11 send\u3002`);
      }
      providers.set(channelId, provider);
      return () => {
        if (providers.get(channelId) === provider) providers.delete(channelId);
      };
    },
    /** @returns 该渠道是否支持发送文件（`sendFile` 可选，能力缺席要能被查出来）。 */
    supportsFile: (channelId) => typeof providers.get(channelId)?.sendFile === "function",
    /** @returns 该渠道是否具备主动投递能力。 */
    supports: (channelId) => providers.has(channelId),
    /** @returns 已保存的投递目标（含渠道发现的候选，候选不落盘）。 */
    async list({ channelId, botId }) {
      const saved = normalizeStoredTargets(settings.read(channelId, botId).deliveryTargets);
      const provider = providers.get(channelId);
      const discovered = [];
      if (typeof provider?.discover === "function") {
        try {
          discovered.push(...await provider.discover({ botId }) ?? []);
        } catch (error) {
          logger.warn?.(`[dsh-chat] \u6E20\u9053 ${channelId} \u53D1\u73B0\u6295\u9012\u76EE\u6807\u5931\u8D25\uFF1A${error?.message ?? error}`);
        }
      }
      if (typeof provider?.targetFromKey === "function" && sessionStore) {
        try {
          await sessionStore.ready?.();
          for (const key of Object.keys(sessionStore.entries(channelId, botId))) {
            try {
              const target = provider.targetFromKey(key);
              if (target) discovered.push(target);
            } catch {
            }
          }
        } catch (error) {
          logger.warn?.(`[dsh-chat] \u8BFB\u53D6\u4F1A\u8BDD\u7ED1\u5B9A\u5931\u8D25\uFF1A${error?.message ?? error}`);
        }
      }
      const savedList = Object.values(saved);
      const known = new Set(savedList.map(routeKey));
      const candidates = [];
      for (const candidate of discovered) {
        try {
          const target = normalizeTarget(candidate);
          const key = routeKey(target);
          if (saved[target.id] || known.has(key)) continue;
          known.add(key);
          candidates.push(Object.freeze({ ...target, discovered: true }));
        } catch {
        }
      }
      let listed = [...savedList, ...candidates];
      if (typeof provider?.decorateTargets === "function" && listed.length > 0) {
        try {
          const decorated = await provider.decorateTargets({
            botId,
            targets: listed.map((target) => ({ ...target }))
          });
          if (Array.isArray(decorated) && decorated.length === listed.length) {
            listed = listed.map((target, index) => {
              if (target.renamed) return target;
              const name2 = decorated[index]?.name;
              return typeof name2 === "string" && name2 ? { ...target, name: name2 } : target;
            });
          }
        } catch (error) {
          logger.warn?.(`[dsh-chat] \u6E20\u9053 ${channelId} \u8865\u5145\u76EE\u6807\u540D\u79F0\u5931\u8D25\uFF1A${error?.message ?? error}`);
        }
      }
      return Object.freeze({
        targets: Object.freeze(listed),
        canSend: providers.has(channelId)
      });
    },
    /**
     * 保存（或覆盖）一个投递目标。
     *
     * @param options - { channelId, botId, target }。
     */
    async save({ channelId, botId, target }) {
      const normalized = normalizeTarget(target);
      const current = normalizeStoredTargets(settings.read(channelId, botId).deliveryTargets);
      await settings.write(channelId, botId, {
        deliveryTargets: { ...current, [normalized.id]: normalized }
      });
      return normalized;
    },
    /**
     * 给一个**已保存**的目标改名字（用户自定义名）。
     *
     * 为什么需要：目标名字来自平台（群名/人名），但微信拿不到昵称、飞书缺权限时只有
     * `oc_xxx` / `ou_xxx`——设置页里一排掩码 id，人认不出哪个是哪个。
     * 传空名字 = 取消自定义，回到渠道给的名字。
     */
    async rename({ channelId, botId, targetId, name: name2 }) {
      const current = normalizeStoredTargets(settings.read(channelId, botId).deliveryTargets);
      const target = current[targetId];
      if (!target) {
        throw deliveryError(
          "chat/unknown-target",
          `\u627E\u4E0D\u5230\u6295\u9012\u76EE\u6807 ${targetId}\uFF08\u5148\u4FDD\u5B58\u4E3A\u6295\u9012\u76EE\u6807\uFF0C\u518D\u6539\u540D\uFF09\u3002`
        );
      }
      const label = typeof name2 === "string" ? name2.trim() : "";
      const renamed = normalizeTarget({ ...target, name: label, renamed: label.length > 0 });
      await settings.write(channelId, botId, {
        deliveryTargets: { ...current, [targetId]: renamed }
      });
      return renamed;
    },
    /** 删除一个投递目标。 */
    async remove({ channelId, botId, targetId }) {
      const current = normalizeStoredTargets(settings.read(channelId, botId).deliveryTargets);
      if (!Object.hasOwn(current, targetId)) return false;
      const next = { ...current };
      delete next[targetId];
      await settings.write(channelId, botId, { deliveryTargets: next });
      return true;
    },
    /**
     * 发一条文本。
     *
     * @param options - { channelId, botId, targetId, text }。
     * @returns 渠道返回的发送结果。
     */
    async send({ channelId, botId, targetId, text }) {
      const provider = providers.get(channelId);
      if (!provider) {
        throw deliveryError("chat/delivery-unavailable", `\u6E20\u9053 ${channelId} \u4E0D\u652F\u6301\u4E3B\u52A8\u6295\u9012\u3002`);
      }
      const content = typeof text === "string" ? text.trim() : "";
      if (!content) throw deliveryError("chat/empty-text", "\u6295\u9012\u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A\u3002");
      const saved = normalizeStoredTargets(settings.read(channelId, botId).deliveryTargets);
      const target = saved[targetId];
      if (!target) {
        throw deliveryError("chat/unknown-target", `\u627E\u4E0D\u5230\u6295\u9012\u76EE\u6807 ${targetId}\uFF08\u5148\u5728\u8BBE\u7F6E\u9875\u4FDD\u5B58\u6216\u6539\u7528\u5019\u9009\u76EE\u6807\uFF09\u3002`);
      }
      return provider.send({ botId, target, text: content });
    },
    /**
     * 发一个文件。
     *
     * 与文本同样的安全边界：**只能发给已保存的目标**；文件本身必须是存在、非空、
     * 不超过上限的普通文件。
     *
     * @param options - { channelId, botId, targetId, path, name? }。
     * @returns 渠道返回的发送结果。
     */
    async sendFile({ channelId, botId, targetId, path, name: name2 }) {
      const provider = providers.get(channelId);
      if (!provider) {
        throw deliveryError("chat/delivery-unavailable", `\u6E20\u9053 ${channelId} \u4E0D\u652F\u6301\u4E3B\u52A8\u6295\u9012\u3002`);
      }
      if (typeof provider.sendFile !== "function") {
        throw deliveryError("chat/delivery-unsupported", `\u6E20\u9053 ${channelId} \u6682\u4E0D\u652F\u6301\u53D1\u9001\u6587\u4EF6\u3002`);
      }
      const saved = normalizeStoredTargets(settings.read(channelId, botId).deliveryTargets);
      const target = saved[targetId];
      if (!target) {
        throw deliveryError("chat/unknown-target", `\u627E\u4E0D\u5230\u6295\u9012\u76EE\u6807 ${targetId}\uFF08\u5148\u5728\u8BBE\u7F6E\u9875\u4FDD\u5B58\u6216\u6539\u7528\u5019\u9009\u76EE\u6807\uFF09\u3002`);
      }
      const file = await resolveOutboundFile({
        path,
        name: name2,
        workspace: settings.read(channelId, botId).workspace
      });
      return provider.sendFile({ botId, target, file });
    }
  });
}

// packages/dsh-chat/host/file-log.mjs
import { appendFile, mkdir as mkdir2, rename as rename2, stat as stat2 } from "node:fs/promises";
import { dirname as dirname2, join as join2 } from "node:path";
var DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
var LEVELS = ["debug", "info", "warn", "error"];
function stamp() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
var MAX_FIELD_CHARS = 2e3;
function clip2(text) {
  return text.length > MAX_FIELD_CHARS ? `${text.slice(0, MAX_FIELD_CHARS)}\u2026` : text;
}
function httpErrorSummary(value) {
  const status = value?.response?.status ?? value?.status;
  if (!status || !value?.config && !value?.request && !value?.response) return null;
  const data = value.response?.data ?? {};
  const code = data?.code ?? value?.code;
  const message = String(data?.msg ?? value?.message ?? "").replace(/\s+/gu, " ").trim();
  const parts = [`HTTP ${status}`];
  if (value.statusText) parts.push(String(value.statusText));
  if (code !== void 0 && code !== null && code !== "") parts.push(`code=${code}`);
  if (message) parts.push(message);
  return parts.join(" ");
}
function oneLine(value) {
  if (typeof value === "string") return value;
  if (value === null || value === void 0) return String(value);
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.code ? `\uFF08code ${value.code}\uFF09` : ""}`;
  }
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return clip2(value.map(oneLine).filter((part) => part !== "").join(" "));
  const http = httpErrorSummary(value);
  if (http) return clip2(http);
  try {
    const seen = /* @__PURE__ */ new WeakSet();
    const text = JSON.stringify(value, (key, item) => {
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) return "[\u5FAA\u73AF\u5F15\u7528]";
        seen.add(item);
      }
      return item;
    });
    if (typeof text !== "string") return String(value);
    return clip2(text);
  } catch {
    return String(value);
  }
}
function describe(message, rest = []) {
  return [message, ...rest].map(oneLine).filter((part) => part !== "").join(" ");
}
function createLogFileSink({ path, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (typeof path !== "string" || !path) throw new TypeError("\u65E5\u5FD7\u6587\u4EF6\u9700\u8981 path\u3002");
  let queue = Promise.resolve();
  let size = null;
  let warned = false;
  async function rotateIfNeeded(nextLength) {
    if (size === null) {
      try {
        size = (await stat2(path)).size;
      } catch {
        size = 0;
      }
    }
    if (size > 0 && size + nextLength > maxBytes) {
      await rename2(path, `${path}.1`).catch(() => {
      });
      size = 0;
    }
  }
  function write(line2) {
    const text = `${line2}
`;
    queue = queue.then(async () => {
      try {
        await mkdir2(dirname2(path), { recursive: true });
        await rotateIfNeeded(text.length);
        await appendFile(path, text, "utf8");
        size = (size ?? 0) + text.length;
      } catch (error) {
        if (!warned) {
          warned = true;
          process.stderr.write(`[dsh-chat] \u5199\u65E5\u5FD7\u6587\u4EF6\u5931\u8D25\uFF08${path}\uFF09\uFF1A${error?.message ?? error}
`);
        }
      }
    });
    return queue;
  }
  return { write, path, flush: () => queue };
}
function withFileSink({ logger, sink, scope = "" }) {
  if (!sink?.write) return logger;
  const wrapped = {};
  for (const level of LEVELS) {
    const inner = typeof logger?.[level] === "function" ? logger[level].bind(logger) : null;
    wrapped[level] = (message, ...rest) => {
      try {
        inner?.(message, ...rest);
      } finally {
        const text = describe(message, rest);
        const prefix = scope && !text.startsWith("[") ? `[${scope}] ` : "";
        sink.write(`${stamp()} ${level.toUpperCase().padEnd(5)} ${prefix}${text}`);
      }
    };
  }
  if (typeof wrapped.trace !== "function") wrapped.trace = wrapped.debug;
  return Object.assign(Object.create(Object.getPrototypeOf(logger ?? {}) ?? Object.prototype), logger ?? {}, wrapped);
}
function channelLogPath(logsDir, name2) {
  return join2(logsDir, `${name2}.log`);
}

// packages/dsh-chat/host/log-tail.mjs
import { open, stat as stat3 } from "node:fs/promises";
var DEFAULT_MAX_BYTES2 = 16 * 1024;
var DEFAULT_MAX_LINES = 40;
async function readLogTail(path, {
  maxBytes = DEFAULT_MAX_BYTES2,
  maxLines = DEFAULT_MAX_LINES
} = {}) {
  const empty = { path, exists: false, size: 0, modifiedAt: null, lines: [] };
  let info;
  try {
    info = await stat3(path);
    if (!info.isFile()) return empty;
  } catch {
    return empty;
  }
  const length = Math.min(maxBytes, info.size);
  const start = Math.max(0, info.size - length);
  let text = "";
  try {
    const handle = await open(path, "r");
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, start);
      text = buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return empty;
  }
  const raw = text.split("\n");
  if (start > 0) raw.shift();
  return {
    path,
    exists: true,
    size: info.size,
    modifiedAt: info.mtime.toISOString(),
    lines: raw.filter((line2) => line2.trim() !== "").slice(-maxLines)
  };
}

// packages/dsh-chat/host/panel.mjs
import { stat as stat4 } from "node:fs/promises";
import { isAbsolute as isAbsolute2, resolve as resolvePath } from "node:path";
function panelError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function workspaceCandidates({ record, sessionStore, channelId, botId }) {
  const boundPaths = Object.values(sessionStore?.entries?.(channelId, botId) ?? {}).map((entry) => entry?.workspacePath).filter((value) => typeof value === "string" && value);
  return [.../* @__PURE__ */ new Set([
    ...typeof record?.workspace === "string" && record.workspace ? [record.workspace] : [],
    ...boundPaths
  ])];
}
async function readModelCatalog(sessions, logger = console) {
  const catalog = await sessions.invoke("session", "modelCatalog", {});
  const options = [];
  const failures = (catalog?.failures ?? []).map((item) => ({
    id: item?.id ?? "",
    name: item?.name ?? item?.id ?? "",
    message: item?.message ?? ""
  }));
  for (const group of catalog?.groups ?? []) {
    const provider = group.id ?? group.provider ?? group.providerId;
    for (const model of group.models ?? []) {
      const id = model.id ?? model.model;
      if (!provider || !id) continue;
      options.push({
        value: `${provider}/${id}`,
        provider,
        model: id,
        name: model.name ?? id,
        providerName: group.name ?? group.providerName ?? provider,
        efforts: (model.reasoning?.efforts ?? []).map((effort) => ({
          id: effort.id,
          label: effort.name ?? effort.label ?? effort.id
        })),
        defaultEffort: model.reasoning?.defaultEffort ?? null
      });
    }
  }
  const rawDefault = catalog?.default;
  const hostDefault = rawDefault?.provider && rawDefault?.model ? rawDefault : null;
  return { options, hostDefault, failures };
}
async function validateWorkspacePath(raw) {
  if (typeof raw !== "string" || !raw.trim()) {
    throw panelError("chat/workspace-invalid", "\u5DE5\u4F5C\u533A\u9700\u8981\u662F\u4E00\u4E2A\u7EDD\u5BF9\u8DEF\u5F84\u3002");
  }
  const given = raw.trim();
  if (!isAbsolute2(given)) {
    throw panelError("chat/workspace-invalid", `\u5DE5\u4F5C\u533A\u9700\u8981\u662F\u7EDD\u5BF9\u8DEF\u5F84\uFF1A${given}`);
  }
  const target = resolvePath(given);
  let info;
  try {
    info = await stat4(target);
  } catch (error) {
    throw panelError(
      "chat/workspace-invalid",
      `\u76EE\u5F55\u4E0D\u5B58\u5728\u6216\u8BFB\u4E0D\u5230\uFF1A${target}\uFF08${error?.code ?? error?.message}\uFF09`
    );
  }
  if (!info.isDirectory()) {
    throw panelError("chat/workspace-invalid", `\u4E0D\u662F\u76EE\u5F55\uFF1A${target}`);
  }
  return target;
}
function createPanelService({
  settings,
  sessions,
  sessionStore = null,
  agentPresets = null,
  channelRpc = null,
  logger = console
} = {}) {
  if (typeof settings?.read !== "function") throw new TypeError("\u63A7\u5236\u9762\u677F\u9700\u8981\u6BCF\u673A\u5668\u4EBA\u8BBE\u7F6E\u5B58\u50A8\u3002");
  if (typeof sessions?.invoke !== "function") throw new TypeError("\u63A7\u5236\u9762\u677F\u9700\u8981\u4F1A\u8BDD\u6865\u3002");
  function boundSessionId(channelId, botId, key) {
    return sessions.bindings?.get?.(channelId, botId, key)?.sessionId ?? null;
  }
  async function currentSelection(sessionId) {
    if (!sessionId) return null;
    const listed = await sessions.invoke("session", "list", { _request: {} });
    const item = listed?.items?.find((entry) => entry.sessionId === sessionId);
    const projection = item?.projections?.values?.modelSelection;
    const selection = projection?.next ?? projection?.lastUsed ?? null;
    if (!selection?.provider || !selection?.model) return null;
    return {
      provider: selection.provider,
      model: selection.model,
      reasoningEffort: selection.reasoningEffort ?? null
    };
  }
  const BUILT_IN_FIELDS = /* @__PURE__ */ new Set(["model", "reasoning", "preset", "workspace", "session"]);
  async function channelPanelFields({ channelId, botId, key, conversationType }) {
    if (typeof channelRpc !== "function") return { fields: [], failed: false };
    try {
      const result = await channelRpc(channelId, "panel.fields", {
        botId,
        key: key ?? null,
        conversationType: conversationType ?? null
      });
      if (result?.ok !== true) throw new Error(result?.error?.message ?? "\u8BFB\u53D6\u5931\u8D25");
      const fields = Array.isArray(result.value?.fields) ? result.value.fields : [];
      return {
        fields: fields.filter((item) => typeof item?.field === "string" && item.field && Array.isArray(item.options) && item.options.length > 0),
        failed: false
      };
    } catch (error) {
      if (error?.code === "chat/unknown-method" || /不支持/.test(String(error?.message))) {
        return { fields: [], failed: false };
      }
      logger.warn?.(`[dsh-chat] \u8BFB\u53D6\u6E20\u9053\u9762\u677F\u5B57\u6BB5\u5931\u8D25\uFF1A${error?.message ?? error}`);
      return { fields: [], failed: true };
    }
  }
  async function applyChannelField({ channelId, botId, key, conversationType, field, value }) {
    if (typeof channelRpc !== "function") {
      throw panelError("chat/unknown-field", `\u9762\u677F\u4E0D\u652F\u6301\u8FD9\u4E2A\u64CD\u4F5C\uFF1A${field}`);
    }
    const result = await channelRpc(channelId, "panel.apply", {
      botId,
      key: key ?? null,
      conversationType: conversationType ?? null,
      field,
      value
    });
    if (result?.ok !== true) {
      throw panelError(
        result?.error?.code ?? "chat/channel-field-failed",
        result?.error?.message ?? `\u6E20\u9053\u6CA1\u80FD\u6539 ${field}\u3002`
      );
    }
    return {
      field,
      value: result.value?.value ?? value,
      message: result.value?.message ?? "\u5DF2\u751F\u6548\u3002"
    };
  }
  function sinceLabel(updatedAt) {
    if (!Number.isFinite(updatedAt)) return null;
    const minutes = Math.max(0, Math.round((Date.now() - updatedAt) / 6e4));
    if (minutes < 1) return "\u521A\u521A";
    if (minutes < 60) return `${minutes} \u5206\u949F\u524D`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} \u5C0F\u65F6\u524D`;
    return `${Math.round(hours / 24)} \u5929\u524D`;
  }
  async function sessionOptions({ channelId, botId, key, currentSessionId, workspace, limit = 25 }) {
    let items = [];
    try {
      const listed = await sessions.invoke("session", "list", { _request: {} });
      items = Array.isArray(listed?.items) ? listed.items : [];
    } catch (error) {
      logger.warn?.(`[dsh-chat] \u8BFB\u53D6\u4F1A\u8BDD\u5217\u8868\u5931\u8D25\uFF1A${error?.message ?? error}`);
      return {
        options: currentSessionId ? [{ id: currentSessionId, label: String(currentSessionId).slice(0, 12) }] : [],
        failed: true
      };
    }
    const bound = /* @__PURE__ */ new Set();
    for (const [boundKey, entry] of Object.entries(sessionStore?.entries?.(channelId, botId) ?? {})) {
      if (entry?.sessionId && boundKey !== key) bound.add(entry.sessionId);
    }
    const wanted = typeof workspace === "string" && workspace.trim() ? workspace.trim() : null;
    const usable = items.filter((item) => item?.sessionId && item.origin !== "subagent" && item.blank !== true && (item.sessionId === currentSessionId || bound.has(item.sessionId) || wanted && item.cwd === wanted));
    const ordered = usable.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const picked = ordered.slice(0, Math.max(1, limit));
    if (currentSessionId && !picked.some((item) => item.sessionId === currentSessionId)) {
      const current = items.find((item) => item.sessionId === currentSessionId);
      picked.unshift(current ?? { sessionId: currentSessionId });
    }
    return {
      options: picked.map((item) => {
        const title = typeof item.projections?.values?.title === "string" && item.projections.values.title.trim() ? item.projections.values.title.trim() : null;
        const since = sinceLabel(item.updatedAt);
        return {
          id: item.sessionId,
          label: [title ?? item.sessionId.slice(0, 12), since].filter(Boolean).join(" \xB7 ")
        };
      }),
      failed: false
    };
  }
  async function modelCatalog2() {
    return readModelCatalog(sessions, logger);
  }
  async function presetOptions() {
    if (typeof agentPresets?.remoteExportList !== "function") return { options: [], failed: false };
    try {
      const rows = (await agentPresets.remoteExportList())?.presets ?? [];
      return {
        options: rows.map((row) => ({
          id: row.id,
          label: row.name && row.name !== row.id ? `${row.id} \xB7 ${row.name}` : row.id,
          isDefault: row.isDefault === true
        })),
        failed: false
      };
    } catch (error) {
      logger.warn?.(`[dsh-chat] \u8BFB\u53D6 Agent Preset \u5217\u8868\u5931\u8D25\uFF1A${error?.message ?? error}`);
      return { options: [], failed: true };
    }
  }
  return Object.freeze({
    /**
     * 读一次面板状态。
     *
     * @param options - { channelId, botId, key, isOwner }。
     *   `isOwner` 决定要不要把工作区**候选清单**给出去：它来自这台机器人的所有会话绑定
     *   （含属主其它会话/私聊的绝对路径），而群聊卡片是一条**群里所有人**都能展开的消息——
     *   所以**群会话一律不给**（`key` 的 `group:` 前缀是 hub 自己的约定），
     *   属主在私聊里或设置页改工作区。
     * @returns 面板状态（只含叶子字段，可安全跨 RPC/序列化）。
     */
    async read({ channelId, botId, key, isOwner = false, conversationType = null }) {
      await settings.ready?.();
      const record = settings.read(channelId, botId) ?? {};
      const sessionId = boundSessionId(channelId, botId, key);
      const [catalog, presetState, selectionState, sessionState, channelFieldState] = await Promise.all([
        modelCatalog2().catch((error) => {
          logger.warn?.(`[dsh-chat] \u8BFB\u53D6\u6A21\u578B\u5217\u8868\u5931\u8D25\uFF1A${error?.message ?? error}`);
          return { options: [], hostDefault: null, failures: [{ id: "", name: "\u6A21\u578B\u76EE\u5F55", message: String(error?.message ?? error) }] };
        }),
        presetOptions(),
        currentSelection(sessionId).then((selection2) => ({ selection: selection2, failed: false })).catch((error) => {
          logger.warn?.(`[dsh-chat] \u8BFB\u53D6\u4F1A\u8BDD\u6A21\u578B\u9009\u62E9\u5931\u8D25\uFF1A${error?.message ?? error}`);
          return { selection: null, failed: true };
        }),
        sessionOptions({
          channelId,
          botId,
          key,
          currentSessionId: sessionId,
          workspace: record.workspace
        }),
        channelPanelFields({ channelId, botId, key, conversationType })
      ]);
      const options = catalog.options;
      const selection = selectionState.selection;
      const botDefault = normalizeBotModel(record.model);
      const effective = selectionState.failed ? null : selection ?? (sessionId ? null : botDefault);
      const effectiveModel = effective ? options.find((item) => item.provider === effective.provider && item.model === effective.model) ?? null : null;
      return {
        sessionId,
        bound: typeof sessionId === "string" && sessionId.length > 0,
        model: {
          current: selection,
          // `true` = 这次读**失败**了（不是"没选过"）：卡片必须如实说读不到。
          selectionFailed: selectionState.failed === true,
          // 机器人默认模型（没有会话时选的那个）：卡片在未绑定时显示它并允许改。
          botDefault,
          // Host 默认模型：卡片在"跟随 Host 默认"时把具体是哪个模型写出来，用户才知道会用什么。
          hostDefault: catalog.hostDefault,
          failures: catalog.failures ?? [],
          options,
          // 推理等级取决于"当前生效的那个模型"：会话内的选择，或（没有会话时）机器人默认。
          efforts: effectiveModel?.efforts ?? [],
          currentEffort: effective?.reasoningEffort ?? null
        },
        // 渠道自带的面板字段（飞书：任务过程展示）。渠道没实现就是空数组。
        fields: channelFieldState.fields,
        fieldsFailed: channelFieldState.failed === true,
        // 「会话」下拉：当前聊天绑定到哪个会话、可以切到哪些。
        session: {
          current: sessionId,
          options: sessionState.options,
          failed: sessionState.failed === true
        },
        preset: {
          current: record.agentPreset ?? null,
          options: presetState.options,
          // 读不到列表时卡片要如实说明（否则用户看到的是"一个预设都没有"，与事实相反）。
          failed: presetState.failed === true
        },
        workspace: {
          current: record.workspace ?? null,
          /**
           * 候选清单里有属主其它会话的绝对路径：**只给属主，且只在私聊**。
           *
           * 只判 isOwner 不够：属主在群里发 `/menu` 时 `isOwner` 为真，可卡是发到群里的，
           * 任何群成员展开下拉都能读到这些路径。拿不准的渠道（键不是 `group:` 前缀）按私聊算，
           * 但那时 `isOwner` 必须为真。
           */
          options: isOwner === true && !String(key ?? "").startsWith("group:") ? workspaceCandidates({ record, sessionStore, channelId, botId }) : []
        }
      };
    },
    /**
     * 应用一个选择。
     *
     * @param options - { channelId, botId, key, field, value, isOwner }。
     *   field ∈ model | reasoning | preset | workspace | session。
     *   `isOwner` 由渠道判定后传入：**机器人级**字段（preset / workspace）只限属主——
     *   它们改的是整台机器人的设置，且工作区候选来自这台机器人的**所有**会话
     *   （含属主其他会话的绝对路径）。命令门禁放行的普通成员不该能改。
     * @returns `{ field, value, message }`：`message` 是给用户看的结果说明。
     */
    async apply({ channelId, botId, key, field, value, isOwner = false, conversationType = null }) {
      await settings.ready?.();
      const record = settings.read(channelId, botId) ?? {};
      const sessionId = boundSessionId(channelId, botId, key);
      const botDefault = normalizeBotModel(record.model);
      if (!BUILT_IN_FIELDS.has(field)) {
        return applyChannelField({
          channelId,
          botId,
          key,
          conversationType,
          field,
          value
        });
      }
      if (field === "model" || field === "reasoning") {
        if (!sessionId) {
          if (isOwner !== true) {
            throw panelError(
              "chat/owner-only",
              "\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF1A\u8FD9\u91CC\u6539\u7684\u662F\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B\uFF08\u673A\u5668\u4EBA\u7EA7\u8BBE\u7F6E\uFF09\uFF0C\u53EA\u6709\u5C5E\u4E3B\u80FD\u6539\u3002"
            );
          }
          const { options: options2 } = await modelCatalog2();
          if (field === "model") {
            const target = options2.find((item) => item.value === value);
            if (!target) throw panelError("chat/unknown-model", `\u627E\u4E0D\u5230\u6A21\u578B ${value}\u3002`);
            const next2 = botModelForSelection(botDefault, { provider: target.provider, model: target.model });
            await settings.write(channelId, botId, { model: next2 });
            return {
              field,
              value: target.value,
              message: `\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B\u5DF2\u8BBE\u4E3A ${next2.provider}/${next2.model}${next2.reasoningEffort ? ` \xB7 \u63A8\u7406 ${next2.reasoningEffort}` : ""}\uFF08\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF1A\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u7528\u5B83\uFF09\u3002`
            };
          }
          if (!botDefault) {
            throw panelError("chat/no-model", "\u8FD8\u6CA1\u6709\u9009\u8FC7\u6A21\u578B\uFF1A\u5148\u9009\u4E00\u4E2A\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B\uFF0C\u518D\u6539\u63A8\u7406\u7B49\u7EA7\u3002");
          }
          const currentModel2 = options2.find((item) => item.provider === botDefault.provider && item.model === botDefault.model);
          if (!currentModel2) {
            throw panelError(
              "chat/unknown-model",
              `\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B ${botDefault.provider}/${botDefault.model} \u4E0D\u5728\u53EF\u7528\u5217\u8868\u91CC\u3002`
            );
          }
          const wanted2 = String(value ?? "");
          if (wanted2 !== "" && !currentModel2.efforts.some((effort) => effort.id === wanted2)) {
            throw panelError(
              "chat/unknown-effort",
              `\u6A21\u578B ${currentModel2.value} \u4E0D\u652F\u6301\u63A8\u7406\u7B49\u7EA7 ${wanted2}\u3002`
            );
          }
          const next = { ...botDefault, reasoningEffort: wanted2 || null };
          await settings.write(channelId, botId, { model: next });
          return {
            field,
            value: wanted2,
            message: wanted2 ? `\u673A\u5668\u4EBA\u9ED8\u8BA4\u63A8\u7406\u7B49\u7EA7\u5DF2\u8BBE\u4E3A ${wanted2}\uFF08\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u7528\u5B83\uFF09\u3002` : "\u673A\u5668\u4EBA\u9ED8\u8BA4\u63A8\u7406\u7B49\u7EA7\u5DF2\u6062\u590D\u6A21\u578B\u9ED8\u8BA4\uFF08\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u7528\u5B83\uFF09\u3002"
          };
        }
        const { options } = await modelCatalog2();
        if (field === "model") {
          const target = options.find((item) => item.value === value);
          if (!target) throw panelError("chat/unknown-model", `\u627E\u4E0D\u5230\u6A21\u578B ${value}\u3002`);
          const selected2 = await sessions.invoke("session", "selectModel", {
            request: { sessionId, provider: target.provider, model: target.model }
          });
          const now2 = selected2?.selected ?? {};
          return {
            field,
            value: target.value,
            message: `\u5DF2\u5207\u6362\u6A21\u578B\u4E3A ${now2.provider ?? target.provider}/${now2.model ?? target.model}\u3002`
          };
        }
        const selection = await currentSelection(sessionId).catch((error) => {
          throw panelError(
            "chat/model-selection-unavailable",
            `\u8BFB\u4E0D\u5230\u5F53\u524D\u4F1A\u8BDD\u7684\u6A21\u578B\u9009\u62E9\uFF1A${error?.message ?? error}`
          );
        });
        if (!selection) {
          throw panelError("chat/no-model", "\u5F53\u524D\u4F1A\u8BDD\u8FD8\u6CA1\u6709\u663E\u5F0F\u9009\u62E9\u6A21\u578B\uFF0C\u5148\u9009\u4E00\u4E2A\u6A21\u578B\u518D\u6539\u63A8\u7406\u7B49\u7EA7\u3002");
        }
        const currentModel = options.find((item) => item.provider === selection.provider && item.model === selection.model);
        if (!currentModel) throw panelError("chat/unknown-model", `\u5F53\u524D\u6A21\u578B ${selection.provider}/${selection.model} \u4E0D\u5728\u53EF\u7528\u5217\u8868\u91CC\u3002`);
        const wanted = String(value ?? "");
        if (wanted !== "" && !currentModel.efforts.some((effort) => effort.id === wanted)) {
          throw panelError(
            "chat/unknown-effort",
            `\u6A21\u578B ${currentModel.value} \u4E0D\u652F\u6301\u63A8\u7406\u7B49\u7EA7 ${wanted}\u3002`
          );
        }
        const selected = await sessions.invoke("session", "selectModel", {
          request: {
            sessionId,
            provider: selection.provider,
            model: selection.model,
            ...wanted ? { reasoningEffort: wanted } : {}
          }
        });
        const now = selected?.selected ?? {};
        return {
          field,
          value: wanted,
          message: wanted ? `\u63A8\u7406\u7B49\u7EA7\u5DF2\u8BBE\u4E3A ${now.reasoningEffort ?? wanted}\u3002` : "\u63A8\u7406\u7B49\u7EA7\u5DF2\u6062\u590D\u6A21\u578B\u9ED8\u8BA4\u3002"
        };
      }
      if ((field === "preset" || field === "workspace") && isOwner !== true) {
        throw panelError("chat/owner-only", "\u5DE5\u4F5C\u533A\u4E0E Agent \u9884\u8BBE\u662F\u673A\u5668\u4EBA\u7EA7\u8BBE\u7F6E\uFF0C\u53EA\u6709\u5C5E\u4E3B\u80FD\u6539\u3002");
      }
      if (field === "preset") {
        const target = typeof value === "string" && value.trim() ? value.trim() : null;
        if (target) {
          const { options: presets, failed } = await presetOptions();
          if (failed) throw panelError("chat/preset-unavailable", "\u8BFB\u4E0D\u5230 Agent Preset \u5217\u8868\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002");
          if (presets.length > 0 && !presets.some((item) => item.id === target)) {
            throw panelError("chat/unknown-preset", `\u5F53\u524D Host \u6CA1\u6709\u8FD9\u4E2A Agent Preset\uFF1A${target}`);
          }
        }
        await settings.write(channelId, botId, { agentPreset: target });
        return {
          field,
          value: target,
          message: target ? `Agent Preset \u5DF2\u8BBE\u4E3A ${target}\uFF08\u53EA\u5BF9\u65B0\u4F1A\u8BDD\u751F\u6548\uFF1A\u5148\u53D1 /new \u518D\u53D1\u6D88\u606F\uFF09\u3002` : "Agent Preset \u5DF2\u6539\u4E3A\u8DDF\u968F Host \u9ED8\u8BA4\uFF08\u53EA\u5BF9\u65B0\u4F1A\u8BDD\u751F\u6548\uFF09\u3002"
        };
      }
      if (field === "workspace") {
        const target = await validateWorkspacePath(value);
        await settings.write(channelId, botId, { workspace: target });
        return {
          field,
          value: target,
          message: `\u5DE5\u4F5C\u533A\u5DF2\u8BBE\u4E3A ${target}\uFF08\u53EA\u5BF9\u65B0\u4F1A\u8BDD\u751F\u6548\uFF1A\u5148\u53D1 /new \u518D\u53D1\u6D88\u606F\uFF09\u3002`
        };
      }
      if (field === "session") {
        if (value === "new" || value === "" || value === null || value === void 0) {
          await sessions.reset({ channelId, botId, key });
          return { field, value: "new", message: "\u5DF2\u89E3\u9664\u5F53\u524D\u4F1A\u8BDD\u7ED1\u5B9A\uFF0C\u4E0B\u4E00\u6761\u6D88\u606F\u5C06\u5F00\u542F\u65B0\u4F1A\u8BDD\u3002" };
        }
        const target = String(value);
        const exists = await sessions.sessionExists(target).catch((error) => {
          throw panelError("chat/session-check-failed", `\u6821\u9A8C\u4F1A\u8BDD\u5931\u8D25\uFF1A${error?.message ?? error}`);
        });
        if (!exists) throw panelError("chat/unknown-session", `\u627E\u4E0D\u5230\u4F1A\u8BDD ${target}\u3002`);
        await sessions.bindings.bind(channelId, botId, key, { sessionId: target });
        return { field, value: target, message: `\u5DF2\u5207\u6362\u5230\u4F1A\u8BDD ${target}\u3002` };
      }
      throw panelError("chat/unknown-field", `\u9762\u677F\u4E0D\u652F\u6301\u8FD9\u4E2A\u64CD\u4F5C\uFF1A${field}`);
    }
  });
}

// packages/dsh-chat/host/guidance.mjs
var GUIDANCE_MAX_LENGTH2 = 8e3;
var MAX_SESSIONS = 1024;
function createGuidanceRegistry() {
  const bySession = /* @__PURE__ */ new Map();
  return {
    /**
     * 发布一个会话当前生效的提示词；空值表示清除。
     *
     * @param sessionId - 目标 Session。
     * @param guidance - 提示词正文。
     */
    publish(sessionId, guidance) {
      if (typeof sessionId !== "string" || !sessionId) return;
      const text = typeof guidance === "string" ? guidance.slice(0, GUIDANCE_MAX_LENGTH2) : "";
      bySession.delete(sessionId);
      if (!text.trim()) return;
      bySession.set(sessionId, text);
      while (bySession.size > MAX_SESSIONS) {
        bySession.delete(bySession.keys().next().value);
      }
    },
    /**
     * @param sessionId - Session id。
     * @returns 该会话的提示词，未登记时为 undefined。
     */
    get(sessionId) {
      return typeof sessionId === "string" ? bySession.get(sessionId) : void 0;
    },
    /**
     * 会话离开时清掉登记。
     *
     * @param sessionId - Session id。
     */
    forget(sessionId) {
      if (typeof sessionId === "string") bySession.delete(sessionId);
    },
    /** @returns 当前登记数量。 */
    get size() {
      return bySession.size;
    }
  };
}

// packages/dsh-chat/host/interactions.mjs
var DEFAULT_TIMEOUT_MS = 10 * 6e4;
var APPROVE_PATTERN = /^(允许|同意|可以|好|好的|是|执行|ok|okay|yes|y|allow|approve)$/i;
var REJECT_PATTERN = /^(拒绝|不允许|不同意|不可以|不行|不要|不用|否|不|取消|no|n|deny|reject|cancel)$/i;
function waiterKey(channelId, botId, key) {
  return `${channelId}\0${botId}\0${key}`;
}
function renderQuestion(question, { position = 0, total = 1 } = {}) {
  const header = question?.header || "\u9700\u8981\u4F60\u786E\u8BA4";
  const lines = [total > 1 ? `\u2753 ${header}\uFF08${position}/${total}\uFF09` : `\u2753 ${header}`, ""];
  lines.push(String(question?.question ?? ""));
  if (question?.detail) {
    lines.push("", String(question.detail));
  }
  const options = Array.isArray(question?.options) ? question.options : [];
  if (options.length > 0) {
    lines.push("");
    options.forEach((option, index) => {
      lines.push(`${index + 1}. ${option.label}${option.description ? ` \u2014\u2014 ${option.description}` : ""}`);
    });
    lines.push("");
    lines.push(question?.multiSelect ? "\u53EF\u4EE5\u56DE\u590D\u591A\u4E2A\u7F16\u53F7\uFF08\u4F8B\u5982 1,3\uFF09\uFF0C\u4E5F\u53EF\u4EE5\u76F4\u63A5\u56DE\u590D\u6587\u5B57\u3002" : "\u56DE\u590D\u7F16\u53F7\u6216\u9009\u9879\u539F\u6587\u5373\u53EF\uFF0C\u4E5F\u53EF\u4EE5\u76F4\u63A5\u56DE\u590D\u6587\u5B57\u3002");
  } else {
    lines.push("", "\u76F4\u63A5\u56DE\u590D\u4F60\u7684\u7B54\u6848\u3002");
  }
  return lines.join("\n");
}
function renderApproval(request) {
  const lines = ["\u26A0\uFE0F \u9700\u8981\u6388\u6743", ""];
  lines.push(`\u5DE5\u5177\uFF1A${request?.toolName ?? "\u672A\u77E5"}`);
  if (request?.reason) lines.push(`\u539F\u56E0\uFF1A${request.reason}`);
  lines.push("", "\u56DE\u590D\u300C\u5141\u8BB8\u300D\u6267\u884C\u4E00\u6B21\uFF0C\u6216\u300C\u62D2\u7EDD\u300D\u53D6\u6D88\u3002");
  return lines.join("\n");
}
function parseAnswer(question, reply) {
  const raw = String(reply ?? "").trim();
  const options = Array.isArray(question?.options) ? question.options : [];
  const exact = options.find((option) => option.label === raw);
  if (exact) return { id: String(question?.id ?? ""), selected: [exact.label] };
  const tokens = question?.multiSelect ? raw.split(/[,，、;；]+/).map((token) => token.trim()).filter(Boolean) : [raw];
  const selected = [];
  const unmatched = [];
  for (const token of tokens) {
    const byIndex = /^\d+$/.test(token) ? options[Number(token) - 1] : void 0;
    const byLabel = byIndex ?? options.find((option) => option.label === token);
    if (byLabel) {
      if (!selected.includes(byLabel.label)) selected.push(byLabel.label);
      continue;
    }
    unmatched.push(token);
  }
  const answer = { id: String(question?.id ?? ""), selected };
  if (unmatched.length > 0) {
    answer.custom = unmatched.length === tokens.length ? raw : unmatched.join(" ");
  }
  return answer;
}
function parseApproval(reply) {
  const raw = String(reply ?? "").trim();
  if (APPROVE_PATTERN.test(raw)) return "allowed-once";
  if (REJECT_PATTERN.test(raw)) return "rejected";
  return null;
}
function createInteractionService({ logger = console, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const senders = /* @__PURE__ */ new Map();
  const waiters = /* @__PURE__ */ new Map();
  function senderFor(channelId, botId) {
    return senders.get(`${channelId}\0${botId}`) ?? null;
  }
  function wait({ channelId, botId, key, kind, signal, budgetMs }) {
    const timeout = Math.max(0, Number.isFinite(budgetMs) ? budgetMs : timeoutMs);
    return new Promise((resolve4) => {
      const id = waiterKey(channelId, botId, key);
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", onAbort);
        if (waiters.get(id)?.resolve === entry.resolve) waiters.delete(id);
        if (value === null) {
          logger.warn?.(`[dsh-chat] ${kind} \u5728 IM \u91CC\u6CA1\u6709\u5F97\u5230\u56DE\u7B54\uFF0C\u4EA4\u56DE\u5176\u4ED6\u5E94\u7B54\u65B9\uFF08${channelId}/${botId}/${key}\uFF09`);
        }
        resolve4(value);
      };
      const entry = { resolve: (value) => finish(value) };
      const timer = setTimeout(() => finish(null), timeout);
      const onAbort = () => finish(null);
      signal?.addEventListener?.("abort", onAbort, { once: true });
      waiters.set(id, entry);
    });
  }
  return Object.freeze({
    /**
     * 渠道接入 IM 回传：给出"怎么把文本发到这个机器人的某个会话"。
     *
     * @param options - { channelId, botId, send({ key, text }) }。
     * @returns 注销函数。
     */
    attach({ channelId, botId, send, sendQuestion, sendQuestions, sendApproval }) {
      if (typeof send !== "function") throw new TypeError("\u4EA4\u4E92\u56DE\u4F20\u9700\u8981\u6E20\u9053\u63D0\u4F9B send\u3002");
      const id = `${channelId}\0${botId}`;
      senders.set(id, {
        send,
        // 可选：渠道能把问题/审批渲染成平台原生交互（飞书的按钮卡片），比纯文本好用得多。
        // `sendQuestions` 是"一批问题一张卡、回答后就地更新"的形态，优先用它。
        sendQuestions: typeof sendQuestions === "function" ? sendQuestions : typeof sendQuestion === "function" ? null : null,
        sendQuestion: typeof sendQuestion === "function" ? sendQuestion : null,
        sendApproval: typeof sendApproval === "function" ? sendApproval : null
      });
      return () => {
        if (senders.get(id)?.send === send) senders.delete(id);
      };
    },
    /** @returns 该渠道是否接入了 IM 回传（未接入则一律让给浏览器 UI）。 */
    has: (channelId) => [...senders.keys()].some((id) => id.startsWith(`${channelId}\0`)),
    /**
     * 入站文本先过这里：属于某个待回答的问题/审批就认领，调用方**不要**再跑模型。
     *
     * @param options - { channelId, botId, key, text }。
     * @returns 是否被认领。
     */
    offer({ channelId, botId, key, text, questionId }) {
      const entry = waiters.get(waiterKey(channelId, botId, key));
      if (!entry) return false;
      logger.info?.(`[dsh-chat] IM \u56DE\u7B54\u5DF2\u8BA4\u9886\uFF1A${channelId}/${botId}/${key}${questionId ? ` \u95EE\u9898=${questionId}` : ""}`);
      entry.resolve({ text, questionId });
      return true;
    },
    /**
     * 应答一次提问/审批。
     *
     * @param options - { kind: 'question'|'approval', channelId, botId, key, request }。
     * @returns 提问返回 `{ answers }`，审批返回 outcome 字符串；无法应答时返回 null。
     */
    async handle({ kind, channelId, botId, key, request }) {
      const sender = senderFor(channelId, botId);
      if (!sender) return null;
      if (kind === "approval") {
        logger.info?.(`[dsh-chat] \u5BA1\u6279\u5DF2\u53D1\u5F80 IM\uFF1A${channelId}/${botId}/${key} \u5DE5\u5177=${request?.toolName ?? "?"} \u65B9\u5F0F=${sender.sendApproval ? "\u5361\u7247" : "\u6587\u672C"}`);
        if (sender.sendApproval) {
          await sender.sendApproval({ key, request });
        } else {
          await sender.send({ key, text: renderApproval(request) });
        }
        const reply = await wait({ channelId, botId, key, kind: "\u5BA1\u6279", signal: request?.signal });
        if (reply === null) return null;
        const outcome = parseApproval(reply.text);
        if (outcome === null) {
          logger.warn?.(`[dsh-chat] \u5BA1\u6279\u56DE\u590D\u65E0\u6CD5\u8BC6\u522B\uFF08${JSON.stringify(reply.text)}\uFF09\uFF0C\u6309\u62D2\u7EDD\u5904\u7406`);
          return "rejected";
        }
        return outcome;
      }
      const questions = Array.isArray(request?.questions) ? request.questions : [];
      if (questions.length === 0) return null;
      let useCard = typeof sender.sendQuestions === "function";
      const answered = /* @__PURE__ */ new Map();
      const render = async ({ final = false } = {}) => {
        if (!useCard) return;
        try {
          await sender.sendQuestions({
            key,
            questions,
            answered: Object.fromEntries(answered),
            final
          });
        } catch (error) {
          logger.warn?.(`[dsh-chat] \u63D0\u95EE\u5361\u7247\u66F4\u65B0\u5931\u8D25\uFF1A${error?.message ?? error}`);
        }
      };
      logger.info?.(`[dsh-chat] \u63D0\u95EE\u5DF2\u53D1\u5F80 IM\uFF1A${channelId}/${botId}/${key} \u95EE\u9898\u6570=${questions.length} \u65B9\u5F0F=${useCard ? "\u5361\u7247" : "\u6587\u672C"}`);
      if (useCard) {
        try {
          await sender.sendQuestions({ key, questions, answered: {}, final: false });
        } catch (error) {
          useCard = false;
          logger.warn?.(`[dsh-chat] \u63D0\u95EE\u5361\u7247\u53D1\u9001\u5931\u8D25\uFF0C\u56DE\u9000\u4E3A\u6587\u672C\uFF1A${error?.message ?? error}`);
        }
      }
      if (!useCard) {
        for (const [index, question] of questions.entries()) {
          await sender.send({
            key,
            text: renderQuestion(question, { position: index + 1, total: questions.length })
          });
        }
      }
      const deadline = Date.now() + timeoutMs;
      while (answered.size < questions.length) {
        const budgetMs = deadline - Date.now();
        if (budgetMs <= 0) return null;
        const reply = await wait({
          channelId,
          botId,
          key,
          kind: "\u63D0\u95EE",
          signal: request?.signal,
          budgetMs
        });
        if (reply === null) return null;
        const target = reply.questionId ? questions.find((item) => item?.id === reply.questionId && !answered.has(item.id)) : questions.find((item) => !answered.has(item?.id));
        if (!target) {
          logger.info?.(`[dsh-chat] \u5FFD\u7565\u65E0\u6CD5\u5F52\u5C5E\u7684\u56DE\u7B54\uFF08questionId=${reply.questionId ?? "\u65E0"}\uFF09`);
          continue;
        }
        answered.set(target.id, parseAnswer(target, reply.text));
        await render();
      }
      await render({ final: true });
      return { answers: questions.map((question) => answered.get(question?.id)) };
    }
  });
}

// packages/dsh-chat/host/paths.mjs
import { homedir } from "node:os";
import { join as join3, resolve as resolve2 } from "node:path";
function dshHome() {
  const configured = process.env.DSH_HOME;
  return configured && configured.trim() ? resolve2(configured.trim()) : join3(homedir(), ".dsh");
}
function hubDataDir(configured) {
  return configured && String(configured).trim() ? resolve2(String(configured).trim()) : join3(dshHome(), "integrations", "dsh-chat");
}
function channelDataDir(name2, integrationRoot2) {
  return join3(integrationRoot2 ?? join3(dshHome(), "integrations"), name2);
}
function integrationRoot(configured) {
  return configured && String(configured).trim() ? resolve2(String(configured).trim()) : join3(dshHome(), "integrations");
}

// packages/dsh-chat/host/session-store.mjs
import { join as join4 } from "node:path";
var DOCUMENT_VERSION2 = 1;
function isPlainObject6(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function normalizeDocument2(value) {
  const source = isPlainObject6(value) && value.version === DOCUMENT_VERSION2 ? value : {};
  const channels = {};
  if (isPlainObject6(source.channels)) {
    for (const [channelId, bots] of Object.entries(source.channels)) {
      if (!isPlainObject6(bots)) continue;
      const accounts = {};
      for (const [botId, keys] of Object.entries(bots)) {
        if (!isPlainObject6(keys)) continue;
        const entries = {};
        for (const [key, entry] of Object.entries(keys)) {
          const sessionId = typeof entry?.sessionId === "string" ? entry.sessionId : null;
          if (!sessionId) continue;
          entries[key] = {
            sessionId,
            workspacePath: typeof entry.workspacePath === "string" ? entry.workspacePath : null,
            boundAt: typeof entry.boundAt === "string" ? entry.boundAt : null
          };
        }
        accounts[botId] = entries;
      }
      channels[channelId] = accounts;
    }
  }
  return { version: DOCUMENT_VERSION2, channels };
}
function createSessionStore({ dataDir, logger = console } = {}) {
  if (typeof dataDir !== "string" || !dataDir.trim()) {
    throw new TypeError("session store \u9700\u8981 dataDir\u3002");
  }
  const store = createJsonStore({
    path: join4(dataDir, "sessions.json"),
    normalize: normalizeDocument2,
    empty: () => ({ version: DOCUMENT_VERSION2, channels: {} }),
    logger,
    label: "\u4F1A\u8BDD\u7ED1\u5B9A"
  });
  function entriesOf(channelId, botId) {
    return store.snapshot().channels?.[channelId]?.[botId] ?? {};
  }
  return {
    path: store.path,
    ready: () => store.ready(),
    subscribe: (listener) => store.subscribe(listener),
    /**
     * @returns 绑定记录，未绑定时为 undefined。
     */
    get(channelId, botId, key) {
      const entry = entriesOf(channelId, botId)[key];
      return entry ? Object.freeze({ ...entry }) : void 0;
    },
    /** @returns 某个机器人的全部绑定（key → entry）。 */
    entries(channelId, botId) {
      return Object.freeze({ ...entriesOf(channelId, botId) });
    },
    /**
     * 绑定（或更新）一个会话键。
     *
     * @param channelId - 渠道 id。
     * @param botId - 机器人 id。
     * @param key - 渠道侧会话键。
     * @param entry - { sessionId, workspacePath? }。
     */
    async bind(channelId, botId, key, entry) {
      if (typeof key !== "string" || !key) throw new TypeError("\u4F1A\u8BDD\u952E\u5FC5\u586B\u3002");
      if (typeof entry?.sessionId !== "string" || !entry.sessionId) {
        throw new TypeError("\u7ED1\u5B9A\u9700\u8981 sessionId\u3002");
      }
      await store.update((current) => ({
        ...current,
        channels: {
          ...current.channels,
          [channelId]: {
            ...current.channels[channelId] ?? {},
            [botId]: {
              ...(current.channels[channelId] ?? {})[botId] ?? {},
              [key]: {
                sessionId: entry.sessionId,
                workspacePath: typeof entry.workspacePath === "string" ? entry.workspacePath : null,
                boundAt: (/* @__PURE__ */ new Date()).toISOString()
              }
            }
          }
        }
      }));
    },
    /** 解除一个会话键的绑定（下一条消息开新会话）。 */
    async unbind(channelId, botId, key) {
      await store.update((current) => {
        const accounts = current.channels[channelId];
        const keys = accounts?.[botId];
        if (!keys || !Object.hasOwn(keys, key)) return null;
        const nextKeys = { ...keys };
        delete nextKeys[key];
        return {
          ...current,
          channels: { ...current.channels, [channelId]: { ...accounts, [botId]: nextKeys } }
        };
      });
    },
    /**
     * 一次性接管旧实现的绑定（只补空缺，不覆盖已有绑定）。
     *
     * @param channelId - 渠道 id。
     * @param botId - 机器人 id。
     * @param entries - `{ [key]: sessionId | { sessionId, workspacePath? } }`。
     * @returns 实际接管的条数。
     */
    async adopt(channelId, botId, entries) {
      if (!isPlainObject6(entries)) throw new TypeError("adopt \u9700\u8981 { key: sessionId } \u5F62\u5F0F\u3002");
      let adopted = 0;
      await store.update((current) => {
        const accounts = current.channels[channelId] ?? {};
        const keys = { ...accounts[botId] ?? {} };
        for (const [key, value] of Object.entries(entries)) {
          if (!key || keys[key]) continue;
          const sessionId = typeof value === "string" ? value : value?.sessionId;
          if (typeof sessionId !== "string" || !sessionId) continue;
          keys[key] = {
            sessionId,
            workspacePath: isPlainObject6(value) && typeof value.workspacePath === "string" ? value.workspacePath : null,
            boundAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          adopted += 1;
        }
        if (adopted === 0) return null;
        return {
          ...current,
          channels: { ...current.channels, [channelId]: { ...accounts, [botId]: keys } }
        };
      });
      return adopted;
    },
    /** 该 Session 属于哪个 (渠道, 机器人, 会话键)——审批/提问回传时用。 */
    locate(sessionId) {
      if (typeof sessionId !== "string" || !sessionId) return void 0;
      const channels = store.snapshot().channels ?? {};
      for (const [channelId, accounts] of Object.entries(channels)) {
        for (const [botId, keys] of Object.entries(accounts)) {
          for (const [key, entry] of Object.entries(keys)) {
            if (entry.sessionId === sessionId) return Object.freeze({ channelId, botId, key });
          }
        }
      }
      return void 0;
    }
  };
}

// packages/dsh-chat/host/sessions.mjs
import { randomUUID } from "node:crypto";
var MAX_ASSISTANT_TEXT = 2e5;
var STREAM_CLOSE_GRACE_MS = 1e3;
var TURN_IDLE_TIMEOUT_MS = 15 * 6e4;
var TURN_TOTAL_TIMEOUT_MS = 2 * 60 * 6e4;
function sessionError(error, fallbackCode = "chat/session-failed") {
  const code = typeof error?.code === "string" ? error.code : fallbackCode;
  const wrapped = new Error(typeof error?.message === "string" && error.message ? error.message : "\u4F1A\u8BDD\u64CD\u4F5C\u5931\u8D25\u3002");
  wrapped.code = code;
  wrapped.details = error?.details ?? {};
  return wrapped;
}
function fileUploadFailure(error) {
  const wrapped = new Error(typeof error?.message === "string" && error.message ? `\u4E0A\u4F20\u6587\u4EF6\u5931\u8D25\uFF1A${error.message}` : "\u4E0A\u4F20\u6587\u4EF6\u5931\u8D25\u3002");
  wrapped.code = typeof error?.code === "string" ? error.code : "chat/upload-failed";
  return wrapped;
}
function textOfAssistantMessage(message) {
  const content = message?.content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text).join("");
}
function contentText(content) {
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text).join("").trim();
}
function deltaTextOf(chunk) {
  if (typeof chunk?.text === "string") return chunk.text;
  if (typeof chunk?.delta === "string") return chunk.delta;
  return "";
}
function filesOfPresentArgs(args) {
  let parsed = args;
  if (typeof args === "string") {
    try {
      parsed = JSON.parse(args);
    } catch {
      return [];
    }
  }
  const files = Array.isArray(parsed?.files) ? parsed.files : [];
  return files.filter((file) => typeof file?.path === "string" && file.path).map((file) => ({
    path: file.path,
    ...typeof file.description === "string" && file.description ? { description: file.description } : {}
  }));
}
function historyMessagesOf(records, limit) {
  const messages = [];
  for (const record of Array.isArray(records) ? records : []) {
    const event = record?.event ?? record;
    const data = event?.data;
    if (event?.type === "user/message") {
      if (data?.source?.kind !== "user") continue;
      const text = contentText(data?.content);
      if (text) messages.push({ role: "user", text });
      continue;
    }
    if (event?.type === "assistant/message") {
      const text = textOfAssistantMessage(data?.message);
      if (text) messages.push({ role: "assistant", text });
    }
  }
  return limit > 0 ? messages.slice(-limit) : messages;
}
function createSessionBridge({
  ctx,
  logger = console,
  store,
  settings = null,
  guidance,
  interactions
}) {
  const gateway = ctx?.typertGateway;
  if (typeof gateway?.invoke !== "function") {
    throw new TypeError("\u4F1A\u8BDD\u6865\u9700\u8981 context \u7684 typertGateway.invoke\uFF08\u8BF7\u5728 inject \u4E2D\u58F0\u660E\uFF09\u3002");
  }
  const activeTurns = /* @__PURE__ */ new Map();
  const turnQueues = /* @__PURE__ */ new Map();
  const queueDepth = /* @__PURE__ */ new Map();
  const namedWorkspaces = /* @__PURE__ */ new Set();
  const namedSessions = /* @__PURE__ */ new Set();
  async function markSessionChannel(sessionId, channelLabel2, signal) {
    const label = typeof channelLabel2 === "string" ? channelLabel2.trim() : "";
    if (!label || namedSessions.has(sessionId)) return "skipped";
    try {
      const listed = await invoke("session", "list", { _request: {} }, signal);
      const item = (listed?.items ?? []).find((entry) => entry?.sessionId === sessionId);
      const title = item?.projections?.values?.title;
      if (typeof title !== "string" || !title.trim()) return "no-title";
      if (title.startsWith(`${label} \xB7 `)) {
        namedSessions.add(sessionId);
        return "skipped";
      }
      await invoke("session", "rename", { request: { sessionId, title: `${label} \xB7 ${title}` } }, signal);
      namedSessions.add(sessionId);
      logger.info?.(`[dsh-chat] \u4F1A\u8BDD\u6807\u9898\u5DF2\u6807\u6E20\u9053\uFF1A${sessionId} \u2192 ${label} \xB7 ${title}`);
      return "renamed";
    } catch (error) {
      logger.warn?.(`[dsh-chat] \u6807\u8BB0\u4F1A\u8BDD\u6E20\u9053\u5931\u8D25\uFF1A${sessionId} ${error?.message ?? error}`);
      return "failed";
    }
  }
  function boundSessions(channelId, botId) {
    const entries = store?.entries?.(channelId, botId) ?? {};
    return Object.entries(entries).map(([key, entry]) => ({
      key,
      sessionId: entry?.sessionId ?? null,
      workspacePath: entry?.workspacePath ?? null
    })).filter((row) => typeof row.sessionId === "string" && row.sessionId);
  }
  async function invoke(namespace, method, args = {}, signal) {
    const request = { namespace, method, args };
    if (signal !== void 0) request.signal = signal;
    try {
      return await gateway.invoke(request);
    } catch (error) {
      throw sessionError(error, "chat/gateway-failed");
    }
  }
  async function stream(namespace, method, args = {}, signal) {
    if (typeof gateway.stream !== "function") {
      const error = new Error("\u5F53\u524D Host \u4E0D\u652F\u6301 stream \u8C03\u7528\u3002");
      error.code = "chat/stream-unavailable";
      throw error;
    }
    const request = { namespace, method, args };
    if (signal !== void 0) request.signal = signal;
    try {
      return await gateway.stream(request);
    } catch (error) {
      throw sessionError(error, "chat/gateway-stream-failed");
    }
  }
  async function resolveWorkspaceId(path, signal, label = "") {
    const result = await invoke("workspace", "create", { request: { path } }, signal);
    const workspaceId = result?.workspace?.workspaceId;
    if (typeof workspaceId !== "string" || !workspaceId) {
      const error = new Error("DSH \u672A\u8FD4\u56DE\u5DE5\u4F5C\u533A\u6807\u8BC6\u3002");
      error.code = "chat/workspace-unresolved";
      throw error;
    }
    const title = typeof label === "string" ? label.trim() : "";
    if (title && !namedWorkspaces.has(workspaceId)) {
      namedWorkspaces.add(workspaceId);
      try {
        await invoke("workspace", "rename", { request: { workspaceId, title } }, signal);
      } catch (error) {
        logger.warn?.(`[dsh-chat] \u5DE5\u4F5C\u533A\u547D\u540D\u5931\u8D25\uFF1A${workspaceId} ${error?.message ?? error}`);
      }
    }
    return workspaceId;
  }
  async function sessionExists(sessionId, signal) {
    try {
      await invoke("session", "page", {
        request: { address: { kind: "session", sessionId }, throughSeq: -1, maxMessages: 1 }
      }, signal);
      return true;
    } catch (error) {
      if (error.code === "session/not-found") return false;
      throw error;
    }
  }
  async function createSession({ workspaceId, agentPreset, signal, channelId, botId }) {
    const request = { workspaceId, ...agentPreset ? { agentPreset } : {} };
    try {
      return await invoke("session", "create", { request }, signal);
    } catch (error) {
      if (!agentPreset) throw error;
      logger.warn?.(`[dsh-chat] \u673A\u5668\u4EBA ${channelId}/${botId} \u7684 Agent Preset\u300C${agentPreset}\u300D\u4E0D\u53EF\u7528\uFF08${error?.message ?? error}\uFF09\uFF0C\u672C\u6B21\u9000\u56DE Host \u9ED8\u8BA4\u3002`);
      return invoke("session", "create", { request: { workspaceId } }, signal);
    }
  }
  function modelUnavailableOf(error) {
    if (error?.code !== "session/model-unavailable") return null;
    return {
      provider: typeof error.details?.provider === "string" ? error.details.provider : null,
      model: typeof error.details?.model === "string" ? error.details.model : null
    };
  }
  async function recoverUnavailableModel({ sessionId, failed, signal }) {
    let options = [];
    let hostDefault = null;
    try {
      const catalog = await invoke("session", "modelCatalog", {}, signal);
      hostDefault = catalog?.default?.provider && catalog?.default?.model ? catalog.default : null;
      for (const group of catalog?.groups ?? []) {
        const provider = group?.id;
        for (const model of group?.models ?? []) {
          if (provider && model?.id) options.push({ provider, model: model.id });
        }
      }
    } catch (error) {
      logger.warn?.(`[dsh-chat] \u6A21\u578B\u81EA\u6551\u65F6\u8BFB\u4E0D\u5230\u6A21\u578B\u76EE\u5F55\uFF1A${error?.message ?? error}`);
      return null;
    }
    const usable = (candidate) => candidate && candidate.provider && candidate.model && !(failed?.provider && failed?.model && candidate.provider === failed.provider && candidate.model === failed.model);
    const target = [hostDefault, ...options].find(usable);
    if (!target) return null;
    try {
      await invoke("session", "selectModel", {
        request: { sessionId, provider: target.provider, model: target.model }
      }, signal);
    } catch (error) {
      logger.warn?.(`[dsh-chat] \u6A21\u578B\u81EA\u6551\u5931\u8D25\uFF08\u5207\u5230 ${target.provider}/${target.model}\uFF09\uFF1A${error?.message ?? error}`);
      return null;
    }
    logger.warn?.(`[dsh-chat] \u4F1A\u8BDD ${sessionId} \u7684\u6A21\u578B\u4E0D\u53EF\u7528\uFF08${failed?.provider ?? "?"}/${failed?.model ?? "?"}\uFF09\uFF0C\u5DF2\u81EA\u52A8\u5207\u5230 ${target.provider}/${target.model} \u5E76\u91CD\u8BD5\u8FD9\u4E00\u8F6E`);
    return { provider: target.provider, model: target.model };
  }
  async function applyBotModel({ sessionId, botModel, signal, channelId, botId }) {
    if (!botModel) return;
    const label = `${botModel.provider}/${botModel.model}${botModel.reasoningEffort ? ` \xB7 \u63A8\u7406 ${botModel.reasoningEffort}` : ""}`;
    try {
      await invoke("session", "selectModel", {
        request: {
          sessionId,
          provider: botModel.provider,
          model: botModel.model,
          ...botModel.reasoningEffort ? { reasoningEffort: botModel.reasoningEffort } : {}
        }
      }, signal);
      logger.info?.(`[dsh-chat] \u65B0\u4F1A\u8BDD\u5E94\u7528\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B\uFF1A${label}\uFF08${channelId}/${botId}\uFF09`);
    } catch (error) {
      logger.warn?.(`[dsh-chat] \u5E94\u7528\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B\u5931\u8D25\uFF08${label}\uFF0C${channelId}/${botId}\uFF09\uFF1A${error?.message ?? error}`);
    }
  }
  async function ensure({
    channelId,
    botId,
    key,
    workspacePath,
    signal,
    channelLabel: channelLabel2 = "",
    botLabel = ""
  }) {
    if (!store) throw new TypeError("\u4F1A\u8BDD\u6865\u7F3A\u5C11\u4F1A\u8BDD\u7ED1\u5B9A\u8868\u3002");
    const existing = store.get(channelId, botId, key);
    if (existing) {
      if (await sessionExists(existing.sessionId, signal)) {
        return { sessionId: existing.sessionId, created: false };
      }
      await store.unbind(channelId, botId, key);
    }
    const record = settings?.read?.(channelId, botId) ?? {};
    const targetWorkspace = typeof workspacePath === "string" && workspacePath.trim() ? workspacePath : record.workspace;
    if (typeof targetWorkspace !== "string" || !targetWorkspace.trim()) {
      const error = new Error("\u8BE5\u673A\u5668\u4EBA\u8FD8\u6CA1\u6709\u8BBE\u7F6E\u5DE5\u4F5C\u533A\uFF0C\u65E0\u6CD5\u521B\u5EFA\u4F1A\u8BDD\u3002");
      error.code = "chat/workspace-required";
      throw error;
    }
    const workspaceTitle = [channelLabel2, botLabel].map((part) => String(part ?? "").trim()).filter(Boolean).join(" \xB7 ");
    const workspaceId = await resolveWorkspaceId(targetWorkspace, signal, workspaceTitle);
    const agentPreset = typeof record.agentPreset === "string" && record.agentPreset ? record.agentPreset : null;
    const created = await createSession({
      workspaceId,
      agentPreset,
      signal,
      botId,
      channelId
    });
    const sessionId = created?.sessionId;
    if (typeof sessionId !== "string" || !sessionId) {
      const error = new Error("DSH \u672A\u8FD4\u56DE\u4F1A\u8BDD\u6807\u8BC6\u3002");
      error.code = "chat/session-unresolved";
      throw error;
    }
    await store.bind(channelId, botId, key, { sessionId, workspacePath });
    await applyBotModel({ sessionId, botModel: normalizeBotModel(record.model), signal, channelId, botId });
    return { sessionId, created: true };
  }
  async function prompt({ sessionId, content, mode = "queue", requestId = randomUUID(), signal }) {
    if (!Array.isArray(content) || content.length === 0) {
      const error = new Error("prompt \u5185\u5BB9\u4E0D\u80FD\u4E3A\u7A7A\u3002");
      error.code = "chat/empty-prompt";
      throw error;
    }
    return invoke("session", "prompt", {
      request: { requestId, sessionId, mode, content }
    }, signal);
  }
  async function cancel({ channelId, botId, key, signal }) {
    const bound = store?.get(channelId, botId, key);
    activeTurns.get(`${channelId}:${botId}:${key}`)?.abort?.();
    if (!bound) return { accepted: false };
    try {
      return await invoke("session", "cancel", { request: { sessionId: bound.sessionId } }, signal);
    } catch (error) {
      if (error.code === "session/not-found") return { accepted: false };
      throw error;
    }
  }
  async function isRunning(sessionId, signal) {
    const result = await invoke("session", "list", { _request: {} }, signal);
    const item = Array.isArray(result?.items) ? result.items.find((entry) => entry?.sessionId === sessionId) : void 0;
    return item?.running === true;
  }
  async function rename3(sessionId, title, signal) {
    return invoke("session", "rename", { request: { sessionId, title } }, signal);
  }
  async function reset({ channelId, botId, key }) {
    await store.unbind(channelId, botId, key);
  }
  async function ask({
    channelId,
    botId,
    key,
    workspacePath,
    content,
    sourceGuidance,
    mode = "queue",
    signal,
    handlers = {},
    turnTimeoutMs,
    channelLabel: channelLabel2 = "",
    botLabel = "",
    onQueued
  }) {
    const queueKey = `${channelId}:${botId}:${key}`;
    const ahead = queueDepth.get(queueKey) ?? 0;
    queueDepth.set(queueKey, ahead + 1);
    let release;
    const mine = new Promise((resolve4) => {
      release = resolve4;
    });
    const previous = turnQueues.get(queueKey) ?? Promise.resolve();
    turnQueues.set(queueKey, previous.then(() => mine));
    if (ahead > 0) {
      try {
        onQueued?.(ahead);
      } catch (error) {
        logger.warn?.(`[dsh-chat] \u6392\u961F\u63D0\u793A\u56DE\u8C03\u5931\u8D25\uFF1A${error?.message ?? error}`);
      }
      logger.info?.(`[dsh-chat] \u56DE\u5408\u6392\u961F\uFF1A${queueKey} \u524D\u9762\u8FD8\u6709 ${ahead} \u6761`);
    }
    try {
      await previous;
    } catch {
    }
    let recovered = null;
    try {
      const runOnce = async () => {
        try {
          return await runTurn();
        } catch (error) {
          const failed2 = modelUnavailableOf(error);
          if (!failed2) throw error;
          return {
            sessionId: store?.get?.(channelId, botId, key)?.sessionId ?? null,
            text: "",
            reason: { kind: "error", error: sessionError(error) },
            tools: [],
            files: [],
            aborted: false,
            failed: failed2
          };
        }
      };
      let result = await runOnce();
      const failed = result?.failed ?? modelUnavailableOf(result?.reason?.error);
      if (failed && typeof result?.sessionId === "string" && result.sessionId) {
        const target = await recoverUnavailableModel({ sessionId: result.sessionId, failed, signal });
        if (target) {
          recovered = { failed, target };
          result = await runOnce();
        }
      }
      if (!recovered) return result;
      const notice = `\u26A0\uFE0F \u4F1A\u8BDD\u539F\u6765\u9009\u7684\u6A21\u578B ${recovered.failed.provider ?? "?"}/${recovered.failed.model ?? "?"} \u5DF2\u4E0D\u53EF\u7528\uFF0C\u5DF2\u81EA\u52A8\u5207\u5230 ${recovered.target.provider}/${recovered.target.model} \u5E76\u91CD\u8BD5\u4E86\u8FD9\u4E00\u8F6E\u3002`;
      return {
        ...result,
        text: `${notice}

${result.text ?? ""}`.trim(),
        recovered
      };
    } finally {
      const left = (queueDepth.get(queueKey) ?? 1) - 1;
      if (left <= 0) {
        queueDepth.delete(queueKey);
        turnQueues.delete(queueKey);
      } else {
        queueDepth.set(queueKey, left);
      }
      release();
    }
    async function runTurn() {
      const { sessionId } = await ensure({
        channelId,
        botId,
        key,
        workspacePath,
        signal,
        channelLabel: channelLabel2,
        botLabel
      });
      guidance?.publish?.(sessionId, sourceGuidance ?? "");
      const turnKey = `${channelId}:${botId}:${key}`;
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener?.("abort", abort, { once: true });
      activeTurns.set(turnKey, controller);
      const frames = await stream("session", "follow", {
        request: {
          address: { kind: "session", sessionId },
          maxMessages: 50,
          assistantStream: true
        }
      }, controller.signal);
      let cursor = -1;
      let promptSent = false;
      let closing = false;
      let currentTurn = null;
      const assistantText = /* @__PURE__ */ new Map();
      const tools = [];
      const presented = [];
      const presentCalls = [];
      let settled = false;
      let settle;
      const finished = new Promise((resolve4) => {
        settle = resolve4;
      });
      const finishTurn = (value) => {
        if (settled) return;
        settled = true;
        const reason = value?.reason?.kind ?? "unknown";
        const files = presented.length > 0 ? presented : presentCalls;
        logger.info?.(`[dsh-chat] \u56DE\u5408\u7ED3\u675F\uFF1A${turnKey} turn=${currentTurn} reason=${reason} \u6587\u672C=${(value?.text ?? "").length}\u5B57 \u5DE5\u5177=${value?.tools?.length ?? 0} \u4EA4\u4ED8\u6587\u4EF6=${files.length}`);
        settle({ ...value, files: [...files] });
      };
      const effectiveIdleTimeoutMs = Number.isFinite(turnTimeoutMs) && turnTimeoutMs > 0 ? turnTimeoutMs : TURN_IDLE_TIMEOUT_MS;
      const effectiveTotalTimeoutMs = Number.isFinite(turnTimeoutMs) && turnTimeoutMs > 0 ? Math.max(turnTimeoutMs * 6, TURN_TOTAL_TIMEOUT_MS) : TURN_TOTAL_TIMEOUT_MS;
      let lastProgressAt = Date.now();
      let idleTimer = null;
      const markProgress = () => {
        lastProgressAt = Date.now();
      };
      function armIdleTimer() {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(function tick() {
          const idleMs = Date.now() - lastProgressAt;
          if (idleMs >= effectiveIdleTimeoutMs) {
            finishTurn({
              sessionId,
              text: "",
              reason: { kind: "timeout", idleMs, idleTimeoutMs: effectiveIdleTimeoutMs },
              tools: [...tools],
              aborted: true
            });
            return;
          }
          idleTimer = setTimeout(tick, Math.max(1e3, effectiveIdleTimeoutMs - idleMs));
        }, effectiveIdleTimeoutMs);
        idleTimer.unref?.();
      }
      armIdleTimer();
      const totalTimer = setTimeout(() => {
        finishTurn({
          sessionId,
          text: "",
          reason: { kind: "timeout", timeoutMs: effectiveTotalTimeoutMs, idleMs: Date.now() - lastProgressAt },
          tools: [...tools],
          aborted: true
        });
      }, effectiveTotalTimeoutMs);
      totalTimer.unref?.();
      const pump = (async () => {
        try {
          for await (const frame of frames) {
            markProgress();
            if (frame?.type === "snapshot") {
              cursor = Number.isInteger(frame.cursor) ? frame.cursor : cursor;
              continue;
            }
            if (frame?.type === "assistant-stream") {
              const inner = frame.frame;
              if (inner?.type === "chunk" && inner.chunk?.type === "text-delta") {
                const text = deltaTextOf(inner.chunk);
                if (text) handlers.onDelta?.(text, inner);
              }
              handlers.onEvent?.(frame);
              continue;
            }
            const event = frame?.event;
            if (!event) continue;
            if (Number.isInteger(event.seq)) {
              if (event.seq <= cursor) continue;
              cursor = event.seq;
            }
            handlers.onEvent?.(event);
            switch (event.type) {
              case "turn/start":
                currentTurn = event.data?.turn ?? null;
                assistantText.set(currentTurn, []);
                handlers.onTurnStart?.(event);
                break;
              case "assistant/message": {
                const turn = event.data?.turn ?? currentTurn;
                const text = textOfAssistantMessage(event.data?.message);
                if (text) {
                  const bucket = assistantText.get(turn) ?? [];
                  bucket.push(text);
                  assistantText.set(turn, bucket);
                }
                handlers.onAssistantMessage?.(event, text);
                break;
              }
              case "tool/call":
                tools.push({ name: event.data?.name, arguments: event.data?.arguments });
                if (event.data?.name === "present") {
                  for (const file of filesOfPresentArgs(event.data?.arguments)) {
                    if (!presentCalls.some((seen) => seen.path === file.path)) presentCalls.push(file);
                  }
                }
                handlers.onToolCall?.(event);
                break;
              case "tool/result":
                handlers.onToolResult?.(event, tools.at(-1));
                break;
              case "deliverables/presented": {
                const files = Array.isArray(event.data?.files) ? event.data.files : [];
                const accepted = [];
                for (const file of files) {
                  if (typeof file?.path !== "string" || !file.path) continue;
                  accepted.push({
                    path: file.path,
                    ...typeof file.description === "string" && file.description ? { description: file.description } : {}
                  });
                }
                presented.push(...accepted);
                if (accepted.length > 0) handlers.onDeliverables?.(accepted);
                break;
              }
              case "turn/end": {
                const turn = event.data?.turn ?? currentTurn;
                const texts = assistantText.get(turn) ?? [];
                const merged = [];
                for (const piece of texts) {
                  const trimmed = String(piece ?? "").trim();
                  if (!trimmed || merged.at(-1) === trimmed) continue;
                  merged.push(trimmed);
                }
                const text = merged.join("\n\n").slice(0, MAX_ASSISTANT_TEXT);
                handlers.onTurnEnd?.(event, text);
                assistantText.delete(turn);
                if (promptSent) {
                  finishTurn({
                    sessionId,
                    text,
                    reason: event.data?.reason ?? null,
                    tools: [...tools],
                    aborted: false
                  });
                } else {
                  logger.info?.(`[dsh-chat] \u5FFD\u7565\u63D0\u793A\u8BCD\u4E4B\u524D\u7684 turn/end\uFF1A${turnKey} turn=${turn}`);
                }
                break;
              }
              default:
                break;
            }
          }
          finishTurn({
            sessionId,
            text: "",
            reason: { kind: "stream-ended" },
            tools: [...tools],
            files: [...presented],
            aborted: false
          });
        } catch (error) {
          const wasSettled = settled;
          finishTurn({
            sessionId,
            text: "",
            reason: { kind: "error", error: sessionError(error) },
            tools: [...tools],
            files: [...presented],
            aborted: true
          });
          if (wasSettled && !closing) {
            logger.warn?.(`[dsh-chat] \u4F1A\u8BDD ${sessionId} \u7684\u4E8B\u4EF6\u6D41\u4E2D\u65AD\uFF1A${error?.message ?? error}`);
          }
        }
      })();
      try {
        promptSent = true;
        logger.info?.(`[dsh-chat] \u53D1\u9001\u63D0\u793A\u8BCD\uFF1A${turnKey} \u4F1A\u8BDD=${sessionId} \u5185\u5BB9=${content.map((part) => part?.type ?? "?").join("+")} mode=${mode}`);
        const receiptFailure = prompt({ sessionId, content, mode, signal: controller.signal }).then(() => new Promise(() => {
        }), (error) => ({ error }));
        const first = await Promise.race([
          finished.then((value) => ({ value })),
          receiptFailure
        ]);
        if (first.error) throw first.error;
        return first.value;
      } finally {
        clearTimeout(totalTimer);
        if (idleTimer) clearTimeout(idleTimer);
        void markSessionChannel(sessionId, channelLabel2);
        signal?.removeEventListener?.("abort", abort);
        activeTurns.delete(turnKey);
        closing = true;
        try {
          controller.abort();
        } catch {
        }
        const closing0 = typeof frames?.return === "function" ? frames.return() : null;
        if (closing0) {
          let graceTimer;
          try {
            await Promise.race([
              Promise.resolve(closing0).catch(() => {
              }),
              // 故意不 unref：这是"让调用方拿到结果"的兜底时限，必须真的会到点。
              new Promise((resolve4) => {
                graceTimer = setTimeout(resolve4, STREAM_CLOSE_GRACE_MS);
              })
            ]);
          } finally {
            clearTimeout(graceTimer);
          }
        }
        void pump;
      }
    }
  }
  function installInteractionRelays() {
    if (typeof ctx?.on !== "function") {
      logger.warn?.("[dsh-chat] \u5F53\u524D Host \u4E0D\u652F\u6301\u4E8B\u4EF6\u8BA2\u9605\uFF0C\u5BA1\u6279/\u63D0\u95EE\u65E0\u6CD5\u56DE\u4F20\u5230 IM\u3002");
      return () => {
      };
    }
    const locateFor = (request) => {
      if (typeof interactions?.handle !== "function") return null;
      const sessionId = request?.agent?.session?.id;
      const located = store?.locate?.(sessionId);
      if (!located) return null;
      return interactions.has?.(located.channelId) ? located : null;
    };
    const offApproval = ctx.on("approval/request", async (request, next) => {
      const target = locateFor(request);
      logger.info?.(`[dsh-chat] \u6536\u5230\u5BA1\u6279\u8BF7\u6C42\uFF1A\u4F1A\u8BDD=${request?.agent?.session?.id ?? "\u672A\u77E5"} \u5DE5\u5177=${request?.toolName ?? "?"} \u8BA4\u9886=${target ? "\u662F" : "\u5426"}`);
      if (!target) return next();
      try {
        const outcome = await interactions.handle({
          kind: "approval",
          channelId: target.channelId,
          botId: target.botId,
          key: target.key,
          request
        });
        return outcome ?? next();
      } catch (error) {
        logger.warn?.(`[dsh-chat] \u5BA1\u6279\u56DE\u4F20\u5931\u8D25\uFF0C\u4EA4\u7531\u5176\u4ED6\u5E94\u7B54\u65B9\uFF1A${error?.message ?? error}`);
        return next();
      }
    }, { prepend: true });
    const offQuestions = ctx.on("user-questions/request", async (request, next) => {
      const target = locateFor(request);
      logger.info?.(`[dsh-chat] \u6536\u5230\u63D0\u95EE\u8BF7\u6C42\uFF1A\u4F1A\u8BDD=${request?.agent?.session?.id ?? "\u672A\u77E5"} \u95EE\u9898\u6570=${request?.questions?.length ?? 0} \u8BA4\u9886=${target ? "\u662F" : "\u5426"}`);
      if (!target) return next();
      try {
        const answers = await interactions.handle({
          kind: "question",
          channelId: target.channelId,
          botId: target.botId,
          key: target.key,
          request
        });
        if (!answers) return next();
        return answers;
      } catch (error) {
        logger.warn?.(`[dsh-chat] \u63D0\u95EE\u56DE\u4F20\u5931\u8D25\uFF0C\u4EA4\u7531\u5176\u4ED6\u5E94\u7B54\u65B9\uFF1A${error?.message ?? error}`);
        return next();
      }
    }, { prepend: true });
    return () => {
      try {
        offApproval?.();
      } catch {
      }
      try {
        offQuestions?.();
      } catch {
      }
    };
  }
  async function uploadFile({ sessionId, name: name2, bytes, signal }) {
    const service = typeof ctx?.get === "function" ? ctx.get("fileUploads") : void 0;
    if (typeof service?.uploadStream !== "function") {
      const error = new Error("\u5F53\u524D Host \u6CA1\u6709 fileUploads \u670D\u52A1\uFF0C\u65E0\u6CD5\u628A\u6587\u4EF6\u4EA4\u7ED9\u4F1A\u8BDD\u3002");
      error.code = "chat/upload-unavailable";
      throw error;
    }
    if (typeof sessionId !== "string" || !sessionId) {
      const error = new Error("\u4E0A\u4F20\u6587\u4EF6\u9700\u8981 sessionId\u3002");
      error.code = "chat/bad-request";
      throw error;
    }
    const data = bytes instanceof Uint8Array ? bytes : null;
    if (!data || data.byteLength === 0) {
      const error = new Error("\u4E0A\u4F20\u6587\u4EF6\u7684\u5185\u5BB9\u4E3A\u7A7A\u3002");
      error.code = "chat/bad-request";
      throw error;
    }
    try {
      return await service.uploadStream({
        sessionId,
        name: typeof name2 === "string" && name2.trim() ? name2.trim() : void 0,
        data: (async function* chunks() {
          yield data;
        })(),
        signal
      });
    } catch (error) {
      throw fileUploadFailure(error);
    }
  }
  async function history({ channelId, botId, key, maxMessages = 12, signal } = {}) {
    const bound = store?.get?.(channelId, botId, key);
    if (!bound?.sessionId) return { sessionId: null, messages: [] };
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) throw abortError(signal);
    signal?.addEventListener?.("abort", onAbort, { once: true });
    let frames = null;
    try {
      frames = await stream("session", "follow", {
        request: {
          address: { kind: "session", sessionId: bound.sessionId },
          maxMessages: Math.max(1, Math.min(50, maxMessages))
          // 注意：wire 上 `assistantStream` 只接受 `true`（或省略），传 false 会被
          // 边界校验直接拒掉。历史只需要 snapshot，所以这里不传。
        }
      }, controller.signal);
      let records = [];
      for await (const frame of frames) {
        if (frame?.type === "snapshot") {
          records = Array.isArray(frame.records) ? frame.records : [];
          break;
        }
      }
      return { sessionId: bound.sessionId, messages: historyMessagesOf(records, maxMessages) };
    } finally {
      controller.abort();
      signal?.removeEventListener?.("abort", onAbort);
      if (frames && typeof frames.return === "function") {
        const closing = Promise.resolve(frames.return()).catch(() => {
        });
        await Promise.race([
          closing,
          new Promise((resolve4) => {
            setTimeout(resolve4, STREAM_CLOSE_GRACE_MS);
          })
        ]);
      }
    }
  }
  async function runCommand({ channelId, botId, key, line: line2, signal } = {}) {
    const bound = store?.get?.(channelId, botId, key);
    if (!bound?.sessionId) {
      const error = new Error("\u5F53\u524D\u804A\u5929\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF08\u5148\u53D1\u4E00\u6761\u6D88\u606F\u5373\u53EF\u521B\u5EFA\uFF09\u3002");
      error.code = "chat/session-required";
      throw error;
    }
    const result = await invoke("commands", "execute", {
      agentId: bound.sessionId,
      line: line2,
      submittedAttachments: []
    }, signal);
    if (result === void 0 || result === null) return { matched: false };
    return {
      matched: true,
      commandId: result.commandId,
      kind: result.result?.kind ?? "error",
      text: result.result?.text ?? ""
    };
  }
  return Object.freeze({
    invoke,
    stream,
    uploadFile,
    resolveWorkspaceId,
    sessionExists,
    ensure,
    prompt,
    ask,
    cancel,
    isRunning,
    rename: rename3,
    markSessionChannel,
    boundSessions,
    reset,
    history,
    runCommand,
    /** 会话绑定表：渠道可用它接管旧实现的绑定（`adopt`）。 */
    bindings: store,
    installInteractionRelays
  });
}

// packages/dsh-chat/host/tools.mjs
var OUTPUT_TEXT = Object.freeze({
  schema: { type: "string" },
  render: (_args, value) => [{ type: "text", text: typeof value === "string" ? value : String(value) }]
});
var CHANNEL_FIELD = {
  type: "string",
  description: "\u6E20\u9053 id\uFF0C\u4F8B\u5982 feishu\uFF08\u98DE\u4E66\uFF09\u6216 weixin\uFF08\u5FAE\u4FE1\uFF09\u3002\u7701\u7565\u65F6\u5148\u5217\u51FA\u5DF2\u5B89\u88C5\u7684\u6E20\u9053\u3002"
};
var BOT_FIELD = {
  type: "string",
  description: "\u673A\u5668\u4EBA/\u8D26\u53F7 id\uFF08\u5728\u8BBE\u7F6E\u9875\u7684\u673A\u5668\u4EBA\u5361\u7247\u4E0A\u53EF\u89C1\uFF0C\u4F8B\u5982 bot_1f4c\u2026 / wx_0f2d\u2026\uFF09\u3002\u7701\u7565\u65F6\u5217\u51FA\u8BE5\u6E20\u9053\u4E0B\u7684\u673A\u5668\u4EBA\u53CA\u5176\u53EF\u6295\u9012\u76EE\u6807\u3002"
};
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
function describeFileFailure(error, args) {
  const code = error?.code ?? "";
  const message = error?.message ?? String(error);
  if (code === "chat/unknown-target") {
    return `\u76EE\u6807 ${args.target_id} \u8FD8\u6CA1\u6709\u4FDD\u5B58\uFF0C\u65E0\u6CD5\u53D1\u9001\u3002\u5148\u7528 chat_targets \u67E5\u770B\u5019\u9009\uFF0C\u518D\u7528 chat_save_target \u4FDD\u5B58\uFF0C\u6216\u8BF7\u7528\u6237\u5230\u8BBE\u7F6E\u9875\u4FDD\u5B58\u3002`;
  }
  if (code === "chat/file-not-found") {
    return `${message}\u3002\u8BF7\u786E\u8BA4\u8DEF\u5F84\uFF08\u76F8\u5BF9\u8DEF\u5F84\u6309\u8BE5\u673A\u5668\u4EBA\u7684\u5DE5\u4F5C\u533A\u89E3\u6790\uFF09\uFF0C\u6216\u5148\u81EA\u5DF1\u751F\u6210\u8FD9\u4E2A\u6587\u4EF6\u3002`;
  }
  if (code === "chat/file-too-large") {
    return `${message}\u3002\u53EF\u4EE5\u628A\u5185\u5BB9\u62C6\u5C0F\u3001\u538B\u7F29\uFF0C\u6216\u6539\u6210\u751F\u6210\u540E\u5206\u591A\u6B21\u53D1\u9001\u3002`;
  }
  if (code === "chat/delivery-unsupported") {
    return `${message}\uFF08\u8BE5\u6E20\u9053\u8FD8\u6CA1\u5B9E\u73B0\u53D1\u9001\u6587\u4EF6\uFF0C\u53EF\u4EE5\u5148\u628A\u7ED3\u679C\u4F5C\u4E3A\u6587\u672C\u53D1\u51FA\u53BB\uFF09\u3002`;
  }
  return `\u53D1\u9001\u6587\u4EF6\u5931\u8D25\uFF1A${code} ${message}`.trim();
}
function targetLine(target) {
  const route = Object.entries(target.route).map(([key, value]) => `${key}=${value}`).join(", ");
  return `${target.id}	${target.kind === "group" ? "\u7FA4\u804A" : "\u79C1\u804A"}	${target.name || "\uFF08\u672A\u547D\u540D\uFF09"}	${route}${target.discovered ? "	\u5019\u9009\uFF08\u9700\u5148\u4FDD\u5B58\u624D\u80FD\u53D1\uFF09" : ""}`;
}
function describeTargets(result) {
  if (!result.canSend) return `\u8BE5\u6E20\u9053\u4E0D\u652F\u6301\u4E3B\u52A8\u6295\u9012\uFF0C\u65E0\u6CD5\u5411\u5B83\u53D1\u9001\u6D88\u606F\u3002`;
  if (result.targets.length === 0) {
    return "\u8BE5\u673A\u5668\u4EBA\u8FD8\u6CA1\u6709\u53EF\u6295\u9012\u7684\u76EE\u6807\uFF1A\u5148\u5728\u8BBE\u7F6E\u9875\u91CC\u4FDD\u5B58\u4E00\u4E2A\uFF0C\u6216\u5148\u4E0E\u5B83\u5BF9\u8BDD\u8FC7\uFF08\u5BF9\u8BDD\u8FC7\u7684\u4F1A\u8BDD\u4F1A\u88AB\u53D1\u73B0\u4E3A\u5019\u9009\uFF09\u3002";
  }
  return [
    `\u53EF\u6295\u9012\u76EE\u6807\uFF08\u5171 ${result.targets.length} \u4E2A\uFF09\uFF1A`,
    "id	\u7C7B\u578B	\u540D\u79F0	\u8DEF\u7531	\u72B6\u6001",
    ...result.targets.map(targetLine)
  ].join("\n");
}
function describeChannels(entries, botsOf) {
  if (entries.length === 0) return "\u5F53\u524D\u6CA1\u6709\u5B89\u88C5\u4EFB\u4F55\u804A\u5929\u6E20\u9053\u3002";
  const lines = entries.map((entry) => {
    const bots = botsOf(entry.id);
    const status = entry.status === "running" ? "\u8FD0\u884C\u4E2D" : `${entry.status}${entry.error?.code ? `\uFF08${entry.error.code}\uFF09` : ""}`;
    return `${entry.id}	${entry.label}	${status}	\u673A\u5668\u4EBA ${bots.length} \u4E2A`;
  });
  return [
    `\u5DF2\u5B89\u88C5\u6E20\u9053\uFF08\u5171 ${entries.length} \u4E2A\uFF09\uFF1A`,
    "id	\u540D\u79F0	\u72B6\u6001	\u673A\u5668\u4EBA",
    ...lines,
    "\u4E0B\u4E00\u6B65\uFF1A\u5E26\u4E0A channel_id \u518D\u8C03\u4E00\u6B21 chat_targets\uFF0C\u5373\u53EF\u770B\u5230\u8BE5\u6E20\u9053\u4E0B\u7684\u673A\u5668\u4EBA\u4E0E\u53EF\u6295\u9012\u76EE\u6807\u3002"
  ].join("\n");
}
async function describeBots(channelId, records, delivery) {
  if (records.length === 0) {
    return `${channelId} \u4E0B\u8FD8\u6CA1\u6709\u673A\u5668\u4EBA\uFF1A\u8BF7\u5148\u5728\u8BBE\u7F6E\u9875\u91CC\u6DFB\u52A0\u6216\u767B\u5F55\u4E00\u4E2A\uFF0C\u518D\u6765\u67E5\u8BE2\u53EF\u6295\u9012\u76EE\u6807\u3002`;
  }
  const blocks = [`${channelId} \u4E0B\u7684\u673A\u5668\u4EBA\uFF08\u5171 ${records.length} \u4E2A\uFF09\uFF1A`];
  for (const record of records) {
    const listed = await delivery.list({ channelId, botId: record.botId });
    blocks.push("", `[${record.botId}]`, describeTargets(listed));
  }
  return blocks.join("\n");
}
function registerChatTools(toolCtx, { delivery, channels, bots, logger = console } = {}) {
  if (typeof toolCtx?.tools?.register !== "function") {
    throw new TypeError("\u6CE8\u518C\u804A\u5929\u5DE5\u5177\u9700\u8981 Cordis \u7684 tools \u670D\u52A1\u3002");
  }
  if (!delivery?.send) throw new TypeError("\u6CE8\u518C\u804A\u5929\u5DE5\u5177\u9700\u8981\u6295\u9012\u670D\u52A1\u3002");
  const listChannels = () => typeof channels?.list === "function" ? channels.list() : [];
  const listBots = (channelId) => typeof bots?.list === "function" ? bots.list(channelId) : [];
  const disposers = [];
  disposers.push(toolCtx.tools.register({
    name: "chat_targets",
    description: "\u67E5\u8BE2\u67D0\u4E2A\u804A\u5929\u673A\u5668\u4EBA\u53EF\u4EE5\u4E3B\u52A8\u6295\u9012\u7684\u4F1A\u8BDD\uFF08\u5DF2\u4FDD\u5B58\u7684\u76EE\u6807 + \u4ECE\u5386\u53F2\u4F1A\u8BDD\u53D1\u73B0\u7684\u5019\u9009\uFF09\u3002\u7701\u7565 channel_id \u5148\u5217\u51FA\u5DF2\u5B89\u88C5\u6E20\u9053\uFF1B\u7701\u7565 bot_id \u5217\u51FA\u8BE5\u6E20\u9053\u7684\u673A\u5668\u4EBA\u4E0E\u76EE\u6807\u3002\u9700\u8981\u628A\u7ED3\u679C\u53D1\u5230\u98DE\u4E66/\u5FAE\u4FE1\u65F6\uFF0C\u5148\u7528\u5B83\u786E\u8BA4\u76EE\u6807 id\u3002",
    parameters: {
      type: "object",
      properties: { channel_id: CHANNEL_FIELD, bot_id: BOT_FIELD },
      additionalProperties: false
    },
    output: OUTPUT_TEXT,
    async execute(args) {
      const channelId = typeof args.channel_id === "string" && args.channel_id.trim() ? args.channel_id.trim() : null;
      const botId = typeof args.bot_id === "string" && args.bot_id.trim() ? args.bot_id.trim() : null;
      if (!channelId) return describeChannels(listChannels(), listBots);
      if (!listChannels().some((entry) => entry.id === channelId)) {
        return `\u6CA1\u6709\u5B89\u88C5\u540D\u4E3A ${channelId} \u7684\u6E20\u9053\u3002\u5DF2\u5B89\u88C5\uFF1A${listChannels().map((entry) => entry.id).join("\u3001") || "\uFF08\u65E0\uFF09"}\u3002`;
      }
      if (!botId) return describeBots(channelId, listBots(channelId), delivery);
      return describeTargets(await delivery.list({ channelId, botId }));
    }
  }));
  disposers.push(toolCtx.tools.register({
    name: "chat_send",
    description: "\u628A\u4E00\u6BB5\u6587\u672C\u4E3B\u52A8\u53D1\u9001\u5230\u6307\u5B9A\u804A\u5929\u673A\u5668\u4EBA\u7684\u6307\u5B9A\u4F1A\u8BDD\uFF08\u76EE\u6807\u5FC5\u987B\u5DF2\u5728\u8BBE\u7F6E\u91CC\u4FDD\u5B58\uFF09\u3002\u9002\u5408\u628A\u62A5\u8868\u3001\u4EFB\u52A1\u7ED3\u679C\u63A8\u7ED9\u7528\u6237\u3002\u8FD4\u56DE\u53D1\u9001\u7ED3\u679C\uFF1B\u5931\u8D25\u4F1A\u8BF4\u660E\u539F\u56E0\u3002",
    parameters: {
      type: "object",
      properties: {
        channel_id: CHANNEL_FIELD,
        bot_id: BOT_FIELD,
        target_id: {
          type: "string",
          description: "chat_targets \u5217\u51FA\u7684\u76EE\u6807 id\uFF08\u53EA\u80FD\u662F\u5DF2\u4FDD\u5B58\u7684\u76EE\u6807\uFF0C\u4E0D\u80FD\u662F\u5019\u9009\uFF09\u3002"
        },
        text: { type: "string", description: "\u8981\u53D1\u9001\u7684\u6B63\u6587\uFF08\u7EAF\u6587\u672C\uFF09\u3002" }
      },
      required: ["channel_id", "bot_id", "target_id", "text"],
      additionalProperties: false
    },
    output: OUTPUT_TEXT,
    async execute(args) {
      try {
        const result = await delivery.send({
          channelId: args.channel_id,
          botId: args.bot_id,
          targetId: args.target_id,
          text: args.text
        });
        const messageId = result?.messageId ?? result?.providerMessageIds?.[0] ?? null;
        return `\u5DF2\u53D1\u9001\u5230 ${args.target_id}${messageId ? `\uFF08\u6D88\u606F id ${messageId}\uFF09` : ""}\u3002`;
      } catch (error) {
        if (error?.code === "chat/unknown-target") {
          return `\u76EE\u6807 ${args.target_id} \u8FD8\u6CA1\u6709\u4FDD\u5B58\uFF0C\u65E0\u6CD5\u53D1\u9001\u3002\u5148\u7528 chat_targets \u67E5\u770B\u5019\u9009\uFF0C\u518D\u7528 chat_save_target \u4FDD\u5B58\uFF0C\u6216\u8BF7\u7528\u6237\u5230\u8BBE\u7F6E\u9875\u4FDD\u5B58\u3002`;
        }
        return `\u53D1\u9001\u5931\u8D25\uFF1A${error?.code ?? ""} ${error?.message ?? String(error)}`.trim();
      }
    }
  }));
  disposers.push(toolCtx.tools.register({
    name: "chat_send_file",
    description: "\u628A\u4E00\u4E2A\u672C\u5730\u6587\u4EF6\uFF08\u62A5\u8868\u3001Excel\u3001\u56FE\u7247\u7B49\uFF0C\u226430MB\uFF09\u53D1\u5230\u6307\u5B9A\u804A\u5929\u673A\u5668\u4EBA\u7684\u6307\u5B9A\u4F1A\u8BDD\u3002\u76EE\u6807\u5FC5\u987B\u5DF2\u5728\u8BBE\u7F6E\u91CC\u4FDD\u5B58\uFF1B\u76F8\u5BF9\u8DEF\u5F84\u6309\u8BE5\u673A\u5668\u4EBA\u7684\u5DE5\u4F5C\u533A\u89E3\u6790\u3002\u9002\u5408\u628A\u751F\u6210\u597D\u7684\u7ED3\u679C\u6587\u4EF6\u76F4\u63A5\u63A8\u7ED9\u7528\u6237\u3002",
    parameters: {
      type: "object",
      properties: {
        channel_id: CHANNEL_FIELD,
        bot_id: BOT_FIELD,
        target_id: {
          type: "string",
          description: "chat_targets \u5217\u51FA\u7684\u76EE\u6807 id\uFF08\u53EA\u80FD\u662F\u5DF2\u4FDD\u5B58\u7684\u76EE\u6807\uFF0C\u4E0D\u80FD\u662F\u5019\u9009\uFF09\u3002"
        },
        path: {
          type: "string",
          description: "\u8981\u53D1\u9001\u7684\u6587\u4EF6\u8DEF\u5F84\uFF08\u7EDD\u5BF9\u8DEF\u5F84\uFF0C\u6216\u76F8\u5BF9\u8BE5\u673A\u5668\u4EBA\u5DE5\u4F5C\u533A\u7684\u8DEF\u5F84\uFF09\u3002"
        },
        name: { type: "string", description: "\u5BF9\u65B9\u770B\u5230\u7684\u6587\u4EF6\u540D\uFF08\u53EF\u9009\uFF0C\u9ED8\u8BA4\u53D6\u6587\u4EF6\u540D\uFF09\u3002" }
      },
      required: ["channel_id", "bot_id", "target_id", "path"],
      additionalProperties: false
    },
    output: OUTPUT_TEXT,
    async execute(args) {
      try {
        const result = await delivery.sendFile({
          channelId: args.channel_id,
          botId: args.bot_id,
          targetId: args.target_id,
          path: args.path,
          name: args.name
        });
        const size = result?.size ? `\uFF08${formatBytes(result.size)}\uFF09` : "";
        const messageId = result?.messageId ?? null;
        return `\u5DF2\u53D1\u9001\u6587\u4EF6 ${result?.name ?? args.path}${size} \u5230 ${args.target_id}${messageId ? `\uFF08\u6D88\u606F id ${messageId}\uFF09` : ""}\u3002`;
      } catch (error) {
        return describeFileFailure(error, args);
      }
    }
  }));
  disposers.push(toolCtx.tools.register({
    name: "chat_save_target",
    description: '\u628A\u4E00\u4E2A"\u5019\u9009"\u4F1A\u8BDD\u4FDD\u5B58\u4E3A\u53EF\u6295\u9012\u76EE\u6807\uFF08\u53EA\u80FD\u4FDD\u5B58 chat_targets \u91CC\u6807\u8BB0\u4E3A\u5019\u9009\u7684\u76EE\u6807\uFF0C\u5373\u8BE5\u673A\u5668\u4EBA\u5386\u53F2\u4E0A\u771F\u5B9E\u5BF9\u8BDD\u8FC7\u7684\u4F1A\u8BDD\uFF09\u3002\u4FDD\u5B58\u540E\u5373\u53EF\u7528 chat_send \u53D1\u9001\u3002',
    parameters: {
      type: "object",
      properties: {
        channel_id: CHANNEL_FIELD,
        bot_id: BOT_FIELD,
        target_id: { type: "string", description: "chat_targets \u91CC\u6807\u8BB0\u4E3A\u5019\u9009\u7684\u76EE\u6807 id\u3002" },
        name: { type: "string", description: "\u7ED9\u8FD9\u4E2A\u76EE\u6807\u8D77\u7684\u540D\u5B57\uFF08\u53EF\u9009\uFF09\u3002" }
      },
      required: ["channel_id", "bot_id", "target_id"],
      additionalProperties: false
    },
    output: OUTPUT_TEXT,
    async execute(args) {
      const listed = await delivery.list({ channelId: args.channel_id, botId: args.bot_id });
      const candidate = listed.targets.find((t) => t.id === args.target_id);
      if (!candidate) {
        return `\u6CA1\u6709\u627E\u5230\u5019\u9009 ${args.target_id}\uFF08\u5DF2\u4FDD\u5B58\u7684\u76EE\u6807\u65E0\u9700\u91CD\u590D\u4FDD\u5B58\uFF09\u3002`;
      }
      if (!candidate.discovered) {
        return `\u76EE\u6807 ${args.target_id} \u5DF2\u7ECF\u4FDD\u5B58\u8FC7\u4E86\u3002`;
      }
      const saved = await delivery.save({
        channelId: args.channel_id,
        botId: args.bot_id,
        target: {
          id: candidate.id,
          name: args.name ?? candidate.name,
          kind: candidate.kind,
          route: candidate.route
        }
      });
      logger.info?.(`[dsh-chat] agent \u4FDD\u5B58\u4E86\u6295\u9012\u76EE\u6807 ${saved.id}\uFF08${args.channel_id}/${args.bot_id}\uFF09`);
      return `\u5DF2\u4FDD\u5B58\u76EE\u6807 ${saved.id}\uFF08${saved.kind === "group" ? "\u7FA4\u804A" : "\u79C1\u804A"} \xB7 ${saved.name || "\u672A\u547D\u540D"}\uFF09\uFF0C\u73B0\u5728\u53EF\u4EE5\u7528 chat_send \u53D1\u9001\u3002`;
    }
  }));
  return () => {
    for (const dispose of disposers.reverse()) {
      try {
        dispose?.();
      } catch (error) {
        logger.warn?.(`[dsh-chat] \u6CE8\u9500\u804A\u5929\u5DE5\u5177\u5931\u8D25\uFF1A${error?.message ?? error}`);
      }
    }
  };
}

// packages/dsh-chat/host/plugin.mjs
var name = "dsh-chat-host";
var inject = ["connection", "credentials", "typertGateway"];
var CHANNEL_ID = /^[a-z][a-z0-9-]{1,31}$/;
var BOT_ID = /^[A-Za-z0-9_@.:+-]{1,256}$/;
function channelDataDirOverride(config, channelId) {
  const value = config?.channelDataDirs?.[channelId];
  return typeof value === "string" && value.trim() ? resolve3(value.trim()) : null;
}
function resolveLogger(ctx, scope) {
  const logger = ctx?.logger;
  if (typeof logger === "function") {
    try {
      return logger(scope);
    } catch {
    }
  }
  return logger ?? console;
}
function provideService(ctx, serviceName, value) {
  if (typeof ctx?.provide === "function") return ctx.provide(serviceName, value);
  if (typeof ctx?.reflect?.provide === "function") return ctx.reflect.provide(serviceName, value);
  throw new TypeError("dsh-chat \u9700\u8981 Cordis \u7684 provide \u80FD\u529B\u6765\u53D1\u5E03 dshChat \u670D\u52A1\u3002");
}
function isPlainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validBotPayload(payload, options = {}) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false;
  const allowed = options.withConfig ? ["channelId", "botId", "config"] : ["channelId", "botId", ...options.extra ?? []];
  const keys = Object.keys(payload);
  if (keys.length < allowed.length - (options.optional?.length ?? 0) || keys.length > allowed.length) {
    return false;
  }
  if (!keys.every((key) => allowed.includes(key))) return false;
  if (!allowed.filter((key) => !options.optional?.includes(key)).every((key) => Object.hasOwn(payload, key))) {
    return false;
  }
  if (typeof payload.channelId !== "string" || !CHANNEL_ID.test(payload.channelId)) return false;
  if (typeof payload.botId !== "string" || !BOT_ID.test(payload.botId)) return false;
  if (!options.withConfig) return true;
  return payload.config !== null && typeof payload.config === "object" && !Array.isArray(payload.config);
}
function apply(ctx, config = {}) {
  const baseLogger = resolveLogger(ctx, "dsh-chat");
  const integrations = integrationRoot(config.integrationRoot);
  const logsDir = join5(hubDataDir(config.dataDir), "logs");
  const hubLog = createLogFileSink({ path: channelLogPath(logsDir, "hub") });
  const logger = withFileSink({ logger: baseLogger, sink: hubLog, scope: "dsh-chat" });
  const settings = createBotSettingsStore({ dataDir: hubDataDir(config.dataDir), logger });
  const legacyDirs = /* @__PURE__ */ new Map();
  const guidance = createGuidanceRegistry();
  const sessionStore = createSessionStore({ dataDir: hubDataDir(config.dataDir), logger });
  const interactions = createInteractionService({ logger });
  const sessions = createSessionBridge({
    ctx,
    logger,
    store: sessionStore,
    settings,
    guidance,
    interactions
  });
  const rpc = createRpcCarrier(ctx, { logger });
  const delivery = createDeliveryService({ settings, sessionStore, logger });
  const optionalAgentPresets = typeof ctx.get === "function" ? ctx.get("agentPresets") : void 0;
  const panel = createPanelService({
    settings,
    sessions,
    sessionStore,
    agentPresets: optionalAgentPresets,
    logger,
    /**
     * 渠道自带的面板字段（飞书的「任务过程展示」）走这条：hub 不认识渠道语义，
     * 只把 `panel.fields` / `panel.apply` 透传给渠道，渠道没实现就当没有这类设置。
     */
    channelRpc: (channelId, method, payload) => registry.handleRpc(channelId, method, payload)
  });
  function storageFor(channelId) {
    return Object.freeze({
      read: (botId) => settings.read(channelId, botId),
      write: (botId, patch) => settings.write(channelId, botId, patch),
      list: () => settings.list(channelId)
    });
  }
  const registry = createChannelRegistry({
    logger,
    rpc,
    onDelivery: (channelId, provider) => delivery.attach(channelId, provider),
    /**
     * 渠道注册后按 `legacy.dir` 做一次性旧设置导入（只读旧文件，绝不改写）。
     * 旧数据目录沿用 dsh-im 的命名，因此用户现有绑定与设置零迁移。
     */
    onRegistered: (channelId, legacy) => {
      const overridden = channelDataDirOverride(config, channelId);
      if (overridden) {
        legacyDirs.set(channelId, overridden);
        return;
      }
      if (!legacy?.dir) return;
      const dir = channelDataDir(legacy.dir, integrations);
      legacyDirs.set(channelId, dir);
      void settings.importLegacy(channelId, dir).catch((error) => {
        logger.warn?.(`[dsh-chat] \u6E20\u9053 ${channelId} \u65E7\u8BBE\u7F6E\u5BFC\u5165\u5931\u8D25\uFF1A${error?.message ?? error}`);
      });
    },
    createDeps: (channelId, definition) => Object.freeze({
      channelId,
      // 渠道的每一行日志同时进 <channelId>.log，排查时我能直接读文件。
      logger: withFileSink({
        logger: resolveLogger(ctx, `dsh-chat:${channelId}`),
        sink: createLogFileSink({ path: channelLogPath(logsDir, channelId) }),
        scope: `dsh-chat-${channelId}`
      }),
      credentials: ctx.credentials,
      /**
       * 渠道历史数据目录（沿用 dsh-im 命名，保证零重绑）。
       * `config.channelDataDirs[channelId]` 可显式覆盖——隔离调试或想同时跑两份时用。
       */
      dataDir: channelDataDirOverride(config, channelId) ?? (definition.legacy?.dir ? channelDataDir(definition.legacy.dir, integrations) : hubDataDir(config.dataDir)),
      resolveDataDir: (name2) => channelDataDir(name2, integrations),
      storage: storageFor(channelId),
      /**
       * 渠道自建存储用的 JSON 文档工厂：原子写、首次覆盖备份、串行队列、变更订阅
       * 由 hub 统一实现，渠道不必各写一遍。
       */
      createJsonStore,
      /** 读取设置前先 await 它，避免启动竞态读到空文档。 */
      ready: () => settings.ready(),
      contextEnhancement: context_enhancement_exports,
      /** 访问策略：渠道用它判定放行与命令权限（属主绕过由渠道传入 isOwner）。 */
      accessPolicy: Object.freeze({ ...access_policy_exports }),
      /** 机器人命令：渠道把入站文本交进来即可，命令实现只在 hub 一份。 */
      commands: Object.freeze({
        handle: (options) => commands.handle(options),
        list: () => commands.list()
      }),
      guidance,
      sessions,
      /**
       * 控制面板：渠道的可交互卡片用它读"当前值 + 可选项"、并应用用户的选择。
       * `read({channelId, botId, key})` / `apply({channelId, botId, key, field, value})`。
       */
      panel,
      /** 渠道接入 IM 回传（提问/审批）：attach({ channelId, botId, send })。 */
      interactions: Object.freeze({
        attach: (options) => interactions.attach(options),
        offer: (options) => interactions.offer(options),
        has: (channelId2) => interactions.has(channelId2)
      })
    })
  });
  const commands = createCommandRegistry({
    logger,
    services: {
      sessions,
      bots: {
        read: (channelId, botId) => settings.read(channelId, botId),
        write: (channelId, botId, patch) => settings.write(channelId, botId, patch)
      },
      channels: { list: () => registry.list() },
      agentPresets: optionalAgentPresets,
      // `/diag`：把设置页那份诊断现场用文字回出来（手机上排查不必开电脑）。
      diagnostics: { read: () => collectDiagnostics() },
      // `/menu` 用它取"当前值 + 可选项"，卡片据此渲染下拉、渠道不必自己拼状态。
      panel
    }
  });
  registerBuiltinCommands(commands, { hubVersion: HUB_VERSION, listCommands: () => commands.list() });
  async function collectDiagnostics() {
    const entries = registry.list();
    const channels = await Promise.all(entries.map(async (entry) => {
      const result = await registry.handleRpc(entry.id, "connection.status", {});
      return {
        id: entry.id,
        label: entry.label,
        version: entry.version ?? null,
        status: entry.status,
        error: entry.error ?? null,
        bots: result?.ok === true ? result.value?.bots ?? [] : [],
        statusError: result?.ok === true ? null : result.error?.message ?? "\u72B6\u6001\u8BFB\u53D6\u5931\u8D25"
      };
    }));
    const logs = await Promise.all(["hub", ...entries.map((entry) => entry.id)].map((logName) => readLogTail(channelLogPath(logsDir, logName))));
    return {
      dataDir: hubDataDir(config.dataDir),
      logDir: logsDir,
      channels,
      logs
    };
  }
  async function controlHandler(method, payload) {
    if (method === "channel.list") {
      if (payload !== null && (typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length > 0)) {
        return fail("chat/bad-request", "channel.list \u4E0D\u63A5\u53D7\u53C2\u6570\u3002");
      }
      return ok({
        contractVersion: CONTRACT_VERSION,
        // 「版本与更新」面板要的三个层次：hub 版本、渠道契约版本、各渠道包版本。
        hubVersion: HUB_VERSION,
        hubPackage: "dsh-chat",
        dataDir: hubDataDir(config.dataDir),
        logDir: logsDir,
        channels: registry.list()
      });
    }
    if (method === "diagnostics.read") {
      if (payload !== null && (typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length > 0)) {
        return fail("chat/bad-request", "diagnostics.read \u4E0D\u63A5\u53D7\u53C2\u6570\u3002");
      }
      return ok(await collectDiagnostics());
    }
    if (method === "bot.settings.get") {
      if (!validBotPayload(payload)) return fail("chat/bad-request", "bot.settings.get \u9700\u8981 channelId \u4E0E botId\u3002");
      await settings.ready();
      return ok({ settings: settings.read(payload.channelId, payload.botId) });
    }
    if (method === "bot.context-enhancement.set") {
      if (!validBotPayload(payload, { withConfig: true })) {
        return fail("chat/bad-request", "bot.context-enhancement.set \u9700\u8981 channelId\u3001botId \u4E0E config\u3002");
      }
      try {
        const config2 = validateContextConfig(payload.config);
        const saved = await settings.write(payload.channelId, payload.botId, {
          contextEnhancement: config2
        });
        return ok({ contextEnhancement: saved.contextEnhancement });
      } catch (error) {
        return failFrom(error, "chat/context-enhancement-failed");
      }
    }
    if (method === "bot.settings.options") {
      if (!validBotPayload(payload)) {
        return fail("chat/bad-request", "bot.settings.options \u9700\u8981 channelId \u4E0E botId\u3002");
      }
      await settings.ready();
      const record = settings.read(payload.channelId, payload.botId);
      const workspacePaths = workspaceCandidates({
        record,
        sessionStore,
        channelId: payload.channelId,
        botId: payload.botId
      });
      let presets = [];
      if (typeof optionalAgentPresets?.remoteExportList === "function") {
        try {
          presets = (await optionalAgentPresets.remoteExportList())?.presets ?? [];
        } catch (error) {
          logger.warn?.(`[dsh-chat] \u8BFB\u53D6 Agent Preset \u5217\u8868\u5931\u8D25\uFF1A${error?.message ?? error}`);
        }
      }
      let models = [];
      let hostDefault = null;
      let modelFailures = [];
      try {
        const catalog = await readModelCatalog(sessions, logger);
        models = catalog.options;
        hostDefault = catalog.hostDefault;
        modelFailures = catalog.failures;
      } catch (error) {
        logger.warn?.(`[dsh-chat] \u8BFB\u53D6\u6A21\u578B\u5217\u8868\u5931\u8D25\uFF1A${error?.message ?? error}`);
        modelFailures = [{ id: "", name: "\u6A21\u578B\u76EE\u5F55", message: String(error?.message ?? error) }];
      }
      return ok({
        workspacePaths,
        presets,
        models,
        hostDefault,
        modelFailures,
        current: {
          workspace: record.workspace ?? null,
          agentPreset: record.agentPreset ?? null,
          accessPolicy: record.accessPolicy ?? null,
          model: normalizeBotModel(record.model)
        }
      });
    }
    if (method === "bot.workspace.set") {
      if (!validBotPayload(payload, { extra: ["workspace"] })) {
        return fail("chat/bad-request", "bot.workspace.set \u9700\u8981 channelId\u3001botId \u4E0E workspace\u3002");
      }
      const raw = payload.workspace;
      if (raw !== null && typeof raw !== "string") {
        return fail("chat/bad-request", "workspace \u53EA\u80FD\u662F\u7EDD\u5BF9\u8DEF\u5F84\u6216 null\u3002");
      }
      if (raw === null || !raw.trim()) {
        const saved2 = await settings.write(payload.channelId, payload.botId, { workspace: null });
        return ok({ workspace: saved2.workspace ?? null });
      }
      const target = resolve3(raw.trim());
      let info;
      try {
        info = await stat5(target);
      } catch (error) {
        return fail("chat/workspace-invalid", `\u76EE\u5F55\u4E0D\u5B58\u5728\u6216\u8BFB\u4E0D\u5230\uFF1A${target}\uFF08${error?.code ?? error?.message}\uFF09`);
      }
      if (!info.isDirectory()) return fail("chat/workspace-invalid", `\u4E0D\u662F\u76EE\u5F55\uFF1A${target}`);
      const saved = await settings.write(payload.channelId, payload.botId, { workspace: target });
      return ok({ workspace: saved.workspace ?? null });
    }
    if (method === "bot.agent-preset.set") {
      if (!validBotPayload(payload, { extra: ["agentPreset"] })) {
        return fail("chat/bad-request", "bot.agent-preset.set \u9700\u8981 channelId\u3001botId \u4E0E agentPreset\u3002");
      }
      const raw = payload.agentPreset;
      if (raw !== null && typeof raw !== "string") {
        return fail("chat/bad-request", "agentPreset \u53EA\u80FD\u662F\u9884\u8BBE id \u6216 null\u3002");
      }
      const target = typeof raw === "string" && raw.trim() ? raw.trim() : null;
      if (target && typeof optionalAgentPresets?.remoteExportList === "function") {
        let known = [];
        try {
          known = ((await optionalAgentPresets.remoteExportList())?.presets ?? []).map((row) => row.id);
        } catch (error) {
          return fail("chat/preset-unavailable", `\u8BFB\u4E0D\u5230 Agent Preset \u5217\u8868\uFF1A${error?.message ?? error}`);
        }
        if (!known.includes(target)) {
          return fail("chat/unknown-preset", `\u5F53\u524D Host \u6CA1\u6709\u8FD9\u4E2A Agent Preset\uFF1A${target}`);
        }
      }
      const saved = await settings.write(payload.channelId, payload.botId, { agentPreset: target });
      return ok({ agentPreset: saved.agentPreset ?? null });
    }
    if (method === "bot.model.set") {
      if (!validBotPayload(payload, { extra: ["model"] })) {
        return fail("chat/bad-request", "bot.model.set \u9700\u8981 channelId\u3001botId \u4E0E model\u3002");
      }
      const raw = payload.model;
      if (raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
        return fail("chat/bad-request", "model \u53EA\u80FD\u662F { provider, model, reasoningEffort? } \u6216 null\u3002");
      }
      const target = raw === null ? null : normalizeBotModel(raw);
      if (raw !== null && !target) {
        return fail("chat/bad-request", "model \u9700\u8981\u975E\u7A7A\u7684 provider \u4E0E model\u3002");
      }
      if (target) {
        try {
          const { options } = await readModelCatalog(sessions, logger);
          if (options.length > 0) {
            const found = options.find((item) => item.provider === target.provider && item.model === target.model);
            if (!found) {
              return fail("chat/unknown-model", `\u5F53\u524D Host \u6CA1\u6709\u8FD9\u4E2A\u6A21\u578B\uFF1A${target.provider}/${target.model}`);
            }
            if (target.reasoningEffort && !found.efforts.some((effort) => effort.id === target.reasoningEffort)) {
              return fail(
                "chat/unknown-effort",
                `\u6A21\u578B ${found.value} \u4E0D\u652F\u6301\u63A8\u7406\u7B49\u7EA7 ${target.reasoningEffort}\u3002`
              );
            }
          }
        } catch (error) {
          logger.warn?.(`[dsh-chat] \u6821\u9A8C\u673A\u5668\u4EBA\u9ED8\u8BA4\u6A21\u578B\u65F6\u8BFB\u4E0D\u5230\u6A21\u578B\u76EE\u5F55\uFF0C\u6309\u539F\u503C\u4FDD\u5B58\uFF1A${error?.message ?? error}`);
        }
      }
      const saved = await settings.write(payload.channelId, payload.botId, { model: target });
      return ok({ model: normalizeBotModel(saved.model) });
    }
    if (method === "bot.access-policy.set") {
      if (!validBotPayload(payload, { extra: ["policy"] })) {
        return fail("chat/bad-request", "bot.access-policy.set \u9700\u8981 channelId\u3001botId \u4E0E policy\u3002");
      }
      try {
        const policy = payload.policy === null ? null : validateAccessPolicy(payload.policy);
        const saved = await settings.write(payload.channelId, payload.botId, { accessPolicy: policy });
        return ok({ accessPolicy: saved.accessPolicy ?? null });
      } catch (error) {
        return failFrom(error, "chat/access-policy-failed");
      }
    }
    if (method === "bot.conversations") {
      if (!validBotPayload(payload)) {
        return fail("chat/bad-request", "bot.conversations \u9700\u8981 channelId \u4E0E botId\u3002");
      }
      try {
        const listed = await delivery.list({ channelId: payload.channelId, botId: payload.botId });
        return ok({
          conversations: listed.targets.map((target) => ({
            id: target.id,
            name: target.name ?? target.id,
            kind: target.kind,
            route: target.route,
            saved: target.discovered !== true
          }))
        });
      } catch (error) {
        return failFrom(error, "chat/conversations-failed");
      }
    }
    if (method === "maintenance.import-legacy") {
      const valid = payload !== null && typeof payload === "object" && !Array.isArray(payload) && Object.keys(payload).length === 2 && typeof payload.channelId === "string" && CHANNEL_ID.test(payload.channelId) && typeof payload.force === "boolean";
      if (!valid) {
        return fail("chat/bad-request", "maintenance.import-legacy \u9700\u8981 { channelId, force }\u3002");
      }
      const dir = legacyDirs.get(payload.channelId);
      if (!dir) return fail("chat/no-legacy", `\u6E20\u9053 ${payload.channelId} \u6CA1\u6709\u58F0\u660E\u65E7\u6570\u636E\u76EE\u5F55\u3002`);
      try {
        return ok(await settings.importLegacy(payload.channelId, dir, { force: payload.force }));
      } catch (error) {
        return failFrom(error, "chat/import-failed");
      }
    }
    if (method === "delivery.list") {
      if (!validBotPayload(payload)) return fail("chat/bad-request", "delivery.list \u9700\u8981 channelId \u4E0E botId\u3002");
      return ok(await delivery.list({ channelId: payload.channelId, botId: payload.botId }));
    }
    if (method === "delivery.save") {
      if (!isPlainRecord(payload) || typeof payload.channelId !== "string" || typeof payload.botId !== "string" || !isPlainRecord(payload.target)) {
        return fail("chat/bad-request", "delivery.save \u9700\u8981 { channelId, botId, target }\u3002");
      }
      try {
        const saved = await delivery.save({
          channelId: payload.channelId,
          botId: payload.botId,
          target: payload.target
        });
        return ok({ target: saved });
      } catch (error) {
        return failFrom(error, "chat/delivery-save-failed");
      }
    }
    if (method === "delivery.target.rename") {
      if (!validBotPayload(payload, { extra: ["targetId", "name"] }) || typeof payload.targetId !== "string" || typeof payload.name !== "string") {
        return fail("chat/bad-request", "delivery.target.rename \u9700\u8981 { channelId, botId, targetId, name }\u3002");
      }
      try {
        const renamed = await delivery.rename({
          channelId: payload.channelId,
          botId: payload.botId,
          targetId: payload.targetId,
          name: payload.name
        });
        return ok({ target: renamed });
      } catch (error) {
        return failFrom(error, "chat/delivery-rename-failed");
      }
    }
    if (method === "delivery.remove") {
      if (!validBotPayload(payload, { extra: ["targetId"] }) || typeof payload.targetId !== "string") {
        return fail("chat/bad-request", "delivery.remove \u9700\u8981 { channelId, botId, targetId }\u3002");
      }
      return ok({ removed: await delivery.remove({
        channelId: payload.channelId,
        botId: payload.botId,
        targetId: payload.targetId
      }) });
    }
    if (method === "delivery.sendFile") {
      if (!validBotPayload(payload, { extra: ["targetId", "path", "name"], optional: ["name"] }) || typeof payload.targetId !== "string" || typeof payload.path !== "string" || payload.name !== void 0 && typeof payload.name !== "string") {
        return fail("chat/bad-request", "delivery.sendFile \u9700\u8981 { channelId, botId, targetId, path, name? }\u3002");
      }
      try {
        return ok(await delivery.sendFile({
          channelId: payload.channelId,
          botId: payload.botId,
          targetId: payload.targetId,
          path: payload.path,
          name: payload.name
        }));
      } catch (error) {
        return failFrom(error, "chat/delivery-failed");
      }
    }
    if (method === "delivery.send") {
      if (!validBotPayload(payload, { extra: ["targetId", "text"] }) || typeof payload.targetId !== "string" || typeof payload.text !== "string") {
        return fail("chat/bad-request", "delivery.send \u9700\u8981 { channelId, botId, targetId, text }\u3002");
      }
      try {
        return ok(await delivery.send({
          channelId: payload.channelId,
          botId: payload.botId,
          targetId: payload.targetId,
          text: payload.text
        }));
      } catch (error) {
        return failFrom(error, "chat/delivery-failed");
      }
    }
    return fail("chat/unknown-method", `\u63A7\u5236\u7AEF\u70B9\u4E0D\u652F\u6301 ${method}\u3002`);
  }
  void settings.ready().catch((error) => {
    logger.warn?.(`[dsh-chat] \u521D\u59CB\u5316\u6BCF\u673A\u5668\u4EBA\u8BBE\u7F6E\u5931\u8D25\uFF1A${error?.message ?? error}`);
  });
  void sessionStore.ready().catch((error) => {
    logger.warn?.(`[dsh-chat] \u521D\u59CB\u5316\u4F1A\u8BDD\u7ED1\u5B9A\u8868\u5931\u8D25\uFF1A${error?.message ?? error}`);
  });
  const service = Object.freeze({
    contractVersion: CONTRACT_VERSION,
    /**
     * 渠道包注册自己的实现。
     *
     * @param definition - { id, label, order, createChannel, legacy? }。
     * @returns 同步注销函数。
     */
    registerChannel: (definition) => registry.register(definition),
    /** 渠道注册表：只读视图 + 进程内分派（诊断/CLI 用，省掉走浏览器 RPC）。 */
    channels: Object.freeze({
      list: () => registry.list(),
      subscribe: (listener) => registry.subscribe(listener),
      call: (channelId, method, payload, signal) => registry.handleRpc(
        channelId,
        method,
        payload,
        signal
      )
    }),
    /** 每机器人设置的磁盘文档就绪信号；渠道读取设置前应 await 它。 */
    ready: () => settings.ready(),
    bots: Object.freeze({
      read: (channelId, botId) => settings.read(channelId, botId),
      write: (channelId, botId, patch) => settings.write(channelId, botId, patch),
      list: (channelId) => settings.list(channelId),
      subscribe: (listener) => settings.subscribe(listener),
      storageFor
    }),
    /** 机器人命令：渠道把入站文本交进来，拿回要回复的文本。 */
    commands: Object.freeze({
      handle: (options) => commands.handle(options),
      list: () => commands.list()
    }),
    /** 主动投递：定时任务/脚本用 `send` 把结果推到指定会话。 */
    delivery: Object.freeze({
      send: (options) => delivery.send(options),
      sendFile: (options) => delivery.sendFile(options),
      list: (options) => delivery.list(options),
      save: (options) => delivery.save(options),
      remove: (options) => delivery.remove(options),
      supports: (channelId) => delivery.supports(channelId),
      supportsFile: (channelId) => delivery.supportsFile(channelId)
    }),
    contextEnhancement: Object.freeze({ ...context_enhancement_exports }),
    guidance: Object.freeze({
      publish: (sessionId, text) => guidance.publish(sessionId, text),
      forget: (sessionId) => guidance.forget(sessionId)
    }),
    sessions,
    /**
     * 控制面板（服务面同样暴露一份）：渠道的可交互卡片用它读"当前值 + 可选项"、
     * 并应用用户的选择。`read({channelId,botId,key})` / `apply({channelId,botId,key,field,value})`。
     */
    panel
  });
  ctx.effect(() => {
    const disposeProvide = provideService(ctx, HOST_SERVICE, service);
    return () => {
      registry.disposeAll();
      rpc.disposeAll();
      if (typeof disposeProvide === "function") disposeProvide();
    };
  }, "dsh-chat: host service");
  ctx.effect(() => rpc.register(CONTROL_CHANNEL_ID, controlHandler), "dsh-chat: control rpc");
  if (typeof ctx.inject === "function") {
    ctx.inject(["tools"], (toolCtx) => {
      toolCtx.effect(
        () => registerChatTools(toolCtx, {
          delivery,
          // agent 需要先"发现"渠道与机器人，才能拿到投递目标，因此把只读视图一并给它。
          channels: { list: () => registry.list() },
          bots: { list: (channelId) => settings.list(channelId) },
          logger
        }),
        "dsh-chat: agent tools"
      );
    });
  } else {
    logger.warn?.("[dsh-chat] \u5F53\u524D\u4E0A\u4E0B\u6587\u4E0D\u652F\u6301 ctx.inject\uFF0Cchat_targets/chat_send/chat_save_target \u672A\u6CE8\u518C\uFF08agent \u65E0\u6CD5\u4E3B\u52A8\u53D1\u6D88\u606F\uFF09\u3002");
  }
  ctx.effect(() => sessions.installInteractionRelays(), "dsh-chat: \u5BA1\u6279\u4E0E\u63D0\u95EE\u56DE\u4F20");
  logger.info?.(`[dsh-chat] hub \u5DF2\u5C31\u7EEA\uFF08\u5951\u7EA6 v${CONTRACT_VERSION}\uFF09\uFF0C\u7B49\u5F85\u6E20\u9053\u63D2\u4EF6\u6CE8\u518C\u3002`);
}
export {
  apply,
  inject,
  name
};
