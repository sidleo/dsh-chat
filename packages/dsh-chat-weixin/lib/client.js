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
  "Agent \u9884\u8BBE": "Agent \u9884\u8BBE",
  "\u4E0B\u62C9\u91CC\u662F\u8FD9\u53F0\u673A\u5668\u4EBA\u7528\u8FC7\u7684\u76EE\u5F55\u3002": "\u4E0B\u62C9\u91CC\u662F\u8FD9\u53F0\u673A\u5668\u4EBA\u7528\u8FC7\u7684\u76EE\u5F55\u3002",
  "\u4EC5\u540D\u5355\u5185\u53EF\u7528": "\u4EC5\u540D\u5355\u5185\u53EF\u7528",
  "\u4ECE\u4F1A\u8BDD\u91CC\u9009\u4E00\u4E2A\u4EBA\u8BBE\u4E3A\u5C5E\u4E3B": "Pick a person from a conversation to make them the owner",
  "\u4EFB\u4F55\u4EBA\u53EF\u7528": "\u4EFB\u4F55\u4EBA\u53EF\u7528",
  "\u5141\u8BB8\u6267\u884C\u547D\u4EE4": "\u5141\u8BB8\u6267\u884C\u547D\u4EE4",
  "\u53EF\u6267\u884C\u547D\u4EE4": "\u53EF\u6267\u884C\u547D\u4EE4",
  "\u540D\u5355\u4E3A\u7A7A\u65F6\u53EA\u6709\u5C5E\u4E3B\u53EF\u7528\u3002": "\u540D\u5355\u4E3A\u7A7A\u65F6\u53EA\u6709\u5C5E\u4E3B\u53EF\u7528\u3002",
  "\u5BF9\u65B9\u7684\u5E73\u53F0 id\uFF0C\u56DE\u8F66\u6DFB\u52A0": "\u5BF9\u65B9\u7684\u5E73\u53F0 id\uFF0C\u56DE\u8F66\u6DFB\u52A0",
  "\u5C5E\u4E3B": "Owner",
  "\u5C5E\u4E3B\u4E0D\u9700\u8981\u8FDB\u767D\u540D\u5355\uFF1A\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\u3002\u8FD9\u91CC\u6539\u5B8C\u4F1A\u91CD\u8FDE\u4E00\u6B21\uFF0C\u7ACB\u523B\u751F\u6548\u3002": "An owner does not need to be on the allowlist: their messages and commands always pass. Saving reconnects this bot once so the change takes effect immediately.",
  "\u5DE5\u4F5C\u533A": "\u5DE5\u4F5C\u533A",
  "\u5F53\u524D Host \u8BFB\u4E0D\u5230 Agent Preset \u5217\u8868\u3002": "\u5F53\u524D Host \u8BFB\u4E0D\u5230 Agent Preset \u5217\u8868\u3002",
  "\u5F53\u524D\u6CA1\u6709\u5C5E\u4E3B\uFF1A\u6CA1\u6709\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565\uFF0C\u8C01\u80FD\u7528\u5B8C\u5168\u7531\u4E0B\u9762\u7684\u300C\u8BBF\u95EE\u7B56\u7565\u300D\u51B3\u5B9A\u3002": "No owner right now: nobody bypasses the access policy, so who may use this bot is decided entirely by the access policy below.",
  "\u673A\u5668\u4EBA\u8DD1\u5728\u54EA\u4E2A\u76EE\u5F55\uFF1A\u80FD\u8BFB\u5199\u54EA\u4E9B\u6587\u4EF6\u3001\u7528\u54EA\u4EFD AGENTS.md\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002": "\u673A\u5668\u4EBA\u8DD1\u5728\u54EA\u4E2A\u76EE\u5F55\uFF1A\u80FD\u8BFB\u5199\u54EA\u4E9B\u6587\u4EF6\u3001\u7528\u54EA\u4EFD AGENTS.md\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002",
  "\u6CA1\u6709\u53EF\u9009\u7684\u4F1A\u8BDD\uFF08\u5148\u548C\u673A\u5668\u4EBA\u804A\u4E00\u6B21\uFF09": "No conversation to pick yet (talk to the bot once first)",
  "\u6DFB\u52A0": "\u6DFB\u52A0",
  "\u6E05\u7A7A\u540E\u6CA1\u6709\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565": "After clearing, nobody bypasses the access policy",
  "\u6E05\u7A7A\uFF08\u65E0\u5C5E\u4E3B\uFF09": "Clear (no owner)",
  "\u76EE\u5F55": "\u76EE\u5F55",
  "\u79C1\u804A": "\u79C1\u804A",
  "\u79FB\u9664": "\u79FB\u9664",
  "\u7FA4\u804A": "\u7FA4\u804A",
  "\u8BBE\u4E3A\u5C5E\u4E3B": "Make owner",
  "\u8BBF\u95EE\u6A21\u5F0F": "\u8BBF\u95EE\u6A21\u5F0F",
  "\u8BBF\u95EE\u7B56\u7565": "\u8BBF\u95EE\u7B56\u7565",
  "\u8C01\u80FD\u8DDF\u673A\u5668\u4EBA\u8BF4\u8BDD\u3001\u8C01\u80FD\u6267\u884C\u547D\u4EE4\u3002\u6539\u52A8\u7ACB\u5373\u751F\u6548\uFF1B\u5C5E\u4E3B\u59CB\u7EC8\u53EF\u7528\u3002": "\u8C01\u80FD\u8DDF\u673A\u5668\u4EBA\u8BF4\u8BDD\u3001\u8C01\u80FD\u6267\u884C\u547D\u4EE4\u3002\u6539\u52A8\u7ACB\u5373\u751F\u6548\uFF1B\u5C5E\u4E3B\u59CB\u7EC8\u53EF\u7528\u3002",
  "\u8DDF\u968F Host \u9ED8\u8BA4": "\u8DDF\u968F Host \u9ED8\u8BA4",
  "\u8FD9\u4E2A\u673A\u5668\u4EBA\u7528\u54EA\u5957 Agent \u9884\u8BBE\uFF08\u4EBA\u8BBE\u4E0E\u5DE5\u5177\u96C6\uFF09\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002": "\u8FD9\u4E2A\u673A\u5668\u4EBA\u7528\u54EA\u5957 Agent \u9884\u8BBE\uFF08\u4EBA\u8BBE\u4E0E\u5DE5\u5177\u96C6\uFF09\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002",
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
  "Agent \u9884\u8BBE": "Agent preset",
  "\u4E0B\u62C9\u91CC\u662F\u8FD9\u53F0\u673A\u5668\u4EBA\u7528\u8FC7\u7684\u76EE\u5F55\u3002": "The suggestions are directories this bot has used before.",
  "\u4EC5\u540D\u5355\u5185\u53EF\u7528": "Allowlist only",
  "\u4ECE\u4F1A\u8BDD\u91CC\u9009\u4E00\u4E2A\u4EBA\u8BBE\u4E3A\u5C5E\u4E3B": "Pick a person from a conversation to make them the owner",
  "\u4EFB\u4F55\u4EBA\u53EF\u7528": "Anyone",
  "\u5141\u8BB8\u6267\u884C\u547D\u4EE4": "Allow commands",
  "\u53EF\u6267\u884C\u547D\u4EE4": "Allow commands",
  "\u540D\u5355\u4E3A\u7A7A\u65F6\u53EA\u6709\u5C5E\u4E3B\u53EF\u7528\u3002": "An empty allowlist means only the owner can use it.",
  "\u5BF9\u65B9\u7684\u5E73\u53F0 id\uFF0C\u56DE\u8F66\u6DFB\u52A0": "Their platform id \u2014 press Enter to add",
  "\u5C5E\u4E3B": "Owner",
  "\u5C5E\u4E3B\u4E0D\u9700\u8981\u8FDB\u767D\u540D\u5355\uFF1A\u6D88\u606F\u4E0E\u547D\u4EE4\u90FD\u76F4\u63A5\u653E\u884C\u3002\u8FD9\u91CC\u6539\u5B8C\u4F1A\u91CD\u8FDE\u4E00\u6B21\uFF0C\u7ACB\u523B\u751F\u6548\u3002": "An owner does not need to be on the allowlist: their messages and commands always pass. Saving reconnects this bot once so the change takes effect immediately.",
  "\u5DE5\u4F5C\u533A": "Workspace",
  "\u5F53\u524D Host \u8BFB\u4E0D\u5230 Agent Preset \u5217\u8868\u3002": "This Host does not expose an agent preset list.",
  "\u5F53\u524D\u6CA1\u6709\u5C5E\u4E3B\uFF1A\u6CA1\u6709\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565\uFF0C\u8C01\u80FD\u7528\u5B8C\u5168\u7531\u4E0B\u9762\u7684\u300C\u8BBF\u95EE\u7B56\u7565\u300D\u51B3\u5B9A\u3002": "No owner right now: nobody bypasses the access policy, so who may use this bot is decided entirely by the access policy below.",
  "\u673A\u5668\u4EBA\u8DD1\u5728\u54EA\u4E2A\u76EE\u5F55\uFF1A\u80FD\u8BFB\u5199\u54EA\u4E9B\u6587\u4EF6\u3001\u7528\u54EA\u4EFD AGENTS.md\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002": "Which directory the bot runs in: which files it may read and write, and which AGENTS.mdapplies. Applies to new conversations only.",
  "\u6CA1\u6709\u53EF\u9009\u7684\u4F1A\u8BDD\uFF08\u5148\u548C\u673A\u5668\u4EBA\u804A\u4E00\u6B21\uFF09": "No conversation to pick yet (talk to the bot once first)",
  "\u6DFB\u52A0": "Add",
  "\u6E05\u7A7A\u540E\u6CA1\u6709\u4EBA\u7ED5\u8FC7\u8BBF\u95EE\u7B56\u7565": "After clearing, nobody bypasses the access policy",
  "\u6E05\u7A7A\uFF08\u65E0\u5C5E\u4E3B\uFF09": "Clear (no owner)",
  "\u76EE\u5F55": "Directory",
  "\u79C1\u804A": "Direct",
  "\u79FB\u9664": "Remove",
  "\u7FA4\u804A": "Group",
  "\u8BBE\u4E3A\u5C5E\u4E3B": "Make owner",
  "\u8BBF\u95EE\u6A21\u5F0F": "Access mode",
  "\u8BBF\u95EE\u7B56\u7565": "Access policy",
  "\u8C01\u80FD\u8DDF\u673A\u5668\u4EBA\u8BF4\u8BDD\u3001\u8C01\u80FD\u6267\u884C\u547D\u4EE4\u3002\u6539\u52A8\u7ACB\u5373\u751F\u6548\uFF1B\u5C5E\u4E3B\u59CB\u7EC8\u53EF\u7528\u3002": "Who may talk to the bot and who may run commands. Changes apply immediately;the owner always has access.",
  "\u8DDF\u968F Host \u9ED8\u8BA4": "Follow the Host default",
  "\u8FD9\u4E2A\u673A\u5668\u4EBA\u7528\u54EA\u5957 Agent \u9884\u8BBE\uFF08\u4EBA\u8BBE\u4E0E\u5DE5\u5177\u96C6\uFF09\u3002\u53EA\u5BF9\u65B0\u5EFA\u4F1A\u8BDD\u751F\u6548\u3002": "Which agent preset this bot uses (persona and tool set). Applies to new conversations only.",
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
  const {
    Panel,
    StatusPill,
    ContextEnhancementEditor,
    DeliveryTargetsEditor,
    WorkspaceEditor,
    PresetEditor,
    AccessPolicyEditor
  } = chatUi.components;
  const settings = chatUi.hooks.useBotSettings({
    connection,
    channelId: CHANNEL_ID,
    botId: account.botId
  });
  React.useEffect(() => {
    void settings.loadOptions();
  }, [settings.loadOptions]);
  const sessions = chatUi.hooks.useConversations({
    connection,
    channelId: CHANNEL_ID,
    botId: account.botId
  }).conversations.map((item) => ({
    id: item.kind === "group" ? item.route?.chatId : item.route?.userId,
    name: item.name,
    kind: item.kind
  })).filter((item) => typeof item.id === "string" && item.id);
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
    h(ContextEnhancementEditor, {
      config: settings.record?.contextEnhancement ?? null,
      disabled: settings.phase !== "ready",
      translate: t,
      onSave: settings.saveContextEnhancement,
      // 「指定用户」用平台 userId（route.userId），不是投递目标 id。
      conversations: sessions
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
