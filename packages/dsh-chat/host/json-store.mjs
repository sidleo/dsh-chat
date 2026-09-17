/**
 * 通用 JSON 文档存储：原子写 + 首次覆盖备份 + 串行写入队列 + 变更订阅。
 *
 * hub 的每个持久化文档（每机器人设置、会话绑定）都复用它，避免把同一套
 * 写盘纪律实现多遍。
 *
 * @module dsh-chat/host/json-store
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * 创建 JSON 文档存储。
 *
 * @param options - {
 *   path,                // 文件绝对路径
 *   normalize(raw),      // 把任意磁盘内容折成合法文档（必须容错）
 *   empty(),             // 文件不存在时的初始文档
 *   logger,
 *   label,               // 日志前缀，如 '每机器人设置'
 * }。
 * @returns { path, ready, snapshot, read, update, subscribe }。
 */
export function createJsonStore({
  path,
  normalize,
  empty,
  logger = console,
  label = 'JSON 文档',
}) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('json store 需要 path。');
  if (typeof normalize !== 'function') throw new TypeError('json store 需要 normalize。');
  if (typeof empty !== 'function') throw new TypeError('json store 需要 empty。');

  let document = normalize(empty());
  let loaded = false;
  let loading = null;
  let queue = Promise.resolve();
  let backedUp = false;
  const listeners = new Set();

  function notify() {
    for (const listener of [...listeners]) {
      try {
        listener(document);
      } catch {
        // 单个订阅者出错不影响其他订阅者。
      }
    }
  }

  async function persist() {
    const body = `${JSON.stringify(document, null, 2)}\n`;
    await mkdir(dirname(path), { recursive: true });
    if (!backedUp) {
      try {
        const previous = await readFile(path, 'utf8');
        if (previous.trim()) {
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          await writeFile(`${path}.bak-${stamp}`, previous, 'utf8');
          // 只有真的备份成功才算数：首次写入（还没有旧文件）留给下一次真正覆盖时备份。
          backedUp = true;
        }
      } catch {
        // 没有旧文件（或读不到）就没有可备份的内容。
      }
    }
    const temporary = `${path}.tmp-${randomBytes(6).toString('hex')}`;
    await writeFile(temporary, body, 'utf8');
    await rename(temporary, path);
  }

  function enqueue(task) {
    const next = queue.then(task, task);
    queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async function load() {
    if (loaded) return document;
    try {
      document = normalize(JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        logger.warn?.(`[dsh-chat] 读取 ${path} 失败，使用空${label}：${error?.message ?? error}`);
      }
      document = normalize(empty());
    }
    loaded = true;
    return document;
  }

  return {
    path,

    /** 等磁盘文档就绪（并发多次调用只读一次盘）。 */
    async ready() {
      if (loaded) return document;
      loading = loading ?? load();
      return loading;
    },

    /** @returns 当前文档。 */
    snapshot() {
      return document;
    },

    /**
     * 串行地读-改-写。
     *
     * @param updater - `(current) => next | null`；返回 null 表示不写盘。
     * @returns 写入后的文档。
     */
    async update(updater) {
      return enqueue(async () => {
        await this.ready();
        const next = updater(document);
        if (next === null || next === undefined) return document;
        document = normalize(next);
        await persist();
        notify();
        return document;
      });
    },

    /** 等待已排队的写入落定（停机前调用，避免和进程退出抢时间）。 */
    async flush() {
      await queue;
    },

    /**
     * 订阅文档变更（写入成功后触发）。
     *
     * @param listener - `(document) => void`。
     * @returns 取消订阅函数。
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
