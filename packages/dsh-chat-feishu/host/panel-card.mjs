/**
 * 控制面板卡片（飞书）：把 hub 的 `panel.read()` 状态渲染成**可交互卡片**。
 *
 * 为什么要有它（真机反馈）：以前的 `/menu` 只是一堆命令按钮——点一下等于替你打一条命令，
 * 想换模型还得先点 `/model`、再看列表、再手打 `provider/model`。这里改成真控件：
 * 下拉里直接选，选完 `behaviors.callback` 立刻回调、hub 应用、**同一张卡片就地刷新**。
 *
 * 组件依据（Card 2.0）：
 * - `select_static` + `behaviors: [{ type: 'callback', value: { action } }]`：选中即回调，
 *   选中值在 `action.option`（`lark-gateway` 归一化成 `action.options`）；
 * - `initial_index` 指到当前值（有 `✓` 前缀），用户一眼看到现在是什么。
 *
 * 只做渲染，不做判定：能不能改、改完是什么结果，全由 hub 的 `panel.apply` 说了算。
 *
 * @module dsh-chat-feishu/host/panel-card
 */

/** 下拉最多列多少个选项（模型可能几十个，卡片放不下）。 */
const MAX_OPTIONS = 30;

/**
 * "恢复默认"在下拉里的哨兵值。
 *
 * 不能用空串：飞书对 `value: ''` 的选项不可靠（dsh-im 用的是同样的哨兵做法）；
 * 哨兵在 `panelPick` 里翻译回 `''`（= hub 侧"默认/清除"的语义）。
 */
const FOLLOW_DEFAULT = '__default__';

const h = (value) => String(value ?? '');

function mark(current, value, label) {
  return `${current === value ? '✓ ' : ''}${label}`;
}

/**
 * 构造一个下拉元素。
 *
 * @param options - { name, action, placeholder, items, current }。
 * @returns select_static 元素；`items` 为空时返回 null（调用方改用说明行）。
 */
function dropdown({ name, action, placeholder, items, current }) {
  const visible = items.slice(0, MAX_OPTIONS);
  const list = visible.map((item) => ({
    text: { tag: 'plain_text', content: mark(current, item.value, item.label).slice(0, 100) },
    value: h(item.value),
  }));
  if (list.length === 0) return null;
  const index = visible.findIndex((item) => item.value === current);
  return {
    tag: 'select_static',
    name,
    placeholder: { tag: 'plain_text', content: placeholder },
    /**
     * 预选当前值。两个真机坑（dsh-im 记下来的）：
     * - `initial_index` 是 **1 起**（0 = 不预选），写成 0 起的下标就会选错一项；
     * - `options` 上**不能**写 `selected`/`selected_index`，会直接报 230099 解析错误。
     */
    initial_index: index >= 0 ? index + 1 : 0,
    options: list,
    behaviors: [{ type: 'callback', value: { action } }],
  };
}

function button(label, action, type = 'default') {
  return {
    tag: 'button',
    type,
    width: 'fill',
    text: { tag: 'plain_text', content: label },
    behaviors: [{ type: 'callback', value: { dsh_panel: action } }],
  };
}

function row(elements) {
  return { tag: 'column_set', flex_mode: 'none', columns: elements.map((el) => ({ tag: 'column', width: 'weighted', weight: 1, elements: [el] })) };
}

/**
 * 渲染控制面板卡片。
 *
 * @param state - hub `panel.read()` 的返回值。
 * @param options - { last, at }：`last` 是上一次动作的结果 `{ label, message, ok }`（失败也要留在卡上）；
 *   `at` 是本次渲染的时间（HH:MM:SS），写进标题栏——聊天里可能躺着不止一张面板卡
 *   （旧卡、重启前的卡），**标题上的时间就是"哪张是最新的"最直接的判据**。
 * @returns Card 2.0 对象。
 */
