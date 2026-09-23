/**
 * 微信 iLink 协议客户端（私聊文本 + 出站图片/文件）。
 *
 * **出处**：本文件是 `xmanrui/dsh-im`（MIT）`src/channels/weixin/weixin-api.mjs`
 * 协议行为的移植版本——iLink 没有公开文档，只能按上游实测出来的协议重写客户端。
 * 原始许可与出处见仓库 THIRD_PARTY_NOTICES.md。本移植覆盖：扫码登录、长轮询收消息、
 * 输入状态、发文本，以及出站媒体（`getuploadurl` → 加密上传 CDN → `sendmessage`
 * 带 `file_item`/`image_item`）；加解密与 CDN 传输在 `./media.mjs`。
 *
 * 安全约定：baseUrl 与二维码地址都必须落在 `*.weixin.qq.com` / `*.wechat.com`
 * 且为 https；CDN 上传地址只信任 `novac2c.cdn.weixin.qq.com/c2c/upload`
 * ——服务端返回的地址不能让我们去连任意主机。
 *
 * @module dsh-chat-weixin/ilink-client
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { aesEcbPaddedSize, mediaUploadUrl, uploadMediaToCdn } from './media.mjs';

/** 扫码登录与默认 API 基址。 */
export const DEFAULT_QR_BASE_URL = 'https://ilinkai.weixin.qq.com/';

/** 协议版本（服务端按它分派行为）。 */
export const PROTOCOL_VERSION = '2.4.6';

/** 机器人类型（个人微信机器人）。 */
export const DEFAULT_BOT_TYPE = '3';

/** 单条消息字符上限（超出按行分段）。 */
export const MAX_MESSAGE_CHARS = 1_800;

const ILINK_APP_ID = 'bot';
const ILINK_CLIENT_VERSION = (2 << 16) | (4 << 8) | 6;
const DEFAULT_TIMEOUT_MS = 15_000;
const LONG_POLL_TIMEOUT_MS = 35_000;

/** 扫码状态机（服务端返回值）。 */
export const LOGIN_STATUSES = Object.freeze([
  'wait', 'scaned', 'confirmed', 'expired',
  'scaned_but_redirect', 'need_verifycode', 'verify_code_blocked', 'binded_redirect',
]);

/** 协议错误：带稳定 code，便于上层区分"网络"与"业务拒绝"。 */
export class IlinkError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'IlinkError';
    this.code = code;
    this.status = options.status;
    this.providerCode = options.providerCode;
    this.timeoutMs = options.timeoutMs;
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error('操作已取消');
  error.name = 'AbortError';
  return error;
}

/**
 * 服务端是否明确拒绝了这次调用（`ret` / `errcode` 非 0）。
 *
 * @param value - 响应体。
 * @param fields - 需要检查的字段。
 * @returns 拒绝时的提供方错误码，否则 null。
 */
export function rejectedResponse(value, fields = ['ret', 'errcode']) {
  if (!value || typeof value !== 'object') return null;
  for (const field of fields) {
    const raw = value[field];
    if (raw === undefined || raw === 0 || raw === '0') continue;
    return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : 'rejected';
  }
  return null;
}

function isWeixinHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  return normalized === 'weixin.qq.com' || normalized.endsWith('.weixin.qq.com')
    || normalized === 'wechat.com' || normalized.endsWith('.wechat.com');
}

/**
 * 校验并归一化 API 基址（只允许微信自己的 https 域名）。
 *
 * @param value - 候选基址。
 * @returns 归一化后的 URL 字符串。
 */
export function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new IlinkError('invalid-base-url', '微信服务返回了无效的连接地址。');
  }
  if (url.protocol !== 'https:' || !isWeixinHost(url.hostname)
    || (url.port !== '' && url.port !== '443')) {
    throw new IlinkError('untrusted-base-url', '微信服务返回了不受信任的连接地址。');
  }
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.toString();
}

/** 校验二维码图片地址（同上，避免被指向任意主机）。 */
export function normalizeQrUrl(value) {
  const text = nonEmptyString(value);
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new IlinkError('invalid-qr', '微信服务返回了无效的扫码地址。');
  }
  if (url.protocol !== 'https:' || !isWeixinHost(url.hostname)) {
    throw new IlinkError('untrusted-qr', '微信服务返回了不受信任的扫码地址。');
  }
  return url.toString();
}

