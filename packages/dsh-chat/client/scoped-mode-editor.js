/**
 * 通用的"两作用域 × 多选项"设置块。
 *
 * 飞书的任务过程展示（私聊/群聊各自 off / 实时过程卡 / 逐步直播）就是这一形态；
 * 其他渠道以后要加同类设置直接复用，不必各写一份。
 *
 * @module dsh-chat/client/scoped-mode-editor
 */

import * as React from 'react';

import { HelpHint } from './help-hint.js';

const h = React.createElement;

/**
 * 两作用域模式选择器。
 *
 * **选完即存**：没有「保存」按钮——卡片里只有两个下拉，按钮挂在右上角还常驻灰色，
 * 第一眼既不知道它保存什么，也不知道改哪里才能点亮它。失败则回滚到外部真值并说明原因。
 *
 * @param props - {
 *   title, description, scopes: [{ key, label }], options: [{ value, label, help }],
 *   value: { [scopeKey]: optionValue }, disabled, saving, error, translate, onSave, scope,
 * }。
 *   `scope` 是要编辑的那一个（由**页面级的场合切换器**决定）；不给就退回"全部画出来"的旧形态
 *   （渠道页还没接场合切换器时不会因此少画东西）。
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
  scope = null,
}) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  const [draft, setDraft] = React.useState(() => ({ ...value }));
  const [pending, setPending] = React.useState(null);
  const [failed, setFailed] = React.useState(null);
  /**
   * 画哪几个作用域：给了 `scope` 就只画那一个——页面级的场合切换器已经在上面问过
   * "改哪个场合"，卡里再问一次就是同一件事问两遍（原来这正是"竖排两个下拉"的来源）。
   * 没给就照旧全画（向后兼容，渠道页没接切换器时不会少画东西）。
   */
  /**
   * 画哪几个作用域。
   *
   * ⚠️ 页面级的场合可能是 **`global`**——而这一项（如"任务过程展示"）**没有全局层**
   * （它存成 `stepPushDirect` / `stepPushGroup` 两个字段，全局层还没做）。
   * 这种情况下**只画第一个作用域**，而不是"两个都画"：
   * 两个都画等于把"场合收敛"回退了，用户又会看到两个下拉。
   * 页面上会有一行提示说明"这一项还是分场合的"（见 `fallbackHint`）。
   */
  const matched = scope && scopes.some((item) => item.key === scope) ? scope : null;
  const visibleScopes = matched
    ? scopes.filter((item) => item.key === matched)
    : (scope && scopes.length > 0 ? [scopes[0]] : scopes);

  const same = (a, b) => scopes.every((item) => (a[item.key] ?? null) === (b[item.key] ?? null));
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

  /**
   * 场合是 `global` 但这一项没有全局层时，如实说一句"它仍按场合分开"——
   * 否则用户在"全局"标签下看到"私聊"两个字会以为切错了。
   */
  const scopeFallbackHint = scope && !matched
    ? h('p', { className: 'dchat-cardDescription' },
      t('这一项目前只有私聊/群聊两份（没有全局层）；下面显示的是私聊那一份。'))
    : null;
  const savingHint = pending !== null
    ? h('span', { className: 'dchat-status' }, t('保存中…'))
    : null;
  // 选项文案由调用方给**键**，这里翻译：渠道不必各自准备两份文案。

  return h('section', { className: 'dchat-card' },
    h('div', { className: 'dchat-cardHeader' },
      h('div', { className: 'dchat-cardHeading' },
        h('h3', { className: 'dchat-cardTitle' }, title),
        description
          ? h('p', { className: 'dchat-cardDescription' },
            h('span', null, description),
            h(HelpHint, {
              translate: t,
              label: title,
              // 三个选项各自的说明都在这里（常驻会把卡片撑得比控件高好几倍）。
              help: [
                ...options.map((option) => `${t(option.label)}：${t(option.help)}`),
              ],
            }))
          : null),
      savingHint ? h('div', { className: 'dchat-actions' }, savingHint) : null),
    scopeFallbackHint,
    h('div', { className: 'dchat-scopeGrid' }, visibleScopes.map((item) => {
      const selected = draft[item.key] ?? options[0]?.value;
      const selectId = `dchat-mode-${item.key}`;
      return h('div', { key: item.key, className: 'dchat-scopeRow' },
        // 场合已经由页面级切换器选定时，卡里不再重复一遍"私聊/群聊"标签——那是同一个问题的第二种问法。
        visibleScopes.length > 1
          ? h('label', { className: 'dchat-scopeLabel', htmlFor: selectId }, item.label)
          : null,
        h('select', {
          id: selectId,
          className: 'dchat-select',
          value: selected,
          disabled: locked,
          'aria-label': `${title} · ${item.label}`,
          onChange: (event) => {
            void choose(item.key, event.target.value);
          },
        }, options.map((option) => h('option', {
          key: option.value, value: option.value,
        }, t(option.label)))));
    })),
    failed || error ? h('p', { className: 'dchat-error', role: 'alert' }, failed ?? error) : null);
}
