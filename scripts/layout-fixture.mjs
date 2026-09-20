/**
 * 布局守门测试的页面入口（由 scripts/check-layout.mjs 用 esbuild 打包后在 headless Chrome 里跑）。
 *
 * 为什么要有它：这两轮里同一类问题栽了三次——窄栏里中文被压成"一字一行"（卡片头、
 * 机器人行）、以及下拉框把「发送」挤出容器导致整页横向滚动。它们**语法与单测都发现不了**，
 * 只能真的渲染出来量。所以这里用**真实组件 + 真实样式**在固定宽度下渲染，然后把
 * "有没有横向溢出 / 关键控件有没有被折成多行"写进 DOM，交给 Node 侧断言。
 *
 * 注意：这里刻意不手写 DOM 复刻——复刻会跟着组件一起漂移，等于没测。
 *
 * @module dsh-chat/layout-fixture
 */

import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { DeliveryTargetsEditor } from '../packages/dsh-chat/client/delivery-targets.js';
import { DiagnosticsPanel } from '../packages/dsh-chat/client/diagnostics.js';
import {
  AccessPolicyEditor, ModelEditor, OwnerEditor, PresetEditor, WorkspaceEditor,
} from '../packages/dsh-chat/client/bot-shared-settings.js';
import { ScopedModeEditor } from '../packages/dsh-chat/client/scoped-mode-editor.js';
// 用真的 Panel / chatUi 工厂（不是手写复刻）：投递列表与整张渠道卡都靠它渲染外壳，
// 复刻会跟着组件漂移。
import { Panel, StatusPill, createChatUi } from '../packages/dsh-chat/client/chat-ui.js';
import { ChatSettingsSection } from '../packages/dsh-chat/client/section.js';
import { createChannelRail } from '../packages/dsh-chat/shared/channel-rail.mjs';
import { installChatStyles } from '../packages/dsh-chat/client/styles.js';
// 整张渠道卡：真机上"卡片头逐字竖排"就是它们炸的，而单测与构建都发现不了。
import { BotCard as FeishuBotCard, FeishuOnboard } from '../packages/dsh-chat-feishu/client/index.js';
import { AccountCard as WeixinAccountCard } from '../packages/dsh-chat-weixin/client/index.js';

const h = React.createElement;

