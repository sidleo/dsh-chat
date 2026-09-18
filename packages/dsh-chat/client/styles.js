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
  /* 操作块自身不压缩（折行后靠下面那条 margin 保持右对齐）。 */
  flex: none;
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
