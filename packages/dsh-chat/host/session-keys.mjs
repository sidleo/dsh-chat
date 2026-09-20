/**
 * 会话键（`p2p:<平台 id>` / `group:<平台 id>`）的小工具。
 *
 * 单独一个模块：面板与命令都要把会话键说成人话，而它们之间不该互相 import。
 *
 * @module dsh-chat/host/session-keys
 */

/**
 * 会话键的人话名字（`p2p:ou_x` → 「私聊 ou_x」/`group:oc_y` → 「群 oc_y」）。
 *
 * 键里的 id 是**平台 id**：hub 拿不到昵称（那是渠道的事），所以只给类型 + 掩码 id——
 * 用户要照它去找到那个聊天，够用，也不编造。
 *
 * @param key - 会话键。
 * @returns 一行说明。
 */
export function chatKeyLabel(key) {
  const raw = typeof key === 'string' ? key : '';
  const [kind, id = ''] = raw.split(':', 2);
  const masked = id.length > 12 ? `${id.slice(0, 12)}…` : id;
  if (kind === 'p2p') return `私聊 ${masked}`;
  if (kind === 'group') return `群 ${masked}`;
  return raw || '未知聊天';
}
