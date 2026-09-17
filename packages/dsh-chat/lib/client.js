window.__ModuleLoader__.load({
  id: "dsh-chat",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/dsh-chat/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// packages/dsh-chat/shared/contract.mjs
var CONTRACT_VERSION = 1;
var CLIENT_CHANNEL_SERVICE = "chatChannels";
var CLIENT_UI_SERVICE = "chatUi";
var SETTINGS_SECTION_SLOT = "settings.section";
var SETTINGS_SECTION_ID = "dsh-chat";
var SETTINGS_SECTION_ORDER = 21;
var SETTINGS_LABEL_KEY = "Chat\u673A\u5668\u4EBA";
var CHANNEL_PAGE_SLOT = "chat.channel.page";
var RPC_PREFIX = "dsh-chat";
var CONTROL_CHANNEL_ID = "control";
var CHANNEL_ID_PATTERN = /^[a-z][a-z0-9-]{1,31}$/;

// packages/dsh-chat/shared/channel-rail.mjs
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function createChannelRail() {
  const byId = /* @__PURE__ */ new Map();
  const listeners = /* @__PURE__ */ new Set();
  let snapshot = Object.freeze([]);
  function refresh() {
    snapshot = Object.freeze(
      [...byId.values()].sort((left, right) => left.order === right.order ? left.id.localeCompare(right.id) : left.order - right.order)
    );
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
      }
    }
  }
  return {
    /**
     * 注册一个渠道的显示元数据。
     *
     * @param definition - { id, order, label, logo, capabilities }。
     * @returns 注销函数。
     */
    register(definition) {
      if (!isPlainObject(definition)) throw new TypeError("chatChannels.register \u9700\u8981\u4E00\u4EFD\u6E20\u9053\u5143\u6570\u636E\u5BF9\u8C61\u3002");
      const { id, order, label, logo, capabilities } = definition;
      if (typeof id !== "string" || !CHANNEL_ID_PATTERN.test(id)) {
        throw new TypeError("\u6E20\u9053 id \u5FC5\u987B\u662F 2\u201332 \u4F4D\u5C0F\u5199\u5B57\u6BCD/\u6570\u5B57/\u8FDE\u5B57\u7B26\uFF0C\u4E14\u4EE5\u5B57\u6BCD\u5F00\u5934\u3002");
      }
      if (typeof label !== "string" && typeof label !== "function") {
        throw new TypeError("\u6E20\u9053 label \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6216\u8FD4\u56DE\u5B57\u7B26\u4E32\u7684\u51FD\u6570\u3002");
      }
      if (!Number.isFinite(order)) throw new TypeError("\u6E20\u9053 order \u5FC5\u987B\u662F\u6709\u9650\u6570\u5B57\u3002");
      if (capabilities !== void 0 && !isPlainObject(capabilities)) {
        throw new TypeError("\u6E20\u9053 capabilities \u5FC5\u987B\u662F\u5BF9\u8C61\u3002");
      }
      if (byId.has(id)) throw new Error(`\u6E20\u9053 ${id} \u5DF2\u6CE8\u518C\uFF0C\u4E0D\u80FD\u91CD\u590D\u6CE8\u518C\u3002`);
      const entry = Object.freeze({
        id,
        order,
        label: typeof label === "function" ? label : () => label,
        logo: logo ?? null,
        capabilities: Object.freeze({ ...capabilities ?? {} })
      });
      byId.set(id, entry);
      refresh();
      return () => {
        if (byId.get(id) !== entry) return;
        byId.delete(id);
        refresh();
      };
    },
    /** @returns 当前渠道列表（按 order 排序的冻结数组）。 */
    entries() {
      return snapshot;
    },
    /** @returns 快照，供 useSyncExternalStore 使用。 */
    getSnapshot() {
      return snapshot;
    },
    /**
     * 订阅渠道列表变化。
     *
     * @param listener - 无参回调。
     * @returns 取消订阅函数。
     */
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("chatChannels.subscribe \u9700\u8981\u51FD\u6570\u3002");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /**
     * @param id - 渠道 id。
     * @returns 该渠道的元数据，未注册时为 undefined。
     */
    get(id) {
      return byId.get(id);
    },
    /** @returns 已注册渠道数量。 */
    get size() {
      return byId.size;
    }
  };
}

// packages/dsh-chat/client/chat-ui.js
var React4 = __toESM(require("react"), 1);

// packages/dsh-chat/client/bot-settings.js
var React = __toESM(require("react"), 1);

// packages/dsh-chat/client/rpc.js
function chatEndpoint(channelId) {
  return `${RPC_PREFIX}/${channelId}`;
}
function callChatRpc(connection, channelId, method, payload = {}, signal) {
  if (typeof connection?.rpc?.call !== "function") {
    throw new TypeError("\u5F53\u524D\u9875\u9762\u7F3A\u5C11 DSH Connection RPC \u80FD\u529B\u3002");
  }
  return connection.rpc.call("/api", chatEndpoint(channelId), { method, payload }, signal);
}
function callControlRpc(connection, method, payload, signal) {
  return callChatRpc(connection, CONTROL_CHANNEL_ID, method, payload, signal);
}
function unwrapRpc(result) {
  if (result?.ok === true) return result.value;
  const error = new Error(result?.error?.message ?? "\u804A\u5929\u63D2\u4EF6\u8C03\u7528\u5931\u8D25\u3002");
  error.code = result?.error?.code ?? "chat/rpc-failed";
  error.details = result?.error?.details ?? {};
  throw error;
}

