/**
 * dsh-chat-weixin（client 侧）：微信设置页（扫码接入 + 账号状态）。
 *
 * 渠道无关的面板（上下文增强等）直接用 hub 的共享组件与 hook。
 *
 * @module dsh-chat-weixin/client
 */

import * as React from 'react';

export const name = 'dsh-chat-weixin-client';

export const inject = ['slots', 'locale', 'connection', 'chatChannels', 'chatUi'];

const CHANNEL_ID = 'weixin';

/**
 * 微信渠道的能力声明。
 *
 * `panel: false` = **没有卡片面板**：微信的 `/menu` 发的是文本命令清单
 * （`commands.mjs` 的 `reply` 那条路），不画卡片，所以「控制面板显示项」里的
 * 8 个开关一个都不起作用——那张卡以前挂在微信页上，是纯粹的摆设。
 *
 * 这份常量同时被**渠道注册**与**页面**读，避免"注册里声明没有、页面上照样画出来"。
 */
const WEIXIN_CAPABILITIES = Object.freeze({
  groups: false,
  panel: false,
  note: '仅私聊',
  setup: { label: '扫码接入', hint: '点「扫码接入」用手机微信扫码绑定新账号。' },
  /**
   * **真能提供的来源字段**（`runtime.mjs` 的 `identity` + sourceFactory 就是这几个）：
   * - `chatId` 恒等于 `senderId`（私聊）→ 重复，不列；
   * - `conversationType` 恒为 `direct` → 不会变，不列；
   * - `senderName` / `conversationTitle` / `threadId` **微信根本没有**。
   * 列出来只会让用户勾一个永远没值的框（勾了没值 = 静默无效）。
   */
  sourceFields: ['channel', 'senderId', 'botId'],
});
const PAGE_SLOT = 'chat.channel.page';
const LOCALE_NAMESPACE = 'dsh-chat-weixin';

