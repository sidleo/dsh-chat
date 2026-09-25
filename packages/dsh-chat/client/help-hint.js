/**
 * **帮助图标**：一个圆形边框的问号，鼠标停留（或键盘聚焦）时**悬浮**显示说明。
 *
 * 为什么要有它：设置页上**说明文字的总量远超控件的量**——实测整页 1900+ 字，
 * 其中说明占 700+。这些字绝大多数只在"第一次看不懂"时有用，之后就纯占地方：
 * 每张卡都背着一长段解释，真正要改的那个下拉反而被推到看不见的地方。
 *
 * 口径（很重要，不然会把该常驻的东西也藏起来）：
 * - **常驻**：会影响"改了会不会生效"的一句话（如"只对新建会话生效"）、
 *   当前状态（"继承全局"）、失败原因——这些**必须一眼看到**，藏起来就是"失败不可见"。
 * - **收进问号**：这是什么、为什么这么设计、权限怎么开、字段为什么可能缺——
 *   属于"想知道再看"的背景说明。
 *
 * 形态：**悬浮气泡**，不是"点开在页面里展开一段"。
 * 展开会顶动下面的内容（视线被打断），气泡浮在上面、看完就走。
 * 触屏没有 hover，所以**点击 = 聚焦**也会显示（按钮天然可聚焦），不做别的交互。
 *
 * 实现要点：气泡 `position: absolute`，**定位基准是它所在的那个说明段落**
 * （`left:0; right:0` 撑满段落宽度），而不是那个 16px 的图标——
 * 以图标为基准的话，气泡要么被压成一条竖线，要么在 320px 窄栏里撑破容器
 * （布局守门会量横向溢出）。承载它的容器（`.dchat-cardDescription` / `.dchat-card`）
 * 因此必须是 `position: relative`。
 *
 * @module dsh-chat/client/help-hint
 */

import * as React from 'react';

const h = React.createElement;

/**
 * 帮助图标 + 悬浮说明。
 *
 * @param props - {
 *   label, help, translate, disabled?,
 * }。
 *   `label` 是这段帮助属于哪个控件（拼进 aria-label，读屏才知道问的是哪一项）；
 *   `help` 是说明正文（字符串或字符串数组，数组会分段）。
 * @returns React 元素（`help` 为空时不渲染任何东西）。
 */
export function HelpHint({ label, help, translate, disabled = false }) {
  const t = typeof translate === 'function' ? translate : (key) => key;
  const paragraphs = (Array.isArray(help) ? help : [help])
    .filter((text) => typeof text === 'string' && text.trim());
  if (paragraphs.length === 0) return null;

  const text = paragraphs.join(' ');
  return h('span', { className: 'dchat-help' },
    h('button', {
      type: 'button',
      className: 'dchat-helpButton',
      disabled,
      /**
       * ⚠️ **不用原生 `title`**：自定义气泡已经承担显示，两套会同时冒出来
       * （原生那个还有 1 秒延迟、样式不受控）。可访问性靠 `aria-label` + 气泡的
       * `role="tooltip"`；键盘聚焦同样能看到内容（CSS 的 `:focus-within`）。
       */
      'aria-label': `${t('帮助')}${label ? `：${label}` : ''}`,
    }, '?'),
    h('span', { className: 'dchat-helpTip', role: 'tooltip' },
      paragraphs.map((paragraph, index) => h('span', {
        key: index, className: 'dchat-helpLine',
      }, paragraph))),
    // 读屏拿得到完整内容（气泡对读屏不一定可达，这里保证内容不丢）。
    h('span', { className: 'dchat-visuallyHidden' }, text));
}

/**
 * 卡片描述 + 可选帮助图标。
 *
 * 设置页里"一句话说明 + 想细看再看"的常规形态；把常用组合收成一个组件，
 * 免得每张卡各写一遍拼装（也保证形态与 aria 一致）。
 *
 * @param props - { text, help, translate, className? }。
 * @returns React 元素；`text` 与 `help` 都为空时返回 null。
 */
export function DescriptionWithHelp({ text, help, translate, className = 'dchat-cardDescription' }) {
  const hasText = typeof text === 'string' && text.trim();
  if (!hasText && !help) return null;
  return h('p', { className },
    hasText ? h('span', null, text) : null,
    h(HelpHint, { help, translate, label: text }));
}
