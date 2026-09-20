import { createRequire as __dshCreateRequire } from 'node:module';
import { dirname as __dshDirname } from 'node:path';
import { fileURLToPath as __dshFileURLToPath } from 'node:url';
const require = __dshCreateRequire(import.meta.url);
const __filename = __dshFileURLToPath(import.meta.url);
const __dirname = __dshDirname(__filename);

// packages/dsh-chat-weixin/host/controller.mjs
import { createHash as createHash2, randomUUID as randomUUID2 } from "node:crypto";
import { join } from "node:path";

// packages/dsh-chat-weixin/host/config-store.mjs
var ACCOUNT_ID = /^[A-Za-z0-9_@.:+-]{1,128}$/;
var TOKEN_REF = /^[A-Za-z_][A-Za-z0-9_]*$/;
var FALLBACK_BASE_URL = "https://ilinkai.weixin.qq.com/";
function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function normalizeAccount(value) {
  if (!value || typeof value !== "object") return null;
  const botId = cleanString(value.botId);
  const accountId = cleanString(value.accountId);
  const tokenRef = cleanString(value.tokenRef);
  const ownerUserId = cleanString(value.ownerUserId);
  if (!botId || !ACCOUNT_ID.test(botId)) return null;
  if (!accountId || !ACCOUNT_ID.test(accountId)) return null;
  if (!tokenRef || !TOKEN_REF.test(tokenRef)) return null;
  if (!ownerUserId) return null;
  return Object.freeze({
    botId,
    accountId,
    tokenRef,
    ownerUserId,
    baseUrl: cleanString(value.baseUrl) ?? FALLBACK_BASE_URL,
    botName: cleanString(value.botName),
    createdAt: cleanString(value.createdAt),
    connectedAt: cleanString(value.connectedAt)
  });
}
function normalizeDocument(value) {
  const source = value && typeof value === "object" && Array.isArray(value.accounts) ? value : null;
  if (!source) return { version: 1, accounts: [] };
  const accounts = source.accounts.map((account) => normalizeAccount(account));
  if (accounts.some((account) => account === null)) {
    throw new Error("dsh-weixin config.json \u542B\u65E0\u6CD5\u8BC6\u522B\u7684\u8D26\u53F7\u6761\u76EE");
  }
  return { version: 1, accounts };
}
function createWeixinConfigStore({ path, createJsonStore }) {
  if (typeof createJsonStore !== "function") {
    throw new TypeError("\u5FAE\u4FE1\u914D\u7F6E\u5B58\u50A8\u9700\u8981 hub \u63D0\u4F9B\u7684 createJsonStore\u3002");
  }
  const store = createJsonStore({
    path,
    normalize: normalizeDocument,
    empty: () => ({ version: 1, accounts: [] }),
    label: "\u5FAE\u4FE1\u8D26\u53F7\u914D\u7F6E"
  });
  return {
    path,
    ready: () => store.ready(),
    subscribe: (listener) => store.subscribe(listener),
    /** @returns 全部账号。 */
    list() {
      return Object.freeze([...store.snapshot().accounts ?? []]);
    },
    /** @returns 指定账号，未配置时 undefined。 */
    get(botId) {
      return store.snapshot().accounts.find((account) => account.botId === botId);
    },
    /** 追加或覆盖一个账号。 */
    async saveAccount(account) {
      const normalized = normalizeAccount(account);
      if (!normalized) throw new TypeError("\u5FAE\u4FE1\u8D26\u53F7\u4FE1\u606F\u4E0D\u5B8C\u6574\uFF08botId/accountId/tokenRef/ownerUserId \u5FC5\u586B\uFF09\u3002");
      await store.update((current) => {
        const accounts = [...current.accounts];
        const index = accounts.findIndex((item) => item.botId === normalized.botId);
        if (index >= 0) accounts[index] = normalized;
        else accounts.push(normalized);
        return { version: 1, accounts };
      });
      return normalized;
    },
    /** 删除一个账号。 */
    async removeAccount(botId) {
      let removed = false;
      await store.update((current) => {
        const accounts = current.accounts.filter((account) => account.botId !== botId);
        if (accounts.length === current.accounts.length) return null;
        removed = true;
        return { version: 1, accounts };
      });
      return removed;
    }
  };
}

// packages/dsh-chat-weixin/host/ilink-client.mjs
import { createHash, randomBytes, randomUUID } from "node:crypto";

