/**
 * 渠道 rail（client 侧注册表）。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createChannelRail } from '../packages/dsh-chat/shared/channel-rail.mjs';

test('按 order 排序，并在注册/注销时通知订阅者', () => {
  const rail = createChannelRail();
  const seen = [];
  const off = rail.subscribe(() => seen.push(rail.entries().map((entry) => entry.id)));

  const offWeixin = rail.register({ id: 'weixin', order: 10, label: '微信' });
  const offFeishu = rail.register({ id: 'feishu', order: 20, label: () => '飞书' });

  assert.deepEqual(rail.entries().map((entry) => entry.id), ['weixin', 'feishu']);
  assert.equal(rail.entries()[1].label(), '飞书');
  assert.equal(rail.size, 2);

  offWeixin();
  assert.deepEqual(rail.entries().map((entry) => entry.id), ['feishu']);
  assert.ok(seen.length >= 3);

  off();
  offFeishu();
  assert.equal(rail.size, 0);
});

test('getSnapshot 在无变化时保持同一个引用（useSyncExternalStore 要求）', () => {
  const rail = createChannelRail();
  rail.register({ id: 'feishu', order: 20, label: '飞书' });
  assert.equal(rail.getSnapshot(), rail.getSnapshot());
  const before = rail.getSnapshot();
  rail.register({ id: 'weixin', order: 10, label: '微信' });
  assert.notEqual(before, rail.getSnapshot());
});

test('拒绝非法定义与重复注册', () => {
  const rail = createChannelRail();
  assert.throws(() => rail.register(null), /渠道元数据对象/);
  assert.throws(() => rail.register({ id: 'Feishu', order: 1, label: 'x' }), /渠道 id/);
  assert.throws(() => rail.register({ id: 'feishu', order: Number.NaN, label: 'x' }), /order/);
  assert.throws(() => rail.register({ id: 'feishu', order: 1, label: 42 }), /label/);
  rail.register({ id: 'feishu', order: 1, label: '飞书' });
  assert.throws(() => rail.register({ id: 'feishu', order: 2, label: '飞书2' }), /已注册/);
});

test('注销是幂等的，且不误删后来注册的同名渠道', () => {
  const rail = createChannelRail();
  const off = rail.register({ id: 'feishu', order: 1, label: '飞书' });
  off();
  off();
  rail.register({ id: 'feishu', order: 1, label: '飞书2' });
  off();
  assert.equal(rail.size, 1);
  assert.equal(rail.entries()[0].label(), '飞书2');
});

test('渠道徽标：sessionBadge 声明可选，非法声明直接拒绝', () => {
  const rail = createChannelRail();
  rail.register({
    id: 'feishu', order: 20, label: '飞书',
    sessionBadge: { text: '飞', color: '#3370ff' },
  });
  rail.register({ id: 'weixin', order: 10, label: '微信' });
  const byId = Object.fromEntries(rail.entries().map((entry) => [entry.id, entry]));
  assert.deepEqual(byId.feishu.sessionBadge, { text: '飞', color: '#3370ff' });
  assert.equal(byId.weixin.sessionBadge, null, '没声明就是 null');
  assert.throws(
    () => rail.register({ id: 'qq', order: 30, label: 'QQ', sessionBadge: { text: '' } }),
    /sessionBadge/,
  );
});
