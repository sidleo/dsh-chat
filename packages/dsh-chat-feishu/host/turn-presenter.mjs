/**
 * 把一轮任务的执行过程渲染到飞书。
 *
 * 三态（每个会话类型独立配置）：
 * - `off`：只回最终答案；
 * - `post`：每一步单独回一条消息（工具调用、注入上下文等）；
 * - `streaming_card`：全程一张交互卡片，过程与最终答案都在这张卡里原地刷新。
 *
 * 呈现口径对齐 **DSH Web 会话**（真机反馈："每一项工具跟思考要跟 dsh web 的会话一样，
 * 显示为 web 会话未展开的样子"）：
 * - 一行一项，形如 `工具调用 · wiki_get · 永辉/组织架构/品类架构`、`思考 · …`、`提问 · …`；
 *   项目分类与摘要口径直接照搬 Web 的工具行模型（见下方 `TOOL_VARIANTS` / `SUMMARY_KEYS`，
 *   来源：DSH 安装目录内 `@deepseek-ai/dsh-client-ui-tool` 的 `toolRowModel`）。
 * - 工具、思考、**已答的提问**全部收进**同一个**折叠面板：默认收起、展开看全部；
 *   已答提问在面板里再嵌一层 `❓ N/M 已回答` 折叠面板（真机要求：提问也要能自己收起/展开；
 *   Card 2.0 的容器最多嵌套 5 层），**位置就是它本来出现的顺序**（不能被推到面板底部）；
 * - 面板标题：本轮没结束时显示**最新的一项**（一眼看到在干什么），本轮结束后显示
 *   `工具与思考(N)`；
 * - **任务清单**（`todo_write`）单独一个面板放在工具面板**下面**：本轮没结束时默认展开
 *   （看得到完成进度），结束后收起；
 * - 还没回答的提问控件放在面板**外面**——Card 2.0 的折叠面板里不能放 form/输入框。
 *
 * @module dsh-chat-feishu/turn-presenter
 */

/** 折叠面板最多保留的行数（超出丢弃最旧的）。 */
const MAX_ROWS = 24;

/** 卡片正文长度上限，避免超出飞书卡片限制。 */
const MAX_CARD_CONTENT = 12_000;

/** 未能收起的行（面板标题）长度上限——标题是一行，太长会被挤掉。 */
const MAX_PANEL_TITLE = 46;

/** 思考行的长度上限。 */
const MAX_THINK_CHARS = 120;

/** 工具行摘要的长度上限。 */
const MAX_TOOL_SUMMARY = 60;

/**
 * 工具名 → 行的"种类"（决定用什么标题与摘要取哪些参数）。
 *
 * 照搬 Web：`dsh-client-ui-tool` 的 `TOOL_VARIANTS`。没列出的工具归 `others`。
 */
const TOOL_VARIANTS = Object.freeze({
  bash: 'bash',
  pwsh: 'bash',
  read: 'read',
  read_image: 'read',
  web_fetch: 'read',
  web_search: 'search',
  grep: 'search',
  glob: 'search',
  write: 'write',
  edit: 'edit',
  run_code: 'code',
  cordis_package_inspect: 'read',
  cordis_runtime_inspect: 'read',
  cordis_run: 'others',
  cordis_stop: 'others',
  cordis_undefine: 'others',
});

/** 种类 → 行标题（对齐 Web 的 `tool.title.*` 中文文案）。 */
const VARIANT_TITLES = Object.freeze({
  search: '搜索',
  read: '读取',
  bash: 'Bash',
  write: '写入',
  edit: '编辑',
  code: '代码',
  others: '工具调用',
});

/**
 * 有专属卡片的工具：Web 里由插件注册了专门的卡片，标题不是"工具调用"。
 * 这里只补真正会出现在会话里、且 Web 显示为专属标题的那几个。
 */
const TOOL_TITLES = Object.freeze({
  skill: 'Skill',
  todo_write: '更新任务清单',
  ask_user_question: '提问',
  present: '交付文件',
  chat_send: '发送消息',
  chat_send_file: '发送文件',
  chat_targets: '查看投递目标',
  chat_save_target: '保存投递目标',
});

