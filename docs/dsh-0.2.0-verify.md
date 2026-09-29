# dsh-chat × DSH 0.2.0-rc.1 迭代验证记录

**最终验收：通过。** 本文件记录**谁验了什么、用什么证据、以及哪些没验**。
规则：**没有实跑过的不写成"通过"**；别人的结论一律标注来源。

> ⚠️ 关于分工的如实说明：本轮原计划由独立 `tester` 角色跑全量验证并撰写本文件，
> 但该角色在时间预算内**没有落盘任何结果**（被 Lead 中断）。
> 因此本文件由 **Lead** 在**冻结的树**上亲自执行最终验收后撰写；
> 其中"反向验证"与"新单测是否真会红"两项另有一份**独立**证据（来自对抗性审查角色），已注明来源。
> 凡是只有单方证据的，都写明了。

验收对象：工作树即最终产物（未提交）。三个发布包版本 `0.2.1`。
验收时间：2026-09-29 01:0x（Asia/Shanghai）　运行 DSH：`0.2.0-rc.1`（桌面端）

---

## 1. 最终验收（Lead，冻结树，四条全绿）

冻结前提：dev / reviewer 已 `inactive`（写手停手），tester / auditor 已中断。
唯一例外是 Lead 自己的最终 `npm run build`（生成产物）——它跑完后 `lib/` 与源码一致。

| # | 命令 | 实际结果 | 结论 |
|---|---|---|---|
| 1 | `npm run build` | 8 行 `Wrote …`（4 个包 × host+client），`已构建 4 个包` | ✅ |
| 2 | `npm run check` | `tests 468 / pass 468 / fail 0`；`打包自检通过：4 个包`；`布局守门通过：45 帧（549/360/320px × 15 个场景）` | ✅ |
| 3 | `npm run rehearsal` | `演练结果：14/14 通过`（14 条逐条 ✅） | ✅ |
| 4 | `npm run check:dsh` | **`门禁结果：12/12 通过`**，退出码 0 | ✅ |

其中 `check:dsh` 的 12 条（原文摘要）：

```
✅ 1. 从出厂模板建临时 profile 并打印合成树（离线）
✅ 2. 三个包逐个装进临时 profile（dsh-chat / dsh-chat-feishu / dsh-chat-weixin）
✅ 3. 合成树里三个包都在、且都没有被 disabled
✅ 4. 启动 dsh web（127.0.0.1:55166）并拿到带 token 的地址
✅ 5. hub 日志出现「hub 已就绪（契约 v1）」（host 半真的跑起来了）
✅ 6. 带 token 打开设置页：200，且客户端插件图里有本插件
✅ 7. 真拉一次客户端 bundle：HTTP 200 且非空（不是只看插件图）
✅ 8. 三个 client 产物语法自检（node --check）
✅ 9. 设置页线路（信封格式完全相同）：hub 路由通、返回结构化信封
✅ 10. 真实业务调用（channel.list）：feishu 与 weixin 都注册进来了 + 版本对账
✅ 11. 两个渠道的日志文件都落在临时 DSH_HOME 里（渠道 host 半真的跑了）
✅ 12. 收尾：自己起的 dsh 进程组已全部回收，无残留进程
```

## 2. 反向验证：这些门禁**真的会红**

门禁最有价值的性质是"能红"。逐条实测（不是推理）：

| 变异 | 期望 | 实测 | 来源 |
|---|---|---|---|
| 改坏 `packages/dsh-chat-feishu/cordis.patch.yml` 的 `name` | 合成树 / `channel.list` / 渠道日志三条同时红 | ❌ 第 3、8、9 步红，`7/10`，退出码 1；改回后 `git diff` 为空 | dev（旧 10 步版） |
| `lib/index.js` 里的 `HUB_VERSION` 回退成 `0.2.0` | 版本对账红 | ❌ 第 8 步红（运行期自报 ≠ `package.json`）；已复原 | dev |
| **`lib/client.js` 尾部注入 `const broken = (((;`** | 语法自检红 | ❌ **第 8 步红（`11/12`，退出码 1）**，且**第 6、7 步仍然绿** —— 这正是审查指出的"插件图/HTTP 拉取都不读 bundle 内容"那个假绿口子；已复原 | **Lead**（12 步版） |
| 把四处会话 id 取法改回旧的"只读 `.session?.id`" | 新单测红 | ❌ 副本里 `node --test` 四个文件：基线 62/62 → 改旧后 **7 fail**（新增 3 + 扩展 2 全红 + 2 条既有连带红） | **reviewer（独立，在 `/tmp` 副本里做，工作树零改动）** |
| 同一变异（dev 自己那次） | 新用例红 | ❌ `tests 36 / pass 35 / fail 1`；改回后绿 | dev |
| 未注册路由 | 信封断言红 | 实测未注册路径返回 **404 纯文本**，第 9 步要求"HTTP 200 + 能 JSON.parse + `rpcId` 对 + `code` 以 `chat/` 开头"，放不过去 | reviewer 复核 + Lead |

