/**
 * 会话桥（host 侧）：把一次 IM 消息变成一次 DSH 会话回合。
 *
 * 契约依据（DSH 0.1.5-rc.2 实测源码，见 UPSTREAM.md）：
 * - `gateway.invoke({ namespace, method, args, signal })` 走一元方法，返回原始业务值，
 *   失败抛 `RemoteError`（读 `error.code`）；args 的键名必须与描述符 wire 完全一致，
 *   因此绝大多数方法都要包一层 `request`，且 `session/list` 的 wire 是 `_request`；
 * - `session/follow`、`session/control`、`workspace/follow` 是 **stream** 方法，
 *   必须用 `gateway.stream()`；
 * - 一轮结束 = `turn/end` 事件；最终答案是该轮最后一个 `assistant/message` 的 text 块；
 * - 工具过程 = `tool/call` / `tool/result` 事件；
 * - 审批与提问不是 Remote 方法，而是 agent 作用域的 Cordis waterfall 事件
 *   （`approval/request`、`user-questions/request`），由 root 上的 listener 参与应答。
 *
 * @module dsh-chat/host/sessions
 */

import { randomUUID } from 'node:crypto';

const MAX_ASSISTANT_TEXT = 200_000;

/**
 * 关流的宽限时间：`ask()` 已经拿到结果后，绝不允许"关闭订阅"把返回值拖住。
 * 真机上出现过 follow 流的 return() 永不落地，导致回合明明跑完、渠道却永远收不到
 * 结果（用户看到的就是"发了没反应"，而且日志里连渠道侧一行都没有）。
 */
const STREAM_CLOSE_GRACE_MS = 1_000;

/** 把 DSH 的 RemoteError 折成带 code 的普通错误，便于渠道判断。 */
function sessionError(error, fallbackCode = 'chat/session-failed') {
  const code = typeof error?.code === 'string' ? error.code : fallbackCode;
  const wrapped = new Error(typeof error?.message === 'string' && error.message
    ? error.message
    : '会话操作失败。');
  wrapped.code = code;
  wrapped.details = error?.details ?? {};
  return wrapped;
}

/**
 * 把一批字节上传成"本会话可引用的文件"，换回 DSH 的 `receiptId`。
 *
 * 为什么要它：`session/prompt` 的文件内容块是 `{ type:'file', receiptId }`，
 * 而 receipt 必须由**同一会话**的上传产生——所以入站文件（飞书/微信里的附件）
 * 只能走这条路交给模型。
 */
function fileUploadFailure(error) {
  const wrapped = new Error(typeof error?.message === 'string' && error.message
    ? `上传文件失败：${error.message}`
    : '上传文件失败。');
  wrapped.code = typeof error?.code === 'string' ? error.code : 'chat/upload-failed';
  return wrapped;
}

function textOfAssistantMessage(message) {
  const content = message?.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
}

function deltaTextOf(chunk) {
  if (typeof chunk?.text === 'string') return chunk.text;
  if (typeof chunk?.delta === 'string') return chunk.delta;
  return '';
}

/**
 * 创建会话桥。
 *
 * @param options - { ctx, logger, store, guidance }。
 *   `store` 为 `session-store`；`guidance` 为每会话来源提示词登记表。
 * @returns 契约规定的 sessions 面。
 */
