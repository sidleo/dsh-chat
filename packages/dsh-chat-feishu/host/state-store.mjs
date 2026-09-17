/**
 * 飞书机器人的会话状态存储。
 *
 * 沿用旧实现的 `bots/<botId>/state.json`：会话键 → DSH Session 的映射与已处理消息 id。
 * 加载后由 hub 的会话桥 `adopt()` 接管，因此升级不丢会话。
 *
 * @module dsh-chat-feishu/state-store
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/** 去重集合上限（超出丢弃最旧的）。 */
const MAX_SEEN = 1_000;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDocument(value) {
  const source = isPlainObject(value) ? value : {};
  const sessions = {};
  if (isPlainObject(source.sessions)) {
    for (const [key, sessionId] of Object.entries(source.sessions)) {
      if (typeof sessionId === 'string' && sessionId) sessions[key] = sessionId;
    }
  }
  const seen = Array.isArray(source.seenMessageIds)
    ? source.seenMessageIds.filter((id) => typeof id === 'string' && id).slice(-MAX_SEEN)
    : [];
  return { version: 1, sessions, seenMessageIds: seen };
}

/**
 * 创建状态存储。
 *
 * @param options - { path, logger }。
 * @returns 状态 API。
 */
export function createFeishuStateStore({ path, logger = console } = {}) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('state store 需要 path。');
  let document = { version: 1, sessions: {}, seenMessageIds: [] };
  let loaded = false;
  let queue = Promise.resolve();
  const seen = new Set();
  const seenOrder = [];

  async function persist() {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp-${randomBytes(6).toString('hex')}`;
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await rename(temporary, path);
  }

  function enqueue(task) {
    const next = queue.then(task, task);
    queue = next.then(() => undefined, () => undefined);
    return next;
  }

  return {
    path,

    /**
     * 等待已排队的写盘落定（去重集合是异步落盘的，停机前要等它写完，
     * 否则重启后会重复处理刚收过的消息）。
     */
    async flush() {
      await queue;
    },

    async load() {
      if (loaded) return this;
      try {
        document = normalizeDocument(JSON.parse(await readFile(path, 'utf8')));
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          logger.warn?.(`[dsh-chat-feishu] 读取 ${path} 失败：${error?.message ?? error}`);
        }
        document = { version: 1, sessions: {}, seenMessageIds: [] };
      }
      for (const id of document.seenMessageIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        seenOrder.push(id);
      }
      loaded = true;
      return this;
    },

    /** @returns 旧的会话绑定快照（交给 hub 的会话桥 adopt）。 */
    sessions() {
      return Object.freeze({ ...document.sessions });
    },

    /**
     * 去重：第一次见到返回 true，重复返回 false。
     *
     * @param messageId - 平台消息 id。
     */
    markSeen(messageId) {
      if (typeof messageId !== 'string' || !messageId) return true;
      if (seen.has(messageId)) return false;
      seen.add(messageId);
      seenOrder.push(messageId);
      while (seenOrder.length > MAX_SEEN) {
        const oldest = seenOrder.shift();
        seen.delete(oldest);
      }
      document = {
        version: 1,
        sessions: document.sessions,
        seenMessageIds: [...seenOrder],
      };
      void enqueue(persist).catch((error) => {
        logger.warn?.(`[dsh-chat-feishu] 写入 ${path} 失败：${error?.message ?? error}`);
      });
      return true;
    },
  };
}
