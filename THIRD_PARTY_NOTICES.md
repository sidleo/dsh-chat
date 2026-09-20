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
     | 渠道图标 `icon` | ① 飞书：**飞书开放平台官网公开的矢量标志**——`https://lf-package-cn.feishucdn.com/obj/feishu-static/lark/open/website/favicon-logo.svg`（`open.feishu.cn` 的站点图标），三条 `path` 逐字节照搬；相对原件只做两处改动：删掉官方文件里那层白色圆角底 `<rect … fill="white"/>`（它会让图标变成白底方图），并按官方 48px favicon 的留白比例把 `viewBox` 收到标志外框（`0.977 0.673 14.655 14.655`）。改后与原件去白底渲染实测逐像素一致（平均通道差 0.05/255）；② 微信：**simple-icons**（CC0-1.0）的 `wechat` 路径，按品牌色 `#07C160` 填充 | 设置页渠道卡片与侧边栏会话行徽标共用的渠道图标，仅用于标识对应渠道。**不使用**上游 dsh-im 的自绘图形——它与官方标志有差异。飞书/微信标志的版权与商标归其权利人（飞书为字节跳动旗下产品），此处仅作渠道标识用途 |
     | `packages/dsh-chat/client/session-badges.js` + 渠道的 `icon.svg` | `plugin-src/client/session-channel-logos.js` | 侧边栏会话行的渠道徽标：沿用「保留文字前缀 + 只加自有属性 + 一张样式表用伪元素替换」的做法，**匹配方式不同**（上游按产品 CSS 类名找标题行，本项目只按"叶子元素文本以「渠道名 · 」开头"匹配，不依赖类名），并按本项目规范做了可还原的卸载 |
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

## 运行时依赖

由安装插件的 DSH profile 的 `node_modules` 在运行期提供（`scripts/build-host.mjs` 的
`DEFAULT_EXTERNAL` 列出哪些不打包）；飞书 SDK 是例外——它打进 bundle，避免运行期解析到版本不一致的副本。

| 依赖 | 用途 | 许可 |
|---|---|---|
| `@larksuiteoapi/node-sdk` | 飞书长连接与开放接口（P2，**已打进 bundle**） | MIT |
| `undici` | 微信 iLink HTTP 客户端（P3） | MIT |
| `qrcode` | 二维码渲染：微信扫码登录（P3）、飞书「扫码新建机器人」的授权链接（P7，缺它就只给链接） | MIT |
| `react` / `react-dom` | 设置页 UI（由 DSH 提供，bundle 里外置） | MIT |
