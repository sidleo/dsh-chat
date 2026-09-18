/**
 * 诊断面板读日志尾部：只读"刚刚发生了什么"，且读不到时不能让诊断整体失败。
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { readLogTail } from '../packages/dsh-chat/host/log-tail.mjs';

test('日志尾部：从尾部按字节截断，半截的首行丢掉', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-chat-tail-'));
  try {
    const path = join(dir, 'feishu.log');
    await writeFile(path, Array.from({ length: 50 }, (_, i) => `第 ${i} 行`).join('\n'), 'utf8');
    const tail = await readLogTail(path, { maxBytes: 60, maxLines: 5 });

    assert.equal(tail.exists, true);
    assert.equal(tail.lines.length, 5);
    assert.equal(tail.lines.at(-1), '第 49 行');
    // 半截行（"第 4? 行"里的后半段）不能出现。
    assert.ok(tail.lines.every((line) => /^第 \d+ 行$/u.test(line)), `截断残片漏了：${tail.lines.join(' | ')}`);
    assert.ok(tail.size > 0 && tail.modifiedAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('日志尾部：文件不存在、是目录、超大行数上限都返回结果而不是抛错', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-chat-tail-'));
  try {
    const missing = await readLogTail(join(dir, 'nope.log'));
    assert.deepEqual(missing, {
      path: join(dir, 'nope.log'), exists: false, size: 0, modifiedAt: null, lines: [],
    });

    const asDir = await readLogTail(dir);
    assert.equal(asDir.exists, false, '目录不算日志文件');

    const path = join(dir, 'hub.log');
    await writeFile(path, 'a\nb\nc\n', 'utf8');
    const capped = await readLogTail(path, { maxLines: 2 });
    assert.deepEqual(capped.lines, ['b', 'c']);
    assert.equal(capped.size, 6, '大小仍要给出（面板要显示文件多大）');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
