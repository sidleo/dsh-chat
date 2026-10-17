# DSH 0.2.1：飞书发消息报 `reading 'signal'`（peer 兜底被删）

**现象**：升级到 DSH 0.2.1 之后，在飞书里给机器人发任何消息都立刻失败，聊天里回一句
`处理失败：Cannot read properties of undefined (reading 'signal')`；
`logs/feishu.log` 里是 `处理消息失败：Cannot read properties of undefined (reading 'signal')`，
`logs/hub.log` 里还有一条 `读取模型列表失败：` 同样文案（设置页那栏也一起坏了）。

**一句话原因**：DSH 0.2.1-rc.2 把"进程内调用没给 peer 就自动兜底"这条去掉了，
而本插件所有 Remote 调用都不带 peer，于是每一次调用都在**属性读取**上崩。

---

## 1. 证据链（可复跑）

### 1.1 桌面端跑的确实是 0.2.1-rc.2

```
$ python3 -c "…读 app.asar 里的 dsh/package.json…"
name=@deepseek-ai/dsh-desktop-runtime  version=0.2.1-rc.2
dsh-api-gateway 0.2.1-rc.2   dsh-typert-protocol 0.2.1-rc.2
```

`~/.local/bin/dsh` 那份 CLI 仍是 **0.2.0-rc.2**——所以 `npm run check:dsh`（走 CLI）
**永远是绿的、永远发现不了这件事**。这一点很关键，别用 CLI 的版本号判断桌面端。

### 1.2 两版 gateway 的差别

`dsh-api-gateway/lib/index.js`：

```diff
 // 0.2.0-rc.2
 function remoteRequest(endpoint, payload, signal, peer) {
   …
   return { namespace, method, args, signal, ...peer === void 0 ? {} : { peer } };
 }
 // prepareInvocation:
 }, descriptor.service, request.peer ?? this.operatorPeer(), signal, {
```

```diff
 // 0.2.1-rc.2
 function remoteRequest(endpoint, payload, signal, peer) {
+  assertPeerLive(peer, endpoint);          // ← 新增，且**没有** `peer === undefined` 的判断
   …
   return { namespace, method, args, signal, peer };   // peer 无条件带上
 }
 // prepareInvocation 里 `?? this.operatorPeer()` 整条删掉；operatorPeer() 方法本身也删了：
 }, descriptor.service, request.peer, signal, {

+function assertPeerLive(peer, endpoint) {
+  if (peer.signal.aborted) throw …      // ← peer 为 undefined 时就是 reading 'signal'
+}
```

另外 `peer` 的形状也变了：0.2.0 的 `OperatorPeer` **没有** `signal`，0.2.1 的 `Peer` 有
（`signal` / `principal` / `interactions`），且 `prepareInvocation` 会读 `peer.principal.kind`。

### 1.3 用真实源码跑出来的对照

| Host | 请求体 | 结果 |
|---|---|---|
| 0.2.0-rc.2 | `{namespace,method,args}`（无 peer） | 通过（旧兜底） |
| **0.2.1-rc.2** | `{namespace,method,args}`（无 peer） | **TypeError: Cannot read properties of undefined (reading 'signal')** ← 与真机日志逐字一致 |
| 0.2.1-rc.2 | 带 `connection.browserPeer` | 通过 |
| 0.2.1-rc.2 | 误把 0.2.0 的 `connection.operator` 当 peer | `reading 'aborted'`（它没有 signal） |

### 1.4 受影响的调用面

插件只有**一个**收口：`packages/dsh-chat/host/sessions.mjs` 的 `invoke()` 与 `stream()`。
`commands.mjs` / `panel.mjs` 里那些 `sessions.invoke(...)` 都走这里，所以只改一处就全好了。
命中范围：建会话、发提示词、`session/follow` 事件流、模型目录、重命名、延迟交付复查——
即**每一条消息**。

---

## 2. 修法

`sessions.mjs` 新增 `operatorPeer()` 与 `remoteRequest()`：

- `operatorPeer()` 依次认 `connection.browserPeer`（0.2.1）→ `connection.operator`（0.2.0），
  **必须**同时有 `signal` 与 `principal` 才认（0.2.0 那个没有 `signal`，传过去会炸 `aborted`）；
  两个都没有就**不传**，交给老 Host 自己的兜底——绝不因为认不出 peer 把调用打死。
- peer **每次调用现取**，不缓存：重连/换浏览器会换新 Peer，缓存旧的在 `assertPeerLive` 里是 `gateway/peer-disposed`。
- 一元 `invoke` 与流 `stream` **都**走它（只改一个照样崩一半）。

契约面没变：`INVOKE_REQUEST` 从 0.2.0 起本来就有可选 `peer` 字段，这次只是**开始用它**，
所以同一份产物在 0.1.x / 0.2.0 / 0.2.1 上都能跑，不需要按版本分支。

---

## 3. 验证

| 项 | 结果 |
|---|---|
| `npm run check` | `tests 487 / pass 487 / fail 0`；打包自检 4 个包；布局守门 45 帧 |
| `npm run check:dsh` | 12/12（CLI 0.2.0-rc.2） |
| 新增单测 ×2 | `DSH 0.2.1：gateway 调用必须带 connection.browserPeer…`、`…0.2.0 的 connection.operator（没有 signal）不会被当成 peer 递过去` |
| 反向验证 | 去掉 peer → 第 1 条红；把 `candidate.signal && candidate.principal` 放宽成 `candidate` → 第 2 条红 |
| 真实 0.2.1 口径端到端 | 用真实 gateway 源码的 `remoteRequest` 判定 + 已部署的 `sessions.mjs` 跑完整回合：`workspace/create → session/create → session/follow → session/prompt` 四次调用全部通过，答案正常返回 |
| 部署 | `~/.dsh/profiles/desktop/node_modules/@sidleo3/dsh-chat/{host/sessions.mjs,lib/index.js}` 已替换；原包备份在 `~/.dsh/backup-dsh-chat-20261017-195058/` |

**没验的**：真机（飞书长连接 + 真实平台）需要重启 DSH 之后人工发一条消息确认。

---

## 4. 下次升级 DSH 时怎么防

`npm run check:dsh` 走的是 CLI（本机 0.2.0-rc.2），**验不出这类桌面端独有的 API 破坏性改动**。
升级桌面端之后，除了跑它，还要：

1. 看一眼 `app.asar` 里 `dsh/package.json` 的版本，和 CLI 的 `dsh --version` **分别**记；
2. 抓 `logs/feishu.log` 里有没有 `处理消息失败`，以及 `logs/hub.log` 的 `读取模型列表失败`——
   这两条同时出现、文案是属性读取错误，基本就是"契约字段没了"这类事；
3. 对 `dsh-api-gateway` / `dsh-api-session-controller` / `dsh-api-remotes` 三个包做一次
   **0.2.x → 新版**的 `lib/index.js` diff（尤其找新加的 `assert*` / 被删的 `?? fallback`）。
