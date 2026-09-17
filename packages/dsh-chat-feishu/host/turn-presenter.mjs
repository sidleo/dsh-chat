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
  // 所有呈现动作串行执行：过程事件是"发出去就不等"的，若不排队，
  // 收尾的最终答案可能先于某一步骤落到卡片/聊天里（顺序错乱）。
  let chain = Promise.resolve();
  function enqueue(task) {
    chain = chain.then(task, task);
    return chain;
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
    } catch (error) {
      cardBroken = true;
      logger.warn?.(`[dsh-chat-feishu] 创建过程卡失败，回退为逐条消息：${error?.message ?? error}`);
    }
    return cardId;
  }

  async function patch(linesSnapshot, answer) {
    const id = await ensureCard();
    if (!id) return;
    try {
      await gateway.patchCard({
        messageId: id,
        card: renderStepCard({ title, lines: linesSnapshot, answer, note }),
      });
    } catch (error) {
      cardBroken = true;
      logger.warn?.(`[dsh-chat-feishu] 更新过程卡失败：${error?.message ?? error}`);
    }
  }

  return {
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
            logger.warn?.(`[dsh-chat-feishu] 发送过程消息失败：${error?.message ?? error}`);
          }
          return;
        }
        await patch(lines, '');
      });
    },

    /**
     * 收尾：把最终答案交给用户（排在所有已排队的步骤之后）。
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

        if (mode === 'streaming_card' && !cardBroken) {
          await patch(lines, body);
          return;
        }
        if (mode === 'streaming_card' && cardBroken && chatId) {
          // 卡片不可用时退化成普通消息。
          try {
            await gateway.sendText({ chatId, text: body });
            return;
          } catch (error) {
            logger.warn?.(`[dsh-chat-feishu] 回退发送失败：${error?.message ?? error}`);
          }
        }
        try {
          await gateway.replyText({ messageId, text: body, replyInThread });
        } catch (error) {
          logger.warn?.(`[dsh-chat-feishu] 回复失败：${error?.message ?? error}`);
        }
      });
    },
  };
}
