/**
 * 机器人级默认模型（每机器人设置里的 `model` 字段）。
 *
 * **为什么需要这一层**：DSH 的模型选择是**会话级**的——
 * `session/selectModel` 必须带 `sessionId`，而 `session/create` 的参数里没有模型
 * （`{ workspaceId?, cwd?, sessionId?, agentPreset? }`）。会话又是"用户发第一条消息"时才建的，
 * 所以"还没有会话时想先挑好模型"原本无处可写，只能让用户先随便发一条消息。
 *
 * 于是把它存成**机器人默认模型**，由 `sessions.ensure()` 在新建会话后立刻 `selectModel` 应用
 * ——与 Agent 预设、工作区同一条口径：**只对新会话生效**。
 *
 * 形状统一为 `{ provider, model, reasoningEffort }`；兼容旧 dsh-im `models.json` 的
 * `{ providerId, modelId }`（历史上被原样导入到 `record.model`，从来没被读过）。
 */

/** @returns `{ provider, model, reasoningEffort }` 或 null（残缺的旧数据一律当作没配）。 */
export function normalizeBotModel(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const pick = (...values) => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  };
  const provider = pick(raw.provider, raw.providerId);
  const model = pick(raw.model, raw.modelId);
  // 两者缺一不可：只有一半的历史配置用起来只会在建会话时炸，按"没配"处理更保守。
  if (!provider || !model) return null;
  return { provider, model, reasoningEffort: pick(raw.reasoningEffort, raw.effort) };
}

/**
 * 把一次模型选择写成机器人默认。
 *
 * 同一个模型时保留原来的推理等级（改模型不该顺手把等级清掉）；换模型时重置为"模型默认"，
 * 因为等级是模型自己的能力，跨模型沿用会给出一个当前模型不支持的等级。
 */
export function botModelForSelection(previous, { provider, model, reasoningEffort = null }) {
  const same = previous?.provider === provider && previous?.model === model;
  return {
    provider,
    model,
    reasoningEffort: same ? (previous?.reasoningEffort ?? null) : (reasoningEffort ?? null),
  };
}

/** 给用户看的一行描述（`P/M` 或 `P/M · 推理 x`）。 */
export function describeBotModel(value) {
  const normalized = normalizeBotModel(value);
  if (!normalized) return null;
  return `${normalized.provider}/${normalized.model}`
    + `${normalized.reasoningEffort ? ` · 推理 ${normalized.reasoningEffort}` : ''}`;
}
