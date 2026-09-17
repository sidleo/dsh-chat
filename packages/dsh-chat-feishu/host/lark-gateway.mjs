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

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;

/**
 * 按扩展名给出飞书要的 `file_type`（它决定文件在客户端的图标与打开方式；
 * 不在表里的一律 `stream`，飞书会当普通附件处理）。
 */
const FILE_TYPES = new Map(Object.entries({
  opus: 'opus',
  mp4: 'mp4',
  pdf: 'pdf',
  doc: 'doc',
  docx: 'doc',
  xls: 'xls',
  xlsx: 'xls',
  ppt: 'ppt',
  pptx: 'ppt',
}));

function fileTypeFor(name) {
  const ext = String(name ?? '').split('.').pop()?.toLowerCase() ?? '';
  return FILE_TYPES.get(ext) ?? 'stream';
}

/** 入站资源（图片/文件）大小上限：超过就报错，不把内存撑爆。 */
const DEFAULT_MAX_RESOURCE_BYTES = 10 * 1024 * 1024;

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
  maxResourceBytes = DEFAULT_MAX_RESOURCE_BYTES,
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
        // 注意：卡片回调的返回值就是飞书客户端的应答（toast / 替换卡片），
        // 必须把处理结果返回给 SDK，否则用户点了按钮只会看到一个失败提示。
        'card.action.trigger': (event) => Promise.resolve()
          .then(() => onCardAction?.(event))
          .catch((error) => {
            logger.error?.(`[dsh-chat-feishu] 处理卡片回调失败：${error?.message ?? error}`);
            return undefined;
          }),
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

    /**
     * 主动发文本。
     *
     * @param options - { chatId }（群/会话）或 { openId }（私聊用户，二选一）、{ text }。
     */
    async sendText({ chatId, openId, text }) {
      const receiveId = chatId ?? openId;
      if (!receiveId) throw new TypeError('sendText 需要 chatId 或 openId。');
      const response = await client.im.v1.message.create({
        params: { receive_id_type: chatId ? 'chat_id' : 'open_id' },
        data: { receive_id: receiveId, msg_type: 'text', content: JSON.stringify({ text }) },
      });
      assertSuccess('飞书发送消息', response);
      return { messageId: response?.data?.message_id };
    },

    /**
     * 发一个文件（先上传拿 file_key，再作为 file 消息发出去）。
     *
     * @param options - { chatId } 或 { openId }、{ path, name }。
     * @returns { messageId, fileKey, name, size }。
     */
    async sendFile({ chatId, openId, path, name }) {
      const receiveId = chatId ?? openId;
      if (!receiveId) throw new TypeError('sendFile 需要 chatId 或 openId。');
      if (!path) throw new TypeError('sendFile 需要 path。');
      const fileName = name || path.split('/').pop();
      const info = await stat(path);
      const uploaded = await client.im.v1.file.create({
        data: {
          file_type: fileTypeFor(fileName),
          file_name: fileName,
          file: createReadStream(path),
        },
      });
      // 注意：im.v1.file.create / image.create 直接返回 data（`{ file_key }`），
      // 不像 message.create 那样包一层 `{ code, msg, data }`。两种都认，免得跟着 SDK 版本翻车。
      const fileKey = uploaded?.file_key ?? uploaded?.data?.file_key;
      if (!fileKey) {
        const error = new Error('飞书上传文件失败：没有返回 file_key。');
        error.code = 'feishu/upload-failed';
        throw error;
      }
      const response = await client.im.v1.message.create({
        params: { receive_id_type: chatId ? 'chat_id' : 'open_id' },
        data: { receive_id: receiveId, msg_type: 'file', content: JSON.stringify({ file_key: fileKey }) },
      });
      assertSuccess('飞书发送文件', response);
      return {
        messageId: response?.data?.message_id,
        fileKey,
        name: fileName,
        size: info.size,
      };
    },

    /**
     * 发一张图片（走 im/v1/images 上传，再作为 image 消息发出）。
     *
     * @param options - { chatId } 或 { openId }、{ path }。
     */
    async sendImage({ chatId, openId, path }) {
      const receiveId = chatId ?? openId;
      if (!receiveId) throw new TypeError('sendImage 需要 chatId 或 openId。');
      const uploaded = await client.im.v1.image.create({
        data: { image_type: 'message', image: createReadStream(path) },
      });
      const imageKey = uploaded?.image_key ?? uploaded?.data?.image_key;
      if (!imageKey) {
        const error = new Error('飞书上传图片失败：没有返回 image_key。');
        error.code = 'feishu/upload-failed';
        throw error;
      }
      const response = await client.im.v1.message.create({
        params: { receive_id_type: chatId ? 'chat_id' : 'open_id' },
        data: { receive_id: receiveId, msg_type: 'image', content: JSON.stringify({ image_key: imageKey }) },
      });
      assertSuccess('飞书发送图片', response);
      return { messageId: response?.data?.message_id, imageKey };
    },

    /**
     * 把一个提问渲染成带按钮的卡片发出去。
     *
     * 按钮 `value` 里带的是**答案原文**（选项 label），点击后由桥交给 hub 的交互服务
     * 认领——与"用户手打选项文字"走完全相同的解析路径，因此两条路不会出现行为差异。
     *
     * @param options - { chatId } 或 { openId }、{ question, position, total, note? }。
     * @returns { messageId }。
     */
    async sendQuestionCard({ chatId, openId, question, position = 1, total = 1, note = '' }) {
      const receiveId = chatId ?? openId;
      if (!receiveId) throw new TypeError('sendQuestionCard 需要 chatId 或 openId。');
      const options = Array.isArray(question?.options) ? question.options : [];
      const elements = [];
      const body = [String(question?.question ?? '')];
      if (question?.detail) body.push('', String(question.detail));
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: body.join('\n') } });
      if (options.length > 0) {
        elements.push({
          tag: 'action',
          actions: options.slice(0, 8).map((option, index) => ({
            tag: 'button',
            type: 'default',
            text: { tag: 'plain_text', content: String(option.label).slice(0, 60) },
            value: {
              dsh: 'answer',
              questionId: String(question?.id ?? ''),
              label: String(option.label),
              index: String(index + 1),
            },
          })),
        });
      }
      elements.push({
        tag: 'note',
        elements: [{ tag: 'plain_text', content: '点按钮即可；也可以直接回复文字。' }],
      });
      const response = await client.im.v1.message.create({
        params: { receive_id_type: chatId ? 'chat_id' : 'open_id' },
        data: {
          receive_id: receiveId,
          msg_type: 'interactive',
          content: JSON.stringify({
            config: { wide_screen_mode: true, update_multi: true },
            header: {
              template: 'blue',
              title: {
                tag: 'plain_text',
                content: total > 1 ? `❓ 需要你确认（${position}/${total}）` : '❓ 需要你确认',
              },
            },
            elements,
          }),
        },
      });
      assertSuccess('飞书发送提问卡片', response);
      return { messageId: response?.data?.message_id };
    },

    /**
     * 把一次审批渲染成「允许 / 拒绝」按钮卡片。
     *
     * @param options - { chatId } 或 { openId }、{ request }。
     * @returns { messageId }。
     */
    async sendApprovalCard({ chatId, openId, request }) {
      const receiveId = chatId ?? openId;
      if (!receiveId) throw new TypeError('sendApprovalCard 需要 chatId 或 openId。');
      const lines = ['需要授权', '', `工具：${request?.toolName ?? '未知'}`];
      if (request?.reason) lines.push(`原因：${request.reason}`);
      const response = await client.im.v1.message.create({
        params: { receive_id_type: chatId ? 'chat_id' : 'open_id' },
        data: {
          receive_id: receiveId,
          msg_type: 'interactive',
          content: JSON.stringify({
            config: { wide_screen_mode: true, update_multi: true },
            header: { template: 'orange', title: { tag: 'plain_text', content: '⚠️ 需要授权' } },
            elements: [
              { tag: 'div', text: { tag: 'lark_md', content: lines.join('\n') } },
              {
                tag: 'action',
                actions: [
                  {
                    tag: 'button',
                    type: 'primary',
                    text: { tag: 'plain_text', content: '允许一次' },
                    value: { dsh: 'approval', decision: 'allowed-once' },
                  },
                  {
                    tag: 'button',
                    type: 'danger',
                    text: { tag: 'plain_text', content: '拒绝' },
                    value: { dsh: 'approval', decision: 'rejected' },
                  },
                ],
              },
            ],
          }),
        },
      });
      assertSuccess('飞书发送审批卡片', response);
      return { messageId: response?.data?.message_id };
    },

    /** 把卡片替换成"已处理"的静态卡片（点击后再也点不动，避免重复回答）。 */
    async markCardAnswered({ messageId, title, content }) {
      const response = await client.im.v1.message.patch({
        path: { message_id: messageId },
        data: {
          content: JSON.stringify({
            config: { wide_screen_mode: true, update_multi: true },
            header: { template: 'green', title: { tag: 'plain_text', content: String(title).slice(0, 100) } },
            elements: [{ tag: 'div', text: { tag: 'lark_md', content: String(content) } }],
          }),
        },
      });
      assertSuccess('飞书更新提问卡片', response);
      return { messageId };
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

    /**
     * 下载消息里的资源（图片/文件）。
     *
     * 飞书这个接口用**二进制流**返回成功结果，业务失败则回一段 JSON；因此这里
     * 同时看 content-type 与体积，两种失败都给出可读原因，绝不当成图片交出去。
     *
     * @param options - { messageId, fileKey, type = 'image' }。
     * @returns { bytes: Buffer, contentType: string|null }。
     */
    async downloadResource({ messageId, fileKey, type = 'image' }) {
      const response = await client.im.v1.messageResource.get({
        path: { message_id: messageId, file_key: fileKey },
        params: { type },
      });
      const contentType = String(response?.headers?.['content-type'] ?? '').toLowerCase();
      const chunks = [];
      let size = 0;
      for await (const chunk of response.getReadableStream()) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.length;
        if (size > maxResourceBytes) {
          const error = new Error(
            `飞书资源超过 ${Math.round(maxResourceBytes / 1024 / 1024)}MB 上限，已忽略。`,
          );
          error.code = 'feishu/resource-too-large';
          throw error;
        }
        chunks.push(buffer);
      }
      const bytes = Buffer.concat(chunks);
      if (contentType.includes('application/json') || contentType.includes('text/')) {
        // 业务失败被包在流里。
        let detail = '';
        try {
          const parsed = JSON.parse(bytes.toString('utf8'));
          detail = parsed?.msg ? `${parsed.msg}（code ${parsed.code}）` : bytes.toString('utf8').slice(0, 200);
        } catch {
          detail = bytes.toString('utf8').slice(0, 200);
        }
        const error = new Error(`下载飞书资源失败：${detail || contentType}`);
        error.code = 'feishu/resource-failed';
        throw error;
      }
      if (bytes.length === 0) {
        const error = new Error('下载飞书资源失败：返回内容为空。');
        error.code = 'feishu/resource-failed';
        throw error;
      }
      return { bytes, contentType: contentType || null };
    },
  });
}
