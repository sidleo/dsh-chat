/**
 * 微信 iLink 入站媒体：图片/文件的 CDN 下载与 AES-128-ECB 解密。
 *
 * **出处**：iLink 没有公开文档，本文件的行为（`aeskey` 的两种编码、`media.aes_key`
 * 的 base64 形态、CDN 地址校验规则、AES-128-ECB 解密）来自 `xmanrui/dsh-im`（MIT）
 * 的 `src/channels/weixin/weixin-api.mjs`（`parseWeixinImageAesKey` /
 * `decryptWeixinImage` / `weixinImageDownloadUrl` / `extractWeixinImages` /
 * `extractWeixinFiles`）与 `src/channels/shared/image-prompt.mjs`（`fetchImageBuffer`）。
 * 本文件是按本项目接口**重写**的收窄版：入站"下载并解密成 Buffer"，出站
 * "加密并上传 CDN"；去掉上游的 i18n 与 artifact 错误分类。许可与出处见
 * 仓库 `THIRD_PARTY_NOTICES.md`。
 *
 * 安全约定：下载地址必须落在 `novac2c.cdn.weixin.qq.com` 且为 https——服务端返回的
 * 地址不能让我们去连任意主机；响应体一律**限额读取**，超限即中止。
 *
 * @module dsh-chat-weixin/media
 */

import { createCipheriv, createDecipheriv } from 'node:crypto';

/** 微信 CDN（媒体文件的中转站）。 */
export const MEDIA_CDN_HOST = 'novac2c.cdn.weixin.qq.com';

const MEDIA_CDN_BASE_URL = `https://${MEDIA_CDN_HOST}/c2c`;

/** 图片大小上限（与上游默认一致：超过就请用户压缩）。 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** 文件大小上限（与 hub 主动投递的出站上限对齐）。 */
export const MAX_FILE_BYTES = 30 * 1024 * 1024;

const DOWNLOAD_TIMEOUT_MS = 30_000;

/** 上传：分片与"长时间没有进展"的超时（与上游一致：64KB 一片，60s 无进展即判死）。 */
const UPLOAD_CHUNK_BYTES = 64 * 1024;
const UPLOAD_IDLE_TIMEOUT_MS = 60_000;
const UPLOAD_RETRIES = 3;

/** CDN 上传路径（服务端返回的 upload_full_url 也必须落在这里）。 */
const MEDIA_CDN_UPLOAD_PATH = '/c2c/upload';

