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
export function renderStepCard({ title, lines = [], answer = '', note = '' }) {
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
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: clamp(note) } });
  }
  if (lines.length > 0) {
    const body = clamp(lines.map((line) => `· ${line}`).join('\n'));
    if (body) elements.push({ tag: 'div', text: { tag: 'lark_md', content: body } });
  }
  if (answer && budget.left > 0) {
    elements.push({ tag: 'hr' });
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: clamp(answer) } });
  }
  if (elements.length === 0) {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: '正在处理…' } });
  }
  return {
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: String(title).slice(0, 100) },
    },
    elements,
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
  const title = bot?.botName ? `${bot.botName} 正在处理` : '正在处理';

  let lines = [];
  let cardId = null;
  let cardBroken = false;
  /** 本轮的最后一个呈现失败：调用方（桥）要把它变成可见的状态，不能只留在日志里。 */
  let lastFailure = null;
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

  async function ensureCard() {
    if (cardId || cardBroken) return cardId;
    try {
      const created = await gateway.replyCard({
        messageId,
        card: renderStepCard({ title, lines, note }),
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

  /** @returns 卡片是否可用（更新成功才算）。 */
  async function patch(linesSnapshot, answer) {
    const id = await ensureCard();
    if (!id) return false;
    try {
      await gateway.patchCard({
        messageId: id,
        card: renderStepCard({ title, lines: linesSnapshot, answer, note }),
      });
      return true;
    } catch (error) {
      cardBroken = true;
      noteFailure('更新过程卡失败', error);
      return false;
    }
  }

  return {
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
      return enqueue(async () => {
        lines = [...lines, text].slice(-MAX_STEP_LINES);
        if (mode === 'post') {
          try {
            await gateway.replyText({ messageId, text, replyInThread });
          } catch (error) {
            noteFailure('发送过程消息失败', error);
          }
          return;
        }
        await patch(lines, '');
      });
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
