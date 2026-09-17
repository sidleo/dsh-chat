# 上游参考

本仓库是**从零实现**，不是 fork。架构与行为规范参考了
[`xmanrui/dsh-im`](https://github.com/xmanrui/dsh-im)（MIT，v4.21.1），用于确认"一个可用的
IM ↔ DSH 桥接需要哪些能力、数据放在哪里、边界怎么划"。

## 参考的对照关系

| dsh-im | 本仓库 | 说明 |
|---|---|---|
| 单体包 `@xmanrui/dsh-im`（11 渠道） | `dsh-chat` + 每渠道一个包 | 拆成 hub + 渠道插件，新增渠道不改 hub |
| `src/channels/{feishu,weixin,shared}` | `packages/dsh-chat-*/host`、`packages/dsh-chat/shared` | 重新实现 |
| `plugin-src/host`、`plugin-src/client` | `host/`、`client/` + 根 `scripts/build-*.mjs` | 重新实现（esbuild 双端打包方式一致） |
| `src/channels/shared/context-enhancement.mjs` | `packages/dsh-chat/shared/context-enhancement.mjs` | **重新设计**：在群聊/私聊全局之上增加"指定用户/指定群 + 是否叠加全局提示词" |
| `src/channels/shared/im-source-guidance.mjs` | `packages/dsh-chat/host/guidance.mjs` | 同一机制：提示词按会话发布为动态提示词上下文 |
| `workspaces.json`（每渠道一份） | `dsh-chat/bots.json`（hub 统一持有）+ 一次性导入 | 渠道无关设置收归 hub |
| 飞书 `stepPush` + `stepPushMode`（机器人级） | 飞书 `stepPushDirect` / `stepPushGroup` | 拆成私聊/群聊两份独立设置 |

注入标签沿用 `<dsh_im_source>` / `<dsh_im_source_guidance>`，以保持既有会话历史的可读性与
前缀解析的一致性。

## 计划移植（MIT，保留版权与出处）

| 内容 | 阶段 | 原因 |
|---|---|---|
| 微信 iLink 协议客户端（扫码登录、长轮询、发消息、AES 图片加解密、CDN 上传） | P3 | 协议无公开文档，只能按参考实现的协议行为重写客户端；将收窄接口面并注明出处 |
| `@larksuiteoapi/node-sdk@1.73.0` WSClient 生命周期构建期补丁 | P2 | 修复握手中无法关闭、超时摘除 error 监听、close 后僵尸重连；精确匹配替换，SDK 源码变动即构建失败 |

移植进来的文件必须在文件头写明来源与 MIT 许可，并在 `THIRD_PARTY_NOTICES.md` 登记。

## 行为比对流程

同一批机器人凭据与同一批数据目录可以同时被两边读取（但**不能同时运行**）。

1. `dsh plugin --profile <profile> remove dsh-chat dsh-chat-feishu dsh-chat-weixin`
2. `dsh plugin --profile <profile> add @xmanrui/dsh-im`，重启 dsh
3. 复现问题 → 记录实际行为
4. 切回本仓库重装，逐项对齐

数据格式保持兼容，因此切换不需要重新扫码或重新填 Secret。