// packages/dsh-chat/client/bot-settings.js
function useBotSettings({ connection, channelId, botId, enabled = true }) {
  const [state, setState] = React.useState({ phase: "idle", record: null, error: null });
  const aliveRef = React.useRef(true);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const load = React.useCallback(async () => {
    if (!enabled || !connection || !channelId || !botId) return;
    setState((current) => ({ ...current, phase: "loading", error: null }));
    try {
      const result = await callControlRpc(connection, "bot.settings.get", { channelId, botId });
      const value = unwrapRpc(result);
      if (aliveRef.current) setState({ phase: "ready", record: value.settings, error: null });
    } catch (error) {
      if (aliveRef.current) setState({ phase: "error", record: null, error });
    }
  }, [connection, channelId, botId, enabled]);
  React.useEffect(() => {
    void load();
  }, [load]);
  const saveContextEnhancement = React.useCallback(async (config) => {
    const result = await callControlRpc(connection, "bot.context-enhancement.set", {
      channelId,
      botId,
      config
    });
    const value = unwrapRpc(result);
    if (aliveRef.current) {
      setState((current) => ({
        ...current,
        phase: "ready",
        record: { ...current.record ?? {}, contextEnhancement: value.contextEnhancement }
      }));
    }
    return value.contextEnhancement;
  }, [connection, channelId, botId]);
  return {
    record: state.record,
    phase: state.phase,
    error: state.error,
    reload: load,
    saveContextEnhancement
  };
}

// packages/dsh-chat/client/context-enhancement.js
var React2 = __toESM(require("react"), 1);
var import_react_dom = require("react-dom");

// packages/dsh-chat/shared/context-enhancement.mjs
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