const zh = {
  '关闭': '关闭',
  '删除': '删除',
  '启用': '启用',
  '填入示例': '填入示例',
  '备注名（可选）': '备注名（可选）',
  '张三': '张三',
  '新增': '新增',
  '来源字段': '来源字段',
  '清空': '清空',
  '还没有指定设置。': '还没有指定设置。',
  '上下文增强': '上下文增强',
  '上下文增强范围': '上下文增强范围',
  '叠加全局提示词（不勾选则只使用上面的专属提示词）': '叠加全局提示词（不勾选则只使用上面的专属提示词）',
  '告诉模型如何使用来源字段。只填正文，插件会自动包成来源增强块。': '告诉模型如何使用来源字段。只填正文，插件会自动包成来源增强块。',
  '增强提示词': '增强提示词',
  '来源字段只在当前消息已提供时才会发送，不会额外查询平台接口。': '来源字段只在当前消息已提供时才会发送，不会额外查询平台接口。',
  '从会话里选…': '从会话里选…',
  'Agent 预设': 'Agent 预设',
  '模型': '模型',
  '默认模型': '默认模型',
  '推理等级': '推理等级',
  '这个模型没有可选的推理等级。': '这个模型没有可选的推理等级。',
  '先选一个模型。': '先选一个模型。',
  '模型默认': '模型默认',
  '部分 provider 读取失败：': '部分 provider 读取失败：',
  '当前 Host 读不到模型目录。': '当前 Host 读不到模型目录。',
  '还没有会话时用哪个模型：选完对下一条消息新建的会话生效。会话内还能单独改（面板的模型下拉）。':
    '还没有会话时用哪个模型：选完对下一条消息新建的会话生效。会话内还能单独改（面板的模型下拉）。',

  '下拉里是这台机器人用过的目录。': '下拉里是这台机器人用过的目录。',
  '仅名单内可用': '仅名单内可用',
  '从会话里选一个人设为属主': '从会话里选一个人设为属主',
  '任何人可用': '任何人可用',
  '允许执行命令': '允许执行命令',
  '可执行命令': '可执行命令',
  '名单为空时只有属主可用。': '名单为空时只有属主可用。',
  '对方的平台 id，回车添加': '对方的平台 id，回车添加',
  '属主': '属主',
  '属主不需要进白名单：消息与命令都直接放行。这里改完会重连一次，立刻生效。': '属主不需要进白名单：消息与命令都直接放行。这里改完会重连一次，立刻生效。',
  '工作区': '工作区',
  '当前 Host 读不到 Agent Preset 列表。': '当前 Host 读不到 Agent Preset 列表。',
  '当前没有属主：没有人绕过访问策略，谁能用完全由下面的「访问策略」决定。': '当前没有属主：没有人绕过访问策略，谁能用完全由下面的「访问策略」决定。',
  '机器人跑在哪个目录：能读写哪些文件、用哪份 AGENTS.md。只对新建会话生效。': '机器人跑在哪个目录：能读写哪些文件、用哪份 AGENTS.md。只对新建会话生效。',
  '没有可选的会话（先和机器人聊一次）': '没有可选的会话（先和机器人聊一次）',
  '添加': '添加',
  '清空后没有人绕过访问策略': '清空后没有人绕过访问策略',
  '清空（无属主）': '清空（无属主）',
  '目录': '目录',
  '显示项': '显示项',
  '控制面板显示项': '控制面板显示项',
  // 设置页分组导航：页面一长就得有分类，否则想改一项只能盲滚（分组只做归类与跳转）。
  '设置分类': '设置分类',
  '正在设置': '正在设置',
  '设置场合': '设置场合',
  '只影响私聊会话': '只影响私聊会话',
  '只影响群聊会话': '只影响群聊会话',
  '运行环境': '运行环境',
  '权限与身份': '权限与身份',
  '呈现方式': '呈现方式',
  '能力': '能力',
  '只影响 /menu 发出来的那张卡片：关掉的项不显示，功能照旧。': '只影响 /menu 发出来的那张卡片：关掉的项不显示，功能照旧。',
  '模型与推理等级': '模型与推理等级',
  '会话': '会话',
  'Agent 预设与工作区': 'Agent 预设与工作区',
  '上下文增强（本会话）': '上下文增强（本会话）',
  '访问策略（本会话）': '访问策略（本会话）',
  '渠道设置（任务过程展示等）': '渠道设置（任务过程展示等）',
  '渠道动作按钮（重连等）': '渠道动作按钮（重连等）',
  '命令按钮（新会话/状态/诊断…）': '命令按钮（新会话/状态/诊断…）',
  '全局': '全局',
  '继承全局': '继承全局',
  '恢复继承全局': '恢复继承全局',
  '现在跟随「全局」那一份；在这里改任何一项，就会变成这个场合的单独设置。': '现在跟随「全局」那一份；在这里改任何一项，就会变成这个场合的单独设置。',
  '放弃改动': '放弃改动',
  '已保存。下一条消息生效。': '已保存。下一条消息生效。',
  '告诉机器人：这条消息从哪来、以及该怎么用它。': '告诉机器人：这条消息从哪来、以及该怎么用它。',
  '查看帮助': '查看帮助',
  '机器人跑在哪个目录。只对新建会话生效。': '机器人跑在哪个目录。只对新建会话生效。',
  '这个目录决定它能读写哪些文件、以及用哪一份 AGENTS.md。': '这个目录决定它能读写哪些文件、以及用哪一份 AGENTS.md。',
  '已经建好的会话不受影响——想换目录又想让旧会话跟上，就在那个聊天里点「新会话」。': '已经建好的会话不受影响——想换目录又想让旧会话跟上，就在那个聊天里点「新会话」。',
  '这个机器人用哪套 Agent 预设。只对新建会话生效。': '这个机器人用哪套 Agent 预设。只对新建会话生效。',
  '预设决定它的人设与能用哪些工具。': '预设决定它的人设与能用哪些工具。',
  '跟工作区一样只对新建会话生效：改完想让某个聊天用上，在那个聊天里点「新会话」。': '跟工作区一样只对新建会话生效：改完想让某个聊天用上，在那个聊天里点「新会话」。',
  '还没有会话时用它建会话。': '还没有会话时用它建会话。',
  '选完对「下一条消息新建的会话」生效，已经建好的会话不变。': '选完对「下一条消息新建的会话」生效，已经建好的会话不变。',
  '会话建好之后还能单独改：在聊天里发 /menu，或用 /model。': '会话建好之后还能单独改：在聊天里发 /menu，或用 /model。',
  '推理等级是模型自己的能力，换模型会重置。': '推理等级是模型自己的能力，换模型会重置。',
  '谁能跟机器人说话、谁能执行命令。改动立即生效。': '谁能跟机器人说话、谁能执行命令。改动立即生效。',
  '属主始终可用，不需要进名单——属主在「权限与身份」那一组里单独设置。': '属主始终可用，不需要进名单——属主在「权限与身份」那一组里单独设置。',
  '「仅名单内可用」+ 空名单 = 只有属主能说话。想给某个人开门，把他的平台 id 加进名单。': '「仅名单内可用」+ 空名单 = 只有属主能说话。想给某个人开门，把他的平台 id 加进名单。',
  '「任何人可用」表示这个场合里谁都进得来；群聊下任何成员 @ 它就行。': '「任何人可用」表示这个场合里谁都进得来；群聊下任何成员 @ 它就行。',
  '名单里的人可以额外勾「可执行命令」；不勾就只能对话，不能跑 / 开头的命令。': '名单里的人可以额外勾「可执行命令」；不勾就只能对话，不能跑 / 开头的命令。',
  '这个下拉控制的是"执行过程怎么展示"——不影响答案本身，也不影响命令与权限。': '这个下拉控制的是"执行过程怎么展示"——不影响答案本身，也不影响命令与权限。',
  '这台机器人调 lark-cli 时能用哪些身份。': '这台机器人调 lark-cli 时能用哪些身份。',
  '就近覆盖：指定群/人 → 群聊/私聊 → 全局。选了「继承上一层」的那一层不单独设置，听上层的。': '就近覆盖：指定群/人 → 群聊/私聊 → 全局。选了「继承上一层」的那一层不单独设置，听上层的。',
  '两个身份可以同时允许，也可以都不允许。': '两个身份可以同时允许，也可以都不允许。',
  '允许用户身份只是「允许以用户身份调用」，实际用的仍是下面「登录人」那一个——lark-cli 一份 profile 只有一个登录人，不会按发言人自动切换。': '允许用户身份只是「允许以用户身份调用」，实际用的仍是下面「登录人」那一个——lark-cli 一份 profile 只有一个登录人，不会按发言人自动切换。',
  '飞书渠道自己的收发消息始终走官方 SDK，与这里的身份无关。': '飞书渠道自己的收发消息始终走官方 SDK，与这里的身份无关。',
  '这一项目前只有私聊/群聊两份（没有全局层）；下面显示的是私聊那一份。': '这一项目前只有私聊/群聊两份（没有全局层）；下面显示的是私聊那一份。',
  '只对新建会话生效': '只对新建会话生效',
  '新会话用它': '新会话用它',
  '改完会重连一次': '改完会重连一次',
  '改动立即生效': '改动立即生效',
  '只影响 /menu 那张卡片': '只影响 /menu 那张卡片',
  '选择用过的目录': '选择用过的目录',
  '属主不需要进白名单：消息与命令都直接放行，也不看访问策略。': '属主不需要进白名单：消息与命令都直接放行，也不看访问策略。',
  '从"它聊过的会话"里挑一个人设为属主；清空后没有任何人绕过访问策略。': '从"它聊过的会话"里挑一个人设为属主；清空后没有任何人绕过访问策略。',
  '「仅名单内可用」+ 空名单时只有属主能说话。': '「仅名单内可用」+ 空名单时只有属主能说话。',
  '关掉的项不显示在卡片上，但功能照旧（策略、上下文增强都还在生效）。': '关掉的项不显示在卡片上，但功能照旧（策略、上下文增强都还在生效）。',
  '下拉里是这台机器人用过的目录，也可以直接手打任意路径。': '下拉里是这台机器人用过的目录，也可以直接手打任意路径。',
  '还没有指定设置': '还没有指定设置',
  '影响过程怎么显示，不影响答案': '影响过程怎么显示，不影响答案',
  '下一条消息生效': '下一条消息生效',
  '开着时，回复会按飞书卡片的能力组织（表格、分节、代码块更清楚）。': '开着时，回复会按飞书卡片的能力组织（表格、分节、代码块更清楚）。',
  '关掉则按普通文本习惯回答——插件不改写答案内容，怎么写由模型自己决定。': '关掉则按普通文本习惯回答——插件不改写答案内容，怎么写由模型自己决定。',
  '写一句"怎么理解来源"的说明，可点「填入示例」看模板': '写一句"怎么理解来源"的说明，可点「填入示例」看模板',
  '启用增强': '启用增强',
  '告诉机器人：这条消息从哪来、以及该怎么用它——比如让它在回答里带上发言人是谁、在哪个群说的。': '告诉机器人：这条消息从哪来、以及该怎么用它——比如让它在回答里带上发言人是谁、在哪个群说的。',
  'profile 已就绪': 'profile 已就绪',
  'profile 尚未创建': 'profile 尚未创建',
  '应用身份': '应用身份',
  '登录人': '登录人',
  '把结果发到指定会话': '把结果发到指定会话',
  '帮助': '帮助',
  '属主不需要进名单：消息与命令都直接放行。': '属主不需要进名单：消息与命令都直接放行。',
  '属主是扫码绑定这个账号的人（微信登录人），消息与命令都直接放行。': '属主是扫码绑定这个账号的人（微信登录人），消息与命令都直接放行。',
  '「任何人可用」表示这个场合里谁都进得来。': '「任何人可用」表示这个场合里谁都进得来。',
  '告诉机器人：这条消息从哪来、以及该怎么用它——比如让它在回答里带上发言人是谁。': '告诉机器人：这条消息从哪来、以及该怎么用它——比如让它在回答里带上发言人是谁。',
  '还没有可添加的会话：先和机器人私聊一次，会话就会出现在这里，保存后即可主动投递。': '还没有可添加的会话：先和机器人私聊一次，会话就会出现在这里，保存后即可主动投递。',
  '没有可添加的会话：先和机器人私聊一次，该会话就会出现在这里。': '没有可添加的会话：先和机器人私聊一次，该会话就会出现在这里。',
  '私聊': '私聊',
  '移除': '移除',
  '群聊': '群聊',
  '设为属主': '设为属主',
  '访问模式': '访问模式',
  '访问策略': '访问策略',
  '谁能跟机器人说话、谁能执行命令。改动立即生效；属主始终可用。': '谁能跟机器人说话、谁能执行命令。改动立即生效；属主始终可用。',
  '跟随 Host 默认': '跟随 Host 默认',
  '这个机器人用哪套 Agent 预设（人设与工具集）。只对新建会话生效。': '这个机器人用哪套 Agent 预设（人设与工具集）。只对新建会话生效。',
  '微信': '微信',
  '找不到这个机器人': '找不到这个机器人',
  '它不在当前渠道的名单里（可能已被移除，或 Host 与页面版本不一致）': '它不在当前渠道的名单里（可能已被移除，或 Host 与页面版本不一致）',
  '微信渠道': '微信渠道',
  '已绑定的账号': '已绑定的账号',
  '扫码接入': '扫码接入',
  '重新连接': '重新连接',
  '移除接入': '移除接入',
  '确认移除': '确认移除',
  '取消': '取消',
  '读取状态': '读取状态',
  '读取中…': '读取中…',
  '正在生成二维码…': '正在生成二维码…',
  '用手机微信扫描二维码并在手机上确认。': '用手机微信扫描二维码并在手机上确认。',
  '二维码由腾讯微信 iLink 服务签发；账号凭据只写入本机 Host，浏览器拿不到 token。':
    '二维码由腾讯微信 iLink 服务签发；账号凭据只写入本机 Host，浏览器拿不到 token。',
  '等待扫码': '等待扫码',
  '已扫码，请在手机上确认': '已扫码，请在手机上确认',
  '需要配对码，请在下方输入手机上显示的配对码': '需要配对码，请在下方输入手机上显示的配对码',
  '提交配对码': '提交配对码',
  '二维码已失效，请重新生成': '二维码已失效，请重新生成',
  '该微信账号已在别处绑定': '该微信账号已在别处绑定',
  '已接入，正在启动长轮询…': '已接入，正在启动长轮询…',
  '重新生成二维码': '重新生成二维码',
  '没有已绑定的微信账号': '没有已绑定的微信账号',
  '本机还没有微信账号。点上方「扫码接入」用手机微信扫码绑定。':
    '本机还没有微信账号。点上方「扫码接入」用手机微信扫码绑定。',
  '点「扫码接入」用手机微信扫码绑定新账号。': '点「扫码接入」用手机微信扫码绑定新账号。',
  '已处理消息': '已处理消息',
  '状态': '状态',
  '启动中': '启动中',
  '运行正常': '运行正常',
  '重连中': '重连中',
  '启动失败': '启动失败',
  '已停止': '已停止',
  '仅私聊': '仅私聊',
  // hub 的共享组件（上下文增强编辑器）用本渠道的 t 取文案，因此这些键必须在渠道字典里。
  '保存': '保存',
  '保存中…': '保存中…',
  '保存失败，请重试。': '保存失败，请重试。',
};

