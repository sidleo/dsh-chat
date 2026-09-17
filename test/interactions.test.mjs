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

test('一批问题只用一张卡片：发一次、答一个就地更新一次、最后收尾更新', async () => {
  const service = createInteractionService({ logger: silentLogger, timeoutMs: 1_000 });
  const renders = [];
  service.attach({
    channelId: 'feishu',
    botId: 'bot_1',
    send: async (m) => renders.push({ text: m.text }),
    sendQuestions: async ({ questions, answered, final }) => {
      renders.push({ ids: questions.map((q) => q.id), answered: Object.keys(answered), final });
    },
  });

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
  assert.equal(renders.length, 1, '整批只发一次');
  assert.deepEqual(renders[0].ids, ['a', 'b']);
  assert.deepEqual(renders[0].answered, []);

  // 按钮点击带 questionId：可以先答第二个
  service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'group:oc_1', text: 'yh_dm', questionId: 'b' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(renders.length, 2, '答一个就更新一次同一张卡');
  assert.deepEqual(renders[1].answered, ['b']);

  service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'group:oc_1', text: '生产' });
  assert.deepEqual(await pending, {
    answers: [
      { id: 'a', selected: ['生产'] },
      { id: 'b', selected: [], custom: 'yh_dm' },
    ],
  });
  const last = renders.at(-1);
  assert.equal(last.final, true, '收尾要把卡片更新成最终态');
  assert.deepEqual(last.answered.sort(), ['a', 'b']);
});

test('一批问题都塞进同一张卡片：多选不再另发文本，也认不出归属的回复会被忽略', async () => {
  const service = createInteractionService({ logger: silentLogger, timeoutMs: 1_000 });
  const cards = [];
  const texts = [];
  service.attach({
    channelId: 'feishu',
    botId: 'bot_1',
    send: async ({ text }) => texts.push(text),
    sendQuestions: async ({ answered, final }) => cards.push({ answered: Object.keys(answered), final }),
  });

  const pending = service.handle({
    kind: 'question', channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
    request: {
      questions: [
        { id: 'single', question: '选一个', options: [{ label: 'A' }, { label: 'B' }] },
        { id: 'multi', question: '多选', multiSelect: true, options: [{ label: 'X' }, { label: 'Y' }] },
        { id: 'free', question: '库名？' },
      ],
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cards.length, 1, '三个问题一张卡');
  assert.deepEqual(texts, [], '多选与自由文本也留在卡片里，不再另发消息');

  // 归属不上（已答过 / 未知 id）的回复被忽略，不会误答到别的题
  service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', text: 'A', questionId: 'nope' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cards.length, 1, '忽略后不重新渲染');

  service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', text: 'A' });
  await new Promise((resolve) => setImmediate(resolve));
  service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', text: '1,2' });
  await new Promise((resolve) => setImmediate(resolve));
  service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', text: 'yh_dm' });

  assert.deepEqual(await pending, {
    answers: [
      { id: 'single', selected: ['A'] },
      { id: 'multi', selected: ['X', 'Y'] },
      { id: 'free', selected: [], custom: 'yh_dm' },
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

test('渠道不支持卡片时整批退回文本；支持时一张卡搞定', async () => {
  const service = createInteractionService({ logger: silentLogger, timeoutMs: 1_000 });
  const texts = [];
  service.attach({
    channelId: 'weixin',
    botId: 'bot_1',
    send: async ({ text }) => texts.push(text),
  });

  // 微信没有卡片能力：每个问题一条文本（含编号与多选提示）
  const pending = service.handle({
    kind: 'question', channelId: 'weixin', botId: 'bot_1', key: 'p2p:ou_a',
    request: {
      questions: [
        { id: 'single', question: '选一个', options: [{ label: 'A' }, { label: 'B' }] },
        { id: 'multi', question: '多选', multiSelect: true, options: [{ label: 'X' }, { label: 'Y' }] },
      ],
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(texts.length, 2, '不支持卡片的渠道按题发文');
  assert.match(texts[0], /1\. A/);
  assert.match(texts[1], /回复多个编号/);

  service.offer({ channelId: 'weixin', botId: 'bot_1', key: 'p2p:ou_a', text: 'A' });
  await new Promise((resolve) => setImmediate(resolve));
  service.offer({ channelId: 'weixin', botId: 'bot_1', key: 'p2p:ou_a', text: '1,2' });
  assert.deepEqual((await pending).answers, [
    { id: 'single', selected: ['A'] },
    { id: 'multi', selected: ['X', 'Y'] },
  ]);
});

test('审批也能用原生交互（卡片按钮），认领路径与文本一致', async () => {
  const service = createInteractionService({ logger: silentLogger, timeoutMs: 1_000 });
  const cards = [];
  service.attach({
    channelId: 'feishu', botId: 'bot_1',
    send: async () => {},
    sendApproval: async ({ request }) => cards.push(request.toolName),
  });
  const pending = service.handle({
    kind: 'approval', channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a',
    request: { toolName: 'bash' },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(cards, ['bash']);
  service.offer({ channelId: 'feishu', botId: 'bot_1', key: 'p2p:ou_a', text: '允许' });
  assert.equal(await pending, 'allowed-once');
});
