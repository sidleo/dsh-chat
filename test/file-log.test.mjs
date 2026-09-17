/**
 * 渠道日志落盘：出故障时要有可检索的现场，且日志本身永远不能变成新的故障源。
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { channelLogPath, createLogFileSink, withFileSink } from '../packages/dsh-chat/host/file-log.mjs';

test('日志落盘：目录不存在会自建，内容带级别与作用域', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-chat-log-'));
  try {
    const path = channelLogPath(join(base, 'nested', 'logs'), 'feishu');
    const sink = createLogFileSink({ path });
    const logger = withFileSink({
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      sink,
      scope: 'dsh-chat-feishu',
    });
    logger.warn('[dsh-chat-feishu] 更新过程卡失败：卡片被删了');
    await sink.flush();

    const text = await readFile(path, 'utf8');
    assert.match(text, /WARN\s+\[dsh-chat-feishu\] 更新过程卡失败：卡片被删了/);
    assert.match(text, /^\d{4}-\d{2}-\d{2}T/, '每行都要有时间戳');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('日志轮转：超过上限换一份，旧内容不丢在 .1 里', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-chat-log-'));
  try {
    const path = join(base, 'weixin.log');
    await writeFile(path, 'x'.repeat(120), 'utf8');
    const sink = createLogFileSink({ path, maxBytes: 128 });
    sink.write('第一次写入会触发轮转');
    await sink.flush();

    assert.equal(existsSync(`${path}.1`), true, '旧文件应被留下');
    assert.equal((await readFile(`${path}.1`, 'utf8')).length, 120);
    assert.match(await readFile(path, 'utf8'), /第一次写入会触发轮转/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('写日志失败绝不影响渠道：不抛错、原 logger 照常被调用', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-chat-log-'));
  try {
    // 用一个"目录"当文件路径，appendFile 必然失败
    const path = join(base, 'as-directory');
    await writeFile(join(base, 'x'), '', 'utf8');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path, { recursive: true });

    const seen = [];
    const logger = withFileSink({
      logger: { info: (m) => seen.push(m), warn: () => {}, error: () => {}, debug: () => {} },
      sink: createLogFileSink({ path }),
      scope: 'dsh-chat-x',
    });
    logger.info('渠道仍然要继续工作');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(seen, ['渠道仍然要继续工作'], '原 logger 必须照常收到');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('logger 缺级别时补空实现，调用方不会因 undefined 崩', async () => {
  const base = await mkdtemp(join(tmpdir(), 'dsh-chat-log-'));
  try {
    const sink = createLogFileSink({ path: join(base, 'partial.log') });
    const logger = withFileSink({ logger: { info() {} }, sink, scope: 'x' });
    logger.warn('没有 warn 实现也要能写文件');
    logger.debug('debug 同理');
    await sink.flush();
    const text = await readFile(join(base, 'partial.log'), 'utf8');
    assert.match(text, /没有 warn 实现也要能写文件/);
    assert.match(text, /debug 同理/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