const en = {
  '放弃改动': 'Discard changes',
  '已保存。下一条消息生效。': 'Saved. Applies from the next message.',
  '告诉机器人：这条消息从哪来、以及该怎么用它。': 'Tell the bot where an incoming message came from, and how to use it.',
  '查看帮助': 'Show help',
  '机器人跑在哪个目录。只对新建会话生效。': 'Which directory the bot runs in. Applies to new conversations only.',
  '这个目录决定它能读写哪些文件、以及用哪一份 AGENTS.md。': 'This directory decides which files it can read and write, and which AGENTS.md applies.',
  '已经建好的会话不受影响——想换目录又想让旧会话跟上，就在那个聊天里点「新会话」。': 'Existing conversations are unaffected. To point one at the new directory, use "New session" in that chat.',
  '这个机器人用哪套 Agent 预设。只对新建会话生效。': 'Which agent preset this bot uses. Applies to new conversations only.',
  '预设决定它的人设与能用哪些工具。': 'The preset decides its persona and which tools it may use.',
  '跟工作区一样只对新建会话生效：改完想让某个聊天用上，在那个聊天里点「新会话」。': 'Like the workspace, this applies to new conversations only: use "New session" in that chat to pick it up.',
  '还没有会话时用它建会话。': 'Used when a conversation is created before one exists.',
  '选完对「下一条消息新建的会话」生效，已经建好的会话不变。': 'Applies to the conversation created by your next message; existing ones are unchanged.',
  '会话建好之后还能单独改：在聊天里发 /menu，或用 /model。': 'You can still change it per conversation: send /menu in the chat, or use /model.',
  '推理等级是模型自己的能力，换模型会重置。': 'Reasoning effort belongs to the model; switching models resets it.',
  '谁能跟机器人说话、谁能执行命令。改动立即生效。': 'Who may talk to the bot and who may run commands. Applies immediately.',
  '属主始终可用，不需要进名单——属主在「权限与身份」那一组里单独设置。': 'The owner always has access and does not need to be on the list — set the owner in the "Access & identity" group.',
  '「仅名单内可用」+ 空名单 = 只有属主能说话。想给某个人开门，把他的平台 id 加进名单。': '"Allowlist only" with an empty list means only the owner can talk. To let someone in, add their platform id to the list.',
  '「任何人可用」表示这个场合里谁都进得来；群聊下任何成员 @ 它就行。': '"Anyone" means everyone in this scope can get in; in a group, any member can just @ the bot.',
  '名单里的人可以额外勾「可执行命令」；不勾就只能对话，不能跑 / 开头的命令。': 'People on the list can also be granted "may run commands"; without it they can chat but not run / commands.',
  '这个下拉控制的是"执行过程怎么展示"——不影响答案本身，也不影响命令与权限。': 'This controls how the execution process is shown — it does not affect the answer, commands or permissions.',
  '这台机器人调 lark-cli 时能用哪些身份。': 'Which identities this bot may use when calling lark-cli.',
  '就近覆盖：指定群/人 → 群聊/私聊 → 全局。选了「继承上一层」的那一层不单独设置，听上层的。': 'Nearest wins: specific chats/people → group/direct → global. A layer set to "inherit" is unset and follows the layer above.',
  '两个身份可以同时允许，也可以都不允许。': 'Both identities may be allowed at once, or neither.',
  '允许用户身份只是「允许以用户身份调用」，实际用的仍是下面「登录人」那一个——lark-cli 一份 profile 只有一个登录人，不会按发言人自动切换。': 'Allowing the user identity only permits calling as a user; the actual user is still the signed-in person below — one lark-cli profile holds one signed-in user and never switches per sender.',
  '飞书渠道自己的收发消息始终走官方 SDK，与这里的身份无关。': 'Sending and receiving messages always goes through the official SDK and is unaffected by these identities.',
  '这一项目前只有私聊/群聊两份（没有全局层）；下面显示的是私聊那一份。': 'This setting still has two separate scopes (direct/group) with no global layer yet; the one shown below is direct.',
  '只对新建会话生效': 'Applies to new conversations only',
  '新会话用它': 'Used for new conversations',
  '改完会重连一次': 'Reconnects once after saving',
  '改动立即生效': 'Applies immediately',
  '只影响 /menu 那张卡片': 'Affects only the /menu card',
  '选择用过的目录': 'Pick a directory used before',
  '属主不需要进白名单：消息与命令都直接放行，也不看访问策略。': 'The owner does not need to be on the list: their messages and commands always pass, bypassing the access policy.',
  '从"它聊过的会话"里挑一个人设为属主；清空后没有任何人绕过访问策略。': 'Pick a person from the conversations this bot has had; clearing the list means nobody bypasses the access policy.',
  '「仅名单内可用」+ 空名单时只有属主能说话。': 'With "Allowlist only" and an empty list, only the owner can talk.',
  '关掉的项不显示在卡片上，但功能照旧（策略、上下文增强都还在生效）。': 'Hidden items are not drawn on the card, but still work (policy and context enhancement remain active).',
  '下拉里是这台机器人用过的目录，也可以直接手打任意路径。': 'The list shows directories this bot has used before; you can also type any path.',
  '还没有指定设置': 'Nothing specific configured yet',
  '影响过程怎么显示，不影响答案': 'Changes how the process is shown, not the answer',
  '下一条消息生效': 'Applies from the next message',
  '开着时，回复会按飞书卡片的能力组织（表格、分节、代码块更清楚）。': 'When on, replies are organised for Feishu cards (clearer tables, sections and code blocks).',
  '关掉则按普通文本习惯回答——插件不改写答案内容，怎么写由模型自己决定。': 'When off they follow plain-text habits — the plugin never rewrites the answer; the model decides how to write it.',
  '写一句"怎么理解来源"的说明，可点「填入示例」看模板': 'One line on how to read the source; use "Fill with example" for a template',
  '启用增强': 'Enable enhancement',
  '告诉机器人：这条消息从哪来、以及该怎么用它——比如让它在回答里带上发言人是谁、在哪个群说的。': 'Tell the bot where a message came from and how to use it — e.g. mention who said it and in which chat.',
  'profile 已就绪': 'profile ready',
  'profile 尚未创建': 'profile not created yet',
  '应用身份': 'app identity',
  '登录人': 'signed-in user',
  '把结果发到指定会话': 'Send results to a chosen chat',
  '帮助': 'Help',
  '属主不需要进名单：消息与命令都直接放行。': 'The owner does not need to be on the list: their messages and commands always pass.',
  '属主是扫码绑定这个账号的人（微信登录人），消息与命令都直接放行。': 'The owner is whoever scanned to bind this account (the WeChat sign-in); their messages and commands always pass.',
  '「任何人可用」表示这个场合里谁都进得来。': '"Anyone" means everyone in this scope can get in.',
  '告诉机器人：这条消息从哪来、以及该怎么用它——比如让它在回答里带上发言人是谁。': 'Tell the bot where a message came from and how to use it — e.g. mention who said it.',
  '还没有可添加的会话：先和机器人私聊一次，会话就会出现在这里，保存后即可主动投递。': 'No conversations to add yet: chat with the bot once and it will show up here; save it to enable proactive delivery.',
  '没有可添加的会话：先和机器人私聊一次，该会话就会出现在这里。': 'No conversations to add: chat with the bot once and it will show up here.',
  '私聊': 'Direct',
  '群聊': 'Group',
  '全局': 'Global',
  '继承全局': 'Inherits global',
  '恢复继承全局': 'Revert to inheriting global',
  '正在设置': 'Configuring',
  '设置场合': 'Scope',
  '设置分类': 'Setting groups',
  '所有会话的默认值': 'Default for all chats',
  '显示项': 'Section',
  '控制面板显示项': 'Control panel sections',
  '只影响私聊会话': 'Affects direct chats only',
  '只影响群聊会话': 'Affects group chats only',
  '运行环境': 'Runtime',
  '权限与身份': 'Access & identity',
  '呈现方式': 'Presentation',
  '能力': 'Capabilities',
  '只影响 /menu 发出来的那张卡片：关掉的项不显示，功能照旧。': 'Only affects the card sent by /menu: hidden items are not drawn, everything keeps working (direct and group are configured separately).',
  '模型与推理等级': 'Model & reasoning',
  '会话': 'Session',
  'Agent 预设与工作区': 'Agent preset & workspace',
  '上下文增强（本会话）': 'Context enhancement (this chat)',
  '访问策略（本会话）': 'Access policy (this chat)',
  '渠道设置（任务过程展示等）': 'Channel settings (step display etc.)',
  '渠道动作按钮（重连等）': 'Channel actions (reconnect etc.)',
  '命令按钮（新会话/状态/诊断…）': 'Command buttons (new session/status/diagnostics…)',
  '关闭': 'Close',
  '删除': 'Delete',
  '启用': 'Enabled',
  '填入示例': 'Fill with example',
  '备注名（可选）': 'Display name (optional)',
  '张三': 'Alice',
  '新增': 'Add',
  '来源字段': 'Source fields',
  '清空': 'Clear',
  '还没有指定设置。': 'Nothing configured yet.',
  '上下文增强': 'Context enhancement',
  '上下文增强范围': 'Context enhancement scope',
  '叠加全局提示词（不勾选则只使用上面的专属提示词）': 'Also stack the global prompt (unchecked: use only the prompt above)',
  '告诉模型如何使用来源字段。只填正文，插件会自动包成来源增强块。': 'Tell the model how to use the source fields. Write the body only — the plugin wraps it into a source block.',
  '增强提示词': 'Prepended prompt',
  '来源字段只在当前消息已提供时才会发送，不会额外查询平台接口。': 'Source fields are sent only when the incoming message already carries them; no extra platform calls are made.',
  '从会话里选…': 'Pick a conversation…',
  'Agent 预设': 'Agent preset',
  '模型': 'Model',
  '默认模型': 'Default model',
  '推理等级': 'Reasoning effort',
  '这个模型没有可选的推理等级。': 'This model has no reasoning efforts to choose from.',
  '先选一个模型。': 'Pick a model first.',
  '模型默认': 'Model default',
  '部分 provider 读取失败：': 'Some providers failed to load: ',
  '当前 Host 读不到模型目录。': 'The model catalog is unavailable right now.',
  '还没有会话时用哪个模型：选完对下一条消息新建的会话生效。会话内还能单独改（面板的模型下拉）。':
    'Model used before a conversation exists; it applies to the session created by your next message. You can still change it per conversation from the panel.',

  '下拉里是这台机器人用过的目录。': 'The suggestions are directories this bot has used before.',
  '仅名单内可用': 'Allowlist only',
  '从会话里选一个人设为属主': 'Pick a person from a conversation to make them the owner',
  '任何人可用': 'Anyone',
  '允许执行命令': 'Allow commands',
  '可执行命令': 'Allow commands',
  '名单为空时只有属主可用。': 'An empty allowlist means only the owner can use it.',
  '对方的平台 id，回车添加': 'Their platform id — press Enter to add',
  '属主': 'Owner',
  '属主不需要进白名单：消息与命令都直接放行。这里改完会重连一次，立刻生效。': 'An owner does not need to be on the allowlist: their messages and commands always pass. Saving reconnects this bot once so the change takes effect immediately.',
  '工作区': 'Workspace',
  '当前 Host 读不到 Agent Preset 列表。': 'This Host does not expose an agent preset list.',
  '当前没有属主：没有人绕过访问策略，谁能用完全由下面的「访问策略」决定。': 'No owner right now: nobody bypasses the access policy, so who may use this bot is decided entirely by the access policy below.',
  '机器人跑在哪个目录：能读写哪些文件、用哪份 AGENTS.md。只对新建会话生效。': 'Which directory the bot runs in: which files it may read and write, and which AGENTS.mdapplies. Applies to new conversations only.',
  '没有可选的会话（先和机器人聊一次）': 'No conversation to pick yet (talk to the bot once first)',
  '添加': 'Add',
  '清空后没有人绕过访问策略': 'After clearing, nobody bypasses the access policy',
  '清空（无属主）': 'Clear (no owner)',
  '目录': 'Directory',
  '现在跟随「全局」那一份；在这里改任何一项，就会变成这个场合的单独设置。': 'Currently following the Global layer; changing anything here makes this scope its own settings.',
  '移除': 'Remove',
  '设为属主': 'Make owner',
  '访问模式': 'Access mode',
  '访问策略': 'Access policy',
  '谁能跟机器人说话、谁能执行命令。改动立即生效；属主始终可用。': 'Who may talk to the bot and who may run commands. Changes apply immediately;the owner always has access.',
  '跟随 Host 默认': 'Follow the Host default',
  '这个机器人用哪套 Agent 预设（人设与工具集）。只对新建会话生效。': 'Which agent preset this bot uses (persona and tool set). Applies to new conversations only.',
  '微信': 'WeChat',
  '找不到这个机器人': 'Bot not found',
  '它不在当前渠道的名单里（可能已被移除，或 Host 与页面版本不一致）':
    "It is not in this channel's bot list (it may have been removed, or the Host and the page are on different versions)",
  '微信渠道': 'WeChat channel',
  '已绑定的账号': 'Linked accounts',
  '扫码接入': 'Scan to link',
  '重新连接': 'Reconnect',
  '移除接入': 'Remove',
  '确认移除': 'Confirm removal',
  '取消': 'Cancel',
  '读取状态': 'Reload',
  '读取中…': 'Loading…',
  '正在生成二维码…': 'Requesting a QR code…',
  '用手机微信扫描二维码并在手机上确认。':
    'Scan the QR code with WeChat on your phone and confirm there.',
  '二维码由腾讯微信 iLink 服务签发；账号凭据只写入本机 Host，浏览器拿不到 token。':
    'The QR code is issued by Tencent iLink; credentials are written on the Host only.',
  '等待扫码': 'Waiting for a scan',
  '已扫码，请在手机上确认': 'Scanned — confirm on your phone',
  '需要配对码，请在下方输入手机上显示的配对码':
    'A pairing code is required; enter the code shown on your phone',
  '提交配对码': 'Submit code',
  '二维码已失效，请重新生成': 'The QR code expired; generate a new one',
  '该微信账号已在别处绑定': 'This WeChat account is already linked elsewhere',
  '已接入，正在启动长轮询…': 'Linked — starting the message connection…',
  '重新生成二维码': 'Generate a new QR code',
  '没有已绑定的微信账号': 'No WeChat account linked',
  '本机还没有微信账号。点上方「扫码接入」用手机微信扫码绑定。':
    'No WeChat account on this Host yet. Use “Scan to link” above.',
  '点「扫码接入」用手机微信扫码绑定新账号。': 'Use “Scan to link” to bind a new account with WeChat.',
  '已处理消息': 'Messages handled',
  '状态': 'State',
  '启动中': 'Starting',
  '运行正常': 'Connected',
  '重连中': 'Reconnecting',
  '启动失败': 'Failed',
  '已停止': 'Stopped',
  '仅私聊': 'Direct messages only',
  '保存': 'Save',
  '保存中…': 'Saving…',
  '保存失败，请重试。': 'Could not save. Try again.',
};

