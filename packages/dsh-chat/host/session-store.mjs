/**
 * IM 会话 ↔ DSH 会话的绑定表（hub 所有）。
 *
 * 渠道只提供"会话键"（飞书 `p2p:ou_xxx` / `group:oc_xxx`，微信 `p2p:<user>@im.wechat`），
 * 由 hub 统一维护到 Session id 的映射，因此每个渠道不必各写一份状态文件。
 *
 * 旧实现（dsh-im）的绑定存在渠道自己的 `state.json` 里，渠道加载时用 `adopt()`
 * 把它们灌进来即可继续沿用原会话。
 *
 * @module dsh-chat/host/session-store
 */

import { join } from 'node:path';

import { createJsonStore } from './json-store.mjs';

const DOCUMENT_VERSION = 1;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDocument(value) {
  const source = isPlainObject(value) && value.version === DOCUMENT_VERSION ? value : {};
  const channels = {};
  if (isPlainObject(source.channels)) {
    for (const [channelId, bots] of Object.entries(source.channels)) {
      if (!isPlainObject(bots)) continue;
      const accounts = {};
      for (const [botId, keys] of Object.entries(bots)) {
        if (!isPlainObject(keys)) continue;
        const entries = {};
        for (const [key, entry] of Object.entries(keys)) {
          const sessionId = typeof entry?.sessionId === 'string' ? entry.sessionId : null;
          if (!sessionId) continue;
          entries[key] = {
            sessionId,
            workspacePath: typeof entry.workspacePath === 'string' ? entry.workspacePath : null,
            boundAt: typeof entry.boundAt === 'string' ? entry.boundAt : null,
          };
        }
        accounts[botId] = entries;
      }
      channels[channelId] = accounts;
    }
  }
  return { version: DOCUMENT_VERSION, channels };
}

/**
 * 创建会话绑定表。
 *
 * @param options - { dataDir, logger }。
 * @returns 绑定表 API。
 */
export function createSessionStore({ dataDir, logger = console } = {}) {
  if (typeof dataDir !== 'string' || !dataDir.trim()) {
    throw new TypeError('session store 需要 dataDir。');
  }
  const store = createJsonStore({
    path: join(dataDir, 'sessions.json'),
    normalize: normalizeDocument,
    empty: () => ({ version: DOCUMENT_VERSION, channels: {} }),
    logger,
    label: '会话绑定',
  });

  function entriesOf(channelId, botId) {
    return store.snapshot().channels?.[channelId]?.[botId] ?? {};
  }

  return {
    path: store.path,
    ready: () => store.ready(),
    subscribe: (listener) => store.subscribe(listener),

    /**
     * @returns 绑定记录，未绑定时为 undefined。
     */
    get(channelId, botId, key) {
      const entry = entriesOf(channelId, botId)[key];
      return entry ? Object.freeze({ ...entry }) : undefined;
    },

    /** @returns 某个机器人的全部绑定（key → entry）。 */
    entries(channelId, botId) {
      return Object.freeze({ ...entriesOf(channelId, botId) });
    },

    /**
     * 绑定（或更新）一个会话键。
     *
     * @param channelId - 渠道 id。
     * @param botId - 机器人 id。
     * @param key - 渠道侧会话键。
     * @param entry - { sessionId, workspacePath? }。
     */
    async bind(channelId, botId, key, entry) {
      if (typeof key !== 'string' || !key) throw new TypeError('会话键必填。');
      if (typeof entry?.sessionId !== 'string' || !entry.sessionId) {
        throw new TypeError('绑定需要 sessionId。');
      }
      await store.update((current) => ({
        ...current,
        channels: {
          ...current.channels,
          [channelId]: {
            ...(current.channels[channelId] ?? {}),
            [botId]: {
              ...((current.channels[channelId] ?? {})[botId] ?? {}),
              [key]: {
                sessionId: entry.sessionId,
                workspacePath: typeof entry.workspacePath === 'string' ? entry.workspacePath : null,
                boundAt: new Date().toISOString(),
              },
            },
          },
        },
      }));
    },

    /** 解除一个会话键的绑定（下一条消息开新会话）。 */
    async unbind(channelId, botId, key) {
      await store.update((current) => {
        const accounts = current.channels[channelId];
        const keys = accounts?.[botId];
        if (!keys || !Object.hasOwn(keys, key)) return null;
        const nextKeys = { ...keys };
        delete nextKeys[key];
        return {
          ...current,
          channels: { ...current.channels, [channelId]: { ...accounts, [botId]: nextKeys } },
        };
      });
    },

    /**
     * 一次性接管旧实现的绑定（只补空缺，不覆盖已有绑定）。
     *
     * @param channelId - 渠道 id。
     * @param botId - 机器人 id。
     * @param entries - `{ [key]: sessionId | { sessionId, workspacePath? } }`。
     * @returns 实际接管的条数。
     */
    async adopt(channelId, botId, entries) {
      if (!isPlainObject(entries)) throw new TypeError('adopt 需要 { key: sessionId } 形式。');
      let adopted = 0;
      await store.update((current) => {
        const accounts = current.channels[channelId] ?? {};
        const keys = { ...(accounts[botId] ?? {}) };
        for (const [key, value] of Object.entries(entries)) {
          if (!key || keys[key]) continue;
          const sessionId = typeof value === 'string' ? value : value?.sessionId;
          if (typeof sessionId !== 'string' || !sessionId) continue;
          keys[key] = {
            sessionId,
            workspacePath: isPlainObject(value) && typeof value.workspacePath === 'string'
              ? value.workspacePath
              : null,
            boundAt: new Date().toISOString(),
          };
          adopted += 1;
        }
        if (adopted === 0) return null;
        return {
          ...current,
          channels: { ...current.channels, [channelId]: { ...accounts, [botId]: keys } },
        };
      });
      return adopted;
    },

    /** 该 Session 属于哪个 (渠道, 机器人, 会话键)——审批/提问回传时用。 */
    locate(sessionId) {
      if (typeof sessionId !== 'string' || !sessionId) return undefined;
      const channels = store.snapshot().channels ?? {};
      for (const [channelId, accounts] of Object.entries(channels)) {
        for (const [botId, keys] of Object.entries(accounts)) {
          for (const [key, entry] of Object.entries(keys)) {
            if (entry.sessionId === sessionId) return Object.freeze({ channelId, botId, key });
          }
        }
      }
      return undefined;
    },
  };
}
