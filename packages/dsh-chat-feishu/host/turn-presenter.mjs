/**
 * 把一轮任务的执行过程渲染到飞书。
 *
 * 三态（每个会话类型独立配置）：
 * - `off`：只回最终答案；
 * - `post`：每一步单独回一条消息（工具调用、注入上下文等）；
 * - `streaming_card`：全程一张交互卡片，过程与最终答案都在这张卡里原地刷新。
 *
 * 呈现口径对齐 **DSH 桌面/Web 会话的「工作步骤展示 = 标准」**（真机反馈："每一项工具跟思考
 * 要跟 dsh web 的会话一样，显示为 web 会话未展开的样子"）。卡片正好映射它的两层折叠：
 * - **卡片头**＝桌面的整轮控件：运行中 `深度求索中，用时 X`；**结束之后一个字都不写**
 *   （完成 / 失败 / 中断都不写状态词，**也不显示已用时**）——完成与否只由 `template` 颜色表达
 *   （绿＝正常结束、橙＝失败或中断），失败原因在正文里。⚠️ Card 2.0 的 `header.title` 是**必填**，
 *   而空串会让飞书**连整条配色头一起不画**——「不写字」要传零宽空格，见 `INVISIBLE_TITLE`。
 * - **折叠面板标题**＝桌面的组头：没结束时显示最新一项（一眼看到在干什么），
 *   结束后显示按类别拼的摘要（`执行了命令并已调用工具`，前 3 类、超过 3 类结尾加「等」、
 *   **不带计数**；对齐 `chat/step-process.ts` 的 `processTitle`）。
 * - 一行一项，形如 `运行命令 · 看看目录`、`读取 · /ws/a.mjs`、`思考 · …`、`提问 · …`；
 *   工具类别与行标题、摘要取参照搬 DSH 的 `process-activity.ts` / `tool.title.*`
 *   （见下方 `TOOL_SPECS` / `TOOL_TITLES`），失败的行前面加「失败」。
 * - 工具、思考、中间叙述、**已答的提问**全部收进**同一个**折叠面板：默认收起、展开看全部；
 *   已答提问在面板里再嵌一层 `❓ N/M 已回答` 折叠面板（真机要求：提问也要能自己收起/展开；
 *   Card 2.0 的容器最多嵌套 5 层），**位置就是它本来出现的顺序**（不能被推到面板底部）；
 * - **任务清单**（`todo_write`）单独一个面板放在工具面板**下面**：本轮没结束时默认展开
 *   （看得到完成进度），结束后收起；
 * - 还没回答的提问控件放在面板**外面**——Card 2.0 的折叠面板里不能放 form/输入框。
 * - 运行中那行「深度求索中，用时 X」靠**10 秒慢时钟**自己走（桌面端是客户端 1 秒定时器、零网络；
 *   飞书每次刷新都是整卡 patch，成本结构不同，见 `CLOCK_INTERVAL_MS`）；
 *   被飞书限频（`99991400`）时**退避**而不是判死（见 `patch`）——判死会让整轮退回纯文本。
 *
 * @module dsh-chat-feishu/turn-presenter
 */

/**
 * 折叠面板最多保留的行数（超出丢弃最旧的）。
 *
 * 24 是只有工具行时的经验值；现在**中间叙述**也进这个面板（一个 27 次工具调用的回合
 * 会有 18 条叙述 + 27 条工具 = 45 行），按真机数据：中位 10 行、90 分位 34 行、最大 51 行，
 * 24 会把 18% 的回合截掉——那正是要留住的东西。48 覆盖到 96% 的回合，
 * 同时**留出卡片预算**给答案（面板先吃预算，见 `renderStepCard`）。
 */
const MAX_ROWS = 48;

/**
 * "不写字"的标题：一个**零宽空格**（U+200B）。
 *
 * Card 2.0 的 `header.title` 是必填（见 `~/.agents/skills/lark-im/references/card/components/header.md`），
 * 而且真机实测：把 `content` 传成**空串**，飞书**连整条配色头一起不画**了
 * （用户反馈"我只是让你不要显示耗时，但头部的颜色没了"）——所以"结束时不写字"要留一个
 * 看不见但非空的字符。选 U+200B 而不是 U+FEFF：`String.trim()` 会吃掉 U+FEFF，U+200B 不会。
 */
