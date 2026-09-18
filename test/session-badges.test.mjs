/**
 * 侧边栏会话行的渠道徽标：纯函数部分（徽标图片与"认结构不认类名"的标题匹配）。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { badgeUri, findChannelTitle } from '../packages/dsh-chat/client/session-badges.js';

/** 造一个极简的行：`{ text, children }` 树，够 findChannelTitle 用。 */
function leaf(text) {
  return { textContent: text, children: [], querySelectorAll: () => [] };
}

function rowWith(...nodes) {
  const all = [];
  const walk = (node) => {
    all.push(node);
    for (const child of node.children ?? []) walk(child);
  };
  for (const node of nodes) walk(node);
  return { querySelectorAll: () => all.slice(1) };
}

test('徽标是 data URI，带品牌色与文字；颜色有默认值', () => {
  const uri = badgeUri({ text: '飞', color: '#3370ff' });
  assert.match(uri, /^data:image\/svg\+xml,/);
  assert.match(decodeURIComponent(uri), /#3370ff/);
  assert.match(decodeURIComponent(uri), />飞<\/text>/);
});

test('认结构不认类名：按「渠道名 · 」前缀在行内找叶子标题元素', () => {
  const time = leaf('7 小时');
  const title = leaf('飞书 · 哈喽');
  // 外层容器：有子元素 → 不是候选（否则会连时间/图标一起量进去）
  const wrapper = { textContent: '飞书 · 哈喽7 小时', children: [title, time], querySelectorAll: () => [] };
  const row = rowWith(wrapper, time, title);

  const found = findChannelTitle(row, [['feishu', '飞书']]);
  assert.ok(found, '应该找到标题元素');
  assert.equal(found.element, title, '命中的是叶子标题，不是外层容器');
  assert.equal(found.channel, 'feishu');
  assert.equal(found.text, '哈喽', '前缀要去掉');
});

test('不是渠道标题的行、以及徽标未就绪的渠道都不动', () => {
  const plain = rowWith(leaf('普通会话标题'));
  assert.equal(findChannelTitle(plain, [['feishu', '飞书']]), null);

  const prefixed = rowWith(leaf('微信 · 老王'));
  assert.equal(findChannelTitle(prefixed, []), null, '没有就绪的徽标就什么都不做');
  assert.equal(findChannelTitle(prefixed, [['feishu', '飞书']]), null, '渠道对不上也不动');
  assert.equal(findChannelTitle(null, [['feishu', '飞书']]), null);
});

test('机器人名单兼容 bots/accounts：老渠道 host 也不能显示成"没有机器人"', async () => {
  const { normalizeBots } = await import('../packages/dsh-chat/client/bot-list.js');
  assert.deepEqual(normalizeBots({ bots: [{ botId: 'a' }] }), [{ botId: 'a' }]);
  assert.deepEqual(normalizeBots({ accounts: [{ botId: 'b' }] }), [{ botId: 'b' }], '老字段也要认');
  assert.deepEqual(normalizeBots({ bots: [], accounts: [{ botId: 'b' }] }), [], '有 bots 就以内为准');
  assert.deepEqual(normalizeBots(undefined), []);
  assert.deepEqual(normalizeBots({}), []);
});
