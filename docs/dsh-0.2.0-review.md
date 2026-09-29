# dsh-chat 0.2.1 迭代 · 对抗性审查（task-4）

审查对象：本迭代最终工作树（HEAD `52b8691` + 全部未提交改动，含未跟踪的 `docs/`、`scripts/check-dsh-compat.mjs`）。
审查方法：读**已安装的** DSH 0.2.0-rc.1（`~/.local/lib/node_modules/@deepseek-ai/dsh/...`，= 本机跑着的那个版本）的 `.d.ts` 与实现、活体契约 `cordis_inspect_query`、`git diff`、`grep`、`node --test`（含在 **/tmp 副本**上做"改回旧写法"的变异验证）。
**未跑** `npm run check`（tester 独占）；**未跑** `npm run check:dsh` / `npm run rehearsal`（避免与 tester 并发起第二个临时 DSH 实例与临时 profile，见 §6）。**没有改动工作树里任何一个字节**（变异验证全部在 `/tmp/rev-copy` 里做，见 §1 的 md5 对照）。

**审查基准（改了这些文件就要重看对应结论）**——本报告针对下列 md5：

```
b0892c42bed9c7a5f652c63e76150162  scripts/check-dsh-compat.mjs
0b2b7b997bc47d2ddee220a1f92be4f9  docs/dsh-0.2.0-compat.md
f686ed327e57bcfb409fe0ba9e86de43  AGENTS.md
27e2c9df79ae67fa2b33c0f8e691b44d  UPSTREAM.md
ee6f295fb1cfab1dfdeff4e339ad621f  packages/dsh-chat/host/sessions.mjs
a988c022f6d7c7f74b0274791dc9c2e7  packages/dsh-chat/host/prompt-context.mjs
f55a807ad1df71b6076ee3259ebab0ca  packages/dsh-chat-feishu/host/lark-guard.mjs
351084eda937b6733f3ff69a75a3fe43  packages/dsh-chat-feishu/host/index.mjs
80a75a6f9cfdaf5f234eb122f1afb033  packages/dsh-chat/package.json
0984fec98efca1516c62e156a8b9cb2a  packages/dsh-chat/shared/contract.mjs
```

---

## 0. 结论

**代码可以放行；放行前必须修 3 处"证据强度"问题**——它们全都落在同一条轴上：**这道门禁 / 这份报告到底证明了什么**。修法都是"改一行文案"或"补一条断言"级别，不改任何产品逻辑。

- **安全面（本迭代真正有风险的那一处）：我没能证伪，判定为已堵住。** `lark-guard` 的 8 个 `return null` 分支我逐条走过（§4），0.2.0 下**没有**新增"拿不到 sessionId 而静默放行"的路径；新的取法在活体契约里是**更正确**的那一种（`ToolExecutionInput.agent?: Agent`，而 `Agent` 只声明 `{ readonly id: SessionId }`）。
- **新单测是真会红的**（实测，§1）：把 4 处取法改回旧写法 → **7 条红**，其中包含本轮新增的 4 条。
- **兼容报告的判定基本站得住**：我独立复核了 6 条 PASS，逐字对上；`§5 未核实` 里第 4 条（`ApprovalOutcome` 字面量）我可以**补实并关闭**（§5.3）。有 1 条 PASS 的证据不成立（B2）。
- **越界面干净**，但有 **1 处未声明的功能性改动**需要 Lead 确认性质（B3）。

| 级别 | 编号 | 一句话 |
|---|---|---|
| 阻塞级 | B1 | `check:dsh` 第 ⑥ 步证明的比它声称的少：`lib/client.js` 内容坏掉照样绿，而注释/报告写的是"client 半真的注册/被加载" |
| 阻塞级 | B2 | `compat.md §2.5` 把**尚未核实**的 dshmarket 半句标成 `PASS`，且 `§5 未核实` 没列它（`UPSTREAM.md:89-90` 自己承认了） |
| 阻塞级 | B3 | `prompt-context.mjs` 里有一段**功能性**改动（交付提示词不再点名 SQL、新增"脚本类不算成品"），不属于 task-2 声明的目标，也没有任何文档记录 —— 需 Lead 确认是有意还是越界 |
| 建议级 | S1–S10 | 门禁的 stale-lib 假绿、级联假红、信封判据过宽、skip 在 CI 里不可区分等（§3） |

放行口径建议：**B1/B2/B3 改完（或明确认定为有意并补一句文档）即可放行**；S1–S9 可以进下一轮。

---

## 1. 实测：新单测到底会不会红（task-4 第 2 项）

**做法**：把整个仓库（除 `node_modules`/`.git`/`lib`）复制到 `/tmp/rev-copy`，`node_modules` 用软链；在那份**副本**上把 4 处取法精确改回旧写法，再跑同样 4 个测试文件。工作树全程只读。