function commonHeaders() {
  return {
    'iLink-App-Id': ILINK_APP_ID,
    'iLink-App-ClientVersion': String(ILINK_CLIENT_VERSION),
  };
}

function authenticatedHeaders(token) {
  const headers = {
    ...commonHeaders(),
    'content-type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': Buffer.from(String(randomBytes(4).readUInt32BE(0)), 'utf8').toString('base64'),
  };
  const value = nonEmptyString(token);
  if (value) headers.Authorization = `Bearer ${value}`;
  return headers;
}

function baseInfo() {
  // bot_agent 只是给平台看的自称，**不带版本号**：写死一个版本就会随发版过期，
  // 而它对协议没有任何作用（真正的版本在 CHANNEL_VERSION，由版本面板展示）。
  return { channel_version: PROTOCOL_VERSION, bot_agent: 'dsh-chat' };
}

async function requestJson(fetchImpl, {
  method,
  baseUrl,
  endpoint,
  body,
  token,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
  authenticated = true,
}) {
  const trustedBase = normalizeBaseUrl(baseUrl);
  const url = new URL(endpoint, trustedBase);
  if (!isWeixinHost(url.hostname)) {
    throw new IlinkError('untrusted-endpoint', '拒绝访问不受信任的微信服务地址。');
  }
  if (signal?.aborted) throw abortError(signal);

  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  let timedOut = false;
  const timer = timeoutMs > 0
    ? setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs)
    : null;

  try {
    const response = await fetchImpl(url, {
      method,
      headers: authenticated ? authenticatedHeaders(token) : commonHeaders(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new IlinkError('http-error', `微信服务请求失败（HTTP ${response.status}）。`, {
        status: response.status,
      });
    }
    try {
      return await response.json();
    } catch (error) {
      throw new IlinkError('invalid-response', '微信服务返回了无法解析的响应。', { cause: error });
    }
  } catch (error) {
    if (signal?.aborted) throw abortError(signal);
    if (timedOut) {
      throw new IlinkError('timeout', '微信服务请求超时。', { cause: error, timeoutMs });
    }
    throw error instanceof IlinkError
      ? error
      : new IlinkError('network-error', '暂时无法访问微信服务。', { cause: error });
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

/**
 * 从入站消息里取文本（文本项或语音转写）。
 *
 * @param message - iLink 消息。
 * @returns 文本，取不到时为 null。
 */
export function extractText(message) {
  for (const item of message?.item_list ?? []) {
    if (item?.type === 1 && typeof item.text_item?.text === 'string') {
      const text = item.text_item.text.trim();
      if (text) return text;
    }
    if (item?.type === 3 && typeof item.voice_item?.text === 'string') {
      const text = item.voice_item.text.trim();
      if (text) return text;
    }
  }
  return null;
}

/** @returns 消息 id（缺 message_id 时用 client_id 兜底）。 */
export function messageId(message) {
  if (message?.message_id !== undefined && message.message_id !== null) {
    return String(message.message_id);
  }
  return nonEmptyString(message?.client_id);
}

/**
 * 按字符上限切分文本，优先在换行处断开。
 *
 * @param text - 回复正文。
 * @param maxChars - 单条上限。
 * @returns 段落数组。
 */
export function splitText(text, maxChars = MAX_MESSAGE_CHARS) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf('\n', maxChars);
    if (splitAt < Math.floor(maxChars * 0.6)) splitAt = maxChars;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n+/, '');
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * 发送一项媒体（图片或文件）。
 *
 * 三步：① `ilink/bot/getuploadurl` 拿上传地址（顺带把原始大小、MD5、填充后大小、
 * AES 密钥报备给服务端）→ ② 加密上传到 CDN，拿回 `encrypt_query_param`
 * → ③ `ilink/bot/sendmessage` 发一条引用该媒体的消息。
 *
 * @param fetchImpl - 注入的 fetch。
 * @param request - { baseUrl, token, toUserId, bytes, contextToken, runId, signal }。
 * @param options - { mediaType, buildItem }。
 * @returns { providerMessageIds }。
 */
async function sendArtifact(fetchImpl, {
  baseUrl, token, toUserId, bytes, contextToken, runId, signal,
}, { mediaType, buildItem }) {
  const recipient = nonEmptyString(toUserId);
  if (!recipient || !bytes?.byteLength) {
    throw new TypeError('发送媒体需要 toUserId 与非空字节。');
  }
  signal?.throwIfAborted();

  const fileKey = randomBytes(16).toString('hex');
  const aesKey = randomBytes(16);
  const ciphertextSize = aesEcbPaddedSize(bytes.byteLength);
  const upload = await requestJson(fetchImpl, {
    method: 'POST',
    baseUrl,
    endpoint: 'ilink/bot/getuploadurl',
    token,
    signal,
    body: {
      filekey: fileKey,
      media_type: mediaType,
      to_user_id: recipient,
      rawsize: bytes.byteLength,
      rawfilemd5: createHash('md5').update(bytes).digest('hex'),
      filesize: ciphertextSize,
      no_need_thumb: true,
      aeskey: aesKey.toString('hex'),
      base_info: baseInfo(),
    },
  });
  const uploadRejection = rejectedResponse(upload);
  if (uploadRejection) {
    throw new IlinkError('upload-url-rejected', '微信服务拒绝了文件上传请求。', {
      providerCode: uploadRejection,
    });
  }

  const downloadParam = await uploadMediaToCdn({
    url: mediaUploadUrl(upload, fileKey),
    bytes,
    key: aesKey,
    signal,
    fetchImpl,
  });
  const media = {
    encrypt_query_param: downloadParam,
    // 服务端要的是"十六进制字符串再做 base64"，与入站解析保持一致。
    aes_key: Buffer.from(aesKey.toString('hex'), 'utf8').toString('base64'),
    encrypt_type: 1,
  };

  const clientId = `dsh-chat-weixin-${randomUUID()}`;
  const response = await requestJson(fetchImpl, {
    method: 'POST',
    baseUrl,
    endpoint: 'ilink/bot/sendmessage',
    token,
    signal,
    body: {
      msg: {
        from_user_id: '',
        to_user_id: recipient,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        item_list: [buildItem({ media, ciphertextSize })],
        ...(nonEmptyString(contextToken) ? { context_token: contextToken } : {}),
        ...(nonEmptyString(runId) ? { run_id: runId } : {}),
      },
      base_info: baseInfo(),
    },
  });
  const sendRejection = rejectedResponse(response);
  if (sendRejection) {
    throw new IlinkError('send-rejected', '微信服务拒绝了文件消息。', { providerCode: sendRejection });
  }
  return { providerMessageIds: [clientId] };
}

/**
 * 创建 iLink 客户端。
 *
 * @param options - { fetchImpl }，测试可注入假 fetch。
 * @returns 客户端 API。
 */
export function createIlinkClient({ fetchImpl = fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('ilink 客户端需要 fetch。');

  return Object.freeze({
    /**
     * 申请登录二维码。
     *
     * @param options - { localTokens, botType, signal }。
     * @returns { qrcode, qrcodeUrl }。
     */
    async beginLogin({ localTokens = [], botType = DEFAULT_BOT_TYPE, signal } = {}) {
      const tokens = [...new Set(localTokens.map(nonEmptyString).filter(Boolean))].slice(-10);
      const response = await requestJson(fetchImpl, {
        method: 'POST',
        baseUrl: DEFAULT_QR_BASE_URL,
        endpoint: `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`,
        body: { local_token_list: tokens },
        timeoutMs: 10_000,
        signal,
      });
      const rejection = rejectedResponse(response, ['errcode', 'ret']);
      if (rejection) {
        throw new IlinkError('qr-request-rejected', '微信服务拒绝了二维码申请。', {
          providerCode: rejection,
        });
      }
      const qrcode = nonEmptyString(response?.qrcode);
      if (!qrcode) throw new IlinkError('invalid-qr', '微信服务没有返回二维码令牌。');
      return { qrcode, qrcodeUrl: normalizeQrUrl(response?.qrcode_img_content) };
    },

    /**
     * 轮询扫码状态。
     *
     * @param options - { qrcode, baseUrl, verifyCode, signal }。
     * @returns 服务端状态对象。
     */
    async pollLogin({ qrcode, baseUrl = DEFAULT_QR_BASE_URL, verifyCode, signal }) {
      const qr = nonEmptyString(qrcode);
      if (!qr) throw new TypeError('pollLogin 需要 qrcode。');
      let endpoint = `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qr)}`;
      const code = nonEmptyString(verifyCode);
      if (code) endpoint += `&verify_code=${encodeURIComponent(code)}`;
      const response = await requestJson(fetchImpl, {
        method: 'GET',
        baseUrl,
        endpoint,
        timeoutMs: LONG_POLL_TIMEOUT_MS,
        signal,
        authenticated: false,
      });
      if (!response || typeof response !== 'object' || !LOGIN_STATUSES.includes(response.status)) {
        throw new IlinkError('invalid-login-status', '微信服务返回了无法识别的扫码状态。');
      }
      return response;
    },

    /**
     * 长轮询收取消息；超时视为"这一轮没有新消息"。
     *
     * @param options - { baseUrl, token, getUpdatesBuf, timeoutMs, signal }。
     * @returns { ret, msgs, get_updates_buf }。
     */
    async getUpdates({ baseUrl, token, getUpdatesBuf = '', timeoutMs, signal }) {
      try {
        return await requestJson(fetchImpl, {
          method: 'POST',
          baseUrl,
          endpoint: 'ilink/bot/getupdates',
          body: { get_updates_buf: getUpdatesBuf, base_info: baseInfo() },
          token,
          timeoutMs: timeoutMs ?? LONG_POLL_TIMEOUT_MS,
          signal,
        });
      } catch (error) {
        if (error instanceof IlinkError && error.code === 'timeout') {
          return { ret: 0, msgs: [], get_updates_buf: getUpdatesBuf };
        }
        throw error;
      }
    },

    /**
     * 取该用户的机器人配置（主要是 typing_ticket）。
     *
     * @param options - { baseUrl, token, toUserId, contextToken, signal }。
     * @returns { typingTicket }。
     */
    async getConfig({ baseUrl, token, toUserId, contextToken, signal }) {
      const recipient = nonEmptyString(toUserId);
      if (!recipient) throw new TypeError('getConfig 需要 toUserId。');
      const response = await requestJson(fetchImpl, {
        method: 'POST',
        baseUrl,
        endpoint: 'ilink/bot/getconfig',
        token,
        signal,
        timeoutMs: 10_000,
        body: {
          ilink_user_id: recipient,
          ...(nonEmptyString(contextToken) ? { context_token: contextToken } : {}),
          base_info: baseInfo(),
        },
      });
      if (response?.ret !== undefined && response.ret !== 0) {
        throw new IlinkError('config-rejected', '微信服务拒绝了机器人配置请求。', {
          providerCode: String(response.ret),
        });
      }
      return { typingTicket: nonEmptyString(response?.typing_ticket) };
    },

    /**
     * 发送/结束"正在输入"。
     *
     * @param options - { baseUrl, token, toUserId, typingTicket, status }，status 1=开始 2=结束。
     */
    async sendTyping({ baseUrl, token, toUserId, typingTicket, status, signal }) {
      const recipient = nonEmptyString(toUserId);
      const ticket = nonEmptyString(typingTicket);
      if (!recipient || !ticket) throw new TypeError('sendTyping 需要 toUserId 与 typingTicket。');
      if (status !== 1 && status !== 2) throw new TypeError('typing status 只能是 1 或 2。');
      const response = await requestJson(fetchImpl, {
        method: 'POST',
        baseUrl,
        endpoint: 'ilink/bot/sendtyping',
        token,
        signal,
        timeoutMs: 10_000,
        body: {
          ilink_user_id: recipient,
          typing_ticket: ticket,
          status,
          base_info: baseInfo(),
        },
      });
      if (response?.ret !== undefined && response.ret !== 0) {
        throw new IlinkError('typing-rejected', '微信服务拒绝了输入状态请求。', {
          providerCode: String(response.ret),
        });
      }
      return true;
    },

    /**
     * 发送一条文本消息。
     *
     * @param options - { baseUrl, token, toUserId, text, contextToken, runId, signal }。
     * @returns { providerMessageIds }。
     */
    async sendText({ baseUrl, token, toUserId, text, contextToken, runId, signal }) {
      const recipient = nonEmptyString(toUserId);
      const content = nonEmptyString(text);
      if (!recipient || !content) throw new TypeError('sendText 需要 toUserId 与 text。');
      const clientId = `dsh-chat-weixin-${randomUUID()}`;
      const response = await requestJson(fetchImpl, {
        method: 'POST',
        baseUrl,
        endpoint: 'ilink/bot/sendmessage',
        token,
        signal,
        body: {
          msg: {
            from_user_id: '',
            to_user_id: recipient,
            client_id: clientId,
            message_type: 2,
            message_state: 2,
            item_list: [{ type: 1, text_item: { text: content } }],
            ...(nonEmptyString(contextToken) ? { context_token: contextToken } : {}),
            ...(nonEmptyString(runId) ? { run_id: runId } : {}),
          },
          base_info: baseInfo(),
        },
      });
      const rejection = rejectedResponse(response);
      if (rejection) {
        throw new IlinkError('send-rejected', '微信服务拒绝了回复消息。', { providerCode: rejection });
      }
      return { providerMessageIds: [clientId] };
    },

    /**
     * 发送一个文件（`file_item`）。
     *
     * @param options - { baseUrl, token, toUserId, fileName, bytes, contextToken, runId, signal }。
     * @returns { providerMessageIds }。
     */
    async sendFile({
      baseUrl, token, toUserId, fileName, bytes, contextToken, runId, signal,
    }) {
      const name = nonEmptyString(fileName);
      if (!name) throw new TypeError('sendFile 需要 fileName。');
      return sendArtifact(fetchImpl, {
        baseUrl, token, toUserId, bytes, contextToken, runId, signal,
      }, {
        mediaType: 3,
        buildItem: ({ media }) => ({
          type: 4,
          file_item: { media, file_name: name, len: String(bytes.byteLength) },
        }),
      });
    },

    /**
     * 发送一张图片（`image_item`，聊天里显示为图片气泡）。
     *
     * @param options - { baseUrl, token, toUserId, bytes, contextToken, runId, signal }。
     * @returns { providerMessageIds }。
     */
    async sendImage({
      baseUrl, token, toUserId, bytes, contextToken, runId, signal,
    }) {
      return sendArtifact(fetchImpl, {
        baseUrl, token, toUserId, bytes, contextToken, runId, signal,
      }, {
        mediaType: 1,
        buildItem: ({ media, ciphertextSize }) => ({
          type: 2,
          image_item: { media, mid_size: ciphertextSize },
        }),
      });
    },

    /** 告诉服务端本机器人开始工作（连接建立时调用）。 */
    async notifyStart({ baseUrl, token, signal }) {
      const response = await requestJson(fetchImpl, {
        method: 'POST',
        baseUrl,
        endpoint: 'ilink/bot/msg/notifystart',
        token,
        signal,
        timeoutMs: 10_000,
        body: { base_info: baseInfo() },
      });
      const rejection = rejectedResponse(response, ['errcode', 'ret']);
      if (rejection) {
        throw new IlinkError(
          rejection === '-14' ? 'stale-token' : 'start-rejected',
          rejection === '-14' ? '微信登录已失效，请重新扫码。' : '微信账号连接启动失败。',
          { providerCode: rejection },
        );
      }
      return response;
    },

    /** 告诉服务端本机器人停止工作。 */
    async notifyStop({ baseUrl, token, signal }) {
      const response = await requestJson(fetchImpl, {
        method: 'POST',
        baseUrl,
        endpoint: 'ilink/bot/msg/notifystop',
        token,
        signal,
        timeoutMs: 10_000,
        body: { base_info: baseInfo() },
      });
      const rejection = rejectedResponse(response, ['errcode', 'ret']);
      if (rejection) {
        throw new IlinkError('stop-rejected', '微信服务未确认停止通知。', { providerCode: rejection });
      }
      return response;
    },
  });
}
