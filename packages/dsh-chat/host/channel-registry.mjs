/**
 * 渠道注册表（host 侧）：渠道包提交定义，hub 负责创建实例、挂 RPC、跟踪状态。
 *
 * 生命周期要点：
 * - `register()` 同步返回注销函数（Cordis `ctx.effect` 需要同步 disposer），
 *   实例创建与启动在后台进行，失败记入状态而不是抛出；
 * - RPC 路由在实例就绪前就已挂上，因此设置页在"启动中/启动失败"时也能读到状态；
 * - 注销后先摘路由、再停实例，重复注销是幂等的。
 *
 * @module dsh-chat/host/channel-registry
 */

import { channelLabel, validateChannelDefinition } from '../shared/contract.mjs';
import { fail } from './rpc.mjs';

const STATUSES = new Set(['starting', 'running', 'failed', 'stopped']);

function describeError(error) {
  if (!error) return null;
  return Object.freeze({
    code: typeof error.code === 'string' ? error.code : 'chat/channel-error',
    message: typeof error.message === 'string' && error.message ? error.message : String(error),
  });
}

/**
 * 创建渠道注册表。
 *
 * @param options - { logger, rpc, createDeps, onRegistered }。
 *   `createDeps(channelId, definition)` 返回交给渠道 `createChannel(deps)` 的依赖包；
 *   `onRegistered(channelId, legacy)` 在定义通过校验后同步调用一次（用于旧设置导入），
 *   其异常不会影响渠道注册。
 * @returns { register, list, get, subscribe, handleRpc, disposeAll }。
 */
export function createChannelRegistry({
  logger = console,
  rpc,
  createDeps,
  onRegistered,
}) {
  if (typeof rpc?.register !== 'function') throw new TypeError('渠道注册表需要 rpc 载体。');
  if (typeof createDeps !== 'function') throw new TypeError('渠道注册表需要 createDeps。');

  /** @type {Map<string, object>} */
  const channels = new Map();
  const listeners = new Set();
  let snapshot = Object.freeze([]);

  function publish() {
    snapshot = Object.freeze([...channels.values()].map((record) => Object.freeze({
      id: record.definition.id,
      label: channelLabel(record.definition),
      order: record.definition.order,
      status: record.status,
      error: record.error,
      startedAt: record.startedAt,
    })).sort((left, right) => (
      left.order === right.order ? left.id.localeCompare(right.id) : left.order - right.order
    )));
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // 单个订阅者出错不影响其他订阅者。
      }
    }
  }

  function setStatus(record, status, error = null) {
    if (!STATUSES.has(status)) throw new TypeError(`未知渠道状态：${status}`);
    record.status = status;
    record.error = describeError(error);
    publish();
  }

  async function start(record) {
    const { definition } = record;
    try {
      const instance = await definition.createChannel(record.deps);
      if (record.disposed) {
        await instance?.stop?.();
        return;
      }
      if (instance === null || typeof instance !== 'object') {
        throw new TypeError(`渠道 ${definition.id} 的 createChannel 必须返回实例对象。`);
      }
      if (instance.endpoints !== undefined && (typeof instance.endpoints !== 'object'
        || instance.endpoints === null || Array.isArray(instance.endpoints))) {
        throw new TypeError(`渠道 ${definition.id} 的 endpoints 必须是方法表。`);
      }
      record.instance = instance;
      await instance.start?.();
      if (record.disposed) {
        await instance.stop?.();
        return;
      }
      if (record.status === 'starting') setStatus(record, 'running');
    } catch (error) {
      setStatus(record, 'failed', error);
      logger.error?.(`[dsh-chat] 渠道 ${definition.id} 启动失败：${error?.message ?? error}`);
    }
  }

  async function stop(record) {
    record.disposed = true;
    record.releaseRoutes?.();
    record.releaseRoutes = null;
    try {
      await record.instance?.stop?.();
    } catch (error) {
      logger.warn?.(`[dsh-chat] 渠道 ${record.definition.id} 停止时报错：${error?.message ?? error}`);
    }
    record.instance = null;
    record.status = 'stopped';
  }

  /**
   * 注册一个渠道。
   *
   * @param definition - 渠道定义（见 CONTRACT.md）。
   * @returns 同步注销函数。
   */
  function register(definition) {
    const validated = validateChannelDefinition(definition);
    if (channels.has(validated.id)) {
      throw new Error(`渠道 ${validated.id} 已注册，不能重复注册。`);
    }
    const record = {
      definition: validated,
      deps: null,
      instance: null,
      status: 'starting',
      error: null,
      startedAt: new Date().toISOString(),
      disposed: false,
      releaseRoutes: null,
    };
    record.deps = Object.freeze({
      ...createDeps(validated.id, validated),
      reportStatus: (status, error) => {
        if (record.disposed) return;
        setStatus(record, status, error);
      },
    });
    channels.set(validated.id, record);
    // 旧设置导入等"注册后动作"不能影响渠道本身。
    if (typeof onRegistered === 'function') {
      try {
        onRegistered(validated.id, validated.legacy);
      } catch (error) {
        logger.warn?.(`[dsh-chat] 渠道 ${validated.id} 注册后动作失败：${error?.message ?? error}`);
      }
    }
    // 路由先挂上：状态页在渠道启动完成前就能读到 starting / failed。
    record.releaseRoutes = rpc.register(validated.id, (method, payload, signal) => (
      handleRpc(validated.id, method, payload, signal)
    ));
    publish();
    void start(record);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (!channels.delete(validated.id)) return;
      void stop(record);
      publish();
    };
  }

  /** @returns 渠道状态快照（按 order 排序）。 */
  function list() {
    return snapshot;
  }

  /**
   * @param id - 渠道 id。
   * @returns 渠道状态记录，未注册时为 undefined。
   */
  function get(id) {
    return snapshot.find((entry) => entry.id === id);
  }

  /**
   * 订阅渠道状态变化。
   *
   * @param listener - 无参回调。
   * @returns 取消订阅函数。
   */
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /**
   * 把一次 RPC 调用分派给渠道实例的 endpoints。
   *
   * @param channelId - 渠道 id。
   * @param method - 渠道自定义方法名。
   * @param payload - 载荷。
   * @param signal - AbortSignal。
   * @returns RPC 结果对象。
   */
  async function handleRpc(channelId, method, payload, signal) {
    const record = channels.get(channelId);
    if (!record) return fail('chat/unknown-channel', `渠道 ${channelId} 未安装。`);
    if (record.status === 'failed') {
      return fail('chat/channel-failed', record.error?.message ?? `渠道 ${channelId} 启动失败。`,
        record.error?.code ? { channelCode: record.error.code } : {});
    }
    const endpoint = record.instance?.endpoints?.[method];
    if (typeof endpoint !== 'function') {
      return fail('chat/unknown-method', `渠道 ${channelId} 不支持 ${method}。`);
    }
    return endpoint(payload, { signal, channelId });
  }

  /** 注销全部渠道（插件卸载时）。 */
  function disposeAll() {
    for (const [id, record] of [...channels.entries()]) {
      channels.delete(id);
      void stop(record);
    }
    publish();
  }

  return { register, list, get, subscribe, handleRpc, disposeAll };
}