export const INVISIBLE_TITLE = '\u200b';

/**
 * 卡片头的标题文案：想"不写字"时用零宽字符兜底（空串会让飞书连配色头一起省掉）。
 *
 * @param title - 想写的文案（空串／null＝不写字）。
 * @returns 非空的 `plain_text` 文案。
 */
function headerTitle(title) {
  const text = String(title ?? '').slice(0, 100);
  return text === '' ? INVISIBLE_TITLE : text;
}

/** 卡片正文长度上限，避免超出飞书卡片限制。 */
const MAX_CARD_CONTENT = 12_000;

/** 未能收起的行（面板标题）长度上限——标题是一行，太长会被挤掉。 */
const MAX_PANEL_TITLE = 46;

/** 思考行的长度上限。 */
const MAX_THINK_CHARS = 120;

/** 中间叙述行的长度上限（它是一句话，不是段落）。 */
const MAX_NOTE_CHARS = 120;

/** 工具行摘要的长度上限。 */
const MAX_TOOL_SUMMARY = 60;

/**
 * 运行中「深度求索中，用时 X」的刷新间隔。
 *
 * 桌面端那行是**客户端 1 秒定时器**（零网络）；飞书每刷一次都是**整卡 JSON 走一次
 * `im.v1.message.patch`**，所以这里取 10 秒的慢时钟：秒数最多滞后 10 秒，
 * 而请求量级与"工具密集的回合本来就几十次 patch"同阶（5 分钟回合 = +30 次）。
 * 事件到达时照旧按 `PATCH_MIN_INTERVAL_MS` 合并刷新，时钟只补"没有事件的那段空档"。
 */
const CLOCK_INTERVAL_MS = 10_000;

/** 被飞书限频后的退避时长（见下方 `RATE_LIMIT_CODE`）。 */
const RATE_LIMIT_BACKOFF_MS = 30_000;

/** 飞书应用级频控超限的错误码（HTTP 400 + 该码）。 */
const RATE_LIMIT_CODE = 99991400;

/**
 * 工具名 → 过程类别 + 行标题 + 摘要取哪些参数。
 *
 * 照搬 DSH：类别来自 `dsh-client-ui-chat` 的 `process-activity.ts`（`activity()`），
 * 行标题来自 `dsh-client-ui-conversation` 的 `tool.title.*` 中文文案。
 * 类别用于"收起时那一行"的摘要（`执行了命令并已调用工具`），标题用于面板里的明细行
 * （`运行命令 · 看看目录`）。没列出的工具归 `tools`，行标题退化成
 * `工具调用 · <工具名> · <摘要>`（与 Web 一致）。
 */
const TOOL_SPECS = Object.freeze({
  read: { activity: 'read', title: '读取', keys: ['path', 'file_path', 'url'] },
  read_image: { activity: 'readImage', title: '读取图片', keys: ['path', 'file_path', 'url'] },
  write: { activity: 'write', title: '写入', keys: ['path', 'file_path'] },
  edit: { activity: 'edit', title: '编辑', keys: ['path', 'file_path'] },
  apply_patch: { activity: 'edit', title: '编辑', keys: ['path', 'file_path'] },
  bash: { activity: 'commands', title: '运行命令', keys: ['description', 'command'] },
  pwsh: { activity: 'commands', title: '运行命令', keys: ['description', 'command'] },
  exec_command: { activity: 'commands', title: '运行命令', keys: ['description', 'command'] },
  run_code: { activity: 'code', title: '代码', keys: ['description'] },
  grep: { activity: 'search', title: '搜索文件内容', keys: ['pattern', 'query', 'url'] },
  glob: { activity: 'search', title: '查找文件', keys: ['pattern', 'query', 'url'] },
  web_search: { activity: 'webSearch', title: '网页搜索', keys: ['query', 'url'] },
  web_fetch: { activity: 'webFetch', title: '网页获取', keys: ['url'] },
  cordis_package_inspect: { activity: 'search', title: '检查动态插件', keys: ['package', 'name'] },
  cordis_runtime_inspect: { activity: 'search', title: '查询运行时', keys: ['name'] },
});

