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

/**
 * 回合"没有进展"多久算卡死（默认 15 分钟）。
 *
 * 注意判的是**静默时长**而不是总时长：一次合法的长任务（几十次工具调用、单个工具跑几分钟）
 * 只要一直在产出事件就不该被打断。旧的"整轮 10 分钟"上限把真机上一次 10 分 20 秒的
 * 帆软排障误判成超时并中断了。
 */
const TURN_IDLE_TIMEOUT_MS = 15 * 60_000;

/** 绝对上限（默认 2 小时）：防死循环，正常任务碰不到。 */
const TURN_TOTAL_TIMEOUT_MS = 2 * 60 * 60_000;

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

/** 把内容块数组里的文本拼起来（用于入站消息文本）。 */
function contentText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
    .trim();
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
/** 从 `present` 的参数里解出文件清单（解析失败就当没有，绝不抛）。 */
function filesOfPresentArgs(args) {
  let parsed = args;
  if (typeof args === 'string') {
    try {
      parsed = JSON.parse(args);
    } catch {
      return [];
    }
  }
  const files = Array.isArray(parsed?.files) ? parsed.files : [];
  return files
    .filter((file) => typeof file?.path === 'string' && file.path)
    .map((file) => ({
      path: file.path,
      ...(typeof file.description === 'string' && file.description
        ? { description: file.description }
        : {}),
    }));
}

/**
 * 从 `session/page` 的记录里挑出对话消息（`/history` 用）。
 *
 * 只保留**用户真正说的**与**模型回复的文本**：注入的上下文（`user/message` 但
 * `source.kind !== 'user'`）不算一轮对话，思考/工具调用也不进历史。
 *
 * @param records - `session/page` 的 `records`。
 * @param limit - 最多保留多少条消息（从最新往回数）。
 * @returns `[{ role: 'user'|'assistant', text }]`（按时间正序）。
 */
function historyMessagesOf(records, limit) {
  const messages = [];
  for (const record of Array.isArray(records) ? records : []) {
    const event = record?.event ?? record;
    const data = event?.data;
    if (event?.type === 'user/message') {
      if (data?.source?.kind !== 'user') continue;
      const text = contentText(data?.content);
      if (text) messages.push({ role: 'user', text });
      continue;
    }
    if (event?.type === 'assistant/message') {
      const text = textOfAssistantMessage(data?.message);
      if (text) messages.push({ role: 'assistant', text });
    }
  }
  return limit > 0 ? messages.slice(-limit) : messages;
}

/**
 * 组装会话桥服务。
 *
 * @param options - { ctx, logger, store, guidance, interactions }。
 * @returns 会话桥。
 */