**假绿路径逐条排除**（reviewer 实测/读码，Lead 复核）：
- 临时 `DSH_HOME` 每次全新 `mkdtemp` → **不存在**读到上一轮残留 `hub.log` 的假绿；
- 找不到 `dsh` 时"跳过 + 退出 0"**在输出里留了可见提示**，且取舍写进了脚本文档；
- 第 10 步要求 `channel.list` 里**同时**有 `feishu` 与 `weixin`（不是"至少一个"），并额外对账 `hubVersion` 与 `dataDir` 落在临时 home 内。

## 3. 审查提出的 3 项阻塞级问题 —— 处置

| # | 问题 | 处置 | 验证 |
|---|---|---|---|
| **B1** | `check:dsh` 第 ⑥ 步（index 里有插件 id）声称证明了"client 半被加载"，但那是 **host 侧合成**的插件图——`dsh-client-modules` 只校验 `exports` 里有 `./client`，**从不读 bundle 内容**；`lib/client.js` 语法坏掉照样绿（正是本项目踩过的"白屏"形态） | **已修**：第 ⑥ 步措辞收紧为"插件图里有本插件"；**新增第 ⑦ 步**真 GET 一次 bundle（HTTP 200 + 非空）、**新增第 ⑧ 步** `node --check` 三个 client 产物。`docs/dsh-0.2.0-compat.md` §2.4/§5 同步改正并加了警告 | ✅ 见 §2 第 3 行（注入语法错误 → 第 ⑧ 步红、第 ⑦ 步仍绿，证明这一步补的正是缺口） |
| **B2** | `compat.md` 把**未核实**的"dshmarket 也用 `includePrerelease`"半句与真跑过的 semver 半句**绑成一个 PASS**；`AGENTS.md` 也无限定语复述 | **已修**：`compat.md` §2.5 拆成两行（未核实那行判 **未核实**）并列入 §5.6；`UPSTREAM.md` 原本已自带"未能就地复核"限定语（保留）；`AGENTS.md` 补上限定语 | ✅ 文案级，逐行核对 |
| **B3** | `prompt-context.mjs` 有一段**功能性**交付提示词改动（不再点名 SQL、新增"脚本类不算成品"），无任何任务/文档记录 | **判定：不是本次迭代引入的**——它在本轮**任何 teammate 动手之前**就已经在工作树里（本轮开局第一次 `git status` 就带 `M packages/dsh-chat/host/prompt-context.mjs` 与 `M test/prompt-context.test.mjs`，属上一个迭代的未提交遗留）。**已补文档**：`AGENTS.md`「文件交付只有一条路」那节写清这条口径与它的由来（两段提示词曾互相矛盾），并写明改正文必须同时改 `test/prompt-context.test.mjs` | ✅ 开局 `git status` 快照 + `git log` |

另有 **10 条建议级**（S1–S10）在 `docs/dsh-0.2.0-review.md` §3。
其中 **S10 已修**：`packages/dsh-chat/host/rpc.mjs` 的 `release()` 改成
`Promise.resolve(dispose?.()).catch(() => {})`——兼容"disposer 返回 Promise"的实现，
挡住将来异步拒绝变成 unhandled rejection。
其余（门禁 stale-lib 假绿、级联假红、子代理绕过口可达性、README 命令表补 `check:dsh` 等）
**未处理**，留给后续迭代；详见该报告。

## 4. 用户数据未被触碰（验过，不是承诺）

- 门禁全程 `DSH_HOME=<mkdtemp>`，**不写 `~/.dsh`**；
- 实跑后核对：`~/.dsh/integrations/dsh-chat/logs/` 四个文件的 mtime 仍是
  **Sep 28 23:49–23:58**（本轮所有门禁都在 00:0x 之后跑），`hub.log` 最后一行仍停在
  23:58 那条业务日志 —— **一个字节没被本轮写**；
- 门禁内部还断言运行期 DSH 自报的 `dataDir` 落在临时 home 内；
- dev 另做过 6620 文件 mtime+sha256 快照 diff（唯一变化是其它 teammate 的测试 profile）。
- 收尾：临时 home 与临时文件已清理，**无残留 dsh 进程**（实测 0）。

## 5. 没验的（**明确列出，不许当成通过**）

1. **真实平台侧一条未验**：Lark 长连接、飞书卡片回调、真机卡片渲染、微信 iLink 扫码 ——
   需要重启用户的 DSH 桌面端并动真实凭据，本轮**刻意不做**（那只能在真机上验）。
2. `check:dsh` 第 10 步的 `channels` 只证明**渠道包加载并注册成功**，
   不证明它们能跟平台说话。
3. `compat.md §5` 其余未核实项（`session-badges.js` 的 DOM 假设 vs 新槽位
   `sidebar.session.row.leading`、`build-client.mjs` 包装与官方产物逐字段对比、
   `credentials` 各方法形状、dshmarket 判定）**仍未核实**。
   ⚠️ 其中"新槽位 `sidebar.session.row.leading`"值得优先——它看起来是
   `session-badges.js` 那个 DOM hack 的**正规插槽**，真机看一眼会话行徽标即可判定。
4. `docs/dsh-0.2.0-review.md` 里 S1–S9 建议级问题未修。
5. 微信渠道**无**同类会话 id 取法路径（reviewer 已 grep 确认零命中），故未改动。
