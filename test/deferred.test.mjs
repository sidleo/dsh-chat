/**
 * 延迟交付：`ask()` 超时放手之后，有界地继续盯这一轮的终态，拿到结果就补发。
 *
 * 这里全部用假 probe / 假 deliver 驱动打点（毫秒级窗口），
 * 覆盖"补发 / 会话没了 / 换绑了 / 没发送器 / 发失败 / 盯满时限 / 重启续盯 / 同键上限 / 作废"。
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createDeferredDelivery } from '../packages/dsh-chat/host/deferred.mjs';

const logger = { info() {}, warn() {}, error() {} };

/** 快窗口：首查 10ms、之后每 10ms、最多盯 400ms。 */
const FAST = { firstCheckMs: 10, intervalMs: 10, maxAgeMs: 400 };

async function makeApp({ probe, options = {} } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-deferred-'));
  const delivered = [];
  const service = createDeferredDelivery({
    dataDir,
    logger,
    probe,
    ...FAST,
    ...options,
  });
  await service.ready();
  service.register({
    channelId: 'feishu',
    botId: 'bot_1',
    deliver: async ({ key, text }) => { delivered.push({ key, text }); },
  });
  return {
    service,
    delivered,
    dataDir,
    async cleanup() {
      service.stop();
      // 停掉定时器时可能有一次复查正在跑（它还会落一次盘）：等它收尾再删目录，
      // 否则会撞出 "ENOENT: deferred.json.tmp-…"。
      await sleep(30);
      await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
    },
  };
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** 等到条件成立（默认 1 秒），超时即断言失败——避免用固定 sleep 猜时序。 */
async function waitFor(check, { timeoutMs = 1_000, everyMs = 5 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await sleep(everyMs);
  }
  return false;
}

test('超时后那一轮跑完了：复查拿到正文就补发，记录随即清掉', async () => {
  let running = true;
  const app = await makeApp({
    probe: async () => ({ exists: true, running, text: running ? '' : '这是超时之后才跑完的答案' }),
  });
  try {
    await app.service.schedule({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1',
      sessionId: 'session-1', turn: 1, reason: 'timeout',
    });
    assert.equal(app.service.list().length, 1, '登记后应有一条待交付');
    running = false;

    assert.ok(await waitFor(() => app.delivered.length > 0), '跑完了就该补发');
    assert.deepEqual(app.delivered, [{ key: 'p2p:ou_1', text: '这是超时之后才跑完的答案' }]);
    assert.ok(await waitFor(() => app.service.list().length === 0), '补发后记录要清掉');
  } finally {
    await app.cleanup();
  }
});

test('还在跑就一直等，不会提前把半截内容发出去', async () => {
  let running = true;
  const app = await makeApp({
    probe: async () => ({ exists: true, running, text: '半截内容' }),
  });
  try {
    await app.service.schedule({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', sessionId: 'session-1', turn: 1,
    });
    await sleep(60);
    assert.deepEqual(app.delivered, [], 'running 期间一条都不能发');
    assert.equal(app.service.list().length, 1);
    running = false;
    assert.ok(await waitFor(() => app.delivered.length > 0), '停止 running 之后才补发');
  } finally {
    await app.cleanup();
  }
});

test('会话已不存在 / 聊天已换绑：直接作废，不补发', async () => {
  const gone = await makeApp({ probe: async () => ({ exists: false, running: false, text: '早跑了' }) });
  const rebound = await makeApp({ probe: async () => ({ exists: true, running: false, rebound: true, text: '早跑了' }) });
  try {
    for (const app of [gone, rebound]) {
      await app.service.schedule({
        channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', sessionId: 'session-1', turn: 1,
      });
    }
    assert.ok(await waitFor(() => gone.service.list().length === 0 && rebound.service.list().length === 0));
    assert.deepEqual(gone.delivered, [], '会话没了就别发了');
    assert.deepEqual(rebound.delivered, [], '已经换到别的会话，旧答案发过去是错的');
  } finally {
    await gone.cleanup();
    await rebound.cleanup();
  }
});

test('渠道还没注册发送器：记录留着继续等，注册后自动续盯', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-deferred-'));
  const delivered = [];
  const service = createDeferredDelivery({
    dataDir,
    logger,
    probe: async () => ({ exists: true, running: false, text: '答案' }),
    ...FAST,
  });
  await service.ready();
  try {
    // 重启后的典型顺序：先读到磁盘上的记录并把它们盯起来，渠道随后才建桥注册。
    await service.schedule({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', sessionId: 'session-1', turn: 1,
    });
    await sleep(50);
    assert.deepEqual(delivered, []);
    assert.equal(service.list().length, 1, '没有发送器时必须留着');

    service.register({
      channelId: 'feishu',
      botId: 'bot_1',
      deliver: async ({ key, text }) => { delivered.push({ key, text }); },
    });
    assert.ok(await waitFor(() => delivered.length === 1), '注册后要把既有记录重新盯起来');
    assert.ok(await waitFor(() => service.list().length === 0));
  } finally {
    service.stop();
    // 同上：等在途的那次复查收尾再删目录。
    await sleep(30);
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('补发失败：记录保留并写 lastError，下次复查再试', async () => {
  let attempts = 0;
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-deferred-'));
  const service = createDeferredDelivery({
    dataDir,
    logger,
    probe: async () => ({ exists: true, running: false, text: '答案' }),
    ...FAST,
  });
  await service.ready();
  try {
    service.register({
      channelId: 'feishu',
      botId: 'bot_1',
      deliver: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('平台 500');
      },
    });
    await service.schedule({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', sessionId: 'session-1', turn: 1,
    });
    assert.ok(await waitFor(() => service.list()[0]?.lastError === '平台 500'), '失败原因要落盘');
    assert.ok(await waitFor(() => service.list().length === 0), '第二次成功后就清掉');
    assert.ok(attempts >= 2);
  } finally {
    service.stop();
    // 同上：等在途的那次复查收尾再删目录。
    await sleep(30);
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('盯满时限：一直没结果就认了，删记录并留日志', async () => {
  const app = await makeApp({
    probe: async () => ({ exists: true, running: true, text: '' }),
    options: { firstCheckMs: 10, intervalMs: 10, maxAgeMs: 40 },
  });
  try {
    await app.service.schedule({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', sessionId: 'session-1', turn: 1,
    });
    assert.ok(await waitFor(() => app.service.list().length === 0, { timeoutMs: 1_000 }), '超过时限要清掉');
    assert.deepEqual(app.delivered, []);
  } finally {
    await app.cleanup();
  }
});

test('重启续盯：记录在磁盘上，进程重来后按新注册的发送器补发', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-deferred-'));
  const states = { running: true };
  const makeService = (delivered) => createDeferredDelivery({
    dataDir,
    logger,
    probe: async () => ({ exists: true, running: states.running, text: states.running ? '' : '重启后才跑完的答案' }),
    ...FAST,
  });
  try {
    const first = makeService([]);
    await first.ready();
    first.register({ channelId: 'feishu', botId: 'bot_1', deliver: async () => {} });
    await first.schedule({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', sessionId: 'session-1', turn: 1,
    });
    first.stop();

    const raw = JSON.parse(await readFile(join(dataDir, 'deferred.json'), 'utf8'));
    assert.equal(raw.records.length, 1, '记录落盘了');

    const delivered = [];
    const second = makeService(delivered);
    await second.ready();
    states.running = false;
    second.register({
      channelId: 'feishu',
      botId: 'bot_1',
      deliver: async ({ key, text }) => { delivered.push({ key, text }); },
    });
    assert.ok(await waitFor(() => delivered.length === 1), '重启后要接着把结果补发出去');
    assert.equal(delivered[0].text, '重启后才跑完的答案');
    assert.ok(await waitFor(() => second.list().length === 0));
    second.stop();
  } finally {
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});

test('同一个会话键最多留两条；forgetKey 一次作废该键全部记录', async () => {
  const app = await makeApp({ probe: async () => ({ exists: true, running: true, text: '' }) });
  try {
    for (let i = 1; i <= 3; i += 1) {
      await app.service.schedule({
        channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1',
        sessionId: `session-${i}`, turn: i,
      });
    }
    const mine = app.service.list().filter((row) => row.key === 'p2p:ou_1');
    assert.equal(mine.length, 2, '一直超时的 chat 只留最新两条');
    assert.deepEqual(mine.map((row) => row.sessionId), ['session-2', 'session-3'], '丢的是最旧那条');

    await app.service.schedule({
      channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_2', sessionId: 'session-9', turn: 1,
    });
    assert.equal(await app.service.forgetKey({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', reason: '用户 /stop' }), 2);
    assert.deepEqual(app.service.list().map((row) => row.key), ['p2p:ou_2'], '只作废指定会话键');
    assert.equal(await app.service.forgetKey({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1' }), 0);
    // 作废后定时器也要停：再等一会儿不会冒出补发。
    await sleep(60);
    assert.deepEqual(app.delivered, []);
  } finally {
    await app.cleanup();
  }
});

test('残缺的 deferred.json 不能让服务起不来（按保守方向补齐）', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'dsh-chat-deferred-'));
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(dataDir, 'deferred.json'), JSON.stringify({
    version: 1,
    records: [
      null, 'garbage', { id: 'df-1' },
      {
        id: 'df-2', channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_1', sessionId: 'session-1', turn: 'x',
      },
    ],
  }));
  const service = createDeferredDelivery({
    dataDir,
    logger,
    probe: async () => ({ exists: true, running: true, text: '' }),
    ...FAST,
  });
  await service.ready();
  try {
    const rows = service.list();
    assert.equal(rows.length, 1, '只留下字段齐全的那条');
    assert.equal(rows[0].id, 'df-2');
    assert.equal(rows[0].turn, null, 'turn 不合法按 null 归一');
    assert.equal(rows[0].reason, 'timeout');
  } finally {
    service.stop();
    // 同上：等在途的那次复查收尾再删目录。
    await sleep(30);
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
});
