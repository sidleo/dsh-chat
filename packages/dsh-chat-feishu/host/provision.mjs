/**
 * 飞书「扫码接入」：应用注册（device registration）的状态机。
 *
 * 这是"新建机器人"那条路：向飞书申请一个一次性链接，用户用飞书扫一下（或在浏览器里打开）
 * 就**自动创建一个飞书应用**并返回它的 App ID / App Secret，扫描的人就是这台机器人的属主。
 * 另一条路是「手动接入已有的机器人」（设置页填 App ID + App Secret）。
 *
 * 出处：dsh-im 的 `src/channels/feishu/registration-manager.mjs`（MIT，v4.21.1）——
 * 同一套状态、同一个 SDK 入口（`registerApp({ onQRCodeReady, onStatusChange, signal })`）
 * 与同样的"Secret 只经回调交出去、不进任何状态"的做法。按本仓库口径**收窄重写**：
 * - 只做"新建"（不做上游那条"用扫码给已有应用增量补权限"的路，见 UPSTREAM.md）；
 * - 状态快照只留设置页要用的字段，不做 publicError 那层包裹；
 * - 一次只允许一个进行中的尝试（新的开始会作废旧的，旧的 poll 结果一律忽略）。
 *
 * @module dsh-chat-feishu/provision
 */

/** 还在进行中的状态（这些状态下才回显二维码与剩余时间）。 */
export const PROVISION_ACTIVE_STATES = Object.freeze([
  'starting', 'qr_ready', 'polling', 'slow_down', 'domain_switched',
]);

/** SDK 会回报的轮询状态（其余一律忽略，避免把 SDK 的内部状态泄漏成我们的状态机）。 */
const SDK_POLLING_STATES = Object.freeze(['polling', 'slow_down', 'domain_switched']);

function positiveSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new TypeError('registerApp 的 onQRCodeReady 没给合法的 expireIn。');
  }
  return seconds;
}

/**
 * 创建扫码接入管理器。
 *
 * @param options - {
 *   registerApp: (options) => Promise<{ client_id, client_secret, user_info }>,
 *   onCredentials: ({ appId, appSecret, userInfo }) => Promise<void>,
 *   logger, now?, setTimeout?, clearTimeout?,
 * }。
 * @returns `{ start, status, cancel, dispose }`。
 */
