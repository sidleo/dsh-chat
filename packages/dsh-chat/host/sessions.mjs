/**
 * 会话桥（host 侧）：把一次 IM 消息变成一次 DSH 会话回合。
 *
 * 提供的是**渠道无关**的能力——会话绑定、走 typertGateway 的
 * `session.*` / `workspace.*` 调用、增量事件流、审批与提问回传——渠道只负责
 * 平台协议与呈现（流式卡片、分段文本、正在输入等）。
 *
 * P0 只落接口与失败语义；P1 实现 `session.create/list/page/prompt/follow/cancel`
 * 的真实调用（见 CONTRACT.md 的 sessions 一节）。
 *
 * @module dsh-chat/host/sessions
 */

/**
 * 构造一个"尚未实现"错误，让渠道在 P0 阶段就能按契约写代码并得到清晰失败。
 *
 * @param method - 契约方法名。
 * @returns 带 code 的 Error。
 */
function notImplemented(method) {
  const error = new Error(`dsh-chat 会话桥的 ${method} 将在 P1 提供。`);
  error.code = 'chat/not-implemented';
  return error;
}

/**
 * 创建会话桥。`typertGateway` 必须由 hub 在 `inject` 里声明——
 * Cordis 对未声明的服务读取会直接抛错，即使写了可选链。
 *
 * @param options - { ctx, logger }。
 * @returns 契约规定的 sessions 面。
 */
export function createSessionBridge({ ctx, logger = console } = {}) {
  const gateway = ctx?.typertGateway;
  const hasGateway = typeof gateway?.invoke === 'function';
  if (!hasGateway) {
    logger.warn?.('[dsh-chat] typertGateway 不可用，会话能力将不可用（P1 需要它）。');
  }

  /**
   * 调用一个 DSH Remote 命名空间方法。P1 起被 sessions.* 使用。
   *
   * @param namespace - 'session' 或 'workspace'。
   * @param method - 方法名。
   * @param args - 参数对象。
   * @param signal - AbortSignal。
   * @returns 调用结果。
   */
  async function invoke(namespace, method, args, signal) {
    if (!hasGateway) {
      const error = new Error('当前 Host 未提供 typertGateway，无法访问 DSH 会话。');
      error.code = 'chat/gateway-unavailable';
      throw error;
    }
    const request = { namespace, method, args };
    if (signal !== undefined) request.signal = signal;
    return gateway.invoke(request);
  }

  return Object.freeze({
    /** 底层调用口，渠道在 P1 之前也能用它做探测。 */
    invoke,

    /** @throws 未实现（P1）。 */
    async ask() {
      throw notImplemented('ask');
    },

    /** @throws 未实现（P1）。 */
    stop() {
      throw notImplemented('stop');
    },

    /** @throws 未实现（P1）。 */
    steer() {
      throw notImplemented('steer');
    },

    /** @throws 未实现（P1）。 */
    isRunning() {
      throw notImplemented('isRunning');
    },

    /** 解除某会话绑定，下一条消息开新会话。@throws 未实现（P1）。 */
    reset() {
      throw notImplemented('reset');
    },
  });
}
