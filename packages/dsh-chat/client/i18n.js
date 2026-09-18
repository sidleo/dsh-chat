/**
 * dsh-chat 的文案。每个包用自己的命名空间注册，互不覆盖。
 *
 * @module dsh-chat/client/i18n
 */

export const LOCALE_NAMESPACE = 'dsh-chat';

export const zh = {
  'Chat机器人': 'Chat机器人',
  'Chat机器人设置': 'Chat机器人设置',
  '渠道导航': '渠道导航',
  '未安装任何聊天软件插件': '未安装任何聊天软件插件',
  '安装渠道插件后，这里会出现对应的聊天软件。': '安装渠道插件后，这里会出现对应的聊天软件。',
  '已知渠道插件': '已知渠道插件',
  '渠道正在启动': '正在启动',
  '渠道已就绪': '已就绪',
  '渠道启动失败': '启动失败',
  '渠道已停止': '已停止',
  '重新读取': '重新读取',
  '读取中…': '读取中…',
  '上下文增强': '上下文增强',
  '任务过程展示': '任务过程展示',
  '保存': '保存',
  '保存中…': '保存中…',
  '取消': '取消',
  '保存失败，请重试。': '保存失败，请重试。',
  // 主动投递（共享组件 delivery-targets.js）
  '主动投递': '主动投递',
    '让定时任务或 agent 把结果直接发到指定会话。': '让定时任务或 agent 把结果直接发到指定会话。',
  '私聊': '私聊',
  '群聊': '群聊',
  '候选': '候选',
  '保存为投递目标': '保存为投递目标',
  '删除': '删除',
  '确认删除': '确认删除',
  '当前渠道不支持主动投递。': '当前渠道不支持主动投递。',
  
  '已保存，现在可以主动发消息了。': '已保存，现在可以主动发消息了。',
  '已删除。': '已删除。',
  '还没有可添加的会话：在群里 @ 一次机器人，或与它私聊一次，会话就会出现在这里，保存后即可主动投递。': '还没有可添加的会话：在群里 @ 一次机器人，或与它私聊一次，会话就会出现在这里，保存后即可主动投递。',
  '没有可添加的会话：在群里 @ 一次机器人，或与它私聊一次，该会话就会出现在这里。': '没有可添加的会话：在群里 @ 一次机器人，或与它私聊一次，该会话就会出现在这里。',
  '上面标「候选」的会话还不能主动投递，点「保存为投递目标」后才行。': '上面标「候选」的会话还不能主动投递，点「保存为投递目标」后才行。',
  '已保存': '已保存',
  '可添加的候选': '可添加的候选',
  '展开全部': '展开全部',
  '收起': '收起',
  '按名字或 id 过滤': '按名字或 id 过滤',
  '没有匹配的目标。': '没有匹配的目标。',
  '填入示例': '填入示例',
  '清空': '清空',
  '来源字段': '来源字段',
  '启用': '启用',
  '备注名（可选）': '备注名（可选）',
  '张三': '张三',
  '新增': '新增',
  '还没有指定设置。': '还没有指定设置。',
  '关闭': '关闭',
  '增强提示词': '增强提示词',
  '告诉模型如何使用来源字段。只填正文，插件会自动包成来源增强块。': '告诉模型如何使用来源字段。只填正文，插件会自动包成来源增强块。',
  '叠加全局提示词（不勾选则只使用上面的专属提示词）': '叠加全局提示词（不勾选则只使用上面的专属提示词）',
  '上下文增强': '上下文增强',
  '未开启': '未开启',
  '来源字段只在当前消息已提供时才会发送，不会额外查询平台接口。': '来源字段只在当前消息已提供时才会发送，不会额外查询平台接口。',
  '上下文增强范围': '上下文增强范围',
  '已开启': '已开启',
  // 机器人设置页的共享编辑块（bot-shared-settings.js）
  '工作区': '工作区',
  '机器人跑在哪个目录：能读写哪些文件、用哪份 AGENTS.md。只对新建会话生效。': '机器人跑在哪个目录：能读写哪些文件、用哪份 AGENTS.md。只对新建会话生效。',
  '目录': '目录',
  '下拉里是这台机器人用过的目录。': '下拉里是这台机器人用过的目录。',
  'Agent 预设': 'Agent 预设',
  '这个机器人用哪套 Agent 预设（人设与工具集）。只对新建会话生效。': '这个机器人用哪套 Agent 预设（人设与工具集）。只对新建会话生效。',
  '当前 Host 读不到 Agent Preset 列表。': '当前 Host 读不到 Agent Preset 列表。',
  '跟随 Host 默认': '跟随 Host 默认',
  '访问策略': '访问策略',
  '谁能跟机器人说话、谁能执行命令。改动立即生效；属主始终可用。': '谁能跟机器人说话、谁能执行命令。改动立即生效；属主始终可用。',
  '访问模式': '访问模式',
  '仅名单内可用': '仅名单内可用',
  '任何人可用': '任何人可用',
  '允许执行命令': '允许执行命令',
  '可执行命令': '可执行命令',
  '移除': '移除',
  '添加': '添加',
  '名单为空时只有属主可用。': '名单为空时只有属主可用。',
  '对方的平台 id，回车添加': '对方的平台 id，回车添加',
  // 版本与更新（version-panel.js）
  '当前页面不支持渠道子槽。': '当前页面不支持渠道子槽。',
  '设置': '设置',
  '机器人': '机器人',
  '每个机器人一行；点「设置」进入它的设置页（上下文增强、主动投递、工作区…）。':
    '每个机器人一行；点「设置」进入它的设置页（上下文增强、主动投递、工作区…）。',
  '这个渠道还没有机器人': '这个渠道还没有机器人',
  '在渠道设置页完成接入（飞书填应用凭据、微信扫码）后，机器人会出现在这里。':
    '在渠道设置页完成接入（飞书填应用凭据、微信扫码）后，机器人会出现在这里。',
  '未命名机器人': '未命名机器人',
  '这台机器人没有可用的身份标识，无法单独配置': '这台机器人没有可用的身份标识，无法单独配置',
  '渠道设置': '渠道设置',
  '打开渠道设置页': '打开渠道设置页',
  '← 机器人列表': '← 机器人列表',
  '已处理': '已处理',
  '最近': '最近',
  '运行正常': '运行正常',
  '正在启动': '正在启动',
  '重连中': '重连中',
  '已停止': '已停止',
  '版本与更新': '版本与更新',
  '收起版本与更新': '收起版本与更新',
  '升级插件后需要重启 dsh；只改设置页代码则刷新页面即可。':
    '升级插件后需要重启 dsh；只改设置页代码则刷新页面即可。',
  'Chat机器人内核': 'Chat机器人内核',
  '渠道契约版本': '渠道契约版本',
  '数据目录': '数据目录',
  '日志目录': '日志目录',
  '读取失败': '读取失败',
  '更新方式：在仓库里拉取新代码后重新打包，再让 DSH 重新加载插件。':
    '更新方式：在仓库里拉取新代码后重新打包，再让 DSH 重新加载插件。',
  '发一条测试消息': '发一条测试消息',
  '选择目标': '选择目标',
  '发送': '发送',
  '发送中…': '发送中…',
  '测试消息内容': '测试消息内容',
};

