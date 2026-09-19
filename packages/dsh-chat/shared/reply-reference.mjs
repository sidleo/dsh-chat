/**
 * 引用回复（用户在 IM 里**引用一条消息**再提问）：把被引用的内容做成一个"引用块"拼进提示词。
 *
 * 为什么要有它：用户说"这条你怎么看"时，模型只能看到那一句话——被引用的正文根本没进 Prompt，
 * 于是它要么猜、要么答非所问（上游 dsh-im 的 Issue #106 就是这个问题，九个渠道一起踩）。
 *
 * 分工（与来源块同一套）：
 * - **平台概念留渠道**：渠道只把平台字段映射成 `reply`（正文/类型/文件名/发送者/消息 id，
 *   平台没给快照就自己查一次），不做任何拼装；
 * - **拼装留 hub**：形状、限长、标签、安全转义都在这里实现一次，所有渠道复用。
 *
 * 边界（照上游 Issue #106 的最小切片）：
 * - 只做一层，**不递归**展开"引用的消息又引用了另一条"；
 * - 引用正文限长（`MAX_QUOTE_TEXT`）——它是上下文，不是全文转录；
 * - 读不到被引用消息时**不丢当前问题**，只放一个"内容不可用"的结构化标记；
 * - 不因为引用关系新建/切换会话，也不放宽群聊 @ 规则（那是渠道自己的事）。
 *
 * @module dsh-chat/shared/reply-reference
 */

/** 引用块的标签：与 `<dsh_im_source>` 同族，便于在会话历史里一眼认出。 */
export const REPLY_TAG_OPEN = '<dsh_im_reply>';
export const REPLY_TAG_CLOSE = '</dsh_im_reply>';

/** 引用正文的限长：这是上下文，不是转录（上游同一口径）。 */
export const MAX_QUOTE_TEXT = 1000;

/** 非文字消息的可读描述。 */
const KIND_LABELS = Object.freeze({
  image: '图片',
  file: '文件',
  audio: '语音',
  media: '视频',
  sticker: '表情',
  post: '富文本',
  interactive: '卡片',
  system: '系统消息',
  share_chat: '群名片',
  share_user: '个人名片',
  location: '位置',
  todo: '任务',
  calendar: '日程',
});

/** 标签内容里不能再出现标签本身，否则模型会以为块提前结束了。 */
function safeText(value) {
  return String(value ?? '')
    .split(REPLY_TAG_OPEN).join('＜dsh_im_reply＞')
    .split(REPLY_TAG_CLOSE).join('＜/dsh_im_reply＞')
    .trim();
}

function clip(value, max = MAX_QUOTE_TEXT) {
  const text = safeText(value);
  return text.length > max ? `${text.slice(0, max)}…（已截断）` : text;
}

/**
 * 拼一个引用块。
 *
 * @param reply - `{ text?, kind?, fileName?, senderId?, messageId?, reason? }`；
 *   `reason` 有值表示**读不到**被引用消息（删除/无权限/超时），此时只出结构化标记。
 * @returns 引用块字符串；`reply` 为空时返回 null（没有引用就什么都不加）。
 */
export function replyReferenceBlock(reply) {
  if (!reply || typeof reply !== 'object') return null;
  const lines = [];
  const id = typeof reply.messageId === 'string' && reply.messageId ? reply.messageId : null;
  const sender = typeof reply.senderId === 'string' && reply.senderId ? reply.senderId : null;
  const from = [id, sender].filter(Boolean).join('，来自 ');
  const head = from ? `用户引用了一条消息（${from}）：` : '用户引用了一条消息：';

  if (reply.reason) {
    // 读不到也要说清：用户的问题照样要进 Prompt，模型得知道"引用内容不可用"而不是以为没引用。
    lines.push(head);
    lines.push(`（引用内容不可用：${clip(reply.reason, 200)}）`);
  } else {
    const kind = typeof reply.kind === 'string' && reply.kind ? reply.kind : 'text';
    const label = KIND_LABELS[kind] ?? null;
    lines.push(head);
    const body = [];
    if (typeof reply.text === 'string' && reply.text.trim()) body.push(clip(reply.text));
    if (label || reply.fileName) {
      const name = reply.fileName ? `：${clip(reply.fileName, 200)}` : '';
      body.push(label ? `（被引用的是${label}${name}）` : `（被引用的消息类型：${clip(kind, 40)}${name}）`);
    } else if (kind !== 'text') {
      // 认不出的类型也要写出来：只说"没有正文"等于把"引用了什么"又丢了一次。
      body.push(`（被引用的消息类型：${clip(kind, 40)}）`);
    }
    // 既没有正文、也不是可识别的类型：至少说一句，别让块是空的。
    if (body.length === 0) body.push('（这条消息没有可读的正文）');
    lines.push(...body);
  }
  return `${REPLY_TAG_OPEN}\n${lines.join('\n')}\n${REPLY_TAG_CLOSE}`;
}

/**
 * 把引用块拼到当前内容**前面**（与 `enhanceContent` 同形态：字符串或内容数组）。
 *
 * @param content - 当前消息的内容（字符串或 `[{type,...}]`）。
 * @param reply - 见 `replyReferenceBlock`。
 * @returns 拼好的内容；没有引用时原样返回。
 */
export function enhanceReplyReference(content, reply) {
  const block = replyReferenceBlock(reply);
  if (!block) return content;
  try {
    if (typeof content === 'string') return content ? `${block}\n\n${content}` : block;
    if (Array.isArray(content)) return [{ type: 'text', text: block }, ...content];
    return content;
  } catch {
    // 只有引用拼装被隔离：当前消息照常发出去。
    return content;
  }
}
