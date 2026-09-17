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

// packages/dsh-chat/shared/contract.mjs
var CONTRACT_VERSION = 1;
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
var CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
var CONTROL_CHARACTER_TEST = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
var KNOWN_CHANNELS = /* @__PURE__ */ new Set(["feishu", "weixin"]);
function invalid(message) {
  const error = new TypeError(message);
  error.code = "context-enhancement-invalid";
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
function offlineText(value, maxLength) {
  return typeof value === "string" ? value.replace(CONTROL_CHARACTERS, "").slice(0, maxLength) : "";
}
function validateScope(input, where) {
  if (!hasExactKeys(input, SCOPE_KEYS)) throw invalid(`${where}\u8BBE\u7F6E\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u4FDD\u5B58\u3002`);
  const { enabled, fields, guidance } = input;
  if (typeof enabled !== "boolean") throw invalid(`${where}\u7684\u542F\u7528\u5F00\u5173\u5FC5\u987B\u662F\u5E03\u5C14\u503C\u3002`);
  if (!Array.isArray(fields) || !fields.every((field) => CONTEXT_FIELDS.includes(field))) {
    throw invalid(`${where}\u7684\u6765\u6E90\u5B57\u6BB5\u53EA\u80FD\u4ECE\u5DF2\u5B9A\u4E49\u7684\u516B\u4E2A\u5B57\u6BB5\u4E2D\u9009\u62E9\u3002`);
  }
  if (typeof guidance !== "string" || guidance.length > GUIDANCE_MAX_LENGTH) {
    throw invalid(`${where}\u7684\u589E\u5F3A\u63D0\u793A\u8BCD\u4E0D\u5F97\u8D85\u8FC7 ${GUIDANCE_MAX_LENGTH} \u4E2A\u5B57\u7B26\u3002`);
  }
  return Object.freeze({
    enabled,
    fields: Object.freeze(CONTEXT_FIELDS.filter((field) => fields.includes(field))),
    guidance: guidance.trim() ? guidance : ""
  });
}
function validateTarget(input) {
  if (!hasExactKeys(input, TARGET_KEYS)) throw invalid("\u6307\u5B9A\u8BBE\u7F6E\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u4FDD\u5B58\u3002");
  const {
    kind,
    id,
    label,
    enabled,
    fields,
    guidance,
    merge
  } = input;
  if (!TARGET_KINDS.includes(kind)) throw invalid('\u6307\u5B9A\u8BBE\u7F6E\u7684\u7C7B\u578B\u53EA\u80FD\u662F"\u6307\u5B9A\u7528\u6237"\u6216"\u6307\u5B9A\u7FA4"\u3002');
  const targetId = typeof id === "string" ? id.trim() : "";
  if (!targetId || targetId.length > TARGET_ID_MAX_LENGTH || CONTROL_CHARACTER_TEST.test(targetId) || /\s/.test(targetId)) {
    throw invalid("\u6307\u5B9A\u8BBE\u7F6E\u7684\u6807\u8BC6\u4E0D\u80FD\u4E3A\u7A7A\u3001\u4E0D\u80FD\u5305\u542B\u7A7A\u767D\u6216\u63A7\u5236\u5B57\u7B26\uFF0C\u4E14\u4E0D\u5F97\u8D85\u8FC7 256 \u4E2A\u5B57\u7B26\u3002");
  }
  if (typeof label !== "string" || label.length > TARGET_LABEL_MAX_LENGTH) {
    throw invalid(`\u6307\u5B9A\u8BBE\u7F6E\u7684\u5907\u6CE8\u540D\u4E0D\u5F97\u8D85\u8FC7 ${TARGET_LABEL_MAX_LENGTH} \u4E2A\u5B57\u7B26\u3002`);
  }
  if (typeof enabled !== "boolean") throw invalid("\u6307\u5B9A\u8BBE\u7F6E\u7684\u542F\u7528\u5F00\u5173\u5FC5\u987B\u662F\u5E03\u5C14\u503C\u3002");
  if (!Array.isArray(fields) || !fields.every((field) => CONTEXT_FIELDS.includes(field))) {
    throw invalid("\u6307\u5B9A\u8BBE\u7F6E\u7684\u6765\u6E90\u5B57\u6BB5\u53EA\u80FD\u4ECE\u5DF2\u5B9A\u4E49\u7684\u516B\u4E2A\u5B57\u6BB5\u4E2D\u9009\u62E9\u3002");
  }
  if (typeof guidance !== "string" || guidance.length > GUIDANCE_MAX_LENGTH) {
    throw invalid(`\u6307\u5B9A\u8BBE\u7F6E\u7684\u589E\u5F3A\u63D0\u793A\u8BCD\u4E0D\u5F97\u8D85\u8FC7 ${GUIDANCE_MAX_LENGTH} \u4E2A\u5B57\u7B26\u3002`);
  }
  if (!TARGET_MERGES.includes(merge)) throw invalid('\u6307\u5B9A\u8BBE\u7F6E\u7684\u63D0\u793A\u8BCD\u53E0\u52A0\u65B9\u5F0F\u53EA\u652F\u6301"\u53E0\u52A0"\u6216"\u8986\u76D6"\u3002');
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
  if (!hasExactKeys(input, CONFIG_KEYS)) throw invalid("\u8BF7\u63D0\u4EA4\u5B8C\u6574\u7684\u4E0A\u4E0B\u6587\u589E\u5F3A\u8BBE\u7F6E\u3002");
  if (!Array.isArray(input.targets)) throw invalid("\u6307\u5B9A\u8BBE\u7F6E\u5FC5\u987B\u662F\u5217\u8868\u3002");
  if (input.targets.length > TARGET_LIMIT) {
    throw invalid(`\u6307\u5B9A\u8BBE\u7F6E\u6700\u591A ${TARGET_LIMIT} \u6761\u3002`);
  }
  const targets = input.targets.map(validateTarget);
  const seen = /* @__PURE__ */ new Set();
  for (const target of targets) {
    const key = `${target.kind}:${target.id}`;
    if (seen.has(key)) throw invalid(`\u6307\u5B9A\u8BBE\u7F6E\u4E2D\u300C${target.id}\u300D\u91CD\u590D\uFF0C\u8BF7\u5408\u5E76\u540E\u518D\u4FDD\u5B58\u3002`);
    seen.add(key);
  }
  return Object.freeze({
    group: validateScope(input.group, "\u7FA4\u804A"),
    direct: validateScope(input.direct, "\u79C1\u804A"),
    targets: Object.freeze(targets)
  });
}
function migrateLegacyConfig(input) {
  if (!hasExactKeys(input, LEGACY_KEYS)) throw invalid("\u8BF7\u63D0\u4EA4\u5B8C\u6574\u7684\u4E0A\u4E0B\u6587\u589E\u5F3A\u8BBE\u7F6E\u3002");
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
        if (isPlainObject2(input)) {
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
  const normalized = value.replace(CONTROL_CHARACTERS, "").trim().slice(0, SOURCE_LIMITS[field]);
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
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
var DOCUMENT_VERSION = 1;
var EMPTY_RECORD = Object.freeze({
  workspace: null,
  model: null,
  agentPreset: null,
  contextEnhancement: null,
  accessPolicy: null
});
var RECORD_KEYS = Object.freeze(Object.keys(EMPTY_RECORD));
function isPlainObject3(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function cloneRecord(record) {
  return {
    ...EMPTY_RECORD,
    ...isPlainObject3(record) ? record : {}
  };
}
function normalizeDocument(value) {
  if (!isPlainObject3(value) || value.version !== DOCUMENT_VERSION) {
    return { version: DOCUMENT_VERSION, channels: {} };
  }
  const channels = {};
  if (isPlainObject3(value.channels)) {
    for (const [channelId, bots] of Object.entries(value.channels)) {
      if (!isPlainObject3(bots)) continue;
      const entries = {};
      for (const [botId, record] of Object.entries(bots)) {
        if (!isPlainObject3(record)) continue;
        entries[botId] = cloneRecord(record);
      }
      channels[channelId] = entries;
    }
  }
  return { version: DOCUMENT_VERSION, channels };
}
function createBotSettingsStore({ dataDir, logger = console } = {}) {
  if (typeof dataDir !== "string" || !dataDir.trim()) {
    throw new TypeError("bot settings \u9700\u8981 dataDir\u3002");
  }
  const file = join(dataDir, "bots.json");
  let document = { version: DOCUMENT_VERSION, channels: {} };
  let loaded = false;
  let queue = Promise.resolve();
  let backedUp = false;
  const listeners = /* @__PURE__ */ new Set();
  async function persist() {
    const body = `${JSON.stringify(document, null, 2)}
`;
    await mkdir(dirname(file), { recursive: true });
    if (!backedUp) {
      backedUp = true;
      try {
        const previous = await readFile(file, "utf8");
        if (previous.trim()) {
          const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
          await writeFile(`${file}.bak-${stamp}`, previous, "utf8");
        }
      } catch {
      }
    }
    const temporary = `${file}.tmp-${randomBytes(6).toString("hex")}`;
    await writeFile(temporary, body, "utf8");
    await rename(temporary, file);
  }
  function enqueue(task) {
    const next = queue.then(task, task);
    queue = next.then(() => void 0, () => void 0);
    return next;
  }
  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
      }
    }
  }
  return {
    path: file,
    /**
     * 等待磁盘文档就绪。渠道在读取设置前应 `await dshChat.ready()`。
     *
     * @returns 就绪后的存储自身。
     */
    async ready() {
      await this.load();
      return this;
    },
    /** 读取磁盘上的文档；文件不存在时保持空文档。 */
    async load() {
      if (loaded) return;
      try {
        document = normalizeDocument(JSON.parse(await readFile(file, "utf8")));
      } catch (error) {
        if (error?.code !== "ENOENT") {
          logger.warn?.(`[dsh-chat] \u8BFB\u53D6 ${file} \u5931\u8D25\uFF0C\u4F7F\u7528\u7A7A\u8BBE\u7F6E\uFF1A${error?.message ?? error}`);
        }
        document = { version: DOCUMENT_VERSION, channels: {} };
      }
      loaded = true;
    },
    /**
     * 读取一个机器人的设置。
     *
     * @param channelId - 渠道 id。
     * @param botId - 渠道内的机器人 id。
     * @returns 冻结的记录（缺失时为默认值）。
     */
    read(channelId, botId) {
      const stored = document.channels?.[channelId]?.[botId];
      const record = cloneRecord(stored);
      record.contextEnhancement = stored?.contextEnhancement === void 0 ? null : normalizeContextConfig(stored.contextEnhancement);
      return Object.freeze(record);
    },
    /**
     * 合并写入若干字段。
     *
     * @param channelId - 渠道 id。
     * @param botId - 机器人 id。
     * @param patch - 只包含需要改动的键。
     * @returns 写入后的冻结记录。
     */
    async write(channelId, botId, patch) {
      if (typeof channelId !== "string" || !channelId) throw new TypeError("channelId \u5FC5\u586B\u3002");
      if (typeof botId !== "string" || !botId) throw new TypeError("botId \u5FC5\u586B\u3002");
      if (!isPlainObject3(patch)) throw new TypeError("patch \u5FC5\u987B\u662F\u5BF9\u8C61\u3002");
      const unknown = Object.keys(patch).filter((key) => !RECORD_KEYS.includes(key));
      if (unknown.length > 0) throw new TypeError(`\u672A\u77E5\u7684\u8BBE\u7F6E\u5B57\u6BB5\uFF1A${unknown.join("\u3001")}`);
      if (Object.hasOwn(patch, "contextEnhancement") && patch.contextEnhancement !== null) {
        patch = { ...patch, contextEnhancement: normalizeContextConfig(patch.contextEnhancement) };
      }
      return enqueue(async () => {
        await this.load();
        const channels = { ...document.channels };
        const bots = { ...channels[channelId] ?? {} };
        bots[botId] = { ...cloneRecord(bots[botId]), ...patch };
        channels[channelId] = bots;
        document = { version: DOCUMENT_VERSION, channels };
        await persist();
        notify();
        return this.read(channelId, botId);
      });
    },
    /**
     * @param channelId - 渠道 id。
     * @returns 该渠道下的全部记录（含 botId）。
     */
    list(channelId) {
      const bots = document.channels?.[channelId] ?? {};
      return Object.freeze(Object.keys(bots).map((botId) => Object.freeze({
        botId,
        ...this.read(channelId, botId)
      })));
    },
    /**
     * 订阅变更（写入成功后触发）。
     *
     * @param listener - 无参回调。
     * @returns 取消订阅函数。
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
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
function createChannelRegistry({ logger = console, rpc, createDeps }) {
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
      await instance.start?.();
      if (record.disposed) {
        await instance.stop?.();
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
function channelDataDir(name2) {
  return join2(dshHome(), "integrations", name2);
}

// packages/dsh-chat/host/sessions.mjs
function notImplemented(method) {
  const error = new Error(`dsh-chat \u4F1A\u8BDD\u6865\u7684 ${method} \u5C06\u5728 P1 \u63D0\u4F9B\u3002`);
  error.code = "chat/not-implemented";
  return error;
}
function createSessionBridge({ ctx, logger = console } = {}) {
  const gateway = ctx?.typertGateway;
  const hasGateway = typeof gateway?.invoke === "function";
  if (!hasGateway) {
    logger.warn?.("[dsh-chat] typertGateway \u4E0D\u53EF\u7528\uFF0C\u4F1A\u8BDD\u80FD\u529B\u5C06\u4E0D\u53EF\u7528\uFF08P1 \u9700\u8981\u5B83\uFF09\u3002");
  }
  async function invoke(namespace, method, args, signal) {
    if (!hasGateway) {
      const error = new Error("\u5F53\u524D Host \u672A\u63D0\u4F9B typertGateway\uFF0C\u65E0\u6CD5\u8BBF\u95EE DSH \u4F1A\u8BDD\u3002");
      error.code = "chat/gateway-unavailable";
      throw error;
    }
    const request = { namespace, method, args };
    if (signal !== void 0) request.signal = signal;
    return gateway.invoke(request);
  }
  return Object.freeze({
    /** 底层调用口，渠道在 P1 之前也能用它做探测。 */
    invoke,
    /** @throws 未实现（P1）。 */
    async ask() {
      throw notImplemented("ask");
    },
    /** @throws 未实现（P1）。 */
    stop() {
      throw notImplemented("stop");
    },
    /** @throws 未实现（P1）。 */
    steer() {
      throw notImplemented("steer");
    },
    /** @throws 未实现（P1）。 */
    isRunning() {
      throw notImplemented("isRunning");
    },
    /** 解除某会话绑定，下一条消息开新会话。@throws 未实现（P1）。 */
    reset() {
      throw notImplemented("reset");
    }
  });
}

