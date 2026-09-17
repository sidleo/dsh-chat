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

/**
 * 把飞书卡片回调归一化成一种形状。
 *
 * 为什么必须做：我们注册在**裸 EventDispatcher** 上，拿到的是原始回调体
 * （`operator.open_id` / `context.open_chat_id` / `action.value`），
 * 而不是 SDK 高层封装里那份 camelCase 版本（`operator.openId` / `chatId`）。
 * 真机上就是因为按后者读字段，回调进来后被"缺 operator/chatId"静默丢掉。
 *
 * 两种形状都认：缺字段就返回 null，由调用方记一条可检索的日志。
 *
 * @param raw - 原始回调体。
 * @returns 归一化事件，或 null。
 */
export function normalizeCardAction(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const context = raw.context ?? {};
  const operator = raw.operator ?? {};
  const action = raw.action ?? {};
  const messageId = context.open_message_id ?? raw.open_message_id ?? raw.messageId;
  const chatId = context.open_chat_id ?? raw.open_chat_id ?? raw.chatId;
  const openId = operator.open_id ?? operator.openId;
  if (typeof chatId !== 'string' || !chatId || typeof openId !== 'string' || !openId) return null;
  return Object.freeze({
    messageId: typeof messageId === 'string' ? messageId : undefined,
    chatId,
    operator: Object.freeze({ openId }),
    action: Object.freeze({
      tag: action.tag ?? 'unknown',
      value: action.value ?? {},
      // 表单（form）内组件的值在这里：action.form_value[组件name]。
      formValue: action.form_value ?? action.formValue ?? {},
      ...(action.name === undefined ? {} : { name: action.name }),
    }),
    raw,
  });
}

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
  loggerLevel = process.env.DSH_CHAT_FEISHU_SDK_LOG || 'info',
  maxResourceBytes = DEFAULT_MAX_RESOURCE_BYTES,
} = {}) {
  if (!sdk?.Client || !sdk?.WSClient) throw new TypeError('飞书网关需要 @larksuiteoapi/node-sdk。');
  if (!appId || !appSecret) throw new TypeError('飞书网关需要 appId 与 appSecret。');

  const clientOptions = {
    appId,
    appSecret,
    ...(domain === 'lark' ? { domain: sdk.Domain?.Lark } : {}),
    // 让 SDK 自己的日志也进我们的渠道日志文件：排查"事件到底有没有到"
    // （如卡片回调）时，SDK 的帧日志与 `no xxx handle` 警告是唯一线索。
    logger,
    loggerLevel: loggerLevelFor(sdk, loggerLevel),
  };
  const client = new sdk.Client(clientOptions);
  const wsOptions = {
    ...clientOptions,
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
        'card.action.trigger': (event) => {
          const normalized = normalizeCardAction(event);
          if (!normalized) {
            // 到了但认不出：把原始键名记下来，别让"点了没反应"再次无从查起。
            logger.warn?.('[dsh-chat-feishu] 收到卡片回调但字段认不出：'
              + `${JSON.stringify(event ?? null).slice(0, 300)}`);
            return undefined;
          }
          logger.info?.('[dsh-chat-feishu] 收到卡片回调：'
            + `会话=${normalized.chatId} 操作者=${normalized.operator.openId}`
            + ` 值=${JSON.stringify(normalized.action.value)}`
            // 表单类控件的值不一定在 value 里，原始 action 一并记下（截断，避免刷屏）。
            + ` 原始=${JSON.stringify(event?.action ?? {}).slice(0, 400)}`);
          return Promise.resolve()
          .then(() => onCardAction?.(normalized))
          .catch((error) => {
            logger.error?.(`[dsh-chat-feishu] 处理卡片回调失败：${error?.message ?? error}`);
            return undefined;
          });
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
     * 提问卡片：**一页一题**，答完就地翻到下一题。Card 2.0。
     *
     * 组件选择有依据（`lark-im` skill 的卡片组件文档，均为 Card 2.0 组件）：
     * - 单选 → `button` + `behaviors:[{type:'callback'}]`；
     * - 多选 → `form` 内的 **`multi_select_static`**（原生多选控件）+ `form_action_type:'submit'` 的提交按钮；
     * - 自由文本 → `form` 内的 `input` + 提交按钮；
     * - 表单值回调在 `action.form_value[组件name]`（不是 `action.value`）。
     * 早前用 Card 1.0 的 `checker` 当"多选组"是错的：它是**任务勾选器**（单个），
     * 且 1.0 里没有表单，所以既渲染不出选项、也拿不到提交值。
     *
     * @param options - { chatId } 或 { openId }、{ questions, answered, final, messageId? }。
     * @returns { messageId }。
     */
    async sendQuestionsCard({ chatId, openId, questions = [], answered = {}, final = false, messageId = null }) {
      const receiveId = chatId ?? openId;
      if (!messageId && !receiveId) throw new TypeError('sendQuestionsCard 需要 chatId/openId 或 messageId。');
      const total = questions.length;
      const answeredList = questions.filter((question) => answered[question?.id] !== undefined);
      const current = questions.find((question) => answered[question?.id] === undefined) ?? null;
      const elements = [];

      const answerText = (question) => {
        const answer = answered[question?.id] ?? {};
        const chosen = [...(answer.selected ?? [])];
        if (answer.custom) chosen.push(answer.custom);
        return chosen.join('、') || '（空）';
      };

      if (answeredList.length > 0) {
        elements.push({
          tag: 'markdown',
          content: answeredList
            .map((question) => `✅ **${questions.indexOf(question) + 1}. ${question?.header || '问题'}** → ${answerText(question)}`)
            .join('\n'),
        });
        elements.push({ tag: 'hr' });
      }

      if (current) {
        const index = questions.indexOf(current) + 1;
        const body = [`**${index}. ${current?.header || '需要确认'}**`, '', String(current?.question ?? '')];
        if (current?.detail) body.push('', String(current.detail));
        const options = Array.isArray(current?.options) ? current.options : [];
        const questionId = String(current?.id ?? '');

        if (options.length > 0 && current?.multiSelect !== true) {
          // 单选：直接给按钮（点了即答，无需提交）
          elements.push({ tag: 'markdown', content: body.join('\n') });
          options.slice(0, 8).forEach((option, optionIndex) => {
            const label = String(option.label).slice(0, 60);
            elements.push({
              tag: 'button',
              text: { tag: 'plain_text', content: option.description ? `${label} —— ${option.description}`.slice(0, 100) : label },
              type: optionIndex === 0 ? 'primary_filled' : 'default',
              width: 'fill',
              behaviors: [{
                type: 'callback',
                value: { dsh: 'answer', questionId, label, index: String(optionIndex + 1) },
              }],
            });
          });
        } else if (options.length > 0) {
          // 多选：**每个选项一个勾选器（checker）平铺列出**，用户直接勾选，点「提交」一起回来。
          // 不用 multi_select_static 是因为它是下拉控件（真机反馈：要能一眼看到所有选项）。
          // checker 在 form 内不配 behaviors：勾选只在本地生效，提交时随 form_value 回来。
          body.push('', '可多选：勾选后点「提交」。');
          elements.push({ tag: 'markdown', content: body.join('\n') });
          elements.push({
            tag: 'form',
            name: `dsh_form_${questionId}`,
            elements: [
              ...options.slice(0, 20).map((option, optionIndex) => ({
                tag: 'checker',
                name: `chk_${optionIndex}_${questionId}`,
                checked: false,
                text: { tag: 'plain_text', content: String(option.label).slice(0, 80) },
              })),
              {
                tag: 'button',
                name: 'submit',
                form_action_type: 'submit',
                type: 'primary_filled',
                width: 'fill',
                text: { tag: 'plain_text', content: '提交' },
              },
            ],
          });
        } else {
          // 自由文本：原生输入框 + 提交
          body.push('', '在下面输入后点「提交」（也可以直接在聊天里回复）。');
          elements.push({ tag: 'markdown', content: body.join('\n') });
          elements.push({
            tag: 'form',
            name: `dsh_form_${questionId}`,
            elements: [
              {
                tag: 'input',
                name: `text_${questionId}`,
                placeholder: { tag: 'plain_text', content: '在这里输入' },
                label: { tag: 'plain_text', content: '你的回答' },
                input_type: 'multiline_text',
                rows: 2,
              },
              {
                tag: 'button',
                name: 'submit',
                form_action_type: 'submit',
                type: 'primary_filled',
                width: 'fill',
                text: { tag: 'plain_text', content: '提交' },
              },
            ],
          });
        }
        elements.push({
          tag: 'div',
          text: {
            tag: 'plain_text',
            content: '回答后这张卡片会自动翻到下一题；也可以直接回复文字。',
            text_size: 'notation',
          },
        });
      } else {
        elements.push({ tag: 'markdown', content: '全部问题都已回答，正在继续处理…' });
      }

      const card = {
        schema: '2.0',
        config: { update_multi: true, width_mode: 'default' },
        header: {
          template: final || !current ? 'green' : 'blue',
          title: {
            tag: 'plain_text',
            content: final || !current
              ? '✅ 已全部回答'
              : `❓ 需要你确认（第 ${questions.indexOf(current) + 1}/${total} 题）`,
          },
        },
        body: { direction: 'vertical', elements },
      };
      if (messageId) {
        const patched = await client.im.v1.message.patch({
          path: { message_id: messageId },
          data: { content: JSON.stringify(card) },
        });
        assertSuccess('飞书更新提问卡片', patched);
        return { messageId };
      }
      const response = await client.im.v1.message.create({
        params: { receive_id_type: chatId ? 'chat_id' : 'open_id' },
        data: { receive_id: receiveId, msg_type: 'interactive', content: JSON.stringify(card) },
      });
      assertSuccess('飞书发送提问卡片', response);
      return { messageId: response?.data?.message_id };
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
