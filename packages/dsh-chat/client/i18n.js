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
  '让定时任务或 agent 把结果直接发到指定会话；候选来自与该机器人的历史会话。':
    '让定时任务或 agent 把结果直接发到指定会话；候选来自与该机器人的历史会话。',
  '私聊': '私聊',
  '群聊': '群聊',
  '候选': '候选',
  '保存为投递目标': '保存为投递目标',
  '删除': '删除',
  '确认删除': '确认删除',
  '当前渠道不支持主动投递。': '当前渠道不支持主动投递。',
  '还没有可投递目标：先与机器人对话一次，会话会作为候选出现在这里。':
    '还没有可投递目标：先与机器人对话一次，会话会作为候选出现在这里。',
  '已保存，现在可以主动发消息了。': '已保存，现在可以主动发消息了。',
  '已删除。': '已删除。',
  '候选目标需要先保存，保存后才能主动发送。': '候选目标需要先保存，保存后才能主动发送。',
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
  '让定时任务或 agent 把结果直接发到指定会话；候选来自与该机器人的历史会话。':
    'Let a scheduled job or an agent push results straight into a conversation. '
    + 'Candidates come from conversations this bot has already taken part in.',
  '私聊': 'Direct',
  '群聊': 'Group',
  '候选': 'Candidate',
  '保存为投递目标': 'Save as target',
  '删除': 'Delete',
  '确认删除': 'Confirm delete',
  '当前渠道不支持主动投递。': 'This channel does not support proactive delivery.',
  '还没有可投递目标：先与机器人对话一次，会话会作为候选出现在这里。':
    'No delivery target yet: talk to the bot once and the conversation shows up here as a candidate.',
  '已保存，现在可以主动发消息了。': 'Saved. You can now send proactively.',
  '已删除。': 'Deleted.',
  '候选目标需要先保存，保存后才能主动发送。':
    'A candidate must be saved before it can receive proactive messages.',
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
