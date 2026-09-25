/**
 * 全局层 + 场合覆盖的迁移与取值。
 *
 * 这一组测试守的是**数据迁移**：老用户是 `{direct, group}` 两份平级配置，
 * 升级后必须满足一条铁律——**实际生效的判定结果不变**，
 * 变的只是"以后怎么改"（改全局能一次改两层）。
 *
 * 迁移错的方向有两个，两个都很难查：
 * ① 把"私聊放开"的配置迁丢了 → 用户发现机器人突然不认人了；
 * ② 把"群聊收紧"的配置迁丢了 → 机器人**在群里裸奔**（安全面，最严重）。
 * 所以下面每个用例都断言"迁移前后各层取值一致"。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LAYER_KEYS,
  isInherited,
  migrateToLayered,
  resolveScope,
  sameLayer,
  summarizeLayers,
  writeScope,
} from '../packages/dsh-chat/shared/scoped-config.mjs';

/** 一个简单的层形状：`{ mode }`，归一化就是把未知值压成 'allowlist'。 */
const normalizeLayer = (raw) => ({
  mode: raw?.mode === 'open' ? 'open' : 'allowlist',
});
const defaultLayer = () => ({ mode: 'allowlist' });
/** 保守选择：allowlist 比 open 保守。 */
const pickGlobal = (a, b) => (a.mode === 'allowlist' || b.mode === 'allowlist' ? normalizeLayer({ mode: 'allowlist' }) : a);
const migrate = (input) => migrateToLayered(input, {
  normalizeLayer, defaultLayer, pickGlobal,
});

test('迁移：两份相同 → 提成全局，两层都继承（改一次两层都变）', () => {
  const out = migrate({ direct: { mode: 'open' }, group: { mode: 'open' } });
  assert.deepEqual(out, { global: { mode: 'open' }, direct: null, group: null });
  // 迁移前后"私聊实际是什么"必须一致。
  assert.deepEqual(resolveScope(out, 'direct'), { mode: 'open' });
  assert.deepEqual(resolveScope(out, 'group'), { mode: 'open' });
});

test('迁移：两份不同 → 保留两份覆盖，各层取值一个都不变', () => {
  const before = { direct: { mode: 'open' }, group: { mode: 'allowlist' } };
  const out = migrate(before);
  // 全局取更保守的那一份。
  assert.equal(out.global.mode, 'allowlist');
  // 但两层**原样保留为覆盖**：私聊仍然是 open、群聊仍然是 allowlist。
  assert.deepEqual(resolveScope(out, 'direct'), { mode: 'open' });
  assert.deepEqual(resolveScope(out, 'group'), { mode: 'allowlist' });
  assert.equal(isInherited(out, 'direct'), false);
  assert.equal(isInherited(out, 'group'), false);
});

test('迁移：缺字段 / 脏数据按默认层补齐，绝不让某层变成"无配置"', () => {
  const out = migrate({});
  assert.deepEqual(resolveScope(out, 'direct'), { mode: 'allowlist' });
  assert.deepEqual(resolveScope(out, 'group'), { mode: 'allowlist' });
  const dirty = migrate({ direct: { mode: 'whatever' }, group: null });
  assert.equal(resolveScope(dirty, 'direct').mode, 'allowlist');
  assert.equal(resolveScope(dirty, 'group').mode, 'allowlist');
});

test('迁移：已经是新形态时幂等（重复迁移不改变取值）', () => {
  const once = migrate({ direct: { mode: 'open' }, group: { mode: 'allowlist' } });
  const twice = migrate(once);
  assert.deepEqual(twice, once);
  // 新形态里的"继承"要能原样活下来（不能被二次迁移成"两份相同 → 提全局"）。
  const inherited = { global: { mode: 'allowlist' }, direct: null, group: { mode: 'open' } };
  assert.deepEqual(migrate(inherited), inherited);
});

test('取值：覆盖层为 null 时回落全局；未设置的层也回落全局', () => {
  const config = { global: { mode: 'open' }, direct: null, group: { mode: 'allowlist' } };
  assert.deepEqual(resolveScope(config, 'direct'), { mode: 'open' });
  assert.deepEqual(resolveScope(config, 'group'), { mode: 'allowlist' });
  assert.deepEqual(resolveScope(config, 'global'), { mode: 'open' });
  // 认不出的层 → 回落全局（保守：不抛错、也不返回 undefined）。
  assert.deepEqual(resolveScope(config, 'nonsense'), { mode: 'open' });
});

test('写回：只改当前层，其它层一个字节不动', () => {
  const config = { global: { mode: 'open' }, direct: null, group: { mode: 'allowlist' } };
  const next = writeScope(config, 'direct', { mode: 'allowlist' });
  assert.deepEqual(next, { global: { mode: 'open' }, direct: { mode: 'allowlist' }, group: { mode: 'allowlist' } });
  // 原对象不能被改（设置页乐观更新依赖这一点）。
  assert.equal(config.direct, null);
  // 改回"继承"：置 null。
  assert.deepEqual(writeScope(next, 'direct', null), config);
  // 改全局不影响覆盖层。
  const globalChanged = writeScope(config, 'global', { mode: 'allowlist' });
  assert.deepEqual(globalChanged.direct, null);
  assert.deepEqual(globalChanged.group, { mode: 'allowlist' });
});

test('摘要：说清哪层继承、哪层覆盖（界面据此显示"继承全局"）', () => {
  assert.deepEqual(summarizeLayers({ global: {}, direct: null, group: {} }), {
    direct: 'inherited', group: 'override',
  });
});

test('sameLayer：纯数据深比较，比不了就当作"不一样"（保守）', () => {
  assert.equal(sameLayer({ a: 1 }, { a: 1 }), true);
  assert.equal(sameLayer({ a: 1 }, { a: 2 }), false);
  assert.equal(sameLayer(null, { a: 1 }), false);
  assert.equal(sameLayer(null, null), true);
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(sameLayer(cyclic, { a: 1 }), false); // 不抛错
});

test('层键固定为 global/direct/group（界面与运行期共用同一份顺序）', () => {
  assert.deepEqual([...LAYER_KEYS], ['global', 'direct', 'group']);
});
