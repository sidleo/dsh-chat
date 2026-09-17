/**
 * 上下文增强编辑器（渠道页共用的共享组件）。
 *
 * 两级设置：
 * - 全局：私聊 / 群聊 各自的启用开关、来源字段、增强提示词；
 * - 指定设置：指定用户（只在私聊命中）/ 指定群（只在群聊命中），
 *   各自可独立填提示词并选择"叠加全局提示词"或"只用自己的提示词"。
 *
 * @module dsh-chat/client/context-enhancement
 */

import * as React from 'react';
import { createPortal } from 'react-dom';

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
  direct: Object.freeze({
    title: '私聊',
    targetTitle: '指定用户',
    targetHint: '只在该用户与机器人的私聊中生效（按发送者标识匹配）。',
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

function FieldPicker({ scopeKey, scope, disabled, onChange }) {
  return h('div', { className: 'dchat-contextFields' }, CONTEXT_FIELDS.map((field) => {
    const inputId = `dchat-field-${scopeKey}-${field}`;
    return h('div', { key: field, className: 'dchat-contextField' },
      h('input', {
        id: inputId,
        type: 'checkbox',
        checked: scope.fields.includes(field),
        disabled,
        onChange: (event) => onChange(event.target.checked
          ? [...scope.fields, field]
          : scope.fields.filter((value) => value !== field)),
      }),
      h('label', { htmlFor: inputId, title: FIELD_HELP[field] ?? '' },
        h('span', null, FIELD_LABELS[field]),
        h('code', null, field)));
  }));
}

function GuidanceEditor({ idPrefix, value, example, disabled, onChange }) {
  const id = `${idPrefix}-guidance`;
  return h('div', { className: 'dchat-contextGuidance' },
    h('div', { className: 'dchat-contextGuidanceHeader' },
      h('label', { htmlFor: id, className: 'dchat-contextLegend' }, '增强提示词'),
      h('div', { className: 'dchat-actions' },
        h('button', {
          type: 'button', className: 'dchat-button', disabled,
          onClick: () => onChange(example),
        }, '填入示例'),
        h('button', {
          type: 'button', className: 'dchat-button', disabled,
          onClick: () => onChange(''),
        }, '清空'))),
    h('p', { className: 'dchat-cardDescription' },
      '告诉模型如何使用来源字段。只填正文，插件会自动包成来源增强块。'),
    h('textarea', {
      id,
      className: 'dchat-textarea',
      rows: 4,
      value,
      placeholder: example,
      maxLength: GUIDANCE_MAX_LENGTH,
      disabled,
      onChange: (event) => onChange(event.target.value),
    }));
}

function GlobalScopePanel({ kind, scope, disabled, onChange }) {
  const text = SCOPE_TEXT[kind];
  const example = kind === 'group' ? GROUP_GUIDANCE_EXAMPLE : DIRECT_GUIDANCE_EXAMPLE;
  const switchId = `dchat-enable-${kind}`;
  return h('div', { className: 'dchat-contextGlobal' },
    h('div', { className: 'dchat-contextSwitchRow' },
      h('label', { htmlFor: switchId, className: 'dchat-contextSwitchLabel' },
        `启用${text.title}全局增强`),
      h('input', {
        id: switchId,
        type: 'checkbox',
        role: 'switch',
        checked: scope.enabled,
        disabled,
        onChange: (event) => onChange({ ...scope, enabled: event.target.checked }),
      })),
    h('div', { className: 'dchat-contextLegendRow' }, '来源字段'),
    h(FieldPicker, {
      scopeKey: `${kind}-global`,
      scope,
      disabled,
      onChange: (fields) => onChange({ ...scope, fields }),
    }),
    h(GuidanceEditor, {
      idPrefix: `dchat-${kind}-global`,
      value: scope.guidance,
      example,
      disabled,
      onChange: (guidance) => onChange({ ...scope, guidance }),
    }));
}

/** 作用域 → 指定设置的命中类型：私聊按发送者，群聊按会话。 */
function targetKindOf(scope) {
  return scope === 'direct' ? 'user' : 'group';
}

function TargetRow({ scope, target, index, disabled, onChange, onRemove }) {
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
        '启用'),
      h('button', {
        type: 'button',
        className: 'dchat-button',
        disabled,
        'aria-label': `删除第 ${index + 1} 条${text.targetTitle}`,
        onClick: onRemove,
      }, '删除')),
    h('div', { className: 'dchat-targetGrid' },
      h('label', { className: 'dchat-targetField' },
        h('span', null, text.idLabel),
        h('input', {
          type: 'text',
          value: target.id,
          maxLength: TARGET_ID_MAX_LENGTH,
          placeholder: text.idPlaceholder,
          disabled,
          onChange: (event) => onChange({ ...target, id: event.target.value }),
        })),
      h('label', { className: 'dchat-targetField' },
        h('span', null, '备注名（可选）'),
        h('input', {
          type: 'text',
          value: target.label,
          maxLength: TARGET_LABEL_MAX_LENGTH,
          placeholder: '张三',
          disabled,
          onChange: (event) => onChange({ ...target, label: event.target.value }),
        }))),
    h('div', { className: 'dchat-contextLegendRow' }, '来源字段'),
    h(FieldPicker, {
      scopeKey: `${prefix}`,
      scope: target,
      disabled,
      onChange: (fields) => onChange({ ...target, fields }),
    }),
    h(GuidanceEditor, {
      idPrefix: prefix,
      value: target.guidance,
      example: scope === 'group' ? GROUP_GUIDANCE_EXAMPLE : DIRECT_GUIDANCE_EXAMPLE,
      disabled,
      onChange: (guidance) => onChange({ ...target, guidance }),
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
      '叠加全局提示词（不勾选则只使用上面的专属提示词）'));
}

