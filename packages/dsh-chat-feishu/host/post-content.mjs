/**
 * 飞书富文本（`post`）正文解析：**这一个文件里只此一份**，入站消息与被引用的历史消息都走它。
 *
 * 为什么单独成模块：飞书富文本不止一种形状，而且 @ 节点给的是**占位符**而不是人名。
 * 早先两处各写一份、都认错了形状（"取第一个对象值当多语言包裹"，数组也是对象），
 * 真机上每条富文本都落进"内容无法解析"——所以这里把"形状 + 节点 + @ 还原"一次讲清楚，
 * 调用方只管拿 `text` / `imageKeys` / `mentionedOpenIds`。
 *
 * 两种形状都要认（2026-10-07 真机回读确认）：
 * ① **平铺**：`{ title, content: [[{tag,…}]], content_v2: [[…]] }`
 *    —— `im.message.receive_v1` 事件与 `GET /open-apis/im/v1/messages/:id` 给的都是这个；
 * ② **多语言包裹**：`{ zh_cn: { title, content: [[…]] } }` —— 发送接口要求的形状，
 *    回读接口在部分历史消息上也会给（所以两种都留着）。
 *
 * @module dsh-chat-feishu/post-content
 */

/** 正文里"这里本来有个东西"的占位符：不下载历史媒体，但要让模型知道它存在。 */
const NODE_PLACEHOLDERS = Object.freeze({
  img: '[图片]',
  media: '[视频]',
  emotion: '[表情]',
  hr: '---',
});

