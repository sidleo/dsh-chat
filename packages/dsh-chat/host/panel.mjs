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
    async read({ channelId, botId, key, isOwner = false }) {
      await settings.ready?.();
      const record = settings.read(channelId, botId) ?? {};
      const sessionId = boundSessionId(channelId, botId, key);
      const [catalog, presetState, selection] = await Promise.all([
        modelCatalog().catch((error) => {
          logger.warn?.(`[dsh-chat] 读取模型列表失败：${error?.message ?? error}`);
          // 整目录读失败：给这条失败一个显示名，卡片上才不会印出「· ：<原因>」这种无名行。
          return { options: [], hostDefault: null, failures: [{ id: '', name: '模型目录', message: String(error?.message ?? error) }] };
        }),
        presetOptions(),
        currentSelection(sessionId).catch((error) => {
          // 不能静默：读不到就退化成"跟随 Host 默认"，看起来像用户从没选过模型。
          logger.warn?.(`[dsh-chat] 读取会话模型选择失败：${error?.message ?? error}`);
          return null;
        }),
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
          failures: catalog.failures ?? [],
          options,
          // 推理等级取决于当前模型：没显式选模型时给不出可选项（卡片要如实说明）。
          efforts: currentModel?.efforts ?? [],
          currentEffort: selection?.reasoningEffort ?? null,
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
     * 应用一个选择。
     *
     * @param options - { channelId, botId, key, field, value, isOwner }。
     *   field ∈ model | reasoning | preset | workspace | session。
     *   `isOwner` 由渠道判定后传入：**机器人级**字段（preset / workspace）只限属主——
     *   它们改的是整台机器人的设置，且工作区候选来自这台机器人的**所有**会话
     *   （含属主其他会话的绝对路径）。命令门禁放行的普通成员不该能改。
     * @returns `{ field, value, message }`：`message` 是给用户看的结果说明。
     */
    async apply({ channelId, botId, key, field, value, isOwner = false }) {
      await settings.ready?.();
      const record = settings.read(channelId, botId) ?? {};
      const sessionId = boundSessionId(channelId, botId, key);

      if (field === 'model' || field === 'reasoning') {
        if (!sessionId) {
          // 措辞要与实际行为一致：「新会话」只清绑定，会话要等第一条消息才建立。
          throw panelError('chat/no-session',
            '当前聊天还没有会话：先发一条消息建立会话，然后就能选（「新会话」只是清掉绑定）。');
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
        if (value === 'new' || value === null || value === undefined) {
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