function TargetPanel({ scope, targets, disabled, onChange }) {
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
      }, '新增')),
    rows.length === 0
      ? h('p', { className: 'dchat-cardDescription' }, '还没有指定设置。')
      : h('ul', { className: 'dchat-targetList' }, rows.map(({ target, index }) => h(TargetRow, {
        key: index,
        scope,
        target,
        index,
        disabled,
        onChange: (next) => replace(index, next),
        onRemove: () => remove(index),
      }))));
}

function ContextEnhancementDialog({ config, disabled, translate, onSave, onClose }) {
  const t = t_of(translate);
  const [draft, setDraft] = React.useState(() => normalizeContextConfig(config));
  const [activeScope, setActiveScope] = React.useState('direct');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const dialogRef = React.useRef(null);
  const titleId = React.useId();

  React.useEffect(() => {
    dialogRef.current?.focus?.();
  }, []);

  const busy = disabled || saving;

  const save = async () => {
    if (busy) return;
    setSaving(true);
    setError(null);
    try {
      const next = validateContextConfig(draft);
      await onSave(next);
      onClose();
    } catch (cause) {
      setError(cause?.message ?? t('保存失败，请重试。'));
    } finally {
      setSaving(false);
    }
  };

  const content = h('div', {
    className: 'dchat-backdrop',
    onMouseDown: (event) => {
      if (event.target === event.currentTarget && !saving) onClose();
    },
  }, h('section', {
    ref: dialogRef,
    className: 'dchat-dialog',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': titleId,
    tabIndex: -1,
    onKeyDown: (event) => {
      if (event.key === 'Escape' && !saving) {
        event.preventDefault();
        onClose();
      }
    },
  },
  h('header', { className: 'dchat-dialogHeader' },
    h('h3', { id: titleId, className: 'dchat-cardTitle' }, '上下文增强'),
    h('button', {
      type: 'button',
      className: 'dchat-button',
      disabled: saving,
      'aria-label': '关闭',
      onClick: onClose,
    }, '关闭')),
  h('p', { className: 'dchat-cardDescription' },
    '来源字段只在当前消息已提供时才会发送，不会额外查询平台接口。'),
  h('div', { className: 'dchat-tabs', role: 'tablist', 'aria-label': '上下文增强范围' },
    ['direct', 'group'].map((kind) => h('button', {
      key: kind,
      type: 'button',
      role: 'tab',
      className: 'dchat-tab',
      'aria-selected': activeScope === kind,
      'data-scope': kind,
      onClick: () => setActiveScope(kind),
    }, SCOPE_TEXT[kind].title))),
  ['direct', 'group'].map((kind) => h('div', {
    key: kind,
    role: 'tabpanel',
    className: 'dchat-tabPanel',
    hidden: activeScope !== kind,
    'data-scope': kind,
  },
  h(GlobalScopePanel, {
    kind,
    scope: draft[kind],
    disabled: busy,
    onChange: (scope) => setDraft((current) => ({ ...current, [kind]: scope })),
  }),
  h(TargetPanel, {
    scope: kind,
    targets: draft.targets,
    disabled: busy,
    onChange: (targets) => setDraft((current) => ({ ...current, targets })),
  }))),
  error ? h('p', { className: 'dchat-error', role: 'alert' }, error) : null,
  h('footer', { className: 'dchat-dialogFooter' },
    h('button', {
      type: 'button', className: 'dchat-button', disabled: saving, onClick: onClose,
    }, t('取消')),
    h('button', {
      type: 'button',
      className: 'dchat-button dchat-buttonPrimary',
      disabled: busy,
      onClick: () => {
        void save();
      },
    }, saving ? t('保存中…') : t('保存')))));

  return globalThis.document?.body ? createPortal(content, globalThis.document.body) : content;
}

/**
 * 上下文增强入口 + 弹窗。
 *
 * @param props - { config, disabled, translate, onSave }。
 * @returns React 元素。
 */
export function ContextEnhancementEditor({ config, disabled = false, translate, onSave }) {
  const t = t_of(translate);
  const [open, setOpen] = React.useState(false);
  const status = contextStatusLabel(config);
  return h(React.Fragment, null,
    h('button', {
      type: 'button',
      className: 'dchat-entry',
      disabled,
      'aria-haspopup': 'dialog',
      'aria-expanded': open,
      onClick: () => setOpen(true),
    },
    h('span', { className: 'dchat-entryLabel' }, '上下文增强'),
    h('span', { className: 'dchat-entryStatus', 'data-active': status !== '未开启' }, status),
    h('span', { className: 'dchat-entryArrow', 'aria-hidden': 'true' }, '›')),
    open ? h(ContextEnhancementDialog, {
      config,
      disabled,
      translate: t,
      onSave,
      onClose: () => setOpen(false),
    }) : null);
}
