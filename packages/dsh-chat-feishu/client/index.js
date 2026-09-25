/**
 * dsh-chat-feishu（client 侧）：飞书设置页。
 *
 * 页面里只放"飞书特有"的东西（机器人卡片、连接状态、任务过程展示），
 * 渠道无关的面板（上下文增强等）直接用 hub 的共享组件与 hook。
 *
 * @module dsh-chat-feishu/client
 */

import * as React from 'react';

export const name = 'dsh-chat-feishu-client';

export const inject = ['slots', 'locale', 'connection', 'chatChannels', 'chatUi'];

const CHANNEL_ID = 'feishu';

/**
 * 接入提示（渠道级的「渠道设置」入口已经去掉，所以这句话既是空状态说明、
 * 也是渠道元数据里的 `capabilities.setup.hint`——两处必须是同一句）。
 */
const FEISHU_SETUP_HINT = '本机还没有飞书机器人配置：把飞书应用的凭据加进渠道的 config.json 后重启 dsh（旧版 dsh-im 的配置会在启动时自动导入）。';
/**
 * 飞书**真能提供的来源字段**（`bridge.mjs` 的 `identity` = senderId/chatId/threadId，
 * 加上 channel/conversationType/botId）。
 *
 * `senderName` / `conversationTitle` **两个渠道都没有实现**（schema 里有、没人填）——
 * 列出来就是"勾了永远没值"，所以这里显式不列。
 */
const FEISHU_SOURCE_FIELDS = Object.freeze([
  'channel', 'conversationType', 'senderId', 'chatId', 'threadId', 'botId',
]);

