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
    // 放在 column 里时按列宽撑满（默认宽度会缩成内容宽，半栏看起来会挤成一团）。
    width: 'fill',
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

/**
 * 缩短路径用于下拉展示。
 *
 * 飞书会把过长的选项从**尾巴**截断——正好截掉目录名（真机上 27 个字符的路径就显示成
 * `/Users/zhang3/yh_zhang3/张三b...`）。所以自己折中截断，**短到飞书不会再截**：保留开头
 * 与最后两级；取值的仍然是完整路径。
 */
/*
 * 默认 22：真机上 24 个字符左右就开始被截，留点余量。
 */
function shortPath(path, max = 22) {
  const text = String(path ?? '');
  if (text.length <= max) return text;
  const parts = text.split('/').filter(Boolean);
  const tail = parts.slice(-2).join('/');
  const short = `${text.startsWith('/') ? '/' : ''}…/${tail}`;
  return short.length <= max ? short : `…/${parts[parts.length - 1] ?? text.slice(-max)}`;
}

/**
 * 一个"带名称的设置格"：名称在上、控件在下。
 *
 * 飞书的 `select_static` **没有 label 字段**（查过 Card 2.0 组件文档），所以名称只能自己放：
 * 格子内先一行 markdown 名称，再放下拉。两格并排时一行两个设置，比"四个全宽下拉"还矮。
 */
function field(label, element) {
  return {
    tag: 'column',
    width: 'weighted',
    weight: 1,
    elements: [
      { tag: 'markdown', content: `**${label}**` },
      element,
    ],
  };
}

/**
 * 设置格子的栅格。
 *
 * `flex_mode: 'stretch'`：窄屏（手机）时自动变成上下堆叠，每个格子仍占满宽度——
 * 否则半栏里的模型 id / 工作区路径会被压成几个字。
 */
