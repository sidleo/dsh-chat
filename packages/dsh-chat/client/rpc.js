/**
 * 浏览器侧 RPC 调用：所有渠道共用同一条 `/api/dsh-chat/<channelId>` 通道，
 * 控制端点固定为 `control`。与 host 的 rpc.mjs 共享同一份线路格式。
 *
 * @module dsh-chat/client/rpc
 */

import { CONTROL_CHANNEL_ID, RPC_PREFIX } from '../shared/contract.mjs';

/**
 * @param channelId - 渠道 id（控制端点用 CONTROL_CHANNEL_ID）。
 * @returns 端点名，如 `dsh-chat/feishu`。
 */
export function chatEndpoint(channelId) {
  return `${RPC_PREFIX}/${channelId}`;
}

/**
 * 调用一次聊天插件 RPC。
 *
 * @param connection - DSH client 的 connection 服务。
 * @param channelId - 渠道 id 或 'control'。
 * @param method - 方法名。
 * @param payload - 载荷。
 * @param signal - AbortSignal。
 * @returns RPC 结果对象 `{ ok, value }` 或 `{ ok:false, error }`。
 */
export function callChatRpc(connection, channelId, method, payload = {}, signal) {
  if (typeof connection?.rpc?.call !== 'function') {
    throw new TypeError('当前页面缺少 DSH Connection RPC 能力。');
  }
  return connection.rpc.call('/api', chatEndpoint(channelId), { method, payload }, signal);
}

/** 便捷封装：只调用 hub 控制端点。 */
export function callControlRpc(connection, method, payload, signal) {
  return callChatRpc(connection, CONTROL_CHANNEL_ID, method, payload, signal);
}

/**
 * 把 `{ ok:false, error }` 结果转成异常，便于在 UI 的 try/catch 里统一处理。
 *
 * @param result - RPC 结果。
 * @returns 成功时的 value。
 */
export function unwrapRpc(result) {
  if (result?.ok === true) return result.value;
  const error = new Error(result?.error?.message ?? '聊天插件调用失败。');
  error.code = result?.error?.code ?? 'chat/rpc-failed';
  error.details = result?.error?.details ?? {};
  throw error;
}
