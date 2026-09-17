/**
 * 每机器人设置存储：写入、原子性、备份与旧 workspaces.json 导入。
 */

import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createBotSettingsStore } from '../packages/dsh-chat/host/bot-settings.mjs';

const silentLogger = { info() {}, warn() {}, error() {} };

async function makeBase() {
  return mkdtemp(join(tmpdir(), 'dsh-chat-settings-'));
}

const LEGACY_WORKSPACES = {
  version: 2,
  workspaces: { bot_a: '/Users/me/ws', bot_b: '/Users/me/ws2' },
  deliveryTargets: { bot_a: { tgt_1: { name: '群聊', kind: 'group', route: { chatId: 'oc_1' } } } },
  accessPolicies: { bot_a: { direct: { mode: 'allowlist' } } },
  models: { bot_a: { providerId: 'opencode-go', modelId: 'deepseek-v4.1-flash' } },
  agentPresets: { bot_b: 'standard' },
  contextEnhancement: {
    bot_a: {
      group: { enabled: true, fields: ['senderId'], guidance: '群' },
      direct: { enabled: false, fields: ['senderId'], guidance: '' },
    },
  },
};

test('导入旧 workspaces.json：六个来源全部落到每机器人设置', async () => {
  const base = await makeBase();
  try {
    const legacyDir = join(base, 'integrations', 'dsh-legacy');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, 'workspaces.json'), JSON.stringify(LEGACY_WORKSPACES), 'utf8');
    const original = await readFile(join(legacyDir, 'workspaces.json'), 'utf8');

    const store = createBotSettingsStore({ dataDir: join(base, 'hub'), logger: silentLogger });
    const result = await store.importLegacy('legacy', legacyDir);
    assert.equal(result.imported, 2);

    const a = store.read('legacy', 'bot_a');
    assert.equal(a.workspace, '/Users/me/ws');
    assert.deepEqual(a.model, { providerId: 'opencode-go', modelId: 'deepseek-v4.1-flash' });
    assert.deepEqual(a.accessPolicy, { direct: { mode: 'allowlist' } });
    assert.deepEqual(a.deliveryTargets, { tgt_1: { name: '群聊', kind: 'group', route: { chatId: 'oc_1' } } });
    // 上下文增强经归一化：补齐 targets，并保留旧值。
    assert.deepEqual(a.contextEnhancement.targets, []);
    assert.equal(a.contextEnhancement.group.enabled, true);
    assert.equal(a.contextEnhancement.group.guidance, '群');

    const b = store.read('legacy', 'bot_b');
    assert.equal(b.workspace, '/Users/me/ws2');
    assert.equal(b.agentPreset, 'standard');
    assert.equal(b.contextEnhancement, null);

    // 旧文件必须一字未改。
    assert.equal(await readFile(join(legacyDir, 'workspaces.json'), 'utf8'), original);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('导入只补空缺，不覆盖已有设置；重复导入被跳过', async () => {
  const base = await makeBase();
  try {
    const legacyDir = join(base, 'integrations', 'dsh-legacy');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, 'workspaces.json'), JSON.stringify(LEGACY_WORKSPACES), 'utf8');

    const store = createBotSettingsStore({ dataDir: join(base, 'hub'), logger: silentLogger });
    await store.write('legacy', 'bot_a', { workspace: '/already/set' });
    await store.importLegacy('legacy', legacyDir);
    // 已有值保留，空缺值补齐。
    assert.equal(store.read('legacy', 'bot_a').workspace, '/already/set');
    assert.equal(store.read('legacy', 'bot_a').agentPreset, null);
    assert.ok(store.read('legacy', 'bot_a').model);

    const again = await store.importLegacy('legacy', legacyDir);
    assert.equal(again.skipped, '已导入过');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('导入标记持久化：清空设置后重启不会把旧值复活', async () => {
  const base = await makeBase();
  try {
    const legacyDir = join(base, 'integrations', 'dsh-legacy');
    await mkdir(legacyDir, { recursive: true });
    await writeFile(join(legacyDir, 'workspaces.json'), JSON.stringify(LEGACY_WORKSPACES), 'utf8');
    const dataDir = join(base, 'hub');

    const first = createBotSettingsStore({ dataDir, logger: silentLogger });
    await first.importLegacy('legacy', legacyDir);
    await first.write('legacy', 'bot_a', { workspace: null });

    const second = createBotSettingsStore({ dataDir, logger: silentLogger });
    const result = await second.importLegacy('legacy', legacyDir);
    assert.equal(result.skipped, '已导入过');
    assert.equal(second.read('legacy', 'bot_a').workspace, null);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('没有旧文件时记为已导入；旧文件损坏时不记，修好后仍可导入', async () => {
  const base = await makeBase();
  try {
    const legacyDir = join(base, 'integrations', 'dsh-legacy');
    await mkdir(legacyDir, { recursive: true });
    const store = createBotSettingsStore({ dataDir: join(base, 'hub'), logger: silentLogger });

    const missing = await store.importLegacy('legacy', legacyDir);
    assert.equal(missing.imported, 0);
    assert.ok(store.imports().legacy);

    await writeFile(join(legacyDir, 'workspaces.json'), '{ 坏掉的 JSON', 'utf8');
    const broken = await store.importLegacy('other', legacyDir);
    assert.match(broken.skipped, /无法解析/);
    assert.equal(store.imports().other, undefined, '解析失败不应记入导入标记');

    await writeFile(join(legacyDir, 'workspaces.json'), JSON.stringify(LEGACY_WORKSPACES), 'utf8');
    const retried = await store.importLegacy('other', legacyDir);
    assert.equal(retried.imported, 2);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('写入拒绝未知键；原子写不留临时文件；首次覆盖前留一份备份', async () => {
  const base = await makeBase();
  try {
    const dataDir = join(base, 'hub');
    const store = createBotSettingsStore({ dataDir, logger: silentLogger });
    await assert.rejects(() => store.write('feishu', 'bot_1', { nope: 1 }), /未知的设置字段/);

    await store.write('feishu', 'bot_1', { workspace: '/ws' });
    let files = await readdir(dataDir);
    assert.equal(files.filter((name) => name.includes('.tmp-')).length, 0);
    assert.deepEqual(files, ['bots.json']);

    await store.write('feishu', 'bot_1', { workspace: '/ws2' });
    files = await readdir(dataDir);
    assert.equal(files.filter((name) => name.startsWith('bots.json.bak-')).length, 1);
    assert.equal(JSON.parse(await readFile(join(dataDir, 'bots.json'), 'utf8')).channels.feishu.bot_1.workspace, '/ws2');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('订阅者收到写入通知，单个订阅者出错不影响其他人', async () => {
  const base = await makeBase();
  try {
    const store = createBotSettingsStore({ dataDir: join(base, 'hub'), logger: silentLogger });
    let good = 0;
    store.subscribe(() => {
      throw new Error('订阅者故障');
    });
    store.subscribe(() => {
      good += 1;
    });
    await store.write('feishu', 'bot_1', { workspace: '/ws' });
    assert.equal(good, 1);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
