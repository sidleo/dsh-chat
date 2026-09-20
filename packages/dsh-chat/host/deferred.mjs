/**
 * 延迟交付：**超时放手之后，继续有界地盯着这一轮的终态，拿到结果就补发**。
 *
 * 为什么需要它：`ask()` 的超时兜底只防"流断了/回合卡死"，不是长任务。可一旦判定超时，
 * 我们就把 follow 流收掉、渠道只回一句「回合未正常结束（timeout）」——如果那一轮其实之后
 * 跑完了，**最终答案谁也拿不到**（"回合跑完但用户没收到"这条故障线本仓库栽过两次）。
 *
 * 做法（照上游 dsh-im 的 deferred-delivery 收窄）：
 * - 超时时只**登记一条待交付记录**（会话路由 + sessionId + turn + 超时原因），不重问、不重跑；
 * - 之后**有界复查**：先等 `firstCheckMs`，再每 `intervalMs` 一次，最多盯 `maxAgeMs`；
 *   每次用调用方给的 `probe` 问一句"这个会话还在跑吗、最后一条助手正文是什么"；
 * - 会话空闲且拿到非空正文 → 交给渠道注册的 `deliver` 补发，然后删记录；
 * - 会话没了 / 一直空闲但没有正文 / 盯满时限 → 删记录并留日志（不静默）。
 *
 * 语义边界（与上游一致）：平台侧没有消息事务，**不承诺恰好一次**——补发过但删记录前崩溃、
 * 或同一 chat 里紧接着又有一轮很快结束，都可能重复补发一次。宁可能重复，也不丢。
 *
 * 记录落盘（`deferred.json`）：进程重启后由渠道在重新建桥时 `register`，届时重新起盯；
 * 盯不到就按上面的规则清掉。
 *
 * @module dsh-chat/host/deferred
 */

import { join } from 'node:path';

import { createJsonStore } from './json-store.mjs';

/** 超时后第一次复查的等待：给它一点时间自己跑完（真机上"刚好差一点"是最常见的情况）。 */
const FIRST_CHECK_MS = 60_000;
/** 之后每次复查的间隔。 */
const INTERVAL_MS = 30_000;
/** 最多盯多久：超过就认了（记录删掉、日志留痕）。 */
const MAX_AGE_MS = 30 * 60_000;
/** 同一个会话键最多留几条：多了说明这个 chat 一直在超时，留最新的就够。 */
const MAX_PER_KEY = 2;
/** 正文长度上限：与最终答案同一个量级，防一条记录把状态文件撑爆。 */
const MAX_TEXT = 8_000;

/**
 * 创建延迟交付服务。
 *
 * @param options - {
 *   dataDir, logger, probe, firstCheckMs?, intervalMs?, maxAgeMs?,
 * }。
 *   `probe({ record })` 由 hub 提供：返回 `{ exists, running, text }`（会话在不在、是否还在跑、
 *   最后一条助手正文）。这样这个模块不碰 DSH 的细节，只负责"盯 + 补发"。
 * @returns 服务：ready / register / schedule / checkNow / list / forgetKey / stop。
 */