// packages/dsh-chat-weixin/host/media.mjs
import { createCipheriv, createDecipheriv } from "node:crypto";
var MEDIA_CDN_HOST = "novac2c.cdn.weixin.qq.com";
var MEDIA_CDN_BASE_URL = `https://${MEDIA_CDN_HOST}/c2c`;
var MAX_IMAGE_BYTES = 5 * 1024 * 1024;
var MAX_FILE_BYTES = 30 * 1024 * 1024;
var DOWNLOAD_TIMEOUT_MS = 3e4;
var UPLOAD_CHUNK_BYTES = 64 * 1024;
var UPLOAD_IDLE_TIMEOUT_MS = 6e4;
var UPLOAD_RETRIES = 3;
var MEDIA_CDN_UPLOAD_PATH = "/c2c/upload";
var WeixinMediaError = class extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "WeixinMediaError";
    this.code = code;
  }
};
function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function strictBase64(value) {
  const text = nonEmptyString(value);
  if (!text || text.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null;
  return Buffer.from(text, "base64");
}
function parseMediaAesKey(item) {
  const directHex = nonEmptyString(item?.aeskey);
  if (directHex) {
    if (!/^[0-9a-fA-F]{32}$/.test(directHex)) {
      throw new WeixinMediaError("invalid-media-key", "\u8FD9\u6761\u5FAE\u4FE1\u6D88\u606F\u7684\u52A0\u5BC6\u5BC6\u94A5\u65E0\u6548\u3002");
    }
    return Buffer.from(directHex, "hex");
  }
  const encoded = strictBase64(item?.media?.aes_key);
  if (encoded?.length === 16) return encoded;
  if (encoded?.length === 32 && /^[0-9a-fA-F]{32}$/.test(encoded.toString("ascii"))) {
    return Buffer.from(encoded.toString("ascii"), "hex");
  }
  throw new WeixinMediaError("invalid-media-key", "\u8FD9\u6761\u5FAE\u4FE1\u6D88\u606F\u7684\u52A0\u5BC6\u5BC6\u94A5\u65E0\u6548\u3002");
}
function decryptMedia(ciphertext, key) {
  const encrypted = Buffer.from(ciphertext);
  const aesKey = Buffer.from(key);
  if (aesKey.length !== 16 || encrypted.length === 0 || encrypted.length % 16 !== 0) {
    throw new WeixinMediaError("invalid-media-ciphertext", "\u8FD9\u6761\u5FAE\u4FE1\u6D88\u606F\u7684\u52A0\u5BC6\u6570\u636E\u65E0\u6548\u3002");
  }
  try {
    const decipher = createDecipheriv("aes-128-ecb", aesKey, null);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } catch (cause) {
    throw new WeixinMediaError("media-decryption-failed", "\u5FAE\u4FE1\u5A92\u4F53\u89E3\u5BC6\u5931\u8D25\u3002", { cause });
  }
}
function mediaDownloadUrl(media) {
  const query = nonEmptyString(media?.encrypt_query_param);
  if (query) {
    return `${MEDIA_CDN_BASE_URL}/download?encrypted_query_param=${encodeURIComponent(query)}`;
  }
  const fullUrl = nonEmptyString(media?.full_url);
  if (!fullUrl) throw new WeixinMediaError("missing-media-url", "\u8FD9\u6761\u5FAE\u4FE1\u6D88\u606F\u6CA1\u6709\u53EF\u7528\u7684\u4E0B\u8F7D\u5730\u5740\u3002");
  let url;
  try {
    url = new URL(fullUrl);
  } catch {
    throw new WeixinMediaError("invalid-media-url", "\u8FD9\u6761\u5FAE\u4FE1\u6D88\u606F\u7684\u4E0B\u8F7D\u5730\u5740\u65E0\u6548\u3002");
  }
  if (url.protocol !== "https:" || url.hostname !== MEDIA_CDN_HOST || url.port && url.port !== "443" || !url.pathname.startsWith("/c2c/")) {
    throw new WeixinMediaError("untrusted-media-url", "\u8FD9\u6761\u5FAE\u4FE1\u6D88\u606F\u7684\u4E0B\u8F7D\u5730\u5740\u4E0D\u53D7\u4FE1\u4EFB\u3002");
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  return url.toString();
}
async function readBodyLimited(response, maxBytes) {
  const declared = Number(response?.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response?.body?.cancel?.().catch?.(() => void 0);
    throw new WeixinMediaError("media-too-large", `\u5185\u5BB9\u8D85\u8FC7\u4E0A\u9650\uFF08${Math.round(maxBytes / 1024 / 1024)} MB\uFF09\u3002`);
  }
  if (!response?.body?.[Symbol.asyncIterator]) {
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > maxBytes) {
      throw new WeixinMediaError("media-too-large", `\u5185\u5BB9\u8D85\u8FC7\u4E0A\u9650\uFF08${Math.round(maxBytes / 1024 / 1024)} MB\uFF09\u3002`);
    }
    return data;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    const data = Buffer.from(chunk);
    size += data.length;
    if (size > maxBytes) {
      await response.body.cancel?.().catch?.(() => void 0);
      throw new WeixinMediaError("media-too-large", `\u5185\u5BB9\u8D85\u8FC7\u4E0A\u9650\uFF08${Math.round(maxBytes / 1024 / 1024)} MB\uFF09\u3002`);
    }
    chunks.push(data);
  }
  return Buffer.concat(chunks, size);
}
async function downloadMedia(item, {
  signal,
  maxBytes = MAX_IMAGE_BYTES,
  fetchImpl = fetch
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl \u5FC5\u987B\u662F\u51FD\u6570\u3002");
  signal?.throwIfAborted();
  const key = parseMediaAesKey(item);
  const url = mediaDownloadUrl(item?.media);
  const timeout = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetchImpl(new URL(url), { method: "GET", redirect: "manual", signal: combined });
  } catch (cause) {
    if (signal?.aborted) signal.throwIfAborted();
    throw new WeixinMediaError("media-download-failed", `\u5FAE\u4FE1\u5A92\u4F53\u4E0B\u8F7D\u5931\u8D25\uFF1A${cause?.message ?? cause}`, { cause });
  }
  if (Number.isInteger(response?.status) && response.status >= 300 && response.status < 400) {
    await response.body?.cancel?.().catch?.(() => void 0);
    throw new WeixinMediaError("media-redirect-blocked", "\u5FAE\u4FE1\u5A92\u4F53\u4E0B\u8F7D\u5730\u5740\u53D1\u751F\u4E86\u91CD\u5B9A\u5411\uFF0C\u5DF2\u4E2D\u6B62\u3002");
  }
  if (!response?.ok) {
    await response?.body?.cancel?.().catch?.(() => void 0);
    throw new WeixinMediaError(
      "media-download-failed",
      `\u5FAE\u4FE1\u5A92\u4F53\u4E0B\u8F7D\u5931\u8D25\uFF08HTTP ${response?.status ?? "unknown"}\uFF09\u3002`
    );
  }
  const ciphertext = await readBodyLimited(response, maxBytes + 16);
  signal?.throwIfAborted();
  return decryptMedia(ciphertext, key);
}
function sniffImageMediaType(bytes, contentType) {
  const supported = /* @__PURE__ */ new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  const declared = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  if (supported.has(declared)) return declared;
  const head = bytes.subarray(0, 12);
  if (head.length >= 8 && head[0] === 137 && head[1] === 80 && head[2] === 78) return "image/png";
  if (head.length >= 3 && head[0] === 255 && head[1] === 216 && head[2] === 255) return "image/jpeg";
  if (head.length >= 6 && head.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (head.length >= 12 && head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}
function extractInboundMedia(message) {
  const images = [];
  const files = [];
  for (const item of message?.item_list ?? []) {
    if (item?.image_item && typeof item.image_item === "object") {
      images.push({
        name: images.length === 0 ? "weixin-image" : `weixin-image-${images.length + 1}`,
        item: item.image_item
      });
      continue;
    }
    if (item?.file_item && typeof item.file_item === "object") {
      const declaredSize = Number(item.file_item.len);
      files.push({
        name: nonEmptyString(item.file_item.file_name) ?? (files.length === 0 ? "weixin-file" : `weixin-file-${files.length + 1}`),
        ...Number.isFinite(declaredSize) && declaredSize >= 0 ? { size: declaredSize } : {},
        item: item.file_item
      });
    }
  }
  return { images, files };
}
function aesEcbPaddedSize(size) {
  return Math.ceil((size + 1) / 16) * 16;
}
function trustedUploadUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new WeixinMediaError("invalid-upload-url", "\u5FAE\u4FE1\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u6587\u4EF6\u4E0A\u4F20\u5730\u5740\u3002");
  }
  if (url.protocol !== "https:" || url.hostname !== MEDIA_CDN_HOST || url.port && url.port !== "443" || url.pathname !== MEDIA_CDN_UPLOAD_PATH || url.username || url.password) {
    throw new WeixinMediaError("untrusted-upload-url", "\u5FAE\u4FE1\u670D\u52A1\u8FD4\u56DE\u4E86\u4E0D\u53D7\u4FE1\u4EFB\u7684\u6587\u4EF6\u4E0A\u4F20\u5730\u5740\u3002");
  }
  url.hash = "";
  return url;
}
function mediaUploadUrl(response, fileKey) {
  const fullUrl = nonEmptyString(response?.upload_full_url);
  if (fullUrl) return trustedUploadUrl(fullUrl);
  const uploadParam = nonEmptyString(response?.upload_param);
  if (!uploadParam) throw new WeixinMediaError("missing-upload-url", "\u5FAE\u4FE1\u670D\u52A1\u6CA1\u6709\u8FD4\u56DE\u6587\u4EF6\u4E0A\u4F20\u5730\u5740\u3002");
  const url = new URL(`${MEDIA_CDN_BASE_URL}/upload`);
  url.searchParams.set("encrypted_query_param", uploadParam);
  url.searchParams.set("filekey", fileKey);
  return trustedUploadUrl(url.toString());
}
async function* encryptChunks(bytes, key, { signal, onProgress }) {
  const cipher = createCipheriv("aes-128-ecb", key, null);
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
async function uploadMediaToCdn({
  url,
  bytes,
  key,
  signal,
  fetchImpl = fetch
}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl \u5FC5\u987B\u662F\u51FD\u6570\u3002");
  const target = url instanceof URL ? url : trustedUploadUrl(url);
  let lastError;
  for (let attempt = 1; attempt <= UPLOAD_RETRIES; attempt += 1) {
    signal?.throwIfAborted();
    const idle = new AbortController();
    const uploadSignal = signal ? AbortSignal.any([signal, idle.signal]) : idle.signal;
    let timer;
    let active = true;
    const onProgress = () => {
      if (!active) return;
      clearTimeout(timer);
      timer = setTimeout(() => idle.abort(new WeixinMediaError(
        "upload-timeout",
        "\u5FAE\u4FE1\u6587\u4EF6\u4E0A\u4F20\u957F\u65F6\u95F4\u6CA1\u6709\u8FDB\u5C55\uFF0C\u5DF2\u8D85\u65F6\u3002"
      )), UPLOAD_IDLE_TIMEOUT_MS);
    };
    const body = encryptChunks(bytes, key, { signal: uploadSignal, onProgress });
    let response;
    onProgress();
    try {
      response = await fetchImpl(target, {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "content-length": String(aesEcbPaddedSize(bytes.byteLength))
        },
        body,
        duplex: "half",
        redirect: "error",
        signal: uploadSignal
      });
      uploadSignal.throwIfAborted();
      if (response.status >= 400 && response.status < 500) {
        throw new WeixinMediaError("upload-rejected", `\u5FAE\u4FE1\u6587\u4EF6\u4E0A\u4F20\u88AB\u62D2\u7EDD\uFF08HTTP ${response.status}\uFF09\u3002`);
      }
      if (response.status !== 200) {
        throw new WeixinMediaError("upload-failed", `\u5FAE\u4FE1\u6587\u4EF6\u4E0A\u4F20\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`);
      }
      const downloadParam = nonEmptyString(response.headers?.get?.("x-encrypted-param"));
      if (!downloadParam) {
        throw new WeixinMediaError("invalid-upload-response", "\u5FAE\u4FE1\u6587\u4EF6\u4E0A\u4F20\u54CD\u5E94\u7F3A\u5C11\u4E0B\u8F7D\u53C2\u6570\u3002");
      }
      return downloadParam;
    } catch (cause) {
      if (signal?.aborted) signal.throwIfAborted();
      const failure = idle.signal.aborted ? idle.signal.reason : cause;
      lastError = failure;
      if (failure instanceof WeixinMediaError && (failure.code === "upload-rejected" || failure.code === "upload-timeout" || failure.code === "invalid-upload-response")) {
        throw failure;
      }
    } finally {
      active = false;
      clearTimeout(timer);
      await body.return?.();
      await response?.body?.cancel?.().catch?.(() => void 0);
    }
  }
  throw lastError instanceof WeixinMediaError ? lastError : new WeixinMediaError("upload-failed", "\u5FAE\u4FE1\u6587\u4EF6\u4E0A\u4F20\u5931\u8D25\u3002", { cause: lastError });
}

// packages/dsh-chat-weixin/host/ilink-client.mjs
var DEFAULT_QR_BASE_URL = "https://ilinkai.weixin.qq.com/";
var PROTOCOL_VERSION = "2.4.6";
var DEFAULT_BOT_TYPE = "3";
var MAX_MESSAGE_CHARS = 1800;
var ILINK_APP_ID = "bot";
var ILINK_CLIENT_VERSION = 2 << 16 | 4 << 8 | 6;
var DEFAULT_TIMEOUT_MS = 15e3;
var LONG_POLL_TIMEOUT_MS = 35e3;
var LOGIN_STATUSES = Object.freeze([
  "wait",
  "scaned",
  "confirmed",
  "expired",
  "scaned_but_redirect",
  "need_verifycode",
  "verify_code_blocked",
  "binded_redirect"
]);
var IlinkError = class extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "IlinkError";
    this.code = code;
    this.status = options.status;
    this.providerCode = options.providerCode;
    this.timeoutMs = options.timeoutMs;
  }
};
function nonEmptyString2(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error("\u64CD\u4F5C\u5DF2\u53D6\u6D88");
  error.name = "AbortError";
  return error;
}
function rejectedResponse(value, fields = ["ret", "errcode"]) {
  if (!value || typeof value !== "object") return null;
  for (const field of fields) {
    const raw = value[field];
    if (raw === void 0 || raw === 0 || raw === "0") continue;
    return typeof raw === "string" || typeof raw === "number" ? String(raw) : "rejected";
  }
  return null;
}
function isWeixinHost(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "weixin.qq.com" || normalized.endsWith(".weixin.qq.com") || normalized === "wechat.com" || normalized.endsWith(".wechat.com");
}
function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new IlinkError("invalid-base-url", "\u5FAE\u4FE1\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u8FDE\u63A5\u5730\u5740\u3002");
  }
  if (url.protocol !== "https:" || !isWeixinHost(url.hostname) || url.port !== "" && url.port !== "443") {
    throw new IlinkError("untrusted-base-url", "\u5FAE\u4FE1\u670D\u52A1\u8FD4\u56DE\u4E86\u4E0D\u53D7\u4FE1\u4EFB\u7684\u8FDE\u63A5\u5730\u5740\u3002");
  }
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}
function normalizeQrUrl(value) {
  const text = nonEmptyString2(value);
  if (!text) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new IlinkError("invalid-qr", "\u5FAE\u4FE1\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u626B\u7801\u5730\u5740\u3002");
  }
  if (url.protocol !== "https:" || !isWeixinHost(url.hostname)) {
    throw new IlinkError("untrusted-qr", "\u5FAE\u4FE1\u670D\u52A1\u8FD4\u56DE\u4E86\u4E0D\u53D7\u4FE1\u4EFB\u7684\u626B\u7801\u5730\u5740\u3002");
  }
  return url.toString();
}
function commonHeaders() {
  return {
    "iLink-App-Id": ILINK_APP_ID,
    "iLink-App-ClientVersion": String(ILINK_CLIENT_VERSION)
  };
}
function authenticatedHeaders(token) {
  const headers = {
    ...commonHeaders(),
    "content-type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": Buffer.from(String(randomBytes(4).readUInt32BE(0)), "utf8").toString("base64")
  };
  const value = nonEmptyString2(token);
  if (value) headers.Authorization = `Bearer ${value}`;
  return headers;
}
function baseInfo() {
  return { channel_version: PROTOCOL_VERSION, bot_agent: "dsh-chat/0.0.1" };
}
async function requestJson(fetchImpl, {
  method,
  baseUrl,
  endpoint,
  body,
  token,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
  authenticated = true
}) {
  const trustedBase = normalizeBaseUrl(baseUrl);
  const url = new URL(endpoint, trustedBase);
  if (!isWeixinHost(url.hostname)) {
    throw new IlinkError("untrusted-endpoint", "\u62D2\u7EDD\u8BBF\u95EE\u4E0D\u53D7\u4FE1\u4EFB\u7684\u5FAE\u4FE1\u670D\u52A1\u5730\u5740\u3002");
  }
  if (signal?.aborted) throw abortError(signal);
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  let timedOut = false;
  const timer = timeoutMs > 0 ? setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs) : null;
  try {
    const response = await fetchImpl(url, {
      method,
      headers: authenticated ? authenticatedHeaders(token) : commonHeaders(),
      ...body === void 0 ? {} : { body: JSON.stringify(body) },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new IlinkError("http-error", `\u5FAE\u4FE1\u670D\u52A1\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`, {
        status: response.status
      });
    }
    try {
      return await response.json();
    } catch (error) {
      throw new IlinkError("invalid-response", "\u5FAE\u4FE1\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u89E3\u6790\u7684\u54CD\u5E94\u3002", { cause: error });
    }
  } catch (error) {
    if (signal?.aborted) throw abortError(signal);
    if (timedOut) {
      throw new IlinkError("timeout", "\u5FAE\u4FE1\u670D\u52A1\u8BF7\u6C42\u8D85\u65F6\u3002", { cause: error, timeoutMs });
    }
    throw error instanceof IlinkError ? error : new IlinkError("network-error", "\u6682\u65F6\u65E0\u6CD5\u8BBF\u95EE\u5FAE\u4FE1\u670D\u52A1\u3002", { cause: error });
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}
function extractText(message) {
  for (const item of message?.item_list ?? []) {
    if (item?.type === 1 && typeof item.text_item?.text === "string") {
      const text = item.text_item.text.trim();
      if (text) return text;
    }
    if (item?.type === 3 && typeof item.voice_item?.text === "string") {
      const text = item.voice_item.text.trim();
      if (text) return text;
    }
  }
  return null;
}
function messageId(message) {
  if (message?.message_id !== void 0 && message.message_id !== null) {
    return String(message.message_id);
  }
  return nonEmptyString2(message?.client_id);
}
function splitText(text, maxChars = MAX_MESSAGE_CHARS) {
  if (text.length <= maxChars) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    let splitAt = remaining.lastIndexOf("\n", maxChars);
    if (splitAt < Math.floor(maxChars * 0.6)) splitAt = maxChars;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n+/, "");
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
async function sendArtifact(fetchImpl, {
  baseUrl,
  token,
  toUserId,
  bytes,
  contextToken,
  runId,
  signal
}, { mediaType, buildItem }) {
  const recipient = nonEmptyString2(toUserId);
  if (!recipient || !bytes?.byteLength) {
    throw new TypeError("\u53D1\u9001\u5A92\u4F53\u9700\u8981 toUserId \u4E0E\u975E\u7A7A\u5B57\u8282\u3002");
  }
  signal?.throwIfAborted();
  const fileKey = randomBytes(16).toString("hex");
  const aesKey = randomBytes(16);
  const ciphertextSize = aesEcbPaddedSize(bytes.byteLength);
  const upload = await requestJson(fetchImpl, {
    method: "POST",
    baseUrl,
    endpoint: "ilink/bot/getuploadurl",
    token,
    signal,
    body: {
      filekey: fileKey,
      media_type: mediaType,
      to_user_id: recipient,
      rawsize: bytes.byteLength,
      rawfilemd5: createHash("md5").update(bytes).digest("hex"),
      filesize: ciphertextSize,
      no_need_thumb: true,
      aeskey: aesKey.toString("hex"),
      base_info: baseInfo()
    }
  });
  const uploadRejection = rejectedResponse(upload);
  if (uploadRejection) {
    throw new IlinkError("upload-url-rejected", "\u5FAE\u4FE1\u670D\u52A1\u62D2\u7EDD\u4E86\u6587\u4EF6\u4E0A\u4F20\u8BF7\u6C42\u3002", {
      providerCode: uploadRejection
    });
  }
  const downloadParam = await uploadMediaToCdn({
    url: mediaUploadUrl(upload, fileKey),
    bytes,
    key: aesKey,
    signal,
    fetchImpl
  });
  const media = {
    encrypt_query_param: downloadParam,
    // 服务端要的是"十六进制字符串再做 base64"，与入站解析保持一致。
    aes_key: Buffer.from(aesKey.toString("hex"), "utf8").toString("base64"),
    encrypt_type: 1
  };
  const clientId = `dsh-chat-weixin-${randomUUID()}`;
  const response = await requestJson(fetchImpl, {
    method: "POST",
    baseUrl,
    endpoint: "ilink/bot/sendmessage",
    token,
    signal,
    body: {
      msg: {
        from_user_id: "",
        to_user_id: recipient,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        item_list: [buildItem({ media, ciphertextSize })],
        ...nonEmptyString2(contextToken) ? { context_token: contextToken } : {},
        ...nonEmptyString2(runId) ? { run_id: runId } : {}
      },
      base_info: baseInfo()
    }
  });
  const sendRejection = rejectedResponse(response);
  if (sendRejection) {
    throw new IlinkError("send-rejected", "\u5FAE\u4FE1\u670D\u52A1\u62D2\u7EDD\u4E86\u6587\u4EF6\u6D88\u606F\u3002", { providerCode: sendRejection });
  }
  return { providerMessageIds: [clientId] };
}
function createIlinkClient({ fetchImpl = fetch } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("ilink \u5BA2\u6237\u7AEF\u9700\u8981 fetch\u3002");
  return Object.freeze({
    /**
     * 申请登录二维码。
     *
     * @param options - { localTokens, botType, signal }。
     * @returns { qrcode, qrcodeUrl }。
     */
    async beginLogin({ localTokens = [], botType = DEFAULT_BOT_TYPE, signal } = {}) {
      const tokens = [...new Set(localTokens.map(nonEmptyString2).filter(Boolean))].slice(-10);
      const response = await requestJson(fetchImpl, {
        method: "POST",
        baseUrl: DEFAULT_QR_BASE_URL,
        endpoint: `ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(botType)}`,
        body: { local_token_list: tokens },
        timeoutMs: 1e4,
        signal
      });
      const rejection = rejectedResponse(response, ["errcode", "ret"]);
      if (rejection) {
        throw new IlinkError("qr-request-rejected", "\u5FAE\u4FE1\u670D\u52A1\u62D2\u7EDD\u4E86\u4E8C\u7EF4\u7801\u7533\u8BF7\u3002", {
          providerCode: rejection
        });
      }
      const qrcode = nonEmptyString2(response?.qrcode);
      if (!qrcode) throw new IlinkError("invalid-qr", "\u5FAE\u4FE1\u670D\u52A1\u6CA1\u6709\u8FD4\u56DE\u4E8C\u7EF4\u7801\u4EE4\u724C\u3002");
      return { qrcode, qrcodeUrl: normalizeQrUrl(response?.qrcode_img_content) };
    },
    /**
     * 轮询扫码状态。
     *
     * @param options - { qrcode, baseUrl, verifyCode, signal }。
     * @returns 服务端状态对象。
     */
    async pollLogin({ qrcode, baseUrl = DEFAULT_QR_BASE_URL, verifyCode, signal }) {
      const qr = nonEmptyString2(qrcode);
      if (!qr) throw new TypeError("pollLogin \u9700\u8981 qrcode\u3002");
      let endpoint = `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qr)}`;
      const code = nonEmptyString2(verifyCode);
      if (code) endpoint += `&verify_code=${encodeURIComponent(code)}`;
      const response = await requestJson(fetchImpl, {
        method: "GET",
        baseUrl,
        endpoint,
        timeoutMs: LONG_POLL_TIMEOUT_MS,
        signal,
        authenticated: false
      });
      if (!response || typeof response !== "object" || !LOGIN_STATUSES.includes(response.status)) {
        throw new IlinkError("invalid-login-status", "\u5FAE\u4FE1\u670D\u52A1\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BC6\u522B\u7684\u626B\u7801\u72B6\u6001\u3002");
      }
      return response;
    },
    /**
     * 长轮询收取消息；超时视为"这一轮没有新消息"。
     *
     * @param options - { baseUrl, token, getUpdatesBuf, timeoutMs, signal }。
     * @returns { ret, msgs, get_updates_buf }。
     */
    async getUpdates({ baseUrl, token, getUpdatesBuf = "", timeoutMs, signal }) {
      try {
        return await requestJson(fetchImpl, {
          method: "POST",
          baseUrl,
          endpoint: "ilink/bot/getupdates",
          body: { get_updates_buf: getUpdatesBuf, base_info: baseInfo() },
          token,
          timeoutMs: timeoutMs ?? LONG_POLL_TIMEOUT_MS,
          signal
        });
      } catch (error) {
        if (error instanceof IlinkError && error.code === "timeout") {
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
      const recipient = nonEmptyString2(toUserId);
      if (!recipient) throw new TypeError("getConfig \u9700\u8981 toUserId\u3002");
      const response = await requestJson(fetchImpl, {
        method: "POST",
        baseUrl,
        endpoint: "ilink/bot/getconfig",
        token,
        signal,
        timeoutMs: 1e4,
        body: {
          ilink_user_id: recipient,
          ...nonEmptyString2(contextToken) ? { context_token: contextToken } : {},
          base_info: baseInfo()
        }
      });
      if (response?.ret !== void 0 && response.ret !== 0) {
        throw new IlinkError("config-rejected", "\u5FAE\u4FE1\u670D\u52A1\u62D2\u7EDD\u4E86\u673A\u5668\u4EBA\u914D\u7F6E\u8BF7\u6C42\u3002", {
          providerCode: String(response.ret)
        });
      }
      return { typingTicket: nonEmptyString2(response?.typing_ticket) };
    },
    /**
     * 发送/结束"正在输入"。
     *
     * @param options - { baseUrl, token, toUserId, typingTicket, status }，status 1=开始 2=结束。
     */
    async sendTyping({ baseUrl, token, toUserId, typingTicket, status, signal }) {
      const recipient = nonEmptyString2(toUserId);
      const ticket = nonEmptyString2(typingTicket);
      if (!recipient || !ticket) throw new TypeError("sendTyping \u9700\u8981 toUserId \u4E0E typingTicket\u3002");
      if (status !== 1 && status !== 2) throw new TypeError("typing status \u53EA\u80FD\u662F 1 \u6216 2\u3002");
      const response = await requestJson(fetchImpl, {
        method: "POST",
        baseUrl,
        endpoint: "ilink/bot/sendtyping",
        token,
        signal,
        timeoutMs: 1e4,
        body: {
          ilink_user_id: recipient,
          typing_ticket: ticket,
          status,
          base_info: baseInfo()
        }
      });
      if (response?.ret !== void 0 && response.ret !== 0) {
        throw new IlinkError("typing-rejected", "\u5FAE\u4FE1\u670D\u52A1\u62D2\u7EDD\u4E86\u8F93\u5165\u72B6\u6001\u8BF7\u6C42\u3002", {
          providerCode: String(response.ret)
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
      const recipient = nonEmptyString2(toUserId);
      const content = nonEmptyString2(text);
      if (!recipient || !content) throw new TypeError("sendText \u9700\u8981 toUserId \u4E0E text\u3002");
      const clientId = `dsh-chat-weixin-${randomUUID()}`;
      const response = await requestJson(fetchImpl, {
        method: "POST",
        baseUrl,
        endpoint: "ilink/bot/sendmessage",
        token,
        signal,
        body: {
          msg: {
            from_user_id: "",
            to_user_id: recipient,
            client_id: clientId,
            message_type: 2,
            message_state: 2,
            item_list: [{ type: 1, text_item: { text: content } }],
            ...nonEmptyString2(contextToken) ? { context_token: contextToken } : {},
            ...nonEmptyString2(runId) ? { run_id: runId } : {}
          },
          base_info: baseInfo()
        }
      });
      const rejection = rejectedResponse(response);
      if (rejection) {
        throw new IlinkError("send-rejected", "\u5FAE\u4FE1\u670D\u52A1\u62D2\u7EDD\u4E86\u56DE\u590D\u6D88\u606F\u3002", { providerCode: rejection });
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
      baseUrl,
      token,
      toUserId,
      fileName,
      bytes,
      contextToken,
      runId,
      signal
    }) {
      const name2 = nonEmptyString2(fileName);
      if (!name2) throw new TypeError("sendFile \u9700\u8981 fileName\u3002");
      return sendArtifact(fetchImpl, {
        baseUrl,
        token,
        toUserId,
        bytes,
        contextToken,
        runId,
        signal
      }, {
        mediaType: 3,
        buildItem: ({ media }) => ({
          type: 4,
          file_item: { media, file_name: name2, len: String(bytes.byteLength) }
        })
      });
    },
    /**
     * 发送一张图片（`image_item`，聊天里显示为图片气泡）。
     *
     * @param options - { baseUrl, token, toUserId, bytes, contextToken, runId, signal }。
     * @returns { providerMessageIds }。
     */
    async sendImage({
      baseUrl,
      token,
      toUserId,
      bytes,
      contextToken,
      runId,
      signal
    }) {
      return sendArtifact(fetchImpl, {
        baseUrl,
        token,
        toUserId,
        bytes,
        contextToken,
        runId,
        signal
      }, {
        mediaType: 1,
        buildItem: ({ media, ciphertextSize }) => ({
          type: 2,
          image_item: { media, mid_size: ciphertextSize }
        })
      });
    },
    /** 告诉服务端本机器人开始工作（连接建立时调用）。 */
    async notifyStart({ baseUrl, token, signal }) {
      const response = await requestJson(fetchImpl, {
        method: "POST",
        baseUrl,
        endpoint: "ilink/bot/msg/notifystart",
        token,
        signal,
        timeoutMs: 1e4,
        body: { base_info: baseInfo() }
      });
      const rejection = rejectedResponse(response, ["errcode", "ret"]);
      if (rejection) {
        throw new IlinkError(
          rejection === "-14" ? "stale-token" : "start-rejected",
          rejection === "-14" ? "\u5FAE\u4FE1\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u626B\u7801\u3002" : "\u5FAE\u4FE1\u8D26\u53F7\u8FDE\u63A5\u542F\u52A8\u5931\u8D25\u3002",
          { providerCode: rejection }
        );
      }
      return response;
    },
    /** 告诉服务端本机器人停止工作。 */
    async notifyStop({ baseUrl, token, signal }) {
      const response = await requestJson(fetchImpl, {
        method: "POST",
        baseUrl,
        endpoint: "ilink/bot/msg/notifystop",
        token,
        signal,
        timeoutMs: 1e4,
        body: { base_info: baseInfo() }
      });
      const rejection = rejectedResponse(response, ["errcode", "ret"]);
      if (rejection) {
        throw new IlinkError("stop-rejected", "\u5FAE\u4FE1\u670D\u52A1\u672A\u786E\u8BA4\u505C\u6B62\u901A\u77E5\u3002", { providerCode: rejection });
      }
      return response;
    }
  });
}

// packages/dsh-chat-weixin/host/runtime.mjs
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
function createWeixinRuntime({
  account,
  token,
  deps,
  client,
  state,
  logger = console,
  fetchImpl = fetch
}) {
  if (!account?.botId) throw new TypeError("\u5FAE\u4FE1\u8FD0\u884C\u65F6\u9700\u8981\u8D26\u53F7\u914D\u7F6E\u3002");
  if (!token) throw new TypeError("\u5FAE\u4FE1\u8FD0\u884C\u65F6\u9700\u8981\u8BBF\u95EE\u4EE4\u724C\u3002");
  if (typeof deps?.sessions?.ask !== "function" || typeof deps?.contextEnhancement?.enhanceContent !== "function") {
    throw new TypeError("\u5FAE\u4FE1\u8FD0\u884C\u65F6\u9700\u8981 hub \u7684 sessions.ask \u4E0E contextEnhancement\u3002");
  }
  const baseUrl = account.baseUrl;
  let phase = "idle";
  let error = null;
  let handled = 0;
  let lastHandledAt = null;
  let lastMessageAt = null;
  let typingTickets = /* @__PURE__ */ new Map();
  let loop = null;
  function setPhase(next, detail = null) {
    phase = next;
    error = detail;
  }
  async function typingTicket(userId, contextToken, signal) {
    const cached = typingTickets.get(userId);
    if (cached) return cached;
    const config = await client.getConfig({
      baseUrl,
      token,
      toUserId: userId,
      contextToken,
      signal
    });
    if (config?.typingTicket) {
      if (typingTickets.size > 200) typingTickets = /* @__PURE__ */ new Map();
      typingTickets.set(userId, config.typingTicket);
      return config.typingTicket;
    }
    return null;
  }
  async function typing(userId, contextToken, status, signal) {
    try {
      const ticket = await typingTicket(userId, contextToken, signal);
      if (!ticket) return false;
      await client.sendTyping({
        baseUrl,
        token,
        toUserId: userId,
        typingTicket: ticket,
        status,
        signal
      });
      return true;
    } catch (cause) {
      typingTickets.delete(userId);
      logger.warn?.(`[dsh-chat-weixin] \u53D1\u9001\u8F93\u5165\u72B6\u6001\u5931\u8D25\uFF1A${cause?.message ?? cause}`);
      return false;
    }
  }
  async function reply(userId, text, contextToken, runId, signal) {
    const chunks = splitText(text);
    for (const chunk of chunks) {
      await client.sendText({
        baseUrl,
        token,
        toUserId: userId,
        text: chunk,
        contextToken,
        runId,
        signal
      });
    }
    return chunks.length;
  }
  async function loadAttachments({ media, key, workspacePath, signal }) {
    const parts = [];
    for (const image of media.images) {
      const bytes = await downloadMedia(image.item, { signal, maxBytes: MAX_IMAGE_BYTES, fetchImpl });
      const mediaType = sniffImageMediaType(bytes);
      if (!mediaType) {
        throw new WeixinMediaError("unsupported-image", "\u8FD9\u5F20\u56FE\u7247\u7684\u683C\u5F0F\u6682\u4E0D\u652F\u6301\uFF0C\u8BF7\u53D1 PNG/JPEG/WebP/GIF\u3002");
      }
      parts.push({ type: "image", mediaType, data: bytes.toString("base64"), name: image.name });
      logger.info?.(`[dsh-chat-weixin] \u5DF2\u6536\u5230\u56FE\u7247\uFF1A${mediaType}\uFF08${bytes.length} \u5B57\u8282\uFF0C${account.botId}\uFF09`);
    }
    for (const file of media.files) {
      const bytes = await downloadMedia(file.item, { signal, maxBytes: MAX_FILE_BYTES, fetchImpl });
      const { sessionId } = await deps.sessions.ensure({
        channelId: deps.channelId,
        botId: account.botId,
        key,
        workspacePath
      });
      const uploaded = await deps.sessions.uploadFile({
        sessionId,
        name: file.name,
        bytes: new Uint8Array(bytes),
        signal
      });
      if (!uploaded?.receiptId) throw new Error("\u4E0A\u4F20\u540E\u6CA1\u6709\u62FF\u5230 receiptId");
      parts.push({ type: "file", receiptId: uploaded.receiptId });
      logger.info?.(`[dsh-chat-weixin] \u5DF2\u6536\u5230\u6587\u4EF6\uFF1A${file.name}\uFF08${bytes.length} \u5B57\u8282\uFF0C${account.botId}\uFF09`);
    }
    return parts;
  }
  async function accept(message, signal) {
    try {
      await handleMessage(message, signal);
    } catch (cause) {
      const detail = cause?.message ?? String(cause);
      error = detail;
      logger.error?.(`[dsh-chat-weixin] \u5904\u7406\u5165\u7AD9\u6D88\u606F\u5F02\u5E38\uFF1A${detail}`);
      await state.recordFailure(detail);
      const sender = typeof message?.from_user_id === "string" ? message.from_user_id.trim() : "";
      if (sender) {
        try {
          const token2 = typeof message.context_token === "string" ? message.context_token : state.contextToken(sender);
          await reply(sender, `\u5904\u7406\u5931\u8D25\uFF1A${detail}`, token2, message?.run_id, signal);
        } catch {
        }
      }
    }
  }
  const detachInteractions = deps.interactions?.attach?.({
    channelId: deps.channelId,
    botId: account.botId,
    send: async ({ key, text }) => {
      const userId = (key.startsWith("p2p:") ? key.slice(4) : key).trim();
      if (!userId) throw new TypeError("\u4EA4\u4E92\u56DE\u4F20\u9700\u8981 userId\u3002");
      await reply(userId, String(text ?? ""), state.contextToken(userId));
    }
  });
  const IMAGE_EXTENSIONS = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
  async function sendDeliverables({ userId, files, contextToken, signal }) {
    if (!Array.isArray(files) || files.length === 0) return;
    for (const file of files) {
      const path = typeof file?.path === "string" ? file.path : "";
      if (!path) continue;
      const name2 = path.split("/").pop() || "\u4EA4\u4ED8\u6587\u4EF6";
      try {
        const info = await stat(path);
        if (!info.isFile() || info.size === 0) throw new Error("\u4E0D\u662F\u666E\u901A\u6587\u4EF6\u6216\u5185\u5BB9\u4E3A\u7A7A");
        if (info.size > MAX_FILE_BYTES) {
          throw new Error(`\u8D85\u8FC7 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB \u4E0A\u9650`);
        }
        const ext = name2.slice(name2.lastIndexOf(".")).toLowerCase();
        const bytes = await readFile(path);
        const sent = IMAGE_EXTENSIONS.has(ext) ? await client.sendImage({ baseUrl, token, toUserId: userId, bytes, contextToken, signal }) : await client.sendFile({
          baseUrl,
          token,
          toUserId: userId,
          fileName: name2,
          bytes,
          contextToken,
          signal
        });
        logger.info?.(`[dsh-chat-weixin] \u5DF2\u53D1\u9001\u4EA4\u4ED8\u6587\u4EF6\uFF1A${name2}\uFF08${info.size} \u5B57\u8282\uFF0C${account.botId}\uFF09`);
        void sent;
      } catch (cause) {
        const reason = cause?.message ?? String(cause);
        error = `\u4EA4\u4ED8\u6587\u4EF6 ${name2} \u53D1\u9001\u5931\u8D25\uFF1A${reason}`;
        logger.error?.(`[dsh-chat-weixin] ${error}`);
        await state.recordFailure(error);
        try {
          await reply(userId, `\u4EA4\u4ED8\u6587\u4EF6\u300C${name2}\u300D\u6CA1\u80FD\u53D1\u51FA\u53BB\uFF1A${reason}`, contextToken, void 0, signal);
        } catch {
        }
      }
    }
  }
  deps.deferred?.register?.({
    channelId: deps.channelId,
    botId: account.botId,
    deliver: async ({ key, text }) => {
      const userId = key.startsWith("p2p:") ? key.slice("p2p:".length) : key;
      const contextToken = state.contextToken?.(userId) ?? null;
      if (!contextToken) {
        throw new Error(`\u5FAE\u4FE1\u6CA1\u6709 ${userId} \u7684 context token\uFF0C\u8865\u53D1\u4E0D\u4E86\uFF08\u7B49\u4ED6\u518D\u53D1\u4E00\u6761\u6D88\u606F\u540E\u91CD\u8BD5\uFF09`);
      }
      await reply(userId, `\uFF08\u4E0A\u4E00\u8F6E\u8D85\u65F6\u4E4B\u540E\u8DD1\u5B8C\u4E86\uFF0C\u8865\u53D1\u7ED3\u679C\uFF09

${text}`, contextToken, null, null);
      logger.info?.(`[dsh-chat-weixin] \u5EF6\u8FDF\u4EA4\u4ED8\u5DF2\u8865\u53D1\uFF1A${account.botId} ${key} ${text.length} \u5B57`);
    }
  });
  async function handleMessage(message, signal) {
    if (message?.message_type === 2) return;
    const id = messageId(message);
    const sender = typeof message?.from_user_id === "string" ? message.from_user_id.trim() : "";
    if (!id || !sender) return;
    if (!state.markSeen(id)) return;
    lastMessageAt = (/* @__PURE__ */ new Date()).toISOString();
    await deps.ready?.();
    const record = deps.storage.read(account.botId);
    const access = deps.accessPolicy.evaluateAccess({
      policy: record.accessPolicy,
      conversationType: "direct",
      senderIds: [sender],
      // 属主判定走与飞书同一份规则（`*` 表示没有属主，不授权任何人绕过策略）。
      isOwner: deps.accessPolicy?.isOwnerId?.([account.ownerUserId], sender) === true
    });
    if (!access.allowed) {
      logger.info?.(`[dsh-chat-weixin] \u5FFD\u7565\u672A\u653E\u884C\u7684\u6D88\u606F\uFF1A${account.botId} sender=${sender}\uFF08${access.reason}\uFF09`);
      return;
    }
    const text = extractText(message);
    const media = extractInboundMedia(message);
    const hasMedia = media.images.length > 0 || media.files.length > 0;
    if (!text && !hasMedia) {
      await reply(
        sender,
        "\u76EE\u524D\u652F\u6301\u6587\u672C\u3001\u8BED\u97F3\u8F6C\u5199\u3001\u56FE\u7247\u4E0E\u6587\u4EF6\uFF0C\u5176\u4ED6\u7C7B\u578B\uFF08\u89C6\u9891\u3001\u8868\u60C5\u7B49\uFF09\u6682\u4E0D\u652F\u6301\u3002",
        message.context_token,
        message.run_id,
        signal
      );
      return;
    }
    const inboundToken = typeof message.context_token === "string" ? message.context_token : void 0;
    const runId = typeof message.run_id === "string" ? message.run_id : void 0;
    if (inboundToken) await state.rememberContextToken(sender, inboundToken);
    const contextToken = inboundToken ?? state.contextToken(sender);
    const key = `p2p:${sender}`;
    if (!hasMedia && deps.interactions?.offer?.({
      channelId: deps.channelId,
      botId: account.botId,
      key,
      text
    })) {
      logger.info?.(`[dsh-chat-weixin] \u8BA4\u9886\u4E3A\u4EA4\u4E92\u56DE\u7B54\uFF08${account.botId} ${key}\uFF09`);
      return;
    }
    if (!hasMedia) {
      if (text.startsWith("/")) {
        const commandAccess = deps.accessPolicy.evaluateAccess({
          policy: record.accessPolicy,
          conversationType: "direct",
          senderIds: [sender],
          isCommand: true,
          isOwner: deps.accessPolicy?.isOwnerId?.([account.ownerUserId], sender) === true
        });
        if (!commandAccess.allowed) {
          logger.info?.(`[dsh-chat-weixin] \u547D\u4EE4\u88AB\u62D2\u7EDD\uFF1A${account.botId} sender=${sender}\uFF08${commandAccess.reason}\uFF09`);
          await reply(sender, "\u4F60\u6CA1\u6709\u6267\u884C\u673A\u5668\u4EBA\u547D\u4EE4\u7684\u6743\u9650\u3002", contextToken, runId, signal);
          return;
        }
      }
      const command = await deps.commands?.handle?.({
        text,
        channelId: deps.channelId,
        botId: account.botId,
        key,
        conversationType: "direct",
        senderId: sender,
        // 属主判定只有渠道知道（属主在渠道配置里），带上给命令内核用。
        isOwner: deps.accessPolicy?.isOwnerId?.([account.ownerUserId], sender) === true,
        botLabel: account.botName ?? account.botId,
        channelLabel: "\u5FAE\u4FE1"
      }).catch((cause) => {
        logger.warn?.(`[dsh-chat-weixin] \u547D\u4EE4\u5904\u7406\u5931\u8D25\uFF1A${cause?.message ?? cause}`);
        return null;
      });
      if (command?.handled) {
        if (command.reply) await reply(sender, command.reply, contextToken, runId, signal);
        handled += 1;
        lastHandledAt = (/* @__PURE__ */ new Date()).toISOString();
        return;
      }
    }
    const identity = { senderId: sender, chatId: sender };
    const captured = deps.contextEnhancement.captureContextEnhancementSource(
      { botId: account.botId, channel: "weixin", readConfig: () => record.contextEnhancement },
      "direct",
      identity,
      () => ({ channel: "weixin", ...identity })
    );
    let attachmentParts = [];
    if (hasMedia) {
      await typing(sender, contextToken, 1, signal);
      try {
        attachmentParts = await loadAttachments({
          media,
          key,
          workspacePath: record.workspace,
          signal
        });
      } catch (cause) {
        const reason = cause?.message ?? String(cause);
        error = reason;
        logger.error?.(`[dsh-chat-weixin] \u63A5\u6536\u5A92\u4F53\u5931\u8D25\uFF1A${reason}`);
        await state.recordFailure(reason);
        const label = media.images.length > 0 && media.files.length === 0 ? "\u56FE\u7247" : "\u6587\u4EF6";
        await typing(sender, contextToken, 2, signal);
        await reply(sender, `\u8FD9\u4E2A${label}\u6CA1\u80FD\u6536\u4E0B\uFF1A${reason}`, contextToken, runId, signal);
        return;
      }
    }
    let finalParts;
    if (attachmentParts.length > 0) {
      const base = [...text ? [{ type: "text", text }] : [], ...attachmentParts];
      const enhanced = deps.contextEnhancement.enhanceContent(
        base,
        captured?.snapshot ?? null,
        captured?.source
      );
      finalParts = Array.isArray(enhanced) ? enhanced : base;
    } else {
      finalParts = [{
        type: "text",
        text: deps.contextEnhancement.enhanceContent(
          text,
          captured?.snapshot ?? null,
          captured?.source
        )
      }];
    }
    await typing(sender, contextToken, 1, signal);
    try {
      const result = await deps.sessions.ask({
        channelId: deps.channelId,
        botId: account.botId,
        key,
        workspacePath: record.workspace,
        content: finalParts,
        sourceGuidance: captured?.snapshot?.scope?.guidance,
        // 同一会话已有回合在跑：先回一句"排队中"。
        onQueued: (ahead) => {
          void reply(sender, `\u5DF2\u6392\u961F\uFF08\u524D\u9762\u8FD8\u6709 ${ahead} \u6761\uFF09\uFF0C\u5904\u7406\u5B8C\u4F1A\u4F9D\u6B21\u56DE\u590D\u3002`, contextToken, runId, signal).catch(() => {
          });
        },
        // 会话列表里一眼看出渠道与聊天：微信只有私聊，而且拿不到昵称——用掩码 id 兜底。
        channelLabel: "\u5FAE\u4FE1",
        chatLabel: `\u79C1\u804A ${String(sender ?? "").length > 12 ? `${String(sender).slice(0, 12)}\u2026` : String(sender ?? "")}`.trim(),
        botLabel: account.botName ?? account.botId,
        signal
      });
      const answer = typeof result?.text === "string" && result.text.trim() ? result.text.trim() : result?.reason?.kind && result.reason.kind !== "completed" ? `\u4EFB\u52A1\u672A\u6B63\u5E38\u5B8C\u6210\uFF08${result.reason.kind}\uFF09\u3002` : "\uFF08\u672C\u8F6E\u6CA1\u6709\u6587\u672C\u8F93\u51FA\uFF09";
      await reply(sender, answer, contextToken, runId, signal);
      await sendDeliverables({
        userId: sender,
        files: result?.files,
        contextToken,
        signal
      });
      handled += 1;
      lastHandledAt = (/* @__PURE__ */ new Date()).toISOString();
    } catch (cause) {
      error = cause?.message ?? String(cause);
      logger.error?.(`[dsh-chat-weixin] \u5904\u7406\u6D88\u606F\u5931\u8D25\uFF1A${error}`);
      await state.recordFailure(error);
      try {
        await reply(sender, `\u5904\u7406\u5931\u8D25\uFF1A${error}`, contextToken, runId, signal);
      } catch {
      }
    } finally {
      await typing(sender, contextToken, 2, signal);
    }
  }
  async function runLoop(signal) {
    setPhase("running");
    while (!signal.aborted) {
      let response;
      try {
        response = await client.getUpdates({
          baseUrl,
          token,
          getUpdatesBuf: state.getUpdatesBuf(),
          signal
        });
      } catch (cause) {
        if (signal.aborted) break;
        setPhase("reconnecting", cause?.message ?? String(cause));
        logger.warn?.(`[dsh-chat-weixin] \u957F\u8F6E\u8BE2\u5931\u8D25\uFF0C2s \u540E\u91CD\u8BD5\uFF1A${cause?.message ?? cause}`);
        await new Promise((resolve) => setTimeout(resolve, 2e3));
        continue;
      }
      if (signal.aborted) break;
      const rejection = rejectedResponse(response);
      if (rejection) {
        if (rejection === "-14") {
          setPhase("failed", "\u5FAE\u4FE1\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u9875\u91CD\u65B0\u626B\u7801\u3002");
          logger.error?.("[dsh-chat-weixin] \u4EE4\u724C\u5931\u6548\uFF0C\u505C\u6B62\u957F\u8F6E\u8BE2");
          return;
        }
        logger.warn?.(`[dsh-chat-weixin] \u5FAE\u4FE1\u670D\u52A1\u8FD4\u56DE ${rejection}\uFF0C\u5FFD\u7565\u672C\u8F6E`);
      }
      if (typeof response?.get_updates_buf === "string" && response.get_updates_buf) {
        await state.saveGetUpdatesBuf(response.get_updates_buf).catch(() => void 0);
      }
      for (const message of response?.msgs ?? []) {
        if (signal.aborted) break;
        try {
          await accept(message, signal);
        } catch (cause) {
          logger.error?.(`[dsh-chat-weixin] \u5904\u7406\u5165\u7AD9\u6D88\u606F\u5F02\u5E38\uFF1A${cause?.message ?? cause}`);
        }
      }
    }
    if (!signal.aborted) return;
    setPhase("stopped");
  }
  return {
    botId: account.botId,
    /**
     * 启动：先 notifyStart，再进入长轮询。
     *
     * @param options - { signal }。
     */
    async start({ signal }) {
      setPhase("starting");
      await client.notifyStart({ baseUrl, token, signal });
      loop = runLoop(signal);
      await loop;
    },
    /** 停止：中断长轮询并尽力通知服务端。 */
    async stop(signal) {
      setPhase("stopped");
      detachInteractions?.();
      try {
        await client.notifyStop({ baseUrl, token, signal });
      } catch (cause) {
        logger.warn?.(`[dsh-chat-weixin] \u505C\u6B62\u901A\u77E5\u5931\u8D25\uFF1A${cause?.message ?? cause}`);
      }
    },
    /**
     * 主动发一条文本（定时任务/脚本用）。
     *
     * @param options - { userId, text, signal }。
     */
    async sendProactive({ userId, text, signal }) {
      const recipient = typeof userId === "string" ? userId.trim() : "";
      if (!recipient) throw new TypeError("sendProactive \u9700\u8981 userId\u3002");
      const chunks = await reply(recipient, String(text ?? ""), state.contextToken(recipient), void 0, signal);
      return { chunks };
    },
    /**
     * 主动发一个文件或图片（agent 的 `chat_send_file` 与定时任务用）。
     *
     * 由调用方给"绝对路径 + 显示名 + kind"（hub 的投递层已经校验过存在、非空、不超限），
     * 这里只负责读字节、加密上传、发送。kind 为 image 时走图片气泡，否则走文件消息。
     *
     * @param options - { userId, path, name, kind, signal }。
     * @returns { kind, name, size, providerMessageIds }。
     */
    async sendFileProactive({ userId, path, name: name2, kind, signal }) {
      const recipient = typeof userId === "string" ? userId.trim() : "";
      if (!recipient) throw new TypeError("sendFileProactive \u9700\u8981 userId\u3002");
      if (typeof path !== "string" || !path) throw new TypeError("sendFileProactive \u9700\u8981 path\u3002");
      const bytes = await readFile(path);
      if (bytes.byteLength === 0) throw new Error("\u8981\u53D1\u9001\u7684\u6587\u4EF6\u662F\u7A7A\u7684\u3002");
      const fileName = typeof name2 === "string" && name2.trim() ? name2.trim() : basename(path);
      const contextToken = state.contextToken(recipient);
      const sent = kind === "image" ? await client.sendImage({ baseUrl, token, toUserId: recipient, bytes, contextToken, signal }) : await client.sendFile({
        baseUrl,
        token,
        toUserId: recipient,
        fileName,
        bytes,
        contextToken,
        signal
      });
      logger.info?.(`[dsh-chat-weixin] \u5DF2\u53D1\u9001${kind === "image" ? "\u56FE\u7247" : "\u6587\u4EF6"}\uFF1A${fileName}\uFF08${bytes.byteLength} \u5B57\u8282\uFF0C${account.botId}\uFF09`);
      return { ...sent, kind: kind === "image" ? "image" : "file", name: fileName, size: bytes.byteLength };
    },
    status: () => Object.freeze({
      botId: account.botId,
      phase,
      error,
      handled,
      lastHandledAt,
      lastMessageAt
    }),
    /** 供测试直接投喂一条消息。 */
    accept
  };
}

// packages/dsh-chat-weixin/host/state-store.mjs
var MAX_SEEN = 1e3;
var MAX_CONTEXT_TOKENS = 200;
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function normalizeDocument2(value) {
  const source = isPlainObject(value) ? value : {};
  const sessions = {};
  if (isPlainObject(source.sessions)) {
    for (const [key, sessionId] of Object.entries(source.sessions)) {
      if (typeof sessionId === "string" && sessionId) sessions[key] = sessionId;
    }
  }
  const seenMessageIds = Array.isArray(source.seenMessageIds) ? source.seenMessageIds.filter((id) => typeof id === "string" && id).slice(-MAX_SEEN) : [];
  const contextTokens = {};
  if (isPlainObject(source.contextTokens)) {
    for (const [userId, token] of Object.entries(source.contextTokens).slice(-MAX_CONTEXT_TOKENS)) {
      if (typeof token === "string" && token) contextTokens[userId] = token;
    }
  }
  const lastError = isPlainObject(source.lastError) && typeof source.lastError.message === "string" ? { message: source.lastError.message, at: source.lastError.at ?? null } : null;
  return {
    version: 1,
    sessions,
    seenMessageIds,
    contextTokens,
    lastError,
    getUpdatesBuf: typeof source.getUpdatesBuf === "string" ? source.getUpdatesBuf : ""
  };
}
function createWeixinStateStore({ path, createJsonStore }) {
  if (typeof createJsonStore !== "function") {
    throw new TypeError("\u5FAE\u4FE1\u72B6\u6001\u5B58\u50A8\u9700\u8981 hub \u63D0\u4F9B\u7684 createJsonStore\u3002");
  }
  const store = createJsonStore({
    path,
    normalize: normalizeDocument2,
    empty: () => ({
      version: 1,
      sessions: {},
      seenMessageIds: [],
      contextTokens: {},
      getUpdatesBuf: ""
    }),
    label: "\u5FAE\u4FE1\u8D26\u53F7\u72B6\u6001"
  });
  return {
    path,
    ready: () => store.ready(),
    /** @returns 旧实现的会话绑定（交给 hub 的会话桥 adopt）。 */
    sessions() {
      return Object.freeze({ ...store.snapshot().sessions ?? {} });
    },
    /** @returns 长轮询游标。 */
    getUpdatesBuf() {
      return store.snapshot().getUpdatesBuf ?? "";
    },
    /** 记录长轮询游标（每轮都会变，写入串行且失败不阻塞收消息）。 */
    async saveGetUpdatesBuf(value) {
      if (typeof value !== "string" || value === store.snapshot().getUpdatesBuf) return;
      await store.update((current) => ({ ...current, getUpdatesBuf: value }));
    },
    /** 某个用户最近一次的 context_token（回复时要原样带回）。 */
    contextToken(userId) {
      return store.snapshot().contextTokens?.[userId];
    },
    /** 记录 context_token。 */
    async rememberContextToken(userId, token) {
      if (typeof userId !== "string" || !userId) return;
      if (typeof token !== "string" || !token) return;
      if (store.snapshot().contextTokens?.[userId] === token) return;
      await store.update((current) => {
        const contextTokens = { ...current.contextTokens ?? {} };
        delete contextTokens[userId];
        contextTokens[userId] = token;
        const keys = Object.keys(contextTokens);
        for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_CONTEXT_TOKENS))) {
          delete contextTokens[stale];
        }
        return { ...current, contextTokens };
      });
    },
    /**
     * 去重：第一次见到返回 true。
     *
     * @param id - 平台消息 id。
     */
    markSeen(id) {
      if (typeof id !== "string" || !id) return true;
      const current = store.snapshot();
      if (current.seenMessageIds.includes(id)) return false;
      const seenMessageIds = [...current.seenMessageIds, id].slice(-MAX_SEEN);
      void store.update((doc) => ({ ...doc, seenMessageIds })).catch(() => {
      });
      return true;
    },
    /** 等待已排队的写入落定（停机前调用）。 */
    async flush() {
      await store.flush();
    },
    /**
     * 记下最近一次处理失败。
     *
     * 目的很直接：出问题时**不需要用户去翻终端**——直接读 state.json 就能看到
     * 最后一条错误的原文与时间。
     *
     * @param message - 错误原文。
     */
    async recordFailure(message) {
      const text = typeof message === "string" ? message.slice(0, 500) : String(message).slice(0, 500);
      await store.update((current) => ({
        ...current,
        lastError: { message: text, at: (/* @__PURE__ */ new Date()).toISOString() }
      })).catch(() => void 0);
    }
  };
}

// packages/dsh-chat-weixin/host/controller.mjs
var LOGIN_TTL_MS = 5 * 6e4;
function deriveIdentity(accountId) {
  const raw = typeof accountId === "string" ? accountId.trim() : "";
  if (!raw) throw new TypeError("deriveIdentity \u9700\u8981 accountId\u3002");
  const digest = createHash2("sha256").update(raw).digest("hex").slice(0, 24);
  return { botId: `wx_${digest}`, tokenRef: `DSH_WEIXIN_BOT_TOKEN_${digest.toUpperCase()}` };
}
function maskAccountId(accountId) {
  const raw = typeof accountId === "string" ? accountId : "";
  if (raw.length <= 8) return "****";
  return `${raw.slice(0, 4)}****${raw.slice(-4)}`;
}
function apiBaseFromServer(value, fallback) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return fallback;
    const host = url.hostname.toLowerCase();
    if (!host.endsWith("weixin.qq.com") && !host.endsWith("wechat.com")) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}
async function resolveToken(credentials, ref) {
  if (typeof credentials?.resolve !== "function") {
    throw new Error("\u5F53\u524D Host \u672A\u63D0\u4F9B\u51ED\u636E\u670D\u52A1\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u5FAE\u4FE1\u767B\u5F55\u4EE4\u724C\u3002");
  }
  const resolved = await credentials.resolve(ref);
  if (!resolved?.value) {
    const error = new Error("\u5FAE\u4FE1\u767B\u5F55\u4EE4\u724C\u7F3A\u5931\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u9875\u91CD\u65B0\u626B\u7801\u3002");
    error.code = "weixin/token-missing";
    throw error;
  }
  return resolved.value;
}
function createWeixinController({ deps, logger = console, config = {}, internals = {} }) {
  const dataDir = deps.dataDir;
  if (typeof dataDir !== "string" || !dataDir) throw new TypeError("\u5FAE\u4FE1\u63A7\u5236\u5668\u9700\u8981 deps.dataDir\u3002");
  if (typeof deps.sessions?.ask !== "function" || typeof deps.contextEnhancement?.enhanceContent !== "function") {
    throw new TypeError("\u5FAE\u4FE1\u63A7\u5236\u5668\u9700\u8981 hub \u7684 sessions.ask \u4E0E contextEnhancement\uFF08\u8BF7\u786E\u8BA4 dsh-chat \u5DF2\u52A0\u8F7D\uFF09\u3002");
  }
  if (typeof deps.createJsonStore !== "function") {
    throw new TypeError("\u5FAE\u4FE1\u63A7\u5236\u5668\u9700\u8981 hub \u7684 createJsonStore\u3002");
  }
  const clientFactory = internals.createClient ?? createIlinkClient;
  const configStore = createWeixinConfigStore({
    path: join(dataDir, "config.json"),
    createJsonStore: deps.createJsonStore
  });
  const runtimes = /* @__PURE__ */ new Map();
  const attempts = /* @__PURE__ */ new Map();
  function newClient() {
    return clientFactory({ fetchImpl: internals.fetchImpl });
  }
  async function startAccount(account) {
    const existing = runtimes.get(account.botId);
    if (existing && ["starting", "running", "reconnecting"].includes(existing.phase)) return existing;
    const record = {
      account,
      phase: "starting",
      error: null,
      runtime: null,
      controller: new AbortController()
    };
    runtimes.set(account.botId, record);
    try {
      const token = await resolveToken(deps.credentials, account.tokenRef);
      const client = newClient();
      const state = createWeixinStateStore({
        path: join(dataDir, "accounts", account.botId, "state.json"),
        createJsonStore: deps.createJsonStore
      });
      await state.ready();
      if (deps.sessions?.bindings?.adopt) {
        await deps.sessions.bindings.adopt(deps.channelId, account.botId, state.sessions());
      }
      const runtime = createWeixinRuntime({
        account,
        token,
        deps,
        client,
        state,
        logger
      });
      record.runtime = runtime;
      record.state = state;
      void runtime.start({ signal: record.controller.signal }).catch((error) => {
        record.phase = "failed";
        record.error = error?.code ?? "weixin/runtime-failed";
        record.errorMessage = error?.message ?? String(error);
        logger.error?.(`[dsh-chat-weixin] ${account.botId} \u8FD0\u884C\u5931\u8D25\uFF1A${record.errorMessage}`);
      });
      record.phase = "running";
      record.error = null;
      logger.info?.(`[dsh-chat-weixin] ${account.botName ?? maskAccountId(account.accountId)} \u957F\u8F6E\u8BE2\u5DF2\u542F\u52A8`);
    } catch (error) {
      record.phase = "failed";
      record.error = typeof error?.code === "string" ? error.code : "weixin/start-failed";
      record.errorMessage = error?.message ?? String(error);
      logger.error?.(`[dsh-chat-weixin] ${account.botId} \u542F\u52A8\u5931\u8D25\uFF1A${record.errorMessage}`);
    }
    return record;
  }
  async function stopAccount(botId) {
    const record = runtimes.get(botId);
    if (!record) return;
    record.controller?.abort?.();
    try {
      await record.runtime?.stop?.(record.controller.signal);
    } catch (error) {
      logger.warn?.(`[dsh-chat-weixin] ${botId} \u505C\u6B62\u65F6\u62A5\u9519\uFF1A${error?.message ?? error}`);
    }
    try {
      await record.state?.flush?.();
    } catch {
    }
    record.runtime = null;
    if (record.phase !== "failed") record.phase = "stopped";
  }
  function accountStatus(record) {
    const runtime = record.runtime?.status?.() ?? {};
    return Object.freeze({
      botId: record.account.botId,
      accountIdMasked: maskAccountId(record.account.accountId),
      botName: record.account.botName ?? null,
      // 规范化字段（契约要求）：hub 的机器人列表按这几个键渲染。
      name: record.account.botName ?? null,
      state: runtime.phase ?? record.phase,
      error: record.error ?? null,
      errorMessage: record.errorMessage ?? runtime.error ?? null,
      handled: runtime.handled ?? 0,
      lastHandledAt: runtime.lastHandledAt ?? null,
      lastMessageAt: runtime.lastMessageAt ?? null
    });
  }
  function pruneAttempts() {
    const now = Date.now();
    for (const [id, attempt] of attempts) {
      if (now - attempt.createdAt > LOGIN_TTL_MS) attempts.delete(id);
    }
  }
  async function status() {
    await configStore.ready();
    const accounts = Object.freeze(configStore.list().map((account) => accountStatus(
      runtimes.get(account.botId) ?? { account, phase: "stopped", runtime: null }
    )));
    return Object.freeze({
      channel: deps.channelId,
      dataDir,
      // `bots` 是契约里的规范化名单（hub 的机器人列表按它渲染）；`accounts` 保留给老代码。
      bots: accounts,
      accounts
    });
  }
  async function startAll() {
    await configStore.ready();
    const accounts = configStore.list();
    logger.info?.(`[dsh-chat-weixin] \u53D1\u73B0 ${accounts.length} \u4E2A\u5DF2\u7ED1\u5B9A\u8D26\u53F7`);
    await Promise.all(accounts.map((account) => startAccount(account)));
  }
  function targetFromKey(key) {
    const value = String(key ?? "");
    if (!value.startsWith("p2p:")) return null;
    const userId = value.slice(4);
    if (!userId) return null;
    const short = userId.length > 12 ? `${userId.slice(0, 6)}\u2026${userId.slice(-4)}` : userId;
    return {
      id: value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64),
      name: `\u79C1\u804A \xB7 ${short}`,
      kind: "direct",
      route: { userId }
    };
  }
  const delivery = Object.freeze({
    /** 主动发文本：私聊对端就是 `from_user_id`，回复要带该用户最近一次的 context_token。 */
    async send({ botId, target, text }) {
      const record = runtimes.get(botId);
      if (!record?.runtime || record.phase !== "running") {
        const error = new Error(`\u8D26\u53F7 ${botId} \u5F53\u524D\u4E0D\u5728\u7EBF\uFF0C\u65E0\u6CD5\u6295\u9012\u3002`);
        error.code = "weixin/account-offline";
        throw error;
      }
      const userId = target.route?.userId;
      if (!userId) {
        const error = new Error("\u6295\u9012\u76EE\u6807\u7684 route \u7F3A\u5C11 userId\u3002");
        error.code = "chat/bad-target";
        throw error;
      }
      return record.runtime.sendProactive({ userId, text });
    },
    /**
     * 主动发一个文件或图片（`delivery.sendFile`）。
     *
     * 与文本同一条安全边界：只能发给**已保存**的目标（hub 已校验），这里只确认账号在线、
     * 目标带得上 userId，然后把"路径 + 显示名 + kind"交给运行时去读字节并发送。
     */
    async sendFile({ botId, target, file }) {
      const record = runtimes.get(botId);
      if (!record?.runtime || record.phase !== "running") {
        const error = new Error(`\u8D26\u53F7 ${botId} \u5F53\u524D\u4E0D\u5728\u7EBF\uFF0C\u65E0\u6CD5\u6295\u9012\u3002`);
        error.code = "weixin/account-offline";
        throw error;
      }
      const userId = target.route?.userId;
      if (!userId) {
        const error = new Error("\u6295\u9012\u76EE\u6807\u7684 route \u7F3A\u5C11 userId\u3002");
        error.code = "chat/bad-target";
        throw error;
      }
      return record.runtime.sendFileProactive({
        userId,
        path: file.path,
        name: file.name,
        kind: file.kind
      });
    },
    /** 从该账号的会话记录里发现候选目标。 */
    async discover({ botId }) {
      const record = runtimes.get(botId);
      if (!record?.state) return [];
      return Object.keys(record.state.sessions?.() ?? {}).map((key) => targetFromKey(key)).filter(Boolean);
    },
    /** 把 hub 持久会话绑定表里的会话键翻成目标（重启后仍有候选）。 */
    targetFromKey
  });
  return Object.freeze({
    start: startAll,
    delivery,
    async stop() {
      await Promise.all([...runtimes.keys()].map((botId) => stopAccount(botId)));
    },
    status,
    endpoints: Object.freeze({
      "connection.status": async () => ({ ok: true, value: await status() }),
      /** 申请登录二维码。 */
      "login.begin": async () => {
        try {
          const client = newClient();
          const known = configStore.list().map((account) => account.accountId);
          const { qrcode, qrcodeUrl } = await client.beginLogin({ localTokens: known });
          pruneAttempts();
          const attemptId = randomUUID2();
          attempts.set(attemptId, {
            qrcode,
            createdAt: Date.now(),
            baseUrl: config.connectBaseUrl
          });
          return { ok: true, value: { attemptId, qrcodeUrl, expiresInMs: LOGIN_TTL_MS } };
        } catch (error) {
          return {
            ok: false,
            error: {
              code: error?.code ?? "weixin/qr-failed",
              message: error?.message ?? "\u7533\u8BF7\u4E8C\u7EF4\u7801\u5931\u8D25\u3002",
              details: {}
            }
          };
        }
      },
      /**
       * 轮询扫码状态；确认后落盘账号并启动长轮询。
       *
       * @param payload - { attemptId, verifyCode? }。
       */
      "login.poll": async (payload) => {
        const attempt = attempts.get(payload?.attemptId);
        if (!attempt) {
          return {
            ok: false,
            error: { code: "weixin/unknown-attempt", message: "\u767B\u5F55\u5C1D\u8BD5\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u4E8C\u7EF4\u7801\u3002", details: {} }
          };
        }
        try {
          const client = newClient();
          const response = await client.pollLogin({
            qrcode: attempt.qrcode,
            baseUrl: attempt.baseUrl,
            verifyCode: payload?.verifyCode
          });
          const statusValue = response.status;
          if (statusValue === "scaned_but_redirect") {
            attempt.baseUrl = apiBaseFromServer(response.redirect_host, attempt.baseUrl);
          }
          if (statusValue !== "confirmed") {
            if (statusValue === "expired" || statusValue === "verify_code_blocked") {
              attempts.delete(payload.attemptId);
            }
            return { ok: true, value: { status: statusValue } };
          }
          const accountId = typeof response.ilink_bot_id === "string" ? response.ilink_bot_id.trim() : "";
          const ownerUserId = typeof response.ilink_user_id === "string" ? response.ilink_user_id.trim() : "";
          const token = typeof response.bot_token === "string" ? response.bot_token.trim() : "";
          if (!accountId || !ownerUserId || !token) {
            return {
              ok: false,
              error: { code: "weixin/incomplete-login", message: "\u5FAE\u4FE1\u6388\u6743\u6210\u529F\u4F46\u8FD4\u56DE\u7684\u51ED\u636E\u4E0D\u5B8C\u6574\u3002", details: {} }
            };
          }
          const identity = deriveIdentity(accountId);
          await deps.credentials.set(identity.tokenRef, token);
          const account = await configStore.saveAccount({
            ...identity,
            accountId,
            ownerUserId,
            baseUrl: apiBaseFromServer(response.baseurl, attempt.baseUrl),
            botName: typeof response.nickname === "string" ? response.nickname : null,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            connectedAt: (/* @__PURE__ */ new Date()).toISOString()
          });
          attempts.delete(payload.attemptId);
          await startAccount(account);
          return { ok: true, value: { status: "connected", botId: account.botId } };
        } catch (error) {
          return {
            ok: false,
            error: {
              code: error?.code ?? "weixin/login-poll-failed",
              message: error?.message ?? "\u67E5\u8BE2\u626B\u7801\u72B6\u6001\u5931\u8D25\u3002",
              details: {}
            }
          };
        }
      },
      /** 取消扫码。 */
      "login.cancel": async (payload) => {
        const existed = attempts.delete(payload?.attemptId);
        return { ok: true, value: { cancelled: existed } };
      },
      /** 重连某个账号。 */
      "account.reconnect": async (payload) => {
        if (typeof payload?.botId !== "string" || !payload.botId) {
          return { ok: false, error: { code: "chat/bad-request", message: "\u9700\u8981 botId\u3002", details: {} } };
        }
        await configStore.ready();
        const account = configStore.get(payload.botId);
        if (!account) {
          return {
            ok: false,
            error: { code: "weixin/unknown-account", message: `\u672A\u627E\u5230\u8D26\u53F7 ${payload.botId}\u3002`, details: {} }
          };
        }
        await stopAccount(account.botId);
        const record = await startAccount(account);
        return { ok: true, value: accountStatus(record) };
      },
      /** 移除账号（配置与运行态；凭据一并清除）。 */
      "account.delete": async (payload) => {
        if (typeof payload?.botId !== "string" || payload.confirm !== true) {
          return {
            ok: false,
            error: { code: "chat/bad-request", message: "\u5220\u9664\u9700\u8981 botId \u4E0E confirm=true\u3002", details: {} }
          };
        }
        await configStore.ready();
        const account = configStore.get(payload.botId);
        await stopAccount(payload.botId);
        runtimes.delete(payload.botId);
        if (account) {
          await configStore.removeAccount(payload.botId);
          try {
            await deps.credentials.unset(account.tokenRef);
          } catch (error) {
            logger.warn?.(`[dsh-chat-weixin] \u6E05\u9664\u51ED\u636E\u5931\u8D25\uFF1A${error?.message ?? error}`);
          }
        }
        return { ok: true, value: { removed: Boolean(account) } };
      }
    })
  });
}

// packages/dsh-chat-weixin/host/index.mjs
var CHANNEL_VERSION = "0.0.1";
var name = "dsh-chat-weixin-host";
var inject = ["dshChat"];
var EXPECTED_CONTRACT = 1;
var CHANNEL_ID = "weixin";
function apply(ctx) {
  const service = ctx.dshChat;
  const actual = service?.contractVersion;
  if (actual !== EXPECTED_CONTRACT) {
    throw new Error(
      `dsh-chat-weixin \u9700\u8981 dsh-chat \u5951\u7EA6 v${EXPECTED_CONTRACT}\uFF0C\u5F53\u524D hub \u63D0\u4F9B v${String(actual)}\uFF1B\u8BF7\u5347\u7EA7 dsh-chat \u6216\u5B89\u88C5\u5339\u914D\u7248\u672C\u7684\u6E20\u9053\u63D2\u4EF6\uFF08\u89C1 CONTRACT.md\uFF09\u3002`
    );
  }
  ctx.effect(() => service.registerChannel({
    id: CHANNEL_ID,
    label: "\u5FAE\u4FE1",
    version: CHANNEL_VERSION,
    order: 10,
    legacy: { dir: "dsh-weixin" },
    async createChannel(deps) {
      const controller = createWeixinController({ deps, logger: deps.logger });
      void controller.start().catch((error) => {
        deps.reportStatus("failed", error);
        deps.logger.error?.(`[dsh-chat-weixin] \u542F\u52A8\u5931\u8D25\uFF1A${error?.message ?? error}`);
      });
      return {
        async stop() {
          await controller.stop();
        },
        endpoints: controller.endpoints,
        // hub 用它把"主动投递"接到该渠道上。
        delivery: controller.delivery
      };
    }
  }), "dsh-chat-weixin: \u6CE8\u518C\u6E20\u9053");
}
export {
  apply,
  inject,
  name
};
