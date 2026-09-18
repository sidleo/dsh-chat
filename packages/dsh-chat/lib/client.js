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
function channelIconUri(icon) {
  if (!isPlainObject(icon)) return null;
  if (typeof icon.uri === "string" && icon.uri.startsWith("data:image/")) return icon.uri;
  if (typeof icon.svg === "string" && icon.svg.trim().startsWith("<svg")) {
    return `data:image/svg+xml,${encodeURIComponent(icon.svg)}`;
  }
  return null;
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
     * @param definition - { id, order, label, logo, icon, sessionBadge, capabilities }。
     *   `icon` = `{ svg }` 或 `{ uri }`：渠道图标（设置页卡片与侧边栏会话行共用同一份）。
     *   `sessionBadge` = `{ text, color }`：侧边栏会话行里显示的渠道徽标
     *   （没有会话行插槽，只能靠 hub 的 DOM 增强渲染，见 client/session-badges.js）。
     * @returns 注销函数。
     */
    register(definition) {
      if (!isPlainObject(definition)) throw new TypeError("chatChannels.register \u9700\u8981\u4E00\u4EFD\u6E20\u9053\u5143\u6570\u636E\u5BF9\u8C61\u3002");
      const { id, order, label, logo, icon, sessionBadge, capabilities } = definition;
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
      if (icon !== void 0) {
        const hasSvg = isPlainObject(icon) && typeof icon.svg === "string" && icon.svg.trim().startsWith("<svg");
        const hasUri = isPlainObject(icon) && typeof icon.uri === "string" && icon.uri.startsWith("data:image/");
        if (!hasSvg && !hasUri) {
          throw new TypeError('\u6E20\u9053 icon \u9700\u8981 { svg: "<svg \u2026>" } \u6216 { uri: "data:image/\u2026" }\u3002');
        }
      }
      if (sessionBadge !== void 0) {
        if (!isPlainObject(sessionBadge) || typeof sessionBadge.text !== "string" || !sessionBadge.text) {
          throw new TypeError("\u6E20\u9053 sessionBadge \u9700\u8981 { text, color? }\u3002");
        }
      }
      if (byId.has(id)) throw new Error(`\u6E20\u9053 ${id} \u5DF2\u6CE8\u518C\uFF0C\u4E0D\u80FD\u91CD\u590D\u6CE8\u518C\u3002`);
      const entry = Object.freeze({
        id,
        order,
        label: typeof label === "function" ? label : () => label,
        logo: logo ?? null,
        // 渠道图标：设置页左栏卡片与侧边栏会话行徽标共用。
        // 官方标志常常是位图（favicon 提取），所以既支持 svg 字符串也支持 data URI。
        icon: icon === void 0 ? null : Object.freeze({
          ...typeof icon.svg === "string" ? { svg: icon.svg } : {},
          ...typeof icon.uri === "string" ? { uri: icon.uri } : {}
        }),
        sessionBadge: sessionBadge === void 0 ? null : Object.freeze({ text: sessionBadge.text, color: sessionBadge.color ?? null }),
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
var React5 = __toESM(require("react"), 1);

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

// packages/dsh-chat/client/delivery-targets.js
var React3 = __toESM(require("react"), 1);
var h2 = React3.createElement;
function translatorOf(translate, chatUi) {
  if (typeof translate === "function") return translate;
  if (typeof chatUi?.translate === "function") return chatUi.translate;
  return (key) => key;
}
function TargetRow2({ target, busy, confirming, translate, onSave, onAskRemove, onCancel, onRemove }) {
  const t = translate;
  const route = Object.entries(target.route ?? {}).map(([key, value]) => `${key}=${value}`).join(" \xB7 ");
  const actions = target.discovered ? [h2("button", {
    key: "save",
    type: "button",
    className: "dchat-button dchat-buttonPrimary",
    disabled: busy,
    onClick: () => onSave(target)
  }, t("\u4FDD\u5B58\u4E3A\u6295\u9012\u76EE\u6807"))] : confirming ? [
    h2("button", {
      key: "confirm",
      type: "button",
      className: "dchat-button dchat-buttonDangerSolid",
      disabled: busy,
      onClick: () => onRemove(target)
    }, t("\u786E\u8BA4\u5220\u9664")),
    h2("button", {
      key: "cancel",
      type: "button",
      className: "dchat-button",
      disabled: busy,
      onClick: onCancel
    }, t("\u53D6\u6D88"))
  ] : [h2("button", {
    key: "remove",
    type: "button",
    className: "dchat-button dchat-buttonDanger",
    disabled: busy,
    onClick: onAskRemove
  }, t("\u5220\u9664"))];
  return h2(
    "div",
    { className: "dchat-listItem dchat-deliveryRow" },
    h2(
      "div",
      { className: "dchat-deliveryMeta" },
      h2("strong", null, target.name || target.id),
      // 只留一行身份：`route` 里已经带了 openId/chatId，再挂一个 `p2p_…` 原始 id
      // 就是同一个东西的第二种写法，只会让人怀疑"这是两个不同的目标"。
      h2("small", null, `${target.kind === "group" ? t("\u7FA4\u804A") : t("\u79C1\u804A")} \xB7 ${route}`)
    ),
    h2(
      "div",
      { className: "dchat-actions" },
      target.discovered ? h2("span", { className: "dchat-status" }, t("\u5019\u9009")) : null,
      ...actions
    )
  );
}
function DeliveryTargetsEditor({ chatUi, connection, channelId, botId, translate }) {
  const t = translatorOf(translate, chatUi);
  const { Panel: Panel2 } = chatUi.components;
  const [state, setState] = React3.useState({ phase: "loading", targets: [], canSend: false });
  const [error, setError] = React3.useState(null);
  const [notice, setNotice] = React3.useState(null);
  const [busyId, setBusyId] = React3.useState(null);
  const [confirmingId, setConfirmingId] = React3.useState(null);
  const [draft, setDraft] = React3.useState("");
  const [sendTo, setSendTo] = React3.useState("");
  const call = React3.useCallback(async (method, payload) => {
    const result = await chatUi.callControlRpc(connection, method, payload);
    return chatUi.unwrapRpc(result);
  }, [chatUi, connection]);
  const load = React3.useCallback(async () => {
    try {
      const value = await call("delivery.list", { channelId, botId });
      const targets = value.targets ?? [];
      setState({ phase: "ready", targets, canSend: value.canSend === true });
      setSendTo((current) => {
        const savedIds = targets.filter((target) => !target.discovered).map((target) => target.id);
        return savedIds.includes(current) ? current : savedIds[0] ?? "";
      });
    } catch (cause) {
      setState((current) => ({ ...current, phase: "error" }));
      setError(cause.message);
    }
  }, [call, channelId, botId]);
  React3.useEffect(() => {
    void load();
  }, [load]);
  const run = React3.useCallback(async (key, method, payload, message) => {
    setBusyId(key);
    setError(null);
    setNotice(null);
    try {
      const value = await call(method, payload);
      await load();
      setNotice(typeof message === "function" ? message(value) : message);
      return value;
    } catch (cause) {
      setError(cause.message);
      return null;
    } finally {
      setBusyId(null);
    }
  }, [call, load]);
  const saved = state.targets.filter((target) => !target.discovered);
  const candidates = state.targets.filter((target) => target.discovered);
  return h2(
    Panel2,
    {
      title: t("\u4E3B\u52A8\u6295\u9012"),
      description: t("\u8BA9\u5B9A\u65F6\u4EFB\u52A1\u6216 agent \u628A\u7ED3\u679C\u76F4\u63A5\u53D1\u5230\u6307\u5B9A\u4F1A\u8BDD\uFF1B\u5019\u9009\u6765\u81EA\u4E0E\u8BE5\u673A\u5668\u4EBA\u7684\u5386\u53F2\u4F1A\u8BDD\u3002")
    },
    error ? h2("p", { className: "dchat-error", role: "alert" }, error) : null,
    notice ? h2("p", { className: "dchat-notice", role: "status" }, notice) : null,
    state.phase === "loading" ? h2("p", { className: "dchat-cardDescription" }, t("\u8BFB\u53D6\u4E2D\u2026")) : null,
    state.phase === "ready" && state.canSend === false ? h2("p", { className: "dchat-cardDescription" }, t("\u5F53\u524D\u6E20\u9053\u4E0D\u652F\u6301\u4E3B\u52A8\u6295\u9012\u3002")) : null,
    state.phase === "ready" && state.canSend === true && state.targets.length === 0 ? h2(
      "p",
      { className: "dchat-cardDescription" },
      t("\u8FD8\u6CA1\u6709\u53EF\u6295\u9012\u76EE\u6807\uFF1A\u5148\u4E0E\u673A\u5668\u4EBA\u5BF9\u8BDD\u4E00\u6B21\uFF0C\u4F1A\u8BDD\u4F1A\u4F5C\u4E3A\u5019\u9009\u51FA\u73B0\u5728\u8FD9\u91CC\u3002")
    ) : null,
    state.targets.length > 0 ? h2("div", { className: "dchat-list" }, state.targets.map((target) => h2(TargetRow2, {
      key: target.id,
      target,
      busy: busyId === target.id,
      confirming: confirmingId === target.id,
      translate: t,
      onSave: (item) => {
        void run(item.id, "delivery.save", {
          channelId,
          botId,
          target: { id: item.id, name: item.name, kind: item.kind, route: item.route }
        }, () => t("\u5DF2\u4FDD\u5B58\uFF0C\u73B0\u5728\u53EF\u4EE5\u4E3B\u52A8\u53D1\u6D88\u606F\u4E86\u3002"));
      },
      onAskRemove: () => setConfirmingId(target.id),
      onCancel: () => setConfirmingId(null),
      onRemove: (item) => {
        setConfirmingId(null);
        void run(
          item.id,
          "delivery.remove",
          { channelId, botId, targetId: item.id },
          () => t("\u5DF2\u5220\u9664\u3002")
        );
      }
    }))) : null,
    candidates.length > 0 ? h2(
      "p",
      { className: "dchat-cardDescription" },
      t("\u5019\u9009\u76EE\u6807\u9700\u8981\u5148\u4FDD\u5B58\uFF0C\u4FDD\u5B58\u540E\u624D\u80FD\u4E3B\u52A8\u53D1\u9001\u3002")
    ) : null,
    saved.length > 0 ? h2(
      "div",
      { className: "dchat-deliverySend" },
      h2(
        "label",
        { className: "dchat-scopeLabel", htmlFor: `dchat-delivery-${botId}` },
        t("\u53D1\u4E00\u6761\u6D4B\u8BD5\u6D88\u606F")
      ),
      h2(
        "div",
        { className: "dchat-actions" },
        h2("select", {
          className: "dchat-select",
          value: sendTo,
          "aria-label": t("\u9009\u62E9\u76EE\u6807"),
          onChange: (event) => setSendTo(event.target.value)
        }, saved.map((target) => h2("option", {
          key: target.id,
          value: target.id
        }, `${target.name || target.id}\uFF08${target.kind === "group" ? t("\u7FA4\u804A") : t("\u79C1\u804A")}\uFF09`))),
        h2("button", {
          type: "button",
          className: "dchat-button dchat-buttonPrimary",
          disabled: busyId === "send" || !draft.trim() || !sendTo,
          onClick: () => {
            void run("send", "delivery.send", { channelId, botId, targetId: sendTo, text: draft }).then((value) => {
              if (value !== null) setDraft("");
            });
          }
        }, busyId === "send" ? t("\u53D1\u9001\u4E2D\u2026") : t("\u53D1\u9001"))
      ),
      h2("textarea", {
        id: `dchat-delivery-${botId}`,
        className: "dchat-textarea",
        rows: 2,
        placeholder: t("\u6D4B\u8BD5\u6D88\u606F\u5185\u5BB9"),
        value: draft,
        onChange: (event) => setDraft(event.target.value)
      })
    ) : null
  );
}

// packages/dsh-chat/client/scoped-mode-editor.js
var React4 = __toESM(require("react"), 1);
var h3 = React4.createElement;
function ScopedModeEditor({
  title,
  description,
  scopes,
  options,
  value = {},
  disabled = false,
  saving = false,
  error = null,
  translate,
  onSave
}) {
  const t = typeof translate === "function" ? translate : (key) => key;
  const [draft, setDraft] = React4.useState(() => ({ ...value }));
  const [pending, setPending] = React4.useState(null);
  const [failed, setFailed] = React4.useState(null);
  const [helpFor, setHelpFor] = React4.useState(scopes[0]?.key ?? null);
  const same = (a, b) => scopes.every((scope) => (a[scope.key] ?? null) === (b[scope.key] ?? null));
  const locked = disabled || saving || pending !== null;
  React4.useEffect(() => {
    if (pending !== null) return;
    setDraft((current) => same(current, value) ? current : { ...value });
  }, [value, pending]);
  const choose = async (scopeKey, nextValue) => {
    if (locked) return;
    const next = { ...draft, [scopeKey]: nextValue };
    setDraft(next);
    setFailed(null);
    setPending(scopeKey);
    try {
      await onSave({ ...next });
    } catch (cause) {
      setDraft({ ...value });
      setFailed(cause?.message ?? String(cause));
    } finally {
      setPending(null);
    }
  };
  const savingHint = pending !== null ? h3("span", { className: "dchat-status" }, t("\u4FDD\u5B58\u4E2D\u2026")) : null;
  const help = options.find((option) => option.value === (draft[helpFor] ?? options[0]?.value))?.help;
  return h3(
    "section",
    { className: "dchat-card" },
    h3(
      "div",
      { className: "dchat-cardHeader" },
      h3(
        "div",
        { className: "dchat-cardHeading" },
        h3("h3", { className: "dchat-cardTitle" }, title),
        description ? h3("p", { className: "dchat-cardDescription" }, description) : null
      ),
      savingHint ? h3("div", { className: "dchat-actions" }, savingHint) : null
    ),
    h3("div", { className: "dchat-scopeGrid" }, scopes.map((scope) => {
      const selected = draft[scope.key] ?? options[0]?.value;
      const selectId = `dchat-mode-${scope.key}`;
      return h3(
        "div",
        { key: scope.key, className: "dchat-scopeRow" },
        h3("label", { className: "dchat-scopeLabel", htmlFor: selectId }, scope.label),
        h3("select", {
          id: selectId,
          className: "dchat-select",
          value: selected,
          disabled: locked,
          "aria-label": `${title} \xB7 ${scope.label}`,
          onFocus: () => setHelpFor(scope.key),
          onChange: (event) => {
            setHelpFor(scope.key);
            void choose(scope.key, event.target.value);
          }
        }, options.map((option) => h3("option", {
          key: option.value,
          value: option.value
        }, option.label))),
        scope.key === helpFor && help ? h3("p", { className: "dchat-cardDescription" }, help) : null
      );
    })),
    failed || error ? h3("p", { className: "dchat-error", role: "alert" }, failed ?? error) : null
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
  /* \u53EA\u6709\u300C\u56FE\u6807 + \u6E20\u9053\u540D\u300D\uFF0C\u526F\u6807\u9898\u5728\u53F3\u680F\u6807\u9898\u4E0B\uFF0C\u6240\u4EE5\u8FD9\u91CC\u53EF\u4EE5\u7A84\u4E00\u70B9\uFF0C\u628A\u5BBD\u5EA6\u8BA9\u7ED9\u53F3\u680F\u3002 */
  width: 148px;
  flex: none;
}
.dchat-channel {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  /* \u8FB9\u6846\u59CB\u7EC8\u5360\u4F4D\uFF08\u672A\u9009\u4E2D\u662F\u900F\u660E\u7684\uFF09\uFF0C\u9009\u4E2D/\u672A\u9009\u4E2D\u7684\u5916\u6846\u4E00\u6837\u5927\uFF0C\u5217\u8868\u624D\u4E0D\u4F1A"\u4E00\u5361\u7247 + \u4E00\u88F8\u884C"\u3002 */
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
  /* \u9009\u4E2D\u7684\u7B2C\u4E8C\u4E2A\u4FE1\u53F7\uFF1A\u5DE6\u4FA7\u54C1\u724C\u8272\u7AD6\u6761\uFF08\u53EA\u9760\u5E95\u8272\u5728\u6D45\u8272\u4E3B\u9898\u4E0B\u4E0D\u591F\u660E\u663E\uFF09\u3002 */
  box-shadow: inset 2px 0 0 0 var(--dsw-alias-brand-primary);
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
.dchat-channelMarkIcon {
  width: auto;
  height: auto;
  border: 0;
  background: none;
}
.dchat-channelMarkIcon svg {
  width: 20px;
  height: 20px;
  display: block;
}
.dchat-channelLabel {
  min-width: 0;
}
.dchat-channelLabel strong {
  display: block;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
/* \u5361\u7247\u5957\u5361\u7247\uFF08\u673A\u5668\u4EBA\u5361\u91CC\u653E\u6E20\u9053/\u673A\u5668\u4EBA\u7EA7\u8BBE\u7F6E\u5757\uFF09\u65F6\uFF0C\u5185\u5C42\u53BB\u8FB9\u6846\u3001\u6539\u6210\u5206\u9694\u7EBF\uFF1A
   \u4E24\u5C42\u8FB9\u6846 + \u4E24\u5C42 padding \u4F1A\u8BA9\u7F29\u8FDB\u548C\u89C6\u89C9\u91CD\u91CF\u90FD\u4E71\u6389\u3002 */
.dchat-card .dchat-card {
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 12px 0 0;
  border-top: 1px solid var(--dsw-alias-separator-primary);
}
.dchat-cardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  /* \u653E\u4E0D\u4E0B\u65F6\u628A\u64CD\u4F5C\u6574\u5757\u6298\u5230\u4E0B\u4E00\u884C\uFF0C\u800C\u4E0D\u662F\u628A\u6807\u9898/\u63CF\u8FF0\u538B\u5230\u4E00\u5B57\u4E00\u884C\uFF1A
     \u4E2D\u6587\u7684 min-content \u53EA\u6709 1 \u4E2A\u5B57\uFF0Cflex \u4E00\u65E6\u538B\u7F29\u5C31\u4F1A\u9010\u5B57\u7AD6\u6392\uFF08\u89C1 .dchat-botRow \u540C\u6B3E\u5904\u7406\uFF09\u3002 */
  flex-wrap: wrap;
}
.dchat-cardHeading {
  /* \u957F\u6807\u9898\u9760\u7701\u7565\u53F7\u6536\uFF0C\u4E0D\u62A2\u64CD\u4F5C\u7684\u5BBD\u5EA6\u3002 */
  min-width: 0;
}
.dchat-cardTitle {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dchat-cardDescription {
  margin: 0;
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
.dchat-solo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* \u8FDB\u4E86\u673A\u5668\u4EBA\u8BBE\u7F6E\u5C31\u5360\u6EE1\u6574\u5BBD\uFF1A\u5DE6\u680F\u6E20\u9053\u5217\u8868\u6B64\u65F6\u6CA1\u6709\u610F\u4E49\u3002 */
  width: 100%;
}
.dchat-panelBar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dchat-botList {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dchat-botRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 10px 12px;
}
/* \u300C\u8BBE\u7F6E\u300D\u6309\u94AE\u6C38\u8FDC\u662F\u5185\u5BB9\u5BBD\u5EA6\uFF1Aflex \u9ED8\u8BA4\u7684 min-width:auto \u4F1A\u8BA9\u5B83\u5728\u7A84\u680F\u91CC\u88AB\u538B\u6210\u4E00\u4E2A\u5B57\u5BBD\u3002 */
.dchat-botRow > .dchat-button {
  flex: none;
}
.dchat-botMain {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}
.dchat-botTitle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  min-width: 0;
}
/* \u540D\u79F0\uFF08\u53EF\u80FD\u662F\u5F88\u957F\u7684 botId\uFF09\u8D1F\u8D23\u622A\u65AD\uFF0C\u72B6\u6001\u70B9\u4FDD\u6301\u81EA\u8EAB\u5BBD\u5EA6\u4E0D\u88AB\u538B\u7F29\u3002 */
.dchat-botTitle > strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dchat-botTitle > :not(strong) {
  flex: none;
  white-space: nowrap;
}
.dchat-botMeta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  /* \u653E\u4E0D\u4E0B\u5C31\u6574\u9879\u6362\u884C\uFF0C\u7EDD\u4E0D\u8BA9\u4E2D\u6587\u6309\u5B57\u6298\u884C\uFF08\u6BCF\u4E2A\u6C49\u5B57\u90FD\u662F\u65AD\u884C\u70B9\uFF0C\u4F1A\u88AB\u538B\u6210\u7AD6\u6392\uFF09\u3002 */
  flex-wrap: wrap;
}
.dchat-botMeta > * {
  white-space: nowrap;
}
/* \u8D26\u53F7\u53EF\u80FD\u5F88\u957F\uFF1A\u8BA9\u5B83\u7701\u7565\u53F7\u622A\u65AD\uFF0C\u522B\u628A\u5361\u7247\u6491\u7834\uFF08flex \u9879\u9ED8\u8BA4 min-width:auto \u4E0D\u4F1A\u7F29\uFF09\u3002 */
.dchat-botMeta > .dchat-code {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dchat-botError {
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary);
  word-break: break-word;
}
.dchat-versionMeta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.dchat-updateHint {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}
.dchat-codeBlock {
  display: block;
  padding: 6px 8px;
  overflow-x: auto;
  white-space: nowrap;
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
  /* \u64CD\u4F5C\u5757\u81EA\u8EAB\u4E0D\u538B\u7F29\uFF08\u6298\u884C\u540E\u9760\u4E0B\u9762\u90A3\u6761 margin \u4FDD\u6301\u53F3\u5BF9\u9F50\uFF09\u3002 */
  flex: none;
}
/* \u53EA\u7ED9\u5361\u7247\u5934\u7528\uFF1A\u6298\u5230\u7B2C\u4E8C\u884C\u65F6\u4ECD\u7136\u9760\u53F3\u3002
   \u4E0D\u80FD\u5199\u5728 .dchat-actions \u4E0A\u2014\u2014auto \u5916\u8FB9\u8DDD\u4F1A\u53D6\u6D88\u4EA4\u53C9\u8F74\u7684 stretch\uFF0C
   \u8BA9"\u7AD6\u6392\u5BB9\u5668\u91CC\u7684\u64CD\u4F5C\u884C"\u9000\u5316\u6210\u5185\u5BB9\u5BBD\u5EA6\uFF08\u53D1\u9001\u884C\u7684\u4E0B\u62C9\u6846\u5C31\u7F29\u6210\u4E00\u5C0F\u622A\uFF09\u3002 */
.dchat-cardHeader > .dchat-actions {
  margin-left: auto;
}
.dchat-actions > * {
  white-space: nowrap;
}
/* \u53EA\u6709\u6309\u94AE\u548C\u72B6\u6001\u70B9"\u6C38\u4E0D\u538B\u7F29"\uFF1B\u8F93\u5165\u7C7B\u5FC5\u987B\u80FD\u7F29\uFF0C\u5426\u5219\u4F1A\u6491\u51FA\u6A2A\u5411\u6EDA\u52A8\uFF1A
   `.dchat - select` 是 width:100%，配 flex:none 会先占满整行，再把同排的按钮挤出容器。 */
.dchat-actions > .dchat-button,
.dchat-actions > .dchat-status {
  flex: none;
}
.dchat-actions > select,
.dchat-actions > input {
  flex: 1 1 0;
  min-width: 0;
  width: auto;
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
  /* 中文按钮被压窄时会二字竖排，任何按钮都不允许折行。 */
  white-space: nowrap;
}
.dchat-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dchat-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* 次要入口（如「版本与更新」）：文字链接形态，不和 DSH 自己的实心按钮抢注意力。 */
.dchat-buttonLink {
  border-color: transparent;
  background: transparent;
  color: var(--dsw-alias-link);
  padding-left: 4px;
  padding-right: 4px;
}
.dchat-buttonLink:hover:not(:disabled) {
  background: transparent;
  text-decoration: underline;
}
/* 不可逆操作：触发按钮只染文字，确认按钮才用实底，避免两个同级灰按钮里藏着删除。 */
.dchat-buttonDanger {
  color: var(--dsw-alias-state-error-primary);
}
.dchat-buttonDangerSolid {
  background: var(--dsw-alias-state-error-primary);
  border-color: transparent;
  color: #fff;
}
.dchat-buttonDangerSolid:hover:not(:disabled) {
  background: var(--dsw-alias-state-error-primary);
  opacity: 0.88;
}
.dchat-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  /* 状态点自己永远不折行也不压缩（窄栏里曾被压成「运行正/常」）。 */
  flex: none;
  white-space: nowrap;
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
/* 折叠态的入口行放在卡片里时，跟内层设置块用同一种形态（分隔线 + 整宽 + 同字号标题），
   否则它 40px 高的圆角小盒子夹在两张展开卡片中间，看起来像根分隔线。 */
.dchat-card .dchat-entry {
  width: 100%;
  border: 0;
  border-top: 1px solid var(--dsw-alias-separator-primary);
  border-radius: 0;
  background: transparent;
  padding: 12px 0 0;
}
.dchat-card .dchat-entry .dchat-entryLabel {
  font-size: 14px;
  font-weight: 600;
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
  /* 设置弹层自身是 fixed + z-index:1000，渠道弹窗必须压在其上。 */
  z-index: 1100;
}
.dchat-dialog {
  width: min(640px, 100%);
  /* 自己滚，而不是让外层滚动：否则内容变高时底部按钮会掉出视口。 */
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
  /* 内容很长时按钮始终粘在弹窗底部。 */
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
.dchat-notice {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-state-success-primary);
}
.dchat-deliveryRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dchat-deliveryMeta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dchat-deliveryMeta small {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  /* anywhere 而不是 break-all：只在真的放不下时才断长串，不会把普通词也切碎。 */
  overflow-wrap: anywhere;
}
.dchat-deliverySend {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
var h4 = React5.createElement;
function Panel({ title, description, actions, children }) {
  return h4(
    "section",
    { className: "dchat-card" },
    title || description || actions ? h4(
      "div",
      { className: "dchat-cardHeader" },
      h4(
        "div",
        { className: "dchat-cardHeading" },
        title ? h4("h3", { className: "dchat-cardTitle" }, title) : null,
        description ? h4("p", { className: "dchat-cardDescription" }, description) : null
      ),
      actions ? h4("div", { className: "dchat-actions" }, actions) : null
    ) : null,
    children
  );
}
function EmptyState({ title, description, children }) {
  return h4(
    "div",
    { className: "dchat-empty" },
    h4("span", { className: "dchat-emptyTitle" }, title),
    description ? h4("span", null, description) : null,
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
  return h4("span", {
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
      ScopedModeEditor,
      /** 主动投递目标：清单、候选收编、测试发送（数据经 hub 控制端点）。 */
      DeliveryTargetsEditor
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
    react: React5,
    createElement: h4,
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
  "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002": "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  // 主动投递（共享组件 delivery-targets.js）
  "\u4E3B\u52A8\u6295\u9012": "\u4E3B\u52A8\u6295\u9012",
  "\u8BA9\u5B9A\u65F6\u4EFB\u52A1\u6216 agent \u628A\u7ED3\u679C\u76F4\u63A5\u53D1\u5230\u6307\u5B9A\u4F1A\u8BDD\uFF1B\u5019\u9009\u6765\u81EA\u4E0E\u8BE5\u673A\u5668\u4EBA\u7684\u5386\u53F2\u4F1A\u8BDD\u3002": "\u8BA9\u5B9A\u65F6\u4EFB\u52A1\u6216 agent \u628A\u7ED3\u679C\u76F4\u63A5\u53D1\u5230\u6307\u5B9A\u4F1A\u8BDD\uFF1B\u5019\u9009\u6765\u81EA\u4E0E\u8BE5\u673A\u5668\u4EBA\u7684\u5386\u53F2\u4F1A\u8BDD\u3002",
  "\u79C1\u804A": "\u79C1\u804A",
  "\u7FA4\u804A": "\u7FA4\u804A",
  "\u5019\u9009": "\u5019\u9009",
  "\u4FDD\u5B58\u4E3A\u6295\u9012\u76EE\u6807": "\u4FDD\u5B58\u4E3A\u6295\u9012\u76EE\u6807",
  "\u5220\u9664": "\u5220\u9664",
  "\u786E\u8BA4\u5220\u9664": "\u786E\u8BA4\u5220\u9664",
  "\u5F53\u524D\u6E20\u9053\u4E0D\u652F\u6301\u4E3B\u52A8\u6295\u9012\u3002": "\u5F53\u524D\u6E20\u9053\u4E0D\u652F\u6301\u4E3B\u52A8\u6295\u9012\u3002",
  "\u8FD8\u6CA1\u6709\u53EF\u6295\u9012\u76EE\u6807\uFF1A\u5148\u4E0E\u673A\u5668\u4EBA\u5BF9\u8BDD\u4E00\u6B21\uFF0C\u4F1A\u8BDD\u4F1A\u4F5C\u4E3A\u5019\u9009\u51FA\u73B0\u5728\u8FD9\u91CC\u3002": "\u8FD8\u6CA1\u6709\u53EF\u6295\u9012\u76EE\u6807\uFF1A\u5148\u4E0E\u673A\u5668\u4EBA\u5BF9\u8BDD\u4E00\u6B21\uFF0C\u4F1A\u8BDD\u4F1A\u4F5C\u4E3A\u5019\u9009\u51FA\u73B0\u5728\u8FD9\u91CC\u3002",
  "\u5DF2\u4FDD\u5B58\uFF0C\u73B0\u5728\u53EF\u4EE5\u4E3B\u52A8\u53D1\u6D88\u606F\u4E86\u3002": "\u5DF2\u4FDD\u5B58\uFF0C\u73B0\u5728\u53EF\u4EE5\u4E3B\u52A8\u53D1\u6D88\u606F\u4E86\u3002",
  "\u5DF2\u5220\u9664\u3002": "\u5DF2\u5220\u9664\u3002",
  "\u5019\u9009\u76EE\u6807\u9700\u8981\u5148\u4FDD\u5B58\uFF0C\u4FDD\u5B58\u540E\u624D\u80FD\u4E3B\u52A8\u53D1\u9001\u3002": "\u5019\u9009\u76EE\u6807\u9700\u8981\u5148\u4FDD\u5B58\uFF0C\u4FDD\u5B58\u540E\u624D\u80FD\u4E3B\u52A8\u53D1\u9001\u3002",
  // 版本与更新（version-panel.js）
  "\u5F53\u524D\u9875\u9762\u4E0D\u652F\u6301\u6E20\u9053\u5B50\u69FD\u3002": "\u5F53\u524D\u9875\u9762\u4E0D\u652F\u6301\u6E20\u9053\u5B50\u69FD\u3002",
  "\u8BBE\u7F6E": "\u8BBE\u7F6E",
  "\u673A\u5668\u4EBA": "\u673A\u5668\u4EBA",
  "\u6BCF\u4E2A\u673A\u5668\u4EBA\u4E00\u884C\uFF1B\u70B9\u300C\u8BBE\u7F6E\u300D\u8FDB\u5165\u5B83\u7684\u8BBE\u7F6E\u9875\uFF08\u4E0A\u4E0B\u6587\u589E\u5F3A\u3001\u4E3B\u52A8\u6295\u9012\u3001\u5DE5\u4F5C\u533A\u2026\uFF09\u3002": "\u6BCF\u4E2A\u673A\u5668\u4EBA\u4E00\u884C\uFF1B\u70B9\u300C\u8BBE\u7F6E\u300D\u8FDB\u5165\u5B83\u7684\u8BBE\u7F6E\u9875\uFF08\u4E0A\u4E0B\u6587\u589E\u5F3A\u3001\u4E3B\u52A8\u6295\u9012\u3001\u5DE5\u4F5C\u533A\u2026\uFF09\u3002",
  "\u8FD9\u4E2A\u6E20\u9053\u8FD8\u6CA1\u6709\u673A\u5668\u4EBA": "\u8FD9\u4E2A\u6E20\u9053\u8FD8\u6CA1\u6709\u673A\u5668\u4EBA",
  "\u5728\u6E20\u9053\u8BBE\u7F6E\u9875\u5B8C\u6210\u63A5\u5165\uFF08\u98DE\u4E66\u586B\u5E94\u7528\u51ED\u636E\u3001\u5FAE\u4FE1\u626B\u7801\uFF09\u540E\uFF0C\u673A\u5668\u4EBA\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002": "\u5728\u6E20\u9053\u8BBE\u7F6E\u9875\u5B8C\u6210\u63A5\u5165\uFF08\u98DE\u4E66\u586B\u5E94\u7528\u51ED\u636E\u3001\u5FAE\u4FE1\u626B\u7801\uFF09\u540E\uFF0C\u673A\u5668\u4EBA\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002",
  "\u672A\u547D\u540D\u673A\u5668\u4EBA": "\u672A\u547D\u540D\u673A\u5668\u4EBA",
  "\u8FD9\u53F0\u673A\u5668\u4EBA\u6CA1\u6709\u53EF\u7528\u7684\u8EAB\u4EFD\u6807\u8BC6\uFF0C\u65E0\u6CD5\u5355\u72EC\u914D\u7F6E": "\u8FD9\u53F0\u673A\u5668\u4EBA\u6CA1\u6709\u53EF\u7528\u7684\u8EAB\u4EFD\u6807\u8BC6\uFF0C\u65E0\u6CD5\u5355\u72EC\u914D\u7F6E",
  "\u6E20\u9053\u8BBE\u7F6E": "\u6E20\u9053\u8BBE\u7F6E",
  "\u6253\u5F00\u6E20\u9053\u8BBE\u7F6E\u9875": "\u6253\u5F00\u6E20\u9053\u8BBE\u7F6E\u9875",
  "\u2190 \u673A\u5668\u4EBA\u5217\u8868": "\u2190 \u673A\u5668\u4EBA\u5217\u8868",
  "\u5DF2\u5904\u7406": "\u5DF2\u5904\u7406",
  "\u6700\u8FD1": "\u6700\u8FD1",
  "\u8FD0\u884C\u6B63\u5E38": "\u8FD0\u884C\u6B63\u5E38",
  "\u6B63\u5728\u542F\u52A8": "\u6B63\u5728\u542F\u52A8",
  "\u91CD\u8FDE\u4E2D": "\u91CD\u8FDE\u4E2D",
  "\u5DF2\u505C\u6B62": "\u5DF2\u505C\u6B62",
  "\u7248\u672C\u4E0E\u66F4\u65B0": "\u7248\u672C\u4E0E\u66F4\u65B0",
  "\u6536\u8D77\u7248\u672C\u4E0E\u66F4\u65B0": "\u6536\u8D77\u7248\u672C\u4E0E\u66F4\u65B0",
  "\u5347\u7EA7\u63D2\u4EF6\u540E\u9700\u8981\u91CD\u542F dsh\uFF1B\u53EA\u6539\u8BBE\u7F6E\u9875\u4EE3\u7801\u5219\u5237\u65B0\u9875\u9762\u5373\u53EF\u3002": "\u5347\u7EA7\u63D2\u4EF6\u540E\u9700\u8981\u91CD\u542F dsh\uFF1B\u53EA\u6539\u8BBE\u7F6E\u9875\u4EE3\u7801\u5219\u5237\u65B0\u9875\u9762\u5373\u53EF\u3002",
  "Chat\u673A\u5668\u4EBA\u5185\u6838": "Chat\u673A\u5668\u4EBA\u5185\u6838",
  "\u6E20\u9053\u5951\u7EA6\u7248\u672C": "\u6E20\u9053\u5951\u7EA6\u7248\u672C",
  "\u6570\u636E\u76EE\u5F55": "\u6570\u636E\u76EE\u5F55",
  "\u65E5\u5FD7\u76EE\u5F55": "\u65E5\u5FD7\u76EE\u5F55",
  "\u8BFB\u53D6\u5931\u8D25": "\u8BFB\u53D6\u5931\u8D25",
  "\u66F4\u65B0\u65B9\u5F0F\uFF1A\u5728\u4ED3\u5E93\u91CC\u62C9\u53D6\u65B0\u4EE3\u7801\u540E\u91CD\u65B0\u6253\u5305\uFF0C\u518D\u8BA9 DSH \u91CD\u65B0\u52A0\u8F7D\u63D2\u4EF6\u3002": "\u66F4\u65B0\u65B9\u5F0F\uFF1A\u5728\u4ED3\u5E93\u91CC\u62C9\u53D6\u65B0\u4EE3\u7801\u540E\u91CD\u65B0\u6253\u5305\uFF0C\u518D\u8BA9 DSH \u91CD\u65B0\u52A0\u8F7D\u63D2\u4EF6\u3002",
  "\u53D1\u4E00\u6761\u6D4B\u8BD5\u6D88\u606F": "\u53D1\u4E00\u6761\u6D4B\u8BD5\u6D88\u606F",
  "\u9009\u62E9\u76EE\u6807": "\u9009\u62E9\u76EE\u6807",
  "\u53D1\u9001": "\u53D1\u9001",
  "\u53D1\u9001\u4E2D\u2026": "\u53D1\u9001\u4E2D\u2026",
  "\u6D4B\u8BD5\u6D88\u606F\u5185\u5BB9": "\u6D4B\u8BD5\u6D88\u606F\u5185\u5BB9"
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
  "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002": "Could not save. Try again.",
  // 主动投递
  "\u4E3B\u52A8\u6295\u9012": "Proactive delivery",
  "\u8BA9\u5B9A\u65F6\u4EFB\u52A1\u6216 agent \u628A\u7ED3\u679C\u76F4\u63A5\u53D1\u5230\u6307\u5B9A\u4F1A\u8BDD\uFF1B\u5019\u9009\u6765\u81EA\u4E0E\u8BE5\u673A\u5668\u4EBA\u7684\u5386\u53F2\u4F1A\u8BDD\u3002": "Let a scheduled job or an agent push results straight into a conversation. Candidates come from conversations this bot has already taken part in.",
  "\u79C1\u804A": "Direct",
  "\u7FA4\u804A": "Group",
  "\u5019\u9009": "Candidate",
  "\u4FDD\u5B58\u4E3A\u6295\u9012\u76EE\u6807": "Save as target",
  "\u5220\u9664": "Delete",
  "\u786E\u8BA4\u5220\u9664": "Confirm delete",
  "\u5F53\u524D\u6E20\u9053\u4E0D\u652F\u6301\u4E3B\u52A8\u6295\u9012\u3002": "This channel does not support proactive delivery.",
  "\u8FD8\u6CA1\u6709\u53EF\u6295\u9012\u76EE\u6807\uFF1A\u5148\u4E0E\u673A\u5668\u4EBA\u5BF9\u8BDD\u4E00\u6B21\uFF0C\u4F1A\u8BDD\u4F1A\u4F5C\u4E3A\u5019\u9009\u51FA\u73B0\u5728\u8FD9\u91CC\u3002": "No delivery target yet: talk to the bot once and the conversation shows up here as a candidate.",
  "\u5DF2\u4FDD\u5B58\uFF0C\u73B0\u5728\u53EF\u4EE5\u4E3B\u52A8\u53D1\u6D88\u606F\u4E86\u3002": "Saved. You can now send proactively.",
  "\u5DF2\u5220\u9664\u3002": "Deleted.",
  "\u5019\u9009\u76EE\u6807\u9700\u8981\u5148\u4FDD\u5B58\uFF0C\u4FDD\u5B58\u540E\u624D\u80FD\u4E3B\u52A8\u53D1\u9001\u3002": "A candidate must be saved before it can receive proactive messages.",
  "\u5F53\u524D\u9875\u9762\u4E0D\u652F\u6301\u6E20\u9053\u5B50\u69FD\u3002": "This page does not support channel sub-slots.",
  "\u8BBE\u7F6E": "Settings",
  "\u673A\u5668\u4EBA": "Bots",
  "\u6BCF\u4E2A\u673A\u5668\u4EBA\u4E00\u884C\uFF1B\u70B9\u300C\u8BBE\u7F6E\u300D\u8FDB\u5165\u5B83\u7684\u8BBE\u7F6E\u9875\uFF08\u4E0A\u4E0B\u6587\u589E\u5F3A\u3001\u4E3B\u52A8\u6295\u9012\u3001\u5DE5\u4F5C\u533A\u2026\uFF09\u3002": "One row per bot; click Settings to open its page (context enhancement, proactive delivery, workspace\u2026).",
  "\u8FD9\u4E2A\u6E20\u9053\u8FD8\u6CA1\u6709\u673A\u5668\u4EBA": "No bot on this channel yet",
  "\u5728\u6E20\u9053\u8BBE\u7F6E\u9875\u5B8C\u6210\u63A5\u5165\uFF08\u98DE\u4E66\u586B\u5E94\u7528\u51ED\u636E\u3001\u5FAE\u4FE1\u626B\u7801\uFF09\u540E\uFF0C\u673A\u5668\u4EBA\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002": "Finish onboarding on the channel page (Feishu app credentials, WeChat QR scan) and the bot shows up here.",
  "\u672A\u547D\u540D\u673A\u5668\u4EBA": "Unnamed bot",
  "\u8FD9\u53F0\u673A\u5668\u4EBA\u6CA1\u6709\u53EF\u7528\u7684\u8EAB\u4EFD\u6807\u8BC6\uFF0C\u65E0\u6CD5\u5355\u72EC\u914D\u7F6E": "This bot has no usable identity, so it cannot be configured separately",
  "\u6E20\u9053\u8BBE\u7F6E": "Channel settings",
  "\u6253\u5F00\u6E20\u9053\u8BBE\u7F6E\u9875": "Open channel settings",
  "\u2190 \u673A\u5668\u4EBA\u5217\u8868": "\u2190 Bot list",
  "\u5DF2\u5904\u7406": "Handled",
  "\u6700\u8FD1": "Last",
  "\u8FD0\u884C\u6B63\u5E38": "Running",
  "\u6B63\u5728\u542F\u52A8": "Starting",
  "\u91CD\u8FDE\u4E2D": "Reconnecting",
  "\u5DF2\u505C\u6B62": "Stopped",
  "\u7248\u672C\u4E0E\u66F4\u65B0": "Version & updates",
  "\u6536\u8D77\u7248\u672C\u4E0E\u66F4\u65B0": "Hide version & updates",
  "\u5347\u7EA7\u63D2\u4EF6\u540E\u9700\u8981\u91CD\u542F dsh\uFF1B\u53EA\u6539\u8BBE\u7F6E\u9875\u4EE3\u7801\u5219\u5237\u65B0\u9875\u9762\u5373\u53EF\u3002": "Upgrading the plugin needs a dsh restart; settings-only changes just need a page refresh.",
  "Chat\u673A\u5668\u4EBA\u5185\u6838": "Chat bot core",
  "\u6E20\u9053\u5951\u7EA6\u7248\u672C": "Channel contract version",
  "\u6570\u636E\u76EE\u5F55": "Data directory",
  "\u65E5\u5FD7\u76EE\u5F55": "Log directory",
  "\u8BFB\u53D6\u5931\u8D25": "Failed to read",
  "\u66F4\u65B0\u65B9\u5F0F\uFF1A\u5728\u4ED3\u5E93\u91CC\u62C9\u53D6\u65B0\u4EE3\u7801\u540E\u91CD\u65B0\u6253\u5305\uFF0C\u518D\u8BA9 DSH \u91CD\u65B0\u52A0\u8F7D\u63D2\u4EF6\u3002": "To update: pull the repo, rebuild, then let DSH reload the plugin.",
  "\u53D1\u4E00\u6761\u6D4B\u8BD5\u6D88\u606F": "Send a test message",
  "\u9009\u62E9\u76EE\u6807": "Choose a target",
  "\u53D1\u9001": "Send",
  "\u53D1\u9001\u4E2D\u2026": "Sending\u2026",
  "\u6D4B\u8BD5\u6D88\u606F\u5185\u5BB9": "Test message"
};
function bindTranslator(locale) {
  const dictionary = { zh, en };
  return (key) => {
    const language = locale?.getSnapshot?.()?.locale ?? "zh";
    const table = dictionary[language] ?? zh;
    return table[key] ?? zh[key] ?? key;
  };
}

// packages/dsh-chat/client/session-badges.js
var STYLE_ID2 = "dsh-chat-session-badges";
var CHANNEL_ATTR = "data-dsh-chat-channel";
var TITLE_ATTR = "data-dsh-chat-title";
var ROW_SELECTOR = '[role="treeitem"][aria-selected]';
function badgeUri({ text, color }, size = 16) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="4" fill="${color}"/><text x="${size / 2}" y="${size / 2 + 3.4}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif" font-size="9.5" font-weight="600" fill="#ffffff">${text}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
function stylesheet(uris) {
  const mapping = Object.entries(uris).map(([channel, uri]) => `[${CHANNEL_ATTR}="${channel}"] { --dchat-session-badge: url("${uri}"); }`).join("\n");
  return `
[${CHANNEL_ATTR}][${TITLE_ATTR}] {
  position: relative;
  -webkit-text-fill-color: transparent;
  text-overflow: clip !important;
  overflow: hidden;
}
[${CHANNEL_ATTR}][${TITLE_ATTR}]::before {
  content: "";
  position: absolute;
  inset-inline-start: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  background: var(--dchat-session-badge) center / contain no-repeat;
  pointer-events: none;
}
[${CHANNEL_ATTR}][${TITLE_ATTR}]::after {
  content: attr(${TITLE_ATTR}) / "";
  position: absolute;
  inset: 0;
  inset-inline-start: 22px;
  -webkit-text-fill-color: currentColor;
  text-indent: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: none;
}
${mapping}
`;
}
function findChannelTitle(row, known) {
  if (!row || typeof row.querySelectorAll !== "function" || known.length === 0) return null;
  let found = null;
  for (const element of row.querySelectorAll("*")) {
    if (element.children?.length > 0) continue;
    const text = element.textContent;
    if (!text) continue;
    for (const [channel, label] of known) {
      if (text.startsWith(`${label} \xB7 `)) {
        found = { element, channel, text: text.slice(label.length + 3).trim() };
      }
    }
  }
  return found;
}
function installSessionBadges({
  channels,
  doc = globalThis.document,
  win = globalThis.window
} = {}) {
  if (!doc?.body || typeof win?.MutationObserver !== "function") return () => {
  };
  const badges = /* @__PURE__ */ new Map();
  const ready = /* @__PURE__ */ new Set();
  const owned = /* @__PURE__ */ new Map();
  const queued = /* @__PURE__ */ new Set();
  const images = [];
  let closed = false;
  let scheduled = false;
  const style = doc.createElement("style");
  style.id = STYLE_ID2;
  doc.head?.appendChild(style);
  function labels() {
    return [...badges.values()].filter((entry) => ready.has(entry.channel)).map((entry) => [entry.channel, entry.label]);
  }
  function titleOf(row) {
    return findChannelTitle(row, labels());
  }
  function restore(element) {
    const previous = owned.get(element);
    if (!previous) return;
    owned.delete(element);
    for (const [attribute, value] of previous) {
      if (value === null) element.removeAttribute(attribute);
      else element.setAttribute(attribute, value);
    }
  }
  function update(row) {
    const found = row.isConnected ? titleOf(row) : null;
    for (const marked of row.querySelectorAll(`[${CHANNEL_ATTR}]`)) {
      if (marked !== found?.element) restore(marked);
    }
    if (!found) return;
    if (!owned.has(found.element)) {
      owned.set(found.element, [CHANNEL_ATTR, TITLE_ATTR].map((attribute) => [attribute, found.element.getAttribute(attribute)]));
    }
    found.element.setAttribute(CHANNEL_ATTR, found.channel);
    found.element.setAttribute(TITLE_ATTR, found.text);
  }
  function schedule() {
    if (closed || scheduled || queued.size === 0) return;
    scheduled = true;
    win.queueMicrotask(() => {
      scheduled = false;
      if (closed) return;
      const rows = [...queued];
      queued.clear();
      for (const row of rows) {
        try {
          update(row);
        } catch {
          for (const marked of row.querySelectorAll(`[${CHANNEL_ATTR}]`)) restore(marked);
        }
      }
    });
  }
  function collect(node, descendants = false) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    if (!element) return;
    const row = element.closest(ROW_SELECTOR);
    if (row) queued.add(row);
    if (descendants) for (const child of element.querySelectorAll(ROW_SELECTOR)) queued.add(child);
    if (owned.has(element)) {
      const owner = element.closest(ROW_SELECTOR);
      if (owner) queued.add(owner);
      else restore(element);
    }
    schedule();
  }
  function applyBadges() {
    if (closed) return;
    badges.clear();
    for (const entry of channels?.getSnapshot?.() ?? []) {
      const badge = entry.sessionBadge;
      if (!badge || typeof badge.text !== "string" || !badge.text) continue;
      const label = typeof entry.label === "function" ? entry.label() : entry.label;
      badges.set(entry.id, {
        channel: entry.id,
        label: String(label ?? entry.id),
        // 优先用渠道自己的图标（和设置页左栏同一份）；没给图标才退回字徽标。
        uri: channelIconUri(entry.icon) ?? badgeUri({ text: badge.text, color: badge.color ?? "#3370ff" })
      });
    }
    style.textContent = stylesheet(Object.fromEntries(
      [...badges].map(([id, badge]) => [id, badge.uri])
    ));
    for (const [id, badge] of badges) {
      if (ready.has(id)) continue;
      const image = new win.Image();
      images.push(image);
      image.onload = () => {
        ready.add(id);
        for (const row of doc.querySelectorAll(ROW_SELECTOR)) queued.add(row);
        schedule();
      };
      image.src = badge.uri;
    }
    for (const row of doc.querySelectorAll(ROW_SELECTOR)) queued.add(row);
    schedule();
  }
  const observer = new win.MutationObserver((records) => {
    if (closed) return;
    for (const record of records) {
      collect(record.target, record.type === "attributes");
      if (record.type !== "childList") continue;
      for (const node of record.addedNodes) collect(node, true);
      for (const node of record.removedNodes) {
        if (node.nodeType !== 1 || node.isConnected) continue;
        if (owned.has(node)) restore(node);
        for (const marked of node.querySelectorAll(`[${CHANNEL_ATTR}]`)) restore(marked);
      }
    }
  });
  observer.observe(doc.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "role", "aria-selected"]
  });
  const unsubscribe = channels?.subscribe?.(applyBadges);
  applyBadges();
  return () => {
    closed = true;
    observer.disconnect();
    unsubscribe?.();
    for (const image of images) {
      image.onload = null;
      image.src = "";
    }
    for (const element of [...owned.keys()]) restore(element);
    style.remove();
  };
}

// packages/dsh-chat/client/section.js
var React8 = __toESM(require("react"), 1);

// packages/dsh-chat/client/bot-list.js
var React6 = __toESM(require("react"), 1);
var h5 = React6.createElement;
var STATE_TEXT = Object.freeze({
  running: "\u8FD0\u884C\u6B63\u5E38",
  starting: "\u6B63\u5728\u542F\u52A8",
  reconnecting: "\u91CD\u8FDE\u4E2D",
  failed: "\u542F\u52A8\u5931\u8D25",
  stopped: "\u5DF2\u505C\u6B62"
});
var TONES2 = Object.freeze({
  running: "success",
  starting: "warning",
  reconnecting: "warning",
  failed: "error"
});
function normalizeBots(value) {
  if (Array.isArray(value?.bots)) return value.bots;
  if (Array.isArray(value?.accounts)) return value.accounts;
  return [];
}
function botKeyOf(bot) {
  if (!bot || typeof bot !== "object") return null;
  const key = bot.botId ?? bot.id ?? null;
  return typeof key === "string" && key.length > 0 ? key : null;
}
function formatTime(value) {
  if (!value) return "\u2014";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return "\u2014";
  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(time.getMonth() + 1)}-${pad(time.getDate())} ${pad(time.getHours())}:${pad(time.getMinutes())}`;
}
function BotList(props) {
  const { channelId, label, note, connection, chatUi, translate, t: frameworkT, onOpenSettings } = props;
  const t = typeof translate === "function" ? translate : typeof frameworkT === "function" ? frameworkT : (key) => key;
  const [state, setState] = React6.useState({ phase: "loading", bots: [], error: null });
  const load = React6.useCallback(() => {
    setState((current) => ({ ...current, phase: "loading", error: null }));
    chatUi.callChannelRpc(connection, channelId, "connection.status", {}).then((result) => {
      setState({ phase: "ready", bots: normalizeBots(chatUi.unwrapRpc(result)), error: null });
    }).catch((error) => {
      setState({ phase: "error", bots: [], error: error?.message ?? String(error) });
    });
  }, [channelId, chatUi, connection]);
  React6.useEffect(() => {
    load();
  }, [load]);
  const { Panel: Panel2, EmptyState: EmptyState2, StatusPill: StatusPill2 } = chatUi.components;
  const bots = state.bots;
  return h5(
    Panel2,
    {
      title: `${label()} \xB7 ${t("\u673A\u5668\u4EBA")}`,
      description: note || null,
      actions: h5(
        "div",
        { className: "dchat-actions" },
        // 渠道级设置（飞书 dataDir/读取状态、微信扫码接入）与"某台机器人的设置"分开：
        // 进了单台机器人的设置页就不再掺渠道级面板，这里是指向渠道页的唯一常驻入口。
        h5("button", {
          type: "button",
          className: "dchat-button dchat-buttonLink",
          onClick: () => onOpenSettings(null)
        }, t("\u6E20\u9053\u8BBE\u7F6E")),
        h5("button", {
          type: "button",
          className: "dchat-button",
          onClick: load,
          disabled: state.phase === "loading"
        }, state.phase === "loading" ? t("\u8BFB\u53D6\u4E2D\u2026") : t("\u91CD\u65B0\u8BFB\u53D6"))
      )
    },
    state.error ? h5("p", { className: "dchat-error" }, `${t("\u8BFB\u53D6\u5931\u8D25")}\uFF1A${state.error}`) : null,
    state.phase !== "loading" && bots.length === 0 ? h5(EmptyState2, {
      title: t("\u8FD9\u4E2A\u6E20\u9053\u8FD8\u6CA1\u6709\u673A\u5668\u4EBA"),
      description: t("\u5728\u6E20\u9053\u8BBE\u7F6E\u9875\u5B8C\u6210\u63A5\u5165\uFF08\u98DE\u4E66\u586B\u5E94\u7528\u51ED\u636E\u3001\u5FAE\u4FE1\u626B\u7801\uFF09\u540E\uFF0C\u673A\u5668\u4EBA\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002")
    }, h5("button", {
      type: "button",
      className: "dchat-button",
      onClick: () => onOpenSettings(null)
    }, t("\u6253\u5F00\u6E20\u9053\u8BBE\u7F6E\u9875"))) : null,
    bots.length > 0 ? h5("ul", { className: "dchat-botList" }, bots.map((bot, index) => {
      const identity = botKeyOf(bot);
      const title = bot.name || identity || t("\u672A\u547D\u540D\u673A\u5668\u4EBA");
      const showIdentity = Boolean(identity) && identity !== title;
      return h5(
        "li",
        {
          key: identity ?? `row-${index}`,
          className: "dchat-botRow"
        },
        h5(
          "div",
          { className: "dchat-botMain" },
          h5(
            "div",
            { className: "dchat-botTitle" },
            h5("strong", { title }, title),
            h5(StatusPill2, { status: bot.state, label: t(STATE_TEXT[bot.state] ?? "\u5DF2\u505C\u6B62") })
          ),
          h5(
            "div",
            { className: "dchat-botMeta" },
            showIdentity ? h5("span", { className: "dchat-code" }, identity) : null,
            h5("span", null, `${t("\u5DF2\u5904\u7406")} ${bot.handled ?? 0}`),
            h5("span", null, `${t("\u6700\u8FD1")} ${formatTime(bot.lastHandledAt)}`)
          ),
          bot.errorMessage || bot.lastError ? h5("div", { className: "dchat-botError" }, bot.errorMessage ?? bot.lastError) : null
        ),
        h5("button", {
          type: "button",
          className: "dchat-button",
          // 身份取不到就不能进"这台机器人的设置"——那会静默变成"整个渠道的设置"。
          disabled: identity === null,
          title: identity ?? t("\u8FD9\u53F0\u673A\u5668\u4EBA\u6CA1\u6709\u53EF\u7528\u7684\u8EAB\u4EFD\u6807\u8BC6\uFF0C\u65E0\u6CD5\u5355\u72EC\u914D\u7F6E"),
          onClick: () => onOpenSettings(identity)
        }, t("\u8BBE\u7F6E"))
      );
    })) : null
  );
}

// packages/dsh-chat/client/version-panel.js
var React7 = __toESM(require("react"), 1);
var h6 = React7.createElement;
var CHANNEL_PACKAGE_HINTS = Object.freeze({
  feishu: "dsh-chat-feishu",
  weixin: "dsh-chat-weixin"
});
function VersionPanel(props) {
  const { connection, chatUi, translate, t: frameworkT } = props;
  const t = typeof translate === "function" ? translate : typeof frameworkT === "function" ? frameworkT : (key) => key;
  const [state, setState] = React7.useState({ loading: true, error: null, info: null });
  const load = React7.useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    chatUi.callControlRpc(connection, "channel.list", {}).then((result) => {
      setState({ loading: false, error: null, info: chatUi.unwrapRpc(result) });
    }).catch((error) => {
      setState({ loading: false, error: error?.message ?? String(error), info: null });
    });
  }, [chatUi, connection]);
  React7.useEffect(() => {
    load();
  }, [load]);
  const Panel2 = chatUi.components.Panel;
  const StatusPill2 = chatUi.components.StatusPill;
  const info = state.info;
  return h6(
    Panel2,
    {
      title: t("\u7248\u672C\u4E0E\u66F4\u65B0"),
      description: t("\u5347\u7EA7\u63D2\u4EF6\u540E\u9700\u8981\u91CD\u542F dsh\uFF1B\u53EA\u6539\u8BBE\u7F6E\u9875\u4EE3\u7801\u5219\u5237\u65B0\u9875\u9762\u5373\u53EF\u3002"),
      actions: h6("button", {
        type: "button",
        className: "dchat-button",
        onClick: load,
        disabled: state.loading
      }, state.loading ? t("\u8BFB\u53D6\u4E2D\u2026") : t("\u91CD\u65B0\u8BFB\u53D6"))
    },
    state.error ? h6("p", { className: "dchat-error" }, `${t("\u8BFB\u53D6\u5931\u8D25")}\uFF1A${state.error}`) : null,
    h6(
      "ul",
      { className: "dchat-list" },
      h6(
        "li",
        { className: "dchat-listItem" },
        h6("span", null, t("Chat\u673A\u5668\u4EBA\u5185\u6838")),
        h6(
          "code",
          { className: "dchat-code" },
          `${info?.hubPackage ?? "dsh-chat"} ${info?.hubVersion ?? "\u2026"}`
        )
      ),
      h6(
        "li",
        { className: "dchat-listItem" },
        h6("span", null, t("\u6E20\u9053\u5951\u7EA6\u7248\u672C")),
        h6("code", { className: "dchat-code" }, `v${info?.contractVersion ?? "\u2026"}`)
      ),
      ...(info?.channels ?? []).map((channel) => h6(
        "li",
        {
          key: channel.id,
          className: "dchat-listItem"
        },
        h6("span", null, `${channel.label} \xB7 ${CHANNEL_PACKAGE_HINTS[channel.id] ?? channel.id}`),
        h6(
          "span",
          { className: "dchat-versionMeta" },
          h6("code", { className: "dchat-code" }, channel.version ?? "\u2014"),
          h6(StatusPill2, {
            status: channel.status,
            label: channel.status === "running" ? t("\u6E20\u9053\u5DF2\u5C31\u7EEA") : channel.error ? t("\u6E20\u9053\u542F\u52A8\u5931\u8D25") : t("\u6E20\u9053\u6B63\u5728\u542F\u52A8")
          })
        )
      ))
    ),
    info?.dataDir ? h6(
      "ul",
      { className: "dchat-list" },
      h6(
        "li",
        { className: "dchat-listItem" },
        h6("span", null, t("\u6570\u636E\u76EE\u5F55")),
        h6("code", { className: "dchat-code" }, info.dataDir)
      ),
      h6(
        "li",
        { className: "dchat-listItem" },
        h6("span", null, t("\u65E5\u5FD7\u76EE\u5F55")),
        h6("code", { className: "dchat-code" }, info.logDir)
      )
    ) : null,
    h6(
      "div",
      { className: "dchat-updateHint" },
      h6("p", { className: "dchat-cardDescription" }, t("\u66F4\u65B0\u65B9\u5F0F\uFF1A\u5728\u4ED3\u5E93\u91CC\u62C9\u53D6\u65B0\u4EE3\u7801\u540E\u91CD\u65B0\u6253\u5305\uFF0C\u518D\u8BA9 DSH \u91CD\u65B0\u52A0\u8F7D\u63D2\u4EF6\u3002")),
      h6("code", { className: "dchat-code dchat-codeBlock" }, "npm run check"),
      h6(
        "code",
        { className: "dchat-code dchat-codeBlock" },
        "dsh plugin --profile web add <\u672C\u4ED3\u5E93 packages/dsh-chat \u7684\u7EDD\u5BF9\u8DEF\u5F84>"
      )
    )
  );
}

// packages/dsh-chat/client/section.js
var h7 = React8.createElement;
var KNOWN_CHANNEL_PACKAGES = Object.freeze([
  "dsh-chat-feishu",
  "dsh-chat-weixin"
]);
function ChannelMark({ entry }) {
  const iconUri = channelIconUri(entry.icon);
  if (iconUri) {
    return h7("span", {
      // 有真图标就不套那个"字母块"的边框与底色，让它看起来就是应用图标。
      className: "dchat-channelMark dchat-channelMarkIcon",
      "aria-hidden": "true"
    }, h7("img", { src: iconUri, alt: "", width: 20, height: 20 }));
  }
  if (typeof entry.logo === "function") {
    return h7("span", { className: "dchat-channelMark", "aria-hidden": "true" }, h7(entry.logo));
  }
  const initial = entry.id.slice(0, 1).toUpperCase();
  return h7("span", { className: "dchat-channelMark", "aria-hidden": "true" }, initial);
}
function ChatSettingsSection(props) {
  const { channels, chatUi, translate, t: frameworkT, renderSlot, connection } = props;
  const [showVersions, setShowVersions] = React8.useState(false);
  const [view, setView] = React8.useState({ kind: "bots", botId: null });
  const t = typeof translate === "function" ? translate : typeof frameworkT === "function" ? frameworkT : (key) => key;
  const entries = React8.useSyncExternalStore(
    (onChange) => channels.subscribe(onChange),
    () => channels.getSnapshot(),
    () => channels.getSnapshot()
  );
  const [selected, setSelected] = React8.useState(null);
  const activeId = entries.some((entry) => entry.id === selected) ? selected : entries[0]?.id ?? null;
  const activeEntry = entries.find((entry) => entry.id === activeId) ?? null;
  const openSettings = (botId) => setView({ kind: "channel", botId });
  const backToBots = () => setView({ kind: "bots", botId: null });
  const EmptyState2 = chatUi?.components?.EmptyState;
  function botListView() {
    if (!activeEntry) return null;
    return h7(BotList, {
      key: activeEntry.id,
      channelId: activeEntry.id,
      label: activeEntry.label,
      // 渠道能力说明（如「仅私聊」）放右栏标题下：左栏只留"图标 + 渠道名"，形态才整齐。
      note: activeEntry.capabilities?.note ?? null,
      connection,
      chatUi,
      translate: t,
      onOpenSettings: openSettings
    });
  }
  function channelView() {
    return h7(
      React8.Fragment,
      null,
      typeof renderSlot === "function" ? renderSlot(
        CHANNEL_PAGE_SLOT,
        { channelId: activeId, botId: view.botId },
        { entryKey: activeId }
      ) : h7("p", { className: "dchat-cardDescription" }, t("\u5F53\u524D\u9875\u9762\u4E0D\u652F\u6301\u6E20\u9053\u5B50\u69FD\u3002"))
    );
  }
  function backBar() {
    return h7(
      "div",
      { className: "dchat-panelBar" },
      h7("button", {
        type: "button",
        className: "dchat-button",
        onClick: backToBots
      }, t("\u2190 \u673A\u5668\u4EBA\u5217\u8868"))
    );
  }
  let body = null;
  if (entries.length === 0) {
    body = EmptyState2 ? h7(EmptyState2, {
      title: t("\u672A\u5B89\u88C5\u4EFB\u4F55\u804A\u5929\u8F6F\u4EF6\u63D2\u4EF6"),
      description: t("\u5B89\u88C5\u6E20\u9053\u63D2\u4EF6\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u5BF9\u5E94\u7684\u804A\u5929\u8F6F\u4EF6\u3002")
    }, h7(
      "ul",
      { className: "dchat-list" },
      h7("li", { className: "dchat-listItem" }, t("\u5DF2\u77E5\u6E20\u9053\u63D2\u4EF6")),
      ...KNOWN_CHANNEL_PACKAGES.map((name2) => h7("li", {
        key: name2,
        className: "dchat-listItem"
      }, h7("code", { className: "dchat-code" }, `dsh plugin --profile web add ${name2}`)))
    )) : null;
  } else if (view.kind !== "bots") {
    body = h7("div", { className: "dchat-solo" }, backBar(), channelView());
  } else {
    body = h7(
      "div",
      { className: "dchat-layout" },
      h7(
        "nav",
        { className: "dchat-rail", role: "tablist", "aria-label": t("\u6E20\u9053\u5BFC\u822A") },
        entries.map((entry) => h7(
          "button",
          {
            key: entry.id,
            type: "button",
            role: "tab",
            id: `dchat-tab-${entry.id}`,
            className: "dchat-channel",
            "aria-selected": entry.id === activeId,
            "aria-controls": `dchat-panel-${entry.id}`,
            onClick: () => {
              setSelected(entry.id);
              backToBots();
            }
          },
          h7(ChannelMark, { entry }),
          h7(
            "span",
            { className: "dchat-channelLabel" },
            h7("strong", null, entry.label())
          )
        ))
      ),
      h7("main", {
        className: "dchat-panel",
        role: "tabpanel",
        id: `dchat-panel-${activeId}`,
        "aria-labelledby": `dchat-tab-${activeId}`
      }, botListView())
    );
  }
  return h7(
    "section",
    { className: "dchat-page", "aria-label": t("Chat\u673A\u5668\u4EBA\u8BBE\u7F6E") },
    h7(
      "header",
      { className: "dchat-header" },
      h7(
        "div",
        { className: "dchat-brand" },
        h7("strong", { className: "dchat-brandName" }, "DSH-Chat"),
        h7("span", { className: "dchat-brandHint" }, t("Chat\u673A\u5668\u4EBA"))
      ),
      // 右上角入口：版本与更新（展开后是同一块面板，收起时不请求数据）。
      // 用文字链接形态，避免和 DSH 自己的实心按钮（打开配置文件）平级抢注意力。
      h7("button", {
        type: "button",
        className: "dchat-button dchat-buttonLink",
        "aria-expanded": showVersions,
        onClick: () => setShowVersions((open) => !open)
      }, showVersions ? t("\u6536\u8D77\u7248\u672C\u4E0E\u66F4\u65B0") : t("\u7248\u672C\u4E0E\u66F4\u65B0"))
    ),
    showVersions ? h7(VersionPanel, { connection, chatUi, translate: t }) : null,
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
  ctx.effect(() => installSessionBadges({ channels }), "dsh-chat: \u4F1A\u8BDD\u6E20\u9053\u5FBD\u6807");
  ctx.slots.inject(SETTINGS_SECTION_SLOT, () => ctx.slots.register({
    name: SETTINGS_SECTION_SLOT,
    id: SETTINGS_SECTION_ID,
    order: SETTINGS_SECTION_ORDER,
    label: () => t(SETTINGS_LABEL_KEY),
    locale: LOCALE_NAMESPACE,
    inject: () => ({
      channels,
      chatUi,
      translate: t,
      contractVersion: CONTRACT_VERSION,
      connection: ctx.connection
    }),
    children: {
      [CHANNEL_PAGE_SLOT]: { kind: "keyed", scope: "root" }
    }
  }, ChatSettingsSection));
}

    return module.exports;
  }
});
