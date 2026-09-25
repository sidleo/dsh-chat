/**
 * 布局守门：把真实组件在 549 / 360 / 320px 下渲染出来，量两件事。
 *
 * 1. **横向不溢出**：任何一帧 `scrollWidth <= clientWidth`。窄栏里一个 `flex: none`
 *    打在 `width: 100%` 的下拉框上，就会把同排按钮挤出容器、整页出现横向滚动条。
 * 2. **不逐字竖排**：按钮 / 状态点 / 分组标题必须是单行。中文的 `min-content` 只有一个字，
 *    flex 一旦把它们压缩，就会出现"运行正/常""设/置"这种一字一行。
 *
 * 这两类问题语法与单测都发现不了（构建通过、测试全绿、真机上才炸），只能真的渲染。
 * 页面入口是 `scripts/layout-fixture.mjs`，断言在 Node 侧做。
 *
 * 覆盖范围：hub 共享组件 + **整张飞书/微信渠道卡** + hub 整页（页头两个入口、左栏、机器人列表）。
 * 交互态（改名输入、展开日志尾部、展开诊断/版本面板）由 fixture 点一次按钮后再量，
 * 且只"展开"不"收起"——settle 跑两轮，无脑点会把上一轮展开的面板又关掉（等于没测）。
 *
 * 用法：node scripts/check-layout.mjs
 *
 * @module dsh-chat/check-layout
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 找本机 Chrome；找不到就跳过（不能让没有 Chrome 的机器跑不了 check）。 */
function findChrome() {
  const candidates = [
    process.env.DSH_CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) ?? null;
}

const chrome = findChrome();
if (!chrome) {
  console.log('· 跳过布局守门：本机没找到 Chrome（可用 DSH_CHROME 指定路径）');
  process.exit(0);
}