const PAGE_SLOT = 'chat.channel.page';
const LOCALE_NAMESPACE = 'dsh-chat-feishu';

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
  '去开通权限': '去开通权限',
  '属主名单是 *（这台机器人没有属主绕过）：能用它的人完全由下面的「访问策略」决定。': '属主名单是 *（这台机器人没有属主绕过）：能用它的人完全由下面的「访问策略」决定。',
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
  '读不到名单里的名字': '读不到名单里的名字',
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
  '飞书': '飞书',
  '找不到这台机器人': '找不到这台机器人',
  '它不在当前渠道的名单里（可能已被移除，或 Host 与页面版本不一致）': '它不在当前渠道的名单里（可能已被移除，或 Host 与页面版本不一致）',
  '飞书渠道': '飞书渠道',
  '已接入的机器人': '已接入的机器人',
  '读取状态': '读取状态',
  '读取中…': '读取中…',
  '重新连接': '重新连接',
  '移除接入': '移除接入',
  '确认移除': '确认移除',
  '取消': '取消',
  '任务过程展示': '任务过程展示',
  '卡片友好回答': '卡片友好回答',
  '开启卡片友好回答': '开启卡片友好回答',
  // 设置页分组导航：页面一长就得有分类，否则想改一项只能盲滚（分组只做归类与跳转）。
  '设置分类': '设置分类',
  '正在设置': '正在设置',
  '设置场合': '设置场合',
  '只影响私聊会话': '只影响私聊会话',
  '只影响群聊会话': '只影响群聊会话',
  '所有会话的默认值': '所有会话的默认值',
  '运行环境': '运行环境',
  '权限与身份': '权限与身份',
  '呈现方式': '呈现方式',
  '能力': '能力',
  '开着时，回复会按飞书卡片的能力组织（表格、分节、代码块更清楚）；关掉则按普通文本习惯回答。下一条消息生效。':
    '开着时，回复会按飞书卡片的能力组织（表格、分节、代码块更清楚）；关掉则按普通文本习惯回答。下一条消息生效。',
  '设置执行过程的呈现方式；私聊与群聊分别生效': '设置执行过程的呈现方式；私聊与群聊分别生效',
  '不显示过程（只发送最终答案）': '不显示过程（只发送最终答案）',
  '适合日常问答：不显示工具调用等中间步骤，最终答案仍用一张卡片回复，表格与代码块保留格式':
    '适合日常问答：不显示工具调用等中间步骤，最终答案仍用一张卡片回复，表格与代码块保留格式',
  '实时过程卡（全程一张卡片动态更新）': '实时过程卡（全程一张卡片动态更新）',
  '推荐长任务使用：过程与最终答案都在同一张卡片里实时更新，不刷屏':
    '推荐长任务使用：过程与最终答案都在同一张卡片里实时更新，不刷屏',
  '逐步直播（每一步单独发一条消息）': '逐步直播（每一步单独发一条消息）',
  '每一步都单独发一条消息（含工具调用）；长任务会连续发送较多消息':
    '每一步都单独发一条消息（含工具调用）；长任务会连续发送较多消息',
  'lark-cli 身份': 'lark-cli 身份',
  '这台机器人调 lark-cli 时用哪个身份；飞书渠道的收发仍走官方 SDK': '这台机器人调 lark-cli 时用哪个身份；飞书渠道的收发仍走官方 SDK',
  '按场合配置能用哪些身份：就近覆盖（指定群/人 → 群聊/私聊 → 全局）；飞书渠道的收发仍走官方 SDK':
    '按场合配置能用哪些身份：就近覆盖（指定群/人 → 群聊/私聊 → 全局）；飞书渠道的收发仍走官方 SDK',
  '应用身份': '应用身份',
  '用户身份': '用户身份',
  '继承上一层': '继承上一层',
  '仅应用身份': '仅应用身份',
  '仅用户身份': '仅用户身份',
  '应用 + 用户': '应用 + 用户',
  '都不允许': '都不允许',
  '两个身份可以同时允许。选「继承上一层」表示这一层不单独设置，听上一层的（群聊/私聊继承全局，指定条目自己说了算）。':
    '两个身份可以同时允许。选「继承上一层」表示这一层不单独设置，听上一层的（群聊/私聊继承全局，指定条目自己说了算）。',
  '注意：允许用户身份只是「允许以用户身份调用」，实际用的仍是下面「登录人」那一个——lark-cli 一份 profile 只有一个登录人，不会按发言人自动切换。':
    '注意：允许用户身份只是「允许以用户身份调用」，实际用的仍是下面「登录人」那一个——lark-cli 一份 profile 只有一个登录人，不会按发言人自动切换。',
  '指定群或人': '指定群或人',
  '还没有指定设置：所有会话都按上面的分类与全局生效。': '还没有指定设置：所有会话都按上面的分类与全局生效。',
  '群': '群',
  '人': '人',
  '还没有会话可选：这台机器人跟人聊过之后，会话会出现在这里。':
    '还没有会话可选：这台机器人跟人聊过之后，会话会出现在这里。',
  '调用身份': '调用身份',
  '只用应用身份（bot）': '只用应用身份（bot）',
  '允许用户身份（--as user）': '允许用户身份（--as user）',
  '以应用自己的身份调 lark-cli，只能访问这台机器人自己的资源': '以应用自己的身份调 lark-cli，只能访问这台机器人自己的资源',
  '以某个人的名义调 lark-cli（能读写他的云文档、日历等个人资源）；开启前需要确认，并会钉住当前登录的人': '以某个人的名义调 lark-cli（能读写他的云文档、日历等个人资源）；开启前需要确认，并会钉住当前登录的人',
  'lark-cli 里的 profile': 'lark-cli 里的 profile',
  'lark-cli 里还没有这台机器人的 profile（真正调用时会自动创建）': 'lark-cli 里还没有这台机器人的 profile（真正调用时会自动创建）',
  '读取 lark-cli 状态失败：': '读取 lark-cli 状态失败：',
  '应用身份：': '应用身份：',
  '用户身份：': '用户身份：',
  '可用': '可用',
  '不可用': '不可用',
  '登录人：': '登录人：',
  '没有用户登录': '没有用户登录',
  '确认开启': '确认开启',
  '已取消，未做任何改动。': '已取消，未做任何改动。',
  '已保存。': '已保存。',
  '重读 lark-cli 状态': '重读 lark-cli 状态',
  '已处理消息': '已处理消息',
  '没有已接入的飞书机器人': '没有已接入的飞书机器人',
  '本机还没有飞书机器人配置。': '本机还没有飞书机器人配置。',
  '状态': '状态',
  '启动中': '启动中',
  '运行正常': '运行正常',
  '启动失败': '启动失败',
  '已停止': '已停止',
  '正在运行': '正在运行',
  // hub 的共享组件（上下文增强编辑器）用本渠道的 t 取文案，因此这些键必须在渠道字典里。
  '保存': '保存',
  '保存中…': '保存中…',
  '新建机器人接入': '新建机器人接入',
  '两种方式：扫码新建一个飞书机器人（推荐，扫码的人就是属主），或手动填已有机器人的凭据。': '两种方式：扫码新建一个飞书机器人（推荐，扫码的人就是属主），或手动填已有机器人的凭据。',
  '扫码新建机器人': '扫码新建机器人',
  '点下面的按钮会向飞书申请一个一次性授权链接：用飞书扫一扫，或在浏览器里打开它，就会自动创建应用并接入。': '点下面的按钮会向飞书申请一个一次性授权链接：用飞书扫一扫，或在浏览器里打开它，就会自动创建应用并接入。',
  '扫码后的确认页会列出这台机器人需要的权限（已经替你选好），确认一次就一起开通；个别权限要管理员审批、应用发布后才生效。': '扫码后的确认页会列出这台机器人需要的权限（已经替你选好），确认一次就一起开通；个别权限要管理员审批、应用发布后才生效。',
  '手动接入已有机器人': '手动接入已有机器人',
  '打开授权页面': '打开授权页面',
  '这台 Host 没能生成二维码，请点上面的链接继续。': '这台 Host 没能生成二维码，请点上面的链接继续。',
  '剩余': '剩余',
  '正在向飞书申请二维码…': '正在向飞书申请二维码…',
  '已授权，正在启动机器人…': '已授权，正在启动机器人…',
  '等待扫码': '等待扫码',
  '等待你在飞书里确认…': '等待你在飞书里确认…',
  '二维码已失效，请重新生成': '二维码已失效，请重新生成',
  '扫码接入失败': '扫码接入失败',
  '已取消': '已取消',
  '重新生成二维码': '重新生成二维码',
  '填自建应用的 App ID 与 App Secret（飞书开放平台 → 凭证与基础信息）。应用需要开启机器人能力。': '填自建应用的 App ID 与 App Secret（飞书开放平台 → 凭证与基础信息）。应用需要开启机器人能力。',
  '应用凭证里的 App Secret': '应用凭证里的 App Secret',
  '域名': '域名',
  '飞书（open.feishu.cn）': '飞书（open.feishu.cn）',
  'Lark（open.larksuite.com）': 'Lark（open.larksuite.com）',
  '属主 open_id（可留空）': '属主 open_id（可留空）',
  '属主留空 = 这台机器人暂时没有属主：接入后私聊会被设为「任何人可用」，属主先跟它说一句话，再回它的设置里把自己选成属主。': '属主留空 = 这台机器人暂时没有属主：接入后私聊会被设为「任何人可用」，属主先跟它说一句话，再回它的设置里把自己选成属主。',
  '接入': '接入',
  '接入中…': '接入中…',
  '私聊访问策略没能自动放宽': '私聊访问策略没能自动放宽',
  '已接入': '已接入',
  '点左上角「返回」就能在列表里看到它。': '点左上角「返回」就能在列表里看到它。',
  '保存失败，请重试。': '保存失败，请重试。',
  '最近一次错误': '最近一次错误',
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
  '显示项': 'Section',
  '控制面板显示项': 'Control panel sections',
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
  '去开通权限': 'Grant the permission',
  '属主名单是 *（这台机器人没有属主绕过）：能用它的人完全由下面的「访问策略」决定。':
    'The owner list is * (this bot has no owner bypass): who may use it is decided entirely by the access policy below.',
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
  '读不到名单里的名字': 'Could not resolve names for the allowlist',
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
  '飞书': 'Feishu',
  '找不到这台机器人': 'Bot not found',
  '它不在当前渠道的名单里（可能已被移除，或 Host 与页面版本不一致）':
    "It is not in this channel's bot list (it may have been removed, or the Host and the page are on different versions)",
  '飞书渠道': 'Feishu channel',
  '已接入的机器人': 'Connected bots',
  '读取状态': 'Reload',
  '读取中…': 'Loading…',
  '重新连接': 'Reconnect',
  '移除接入': 'Remove',
  '确认移除': 'Confirm removal',
  '取消': 'Cancel',
  '任务过程展示': 'Task progress display',
  '卡片友好回答': 'Card-friendly answers',
  '开启卡片友好回答': 'Enable card-friendly answers',
  '只影响私聊会话': 'Affects direct chats only',
  '只影响群聊会话': 'Affects group chats only',
  '所有会话的默认值': 'Default for all chats',
  '运行环境': 'Runtime',
  '权限与身份': 'Access & identity',
  '呈现方式': 'Presentation',
  '能力': 'Capabilities',
  '开着时，回复会按飞书卡片的能力组织（表格、分节、代码块更清楚）；关掉则按普通文本习惯回答。下一条消息生效。':
    'When on, replies are written for Feishu cards (clearer tables, sections and code blocks); '
    + 'when off they follow plain-text habits. Takes effect from the next message.',
  '设置执行过程的呈现方式；私聊与群聊分别生效':
    'Choose how the execution is presented; direct and group chats are configured separately',
  '不显示过程（只发送最终答案）': 'Hide the process (final answer only)',
  '适合日常问答：不显示工具调用等中间步骤，最终答案仍用一张卡片回复，表格与代码块保留格式':
    'For everyday Q&A: interim steps stay hidden; the final answer still arrives as a card, '
    + 'keeping tables and code blocks formatted',
  '实时过程卡（全程一张卡片动态更新）': 'Live process card (one card updated throughout)',
  '推荐长任务使用：过程与最终答案都在同一张卡片里实时更新，不刷屏':
    'Recommended for long tasks: process and answer update in one card without flooding the chat',
  '逐步直播（每一步单独发一条消息）': 'Step-by-step feed (one message per step)',
  '每一步都单独发一条消息（含工具调用）；长任务会连续发送较多消息':
    'Every step is its own message; long tasks send many messages',
  'lark-cli 身份': 'lark-cli identity',
  '这台机器人调 lark-cli 时用哪个身份；飞书渠道的收发仍走官方 SDK': 'Which identity this bot uses when calling lark-cli; message send/receive still goes through the official SDK',
  '按场合配置能用哪些身份：就近覆盖（指定群/人 → 群聊/私聊 → 全局）；飞书渠道的收发仍走官方 SDK':
    'Choose which identities are allowed per context: nearest wins (specific chats/people → group/direct → global); send/receive still goes through the official SDK',
  '应用身份': 'Application identity',
  '用户身份': 'User identity',
  '继承上一层': 'Inherit from above',
  '仅应用身份': 'Application only',
  '仅用户身份': 'User only',
  '应用 + 用户': 'Application + user',
  '都不允许': 'Neither allowed',
  '两个身份可以同时允许。选「继承上一层」表示这一层不单独设置，听上一层的（群聊/私聊继承全局，指定条目自己说了算）。':
    'Both identities can be allowed at once. "Inherit from above" means this level is not set separately: group/direct inherit global, and specific entries always decide for themselves.',
  '注意：允许用户身份只是「允许以用户身份调用」，实际用的仍是下面「登录人」那一个——lark-cli 一份 profile 只有一个登录人，不会按发言人自动切换。':
    'Note: allowing the user identity only permits calling as a user; the actual user is still the signed-in person shown below — one lark-cli profile holds a single signed-in user, so it never switches per sender.',
  '指定群或人': 'Specific chats or people',
  '还没有指定设置：所有会话都按上面的分类与全局生效。':
    'No specific entries yet: every conversation follows the levels above.',
  '群': 'Group',
  '人': 'Person',
  '还没有会话可选：这台机器人跟人聊过之后，会话会出现在这里。':
    'No conversations to pick yet: they appear here once this bot has chatted with someone.',
  '调用身份': 'Identity',
  '只用应用身份（bot）': 'Application identity only (bot)',
  '允许用户身份（--as user）': 'Allow user identity (--as user)',
  '以应用自己的身份调 lark-cli，只能访问这台机器人自己的资源': 'Calls lark-cli as the app itself; only this bot own resources are reachable',
  '以某个人的名义调 lark-cli（能读写他的云文档、日历等个人资源）；开启前需要确认，并会钉住当前登录的人': 'Calls lark-cli on behalf of a person (their docs, calendar and other personal resources); enabling needs confirmation and pins the currently signed-in user',
  'lark-cli 里的 profile': 'Profile in lark-cli',
  'lark-cli 里还没有这台机器人的 profile（真正调用时会自动创建）': 'lark-cli has no profile for this bot yet (created automatically on first real call)',
  '读取 lark-cli 状态失败：': 'Failed to read lark-cli status: ',
  '应用身份：': 'App identity: ',
  '用户身份：': 'User identity: ',
  '可用': 'available',
  '不可用': 'not available',
  '登录人：': 'Signed-in user: ',
  '没有用户登录': 'no user signed in',
  '确认开启': 'Confirm',
  '已取消，未做任何改动。': 'Cancelled; nothing changed.',
  '已保存。': 'Saved.',
  '重读 lark-cli 状态': 'Re-read lark-cli status',
  '已处理消息': 'Messages handled',
  '没有已接入的飞书机器人': 'No Feishu bot connected',
  '本机还没有飞书机器人配置。': 'This Host has no Feishu bot configured yet.',
  '状态': 'State',
  '启动中': 'Starting',
  '运行正常': 'Connected',
  '启动失败': 'Failed',
  '已停止': 'Stopped',
  '正在运行': 'Running',
  '保存': 'Save',
  '保存中…': 'Saving…',
  '新建机器人接入': 'Add a bot',
  '两种方式：扫码新建一个飞书机器人（推荐，扫码的人就是属主），或手动填已有机器人的凭据。': 'Two ways: scan to create a new Feishu bot (recommended — whoever scans becomes the owner), or paste the credentials of an existing bot.',
  '扫码新建机器人': 'Scan to create a bot',
  '点下面的按钮会向飞书申请一个一次性授权链接：用飞书扫一扫，或在浏览器里打开它，就会自动创建应用并接入。': 'This requests a one-time authorization link from Feishu. Scan it with Feishu (or open it in your browser) and a new app is created and connected automatically.',
  '扫码后的确认页会列出这台机器人需要的权限（已经替你选好），确认一次就一起开通；个别权限要管理员审批、应用发布后才生效。': 'The confirmation page lists the permissions this bot needs, already selected for you — one confirmation grants them together. A few may need admin approval and take effect once the app is published.',
  '手动接入已有机器人': 'Connect an existing bot manually',
  '打开授权页面': 'Open the authorization page',
  '这台 Host 没能生成二维码，请点上面的链接继续。': 'This Host could not render the QR code — use the link above instead.',
  '剩余': 'expires in',
  '正在向飞书申请二维码…': 'Requesting the QR code from Feishu…',
  '已授权，正在启动机器人…': 'Authorized — starting the bot…',
  '等待扫码': 'Waiting for the scan',
  '等待你在飞书里确认…': 'Waiting for you to confirm in Feishu…',
  '二维码已失效，请重新生成': 'The link expired — generate a new one',
  '扫码接入失败': 'Scan-based setup failed',
  '已取消': 'Cancelled',
  '重新生成二维码': 'Generate a new QR code',
  '填自建应用的 App ID 与 App Secret（飞书开放平台 → 凭证与基础信息）。应用需要开启机器人能力。': 'Paste the App ID and App Secret of your own app (Feishu Open Platform → Credentials & Basic Info). The app must have the bot capability enabled.',
  '应用凭证里的 App Secret': 'The App Secret from the app credentials',
  '域名': 'Domain',
  '飞书（open.feishu.cn）': 'Feishu (open.feishu.cn)',
  'Lark（open.larksuite.com）': 'Lark (open.larksuite.com)',
  '属主 open_id（可留空）': 'Owner open_id (optional)',
  '属主留空 = 这台机器人暂时没有属主：接入后私聊会被设为「任何人可用」，属主先跟它说一句话，再回它的设置里把自己选成属主。': 'Leave the owner empty and this bot starts with no owner. Direct chats are then set to "anyone" so the owner can say hello first, and pick themselves as owner afterwards in this bot’s settings.',
  '接入': 'Add',
  '接入中…': 'Adding…',
  '私聊访问策略没能自动放宽': 'Could not relax the direct-chat access policy',
  '已接入': 'Added',
  '点左上角「返回」就能在列表里看到它。': 'Click Back at the top left to see it in the list.',
  '保存失败，请重试。': 'Could not save. Try again.',
  '最近一次错误': 'Last error',
};