// packages/dsh-chat/client/context-enhancement.js
var h = React2.createElement;
var FIELD_LABELS = Object.freeze({
  channel: "\u6E20\u9053",
  conversationType: "\u4F1A\u8BDD\u7C7B\u578B",
  senderId: "\u53D1\u9001\u8005\u6807\u8BC6",
  senderName: "\u53D1\u9001\u8005\u6635\u79F0",
  conversationTitle: "\u4F1A\u8BDD\u6807\u9898",
  chatId: "\u4F1A\u8BDD\u6807\u8BC6",
  threadId: "\u8BDD\u9898\u6807\u8BC6",
  botId: "\u673A\u5668\u4EBA\u6807\u8BC6"
});
var FIELD_HELP = Object.freeze({
  senderName: "\u4E0D\u662F\u6BCF\u4E2A\u6E20\u9053\u90FD\u80FD\u63D0\u4F9B\uFF1B\u5F53\u524D\u6D88\u606F\u6CA1\u6709\u53D1\u9001\u8005\u6635\u79F0\u65F6\u4F1A\u7701\u7565\u8BE5\u5B57\u6BB5\u3002",
  conversationTitle: "\u4E0D\u662F\u6BCF\u4E2A\u6E20\u9053\u90FD\u80FD\u63D0\u4F9B\uFF1B\u5F53\u524D\u6D88\u606F\u6CA1\u6709\u4F1A\u8BDD\u6807\u9898\u65F6\u4F1A\u7701\u7565\u8BE5\u5B57\u6BB5\u3002",
  chatId: "\u7528\u4E8E\u533A\u5206\u4E0D\u540C\u7FA4\u7EC4\u6216\u79C1\u804A\uFF1B\u5F53\u524D\u6D88\u606F\u6CA1\u6709\u4F1A\u8BDD\u6807\u8BC6\u65F6\u4F1A\u7701\u7565\u8BE5\u5B57\u6BB5\u3002",
  threadId: "\u98DE\u4E66\u8BDD\u9898\u7FA4\u7684\u6D88\u606F\u4F1A\u5E26\u4E0A\u8BDD\u9898\u6807\u8BC6\uFF0C\u7528\u4E8E\u533A\u5206\u540C\u4E00\u7FA4\u7EC4\u5185\u7684\u4E0D\u540C\u8BDD\u9898\u3002"
});
var SCOPE_TEXT = Object.freeze({
  direct: Object.freeze({
    title: "\u79C1\u804A",
    targetTitle: "\u6307\u5B9A\u7528\u6237",
    targetHint: "\u53EA\u5728\u8BE5\u7528\u6237\u4E0E\u673A\u5668\u4EBA\u7684\u79C1\u804A\u4E2D\u751F\u6548\uFF08\u6309\u53D1\u9001\u8005\u6807\u8BC6\u5339\u914D\uFF09\u3002",
    idPlaceholder: "ou_xxx\uFF08\u53D1\u9001\u8005\u6807\u8BC6\uFF09",
    idLabel: "\u7528\u6237\u6807\u8BC6"
  }),
  group: Object.freeze({
    title: "\u7FA4\u804A",
    targetTitle: "\u6307\u5B9A\u7FA4",
    targetHint: "\u53EA\u5728\u8BE5\u7FA4\u4E2D\u751F\u6548\uFF08\u6309\u4F1A\u8BDD\u6807\u8BC6\u5339\u914D\uFF09\u3002",
    idPlaceholder: "oc_xxx\uFF08\u4F1A\u8BDD\u6807\u8BC6\uFF09",
    idLabel: "\u7FA4\u6807\u8BC6"
  })
});
function t_of(translate) {
  return typeof translate === "function" ? translate : (key) => key;
}
function FieldPicker({ scopeKey, scope, disabled, onChange }) {
  return h("div", { className: "dchat-contextFields" }, CONTEXT_FIELDS.map((field) => {
    const inputId = `dchat-field-${scopeKey}-${field}`;
    return h(
      "div",
      { key: field, className: "dchat-contextField" },
      h("input", {
        id: inputId,
        type: "checkbox",
        checked: scope.fields.includes(field),
        disabled,
        onChange: (event) => onChange(event.target.checked ? [...scope.fields, field] : scope.fields.filter((value) => value !== field))
      }),
      h(
        "label",
        { htmlFor: inputId, title: FIELD_HELP[field] ?? "" },
        h("span", null, FIELD_LABELS[field]),
        h("code", null, field)
      )
    );
  }));
}
function GuidanceEditor({ idPrefix, value, example, disabled, onChange }) {
  const id = `${idPrefix}-guidance`;
  return h(
    "div",
    { className: "dchat-contextGuidance" },
    h(
      "div",
      { className: "dchat-contextGuidanceHeader" },
      h("label", { htmlFor: id, className: "dchat-contextLegend" }, "\u589E\u5F3A\u63D0\u793A\u8BCD"),
      h(
        "div",
        { className: "dchat-actions" },
        h("button", {
          type: "button",
          className: "dchat-button",
          disabled,
          onClick: () => onChange(example)
        }, "\u586B\u5165\u793A\u4F8B"),
        h("button", {
          type: "button",
          className: "dchat-button",
          disabled,
          onClick: () => onChange("")
        }, "\u6E05\u7A7A")
      )
    ),
    h(
      "p",
      { className: "dchat-cardDescription" },
      "\u544A\u8BC9\u6A21\u578B\u5982\u4F55\u4F7F\u7528\u6765\u6E90\u5B57\u6BB5\u3002\u53EA\u586B\u6B63\u6587\uFF0C\u63D2\u4EF6\u4F1A\u81EA\u52A8\u5305\u6210\u6765\u6E90\u589E\u5F3A\u5757\u3002"
    ),
    h("textarea", {
      id,
      className: "dchat-textarea",
      rows: 4,
      value,
      placeholder: example,
      maxLength: GUIDANCE_MAX_LENGTH,
      disabled,
      onChange: (event) => onChange(event.target.value)
    })
  );
}
function GlobalScopePanel({ kind, scope, disabled, onChange }) {
  const text = SCOPE_TEXT[kind];
  const example = kind === "group" ? GROUP_GUIDANCE_EXAMPLE : DIRECT_GUIDANCE_EXAMPLE;
  const switchId = `dchat-enable-${kind}`;
  return h(
    "div",
    { className: "dchat-contextGlobal" },
    h(
      "div",
      { className: "dchat-contextSwitchRow" },
      h(
        "label",
        { htmlFor: switchId, className: "dchat-contextSwitchLabel" },
        `\u542F\u7528${text.title}\u5168\u5C40\u589E\u5F3A`
      ),
      h("input", {
        id: switchId,
        type: "checkbox",
        role: "switch",
        checked: scope.enabled,
        disabled,
        onChange: (event) => onChange({ ...scope, enabled: event.target.checked })
      })
    ),
    h("div", { className: "dchat-contextLegendRow" }, "\u6765\u6E90\u5B57\u6BB5"),
    h(FieldPicker, {
      scopeKey: `${kind}-global`,
      scope,
      disabled,
      onChange: (fields) => onChange({ ...scope, fields })
    }),
    h(GuidanceEditor, {
      idPrefix: `dchat-${kind}-global`,
      value: scope.guidance,
      example,
      disabled,
      onChange: (guidance) => onChange({ ...scope, guidance })
    })
  );
}
function targetKindOf(scope) {
  return scope === "direct" ? "user" : "group";
}
function TargetRow({ scope, target, index, disabled, onChange, onRemove }) {
  const text = SCOPE_TEXT[scope];
  const prefix = `dchat-target-${scope}-${index}`;
  return h(
    "li",
    { className: "dchat-targetRow" },
    h(
      "div",
      { className: "dchat-targetHead" },
      h(
        "label",
        { className: "dchat-targetEnable" },
        h("input", {
          type: "checkbox",
          checked: target.enabled,
          disabled,
          "aria-label": `\u542F\u7528\u7B2C ${index + 1} \u6761${text.targetTitle}`,
          onChange: (event) => onChange({ ...target, enabled: event.target.checked })
        }),
        "\u542F\u7528"
      ),
      h("button", {
        type: "button",
        className: "dchat-button",
        disabled,
        "aria-label": `\u5220\u9664\u7B2C ${index + 1} \u6761${text.targetTitle}`,
        onClick: onRemove
      }, "\u5220\u9664")
    ),
    h(
      "div",
      { className: "dchat-targetGrid" },
      h(
        "label",
        { className: "dchat-targetField" },
        h("span", null, text.idLabel),
        h("input", {
          type: "text",
          value: target.id,
          maxLength: TARGET_ID_MAX_LENGTH,
          placeholder: text.idPlaceholder,
          disabled,
          onChange: (event) => onChange({ ...target, id: event.target.value })
        })
      ),
      h(
        "label",
        { className: "dchat-targetField" },
        h("span", null, "\u5907\u6CE8\u540D\uFF08\u53EF\u9009\uFF09"),
        h("input", {
          type: "text",
          value: target.label,
          maxLength: TARGET_LABEL_MAX_LENGTH,
          placeholder: "\u5F20\u4E09",
          disabled,
          onChange: (event) => onChange({ ...target, label: event.target.value })
        })
      )
    ),
    h("div", { className: "dchat-contextLegendRow" }, "\u6765\u6E90\u5B57\u6BB5"),
    h(FieldPicker, {
      scopeKey: `${prefix}`,
      scope: target,
      disabled,
      onChange: (fields) => onChange({ ...target, fields })
    }),
    h(GuidanceEditor, {
      idPrefix: prefix,
      value: target.guidance,
      example: scope === "group" ? GROUP_GUIDANCE_EXAMPLE : DIRECT_GUIDANCE_EXAMPLE,
      disabled,
      onChange: (guidance) => onChange({ ...target, guidance })
    }),
    h(
      "label",
      { className: "dchat-targetMerge" },
      h("input", {
        type: "checkbox",
        checked: target.merge === "append",
        disabled,
        onChange: (event) => onChange({
          ...target,
          merge: event.target.checked ? "append" : "replace"
        })
      }),
      "\u53E0\u52A0\u5168\u5C40\u63D0\u793A\u8BCD\uFF08\u4E0D\u52FE\u9009\u5219\u53EA\u4F7F\u7528\u4E0A\u9762\u7684\u4E13\u5C5E\u63D0\u793A\u8BCD\uFF09"
    )
  );
}
function TargetPanel({ scope, targets, disabled, onChange }) {
  const kind = targetKindOf(scope);
  const text = SCOPE_TEXT[scope];
  const rows = targets.map((target, index) => ({ target, index })).filter((entry) => entry.target.kind === kind);
  const add = () => onChange([...targets, {
    kind,
    id: "",
    label: "",
    enabled: true,
    fields: ["senderId"],
    guidance: "",
    merge: "append"
  }]);
  const replace = (index, next) => onChange(targets.map((item, at) => at === index ? next : item));
  const remove = (index) => onChange(targets.filter((_, at) => at !== index));
  return h(
    "div",
    { className: "dchat-contextTargets" },
    h(
      "div",
      { className: "dchat-cardHeader" },
      h(
        "div",
        null,
        h("h4", { className: "dchat-cardTitle" }, text.targetTitle),
        h("p", { className: "dchat-cardDescription" }, text.targetHint)
      ),
      h("button", {
        type: "button",
        className: "dchat-button",
        disabled: disabled || targets.length >= TARGET_LIMIT,
        onClick: add
      }, "\u65B0\u589E")
    ),
    rows.length === 0 ? h("p", { className: "dchat-cardDescription" }, "\u8FD8\u6CA1\u6709\u6307\u5B9A\u8BBE\u7F6E\u3002") : h("ul", { className: "dchat-targetList" }, rows.map(({ target, index }) => h(TargetRow, {
      key: index,
      scope,
      target,
      index,
      disabled,
      onChange: (next) => replace(index, next),
      onRemove: () => remove(index)
    })))
  );
}
function ContextEnhancementDialog({ config, disabled, translate, onSave, onClose }) {
  const t = t_of(translate);
  const [draft, setDraft] = React2.useState(() => normalizeContextConfig(config));
  const [activeScope, setActiveScope] = React2.useState("direct");
  const [saving, setSaving] = React2.useState(false);
  const [error, setError] = React2.useState(null);
  const dialogRef = React2.useRef(null);
  const titleId = React2.useId();
  React2.useEffect(() => {
    dialogRef.current?.focus?.();
  }, []);
  const busy = disabled || saving;
  const save = async () => {
    if (busy) return;
    setSaving(true);
    setError(null);
    try {
      const next = validateContextConfig(draft);
      await onSave(next);
      onClose();
    } catch (cause) {
      setError(cause?.message ?? t("\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002"));
    } finally {
      setSaving(false);
    }
  };
  const content = h("div", {
    className: "dchat-backdrop",
    onMouseDown: (event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    }
  }, h(
    "section",
    {
      ref: dialogRef,
      className: "dchat-dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId,
      tabIndex: -1,
      onKeyDown: (event) => {
        if (event.key === "Escape" && !saving) {
          event.preventDefault();
          onClose();
        }
      }
    },
    h(
      "header",
      { className: "dchat-dialogHeader" },
      h("h3", { id: titleId, className: "dchat-cardTitle" }, "\u4E0A\u4E0B\u6587\u589E\u5F3A"),
      h("button", {
        type: "button",
        className: "dchat-button",
        disabled: saving,
        "aria-label": "\u5173\u95ED",
        onClick: onClose
      }, "\u5173\u95ED")
    ),
    h(
      "p",
      { className: "dchat-cardDescription" },
      "\u6765\u6E90\u5B57\u6BB5\u53EA\u5728\u5F53\u524D\u6D88\u606F\u5DF2\u63D0\u4F9B\u65F6\u624D\u4F1A\u53D1\u9001\uFF0C\u4E0D\u4F1A\u989D\u5916\u67E5\u8BE2\u5E73\u53F0\u63A5\u53E3\u3002"
    ),
    h(
      "div",
      { className: "dchat-tabs", role: "tablist", "aria-label": "\u4E0A\u4E0B\u6587\u589E\u5F3A\u8303\u56F4" },
      ["direct", "group"].map((kind) => h("button", {
        key: kind,
        type: "button",
        role: "tab",
        className: "dchat-tab",
        "aria-selected": activeScope === kind,
        "data-scope": kind,
        onClick: () => setActiveScope(kind)
      }, SCOPE_TEXT[kind].title))
    ),
    ["direct", "group"].map((kind) => h(
      "div",
      {
        key: kind,
        role: "tabpanel",
        className: "dchat-tabPanel",
        hidden: activeScope !== kind,
        "data-scope": kind
      },
      h(GlobalScopePanel, {
        kind,
        scope: draft[kind],
        disabled: busy,
        onChange: (scope) => setDraft((current) => ({ ...current, [kind]: scope }))
      }),
      h(TargetPanel, {
        scope: kind,
        targets: draft.targets,
        disabled: busy,
        onChange: (targets) => setDraft((current) => ({ ...current, targets }))
      })
    )),
    error ? h("p", { className: "dchat-error", role: "alert" }, error) : null,
    h(
      "footer",
      { className: "dchat-dialogFooter" },
      h("button", {
        type: "button",
        className: "dchat-button",
        disabled: saving,
        onClick: onClose
      }, t("\u53D6\u6D88")),
      h("button", {
        type: "button",
        className: "dchat-button dchat-buttonPrimary",
        disabled: busy,
        onClick: () => {
          void save();
        }
      }, saving ? t("\u4FDD\u5B58\u4E2D\u2026") : t("\u4FDD\u5B58"))
    )
  ));
  return globalThis.document?.body ? (0, import_react_dom.createPortal)(content, globalThis.document.body) : content;
}
function ContextEnhancementEditor({ config, disabled = false, translate, onSave }) {
  const t = t_of(translate);
  const [open, setOpen] = React2.useState(false);
  const status = contextStatusLabel(config);
  return h(
    React2.Fragment,
    null,
    h(
      "button",
      {
        type: "button",
        className: "dchat-entry",
        disabled,
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        onClick: () => setOpen(true)
      },
      h("span", { className: "dchat-entryLabel" }, "\u4E0A\u4E0B\u6587\u589E\u5F3A"),
      h("span", { className: "dchat-entryStatus", "data-active": status !== "\u672A\u5F00\u542F" }, status),
      h("span", { className: "dchat-entryArrow", "aria-hidden": "true" }, "\u203A")
    ),
    open ? h(ContextEnhancementDialog, {
      config,
      disabled,
      translate: t,
      onSave,
      onClose: () => setOpen(false)
    }) : null
  );
}

