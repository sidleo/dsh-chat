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
      'packages/dsh-chat/client/scoped-mode-editor.js',
      'packages/dsh-chat/client/version-panel.js',
      'packages/dsh-chat/client/bot-list.js',
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
