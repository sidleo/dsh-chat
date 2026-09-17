/**
 * 主动投递（hub 所有）：把一段文本推给指定渠道的指定会话。
 *
 * 分工：
 * - hub 持有"目标清单"（存在每机器人设置的 `deliveryTargets`，沿用上游结构）
 *   与调度逻辑；
 * - 渠道提供两件事：`send({ target, text })`（怎么发）与 `discover(botId)`
 *   （从自己的会话记录里发现可投递对象）。
 *
 * 这样定时任务/脚本只需要 `dshChat.delivery.send({ channelId, botId, targetId, text })`，
 * 不必知道任何平台细节；新增渠道也只要实现这两个方法。
 *
 * @module dsh-chat/host/delivery
 */

import { stat } from 'node:fs/promises';
import { basename, isAbsolute, resolve } from 'node:path';

/** 目标 id 语法（与渠道 id 同款安全字符集）。 */
const TARGET_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** 出站文件上限：飞书 im/v1/files 的硬限制就是 30MB，超过它没有任何渠道能发出去。 */
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const FILE_NAME_MAX = 120;
/** 按图片发出去会得到预览与缩略图，比当附件更好用（渠道按 kind 自己决定消息类型）。 */
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);
const TARGET_NAME_MAX = 80;
const ROUTE_MAX_KEYS = 8;
const ROUTE_VALUE_MAX = 256;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g;
const CONTROL_CHARACTER_TEST = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deliveryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/** route 里只允许"短标量"：不存 Secret、不存嵌套结构。 */
function normalizeRoute(route) {
  if (!isPlainObject(route)) throw deliveryError('chat/bad-target', '投递目标的 route 必须是对象。');
  const keys = Object.keys(route);
  if (keys.length === 0 || keys.length > ROUTE_MAX_KEYS) {
    throw deliveryError('chat/bad-target', `投递目标的 route 需要 1–${ROUTE_MAX_KEYS} 个字段。`);
  }
  const normalized = {};
  for (const key of keys) {
    const value = route[key];
    if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/u.test(key)) {
      throw deliveryError('chat/bad-target', `route 字段名不合法：${key}`);
    }
    if (typeof value !== 'string' || !value.trim() || value.length > ROUTE_VALUE_MAX
      || CONTROL_CHARACTER_TEST.test(value)) {
      throw deliveryError('chat/bad-target', `route.${key} 必须是非空短字符串。`);
    }
    normalized[key] = value.replace(CONTROL_CHARACTERS, '').trim();
  }
  return Object.freeze(normalized);
}

/**
 * 校验一个投递目标。
 *
 * @param input - { id, name?, kind, route }。
 * @returns 冻结后的目标。
 */
export function normalizeTarget(input) {
  if (!isPlainObject(input)) throw deliveryError('chat/bad-target', '投递目标必须是对象。');
  const { id, name, kind, route } = input;
  if (typeof id !== 'string' || !TARGET_ID.test(id)) {
    throw deliveryError('chat/bad-target', '投递目标 id 只能是 1–64 位字母/数字/下划线/连字符。');
  }
  if (kind !== 'direct' && kind !== 'group') {
    throw deliveryError('chat/bad-target', '投递目标 kind 只能是 direct 或 group。');
  }
  const label = typeof name === 'string' ? name.replace(CONTROL_CHARACTERS, '').trim() : '';
  if (label.length > TARGET_NAME_MAX) {
    throw deliveryError('chat/bad-target', `投递目标名称不得超过 ${TARGET_NAME_MAX} 个字符。`);
  }
  return Object.freeze({ id, name: label, kind, route: normalizeRoute(route) });
}

/**
 * 把一次"要发的文件"归一化：解析路径、校验存在与大小、收敛文件名。
 *
 * 相对路径按**该机器人的工作区**解析——agent 生成报表时用的就是会话工作目录，
 * 让它写 `报表.xlsx` 而不是绝对路径才是顺手的。
 *
 * @param options - { path, name, workspace }。
 * @returns 冻结的 { path, name, size }。
 */
