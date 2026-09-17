/**
 * hub 的 RPC 载体：把每个渠道挂到 `/api/dsh-chat/<channelId>`，
 * hub 自身的控制端点挂在 `/api/dsh-chat/control`。
 *
 * 线路格式与 DSH Connection 的客户端 RPC 载体一致（浏览器侧用
 * `connection.rpc.call('/api', 'dsh-chat/<channelId>', { method, payload })`）：
 *
 *   请求  { type:'client-request', rpcId, method:'dsh-chat/<channelId>', payload:{ method, payload } }
 *   响应  { type:'server-response', rpcId, result: { ok:true, value } | { ok:false, error } }
 *
 * @module dsh-chat/host/rpc
 */

import { RPC_PREFIX } from '../shared/contract.mjs';

/**
 * @param channelId - 渠道 id（或控制端点 id）。
 * @returns 浏览器侧端点名，如 `dsh-chat/feishu`。
 */
export function rpcEndpoint(channelId) {
  return `${RPC_PREFIX}/${channelId}`;
}

/**
 * @param channelId - 渠道 id。
 * @returns host 侧精确路由路径，如 `/api/dsh-chat/feishu`。
 */
export function rpcPath(channelId) {
  return `/api/${rpcEndpoint(channelId)}`;
}

/**
 * 成功结果。
 *
 * @param value - 可 JSON 序列化的返回值。
 * @returns 结果对象。
 */
export function ok(value) {
  return { ok: true, value };
}

/**
 * 失败结果。
 *
 * @param code - 稳定错误码。
 * @param message - 面向用户的中文说明。
 * @param details - 附加信息（不得含凭据）。
 * @returns 结果对象。
 */
export function fail(code, message, details = {}) {
  return { ok: false, error: { code, message, details } };
}

/** 把任意异常折成失败结果。 */
export function failFrom(error, fallbackCode = 'chat/internal') {
  const code = typeof error?.code === 'string' ? error.code : fallbackCode;
  const message = typeof error?.message === 'string' && error.message
    ? error.message
    : '聊天插件内部错误。';
  return fail(code, message);
}

function jsonResponse(rpcId, result) {
  // 旧端点可能省略 details，客户端要求该字段存在。
  const value = result?.ok === false
    ? { ...result, error: { ...result.error, details: result.error?.details ?? {} } }
    : result;
  return Response.json({ type: 'server-response', rpcId, result: value });
}

/**
 * 创建 RPC 载体。
 *
 * @param ctx - host 插件上下文（需要 connection.fetch.register）。
 * @param options - { logger }。
 * @returns { register, registered, disposeAll }。
 */
export function createRpcCarrier(ctx, { logger = console } = {}) {
  if (typeof ctx?.connection?.fetch?.register !== 'function') {
    throw new TypeError('dsh-chat 需要 DSH 的 connection.fetch 注册表。');
  }
  const releases = new Map();

  function register(channelId, handler) {
    const path = rpcPath(channelId);
    const endpoint = rpcEndpoint(channelId);
    if (releases.has(path)) throw new Error(`RPC 路径 ${path} 已被注册。`);
    if (typeof handler !== 'function') throw new TypeError('RPC handler 必须是函数。');

    const dispose = ctx.connection.fetch.register({
      path,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        // DSH 已在本处理器之前完成浏览器鉴权与 Host/Origin 信任校验。
        if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
        const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
        if (contentType !== 'application/json') {
          return new Response('content type must be application/json', { status: 415 });
        }
        let message;
        try {
          message = await request.json();
        } catch {
          return new Response('body is not JSON', { status: 400 });
        }
        const rpcId = typeof message?.rpcId === 'string' ? message.rpcId : 'invalid-request';
        const call = message?.payload;
        if (message?.type !== 'client-request' || typeof message.rpcId !== 'string'
          || message.method !== endpoint || call === null || typeof call !== 'object'
          || Array.isArray(call) || typeof call.method !== 'string'
          || !Object.hasOwn(call, 'payload')) {
          return jsonResponse(rpcId, fail('chat/bad-request', '无效的聊天插件管理请求。'));
        }
        try {
          return jsonResponse(rpcId, await handler(call.method, call.payload, request.signal));
        } catch (error) {
          logger.warn?.(`[dsh-chat] ${endpoint} 处理 ${call.method} 失败：${error?.message ?? error}`);
          return jsonResponse(rpcId, failFrom(error));
        }
      },
    });

    const release = () => {
      if (!releases.delete(path)) return;
      try {
        dispose?.();
      } catch {
        // 已经释放过就算了。
      }
    };
    releases.set(path, release);
    return release;
  }

  return {
    register,
    /** @returns 已注册的路径数。 */
    get registered() {
      return releases.size;
    },
    /** 释放全部路由（插件卸载时）。 */
    disposeAll() {
      for (const release of [...releases.values()]) release();
    },
  };
}