// packages/dsh-chat/client/scoped-mode-editor.js
var React3 = __toESM(require("react"), 1);
var h2 = React3.createElement;
function ScopedModeEditor({
  title,
  description,
  scopes,
  options,
  value,
  disabled = false,
  saving = false,
  error = null,
  translate,
  onSave
}) {
  const t = typeof translate === "function" ? translate : (key) => key;
  const [draft, setDraft] = React3.useState(() => ({ ...value }));
  const [busy, setBusy] = React3.useState(false);
  React3.useEffect(() => {
    if (!busy) setDraft({ ...value });
  }, [value, busy]);
  const dirty = scopes.some((scope) => (draft[scope.key] ?? null) !== (value[scope.key] ?? null));
  const locked = disabled || busy || saving;
  const save = async () => {
    if (locked || !dirty) return;
    setBusy(true);
    try {
      await onSave({ ...draft });
    } finally {
      setBusy(false);
    }
  };
  return h2(
    "section",
    { className: "dchat-card" },
    h2(
      "div",
      { className: "dchat-cardHeader" },
      h2(
        "div",
        null,
        h2("h3", { className: "dchat-cardTitle" }, title),
        description ? h2("p", { className: "dchat-cardDescription" }, description) : null
      ),
      h2(
        "div",
        { className: "dchat-actions" },
        h2("button", {
          type: "button",
          className: "dchat-button",
          disabled: locked || !dirty,
          onClick: () => {
            void save();
          }
        }, busy ? t("\u4FDD\u5B58\u4E2D\u2026") : t("\u4FDD\u5B58"))
      )
    ),
    h2("div", { className: "dchat-scopeGrid" }, scopes.map((scope) => {
      const selected = draft[scope.key] ?? options[0]?.value;
      const help = options.find((option) => option.value === selected)?.help;
      const selectId = `dchat-mode-${scope.key}`;
      return h2(
        "div",
        { key: scope.key, className: "dchat-scopeRow" },
        h2("label", { className: "dchat-scopeLabel", htmlFor: selectId }, scope.label),
        h2("select", {
          id: selectId,
          className: "dchat-select",
          value: selected,
          disabled: locked,
          "aria-label": `${title} \xB7 ${scope.label}`,
          onChange: (event) => setDraft((current) => ({
            ...current,
            [scope.key]: event.target.value
          }))
        }, options.map((option) => h2("option", {
          key: option.value,
          value: option.value
        }, option.label))),
        help ? h2("p", { className: "dchat-cardDescription" }, help) : null
      );
    })),
    error ? h2("p", { className: "dchat-error", role: "alert" }, error) : null
  );
}