// 出错就把原因写进 DOM：否则 Node 侧只能报一句"可能渲染时抛错了"。
function reportError(error) {
  document.getElementById('dsh-layout-error')?.remove();
  const pre = document.createElement('pre');
  pre.id = 'dsh-layout-error';
  pre.textContent = `${error?.stack ?? error}`;
  document.body.appendChild(pre);
}
window.addEventListener('error', (event) => reportError(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => reportError(event.reason));

installChatStyles(document);

const t = (key) => key;

/** 真实形态的机器人状态（取自 connection.status）：整张渠道卡与诊断面板共用。 */
const FEISHU_STATUS = {
  id: 'bot_1f4c7a9e2b5d83406a1c3e5f7b9d0a2c',
  appIdMasked: 'cli_7b9d1a****',
  domain: 'feishu',
  state: 'running',
  error: null,
  errorMessage: null,
  connected: true,
  ownerCount: 1,
  ownersWildcard: false,
  ownerOpenIds: ['ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5'],
  groupResponseMode: 'mention',
  groupTopicReply: false,
  stepPush: { direct: 'card', group: 'card' },
  handled: 128,
  lastHandledAt: '2026-09-19T02:21:57.000Z',
  lastError: null,
  nameHint: {
    code: 'feishu/scope-missing',
    message: '读不到群名：飞书应用还没开通对应权限，所以只能显示 id。开通后点「重新连接」立刻生效。',
    url: 'https://open.feishu.cn/app/cli_7b9d1a2c4e6f8035/auth?q=im:chat:readonly',
  },
};
const SECOND_BOT_STATUS = {
  ...FEISHU_STATUS,
  id: 'bot_6d2b8f1a4c7e9350b2d4f6a8c0e1b3d5',
  appIdMasked: 'cli_a9fa3a****',
  handled: 7,
  lastHandledAt: null,
  errorMessage: '呈现层发不出去：卡片被删了',
  lastError: '回复超时：15 分钟没有任何事件',
  nameHint: null,
};
const WEIXIN_STATUS = {
  id: 'wx_0f2d168cd6b0883e2ab7a445',
  state: 'running',
  connected: true,
  handled: 12,
  lastHandledAt: '2026-09-19T01:10:00.000Z',
  errorMessage: null,
  lastError: null,
  nameHint: null,
  loggedIn: true,
};

/** 渠道卡要的原始配置项（不是 status —— 卡片同时用这两个）。 */
const FEISHU_BOT = { id: FEISHU_STATUS.id, name: '张三-DSH', appIdMasked: FEISHU_STATUS.appIdMasked };
const WEIXIN_ACCOUNT = {
  botId: WEIXIN_STATUS.id,
  botName: '张三（微信）',
  accountIdMasked: 'wx_0f2d****',
  state: 'running',
  loggedIn: true,
};

/**
 * 假的 RPC 传输层。
 *
 * 为什么不做成"stub 掉 chatUi.callControlRpc"：hooks 是直接 `import { callControlRpc }`
 * 的，只有把 `connection.rpc.call` 换掉，真实 hook（useBotSettings/useConversations）
 * 与整张渠道卡才会走完整链路渲染——这正是"真机才炸"的那一层。
 */
const RPC_FIXTURES = {
  'bot.settings.get': () => ({
    settings: {
      workspace: '/Users/zhang3/yh_zhang3/Project/dsh插件/dsh-chat',
      agentPreset: 'standard',
      accessPolicy: {
        direct: {
          mode: 'allowlist',
          open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] },
          allowlist: { users: [{ id: 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5', canExecuteCommands: true }] },
        },
        group: { mode: 'open', open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] }, allowlist: { users: [] } },
      },
      contextEnhancement: null,
      // 显示项：群聊关掉"访问策略"（渲染出来的勾选框要反映它）。
      panelSections: { direct: { policy: false }, group: { policy: false, commands: true } },
    },
  }),
  'bot.settings.options': () => ({
    workspacePaths: ['/Users/zhang3', '/Users/zhang3/yh_zhang3/Project/dsh插件/dsh-chat'],
    presets: [{ id: 'standard' }, { id: 'yh-olap' }],
  }),
  'bot.conversations': () => ({
    conversations: [
      {
        id: 'p2p_ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5',
        kind: 'direct',
        name: '赵六',
        // 两个平台的字段名各来一份：飞书读 openId、微信读 userId，同一份 fixture 两边都能用。
        route: { openId: 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5', userId: 'wx_user_1' },
      },
      {
        id: 'group_oc_5086a1b2c3d4e5f60718293a4b5c6d7e',
        kind: 'group',
        name: '日报临时推送群',
        route: { chatId: 'oc_5086a1b2c3d4e5f60718293a4b5c6d7e' },
      },
    ],
  }),
  'delivery.list': () => ({
    canSend: true,
    targets: [
      { id: 'group_oc_saved', name: '日报临时推送群', kind: 'group', route: { chatId: 'oc_saved' } },
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `group_oc_${index}`,
        name: `很长的群名字第${index}号用于测试换行与省略`,
        kind: 'group',
        route: { chatId: `oc_${index}` },
        discovered: true,
      })),
    ],
  }),
  'channel.list': () => ({
    contractVersion: 1,
    hubVersion: '0.1.0',
    hubPackage: 'dsh-chat',
    dataDir: '/Users/zhang3/.dsh/integrations/dsh-chat',
    logDir: '/Users/zhang3/.dsh/integrations/dsh-chat/logs',
    channels: [
      { id: 'feishu', label: '飞书', order: 1, version: '0.0.1', status: 'running', error: null, startedAt: null },
      { id: 'weixin', label: '微信', order: 2, version: '0.0.1', status: 'stopped', error: null, startedAt: null },
    ],
  }),
  // 渠道自己的端点（整张渠道卡会读它）。
  // 微信给空列表：hub 页的机器人列表要能渲染"这个渠道还没接入"的空状态。
  'connection.status': (payload) => ({
    channel: payload?.__channelId ?? 'feishu',
    bots: payload?.__channelId === 'weixin' ? [] : [FEISHU_STATUS],
  }),
  // 诊断面板：真实形态的数据（含失败行、权限提示、超长日志行）。
  'diagnostics.read': () => ({
    dataDir: '/Users/zhang3/.dsh/integrations/dsh-chat',
    logDir: '/Users/zhang3/.dsh/integrations/dsh-chat/logs',
    channels: [
      {
        id: 'feishu',
        label: '飞书',
        version: '0.0.1',
        status: 'running',
        error: null,
        statusError: null,
        bots: [FEISHU_STATUS, SECOND_BOT_STATUS],
      },
      { id: 'weixin', label: '微信', version: '0.0.1', status: 'stopped', error: null, statusError: null, bots: [] },
    ],
    logs: [
      {
        path: '/Users/zhang3/.dsh/integrations/dsh-chat/logs/feishu.log',
        exists: true,
        size: 128970,
        modifiedAt: '2026-09-19T02:21:57.000Z',
        lines: [
          '2026-09-19T02:21:57.601Z WARN  [dsh-chat-feishu] 读取群列表失败，群名将退回 id：读取群列表失败：Access denied. One of the following scopes is required: [im:chat:readonly, im:chat, im:chat.group_info:readonly, im:chat:read]（code 99991672）',
          '2026-09-19T02:22:03.114Z INFO  [dsh-chat-feishu] 张三 长连接已就绪',
        ],
      },
      {
        path: '/Users/zhang3/.dsh/integrations/dsh-chat/logs/hub.log',
        exists: true,
        size: 36181,
        modifiedAt: '2026-09-19T02:37:36.000Z',
        lines: ['2026-09-19T02:37:36.661Z INFO  [dsh-chat] 收到提问请求：会话=session-cc4e3ab1-dbe4-4170-b4bf-90cb34e5aa72 问题数=1 认领=否'],
      },
    ],
  }),
};