const h = React.createElement;

const STATE_TEXT = {
  starting: '启动中',
  running: '运行正常',
  reconnecting: '重连中',
  failed: '启动失败',
  stopped: '已停止',
};

const STATUS_TEXT = {
  wait: '等待扫码',
  scaned: '已扫码，请在手机上确认',
  need_verifycode: '需要配对码，请在下方输入手机上显示的配对码',
  expired: '二维码已失效，请重新生成',
  verify_code_blocked: '二维码已失效，请重新生成',
  binded_redirect: '该微信账号已在别处绑定',
  connected: '已接入，正在启动长轮询…',
};

function QrLogin({ chatUi, connection, translate, onDone }) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  const [state, setState] = React.useState({ phase: 'idle' });
  const [verifyCode, setVerifyCode] = React.useState('');
  const aliveRef = React.useRef(true);

  React.useEffect(() => () => { aliveRef.current = false; }, []);

  const begin = React.useCallback(async () => {
    setState({ phase: 'starting' });
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'login.begin', {});
      const value = chatUi.unwrapRpc(result);
      if (!aliveRef.current) return;
      setState({ phase: 'waiting', attemptId: value.attemptId, qrcodeUrl: value.qrcodeUrl, status: 'wait' });
    } catch (error) {
      if (aliveRef.current) setState({ phase: 'error', error });
    }
  }, [chatUi, connection]);

  // 轮询扫码状态（服务端长轮询，这里每 2s 一次）。
  React.useEffect(() => {
    if (state.phase !== 'waiting' || !state.attemptId) return undefined;
    let stopped = false;
    const tick = async () => {
      try {
        const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'login.poll', {
          attemptId: state.attemptId,
          ...(verifyCode ? { verifyCode } : {}),
        });
        const value = chatUi.unwrapRpc(result);
        if (stopped || !aliveRef.current) return;
        if (value.status === 'connected') {
          setState({ phase: 'done' });
          onDone?.();
          return;
        }
        setState((current) => ({ ...current, status: value.status }));
        if (value.status === 'expired' || value.status === 'verify_code_blocked') return;
      } catch (error) {
        if (!stopped && aliveRef.current) setState((current) => ({ ...current, error }));
        return;
      }
      if (!stopped) timer = setTimeout(tick, 2_000);
    };
    let timer = setTimeout(tick, 500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [state.phase, state.attemptId, verifyCode, chatUi, connection, onDone]);

  const { Panel } = chatUi.components;

  if (state.phase === 'idle') {
    return h(Panel, {
      title: t('扫码接入'),
      description: t('二维码由腾讯微信 iLink 服务签发；账号凭据只写入本机 Host，浏览器拿不到 token。'),
      actions: h('button', {
        type: 'button', className: 'dchat-button dchat-buttonPrimary', onClick: () => { void begin(); },
      }, t('扫码接入')),
    });
  }
  if (state.phase === 'starting') {
    return h(Panel, { title: t('扫码接入'), description: t('正在生成二维码…') });
  }
  if (state.phase === 'done') {
    return h(Panel, { title: t('扫码接入'), description: t('已接入，正在启动长轮询…') });
  }
  if (state.phase === 'error') {
    return h(Panel, {
      title: t('扫码接入'),
      actions: h('button', {
        type: 'button', className: 'dchat-button', onClick: () => { void begin(); },
      }, t('重新生成二维码')),
    }, h('p', { className: 'dchat-error', role: 'alert' }, state.error?.message ?? '发起扫码失败。'));
  }

  const expired = status => status === 'expired' || status === 'verify_code_blocked';
  return h(Panel, {
    title: t('扫码接入'),
    description: t('用手机微信扫描二维码并在手机上确认。'),
    actions: h('button', {
      type: 'button', className: 'dchat-button', onClick: () => { void begin(); },
    }, t('重新生成二维码')),
  },
  state.qrcodeUrl
    ? h('img', {
      src: state.qrcodeUrl,
      alt: t('扫码接入'),
      style: { width: 200, height: 200, imageRendering: 'pixelated' },
    })
    : null,
  h('p', { className: 'dchat-cardDescription' }, t(STATUS_TEXT[state.status] ?? '等待扫码')),
  state.status === 'need_verifycode'
    ? h('div', { className: 'dchat-actions' },
      h('input', {
        type: 'text', value: verifyCode, placeholder: t('提交配对码'),
        onChange: (event) => setVerifyCode(event.target.value),
      }))
    : null,
  expired(state.status) ? h('p', { className: 'dchat-error' }, t('二维码已失效，请重新生成')) : null);
}

