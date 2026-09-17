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

/** DSH 只认这四种图片类型；其余一律按"不支持"处理。 */
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

/**
 * 判定图片类型：优先看响应头，再用魔数兜底。
 *
 * 飞书对同一张图可能给 `application/octet-stream`，只看头部会把能识别的图当成不支持。
 *
 * @param bytes - 资源内容。
 * @param contentType - 响应头里的 content-type。
 * @returns 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | null。
 */
function sniffImageMediaType(bytes, contentType) {
  const declared = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  if (SUPPORTED_IMAGE_TYPES.has(declared)) return declared;
  const head = bytes.subarray(0, 12);
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e) return 'image/png';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.length >= 6 && head.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (head.length >= 12 && head.subarray(0, 4).toString('latin1') === 'RIFF'
    && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * 解析入站消息的内容部分。
 *
 * @param message - 飞书消息体。
 * @returns `{ kind:'text', text }` | `{ kind:'image', fileKey }` | `{ kind:'unsupported', label }`。
 */
function parseInbound(message) {
  const text = messageText(message);
  if (text !== null) return { kind: 'text', text };
  const type = String(message?.message_type ?? 'unknown');
  if (type === 'image' || type === 'file') {
    try {
      const parsed = JSON.parse(message.content ?? '{}');
      const fileKey = type === 'image' ? parsed?.image_key : parsed?.file_key;
      if (typeof fileKey === 'string' && fileKey) {
        const label = type === 'image' ? 'feishu-image' : 'feishu-file';
        const fileName = type === 'file' && typeof parsed?.file_name === 'string' && parsed.file_name
          ? parsed.file_name
          : label;
        return { kind: type, fileKey, fileName };
      }
    } catch {
      // 落到"内容无法解析"。
    }
    return { kind: 'unsupported', label: `${type === 'image' ? '图片' : '文件'}（内容无法解析）` };
  }
  return { kind: 'unsupported', label: type };
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
   * 把一段文本发到某个会话（交互回传用）：会话键就是 `p2p:<openId>` / `group:<chatId>`，
   * 因此这里不需要额外状态。
   */
  async function sendToConversation({ key, text }) {
    const separator = key.indexOf(':');
    const kind = separator > 0 ? key.slice(0, separator) : '';
    const id = separator > 0 ? key.slice(separator + 1) : key;
    if (kind === 'group') return gateway.sendText({ chatId: id, text });
    return gateway.sendText({ openId: id, text });
  }

  /** 会话键 → 已经发出去的那张提问卡片（回答后就地更新，不再新发消息）。 */
  const questionCards = new Map();
  /** 会话键 → 最近一次渲染用的批次（多选开关要就地重渲染，得知道原样数据）。 */
  const questionBatches = new Map();
  /** `${会话键}\u0000${问题id}` → 多选已勾选的选项原文。 */
  const multiSelections = new Map();

  const selectionKey = (key, questionId) => `${key}\u0000${questionId}`;

  /** 取某会话当前的多选勾选状态（按问题 id 分组）。 */
  function selectionOf(key) {
    const result = {};
    for (const [id, labels] of multiSelections.entries()) {
      const separator = id.indexOf('\u0000');
      if (id.slice(0, separator) !== key) continue;
      if (labels.size === 0) continue; // 空集合不必带进渲染参数
      result[id.slice(separator + 1)] = [...labels];
    }
    return result;
  }

  /** 会话键 → 收发所需的 route（卡片交互要用同一个会话键把答案认领回来）。 */
  function routeOf(key) {
    const separator = key.indexOf(':');
    const kind = separator > 0 ? key.slice(0, separator) : '';
    const id = separator > 0 ? key.slice(separator + 1) : key;
    return kind === 'group' ? { chatId: id } : { openId: id };
  }

  // 接入 IM 回传：agent 的提问/审批会发到会话里问，用户回复即答案。
  // 能发卡片就发卡片（点按钮即可回答），发不出去再退回纯文本。
  const detachInteractions = deps.interactions?.attach?.({
    channelId: deps.channelId,
    botId: bot.id,
    send: sendToConversation,
    // 一批问题一张卡：首次新建，之后按会话键找到那张卡就地更新（答完变绿）。
    sendQuestions: async ({ key, questions, answered, final }) => {
      questionBatches.set(key, { questions, answered });
      const existing = questionCards.get(key) ?? null;
      const sent = await gateway.sendQuestionsCard({
        ...routeOf(key),
        questions,
        answered,
        final,
        messageId: existing,
        selection: selectionOf(key),
      });
      if (sent?.messageId) questionCards.set(key, sent.messageId);
      if (final) {
        questionCards.delete(key);
        questionBatches.delete(key);
        for (const id of [...multiSelections.keys()]) {
          if (id.slice(0, id.indexOf('\u0000')) === key) multiSelections.delete(id);
        }
      }
    },
    sendApproval: async ({ key, request }) => {
      try {
        await gateway.sendApprovalCard({ ...routeOf(key), request });
      } catch (error) {
        logger.warn?.(`[dsh-chat-feishu] 审批卡片发送失败，回退为文本：${error?.message ?? error}`);
        await sendToConversation({ key, text: '⚠️ 需要授权：回复「允许」执行一次，或「拒绝」取消。' });
      }
    },
  });

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
    const inbound = parseInbound(message);
    if (inbound.kind === 'unsupported') {
      await gateway.replyText({
        messageId: message.message_id,
        text: `暂时还不能处理「${inbound.label}」类型的消息（目前支持文本、图片与文件）。`,
      });
      return;
    }

    const conversationKey = conversationType === 'direct'
      ? `p2p:${senderId}`
      : `group:${message.chat_id}`;

    // 正在等这个会话回答 agent 的提问/审批：这条消息就是答案，不再进模型。
    // 位置很关键——放在门禁**之后**（陌生人不能替人回答）、@ 检查**之前**
    // （回答问题时不需要再 @ 机器人）。
    if (inbound.kind === 'text') {
      const candidate = stripMentions(inbound.text, message.mentions);
      if (candidate && deps.interactions?.offer?.({
        channelId: deps.channelId,
        botId: bot.id,
        key: conversationKey,
        text: candidate,
      })) {
        logger.info?.(`[dsh-chat-feishu] 认领为交互回答（${bot.id} ${conversationKey}）`);
        lastHandledAt = new Date().toISOString();
        return;
      }
    }

    if (conversationType === 'group' && bot.groupResponseMode !== 'all'
      && !mentionsBot(message, bot.botOpenId)) {
      logger.info?.(`[dsh-chat-feishu] 群消息未 @ 本机器人，忽略（${bot.id} group=${message.chat_id}）`);
      return;
    }

    // 图片/文件：先下载，再变成 PromptContentPart，和文本走同一条会话链路。
    let attachmentParts = null;
    let text = '';
    if (inbound.kind === 'image' || inbound.kind === 'file') {
      const isImage = inbound.kind === 'image';
      let downloaded;
      try {
        downloaded = await gateway.downloadResource({
          messageId: message.message_id,
          fileKey: inbound.fileKey,
          type: isImage ? 'image' : 'file',
        });
      } catch (error) {
        const reason = error?.message ?? String(error);
        lastError = reason;
        logger.error?.(`[dsh-chat-feishu] 下载${isImage ? '图片' : '文件'}失败：${reason}`);
        await gateway.replyText({
          messageId: message.message_id,
          text: `${isImage ? '图片' : '文件'}下载失败：${reason}`,
        }).catch(() => {});
        return;
      }
      if (isImage) {
        const mediaType = sniffImageMediaType(downloaded.bytes, downloaded.contentType);
        if (!mediaType) {
          logger.info?.(`[dsh-chat-feishu] 忽略不支持的图片类型：${downloaded.contentType ?? '未知'}`);
          await gateway.replyText({
            messageId: message.message_id,
            text: `这张图片的格式暂不支持（${downloaded.contentType ?? '未知类型'}），请发 PNG/JPEG/WebP/GIF。`,
          });
          return;
        }
        attachmentParts = [{
          type: 'image',
          mediaType,
          data: downloaded.bytes.toString('base64'),
          name: 'feishu-image',
        }];
      } else {
        // 文件内容块只能引用"本会话上传"得到的 receipt，因此先上传再交给模型。
        try {
          const { sessionId } = await deps.sessions.ensure({
            channelId: deps.channelId,
            botId: bot.id,
            key: conversationKey,
            workspacePath: deps.storage.read(bot.id).workspace,
          });
          const uploaded = await deps.sessions.uploadFile({
            sessionId,
            name: inbound.fileName,
            bytes: new Uint8Array(downloaded.bytes),
          });
          if (!uploaded?.receiptId) {
            throw new Error('上传后没有拿到 receiptId');
          }
          attachmentParts = [{ type: 'file', receiptId: uploaded.receiptId }];
          logger.info?.(`[dsh-chat-feishu] 已接收文件并入库：${inbound.fileName}`
            + `（${downloaded.bytes.length} 字节，${bot.id}）`);
        } catch (error) {
          const reason = error?.message ?? String(error);
          lastError = reason;
          logger.error?.(`[dsh-chat-feishu] 接收文件失败：${reason}`);
          await gateway.replyText({
            messageId: message.message_id,
            text: `这个文件暂时没能收下：${reason}`,
          }).catch(() => {});
          return;
        }
      }
    } else {
      text = stripMentions(inbound.text, message.mentions);
      if (!text) return;
    }

    // 命令优先：命令不进入模型、也不做上下文增强（图片消息没有文本，直接跳过）。
    if (text) {
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
        key: conversationKey,
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
      // 文本保持"前缀拼进同一个文本块"的老形态；图片走内容数组，enhanceContent 会在
      // 前面插一个上下文文本块，于是图片也带上来源信息。
      let finalParts;
      let enhanced;
      if (attachmentParts) {
        const enhancedContent = deps.contextEnhancement.enhanceContent(
          attachmentParts,
          captured?.snapshot ?? null,
          captured?.source,
        );
        finalParts = Array.isArray(enhancedContent) ? enhancedContent : attachmentParts;
        enhanced = finalParts.length !== attachmentParts.length;
      } else {
        const enhancedText = deps.contextEnhancement.enhanceContent(
          text,
          captured?.snapshot ?? null,
          captured?.source,
        );
        finalParts = [{ type: 'text', text: enhancedText }];
        enhanced = enhancedText !== text;
      }

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

      const result = await deps.sessions.ask({
        channelId: deps.channelId,
        botId: bot.id,
        key: conversationKey,
        workspacePath: record.workspace,
        content: finalParts,
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

      logger.info?.(`[dsh-chat-feishu] 回合结束，准备回复：${bot.id} ${conversationKey}`
        + ` reason=${result?.reason?.kind ?? 'unknown'} 文本=${(result?.text ?? '').length}字`);
      await presenter.finish(result?.text, result?.reason);
      logger.info?.(`[dsh-chat-feishu] 最终答案投递方式：${presenter.delivery?.() ?? 'unknown'}`
        + `（${bot.id} ${conversationKey}）`);
      handled += 1;
      lastHandledAt = new Date().toISOString();
      // 回合本身成功，但呈现层可能失败过（卡片建不出来等）。那也必须让设置页看得到，
      // 否则用户"没收到回复"时只能靠终端日志。
      lastError = presenter.lastError?.() ?? null;
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

  /**
   * 处理一次卡片点击：把按钮里的答案交给 hub 的交互服务认领。
   *
   * 与"用户手打文字"共用同一条认领路径（`offer`），所以按钮与文本不会有两套行为。
   * 返回值直接作为飞书客户端的应答（toast），用户点完立刻有反馈。
   *
   * @param event - SDK 归一化后的 `card.action.trigger` 事件。
   * @returns 飞书卡片回调应答。
   */
  async function handleCardAction(event) {
    const value = event?.action?.value ?? {};
    const operatorId = event?.operator?.openId;
    const chatId = event?.chatId;
    if (!operatorId || !chatId) {
      // 绝不静默：到了这里却认不出会话/操作者，一定留痕（字段名对不上就是在这里暴露的）。
      logger.warn?.('[dsh-chat-feishu] 卡片回调缺少会话或操作者，无法认领'
        + `（chatId=${chatId ?? '无'} operator=${operatorId ?? '无'}）`);
      return undefined;
    }

    // 审批卡片：直接按按钮里的结论回答
    if (value.dsh === 'approval') {
      const decision = value.decision === 'allowed-once' ? 'allowed-once' : 'rejected';
      const claimed = deps.interactions?.offer?.({
        channelId: deps.channelId,
        botId: bot.id,
        key: `p2p:${operatorId}`,
        text: decision === 'allowed-once' ? '允许' : '拒绝',
      }) || deps.interactions?.offer?.({
        channelId: deps.channelId,
        botId: bot.id,
        key: `group:${chatId}`,
        text: decision === 'allowed-once' ? '允许' : '拒绝',
      });
      if (!claimed) {
        logger.info?.(`[dsh-chat-feishu] 卡片回调没有匹配的待审批（${bot.id} ${operatorId}）`);
        return { toast: { type: 'info', content: '这次授权已经处理过了。' } };
      }
      await markAnswered(event, value.dsh, decision === 'allowed-once' ? '已允许' : '已拒绝');
      return { toast: { type: 'success', content: decision === 'allowed-once' ? '已允许执行' : '已拒绝' } };
    }

    // 多选：点选项只切换勾选状态并就地重渲染，点「提交」才算答完。
    if (value.dsh === 'toggle') {
      const label = typeof value.label === 'string' ? value.label : '';
      const questionId = typeof value.questionId === 'string' ? value.questionId : '';
      const key = `p2p:${operatorId}`;
      const batchKey = questionBatches.has(key) ? key : `group:${chatId}`;
      const batch = questionBatches.get(batchKey);
      if (!label || !questionId || !batch) {
        logger.info?.(`[dsh-chat-feishu] 多选开关没有对应的问题（${bot.id} ${questionId || '未知'}）`);
        return { toast: { type: 'info', content: '这个问题已经处理过了。' } };
      }
      const id = selectionKey(batchKey, questionId);
      const chosen = new Set(multiSelections.get(id) ?? []);
      if (chosen.has(label)) chosen.delete(label); else chosen.add(label);
      multiSelections.set(id, chosen);
      // 就地重渲染：把勾选状态画回同一张卡
      const messageId = questionCards.get(batchKey) ?? event.messageId;
      await gateway.sendQuestionsCard({
        ...routeOf(batchKey),
        questions: batch.questions,
        answered: batch.answered,
        final: false,
        messageId,
        selection: selectionOf(batchKey),
      });
      return { toast: { type: 'success', content: chosen.has(label) ? `已选：${label}` : `取消：${label}` } };
    }

    if (value.dsh === 'submit') {
      const questionId = typeof value.questionId === 'string' ? value.questionId : '';
      const groupKey = `group:${chatId}`;
      const directKey = `p2p:${operatorId}`;
      const batchKey = questionBatches.has(groupKey) ? groupKey : (questionBatches.has(directKey) ? directKey : null);
      if (!batchKey) {
        logger.info?.(`[dsh-chat-feishu] 多选提交没有对应批次（${bot.id} ${questionId || '未知'}）`);
        return { toast: { type: 'info', content: '这个问题已经处理过了。' } };
      }
      const chosen = [...(multiSelections.get(selectionKey(batchKey, questionId)) ?? [])];
      if (chosen.length === 0) {
        return { toast: { type: 'info', content: '还没有勾选任何选项。' } };
      }
      multiSelections.delete(selectionKey(batchKey, questionId));
      if (deps.interactions?.offer?.({
        channelId: deps.channelId,
        botId: bot.id,
        key: batchKey,
        text: chosen.join('、'),
        questionId: questionId || undefined,
      })) {
        logger.info?.(`[dsh-chat-feishu] 多选提交已认领：${bot.id} ${batchKey} → ${chosen.join('、')}`);
        lastHandledAt = new Date().toISOString();
        return { toast: { type: 'success', content: `已提交：${chosen.join('、')}` } };
      }
      return { toast: { type: 'info', content: '这个问题已经处理过了。' } };
    }

    if (value.dsh === 'hint-text') {
      return { toast: { type: 'info', content: '直接在聊天里回复文字即可，我会把它当作答案。' } };
    }

    // 表单提交（自由文本输入框）：value 里既有按钮自带字段，也有 text_* 表单字段。
    const formFields = Object.entries(value)
      .filter(([field]) => field.startsWith('multi_') || field.startsWith('text_'));
    let label = '';
    if (value.dsh === 'form') {
      const picked = [];
      for (const [field, raw] of formFields) {
        if (field.startsWith('multi_')) {
          for (const item of Array.isArray(raw) ? raw : [raw]) {
            if (typeof item === 'string' && item.trim()) picked.push(item.trim());
          }
        } else if (typeof raw === 'string' && raw.trim()) {
          picked.push(raw.trim());
        }
      }
      // 多选拼接用「、」：hub 的 parseAnswer 对多选正是按 、/, 拆开，因此解析路径与按钮一致。
      label = picked.join('、');
      if (!label) {
        logger.info?.(`[dsh-chat-feishu] 卡片表单提交没有内容（${bot.id} ${operatorId}）`);
        return { toast: { type: 'info', content: '还没有填内容。' } };
      }
    } else if (value.dsh === 'answer') {
      label = typeof value.label === 'string' ? value.label : '';
    } else {
      return undefined;
    }
    if (!label) return undefined;

    // 身份门禁与文本回答一致：不该由谁回答，就不认领。
    await deps.ready?.();
    const accessPolicy = deps.storage.read(bot.id).accessPolicy;
    const keys = [
      { key: `group:${chatId}`, conversationType: 'group' },
      { key: `p2p:${operatorId}`, conversationType: 'direct' },
    ];
    for (const candidate of keys) {
      const access = deps.accessPolicy.evaluateAccess({
        policy: accessPolicy,
        conversationType: candidate.conversationType,
        senderIds: [operatorId],
        isOwner: isOwner(bot, operatorId),
      });
      if (!access.allowed) continue;
      if (deps.interactions?.offer?.({
        channelId: deps.channelId,
        botId: bot.id,
        key: candidate.key,
        text: label,
        questionId: typeof value.questionId === 'string' ? value.questionId : undefined,
      })) {
        logger.info?.(`[dsh-chat-feishu] 卡片回答已认领：${bot.id} ${candidate.key} → ${label}`);
        lastHandledAt = new Date().toISOString();
        // 这里**不**把卡片替换成静态卡：一批问题共用一张卡，hub 会带着"已回答"状态
        // 重新渲染（把剩下没答的继续留在卡上）。替换掉会把其余问题一起抹掉。
        return { toast: { type: 'success', content: `已选择：${label}` } };
      }
    }
    logger.info?.(`[dsh-chat-feishu] 卡片回调没有匹配的待回答问题（${bot.id} ${operatorId}）`);
    return { toast: { type: 'info', content: '这个问题已经处理过了。' } };
  }

  /** 把已答的卡片替换成静态卡片：视觉上明确"已处理"，也避免重复点。 */
  async function markAnswered(event, title, content) {
    if (!event?.messageId || typeof gateway.markCardAnswered !== 'function') return;
    try {
      await gateway.markCardAnswered({ messageId: event.messageId, title, content });
    } catch (error) {
      logger.warn?.(`[dsh-chat-feishu] 更新提问卡片失败：${error?.message ?? error}`);
    }
  }

  return {
    accept,
    handleCardAction,
    status: () => Object.freeze({ handled, lastError, lastHandledAt }),
    /** 停止时把 IM 回传的发送器摘掉：不能让停掉的机器人继续"接单"。 */
    dispose: () => detachInteractions?.(),
  };
}
