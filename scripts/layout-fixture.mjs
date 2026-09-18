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
import {
  AccessPolicyEditor, PresetEditor, WorkspaceEditor,
} from '../packages/dsh-chat/client/bot-shared-settings.js';
import { ScopedModeEditor } from '../packages/dsh-chat/client/scoped-mode-editor.js';
// 用真的 Panel（不是手写复刻）：投递列表靠它渲染卡片外壳，复刻会跟着组件漂移。
import { Panel } from '../packages/dsh-chat/client/chat-ui.js';
import { installChatStyles } from '../packages/dsh-chat/client/styles.js';

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

/** 极简 chatUi 桩：只提供被渲染组件用到的那几个面。 */
const chatUi = {
  components: { Panel },
  hooks: {},
  translate: t,
  unwrapRpc: (result) => {
    if (result?.ok === true) return result.value;
    throw new Error(result?.error?.message ?? 'rpc failed');
  },
  callControlRpc: async (connection, method) => {
    if (method === 'delivery.list') {
      return {
        ok: true,
        value: {
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
        },
      };
    }
    return { ok: true, value: {} };
  },
};

const TARGETS = [
  { id: '#/properties/status', name: '运行正常' },
];

const FRAGMENTS = {
  delivery: () => h(DeliveryTargetsEditor, {
    chatUi, connection: {}, channelId: 'feishu', botId: 'bot_1', translate: t,
  }),
  shared: () => h(React.Fragment, null,
    h(WorkspaceEditor, {
      value: '/Users/zhang3/yh_zhang3/Project/dsh插件/dsh-chat',
      options: ['/Users/zhang3', '/Users/zhang3/yh_zhang3/Project/dsh插件/dsh-chat'],
      translate: t,
      onSave: async () => {},
    }),
    h(PresetEditor, { value: 'standard', options: [{ id: 'standard' }], translate: t, onSave: async () => {} }),
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
      translate: t,
      onSave: async () => {},
    })),
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
      }))
      .filter((item) => item.over > 1)
      .sort((left, right) => right.over - left.over)
      .slice(0, 3);
    results.push({
      scenario: frame.dataset.scenario,
      width: Number(frame.dataset.frame),
      cards,
      overflow,
      tall,
      widest,
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
  measure();
  measured += 1;
}
settle();
setTimeout(settle, 50);
