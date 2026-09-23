/**
 * 合并转发（`merge_forward`）：把一整包被转发的消息展开成一段可读文本，拼进提示词。
 *
 * 为什么要有它：用户在飞书里"合并转发"一包聊天记录再提问（"你看下这段"）时，飞书投递的
 * **只是一条外壳消息**——正文里连子消息的正文都没有，只有 `message_id`。不展开的话，
 * 模型看到的要么是空的、要么是一句"这类型不支持"，用户的问题就悬空了。
 *
 * 分工（与 `reply-reference.mjs` 同一套）：
 * - **平台概念留渠道**：渠道用 `getMessageItems()` 把原始条目取回来，不做任何拼装；
 * - **拼装留 hub**：建树、限深限条、标签渲染都在这里实现一次。
 *
 * 层级形状沿用上游 `xmanrui/dsh-im`（`convertMergeForward` / `buildChildrenMap` /
 * `formatSubTree`，v4.21.1，MIT）的同一套算法与输出形态：条目靠 `upper_message_id`
 * 指回父级，因此一次查回来的**扁平** `items` 就能还原成一棵树；嵌套的合并转发递归展开。
 *
 * @module dsh-chat/shared/forwarded-messages
 */

/** 展开块的标签：与 `<dsh_im_reply>` 同族，便于在会话历史里一眼认出。 */
export const FORWARD_TAG_OPEN = '<forwarded_messages>';
export const FORWARD_TAG_CLOSE = '</forwarded_messages>';

/** 一次性最多展开多少条子消息：它是上下文，不是全量转录。 */
export const MAX_FORWARD_ITEMS = 50;

/** 最多递归几层：合并转发里还能再套合并转发，不限深会被恶意的套娃撑爆。 */
export const MAX_FORWARD_DEPTH = 3;

/** 每条子消息的正文限长。 */
export const MAX_FORWARD_ITEM_TEXT = 2000;

/**
 * 认得出的消息类型标签。认不出的一律留空——**保留原文类型名**在正文里，
 * 比丢掉整条子消息强（模型至少知道"这里有一条语音"）。
 */
const KIND_LABELS = Object.freeze({
  text: '文本',
  post: '富文本',
  image: '图片',
  file: '文件',
  audio: '语音',
  media: '视频',
  sticker: '表情',
  interactive: '卡片',
  share_chat: '群名片',
  share_user: '个人名片',
  location: '位置',
  todo: '任务',
  calendar: '日程',
  system: '系统消息',
});

/** 标签内容里不能再出现标签本身，否则模型会以为块提前结束了。 */
function safeText(value) {
  return String(value ?? '')
    .split(FORWARD_TAG_OPEN).join('＜forwarded_messages＞')
    .split(FORWARD_TAG_CLOSE).join('＜/forwarded_messages＞')
    .trim();
}

function clip(value, max) {
  const text = safeText(value);
  return text.length > max ? `${text.slice(0, max)}…（已截断）` : text;
}

/** 每条子消息按两级缩进排（与上游 `indentLines` 一致：4 空格）。 */
function indentLines(text, indent) {
  return String(text)
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');
}

/**
 * 把飞书某条消息的正文压成一行可读文本。
 *
 * 只做"够用"的解析：文本取 `text`；富文本把各段文字/链接拼起来，图片留一个占位
 * （**不下载**历史媒体，与引用回复同一口径）；其余类型给类型名与文件名。
 *
 * @param item - 飞书消息条目（`{ msg_type, body:{content} }`）。
 * @returns 单行文本。
 */