function grid(cells) {
  return { tag: 'column_set', flex_mode: 'stretch', columns: cells };
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
  /** 机器人默认模型：没有会话时"当前生效的模型"就是它（下一条消息新建的会话用它）。 */
  const botDefault = model.botDefault ?? null;
  const hostDefault = model.hostDefault ?? null;
  /**
   * "当前生效的模型"：有会话看**会话选择**（会话没显式选过就是跟随 Host 默认，
   * 机器人默认模型只影响"新建的会话"，跟已有会话无关）；没有会话才看机器人默认。
   * **读会话失败时不能退回默认**——那会把"读不到"显示成一个具体的模型。
   */
  const effective = model.selectionFailed === true
    ? null
    : (current ?? (bound ? null : botDefault));

  /**
   * 卡片只放"能改的东西 + 当前值"：每个设置的当前值由它自己的下拉 ✓ 表示，
   * 所以不再重复一整块"当前会话 / 模型 / 预设 / 工作区"状态行（与下拉完全重复，
   * 真机上把卡片撑到 1000+ px）。只在"下拉说不出话"的地方补一行说明。
   */

  // ① 模型与推理：有会话时改会话（立即生效）；没有会话时改机器人默认模型（只对新会话生效）
  if (!bound) {
    elements.push({
      tag: 'markdown',
      content: '还没有会话：模型与推理改的是**机器人默认模型**（只对新会话生效、只有属主能改）',
    });
  } else if (model.selectionFailed === true) {
    // 读失败 ≠ 没选过：说成"跟随 Host 默认"会让用户以为自己的选择丢了（日志里有 warn）。
    elements.push({
      tag: 'markdown',
      content: '读不到当前会话的模型选择（Host 暂时不可用），稍后再试。',
    });
  }
  const modelPicker = dropdown({
    name: 'model_pick',
    action: 'model_pick',
    // 没显式选模型时把"实际会用哪个"写进占位，省掉一整行"跟随 Host 默认（…）"。
    placeholder: hostDefault
      ? `跟随 Host 默认（${hostDefault.provider}/${hostDefault.model}）`
      : '选择模型',
    items: (model.options ?? []).map((item) => ({ value: item.value, label: item.value })),
    current: effective ? `${effective.provider}/${effective.model}` : null,
  });
  /**
   * 一行两个设置格；没有控件的格子不放（说明行单独跟在下面）。
   * 并发两个下拉时高度比"四个全宽下拉"还矮，且每个都有名称——窄屏会自己堆叠。
   */
  const modelCells = [];
  if (modelPicker.element) modelCells.push(field('模型', modelPicker.element));
  if (modelPicker.element) {
    // 推理等级与模型并排：两格都放得下（窄屏会自己堆叠）。
  } else {
    // 空目录要说清"为什么空"：`session/modelCatalog` 会把每个失败 provider 的原因带出来。
    // 不带出来，用户和排查者就只剩一句"没有可用模型"——唯一的线索被丢在 RPC 边界上。
    const failures = Array.isArray(model.failures) ? model.failures : [];
    /**
     * 「一条也读不到」与「确实没有可用模型」是两回事：整目录 RPC 失败时
     * `options` 也是空的，说成"没有可用模型"就是与事实相反的断言（CONTRACT.md 要求如实呈现）。
     * 这种失败项没有 provider id，用它区分最省事。
     */
    const catalogUnreadable = failures.length > 0 && failures.every((item) => !item.id);
    elements.push({
      tag: 'markdown',
      content: catalogUnreadable
        ? `读不到模型目录：${h(String(failures[0].message).slice(0, 120))}`
        : (failures.length > 0
          ? `当前没有可用模型，以下 provider 读取失败：${failures
            .map((item) => `\n· ${h(item.id || item.name)}：${h(String(item.message).slice(0, 120))}`)
            .join('')}`
          : '当前 Host 没有可用模型。'),
    });
  }
  if (modelPicker.hidden > 0) {
    elements.push({
      tag: 'markdown',
      content: `还有 ${modelPicker.hidden} 个模型未列出：手打 \`/model <provider/model>\``,
    });
  }

  const efforts = model.efforts ?? [];
  if (effective && efforts.length > 0) {
    const effortPicker = dropdown({
      name: 'reasoning_pick',
      action: 'reasoning_pick',
      placeholder: '选择推理等级',
      // 名称由格子的「推理等级」标签给出，选项本身不用再带前缀。
      items: [
        { value: FOLLOW_DEFAULT, label: '（模型默认）' },
        ...efforts.map((effort) => ({
          value: effort.id,
          label: `${effort.id}${effort.label && effort.label !== effort.id ? ` · ${effort.label}` : ''}`,
        })),
      ],
      current: model.currentEffort ?? FOLLOW_DEFAULT,
    });
    if (effortPicker.element) modelCells.push(field('推理等级', effortPicker.element));
  } else if (effective) {
    /**
     * 空 `efforts` 有两种成因，措辞不能混：① 这个模型确实没有推理等级；
     * ② 读不到模型目录（或当前模型不在目录里）。说成①是与事实相反的断言——
     * 同一张卡上面还列着 provider 读取失败的原因。
     */
    const catalogFailures = Array.isArray(model.failures) ? model.failures : [];
    const listed = (model.options ?? []).some(
      (item) => item.provider === effective.provider && item.model === effective.model,
    );
    // 只看**与当前模型相关**的失败：别的 provider 拉不到模型不代表这个模型列不出等级，
    // 拿它当理由就会把"这个模型确实没有推理等级"说成"读不到目录"（又是一句与事实相反的话）。
    const providerFailed = catalogFailures.some((item) => item.id === effective.provider);
    elements.push({
      tag: 'markdown',
      content: providerFailed || !listed
        ? '读不到模型目录，暂时列不出可选推理等级（可以手打 `/reasoning <等级>`）。'
        : '当前模型不支持调节推理等级。',
    });
  } else if ((model.options ?? []).length > 0) {
    // 还有模型可选时才说"先选一个模型"；一个可选项都没有时上面那句已经解释过了，
    // 再补一句只是噪音（真机上就是连着三行都在说"没有模型"）。
    if (bound) {
      // 读会话失败时上面已经如实说了，这里不能再断言"你还没选过模型"。
      if (model.selectionFailed !== true) {
        elements.push({ tag: 'markdown', content: '先选一个模型，才能调推理等级。' });
      }
    } else {
      elements.push({
        tag: 'markdown',
        content: '还没有会话，也还没设过机器人默认模型：先在上面选一个模型，才能调推理等级。',
      });
    }
  }

  // 模型与推理并排（放在各自的说明行之前：说明行是全宽的，不该夹在两格中间）。
  if (modelCells.length > 0) elements.push(grid(modelCells));

  // ② Agent 预设与工作区（机器人级：只对新会话生效）
  elements.push({ tag: 'hr' });
  // 名称已经写在两个格子上（Agent 预设 / 工作区），这里只说生效范围。
  elements.push({
    tag: 'markdown',
    content: '只对新会话生效（改完点「🆕 新会话」）',
  });
  const presetPicker = dropdown({
    name: 'preset_pick',
    action: 'preset_pick',
    placeholder: '选择 Agent 预设',
    items: [
      { value: FOLLOW_DEFAULT, label: '跟随 Host 默认' },
      // 用 hub 算好的展示名（`id · name`），并标出哪个是 Host 默认——只有 id 的话
      // 一排相近的 id（yh-olap / yh-olap-2）认不出，也看不出当前跟着谁。
      ...(state?.preset?.options ?? []).map((item) => ({
        value: item.id,
        label: `${item.label ?? item.id}${item.isDefault ? '（Host 默认）' : ''}`,
      })),
    ],
    current: state?.preset?.current ?? FOLLOW_DEFAULT,
  });
  const presetCells = [];
  if (presetPicker.element) presetCells.push(field('Agent 预设', presetPicker.element));
  if (state?.preset?.failed === true) {
    elements.push({ tag: 'markdown', content: '读不到 Agent Preset 列表，暂时只能跟随 Host 默认。' });
  }
  if (presetPicker.hidden > 0) {
    elements.push({
      tag: 'markdown',
      content: `还有 ${presetPicker.hidden} 个预设未列出：手打 \`/preset <id>\``,
    });
  }
  const workspacePicker = dropdown({
    name: 'workspace_pick',
    action: 'workspace_pick',
    placeholder: '选择工作区',
    // 长路径会被飞书从尾巴截掉（正好截掉目录名）：自己折中截断，保留开头与目录名。
    items: (state?.workspace?.options ?? []).map((path) => ({ value: path, label: shortPath(path) })),
    current: state?.workspace?.current ?? null,
  });
  if (workspacePicker.element) {
    presetCells.push(field('工作区', workspacePicker.element));
    if (workspacePicker.hidden > 0) {
      // 工作区没有命令兜底：只能在设置页改，所以这里要指路。
      elements.push({
        tag: 'markdown',
        content: `还有 ${workspacePicker.hidden} 个工作区未列出（其余在设置页里选）`,
      });
    }
  } else if (state?.workspace?.current) {
    // 候选被有意扣下（群会话/非属主）：不能说成"还没有工作区"——当前值仍然要看得见。
    elements.push({
      tag: 'markdown',
      content: `工作区 \`${h(shortPath(state.workspace.current, 40))}\`：候选只在私聊里给属主，要改请到设置页。`,
    });
  } else {
    elements.push({
      tag: 'markdown',
      content: '还没有工作区：先在设置页填一个绝对路径，否则新会话建不出来。',
    });
  }

  if (presetCells.length > 0) elements.push(grid(presetCells));

  /**
   * ③ 上一次动作的结果（成功与失败都留在卡上：toast 会消失，卡不会）。
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

  // ④ 操作按钮（放在最后，手指不用往上找）
  elements.push({ tag: 'hr' });
  elements.push(row([
    button('🆕 新会话', 'new'),
    button('📊 状态', 'status'),
    button('📖 命令清单', 'commands'),
    button('⏹ 停止', 'stop', 'danger'),
  ]));

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