async function resolveOutboundFile({ path: inputPath, name, workspace }) {
  const raw = typeof inputPath === 'string' ? inputPath.trim() : '';
  if (!raw) throw deliveryError('chat/bad-file', '发送文件需要 path。');
  const absolute = isAbsolute(raw) ? raw : resolve(workspace ?? process.cwd(), raw);
  let stats;
  try {
    stats = await stat(absolute);
  } catch {
    throw deliveryError('chat/file-not-found', `找不到文件：${absolute}`);
  }
  if (!stats.isFile()) throw deliveryError('chat/bad-file', `不是普通文件：${absolute}`);
  if (stats.size === 0) throw deliveryError('chat/bad-file', `文件是空的，无法发送：${absolute}`);
  if (stats.size > MAX_FILE_BYTES) {
    const mb = (stats.size / 1024 / 1024).toFixed(1);
    throw deliveryError('chat/file-too-large',
      `文件 ${mb}MB 超过 ${MAX_FILE_BYTES / 1024 / 1024}MB 上限：${absolute}`);
  }
  const label = typeof name === 'string' ? name.replace(CONTROL_CHARACTERS, '').trim() : '';
  const finalName = (label || basename(absolute)).slice(0, FILE_NAME_MAX);
  const ext = finalName.split('.').pop()?.toLowerCase() ?? '';
  const kind = IMAGE_EXTENSIONS.has(ext) ? 'image' : 'file';
  return Object.freeze({ path: absolute, name: finalName, size: stats.size, kind });
}

/**
 * 会话身份键：同一会话可能以不同 id 出现（旧数据 `tgt_xxx` vs 渠道派生的 `group_xxx`），
 * 因此判重按"类型 + 路由"而不是 id。
 *
 * @param target - 归一化后的目标。
 * @returns 稳定的字符串键。
 */
function routeKey(target) {
  const route = Object.entries(target.route)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\u0001');
  return `${target.kind}\u0000${route}`;
}

/** 容错归一化（读取历史数据用）：坏条目丢弃而不是让整表读不出来。 */
function normalizeStoredTargets(value) {  if (!isPlainObject(value)) return {};
  const targets = {};
  for (const [id, target] of Object.entries(value)) {
    try {
      targets[id] = normalizeTarget({ ...target, id });
    } catch {
      // 丢弃坏条目：一条脏数据不该让该机器人所有投递目标失效。
    }
  }
  return targets;
}

/**
 * 创建投递服务。
 *
 * @param options - { settings, logger }。
 * @returns 投递服务。
 */
