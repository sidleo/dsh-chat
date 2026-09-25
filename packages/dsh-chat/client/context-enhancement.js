/**
 * 上下文增强编辑器（渠道页共用的共享组件）。
 *
 * 分层：
 * - 全局：底板（启用开关、来源字段、增强提示词）；私聊/群聊默认继承它、可单独覆盖；
 * - 指定设置：指定用户（只在私聊命中）/ 指定群（只在群聊命中），**比层更细**，
 *   命中就用它、没命中才落到层；可选用"叠加所在层提示词"。
 *
 * 形态是**直接铺在设置页上的卡片**（原来是"入口 + 弹窗"，是页面上唯一的另类形态）。
 *
 * @module dsh-chat/client/context-enhancement
 */

import * as React from 'react';

import { HelpHint } from './help-hint.js';

import {
  CONTEXT_FIELDS,
  DIRECT_GUIDANCE_EXAMPLE,
  GROUP_GUIDANCE_EXAMPLE,
  GUIDANCE_MAX_LENGTH,
  TARGET_ID_MAX_LENGTH,
  TARGET_LABEL_MAX_LENGTH,
  TARGET_LIMIT,
  contextStatusLabel,
  normalizeContextConfig,
  validateContextConfig,
} from '../shared/context-enhancement.mjs';

const h = React.createElement;

const FIELD_LABELS = Object.freeze({
  channel: '渠道',
  conversationType: '会话类型',
  senderId: '发送者标识',
  senderName: '发送者昵称',
  conversationTitle: '会话标题',
  chatId: '会话标识',
  threadId: '话题标识',
  botId: '机器人标识',
});

const FIELD_HELP = Object.freeze({
  senderName: '不是每个渠道都能提供；当前消息没有发送者昵称时会省略该字段。',
  conversationTitle: '不是每个渠道都能提供；当前消息没有会话标题时会省略该字段。',
  chatId: '用于区分不同群组或私聊；当前消息没有会话标识时会省略该字段。',
  threadId: '飞书话题群的消息会带上话题标识，用于区分同一群组内的不同话题。',
});

const SCOPE_TEXT = Object.freeze({
  global: Object.freeze({
    title: '全局',
    targetTitle: '指定用户',
    targetHint: '命中了才用它',
    idPlaceholder: 'ou_xxx（发送者标识）',
    idLabel: '用户标识',
  }),
  direct: Object.freeze({
    title: '私聊',
    targetTitle: '指定用户',
    targetHint: '只对这个人生效（按发送者标识匹配）。',
    idPlaceholder: 'ou_xxx（发送者标识）',
    idLabel: '用户标识',
  }),
  group: Object.freeze({
    title: '群聊',
    targetTitle: '指定群',
    targetHint: '只在该群中生效（按会话标识匹配）。',
    idPlaceholder: 'oc_xxx（会话标识）',
    idLabel: '群标识',
  }),
});

function t_of(translate) {
  return typeof translate === 'function' ? translate : (key) => key;
}

function FieldPicker({ scopeKey, scope, disabled, onChange, t, offered = CONTEXT_FIELDS }) {
  return h('div', { className: 'dchat-contextFields' }, offered.map((field) => {
    const inputId = `dchat-field-${scopeKey}-${field}`;
    return h('div', {
      key: field,
      className: 'dchat-contextField',
      // 守门按这个属性核对"画出来的字段 = 渠道声明能提供的那些"。
      'data-context-field': field,
    },
      h('input', {
        id: inputId,
        type: 'checkbox',
        checked: scope.fields.includes(field),
        disabled,
        onChange: (event) => onChange(event.target.checked
          ? [...scope.fields, field]
          : scope.fields.filter((value) => value !== field)),
      }),
      /**
       * 常驻只留中文名：英文键名（`conversationType` 这种）排在每个标签后面，
       * 一行里八组"中文+英文"会把这块撑得很长。键名收进 title——
       * 真要写提示词引用字段时，光标停一下就能看到。
       */
      h('label', {
        htmlFor: inputId,
        title: [t(FIELD_LABELS[field]), field, FIELD_HELP[field] ? t(FIELD_HELP[field]) : null]
          .filter(Boolean).join(' · '),
      },
      h('span', null, t(FIELD_LABELS[field]))));
  }));
}

