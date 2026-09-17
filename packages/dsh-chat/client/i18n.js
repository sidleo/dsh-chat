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