export const en = {
  'Chat机器人': 'Chat bot',
  'Chat机器人设置': 'Chat bot settings',
  '渠道导航': 'Channel navigation',
  '未安装任何聊天软件插件': 'No chat channel plugin installed',
  '安装渠道插件后，这里会出现对应的聊天软件。':
    'Install a channel plugin and its chat service appears here.',
  '已知渠道插件': 'Known channel plugins',
  '渠道正在启动': 'Starting',
  '渠道已就绪': 'Ready',
  '渠道启动失败': 'Failed to start',
  '渠道已停止': 'Stopped',
  '重新读取': 'Reload',
  '读取中…': 'Loading…',
  '上下文增强': 'Context enhancement',
  '任务过程展示': 'Task progress display',
  '保存': 'Save',
  '保存中…': 'Saving…',
  '取消': 'Cancel',
  '保存失败，请重试。': 'Could not save. Try again.',
  // 主动投递
  '主动投递': 'Proactive delivery',
  '让定时任务或 agent 把结果直接发到指定会话。':
    'Let a scheduled job or an agent push results straight into a conversation.',
  '私聊': 'Direct',
  '群聊': 'Group',
  '候选': 'Candidate',
  '保存为投递目标': 'Save as target',
  '删除': 'Delete',
  '确认删除': 'Confirm delete',
  '当前渠道不支持主动投递。': 'This channel does not support proactive delivery.',
  '已保存，现在可以主动发消息了。': 'Saved. You can now send proactively.',
  '已删除。': 'Deleted.',
  '还没有可添加的会话：在群里 @ 一次机器人，或与它私聊一次，会话就会出现在这里，保存后即可主动投递。':
    'No conversation to add yet: mention the bot once in a group, or send it a direct '
    + 'message — the conversation then shows up here and can be saved for proactive delivery.',
  '没有可添加的会话：在群里 @ 一次机器人，或与它私聊一次，该会话就会出现在这里。':
    'No conversation to add: mention the bot once in a group, or send it a direct message, and that conversation shows up here.',
  '上面标「候选」的会话还不能主动投递，点「保存为投递目标」后才行。':
    'A conversation marked "Candidate" cannot receive proactive messages yet — press "Save as target" first.',
  '已保存': 'Saved',
  '可添加的候选': 'Candidates',
  '展开全部': 'Show all',
  '收起': 'Collapse',
  '按名字或 id 过滤': 'Filter by name or id',
  '没有匹配的目标。': 'No target matches the filter.',
  '填入示例': 'Fill with example',
  '清空': 'Clear',
  '来源字段': 'Source fields',
  '启用': 'Enabled',
  '备注名（可选）': 'Display name (optional)',
  '张三': 'Alice',
  '新增': 'Add',
  '还没有指定设置。': 'Nothing configured yet.',
  '关闭': 'Close',
  '增强提示词': 'Prepended prompt',
  '告诉模型如何使用来源字段。只填正文，插件会自动包成来源增强块。': 'Tell the model how to use the source fields. Write the body only — the plugin wraps it into a source block.',
  '叠加全局提示词（不勾选则只使用上面的专属提示词）': 'Also stack the global prompt (unchecked: use only the prompt above)',
  '上下文增强': 'Context enhancement',
  '未开启': 'Off',
  '来源字段只在当前消息已提供时才会发送，不会额外查询平台接口。': 'Source fields are sent only when the incoming message already carries them; no extra platform calls are made.',
  '上下文增强范围': 'Context enhancement scope',
  '已开启': 'On',
  // 机器人设置页的共享编辑块（bot-shared-settings.js）
  '工作区': 'Workspace',
  '机器人跑在哪个目录：能读写哪些文件、用哪份 AGENTS.md。只对新建会话生效。':
    'Which directory the bot runs in: which files it may read and write, and which AGENTS.md'
    + 'applies. Applies to new conversations only.',
  '目录': 'Directory',
  '下拉里是这台机器人用过的目录。': 'The suggestions are directories this bot has used before.',
  'Agent 预设': 'Agent preset',
  '这个机器人用哪套 Agent 预设（人设与工具集）。只对新建会话生效。':
    'Which agent preset this bot uses (persona and tool set). Applies to new conversations only.',
  '当前 Host 读不到 Agent Preset 列表。': 'This Host does not expose an agent preset list.',
  '跟随 Host 默认': 'Follow the Host default',
  '访问策略': 'Access policy',
  '谁能跟机器人说话、谁能执行命令。改动立即生效；属主始终可用。':
    'Who may talk to the bot and who may run commands. Changes apply immediately;'
    + 'the owner always has access.',
  '访问模式': 'Access mode',
  '仅名单内可用': 'Allowlist only',
  '任何人可用': 'Anyone',
  '允许执行命令': 'Allow commands',
  '可执行命令': 'Allow commands',
  '移除': 'Remove',
  '添加': 'Add',
  '名单为空时只有属主可用。': 'An empty allowlist means only the owner can use it.',
  '对方的平台 id，回车添加': 'Their platform id — press Enter to add',
  '当前页面不支持渠道子槽。': 'This page does not support channel sub-slots.',
  '设置': 'Settings',
  '机器人': 'Bots',
  '每个机器人一行；点「设置」进入它的设置页（上下文增强、主动投递、工作区…）。':
    'One row per bot; click Settings to open its page (context enhancement, proactive delivery, workspace…).',
  '这个渠道还没有机器人': 'No bot on this channel yet',
  '在渠道设置页完成接入（飞书填应用凭据、微信扫码）后，机器人会出现在这里。':
    'Finish onboarding on the channel page (Feishu app credentials, WeChat QR scan) and the bot shows up here.',
  '未命名机器人': 'Unnamed bot',
  '这台机器人没有可用的身份标识，无法单独配置':
    'This bot has no usable identity, so it cannot be configured separately',
  '渠道设置': 'Channel settings',
  '打开渠道设置页': 'Open channel settings',
  '← 机器人列表': '← Bot list',
  '已处理': 'Handled',
  '最近': 'Last',
  '运行正常': 'Running',
  '正在启动': 'Starting',
  '重连中': 'Reconnecting',
  '已停止': 'Stopped',
  '版本与更新': 'Version & updates',
  '收起版本与更新': 'Hide version & updates',
  '升级插件后需要重启 dsh；只改设置页代码则刷新页面即可。':
    'Upgrading the plugin needs a dsh restart; settings-only changes just need a page refresh.',
  'Chat机器人内核': 'Chat bot core',
  '渠道契约版本': 'Channel contract version',
  '数据目录': 'Data directory',
  '日志目录': 'Log directory',
  '读取失败': 'Failed to read',
  '更新方式：在仓库里拉取新代码后重新打包，再让 DSH 重新加载插件。':
    'To update: pull the repo, rebuild, then let DSH reload the plugin.',
  '发一条测试消息': 'Send a test message',
  '选择目标': 'Choose a target',
  '发送': 'Send',
  '发送中…': 'Sending…',
  '测试消息内容': 'Test message',
};

/**
 * 绑定一个命名空间的翻译函数。
 *
 * @param locale - DSH client 的 locale 服务。
 * @returns (key) => string。
 */
export function bindTranslator(locale) {
  const dictionary = { zh, en };
  return (key) => {
    const language = locale?.getSnapshot?.()?.locale ?? 'zh';
    const table = dictionary[language] ?? zh;
    return table[key] ?? zh[key] ?? key;
  };
}
