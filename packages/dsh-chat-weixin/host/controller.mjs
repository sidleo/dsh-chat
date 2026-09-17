/**
 * 微信渠道控制器：账号生命周期（扫码登录、连接、状态）与渠道 RPC 端点。
 *
 * `botId` / `tokenRef` 用与上游相同的推导（sha256(accountId) 前 24 位十六进制），
 * 因此现有账号零重扫：同一条凭据引用会被原样读到。
 *
 * @module dsh-chat-weixin/controller
 */

import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { createWeixinConfigStore } from './config-store.mjs';
import { createIlinkClient } from './ilink-client.mjs';
import { createWeixinRuntime } from './runtime.mjs';
import { createWeixinStateStore } from './state-store.mjs';

/** 扫码尝试的有效期。 */
const LOGIN_TTL_MS = 5 * 60_000;

/**
 * 由 accountId 推导 botId 与凭据引用名（与上游一致，保证零重扫）。
 *
 * @param accountId - iLink 返回的 `ilink_bot_id`。
 * @returns { botId, tokenRef }。
 */
export function deriveIdentity(accountId) {
  const raw = typeof accountId === 'string' ? accountId.trim() : '';
  if (!raw) throw new TypeError('deriveIdentity 需要 accountId。');
  const digest = createHash('sha256').update(raw).digest('hex').slice(0, 24);
  return { botId: `wx_${digest}`, tokenRef: `DSH_WEIXIN_BOT_TOKEN_${digest.toUpperCase()}` };
}

function maskAccountId(accountId) {
  const raw = typeof accountId === 'string' ? accountId : '';
  if (raw.length <= 8) return '****';
  return `${raw.slice(0, 4)}****${raw.slice(-4)}`;
}

/** 服务端可能把 API 基址重定向到别的微信域名；只接受微信自己的域名。 */
function apiBaseFromServer(value, fallback) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return fallback;
    const host = url.hostname.toLowerCase();
    if (!host.endsWith('weixin.qq.com') && !host.endsWith('wechat.com')) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

async function resolveToken(credentials, ref) {
  if (typeof credentials?.resolve !== 'function') {
    throw new Error('当前 Host 未提供凭据服务，无法读取微信登录令牌。');
  }
  const resolved = await credentials.resolve(ref);
  if (!resolved?.value) {
    const error = new Error('微信登录令牌缺失，请在设置页重新扫码。');
    error.code = 'weixin/token-missing';
    throw error;
  }
  return resolved.value;
}

/**
 * 创建微信渠道控制器。
 *
 * @param options - { deps, logger, config, internals }。
 * @returns 控制器。
 */
