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
var h = React.createElement;
function Panel({ title, description, actions, children }) {
  return h(
    "section",
    { className: "dchat-card" },
    title || description || actions ? h(
      "div",
      { className: "dchat-cardHeader" },
      h(
        "div",
        null,
        title ? h("h3", { className: "dchat-cardTitle" }, title) : null,
        description ? h("p", { className: "dchat-cardDescription" }, description) : null
      ),
      actions ? h("div", { className: "dchat-actions" }, actions) : null
    ) : null,
    children
  );
}
function EmptyState({ title, description, children }) {
  return h(
    "div",
    { className: "dchat-empty" },
    h("span", { className: "dchat-emptyTitle" }, title),
    description ? h("span", null, description) : null,
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
  return h("span", {
    className: "dchat-status",
    "data-tone": TONES[status] ?? "",
    "data-status": status
  }, label ?? status);
}
function createChatUi({ ctx, translate } = {}) {
  const t = typeof translate === "function" ? translate : (key) => key;
  return Object.freeze({
    version: CONTRACT_VERSION,
    components: Object.freeze({ Panel, EmptyState, StatusPill }),
    installStyles: () => installChatStyles(),
    /** 调用本渠道自己的 RPC。 */
    callChannelRpc: (connection, channelId, method, payload, signal) => callChatRpc(connection, channelId, method, payload, signal),
    /** 调用 hub 控制端点（渠道无关设置，如上下文增强）。 */
    callControlRpc: (connection, method, payload, signal) => callControlRpc(connection, method, payload, signal),
    unwrapRpc,
    translate: t,
    /** 供渠道页复用的 React 运行时（渠道包只 external react/react-dom，无需各写一份）。 */
    react: React,
    createElement: h,
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
var React2 = __toESM(require("react"), 1);
var h2 = React2.createElement;
var KNOWN_CHANNEL_PACKAGES = Object.freeze([
  "dsh-chat-feishu",
  "dsh-chat-weixin"
]);
function ChannelMark({ entry }) {
  if (typeof entry.logo === "function") {
    return h2("span", { className: "dchat-channelMark", "aria-hidden": "true" }, h2(entry.logo));
  }
  const initial = entry.id.slice(0, 1).toUpperCase();
  return h2("span", { className: "dchat-channelMark", "aria-hidden": "true" }, initial);
}
function ChatSettingsSection(props) {
  const { channels, chatUi, translate, t: frameworkT, renderSlot } = props;
  const t = typeof translate === "function" ? translate : typeof frameworkT === "function" ? frameworkT : (key) => key;
  const entries = React2.useSyncExternalStore(
    (onChange) => channels.subscribe(onChange),
    () => channels.getSnapshot(),
    () => channels.getSnapshot()
  );
  const [selected, setSelected] = React2.useState(null);
  const activeId = entries.some((entry) => entry.id === selected) ? selected : entries[0]?.id ?? null;
  const EmptyState2 = chatUi?.components?.EmptyState;
  const body = entries.length === 0 ? EmptyState2 ? h2(EmptyState2, {
    title: t("\u672A\u5B89\u88C5\u4EFB\u4F55\u804A\u5929\u8F6F\u4EF6\u63D2\u4EF6"),
    description: t("\u5B89\u88C5\u6E20\u9053\u63D2\u4EF6\u540E\uFF0C\u8FD9\u91CC\u4F1A\u51FA\u73B0\u5BF9\u5E94\u7684\u804A\u5929\u8F6F\u4EF6\u3002")
  }, h2(
    "ul",
    { className: "dchat-list" },
    h2("li", { className: "dchat-listItem" }, t("\u5DF2\u77E5\u6E20\u9053\u63D2\u4EF6")),
    ...KNOWN_CHANNEL_PACKAGES.map((name2) => h2("li", {
      key: name2,
      className: "dchat-listItem"
    }, h2("code", { className: "dchat-code" }, `dsh plugin --profile web add ${name2}`)))
  )) : null : h2(
    "div",
    { className: "dchat-layout" },
    h2(
      "nav",
      { className: "dchat-rail", role: "tablist", "aria-label": t("\u6E20\u9053\u5BFC\u822A") },
      entries.map((entry) => h2(
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
        h2(ChannelMark, { entry }),
        h2(
          "span",
          { className: "dchat-channelLabel" },
          h2("strong", null, entry.label()),
          entry.capabilities?.note ? h2("small", null, entry.capabilities.note) : null
        )
      ))
    ),
    h2("main", {
      className: "dchat-panel",
      role: "tabpanel",
      id: `dchat-panel-${activeId}`,
      "aria-labelledby": `dchat-tab-${activeId}`
    }, typeof renderSlot === "function" ? renderSlot(CHANNEL_PAGE_SLOT, { channelId: activeId }, { entryKey: activeId }) : h2("p", { className: "dchat-cardDescription" }, "\u5F53\u524D\u9875\u9762\u4E0D\u652F\u6301\u6E20\u9053\u5B50\u69FD\u3002"))
  );
  return h2(
    "section",
    { className: "dchat-page", "aria-label": t("Chat\u673A\u5668\u4EBA\u8BBE\u7F6E") },
    h2(
      "header",
      { className: "dchat-header" },
      h2(
        "div",
        { className: "dchat-brand" },
        h2("strong", { className: "dchat-brandName" }, "DSH-Chat"),
        h2("span", { className: "dchat-brandHint" }, t("Chat\u673A\u5668\u4EBA"))
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
