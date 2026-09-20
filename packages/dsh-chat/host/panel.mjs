/**
 * 控制面板（hub 所有，渠道共用）：一次读取"这台机器人在这个会话里能改什么、当前是什么"，
 * 以及"把某个选择应用下去"。
 *
 * 为什么要有它：IM 里的可交互卡片（飞书的下拉）需要一份**渠道无关**的当前状态与可选项。
 * 平台概念（下拉怎么画、回调怎么收）留在渠道；语义（模型是会话级、工作区只对新会话生效、
 * 路径要校验）在 hub 实现一次，所有渠道复用——这也是"新增渠道不改 hub"的一部分。
 *
 * 分工与约束：
 * - 只读 + 应用两个动作，不做 UI；
 * - 一切失败都抛带 `code` 的 Error（渠道转成用户可见文案，绝不静默）；
 * - 模型/推理是**会话级**（`session/selectModel`），工作区/预设/是**机器人级**且只对新会话生效。
 *
 * @module dsh-chat/host/panel
 */

import { stat } from 'node:fs/promises';
import { isAbsolute, resolve as resolvePath } from 'node:path';

import { normalizeContextConfig, TARGET_LIMIT } from '../shared/context-enhancement.mjs';
import { botModelForSelection, normalizeBotModel } from './bot-model.mjs';

function panelError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

/**
 * 可切换的工作区候选。
 *
 * 与设置页「工作区」下拉**同一来源**（这台机器人用过的目录 + 当前值），抽在这里避免两份逻辑漂移。
 *
 * @param options - { record, sessionStore, channelId, botId }。
 * @returns 去重后的绝对路径数组。
 */
export function workspaceCandidates({ record, sessionStore, channelId, botId }) {
  const boundPaths = Object.values(sessionStore?.entries?.(channelId, botId) ?? {})
    .map((entry) => entry?.workspacePath)
    .filter((value) => typeof value === 'string' && value);
  return [...new Set([
    ...(typeof record?.workspace === 'string' && record.workspace ? [record.workspace] : []),
    ...boundPaths,
  ])];
}

/**
 * 读一次模型目录（`session/modelCatalog`）。
 *
 * 模块级实现：**面板与设置页的「默认模型」栏用同一份来源**（两处各写一遍必然漂移）。
 *
 * 真形状：`{ default, routableProviders, groups: [{ id, name, models: [{ id, name, reasoning }] }] }`
 * ——provider 是 `group.id`（不是 `provider`/`providerId`）。
 *
 * @param sessions - 会话桥服务（要能 `invoke('session','modelCatalog')`）。
 * @param logger - 读失败时记一条 warn（不静默）。
 * @returns `{ options, hostDefault, failures }`。
 */
export async function readModelCatalog(sessions, logger = console) {
  const catalog = await sessions.invoke('session', 'modelCatalog', {});
  const options = [];
  /**
   * 目录里的失败清单（`session/modelCatalog` 会为每个拿不到模型的 provider 给一条
   * `failures: [{ id, name, message }]`）。**必须带出去**：否则前端只能显示
   * "当前 Host 没有可用模型"，用户和排查的人都不知道为什么（真机上就是这么卡住的）。
   */
  const failures = (catalog?.failures ?? []).map((item) => ({
    id: item?.id ?? '', name: item?.name ?? item?.id ?? '', message: item?.message ?? '',
  }));
  for (const group of catalog?.groups ?? []) {
    const provider = group.id ?? group.provider ?? group.providerId;
    for (const model of group.models ?? []) {
      const id = model.id ?? model.model;
      if (!provider || !id) continue;
      options.push({
        value: `${provider}/${id}`,
        provider,
        model: id,
        name: model.name ?? id,
        providerName: group.name ?? group.providerName ?? provider,
        efforts: (model.reasoning?.efforts ?? []).map((effort) => ({
          id: effort.id, label: effort.name ?? effort.label ?? effort.id,
        })),
        defaultEffort: model.reasoning?.defaultEffort ?? null,
      });
    }
  }
  // `default` 在 Host 没设默认时是 `{}`（schema 是 `{...currentSelection()}`）：补全成 null。
  const rawDefault = catalog?.default;
  const hostDefault = rawDefault?.provider && rawDefault?.model ? rawDefault : null;
  return { options, hostDefault, failures };
}

/**
 * 会话键 → 上下文增强的命中身份。
 *
 * 会话键是 hub 自己的约定（`p2p:<平台用户 id>` / `group:<平台群 id>`），而指定设置
 * （`targets[]`）也是按**平台 id** 命中的：私聊按 senderId 命中 `user` 目标、
 * 群聊按 chatId 命中 `group` 目标。所以"本会话用的是哪一份、要不要单独来一份"
 * 可以直接算出来，不用去猜。
 *
 * 认不出的键返回 null：这时宁可不提供这一项，也不能照着错误的方向去改设置。
 *
 * @param key - 会话键。
 * @returns `{ kind: 'user'|'group', id }` 或 null。
 */