// packages/dsh-chat/client/styles.js
var STYLE_ID = "dsh-chat-styles";
var CSS = `
.dchat-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}
.dchat-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.dchat-brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.dchat-brandName {
  font-size: 16px;
  font-weight: 600;
}
.dchat-brandHint {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.dchat-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  min-height: 0;
  flex: 1;
}
.dchat-rail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 168px;
  flex: none;
}
.dchat-channel {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dchat-channel:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dchat-channel[aria-selected='true'] {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l2);
}
.dchat-channelMark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  font-size: 12px;
  font-weight: 600;
  flex: none;
}
.dchat-channelLabel {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.dchat-channelLabel strong {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dchat-channelLabel small {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.dchat-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dchat-card {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dchat-cardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dchat-cardTitle {
  font-size: 14px;
  font-weight: 600;
}
.dchat-cardDescription {
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}
.dchat-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dchat-listItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.dchat-code {
  font-family: var(--dsw-font-markdown-code-block-small, ui-monospace, SFMono-Regular, monospace);
  font-size: 12px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--dsw-alias-markdown-code-block);
  color: var(--dsw-alias-label-primary);
}
.dchat-empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  border: 1px dashed var(--dsw-alias-border-l3);
  border-radius: 10px;
  padding: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dchat-emptyTitle {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dchat-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.dchat-button {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
}
.dchat-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dchat-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.dchat-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.dchat-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.dchat-status[data-tone='success'] { color: var(--dsw-alias-state-success-primary); }
.dchat-status[data-tone='warning'] { color: var(--dsw-alias-state-warn-primary); }
.dchat-status[data-tone='error'] { color: var(--dsw-alias-state-error-primary); }
.dchat-error {
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary);
}
.dchat-buttonPrimary {
  background: var(--dsw-alias-brand-primary);
  border-color: transparent;
  color: #fff;
}
.dchat-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dchat-entry:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dchat-entry:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.dchat-entryLabel {
  font-size: 13px;
  font-weight: 500;
}
.dchat-entryStatus {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  margin-left: auto;
}
.dchat-entryStatus[data-active='true'] {
  color: var(--dsw-alias-state-success-primary);
}
.dchat-entryArrow {
  color: var(--dsw-alias-label-tertiary);
}
.dchat-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 16px;
  overflow: auto;
  /* \u8BBE\u7F6E\u5F39\u5C42\u81EA\u8EAB\u662F fixed + z-index:1000\uFF0C\u6E20\u9053\u5F39\u7A97\u5FC5\u987B\u538B\u5728\u5176\u4E0A\u3002 */
  z-index: 1100;
}
.dchat-dialog {
  width: min(640px, 100%);
  /* \u81EA\u5DF1\u6EDA\uFF0C\u800C\u4E0D\u662F\u8BA9\u5916\u5C42\u6EDA\u52A8\uFF1A\u5426\u5219\u5185\u5BB9\u53D8\u9AD8\u65F6\u5E95\u90E8\u6309\u94AE\u4F1A\u6389\u51FA\u89C6\u53E3\u3002 */
  max-height: calc(100vh - 80px);
  box-sizing: border-box;
  overflow: auto;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dchat-dialogHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dchat-dialogFooter {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  /* \u5185\u5BB9\u5F88\u957F\u65F6\u6309\u94AE\u59CB\u7EC8\u7C98\u5728\u5F39\u7A97\u5E95\u90E8\u3002 */
  position: sticky;
  bottom: -16px;
  margin: 0 -18px -16px;
  padding: 10px 18px 14px;
  background: var(--dsw-alias-bg-base);
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dchat-tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dchat-tab {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 13px;
  padding: 6px 10px;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}
.dchat-tab[aria-selected='true'] {
  color: var(--dsw-alias-label-primary);
  border-bottom-color: var(--dsw-alias-brand-primary);
}
.dchat-tabPanel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dchat-contextGlobal,
.dchat-contextTargets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dchat-contextSwitchRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dchat-contextSwitchLabel {
  font-size: 13px;
}
.dchat-contextLegendRow,
.dchat-contextLegend {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.dchat-contextFields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 4px 12px;
}
.dchat-contextField {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.dchat-contextField code {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.dchat-contextGuidance {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dchat-contextGuidanceHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dchat-textarea,
.dchat-targetField input,
.dchat-select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 6px 8px;
}
.dchat-textarea {
  resize: vertical;
  min-height: 72px;
}
.dchat-targetList {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dchat-targetRow {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.dchat-targetHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dchat-targetEnable,
.dchat-targetMerge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.dchat-targetGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.dchat-targetField {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
}
.dchat-scopeGrid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dchat-scopeRow {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dchat-scopeLabel {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
`;
var installations = 0;
var styleElement = null;
function installChatStyles(doc = globalThis.document) {
  if (!doc?.head) return () => {
  };
  installations += 1;
  if (!styleElement) {
    styleElement = doc.createElement("style");
    styleElement.id = STYLE_ID;
    styleElement.textContent = CSS;
    doc.head.appendChild(styleElement);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    installations -= 1;
    if (installations > 0) return;
    try {
      styleElement?.remove();
    } finally {
      styleElement = null;
    }
  };
}

