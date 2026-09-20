/**
 * 控制面板显示项（`shared/panel-sections.mjs`）。
 *
 * 这里钉的是**归一化方向**：缺项/写错都按"显示"补齐。显示项配置把卡片变空，
 * 是"设置页静默失效"那一类最难查的问题——用户只会觉得"我明明开着"。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PANEL_SECTIONS, defaultPanelSections, normalizePanelSections, sectionsFor,
} from '../packages/dsh-chat/shared/panel-sections.mjs';

test('默认全显示：与加这个配置之前的行为一致', () => {
  const defaults = defaultPanelSections();
  assert.deepEqual(Object.keys(defaults), ['direct', 'group']);
  for (const scope of ['direct', 'group']) {
    assert.deepEqual(Object.keys(defaults[scope]), [...PANEL_SECTIONS]);
    assert.ok(Object.values(defaults[scope]).every((value) => value === true));
  }
});

test('残缺/写错的配置按"显示"补齐，只认已知显示项', () => {
  const normalized = normalizePanelSections({
    // 群聊只明确关掉了 policy；其它项缺失、还有一个不认识的键。
    group: { policy: false, ghost: false },
    // 私聊整个写错（字符串）：按全显示处理。
    direct: 'nope',
  });
  assert.equal(normalized.group.policy, false, '明确 false 才关');
  assert.equal(normalized.group.model, true, '缺项按显示');
  assert.equal(normalized.group.ghost, undefined, '不认识的键丢掉');
  assert.ok(Object.values(normalized.direct).every((value) => value === true));
  // 非对象（历史脏数据）也不能让整份配置变成"全关"。
  assert.ok(Object.values(normalizePanelSections(null).direct).every((value) => value === true));
  assert.ok(Object.values(normalizePanelSections([1, 2]).group).every((value) => value === true));
  // 真值只有 false 才算关：`0`/`''`/`null` 都按显示（配置是布尔语义，不做隐式转换）。
  assert.equal(normalizePanelSections({ direct: { model: 0 } }).direct.model, true);
});

test('sectionsFor：按会话类型取，认不出会话类型时全显示', () => {
  const record = { panelSections: { direct: { policy: false }, group: { model: false } } };
  assert.equal(sectionsFor(record, 'direct').policy, false);
  assert.equal(sectionsFor(record, 'direct').model, true);
  assert.equal(sectionsFor(record, 'group').model, false);
  // 认不出（渠道没给、键也不合约定）：宁多多显示，也不要把用户的设置项全藏起来。
  assert.equal(sectionsFor(record, null).policy, true);
  assert.equal(sectionsFor({}, undefined).model, true);
  assert.equal(sectionsFor(null, 'group').model, true);
});