export function createProvisionManager({
  registerApp,
  onCredentials,
  logger = console,
  now = Date.now,
  setTimeout: setTimeoutFn = globalThis.setTimeout,
  clearTimeout: clearTimeoutFn = globalThis.clearTimeout,
} = {}) {
  if (typeof registerApp !== 'function') throw new TypeError('扫码接入需要 registerApp。');
  if (typeof onCredentials !== 'function') throw new TypeError('扫码接入需要 onCredentials。');

  let attempt = 0;
  let active = null;
  let snapshot = { state: 'idle', attempt: 0, updatedAt: now(), error: null };

  function isCurrent(run) {
    return active === run;
  }

  function clearTimer(run) {
    if (run?.expiryTimer) {
      clearTimeoutFn(run.expiryTimer);
      run.expiryTimer = null;
    }
  }

  function makeSnapshot(run, state, extra = {}) {
    const next = {
      state,
      attempt: run?.id ?? attempt,
      updatedAt: now(),
      error: null,
      ...extra,
    };
    if (state === 'succeeded' && run?.bot) next.bot = run.bot;
    if (run?.qrCodeUrl && PROVISION_ACTIVE_STATES.includes(state)) {
      next.qrCodeUrl = run.qrCodeUrl;
      next.expiresAt = run.expiresAt;
    }
    return next;
  }

  function setState(run, state, extra = {}) {
    if (!isCurrent(run)) return;
    snapshot = makeSnapshot(run, state, extra);
  }

  function finish(run, state, extra = {}) {
    if (!isCurrent(run)) return;
    clearTimer(run);
    snapshot = makeSnapshot(run, state, extra);
    active = null;
  }

  function expire(run) {
    if (!isCurrent(run)) return;
    finish(run, 'expired', {
      error: { code: 'expired_token', message: '二维码/授权链接已失效，请重新生成。' },
    });
    run.controller.abort();
  }

  function publicError(error) {
    const code = error?.code === 'abort' || error?.code === 'expired_token'
      ? error.code
      : (typeof error?.code === 'string' ? error.code : 'registration_failed');
    const messages = {
      abort: '已取消。',
      expired_token: '授权已失效，请重新生成。',
    };
    return {
      code,
      message: messages[code] ?? (error?.message ?? '扫码接入失败。'),
    };
  }

  function onQrCodeReady(run, info) {
    if (!isCurrent(run)) return;
    if (typeof info?.url !== 'string' || !info.url) {
      throw new TypeError('registerApp 的 onQRCodeReady 没给 URL。');
    }
    const seconds = positiveSeconds(info.expireIn);
    run.qrCodeUrl = info.url;
    run.expiresAt = now() + seconds * 1000;
    clearTimer(run);
    run.expiryTimer = setTimeoutFn(() => expire(run), seconds * 1000);
    run.expiryTimer?.unref?.();
    setState(run, 'qr_ready');
  }

  function onStatusChange(run, info) {
    if (!isCurrent(run) || !SDK_POLLING_STATES.includes(info?.status)) return;
    setState(run, info.status);
  }

  async function onSucceeded(run, result) {
    if (!isCurrent(run)) return;
    // 凭据形状：SDK 给 `client_id` / `client_secret`（也兼容 appId/appSecret 的写法）。
    const appId = result?.client_id ?? result?.appId;
    const appSecret = result?.client_secret ?? result?.appSecret;
    if (typeof appId !== 'string' || !appId || typeof appSecret !== 'string' || !appSecret) {
      finish(run, 'error', {
        error: { code: 'invalid_credentials', message: '飞书返回的应用凭据不完整。' },
      });
      return;
    }
    // 凭据到手之后二维码就作废了：链接先从状态里撤掉，再落盘（`saving` 期间不该还能扫）。
    clearTimer(run);
    run.qrCodeUrl = null;
    run.expiresAt = null;
    setState(run, 'saving');
    try {
      const userInfo = result?.user_info ?? result?.userInfo ?? null;
      const saved = await onCredentials({ appId, appSecret, userInfo });
      if (isCurrent(run)) {
        run.bot = saved ?? null;
        finish(run, 'succeeded');
      }
    } catch (error) {
      logger.warn?.(`[dsh-chat-feishu] 扫码接入落盘失败：${error?.message ?? error}`);
      if (isCurrent(run)) {
        finish(run, 'error', { error: publicError(error) });
      }
    }
  }

  /**
   * 开始一次尝试（**不等待**那个长轮询：调用方随后轮 `status()`）。
   *
   * @returns 当前状态快照。
   */
  function start(options = {}) {
    // 上一次还没结束就作废它（旧的回调一律被 isCurrent 挡掉）。
    if (active) {
      clearTimer(active);
      const previous = active;
      active = null;
      previous.controller.abort();
    }
    const run = {
      id: ++attempt,
      controller: new AbortController(),
      qrCodeUrl: null,
      expiresAt: null,
      expiryTimer: null,
      bot: null,
    };
    active = run;
    snapshot = makeSnapshot(run, 'starting');

    const registerOptions = {
      ...options,
      signal: run.controller.signal,
      onQRCodeReady: (info) => onQrCodeReady(run, info),
      onStatusChange: (info) => onStatusChange(run, info),
    };
    // 放到微任务里：同步抛与 Promise 拒绝走同一条路，start() 本身不阻塞。
    const task = Promise.resolve().then(() => registerApp(registerOptions));
    void task.then(
      (result) => onSucceeded(run, result),
      (error) => {
        if (!isCurrent(run)) return;
        const mapped = publicError(error);
        logger.warn?.(`[dsh-chat-feishu] 扫码接入失败：${mapped.code} ${mapped.message}`);
        finish(run, mapped.code === 'expired_token' ? 'expired' : 'error', { error: mapped });
      },
    );
    return status();
  }

  /** @returns 当前状态快照（含剩余秒数；过期就地结算）。 */
  function status() {
    if (active?.expiresAt !== null && active?.expiresAt !== undefined && now() >= active.expiresAt) {
      expire(active);
    }
    const out = { ...snapshot };
    if (out.error) out.error = { ...out.error };
    if (active && active.expiresAt !== null && PROVISION_ACTIVE_STATES.includes(out.state)) {
      out.remainingSeconds = Math.max(0, Math.ceil((active.expiresAt - now()) / 1000));
    }
    return out;
  }

  /** 取消当前尝试（没有进行中的就原样返回）。 */
  function cancel() {
    const run = active;
    if (!run) return status();
    finish(run, 'cancelled', { error: { code: 'abort', message: '已取消。' } });
    run.controller.abort();
    return status();
  }

  /** 停机：结束进行中的尝试，不再计时。 */
  function dispose() {
    if (active) {
      const run = active;
      clearTimer(run);
      active = null;
      run.controller.abort();
    }
  }

  return Object.freeze({ start, status, cancel, dispose });
}
