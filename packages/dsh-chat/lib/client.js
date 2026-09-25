window.__ModuleLoader__.load({
  id: "@sidleo3/dsh-chat",
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
var React9 = __toESM(require("react"), 1);

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
  const [options, setOptions] = React.useState(null);
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
  const loadOptions = React.useCallback(async () => {
    if (!enabled || !connection || !channelId || !botId) return null;
    try {
      const result = await callControlRpc(connection, "bot.settings.options", { channelId, botId });
      const value = unwrapRpc(result);
      if (aliveRef.current) setOptions(value);
      return value;
    } catch {
      if (aliveRef.current) setOptions({ workspacePaths: [], presets: [] });
      return null;
    }
  }, [connection, channelId, botId, enabled]);
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
  const saveField = React.useCallback(async (method, body, key) => {
    const result = await callControlRpc(connection, method, { channelId, botId, ...body });
    const value = unwrapRpc(result);
    if (aliveRef.current) {
      setState((current) => ({
        ...current,
        phase: "ready",
        record: { ...current.record ?? {}, [key]: value[key] ?? null }
      }));
    }
    return value[key] ?? null;
  }, [connection, channelId, botId]);
  const saveWorkspace = React.useCallback(
    (workspace) => saveField("bot.workspace.set", { workspace }, "workspace"),
    [saveField]
  );
  const saveAgentPreset = React.useCallback(
    (agentPreset) => saveField("bot.agent-preset.set", { agentPreset }, "agentPreset"),
    [saveField]
  );
  const saveAccessPolicy = React.useCallback(
    (policy) => saveField("bot.access-policy.set", { policy }, "accessPolicy"),
    [saveField]
  );
  const saveModel = React.useCallback(
    (model) => saveField("bot.model.set", { model }, "model"),
    [saveField]
  );
  const savePanelSections = React.useCallback(
    (sections) => saveField("bot.panel-sections.set", { sections }, "panelSections"),
    [saveField]
  );
  return {
    record: state.record,
    phase: state.phase,
    error: state.error,
    options,
    loadOptions,
    reload: load,
    saveContextEnhancement,
    saveWorkspace,
    saveAgentPreset,
    saveAccessPolicy,
    saveModel,
    savePanelSections
  };
}
function useConversations({ connection, channelId, botId, enabled = true }) {
  const [state, setState] = React.useState({ phase: "idle", conversations: [], error: null });
  const aliveRef = React.useRef(true);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const load = React.useCallback(async () => {
    if (!enabled || !connection || !channelId || !botId) return;
    setState((current) => ({ ...current, phase: "loading" }));
    try {
      const result = await callControlRpc(connection, "bot.conversations", { channelId, botId });
      const value = unwrapRpc(result);
      if (aliveRef.current) {
        setState({ phase: "ready", conversations: value.conversations ?? [], error: null });
      }
    } catch (error) {
      if (aliveRef.current) setState({ phase: "error", conversations: [], error });
    }
  }, [connection, channelId, botId, enabled]);
  React.useEffect(() => {
    void load();
  }, [load]);
  return { ...state, reload: load };
}

// packages/dsh-chat/client/bot-shared-settings.js
var React3 = __toESM(require("react"), 1);

// packages/dsh-chat/shared/scoped-config.mjs
var LAYER_KEYS = Object.freeze(["global", "direct", "group"]);
var OVERRIDE_KEYS = Object.freeze(["direct", "group"]);
function isPlainObject2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function sameLayer(left, right) {
  if (left === right) return true;
  if (left === null || right === null) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}
function migrateToLayered(input, options) {
  const {
    keys = OVERRIDE_KEYS,
    normalizeLayer,
    defaultLayer,
    pickGlobal,
    isNewShape = (raw) => isPlainObject2(raw) && Object.hasOwn(raw, "global")
  } = options;
  const source = isPlainObject2(input) ? input : {};
  if (isNewShape(source)) {
    const global2 = normalizeLayer(source.global ?? defaultLayer());
    const overrides = {};
    for (const key of keys) {
      overrides[key] = source[key] === null || source[key] === void 0 ? null : normalizeLayer(source[key]);
    }
    return { global: global2, ...overrides };
  }
  const layers = {};
  for (const key of keys) {
    layers[key] = normalizeLayer(source[key] ?? defaultLayer());
  }
  const values = keys.map((key) => layers[key]);
  const identical = values.every((value) => sameLayer(value, values[0]));
  if (identical) {
    const overrides = {};
    for (const key of keys) overrides[key] = null;
    return { global: values[0], ...overrides };
  }
  let global = values[0];
  for (const value of values.slice(1)) global = pickGlobal(global, value);
  return { global, ...layers };
}
function resolveScope(config, layerKey) {
  const source = isPlainObject2(config) ? config : {};
  if (layerKey === "global" || !OVERRIDE_KEYS.includes(layerKey)) return source.global ?? null;
  return source[layerKey] ?? source.global ?? null;
}
function isInherited(config, layerKey) {
  if (!OVERRIDE_KEYS.includes(layerKey)) return false;
  const source = isPlainObject2(config) ? config : {};
  return source[layerKey] === null || source[layerKey] === void 0;
}
function writeScope(config, layerKey, next) {
  const source = isPlainObject2(config) ? config : {};
  if (layerKey === "global") return { ...source, global: next };
  if (!OVERRIDE_KEYS.includes(layerKey)) return { ...source };
  return { ...source, [layerKey]: next };
}

// packages/dsh-chat/shared/access-policy.mjs
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
function isPlainObject3(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function hasExactKeys(input, keys) {
  return isPlainObject3(input) && Reflect.ownKeys(input).length === keys.length && keys.every((key) => Object.hasOwn(input, key));
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
  if (!hasExactKeys(input, ["global", "direct", "group"])) throw invalid("\u8BF7\u63D0\u4EA4\u5B8C\u6574\u7684\u8BBF\u95EE\u7B56\u7565\u3002");
  const overrideOf = (value) => value === null || value === void 0 ? null : validateScope(value);
  return Object.freeze({
    global: validateScope(input.global),
    direct: overrideOf(input.direct),
    group: overrideOf(input.group)
  });
}
function emptyScope() {
  return {
    mode: "allowlist",
    open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] },
    allowlist: { users: [] }
  };
}
function moreConservative(left, right) {
  const rank = (scope) => scope.mode === "allowlist" ? 0 : 1;
  if (rank(left) !== rank(right)) return rank(left) < rank(right) ? left : right;
  if (left.mode === "allowlist") {
    const size = (scope) => scope.allowlist.users.length;
    return size(left) <= size(right) ? left : right;
  }
  const canRun = (scope) => scope.open.defaultCanExecuteCommands === true;
  if (canRun(left) !== canRun(right)) return canRun(left) ? right : left;
  return left;
}
function normalizeAccessPolicy(input) {
  if (!isPlainObject3(input)) return null;
  const scopeOf = (value) => {
    const source = isPlainObject3(value) ? value : {};
    const open = isPlainObject3(source.open) ? source.open : {};
    const allowlist = isPlainObject3(source.allowlist) ? source.allowlist : {};
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
  const layered = migrateToLayered(input, {
    normalizeLayer: scopeOf,
    defaultLayer: emptyScope,
    pickGlobal: moreConservative
  });
  return Object.freeze({
    global: Object.freeze(layered.global),
    direct: layered.direct === null ? null : Object.freeze(layered.direct),
    group: layered.group === null ? null : Object.freeze(layered.group)
  });
}
function defaultAccessPolicy() {
  return validateAccessPolicy({ global: emptyScope(), direct: null, group: null });
}

// packages/dsh-chat/client/help-hint.js
var React2 = __toESM(require("react"), 1);
var h = React2.createElement;
function HelpHint({ label, help, translate, disabled = false }) {
  const t = typeof translate === "function" ? translate : (key) => key;
  const paragraphs = (Array.isArray(help) ? help : [help]).filter((text2) => typeof text2 === "string" && text2.trim());
  if (paragraphs.length === 0) return null;
  const text = paragraphs.join(" ");
  return h(
    "span",
    { className: "dchat-help" },
    h("button", {
      type: "button",
      className: "dchat-helpButton",
      disabled,
      /**
       * ⚠️ **不用原生 `title`**：自定义气泡已经承担显示，两套会同时冒出来
       * （原生那个还有 1 秒延迟、样式不受控）。可访问性靠 `aria-label` + 气泡的
       * `role="tooltip"`；键盘聚焦同样能看到内容（CSS 的 `:focus-within`）。
       */
      "aria-label": `${t("\u5E2E\u52A9")}${label ? `\uFF1A${label}` : ""}`
    }, "?"),
    h(
      "span",
      { className: "dchat-helpTip", role: "tooltip" },
      paragraphs.map((paragraph, index) => h("span", {
        key: index,
        className: "dchat-helpLine"
      }, paragraph))
    ),
    // 读屏拿得到完整内容（气泡对读屏不一定可达，这里保证内容不丢）。
    h("span", { className: "dchat-visuallyHidden" }, text)
  );
}

// packages/dsh-chat/shared/panel-sections.mjs
var PANEL_SECTIONS = Object.freeze([
  "model",
  "session",
  "preset",
  "context",
  "policy",
  "fields",
  "actions",
  "commands"
]);
var PANEL_SCOPES = Object.freeze(["direct", "group"]);
var PANEL_LAYERS = Object.freeze(["global", "direct", "group"]);
function allOn() {
  return Object.fromEntries(PANEL_SECTIONS.map((id) => [id, true]));
}
function normalizePanelSections(input) {
  const scopeOf = (value) => {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return Object.fromEntries(
      PANEL_SECTIONS.map((id) => [id, raw[id] !== false])
    );
  };
  return migrateToLayered(input, {
    normalizeLayer: scopeOf,
    defaultLayer: allOn,
    // 两份不同时拿谁当全局：显示项没有"保守"概念，取前者即可
    // （两份都会原样保留为覆盖，所以挑错不改变任何人的实际显示）。
    pickGlobal: (left) => left
  });
}

// packages/dsh-chat/client/bot-shared-settings.js
var h2 = React3.createElement;
function translatorOf(translate) {
  return typeof translate === "function" ? translate : (key) => key;
}
function Card({ title, description, help, actions, children, translate }) {
  const t = translatorOf(translate);
  return h2(
    "section",
    { className: "dchat-card" },
    h2(
      "div",
      { className: "dchat-cardHeader" },
      h2(
        "div",
        { className: "dchat-cardHeading" },
        h2("h3", { className: "dchat-cardTitle" }, title),
        description || help ? h2(
          "p",
          { className: "dchat-cardDescription" },
          description ? h2("span", null, description) : null,
          h2(HelpHint, { help, translate: t, label: description ?? title })
        ) : null
      ),
      actions ? h2("div", { className: "dchat-actions" }, actions) : null
    ),
    children
  );
}
function useSaver(onSave) {
  const [busy, setBusy] = React3.useState(false);
  const [failed, setFailed] = React3.useState(null);
  const run = React3.useCallback(async (next) => {
    setBusy(true);
    setFailed(null);
    try {
      await onSave(next);
      return true;
    } catch (error) {
      setFailed(error?.message ?? String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }, [onSave]);
  return { busy, failed, run };
}
function WorkspaceEditor({ value, options = [], translate, onSave }) {
  const t = translatorOf(translate);
  const [draft, setDraft] = React3.useState(value ?? "");
  const [open, setOpen] = React3.useState(false);
  const { busy, failed, run } = useSaver(onSave);
  const fieldId = React3.useId?.() ?? "dchat-workspace";
  React3.useEffect(() => {
    setDraft(value ?? "");
  }, [value]);
  const dirty = (draft ?? "").trim() !== (value ?? "");
  const hasOptions = options.length > 0;
  return h2(
    Card,
    {
      title: t("\u5DE5\u4F5C\u533A"),
      // 常驻只留"影响判断"的那半句（改了什么时候生效）；其余收进帮助。
      description: t("\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548"),
      help: [
        t("\u8FD9\u4E2A\u76EE\u5F55\u51B3\u5B9A\u5B83\u80FD\u8BFB\u5199\u54EA\u4E9B\u6587\u4EF6\u3001\u4EE5\u53CA\u7528\u54EA\u4E00\u4EFD AGENTS.md\u3002"),
        t("\u5DF2\u7ECF\u5EFA\u597D\u7684\u4F1A\u8BDD\u4E0D\u53D7\u5F71\u54CD\u2014\u2014\u60F3\u6362\u76EE\u5F55\u53C8\u60F3\u8BA9\u65E7\u4F1A\u8BDD\u8DDF\u4E0A\uFF0C\u5C31\u5728\u90A3\u4E2A\u804A\u5929\u91CC\u70B9\u300C\u65B0\u4F1A\u8BDD\u300D\u3002"),
        hasOptions ? t("\u4E0B\u62C9\u91CC\u662F\u8FD9\u53F0\u673A\u5668\u4EBA\u7528\u8FC7\u7684\u76EE\u5F55\uFF0C\u4E5F\u53EF\u4EE5\u76F4\u63A5\u624B\u6253\u4EFB\u610F\u8DEF\u5F84\u3002") : null
      ].filter(Boolean),
      actions: h2("button", {
        type: "button",
        className: "dchat-button",
        disabled: busy || !dirty,
        onClick: () => {
          void run(draft.trim());
        }
      }, busy ? t("\u4FDD\u5B58\u4E2D\u2026") : t("\u4FDD\u5B58"))
    },
    h2(
      "div",
      { className: "dchat-scopeGrid" },
      h2(
        "div",
        { className: "dchat-scopeRow" },
        h2("label", { className: "dchat-scopeLabel", htmlFor: fieldId }, t("\u76EE\u5F55")),
        /**
         * 外壳 + 输入框 + 箭头。`onBlur` 用 focusout 的冒泡判断焦点是否还在里面，
         * 点列表项时焦点不会跑掉（列表是同一棵树里的按钮）。
         */
        h2(
          "div",
          {
            className: "dchat-combo",
            onBlur: (event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
            },
            onKeyDown: (event) => {
              if (event.key === "Escape" && open) {
                event.preventDefault();
                setOpen(false);
              }
            }
          },
          h2("input", {
            id: fieldId,
            className: "dchat-comboInput",
            value: draft,
            disabled: busy,
            placeholder: "/Users/me/project",
            autoComplete: "off",
            spellCheck: false,
            "aria-expanded": hasOptions ? open : void 0,
            onChange: (event) => setDraft(event.target.value)
          }),
          hasOptions ? h2("button", {
            type: "button",
            className: "dchat-comboArrow",
            disabled: busy,
            "aria-label": t("\u9009\u62E9\u7528\u8FC7\u7684\u76EE\u5F55"),
            "aria-expanded": open,
            onClick: () => setOpen((v) => !v)
          }, "\u25BE") : null,
          // 候选列表：绝对定位（不占位、不撑高卡片），只有展开时才画。
          open && hasOptions ? h2(
            "div",
            { className: "dchat-comboList", role: "listbox" },
            options.map((path) => h2("button", {
              key: path,
              type: "button",
              role: "option",
              className: "dchat-comboOption",
              "aria-selected": path === (draft ?? "").trim(),
              title: path,
              onClick: () => {
                setDraft(path);
                setOpen(false);
              }
            }, path))
          ) : null
        )
      )
    ),
    failed ? h2("p", { className: "dchat-error", role: "alert" }, failed) : null
  );
}
function PresetEditor({ value, options = [], translate, onSave }) {
  const t = translatorOf(translate);
  const { busy, failed, run } = useSaver(onSave);
  return h2(
    Card,
    {
      title: t("Agent \u9884\u8BBE"),
      description: t("\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548"),
      help: [
        t("\u9884\u8BBE\u51B3\u5B9A\u5B83\u7684\u4EBA\u8BBE\u4E0E\u80FD\u7528\u54EA\u4E9B\u5DE5\u5177\u3002"),
        t("\u8DDF\u5DE5\u4F5C\u533A\u4E00\u6837\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\uFF1A\u6539\u5B8C\u60F3\u8BA9\u67D0\u4E2A\u804A\u5929\u7528\u4E0A\uFF0C\u5728\u90A3\u4E2A\u804A\u5929\u91CC\u70B9\u300C\u65B0\u4F1A\u8BDD\u300D\u3002")
      ],
      actions: busy ? h2("span", { className: "dchat-status" }, t("\u4FDD\u5B58\u4E2D\u2026")) : null
    },
    options.length === 0 ? h2("p", { className: "dchat-cardDescription" }, t("\u5F53\u524D Host \u8BFB\u4E0D\u5230 Agent Preset \u5217\u8868\u3002")) : h2(
      "div",
      { className: "dchat-scopeGrid" },
      h2(
        "div",
        { className: "dchat-scopeRow" },
        h2(
          "select",
          {
            className: "dchat-select",
            value: value ?? "",
            disabled: busy,
            "aria-label": t("Agent \u9884\u8BBE"),
            onChange: (event) => {
              void run(event.target.value || null);
            }
          },
          h2("option", { value: "" }, t("\u8DDF\u968F Host \u9ED8\u8BA4")),
          options.map((row) => h2(
            "option",
            { key: row.id, value: row.id },
            `${row.id}${row.name && row.name !== row.id ? ` \xB7 ${row.name}` : ""}`
          ))
        )
      )
    ),
    failed ? h2("p", { className: "dchat-error", role: "alert" }, failed) : null
  );
}
function ModelEditor({ value, options = [], hostDefault = null, failures = [], translate, onSave }) {
  const t = translatorOf(translate);
  const { busy, failed, run } = useSaver(onSave);
  const current = value ?? null;
  const selected = current ? options.find((item) => item.provider === current.provider && item.model === current.model) ?? null : null;
  const effortOptions = selected?.efforts ?? [];
  const hostText = hostDefault ? `${hostDefault.provider}/${hostDefault.model}` : null;
  const save = (patch) => {
    if (patch === null) {
      void run(null);
      return;
    }
    const provider = patch.provider ?? current?.provider ?? "";
    const model = patch.model ?? current?.model ?? "";
    const reasoningEffort = Object.hasOwn(patch, "reasoningEffort") ? patch.reasoningEffort : current?.reasoningEffort ?? null;
    void run({ provider, model, reasoningEffort: reasoningEffort || null });
  };
  const modelSelect = h2(
    "div",
    { className: "dchat-scopeRow" },
    h2("label", { className: "dchat-scopeLabel" }, t("\u6A21\u578B")),
    h2(
      "select",
      {
        className: "dchat-select",
        value: selected?.value ?? "",
        disabled: busy,
        "aria-label": t("\u9ED8\u8BA4\u6A21\u578B"),
        onChange: (event) => {
          const next = options.find((item) => item.value === event.target.value);
          if (!next) {
            save(null);
            return;
          }
          save({ provider: next.provider, model: next.model, reasoningEffort: null });
        }
      },
      h2("option", { value: "" }, hostText ? `${t("\u8DDF\u968F Host \u9ED8\u8BA4")}\uFF08${hostText}\uFF09` : t("\u8DDF\u968F Host \u9ED8\u8BA4")),
      options.map((item) => h2(
        "option",
        { key: item.value, value: item.value },
        `${item.value}${item.name && item.name !== item.model ? ` \xB7 ${item.name}` : ""}`
      ))
    )
  );
  const effortSelect = h2(
    "div",
    { className: "dchat-scopeRow" },
    h2("label", { className: "dchat-scopeLabel" }, t("\u63A8\u7406\u7B49\u7EA7")),
    effortOptions.length === 0 ? h2(
      "p",
      { className: "dchat-cardDescription" },
      current ? t("\u8FD9\u4E2A\u6A21\u578B\u6CA1\u6709\u53EF\u9009\u7684\u63A8\u7406\u7B49\u7EA7\u3002") : t("\u5148\u9009\u4E00\u4E2A\u6A21\u578B\u3002")
    ) : h2(
      "select",
      {
        className: "dchat-select",
        value: current?.reasoningEffort ?? "",
        disabled: busy,
        "aria-label": t("\u63A8\u7406\u7B49\u7EA7"),
        onChange: (event) => {
          save({ reasoningEffort: event.target.value || null });
        }
      },
      h2("option", { value: "" }, t("\u6A21\u578B\u9ED8\u8BA4")),
      effortOptions.map((effort) => h2(
        "option",
        { key: effort.id, value: effort.id },
        `${effort.id}${effort.label && effort.label !== effort.id ? ` \xB7 ${effort.label}` : ""}`
      ))
    )
  );
  const failureNote = failures.length > 0 ? h2("p", { className: "dchat-cardDescription" }, t("\u90E8\u5206 provider \u8BFB\u53D6\u5931\u8D25\uFF1A") + failures.map((item) => `${item.id || item.name}\uFF08${item.message}\uFF09`).join("\uFF1B")) : null;
  const body = options.length === 0 ? h2("p", { className: "dchat-cardDescription" }, t("\u5F53\u524D Host \u8BFB\u4E0D\u5230\u6A21\u578B\u76EE\u5F55\u3002")) : h2("div", { className: "dchat-scopeGrid" }, modelSelect, effortSelect);
  return h2(
    Card,
    {
      title: t("\u9ED8\u8BA4\u6A21\u578B"),
      description: t("\u65B0\u4F1A\u8BDD\u7528\u5B83"),
      help: [
        t("\u9009\u5B8C\u5BF9\u300C\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u300D\u751F\u6548\uFF0C\u5DF2\u7ECF\u5EFA\u597D\u7684\u4F1A\u8BDD\u4E0D\u53D8\u3002"),
        t("\u4F1A\u8BDD\u5EFA\u597D\u4E4B\u540E\u8FD8\u80FD\u5355\u72EC\u6539\uFF1A\u5728\u804A\u5929\u91CC\u53D1 /menu\uFF0C\u6216\u7528 /model\u3002"),
        t("\u63A8\u7406\u7B49\u7EA7\u662F\u6A21\u578B\u81EA\u5DF1\u7684\u80FD\u529B\uFF0C\u6362\u6A21\u578B\u4F1A\u91CD\u7F6E\u3002")
      ],
      actions: busy ? h2("span", { className: "dchat-status" }, t("\u4FDD\u5B58\u4E2D\u2026")) : null
    },
    failureNote,
    body,
    failed ? h2("p", { className: "dchat-error", role: "alert" }, failed) : null
  );
}
function toDraft(value) {
  const policy = normalizeAccessPolicy(value) ?? defaultAccessPolicy();
  const scopeOf = (scope) => ({
    mode: scope?.mode === "open" ? "open" : "allowlist",
    defaultCanExecuteCommands: scope?.open?.defaultCanExecuteCommands === true,
    // 不在界面上编辑，但必须原样带回去，否则保存一次就把已有例外清空了。
    commandPermissionOverrides: Array.isArray(scope?.open?.commandPermissionOverrides) ? scope.open.commandPermissionOverrides : [],
    users: Array.isArray(scope?.allowlist?.users) ? scope.allowlist.users : []
  });
  const overrideOf = (scope) => scope === null || scope === void 0 ? null : scopeOf(scope);
  return {
    global: scopeOf(policy.global),
    direct: overrideOf(policy.direct),
    group: overrideOf(policy.group)
  };
}
function fromDraft(draft) {
  const scopeOf = (scope) => ({
    mode: scope.mode,
    open: {
      defaultCanExecuteCommands: scope.defaultCanExecuteCommands,
      commandPermissionOverrides: scope.commandPermissionOverrides
    },
    allowlist: { users: scope.users }
  });
  const overrideOf = (scope) => scope === null || scope === void 0 ? null : scopeOf(scope);
  return {
    global: scopeOf(draft.global),
    direct: overrideOf(draft.direct),
    group: overrideOf(draft.group)
  };
}
function ScopeBlock({ scopeKey, label, scope, busy, t, onChange, names = null }) {
  const [entry, setEntry] = React3.useState("");
  const inputId = `dchat-policy-${scopeKey}`;
  const nameOf = (id) => names?.[id] ?? null;
  const update = (patch) => onChange({ ...scope, ...patch });
  const addUser = () => {
    const id = entry.trim();
    if (!id) return;
    setEntry("");
    if (scope.users.some((user) => user.id === id)) return;
    update({ users: [...scope.users, { id, canExecuteCommands: false }] });
  };
  const allowlist = h2(
    React3.Fragment,
    null,
    scope.users.length > 0 ? h2("ul", { className: "dchat-list" }, scope.users.map((user) => h2(
      "li",
      {
        key: user.id,
        className: "dchat-listItem"
      },
      // 名字 + id：只显示 id 时，"这条是谁"在设置页上根本认不出来（真机反馈）；
      // 但 id 才是判定用的那个值，所以两个都留（与「属主」那一行同一个形态）。
      h2(
        "span",
        { className: "dchat-policyEntry" },
        nameOf(user.id) ? h2("span", { className: "dchat-policyName" }, nameOf(user.id)) : null,
        h2("code", { className: "dchat-code" }, user.id)
      ),
      h2(
        "span",
        { className: "dchat-actions" },
        h2(
          "label",
          { className: "dchat-check" },
          h2("input", {
            type: "checkbox",
            checked: user.canExecuteCommands === true,
            disabled: busy,
            onChange: (event) => update({
              users: scope.users.map((item) => item.id === user.id ? { ...item, canExecuteCommands: event.target.checked } : item)
            })
          }),
          h2("span", null, t("\u53EF\u6267\u884C\u547D\u4EE4"))
        ),
        h2("button", {
          type: "button",
          className: "dchat-button dchat-buttonDanger",
          disabled: busy,
          onClick: () => update({ users: scope.users.filter((item) => item.id !== user.id) })
        }, t("\u79FB\u9664"))
      )
    ))) : null,
    h2(
      "div",
      { className: "dchat-actions" },
      h2("input", {
        id: inputId,
        className: "dchat-input",
        value: entry,
        disabled: busy,
        placeholder: t("\u5BF9\u65B9\u7684\u5E73\u53F0 id\uFF0C\u56DE\u8F66\u6DFB\u52A0"),
        autoComplete: "off",
        spellCheck: false,
        onChange: (event) => setEntry(event.target.value),
        onKeyDown: (event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          addUser();
        }
      }),
      h2("button", {
        type: "button",
        className: "dchat-button",
        disabled: busy || !entry.trim(),
        onClick: addUser
      }, t("\u6DFB\u52A0"))
    )
  );
  const openScope = h2(
    "label",
    { className: "dchat-check" },
    h2("input", {
      type: "checkbox",
      checked: scope.defaultCanExecuteCommands,
      disabled: busy,
      onChange: (event) => update({ defaultCanExecuteCommands: event.target.checked })
    }),
    h2("span", null, t("\u5141\u8BB8\u6267\u884C\u547D\u4EE4"))
  );
  return h2(
    "div",
    { className: "dchat-scopeRow" },
    h2(
      "div",
      { className: "dchat-policyHead" },
      label ? h2("label", { className: "dchat-scopeLabel", htmlFor: inputId }, label) : null,
      h2(
        "select",
        {
          className: "dchat-select",
          value: scope.mode,
          disabled: busy,
          "aria-label": label ? `${label} ${t("\u8BBF\u95EE\u6A21\u5F0F")}` : t("\u8BBF\u95EE\u6A21\u5F0F"),
          onChange: (event) => update({ mode: event.target.value })
        },
        h2("option", { value: "allowlist" }, t("\u4EC5\u540D\u5355\u5185\u53EF\u7528")),
        h2("option", { value: "open" }, t("\u4EFB\u4F55\u4EBA\u53EF\u7528"))
      )
    ),
    scope.mode === "open" ? openScope : allowlist
  );
}
function AccessPolicyEditor({
  value,
  translate,
  onSave,
  names = null,
  namesHint = null,
  scope = "global",
  showInheritance = true,
  ownerHint = null
}) {
  const t = translatorOf(translate);
  const [draft, setDraft] = React3.useState(() => toDraft(value));
  const { busy, failed, run } = useSaver(onSave);
  React3.useEffect(() => {
    setDraft(toDraft(value));
  }, [value]);
  const commit = React3.useCallback(async (next) => {
    setDraft(next);
    const saved = await run(fromDraft(next));
    if (!saved) setDraft(toDraft(value));
  }, [run, value]);
  const inherits = scope !== "global" && (draft[scope] === null || draft[scope] === void 0);
  const activeDraft = scope === "global" ? draft.global : draft[scope] ?? draft.global;
  const scopeLabel = scope === "global" ? t("\u5168\u5C40") : scope === "group" ? t("\u7FA4\u804A") : t("\u79C1\u804A");
  return h2(
    Card,
    {
      title: t("\u8BBF\u95EE\u7B56\u7565"),
      description: t("\u6539\u52A8\u7ACB\u5373\u751F\u6548"),
      help: [
        // ⚠️ 这里**不许引用页面结构**（"去某张卡里设置"）：hub 组件不知道各渠道页上有哪些卡，
        // 微信就没有「属主」卡（它的属主是扫码绑定的人，不可改），那样写会把用户指向不存在的东西。
        ownerHint ?? t("\u5C5E\u4E3B\u4E0D\u9700\u8981\u8FDB\u540D\u5355\uFF1A\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\u3002"),
        t("\u300C\u4EC5\u540D\u5355\u5185\u53EF\u7528\u300D+ \u7A7A\u540D\u5355 = \u53EA\u6709\u5C5E\u4E3B\u80FD\u8BF4\u8BDD\u3002\u60F3\u7ED9\u67D0\u4E2A\u4EBA\u5F00\u95E8\uFF0C\u628A\u4ED6\u7684\u5E73\u53F0 id \u52A0\u8FDB\u540D\u5355\u3002"),
        t("\u300C\u4EFB\u4F55\u4EBA\u53EF\u7528\u300D\u8868\u793A\u8FD9\u4E2A\u573A\u5408\u91CC\u8C01\u90FD\u8FDB\u5F97\u6765\u3002"),
        t("\u540D\u5355\u91CC\u7684\u4EBA\u53EF\u4EE5\u989D\u5916\u52FE\u300C\u53EF\u6267\u884C\u547D\u4EE4\u300D\uFF1B\u4E0D\u52FE\u5C31\u53EA\u80FD\u5BF9\u8BDD\uFF0C\u4E0D\u80FD\u8DD1 / \u5F00\u5934\u7684\u547D\u4EE4\u3002")
      ],
      actions: h2(
        "div",
        { className: "dchat-actions" },
        showInheritance && !inherits && scope !== "global" ? h2("button", {
          type: "button",
          className: "dchat-button dchat-buttonLink",
          disabled: busy,
          onClick: () => {
            void commit({ ...draft, [scope]: null });
          }
        }, t("\u6062\u590D\u7EE7\u627F\u5168\u5C40")) : null,
        busy ? h2("span", { className: "dchat-status" }, t("\u4FDD\u5B58\u4E2D\u2026")) : null
      )
    },
    showInheritance && inherits ? h2(
      "p",
      { className: "dchat-layerNote" },
      h2("span", { className: "dchat-layerBadge" }, t("\u7EE7\u627F\u5168\u5C40")),
      t("\u73B0\u5728\u8DDF\u968F\u300C\u5168\u5C40\u300D\u90A3\u4E00\u4EFD\uFF1B\u5728\u8FD9\u91CC\u6539\u4EFB\u4F55\u4E00\u9879\uFF0C\u5C31\u4F1A\u53D8\u6210\u8FD9\u4E2A\u573A\u5408\u7684\u5355\u72EC\u8BBE\u7F6E\u3002")
    ) : null,
    h2(
      "div",
      { className: "dchat-policyGrid" },
      h2(ScopeBlock, {
        scopeKey: scope,
        // 只有一个会话类型时不画标签（"私聊"是冗余的）。
        label: showInheritance ? scopeLabel : null,
        scope: activeDraft,
        busy,
        t,
        names,
        // 在"继承中"的层上改 = 建立覆盖（以生效值为底板），其余层原样保留。
        onChange: (next) => {
          void commit({ ...draft, [scope]: next });
        }
      })
    ),
    namesHint ? h2("p", { className: "dchat-cardDescription" }, namesHint.message ?? String(namesHint)) : null,
    failed ? h2("p", { className: "dchat-error", role: "alert" }, failed) : null
  );
}
function OwnerEditor({ owners = [], wildcard = false, candidates = [], translate, onSave }) {
  const t = translatorOf(translate);
  const [picked, setPicked] = React3.useState("");
  const { busy, failed, run } = useSaver(onSave);
  const nameOf = (id) => candidates.find((item) => item.id === id)?.name ?? null;
  const people = candidates.filter((item) => !owners.includes(item.id));
  return h2(
    Card,
    {
      title: t("\u5C5E\u4E3B"),
      description: t("\u6539\u5B8C\u4F1A\u91CD\u8FDE\u4E00\u6B21"),
      help: [
        t("\u5C5E\u4E3B\u4E0D\u9700\u8981\u8FDB\u767D\u540D\u5355\uFF1A\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\uFF0C\u4E5F\u4E0D\u770B\u8BBF\u95EE\u7B56\u7565\u3002"),
        t('\u4ECE"\u5B83\u804A\u8FC7\u7684\u4F1A\u8BDD"\u91CC\u6311\u4E00\u4E2A\u4EBA\u8BBE\u4E3A\u5C5E\u4E3B\uFF1B\u6E05\u7A7A\u540E\u6CA1\u6709\u4EFB\u4F55\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565\u3002')
      ],
      actions: busy ? h2("span", { className: "dchat-status" }, t("\u4FDD\u5B58\u4E2D\u2026")) : null
    },
    h2(
      "div",
      { className: "dchat-scopeGrid" },
      wildcard || owners.length === 0 ? h2("p", { className: "dchat-cardDescription" }, t("\u5F53\u524D\u6CA1\u6709\u5C5E\u4E3B\uFF1A\u6CA1\u6709\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565\uFF0C\u8C01\u80FD\u7528\u5B8C\u5168\u7531\u4E0B\u9762\u7684\u300C\u8BBF\u95EE\u7B56\u7565\u300D\u51B3\u5B9A\u3002")) : h2("ul", { className: "dchat-list" }, owners.map((id) => h2(
        "li",
        {
          key: id,
          className: "dchat-listItem"
        },
        // 名字 + id：id 用等宽块（可省略号），避免一行被 35 字符的 open_id 撑爆。
        h2(
          "span",
          null,
          nameOf(id) ? `${nameOf(id)} ` : null,
          h2("code", { className: "dchat-code" }, id)
        ),
        h2(
          "span",
          { className: "dchat-actions" },
          h2("button", {
            type: "button",
            className: "dchat-button dchat-buttonDanger",
            disabled: busy,
            onClick: () => {
              void run([...owners.filter((item) => item !== id)]);
            }
          }, t("\u79FB\u9664"))
        )
      ))),
      h2(
        "div",
        { className: "dchat-actions" },
        h2(
          "select",
          {
            className: "dchat-select",
            value: picked,
            disabled: busy || people.length === 0,
            "aria-label": t("\u4ECE\u4F1A\u8BDD\u91CC\u9009\u4E00\u4E2A\u4EBA\u8BBE\u4E3A\u5C5E\u4E3B"),
            onChange: (event) => setPicked(event.target.value)
          },
          h2(
            "option",
            { value: "" },
            people.length === 0 ? t("\u6CA1\u6709\u53EF\u9009\u7684\u4F1A\u8BDD\uFF08\u5148\u548C\u673A\u5668\u4EBA\u804A\u4E00\u6B21\uFF09") : t("\u4ECE\u4F1A\u8BDD\u91CC\u9009\u4E00\u4E2A\u4EBA\u8BBE\u4E3A\u5C5E\u4E3B")
          ),
          people.map((item) => h2("option", { key: item.id, value: item.id }, item.name))
        ),
        h2("button", {
          type: "button",
          className: "dchat-button",
          disabled: busy || !picked,
          onClick: () => {
            setPicked("");
            void run([...owners.filter((item) => item !== "*"), picked]);
          }
        }, t("\u8BBE\u4E3A\u5C5E\u4E3B")),
        h2("button", {
          type: "button",
          className: "dchat-button",
          disabled: busy || wildcard && owners.length === 1,
          title: t("\u6E05\u7A7A\u540E\u6CA1\u6709\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565"),
          onClick: () => {
            void run(["*"]);
          }
        }, t("\u6E05\u7A7A\uFF08\u65E0\u5C5E\u4E3B\uFF09"))
      )
    ),
    failed ? h2("p", { className: "dchat-error", role: "alert" }, failed) : null
  );
}
var PANEL_SECTION_LABELS = Object.freeze({
  model: "\u6A21\u578B\u4E0E\u63A8\u7406\u7B49\u7EA7",
  session: "\u4F1A\u8BDD",
  preset: "Agent \u9884\u8BBE\u4E0E\u5DE5\u4F5C\u533A",
  context: "\u4E0A\u4E0B\u6587\u589E\u5F3A\uFF08\u672C\u4F1A\u8BDD\uFF09",
  policy: "\u8BBF\u95EE\u7B56\u7565\uFF08\u672C\u4F1A\u8BDD\uFF09",
  fields: "\u6E20\u9053\u8BBE\u7F6E\uFF08\u4EFB\u52A1\u8FC7\u7A0B\u5C55\u793A\u7B49\uFF09",
  actions: "\u6E20\u9053\u52A8\u4F5C\u6309\u94AE\uFF08\u91CD\u8FDE\u7B49\uFF09",
  commands: "\u547D\u4EE4\u6309\u94AE\uFF08\u65B0\u4F1A\u8BDD/\u72B6\u6001/\u8BCA\u65AD\u2026\uFF09"
});
function PanelSectionsEditor({
  value = null,
  disabled = false,
  saving = false,
  error = null,
  translate,
  onSave,
  scope = "global",
  showInheritance = true,
  available = null
}) {
  const t = translatorOf(translate);
  const sections = Array.isArray(available) && available.length > 0 ? PANEL_SECTIONS.filter((id) => available.includes(id)) : PANEL_SECTIONS;
  const [pending, setPending] = React3.useState(null);
  const [failed, setFailed] = React3.useState(null);
  const locked = disabled || saving || pending !== null;
  const full = normalizePanelSections(value);
  const mine = resolveScope(full, scope) ?? full.global;
  const inherits = scope !== "global" && isInherited(full, scope);
  const toggle = async (sectionId, nextChecked) => {
    if (locked) return;
    const next = writeScope(full, scope, { ...mine, [sectionId]: nextChecked });
    setFailed(null);
    setPending(sectionId);
    try {
      await onSave(next);
    } catch (cause) {
      setFailed(cause?.message ?? String(cause));
    } finally {
      setPending(null);
    }
  };
  const revertToInherit = async () => {
    if (locked) return;
    setFailed(null);
    setPending("inherit");
    try {
      await onSave(writeScope(full, scope, null));
    } catch (cause) {
      setFailed(cause?.message ?? String(cause));
    } finally {
      setPending(null);
    }
  };
  const scopeLabel = scope === "global" ? t("\u5168\u5C40") : scope === "group" ? t("\u7FA4\u804A") : t("\u79C1\u804A");
  const rows = sections.map((sectionId) => h2(
    "div",
    {
      key: sectionId,
      className: "dchat-panelSectionsRow"
    },
    h2(
      "label",
      {
        className: "dchat-panelSectionsCheck",
        title: t(PANEL_SECTION_LABELS[sectionId])
      },
      h2("input", {
        type: "checkbox",
        checked: mine[sectionId] !== false,
        disabled: locked,
        "aria-label": `${t(PANEL_SECTION_LABELS[sectionId])} \xB7 ${scopeLabel}`,
        onChange: (event) => {
          void toggle(sectionId, event.target.checked);
        }
      }),
      h2("span", { className: "dchat-panelSectionsName" }, t(PANEL_SECTION_LABELS[sectionId]))
    )
  ));
  return h2(
    Card,
    {
      title: t("\u63A7\u5236\u9762\u677F\u663E\u793A\u9879"),
      description: t("\u53EA\u5F71\u54CD /menu \u90A3\u5F20\u5361\u7247"),
      help: [
        t("\u5173\u6389\u7684\u9879\u4E0D\u663E\u793A\u5728\u5361\u7247\u4E0A\uFF0C\u4F46\u529F\u80FD\u7167\u65E7\uFF08\u7B56\u7565\u3001\u4E0A\u4E0B\u6587\u589E\u5F3A\u90FD\u8FD8\u5728\u751F\u6548\uFF09\u3002")
      ],
      actions: h2(
        "div",
        { className: "dchat-actions" },
        // 「恢复继承」只在真有覆盖时出现——没覆盖时它是个点了没反应的按钮。
        showInheritance && !inherits && scope !== "global" ? h2("button", {
          type: "button",
          className: "dchat-button dchat-buttonLink",
          disabled: locked,
          onClick: () => {
            void revertToInherit();
          }
        }, t("\u6062\u590D\u7EE7\u627F\u5168\u5C40")) : null,
        pending !== null ? h2("span", { className: "dchat-status" }, t("\u4FDD\u5B58\u4E2D\u2026")) : null
      )
    },
    /**
     * 继承状态必须**说出来**：正在继承时下面这些勾选框显示的是全局那一份，
     * 用户不知道的话会以为"我明明在这里关了，怎么又开了"。
     */
    inherits ? h2(
      "p",
      { className: "dchat-layerNote" },
      h2("span", { className: "dchat-layerBadge" }, t("\u7EE7\u627F\u5168\u5C40")),
      t("\u73B0\u5728\u8DDF\u968F\u300C\u5168\u5C40\u300D\u90A3\u4E00\u4EFD\uFF1B\u5728\u8FD9\u91CC\u6539\u4EFB\u4F55\u4E00\u9879\uFF0C\u5C31\u4F1A\u53D8\u6210\u8FD9\u4E2A\u573A\u5408\u7684\u5355\u72EC\u8BBE\u7F6E\u3002")
    ) : null,
    h2("div", { className: "dchat-panelSections" }, rows),
    failed || error ? h2("p", { className: "dchat-error", role: "alert" }, failed ?? error) : null
  );
}

// packages/dsh-chat/client/context-enhancement.js
var React4 = __toESM(require("react"), 1);

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
  global: DEFAULT_SCOPE,
  group: null,
  direct: null,
  targets: Object.freeze([])
});
var CONFIG_KEYS = Object.freeze(["global", "group", "direct", "targets"]);
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
function invalid2(message) {
  const error = new TypeError(message);
  error.code = "context-enhancement-invalid";
  return error;
}
function isPlainObject4(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function hasExactKeys2(input, keys) {
  return isPlainObject4(input) && Reflect.ownKeys(input).length === keys.length && keys.every((key) => Object.hasOwn(input, key));
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
  const overrideOf = (value, label) => value === null || value === void 0 ? null : validateScope2(value, label);
  return Object.freeze({
    global: validateScope2(input.global, "\u5168\u5C40"),
    group: overrideOf(input.group, "\u7FA4\u804A"),
    direct: overrideOf(input.direct, "\u79C1\u804A"),
    targets: Object.freeze(targets)
  });
}
function migrateLegacyConfig(input) {
  if (!hasExactKeys2(input, LEGACY_KEYS)) throw invalid2("\u8BF7\u63D0\u4EA4\u5B8C\u6574\u7684\u4E0A\u4E0B\u6587\u589E\u5F3A\u8BBE\u7F6E\u3002");
  const shared = { fields: input.fields, guidance: input.guidance };
  return validateContextConfig({
    /**
     * ⚠️ 这一版**两个开关是分开的**（`groupEnabled` / `directEnabled`），
     * 所以不能只取一个提成全局——那会把"只开了其中一边"抹平（旧的 directEnabled=false
     * 会变成"跟群聊一样开着"）。两份都给成覆盖，**各自的实际开关原样保留**。
     * 全局取群聊那一份（真值方向），但它不参与生效（两层都有覆盖）。
     */
    global: { enabled: input.groupEnabled === true, ...shared },
    group: { enabled: input.groupEnabled === true, ...shared },
    direct: { enabled: input.directEnabled === true, ...shared },
    targets: []
  });
}
function normalizeContextConfig(input) {
  const parse = (candidate) => {
    try {
      return validateContextConfig(candidate);
    } catch {
      return null;
    }
  };
  const asLayer = (raw) => parse({
    global: raw ?? DEFAULT_SCOPE,
    group: null,
    direct: null,
    targets: []
  })?.global ?? DEFAULT_SCOPE;
  const already = parse(input);
  if (already && already.global) return already;
  if (isPlainObject4(input) && hasExactKeys2(input, LEGACY_KEYS)) {
    try {
      return migrateLegacyConfig(input);
    } catch {
    }
  }
  if (isPlainObject4(input)) {
    const layered = migrateToLayered({ ...input, targets: input.targets ?? [] }, {
      normalizeLayer: asLayer,
      defaultLayer: () => DEFAULT_SCOPE,
      pickGlobal: (left) => left,
      isNewShape: (raw) => isPlainObject4(raw) && Object.hasOwn(raw, "global")
    });
    const built = parse({
      global: layered.global,
      group: layered.group,
      direct: layered.direct,
      targets: Array.isArray(input.targets) ? input.targets : []
    });
    if (built) return built;
  }
  return DEFAULT_CONTEXT_CONFIG;
}

// packages/dsh-chat/client/context-enhancement.js
var h3 = React4.createElement;
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
  global: Object.freeze({
    title: "\u5168\u5C40",
    targetTitle: "\u6307\u5B9A\u7528\u6237",
    targetHint: "\u547D\u4E2D\u4E86\u624D\u7528\u5B83",
    idPlaceholder: "ou_xxx\uFF08\u53D1\u9001\u8005\u6807\u8BC6\uFF09",
    idLabel: "\u7528\u6237\u6807\u8BC6"
  }),
  direct: Object.freeze({
    title: "\u79C1\u804A",
    targetTitle: "\u6307\u5B9A\u7528\u6237",
    targetHint: "\u53EA\u5BF9\u8FD9\u4E2A\u4EBA\u751F\u6548\uFF08\u6309\u53D1\u9001\u8005\u6807\u8BC6\u5339\u914D\uFF09\u3002",
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
function FieldPicker({ scopeKey, scope, disabled, onChange, t, offered = CONTEXT_FIELDS }) {
  return h3("div", { className: "dchat-contextFields" }, offered.map((field) => {
    const inputId = `dchat-field-${scopeKey}-${field}`;
    return h3(
      "div",
      {
        key: field,
        className: "dchat-contextField",
        // 守门按这个属性核对"画出来的字段 = 渠道声明能提供的那些"。
        "data-context-field": field
      },
      h3("input", {
        id: inputId,
        type: "checkbox",
        checked: scope.fields.includes(field),
        disabled,
        onChange: (event) => onChange(event.target.checked ? [...scope.fields, field] : scope.fields.filter((value) => value !== field))
      }),
      /**
       * 常驻只留中文名：英文键名（`conversationType` 这种）排在每个标签后面，
       * 一行里八组"中文+英文"会把这块撑得很长。键名收进 title——
       * 真要写提示词引用字段时，光标停一下就能看到。
       */
      h3(
        "label",
        {
          htmlFor: inputId,
          title: [t(FIELD_LABELS[field]), field, FIELD_HELP[field] ? t(FIELD_HELP[field]) : null].filter(Boolean).join(" \xB7 ")
        },
        h3("span", null, t(FIELD_LABELS[field]))
      )
    );
  }));
}
function GuidanceEditor({ idPrefix, value, example, disabled, onChange, t }) {
  const id = `${idPrefix}-guidance`;
  return h3(
    "div",
    { className: "dchat-contextGuidance" },
    h3(
      "div",
      { className: "dchat-contextGuidanceHeader" },
      h3("label", { htmlFor: id, className: "dchat-contextLegend" }, t("\u589E\u5F3A\u63D0\u793A\u8BCD")),
      h3(
        "div",
        { className: "dchat-actions" },
        h3("button", {
          type: "button",
          className: "dchat-button",
          disabled,
          onClick: () => onChange(example)
        }, t("\u586B\u5165\u793A\u4F8B")),
        h3("button", {
          type: "button",
          className: "dchat-button",
          disabled,
          onClick: () => onChange("")
        }, t("\u6E05\u7A7A"))
      )
    ),
    // 这句是"怎么写"的说明 → 收进问号（下面就是输入框，用户知道要写什么）。
    h3("textarea", {
      id,
      className: "dchat-textarea",
      rows: 4,
      value,
      // 占位符只给一句短提示；完整模板在「填入示例」里（一整段铺在框里太占视线）。
      placeholder: t('\u5199\u4E00\u53E5"\u600E\u4E48\u7406\u89E3\u6765\u6E90"\u7684\u8BF4\u660E\uFF0C\u53EF\u70B9\u300C\u586B\u5165\u793A\u4F8B\u300D\u770B\u6A21\u677F'),
      maxLength: GUIDANCE_MAX_LENGTH,
      disabled,
      onChange: (event) => onChange(event.target.value)
    })
  );
}
function GlobalScopePanel({ kind, scope, disabled, onChange, t, offered }) {
  const text = SCOPE_TEXT[kind];
  const example = kind === "group" ? GROUP_GUIDANCE_EXAMPLE : DIRECT_GUIDANCE_EXAMPLE;
  const switchId = `dchat-enable-${kind}`;
  return h3(
    "div",
    { className: "dchat-contextGlobal" },
    h3(
      "div",
      { className: "dchat-contextSwitchRow" },
      h3(
        "label",
        { htmlFor: switchId, className: "dchat-contextSwitchLabel" },
        // 层名已经在页头场合切换器上写着，这里不重复一遍（'启用全局全局增强'很别扭）。
        t("\u542F\u7528\u589E\u5F3A")
      ),
      h3("input", {
        id: switchId,
        type: "checkbox",
        role: "switch",
        checked: scope.enabled,
        disabled,
        onChange: (event) => onChange({ ...scope, enabled: event.target.checked })
      })
    ),
    h3("div", { className: "dchat-contextLegendRow" }, t("\u6765\u6E90\u5B57\u6BB5")),
    h3(FieldPicker, {
      scopeKey: `${kind}-global`,
      scope,
      disabled,
      offered,
      onChange: (fields) => onChange({ ...scope, fields }),
      t
    }),
    h3(GuidanceEditor, {
      idPrefix: `dchat-${kind}-global`,
      value: scope.guidance,
      example,
      disabled,
      onChange: (guidance) => onChange({ ...scope, guidance }),
      t
    })
  );
}
function targetKindOf(scope) {
  return scope === "direct" ? "user" : "group";
}
function TargetRow({ scope, target, index, disabled, onChange, onRemove, t, conversations, offered }) {
  const text = SCOPE_TEXT[scope];
  const prefix = `dchat-target-${scope}-${index}`;
  return h3(
    "li",
    { className: "dchat-targetRow" },
    h3(
      "div",
      { className: "dchat-targetHead" },
      h3(
        "label",
        { className: "dchat-targetEnable" },
        h3("input", {
          type: "checkbox",
          checked: target.enabled,
          disabled,
          "aria-label": `\u542F\u7528\u7B2C ${index + 1} \u6761${text.targetTitle}`,
          onChange: (event) => onChange({ ...target, enabled: event.target.checked })
        }),
        t("\u542F\u7528")
      ),
      h3("button", {
        type: "button",
        className: "dchat-button",
        disabled,
        "aria-label": `\u5220\u9664\u7B2C ${index + 1} \u6761${text.targetTitle}`,
        onClick: onRemove
      }, t("\u5220\u9664"))
    ),
    h3(
      "div",
      { className: "dchat-targetGrid" },
      h3(
        "label",
        { className: "dchat-targetField" },
        h3("span", null, text.idLabel),
        // 能选就别让人填 id：下拉里是这台机器人聊过的会话（带群名/人名），
        // 手填输入框仍然保留，兼容还没聊过的会话与直接粘贴 id 的场合。
        (conversations ?? []).length > 0 ? h3(
          "select",
          {
            className: "dchat-select",
            value: (conversations ?? []).some((item) => item.id === target.id) ? target.id : "",
            disabled,
            "aria-label": text.idLabel,
            onChange: (event) => {
              if (event.target.value) onChange({ ...target, id: event.target.value });
            }
          },
          h3("option", { value: "" }, t("\u4ECE\u4F1A\u8BDD\u91CC\u9009\u2026")),
          (conversations ?? []).map((item) => h3("option", { key: item.id, value: item.id }, item.name))
        ) : null,
        h3("input", {
          type: "text",
          value: target.id,
          maxLength: TARGET_ID_MAX_LENGTH,
          placeholder: text.idPlaceholder,
          disabled,
          onChange: (event) => onChange({ ...target, id: event.target.value })
        })
      ),
      h3(
        "label",
        { className: "dchat-targetField" },
        h3("span", null, t("\u5907\u6CE8\u540D\uFF08\u53EF\u9009\uFF09")),
        h3("input", {
          type: "text",
          value: target.label,
          maxLength: TARGET_LABEL_MAX_LENGTH,
          placeholder: t("\u5F20\u4E09"),
          disabled,
          onChange: (event) => onChange({ ...target, label: event.target.value })
        })
      )
    ),
    h3("div", { className: "dchat-contextLegendRow" }, t("\u6765\u6E90\u5B57\u6BB5")),
    h3(FieldPicker, {
      scopeKey: `${prefix}`,
      scope: target,
      disabled,
      offered,
      onChange: (fields) => onChange({ ...target, fields }),
      t
    }),
    h3(GuidanceEditor, {
      idPrefix: prefix,
      value: target.guidance,
      example: scope === "group" ? GROUP_GUIDANCE_EXAMPLE : DIRECT_GUIDANCE_EXAMPLE,
      disabled,
      onChange: (guidance) => onChange({ ...target, guidance }),
      t
    }),
    h3(
      "label",
      { className: "dchat-targetMerge" },
      h3("input", {
        type: "checkbox",
        checked: target.merge === "append",
        disabled,
        onChange: (event) => onChange({
          ...target,
          merge: event.target.checked ? "append" : "replace"
        })
      }),
      t("\u53E0\u52A0\u5168\u5C40\u63D0\u793A\u8BCD\uFF08\u4E0D\u52FE\u9009\u5219\u53EA\u4F7F\u7528\u4E0A\u9762\u7684\u4E13\u5C5E\u63D0\u793A\u8BCD\uFF09")
    )
  );
}
function TargetPanel({ scope, targets, disabled, onChange, t, conversations, offered }) {
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
  return h3(
    "div",
    { className: "dchat-contextTargets" },
    h3(
      "div",
      { className: "dchat-cardHeader" },
      h3(
        "div",
        null,
        h3("h4", { className: "dchat-cardTitle" }, text.targetTitle),
        h3("p", { className: "dchat-cardDescription" }, text.targetHint)
      ),
      h3("button", {
        type: "button",
        className: "dchat-button",
        disabled: disabled || targets.length >= TARGET_LIMIT,
        onClick: add
      }, t("\u65B0\u589E"))
    ),
    rows.length === 0 ? h3("p", { className: "dchat-cardDescription" }, t("\u8FD8\u6CA1\u6709\u6307\u5B9A\u8BBE\u7F6E")) : h3("ul", { className: "dchat-targetList" }, rows.map(({ target, index }) => h3(TargetRow, {
      key: index,
      scope,
      target,
      index,
      disabled,
      onChange: (next) => replace(index, next),
      onRemove: () => remove(index),
      t,
      offered,
      // 只给这一类作用域挑：私聊给"人"，群聊给"群"。
      conversations: (conversations ?? []).filter((item) => kind === "group" ? item.kind === "group" : item.kind === "direct")
    })))
  );
  ;
}
function ContextEnhancementPanel({
  config,
  disabled,
  translate,
  onSave,
  conversations,
  scope = null,
  sourceFields = null,
  showTargets = true
}) {
  const t = t_of(translate);
  const [draft, setDraft] = React4.useState(() => normalizeContextConfig(config));
  const [activeScope, setActiveScope] = React4.useState("global");
  const [saving, setSaving] = React4.useState(false);
  const [error, setError] = React4.useState(null);
  const [notice, setNotice] = React4.useState(null);
  const offered = Array.isArray(sourceFields) && sourceFields.length > 0 ? CONTEXT_FIELDS.filter((field) => sourceFields.includes(field)) : CONTEXT_FIELDS;
  const LAYERS = ["global", "direct", "group"];
  const scopedKinds = LAYERS.includes(scope) ? [scope] : LAYERS;
  const shownKind = scopedKinds.length === 1 ? scopedKinds[0] : activeScope;
  const busy = disabled || saving;
  const save = async () => {
    if (busy) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await onSave(validateContextConfig(draft));
      setNotice(t("\u5DF2\u4FDD\u5B58\u3002\u4E0B\u4E00\u6761\u6D88\u606F\u751F\u6548\u3002"));
    } catch (cause) {
      setError(cause?.message ?? t("\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002"));
    } finally {
      setSaving(false);
    }
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(normalizeContextConfig(config));
  const reset = () => {
    setDraft(normalizeContextConfig(config));
    setError(null);
    setNotice(null);
  };
  return h3(
    "section",
    { className: "dchat-card dchat-contextPanel" },
    h3(
      "div",
      { className: "dchat-cardHeader" },
      h3(
        "div",
        { className: "dchat-cardHeading" },
        h3("h3", { className: "dchat-cardTitle" }, t("\u4E0A\u4E0B\u6587\u589E\u5F3A")),
        h3(
          "p",
          { className: "dchat-cardDescription" },
          h3(HelpHint, {
            translate: t,
            label: t("\u4E0A\u4E0B\u6587\u589E\u5F3A"),
            help: [
              t("\u544A\u8BC9\u673A\u5668\u4EBA\uFF1A\u8FD9\u6761\u6D88\u606F\u4ECE\u54EA\u6765\u3001\u4EE5\u53CA\u8BE5\u600E\u4E48\u7528\u5B83\u2014\u2014\u6BD4\u5982\u8BA9\u5B83\u5728\u56DE\u7B54\u91CC\u5E26\u4E0A\u53D1\u8A00\u4EBA\u662F\u8C01\u3002"),
              t("\u6765\u6E90\u5B57\u6BB5\u53EA\u5728\u5F53\u524D\u6D88\u606F\u5DF2\u63D0\u4F9B\u65F6\u624D\u4F1A\u53D1\u9001\uFF0C\u4E0D\u4F1A\u989D\u5916\u67E5\u8BE2\u5E73\u53F0\u63A5\u53E3\u3002")
            ]
          })
        )
      ),
      h3(
        "div",
        { className: "dchat-actions" },
        saving ? h3("span", { className: "dchat-status" }, t("\u4FDD\u5B58\u4E2D\u2026")) : null,
        // 「放弃改动」只在真的改过时出现——没改时它是个点了没反应的按钮。
        dirty && !saving ? h3("button", {
          type: "button",
          className: "dchat-button",
          disabled: busy,
          onClick: reset
        }, t("\u653E\u5F03\u6539\u52A8")) : null,
        h3("button", {
          type: "button",
          className: "dchat-button dchat-buttonPrimary",
          disabled: busy || !dirty,
          onClick: () => {
            void save();
          }
        }, saving ? t("\u4FDD\u5B58\u4E2D\u2026") : t("\u4FDD\u5B58"))
      )
    ),
    // 来源字段的说明在标题的问号里（只说一次，不逐项重复；每个字段自己的解释在 title 里）。
    // 单层时不画页签：层由页头统一选定，面板里再问一遍是同一件事的第二种问法。
    scopedKinds.length > 1 ? h3(
      "div",
      { className: "dchat-tabs", role: "tablist", "aria-label": t("\u4E0A\u4E0B\u6587\u589E\u5F3A\u8303\u56F4") },
      scopedKinds.map((kind) => h3("button", {
        key: kind,
        type: "button",
        role: "tab",
        className: "dchat-tab",
        "aria-selected": activeScope === kind,
        "data-scope": kind,
        onClick: () => setActiveScope(kind)
      }, t(SCOPE_TEXT[kind].title)))
    ) : null,
    scopedKinds.map((kind) => h3(
      "div",
      {
        key: kind,
        role: "tabpanel",
        className: "dchat-tabPanel",
        hidden: shownKind !== kind,
        "data-scope": kind
      },
      h3(GlobalScopePanel, {
        kind,
        offered,
        // 继承层（null）时展示"全局那一份"——用户看到的就是实际生效的内容。
        scope: draft[kind] ?? draft.global,
        disabled: busy,
        t,
        /**
         * 写回：从"继承"改起时**建立覆盖**（以当前生效的那份为底板）。
         * 直接把 null 展开会丢掉字段，用户下次打开就是一份空设置。
         */
        onChange: (scopeValue) => setDraft((current) => ({
          ...current,
          [kind]: kind === "global" ? scopeValue : { ...current[kind] ?? current.global, ...scopeValue }
        }))
      }),
      /**
       * 「指定用户 / 指定群」：**比场合更细的一层**（"只有这个人"）。
       * 只有一种会话、且实际上只有属主一个人在用的渠道（微信）上它没有意义——
       * 那唯一的那个人本来就是全部，再给他单开一份设置是多余的。
       */
      showTargets ? h3(TargetPanel, {
        scope: kind,
        targets: draft.targets,
        offered,
        disabled: busy,
        t,
        conversations,
        onChange: (targets) => setDraft((current) => ({ ...current, targets }))
      }) : null
    )),
    error ? h3("p", { className: "dchat-error", role: "alert" }, error) : null,
    notice ? h3("p", { className: "dchat-notice", role: "status" }, notice) : null
  );
}
function ContextEnhancementEditor({
  config,
  disabled = false,
  translate,
  onSave,
  conversations = [],
  scope = null,
  sourceFields = null,
  showTargets = true
}) {
  return h3(ContextEnhancementPanel, {
    config,
    disabled,
    translate,
    onSave,
    conversations,
    scope,
    sourceFields,
    showTargets
  });
}

// packages/dsh-chat/client/delivery-targets.js
var React5 = __toESM(require("react"), 1);
var h4 = React5.createElement;
var CANDIDATE_PREVIEW = 5;
var FILTER_THRESHOLD = 6;
function translatorOf2(translate, chatUi) {
  if (typeof translate === "function") return translate;
  if (typeof chatUi?.translate === "function") return chatUi.translate;
  return (key) => key;
}
function TargetRow2({
  target,
  busy,
  confirming,
  renaming,
  renameDraft,
  translate,
  onSave,
  onAskRemove,
  onCancel,
  onRemove,
  onStartRename,
  onRenameDraft,
  onSubmitRename,
  onCancelRename
}) {
  const t = translate;
  const route = Object.entries(target.route ?? {}).map(([key, value]) => `${key}=${value}`).join(" \xB7 ");
  const kindLabel = target.kind === "group" ? t("\u7FA4\u804A") : t("\u79C1\u804A");
  if (renaming) {
    return h4(
      "div",
      { className: "dchat-listItem dchat-deliveryRow" },
      h4(
        "div",
        { className: "dchat-deliveryMeta" },
        h4("input", {
          className: "dchat-input",
          value: renameDraft,
          placeholder: t("\u7559\u7A7A\u5219\u7528\u81EA\u52A8\u8BC6\u522B\u7684\u540D\u5B57"),
          autoComplete: "off",
          spellCheck: false,
          "aria-label": t("\u81EA\u5B9A\u4E49\u540D\u79F0"),
          onChange: (event) => onRenameDraft(event.target.value),
          onKeyDown: (event) => {
            if (event.key === "Enter") onSubmitRename();
            if (event.key === "Escape") onCancelRename();
          }
        }),
        h4("small", null, `${kindLabel} \xB7 ${route}`)
      ),
      h4(
        "div",
        { className: "dchat-actions" },
        h4("button", {
          key: "submit",
          type: "button",
          className: "dchat-button dchat-buttonPrimary",
          disabled: busy,
          onClick: onSubmitRename
        }, busy ? t("\u4FDD\u5B58\u4E2D\u2026") : t("\u4FDD\u5B58")),
        h4("button", {
          key: "cancel",
          type: "button",
          className: "dchat-button",
          disabled: busy,
          onClick: onCancelRename
        }, t("\u53D6\u6D88"))
      )
    );
  }
  const actions = target.discovered ? [h4("button", {
    key: "save",
    type: "button",
    className: "dchat-button",
    disabled: busy,
    onClick: () => onSave(target)
  }, t("\u4FDD\u5B58\u4E3A\u6295\u9012\u76EE\u6807"))] : confirming ? [
    h4("button", {
      key: "confirm",
      type: "button",
      className: "dchat-button dchat-buttonDangerSolid",
      disabled: busy,
      onClick: () => onRemove(target)
    }, t("\u786E\u8BA4\u5220\u9664")),
    h4("button", {
      key: "cancel",
      type: "button",
      className: "dchat-button",
      disabled: busy,
      onClick: onCancel
    }, t("\u53D6\u6D88"))
  ] : [
    h4("button", {
      key: "rename",
      type: "button",
      className: "dchat-button",
      disabled: busy,
      onClick: () => onStartRename(target)
    }, t("\u91CD\u547D\u540D")),
    h4("button", {
      key: "remove",
      type: "button",
      className: "dchat-button dchat-buttonDanger",
      disabled: busy,
      onClick: onAskRemove
    }, t("\u5220\u9664"))
  ];
  return h4(
    "div",
    { className: "dchat-listItem dchat-deliveryRow" },
    h4(
      "div",
      { className: "dchat-deliveryMeta" },
      h4("strong", null, target.name || target.id),
      // 只留一行身份：`route` 里已经带了 openId/chatId，再挂一个 `p2p_…` 原始 id
      // 就是同一个东西的第二种写法，只会让人怀疑"这是两个不同的目标"。
      h4("small", null, `${kindLabel} \xB7 ${route}`)
    ),
    h4(
      "div",
      { className: "dchat-actions" },
      target.discovered ? h4("span", { className: "dchat-status" }, t("\u5019\u9009")) : null,
      ...actions
    )
  );
}
function DeliveryTargetsEditor({
  chatUi,
  connection,
  channelId,
  botId,
  translate,
  groups = true
}) {
  const t = translatorOf2(translate, chatUi);
  const { Panel: Panel2 } = chatUi.components;
  const [state, setState] = React5.useState({ phase: "loading", targets: [], canSend: false });
  const [error, setError] = React5.useState(null);
  const [notice, setNotice] = React5.useState(null);
  const [busyId, setBusyId] = React5.useState(null);
  const [confirmingId, setConfirmingId] = React5.useState(null);
  const [renamingId, setRenamingId] = React5.useState(null);
  const [renameDraft, setRenameDraft] = React5.useState("");
  const [draft, setDraft] = React5.useState("");
  const [sendTo, setSendTo] = React5.useState("");
  const [filter, setFilter] = React5.useState("");
  const [showAllCandidates, setShowAllCandidates] = React5.useState(false);
  const call = React5.useCallback(async (method, payload) => {
    const result = await chatUi.callControlRpc(connection, method, payload);
    return chatUi.unwrapRpc(result);
  }, [chatUi, connection]);
  const load = React5.useCallback(async () => {
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
  React5.useEffect(() => {
    void load();
  }, [load]);
  const run = React5.useCallback(async (key, method, payload, message) => {
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
  const ready = state.phase === "ready" && state.canSend === true;
  const query = filter.trim().toLowerCase();
  const matches = (target) => !query || `${target.name ?? ""} ${target.id} ${JSON.stringify(target.route ?? {})}`.toLowerCase().includes(query);
  const savedShown = saved.filter(matches);
  const candidatesShown = candidates.filter(matches);
  const visibleCandidates = showAllCandidates ? candidatesShown : candidatesShown.slice(0, CANDIDATE_PREVIEW);
  const renderRow = (target) => h4(TargetRow2, {
    key: target.id,
    target,
    busy: busyId === target.id,
    confirming: confirmingId === target.id,
    renaming: renamingId === target.id,
    renameDraft: renamingId === target.id ? renameDraft : "",
    translate: t,
    onSave: (item) => {
      void run(item.id, "delivery.save", {
        channelId,
        botId,
        target: { id: item.id, name: item.name, kind: item.kind, route: item.route }
      }, () => t("\u5DF2\u4FDD\u5B58\uFF0C\u73B0\u5728\u53EF\u4EE5\u4E3B\u52A8\u53D1\u6D88\u606F\u4E86\u3002"));
    },
    onStartRename: (item) => {
      setConfirmingId(null);
      setRenamingId(item.id);
      setRenameDraft(item.renamed ? item.name : "");
    },
    onRenameDraft: setRenameDraft,
    onCancelRename: () => setRenamingId(null),
    onSubmitRename: () => {
      const id = renamingId;
      setRenamingId(null);
      void run(id, "delivery.target.rename", {
        channelId,
        botId,
        targetId: id,
        name: renameDraft.trim()
      }, () => renameDraft.trim() ? t("\u5DF2\u6539\u540D\u3002") : t("\u5DF2\u6062\u590D\u81EA\u52A8\u540D\u5B57\u3002"));
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
  });
  const groupTitle = (text) => h4("p", { className: "dchat-groupTitle" }, text);
  return h4(
    Panel2,
    {
      title: t("\u4E3B\u52A8\u6295\u9012"),
      description: t("\u628A\u7ED3\u679C\u53D1\u5230\u6307\u5B9A\u4F1A\u8BDD")
    },
    error ? h4("p", { className: "dchat-error", role: "alert" }, error) : null,
    notice ? h4("p", { className: "dchat-notice", role: "status" }, notice) : null,
    state.phase === "loading" ? h4("p", { className: "dchat-cardDescription" }, t("\u8BFB\u53D6\u4E2D\u2026")) : null,
    state.phase === "ready" && state.canSend === false ? h4("p", { className: "dchat-cardDescription" }, t("\u5F53\u524D\u6E20\u9053\u4E0D\u652F\u6301\u4E3B\u52A8\u6295\u9012\u3002")) : null,
    // 目标多到需要找的时候才出现过滤框，平时不占地方。
    state.targets.length > FILTER_THRESHOLD ? h4(
      "div",
      { className: "dchat-actions" },
      h4("input", {
        className: "dchat-input",
        value: filter,
        placeholder: t("\u6309\u540D\u5B57\u6216 id \u8FC7\u6EE4"),
        autoComplete: "off",
        spellCheck: false,
        onChange: (event) => setFilter(event.target.value)
      })
    ) : null,
    savedShown.length > 0 ? h4(
      React5.Fragment,
      null,
      groupTitle(t("\u5DF2\u4FDD\u5B58")),
      h4("div", { className: "dchat-list" }, savedShown.map(renderRow))
    ) : null,
    candidatesShown.length > 0 ? h4(
      React5.Fragment,
      null,
      groupTitle(`${t("\u53EF\u6DFB\u52A0\u7684\u5019\u9009")}\uFF08${candidatesShown.length}\uFF09`),
      h4("div", { className: "dchat-list" }, visibleCandidates.map(renderRow)),
      candidatesShown.length > CANDIDATE_PREVIEW ? h4("button", {
        type: "button",
        className: "dchat-button dchat-buttonLink",
        onClick: () => setShowAllCandidates((value) => !value)
      }, showAllCandidates ? t("\u6536\u8D77") : `${t("\u5C55\u5F00\u5168\u90E8")}\uFF08${candidatesShown.length}\uFF09`) : null
    ) : null,
    state.targets.length > 0 && savedShown.length === 0 && candidatesShown.length === 0 ? h4("p", { className: "dchat-cardDescription" }, t("\u6CA1\u6709\u5339\u914D\u7684\u76EE\u6807\u3002")) : null,
    /**
     * 「怎么添加」常驻说明：**只要没有候选就显示**。
     * 之前只在"一个目标都没有"时显示，于是有 1 个已保存目标、又没有候选时，
     * 整张卡既看不到可添加项、也看不到为什么——用户只能说"没有添加入口"。
     */
    /**
     * "怎么让会话出现在这里"要按渠道说：**不支持群聊的渠道（微信）上"在群里 @ 一次机器人"
     * 是一条走不通的指引**——照着做永远等不到会话出现。`groups` 由渠道给。
     */
    ready && candidates.length === 0 ? h4(
      "p",
      { className: "dchat-cardDescription" },
      saved.length === 0 ? groups ? t("\u8FD8\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5728\u7FA4\u91CC @ \u4E00\u6B21\u673A\u5668\u4EBA\uFF0C\u6216\u4E0E\u5B83\u79C1\u804A\u4E00\u6B21\uFF0C\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF0C\u4FDD\u5B58\u540E\u5373\u53EF\u4E3B\u52A8\u6295\u9012\u3002") : t("\u8FD8\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5148\u548C\u673A\u5668\u4EBA\u79C1\u804A\u4E00\u6B21\uFF0C\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF0C\u4FDD\u5B58\u540E\u5373\u53EF\u4E3B\u52A8\u6295\u9012\u3002") : groups ? t("\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5728\u7FA4\u91CC @ \u4E00\u6B21\u673A\u5668\u4EBA\uFF0C\u6216\u4E0E\u5B83\u79C1\u804A\u4E00\u6B21\uFF0C\u8BE5\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002") : t("\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5148\u548C\u673A\u5668\u4EBA\u79C1\u804A\u4E00\u6B21\uFF0C\u8BE5\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002")
    ) : null,
    candidates.length > 0 ? h4(
      "p",
      { className: "dchat-cardDescription" },
      t("\u4E0A\u9762\u6807\u300C\u5019\u9009\u300D\u7684\u4F1A\u8BDD\u8FD8\u4E0D\u80FD\u4E3B\u52A8\u6295\u9012\uFF0C\u70B9\u300C\u4FDD\u5B58\u4E3A\u6295\u9012\u76EE\u6807\u300D\u540E\u624D\u884C\u3002")
    ) : null,
    saved.length > 0 ? h4(
      "div",
      { className: "dchat-deliverySend" },
      h4(
        "label",
        { className: "dchat-scopeLabel", htmlFor: `dchat-delivery-${botId}` },
        t("\u53D1\u4E00\u6761\u6D4B\u8BD5\u6D88\u606F")
      ),
      h4(
        "div",
        { className: "dchat-actions" },
        h4("select", {
          className: "dchat-select",
          value: sendTo,
          "aria-label": t("\u9009\u62E9\u76EE\u6807"),
          onChange: (event) => setSendTo(event.target.value)
        }, saved.map((target) => h4("option", {
          key: target.id,
          value: target.id
        }, `${target.name || target.id}\uFF08${target.kind === "group" ? t("\u7FA4\u804A") : t("\u79C1\u804A")}\uFF09`))),
        h4("button", {
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
      h4("textarea", {
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
var React6 = __toESM(require("react"), 1);
var h5 = React6.createElement;
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
  onSave,
  scope = null
}) {
  const t = typeof translate === "function" ? translate : (key) => key;
  const [draft, setDraft] = React6.useState(() => ({ ...value }));
  const [pending, setPending] = React6.useState(null);
  const [failed, setFailed] = React6.useState(null);
  const matched = scope && scopes.some((item) => item.key === scope) ? scope : null;
  const visibleScopes = matched ? scopes.filter((item) => item.key === matched) : scope && scopes.length > 0 ? [scopes[0]] : scopes;
  const same = (a, b) => scopes.every((item) => (a[item.key] ?? null) === (b[item.key] ?? null));
  const locked = disabled || saving || pending !== null;
  React6.useEffect(() => {
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
  const scopeFallbackHint = scope && !matched ? h5(
    "p",
    { className: "dchat-cardDescription" },
    t("\u8FD9\u4E00\u9879\u76EE\u524D\u53EA\u6709\u79C1\u804A/\u7FA4\u804A\u4E24\u4EFD\uFF08\u6CA1\u6709\u5168\u5C40\u5C42\uFF09\uFF1B\u4E0B\u9762\u663E\u793A\u7684\u662F\u79C1\u804A\u90A3\u4E00\u4EFD\u3002")
  ) : null;
  const savingHint = pending !== null ? h5("span", { className: "dchat-status" }, t("\u4FDD\u5B58\u4E2D\u2026")) : null;
  return h5(
    "section",
    { className: "dchat-card" },
    h5(
      "div",
      { className: "dchat-cardHeader" },
      h5(
        "div",
        { className: "dchat-cardHeading" },
        h5("h3", { className: "dchat-cardTitle" }, title),
        description ? h5(
          "p",
          { className: "dchat-cardDescription" },
          h5("span", null, description),
          h5(HelpHint, {
            translate: t,
            label: title,
            // 三个选项各自的说明都在这里（常驻会把卡片撑得比控件高好几倍）。
            help: [
              ...options.map((option) => `${t(option.label)}\uFF1A${t(option.help)}`)
            ]
          })
        ) : null
      ),
      savingHint ? h5("div", { className: "dchat-actions" }, savingHint) : null
    ),
    scopeFallbackHint,
    h5("div", { className: "dchat-scopeGrid" }, visibleScopes.map((item) => {
      const selected = draft[item.key] ?? options[0]?.value;
      const selectId = `dchat-mode-${item.key}`;
      return h5(
        "div",
        { key: item.key, className: "dchat-scopeRow" },
        // 场合已经由页面级切换器选定时，卡里不再重复一遍"私聊/群聊"标签——那是同一个问题的第二种问法。
        visibleScopes.length > 1 ? h5("label", { className: "dchat-scopeLabel", htmlFor: selectId }, item.label) : null,
        h5("select", {
          id: selectId,
          className: "dchat-select",
          value: selected,
          disabled: locked,
          "aria-label": `${title} \xB7 ${item.label}`,
          onChange: (event) => {
            void choose(item.key, event.target.value);
          }
        }, options.map((option) => h5("option", {
          key: option.value,
          value: option.value
        }, t(option.label))))
      );
    })),
    failed || error ? h5("p", { className: "dchat-error", role: "alert" }, failed ?? error) : null
  );
}

// packages/dsh-chat/client/scope-switcher.js
var React7 = __toESM(require("react"), 1);
var h6 = React7.createElement;
var SCOPE_DEFS = Object.freeze([
  Object.freeze({ key: "global", label: "\u5168\u5C40", hint: "\u6240\u6709\u4F1A\u8BDD\u7684\u9ED8\u8BA4\u503C\uFF1B\u79C1\u804A\u4E0E\u7FA4\u804A\u6CA1\u5355\u72EC\u8BBE\u7F6E\u65F6\u90FD\u7528\u5B83" }),
  Object.freeze({ key: "direct", label: "\u79C1\u804A", hint: "\u53EA\u5F71\u54CD\u79C1\u804A\u4F1A\u8BDD\uFF1B\u9ED8\u8BA4\u7EE7\u627F\u5168\u5C40" }),
  Object.freeze({ key: "group", label: "\u7FA4\u804A", hint: "\u53EA\u5F71\u54CD\u7FA4\u804A\u4F1A\u8BDD\uFF1B\u9ED8\u8BA4\u7EE7\u627F\u5168\u5C40" })
]);
var PAIR_SCOPE_DEFS = Object.freeze([
  Object.freeze({ key: "direct", label: "\u79C1\u804A", hint: "\u53EA\u5F71\u54CD\u79C1\u804A\u4F1A\u8BDD" }),
  Object.freeze({ key: "group", label: "\u7FA4\u804A", hint: "\u53EA\u5F71\u54CD\u7FA4\u804A\u4F1A\u8BDD" })
]);
var GLOBAL_SCOPE = Object.freeze({
  key: "global",
  label: "\u5168\u5C40",
  hint: "\u6240\u6709\u4F1A\u8BDD\u7684\u9ED8\u8BA4\u503C"
});
function ScopeSwitcher({ scopes = [], value, onChange, translate, ariaLabel, hint = null }) {
  const t = typeof translate === "function" ? translate : (key) => key;
  if (scopes.length < 2) return null;
  const active = scopes.some((scope) => scope.key === value) ? value : scopes[0]?.key;
  const activeDef = scopes.find((scope) => scope.key === active) ?? null;
  return h6(
    "div",
    { className: "dchat-scopeSwitcher" },
    h6("div", {
      className: "dchat-scopeTabs",
      role: "tablist",
      "aria-label": ariaLabel ?? t("\u8BBE\u7F6E\u573A\u5408")
    }, scopes.map((scope) => h6("button", {
      key: scope.key,
      type: "button",
      role: "tab",
      className: "dchat-scopeTab",
      "data-scope": scope.key,
      "aria-selected": scope.key === active,
      // 守门据此断言"切换器反映的是当前生效的场合"，而不是永远停在第一项。
      "data-scope-active": scope.key === active ? "1" : "0",
      onClick: () => onChange?.(scope.key)
    }, t(scope.label)))),
    hint ?? (activeDef?.hint ? h6("p", { className: "dchat-scopeHint" }, t(activeDef.hint)) : null)
  );
}

// packages/dsh-chat/client/setting-groups.js
var React8 = __toESM(require("react"), 1);
var h7 = React8.createElement;
function SettingGroups({ groups = [], translate, ariaLabel }) {
  const t = typeof translate === "function" ? translate : (key) => key;
  const visible = groups.filter((group) => (group.items ?? []).length > 0);
  const [active, setActive] = React8.useState(visible[0]?.key ?? null);
  const sectionRefs = React8.useRef(/* @__PURE__ */ new Map());
  React8.useEffect(() => {
    if (visible.length < 2) return void 0;
    if (typeof IntersectionObserver !== "function") return void 0;
    const nodes = [...sectionRefs.current.values()].filter(Boolean);
    if (nodes.length === 0) return void 0;
    const observer = new IntersectionObserver((entries) => {
      const entered = entries.filter((entry) => entry.isIntersecting).sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
      const key = entered[0]?.target?.dataset?.groupKey;
      if (key) setActive(key);
    }, { rootMargin: "-25% 0px -60% 0px", threshold: 0 });
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [visible.length]);
  if (visible.length === 0) return null;
  const jump = (key) => {
    setActive(key);
    const node = sectionRefs.current.get(key);
    node?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  return h7(
    React8.Fragment,
    null,
    /**
     * 分类导航：**只有一个分类时不画**——一排只有一个按钮的导航纯属噪声，
     * 而且会让人以为还有别的地方可去。
     */
    visible.length > 1 ? h7("nav", {
      className: "dchat-groups",
      "aria-label": ariaLabel ?? t("\u8BBE\u7F6E\u5206\u7C7B")
    }, visible.map((group) => h7("button", {
      key: group.key,
      type: "button",
      className: "dchat-groupTab",
      "aria-current": active === group.key ? "true" : void 0,
      onClick: () => jump(group.key)
    }, t(group.label)))) : null,
    visible.map((group) => h7(
      "section",
      {
        key: group.key,
        className: "dchat-group",
        "data-group-key": group.key,
        ref: (node) => {
          if (node) sectionRefs.current.set(group.key, node);
          else sectionRefs.current.delete(group.key);
        }
      },
      h7("h2", { className: "dchat-groupHeading" }, t(group.label)),
      visible.length > 1 && group.items.length > 1 ? h7(
        "p",
        { className: "dchat-groupHint" },
        group.items.map((item) => t(item.label)).join(" \xB7 ")
      ) : null,
      h7("div", { className: "dchat-groupBody" }, group.items.map((item) => h7(
        "div",
        { key: item.key, className: "dchat-groupItem", "data-item-key": item.key },
        item.node
      )))
    ))
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
  /* \u7A84\u680F\u4E0B\u5165\u53E3\u6362\u884C\uFF0C\u800C\u4E0D\u662F\u628A\u54C1\u724C\u540D\u6324\u51FA\u5BB9\u5668\u3002 */
  flex-wrap: wrap;
}
/* \u53F3\u4E0A\u89D2\u5165\u53E3\u7EC4\uFF08\u8BCA\u65AD / \u7248\u672C\u4E0E\u66F4\u65B0\uFF09\uFF1A\u5F62\u6001\u4E00\u81F4\u3001\u653E\u4E0D\u4E0B\u5C31\u6362\u884C\u3002 */
.dchat-headerActions {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
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
  /* \u5E2E\u52A9\u6C14\u6CE1\u7684\u5B9A\u4F4D\u57FA\u51C6\uFF08\u89C1 .dchat-helpTip\uFF09\u3002 */
  position: relative;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dchat-groupTitle {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}
.dchat-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}
.dchat-check input {
  margin: 0;
}
.dchat-policyGrid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dchat-policyGrid > * + * {
  border-top: 1px solid var(--dsw-alias-separator-primary);
  padding-top: 14px;
}
/* \u4F5C\u7528\u57DF\u6807\u9898\u884C\uFF1A\u6A21\u5F0F\u4E0B\u62C9\u6309\u5185\u5BB9\u5BBD\u5EA6\uFF0C\u4E0D\u8981\u50CF\u64CD\u4F5C\u884C\u91CC\u7684\u4E0B\u62C9\u90A3\u6837\u5403\u6389\u6574\u884C\u3002 */
.dchat-policyHead {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dchat-policyHead > select {
  width: auto;
  flex: none;
}
.dchat-actions > .dchat-check {
  flex: none;
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
  /*
   * \u5E2E\u52A9\u6C14\u6CE1\u7684\u5B9A\u4F4D\u57FA\u51C6\u3002
   *
   * \u26A0\uFE0F **\u5FC5\u987B\u662F\u8FD9\u91CC\uFF0C\u4E0D\u80FD\u662F\u8BF4\u660E\u90A3\u4E00\u6BB5**\uFF1A\u90A3\u4E00\u884C\u53EF\u80FD\u53EA\u6709\u95EE\u53F7\u3001\u6CA1\u6709\u6587\u5B57
   * \uFF08\u6BD4\u5982\u300C\u4E0A\u4E0B\u6587\u589E\u5F3A\u300D\u7684\u63CF\u8FF0\u6574\u53E5\u90FD\u6536\u8FDB\u4E86\u6C14\u6CE1\uFF09\uFF0C\u6B64\u65F6\u6BB5\u843D\u7684\u5BBD\u5EA6 = \u6807\u9898\u5BBD\u5EA6\uFF08\u7EA6 100px\uFF09\uFF0C
   * \u6C14\u6CE1\u5C31\u4F1A\u88AB\u538B\u6210\u4E00\u6761\u53C8\u7A84\u53C8\u9AD8\u7684\u7AD6\u6761\uFF08\u771F\u673A\u622A\u56FE\u53CD\u9988\u8FC7\uFF09\u3002\u5361\u7247\u5934\u59CB\u7EC8\u5360\u6EE1\u5361\u7247\u5BBD\u5EA6\u3002
   */
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  /* \u653E\u4E0D\u4E0B\u65F6\u628A\u64CD\u4F5C\u6574\u5757\u6298\u5230\u4E0B\u4E00\u884C\uFF0C\u800C\u4E0D\u662F\u628A\u6807\u9898/\u63CF\u8FF0\u538B\u5230\u4E00\u5B57\u4E00\u884C\uFF1A
     \u4E2D\u6587\u7684 min-content \u53EA\u6709 1 \u4E2A\u5B57\uFF0Cflex \u4E00\u65E6\u538B\u7F29\u5C31\u4F1A\u9010\u5B57\u7AD6\u6392\uFF08\u89C1 .dchat-botRow \u540C\u6B3E\u5904\u7406\uFF09\u3002 */
  flex-wrap: wrap;
}
.dchat-cardHeading {
  /* \u957F\u6807\u9898\u9760\u7701\u7565\u53F7\u6536\uFF0C\u4E0D\u62A2\u64CD\u4F5C\u7684\u5BBD\u5EA6\uFF1B\u4F46\u8981\u5403\u6389\u5269\u4F59\u5BBD\u5EA6\uFF0C\u63CF\u8FF0\u884C\u624D\u6709\u6574\u884C\u53EF\u7528\u3002 */
  flex: 1 1 auto;
  min-width: 0;
}
.dchat-cardTitle {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* \u26A0\uFE0F \u8FD9\u91CC**\u6545\u610F\u4E0D\u52A0** position: relative \u2014\u2014 \u6C14\u6CE1\u7684\u57FA\u51C6\u662F\u5361\u7247\u5934\uFF08\u89C1 .dchat-cardHeader\uFF09\uFF1A
   \u8BF4\u660E\u8FD9\u4E00\u884C\u53EF\u80FD\u53EA\u6709\u95EE\u53F7\u6CA1\u6709\u6587\u5B57\uFF0C\u5BBD\u5EA6\u53EA\u6709\u6807\u9898\u90A3\u4E48\u7A84\uFF0C\u6C14\u6CE1\u4F1A\u88AB\u538B\u6210\u7AD6\u6761\u3002 */
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
/* \u540D\u5355/\u5C5E\u4E3B\u884C\u91CC\u7684 id \u53EF\u80FD\u5F88\u957F\uFF08open_id \u6709 35 \u5B57\u7B26\uFF09\u3002\u5B83\u662F flex \u9879\uFF0C\u9ED8\u8BA4 min-width:auto
   \u4E0D\u80AF\u7F29\uFF0C\u5C31\u4F1A\u628A\u540C\u6392\u7684\u6309\u94AE\u6324\u51FA\u5BB9\u5668\uFF08\u7A84\u680F\u76F4\u63A5\u6A2A\u5411\u6EA2\u51FA\uFF09\u3002 */
.dchat-listItem .dchat-code {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* \u5DE6\u4FA7\u7684\u6587\u5B57\uFF08\u540D\u5B57\u3001\u8BF4\u660E\uFF09\u5141\u8BB8\u6362\u884C\u3001\u5141\u8BB8\u6536\u7F29\u2014\u2014\u4E0D\u8BB8\u628A\u53F3\u4FA7\u7684\u64CD\u4F5C\u9876\u51FA\u53BB\u3002 */
.dchat-listItem > :not(.dchat-actions) {
  min-width: 0;
  overflow-wrap: anywhere;
}
/* \u767D\u540D\u5355\u884C\uFF1A\u540D\u5B57 + id \u653E\u540C\u4E00\u4E2A\u5757\u91CC\uFF08id \u624D\u662F\u5224\u5B9A\u7528\u7684\u503C\uFF0C\u540D\u5B57\u53EA\u662F\u7ED9\u4EBA\u770B\u7684\uFF09\u3002
   \u4E24\u4E2A\u90FD\u5141\u8BB8\u6536\u7F29\u5E76\u7701\u7565\u53F7\uFF0C\u8C01\u957F\u8C01\u8BA9\u4F4D\u2014\u2014\u540D\u5B57\u5F88\u957F\u65F6\u4E0D\u8BB8\u628A id \u9876\u51FA\u5BB9\u5668\u3002 */
.dchat-policyEntry {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.dchat-policyEntry > * {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dchat-policyName {
  color: var(--dsw-alias-label-primary);
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
/*
 * \u8BBE\u7F6E\u5206\u7EC4\uFF1A\u5206\u7C7B\u5BFC\u822A + \u6BCF\u7EC4\u6807\u9898 + \u7EC4\u5185\u5361\u7247\u3002
 *
 * \u4E3A\u4EC0\u4E48\u8981\u5206\u7EC4\uFF1A\u673A\u5668\u4EBA\u8BBE\u7F6E\u9875\u662F\u9010\u8F6E\u8FFD\u52A0\u51FA\u6765\u7684\uFF0C\u5B9E\u6D4B 3200+px \u9AD8\u300110 \u5F20\u5361\u7247\u5E73\u94FA\uFF0C
 * \u60F3\u6539\u4E00\u9879\u5F97\u76F2\u6EDA\u3002\u5206\u7EC4\u53EA\u505A"\u5F52\u7C7B + \u8DF3\u8F6C"\uFF0C\u4E0D\u6539\u4EFB\u4F55\u5361\u7247\u7684\u5B9E\u73B0\u3002
 */
.dchat-groups {
  display: flex;
  align-items: center;
  gap: 6px;
  /* \u5206\u7C7B\u591A\u7684\u65F6\u5019\u6362\u884C\uFF0C\u4E0D\u628A\u6700\u540E\u4E00\u4E2A\u6324\u51FA\u5BB9\u5668\uFF08\u7A84\u680F\u4E0B\u7684\u8001\u95EE\u9898\uFF09\u3002 */
  flex-wrap: wrap;
  /* \u5438\u9876\uFF1A\u6EDA\u5230\u9875\u9762\u4E0B\u534A\u90E8\u65F6\u5206\u7C7B\u8FD8\u5728\uFF0C\u968F\u65F6\u80FD\u8DF3\u56DE\u53BB\u3002 */
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 6px 0;
  background: var(--dsw-alias-bg-layer-1);
}
.dchat-groupTab {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  /* \u6C38\u8FDC\u5355\u884C\uFF1A\u4E2D\u6587 min-content \u53EA\u6709\u4E00\u4E2A\u5B57\uFF0Cflex \u538B\u7F29\u4F1A\u53D8\u6210"\u5448\u73B0/\u65B9\u5F0F"\u8FD9\u79CD\u4E00\u5B57\u4E00\u884C\u3002 */
  white-space: nowrap;
  padding: 4px 12px;
  cursor: pointer;
}
.dchat-groupTab:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dchat-groupTab[aria-current='true'] {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
  font-weight: 500;
}
.dchat-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* \u8DF3\u8F6C\u65F6\u6807\u9898\u4E0D\u8981\u8D34\u5728\u5BB9\u5668\u6700\u4E0A\u8FB9\uFF08\u5438\u9876\u7684\u5206\u7C7B\u4F1A\u76D6\u4F4F\u5B83\uFF09\u3002 */
  scroll-margin-top: 44px;
}
.dchat-groupHeading {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
/*
 * \u5206\u7EC4\u6807\u9898\u672C\u8EAB\u4E0D\u5438\u9876\uFF0C\u53EA\u6709\u9876\u90E8\u7684\u5206\u7C7B\u6761\u5438\u9876\u3002
 * \u4F46"\u5206\u7C7B\u6761 + \u7B2C\u4E00\u7EC4\u6807\u9898"\u4E4B\u95F4\u8981\u6709\u547C\u5438\u611F\uFF0C\u5426\u5219\u7B2C\u4E00\u7EC4\u7684\u6807\u9898\u770B\u8D77\u6765\u50CF\u662F\u5206\u7C7B\u6761\u7684\u4E00\u90E8\u5206\u3002
 */
.dchat-groups + .dchat-group {
  margin-top: 6px;
}
/* \u7EC4\u4E0E\u7EC4\u4E4B\u95F4\u7559\u51FA\u660E\u663E\u5927\u4E8E\u7EC4\u5185\u5361\u7247\u95F4\u8DDD\u7684\u7A7A\u9699\uFF0C\u8FB9\u754C\u624D\u770B\u5F97\u51FA\u6765\u3002 */
.dchat-group + .dchat-group {
  margin-top: 18px;
}
/*
 * \u573A\u5408\u5207\u6362\u5668\uFF1A\u628A"\u8FD9\u4E2A\u8BBE\u7F6E\u9879\u5206\u79C1\u804A/\u7FA4\u804A\u4E24\u4EFD"\u6536\u655B\u6210\u4E00\u5957\u4EA4\u4E92\u8BED\u8A00\u3002
 *
 * \u5728\u6B64\u4E4B\u524D\u6709 5 \u4E2A\u5206\u53C9\u9879\u30015 \u79CD\u753B\u6CD5\uFF08\u5E76\u6392\u4E24\u5757 / \u7AD6\u6392\u4E24\u4E2A\u4E0B\u62C9 / 8\xD72 \u52FE\u9009\u8868\u683C / \u5F39\u7A97\u9875\u7B7E /
 * \u56DB\u5C42\u4E0B\u62C9\uFF09\uFF0C\u7528\u6237\u5F97\u5B66\u4E94\u5957\u3002\u73B0\u5728"\u6539\u54EA\u4E2A\u573A\u5408"\u5728\u5206\u7EC4\u9876\u90E8\u95EE\u4E00\u6B21\uFF0C\u4E0B\u9762\u6240\u6709\u5361\u90FD\u53EA\u753B\u90A3\u4E00\u4EFD\u3002
 */
.dchat-scopeSwitcher {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}
.dchat-scopeTabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  /* \u5206\u6BB5\u63A7\u4EF6\u4E0D\u6362\u884C\uFF1A\u5B83\u53EA\u6709\u4E24\u4E09\u9879\uFF0C\u62C6\u884C\u4F1A\u8BA9"\u5F53\u524D\u9009\u7684\u662F\u54EA\u4E2A"\u53D8\u5F97\u96BE\u8BA4\u3002 */
  flex-wrap: nowrap;
  max-width: 100%;
}
.dchat-scopeTab {
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  /* \u4E2D\u6587 min-content \u53EA\u6709\u4E00\u4E2A\u5B57\uFF1A\u4E0D\u9501\u5355\u884C\u4F1A\u88AB\u538B\u6210"\u79C1/\u804A"\u7AD6\u6392\u3002 */
  white-space: nowrap;
  padding: 4px 14px;
  cursor: pointer;
}
.dchat-scopeTab:hover:not([aria-selected='true']) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dchat-scopeTab[aria-selected='true'] {
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-brand-primary);
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .08);
}
/*
 * \u5E2E\u52A9\u56FE\u6807\uFF1A\u5706\u5F62\u8FB9\u6846\u95EE\u53F7 + **\u60AC\u6D6E\u6C14\u6CE1**\uFF08\u4E0D\u662F\u70B9\u5F00\u5728\u9875\u9762\u91CC\u5C55\u5F00\u4E00\u6BB5\uFF09\u3002
 *
 * \u5C55\u5F00\u4F1A\u9876\u52A8\u4E0B\u9762\u7684\u5185\u5BB9\u3001\u6253\u65AD\u89C6\u7EBF\uFF1B\u6C14\u6CE1\u6D6E\u5728\u4E0A\u9762\u770B\u5B8C\u5C31\u8D70\u3002
 * \u89E6\u5C4F\u6CA1\u6709 hover\uFF0C\u6240\u4EE5 :focus-within\uFF08\u70B9\u51FB/\u952E\u76D8\u805A\u7126\uFF09\u4E5F\u8981\u663E\u793A\u3002
 */
.dchat-help {
  display: inline-flex;
  align-items: center;
  /* \u8DDF\u7740\u6587\u5B57\u8D70\uFF0C\u4E0D\u53E6\u8D77\u4E00\u884C\uFF08\u5426\u5219\u6BCF\u5F20\u5361\u90FD\u591A\u4E00\u884C\u9AD8\u5EA6\uFF09\u3002 */
  vertical-align: middle;
  margin-left: 4px;
}
.dchat-helpButton {
  flex: none;
  width: 15px;
  height: 15px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 10px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: help;
}
.dchat-helpButton:hover:not(:disabled),
.dchat-helpButton:focus-visible {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
}
/*
 * \u6C14\u6CE1**\u9ED8\u8BA4\u4E0D\u53EF\u89C1**\uFF08\u7528\u6237\u8BF4\u7684\u662F"\u4E0D\u505A\u70B9\u51FB\u5728\u9875\u9762\u663E\u793A"\u2014\u2014\u6240\u4EE5\u5B83\u4E0D\u662F\u5C55\u5F00\u7684\u6B63\u6587\uFF09\u3002
 *
 * \u5B9A\u4F4D\u57FA\u51C6\u662F**\u6240\u5728\u7684\u90A3\u4E2A\u8BF4\u660E\u6BB5\u843D**\uFF08\u5B83\u662F position: relative\uFF09\uFF0C\u6C14\u6CE1 left/right \u6491\u6EE1\u6BB5\u843D\u5BBD\u5EA6\uFF1A
 * \u4EE5\u56FE\u6807\u4E3A\u57FA\u51C6\u7684\u8BDD\uFF0C\u8981\u4E48\u88AB\u538B\u6210\u4E00\u6761\u7AD6\u7EBF\uFF0C\u8981\u4E48\u5728 320px \u7A84\u680F\u91CC\u6491\u7834\u5BB9\u5668\uFF08\u5B88\u95E8\u4F1A\u91CF\u6A2A\u5411\u6EA2\u51FA\uFF09\u3002
 */
.dchat-helpTip {
  display: none;
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  /* \u6491\u6EE1\u5B9A\u4F4D\u57FA\u51C6\uFF08\u5361\u7247\u5934\uFF09\u7684\u5BBD\u5EA6\uFF1A\u8FD9\u662F"\u6C38\u8FDC\u6709\u6574\u5361\u5BBD\u53EF\u8BFB"\u7684\u4FDD\u8BC1\u3002 */
  left: 0;
  right: 0;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, .12);
  flex-direction: column;
  gap: 4px;
  text-align: left;
  font-weight: 400;
}
.dchat-help:hover .dchat-helpTip,
.dchat-help:focus-within .dchat-helpTip {
  display: flex;
}
.dchat-helpLine {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  /* \u957F\u53E5\u6B63\u5E38\u6362\u884C\uFF1B\u8DEF\u5F84/\u82F1\u6587\u4E32\u4E0D\u6491\u7834\u5BB9\u5668\u3002 */
  overflow-wrap: anywhere;
}
/* \u53EA\u7ED9\u8BFB\u5C4F\u770B\u7684\u5185\u5BB9\uFF08\u6C14\u6CE1\u5BF9\u8BFB\u5C4F\u4E0D\u4E00\u5B9A\u53EF\u8FBE\uFF0C\u5185\u5BB9\u4E0D\u80FD\u56E0\u6B64\u4E22\u6389\uFF09\u3002 */
.dchat-visuallyHidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.dchat-scopeHint {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
/*
 * \u573A\u5408\u6761\uFF1A\u9875\u9762\u7EA7\u7684"\u73B0\u5728\u5728\u6539\u54EA\u4E2A\u573A\u5408"\u3002
 * \u4E0E\u5361\u7247\u5206\u5F00\u4E00\u70B9\u8DDD\u79BB\uFF0C\u8868\u660E\u5B83\u7BA1\u7684\u662F**\u4E0B\u9762\u5168\u90E8\u5361\u7247**\u800C\u4E0D\u662F\u67D0\u4E00\u5F20\u3002
 */
.dchat-scopeBar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
}
/* \u573A\u5408\u6761\u91CC\u7684\u6807\u7B7E\u4E0D\u4E0E\u5207\u6362\u5668\u62A2\u5BBD\u5EA6\uFF08\u7A84\u680F\u4E0B\u6362\u884C\u800C\u4E0D\u662F\u628A\u6807\u7B7E\u538B\u6210\u7AD6\u6392\uFF09\u3002 */
.dchat-scopeBar > .dchat-scopeLabel {
  flex: none;
}
/* \u7EC4\u7684\u4E00\u53E5\u8BDD\u6784\u6210\uFF1A\u8BA9\u4EBA\u4E0D\u5FC5\u6EDA\u52A8\u5C31\u77E5\u9053\u8FD9\u4E00\u7EC4\u91CC\u6709\u54EA\u51E0\u9879\u3002 */
.dchat-groupHint {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.dchat-groupBody {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
.dchat-grip {
  /*
   * \u62D6\u52A8\u628A\u624B\uFF1A\u53EA\u80FD\u62D6\u5B83\uFF0C\u4E0D\u8BA9\u6574\u884C\u53EF\u62D6\u2014\u2014\u6574\u884C\u53EF\u62D6\u4F1A\u4E0E"\u70B9\u4E00\u4E0B\u5207\u6362\u6E20\u9053/\u673A\u5668\u4EBA"\u62A2\u624B\u52BF\uFF0C
   * \u800C\u4E14 button \u5143\u7D20\u5728\u90E8\u5206\u6D4F\u89C8\u5668\u4E0A draggable \u4E0D\u751F\u6548\u3002\u79FB\u52A8\u7AEF\u4E0D\u652F\u6301 HTML5 \u62D6\u653E\uFF0C
   * \u6240\u4EE5\u5B83\u53EA\u662F\u684C\u9762\u7AEF\u7684\u4FBF\u5229\u529F\u80FD\uFF08\u987A\u5E8F\u672C\u8EAB\u4E0D\u5F71\u54CD\u4EFB\u4F55\u884C\u4E3A\uFF09\u3002
   */
  flex: none;
  cursor: grab;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1;
  letter-spacing: -1px;
  user-select: none;
}
.dchat-grip:active {
  cursor: grabbing;
}
/* \u62D6\u52A8\u7ECF\u8FC7\u7684\u53EF\u843D\u70B9\uFF1A\u53EA\u505A\u9AD8\u4EAE\uFF0C\u4E0D\u6539\u5E03\u5C40\uFF08\u6539\u52A8\u5E03\u5C40\u4F1A\u8BA9\u62D6\u52A8\u624B\u611F\u6296\uFF09\u3002 */
.dchat-dropTarget {
  border-color: var(--dsw-alias-brand-primary) !important;
  box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary);
}
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
  /*
   * \u52A0\u62D6\u52A8\u628A\u624B\u4E4B\u540E\u7A84\u680F\uFF08320px\uFF09\u4F1A\u5DEE\u51E0\u4E2A\u50CF\u7D20\uFF1Aflex \u9879\u9ED8\u8BA4 min-width:auto \u4E0D\u4F1A\u7F29\uFF0C
   * \u4E8E\u662F\u300C\u6700\u8FD1 09-19 10:21\u300D\u6574\u5757\u9876\u51FA\u53BB\u3002\u5141\u8BB8\u8FD9\u4E9B\u7247\u6BB5\u81EA\u5DF1\u6536\u6210\u7701\u7565\u53F7\uFF0C
   * \u800C\u4E0D\u662F\u628A\u6574\u884C\u6491\u7834\u2014\u2014\u6807\u9898\u4E0E\u540D\u79F0\u5728\u4E0A\u9762\u4E00\u884C\uFF0C\u4ECD\u7136\u8BFB\u5F97\u5230\u3002
   */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
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
/* \u8BCA\u65AD\u9762\u677F\u91CC\u7684\u6E20\u9053\u5757\u5934\uFF1A\u6807\u9898\u4E0E\u72B6\u6001\u70B9\u5728\u4E24\u4FA7\uFF0C\u653E\u4E0D\u4E0B\u5C31\u6574\u5757\u6362\u884C\u3002 */
.dchat-diagHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
/* \u6807\u9898\u4E0D\u6298\u884C\uFF08\u6298\u4E86\u5C31\u662F"\u9010\u5B57\u7AD6\u6392"\uFF09\u2014\u2014\u5B83\u6574\u5757\u6362\u884C\u9760\u4E0A\u9762\u90A3\u6761 wrap\u3002 */
.dchat-diagHead > .dchat-groupTitle {
  white-space: nowrap;
}
/* \u8BCA\u65AD\u9762\u677F\u91CC\u6BCF\u4E2A\u6E20\u9053/\u6BCF\u4E2A\u65E5\u5FD7\u5404\u4E00\u5757\uFF1A\u7AD6\u6392\u3002
   .dchat-entry \u662F"\u53EF\u70B9\u51FB\u7684\u6298\u53E0\u884C"\uFF08\u6A2A\u6392\uFF09\uFF0C\u62FF\u6765\u88C5\u8FD9\u4E9B\u5757\u4F1A\u628A\u5B83\u4EEC\u6324\u6210\u4E00\u6761\u6761\u7EC6\u6761\u3002 */
.dchat-diagSection {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.dchat-diagSection > .dchat-list {
  min-width: 0;
}
/* \u673A\u5668\u4EBA\u5757\uFF1A\u72B6\u6001\u884C + \u82E5\u5E72\u884C\u9519\u8BEF/\u63D0\u793A\uFF0C\u7AD6\u76F4\u6392\u5217\u3002 */
.dchat-diagBot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
/* \u8BCA\u65AD\u9762\u677F\u91CC\u7684\u673A\u5668\u4EBA\u884C\uFF1A\u4E00\u884C\u653E\u4E0D\u4E0B\u65F6\u6574\u4F53\u6362\u884C\uFF0C\u800C\u4E0D\u662F\u628A id \u9876\u51FA\u5BB9\u5668\u3002
   min-width: 0 \u662F\u5FC5\u987B\u7684\uFF1A\u8FD9\u4E9B\u5757\u7684\u5185\u5BB9\uFF0835 \u5B57\u7B26\u7684 open_id\uFF09\u4F1A\u628A flex \u9879\u7684
   min-width: auto \u6491\u6210 min-content\uFF0C\u4E8E\u662F\u6574\u5757\u6BD4\u5361\u7247\u8FD8\u5BBD\u3001\u628A\u9875\u9762\u9876\u51FA\u6EDA\u52A8\u6761\uFF08\u771F\u673A\u6D4B\u5230\u8FC7\uFF09\u3002 */
.dchat-diagRow {
  flex-wrap: wrap;
  min-width: 0;
}
.dchat-diagRow > .dchat-code {
  flex: 1 1 auto;
  min-width: 0;
}
.dchat-diagRow > .dchat-diagMeta {
  flex: 0 1 auto;
  min-width: 0;
}
/* \u8BCA\u65AD\u9762\u677F\u91CC\u673A\u5668\u4EBA\u884C\u7684\u53F3\u4FA7\u5143\u4FE1\u606F\uFF08\u72B6\u6001 \xB7 \u5DF2\u5904\u7406 \xB7 \u65F6\u95F4\uFF09\u3002
   \u6574\u5757\u4E0D\u6298\u884C\uFF08\u6298\u4E86\u5C31\u6210\u4E86"\u9010\u5B57\u7AD6\u6392"\uFF09\uFF0C\u653E\u4E0D\u4E0B\u65F6\u9760 .dchat-diagRow \u6362\u884C\u3002 */
.dchat-diagMeta {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}
/* \u65E5\u5FD7\u5C3E\u90E8\uFF1A\u7B49\u5BBD\u3001\u9650\u9AD8\u3001\u53CC\u5411\u53EF\u6EDA\uFF08\u6EDA\u52A8\u53D1\u751F\u5728\u5757\u5185\uFF0C\u4E0D\u4F1A\u628A\u6574\u9875\u6491\u5BBD\uFF09\u3002 */
.dchat-logTail {
  white-space: pre;
  max-height: 220px;
  overflow: auto;
  font-size: 11px;
  line-height: 1.5;
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
  /* \u64CD\u4F5C\u5757\u53EF\u4EE5\u7F29\u5230"\u6700\u5BBD\u7684\u90A3\u4E2A\u6309\u94AE"\uFF0C\u8FD9\u6837\u4E0B\u9762\u90A3\u6761 flex-wrap \u624D\u4F1A\u771F\u7684\u751F\u6548\u3002
     \u66FE\u7ECF\u5199\u7684\u662F flex: none\uFF1A\u5185\u5BB9\u518D\u5BBD\u4E5F\u4E0D\u7F29\uFF0C\u4E8E\u662F\u7A84\u680F\u91CC\uFF08320px \u7684 hub \u9875\u5934\uFF09
     \u6574\u5757\u76F4\u63A5\u9876\u51FA\u5BB9\u5668 15px \u2014\u2014 \u6B63\u662F\u5E03\u5C40\u5B88\u95E8\u91CF\u51FA\u6765\u7684\u90A3\u4E00\u6761\u3002
     \u6309\u94AE\u81EA\u8EAB\u4ECD\u662F flex: none\uFF0C\u4E0D\u4F1A\u51FA\u73B0"\u9010\u5B57\u7AD6\u6392"\u3002 */
  flex: 0 1 auto;
  min-width: 0;
  /* \u653E\u4E0D\u4E0B\u65F6\u6309\u94AE\u81EA\u5DF1\u6362\u884C\uFF0C\u800C\u4E0D\u662F\u628A\u6574\u5757\u9876\u51FA\u5BB9\u5668\uFF08\u7A84\u680F\u91CC"\u4E0B\u62C9+\u4E24\u4E2A\u6309\u94AE"\u5C31\u4F1A\u6EA2\u51FA\uFF09\u3002 */
  flex-wrap: wrap;
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
   .dchat-select \u662F width:100%\uFF0C\u914D flex:none \u4F1A\u5148\u5360\u6EE1\u6574\u884C\uFF0C\u518D\u628A\u540C\u6392\u7684\u6309\u94AE\u6324\u51FA\u5BB9\u5668\u3002 */
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
  /* \u4E2D\u6587\u6309\u94AE\u88AB\u538B\u7A84\u65F6\u4F1A\u4E8C\u5B57\u7AD6\u6392\uFF0C\u4EFB\u4F55\u6309\u94AE\u90FD\u4E0D\u5141\u8BB8\u6298\u884C\u3002 */
  white-space: nowrap;
}
.dchat-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dchat-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* \u6B21\u8981\u5165\u53E3\uFF08\u5982\u300C\u7248\u672C\u4E0E\u66F4\u65B0\u300D\uFF09\uFF1A\u6587\u5B57\u94FE\u63A5\u5F62\u6001\uFF0C\u4E0D\u548C DSH \u81EA\u5DF1\u7684\u5B9E\u5FC3\u6309\u94AE\u62A2\u6CE8\u610F\u529B\u3002 */
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
/* \u4E0D\u53EF\u9006\u64CD\u4F5C\uFF1A\u89E6\u53D1\u6309\u94AE\u53EA\u67D3\u6587\u5B57\uFF0C\u786E\u8BA4\u6309\u94AE\u624D\u7528\u5B9E\u5E95\uFF0C\u907F\u514D\u4E24\u4E2A\u540C\u7EA7\u7070\u6309\u94AE\u91CC\u85CF\u7740\u5220\u9664\u3002 */
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
  /* \u72B6\u6001\u70B9\u81EA\u5DF1\u6C38\u8FDC\u4E0D\u6298\u884C\u4E5F\u4E0D\u538B\u7F29\uFF08\u7A84\u680F\u91CC\u66FE\u88AB\u538B\u6210\u300C\u8FD0\u884C\u6B63/\u5E38\u300D\uFF09\u3002 */
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
/* \u90E8\u5206\u6210\u529F\u7684\u544A\u8B66\uFF08\u4F8B\uFF1A\u673A\u5668\u4EBA\u52A0\u4E0A\u4E86\u3001\u4F46\u987A\u5E26\u90A3\u6B65\u6CA1\u505A\u6210\uFF09\uFF1A\u4E0D\u662F\u5931\u8D25\uFF0C\u4F46\u7EDD\u4E0D\u80FD\u4E0D\u8BF4\u3002 */
.dchat-warning {
  font-size: 12px;
  color: var(--dsw-alias-state-warn-primary);
}
.dchat-buttonPrimary {
  background: var(--dsw-alias-brand-primary);
  border-color: transparent;
  color: #fff;
}
/* \u63A5\u5165\u8868\u5355\uFF1A\u4E24\u6761\u8DEF\uFF08\u626B\u7801\u65B0\u5EFA / \u624B\u52A8\u63A5\u5165\uFF09\u5404\u5360\u4E00\u6BB5\uFF0C\u6BB5\u95F4\u4E00\u6761\u7EC6\u7EBF\u3002 */
.dchat-onboardSection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.dchat-onboardTitle {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dchat-onboardDivider {
  width: 100%;
  margin: 14px 0;
  border: 0;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
/* \u4E8C\u7EF4\u7801\uFF1A\u56FA\u5B9A\u5C3A\u5BF8\u3001\u522B\u88AB flex \u538B\u6241\uFF08\u7A84\u680F\u91CC width:100% \u7684\u56FE\u7247\u4F1A\u53D8\u5F62\uFF09\u3002 */
.dchat-onboardQr {
  flex: none;
  align-self: flex-start;
  border-radius: 6px;
  background: #fff;
}
.dchat-onboardLink {
  color: var(--dsw-alias-brand-primary);
  font-size: 12px;
  overflow-wrap: anywhere;
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
/* \u6298\u53E0\u6001\u7684\u5165\u53E3\u884C\u653E\u5728\u5361\u7247\u91CC\u65F6\uFF0C\u8DDF\u5185\u5C42\u8BBE\u7F6E\u5757\u7528\u540C\u4E00\u79CD\u5F62\u6001\uFF08\u5206\u9694\u7EBF + \u6574\u5BBD + \u540C\u5B57\u53F7\u6807\u9898\uFF09\uFF0C
   \u5426\u5219\u5B83 40px \u9AD8\u7684\u5706\u89D2\u5C0F\u76D2\u5B50\u5939\u5728\u4E24\u5F20\u5C55\u5F00\u5361\u7247\u4E2D\u95F4\uFF0C\u770B\u8D77\u6765\u50CF\u6839\u5206\u9694\u7EBF\u3002 */
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
.dchat-tabPanel[hidden] {
  display: none;
}
/*
 * hidden \u5C5E\u6027\u9760 UA \u6837\u5F0F\u91CC\u7684 [hidden]{display:none} \u751F\u6548\uFF0C\u800C\u4E0A\u9762\u90A3\u6761 display:flex \u662F\u4F5C\u8005\u6837\u5F0F
 * \u2014\u2014\u4F18\u5148\u7EA7\u66F4\u9AD8\uFF0C\u4E8E\u662F"\u9690\u85CF"\u7684\u9875\u7B7E\u7167\u6837\u663E\u793A\uFF1A\u79C1\u804A\u4E0E\u7FA4\u804A\u4E24\u4E2A\u9875\u7B7E\u770B\u8D77\u6765\u4E00\u6A21\u4E00\u6837\uFF08\u771F\u673A\u622A\u56FE\u5C31\u662F
 * \u4E24\u5F20\u5185\u5BB9\u5B8C\u5168\u76F8\u540C\u7684\u9875\u7B7E\uFF09\u3002\u4EFB\u4F55\u7ED9\u5143\u7D20\u5199\u4E86 display \u7684\u5730\u65B9\uFF0C\u7528 hidden \u90FD\u8981\u8865\u8FD9\u6761\u3002
 * \u6CE8\u610F\uFF1A\u672C\u6587\u4EF6\u662F\u6A21\u677F\u5B57\u7B26\u4E32\uFF0C\u6CE8\u91CA\u91CC**\u4E0D\u80FD\u51FA\u73B0\u53CD\u5F15\u53F7**\uFF08\u4F1A\u628A\u6A21\u677F\u63D0\u524D\u95ED\u5408\uFF0C\u5386\u53F2\u4E0A\u683D\u8FC7\u4E00\u6B21\uFF09\u3002
 */

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
.dchat-input,
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
/*
 * \u300C\u50CF\u4E0B\u62C9\u3001\u4F46\u80FD\u624B\u6253\u300D\u7684\u8F93\u5165\u6846\uFF08\u5DE5\u4F5C\u533A\u8DEF\u5F84\uFF09\u3002
 *
 * \u4E3A\u4EC0\u4E48\u4E0D\u7528\u539F\u751F <input list> + <datalist>\uFF1A\u90A3\u4E2A\u4E0B\u62C9\u7BAD\u5934\u7531\u6D4F\u89C8\u5668/\u7CFB\u7EDF\u753B\uFF0C
 * \u8FB9\u6846\u3001\u5706\u89D2\u3001\u7BAD\u5934\u4E0E\u9875\u9762\u4E0A\u5176\u5B83 .dchat-select \u90FD\u4E0D\u4E00\u6837\uFF08\u771F\u673A\u53CD\u9988"\u98CE\u683C\u4E0D\u4E00\u81F4"\uFF09\u3002
 * \u8FD9\u91CC\u5916\u58F3\u7167\u6284 .dchat-select \u7684 token\uFF0C\u7BAD\u5934\u662F\u81EA\u5BB6\u6309\u94AE\uFF0C\u89C2\u611F\u4E0E\u4E0B\u62C9\u5B8C\u5168\u4E00\u81F4\u3002
 */
.dchat-combo {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  box-sizing: border-box;
  /* \u4E0E .dchat-select \u540C\u4E00\u5957\u5916\u89C2 token\uFF08\u6539\u8FD9\u91CC\u8981\u4E00\u8D77\u6539\uFF0C\u4E24\u4E2A\u63A7\u4EF6\u624D\u957F\u5F97\u4E00\u6837\uFF09\u3002 */
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  padding: 6px 8px;
}
.dchat-comboInput {
  flex: 1 1 auto;
  /* min-width: 0 \u8BA9\u957F\u8DEF\u5F84\u5728\u7A84\u680F\u91CC\u6536\u7F29\uFF0C\u800C\u4E0D\u662F\u628A\u7BAD\u5934\u6324\u51FA\u53BB\uFF08\u5B88\u95E8\u4F1A\u91CF\u6A2A\u5411\u6EA2\u51FA\uFF09\u3002 */
  min-width: 0;
  border: 0;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  outline: none;
}
.dchat-comboArrow {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}
.dchat-comboArrow:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
/* \u5019\u9009\u5217\u8868\uFF1A\u7EDD\u5BF9\u5B9A\u4F4D\uFF08\u4E0D\u5360\u4F4D\u3001\u4E0D\u6491\u9AD8\u5361\u7247\uFF09\uFF0C\u6D6E\u5728\u5916\u58F3\u4E0B\u65B9\u3002 */
.dchat-comboList {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  /* \u4E0E\u5916\u6846\u7684\u8FB9\u6846\u5BF9\u9F50\uFF08-1px = \u5916\u6846\u90A3 1px \u8FB9\u6846\uFF09\uFF1A
     \u5C45\u4E2D\u7684\u8BDD\u4E24\u6761\u8FB9\u6846\u4F1A\u9519\u5F00\u4E00\u50CF\u7D20\u3001\u5728\u5706\u89D2\u5904\u53E0\u51FA\u4E00\u5C0F\u5757\u6DF1\u8272\u3002 */
  left: -1px;
  right: -1px;
  max-height: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 4px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, .12);
}
.dchat-comboOption {
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  text-align: left;
  padding: 5px 8px;
  cursor: pointer;
  /* \u957F\u8DEF\u5F84\u622A\u65AD\u663E\u793A\uFF08\u5B8C\u6574\u503C\u5728 title \u91CC\uFF09\uFF0C\u5426\u5219\u7A84\u680F\u4E0B\u8FD9\u4E00\u884C\u4F1A\u6298\u6210\u597D\u51E0\u884C\u3002 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dchat-comboOption:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dchat-comboOption[aria-selected='true'] {
  color: var(--dsw-alias-brand-primary);
  font-weight: 500;
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
  /* \u5E2E\u52A9\u6C14\u6CE1\u7684\u5B9A\u4F4D\u57FA\u51C6\uFF08\u8BE5\u884C\u91CC\u6709 HelpHint\uFF09\u3002 */
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dchat-scopeLabel {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.dchat-panelSections {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dchat-panelSectionsHead,
.dchat-panelSectionsRow {
  display: flex;
  align-items: center;
  gap: 12px;
}
/*
 * \u540D\u79F0\u5360\u6EE1\u5269\u4F59\u5BBD\u5EA6\uFF0C\u52FE\u9009\u6846\u56FA\u5B9A\u5BBD\u5EA6\uFF1A
 * \u5355\u5217\u5F62\u6001\u4E0B\u52FE\u9009\u6846\u5728**\u5DE6**\u3001\u540D\u79F0\u5728\u53F3\uFF08\u52FE\u9009\u6846\u8D34\u5DE6\u662F\u4E3A\u4E86\u52FE\u9009\u65F6\u773C\u775B\u6709\u56FA\u5B9A\u843D\u70B9\uFF09\u3002
 * \u540D\u79F0\u8981 flex: 1 1 auto \u4E14 min-width: 0\uFF1A\u4E2D\u6587\u7684 min-content \u53EA\u6709\u4E00\u4E2A\u5B57\uFF0C
 * \u4E0D\u8BBE min-width \u4F1A\u8BA9\u5B83\u5728\u7A84\u680F\u91CC\u88AB\u538B\u6210"\u6A21/\u578B/\u4E0E/\u63A8/\u7406"\u8FD9\u79CD\u4E00\u5B57\u4E00\u884C\uFF08\u8FD9\u8F6E\u6E32\u67D3\u65F6\u771F\u51FA\u73B0\u8FC7\uFF09\u3002
 */
.dchat-panelSectionsName {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.dchat-panelSectionsHead > .dchat-scopeLabel:first-child {
  flex: 1 1 auto;
  min-width: 0;
}
.dchat-panelSectionsCheck {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  /* \u52FE\u9009\u6846\u672C\u8EAB\u4E0D\u7F29\uFF1B\u7F29\u7684\u662F\u6587\u5B57\u3002 */
  cursor: pointer;
}
.dchat-panelSectionsCheck input {
  margin: 0;
  flex: none;
}
/* \u540D\u79F0\u8DDF\u5728\u52FE\u9009\u6846\u540E\u9762\u65F6\uFF0C\u4ECD\u8981\u80FD\u5403\u6389\u5269\u4F59\u5BBD\u5EA6\uFF08\u5355\u5217\u5F62\u6001\u7684\u5E38\u89C4\u60C5\u51B5\uFF09\u3002 */
.dchat-panelSectionsCheck > .dchat-panelSectionsName {
  flex: 1 1 auto;
  min-width: 0;
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
  /* anywhere \u800C\u4E0D\u662F break-all\uFF1A\u53EA\u5728\u771F\u7684\u653E\u4E0D\u4E0B\u65F6\u624D\u65AD\u957F\u4E32\uFF0C\u4E0D\u4F1A\u628A\u666E\u901A\u8BCD\u4E5F\u5207\u788E\u3002 */
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
var h8 = React9.createElement;
function Panel({ title, description, actions, children, ...rest }) {
  return h8(
    "section",
    { className: "dchat-card", ...rest },
    title || description || actions ? h8(
      "div",
      { className: "dchat-cardHeader" },
      h8(
        "div",
        { className: "dchat-cardHeading" },
        title ? h8("h3", { className: "dchat-cardTitle" }, title) : null,
        description ? h8("p", { className: "dchat-cardDescription" }, description) : null
      ),
      actions ? h8("div", { className: "dchat-actions" }, actions) : null
    ) : null,
    children
  );
}
function EmptyState({ title, description, children }) {
  return h8(
    "div",
    { className: "dchat-empty" },
    h8("span", { className: "dchat-emptyTitle" }, title),
    description ? h8("span", null, description) : null,
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
  return h8("span", {
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
      /** 机器人跑在哪个目录（只对新建会话生效）。 */
      WorkspaceEditor,
      /** 用哪套 Agent 预设（只对新建会话生效）。 */
      PresetEditor,
      /** 机器人默认模型（还没有会话时用它，只对新建会话生效）。 */
      ModelEditor,
      /** 谁能跟机器人说话、谁能执行命令（立即生效）。 */
      AccessPolicyEditor,
      /** 控制面板卡片显示哪些项（私聊/群聊分开）。 */
      PanelSectionsEditor,
      /** 属主：绕过所有策略的人（改完渠道会重连一次）。 */
      OwnerEditor,
      /** 主动投递目标：清单、候选收编、测试发送（数据经 hub 控制端点）。 */
      DeliveryTargetsEditor,
      /** 设置页分组导航：把一长条卡片按职能归类 + 点分类跳转（不改卡片实现）。 */
      SettingGroups,
      /** 场合切换器：分私聊/群聊的设置项共用同一套交互语言。 */
      ScopeSwitcher,
      /** 帮助图标：把"想知道再看"的说明收进问号（常驻说明只留影响判断的那句）。 */
      HelpHint
    }),
    hooks: Object.freeze({
      /** 读取/保存 hub 持有的每机器人共享设置。 */
      useBotSettings,
      /** 该机器人聊过的会话（带名字），给"指定用户/指定群"这类选择器用。 */
      useConversations
    }),
    installStyles: () => installChatStyles(),
    /** 调用本渠道自己的 RPC。 */
    callChannelRpc: (connection, channelId, method, payload, signal) => callChatRpc(connection, channelId, method, payload, signal),
    /** 调用 hub 控制端点（渠道无关设置，如上下文增强）。 */
    callControlRpc: (connection, method, payload, signal) => callControlRpc(connection, method, payload, signal),
    unwrapRpc,
    /** 场合的规范定义（私聊/群聊），渠道页拿它喂给 ScopeSwitcher。 */
    SCOPE_DEFS,
    translate: t,
    /** 供渠道页复用的 React 运行时（渠道包只 external react/react-dom，无需各写一份）。 */
    react: React9,
    createElement: h8,
    /** hub 当前提供的契约版本，渠道页可据此显示兼容信息。 */
    contractVersion: CONTRACT_VERSION,
    context: Object.freeze({ has: () => typeof ctx === "object" })
  });
}

// packages/dsh-chat/client/i18n.js
var LOCALE_NAMESPACE = "dsh-chat";
var zh = {
  "Chat\u673A\u5668\u4EBA": "Chat\u673A\u5668\u4EBA",
  "\u6A21\u578B": "\u6A21\u578B",
  "\u9ED8\u8BA4\u6A21\u578B": "\u9ED8\u8BA4\u6A21\u578B",
  "\u63A8\u7406\u7B49\u7EA7": "\u63A8\u7406\u7B49\u7EA7",
  "\u8FD9\u4E2A\u6A21\u578B\u6CA1\u6709\u53EF\u9009\u7684\u63A8\u7406\u7B49\u7EA7\u3002": "\u8FD9\u4E2A\u6A21\u578B\u6CA1\u6709\u53EF\u9009\u7684\u63A8\u7406\u7B49\u7EA7\u3002",
  "\u5148\u9009\u4E00\u4E2A\u6A21\u578B\u3002": "\u5148\u9009\u4E00\u4E2A\u6A21\u578B\u3002",
  "\u6A21\u578B\u9ED8\u8BA4": "\u6A21\u578B\u9ED8\u8BA4",
  "\u90E8\u5206 provider \u8BFB\u53D6\u5931\u8D25\uFF1A": "\u90E8\u5206 provider \u8BFB\u53D6\u5931\u8D25\uFF1A",
  "\u5F53\u524D Host \u8BFB\u4E0D\u5230\u6A21\u578B\u76EE\u5F55\u3002": "\u5F53\u524D Host \u8BFB\u4E0D\u5230\u6A21\u578B\u76EE\u5F55\u3002",
  "\u8FD8\u6CA1\u6709\u4F1A\u8BDD\u65F6\u7528\u54EA\u4E2A\u6A21\u578B\uFF1A\u9009\u5B8C\u5BF9\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u751F\u6548\u3002\u4F1A\u8BDD\u5185\u8FD8\u80FD\u5355\u72EC\u6539\uFF08\u9762\u677F\u7684\u6A21\u578B\u4E0B\u62C9\uFF09\u3002": "\u8FD8\u6CA1\u6709\u4F1A\u8BDD\u65F6\u7528\u54EA\u4E2A\u6A21\u578B\uFF1A\u9009\u5B8C\u5BF9\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u751F\u6548\u3002\u4F1A\u8BDD\u5185\u8FD8\u80FD\u5355\u72EC\u6539\uFF08\u9762\u677F\u7684\u6A21\u578B\u4E0B\u62C9\uFF09\u3002",
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
  "\u8BA9\u5B9A\u65F6\u4EFB\u52A1\u6216 agent \u628A\u7ED3\u679C\u76F4\u63A5\u53D1\u5230\u6307\u5B9A\u4F1A\u8BDD\u3002": "\u8BA9\u5B9A\u65F6\u4EFB\u52A1\u6216 agent \u628A\u7ED3\u679C\u76F4\u63A5\u53D1\u5230\u6307\u5B9A\u4F1A\u8BDD\u3002",
  "\u663E\u793A\u9879": "\u663E\u793A\u9879",
  "\u63A7\u5236\u9762\u677F\u663E\u793A\u9879": "\u63A7\u5236\u9762\u677F\u663E\u793A\u9879",
  "\u53EA\u5F71\u54CD /menu \u53D1\u51FA\u6765\u7684\u90A3\u5F20\u5361\u7247\uFF1A\u5173\u6389\u7684\u9879\u4E0D\u663E\u793A\uFF0C\u529F\u80FD\u7167\u65E7\u3002": "\u53EA\u5F71\u54CD /menu \u53D1\u51FA\u6765\u7684\u90A3\u5F20\u5361\u7247\uFF1A\u5173\u6389\u7684\u9879\u4E0D\u663E\u793A\uFF0C\u529F\u80FD\u7167\u65E7\u3002",
  "\u6A21\u578B\u4E0E\u63A8\u7406\u7B49\u7EA7": "\u6A21\u578B\u4E0E\u63A8\u7406\u7B49\u7EA7",
  "\u4F1A\u8BDD": "\u4F1A\u8BDD",
  "Agent \u9884\u8BBE\u4E0E\u5DE5\u4F5C\u533A": "Agent \u9884\u8BBE\u4E0E\u5DE5\u4F5C\u533A",
  "\u4E0A\u4E0B\u6587\u589E\u5F3A\uFF08\u672C\u4F1A\u8BDD\uFF09": "\u4E0A\u4E0B\u6587\u589E\u5F3A\uFF08\u672C\u4F1A\u8BDD\uFF09",
  "\u8BBF\u95EE\u7B56\u7565\uFF08\u672C\u4F1A\u8BDD\uFF09": "\u8BBF\u95EE\u7B56\u7565\uFF08\u672C\u4F1A\u8BDD\uFF09",
  "\u6E20\u9053\u8BBE\u7F6E\uFF08\u4EFB\u52A1\u8FC7\u7A0B\u5C55\u793A\u7B49\uFF09": "\u6E20\u9053\u8BBE\u7F6E\uFF08\u4EFB\u52A1\u8FC7\u7A0B\u5C55\u793A\u7B49\uFF09",
  "\u6E20\u9053\u52A8\u4F5C\u6309\u94AE\uFF08\u91CD\u8FDE\u7B49\uFF09": "\u6E20\u9053\u52A8\u4F5C\u6309\u94AE\uFF08\u91CD\u8FDE\u7B49\uFF09",
  "\u547D\u4EE4\u6309\u94AE\uFF08\u65B0\u4F1A\u8BDD/\u72B6\u6001/\u8BCA\u65AD\u2026\uFF09": "\u547D\u4EE4\u6309\u94AE\uFF08\u65B0\u4F1A\u8BDD/\u72B6\u6001/\u8BCA\u65AD\u2026\uFF09",
  "\u62D6\u52A8\u53EF\u8C03\u6574\u987A\u5E8F": "\u62D6\u52A8\u53EF\u8C03\u6574\u987A\u5E8F",
  "\u5728\u6E20\u9053\u81EA\u5DF1\u7684\u914D\u7F6E\u91CC\u5B8C\u6210\u63A5\u5165\u540E\uFF0C\u673A\u5668\u4EBA\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002": "\u5728\u6E20\u9053\u81EA\u5DF1\u7684\u914D\u7F6E\u91CC\u5B8C\u6210\u63A5\u5165\u540E\uFF0C\u673A\u5668\u4EBA\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002",
  "\u5168\u5C40": "\u5168\u5C40",
  "\u7EE7\u627F\u5168\u5C40": "\u7EE7\u627F\u5168\u5C40",
  "\u6062\u590D\u7EE7\u627F\u5168\u5C40": "\u6062\u590D\u7EE7\u627F\u5168\u5C40",
  "\u73B0\u5728\u8DDF\u968F\u300C\u5168\u5C40\u300D\u90A3\u4E00\u4EFD\uFF1B\u5728\u8FD9\u91CC\u6539\u4EFB\u4F55\u4E00\u9879\uFF0C\u5C31\u4F1A\u53D8\u6210\u8FD9\u4E2A\u573A\u5408\u7684\u5355\u72EC\u8BBE\u7F6E\u3002": "\u73B0\u5728\u8DDF\u968F\u300C\u5168\u5C40\u300D\u90A3\u4E00\u4EFD\uFF1B\u5728\u8FD9\u91CC\u6539\u4EFB\u4F55\u4E00\u9879\uFF0C\u5C31\u4F1A\u53D8\u6210\u8FD9\u4E2A\u573A\u5408\u7684\u5355\u72EC\u8BBE\u7F6E\u3002",
  "\u653E\u5F03\u6539\u52A8": "\u653E\u5F03\u6539\u52A8",
  "\u5DF2\u4FDD\u5B58\u3002\u4E0B\u4E00\u6761\u6D88\u606F\u751F\u6548\u3002": "\u5DF2\u4FDD\u5B58\u3002\u4E0B\u4E00\u6761\u6D88\u606F\u751F\u6548\u3002",
  "\u544A\u8BC9\u673A\u5668\u4EBA\uFF1A\u8FD9\u6761\u6D88\u606F\u4ECE\u54EA\u6765\u3001\u4EE5\u53CA\u8BE5\u600E\u4E48\u7528\u5B83\u3002": "\u544A\u8BC9\u673A\u5668\u4EBA\uFF1A\u8FD9\u6761\u6D88\u606F\u4ECE\u54EA\u6765\u3001\u4EE5\u53CA\u8BE5\u600E\u4E48\u7528\u5B83\u3002",
  "\u67E5\u770B\u5E2E\u52A9": "\u67E5\u770B\u5E2E\u52A9",
  "\u673A\u5668\u4EBA\u8DD1\u5728\u54EA\u4E2A\u76EE\u5F55\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002": "\u673A\u5668\u4EBA\u8DD1\u5728\u54EA\u4E2A\u76EE\u5F55\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002",
  "\u8FD9\u4E2A\u76EE\u5F55\u51B3\u5B9A\u5B83\u80FD\u8BFB\u5199\u54EA\u4E9B\u6587\u4EF6\u3001\u4EE5\u53CA\u7528\u54EA\u4E00\u4EFD AGENTS.md\u3002": "\u8FD9\u4E2A\u76EE\u5F55\u51B3\u5B9A\u5B83\u80FD\u8BFB\u5199\u54EA\u4E9B\u6587\u4EF6\u3001\u4EE5\u53CA\u7528\u54EA\u4E00\u4EFD AGENTS.md\u3002",
  "\u5DF2\u7ECF\u5EFA\u597D\u7684\u4F1A\u8BDD\u4E0D\u53D7\u5F71\u54CD\u2014\u2014\u60F3\u6362\u76EE\u5F55\u53C8\u60F3\u8BA9\u65E7\u4F1A\u8BDD\u8DDF\u4E0A\uFF0C\u5C31\u5728\u90A3\u4E2A\u804A\u5929\u91CC\u70B9\u300C\u65B0\u4F1A\u8BDD\u300D\u3002": "\u5DF2\u7ECF\u5EFA\u597D\u7684\u4F1A\u8BDD\u4E0D\u53D7\u5F71\u54CD\u2014\u2014\u60F3\u6362\u76EE\u5F55\u53C8\u60F3\u8BA9\u65E7\u4F1A\u8BDD\u8DDF\u4E0A\uFF0C\u5C31\u5728\u90A3\u4E2A\u804A\u5929\u91CC\u70B9\u300C\u65B0\u4F1A\u8BDD\u300D\u3002",
  "\u8FD9\u4E2A\u673A\u5668\u4EBA\u7528\u54EA\u5957 Agent \u9884\u8BBE\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002": "\u8FD9\u4E2A\u673A\u5668\u4EBA\u7528\u54EA\u5957 Agent \u9884\u8BBE\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002",
  "\u9884\u8BBE\u51B3\u5B9A\u5B83\u7684\u4EBA\u8BBE\u4E0E\u80FD\u7528\u54EA\u4E9B\u5DE5\u5177\u3002": "\u9884\u8BBE\u51B3\u5B9A\u5B83\u7684\u4EBA\u8BBE\u4E0E\u80FD\u7528\u54EA\u4E9B\u5DE5\u5177\u3002",
  "\u8DDF\u5DE5\u4F5C\u533A\u4E00\u6837\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\uFF1A\u6539\u5B8C\u60F3\u8BA9\u67D0\u4E2A\u804A\u5929\u7528\u4E0A\uFF0C\u5728\u90A3\u4E2A\u804A\u5929\u91CC\u70B9\u300C\u65B0\u4F1A\u8BDD\u300D\u3002": "\u8DDF\u5DE5\u4F5C\u533A\u4E00\u6837\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\uFF1A\u6539\u5B8C\u60F3\u8BA9\u67D0\u4E2A\u804A\u5929\u7528\u4E0A\uFF0C\u5728\u90A3\u4E2A\u804A\u5929\u91CC\u70B9\u300C\u65B0\u4F1A\u8BDD\u300D\u3002",
  "\u8FD8\u6CA1\u6709\u4F1A\u8BDD\u65F6\u7528\u5B83\u5EFA\u4F1A\u8BDD\u3002": "\u8FD8\u6CA1\u6709\u4F1A\u8BDD\u65F6\u7528\u5B83\u5EFA\u4F1A\u8BDD\u3002",
  "\u9009\u5B8C\u5BF9\u300C\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u300D\u751F\u6548\uFF0C\u5DF2\u7ECF\u5EFA\u597D\u7684\u4F1A\u8BDD\u4E0D\u53D8\u3002": "\u9009\u5B8C\u5BF9\u300C\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u300D\u751F\u6548\uFF0C\u5DF2\u7ECF\u5EFA\u597D\u7684\u4F1A\u8BDD\u4E0D\u53D8\u3002",
  "\u4F1A\u8BDD\u5EFA\u597D\u4E4B\u540E\u8FD8\u80FD\u5355\u72EC\u6539\uFF1A\u5728\u804A\u5929\u91CC\u53D1 /menu\uFF0C\u6216\u7528 /model\u3002": "\u4F1A\u8BDD\u5EFA\u597D\u4E4B\u540E\u8FD8\u80FD\u5355\u72EC\u6539\uFF1A\u5728\u804A\u5929\u91CC\u53D1 /menu\uFF0C\u6216\u7528 /model\u3002",
  "\u63A8\u7406\u7B49\u7EA7\u662F\u6A21\u578B\u81EA\u5DF1\u7684\u80FD\u529B\uFF0C\u6362\u6A21\u578B\u4F1A\u91CD\u7F6E\u3002": "\u63A8\u7406\u7B49\u7EA7\u662F\u6A21\u578B\u81EA\u5DF1\u7684\u80FD\u529B\uFF0C\u6362\u6A21\u578B\u4F1A\u91CD\u7F6E\u3002",
  "\u8C01\u80FD\u8DDF\u673A\u5668\u4EBA\u8BF4\u8BDD\u3001\u8C01\u80FD\u6267\u884C\u547D\u4EE4\u3002\u6539\u52A8\u7ACB\u5373\u751F\u6548\u3002": "\u8C01\u80FD\u8DDF\u673A\u5668\u4EBA\u8BF4\u8BDD\u3001\u8C01\u80FD\u6267\u884C\u547D\u4EE4\u3002\u6539\u52A8\u7ACB\u5373\u751F\u6548\u3002",
  "\u5C5E\u4E3B\u59CB\u7EC8\u53EF\u7528\uFF0C\u4E0D\u9700\u8981\u8FDB\u540D\u5355\u2014\u2014\u5C5E\u4E3B\u5728\u300C\u6743\u9650\u4E0E\u8EAB\u4EFD\u300D\u90A3\u4E00\u7EC4\u91CC\u5355\u72EC\u8BBE\u7F6E\u3002": "\u5C5E\u4E3B\u59CB\u7EC8\u53EF\u7528\uFF0C\u4E0D\u9700\u8981\u8FDB\u540D\u5355\u2014\u2014\u5C5E\u4E3B\u5728\u300C\u6743\u9650\u4E0E\u8EAB\u4EFD\u300D\u90A3\u4E00\u7EC4\u91CC\u5355\u72EC\u8BBE\u7F6E\u3002",
  "\u300C\u4EC5\u540D\u5355\u5185\u53EF\u7528\u300D+ \u7A7A\u540D\u5355 = \u53EA\u6709\u5C5E\u4E3B\u80FD\u8BF4\u8BDD\u3002\u60F3\u7ED9\u67D0\u4E2A\u4EBA\u5F00\u95E8\uFF0C\u628A\u4ED6\u7684\u5E73\u53F0 id \u52A0\u8FDB\u540D\u5355\u3002": "\u300C\u4EC5\u540D\u5355\u5185\u53EF\u7528\u300D+ \u7A7A\u540D\u5355 = \u53EA\u6709\u5C5E\u4E3B\u80FD\u8BF4\u8BDD\u3002\u60F3\u7ED9\u67D0\u4E2A\u4EBA\u5F00\u95E8\uFF0C\u628A\u4ED6\u7684\u5E73\u53F0 id \u52A0\u8FDB\u540D\u5355\u3002",
  "\u300C\u4EFB\u4F55\u4EBA\u53EF\u7528\u300D\u8868\u793A\u8FD9\u4E2A\u573A\u5408\u91CC\u8C01\u90FD\u8FDB\u5F97\u6765\uFF1B\u7FA4\u804A\u4E0B\u4EFB\u4F55\u6210\u5458 @ \u5B83\u5C31\u884C\u3002": "\u300C\u4EFB\u4F55\u4EBA\u53EF\u7528\u300D\u8868\u793A\u8FD9\u4E2A\u573A\u5408\u91CC\u8C01\u90FD\u8FDB\u5F97\u6765\uFF1B\u7FA4\u804A\u4E0B\u4EFB\u4F55\u6210\u5458 @ \u5B83\u5C31\u884C\u3002",
  "\u540D\u5355\u91CC\u7684\u4EBA\u53EF\u4EE5\u989D\u5916\u52FE\u300C\u53EF\u6267\u884C\u547D\u4EE4\u300D\uFF1B\u4E0D\u52FE\u5C31\u53EA\u80FD\u5BF9\u8BDD\uFF0C\u4E0D\u80FD\u8DD1 / \u5F00\u5934\u7684\u547D\u4EE4\u3002": "\u540D\u5355\u91CC\u7684\u4EBA\u53EF\u4EE5\u989D\u5916\u52FE\u300C\u53EF\u6267\u884C\u547D\u4EE4\u300D\uFF1B\u4E0D\u52FE\u5C31\u53EA\u80FD\u5BF9\u8BDD\uFF0C\u4E0D\u80FD\u8DD1 / \u5F00\u5934\u7684\u547D\u4EE4\u3002",
  '\u8FD9\u4E2A\u4E0B\u62C9\u63A7\u5236\u7684\u662F"\u6267\u884C\u8FC7\u7A0B\u600E\u4E48\u5C55\u793A"\u2014\u2014\u4E0D\u5F71\u54CD\u7B54\u6848\u672C\u8EAB\uFF0C\u4E5F\u4E0D\u5F71\u54CD\u547D\u4EE4\u4E0E\u6743\u9650\u3002': '\u8FD9\u4E2A\u4E0B\u62C9\u63A7\u5236\u7684\u662F"\u6267\u884C\u8FC7\u7A0B\u600E\u4E48\u5C55\u793A"\u2014\u2014\u4E0D\u5F71\u54CD\u7B54\u6848\u672C\u8EAB\uFF0C\u4E5F\u4E0D\u5F71\u54CD\u547D\u4EE4\u4E0E\u6743\u9650\u3002',
  "\u8FD9\u53F0\u673A\u5668\u4EBA\u8C03 lark-cli \u65F6\u80FD\u7528\u54EA\u4E9B\u8EAB\u4EFD\u3002": "\u8FD9\u53F0\u673A\u5668\u4EBA\u8C03 lark-cli \u65F6\u80FD\u7528\u54EA\u4E9B\u8EAB\u4EFD\u3002",
  "\u5C31\u8FD1\u8986\u76D6\uFF1A\u6307\u5B9A\u7FA4/\u4EBA \u2192 \u7FA4\u804A/\u79C1\u804A \u2192 \u5168\u5C40\u3002\u9009\u4E86\u300C\u7EE7\u627F\u4E0A\u4E00\u5C42\u300D\u7684\u90A3\u4E00\u5C42\u4E0D\u5355\u72EC\u8BBE\u7F6E\uFF0C\u542C\u4E0A\u5C42\u7684\u3002": "\u5C31\u8FD1\u8986\u76D6\uFF1A\u6307\u5B9A\u7FA4/\u4EBA \u2192 \u7FA4\u804A/\u79C1\u804A \u2192 \u5168\u5C40\u3002\u9009\u4E86\u300C\u7EE7\u627F\u4E0A\u4E00\u5C42\u300D\u7684\u90A3\u4E00\u5C42\u4E0D\u5355\u72EC\u8BBE\u7F6E\uFF0C\u542C\u4E0A\u5C42\u7684\u3002",
  "\u4E24\u4E2A\u8EAB\u4EFD\u53EF\u4EE5\u540C\u65F6\u5141\u8BB8\uFF0C\u4E5F\u53EF\u4EE5\u90FD\u4E0D\u5141\u8BB8\u3002": "\u4E24\u4E2A\u8EAB\u4EFD\u53EF\u4EE5\u540C\u65F6\u5141\u8BB8\uFF0C\u4E5F\u53EF\u4EE5\u90FD\u4E0D\u5141\u8BB8\u3002",
  "\u5141\u8BB8\u7528\u6237\u8EAB\u4EFD\u53EA\u662F\u300C\u5141\u8BB8\u4EE5\u7528\u6237\u8EAB\u4EFD\u8C03\u7528\u300D\uFF0C\u5B9E\u9645\u7528\u7684\u4ECD\u662F\u4E0B\u9762\u300C\u767B\u5F55\u4EBA\u300D\u90A3\u4E00\u4E2A\u2014\u2014lark-cli \u4E00\u4EFD profile \u53EA\u6709\u4E00\u4E2A\u767B\u5F55\u4EBA\uFF0C\u4E0D\u4F1A\u6309\u53D1\u8A00\u4EBA\u81EA\u52A8\u5207\u6362\u3002": "\u5141\u8BB8\u7528\u6237\u8EAB\u4EFD\u53EA\u662F\u300C\u5141\u8BB8\u4EE5\u7528\u6237\u8EAB\u4EFD\u8C03\u7528\u300D\uFF0C\u5B9E\u9645\u7528\u7684\u4ECD\u662F\u4E0B\u9762\u300C\u767B\u5F55\u4EBA\u300D\u90A3\u4E00\u4E2A\u2014\u2014lark-cli \u4E00\u4EFD profile \u53EA\u6709\u4E00\u4E2A\u767B\u5F55\u4EBA\uFF0C\u4E0D\u4F1A\u6309\u53D1\u8A00\u4EBA\u81EA\u52A8\u5207\u6362\u3002",
  "\u98DE\u4E66\u6E20\u9053\u81EA\u5DF1\u7684\u6536\u53D1\u6D88\u606F\u59CB\u7EC8\u8D70\u5B98\u65B9 SDK\uFF0C\u4E0E\u8FD9\u91CC\u7684\u8EAB\u4EFD\u65E0\u5173\u3002": "\u98DE\u4E66\u6E20\u9053\u81EA\u5DF1\u7684\u6536\u53D1\u6D88\u606F\u59CB\u7EC8\u8D70\u5B98\u65B9 SDK\uFF0C\u4E0E\u8FD9\u91CC\u7684\u8EAB\u4EFD\u65E0\u5173\u3002",
  "\u8FD9\u4E00\u9879\u76EE\u524D\u53EA\u6709\u79C1\u804A/\u7FA4\u804A\u4E24\u4EFD\uFF08\u6CA1\u6709\u5168\u5C40\u5C42\uFF09\uFF1B\u4E0B\u9762\u663E\u793A\u7684\u662F\u79C1\u804A\u90A3\u4E00\u4EFD\u3002": "\u8FD9\u4E00\u9879\u76EE\u524D\u53EA\u6709\u79C1\u804A/\u7FA4\u804A\u4E24\u4EFD\uFF08\u6CA1\u6709\u5168\u5C40\u5C42\uFF09\uFF1B\u4E0B\u9762\u663E\u793A\u7684\u662F\u79C1\u804A\u90A3\u4E00\u4EFD\u3002",
  "\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548": "\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548",
  "\u65B0\u4F1A\u8BDD\u7528\u5B83": "\u65B0\u4F1A\u8BDD\u7528\u5B83",
  "\u6539\u5B8C\u4F1A\u91CD\u8FDE\u4E00\u6B21": "\u6539\u5B8C\u4F1A\u91CD\u8FDE\u4E00\u6B21",
  "\u6539\u52A8\u7ACB\u5373\u751F\u6548": "\u6539\u52A8\u7ACB\u5373\u751F\u6548",
  "\u53EA\u5F71\u54CD /menu \u90A3\u5F20\u5361\u7247": "\u53EA\u5F71\u54CD /menu \u90A3\u5F20\u5361\u7247",
  "\u9009\u62E9\u7528\u8FC7\u7684\u76EE\u5F55": "\u9009\u62E9\u7528\u8FC7\u7684\u76EE\u5F55",
  "\u5C5E\u4E3B\u4E0D\u9700\u8981\u8FDB\u767D\u540D\u5355\uFF1A\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\uFF0C\u4E5F\u4E0D\u770B\u8BBF\u95EE\u7B56\u7565\u3002": "\u5C5E\u4E3B\u4E0D\u9700\u8981\u8FDB\u767D\u540D\u5355\uFF1A\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\uFF0C\u4E5F\u4E0D\u770B\u8BBF\u95EE\u7B56\u7565\u3002",
  '\u4ECE"\u5B83\u804A\u8FC7\u7684\u4F1A\u8BDD"\u91CC\u6311\u4E00\u4E2A\u4EBA\u8BBE\u4E3A\u5C5E\u4E3B\uFF1B\u6E05\u7A7A\u540E\u6CA1\u6709\u4EFB\u4F55\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565\u3002': '\u4ECE"\u5B83\u804A\u8FC7\u7684\u4F1A\u8BDD"\u91CC\u6311\u4E00\u4E2A\u4EBA\u8BBE\u4E3A\u5C5E\u4E3B\uFF1B\u6E05\u7A7A\u540E\u6CA1\u6709\u4EFB\u4F55\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565\u3002',
  "\u300C\u4EC5\u540D\u5355\u5185\u53EF\u7528\u300D+ \u7A7A\u540D\u5355\u65F6\u53EA\u6709\u5C5E\u4E3B\u80FD\u8BF4\u8BDD\u3002": "\u300C\u4EC5\u540D\u5355\u5185\u53EF\u7528\u300D+ \u7A7A\u540D\u5355\u65F6\u53EA\u6709\u5C5E\u4E3B\u80FD\u8BF4\u8BDD\u3002",
  "\u5173\u6389\u7684\u9879\u4E0D\u663E\u793A\u5728\u5361\u7247\u4E0A\uFF0C\u4F46\u529F\u80FD\u7167\u65E7\uFF08\u7B56\u7565\u3001\u4E0A\u4E0B\u6587\u589E\u5F3A\u90FD\u8FD8\u5728\u751F\u6548\uFF09\u3002": "\u5173\u6389\u7684\u9879\u4E0D\u663E\u793A\u5728\u5361\u7247\u4E0A\uFF0C\u4F46\u529F\u80FD\u7167\u65E7\uFF08\u7B56\u7565\u3001\u4E0A\u4E0B\u6587\u589E\u5F3A\u90FD\u8FD8\u5728\u751F\u6548\uFF09\u3002",
  "\u4E0B\u62C9\u91CC\u662F\u8FD9\u53F0\u673A\u5668\u4EBA\u7528\u8FC7\u7684\u76EE\u5F55\uFF0C\u4E5F\u53EF\u4EE5\u76F4\u63A5\u624B\u6253\u4EFB\u610F\u8DEF\u5F84\u3002": "\u4E0B\u62C9\u91CC\u662F\u8FD9\u53F0\u673A\u5668\u4EBA\u7528\u8FC7\u7684\u76EE\u5F55\uFF0C\u4E5F\u53EF\u4EE5\u76F4\u63A5\u624B\u6253\u4EFB\u610F\u8DEF\u5F84\u3002",
  "\u8FD8\u6CA1\u6709\u6307\u5B9A\u8BBE\u7F6E": "\u8FD8\u6CA1\u6709\u6307\u5B9A\u8BBE\u7F6E",
  "\u5F71\u54CD\u8FC7\u7A0B\u600E\u4E48\u663E\u793A\uFF0C\u4E0D\u5F71\u54CD\u7B54\u6848": "\u5F71\u54CD\u8FC7\u7A0B\u600E\u4E48\u663E\u793A\uFF0C\u4E0D\u5F71\u54CD\u7B54\u6848",
  "\u4E0B\u4E00\u6761\u6D88\u606F\u751F\u6548": "\u4E0B\u4E00\u6761\u6D88\u606F\u751F\u6548",
  "\u5F00\u7740\u65F6\uFF0C\u56DE\u590D\u4F1A\u6309\u98DE\u4E66\u5361\u7247\u7684\u80FD\u529B\u7EC4\u7EC7\uFF08\u8868\u683C\u3001\u5206\u8282\u3001\u4EE3\u7801\u5757\u66F4\u6E05\u695A\uFF09\u3002": "\u5F00\u7740\u65F6\uFF0C\u56DE\u590D\u4F1A\u6309\u98DE\u4E66\u5361\u7247\u7684\u80FD\u529B\u7EC4\u7EC7\uFF08\u8868\u683C\u3001\u5206\u8282\u3001\u4EE3\u7801\u5757\u66F4\u6E05\u695A\uFF09\u3002",
  "\u5173\u6389\u5219\u6309\u666E\u901A\u6587\u672C\u4E60\u60EF\u56DE\u7B54\u2014\u2014\u63D2\u4EF6\u4E0D\u6539\u5199\u7B54\u6848\u5185\u5BB9\uFF0C\u600E\u4E48\u5199\u7531\u6A21\u578B\u81EA\u5DF1\u51B3\u5B9A\u3002": "\u5173\u6389\u5219\u6309\u666E\u901A\u6587\u672C\u4E60\u60EF\u56DE\u7B54\u2014\u2014\u63D2\u4EF6\u4E0D\u6539\u5199\u7B54\u6848\u5185\u5BB9\uFF0C\u600E\u4E48\u5199\u7531\u6A21\u578B\u81EA\u5DF1\u51B3\u5B9A\u3002",
  '\u5199\u4E00\u53E5"\u600E\u4E48\u7406\u89E3\u6765\u6E90"\u7684\u8BF4\u660E\uFF0C\u53EF\u70B9\u300C\u586B\u5165\u793A\u4F8B\u300D\u770B\u6A21\u677F': '\u5199\u4E00\u53E5"\u600E\u4E48\u7406\u89E3\u6765\u6E90"\u7684\u8BF4\u660E\uFF0C\u53EF\u70B9\u300C\u586B\u5165\u793A\u4F8B\u300D\u770B\u6A21\u677F',
  "\u542F\u7528\u589E\u5F3A": "\u542F\u7528\u589E\u5F3A",
  "\u544A\u8BC9\u673A\u5668\u4EBA\uFF1A\u8FD9\u6761\u6D88\u606F\u4ECE\u54EA\u6765\u3001\u4EE5\u53CA\u8BE5\u600E\u4E48\u7528\u5B83\u2014\u2014\u6BD4\u5982\u8BA9\u5B83\u5728\u56DE\u7B54\u91CC\u5E26\u4E0A\u53D1\u8A00\u4EBA\u662F\u8C01\u3001\u5728\u54EA\u4E2A\u7FA4\u8BF4\u7684\u3002": "\u544A\u8BC9\u673A\u5668\u4EBA\uFF1A\u8FD9\u6761\u6D88\u606F\u4ECE\u54EA\u6765\u3001\u4EE5\u53CA\u8BE5\u600E\u4E48\u7528\u5B83\u2014\u2014\u6BD4\u5982\u8BA9\u5B83\u5728\u56DE\u7B54\u91CC\u5E26\u4E0A\u53D1\u8A00\u4EBA\u662F\u8C01\u3001\u5728\u54EA\u4E2A\u7FA4\u8BF4\u7684\u3002",
  "profile \u5DF2\u5C31\u7EEA": "profile \u5DF2\u5C31\u7EEA",
  "profile \u5C1A\u672A\u521B\u5EFA": "profile \u5C1A\u672A\u521B\u5EFA",
  "\u5E94\u7528\u8EAB\u4EFD": "\u5E94\u7528\u8EAB\u4EFD",
  "\u767B\u5F55\u4EBA": "\u767B\u5F55\u4EBA",
  "\u628A\u7ED3\u679C\u53D1\u5230\u6307\u5B9A\u4F1A\u8BDD": "\u628A\u7ED3\u679C\u53D1\u5230\u6307\u5B9A\u4F1A\u8BDD",
  "\u5E2E\u52A9": "\u5E2E\u52A9",
  "\u5C5E\u4E3B\u4E0D\u9700\u8981\u8FDB\u540D\u5355\uFF1A\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\u3002": "\u5C5E\u4E3B\u4E0D\u9700\u8981\u8FDB\u540D\u5355\uFF1A\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\u3002",
  "\u5C5E\u4E3B\u662F\u626B\u7801\u7ED1\u5B9A\u8FD9\u4E2A\u8D26\u53F7\u7684\u4EBA\uFF08\u5FAE\u4FE1\u767B\u5F55\u4EBA\uFF09\uFF0C\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\u3002": "\u5C5E\u4E3B\u662F\u626B\u7801\u7ED1\u5B9A\u8FD9\u4E2A\u8D26\u53F7\u7684\u4EBA\uFF08\u5FAE\u4FE1\u767B\u5F55\u4EBA\uFF09\uFF0C\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\u3002",
  "\u300C\u4EFB\u4F55\u4EBA\u53EF\u7528\u300D\u8868\u793A\u8FD9\u4E2A\u573A\u5408\u91CC\u8C01\u90FD\u8FDB\u5F97\u6765\u3002": "\u300C\u4EFB\u4F55\u4EBA\u53EF\u7528\u300D\u8868\u793A\u8FD9\u4E2A\u573A\u5408\u91CC\u8C01\u90FD\u8FDB\u5F97\u6765\u3002",
  "\u544A\u8BC9\u673A\u5668\u4EBA\uFF1A\u8FD9\u6761\u6D88\u606F\u4ECE\u54EA\u6765\u3001\u4EE5\u53CA\u8BE5\u600E\u4E48\u7528\u5B83\u2014\u2014\u6BD4\u5982\u8BA9\u5B83\u5728\u56DE\u7B54\u91CC\u5E26\u4E0A\u53D1\u8A00\u4EBA\u662F\u8C01\u3002": "\u544A\u8BC9\u673A\u5668\u4EBA\uFF1A\u8FD9\u6761\u6D88\u606F\u4ECE\u54EA\u6765\u3001\u4EE5\u53CA\u8BE5\u600E\u4E48\u7528\u5B83\u2014\u2014\u6BD4\u5982\u8BA9\u5B83\u5728\u56DE\u7B54\u91CC\u5E26\u4E0A\u53D1\u8A00\u4EBA\u662F\u8C01\u3002",
  "\u8FD8\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5148\u548C\u673A\u5668\u4EBA\u79C1\u804A\u4E00\u6B21\uFF0C\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF0C\u4FDD\u5B58\u540E\u5373\u53EF\u4E3B\u52A8\u6295\u9012\u3002": "\u8FD8\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5148\u548C\u673A\u5668\u4EBA\u79C1\u804A\u4E00\u6B21\uFF0C\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF0C\u4FDD\u5B58\u540E\u5373\u53EF\u4E3B\u52A8\u6295\u9012\u3002",
  "\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5148\u548C\u673A\u5668\u4EBA\u79C1\u804A\u4E00\u6B21\uFF0C\u8BE5\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002": "\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5148\u548C\u673A\u5668\u4EBA\u79C1\u804A\u4E00\u6B21\uFF0C\u8BE5\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002",
  "\u79C1\u804A": "\u79C1\u804A",
  "\u7FA4\u804A": "\u7FA4\u804A",
  "\u5019\u9009": "\u5019\u9009",
  "\u4FDD\u5B58\u4E3A\u6295\u9012\u76EE\u6807": "\u4FDD\u5B58\u4E3A\u6295\u9012\u76EE\u6807",
  "\u91CD\u547D\u540D": "\u91CD\u547D\u540D",
  "\u81EA\u5B9A\u4E49\u540D\u79F0": "\u81EA\u5B9A\u4E49\u540D\u79F0",
  "\u7559\u7A7A\u5219\u7528\u81EA\u52A8\u8BC6\u522B\u7684\u540D\u5B57": "\u7559\u7A7A\u5219\u7528\u81EA\u52A8\u8BC6\u522B\u7684\u540D\u5B57",
  "\u5DF2\u6539\u540D\u3002": "\u5DF2\u6539\u540D\u3002",
  "\u5DF2\u6062\u590D\u81EA\u52A8\u540D\u5B57\u3002": "\u5DF2\u6062\u590D\u81EA\u52A8\u540D\u5B57\u3002",
  "\u5220\u9664": "\u5220\u9664",
  "\u786E\u8BA4\u5220\u9664": "\u786E\u8BA4\u5220\u9664",
  "\u5F53\u524D\u6E20\u9053\u4E0D\u652F\u6301\u4E3B\u52A8\u6295\u9012\u3002": "\u5F53\u524D\u6E20\u9053\u4E0D\u652F\u6301\u4E3B\u52A8\u6295\u9012\u3002",
  "\u5DF2\u4FDD\u5B58\uFF0C\u73B0\u5728\u53EF\u4EE5\u4E3B\u52A8\u53D1\u6D88\u606F\u4E86\u3002": "\u5DF2\u4FDD\u5B58\uFF0C\u73B0\u5728\u53EF\u4EE5\u4E3B\u52A8\u53D1\u6D88\u606F\u4E86\u3002",
  "\u5DF2\u5220\u9664\u3002": "\u5DF2\u5220\u9664\u3002",
  "\u8FD8\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5728\u7FA4\u91CC @ \u4E00\u6B21\u673A\u5668\u4EBA\uFF0C\u6216\u4E0E\u5B83\u79C1\u804A\u4E00\u6B21\uFF0C\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF0C\u4FDD\u5B58\u540E\u5373\u53EF\u4E3B\u52A8\u6295\u9012\u3002": "\u8FD8\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5728\u7FA4\u91CC @ \u4E00\u6B21\u673A\u5668\u4EBA\uFF0C\u6216\u4E0E\u5B83\u79C1\u804A\u4E00\u6B21\uFF0C\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF0C\u4FDD\u5B58\u540E\u5373\u53EF\u4E3B\u52A8\u6295\u9012\u3002",
  "\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5728\u7FA4\u91CC @ \u4E00\u6B21\u673A\u5668\u4EBA\uFF0C\u6216\u4E0E\u5B83\u79C1\u804A\u4E00\u6B21\uFF0C\u8BE5\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002": "\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5728\u7FA4\u91CC @ \u4E00\u6B21\u673A\u5668\u4EBA\uFF0C\u6216\u4E0E\u5B83\u79C1\u804A\u4E00\u6B21\uFF0C\u8BE5\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002",
  "\u4E0A\u9762\u6807\u300C\u5019\u9009\u300D\u7684\u4F1A\u8BDD\u8FD8\u4E0D\u80FD\u4E3B\u52A8\u6295\u9012\uFF0C\u70B9\u300C\u4FDD\u5B58\u4E3A\u6295\u9012\u76EE\u6807\u300D\u540E\u624D\u884C\u3002": "\u4E0A\u9762\u6807\u300C\u5019\u9009\u300D\u7684\u4F1A\u8BDD\u8FD8\u4E0D\u80FD\u4E3B\u52A8\u6295\u9012\uFF0C\u70B9\u300C\u4FDD\u5B58\u4E3A\u6295\u9012\u76EE\u6807\u300D\u540E\u624D\u884C\u3002",
  "\u5DF2\u4FDD\u5B58": "\u5DF2\u4FDD\u5B58",
  "\u53EF\u6DFB\u52A0\u7684\u5019\u9009": "\u53EF\u6DFB\u52A0\u7684\u5019\u9009",
  "\u5C55\u5F00\u5168\u90E8": "\u5C55\u5F00\u5168\u90E8",
  "\u6536\u8D77": "\u6536\u8D77",
  "\u6309\u540D\u5B57\u6216 id \u8FC7\u6EE4": "\u6309\u540D\u5B57\u6216 id \u8FC7\u6EE4",
  "\u6CA1\u6709\u5339\u914D\u7684\u76EE\u6807\u3002": "\u6CA1\u6709\u5339\u914D\u7684\u76EE\u6807\u3002",
  "\u586B\u5165\u793A\u4F8B": "\u586B\u5165\u793A\u4F8B",
  "\u6E05\u7A7A": "\u6E05\u7A7A",
  "\u6765\u6E90\u5B57\u6BB5": "\u6765\u6E90\u5B57\u6BB5",
  "\u542F\u7528": "\u542F\u7528",
  "\u5907\u6CE8\u540D\uFF08\u53EF\u9009\uFF09": "\u5907\u6CE8\u540D\uFF08\u53EF\u9009\uFF09",
  "\u5F20\u4E09": "\u5F20\u4E09",
  "\u65B0\u589E": "\u65B0\u589E",
  "\u8FD8\u6CA1\u6709\u6307\u5B9A\u8BBE\u7F6E\u3002": "\u8FD8\u6CA1\u6709\u6307\u5B9A\u8BBE\u7F6E\u3002",
  "\u5173\u95ED": "\u5173\u95ED",
  "\u589E\u5F3A\u63D0\u793A\u8BCD": "\u589E\u5F3A\u63D0\u793A\u8BCD",
  "\u544A\u8BC9\u6A21\u578B\u5982\u4F55\u4F7F\u7528\u6765\u6E90\u5B57\u6BB5\u3002\u53EA\u586B\u6B63\u6587\uFF0C\u63D2\u4EF6\u4F1A\u81EA\u52A8\u5305\u6210\u6765\u6E90\u589E\u5F3A\u5757\u3002": "\u544A\u8BC9\u6A21\u578B\u5982\u4F55\u4F7F\u7528\u6765\u6E90\u5B57\u6BB5\u3002\u53EA\u586B\u6B63\u6587\uFF0C\u63D2\u4EF6\u4F1A\u81EA\u52A8\u5305\u6210\u6765\u6E90\u589E\u5F3A\u5757\u3002",
  "\u53E0\u52A0\u5168\u5C40\u63D0\u793A\u8BCD\uFF08\u4E0D\u52FE\u9009\u5219\u53EA\u4F7F\u7528\u4E0A\u9762\u7684\u4E13\u5C5E\u63D0\u793A\u8BCD\uFF09": "\u53E0\u52A0\u5168\u5C40\u63D0\u793A\u8BCD\uFF08\u4E0D\u52FE\u9009\u5219\u53EA\u4F7F\u7528\u4E0A\u9762\u7684\u4E13\u5C5E\u63D0\u793A\u8BCD\uFF09",
  "\u672A\u5F00\u542F": "\u672A\u5F00\u542F",
  "\u6765\u6E90\u5B57\u6BB5\u53EA\u5728\u5F53\u524D\u6D88\u606F\u5DF2\u63D0\u4F9B\u65F6\u624D\u4F1A\u53D1\u9001\uFF0C\u4E0D\u4F1A\u989D\u5916\u67E5\u8BE2\u5E73\u53F0\u63A5\u53E3\u3002": "\u6765\u6E90\u5B57\u6BB5\u53EA\u5728\u5F53\u524D\u6D88\u606F\u5DF2\u63D0\u4F9B\u65F6\u624D\u4F1A\u53D1\u9001\uFF0C\u4E0D\u4F1A\u989D\u5916\u67E5\u8BE2\u5E73\u53F0\u63A5\u53E3\u3002",
  "\u4E0A\u4E0B\u6587\u589E\u5F3A\u8303\u56F4": "\u4E0A\u4E0B\u6587\u589E\u5F3A\u8303\u56F4",
  "\u5DF2\u5F00\u542F": "\u5DF2\u5F00\u542F",
  "\u4ECE\u4F1A\u8BDD\u91CC\u9009\u2026": "\u4ECE\u4F1A\u8BDD\u91CC\u9009\u2026",
  "\u5C5E\u4E3B": "\u5C5E\u4E3B",
  "\u5C5E\u4E3B\u4E0D\u9700\u8981\u8FDB\u767D\u540D\u5355\uFF1A\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\u3002\u8FD9\u91CC\u6539\u5B8C\u4F1A\u91CD\u8FDE\u4E00\u6B21\uFF0C\u7ACB\u523B\u751F\u6548\u3002": "\u5C5E\u4E3B\u4E0D\u9700\u8981\u8FDB\u767D\u540D\u5355\uFF1A\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\u3002\u8FD9\u91CC\u6539\u5B8C\u4F1A\u91CD\u8FDE\u4E00\u6B21\uFF0C\u7ACB\u523B\u751F\u6548\u3002",
  "\u5F53\u524D\u6CA1\u6709\u5C5E\u4E3B\uFF1A\u6CA1\u6709\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565\uFF0C\u8C01\u80FD\u7528\u5B8C\u5168\u7531\u4E0B\u9762\u7684\u300C\u8BBF\u95EE\u7B56\u7565\u300D\u51B3\u5B9A\u3002": "\u5F53\u524D\u6CA1\u6709\u5C5E\u4E3B\uFF1A\u6CA1\u6709\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565\uFF0C\u8C01\u80FD\u7528\u5B8C\u5168\u7531\u4E0B\u9762\u7684\u300C\u8BBF\u95EE\u7B56\u7565\u300D\u51B3\u5B9A\u3002",
  "\u4ECE\u4F1A\u8BDD\u91CC\u9009\u4E00\u4E2A\u4EBA\u8BBE\u4E3A\u5C5E\u4E3B": "\u4ECE\u4F1A\u8BDD\u91CC\u9009\u4E00\u4E2A\u4EBA\u8BBE\u4E3A\u5C5E\u4E3B",
  "\u8BBE\u4E3A\u5C5E\u4E3B": "\u8BBE\u4E3A\u5C5E\u4E3B",
  "\u6CA1\u6709\u53EF\u9009\u7684\u4F1A\u8BDD\uFF08\u5148\u548C\u673A\u5668\u4EBA\u804A\u4E00\u6B21\uFF09": "\u6CA1\u6709\u53EF\u9009\u7684\u4F1A\u8BDD\uFF08\u5148\u548C\u673A\u5668\u4EBA\u804A\u4E00\u6B21\uFF09",
  "\u6E05\u7A7A\uFF08\u65E0\u5C5E\u4E3B\uFF09": "\u6E05\u7A7A\uFF08\u65E0\u5C5E\u4E3B\uFF09",
  "\u6E05\u7A7A\u540E\u6CA1\u6709\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565": "\u6E05\u7A7A\u540E\u6CA1\u6709\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565",
  // 机器人设置页的共享编辑块（bot-shared-settings.js）
  "\u5DE5\u4F5C\u533A": "\u5DE5\u4F5C\u533A",
  "\u673A\u5668\u4EBA\u8DD1\u5728\u54EA\u4E2A\u76EE\u5F55\uFF1A\u80FD\u8BFB\u5199\u54EA\u4E9B\u6587\u4EF6\u3001\u7528\u54EA\u4EFD AGENTS.md\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002": "\u673A\u5668\u4EBA\u8DD1\u5728\u54EA\u4E2A\u76EE\u5F55\uFF1A\u80FD\u8BFB\u5199\u54EA\u4E9B\u6587\u4EF6\u3001\u7528\u54EA\u4EFD AGENTS.md\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002",
  "\u76EE\u5F55": "\u76EE\u5F55",
  "\u4E0B\u62C9\u91CC\u662F\u8FD9\u53F0\u673A\u5668\u4EBA\u7528\u8FC7\u7684\u76EE\u5F55\u3002": "\u4E0B\u62C9\u91CC\u662F\u8FD9\u53F0\u673A\u5668\u4EBA\u7528\u8FC7\u7684\u76EE\u5F55\u3002",
  "Agent \u9884\u8BBE": "Agent \u9884\u8BBE",
  "\u8FD9\u4E2A\u673A\u5668\u4EBA\u7528\u54EA\u5957 Agent \u9884\u8BBE\uFF08\u4EBA\u8BBE\u4E0E\u5DE5\u5177\u96C6\uFF09\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002": "\u8FD9\u4E2A\u673A\u5668\u4EBA\u7528\u54EA\u5957 Agent \u9884\u8BBE\uFF08\u4EBA\u8BBE\u4E0E\u5DE5\u5177\u96C6\uFF09\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002",
  "\u5F53\u524D Host \u8BFB\u4E0D\u5230 Agent Preset \u5217\u8868\u3002": "\u5F53\u524D Host \u8BFB\u4E0D\u5230 Agent Preset \u5217\u8868\u3002",
  "\u8DDF\u968F Host \u9ED8\u8BA4": "\u8DDF\u968F Host \u9ED8\u8BA4",
  "\u8BBF\u95EE\u7B56\u7565": "\u8BBF\u95EE\u7B56\u7565",
  "\u8C01\u80FD\u8DDF\u673A\u5668\u4EBA\u8BF4\u8BDD\u3001\u8C01\u80FD\u6267\u884C\u547D\u4EE4\u3002\u6539\u52A8\u7ACB\u5373\u751F\u6548\uFF1B\u5C5E\u4E3B\u59CB\u7EC8\u53EF\u7528\u3002": "\u8C01\u80FD\u8DDF\u673A\u5668\u4EBA\u8BF4\u8BDD\u3001\u8C01\u80FD\u6267\u884C\u547D\u4EE4\u3002\u6539\u52A8\u7ACB\u5373\u751F\u6548\uFF1B\u5C5E\u4E3B\u59CB\u7EC8\u53EF\u7528\u3002",
  "\u8BBF\u95EE\u6A21\u5F0F": "\u8BBF\u95EE\u6A21\u5F0F",
  "\u4EC5\u540D\u5355\u5185\u53EF\u7528": "\u4EC5\u540D\u5355\u5185\u53EF\u7528",
  "\u4EFB\u4F55\u4EBA\u53EF\u7528": "\u4EFB\u4F55\u4EBA\u53EF\u7528",
  "\u5141\u8BB8\u6267\u884C\u547D\u4EE4": "\u5141\u8BB8\u6267\u884C\u547D\u4EE4",
  "\u53EF\u6267\u884C\u547D\u4EE4": "\u53EF\u6267\u884C\u547D\u4EE4",
  "\u79FB\u9664": "\u79FB\u9664",
  "\u6DFB\u52A0": "\u6DFB\u52A0",
  "\u540D\u5355\u4E3A\u7A7A\u65F6\u53EA\u6709\u5C5E\u4E3B\u53EF\u7528\u3002": "\u540D\u5355\u4E3A\u7A7A\u65F6\u53EA\u6709\u5C5E\u4E3B\u53EF\u7528\u3002",
  "\u5BF9\u65B9\u7684\u5E73\u53F0 id\uFF0C\u56DE\u8F66\u6DFB\u52A0": "\u5BF9\u65B9\u7684\u5E73\u53F0 id\uFF0C\u56DE\u8F66\u6DFB\u52A0",
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
  // 诊断面板（client/diagnostics.js）：出故障时的自助现场。
  "\u8BCA\u65AD": "\u8BCA\u65AD",
  "\u6536\u8D77\u8BCA\u65AD": "\u6536\u8D77\u8BCA\u65AD",
  "\u51FA\u6545\u969C\u65F6\u5148\u770B\u8FD9\u91CC\uFF1A\u8FDE\u63A5\u72B6\u6001\u3001\u6700\u8FD1\u9519\u8BEF\u3001\u65E5\u5FD7\u5C3E\u90E8\u3002": "\u51FA\u6545\u969C\u65F6\u5148\u770B\u8FD9\u91CC\uFF1A\u8FDE\u63A5\u72B6\u6001\u3001\u6700\u8FD1\u9519\u8BEF\u3001\u65E5\u5FD7\u5C3E\u90E8\u3002",
  "\u8FD0\u884C\u4E2D": "\u8FD0\u884C\u4E2D",
  "\u542F\u52A8\u4E2D": "\u542F\u52A8\u4E2D",
  "\u5DF2\u8FDE\u63A5": "\u5DF2\u8FDE\u63A5",
  "\u672A\u8FDE\u63A5": "\u672A\u8FDE\u63A5",
  "\u53BB\u5F00\u901A\u6743\u9650": "\u53BB\u5F00\u901A\u6743\u9650",
  "\u6700\u8FD1\u4E00\u6B21\u9519\u8BEF": "\u6700\u8FD1\u4E00\u6B21\u9519\u8BEF",
  "\u8FD9\u53F0\u6E20\u9053\u4E0B\u8FD8\u6CA1\u6709\u673A\u5668\u4EBA\u3002": "\u8FD9\u53F0\u6E20\u9053\u4E0B\u8FD8\u6CA1\u6709\u673A\u5668\u4EBA\u3002",
  "\u8FD8\u6CA1\u6709\u65E5\u5FD7": "\u8FD8\u6CA1\u6709\u65E5\u5FD7",
  "\u770B\u6700\u540E 40 \u884C": "\u770B\u6700\u540E 40 \u884C",
  "\u7248\u672C\u4E0E\u66F4\u65B0": "\u7248\u672C\u4E0E\u66F4\u65B0",
  "\u6536\u8D77\u7248\u672C\u4E0E\u66F4\u65B0": "\u6536\u8D77\u7248\u672C\u4E0E\u66F4\u65B0",
  "\u5347\u7EA7\u63D2\u4EF6\u540E\u9700\u8981\u91CD\u542F dsh\uFF1B\u53EA\u6539\u8BBE\u7F6E\u9875\u4EE3\u7801\u5219\u5237\u65B0\u9875\u9762\u5373\u53EF\u3002": "\u5347\u7EA7\u63D2\u4EF6\u540E\u9700\u8981\u91CD\u542F dsh\uFF1B\u53EA\u6539\u8BBE\u7F6E\u9875\u4EE3\u7801\u5219\u5237\u65B0\u9875\u9762\u5373\u53EF\u3002",
  "Chat\u673A\u5668\u4EBA\u5185\u6838": "Chat\u673A\u5668\u4EBA\u5185\u6838",
  "\u6E20\u9053\u5951\u7EA6\u7248\u672C": "\u6E20\u9053\u5951\u7EA6\u7248\u672C",
  "\u6570\u636E\u76EE\u5F55": "\u6570\u636E\u76EE\u5F55",
  "\u65E5\u5FD7\u76EE\u5F55": "\u65E5\u5FD7\u76EE\u5F55",
  "\u8BFB\u53D6\u5931\u8D25": "\u8BFB\u53D6\u5931\u8D25",
  "\u66F4\u65B0\u65B9\u5F0F\uFF1A`dsh plugin --profile web add @sidleo3/dsh-chat`\uFF08\u4ECE npm\uFF09\uFF0C\u6216\u4ECE\u4ED3\u5E93\u91CD\u65B0\u6253\u5305\u540E\u8BA9 DSH \u91CD\u65B0\u52A0\u8F7D\u3002": "\u66F4\u65B0\u65B9\u5F0F\uFF1A`dsh plugin --profile web add @sidleo3/dsh-chat`\uFF08\u4ECE npm\uFF09\uFF0C\u6216\u4ECE\u4ED3\u5E93\u91CD\u65B0\u6253\u5305\u540E\u8BA9 DSH \u91CD\u65B0\u52A0\u8F7D\u3002",
  "\u53D1\u4E00\u6761\u6D4B\u8BD5\u6D88\u606F": "\u53D1\u4E00\u6761\u6D4B\u8BD5\u6D88\u606F",
  "\u9009\u62E9\u76EE\u6807": "\u9009\u62E9\u76EE\u6807",
  "\u53D1\u9001": "\u53D1\u9001",
  "\u53D1\u9001\u4E2D\u2026": "\u53D1\u9001\u4E2D\u2026",
  "\u6D4B\u8BD5\u6D88\u606F\u5185\u5BB9": "\u6D4B\u8BD5\u6D88\u606F\u5185\u5BB9"
};
var en = {
  "\u663E\u793A\u9879": "Section",
  "\u63A7\u5236\u9762\u677F\u663E\u793A\u9879": "Control panel sections",
  "\u53EA\u5F71\u54CD /menu \u53D1\u51FA\u6765\u7684\u90A3\u5F20\u5361\u7247\uFF1A\u5173\u6389\u7684\u9879\u4E0D\u663E\u793A\uFF0C\u529F\u80FD\u7167\u65E7\u3002": "Only affects the card sent by /menu: hidden items are not drawn; everything keeps working.",
  "\u6A21\u578B\u4E0E\u63A8\u7406\u7B49\u7EA7": "Model & reasoning",
  "\u4F1A\u8BDD": "Session",
  "Agent \u9884\u8BBE\u4E0E\u5DE5\u4F5C\u533A": "Agent preset & workspace",
  "\u4E0A\u4E0B\u6587\u589E\u5F3A\uFF08\u672C\u4F1A\u8BDD\uFF09": "Context enhancement (this chat)",
  "\u8BBF\u95EE\u7B56\u7565\uFF08\u672C\u4F1A\u8BDD\uFF09": "Access policy (this chat)",
  "\u6E20\u9053\u8BBE\u7F6E\uFF08\u4EFB\u52A1\u8FC7\u7A0B\u5C55\u793A\u7B49\uFF09": "Channel settings (step display etc.)",
  "\u6E20\u9053\u52A8\u4F5C\u6309\u94AE\uFF08\u91CD\u8FDE\u7B49\uFF09": "Channel actions (reconnect etc.)",
  "\u547D\u4EE4\u6309\u94AE\uFF08\u65B0\u4F1A\u8BDD/\u72B6\u6001/\u8BCA\u65AD\u2026\uFF09": "Command buttons (new session/status/diagnostics\u2026)",
  "Chat\u673A\u5668\u4EBA": "Chat bot",
  "\u653E\u5F03\u6539\u52A8": "Discard changes",
  "\u5DF2\u4FDD\u5B58\u3002\u4E0B\u4E00\u6761\u6D88\u606F\u751F\u6548\u3002": "Saved. Applies from the next message.",
  "\u544A\u8BC9\u673A\u5668\u4EBA\uFF1A\u8FD9\u6761\u6D88\u606F\u4ECE\u54EA\u6765\u3001\u4EE5\u53CA\u8BE5\u600E\u4E48\u7528\u5B83\u3002": "Tell the bot where an incoming message came from, and how to use it.",
  "\u67E5\u770B\u5E2E\u52A9": "Show help",
  "\u673A\u5668\u4EBA\u8DD1\u5728\u54EA\u4E2A\u76EE\u5F55\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002": "Which directory the bot runs in. Applies to new conversations only.",
  "\u8FD9\u4E2A\u76EE\u5F55\u51B3\u5B9A\u5B83\u80FD\u8BFB\u5199\u54EA\u4E9B\u6587\u4EF6\u3001\u4EE5\u53CA\u7528\u54EA\u4E00\u4EFD AGENTS.md\u3002": "This directory decides which files it can read and write, and which AGENTS.md applies.",
  "\u5DF2\u7ECF\u5EFA\u597D\u7684\u4F1A\u8BDD\u4E0D\u53D7\u5F71\u54CD\u2014\u2014\u60F3\u6362\u76EE\u5F55\u53C8\u60F3\u8BA9\u65E7\u4F1A\u8BDD\u8DDF\u4E0A\uFF0C\u5C31\u5728\u90A3\u4E2A\u804A\u5929\u91CC\u70B9\u300C\u65B0\u4F1A\u8BDD\u300D\u3002": 'Existing conversations are unaffected. To point one at the new directory, use "New session" in that chat.',
  "\u8FD9\u4E2A\u673A\u5668\u4EBA\u7528\u54EA\u5957 Agent \u9884\u8BBE\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002": "Which agent preset this bot uses. Applies to new conversations only.",
  "\u9884\u8BBE\u51B3\u5B9A\u5B83\u7684\u4EBA\u8BBE\u4E0E\u80FD\u7528\u54EA\u4E9B\u5DE5\u5177\u3002": "The preset decides its persona and which tools it may use.",
  "\u8DDF\u5DE5\u4F5C\u533A\u4E00\u6837\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\uFF1A\u6539\u5B8C\u60F3\u8BA9\u67D0\u4E2A\u804A\u5929\u7528\u4E0A\uFF0C\u5728\u90A3\u4E2A\u804A\u5929\u91CC\u70B9\u300C\u65B0\u4F1A\u8BDD\u300D\u3002": 'Like the workspace, this applies to new conversations only: use "New session" in that chat to pick it up.',
  "\u8FD8\u6CA1\u6709\u4F1A\u8BDD\u65F6\u7528\u5B83\u5EFA\u4F1A\u8BDD\u3002": "Used when a conversation is created before one exists.",
  "\u9009\u5B8C\u5BF9\u300C\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u300D\u751F\u6548\uFF0C\u5DF2\u7ECF\u5EFA\u597D\u7684\u4F1A\u8BDD\u4E0D\u53D8\u3002": "Applies to the conversation created by your next message; existing ones are unchanged.",
  "\u4F1A\u8BDD\u5EFA\u597D\u4E4B\u540E\u8FD8\u80FD\u5355\u72EC\u6539\uFF1A\u5728\u804A\u5929\u91CC\u53D1 /menu\uFF0C\u6216\u7528 /model\u3002": "You can still change it per conversation: send /menu in the chat, or use /model.",
  "\u63A8\u7406\u7B49\u7EA7\u662F\u6A21\u578B\u81EA\u5DF1\u7684\u80FD\u529B\uFF0C\u6362\u6A21\u578B\u4F1A\u91CD\u7F6E\u3002": "Reasoning effort belongs to the model; switching models resets it.",
  "\u8C01\u80FD\u8DDF\u673A\u5668\u4EBA\u8BF4\u8BDD\u3001\u8C01\u80FD\u6267\u884C\u547D\u4EE4\u3002\u6539\u52A8\u7ACB\u5373\u751F\u6548\u3002": "Who may talk to the bot and who may run commands. Applies immediately.",
  "\u5C5E\u4E3B\u59CB\u7EC8\u53EF\u7528\uFF0C\u4E0D\u9700\u8981\u8FDB\u540D\u5355\u2014\u2014\u5C5E\u4E3B\u5728\u300C\u6743\u9650\u4E0E\u8EAB\u4EFD\u300D\u90A3\u4E00\u7EC4\u91CC\u5355\u72EC\u8BBE\u7F6E\u3002": 'The owner always has access and does not need to be on the list \u2014 set the owner in the "Access & identity" group.',
  "\u300C\u4EC5\u540D\u5355\u5185\u53EF\u7528\u300D+ \u7A7A\u540D\u5355 = \u53EA\u6709\u5C5E\u4E3B\u80FD\u8BF4\u8BDD\u3002\u60F3\u7ED9\u67D0\u4E2A\u4EBA\u5F00\u95E8\uFF0C\u628A\u4ED6\u7684\u5E73\u53F0 id \u52A0\u8FDB\u540D\u5355\u3002": '"Allowlist only" with an empty list means only the owner can talk. To let someone in, add their platform id to the list.',
  "\u300C\u4EFB\u4F55\u4EBA\u53EF\u7528\u300D\u8868\u793A\u8FD9\u4E2A\u573A\u5408\u91CC\u8C01\u90FD\u8FDB\u5F97\u6765\uFF1B\u7FA4\u804A\u4E0B\u4EFB\u4F55\u6210\u5458 @ \u5B83\u5C31\u884C\u3002": '"Anyone" means everyone in this scope can get in; in a group, any member can just @ the bot.',
  "\u540D\u5355\u91CC\u7684\u4EBA\u53EF\u4EE5\u989D\u5916\u52FE\u300C\u53EF\u6267\u884C\u547D\u4EE4\u300D\uFF1B\u4E0D\u52FE\u5C31\u53EA\u80FD\u5BF9\u8BDD\uFF0C\u4E0D\u80FD\u8DD1 / \u5F00\u5934\u7684\u547D\u4EE4\u3002": 'People on the list can also be granted "may run commands"; without it they can chat but not run / commands.',
  '\u8FD9\u4E2A\u4E0B\u62C9\u63A7\u5236\u7684\u662F"\u6267\u884C\u8FC7\u7A0B\u600E\u4E48\u5C55\u793A"\u2014\u2014\u4E0D\u5F71\u54CD\u7B54\u6848\u672C\u8EAB\uFF0C\u4E5F\u4E0D\u5F71\u54CD\u547D\u4EE4\u4E0E\u6743\u9650\u3002': "This controls how the execution process is shown \u2014 it does not affect the answer, commands or permissions.",
  "\u8FD9\u53F0\u673A\u5668\u4EBA\u8C03 lark-cli \u65F6\u80FD\u7528\u54EA\u4E9B\u8EAB\u4EFD\u3002": "Which identities this bot may use when calling lark-cli.",
  "\u5C31\u8FD1\u8986\u76D6\uFF1A\u6307\u5B9A\u7FA4/\u4EBA \u2192 \u7FA4\u804A/\u79C1\u804A \u2192 \u5168\u5C40\u3002\u9009\u4E86\u300C\u7EE7\u627F\u4E0A\u4E00\u5C42\u300D\u7684\u90A3\u4E00\u5C42\u4E0D\u5355\u72EC\u8BBE\u7F6E\uFF0C\u542C\u4E0A\u5C42\u7684\u3002": 'Nearest wins: specific chats/people \u2192 group/direct \u2192 global. A layer set to "inherit" is unset and follows the layer above.',
  "\u4E24\u4E2A\u8EAB\u4EFD\u53EF\u4EE5\u540C\u65F6\u5141\u8BB8\uFF0C\u4E5F\u53EF\u4EE5\u90FD\u4E0D\u5141\u8BB8\u3002": "Both identities may be allowed at once, or neither.",
  "\u5141\u8BB8\u7528\u6237\u8EAB\u4EFD\u53EA\u662F\u300C\u5141\u8BB8\u4EE5\u7528\u6237\u8EAB\u4EFD\u8C03\u7528\u300D\uFF0C\u5B9E\u9645\u7528\u7684\u4ECD\u662F\u4E0B\u9762\u300C\u767B\u5F55\u4EBA\u300D\u90A3\u4E00\u4E2A\u2014\u2014lark-cli \u4E00\u4EFD profile \u53EA\u6709\u4E00\u4E2A\u767B\u5F55\u4EBA\uFF0C\u4E0D\u4F1A\u6309\u53D1\u8A00\u4EBA\u81EA\u52A8\u5207\u6362\u3002": "Allowing the user identity only permits calling as a user; the actual user is still the signed-in person below \u2014 one lark-cli profile holds one signed-in user and never switches per sender.",
  "\u98DE\u4E66\u6E20\u9053\u81EA\u5DF1\u7684\u6536\u53D1\u6D88\u606F\u59CB\u7EC8\u8D70\u5B98\u65B9 SDK\uFF0C\u4E0E\u8FD9\u91CC\u7684\u8EAB\u4EFD\u65E0\u5173\u3002": "Sending and receiving messages always goes through the official SDK and is unaffected by these identities.",
  "\u8FD9\u4E00\u9879\u76EE\u524D\u53EA\u6709\u79C1\u804A/\u7FA4\u804A\u4E24\u4EFD\uFF08\u6CA1\u6709\u5168\u5C40\u5C42\uFF09\uFF1B\u4E0B\u9762\u663E\u793A\u7684\u662F\u79C1\u804A\u90A3\u4E00\u4EFD\u3002": "This setting still has two separate scopes (direct/group) with no global layer yet; the one shown below is direct.",
  "\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548": "Applies to new conversations only",
  "\u65B0\u4F1A\u8BDD\u7528\u5B83": "Used for new conversations",
  "\u6539\u5B8C\u4F1A\u91CD\u8FDE\u4E00\u6B21": "Reconnects once after saving",
  "\u6539\u52A8\u7ACB\u5373\u751F\u6548": "Applies immediately",
  "\u53EA\u5F71\u54CD /menu \u90A3\u5F20\u5361\u7247": "Affects only the /menu card",
  "\u9009\u62E9\u7528\u8FC7\u7684\u76EE\u5F55": "Pick a directory used before",
  "\u5C5E\u4E3B\u4E0D\u9700\u8981\u8FDB\u767D\u540D\u5355\uFF1A\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\uFF0C\u4E5F\u4E0D\u770B\u8BBF\u95EE\u7B56\u7565\u3002": "The owner does not need to be on the list: their messages and commands always pass, bypassing the access policy.",
  '\u4ECE"\u5B83\u804A\u8FC7\u7684\u4F1A\u8BDD"\u91CC\u6311\u4E00\u4E2A\u4EBA\u8BBE\u4E3A\u5C5E\u4E3B\uFF1B\u6E05\u7A7A\u540E\u6CA1\u6709\u4EFB\u4F55\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565\u3002': "Pick a person from the conversations this bot has had; clearing the list means nobody bypasses the access policy.",
  "\u300C\u4EC5\u540D\u5355\u5185\u53EF\u7528\u300D+ \u7A7A\u540D\u5355\u65F6\u53EA\u6709\u5C5E\u4E3B\u80FD\u8BF4\u8BDD\u3002": 'With "Allowlist only" and an empty list, only the owner can talk.',
  "\u5173\u6389\u7684\u9879\u4E0D\u663E\u793A\u5728\u5361\u7247\u4E0A\uFF0C\u4F46\u529F\u80FD\u7167\u65E7\uFF08\u7B56\u7565\u3001\u4E0A\u4E0B\u6587\u589E\u5F3A\u90FD\u8FD8\u5728\u751F\u6548\uFF09\u3002": "Hidden items are not drawn on the card, but still work (policy and context enhancement remain active).",
  "\u4E0B\u62C9\u91CC\u662F\u8FD9\u53F0\u673A\u5668\u4EBA\u7528\u8FC7\u7684\u76EE\u5F55\uFF0C\u4E5F\u53EF\u4EE5\u76F4\u63A5\u624B\u6253\u4EFB\u610F\u8DEF\u5F84\u3002": "The list shows directories this bot has used before; you can also type any path.",
  "\u8FD8\u6CA1\u6709\u6307\u5B9A\u8BBE\u7F6E": "Nothing specific configured yet",
  "\u5F71\u54CD\u8FC7\u7A0B\u600E\u4E48\u663E\u793A\uFF0C\u4E0D\u5F71\u54CD\u7B54\u6848": "Changes how the process is shown, not the answer",
  "\u4E0B\u4E00\u6761\u6D88\u606F\u751F\u6548": "Applies from the next message",
  "\u5F00\u7740\u65F6\uFF0C\u56DE\u590D\u4F1A\u6309\u98DE\u4E66\u5361\u7247\u7684\u80FD\u529B\u7EC4\u7EC7\uFF08\u8868\u683C\u3001\u5206\u8282\u3001\u4EE3\u7801\u5757\u66F4\u6E05\u695A\uFF09\u3002": "When on, replies are organised for Feishu cards (clearer tables, sections and code blocks).",
  "\u5173\u6389\u5219\u6309\u666E\u901A\u6587\u672C\u4E60\u60EF\u56DE\u7B54\u2014\u2014\u63D2\u4EF6\u4E0D\u6539\u5199\u7B54\u6848\u5185\u5BB9\uFF0C\u600E\u4E48\u5199\u7531\u6A21\u578B\u81EA\u5DF1\u51B3\u5B9A\u3002": "When off they follow plain-text habits \u2014 the plugin never rewrites the answer; the model decides how to write it.",
  '\u5199\u4E00\u53E5"\u600E\u4E48\u7406\u89E3\u6765\u6E90"\u7684\u8BF4\u660E\uFF0C\u53EF\u70B9\u300C\u586B\u5165\u793A\u4F8B\u300D\u770B\u6A21\u677F': 'One line on how to read the source; use "Fill with example" for a template',
  "\u542F\u7528\u589E\u5F3A": "Enable enhancement",
  "\u544A\u8BC9\u673A\u5668\u4EBA\uFF1A\u8FD9\u6761\u6D88\u606F\u4ECE\u54EA\u6765\u3001\u4EE5\u53CA\u8BE5\u600E\u4E48\u7528\u5B83\u2014\u2014\u6BD4\u5982\u8BA9\u5B83\u5728\u56DE\u7B54\u91CC\u5E26\u4E0A\u53D1\u8A00\u4EBA\u662F\u8C01\u3001\u5728\u54EA\u4E2A\u7FA4\u8BF4\u7684\u3002": "Tell the bot where a message came from and how to use it \u2014 e.g. mention who said it and in which chat.",
  "profile \u5DF2\u5C31\u7EEA": "profile ready",
  "profile \u5C1A\u672A\u521B\u5EFA": "profile not created yet",
  "\u5E94\u7528\u8EAB\u4EFD": "app identity",
  "\u767B\u5F55\u4EBA": "signed-in user",
  "\u628A\u7ED3\u679C\u53D1\u5230\u6307\u5B9A\u4F1A\u8BDD": "Send results to a chosen chat",
  "\u5E2E\u52A9": "Help",
  "\u5C5E\u4E3B\u4E0D\u9700\u8981\u8FDB\u540D\u5355\uFF1A\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\u3002": "The owner does not need to be on the list: their messages and commands always pass.",
  "\u5C5E\u4E3B\u662F\u626B\u7801\u7ED1\u5B9A\u8FD9\u4E2A\u8D26\u53F7\u7684\u4EBA\uFF08\u5FAE\u4FE1\u767B\u5F55\u4EBA\uFF09\uFF0C\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\u3002": "The owner is whoever scanned to bind this account (the WeChat sign-in); their messages and commands always pass.",
  "\u300C\u4EFB\u4F55\u4EBA\u53EF\u7528\u300D\u8868\u793A\u8FD9\u4E2A\u573A\u5408\u91CC\u8C01\u90FD\u8FDB\u5F97\u6765\u3002": '"Anyone" means everyone in this scope can get in.',
  "\u544A\u8BC9\u673A\u5668\u4EBA\uFF1A\u8FD9\u6761\u6D88\u606F\u4ECE\u54EA\u6765\u3001\u4EE5\u53CA\u8BE5\u600E\u4E48\u7528\u5B83\u2014\u2014\u6BD4\u5982\u8BA9\u5B83\u5728\u56DE\u7B54\u91CC\u5E26\u4E0A\u53D1\u8A00\u4EBA\u662F\u8C01\u3002": "Tell the bot where a message came from and how to use it \u2014 e.g. mention who said it.",
  "\u8FD8\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5148\u548C\u673A\u5668\u4EBA\u79C1\u804A\u4E00\u6B21\uFF0C\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF0C\u4FDD\u5B58\u540E\u5373\u53EF\u4E3B\u52A8\u6295\u9012\u3002": "No conversations to add yet: chat with the bot once and it will show up here; save it to enable proactive delivery.",
  "\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5148\u548C\u673A\u5668\u4EBA\u79C1\u804A\u4E00\u6B21\uFF0C\u8BE5\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002": "No conversations to add: chat with the bot once and it will show up here.",
  "\u79C1\u804A": "Direct",
  "\u7FA4\u804A": "Group",
  "\u5168\u5C40": "Global",
  "\u7EE7\u627F\u5168\u5C40": "Inherits global",
  "\u6062\u590D\u7EE7\u627F\u5168\u5C40": "Revert to inheriting global",
  "\u6A21\u578B": "Model",
  "\u9ED8\u8BA4\u6A21\u578B": "Default model",
  "\u63A8\u7406\u7B49\u7EA7": "Reasoning effort",
  "\u8FD9\u4E2A\u6A21\u578B\u6CA1\u6709\u53EF\u9009\u7684\u63A8\u7406\u7B49\u7EA7\u3002": "This model has no reasoning efforts to choose from.",
  "\u5148\u9009\u4E00\u4E2A\u6A21\u578B\u3002": "Pick a model first.",
  "\u6A21\u578B\u9ED8\u8BA4": "Model default",
  "\u90E8\u5206 provider \u8BFB\u53D6\u5931\u8D25\uFF1A": "Some providers failed to load: ",
  "\u5F53\u524D Host \u8BFB\u4E0D\u5230\u6A21\u578B\u76EE\u5F55\u3002": "The model catalog is unavailable right now.",
  "\u8FD8\u6CA1\u6709\u4F1A\u8BDD\u65F6\u7528\u54EA\u4E2A\u6A21\u578B\uFF1A\u9009\u5B8C\u5BF9\u4E0B\u4E00\u6761\u6D88\u606F\u65B0\u5EFA\u7684\u4F1A\u8BDD\u751F\u6548\u3002\u4F1A\u8BDD\u5185\u8FD8\u80FD\u5355\u72EC\u6539\uFF08\u9762\u677F\u7684\u6A21\u578B\u4E0B\u62C9\uFF09\u3002": "Model used before a conversation exists; it applies to the session created by your next message. You can still change it per conversation from the panel.",
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
  "\u8BA9\u5B9A\u65F6\u4EFB\u52A1\u6216 agent \u628A\u7ED3\u679C\u76F4\u63A5\u53D1\u5230\u6307\u5B9A\u4F1A\u8BDD\u3002": "Let a scheduled job or an agent push results straight into a conversation.",
  "\u62D6\u52A8\u53EF\u8C03\u6574\u987A\u5E8F": "Drag to reorder",
  "\u5728\u6E20\u9053\u81EA\u5DF1\u7684\u914D\u7F6E\u91CC\u5B8C\u6210\u63A5\u5165\u540E\uFF0C\u673A\u5668\u4EBA\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002": "Once the channel is configured, its bots show up here.",
  "\u73B0\u5728\u8DDF\u968F\u300C\u5168\u5C40\u300D\u90A3\u4E00\u4EFD\uFF1B\u5728\u8FD9\u91CC\u6539\u4EFB\u4F55\u4E00\u9879\uFF0C\u5C31\u4F1A\u53D8\u6210\u8FD9\u4E2A\u573A\u5408\u7684\u5355\u72EC\u8BBE\u7F6E\u3002": "Currently following the Global layer; changing anything here makes this scope its own settings.",
  "\u5019\u9009": "Candidate",
  "\u4FDD\u5B58\u4E3A\u6295\u9012\u76EE\u6807": "Save as target",
  "\u91CD\u547D\u540D": "Rename",
  "\u81EA\u5B9A\u4E49\u540D\u79F0": "Custom name",
  "\u7559\u7A7A\u5219\u7528\u81EA\u52A8\u8BC6\u522B\u7684\u540D\u5B57": "Leave empty to use the detected name",
  "\u5DF2\u6539\u540D\u3002": "Renamed.",
  "\u5DF2\u6062\u590D\u81EA\u52A8\u540D\u5B57\u3002": "Restored the detected name.",
  "\u5220\u9664": "Delete",
  "\u786E\u8BA4\u5220\u9664": "Confirm delete",
  "\u5F53\u524D\u6E20\u9053\u4E0D\u652F\u6301\u4E3B\u52A8\u6295\u9012\u3002": "This channel does not support proactive delivery.",
  "\u5DF2\u4FDD\u5B58\uFF0C\u73B0\u5728\u53EF\u4EE5\u4E3B\u52A8\u53D1\u6D88\u606F\u4E86\u3002": "Saved. You can now send proactively.",
  "\u5DF2\u5220\u9664\u3002": "Deleted.",
  "\u8FD8\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5728\u7FA4\u91CC @ \u4E00\u6B21\u673A\u5668\u4EBA\uFF0C\u6216\u4E0E\u5B83\u79C1\u804A\u4E00\u6B21\uFF0C\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\uFF0C\u4FDD\u5B58\u540E\u5373\u53EF\u4E3B\u52A8\u6295\u9012\u3002": "No conversation to add yet: mention the bot once in a group, or send it a direct message \u2014 the conversation then shows up here and can be saved for proactive delivery.",
  "\u6CA1\u6709\u53EF\u6DFB\u52A0\u7684\u4F1A\u8BDD\uFF1A\u5728\u7FA4\u91CC @ \u4E00\u6B21\u673A\u5668\u4EBA\uFF0C\u6216\u4E0E\u5B83\u79C1\u804A\u4E00\u6B21\uFF0C\u8BE5\u4F1A\u8BDD\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002": "No conversation to add: mention the bot once in a group, or send it a direct message, and that conversation shows up here.",
  "\u4E0A\u9762\u6807\u300C\u5019\u9009\u300D\u7684\u4F1A\u8BDD\u8FD8\u4E0D\u80FD\u4E3B\u52A8\u6295\u9012\uFF0C\u70B9\u300C\u4FDD\u5B58\u4E3A\u6295\u9012\u76EE\u6807\u300D\u540E\u624D\u884C\u3002": 'A conversation marked "Candidate" cannot receive proactive messages yet \u2014 press "Save as target" first.',
  "\u5DF2\u4FDD\u5B58": "Saved",
  "\u53EF\u6DFB\u52A0\u7684\u5019\u9009": "Candidates",
  "\u5C55\u5F00\u5168\u90E8": "Show all",
  "\u6536\u8D77": "Collapse",
  "\u6309\u540D\u5B57\u6216 id \u8FC7\u6EE4": "Filter by name or id",
  "\u6CA1\u6709\u5339\u914D\u7684\u76EE\u6807\u3002": "No target matches the filter.",
  "\u586B\u5165\u793A\u4F8B": "Fill with example",
  "\u6E05\u7A7A": "Clear",
  "\u6765\u6E90\u5B57\u6BB5": "Source fields",
  "\u542F\u7528": "Enabled",
  "\u5907\u6CE8\u540D\uFF08\u53EF\u9009\uFF09": "Display name (optional)",
  "\u5F20\u4E09": "Alice",
  "\u65B0\u589E": "Add",
  "\u8FD8\u6CA1\u6709\u6307\u5B9A\u8BBE\u7F6E\u3002": "Nothing configured yet.",
  "\u5173\u95ED": "Close",
  "\u589E\u5F3A\u63D0\u793A\u8BCD": "Prepended prompt",
  "\u544A\u8BC9\u6A21\u578B\u5982\u4F55\u4F7F\u7528\u6765\u6E90\u5B57\u6BB5\u3002\u53EA\u586B\u6B63\u6587\uFF0C\u63D2\u4EF6\u4F1A\u81EA\u52A8\u5305\u6210\u6765\u6E90\u589E\u5F3A\u5757\u3002": "Tell the model how to use the source fields. Write the body only \u2014 the plugin wraps it into a source block.",
  "\u53E0\u52A0\u5168\u5C40\u63D0\u793A\u8BCD\uFF08\u4E0D\u52FE\u9009\u5219\u53EA\u4F7F\u7528\u4E0A\u9762\u7684\u4E13\u5C5E\u63D0\u793A\u8BCD\uFF09": "Also stack the global prompt (unchecked: use only the prompt above)",
  "\u672A\u5F00\u542F": "Off",
  "\u6765\u6E90\u5B57\u6BB5\u53EA\u5728\u5F53\u524D\u6D88\u606F\u5DF2\u63D0\u4F9B\u65F6\u624D\u4F1A\u53D1\u9001\uFF0C\u4E0D\u4F1A\u989D\u5916\u67E5\u8BE2\u5E73\u53F0\u63A5\u53E3\u3002": "Source fields are sent only when the incoming message already carries them; no extra platform calls are made.",
  "\u4E0A\u4E0B\u6587\u589E\u5F3A\u8303\u56F4": "Context enhancement scope",
  "\u5DF2\u5F00\u542F": "On",
  "\u4ECE\u4F1A\u8BDD\u91CC\u9009\u2026": "Pick a conversation\u2026",
  "\u5C5E\u4E3B": "Owner",
  "\u5C5E\u4E3B\u4E0D\u9700\u8981\u8FDB\u767D\u540D\u5355\uFF1A\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\u3002\u8FD9\u91CC\u6539\u5B8C\u4F1A\u91CD\u8FDE\u4E00\u6B21\uFF0C\u7ACB\u523B\u751F\u6548\u3002": "An owner does not need to be on the allowlist: their messages and commands always pass. Saving reconnects this bot once so the change takes effect immediately.",
  "\u5F53\u524D\u6CA1\u6709\u5C5E\u4E3B\uFF1A\u6CA1\u6709\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565\uFF0C\u8C01\u80FD\u7528\u5B8C\u5168\u7531\u4E0B\u9762\u7684\u300C\u8BBF\u95EE\u7B56\u7565\u300D\u51B3\u5B9A\u3002": "No owner right now: nobody bypasses the access policy, so who may use this bot is decided entirely by the access policy below.",
  "\u4ECE\u4F1A\u8BDD\u91CC\u9009\u4E00\u4E2A\u4EBA\u8BBE\u4E3A\u5C5E\u4E3B": "Pick a person from a conversation to make them the owner",
  "\u8BBE\u4E3A\u5C5E\u4E3B": "Make owner",
  "\u6CA1\u6709\u53EF\u9009\u7684\u4F1A\u8BDD\uFF08\u5148\u548C\u673A\u5668\u4EBA\u804A\u4E00\u6B21\uFF09": "No conversation to pick yet (talk to the bot once first)",
  "\u6E05\u7A7A\uFF08\u65E0\u5C5E\u4E3B\uFF09": "Clear (no owner)",
  "\u6E05\u7A7A\u540E\u6CA1\u6709\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565": "After clearing, nobody bypasses the access policy",
  // 机器人设置页的共享编辑块（bot-shared-settings.js）
  "\u5DE5\u4F5C\u533A": "Workspace",
  "\u673A\u5668\u4EBA\u8DD1\u5728\u54EA\u4E2A\u76EE\u5F55\uFF1A\u80FD\u8BFB\u5199\u54EA\u4E9B\u6587\u4EF6\u3001\u7528\u54EA\u4EFD AGENTS.md\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002": "Which directory the bot runs in: which files it may read and write, and which AGENTS.mdapplies. Applies to new conversations only.",
  "\u76EE\u5F55": "Directory",
  "\u4E0B\u62C9\u91CC\u662F\u8FD9\u53F0\u673A\u5668\u4EBA\u7528\u8FC7\u7684\u76EE\u5F55\u3002": "The suggestions are directories this bot has used before.",
  "Agent \u9884\u8BBE": "Agent preset",
  "\u8FD9\u4E2A\u673A\u5668\u4EBA\u7528\u54EA\u5957 Agent \u9884\u8BBE\uFF08\u4EBA\u8BBE\u4E0E\u5DE5\u5177\u96C6\uFF09\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002": "Which agent preset this bot uses (persona and tool set). Applies to new conversations only.",
  "\u5F53\u524D Host \u8BFB\u4E0D\u5230 Agent Preset \u5217\u8868\u3002": "This Host does not expose an agent preset list.",
  "\u8DDF\u968F Host \u9ED8\u8BA4": "Follow the Host default",
  "\u8BBF\u95EE\u7B56\u7565": "Access policy",
  "\u8C01\u80FD\u8DDF\u673A\u5668\u4EBA\u8BF4\u8BDD\u3001\u8C01\u80FD\u6267\u884C\u547D\u4EE4\u3002\u6539\u52A8\u7ACB\u5373\u751F\u6548\uFF1B\u5C5E\u4E3B\u59CB\u7EC8\u53EF\u7528\u3002": "Who may talk to the bot and who may run commands. Changes apply immediately;the owner always has access.",
  "\u8BBF\u95EE\u6A21\u5F0F": "Access mode",
  "\u4EC5\u540D\u5355\u5185\u53EF\u7528": "Allowlist only",
  "\u4EFB\u4F55\u4EBA\u53EF\u7528": "Anyone",
  "\u5141\u8BB8\u6267\u884C\u547D\u4EE4": "Allow commands",
  "\u53EF\u6267\u884C\u547D\u4EE4": "Allow commands",
  "\u79FB\u9664": "Remove",
  "\u6DFB\u52A0": "Add",
  "\u540D\u5355\u4E3A\u7A7A\u65F6\u53EA\u6709\u5C5E\u4E3B\u53EF\u7528\u3002": "An empty allowlist means only the owner can use it.",
  "\u5BF9\u65B9\u7684\u5E73\u53F0 id\uFF0C\u56DE\u8F66\u6DFB\u52A0": "Their platform id \u2014 press Enter to add",
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
  // 诊断面板（client/diagnostics.js）
  "\u8BCA\u65AD": "Diagnostics",
  "\u6536\u8D77\u8BCA\u65AD": "Hide diagnostics",
  "\u51FA\u6545\u969C\u65F6\u5148\u770B\u8FD9\u91CC\uFF1A\u8FDE\u63A5\u72B6\u6001\u3001\u6700\u8FD1\u9519\u8BEF\u3001\u65E5\u5FD7\u5C3E\u90E8\u3002": "Start here when something breaks: connection state, latest errors, log tail.",
  "\u8FD0\u884C\u4E2D": "Running",
  "\u542F\u52A8\u4E2D": "Starting",
  "\u5DF2\u8FDE\u63A5": "Connected",
  "\u672A\u8FDE\u63A5": "Disconnected",
  "\u53BB\u5F00\u901A\u6743\u9650": "Grant the scope",
  "\u6700\u8FD1\u4E00\u6B21\u9519\u8BEF": "Last error",
  "\u8FD9\u53F0\u6E20\u9053\u4E0B\u8FD8\u6CA1\u6709\u673A\u5668\u4EBA\u3002": "No bots on this channel yet.",
  "\u8FD8\u6CA1\u6709\u65E5\u5FD7": "No log yet",
  "\u770B\u6700\u540E 40 \u884C": "Show last 40 lines",
  "\u7248\u672C\u4E0E\u66F4\u65B0": "Version & updates",
  "\u6536\u8D77\u7248\u672C\u4E0E\u66F4\u65B0": "Hide version & updates",
  "\u5347\u7EA7\u63D2\u4EF6\u540E\u9700\u8981\u91CD\u542F dsh\uFF1B\u53EA\u6539\u8BBE\u7F6E\u9875\u4EE3\u7801\u5219\u5237\u65B0\u9875\u9762\u5373\u53EF\u3002": "Upgrading the plugin needs a dsh restart; settings-only changes just need a page refresh.",
  "Chat\u673A\u5668\u4EBA\u5185\u6838": "Chat bot core",
  "\u6E20\u9053\u5951\u7EA6\u7248\u672C": "Channel contract version",
  "\u6570\u636E\u76EE\u5F55": "Data directory",
  "\u65E5\u5FD7\u76EE\u5F55": "Log directory",
  "\u8BFB\u53D6\u5931\u8D25": "Failed to read",
  "\u66F4\u65B0\u65B9\u5F0F\uFF1A`dsh plugin --profile web add @sidleo3/dsh-chat`\uFF08\u4ECE npm\uFF09\uFF0C\u6216\u4ECE\u4ED3\u5E93\u91CD\u65B0\u6253\u5305\u540E\u8BA9 DSH \u91CD\u65B0\u52A0\u8F7D\u3002": "Update with `dsh plugin --profile web add @sidleo3/dsh-chat` (from npm), or repack from the repo and let DSH reload the plugin.",
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
var React14 = __toESM(require("react"), 1);

// packages/dsh-chat/client/bot-list.js
var React11 = __toESM(require("react"), 1);

// packages/dsh-chat/client/list-order.js
var React10 = __toESM(require("react"), 1);
var PREFIX = "dsh-chat:order:";
var CHANNEL_ORDER_KEY = `${PREFIX}channels`;
function botOrderKey(channelId) {
  return `${PREFIX}bots:${channelId}`;
}
function storageOf(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function readOrder(key, storage = null) {
  const store = storageOf(storage);
  if (!store || typeof store.getItem !== "function") return [];
  try {
    const raw = store.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item) : [];
  } catch {
    return [];
  }
}
function writeOrder(key, keys, storage = null) {
  const store = storageOf(storage);
  if (!store || typeof store.setItem !== "function") return false;
  try {
    store.setItem(key, JSON.stringify([...keys]));
    return true;
  } catch {
    return false;
  }
}
function orderedItems(items, order, keyOf) {
  const list = Array.isArray(items) ? items : [];
  if (!Array.isArray(order) || order.length === 0) return [...list];
  const rank = /* @__PURE__ */ new Map();
  order.forEach((key, index) => rank.set(key, index));
  return [...list].sort((left, right) => {
    const a = rank.has(keyOf(left)) ? rank.get(keyOf(left)) : Number.MAX_SAFE_INTEGER;
    const b = rank.has(keyOf(right)) ? rank.get(keyOf(right)) : Number.MAX_SAFE_INTEGER;
    return a - b;
  });
}
function moveKey(keys, fromKey, toKey) {
  const list = Array.isArray(keys) ? [...keys] : [];
  const from = list.indexOf(fromKey);
  const to = list.indexOf(toKey);
  if (from < 0 || to < 0 || from === to) return list;
  list.splice(from, 1);
  list.splice(to, 0, fromKey);
  return list;
}
function useListOrder(key, keyOf) {
  const [order, setOrder] = React10.useState(() => readOrder(key));
  React10.useEffect(() => {
    setOrder(readOrder(key));
  }, [key]);
  const move = React10.useCallback((items, fromKey, toKey) => {
    const current = (Array.isArray(items) ? items : []).map(keyOf);
    const next = moveKey(current, fromKey, toKey);
    setOrder(next);
    writeOrder(key, next);
    return next;
  }, [key, keyOf]);
  const reset = React10.useCallback(() => {
    setOrder([]);
    writeOrder(key, []);
  }, [key]);
  return { order, move, reset };
}

// packages/dsh-chat/client/bot-list.js
var h9 = React11.createElement;
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
  const {
    channelId,
    label,
    note,
    connection,
    chatUi,
    translate,
    t: frameworkT,
    onOpenSettings,
    setup = null
  } = props;
  const t = typeof translate === "function" ? translate : typeof frameworkT === "function" ? frameworkT : (key) => key;
  const setupLabel = typeof setup?.label === "string" && setup.label.trim() ? setup.label.trim() : null;
  const setupHint = typeof setup?.hint === "string" && setup.hint.trim() ? setup.hint.trim() : t("\u5728\u6E20\u9053\u81EA\u5DF1\u7684\u914D\u7F6E\u91CC\u5B8C\u6210\u63A5\u5165\u540E\uFF0C\u673A\u5668\u4EBA\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002");
  const [state, setState] = React11.useState({ phase: "loading", bots: [], error: null });
  const load = React11.useCallback(() => {
    setState((current) => ({ ...current, phase: "loading", error: null }));
    chatUi.callChannelRpc(connection, channelId, "connection.status", {}).then((result) => {
      setState({ phase: "ready", bots: normalizeBots(chatUi.unwrapRpc(result)), error: null });
    }).catch((error) => {
      setState({ phase: "error", bots: [], error: error?.message ?? String(error) });
    });
  }, [channelId, chatUi, connection]);
  React11.useEffect(() => {
    load();
  }, [load]);
  const { Panel: Panel2, EmptyState: EmptyState2, StatusPill: StatusPill2 } = chatUi.components;
  const botOrder = useListOrder(botOrderKey(channelId), (row) => botKeyOf(row.bot));
  const rows = React11.useMemo(
    () => orderedItems(
      state.bots.map((bot, index) => ({ bot, fallback: `row-${index}` })),
      botOrder.order,
      (row) => botKeyOf(row.bot) ?? row.fallback
    ),
    [state.bots, botOrder.order]
  );
  const dragBotRef = React11.useRef(null);
  const [dragBot, setDragBot] = React11.useState(null);
  const [dropBot, setDropBot] = React11.useState(null);
  return h9(
    Panel2,
    {
      title: `${label()} \xB7 ${t("\u673A\u5668\u4EBA")}`,
      description: note || null,
      actions: h9(
        "div",
        { className: "dchat-actions" },
        /**
         * 渠道设置入口**只在渠道声明了名称时**显示。
         *
         * 真机反馈：飞书那个入口点进去跟"机器人设置"几乎一样（渠道级只有一行 dataDir，
         * 而 dataDir 在诊断/版本面板里、读取状态就是右边的「重新读取」）——那就不该有它。
         * 微信的入口就是「扫码接入」，名称与说明都由渠道给（hub 不认识这些语义）。
         */
        setupLabel ? h9("button", {
          type: "button",
          className: "dchat-button dchat-buttonLink",
          onClick: () => onOpenSettings(null)
        }, t(setupLabel)) : null,
        h9("button", {
          type: "button",
          className: "dchat-button",
          onClick: load,
          disabled: state.phase === "loading"
        }, state.phase === "loading" ? t("\u8BFB\u53D6\u4E2D\u2026") : t("\u91CD\u65B0\u8BFB\u53D6"))
      )
    },
    state.error ? h9("p", { className: "dchat-error" }, `${t("\u8BFB\u53D6\u5931\u8D25")}\uFF1A${state.error}`) : null,
    state.phase !== "loading" && state.bots.length === 0 ? h9(EmptyState2, {
      title: t("\u8FD9\u4E2A\u6E20\u9053\u8FD8\u6CA1\u6709\u673A\u5668\u4EBA"),
      description: t(setupHint)
    }, setupLabel ? h9("button", {
      type: "button",
      className: "dchat-button",
      onClick: () => onOpenSettings(null)
    }, t(setupLabel)) : null) : null,
    state.bots.length > 0 ? h9("ul", { className: "dchat-botList" }, rows.map((row) => {
      const { bot } = row;
      const identity = botKeyOf(bot);
      const rowKey = identity ?? row.fallback;
      const title = bot.name || identity || t("\u672A\u547D\u540D\u673A\u5668\u4EBA");
      const showIdentity = Boolean(identity) && identity !== title;
      return h9(
        "li",
        {
          key: rowKey,
          className: `dchat-botRow${dropBot === rowKey && dragBot !== rowKey ? " dchat-dropTarget" : ""}`,
          onDragOver: (event) => {
            const from = dragBotRef.current;
            if (!from || from === rowKey) return;
            event.preventDefault();
            setDropBot(rowKey);
          },
          onDrop: (event) => {
            event.preventDefault();
            const from = dragBotRef.current;
            if (from && from !== rowKey) botOrder.move(rows, from, rowKey);
            dragBotRef.current = null;
            setDropBot(null);
            setDragBot(null);
          }
        },
        h9("span", {
          className: "dchat-grip",
          draggable: true,
          title: t("\u62D6\u52A8\u53EF\u8C03\u6574\u987A\u5E8F"),
          "aria-hidden": "true",
          onDragStart: (event) => {
            dragBotRef.current = rowKey;
            setDragBot(rowKey);
            event.dataTransfer?.setData("text/plain", rowKey);
            if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
          },
          onDragEnd: () => {
            dragBotRef.current = null;
            setDragBot(null);
            setDropBot(null);
          }
        }, "\u22EE\u22EE"),
        h9(
          "div",
          { className: "dchat-botMain" },
          h9(
            "div",
            { className: "dchat-botTitle" },
            h9("strong", { title }, title),
            h9(StatusPill2, { status: bot.state, label: t(STATE_TEXT[bot.state] ?? "\u5DF2\u505C\u6B62") })
          ),
          h9(
            "div",
            { className: "dchat-botMeta" },
            showIdentity ? h9("span", { className: "dchat-code" }, identity) : null,
            h9("span", null, `${t("\u5DF2\u5904\u7406")} ${bot.handled ?? 0}`),
            h9("span", null, `${t("\u6700\u8FD1")} ${formatTime(bot.lastHandledAt)}`)
          ),
          bot.errorMessage || bot.lastError ? h9("div", { className: "dchat-botError" }, bot.errorMessage ?? bot.lastError) : null
        ),
        h9("button", {
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

// packages/dsh-chat/client/diagnostics.js
var React12 = __toESM(require("react"), 1);
var h10 = React12.createElement;
var STATE_TEXT2 = Object.freeze({
  running: "\u8FD0\u884C\u4E2D",
  starting: "\u542F\u52A8\u4E2D",
  stopped: "\u5DF2\u505C\u6B62",
  failed: "\u542F\u52A8\u5931\u8D25"
});
function formatSize(bytes) {
  if (typeof bytes !== "number" || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
function formatTime2(iso) {
  if (typeof iso !== "string" || !iso) return "\u2014";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function DiagnosticsPanel(props) {
  const { connection, chatUi, translate, t: frameworkT } = props;
  const t = typeof translate === "function" ? translate : typeof frameworkT === "function" ? frameworkT : (key) => key;
  const [state, setState] = React12.useState({ loading: true, error: null, info: null });
  const [openLog, setOpenLog] = React12.useState(null);
  const load = React12.useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    chatUi.callControlRpc(connection, "diagnostics.read", {}).then((result) => {
      setState({ loading: false, error: null, info: chatUi.unwrapRpc(result) });
    }).catch((error) => {
      setState({ loading: false, error: error?.message ?? String(error), info: null });
    });
  }, [chatUi, connection]);
  React12.useEffect(() => {
    load();
  }, [load]);
  const Panel2 = chatUi.components.Panel;
  const StatusPill2 = chatUi.components.StatusPill;
  const info = state.info;
  const statusLabel = (channel) => {
    if (channel.status === "running") return t("\u6E20\u9053\u5DF2\u5C31\u7EEA");
    if (channel.status === "failed") return t("\u6E20\u9053\u542F\u52A8\u5931\u8D25");
    if (channel.status === "stopped") return t("\u6E20\u9053\u5DF2\u505C\u6B62");
    return t("\u6E20\u9053\u6B63\u5728\u542F\u52A8");
  };
  const botRow = (bot) => h10(
    "li",
    { key: bot.id, className: "dchat-diagBot" },
    // 一行放不下就整块换行：id 会省略号收缩，右侧元信息不拆字。
    h10(
      "div",
      { className: "dchat-listItem dchat-diagRow" },
      h10("span", { className: "dchat-code" }, bot.id),
      h10(
        "span",
        { className: "dchat-diagMeta" },
        `${STATE_TEXT2[bot.state] ? t(STATE_TEXT2[bot.state]) : bot.state ?? "\u2014"} \xB7 ${bot.connected ? t("\u5DF2\u8FDE\u63A5") : t("\u672A\u8FDE\u63A5")} \xB7 ${t("\u5DF2\u5904\u7406")} ${bot.handled ?? 0}` + (bot.lastHandledAt ? ` \xB7 ${formatTime2(bot.lastHandledAt)}` : "")
      )
    ),
    // 失败必须可见：连接错误、最近一次处理错误、名字拿不到（多为缺权限，带开通链接）。
    bot.errorMessage ? h10("p", { className: "dchat-error", role: "alert" }, bot.errorMessage) : null,
    bot.lastError ? h10("p", { className: "dchat-error", role: "alert" }, `${t("\u6700\u8FD1\u4E00\u6B21\u9519\u8BEF")}\uFF1A${bot.lastError}`) : null,
    bot.nameHint ? h10(
      "p",
      { className: "dchat-cardDescription" },
      `${bot.nameHint.message} `,
      bot.nameHint.url ? h10("a", { href: bot.nameHint.url, target: "_blank", rel: "noreferrer" }, t("\u53BB\u5F00\u901A\u6743\u9650")) : null
    ) : null
  );
  return h10(
    Panel2,
    {
      title: t("\u8BCA\u65AD"),
      description: t("\u51FA\u6545\u969C\u65F6\u5148\u770B\u8FD9\u91CC\uFF1A\u8FDE\u63A5\u72B6\u6001\u3001\u6700\u8FD1\u9519\u8BEF\u3001\u65E5\u5FD7\u5C3E\u90E8\u3002"),
      actions: h10("button", {
        type: "button",
        className: "dchat-button",
        onClick: load,
        disabled: state.loading
      }, state.loading ? t("\u8BFB\u53D6\u4E2D\u2026") : t("\u91CD\u65B0\u8BFB\u53D6"))
    },
    state.error ? h10("p", { className: "dchat-error" }, `${t("\u8BFB\u53D6\u5931\u8D25")}\uFF1A${state.error}`) : null,
    ...(info?.channels ?? []).map((channel) => h10(
      "div",
      {
        key: channel.id,
        className: "dchat-diagSection"
      },
      h10(
        "div",
        { className: "dchat-diagHead" },
        h10("span", { className: "dchat-groupTitle" }, `${channel.label} \xB7 ${channel.version ?? "\u2014"}`),
        h10(StatusPill2, { status: channel.status, label: statusLabel(channel) })
      ),
      channel.statusError ? h10("p", { className: "dchat-error", role: "alert" }, channel.statusError) : null,
      channel.bots.length === 0 ? h10("p", { className: "dchat-cardDescription" }, t("\u8FD9\u53F0\u6E20\u9053\u4E0B\u8FD8\u6CA1\u6709\u673A\u5668\u4EBA\u3002")) : h10("ul", { className: "dchat-list" }, ...channel.bots.map(botRow))
    )),
    info ? h10(
      "ul",
      { className: "dchat-list" },
      h10(
        "li",
        { className: "dchat-listItem" },
        h10("span", null, t("\u6570\u636E\u76EE\u5F55")),
        h10("code", { className: "dchat-code" }, info.dataDir ?? "\u2014")
      ),
      h10(
        "li",
        { className: "dchat-listItem" },
        h10("span", null, t("\u65E5\u5FD7\u76EE\u5F55")),
        h10("code", { className: "dchat-code" }, info.logDir ?? "\u2014")
      )
    ) : null,
    ...(info?.logs ?? []).map((log) => {
      const name2 = String(log.path ?? "").split("/").pop();
      const open = openLog === log.path;
      return h10(
        "div",
        { key: log.path, className: "dchat-diagSection" },
        // 与机器人行同构：文件名 + 大小时间一行，展开按钮单独一行（窄栏下挤不下）。
        h10(
          "div",
          { className: "dchat-diagBot" },
          h10(
            "div",
            { className: "dchat-listItem dchat-diagRow" },
            h10("span", { className: "dchat-code" }, name2),
            h10(
              "span",
              { className: "dchat-diagMeta" },
              log.exists ? `${formatSize(log.size)} \xB7 ${formatTime2(log.modifiedAt)}` : t("\u8FD8\u6CA1\u6709\u65E5\u5FD7")
            )
          ),
          h10(
            "div",
            { className: "dchat-actions" },
            h10("button", {
              type: "button",
              className: "dchat-button dchat-buttonLink",
              disabled: !log.exists,
              "aria-expanded": open,
              onClick: () => setOpenLog(open ? null : log.path)
            }, open ? t("\u6536\u8D77") : t("\u770B\u6700\u540E 40 \u884C"))
          )
        ),
        open ? h10("pre", { className: "dchat-code dchat-codeBlock dchat-logTail" }, log.lines.join("\n")) : null
      );
    })
  );
}

// packages/dsh-chat/client/version-panel.js
var React13 = __toESM(require("react"), 1);
var h11 = React13.createElement;
var CHANNEL_PACKAGE_HINTS = Object.freeze({
  feishu: "dsh-chat-feishu",
  weixin: "dsh-chat-weixin"
});
function VersionPanel(props) {
  const { connection, chatUi, translate, t: frameworkT } = props;
  const t = typeof translate === "function" ? translate : typeof frameworkT === "function" ? frameworkT : (key) => key;
  const [state, setState] = React13.useState({ loading: true, error: null, info: null });
  const load = React13.useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    chatUi.callControlRpc(connection, "channel.list", {}).then((result) => {
      setState({ loading: false, error: null, info: chatUi.unwrapRpc(result) });
    }).catch((error) => {
      setState({ loading: false, error: error?.message ?? String(error), info: null });
    });
  }, [chatUi, connection]);
  React13.useEffect(() => {
    load();
  }, [load]);
  const Panel2 = chatUi.components.Panel;
  const StatusPill2 = chatUi.components.StatusPill;
  const info = state.info;
  return h11(
    Panel2,
    {
      title: t("\u7248\u672C\u4E0E\u66F4\u65B0"),
      description: t("\u5347\u7EA7\u63D2\u4EF6\u540E\u9700\u8981\u91CD\u542F dsh\uFF1B\u53EA\u6539\u8BBE\u7F6E\u9875\u4EE3\u7801\u5219\u5237\u65B0\u9875\u9762\u5373\u53EF\u3002"),
      actions: h11("button", {
        type: "button",
        className: "dchat-button",
        onClick: load,
        disabled: state.loading
      }, state.loading ? t("\u8BFB\u53D6\u4E2D\u2026") : t("\u91CD\u65B0\u8BFB\u53D6"))
    },
    state.error ? h11("p", { className: "dchat-error" }, `${t("\u8BFB\u53D6\u5931\u8D25")}\uFF1A${state.error}`) : null,
    h11(
      "ul",
      { className: "dchat-list" },
      h11(
        "li",
        { className: "dchat-listItem" },
        h11("span", null, t("Chat\u673A\u5668\u4EBA\u5185\u6838")),
        h11(
          "code",
          { className: "dchat-code" },
          `${info?.hubPackage ?? "@sidleo3/dsh-chat"} ${info?.hubVersion ?? "\u2026"}`
        )
      ),
      h11(
        "li",
        { className: "dchat-listItem" },
        h11("span", null, t("\u6E20\u9053\u5951\u7EA6\u7248\u672C")),
        h11("code", { className: "dchat-code" }, `v${info?.contractVersion ?? "\u2026"}`)
      ),
      ...(info?.channels ?? []).map((channel) => h11(
        "li",
        {
          key: channel.id,
          className: "dchat-listItem"
        },
        h11("span", null, `${channel.label} \xB7 ${CHANNEL_PACKAGE_HINTS[channel.id] ?? channel.id}`),
        h11(
          "span",
          { className: "dchat-versionMeta" },
          h11("code", { className: "dchat-code" }, channel.version ?? "\u2014"),
          h11(StatusPill2, {
            status: channel.status,
            label: channel.status === "running" ? t("\u6E20\u9053\u5DF2\u5C31\u7EEA") : channel.error ? t("\u6E20\u9053\u542F\u52A8\u5931\u8D25") : t("\u6E20\u9053\u6B63\u5728\u542F\u52A8")
          })
        )
      ))
    ),
    info?.dataDir ? h11(
      "ul",
      { className: "dchat-list" },
      h11(
        "li",
        { className: "dchat-listItem" },
        h11("span", null, t("\u6570\u636E\u76EE\u5F55")),
        h11("code", { className: "dchat-code" }, info.dataDir)
      ),
      h11(
        "li",
        { className: "dchat-listItem" },
        h11("span", null, t("\u65E5\u5FD7\u76EE\u5F55")),
        h11("code", { className: "dchat-code" }, info.logDir)
      )
    ) : null,
    h11(
      "div",
      { className: "dchat-updateHint" },
      h11("p", { className: "dchat-cardDescription" }, t("\u66F4\u65B0\u65B9\u5F0F\uFF1A`dsh plugin --profile web add @sidleo3/dsh-chat`\uFF08\u4ECE npm\uFF09\uFF0C\u6216\u4ECE\u4ED3\u5E93\u91CD\u65B0\u6253\u5305\u540E\u8BA9 DSH \u91CD\u65B0\u52A0\u8F7D\u3002")),
      h11("code", { className: "dchat-code dchat-codeBlock" }, "npm run check"),
      h11(
        "code",
        { className: "dchat-code dchat-codeBlock" },
        "dsh plugin --profile web add @sidleo3/dsh-chat"
      )
    )
  );
  ;
}

// packages/dsh-chat/client/section.js
var h12 = React14.createElement;
var KNOWN_CHANNEL_PACKAGES = Object.freeze([
  "dsh-chat-feishu",
  "dsh-chat-weixin"
]);
function ChannelMark({ entry }) {
  const iconUri = channelIconUri(entry.icon);
  if (iconUri) {
    return h12("span", {
      // 有真图标就不套那个"字母块"的边框与底色，让它看起来就是应用图标。
      className: "dchat-channelMark dchat-channelMarkIcon",
      "aria-hidden": "true"
    }, h12("img", { src: iconUri, alt: "", width: 20, height: 20 }));
  }
  if (typeof entry.logo === "function") {
    return h12("span", { className: "dchat-channelMark", "aria-hidden": "true" }, h12(entry.logo));
  }
  const initial = entry.id.slice(0, 1).toUpperCase();
  return h12("span", { className: "dchat-channelMark", "aria-hidden": "true" }, initial);
}
function ChatSettingsSection(props) {
  const { channels, chatUi, translate, t: frameworkT, renderSlot, connection } = props;
  const [showVersions, setShowVersions] = React14.useState(false);
  const [showDiagnostics, setShowDiagnostics] = React14.useState(false);
  const [view, setView] = React14.useState({ kind: "bots", botId: null });
  const t = typeof translate === "function" ? translate : typeof frameworkT === "function" ? frameworkT : (key) => key;
  const entries = React14.useSyncExternalStore(
    (onChange) => channels.subscribe(onChange),
    () => channels.getSnapshot(),
    () => channels.getSnapshot()
  );
  const channelOrder = useListOrder(CHANNEL_ORDER_KEY, (entry) => entry?.id);
  const orderedEntries = React14.useMemo(
    () => orderedItems(entries, channelOrder.order, (entry) => entry?.id),
    [entries, channelOrder.order]
  );
  const dragChannelRef = React14.useRef(null);
  const [dragChannel, setDragChannel] = React14.useState(null);
  const [dropChannel, setDropChannel] = React14.useState(null);
  const [selected, setSelected] = React14.useState(null);
  const activeId = entries.some((entry) => entry.id === selected) ? selected : orderedEntries[0]?.id ?? null;
  const activeEntry = entries.find((entry) => entry.id === activeId) ?? null;
  const openSettings = (botId) => setView({ kind: "channel", botId });
  const backToBots = () => setView({ kind: "bots", botId: null });
  const EmptyState2 = chatUi?.components?.EmptyState;
  function botListView() {
    if (!activeEntry) return null;
    return h12(BotList, {
      key: activeEntry.id,
      channelId: activeEntry.id,
      label: activeEntry.label,
      // 渠道能力说明（如「仅私聊」）放右栏标题下：左栏只留"图标 + 渠道名"，形态才整齐。
      note: activeEntry.capabilities?.note ?? null,
      // 渠道级设置入口：`setup.label` 有才显示（飞书没有渠道级表单，微信是「扫码接入」）。
      setup: activeEntry.capabilities?.setup ?? null,
      connection,
      chatUi,
      translate: t,
      onOpenSettings: openSettings
    });
  }
  function channelView() {
    return h12(
      React14.Fragment,
      null,
      typeof renderSlot === "function" ? renderSlot(
        CHANNEL_PAGE_SLOT,
        { channelId: activeId, botId: view.botId },
        { entryKey: activeId }
      ) : h12("p", { className: "dchat-cardDescription" }, t("\u5F53\u524D\u9875\u9762\u4E0D\u652F\u6301\u6E20\u9053\u5B50\u69FD\u3002"))
    );
  }
  function backBar() {
    return h12(
      "div",
      { className: "dchat-panelBar" },
      h12("button", {
        type: "button",
        className: "dchat-button",
        onClick: backToBots
      }, t("\u2190 \u673A\u5668\u4EBA\u5217\u8868"))
    );
  }
  let body = null;
  if (entries.length === 0) {
    body = EmptyState2 ? h12(EmptyState2, {
      title: t("\u672A\u5B89\u88C5\u4EFB\u4F55\u804A\u5929\u8F6F\u4EF6\u63D2\u4EF6"),
      description: t("\u5B89\u88C5\u6E20\u9053\u63D2\u4EF6\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u5BF9\u5E94\u7684\u804A\u5929\u8F6F\u4EF6\u3002")
    }, h12(
      "ul",
      { className: "dchat-list" },
      h12("li", { className: "dchat-listItem" }, t("\u5DF2\u77E5\u6E20\u9053\u63D2\u4EF6")),
      ...KNOWN_CHANNEL_PACKAGES.map((name2) => h12("li", {
        key: name2,
        className: "dchat-listItem"
      }, h12("code", { className: "dchat-code" }, `dsh plugin --profile web add ${name2}`)))
    )) : null;
  } else if (view.kind !== "bots") {
    body = h12("div", { className: "dchat-solo" }, backBar(), channelView());
  } else {
    body = h12(
      "div",
      { className: "dchat-layout" },
      h12(
        "nav",
        { className: "dchat-rail", role: "tablist", "aria-label": t("\u6E20\u9053\u5BFC\u822A") },
        orderedEntries.map((entry) => h12(
          "button",
          {
            key: entry.id,
            type: "button",
            role: "tab",
            id: `dchat-tab-${entry.id}`,
            className: `dchat-channel${dropChannel === entry.id && dragChannel !== entry.id ? " dchat-dropTarget" : ""}`,
            "aria-selected": entry.id === activeId,
            "aria-controls": `dchat-panel-${entry.id}`,
            onClick: () => {
              setSelected(entry.id);
              backToBots();
            },
            // 拖动排序：把手是那个 grip（button 自己 draggable 在部分浏览器上不灵，
            // 而且整行可拖会与"点一下切换渠道"抢手势）。
            onDragOver: (event) => {
              const from = dragChannelRef.current;
              if (!from || from === entry.id) return;
              event.preventDefault();
              setDropChannel(entry.id);
            },
            onDrop: (event) => {
              event.preventDefault();
              const from = dragChannelRef.current;
              if (from && from !== entry.id) channelOrder.move(orderedEntries, from, entry.id);
              dragChannelRef.current = null;
              setDropChannel(null);
              setDragChannel(null);
            }
          },
          h12("span", {
            className: "dchat-grip",
            draggable: true,
            title: t("\u62D6\u52A8\u53EF\u8C03\u6574\u987A\u5E8F"),
            "aria-hidden": "true",
            onDragStart: (event) => {
              dragChannelRef.current = entry.id;
              setDragChannel(entry.id);
              event.dataTransfer?.setData("text/plain", entry.id);
              if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
            },
            onDragEnd: () => {
              dragChannelRef.current = null;
              setDragChannel(null);
              setDropChannel(null);
            }
          }, "\u22EE\u22EE"),
          h12(ChannelMark, { entry }),
          h12(
            "span",
            { className: "dchat-channelLabel" },
            h12("strong", null, entry.label())
          )
        ))
      ),
      h12("main", {
        className: "dchat-panel",
        role: "tabpanel",
        id: `dchat-panel-${activeId}`,
        "aria-labelledby": `dchat-tab-${activeId}`
      }, botListView())
    );
  }
  return h12(
    "section",
    { className: "dchat-page", "aria-label": t("Chat\u673A\u5668\u4EBA\u8BBE\u7F6E") },
    h12(
      "header",
      { className: "dchat-header" },
      h12(
        "div",
        { className: "dchat-brand" },
        h12("strong", { className: "dchat-brandName" }, "DSH-Chat"),
        h12("span", { className: "dchat-brandHint" }, t("Chat\u673A\u5668\u4EBA"))
      ),
      // 右上角入口：版本与更新 / 诊断（展开后是同一块面板，收起时不请求数据）。
      // 用文字链接形态，避免和 DSH 自己的实心按钮（打开配置文件）平级抢注意力。
      h12(
        "div",
        { className: "dchat-headerActions" },
        h12("button", {
          type: "button",
          className: "dchat-button dchat-buttonLink",
          "aria-expanded": showDiagnostics,
          onClick: () => setShowDiagnostics((open) => !open)
        }, showDiagnostics ? t("\u6536\u8D77\u8BCA\u65AD") : t("\u8BCA\u65AD")),
        h12("button", {
          type: "button",
          className: "dchat-button dchat-buttonLink",
          "aria-expanded": showVersions,
          onClick: () => setShowVersions((open) => !open)
        }, showVersions ? t("\u6536\u8D77\u7248\u672C\u4E0E\u66F4\u65B0") : t("\u7248\u672C\u4E0E\u66F4\u65B0"))
      )
    ),
    showDiagnostics ? h12(DiagnosticsPanel, { connection, chatUi, translate: t }) : null,
    showVersions ? h12(VersionPanel, { connection, chatUi, translate: t }) : null,
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
