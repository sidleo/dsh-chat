/**
 * 界面列表顺序（左栏聊天软件、机器人列表）：纯显示偏好，存**浏览器** localStorage。
 *
 * 为什么不放 hub 的数据目录：它只影响"这台浏览器上怎么排"，不影响机器人的任何行为；
 * 放浏览器里改完刷新即生效（不必重启 dsh），也不必为它加一套 RPC 与磁盘文档。
 * 代价写在明处：换浏览器/换设备要重排一次；清掉站点数据会回到默认顺序。
 *
 * 未知键（新装的渠道、新加的机器人）排在**已排序的那些之后**，并保持它们之间的原有顺序
 * ——默认顺序仍然由渠道注册的 `order` 与机器人的自然顺序决定。
 *
 * @module dsh-chat/client/list-order
 */

import * as React from 'react';

const PREFIX = 'dsh-chat:order:';

/** 渠道左栏的顺序键。 */
export const CHANNEL_ORDER_KEY = `${PREFIX}channels`;

/** 某个渠道下机器人列表的顺序键（每渠道一份）。 */
export function botOrderKey(channelId) {
  return `${PREFIX}bots:${channelId}`;
}

/** 安全拿一次 localStorage：无（Node/SSR）或抛异常（隐私模式）都当没有。 */
function storageOf(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * 读一份顺序。
 *
 * @param key - localStorage 键。
 * @param storage - 可注入的 storage（测试用）。
 * @returns 键数组；读不到/坏数据一律空数组（= 用默认顺序）。
 */
export function readOrder(key, storage = null) {
  const store = storageOf(storage);
  if (!store || typeof store.getItem !== 'function') return [];
  try {
    const raw = store.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string' && item) : [];
  } catch {
    // 坏数据不能让列表渲染不出来：当作"没排过"。
    return [];
  }
}

/**
 * 写一份顺序（写失败就算了：这只影响显示顺序，不该弹错误）。
 *
 * @param key - localStorage 键。
 * @param keys - 完整顺序。
 * @param storage - 可注入的 storage（测试用）。
 * @returns 是否写成功。
 */
export function writeOrder(key, keys, storage = null) {
  const store = storageOf(storage);
  if (!store || typeof store.setItem !== 'function') return false;
  try {
    store.setItem(key, JSON.stringify([...keys]));
    return true;
  } catch {
    return false;
  }
}

/**
 * 按已保存的顺序排列一批条目。
 *
 * 稳定排序：没记录过的条目保持各自原有相对顺序，排在已记录的那些之后。
 *
 * @param items - 待排列的条目。
 * @param order - 已保存的键顺序。
 * @param keyOf - 取键的函数。
 * @returns 新数组（不修改入参）。
 */
export function orderedItems(items, order, keyOf) {
  const list = Array.isArray(items) ? items : [];
  if (!Array.isArray(order) || order.length === 0) return [...list];
  const rank = new Map();
  order.forEach((key, index) => rank.set(key, index));
  return [...list].sort((left, right) => {
    const a = rank.has(keyOf(left)) ? rank.get(keyOf(left)) : Number.MAX_SAFE_INTEGER;
    const b = rank.has(keyOf(right)) ? rank.get(keyOf(right)) : Number.MAX_SAFE_INTEGER;
    return a - b;
  });
}

/**
 * 把 `fromKey` 挪到 `toKey` 原来的位置。
 *
 * @param keys - 当前顺序（应包含这两个键）。
 * @param fromKey - 被拖动的键。
 * @param toKey - 落点键。
 * @returns 新顺序；参数不合法时原样返回（不产生"半截顺序"）。
 */
export function moveKey(keys, fromKey, toKey) {
  const list = Array.isArray(keys) ? [...keys] : [];
  const from = list.indexOf(fromKey);
  const to = list.indexOf(toKey);
  if (from < 0 || to < 0 || from === to) return list;
  list.splice(from, 1);
  list.splice(to, 0, fromKey);
  return list;
}

/**
 * 某个列表的排序状态（读一次、拖动时写回）。
 *
 * @param key - localStorage 键（用 `CHANNEL_ORDER_KEY` / `botOrderKey(id)`）。
 * @param keyOf - 取键的函数（用于把当前渲染顺序换算成"完整键序列"）。
 * @returns `{ order, ordered, move, reset }`。
 */
export function useListOrder(key, keyOf) {
  const [order, setOrder] = React.useState(() => readOrder(key));
  // 换渠道（机器人列表的键变了）要重新读一份，否则会把上一个渠道的顺序套上来。
  React.useEffect(() => {
    setOrder(readOrder(key));
  }, [key]);

  const move = React.useCallback((items, fromKey, toKey) => {
    const current = (Array.isArray(items) ? items : []).map(keyOf);
    const next = moveKey(current, fromKey, toKey);
    setOrder(next);
    writeOrder(key, next);
    return next;
  }, [key, keyOf]);

  const reset = React.useCallback(() => {
    setOrder([]);
    writeOrder(key, []);
  }, [key]);

  return { order, move, reset };
}
