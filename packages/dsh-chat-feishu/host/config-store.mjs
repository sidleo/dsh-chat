/**
 * 飞书机器人配置存储。
 *
 * 沿用 dsh-im 的 `~/.dsh/integrations/dsh-feishu/config.json`（version 2）
 * 与凭据引用，因此用户现有机器人零重绑即可继续使用。
 *
 * 本插件在机器人上新增的字段：
 * - `larkIdentity`：**分层**的 lark-cli 身份策略（全局 / 私聊 / 群聊 / 指定群与指定人，
 *   就近覆盖；每层 `{ bot, user }` 两个开关各自独立）。旧字段 `larkUserIdentity` 读取时迁移。
 * - `larkUserOpenId`：lark-cli 里**钉住的那个人**——`user` 开关只决定"允不允许以用户身份调用"，
 *   实际是谁由它核对；换人不靠这里（一个 appId 在 lark-cli 里只有一份 profile）。
 *
 * - `cardAnswer`：**卡片友好回答**（默认开）。开了就把"这台机器人的回复会被渲染进飞书卡片"
 *   这件事写进会话的系统提示词，让模型自己按卡片能用的 markdown 语法组织答案
 *   （表格 ≤5 行、别用 `#` 当正文标题…）；关掉则整段不注入。**插件不改写答案内容**。
 *
 * 取代原来的"全局一份"过程展示：
 * - `stepPushDirect`：私聊过程展示
 * - `stepPushGroup`：群聊过程展示
 * 取值 `off | post | streaming_card`；旧字段 `stepPush` + `stepPushMode`
 * 读取时迁移到这两个字段（两者同值），保存后旧字段消失。
 *
 * @module dsh-chat-feishu/config-store
 */

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { normalizeLarkIdentity } from './lark-identity.mjs';
import { normalizeLarkUserIdentity } from './lark-cli.mjs';

/** 旧实现里默认 Secret 引用名（手工配置的机器人沿用）。 */
export const LEGACY_SECRET_REF = 'DSH_FEISHU_APP_SECRET';

/** 过程展示三态。 */
export const STEP_PUSH_MODES = Object.freeze(['off', 'post', 'streaming_card']);

const DEFAULT_STEP_PUSH = 'off';

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeId(value) {
  const id = cleanString(value);
  return id && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}

/**
 * 归一化过程展示取值：非法值一律回落 `off`（永不阻塞机器人启动）。
 *
 * @param value - 任意历史值。
 * @returns 'off' | 'post' | 'streaming_card'。
 */
export function normalizeStepPushMode(value) {
  return STEP_PUSH_MODES.includes(value) ? value : DEFAULT_STEP_PUSH;
}

function normalizeOwners(value) {
  const candidates = Array.isArray(value?.ownerOpenIds) ? value.ownerOpenIds : [value?.ownerOpenId];
  return [...new Set(candidates.map(cleanString).filter(Boolean))];
}

/**
 * 归一化一个机器人条目（含旧过程展示字段的迁移）。
 *
 * @param value - 磁盘上的机器人条目。
 * @param options - { legacy }：允许沿用旧默认 Secret 引用。
 * @returns 冻结的机器人配置，或 null（信息不足以启动）。
 */
export function normalizeBot(value, { legacy = false } = {}) {
  if (!value || typeof value !== 'object') return null;
  const appId = cleanString(value.appId);
  const ownerOpenIds = normalizeOwners(value);
  const id = safeId(value.id) ?? (legacy && appId
    ? `legacy_${appId.replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}`
    : null);
  const secretRef = cleanString(value.secretRef) ?? (legacy ? LEGACY_SECRET_REF : null);
  if (!appId || ownerOpenIds.length === 0 || !id || !secretRef) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(secretRef)) return null;

  // 过程展示：新字段优先，否则从旧的全局字段迁移。
  const hasNewFields = value.stepPushDirect !== undefined || value.stepPushGroup !== undefined;
  const migrated = normalizeStepPushMode(value.stepPushMode);
  const legacyMode = value.stepPush === true ? migrated : DEFAULT_STEP_PUSH;

  /**
   * 身份策略：**分层**配置优先；没有就按旧字段迁移。
   *
   * 旧字段仍在（`larkUserIdentity: 'user-allowed'`）时，等价迁移为"全局允许 bot + user"，
   * 因此升级后用户不必重配、也不会被静默收窄。
   */
  const larkIdentity = normalizeLarkIdentity(
    value.larkIdentity !== undefined
      ? value.larkIdentity
      : (value.larkUserIdentity !== undefined ? { mode: normalizeLarkUserIdentity(value.larkUserIdentity) } : null),
  );
  // 钉住的人与"允不允许"是两件事：只要授权仍有效就保留（哪怕当前全局是 bot-only），
  // 否则用户来回切一次设置就得重新扫一次码。仅在 lark-cli 侧确认失效时才清。
  const larkUserOpenId = cleanString(value.larkUserOpenId);

  return Object.freeze({
    id,
    appId,
    secretRef,
    ownerOpenIds: Object.freeze(ownerOpenIds),
    domain: value.domain === 'lark' ? 'lark' : 'feishu',
    botName: cleanString(value.botName),
    botOpenId: cleanString(value.botOpenId),
    groupResponseMode: value.groupResponseMode === 'all' ? 'all' : 'mention',
    groupTopicReply: value.groupTopicReply === true,
    groupMessagePermissionGranted: value.groupMessagePermissionGranted === true,
    stepPushDirect: hasNewFields
      ? normalizeStepPushMode(value.stepPushDirect)
      : legacyMode,
    stepPushGroup: hasNewFields
      ? normalizeStepPushMode(value.stepPushGroup)
      : legacyMode,
    larkIdentity,
    larkUserOpenId,
    // 卡片友好回答：缺省开（缺项 = 生效，与面板显示项同一条归一化方向）。
    cardAnswer: value.cardAnswer !== false,
    connectedAt: cleanString(value.connectedAt),
    createdAt: cleanString(value.createdAt) ?? cleanString(value.connectedAt),
  });
}

