/**
 * 飞书消息桥：入站消息 → hub 会话桥 → 出站呈现。
 *
 * 只做飞书这一侧的事：解析事件、属主/群聊门禁、去重、按会话类型挑过程展示模式。
 * 会话绑定、上下文增强引擎、审批回传都由 hub 提供，桥只负责调用与呈现。
 *
 * @module dsh-chat-feishu/bridge
 */

import { createTurnPresenter } from './turn-presenter.mjs';

/** 一条入站文本的来源字段工厂用的取值上限（与上下文增强引擎一致）。 */
function messageText(message) {
  if (message?.message_type !== 'text') return null;
  try {
    const parsed = JSON.parse(message.content ?? '{}');
    return typeof parsed?.text === 'string' ? parsed.text : '';
  } catch {
    return '';
  }
}

/** 群聊里"是否 @ 了本机器人"。 */
function mentionsBot(message, botOpenId) {
  if (!botOpenId || !Array.isArray(message?.mentions)) return false;
  return message.mentions.some((mention) => mention?.id?.open_id === botOpenId);
}

/** 去掉 @ 占位符（飞书把 @ 渲染成 `@_user_1` 这样的 key）。 */
function stripMentions(text, mentions) {
  if (!Array.isArray(mentions) || mentions.length === 0) return text;
  let result = text;
  for (const mention of mentions) {
    const key = mention?.key;
    if (typeof key === 'string' && key) result = result.split(key).join('');
  }
  return result.trim();
}

/**
 * 是否本机器人的属主。`ownerOpenIds` 里的 `*` 表示绑定时没有记录单一属主，
 * 此时任何人都算"属主"（上游就是这么写的）。
 *
 * @param bot - 机器人配置。
 * @param senderId - 发送者 open_id。
 * @returns true 表示属主。
 */
function isOwner(bot, senderId) {
  return bot.ownerOpenIds.includes('*') || bot.ownerOpenIds.includes(senderId);
}

/**
 * 创建飞书消息桥。
 *
 * @param options - { bot, deps, gateway, state, logger }。
 *   `deps` 是 hub 交给渠道的依赖包（storage / sessions / contextEnhancement / ready）。
 * @returns { accept, status }。
 */