```
# 副本与工作树的 md5 一致（复制后）
ee6f295fb1cfab1dfdeff4e339ad621f  .../host/sessions.mjs      （两边一致）
f55a807ad1df71b6076ee3259ebab0ca  .../host/lark-guard.mjs    （两边一致）

# 副本改成旧写法后（工作树仍为上面两个值，未被触碰）
7d02dc8b085e068b5345fda5d9f0b550  /tmp/rev-copy/.../sessions.mjs
8615f0f4bad1fd887720c618f3776245  /tmp/rev-copy/.../lark-guard.mjs
```

| 场景 | tests | pass | fail |
|---|---|---|---|
| 副本 = 现行代码（基线） | 62 | 62 | **0** |
| 副本 = 4 处取法改回旧写法 | 62 | 55 | **7** |

红的 7 条 = **本轮新增 3 条 + 被扩展 2 条（这 5 条全红）+ 2 条既有用例连带红**：

- `会话 id 取法：agent.id（0.2.0 形态）与 agent.session.header.id 都认，三处一致`（`test/feishu-channel-apply.test.mjs:221`）
- `门禁：会话 id 三种形态都认（agent.id 优先，退回 session.header.id / session.id）`（`test/lark-guard.test.mjs:244`）
- `审批/提问中继：agent 只有 .id（0.2.0 形态）也认得出本会话并认领到 IM`（`test/sessions.test.mjs:685`）
- `提示词段：按 agent 求值…` / `交付文件说明段：…`（`test/prompt-context.test.mjs:62`、`:121`，被扩展的两条也红了）

另外 2 条**既有**用例也跟着红（`会话环境事实：只有本渠道的聊天会话拿得到 profile 与策略`、`解析不到 profile 时…`）——说明它们原本就依赖新的取法，不依赖"只改注释"。

**结论：这几条单测是承重的，不是摆设。** 这一项不需要 Lead 再复核。

---

## 2. 阻塞级问题

### B1（门禁假绿·窄口）`check:dsh` 第 ⑥ 步证明不了"client 半注册了"

**现象**：`lib/client.js`（客户端产物）**内容坏掉**时，第 ⑥ 步仍然绿。它只断言 index HTML 里有 `"id":"@sidleo3/dsh-chat"`，而那个字符串是 **host 侧合成的插件图**，与客户端 bundle 能不能加载、能不能 materialize 无关。

**证据**

1. 断言本体：`scripts/check-dsh-compat.mjs:521-524`（`const needle = `"id":"${HUB_PACKAGE}"`` … `if (!html.includes(needle)) throw`），注释与措辞在 `scripts/check-dsh-compat.mjs:511`：
   > `// ⑥ 客户端插件图：index HTML 里必须有本插件的 id——证明 **client 半**也被加载了。`
2. 这个图怎么来的（读实现）：
   - `dsh/node_modules/@deepseek-ai/dsh-client-modules/lib/index.js:540` — `for (const entry of ctx.loader.entries()) this.dirty.add(entry.options.name);`（**按 Loader 条目**扫 `dsh.client` 声明）
   - 同文件 `:553-554` — `ctx.on("webserver/index-inject", (table) => { table.push(...bootInjections(this.composed)); });`（把**图**塞进 index HTML）
   - 同文件 `:713-719` — 行里只校验"声明了 `dsh.client` 且 `exports` 里有 `./client`"（`clientRel === undefined` 才抛），**从不读 `lib/client.js` 的内容**
   - `dsh-client-modules/lib/types/client/manifest.d.ts`（`WebBootEntry` / `ClientModuleLoader` 的文档）明确：bundle 由**浏览器**后续 `<script src>` 拉取，执行时只 `REGISTER` 工厂，materialize 发生在 import 时
3. 被夸大的三处（这是"阻塞"的原因——本次迭代的交付物之一就是"这道门禁证明了什么"）：
   - `scripts/check-dsh-compat.mjs:511`（上面那句注释）
   - `docs/dsh-0.2.0-compat.md:179`（§4 第 6 条）："…客户端插件图里有 `@sidleo3/dsh-chat` → **client 半真的注册**"
   - `docs/dsh-0.2.0-compat.md:70`（§2.4 表格）："客户端插件被注册并出包 … PASS"

**为什么是阻塞**：本项目正好栽在过这一类坑上——`AGENTS.md` 记着"**写 CSS 时别在模板字符串里放反引号**：…整个 bundle 解析失败 → 页面白屏、而且守门的报错只是'页面没有产出测量结果'"。也就是说"客户端产物坏掉"是**真实发生过**的故障形态；而 `check:dsh` 这份文档/门禁现在声称它覆盖了这一层，实际没有。tester 的反向验证（改坏 `main` / `cordis.patch.yml` 的 `name`）**抓不到**这个口子——那条路会让第 ③/⑤/⑧ 步一起红，而不是第 ⑥ 步。