function GuidanceEditor({ idPrefix, value, example, disabled, onChange, t }) {
  const id = `${idPrefix}-guidance`;
  return h('div', { className: 'dchat-contextGuidance' },
    h('div', { className: 'dchat-contextGuidanceHeader' },
      h('label', { htmlFor: id, className: 'dchat-contextLegend' }, t('增强提示词')),
      h('div', { className: 'dchat-actions' },
        h('button', {
          type: 'button', className: 'dchat-button', disabled,
          onClick: () => onChange(example),
        }, t('填入示例')),
        h('button', {
          type: 'button', className: 'dchat-button', disabled,
          onClick: () => onChange(''),
        }, t('清空')))),
    // 这句是"怎么写"的说明 → 收进问号（下面就是输入框，用户知道要写什么）。

    h('textarea', {
      id,
      className: 'dchat-textarea',
      rows: 4,
      value,
      // 占位符只给一句短提示；完整模板在「填入示例」里（一整段铺在框里太占视线）。
      placeholder: t('写一句"怎么理解来源"的说明，可点「填入示例」看模板'),
      maxLength: GUIDANCE_MAX_LENGTH,
      disabled,
      onChange: (event) => onChange(event.target.value),
    }));
}

function GlobalScopePanel({ kind, scope, disabled, onChange, t, offered }) {
  const text = SCOPE_TEXT[kind];
  const example = kind === 'group' ? GROUP_GUIDANCE_EXAMPLE : DIRECT_GUIDANCE_EXAMPLE;
  const switchId = `dchat-enable-${kind}`;
  return h('div', { className: 'dchat-contextGlobal' },
    h('div', { className: 'dchat-contextSwitchRow' },
      h('label', { htmlFor: switchId, className: 'dchat-contextSwitchLabel' },
        // 层名已经在页头场合切换器上写着，这里不重复一遍（'启用全局全局增强'很别扭）。
        t('启用增强')),
      h('input', {
        id: switchId,
        type: 'checkbox',
        role: 'switch',
        checked: scope.enabled,
        disabled,
        onChange: (event) => onChange({ ...scope, enabled: event.target.checked }),
      })),
    h('div', { className: 'dchat-contextLegendRow' }, t('来源字段')),
    h(FieldPicker, {
      scopeKey: `${kind}-global`,
      scope,
      disabled,
      offered,
      onChange: (fields) => onChange({ ...scope, fields }),
      t,
    }),
    h(GuidanceEditor, {
      idPrefix: `dchat-${kind}-global`,
      value: scope.guidance,
      example,
      disabled,
      onChange: (guidance) => onChange({ ...scope, guidance }),
      t,
    }));
}

/** 作用域 → 指定设置的命中类型：私聊按发送者，群聊按会话。 */
function targetKindOf(scope) {
  return scope === 'direct' ? 'user' : 'group';
}