// 导出给布局守门用：整张渠道卡在窄栏下的真实渲染（真机炸过「卡片头逐字竖排」）。
export function AccountCard({ account, chatUi, connection, translate, onChanged }) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  const { Panel, StatusPill, ContextEnhancementEditor, DeliveryTargetsEditor,
    WorkspaceEditor, PresetEditor, ModelEditor, SettingGroups } = chatUi.components;
  const settings = chatUi.hooks.useBotSettings({
    connection, channelId: CHANNEL_ID, botId: account.botId,
  });
  // 可选项（这台机器人用过的目录、Host 的 Agent Preset 列表）进来读一次。
  React.useEffect(() => {
    void settings.loadOptions();
  }, [settings.loadOptions]);
  // 会话 → 该平台的用户 id（微信只有私聊，route 里是 userId）。
  const sessions = chatUi.hooks.useConversations({
    connection, channelId: CHANNEL_ID, botId: account.botId,
  }).conversations
    .map((item) => ({
      id: item.kind === 'group' ? item.route?.chatId : item.route?.userId,
      name: item.name,
      kind: item.kind,
    }))
    .filter((item) => typeof item.id === 'string' && item.id);
  const shared = {
    workspace: settings.record?.workspace ?? null,
    agentPreset: settings.record?.agentPreset ?? null,
    // 机器人默认模型（还没有会话时用它）：与工作区/预设同一条口径，只对新建会话生效。
    model: settings.record?.model ?? null,
  };
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [confirming, setConfirming] = React.useState(false);

  const run = async (method, payload) => {
    setBusy(true);
    setError(null);
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, method, payload);
      return chatUi.unwrapRpc(result);
    } catch (cause) {
      setError(cause.message);
      throw cause;
    } finally {
      setBusy(false);
    }
  };

  return h(Panel, {
    // 这个账号的身份与操作条（名称/状态/重连/移除接入）：**不属于任何设置分组**——
    // 它不是一项设置，而是"我在配哪个账号"。标记与飞书同义，供布局守门区分头卡与设置卡。
    'data-card': 'bot-header',
    title: account.botName ?? account.accountIdMasked,
    description: `${account.accountIdMasked} · ${t('仅私聊')}`,
    actions: h('div', { className: 'dchat-actions' },
      h(StatusPill, { status: account.state, label: t(STATE_TEXT[account.state] ?? '状态') }),
      h('button', {
        type: 'button', className: 'dchat-button', disabled: busy,
        onClick: async () => {
          try {
            await run('account.reconnect', { botId: account.botId });
            await onChanged?.();
          } catch { /* 错误已展示 */ }
        },
      }, t('重新连接')),
      confirming
        ? h(React.Fragment, null,
          h('button', {
            type: 'button', className: 'dchat-button dchat-buttonDangerSolid', disabled: busy,
            onClick: async () => {
              try {
                await run('account.delete', { botId: account.botId, confirm: true });
                setConfirming(false);
                await onChanged?.();
              } catch { /* 错误已展示 */ }
            },
          }, t('确认移除')),
          h('button', {
            type: 'button', className: 'dchat-button', disabled: busy,
            onClick: () => setConfirming(false),
          }, t('取消')))
        : h('button', {
          type: 'button', className: 'dchat-button dchat-buttonDanger', disabled: busy,
          onClick: () => setConfirming(true),
        }, t('移除接入'))),
  },
  account.errorMessage
    ? h('p', { className: 'dchat-error', role: 'alert' }, account.errorMessage)
    : null,
  error ? h('p', { className: 'dchat-error', role: 'alert' }, error) : null,
  h('div', { className: 'dchat-list' },
    h('div', { className: 'dchat-listItem' },
      h('span', null, t('已处理消息')),
      h('span', null, String(account.handled ?? 0)))),
  /**
   * 设置项按**职能**分组（与飞书同一条口径）：页面是逐轮追加出来的，
   * 平铺的卡片一多就得盲滚。分组只做归类与跳转，每个组件的实现与保存路径一行不改。
   */
  h(SettingGroups, {
    translate: t,
    ariaLabel: t('设置分类'),
    groups: [
      {
        key: 'runtime',
        label: '运行环境',
        items: [
          {
            key: 'workspace',
            label: '工作区',
            node: h(WorkspaceEditor, {
              value: shared.workspace,
              options: settings.options?.workspacePaths ?? [],
              translate: t,
              onSave: settings.saveWorkspace,
            }),
          },
          {
            key: 'preset',
            label: 'Agent 预设',
            node: h(PresetEditor, {
              value: shared.agentPreset,
              options: settings.options?.presets ?? [],
              translate: t,
              onSave: settings.saveAgentPreset,
            }),
          },
          {
            key: 'model',
            label: '默认模型',
            node: h(ModelEditor, {
              value: shared.model ?? null,
              options: settings.options?.models ?? [],
              hostDefault: settings.options?.hostDefault ?? null,
              failures: settings.options?.modelFailures ?? [],
              translate: t,
              onSave: settings.saveModel,
            }),
          },
        ],
      },
      /**
       * **没有「权限与身份」这一组**（微信就是「只给属主自己用」）。
       *
       * 属主 = 扫码绑定这个账号的人，而缺省的访问策略（仅名单内 + 空名单）**恰好等于
       * "只有属主能用"**——也就是微信的常态，这一屏平时一个字都不用改。
       *
       * 那"放开给别人"呢？两条路都不通：
       * ① 加名单要填 `from_user_id`（收消息看的那个 id），而**微信不显示这个 id**，
       *    页面也没有选择器（`AccessPolicyEditor` 没有 conversations 参数）——
       *    留着就是一个"填不进正确值"的输入框；
       * ② 改成「任何人可用」能选，但那等于**谁能找到这个机器人谁就能触发它**，
       *    在一个定位成"给我自己用"的渠道上，把这种开关摆在设置页第一屏是给用户挖坑。
       * 所以整组去掉；真要用命令放人，`/allow` / `/deny` 仍然有效（属主在聊天里可用）。
       */
      {
        key: 'capability',
        label: '能力',
        items: [
          {
            key: 'context',
            label: '上下文增强',
            node: h(ContextEnhancementEditor, {
              config: settings.record?.contextEnhancement ?? null,
              scope: 'direct',
              // 只列微信真能提供的来源字段（其余勾了也没有值）。
              sourceFields: WEIXIN_CAPABILITIES.sourceFields,
              // 微信实际上只有属主一个人在聊：「指定用户」那一层没有意义，不画。
              showTargets: false,
              disabled: settings.phase !== 'ready',
              translate: t,
              onSave: settings.saveContextEnhancement,
              // 「指定用户」用平台 userId（route.userId），不是投递目标 id。
              conversations: sessions,
            }),
          },
          {
            key: 'delivery',
            label: '主动投递',
            // 渠道无关面板：目标清单与测试发送都由 hub 的共享组件负责。
            node: h(DeliveryTargetsEditor, {
              chatUi,
              connection,
              channelId: CHANNEL_ID,
              botId: account.botId,
              // 微信没有群：空态里"在群里 @ 一次机器人"那条指引走不通，换成"先私聊一次"。
              groups: WEIXIN_CAPABILITIES.groups,
            }),
          },
        ],
      },
    ],
  }));
}