**怎么改（任选，都很小）**
1. **改文案（最小）**：把三处"client 半真的注册/被加载"改成准确表述——"插件图里**有本插件的客户端行**（= host 侧把 `dsh.client` 声明合成进了图；bundle 内容不由本步验证）"。
2. **补断言（更好，一行 fetch）**：index HTML 里同时有 `batches[].url`（`plugins/??<id>/client.js&rev=…`），把它取出来 `GET` 一次，断言 HTTP 200 且响应体长度 > 0 —— 产物缺失/路由坏掉立刻红。
3. **补语法检查（最硬）**：对三个 `packages/*/lib/client.js` 跑一次 `node --check`（那是纯语法检查，不需要浏览器），专治"bundle 解析失败"这一历史上真出现过的形态。注：`npm run check` 里的**布局守门**已经能覆盖白屏这一类，所以这属于"让 `check:dsh` 自己也别吹过头"。

### B2（报告证据不成立）`compat.md §2.5` 有一条 PASS 是"半句未核实"

**现象**：`docs/dsh-0.2.0-compat.md:80` 这一行把"市场侧（dshmarket）的发现判定也用 `includePrerelease: true`"和前半句（真跑过的 semver 比较）**绑在一起**标成 `PASS`，证据列写 `B + 实跑`；而 `§5 未核实`（`:196-209`，共 5 条）**没有列它**。同一份仓库的 `UPSTREAM.md:89-90` 却明确写了"本机没装市场包，这一条按既定口径记录，**未能就地复核**"。

**证据**
- `docs/dsh-0.2.0-compat.md:80`（PASS + `B + 实跑`）、`:196-209`（§5 五条里没有 dshmarket）
- `UPSTREAM.md:89-90`（自己标了"未能就地复核"）
- 我的复核：`AGENTS.md:81` 也把它当**事实**写（"市场侧（dshmarket）的判定用 `semver.satisfies(v, range, { includePrerelease: true })`"），**没有**带那个限定语
- 本机确实没有市场包：asar 顶层只有 `dsh,node_modules,lib,package.json,renderer`，全树 `market` 关键字零命中（`node -e` 遍历 asar 头，已跑）

**为什么是阻塞**：这份报告的验收标准是它自己写的那句——"**没有查过的事不写成 PASS**"（`:11`、`:196`）。一个被标成 PASS、证据写"实跑"的条目里塞了半句没跑过的，正好破坏这条标准；而这个半句是 `engines.dsh` 决策的一半依据（"不写 `<0.2.0` 会不会把 0.1.x 用户挡在门外"）。

**怎么改**：把该行拆开——前半句留 `PASS`（我已独立复现，见 §5.1），后半句挪进 `§5 未核实` 或就地标"（市场侧未核实）"。顺手给 `AGENTS.md:81` 补上"（本机没装市场包，未能就地复核）"，否则下一个人会把它当结论用。

### B3（未声明的功能性改动）交付提示词被改了，不在任何任务/文档里

**现象**：`packages/dsh-chat/host/prompt-context.mjs` 本轮除了取法加固，还**改了模型可见的交付提示词正文**：把"报表 / **SQL** / 图表 / 导出…就 `present` 一下"改成"…用户可能要用的**成品**（报表 / 图表 / Excel / 导出数据…）"，并新增一段"**脚本类不算成品**：过程用的 `.sql` / `.py` / `.sh`…默认**不要** `present`"。这是**行为级**改动（每一轮每个聊天会话的系统提示词都变了），而：

- task-2 的描述里，`prompt-context.mjs` 的改动目的只写了"会话 id 取法统一"这一件事；
- `AGENTS.md` 本轮新增的只有"DSH 版本兼容"一节，**"文件交付只有一条路：当轮 present"那一节没有同步**这个新口径；
- `docs/dsh-0.2.0-compat.md`、`UPSTREAM.md` 都没有提。

**证据**：`packages/dsh-chat/host/prompt-context.mjs:113-129`（新正文；`:116-125` 是解释性注释，`:126-129` 是新字符串）；`git diff packages/dsh-chat/host/prompt-context.mjs`；`test/prompt-context.test.mjs:130-145`（测试跟着钉了新文案，说明是**有意**改的）；`git diff AGENTS.md`（没有这一节）。

**为什么是阻塞**：本轮的性质是"兼容性复核 + 加固"，原则上**不应该夹带产品行为变更**——夹带了而没人记录，下一个人改交付机制时会以为提示词一直是这么写的。它本身看起来是对的（`AGENTS.md` 那一节确实记着真机发过 `.sql`/`yhq.py` 进群、与用户规则打架），所以才需要 Lead 一句话确认：**是有意为之（那就补文档）还是误入（那就拆出去单独提交）**。

**怎么改**：若有意 → 在 `AGENTS.md` 的"文件交付只有一条路"那节补一行"脚本类默认不交，只在用户明确要时才交"，并在 `docs/dsh-0.2.0-compat.md` 或 `UPSTREAM.md` 记一句"本轮顺带改了交付提示词口径"。若无意 → revert 该 hunk（不建议，它修的是真问题）。