function TargetRow({ scope, target, index, disabled, onChange, onRemove, t, conversations, offered }) {
  const text = SCOPE_TEXT[scope];
  const prefix = `dchat-target-${scope}-${index}`;
  return h('li', { className: 'dchat-targetRow' },
    h('div', { className: 'dchat-targetHead' },
      h('label', { className: 'dchat-targetEnable' },
        h('input', {
          type: 'checkbox',
          checked: target.enabled,
          disabled,
          'aria-label': `启用第 ${index + 1} 条${text.targetTitle}`,
          onChange: (event) => onChange({ ...target, enabled: event.target.checked }),
        }),
        t('启用')),
      h('button', {
        type: 'button',
        className: 'dchat-button',
        disabled,
        'aria-label': `删除第 ${index + 1} 条${text.targetTitle}`,
        onClick: onRemove,
      }, t('删除'))),
    h('div', { className: 'dchat-targetGrid' },
      h('label', { className: 'dchat-targetField' },
        h('span', null, text.idLabel),
        // 能选就别让人填 id：下拉里是这台机器人聊过的会话（带群名/人名），
        // 手填输入框仍然保留，兼容还没聊过的会话与直接粘贴 id 的场合。
        (conversations ?? []).length > 0
          ? h('select', {
            className: 'dchat-select',
            value: (conversations ?? []).some((item) => item.id === target.id) ? target.id : '',
            disabled,
            'aria-label': text.idLabel,
            onChange: (event) => {
              if (event.target.value) onChange({ ...target, id: event.target.value });
            },
          },
          h('option', { value: '' }, t('从会话里选…')),
          (conversations ?? []).map((item) => h('option', { key: item.id, value: item.id }, item.name)))
          : null,
        h('input', {
          type: 'text',
          value: target.id,
          maxLength: TARGET_ID_MAX_LENGTH,
          placeholder: text.idPlaceholder,
          disabled,
          onChange: (event) => onChange({ ...target, id: event.target.value }),
        })),
      h('label', { className: 'dchat-targetField' },
        h('span', null, t('备注名（可选）')),
        h('input', {
          type: 'text',
          value: target.label,
          maxLength: TARGET_LABEL_MAX_LENGTH,
          placeholder: t('张三'),
          disabled,
          onChange: (event) => onChange({ ...target, label: event.target.value }),
        }))),
    h('div', { className: 'dchat-contextLegendRow' }, t('来源字段')),
    h(FieldPicker, {
      scopeKey: `${prefix}`,
      scope: target,
      disabled,
      offered,
      onChange: (fields) => onChange({ ...target, fields }),
      t,
    }),
    h(GuidanceEditor, {
      idPrefix: prefix,
      value: target.guidance,
      example: scope === 'group' ? GROUP_GUIDANCE_EXAMPLE : DIRECT_GUIDANCE_EXAMPLE,
      disabled,
      onChange: (guidance) => onChange({ ...target, guidance }),
      t,
    }),
    h('label', { className: 'dchat-targetMerge' },
      h('input', {
        type: 'checkbox',
        checked: target.merge === 'append',
        disabled,
        onChange: (event) => onChange({
          ...target,
          merge: event.target.checked ? 'append' : 'replace',
        }),
      }),
      t('叠加全局提示词（不勾选则只使用上面的专属提示词）')));
}

function TargetPanel({ scope, targets, disabled, onChange, t, conversations, offered }) {
  const kind = targetKindOf(scope);
  const text = SCOPE_TEXT[scope];
  const rows = targets
    .map((target, index) => ({ target, index }))
    .filter((entry) => entry.target.kind === kind);

  const add = () => onChange([...targets, {
    kind,
    id: '',
    label: '',
    enabled: true,
    fields: ['senderId'],
    guidance: '',
    merge: 'append',
  }]);

  const replace = (index, next) => onChange(targets.map((item, at) => (at === index ? next : item)));
  const remove = (index) => onChange(targets.filter((_, at) => at !== index));

  return h('div', { className: 'dchat-contextTargets' },
    h('div', { className: 'dchat-cardHeader' },
      h('div', null,
        h('h4', { className: 'dchat-cardTitle' }, text.targetTitle),
        h('p', { className: 'dchat-cardDescription' }, text.targetHint)),
      h('button', {
        type: 'button',
        className: 'dchat-button',
        disabled: disabled || targets.length >= TARGET_LIMIT,
        onClick: add,
      }, t('新增'))),
    rows.length === 0
      ? h('p', { className: 'dchat-cardDescription' }, t('还没有指定设置'))
      : h('ul', { className: 'dchat-targetList' }, rows.map(({ target, index }) => h(TargetRow, {
        key: index,
        scope,
        target,
        index,
        disabled,
        onChange: (next) => replace(index, next),
        onRemove: () => remove(index),
        t,
        offered,
        // 只给这一类作用域挑：私聊给"人"，群聊给"群"。
        conversations: (conversations ?? []).filter((item) => (
          kind === 'group' ? item.kind === 'group' : item.kind === 'direct')),
      }))));;
}