// packages/dsh-chat/client/chat-ui.js
var h3 = React4.createElement;
function Panel({ title, description, actions, children }) {
  return h3(
    "section",
    { className: "dchat-card" },
    title || description || actions ? h3(
      "div",
      { className: "dchat-cardHeader" },
      h3(
        "div",
        null,
        title ? h3("h3", { className: "dchat-cardTitle" }, title) : null,
        description ? h3("p", { className: "dchat-cardDescription" }, description) : null
      ),
      actions ? h3("div", { className: "dchat-actions" }, actions) : null
    ) : null,
    children
  );
}
function EmptyState({ title, description, children }) {
  return h3(
    "div",
    { className: "dchat-empty" },
    h3("span", { className: "dchat-emptyTitle" }, title),
    description ? h3("span", null, description) : null,
    children
  );
}
var TONES = Object.freeze({
  starting: "warning",
  running: "success",
  failed: "error",
  stopped: ""
});
function StatusPill({ status, label }) {
  return h3("span", {
    className: "dchat-status",
    "data-tone": TONES[status] ?? "",
    "data-status": status
  }, label ?? status);
}
function createChatUi({ ctx, translate } = {}) {
  const t = typeof translate === "function" ? translate : (key) => key;
  return Object.freeze({
    version: CONTRACT_VERSION,
    components: Object.freeze({
      Panel,
      EmptyState,
      StatusPill,
      /** 上下文增强（群聊/私聊全局 + 指定用户/指定群 + 是否叠加全局提示词）。 */
      ContextEnhancementEditor,
      /** 通用"两作用域 × 多选项"设置块（如飞书任务过程展示）。 */
      ScopedModeEditor
    }),
    hooks: Object.freeze({
      /** 读取/保存 hub 持有的每机器人共享设置。 */
      useBotSettings
    }),
    installStyles: () => installChatStyles(),
    /** 调用本渠道自己的 RPC。 */
    callChannelRpc: (connection, channelId, method, payload, signal) => callChatRpc(connection, channelId, method, payload, signal),
    /** 调用 hub 控制端点（渠道无关设置，如上下文增强）。 */
    callControlRpc: (connection, method, payload, signal) => callControlRpc(connection, method, payload, signal),
    unwrapRpc,
    translate: t,
    /** 供渠道页复用的 React 运行时（渠道包只 external react/react-dom，无需各写一份）。 */
    react: React4,
    createElement: h3,
    /** hub 当前提供的契约版本，渠道页可据此显示兼容信息。 */
    contractVersion: CONTRACT_VERSION,
    context: Object.freeze({ has: () => typeof ctx === "object" })
  });
}

