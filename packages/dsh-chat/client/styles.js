/**
 * dsh-chat 的共享样式。使用 DSH 的主题变量，因此跟随明暗主题与品牌色。
 * 所有类名以 `dchat-` 前缀，避免与其他插件的样式冲突。
 *
 * @module dsh-chat/client/styles
 */

const STYLE_ID = 'dsh-chat-styles';

const CSS = `
.dchat-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}
.dchat-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  /* 窄栏下入口换行，而不是把品牌名挤出容器。 */
  flex-wrap: wrap;
}
/* 右上角入口组（诊断 / 版本与更新）：形态一致、放不下就换行。 */
.dchat-headerActions {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.dchat-brand {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.dchat-brandName {
  font-size: 16px;
  font-weight: 600;
}
.dchat-brandHint {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.dchat-layout {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  min-height: 0;
  flex: 1;
}
.dchat-rail {
  display: flex;
  flex-direction: column;
  gap: 4px;
  /* 只有「图标 + 渠道名」，副标题在右栏标题下，所以这里可以窄一点，把宽度让给右栏。 */
  width: 148px;
  flex: none;
}
.dchat-channel {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  /* 边框始终占位（未选中是透明的），选中/未选中的外框一样大，列表才不会"一卡片 + 一裸行"。 */
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dchat-channel:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dchat-channel[aria-selected='true'] {
  background: var(--dsw-alias-bg-layer-2);
  border-color: var(--dsw-alias-border-l2);
  /* 选中的第二个信号：左侧品牌色竖条（只靠底色在浅色主题下不够明显）。 */
  box-shadow: inset 2px 0 0 0 var(--dsw-alias-brand-primary);
}
.dchat-channelMark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  font-size: 12px;
  font-weight: 600;
  flex: none;
}
.dchat-channelMarkIcon {
  width: auto;
  height: auto;
  border: 0;
  background: none;
}
.dchat-channelMarkIcon svg {
  width: 20px;
  height: 20px;
  display: block;
}
.dchat-channelLabel {
  min-width: 0;
}
.dchat-channelLabel strong {
  display: block;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dchat-panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dchat-card {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dchat-groupTitle {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary);
}
.dchat-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}
.dchat-check input {
  margin: 0;
}
.dchat-policyGrid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dchat-policyGrid > * + * {
  border-top: 1px solid var(--dsw-alias-separator-primary);
  padding-top: 14px;
}
/* 作用域标题行：模式下拉按内容宽度，不要像操作行里的下拉那样吃掉整行。 */
.dchat-policyHead {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dchat-policyHead > select {
  width: auto;
  flex: none;
}
.dchat-actions > .dchat-check {
  flex: none;
}
/* 卡片套卡片（机器人卡里放渠道/机器人级设置块）时，内层去边框、改成分隔线：
   两层边框 + 两层 padding 会让缩进和视觉重量都乱掉。 */
.dchat-card .dchat-card {
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 12px 0 0;
  border-top: 1px solid var(--dsw-alias-separator-primary);
}
.dchat-cardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  /* 放不下时把操作整块折到下一行，而不是把标题/描述压到一字一行：
     中文的 min-content 只有 1 个字，flex 一旦压缩就会逐字竖排（见 .dchat-botRow 同款处理）。 */
  flex-wrap: wrap;
}
.dchat-cardHeading {
  /* 长标题靠省略号收，不抢操作的宽度。 */
  min-width: 0;
}
.dchat-cardTitle {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dchat-cardDescription {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary);
}
.dchat-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dchat-listItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
/* 名单/属主行里的 id 可能很长（open_id 有 35 字符）。它是 flex 项，默认 min-width:auto
   不肯缩，就会把同排的按钮挤出容器（窄栏直接横向溢出）。 */
.dchat-listItem .dchat-code {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 左侧的文字（名字、说明）允许换行、允许收缩——不许把右侧的操作顶出去。 */
.dchat-listItem > :not(.dchat-actions) {
  min-width: 0;
  overflow-wrap: anywhere;
}
/* 白名单行：名字 + id 放同一个块里（id 才是判定用的值，名字只是给人看的）。
   两个都允许收缩并省略号，谁长谁让位——名字很长时不许把 id 顶出容器。 */
.dchat-policyEntry {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.dchat-policyEntry > * {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dchat-policyName {
  color: var(--dsw-alias-label-primary);
}
.dchat-code {
  font-family: var(--dsw-font-markdown-code-block-small, ui-monospace, SFMono-Regular, monospace);
  font-size: 12px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--dsw-alias-markdown-code-block);
  color: var(--dsw-alias-label-primary);
}
.dchat-solo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  /* 进了机器人设置就占满整宽：左栏渠道列表此时没有意义。 */
  width: 100%;
}
.dchat-panelBar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dchat-botList {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dchat-botRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 10px 12px;
}
/* 「设置」按钮永远是内容宽度：flex 默认的 min-width:auto 会让它在窄栏里被压成一个字宽。 */
.dchat-grip {
  /*
   * 拖动把手：只能拖它，不让整行可拖——整行可拖会与"点一下切换渠道/机器人"抢手势，
   * 而且 button 元素在部分浏览器上 draggable 不生效。移动端不支持 HTML5 拖放，
   * 所以它只是桌面端的便利功能（顺序本身不影响任何行为）。
   */
  flex: none;
  cursor: grab;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 1;
  letter-spacing: -1px;
  user-select: none;
}
.dchat-grip:active {
  cursor: grabbing;
}
/* 拖动经过的可落点：只做高亮，不改布局（改动布局会让拖动手感抖）。 */
.dchat-dropTarget {
  border-color: var(--dsw-alias-brand-primary) !important;
  box-shadow: inset 0 0 0 1px var(--dsw-alias-brand-primary);
}
.dchat-botRow > .dchat-button {
  flex: none;
}
.dchat-botMain {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}
.dchat-botTitle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  min-width: 0;
}
/* 名称（可能是很长的 botId）负责截断，状态点保持自身宽度不被压缩。 */
.dchat-botTitle > strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dchat-botTitle > :not(strong) {
  flex: none;
  white-space: nowrap;
}
.dchat-botMeta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  /* 放不下就整项换行，绝不让中文按字折行（每个汉字都是断行点，会被压成竖排）。 */
  flex-wrap: wrap;
}
.dchat-botMeta > * {
  white-space: nowrap;
  /*
   * 加拖动把手之后窄栏（320px）会差几个像素：flex 项默认 min-width:auto 不会缩，
   * 于是「最近 09-19 10:21」整块顶出去。允许这些片段自己收成省略号，
   * 而不是把整行撑破——标题与名称在上面一行，仍然读得到。
   */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 账号可能很长：让它省略号截断，别把卡片撑破（flex 项默认 min-width:auto 不会缩）。 */
.dchat-botMeta > .dchat-code {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dchat-botError {
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary);
  word-break: break-word;
}
.dchat-versionMeta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
/* 诊断面板里的渠道块头：标题与状态点在两侧，放不下就整块换行。 */
.dchat-diagHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
/* 标题不折行（折了就是"逐字竖排"）——它整块换行靠上面那条 wrap。 */
.dchat-diagHead > .dchat-groupTitle {
  white-space: nowrap;
}
/* 诊断面板里每个渠道/每个日志各一块：竖排。
   .dchat-entry 是"可点击的折叠行"（横排），拿来装这些块会把它们挤成一条条细条。 */
.dchat-diagSection {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}
.dchat-diagSection > .dchat-list {
  min-width: 0;
}
/* 机器人块：状态行 + 若干行错误/提示，竖直排列。 */
.dchat-diagBot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
/* 诊断面板里的机器人行：一行放不下时整体换行，而不是把 id 顶出容器。
   min-width: 0 是必须的：这些块的内容（35 字符的 open_id）会把 flex 项的
   min-width: auto 撑成 min-content，于是整块比卡片还宽、把页面顶出滚动条（真机测到过）。 */
.dchat-diagRow {
  flex-wrap: wrap;
  min-width: 0;
}
.dchat-diagRow > .dchat-code {
  flex: 1 1 auto;
  min-width: 0;
}
.dchat-diagRow > .dchat-diagMeta {
  flex: 0 1 auto;
  min-width: 0;
}
/* 诊断面板里机器人行的右侧元信息（状态 · 已处理 · 时间）。
   整块不折行（折了就成了"逐字竖排"），放不下时靠 .dchat-diagRow 换行。 */
.dchat-diagMeta {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}
/* 日志尾部：等宽、限高、双向可滚（滚动发生在块内，不会把整页撑宽）。 */
.dchat-logTail {
  white-space: pre;
  max-height: 220px;
  overflow: auto;
  font-size: 11px;
  line-height: 1.5;
}
.dchat-updateHint {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}
.dchat-codeBlock {
  display: block;
  padding: 6px 8px;
  overflow-x: auto;
  white-space: nowrap;
}
.dchat-empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  border: 1px dashed var(--dsw-alias-border-l3);
  border-radius: 10px;
  padding: 18px;
  color: var(--dsw-alias-label-secondary);
}
.dchat-emptyTitle {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.dchat-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  /* 操作块可以缩到"最宽的那个按钮"，这样下面那条 flex-wrap 才会真的生效。
     曾经写的是 flex: none：内容再宽也不缩，于是窄栏里（320px 的 hub 页头）
     整块直接顶出容器 15px —— 正是布局守门量出来的那一条。
     按钮自身仍是 flex: none，不会出现"逐字竖排"。 */
  flex: 0 1 auto;
  min-width: 0;
  /* 放不下时按钮自己换行，而不是把整块顶出容器（窄栏里"下拉+两个按钮"就会溢出）。 */
  flex-wrap: wrap;
}
/* 只给卡片头用：折到第二行时仍然靠右。
   不能写在 .dchat-actions 上——auto 外边距会取消交叉轴的 stretch，
   让"竖排容器里的操作行"退化成内容宽度（发送行的下拉框就缩成一小截）。 */
.dchat-cardHeader > .dchat-actions {
  margin-left: auto;
}
.dchat-actions > * {
  white-space: nowrap;
}
/* 只有按钮和状态点"永不压缩"；输入类必须能缩，否则会撑出横向滚动：
   .dchat-select 是 width:100%，配 flex:none 会先占满整行，再把同排的按钮挤出容器。 */
.dchat-actions > .dchat-button,
.dchat-actions > .dchat-status {
  flex: none;
}
.dchat-actions > select,
.dchat-actions > input {
  flex: 1 1 0;
  min-width: 0;
  width: auto;
}
.dchat-button {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
  /* 中文按钮被压窄时会二字竖排，任何按钮都不允许折行。 */
  white-space: nowrap;
}
.dchat-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dchat-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* 次要入口（如「版本与更新」）：文字链接形态，不和 DSH 自己的实心按钮抢注意力。 */
.dchat-buttonLink {
  border-color: transparent;
  background: transparent;
  color: var(--dsw-alias-link);
  padding-left: 4px;
  padding-right: 4px;
}
.dchat-buttonLink:hover:not(:disabled) {
  background: transparent;
  text-decoration: underline;
}
/* 不可逆操作：触发按钮只染文字，确认按钮才用实底，避免两个同级灰按钮里藏着删除。 */
.dchat-buttonDanger {
  color: var(--dsw-alias-state-error-primary);
}
.dchat-buttonDangerSolid {
  background: var(--dsw-alias-state-error-primary);
  border-color: transparent;
  color: #fff;
}
.dchat-buttonDangerSolid:hover:not(:disabled) {
  background: var(--dsw-alias-state-error-primary);
  opacity: 0.88;
}
.dchat-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  /* 状态点自己永远不折行也不压缩（窄栏里曾被压成「运行正/常」）。 */
  flex: none;
  white-space: nowrap;
}
.dchat-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.dchat-status[data-tone='success'] { color: var(--dsw-alias-state-success-primary); }
.dchat-status[data-tone='warning'] { color: var(--dsw-alias-state-warn-primary); }
.dchat-status[data-tone='error'] { color: var(--dsw-alias-state-error-primary); }
.dchat-error {
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary);
}
.dchat-buttonPrimary {
  background: var(--dsw-alias-brand-primary);
  border-color: transparent;
  color: #fff;
}
.dchat-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dchat-entry:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dchat-entry:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.dchat-entryLabel {
  font-size: 13px;
  font-weight: 500;
}
.dchat-entryStatus {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  margin-left: auto;
}
.dchat-entryStatus[data-active='true'] {
  color: var(--dsw-alias-state-success-primary);
}
.dchat-entryArrow {
  color: var(--dsw-alias-label-tertiary);
}
/* 折叠态的入口行放在卡片里时，跟内层设置块用同一种形态（分隔线 + 整宽 + 同字号标题），
   否则它 40px 高的圆角小盒子夹在两张展开卡片中间，看起来像根分隔线。 */
.dchat-card .dchat-entry {
  width: 100%;
  border: 0;
  border-top: 1px solid var(--dsw-alias-separator-primary);
  border-radius: 0;
  background: transparent;
  padding: 12px 0 0;
}
.dchat-card .dchat-entry .dchat-entryLabel {
  font-size: 14px;
  font-weight: 600;
}
.dchat-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 16px;
  overflow: auto;
  /* 设置弹层自身是 fixed + z-index:1000，渠道弹窗必须压在其上。 */
  z-index: 1100;
}
.dchat-dialog {
  width: min(640px, 100%);
  /* 自己滚，而不是让外层滚动：否则内容变高时底部按钮会掉出视口。 */
  max-height: calc(100vh - 80px);
  box-sizing: border-box;
  overflow: auto;
  background: var(--dsw-alias-bg-base);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dchat-dialogHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dchat-dialogFooter {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  /* 内容很长时按钮始终粘在弹窗底部。 */
  position: sticky;
  bottom: -16px;
  margin: 0 -18px -16px;
  padding: 10px 18px 14px;
  background: var(--dsw-alias-bg-base);
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.dchat-tabs {
  display: flex;
  gap: 6px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}
.dchat-tab {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 13px;
  padding: 6px 10px;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}
.dchat-tab[aria-selected='true'] {
  color: var(--dsw-alias-label-primary);
  border-bottom-color: var(--dsw-alias-brand-primary);
}
.dchat-tabPanel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.dchat-tabPanel[hidden] {
  display: none;
}
/*
 * hidden 属性靠 UA 样式里的 [hidden]{display:none} 生效，而上面那条 display:flex 是作者样式
 * ——优先级更高，于是"隐藏"的页签照样显示：私聊与群聊两个页签看起来一模一样（真机截图就是
 * 两张内容完全相同的页签）。任何给元素写了 display 的地方，用 hidden 都要补这条。
 * 注意：本文件是模板字符串，注释里**不能出现反引号**（会把模板提前闭合，历史上栽过一次）。
 */

.dchat-contextGlobal,
.dchat-contextTargets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dchat-contextSwitchRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dchat-contextSwitchLabel {
  font-size: 13px;
}
.dchat-contextLegendRow,
.dchat-contextLegend {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.dchat-contextFields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 4px 12px;
}
.dchat-contextField {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.dchat-contextField code {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.dchat-contextGuidance {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dchat-contextGuidanceHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dchat-textarea,
.dchat-targetField input,
.dchat-input,
.dchat-select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: inherit;
  font: inherit;
  font-size: 12px;
  padding: 6px 8px;
}
.dchat-textarea {
  resize: vertical;
  min-height: 72px;
}
.dchat-targetList {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.dchat-targetRow {
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.dchat-targetHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dchat-targetEnable,
.dchat-targetMerge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.dchat-targetGrid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.dchat-targetField {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
}
.dchat-scopeGrid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dchat-scopeRow {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.dchat-scopeLabel {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.dchat-panelSections {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dchat-panelSectionsHead,
.dchat-panelSectionsRow {
  display: flex;
  align-items: center;
  gap: 12px;
}
/* 名称占满剩余宽度，两个勾选框固定靠右：窄栏下也不会把名称压成竖排。 */
.dchat-panelSectionsName {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.dchat-panelSectionsHead > .dchat-scopeLabel:first-child {
  flex: 1 1 auto;
  min-width: 0;
}
.dchat-panelSectionsHead > .dchat-scopeLabel:not(:first-child),
.dchat-panelSectionsCheck {
  flex: none;
  width: 48px;
  text-align: center;
}
.dchat-panelSectionsCheck {
  display: flex;
  justify-content: center;
}
.dchat-panelSectionsCheck input {
  margin: 0;
}
.dchat-notice {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-state-success-primary);
}
.dchat-deliveryRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dchat-deliveryMeta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dchat-deliveryMeta small {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  /* anywhere 而不是 break-all：只在真的放不下时才断长串，不会把普通词也切碎。 */
  overflow-wrap: anywhere;
}
.dchat-deliverySend {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
`;

/** 已安装实例计数：多个实例共用一份 <style>，最后一个卸载才移除。 */
let installations = 0;
let styleElement = null;

/**
 * 安装共享样式。
 *
 * @param doc - 目标 document（默认 globalThis.document）。
 * @returns 卸载函数。
 */
export function installChatStyles(doc = globalThis.document) {
  if (!doc?.head) return () => {};
  installations += 1;
  if (!styleElement) {
    styleElement = doc.createElement('style');
    styleElement.id = STYLE_ID;
    styleElement.textContent = CSS;
    doc.head.appendChild(styleElement);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    installations -= 1;
    if (installations > 0) return;
    try {
      styleElement?.remove();
    } finally {
      styleElement = null;
    }
  };
}
