/**
 * 每机器人共享设置的持久化（hub 所有）。
 *
 * 渠道无关的那些设置——工作区、模型、思考强度、Agent Preset、上下文增强、访问策略、
 * 投递目标——由 hub 统一持有，文件为 `<dataDir>/bots.json`。渠道自己的协议配置
 * （凭据、机器人列表、会话状态、过程展示等平台概念）留在渠道包自己的目录里。
 *
 * 写盘纪律（原子写、首次覆盖备份、串行队列）由 `json-store` 提供。
 *
 * @module dsh-chat/host/bot-settings
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { normalizeContextConfig } from '../shared/context-enhancement.mjs';
import { createJsonStore } from './json-store.mjs';

const DOCUMENT_VERSION = 1;

/** 一个机器人记录的默认值。 */
const EMPTY_RECORD = Object.freeze({
  workspace: null,
  model: null,
  agentPreset: null,
  contextEnhancement: null,
  accessPolicy: null,
  deliveryTargets: null,
});

const RECORD_KEYS = Object.freeze(Object.keys(EMPTY_RECORD));

/** 旧 workspaces.json 里与每机器人设置对应的键。 */
const LEGACY_SOURCES = Object.freeze({
  workspaces: 'workspace',
  models: 'model',
  agentPresets: 'agentPreset',
  contextEnhancement: 'contextEnhancement',
  accessPolicies: 'accessPolicy',
  deliveryTargets: 'deliveryTargets',
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneRecord(record) {
  return {
    ...EMPTY_RECORD,
    ...(isPlainObject(record) ? record : {}),
  };
}

function normalizeDocument(value) {
  const source = isPlainObject(value) && value.version === DOCUMENT_VERSION ? value : {};
  const imports = isPlainObject(source.imports) ? { ...source.imports } : {};
  const channels = {};
  if (isPlainObject(source.channels)) {
    for (const [channelId, bots] of Object.entries(source.channels)) {
      if (!isPlainObject(bots)) continue;
      const entries = {};
      for (const [botId, record] of Object.entries(bots)) {
        if (!isPlainObject(record)) continue;
        entries[botId] = cloneRecord(record);
      }
      channels[channelId] = entries;
    }
  }
  return { version: DOCUMENT_VERSION, imports, channels };
}

/**
 * 创建每机器人共享设置存储。
 *
 * @param options - { dataDir, logger }。
 * @returns 存储：ready / read / write / list / subscribe / importLegacy / imports / path。
 */
export function createBotSettingsStore({ dataDir, logger = console } = {}) {
  if (typeof dataDir !== 'string' || !dataDir.trim()) {
    throw new TypeError('bot settings 需要 dataDir。');
  }
  const store = createJsonStore({
    path: join(dataDir, 'bots.json'),
    normalize: normalizeDocument,
    empty: () => ({ version: DOCUMENT_VERSION, imports: {}, channels: {} }),
    logger,
    label: '每机器人设置',
  });

  function readRecord(channelId, botId) {
    const stored = store.snapshot().channels?.[channelId]?.[botId];
    const record = cloneRecord(stored);
    // 未配置（undefined）与显式清空（null）都表示"没有上下文增强"。
    record.contextEnhancement = stored?.contextEnhancement === undefined
      || stored?.contextEnhancement === null
      ? null
      : normalizeContextConfig(stored.contextEnhancement);
    return Object.freeze(record);
  }

  return {
    path: store.path,

    /** 等待磁盘文档就绪；渠道读取设置前应 await 它。 */
    ready: () => store.ready(),

    /** @returns 冻结的机器人记录（缺失时为默认值）。 */
    read: readRecord,

    /** 合并写入若干字段（未知键一律拒绝）。 */
    async write(channelId, botId, patch) {
      if (typeof channelId !== 'string' || !channelId) throw new TypeError('channelId 必填。');
      if (typeof botId !== 'string' || !botId) throw new TypeError('botId 必填。');
      if (!isPlainObject(patch)) throw new TypeError('patch 必须是对象。');
      const unknown = Object.keys(patch).filter((key) => !RECORD_KEYS.includes(key));
      if (unknown.length > 0) throw new TypeError(`未知的设置字段：${unknown.join('、')}`);
      const normalized = Object.hasOwn(patch, 'contextEnhancement') && patch.contextEnhancement !== null
        ? { ...patch, contextEnhancement: normalizeContextConfig(patch.contextEnhancement) }
        : patch;
      await store.update((current) => {
        const channels = { ...current.channels };
        const bots = { ...(channels[channelId] ?? {}) };
        bots[botId] = { ...cloneRecord(bots[botId]), ...normalized };
        channels[channelId] = bots;
        return { ...current, channels };
      });
      return readRecord(channelId, botId);
    },

    /** @returns 该渠道下的全部记录（含 botId）。 */
    list(channelId) {
      const bots = store.snapshot().channels?.[channelId] ?? {};
      return Object.freeze(Object.keys(bots).map((botId) => Object.freeze({
        botId,
        ...readRecord(channelId, botId),
      })));
    },

    /** 订阅变更。 */
    subscribe: (listener) => store.subscribe(listener),

    /**
     * 一次性把旧渠道的 `workspaces.json` 导入为每机器人设置。
     *
     * 只读旧文件，绝不改写；导入过后记 `imports[channelId]`，因此用户在 dsh-chat 里
     * 清空某条设置后不会在下次启动被"复活"。`force: true` 时忽略标记并以旧文件为准刷新。
     *
     * @param channelId - 渠道 id。
     * @param legacyDir - 旧数据目录（绝对路径）。
     * @param options - { force }。
     * @returns { imported, bots } 或 { skipped }。
     */
    async importLegacy(channelId, legacyDir, { force = false } = {}) {
      if (!force) {
        await store.ready();
        if (store.snapshot().imports[channelId]) {
          return { skipped: '已导入过', imported: 0, bots: [] };
        }
      }
      const source = join(legacyDir, 'workspaces.json');
      let legacy = null;
      try {
        legacy = JSON.parse(await readFile(source, 'utf8'));
      } catch (error) {
        if (error?.code === 'ENOENT') {
          // 没有旧文件：记为已导入，避免每次启动都去探测。
          await store.update((current) => ({
            ...current,
            imports: {
              ...current.imports,
              [channelId]: { path: source, importedAt: new Date().toISOString(), bots: [] },
            },
          }));
          return { imported: 0, bots: [] };
        }
        // 读得到但解析失败：不记导入，保留下次启动重试的机会。
        logger.warn?.(`[dsh-chat] 旧设置 ${source} 无法解析，稍后重试：${error?.message ?? error}`);
        return { skipped: '旧设置无法解析', imported: 0, bots: [] };
      }

      const perBot = new Map();
      for (const [legacyKey, recordKey] of Object.entries(LEGACY_SOURCES)) {
        const table = legacy?.[legacyKey];
        if (!isPlainObject(table)) continue;
        for (const [botId, value] of Object.entries(table)) {
          if (value === null || value === undefined) continue;
          const entry = perBot.get(botId) ?? {};
          entry[recordKey] = recordKey === 'contextEnhancement'
            ? normalizeContextConfig(value)
            : value;
          perBot.set(botId, entry);
        }
      }

      await store.update((current) => {
        const channels = { ...current.channels };
        if (perBot.size > 0) {
          const bots = { ...(channels[channelId] ?? {}) };
          for (const [botId, patch] of perBot) {
            // 首次导入只补空缺；force 重跑则以旧文件为准刷新。
            const merged = cloneRecord(bots[botId]);
            for (const [key, value] of Object.entries(patch)) {
              if (force || merged[key] === null) merged[key] = value;
            }
            bots[botId] = merged;
          }
          channels[channelId] = bots;
        }
        return {
          ...current,
          imports: {
            ...current.imports,
            [channelId]: {
              path: source,
              importedAt: new Date().toISOString(),
              bots: [...perBot.keys()],
            },
          },
          channels,
        };
      });

      if (perBot.size > 0) {
        logger.info?.(`[dsh-chat] 已从 ${source} 导入 ${perBot.size} 个机器人的设置`);
      }
      return { imported: perBot.size, bots: [...perBot.keys()] };
    },

    /** @returns 已导入来源的快照（调试与测试用）。 */
    imports() {
      return Object.freeze({ ...store.snapshot().imports });
    },
  };
}