export function createWeixinController({ deps, logger = console, config = {}, internals = {} }) {
  const dataDir = deps.dataDir;
  if (typeof dataDir !== 'string' || !dataDir) throw new TypeError('微信控制器需要 deps.dataDir。');
  if (typeof deps.sessions?.ask !== 'function' || typeof deps.contextEnhancement?.enhanceContent !== 'function') {
    throw new TypeError('微信控制器需要 hub 的 sessions.ask 与 contextEnhancement（请确认 dsh-chat 已加载）。');
  }
  if (typeof deps.createJsonStore !== 'function') {
    throw new TypeError('微信控制器需要 hub 的 createJsonStore。');
  }
  const clientFactory = internals.createClient ?? createIlinkClient;

  const configStore = createWeixinConfigStore({
    path: join(dataDir, 'config.json'),
    createJsonStore: deps.createJsonStore,
  });
  /** @type {Map<string, object>} botId → 运行记录 */
  const runtimes = new Map();
  /** @type {Map<string, object>} attemptId → 扫码尝试 */
  const attempts = new Map();

  function newClient() {
    return clientFactory({ fetchImpl: internals.fetchImpl });
  }

  async function startAccount(account) {
    const existing = runtimes.get(account.botId);
    if (existing && ['starting', 'running', 'reconnecting'].includes(existing.phase)) return existing;
    const record = {
      account,
      phase: 'starting',
      error: null,
      runtime: null,
      controller: new AbortController(),
    };
    runtimes.set(account.botId, record);
    try {
      const token = await resolveToken(deps.credentials, account.tokenRef);
      const client = newClient();
      const state = createWeixinStateStore({
        path: join(dataDir, 'accounts', account.botId, 'state.json'),
        createJsonStore: deps.createJsonStore,
      });
      await state.ready();
      if (deps.sessions?.bindings?.adopt) {
        await deps.sessions.bindings.adopt(deps.channelId, account.botId, state.sessions());
      }
      const runtime = createWeixinRuntime({
        account, token, deps, client, state, logger,
      });
      record.runtime = runtime;
      record.state = state;
      // 长轮询会一直跑在后台；失败在运行时内部处理（重试/令牌失效）。
      void runtime.start({ signal: record.controller.signal }).catch((error) => {
        record.phase = 'failed';
        record.error = error?.code ?? 'weixin/runtime-failed';
        record.errorMessage = error?.message ?? String(error);
        logger.error?.(`[dsh-chat-weixin] ${account.botId} 运行失败：${record.errorMessage}`);
      });
      record.phase = 'running';
      record.error = null;
      logger.info?.(`[dsh-chat-weixin] ${account.botName ?? maskAccountId(account.accountId)} 长轮询已启动`);
    } catch (error) {
      record.phase = 'failed';
      record.error = typeof error?.code === 'string' ? error.code : 'weixin/start-failed';
      record.errorMessage = error?.message ?? String(error);
      logger.error?.(`[dsh-chat-weixin] ${account.botId} 启动失败：${record.errorMessage}`);
    }
    return record;
  }

  async function stopAccount(botId) {
    const record = runtimes.get(botId);
    if (!record) return;
    record.controller?.abort?.();
    try {
      await record.runtime?.stop?.(record.controller.signal);
    } catch (error) {
      logger.warn?.(`[dsh-chat-weixin] ${botId} 停止时报错：${error?.message ?? error}`);
    }
    try {
      await record.state?.flush?.();
    } catch {
      // 状态落盘失败不影响停机。
    }
    record.runtime = null;
    if (record.phase !== 'failed') record.phase = 'stopped';
  }

  function accountStatus(record) {
    const runtime = record.runtime?.status?.() ?? {};
    return Object.freeze({
      botId: record.account.botId,
      accountIdMasked: maskAccountId(record.account.accountId),
      botName: record.account.botName ?? null,
      state: runtime.phase ?? record.phase,
      error: record.error ?? null,
      errorMessage: record.errorMessage ?? runtime.error ?? null,
      handled: runtime.handled ?? 0,
      lastHandledAt: runtime.lastHandledAt ?? null,
      lastMessageAt: runtime.lastMessageAt ?? null,
    });
  }

  function pruneAttempts() {
    const now = Date.now();
    for (const [id, attempt] of attempts) {
      if (now - attempt.createdAt > LOGIN_TTL_MS) attempts.delete(id);
    }
  }

  async function status() {
    await configStore.ready();
    return Object.freeze({
      channel: deps.channelId,
      dataDir,
      accounts: Object.freeze(configStore.list().map((account) => accountStatus(
        runtimes.get(account.botId) ?? { account, phase: 'stopped', runtime: null },
      ))),
    });
  }

  async function startAll() {
    await configStore.ready();
    const accounts = configStore.list();
    logger.info?.(`[dsh-chat-weixin] 发现 ${accounts.length} 个已绑定账号`);
    await Promise.all(accounts.map((account) => startAccount(account)));
  }

  const delivery = Object.freeze({
    /** 主动发文本：私聊对端就是 `from_user_id`，回复要带该用户最近一次的 context_token。 */
    async send({ botId, target, text }) {
      const record = runtimes.get(botId);
      if (!record?.runtime || record.phase !== 'running') {
        const error = new Error(`账号 ${botId} 当前不在线，无法投递。`);
        error.code = 'weixin/account-offline';
        throw error;
      }
      const userId = target.route?.userId;
      if (!userId) {
        const error = new Error('投递目标的 route 缺少 userId。');
        error.code = 'chat/bad-target';
        throw error;
      }
      return record.runtime.sendProactive({ userId, text });
    },

    /** 从该账号的会话记录里发现候选目标。 */
    async discover({ botId }) {
      const record = runtimes.get(botId);
      if (!record?.state) return [];
      return Object.keys(record.state.sessions?.() ?? {})
        .filter((key) => key.startsWith('p2p:'))
        .map((key) => {
          const userId = key.slice(4);
          const short = userId.length > 12 ? `${userId.slice(0, 6)}…${userId.slice(-4)}` : userId;
          return {
            id: key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64),
            name: `私聊 · ${short}`,
            kind: 'direct',
            route: { userId },
          };
        });
    },
  });

  return Object.freeze({
    start: startAll,
    delivery,
    async stop() {
      await Promise.all([...runtimes.keys()].map((botId) => stopAccount(botId)));
    },
    status,

    endpoints: Object.freeze({
      'connection.status': async () => ({ ok: true, value: await status() }),

      /** 申请登录二维码。 */
      'login.begin': async () => {
        try {
          const client = newClient();
          const known = configStore.list().map((account) => account.accountId);
          const { qrcode, qrcodeUrl } = await client.beginLogin({ localTokens: known });
          pruneAttempts();
          const attemptId = randomUUID();
          attempts.set(attemptId, {
            qrcode, createdAt: Date.now(), baseUrl: config.connectBaseUrl,
          });
          return { ok: true, value: { attemptId, qrcodeUrl, expiresInMs: LOGIN_TTL_MS } };
        } catch (error) {
          return {
            ok: false,
            error: {
              code: error?.code ?? 'weixin/qr-failed',
              message: error?.message ?? '申请二维码失败。',
              details: {},
            },
          };
        }
      },

      /**
       * 轮询扫码状态；确认后落盘账号并启动长轮询。
       *
       * @param payload - { attemptId, verifyCode? }。
       */
      'login.poll': async (payload) => {
        const attempt = attempts.get(payload?.attemptId);
        if (!attempt) {
          return {
            ok: false,
            error: { code: 'weixin/unknown-attempt', message: '登录尝试已失效，请重新生成二维码。', details: {} },
          };
        }
        try {
          const client = newClient();
          const response = await client.pollLogin({
            qrcode: attempt.qrcode,
            baseUrl: attempt.baseUrl,
            verifyCode: payload?.verifyCode,
          });
          const statusValue = response.status;
          if (statusValue === 'scaned_but_redirect') {
            attempt.baseUrl = apiBaseFromServer(response.redirect_host, attempt.baseUrl);
          }
          if (statusValue !== 'confirmed') {
            if (statusValue === 'expired' || statusValue === 'verify_code_blocked') {
              attempts.delete(payload.attemptId);
            }
            return { ok: true, value: { status: statusValue } };
          }

          const accountId = typeof response.ilink_bot_id === 'string' ? response.ilink_bot_id.trim() : '';
          const ownerUserId = typeof response.ilink_user_id === 'string' ? response.ilink_user_id.trim() : '';
          const token = typeof response.bot_token === 'string' ? response.bot_token.trim() : '';
          if (!accountId || !ownerUserId || !token) {
            return {
              ok: false,
              error: { code: 'weixin/incomplete-login', message: '微信授权成功但返回的凭据不完整。', details: {} },
            };
          }
          const identity = deriveIdentity(accountId);
          await deps.credentials.set(identity.tokenRef, token);
          const account = await configStore.saveAccount({
            ...identity,
            accountId,
            ownerUserId,
            baseUrl: apiBaseFromServer(response.baseurl, attempt.baseUrl),
            botName: typeof response.nickname === 'string' ? response.nickname : null,
            createdAt: new Date().toISOString(),
            connectedAt: new Date().toISOString(),
          });
          attempts.delete(payload.attemptId);
          await startAccount(account);
          return { ok: true, value: { status: 'connected', botId: account.botId } };
        } catch (error) {
          return {
            ok: false,
            error: {
              code: error?.code ?? 'weixin/login-poll-failed',
              message: error?.message ?? '查询扫码状态失败。',
              details: {},
            },
          };
        }
      },

      /** 取消扫码。 */
      'login.cancel': async (payload) => {
        const existed = attempts.delete(payload?.attemptId);
        return { ok: true, value: { cancelled: existed } };
      },

      /** 重连某个账号。 */
      'account.reconnect': async (payload) => {
        if (typeof payload?.botId !== 'string' || !payload.botId) {
          return { ok: false, error: { code: 'chat/bad-request', message: '需要 botId。', details: {} } };
        }
        await configStore.ready();
        const account = configStore.get(payload.botId);
        if (!account) {
          return {
            ok: false,
            error: { code: 'weixin/unknown-account', message: `未找到账号 ${payload.botId}。`, details: {} },
          };
        }
        await stopAccount(account.botId);
        const record = await startAccount(account);
        return { ok: true, value: accountStatus(record) };
      },

      /** 移除账号（配置与运行态；凭据一并清除）。 */
      'account.delete': async (payload) => {
        if (typeof payload?.botId !== 'string' || payload.confirm !== true) {
          return {
            ok: false,
            error: { code: 'chat/bad-request', message: '删除需要 botId 与 confirm=true。', details: {} },
          };
        }
        await configStore.ready();
        const account = configStore.get(payload.botId);
        await stopAccount(payload.botId);
        runtimes.delete(payload.botId);
        if (account) {
          await configStore.removeAccount(payload.botId);
          try {
            await deps.credentials.unset(account.tokenRef);
          } catch (error) {
            logger.warn?.(`[dsh-chat-weixin] 清除凭据失败：${error?.message ?? error}`);
          }
        }
        return { ok: true, value: { removed: Boolean(account) } };
      },
    }),
  });
}