/**
 * 渠道设置页（`chat.channel.page`）。
 *
 * **两个视图严格分开，页面上不混**（与飞书同一条口径）：
 * - `botId` 为空 = 「扫码接入」：**只画扫码相关的东西**。已绑定的账号属于左栏那份列表，
 *   点它们的「设置」才是各自的配置页。
 * - `botId` 给了 = 这一个账号的设置页。
 *
 * 导出给布局守门用：守门断言"扫码页里不出现已绑定账号的配置"。
 */
export function WeixinPage(props) {
  // hub 从机器人列表点「设置」进来时会带上 botId：只展示这一个账号的设置。
  const { chatUi, connection, translate, botId = null } = props;
  const t = typeof translate === 'function' ? translate : (key) => key;
  const [state, setState] = React.useState({ phase: 'idle', value: null, error: null });

  const load = React.useCallback(async () => {
    setState((current) => ({ ...current, phase: 'loading' }));
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'connection.status', {});
      setState({ phase: 'ready', value: chatUi.unwrapRpc(result), error: null });
    } catch (error) {
      setState({ phase: 'error', value: null, error });
    }
  }, [chatUi, connection]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const { EmptyState } = chatUi.components;
  const allAccounts = state.value?.accounts ?? state.value?.bots ?? [];
  const scoped = Boolean(botId);
  const accounts = scoped
    ? allAccounts.filter((account) => (account?.botId ?? account?.id ?? null) === botId)
    : [];
  // 指定了 botId 却没匹配到：明确报出来，绝不退回"显示全部账号"。
  const missing = scoped && state.phase === 'ready' && accounts.length === 0;

  return h(React.Fragment, null,
    // 读状态失败照旧要显示：这个页面上不能只留一行日志。
    state.error ? h('p', { className: 'dchat-error', role: 'alert' }, state.error.message) : null,
    scoped ? null : h(QrLogin, { chatUi, connection, translate: t, onDone: load }),
    missing
      ? h(EmptyState, {
        title: t('找不到这个机器人'),
        description: `${t('它不在当前渠道的名单里（可能已被移除，或 Host 与页面版本不一致）')}：${botId}`,
      })
      : null,
    scoped
      ? accounts.map((account) => h(AccountCard, {
        key: account.botId, account, chatUi, connection, translate: t, onChanged: load,
      }))
      : null);
}