/**
 * 有专属标题的工具：Web 里由插件注册了专门的卡片，标题不是"工具调用"。
 * 这里只补真正会出现在会话里、且 Web 显示为专属标题的那几个。
 */
const TOOL_TITLES = Object.freeze({
  skill: 'Skill',
  todo_write: '更新任务清单',
  create_goal: '创建目标',
  update_goal: '更新目标',
  get_goal: '查看目标',
  ask_user_question: '提问',
  request_user_input: '提问',
  present: '交付文件',
  chat_send: '发送消息',
  chat_send_file: '发送文件',
  chat_targets: '查看投递目标',
  chat_save_target: '保存投递目标',
});

/** 类别 → 「已完成」口径的那句话（对齐 Web 的 `message.stepProcess.done.*`）。 */
const ACTIVITY_DONE = Object.freeze({
  read: '已读取文件',
  readImage: '已读取图片',
  search: '已搜索代码',
  write: '已写入文件',
  edit: '修改了文件',
  commands: '执行了命令',
  code: '运行了代码',
  webSearch: '已搜索网页',
  webFetch: '已访问网页',
  subagents: '已协调子智能体',
  plan: '更新了计划',
  questions: '向用户提出了问题',
  tools: '已调用工具',
});

/** 摘要句的连接口径（对齐 Web：两类 `A并B`、三类 `A，B，C`、超过三类结尾加 `等`）。 */
const TITLE_JOIN = Object.freeze({ two: '并', comma: '，', more: '等', sharedPrefix: '已' });

/** 失败的工具行前缀（对齐 Web：`失败 运行命令 …`）。 */
const FAIL_PREFIX = '失败 ';

/**
 * 工具名 → 过程类别。表的补充规则与 Web 的 `activity()` 逐条对齐。
 *
 * @param name - 工具名。
 * @returns 类别。
 */
function activityOf(name) {
  const spec = TOOL_SPECS[name];
  if (spec) return spec.activity;
  if (name.endsWith('_inspect')) return 'search';
  if (name.startsWith('terminal_')) return 'commands';
  if (name === 'subagent' || name.startsWith('subagent_')) return 'subagents';
  if (name === 'todo_write' || name === 'create_goal'
    || name === 'update_goal' || name === 'get_goal') return 'plan';
  if (name === 'ask_user_question' || name === 'request_user_input') return 'questions';
  return 'tools';
}

/**
 * 收起时那一行：按类别出现次数取前 3 类拼成一句话（对齐 Web 的 `processTitle`）。
 *
 * 数量相同按首次出现的顺序；**不带计数**（Web 也不带，计数只在 DOM 属性里）。
 *
 * @param ranked - 已按数量降序排好的 `[{ activity, count }]`。
 * @returns 一句话；一类都没有时回落到「已完成分析」。
 */
function summaryTitle(ranked) {
  const labels = ranked.slice(0, 3).map(({ activity }) => ACTIVITY_DONE[activity] ?? ACTIVITY_DONE.tools);
  const first = labels[0];
  if (first === undefined) return '已完成分析';
  // 英文文案要去掉重复前缀后小写首字母；中文这里是空操作，照 Web 原样保留。
  const continuation = (label) => label.charAt(0).toLowerCase() + label.slice(1);
  const second = labels[1];
  if (second === undefined) return first;
  if (labels.length === 2) {
    const shared = first.startsWith(TITLE_JOIN.sharedPrefix) && second.startsWith(TITLE_JOIN.sharedPrefix);
    return `${first}${TITLE_JOIN.two}${continuation(shared ? second.slice(TITLE_JOIN.sharedPrefix.length) : second)}`;
  }
  const title = [first, ...labels.slice(1).map(continuation)].join(TITLE_JOIN.comma);
  return ranked.length > 3 ? `${title}${TITLE_JOIN.more}` : title;
}

/**
 * 运行中用时的文案（对齐 Web 的 `formatLiveRunDuration`：秒数**不补零**、满 60 秒才进位）。
 *
 * 只有运行中那条「深度求索中，用时 X」会用到——结束时卡片头不再显示用时。
 *
 * @param ms - 毫秒。
 * @returns 文案。
 */
function formatLiveDuration(ms) {
  const total = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60;
  const seconds = String(total % 60);
  if (hours > 0) return `${hours}小时${String(minutes).padStart(2, '0')}分${seconds}秒`;
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
}