// packages/dsh-chat/client/i18n.js
var LOCALE_NAMESPACE = "dsh-chat";
var zh = {
  "Chat\u673A\u5668\u4EBA": "Chat\u673A\u5668\u4EBA",
  "Chat\u673A\u5668\u4EBA\u8BBE\u7F6E": "Chat\u673A\u5668\u4EBA\u8BBE\u7F6E",
  "\u6E20\u9053\u5BFC\u822A": "\u6E20\u9053\u5BFC\u822A",
  "\u672A\u5B89\u88C5\u4EFB\u4F55\u804A\u5929\u8F6F\u4EF6\u63D2\u4EF6": "\u672A\u5B89\u88C5\u4EFB\u4F55\u804A\u5929\u8F6F\u4EF6\u63D2\u4EF6",
  "\u5B89\u88C5\u6E20\u9053\u63D2\u4EF6\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u5BF9\u5E94\u7684\u804A\u5929\u8F6F\u4EF6\u3002": "\u5B89\u88C5\u6E20\u9053\u63D2\u4EF6\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u5BF9\u5E94\u7684\u804A\u5929\u8F6F\u4EF6\u3002",
  "\u5DF2\u77E5\u6E20\u9053\u63D2\u4EF6": "\u5DF2\u77E5\u6E20\u9053\u63D2\u4EF6",
  "\u6E20\u9053\u6B63\u5728\u542F\u52A8": "\u6B63\u5728\u542F\u52A8",
  "\u6E20\u9053\u5DF2\u5C31\u7EEA": "\u5DF2\u5C31\u7EEA",
  "\u6E20\u9053\u542F\u52A8\u5931\u8D25": "\u542F\u52A8\u5931\u8D25",
  "\u6E20\u9053\u5DF2\u505C\u6B62": "\u5DF2\u505C\u6B62",
  "\u91CD\u65B0\u8BFB\u53D6": "\u91CD\u65B0\u8BFB\u53D6",
  "\u8BFB\u53D6\u4E2D\u2026": "\u8BFB\u53D6\u4E2D\u2026",
  "\u4E0A\u4E0B\u6587\u589E\u5F3A": "\u4E0A\u4E0B\u6587\u589E\u5F3A",
  "\u4EFB\u52A1\u8FC7\u7A0B\u5C55\u793A": "\u4EFB\u52A1\u8FC7\u7A0B\u5C55\u793A",
  "\u4FDD\u5B58": "\u4FDD\u5B58",
  "\u4FDD\u5B58\u4E2D\u2026": "\u4FDD\u5B58\u4E2D\u2026",
  "\u53D6\u6D88": "\u53D6\u6D88",
  "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002": "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002"
};
var en = {
  "Chat\u673A\u5668\u4EBA": "Chat bot",
  "Chat\u673A\u5668\u4EBA\u8BBE\u7F6E": "Chat bot settings",
  "\u6E20\u9053\u5BFC\u822A": "Channel navigation",
  "\u672A\u5B89\u88C5\u4EFB\u4F55\u804A\u5929\u8F6F\u4EF6\u63D2\u4EF6": "No chat channel plugin installed",
  "\u5B89\u88C5\u6E20\u9053\u63D2\u4EF6\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u5BF9\u5E94\u7684\u804A\u5929\u8F6F\u4EF6\u3002": "Install a channel plugin and its chat service appears here.",
  "\u5DF2\u77E5\u6E20\u9053\u63D2\u4EF6": "Known channel plugins",
  "\u6E20\u9053\u6B63\u5728\u542F\u52A8": "Starting",
  "\u6E20\u9053\u5DF2\u5C31\u7EEA": "Ready",
  "\u6E20\u9053\u542F\u52A8\u5931\u8D25": "Failed to start",
  "\u6E20\u9053\u5DF2\u505C\u6B62": "Stopped",
  "\u91CD\u65B0\u8BFB\u53D6": "Reload",
  "\u8BFB\u53D6\u4E2D\u2026": "Loading\u2026",
  "\u4E0A\u4E0B\u6587\u589E\u5F3A": "Context enhancement",
  "\u4EFB\u52A1\u8FC7\u7A0B\u5C55\u793A": "Task progress display",
  "\u4FDD\u5B58": "Save",
  "\u4FDD\u5B58\u4E2D\u2026": "Saving\u2026",
  "\u53D6\u6D88": "Cancel",
  "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002": "Could not save. Try again."
};
function bindTranslator(locale) {
  const dictionary = { zh, en };
  return (key) => {
    const language = locale?.getSnapshot?.()?.locale ?? "zh";
    const table = dictionary[language] ?? zh;
    return table[key] ?? zh[key] ?? key;
  };
}

