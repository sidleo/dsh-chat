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
  '私聊': 'Direct',
  '移除': 'Remove',
  '群聊': 'Group',
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
    WorkspaceEditor, PresetEditor, ModelEditor, AccessPolicyEditor,
    PanelSectionsEditor } = chatUi.components;
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

  return h(Panel, {
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

  h(AccessPolicyEditor, {
    value: shared.accessPolicy,
    translate: t,
    onSave: settings.saveAccessPolicy,
  }),

  h(PanelSectionsEditor, {
    value: shared.panelSections ?? null,
    disabled: settings.phase !== 'ready',
    translate: t,
    onSave: settings.savePanelSections,
  }),

  h(ContextEnhancementEditor, {
    config: settings.record?.contextEnhancement ?? null,
    disabled: settings.phase !== 'ready',
    translate: t,
    onSave: settings.saveContextEnhancement,
    // 「指定用户」用平台 userId（route.userId），不是投递目标 id。
    conversations: sessions,
  }),

  // 渠道无关面板：目标清单与测试发送都由 hub 的共享组件负责。
  h(DeliveryTargetsEditor, {
    chatUi,
    connection,
    channelId: CHANNEL_ID,
    botId: account.botId,
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
      groups: false,
      note: t('仅私聊'),
      // 微信的渠道设置页就是「扫码接入」：入口名与空状态说明都由渠道给（hub 不认识这些语义）。
      setup: { label: t('扫码接入'), hint: t('点「扫码接入」用手机微信扫码绑定新账号。') },
    },
  }), 'dsh-chat-weixin: 渠道元数据');

  ctx.effect(() => ctx.slots.inject(PAGE_SLOT, () => ctx.slots.register({
    name: PAGE_SLOT,
    key: CHANNEL_ID,
    locale: LOCALE_NAMESPACE,
    inject: () => ({ chatUi: ctx.chatUi, connection: ctx.connection, translate: t }),
  }, WeixinPage)), 'dsh-chat-weixin: 渠道设置页');
}
