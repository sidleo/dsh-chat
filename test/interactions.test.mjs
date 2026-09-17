/**
 * 人在环交互回传的单元测试。
 *
 * 这里守的是这次真机事故的根因：agent 提问后，问题**只**出现在浏览器 UI 里，
 * IM 那侧什么都没收到，用户只能干等。所以重点验证：
 * 问题确实发到了 IM、IM 的回复被认领为答案、超时/取消会交回其他应答方（不卡死）。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createInteractionService, parseAnswer, parseApproval, renderApproval, renderQuestion,
} from '../packages/dsh-chat/host/interactions.mjs';

const silentLogger = { info() {}, warn() {}, error() {} };

const QUESTION = {
  id: 'intent',
  header: '确认意图',
  question: '这张 Dock 截图你想让我做什么？',
  multiSelect: true,
  options: [
    { label: '识别里面有哪些 App', description: '逐图标给出识别结果' },
    { label: '排查某个 App 异常', description: '需要说明现象' },
  ],
};

test('渲染问题：带标题、选项编号与多选提示', () => {
  const text = renderQuestion(QUESTION, { position: 1, total: 2 });
  assert.match(text, /❓ 确认意图（1\/2）/);
  assert.match(text, /这张 Dock 截图你想让我做什么？/);
  assert.match(text, /1\. 识别里面有哪些 App —— 逐图标给出识别结果/);
  assert.match(text, /2\. 排查某个 App 异常/);
  assert.match(text, /回复多个编号/);

  const single = renderQuestion({ id: 'q', question: '哪个环境？', options: [{ label: '生产' }] });
  assert.match(single, /❓ 需要你确认/);
  assert.match(single, /回复编号或选项原文即可/);
  assert.doesNotMatch(single, /多选/);

  const free = renderQuestion({ id: 'q', question: '库里叫什么名字？' });
  assert.match(free, /直接回复你的答案/);
});

test('解析回答：编号、选项原文、多选、自由文本', () => {
  assert.deepEqual(parseAnswer(QUESTION, '1'), { id: 'intent', selected: ['识别里面有哪些 App'] });
  assert.deepEqual(parseAnswer(QUESTION, '排查某个 App 异常'),
    { id: 'intent', selected: ['排查某个 App 异常'] });
  assert.deepEqual(parseAnswer(QUESTION, '1,2'),
    { id: 'intent', selected: ['识别里面有哪些 App', '排查某个 App 异常'] });
  assert.deepEqual(parseAnswer(QUESTION, '都不对，我想换壁纸'),
    { id: 'intent', selected: [], custom: '都不对，我想换壁纸' });
  // 单选问题里带自定义文本时，两者并存
  const single = { ...QUESTION, multiSelect: false };
  assert.deepEqual(parseAnswer(single, '1'), { id: 'intent', selected: ['识别里面有哪些 App'] });
  assert.deepEqual(parseAnswer(single, '看下第 3 个图标'), { id: 'intent', selected: [], custom: '看下第 3 个图标' });
  // 超范围编号按自由文本处理，而不是当成选项
  assert.deepEqual(parseAnswer(QUESTION, '9'), { id: 'intent', selected: [], custom: '9' });
});

test('解析审批：允许/拒绝中英文都认，认不出来时返回 null（由调用方 fail closed）', () => {
  for (const yes of ['允许', '好的', '可以', 'OK', 'yes', 'Approve']) {
    assert.equal(parseApproval(yes), 'allowed-once', yes);
  }
  for (const no of ['拒绝', '不行', '取消', 'no', 'n', 'reject']) {
    assert.equal(parseApproval(no), 'rejected', no);
  }
  assert.equal(parseApproval('你看着办'), null);
  assert.match(renderApproval({ toolName: 'bash', reason: '要执行 rm -rf' }), /工具：bash/);
  assert.match(renderApproval({ toolName: 'bash', reason: '要执行 rm -rf' }), /原因：要执行 rm -rf/);
});

test('提问回传：问题发到 IM、IM 回复被认领为答案、认领后的文本不再进模型', async () => {
  const service = createInteractionService({ logger: silentLogger, timeoutMs: 1_000 });
  const sent = [];
  service.attach({
    channelId: 'feishu',
    botId: 'bot_1',
    send: async ({ key, text }) => sent.push({ key, text }),
  });

  const pending = service.handle({
    kind: 'question',
    channelId: 'feishu',
    botId: 'bot_1',
    key: 'p2p:ou_a',
    request: { questions: [QUESTION] },
  });

  // 等到问题真的发出去，再模拟用户回复
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].key, 'p2p:ou_a');
  assert.match(sent[0].text, /识别里面有哪些 App/);

  // 别的会话/别的机器人不能替它回答
  assert.equal(service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_b', text: '1' }), false);
  assert.equal(service.offer({ channelId: 'feishu', botId: 'bot_2', key: 'p2p:ou_a', text: '1' }), false);
  assert.equal(service.offer({ channelId: 'weixin', botId: 'bot_1', key: 'p2p:ou_a', text: '1' }), false);
  assert.equal(service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', text: '2' }), true);

  assert.deepEqual(await pending, { answers: [{ id: 'intent', selected: ['排查某个 App 异常'] }] });
  // 已经认领过，同一条不会再被吃第二次
  assert.equal(service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', text: '1' }), false);
});

test('多个问题按顺序逐个问，答案按 id 收齐', async () => {
  const service = createInteractionService({ logger: silentLogger, timeoutMs: 1_000 });
  const sent = [];
  service.attach({ channelId: 'feishu', botId: 'bot_1', send: async (m) => sent.push(m.text) });

  const pending = service.handle({
    kind: 'question',
    channelId: 'feishu',
    botId: 'bot_1',
    key: 'group:oc_1',
    request: {
      questions: [
        { id: 'a', question: '选哪个环境？', options: [{ label: '生产' }, { label: '测试' }] },
        { id: 'b', question: '库名是什么？' },
      ],
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.length, 1, '先问第一个');
  service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'group:oc_1', text: '生产' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.length, 2, '第一个答完再问第二个');
  service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'group:oc_1', text: 'yh_dm' });

  assert.deepEqual(await pending, {
    answers: [
      { id: 'a', selected: ['生产'] },
      { id: 'b', selected: [], custom: 'yh_dm' },
    ],
  });
});

test('没人回答就超时交回其他应答方（返回 null，不把这一轮卡死）', async () => {
  const service = createInteractionService({ logger: silentLogger, timeoutMs: 20 });
  const warnings = [];
  service.attach({ channelId: 'feishu', botId: 'bot_1', send: async () => {} });

  const result = await service.handle({
    kind: 'question',
    channelId: 'feishu',
    botId: 'bot_1',
    key: 'p2p:ou_a',
    request: { questions: [{ id: 'q', question: '在吗？' }] },
  });
  assert.equal(result, null);
  void warnings;

  // AbortSignal 取消同样交回，并且立刻返回
  const controller = new AbortController();
  const aborted = service.handle({
    kind: 'question',
    channelId: 'feishu',
    botId: 'bot_1',
    key: 'p2p:ou_a',
    request: { questions: [{ id: 'q', question: '在吗？' }], signal: controller.signal },
  });
  controller.abort();
  assert.equal(await aborted, null, '取消后不再等待');
});

test('没接入 IM 回传的渠道一律不认领（让浏览器 UI 处理）', async () => {
  const service = createInteractionService({ logger: silentLogger });
  assert.equal(service.has('feishu'), false);
  assert.equal(await service.handle({
    kind: 'question', channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
    request: { questions: [QUESTION] },
  }), null);
  assert.equal(service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', text: '1' }), false);

  // 挂上之后立刻生效，摘掉之后恢复"不认领"
  const detach = service.attach({ channelId: 'feishu', botId: 'bot_1', send: async () => {} });
  assert.equal(service.has('feishu'), true);
  detach();
  assert.equal(service.has('feishu'), false);
});

test('审批回传：问出去、按回复给结论、认不出的回复按拒绝处理', async () => {
  const service = createInteractionService({ logger: silentLogger, timeoutMs: 1_000 });
  const sent = [];
  service.attach({ channelId: 'feishu', botId: 'bot_1', send: async (m) => sent.push(m.text) });

  const allowed = service.handle({
    kind: 'approval', channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
    request: { toolName: 'bash', reason: '删除临时目录' },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(sent[0], /需要授权/);
  assert.match(sent[0], /工具：bash/);
  service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', text: '允许' });
  assert.equal(await allowed, 'allowed-once');

  const rejected = service.handle({
    kind: 'approval', channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
    request: { toolName: 'bash' },
  });
  await new Promise((resolve) => setImmediate(resolve));
  service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', text: '随你吧' });
  assert.equal(await rejected, 'rejected', '认不出来的审批回复要 fail closed');
});
