/**
 * 侧边栏会话行的**渠道徽标**：把「飞书 · 标题」里的渠道名前缀换成一枚小图标。
 *
 * 为什么要这样：DSH 的会话列表没有可注册的插槽（`sidebar.workspaces` 是整块替换，
 * 换掉就把搜索/分组/对话框全盖了），所以只能像上游 dsh-im 那样做**纯装饰性**的
 * DOM 增强——保留标题里的文字前缀（它既是匹配依据，也是降级形态），只给标题元素
 * 加两个自有的 data 属性，再用一张样式表把前缀隐藏、画上徽标。
 *
 * 三条纪律：
 * 1. **只加属性，不动 React 的文本/子节点/类名**；卸载时逐项还原；
 * 2. **认结构不认类名**：在行内找"文本以「<渠道名> · 」开头的叶子元素"，
 *    不依赖产品的 CSS 类名，产品改类名也不会失效；
 * 3. **图片没加载成功就不替换**（CSP 或字体缺失时保持文字前缀），绝不出现空白行。
 *
 * @module dsh-chat/client/session-badges
 */

const STYLE_ID = 'dsh-chat-session-badges';
const CHANNEL_ATTR = 'data-dsh-chat-channel';
const TITLE_ATTR = 'data-dsh-chat-title';
const ROW_SELECTOR = '[role="treeitem"][aria-selected]';

/** 一枚圆角徽标的 data URI（品牌色底 + 白色字）。 */
export function badgeUri({ text, color }, size = 16) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" `
    + `viewBox="0 0 ${size} ${size}"><rect x="0.5" y="0.5" width="${size - 1}" `
    + `height="${size - 1}" rx="4" fill="${color}"/>`
    + `<text x="${size / 2}" y="${size / 2 + 3.4}" text-anchor="middle" `
    + `font-family="-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif" `
    + `font-size="9.5" font-weight="600" fill="#ffffff">${text}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function stylesheet(uris) {
  const mapping = Object.entries(uris)
    .map(([channel, uri]) => `[${CHANNEL_ATTR}="${channel}"] { --dchat-session-badge: url("${uri}"); }`)
    .join('\n');
  return `
