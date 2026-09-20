/**
 * 界面列表顺序（`client/list-order.js`）：纯显示偏好，存浏览器。
 *
 * 钉三件事：脏数据不能让列表渲染不出来、未知键排在已排序的之后、拖动只做一次位置交换。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHANNEL_ORDER_KEY, botOrderKey, moveKey, orderedItems, readOrder, writeOrder,
} from '../packages/dsh-chat/client/list-order.js';

/** 假的 localStorage（够用的最小实现）。 */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    map,
  };
}

test('顺序键：渠道一份、每个渠道的机器人各一份', () => {
  assert.equal(CHANNEL_ORDER_KEY, 'dsh-chat:order:channels');
  assert.equal(botOrderKey('feishu'), 'dsh-chat:order:bots:feishu');
  assert.notEqual(botOrderKey('feishu'), botOrderKey('weixin'), '换渠道不能套用上一个渠道的顺序');
});

test('读写：坏数据/缺 storage 都当"没排过"，不让列表挂掉', () => {
  const storage = fakeStorage({ k: '{not json' });
  assert.deepEqual(readOrder('k', storage), []);
  assert.deepEqual(readOrder('missing', storage), []);
  assert.deepEqual(readOrder('k', null), [], '没有 localStorage（Node/SSR）时也一样');

  storage.map.set('k2', JSON.stringify(['a', 1, '', 'b']));
  assert.deepEqual(readOrder('k2', storage), ['a', 'b'], '只留非空字符串');

  assert.equal(writeOrder('k3', ['x', 'y'], storage), true);
  assert.deepEqual(readOrder('k3', storage), ['x', 'y']);
  assert.equal(writeOrder('k4', ['x'], { setItem: () => { throw new Error('quota'); } }), false,
    '写失败不抛（这只影响显示顺序）');
});

test('排序：按存的顺序排，没记录过的保持原有相对顺序排在后面', () => {
  const items = [{ id: 'feishu' }, { id: 'weixin' }, { id: 'qq' }];
  assert.deepEqual(
    orderedItems(items, ['qq', 'feishu'], (item) => item.id).map((item) => item.id),
    ['qq', 'feishu', 'weixin'],
  );
  assert.deepEqual(orderedItems(items, [], (item) => item.id).map((item) => item.id),
    ['feishu', 'weixin', 'qq'], '没排过 = 原顺序');
  assert.deepEqual(orderedItems(items, ['ghost'], (item) => item.id).map((item) => item.id),
    ['feishu', 'weixin', 'qq'], '顺序里的陌生键不影响现有条目');
  // 排序不改入参（列表来自 React state，改了会静默改状态）。
  const before = items.map((item) => item.id);
  orderedItems(items, ['qq'], (item) => item.id);
  assert.deepEqual(items.map((item) => item.id), before);
});

test('拖动：把被拖的键挪到落点原位；参数不合法时原样返回', () => {
  assert.deepEqual(moveKey(['a', 'b', 'c'], 'a', 'c'), ['b', 'c', 'a'], '向后拖');
  assert.deepEqual(moveKey(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b'], '向前拖');
  assert.deepEqual(moveKey(['a', 'b', 'c'], 'a', 'a'), ['a', 'b', 'c'], '原地不动');
  assert.deepEqual(moveKey(['a', 'b'], 'ghost', 'a'), ['a', 'b'], '认不出的键不产生半截顺序');
  assert.deepEqual(moveKey(['a', 'b'], 'a', 'b'), ['b', 'a'], '相邻交换');
});
