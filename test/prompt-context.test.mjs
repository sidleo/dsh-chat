/**
 * 增强提示词走系统提示词段：注册形状、按 agent 求值、没有服务时的回退。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createGuidanceRegistry } from '../packages/dsh-chat/host/guidance.mjs';
import {
  SOURCE_GUIDANCE_ORDER,
  SOURCE_GUIDANCE_SECTION,
  installSourceGuidanceSection,
} from '../packages/dsh-chat/host/prompt-context.mjs';

const silentLogger = { info() {}, warn() {}, error() {} };

/** 假 systemPrompt 服务：收下段，并按 agent 组装文本。 */
function fakeSystemPrompt() {
  const sections = new Map();
  return {
    sections,
    section(definition) {
      if (sections.has(definition.name)) throw new Error(`duplicate section ${definition.name}`);
      sections.set(definition.name, definition);
      return () => sections.delete(definition.name);
    },
    /** 把已注册段按 order 拼起来；空段丢掉（与 DSH 的渲染口径一致）。 */
    assembleFor(agent) {
      return [...sections.values()]
        .sort((a, b) => a.order - b.order)
        .map((definition) => (typeof definition.text === 'function'
          ? definition.text({ agent })
          : definition.text))
        .filter((text) => typeof text === 'string' && text.trim())
        .join('\n\n');
    },
  };
}

test('提示词段：按 agent 求值，只对我们登记过的会话有内容', () => {
  const guidance = createGuidanceRegistry();
  const systemPrompt = fakeSystemPrompt();
  const effects = [];
  const ctx = {
    get: (name) => (name === 'systemPrompt' ? systemPrompt : undefined),
    effect: (fn) => { const dispose = fn(); effects.push(dispose); return dispose; },
  };

  assert.equal(installSourceGuidanceSection(ctx, guidance, { logger: silentLogger }), true);
  const section = systemPrompt.sections.get(SOURCE_GUIDANCE_SECTION);
  assert.ok(section, '段要注册进去');
  assert.equal(section.order, SOURCE_GUIDANCE_ORDER);

  // 没登记过的会话（这台 Host 上别的会话）→ 空串，等于没这一段。
  assert.equal(systemPrompt.assembleFor({ id: 'session-other' }), '');
  assert.equal(systemPrompt.assembleFor(undefined), '', '诊断类组装没有 agent 也不炸');

  guidance.publish('session-im', '在这个群里说话短一点');
  assert.equal(systemPrompt.assembleFor({ id: 'session-im' }), '在这个群里说话短一点');
  assert.equal(systemPrompt.assembleFor({ session: { id: 'session-im' } }),
    '在这个群里说话短一点', 'agent.session.id 的形态也认');

  // 关闭增强：登记清空 → 段跟着变空（所以"关掉"是立刻生效的）。
  guidance.publish('session-im', '');
  assert.equal(systemPrompt.assembleFor({ id: 'session-im' }), '');

  // 注销：effect 收回后段就没了。
  for (const dispose of effects) dispose();
  assert.equal(systemPrompt.sections.size, 0);
});

test('提示词段：没有 systemPrompt 服务时如实返回 false（调用方退回前缀注入）', () => {
  const guidance = createGuidanceRegistry();
  const warnings = [];
  const logger = { info() {}, warn: (message) => warnings.push(String(message)), error() {} };
  assert.equal(installSourceGuidanceSection({ get: () => undefined }, guidance, { logger }), false);
  assert.equal(installSourceGuidanceSection({ get: () => ({}) }, guidance, { logger }), false);
  assert.deepEqual(warnings, [], '模块本身不告警：退不退由调用方决定（只该告警一次）');
});

test('提示词段：服务存在但注册失败（ctx 已销毁等）时返回 false，不抛', () => {
  const guidance = createGuidanceRegistry();
  const warnings = [];
  const logger = { info() {}, warn: (message) => warnings.push(String(message)), error() {} };
  const systemPrompt = {
    section() { throw new Error('context is disposed'); },
  };
  const ctx = { get: (name) => (name === 'systemPrompt' ? systemPrompt : undefined), effect: (fn) => fn() };
  assert.equal(installSourceGuidanceSection(ctx, guidance, { logger }), false);
  assert.match(warnings.join('\n'), /注册增强提示词段失败/);
});
