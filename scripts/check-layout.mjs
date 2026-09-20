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
    const policyDirect = checks.find((item) => item.label === '访问策略（本会话） · 私聊');
    if (!policyDirect) failures.push('「控制面板显示项」里找不到「访问策略（本会话） · 私聊」');
    else if (policyDirect.checked !== false) failures.push('配了关闭的「访问策略（本会话） · 私聊」渲染成了勾上');
  }

  // 上下文增强弹窗的两个页签：每个弹窗只允许可见一个，且必须是选中的那个
  // （hidden 属性被作者样式 display:flex 盖掉过，真机上两个页签内容一模一样）。
  const dialogs = results.find((frame) => (frame.dialogs ?? []).length > 0)?.dialogs ?? [];
  if (dialogs.length === 0) {
    failures.push('没测到上下文增强弹窗的页签（守门本身失效了）');
  }
  for (const [index, dialog] of dialogs.entries()) {
    if (dialog.total !== 2) failures.push(`弹窗 ${index + 1} 的页签数不是 2（${dialog.total}）`);
    if (dialog.visible.length !== 1) {
      failures.push(`弹窗 ${index + 1} 可见的页签有 ${dialog.visible.length} 个（应为 1）：`
        + `${dialog.visible.join('、')}`);
    } else if (dialog.activeScope && dialog.visible[0] !== dialog.activeScope) {
      failures.push(`弹窗 ${index + 1} 可见的是 ${dialog.visible[0]}，但选中的是 ${dialog.activeScope}`);
    }
  }

  // 渠道设置入口按渠道显示：飞书不该有「渠道设置」（它跟机器人设置几乎一样），
  // 微信必须有「扫码接入」（那是唯一的接入入口，名称由渠道给）。
  for (const frame of results.filter((item) => (item.panelButtons ?? []).length > 0)) {
    const where = `${frame.scenario} @${frame.width}px`;
    const buttons = frame.panelButtons;
    if (frame.activeChannel === '飞书' && buttons.includes('渠道设置')) {
      failures.push(`${where}: 飞书不该有「渠道设置」入口（点进去与机器人设置重复）`);
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