---

## 3. 建议级问题

### S1 门禁的 stale-lib 假绿：版本对账只挡"版本漂了"
`scripts/check-dsh-compat.mjs:345-350` 的注释把第 ⑧ 步的版本对账写成"两者不一致只有两种可能——`HUB_VERSION` 写漂了，或者 `lib/` 还是旧构建"。实际上**只改了 host 源码、没重新 `npm run build`、版本号又没动**时，`lib/` 是旧的而 `hubVersion` 一致 → 第 ⑧ 步绿、整道门禁绿。而这道门禁的推荐使用场景恰恰是"动过 manifest / 注入 / 接线之后"（`:30-33`）——那时候最容易忘记构建。
**建议**：脚本开头加一条"新鲜度对账"：任一 `packages/*/host/**/*.mjs` 或 `client/*.js` 的 mtime 新于对应 `packages/*/lib/*.js` 就报 ❌ 并提示 `npm run build`（比版本的证明力强得多，且与本次迭代"假绿"的主题一致）。

### S2 第 ② 步可能报出误导性的级联失败（假红）
`step()` 的**外层**超时是 `STEP_TIMEOUT_MS = 120s`（`:52`、`:110-114`），而第 ② 步内部要**顺序**跑三次 `dsh plugin add`，每次各自的超时也是 120s（`:409-419`）。三次累计超过 120s 时外层先超时，但**外层超时不会杀掉在飞的子进程**（`withTimeout` 只是 `Promise.race`，`:99-107`），于是脚本带着"还在往 profile 里装"的进程继续跑第 ③ 步 `--dump-config` → 报出乱七八糟的合成树，让人以为 manifest 坏了。
**建议**：给第 ② 步的外层超时单独放大（如 `step(..., STEP_TIMEOUT_MS * PACKAGES.length + 30_000)`），或在 `withTimeout` 抛错时顺手 `killGroup` 掉该步启动的子进程。

### S3 第 ④ 步的 spawn 没有 `error` 监听，且"可执行"判据只看是不是普通文件
`isExecutableFile()`（`:231-238`）只判 `info.isFile()`，**不判执行位**；`spawnDsh`（`:168-179`）也没挂 `child.on('error')`。PATH 里若有一个不可执行的同名 `dsh`（普通文件），`locateDsh` 会选中它 → `spawn` 抛 `EACCES` → **未捕获的 `'error'` 事件直接崩掉整个脚本**（红是对的，但报错不是"第 4 步 ❌"、收尾自检也不跑，临时目录会留着）。
**建议**：`isExecutableFile` 补 `mode & 0o111`；`spawnDsh` 里挂一个 `'error'` 监听（把错误转成 promise 拒绝，交给 `step()` 报 ❌）。

### S4 第 ⑦ 步的"合法信封"判据对 `result` 缺 `ok` 的情况放行
`:545-548`：
```js
const code = parsed.result?.ok === false ? parsed.result.error?.code : null;
if (parsed.result?.ok === false && !String(code).startsWith('chat/')) throw …
```
`result` 为 `null` / `{}` / 没有 `ok` 字段时两条判断都不成立 → 这一步绿。实害很小（第 ⑧ 步要求 `result.ok === true` 且两个渠道都在），但既然这一步的定位是"必须是我方信封"，判据应写成"`ok === true` **或**（`ok === false` 且 `code` 以 `chat/` 开头），否则红"。
**附**：路由**没注册**时确实红（这条我独立复核过）——`dsh-client-connection/lib/index.js:620` 对未命中路径返回 `new Response("not found", { status: 404 })`；插件的路由是 `connection.fetch.register` 注册的**精确路由**（`packages/dsh-chat/host/rpc.mjs:90-121`）。所以 `compat.md:192` 那句是对的。

### S5 跳过路径在 CI 里与"真通过"不可区分
`skip()`（`:126-128`）只打一行 `⏭️ 跳过真机兼容门禁：…`；因为 `results.length === 0`，连 `门禁结果：N/N 通过` 那行都不打，退出码 0（`:677-681`）。文档是写清了的（`AGENTS.md:68-72`、`compat.md:187`、脚本头 `:32-33`），所以**不是**隐瞒；但如果 CI 想要"必须真跑过"，现在没有任何开关。
**建议**：加 `DSH_CHAT_REQUIRE_DSH=1`（设了就以退出码 1 报"找不到 dsh"），CI 里带上它；或在输出里把 `⏭️ 跳过` 与 `门禁结果` 统一成一行可 grep 的标记。

