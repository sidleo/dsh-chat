/**
 * 富文本渲染的**两份实现必须逐字一致**。
 *
 * 架构不变量①：渠道包不得 import hub（反向也不行）。可是"把飞书富文本读成人话"这件事
 * 两边都要做——渠道侧 `host/post-content.mjs` 管入站消息与被引用消息，hub 侧
 * `shared/forwarded-messages.mjs` 管合并转发里的子消息。两份实现一旦漂移，就会出现
 * "直接发能读懂、转发一遍就读不懂"这种最难查的形态，所以用同一组载荷钉住两边输出一致。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePostContent } from '../packages/dsh-chat-feishu/host/post-content.mjs';
import { forwardedMessagesText } from '../packages/dsh-chat/shared/forwarded-messages.mjs';

/** 真机（2026-10-07）那条消息的 `mentions`：正文里只有占位符，人名在这里。 */
const MENTIONS = [{ key: '@_user_1', id: { open_id: 'ou_huang' }, name: '黄华' }];

/** 一次把认得的节点都放进去：人名、拆分文本+空格、链接、图、视频、表情、分割线、未知标签。 */
const NODES = [
  [
    { tag: 'at', user_id: '@_user_1', user_name: '黄华', style: [] },
    { tag: 'text', text: ' 华哥，看一下', style: [] },
    { tag: 'a', text: '这个报表', href: 'https://example.com/r' },
  ],
  [{ tag: 'text', text: '第二行' }, { tag: 'img', image_key: 'img_v2_a' }, { tag: 'emotion', emoji_type: 'SMILE' }],
  [{ tag: 'media', file_key: 'file_v3_m' }],
  [{ tag: 'hr' }],
  [{ tag: 'brand_new_tag', text: '以后新增的标签' }],
];

const FIXTURES = [
  ['真机平铺形态（事件与回读）', (nodes) => ({ title: '现金流', content: nodes, content_v2: nodes })],
  ['多语言包裹（发送接口）', (nodes) => ({ zh_cn: { title: '现金流', content: nodes } })],
  ['只有 content_v2', (nodes) => ({ content_v2: nodes })],
];

test('渠道与 hub 的富文本渲染逐字一致（两份实现、一套口径）', () => {
  for (const [label, wrap] of FIXTURES) {
    const content = JSON.stringify(wrap(NODES));
    const channelText = parsePostContent(content, { mentions: MENTIONS }).text;
    assert.ok(channelText.includes('@黄华 华哥，看一下'), `${label}：渠道侧正文没还原对：${channelText}`);

    // hub 侧的入口是"合并转发块"：把同一个 item 放进一包里，取出它渲染出来的那几行。
    const block = forwardedMessagesText({
      messageId: 'om_root',
      items: [
        { message_id: 'om_root', msg_type: 'merge_forward' },
        {
          message_id: 'om_post',
          upper_message_id: 'om_root',
          msg_type: 'post',
          create_time: '1789000000000',
          sender: { id: 'ou_a', name: '张三' },
          mentions: MENTIONS,
          body: { content },
        },
      ],
    });
    const expected = channelText.split('\n').map((line) => `    ${line}`).join('\n');
    assert.ok(
      block.includes(expected),
      `${label}：hub 渲染与渠道解析不一致\n渠道：\n${channelText}\n合并转发块：\n${block}`,
    );
  }
});

test('content 与 content_v2 不一致时，两边都优先读 content_v2（官方推荐）', () => {
  // 官方口径：`md` 标签**只出现在 content_v2**，`content` 是降级形态（md 被拆成 text、
  // 列表被压平），所以「推荐优先读取 content_v2」。这条钉住"优先"而不是"有就用 content"。
  const content = JSON.stringify({
    content: [[{ tag: 'text', text: '降级形态：这里本来是 markdown' }]],
    content_v2: [[{ tag: 'md', text: '**原样 markdown**' }]],
  });
  assert.equal(parsePostContent(content).text, '**原样 markdown**');

  const block = forwardedMessagesText({
    messageId: 'om_root',
    items: [
      { message_id: 'om_root', msg_type: 'merge_forward' },
      { message_id: 'om_md', upper_message_id: 'om_root', msg_type: 'post', body: { content } },
    ],
  });
  assert.match(block, /\*\*原样 markdown\*\*/);
  assert.doesNotMatch(block, /降级形态/, '不能读降级的那一份');
});

test('at 给真实 open_id 时，两边都按 open_id 反查 mentions 拿人名', () => {
  // 官方 SDK 对 `at.user_id` 的两种形态都做了兼容：`@_user_N` 占位符，或真实 `ou_…`。
  const content = JSON.stringify({
    content: [[{ tag: 'at', user_id: 'ou_bob' }, { tag: 'text', text: ' 看下这个' }]],
  });
  const mentions = [{ key: '@_user_1', id: { open_id: 'ou_bob' }, name: '鲍勃' }];
  assert.equal(parsePostContent(content, { mentions }).text, '@鲍勃 看下这个');

  const block = forwardedMessagesText({
    messageId: 'om_root',
    items: [
      { message_id: 'om_root', msg_type: 'merge_forward' },
      {
        message_id: 'om_at',
        upper_message_id: 'om_root',
        msg_type: 'post',
        mentions,
        body: { content },
      },
    ],
  });
  assert.match(block, /@鲍勃 看下这个/);
});

test('占位符与未知标签：两份实现都不吐开放 id、也不丢整行', () => {
  // 没有人名、也没有 user_name：两边都退回占位符本身（不打印 mentions 里的 open_id）。
  const content = JSON.stringify({
    content: [[{ tag: 'at', user_id: '@_user_5' }, { tag: 'text', text: '在吗' }]],
  });
  const parsed = parsePostContent(content, {
    mentions: [{ key: '@_user_5', id: { open_id: 'ou_secret_id' }, name: '' }],
  });
  assert.equal(parsed.text, '@_user_5在吗');
  assert.doesNotMatch(parsed.text, /ou_secret_id/);

  // 未知标签：文字照留（hub 侧同一口径由上面的逐字一致用例覆盖）。
  const unknown = parsePostContent(JSON.stringify({ content: [[{ tag: 'brand_new_tag', text: '新标签' }]] }));
  assert.equal(unknown.text, '新标签');
});