/**
 * 上下文增强的**内嵌面板**（原来是一个"入口 + 弹窗"，是页面上唯一的另类形态）。
 *
 * 为什么改成内嵌：另外 9 项设置都是直接铺在页面上的，只有这一项要点进弹窗——
 * 用户得先猜"这个入口点开是什么"，而且弹窗里的改动与页面其余部分的"改了即存"不一致。
 * 现在与其它设置同形态：**直接画出来**，内容多就靠分组与场合切换器管。
 *
 * 保存仍是**显式按钮**（与工作区同一条理由）：这里有一段多行提示词，
 * 打到一半就提交会存进半句话。列表类操作（增删指定设置）也一并走这个按钮，
 * 不会出现"删了一条却要另点一次保存"。
 *
 * @param props - { config, disabled, translate, onSave, conversations, scope }。
 * @returns React 元素。
 */
function ContextEnhancementPanel({
  config, disabled, translate, onSave, conversations, scope = null, sourceFields = null,
  showTargets = true,
}) {
  const t = t_of(translate);
  const [draft, setDraft] = React.useState(() => normalizeContextConfig(config));
  const [activeScope, setActiveScope] = React.useState('global');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [notice, setNotice] = React.useState(null);

  /**
   * 画哪些场合：页面级场合给了就**只画那一个**（"改哪个场合"已经在页头问过一次）。
   * 没给则保留两个页签的旧形态（渠道页还没接场合切换器时不会少东西）。
   */
  /** 页面级场合给了就只画那一层（'global' / 'direct' / 'group'）；没给就画三层。 */
  /**
   * **只列这个渠道真能提供的来源字段。**
   *
   * 不这么做的话，勾选框里会混进"永远不会有值"的项：实测**两个渠道都不提供**
   * `senderName` / `conversationTitle`（schema 里有、但没有任何地方填它），
   * 微信更是连 `threadId` 都没有、`chatId` 恒等于 `senderId`、`conversationType` 恒为 direct。
   * 勾了没值 = 静默无效，正是"配置里有一堆用不上的东西"。
   *
   * 没声明就照旧全列（向后兼容，老渠道不传这个也不会少东西）。
   */
  const offered = Array.isArray(sourceFields) && sourceFields.length > 0
    ? CONTEXT_FIELDS.filter((field) => sourceFields.includes(field))
    : CONTEXT_FIELDS;
  const LAYERS = ['global', 'direct', 'group'];
  const scopedKinds = LAYERS.includes(scope) ? [scope] : LAYERS;
  /** 实际展开的那一个：单场合时以页面选定的为准，否则听弹窗内的页签。 */
  const shownKind = scopedKinds.length === 1 ? scopedKinds[0] : activeScope;

  const busy = disabled || saving;

  const save = async () => {
    if (busy) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await onSave(validateContextConfig(draft));
      setNotice(t('已保存。下一条消息生效。'));
    } catch (cause) {
      setError(cause?.message ?? t('保存失败，请重试。'));
    } finally {
      setSaving(false);
    }
  };

  /** 外部值变了（别的标签页/卡片改过）就重新取一次，但仍然只在用户点保存时写回。 */
  const dirty = JSON.stringify(draft) !== JSON.stringify(normalizeContextConfig(config));
  const reset = () => {
    setDraft(normalizeContextConfig(config));
    setError(null);
    setNotice(null);
  };

  /** 面板外壳：与其它设置卡同形态（Portal / 遮罩 / 关闭键都不需要了）。 */
  return h('section', { className: 'dchat-card dchat-contextPanel' },
    h('div', { className: 'dchat-cardHeader' },
      h('div', { className: 'dchat-cardHeading' },
        h('h3', { className: 'dchat-cardTitle' }, t('上下文增强')),
        h('p', { className: 'dchat-cardDescription' },
          h(HelpHint, {
            translate: t,
            label: t('上下文增强'),
            help: [
              t('告诉机器人：这条消息从哪来、以及该怎么用它——比如让它在回答里带上发言人是谁。'),
              t('来源字段只在当前消息已提供时才会发送，不会额外查询平台接口。'),
            ],
          })),
      ),
      h('div', { className: 'dchat-actions' },
        saving ? h('span', { className: 'dchat-status' }, t('保存中…')) : null,
        // 「放弃改动」只在真的改过时出现——没改时它是个点了没反应的按钮。
        dirty && !saving
          ? h('button', {
            type: 'button', className: 'dchat-button', disabled: busy, onClick: reset,
          }, t('放弃改动'))
          : null,
        h('button', {
          type: 'button',
          className: 'dchat-button dchat-buttonPrimary',
          disabled: busy || !dirty,
          onClick: () => { void save(); },
        }, saving ? t('保存中…') : t('保存'))),
    ),
    // 来源字段的说明在标题的问号里（只说一次，不逐项重复；每个字段自己的解释在 title 里）。
    // 单层时不画页签：层由页头统一选定，面板里再问一遍是同一件事的第二种问法。
    scopedKinds.length > 1
      ? h('div', { className: 'dchat-tabs', role: 'tablist', 'aria-label': t('上下文增强范围') },
        scopedKinds.map((kind) => h('button', {
          key: kind,
          type: 'button',
          role: 'tab',
          className: 'dchat-tab',
          'aria-selected': activeScope === kind,
          'data-scope': kind,
          onClick: () => setActiveScope(kind),
        }, t(SCOPE_TEXT[kind].title))))
      : null,
    scopedKinds.map((kind) => h('div', {
      key: kind,
      role: 'tabpanel',
      className: 'dchat-tabPanel',
      hidden: shownKind !== kind,
      'data-scope': kind,
    },
    h(GlobalScopePanel, {
      kind,
      offered,
      // 继承层（null）时展示"全局那一份"——用户看到的就是实际生效的内容。
      scope: draft[kind] ?? draft.global,
      disabled: busy,
      t,
      /**
       * 写回：从"继承"改起时**建立覆盖**（以当前生效的那份为底板）。
       * 直接把 null 展开会丢掉字段，用户下次打开就是一份空设置。
       */
      onChange: (scopeValue) => setDraft((current) => ({
        ...current,
        [kind]: kind === 'global' ? scopeValue : { ...(current[kind] ?? current.global), ...scopeValue },
      })),
    }),
    /**
     * 「指定用户 / 指定群」：**比场合更细的一层**（"只有这个人"）。
     * 只有一种会话、且实际上只有属主一个人在用的渠道（微信）上它没有意义——
     * 那唯一的那个人本来就是全部，再给他单开一份设置是多余的。
     */
    showTargets
      ? h(TargetPanel, {
        scope: kind,
        targets: draft.targets,
        offered,
        disabled: busy,
        t,
        conversations,
        onChange: (targets) => setDraft((current) => ({ ...current, targets })),
      })
      : null)),
    error ? h('p', { className: 'dchat-error', role: 'alert' }, error) : null,
    notice ? h('p', { className: 'dchat-notice', role: 'status' }, notice) : null);
}

/**
 * 上下文增强（**直接铺在设置页上**，不再是"入口 + 弹窗"）。
 *
 * @param props - { config, disabled, translate, onSave, conversations, scope }。
 *   `scope` 是**页面级的层**（`'global'` / `'direct'` / `'group'`，可能为 null = 让用户自己切）。
 *   给了它就**只画那一层**——"改哪个层"由页面顶部统一问一次。
 * @returns React 元素。
 */
export function ContextEnhancementEditor({
  config, disabled = false, translate, onSave, conversations = [], scope = null,
  sourceFields = null, showTargets = true,
}) {
  /**
   * 「指定用户/指定群」的 id 必须是**平台 id**（`ou_…` / `oc_…`）：拿消息里的
   * `senderId` / `chatId` 去匹配。**由渠道**把会话映射成平台 id 后传进来
   * （`route` 的字段名是平台概念，hub 不认识）；没传就只留手填输入框。
   */
  return h(ContextEnhancementPanel, {
    config, disabled, translate, onSave, conversations, scope, sourceFields, showTargets,
  });
}