const h = React.createElement;

const STATE_TEXT = {
  starting: '启动中',
  running: '运行正常',
  failed: '启动失败',
  stopped: '已停止',
};

const STEP_PUSH_OPTIONS = [
  {
    value: 'off',
    label: '不显示过程（只发送最终答案）',
    help: '适合日常问答：不显示工具调用等中间步骤，最终答案仍用一张卡片回复，表格与代码块保留格式',
  },
  {
    value: 'streaming_card',
    label: '实时过程卡（全程一张卡片动态更新）',
    help: '推荐长任务使用：过程与最终答案都在同一张卡片里实时更新，不刷屏',
  },
  {
    value: 'post',
    label: '逐步直播（每一步单独发一条消息）',
    help: '每一步都单独发一条消息（含工具调用）；长任务会连续发送较多消息',
  },
];

/**
 * lark-cli 身份：分层配置每个场合能用哪些身份。
 *
 * 为什么要有它：早期只有一个机器人级开关，而"谁能用用户身份"实际按场合变——
 * 私聊可以放开、几百人的大群不该放开；同一个群里也常常只信得过某一个人。
 * 所以配置分四层、**就近覆盖**：指定群/指定人 → 群聊/私聊分类 → 全局。
 * 每层两个开关（应用身份 / 用户身份）互相独立。
 *
 * **语义边界**：某一层打开"用户身份"只是"**允许**以用户身份调用"，
 * 不会因为发言人变了就自动换成那个人的授权——lark-cli 一个 appId 只有一份 profile，
 * 实际是谁由 host 侧 `assertIdentity` 核对（就是卡片下方"登录人"那一行）。
 */

/** 一层里两个开关的说明（顺序固定：应用身份在前）。 */
const LARK_IDENTITY_SWITCHES = Object.freeze([
  {
    key: 'bot',
    label: '应用身份',
    help: '以应用自己的身份调 lark-cli（--as bot），只能访问这台机器人自己的资源',
  },
  {
    key: 'user',
    label: '用户身份',
    help: '允许以 lark-cli 里登录的那个人调 lark-cli（--as user，能读写他的云文档、日历等个人资源）',
  },
]);

/**
 * 分类层在界面上的合法取值（私聊 / 群聊）。
 *
 * ⚠️ 现在**不直接拿它一次画全部**：场合由页面级切换器选定后，这一项只画
 * 「全局 + 当前场合」两层（见 `LarkIdentityEditor` 里分层下拉的注释）——
 * 之所以不一次画全，是因为"继承上一层"的语义要求**看得见上一层**，
 * 把上一层藏起来用户就没法判断自己会继承到什么。
 */
const LARK_IDENTITY_SCOPES = Object.freeze([
  { key: 'direct', label: '私聊' },
  { key: 'group', label: '群聊' },
]);
// 分类层的键（"指定设置"按这两类命中：群 / 人）。
const LARK_SCOPE_KEYS = LARK_IDENTITY_SCOPES.map((item) => item.key);

/**
 * 层键 → 界面名称。**含全局层**：页面级场合切换器给的就是这三层之一，
 * 而 `LARK_IDENTITY_SCOPES` 只含两个**分类层**（"指定设置"按它们分类）。
 * 两者不是一回事，混用会让 `scope === 'global'` 被误判成"认不出的层"而落回私聊。
 */
const LARK_LAYER_LABELS = Object.freeze({
  global: '全局',
  direct: '私聊',
  group: '群聊',
});
/** 合法的层键（三层）。 */
const LARK_LAYER_KEYS = Object.keys(LARK_LAYER_LABELS);

/**
 * 一层的取值只有"继承上一层"或"两个开关的 4 种组合"，共 5 个选项。
 *
 * 用下拉而不是两个勾选框：**"没配（继承）"这个状态必须能表达**，
 * 两个孤立的勾选框表达不了"我这一层不管、听上层的"。
 */
const LARK_SCOPE_CHOICES = Object.freeze([
  { value: 'inherit', label: '继承上一层', bot: null, user: null },
  { value: 'bot', label: '仅应用身份', bot: true, user: false },
  { value: 'user', label: '仅用户身份', bot: false, user: true },
  { value: 'both', label: '应用 + 用户', bot: true, user: true },
  { value: 'none', label: '都不允许', bot: false, user: false },
]);

/** 一层取值 → 下拉选项值。 */
function scopeChoiceOf(scope) {
  if (!scope) return 'inherit';
  if (scope.bot && scope.user) return 'both';
  if (scope.bot) return 'bot';
  if (scope.user) return 'user';
  return 'none';
}

/** 下拉选项值 → 一层取值（继承为 null）。 */
function scopeFromChoice(choice) {
  const found = LARK_SCOPE_CHOICES.find((item) => item.value === choice);
  if (!found || found.value === 'inherit') return null;
  return { bot: found.bot, user: found.user };
}

/**
 * 界面上的条目列表 → host 认的 `targets`。
 *
 * 群聊里的"人"必须带 chatId（B 方案按"群 + 人"组合命中）——从会话列表里选时
 * 天然带着这个信息，所以界面上不让手填 id。
 */
function targetsFromRows(rows) {
  return rows.map((row) => (row.kind === 'group'
    ? { kind: 'group', id: row.id, label: row.label ?? null, bot: row.bot === true, user: row.user === true }
    : {
      kind: 'user',
      id: row.id,
      chatId: row.chatId ?? null,
      label: row.label ?? null,
      bot: row.bot === true,
      user: row.user === true,
    }));
}

/**
 * 「lark-cli 身份」设置块（分层）。
 *
 * 允许用户身份是**放权**（能以某个人的名义读写他的个人资源），所以照访问策略那条口径：
 * 服务端不带 `confirm: true` 就只回 `requiresConfirm`、**一个字节都不写**，确认画在同一张卡上。
 *
 * @param props - { botId, value, conversations, chatUi, connection, translate, onChanged }。
 * @returns React 元素。
 */
