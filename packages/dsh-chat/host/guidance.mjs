/**
 * 每会话的来源提示词登记表（host 侧，进程内单例语义）。
 *
 * 提示词 RPC 不携带消息来源，所以渠道在派发 prompt 时把"本次生效的增强提示词"
 * 发布进来；host 把它物化成该 Session 的动态提示词上下文，只在渲染文本变化时
 * 追加一条持久快照。key 是 Session id，因此"指定用户 / 指定群"各属独立会话时
 * 天然各自生效。
 *
 * @module dsh-chat/host/guidance
 */

/** 动态提示词上下文名。 */
export const SOURCE_GUIDANCE_CONTEXT = 'dsh-chat:source-guidance';

/** 上下文拼接顺序：跟在策略类事实之后。 */
export const SOURCE_GUIDANCE_ORDER = 125;

/** 单会话提示词上限（与设置上限一致）。 */
const GUIDANCE_MAX_LENGTH = 8_000;

/** 保留会话数上限，避免被废弃会话无限撑大。 */
const MAX_SESSIONS = 1_024;

/**
 * 创建提示词登记表。
 *
 * @returns { publish, get, forget, size }。
 */
export function createGuidanceRegistry() {
  /** @type {Map<string, string>} */
  const bySession = new Map();

  return {
    /**
     * 发布一个会话当前生效的提示词；空值表示清除。
     *
     * @param sessionId - 目标 Session。
     * @param guidance - 提示词正文。
     */
    publish(sessionId, guidance) {
      if (typeof sessionId !== 'string' || !sessionId) return;
      const text = typeof guidance === 'string' ? guidance.slice(0, GUIDANCE_MAX_LENGTH) : '';
      bySession.delete(sessionId);
      if (!text.trim()) return;
      bySession.set(sessionId, text);
      while (bySession.size > MAX_SESSIONS) {
        bySession.delete(bySession.keys().next().value);
      }
    },

    /**
     * @param sessionId - Session id。
     * @returns 该会话的提示词，未登记时为 undefined。
     */
    get(sessionId) {
      return typeof sessionId === 'string' ? bySession.get(sessionId) : undefined;
    },

    /**
     * 会话离开时清掉登记。
     *
     * @param sessionId - Session id。
     */
    forget(sessionId) {
      if (typeof sessionId === 'string') bySession.delete(sessionId);
    },

    /** @returns 当前登记数量。 */
    get size() {
      return bySession.size;
    },
  };
}
