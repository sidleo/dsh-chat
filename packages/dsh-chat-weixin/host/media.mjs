/**
 * 微信 iLink 入站媒体：图片/文件的 CDN 下载与 AES-128-ECB 解密。
 *
 * **出处**：iLink 没有公开文档，本文件的行为（`aeskey` 的两种编码、`media.aes_key`
 * 的 base64 形态、CDN 地址校验规则、AES-128-ECB 解密）来自 `xmanrui/dsh-im`（MIT）
 * 的 `src/channels/weixin/weixin-api.mjs`（`parseWeixinImageAesKey` /
 * `decryptWeixinImage` / `weixinImageDownloadUrl` / `extractWeixinImages` /
 * `extractWeixinFiles`）与 `src/channels/shared/image-prompt.mjs`（`fetchImageBuffer`）。
 * 本文件是按本项目接口**重写**的收窄版：只保留"入站下载并解密成 Buffer"，
 * 去掉上游的 i18n、artifact 错误分类、惰性图片引用包装与出站上传。许可与出处见
 * 仓库 `THIRD_PARTY_NOTICES.md`。
 *
 * 安全约定：下载地址必须落在 `novac2c.cdn.weixin.qq.com` 且为 https——服务端返回的
 * 地址不能让我们去连任意主机；响应体一律**限额读取**，超限即中止。
 *
 * @module dsh-chat-weixin/media
 */

import { createDecipheriv } from 'node:crypto';

/** 微信 CDN（媒体文件的中转站）。 */
export const MEDIA_CDN_HOST = 'novac2c.cdn.weixin.qq.com';

const MEDIA_CDN_BASE_URL = `https://${MEDIA_CDN_HOST}/c2c`;

/** 图片大小上限（与上游默认一致：超过就请用户压缩）。 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** 文件大小上限（与 hub 主动投递的出站上限对齐）。 */
export const MAX_FILE_BYTES = 30 * 1024 * 1024;

const DOWNLOAD_TIMEOUT_MS = 30_000;

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
