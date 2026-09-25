/**
 * 访问策略：判定矩阵、容错归一化与命令权限。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCESS_RESULTS,
  defaultAccessPolicy,
  describeAccessScope,
  evaluateAccess,
  normalizeAccessPolicy,
  scopeFor,
  validateAccessPolicy,
} from '../packages/dsh-chat/shared/access-policy.mjs';

const scope = (mode, users = [], { defaultCommands = false, overrides = [] } = {}) => ({
  mode,
  open: { defaultCanExecuteCommands: defaultCommands, commandPermissionOverrides: overrides },
  allowlist: { users },
});

const policy = (direct, group = direct) => ({ direct, group });
/** 新形态：一份全局 + 两层覆盖（null = 继承）。保存路径要求三层都在。 */
const layered = (global, direct = null, group = null) => ({ global, direct, group });
const user = (id, canExecuteCommands) => ({ id, canExecuteCommands });

test('open 模式：任何人可对话，命令权限取默认或 per-user 覆盖', () => {
  const closed = policy(scope('open'));
  assert.deepEqual(evaluateAccess({ policy: closed, conversationType: 'direct', senderIds: ['u1'] }),
    { allowed: true, reason: ACCESS_RESULTS.OPEN });
  assert.deepEqual(
    evaluateAccess({ policy: closed, conversationType: 'direct', senderIds: ['u1'], isCommand: true }),
    { allowed: false, reason: ACCESS_RESULTS.COMMAND_DENIED },
  );

  const openCommands = policy(scope('open', [], { defaultCommands: true }));
  assert.equal(
    evaluateAccess({ policy: openCommands, conversationType: 'direct', senderIds: ['u1'], isCommand: true }).allowed,
    true,
  );

  // per-user 覆盖优先于默认值
  const override = policy(scope('open', [], {
    defaultCommands: true,
    overrides: [user('u2', false)],
  }));
  assert.equal(
    evaluateAccess({ policy: override, conversationType: 'direct', senderIds: ['u2'], isCommand: true }).allowed,
    false,
  );
  assert.equal(
    evaluateAccess({ policy: override, conversationType: 'direct', senderIds: ['u1'], isCommand: true }).allowed,
    true,
  );
});

test('allowlist 模式：名单外不可对话；命令要求名单内全部允许', () => {
  const listed = policy(scope('allowlist', [user('u1', true)]));
  assert.equal(
    evaluateAccess({ policy: listed, conversationType: 'direct', senderIds: ['u1'] }).allowed,
    true,
  );
  assert.deepEqual(
    evaluateAccess({ policy: listed, conversationType: 'direct', senderIds: ['nobody'] }),
    { allowed: false, reason: ACCESS_RESULTS.NOT_LISTED },
  );

  const noCommands = policy(scope('allowlist', [user('u1', false)]));
  assert.equal(
    evaluateAccess({ policy: noCommands, conversationType: 'direct', senderIds: ['u1'] }).allowed,
    true,
    '能对话',
  );
  assert.equal(
    evaluateAccess({ policy: noCommands, conversationType: 'direct', senderIds: ['u1'], isCommand: true }).allowed,
    false,
    '但不能执行命令',
  );

  // 多身份命中且要求全部允许（WhatsApp 的 JID 别名场景）
  const aliases = policy(scope('allowlist', [user('a', true), user('b', false)]));
  assert.equal(
    evaluateAccess({ policy: aliases, conversationType: 'direct', senderIds: ['a', 'b'], isCommand: true }).allowed,
    false,
  );
});

test('属主绕过一切限制（含空名单与命令权限）', () => {
  const empty = policy(scope('allowlist'));
  assert.equal(
    evaluateAccess({ policy: empty, conversationType: 'direct', senderIds: ['owner'], isOwner: true }).allowed,
    true,
  );
  assert.equal(
    evaluateAccess({
      policy: empty, conversationType: 'direct', senderIds: ['owner'], isOwner: true, isCommand: true,
    }).allowed,
    true,
  );
  // 非属主在空名单下进不来
  assert.equal(
    evaluateAccess({ policy: empty, conversationType: 'direct', senderIds: ['other'] }).allowed,
    false,
  );
});

test('私聊与群聊各自独立判定', () => {
  const mixed = policy(scope('open', [], { defaultCommands: true }), scope('allowlist', [user('u1', true)]));
  assert.equal(
    evaluateAccess({ policy: mixed, conversationType: 'direct', senderIds: ['anyone'] }).allowed,
    true,
  );
  assert.equal(
    evaluateAccess({ policy: mixed, conversationType: 'group', senderIds: ['anyone'] }).allowed,
    false,
  );
  assert.equal(
    evaluateAccess({ policy: mixed, conversationType: 'group', senderIds: ['u1'] }).allowed,
    true,
  );
});

test('没有策略对象时拒绝并给出 no-policy（调用方据此回落"仅属主"）', () => {
  assert.deepEqual(
    evaluateAccess({ policy: null, conversationType: 'direct', senderIds: ['u1'] }),
    { allowed: false, reason: ACCESS_RESULTS.NO_POLICY },
  );
  assert.deepEqual(
    evaluateAccess({ policy: undefined, conversationType: 'channel', senderIds: ['u1'] }),
    { allowed: false, reason: ACCESS_RESULTS.INVALID },
  );
});

