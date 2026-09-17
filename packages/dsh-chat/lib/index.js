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
import { resolve as resolve2 } from "node:path";

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
  const { id, label, order, createChannel, legacy } = definition;
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
  const resolveLabel = typeof label === "function" ? label : () => label;
  return Object.freeze({
    id,
    label: resolveLabel,
    order,
    createChannel,
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
  defaultAccessPolicy: () => defaultAccessPolicy,
  describeAccessScope: () => describeAccessScope,
  evaluateAccess: () => evaluateAccess,
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
    const open = isPlainObject2(source.open) ? source.open : {};
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
        defaultCanExecuteCommands: open.defaultCanExecuteCommands === true,
        commandPermissionOverrides: usersOf(open.commandPermissionOverrides)
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
          const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
          await writeFile(`${path}.bak-${stamp}`, previous, "utf8");
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

// packages/dsh-chat/host/commands.mjs
var PREFIX = "/";
var MAX_LINE = 120;
function line(text) {
  const value = String(text ?? "").replace(/\s+$/u, "");
  return value.length > MAX_LINE ? `${value.slice(0, MAX_LINE)}\u2026` : value;
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
      const reply = await command.execute(context);
      return { handled: true, reply: reply ?? "" };
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
    for (const model of group.models ?? []) {
      rows.push({
        provider: group.provider ?? group.providerId,
        providerName: group.providerName ?? group.displayName ?? group.provider,
        model: model.id ?? model.model,
        name: model.name ?? model.id,
        efforts: model.reasoning?.efforts ?? [],
        defaultEffort: model.reasoning?.defaultEffort ?? null
      });
    }
  }
  return { catalog, rows };
}
function findModel(rows, token) {
  const byIndex = indexOf(token);
  if (byIndex !== null) return rows[byIndex] ?? null;
  const [provider, model] = String(token).split("/");
  if (!provider || !model) return null;
  return rows.find((row) => row.provider === provider && row.model === model) ?? null;
}
function registerBuiltinCommands(registry, { hubVersion = "0.0.1" } = {}) {
  registry.register({
    name: "help",
    aliases: ["h"],
    summary: "\u663E\u793A\u673A\u5668\u4EBA\u652F\u6301\u7684\u547D\u4EE4\u4E0E\u7528\u6CD5",
    execute: () => {
      const rows = registry.list().map((command) => line(`${command.usage} \u2014 ${command.summary}`));
      return ["\u53EF\u7528\u547D\u4EE4\uFF1A", ...rows].join("\n");
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
        `\u6A21\u578B\uFF1A${record.model ? `${record.model.providerId ?? record.model.provider}/${record.model.modelId ?? record.model.model}` : "\u8DDF\u968F Host \u9ED8\u8BA4"}`,
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
      const exists = await services.sessions.sessionExists(target).catch(() => false);
      if (!exists) return `\u627E\u4E0D\u5230\u4F1A\u8BDD ${target}\u3002`;
      await services.sessions.bindings.bind(context.channelId, context.botId, context.key, {
        sessionId: target
      });
      return `\u5DF2\u5207\u6362\u5230\u4F1A\u8BDD ${target}\u3002`;
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
      if (context.args.length === 0) {
        if (!sessionId) return "\u5F53\u524D\u804A\u5929\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF1B\u5148\u53D1\u4E00\u6761\u6D88\u606F\uFF0C\u6216\u7528 /model \u5728\u5DF2\u6709\u4F1A\u8BDD\u91CC\u5207\u6362\u3002";
        const rows2 = await context.services.sessions.invoke("session", "list", { _request: {} }).catch(() => null);
        const item = rows2?.items?.find((entry) => entry.sessionId === sessionId);
        const selection = item?.projections?.values?.modelSelection;
        return selection ? `\u5F53\u524D\u6A21\u578B\uFF1A${selection.provider}/${selection.model}${selection.reasoningEffort ? `\uFF08\u63A8\u7406\u7B49\u7EA7 ${selection.reasoningEffort}\uFF09` : ""}` : "\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u663E\u5F0F\u9009\u62E9\u6A21\u578B\uFF08\u8DDF\u968F Host \u9ED8\u8BA4\uFF09\u3002";
      }
      if (!sessionId) return "\u5F53\u524D\u804A\u5929\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF0C\u65E0\u6CD5\u5207\u6362\u6A21\u578B\uFF1B\u5148\u53D1\u4E00\u6761\u6D88\u606F\u3002";
      const { rows } = await modelCatalog(context);
      const target = findModel(rows, context.args[0]);
      if (!target) return `\u627E\u4E0D\u5230\u6A21\u578B ${context.args[0]}\uFF1B\u7528 /models \u67E5\u770B\u53EF\u7528\u5217\u8868\u3002`;
      const effort = context.args[1];
      if (effort && !target.efforts.some((item) => item.id === effort)) {
        return `\u6A21\u578B ${target.provider}/${target.model} \u4E0D\u652F\u6301\u63A8\u7406\u7B49\u7EA7 ${effort}\u3002`;
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
      if (context.args.length === 0) {
        if (!sessionId) return "\u5F53\u524D\u804A\u5929\u8FD8\u6CA1\u6709\u4F1A\u8BDD\u3002";
        const list2 = await context.services.sessions.invoke("session", "list", { _request: {} }).catch(() => null);
        const item2 = list2?.items?.find((entry) => entry.sessionId === sessionId);
        const selection2 = item2?.projections?.values?.modelSelection;
        if (!selection2) return "\u5F53\u524D\u4F1A\u8BDD\u6CA1\u6709\u663E\u5F0F\u9009\u62E9\u6A21\u578B\u3002";
        return `\u5F53\u524D\u6A21\u578B ${selection2.provider}/${selection2.model}\uFF0C\u63A8\u7406\u7B49\u7EA7 ${selection2.reasoningEffort ?? "\uFF08\u9ED8\u8BA4\uFF09"}\u3002`;
      }
      if (!sessionId) return "\u5F53\u524D\u804A\u5929\u8FD8\u6CA1\u6709\u4F1A\u8BDD\uFF0C\u65E0\u6CD5\u5207\u6362\u63A8\u7406\u7B49\u7EA7\uFF1B\u5148\u53D1\u4E00\u6761\u6D88\u606F\u3002";
      const list = await context.services.sessions.invoke("session", "list", { _request: {} }).catch(() => null);
      const item = list?.items?.find((entry) => entry.sessionId === sessionId);
      const selection = item?.projections?.values?.modelSelection;
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
var TARGET_ID = /^[A-Za-z0-9_-]{1,64}$/;
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
  const { id, name: name2, kind, route } = input;
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
  return Object.freeze({ id, name: label, kind, route: normalizeRoute(route) });
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
function createDeliveryService({ settings, logger = console }) {
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
    /** @returns 该渠道是否具备主动投递能力。 */
    supports: (channelId) => providers.has(channelId),
    /** @returns 已保存的投递目标（含渠道发现的候选，候选不落盘）。 */
    async list({ channelId, botId }) {
      const saved = normalizeStoredTargets(settings.read(channelId, botId).deliveryTargets);
      const provider = providers.get(channelId);
      let discovered = [];
      if (typeof provider?.discover === "function") {
        try {
          discovered = await provider.discover({ botId });
        } catch (error) {
          logger.warn?.(`[dsh-chat] \u6E20\u9053 ${channelId} \u53D1\u73B0\u6295\u9012\u76EE\u6807\u5931\u8D25\uFF1A${error?.message ?? error}`);
        }
      }
      const candidates = [];
      for (const candidate of Array.isArray(discovered) ? discovered : []) {
        try {
          const target = normalizeTarget(candidate);
          if (!saved[target.id]) candidates.push(Object.freeze({ ...target, discovered: true }));
        } catch {
        }
      }
      return Object.freeze({
        targets: Object.freeze([...Object.values(saved), ...candidates]),
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

// packages/dsh-chat/host/paths.mjs
import { homedir } from "node:os";
import { join as join2, resolve } from "node:path";
function dshHome() {
  const configured = process.env.DSH_HOME;
  return configured && configured.trim() ? resolve(configured.trim()) : join2(homedir(), ".dsh");
}
function hubDataDir(configured) {
  return configured && String(configured).trim() ? resolve(String(configured).trim()) : join2(dshHome(), "integrations", "dsh-chat");
}
function channelDataDir(name2, integrationRoot2) {
  return join2(integrationRoot2 ?? join2(dshHome(), "integrations"), name2);
}
function integrationRoot(configured) {
  return configured && String(configured).trim() ? resolve(String(configured).trim()) : join2(dshHome(), "integrations");
}

// packages/dsh-chat/host/session-store.mjs
import { join as join3 } from "node:path";
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
    path: join3(dataDir, "sessions.json"),
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
function sessionError(error, fallbackCode = "chat/session-failed") {
  const code = typeof error?.code === "string" ? error.code : fallbackCode;
  const wrapped = new Error(typeof error?.message === "string" && error.message ? error.message : "\u4F1A\u8BDD\u64CD\u4F5C\u5931\u8D25\u3002");
  wrapped.code = code;
  wrapped.details = error?.details ?? {};
  return wrapped;
}
function textOfAssistantMessage(message) {
  const content = message?.content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text).join("");
}
function deltaTextOf(chunk) {
  if (typeof chunk?.text === "string") return chunk.text;
  if (typeof chunk?.delta === "string") return chunk.delta;
  return "";
}
function createSessionBridge({ ctx, logger = console, store, guidance }) {
  const gateway = ctx?.typertGateway;
  if (typeof gateway?.invoke !== "function") {
    throw new TypeError("\u4F1A\u8BDD\u6865\u9700\u8981 context \u7684 typertGateway.invoke\uFF08\u8BF7\u5728 inject \u4E2D\u58F0\u660E\uFF09\u3002");
  }
  const interactionHandlers = /* @__PURE__ */ new Map();
  const activeTurns = /* @__PURE__ */ new Map();
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
  async function resolveWorkspaceId(path, signal) {
    const result = await invoke("workspace", "create", { request: { path } }, signal);
    const workspaceId = result?.workspace?.workspaceId;
    if (typeof workspaceId !== "string" || !workspaceId) {
      const error = new Error("DSH \u672A\u8FD4\u56DE\u5DE5\u4F5C\u533A\u6807\u8BC6\u3002");
      error.code = "chat/workspace-unresolved";
      throw error;
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
  async function ensure({ channelId, botId, key, workspacePath, signal }) {
    if (!store) throw new TypeError("\u4F1A\u8BDD\u6865\u7F3A\u5C11\u4F1A\u8BDD\u7ED1\u5B9A\u8868\u3002");
    const existing = store.get(channelId, botId, key);
    if (existing) {
      if (await sessionExists(existing.sessionId, signal)) {
        return { sessionId: existing.sessionId, created: false };
      }
      await store.unbind(channelId, botId, key);
    }
    if (typeof workspacePath !== "string" || !workspacePath.trim()) {
      const error = new Error("\u8BE5\u673A\u5668\u4EBA\u8FD8\u6CA1\u6709\u8BBE\u7F6E\u5DE5\u4F5C\u533A\uFF0C\u65E0\u6CD5\u521B\u5EFA\u4F1A\u8BDD\u3002");
      error.code = "chat/workspace-required";
      throw error;
    }
    const workspaceId = await resolveWorkspaceId(workspacePath, signal);
    const created = await invoke("session", "create", { request: { workspaceId } }, signal);
    const sessionId = created?.sessionId;
    if (typeof sessionId !== "string" || !sessionId) {
      const error = new Error("DSH \u672A\u8FD4\u56DE\u4F1A\u8BDD\u6807\u8BC6\u3002");
      error.code = "chat/session-unresolved";
      throw error;
    }
    await store.bind(channelId, botId, key, { sessionId, workspacePath });
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
  async function rename2(sessionId, title, signal) {
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
    turnTimeoutMs
  }) {
    const { sessionId } = await ensure({ channelId, botId, key, workspacePath, signal });
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
    let currentTurn = null;
    const assistantText = /* @__PURE__ */ new Map();
    const tools = [];
    let settled = false;
    let settle;
    const finished = new Promise((resolve3) => {
      settle = resolve3;
    });
    const effectiveTurnTimeoutMs = Number.isFinite(turnTimeoutMs) && turnTimeoutMs > 0 ? turnTimeoutMs : 10 * 6e4;
    const timeoutTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      settle({
        sessionId,
        text: "",
        reason: { kind: "timeout", timeoutMs: effectiveTurnTimeoutMs },
        tools: [...tools],
        aborted: true
      });
    }, effectiveTurnTimeoutMs);
    timeoutTimer.unref?.();
    const pump = (async () => {
      try {
        for await (const frame of frames) {
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
              handlers.onToolCall?.(event);
              break;
            case "tool/result":
              handlers.onToolResult?.(event, tools.at(-1));
              break;
            case "turn/end": {
              const turn = event.data?.turn ?? currentTurn;
              const texts = assistantText.get(turn) ?? [];
              const text = (texts.at(-1) ?? "").slice(0, MAX_ASSISTANT_TEXT);
              handlers.onTurnEnd?.(event, text);
              assistantText.delete(turn);
              if (promptSent && !settled) {
                settled = true;
                settle({
                  sessionId,
                  text,
                  reason: event.data?.reason ?? null,
                  tools: [...tools],
                  aborted: false
                });
              }
              break;
            }
            default:
              break;
          }
        }
        if (!settled) {
          settled = true;
          settle({
            sessionId,
            text: "",
            reason: { kind: "stream-ended" },
            tools: [...tools],
            aborted: false
          });
        }
      } catch (error) {
        if (!settled) {
          settled = true;
          settle({
            sessionId,
            text: "",
            reason: { kind: "error", error: sessionError(error) },
            tools: [...tools],
            aborted: true
          });
        } else {
          logger.warn?.(`[dsh-chat] \u4F1A\u8BDD ${sessionId} \u7684\u4E8B\u4EF6\u6D41\u4E2D\u65AD\uFF1A${error?.message ?? error}`);
        }
      }
    })();
    try {
      promptSent = true;
      await prompt({ sessionId, content, mode, signal: controller.signal });
      const result = await finished;
      return result;
    } finally {
      clearTimeout(timeoutTimer);
      signal?.removeEventListener?.("abort", abort);
      activeTurns.delete(turnKey);
      try {
        await frames?.return?.();
      } catch {
      }
      void pump;
    }
  }
  function registerInteractionHandler(channelId, handle) {
    if (typeof handle !== "function") throw new TypeError("\u4EA4\u4E92\u5904\u7406\u5668\u5FC5\u987B\u662F\u51FD\u6570\u3002");
    interactionHandlers.set(channelId, handle);
    return () => {
      if (interactionHandlers.get(channelId) === handle) interactionHandlers.delete(channelId);
    };
  }
  function installInteractionRelays() {
    if (typeof ctx?.on !== "function") {
      logger.warn?.("[dsh-chat] \u5F53\u524D Host \u4E0D\u652F\u6301\u4E8B\u4EF6\u8BA2\u9605\uFF0C\u5BA1\u6279/\u63D0\u95EE\u65E0\u6CD5\u56DE\u4F20\u5230 IM\u3002");
      return () => {
      };
    }
    const locateFor = (request) => {
      const sessionId = request?.agent?.session?.id;
      const located = store?.locate?.(sessionId);
      if (!located) return null;
      const handle = interactionHandlers.get(located.channelId);
      return handle ? { ...located, handle } : null;
    };
    const offApproval = ctx.on("approval/request", async (request, next) => {
      const target = locateFor(request);
      if (!target) return next();
      try {
        return await target.handle({
          kind: "approval",
          channelId: target.channelId,
          botId: target.botId,
          key: target.key,
          request
        });
      } catch (error) {
        logger.warn?.(`[dsh-chat] \u5BA1\u6279\u56DE\u4F20\u5931\u8D25\uFF0C\u4EA4\u7531\u5176\u4ED6\u5E94\u7B54\u65B9\uFF1A${error?.message ?? error}`);
        return next();
      }
    });
    const offQuestions = ctx.on("user-questions/request", async (request, next) => {
      const target = locateFor(request);
      if (!target) return next();
      try {
        const answers = await target.handle({
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
    });
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
  return Object.freeze({
    invoke,
    stream,
    resolveWorkspaceId,
    sessionExists,
    ensure,
    prompt,
    ask,
    cancel,
    isRunning,
    rename: rename2,
    reset,
    /** 会话绑定表：渠道可用它接管旧实现的绑定（`adopt`）。 */
    bindings: store,
    registerInteractionHandler,
    installInteractionRelays
  });
}

// packages/dsh-chat/host/plugin.mjs
var name = "dsh-chat-host";
var inject = ["connection", "credentials", "typertGateway"];
var CHANNEL_ID = /^[a-z][a-z0-9-]{1,31}$/;
var BOT_ID = /^[A-Za-z0-9_@.:+-]{1,256}$/;
function channelDataDirOverride(config, channelId) {
  const value = config?.channelDataDirs?.[channelId];
  return typeof value === "string" && value.trim() ? resolve2(value.trim()) : null;
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
function validBotPayload(payload, { withConfig = false } = {}) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false;
  const allowed = withConfig ? ["channelId", "botId", "config"] : ["channelId", "botId"];
  if (Object.keys(payload).length !== allowed.length) return false;
  if (!allowed.every((key) => Object.hasOwn(payload, key))) return false;
  if (typeof payload.channelId !== "string" || !CHANNEL_ID.test(payload.channelId)) return false;
  if (typeof payload.botId !== "string" || !BOT_ID.test(payload.botId)) return false;
  if (!withConfig) return true;
  return payload.config !== null && typeof payload.config === "object" && !Array.isArray(payload.config);
}
function apply(ctx, config = {}) {
  const logger = resolveLogger(ctx, "dsh-chat");
  const integrations = integrationRoot(config.integrationRoot);
  const settings = createBotSettingsStore({ dataDir: hubDataDir(config.dataDir), logger });
  const legacyDirs = /* @__PURE__ */ new Map();
  const guidance = createGuidanceRegistry();
  const sessionStore = createSessionStore({ dataDir: hubDataDir(config.dataDir), logger });
  const sessions = createSessionBridge({ ctx, logger, store: sessionStore, guidance });
  const rpc = createRpcCarrier(ctx, { logger });
  const delivery = createDeliveryService({ settings, logger });
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
      logger: resolveLogger(ctx, `dsh-chat:${channelId}`),
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
      sessions
    })
  });
  const optionalAgentPresets = typeof ctx.get === "function" ? ctx.get("agentPresets") : void 0;
  const commands = createCommandRegistry({
    logger,
    services: {
      sessions,
      bots: {
        read: (channelId, botId) => settings.read(channelId, botId),
        write: (channelId, botId, patch) => settings.write(channelId, botId, patch)
      },
      channels: { list: () => registry.list() },
      agentPresets: optionalAgentPresets
    }
  });
  registerBuiltinCommands(commands, { hubVersion: HUB_VERSION });
  async function controlHandler(method, payload) {
    if (method === "channel.list") {
      if (payload !== null && (typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length > 0)) {
        return fail("chat/bad-request", "channel.list \u4E0D\u63A5\u53D7\u53C2\u6570\u3002");
      }
      return ok({ contractVersion: CONTRACT_VERSION, channels: registry.list() });
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
    if (method === "delivery.remove") {
      if (!validBotPayload(payload) || typeof payload.targetId !== "string") {
        return fail("chat/bad-request", "delivery.remove \u9700\u8981 { channelId, botId, targetId }\u3002");
      }
      return ok({ removed: await delivery.remove({
        channelId: payload.channelId,
        botId: payload.botId,
        targetId: payload.targetId
      }) });
    }
    if (method === "delivery.send") {
      if (!validBotPayload(payload) || typeof payload.targetId !== "string" || typeof payload.text !== "string") {
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
      list: (options) => delivery.list(options),
      save: (options) => delivery.save(options),
      remove: (options) => delivery.remove(options),
      supports: (channelId) => delivery.supports(channelId)
    }),
    contextEnhancement: Object.freeze({ ...context_enhancement_exports }),
    guidance: Object.freeze({
      publish: (sessionId, text) => guidance.publish(sessionId, text),
      forget: (sessionId) => guidance.forget(sessionId)
    }),
    sessions
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
  ctx.effect(() => sessions.installInteractionRelays(), "dsh-chat: \u5BA1\u6279\u4E0E\u63D0\u95EE\u56DE\u4F20");
  logger.info?.(`[dsh-chat] hub \u5DF2\u5C31\u7EEA\uFF08\u5951\u7EA6 v${CONTRACT_VERSION}\uFF09\uFF0C\u7B49\u5F85\u6E20\u9053\u63D2\u4EF6\u6CE8\u518C\u3002`);
}
export {
  apply,
  inject,
  name
};