export function panelCard(state, { last = null, at = null } = {}) {
  const elements = [];
  const bound = state?.bound === true;
  const model = state?.model ?? {};
  const current = model.current ?? null;
  const hostDefault = model.hostDefault ?? null;

  // ① 当前状态
  elements.push({
    tag: 'markdown',
    content: [
      `**当前会话**　${bound ? `\`${h(state.sessionId)}\`` : '未绑定（下一条消息会新建）'}`,
      `**模型**　${current
        ? `${h(current.provider)}/${h(current.model)}${current.reasoningEffort ? ` · 推理 ${h(current.reasoningEffort)}` : ''}`
        : (hostDefault ? `跟随 Host 默认（${h(hostDefault.provider)}/${h(hostDefault.model)}）` : '跟随 Host 默认')}`,
      `**Agent 预设**　${state?.preset?.current ? `\`${h(state.preset.current)}\`` : '跟随 Host 默认'}`,
      `**工作区**　${state?.workspace?.current ? `\`${h(state.workspace.current)}\`` : '未设置（用默认目录）'}`,
    ].join('\n'),
  });
  elements.push({ tag: 'hr' });

  // ② 模型 + 推理等级（会话级：立即生效）
  elements.push({ tag: 'markdown', content: '**模型与推理**（立即生效，只影响当前会话）' });
  const modelPicker = dropdown({
    name: 'model_pick',
    action: 'model_pick',
    placeholder: bound ? '选择模型' : '先发一条消息（还没有会话）',
    items: (model.options ?? []).map((item) => ({ value: item.value, label: item.value })),
    current: current ? `${current.provider}/${current.model}` : null,
  });
  if (modelPicker && bound) {
    elements.push(modelPicker);
  } else if (!bound) {
    elements.push({ tag: 'markdown', content: '还没有会话：先在这里发一条消息，或点下面的「🆕 新会话」，之后就能选模型。' });
  } else {
    // 空目录要说清"为什么空"：`session/modelCatalog` 会把每个失败 provider 的原因带出来。
    // 不带出来，用户和排查者就只剩一句"没有可用模型"——唯一的线索被丢在 RPC 边界上。
    const failures = Array.isArray(model.failures) ? model.failures : [];
    elements.push({
      tag: 'markdown',
      content: failures.length > 0
        ? `当前没有可用模型，以下 provider 读取失败：${failures
          .map((item) => `\n· ${h(item.id || item.name)}：${h(String(item.message).slice(0, 120))}`)
          .join('')}`
        : '当前 Host 没有可用模型。',
    });
  }

  const efforts = model.efforts ?? [];
  if (bound && current && efforts.length > 0) {
    const effortPicker = dropdown({
      name: 'reasoning_pick',
      action: 'reasoning_pick',
      placeholder: '选择推理等级',
      items: [
        { value: FOLLOW_DEFAULT, label: '（模型默认）' },
        ...efforts.map((effort) => ({ value: effort.id, label: `${effort.id}${effort.label && effort.label !== effort.id ? ` · ${effort.label}` : ''}` })),
      ],
      current: model.currentEffort ?? FOLLOW_DEFAULT,
    });
    if (effortPicker) elements.push(effortPicker);
  } else if (bound && current) {
    elements.push({ tag: 'markdown', content: '当前模型不支持调节推理等级。' });
  } else if (bound) {
    elements.push({ tag: 'markdown', content: '先选一个模型，才能调推理等级。' });
  }

  // ③ 预设 + 工作区（机器人级：只对新会话生效）
  elements.push({ tag: 'hr' });
  elements.push({ tag: 'markdown', content: '**Agent 预设与工作区**（只对新会话生效：改完发 `/new` 再说话）' });
  const presetPicker = dropdown({
    name: 'preset_pick',
    action: 'preset_pick',
    placeholder: '选择 Agent 预设',
    items: [
      { value: FOLLOW_DEFAULT, label: '跟随 Host 默认' },
      ...(state?.preset?.options ?? []).map((item) => ({ value: item.id, label: item.id })),
    ],
    current: state?.preset?.current ?? FOLLOW_DEFAULT,
  });
  if (presetPicker) elements.push(presetPicker);
  const workspacePicker = dropdown({
    name: 'workspace_pick',
    action: 'workspace_pick',
    placeholder: '选择工作区',
    items: (state?.workspace?.options ?? []).map((path) => ({ value: path, label: path })),
    current: state?.workspace?.current ?? null,
  });
  if (workspacePicker) {
    elements.push(workspacePicker);
  } else {
    elements.push({ tag: 'markdown', content: '还没有可切换的工作区：先在设置页设一次，或换一台机器人。' });
  }

  /**
   * ④ 上一次动作的结果（成功与失败都留在卡上：toast 会消失，卡不会）。
   *
   * 带一个 HH:MM:SS 时间戳：卡上"到底停在哪一次更新"是可核对的
   * （排查卡片被回滚这类问题时，这就是卡上的现场）。
   */
  if (last?.message) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'markdown',
      content: `${last.ok === false ? '❌' : '✅'} **${h(last.label)}**`
        + `${last.at ? `（${h(last.at)}）` : ''}\n${h(last.message)}`,
    });
  }

  // ⑤ 操作按钮 + 数字兜底说明
  elements.push({ tag: 'hr' });
  elements.push(row([
    button('🆕 新会话', 'new'),
    button('📊 状态', 'status'),
    button('📖 命令清单', 'commands'),
    button('⏹ 停止', 'stop', 'danger'),
  ]));
  elements.push({
    tag: 'markdown',
    content: '不便点下拉时也可以手打：`/model`、`/reasoning`、`/preset`、`/new`、`/status`。',
  });

  return {
    schema: '2.0',
    config: { update_multi: true, width_mode: 'default' },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: `机器人控制面板${at ? ` · ${at}` : ''}` },
    },
    body: { direction: 'vertical', elements },
  };
}

/**
 * 下拉回调 → 面板动作。
 *
 * 回调里的 action 名是 `model_pick` / `reasoning_pick` / `preset_pick` / `workspace_pick`，
 * 选中值在 `event.action.options[0]`（网关已把三种形态归一化）。
 *
 * @param action - `event.action.value.action`。
 * @param options - `event.action.options`。
 * @returns `{ field, value, label }`；不是面板下拉时返回 null。
 */
export function panelPick(action, options) {
  const map = {
    model_pick: { field: 'model', label: '切换模型' },
    reasoning_pick: { field: 'reasoning', label: '设置推理等级' },
    preset_pick: { field: 'preset', label: '设置 Agent 预设' },
    workspace_pick: { field: 'workspace', label: '切换工作区' },
  };
  const target = map[action];
  if (!target) return null;
  const picked = Array.isArray(options) ? (options[0] ?? '') : '';
  // 哨兵 → 空串：hub 侧的空值语义是"恢复默认/清除"。
  const value = picked === FOLLOW_DEFAULT ? '' : String(picked);
  return { field: target.field, value, label: target.label };
}

/** 面板按钮 → 动作：新会话 / 状态 / 命令清单 / 停止 / 回到面板。 */
export function panelButton(action) {
  const map = {
    new: { field: 'session', value: 'new', label: '新会话' },
    status: { command: '/status', label: '状态' },
    // 命令清单是另一张卡（命令按钮），卡上有「⬅ 返回控制面板」。
    commands: { menu: true, label: '命令清单' },
    stop: { command: '/stop', label: '停止' },
    // 命令清单卡上的返回按钮。
    panel: { panel: true, label: '控制面板' },
  };
  return map[action] ?? null;
}
