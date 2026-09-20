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
import { panelAction, panelButton, panelCard, panelPick } from './panel-card.mjs';

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

/** 命令清单卡一行放几个按钮（超出的换到下一行，绝不截断命令）。 */
const MENU_ROW_SIZE = 4;

/**
 * 交互回传的卡片重画要**等回调应答先发出去**，再动手（默认延迟）。
 *
 * 飞书客户端在回调应答落地时会把卡片还原成"用户点击前"的快照：先更新再应答 = 更新被还原，
 * 真机表现就是"卡片闪一下又变回原样"，而日志里那次 update 明明是成功的。
 * 延迟更新接口本来就是为"应答之后再更新"设计的（token 30 分钟内有效）。
 */
const RESPONSE_SETTLE_MS = 50;

/**
 * 读"被引用的消息"的时限：它是为了让提示词更完整，**不能拖住用户的提问**。
 * 超时就当"引用内容不可用"，当前消息照常进模型。
 */
const REPLY_REFERENCE_TIMEOUT_MS = 3000;

/** 卡片上的时间戳（本地 时:分:秒）：让"停在哪一次更新"在卡上可核对。 */
function panelClock() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/**
 * 一行按钮（Card 2.0）：按钮必须放在 `column_set` 的列里，1.0 那套 `tag: 'action'` 不适用。
 *
 * @param items - `[{ label, value, type? }]`。
 * @returns column_set 元素。
 */
function buttonRow(items) {
  return {
    tag: 'column_set',
    flex_mode: 'none',
    columns: items.map((item) => ({
      tag: 'column',
      width: 'weighted',
      weight: 1,
      elements: [{
        tag: 'button',
        type: item.type ?? 'default',
        width: 'fill',
        text: { tag: 'plain_text', content: item.label },
        behaviors: [{ type: 'callback', value: item.value }],
      }],
    })),
  };
}

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
 * 是否本机器人的属主（属主绕过访问策略）。
 *
 * 规则在 `shared/access-policy.mjs`（所有渠道一致）：`ownerOpenIds` 里的 `*` 表示
 * **没有记录属主**（公开机器人），**不授权任何人绕过策略**。上游 dsh-im 把它当成
 * "人人都是属主"，结果这台机器人的访问策略完全失效——名单外的人 @ 一下就能用。
 *
 * @param bot - 机器人配置。
 * @param senderId - 发送者 open_id。
 * @returns true 表示属主。
 */
