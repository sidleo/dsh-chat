/**
 * 卡片回调归一化：我们注册在裸 EventDispatcher 上，拿到的是**原始**回调体
 * （snake_case + context 包裹），而不是 SDK 高层封装里的 camelCase 版本。
 * 真机上就是因为按后者读字段，回调到了却被静默丢掉。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { createLarkGateway, normalizeCardAction } from '../packages/dsh-chat-feishu/host/lark-gateway.mjs';

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

const RAW_BUTTON = {
  operator: { open_id: 'ou_owner', user_id: 'u_1', name: '赵六' },
  action: { tag: 'button', value: { dsh: 'answer', label: '继续测试（推荐）', index: '1' } },
  context: { open_chat_id: 'oc_chat', open_message_id: 'om_card_1' },
};

test('归一化：原始 snake_case 回调体能取到会话/操作者/按钮值', () => {
  const event = normalizeCardAction(RAW_BUTTON);
  assert.equal(event.chatId, 'oc_chat');
  assert.equal(event.messageId, 'om_card_1');
  assert.equal(event.operator.openId, 'ou_owner');
  assert.equal(event.action.tag, 'button');
  assert.deepEqual(event.action.value, { dsh: 'answer', label: '继续测试（推荐）', index: '1' });
});

test('归一化：SDK 已归一化的 camelCase 形状同样接受（两种 SDK 用法都不翻车）', () => {
  const event = normalizeCardAction({
    chatId: 'oc_chat', messageId: 'om_card_1',
    operator: { openId: 'ou_owner' },
    action: { tag: 'button', value: { dsh: 'approval', decision: 'rejected' } },
  });
  assert.equal(event.chatId, 'oc_chat');
  assert.equal(event.operator.openId, 'ou_owner');
  assert.equal(event.action.value.dsh, 'approval');
});

test('归一化：缺会话或缺操作者时返回 null（由调用方记日志，不静默）', () => {
  assert.equal(normalizeCardAction(null), null);
  assert.equal(normalizeCardAction('nope'), null);
  assert.equal(normalizeCardAction({ operator: { open_id: 'ou_a' } }), null);
  assert.equal(normalizeCardAction({ context: { open_chat_id: 'oc_a' } }), null);
  // 消息 id 缺席不算致命：仍可用于按会话认领
  const partial = normalizeCardAction({
    operator: { open_id: 'ou_a' }, context: { open_chat_id: 'oc_a' }, action: { value: {} },
  });
  assert.equal(partial.chatId, 'oc_a');
  assert.equal(partial.messageId, undefined);
  assert.deepEqual(partial.action.value, {});
});

test('卡片控件：单选给按钮、多选给复选框+提交、自由文本给输入框+提交，且只显示当前一题', async () => {
  const calls = [];
  const sdk = {
    Client: function Client() {
      return {
        im: {
          v1: {
            message: {
              create: async (payload) => {
                calls.push(payload);
                return { code: 0, msg: 'success', data: { message_id: 'om_1' } };
              },
              patch: async (payload) => {
                calls.push(payload);
                return { code: 0, msg: 'success', data: { message_id: 'om_1' } };
              },
            },
          },
        },
      };
    },
    WSClient: function WSClient() {},
    Domain: { Lark: 'lark' },
    LoggerLevel: { info: 3 },
  };
  const gateway = createLarkGateway({ appId: 'cli_x', appSecret: 's', sdk, logger: silentLogger });

  const questions = [
    { id: 'single', header: '单选', question: '选一个', options: [{ label: 'A' }, { label: 'B' }] },
    { id: 'multi', header: '多选', question: '选多个', multiSelect: true, options: [{ label: 'X' }, { label: 'Y' }] },
    { id: 'free', header: '补充', question: '还有别的吗？' },
  ];

  // 第一页：单选题 → 按钮，且卡里**不出现**后面两题
  await gateway.sendQuestionsCard({ openId: 'ou_a', questions, answered: {}, final: false });
  let card = JSON.parse(calls.at(-1).data.content);
  assert.match(card.header.title.content, /第 1\/3 题/);
  const first = JSON.stringify(card);
  assert.match(first, /"tag":"action"/);
  assert.match(first, /"label":"A"/);
  assert.doesNotMatch(first, /选多个/, '后面的问题不该一次全抛出来');
  assert.doesNotMatch(first, /还有别的吗/);

  // 第二页：多选 → 复选框 + 提交按钮（value 用选项原文）
  await gateway.sendQuestionsCard({
    openId: 'ou_a', questions,
    answered: { single: { selected: ['A'] } }, final: false, messageId: 'om_1',
  });
  assert.equal(calls.at(-1).path.message_id, 'om_1', '要 patch 同一张卡');
  card = JSON.parse(calls.at(-1).data.content);
  assert.match(card.header.title.content, /第 2\/3 题/);
  const second = JSON.stringify(card);
  assert.match(second, /"tag":"checker"/);
  assert.match(second, /"action_type":"form_submit"/);
  assert.match(second, /"value":"X"/);
  assert.match(second, /✅ \*\*1\. 单选\*\* → A/, '已答的题在卡里留一行答案');
  assert.doesNotMatch(second, /还有别的吗/);

  // 第三页：自由文本 → 输入框 + 提交
  await gateway.sendQuestionsCard({
    openId: 'ou_a', questions,
    answered: { single: { selected: ['A'] }, multi: { selected: ['X', 'Y'] } }, final: false,
  });
  const third = JSON.stringify(JSON.parse(calls.at(-1).data.content));
  assert.match(third, /"tag":"input"/);
  assert.match(third, /"action_type":"form_submit"/);

  // 收尾：绿色 + 全部答案
  await gateway.sendQuestionsCard({
    openId: 'ou_a', questions,
    answered: {
      single: { selected: ['A'] }, multi: { selected: ['X'] }, free: { custom: '随便聊聊' },
    },
    final: true,
  });
  card = JSON.parse(calls.at(-1).data.content);
  assert.equal(card.header.template, 'green');
  assert.match(card.header.title.content, /已全部回答/);
  assert.match(JSON.stringify(card), /随便聊聊/);
});