// packages/dsh-chat/client/section.js
var React5 = __toESM(require("react"), 1);
var h4 = React5.createElement;
var KNOWN_CHANNEL_PACKAGES = Object.freeze([
  "dsh-chat-feishu",
  "dsh-chat-weixin"
]);
function ChannelMark({ entry }) {
  if (typeof entry.logo === "function") {
    return h4("span", { className: "dchat-channelMark", "aria-hidden": "true" }, h4(entry.logo));
  }
  const initial = entry.id.slice(0, 1).toUpperCase();
  return h4("span", { className: "dchat-channelMark", "aria-hidden": "true" }, initial);
}
function ChatSettingsSection(props) {
  const { channels, chatUi, translate, t: frameworkT, renderSlot } = props;
  const t = typeof translate === "function" ? translate : typeof frameworkT === "function" ? frameworkT : (key) => key;
  const entries = React5.useSyncExternalStore(
    (onChange) => channels.subscribe(onChange),
    () => channels.getSnapshot(),
    () => channels.getSnapshot()
  );
  const [selected, setSelected] = React5.useState(null);
  const activeId = entries.some((entry) => entry.id === selected) ? selected : entries[0]?.id ?? null;
  const EmptyState2 = chatUi?.components?.EmptyState;
  const body = entries.length === 0 ? EmptyState2 ? h4(EmptyState2, {
    title: t("\u672A\u5B89\u88C5\u4EFB\u4F55\u804A\u5929\u8F6F\u4EF6\u63D2\u4EF6"),
    description: t("\u5B89\u88C5\u6E20\u9053\u63D2\u4EF6\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u5BF9\u5E94\u7684\u804A\u5929\u8F6F\u4EF6\u3002")
  }, h4(
    "ul",
    { className: "dchat-list" },
    h4("li", { className: "dchat-listItem" }, t("\u5DF2\u77E5\u6E20\u9053\u63D2\u4EF6")),
    ...KNOWN_CHANNEL_PACKAGES.map((name2) => h4("li", {
      key: name2,
      className: "dchat-listItem"
    }, h4("code", { className: "dchat-code" }, `dsh plugin --profile web add ${name2}`)))
  )) : null : h4(
    "div",
    { className: "dchat-layout" },
    h4(
      "nav",
      { className: "dchat-rail", role: "tablist", "aria-label": t("\u6E20\u9053\u5BFC\u822A") },
      entries.map((entry) => h4(
        "button",
        {
          key: entry.id,
          type: "button",
          role: "tab",
          id: `dchat-tab-${entry.id}`,
          className: "dchat-channel",
          "aria-selected": entry.id === activeId,
          "aria-controls": `dchat-panel-${entry.id}`,
          onClick: () => setSelected(entry.id)
        },
        h4(ChannelMark, { entry }),
        h4(
          "span",
          { className: "dchat-channelLabel" },
          h4("strong", null, entry.label()),
          entry.capabilities?.note ? h4("small", null, entry.capabilities.note) : null
        )
      ))
    ),
    h4("main", {
      className: "dchat-panel",
      role: "tabpanel",
      id: `dchat-panel-${activeId}`,
      "aria-labelledby": `dchat-tab-${activeId}`
    }, typeof renderSlot === "function" ? renderSlot(CHANNEL_PAGE_SLOT, { channelId: activeId }, { entryKey: activeId }) : h4("p", { className: "dchat-cardDescription" }, "\u5F53\u524D\u9875\u9762\u4E0D\u652F\u6301\u6E20\u9053\u5B50\u69FD\u3002"))
  );
  return h4(
    "section",
    { className: "dchat-page", "aria-label": t("Chat\u673A\u5668\u4EBA\u8BBE\u7F6E") },
    h4(
      "header",
      { className: "dchat-header" },
      h4(
        "div",
        { className: "dchat-brand" },
        h4("strong", { className: "dchat-brandName" }, "DSH-Chat"),
        h4("span", { className: "dchat-brandHint" }, t("Chat\u673A\u5668\u4EBA"))
      )
    ),
    body
  );
}

// packages/dsh-chat/client/index.js
var name = "dsh-chat-client";
var inject = ["slots", "connection", "locale"];
function provideService(ctx, serviceName, value) {
  if (typeof ctx?.reflect?.provide === "function") return ctx.reflect.provide(serviceName, value);
  if (typeof ctx?.provide === "function") return ctx.provide(serviceName, value);
  throw new TypeError(`dsh-chat \u9700\u8981 Cordis \u7684 provide \u80FD\u529B\u6765\u53D1\u5E03 ${serviceName} \u670D\u52A1\u3002`);
}
function apply(ctx) {
  ctx.effect(
    () => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
    "dsh-chat: \u53CC\u8BED\u6587\u6848"
  );
  const t = typeof ctx.locale?.bind === "function" ? ctx.locale.bind(LOCALE_NAMESPACE) : bindTranslator(ctx.locale);
  const channels = createChannelRail();
  const chatUi = createChatUi({ ctx, translate: t });
  ctx.effect(
    () => provideService(ctx, CLIENT_CHANNEL_SERVICE, channels),
    "dsh-chat: \u6E20\u9053 rail \u670D\u52A1"
  );
  ctx.effect(
    () => provideService(ctx, CLIENT_UI_SERVICE, chatUi),
    "dsh-chat: \u5171\u4EAB UI \u5957\u4EF6"
  );
  ctx.effect(() => installChatStyles(), "dsh-chat: \u5171\u4EAB\u6837\u5F0F");
  ctx.slots.inject(SETTINGS_SECTION_SLOT, () => ctx.slots.register({
    name: SETTINGS_SECTION_SLOT,
    id: SETTINGS_SECTION_ID,
    order: SETTINGS_SECTION_ORDER,
    label: () => t(SETTINGS_LABEL_KEY),
    locale: LOCALE_NAMESPACE,
    inject: () => ({ channels, chatUi, translate: t, contractVersion: CONTRACT_VERSION }),
    children: {
      [CHANNEL_PAGE_SLOT]: { kind: "keyed", scope: "root" }
    }
  }, ChatSettingsSection));
}

    return module.exports;
  }
});
