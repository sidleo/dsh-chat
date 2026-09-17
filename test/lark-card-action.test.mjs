/**
 * 卡片回调归一化：我们注册在裸 EventDispatcher 上，拿到的是**原始**回调体
 * （snake_case + context 包裹），而不是 SDK 高层封装里的 camelCase 版本。
 * 真机上就是因为按后者读字段，回调到了却被静默丢掉。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCardAction } from '../packages/dsh-chat-feishu/host/lark-gateway.mjs';

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
