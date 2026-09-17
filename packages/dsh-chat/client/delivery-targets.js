/**
 * 主动投递目标编辑器（hub 提供的共享组件）。
 *
 * 渠道页把它挂在每个机器人卡片下：目标清单、候选收编、以及"发一条测试消息"。
 * 数据一律经 hub 控制端点（`delivery.list/save/remove/send`），渠道不必实现任何
 * 投递 UI，也不需要知道目标长什么样。
 *
 * 文案走 hub 自己的命名空间（默认用 `chatUi.translate`），渠道页因此不必再抄一份字符串。
 *
 * @module dsh-chat/client/delivery-targets
 */

import * as React from 'react';

const h = React.createElement;

function translatorOf(translate, chatUi) {
  if (typeof translate === 'function') return translate;
  if (typeof chatUi?.translate === 'function') return chatUi.translate;
  return (key) => key;
}

/** 一个目标的一行：名称、类型、路由与操作（候选可保存，已保存可删除）。 */
function TargetRow({ target, busy, confirming, translate, onSave, onAskRemove, onCancel, onRemove }) {
  const t = translate;
  const route = Object.entries(target.route ?? {})
    .map(([key, value]) => `${key}=${value}`).join(' · ');
  const actions = target.discovered
    ? [h('button', {
      key: 'save',
      type: 'button',
      className: 'dchat-button dchat-buttonPrimary',
      disabled: busy,
      onClick: () => onSave(target),
    }, t('保存为投递目标'))]
    : (confirming
      ? [
        h('button', {
          key: 'confirm',
          type: 'button',
          className: 'dchat-button',
          disabled: busy,
          onClick: () => onRemove(target),
        }, t('确认删除')),
        h('button', {
          key: 'cancel',
          type: 'button',
          className: 'dchat-button',
          disabled: busy,
          onClick: onCancel,
        }, t('取消')),
      ]
      : [h('button', {
        key: 'remove',
        type: 'button',
        className: 'dchat-button',
        disabled: busy,
        onClick: onAskRemove,
      }, t('删除'))]);

  return h('div', { className: 'dchat-listItem dchat-deliveryRow' },
    h('div', { className: 'dchat-deliveryMeta' },
      h('strong', null, target.name || target.id),
      h('small', null, `${target.kind === 'group' ? t('群聊') : t('私聊')} · ${route}`),
      h('code', { className: 'dchat-code' }, target.id)),
    h('div', { className: 'dchat-actions' },
      target.discovered ? h('span', { className: 'dchat-status' }, t('候选')) : null,
      ...actions));
}

/**
 * 投递目标编辑器。
 *
 * @param props - { chatUi, connection, channelId, botId, translate? }。
 * @returns React 元素。
 */