export function conversationTarget(key) {
  const text = typeof key === 'string' ? key : '';
  const separator = text.indexOf(':');
  if (separator <= 0) return null;
  const head = text.slice(0, separator);
  if (head !== 'p2p' && head !== 'group') return null;
  const id = text.slice(separator + 1).trim();
  if (!id) return null;
  return { kind: head === 'group' ? 'group' : 'user', id };
}

/**
 * 本会话的上下文增强（面板字段 `context`）。
 *
 * 语义：**本会话用哪一份设置**——
 * - `''` 跟随该会话类型的全局设置（= 没有本会话的指定设置）；
 * - `own` 本会话有自己的指定设置（内容在设置页编辑）；
 * - `copy:<id>` 套用该机器人另一条**同类型**指定设置的字段与提示词。
 *
 * 只给属主：它写的是机器人级配置（与设置页同一份数据），普通成员不该改。
 *
 * @returns 面板状态，或 null（不该/没法提供这一项）。
 */
function contextPanelState({ record, key, isOwner }) {
  if (isOwner !== true) return null;
  const target = conversationTarget(key);
  if (!target) return null;
  const config = normalizeContextConfig(record.contextEnhancement);
  const scope = target.kind === 'group' ? config.group : config.direct;
  const kindLabel = target.kind === 'group' ? '群聊' : '私聊';
  const own = config.targets.find((item) => item.kind === target.kind && item.id === target.id) ?? null;
  const options = [
    { value: '', label: `跟随${kindLabel}全局（${scope.enabled === true ? '已启用' : '未启用'}）` },
    { value: 'own', label: `本会话专属设置（复制${kindLabel}全局作为起点）` },
  ];
  for (const item of config.targets) {
    if (item.kind !== target.kind || item.id === target.id) continue;
    options.push({ value: `copy:${item.id}`, label: `套用「${item.label?.trim() || item.id}」的字段与提示词` });
  }
  return {
    // 下拉里"当前选中的那一项"，与 `panel.apply` 的取值一一对应。
    current: own ? 'own' : '',
    scopeEnabled: scope.enabled === true,
    kind: target.kind,
    /** 平台 id：卡片上写出来，用户才知道这条设置是给谁的（也便于与设置页对账）。 */
    identity: target.id,
    label: target.kind === 'group' ? '本群' : '本私聊',
    own: own
      ? { label: own.label?.trim() || null, fields: own.fields.length, guidanceLength: own.guidance.length }
      : null,
    options,
  };
}

/**
 * 校验一个工作区路径：必须是已存在的目录，且存绝对路径。
 *
 * @param raw - 用户/卡片给的值。
 * @returns 绝对路径。
 */
export async function validateWorkspacePath(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw panelError('chat/workspace-invalid', '工作区需要是一个绝对路径。');
  }
  const given = raw.trim();
  // 必须绝对路径：相对路径会跟着 dsh 的启动目录变，排查时最难查（设置页那条路也是这个口径）。
  if (!isAbsolute(given)) {
    throw panelError('chat/workspace-invalid', `工作区需要是绝对路径：${given}`);
  }
  const target = resolvePath(given);
  let info;
  try {
    info = await stat(target);
  } catch (error) {
    throw panelError('chat/workspace-invalid',
      `目录不存在或读不到：${target}（${error?.code ?? error?.message}）`);
  }
  if (!info.isDirectory()) {
    throw panelError('chat/workspace-invalid', `不是目录：${target}`);
  }
  return target;
}

/**
 * 创建控制面板服务。
 *
 * @param options - { settings, sessions, sessionStore, agentPresets?, logger? }。
 *   `settings` = 每机器人设置（workspace / agentPreset）；`sessions` = 会话桥（invoke/绑定表）；
 *   `agentPresets` = 可选服务（某些部署没装）。
 * @returns `{ read, apply }`。
 */
