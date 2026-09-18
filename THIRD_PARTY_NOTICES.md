# 第三方许可与出处

本仓库主体为原创实现（MIT）。以下内容来自第三方，按其许可使用并在此登记。

## xmanrui/dsh-im（MIT）

- 上游仓库：https://github.com/xmanrui/dsh-im
- 参考版本：v4.21.1
- 使用方式：
  1. **架构与行为参考**（P0 起）：渠道 ↔ Host 的职责划分、数据目录布局、会话绑定、
     注入标签语法、动态提示词上下文机制等设计参照上游实现；本仓库代码为重新编写。
  2. **协议层移植**（P2/P3/P5）：微信 iLink 协议客户端（扫码登录、长轮询、发消息、
     AES 图片加解密、CDN 上传）与 `@larksuiteoapi/node-sdk` WSClient 生命周期补丁。
     移植文件均在文件头注明来源与许可。P5 已落地的具体对应关系：

     | 本仓库文件 | 上游来源 | 移植范围 |
     |---|---|---|
     | `packages/dsh-chat-weixin/host/ilink-client.mjs` | `src/channels/weixin/weixin-api.mjs` | 扫码登录、长轮询、发文本 |
     | `packages/dsh-chat/client/session-badges.js` + 渠道的 `icon.svg` | `plugin-src/client/session-channel-logos.js` | 侧边栏会话行的渠道徽标：沿用「保留文字前缀 + 只加自有属性 + 一张样式表用伪元素替换」的做法，**匹配方式不同**（上游按产品 CSS 类名找标题行，本项目只按"叶子元素文本以「渠道名 · 」开头"匹配，不依赖类名），并按本项目规范做了可还原的卸载 |
     | 渠道图标 `icon.svg` | simple-icons（WeChat，CC0-1.0）+ `dsh-im` 的 `plugin-src/client/channel-logos.js`（飞书三色燕子，MIT） | 设置页渠道卡片与侧边栏会话行徽标共用的渠道图标；微信直接用 simple-icons 的路径，飞书用上游那三条自绘路径 |
     | `packages/dsh-chat-weixin/host/media.mjs` | 同上 + `src/channels/shared/image-prompt.mjs` | 入站图片/文件的 AES-128-ECB 解密与 CDN 下载、出站加密与 CDN 上传（收窄为"下载解密"与"加密上传"两组纯函数，去掉上游 i18n、artifact 错误分类与惰性引用包装） |
- 上游许可原文：

```
MIT License

Copyright (c) xmanrui

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 运行时依赖（由各包 package.json 声明）

| 依赖 | 用途 | 许可 |
|---|---|---|
| `@larksuiteoapi/node-sdk` | 飞书长连接与开放接口（P2） | MIT |
| `undici` | 微信 iLink HTTP 客户端（P3） | MIT |
| `qrcode` | 微信扫码登录二维码渲染（P3） | MIT |
| `react` / `react-dom` | 设置页 UI（由 DSH 提供，bundle 里外置） | MIT |