/** 媒体错误：带稳定 code，便于上层给出可读回复。 */
export class WeixinMediaError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = 'WeixinMediaError';
    this.code = code;
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function strictBase64(value) {
  const text = nonEmptyString(value);
  if (!text || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null;
  return Buffer.from(text, 'base64');
}

/**
 * 解开 iLink 媒体项里的 AES 密钥（16 字节）。
 *
 * 图片项的 `aeskey` 是 32 位十六进制；文件项的密钥在 `media.aes_key` 上，
 * 是 base64——既可能是 16 字节原文，也可能是"32 位十六进制字符串"的 base64。
 *
 * @param item - `image_item` 或 `file_item`。
 * @returns 16 字节密钥 Buffer。
 */
export function parseMediaAesKey(item) {
  const directHex = nonEmptyString(item?.aeskey);
  if (directHex) {
    if (!/^[0-9a-fA-F]{32}$/.test(directHex)) {
      throw new WeixinMediaError('invalid-media-key', '这条微信消息的加密密钥无效。');
    }
    return Buffer.from(directHex, 'hex');
  }

  const encoded = strictBase64(item?.media?.aes_key);
  if (encoded?.length === 16) return encoded;
  if (encoded?.length === 32 && /^[0-9a-fA-F]{32}$/.test(encoded.toString('ascii'))) {
    return Buffer.from(encoded.toString('ascii'), 'hex');
  }
  throw new WeixinMediaError('invalid-media-key', '这条微信消息的加密密钥无效。');
}

/**
 * AES-128-ECB 解密（iLink 的媒体一律这个模式，无 IV）。
 *
 * @param ciphertext - 密文。
 * @param key - 16 字节密钥。
 * @returns 明文 Buffer。
 */
export function decryptMedia(ciphertext, key) {
  const encrypted = Buffer.from(ciphertext);
  const aesKey = Buffer.from(key);
  if (aesKey.length !== 16 || encrypted.length === 0 || encrypted.length % 16 !== 0) {
    throw new WeixinMediaError('invalid-media-ciphertext', '这条微信消息的加密数据无效。');
  }
  try {
    const decipher = createDecipheriv('aes-128-ecb', aesKey, null);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch (cause) {
    throw new WeixinMediaError('media-decryption-failed', '微信媒体解密失败。', { cause });
  }
}

/**
 * 由 `media` 描述得到可信的下载地址。
 *
 * 优先用 `encrypt_query_param` 自己拼 CDN 地址；只有在没有它时才用服务端给的
 * `full_url`——且必须逐项校验协议/主机/端口/路径，防止被引去任意主机。
 *
 * @param media - `image_item.media` / `file_item.media`。
 * @returns 下载 URL 字符串。
 */
export function mediaDownloadUrl(media) {
  const query = nonEmptyString(media?.encrypt_query_param);
  if (query) {
    return `${MEDIA_CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(query)}`;
  }

  const fullUrl = nonEmptyString(media?.full_url);
  if (!fullUrl) throw new WeixinMediaError('missing-media-url', '这条微信消息没有可用的下载地址。');
  let url;
  try {
    url = new URL(fullUrl);
  } catch {
    throw new WeixinMediaError('invalid-media-url', '这条微信消息的下载地址无效。');
  }
  if (url.protocol !== 'https:' || url.hostname !== MEDIA_CDN_HOST
    || (url.port && url.port !== '443') || !url.pathname.startsWith('/c2c/')) {
    throw new WeixinMediaError('untrusted-media-url', '这条微信消息的下载地址不受信任。');
  }
  url.username = '';
  url.password = '';
  url.hash = '';
  return url.toString();
}

/** 限额读取响应体（不信任 content-length，边读边数）。 */
async function readBodyLimited(response, maxBytes) {
  const declared = Number(response?.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response?.body?.cancel?.().catch?.(() => undefined);
    throw new WeixinMediaError('media-too-large', `内容超过上限（${Math.round(maxBytes / 1024 / 1024)} MB）。`);
  }
  if (!response?.body?.[Symbol.asyncIterator]) {
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > maxBytes) {
      throw new WeixinMediaError('media-too-large', `内容超过上限（${Math.round(maxBytes / 1024 / 1024)} MB）。`);
    }
    return data;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    const data = Buffer.from(chunk);
    size += data.length;
    if (size > maxBytes) {
      await response.body.cancel?.().catch?.(() => undefined);
      throw new WeixinMediaError('media-too-large', `内容超过上限（${Math.round(maxBytes / 1024 / 1024)} MB）。`);
    }
    chunks.push(data);
  }
  return Buffer.concat(chunks, size);
}

/**
 * 下载并解密一项媒体。
 *
 * @param item - `image_item` 或 `file_item`。
 * @param options - { signal, maxBytes, fetchImpl }。
 * @returns 明文 Buffer。
 */
export async function downloadMedia(item, {
  signal, maxBytes = MAX_IMAGE_BYTES, fetchImpl = fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl 必须是函数。');
  signal?.throwIfAborted();
  const key = parseMediaAesKey(item);
  const url = mediaDownloadUrl(item?.media);

  // 超时与调用方取消**同时**生效：任何一条都不允许无限等。
  const timeout = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response;
  try {
    response = await fetchImpl(new URL(url), { method: 'GET', redirect: 'manual', signal: combined });
  } catch (cause) {
    if (signal?.aborted) signal.throwIfAborted();
    throw new WeixinMediaError('media-download-failed', `微信媒体下载失败：${cause?.message ?? cause}`, { cause });
  }
  if (Number.isInteger(response?.status) && response.status >= 300 && response.status < 400) {
    await response.body?.cancel?.().catch?.(() => undefined);
    throw new WeixinMediaError('media-redirect-blocked', '微信媒体下载地址发生了重定向，已中止。');
  }
  if (!response?.ok) {
    await response?.body?.cancel?.().catch?.(() => undefined);
    throw new WeixinMediaError(
      'media-download-failed',
      `微信媒体下载失败（HTTP ${response?.status ?? 'unknown'}）。`,
    );
  }

  // 密文是"填充后的明文大小"，因此限额要放宽一个 AES 块。
  const ciphertext = await readBodyLimited(response, maxBytes + 16);
  signal?.throwIfAborted();
  return decryptMedia(ciphertext, key);
}

/** 按魔数认图片类型（不信任扩展名；与飞书渠道同一套判定）。 */
export function sniffImageMediaType(bytes, contentType) {
  const supported = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
  const declared = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  if (supported.has(declared)) return declared;
  const head = bytes.subarray(0, 12);
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e) return 'image/png';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.length >= 6 && head.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (head.length >= 12 && head.subarray(0, 4).toString('latin1') === 'RIFF'
    && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * 从入站消息里挑出图片与文件（纯解析，不下载）。
 *
 * 两种媒体都可能是"文字 + 图片"混排的一条消息，因此这里与 `extractText` 互不排斥。
 *
 * @param message - iLink 消息。
 * @returns `{ images:[{name,item}], files:[{name,size,item}] }`。
 */
export function extractInboundMedia(message) {
  const images = [];
  const files = [];
  for (const item of message?.item_list ?? []) {
    if (item?.image_item && typeof item.image_item === 'object') {
      images.push({
        name: images.length === 0 ? 'weixin-image' : `weixin-image-${images.length + 1}`,
        item: item.image_item,
      });
      continue;
    }
    if (item?.file_item && typeof item.file_item === 'object') {
      const declaredSize = Number(item.file_item.len);
      files.push({
        name: nonEmptyString(item.file_item.file_name)
          ?? (files.length === 0 ? 'weixin-file' : `weixin-file-${files.length + 1}`),
        ...(Number.isFinite(declaredSize) && declaredSize >= 0 ? { size: declaredSize } : {}),
        item: item.file_item,
      });
    }
  }
  return { images, files };
}

// ── 出站：加密并上传到 CDN ───────────────────────────────────────────────────

/**
 * AES-128-ECB 的 PKCS#7 填充后长度（服务端要按它校验 `filesize`）。
 *
 * @param size - 原始字节数。
 * @returns 填充后的字节数。
 */
export function aesEcbPaddedSize(size) {
  return Math.ceil((size + 1) / 16) * 16;
}

/**
 * 校验服务端返回的 CDN 上传地址。
 *
 * @param value - 地址字符串。
 * @returns URL 对象。
 */
export function trustedUploadUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new WeixinMediaError('invalid-upload-url', '微信服务返回了无效的文件上传地址。');
  }
  if (url.protocol !== 'https:' || url.hostname !== MEDIA_CDN_HOST
    || (url.port && url.port !== '443') || url.pathname !== MEDIA_CDN_UPLOAD_PATH
    || url.username || url.password) {
    throw new WeixinMediaError('untrusted-upload-url', '微信服务返回了不受信任的文件上传地址。');
  }
  url.hash = '';
  return url;
}

/**
 * 由 `getuploadurl` 的响应拼出上传地址。
 *
 * 优先用服务端给的 `upload_full_url`（仍要过 `trustedUploadUrl`），否则用
 * `upload_param` 自己拼——两条路都不允许指向别的主机。
 *
 * @param response - `ilink/bot/getuploadurl` 的响应。
 * @param fileKey - 本次上传的 filekey。
 * @returns URL 对象。
 */
export function mediaUploadUrl(response, fileKey) {
  const fullUrl = nonEmptyString(response?.upload_full_url);
  if (fullUrl) return trustedUploadUrl(fullUrl);
  const uploadParam = nonEmptyString(response?.upload_param);
  if (!uploadParam) throw new WeixinMediaError('missing-upload-url', '微信服务没有返回文件上传地址。');
  const url = new URL(`${MEDIA_CDN_BASE_URL}/upload`);
  url.searchParams.set('encrypted_query_param', uploadParam);
  url.searchParams.set('filekey', fileKey);
  return trustedUploadUrl(url.toString());
}

/** 分片加密（不让密文再整份复制一遍）。 */
async function* encryptChunks(bytes, key, { signal, onProgress }) {
  const cipher = createCipheriv('aes-128-ecb', key, null);
  for (let offset = 0; offset < bytes.byteLength; offset += UPLOAD_CHUNK_BYTES) {
    signal?.throwIfAborted();
    const chunk = cipher.update(bytes.subarray(offset, offset + UPLOAD_CHUNK_BYTES));
    onProgress();
    if (chunk.byteLength) yield chunk;
  }
  signal?.throwIfAborted();
  onProgress();
  yield cipher.final();
}

/**
 * 加密并上传到微信 CDN，返回写进消息里的 `encrypt_query_param`。
 *
 * 上传是"边加密边推流"，服务端按 `content-length`（填充后长度）收；成功时下载参数
 * 在响应头 `x-encrypted-param` 上。可重试：4xx 与被拒是确定性失败，直接抛。
 *
 * 实测：CDN 会拒绝**极小**的图片（79 字节的 2×2 PNG 稳定返回 HTTP 500，同样字节按
 * `media_type=3` 当文件上传却成功），所以图片上传拿到 500 不一定是网络问题——
 * 先确认图片本身是不是过小。
 *
 * @param options - { url, bytes, key, signal, fetchImpl }。
 * @returns 下载参数（写进 `media.encrypt_query_param`）。
 */
export async function uploadMediaToCdn({
  url, bytes, key, signal, fetchImpl = fetch,
}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl 必须是函数。');
  const target = url instanceof URL ? url : trustedUploadUrl(url);
  let lastError;
  for (let attempt = 1; attempt <= UPLOAD_RETRIES; attempt += 1) {
    signal?.throwIfAborted();
    const idle = new AbortController();
    const uploadSignal = signal ? AbortSignal.any([signal, idle.signal]) : idle.signal;
    let timer;
    let active = true;
    // "长时间没有进展"就判死：每产出一片就重置计时器。
    const onProgress = () => {
      if (!active) return;
      clearTimeout(timer);
      timer = setTimeout(() => idle.abort(new WeixinMediaError(
        'upload-timeout', '微信文件上传长时间没有进展，已超时。',
      )), UPLOAD_IDLE_TIMEOUT_MS);
    };
    const body = encryptChunks(bytes, key, { signal: uploadSignal, onProgress });
    let response;
    onProgress();
    try {
      response = await fetchImpl(target, {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': String(aesEcbPaddedSize(bytes.byteLength)),
        },
        body,
        duplex: 'half',
        redirect: 'error',
        signal: uploadSignal,
      });
      uploadSignal.throwIfAborted();
      if (response.status >= 400 && response.status < 500) {
        throw new WeixinMediaError('upload-rejected', `微信文件上传被拒绝（HTTP ${response.status}）。`);
      }
      if (response.status !== 200) {
        throw new WeixinMediaError('upload-failed', `微信文件上传失败（HTTP ${response.status}）。`);
      }
      const downloadParam = nonEmptyString(response.headers?.get?.('x-encrypted-param'));
      if (!downloadParam) {
        throw new WeixinMediaError('invalid-upload-response', '微信文件上传响应缺少下载参数。');
      }
      return downloadParam;
    } catch (cause) {
      if (signal?.aborted) signal.throwIfAborted();
      const failure = idle.signal.aborted ? idle.signal.reason : cause;
      lastError = failure;
      // 4xx / 被拒 = 确定性失败，重试没有意义。
      if (failure instanceof WeixinMediaError
        && (failure.code === 'upload-rejected' || failure.code === 'upload-timeout'
          || failure.code === 'invalid-upload-response')) {
        throw failure;
      }
    } finally {
      active = false;
      clearTimeout(timer);
      await body.return?.();
      await response?.body?.cancel?.().catch?.(() => undefined);
    }
  }
  throw lastError instanceof WeixinMediaError
    ? lastError
    : new WeixinMediaError('upload-failed', '微信文件上传失败。', { cause: lastError });
}
