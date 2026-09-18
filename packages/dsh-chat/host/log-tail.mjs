/**
 * 读日志文件尾部（诊断面板用）。
 *
 * 为什么按字节从尾部读：日志上限 2MB，而诊断要看的是"刚刚发生了什么"。
 * 整读会把内存和浏览器负载都推高，还得把整个文件传给前端。
 *
 * 约束：**读日志绝不能成为新的故障源**——文件不存在、权限不足、被轮转掉，
 * 都返回 `exists: false` 而不是抛错（诊断面板要能照常显示其它部分）。
 *
 * @module dsh-chat/host/log-tail
 */

import { open, stat } from 'node:fs/promises';

/** 默认只读最后 16KB（约等于几十行），够看现场又不至于把面板撑爆。 */
const DEFAULT_MAX_BYTES = 16 * 1024;
const DEFAULT_MAX_LINES = 40;

/**
 * 读一个日志文件的最后若干行。
 *
 * @param path - 日志文件绝对路径。
 * @param options - { maxBytes, maxLines }。
 * @returns `{ path, exists, size, modifiedAt, lines }`；读不到时 `exists: false`。
 */
export async function readLogTail(path, {
  maxBytes = DEFAULT_MAX_BYTES,
  maxLines = DEFAULT_MAX_LINES,
} = {}) {
  const empty = { path, exists: false, size: 0, modifiedAt: null, lines: [] };
  let info;
  try {
    info = await stat(path);
    if (!info.isFile()) return empty;
  } catch {
    return empty;
  }
  const length = Math.min(maxBytes, info.size);
  const start = Math.max(0, info.size - length);
  let text = '';
  try {
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, start);
      text = buffer.subarray(0, bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return empty;
  }
  const raw = text.split('\n');
  // 从中间截断时第一行是半截的（也可能是多字节字符的残片）：丢掉。
  if (start > 0) raw.shift();
  return {
    path,
    exists: true,
    size: info.size,
    modifiedAt: info.mtime.toISOString(),
    lines: raw.filter((line) => line.trim() !== '').slice(-maxLines),
  };
}