// packages/dsh-chat/host/plugin.mjs
var name = "dsh-chat-host";
var inject = ["connection", "credentials", "typertGateway"];
var CHANNEL_ID = /^[a-z][a-z0-9-]{1,31}$/;
var BOT_ID = /^[A-Za-z0-9_@.:+-]{1,256}$/;
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
  const settings = createBotSettingsStore({ dataDir: hubDataDir(config.dataDir), logger });
  const guidance = createGuidanceRegistry();
  const sessions = createSessionBridge({ ctx, logger });
  const rpc = createRpcCarrier(ctx, { logger });
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
    createDeps: (channelId, definition) => Object.freeze({
      channelId,
      logger: resolveLogger(ctx, `dsh-chat:${channelId}`),
      credentials: ctx.credentials,
      /** 渠道历史数据目录（沿用 dsh-im 命名，保证零重绑）；未声明时返回 hub 数据目录。 */
      dataDir: definition.legacy?.dir ? channelDataDir(definition.legacy.dir) : hubDataDir(config.dataDir),
      resolveDataDir: (name2) => channelDataDir(name2),
      storage: storageFor(channelId),
      /** 读取设置前先 await 它，避免启动竞态读到空文档。 */
      ready: () => settings.ready(),
      contextEnhancement: context_enhancement_exports,
      guidance,
      sessions
    })
  });
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
    return fail("chat/unknown-method", `\u63A7\u5236\u7AEF\u70B9\u4E0D\u652F\u6301 ${method}\u3002`);
  }
  void settings.load().catch((error) => {
    logger.warn?.(`[dsh-chat] \u521D\u59CB\u5316\u6BCF\u673A\u5668\u4EBA\u8BBE\u7F6E\u5931\u8D25\uFF1A${error?.message ?? error}`);
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
    /** 渠道注册表的只读视图。 */
    channels: Object.freeze({
      list: () => registry.list(),
      subscribe: (listener) => registry.subscribe(listener)
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
  logger.info?.(`[dsh-chat] hub \u5DF2\u5C31\u7EEA\uFF08\u5951\u7EA6 v${CONTRACT_VERSION}\uFF09\uFF0C\u7B49\u5F85\u6E20\u9053\u63D2\u4EF6\u6CE8\u518C\u3002`);
}
export {
  apply,
  inject,
  name
};