test('容错归一化：缺字段按保守方向补齐，绝不把机器人锁死', () => {
  // 只有 mode 的残缺策略
  const partial = normalizeAccessPolicy({ direct: { mode: 'open' } });
  // 老形态（只有 direct）迁移后：direct 是覆盖层，group 继承全局。
  assert.equal(partial.direct.mode, 'open');
  assert.deepEqual(partial.direct.allowlist.users, []);
  assert.equal(partial.direct.open.defaultCanExecuteCommands, false);
  // 判定仍按 direct 那一层走（迁移不改变实际结果）。
  assert.equal(scopeFor(partial, 'direct').mode, 'open');
  assert.equal(
    evaluateAccess({ policy: { direct: { mode: 'open' } }, conversationType: 'direct', senderIds: ['u'] }).allowed,
    true,
  );

  // 非法 mode → 保守成 allowlist（等于仅属主可用），而不是"所有人都能进"
  const bogus = normalizeAccessPolicy({ direct: { mode: 'everyone' } });
  // 非法 mode 被压成 allowlist；因为两份归一化后相同，会被提成全局（这层就不用覆盖了）。
  assert.equal(scopeFor(bogus, 'direct').mode, 'allowlist');
  assert.equal(
    evaluateAccess({ policy: { direct: { mode: 'everyone' } }, conversationType: 'direct', senderIds: ['u'] }).allowed,
    false,
  );

  // 坏的名单条目被丢弃，好的保留
  const mixed = normalizeAccessPolicy({
    direct: {
      mode: 'allowlist',
      open: {},
      allowlist: { users: [{ id: 'ok', canExecuteCommands: true }, { id: '', canExecuteCommands: true }, null] },
    },
  });
  assert.deepEqual(scopeFor(mixed, 'direct').allowlist.users.map((item) => item.id), ['ok']);
});

test('严格校验（保存路径）拒绝不完整策略', () => {
  assert.throws(() => validateAccessPolicy({ direct: scope('open') }), /完整的访问策略/);
  assert.throws(() => validateAccessPolicy(layered(scope('nope'))), /open 或 allowlist/);
  assert.throws(() => validateAccessPolicy(layered({ mode: 'open' })), /缺少字段/);
  assert.throws(() => validateAccessPolicy(layered({
    mode: 'open', open: { defaultCanExecuteCommands: 'yes', commandPermissionOverrides: [] }, allowlist: { users: [] },
  })), /布尔值/);
  // 覆盖层可以是 null（= 继承全局），但 global 不能缺。
  assert.equal(validateAccessPolicy(layered(scope('allowlist'))).direct, null);
  assert.throws(() => validateAccessPolicy({ direct: null, group: null }), /完整的访问策略/);
});

test('默认策略与描述文案', () => {
  const defaults = defaultAccessPolicy();
  // 新形态：一份全局 + 两层继承（开箱行为与旧版一致：哪层都是 allowlist + 空名单）。
  assert.equal(defaults.global.mode, 'allowlist');
  assert.equal(defaults.direct, null);
  assert.equal(defaults.group, null);
  assert.equal(scopeFor(defaults, 'direct').mode, 'allowlist');
  assert.deepEqual(scopeFor(defaults, 'group').allowlist.users, []);
  // 默认是两层都继承全局，所以描述里带上继承说明（用户要能看出这一层是不是自己配的）。
  assert.equal(describeAccessScope(defaults, 'direct'), '仅属主可用（继承全局）');
  // 只有 direct 一份老数据 = 两份不同 → direct 是覆盖层，描述不带后缀。
  assert.equal(describeAccessScope(policy(scope('open', [], { defaultCommands: true })), 'direct'),
    '任何人可用（命令默认允许）（继承全局）');
  // 两份不一样时 direct 是覆盖层，不该自称继承全局。
  const mixedScopes = { direct: scope('open'), group: scope('allowlist') };
  assert.equal(describeAccessScope(mixedScopes, 'direct'), '任何人可用（命令默认不允许）');
  assert.equal(describeAccessScope(policy(scope('allowlist', [user('u1', true), user('u2', false)])), 'group'),
    '名单内 2 人可用（继承全局）');
  assert.equal(describeAccessScope(null, 'direct'), '未设置（仅属主可用）');
});

test('属主判定：`*` 是"没有属主"，不是"人人都是属主"', async () => {
  const { hasWildcardOwner, isOwnerId } = await import('../packages/dsh-chat/shared/access-policy.mjs');

  assert.equal(hasWildcardOwner(['*']), true);
  assert.equal(hasWildcardOwner(['ou_a', '*']), true);
  assert.equal(hasWildcardOwner(['ou_a']), false);
  assert.equal(hasWildcardOwner(null), false);

  assert.equal(isOwnerId(['ou_a'], 'ou_a'), true, '具体 id 命中就是属主');
  assert.equal(isOwnerId(['*'], 'ou_anyone'), false, '`*` 不授权任何人');
  assert.equal(isOwnerId(['*', 'ou_a'], 'ou_a'), true, '`*` 与具体 id 并存时，具体 id 仍是属主');
  assert.equal(isOwnerId(['*', 'ou_a'], 'ou_b'), false);
  assert.equal(isOwnerId([], 'ou_a'), false);
  assert.equal(isOwnerId(null, 'ou_a'), false);
  assert.equal(isOwnerId(['ou_a'], ''), false);
});