const workDir = mkdtempSync(join(tmpdir(), 'dsh-chat-layout-'));
try {
  const bundlePath = join(workDir, 'layout.js');
  await build({
    entryPoints: [join(root, 'scripts/layout-fixture.mjs')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    outfile: bundlePath,
    define: { 'process.env.NODE_ENV': '"development"' },
    logLevel: 'warning',
  });

  const html = `<!doctype html><html><head><meta charset="utf-8">
<style>
:root{
--dsw-font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
--dsw-alias-bg-layer-1:#fff;--dsw-alias-bg-layer-2:#f2f3f5;
--dsw-alias-border-l1:#e5e6eb;--dsw-alias-border-l2:#dee0e3;--dsw-alias-border-l3:#d0d3d6;
--dsw-alias-label-primary:#1f2329;--dsw-alias-label-secondary:#646a73;--dsw-alias-label-tertiary:#8f959e;
--dsw-alias-brand-primary:#3370ff;--dsw-alias-link:#3370ff;
--dsw-alias-interactive-bg-hover:rgba(31,35,41,.08);
--dsw-alias-state-success-primary:#34c724;--dsw-alias-state-warn-primary:#ff8800;
--dsw-alias-state-error-primary:#f54a45;--dsw-alias-separator-primary:#e5e6eb;
--dsw-alias-markdown-code-block:#f2f3f5;
--dsw-font-markdown-code-block-small:ui-monospace,SFMono-Regular,monospace;
}
*{box-sizing:border-box}
body{margin:0;background:#fff;font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary)}
.frame{padding:14px 18px}
</style></head><body><div id="root"></div>
<script>
/**
 * 预置一份"用户排过的渠道顺序"：飞书在前、微信在后（与注册顺序相反）。
 *
 * 守门据此断言**默认打开的渠道 = 排在最前面的那个**——真机上栽过：顺序调完，
 * 一进设置页仍然默认打开注册顺序里的第一个（微信）。
 */
try {
  localStorage.setItem('dsh-chat:order:channels', JSON.stringify(['feishu', 'weixin']));
} catch (error) { /* file:// 下可能不可用：那就不预置，守门只验默认顺序自洽 */ }
</script>
<script src="./layout.js"></script></body></html>`;
  const htmlPath = join(workDir, 'layout.html');
  writeFileSync(htmlPath, html);

  const dom = execFileSync(chrome, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--virtual-time-budget=8000',
    '--dump-dom',
    `file://${htmlPath}`,
  ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

  const matched = /<pre id="dsh-layout-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!matched) {
    const error = /<pre id="dsh-layout-error">([\s\S]*?)<\/pre>/.exec(dom)?.[1];
    console.error('布局守门失败：页面没有产出测量结果。');
    if (error) console.error(`  页面报错：${error.slice(0, 600)}`);
    process.exit(1);
  }
  const results = JSON.parse(matched[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

  const failures = [];
  if (results.length === 0) failures.push('没有测到任何帧（测试本身失效了）');
  for (const frame of results) {
    const where = `${frame.scenario} @${frame.width}px`;
    if (!(frame.cards > 0)) {
      failures.push(`${where}: 没有渲染出卡片（测试本身失效了）`);
      continue;
    }
    if (frame.overflow > 1) {
      const who = (frame.widest ?? [])
        .map((item) => `${item.selector}(+${item.over}${item.text ? ` 「${item.text}」` : ''})`).join('、');
      failures.push(`${where}: 横向溢出 ${frame.overflow}px${who ? ` —— ${who}` : ''}`);
    }
    for (const item of frame.tall) {
      failures.push(`${where}: 「${item.text}」被折成多行（高 ${item.height}px > ${item.limit}px）`);
    }
  }

  // 设置页的显示项必须**反映已保存的配置**（假数据里私聊关了"访问策略"、群聊关了"渠道动作按钮"）：
  // 漏传字段的后果是"永远全勾"，它在真机上表现为"我明明关了却没生效"。
  const checks = results.flatMap((frame) => frame.sectionChecks ?? []);
  if (checks.length > 0) {
    if (!checks.some((item) => item.checked === false)) {
      failures.push('「控制面板显示项」的勾选状态全是勾上的——渠道卡很可能漏传了 panelSections');
    }
    /**
     * 找的是"哪一层"不重要（场合切换器决定了画全局还是某个场合层），
     * 重要的是**这一项真的渲染成没勾**——所以按前缀找、不写死层名。
     */
    const policyRow = checks.find((item) => item.label.startsWith('访问策略（本会话） · '));
    if (!policyRow) failures.push('「控制面板显示项」里找不到「访问策略（本会话）」那一行');
    else if (policyRow.checked !== false) {
      failures.push(`配了关闭的「${policyRow.label}」渲染成了勾上`);
    }
  }

  // 「卡片友好回答」开关：必须画在机器人卡片上，且反映假数据（false = 不勾）。
  const answerFrames = results.filter((frame) => frame.cardAnswer != null);
  if (answerFrames.length === 0) failures.push('没测到「卡片友好回答」开关（机器人卡片里缺了它）');
  for (const frame of answerFrames) {
    if (frame.cardAnswer !== false) {
      failures.push(`${frame.scenario} @${frame.width}px: 「卡片友好回答」显示为勾上，与假数据（false）不符`);
    }
  }

  /**
   * lark-cli 身份：分层下拉的当前值必须反映假数据。
   *
   * 假数据里三层各不相同（全局=仅应用、私聊=应用+用户、群聊=仅应用），
   * 所以"漏传某一层"或"永远显示默认值"都会被抓到。
   *
   * ⚠️ 场合切换器上线后**一次只画两层**（全局 + 当前场合）：
   * 选了"继承上一层"就要求看得见上一层是什么，所以全局层永远在。
   * 因此这里的期望是"全局必在 + 当前场合那一层必在"，而不是三层都在。
   * 当前场合取 `data-scope-active`（守门同时也断言了它恰好一个）。
   */
  const LARK_EXPECTED = { global: 'bot', direct: 'both', group: 'bot' };
  const larkFrames = results.filter((frame) => frame.larkIdentity != null
    && Object.keys(frame.larkIdentity).length > 0);
  if (larkFrames.length === 0) failures.push('没测到「lark-cli 身份」下拉（守门本身失效了）');
  for (const frame of larkFrames) {
    const where = `${frame.scenario} @${frame.width}px`;
    // 全局层是唯一必填的一层（其余都可"继承"，但要有得可继承）。
    if (frame.larkIdentity.global !== LARK_EXPECTED.global) {
      failures.push(`${where}: 「lark-cli 身份」global 下拉显示的是 `
        + `${frame.larkIdentity.global ?? '(缺席)'}，与假数据（${LARK_EXPECTED.global}）不符`);
    }
    /**
     * lark-cli 身份**只画当前层**——与页面上其余设置项完全一致。
     *
     * 早先这里画的是"全局 + 当前层"两层同屏，真机反馈自相矛盾：
     * 切到"全局"时卡里冒出"私聊"下拉、切到"私聊"时又冒出"全局"，
     * 用户以为主体切换器坏了。所以现在钉死：**只有一个下拉，且就是当前层**。
     */
    const active = (frame.scopeSwitcher ?? []).find((tab) => tab.active)?.key ?? 'global';
    const expected = LARK_EXPECTED[active];
    if (expected && frame.larkIdentity[active] !== expected) {
      failures.push(`${where}: 当前场合是 ${active}，但「lark-cli 身份」显示的是 `
        + `${frame.larkIdentity[active] ?? '(缺席)'}，与假数据（${expected}）不符`);
    }
    // 另外两层不该同时出现（那正是真机反馈的"主体切了、卡里还是两层"）。
    const others = ['global', 'direct', 'group'].filter((key) => key !== active);
    for (const key of others) {
      if (frame.larkIdentity[key] !== undefined) {
        failures.push(`${where}: 当前场合是 ${active}，却还画着 ${key} 那一层下拉（层没收敛）`);
      }
    }
  }

  /**
   * 上下文增强弹窗：可见的页签面板**只能有一个**，且必须是当前场合那一个。
   *
   * 这里守的是一件真出过事的东西：`hidden` 属性只在 UA 样式里是 `display:none`，
   * 任何作者样式里的 `display` 都会盖掉它——当初两个页签就是这么变成"内容一模一样"的
   * （去掉那条 CSS 守门立刻红）。
   *
   * ⚠️ 页签数**不再固定为 2**：场合切换器上线后，场合由页头统一选定，
   * 弹窗里就不再画两个页签（单场合只画一个面板、连 `.dchat-tab` 都没有）。
   * 所以断言改成"面板数 ∈ {1,2}"，并保留"可见的恰好 1 个"这个真正要守的不变量。
   */
  const dialogs = results.find((frame) => (frame.dialogs ?? []).length > 0)?.dialogs ?? [];
  if (dialogs.length === 0) {
    failures.push('没测到上下文增强面板的页签（守门本身失效了）');
  }
  for (const [index, dialog] of dialogs.entries()) {
    if (![1, 2].includes(dialog.total)) {
      failures.push(`弹窗 ${index + 1} 的页签面板数是 ${dialog.total}（应为 1 或 2）`);
    }
    if (dialog.visible.length !== 1) {
      failures.push(`弹窗 ${index + 1} 可见的页签有 ${dialog.visible.length} 个（应为 1）：`
        + `${dialog.visible.join('、')}`);
    } else if (dialog.activeScope && dialog.visible[0] !== dialog.activeScope) {
      failures.push(`弹窗 ${index + 1} 可见的是 ${dialog.visible[0]}，但选中的是 ${dialog.activeScope}`);
    }
  }

  /**
   * 场合切换器：分场合的设置项必须**只画当前场合那一份**。
   *
   * 这是这次重构的核心不变量——把 4 个分叉项各自的画法（并排两块 / 竖排两个下拉 /
   * 8×2 勾选表格 / 弹窗页签）收敛成"页头选一次场合"。守它两件事：
   * ① 切换器反映当前场合（不是永远停在第一项）；② 私聊/群聊两个选项都在（否则切不了）。
   */
  const scopeFrames = results.filter((frame) => (frame.scopeSwitcher ?? []).length > 0);
  if (scopeFrames.length === 0) failures.push('没测到场合切换器（守门本身失效了）');
  for (const frame of scopeFrames) {
    const where = `${frame.scenario} @${frame.width}px`;
    const tabs = frame.scopeSwitcher;
    const active = tabs.filter((tab) => tab.active);
    if (tabs.length < 2) {
      failures.push(`${where}: 场合切换器只有 ${tabs.length} 个选项（私聊/群聊都要有）`);
    }
    if (active.length !== 1) {
      failures.push(`${where}: 场合切换器当前选中的有 ${active.length} 个（应为 1）：`
        + `${tabs.map((tab) => `${tab.label}${tab.active ? '✓' : ''}`).join('、')}`);
    }
  }

  // 渠道设置入口按渠道显示：飞书那个入口是「新建机器人接入」（填自建应用凭据），
  // 微信是「扫码接入」（唯一的接入入口，名称由渠道给）。两者都是"打开渠道自己的页面"，
  // 不再有当初那个点进去什么都改不了的「渠道设置」空壳。
  for (const frame of results.filter((item) => (item.panelButtons ?? []).length > 0)) {
    const where = `${frame.scenario} @${frame.width}px`;
    const buttons = frame.panelButtons;
    if (frame.activeChannel === '飞书' && buttons.includes('渠道设置')) {
      failures.push(`${where}: 飞书不该有「渠道设置」入口（点进去与机器人设置重复）`);
    }
    if (frame.activeChannel === '飞书' && !buttons.includes('新建机器人接入')) {
      failures.push(`${where}: 飞书缺「新建机器人接入」入口（那是唯一的接入入口）`);
    }
    if (frame.activeChannel === '微信' && !buttons.includes('扫码接入')) {
      failures.push(`${where}: 微信缺「扫码接入」入口（渠道声明了 setup.label）`);
    }
  }

  // 机器人列表的空态：渠道没给 `setup.hint` 时要用 hub 那句中性的接入说明。
  // `setup` 只给一半的形态真实存在（有入口没说明 / 有说明没入口），两半都得能渲染——
  // 兜底那句里用到的 `t` 曾经声明在使用之后，一旦走到这条分支就是 TDZ 崩溃。
  const emptyFrames = results.filter((frame) => frame.activeChannel === '微信');
  if (emptyFrames.length === 0) failures.push('没测到微信的机器人列表（守门本身失效了）');
  for (const frame of emptyFrames) {
    if (!String(frame.emptyHint ?? '').includes('在渠道自己的配置里完成接入后，机器人会出现在这里。')) {
      failures.push(`${frame.scenario} @${frame.width}px: 渠道没给 setup.hint，空态说明不是那句中性兜底`
        + `（实际：${frame.emptyHint || '空'}）`);
    }
  }

  /**
   * 设置页分组：每一项设置都必须**落在某一组里**，且分类导航与分组一一对应。
   *
   * 这条守的是"重构最容易被后来者破坏的地方"：机器人设置页是逐轮追加出来的
   * （10 张卡平铺、实测 3200+px 高，想改一项得盲滚），所以加了分组导航。
   * 但下次新加一项时若顺手写在 `BotCard` 末尾，它会掉在最后一组外面——
   * **页面照常渲染、卡片照常显示、单测全绿**，只是没有标题、也没有分类能跳到它。
   * 所以这里钉两件事：① 不许有"没被分进任何一组"的设置卡；② 分类数与分组数一致。
   */
  const groupedFrames = results.filter((frame) => (frame.settingGroups ?? []).length > 0);
  if (groupedFrames.length === 0) failures.push('没测到设置页分组（守门本身失效了）');
  for (const frame of groupedFrames) {
    const where = `${frame.scenario} @${frame.width}px`;
    const groups = frame.settingGroups;
    if ((frame.ungroupedCards ?? 0) > 0) {
      failures.push(`${where}: 有 ${frame.ungroupedCards} 张设置卡片没被分进任何一组`
        + '（新加的设置项要放进 settingGroups 里，否则用户找不到它）');
    }
    // 分类导航的个数 = 分组个数，顺序一致（导航按下标跳转，对不上就会跳错组）。
    if (frame.groupTabs.length !== groups.length) {
      failures.push(`${where}: 分类导航有 ${frame.groupTabs.length} 个，分组有 ${groups.length} 个，对不上`);
    }
    for (const [index, group] of groups.entries()) {
      if (!group.title) failures.push(`${where}: 第 ${index + 1} 组没有标题`);
      if (group.items.length === 0) failures.push(`${where}: 分组「${group.title}」里一个设置项都没有`);
    }
    // 每一项只能属于一组（同一个 item 出现两次 = 同一张卡被画了两遍）。
    const allItems = groups.flatMap((group) => group.items);
    const duplicated = allItems.filter((key, index) => allItems.indexOf(key) !== index);
    if (duplicated.length > 0) {
      failures.push(`${where}: 设置项被分进多组：${[...new Set(duplicated)].join('、')}`);
    }
  }
  // 每一组都要有分类按钮，且按钮文案就是组标题（用户点分类要能对上组名）。
  for (const frame of groupedFrames) {
    const where = `${frame.scenario} @${frame.width}px`;
    for (const group of frame.settingGroups) {
      if (frame.groupTabs.length > 0 && !frame.groupTabs.includes(group.title)) {
        failures.push(`${where}: 分组「${group.title}」在分类导航里没有对应按钮`);
      }
    }
  }

  /**
   * 帮助图标：**说明文字必须真的有地方可去，而且默认不许占版面**。
   *
   * 这一轮把大量常驻说明收进了问号，并改成**悬浮气泡**（用户要求"不做点击在页面显示"）。
   * 守门钉三条：
   * ① 卡片上确实画了问号，且气泡里有文字（挡住"说明被删了"）；
   * ② **默认不可见**——它必须是气泡，不能退回"常驻展开一段"（那就白改了）；
   * ③ 聚焦后可见——证明 hover/focus 那条 CSS 规则真的接上了
   *   （删掉 \`:focus-within\` 规则时这条会红）。
   */
  const hintFrames = results.filter((frame) => (frame.helpHints ?? []).length > 0);
  if (hintFrames.length === 0) failures.push('没测到帮助图标（守门本身失效了）');
  for (const frame of hintFrames) {
    const where = `${frame.scenario} @${frame.width}px`;
    for (const hint of frame.helpHints) {
      if (!hint.text) {
        failures.push(`${where}: 有个帮助图标的气泡里没有文字（说明等于被删了）`);
      }
      if (hint.visibleBeforeFocus) {
        failures.push(`${where}: 帮助气泡默认就可见——它必须是"悬浮才显示"，不能常驻展开`);
      }
      if (!hint.visibleAfterFocus) {
        failures.push(`${where}: 聚焦后帮助气泡仍不可见（hover/focus 的 CSS 规则没接上）`);
      }
      /**
       * **宽度**：气泡必须够宽，否则说明会被压成一条竖线。
       *
       * 这一条是真机截图逼出来的：把定位基准挂在"说明那一行"上时，
       * 「上下文增强」那张卡的描述**整句都在气泡里**、那一行只剩一个问号，
       * 于是基准只有约 100px 宽，气泡被压成又窄又高的竖条。
       * 早先只断言了"可见"——可见但没法读，等于没做到。
       */
      if (hint.visibleAfterFocus && hint.width < 140) {
        failures.push(`${where}: 帮助气泡只有 ${hint.width}px 宽（说明会被压成竖条）`);
      }
    }
  }

  /**
   * **渠道页不许出现这个渠道不支持的东西。**
   *
   * 真机反馈（用户原话）："微信的配置中存在很多微信不支持的功能"。查下来是三处：
   * ① 微信的 `/menu` 发的是**文本**命令清单、根本不画卡片（`commands.mjs` 的 `reply` 那条路，
   *    `panel.sections` 用不上），所以整张「控制面板显示项」在微信上是摆设；
   * ② 那张卡里「渠道设置（任务过程展示等）」「渠道动作按钮（重连等）」微信更是**没有这两个东西**
   *    （微信不实现 `panel.fields` / `panel.actions`）；
   * ③ 访问策略里"属主在「权限与身份」那一组里单独设置"指向一张**微信页上不存在**的卡
   *    （微信的属主 = 扫码绑定的人，不可改）。
   *
   * 这里把"渠道声明"与"页面画了什么"对起来——**声明了没有卡片面板，页面上就不许有那张卡**。
   * 声明与实现一旦不一致（比如以后有人顺手把卡加回去），这条会红。
   */
  for (const frame of results.filter((item) => item.declaredPanel !== undefined)) {
    const where = `${frame.scenario} @${frame.width}px`;
    const hasPanelCard = (frame.cardTitles ?? []).includes('控制面板显示项');
    if (frame.declaredPanel === false && hasPanelCard) {
      failures.push(`${where}: 这个渠道声明了没有卡片面板，却还画着「控制面板显示项」`
        + '（那张卡的开关一个都不生效）');
    }
    if (frame.declaredPanel !== false && !hasPanelCard) {
      failures.push(`${where}: 这个渠道有卡片面板，却少了「控制面板显示项」`);
    }
  }

  /**
   * **来源字段的勾选框 = 渠道真能提供的那些。**
   *
   * 实测两个渠道都**没有实现** `senderName` / `conversationTitle`（schema 里有、没人填），
   * 微信更是连 `threadId` 都没有、`chatId` 恒等于 `senderId`、`conversationType` 恒为 direct。
   * 把这些列出来，用户勾了也永远没值——静默无效，正是"配置里一堆用不上的东西"。
   * 声明了 `sourceFields` 就必须与画出来的一致（多画、少画都红）。
   */
  for (const frame of results.filter((item) => Array.isArray(item.declaredFields))) {
    const where = `${frame.scenario} @${frame.width}px`;
    const declared = [...frame.declaredFields].sort();
    const rendered = [...(frame.renderedFields ?? [])].sort();
    const extra = rendered.filter((key) => !declared.includes(key));
    const missing = declared.filter((key) => !rendered.includes(key));
    if (extra.length > 0) {
      failures.push(`${where}: 来源字段多画了这个渠道提供不了的：${extra.join('、')}`);
    }
    if (missing.length > 0) {
      failures.push(`${where}: 渠道声明能提供的来源字段没画出来：${missing.join('、')}`);
    }
  }

  /**
   * **微信按"只给属主自己用"处理**（用户确认的定位）——所以那两块不许出现在微信页上：
   * ① 「访问策略」：属主 = 扫码绑定的人，而缺省策略（仅名单内 + 空名单）**恰好就是
   *    "只有属主能用"**，也就是微信的常态；想加人得填 `from_user_id`（微信不显示这个 id、
   *    页面也没有选择器），想放开只能选「任何人可用」——在"给我自己用"的渠道上那是挖坑。
   * ② 「指定用户」：只有一个人在聊，再给他单开一份设置是多余的。
   * 真要用命令放人，`/allow` / `/deny` 仍然有效（属主在聊天里可用）——去掉的是界面，不是能力。
   */
  for (const frame of results.filter((item) => item.scenario === 'weixinCard')) {
    const where = `${frame.scenario} @${frame.width}px`;
    for (const forbidden of ['访问策略', '指定用户']) {
      if ((frame.cardTitles ?? []).includes(forbidden)) {
        failures.push(`${where}: 微信定位是"只给属主自己用"，不该有「${forbidden}」这张卡`);
      }
    }
  }

  // 访问策略白名单：有名字时必须显示"名字 + id"（只显示 id 时一排 ou_… 认不出是谁，
  // 真机反馈"白名单只显示 id 不显示名称，不方便管理"）；查不到的照样显示 id。
  // 只看专门那个场景：渠道卡与 shared 里也有白名单行，但它们不该背这条断言。
  const namedFrames = results.filter((frame) => frame.scenario === 'policyNames');
  if (namedFrames.length === 0) failures.push('没测到白名单行（守门本身失效了）');
  for (const frame of namedFrames) {
    const where = `${frame.scenario} @${frame.width}px`;
    const named = frame.policyNames.find((text) => text.includes('李四'));
    if (!named) {
      failures.push(`${where}: 换到名字的白名单行没显示名字（实际：${frame.policyNames.join(' | ')}）`);
    } else if (!named.includes('ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5')) {
      failures.push(`${where}: 白名单行显示了名字但丢了 id（判决仍按 id 走）`);
    }
    if (!frame.policyNames.some((text) => text.includes('ou_unknown_person_'))) {
      failures.push(`${where}: 查不到名字的白名单行没退回显示 id`);
    }
  }

  // 接入页两条路都得在（扫码新建 / 手动接入），而且点了「扫码新建机器人」之后
  // 真的渲染出二维码——只测初始态会漏掉"二维码图片撑破窄栏"这种只在点击后才出现的问题。
  const onboardFrames = results.filter((frame) => frame.scenario === 'feishuOnboard'
    || frame.scenario === 'feishuOnboardQr');
  if (onboardFrames.length === 0) failures.push('没测到接入页（守门本身失效了）');
  for (const frame of onboardFrames) {
    const where = `${frame.scenario} @${frame.width}px`;
    const headings = frame.onboard?.headings ?? [];
    for (const expected of ['扫码新建机器人', '手动接入已有机器人']) {
      if (!headings.includes(expected)) {
        failures.push(`${where}: 接入页缺「${expected}」（实际：${headings.join('、')}）`);
      }
    }
    if (frame.scenario === 'feishuOnboardQr') {
      if (frame.onboard?.qr !== true) {
        failures.push(`${where}: 点了「扫码新建机器人」之后没有渲染二维码`);
      }
      // 二维码与链接**两条路都要在**（真机反馈"扫码有了、打开链接的方式没了"）：
      // 桌面端直接点链接比掏手机扫屏幕省事，手机端扫码更快。
      if (frame.onboard?.link !== true) {
        failures.push(`${where}: 有二维码时把「打开授权页面」链接去掉了`);
      }
    }
  }

  // 「接入页」只能是接入相关的东西：已接入的机器人/账号属于左栏那份列表，
  // 点它们的「设置」才是各自的配置页（真机反馈：接入页里混着已接入机器人的配置，
  // 分不清哪些是"新建"、哪些是"已经在用的"）。
  const feishuEntry = results.filter((frame) => frame.scenario === 'feishuPage');
  if (feishuEntry.length === 0) failures.push('没测到飞书的接入页（守门本身失效了）');
  for (const frame of feishuEntry) {
    const where = `${frame.scenario} @${frame.width}px`;
    const titles = frame.entryPage?.cardTitles ?? [];
    if (!titles.includes('新建机器人接入')) {
      failures.push(`${where}: 接入页没有「新建机器人接入」卡片（实际：${titles.join('、')}）`);
    }
    // 假数据里那台已接入机器人的掩码 appId 只会出现在它的配置卡上。
    if ((frame.entryPage?.text ?? '').includes('cli_7b9d1a****')) {
      failures.push(`${where}: 接入页里混进了已接入机器人的配置（应只看得到接入相关的东西）`);
    }
  }
  const weixinEntry = results.filter((frame) => frame.scenario === 'weixinPage');
  if (weixinEntry.length === 0) failures.push('没测到微信的接入页（守门本身失效了）');
  for (const frame of weixinEntry) {
    const where = `${frame.scenario} @${frame.width}px`;
    if ((frame.entryPage?.cardTitles ?? []).includes('微信渠道')) {
      failures.push(`${where}: 扫码接入页里还留着「微信渠道」那张渠道级面板`);
    }
  }

  // 默认打开的渠道 = 排在最前面的那个（不是注册顺序里的第一个）。
  for (const frame of results.filter((item) => (item.railOrder ?? []).length > 0)) {
    const where = `${frame.scenario} @${frame.width}px`;
    if (!frame.activeChannel) failures.push(`${where}: 左栏没有任何渠道处于选中态`);
    else if (frame.activeChannel !== frame.railOrder[0]) {
      failures.push(`${where}: 默认打开的是「${frame.activeChannel}」，而排在最前面的是`
        + `「${frame.railOrder[0]}」（顺序：${frame.railOrder.join('、')}）`);
    }
  }

  // 拖动排序：模拟一次真实拖放，顺序必须真的变了（排序函数单测覆盖不到"事件接对了没"）。
  const drag = results.find((frame) => frame.dragResult?.before)?.dragResult ?? null;
  if (!drag) {
    failures.push('没能模拟渠道列表的拖动（守门本身失效了）');
  } else if (JSON.stringify(drag.before) === JSON.stringify(drag.after)) {
    failures.push(`拖动后顺序没变：${JSON.stringify(drag.before)} → ${JSON.stringify(drag.after)}`);
  }

  if (failures.length > 0) {
    console.error(`布局守门失败（${failures.length} 项）：`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log(`布局守门通过：${results.length} 帧（549/360/320px × ${new Set(results.map((item) => item.scenario)).size} 个场景）`);
} finally {
  rmSync(workDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
}