/** 结构性字段（key / 人名 / id）一律 trim。 */
function plain(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 正文片段**不 trim**：飞书把一行拆成多个节点，空格往往挂在前一个节点的末尾
 * 或后一个节点的开头（真机：`{"text":" 华哥，现金流的计算…"}`）——按节点 trim
 * 会把 `@黄华 华哥` 粘成 `@黄华华哥`。行首行尾的空格在整行拼完后统一去掉。
 *
 * @param value - 节点字段。
 * @returns 原样字符串（非字符串给空串）。
 */
function raw(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * 认得出"这一层装着段落数组"的包裹。
 *
 * 判据必须是**真的带了 `content` 段落数组**：只判 `typeof === 'object'` 会把段落数组本身
 * 当成包裹（数组也是对象），于是 rows 恒为空。
 *
 * @param value - 候选值。
 * @returns 是包裹则为 true。
 */
function isWrapper(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && (Array.isArray(value.content) || Array.isArray(value.content_v2));
}

/**
 * 取出"装着段落数组的那一层"。
 *
 * 顺序是"先明确、后兜底"：`zh_cn`（发送接口的多语言包裹）→ 顶层（事件与回读的平铺形态）
 * → 其它语言分支。都没有就给空对象（调用方按"解析不出来"处理）。
 *
 * @param parsed - 已解析的富文本 content（或任意对象）。
 * @returns 包裹对象。
 */
function wrapperOf(parsed) {
  return [parsed?.zh_cn, parsed, ...Object.values(parsed ?? {})].find(isWrapper) ?? {};
}

/**
 * 段落数组：**优先 `content_v2`**。
 *
 * 官方口径（《接收消息内容结构》，2026-10 核对）：`md` 标签**只出现在 `content_v2`** 里，
 * 推荐优先读它——`content` 是降级兼容形态（`md` 被拆成 text、引用/有序/无序列表被压平）。
 * 真机上不含 `md` 时两份逐字相同，所以这个顺序对老消息没有任何影响。
 *
 * @param wrapper - 包裹对象。
 * @returns 段落数组。
 */
function rowsOf(wrapper) {
  if (Array.isArray(wrapper.content_v2)) return wrapper.content_v2;
  if (Array.isArray(wrapper.content)) return wrapper.content;
  return [];
}

/**
 * `mentions[]` 建两张索引：飞书把被 @ 的人/机器人的**真实 open_id 与人名**放在这里，
 * 而正文里的 `at` 节点给的是 `@_user_1` 占位符——两边靠 `key` 对上。
 *
 * 但 `at.user_id` **有两种形态**（官方 SDK 两种都兼容）：占位符 `@_user_1`，
 * 或者直接是真实 `ou_…`——所以再按 open_id 建一张，缺一种就会丢人名/丢门禁判据。
 *
 * @param mentions - `[{ key, id: { open_id } | 'ou_…', name }]`。
 * @returns `{ byKey, byOpenId }`。
 */
function mentionIndexes(mentions) {
  const byKey = new Map();
  const byOpenId = new Map();
  for (const mention of Array.isArray(mentions) ? mentions : []) {
    const key = plain(mention?.key);
    if (key) byKey.set(key, mention);
    const openId = openIdOfMention(mention);
    if (openId) byOpenId.set(openId, mention);
  }
  return { byKey, byOpenId };
}

/** `mentions[]` 条目的 open_id：事件给 `{id:{open_id}}`，回读接口给 `{id:'ou_…'}`。 */
function openIdOfMention(mention) {
  if (!mention) return '';
  if (typeof mention.id === 'string') return plain(mention.id);
  return plain(mention.id?.open_id ?? mention.open_id);
}

/** 像不像一个真实 open_id（发送接口的 `at` 节点直接给真 id，事件里是 `@_user_1` 占位符）。 */
function looksLikeOpenId(value) {
  return /^ou_[A-Za-z0-9_-]+$/.test(plain(value));
}

/**
 * `@` 的显示文本：人名优先，其次占位符本身。
 *
 * 占位符本来就带 `@`（`@_user_1`），再补一个就成了 `@@_user_1`——所以补之前先看一眼。
 *
 * @param name - 人名（可能为空）。
 * @param placeholder - `user_id` / `key`（可能为空）。
 * @returns 显示文本（都为空时给单个 `@`）。
 */
function atLabel(name, placeholder) {
  const label = plain(name) || plain(placeholder);
  if (!label) return '@';
  return label.startsWith('@') ? label : `@${label}`;
}

/**
 * 解析一条富文本的 content。
 *
 * @param content - `message.content`（JSON 字符串）或已经解析好的对象。
 * @param options - `{ mentions }`：消息体的 `message.mentions`（用来把 @ 还原成人名/ open_id）。
 * @returns `{ text, mentionFreeText, imageKeys, mentionedOpenIds, title }`。
 *   - `text`：正文，@ 渲染成 `@人名`；
 *   - `mentionFreeText`：同一段正文但**去掉 @**（交互回答那条路要的是纯答案）；
 *   - `imageKeys`：内嵌图片的 key（要下载成内容块的）；
 *   - `mentionedOpenIds`：正文里 @ 到的 open_id（群聊门禁的第二道判据）；
 *   - `title`：富文本标题（已并进 `text`，这里单独给出来便于调用方区分）。
 */
export function parsePostContent(content, { mentions = [] } = {}) {
  let parsed = content;
  if (typeof content === 'string') {
    try {
      parsed = JSON.parse(content || '{}');
    } catch {
      parsed = {};
    }
  }
  if (!parsed || typeof parsed !== 'object') parsed = {};

  const indexes = mentionIndexes(mentions);
  // 两遍渲染（带 @ / 去 @）都会走一遍节点，所以这里用 Set 收：同一张图不会下载两次。
  const imageKeys = new Set();
  const mentionedOpenIds = new Set();

  /** 渲染一个节点。`mention-free` 那一遍把 @ 节点渲染成空串。 */
  const lineOf = (node, { keepMentions }) => {
    if (!node || typeof node !== 'object') return '';
    const tag = plain(node.tag);
    if (tag === 'at') {
      if (!keepMentions) return '';
      const placeholder = plain(node.user_id) || plain(node.key);
      // `at.user_id` 两种形态：`@_user_1` 占位符（官方口径，真机 14/14）或真实 `ou_…`（官方 SDK 也兼容）。
      const directOpenId = looksLikeOpenId(node.user_id) ? plain(node.user_id) : '';
      const mentioned = indexes.byKey.get(placeholder)
        ?? (directOpenId ? indexes.byOpenId.get(directOpenId) : undefined);
      const openId = openIdOfMention(mentioned) || directOpenId;
      if (openId) mentionedOpenIds.add(openId);
      // 人名优先：正文里 @ 的节点在真机上带 `user_name`，事件里则靠 `mentions[].name` 还原。
      return atLabel(node.user_name || mentioned?.name, placeholder);
    }
    const placeholder = NODE_PLACEHOLDERS[tag];
    if (tag === 'img') {
      const key = plain(node.image_key);
      if (key) imageKeys.add(key);
      return placeholder;
    }
    if (placeholder) return placeholder;
    // 认不出的节点：至少把能读的文字/链接留下，绝不因为有个新标签就丢掉整行。
    return raw(node.text) || raw(node.href);
  };

  const render = ({ keepMentions }) => rowsOf(wrapperOf(parsed))
    .filter(Array.isArray)
    .map((row) => row.map((node) => lineOf(node, { keepMentions })).join('').trim())
    .filter((line) => line)
    .join('\n')
    .trim();

  const wrapper = wrapperOf(parsed);
  const title = plain(wrapper.title);
  const body = render({ keepMentions: true });
  const bodyWithoutMentions = render({ keepMentions: false });
  return {
    text: [title, body].filter(Boolean).join('\n').trim(),
    mentionFreeText: [title, bodyWithoutMentions].filter(Boolean).join('\n').trim(),
    imageKeys: [...imageKeys],
    mentionedOpenIds: [...mentionedOpenIds],
    title,
  };
}

/**
 * 只要正文（引用回复那条路用）：`parsePostContent(...).text`。
 *
 * @param content - 见 `parsePostContent`。
 * @param mentions - 见 `parsePostContent`。
 * @returns 正文文本。
 */
export function postText(content, mentions = []) {
  return parsePostContent(content, { mentions }).text;
}