const connection = {
  rpc: {
    async call(_prefix, endpoint, request) {
      const method = request?.method;
      const build = RPC_FIXTURES[method];
      if (!build) return { ok: false, error: { code: 'chat/unknown-method', message: `fixture 未提供 ${method}` } };
      // 端点名形如 `dsh-chat/<channelId>`：按渠道给出对应的机器人，左栏切换才像真的。
      const channelId = String(endpoint ?? '').split('/').pop();
      return { ok: true, value: build({ ...(request?.payload ?? {}), __channelId: channelId }) };
    },
  },
};

/** chatUi 用真工厂：组件与 hook 都是产品代码，只有传输层是假的。 */
const chatUi = createChatUi({ translate: t });

/** 渠道 rail：真实现 + 两条注册（顺序与能力说明照产品形态来）。 */
const channels = createChannelRail();
// 顺序照**产品真实值**来（微信 10、飞书 20）：这样"注册顺序里的第一个"与"用户排的第一个"
// 正好相反，守门才分得清"默认跟注册顺序"还是"默认跟用户顺序"。
channels.register({
  id: 'feishu',
  order: 20,
  label: '飞书',
  // 飞书的入口 = 「新建机器人接入」（填自建应用的 App ID + App Secret），空列表时用渠道给的提示。
  capabilities: {
    note: '支持私聊与群聊',
    setup: { label: '新建机器人接入', hint: '把凭据加进 config.json 后重启 dsh。' },
  },
});
channels.register({
  id: 'weixin',
  order: 10,
  label: '微信',
  // 两个渠道各覆盖 `capabilities.setup` 的一种"只给一半"的形态：飞书只给 `hint`
  // （无入口、空列表用 hub 那句中性说明）、微信只给 `label`（有入口、空列表同样退回中性句）。
  capabilities: { note: '仅私聊', setup: { label: '扫码接入' } },
});

const feishuCard = () => h(FeishuBotCard, {
  bot: FEISHU_BOT, status: FEISHU_STATUS, chatUi, connection, translate: t, onChanged: async () => {},
});
const weixinCard = () => h(WeixinAccountCard, {
  account: WEIXIN_ACCOUNT, status: WEIXIN_STATUS, chatUi, connection, translate: t, onChanged: async () => {},
});

/** hub 设置页整页：页头（诊断 / 版本与更新）+ 左栏渠道 + 右栏机器人列表（真实 section）。 */
function HubPage() {
  return h(ChatSettingsSection, {
    channels,
    chatUi,
    translate: t,
    connection,
    renderSlot: (_name, params) => (params?.channelId === 'weixin' ? weixinCard() : feishuCard()),
  });
}

const TARGETS = [
  { id: '#/properties/status', name: '运行正常' },
];

