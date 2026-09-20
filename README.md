# dsh-chat

把聊天软件接入 DeepSeek Harness 的插件工作区。**一切皆插件**：`dsh-chat` 只做管理入口与共享内核，
每种聊天软件是独立的渠道插件，新增聊天软件只需新增一个包。

```
packages/dsh-chat            Hub：设置页入口「Chat机器人」+ 渠道注册表 + 共享内核
packages/dsh-chat-feishu     飞书渠道（凭据/长连接/私聊群聊/任务过程展示）
packages/dsh-chat-weixin     微信渠道（iLink 扫码登录/长轮询/私聊）
packages/dsh-chat-fixture    契约验证用假渠道（不发布）
```

新渠道作者请直接读 [`CONTRACT.md`](./CONTRACT.md)——那是唯一需要的文档。

## 当前进度

**P0–P6 全部完成**（骨架与契约 → 共享内核 → 飞书渠道 → 微信渠道 → 命令与访问策略 → 富媒体与主动投递 → 平台化）。

> 进度、已知坑与排查手册以 [`AGENTS.md`](./AGENTS.md) 为**唯一来源**（含阶段表与逐条排查条目），
> 这里不再复制一份——之前这里复制的那张表就是先烂掉的。

## 开发

```bash
npm run build     # 构建全部包的 host + client 两半
npm test          # 契约与引擎单元测试
npm run check     # build + test + 打包自检（含"渠道包不得 import hub"检查）
npm run rehearsal # 离线端到端演练：真实 hub + 真实飞书卡片 + 脚本化假 DSH（不联网、不用凭据）
```

改了 host/卡片逻辑、准备重启 DSH 之前，先跑一次 `npm run rehearsal`：它把主要用户路径
（渠道依赖自检 → 一问一答 → 命令 → 控制面板与卡片 → 访问策略确认 → 上下文增强 →
图片回退 → 延迟交付 → 诊断 → 真实飞书桥的"更新排在应答之后"与确认回路 → 引用回复 → `/retitle`）
在几秒内走一遍（12 条），并逐条打印 ✅/❌。
**它不替代真机**——Lark 长连接、真实平台回调只能真机验。

构建产物 `lib/index.js`（host，ESM）与 `lib/client.js`（client，DSH 模块加载器包装）随包提交，
因此安装方不需要构建。

## 安装

```bash
dsh plugin --profile web add /绝对路径/packages/dsh-chat
dsh plugin --profile web add /绝对路径/packages/dsh-chat-feishu
dsh plugin --profile web add /绝对路径/packages/dsh-chat-weixin
```

安装后需重启 DSH Host（host 半边），并刷新浏览器页面（client 半边）。

> ⚠️ `@xmanrui/dsh-im` 与本插件会绑定同一批机器人凭据并各自消费消息，**不能同时启用**：
> 启用 dsh-chat 前请先 `dsh plugin --profile web remove @xmanrui/dsh-im`。
> `npm run check` 可用 `DSH_CHAT_PROFILE_MANIFEST=<profile 的 package.json>` 检查这一点。

## 已知踩坑

- **不能与 `@xmanrui/dsh-im` 同时启用**：两者会绑定同一批凭据、各自消费消息，
  表现为双份回复或消息被随机分流。切换时先从 profile 移除上游插件。
- **`ownerOpenIds` 可能是 `['*']`**：上游在绑定时没有记录单一属主时写通配。
  按精确匹配做门禁会把该机器人的**所有**消息静默丢掉（"发了没反应"）。
  渠道实现必须同时看 `ownerOpenIds` 与 `accessPolicy`（`mode: 'open'` 表示放行）。
- **静默丢弃必须留日志**：门禁挡下的消息如果不打日志，线上几乎无法定位。
- **飞书事件的 `open_id` 是应用维度的**：同一个用户在不同飞书应用里 id 不同，
  属主/白名单要按"该应用的 id"存，不能跨应用复用。
- 飞书 SDK 的 `receive events or callbacks through persistent connection…` 是
  **每次 `start()` 都无条件打印的提示**，不是错误；`ws client ready` 才代表握手成功。

## 数据位置

| 数据 | 位置 |
|---|---|
| 每机器人共享设置（工作区/模型/预设/**上下文增强**/访问策略） | `~/.dsh/integrations/dsh-chat/bots.json` |
| 飞书机器人、凭据引用、会话状态 | `~/.dsh/integrations/dsh-feishu/`（沿用旧目录，零重绑） |
| 微信账号、token 引用、会话状态 | `~/.dsh/integrations/dsh-weixin/`（同上） |
| 凭据本体 | `~/.dsh/.credentials.yaml`（经 DSH 凭据服务读写） |
