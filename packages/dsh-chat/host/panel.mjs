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
 * 校验一个工作区路径：必须是已存在的目录，且存绝对路径。
 *
 * @param raw - 用户/卡片给的值。
 * @returns 绝对路径。
 */
export async function validateWorkspacePath(raw) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw panelError('chat/workspace-invalid', '工作区需要是一个绝对路径。');
  }
  const target = isAbsolute(raw.trim()) ? resolvePath(raw.trim()) : resolvePath(raw.trim());
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
  settings, sessions, sessionStore = null, agentPresets = null, logger = console,
} = {}) {
  if (typeof settings?.read !== 'function') throw new TypeError('控制面板需要每机器人设置存储。');
  if (typeof sessions?.invoke !== 'function') throw new TypeError('控制面板需要会话桥。');

  function boundSessionId(channelId, botId, key) {
    return sessions.bindings?.get?.(channelId, botId, key)?.sessionId ?? null;
  }

  /**
   * 当前会话的模型选择。
   *
   * 真形状是 `projections.values.modelSelection = { lastUsed, next }`（**不是**顶层
   * provider/model——照顶层读会永远返回"没选过"，真机上表现为卡片总是"跟随 Host 默认"）。
   * `next` 是排队中的下一次选择，优先用 `lastUsed` 更贴近"现在是什么"。
   */
  async function currentSelection(sessionId) {
    if (!sessionId) return null;
    const listed = await sessions.invoke('session', 'list', { _request: {} }).catch(() => null);
    const item = listed?.items?.find((entry) => entry.sessionId === sessionId);
    const projection = item?.projections?.values?.modelSelection;
    const selection = projection?.lastUsed ?? projection?.next ?? null;
    if (!selection?.provider || !selection?.model) return null;
    return {
      provider: selection.provider,
      model: selection.model,
      reasoningEffort: selection.reasoningEffort ?? null,
    };
  }

  /**
   * 模型目录。
   *
   * 真形状（`session/modelCatalog` 的 schema）：`{ default, routableProviders, groups:
   * [{ id, name, models: [{ id, name, reasoning?: { efforts: [{ id, name }], defaultEffort } }] }] }`
   * ——**provider 是 `group.id`**（不是 `provider`/`providerId`；照那些字段读会一个选项都拼不出来，
   * 真机上就是"当前 Host 没有可用模型"）。
   */
  async function modelCatalog() {
    const catalog = await sessions.invoke('session', 'modelCatalog', {});
    const options = [];
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
    return { options, hostDefault: catalog?.default ?? null };
  }

  async function presetOptions() {
    if (typeof agentPresets?.remoteExportList !== 'function') return [];
    try {
      const rows = (await agentPresets.remoteExportList())?.presets ?? [];
      return rows.map((row) => ({
        id: row.id, label: row.name && row.name !== row.id ? `${row.id} · ${row.name}` : row.id,
        isDefault: row.isDefault === true,
      }));
    } catch (error) {
      logger.warn?.(`[dsh-chat] 读取 Agent Preset 列表失败：${error?.message ?? error}`);
      return [];
    }
  }

  return Object.freeze({
    /**
     * 读一次面板状态。
     *
     * @param options - { channelId, botId, key }。
     * @returns 面板状态（只含叶子字段，可安全跨 RPC/序列化）。
     */
    async read({ channelId, botId, key }) {
      await settings.ready?.();
      const record = settings.read(channelId, botId) ?? {};
      const sessionId = boundSessionId(channelId, botId, key);
      const [catalog, presets, selection] = await Promise.all([
        modelCatalog().catch((error) => {
          logger.warn?.(`[dsh-chat] 读取模型列表失败：${error?.message ?? error}`);
          return { options: [], hostDefault: null };
        }),
        presetOptions(),
        currentSelection(sessionId).catch(() => null),
      ]);
      const options = catalog.options;
      const currentModel = selection
        ? options.find((item) => item.provider === selection.provider && item.model === selection.model) ?? null
        : null;
      return {
        sessionId,
        bound: typeof sessionId === 'string' && sessionId.length > 0,
        model: {
          current: selection,
          // Host 默认模型：卡片在"跟随 Host 默认"时把具体是哪个模型写出来，用户才知道会用什么。
          hostDefault: catalog.hostDefault,
          options,
          // 推理等级取决于当前模型：没显式选模型时给不出可选项（卡片要如实说明）。
          efforts: currentModel?.efforts ?? [],
          currentEffort: selection?.reasoningEffort ?? null,
        },
        preset: {
          current: record.agentPreset ?? null,
          options: presets,
        },
        workspace: {
          current: record.workspace ?? null,
          options: workspaceCandidates({ record, sessionStore, channelId, botId }),
        },
      };
    },

    /**
     * 应用一个选择。
     *
     * @param options - { channelId, botId, key, field, value }。
     *   field ∈ model | reasoning | preset | workspace | session。
     * @returns `{ field, value, message }`：`message` 是给用户看的结果说明。
     */
    async apply({ channelId, botId, key, field, value }) {
      await settings.ready?.();
      const record = settings.read(channelId, botId) ?? {};
      const sessionId = boundSessionId(channelId, botId, key);

      if (field === 'model' || field === 'reasoning') {
        if (!sessionId) {
          throw panelError('chat/no-session',
            '当前聊天还没有会话：先发一条消息，或点「新会话」之后再选。');
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
        const selection = await currentSelection(sessionId);
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

      if (field === 'preset') {
        const target = typeof value === 'string' && value.trim() ? value.trim() : null;
        if (target) {
          const presets = await presetOptions();
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
        if (value === 'new' || value === null || value === undefined) {
          await sessions.reset({ channelId, botId, key });
          return { field, value: 'new', message: '已解除当前会话绑定，下一条消息将开启新会话。' };
        }
        const target = String(value);
        const exists = await sessions.sessionExists(target).catch(() => false);
        if (!exists) throw panelError('chat/unknown-session', `找不到会话 ${target}。`);
        await sessions.bindings.bind(channelId, botId, key, { sessionId: target });
        return { field, value: target, message: `已切换到会话 ${target}。` };
      }

      throw panelError('chat/unknown-field', `面板不支持这个操作：${field}`);
    },
  });
}
