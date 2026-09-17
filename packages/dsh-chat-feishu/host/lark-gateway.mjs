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

import { askRow } from './turn-presenter.mjs';

const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;

/** 按扩展名判断是不是图片（图片走图片气泡/正文内嵌，其余走附件区）。 */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

function isImagePath(path) {
  const name = String(path).toLowerCase();
  const dot = name.lastIndexOf('.');
  return dot >= 0 && IMAGE_EXTENSIONS.has(name.slice(dot));
}

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

  /**
   * 单选/多选页共用的"自定义文字答案"表单：输入框宽度拉满 + 提交。
   *
   * 为什么要它（真机反馈）：卡片上只有按钮时，用户想写"以上都不是，我想要…"这种
   * 自定义答案就没有地方写，只能切回聊天框。多给一个输入框，选项与自由文本就都能用。
   *
   * @param options - { questionId, placeholder }。
   * @returns 表单元素数组。
   */
  function customInputElements({
    questionId,
    placeholder = '也可以直接输入你的答案，点「提交」',
    formName = 'dsh_custom',
    submitType = 'default',
  }) {
    return [{
      tag: 'form',
      name: `${formName}_${questionId}`,
      elements: [
        {
          tag: 'input',
          name: `text_${questionId}`,
          placeholder: { tag: 'plain_text', content: placeholder },
          input_type: 'multiline_text',
          rows: 1,
          auto_resize: true,
          max_rows: 6,
          width: 'fill',
        },
        {
          tag: 'button',
          name: 'submit',
          form_action_type: 'submit',
          type: submitType,
          width: 'fill',
          text: { tag: 'plain_text', content: '提交' },
        },
      ],
    }];
  }

  /**
   * 渲染提问：已答的给出"面板行"，未答的给出"交互元素"（纯函数，不发请求）。
   *
   * 两种用法：
   * ① 内嵌进"正在处理"的进度卡——已答的行并入那张卡的工具面板（真机反馈：提问回答
   *    也要跟工具、思考放在一起），未答的控件留在面板外（Card 2.0 的面板里放不了 form）；
   * ② 独立提问卡片——已答的行自己组成一个 `❓ N/M 已回答` 折叠面板，控件在下面。
   *
   * 组件依据（`lark-im` skill 的卡片组件文档，均为 Card 2.0）：单选=按钮+输入框；
   * 多选=form 内每个选项一个 checker 平铺 + 提交；自由文本=form 内 input + 提交。
   * 表单值回调在 `action.form_value[组件name]`。
   *
   * @param options - { questions, answered, final }。
   * @returns { rows, elements, current }：已答的行、当前题的交互元素、当前题（答完为 null）。
   */
  function renderQuestionElements({ questions = [], answered = {}, final = false } = {}) {
    const elements = [];
    const answeredList = questions.filter((question) => answered[question?.id] !== undefined);
    const current = final
      ? null
      : (questions.find((question) => answered[question?.id] === undefined) ?? null);

    const answerText = (question) => {
      const answer = answered[question?.id] ?? {};
      const chosen = [...(answer.selected ?? [])];
      if (answer.custom) chosen.push(answer.custom);
      return chosen.join('、') || '（空）';
    };

    // 已答的题：渲染成与工具/思考同样的一行（`提问 · 口径 → 答案`），由调用方决定
    // 放进工具面板还是自己组一个面板。
    const rows = answeredList.map((question) => ({
      id: String(question?.id ?? questions.indexOf(question)),
      text: askRow({
        header: question?.header || question?.question || '问题',
        answer: answerText(question),
      }),
    }));

    if (!current) return { rows, elements, current: null };

    const index = questions.indexOf(current) + 1;
    const body = [`**${index}. ${current?.header || '需要确认'}**`, '', String(current?.question ?? '')];
    if (current?.detail) body.push('', String(current.detail));
    const options = Array.isArray(current?.options) ? current.options : [];
    const questionId = String(current?.id ?? '');
    elements.push({ tag: 'hr' });

    if (options.length > 0 && current?.multiSelect !== true) {
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
      elements.push(...customInputElements({ questionId, formName: 'dsh_custom' }));
    } else if (options.length > 0) {
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
            tag: 'input',
            name: `text_${questionId}`,
            placeholder: { tag: 'plain_text', content: '也可以在补充框里写别的答案' },
            input_type: 'multiline_text',
            rows: 1,
            width: 'fill',
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
    } else {
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
            rows: 3,
            auto_resize: true,
            max_rows: 8,
            width: 'fill',
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
        content: '回答后会自动翻到下一题；也可以直接回复文字。',
        text_size: 'notation',
      },
    });
    return { rows, elements, current };
  }

  /**
   * 上传一个文件，返回 `file_key`。
   *
   * 注意：`im.v1.file.create` / `image.create` 直接返回 data（`{ file_key }`），
   * 不像 `message.create` 那样包一层 `{ code, msg, data }`；两种都认，免得跟着 SDK 版本翻车。
   */
  async function uploadFileKey(path, fileName) {
    const uploaded = await client.im.v1.file.create({
      data: { file_type: fileTypeFor(fileName), file_name: fileName, file: createReadStream(path) },
    });
    const fileKey = uploaded?.file_key ?? uploaded?.data?.file_key;
    if (!fileKey) {
      const error = new Error('飞书上传文件失败：没有返回 file_key。');
      error.code = 'feishu/upload-failed';
      throw error;
    }
    return fileKey;
  }

  /** 上传一张图片，返回 `image_key`。 */
  async function uploadImageKey(path) {
    const uploaded = await client.im.v1.image.create({
      data: { image_type: 'message', image: createReadStream(path) },
    });
    const imageKey = uploaded?.image_key ?? uploaded?.data?.image_key;
    if (!imageKey) {
      const error = new Error('飞书上传图片失败：没有返回 image_key。');
      error.code = 'feishu/upload-failed';
      throw error;
    }
    return imageKey;
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
      const fileKey = await uploadFileKey(path, fileName);
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
      const imageKey = await uploadImageKey(path);
      const response = await client.im.v1.message.create({
        params: { receive_id_type: chatId ? 'chat_id' : 'open_id' },
        data: { receive_id: receiveId, msg_type: 'image', content: JSON.stringify({ image_key: imageKey }) },
      });
      assertSuccess('飞书发送图片', response);
      return { messageId: response?.data?.message_id, imageKey };
    },

    /**
     * 独立提问卡片（Card 2.0，一页一题）。
     *
     * 进度卡可用时提问会内嵌进那张卡（见 turn-presenter），这个独立卡片只是兜底。
     *
     * @param options - { chatId } 或 { openId }、{ questions, answered, final, messageId? }。
     * @returns { messageId }。
     */
    async sendQuestionsCard({ chatId, openId, questions = [], answered = {}, final = false, messageId = null }) {
      const receiveId = chatId ?? openId;
      if (!messageId && !receiveId) throw new TypeError('sendQuestionsCard 需要 chatId/openId 或 messageId。');
      const { rows, elements, current } = renderQuestionElements({ questions, answered, final });
      if (rows.length > 0) {
        // 独立卡片没有"工具面板"，已答的行自己组成一个折叠面板：
        // 收起而不是消失，点标题还能展开回看（真机要求）。
        elements.unshift({
          tag: 'collapsible_panel',
          expanded: Boolean(current),
          border: { color: 'grey', corner_radius: '4px' },
          header: {
            title: {
              tag: 'plain_text',
              content: `❓ ${rows.length}/${questions.length} 已回答`,
            },
            width: 'fill',
            icon_position: 'right',
            icon_expanded_angle: -180,
          },
          elements: [{
            tag: 'markdown',
            content: rows.map((row) => `· ${row.text}`).join('\n'),
          }],
        });
      }
      if (elements.length === 0) {
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
              : `❓ 需要你确认（第 ${questions.indexOf(current) + 1}/${questions.length} 题）`,
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
     * 一条消息发多个交付文件。
     *
     * 飞书原生支持：`post`（富文本）消息有一个顶层 `files` 附件区，可以放**多个**
     * `file_key`（文件名/大小由服务端按文件元数据回填，客户端传 name 无效）；
     * 图片则用 `{"tag":"img","image_key":…}` 内嵌在正文里。因此多个成品只占**一条**消息，
     * 不再一条一个文件地刷屏。
     *
     * @param options - { chatId, openId, items }，`items` = `[{ path, name?, description? }]`。
     * @returns { messageId, files, images, failed }：成功清单与失败清单。
     */
    async sendDeliverables({ chatId, openId, items = [] }) {
      const receiveId = chatId ?? openId;
      if (!receiveId) throw new TypeError('sendDeliverables 需要 chatId 或 openId。');
      const paragraphs = [[{ tag: 'text', text: '📎 交付文件' }]];
      const attachments = [];
      const sent = [];
      const failed = [];
      for (const item of items) {
        const path = typeof item?.path === 'string' ? item.path : '';
        if (!path) continue;
        const name = item.name || path.split('/').pop() || '文件';
        try {
          if (isImagePath(path)) {
            const imageKey = await uploadImageKey(path);
            paragraphs.push([{ tag: 'img', image_key: imageKey }]);
            if (item.description) paragraphs.push([{ tag: 'text', text: String(item.description) }]);
            sent.push({ name, kind: 'image' });
            continue;
          }
          const fileKey = await uploadFileKey(path, name);
          attachments.push({ key: fileKey });
          paragraphs.push([{
            tag: 'text',
            text: `· ${name}${item.description ? ` —— ${item.description}` : ''}`,
          }]);
          sent.push({ name, kind: 'file' });
        } catch (error) {
          failed.push({ name, reason: error?.message ?? String(error) });
        }
      }
      if (sent.length === 0) return { files: [], images: [], failed, messageId: null };
      const content = {
        zh_cn: { title: '交付文件', content: paragraphs },
        ...(attachments.length > 0 ? { files: attachments } : {}),
      };
      const response = await client.im.v1.message.create({
        params: { receive_id_type: chatId ? 'chat_id' : 'open_id' },
        data: { receive_id: receiveId, msg_type: 'post', content: JSON.stringify(content) },
      });
      assertSuccess('飞书发送交付文件', response);
      return {
        messageId: response?.data?.message_id,
        files: sent.filter((entry) => entry.kind === 'file').map((entry) => entry.name),
        images: sent.filter((entry) => entry.kind === 'image').map((entry) => entry.name),
        failed,
      };
    },

    /** 供进度卡内嵌提问区使用（纯渲染）。 */
    renderQuestionElements,

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

    /**
     * 给一条消息加表情回复（默认「在做了」），返回可撤销的 reaction_id。
     *
     * 用途：用户发来消息时立刻打个表情表示"收到了、正在处理"，处理完再撤掉——
     * 比等着卡片刷新更即时，也不会污染聊天记录。
     *
     * @param options - { messageId, emojiType = 'OnIt' }。
     * @returns { reactionId }。
     */
    async addReaction({ messageId, emojiType = 'OnIt' }) {
      if (!messageId) throw new TypeError('addReaction 需要 messageId。');
      const response = await client.im.v1.messageReaction.create({
        path: { message_id: messageId },
        data: { reaction_type: { emoji_type: emojiType } },
      });
      assertSuccess('飞书添加表情回复', response);
      return { reactionId: response?.data?.reaction_id ?? null };
    },

    /**
     * 撤销一条表情回复。
     *
     * @param options - { messageId, reactionId }。
     */
    async removeReaction({ messageId, reactionId }) {
      if (!messageId || !reactionId) return { removed: false };
      const response = await client.im.v1.messageReaction.delete({
        path: { message_id: messageId, reaction_id: reactionId },
      });
      assertSuccess('飞书撤销表情回复', response);
      return { removed: true };
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