/** 摘要优先取哪个参数（对齐 Web 的 `SUMMARY_KEYS`）。 */
const SUMMARY_KEYS = Object.freeze({
  bash: ['description', 'command'],
  read: ['path', 'file_path', 'url'],
  search: ['query', 'pattern', 'url'],
  write: ['path', 'file_path'],
  edit: ['path', 'file_path'],
  code: ['description'],
  others: [],
});

function firstLine(text) {
  const value = typeof text === 'string' ? text : '';
  const newline = value.indexOf('\n');
  return (newline === -1 ? value : value.slice(0, newline)).replace(/\s+/g, ' ').trim();
}

function parseArgs(args) {
  if (args === null || args === undefined) return null;
  if (typeof args === 'object') return args;
  if (typeof args !== 'string') return null;
  try {
    const parsed = JSON.parse(args);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function pickString(args, keys) {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value !== '') return value;
  }
  return undefined;
}

/** 按 Web 的口径从参数里挑一句摘要；挑不到就退化到第一个非空字符串参数。 */
function deriveSummary(variant, args, argsRaw) {
  const parsed = args ?? parseArgs(argsRaw);
  if (parsed === null) return firstLine(typeof argsRaw === 'string' ? argsRaw : '');
  if (variant === 'search' && Array.isArray(parsed.queries)) {
    const queries = parsed.queries.filter((query) => typeof query === 'string' && query !== '');
    if (queries.length > 0) return queries.map(firstLine).join(', ');
  }
  const picked = pickString(parsed, SUMMARY_KEYS[variant] ?? []);
  if (picked !== undefined) return firstLine(picked);
  for (const value of Object.values(parsed)) {
    if (typeof value === 'string' && value !== '') return firstLine(value);
  }
  // 和 Web 一样退化到原始参数（`wiki_list` 传 `{}` 时就显示 `{}`，一眼看出没带参数）。
  return firstLine(typeof argsRaw === 'string' ? argsRaw : '');
}

