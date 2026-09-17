window.__ModuleLoader__.load({
  id: "dsh-chat-feishu",
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

// packages/dsh-chat-feishu/client/index.js
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var React = __toESM(require("react"), 1);
var name = "dsh-chat-feishu-client";
var inject = ["slots", "locale", "connection", "chatChannels", "chatUi"];
var CHANNEL_ID = "feishu";
var PAGE_SLOT = "chat.channel.page";
var LOCALE_NAMESPACE = "dsh-chat-feishu";
var zh = {
  "\u98DE\u4E66": "\u98DE\u4E66",
  "\u98DE\u4E66\u6E20\u9053": "\u98DE\u4E66\u6E20\u9053",
  "\u5DF2\u63A5\u5165\u7684\u673A\u5668\u4EBA": "\u5DF2\u63A5\u5165\u7684\u673A\u5668\u4EBA",
  "\u8BFB\u53D6\u72B6\u6001": "\u8BFB\u53D6\u72B6\u6001",
  "\u8BFB\u53D6\u4E2D\u2026": "\u8BFB\u53D6\u4E2D\u2026",
  "\u91CD\u65B0\u8FDE\u63A5": "\u91CD\u65B0\u8FDE\u63A5",
  "\u79FB\u9664\u63A5\u5165": "\u79FB\u9664\u63A5\u5165",
  "\u786E\u8BA4\u79FB\u9664": "\u786E\u8BA4\u79FB\u9664",
  "\u53D6\u6D88": "\u53D6\u6D88",
  "\u4EFB\u52A1\u8FC7\u7A0B\u5C55\u793A": "\u4EFB\u52A1\u8FC7\u7A0B\u5C55\u793A",
  "\u8BBE\u7F6E\u6267\u884C\u8FC7\u7A0B\u7684\u5448\u73B0\u65B9\u5F0F\uFF1B\u79C1\u804A\u4E0E\u7FA4\u804A\u5206\u522B\u751F\u6548": "\u8BBE\u7F6E\u6267\u884C\u8FC7\u7A0B\u7684\u5448\u73B0\u65B9\u5F0F\uFF1B\u79C1\u804A\u4E0E\u7FA4\u804A\u5206\u522B\u751F\u6548",
  "\u4E0D\u663E\u793A\u8FC7\u7A0B\uFF08\u53EA\u53D1\u9001\u6700\u7EC8\u7B54\u6848\uFF09": "\u4E0D\u663E\u793A\u8FC7\u7A0B\uFF08\u53EA\u53D1\u9001\u6700\u7EC8\u7B54\u6848\uFF09",
  "\u9002\u5408\u65E5\u5E38\u95EE\u7B54\uFF1A\u6267\u884C\u8FC7\u7A0B\u4E2D\u4E0D\u663E\u793A\u5DE5\u5177\u8C03\u7528\u7B49\u4E2D\u95F4\u6B65\u9AA4\uFF0C\u53EA\u56DE\u590D\u6700\u7EC8\u7ED3\u679C": "\u9002\u5408\u65E5\u5E38\u95EE\u7B54\uFF1A\u6267\u884C\u8FC7\u7A0B\u4E2D\u4E0D\u663E\u793A\u5DE5\u5177\u8C03\u7528\u7B49\u4E2D\u95F4\u6B65\u9AA4\uFF0C\u53EA\u56DE\u590D\u6700\u7EC8\u7ED3\u679C",
  "\u5B9E\u65F6\u8FC7\u7A0B\u5361\uFF08\u5168\u7A0B\u4E00\u5F20\u5361\u7247\u52A8\u6001\u66F4\u65B0\uFF09": "\u5B9E\u65F6\u8FC7\u7A0B\u5361\uFF08\u5168\u7A0B\u4E00\u5F20\u5361\u7247\u52A8\u6001\u66F4\u65B0\uFF09",
  "\u63A8\u8350\u957F\u4EFB\u52A1\u4F7F\u7528\uFF1A\u8FC7\u7A0B\u4E0E\u6700\u7EC8\u7B54\u6848\u90FD\u5728\u540C\u4E00\u5F20\u5361\u7247\u91CC\u5B9E\u65F6\u66F4\u65B0\uFF0C\u4E0D\u5237\u5C4F": "\u63A8\u8350\u957F\u4EFB\u52A1\u4F7F\u7528\uFF1A\u8FC7\u7A0B\u4E0E\u6700\u7EC8\u7B54\u6848\u90FD\u5728\u540C\u4E00\u5F20\u5361\u7247\u91CC\u5B9E\u65F6\u66F4\u65B0\uFF0C\u4E0D\u5237\u5C4F",
  "\u9010\u6B65\u76F4\u64AD\uFF08\u6BCF\u4E00\u6B65\u5355\u72EC\u53D1\u4E00\u6761\u6D88\u606F\uFF09": "\u9010\u6B65\u76F4\u64AD\uFF08\u6BCF\u4E00\u6B65\u5355\u72EC\u53D1\u4E00\u6761\u6D88\u606F\uFF09",
  "\u6BCF\u4E00\u6B65\u90FD\u5355\u72EC\u53D1\u4E00\u6761\u6D88\u606F\uFF08\u542B\u5DE5\u5177\u8C03\u7528\uFF09\uFF1B\u957F\u4EFB\u52A1\u4F1A\u8FDE\u7EED\u53D1\u9001\u8F83\u591A\u6D88\u606F": "\u6BCF\u4E00\u6B65\u90FD\u5355\u72EC\u53D1\u4E00\u6761\u6D88\u606F\uFF08\u542B\u5DE5\u5177\u8C03\u7528\uFF09\uFF1B\u957F\u4EFB\u52A1\u4F1A\u8FDE\u7EED\u53D1\u9001\u8F83\u591A\u6D88\u606F",
  "\u673A\u5668\u4EBA\u4E0E DeepSeek Harness \u7684\u8FDE\u63A5\u72B6\u6001": "\u673A\u5668\u4EBA\u4E0E DeepSeek Harness \u7684\u8FDE\u63A5\u72B6\u6001",
  "\u5DF2\u5904\u7406\u6D88\u606F": "\u5DF2\u5904\u7406\u6D88\u606F",
  "\u6CA1\u6709\u5DF2\u63A5\u5165\u7684\u98DE\u4E66\u673A\u5668\u4EBA": "\u6CA1\u6709\u5DF2\u63A5\u5165\u7684\u98DE\u4E66\u673A\u5668\u4EBA",
  "\u672C\u673A\u8FD8\u6CA1\u6709\u98DE\u4E66\u673A\u5668\u4EBA\u914D\u7F6E\u3002": "\u672C\u673A\u8FD8\u6CA1\u6709\u98DE\u4E66\u673A\u5668\u4EBA\u914D\u7F6E\u3002",
  "\u72B6\u6001": "\u72B6\u6001",
  "\u542F\u52A8\u4E2D": "\u542F\u52A8\u4E2D",
  "\u8FD0\u884C\u6B63\u5E38": "\u8FD0\u884C\u6B63\u5E38",
  "\u542F\u52A8\u5931\u8D25": "\u542F\u52A8\u5931\u8D25",
  "\u5DF2\u505C\u6B62": "\u5DF2\u505C\u6B62",
  "\u6B63\u5728\u8FD0\u884C": "\u6B63\u5728\u8FD0\u884C"
};
var en = {
  "\u98DE\u4E66": "Feishu",
  "\u98DE\u4E66\u6E20\u9053": "Feishu channel",
  "\u5DF2\u63A5\u5165\u7684\u673A\u5668\u4EBA": "Connected bots",
  "\u8BFB\u53D6\u72B6\u6001": "Reload",
  "\u8BFB\u53D6\u4E2D\u2026": "Loading\u2026",
  "\u91CD\u65B0\u8FDE\u63A5": "Reconnect",
  "\u79FB\u9664\u63A5\u5165": "Remove",
  "\u786E\u8BA4\u79FB\u9664": "Confirm removal",
  "\u53D6\u6D88": "Cancel",
  "\u4EFB\u52A1\u8FC7\u7A0B\u5C55\u793A": "Task progress display",
  "\u8BBE\u7F6E\u6267\u884C\u8FC7\u7A0B\u7684\u5448\u73B0\u65B9\u5F0F\uFF1B\u79C1\u804A\u4E0E\u7FA4\u804A\u5206\u522B\u751F\u6548": "Choose how the execution is presented; direct and group chats are configured separately",
  "\u4E0D\u663E\u793A\u8FC7\u7A0B\uFF08\u53EA\u53D1\u9001\u6700\u7EC8\u7B54\u6848\uFF09": "Hide the process (final answer only)",
  "\u9002\u5408\u65E5\u5E38\u95EE\u7B54\uFF1A\u6267\u884C\u8FC7\u7A0B\u4E2D\u4E0D\u663E\u793A\u5DE5\u5177\u8C03\u7528\u7B49\u4E2D\u95F4\u6B65\u9AA4\uFF0C\u53EA\u56DE\u590D\u6700\u7EC8\u7ED3\u679C": "For everyday Q&A: interim steps stay hidden and only the final result is sent",
  "\u5B9E\u65F6\u8FC7\u7A0B\u5361\uFF08\u5168\u7A0B\u4E00\u5F20\u5361\u7247\u52A8\u6001\u66F4\u65B0\uFF09": "Live process card (one card updated throughout)",
  "\u63A8\u8350\u957F\u4EFB\u52A1\u4F7F\u7528\uFF1A\u8FC7\u7A0B\u4E0E\u6700\u7EC8\u7B54\u6848\u90FD\u5728\u540C\u4E00\u5F20\u5361\u7247\u91CC\u5B9E\u65F6\u66F4\u65B0\uFF0C\u4E0D\u5237\u5C4F": "Recommended for long tasks: process and answer update in one card without flooding the chat",
  "\u9010\u6B65\u76F4\u64AD\uFF08\u6BCF\u4E00\u6B65\u5355\u72EC\u53D1\u4E00\u6761\u6D88\u606F\uFF09": "Step-by-step feed (one message per step)",
  "\u6BCF\u4E00\u6B65\u90FD\u5355\u72EC\u53D1\u4E00\u6761\u6D88\u606F\uFF08\u542B\u5DE5\u5177\u8C03\u7528\uFF09\uFF1B\u957F\u4EFB\u52A1\u4F1A\u8FDE\u7EED\u53D1\u9001\u8F83\u591A\u6D88\u606F": "Every step is its own message; long tasks send many messages",
  "\u673A\u5668\u4EBA\u4E0E DeepSeek Harness \u7684\u8FDE\u63A5\u72B6\u6001": "Connection state between the bot and DeepSeek Harness",
  "\u5DF2\u5904\u7406\u6D88\u606F": "Messages handled",
  "\u6CA1\u6709\u5DF2\u63A5\u5165\u7684\u98DE\u4E66\u673A\u5668\u4EBA": "No Feishu bot connected",
  "\u672C\u673A\u8FD8\u6CA1\u6709\u98DE\u4E66\u673A\u5668\u4EBA\u914D\u7F6E\u3002": "This Host has no Feishu bot configured yet.",
  "\u72B6\u6001": "State",
  "\u542F\u52A8\u4E2D": "Starting",
  "\u8FD0\u884C\u6B63\u5E38": "Connected",
  "\u542F\u52A8\u5931\u8D25": "Failed",
  "\u5DF2\u505C\u6B62": "Stopped",
  "\u6B63\u5728\u8FD0\u884C": "Running"
};
var h = React.createElement;
var STATE_TEXT = {
  starting: "\u542F\u52A8\u4E2D",
  running: "\u8FD0\u884C\u6B63\u5E38",
  failed: "\u542F\u52A8\u5931\u8D25",
  stopped: "\u5DF2\u505C\u6B62"
};
var STEP_PUSH_OPTIONS = [
  {
    value: "off",
    label: "\u4E0D\u663E\u793A\u8FC7\u7A0B\uFF08\u53EA\u53D1\u9001\u6700\u7EC8\u7B54\u6848\uFF09",
    help: "\u9002\u5408\u65E5\u5E38\u95EE\u7B54\uFF1A\u6267\u884C\u8FC7\u7A0B\u4E2D\u4E0D\u663E\u793A\u5DE5\u5177\u8C03\u7528\u7B49\u4E2D\u95F4\u6B65\u9AA4\uFF0C\u53EA\u56DE\u590D\u6700\u7EC8\u7ED3\u679C"
  },
  {
    value: "streaming_card",
    label: "\u5B9E\u65F6\u8FC7\u7A0B\u5361\uFF08\u5168\u7A0B\u4E00\u5F20\u5361\u7247\u52A8\u6001\u66F4\u65B0\uFF09",
    help: "\u63A8\u8350\u957F\u4EFB\u52A1\u4F7F\u7528\uFF1A\u8FC7\u7A0B\u4E0E\u6700\u7EC8\u7B54\u6848\u90FD\u5728\u540C\u4E00\u5F20\u5361\u7247\u91CC\u5B9E\u65F6\u66F4\u65B0\uFF0C\u4E0D\u5237\u5C4F"
  },
  {
    value: "post",
    label: "\u9010\u6B65\u76F4\u64AD\uFF08\u6BCF\u4E00\u6B65\u5355\u72EC\u53D1\u4E00\u6761\u6D88\u606F\uFF09",
    help: "\u6BCF\u4E00\u6B65\u90FD\u5355\u72EC\u53D1\u4E00\u6761\u6D88\u606F\uFF08\u542B\u5DE5\u5177\u8C03\u7528\uFF09\uFF1B\u957F\u4EFB\u52A1\u4F1A\u8FDE\u7EED\u53D1\u9001\u8F83\u591A\u6D88\u606F"
  }
];
function BotCard({ bot, status, chatUi, connection, translate, onChanged }) {
  const t = typeof translate === "function" ? translate : (key) => key;
  const { Panel, StatusPill, ScopedModeEditor, ContextEnhancementEditor } = chatUi.components;
  const settings = chatUi.hooks.useBotSettings({
    connection,
    channelId: CHANNEL_ID,
    botId: bot.id
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
  const tone = status.state === "running" ? "success" : status.state === "failed" ? "error" : "warning";
  return h(
    Panel,
    {
      title: bot.name ?? bot.id,
      description: `${bot.appIdMasked} \xB7 ${t("\u673A\u5668\u4EBA\u4E0E DeepSeek Harness \u7684\u8FDE\u63A5\u72B6\u6001")}`,
      actions: h(
        "div",
        { className: "dchat-actions" },
        h(StatusPill, { status: status.state, label: t(STATE_TEXT[status.state] ?? "\u72B6\u6001") }),
        h("button", {
          type: "button",
          className: "dchat-button",
          disabled: busy,
          onClick: async () => {
            try {
              await run("bot.reconnect", { botId: bot.id });
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
            className: "dchat-button",
            disabled: busy,
            onClick: async () => {
              try {
                await run("bot.delete", { botId: bot.id, confirm: true });
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
          className: "dchat-button",
          disabled: busy,
          onClick: () => setConfirming(true)
        }, t("\u79FB\u9664\u63A5\u5165"))
      )
    },
    status.errorMessage ? h("p", { className: "dchat-error", role: "alert" }, status.errorMessage) : null,
    error ? h("p", { className: "dchat-error", role: "alert" }, error) : null,
    h(
      "div",
      { className: "dchat-list" },
      h(
        "div",
        { className: "dchat-listItem" },
        h("span", null, t("\u5DF2\u5904\u7406\u6D88\u606F")),
        h("span", null, String(status.handled ?? 0))
      )
    ),
    h(ScopedModeEditor, {
      title: t("\u4EFB\u52A1\u8FC7\u7A0B\u5C55\u793A"),
      description: t("\u8BBE\u7F6E\u6267\u884C\u8FC7\u7A0B\u7684\u5448\u73B0\u65B9\u5F0F\uFF1B\u79C1\u804A\u4E0E\u7FA4\u804A\u5206\u522B\u751F\u6548"),
      scopes: [{ key: "direct", label: "\u79C1\u804A" }, { key: "group", label: "\u7FA4\u804A" }],
      options: STEP_PUSH_OPTIONS,
      value: status.stepPush,
      translate: t,
      onSave: async (next) => {
        await run("bot.step-push.set", { botId: bot.id, stepPush: next });
        await onChanged?.();
      }
    }),
    h(ContextEnhancementEditor, {
      config: settings.record?.contextEnhancement ?? null,
      disabled: settings.phase !== "ready",
      translate: t,
      onSave: settings.saveContextEnhancement
    })
  );
}
function FeishuPage(props) {
  const { chatUi, connection, translate } = props;
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
  const bots = state.value?.bots ?? [];
  return h(
    React.Fragment,
    null,
    h(
      Panel,
      {
        title: t("\u98DE\u4E66\u6E20\u9053"),
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
      state.phase === "ready" && bots.length === 0 ? h(EmptyState, {
        title: t("\u6CA1\u6709\u5DF2\u63A5\u5165\u7684\u98DE\u4E66\u673A\u5668\u4EBA"),
        description: t("\u672C\u673A\u8FD8\u6CA1\u6709\u98DE\u4E66\u673A\u5668\u4EBA\u914D\u7F6E\u3002")
      }) : null
    ),
    bots.map((bot) => h(BotCard, {
      key: bot.id,
      bot,
      status: bot,
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
    "dsh-chat-feishu: \u53CC\u8BED\u6587\u6848"
  );
  const t = typeof ctx.locale?.bind === "function" ? ctx.locale.bind(LOCALE_NAMESPACE) : (key) => zh[key] ?? key;
  ctx.effect(() => ctx.chatChannels.register({
    id: CHANNEL_ID,
    order: 20,
    label: () => t("\u98DE\u4E66"),
    capabilities: { groups: true }
  }), "dsh-chat-feishu: \u6E20\u9053\u5143\u6570\u636E");
  ctx.effect(() => ctx.slots.inject(PAGE_SLOT, () => ctx.slots.register({
    name: PAGE_SLOT,
    key: CHANNEL_ID,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ chatUi: ctx.chatUi, connection: ctx.connection, translate: t })
  }, FeishuPage)), "dsh-chat-feishu: \u6E20\u9053\u8BBE\u7F6E\u9875");
}

    return module.exports;
  }
});