function LarkIdentityEditor({ botId, value, conversations, chatUi, connection, translate, onChanged, scope = 'direct' }) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  // HelpHint 由 hub 经 chatUi 下发（渠道包不许 import hub 包）。
  const { Panel, HelpHint } = chatUi.components;
  const [probe, setProbe] = React.useState({ phase: 'loading', value: null, error: null });
  const [pending, setPending] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  /** 待新增的指定设置（从会话里选）。 */
  const [draftTarget, setDraftTarget] = React.useState('');

  /** 只读体检：lark-cli 里到底有没有这台机器人的 profile、现在会以谁的身份说话。 */
  const load = React.useCallback(async () => {
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'bot.lark-identity.get', { botId });
      setProbe({ phase: 'ready', value: chatUi.unwrapRpc(result), error: null });
    } catch (cause) {
      // 读失败与"没开启/没登录"是两回事：读失败必须如实说，不能显示成默认值。
      setProbe({ phase: 'failed', value: null, error: cause?.message ?? String(cause) });
    }
  }, [botId, chatUi, connection]);

  React.useEffect(() => { void load(); }, [load]);

  /**
   * 保存一份新的分层策略。
   *
   * 传的是**整份** `identity`（界面本来就持有全量）：字段级合并在"删掉一条指定设置"
   * 时无法表达"就是要删掉"，反而更难用。
   */
  const submit = async (identity, { confirm = false } = {}) => {
    setBusy(true);
    setError(null);
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'bot.lark-identity.set', {
        botId, identity, confirm,
      });
      const applied = chatUi.unwrapRpc(result);
      if (applied?.requiresConfirm === true) {
        setPending({ identity, prompt: applied.confirmPrompt ?? applied.message ?? '' });
        setNotice(null);
        return;
      }
      setPending(null);
      setNotice(applied?.message ?? t('已保存。'));
      await load();
      await onChanged?.();
    } catch (cause) {
      setError(cause?.message ?? String(cause));
    } finally {
      setBusy(false);
    }
  };

  /**
   * 当前层：页面级场合就是这一项要编辑的层（三层都合法）。
   * 认不出时按私聊（保守：私聊的放开面最小）。
   */
  const activeScope = LARK_LAYER_KEYS.includes(scope) ? scope : 'direct';
  const scopes = value ?? { global: { bot: true, user: false }, direct: null, group: null, targets: [] };
  const targets = Array.isArray(scopes.targets) ? scopes.targets : [];
  const info = probe.value;
  const line = (label, text) => h('div', { className: 'dchat-scopeRow' },
    h('span', { className: 'dchat-scopeLabel' }, label),
    h('span', { className: 'dchat-cardDescription' }, text));
  const identityText = (entry, empty) => {
    if (!entry) return empty;
    if (entry.error) return `${t('不可用')}（${entry.error.code}）`;
    if (entry.available === false) return t('不可用');
    return t('可用');
  };

  /** 改某一层的取值并立即保存。 */
  const chooseScope = (key, choice) => {
    setPending(null);
    void submit({ ...scopes, [key]: scopeFromChoice(choice) });
  };

  /** 改某条指定设置的取值。 */
  const chooseTarget = (index, choice) => {
    setPending(null);
    const next = targets.map((target, at) => (
      at === index ? { ...target, ...(scopeFromChoice(choice) ?? { bot: false, user: false }) } : target
    ));
    void submit({ ...scopes, targets: next });
  };

  const removeTarget = (index) => {
    setPending(null);
    void submit({ ...scopes, targets: targets.filter((_, at) => at !== index) });
  };

  /** 从会话列表里加一条指定设置。 */
  const addTarget = () => {
    if (!draftTarget) return;
    const picked = (conversations ?? []).find((item) => item.value === draftTarget);
    if (!picked) return;
    setDraftTarget('');
    setPending(null);
    void submit({
      ...scopes,
      targets: [...targets, {
        kind: picked.kind,
        id: picked.id,
        chatId: picked.chatId ?? null,
        label: picked.label ?? null,
        // 新条目默认"仅应用身份"：加一条时最可能是想收窄，而不是放权。
        bot: true,
        user: false,
      }],
    });
  };

  /** 一层下拉的渲染（标签 + 下拉 + 该层帮助文案）。 */
  const scopeRow = ({ key, label, id }) => {
    const choice = scopeChoiceOf(scopes[key]);
    return h('div', { key, className: 'dchat-scopeRow' },
      h('label', { className: 'dchat-scopeLabel', htmlFor: id }, t(label)),
      h('select', {
        id,
        className: 'dchat-select',
        // 布局守门按这个属性核对"控件状态确实来自假数据"。
        'data-lark-scope': `${key}:${choice}`,
        value: choice,
        disabled: busy,
        onChange: (event) => chooseScope(key, event.target.value),
      // 全局层上面没有层了，"继承上一层"对它没有意义（选了会落回默认，看着像没生效）。
      }, LARK_SCOPE_CHOICES
        .filter((option) => !(key === 'global' && option.value === 'inherit'))
        .map((option) => h('option', {
          key: option.value,
          value: option.value,
        }, t(option.label)))));
  };

  return h(Panel, {
    title: t('lark-cli 身份'),
    /**
     * 说明 + 问号**同一行**。
     *
     * 早先问号被单独放在一个 div 里，渲染出来就是孤零零一个圆点（真机截图反馈
     * "这行只有个问号"）——说明文字与它的入口必须挨在一起，用户才知道问的是什么。
     */
    description: [
      t('这台机器人调 lark-cli 时能用哪些身份。'),
      h(HelpHint, {
        translate: t,
        label: t('lark-cli 身份'),
        help: [
          t('就近覆盖：指定群/人 → 群聊/私聊 → 全局。选了「继承上一层」的那一层不单独设置，听上层的。'),
          t('两个身份可以同时允许，也可以都不允许。'),
          // 两个身份的含义由 LARK_IDENTITY_SWITCHES 提供（单一来源，别在两处各写一份）。
          ...LARK_IDENTITY_SWITCHES.map((item) => `${t(item.label)}：${t(item.help)}`),
          t('允许用户身份只是「允许以用户身份调用」，实际用的仍是下面「登录人」那一个——lark-cli 一份 profile 只有一个登录人，不会按发言人自动切换。'),
          t('飞书渠道自己的收发消息始终走官方 SDK，与这里的身份无关。'),
        ],
      }),
    ],
    actions: h('button', {
      type: 'button',
      className: 'dchat-button',
      disabled: busy,
      onClick: () => { void load(); },
    }, t('重读 lark-cli 状态')),
  },
    /**
     * **只画当前那一层**——与页面上其余设置项完全一致。
     *
     * 早先这里是"全局 + 当前层"两层同屏（理由是"选了继承要看得见上一层"），
     * 但真机反馈这**自相矛盾**：切到"全局"时卡里冒出一个"私聊"下拉，
     * 切到"私聊"时又冒出"全局"——用户以为主体切换器坏了。
     * 想知道上一层是什么，切到那个层看即可（全页一致的行为）。
     */
    h('div', { className: 'dchat-scopeGrid' },
      scopeRow({
        key: activeScope,
        label: LARK_LAYER_LABELS[activeScope],
        id: `lark-scope-${activeScope}-${botId}`,
      })),
    /**
     * 两段长解释收进问号：它们是"想知道再看"的背景（层怎么覆盖、用户身份的语义边界），
     * 常驻会让这张卡在整页最长的基础上再长两行——而这两行没有任何可操作的东西。
     */

    // 指定群 / 指定人：按会话列表选，不手填 id。
    h('h4', { className: 'dchat-scopeLabel' }, t('指定群或人')),
    targets.length === 0
      ? h('p', { className: 'dchat-cardDescription' }, t('还没有指定设置'))
      : h('div', null, targets.map((target, index) => h('div', {
        key: `${target.kind}:${target.chatId ?? ''}:${target.id}`,
        className: 'dchat-scopeRow',
      },
      h('label', { className: 'dchat-scopeLabel', htmlFor: `lark-target-${index}-${botId}` },
        `${target.kind === 'group' ? t('群') : t('人')}·${target.label ?? target.id}`),
      h('select', {
        id: `lark-target-${index}-${botId}`,
        className: 'dchat-select',
        'data-lark-target': `${index}:${scopeChoiceOf(target)}`,
        value: scopeChoiceOf(target),
        disabled: busy,
        // 条目级的"继承"没有意义（它就是要覆盖上层），所以只给 4 种组合。
        onChange: (event) => chooseTarget(index, event.target.value),
      }, LARK_SCOPE_CHOICES.filter((option) => option.value !== 'inherit').map((option) => h('option', {
        key: option.value,
        value: option.value,
      }, t(option.label)))),
      h('button', {
        type: 'button',
        className: 'dchat-button',
        disabled: busy,
        onClick: () => removeTarget(index),
      }, t('删除'))))),

    h('div', { className: 'dchat-scopeRow' },
      h('select', {
        className: 'dchat-select',
        value: draftTarget,
        disabled: busy,
        'aria-label': t('从会话里选…'),
        onChange: (event) => setDraftTarget(event.target.value),
      },
      h('option', { value: '' }, t('从会话里选…')),
      (conversations ?? []).map((item) => h('option', { key: item.value, value: item.value }, item.label))),
      h('button', {
        type: 'button',
        className: 'dchat-button',
        disabled: busy || !draftTarget,
        onClick: () => addTarget(),
      }, t('新增'))),
    (conversations ?? []).length === 0
      ? h('p', { className: 'dchat-cardDescription' }, t('还没有会话可选：这台机器人跟人聊过之后，会话会出现在这里。'))
      : null,

    pending ? h('div', { className: 'dchat-warning', role: 'alert' },
      h('p', null, pending.prompt),
      h('div', { className: 'dchat-actions' },
        h('button', {
          type: 'button',
          className: 'dchat-button dchat-buttonPrimary',
          disabled: busy,
          onClick: () => { void submit(pending.identity, { confirm: true }); },
        }, t('确认开启')),
        h('button', {
          type: 'button',
          className: 'dchat-button',
          disabled: busy,
          onClick: () => {
            setPending(null);
            setNotice(t('已取消，未做任何改动。'));
          },
        }, t('取消')))) : null,
    notice ? h('p', { className: 'dchat-cardDescription', role: 'status' }, notice) : null,
    error ? h('p', { className: 'dchat-error', role: 'alert' }, error) : null,
    probe.phase === 'failed'
      ? h('p', { className: 'dchat-error', role: 'alert' }, `${t('读取 lark-cli 状态失败：')}${probe.error}`)
      : null,
    /**
     * 体检结果**压成一行小字**：原来是三行「标签 + 值」（profile / 应用身份 / 用户身份），
     * 值里还带完整 profile 名与 open_id——那是排查用的信息，不是日常要读的。
     * 现在一行说清"profile 在不在 + 两个身份能不能用 + 登录的是谁"，完整值收进 title。
     */
    probe.phase === 'ready' && info
      ? h('p', {
        className: 'dchat-cardDescription dchat-larkStatus',
        title: [
          info.profile?.found ? `${info.profile.name ?? '?'} (${info.profile.appId ?? '?'})` : null,
          info.larkCli?.user?.onBehalfOf?.openId ?? null,
        ].filter(Boolean).join(' · '),
      }, [
        info.profile?.found ? t('profile 已就绪') : t('profile 尚未创建'),
        info.larkCli ? `${t('应用身份')} ${identityText(info.larkCli.bot, t('不可用'))}` : null,
        info.larkCli
          ? (info.larkCli.user?.onBehalfOf?.openId
            ? `${t('登录人')} ${info.larkCli.user.onBehalfOf.userName ?? info.larkCli.user.onBehalfOf.openId}`
            : `${t('用户身份')} ${identityText(info.larkCli.user, t('没有用户登录'))}`)
          : null,
      ].filter(Boolean).join(' · '))
      : null,
  );
}