### S6 安全面残留：lark-guard 的"子代理口"（与 0.2.0 无关，既有）
`evaluate` 只认 `bash` / `pwsh`（`lark-guard.mjs:26`），并且靠 `locate(sessionId)` 命中本渠道会话。**子代理有自己全新的会话 id**：`dsh-subagent-in-process-driver/lib/index.js:166`（`const childId = brandString(randomUUID())`）→ 父会话的子代理会话在 hub 的绑定表里**查不到** → `lark-guard.mjs:198` `return null` **放行**。也就是说模型可以绕开"只用应用身份"：把 `lark-cli … --as user …` 丢进 `subagent` 里跑。
我已经确认的事实：路径**存在**、子会话 id 必定与父不同。我**没有**确认的事实：聊天会话的默认 Agent preset 里是否一定带 `subagent` 工具（`dsh-web-app/cordis.patch.yml:458` 说 `tool-subagent` 是 preset 行）——所以我不下"一定可达"的结论。
**建议**：`evaluate` 里在 `locate(sessionId)` 不中时，再试一次父会话（`exec?.agent?.session?.header?.parentSession`，若该字段存在——我**未核实**它在 0.2.0 的子会话 header 上一定有），或至少把"子代理里不拦"写进模块头的已知边界（现在的措辞是"别处（用户自己的 DSH 会话）一概不管"，读者不会想到子代理）。

### S7 `run_code`（PTC）/复合工具不在门禁视野内
同一条：门禁只看 `exec.name ∈ {bash, pwsh}`。PTC 里**带 parent 的嵌套调用**会以 `bash` 之名再走一次 `tools/pre-execute`（所以那条是拦得住的），但 `run_code` 程序自己 fork 出的进程（python 里 `subprocess.run("lark-cli …")`）看不到。`lark-guard.mjs:25` 的注释说"另说，见 README 的已知边界"，但 **README 里没有这段**（`grep -n lark-cli README.md` 零命中）。至少把这句话落到仓库里真实存在的文档上。

### S8 README 的常用命令表没加 `npm run check:dsh`
`README.md:30-33` 列了 build / test / check / rehearsal，没有新门禁（`AGENTS.md` 里有）。新贡献者的入口是 README。

### S9 门禁第 ⑨ 步的证明力（供参考，不是缺陷）
`<channel>.log` 是**首次写入才创建**的（`packages/dsh-chat/host/file-log.mjs:116-121`：`write()` 里才 `mkdir` + append），所以第 ⑨ 步确实多证了一点东西（渠道 deps 建起来过 + 有日志落盘）。但它与第 ⑧ 步高度相关（两者都由 `registerChannel` 触发，`channel-registry.mjs:148`）。`compat.md:182` 说"渠道 host 半真的跑了"——措辞可以，只是别当作与第 ⑧ 步**完全独立**的第二证据。

### S10 `connection.fetch.register` 的 disposer 被当同步函数用（现在无害，类型面上不严谨）
类型声明是 `register(route): () => Promise<void>`（`dsh-client-connection/lib/types/rpc.d.ts:128`），而 `packages/dsh-chat/host/rpc.mjs:124-131` 的 `release()` 是 `try { dispose?.(); } catch {}` —— 同步调用、**不 await**。当前实现返回的是 Cordis `effect()` 的**同步** disposer（`dsh-client-connection/lib/index.js:625-638`），所以运行时没问题；但若将来这层变成真异步并在清理时拒绝，`try/catch` 抓不到，会变成 unhandled rejection（插件卸载时静默报错）。建议写成 `void Promise.resolve(dispose?.()).catch(() => {})`。

---

## 4. 安全面：`lark-guard.evaluate` 的 8 个 `return null` 分支逐条判定

问题：0.2.0 下有没有哪一条会被**误触发**（= 拿不到 sessionId 而静默放行）？

| # | 位置 | 条件 | 0.2.0 下会不会误触发 | 判定 |
|---|---|---|---|---|
| 1 | `lark-guard.mjs:178` | `locate` / `policyFor` 不是函数 | 不会因版本漂移；是"渠道还没起来"的装配状态（`index.mjs:63` 的注释：渠道起来前直接放行） | 设计如此；**静默**（无日志），但与本轮无关 |
| 2 | `:180` | 工具名不是 `bash`/`pwsh` | 不会；`run_code`/子代理绕过是既有边界（S6/S7） | 既有边界，未文档化 |
| 3 | `:185` | 没有命令 / 不是在执行 lark-cli | 不会 | OK |
| 4 | `:196` | 取不到 sessionId（非字符串或空） | **本轮的改动点**：现在同时认 `agent.id`（活体契约里的**唯一**声明字段）与 `agent.session.header.id` / `agent.session.id`。三种都没有 ⇒ 这次工具执行**没有 caller agent**（`ToolExecutionInput.agent` 在 0.2.0 里是**可选**字段，见 `dsh-tools/lib/types/index.d.ts:229`）——那就不可能是我们某个聊天会话的调用 | **OK（比旧版更严）** |
| 5 | `:198` | `locate` 不中 / `owner.channelId !== channelId` | 子代理会话落进这一类（S6）；别的渠道/用户自己的会话落进这一类（这是设计） | 有既存残留口（S6） |
| 6 | `:205` | `policyFor` 返回 null | 与本轮无关（"拿不到策略分不清该不该管"，误拦会打死正常用法） | 设计如此 |
| 7 | `:225` | 有策略但解析不到 profileName，且段全是本机自查命令 | 不会 | OK |
| 8 | `:241` | 所有段都合规 | 正常放行 | OK |