const FRAGMENTS = {
  delivery: () => h(DeliveryTargetsEditor, {
    chatUi, connection, channelId: 'feishu', botId: FEISHU_STATUS.id, translate: t,
  }),
  // 改名态：输入框 + 两个按钮同排，窄栏最容易挤爆。
  deliveryRename: () => h(DeliveryTargetsEditor, {
    chatUi, connection, channelId: 'feishu', botId: FEISHU_STATUS.id, translate: t,
  }),
  // 诊断面板：收起态与"展开日志尾部"态各测一遍（超长日志行的溢出风险在展开后）。
  diagnostics: () => h(DiagnosticsPanel, { chatUi, connection, translate: t }),
  diagnosticsOpen: () => h(DiagnosticsPanel, { chatUi, connection, translate: t }),
  // 整张渠道卡：数据全部由上面的假传输层供给，组件与 hook 都是产品代码。
  feishuCard,
  weixinCard,
  // 新建机器人接入的表单：四个控件（三个输入框 + 一个下拉）在 320px 下也要排得下。
  feishuOnboard: () => h(FeishuOnboard, {
    chatUi, connection, translate: t, onAdded: async () => {},
  }),
  // hub 页头 + 左栏 + 机器人列表：右上角两个入口（诊断 / 版本与更新）在窄栏下也得排得下。
  hubPage: () => h(HubPage),
  hubPageOpen: () => h(HubPage),
  shared: () => h(React.Fragment, null,
    h(WorkspaceEditor, {
      value: '/Users/zhang3/yh_zhang3/Project/dsh插件/dsh-chat',
      options: ['/Users/zhang3', '/Users/zhang3/yh_zhang3/Project/dsh插件/dsh-chat'],
      translate: t,
      onSave: async () => {},
    }),
    h(PresetEditor, { value: 'standard', options: [{ id: 'standard' }], translate: t, onSave: async () => {} }),
    // 默认模型：两个下拉（模型 + 推理等级），窄栏下也要排得下（守门覆盖它）。
    h(ModelEditor, {
      value: { provider: 'yh', model: 'gpt-5.5-luna', reasoningEffort: 'high' },
      options: [{
        value: 'yh/gpt-5.5-luna', provider: 'yh', model: 'gpt-5.5-luna',
        name: 'GPT-5.5 Luna', efforts: [{ id: 'high', label: '高' }],
      }],
      hostDefault: { provider: 'yh', model: 'gpt-5.5-luna' },
      failures: [],
      translate: t,
      onSave: async () => {},
    }),
    h(OwnerEditor, {
      owners: ['ou_9a1c3e5f7b2d4068a2c4e6f8b0d1a3c5'],
      wildcard: false,
      candidates: [{ id: 'ou_9a1c3e5f7b2d4068a2c4e6f8b0d1a3c5', name: '赵六' }],
      translate: t,
      onSave: async () => {},
    }),
    h(OwnerEditor, { owners: ['*'], wildcard: true, candidates: [], translate: t, onSave: async () => {} }),
    h(AccessPolicyEditor, {
      value: {
        direct: {
          mode: 'allowlist',
          open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] },
          allowlist: { users: [{ id: 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5', canExecuteCommands: true }] },
        },
        group: {
          mode: 'open',
          open: { defaultCanExecuteCommands: true, commandPermissionOverrides: [] },
          allowlist: { users: [] },
        },
      },
      // 渠道换回来的名字（`names.resolve`）：白名单行要显示"名字 + id"。
      names: { ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5: '李四' },
      translate: t,
      onSave: async () => {},
    })),
  // 白名单显示名：有名字的显示"名字 + id"，查不到的只显示 id，且把原因写在下面。
  policyNames: () => h(AccessPolicyEditor, {
    value: {
      direct: {
        mode: 'allowlist',
        open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] },
        allowlist: {
          users: [
            { id: 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5', canExecuteCommands: false },
            { id: 'ou_unknown_person_000000000000000000', canExecuteCommands: false },
          ],
        },
      },
      group: {
        mode: 'allowlist',
        open: { defaultCanExecuteCommands: false, commandPermissionOverrides: [] },
        allowlist: { users: [] },
      },
    },
    names: { ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5: '李四' },
    namesHint: { message: '读不到名单里的名字：飞书应用还没开通通讯录权限。' },
    translate: t,
    onSave: async () => {},
  }),
  scoped: () => h(ScopedModeEditor, {
    title: '任务过程展示',
    description: '设置执行过程的呈现方式；私聊与群聊分别生效',
    scopes: [{ key: 'direct', label: '私聊' }, { key: 'group', label: '群聊' }],
    options: [
      { value: 'off', label: '不显示过程（只发送最终答案）', help: '适合日常问答：执行过程中不显示工具调用等中间步骤，只回复最终结果' },
      { value: 'card', label: '实时过程卡（全程一张卡片动态更新）', help: '推荐长任务使用：过程与最终答案都在同一张卡片里实时更新，不刷屏' },
    ],
    value: { direct: 'card', group: 'card' },
    translate: t,
    onSave: async () => {},
  }),
};

