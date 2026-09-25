/**
 * 统一的**场合切换器**：把"同一个设置项分几个场合"收敛成一套交互语言。
 *
 * 三层语义（与 `lark-identity.mjs` 已经在用的那套一致）：
 * - **全局**：底板，大家默认都用它；
 * - **私聊 / 群聊**：默认**继承全局**，需要时可以单独设置（覆盖）。
 *
 * 为什么要有它：在这之前，页面里有 5 个设置项各自分叉，而**每一项都发明了自己的画法**——
 * 访问策略是"并排两个块"、任务过程展示是"竖排两个下拉"、控制面板显示项是"8行×2列勾选表格"、
 * 上下文增强是"弹窗里两个页签"、lark-cli 身份是"竖排四个下拉"。
 * 用户的心智模型是「**一个设置项 × 几个场合**」，页面却要求他学 5 套画法。
 *
 * 现在的口径：**场合是页面级的**，在页头选一次，
 * 下面所有分场合的设置项都只画当前场合那一份——"改哪个场合"从上到下保持一致。
 *
 * 设计约束（都很实际）：
 * - **不改数据格式**：磁盘上仍是 `{global, direct, group}` 那几种形状，
 *   这里只决定**画哪一份**，保存时把改过的那层写回去。
 * - **"继承"要看得出来**：选了私聊、看到的是从全局继承来的值时，
 *   使用者必须知道"我改这里会变成单独设置"——不然就会出现
 *   "我明明在私聊关了、群里怎么还开着"（或者反过来）这类难查的疑问。
 *
 * @module dsh-chat/client/scope-switcher
 */

import * as React from 'react';

const h = React.createElement;

/** 场合的规范定义（顺序即界面顺序；`key` 与数据里的层键一致）。 */
export const SCOPE_DEFS = Object.freeze([
  Object.freeze({ key: 'global', label: '全局', hint: '所有会话的默认值；私聊与群聊没单独设置时都用它' }),
  Object.freeze({ key: 'direct', label: '私聊', hint: '只影响私聊会话；默认继承全局' }),
  Object.freeze({ key: 'group', label: '群聊', hint: '只影响群聊会话；默认继承全局' }),
]);

/** 只有两个场合（没有全局层）的设置项用这一份。 */
export const PAIR_SCOPE_DEFS = Object.freeze([
  Object.freeze({ key: 'direct', label: '私聊', hint: '只影响私聊会话' }),
  Object.freeze({ key: 'group', label: '群聊', hint: '只影响群聊会话' }),
]);

/** lark-cli 身份那种四层结构里额外交互的"全局"层。 */
export const GLOBAL_SCOPE = Object.freeze({
  key: 'global', label: '全局', hint: '所有会话的默认值',
});

/**
 * 默认场合：全局优先。
 *
 * 为什么默认全局而不是私聊：绝大多数设置"配一次就该处处生效"，
 * 而全局是那个"配一次处处生效"的层。要单独调某个场合，再切过去。
 */
export const DEFAULT_SCOPE = 'global';

/**
 * 场合切换器。**只有一个场合时不渲染**（画一个只有一项的切换器是噪声）。
 *
 * @param props - {
 *   scopes: [{ key, label, hint? }], value, onChange, translate,
 *   ariaLabel?, hint?,
 * }。
 *   `hint` 是当前场合的一句话说明（如"只影响群聊会话"），画在切换器下方。
 * @returns React 元素。
 */
export function ScopeSwitcher({ scopes = [], value, onChange, translate, ariaLabel, hint = null }) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  if (scopes.length < 2) return null;
  const active = scopes.some((scope) => scope.key === value) ? value : scopes[0]?.key;
  const activeDef = scopes.find((scope) => scope.key === active) ?? null;

  return h('div', { className: 'dchat-scopeSwitcher' },
    h('div', {
      className: 'dchat-scopeTabs',
      role: 'tablist',
      'aria-label': ariaLabel ?? t('设置场合'),
    }, scopes.map((scope) => h('button', {
      key: scope.key,
      type: 'button',
      role: 'tab',
      className: 'dchat-scopeTab',
      'data-scope': scope.key,
      'aria-selected': scope.key === active,
      // 守门据此断言"切换器反映的是当前生效的场合"，而不是永远停在第一项。
      'data-scope-active': scope.key === active ? '1' : '0',
      onClick: () => onChange?.(scope.key),
    }, t(scope.label)))),
    hint ?? (activeDef?.hint ? h('p', { className: 'dchat-scopeHint' }, t(activeDef.hint)) : null));
}

/**
 * 把"按场合分叉"的值与保存函数，包成**只针对当前场合**的一对 `{ value, onSave }`。
 *
 * 这样每个分叉的编辑器都只看到"我这个场合的那一份"，不必各自实现场合逻辑——
 * 它们原来就有"单一值 + onSave"的形态（`PanelSectionsEditor` 之类稍作调整即可）。
 *
 * 保存时把改过的那份**并回完整对象**（`{...all, [scope]: next}`）：磁盘格式一个字节不变，
 * 其它场合那一份原样带回去（不做字段级合并的理由与渠道页原来的口径一致：
 * "删掉一条指定设置"必须能表达）。
 *
 * @param options - {
 *   value: 完整的 { [scopeKey]: … } 对象（可能含 targets 这类非场合字段）,
 *   scope: 当前场合 key, scopes?: 合法场合 key 列表（用于校验）,
 *   onSave: async (full) => void,
 * }。
 * @returns `{ value, save }`——`value` 是当前场合那一份，`save` 只接受该份的新值。
 */
export function useScopedSlice({ value, scope, scopes = ['direct', 'group'], onSave }) {
  const full = value && typeof value === 'object' ? value : {};
  const current = full[scope] ?? null;
  const save = React.useCallback(async (next) => {
    if (!scopes.includes(scope)) return undefined;
    return onSave?.({ ...full, [scope]: next });
  }, [full, scope, scopes, onSave]);
  return { value: current, save };
}

/**
 * 从完整值里取"当前场合那一份"，并按另一个场合做个对照统计。
 *
 * 给"显示项"这类**需要保留对照能力**的设置用：它们原来画 8行×2列 的表格，
 * 一眼能看出两个场合的差异——改成纯切换就丢了这个能力。
 * 所以这类项的卡片头部会写一行「群聊：N 项与本场合不同」，需要时再切过去看。
 *
 * @param value - 完整的分叉对象。
 * @param scope - 当前场合。
 * @param keys - 需要比较的键列表（如显示项那 8 个 id）。
 * @returns `{ value, differs }`——`differs` 是"另一场合与本场合不同的项数"。
 */
export function diffAgainstOtherScope(value, scope, keys) {
  const full = value && typeof value === 'object' ? value : {};
  const otherKey = scope === 'direct' ? 'group' : (scope === 'group' ? 'direct' : null);
  if (!otherKey) return { value: full[scope] ?? null, differs: 0 };
  const mine = full[scope] ?? {};
  const theirs = full[otherKey] ?? {};
  let differs = 0;
  for (const key of keys) {
    if ((mine?.[key] !== false) !== (theirs?.[key] !== false)) differs += 1;
  }
  return { value: mine, differs };
}
