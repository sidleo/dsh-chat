/**
 * 渠道日志落盘（hub 所有）：把 `[dsh-chat-*]` 这些行同时写进文件。
 *
 * 为什么需要它：出故障时唯一的现场是"用户那台终端"，而终端输出既搜不了、也不会随
 * 会话导出带走——排查时只能靠人肉回忆滚屏。"发了没反应"这类问题，必须有可检索的日志。
 *
 * 约束：
 * - **日志本身绝不能成为故障源**：任何 IO 异常都被吞掉（最多 stderr 提一句）；
 * - 异步追加 + 单文件上限 + 一次轮转（`x.log` → `x.log.1`），不无限增长；
 * - 只负责文件，不改变原有 logger 的行为。
 *
 * @module dsh-chat/host/file-log
 */

import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const LEVELS = ['debug', 'info', 'warn', 'error'];

function stamp() {
  return new Date().toISOString();
}

/**
 * 创建一个按大小轮转的日志文件写入口。
 *
 * @param options - { path, maxBytes }。
 * @returns { write, path }；`write` 永不抛错。
 */
export function createLogFileSink({ path, maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (typeof path !== 'string' || !path) throw new TypeError('日志文件需要 path。');
  let queue = Promise.resolve();
  let size = null;
  let warned = false;

  async function rotateIfNeeded(nextLength) {
    if (size === null) {
      try {
        size = (await stat(path)).size;
      } catch {
        size = 0;
      }
    }
    if (size > 0 && size + nextLength > maxBytes) {
      await rename(path, `${path}.1`).catch(() => {});
      size = 0;
    }
  }

  function write(line) {
    const text = `${line}\n`;
    queue = queue.then(async () => {
      try {
        await mkdir(dirname(path), { recursive: true });
        await rotateIfNeeded(text.length);
        await appendFile(path, text, 'utf8');
        size = (size ?? 0) + text.length;
      } catch (error) {
        if (!warned) {
          warned = true;
          // 只提醒一次，且不改变调用方流程。
          process.stderr.write(`[dsh-chat] 写日志文件失败（${path}）：${error?.message ?? error}\n`);
        }
      }
    });
    return queue;
  }

  return { write, path, flush: () => queue };
}

/**
 * 把一个 logger 包成"原样转发 + 落盘"。
 *
 * @param options - { logger, sink, scope }。
 * @returns 与入参同形的 logger（缺哪个级别就补一个空实现）。
 */
export function withFileSink({ logger, sink, scope = '' }) {
  if (!sink?.write) return logger;
  const wrapped = {};
  for (const level of LEVELS) {
    const inner = typeof logger?.[level] === 'function' ? logger[level].bind(logger) : null;
    wrapped[level] = (message, ...rest) => {
      try {
        inner?.(message, ...rest);
      } finally {
        // 消息里通常已经带 `[dsh-chat-<渠道>]` 前缀，别再加一遍。
        const text = String(message);
        const prefix = scope && !text.startsWith('[') ? `[${scope}] ` : '';
        sink.write(`${stamp()} ${level.toUpperCase().padEnd(5)} ${prefix}${text}`);
      }
    };
  }
  // 自定义 logger 可能还带别的方法，原样保留。
  return Object.assign(Object.create(Object.getPrototypeOf(logger ?? {}) ?? Object.prototype), logger ?? {}, wrapped);
}

/** 日志目录（hub 数据目录下，所有渠道共用一处，方便一起看）。 */
export function channelLogPath(logsDir, name) {
  return join(logsDir, `${name}.log`);
}
