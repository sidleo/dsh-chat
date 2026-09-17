window.__ModuleLoader__.load({
  id: "dsh-chat-weixin",
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

// packages/dsh-chat-weixin/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var React = __toESM(require("react"), 1);
var name = "dsh-chat-weixin-client";
var inject = ["slots", "locale", "connection", "chatChannels", "chatUi"];
var CHANNEL_ID = "weixin";
var PAGE_SLOT = "chat.channel.page";
var LOCALE_NAMESPACE = "dsh-chat-weixin";
var zh = {
  "\u5FAE\u4FE1": "\u5FAE\u4FE1",
  "\u5FAE\u4FE1\u6E20\u9053": "\u5FAE\u4FE1\u6E20\u9053",
  "\u6E20\u9053\u63D2\u4EF6\u5DF2\u52A0\u8F7D\uFF0CiLink \u534F\u8BAE\u5B9E\u73B0\u5C06\u5728 P3 \u63D0\u4F9B\uFF08\u5F53\u524D\u4EC5\u79C1\u804A\uFF09\u3002": "\u6E20\u9053\u63D2\u4EF6\u5DF2\u52A0\u8F7D\uFF0CiLink \u534F\u8BAE\u5B9E\u73B0\u5C06\u5728 P3 \u63D0\u4F9B\uFF08\u5F53\u524D\u4EC5\u79C1\u804A\uFF09\u3002",
  "\u8BFB\u53D6\u72B6\u6001": "\u8BFB\u53D6\u72B6\u6001",
  "\u8BFB\u53D6\u4E2D\u2026": "\u8BFB\u53D6\u4E2D\u2026",
  "\u72B6\u6001": "\u72B6\u6001"
};
var en = {
  "\u5FAE\u4FE1": "WeChat",
  "\u5FAE\u4FE1\u6E20\u9053": "WeChat channel",
  "\u6E20\u9053\u63D2\u4EF6\u5DF2\u52A0\u8F7D\uFF0CiLink \u534F\u8BAE\u5B9E\u73B0\u5C06\u5728 P3 \u63D0\u4F9B\uFF08\u5F53\u524D\u4EC5\u79C1\u804A\uFF09\u3002": "Channel plugin loaded; iLink protocol lands in P3 (direct messages only).",
  "\u8BFB\u53D6\u72B6\u6001": "Load status",
  "\u8BFB\u53D6\u4E2D\u2026": "Loading\u2026",
  "\u72B6\u6001": "Status"
};
var h = React.createElement;
function WeixinPage(props) {
  const { chatUi, connection, translate } = props;
  const t = typeof translate === "function" ? translate : (key) => key;
  const [state, setState] = React.useState({ phase: "idle", value: null, error: null });
  const load = React.useCallback(async () => {
    setState({ phase: "loading", value: null, error: null });
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, "connection.status", {});
      setState({ phase: "done", value: chatUi.unwrapRpc(result), error: null });
    } catch (error) {
      setState({ phase: "error", value: null, error });
    }
  }, [chatUi, connection]);
  const { Panel, StatusPill } = chatUi.components;
  return h(
    Panel,
    {
      title: t("\u5FAE\u4FE1\u6E20\u9053"),
      description: t("\u6E20\u9053\u63D2\u4EF6\u5DF2\u52A0\u8F7D\uFF0CiLink \u534F\u8BAE\u5B9E\u73B0\u5C06\u5728 P3 \u63D0\u4F9B\uFF08\u5F53\u524D\u4EC5\u79C1\u804A\uFF09\u3002"),
      actions: h("button", {
        type: "button",
        className: "dchat-button",
        disabled: state.phase === "loading",
        onClick: load
      }, state.phase === "loading" ? t("\u8BFB\u53D6\u4E2D\u2026") : t("\u8BFB\u53D6\u72B6\u6001"))
    },
    state.phase === "idle" ? null : h(
      "div",
      { className: "dchat-list" },
      h(
        "div",
        { className: "dchat-listItem" },
        h("span", null, t("\u72B6\u6001")),
        state.error ? h(StatusPill, { status: "failed", label: state.error.message }) : h(StatusPill, {
          status: state.value?.phase === "skeleton" ? "starting" : "running",
          label: state.value?.phase ?? "ok"
        })
      ),
      state.value ? h(
        "div",
        { className: "dchat-listItem" },
        h("span", null, "dataDir"),
        h("code", { className: "dchat-code" }, state.value.dataDir ?? "\u2014")
      ) : null
    )
  );
}
function apply(ctx) {
  ctx.effect(
    () => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
    "dsh-chat-weixin: \u53CC\u8BED\u6587\u6848"
  );
  const t = typeof ctx.locale?.bind === "function" ? ctx.locale.bind(LOCALE_NAMESPACE) : (key) => zh[key] ?? key;
  ctx.effect(() => ctx.chatChannels.register({
    id: CHANNEL_ID,
    order: 10,
    label: () => t("\u5FAE\u4FE1"),
    capabilities: { groups: false, note: t("\u4EC5\u79C1\u804A") }
  }), "dsh-chat-weixin: \u6E20\u9053\u5143\u6570\u636E");
  ctx.effect(() => ctx.slots.inject(PAGE_SLOT, () => ctx.slots.register({
    name: PAGE_SLOT,
    key: CHANNEL_ID,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ chatUi: ctx.chatUi, connection: ctx.connection, translate: t })
  }, WeixinPage)), "dsh-chat-weixin: \u6E20\u9053\u8BBE\u7F6E\u9875");
}

    return module.exports;
  }
});
