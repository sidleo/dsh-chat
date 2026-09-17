/**
 * 飞书 SDK 网关：把 `@larksuiteoapi/node-sdk` 收窄成本插件需要的那几个动作。
 *
 * 两条硬性约束：
 * 1. **不使用 SDK 自带的握手超时**（`handshakeTimeoutMs: 0`）。该超时路径会先摘掉
 *    socket 的全部 error 监听再 terminate，一旦随后还有 error 事件就会变成未捕获异常。
 *    我们改为自己用 Promise.race 计时，并把整条连接的生命周期（含重连）握在自己手里：
 *    失败就丢弃旧 WSClient、另起一个新的。
 * 2. 所有 `im.v1.*` 调用统一做 `code !== 0` 判定，否则飞书会用 HTTP 200 返回业务失败。
 *
 * @module dsh-chat-feishu/lark-gateway
 */

const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;

/** SDK 的 LoggerLevel 映射；缺省静默，避免刷屏。 */
function loggerLevelFor(sdk, level) {
  const table = sdk?.LoggerLevel ?? {};
  return table[level] ?? table.info;
}

function apiError(operation, response) {
  const error = new Error(`${operation} 失败：${response?.msg || response?.code}`);
  error.code = 'feishu/api-failed';
  error.providerCode = response?.code;
  return error;
}

function assertSuccess(operation, response) {
  if (response?.code && response.code !== 0) throw apiError(operation, response);
  return response;
}

/**
 * 创建 SDK 网关。
 *
 * @param options - {
 *   appId, appSecret, domain, sdk, logger,
 *   connectTimeoutMs?, loggerLevel?,
 * }。
 *   `sdk` 可注入（测试用假 SDK）。
 * @returns 网关 API。
 */