function isOwner(policyService, bot, senderId) {
  // 规则实现在 hub 的 access-policy 里，渠道经运行期服务取用（不 import hub 包）。
  // 服务缺席时返回 false：那样"没人绕过策略"，是保守方向。
  return policyService?.isOwnerId?.(bot.ownerOpenIds, senderId) === true;
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

  /**
   * 延迟交付：`ask()` 超时之后那一轮要是自己跑完了，hub 会把结果交回这里补发。
   *
   * 补发**只发文字**（不重画面板卡）：它可能是几十分钟后的一轮，卡片早换了上下文。
   * 前面加一句说明，免得用户以为机器人精神了。
   */
  deps.deferred?.register?.({
    channelId: deps.channelId,
    botId: bot.id,
    deliver: async ({ key, text }) => {
      await sendToConversation({
        key,
        text: `（上一轮超时之后跑完了，补发结果）\n\n${text}`,
      });
      logger.info?.(`[dsh-chat-feishu] 延迟交付已补发：${bot.id} ${key} ${text.length} 字`);
    },
  });

  /** 会话键 → 已经发出去的那张提问卡片（回答后就地更新，不再新发消息）。 */
  const questionCards = new Map();
  /** 会话键 → 最近一次渲染用的批次（勾选器要把序号反查成选项原文，得知道原样数据）。 */
  const questionBatches = new Map();
  /** 会话键 → 本轮"正在处理"那张卡（提问优先内嵌进它，答完收起）。 */
  const activePresenters = new Map();


  /**
   * 卡片路径的失败也要落 `lastError`。
   *
   * `connection.status` 是排查"点了卡片没反应"的第一站（排查顺序见 AGENTS.md），
   * 只写日志等于现场只留在一个地方——"发了没反应"这类故障已经栽过两次。
   */
  function noteCardError(what, reason) {
    lastError = `${what}：${reason}`;
    logger.error?.(`[dsh-chat-feishu] ${lastError}`);
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
      if (sent?.messageId) {
        questionCards.set(key, sent.messageId);
        // 记下"这张卡是发给哪个会话的"：回调里只有 chatId，而群和私聊的 chat_id 长得一样，
        // 缺了这条映射就只能在"群已解绑 + 点击者有私聊绑定"时判错方向，把群卡按私聊放行。
        rememberCardConversation(sent.messageId, key);
      }
      if (final) {
        questionCards.delete(key);
        questionBatches.delete(key);
      }
    },
    sendApproval: async ({ key, request }) => {
      try {
        const sent = await gateway.sendApprovalCard({ ...routeOf(key), request });
        // 同提问卡：审批卡也要留下会话映射，否则身份门禁可能按错的会话类型判。
        if (sent?.messageId) rememberCardConversation(sent.messageId, key);
      } catch (error) {
        noteCardError('审批卡片发送失败，已回退为文本', error?.message ?? error);
        await sendToConversation({ key, text: '⚠️ 需要授权：回复「允许」执行一次，或「拒绝」取消。' });
      }
    },
  });

  /**
   * 用户**引用/回复**了一条消息：把被引用的内容取回来交给 hub 拼提示词。
   *
   * 飞书的事件里只有 `parent_id`（正文要再查一次），所以这一步是"一次有界的延迟查询"：
   * - 超时（3 秒）、读不到（删除/无权限）、不是引用 → 都只影响引用块，**当前的提问照常进模型**；
   * - 读不到时给 hub 一个 `reason`，由它放一句"引用内容不可用"的结构化标记（不丢当前问题，也不假装没引用）。
   */
  async function resolveReplyReference(message) {
    const parentId = message?.parent_id ?? message?.parentId ?? null;
    if (typeof parentId !== 'string' || !parentId) return null;
    const timeout = new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ timedOut: true }), REPLY_REFERENCE_TIMEOUT_MS);
      timer.unref?.();
    });
    try {
      const fetched = await Promise.race([
        gateway.getMessageText({ messageId: parentId }),
        timeout,
      ]);
      if (fetched?.timedOut) {
        logger.warn?.(`[dsh-chat-feishu] 读被引用的消息超时：${parentId}`);
        return { messageId: parentId, reason: '读取超时' };
      }
      return {
        messageId: fetched.messageId ?? parentId,
        senderId: fetched.senderId ?? null,
        kind: fetched.kind ?? 'text',
        text: fetched.text ?? '',
        fileName: fetched.fileName ?? null,
      };
    } catch (error) {
      // 不静默：引用读不到要留痕，同时让模型知道"引用内容不可用"。
      logger.warn?.(`[dsh-chat-feishu] 读被引用的消息失败（${parentId}）：${error?.message ?? error}`);
      return { messageId: parentId, reason: error?.message ?? String(error) };
    }
  }

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
      isOwner: isOwner(deps.accessPolicy, bot, senderId),
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
      const commandAccess = commandAccessFor({
        senderId,
        conversationType,
        accessPolicy,
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
        isOwner: isOwner(deps.accessPolicy, bot, senderId),
        botLabel: bot.botName ?? bot.id,
        channelLabel: '飞书',
      }).catch((error) => {
        logger.warn?.(`[dsh-chat-feishu] 命令处理失败：${error?.message ?? error}`);
        return null;
      });
      if (command?.handled) {
        /**
         * 控制面板优先：`/menu` 在飞书发的是**可交互卡**（下拉直接选模型/推理/预设/工作区），
         * 发不出去再退回命令清单卡，最后退回文本——一层层退，绝不静默。
         */
        if (command.panel && message.chat_id) {
          const sent = await renderPanel({
            chatId: message.chat_id, key: conversationKey, panel: command.panel, source: 'menu',
            // 手打 /menu：新发一张，别把老卡（可能已经滚到看不到的地方）当成回应。
            fresh: true,
          });
          if (sent) {
            lastHandledAt = new Date().toISOString();
            await clearWorking(message, workingReaction);
            return;
          }
        }
        if (command.menu?.length && message.chat_id) {
          try {
            const sent = await gateway.sendCard({ chatId: message.chat_id, card: menuCard(command.menu) });
            // 这张卡也要记住会话：否则它的按钮回调只能靠启发式，群里可能被判成私聊。
            rememberCardConversation(sent?.messageId, conversationKey);
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
      // 引用回复：用户引用了某条消息（飞书只给 parent_id，正文要再查一次）。
      const replyTo = await resolveReplyReference(message);
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
      /**
       * 引用块在**来源块之后、正文之前**：先"这条消息从哪来"，再"用户在回复哪条"，最后才是问题本身。
       * 拼装本身在 hub（`enhanceReplyReference`），渠道只负责把平台字段映射成 `reply`。
       */
      const withReply = (content) => (typeof deps.replyReference?.enhanceReplyReference === 'function'
        ? deps.replyReference.enhanceReplyReference(content, replyTo)
        : content);
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
      if (replyTo) finalParts = withReply(finalParts);

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
   * 命令清单卡（Card 2.0）：把命令渲染成一组按钮。
   *
   * 按钮里带的是**命令行**，点击后走与"用户手打"完全同一条命令路径，
   * 因此按钮与文本不会出现两套行为。
   *
   * 必须是 2.0：控制面板也是 2.0，飞书**不允许 patch 时换 schema**
   * （真机报 `230099 schemaV2 card can not change schemaV1`），
   * 所以两张卡用同一套 schema 才能互相切换。
   *
   * `last`（`{ command, reply }`）是"上一次点了什么、结果是什么"：点完就地更新时把它
   * 渲染进卡片正文——否则点一下只多了条新消息，用户看不出自己点到了没有（真机反馈过）。
   */
  function menuCard(items, last = null) {
    const elements = [
      { tag: 'markdown', content: '点按钮执行，也可以直接发文字命令。' },
    ];
    if (last?.command) {
      // 输出可能很长（/status 之类）：截断，免得一张卡片刷满整屏。
      const reply = String(last.reply ?? '').trim();
      const shown = reply.length > 800 ? `${reply.slice(0, 800)}…` : reply;
      elements.push({ tag: 'hr' });
      elements.push({ tag: 'markdown', content: `**${last.command}**\n${shown || '（没有输出）'}` });
    }
    /**
     * 一行放几个按钮。以前是 `items.slice(0, 12)`——恰好把字母序后半截命令**静默丢掉**：
     * 真机上 17 个命令只列出 12 个，`/session` `/status` `/stop` `/version` `/whoami`
     * 在卡片上根本找不到（只能手打）。宁可多开几行，也不能少命令。
     */
    for (let index = 0; index < items.length; index += MENU_ROW_SIZE) {
      elements.push(buttonRow(items.slice(index, index + MENU_ROW_SIZE).map((item) => ({
        label: item.label,
        value: { dsh_menu: item.command },
      }))));
    }
    // 从控制面板点「命令清单」进来时，卡上要有一条回去的路（否则用户只能重发 /menu）。
    elements.push(buttonRow([{ label: '⬅ 返回控制面板', value: { dsh_panel: 'panel' }, type: 'primary' }]));
    return {
      schema: '2.0',
      config: { update_multi: true, width_mode: 'default' },
      header: { template: 'blue', title: { tag: 'plain_text', content: '机器人菜单' } },
      body: { direction: 'vertical', elements },
    };
  }

  /**
   * 取一份当前的菜单项（点完按钮后要就地重画按钮，得知道按钮原来有哪些）。
   *
   * 重新问一次命令内核，而不是把菜单塞进按钮的 value 里：按钮值只带命令行，
   * 菜单本身就是 `/menu` 的输出，重问一次永远是最新的（且没有副作用）。
   */
  async function menuItemsFor(context) {
    const result = await deps.commands?.handle?.({ ...context, text: '/menu' }).catch((error) => {
      logger.warn?.(`[dsh-chat-feishu] 重取菜单失败：${error?.message ?? error}`);
      return null;
    });
    return result?.menu?.length ? result.menu : [];
  }

  /** 读一次控制面板状态；拿不到就返回 null（调用方退回命令清单/文本）。 */
  async function readPanel(context) {
    if (typeof deps.panel?.read !== 'function') return null;
    return deps.panel.read({
      channelId: deps.channelId, botId: bot.id, key: context.key,
      // 工作区候选只给属主：群里的卡片所有人都能展开。
      isOwner: context.isOwner === true,
      // 渠道自带字段（任务过程展示）要按私聊/群聊分别取值。
      conversationType: context.conversationType ?? null,
    }).catch((error) => {
      logger.warn?.(`[dsh-chat-feishu] 读取控制面板失败：${error?.message ?? error}`);
      return null;
    });
  }

  /**
   * 画一次控制面板：优先就地更新（`messageId`），否则新发一张。
   *
   * 失败一定留痕：patch 失败先 warn，再尝试新发；新发也失败就返回 false，
   * 由调用方退回文本（"点了没反应"是本项目最怕的故障形态）。
   */
  /**
   * 每个会话"当前那张控制面板卡"的消息 id。
   *
   * 为什么要记：不记的话每次 `/m` 都新发一张，聊天里就堆着好几张几乎一样的卡
   * （真机上就是这么把用户绕晕的：他点的是一张，看到的却是另一张，看起来像"变回去了"）。
   * 记的是进程内存，重启后失效——那时 patch 会失败，我们新发一张并重新记住。
   */
  const panelCards = new Map(); // 会话键 → messageId

  /**
   * 待确认的改动（卡片消息 id → `{ field, value, prompt }`）。
   *
   * 只有"放宽访问策略"这类动作需要它：下拉选完先不落盘，把确认做在**同一张卡**上。
   * 存内存：确认是几秒钟内的交互，重启/换卡后过期——那时如实说"这次确认已失效"，不静默改设置。
   */
  const pendingConfirms = new Map();

  /**
   * 画一次控制面板：优先更新"本会话已有的那张"，其次 patch 调用方给的消息 id，最后新发。
   *
   * @param options - { chatId, key, messageId?, panel, last?, source }。
   *   `key` 是会话键（p2p:… / group:…），用于复用同一张卡；`messageId` 是用户刚点的那张卡。
   */
  async function renderPanel({
    chatId, key = null, messageId = null, panel, last = null, source = 'unknown', token = null,
    fresh = false, pending = null,
  }) {
    // 标题带上本次渲染时间：聊天里可能有多张面板卡（旧卡、重启前的卡），
    // "哪张是刚更新的"必须一眼可辨，否则用户会以为卡片"变回去了"。
    const card = panelCard(panel, { last, at: last?.at ?? panelClock(), pending });
    /** 三条路都失败才算渲染失败：中间失败有兜底，不该把状态页写成"出错了"。 */
    const renderErrors = [];
    /**
     * 目标消息的挑选，按"谁发起"分两种：
     *
     * - **手打 `/menu`（`fresh`）→ 新发一张**。用户刚发了一条消息，就期待下面出现回应；
     *   复用并 patch 上面那张老卡会让聊天里**一条新消息都没有**，真机上就是"发 /menu 没反应"
     *   （卡片其实在历史里被就地更新了）。
     * - **卡片交互 → 更新被点的那张**（有 `messageId`）；回调没带 messageId 时退回复用本会话记住的那张。
     */
    const known = key ? panelCards.get(key) : null;
    const targets = fresh ? [] : [messageId, messageId ? null : known].filter(Boolean);
    // 每次渲染都留痕：卡上"停在哪一次更新"与日志能对上（排查"卡片被回滚"这类问题时唯一现场）。
    logger.info?.(`[dsh-chat-feishu] 渲染控制面板 source=${source}`
      + ` key=${key ?? '无'} 目标=${targets[0] ?? '新发'} token=${token ? '有' : '无'}`
      + ` last=${last?.label ?? '无'}${last?.at ? `@${last.at}` : ''}`
      + ` 字节=${JSON.stringify(card).length}`);
    /**
     * 交互驱动（有点击回调带来的 token）→ 必须走延迟更新接口。
     *
     * 这不是风格问题：飞书要求一次卡片交互里的更新用回调的 token 调
     * `/interactive/v1/card/update`，用 `message.patch` 会被客户端还原
     * ——真机上就是"卡片变了一下又变回去"。token 只有 2 次机会、30 分钟有效，
     * 失败（用完了）就退回 patchCard，再不行新发一张。
     */
    if (token && messageId) {
      const updated = await gateway.updateCard({ token, card }).then(() => true).catch((error) => {
        renderErrors.push(`token 路径 ${error?.message ?? error}`);
        logger.warn?.(`[dsh-chat-feishu] 控制面板延迟更新失败（token 路径）：${error?.message ?? error}`);
        return false;
      });
      if (updated) {
        if (key) panelCards.set(key, messageId);
        if (key) rememberCardConversation(messageId, key);
        logger.info?.(`[dsh-chat-feishu] 控制面板已就地更新（token 路径 ${messageId}）`);
        return true;
      }
    }
    for (const target of targets) {
      const patched = await gateway.patchCard({ messageId: target, card }).then(() => true).catch((error) => {
        renderErrors.push(`patch ${target} ${error?.message ?? error}`);
        logger.warn?.(`[dsh-chat-feishu] 控制面板就地更新失败（${target}）：${error?.message ?? error}`);
        return false;
      });
      if (patched) {
        if (key) panelCards.set(key, target);
        if (key) rememberCardConversation(target, key);
        logger.info?.(`[dsh-chat-feishu] 控制面板已就地更新（patch 路径 ${target}）`);
        return true;
      }
    }
    const sent = await gateway.sendCard({ chatId, card }).then((result) => result ?? {}).catch((error) => {
      renderErrors.push(`新发 ${error?.message ?? error}`);
      logger.warn?.(`[dsh-chat-feishu] 控制面板发送失败：${error?.message ?? error}`);
      return null;
    });
    if (sent) {
      if (key && typeof sent.messageId === 'string' && sent.messageId) panelCards.set(key, sent.messageId);
      if (key && typeof sent.messageId === 'string' && sent.messageId) {
        rememberCardConversation(sent.messageId, key);
      }
      logger.info?.(`[dsh-chat-feishu] 控制面板已新发一张（${bot.id} ${sent.messageId ?? '未知id'}）`);
    }
    if (!sent) noteCardError('控制面板渲染失败', renderErrors.join('；') || '未知原因');
    return Boolean(sent);
  }

  /**
   * 交互回传的身份门禁：**只免命令权限**，其余照判（谁能替属主批准/回答）。
   * 与手打同样内容走的是同一条放行规则，避免"文字被挡、点按钮却能过"。
   */
  function evaluateInteractionAccess({ senderId, conversationType }) {
    const policy = deps.storage?.read?.(bot.id)?.accessPolicy;
    return deps.accessPolicy.evaluateAccess({
      policy,
      conversationType,
      senderIds: [senderId],
      isCommand: false,
      isOwner: isOwner(deps.accessPolicy, bot, senderId),
    });
  }

  /**
   * 命令权限判定：**手打文字与卡片动作共用同一条**。
   *
   * 为什么要共用（真机上的洞）：一开始只有"手打文字"这条路过了门禁，卡片按钮直接执行命令
   * ——群聊里任何能看到卡片的人点一下按钮就能跑命令，绕过了命令权限。卡片上的每个动作
   * 与手打同权，这是 dsh-im 的做法（`evaluateInboundAccess(..., isCommand: true)`）。
   *
   * @param options - { senderId, conversationType, accessPolicy }。
   *   `accessPolicy` 由调用方先读过时可直接传入，省一次读盘。
   */
  function commandAccessFor({ senderId, conversationType, accessPolicy: knownPolicy }) {
    const policy = knownPolicy ?? deps.storage?.read?.(bot.id)?.accessPolicy;
    return deps.accessPolicy.evaluateAccess({
      policy,
      conversationType,
      senderIds: [senderId],
      isCommand: true,
      isOwner: isOwner(deps.accessPolicy, bot, senderId),
    });
  }

  /**
   * 记住"这张卡片是我们发给哪个会话的"。
   *
   * 卡片回调里只有 chatId，而**群和私聊的 chat_id 长得一样**（都是 `oc_…`），
   * 光看绑定推断会判错：群里第一条交互（比如刚发的 /menu）还没有群绑定时，
   * 就会被当成私聊，于是"新会话"解掉的是操作者私聊的绑定、模型也改到私聊会话上。
   * 所以"发卡时记住它是哪个会话的"是唯一可靠的判据——而且**必须落盘**
   * （`state.json`），否则重启后又只能靠猜。
   */
  function rememberCardConversation(messageId, key) {
    state?.rememberCard?.(messageId, key);
  }

  /**
   * 卡片动作属于哪个会话（群还是私聊）以及会话键。
   *
   * 判据从可靠到保守：
   * ① 这张卡是我们发的 → 用发卡时记下的会话键（落盘，重启后仍在）；
   * ② 该会话已有绑定 → 用绑定的那一侧；
   * ③ 都没有 → **按群处理**。判错方向的代价不对称：判成私聊会解错绑定、还会放宽命令门禁。
   */
  function conversationForCard(chatId, operatorId, messageId = null) {
    const groupKey = `group:${chatId}`;
    const p2pKey = `p2p:${operatorId}`;
    const known = messageId ? state?.cardConversation?.(messageId) : null;
    if (known) {
      return { conversationType: known.startsWith('group:') ? 'group' : 'direct', key: known };
    }
    const groupBound = deps.sessions?.bindings?.get?.(deps.channelId, bot.id, groupKey);
    const p2pBound = deps.sessions?.bindings?.get?.(deps.channelId, bot.id, p2pKey);
    // 保守方向：拿不准就当群。判成私聊会解错绑定、并让 direct 作用域的策略生效。
    const isGroup = groupBound ? true : !p2pBound;
    return { conversationType: isGroup ? 'group' : 'direct', key: isGroup ? groupKey : p2pKey };
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

    // 与 accept() 对齐：设置与绑定都要等 hub 读完盘，否则启动窗口内会读到空文档，
    // 门禁退化成"无策略"把**非属主**误拒（属主因 isOwner 绕过，现象只出在别人身上）。
    await deps.ready?.();

    const { conversationType, key } = conversationForCard(chatId, operatorId, event.messageId ?? null);

    /**
     * 门禁：非交互的卡片动作等同于命令，先判权限再动手。
     *
     * 提问/审批按钮是"人在环回传"，不走命令门禁（dsh-im 同样把它们排除在外）——
     * 它们本来只对已经进得来的消息负责，加命令门禁反而会让提问卡点不动。
     * 但**审批不只免命令权限**：谁能替属主批准是另一回事，见下面 `value.dsh === 'approval'` 处的身份门禁。
     */
    /**
     * 交互回传的三种形态：
     * - 单选按钮 / 审批按钮：`value.dsh = 'answer' | 'approval'`；
     * - **表单提交（多选勾选器、自由文本框）：飞书没有 form_submit 事件**，它是
     *   `action.tag='button'` + `action.form_value` 有值、`action.value` 为空。
     *   漏掉这一种，默认策略下"能对话、不能执行命令"的人就永远提交不了回答（功能性回归）。
     */
    const formFields = Object.keys(event?.action?.formValue ?? {});
    const isFormSubmit = formFields.some((field) => /^(chk_|multi_|text_)/u.test(field));
    const isInteractionResponse = value.dsh === 'answer' || value.dsh === 'approval' || isFormSubmit;
    if (!isInteractionResponse) {
      const commandAccess = commandAccessFor({ senderId: operatorId, conversationType });
      if (!commandAccess.allowed) {
        logger.warn?.(`[dsh-chat-feishu] 卡片动作被命令门禁拒绝：${bot.id}`
          + ` sender=${operatorId}（${commandAccess.reason}）`);
        if (event.messageId) {
          await gateway.replyText({
            messageId: event.messageId,
            text: '你没有执行机器人命令的权限。',
          }).catch(() => {});
        }
        return { toast: { type: 'error', content: '你没有执行机器人命令的权限。' } };
      }
    }

    // 控制面板：一个共用上下文（读状态、应用选择、重画卡片、执行命令都用它）。
    const viewerIsOwner = isOwner(deps.accessPolicy, bot, operatorId);
    const panelContext = {
      channelId: deps.channelId, botId: bot.id, key, conversationType,
      // 面板要按属主判机器人级字段（preset / workspace）。
      isOwner: viewerIsOwner,
    };
    const commandContext = {
      ...panelContext,
      senderId: operatorId,
      isOwner: viewerIsOwner,
      botLabel: bot.botName ?? bot.id,
      channelLabel: '飞书',
    };
    /**
     * 这张卡当前有没有待确认的改动（重启后内存里没有 → 显示"已失效"）。
     *
     * 只有"点的是我们自己发的卡"时才认：messageId 缺失（例如回调没带）时不敢乱认。
     */
    function pendingForCard(messageId, { expired = false } = {}) {
      if (!messageId) return expired ? { prompt: '', expired: true } : null;
      const found = pendingConfirms.get(messageId);
      if (found) return found;
      return expired ? { prompt: '', expired: true } : null;
    }

    /** 重画控制面板：读最新状态，并把"上一次做了什么、结果如何"画上去。 */
    async function repaintPanel(last = null, source = 'unknown', pending = null) {
      const state = await readPanel(commandContext);
      if (!state) {
        logger.warn?.(`[dsh-chat-feishu] 控制面板状态读取失败，无法重画（source=${source}）`);
        return false;
      }
      return renderPanel({
        chatId, key, messageId: event.messageId ?? null, panel: state,
        last: last ? { at: panelClock(), ...last } : null,
        source,
        // 用回调带来的延迟更新 token —— 交互后的卡片更新只能走这条路。
        token: event.token ?? null,
        pending,
      });
    }

    /**
     * 把一次卡片更新排到**回调应答之后**执行。
     *
     * 默认实现是"下一个宏任务 + 一点缓冲"：SDK 在 handler 的 promise 落地后才把应答发回飞书，
     * 所以宏任务一定晚于应答的发送。测试可注入 `deps.scheduleAfterResponse` 收集这些任务，
     * 从而显式断言"重画发生在应答之后"。
     */
    function afterResponse(task) {
      if (typeof deps.scheduleAfterResponse === 'function') {
        deps.scheduleAfterResponse(task);
        return;
      }
      const timer = setTimeout(() => { void task(); }, RESPONSE_SETTLE_MS);
      timer.unref?.();
    }

    /** 应答之后重画控制面板。失败照旧可见（日志 + `lastError`），只是不能进 toast 了。 */
    function repaintAfterResponse(last, source, pending = null) {
      afterResponse(() => repaintPanel(last, source, pending).then((ok) => {
        if (!ok) noteCardError(`控制面板应答后重画失败（${source}）`, '未画出，见上面的 warn');
      }).catch((error) => {
        noteCardError(`控制面板应答后重画失败（${source}）`, error?.message ?? error);
      }));
    }

    /**
     * 应答之后就地更新当前卡片（按钮/命令清单这类"把这张卡换成另一张卡"的场景）。
     *
     * 优先用交互带来的延迟更新 token，没有或失败再退回 `message.patch`——patch 只在
     * "应答已经落地"之后才有用，顺序反了会被客户端还原。
     */
    function refreshCardAfterResponse({ card, label, fallbackText = '' }) {
      afterResponse(async () => {
        /** 三条路都没成时退回"回一句话"，用户不会什么都收不到。 */
        const fallback = async () => {
          if (!fallbackText) return;
          await gateway.replyText({ messageId: event.messageId, text: fallbackText }).catch(() => {});
        };
        if (typeof event.token === 'string' && event.token) {
          try {
            await gateway.updateCard({ token: event.token, card, openIds: [operatorId] });
            logger.info?.(`[dsh-chat-feishu] ${label}已就地更新（token 路径）`);
            return;
          } catch (error) {
            logger.warn?.(`[dsh-chat-feishu] ${label}延迟更新失败，改用 patch：${error?.message ?? error}`);
          }
        }
        if (!event.messageId) {
          await fallback();
          return;
        }
        try {
          await gateway.patchCard({ messageId: event.messageId, card });
          logger.info?.(`[dsh-chat-feishu] ${label}已就地更新（patch 路径）`);
        } catch (error) {
          noteCardError(`${label}就地更新失败`, error?.message ?? error);
          await fallback();
        }
      });
    }

    /**
     * 下拉（select_static）：`behaviors.callback` 直接回调，选中值在 `event.action.options`。
     *
     * 这是这次改造的核心：选完立即生效并把同一张卡片重画（成功 ✅、失败 ❌ 带原因），
     * 不需要再点提交、也不需要用户记命令。
     */
    const pick = panelPick(value.action, event?.action?.options);
    if (pick) {
      logger.info?.(`[dsh-chat-feishu] 控制面板下拉：${value.action}=${pick.invalid ? '<没认出取值>' : pick.value}（${bot.id}）`);
      if (pick.invalid) {
        // 认不出取值时必须报错：当成"恢复默认"会静默清掉推理等级/预设，还画一个 ✅。
        logger.warn?.('[dsh-chat-feishu] 控制面板下拉取值没认出来，已拒绝这次修改'
          + `（action=${value.action} options=${JSON.stringify(event?.action?.options ?? null)}`
          + ` 原始=${JSON.stringify(event?.action?.value ?? null)}）`);
        return {
          toast: { type: 'error', content: '没认出这次选择，请重试（也可以手打 /model 等命令）。' },
        };
      }
      try {
        const applied = await deps.panel.apply({ ...panelContext, field: pick.field, value: pick.value });
        const message = applied?.message ?? '已生效。';
        /**
         * 需要二次确认（放宽访问策略）：**先不落盘**，把确认画在同一张卡上。
         * 用 toast 说"需要确认"是不够的——toast 会消失，用户过两秒就不知道在确认什么。
         */
        if (applied?.requiresConfirm === true) {
          const pending = { field: pick.field, value: pick.value, prompt: applied.confirmPrompt ?? message };
          if (event.messageId) pendingConfirms.set(event.messageId, pending);
          else logger.warn?.('[dsh-chat-feishu] 这次回调没带 messageId，二次确认只能靠卡片上的提示');
          repaintAfterResponse({ label: pick.label, message, ok: true }, `pick:${value.action}(待确认)`, pending);
          return { toast: { type: 'info', content: '这次改动需要确认，请在卡片上点「✅ 确认」。' } };
        }
        if (event.messageId) pendingConfirms.delete(event.messageId);
        // 重画排在应答之后：先更新再应答会被客户端还原（"闪一下又变回去"）。
        repaintAfterResponse({ label: pick.label, message, ok: true }, `pick:${value.action}`);
        return { toast: { type: 'success', content: message.slice(0, 80) } };
      } catch (error) {
        // 失败必须可见：日志 + 卡片上的 ❌ 一行 + 错误 toast。
        noteCardError(`控制面板应用失败（${pick.field}=${pick.value}）`, error?.message ?? error);
        const message = error?.message ?? String(error);
        // 这一步同样要排在应答之后，否则 ❌ 也会被还原。
        repaintAfterResponse({ label: pick.label, message, ok: false }, `pick:${value.action}(失败)`);
        return { toast: { type: 'error', content: message.slice(0, 80) } };
      }
    }

    /**
     * 卡片上的「✅ 确认 / ↩️ 取消」（面板下拉触发的二次确认）。
     *
     * 确认时才带着 `confirm: true` 再调一次 `panel.apply`——hub 侧只有在 `confirm: true` 时才落盘，
     * 所以"误点一下"永远改不了设置。找不到待确认项（重启/换卡后）就如实说失效，绝不猜值。
     */
    if (value.dsh_cancel === true) {
      if (event.messageId) pendingConfirms.delete(event.messageId);
      repaintAfterResponse({ label: '取消改动', message: '已取消，什么都没改。', ok: true }, 'cancel');
      return { toast: { type: 'info', content: '已取消。' } };
    }
    if (value.dsh_confirm === true) {
      const pending = event.messageId ? pendingConfirms.get(event.messageId) : null;
      if (!pending) {
        logger.warn?.(`[dsh-chat-feishu] 收到确认但找不到待确认项（${event.messageId ?? '无 messageId'}）`);
        repaintAfterResponse(
          { label: '确认已失效', message: '这次确认已失效，请重新选一次。', ok: false },
          'confirm(失效)',
          { prompt: '', expired: true },
        );
        return { toast: { type: 'error', content: '这次确认已失效，请重新选一次。' } };
      }
      try {
        const applied = await deps.panel.apply({
          ...panelContext, field: pending.field, value: pending.value, confirm: true,
        });
        const message = applied?.message ?? '已生效。';
        pendingConfirms.delete(event.messageId);
        repaintAfterResponse({ label: '已确认', message, ok: true }, 'confirm');
        return { toast: { type: 'success', content: message.slice(0, 80) } };
      } catch (error) {
        noteCardError(`控制面板确认失败（${pending.field}=${pending.value}）`, error?.message ?? error);
        const message = error?.message ?? String(error);
        pendingConfirms.delete(event.messageId);
        repaintAfterResponse({ label: '确认失败', message, ok: false }, 'confirm(失败)');
        return { toast: { type: 'error', content: message.slice(0, 80) } };
      }
    }

    /**
     * 渠道自带的动作按钮（飞书：重连）：交给渠道自己的 `panel.act` 执行。
     *
     * 它是机器人级操作（重连会断开长连接），能不能点由**渠道**按 `isOwner` 判——
     * hub 只透传，失败照旧把 code/message 原样交给用户看。
     */
    const channelAction = panelAction(value);
    if (channelAction) {
      logger.info?.(`[dsh-chat-feishu] 控制面板动作：${channelAction.action}（${bot.id}）`);
      try {
        const done = await deps.panel.act({ ...panelContext, action: channelAction.action });
        const message = done?.message ?? '已执行。';
        repaintAfterResponse({ label: channelAction.label, message, ok: true }, `act:${channelAction.action}`);
        return { toast: { type: 'success', content: message.slice(0, 80) } };
      } catch (error) {
        noteCardError(`控制面板动作失败（${channelAction.action}）`, error?.message ?? error);
        const message = error?.message ?? String(error);
        repaintAfterResponse({ label: channelAction.label, message, ok: false }, `act:${channelAction.action}(失败)`);
        return { toast: { type: 'error', content: message.slice(0, 80) } };
      }
    }

    /**
     * 面板按钮：新会话就地生效并重画；命令清单切到命令卡（卡上有「返回控制面板」）；
     * 状态/停止复用命令行，输出画回面板。
     */
    let fromPanel = false;
    if (typeof value.dsh_panel === 'string') {
      const action = panelButton(value.dsh_panel);
      logger.info?.(`[dsh-chat-feishu] 控制面板按钮：${value.dsh_panel} → ${JSON.stringify(action ?? null)}（${bot.id}）`);
      if (!action) return { toast: { type: 'error', content: '这个按钮已经失效了，请重发 /menu。' } };
      /**
       * 输出是**文本**、执行还可能很慢的命令（历史/压缩）：应答之后再跑，结果用一条文字消息回。
       *
       * 两个原因：① 飞书要求回调在 3 秒内应答，压缩动辄更久；② 历史可能几十行，
       * 写进面板卡会把设置区整个埋掉（卡片也有大小上限）。
       */
      if (action.asText) {
        const text = action.command;
        afterResponse(async () => {
          const result = await deps.commands?.handle?.({ ...commandContext, text })
            .catch((error) => {
              noteCardError(`面板命令失败（${text}）`, error?.message ?? error);
              return null;
            });
          const reply = result?.reply ?? '（没有输出）';
          await gateway.replyText({ messageId: event.messageId, text: reply }).catch((error) => {
            noteCardError(`面板命令回文字失败（${text}）`, error?.message ?? error);
          });
        });
        return { toast: { type: 'info', content: `正在执行 ${text}…` } };
      }
      if (action.panel) {
        repaintAfterResponse(null, 'button:panel');
        // 同上：不宣称"已回到"，等应答之后的这次重画落地（失败落 lastError）。
        return { toast: { type: 'info', content: '正在返回控制面板…' } };
      }
      if (action.menu) {
        const items = await menuItemsFor(commandContext);
        if (items.length > 0 && event.messageId) {
          // 同样是交互驱动的更新：**排在应答之后**，否则一切换就被还原。
          refreshCardAfterResponse({ card: menuCard(items), label: '命令清单' });
          // 不写"已切到"：更新排在应答之后，此刻还没画上去（画失败会落 lastError）。
          return { toast: { type: 'info', content: '正在切到命令清单…' } };
        }
        value.dsh_menu = '/help';
        fromPanel = true;
      } else {
        // 新会话：直接调面板（面板里它就是 field=session），不必绕命令行。
        if (action.field === 'session') {
          try {
            const applied = await deps.panel.apply({ ...panelContext, field: 'session', value: action.value });
            const message = applied?.message ?? '已生效。';
            repaintAfterResponse({ label: action.label, message, ok: true }, 'button:new');
            return { toast: { type: 'success', content: message.slice(0, 80) } };
          } catch (error) {
            noteCardError('控制面板应用失败（session=new）', error?.message ?? error);
            const message = error?.message ?? String(error);
            repaintAfterResponse({ label: action.label, message, ok: false }, 'button:new(失败)');
            return { toast: { type: 'error', content: message.slice(0, 80) } };
          }
        }
        value.dsh_menu = action.command;
        fromPanel = true;
      }
    }

    // 菜单卡片：按钮里带的是命令行，走与"用户手打"同一条路径。
    if (typeof value.dsh_menu === 'string' && value.dsh_menu.startsWith('/')) {
      const command = await deps.commands?.handle?.({ ...commandContext, text: value.dsh_menu })
        .catch((error) => {
          logger.warn?.(`[dsh-chat-feishu] 菜单命令失败：${error?.message ?? error}`);
          return null;
        });
      if (!command?.handled) return { toast: { type: 'error', content: '命令没有执行。' } };
      /**
       * 从控制面板点进来的命令（状态/停止）：输出画回**面板**，不把面板换成命令卡——
       * 用户的上下文是"我在面板上调设置"，不该被一次查询打断。
       */
      if (fromPanel) {
        const reply = String(command.reply ?? '');
        repaintAfterResponse({
          label: value.dsh_menu,
          message: reply || '（没有输出）',
          ok: !reply.startsWith('命令执行失败'),
        }, `command-from-panel:${value.dsh_menu}`);
        return { toast: { type: 'success', content: `已执行 ${value.dsh_menu}` } };
      }
      // 就地更新：把"点了哪个命令 + 输出"画回同一张卡片，按钮保持可用。
      // 取不到卡片 messageId 时退回原路（回文字），行为不变。
      const items = command.menu?.length ? command.menu : await menuItemsFor(commandContext);
      if (items.length > 0 && event.messageId) {
        // 点按钮是交互驱动：更新必须排在应答之后（否则"点了又变回去"）。
        refreshCardAfterResponse({
          card: menuCard(items, { command: value.dsh_menu, reply: command.reply ?? '' }),
          label: `菜单卡片 ${value.dsh_menu}`,
          fallbackText: command.reply ?? '',
        });
        return { toast: { type: 'success', content: `已执行 ${value.dsh_menu}` } };
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
      const answer = decision === 'allowed-once' ? '允许' : '拒绝';
      /**
       * 身份门禁：审批按钮只免**命令权限**，不免"谁能替属主批准"。
       *
       * 提问那条路在认领前逐个候选键判 `evaluateAccess(isCommand: false)`；审批以前直接
       * `offer`，于是群聊 allowlist 策略下任何能看到审批卡的人都能点「允许一次」替属主
       * 批准工具执行（而同一句话当文字发出来会被 accept() 的门禁丢掉）。
       */
      // 按**这张卡实际所在的会话类型**判（`conversationType` 已由卡片映射算出），
      // 不能"两个作用域任一放行就算过"——群卡片用私聊作用域的宽松策略放行正是这个洞。
      const allowed = evaluateInteractionAccess({
        senderId: operatorId, conversationType,
      }).allowed;
      if (!allowed) {
        logger.warn?.(`[dsh-chat-feishu] 审批按钮被身份门禁拒绝：${bot.id} sender=${operatorId}`);
        if (event.messageId) {
          await gateway.replyText({
            messageId: event.messageId,
            text: '你没有处理这次授权的权限。',
          }).catch(() => {});
        }
        return { toast: { type: 'error', content: '你没有处理这次授权的权限。' } };
      }
      /**
       * 先认领**这张卡真实所在的那个会话**，认不到再退到另一个候选。
       *
       * 以前是固定"先私聊再群"：同一机器人在群和私聊里同时各有一轮在等审批时，在群卡片上
       * 点「允许一次」会先把私聊那轮决定掉，而群里的审批仍挂着（卡片却已被刷成"已允许"），
       * 用户看到的是"点了允许，任务还在等"。`key` 是发卡时登记、落盘的权威判据。
       */
      const candidates = [key, conversationType === 'group' ? `p2p:${operatorId}` : `group:${chatId}`];
      let claimed = false;
      for (const candidate of candidates) {
        if (deps.interactions?.offer?.({
          channelId: deps.channelId,
          botId: bot.id,
          key: candidate,
          text: answer,
        })) {
          claimed = true;
          break;
        }
      }
      if (!claimed) {
        logger.info?.(`[dsh-chat-feishu] 卡片回调没有匹配的待审批（${bot.id} ${operatorId}）`);
        return { toast: { type: 'info', content: '这次授权已经处理过了。' } };
      }
      // 同样排在应答之后：否则卡片上的"已允许"也会被还原成两个按钮。
      const markTitle = decision === 'allowed-once' ? '已允许' : '已拒绝';
      afterResponse(() => markAnswered(event, value.dsh, markTitle)
        .catch((error) => noteCardError('审批卡片标记失败', error?.message ?? error)));
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
        isOwner: isOwner(deps.accessPolicy, bot, operatorId),
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
      // 带 token：这是"用户刚点了这张卡"，更新要走延迟更新接口，否则会被客户端还原。
      // 审批卡是 Card 1.0，而 1.0 的延迟更新**必须在 card 里带 open_ids**（否则飞书报 300090），
      // 所以要把它操作者的 open_id 一起给网关。
      const openIds = event.operator?.openId ? [event.operator.openId] : null;
      await gateway.markCardAnswered({
        messageId: event.messageId, token: event.token ?? null, openIds, title, content,
      });
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
