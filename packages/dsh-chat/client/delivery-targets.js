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

/** 候选默认展示条数：再多了就折叠，避免一屏全是候选。 */
const CANDIDATE_PREVIEW = 5;
/** 超过这个条数才出现过滤框。 */
const FILTER_THRESHOLD = 6;

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
      className: 'dchat-button',
      disabled: busy,
      onClick: () => onSave(target),
    }, t('保存为投递目标'))]
    : (confirming
      ? [
        h('button', {
          key: 'confirm',
          type: 'button',
          className: 'dchat-button dchat-buttonDangerSolid',
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
        className: 'dchat-button dchat-buttonDanger',
        disabled: busy,
        onClick: onAskRemove,
      }, t('删除'))]);

  return h('div', { className: 'dchat-listItem dchat-deliveryRow' },
    h('div', { className: 'dchat-deliveryMeta' },
      h('strong', null, target.name || target.id),
      // 只留一行身份：`route` 里已经带了 openId/chatId，再挂一个 `p2p_…` 原始 id
      // 就是同一个东西的第二种写法，只会让人怀疑"这是两个不同的目标"。
      h('small', null, `${target.kind === 'group' ? t('群聊') : t('私聊')} · ${route}`)),
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
  /** 目标一多就要有过滤与折叠，否则 8 个群排下来既找不到也没法扫。 */
  const [filter, setFilter] = React.useState('');
  const [showAllCandidates, setShowAllCandidates] = React.useState(false);

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
  const ready = state.phase === 'ready' && state.canSend === true;
  const query = filter.trim().toLowerCase();
  const matches = (target) => !query
    || `${target.name ?? ''} ${target.id} ${JSON.stringify(target.route ?? {})}`.toLowerCase().includes(query);
  const savedShown = saved.filter(matches);
  const candidatesShown = candidates.filter(matches);
  const visibleCandidates = showAllCandidates
    ? candidatesShown
    : candidatesShown.slice(0, CANDIDATE_PREVIEW);

  /** 一行目标；已保存与候选共用。 */
  const renderRow = (target) => h(TargetRow, {
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
  });
  const groupTitle = (text) => h('p', { className: 'dchat-groupTitle' }, text);


  return h(Panel, {
    title: t('主动投递'),
    description: t('让定时任务或 agent 把结果直接发到指定会话。'),
  },
  error ? h('p', { className: 'dchat-error', role: 'alert' }, error) : null,
  notice ? h('p', { className: 'dchat-notice', role: 'status' }, notice) : null,
  state.phase === 'loading' ? h('p', { className: 'dchat-cardDescription' }, t('读取中…')) : null,
  state.phase === 'ready' && state.canSend === false
    ? h('p', { className: 'dchat-cardDescription' }, t('当前渠道不支持主动投递。'))
    : null,
  // 目标多到需要找的时候才出现过滤框，平时不占地方。
  state.targets.length > FILTER_THRESHOLD
    ? h('div', { className: 'dchat-actions' },
      h('input', {
        className: 'dchat-input',
        value: filter,
        placeholder: t('按名字或 id 过滤'),
        autoComplete: 'off',
        spellCheck: false,
        onChange: (event) => setFilter(event.target.value),
      }))
    : null,
  savedShown.length > 0
    ? h(React.Fragment, null,
      groupTitle(t('已保存')),
      h('div', { className: 'dchat-list' }, savedShown.map(renderRow)))
    : null,
  candidatesShown.length > 0
    ? h(React.Fragment, null,
      groupTitle(`${t('可添加的候选')}（${candidatesShown.length}）`),
      h('div', { className: 'dchat-list' }, visibleCandidates.map(renderRow)),
      candidatesShown.length > CANDIDATE_PREVIEW
        ? h('button', {
          type: 'button',
          className: 'dchat-button dchat-buttonLink',
          onClick: () => setShowAllCandidates((value) => !value),
        }, showAllCandidates
          ? t('收起')
          : `${t('展开全部')}（${candidatesShown.length}）`)
        : null)
    : null,
  state.targets.length > 0 && savedShown.length === 0 && candidatesShown.length === 0
    ? h('p', { className: 'dchat-cardDescription' }, t('没有匹配的目标。'))
    : null,
  /**
   * 「怎么添加」常驻说明：**只要没有候选就显示**。
   * 之前只在"一个目标都没有"时显示，于是有 1 个已保存目标、又没有候选时，
   * 整张卡既看不到可添加项、也看不到为什么——用户只能说"没有添加入口"。
   */
  ready && candidates.length === 0
    ? h('p', { className: 'dchat-cardDescription' },
      saved.length === 0
        ? t('还没有可添加的会话：在群里 @ 一次机器人，或与它私聊一次，会话就会出现在这里，保存后即可主动投递。')
        : t('没有可添加的会话：在群里 @ 一次机器人，或与它私聊一次，该会话就会出现在这里。'))
    : null,
  candidates.length > 0
    ? h('p', { className: 'dchat-cardDescription' },
      t('上面标「候选」的会话还不能主动投递，点「保存为投递目标」后才行。'))
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