**配套复核（都是我实测/实读的）**
- `agent.id` 就是会话 id：`dsh-agent/lib/types/types.d.ts:11-14`（`readonly id: SessionId`，注释 "Session-backed Agent identity"）；活体 `tools/pre-execute` 的 `referencedTypes` 里 `Agent` = `{ readonly id: SessionId }`（`cordis_inspect_query` 原文）。
- `.id` 与 `.session.header.id` **恒等**：`ReactLoopAgent`（`dsh-agent-loop/lib/index.js:747`）构造里 `this.id = id`（`:773`）、`this.session = session`（`:775`），而 `id` 与 `sessions.prepare(id)` 是同一个值，`dsh-session/lib/index.js:1701` 里 `header.id = sessionId`（= 传进去的那个 id）；该类**没有**第二处给 `this.session` 赋值（全会只有 3 处 `this.session =`，另两处属于别的类）。→ 用 `.id` 优先**不改变行为**，只是多认形态、不再依赖 `runtime-types.d.ts` 的运行时增量面。
- `SessionId` 运行时是**原始字符串**：`dsh-brand/lib/index.js:20-22` 的 `brandString` 是恒等函数（实测 `typeof === 'string'`）。→ `lark-guard.mjs:196` 的 `typeof sessionId !== 'string'` 判据不会被 brand 破坏（如果它返回 String 对象，门禁会**静默全放行**——这条我特意查了）。
- 飞书三处 + `sessions.mjs` 两处中继 + `prompt-context` 一处，取法**完全一致**（`grep` 全仓源码，见 §7.2）。

---

## 5. 复核 `docs/dsh-0.2.0-compat.md`（把它当被告）

我独立复核了 **6 条 PASS**（不重复 Lead 已确认的 wire 键名那批），逐字对上；另外**补实并关闭**了它 `§5` 的第 4 条。

### 5.1 已复核、判定正确
| 报告里的条目 | 我的独立证据 | 结论 |
|---|---|---|
| `:80` `engines.dsh` 的 semver 比较（前半句） | 用 **DSH 自带那份** semver 7.8.5 实跑：`satisfies('0.2.0-rc.1','>=0.1.5-rc.2',{includePrerelease:true}) === true`；不带选项 = `false`；`0.1.5-rc.2` 带选项 = `true` | **对**（后半句见 B2） |
| `:79` "本插件没有这类 peer → 预检不产生 issue" | 四个包 `package.json` 全查：`peerDependencies` 均 `undefined` | **对** |
| `:39` `PromptSection` 形状 | 活体 host/Service `systemPrompt` 的 `referencedTypes` 原文逐字一致（含 `interpolate?` / `complete?`），方法签名 `section(section: PromptSection): () => void` | **对** |
| `:40` `AssembleContext` 声明里没有 `agent` | 活体契约原文 `{ scope?: ScopeKey; signal?: AbortSignal }`；`agent` 确实来自 `dsh-agent/lib/types/runtime-types.d.ts` 的 `declare module` 增量 | **对** |
| `:50` `approval/request` 的 payload | `dsh-user-approval/lib/types/types.d.ts:55-70`：`{ readonly agent: Agent; readonly toolName: string; readonly callId?; readonly reason?; readonly displayReason?; readonly signal? }` —— 逐字段对上 | **对** |
| `:41` `shellEnv.register` 的 contributor 形状 | `dsh-shell-env/lib/types/index.d.ts:38-49`：`{ name; variables: Readonly<Record<DshEnvironmentKey, BashEnvVariable>>; resolve(execution: ToolExecution) }` | **对** |
| `:60` 四个 `dsh.client.inject` 包名都还在 | 安装树 `node_modules/@deepseek-ai/` 里四个都在 | **对** |
| `:78` `dsh.bundle.patch` / `disabled` | 第 ②/③ 步的判据我读了代码（`:426-432` 查 `dsh.profile.bundles`、`:437-463` 查合成树与 `disabled`）——**这部分逻辑是硬的** | **对** |
| `:192` "路由未注册时返回 404" | `dsh-client-connection/lib/index.js:620`（共享 fetch handler 找不到 owner 就 404）+ `:678`（RPC 通道非 POST/无 endpoint 也 404）；插件走的是精确路由（`rpc.mjs:90-121`） | **对** |
| `UPSTREAM.md:101` `InvokeRemoteRequest` 形状不变 | `dsh-api-gateway/lib/types/types.d.ts:9-24`：`{ readonly namespace; readonly method; readonly args: Readonly<Record<string, unknown>>; readonly uplink?: AsyncIterable<unknown>; readonly peer?: PeerScope; readonly signal?: AbortSignal }` —— 逐字段对上 | **对** |
| `UPSTREAM.md:103` `HostConnectionRpc`/`ConnectionFetchRoute` 不变 | `dsh-client-connection/lib/types/rpc.d.ts:107-128`：`ConnectionFetchMethod = 'GET'\|'HEAD'\|'POST'`、`ConnectionRequestBodyMode = 'buffered'\|'streaming'`、`ConnectionFetchRoute = { path; methods; requestBody; fetch }`、`HostConnectionFetch.register(route): () => Promise<void>` —— 逐字段对上；插件注册点 `packages/dsh-chat/host/rpc.mjs:90-95` | **对** |
| `UPSTREAM.md:102` `assembleContextFor` 仍返回 `{agent, scope, …}` | `dsh-agent/lib/index.js:291-297`：`return { agent, scope: agent, ...(signal === void 0 ? {} : { signal }) }` | **对** |

