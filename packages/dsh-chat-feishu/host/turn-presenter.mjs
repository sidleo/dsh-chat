/**
 * 把一轮任务的执行过程渲染到飞书。
 *
 * 三态（每个会话类型独立配置）：
 * - `off`：只回最终答案；
 * - `post`：每一步单独回一条消息（工具调用、注入上下文等）；
 * - `streaming_card`：全程一张交互卡片，过程与最终答案都在这张卡里原地刷新。
 *
 * @module dsh-chat-feishu/turn-presenter
 */

/** 过程卡最多保留的过程行数（超出丢弃最旧的）。 */
const MAX_STEP_LINES = 24;

/** 卡片正文长度上限，避免超出飞书卡片限制。 */
const MAX_CARD_CONTENT = 12_000;

/**
 * 渲染一张过程卡（经典卡片格式；`update_multi` 让 patch 生效）。
 *
 * 卡片正文按"每条元素各自截断 + 总量预算"控制，绝不做字符串级截断——
 * 那会产出非法 JSON 让卡片整条发不出去。
 *
 * @param options - { title, lines, answer, note }。
 * @returns 飞书交互卡片对象。
 */
export function renderStepCard({
  title, lines = [], answer = '', note = '', question = null, template = 'blue',
}) {
  const budget = { left: MAX_CARD_CONTENT };
  const clamp = (text) => {
    const value = typeof text === 'string' ? text : '';
    if (budget.left <= 0) return '';
    const allowed = Math.min(value.length, budget.left);
    budget.left -= allowed;
    return allowed < value.length ? `${value.slice(0, allowed)}…` : value;
  };

  const elements = [];
  if (note) {
    elements.push({ tag: 'div', text: { tag: 'plain_text', content: clamp(note) } });
  }
  if (lines.length > 0) {
    // 工具与思考合并进**一个折叠面板**：默认收起，标题上显示"最新一条"，
    // 展开才看全部（真机反馈：不要一长串刷屏，也不要每步占一行卡片）。
    const body = clamp(lines.map((line) => `· ${line}`).join('\n'));
    if (body) {
      elements.push({
        tag: 'collapsible_panel',
        expanded: false,
        border: { color: 'grey', corner_radius: '4px' },
        header: {
          // 标题保持极简：只要"工具与思考(N)"。真机反馈：不要 🛠 前缀、也不要"最新：…"
          // （最新那条常常是又长又碎的思考摘要，反而干扰阅读）。
          title: { tag: 'plain_text', content: `工具与思考(${lines.length})` },
          width: 'fill',
          icon_position: 'right',
          icon_expanded_angle: -180,
        },
        elements: [{ tag: 'markdown', content: body }],
      });
    }
  }
  // 提问区内嵌在同一张卡里（真机反馈：单独的提问卡读起来割裂；答完收起）。
  if (Array.isArray(question?.elements) && question.elements.length > 0) {
    elements.push(...question.elements);
  }
  if (answer && budget.left > 0) {
    elements.push({ tag: 'hr' });
    elements.push({ tag: 'markdown', content: clamp(answer) });
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
 * @returns { step, finish }。
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

  let lines = [];
  let cardId = null;
  let cardBroken = false;
  /** 内嵌的提问区（{ elements, current }）：答完清空即"收起"。 */
  let question = null;
  /** 已产出的最终答案：提问区刷新时要把答案一起画回去，不能抹掉。 */
  let lastAnswer = '';
  /** 呈现状态：running（默认）/ done / failed —— 只影响标题。 */
  let state = 'running';
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
    if (question?.current) return `❓ 等你确认（第 ${question.index}/${question.total} 题）`;
    if (state === 'done') return '✅ 已完成';
    if (state === 'failed') return '⚠️ 未正常完成';
    return title;
  }

  async function ensureCard() {
    if (cardId || cardBroken) return cardId;
    try {
      const created = await gateway.replyCard({
        messageId,
        card: renderStepCard({
          title: currentTitle(),
          lines,
          note,
          question,
          template: question?.current ? 'blue' : 'blue',
        }),
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

  /** 立刻刷新一次卡片（记下时间用于节流）。 */
  async function patchNow(answer = lastAnswer) {
    lastPatchAt = Date.now();
    return patch(lines, answer);
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
  async function patch(linesSnapshot, answer) {
    const id = await ensureCard();
    if (!id) return false;
    try {
      await gateway.patchCard({
        messageId: id,
        card: renderStepCard({
          title: currentTitle(),
          lines: linesSnapshot,
          answer,
          note,
          question,
          template: state === 'done' ? 'green' : state === 'failed' ? 'orange' : 'blue',
        }),
      });
      return true;
    } catch (error) {
      cardBroken = true;
      noteFailure('更新过程卡失败', error);
      return false;
    }
  }

  return {
    /**
     * 把一批问题内嵌到这张进度卡里（提问区就在步骤下方，答完收起）。
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
        const rendered = gateway.renderQuestionElements({
          questions: payload?.questions ?? [],
          answered: payload?.answered ?? {},
          final: payload?.final === true,
        });
        const questions = payload?.questions ?? [];
        const current = rendered.current;
        // 全部答完时**不删掉提问区**：渲染器会把它折叠起来（collapsible_panel，
        // 默认收起、点标题可展开回看）。真机反馈要的正是"收起"而不是"消失"。
        question = rendered.elements.length > 0
          ? {
            elements: rendered.elements,
            current,
            index: current ? questions.indexOf(current) + 1 : 0,
            total: questions.length,
          }
          : null;
        const ok = await patchNow();
        return ok;
      });
    },

    /** @returns 本轮最后一次呈现失败（无失败则为 null）。 */
    lastError: () => lastFailure,
    /** @returns 最终答案的投递方式：card / text / failed / null（还没收尾）。 */
    delivery: () => lastDelivery,

    /**
     * 记录一步过程。
     *
     * @param text - 过程说明（如工具名）。
     */
    step(text) {
      if (mode === 'off' || !text) return Promise.resolve();
      lines = [...lines, text].slice(-MAX_STEP_LINES);
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
    },

    /**
     * 记录一条"思考"（模型的推理摘要），与工具调用同处一个折叠面板。
     *
     * @param text - 一行摘要（调用方负责截断）。
     */
    think(text) {
      if (mode === 'off' || !text) return Promise.resolve();
      const line = `💭 ${text}`;
      lines = [...lines, line].slice(-MAX_STEP_LINES);
      if (mode === 'post') {
        return enqueue(async () => {
          try {
            await gateway.replyText({ messageId, text: line, replyInThread });
          } catch (error) {
            noteFailure('发送思考消息失败', error);
          }
        });
      }
      schedulePatch();
      return Promise.resolve();
    },

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
        // 收尾一定刷新（把之前节流掉的过程一次性画上）
        if (patchTimer) {
          clearTimeout(patchTimer);
          patchTimer = null;
        }
        if (mode === 'streaming_card') {
          // 卡片能刷就刷；刷不动（含建卡失败）就退化成普通消息，保证答案一定到得了。
          if (!cardBroken && await patch(lines, body)) {
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