export function createDeferredDelivery({
  dataDir,
  logger = console,
  probe,
  firstCheckMs = FIRST_CHECK_MS,
  intervalMs = INTERVAL_MS,
  maxAgeMs = MAX_AGE_MS,
} = {}) {
  if (typeof dataDir !== 'string' || !dataDir.trim()) {
    throw new TypeError('延迟交付需要 dataDir。');
  }
  if (typeof probe !== 'function') throw new TypeError('延迟交付需要 probe。');

  const store = createJsonStore({
    path: join(dataDir, 'deferred.json'),
    empty: () => ({ version: 1, records: [] }),
    normalize: (value) => {
      const source = value && typeof value === 'object' && Array.isArray(value.records) ? value : { records: [] };
      return {
        version: 1,
        records: source.records.filter((row) => row && typeof row === 'object'
          && typeof row.id === 'string' && typeof row.sessionId === 'string'
          && typeof row.channelId === 'string' && typeof row.botId === 'string'
          && typeof row.key === 'string').map((row) => ({
          id: row.id,
          channelId: row.channelId,
          botId: row.botId,
          key: row.key,
          sessionId: row.sessionId,
          turn: Number.isInteger(row.turn) ? row.turn : null,
          startedAt: Number.isFinite(row.startedAt) ? row.startedAt : null,
          timedOutAt: Number.isFinite(row.timedOutAt) ? row.timedOutAt : Date.now(),
          reason: typeof row.reason === 'string' ? row.reason : 'timeout',
          attempts: Number.isInteger(row.attempts) ? row.attempts : 0,
          lastError: typeof row.lastError === 'string' ? row.lastError : null,
        })),
      };
    },
    logger,
    label: '延迟交付记录',
  });

  /** `${channelId}:${botId}` → 渠道注册的补发函数（渠道建桥时注册）。 */
  const deliverers = new Map();
  /** id → 定时器（unref，不拖住进程退出）。 */
  const timers = new Map();
  let stopped = false;
  let seq = 0;

  const keyOf = (row) => `${row.channelId}:${row.botId}`;
  const find = (id) => store.snapshot().records.find((row) => row.id === id) ?? null;

  function clearTimer(id) {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
  }

  /** 记一条：落盘 + 起盯。 */
  async function persist(records) {
    await store.update(() => ({ version: 1, records }));
  }

  async function drop(id, why) {
    clearTimer(id);
    const row = find(id);
    if (!row) return;
    await persist(store.snapshot().records.filter((item) => item.id !== id));
    logger.info?.(`[dsh-chat] 延迟交付记录已清理（${why}）：${row.channelId}/${row.botId} ${row.key}`
      + ` 会话=${row.sessionId}`);
  }

  /** 一次复查：还在跑就继续等，空闲且有正文就补发。 */
  async function check(id) {
    if (stopped) return;
    const row = find(id);
    if (!row) {
      clearTimer(id);
      return;
    }
    const age = Date.now() - (row.timedOutAt ?? Date.now());
    let state = null;
    try {
      state = await probe({ record: row });
    } catch (error) {
      // 读不到不算"跑完了"：记下来继续盯（失败必须可见）。
      logger.warn?.(`[dsh-chat] 延迟交付复查失败（${row.key}）：${error?.message ?? error}`);
      await bump(id, { lastError: error?.message ?? String(error) });
    }
    if (state?.exists === false) {
      await drop(id, '会话已不存在');
      return;
    }
    if (state?.rebound === true) {
      // 这个聊天已经换到别的会话了：旧结果发过去是错的，直接作废。
      await drop(id, '聊天已换绑到别的会话');
      return;
    }
    if (state && state.running !== true) {
      const text = typeof state.text === 'string' ? state.text.trim() : '';
      if (text) {
        const deliver = deliverers.get(keyOf(row));
        if (typeof deliver !== 'function') {
          // 渠道还没注册（例如重启后先读到了记录）：再等等，别丢。
          logger.warn?.(`[dsh-chat] 延迟交付还没有可用的发送器（${keyOf(row)}），继续等待`);
          await bump(id, {});
        } else {
          try {
            await deliver({ key: row.key, text: text.slice(0, MAX_TEXT), record: row });
            logger.info?.(`[dsh-chat] 延迟交付已补发：${row.channelId}/${row.botId} ${row.key}`
              + ` ${text.length} 字（超时后 ${Math.round(age / 1000)} 秒）`);
            await drop(id, '已补发');
            return;
          } catch (error) {
            logger.warn?.(`[dsh-chat] 延迟交付补发失败（${row.key}）：${error?.message ?? error}`);
            await bump(id, { lastError: error?.message ?? String(error) });
          }
        }
      } else {
        await bump(id, {});
      }
    } else {
      await bump(id, {});
    }
    if (Date.now() - (row.timedOutAt ?? Date.now()) >= maxAgeMs) {
      await drop(id, '超过盯守时限');
      return;
    }
    arm(id, intervalMs);
  }

  async function bump(id, patch) {
    const records = store.snapshot().records.map((row) => (row.id === id
      ? { ...row, attempts: (row.attempts ?? 0) + 1, ...patch }
      : row));
    await persist(records);
  }

  function arm(id, delay) {
    clearTimer(id);
    if (stopped) return;
    const timer = setTimeout(() => { void check(id); }, delay);
    timer.unref?.();
    timers.set(id, timer);
  }

  return {
    path: store.path,

    /** 等磁盘文档就绪（与其它 store 一致）。 */
    ready: () => store.ready(),

    /**
     * 渠道注册"怎么把补发内容发回这个会话"。同一 channel/bot 后注册的覆盖先前的。
     * 注册时顺手把该 bot 的既有记录重新盯起来（重启后的续盯）。
     */
    register({ channelId, botId, deliver }) {
      if (typeof channelId !== 'string' || !channelId) throw new TypeError('register 需要 channelId。');
      if (typeof botId !== 'string' || !botId) throw new TypeError('register 需要 botId。');
      if (typeof deliver !== 'function') throw new TypeError('register 需要 deliver 函数。');
      deliverers.set(`${channelId}:${botId}`, deliver);
      for (const row of store.snapshot().records) {
        if (row.channelId === channelId && row.botId === botId && !timers.has(row.id)) {
          arm(row.id, firstCheckMs);
        }
      }
    },

    registerCount: () => deliverers.size,

    /**
     * 登记一条待交付记录（超时那一刻调用）。
     *
     * @param record - `{ channelId, botId, key, sessionId, turn?, startedAt?, reason? }`。
     * @returns 记录 id。
     */
    async schedule({ channelId, botId, key, sessionId, turn = null, startedAt = null, reason = 'timeout' }) {
      await store.ready();
      seq += 1;
      const id = `df-${Date.now().toString(36)}-${seq}`;
      const row = {
        id,
        channelId,
        botId,
        key,
        sessionId,
        turn,
        startedAt,
        timedOutAt: Date.now(),
        reason,
        attempts: 0,
        lastError: null,
      };
      const records = store.snapshot().records;
      const sameKey = (item) => item.channelId === channelId && item.botId === botId && item.key === key;
      const mine = records.filter(sameKey);
      // 同一个会话键最多留 MAX_PER_KEY 条：超出丢最旧的（连同它的定时器一起清）。
      const kept = [...mine, row].slice(-MAX_PER_KEY);
      for (const dropped of mine) {
        if (!kept.includes(dropped)) clearTimer(dropped.id);
      }
      await persist([...records.filter((item) => !sameKey(item)), ...kept]);
      logger.info?.(`[dsh-chat] 这一轮超时了，登记待交付：${channelId}/${botId} ${key}`
        + ` 会话=${sessionId} turn=${turn ?? '?'}（${reason}），${Math.round(firstCheckMs / 1000)} 秒后开始复查`);
      arm(id, firstCheckMs);
      return id;
    },

    /** 立刻复查一条（测试与排查用）。 */
    checkNow: check,

    /** 还没交付完的记录（设置页/诊断用）。 */
    list: () => store.snapshot().records.map((row) => ({ ...row })),

    /** 某个会话键的待交付记录作废（`/stop`、解绑、换绑时调用）。 */
    async forgetKey({ channelId, botId, key, reason = '用户停止' }) {
      const records = store.snapshot().records;
      const doomed = records.filter((row) => row.channelId === channelId
        && row.botId === botId && row.key === key);
      if (doomed.length === 0) return 0;
      for (const row of doomed) clearTimer(row.id);
      await persist(records.filter((row) => !doomed.includes(row)));
      logger.info?.(`[dsh-chat] 作废 ${doomed.length} 条待交付记录（${reason}）：${channelId}/${botId} ${key}`);
      return doomed.length;
    },

    /** 停止所有定时器（进程收摊/测试用）；记录保留在磁盘上。 */
    stop() {
      stopped = true;
      for (const id of [...timers.keys()]) clearTimer(id);
    },
  };
}