### 5.2 一条需要**补充 nuance**（不是错，但容易被读成"侥幸"）
`compat.md §3.1` 说"0.2.0 里面向插件的 `Agent` 接口**只声明** `{ readonly id }`（**活体契约原文**）"。这句对 `tools/pre-execute` / `approval/request` 这条插件面**成立**（我用活体契约复核过）。但要补一句：`.session` 在 0.2.0 里**并没有消失**——`dsh-agent/lib/types/runtime-types.d.ts` 的 `declare module './types.ts'` 给同一个 `Agent` 增量加了 `readonly session: Session`，而且**别的已发布面照样把完整实现面印出来**（例：`dsh-api-session-controller/lib/typert.host.js:1461` 的 `Agent` 声明里就有 `readonly session: Session`）。所以准确的说法是"**插件面**收窄成 `{id}`，运行时不再承诺 `.session`"，而不是"接口里没有 `.session` 了"。这不改变处置（先读 `.id` 是对的加固），但值得在报告里写准，免得下一个人得出"旧代码在 0.2.0 上一定坏"的结论。

### 5.3 补实：`§5 未核实` 第 4 条（`ApprovalOutcome` 字面量）可以关掉
- `ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'`（`dsh-user-approval/lib/types/types.d.ts:23`）。
- 插件这条链只可能交出两种字面量：`packages/dsh-chat/host/interactions.mjs:144-146`（`'allowed-once'` / `'rejected'` / `null`），`sessions.mjs:1159` 是 `return outcome ?? next()` ——**`null` 也走 `next()`**，不会把 `null` 交回 waterfall（抛错同理，`:1160-1163`）。
- 就算交回了非法值也不会"静默放行"：`dsh-user-approval/lib/index.js:176` 把结果规范化成 `OUTCOMES.includes(outcome) ? outcome : "unavailable"`（**失败关闭**）。
→ `§5` 第 4 条可以改成"已核实（`approval`：只可能返回两个合法字面量或 `next()`；越界值由 DSH 规范化为 `unavailable`）"。

### 5.4 我不重复的
`§2.6` 的 wire 键名那批（`_request` / `request` / `agentId` / `modelCatalog` 零参数）Lead 已给结论，我按"已确认"引用，未重跑。

---

## 6. 我没能验证的部分（**没有验过的，不写成 PASS**）

1. **没跑 `npm run check`**（tester 独占）、**没跑 `npm run check:dsh` / `npm run rehearsal`**。门禁相关的结论全部来自**读源码 + 读 DSH 实现 + 读已有输出**，不是实跑。特别是 B1 的"坏 bundle 照样绿"我**没有实跑复现**（复现方式是改坏 `lib/client.js` 再跑一次门禁——那要起第二个临时 DSH，避免与 tester 并发，我没做）。
2. `docs/dsh-0.2.0-verify.md` 在我写这份报告时**还不存在**，tester 的 7 项验证结论我没有看到，也没有复核。
3. **真实平台侧**（Lark 长连接、卡片回调、微信 iLink、真机卡片渲染）：我一条都没验，也不在离线门禁覆盖范围内。
4. **聊天会话默认 Agent preset 是否带 `subagent` 工具**（S6 的"可达性"）：我只证明路径存在，没证明模型一定够得着。
5. **子代理会话 header 上是否带 `parentSession`**（S6 建议的修法）：我没核实，所以那条建议标了"若该字段存在"。
6. `packages/dsh-chat/client/{context-enhancement.js,styles.js}`、`scripts/{check-layout.mjs,layout-fixture.mjs}` 的未提交改动：Lead 已声明是上一轮遗留、不在本轮范围，**我没有审**（`lib/client.js` 的 +21/-3 同理，只作了"lib 与源码同步"的粗查）。
7. 门禁第 ⑨ 步、第 ⑩ 步（进程回收自检）我**没有实跑**，只是读代码判断（`:596-604`、`:656-665`）。第 ⑩ 步在 `SIGKILL` 之后立刻 `isAlive`，理论上存在"进程还没被 reap 就被判存活"的偶发假红窗口（`cleanup()` 后只 `sleep(200)`）——我没能证实会不会真的偶发。
8. `evaluatePluginCompatibility` 只看 `peerDependencies`（不读 `engines.dsh`）：按 Lead 的"已确认"引用，我**没有**重跑那份源码。