// 导出给布局守门用：整张渠道卡在窄栏下的真实渲染（真机炸过「卡片头逐字竖排」）。
export function BotCard({ bot, status, chatUi, connection, translate, onChanged }) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  const { Panel, StatusPill, ScopedModeEditor, ContextEnhancementEditor,
    DeliveryTargetsEditor, WorkspaceEditor, PresetEditor, ModelEditor,
    AccessPolicyEditor, OwnerEditor, PanelSectionsEditor, SettingGroups,
    ScopeSwitcher } = chatUi.components;
  const settings = chatUi.hooks.useBotSettings({
    connection, channelId: CHANNEL_ID, botId: bot.id,
  });
  // 可选项（这台机器人用过的目录、Host 的 Agent Preset 列表）进来读一次。
  React.useEffect(() => {
    void settings.loadOptions();
  }, [settings.loadOptions]);
  /**
   * 会话 → 该应用的**平台 id**（`ou_…` / `oc_…`）。
   *
   * 这一步只有渠道能做：`route` 的字段名是平台概念（飞书是 openId/chatId，微信是 userId）。
   * 属主与「指定用户/指定群」要的都是平台 id，而投递目标的 id（`p2p_ou_…`）**不是**——
   * 混用会被 host 的校验挡下（属主）或永远匹配不上（上下文增强，静默失效）。
   */
  const sessions = chatUi.hooks.useConversations({
    connection, channelId: CHANNEL_ID, botId: bot.id,
  }).conversations
    .map((item) => ({
      id: item.kind === 'group' ? item.route?.chatId : item.route?.openId,
      name: item.name,
      kind: item.kind,
    }))
    .filter((item) => typeof item.id === 'string' && item.id);

  /**
   * 「lark-cli 身份」的指定设置候选项。
   *
   * 会话列表来自可投递目标，**群条目只有 chatId、没有"群里的人"**（群成员要另打接口，
   * 设置页不该为一个下拉去翻通讯录）。所以这里只能给出两类候选：
   * - 每个群 → `kind:'group'`（对群里所有人生效）；
   * - 每个私聊 → `kind:'user'`（只对这个人的私聊生效）。
   *
   * **群里的"某个人"这一类，界面暂时给不出来**：它需要"群 id + 人 id"两个值，
   * 而会话列表提供不了人 id。host 与门禁是支持的（命中方式已是组合键），
   * 这类条目要靠配置文件的 `targets` 手工补，或在 bridge 里记下群发言人后再补。
   */
  const identityTargets = [];
  const seenTargets = new Set();
  for (const item of chatUi.hooks.useConversations({ connection, channelId: CHANNEL_ID, botId: bot.id }).conversations) {
    const chatId = item.route?.chatId;
    const openId = item.route?.openId;
    const push = (entry) => {
      const key = `${entry.kind}:${entry.chatId ?? ''}:${entry.id}`;
      if (seenTargets.has(key)) return;
      seenTargets.add(key);
      identityTargets.push({ ...entry, value: key });
    };
    if (item.kind === 'group') {
      if (typeof chatId === 'string' && chatId) {
        push({ kind: 'group', id: chatId, label: item.name || chatId });
      }
      continue;
    }
    if (typeof openId === 'string' && openId) {
      push({ kind: 'user', id: openId, label: item.name || openId });
    }
  }
  /**
   * 访问策略白名单里那些 id 是谁。
   *
   * 名单里存的只有 `ou_…` / `oc_…`：设置页上只显示 id 的话，一排 id 认不出是谁、
   * 也看不出加错了人（真机反馈"群了白名单 只显示 id 不显示名称，不方便管理"）。
   * 换名字只有渠道能做（要 `contact` / `im:chat:readonly` 权限），所以这一步放在渠道里，
   * 共享的编辑器只负责画"名字 + id"。查不到就退回只显示 id，并把原因写在下面。
   */
  const policyIds = React.useMemo(() => {
    const policy = settings.record?.accessPolicy;
    const users = [
      ...(policy?.direct?.allowlist?.users ?? []),
      ...(policy?.group?.allowlist?.users ?? []),
    ];
    return [...new Set(users
      .map((user) => user?.id)
      .filter((id) => typeof id === 'string' && id))];
  }, [settings.record?.accessPolicy]);
  const policyIdsKey = policyIds.join(',');
  const [policyNames, setPolicyNames] = React.useState({ names: null, hint: null });
  React.useEffect(() => {
    if (policyIdsKey === '') {
      setPolicyNames({ names: null, hint: null });
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'names.resolve', {
          botId: bot.id, ids: policyIdsKey.split(','),
        });
        const value = chatUi.unwrapRpc(result);
        if (!cancelled) setPolicyNames({ names: value?.names ?? {}, hint: value?.hint ?? null });
      } catch (cause) {
        // 换不到名字不影响策略本身：照样能改名单，只是显示 id，并把原因说清楚。
        if (!cancelled) setPolicyNames({
          names: null,
          hint: { message: `${t('读不到名单里的名字')}：${cause.message}` },
        });
      }
    })();
    return () => { cancelled = true; };
  }, [chatUi, connection, bot.id, policyIdsKey, t]);

  /** 设属主：写配置 + 渠道重连一次，然后刷新状态。 */
  const saveOwners = async (owners) => {
    const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'bot.owner.set', {
      botId: bot.id, ownerOpenIds: owners,
    });
    chatUi.unwrapRpc(result);
    await onChanged?.();
  };
  const shared = {
    workspace: settings.record?.workspace ?? null,
    agentPreset: settings.record?.agentPreset ?? null,
    // 机器人默认模型（还没有会话时用它）：与工作区/预设同一条口径，只对新建会话生效。
    model: settings.record?.model ?? null,
    accessPolicy: settings.record?.accessPolicy ?? null,
    // 控制面板卡片的显示项（null = 全显示）。
    panelSections: settings.record?.panelSections ?? null,
  };
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [confirming, setConfirming] = React.useState(false);
  /**
   * **当前场合**（私聊/群聊）：页面级状态，所有分场合的设置项共用它。
   *
   * 为什么要有：在这之前 4 个分叉项各画各的（并排两块 / 竖排两个下拉 / 8×2 表格 / 弹窗页签），
   * 用户的心智模型却是「一个设置项 × 几个场合」，得学四套画法。
   * 现在在分组顶部选一次，下面所有卡都只画那一份——**改哪个场合从头到尾一致**。
   *
   * 只影响"画哪一份"，不改磁盘格式（保存时把改过的那份并回完整对象）。
   */
  const [scope, setScope] = React.useState('global');
  const SCOPE_DEFS = chatUi.SCOPE_DEFS ?? [
    { key: 'global', label: '全局' },
    { key: 'direct', label: '私聊' },
    { key: 'group', label: '群聊' },
  ];

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

  const tone = status.state === 'running' ? 'success'
    : status.state === 'failed' ? 'error' : 'warning';

  /**
   * 设置项按**职能**分组：页面是逐轮追加出来的（10 张卡平铺、实测 3200+px 高），
   * 想改一项得盲滚。分组只做归类与跳转，每个组件的实现与保存路径一行不改。
   *
   * 分界线按"改了会影响什么"划，而不是按实现来源：
   * - 运行环境 · 机器人跑在哪、用哪套人设与模型（只对新会话生效）
   * - 权限与身份 · 谁能用、以什么身份调外部工具（安全面）
   * - 呈现方式 · 回复长什么样（纯显示偏好，关掉不影响功能）
   * - 能力 · 额外功能开关
   */
  const settingGroups = [
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
    {
      key: 'access',
      label: '权限与身份',
      items: [
        {
          key: 'owner',
          label: '属主',
          node: h(OwnerEditor, {
            owners: status.ownerOpenIds ?? [],
            wildcard: status.ownersWildcard === true,
            // 属主只能是人（私聊会话），群不参与。
            candidates: sessions.filter((item) => item.kind === 'direct'),
            translate: t,
            onSave: saveOwners,
          }),
        },
        {
          key: 'policy',
          label: '访问策略',
          node: h(AccessPolicyEditor, {
            value: shared.accessPolicy,
            // 名单里的 id 换成名字（渠道查的）；查不到就只显示 id + 原因。
            names: policyNames.names,
            namesHint: policyNames.hint,
            // 只画当前场合那一份（场合由页头切换器决定）。
            scope,
            translate: t,
            onSave: settings.saveAccessPolicy,
          }),
        },
        {
          key: 'lark-identity',
          label: 'lark-cli 身份',
          node: h(LarkIdentityEditor, {
            botId: bot.id,
            // 策略取自机器人状态（分层结构）；老状态里没有时给一份"全局仅应用"的默认。
            value: status.larkIdentity?.scopes ?? null,
            conversations: identityTargets,
            chatUi,
            connection,
            // 只画当前场合那一层（外加它继承的全局层）。
            scope,
            translate: t,
            onChanged,
          }),
        },
      ],
    },
    {
      key: 'presentation',
      label: '呈现方式',
      items: [
        {
          key: 'panel-sections',
          label: '控制面板显示项',
          node: h(PanelSectionsEditor, {
            value: shared.panelSections ?? null,
            disabled: settings.phase !== 'ready',
            // 只画当前场合那一份（原来画 8行×2列 对照表格）。
            scope,
            translate: t,
            onSave: settings.savePanelSections,
          }),
        },
        {
          key: 'step-push',
          label: '任务过程展示',
          node: h(ScopedModeEditor, {
            title: t('任务过程展示'),
            description: t('影响过程怎么显示，不影响答案'),
            scopes: [{ key: 'direct', label: '私聊' }, { key: 'group', label: '群聊' }],
            options: STEP_PUSH_OPTIONS,
            value: status.stepPush,
            // 只画当前场合那一个下拉（原来竖排两个）。
            scope,
            translate: t,
            onSave: async (next) => {
              // 不走 run()：那样失败会同时落到卡片级 error 和编辑器内部，
              // 同一个错误在这张卡上显示两遍。编辑器自己会回滚并就地提示。
              const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'bot.step-push.set', {
                botId: bot.id, stepPush: next,
              });
              chatUi.unwrapRpc(result);
              await onChanged?.();
            },
          }),
        },
        {
          key: 'card-answer',
          label: '卡片友好回答',
          /**
           * 「卡片友好回答」：一个开关。开着就告诉模型"回复会被渲染进飞书卡片"以及卡片这边能用的
           * markdown 语法（表格 ≤5 行、别用 `#` 当正文标题…）；**插件不改写答案**，怎么写由模型自己定。
           *
           * 包一层卡片外壳：它原来是页面上一颗**裸勾选框**，与其余 9 张卡的形态都不一致，
           * 一眼看不出它属于哪一组（重构时统一）。
           */
          node: h(Panel, {
            title: t('卡片友好回答'),
            description: t('下一条消息生效'),
            help: [
              t('开着时，回复会按飞书卡片的能力组织（表格、分节、代码块更清楚）。'),
              t('关掉则按普通文本习惯回答——插件不改写答案内容，怎么写由模型自己决定。'),
            ],
          },
          h('label', { className: 'dchat-check' },
            h('input', {
              type: 'checkbox',
              // 守门用（与 data-lark-scope 同一条路子）：断言这个勾选状态真的反映了保存的配置。
              'data-card-answer': '1',
              checked: status.cardAnswer !== false,
              disabled: busy || settings.phase !== 'ready',
              onChange: async (event) => {
                const next = event.target.checked;
                try {
                  await run('bot.card-answer.set', { botId: bot.id, cardAnswer: next });
                  await onChanged?.();
                } catch {
                  // 错误已经由 run() 落在卡片上的 error 行里并回滚勾选状态；这里只是别抛出去。
                }
              },
            }),
            h('span', null, t('开启卡片友好回答')))),
        },
      ],
    },
    {
      key: 'capability',
      label: '能力',
      items: [
        {
          key: 'context',
          label: '上下文增强',
          node: h(ContextEnhancementEditor, {
            config: settings.record?.contextEnhancement ?? null,
            disabled: settings.phase !== 'ready',
            translate: t,
            onSave: settings.saveContextEnhancement,
            // 「指定用户/指定群」用它做"从会话里选"，而不是让人填 id。
            conversations: sessions,
            // 只画当前场合那一组（原来弹窗里画两个页签）。
            scope,
            // 只列飞书真能提供的来源字段。
            sourceFields: FEISHU_SOURCE_FIELDS,
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
            botId: bot.id,
          }),
        },
      ],
    },
  ];

  return h(Panel, {
    // 这台机器人的身份与操作条（名称/状态/重连/移除接入）：**不属于任何设置分组**——
    // 它不是一项设置，而是"我在配哪台机器人"。打这个标记是给布局守门用：
    // 守门据此断言"每一张**设置**卡都被分进了某一组"，而头卡不会被误判成漏分组。
    'data-card': 'bot-header',
    title: bot.name ?? bot.id,
    description: bot.appIdMasked,
    actions: h('div', { className: 'dchat-actions' },
      h(StatusPill, { status: status.state, label: t(STATE_TEXT[status.state] ?? '状态') }),
      h('button', {
        type: 'button',
        className: 'dchat-button',
        disabled: busy,
        onClick: async () => {
          try {
            await run('bot.reconnect', { botId: bot.id });
            await onChanged?.();
          } catch { /* 错误已展示 */ }
        },
      }, t('重新连接')),
      confirming
        ? h(React.Fragment, null,
          h('button', {
            type: 'button',
            className: 'dchat-button dchat-buttonDangerSolid',
            disabled: busy,
            onClick: async () => {
              try {
                await run('bot.delete', { botId: bot.id, confirm: true });
                setConfirming(false);
                await onChanged?.();
              } catch { /* 错误已展示 */ }
            },
          }, t('确认移除')),
          h('button', {
            type: 'button',
            className: 'dchat-button',
            disabled: busy,
            onClick: () => setConfirming(false),
          }, t('取消')))
        : h('button', {
          type: 'button',
          className: 'dchat-button dchat-buttonDanger',
          disabled: busy,
          onClick: () => setConfirming(true),
        }, t('移除接入'))),
  },
  status.errorMessage
    ? h('p', { className: 'dchat-error', role: 'alert' }, status.errorMessage)
    : null,
  // 属主名单是 `*`（绑定时没记录属主）时必须说清楚：这台机器人**没有属主绕过**，
  // 一切按访问策略判定，所以 /allow 会回"只有属主"，名单要在下面的「访问策略」里改。
  status.ownersWildcard
    ? h('p', { className: 'dchat-cardDescription' }, t('属主名单是 *（这台机器人没有属主绕过）：能用它的人完全由下面的「访问策略」决定。'))
    : null,
  // 名字拿不到（多为缺权限）时说明原因并给出开通入口：否则用户只能看到一串 id 猜原因。
  status.nameHint
    ? h('p', { className: 'dchat-cardDescription', role: 'status' },
      `${status.nameHint.message} `,
      status.nameHint.url
        ? h('a', { href: status.nameHint.url, target: '_blank', rel: 'noreferrer' }, t('去开通权限'))
        : null)
    : null,
  // 处理最近一条消息失败时留下的现场（与终端日志对应）。
  status.lastError
    ? h('p', { className: 'dchat-error', role: 'alert' },
      `${t('最近一次错误')}：${status.lastError}`)
    : null,
  error ? h('p', { className: 'dchat-error', role: 'alert' }, error) : null,
  h('div', { className: 'dchat-list' },
    h('div', { className: 'dchat-listItem' },
      h('span', null, t('已处理消息')),
      h('span', null, String(status.handled ?? 0)))),


  /**
   * **场合切换器**：一次选定"现在要改哪个场合"，下面所有分场合的设置项都只画那一份。
   *
   * 放在分组之上（页面级），因为它管的是下面全部卡片——而不是每张卡各自问一遍
   * （那样就是原来的四套画法）。只有一台机器人只有私聊时（未来某渠道）不画它。
   */
  h('div', { className: 'dchat-scopeBar' },
    h('span', { className: 'dchat-scopeLabel' }, t('正在设置')),
    h(ScopeSwitcher, {
      scopes: SCOPE_DEFS,
      value: scope,
      onChange: setScope,
      translate: t,
      ariaLabel: t('设置场合'),
    })),

  // 分组渲染：分类导航 + 每组标题 + 组内卡片（子组件实例在上面的 settingGroups 里建好）。
  h(SettingGroups, {
    groups: settingGroups,
    translate: t,
    ariaLabel: t('设置分类'),
  }));
}