export function createPanelService({
  settings, sessions, sessionStore = null, agentPresets = null, channelRpc = null, logger = console,
} = {}) {
  if (typeof settings?.read !== 'function') throw new TypeError('控制面板需要每机器人设置存储。');
  if (typeof sessions?.invoke !== 'function') throw new TypeError('控制面板需要会话桥。');

  function boundSessionId(channelId, botId, key) {
    return sessions.bindings?.get?.(channelId, botId, key)?.sessionId ?? null;
  }

  /**
   * 当前会话的模型选择。
   *
   * 真形状是 `projections.values.modelSelection = { lastUsed, next }`（**不是**顶层 provider/model），
   * 其中 `next = pending ?? lastUsed`：
   * - `session/selectModel` 只写 `pending`，要等下一轮 `request/header` 才刷新 `lastUsed`；
   * - 所以**刚在卡片上换完模型时 `next` 才是新值、`lastUsed` 还是旧的**（官方 UI 读的也是 `next`）。
   *
   * 因此必须 `next ?? lastUsed`：读反了会出现两个真机症状——刚选完模型卡片仍显示旧模型；
   * 紧接着改推理等级时用旧的 provider/model 调 selectModel，把用户刚选的模型静默改回去。
   */
  async function currentSelection(sessionId) {
    if (!sessionId) return null;
    // 这里**不吞异常**：吞掉会让 read() 里那句 warn 变成死代码，还会让 apply 把
    // "这次 RPC 失败了"讲成"你从没选过模型"。读失败由调用方按各自语义处理。
    const listed = await sessions.invoke('session', 'list', { _request: {} });
    const item = listed?.items?.find((entry) => entry.sessionId === sessionId);
    const projection = item?.projections?.values?.modelSelection;
    const selection = projection?.next ?? projection?.lastUsed ?? null;
    if (!selection?.provider || !selection?.model) return null;
    return {
      provider: selection.provider,
      model: selection.model,
      reasoningEffort: selection.reasoningEffort ?? null,
    };
  }

  /** 面板内置字段：其它字段一律交给**渠道自己**处理（如飞书的「任务过程展示」）。 */
  const BUILT_IN_FIELDS = new Set(['model', 'reasoning', 'preset', 'workspace', 'session', 'context']);

  /**
   * 应用「本会话的上下文增强」这个选择（三种取值，语义见 `contextPanelState`）。
   *
   * 三种情况都**不碰其他会话的设置**：`own` 是"复制全局"、`copy:<id>` 是"复制另一条"，
   * 都只是新增/替换本会话这一条；`''` 只删本会话这一条。
   */
  async function applyContextScope({ channelId, botId, key, value, record, field }) {
    const target = conversationTarget(key);
    if (!target) {
      throw panelError('chat/bad-request', '认不出这个会话的平台 id，没法给它单独设上下文增强。');
    }
    const config = normalizeContextConfig(record.contextEnhancement);
    const scope = target.kind === 'group' ? config.group : config.direct;
    const kindLabel = target.kind === 'group' ? '本群' : '本私聊';
    const own = config.targets.find((item) => item.kind === target.kind && item.id === target.id) ?? null;
    /** 复制出来的那一条：`label` 留空（备注名由用户在设置页起），`enabled` 明确打开。 */
    const copyOf = (source, extra) => ({
      kind: target.kind,
      id: target.id,
      label: '',
      enabled: true,
      fields: [...source.fields],
      guidance: source.guidance,
      merge: source.merge,
      ...(extra ?? {}),
    });

    if (value === '' || value === null) {
      if (!own) return { field, value: '', message: `${kindLabel}本来就跟随全局，没有改动。` };
      await settings.write(channelId, botId, {
        contextEnhancement: { ...config, targets: config.targets.filter((item) => item !== own) },
      });
      return { field, value: '', message: `已删除${kindLabel}的专属设置，改为跟随全局（下一条消息生效）。` };
    }

    if (value === 'own') {
      if (own) return { field, value: 'own', message: `${kindLabel}已经是专属设置，内容请在设置页编辑。` };
      if (config.targets.length >= TARGET_LIMIT) {
        throw panelError('chat/context-target-limit',
          `指定设置最多 ${TARGET_LIMIT} 条，先到设置页删掉几条。`);
      }
      await settings.write(channelId, botId, {
        contextEnhancement: { ...config, targets: [...config.targets, copyOf({ ...scope, merge: 'replace' })] },
      });
      return {
        field,
        value: 'own',
        message: scope.enabled === true
          ? `已为${kindLabel}创建专属设置（内容与全局相同），要改内容请到设置页（下一条消息生效）。`
          : `全局的${target.kind === 'group' ? '群聊' : '私聊'}增强本来是关闭的：已为${kindLabel}单独开启，`
            + '来源字段已带好、提示词为空，请到设置页填写（下一条消息生效）。',
      };
    }

    if (typeof value !== 'string' || !value.startsWith('copy:')) {
      throw panelError('chat/bad-request', `上下文增强不支持这个取值：${String(value)}`);
    }
    const sourceId = value.slice('copy:'.length);
    const source = config.targets.find((item) => item.kind === target.kind && item.id === sourceId);
    if (!source) throw panelError('chat/unknown-context-target', `找不到这条指定设置：${sourceId}`);
    const copied = copyOf(source);
    const targets = own
      ? config.targets.map((item) => (item === own ? copied : item))
      : [...config.targets, copied];
    if (!own && targets.length > TARGET_LIMIT) {
      throw panelError('chat/context-target-limit', `指定设置最多 ${TARGET_LIMIT} 条，先到设置页删掉几条。`);
    }
    await settings.write(channelId, botId, { contextEnhancement: { ...config, targets } });
    return {
      field,
      value,
      message: `已把「${source.label?.trim() || source.id}」的字段与提示词套用到${kindLabel}`
        + '（复制，不影响原来那条；下一条消息生效）。',
    };
  }

  /**
   * 渠道自带的面板字段（渠道相关的设置，如飞书的「任务过程展示」）。
   *
   * 渠道实现 `panel.fields` 就多一行下拉，不实现就当没有——**hub 不认识渠道语义**，
   * 所以这里只做形状校验与透传（渠道返回 `{ field, label, value, options }`）。
   */
  async function channelPanelFields({ channelId, botId, key, conversationType }) {
    if (typeof channelRpc !== 'function') return { fields: [], failed: false };
    try {
      const result = await channelRpc(channelId, 'panel.fields', {
        botId, key: key ?? null, conversationType: conversationType ?? null,
      });
      if (result?.ok !== true) throw new Error(result?.error?.message ?? '读取失败');
      const fields = Array.isArray(result.value?.fields) ? result.value.fields : [];
      return {
        fields: fields.filter((item) => typeof item?.field === 'string' && item.field
          && Array.isArray(item.options) && item.options.length > 0),
        failed: false,
      };
    } catch (error) {
      // 渠道没实现这个方法（老版本渠道、或这渠道本来就没有这类设置）不算失败，别刷日志。
      if (error?.code === 'chat/unknown-method' || /不支持/.test(String(error?.message))) {
        return { fields: [], failed: false };
      }
      logger.warn?.(`[dsh-chat] 读取渠道面板字段失败：${error?.message ?? error}`);
      return { fields: [], failed: true };
    }
  }

  /**
   * 渠道自带的**动作按钮**（如飞书的「重连」）。
   *
   * 与"面板字段"的区别：字段是"选一个值存起来"，动作是"点一下做一件事"（重连、清缓存…）。
   * 同样只做形状校验与透传——hub 不认识这些动作的语义，`confirm` 文案也由渠道给
   * （飞书用卡片原生的二次确认弹窗渲染它）。
   */
  async function channelPanelActions({ channelId, botId, key, conversationType, isOwner }) {
    if (typeof channelRpc !== 'function') return { actions: [], failed: false };
    try {
      const result = await channelRpc(channelId, 'panel.actions', {
        botId, key: key ?? null, conversationType: conversationType ?? null, isOwner: isOwner === true,
      });
      if (result?.ok !== true) throw new Error(result?.error?.message ?? '读取失败');
      const actions = Array.isArray(result.value?.actions) ? result.value.actions : [];
      return { actions: actions.map(normalizeAction).filter(Boolean), failed: false };
    } catch (error) {
      // 渠道没实现这个方法（老版本渠道、或本来就没有动作）不算失败，别刷日志。
      if (error?.code === 'chat/unknown-method' || /不支持/.test(String(error?.message))) {
        return { actions: [], failed: false };
      }
      logger.warn?.(`[dsh-chat] 读取渠道面板动作失败：${error?.message ?? error}`);
      return { actions: [], failed: true };
    }
  }

  /** 渠道动作的形状归一化：认不出来就丢掉（宁可不画，也不画一个点了没反应的按钮）。 */
  function normalizeAction(input) {
    const action = typeof input?.action === 'string' ? input.action.trim() : '';
    const label = typeof input?.label === 'string' ? input.label.trim() : '';
    if (!action || !label) return null;
    const type = ['default', 'primary', 'danger'].includes(input?.type) ? input.type : 'default';
    const title = typeof input?.confirm?.title === 'string' ? input.confirm.title.trim() : '';
    const text = typeof input?.confirm?.text === 'string' ? input.confirm.text.trim() : '';
    return {
      action,
      label: label.slice(0, 40),
      type,
      // `confirm` 有值 = 点之前先让用户确认一次（危险/影响连接的动作）。
      confirm: title && text ? { title: title.slice(0, 40), text: text.slice(0, 200) } : null,
    };
  }

  /** 改渠道自带的面板字段：透传给渠道落盘，失败照旧抛可见错误。 */
  async function applyChannelField({ channelId, botId, key, conversationType, field, value }) {
    if (typeof channelRpc !== 'function') {
      throw panelError('chat/unknown-field', `面板不支持这个操作：${field}`);
    }
    const result = await channelRpc(channelId, 'panel.apply', {
      botId, key: key ?? null, conversationType: conversationType ?? null, field, value,
    });
    if (result?.ok !== true) {
      throw panelError(
        result?.error?.code ?? 'chat/channel-field-failed',
        result?.error?.message ?? `渠道没能改 ${field}。`,
      );
    }
    return {
      field,
      value: result.value?.value ?? value,
      message: result.value?.message ?? '已生效。',
    };
  }

  /** 相对时间：会话列表里"多久没动过"比绝对时间戳更好用。 */
  function sinceLabel(updatedAt) {
    if (!Number.isFinite(updatedAt)) return null;
    const minutes = Math.max(0, Math.round((Date.now() - updatedAt) / 60_000));
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    return `${Math.round(hours / 24)} 天前`;
  }

  /**
   * 这个聊天可以切过去的会话（面板上的「会话」下拉）。
   *
   * 两类候选取并集：
   * ① **同一个工作目录**的会话（跨项目的会话切过来上下文对不上）；
   * ② 这台机器人**其它聊天**绑定过的会话（用户就是想把这个聊天接回上次那个会话）。
   * 排除子代理会话与从没用过的空会话。当前会话一定在列表里——否则下拉会显示成"没选"。
   */
  async function sessionOptions({ channelId, botId, key, currentSessionId, workspace, limit = 25 }) {
    let items = [];
    try {
      const listed = await sessions.invoke('session', 'list', { _request: {} });
      items = Array.isArray(listed?.items) ? listed.items : [];
    } catch (error) {
      logger.warn?.(`[dsh-chat] 读取会话列表失败：${error?.message ?? error}`);
      // 读失败也要把"当前绑的是哪个会话"带出去：否则下拉看起来像"没绑定"，又是一句谎报。
      return {
        options: currentSessionId
          ? [{ id: currentSessionId, label: String(currentSessionId).slice(0, 12) }]
          : [],
        failed: true,
      };
    }
    /** 这台机器人**其它聊天**绑定过的会话（entries 是"会话键 → 绑定"的对象）。 */
    const bound = new Set();
    for (const [boundKey, entry] of Object.entries(sessionStore?.entries?.(channelId, botId) ?? {})) {
      if (entry?.sessionId && boundKey !== key) bound.add(entry.sessionId);
    }
    const wanted = typeof workspace === 'string' && workspace.trim() ? workspace.trim() : null;
    const usable = items.filter((item) => item?.sessionId
      && item.origin !== 'subagent'
      && item.blank !== true
      && (item.sessionId === currentSessionId
        || bound.has(item.sessionId)
        || (wanted && item.cwd === wanted)));
    const ordered = usable.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const picked = ordered.slice(0, Math.max(1, limit));
    // 当前会话必须带上（它可能排在很后面，甚至是上面那些条件之外的会话）。
    if (currentSessionId && !picked.some((item) => item.sessionId === currentSessionId)) {
      const current = items.find((item) => item.sessionId === currentSessionId);
      picked.unshift(current ?? { sessionId: currentSessionId });
    }
    return {
      options: picked.map((item) => {
        const title = typeof item.projections?.values?.title === 'string' && item.projections.values.title.trim()
          ? item.projections.values.title.trim()
          : null;
        const since = sinceLabel(item.updatedAt);
        return {
          id: item.sessionId,
          label: [title ?? item.sessionId.slice(0, 12), since].filter(Boolean).join(' · '),
        };
      }),
      failed: false,
    };
  }

  /**
   * 模型目录（模块级实现，见文件底部 `readModelCatalog`）。
   *
   * 真形状（`session/modelCatalog` 的 schema）：`{ default, routableProviders, groups:
   * [{ id, name, models: [{ id, name, reasoning?: { efforts: [{ id, name }], defaultEffort } }] }] }`
   * ——**provider 是 `group.id`**（不是 `provider`/`providerId`；照那些字段读会一个选项都拼不出来，
   * 真机上就是"当前 Host 没有可用模型"）。
   */
  async function modelCatalog() {
    return readModelCatalog(sessions, logger);
  }

  /**
   * Agent Preset 列表。
   *
   * `failed` 必须与"列表为空"分开：读失败时若也返回空列表，`apply` 的校验会落进
   * 「列表为空 → 不校验」这条放行路径，把任意 id 写进设置（fail-open），此后每次建会话
   * 都只能静默退回 Host 默认。设置页那条同字段的写入路径遇到同样情形是 fail-closed。
   */
  async function presetOptions() {
    if (typeof agentPresets?.remoteExportList !== 'function') return { options: [], failed: false };
    try {
      const rows = (await agentPresets.remoteExportList())?.presets ?? [];
      return {
        options: rows.map((row) => ({
          id: row.id, label: row.name && row.name !== row.id ? `${row.id} · ${row.name}` : row.id,
          isDefault: row.isDefault === true,
        })),
        failed: false,
      };
    } catch (error) {
      logger.warn?.(`[dsh-chat] 读取 Agent Preset 列表失败：${error?.message ?? error}`);
      return { options: [], failed: true };
    }
  }

  return Object.freeze({
    /**
     * 读一次面板状态。
     *
     * @param options - { channelId, botId, key, isOwner }。
     *   `isOwner` 决定要不要把工作区**候选清单**给出去：它来自这台机器人的所有会话绑定
     *   （含属主其它会话/私聊的绝对路径），而群聊卡片是一条**群里所有人**都能展开的消息——
     *   所以**群会话一律不给**（`key` 的 `group:` 前缀是 hub 自己的约定），
     *   属主在私聊里或设置页改工作区。
     * @returns 面板状态（只含叶子字段，可安全跨 RPC/序列化）。
     */
    async read({ channelId, botId, key, isOwner = false, conversationType = null }) {
      await settings.ready?.();
      const record = settings.read(channelId, botId) ?? {};
      const sessionId = boundSessionId(channelId, botId, key);
      const [
        catalog, presetState, selectionState, sessionState, channelFieldState, channelActionState,
      ] = await Promise.all([
        modelCatalog().catch((error) => {
          logger.warn?.(`[dsh-chat] 读取模型列表失败：${error?.message ?? error}`);
          // 整目录读失败：给这条失败一个显示名，卡片上才不会印出「· ：<原因>」这种无名行。
          return { options: [], hostDefault: null, failures: [{ id: '', name: '模型目录', message: String(error?.message ?? error) }] };
        }),
        presetOptions(),
        currentSelection(sessionId).then((selection) => ({ selection, failed: false })).catch((error) => {
          // 不能静默：退化成"跟随 Host 默认"看起来像用户从没选过模型。除日志外还要带出
          // `selectionFailed` —— 卡片据此如实说"读不到"，而不是断言一个与事实相反的状态。
          logger.warn?.(`[dsh-chat] 读取会话模型选择失败：${error?.message ?? error}`);
          return { selection: null, failed: true };
        }),
        sessionOptions({
          channelId, botId, key, currentSessionId: sessionId, workspace: record.workspace,
        }),
        channelPanelFields({ channelId, botId, key, conversationType }),
        channelPanelActions({ channelId, botId, key, conversationType, isOwner }),
      ]);
      const options = catalog.options;
      const selection = selectionState.selection;
      /** 机器人默认模型：没有会话时选模型就写它，下一条消息新建的会话应用（见 bot-model.mjs）。 */
      const botDefault = normalizeBotModel(record.model);
      /**
       * 卡片该显示"当前用的是哪个模型"：有会话就看**会话选择**（会话没显式选过 = 跟随 Host 默认，
       * 机器人默认模型只影响新建的会话）；没有会话才看机器人默认。
       * **读会话失败时不能退回默认**——那会把"读不到"显示成一个具体的模型（谎报）。
       */
      const effective = selectionState.failed
        ? null
        : (selection ?? (sessionId ? null : botDefault));
      const effectiveModel = effective
        ? options.find((item) => item.provider === effective.provider && item.model === effective.model) ?? null
        : null;
      return {
        sessionId,
        bound: typeof sessionId === 'string' && sessionId.length > 0,
        model: {
          current: selection,
          // `true` = 这次读**失败**了（不是"没选过"）：卡片必须如实说读不到。
          selectionFailed: selectionState.failed === true,
          // 机器人默认模型（没有会话时选的那个）：卡片在未绑定时显示它并允许改。
          botDefault,
          // Host 默认模型：卡片在"跟随 Host 默认"时把具体是哪个模型写出来，用户才知道会用什么。
          hostDefault: catalog.hostDefault,
          failures: catalog.failures ?? [],
          options,
          // 推理等级取决于"当前生效的那个模型"：会话内的选择，或（没有会话时）机器人默认。
          efforts: effectiveModel?.efforts ?? [],
          currentEffort: effective?.reasoningEffort ?? null,
        },
        /**
         * 本会话的上下文增强（用哪一份设置）：只给属主，且只在认得出会话键时给。
         * 内容（来源字段 / 提示词）在设置页编辑，卡片只决定"本会话用哪一份"。
         */
        context: contextPanelState({ record, key, isOwner }),
        // 渠道自带的面板字段（飞书：任务过程展示）。渠道没实现就是空数组。
        fields: channelFieldState.fields,
        fieldsFailed: channelFieldState.failed === true,
        // 渠道自带的动作按钮（飞书：重连）。渠道没实现就是空数组。
        actions: channelActionState.actions,
        actionsFailed: channelActionState.failed === true,
        // 「会话」下拉：当前聊天绑定到哪个会话、可以切到哪些。
        session: {
          current: sessionId,
          options: sessionState.options,
          failed: sessionState.failed === true,
        },
        preset: {
          current: record.agentPreset ?? null,
          options: presetState.options,
          // 读不到列表时卡片要如实说明（否则用户看到的是"一个预设都没有"，与事实相反）。
          failed: presetState.failed === true,
        },
        workspace: {
          current: record.workspace ?? null,
          /**
           * 候选清单里有属主其它会话的绝对路径：**只给属主，且只在私聊**。
           *
           * 只判 isOwner 不够：属主在群里发 `/menu` 时 `isOwner` 为真，可卡是发到群里的，
           * 任何群成员展开下拉都能读到这些路径。拿不准的渠道（键不是 `group:` 前缀）按私聊算，
           * 但那时 `isOwner` 必须为真。
           */
          options: isOwner === true && !String(key ?? '').startsWith('group:')
            ? workspaceCandidates({ record, sessionStore, channelId, botId })
            : [],
        },
      };
    },

    /**
     * 执行一个**渠道动作**（面板上的按钮，如飞书的「重连」）。
     *
     * 与 `apply` 分开：动作没有"值"，而且大多是机器人级操作（重连会断掉当前长连接）——
     * 渠道自己按 `isOwner` 判定能不能点，hub 只负责透传与把错误抛成可见的 code。
     *
     * @param options - { channelId, botId, key, action, isOwner, conversationType }。
     * @returns `{ action, message }`。
     */
    async act({ channelId, botId, key, action, isOwner = false, conversationType = null }) {
      if (typeof action !== 'string' || !action.trim()) {
        throw panelError('chat/bad-request', 'act 需要 action。');
      }
      if (typeof channelRpc !== 'function') {
        throw panelError('chat/unknown-action', `这个部署不支持渠道动作：${action}`);
      }
      const result = await channelRpc(channelId, 'panel.act', {
        botId, key: key ?? null, conversationType: conversationType ?? null,
        action: action.trim(), isOwner: isOwner === true,
      });
      if (result?.ok !== true) {
        throw panelError(result?.error?.code ?? 'chat/action-failed',
          result?.error?.message ?? `动作「${action}」没执行成功。`);
      }
      return { action: action.trim(), message: result.value?.message ?? '已执行。' };
    },

    /**
     * 应用一个选择。
     *
     * @param options - { channelId, botId, key, field, value, isOwner }。
     *   field ∈ model | reasoning | preset | workspace | session。
     *   `isOwner` 由渠道判定后传入：**机器人级**字段（preset / workspace）只限属主——
     *   它们改的是整台机器人的设置，且工作区候选来自这台机器人的**所有**会话
     *   （含属主其他会话的绝对路径）。命令门禁放行的普通成员不该能改。
     * @returns `{ field, value, message }`：`message` 是给用户看的结果说明。
     */
    async apply({ channelId, botId, key, field, value, isOwner = false, conversationType = null }) {
      await settings.ready?.();
      const record = settings.read(channelId, botId) ?? {};
      const sessionId = boundSessionId(channelId, botId, key);

      /**
       * 模型与推理：有会话时改**会话**（立即生效）；没有会话时改**机器人默认模型**
       * （只对下一条消息新建的会话生效）——DSH 不允许给"还不存在的会话"选模型
       * （`session/create` 没有模型参数），所以未绑定时的落点就是机器人设置。
       */
      const botDefault = normalizeBotModel(record.model);
      /**
       * 本会话的上下文增强：改的是**机器人级配置**（`record.contextEnhancement`），
       * 与设置页同一份数据——所以只限属主，和预设/工作区同一条口径。
       */
      if (field === 'context') {
        if (isOwner !== true) {
          throw panelError('chat/owner-only', '上下文增强是机器人级设置，只有属主能改。');
        }
        return applyContextScope({
          channelId, botId, key, value, record, field,
        });
      }

      // 渠道自带字段：交给渠道自己落盘（hub 不认识过程展示之类的语义）。
      if (!BUILT_IN_FIELDS.has(field)) {
        return applyChannelField({
          channelId, botId, key, conversationType, field, value,
        });
      }

      if (field === 'model' || field === 'reasoning') {
        if (!sessionId) {
          // 未绑定 = 改机器人级设置：与预设/工作区同一条口径，只限属主。
          if (isOwner !== true) {
            throw panelError('chat/owner-only',
              '还没有会话：这里改的是机器人默认模型（机器人级设置），只有属主能改。');
          }
          const { options } = await modelCatalog();
          if (field === 'model') {
            const target = options.find((item) => item.value === value);
            if (!target) throw panelError('chat/unknown-model', `找不到模型 ${value}。`);
            const next = botModelForSelection(botDefault, { provider: target.provider, model: target.model });
            await settings.write(channelId, botId, { model: next });
            return {
              field,
              value: target.value,
              message: `机器人默认模型已设为 ${next.provider}/${next.model}`
                + `${next.reasoningEffort ? ` · 推理 ${next.reasoningEffort}` : ''}`
                + '（还没有会话：下一条消息新建的会话用它）。',
            };
          }
          if (!botDefault) {
            throw panelError('chat/no-model', '还没有选过模型：先选一个机器人默认模型，再改推理等级。');
          }
          const currentModel = options.find((item) => item.provider === botDefault.provider
            && item.model === botDefault.model);
          if (!currentModel) {
            throw panelError('chat/unknown-model',
              `机器人默认模型 ${botDefault.provider}/${botDefault.model} 不在可用列表里。`);
          }
          const wanted = String(value ?? '');
          if (wanted !== '' && !currentModel.efforts.some((effort) => effort.id === wanted)) {
            throw panelError('chat/unknown-effort',
              `模型 ${currentModel.value} 不支持推理等级 ${wanted}。`);
          }
          const next = { ...botDefault, reasoningEffort: wanted || null };
          await settings.write(channelId, botId, { model: next });
          return {
            field,
            value: wanted,
            message: wanted
              ? `机器人默认推理等级已设为 ${wanted}（下一条消息新建的会话用它）。`
              : '机器人默认推理等级已恢复模型默认（下一条消息新建的会话用它）。',
          };
        }
        const { options } = await modelCatalog();
        if (field === 'model') {
          const target = options.find((item) => item.value === value);
          if (!target) throw panelError('chat/unknown-model', `找不到模型 ${value}。`);
          const selected = await sessions.invoke('session', 'selectModel', {
            request: { sessionId, provider: target.provider, model: target.model },
          });
          const now = selected?.selected ?? {};
          return {
            field,
            value: target.value,
            message: `已切换模型为 ${now.provider ?? target.provider}/${now.model ?? target.model}。`,
          };
        }
        // reasoning：必须已经显式选过模型，否则"推理等级"没有落点。
        const selection = await currentSelection(sessionId).catch((error) => {
          // 读不到 ≠ 没选过：混为一谈会把一次 RPC 失败说成"你从没选过模型"。
          throw panelError('chat/model-selection-unavailable',
            `读不到当前会话的模型选择：${error?.message ?? error}`);
        });
        if (!selection) {
          throw panelError('chat/no-model', '当前会话还没有显式选择模型，先选一个模型再改推理等级。');
        }
        const currentModel = options.find((item) => item.provider === selection.provider
          && item.model === selection.model);
        if (!currentModel) throw panelError('chat/unknown-model', `当前模型 ${selection.provider}/${selection.model} 不在可用列表里。`);
        const wanted = String(value ?? '');
        if (wanted !== '' && !currentModel.efforts.some((effort) => effort.id === wanted)) {
          throw panelError('chat/unknown-effort',
            `模型 ${currentModel.value} 不支持推理等级 ${wanted}。`);
        }
        const selected = await sessions.invoke('session', 'selectModel', {
          request: {
            sessionId,
            provider: selection.provider,
            model: selection.model,
            ...(wanted ? { reasoningEffort: wanted } : {}),
          },
        });
        const now = selected?.selected ?? {};
        return {
          field,
          value: wanted,
          message: wanted
            ? `推理等级已设为 ${now.reasoningEffort ?? wanted}。`
            : '推理等级已恢复模型默认。',
        };
      }

      /**
       * 机器人级字段只限属主。
       *
       * 与设置页同一条口径（`bot.agent-preset.set` / 工作区那条都是属主专属），
       * 否则在 open + 可执行命令的策略下，任何能聊天的成员都能把工作区改到
       * 属主其它项目的目录里——改完 `/new` 再发一条消息，agent 就在那里起会话。
       */
      if ((field === 'preset' || field === 'workspace') && isOwner !== true) {
        throw panelError('chat/owner-only', '工作区与 Agent 预设是机器人级设置，只有属主能改。');
      }

      if (field === 'preset') {
        const target = typeof value === 'string' && value.trim() ? value.trim() : null;
        if (target) {
          const { options: presets, failed } = await presetOptions();
          // 读失败 = 无法对账，不能当成"没有预设"放行（设置页那条路是 fail-closed）。
          if (failed) throw panelError('chat/preset-unavailable', '读不到 Agent Preset 列表，请稍后再试。');
          if (presets.length > 0 && !presets.some((item) => item.id === target)) {
            throw panelError('chat/unknown-preset', `当前 Host 没有这个 Agent Preset：${target}`);
          }
        }
        await settings.write(channelId, botId, { agentPreset: target });
        return {
          field,
          value: target,
          message: target
            ? `Agent Preset 已设为 ${target}（只对新会话生效：先发 /new 再发消息）。`
            : 'Agent Preset 已改为跟随 Host 默认（只对新会话生效）。',
        };
      }

      if (field === 'workspace') {
        const target = await validateWorkspacePath(value);
        await settings.write(channelId, botId, { workspace: target });
        return {
          field,
          value: target,
          message: `工作区已设为 ${target}（只对新会话生效：先发 /new 再发消息）。`,
        };
      }

      if (field === 'session') {
        // 空串也当"新会话"：下拉里的哨兵值翻译回来就是空串（面板的语义是"清掉绑定"）。
        if (value === 'new' || value === '' || value === null || value === undefined) {
          await sessions.reset({ channelId, botId, key });
          return { field, value: 'new', message: '已解除当前会话绑定，下一条消息将开启新会话。' };
        }
        const target = String(value);
        // `sessionExists` 只把 not-found 折成 false，其余是真失败（DSH 侧不可用/超时）：
        // 压成 false 会让用户拿到"找不到会话"，而真正的原因卡片和日志里都没有。
        const exists = await sessions.sessionExists(target).catch((error) => {
          throw panelError('chat/session-check-failed', `校验会话失败：${error?.message ?? error}`);
        });
        if (!exists) throw panelError('chat/unknown-session', `找不到会话 ${target}。`);
        await sessions.bindings.bind(channelId, botId, key, { sessionId: target });
        return { field, value: target, message: `已切换到会话 ${target}。` };
      }

      throw panelError('chat/unknown-field', `面板不支持这个操作：${field}`);
    },
  });
}
