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
  "\u627E\u4E0D\u5230\u8FD9\u4E2A\u673A\u5668\u4EBA": "\u627E\u4E0D\u5230\u8FD9\u4E2A\u673A\u5668\u4EBA",
  "\u5B83\u4E0D\u5728\u5F53\u524D\u6E20\u9053\u7684\u540D\u5355\u91CC\uFF08\u53EF\u80FD\u5DF2\u88AB\u79FB\u9664\uFF0C\u6216 Host \u4E0E\u9875\u9762\u7248\u672C\u4E0D\u4E00\u81F4\uFF09": "\u5B83\u4E0D\u5728\u5F53\u524D\u6E20\u9053\u7684\u540D\u5355\u91CC\uFF08\u53EF\u80FD\u5DF2\u88AB\u79FB\u9664\uFF0C\u6216 Host \u4E0E\u9875\u9762\u7248\u672C\u4E0D\u4E00\u81F4\uFF09",
  "\u5FAE\u4FE1\u6E20\u9053": "\u5FAE\u4FE1\u6E20\u9053",
  "\u5DF2\u7ED1\u5B9A\u7684\u8D26\u53F7": "\u5DF2\u7ED1\u5B9A\u7684\u8D26\u53F7",
  "\u626B\u7801\u63A5\u5165": "\u626B\u7801\u63A5\u5165",
  "\u91CD\u65B0\u8FDE\u63A5": "\u91CD\u65B0\u8FDE\u63A5",
  "\u79FB\u9664\u63A5\u5165": "\u79FB\u9664\u63A5\u5165",
  "\u786E\u8BA4\u79FB\u9664": "\u786E\u8BA4\u79FB\u9664",
  "\u53D6\u6D88": "\u53D6\u6D88",
  "\u8BFB\u53D6\u72B6\u6001": "\u8BFB\u53D6\u72B6\u6001",
  "\u8BFB\u53D6\u4E2D\u2026": "\u8BFB\u53D6\u4E2D\u2026",
  "\u6B63\u5728\u751F\u6210\u4E8C\u7EF4\u7801\u2026": "\u6B63\u5728\u751F\u6210\u4E8C\u7EF4\u7801\u2026",
  "\u7528\u624B\u673A\u5FAE\u4FE1\u626B\u63CF\u4E8C\u7EF4\u7801\u5E76\u5728\u624B\u673A\u4E0A\u786E\u8BA4\u3002": "\u7528\u624B\u673A\u5FAE\u4FE1\u626B\u63CF\u4E8C\u7EF4\u7801\u5E76\u5728\u624B\u673A\u4E0A\u786E\u8BA4\u3002",
  "\u4E8C\u7EF4\u7801\u7531\u817E\u8BAF\u5FAE\u4FE1 iLink \u670D\u52A1\u7B7E\u53D1\uFF1B\u8D26\u53F7\u51ED\u636E\u53EA\u5199\u5165\u672C\u673A Host\uFF0C\u6D4F\u89C8\u5668\u62FF\u4E0D\u5230 token\u3002": "\u4E8C\u7EF4\u7801\u7531\u817E\u8BAF\u5FAE\u4FE1 iLink \u670D\u52A1\u7B7E\u53D1\uFF1B\u8D26\u53F7\u51ED\u636E\u53EA\u5199\u5165\u672C\u673A Host\uFF0C\u6D4F\u89C8\u5668\u62FF\u4E0D\u5230 token\u3002",
  "\u7B49\u5F85\u626B\u7801": "\u7B49\u5F85\u626B\u7801",
  "\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4": "\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4",
  "\u9700\u8981\u914D\u5BF9\u7801\uFF0C\u8BF7\u5728\u4E0B\u65B9\u8F93\u5165\u624B\u673A\u4E0A\u663E\u793A\u7684\u914D\u5BF9\u7801": "\u9700\u8981\u914D\u5BF9\u7801\uFF0C\u8BF7\u5728\u4E0B\u65B9\u8F93\u5165\u624B\u673A\u4E0A\u663E\u793A\u7684\u914D\u5BF9\u7801",
  "\u63D0\u4EA4\u914D\u5BF9\u7801": "\u63D0\u4EA4\u914D\u5BF9\u7801",
  "\u4E8C\u7EF4\u7801\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210": "\u4E8C\u7EF4\u7801\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210",
  "\u8BE5\u5FAE\u4FE1\u8D26\u53F7\u5DF2\u5728\u522B\u5904\u7ED1\u5B9A": "\u8BE5\u5FAE\u4FE1\u8D26\u53F7\u5DF2\u5728\u522B\u5904\u7ED1\u5B9A",
  "\u5DF2\u63A5\u5165\uFF0C\u6B63\u5728\u542F\u52A8\u957F\u8F6E\u8BE2\u2026": "\u5DF2\u63A5\u5165\uFF0C\u6B63\u5728\u542F\u52A8\u957F\u8F6E\u8BE2\u2026",
  "\u91CD\u65B0\u751F\u6210\u4E8C\u7EF4\u7801": "\u91CD\u65B0\u751F\u6210\u4E8C\u7EF4\u7801",
  "\u6CA1\u6709\u5DF2\u7ED1\u5B9A\u7684\u5FAE\u4FE1\u8D26\u53F7": "\u6CA1\u6709\u5DF2\u7ED1\u5B9A\u7684\u5FAE\u4FE1\u8D26\u53F7",
  "\u672C\u673A\u8FD8\u6CA1\u6709\u5FAE\u4FE1\u8D26\u53F7\u3002\u70B9\u4E0A\u65B9\u300C\u626B\u7801\u63A5\u5165\u300D\u7528\u624B\u673A\u5FAE\u4FE1\u626B\u7801\u7ED1\u5B9A\u3002": "\u672C\u673A\u8FD8\u6CA1\u6709\u5FAE\u4FE1\u8D26\u53F7\u3002\u70B9\u4E0A\u65B9\u300C\u626B\u7801\u63A5\u5165\u300D\u7528\u624B\u673A\u5FAE\u4FE1\u626B\u7801\u7ED1\u5B9A\u3002",
  "\u5DF2\u5904\u7406\u6D88\u606F": "\u5DF2\u5904\u7406\u6D88\u606F",
  "\u72B6\u6001": "\u72B6\u6001",
  "\u542F\u52A8\u4E2D": "\u542F\u52A8\u4E2D",
  "\u8FD0\u884C\u6B63\u5E38": "\u8FD0\u884C\u6B63\u5E38",
  "\u91CD\u8FDE\u4E2D": "\u91CD\u8FDE\u4E2D",
  "\u542F\u52A8\u5931\u8D25": "\u542F\u52A8\u5931\u8D25",
  "\u5DF2\u505C\u6B62": "\u5DF2\u505C\u6B62",
  "\u4EC5\u79C1\u804A": "\u4EC5\u79C1\u804A",
  // hub 的共享组件（上下文增强编辑器）用本渠道的 t 取文案，因此这些键必须在渠道字典里。
  "\u4FDD\u5B58": "\u4FDD\u5B58",
  "\u4FDD\u5B58\u4E2D\u2026": "\u4FDD\u5B58\u4E2D\u2026",
  "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002": "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002"
};
var en = {
  "\u5FAE\u4FE1": "WeChat",
  "\u627E\u4E0D\u5230\u8FD9\u4E2A\u673A\u5668\u4EBA": "Bot not found",
  "\u5B83\u4E0D\u5728\u5F53\u524D\u6E20\u9053\u7684\u540D\u5355\u91CC\uFF08\u53EF\u80FD\u5DF2\u88AB\u79FB\u9664\uFF0C\u6216 Host \u4E0E\u9875\u9762\u7248\u672C\u4E0D\u4E00\u81F4\uFF09": "It is not in this channel's bot list (it may have been removed, or the Host and the page are on different versions)",
  "\u5FAE\u4FE1\u6E20\u9053": "WeChat channel",
  "\u5DF2\u7ED1\u5B9A\u7684\u8D26\u53F7": "Linked accounts",
  "\u626B\u7801\u63A5\u5165": "Scan to link",
  "\u91CD\u65B0\u8FDE\u63A5": "Reconnect",
  "\u79FB\u9664\u63A5\u5165": "Remove",
  "\u786E\u8BA4\u79FB\u9664": "Confirm removal",
  "\u53D6\u6D88": "Cancel",
  "\u8BFB\u53D6\u72B6\u6001": "Reload",
  "\u8BFB\u53D6\u4E2D\u2026": "Loading\u2026",
  "\u6B63\u5728\u751F\u6210\u4E8C\u7EF4\u7801\u2026": "Requesting a QR code\u2026",
  "\u7528\u624B\u673A\u5FAE\u4FE1\u626B\u63CF\u4E8C\u7EF4\u7801\u5E76\u5728\u624B\u673A\u4E0A\u786E\u8BA4\u3002": "Scan the QR code with WeChat on your phone and confirm there.",
  "\u4E8C\u7EF4\u7801\u7531\u817E\u8BAF\u5FAE\u4FE1 iLink \u670D\u52A1\u7B7E\u53D1\uFF1B\u8D26\u53F7\u51ED\u636E\u53EA\u5199\u5165\u672C\u673A Host\uFF0C\u6D4F\u89C8\u5668\u62FF\u4E0D\u5230 token\u3002": "The QR code is issued by Tencent iLink; credentials are written on the Host only.",
  "\u7B49\u5F85\u626B\u7801": "Waiting for a scan",
  "\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4": "Scanned \u2014 confirm on your phone",
  "\u9700\u8981\u914D\u5BF9\u7801\uFF0C\u8BF7\u5728\u4E0B\u65B9\u8F93\u5165\u624B\u673A\u4E0A\u663E\u793A\u7684\u914D\u5BF9\u7801": "A pairing code is required; enter the code shown on your phone",
  "\u63D0\u4EA4\u914D\u5BF9\u7801": "Submit code",
  "\u4E8C\u7EF4\u7801\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210": "The QR code expired; generate a new one",
  "\u8BE5\u5FAE\u4FE1\u8D26\u53F7\u5DF2\u5728\u522B\u5904\u7ED1\u5B9A": "This WeChat account is already linked elsewhere",
  "\u5DF2\u63A5\u5165\uFF0C\u6B63\u5728\u542F\u52A8\u957F\u8F6E\u8BE2\u2026": "Linked \u2014 starting the message connection\u2026",
  "\u91CD\u65B0\u751F\u6210\u4E8C\u7EF4\u7801": "Generate a new QR code",
  "\u6CA1\u6709\u5DF2\u7ED1\u5B9A\u7684\u5FAE\u4FE1\u8D26\u53F7": "No WeChat account linked",
  "\u672C\u673A\u8FD8\u6CA1\u6709\u5FAE\u4FE1\u8D26\u53F7\u3002\u70B9\u4E0A\u65B9\u300C\u626B\u7801\u63A5\u5165\u300D\u7528\u624B\u673A\u5FAE\u4FE1\u626B\u7801\u7ED1\u5B9A\u3002": "No WeChat account on this Host yet. Use \u201CScan to link\u201D above.",
  "\u5DF2\u5904\u7406\u6D88\u606F": "Messages handled",
  "\u72B6\u6001": "State",
  "\u542F\u52A8\u4E2D": "Starting",
  "\u8FD0\u884C\u6B63\u5E38": "Connected",
  "\u91CD\u8FDE\u4E2D": "Reconnecting",
  "\u542F\u52A8\u5931\u8D25": "Failed",
  "\u5DF2\u505C\u6B62": "Stopped",
  "\u4EC5\u79C1\u804A": "Direct messages only",
  "\u4FDD\u5B58": "Save",
  "\u4FDD\u5B58\u4E2D\u2026": "Saving\u2026",
  "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002": "Could not save. Try again."
};
var h = React.createElement;
var STATE_TEXT = {
  starting: "\u542F\u52A8\u4E2D",
  running: "\u8FD0\u884C\u6B63\u5E38",
  reconnecting: "\u91CD\u8FDE\u4E2D",
  failed: "\u542F\u52A8\u5931\u8D25",
  stopped: "\u5DF2\u505C\u6B62"
};
var STATUS_TEXT = {
  wait: "\u7B49\u5F85\u626B\u7801",
  scaned: "\u5DF2\u626B\u7801\uFF0C\u8BF7\u5728\u624B\u673A\u4E0A\u786E\u8BA4",
  need_verifycode: "\u9700\u8981\u914D\u5BF9\u7801\uFF0C\u8BF7\u5728\u4E0B\u65B9\u8F93\u5165\u624B\u673A\u4E0A\u663E\u793A\u7684\u914D\u5BF9\u7801",
  expired: "\u4E8C\u7EF4\u7801\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210",
  verify_code_blocked: "\u4E8C\u7EF4\u7801\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210",
  binded_redirect: "\u8BE5\u5FAE\u4FE1\u8D26\u53F7\u5DF2\u5728\u522B\u5904\u7ED1\u5B9A",
  connected: "\u5DF2\u63A5\u5165\uFF0C\u6B63\u5728\u542F\u52A8\u957F\u8F6E\u8BE2\u2026"
};
function QrLogin({ chatUi, connection, translate, onDone }) {
  const t = typeof translate === "function" ? translate : (key) => key;
  const [state, setState] = React.useState({ phase: "idle" });
  const [verifyCode, setVerifyCode] = React.useState("");
  const aliveRef = React.useRef(true);
  React.useEffect(() => () => {
    aliveRef.current = false;
  }, []);
  const begin = React.useCallback(async () => {
    setState({ phase: "starting" });
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, "login.begin", {});
      const value = chatUi.unwrapRpc(result);
      if (!aliveRef.current) return;
      setState({ phase: "waiting", attemptId: value.attemptId, qrcodeUrl: value.qrcodeUrl, status: "wait" });
    } catch (error) {
      if (aliveRef.current) setState({ phase: "error", error });
    }
  }, [chatUi, connection]);
  React.useEffect(() => {
    if (state.phase !== "waiting" || !state.attemptId) return void 0;
    let stopped = false;
    const tick = async () => {
      try {
        const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, "login.poll", {
          attemptId: state.attemptId,
          ...verifyCode ? { verifyCode } : {}
        });
        const value = chatUi.unwrapRpc(result);
        if (stopped || !aliveRef.current) return;
        if (value.status === "connected") {
          setState({ phase: "done" });
          onDone?.();
          return;
        }
        setState((current) => ({ ...current, status: value.status }));
        if (value.status === "expired" || value.status === "verify_code_blocked") return;
      } catch (error) {
        if (!stopped && aliveRef.current) setState((current) => ({ ...current, error }));
        return;
      }
      if (!stopped) timer = setTimeout(tick, 2e3);
    };
    let timer = setTimeout(tick, 500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [state.phase, state.attemptId, verifyCode, chatUi, connection, onDone]);
  const { Panel } = chatUi.components;
  if (state.phase === "idle") {
    return h(Panel, {
      title: t("\u626B\u7801\u63A5\u5165"),
      description: t("\u4E8C\u7EF4\u7801\u7531\u817E\u8BAF\u5FAE\u4FE1 iLink \u670D\u52A1\u7B7E\u53D1\uFF1B\u8D26\u53F7\u51ED\u636E\u53EA\u5199\u5165\u672C\u673A Host\uFF0C\u6D4F\u89C8\u5668\u62FF\u4E0D\u5230 token\u3002"),
      actions: h("button", {
        type: "button",
        className: "dchat-button dchat-buttonPrimary",
        onClick: () => {
          void begin();
        }
      }, t("\u626B\u7801\u63A5\u5165"))
    });
  }
  if (state.phase === "starting") {
    return h(Panel, { title: t("\u626B\u7801\u63A5\u5165"), description: t("\u6B63\u5728\u751F\u6210\u4E8C\u7EF4\u7801\u2026") });
  }
  if (state.phase === "done") {
    return h(Panel, { title: t("\u626B\u7801\u63A5\u5165"), description: t("\u5DF2\u63A5\u5165\uFF0C\u6B63\u5728\u542F\u52A8\u957F\u8F6E\u8BE2\u2026") });
  }
  if (state.phase === "error") {
    return h(Panel, {
      title: t("\u626B\u7801\u63A5\u5165"),
      actions: h("button", {
        type: "button",
        className: "dchat-button",
        onClick: () => {
          void begin();
        }
      }, t("\u91CD\u65B0\u751F\u6210\u4E8C\u7EF4\u7801"))
    }, h("p", { className: "dchat-error", role: "alert" }, state.error?.message ?? "\u53D1\u8D77\u626B\u7801\u5931\u8D25\u3002"));
  }
  const expired = (status) => status === "expired" || status === "verify_code_blocked";
  return h(
    Panel,
    {
      title: t("\u626B\u7801\u63A5\u5165"),
      description: t("\u7528\u624B\u673A\u5FAE\u4FE1\u626B\u63CF\u4E8C\u7EF4\u7801\u5E76\u5728\u624B\u673A\u4E0A\u786E\u8BA4\u3002"),
      actions: h("button", {
        type: "button",
        className: "dchat-button",
        onClick: () => {
          void begin();
        }
      }, t("\u91CD\u65B0\u751F\u6210\u4E8C\u7EF4\u7801"))
    },
    state.qrcodeUrl ? h("img", {
      src: state.qrcodeUrl,
      alt: t("\u626B\u7801\u63A5\u5165"),
      style: { width: 200, height: 200, imageRendering: "pixelated" }
    }) : null,
    h("p", { className: "dchat-cardDescription" }, t(STATUS_TEXT[state.status] ?? "\u7B49\u5F85\u626B\u7801")),
    state.status === "need_verifycode" ? h(
      "div",
      { className: "dchat-actions" },
      h("input", {
        type: "text",
        value: verifyCode,
        placeholder: t("\u63D0\u4EA4\u914D\u5BF9\u7801"),
        onChange: (event) => setVerifyCode(event.target.value)
      })
    ) : null,
    expired(state.status) ? h("p", { className: "dchat-error" }, t("\u4E8C\u7EF4\u7801\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210")) : null
  );
}
function AccountCard({ account, chatUi, connection, translate, onChanged }) {
  const t = typeof translate === "function" ? translate : (key) => key;
  const { Panel, StatusPill, ContextEnhancementEditor, DeliveryTargetsEditor } = chatUi.components;
  const settings = chatUi.hooks.useBotSettings({
    connection,
    channelId: CHANNEL_ID,
    botId: account.botId
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [confirming, setConfirming] = React.useState(false);
  const run = async (method, payload) => {
    setBusy(true);
    setError(null);
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, method, payload);
      return chatUi.unwrapRpc(result);
    } catch (cause) {
      setError(cause.message);
      throw cause;
    } finally {
      setBusy(false);
    }
  };
  return h(
    Panel,
    {
      title: account.botName ?? account.accountIdMasked,
      description: `${account.accountIdMasked} \xB7 ${t("\u4EC5\u79C1\u804A")}`,
      actions: h(
        "div",
        { className: "dchat-actions" },
        h(StatusPill, { status: account.state, label: t(STATE_TEXT[account.state] ?? "\u72B6\u6001") }),
        h("button", {
          type: "button",
          className: "dchat-button",
          disabled: busy,
          onClick: async () => {
            try {
              await run("account.reconnect", { botId: account.botId });
              await onChanged?.();
            } catch {
            }
          }
        }, t("\u91CD\u65B0\u8FDE\u63A5")),
        confirming ? h(
          React.Fragment,
          null,
          h("button", {
            type: "button",
            className: "dchat-button dchat-buttonDangerSolid",
            disabled: busy,
            onClick: async () => {
              try {
                await run("account.delete", { botId: account.botId, confirm: true });
                setConfirming(false);
                await onChanged?.();
              } catch {
              }
            }
          }, t("\u786E\u8BA4\u79FB\u9664")),
          h("button", {
            type: "button",
            className: "dchat-button",
            disabled: busy,
            onClick: () => setConfirming(false)
          }, t("\u53D6\u6D88"))
        ) : h("button", {
          type: "button",
          className: "dchat-button dchat-buttonDanger",
          disabled: busy,
          onClick: () => setConfirming(true)
        }, t("\u79FB\u9664\u63A5\u5165"))
      )
    },
    account.errorMessage ? h("p", { className: "dchat-error", role: "alert" }, account.errorMessage) : null,
    error ? h("p", { className: "dchat-error", role: "alert" }, error) : null,
    h(
      "div",
      { className: "dchat-list" },
      h(
        "div",
        { className: "dchat-listItem" },
        h("span", null, t("\u5DF2\u5904\u7406\u6D88\u606F")),
        h("span", null, String(account.handled ?? 0))
      )
    ),
    h(ContextEnhancementEditor, {
      config: settings.record?.contextEnhancement ?? null,
      disabled: settings.phase !== "ready",
      translate: t,
      onSave: settings.saveContextEnhancement
    }),
    // 渠道无关面板：目标清单与测试发送都由 hub 的共享组件负责。
    h(DeliveryTargetsEditor, {
      chatUi,
      connection,
      channelId: CHANNEL_ID,
      botId: account.botId
    })
  );
}
function WeixinPage(props) {
  const { chatUi, connection, translate, botId = null } = props;
  const t = typeof translate === "function" ? translate : (key) => key;
  const [state, setState] = React.useState({ phase: "idle", value: null, error: null });
  const load = React.useCallback(async () => {
    setState((current) => ({ ...current, phase: "loading" }));
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, "connection.status", {});
      setState({ phase: "ready", value: chatUi.unwrapRpc(result), error: null });
    } catch (error) {
      setState({ phase: "error", value: null, error });
    }
  }, [chatUi, connection]);
  React.useEffect(() => {
    void load();
  }, [load]);
  const { Panel, EmptyState } = chatUi.components;
  const allAccounts = state.value?.accounts ?? state.value?.bots ?? [];
  const scoped = Boolean(botId);
  const accounts = scoped ? allAccounts.filter((account) => (account?.botId ?? account?.id ?? null) === botId) : allAccounts;
  const missing = scoped && state.phase === "ready" && accounts.length === 0;
  return h(
    React.Fragment,
    null,
    scoped ? null : h(
      Panel,
      {
        title: t("\u5FAE\u4FE1\u6E20\u9053"),
        description: `dataDir\uFF1A${state.value?.dataDir ?? "\u2014"}`,
        actions: h("button", {
          type: "button",
          className: "dchat-button",
          disabled: state.phase === "loading",
          onClick: () => {
            void load();
          }
        }, state.phase === "loading" ? t("\u8BFB\u53D6\u4E2D\u2026") : t("\u8BFB\u53D6\u72B6\u6001"))
      },
      state.error ? h("p", { className: "dchat-error", role: "alert" }, state.error.message) : null,
      state.phase === "ready" && accounts.length === 0 ? h(EmptyState, {
        title: t("\u6CA1\u6709\u5DF2\u7ED1\u5B9A\u7684\u5FAE\u4FE1\u8D26\u53F7"),
        description: t("\u672C\u673A\u8FD8\u6CA1\u6709\u5FAE\u4FE1\u8D26\u53F7\u3002\u70B9\u4E0A\u65B9\u300C\u626B\u7801\u63A5\u5165\u300D\u7528\u624B\u673A\u5FAE\u4FE1\u626B\u7801\u7ED1\u5B9A\u3002")
      }) : null
    ),
    scoped && state.error ? h("p", { className: "dchat-error", role: "alert" }, state.error.message) : null,
    missing ? h(EmptyState, {
      title: t("\u627E\u4E0D\u5230\u8FD9\u4E2A\u673A\u5668\u4EBA"),
      description: `${t("\u5B83\u4E0D\u5728\u5F53\u524D\u6E20\u9053\u7684\u540D\u5355\u91CC\uFF08\u53EF\u80FD\u5DF2\u88AB\u79FB\u9664\uFF0C\u6216 Host \u4E0E\u9875\u9762\u7248\u672C\u4E0D\u4E00\u81F4\uFF09")}\uFF1A${botId}`
    }) : null,
    scoped ? null : h(QrLogin, { chatUi, connection, translate: t, onDone: load }),
    accounts.map((account) => h(AccountCard, {
      key: account.botId,
      account,
      chatUi,
      connection,
      translate: t,
      onChanged: load
    }))
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
    // 侧边栏会话行的渠道徽标（微信品牌绿）。
    // 图标（SVG 字符串）：左栏渠道卡片与侧边栏会话行徽标共用同一份，避免两处画风不一致。
    // 出处见 THIRD_PARTY_NOTICES.md。
    icon: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="#07C160" d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>' },
    sessionBadge: { text: "\u5FAE", color: "#07c160" },
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