/**
 * 这次失败是不是飞书的**应用级频控**（HTTP 400 + `99991400`）。
 *
 * 各层 SDK 报错形状不一（我们自己的 `providerCode`、SDK 的 `code`、或原始响应体），
 * 所以按"任一层能读到这个码"判断，读不到就退回消息里找码——**宁可漏判成普通失败，也不误判**。
 *
 * @param error - 抛出来的任意错误。
 * @returns 是否限频。
 */
function isRateLimited(error) {
  const candidates = [
    error?.providerCode, error?.code,
    error?.response?.data?.code, error?.response?.code, error?.data?.code,
  ];
  if (candidates.some((code) => Number(code) === RATE_LIMIT_CODE)) return true;
  return String(error?.message ?? '').includes(String(RATE_LIMIT_CODE));
}

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
function deriveSummary(name, args, argsRaw) {
  const parsed = args ?? parseArgs(argsRaw);
  if (parsed === null) return firstLine(typeof argsRaw === 'string' ? argsRaw : '');
  const spec = TOOL_SPECS[name];
  if ((spec?.activity === 'search' || spec?.activity === 'webSearch')
    && Array.isArray(parsed.queries)) {
    const queries = parsed.queries.filter((query) => typeof query === 'string' && query !== '');
    if (queries.length > 0) return queries.map(firstLine).join(', ');
  }
  const picked = pickString(parsed, spec?.keys ?? []);
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
 * 已知工具用自己的标题：`运行命令 · 看看目录`、`读取 · /ws/a.mjs`、`搜索文件内容 · try`；
 * 未知工具跟 Web 一样保留工具名：`工具调用 · wiki_get · 永辉/组织架构/品类架构`。
 *
 * @param options - { name, arguments }（`arguments` 可以是对象或原始 JSON 串）。
 * @returns 一行文本。
 */
export function toolRow({ name, arguments: argsRaw } = {}) {
  const toolName = typeof name === 'string' && name ? name : '工具';
  const spec = TOOL_SPECS[toolName];
  const summary = clamp(deriveSummary(toolName, parseArgs(argsRaw), argsRaw), MAX_TOOL_SUMMARY);
  const own = TOOL_TITLES[toolName];
  if (own) {
    // 有专属标题的工具（Skill / 更新任务清单…）：Web 只用它的标题 + 关键参数。
    return summary ? `${own} · ${summary}` : own;
  }
  if (spec) return summary ? `${spec.title} · ${summary}` : spec.title;
  return summary ? `工具调用 · ${toolName} · ${summary}` : `工具调用 · ${toolName}`;
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
 * 把模型"调工具前那句念叨"渲染成一行。
 *
 * 它原本是答案正文的一部分（每步一段，读者看到的就是"Let me check…"），现在挪进过程面板：
 * 答案干净了，叙述也还在（展开面板能看到）。标签用「说明」而不是「思考」——
 * 思考是 reasoning 块（模型的内心独白），这句是**它说给用户的话**，两者不是一回事。
 *
 * @param text - 那一段正文。
 * @returns 一行文本。
 */
export function noteRow(text) {
  const line = clamp(firstLine(text), MAX_NOTE_CHARS);
  return line ? `说明 · ${line}` : '';
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
 * @param options - { title, rows, questionRows, answer, panelTitle, currentQuestion, currentApproval, template }。
 *   `rows` 是工具/思考行，`questionRows` 是已答提问行，两者同处一个折叠面板；
 *   `currentQuestion` / `currentApproval` 是**还没回答/处理**的交互元素（控件必须留在面板外）。
 * @returns 飞书交互卡片对象。
 */
export function renderStepCard({
  title,
  panelItems = [],
  answer = '',
  panelTitle = '',
  currentQuestion = [],
  currentApproval = [],
  todos = null,
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
  // 授权控件同样要留在面板外；处理完会变成工具面板里的一行记录。
  if (Array.isArray(currentApproval) && currentApproval.length > 0) {
    elements.push(...currentApproval);
  }
  if (answer && budget.left > 0) {
    /**
     * 分割线只在**它上面真有东西**时才画：没有过程面板 / 任务清单 / 待答提问时，
     * 卡里第一块就是答案，再顶一条线纯属噪声（真机截图：整张卡只有一条线 + 答案）。
     */
    if (elements.length > 0) elements.push({ tag: 'hr' });
    elements.push({ tag: 'markdown', content: clampBudget(answer) });
  }
  if (elements.length === 0) {
    elements.push({ tag: 'markdown', content: '正在处理…' });
  }
  return {
    schema: '2.0',
    config: { update_multi: true, width_mode: 'default' },
    /**
     * `header.title` 在 Card 2.0 里是**必填**，所以它一直在；只是**内容可以为空**——
     * 结束时不留任何文案（完成/失败/用时都不写），状态只由 `template` 颜色表达。
     */
    header: {
      template,
      title: { tag: 'plain_text', content: headerTitle(title) },
    },
    body: { direction: 'vertical', elements },
  };
}

/**
 * 只装最终答案的卡片（「不显示过程」那条路用）。
 *
 * 为什么不用过程卡：过程卡的头是「深度求索中，用时 X」、正文按 `· ` 逐行排过程——
 * 关掉过程时它是空的，只剩答案，用户看到的会是一张"什么都没有"的卡。
 * 这里给一张干净的卡：同一套**配色**（结束＝绿、失败＝橙；标题不写字，见 `currentTitle` 与 `INVISIBLE_TITLE`），
 * 正文只有答案的 markdown——**格式（表格、代码块、链接）因此得以保留**，这正是要卡片的原因。
 *
 * @param options - { title, answer, template }。
 * @returns 飞书交互卡片对象。
 */
export function renderAnswerCard({ title, answer, template = 'green' } = {}) {
  return {
    schema: '2.0',
    config: { update_multi: true, width_mode: 'default' },
    header: {
      template,
      title: { tag: 'plain_text', content: headerTitle(title) },
    },
    body: {
      direction: 'vertical',
      elements: [{ tag: 'markdown', content: String(answer ?? '') }],
    },
  };
}

/**
 * 创建一轮任务的展示器。
 *
 * @param options - {
 *   mode, gateway, message, chatType, bot, logger,
 * }。
 * @returns { tool, think, setQuestion, setApproval, finish }。
 */
export function createTurnPresenter({
  mode,
  gateway,
  message,
  chatType,
  bot,
  logger = console,
}) {
  const messageId = message?.message_id;
  const chatId = message?.chat_id;
  // 群聊开启"话题回复"时，所有回复落在同一话题里。
  const replyInThread = chatType === 'group' && bot?.groupTopicReply === true;
  /** 本轮起始时刻：结束后标题显示「用时 X」（对齐桌面端的 turn-process 行）。 */
  const startedAt = Date.now();

  /**
   * 面板里的行，按发生顺序：`{ key, kind, activity, text }`。
   * key 用来原地更新（同一条提问被回答多次时不能重复占行）；activity 是工具的过程类别，
   * 用来拼"收起时那一行"（`执行了命令并已调用工具`）。
   */
  let entries = [];
  /** 还没回答的提问元素（面板外）。 */
  let currentQuestion = [];
  /** 还没处理的授权元素（面板外）。 */
  let currentApproval = [];
  /** 当前待处理/刚处理完的授权请求；按钮更新时不再带完整请求，所以要记住。 */
  let approvalRequest = null;
  /** 提问进度：用于标题里的"第 N/M 题"。 */
  let questionProgress = null;
  /**
   * 每批提问的状态：batchKey → { total, expanded }。
   * batchKey 由题目 id 拼成，因此同一批问题被反复渲染（每答一题刷一次）只会有一份记录。
   */
  const askBatches = new Map();
  /** 最新的任务清单（`todo_write` 每次都是全量，覆盖即可）。 */
  let todos = null;
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
  /** 运行中的慢时钟（只补"没有事件"的空档），见 `CLOCK_INTERVAL_MS`。 */
  let clockTimer = null;
  /** 被限频后的最早可刷时刻；期间不刷（行都攒着，下次刷一次全上）。 */
  let nextAllowedAt = 0;
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
   * 当前卡片的标题：**只放桌面的那条状态行**（`深度求索中` / `用时 X` / `处理失败` / `已停止`），
   * 不再单独写「✅ 已完成」「⚠️ 未正常完成」——完成与否由卡片头颜色表达。
   *
   * 对齐桌面 `chat/TurnProcessNodeView.tsx` 的文案，包括「用时 X」里的空格。
   */
  function currentTitle() {
    if (currentApproval.length > 0) return '❓ 等你确认（授权）';
    if (currentQuestion.length > 0 && questionProgress) {
      return `❓ 等你确认（第 ${questionProgress.index}/${questionProgress.total} 题）`;
    }
    if (state === 'running') {
      // 桌面口径：`深度求索中，用时{duration}`（**「用时」后面没有空格**）；
      // 时长靠 10 秒慢时钟刷新，见 CLOCK_INTERVAL_MS。
      return `深度求索中，用时${formatLiveDuration(Date.now() - startedAt)}`;
    }
    /**
     * 结束（含失败/中断）之后，卡片头**一个字都不写**：
     * 完成与否只看 `template` 颜色（绿＝正常结束、橙＝失败/中断），不用再单独写
     * 「已完成 / 未正常完成」，也**不显示已用时**（真机反馈：那行只是噪声）。
     * 失败原因在正文里（`本轮运行失败（<reason>）。` 或答案本身），信息不丢。
     */
    return '';
  }

  /**
   * 折叠面板的标题。
   *
   * 两层口径，正好对上桌面的两层折叠：
   * - 本轮**没结束**时显示最新的一项（一眼看到此刻在干什么），不写前缀；
   * - 本轮**结束后**换成桌面的「组头」那句话——按类别出现次数拼的摘要
   *   （`执行了命令并已调用工具`），**不带计数**（桌面端也不带）。
   */
  function panelTitle() {
    const count = entries.length;
    if (count === 0) return '';
    if (state !== 'running') return clamp(summaryTitle(rankedActivities()), MAX_PANEL_TITLE);
    return clamp(entries[count - 1].text, MAX_PANEL_TITLE);
  }

  /**
   * 面板里出现过的工具类别，按数量降序（数量相同按首次出现顺序，与 Web 的排序一致）。
   *
   * @returns `[{ activity, count }]`。
   */
  function rankedActivities() {
    const counts = new Map();
    for (const entry of entries) {
      if (entry.kind !== 'tool' || !entry.activity) continue;
      counts.set(entry.activity, (counts.get(entry.activity) ?? 0) + 1);
    }
    return [...counts].map(([activity, count]) => ({ activity, count }))
      .sort((left, right) => right.count - left.count);
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
      panelTitle: panelTitle(),
      currentQuestion,
      currentApproval,
      todos: todos ? { ...todos, expanded: state === 'running' } : null,
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
  function putEntry({ key, kind, activity, text }) {
    if (!text) return;
    const index = key ? entries.findIndex((entry) => entry.key === key) : -1;
    if (index >= 0) {
      entries = entries.map((entry, at) => (at === index
        ? { ...entry, text, ...(activity === undefined ? {} : { activity }) }
        : entry));
      return;
    }
    entries = [...entries, { key, kind, activity, text }].slice(-MAX_ROWS);
  }

  /** 立刻刷新一次卡片（记下时间用于节流）。 */
  async function patchNow(answer = lastAnswer) {
    lastPatchAt = Date.now();
    return patch(answer);
  }

  /**
   * 过程事件到达时按最小间隔合并刷新：一次 patch 是**整卡重写**，
   * 一轮几十上百个工具调用如果每个都刷，既慢又浪费；收尾时一定会再刷一次。
   *
   * 被限频时把等待时间**顺延到退避窗口之后**——行都攒在 `entries` 里，
   * 下次刷一次全上，不丢内容。
   */
  function schedulePatch() {
    if (mode !== 'streaming_card' || cardBroken) return;
    // 还没建卡时立刻建，别让用户等
    if (!cardId) {
      void enqueue(() => patchNow());
      return;
    }
    const wait = Math.max(
      PATCH_MIN_INTERVAL_MS - (Date.now() - lastPatchAt),
      nextAllowedAt - Date.now(),
    );
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

  /**
   * 运行中的慢时钟：只在**没有过程事件**的空档里，每 `CLOCK_INTERVAL_MS` 刷一次，
   * 让卡片头上的「深度求索中，用时 X」自己走。
   *
   * 三条约束，缺一不可：
   * - 只刷卡片模式、建卡成功、本轮还在跑（**收尾之后不再重新起表**）；
   * - 被限频的退避窗口内不刷（跳过一个周期）；
   * - `unref()`——定时器不能把宿主进程钉住（测试里也不会挂着不退出）。
   */
  function ensureClock() {
    if (clockTimer || mode !== 'streaming_card' || cardBroken || !cardId) return;
    if (state !== 'running') return;
    clockTimer = setInterval(() => {
      if (state !== 'running' || cardBroken) {
        stopClock();
        return;
      }
      if (Date.now() < nextAllowedAt) return;
      void enqueue(() => patchNow());
    }, CLOCK_INTERVAL_MS);
    clockTimer.unref?.();
  }

  function stopClock() {
    if (!clockTimer) return;
    clearInterval(clockTimer);
    clockTimer = null;
  }

  /** @returns 卡片是否可用（更新成功才算）。 */
  async function patch(answer) {
    const id = await ensureCard();
    if (!id) return false;
    try {
      await gateway.patchCard({ messageId: id, card: cardPayload(answer) });
      ensureClock();
      return true;
    } catch (error) {
      /**
       * 限频**不是**"这张卡废了"：飞书要求退避重试（HTTP 400 + 99991400）。
       * 判死会整轮退回纯文本、表格和代码块全丢，代价远大于晚几秒——所以只退避、记一条日志。
       */
      if (isRateLimited(error)) {
        nextAllowedAt = Date.now() + RATE_LIMIT_BACKOFF_MS;
        logger.warn?.(`[dsh-chat-feishu] 更新过程卡被飞书限频（${RATE_LIMIT_CODE}），`
          + `退避 ${Math.round(RATE_LIMIT_BACKOFF_MS / 1000)}s 后继续（过程行不丢，下次一起刷）。`);
        return false;
      }
      cardBroken = true;
      stopClock();
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

  /**
   * 把最终答案作为**一张卡片**发出（`off` 模式：不显示过程，但答案仍走卡片）。
   *
   * 两条硬约束：
   * - 答案超过单卡内容预算时**不截断**，退回文本发送（截断答案比丢格式更糟），并留日志；
   * - 卡片发不出去也退回文本——答案一定到得了，失败仍记在 `lastError` 里。
   *
   * @param body - 最终答案文本。
   * @returns 是否作为卡片发出。
   */
  async function sendAnswerCard(body) {
    if (typeof body !== 'string' || !body.trim()) return false;
    if (body.length > MAX_CARD_CONTENT) {
      logger.info?.(`[dsh-chat-feishu] 答案 ${body.length} 字超过单卡预算`
        + `（${MAX_CARD_CONTENT}），改用文本发送（不截断）。`);
      return false;
    }
    try {
      await gateway.replyCard({
        messageId,
        card: renderAnswerCard({
          title: currentTitle(),
          answer: body,
          template: state === 'failed' ? 'orange' : 'green',
        }),
        replyInThread,
      });
      return true;
    } catch (error) {
      noteFailure('发送答案卡片失败', error);
      return false;
    }
  }

  return {
    /**
     * 记录一次工具调用，渲染成 Web 那样的一行。
     *
     * @param call - { name, arguments, callId? }。
     *   `callId` 给了就按它原地更新——工具跑失败时那一行会被改成 `失败 …`（见 `toolResult`）。
     */
    tool(call) {
      const row = toolRow(call);
      const callId = typeof call?.callId === 'string' && call.callId ? call.callId : null;
      putEntry({
        key: callId ? `tool:${callId}` : undefined,
        kind: 'tool',
        activity: activityOf(typeof call?.name === 'string' ? call.name : ''),
        text: row,
      });
      // 任务清单每次都带全量，直接覆盖；渲染在工具面板下面的独立面板里。
      if (call?.name === 'todo_write') {
        const parsed = todoRows(call.arguments);
        if (parsed) todos = parsed;
      }
      return push(row);
    },

    /**
     * 记录一次工具调用的结果：**失败**时把它那一行标成 `失败 …`（对齐 Web 的行前缀）。
     *
     * 成功的调用不用改行（Web 也不标"成功"）。
     *
     * @param result - { callId, isError }。
     * @returns 是否更新了行。
     */
    toolResult(result) {
      const callId = typeof result?.callId === 'string' && result.callId ? result.callId : null;
      if (!callId || result?.isError !== true) return Promise.resolve(false);
      const key = `tool:${callId}`;
      const entry = entries.find((item) => item.key === key);
      if (!entry || entry.text.startsWith(FAIL_PREFIX)) return Promise.resolve(false);
      const failed = `${FAIL_PREFIX}${entry.text}`;
      putEntry({ key, kind: entry.kind, text: failed });
      return push(failed).then(() => true);
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
     * 记录模型"调工具前那句念叨"：同样进折叠面板，占一行。
     *
     * 它**不进答案正文**了（hub 侧只把不带工具调用的那段当答案），所以这里是它唯一的去处——
     * 面板是折叠的，不打扰读答案的人，展开还能看到全过程。
     *
     * @param text - 那一段正文。
     */
    note(text) {
      const row = noteRow(text);
      putEntry({ kind: 'note', text: row });
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
     * 把一次授权内嵌进本轮进度卡。
     *
     * 首次调用带 `request`，画「允许一次 / 拒绝」按钮；点击后再带 `decision` 调用，
     * 把按钮收掉并在工具面板里留下一行「授权 · 工具 → 已允许/已拒绝」。
     *
     * @param payload - { request, decision }。
     * @returns 是否成功内嵌（false 表示当前模式或渲染器不支持，应退回独立审批卡）。
     */
    setApproval(payload) {
      if (mode !== 'streaming_card' || typeof gateway.renderApprovalElements !== 'function') {
        return Promise.resolve(false);
      }
      if (patchTimer) {
        clearTimeout(patchTimer);
        patchTimer = null;
      }
      return enqueue(async () => {
        const incoming = payload?.request ?? null;
        const incomingId = incoming?.callId ?? incoming?.id ?? incoming?.toolName ?? null;
        const currentId = approvalRequest?.callId ?? approvalRequest?.id ?? approvalRequest?.toolName ?? null;
        const decision = payload?.decision === 'allowed-once' || payload?.decision === 'rejected'
          ? payload.decision
          : null;
        const staleDecision = Boolean(
          decision && incoming && currentId !== null && currentId !== incomingId,
        );
        if (incoming && !staleDecision) approvalRequest = incoming;
        const rendered = gateway.renderApprovalElements({
          request: incoming ?? approvalRequest,
          decision,
        });
        for (const row of rendered.rows ?? []) {
          putEntry({ key: `approval:${row.id}`, kind: 'approval', text: row.text });
        }
        // 连续两次授权时，前一次的回调可能晚于后一次出现；只补历史行，不抹掉当前待处理按钮。
        if (!staleDecision) {
          currentApproval = Array.isArray(rendered.elements) ? rendered.elements : [];
        }
        return patchNow();
      });
    },

    /** @returns 本轮进度卡消息 id（尚未建卡则为 null）。 */
    messageId: () => cardId,

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
        /**
         * 失败且没有正文时的占位。用桌面的 `turn-error` 口径（「本轮运行失败」）——
         * 卡片头已经是「处理失败」，正文里再说一遍「未正常完成」是重复的。
         */
        const body = text || (failed
          ? `本轮运行失败（${reason.kind}）。`
          : '（本轮没有文本输出）');

        lastAnswer = body;
        state = failed ? 'failed' : 'done';
        // 收尾时提问控件一律收起来（面板里那一行还在，可展开回看）。
        currentQuestion = [];
        currentApproval = [];
        questionProgress = null;
        stopClock();
        for (const [key, info] of askBatches) askBatches.set(key, { ...info, expanded: false });
        // 收尾一定刷新（把之前节流掉的过程一次性画上，并让面板标题变成类别摘要）
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
        /**
         * 「不显示过程」也走卡片：正文里的表格/代码块/链接要保留格式，
         * 纯文本发出去这些全没了。发不出去（或答案太长）自动退回文本。
         */
        if (mode === 'off' && await sendAnswerCard(body)) {
          lastDelivery = 'card';
          return lastDelivery;
        }
        lastDelivery = await sendText(body) ? 'text' : 'failed';
        return lastDelivery;
      });
    },
  };
}
