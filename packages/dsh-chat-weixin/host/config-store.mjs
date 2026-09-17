/**
 * 微信账号配置存储。
 *
 * 沿用 dsh-im 的 `~/.dsh/integrations/dsh-weixin/config.json`（version 1）
 * 与凭据引用（`tokenRef` 指向 DSH 凭据服务里的登录令牌），因此现有账号零重扫。
 * 落盘纪律由 hub 提供的 `deps.createJsonStore` 统一负责（原子写/备份/串行队列）。
 *
 * @module dsh-chat-weixin/config-store
 */

const ACCOUNT_ID = /^[A-Za-z0-9_@.:+-]{1,128}$/;
const TOKEN_REF = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FALLBACK_BASE_URL = 'https://ilinkai.weixin.qq.com/';

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * 归一化一个账号条目。
 *
 * @param value - 磁盘上的账号。
 * @returns 冻结的账号配置，或 null（信息不足）。
 */
export function normalizeAccount(value) {
  if (!value || typeof value !== 'object') return null;
  const botId = cleanString(value.botId);
  const accountId = cleanString(value.accountId);
  const tokenRef = cleanString(value.tokenRef);
  const ownerUserId = cleanString(value.ownerUserId);
  if (!botId || !ACCOUNT_ID.test(botId)) return null;
  if (!accountId || !ACCOUNT_ID.test(accountId)) return null;
  if (!tokenRef || !TOKEN_REF.test(tokenRef)) return null;
  if (!ownerUserId) return null;
  return Object.freeze({
    botId,
    accountId,
    tokenRef,
    ownerUserId,
    baseUrl: cleanString(value.baseUrl) ?? FALLBACK_BASE_URL,
    botName: cleanString(value.botName),
    createdAt: cleanString(value.createdAt),
    connectedAt: cleanString(value.connectedAt),
  });
}

function normalizeDocument(value) {
  const source = value && typeof value === 'object' && Array.isArray(value.accounts) ? value : null;
  if (!source) return { version: 1, accounts: [] };
  const accounts = source.accounts.map((account) => normalizeAccount(account));
  if (accounts.some((account) => account === null)) {
    throw new Error('dsh-weixin config.json 含无法识别的账号条目');
  }
  return { version: 1, accounts };
}

/**
 * 创建账号配置存储。
 *
 * @param options - { path, createJsonStore }。
 * @returns 存储 API。
 */
export function createWeixinConfigStore({ path, createJsonStore }) {
  if (typeof createJsonStore !== 'function') {
    throw new TypeError('微信配置存储需要 hub 提供的 createJsonStore。');
  }
  const store = createJsonStore({
    path,
    normalize: normalizeDocument,
    empty: () => ({ version: 1, accounts: [] }),
    label: '微信账号配置',
  });

  return {
    path,
    ready: () => store.ready(),
    subscribe: (listener) => store.subscribe(listener),

    /** @returns 全部账号。 */
    list() {
      return Object.freeze([...(store.snapshot().accounts ?? [])]);
    },

    /** @returns 指定账号，未配置时 undefined。 */
    get(botId) {
      return store.snapshot().accounts.find((account) => account.botId === botId);
    },

    /** 追加或覆盖一个账号。 */
    async saveAccount(account) {
      const normalized = normalizeAccount(account);
      if (!normalized) throw new TypeError('微信账号信息不完整（botId/accountId/tokenRef/ownerUserId 必填）。');
      await store.update((current) => {
        const accounts = [...current.accounts];
        const index = accounts.findIndex((item) => item.botId === normalized.botId);
        if (index >= 0) accounts[index] = normalized;
        else accounts.push(normalized);
        return { version: 1, accounts };
      });
      return normalized;
    },

    /** 删除一个账号。 */
    async removeAccount(botId) {
      let removed = false;
      await store.update((current) => {
        const accounts = current.accounts.filter((account) => account.botId !== botId);
        if (accounts.length === current.accounts.length) return null;
        removed = true;
        return { version: 1, accounts };
      });
      return removed;
    },
  };
}
