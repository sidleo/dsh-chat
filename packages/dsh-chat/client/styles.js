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
  width: 168px;
  flex: none;
}
.dchat-channel {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
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
.dchat-channelLabel {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.dchat-channelLabel strong {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dchat-channelLabel small {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
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
.dchat-cardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.dchat-cardTitle {
  font-size: 14px;
  font-weight: 600;
}
.dchat-cardDescription {
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
}
.dchat-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dchat-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.dchat-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
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
