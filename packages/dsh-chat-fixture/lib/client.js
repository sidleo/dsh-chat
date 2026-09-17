window.__ModuleLoader__.load({
  id: "dsh-chat-fixture",
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

// packages/dsh-chat-fixture/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var React = __toESM(require("react"), 1);
var name = "dsh-chat-fixture-client";
var inject = ["slots", "locale", "connection", "chatChannels", "chatUi"];
var CHANNEL_ID = "fixture";
var PAGE_SLOT = "chat.channel.page";
var LOCALE_NAMESPACE = "dsh-chat-fixture";
var zh = {
  "\u8BD5\u7528\u6E20\u9053": "\u8BD5\u7528\u6E20\u9053",
  "\u5951\u7EA6\u9A8C\u8BC1\u7528\u5047\u6E20\u9053\uFF1A\u4E0D\u8FDE\u63A5\u4EFB\u4F55\u5E73\u53F0\u3002": "\u5951\u7EA6\u9A8C\u8BC1\u7528\u5047\u6E20\u9053\uFF1A\u4E0D\u8FDE\u63A5\u4EFB\u4F55\u5E73\u53F0\u3002",
  "\u56DE\u663E": "\u56DE\u663E",
  "\u89E3\u6790\u4E0A\u4E0B\u6587\u589E\u5F3A": "\u89E3\u6790\u4E0A\u4E0B\u6587\u589E\u5F3A",
  "\u7ED3\u679C": "\u7ED3\u679C"
};
var en = {
  "\u8BD5\u7528\u6E20\u9053": "Fixture channel",
  "\u5951\u7EA6\u9A8C\u8BC1\u7528\u5047\u6E20\u9053\uFF1A\u4E0D\u8FDE\u63A5\u4EFB\u4F55\u5E73\u53F0\u3002": "Contract fixture channel: connects to nothing.",
  "\u56DE\u663E": "Echo",
  "\u89E3\u6790\u4E0A\u4E0B\u6587\u589E\u5F3A": "Resolve context enhancement",
  "\u7ED3\u679C": "Result"
};
var h = React.createElement;
var SAMPLE_CONFIG = {
  group: { enabled: true, fields: ["senderId"], guidance: "\u7FA4\u804A\u5168\u5C40\u63D0\u793A\u8BCD" },
  direct: { enabled: true, fields: ["senderId", "senderName"], guidance: "\u79C1\u804A\u5168\u5C40\u63D0\u793A\u8BCD" },
  targets: [
    {
      kind: "user",
      id: "ou_demo_user",
      label: "\u6F14\u793A\u7528\u6237",
      enabled: true,
      fields: ["senderId"],
      guidance: "\u8BE5\u7528\u6237\u4E13\u5C5E\u63D0\u793A\u8BCD",
      merge: "append"
    }
  ]
};
function FixturePage(props) {
  const { chatUi, connection, translate } = props;
  const t = typeof translate === "function" ? translate : (key) => key;
  const [output, setOutput] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const run = React.useCallback(async (method, payload) => {
    setBusy(true);
    setError(null);
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, method, payload);
      setOutput(chatUi.unwrapRpc(result));
    } catch (cause) {
      setError(cause);
      setOutput(null);
    } finally {
      setBusy(false);
    }
  }, [chatUi, connection]);
  const { Panel } = chatUi.components;
  return h(
    Panel,
    {
      title: t("\u8BD5\u7528\u6E20\u9053"),
      description: t("\u5951\u7EA6\u9A8C\u8BC1\u7528\u5047\u6E20\u9053\uFF1A\u4E0D\u8FDE\u63A5\u4EFB\u4F55\u5E73\u53F0\u3002"),
      actions: h(
        "div",
        { className: "dchat-actions" },
        h("button", {
          type: "button",
          className: "dchat-button",
          disabled: busy,
          onClick: () => run("echo", { hello: "world" })
        }, t("\u56DE\u663E")),
        h("button", {
          type: "button",
          className: "dchat-button",
          disabled: busy,
          onClick: () => run("context.resolve", {
            config: SAMPLE_CONFIG,
            conversationType: "direct",
            identity: { senderId: "ou_demo_user" }
          })
        }, t("\u89E3\u6790\u4E0A\u4E0B\u6587\u589E\u5F3A"))
      )
    },
    error ? h("p", { className: "dchat-error", role: "alert" }, error.message) : null,
    output ? h(
      "div",
      { className: "dchat-list" },
      h(
        "div",
        { className: "dchat-listItem" },
        h("span", null, t("\u7ED3\u679C")),
        h("code", { className: "dchat-code" }, JSON.stringify(output))
      )
    ) : null
  );
}
function apply(ctx) {
  ctx.effect(
    () => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
    "dsh-chat-fixture: \u53CC\u8BED\u6587\u6848"
  );
  const t = typeof ctx.locale?.bind === "function" ? ctx.locale.bind(LOCALE_NAMESPACE) : (key) => zh[key] ?? key;
  ctx.effect(() => ctx.chatChannels.register({
    id: CHANNEL_ID,
    order: 90,
    label: () => t("\u8BD5\u7528\u6E20\u9053"),
    capabilities: { fixture: true }
  }), "dsh-chat-fixture: \u6E20\u9053\u5143\u6570\u636E");
  ctx.effect(() => ctx.slots.inject(PAGE_SLOT, () => ctx.slots.register({
    name: PAGE_SLOT,
    key: CHANNEL_ID,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ chatUi: ctx.chatUi, connection: ctx.connection, translate: t })
  }, FixturePage)), "dsh-chat-fixture: \u6E20\u9053\u8BBE\u7F6E\u9875");
}

    return module.exports;
  }
});
