/**
 * 人在环交互回传（hub 所有）：把 agent 的**提问**与**审批**送到 IM 里问、并从 IM 里收答案。
 *
 * 为什么要在 hub：这两件事与平台无关——渲染问题、等待回答、解析回答、超时兜底，
 * 所有渠道一模一样；渠道只提供两样东西：
 *   1. 怎么把一段文本发到某个会话（`attach` 时传入的 `send`）；
 *   2. 入站文本先交给 `offer`，被认领了就不要再去跑模型。
 *
 * 关键取舍：
 * - **超时/取消就交回其他应答方**（浏览器 UI）：`handle` 返回 null，上层 `next()`。
 *   这样即使 IM 那侧没人回，也不会把这一轮卡死。
 * - 只有已绑定的会话、且该渠道接入了 IM 回传时才认领；否则一样让给浏览器。
 * - 未识别的回复在审批场景里按"拒绝"处理（fail closed），并留下日志。
 *
 * @module dsh-chat/host/interactions
 */

const DEFAULT_TIMEOUT_MS = 10 * 60_000;

const APPROVE_PATTERN = /^(允许|同意|可以|好|好的|是|执行|ok|okay|yes|y|allow|approve)$/i;
const REJECT_PATTERN = /^(拒绝|不允许|不同意|不可以|不行|不要|不用|否|不|取消|no|n|deny|reject|cancel)$/i;

function waiterKey(channelId, botId, key) {
  return `${channelId}\u0000${botId}\u0000${key}`;
}

/**
 * 把一个问题渲染成一条 IM 文本。
 *
 * @param question - DSH 的 `AskUserQuestionItem`。
 * @param options - { position, total }：多问题时给出进度。
 * @returns 文本。
 */
export function renderQuestion(question, { position = 0, total = 1 } = {}) {
  const header = question?.header || '需要你确认';
  const lines = [total > 1 ? `❓ ${header}（${position}/${total}）` : `❓ ${header}`, ''];
  lines.push(String(question?.question ?? ''));
  if (question?.detail) {
    lines.push('', String(question.detail));
  }
  const options = Array.isArray(question?.options) ? question.options : [];
  if (options.length > 0) {
    lines.push('');
    options.forEach((option, index) => {
      lines.push(`${index + 1}. ${option.label}${option.description ? ` —— ${option.description}` : ''}`);
    });
    lines.push('');
    lines.push(question?.multiSelect
      ? '可以回复多个编号（例如 1,3），也可以直接回复文字。'
      : '回复编号或选项原文即可，也可以直接回复文字。');
  } else {
    lines.push('', '直接回复你的答案。');
  }
  return lines.join('\n');
}

/**
 * 渲染一次审批请求。
 *
 * @param request - `ApprovalRequestEvent`。
 * @returns 文本。
 */
export function renderApproval(request) {
  const lines = ['⚠️ 需要授权', ''];
  lines.push(`工具：${request?.toolName ?? '未知'}`);
  if (request?.reason) lines.push(`原因：${request.reason}`);
  lines.push('', '回复「允许」执行一次，或「拒绝」取消。');
  return lines.join('\n');
}

/**
 * 把用户回复解析成一个问题的答案。
 *
 * 支持：编号（`2`）、选项原文、多选（`1,3`）、以及任意自由文本（走 `custom`）。
 *
 * @param question - `AskUserQuestionItem`。
 * @param reply - 用户回复的原文。
 * @returns `AskUserQuestionAnswerItem`。
 */
export function parseAnswer(question, reply) {
  const raw = String(reply ?? '').trim();
  const options = Array.isArray(question?.options) ? question.options : [];
  // 选项原文本身可能带空格（例如「排查某个 App 异常」），所以先整体比一次；
  // 多选才按逗号/顿号拆，绝不用空格拆——那会把选项标签拆碎。
  const exact = options.find((option) => option.label === raw);
  if (exact) return { id: String(question?.id ?? ''), selected: [exact.label] };
  const tokens = question?.multiSelect
    ? raw.split(/[,，、;；]+/).map((token) => token.trim()).filter(Boolean)
    : [raw];
  const selected = [];
  const unmatched = [];
  for (const token of tokens) {
    const byIndex = /^\d+$/.test(token) ? options[Number(token) - 1] : undefined;
    const byLabel = byIndex ?? options.find((option) => option.label === token);
    if (byLabel) {
      if (!selected.includes(byLabel.label)) selected.push(byLabel.label);
      continue;
    }
    unmatched.push(token);
  }
  const answer = { id: String(question?.id ?? ''), selected };
  if (unmatched.length > 0) {
    // 一个选项都没匹配上时保留用户原文（多选拆分不该改写他的说法）。
    answer.custom = unmatched.length === tokens.length ? raw : unmatched.join(' ');
  }
  return answer;
}

/**
 * 解析审批回复。
 *
 * @param reply - 用户回复的原文。
 * @returns 'allowed-once' | 'rejected' | null（认不出来）。
 */