export function createFeishuBridge({ bot, deps, gateway, state, logger = console }) {
  if (!bot?.id) throw new TypeError('飞书桥需要机器人配置。');
  if (!deps?.sessions || !deps?.contextEnhancement) {
    throw new TypeError('飞书桥需要 hub 的会话桥与上下文增强引擎。');
  }
  let handled = 0;
  let lastError = null;
  let lastHandledAt = null;

  /**
   * 处理一条入站事件。
   *
   * @param event - `im.message.receive_v1` 的事件体。
   */
  async function accept(event) {
    const message = event?.message;
    if (!message?.message_id) return;
    // 同一条消息可能因重连被重复投递。
    if (!state.markSeen(message.message_id)) return;

    const conversationType = message.chat_type === 'p2p' ? 'direct' : 'group';
    const senderId = event?.sender?.sender_id?.open_id;
    if (!senderId) return;
    // 门禁要用到 hub 持有的访问策略；这一步只读内存快照，很便宜。
    await deps.ready?.();
    const accessPolicy = deps.storage.read(bot.id).accessPolicy;

    // 门禁：属主绕过，其余按访问策略（open / allowlist）判定。
    const messageAccess = deps.accessPolicy.evaluateAccess({
      policy: accessPolicy,
      conversationType,
      senderIds: [senderId],
      isOwner: isOwner(bot, senderId),
    });
    if (!messageAccess.allowed) {
      logger.info?.(
        `[dsh-chat-feishu] 忽略未放行的消息：${bot.id} ${conversationType} sender=${senderId}（${messageAccess.reason}）`,
      );
      return;
    }
    if (conversationType === 'group' && bot.groupResponseMode !== 'all'
      && !mentionsBot(message, bot.botOpenId)) {
      logger.info?.(`[dsh-chat-feishu] 群消息未 @ 本机器人，忽略（${bot.id} group=${message.chat_id}）`);
      return;
    }

    const raw = messageText(message);
    if (raw === null) {
      await gateway.replyText({
        messageId: message.message_id,
        text: '目前只支持文本消息，图片与文件将在后续版本支持。',
      });
      return;
    }
    const text = stripMentions(raw, message.mentions);
    if (!text) return;

    // 命令优先：命令不进入模型、也不做上下文增强。
    const conversationKeyForCommands = conversationType === 'direct'
      ? `p2p:${senderId}`
      : `group:${message.chat_id}`;
    const commandAccess = deps.accessPolicy.evaluateAccess({
      policy: accessPolicy,
      conversationType,
      senderIds: [senderId],
      isCommand: true,
      isOwner: isOwner(bot, senderId),
    });
    if (!commandAccess.allowed && text.startsWith('/')) {
      logger.info?.(`[dsh-chat-feishu] 命令被拒绝：${bot.id} sender=${senderId}（${commandAccess.reason}）`);
      await gateway.replyText({
        messageId: message.message_id,
        text: '你没有执行机器人命令的权限。',
      });
      return;
    }
    const command = await deps.commands?.handle?.({
      text,
      channelId: deps.channelId,
      botId: bot.id,
      key: conversationKeyForCommands,
      conversationType,
      senderId,
      botLabel: bot.botName ?? bot.id,
      channelLabel: '飞书',
    }).catch((error) => {
      logger.warn?.(`[dsh-chat-feishu] 命令处理失败：${error?.message ?? error}`);
      return null;
    });
    if (command?.handled) {
      if (command.reply) {
        await gateway.replyText({ messageId: message.message_id, text: command.reply });
      }
      lastHandledAt = new Date().toISOString();
      return;
    }

    try {
      await deps.ready?.();
      const record = deps.storage.read(bot.id);
      const identity = {
        senderId,
        chatId: message.chat_id,
        threadId: message.thread_id,
      };
      // 捕获而不是事后读取：排队中的消息保持收到它时的设置。
      const captured = deps.contextEnhancement.captureContextEnhancementSource(
        { botId: bot.id, channel: 'feishu', readConfig: () => record.contextEnhancement },
        conversationType,
        identity,
        () => ({ channel: 'feishu', ...identity }),
      );
      const content = deps.contextEnhancement.enhanceContent(
        text,
        captured?.snapshot ?? null,
        captured?.source,
      );
      const enhanced = content !== text;

      const mode = conversationType === 'direct' ? bot.stepPushDirect : bot.stepPushGroup;
      const presenter = createTurnPresenter({
        mode,
        gateway,
        message,
        chatType: conversationType,
        bot,
        logger,
        note: enhanced ? '📎 已注入会话上下文' : '',
      });

      const conversationKey = conversationType === 'direct'
        ? `p2p:${senderId}`
        : `group:${message.chat_id}`;

      const result = await deps.sessions.ask({
        channelId: deps.channelId,
        botId: bot.id,
        key: conversationKey,
        workspacePath: record.workspace,
        content: [{ type: 'text', text: content }],
        sourceGuidance: captured?.snapshot?.scope?.guidance,
        handlers: {
          onToolCall: (toolEvent) => presenter.step(
            `🛠 ${toolEvent?.data?.name ?? '工具'}`,
          ),
          onTurnEnd: (turnEvent) => {
            const reason = turnEvent?.data?.reason;
            if (reason?.kind && reason.kind !== 'completed') {
              void presenter.step(`⚠️ ${reason.kind}`);
            }
          },
        },
      });

      await presenter.finish(result?.text, result?.reason);
      handled += 1;
      lastHandledAt = new Date().toISOString();
      lastError = null;
    } catch (error) {
      lastError = error?.message ?? String(error);
      logger.error?.(`[dsh-chat-feishu] 处理消息失败：${lastError}`);
      try {
        await gateway.replyText({
          messageId: message.message_id,
          text: `处理失败：${lastError}`,
        });
      } catch {
        // 连失败回复都发不出去时，只留日志。
      }
    }
  }

  return {
    accept,
    status: () => Object.freeze({ handled, lastError, lastHandledAt }),
  };
}