function itemText(item) {
  const msgType = typeof item?.msg_type === 'string' && item.msg_type ? item.msg_type : 'unknown';
  let body = {};
  try {
    body = JSON.parse(item?.body?.content ?? '{}');
  } catch {
    body = {};
  }
  const plain = (value) => (typeof value === 'string' ? value.trim() : '');

  if (msgType === 'text') return plain(body.text);
  if (msgType === 'post') {
    // 富文本是多语言包裹的：`{ zh_cn:{ title, content:[[{tag,...}]] } }`。
    const localised = body.zh_cn ?? Object.values(body).find((value) => value && typeof value === 'object');
    const rows = Array.isArray(localised?.content) ? localised.content : [];
    const lineOf = (node) => {
      if (!node || typeof node !== 'object') return '';
      if (node.tag === 'img' || node.tag === 'media') {
        // 媒体不下载，但要让模型知道"这里本来有一张图"。
        return `[${node.tag === 'img' ? '图片' : '视频'}]`;
      }
      if (node.tag === 'at') return plain(node.user_id) ? `@${plain(node.user_id)}` : '@';
      return plain(node.text ?? node.href);
    };
    const lines = rows
      .filter(Array.isArray)
      .map((row) => row.map(lineOf).filter(Boolean).join(''))
      .filter(Boolean);
    const title = plain(localised?.title);
    return [title, ...lines].filter(Boolean).join('\n');
  }
  if (msgType === 'audio') return plain(body.text);
  const fileName = plain(body.file_name) || plain(body.fileName);
  const label = KIND_LABELS[msgType] ?? msgType;
  return fileName ? `（${label}：${fileName}）` : `（${label}）`;
}

/** 发送者显示名：优先名字，退回 id（拿不到就写"未知发送者"）。 */
function senderLabel(item) {
  const sender = item?.sender ?? {};
  return String(sender.name ?? sender.id ?? sender.sender_id?.open_id ?? '').trim() || '未知发送者';
}

/** 飞书给的是毫秒时间戳字符串；转成北京时间可读串（失败就留空）。 */
function timeLabel(item) {
  const ms = Number.parseInt(String(item?.create_time ?? ''), 10);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().replace('Z', '+08:00');
}

/**
 * 按 `upper_message_id` 建"父 → 子"表。
 *
 * 关键点：查回来的 `items` 是**扁平**的，而且**第一条往往就是父消息本身**
 * （它没有 `upper_message_id`）。父自己不能进表，否则会自己当自己的子节点无限递归。
 *
 * @param items - 原始条目数组。
 * @param rootId - 外壳消息的 id。
 * @returns `Map<父id, 条目[]>`（每个父的子按时间正序）。
 */
function buildChildrenMap(items, rootId) {
  const map = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.message_id) continue;
    if (item.message_id === rootId && !item.upper_message_id) continue;
    const parentId = item.upper_message_id ?? rootId;
    const bucket = map.get(parentId);
    if (bucket) bucket.push(item);
    else map.set(parentId, [item]);
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => (
      Number.parseInt(String(a?.create_time ?? '0'), 10)
      - Number.parseInt(String(b?.create_time ?? '0'), 10)
    ));
  }
  return map;
}

/**
 * 递归渲染某个父节点下的全部子消息。
 *
 * 子条目自己又是 `merge_forward` 时递归展开（**限深**）；叶子类型交给 `renderItem`。
 *
 * @param parentId - 父消息 id。
 * @param map - `buildChildrenMap` 的结果。
 * @param options - { depth, items, truncated }；`items` 是共享的计数盒子。
 * @returns 渲染好的文本（无子消息时给空标签）。
 */
function formatSubTree(parentId, map, { depth, state }) {
  const children = map.get(parentId);
  if (!children || children.length === 0) return '<forwarded_messages/>';
  const parts = [];
  for (const child of children) {
    if (state.count >= MAX_FORWARD_ITEMS) {
      state.truncated = true;
      break;
    }
    state.count += 1;
    const rendered = renderItem(child, map, { depth, state });
    if (rendered) parts.push(rendered);
  }
  if (parts.length === 0) return '<forwarded_messages/>';
  const body = parts.join('\n');
  const footer = state.truncated ? '\n... (truncated)' : '';
  return `${FORWARD_TAG_OPEN}\n${body}${footer}\n${FORWARD_TAG_CLOSE}`;
}