export function parseApproval(reply) {
  const raw = String(reply ?? '').trim();
  if (APPROVE_PATTERN.test(raw)) return 'allowed-once';
  if (REJECT_PATTERN.test(raw)) return 'rejected';
  return null;
}

/**
 * 创建交互服务。
 *
 * @param options - { logger, timeoutMs }。
 * @returns { attach, has, offer, handle }。
 */
export function createInteractionService({ logger = console, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  /** `${channelId}\u0000${botId}` → send({ key, text }) */
  const senders = new Map();
  /** `${channelId}\u0000${botId}\u0000${key}` → { resolve } */
  const waiters = new Map();

  function senderFor(channelId, botId) {
    return senders.get(`${channelId}\u0000${botId}`) ?? null;
  }

  /** 等一条回答；超时或取消返回 null（= 让给其他应答方）。 */
  function wait({ channelId, botId, key, kind, signal }) {
    return new Promise((resolve) => {
      const id = waiterKey(channelId, botId, key);
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', onAbort);
        if (waiters.get(id)?.resolve === entry.resolve) waiters.delete(id);
        if (value === null) {
          logger.warn?.(`[dsh-chat] ${kind} 在 IM 里没有得到回答，交回其他应答方`
            + `（${channelId}/${botId}/${key}）`);
        }
        resolve(value);
      };
      const entry = { resolve: (text) => finish(text) };
      const timer = setTimeout(() => finish(null), timeoutMs);
      const onAbort = () => finish(null);
      signal?.addEventListener?.('abort', onAbort, { once: true });
      waiters.set(id, entry);
    });
  }

  return Object.freeze({
    /**
     * 渠道接入 IM 回传：给出"怎么把文本发到这个机器人的某个会话"。
     *
     * @param options - { channelId, botId, send({ key, text }) }。
     * @returns 注销函数。
     */
    attach({ channelId, botId, send, sendQuestion, sendApproval }) {
      if (typeof send !== 'function') throw new TypeError('交互回传需要渠道提供 send。');
      const id = `${channelId}\u0000${botId}`;
      senders.set(id, {
        send,
        // 可选：渠道能把问题/审批渲染成平台原生交互（飞书的按钮卡片），比纯文本好用得多。
        sendQuestion: typeof sendQuestion === 'function' ? sendQuestion : null,
        sendApproval: typeof sendApproval === 'function' ? sendApproval : null,
      });
      return () => {
        if (senders.get(id)?.send === send) senders.delete(id);
      };
    },

    /** @returns 该渠道是否接入了 IM 回传（未接入则一律让给浏览器 UI）。 */
    has: (channelId) => [...senders.keys()].some((id) => id.startsWith(`${channelId}\u0000`)),

    /**
     * 入站文本先过这里：属于某个待回答的问题/审批就认领，调用方**不要**再跑模型。
     *
     * @param options - { channelId, botId, key, text }。
     * @returns 是否被认领。
     */
    offer({ channelId, botId, key, text }) {
      const entry = waiters.get(waiterKey(channelId, botId, key));
      if (!entry) return false;
      entry.resolve(text);
      return true;
    },

    /**
     * 应答一次提问/审批。
     *
     * @param options - { kind: 'question'|'approval', channelId, botId, key, request }。
     * @returns 提问返回 `{ answers }`，审批返回 outcome 字符串；无法应答时返回 null。
     */
    async handle({ kind, channelId, botId, key, request }) {
      const sender = senderFor(channelId, botId);
      if (!sender) return null;

      if (kind === 'approval') {
        if (sender.sendApproval) {
          await sender.sendApproval({ key, request });
        } else {
          await sender.send({ key, text: renderApproval(request) });
        }
        const reply = await wait({ channelId, botId, key, kind: '审批', signal: request?.signal });
        if (reply === null) return null;
        const outcome = parseApproval(reply);
        if (outcome === null) {
          logger.warn?.(`[dsh-chat] 审批回复无法识别（${JSON.stringify(reply)}），按拒绝处理`);
          return 'rejected';
        }
        return outcome;
      }

      const questions = Array.isArray(request?.questions) ? request.questions : [];
      if (questions.length === 0) return null;
      const answers = [];
      for (const [index, question] of questions.entries()) {
        // 多选没法用"一个按钮一个答案"表达，因此多选、以及不支持卡片的渠道走文本。
        const canRenderCard = sender.sendQuestion && question?.multiSelect !== true
          && Array.isArray(question?.options) && question.options.length > 0;
        if (canRenderCard) {
          await sender.sendQuestion({
            key, question, position: index + 1, total: questions.length,
          });
        } else {
          await sender.send({
            key,
            text: renderQuestion(question, { position: index + 1, total: questions.length }),
          });
        }
        const reply = await wait({ channelId, botId, key, kind: '提问', signal: request?.signal });
        if (reply === null) return null;
        answers.push(parseAnswer(question, reply));
      }
      return { answers };
    },
  });
}