/**
 * 机器人接入：**两条路**（与 dsh-im 一致）。
 *
 * ① 扫码新建：向飞书申请一次性授权链接，用飞书扫一下（或在浏览器里打开）就自动创建应用并
 *    返回凭据；**扫码的人就是属主**，不用再去设置里选人。
 * ② 手动接入已有机器人：填 App ID + App Secret（属主可留空，留空时接入后把私聊放宽到
 *    「任何人可用」，让属主先跟它说上第一句话）。
 *
 * 之前只能手工往渠道的 `config.json` 里写凭据（旧版 dsh-im 的配置启动时自动导入），
 * 真机反馈「飞书缺少接入机器人的入口」——所以这个入口做在渠道页上，
 * 机器人列表头部的「新建机器人接入」打开的就是这一页。
 *
 * 导出给布局守门用：二维码、状态行与四个控件（三个输入框 + 一个下拉）在 320px 下都要排得下。
 *
 * @param props - { chatUi, connection, translate, onAdded }。
 * @returns React 元素。
 */
export function FeishuOnboard({ chatUi, connection, translate, onAdded }) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  const { Panel } = chatUi.components;
  const [form, setForm] = React.useState({ appId: '', appSecret: '', domain: 'feishu', owner: '' });
  const [phase, setPhase] = React.useState('idle');
  const [error, setError] = React.useState(null);
  /** 刚接进来的机器人（`{ name, id }`）与"策略没放宽成"的告警。 */
  const [added, setAdded] = React.useState(null);
  const [warning, setWarning] = React.useState(null);
  /** 扫码那条路的状态（`bot.register.*` 的返回原样存着）。 */
  const [scan, setScan] = React.useState({ state: 'idle' });
  const aliveRef = React.useRef(true);
  React.useEffect(() => () => { aliveRef.current = false; }, []);
  const busy = phase === 'busy';
  const ready = form.appId.trim().length > 0 && form.appSecret.trim().length > 0;

  const patch = (next) => setForm((current) => ({ ...current, ...next }));
  /** 扫码进行中的状态（这些状态下才轮询、才显示二维码与取消）。 */
  const SCAN_ACTIVE = ['starting', 'qr_ready', 'polling', 'slow_down', 'domain_switched', 'saving'];

  /**
   * 接进来的机器人如果**没有属主**，把私聊访问策略放宽到「任何人可用」。
   *
   * 为什么：属主只能从"它聊过的会话"里选，而新机器人一个会话都没有，默认
   * 「仅名单内可用」+ 空名单 = 谁都进不来，属主自己也没法说上第一句话。
   * 扫码那条路通常是知道属主的（扫码的人），这条路只在真的没有属主时才走。
   * 失败只告警：机器人已经加上了，用户能自己去「访问策略」改。
   */
  const relaxIfOwnerless = async (bot) => {
    if (bot?.ownersWildcard !== true) return;
    const botId = bot?.botId ?? bot?.id ?? null;
    if (!botId) return;
    try {
      await chatUi.callControlRpc(connection, 'bot.access-policy.open-scope', {
        channelId: CHANNEL_ID, botId, conversationType: 'direct',
      });
    } catch (cause) {
      setWarning(`${t('私聊访问策略没能自动放宽')}：${cause?.message ?? String(cause)}`);
    }
  };

  /** 手动接入：填已有机器人的 App ID + App Secret。 */
  const submit = async () => {
    if (!ready || busy) return;
    setPhase('busy');
    setError(null);
    setWarning(null);
    setAdded(null);
    let bot = null;
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'bot.add', {
        appId: form.appId.trim(),
        appSecret: form.appSecret.trim(),
        domain: form.domain,
        // 属主可以留空（也可以写多个，用空格/逗号分开）：留空 = 这台机器人暂时没有属主。
        ...(form.owner.trim()
          ? { ownerOpenIds: form.owner.trim().split(/[\s,，]+/).filter(Boolean) }
          : {}),
      });
      bot = chatUi.unwrapRpc(result)?.bot ?? null;
    } catch (cause) {
      setError(cause?.message ?? String(cause));
      setPhase('error');
      return;
    }
    await relaxIfOwnerless(bot);
    setAdded({ id: bot?.botId ?? bot?.id ?? null, name: bot?.name ?? null });
    patch({ appId: '', appSecret: '', owner: '' });
    setPhase('done');
    onAdded?.();
  };

  /** 扫码新建：发起一次尝试（之后靠轮询推进）。 */
  const beginScan = async () => {
    setError(null);
    setWarning(null);
    setAdded(null);
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'bot.register.start', {});
      const value = chatUi.unwrapRpc(result);
      if (aliveRef.current) setScan(value);
    } catch (cause) {
      if (aliveRef.current) setError(cause?.message ?? String(cause));
    }
  };

  const cancelScan = async () => {
    try {
      const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'bot.register.cancel', {});
      const value = chatUi.unwrapRpc(result);
      if (aliveRef.current) setScan(value);
    } catch (cause) {
      if (aliveRef.current) setError(cause?.message ?? String(cause));
    }
  };

  // 轮询扫码状态：服务端不做长轮询，这里每 2 秒问一次（与微信那条路一致）。
  React.useEffect(() => {
    if (!SCAN_ACTIVE.includes(scan.state)) return undefined;
    let stopped = false;
    const tick = async () => {
      try {
        const result = await chatUi.callChannelRpc(connection, CHANNEL_ID, 'bot.register.status', {});
        const value = chatUi.unwrapRpc(result);
        if (stopped || !aliveRef.current) return;
        setScan(value);
        if (!SCAN_ACTIVE.includes(value.state)) return;
      } catch (cause) {
        if (!stopped && aliveRef.current) setError(cause?.message ?? String(cause));
        return;
      }
      if (!stopped) timer = setTimeout(tick, 2_000);
    };
    let timer = setTimeout(tick, 1_000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.state, chatUi, connection]);

  // 扫码成功：刷新列表、顺手把"没有属主"的私聊策略放宽，并回头看一眼渲染。
  React.useEffect(() => {
    if (scan.state !== 'succeeded' || !scan.bot) return;
    setAdded({ id: scan.bot.botId ?? scan.bot.id ?? null, name: scan.bot.name ?? null });
    void relaxIfOwnerless(scan.bot);
    onAdded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.state, scan.bot]);

  const field = (key, options) => h('div', { className: 'dchat-scopeRow' },
    // `label` 由调用方给：界面文案传 t(…) 的结果，飞书自己的术语（App ID / App Secret）原样传。
    h('label', { className: 'dchat-scopeLabel', htmlFor: options.id }, options.label),
    options.select
      ? h('select', {
        id: options.id,
        className: 'dchat-select',
        value: form[key],
        disabled: busy,
        onChange: (event) => patch({ [key]: event.target.value }),
      }, options.select.map((item) => h('option', { key: item.value, value: item.value }, t(item.label))))
      : h('input', {
        id: options.id,
        className: 'dchat-input',
        type: options.type ?? 'text',
        value: form[key],
        disabled: busy,
        placeholder: options.placeholder ?? '',
        autoComplete: 'off',
        spellCheck: false,
        onChange: (event) => patch({ [key]: event.target.value }),
        onKeyDown: (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          void submit();
        },
      }));

  const scanActive = SCAN_ACTIVE.includes(scan.state);
  const scanLabel = scan.state === 'starting' ? t('正在向飞书申请二维码…')
    : scan.state === 'saving' ? t('已授权，正在启动机器人…')
      : scan.state === 'succeeded' ? t('已接入')
        : scan.state === 'expired' ? t('二维码已失效，请重新生成')
          : scan.state === 'cancelled' ? t('已取消')
            : scan.state === 'error' ? t('扫码接入失败')
              : scan.state === 'polling' || scan.state === 'slow_down' || scan.state === 'domain_switched'
                ? t('等待你在飞书里确认…')
                : t('等待扫码');

  return h(Panel, {
    title: t('新建机器人接入'),
    description: t('两种方式：扫码新建一个飞书机器人（推荐，扫码的人就是属主），或手动填已有机器人的凭据。'),
    actions: null,
  },
  // ① 扫码新建
  h('div', { className: 'dchat-onboardSection' },
    h('h4', { className: 'dchat-onboardTitle' }, t('扫码新建机器人')),
    h('p', { className: 'dchat-cardDescription' },
      t('点下面的按钮会向飞书申请一个一次性授权链接：用飞书扫一扫，或在浏览器里打开它，就会自动创建应用并接入。')),
    // 权限是**预填进确认页**的（host 侧 app-manifest.mjs）：用户要知道"扫完要点确认"这一步，
    // 否则会以为扫码就已经全部就绪，遇到还没发布的权限又找不到原因。
    h('p', { className: 'dchat-cardDescription' },
      t('扫码后的确认页会列出这台机器人需要的权限（已经替你选好），确认一次就一起开通；个别权限要管理员审批、应用发布后才生效。')),
    h('div', { className: 'dchat-actions' },
      h('button', {
        type: 'button',
        className: 'dchat-button dchat-buttonPrimary',
        disabled: scanActive,
        onClick: () => { void beginScan(); },
      }, scan.state === 'idle' || scan.state === 'cancelled' || scan.state === 'expired' || scan.state === 'error'
        ? t('扫码新建机器人')
        : t('重新生成二维码')),
      scanActive
        ? h('button', {
          type: 'button', className: 'dchat-button', onClick: () => { void cancelScan(); },
        }, t('取消'))
        : null),
    scan.qrCodeDataUrl
      ? h('img', {
        className: 'dchat-onboardQr',
        src: scan.qrCodeDataUrl,
        alt: t('扫码新建机器人'),
        width: 200,
        height: 200,
      })
      : null,
    // 二维码与链接**两条路都给**（真机反馈：二维码出来之后链接就没了）：桌面端直接点链接
    // 比"掏手机扫屏幕"省事，手机端扫码更快——两种都留着，谁方便用谁。
    // 只有 Host 编不出二维码（缺 `qrcode` 模块）时，链接才是唯一的路，这时补一句说明。
    scan.verificationUrl
      ? h('div', null,
        h('a', {
          className: 'dchat-onboardLink', href: scan.verificationUrl, target: '_blank', rel: 'noreferrer',
        }, t('打开授权页面')),
        !scan.qrCodeDataUrl
          ? h('p', { className: 'dchat-cardDescription' },
            `${t('这台 Host 没能生成二维码，请点上面的链接继续。')}`)
          : null)
      : null,
    h('p', { className: 'dchat-cardDescription', role: 'status' },
      scan.remainingSeconds !== null && scan.remainingSeconds !== undefined && scanActive
        ? `${scanLabel}（${t('剩余')} ${scan.remainingSeconds}s）`
        : scanLabel),
    scan.state === 'error' && scan.error
      ? h('p', { className: 'dchat-error', role: 'alert' }, `${scan.error.message}（${scan.error.code}）`)
      : null),

  h('hr', { className: 'dchat-onboardDivider' }),

  // ② 手动接入已有机器人
  h('div', { className: 'dchat-onboardSection' },
    h('h4', { className: 'dchat-onboardTitle' }, t('手动接入已有机器人')),
    h('p', { className: 'dchat-cardDescription' },
      t('填自建应用的 App ID 与 App Secret（飞书开放平台 → 凭证与基础信息）。应用需要开启机器人能力。')),
    h('div', { className: 'dchat-scopeGrid' },
      field('appId', { id: 'dchat-onboard-appId', label: 'App ID', placeholder: 'cli_xxxxxxxxxxxx' }),
      field('appSecret', {
        id: 'dchat-onboard-appSecret', label: 'App Secret', type: 'password', placeholder: t('应用凭证里的 App Secret'),
      }),
      field('domain', {
        id: 'dchat-onboard-domain',
        label: t('域名'),
        select: [{ value: 'feishu', label: '飞书（open.feishu.cn）' }, { value: 'lark', label: 'Lark（open.larksuite.com）' }],
      }),
      field('owner', {
        id: 'dchat-onboard-owner',
        label: t('属主 open_id（可留空）'),
        placeholder: 'ou_xxxxxxxxxxxx',
      }),
      h('p', { className: 'dchat-cardDescription' },
        t('属主留空 = 这台机器人暂时没有属主：接入后私聊会被设为「任何人可用」，属主先跟它说一句话，再回它的设置里把自己选成属主。'))),
    h('div', { className: 'dchat-actions' },
      h('button', {
        type: 'button',
        className: 'dchat-button dchat-buttonPrimary',
        disabled: busy || !ready,
        onClick: () => { void submit(); },
      }, busy ? t('接入中…') : t('接入')))),

  error ? h('p', { className: 'dchat-error', role: 'alert' }, error) : null,
  warning ? h('p', { className: 'dchat-warning', role: 'alert' }, warning) : null,
  added
    ? h('p', { className: 'dchat-cardDescription', role: 'status' },
      `${t('已接入')}${added.name ? ` 「${added.name}」` : ''}。`
      + t('点左上角「返回」就能在列表里看到它。'))
    : null);
}