function normalizeDocument(value) {
  if (value && typeof value === 'object' && value.version === 2 && Array.isArray(value.bots)) {
    const bots = value.bots.map((bot) => normalizeBot(bot));
    if (bots.some((bot) => bot === null)) {
      throw new Error('dsh-feishu config.json 含无法识别的机器人条目');
    }
    return { version: 2, bots };
  }
  // version 1：单个机器人对象。
  const legacyBot = normalizeBot(value, { legacy: true });
  return legacyBot ? { version: 2, bots: [legacyBot] } : { version: 2, bots: [] };
}

/**
 * 飞书机器人配置存储。
 *
 * @param options - { path, logger }。
 * @returns 存储 API。
 */
export function createFeishuConfigStore({ path, logger = console } = {}) {
  if (typeof path !== 'string' || !path.trim()) throw new TypeError('config store 需要 path。');
  let document = { version: 2, bots: [] };
  let loaded = false;
  let queue = Promise.resolve();

  async function persist() {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp-${randomBytes(6).toString('hex')}`;
    await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await rename(temporary, path);
  }

  function enqueue(task) {
    const next = queue.then(task, task);
    queue = next.then(() => undefined, () => undefined);
    return next;
  }

  return {
    path,

    async load() {
      if (loaded) return this;
      try {
        document = normalizeDocument(JSON.parse(await readFile(path, 'utf8')));
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          logger.warn?.(`[dsh-chat-feishu] 读取 ${path} 失败：${error?.message ?? error}`);
        }
        document = { version: 2, bots: [] };
      }
      loaded = true;
      return this;
    },

    /** @returns 全部机器人（冻结）。 */
    list() {
      return Object.freeze([...document.bots]);
    },

    /** @returns 指定机器人，未配置时 undefined。 */
    get(botId) {
      return document.bots.find((bot) => bot.id === botId);
    },

    /** 写入（合并）一个机器人；不存在则按 id 追加。 */
    async saveBot(patch) {
      const id = safeId(patch?.id);
      if (!id) throw new TypeError('saveBot 需要合法 id。');
      return enqueue(async () => {
        await this.load();
        const index = document.bots.findIndex((bot) => bot.id === id);
        const merged = normalizeBot({
          ...(index >= 0 ? document.bots[index] : {}),
          ...patch,
        });
        if (!merged) throw new TypeError('saveBot 的信息不完整（appId / ownerOpenIds / secretRef 必填）。');
        const bots = [...document.bots];
        if (index >= 0) bots[index] = merged;
        else bots.push(merged);
        document = { version: 2, bots };
        await persist();
        return merged;
      });
    },

    /**
     * 设置任务过程展示（私聊/群聊两份，原子保存）。
     *
     * @param botId - 机器人 id。
     * @param modes - { direct, group }，各自为三态之一。
     * @returns 写入后的机器人配置。
     */
    async setStepPush(botId, modes) {
      const direct = normalizeStepPushMode(modes?.direct);
      const group = normalizeStepPushMode(modes?.group);
      return this.saveBot({ id: botId, stepPushDirect: direct, stepPushGroup: group });
    },

    /**
     * 设置「卡片友好回答」（只影响注入会话的那段提示词，不改写答案）。
     *
     * @param botId - 机器人 id。
     * @param enabled - 布尔。
     * @returns 写入后的机器人配置。
     */
    async setCardAnswer(botId, enabled) {
      return this.saveBot({ id: botId, cardAnswer: enabled === true });
    },

    /**
     * 设置**分层**的 lark-cli 身份策略，以及钉住哪个用户。
     *
     * 钉住的人只在 lark-cli 侧确认过身份时才更新（`userOpenId` 省略 = 保持原值）——
     * 它是 `assertIdentity` 的核对基准，不该被一次纯配置保存顺手清掉。
     *
     * @param botId - 机器人 id。
     * @param options - { identity, userOpenId }。
     * @returns 写入后的机器人配置。
     */
    async setLarkIdentity(botId, { identity, userOpenId } = {}) {
      const patch = { id: botId, larkIdentity: normalizeLarkIdentity(identity) };
      if (userOpenId !== undefined) {
        const pinned = cleanString(userOpenId);
        if (pinned && !/^ou_[A-Za-z0-9_-]{4,64}$/.test(pinned)) {
          throw new TypeError(`钉住的用户 open_id 形状不对：${pinned}`);
        }
        patch.larkUserOpenId = pinned;
      }
      return this.saveBot(patch);
    },

    /** 删除一个机器人。 */
    async removeBot(botId) {
      return enqueue(async () => {
        await this.load();
        const bots = document.bots.filter((bot) => bot.id !== botId);
        const removed = bots.length !== document.bots.length;
        if (removed) {
          document = { version: 2, bots };
          await persist();
        }
        return removed;
      });
    },
  };
}
