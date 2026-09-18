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
  "\u5173\u95ED": "\u5173\u95ED",
  "\u5220\u9664": "\u5220\u9664",
  "\u542F\u7528": "\u542F\u7528",
  "\u586B\u5165\u793A\u4F8B": "\u586B\u5165\u793A\u4F8B",
  "\u5907\u6CE8\u540D\uFF08\u53EF\u9009\uFF09": "\u5907\u6CE8\u540D\uFF08\u53EF\u9009\uFF09",
  "\u5F20\u4E09": "\u5F20\u4E09",
  "\u65B0\u589E": "\u65B0\u589E",
  "\u6765\u6E90\u5B57\u6BB5": "\u6765\u6E90\u5B57\u6BB5",
  "\u6E05\u7A7A": "\u6E05\u7A7A",
  "\u8FD8\u6CA1\u6709\u6307\u5B9A\u8BBE\u7F6E\u3002": "\u8FD8\u6CA1\u6709\u6307\u5B9A\u8BBE\u7F6E\u3002",
  "\u4E0A\u4E0B\u6587\u589E\u5F3A": "\u4E0A\u4E0B\u6587\u589E\u5F3A",
  "\u4E0A\u4E0B\u6587\u589E\u5F3A\u8303\u56F4": "\u4E0A\u4E0B\u6587\u589E\u5F3A\u8303\u56F4",
  "\u53E0\u52A0\u5168\u5C40\u63D0\u793A\u8BCD\uFF08\u4E0D\u52FE\u9009\u5219\u53EA\u4F7F\u7528\u4E0A\u9762\u7684\u4E13\u5C5E\u63D0\u793A\u8BCD\uFF09": "\u53E0\u52A0\u5168\u5C40\u63D0\u793A\u8BCD\uFF08\u4E0D\u52FE\u9009\u5219\u53EA\u4F7F\u7528\u4E0A\u9762\u7684\u4E13\u5C5E\u63D0\u793A\u8BCD\uFF09",
  "\u544A\u8BC9\u6A21\u578B\u5982\u4F55\u4F7F\u7528\u6765\u6E90\u5B57\u6BB5\u3002\u53EA\u586B\u6B63\u6587\uFF0C\u63D2\u4EF6\u4F1A\u81EA\u52A8\u5305\u6210\u6765\u6E90\u589E\u5F3A\u5757\u3002": "\u544A\u8BC9\u6A21\u578B\u5982\u4F55\u4F7F\u7528\u6765\u6E90\u5B57\u6BB5\u3002\u53EA\u586B\u6B63\u6587\uFF0C\u63D2\u4EF6\u4F1A\u81EA\u52A8\u5305\u6210\u6765\u6E90\u589E\u5F3A\u5757\u3002",
  "\u589E\u5F3A\u63D0\u793A\u8BCD": "\u589E\u5F3A\u63D0\u793A\u8BCD",
  "\u6765\u6E90\u5B57\u6BB5\u53EA\u5728\u5F53\u524D\u6D88\u606F\u5DF2\u63D0\u4F9B\u65F6\u624D\u4F1A\u53D1\u9001\uFF0C\u4E0D\u4F1A\u989D\u5916\u67E5\u8BE2\u5E73\u53F0\u63A5\u53E3\u3002": "\u6765\u6E90\u5B57\u6BB5\u53EA\u5728\u5F53\u524D\u6D88\u606F\u5DF2\u63D0\u4F9B\u65F6\u624D\u4F1A\u53D1\u9001\uFF0C\u4E0D\u4F1A\u989D\u5916\u67E5\u8BE2\u5E73\u53F0\u63A5\u53E3\u3002",
  "\u4ECE\u4F1A\u8BDD\u91CC\u9009\u2026": "\u4ECE\u4F1A\u8BDD\u91CC\u9009\u2026",
  "\u53BB\u5F00\u901A\u6743\u9650": "\u53BB\u5F00\u901A\u6743\u9650",
  "\u5C5E\u4E3B\u540D\u5355\u662F *\uFF08\u8FD9\u53F0\u673A\u5668\u4EBA\u6CA1\u6709\u5C5E\u4E3B\u7ED5\u8FC7\uFF09\uFF1A\u80FD\u7528\u5B83\u7684\u4EBA\u5B8C\u5168\u7531\u4E0B\u9762\u7684\u300C\u8BBF\u95EE\u7B56\u7565\u300D\u51B3\u5B9A\u3002": "\u5C5E\u4E3B\u540D\u5355\u662F *\uFF08\u8FD9\u53F0\u673A\u5668\u4EBA\u6CA1\u6709\u5C5E\u4E3B\u7ED5\u8FC7\uFF09\uFF1A\u80FD\u7528\u5B83\u7684\u4EBA\u5B8C\u5168\u7531\u4E0B\u9762\u7684\u300C\u8BBF\u95EE\u7B56\u7565\u300D\u51B3\u5B9A\u3002",
  "\u98DE\u4E66": "\u98DE\u4E66",
  "\u627E\u4E0D\u5230\u8FD9\u53F0\u673A\u5668\u4EBA": "\u627E\u4E0D\u5230\u8FD9\u53F0\u673A\u5668\u4EBA",
  "\u5B83\u4E0D\u5728\u5F53\u524D\u6E20\u9053\u7684\u540D\u5355\u91CC\uFF08\u53EF\u80FD\u5DF2\u88AB\u79FB\u9664\uFF0C\u6216 Host \u4E0E\u9875\u9762\u7248\u672C\u4E0D\u4E00\u81F4\uFF09": "\u5B83\u4E0D\u5728\u5F53\u524D\u6E20\u9053\u7684\u540D\u5355\u91CC\uFF08\u53EF\u80FD\u5DF2\u88AB\u79FB\u9664\uFF0C\u6216 Host \u4E0E\u9875\u9762\u7248\u672C\u4E0D\u4E00\u81F4\uFF09",
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
  "\u5173\u95ED": "Close",
  "\u5220\u9664": "Delete",
  "\u542F\u7528": "Enabled",
  "\u586B\u5165\u793A\u4F8B": "Fill with example",
  "\u5907\u6CE8\u540D\uFF08\u53EF\u9009\uFF09": "Display name (optional)",
  "\u5F20\u4E09": "Alice",
  "\u65B0\u589E": "Add",
  "\u6765\u6E90\u5B57\u6BB5": "Source fields",
  "\u6E05\u7A7A": "Clear",
  "\u8FD8\u6CA1\u6709\u6307\u5B9A\u8BBE\u7F6E\u3002": "Nothing configured yet.",
  "\u4E0A\u4E0B\u6587\u589E\u5F3A": "Context enhancement",
  "\u4E0A\u4E0B\u6587\u589E\u5F3A\u8303\u56F4": "Context enhancement scope",
  "\u53E0\u52A0\u5168\u5C40\u63D0\u793A\u8BCD\uFF08\u4E0D\u52FE\u9009\u5219\u53EA\u4F7F\u7528\u4E0A\u9762\u7684\u4E13\u5C5E\u63D0\u793A\u8BCD\uFF09": "Also stack the global prompt (unchecked: use only the prompt above)",
  "\u544A\u8BC9\u6A21\u578B\u5982\u4F55\u4F7F\u7528\u6765\u6E90\u5B57\u6BB5\u3002\u53EA\u586B\u6B63\u6587\uFF0C\u63D2\u4EF6\u4F1A\u81EA\u52A8\u5305\u6210\u6765\u6E90\u589E\u5F3A\u5757\u3002": "Tell the model how to use the source fields. Write the body only \u2014 the plugin wraps it into a source block.",
  "\u589E\u5F3A\u63D0\u793A\u8BCD": "Prepended prompt",
  "\u6765\u6E90\u5B57\u6BB5\u53EA\u5728\u5F53\u524D\u6D88\u606F\u5DF2\u63D0\u4F9B\u65F6\u624D\u4F1A\u53D1\u9001\uFF0C\u4E0D\u4F1A\u989D\u5916\u67E5\u8BE2\u5E73\u53F0\u63A5\u53E3\u3002": "Source fields are sent only when the incoming message already carries them; no extra platform calls are made.",
  "\u4ECE\u4F1A\u8BDD\u91CC\u9009\u2026": "Pick a conversation\u2026",
  "\u53BB\u5F00\u901A\u6743\u9650": "Grant the permission",
  "\u5C5E\u4E3B\u540D\u5355\u662F *\uFF08\u8FD9\u53F0\u673A\u5668\u4EBA\u6CA1\u6709\u5C5E\u4E3B\u7ED5\u8FC7\uFF09\uFF1A\u80FD\u7528\u5B83\u7684\u4EBA\u5B8C\u5168\u7531\u4E0B\u9762\u7684\u300C\u8BBF\u95EE\u7B56\u7565\u300D\u51B3\u5B9A\u3002": "The owner list is * (this bot has no owner bypass): who may use it is decided entirely by the access policy below.",
  "\u98DE\u4E66": "Feishu",
  "\u627E\u4E0D\u5230\u8FD9\u53F0\u673A\u5668\u4EBA": "Bot not found",
  "\u5B83\u4E0D\u5728\u5F53\u524D\u6E20\u9053\u7684\u540D\u5355\u91CC\uFF08\u53EF\u80FD\u5DF2\u88AB\u79FB\u9664\uFF0C\u6216 Host \u4E0E\u9875\u9762\u7248\u672C\u4E0D\u4E00\u81F4\uFF09": "It is not in this channel's bot list (it may have been removed, or the Host and the page are on different versions)",
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
    DeliveryTargetsEditor,
    WorkspaceEditor,
    PresetEditor,
    AccessPolicyEditor
  } = chatUi.components;
  const settings = chatUi.hooks.useBotSettings({
    connection,
    channelId: CHANNEL_ID,
    botId: bot.id
  });
  React.useEffect(() => {
    void settings.loadOptions();
  }, [settings.loadOptions]);
  const shared = {
    workspace: settings.record?.workspace ?? null,
    agentPreset: settings.record?.agentPreset ?? null,
    accessPolicy: settings.record?.accessPolicy ?? null
  };
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
      description: bot.appIdMasked,
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
            className: "dchat-button dchat-buttonDangerSolid",
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
          className: "dchat-button dchat-buttonDanger",
          disabled: busy,
          onClick: () => setConfirming(true)
        }, t("\u79FB\u9664\u63A5\u5165"))
      )
    },
    status.errorMessage ? h("p", { className: "dchat-error", role: "alert" }, status.errorMessage) : null,
    // 属主名单是 `*`（绑定时没记录属主）时必须说清楚：这台机器人**没有属主绕过**，
    // 一切按访问策略判定，所以 /allow 会回"只有属主"，名单要在下面的「访问策略」里改。
    status.ownersWildcard ? h("p", { className: "dchat-cardDescription" }, t("\u5C5E\u4E3B\u540D\u5355\u662F *\uFF08\u8FD9\u53F0\u673A\u5668\u4EBA\u6CA1\u6709\u5C5E\u4E3B\u7ED5\u8FC7\uFF09\uFF1A\u80FD\u7528\u5B83\u7684\u4EBA\u5B8C\u5168\u7531\u4E0B\u9762\u7684\u300C\u8BBF\u95EE\u7B56\u7565\u300D\u51B3\u5B9A\u3002")) : null,
    // 名字拿不到（多为缺权限）时说明原因并给出开通入口：否则用户只能看到一串 id 猜原因。
    status.nameHint ? h(
      "p",
      { className: "dchat-cardDescription", role: "status" },
      `${status.nameHint.message} `,
      status.nameHint.url ? h("a", { href: status.nameHint.url, target: "_blank", rel: "noreferrer" }, t("\u53BB\u5F00\u901A\u6743\u9650")) : null
    ) : null,
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
    h(WorkspaceEditor, {
      value: shared.workspace,
      options: settings.options?.workspacePaths ?? [],
      translate: t,
      onSave: settings.saveWorkspace
    }),
    h(PresetEditor, {
      value: shared.agentPreset,
      options: settings.options?.presets ?? [],
      translate: t,
      onSave: settings.saveAgentPreset
    }),
    h(AccessPolicyEditor, {
      value: shared.accessPolicy,
      translate: t,
      onSave: settings.saveAccessPolicy
    }),
    h(ScopedModeEditor, {
      title: t("\u4EFB\u52A1\u8FC7\u7A0B\u5C55\u793A"),
      description: t("\u8BBE\u7F6E\u6267\u884C\u8FC7\u7A0B\u7684\u5448\u73B0\u65B9\u5F0F\uFF1B\u79C1\u804A\u4E0E\u7FA4\u804A\u5206\u522B\u751F\u6548"),
      scopes: [{ key: "direct", label: "\u79C1\u804A" }, { key: "group", label: "\u7FA4\u804A" }],
      options: STEP_PUSH_OPTIONS,
      value: status.stepPush,
      translate: t,
      onSave: async (next) => {
        const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, "bot.step-push.set", {
          botId: bot.id,
          stepPush: next
        });
        chatUi.unwrapRpc(result);
        await onChanged?.();
      }
    }),
    h(ContextEnhancementEditor, {
      config: settings.record?.contextEnhancement ?? null,
      disabled: settings.phase !== "ready",
      translate: t,
      onSave: settings.saveContextEnhancement,
      // 「指定用户/指定群」用它做"从会话里选"，而不是让人填 id。
      chatUi,
      connection,
      channelId: CHANNEL_ID,
      botId: bot.id
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
  const scoped = Boolean(botId);
  const bots = scoped ? allBots.filter((bot) => (bot?.botId ?? bot?.id ?? null) === botId) : allBots;
  const missing = scoped && state.phase === "ready" && bots.length === 0;
  return h(
    React.Fragment,
    null,
    scoped ? null : h(
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
    scoped && state.error ? h("p", { className: "dchat-error", role: "alert" }, state.error.message) : null,
    missing ? h(EmptyState, {
      title: t("\u627E\u4E0D\u5230\u8FD9\u53F0\u673A\u5668\u4EBA"),
      description: `${t("\u5B83\u4E0D\u5728\u5F53\u524D\u6E20\u9053\u7684\u540D\u5355\u91CC\uFF08\u53EF\u80FD\u5DF2\u88AB\u79FB\u9664\uFF0C\u6216 Host \u4E0E\u9875\u9762\u7248\u672C\u4E0D\u4E00\u81F4\uFF09")}\uFF1A${botId}`
    }) : null,
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
    // 图标：**飞书开放平台官网的矢量标志**（open.feishu.cn 的 favicon-logo.svg，三条 path
    // 逐字节未改）。相对原件只做两件事：去掉官方文件里那层白色圆角底 `rect`（否则是白底方图），
    // 并把 viewBox 按官方 48px favicon 的留白比例收到标志外框；出处见 THIRD_PARTY_NOTICES.md。
    icon: { svg: '<svg viewBox="0.977 0.673 14.655 14.655" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M8.5611 8.26287L8.59322 8.23075C8.6141 8.20988 8.63658 8.18739 8.65906 8.16652L8.70402 8.12316L8.8373 7.99148L9.02037 7.81324L9.17613 7.65908L9.32226 7.51456L9.47481 7.36361L9.61452 7.22551L9.81043 7.03281C9.84737 6.99588 9.8859 6.96055 9.92444 6.92522C9.9951 6.86099 10.069 6.79836 10.1428 6.73734C10.2119 6.68274 10.2825 6.62975 10.3548 6.57836C10.456 6.5061 10.5603 6.44026 10.6663 6.37603C10.7707 6.31501 10.8783 6.2572 10.9875 6.2026C11.0903 6.15282 11.1963 6.10625 11.3038 6.0645C11.3633 6.04041 11.4243 6.01954 11.4853 5.99866C11.5158 5.98903 11.5463 5.97779 11.5784 5.96815C11.3071 4.90028 10.8109 3.90468 10.122 3.04556C9.98868 2.88016 9.78634 2.78381 9.57438 2.78381H3.94598C3.88817 2.78381 3.84 2.83038 3.84 2.8898C3.84 2.92352 3.85605 2.95403 3.88335 2.97491C5.80391 4.38321 7.39689 6.19297 8.54826 8.27732L8.5611 8.26287Z" fill="#00D6B9"/> <path d="M6.32424 13.2168C9.23077 13.2168 11.7631 11.6126 13.0831 9.24238C13.1297 9.15887 13.1747 9.07537 13.218 8.99026C13.1522 9.11712 13.0783 9.23917 12.9964 9.35478C12.9675 9.39493 12.9386 9.43508 12.9081 9.47522C12.8696 9.525 12.831 9.57157 12.7909 9.61814C12.7588 9.65507 12.7266 9.6904 12.6929 9.72573C12.6255 9.79638 12.5548 9.86383 12.4809 9.92646C12.4392 9.96178 12.3991 9.99551 12.3557 10.0276C12.3059 10.0662 12.2545 10.1031 12.2031 10.1368C12.171 10.1593 12.1373 10.1802 12.1036 10.2011C12.0699 10.2219 12.0345 10.2428 11.9976 10.2637C11.9253 10.3038 11.8499 10.3424 11.7744 10.3761C11.7085 10.405 11.6411 10.4323 11.5737 10.458C11.4998 10.4853 11.4259 10.5094 11.3488 10.5302C11.2348 10.5624 11.1208 10.5864 11.0036 10.6041C10.9201 10.617 10.8334 10.6266 10.7483 10.633C10.6583 10.6394 10.5668 10.641 10.4753 10.641C10.3741 10.6394 10.2729 10.633 10.1702 10.6218C10.0947 10.6137 10.0192 10.6025 9.94375 10.5897C9.87791 10.5784 9.81208 10.564 9.74624 10.5479C9.71091 10.5399 9.67719 10.5302 9.64186 10.5206C9.54551 10.4949 9.44916 10.4676 9.35281 10.4403C9.30464 10.4259 9.25646 10.413 9.20989 10.3986C9.13763 10.3777 9.06698 10.3552 8.99632 10.3327C8.93851 10.3151 8.8807 10.2958 8.82289 10.2765C8.76829 10.2589 8.71209 10.2412 8.65749 10.2219L8.54508 10.1834C8.50012 10.1673 8.45355 10.1513 8.40859 10.1352L8.31224 10.0999C8.24801 10.0774 8.18378 10.0533 8.12115 10.0292C8.08421 10.0148 8.04728 10.0019 8.01035 9.98748C7.96057 9.96821 7.91239 9.94894 7.86261 9.92967C7.81123 9.90879 7.75823 9.88792 7.70685 9.86704L7.60568 9.82529L7.48043 9.7739L7.38408 9.73376L7.28452 9.6904L7.1978 9.65186L7.11912 9.61653L7.03883 9.5796L6.95693 9.54106L6.85255 9.49288L6.74336 9.4415C6.70482 9.42223 6.66628 9.40456 6.62774 9.38529L6.52978 9.33712C4.80192 8.4748 3.24267 7.31218 1.92269 5.90227C1.88254 5.86052 1.8167 5.85731 1.77335 5.89746C1.75247 5.91673 1.73962 5.94563 1.73962 5.97454L1.74284 10.9413V11.3444C1.74284 11.5788 1.85845 11.7972 2.05276 11.9273C3.31654 12.772 4.80353 13.22 6.32424 13.2168Z" fill="#3370FF"/> <path d="M14.8656 6.21539C13.8844 5.73525 12.7619 5.63248 11.7101 5.92795C11.6652 5.94079 11.6218 5.95364 11.5784 5.96649C11.5479 5.97612 11.5174 5.98576 11.4853 5.997C11.4243 6.01787 11.3633 6.04036 11.3039 6.06284C11.1963 6.10459 11.0919 6.15116 10.9875 6.20094C10.8783 6.25393 10.7707 6.31174 10.6663 6.37276C10.5588 6.43539 10.456 6.50283 10.3548 6.57509C10.2825 6.62648 10.2119 6.67947 10.1428 6.73407C10.0674 6.79509 9.99511 6.85611 9.92445 6.92195C9.88591 6.95728 9.84898 6.99261 9.81044 7.02954L9.61453 7.22224L9.47482 7.36034L9.32227 7.51129L9.17614 7.65581L9.02038 7.80997L8.83892 7.98982L8.70564 8.1215L8.66067 8.16485C8.6398 8.18573 8.61732 8.20821 8.59483 8.22909L8.56272 8.2612L8.51294 8.30777C8.49367 8.32544 8.476 8.34149 8.45673 8.35916C7.97338 8.80397 7.43383 9.18455 6.85413 9.49447L6.9585 9.54265L7.0404 9.58119L7.12069 9.61812L7.19938 9.65345L7.28609 9.69199L7.38565 9.73534L7.482 9.77549L7.60725 9.82688L7.70842 9.86863C7.75981 9.8895 7.8128 9.91038 7.86419 9.93125C7.91236 9.95052 7.96214 9.9698 8.01192 9.98907C8.04886 10.0035 8.08579 10.0164 8.12272 10.0308C8.18696 10.0549 8.25119 10.0774 8.31382 10.1015L8.41016 10.1368C8.45513 10.1529 8.50009 10.1689 8.54666 10.185L8.65907 10.2235C8.71366 10.2412 8.76826 10.2604 8.82447 10.2781C8.88228 10.2974 8.94008 10.315 8.99789 10.3343C9.06855 10.3568 9.14081 10.3777 9.21147 10.4002C9.25964 10.4146 9.30782 10.4291 9.35439 10.4419C9.45073 10.4692 9.54708 10.4965 9.64343 10.5222C9.67876 10.5318 9.71248 10.5399 9.74781 10.5495C9.81365 10.5656 9.87949 10.5784 9.94533 10.5912C10.0208 10.6041 10.0963 10.6153 10.1717 10.6234C10.2745 10.6346 10.3757 10.641 10.4769 10.6426C10.5684 10.6442 10.6599 10.641 10.7498 10.6346C10.8366 10.6282 10.9217 10.6185 11.0052 10.6057C11.1208 10.588 11.2364 10.5623 11.3504 10.5318C11.4259 10.511 11.5014 10.4869 11.5752 10.4596C11.6427 10.4355 11.7101 10.4082 11.776 10.3777C11.8514 10.344 11.9269 10.3054 11.9992 10.2653C12.0345 10.246 12.0698 10.2251 12.1052 10.2026C12.1405 10.1818 12.1726 10.1593 12.2047 10.1384C12.2561 10.1031 12.3075 10.0677 12.3573 10.0292C12.4006 9.99709 12.4424 9.96337 12.4825 9.92804C12.5548 9.86542 12.6254 9.79797 12.6929 9.72732C12.7266 9.69199 12.7587 9.65666 12.7908 9.61973C12.831 9.57316 12.8711 9.52498 12.9081 9.47681C12.9386 9.43827 12.9675 9.39812 12.9964 9.35637C13.0767 9.24075 13.1505 9.12032 13.2164 8.99506L13.2919 8.84572L13.9631 7.50807L13.9711 7.49202C14.1927 7.01348 14.4946 6.58312 14.8656 6.21539Z" fill="#133C9A"/> </svg>' },
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