/** 渲染一条子消息：`[时间] 发送者:` + 缩进正文；嵌套的合并转发递归展开。 */
function renderItem(item, map, { depth, state }) {
  let content;
  if (item.msg_type === 'merge_forward') {
    content = depth >= MAX_FORWARD_DEPTH || !item.message_id
      ? '<forwarded_messages/>'
      : formatSubTree(item.message_id, map, { depth: depth + 1, state });
  } else {
    content = itemText(item);
  }
  if (!content) return '';
  const time = timeLabel(item);
  const head = time ? `[${time}] ${senderLabel(item)}:` : `${senderLabel(item)}:`;
  return `${head}\n${indentLines(clip(content, MAX_FORWARD_ITEM_TEXT), '    ')}`;
}

/**
 * 把一包被合并转发的消息渲染成提示词里的一个块。
 *
 * @param options - { messageId, items, reason? }。
 *   `reason` 有值表示**没读到**（无权限/超时），此时只出结构化标记——用户的当前问题照常进模型。
 * @returns 渲染好的块；没有条目且没给 reason 时返回 null（没内容就不加，避免留个空块）。
 */
export function forwardedMessagesBlock({ messageId, items, reason = null } = {}) {
  if (reason) {
    return `${FORWARD_TAG_OPEN}\n（合并转发的消息内容不可用：${clip(reason, 200)}）\n${FORWARD_TAG_CLOSE}`;
  }
  const list = Array.isArray(items) ? items : [];
  // 一条都没查回来：这**就是**合并转发的结果（不是"没有引用"），要给标记而不是留空，
  // 否则模型只看到用户说了一句话，却不知道那句话里本来夹着一包聊天记录。
  if (list.length === 0) {
    return `${FORWARD_TAG_OPEN}\n（合并转发的消息没有可读内容）\n${FORWARD_TAG_CLOSE}`;
  }
  const map = buildChildrenMap(list, messageId);
  const state = { count: 0, truncated: false };
  const block = formatSubTree(messageId, map, { depth: 1, state });
  // 建完表却一条子消息都没有：说明这一包里没有可读内容，同样给一个标记。
  return state.count === 0
    ? `${FORWARD_TAG_OPEN}\n（合并转发的消息没有可读内容）\n${FORWARD_TAG_CLOSE}`
    : block;
}

/**
 * 只要块的**纯文本**（不带标签）：引用回复那条路用它当被引用正文。
 *
 * 为什么单独一个函数：`replyReferenceBlock` 会把 `text` 当"被引用的正文"渲染，
 * 再塞一个 `<forwarded_messages>` 进去就成了块里套块；而且引用块本身已经写了
 * "被引用的是合并转发的消息"。所以这里只把内容摊平成纯文本，标签由外层决定。
 *
 * @param forward - 见 `forwardedMessagesBlock`。
 * @returns 展开后的纯文本；没有可读内容时返回空串。
 */
export function forwardedMessagesText(forward) {
  const block = forwardedMessagesBlock(forward);
  if (!block) return '';
  return block
    .split(FORWARD_TAG_OPEN).join('')
    .split(FORWARD_TAG_CLOSE).join('')
    .trim();
}

/**
 * 把合并转发块拼到当前内容**前面**（与 `enhanceReplyReference` 同形态）。
 *
 * @param content - 当前消息的内容（字符串或 `[{type,...}]`）。
 * @param forward - 见 `forwardedMessagesBlock`。
 * @returns 拼好的内容；没有可拼内容时原样返回。
 */
export function enhanceForwardedMessages(content, forward) {
  const block = forwardedMessagesBlock(forward);
  if (!block) return content;
  try {
    if (typeof content === 'string') return content ? `${block}\n\n${content}` : block;
    if (Array.isArray(content)) return [{ type: 'text', text: block }, ...content];
    return content;
  } catch {
    // 只有拼装被隔离：当前消息照常发出去。
    return content;
  }
}
