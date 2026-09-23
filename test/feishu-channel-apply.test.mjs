/**
 * 飞书渠道的 host 接线：门禁装上了没、会话环境事实与身份策略提示词段对不对。
 *
 * 为什么单独测：`apply()` 这段胶水既不在 hub 的单测里，也不在演练里（演练直接用桥，
 * 不起真实控制器——真控制器会去连飞书长连接）。可它一旦接错，真机上就是
 * "设置页说只用应用身份、模型照样能发用户身份"这种最难发现的问题。
 *
 * 这里用一个假 ctx + 假的 `dshChat.registerChannel`（**不真的建控制器**）跑 `apply()`。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { apply, installLarkIdentitySection, registerShellFacts } from '../packages/dsh-chat-feishu/host/index.mjs';

const SESSION = 'session-e6fb1928-946a-4f60-82ed-56a6076eb008';
const PROFILE = 'cli_a9fa3aebe7f89cef';

const OWNER = Object.freeze({
  botId: 'bot_b6e11ebfaedb4413bf7c5eaa65387204',
  botName: '张三',
  chatKey: 'p2p:ou_x',
  // 身份策略是分层的：这里给的是**本会话**解析出来的两个开关（不是机器人级的单一 mode）。
  scope: Object.freeze({ bot: true, user: false, source: 'global' }),
  profileName: PROFILE,
});

/** 最小假 ctx：只实现渠道 apply 用到的那些能力。 */
function createFakeCtx({ ownership } = {}) {
  const handlers = new Map();
  const sections = new Map();
  const contributors = new Map();
  const registered = [];
  const systemPrompt = {
    section(definition) {
      sections.set(definition.name, definition);
      return () => sections.delete(definition.name);
    },
  };
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    get(name) {
      return name === 'systemPrompt' ? systemPrompt : undefined;
    },
    on(name, handler) {
      handlers.set(name, handler);
      return () => handlers.delete(name);
    },
    inject(deps, callback) {
      if (deps.includes('shellEnv')) callback(ctx);
      return () => {};
    },
    effect(fn) {
      return fn();
    },
    dshChat: {
      contractVersion: 1,
      registerChannel(options) {
        registered.push(options);
        return () => {};
      },
    },
  };
  ctx.shellEnv = {
    register(contributor) {
      contributors.set(contributor.name, contributor);
      return () => contributors.delete(contributor.name);
    },
  };
  return { ctx, handlers, sections, contributors, registered, ownership };
}

test('渠道 apply：门禁、会话环境事实、提示词段三样都装上；没建渠道时门禁放行', async () => {
  const fake = createFakeCtx();
  apply(fake.ctx);
  const guard = fake.handlers.get('tools/pre-execute');
  assert.equal(typeof guard, 'function', '没接 tools/pre-execute：模型自己跑的 lark-cli 就没人管了');
  assert.ok(fake.contributors.has('dsh-chat-feishu'), '会话环境事实没注册');
  assert.ok(fake.sections.has('dsh-chat-feishu:lark-cli-identity'), '身份策略提示词段没注册');
  // 渠道实例还没建起来时（createChannel 还没被调用）必须放行，否则任何一次 bash 都过不去。
  let nextCalled = false;
  const decision = await guard(
    { name: 'bash', arguments: { command: `lark-cli --profile ${PROFILE} im +messages-send --as bot --text x` } },
    async () => { nextCalled = true; return { kind: 'allow' }; },
  );
  assert.equal(nextCalled, true);
  assert.deepEqual(decision, { kind: 'allow' });
});

test('会话环境事实：只有本渠道的聊天会话拿得到 profile 与策略', () => {
  let ownership = null;
  const fake = createFakeCtx();
  registerShellFacts(fake.ctx, () => ownership);
  const contributor = fake.contributors.get('dsh-chat-feishu');
  assert.deepEqual(Object.keys(contributor.variables).sort(),
    ['DSH_CHAT_LARK_IDENTITY', 'DSH_CHAT_LARK_PROFILE']);
  assert.deepEqual(contributor.resolve({ agent: { session: { header: { id: SESSION } } } }), {},
    '不知道归属时不给事实（不是空字符串，是不注入）');
  ownership = (sessionId) => (sessionId === SESSION ? OWNER : null);
  assert.deepEqual(contributor.resolve({ agent: { session: { header: { id: SESSION } } } }), {
    DSH_CHAT_LARK_PROFILE: PROFILE,
    DSH_CHAT_LARK_IDENTITY: 'bot',
  });
  assert.deepEqual(contributor.resolve({ agent: { session: { header: { id: 'session-other' } } } }), {});

  // 环境事实报的是**本会话**实际生效的权限（不是机器人级全局值），四种组合都要能表达。
  const withScope = (scope) => {
    ownership = () => ({ ...OWNER, scope });
    return contributor.resolve({ agent: { session: { header: { id: SESSION } } } }).DSH_CHAT_LARK_IDENTITY;
  };
  assert.equal(withScope({ bot: true, user: true }), 'bot+user');
  assert.equal(withScope({ bot: true, user: false }), 'bot');
  assert.equal(withScope({ bot: false, user: true }), 'user');
  assert.equal(withScope({ bot: false, user: false }), 'none');
});

test('身份策略提示词段：只说给聊天会话听，且写明必须带 profile 与显式身份', () => {
  let ownership = () => null;
  const fake = createFakeCtx();
  installLarkIdentitySection(fake.ctx, () => ownership);
  const section = fake.sections.get('dsh-chat-feishu:lark-cli-identity');
  assert.equal(section.order, 410, '要排在 hub 的来源增强段（400）之后');
  assert.equal(section.text({ agent: { id: 'session-other' } }), '', '不是聊天会话就不出这段');

  ownership = (sessionId) => (sessionId === SESSION ? OWNER : null);
  const text = section.text({ agent: { id: SESSION } });
  assert.match(text, new RegExp(PROFILE), '要给出这台机器人自己的 profile 名');
  assert.match(text, /--as bot/);
  assert.match(text, /不允许用户身份/, '要说清本会话的实际权限');
  assert.match(text, /DSH_CHAT_LARK_PROFILE/);
  assert.match(text, /profile use/, '要写明禁止切换全局 profile');

  // 提示词必须说**本会话**那一份，否则模型按全局猜、门禁按会话判，两边自相矛盾。
  const groupScope = { ...OWNER, scope: { bot: true, user: true, source: 'target' } };
  ownership = () => groupScope;
  const allowed = section.text({ agent: { id: SESSION } });
  assert.match(allowed, /允许用户身份/);
  assert.doesNotMatch(allowed, /不允许用户身份/);

  // 都不允许的场合也要如实说（否则模型会以为能用 bot）。
  ownership = () => ({ ...OWNER, scope: { bot: false, user: false, source: 'target' } });
  assert.match(section.text({ agent: { id: SESSION } }), /两种身份都会被拒绝/);
});

test('没有 systemPrompt 服务的部署：提示词段装不上也不报错（门禁照旧生效）', () => {
  const fake = createFakeCtx();
  fake.ctx.get = () => undefined;
  const ensure = installLarkIdentitySection(fake.ctx, () => null);
  assert.equal(ensure(), false, '装不上时返回 false，而不是抛错拖垮渠道');
  assert.equal(fake.sections.size, 0);
});
