/**
 * 微信账号的运行状态存储。
 *
 * 沿用 dsh-im 的 `accounts/<botId>/state.json`：会话绑定、已处理消息 id、
 * 长轮询游标（`getUpdatesBuf`）与 per-user 的 `context_token`。
 * 会话绑定在启动时交给 hub 的会话桥 `adopt()` 接管，升级不丢会话。
 *
 * @module dsh-chat-weixin/state-store
 */

const MAX_SEEN = 1_000;
const MAX_CONTEXT_TOKENS = 200;

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
  const seenMessageIds = Array.isArray(source.seenMessageIds)
    ? source.seenMessageIds.filter((id) => typeof id === 'string' && id).slice(-MAX_SEEN)
    : [];
  const contextTokens = {};
  if (isPlainObject(source.contextTokens)) {
    for (const [userId, token] of Object.entries(source.contextTokens).slice(-MAX_CONTEXT_TOKENS)) {
      if (typeof token === 'string' && token) contextTokens[userId] = token;
    }
  }
  return {
    version: 1,
    sessions,
    seenMessageIds,
    contextTokens,
    getUpdatesBuf: typeof source.getUpdatesBuf === 'string' ? source.getUpdatesBuf : '',
  };
}

/**
 * 创建状态存储。
 *
 * @param options - { path, createJsonStore }。
 * @returns 状态 API。
 */
export function createWeixinStateStore({ path, createJsonStore }) {
  if (typeof createJsonStore !== 'function') {
    throw new TypeError('微信状态存储需要 hub 提供的 createJsonStore。');
  }
  const store = createJsonStore({
    path,
    normalize: normalizeDocument,
    empty: () => ({
      version: 1, sessions: {}, seenMessageIds: [], contextTokens: {}, getUpdatesBuf: '',
    }),
    label: '微信账号状态',
  });

  return {
    path,
    ready: () => store.ready(),

    /** @returns 旧实现的会话绑定（交给 hub 的会话桥 adopt）。 */
    sessions() {
      return Object.freeze({ ...(store.snapshot().sessions ?? {}) });
    },

    /** @returns 长轮询游标。 */
    getUpdatesBuf() {
      return store.snapshot().getUpdatesBuf ?? '';
    },

    /** 记录长轮询游标（每轮都会变，写入串行且失败不阻塞收消息）。 */
    async saveGetUpdatesBuf(value) {
      if (typeof value !== 'string' || value === store.snapshot().getUpdatesBuf) return;
      await store.update((current) => ({ ...current, getUpdatesBuf: value }));
    },

    /** 某个用户最近一次的 context_token（回复时要原样带回）。 */
    contextToken(userId) {
      return store.snapshot().contextTokens?.[userId];
    },

    /** 记录 context_token。 */
    async rememberContextToken(userId, token) {
      if (typeof userId !== 'string' || !userId) return;
      if (typeof token !== 'string' || !token) return;
      if (store.snapshot().contextTokens?.[userId] === token) return;
      await store.update((current) => {
        const contextTokens = { ...(current.contextTokens ?? {}) };
        delete contextTokens[userId];
        contextTokens[userId] = token;
        const keys = Object.keys(contextTokens);
        for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_CONTEXT_TOKENS))) {
          delete contextTokens[stale];
        }
        return { ...current, contextTokens };
      });
    },

    /**
     * 去重：第一次见到返回 true。
     *
     * @param id - 平台消息 id。
     */
    markSeen(id) {
      if (typeof id !== 'string' || !id) return true;
      const current = store.snapshot();
      if (current.seenMessageIds.includes(id)) return false;
      const seenMessageIds = [...current.seenMessageIds, id].slice(-MAX_SEEN);
      void store.update((doc) => ({ ...doc, seenMessageIds })).catch(() => {
        // 去重集合的落盘失败不影响本轮处理；下次启动可能重复处理一条消息。
      });
      return true;
    },

    /** 等待已排队的写入落定（停机前调用）。 */
    async flush() {
      await store.flush();
    },
  };
}
