/**
 * **全局层 + 场合覆盖**：把"私聊/群聊各自一份"升级成"默认继承全局，需要时可以单独覆盖"。
 *
 * 为什么要有它：现有 4 个设置项（访问策略 / 任务过程展示 / 控制面板显示项 / 上下文增强）
 * 都是 `{ direct, group }` 两份平级的配置，用户改一处就得改第二处——
 * "我想让群聊照私聊那样"没法表达，只能两边各配一遍、还容易配歪。
 * 界面上的直接后果是：每个设置项都得问一遍"你改的是私聊还是群聊"。
 *
 * 现在的语义（与 `lark-identity.mjs` 已经在用的那套一致，不另发明语言）：
 * - `global`：必填的一层，没单独设置时大家都用它；
 * - `direct` / `group`：可为 `null` = **继承全局**，或一份自己的值 = **覆盖全局**。
 *
 * ⚠️ **向后兼容是硬要求**：老数据是 `{ direct, group }`（两份都有值）。
 * 迁移策略是**尽量保留用户现有差异**（用户已选的选项）：
 * - 两份**完全一样** → 提成 `global`，两处都设成"继承"（用户看到的就是"以后改一次就都变"，
 *   与他的实际配置行为一致）；
 * - 两份**不一样** → 取**更保守的那一份**当 `global`（访问策略：`allowlist` 比 `open` 保守；
 *   其它项用该设置自己的 `pickGlobal` 决定），再把两份**原样保留为覆盖**。
 *   这样任何一个人的实际判定结果都不会变——迁移**只改变"以后怎么改"，不改变"现在是什么"**。
 *
 * 这里只提供纯函数（归一化 / 迁移 / 取值 / 写回）。运行期读值一律走 `resolveScope()`，
 * 保证 host 与设置页对"这一层到底生效了什么"的答案只有一个。
 *
 * @module dsh-chat/shared/scoped-config
 */

/** 三个层的固定顺序（全局在前：它是默认值的来源）。 */
export const LAYER_KEYS = Object.freeze(['global', 'direct', 'group']);

/** 可以"继承全局"的层（global 自己不能继承自己）。 */
export const OVERRIDE_KEYS = Object.freeze(['direct', 'group']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 两个覆盖层是否"完全一样"（用于迁移时判断能不能提成 global）。
 *
 * 用 JSON 比较而不是逐字段：这些配置都是纯数据（对象/数组/布尔/字符串），
 * 且来源是同一份 normalize 输出，键序稳定。**比不过就当作"不一样"**（保守，
 * 那样会保留两份覆盖，行为不会变）。
 *
 * @param left - 任意值。
 * @param right - 任意值。
 * @returns 布尔。
 */
export function sameLayer(left, right) {
  if (left === right) return true;
  if (left === null || right === null) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/**
 * 把 `{ direct, group }` 的**老数据**迁成 `{ global, direct, group }`。
 *
 * @param input - 老形态（或已经是新形态）。
 * @param options - {
 *   keys?: 覆盖层键（默认 `['direct','group']`）,
 *   normalizeLayer: (raw) => 归一化后的一层（必填；决定"什么算合法一层"）,
 *   defaultLayer: () => 全新安装时的默认层（必填）,
 *   pickGlobal: (a, b) => 两份不同时选谁当 global（必填；调用方按"更保守"实现）,
 *   isNewShape: (raw) => 是否已经是新形态（可选；默认看有没有 global 键）,
 * }。
 * @returns `{ global, direct, group }`（覆盖层为 null 表示继承）。
 */
export function migrateToLayered(input, options) {
  const {
    keys = OVERRIDE_KEYS,
    normalizeLayer,
    defaultLayer,
    pickGlobal,
    isNewShape = (raw) => isPlainObject(raw) && Object.hasOwn(raw, 'global'),
  } = options;
  const source = isPlainObject(input) ? input : {};

  // 已经是新形态：只做归一化（覆盖层为 null 就是继承）。
  if (isNewShape(source)) {
    const global = normalizeLayer(source.global ?? defaultLayer());
    const overrides = {};
    for (const key of keys) {
      overrides[key] = source[key] === null || source[key] === undefined
        ? null
        : normalizeLayer(source[key]);
    }
    return { global, ...overrides };
  }

  // 老形态：两份平级配置。
  const layers = {};
  for (const key of keys) {
    layers[key] = normalizeLayer(source[key] ?? defaultLayer());
  }
  const values = keys.map((key) => layers[key]);
  const identical = values.every((value) => sameLayer(value, values[0]));

  if (identical) {
    // 两份一样 → 提成全局，两层都继承。配过的人看到的行为不变：
    // 以后改全局就是改它们（这正是他要的"统一"）。
    const overrides = {};
    for (const key of keys) overrides[key] = null;
    return { global: values[0], ...overrides };
  }

  // 两份不一样 → 选更保守的一份当全局，两份**原样保留为覆盖**。
  // 这样任何人的实际判定结果都不变；迁移只影响"以后怎么改"。
  let global = values[0];
  for (const value of values.slice(1)) global = pickGlobal(global, value);
  return { global, ...layers };
}

/**
 * 取某一层**实际生效**的值（覆盖层为 null/缺失时回落全局）。
 *
 * 运行期与设置页都必须走这里——两处各写一份回落逻辑，早晚会漂移成
 * "设置页显示的是 A、运行期用的是 B"。
 *
 * @param config - `{ global, direct, group }`（新形态）。
 * @param layerKey - 'global' | 'direct' | 'group'。
 * @returns 生效的那一层（认不出层时回落 global）。
 */
export function resolveScope(config, layerKey) {
  const source = isPlainObject(config) ? config : {};
  if (layerKey === 'global' || !OVERRIDE_KEYS.includes(layerKey)) return source.global ?? null;
  return source[layerKey] ?? source.global ?? null;
}

/** 某一层是不是"继承全局"。 */
export function isInherited(config, layerKey) {
  if (!OVERRIDE_KEYS.includes(layerKey)) return false;
  const source = isPlainObject(config) ? config : {};
  return source[layerKey] === null || source[layerKey] === undefined;
}

/**
 * 把**某一层**的新值写回去（其它层原样保留）。
 *
 * `next === null` 表示"这一层改为继承全局"。
 * 这是设置页唯一的写入口，保证"只改当前层、不动别人"。
 *
 * @param config - 完整配置。
 * @param layerKey - 要写的那一层。
 * @param next - 该层的新值；`null` = 继承全局。
 * @returns 新的完整配置（浅拷贝，不改原对象）。
 */
export function writeScope(config, layerKey, next) {
  const source = isPlainObject(config) ? config : {};
  if (layerKey === 'global') return { ...source, global: next };
  if (!OVERRIDE_KEYS.includes(layerKey)) return { ...source };
  return { ...source, [layerKey]: next };
}

/**
 * 一份配置里"哪些层是覆盖、哪些是继承"的摘要（设置页与卡片都用它说人话）。
 *
 * @param config - 完整配置。
 * @param keys - 覆盖层键（默认 direct/group）。
 * @returns `{ [key]: 'inherited' | 'override' }`。
 */
export function summarizeLayers(config, keys = OVERRIDE_KEYS) {
  const source = isPlainObject(config) ? config : {};
  const out = {};
  for (const key of keys) {
    out[key] = source[key] === null || source[key] === undefined ? 'inherited' : 'override';
  }
  return out;
}
