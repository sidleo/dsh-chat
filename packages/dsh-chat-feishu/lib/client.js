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
  "\u6B63\u5728\u8FD0\u884C": "\u6B63\u5728\u8FD0\u884C",
  // hub 的共享组件（上下文增强编辑器）用本渠道的 t 取文案，因此这些键必须在渠道字典里。
  "\u4FDD\u5B58": "\u4FDD\u5B58",
  "\u4FDD\u5B58\u4E2D\u2026": "\u4FDD\u5B58\u4E2D\u2026",
  "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002": "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  "\u6700\u8FD1\u4E00\u6B21\u9519\u8BEF": "\u6700\u8FD1\u4E00\u6B21\u9519\u8BEF"
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
  "\u6B63\u5728\u8FD0\u884C": "Running",
  "\u4FDD\u5B58": "Save",
  "\u4FDD\u5B58\u4E2D\u2026": "Saving\u2026",
  "\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002": "Could not save. Try again.",
  "\u6700\u8FD1\u4E00\u6B21\u9519\u8BEF": "Last error"
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
  const {
    Panel,
    StatusPill,
    ScopedModeEditor,
    ContextEnhancementEditor,
    DeliveryTargetsEditor
  } = chatUi.components;
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
    // 处理最近一条消息失败时留下的现场（与终端日志对应）。
    status.lastError ? h(
      "p",
      { className: "dchat-error", role: "alert" },
      `${t("\u6700\u8FD1\u4E00\u6B21\u9519\u8BEF")}\uFF1A${status.lastError}`
    ) : null,
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
    }),
    // 渠道无关面板：目标清单与测试发送都由 hub 的共享组件负责。
    h(DeliveryTargetsEditor, {
      chatUi,
      connection,
      channelId: CHANNEL_ID,
      botId: bot.id
    })
  );
}
function FeishuPage(props) {
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
  const allBots = state.value?.bots ?? [];
  const bots = botId ? allBots.filter((bot) => bot.botId === botId || bot.id === botId) : allBots;
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
    // 侧边栏会话行的渠道徽标（飞书品牌蓝）。
    // 图标：从**飞书官网** favicon.ico 提取的官方标志（48×48 PNG，data URI）。
    // 不要用上游 dsh-im 的自绘图形——它跟官方标志有差异。出处见 THIRD_PARTY_NOTICES.md。
    icon: { uri: "data:image/png;base64,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" },
    sessionBadge: { text: "\u98DE", color: "#3370ff" },
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
