/**
 * 每机器人共享设置的持久化（hub 所有）。
 *
 * 渠道无关的那些设置——工作区、模型、思考强度、Agent Preset、上下文增强、访问策略——
 * 由 hub 统一持有，文件为 `<dataDir>/bots.json`。渠道自己的协议配置（凭据、机器人列表、
 * 会话状态、过程展示等平台概念）留在渠道包自己的目录里。
 *
 * 写入策略：串行队列 + 先写临时文件再 rename（原子），首次覆盖已有文件前落一次备份。
 *
 * @module dsh-chat/host/bot-settings
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { normalizeContextConfig } from '../shared/context-enhancement.mjs';

const DOCUMENT_VERSION = 1;

/** 一个机器人记录的默认值。 */
const EMPTY_RECORD = Object.freeze({
  workspace: null,
  model: null,
  agentPreset: null,
  contextEnhancement: null,
  accessPolicy: null,
});

const RECORD_KEYS = Object.freeze(Object.keys(EMPTY_RECORD));

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
  if (!isPlainObject(value) || value.version !== DOCUMENT_VERSION) {
    return { version: DOCUMENT_VERSION, channels: {} };
  }
  const channels = {};
  if (isPlainObject(value.channels)) {
    for (const [channelId, bots] of Object.entries(value.channels)) {
      if (!isPlainObject(bots)) continue;
      const entries = {};
      for (const [botId, record] of Object.entries(bots)) {
        if (!isPlainObject(record)) continue;
        entries[botId] = cloneRecord(record);
      }
      channels[channelId] = entries;
    }
  }
  return { version: DOCUMENT_VERSION, channels };
}

/**
 * 创建每机器人共享设置存储。
 *
 * @param options - { dataDir, logger }。
 * @returns 存储：load / read / write / list / subscribe / path。
 */
export function createBotSettingsStore({ dataDir, logger = console } = {}) {
  if (typeof dataDir !== 'string' || !dataDir.trim()) {
    throw new TypeError('bot settings 需要 dataDir。');
  }
  const file = join(dataDir, 'bots.json');
  let document = { version: DOCUMENT_VERSION, channels: {} };
  let loaded = false;
  let queue = Promise.resolve();
  let backedUp = false;
  const listeners = new Set();

  async function persist() {
    const body = `${JSON.stringify(document, null, 2)}\n`;
    await mkdir(dirname(file), { recursive: true });
    if (!backedUp) {
      backedUp = true;
      try {
        const previous = await readFile(file, 'utf8');
        if (previous.trim()) {
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          await writeFile(`${file}.bak-${stamp}`, previous, 'utf8');
        }
      } catch {
        // 没有旧文件（或读不到）就不需要备份。
      }
    }
    const temporary = `${file}.tmp-${randomBytes(6).toString('hex')}`;
    await writeFile(temporary, body, 'utf8');
    await rename(temporary, file);
  }

  function enqueue(task) {
    const next = queue.then(task, task);
    queue = next.then(() => undefined, () => undefined);
    return next;
  }

  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // 单个订阅者出错不影响其他订阅者。
      }
    }
  }

  return {
    path: file,

    /**
     * 等待磁盘文档就绪。渠道在读取设置前应 `await dshChat.ready()`。
     *
     * @returns 就绪后的存储自身。
     */
    async ready() {
      await this.load();
      return this;
    },

    /** 读取磁盘上的文档；文件不存在时保持空文档。 */
    async load() {
      if (loaded) return;
      try {
        document = normalizeDocument(JSON.parse(await readFile(file, 'utf8')));
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          logger.warn?.(`[dsh-chat] 读取 ${file} 失败，使用空设置：${error?.message ?? error}`);
        }
        document = { version: DOCUMENT_VERSION, channels: {} };
      }
      loaded = true;
    },

    /**
     * 读取一个机器人的设置。
     *
     * @param channelId - 渠道 id。
     * @param botId - 渠道内的机器人 id。
     * @returns 冻结的记录（缺失时为默认值）。
     */
    read(channelId, botId) {
      const stored = document.channels?.[channelId]?.[botId];
      const record = cloneRecord(stored);
      record.contextEnhancement = stored?.contextEnhancement === undefined
        ? null
        : normalizeContextConfig(stored.contextEnhancement);
      return Object.freeze(record);
    },

    /**
     * 合并写入若干字段。
     *
     * @param channelId - 渠道 id。
     * @param botId - 机器人 id。
     * @param patch - 只包含需要改动的键。
     * @returns 写入后的冻结记录。
     */
    async write(channelId, botId, patch) {
      if (typeof channelId !== 'string' || !channelId) throw new TypeError('channelId 必填。');
      if (typeof botId !== 'string' || !botId) throw new TypeError('botId 必填。');
      if (!isPlainObject(patch)) throw new TypeError('patch 必须是对象。');
      const unknown = Object.keys(patch).filter((key) => !RECORD_KEYS.includes(key));
      if (unknown.length > 0) throw new TypeError(`未知的设置字段：${unknown.join('、')}`);
      if (Object.hasOwn(patch, 'contextEnhancement') && patch.contextEnhancement !== null) {
        patch = { ...patch, contextEnhancement: normalizeContextConfig(patch.contextEnhancement) };
      }
      return enqueue(async () => {
        await this.load();
        const channels = { ...document.channels };
        const bots = { ...(channels[channelId] ?? {}) };
        bots[botId] = { ...cloneRecord(bots[botId]), ...patch };
        channels[channelId] = bots;
        document = { version: DOCUMENT_VERSION, channels };
        await persist();
        notify();
        return this.read(channelId, botId);
      });
    },

    /**
     * @param channelId - 渠道 id。
     * @returns 该渠道下的全部记录（含 botId）。
     */
    list(channelId) {
      const bots = document.channels?.[channelId] ?? {};
      return Object.freeze(Object.keys(bots).map((botId) => Object.freeze({
        botId,
        ...this.read(channelId, botId),
      })));
    },

    /**
     * 订阅变更（写入成功后触发）。
     *
     * @param listener - 无参回调。
     * @returns 取消订阅函数。
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
