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
  /**
   * 当前项必须在可见列表里：否则下拉看起来"什么都没选"（`initial_index` 只能是 0）。
   * 命令清单那次教训是静默丢内容，这里同理——超出的数量交给调用方写在卡上。
   */
  if (current && !visible.some((item) => item.value === current)) {
    const found = items.find((item) => item.value === current);
    if (found) visible.push(found);
  }
  const hidden = Math.max(0, items.length - visible.length);
  const list = visible.map((item) => ({
    text: { tag: 'plain_text', content: mark(current, item.value, item.label).slice(0, 100) },
    value: h(item.value),
  }));
  if (list.length === 0) return { element: null, hidden: 0 };
  const index = visible.findIndex((item) => item.value === current);
  const element = {
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
  return { element, hidden };
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
  if (modelPicker.element && bound) {
    elements.push(modelPicker.element);
  } else if (!bound) {
    // 别写成"点新会话就能选模型"：「新会话」只清绑定，会话要等第一条消息才由 ensure() 建立。
    elements.push({
      tag: 'markdown',
      content: '还没有会话：**发一条消息**就会建立会话，之后就能在这里选模型。'
        + '（「🆕 新会话」只是清掉当前绑定，点完仍要发一条消息。）',
    });
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

  if (bound && modelPicker.hidden > 0) {
    elements.push({
      tag: 'markdown',
      content: `模型下拉只列了前 ${MAX_OPTIONS} 个（还有 ${modelPicker.hidden} 个没列出），也可以手打 \`/model <provider/model>\`。`,
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
    if (effortPicker.element) elements.push(effortPicker.element);
  } else if (bound && current) {
    /**
     * 空 `efforts` 有两种成因，措辞不能混：① 这个模型确实没有推理等级；
     * ② 读不到模型目录（或当前模型不在目录里）。说成①是与事实相反的断言——
     * 同一张卡上面还列着 provider 读取失败的原因。
     */
    const catalogFailures = Array.isArray(model.failures) ? model.failures : [];
    const listed = (model.options ?? []).some(
      (item) => item.provider === current.provider && item.model === current.model,
    );
    elements.push({
      tag: 'markdown',
      content: catalogFailures.length > 0 || !listed
        ? '读不到模型目录，暂时列不出可选推理等级（可以手打 `/reasoning <等级>`）。'
        : '当前模型不支持调节推理等级。',
    });
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
  if (presetPicker.element) elements.push(presetPicker.element);
  if (state?.preset?.failed === true) {
    elements.push({ tag: 'markdown', content: '读不到 Agent Preset 列表，暂时只能跟随 Host 默认。' });
  }
  if (presetPicker.hidden > 0) {
    elements.push({
      tag: 'markdown',
      content: `预设下拉只列了前 ${MAX_OPTIONS} 个（还有 ${presetPicker.hidden} 个没列出），也可以手打 \`/preset <id>\`。`,
    });
  }
  const workspacePicker = dropdown({
    name: 'workspace_pick',
    action: 'workspace_pick',
    placeholder: '选择工作区',
    items: (state?.workspace?.options ?? []).map((path) => ({ value: path, label: path })),
    current: state?.workspace?.current ?? null,
  });
  if (workspacePicker.element) {
    elements.push(workspacePicker.element);
    if (workspacePicker.hidden > 0) {
      // 工作区没有命令兜底：只能在设置页改，所以这里要指路。
      elements.push({
        tag: 'markdown',
        content: `工作区下拉只列了前 ${MAX_OPTIONS} 个（还有 ${workspacePicker.hidden} 个没列出），其余的在设置页里选。`,
      });
    }
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
 * @returns `{ field, value, label }`；不是面板下拉时返回 null；
 *   **取值没认出来**时返回 `{ field, label, invalid: true }`——绝不能把它当成"恢复默认"，
 *   否则用户点一下推理等级就把等级静默清掉、点一下预设就把预设静默清掉，卡上还画 ✅。
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
  // 归一化后是数组；也容忍调用方直接给单个字符串。
  const values = (Array.isArray(options) ? options : [options])
    .filter((item) => typeof item === 'string' && item !== '');
  // 空取值 = 没认出来（不是"恢复默认"）：交回调用方报错，别静默清状态。
  if (values.length === 0) return { field: target.field, label: target.label, invalid: true };
  const picked = values[0];
  // 哨兵 → 空串：hub 侧的空值语义是"恢复默认/清除"（这个才是用户明确选的）。
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
