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
  '只影响 /menu 发出来的那张卡片：关掉的项不显示，功能照旧（私聊与群聊分别设置）。': '只影响 /menu 发出来的那张卡片：关掉的项不显示，功能照旧（私聊与群聊分别设置）。',
  '模型与推理等级': '模型与推理等级',
  '会话': '会话',
  'Agent 预设与工作区': 'Agent 预设与工作区',
  '上下文增强（本会话）': '上下文增强（本会话）',
  '访问策略（本会话）': '访问策略（本会话）',
  '渠道设置（任务过程展示等）': '渠道设置（任务过程展示等）',
  '渠道动作按钮（重连等）': '渠道动作按钮（重连等）',
  '命令按钮（新会话/状态/诊断…）': '命令按钮（新会话/状态/诊断…）',
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
  '显示项': 'Section',
  '控制面板显示项': 'Control panel sections',
  '只影响 /menu 发出来的那张卡片：关掉的项不显示，功能照旧（私聊与群聊分别设置）。': 'Only affects the card sent by /menu: hidden items are not drawn, everything keeps working (direct and group are configured separately).',
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
  '私聊': 'Direct',
  '移除': 'Remove',
  '群聊': 'Group',
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

// 导出给布局守门用：整张渠道卡在窄栏下的真实渲染（真机炸过「卡片头逐字竖排」）。
export function BotCard({ bot, status, chatUi, connection, translate, onChanged }) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  const { Panel, StatusPill, ScopedModeEditor, ContextEnhancementEditor,
    DeliveryTargetsEditor, WorkspaceEditor, PresetEditor, ModelEditor,
    AccessPolicyEditor, OwnerEditor, PanelSectionsEditor } = chatUi.components;
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

  return h(Panel, {
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

  h(WorkspaceEditor, {
    value: shared.workspace,
    options: settings.options?.workspacePaths ?? [],
    translate: t,
    onSave: settings.saveWorkspace,
  }),

  h(PresetEditor, {
    value: shared.agentPreset,
    options: settings.options?.presets ?? [],
    translate: t,
    onSave: settings.saveAgentPreset,
  }),

  h(ModelEditor, {
    value: shared.model ?? null,
    options: settings.options?.models ?? [],
    hostDefault: settings.options?.hostDefault ?? null,
    failures: settings.options?.modelFailures ?? [],
    translate: t,
    onSave: settings.saveModel,
  }),

  h(OwnerEditor, {
    owners: status.ownerOpenIds ?? [],
    wildcard: status.ownersWildcard === true,
    // 属主只能是人（私聊会话），群不参与。
    candidates: sessions.filter((item) => item.kind === 'direct'),
    translate: t,
    onSave: saveOwners,
  }),

  h(AccessPolicyEditor, {
    value: shared.accessPolicy,
    // 名单里的 id 换成名字（渠道查的）；查不到就只显示 id + 原因。
    names: policyNames.names,
    namesHint: policyNames.hint,
    translate: t,
    onSave: settings.saveAccessPolicy,
  }),

  h(PanelSectionsEditor, {
    value: shared.panelSections ?? null,
    disabled: settings.phase !== 'ready',
    translate: t,
    onSave: settings.savePanelSections,
  }),

  h(ScopedModeEditor, {
    title: t('任务过程展示'),
    description: t('设置执行过程的呈现方式；私聊与群聊分别生效'),
    scopes: [{ key: 'direct', label: '私聊' }, { key: 'group', label: '群聊' }],
    options: STEP_PUSH_OPTIONS,
    value: status.stepPush,
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

  h(ContextEnhancementEditor, {
    config: settings.record?.contextEnhancement ?? null,
    disabled: settings.phase !== 'ready',
    translate: t,
    onSave: settings.saveContextEnhancement,
    // 「指定用户/指定群」用它做"从会话里选"，而不是让人填 id。
    conversations: sessions,
  }),

  // 渠道无关面板：目标清单与测试发送都由 hub 的共享组件负责。
  h(DeliveryTargetsEditor, {
    chatUi,
    connection,
    channelId: CHANNEL_ID,
    botId: bot.id,
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
    // Host 没能把链接编码成二维码（缺 qrcode 模块）时**必须说清**，并给一条还能走的路。
    scan.verificationUrl && !scan.qrCodeDataUrl
      ? h('div', null,
        h('a', {
          className: 'dchat-onboardLink', href: scan.verificationUrl, target: '_blank', rel: 'noreferrer',
        }, t('打开授权页面')),
        h('p', { className: 'dchat-cardDescription' },
          `${t('这台 Host 没能生成二维码，请点上面的链接继续。')}`))
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
