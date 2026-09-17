/**
 * 通用的"两作用域 × 多选项"设置块。
 *
 * 飞书的任务过程展示（私聊/群聊各自 off / 实时过程卡 / 逐步直播）就是这一形态；
 * 其他渠道以后要加同类设置直接复用，不必各写一份。
 *
 * @module dsh-chat/client/scoped-mode-editor
 */

import * as React from 'react';

const h = React.createElement;

/**
 * 两作用域模式选择器。
 *
 * @param props - {
 *   title, description, scopes: [{ key, label }], options: [{ value, label, help }],
 *   value: { [scopeKey]: optionValue }, disabled, translate, onSave,
 * }。
 * @returns React 元素。
 */
export function ScopedModeEditor({
  title,
  description,
  scopes,
  options,
  value,
  disabled = false,
  saving = false,
  error = null,
  translate,
  onSave,
}) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  const [draft, setDraft] = React.useState(() => ({ ...value }));
  const [busy, setBusy] = React.useState(false);

  // 外部值变化（例如重新读取）时同步草稿；正在保存时不动用户的选择。
  React.useEffect(() => {
    if (!busy) setDraft({ ...value });
  }, [value, busy]);

  const dirty = scopes.some((scope) => (draft[scope.key] ?? null) !== (value[scope.key] ?? null));
  const locked = disabled || busy || saving;

  const save = async () => {
    if (locked || !dirty) return;
    setBusy(true);
    try {
      await onSave({ ...draft });
    } finally {
      setBusy(false);
    }
  };

  return h('section', { className: 'dchat-card' },
    h('div', { className: 'dchat-cardHeader' },
      h('div', null,
        h('h3', { className: 'dchat-cardTitle' }, title),
        description ? h('p', { className: 'dchat-cardDescription' }, description) : null),
      h('div', { className: 'dchat-actions' },
        h('button', {
          type: 'button',
          className: 'dchat-button',
          disabled: locked || !dirty,
          onClick: () => {
            void save();
          },
        }, busy ? t('保存中…') : t('保存')))),
    h('div', { className: 'dchat-scopeGrid' }, scopes.map((scope) => {
      const selected = draft[scope.key] ?? options[0]?.value;
      const help = options.find((option) => option.value === selected)?.help;
      const selectId = `dchat-mode-${scope.key}`;
      return h('div', { key: scope.key, className: 'dchat-scopeRow' },
        h('label', { className: 'dchat-scopeLabel', htmlFor: selectId }, scope.label),
        h('select', {
          id: selectId,
          className: 'dchat-select',
          value: selected,
          disabled: locked,
          'aria-label': `${title} · ${scope.label}`,
          onChange: (event) => setDraft((current) => ({
            ...current,
            [scope.key]: event.target.value,
          })),
        }, options.map((option) => h('option', {
          key: option.value, value: option.value,
        }, option.label))),
        help ? h('p', { className: 'dchat-cardDescription' }, help) : null);
    })),
    error ? h('p', { className: 'dchat-error', role: 'alert' }, error) : null);
}