/**
 * Cordis client 插件入口。
 *
 * @param ctx - client 上下文。
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }),
    'dsh-chat-weixin: 双语文案');
  const t = typeof ctx.locale?.bind === 'function'
    ? ctx.locale.bind(LOCALE_NAMESPACE)
    : (key) => zh[key] ?? key;

  ctx.effect(() => ctx.chatChannels.register({
    id: CHANNEL_ID,
    order: 10,
    label: () => t('微信'),
    // 侧边栏会话行的渠道徽标（微信品牌绿）。
    // 图标（SVG 字符串）：左栏渠道卡片与侧边栏会话行徽标共用同一份，避免两处画风不一致。
    // 出处见 THIRD_PARTY_NOTICES.md。
    icon: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><path fill="#07C160" d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>' },
    sessionBadge: { text: '微', color: '#07c160' },
    capabilities: {
      groups: WEIXIN_CAPABILITIES.groups,
      panel: WEIXIN_CAPABILITIES.panel,
      note: t(WEIXIN_CAPABILITIES.note),
      // 微信的渠道设置页就是「扫码接入」：入口名与空状态说明都由渠道给（hub 不认识这些语义）。
      setup: {
        label: t(WEIXIN_CAPABILITIES.setup.label),
        hint: t(WEIXIN_CAPABILITIES.setup.hint),
      },
    },
  }), 'dsh-chat-weixin: 渠道元数据');

  ctx.effect(() => ctx.slots.inject(PAGE_SLOT, () => ctx.slots.register({
    name: PAGE_SLOT,
    key: CHANNEL_ID,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ chatUi: ctx.chatUi, connection: ctx.connection, translate: t }),
  }, WeixinPage)), 'dsh-chat-weixin: 渠道设置页');
}