function clamp(text, max) {
  const value = typeof text === 'string' ? text : '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * 把一次工具调用渲染成 Web 那样的一行。
 *
 * 未知工具跟 Web 一样保留工具名：`工具调用 · wiki_get · 永辉/组织架构/品类架构`，
 * 已知工具用自己的标题：`Bash · Show current date and time`、`Skill · yh-bigdata`。
 *
 * @param options - { name, arguments }（`arguments` 可以是对象或原始 JSON 串）。
 * @returns 一行文本。
 */
export function toolRow({ name, arguments: argsRaw } = {}) {
  const toolName = typeof name === 'string' && name ? name : '工具';
  const variant = TOOL_VARIANTS[toolName] ?? 'others';
  const summary = clamp(deriveSummary(variant, parseArgs(argsRaw), argsRaw), MAX_TOOL_SUMMARY);
  const own = TOOL_TITLES[toolName];
  if (own) {
    // 有专属标题的工具（Skill / 更新任务清单…）：Web 只用它的标题 + 关键参数。
    return summary ? `${own} · ${summary}` : own;
  }
  if (variant === 'others') {
    return summary ? `工具调用 · ${toolName} · ${summary}` : `工具调用 · ${toolName}`;
  }
  const title = VARIANT_TITLES[variant];
  return summary ? `${title} · ${summary}` : title;
}

/**
 * 把一段思考渲染成一行。
 *
 * @param text - 推理文本。
 * @returns 一行文本。
 */
export function thinkRow(text) {
  const line = clamp(firstLine(text), MAX_THINK_CHARS);
  return line ? `思考 · ${line}` : '';
}

/**
 * 把 `todo_write` 的清单渲染成几行。
 *
 * 模型每次调用都带**全量**清单，因此外层只保留最后一次的结果（覆盖即可，不必累积）。
 *
 * @param args - `todo_write` 的原始参数。
 * @returns { rows, done, total }：`⬜/🔄/✅ 内容` 行与完成计数（没有清单时为 null）。
 */
export function todoRows(args) {
  const parsed = parseArgs(args);
  const todos = Array.isArray(parsed?.todos) ? parsed.todos : null;
  if (!todos || todos.length === 0) return null;
  const rows = [];
  for (const todo of todos.slice(0, 50)) {
    const content = firstLine(todo?.content);
    if (!content) continue;
    const status = todo?.status;
    const mark = status === 'completed' ? '✅' : status === 'in_progress' ? '🔄' : '⬜';
    rows.push(`${mark} ${clamp(content, 60)}`);
  }
  if (rows.length === 0) return null;
  const done = todos.filter((todo) => todo?.status === 'completed').length;
  return { rows, done, total: todos.length };
}

/**
 * 把一条已回答的提问渲染成一行。
 *
 * @param options - { header, question, answer }。
 * @returns 一行文本。
 */
export function askRow({ header, question, answer } = {}) {
  const title = firstLine(header || question || '提问');
  const value = firstLine(answer) || '（空）';
  return `提问 · ${clamp(title, 40)} → ${clamp(value, 60)}`;
}

/**
 * 渲染一张过程卡。
 *
 * 正文按"每条元素各自截断 + 总量预算"控制，绝不做字符串级截断——
 * 那会产出非法 JSON 让卡片整条发不出去。
 *
 * @param options - { title, rows, questionRows, answer, note, panelTitle, currentQuestion, template }。
 *   `rows` 是工具/思考行，`questionRows` 是已答提问行，两者同处一个折叠面板；
 *   `currentQuestion` 是**还没回答**的提问元素（控件必须留在面板外）。
 * @returns 飞书交互卡片对象。
 */
export function renderStepCard({
  title,
  panelItems = [],
  answer = '',
  note = '',
  panelTitle = '',
  currentQuestion = [],
  todos = null,
  images = [],
  template = 'blue',
}) {
  const budget = { left: MAX_CARD_CONTENT };
  const clampBudget = (text) => {
    const value = typeof text === 'string' ? text : '';
    if (budget.left <= 0) return '';
    const allowed = Math.min(value.length, budget.left);
    budget.left -= allowed;
    return allowed < value.length ? `${value.slice(0, allowed)}…` : value;
  };

  const elements = [];
  if (note) {
    elements.push({ tag: 'div', text: { tag: 'plain_text', content: clampBudget(note) } });
  }
  // 面板里的内容**按发生顺序**排：工具/思考若干行 → 该批提问的内层折叠控件 → 后面的行…
  // （真机反馈：提问必须留在它本来出现的位置，不能被推到面板底部）。
  if (panelItems.length > 0) {
    const inner = [];
    for (const item of panelItems) {
      if (item?.kind === 'ask') {
        const asked = clampBudget(item.rows.map((row) => `· ${row.text}`).join('\n'));
        if (!asked) continue;
        inner.push({
          tag: 'collapsible_panel',
          expanded: item.expanded === true,
          border: { color: 'grey', corner_radius: '4px' },
          header: {
            title: {
              tag: 'plain_text',
              content: clampBudget(item.title || `❓ ${item.rows.length} 已回答`),
            },
            width: 'fill',
            icon_position: 'right',
            icon_expanded_angle: -180,
          },
          elements: [{ tag: 'markdown', content: asked }],
        });
        continue;
      }
      const body = clampBudget((item?.rows ?? []).map((row) => `· ${row}`).join('\n'));
      if (body) inner.push({ tag: 'markdown', content: body });
    }
    if (inner.length > 0) {
      elements.push({
        tag: 'collapsible_panel',
        expanded: false,
        border: { color: 'grey', corner_radius: '4px' },
        header: {
          title: { tag: 'plain_text', content: clampBudget(panelTitle) },
          width: 'fill',
          icon_position: 'right',
          icon_expanded_angle: -180,
        },
        elements: inner,
      });
    }
  }
  // 任务清单单独一个面板（在工具面板下面）：没结束时展开看进度，结束后收起。
  if (todos && Array.isArray(todos.rows) && todos.rows.length > 0) {
    const body = clampBudget(todos.rows.join('\n'));
    if (body) {
      elements.push({
        tag: 'collapsible_panel',
        expanded: todos.expanded === true,
        border: { color: 'grey', corner_radius: '4px' },
        header: {
          title: {
            tag: 'plain_text',
            content: `任务清单 · ${todos.done}/${todos.total} 已完成`,
          },
          width: 'fill',
          icon_position: 'right',
          icon_expanded_angle: -180,
        },
        elements: [{ tag: 'markdown', content: body }],
      });
    }
  }
  // 还没回答的提问：控件留在面板外面（Card 2.0 的面板里放不了 form/输入框）。
  if (Array.isArray(currentQuestion) && currentQuestion.length > 0) {
    elements.push(...currentQuestion);
  }
  if (answer && budget.left > 0) {
    elements.push({ tag: 'hr' });
    elements.push({ tag: 'markdown', content: clampBudget(answer) });
  }
  // 交付的图片直接进卡片（真机想法：能进卡片就别再单发一条消息）。
  // 飞书卡片里没有"文件"组件，所以普通文件仍然只能走 post 的附件区。
  for (const image of Array.isArray(images) ? images.slice(0, 8) : []) {
    if (!image?.imageKey) continue;
    elements.push({
      tag: 'img',
      img_key: image.imageKey,
      alt: { tag: 'plain_text', content: image.name ?? '' },
      ...(image.name ? { title: { tag: 'plain_text', content: String(image.name).slice(0, 60) } } : {}),
      scale_type: 'fit_horizontal',
      margin: '4px 0px 4px 0px',
    });
  }
  if (elements.length === 0) {
    elements.push({ tag: 'markdown', content: '正在处理…' });
  }
  return {
    schema: '2.0',
    config: { update_multi: true, width_mode: 'default' },
    header: {
      template,
      title: { tag: 'plain_text', content: String(title).slice(0, 100) },
    },
    body: { direction: 'vertical', elements },
  };
}

/**
 * 创建一轮任务的展示器。
 *
 * @param options - {
 *   mode, gateway, message, chatType, bot, logger, note,
 * }。
 * @returns { tool, think, setQuestion, finish }。
 */
export function createTurnPresenter({
  mode,
  gateway,
  message,
  chatType,
  bot,
  logger = console,
  note = '',
}) {
  const messageId = message?.message_id;
  const chatId = message?.chat_id;
  // 群聊开启"话题回复"时，所有回复落在同一话题里。
  const replyInThread = chatType === 'group' && bot?.groupTopicReply === true;
  // 标题不带机器人名前缀（真机反馈：卡片本身就在这个机器人的会话里，重复没意义）。
  const title = '正在处理';

  /**
   * 面板里的行，按发生顺序：`{ key, text }`。
   * key 用来原地更新（同一条提问被回答多次时不能重复占行）。
   */
  let entries = [];
  /** 还没回答的提问元素（面板外）。 */
  let currentQuestion = [];
  /** 提问进度：用于标题里的"第 N/M 题"。 */
  let questionProgress = null;
  /**
   * 每批提问的状态：batchKey → { total, expanded }。
   * batchKey 由题目 id 拼成，因此同一批问题被反复渲染（每答一题刷一次）只会有一份记录。
   */
  const askBatches = new Map();
  /** 最新的任务清单（`todo_write` 每次都是全量，覆盖即可）。 */
  let todos = null;
  /** 交付的图片（`{ name, imageKey }`）：直接内嵌进卡片，不再单发消息。 */
  let delivered = [];
  /** 已产出的最终答案：提问区刷新时要把答案一起画回去，不能抹掉。 */
  let lastAnswer = '';
  /** 呈现状态：running（默认）/ done / failed。 */
  let state = 'running';
  let cardId = null;
  let cardBroken = false;
  /** 本轮的最后一个呈现失败：调用方（桥）要把它变成可见的状态，不能只留在日志里。 */
  let lastFailure = null;
  /** 过程刷新的最小间隔：一次 patch 是整卡重写，工具多时不能每个事件都刷。 */
  const PATCH_MIN_INTERVAL_MS = 1_200;
  let lastPatchAt = 0;
  let patchTimer = null;
  /** 最终答案实际走了哪条路（card/text/failed），供桥记录"用户到底收到没有"。 */
  let lastDelivery = null;
  // 所有呈现动作串行执行：过程事件是"发出去就不等"的，若不排队，
  // 收尾的最终答案可能先于某一步骤落到卡片/聊天里（顺序错乱）。
  let chain = Promise.resolve();
  function enqueue(task) {
    chain = chain.then(task, task);
    return chain;
  }

  function noteFailure(what, error) {
    lastFailure = `${what}：${error?.message ?? error}`;
    logger.warn?.(`[dsh-chat-feishu] ${lastFailure}`);
  }

  /**
   * 当前卡片的标题：随状态变化。
   * 真机反馈：一轮处理完了标题还写着"正在处理"，看不出结束没结束。
   */
  function currentTitle() {
    if (currentQuestion.length > 0 && questionProgress) {
      return `❓ 等你确认（第 ${questionProgress.index}/${questionProgress.total} 题）`;
    }
    if (state === 'done') return '✅ 已完成';
    if (state === 'failed') return '⚠️ 未正常完成';
    return title;
  }

  /**
   * 折叠面板的标题。
   *
   * 真机反馈两条，一起满足：
   * - 本轮**没结束**时显示最新的一项（一眼看到此刻在干什么），不写前缀；
   * - 本轮**结束后**才显示 `工具与思考(N)`。
   */
  function panelTitle() {
    const count = entries.length;
    if (count === 0) return '';
    if (state !== 'running') return `工具与思考(${count})`;
    return clamp(entries[count - 1].text, MAX_PANEL_TITLE);
  }

  /**
   * 把有序的 entries 折成面板内容：连续的工具/思考行合成一个 markdown 块，
   * 每批提问在**它第一次出现的位置**放一个内层折叠面板。
   *
   * @returns `[{kind:'rows',rows} | {kind:'ask',title,rows,expanded}]`。
   */
  function panelItems() {
    const items = [];
    let buffer = [];
    let batch = null;
    const flush = () => {
      if (buffer.length > 0) items.push({ kind: 'rows', rows: buffer });
      buffer = [];
    };
    for (const entry of entries) {
      if (entry.kind !== 'ask') {
        // 一批提问结束（后面又出现了工具/思考），再来的提问算新的一批。
        batch = null;
        buffer.push(entry.text);
        continue;
      }
      if (entry.batch !== batch) {
        flush();
        batch = entry.batch;
        items.push({ kind: 'ask', batch, rows: [], title: '', expanded: false });
      }
      items[items.length - 1].rows.push({ id: entry.key, text: entry.text });
    }
    flush();
    for (const item of items) {
      if (item.kind !== 'ask') continue;
      const info = askBatches.get(item.batch);
      const total = info?.total ?? item.rows.length;
      item.title = `❓ ${item.rows.length}/${total} 已回答`;
      item.expanded = info?.expanded === true;
    }
    return items;
  }

  function cardPayload(answer) {
    return renderStepCard({
      title: currentTitle(),
      panelItems: panelItems(),
      answer,
      note,
      panelTitle: panelTitle(),
      currentQuestion,
      todos: todos ? { ...todos, expanded: state === 'running' } : null,
      images: delivered,
      template: state === 'done' ? 'green' : state === 'failed' ? 'orange' : 'blue',
    });
  }

  async function ensureCard() {
    if (cardId || cardBroken) return cardId;
    try {
      const created = await gateway.replyCard({
        messageId,
        card: cardPayload(''),
        replyInThread,
      });
      cardId = created?.messageId ?? null;
      if (!cardId) noteFailure('创建过程卡失败', new Error('飞书没有返回卡片消息 id'));
    } catch (error) {
      cardBroken = true;
      noteFailure('创建过程卡失败', error);
    }
    return cardId;
  }

  /**
   * 发一条文本：优先回复原消息（保留上下文），失败再退到"发到这个会话"。
   * 两条都失败才算真失败——那也必须留下可查的原因。
   */
  async function sendText(body) {
    try {
      await gateway.replyText({ messageId, text: body, replyInThread });
      return true;
    } catch (error) {
      noteFailure('回复失败', error);
    }
    if (!chatId) return false;
    try {
      await gateway.sendText({ chatId, text: body });
      return true;
    } catch (error) {
      noteFailure('回退发送失败', error);
      return false;
    }
  }

  /** 追加/原地更新一行（超出上限丢最旧的）。 */
  function putEntry({ key, kind, text }) {
    if (!text) return;
    const index = key ? entries.findIndex((entry) => entry.key === key) : -1;
    if (index >= 0) {
      entries = entries.map((entry, at) => (at === index ? { ...entry, text } : entry));
      return;
    }
    entries = [...entries, { key, kind, text }].slice(-MAX_ROWS);
  }

  /** 立刻刷新一次卡片（记下时间用于节流）。 */
  async function patchNow(answer = lastAnswer) {
    lastPatchAt = Date.now();
    return patch(answer);
  }

  /**
   * 过程事件到达时按最小间隔合并刷新：一次 patch 是**整卡重写**，
   * 一轮几十上百个工具调用如果每个都刷，既慢又浪费；收尾时一定会再刷一次。
   */
  function schedulePatch() {
    if (mode !== 'streaming_card' || cardBroken) return;
    // 还没建卡时立刻建，别让用户等
    if (!cardId) {
      void enqueue(() => patchNow());
      return;
    }
    const wait = PATCH_MIN_INTERVAL_MS - (Date.now() - lastPatchAt);
    if (wait <= 0) {
      void enqueue(() => patchNow());
      return;
    }
    if (patchTimer) return;
    patchTimer = setTimeout(() => {
      patchTimer = null;
      void enqueue(() => patchNow());
    }, wait);
  }

  /** @returns 卡片是否可用（更新成功才算）。 */
  async function patch(answer) {
    const id = await ensureCard();
    if (!id) return false;
    try {
      await gateway.patchCard({ messageId: id, card: cardPayload(answer) });
      return true;
    } catch (error) {
      cardBroken = true;
      noteFailure('更新过程卡失败', error);
      return false;
    }
  }

  /** 推一行：卡片模式进面板，`post` 模式单独回一条消息。 */
  function push(text) {
    if (mode === 'off' || !text) return Promise.resolve();
    if (mode === 'post') {
      return enqueue(async () => {
        try {
          await gateway.replyText({ messageId, text, replyInThread });
        } catch (error) {
          noteFailure('发送过程消息失败', error);
        }
      });
    }
    schedulePatch();
    return Promise.resolve();
  }

  return {
    /**
     * 记录一次工具调用，渲染成 Web 那样的一行。
     *
     * @param call - { name, arguments }。
     */
    tool(call) {
      const row = toolRow(call);
      putEntry({ kind: 'tool', text: row });
      // 任务清单每次都带全量，直接覆盖；渲染在工具面板下面的独立面板里。
      if (call?.name === 'todo_write') {
        const parsed = todoRows(call.arguments);
        if (parsed) todos = parsed;
      }
      return push(row);
    },

    /**
     * 记录一段思考（模型的推理），与工具调用同处一个折叠面板。
     *
     * @param text - 推理文本。
     */
    think(text) {
      const row = thinkRow(text);
      putEntry({ kind: 'think', text: row });
      return push(row);
    },

    /**
     * 同步一批提问：已答的变成面板里的一行，没答的元素留在面板外做交互。
     *
     * @param payload - { questions, answered, final }。
     * @returns 是否成功内嵌（false 表示这张卡放不了提问，调用方应改用独立卡片）。
     */
    setQuestion(payload) {
      if (mode !== 'streaming_card' || typeof gateway.renderQuestionElements !== 'function') {
        return Promise.resolve(false);
      }
      if (patchTimer) {
        clearTimeout(patchTimer);
        patchTimer = null;
      }
      return enqueue(async () => {
        const questions = payload?.questions ?? [];
        const answered = payload?.answered ?? {};
        const batchKey = questions.map((question) => String(question?.id ?? '')).join('|');
        const rendered = gateway.renderQuestionElements({
          questions,
          answered,
          final: payload?.final === true,
        });
        // 已答的提问：按题号原地更新，位置就是它第一次出现的位置。
        for (const row of rendered.rows ?? []) {
          putEntry({ key: `ask:${row.id}`, kind: 'ask', batch: batchKey, text: row.text });
        }
        currentQuestion = Array.isArray(rendered.elements) ? rendered.elements : [];
        const current = rendered.current;
        questionProgress = current && questions.length > 0
          ? { index: questions.indexOf(current) + 1, total: questions.length }
          : null;
        if (batchKey) {
          askBatches.set(batchKey, {
            total: questions.length,
            // 还有题要答时展开方便对照；这一批答完就收起。
            expanded: Boolean(current),
          });
        }
        return patchNow();
      });
    },

    /**
     * @returns 这张卡现在能不能内嵌交付图片（调用方据此决定要不要白上传一次）。
     */
    canDeliverImages() {
      return mode === 'streaming_card' && !cardBroken;
    },

    /**
     * 把交付的图片内嵌进这张卡（排在最终答案后面）。
     *
     * 图片能进卡片，普通文件不能（飞书卡片没有文件组件）——所以文件仍然走单独一条消息。
     * 卡片已经建不出来时返回 false，调用方据此退回"连图片也一起单发"。
     *
     * @param payload - { images }，`images` = `[{ name, imageKey }]`。
     * @returns 是否成功画进卡片。
     */
    deliverImages(payload) {
      const images = Array.isArray(payload?.images) ? payload.images : [];
      if (mode !== 'streaming_card' || images.length === 0) return Promise.resolve(false);
      delivered = [...delivered, ...images];
      return enqueue(() => patch(lastAnswer));
    },

    /** @returns 本轮最后一次呈现失败（无失败则为 null）。 */
    lastError: () => lastFailure,
    /** @returns 最终答案的投递方式：card / text / failed / null（还没收尾）。 */
    delivery: () => lastDelivery,

    /**
     * 收尾：把最终答案交给用户（排在所有已排队的步骤之后）。
     *
     * 这里有两条硬约束：
     * 1. **绝不能静默**——用户等了一轮却什么都没收到，是最难排查的故障形态；
     * 2. **回退要真做**——卡片建不出来/刷不动时必须改用普通消息，而不是只打一行日志。
     *
     * @param answer - 最终文本。
     * @param reason - 回合结束原因（DSH 的 `turn/end` 数据）。
     */
    finish(answer, reason) {
      return enqueue(async () => {
        const text = typeof answer === 'string' ? answer.trim() : '';
        const failed = reason?.kind && reason.kind !== 'completed';
        const body = text || (failed
          ? `任务未正常完成（${reason.kind}）。`
          : '（本轮没有文本输出）');

        lastAnswer = body;
        state = failed ? 'failed' : 'done';
        // 收尾时提问控件一律收起来（面板里那一行还在，可展开回看）。
        currentQuestion = [];
        questionProgress = null;
        for (const [key, info] of askBatches) askBatches.set(key, { ...info, expanded: false });
        // 收尾一定刷新（把之前节流掉的过程一次性画上，并让标题变成 工具与思考(N)）
        if (patchTimer) {
          clearTimeout(patchTimer);
          patchTimer = null;
        }
        if (mode === 'streaming_card') {
          // 卡片能刷就刷；刷不动（含建卡失败）就退化成普通消息，保证答案一定到得了。
          if (!cardBroken && await patch(body)) {
            lastDelivery = 'card';
            return lastDelivery;
          }
          lastDelivery = await sendText(body) ? 'text' : 'failed';
          return lastDelivery;
        }
        lastDelivery = await sendText(body) ? 'text' : 'failed';
        return lastDelivery;
      });
    },
  };
}
