/**
 * 设置页的分组导航：把一长条卡片按职能分成几组，顶部给一排可点的分类，
 * 点一下滚到那一组。
 *
 * 为什么要有它：机器人设置页是**一轮一轮追加**出来的（工作区/预设/模型/属主/访问策略/
 * 显示项/过程展示/身份/上下文增强/主动投递），实测在 820px 宽下高 3200+px，
 * 想改「任务过程展示」得盲滚两千像素——页面上没有任何线索告诉用户它在下半部。
 *
 * 这里只做**分组与跳转**，不动任何子组件的实现与行为：
 * - 分组是纯展示层，卡片内容与保存路径一行不改；
 * - 每组有一个标题，滚动时用 `IntersectionObserver` 反高亮当前分类；
 * - 不支持 `IntersectionObserver` 的环境（老浏览器、部分 headless 配置）退化成
 *   "点了就滚，分类不高亮"——**绝不让导航本身成为页面能不能用的前提**。
 *
 * @module dsh-chat/client/setting-groups
 */

import * as React from 'react';

const h = React.createElement;

/**
 * 分组容器 + 顶部分类导航。
 *
 * @param props - {
 *   groups: [{ key, label, items: [{ key, label, node }] }],
 *   translate, ariaLabel?,
 * }。
 *   每个 `item.node` 是调用方已经建好的 React 元素（渠道页把它的卡片原样放进来的）。
 *   分组与条目都为空时不渲染任何东西（守住"空 body 平台会拒"那条口径的同类原则：
 *   别画一排点了没反应的分类）。
 * @returns React 元素。
 */
export function SettingGroups({ groups = [], translate, ariaLabel }) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  const visible = groups.filter((group) => (group.items ?? []).length > 0);
  const [active, setActive] = React.useState(visible[0]?.key ?? null);
  const sectionRefs = React.useRef(new Map());

  /**
   * 滚动位置 → 当前分类。
   *
   * 用 `rootMargin` 把"判定线"压到视口上方 1/4 处：这样一组的标题刚滑过顶部就高亮它，
   * 而不是等整组进入视口才亮（后者在长页面里会慢半拍，看起来像没反应）。
   * 观察的是**容器**而不是 window：设置页右栏自己是一个滚动容器。
   */
  React.useEffect(() => {
    if (visible.length < 2) return undefined;
    if (typeof IntersectionObserver !== 'function') return undefined;
    const nodes = [...sectionRefs.current.values()].filter(Boolean);
    if (nodes.length === 0) return undefined;
    const observer = new IntersectionObserver((entries) => {
      // 取"离顶部最近且已经进入判定区"的那一组，避免快速滚动时被中间某组抢占。
      const entered = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
      const key = entered[0]?.target?.dataset?.groupKey;
      if (key) setActive(key);
    }, { rootMargin: '-25% 0px -60% 0px', threshold: 0 });
    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [visible.length]);

  if (visible.length === 0) return null;

  const jump = (key) => {
    setActive(key);
    const node = sectionRefs.current.get(key);
    // `scrollIntoView` 在所有目标浏览器都有；拿不到就什么都不做（不抛）。
    node?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  return h(React.Fragment, null,
    /**
     * 分类导航：**只有一个分类时不画**——一排只有一个按钮的导航纯属噪声，
     * 而且会让人以为还有别的地方可去。
     */
    visible.length > 1
      ? h('nav', {
        className: 'dchat-groups',
        'aria-label': ariaLabel ?? t('设置分类'),
      }, visible.map((group) => h('button', {
        key: group.key,
        type: 'button',
        className: 'dchat-groupTab',
        'aria-current': active === group.key ? 'true' : undefined,
        onClick: () => jump(group.key),
      }, t(group.label))))
      : null,
    visible.map((group) => h('section', {
      key: group.key,
      className: 'dchat-group',
      'data-group-key': group.key,
      ref: (node) => {
        if (node) sectionRefs.current.set(group.key, node);
        else sectionRefs.current.delete(group.key);
      },
    },
    h('h2', { className: 'dchat-groupHeading' }, t(group.label)),
    visible.length > 1 && group.items.length > 1
      ? h('p', { className: 'dchat-groupHint' },
        group.items.map((item) => t(item.label)).join(' · '))
      : null,
    h('div', { className: 'dchat-groupBody' }, group.items.map((item) => h(
      'div',
      { key: item.key, className: 'dchat-groupItem', 'data-item-key': item.key },
      item.node,
    ))))));
}
