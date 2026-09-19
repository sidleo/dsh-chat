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
  assert.equal(card.schema, '2.0');
  assert.match(card.header.title.content, /第 1\/3 题/);
  const first = JSON.stringify(card);
  assert.match(first, /"behaviors":\[\{"type":"callback"/);
  assert.match(first, /"label":"A"/);
  // 单选页也要有"直接写答案"的输入框（真机反馈：只有按钮时自定义答案没地方写）
  assert.match(first, /"name":"text_single"/);
  assert.match(first, /"width":"fill"/, '输入框要拉满卡片宽度');
  assert.doesNotMatch(first, /选多个/, '后面的问题不该一次全抛出来');
  assert.doesNotMatch(first, /还有别的吗/);

  // 第二页：多选 → Card 2.0 表单 + 原生多选控件（multi_select_static）+ 提交
  await gateway.sendQuestionsCard({
    openId: 'ou_a', questions,
    answered: { single: { selected: ['A'] } }, final: false, messageId: 'om_1',
  });
  assert.equal(calls.at(-1).path.message_id, 'om_1', '要 patch 同一张卡');
  card = JSON.parse(calls.at(-1).data.content);
  assert.equal(card.schema, '2.0', '表单/输入这类组件只在 Card 2.0 生效');
  assert.match(card.header.title.content, /第 2\/3 题/);
  const second = JSON.stringify(card);
  assert.match(second, /"tag":"form"/);
  assert.match(second, /"tag":"checker"/, '多选要平铺成勾选器，不是下拉控件');
  assert.doesNotMatch(second, /multi_select_static/, '不要下拉多选（真机反馈：要能一眼看到所有选项）');
  assert.match(second, /"name":"chk_0_multi"/, '组件名带序号与问题 id');
  assert.match(second, /"name":"chk_1_multi"/);
  assert.match(second, /"content":"X"/, '每个勾选器带自己的选项文案');
  assert.match(second, /"form_action_type":"submit"/);
  assert.match(second, /"tag":"collapsible_panel"/, '已答部分放折叠面板里（收起但不消失）');
  assert.match(second, /"expanded":true/, '还有题要答时面板展开，方便对照');
  assert.match(second, /提问 · 单选 → A/, '已答的题在面板里留一行答案（与工具/思考同一形态）');
  assert.doesNotMatch(second, /还有别的吗/);

  // 第三页：自由文本 → 表单 + 原生输入框 + 提交
  await gateway.sendQuestionsCard({
    openId: 'ou_a', questions,
    answered: { single: { selected: ['A'] }, multi: { selected: ['X', 'Y'] } }, final: false,
  });
  const third = JSON.stringify(JSON.parse(calls.at(-1).data.content));
  assert.match(third, /"tag":"input"/);
  assert.match(third, /"name":"text_free"/);
  assert.match(third, /"form_action_type":"submit"/);
  assert.match(third, /"width":"fill"/);

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
  const done = JSON.stringify(card);
  assert.match(done, /随便聊聊/, '答案仍可回看');
  assert.match(done, /"expanded":false/, '全部答完默认收起');
  assert.match(done, /❓ 3\/3 已回答/, '提问容器标题简化为 N/M 已回答');
});

test('归一化：下拉（select_static）选中的值三种形态都要认', () => {
  // ① 单选下拉：Card 2.0 的 behaviors.callback 回调，选中值在 action.option。
  const single = normalizeCardAction({
    operator: { open_id: 'ou_owner' },
    action: { tag: 'select_static', name: 'model_pick', option: 'deepseek/deepseek-v4', value: { action: 'model_pick' } },
    context: { open_chat_id: 'oc_chat', open_message_id: 'om_card' },
  });
  assert.deepEqual(single.action.options, ['deepseek/deepseek-v4']);
  assert.deepEqual(single.action.value, { action: 'model_pick' });

  // ② 多选：数组或逗号串（官方 Card 2.0 现在给的是逗号串）。
  const multi = normalizeCardAction({
    operator: { open_id: 'ou_owner' },
    action: { tag: 'multi_select_static', name: 'watch_add', options: ['a', 'b'] },
    context: { open_chat_id: 'oc_chat' },
  });
  assert.deepEqual(multi.action.options, ['a', 'b']);
  const comma = normalizeCardAction({
    operator: { open_id: 'ou_owner' },
    action: { tag: 'multi_select_static', name: 'watch_add', options: 'a, b ,a' },
    context: { open_chat_id: 'oc_chat' },
  });
  assert.deepEqual(comma.action.options, ['a', 'b'], '逗号串要去空去重');

  // ③ 有的版本塞进 form_value[组件名]（可能是 { value } 包装）。
  const inForm = normalizeCardAction({
    operator: { open_id: 'ou_owner' },
    action: { tag: 'select_static', name: 'workspace_pick', form_value: { workspace_pick: { value: '/tmp/ws' } } },
    context: { open_chat_id: 'oc_chat' },
  });
  assert.deepEqual(inForm.action.options, ['/tmp/ws']);

  // 没有任何取值时是空数组，而不是 undefined（调用方少一处判空）。
  const none = normalizeCardAction({
    operator: { open_id: 'ou_owner' },
    action: { tag: 'button', value: { dsh: 'answer' } },
    context: { open_chat_id: 'oc_chat' },
  });
  assert.deepEqual(none.action.options, []);
});

test('归一化：带出延迟更新 token（更新交互卡片的唯一凭证）', () => {
  const event = normalizeCardAction({
    operator: { open_id: 'ou_owner' },
    token: 'tk_delayed_update',
    action: { tag: 'button', value: { dsh_panel: 'status' } },
    context: { open_chat_id: 'oc_chat', open_message_id: 'om_card' },
  });
  assert.equal(event.token, 'tk_delayed_update');
  assert.equal(event.messageId, 'om_card');

  // 没带 token 时是 undefined（调用方据此退回 patchCard / 新发一张），而不是空串。
  const withoutToken = normalizeCardAction({
    operator: { open_id: 'ou_owner' },
    action: { tag: 'button', value: {} },
    context: { open_chat_id: 'oc_chat' },
  });
  assert.equal(withoutToken.token, undefined);
});
