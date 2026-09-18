/**
 * client 侧"能加载"守门测试。
 *
 * 为什么要测：client 代码只在浏览器里跑，**坏在模块顶层时构建和其它单测都发现不了**——
 * esbuild 只做语法检查，而裸标识符、模板串被提前闭合这类问题语法上是合法的。
 * 真机上的表现是 DSH 启动就报
 * `Failed to load plugins: failed to import loader entry … (dsh-chat): select is not defined`，
 * 整个插件加载失败、设置页直接进不去，而本地 `npm run check` 全绿。
 *
 * 真实翻车案例：styles.js 的 CSS 写在模板字符串里，注释里写了反引号包住的类名，
 * 模板被提前闭合，`select` 变成模块顶层的裸标识符。
 *
 * 两条规则：
 * 1. 每个 `packages/&#42;/client/*.js` 都要能被 import（顶层不得抛错）；
 * 2. 注入的 CSS 必须完整：括号配平、含关键选择器、且**不含反引号**
 *    （反引号混进去就说明模板串曾经被截断过）。
 */

import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 所有 client 侧模块的绝对路径。 */
function clientModules() {
  const files = [];
  for (const pkg of readdirSync(join(ROOT, 'packages'))) {
    const dir = join(ROOT, 'packages', pkg, 'client');
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue; // 没有 client 目录的包（如纯 host 包）
    }
    for (const name of entries) {
      if (name.endsWith('.js')) files.push(join(dir, name));
    }
  }
  return files;
}

test('每个 client 模块都能加载：顶层不得抛错', async () => {
  const files = clientModules();
  assert.ok(files.length >= 10, `应当扫到全部 client 模块，实际只扫到 ${files.length} 个`);
  for (const file of files) {
    const label = file.slice(ROOT.length);
    await assert.doesNotReject(
      () => import(pathToFileURL(file).href),
      `${label} 在模块顶层抛错（浏览器里会表现为整个插件加载失败）`,
    );
  }
});

test('注入的样式表完整：括号配平、含关键选择器、没有被模板串截断', async () => {
  const { installChatStyles } = await import('../packages/dsh-chat/client/styles.js');
  const created = [];
  const doc = {
    head: { appendChild: (element) => created.push(element) },
    createElement: () => ({ id: '', textContent: '', remove() {} }),
  };
  const release = installChatStyles(doc);
  const style = created[0];
  assert.ok(style, 'installChatStyles 应当创建并挂上一个 <style>');
  assert.equal(style.id, 'dsh-chat-styles');

  const css = style.textContent;
  assert.ok(css.length > 5000, `样式表应当有实际内容，实际 ${css.length} 字符`);
  assert.equal(
    (css.match(/\{/g) ?? []).length,
    (css.match(/\}/g) ?? []).length,
    'CSS 花括号必须配平',
  );
  assert.ok(!css.includes('`'), 'CSS 里不该出现反引号——出现就说明模板串被截断过');
  for (const selector of ['.dchat-card', '.dchat-actions', '.dchat-button', '.dchat-botRow']) {
    assert.ok(css.includes(selector), `样式表里缺少 ${selector}`);
  }
  release();
});
