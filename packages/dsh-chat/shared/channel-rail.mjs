/**
 * 渠道 rail（client 侧）：已安装渠道插件的元数据注册表。
 *
 * 框架无关的纯实现，便于 node 测试直接驱动。UI 用 `useSyncExternalStore` 订阅，
 * 因此渠道包晚于 hub 加载、或运行中被卸载时左栏都能实时反映。
 *
 * @module dsh-chat/shared/channel-rail
 */

import { CHANNEL_ID_PATTERN } from './contract.mjs';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 创建一个渠道元数据注册表。
 *
 * @returns 注册表：register / entries / get / subscribe / getSnapshot / size。
 */
export function createChannelRail() {
  /** @type {Map<string, object>} */
  const byId = new Map();
  const listeners = new Set();
  let snapshot = Object.freeze([]);

  function refresh() {
    snapshot = Object.freeze(
      [...byId.values()].sort((left, right) => (
        left.order === right.order ? left.id.localeCompare(right.id) : left.order - right.order
      )),
    );
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // 一个订阅者出错不能影响其他订阅者。
      }
    }
  }

  return {
    /**
     * 注册一个渠道的显示元数据。
     *
     * @param definition - { id, order, label, logo, sessionBadge, capabilities }。
     *   `sessionBadge` = `{ text, color }`：侧边栏会话行里显示的渠道徽标
     *   （没有会话行插槽，只能靠 hub 的 DOM 增强渲染，见 client/session-badges.js）。
     * @returns 注销函数。
     */
    register(definition) {
      if (!isPlainObject(definition)) throw new TypeError('chatChannels.register 需要一份渠道元数据对象。');
      const { id, order, label, logo, sessionBadge, capabilities } = definition;
      if (typeof id !== 'string' || !CHANNEL_ID_PATTERN.test(id)) {
        throw new TypeError('渠道 id 必须是 2–32 位小写字母/数字/连字符，且以字母开头。');
      }
      if (typeof label !== 'string' && typeof label !== 'function') {
        throw new TypeError('渠道 label 必须是字符串或返回字符串的函数。');
      }
      if (!Number.isFinite(order)) throw new TypeError('渠道 order 必须是有限数字。');
      if (capabilities !== undefined && !isPlainObject(capabilities)) {
        throw new TypeError('渠道 capabilities 必须是对象。');
      }
      if (sessionBadge !== undefined) {
        if (!isPlainObject(sessionBadge) || typeof sessionBadge.text !== 'string' || !sessionBadge.text) {
          throw new TypeError('渠道 sessionBadge 需要 { text, color? }。');
        }
      }
      if (byId.has(id)) throw new Error(`渠道 ${id} 已注册，不能重复注册。`);
      const entry = Object.freeze({
        id,
        order,
        label: typeof label === 'function' ? label : () => label,
        logo: logo ?? null,
        sessionBadge: sessionBadge === undefined
          ? null
          : Object.freeze({ text: sessionBadge.text, color: sessionBadge.color ?? null }),
        capabilities: Object.freeze({ ...(capabilities ?? {}) }),
      });
      byId.set(id, entry);
      refresh();
      return () => {
        // 只注销本次注册写入的那一条：卸载后又被重新注册的同名渠道不能被误删。
        if (byId.get(id) !== entry) return;
        byId.delete(id);
        refresh();
      };
    },

    /** @returns 当前渠道列表（按 order 排序的冻结数组）。 */
    entries() {
      return snapshot;
    },

    /** @returns 快照，供 useSyncExternalStore 使用。 */
    getSnapshot() {
      return snapshot;
    },

    /**
     * 订阅渠道列表变化。
     *
     * @param listener - 无参回调。
     * @returns 取消订阅函数。
     */
    subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('chatChannels.subscribe 需要函数。');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * @param id - 渠道 id。
     * @returns 该渠道的元数据，未注册时为 undefined。
     */
    get(id) {
      return byId.get(id);
    },

    /** @returns 已注册渠道数量。 */
    get size() {
      return byId.size;
    },
  };
}
