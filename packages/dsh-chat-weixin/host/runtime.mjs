/**
 * 微信账号运行时：长轮询收消息 → hub 会话桥 → 回复。
 *
 * 微信通道按协议只支持私聊（iLink 的 `from_user_id` 就是单聊对端），因此这里
 * 固定 `conversationType: 'direct'`；过程展示只做"正在输入 + 最终分段回复"
 * （逐步过程消息是飞书那边的能力）。
 *
 * @module dsh-chat-weixin/runtime
 */

import {
  extractText,
  messageId,
  rejectedResponse,
  splitText,
} from './ilink-client.mjs';

/**
 * 创建账号运行时。
 *
 * @param options - { account, token, deps, client, state, logger, pollTimeoutMs }。
 * @returns 运行时。
 */
export function createWeixinRuntime({
  account,
  token,
  deps,
  client,
  state,
  logger = console,
}) {
  if (!account?.botId) throw new TypeError('微信运行时需要账号配置。');
  if (!token) throw new TypeError('微信运行时需要访问令牌。');
  if (typeof deps?.sessions?.ask !== 'function' || typeof deps?.contextEnhancement?.enhanceContent !== 'function') {
    throw new TypeError('微信运行时需要 hub 的 sessions.ask 与 contextEnhancement。');
  }

  const baseUrl = account.baseUrl;
  let phase = 'idle';
  let error = null;
  let handled = 0;
  let lastHandledAt = null;
  let lastMessageAt = null;
  let typingTickets = new Map();
  let loop = null;

  function setPhase(next, detail = null) {
    phase = next;
    error = detail;
  }

  /** 取（并缓存）typing_ticket。 */
  async function typingTicket(userId, contextToken, signal) {
    const cached = typingTickets.get(userId);
    if (cached) return cached;
    const config = await client.getConfig({
      baseUrl, token, toUserId: userId, contextToken, signal,
    });
    if (config?.typingTicket) {
      if (typingTickets.size > 200) typingTickets = new Map();
      typingTickets.set(userId, config.typingTicket);
      return config.typingTicket;
    }
    return null;
  }

  async function typing(userId, contextToken, status, signal) {
    try {
      const ticket = await typingTicket(userId, contextToken, signal);
      if (!ticket) return false;
      await client.sendTyping({
        baseUrl, token, toUserId: userId, typingTicket: ticket, status, signal,
      });
      return true;
    } catch (cause) {
      // 输入状态是锦上添花：失败不影响收答案，但把 ticket 作废以便下次重取。
      typingTickets.delete(userId);
      logger.warn?.(`[dsh-chat-weixin] 发送输入状态失败：${cause?.message ?? cause}`);
      return false;
    }
  }

  /** 回复正文（按微信单条上限分段）。 */
  async function reply(userId, text, contextToken, runId, signal) {
    const chunks = splitText(text);
    for (const chunk of chunks) {
      await client.sendText({
        baseUrl, token, toUserId: userId, text: chunk, contextToken, runId, signal,
      });
    }
    return chunks.length;
  }

  /**
   * 处理一条入站消息。
   *
   * @param message - iLink 消息。
   * @param signal - 取消信号。
   */
  async function accept(message, signal) {
    // message_type 2 是自己发出去的（服务端回显），必须忽略。
    if (message?.message_type === 2) return;
    const id = messageId(message);
    const sender = typeof message?.from_user_id === 'string' ? message.from_user_id.trim() : '';
    if (!id || !sender) return;
    if (!state.markSeen(id)) return;

    lastMessageAt = new Date().toISOString();
    await deps.ready?.();
    const record = deps.storage.read(account.botId);

    // 门禁：属主绕过，其余按访问策略（open / allowlist）判定。
    const access = deps.accessPolicy.evaluateAccess({
      policy: record.accessPolicy,
      conversationType: 'direct',
      senderIds: [sender],
      isOwner: sender === account.ownerUserId,
    });
    if (!access.allowed) {
      logger.info?.(`[dsh-chat-weixin] 忽略未放行的消息：${account.botId} sender=${sender}（${access.reason}）`);
      return;
    }

    const text = extractText(message);
    if (!text) {
      await reply(sender, '目前只支持文本与语音转写消息，图片与文件将在后续版本支持。',
        message.context_token, message.run_id, signal);
      return;
    }

    const inboundToken = typeof message.context_token === 'string' ? message.context_token : undefined;
    const runId = typeof message.run_id === 'string' ? message.run_id : undefined;
    if (inboundToken) await state.rememberContextToken(sender, inboundToken);
    // 回复必须带上会话上下文：优先用本条消息的，缺失时回落到该用户最近一次记下的。
    const contextToken = inboundToken ?? state.contextToken(sender);

    const key = `p2p:${sender}`;

    // 命令权限单独判定（白名单用户可以被允许对话、但不允许执行命令）。
    if (text.startsWith('/')) {
      const commandAccess = deps.accessPolicy.evaluateAccess({
        policy: record.accessPolicy,
        conversationType: 'direct',
        senderIds: [sender],
        isCommand: true,
        isOwner: sender === account.ownerUserId,
      });
      if (!commandAccess.allowed) {
        logger.info?.(`[dsh-chat-weixin] 命令被拒绝：${account.botId} sender=${sender}（${commandAccess.reason}）`);
        await reply(sender, '你没有执行机器人命令的权限。', contextToken, runId, signal);
        return;
      }
    }

    // 命令优先：命令不进入模型、也不做上下文增强。
    const command = await deps.commands?.handle?.({
      text,
      channelId: deps.channelId,
      botId: account.botId,
      key,
      conversationType: 'direct',
      senderId: sender,
      botLabel: account.botName ?? account.botId,
      channelLabel: '微信',
    }).catch((cause) => {
      logger.warn?.(`[dsh-chat-weixin] 命令处理失败：${cause?.message ?? cause}`);
      return null;
    });
    if (command?.handled) {
      if (command.reply) await reply(sender, command.reply, contextToken, runId, signal);
      handled += 1;
      lastHandledAt = new Date().toISOString();
      return;
    }

    const identity = { senderId: sender, chatId: sender };
    const captured = deps.contextEnhancement.captureContextEnhancementSource(
      { botId: account.botId, channel: 'weixin', readConfig: () => record.contextEnhancement },
      'direct',
      identity,
      () => ({ channel: 'weixin', ...identity }),
    );
    const content = deps.contextEnhancement.enhanceContent(
      text,
      captured?.snapshot ?? null,
      captured?.source,
    );

    await typing(sender, contextToken, 1, signal);
    try {
      const result = await deps.sessions.ask({
        channelId: deps.channelId,
        botId: account.botId,
        key,
        workspacePath: record.workspace,
        content: [{ type: 'text', text: content }],
        sourceGuidance: captured?.snapshot?.scope?.guidance,
        signal,
      });
      const answer = typeof result?.text === 'string' && result.text.trim()
        ? result.text.trim()
        : (result?.reason?.kind && result.reason.kind !== 'completed'
          ? `任务未正常完成（${result.reason.kind}）。`
          : '（本轮没有文本输出）');
      await reply(sender, answer, contextToken, runId, signal);
      handled += 1;
      lastHandledAt = new Date().toISOString();
    } catch (cause) {
      error = cause?.message ?? String(cause);
      logger.error?.(`[dsh-chat-weixin] 处理消息失败：${error}`);
      try {
        await reply(sender, `处理失败：${error}`, contextToken, runId, signal);
      } catch {
        // 连失败回复都发不出去时只留日志。
      }
    } finally {
      await typing(sender, contextToken, 2, signal);
    }
  }

  async function runLoop(signal) {
    setPhase('running');
    while (!signal.aborted) {
      let response;
      try {
        response = await client.getUpdates({
          baseUrl,
          token,
          getUpdatesBuf: state.getUpdatesBuf(),
          signal,
        });
      } catch (cause) {
        if (signal.aborted) break;
        setPhase('reconnecting', cause?.message ?? String(cause));
        logger.warn?.(`[dsh-chat-weixin] 长轮询失败，2s 后重试：${cause?.message ?? cause}`);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        continue;
      }
      if (signal.aborted) break;

      const rejection = rejectedResponse(response);
      if (rejection) {
        // -14 = 令牌失效，需要重新扫码；其余按可重试处理。
        if (rejection === '-14') {
          setPhase('failed', '微信登录已失效，请在设置页重新扫码。');
          logger.error?.('[dsh-chat-weixin] 令牌失效，停止长轮询');
          return;
        }
        logger.warn?.(`[dsh-chat-weixin] 微信服务返回 ${rejection}，忽略本轮`);
      }

      if (typeof response?.get_updates_buf === 'string' && response.get_updates_buf) {
        await state.saveGetUpdatesBuf(response.get_updates_buf).catch(() => undefined);
      }
      for (const message of response?.msgs ?? []) {
        if (signal.aborted) break;
        try {
          await accept(message, signal);
        } catch (cause) {
          logger.error?.(`[dsh-chat-weixin] 处理入站消息异常：${cause?.message ?? cause}`);
        }
      }
    }
    if (!signal.aborted) return;
    setPhase('stopped');
  }

  return {
    botId: account.botId,

    /**
     * 启动：先 notifyStart，再进入长轮询。
     *
     * @param options - { signal }。
     */
    async start({ signal }) {
      setPhase('starting');
      await client.notifyStart({ baseUrl, token, signal });
      loop = runLoop(signal);
      await loop;
    },

    /** 停止：中断长轮询并尽力通知服务端。 */
    async stop(signal) {
      setPhase('stopped');
      try {
        await client.notifyStop({ baseUrl, token, signal });
      } catch (cause) {
        logger.warn?.(`[dsh-chat-weixin] 停止通知失败：${cause?.message ?? cause}`);
      }
    },

    status: () => Object.freeze({
      botId: account.botId,
      phase,
      error,
      handled,
      lastHandledAt,
      lastMessageAt,
    }),

    /** 供测试直接投喂一条消息。 */
    accept,
  };
}