/** 每个场景 × 每个宽度一个 frame：宽度写死在 data-frame 上，测的就是窄栏。 */
const WIDTHS = [549, 360, 320];

const frames = [];
for (const [name, render] of Object.entries(FRAGMENTS)) {
  for (const width of WIDTHS) {
    frames.push({ name, width });
  }
}

const root = createRoot(document.getElementById('root'));
// 必须同步提交：headless 的虚拟时间下，React 18 的并发渲染可能一直不提交，
// 那样测到的就是空 DOM（"没有渲染出卡片"），守门测试会变成空转。
flushSync(() => root.render(h(React.Fragment, null,
  frames.map((frame) => h('div', {
    key: `${frame.name}-${frame.width}`,
    'data-frame': frame.width,
    'data-scenario': frame.name,
    className: 'frame',
    style: { width: `${frame.width}px` },
  }, h(FRAGMENTS[frame.name]))))));

/** 等 React 的异步 effect（投递列表要等一次 RPC 桩）落地再量。 */
function measure() {
  const results = [];
  for (const frame of document.querySelectorAll('[data-frame]')) {
    const cards = frame.querySelectorAll('.dchat-card, .dchat-entry').length;
    const overflow = frame.scrollWidth - frame.clientWidth;
    // 会被"逐字竖排"毁掉的控件：多行高度就是症状（正常单行 ≈ lineHeight）。
    const tall = [...frame.querySelectorAll('.dchat-button, .dchat-status, .dchat-groupTitle')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 16;
        return {
          text: (el.textContent ?? '').trim().slice(0, 20),
          height: Math.round(rect.height),
          limit: Math.round(lineHeight * 1.8),
        };
      })
      .filter((item) => item.height > item.limit);
    // 溢出时指出"是谁伸出去的"，否则失败信息只能靠猜。
    const frameRect = frame.getBoundingClientRect();
    const widest = [...frame.querySelectorAll('*')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => ({
        selector: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''}`,
        over: Math.round(el.getBoundingClientRect().right - frameRect.right),
        // 带上文字，失败信息才能直接指出是哪一行（否则要靠猜）。
        text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
      }))
      .filter((item) => item.over > 1)
      .sort((left, right) => right.over - left.over)
      .slice(0, 3);
    /**
     * 设置页「控制面板显示项」的勾选状态也要量。
     *
     * 只测"没溢出"是不够的：真机上翻过车——渠道卡把 `shared` 里的字段漏了一项，
     * 组件拿到 null 就**永远显示全勾**，用户保存过的关闭项看起来根本没生效。
     * 假数据里 direct.policy=false / group.actions=false，渲染出来的勾选状态必须对得上。
     */
    /**
     * 弹窗里的页签面板：`hidden` 的那一个必须**真的不可见**。
     *
     * 这是全局的（弹窗通过 portal 挂在 body 上，不属于任何 frame），所以每个 frame 记一份同样的值，
     * 由守门那边断言一次。
     */
    /** 左栏渠道顺序与"当前默认打开的是哪个"：默认必须是排在最前面的那个。 */
    const railItems = [...frame.querySelectorAll('.dchat-rail .dchat-channel')];
    const railOrder = railItems.map((el) => (el.querySelector('strong')?.textContent ?? '').trim());
    // 右栏机器人列表头部的按钮文案（用来断言"渠道设置入口按渠道显示"）。
    const panelButtons = [...frame.querySelectorAll('.dchat-panel button, .dchat-cardHeader button')]
      .map((el) => (el.textContent ?? '').trim());
    // 空状态里的接入说明（列表为空时才有）。
    const emptyHint = (frame.querySelector('.dchat-empty, .dchat-emptyState')?.textContent ?? '').trim();
    const activeChannel = (railItems.find((el) => el.getAttribute('aria-selected') === 'true')
      ?.querySelector('strong')?.textContent ?? '').trim() || null;
    // 每个弹窗各算一份（每个渠道卡各点开过一次；弹窗是 portal，挂在 body 上）。
    const dialogs = [...document.querySelectorAll('.dchat-dialog')].map((dialog) => ({
      activeScope: dialog.querySelector('.dchat-tab[aria-selected="true"]')?.dataset?.scope ?? null,
      visible: [...dialog.querySelectorAll('.dchat-tabPanel')]
        .filter((el) => el.getClientRects().length > 0)
        .map((el) => el.dataset.scope),
      total: dialog.querySelectorAll('.dchat-tabPanel').length,
    }));
    const sectionChecks = [...frame.querySelectorAll('input[type="checkbox"][aria-label]')]
      .filter((el) => el.getAttribute('aria-label').includes(' · '))
      .map((el) => ({ label: el.getAttribute('aria-label'), checked: el.checked === true }));
    // 访问策略白名单行的文字（"名字 + id"）：只显示 id 时认不出是谁（真机反馈）。
    const policyNames = [...frame.querySelectorAll('.dchat-policyEntry')]
      .map((el) => (el.textContent ?? '').trim());
    results.push({
      scenario: frame.dataset.scenario,
      width: Number(frame.dataset.frame),
      cards,
      overflow,
      tall,
      widest,
      sectionChecks,
      dialogs,
      dragResult,
      railOrder,
      activeChannel,
      panelButtons,
      emptyHint,
      policyNames,
    });
  }
  document.getElementById('dsh-layout-result')?.remove();
  const pre = document.createElement('pre');
  pre.id = 'dsh-layout-result';
  pre.textContent = JSON.stringify(results);
  document.body.appendChild(pre);
  document.title = 'LAYOUT-DONE';
}

/**
 * 投递列表要等一次 RPC 桩的 promise 落地再量；同时用一轮超时兜底，
 * 取**最后一次**测量结果（异步 effect 之后的那次）。
 */
let measured = 0;
async function settle() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
  // 展开态（日志尾部 / 改名输入框）都由按钮控制：点一次再量，否则这些帧等于没测。
  const clicks = {
    diagnosticsOpen: ['看最后 40 行'],
    deliveryRename: ['重命名'],
    // 上下文增强弹窗：打开它才能测到"私聊/群聊两个页签只显示一个"（曾因作者样式压过
    // `[hidden]` 而两个都显示，真机上两个页签内容一模一样）。
    feishuCard: ['上下文增强'],
    weixinCard: ['上下文增强'],
    // hub 页头两个入口都展开：诊断面板 + 版本面板都得在窄栏里排得下。
    hubPageOpen: ['诊断', '版本与更新'],
  };
  for (const [scenario, labels] of Object.entries(clicks)) {
    for (const frame of document.querySelectorAll(`[data-scenario="${scenario}"]`)) {
      for (const button of frame.querySelectorAll('button')) {
        // 只"展开"不"收起"：settle 会跑两轮（立即 + 50ms 兜底），
        // 无脑点会把上一轮已经展开的面板又关掉，等于没测（踩过：版本面板计数为 0）。
        const expanded = button.getAttribute('aria-expanded');
        if (expanded === 'true') continue;
        if (labels.some((label) => (button.textContent ?? '').includes(label))) button.click();
      }
    }
  }
  await simulateDrag();
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
  measure();
  measured += 1;
}

/**
 * 拖动排序：模拟一次真实的 HTML5 拖放（dragstart → dragover → drop）。
 *
 * 为什么要在这儿做：拖动是纯前端的交互，单测只能覆盖排序函数，覆盖不到"事件接对了没"。
 * 只跑一次（两轮 settle 各拖一次会把顺序换回去，等于没测）。
 * 记录拖动前后的顺序，交给守门断言"顺序真的变了"。
 */
let dragAttempted = false;
const dragResult = { before: null, after: null };
async function simulateDrag() {
  if (dragAttempted) return;
  dragAttempted = true;
  const frame = document.querySelector('[data-scenario="hubPage"][data-frame="360"]')
    ?? document.querySelector('[data-scenario="hubPage"]');
  if (!frame) return;
  const labels = () => [...frame.querySelectorAll('.dchat-rail .dchat-channel strong')]
    .map((el) => el.textContent);
  dragResult.before = labels();
  const items = [...frame.querySelectorAll('.dchat-rail .dchat-channel')];
  const grip = items[0]?.querySelector('.dchat-grip');
  const target = items[1];
  if (!grip || !target || typeof DataTransfer !== 'function') return;
  const transfer = new DataTransfer();
  const fire = async (element, type, cancelable = false) => {
    element.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable, dataTransfer: transfer }));
    // 真实浏览器里这几次事件分属不同任务，中间会渲染；这里也让它落一轮宏任务。
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  };
  await fire(grip, 'dragstart');
  await fire(target, 'dragover', true);
  await fire(target, 'drop', true);
  await fire(grip, 'dragend');
  dragResult.after = labels();
}
settle();
setTimeout(settle, 50);
