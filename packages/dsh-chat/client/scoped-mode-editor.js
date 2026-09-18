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
 * **选完即存**：没有「保存」按钮——卡片里只有两个下拉，按钮挂在右上角还常驻灰色，
 * 第一眼既不知道它保存什么，也不知道改哪里才能点亮它。失败则回滚到外部真值并说明原因。
 *
 * @param props - {
 *   title, description, scopes: [{ key, label }], options: [{ value, label, help }],
 *   value: { [scopeKey]: optionValue }, disabled, saving, error, translate, onSave,
 * }。
 * @returns React 元素。
 */
export function ScopedModeEditor({
  title,
  description,
  scopes,
  options,
  value = {},
  disabled = false,
  saving = false,
  error = null,
  translate,
  onSave,
}) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  const [draft, setDraft] = React.useState(() => ({ ...value }));
  const [pending, setPending] = React.useState(null);
  const [failed, setFailed] = React.useState(null);
  /**
   * 帮助文案只显示"正在操作的那个作用域"的：两个作用域共用同一组选项，
   * 各贴一遍就是同一句话重复两次（截图里就是这么重复的）。
   */
  const [helpFor, setHelpFor] = React.useState(scopes[0]?.key ?? null);

  const same = (a, b) => scopes.every((scope) => (a[scope.key] ?? null) === (b[scope.key] ?? null));
  const locked = disabled || saving || pending !== null;

  // 外部值变化（例如重新读取）时同步草稿；已经在草稿上的值不重建对象，避免多余重渲染。
  React.useEffect(() => {
    if (pending !== null) return;
    setDraft((current) => (same(current, value) ? current : { ...value }));
    // same/scopes 每次渲染都是新引用，这里只以 value/pending 为触发条件。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, pending]);

  const choose = async (scopeKey, nextValue) => {
    if (locked) return;
    const next = { ...draft, [scopeKey]: nextValue };
    setDraft(next);          // 乐观：下拉立刻反映选择
    setFailed(null);
    setPending(scopeKey);
    try {
      await onSave({ ...next });
    } catch (cause) {
      setDraft({ ...value }); // 失败回滚到外部真值，并把原因留在卡片上
      setFailed(cause?.message ?? String(cause));
    } finally {
      setPending(null);
    }
  };

  const savingHint = pending !== null
    ? h('span', { className: 'dchat-status' }, t('保存中…'))
    : null;
  const help = options.find((option) => option.value === (draft[helpFor] ?? options[0]?.value))?.help;
  // 选项文案由调用方给**键**，这里翻译：渠道不必各自准备两份文案。

  return h('section', { className: 'dchat-card' },
    h('div', { className: 'dchat-cardHeader' },
      h('div', { className: 'dchat-cardHeading' },
        h('h3', { className: 'dchat-cardTitle' }, title),
        description ? h('p', { className: 'dchat-cardDescription' }, description) : null),
      savingHint ? h('div', { className: 'dchat-actions' }, savingHint) : null),
    h('div', { className: 'dchat-scopeGrid' }, scopes.map((scope) => {
      const selected = draft[scope.key] ?? options[0]?.value;
      const selectId = `dchat-mode-${scope.key}`;
      return h('div', { key: scope.key, className: 'dchat-scopeRow' },
        h('label', { className: 'dchat-scopeLabel', htmlFor: selectId }, scope.label),
        h('select', {
          id: selectId,
          className: 'dchat-select',
          value: selected,
          disabled: locked,
          'aria-label': `${title} · ${scope.label}`,
          onFocus: () => setHelpFor(scope.key),
          onChange: (event) => {
            setHelpFor(scope.key);
            void choose(scope.key, event.target.value);
          },
        }, options.map((option) => h('option', {
          key: option.value, value: option.value,
        }, t(option.label))),
        scope.key === helpFor && help
          ? h('p', { className: 'dchat-cardDescription' }, t(help))
          : null));
    })),
    failed || error ? h('p', { className: 'dchat-error', role: 'alert' }, failed ?? error) : null);
}