export function createSessionBridge({ ctx, logger = console, store, guidance, interactions }) {
  const gateway = ctx?.typertGateway;
  if (typeof gateway?.invoke !== 'function') {
    throw new TypeError('会话桥需要 context 的 typertGateway.invoke（请在 inject 中声明）。');
  }
  /** @type {Map<string, AbortController>} 会话键 → 当前回合的中断控制器。 */
  const activeTurns = new Map();

  /**
   * 调用一个一元 DSH Remote 方法。
   *
   * @param namespace - 'session' | 'workspace'。
   * @param method - 方法名。
   * @param args - wire 参数（键名必须与描述符一致）。
   * @param signal - AbortSignal。
   * @returns 原始业务值。
   */
  async function invoke(namespace, method, args = {}, signal) {
    const request = { namespace, method, args };
    if (signal !== undefined) request.signal = signal;
    try {
      return await gateway.invoke(request);
    } catch (error) {
      throw sessionError(error, 'chat/gateway-failed');
    }
  }

  /**
   * 打开一个 stream 方法。
   *
   * @returns AsyncIterable。
   */
  async function stream(namespace, method, args = {}, signal) {
    if (typeof gateway.stream !== 'function') {
      const error = new Error('当前 Host 不支持 stream 调用。');
      error.code = 'chat/stream-unavailable';
      throw error;
    }
    const request = { namespace, method, args };
    if (signal !== undefined) request.signal = signal;
    try {
      return await gateway.stream(request);
    } catch (error) {
      throw sessionError(error, 'chat/gateway-stream-failed');
    }
  }

  /** 按路径拿到（或创建）工作区 id。`workspace/create` 按路径幂等。 */
  async function resolveWorkspaceId(path, signal) {
    const result = await invoke('workspace', 'create', { request: { path } }, signal);
    const workspaceId = result?.workspace?.workspaceId;
    if (typeof workspaceId !== 'string' || !workspaceId) {
      const error = new Error('DSH 未返回工作区标识。');
      error.code = 'chat/workspace-unresolved';
      throw error;
    }
    return workspaceId;
  }

  /** 判断一个 Session 是否仍然存在（不激活 Agent）。 */
  async function sessionExists(sessionId, signal) {
    try {
      await invoke('session', 'page', {
        request: { address: { kind: 'session', sessionId }, throughSeq: -1, maxMessages: 1 },
      }, signal);
      return true;
    } catch (error) {
      if (error.code === 'session/not-found') return false;
      throw error;
    }
  }

  /**
   * 找到或创建该会话键对应的 DSH 会话。
   *
   * @param options - { channelId, botId, key, workspacePath, signal }。
   * @returns { sessionId, created }。
   */
  async function ensure({ channelId, botId, key, workspacePath, signal }) {
    if (!store) throw new TypeError('会话桥缺少会话绑定表。');
    const existing = store.get(channelId, botId, key);
    if (existing) {
      if (await sessionExists(existing.sessionId, signal)) {
        return { sessionId: existing.sessionId, created: false };
      }
      // 会话已被删除：解绑后重建。
      await store.unbind(channelId, botId, key);
    }
    if (typeof workspacePath !== 'string' || !workspacePath.trim()) {
      const error = new Error('该机器人还没有设置工作区，无法创建会话。');
      error.code = 'chat/workspace-required';
      throw error;
    }
    const workspaceId = await resolveWorkspaceId(workspacePath, signal);
    const created = await invoke('session', 'create', { request: { workspaceId } }, signal);
    const sessionId = created?.sessionId;
    if (typeof sessionId !== 'string' || !sessionId) {
      const error = new Error('DSH 未返回会话标识。');
      error.code = 'chat/session-unresolved';
      throw error;
    }
    await store.bind(channelId, botId, key, { sessionId, workspacePath });
    return { sessionId, created: true };
  }

  /** 发送一条 prompt（一元方法，返回 accepted 不等于已回答）。 */
  async function prompt({ sessionId, content, mode = 'queue', requestId = randomUUID(), signal }) {
    if (!Array.isArray(content) || content.length === 0) {
      const error = new Error('prompt 内容不能为空。');
      error.code = 'chat/empty-prompt';
      throw error;
    }
    return invoke('session', 'prompt', {
      request: { requestId, sessionId, mode, content },
    }, signal);
  }

  /** 停止当前回合。 */
  async function cancel({ channelId, botId, key, signal }) {
    const bound = store?.get(channelId, botId, key);
    activeTurns.get(`${channelId}:${botId}:${key}`)?.abort?.();
    if (!bound) return { accepted: false };
    try {
      return await invoke('session', 'cancel', { request: { sessionId: bound.sessionId } }, signal);
    } catch (error) {
      if (error.code === 'session/not-found') return { accepted: false };
      throw error;
    }
  }

  /** 该会话当前是否在运行。 */
  async function isRunning(sessionId, signal) {
    const result = await invoke('session', 'list', { _request: {} }, signal);
    const item = Array.isArray(result?.items)
      ? result.items.find((entry) => entry?.sessionId === sessionId)
      : undefined;
    return item?.running === true;
  }

  /** 重命名会话标题。 */
  async function rename(sessionId, title, signal) {
    return invoke('session', 'rename', { request: { sessionId, title } }, signal);
  }

  /** 解除绑定（`/new`）。 */
  async function reset({ channelId, botId, key }) {
    await store.unbind(channelId, botId, key);
  }

  /**
   * 跑一次完整回合：先开 follow 拿基线，再发 prompt，边消费事件边回调，
   * 直到本轮的 `turn/end`。
   *
   * @param options - {
   *   channelId, botId, key, workspacePath, content, sourceGuidance,
   *   mode, signal, handlers: {
   *     onTurnStart?, onAssistantMessage?, onToolCall?, onToolResult?,
   *     onDelta?, onEvent?, onTurnEnd?,
   *   },
   *   turnTimeoutMs?,
   * }。
   * @returns { sessionId, text, reason, aborted }。
   */
  async function ask({
    channelId,
    botId,
    key,
    workspacePath,
    content,
    sourceGuidance,
    mode = 'queue',
    signal,
    handlers = {},
    turnTimeoutMs,
  }) {
    const { sessionId } = await ensure({ channelId, botId, key, workspacePath, signal });
    // 提示词按会话发布：host 会把它物化成该 Session 的动态提示词上下文。
    guidance?.publish?.(sessionId, sourceGuidance ?? '');

    const turnKey = `${channelId}:${botId}:${key}`;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener?.('abort', abort, { once: true });
    activeTurns.set(turnKey, controller);

    const frames = await stream('session', 'follow', {
      request: {
        address: { kind: 'session', sessionId },
        maxMessages: 50,
        assistantStream: true,
      },
    }, controller.signal);

    let cursor = -1;
    let promptSent = false;
    /** 我们自己主动收摊时为 true：此时事件流中断属于正常，不该报成异常。 */
    let closing = false;
    let currentTurn = null;
    const assistantText = new Map();
    const tools = [];
    let settled = false;
    let settle;
    const finished = new Promise((resolve) => {
      settle = resolve;
    });
    /**
     * 唯一的收尾入口：任何结束路径都要留下可检索的一行。
     * "回合跑完了但用户没收到"这类问题，就靠这行 + 渠道侧的呈现日志对上。
     */
    const finishTurn = (value) => {
      if (settled) return;
      settled = true;
      const reason = value?.reason?.kind ?? 'unknown';
      logger.info?.(`[dsh-chat] 回合结束：${turnKey} turn=${currentTurn} reason=${reason}`
        + ` 文本=${(value?.text ?? '').length}字 工具=${value?.tools?.length ?? 0}`);
      settle(value);
    };

    // 回合超时：流断了/回合卡住时不能永远挂着——那样用户只会看到"发了没反应"。
    const effectiveTurnTimeoutMs = Number.isFinite(turnTimeoutMs) && turnTimeoutMs > 0
      ? turnTimeoutMs
      : 10 * 60_000;
    const timeoutTimer = setTimeout(() => {
      finishTurn({
        sessionId,
        text: '',
        reason: { kind: 'timeout', timeoutMs: effectiveTurnTimeoutMs },
        tools: [...tools],
        aborted: true,
      });
    }, effectiveTurnTimeoutMs);
    timeoutTimer.unref?.();

    const pump = (async () => {
      try {
        for await (const frame of frames) {
          if (frame?.type === 'snapshot') {
            cursor = Number.isInteger(frame.cursor) ? frame.cursor : cursor;
            continue;
          }
          if (frame?.type === 'assistant-stream') {
            const inner = frame.frame;
            if (inner?.type === 'chunk' && inner.chunk?.type === 'text-delta') {
              const text = deltaTextOf(inner.chunk);
              if (text) handlers.onDelta?.(text, inner);
            }
            handlers.onEvent?.(frame);
            continue;
          }
          const event = frame?.event;
          if (!event) continue;
          if (Number.isInteger(event.seq)) {
            if (event.seq <= cursor) continue; // 重开流时去重
            cursor = event.seq;
          }
          handlers.onEvent?.(event);
          switch (event.type) {
            case 'turn/start':
              currentTurn = event.data?.turn ?? null;
              assistantText.set(currentTurn, []);
              handlers.onTurnStart?.(event);
              break;
            case 'assistant/message': {
              const turn = event.data?.turn ?? currentTurn;
              const text = textOfAssistantMessage(event.data?.message);
              if (text) {
                const bucket = assistantText.get(turn) ?? [];
                bucket.push(text);
                assistantText.set(turn, bucket);
              }
              handlers.onAssistantMessage?.(event, text);
              break;
            }
            case 'tool/call':
              tools.push({ name: event.data?.name, arguments: event.data?.arguments });
              handlers.onToolCall?.(event);
              break;
            case 'tool/result':
              handlers.onToolResult?.(event, tools.at(-1));
              break;
            case 'turn/end': {
              const turn = event.data?.turn ?? currentTurn;
              const texts = assistantText.get(turn) ?? [];
              const text = (texts.at(-1) ?? '').slice(0, MAX_ASSISTANT_TEXT);
              handlers.onTurnEnd?.(event, text);
              assistantText.delete(turn);
              if (promptSent) {
                finishTurn({
                  sessionId,
                  text,
                  reason: event.data?.reason ?? null,
                  tools: [...tools],
                  aborted: false,
                });
              } else {
                // 提示词还没发出去就收到了 turn/end：属于上一轮（可能是重启前中断的那轮）的尾巴。
                logger.info?.(`[dsh-chat] 忽略提示词之前的 turn/end：${turnKey} turn=${turn}`);
              }
              break;
            }
            default:
              break;
          }
        }
        finishTurn({
          sessionId,
          text: '',
          reason: { kind: 'stream-ended' },
          tools: [...tools],
          aborted: false,
        });
      } catch (error) {
        const wasSettled = settled;
        finishTurn({
          sessionId,
          text: '',
          reason: { kind: 'error', error: sessionError(error) },
          tools: [...tools],
          aborted: true,
        });
        if (wasSettled && !closing) {
          logger.warn?.(`[dsh-chat] 会话 ${sessionId} 的事件流中断：${error?.message ?? error}`);
        }
      }
    })();

    try {
      promptSent = true;
      logger.info?.(`[dsh-chat] 发送提示词：${turnKey} 会话=${sessionId}`
        + ` 内容=${content.map((part) => part?.type ?? '?').join('+')} mode=${mode}`);
      // 提示词的返回值只是"投递收据"：回合结束不该等它（它可能迟迟不回），
      // 但它失败时必须立刻抛出来，否则消息会像被吞掉一样。
      const receiptFailure = prompt({ sessionId, content, mode, signal: controller.signal })
        .then(() => new Promise(() => {}), (error) => ({ error }));
      const first = await Promise.race([
        finished.then((value) => ({ value })),
        receiptFailure,
      ]);
      if (first.error) throw first.error;
      return first.value;
    } finally {
      clearTimeout(timeoutTimer);
      signal?.removeEventListener?.('abort', abort);
      activeTurns.delete(turnKey);
      closing = true;
      // 主动中止这条订阅，然后用一个有界的宽限时间等它收摊：宁可放手，也不能卡住返回值。
      try {
        controller.abort();
      } catch {
        // 已经中止过。
      }
      const closing0 = typeof frames?.return === 'function' ? frames.return() : null;
      if (closing0) {
        let graceTimer;
        try {
          await Promise.race([
            Promise.resolve(closing0).catch(() => {}),
            // 故意不 unref：这是"让调用方拿到结果"的兜底时限，必须真的会到点。
            new Promise((resolve) => {
              graceTimer = setTimeout(resolve, STREAM_CLOSE_GRACE_MS);
            }),
          ]);
        } finally {
          clearTimeout(graceTimer);
        }
      }
      void pump;
    }
  }

  /**
   * 注册某渠道的"人在环"处理器：审批与提问经它回传到 IM。
   *
   * @param channelId - 渠道 id。
   * @param handle - async ({ kind, channelId, botId, key, request }) =>
   *   审批返回 'allowed-once'|'rejected'|'cancelled'；提问返回 `{ answers }`。
   * @returns 注销函数。
   */

  /** 在 root 上参与审批/提问的 waterfall；只接管自己名下的会话，其余委派给浏览器 UI。 */
  function installInteractionRelays() {
    if (typeof ctx?.on !== 'function') {
      logger.warn?.('[dsh-chat] 当前 Host 不支持事件订阅，审批/提问无法回传到 IM。');
      return () => {};
    }
    /**
     * 只有"这条会话属于某个已绑定的 IM 会话"且"该渠道接入了 IM 回传"时才认领，
     * 否则一律让给浏览器 UI——绝不能把一个没人能回答的问题留在 IM 里卡住整轮。
     */
    const locateFor = (request) => {
      if (typeof interactions?.handle !== 'function') return null;
      const sessionId = request?.agent?.session?.id;
      const located = store?.locate?.(sessionId);
      if (!located) return null;
      return interactions.has?.(located.channelId) ? located : null;
    };

    const offApproval = ctx.on('approval/request', async (request, next) => {
      const target = locateFor(request);
      if (!target) return next();
      try {
        const outcome = await interactions.handle({
          kind: 'approval',
          channelId: target.channelId,
          botId: target.botId,
          key: target.key,
          request,
        });
        return outcome ?? next();
      } catch (error) {
        logger.warn?.(`[dsh-chat] 审批回传失败，交由其他应答方：${error?.message ?? error}`);
        return next();
      }
    });

    const offQuestions = ctx.on('user-questions/request', async (request, next) => {
      const target = locateFor(request);
      if (!target) return next();
      try {
        const answers = await interactions.handle({
          kind: 'question',
          channelId: target.channelId,
          botId: target.botId,
          key: target.key,
          request,
        });
        if (!answers) return next();
        return answers;
      } catch (error) {
        logger.warn?.(`[dsh-chat] 提问回传失败，交由其他应答方：${error?.message ?? error}`);
        return next();
      }
    });

    return () => {
      try {
        offApproval?.();
      } catch { /* 已释放 */ }
      try {
        offQuestions?.();
      } catch { /* 已释放 */ }
    };
  }

  /**
   * 上传一段字节到指定会话，返回可放进提示词的 `{ receiptId, file }`。
   *
   * `fileUploads` 是 DSH 的可选服务（没装就没有）；缺席时给出可读错误，
   * 调用方据此把"这个渠道暂时收不了文件"告诉用户，而不是静默丢消息。
   *
   * @param options - { sessionId, name, bytes, signal }。
   * @returns { receiptId, file }。
   */
  async function uploadFile({ sessionId, name, bytes, signal }) {
    const service = typeof ctx?.get === 'function' ? ctx.get('fileUploads') : undefined;
    if (typeof service?.uploadStream !== 'function') {
      const error = new Error('当前 Host 没有 fileUploads 服务，无法把文件交给会话。');
      error.code = 'chat/upload-unavailable';
      throw error;
    }
    if (typeof sessionId !== 'string' || !sessionId) {
      const error = new Error('上传文件需要 sessionId。');
      error.code = 'chat/bad-request';
      throw error;
    }
    const data = bytes instanceof Uint8Array ? bytes : null;
    if (!data || data.byteLength === 0) {
      const error = new Error('上传文件的内容为空。');
      error.code = 'chat/bad-request';
      throw error;
    }
    try {
      return await service.uploadStream({
        sessionId,
        name: typeof name === 'string' && name.trim() ? name.trim() : undefined,
        data: (async function* chunks() { yield data; })(),
        signal,
      });
    } catch (error) {
      throw fileUploadFailure(error);
    }
  }

  return Object.freeze({
    invoke,
    stream,
    uploadFile,
    resolveWorkspaceId,
    sessionExists,
    ensure,
    prompt,
    ask,
    cancel,
    isRunning,
    rename,
    reset,
    /** 会话绑定表：渠道可用它接管旧实现的绑定（`adopt`）。 */
    bindings: store,
    installInteractionRelays,
  });
}