/**
 * 渠道设置页（`chat.channel.page`）。
 *
 * **两个视图严格分开，页面上不混**：
 * - `botId` 为空 = 「新建机器人接入」：**只画接入相关的东西**。已接入的机器人属于左栏那份列表，
 *   点它们的「设置」才是各自的配置页——真机反馈：这个页面里混着已接入机器人的配置，
 *   分不清哪些是"新建"、哪些是"已经在用的"。
 * - `botId` 给了 = 这一台机器人的设置页。
 *
 * 导出给布局守门用：守门断言"接入页里不出现已接入机器人的配置"（真机就是这么翻的车）。
 */
export function FeishuPage(props) {
  // hub 从机器人列表点「设置」进来时会带上 botId：只展示这一台机器人的设置。
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
  const allBots = state.value?.bots ?? [];
  const scoped = Boolean(botId);
  const bots = scoped
    ? allBots.filter((bot) => (bot?.botId ?? bot?.id ?? null) === botId)
    : [];
  // 指定了 botId 却一台都没匹配到：明确报出来，**绝不退回"显示全部"**——
  // 静默显示全部会让人以为自己点错了机器人，而真正的问题（版本错位/已被移除）被藏起来。
  const missing = scoped && state.phase === 'ready' && bots.length === 0;

  return h(React.Fragment, null,
    // 读状态失败照旧要显示：这个页面上不能只留一行日志。
    state.error ? h('p', { className: 'dchat-error', role: 'alert' }, state.error.message) : null,
    scoped ? null : h(FeishuOnboard, { chatUi, connection, translate: t, onAdded: load }),
    missing
      ? h(EmptyState, {
        title: t('找不到这台机器人'),
        description: `${t('它不在当前渠道的名单里（可能已被移除，或 Host 与页面版本不一致）')}：${botId}`,
      })
      : null,
    scoped
      ? bots.map((bot) => h(BotCard, {
        key: bot.id,
        bot,
        status: bot,
        chatUi,
        connection,
        translate: t,
        onChanged: load,
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
    'dsh-chat-feishu: 双语文案');
  const t = typeof ctx.locale?.bind === 'function'
    ? ctx.locale.bind(LOCALE_NAMESPACE)
    : (key) => zh[key] ?? key;

  ctx.effect(() => ctx.chatChannels.register({
    id: CHANNEL_ID,
    order: 20,
    label: () => t('飞书'),
    // 侧边栏会话行的渠道徽标（飞书品牌蓝）。
    // 图标：**飞书开放平台官网的矢量标志**（open.feishu.cn 的 favicon-logo.svg，三条 path
    // 逐字节未改）。相对原件只做两件事：去掉官方文件里那层白色圆角底 `rect`（否则是白底方图），
    // 并把 viewBox 按官方 48px favicon 的留白比例收到标志外框；出处见 THIRD_PARTY_NOTICES.md。
    icon: { svg: '<svg viewBox="0.977 0.673 14.655 14.655" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M8.5611 8.26287L8.59322 8.23075C8.6141 8.20988 8.63658 8.18739 8.65906 8.16652L8.70402 8.12316L8.8373 7.99148L9.02037 7.81324L9.17613 7.65908L9.32226 7.51456L9.47481 7.36361L9.61452 7.22551L9.81043 7.03281C9.84737 6.99588 9.8859 6.96055 9.92444 6.92522C9.9951 6.86099 10.069 6.79836 10.1428 6.73734C10.2119 6.68274 10.2825 6.62975 10.3548 6.57836C10.456 6.5061 10.5603 6.44026 10.6663 6.37603C10.7707 6.31501 10.8783 6.2572 10.9875 6.2026C11.0903 6.15282 11.1963 6.10625 11.3038 6.0645C11.3633 6.04041 11.4243 6.01954 11.4853 5.99866C11.5158 5.98903 11.5463 5.97779 11.5784 5.96815C11.3071 4.90028 10.8109 3.90468 10.122 3.04556C9.98868 2.88016 9.78634 2.78381 9.57438 2.78381H3.94598C3.88817 2.78381 3.84 2.83038 3.84 2.8898C3.84 2.92352 3.85605 2.95403 3.88335 2.97491C5.80391 4.38321 7.39689 6.19297 8.54826 8.27732L8.5611 8.26287Z" fill="#00D6B9"/> <path d="M6.32424 13.2168C9.23077 13.2168 11.7631 11.6126 13.0831 9.24238C13.1297 9.15887 13.1747 9.07537 13.218 8.99026C13.1522 9.11712 13.0783 9.23917 12.9964 9.35478C12.9675 9.39493 12.9386 9.43508 12.9081 9.47522C12.8696 9.525 12.831 9.57157 12.7909 9.61814C12.7588 9.65507 12.7266 9.6904 12.6929 9.72573C12.6255 9.79638 12.5548 9.86383 12.4809 9.92646C12.4392 9.96178 12.3991 9.99551 12.3557 10.0276C12.3059 10.0662 12.2545 10.1031 12.2031 10.1368C12.171 10.1593 12.1373 10.1802 12.1036 10.2011C12.0699 10.2219 12.0345 10.2428 11.9976 10.2637C11.9253 10.3038 11.8499 10.3424 11.7744 10.3761C11.7085 10.405 11.6411 10.4323 11.5737 10.458C11.4998 10.4853 11.4259 10.5094 11.3488 10.5302C11.2348 10.5624 11.1208 10.5864 11.0036 10.6041C10.9201 10.617 10.8334 10.6266 10.7483 10.633C10.6583 10.6394 10.5668 10.641 10.4753 10.641C10.3741 10.6394 10.2729 10.633 10.1702 10.6218C10.0947 10.6137 10.0192 10.6025 9.94375 10.5897C9.87791 10.5784 9.81208 10.564 9.74624 10.5479C9.71091 10.5399 9.67719 10.5302 9.64186 10.5206C9.54551 10.4949 9.44916 10.4676 9.35281 10.4403C9.30464 10.4259 9.25646 10.413 9.20989 10.3986C9.13763 10.3777 9.06698 10.3552 8.99632 10.3327C8.93851 10.3151 8.8807 10.2958 8.82289 10.2765C8.76829 10.2589 8.71209 10.2412 8.65749 10.2219L8.54508 10.1834C8.50012 10.1673 8.45355 10.1513 8.40859 10.1352L8.31224 10.0999C8.24801 10.0774 8.18378 10.0533 8.12115 10.0292C8.08421 10.0148 8.04728 10.0019 8.01035 9.98748C7.96057 9.96821 7.91239 9.94894 7.86261 9.92967C7.81123 9.90879 7.75823 9.88792 7.70685 9.86704L7.60568 9.82529L7.48043 9.7739L7.38408 9.73376L7.28452 9.6904L7.1978 9.65186L7.11912 9.61653L7.03883 9.5796L6.95693 9.54106L6.85255 9.49288L6.74336 9.4415C6.70482 9.42223 6.66628 9.40456 6.62774 9.38529L6.52978 9.33712C4.80192 8.4748 3.24267 7.31218 1.92269 5.90227C1.88254 5.86052 1.8167 5.85731 1.77335 5.89746C1.75247 5.91673 1.73962 5.94563 1.73962 5.97454L1.74284 10.9413V11.3444C1.74284 11.5788 1.85845 11.7972 2.05276 11.9273C3.31654 12.772 4.80353 13.22 6.32424 13.2168Z" fill="#3370FF"/> <path d="M14.8656 6.21539C13.8844 5.73525 12.7619 5.63248 11.7101 5.92795C11.6652 5.94079 11.6218 5.95364 11.5784 5.96649C11.5479 5.97612 11.5174 5.98576 11.4853 5.997C11.4243 6.01787 11.3633 6.04036 11.3039 6.06284C11.1963 6.10459 11.0919 6.15116 10.9875 6.20094C10.8783 6.25393 10.7707 6.31174 10.6663 6.37276C10.5588 6.43539 10.456 6.50283 10.3548 6.57509C10.2825 6.62648 10.2119 6.67947 10.1428 6.73407C10.0674 6.79509 9.99511 6.85611 9.92445 6.92195C9.88591 6.95728 9.84898 6.99261 9.81044 7.02954L9.61453 7.22224L9.47482 7.36034L9.32227 7.51129L9.17614 7.65581L9.02038 7.80997L8.83892 7.98982L8.70564 8.1215L8.66067 8.16485C8.6398 8.18573 8.61732 8.20821 8.59483 8.22909L8.56272 8.2612L8.51294 8.30777C8.49367 8.32544 8.476 8.34149 8.45673 8.35916C7.97338 8.80397 7.43383 9.18455 6.85413 9.49447L6.9585 9.54265L7.0404 9.58119L7.12069 9.61812L7.19938 9.65345L7.28609 9.69199L7.38565 9.73534L7.482 9.77549L7.60725 9.82688L7.70842 9.86863C7.75981 9.8895 7.8128 9.91038 7.86419 9.93125C7.91236 9.95052 7.96214 9.9698 8.01192 9.98907C8.04886 10.0035 8.08579 10.0164 8.12272 10.0308C8.18696 10.0549 8.25119 10.0774 8.31382 10.1015L8.41016 10.1368C8.45513 10.1529 8.50009 10.1689 8.54666 10.185L8.65907 10.2235C8.71366 10.2412 8.76826 10.2604 8.82447 10.2781C8.88228 10.2974 8.94008 10.315 8.99789 10.3343C9.06855 10.3568 9.14081 10.3777 9.21147 10.4002C9.25964 10.4146 9.30782 10.4291 9.35439 10.4419C9.45073 10.4692 9.54708 10.4965 9.64343 10.5222C9.67876 10.5318 9.71248 10.5399 9.74781 10.5495C9.81365 10.5656 9.87949 10.5784 9.94533 10.5912C10.0208 10.6041 10.0963 10.6153 10.1717 10.6234C10.2745 10.6346 10.3757 10.641 10.4769 10.6426C10.5684 10.6442 10.6599 10.641 10.7498 10.6346C10.8366 10.6282 10.9217 10.6185 11.0052 10.6057C11.1208 10.588 11.2364 10.5623 11.3504 10.5318C11.4259 10.511 11.5014 10.4869 11.5752 10.4596C11.6427 10.4355 11.7101 10.4082 11.776 10.3777C11.8514 10.344 11.9269 10.3054 11.9992 10.2653C12.0345 10.246 12.0698 10.2251 12.1052 10.2026C12.1405 10.1818 12.1726 10.1593 12.2047 10.1384C12.2561 10.1031 12.3075 10.0677 12.3573 10.0292C12.4006 9.99709 12.4424 9.96337 12.4825 9.92804C12.5548 9.86542 12.6254 9.79797 12.6929 9.72732C12.7266 9.69199 12.7587 9.65666 12.7908 9.61973C12.831 9.57316 12.8711 9.52498 12.9081 9.47681C12.9386 9.43827 12.9675 9.39812 12.9964 9.35637C13.0767 9.24075 13.1505 9.12032 13.2164 8.99506L13.2919 8.84572L13.9631 7.50807L13.9711 7.49202C14.1927 7.01348 14.4946 6.58312 14.8656 6.21539Z" fill="#133C9A"/> </svg>' },
    sessionBadge: { text: '飞', color: '#3370ff' },
    /**
     * `capabilities.setup.label` 决定机器人列表头部显不显示这个入口：飞书现在有了——
     * 打开的是「新建机器人接入」（填自建应用的 App ID + App Secret 就能加机器人），
     * 不再是当初那个点进去什么都改不了的「渠道设置」空壳。
     */
    capabilities: {
      groups: true,
      setup: {
        label: t('新建机器人接入'),
        hint: t(FEISHU_SETUP_HINT),
      },
    },
  }), 'dsh-chat-feishu: 渠道元数据');

  ctx.effect(() => ctx.slots.inject(PAGE_SLOT, () => ctx.slots.register({
    name: PAGE_SLOT,
    key: CHANNEL_ID,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ chatUi: ctx.chatUi, connection: ctx.connection, translate: t }),
  }, FeishuPage)), 'dsh-chat-feishu: 渠道设置页');
}
