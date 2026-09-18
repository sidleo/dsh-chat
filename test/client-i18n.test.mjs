/**
 * 文案守门测试：界面里出现的文案键必须在字典里真的有取值。
 *
 * 为什么要测：`locale.translate` 在"本命名空间没有该键"时会去 `common` 命名空间找，
 * 再找不到就**原样返回 key**。中文下原文与 key 相同，看不出问题；英文下就会在界面上
 * 露出中文原文——这类问题只有在用户切到英文时才会被发现。本测试把它变成提交前可发现的。
 *
 * 两条规则：
 * 1. 每个包自己的界面文件里出现的字面量 t('…') 键，必须在该包自己的字典里；
 * 2. hub 的共享组件是**用渠道的 t 渲染**的，所以它们的文案键必须出现在每个渠道字典里。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** 取 t('…') / t("…") 里的字面量键（动态键如 t(STATE_TEXT[...]) 不在此列）。 */
function literalKeys(source) {
  const keys = new Set();
  for (const match of source.matchAll(/\bt\(\s*'([^']*)'\s*\)|\bt\(\s*"([^"]*)"\s*\)/g)) {
    keys.add(match[1] ?? match[2]);
  }
  return keys;
}

/** 读一个字典文件里 `const zh = {…}` / `const en = {…}` 的键。 */
function dictionaryKeys(file, name) {
  const source = readFileSync(file, 'utf8');
  const match = source.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`));
  assert.ok(match, `${file} 里找不到 ${name} 字典`);
  const keys = new Set();
  for (const entry of match[1].matchAll(/^\s*'([^']*)':/gm)) keys.add(entry[1]);
  return keys;
}

/** 一个包：界面文件列表 + 字典文件（界面文件与字典文件可以是同一个）。 */
const PACKAGES = [
  {
    name: 'dsh-chat',
    uiFiles: [
      'packages/dsh-chat/client/section.js',
      'packages/dsh-chat/client/chat-ui.js',
      'packages/dsh-chat/client/context-enhancement.js',
      'packages/dsh-chat/client/delivery-targets.js',
      'packages/dsh-chat/client/diagnostics.js',
      'packages/dsh-chat/client/scoped-mode-editor.js',
      'packages/dsh-chat/client/version-panel.js',
      'packages/dsh-chat/client/bot-list.js',
      'packages/dsh-chat/client/bot-shared-settings.js',
    ],
    dictionary: 'packages/dsh-chat/client/i18n.js',
  },
  {
    name: 'dsh-chat-feishu',
    uiFiles: ['packages/dsh-chat-feishu/client/index.js'],
    dictionary: 'packages/dsh-chat-feishu/client/index.js',
  },
  {
    name: 'dsh-chat-weixin',
    uiFiles: ['packages/dsh-chat-weixin/client/index.js'],
    dictionary: 'packages/dsh-chat-weixin/client/index.js',
  },
];

test('每个包的界面文案键都在自己的字典里（中英各一份）', () => {
  for (const entry of PACKAGES) {
    const file = join(ROOT, entry.dictionary);
    for (const language of ['zh', 'en']) {
      const keys = dictionaryKeys(file, language);
      for (const uiFile of entry.uiFiles) {
        const source = readFileSync(join(ROOT, uiFile), 'utf8');
        const missing = [...literalKeys(source)].filter((key) => !keys.has(key));
        assert.deepEqual(missing, [],
          `${entry.name} 的 ${uiFile} 用了 ${language} 字典里没有的文案键：${missing.join('、')}`);
      }
    }
  }
});

test('hub 共享组件（用渠道的 t 渲染）的文案键在每个渠道字典里都有', () => {
  const sharedFiles = [
    'packages/dsh-chat/client/context-enhancement.js',
    'packages/dsh-chat/client/scoped-mode-editor.js',
    'packages/dsh-chat/client/bot-shared-settings.js',
  ];
  const shared = new Set();
  for (const file of sharedFiles) {
    for (const key of literalKeys(readFileSync(join(ROOT, file), 'utf8'))) shared.add(key);
  }
  assert.ok(shared.size > 0, '共享组件里没有找到文案键，测试本身失效了');

  for (const entry of PACKAGES.filter((item) => item.name !== 'dsh-chat')) {
    const file = join(ROOT, entry.dictionary);
    for (const language of ['zh', 'en']) {
      const keys = dictionaryKeys(file, language);
      const missing = [...shared].filter((key) => !keys.has(key));
      assert.deepEqual(missing, [],
        `${entry.name} 的 ${language} 字典缺 hub 共享组件的文案键：${missing.join('、')}`);
    }
  }
});

test('英文词典里不允许"值等于键"（那等于没翻译，界面上会中英混排）', () => {
  // 混排的成因就是这个：某个键只补了中文，英文直接抄了键名；英文界面下这个键
  // 会回落成中文原文，于是同一张卡片一半英文一半中文（真机上出现过）。
  const offenders = [];
  for (const entry of PACKAGES) {
    const file = join(ROOT, entry.dictionary);
    const source = readFileSync(file, 'utf8');
    const match = source.match(/const en = \{([\s\S]*?)\n\};/);
    assert.ok(match, `${entry.dictionary} 里找不到 en 字典`);
    for (const line of match[1].matchAll(/^\s*'([^']*)':\s*'([^']*)',\s*$/gm)) {
      if (line[1] === line[2]) offenders.push(`${entry.name} :: ${line[1]}`);
    }
  }
  assert.deepEqual(offenders, [], `这些键的英文与中文一模一样：\n${offenders.join('\n')}`);
});

test('中文词典里不允许出现英文值（抄错语言的直接症状是"只有某张卡片是英文"）', () => {
  /**
   * 为什么单独测这条：`zh` 词典的约定是"值 = 键"（少数刻意简写除外，如
   * 「渠道正在启动」→「正在启动」）。如果某个键的 zh 值被写成了英文，
   * 中文界面下这张卡片就会整块变英文，而同一页其它卡片正常——真机上出现过，
   * 排查了半天才发现是词典里混进了英文。
   */
  const offenders = [];
  for (const entry of PACKAGES) {
    const source = readFileSync(join(ROOT, entry.dictionary), 'utf8');
    const zh = source.match(/const zh = \{([\s\S]*?)\n\};/)?.[1];
    const en = source.match(/const en = \{([\s\S]*?)\n\};/)?.[1];
    assert.ok(zh && en, `${entry.dictionary} 缺少 zh 或 en 词典`);
    const enOf = new Map([...en.matchAll(/^\s*'([^']*)':\s*'([^']*)',\s*$/gm)].map((m) => [m[1], m[2]]));
    for (const m of zh.matchAll(/^\s*'([^']*)':\s*'([^']*)',\s*$/gm)) {
      const [, key, value] = m;
      // 值与英文完全相同、且含字母 → 确定是抄错了语言（刻意简写不会同时满足这两条）。
      if (value === enOf.get(key) && /[A-Za-z]/.test(value)) {
        offenders.push(`${entry.name} :: ${key} → ${value}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `这些中文词典条目写成了英文：\n${offenders.join('\n')}`);
});
