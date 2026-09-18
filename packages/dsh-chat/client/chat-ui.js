/**
 * hub 提供给各渠道插件的共享 UI 组件。
 *
 * 渠道页只需要自己的协议相关内容与渠道卡片，工作区/模型/预设/**上下文增强**等
 * 渠道无关面板直接复用这里的组件（实现只在 hub 一份）。
 *
 * @module dsh-chat/client/chat-ui
 */

import * as React from 'react';

import { CONTRACT_VERSION } from '../shared/contract.mjs';
import { useBotSettings } from './bot-settings.js';
import { AccessPolicyEditor, PresetEditor, WorkspaceEditor } from './bot-shared-settings.js';
import { ContextEnhancementEditor } from './context-enhancement.js';
import { DeliveryTargetsEditor } from './delivery-targets.js';
import { callChatRpc, callControlRpc, unwrapRpc } from './rpc.js';
import { ScopedModeEditor } from './scoped-mode-editor.js';
import { installChatStyles } from './styles.js';

const h = React.createElement;

/**
 * 通用卡片。
 *
 * @param props - { title, description, actions, children }。
 * @returns React 元素。
 */
export function Panel({ title, description, actions, children }) {
  return h('section', { className: 'dchat-card' },
    title || description || actions
      ? h('div', { className: 'dchat-cardHeader' },
        h('div', { className: 'dchat-cardHeading' },
          title ? h('h3', { className: 'dchat-cardTitle' }, title) : null,
          description ? h('p', { className: 'dchat-cardDescription' }, description) : null),
        actions ? h('div', { className: 'dchat-actions' }, actions) : null)
      : null,
    children);
}

/**
 * 空态提示。
 *
 * @param props - { title, description, children }。
 * @returns React 元素。
 */
export function EmptyState({ title, description, children }) {
  return h('div', { className: 'dchat-empty' },
    h('span', { className: 'dchat-emptyTitle' }, title),
    description ? h('span', null, description) : null,
    children);
}

const TONES = Object.freeze({
  starting: 'warning',
  running: 'success',
  failed: 'error',
  stopped: '',
});

/**
 * 渠道/机器人状态点。
 *
 * @param props - { status, label }。
 * @returns React 元素。
 */
export function StatusPill({ status, label }) {
  return h('span', {
    className: 'dchat-status',
    'data-tone': TONES[status] ?? '',
    'data-status': status,
  }, label ?? status);
}

/**
 * 创建 hub UI 套件（作为 client 服务 `chatUi` 发布）。
 *
 * @param options - { ctx, translate }。
 * @returns 冻结的 UI 套件。
 */
export function createChatUi({ ctx, translate } = {}) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  return Object.freeze({
    version: CONTRACT_VERSION,
    components: Object.freeze({
      Panel,
      EmptyState,
      StatusPill,
      /** 上下文增强（群聊/私聊全局 + 指定用户/指定群 + 是否叠加全局提示词）。 */
      ContextEnhancementEditor,
      /** 通用"两作用域 × 多选项"设置块（如飞书任务过程展示）。 */
      ScopedModeEditor,
      /** 机器人跑在哪个目录（只对新建会话生效）。 */
      WorkspaceEditor,
      /** 用哪套 Agent 预设（只对新建会话生效）。 */
      PresetEditor,
      /** 谁能跟机器人说话、谁能执行命令（立即生效）。 */
      AccessPolicyEditor,
      /** 主动投递目标：清单、候选收编、测试发送（数据经 hub 控制端点）。 */
      DeliveryTargetsEditor,
    }),
    hooks: Object.freeze({
      /** 读取/保存 hub 持有的每机器人共享设置。 */
      useBotSettings,
    }),
    installStyles: () => installChatStyles(),
    /** 调用本渠道自己的 RPC。 */
    callChannelRpc: (connection, channelId, method, payload, signal) => (
      callChatRpc(connection, channelId, method, payload, signal)
    ),
    /** 调用 hub 控制端点（渠道无关设置，如上下文增强）。 */
    callControlRpc: (connection, method, payload, signal) => (
      callControlRpc(connection, method, payload, signal)
    ),
    unwrapRpc,
    translate: t,
    /** 供渠道页复用的 React 运行时（渠道包只 external react/react-dom，无需各写一份）。 */
    react: React,
    createElement: h,
    /** hub 当前提供的契约版本，渠道页可据此显示兼容信息。 */
    contractVersion: CONTRACT_VERSION,
    context: Object.freeze({ has: () => typeof ctx === 'object' }),
  });
}