export function DeliveryTargetsEditor({ chatUi, connection, channelId, botId, translate }) {
  const t = translatorOf(translate, chatUi);
  const { Panel } = chatUi.components;
  const [state, setState] = React.useState({ phase: 'loading', targets: [], canSend: false });
  const [error, setError] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const [busyId, setBusyId] = React.useState(null);
  const [confirmingId, setConfirmingId] = React.useState(null);
  const [draft, setDraft] = React.useState('');
  const [sendTo, setSendTo] = React.useState('');

  const call = React.useCallback(async (method, payload) => {
    const result = await chatUi.callControlRpc(connection, method, payload);
    return chatUi.unwrapRpc(result);
  }, [chatUi, connection]);

  const load = React.useCallback(async () => {
    try {
      const value = await call('delivery.list', { channelId, botId });
      const targets = value.targets ?? [];
      setState({ phase: 'ready', targets, canSend: value.canSend === true });
      setSendTo((current) => {
        const savedIds = targets.filter((target) => !target.discovered).map((target) => target.id);
        return savedIds.includes(current) ? current : (savedIds[0] ?? '');
      });
    } catch (cause) {
      setState((current) => ({ ...current, phase: 'error' }));
      setError(cause.message);
    }
  }, [call, channelId, botId]);

  React.useEffect(() => { void load(); }, [load]);

  /** 统一处理"忙 → 调用 → 刷新 → 提示/报错"，失败必须留在界面上而不是静默。 */
  const run = React.useCallback(async (key, method, payload, message) => {
    setBusyId(key);
    setError(null);
    setNotice(null);
    try {
      const value = await call(method, payload);
      await load();
      setNotice(typeof message === 'function' ? message(value) : message);
      return value;
    } catch (cause) {
      setError(cause.message);
      return null;
    } finally {
      setBusyId(null);
    }
  }, [call, load]);

  const saved = state.targets.filter((target) => !target.discovered);
  const candidates = state.targets.filter((target) => target.discovered);

  return h(Panel, {
    title: t('主动投递'),
    description: t('让定时任务或 agent 把结果直接发到指定会话；候选来自与该机器人的历史会话。'),
  },
  error ? h('p', { className: 'dchat-error', role: 'alert' }, error) : null,
  notice ? h('p', { className: 'dchat-notice', role: 'status' }, notice) : null,
  state.phase === 'loading' ? h('p', { className: 'dchat-cardDescription' }, t('读取中…')) : null,
  state.phase === 'ready' && state.canSend === false
    ? h('p', { className: 'dchat-cardDescription' }, t('当前渠道不支持主动投递。'))
    : null,
  state.phase === 'ready' && state.canSend === true && state.targets.length === 0
    ? h('p', { className: 'dchat-cardDescription' },
      t('还没有可投递目标：先与机器人对话一次，会话会作为候选出现在这里。'))
    : null,
  state.targets.length > 0
    ? h('div', { className: 'dchat-list' }, state.targets.map((target) => h(TargetRow, {
      key: target.id,
      target,
      busy: busyId === target.id,
      confirming: confirmingId === target.id,
      translate: t,
      onSave: (item) => {
        void run(item.id, 'delivery.save', {
          channelId,
          botId,
          target: { id: item.id, name: item.name, kind: item.kind, route: item.route },
        }, () => t('已保存，现在可以主动发消息了。'));
      },
      onAskRemove: () => setConfirmingId(target.id),
      onCancel: () => setConfirmingId(null),
      onRemove: (item) => {
        setConfirmingId(null);
        void run(item.id, 'delivery.remove', { channelId, botId, targetId: item.id },
          () => t('已删除。'));
      },
    })))
    : null,
  candidates.length > 0
    ? h('p', { className: 'dchat-cardDescription' },
      t('候选目标需要先保存，保存后才能主动发送。'))
    : null,
  saved.length > 0
    ? h('div', { className: 'dchat-deliverySend' },
      h('label', { className: 'dchat-scopeLabel', htmlFor: `dchat-delivery-${botId}` },
        t('发一条测试消息')),
      h('div', { className: 'dchat-actions' },
        h('select', {
          className: 'dchat-select',
          value: sendTo,
          'aria-label': t('选择目标'),
          onChange: (event) => setSendTo(event.target.value),
        }, saved.map((target) => h('option', {
          key: target.id, value: target.id,
        }, `${target.name || target.id}（${target.kind === 'group' ? t('群聊') : t('私聊')}）`))),
        h('button', {
          type: 'button',
          className: 'dchat-button dchat-buttonPrimary',
          disabled: busyId === 'send' || !draft.trim() || !sendTo,
          onClick: () => {
            void run('send', 'delivery.send', { channelId, botId, targetId: sendTo, text: draft })
              .then((value) => { if (value !== null) setDraft(''); });
          },
        }, busyId === 'send' ? t('发送中…') : t('发送'))),
      h('textarea', {
        id: `dchat-delivery-${botId}`,
        className: 'dchat-textarea',
        rows: 2,
        placeholder: t('测试消息内容'),
        value: draft,
        onChange: (event) => setDraft(event.target.value),
      }))
    : null);
}