[${CHANNEL_ATTR}][${TITLE_ATTR}] {
  position: relative;
  -webkit-text-fill-color: transparent;
  text-overflow: clip !important;
  overflow: hidden;
}
[${CHANNEL_ATTR}][${TITLE_ATTR}]::before {
  content: "";
  position: absolute;
  inset-inline-start: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  background: var(--dchat-session-badge) center / contain no-repeat;
  pointer-events: none;
}
[${CHANNEL_ATTR}][${TITLE_ATTR}]::after {
  content: attr(${TITLE_ATTR}) / "";
  position: absolute;
  inset: 0;
  inset-inline-start: 22px;
  -webkit-text-fill-color: currentColor;
  text-indent: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: none;
}
${mapping}
`;
}

/**
 * 在一个会话行里找"被打了渠道前缀的标题元素"。
 *
 * 只看**叶子元素**、只按文本前缀匹配——不依赖产品的 CSS 类名，产品改样式也不会失效；
 * 同一行里多个匹配时取最靠后的那个（即最深的标题，不是外层容器）。
 *
 * @param row - 会话行元素（任何提供 `querySelectorAll` 的对象）。
 * @param known - `[[渠道 id, 渠道显示名]]`，只包含徽标就绪的渠道。
 * @returns `{ element, channel, text }` 或 null；`text` 是去掉前缀后的标题。
 */
export function findChannelTitle(row, known) {
  if (!row || typeof row.querySelectorAll !== 'function' || known.length === 0) return null;
  let found = null;
  for (const element of row.querySelectorAll('*')) {
    if (element.children?.length > 0) continue;
    const text = element.textContent;
    if (!text) continue;
    for (const [channel, label] of known) {
      if (text.startsWith(`${label} · `)) {
        found = { element, channel, text: text.slice(label.length + 3).trim() };
      }
    }
  }
  return found;
}

/**
 * 安装会话行徽标。
 *
 * @param options - { channels, doc, win }。
 *   `channels` 是渠道 rail（提供 `subscribe`/`getSnapshot`）。
 * @returns 卸载函数：断开观察、移除样式、还原所有属性。
 */
export function installSessionBadges({
  channels, doc = globalThis.document, win = globalThis.window,
} = {}) {
  if (!doc?.body || typeof win?.MutationObserver !== 'function') return () => {};
  /** 渠道 id → { label, uri }（只放已声明 `sessionBadge` 的渠道）。 */
  const badges = new Map();
  /** 图片加载成功的渠道（没加载成功就保留文字前缀）。 */
  const ready = new Set();
  /** 被我们改过的元素 → 原始属性值（卸载时还原）。 */
  const owned = new Map();
  const queued = new Set();
  const images = [];
  let closed = false;
  let scheduled = false;

  const style = doc.createElement('style');
  style.id = STYLE_ID;
  doc.head?.appendChild(style);

  function labels() {
    return [...badges.values()].filter((entry) => ready.has(entry.channel))
      .map((entry) => [entry.channel, entry.label]);
  }

  /** 行内最深的一个"文本以「渠道名 · 」开头"的叶子元素。 */
  function titleOf(row) {
    return findChannelTitle(row, labels());
  }

  function restore(element) {
    const previous = owned.get(element);
    if (!previous) return;
    owned.delete(element);
    for (const [attribute, value] of previous) {
      if (value === null) element.removeAttribute(attribute);
      else element.setAttribute(attribute, value);
    }
  }

  function update(row) {
    const found = row.isConnected ? titleOf(row) : null;
    for (const marked of row.querySelectorAll(`[${CHANNEL_ATTR}]`)) {
      if (marked !== found?.element) restore(marked);
    }
    if (!found) return;
    if (!owned.has(found.element)) {
      owned.set(found.element, [CHANNEL_ATTR, TITLE_ATTR]
        .map((attribute) => [attribute, found.element.getAttribute(attribute)]));
    }
    // React 仍然持有它原来的文本节点与监听器；我们只驱动自己那两个属性的视觉替换。
    found.element.setAttribute(CHANNEL_ATTR, found.channel);
    found.element.setAttribute(TITLE_ATTR, found.text);
  }

  function schedule() {
    if (closed || scheduled || queued.size === 0) return;
    scheduled = true;
    win.queueMicrotask(() => {
      scheduled = false;
      if (closed) return;
      const rows = [...queued];
      queued.clear();
      for (const row of rows) {
        try {
          update(row);
        } catch {
          for (const marked of row.querySelectorAll(`[${CHANNEL_ATTR}]`)) restore(marked);
        }
      }
    });
  }

  function collect(node, descendants = false) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    if (!element) return;
    const row = element.closest(ROW_SELECTOR);
    if (row) queued.add(row);
    if (descendants) for (const child of element.querySelectorAll(ROW_SELECTOR)) queued.add(child);
    if (owned.has(element)) {
      const owner = element.closest(ROW_SELECTOR);
      if (owner) queued.add(owner);
      else restore(element);
    }
    schedule();
  }

  function applyBadges() {
    if (closed) return;
    badges.clear();
    for (const entry of channels?.getSnapshot?.() ?? []) {
      const badge = entry.sessionBadge;
      if (!badge || typeof badge.text !== 'string' || !badge.text) continue;
      // rail 里的 label 是**函数**（支持动态改名），必须调用后再用。
      const label = typeof entry.label === 'function' ? entry.label() : entry.label;
      badges.set(entry.id, {
        channel: entry.id,
        label: String(label ?? entry.id),
        uri: badgeUri({ text: badge.text, color: badge.color ?? '#3370ff' }),
      });
    }
    style.textContent = stylesheet(Object.fromEntries(
      [...badges].map(([id, badge]) => [id, badge.uri]),
    ));
    // 图片没加载成功就不替换：宁可留着「飞书 · 」文字，也不要空一块。
    for (const [id, badge] of badges) {
      if (ready.has(id)) continue;
      const image = new win.Image();
      images.push(image);
      image.onload = () => {
        ready.add(id);
        for (const row of doc.querySelectorAll(ROW_SELECTOR)) queued.add(row);
        schedule();
      };
      image.src = badge.uri;
    }
    for (const row of doc.querySelectorAll(ROW_SELECTOR)) queued.add(row);
    schedule();
  }

  const observer = new win.MutationObserver((records) => {
    if (closed) return;
    for (const record of records) {
      collect(record.target, record.type === 'attributes');
      if (record.type !== 'childList') continue;
      for (const node of record.addedNodes) collect(node, true);
      for (const node of record.removedNodes) {
        if (node.nodeType !== 1 || node.isConnected) continue;
        if (owned.has(node)) restore(node);
        for (const marked of node.querySelectorAll(`[${CHANNEL_ATTR}]`)) restore(marked);
      }
    }
  });
  observer.observe(doc.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'role', 'aria-selected'],
  });

  const unsubscribe = channels?.subscribe?.(applyBadges);
  applyBadges();

  return () => {
    closed = true;
    observer.disconnect();
    unsubscribe?.();
    for (const image of images) {
      image.onload = null;
      image.src = '';
    }
    for (const element of [...owned.keys()]) restore(element);
    style.remove();
  };
}
