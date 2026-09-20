/**
 * 微信账号运行时：长轮询收消息 → hub 会话桥 → 回复。
 *
 * 微信通道按协议只支持私聊（iLink 的 `from_user_id` 就是单聊对端），因此这里
 * 固定 `conversationType: 'direct'`；过程展示只做"正在输入 + 最终分段回复"
 * （逐步过程消息是飞书那边的能力）。
 *
 * @module dsh-chat-weixin/runtime
 */

import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';

import {
  extractText,
  messageId,
  rejectedResponse,
  splitText,
} from './ilink-client.mjs';
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  WeixinMediaError,
  downloadMedia,
  extractInboundMedia,
  sniffImageMediaType,
} from './media.mjs';

/**
 * 创建账号运行时。
 *
 * @param options - { account, token, deps, client, state, logger, fetchImpl }。
 *   `fetchImpl` 只用于下载入站媒体（默认全局 fetch），便于测试注入。
 * @returns 运行时。
 */
export function createWeixinRuntime({
  account,
  token,
  deps,
  client,
  state,
  logger = console,
  fetchImpl = fetch,
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
  /**
   * 处理一条入站消息。
   *
   * 外层包一层：任何未预料的异常都要**留下痕迹并让用户看见**，
   * 绝不静默（"发了没反应"是最难排查的故障形态）。
   *
   * @param message - iLink 消息。
   * @param signal - 取消信号。
   */
  /**
   * 下载并准备入站附件。
   *
   * 图片解密后按魔数认类型，转成内容块（base64）；文件解密后先入会话换成 receipt
   * ——文件内容块只能引用"本会话上传"得到的收据。任何一步失败都**抛出**，
   * 由上层回复用户原因（绝不静默丢消息）。
   *
   * @param options - { media, key, workspacePath, signal }。
   * @returns 内容部分数组。
   */
  async function loadAttachments({ media, key, workspacePath, signal }) {
    const parts = [];
    for (const image of media.images) {
      const bytes = await downloadMedia(image.item, { signal, maxBytes: MAX_IMAGE_BYTES, fetchImpl });
      const mediaType = sniffImageMediaType(bytes);
      if (!mediaType) {
        throw new WeixinMediaError('unsupported-image', '这张图片的格式暂不支持，请发 PNG/JPEG/WebP/GIF。');
      }
      parts.push({ type: 'image', mediaType, data: bytes.toString('base64'), name: image.name });
      logger.info?.(`[dsh-chat-weixin] 已收到图片：${mediaType}（${bytes.length} 字节，${account.botId}）`);
    }
    for (const file of media.files) {
      const bytes = await downloadMedia(file.item, { signal, maxBytes: MAX_FILE_BYTES, fetchImpl });
      const { sessionId } = await deps.sessions.ensure({
        channelId: deps.channelId,
        botId: account.botId,
        key,
        workspacePath,
      });
      const uploaded = await deps.sessions.uploadFile({
        sessionId, name: file.name, bytes: new Uint8Array(bytes), signal,
      });
      if (!uploaded?.receiptId) throw new Error('上传后没有拿到 receiptId');
      parts.push({ type: 'file', receiptId: uploaded.receiptId });
      logger.info?.(`[dsh-chat-weixin] 已收到文件：${file.name}（${bytes.length} 字节，${account.botId}）`);
    }
    return parts;
  }

  async function accept(message, signal) {
    try {
      await handleMessage(message, signal);
    } catch (cause) {
      const detail = cause?.message ?? String(cause);
      error = detail;
      logger.error?.(`[dsh-chat-weixin] 处理入站消息异常：${detail}`);
      await state.recordFailure(detail);
      const sender = typeof message?.from_user_id === 'string' ? message.from_user_id.trim() : '';
      if (sender) {
        try {
          const token = typeof message.context_token === 'string'
            ? message.context_token
            : state.contextToken(sender);
          await reply(sender, `处理失败：${detail}`, token, message?.run_id, signal);
        } catch {
          // 连失败回复都发不出去时只留日志与状态文件。
        }
      }
    }
  }

  // 接入 IM 回传：agent 的提问/审批发到这个用户，用户的下一条消息就是答案。
  const detachInteractions = deps.interactions?.attach?.({
    channelId: deps.channelId,
    botId: account.botId,
    send: async ({ key, text }) => {
      const userId = (key.startsWith('p2p:') ? key.slice(4) : key).trim();
      if (!userId) throw new TypeError('交互回传需要 userId。');
      // 与 sendProactive 走同一条发送路径（带上该用户最近一次的 context_token）。
      await reply(userId, String(text ?? ''), state.contextToken(userId));
    },
  });

  /** 图片扩展名（图片走图片气泡，预览更友好）。 */
  const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

  /**
   * 把本轮 agent 交付的文件（`present` 声明的）当附件发出去。
   *
   * 失败必须可见：发不出去要回一句可读原因并落 `lastError`——"文件没收到"同样是最难
   * 排查的故障形态，不能只留一行日志。
   *
   * @param options - { userId, files, contextToken, signal }。
   */
  async function sendDeliverables({ userId, files, contextToken, signal }) {
    if (!Array.isArray(files) || files.length === 0) return;
    for (const file of files) {
      const path = typeof file?.path === 'string' ? file.path : '';
      if (!path) continue;
      const name = path.split('/').pop() || '交付文件';
      try {
        const info = await stat(path);
        if (!info.isFile() || info.size === 0) throw new Error('不是普通文件或内容为空');
        if (info.size > MAX_FILE_BYTES) {
          throw new Error(`超过 ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB 上限`);
        }
        const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
        const bytes = await readFile(path);
        const sent = IMAGE_EXTENSIONS.has(ext)
          ? await client.sendImage({ baseUrl, token, toUserId: userId, bytes, contextToken, signal })
          : await client.sendFile({
            baseUrl, token, toUserId: userId, fileName: name, bytes, contextToken, signal,
          });
        logger.info?.(`[dsh-chat-weixin] 已发送交付文件：${name}（${info.size} 字节，${account.botId}）`);
        void sent;
      } catch (cause) {
        const reason = cause?.message ?? String(cause);
        error = `交付文件 ${name} 发送失败：${reason}`;
        logger.error?.(`[dsh-chat-weixin] ${error}`);
        await state.recordFailure(error);
        try {
          await reply(userId, `交付文件「${name}」没能发出去：${reason}`, contextToken, undefined, signal);
        } catch {
          // 连失败说明都发不出去时，至少日志与 lastError 有记录。
        }
      }
    }
  }

  /**
   * 延迟交付：`ask()` 超时之后那一轮要是自己跑完了，hub 会把结果交回这里补发。
   *
   * 微信复用**该用户最近一次记下的 context token**（收消息时存下来的）——iLink 的回复要带它；
   * 没有 token 就发不出去，这时如实抛错，让 hub 记 `lastError`（不静默）。
   */
  deps.deferred?.register?.({
    channelId: deps.channelId,
    botId: account.botId,
    deliver: async ({ key, text }) => {
      const userId = key.startsWith('p2p:') ? key.slice('p2p:'.length) : key;
      const contextToken = state.contextToken?.(userId) ?? null;
      if (!contextToken) {
        throw new Error(`微信没有 ${userId} 的 context token，补发不了（等他再发一条消息后重试）`);
      }
      await reply(userId, `（上一轮超时之后跑完了，补发结果）\n\n${text}`, contextToken, null, null);
      logger.info?.(`[dsh-chat-weixin] 延迟交付已补发：${account.botId} ${key} ${text.length} 字`);
    },
  });

  async function handleMessage(message, signal) {
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
      // 属主判定走与飞书同一份规则（`*` 表示没有属主，不授权任何人绕过策略）。
        isOwner: deps.accessPolicy?.isOwnerId?.([account.ownerUserId], sender) === true,
    });
    if (!access.allowed) {
      logger.info?.(`[dsh-chat-weixin] 忽略未放行的消息：${account.botId} sender=${sender}（${access.reason}）`);
      return;
    }

    const text = extractText(message);
    // 图片/文件与文字可以混在同一条消息里（item_list 各占一项），因此两者互不排斥。
    const media = extractInboundMedia(message);
    const hasMedia = media.images.length > 0 || media.files.length > 0;
    if (!text && !hasMedia) {
      await reply(sender, '目前支持文本、语音转写、图片与文件，其他类型（视频、表情等）暂不支持。',
        message.context_token, message.run_id, signal);
      return;
    }

    const inboundToken = typeof message.context_token === 'string' ? message.context_token : undefined;
    const runId = typeof message.run_id === 'string' ? message.run_id : undefined;
    if (inboundToken) await state.rememberContextToken(sender, inboundToken);
    // 回复必须带上会话上下文：优先用本条消息的，缺失时回落到该用户最近一次记下的。
    const contextToken = inboundToken ?? state.contextToken(sender);

    const key = `p2p:${sender}`;

    // 正在等这个用户回答 agent 的提问/审批：这条消息就是答案，不再进模型。
    // 带媒体的消息不作数——那多半是用户顺手发了张图，不该被当成选项答案。
    if (!hasMedia && deps.interactions?.offer?.({
      channelId: deps.channelId,
      botId: account.botId,
      key,
      text,
    })) {
      logger.info?.(`[dsh-chat-weixin] 认领为交互回答（${account.botId} ${key}）`);
      return;
    }

    if (!hasMedia) {
      // 命令权限单独判定（白名单用户可以被允许对话、但不允许执行命令）。
      if (text.startsWith('/')) {
        const commandAccess = deps.accessPolicy.evaluateAccess({
          policy: record.accessPolicy,
          conversationType: 'direct',
          senderIds: [sender],
          isCommand: true,
          isOwner: deps.accessPolicy?.isOwnerId?.([account.ownerUserId], sender) === true,
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
        // 属主判定只有渠道知道（属主在渠道配置里），带上给命令内核用。
        isOwner: deps.accessPolicy?.isOwnerId?.([account.ownerUserId], sender) === true,
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
    }

    const identity = { senderId: sender, chatId: sender };
    const captured = deps.contextEnhancement.captureContextEnhancementSource(
      { botId: account.botId, channel: 'weixin', readConfig: () => record.contextEnhancement },
      'direct',
      identity,
      () => ({ channel: 'weixin', ...identity }),
    );

    // 附件先落地（下载 + 解密 + 入库）：失败要让用户看见原因，绝不静默。
    let attachmentParts = [];
    if (hasMedia) {
      await typing(sender, contextToken, 1, signal);
      try {
        attachmentParts = await loadAttachments({
          media, key, workspacePath: record.workspace, signal,
        });
      } catch (cause) {
        const reason = cause?.message ?? String(cause);
        error = reason;
        logger.error?.(`[dsh-chat-weixin] 接收媒体失败：${reason}`);
        await state.recordFailure(reason);
        const label = media.images.length > 0 && media.files.length === 0 ? '图片' : '文件';
        await typing(sender, contextToken, 2, signal);
        await reply(sender, `这个${label}没能收下：${reason}`, contextToken, runId, signal);
        return;
      }
    }

    // 文本保持"前缀拼进同一个文本块"的老形态；媒体走内容数组，enhanceContent 会在
    // 前面插一个上下文文本块，于是附件也带上来源信息。
    let finalParts;
    if (attachmentParts.length > 0) {
      const base = [...(text ? [{ type: 'text', text }] : []), ...attachmentParts];
      const enhanced = deps.contextEnhancement.enhanceContent(
        base,
        captured?.snapshot ?? null,
        captured?.source,
      );
      finalParts = Array.isArray(enhanced) ? enhanced : base;
    } else {
      finalParts = [{
        type: 'text',
        text: deps.contextEnhancement.enhanceContent(
          text,
          captured?.snapshot ?? null,
          captured?.source,
        ),
      }];
    }

    await typing(sender, contextToken, 1, signal);
    try {
      const result = await deps.sessions.ask({
        channelId: deps.channelId,
        botId: account.botId,
        key,
        workspacePath: record.workspace,
        content: finalParts,
        sourceGuidance: captured?.snapshot?.scope?.guidance,
        // 同一会话已有回合在跑：先回一句"排队中"。
        onQueued: (ahead) => {
          void reply(sender, `已排队（前面还有 ${ahead} 条），处理完会依次回复。`, contextToken, runId, signal)
            .catch(() => {});
        },
        // 会话列表里一眼看出渠道与聊天：微信只有私聊，而且拿不到昵称——用掩码 id 兜底。
        channelLabel: '微信',
        chatLabel: `私聊 ${String(sender ?? '').length > 12 ? `${String(sender).slice(0, 12)}…` : String(sender ?? '')}`.trim(),
        botLabel: account.botName ?? account.botId,
        signal,
      });
      const answer = typeof result?.text === 'string' && result.text.trim()
        ? result.text.trim()
        : (result?.reason?.kind && result.reason.kind !== 'completed'
          ? `任务未正常完成（${result.reason.kind}）。`
          : '（本轮没有文本输出）');
      await reply(sender, answer, contextToken, runId, signal);
      // agent 声明交付的文件要当附件真发出去（只写在回复文字里，用户拿不到文件）。
      await sendDeliverables({
        userId: sender, files: result?.files, contextToken, signal,
      });
      handled += 1;
      lastHandledAt = new Date().toISOString();
    } catch (cause) {
      error = cause?.message ?? String(cause);
      logger.error?.(`[dsh-chat-weixin] 处理消息失败：${error}`);
      await state.recordFailure(error);
      try {
        await reply(sender, `处理失败：${error}`, contextToken, runId, signal);
      } catch {
        // 连失败回复都发不出去时只留日志与状态文件。
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
      detachInteractions?.();
      try {
        await client.notifyStop({ baseUrl, token, signal });
      } catch (cause) {
        logger.warn?.(`[dsh-chat-weixin] 停止通知失败：${cause?.message ?? cause}`);
      }
    },

    /**
     * 主动发一条文本（定时任务/脚本用）。
     *
     * @param options - { userId, text, signal }。
     */
    async sendProactive({ userId, text, signal }) {
      const recipient = typeof userId === 'string' ? userId.trim() : '';
      if (!recipient) throw new TypeError('sendProactive 需要 userId。');
      const chunks = await reply(recipient, String(text ?? ''), state.contextToken(recipient), undefined, signal);
      return { chunks };
    },

    /**
     * 主动发一个文件或图片（agent 的 `chat_send_file` 与定时任务用）。
     *
     * 由调用方给"绝对路径 + 显示名 + kind"（hub 的投递层已经校验过存在、非空、不超限），
     * 这里只负责读字节、加密上传、发送。kind 为 image 时走图片气泡，否则走文件消息。
     *
     * @param options - { userId, path, name, kind, signal }。
     * @returns { kind, name, size, providerMessageIds }。
     */
    async sendFileProactive({ userId, path, name, kind, signal }) {
      const recipient = typeof userId === 'string' ? userId.trim() : '';
      if (!recipient) throw new TypeError('sendFileProactive 需要 userId。');
      if (typeof path !== 'string' || !path) throw new TypeError('sendFileProactive 需要 path。');
      const bytes = await readFile(path);
      if (bytes.byteLength === 0) throw new Error('要发送的文件是空的。');
      const fileName = typeof name === 'string' && name.trim() ? name.trim() : basename(path);
      const contextToken = state.contextToken(recipient);
      const sent = kind === 'image'
        ? await client.sendImage({ baseUrl, token, toUserId: recipient, bytes, contextToken, signal })
        : await client.sendFile({
          baseUrl, token, toUserId: recipient, fileName, bytes, contextToken, signal,
        });
      logger.info?.(`[dsh-chat-weixin] 已发送${kind === 'image' ? '图片' : '文件'}：${fileName}`
        + `（${bytes.byteLength} 字节，${account.botId}）`);
      return { ...sent, kind: kind === 'image' ? 'image' : 'file', name: fileName, size: bytes.byteLength };
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