---

## 7. 我复核后确认"没问题"的关键点（省 Lead 的重复劳动）

1. **构建产物是最新的**（不是"只改了源码"）：
   - `packages/dsh-chat/lib/index.js:4153`（`sessionIdOfAgent`）、`:3685`（`prompt-context` 的 `sessionIdOf`）
   - `packages/dsh-chat-feishu/lib/index.js:129838`（guard）、`:132690`（渠道三处共用）
   - `CHANNEL_VERSION = "0.2.1"`：飞书 `lib/index.js:132684`、微信 `lib/index.js:1899`；`HUB_VERSION = "0.2.1"`：`lib/index.js:19`
   - 交付提示词：把 `lib/index.js` 的 `\uXXXX` 解码后逐句比对，四条新/改文案**全在**，且**旧句"报表 / SQL / 图表 / 导出"不在渲染数组里**（只在解释性注释里）——esbuild 会把中文转义，别用中文 grep 判 lib 是否过期。
2. **取法一致**：全仓源码里这套三元取法只有 **4 个定义点**（`packages/dsh-chat/host/sessions.mjs:61`、`host/prompt-context.mjs:41`、`packages/dsh-chat-feishu/host/index.mjs:43`、`host/lark-guard.mjs:193-195`），语义同一；飞书三处调用点（`index.mjs:158`、`:264`、`:354`）与 `sessions.mjs` 三处调用点（`:1136`、`:1148`、`:1168`）都走各自文件里那一份 helper，传参正确（`request?.agent` / `context?.agent` / `execution?.agent` / `exec?.agent`）。
3. **`.id` 与 `.session.header.id` 恒等**（判据见 §4），所以"先读 `.id`"是纯加固，不改变任何行为分支。
4. **版本面一致**：三包 `0.2.1` + `HUB_VERSION` + 两个 `CHANNEL_VERSION` 全对齐；`dsh-chat-fixture` 仍是 `0.0.1`（`private: true`、不发布、无 `CHANNEL_VERSION`，有意不参与对账）；全仓 `grep` 未发现残留的旧版本号（除 DSH 版本语境与反向验证说明）。
5. **写范围干净**：`git diff --stat` 覆盖的文件 = task-2 声明的写范围 + Lead 的 `AGENTS.md` + Lead 已声明的 4 个遗留文件；未跟踪文件只有 `docs/` 与 `scripts/check-dsh-compat.mjs`。
6. **`check:dsh` 没有混进 `npm run check`**（`package.json` scripts 实测：`check` = build + test + verify-package + check:layout）。
7. **门禁绝大部分判据是硬的、会红的**：第 ②/③ 步（装包 + `dsh.profile.bundles` + 合成树 + `disabled`）、第 ⑤ 步（`hub.log` 就绪行）、第 ⑧ 步（`channel.list` **同时**含 `feishu` 与 `weixin` + `hubVersion` 对账 + `dataDir` 必须在临时 home 内）都经我读码确认；`tempHome` 是每次全新 `mkdtemp`（`:381`），**不存在读上一轮残留 hub.log 的假绿**（这是 task-4 第 1 项里明确要问的一条，答案是"不会"）。
8. **超时基本有界**：除第 ④ 步 `booted` 进程本身（由 60s 轮询兜住）外，所有"等外部进程"的等待都在 `step()` 的 `withTimeout` 里；`locateDsh` / `freePort` / `mkdtemp` 都是本地快速调用（`isExecutableFile` 用 `stat`，即便是 FIFO 也不会阻塞在 `open` 上）。唯一的"有界但会留下在飞子进程"的情况见 S2。
9. **微信渠道无同类路径**：`grep -rn "agent?.session\|session?.header\|agent?.id" packages/dsh-chat-weixin` **零命中**；它的 host 不接 `tools/pre-execute`、不注册 `shellEnv`，会话 id 全程由 hub 的 `sessions.mjs` 处理 → **不需要跟改**（task-4 第 4 项）。
10. **`docs`/`UPSTREAM.md` 的"未能就地复核"标注确认存在**（task-4 第 6 项问的那句）：`UPSTREAM.md:89-90` 明确写了"本机没装市场包，这一条按既定口径记录，未能就地复核；上面两句是真跑过的"。**问题不在 UPSTREAM.md**，在于 `compat.md:80` 的 PASS 与 `AGENTS.md:81` 的无标注复述（B2）。
