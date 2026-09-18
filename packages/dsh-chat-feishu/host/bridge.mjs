/**
 * 飞书消息桥：入站消息 → hub 会话桥 → 出站呈现。
 *
 * 只做飞书这一侧的事：解析事件、属主/群聊门禁、去重、按会话类型挑过程展示模式。
 * 会话绑定、上下文增强引擎、审批回传都由 hub 提供，桥只负责调用与呈现。
 *
 * @module dsh-chat-feishu/bridge
 */

import { stat } from 'node:fs/promises';

import { createTurnPresenter } from './turn-presenter.mjs';

/** 交付文件的单文件上限（与主动投递一致：飞书上传超过这个量既慢又容易失败）。 */
const MAX_DELIVERABLE_BYTES = 30 * 1024 * 1024;

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
  /** 会话键 → 最近一次渲染用的批次（勾选器要把序号反查成选项原文，得知道原样数据）。 */
  const questionBatches = new Map();
  /** 会话键 → 本轮"正在处理"那张卡（提问优先内嵌进它，答完收起）。 */
  const activePresenters = new Map();


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
      // 优先内嵌进本轮"正在处理"那张进度卡：提问与过程共处一卡，答完收起。
      const presenter = activePresenters.get(key);
      if (presenter) {
        try {
          const embedded = await presenter.setQuestion({ questions, answered, final });
          if (embedded) {
            if (final) questionBatches.delete(key);
            return;
          }
        } catch (error) {
          logger.warn?.(`[dsh-chat-feishu] 提问内嵌进度卡失败，改用独立卡片：${error?.message ?? error}`);
        }
      }
      // 兜底：没有进度卡（如过程展示为 off/post）时用独立卡片。
      const existing = questionCards.get(key) ?? null;
      const sent = await gateway.sendQuestionsCard({
        ...routeOf(key),
        questions,
        answered,
        final,
        messageId: existing,
      });
      if (sent?.messageId) questionCards.set(key, sent.messageId);
      if (final) {
        questionCards.delete(key);
        questionBatches.delete(key);
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

    // 收到即反馈：打一个「在做了」表情，处理完再撤掉（比等卡片刷新更即时，也不刷屏）。
    const workingReaction = await markWorking(message);

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
        await clearWorking(message, workingReaction);
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
          await clearWorking(message, workingReaction);
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
          await clearWorking(message, workingReaction);
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
        // 属主判定只有渠道知道（属主名单在渠道配置里），带上给命令内核用。
        isOwner: isOwner(bot, senderId),
        botLabel: bot.botName ?? bot.id,
        channelLabel: '飞书',
      }).catch((error) => {
        logger.warn?.(`[dsh-chat-feishu] 命令处理失败：${error?.message ?? error}`);
        return null;
      });
      if (command?.handled) {
        if (command.menu?.length && message.chat_id) {
          try {
            await gateway.sendCard({ chatId: message.chat_id, card: menuCard(command.menu) });
          } catch (error) {
            // 卡片发不出去不能把菜单吞掉：退回文本列表。
            logger.warn?.(`[dsh-chat-feishu] 菜单卡片发送失败，退回文本：${error?.message ?? error}`);
            if (command.reply) {
              await gateway.replyText({ messageId: message.message_id, text: command.reply });
            }
          }
        } else if (command.reply) {
          await gateway.replyText({ messageId: message.message_id, text: command.reply });
        }
        lastHandledAt = new Date().toISOString();
        await clearWorking(message, workingReaction);
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

      activePresenters.set(conversationKey, presenter);
      const result = await deps.sessions.ask({
        channelId: deps.channelId,
        botId: bot.id,
        key: conversationKey,
        workspacePath: record.workspace,
        content: finalParts,
        sourceGuidance: captured?.snapshot?.scope?.guidance,
        // 同一会话已有回合在跑：先回一句"排队中"，别让用户对着已读不回猜。
        onQueued: (ahead) => {
          void gateway.replyText({
            messageId: message.message_id,
            text: `已排队（前面还有 ${ahead} 条），处理完会依次回复。`,
          }).catch(() => {});
        },
        // 会话列表里一眼看出渠道：工作区叫「飞书 · 张三-DSH」，会话标题加「飞书 · 」前缀。
        channelLabel: '飞书',
        botLabel: bot.botName ?? bot.id,
        handlers: {
          onToolCall: (toolEvent) => {
            const name = toolEvent?.data?.name ?? '工具';
            // 提问由交互服务渲染成"提问"行，这里不再重复占一行（与 Web 一致）。
            if (name === 'ask_user_question') return;
            presenter.tool({ name, arguments: toolEvent?.data?.arguments });
          },
          // 思考（推理摘要）进同一个折叠面板：一行一条，够看轮廓即可。
          onAssistantMessage: (messageEvent) => {
            const blocks = messageEvent?.data?.message?.content;
            if (!Array.isArray(blocks)) return;
            for (const block of blocks) {
              if (block?.type !== 'reasoning' || typeof block.text !== 'string') continue;
              presenter.think(block.text);
            }
          },
          onTurnEnd: (turnEvent) => {
            const reason = turnEvent?.data?.reason;
            if (reason?.kind && reason.kind !== 'completed') {
              void presenter.think(`⚠️ 回合未正常结束：${reason.kind}`);
            }
          },
        },
      });

      activePresenters.delete(conversationKey);
      logger.info?.(`[dsh-chat-feishu] 回合结束，准备回复：${bot.id} ${conversationKey}`
        + ` reason=${result?.reason?.kind ?? 'unknown'} 文本=${(result?.text ?? '').length}字`);
      await presenter.finish(result?.text, result?.reason);
      logger.info?.(`[dsh-chat-feishu] 最终答案投递方式：${presenter.delivery?.() ?? 'unknown'}`
        + `（${bot.id} ${conversationKey}）`);
      // agent 声明交付的文件要当附件真发出去（只写在回复文字里，用户拿不到文件）。
      // 图片能内嵌进卡片（不再单发消息），普通文件只能走一条 post 消息的附件区。
      await sendDeliverables(result?.files, message, {
        replyInThread: conversationType === 'group' && bot.groupTopicReply === true,
      });
      handled += 1;
      lastHandledAt = new Date().toISOString();
      // 回合本身成功，但呈现层可能失败过（卡片建不出来等）。那也必须让设置页看得到，
      // 否则用户"没收到回复"时只能靠终端日志。
      lastError = presenter.lastError?.() ?? null;
    } catch (error) {
      activePresenters.delete(conversationKey);
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
    } finally {
      // 无论走哪条路径（命令/下载失败/模型失败/正常结束），表情都要撤掉。
      await clearWorking(message, workingReaction);
    }
  }

  /**
   * 打「在做了」表情。失败不致命（可能缺 im:message.reaction:write 权限），
   * 但一定要留日志，别让人以为是没反应。
   */
  /**
   * 把本轮 agent 交付的文件（`present` 声明的）当附件发出去。
   *
   * 失败必须可见：发不出去要回一句可读原因并写 `lastError`——"文件没收到"同样是最难
   * 排查的故障形态，不能只留一行日志。
   *
   * 全部合成**一条**消息放进 post 的附件区——真机要求：不要刷屏、不要任何文字描述，
   * 图片也算附件（所以图片不再单独内嵌进卡片）。
   *
   * @param files - `[{ path, description? }]`（来自会话桥的 `deliverables/presented`）。
   * @param message - 入站消息（用 chat_id 作为收件人）。
   * @param options - { replyInThread }。
   */
  async function sendDeliverables(files, message, { replyInThread = false } = {}) {
    if (!Array.isArray(files) || files.length === 0) return;
    // 先本地校验（存在、非空、不超限），再交给渠道一次发一条消息（飞书的 post 附件区能装多个）。
    const items = [];
    const failed = [];
    for (const file of files) {
      const path = typeof file?.path === 'string' ? file.path : '';
      if (!path) continue;
      const name = path.split('/').pop() || '交付文件';
      try {
        const info = await stat(path);
        if (!info.isFile() || info.size === 0) throw new Error('不是普通文件或内容为空');
        if (info.size > MAX_DELIVERABLE_BYTES) {
          throw new Error(`超过 ${Math.round(MAX_DELIVERABLE_BYTES / 1024 / 1024)}MB 上限`);
        }
        items.push({ path, name, size: info.size, description: file.description });
      } catch (error) {
        failed.push({ name, reason: error?.message ?? String(error) });
      }
    }
    if (items.length > 0) {
      try {
        const sent = await gateway.sendDeliverables({ chatId: message.chat_id, items });
        failed.push(...(sent?.failed ?? []));
        logger.info?.(`[dsh-chat-feishu] 交付物已发出（${bot.id}）：`
          + `${(sent?.files ?? []).join('、')}`);
      } catch (error) {
        const reason = error?.message ?? String(error);
        for (const item of items) failed.push({ name: item.name, reason });
      }
    }
    if (failed.length === 0) return;
    lastError = `交付文件发送失败：${failed.map((entry) => `${entry.name}（${entry.reason}）`).join('；')}`;
    logger.error?.(`[dsh-chat-feishu] ${lastError}`);
    try {
      await gateway.replyText({
        messageId: message.message_id,
        text: failed.map((entry) => `交付文件「${entry.name}」没能发出去：${entry.reason}`).join('\n'),
        replyInThread,
      });
    } catch {
      // 连失败说明都发不出去时，至少日志与 lastError 有记录。
    }
  }

  async function markWorking(message) {
    try {
      return await gateway.addReaction({ messageId: message.message_id, emojiType: 'OnIt' });
    } catch (error) {
      logger.info?.(`[dsh-chat-feishu] 添加表情回复失败（不影响处理）：${error?.message ?? error}`);
      return null;
    }
  }

  /** 处理完撤掉表情。 */
  async function clearWorking(message, reaction) {
    if (!reaction?.reactionId) return;
    try {
      await gateway.removeReaction({
        messageId: message.message_id,
        reactionId: reaction.reactionId,
      });
    } catch (error) {
      logger.info?.(`[dsh-chat-feishu] 撤销表情回复失败：${error?.message ?? error}`);
    }
  }

  /**
   * 菜单卡片：把命令渲染成一排按钮。
   *
   * 按钮里带的是**命令行**，点击后走与"用户手打"完全同一条命令路径，
   * 因此按钮与文本不会出现两套行为。
   */
  function menuCard(items) {
    return {
      config: { wide_screen_mode: true },
      header: { template: 'blue', title: { tag: 'plain_text', content: '机器人菜单' } },
      elements: [
        { tag: 'div', text: { tag: 'lark_md', content: '点按钮执行，也可以直接发文字命令。' } },
        {
          tag: 'action',
          actions: items.slice(0, 12).map((item) => ({
            tag: 'button',
            type: 'default',
            text: { tag: 'plain_text', content: item.label },
            value: { dsh_menu: item.command },
          })),
        },
      ],
    };
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

    // 菜单卡片：按钮里带的是命令行，走与"用户手打"同一条路径。
    if (typeof value.dsh_menu === 'string' && value.dsh_menu.startsWith('/')) {
      const groupKey = `group:${chatId}`;
      // 这个会话是群还是私聊：以已有的会话绑定为准（没有绑定时按私聊处理）。
      const conversationType = deps.sessions?.bindings?.get?.(deps.channelId, bot.id, groupKey)
        ? 'group' : 'direct';
      const key = conversationType === 'group' ? groupKey : `p2p:${operatorId}`;
      const command = await deps.commands?.handle?.({
        text: value.dsh_menu,
        channelId: deps.channelId,
        botId: bot.id,
        key,
        conversationType,
        senderId: operatorId,
        isOwner: isOwner(bot, operatorId),
        botLabel: bot.botName ?? bot.id,
        channelLabel: '飞书',
      }).catch((error) => {
        logger.warn?.(`[dsh-chat-feishu] 菜单命令失败：${error?.message ?? error}`);
        return null;
      });
      if (!command?.handled) return { toast: { type: 'error', content: '命令没有执行。' } };
      if (command.menu?.length) {
        await gateway.sendCard({ chatId, card: menuCard(command.menu) });
        return { toast: { type: 'info', content: '菜单已更新' } };
      }
      if (command.reply) {
        if (event.messageId) {
          await gateway.replyText({ messageId: event.messageId, text: command.reply });
        } else {
          await gateway.sendText({ chatId, text: command.reply });
        }
      }
      return { toast: { type: 'success', content: '已执行' } };
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

    // 表单提交（勾选器 / 文本输入框）：值在 action.form_value[组件name]。
    // 组件名约定：`chk_<序号>_<问题id>`（勾选器，值为布尔）、`text_<问题id>`（输入框）。
    const formValue = event?.action?.formValue ?? {};
    const formEntries = Object.entries(formValue)
      .filter(([field]) => field.startsWith('chk_') || field.startsWith('multi_') || field.startsWith('text_'));
    const truthy = (raw) => raw === true || raw === 'true' || raw === 1 || raw === '1';
    let label = '';
    let questionId;
    if (formEntries.length > 0) {
      const picked = [];
      for (const [field, raw] of formEntries) {
        if (field.startsWith('chk_')) {
          // 勾选器：只认"被勾上"的；标签从桥记住的批次里按 序号 + 问题id 反查
          const matched = /^chk_(\d+)_(.+)$/.exec(field);
          if (!matched || !truthy(raw)) continue;
          const [, indexText, id] = matched;
          questionId = id;
          const question = questionBatches.get(`p2p:${operatorId}`)?.questions?.find((item) => item?.id === id)
            ?? questionBatches.get(`group:${chatId}`)?.questions?.find((item) => item?.id === id);
          const optionLabel = question?.options?.[Number(indexText)]?.label;
          if (typeof optionLabel === 'string' && optionLabel) picked.push(optionLabel);
          continue;
        }
        questionId = field.slice(field.indexOf('_') + 1);
        if (field.startsWith('multi_')) {
          for (const item of Array.isArray(raw) ? raw : [raw]) {
            if (typeof item === 'string' && item.trim()) picked.push(item.trim());
          }
        } else if (typeof raw === 'string' && raw.trim()) {
          picked.push(raw.trim());
        }
      }
      // 多选拼接用「、」：hub 的 parseAnswer 对多选正是按 、/, 拆开，解析路径与按钮一致。
      label = picked.join('、');
      if (!label) {
        logger.info?.(`[dsh-chat-feishu] 卡片表单提交没有内容（${bot.id} ${operatorId}）`);
        return { toast: { type: 'info', content: '还没有勾选或填写内容。' } };
      }
    } else if (value.dsh === 'answer') {
      label = typeof value.label === 'string' ? value.label : '';
      questionId = typeof value.questionId === 'string' ? value.questionId : undefined;
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
        questionId: questionId || (typeof value.questionId === 'string' ? value.questionId : undefined),
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
