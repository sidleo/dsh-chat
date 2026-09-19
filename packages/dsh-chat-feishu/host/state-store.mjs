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
/** 卡片→会话映射最多留多少条（卡片消息是短命的，留最近的就够）。 */
const MAX_CARDS = 200;
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
  /**
   * 卡片消息 → 会话键（`p2p:…` / `group:…`）。
   *
   * 卡片回调里只有 chat_id，而群与私聊的 chat_id 长得一样；这个映射是判对会话的唯一可靠依据。
   * **必须落盘**：进程重启（改 host 代码就要重启）后如果只剩绑定推断，群里点卡片会被判成私聊，
   * 动作就落到操作者的私聊会话上了。
   */
  const cards = {};
  if (isPlainObject(source.cardConversations)) {
    for (const [messageId, key] of Object.entries(source.cardConversations)) {
      if (typeof messageId === 'string' && messageId && typeof key === 'string' && key) cards[messageId] = key;
    }
  }
  return { version: 1, sessions, seenMessageIds: seen, cardConversations: cards };
}

/**
 * 创建状态存储。
 *
 * @param options - { path, logger }。
 * @returns 状态 API。
 */
export function createFeishuStateStore({ path, logger = console } = {}) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('state store 需要 path。');
  let document = { version: 1, sessions: {}, seenMessageIds: [], cardConversations: {} };
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

  /** 记住"这张卡片属于哪个会话"（按插入顺序截断，避免无限增长）。 */
  function rememberCard(messageId, key) {
    if (typeof messageId !== 'string' || !messageId) return;
    if (typeof key !== 'string' || !key) return;
    const entries = Object.entries(document.cardConversations).filter(([id]) => id !== messageId);
    entries.push([messageId, key]);
    const kept = Object.fromEntries(entries.slice(-MAX_CARDS));
    document = { version: 1, sessions: document.sessions, seenMessageIds: [...seenOrder], cardConversations: kept };
    void enqueue(persist).catch((error) => {
      logger.warn?.(`[dsh-chat-feishu] 写入 ${path} 失败：${error?.message ?? error}`);
    });
  }

  return {
    path,

    /** @returns 这张卡片属于哪个会话键；不认识（不是我们发的卡/太久远）时返回 null。 */
    cardConversation(messageId) {
      if (typeof messageId !== 'string' || !messageId) return null;
      return document.cardConversations[messageId] ?? null;
    },

    /** 记住"这张卡片属于哪个会话"。 */
    rememberCard,

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
        document = { version: 1, sessions: {}, seenMessageIds: [], cardConversations: {} };
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
        cardConversations: document.cardConversations,
      };
      void enqueue(persist).catch((error) => {
        logger.warn?.(`[dsh-chat-feishu] 写入 ${path} 失败：${error?.message ?? error}`);
      });
      return true;
    },
  };
}