export function createSessionBridge({
  ctx, logger = console, store, settings = null, guidance, interactions,
}) {
  const gateway = ctx?.typertGateway;
  if (typeof gateway?.invoke !== 'function') {
    throw new TypeError('会话桥需要 context 的 typertGateway.invoke（请在 inject 中声明）。');
  }
  /** @type {Map<string, AbortController>} 会话键 → 当前回合的中断控制器。 */
  const activeTurns = new Map();
  /**
   * 会话键 → 该会话的回合队列（尾部的 promise）与排队条数。
   *
   * DSH 侧的 `session/prompt` 本来就支持 `mode: 'queue'`，但**渠道侧**每条消息都会各自
   * 开一条 `follow` 流等自己的答案：两个回合同时在飞会互相抢答案（第二条会看到第一条的
   * 结果、第一条可能永远等不到）。所以同一个会话的回合必须在 hub 里串起来。
   */
  const turnQueues = new Map();
  const queueDepth = new Map();
  /** 已经标过渠道的工作区 / 会话（进程内只标一次，避免每轮都发 rename）。 */
  const namedWorkspaces = new Set();
  const namedSessions = new Set();

  /**
   * 给会话标题加渠道前缀（`飞书 · <原标题>`）。
   *
   * 会话列表里一堆同名会话时，能一眼看出哪条来自哪个渠道——这是"会话渠道标识"的
   * 主要用途。前缀是**幂等**的：已经有前缀就不再 rename；拿不到渠道标签就什么都不做。
   *
   * @param sessionId - 会话 id。
   * @param channelLabel - 渠道中文名（如 `飞书`）。
   */
  async function markSessionChannel(sessionId, channelLabel, signal) {
    const label = typeof channelLabel === 'string' ? channelLabel.trim() : '';
    if (!label || namedSessions.has(sessionId)) return;
    try {
      // 标题只有 `session/list` 的投影里有（`session/page` 不带投影）。
      const listed = await invoke('session', 'list', { _request: {} }, signal);
      const item = (listed?.items ?? []).find((entry) => entry?.sessionId === sessionId);
      const title = item?.projections?.values?.title;
      // 标题要等第一轮跑完才生成：这时**不能**记成"已标记"，否则同一个会话
      // 在这个进程里再也不会重试，前缀就永远补不上了。
      if (typeof title !== 'string' || !title.trim()) return;
      if (title.startsWith(`${label} · `)) {
        namedSessions.add(sessionId);
        return;
      }
      await invoke('session', 'rename', { request: { sessionId, title: `${label} · ${title}` } }, signal);
      namedSessions.add(sessionId);
      logger.info?.(`[dsh-chat] 会话标题已标渠道：${sessionId} → ${label} · ${title}`);
    } catch (error) {
      // 命名是锦上添花：失败只留日志、且不记"已标记"，下一轮还会再试，绝不影响消息处理。
      logger.warn?.(`[dsh-chat] 标记会话渠道失败：${sessionId} ${error?.message ?? error}`);
    }
  }

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

  /**
   * 按路径拿到（或创建）工作区 id。`workspace/create` 按路径幂等。
   *
   * 顺带把工作区命名成「渠道 · 机器人」（`飞书 · 张三-DSH`）——web 侧边栏就是按工作区
   * 分组的，这样一眼能看出这个工作区属于哪个渠道的哪个机器人。命名同样是幂等的。
   *
   * @param path - 工作区路径。
   * @param signal - 取消信号。
   * @param label - 可选：`飞书 · 张三-DSH`（渠道与机器人中文名）。
   */
  async function resolveWorkspaceId(path, signal, label = '') {
    const result = await invoke('workspace', 'create', { request: { path } }, signal);
    const workspaceId = result?.workspace?.workspaceId;
    if (typeof workspaceId !== 'string' || !workspaceId) {
      const error = new Error('DSH 未返回工作区标识。');
      error.code = 'chat/workspace-unresolved';
      throw error;
    }
    const title = typeof label === 'string' ? label.trim() : '';
    if (title && !namedWorkspaces.has(workspaceId)) {
      namedWorkspaces.add(workspaceId);
      try {
        await invoke('workspace', 'rename', { request: { workspaceId, title } }, signal);
      } catch (error) {
        logger.warn?.(`[dsh-chat] 工作区命名失败：${workspaceId} ${error?.message ?? error}`);
      }
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
  /**
   * 新建会话，带上机器人设置的 Agent Preset。
   *
   * 预设可能已经被删掉/改名：那样 `session.create` 会失败，**不能因此让机器人一个会话都建不出来**。
   * 所以失败时记一条 warn、退回 Host 默认预设重试一次。
   */
  async function createSession({ workspaceId, agentPreset, signal, channelId, botId }) {
    const request = { workspaceId, ...(agentPreset ? { agentPreset } : {}) };
    try {
      return await invoke('session', 'create', { request }, signal);
    } catch (error) {
      if (!agentPreset) throw error;
      logger.warn?.(`[dsh-chat] 机器人 ${channelId}/${botId} 的 Agent Preset「${agentPreset}」不可用`
        + `（${error?.message ?? error}），本次退回 Host 默认。`);
      return invoke('session', 'create', { request: { workspaceId } }, signal);
    }
  }

  async function ensure({
    channelId, botId, key, workspacePath, signal, channelLabel = '', botLabel = '',
  }) {
    if (!store) throw new TypeError('会话桥缺少会话绑定表。');
    const existing = store.get(channelId, botId, key);
    if (existing) {
      if (await sessionExists(existing.sessionId, signal)) {
        return { sessionId: existing.sessionId, created: false };
      }
      // 会话已被删除：解绑后重建。
      await store.unbind(channelId, botId, key);
    }
    /**
     * 工作区与 Agent Preset 都取机器人自己的设置（调用方传的 workspacePath 优先）。
     * 两者都**只在新建会话时生效**——已有绑定保持原样，设置页必须把这一点讲清楚。
     */
    const record = settings?.read?.(channelId, botId) ?? {};
    const targetWorkspace = typeof workspacePath === 'string' && workspacePath.trim()
      ? workspacePath
      : record.workspace;
    if (typeof targetWorkspace !== 'string' || !targetWorkspace.trim()) {
      const error = new Error('该机器人还没有设置工作区，无法创建会话。');
      error.code = 'chat/workspace-required';
      throw error;
    }
    const workspaceTitle = [channelLabel, botLabel].map((part) => String(part ?? '').trim())
      .filter(Boolean).join(' · ');
    const workspaceId = await resolveWorkspaceId(targetWorkspace, signal, workspaceTitle);
    const agentPreset = typeof record.agentPreset === 'string' && record.agentPreset
      ? record.agentPreset
      : null;
    const created = await createSession({
      workspaceId, agentPreset, signal, botId, channelId,
    });
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
   *   mode, signal, channelLabel?, botLabel?, handlers: {
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
    channelLabel = '',
    botLabel = '',
    onQueued,
  }) {
    // 先排队再干活：同一会话的第二个回合必须等第一个真正结束。
    const queueKey = `${channelId}:${botId}:${key}`;
    const ahead = queueDepth.get(queueKey) ?? 0;
    queueDepth.set(queueKey, ahead + 1);
    let release;
    const mine = new Promise((resolve) => {
      release = resolve;
    });
    const previous = turnQueues.get(queueKey) ?? Promise.resolve();
    turnQueues.set(queueKey, previous.then(() => mine));
    if (ahead > 0) {
      // 让渠道能立刻回一句"前面还有几条"，而不是让用户对着已读不回猜。
      try {
        onQueued?.(ahead);
      } catch (error) {
        logger.warn?.(`[dsh-chat] 排队提示回调失败：${error?.message ?? error}`);
      }
      logger.info?.(`[dsh-chat] 回合排队：${queueKey} 前面还有 ${ahead} 条`);
    }
    try {
      await previous;
    } catch {
      // 前一个回合失败不该把后面的拖死。
    }
    try {
      return await runTurn();
    } finally {
      const left = (queueDepth.get(queueKey) ?? 1) - 1;
      if (left <= 0) {
        queueDepth.delete(queueKey);
        turnQueues.delete(queueKey);
      } else {
        queueDepth.set(queueKey, left);
      }
      release();
    }

    async function runTurn() {
      const { sessionId } = await ensure({
        channelId, botId, key, workspacePath, signal, channelLabel, botLabel,
      });
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
      /**
       * 本轮 agent 通过 `present` 交付的文件（DSH 会 append `deliverables/presented`）。
       * 渠道拿它把成品当附件发出去——只写在回复文字里，用户拿不到文件。
       */
      const presented = [];
      /**
       * 兜底：从 `present` 工具调用的参数里记下的文件。
       * 万一某个版本的事件流不带 `deliverables/presented`，也不能让交付文件静默丢掉。
       */
      const presentCalls = [];
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
        // 事件没来就退回工具参数（两者都按 path 去重，绝不把同一个文件发两遍）。
        const files = presented.length > 0 ? presented : presentCalls;
        logger.info?.(`[dsh-chat] 回合结束：${turnKey} turn=${currentTurn} reason=${reason}`
          + ` 文本=${(value?.text ?? '').length}字 工具=${value?.tools?.length ?? 0}`
          + ` 交付文件=${files.length}`);
        settle({ ...value, files: [...files] });
      };

      /**
       * 兜底超时：防的是"流断了/回合卡死"，**不是**长任务。
       *
       * 真机教训：原先按"整轮总时长 10 分钟"掐，把一次合法的帆软排障（10 分 20 秒、
       * 231 个事件、几次 90 秒的工具调用）在第 620 秒直接中断，用户看到的却是
       * 「任务未正常完成（timeout）」——这是把"卡住"和"干得久"混为一谈了。
       *
       * 现在按**静默时长**判定：只要还有事件进来（工具结果、模型增量都算），就一直等；
       * 连续 IDLE 没有任何进展才判定卡死。另留一个很大的绝对上限兜住死循环。
       */
      const effectiveIdleTimeoutMs = Number.isFinite(turnTimeoutMs) && turnTimeoutMs > 0
        ? turnTimeoutMs
        : TURN_IDLE_TIMEOUT_MS;
      const effectiveTotalTimeoutMs = Number.isFinite(turnTimeoutMs) && turnTimeoutMs > 0
        ? Math.max(turnTimeoutMs * 6, TURN_TOTAL_TIMEOUT_MS)
        : TURN_TOTAL_TIMEOUT_MS;
      let lastProgressAt = Date.now();
      let idleTimer = null;
      const markProgress = () => {
        lastProgressAt = Date.now();
      };
      /** 每次"有进展"都重置静默计时；到点说明这条路已经没人往前走了。 */
      function armIdleTimer() {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(function tick() {
          const idleMs = Date.now() - lastProgressAt;
          if (idleMs >= effectiveIdleTimeoutMs) {
            finishTurn({
              sessionId,
              text: '',
              reason: { kind: 'timeout', idleMs, idleTimeoutMs: effectiveIdleTimeoutMs },
              tools: [...tools],
              aborted: true,
            });
            return;
          }
          idleTimer = setTimeout(tick, Math.max(1_000, effectiveIdleTimeoutMs - idleMs));
        }, effectiveIdleTimeoutMs);
        idleTimer.unref?.();
    }
    armIdleTimer();
    const totalTimer = setTimeout(() => {
      finishTurn({
        sessionId,
        text: '',
        reason: { kind: 'timeout', timeoutMs: effectiveTotalTimeoutMs, idleMs: Date.now() - lastProgressAt },
        tools: [...tools],
        aborted: true,
      });
    }, effectiveTotalTimeoutMs);
    totalTimer.unref?.();

    const pump = (async () => {
      try {
        for await (const frame of frames) {
          // 任何一帧（工具结果、模型增量、状态事件）都算"还在往前走"。
          markProgress();
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
              if (event.data?.name === 'present') {
                for (const file of filesOfPresentArgs(event.data?.arguments)) {
                  if (!presentCalls.some((seen) => seen.path === file.path)) presentCalls.push(file);
                }
              }
              handlers.onToolCall?.(event);
              break;
            case 'tool/result':
              handlers.onToolResult?.(event, tools.at(-1));
              break;
            case 'deliverables/presented': {
              const files = Array.isArray(event.data?.files) ? event.data.files : [];
              const accepted = [];
              for (const file of files) {
                if (typeof file?.path !== 'string' || !file.path) continue;
                accepted.push({
                  path: file.path,
                  ...(typeof file.description === 'string' && file.description
                    ? { description: file.description }
                    : {}),
                });
              }
              presented.push(...accepted);
              if (accepted.length > 0) handlers.onDeliverables?.(accepted);
              break;
            }
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
          files: [...presented],
          aborted: false,
        });
      } catch (error) {
        const wasSettled = settled;
        finishTurn({
          sessionId,
          text: '',
          reason: { kind: 'error', error: sessionError(error) },
          tools: [...tools],
          files: [...presented],
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
      clearTimeout(totalTimer);
      if (idleTimer) clearTimeout(idleTimer);
      // 回合结束后标题已经生成，这时标渠道前缀最稳（幂等：每个会话只做一次）。
      void markSessionChannel(sessionId, channelLabel);
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

    // 必须**前置注册**：浏览器的应答器（api-remotes 转发器）注册得更早，一旦轮到它会
    // 把提问扣在网页 UI 上等回答（forwardWaterfall 直到浏览器答复或拒绝才继续），
    // 于是 IM 这条中继永远轮不到——真机上就是这样：日志里既没有"已发往 IM"也没有
    // "回传失败"，问题只出现在网页里。
    const offApproval = ctx.on('approval/request', async (request, next) => {
      const target = locateFor(request);
      logger.info?.(`[dsh-chat] 收到审批请求：会话=${request?.agent?.session?.id ?? '未知'}`
        + ` 工具=${request?.toolName ?? '?'} 认领=${target ? '是' : '否'}`);
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
    }, { prepend: true });

    const offQuestions = ctx.on('user-questions/request', async (request, next) => {
      const target = locateFor(request);
      logger.info?.(`[dsh-chat] 收到提问请求：会话=${request?.agent?.session?.id ?? '未知'}`
        + ` 问题数=${request?.questions?.length ?? 0} 认领=${target ? '是' : '否'}`);
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
    }, { prepend: true });

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

  /**
   * 读最近的对话历史（`/history` 用）。
   *
   * 走 `session/follow` 的**首个 snapshot**：它一次就把尾部 N 条记录和游标都给了我们
   * （`session/page` 需要先知道会话的 seq，而 seq 只能从 follow 的 snapshot 里拿，
   * 用 `throughSeq: -1` 只会拿到空页——那是"探测会话是否存在"的用法）。
   * 读完立刻关流，且关流**必须有界**——否则一条命令就能把聊天卡住。
   *
   * @param options - { channelId, botId, key, maxMessages, signal }。
   * @returns `{ sessionId, messages }`；没有绑定会话时 sessionId 为 null。
   */
  async function history({ channelId, botId, key, maxMessages = 12, signal } = {}) {
    const bound = store?.get?.(channelId, botId, key);
    if (!bound?.sessionId) return { sessionId: null, messages: [] };
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) throw abortError(signal);
    signal?.addEventListener?.('abort', onAbort, { once: true });
    let frames = null;
    try {
      frames = await stream('session', 'follow', {
        request: {
          address: { kind: 'session', sessionId: bound.sessionId },
          maxMessages: Math.max(1, Math.min(50, maxMessages)),
          // 注意：wire 上 `assistantStream` 只接受 `true`（或省略），传 false 会被
          // 边界校验直接拒掉。历史只需要 snapshot，所以这里不传。
        },
      }, controller.signal);
      let records = [];
      for await (const frame of frames) {
        if (frame?.type === 'snapshot') {
          records = Array.isArray(frame.records) ? frame.records : [];
          break;
        }
      }
      return { sessionId: bound.sessionId, messages: historyMessagesOf(records, maxMessages) };
    } finally {
      controller.abort();
      signal?.removeEventListener?.('abort', onAbort);
      if (frames && typeof frames.return === 'function') {
        // 关流可以慢，但不能永远不回：拿到历史就先返回（与 ask 的收尾同一套有界策略）。
        const closing = Promise.resolve(frames.return()).catch(() => {});
        await Promise.race([
          closing,
          new Promise((resolve) => { setTimeout(resolve, STREAM_CLOSE_GRACE_MS); }),
        ]);
      }
    }
  }

  /**
   * 执行一条 DSH 斜杠命令（不经过模型，例如 `/compact`）。
   *
   * @param options - { channelId, botId, key, line, signal }。
   * @returns `{ matched, kind, text }`；`matched=false` 表示当前部署没注册这条命令。
   */
  async function runCommand({ channelId, botId, key, line, signal } = {}) {
    const bound = store?.get?.(channelId, botId, key);
    if (!bound?.sessionId) {
      const error = new Error('当前聊天还没有会话（先发一条消息即可创建）。');
      error.code = 'chat/session-required';
      throw error;
    }
    const result = await invoke('commands', 'execute', {
      agentId: bound.sessionId,
      line,
      submittedAttachments: [],
    }, signal);
    if (result === undefined || result === null) return { matched: false };
    return {
      matched: true,
      commandId: result.commandId,
      kind: result.result?.kind ?? 'error',
      text: result.result?.text ?? '',
    };
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
    markSessionChannel,
    reset,
    history,
    runCommand,
    /** 会话绑定表：渠道可用它接管旧实现的绑定（`adopt`）。 */
    bindings: store,
    installInteractionRelays,
  });
}