export function createLarkGateway({
  appId,
  appSecret,
  domain = 'feishu',
  sdk,
  logger = console,
  connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
  loggerLevel = 'info',
} = {}) {
  if (!sdk?.Client || !sdk?.WSClient) throw new TypeError('飞书网关需要 @larksuiteoapi/node-sdk。');
  if (!appId || !appSecret) throw new TypeError('飞书网关需要 appId 与 appSecret。');

  const clientOptions = {
    appId,
    appSecret,
    ...(domain === 'lark' ? { domain: sdk.Domain?.Lark } : {}),
  };
  const client = new sdk.Client(clientOptions);
  const wsOptions = {
    ...clientOptions,
    loggerLevel: loggerLevelFor(sdk, loggerLevel),
    // 关键：关掉 SDK 自己的握手超时，改由我们计时与重连。
    handshakeTimeoutMs: 0,
  };

  let wsClient = null;
  let connected = false;
  let lastError = null;

  function closeQuietly(instance) {
    try {
      instance?.close?.({ force: true });
    } catch (error) {
      logger.warn?.(`[dsh-chat-feishu] 关闭长连接时报错：${error?.message ?? error}`);
    }
  }

  return Object.freeze({
    appId,

    /** @returns 长连接是否就绪。 */
    isConnected: () => connected,

    /** @returns 最近一次连接错误（供状态展示）。 */
    lastError: () => lastError,

    /**
     * 建立长连接并订阅消息事件。超时或失败会抛出，并把半开的连接丢掉。
     *
     * @param options - { onMessage, onCardAction, signal }。
     */
    async connect({ onMessage, onCardAction, signal } = {}) {
      const dispatcher = new sdk.EventDispatcher({}).register({
        'im.message.receive_v1': (event) => {
          void Promise.resolve()
            .then(() => onMessage?.(event))
            .catch((error) => logger.error?.(`[dsh-chat-feishu] 处理入站消息失败：${error?.message ?? error}`));
          return undefined;
        },
        'card.action.trigger': (event) => {
          void Promise.resolve()
            .then(() => onCardAction?.(event))
            .catch((error) => logger.error?.(`[dsh-chat-feishu] 处理卡片回调失败：${error?.message ?? error}`));
          return undefined;
        },
      });

      let settleReady;
      let settleFail;
      const ready = new Promise((resolve, reject) => {
        settleReady = resolve;
        settleFail = reject;
      });

      const instance = new sdk.WSClient({
        ...wsOptions,
        onReady: () => {
          connected = true;
          lastError = null;
          settleReady();
        },
        onError: (error) => {
          connected = false;
          lastError = error?.message ?? String(error);
          settleFail(new Error(`飞书长连接失败：${lastError}`));
        },
        onReconnecting: () => {
          connected = false;
        },
        onReconnected: () => {
          connected = true;
          lastError = null;
        },
      });
      wsClient = instance;

      const aborted = () => {
        const error = new Error('飞书长连接已取消。');
        error.code = 'feishu/aborted';
        return error;
      };
      const timer = setTimeout(() => {
        closeQuietly(instance);
        const error = new Error(`飞书长连接在 ${connectTimeoutMs}ms 内未就绪。`);
        error.code = 'feishu/connect-timeout';
        settleFail(error);
      }, connectTimeoutMs);
      const onAbort = () => {
        closeQuietly(instance);
        settleFail(aborted());
      };
      signal?.addEventListener?.('abort', onAbort, { once: true });

      try {
        const started = Promise.resolve().then(() => instance.start({ eventDispatcher: dispatcher }));
        // 启动失败也要让 ready 有机会结束，避免悬挂。
        void started.catch((error) => settleFail(error));
        await Promise.race([ready, started.then(() => ready)]);
        if (signal?.aborted) throw aborted();
      } catch (error) {
        connected = false;
        if (wsClient === instance) wsClient = null;
        closeQuietly(instance);
        throw error;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', onAbort);
      }
    },

    /** 断开长连接（幂等）。 */
    async disconnect() {
      const instance = wsClient;
      wsClient = null;
      connected = false;
      closeQuietly(instance);
    },

    /**
     * 回复一条文本消息。
     *
     * @param options - { messageId, text, replyInThread }。
     * @returns { messageId, threadId }。
     */
    async replyText({ messageId, text, replyInThread = false }) {
      const response = await client.im.v1.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: 'text',
          content: JSON.stringify({ text }),
          ...(replyInThread ? { reply_in_thread: true } : {}),
        },
      });
      assertSuccess('飞书回复消息', response);
      return {
        messageId: response?.data?.message_id,
        threadId: response?.data?.thread_id,
      };
    },

    /** 向会话主动发文本。 */
    async sendText({ chatId, text }) {
      const response = await client.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text }) },
      });
      assertSuccess('飞书发送消息', response);
      return { messageId: response?.data?.message_id };
    },

    /** 发一张交互卡片。 */
    async sendCard({ chatId, card }) {
      const response = await client.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: { receive_id: chatId, msg_type: 'interactive', content: JSON.stringify(card) },
      });
      assertSuccess('飞书发送卡片', response);
      return { messageId: response?.data?.message_id };
    },

    /** 回复一张交互卡片。 */
    async replyCard({ messageId, card, replyInThread = false }) {
      const response = await client.im.v1.message.reply({
        path: { message_id: messageId },
        data: {
          msg_type: 'interactive',
          content: JSON.stringify(card),
          ...(replyInThread ? { reply_in_thread: true } : {}),
        },
      });
      assertSuccess('飞书回复卡片', response);
      return { messageId: response?.data?.message_id, threadId: response?.data?.thread_id };
    },

    /** 原地更新一张卡片（过程卡的实时刷新靠它）。 */
    async patchCard({ messageId, card }) {
      const response = await client.im.v1.message.patch({
        path: { message_id: messageId },
        data: { content: JSON.stringify(card) },
      });
      assertSuccess('飞书更新卡片', response);
      return { messageId };
    },
  });
}