export function createDeliveryService({ settings, logger = console }) {
  if (!settings?.read) throw new TypeError('投递服务需要每机器人设置存储。');
  /** @type {Map<string, object>} channelId → 渠道投递实现 */
  const providers = new Map();

  return Object.freeze({
    /**
     * 渠道注册投递实现（实例创建时由注册表调用，注销时释放）。
     *
     * @param channelId - 渠道 id。
     * @param provider - `{ send({ botId, target, text }), discover?({ botId }) }`。
     * @returns 注销函数。
     */
    attach(channelId, provider) {
      if (typeof provider?.send !== 'function') {
        throw new TypeError(`渠道 ${channelId} 的投递实现缺少 send。`);
      }
      providers.set(channelId, provider);
      return () => {
        if (providers.get(channelId) === provider) providers.delete(channelId);
      };
    },

    /** @returns 该渠道是否支持发送文件（`sendFile` 可选，能力缺席要能被查出来）。 */
    supportsFile: (channelId) => typeof providers.get(channelId)?.sendFile === 'function',

    /** @returns 该渠道是否具备主动投递能力。 */
    supports: (channelId) => providers.has(channelId),

    /** @returns 已保存的投递目标（含渠道发现的候选，候选不落盘）。 */
    async list({ channelId, botId }) {
      const saved = normalizeStoredTargets(settings.read(channelId, botId).deliveryTargets);
      const provider = providers.get(channelId);
      let discovered = [];
      if (typeof provider?.discover === 'function') {
        try {
          discovered = await provider.discover({ botId });
        } catch (error) {
          logger.warn?.(`[dsh-chat] 渠道 ${channelId} 发现投递目标失败：${error?.message ?? error}`);
        }
      }
      const savedList = Object.values(saved);
      // 同一个会话可能有两套 id（旧设置里的 tgt_xxx 与渠道派生的 group_xxx），
      // 因此除了 id，还要按"类型 + 路由"判重，否则设置页和 agent 会看到重复条目。
      const known = new Set(savedList.map(routeKey));
      const candidates = [];
      for (const candidate of Array.isArray(discovered) ? discovered : []) {
        try {
          const target = normalizeTarget(candidate);
          const key = routeKey(target);
          if (saved[target.id] || known.has(key)) continue;
          known.add(key);
          candidates.push(Object.freeze({ ...target, discovered: true }));
        } catch {
          // 忽略无法识别的候选
        }
      }
      return Object.freeze({
        targets: Object.freeze([...savedList, ...candidates]),
        canSend: providers.has(channelId),
      });
    },

    /**
     * 保存（或覆盖）一个投递目标。
     *
     * @param options - { channelId, botId, target }。
     */
    async save({ channelId, botId, target }) {
      const normalized = normalizeTarget(target);
      const current = normalizeStoredTargets(settings.read(channelId, botId).deliveryTargets);
      await settings.write(channelId, botId, {
        deliveryTargets: { ...current, [normalized.id]: normalized },
      });
      return normalized;
    },

    /** 删除一个投递目标。 */
    async remove({ channelId, botId, targetId }) {
      const current = normalizeStoredTargets(settings.read(channelId, botId).deliveryTargets);
      if (!Object.hasOwn(current, targetId)) return false;
      const next = { ...current };
      delete next[targetId];
      await settings.write(channelId, botId, { deliveryTargets: next });
      return true;
    },

    /**
     * 发一条文本。
     *
     * @param options - { channelId, botId, targetId, text }。
     * @returns 渠道返回的发送结果。
     */
    async send({ channelId, botId, targetId, text }) {
      const provider = providers.get(channelId);
      if (!provider) {
        throw deliveryError('chat/delivery-unavailable', `渠道 ${channelId} 不支持主动投递。`);
      }
      const content = typeof text === 'string' ? text.trim() : '';
      if (!content) throw deliveryError('chat/empty-text', '投递内容不能为空。');
      const saved = normalizeStoredTargets(settings.read(channelId, botId).deliveryTargets);
      const target = saved[targetId];
      if (!target) {
        throw deliveryError('chat/unknown-target', `找不到投递目标 ${targetId}（先在设置页保存或改用候选目标）。`);
      }
      return provider.send({ botId, target, text: content });
    },

    /**
     * 发一个文件。
     *
     * 与文本同样的安全边界：**只能发给已保存的目标**；文件本身必须是存在、非空、
     * 不超过上限的普通文件。
     *
     * @param options - { channelId, botId, targetId, path, name? }。
     * @returns 渠道返回的发送结果。
     */
    async sendFile({ channelId, botId, targetId, path, name }) {
      const provider = providers.get(channelId);
      if (!provider) {
        throw deliveryError('chat/delivery-unavailable', `渠道 ${channelId} 不支持主动投递。`);
      }
      if (typeof provider.sendFile !== 'function') {
        throw deliveryError('chat/delivery-unsupported', `渠道 ${channelId} 暂不支持发送文件。`);
      }
      const saved = normalizeStoredTargets(settings.read(channelId, botId).deliveryTargets);
      const target = saved[targetId];
      if (!target) {
        throw deliveryError('chat/unknown-target', `找不到投递目标 ${targetId}（先在设置页保存或改用候选目标）。`);
      }
      const file = await resolveOutboundFile({
        path,
        name,
        workspace: settings.read(channelId, botId).workspace,
      });
      return provider.sendFile({ botId, target, file });
    },
  });
}
