/**
 * 飞书渠道控制器：多机器人长连接的生命周期、状态与渠道 RPC 端点。
 *
 * 每个机器人独立启动：一个机器人凭据坏了只影响它自己，其他机器人照常在线。
 *
 * @module dsh-chat-feishu/controller
 */

import { join } from 'node:path';

import { createFeishuBridge } from './bridge.mjs';
import { createFeishuConfigStore } from './config-store.mjs';
import { createLarkGateway } from './lark-gateway.mjs';
import { createFeishuStateStore } from './state-store.mjs';

/** App Secret 只经 DSH 凭据服务读取；展示时永不回传。 */
async function resolveSecret(credentials, ref) {
  if (typeof credentials?.resolve !== 'function') {
    throw new Error('当前 Host 未提供凭据服务，无法读取飞书 App Secret。');
  }
  let resolved;
  try {
    resolved = await credentials.resolve(ref);
  } catch (error) {
    const wrapped = new Error(`读取飞书凭据 ${ref} 失败：${error?.message ?? error}`);
    wrapped.code = 'feishu/credential-unreadable';
    throw wrapped;
  }
  if (!resolved?.value) {
    const error = new Error(`飞书凭据 ${ref} 未配置，请在设置页重新接入。`);
    error.code = 'feishu/credential-missing';
    throw error;
  }
  return resolved.value;
}

function maskAppId(appId) {
  if (typeof appId !== 'string' || appId.length <= 8) return '****';
  return `${appId.slice(0, 8)}****`;
}

/**
 * 创建飞书控制器。
 *
 * @param options - { deps, logger, config, internals }。
 *   `internals` 可注入 sdk / createGateway / createBridge（测试用）。
 * @returns 控制器。
 */
export function createFeishuController({ deps, logger = console, config = {}, internals = {} }) {
  const dataDir = deps.dataDir;
  if (typeof dataDir !== 'string' || !dataDir) throw new TypeError('飞书控制器需要 deps.dataDir。');
  // hub 的会话桥与上下文增强引擎是本渠道的硬依赖：缺了就直接失败，
  // 而不是让每个机器人各报一次同样的错。
  if (typeof deps.sessions?.ask !== 'function' || typeof deps.contextEnhancement?.enhanceContent !== 'function') {
    throw new TypeError('飞书控制器需要 hub 的 sessions.ask 与 contextEnhancement（请确认 dsh-chat 已加载）。');
  }
  const configStore = createFeishuConfigStore({ path: join(dataDir, 'config.json'), logger });
  const gatewayFactory = internals.createGateway ?? createLarkGateway;
  /** @type {Map<string, object>} botId → 运行时记录 */
  const runtimes = new Map();

  const sdkLoader = internals.sdk ?? (() => import('@larksuiteoapi/node-sdk'));
  /** 建桥：测试可注入一份替身，用来断言"桥拿到的是哪份 bot 对象"。 */
  const bridgeFactory = internals.createBridge ?? createFeishuBridge;

  async function startBot(bot) {
    const existing = runtimes.get(bot.id);
    if (existing?.phase === 'running' || existing?.phase === 'starting') return existing;

    /**
     * **可变的一份运行期配置**：桥、状态、补丁都读它。
     *
     * 为什么不是直接用 `bot` 那个冻结对象：设置页/控制面板改完过程展示后会调
     * `patchRuntime()`，早先那里是 `record.bot = { ...record.bot, ...patch }`——换了引用，
     * 而桥在创建时已经把旧对象**闭包**进去了，于是"改了设置、群里的卡照旧"
     * （真机现象：群聊已设「不显示过程」，回复仍带着工具与思考面板）。
     * 现在桥拿到的就是这份可变的副本，`patchRuntime` 就地改它，改完立刻生效。
     */
    const liveBot = { ...bot };
    const record = {
      bot: liveBot,
      phase: 'starting',
      error: null,
      gateway: null,
      bridge: null,
      controller: new AbortController(),
    };
    runtimes.set(bot.id, record);
    try {
      const sdk = await sdkLoader();
      const secret = await resolveSecret(deps.credentials, bot.secretRef);
      const gateway = gatewayFactory({
        appId: bot.appId,
        appSecret: secret,
        domain: bot.domain,
        sdk,
        logger,
        connectTimeoutMs: config.connectTimeoutMs,
      });
      const state = createFeishuStateStore({
        path: join(dataDir, 'bots', bot.id, 'state.json'),
        logger,
      });
      await state.load();
      record.state = state;
      // 接管旧实现的会话绑定（不覆盖已有绑定），会话不丢。
      if (deps.sessions?.bindings?.adopt) {
        await deps.sessions.bindings.adopt(deps.channelId, bot.id, state.sessions());
      }
      const bridge = bridgeFactory({ bot: liveBot, deps, gateway, state, logger });
      record.gateway = gateway;
      record.bridge = bridge;
      await gateway.connect({
        onMessage: (event) => bridge.accept(event),
        // 卡片按钮点击走这里：与文本回答共用同一条"认领"路径。
        onCardAction: (event) => bridge.handleCardAction?.(event),
        signal: record.controller.signal,
      });
      record.phase = 'running';
      record.error = null;
      logger.info?.(`[dsh-chat-feishu] ${bot.botName ?? bot.id} 长连接已就绪`);
    } catch (error) {
      record.phase = 'failed';
      record.error = typeof error?.code === 'string' ? error.code : 'feishu/connect-failed';
      record.errorMessage = error?.message ?? String(error);
      logger.error?.(`[dsh-chat-feishu] ${bot.id} 启动失败：${record.errorMessage}`);
      await stopBot(bot.id).catch(() => undefined);
      record.phase = 'failed';
    }
    return record;
  }

  async function stopBot(botId) {
    const record = runtimes.get(botId);
    if (!record) return;
    record.controller?.abort?.();
    try {
      await record.gateway?.disconnect?.();
    } catch (error) {
      logger.warn?.(`[dsh-chat-feishu] ${botId} 断开时报错：${error?.message ?? error}`);
    }
    // 去重集合是异步落盘的：停机前等它写完，避免重启后重复处理刚收过的消息。
    try {
      await record.state?.flush?.();
    } catch (error) {
      logger.warn?.(`[dsh-chat-feishu] ${botId} 状态落盘失败：${error?.message ?? error}`);
    }
    record.bridge?.dispose?.();
    record.gateway = null;
    record.bridge = null;
    if (record.phase !== 'failed') record.phase = 'stopped';
  }

  function botStatus(record) {
    const { bot } = record;
    const bridgeStatus = record.bridge?.status?.() ?? { handled: 0, lastError: null };
    return Object.freeze({
      // 规范化字段（契约要求）：hub 的机器人列表按这几个键渲染，渠道无关。
      botId: bot.id,
      name: bot.botName ?? null,
      // 以下三个是飞书自己的补充信息。
      id: bot.id,
      appIdMasked: maskAppId(bot.appId),
      domain: bot.domain,
      state: record.phase,
      error: record.error ?? null,
      errorMessage: record.errorMessage ?? null,
      connected: record.gateway?.isConnected?.() === true,
      // 通配符（`*`）是"没有记录属主"，不该算成一个属主——否则设置页显示"属主 1 人"，
      // 而实际上没有人能绕过访问策略。
      ownerCount: bot.ownerOpenIds.filter((id) => id !== '*').length,
      ownersWildcard: bot.ownerOpenIds.includes('*'),
      // 设置页要显示"当前属主是谁"，也要支持从会话里选人替换。
      ownerOpenIds: Object.freeze([...bot.ownerOpenIds]),
      groupResponseMode: bot.groupResponseMode,
      groupTopicReply: bot.groupTopicReply,
      stepPush: Object.freeze({ direct: bot.stepPushDirect, group: bot.stepPushGroup }),
      handled: bridgeStatus.handled,
      lastHandledAt: bridgeStatus.lastHandledAt ?? null,
      // 处理消息的失败必须能被设置页看到：终端日志之外，这是唯一的现场。
      lastError: bridgeStatus.lastError ?? null,
      // 名字解析失败（多为缺权限）也要能在界面上看到原因，而不是只显示一串 id。
      nameHint: nameCache.get(bot.id)?.nameHint ?? null,
    });
  }

  async function status() {
    await configStore.load();
    const bots = configStore.list();
    const known = new Set(bots.map((bot) => bot.id));
    for (const botId of [...runtimes.keys()]) if (!known.has(botId)) await stopBot(botId);
    return Object.freeze({
      channel: deps.channelId,
      dataDir,
      bots: Object.freeze(bots.map((bot) => botStatus(
        runtimes.get(bot.id) ?? { bot, phase: 'stopped', error: null, bridge: null },
      ))),
    });
  }

  /** 更新运行中机器人的本地配置（保存后立即生效，不需要重连）。 */
  /**
   * 任务过程展示的三态（与设置页同一份文案）。
   *
   * 渠道把它作为「面板字段」交给 hub：hub 不认识"过程展示"，只负责画一行下拉、
   * 把选择透传回这里的 `panel.apply`。
   */
  const STEP_PUSH_FIELD_OPTIONS = Object.freeze([
    { value: 'off', label: '不显示过程（只回最终答案）' },
    { value: 'streaming_card', label: '实时过程卡（一张卡动态更新）' },
    { value: 'post', label: '逐步直播（每步一条消息）' },
  ]);

  /**
   * 过程展示是"按会话类型"存的两份设置（私聊 / 群聊），卡片上**两份都列出来**：
   * 只看当前会话类型那一份时，用户在群里想改私聊的展示方式就得先回私聊发一次 `/menu`。
   */
  const STEP_PUSH_FIELDS = Object.freeze([
    { field: 'stepPushDirect', scope: 'direct', label: '任务过程展示（私聊）' },
    { field: 'stepPushGroup', scope: 'group', label: '任务过程展示（群聊）' },
  ]);

  /** 卡片字段名 → 该改哪一份；旧的会话类型字段名（stepPush）也认，保持兼容。 */
  function stepPushTarget(fieldName, conversationType) {
    const hit = STEP_PUSH_FIELDS.find((item) => item.field === fieldName);
    if (hit) return hit;
    if (fieldName !== 'stepPush') return null;
    return conversationType === 'group'
      ? STEP_PUSH_FIELDS[1]
      : STEP_PUSH_FIELDS[0];
  }

  /** 过程展示的两份当前值（面板字段用）。 */
  function stepPushValues(bot) {
    return { direct: bot.stepPushDirect, group: bot.stepPushGroup };
  }

  /**
   * 就地改运行期那份 bot 配置。
   *
   * **必须就地改**：桥、状态这些读者都持有同一个对象（见 `startBot` 里的 `liveBot`），
   * 换成新引用等于它们全都看不到——过程展示这类"改完要立刻生效"的设置就会静默失效。
   */
  function patchRuntime(botId, patch) {
    const record = runtimes.get(botId);
    if (record) Object.assign(record.bot, patch);
  }

  async function startAll() {
    await configStore.load();
    const bots = configStore.list();
    logger.info?.(`[dsh-chat-feishu] 发现 ${bots.length} 个已配置机器人`);
    await Promise.all(bots.map((bot) => startBot(bot)));
  }

  /** 属主 id 的合法形状：该应用下的 open_id，或通配符（= 没有属主）。 */
  const OWNER_ID_PATTERN = /^(\*|ou_[A-Za-z0-9_-]{1,64})$/;
  /** 一台机器人的属主上限（属主绕过所有策略，不该是个长名单）。 */
  const MAX_OWNERS = 10;
  /** 一次最多换多少个 id 的名字（每个都要打一次通讯录/群接口）。 */
  const MAX_RESOLVE_IDS = 50;

  /**
   * 会话键 → 可投递目标（`p2p:ou_x` → 私聊，`group:oc_y` → 群聊）。
   *
   * 同一份翻译两处用：`discover`（运行时状态 / 群列表）与 `targetFromKey`
   * （hub 的**持久**会话绑定表）。只做前者的话，重启后运行时是空的，
   * 设置页就一个可添加的候选都没有。
   *
   * 这里的名字只是**兜底**（掩码后的 id）；能拿到真名的场合由 `decorateTargets` 覆盖。
   */
  const ids = (value) => value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  const targetFor = (kind, rawId, name) => ({
    id: ids(`${kind}:${rawId}`),
    name,
    kind: kind === 'group' ? 'group' : 'direct',
    route: kind === 'group' ? { chatId: rawId } : { openId: rawId },
  });

  function targetFromKey(key) {
    const [kind, rawId] = String(key ?? '').split(':', 2);
    if (!rawId) return null;
    if (kind === 'p2p') return targetFor('p2p', rawId, `私聊 · ${maskAppId(rawId)}`);
    if (kind === 'group') return targetFor('group', rawId, `群聊 · ${maskAppId(rawId)}`);
    return null;
  }

  /** 运行时状态里出现过的会话 → 候选目标。 */
  function targetsFromState(state) {
    return Object.keys(state?.sessions?.() ?? {})
      .map((key) => targetFromKey(key))
      .filter(Boolean);
  }

  /**
   * 名字缓存（群名 / 人名）。
   *
   * 这些名字变得很慢，而每次打开设置页都会走一遍 `delivery.list`；不缓存就会把
   * 飞书接口打成筛子（`chat.list` 还有每秒 5 次的频率上限）。失败也记时间戳，
   * 免得没权限的机器人在每次刷新时反复重试。
   */
  const NAME_TTL_MS = 10 * 60_000;

  /**
   * "缺权限"这类失败的退避间隔。
   *
   * 权限要人去开放平台点，重试再密也不会自己好；而每重试一次，SDK 就往日志里写一次
   * 整个 axios 对象（一次几 KB），把真正的现场淹掉——真机上刷屏的就是这里。
   * 开通权限后点一下「重新连接」即可立即重取，不必等这个窗口。
   */
  const SCOPE_MISSING_TTL_MS = 30 * 60_000;

  /**
   * 把"名字拿不到"的原因压成一句能显示的话 + 开通链接。
   *
   * 权限没开通时飞书会把开通地址写在错误里（`https://open.feishu.cn/app/<appId>/auth?q=…`），
   * 直接把它带给用户比"你自己去开放平台找"有用得多——否则界面上只能看到一串 oc_xxx，
   * 原因却只在日志里（违反"失败必须可见"）。
   */
  function nameHintFrom(error, fallback) {
    const message = String(error?.message ?? error ?? '');
    const url = /https:\/\/open\.feishu\.cn\/app\/[^\s，]+/u.exec(message)?.[0] ?? null;
    const scopeMissing = isScopeMissing(error);
    return Object.freeze({
      code: scopeMissing ? 'feishu/scope-missing' : 'feishu/name-failed',
      message: scopeMissing
        ? `${fallback}：飞书应用还没开通对应权限，所以只能显示 id。开通后点「重新连接」立刻生效。`
        : `${fallback}：${message.slice(0, 160)}`,
      url,
    });
  }

  function isScopeMissing(error) {
    return /Access denied|99991672/u.test(String(error?.message ?? error ?? ''));
  }

  /** 失败后这个方向多久不再重试：缺权限长退避，其它错误照旧（下次刷新就重试）。 */
  function backoffMs(error) {
    return isScopeMissing(error) ? SCOPE_MISSING_TTL_MS : 0;
  }

  const nameCache = new Map(); // botId → { chats, chatsAt, chatsBlockMs, users, usersAt, usersBlockMs, nameHint }

  function cacheFor(botId) {
    let entry = nameCache.get(botId);
    if (!entry) {
      entry = {
        chats: new Map(), chatsAt: 0, chatsBlockMs: 0, chatsPromise: null,
        users: new Map(), usersAt: 0, usersBlockMs: 0, userPromises: new Map(),
        nameHint: null,
      };
      nameCache.set(botId, entry);
    }
    return entry;
  }

  /** 手动重连 = 用户可能刚去开放平台开了权限：名字缓存连同"缺权限"的退避一起清掉。 */
  function resetNameCache(botId) {
    nameCache.delete(botId);
  }

  function chatEntries(cache) {
    return [...cache.chats.entries()].map(([chatId, name]) => ({ chatId, name }));
  }

  /**
   * 群列表（带群名）；拿不到就返回空表并记日志，不抛。
   *
   * `minIntervalMs` 是最短重取间隔：正常走 `NAME_TTL_MS`，遇到"缓存里没有的群"时
   * 传一个更短的值（至少间隔一分钟），免得一个查不到的群 id 把接口打成筛子
   * （`chat.list` 有每秒 5 次的频率上限）。失败也会更新时间戳，避免反复重试；
   * 同一瞬间的并发调用（打开设置页时 `delivery.list` 会并发问几次）也只发一次请求。
   */
  async function allChats(botId, { minIntervalMs = NAME_TTL_MS } = {}) {
    const record = runtimes.get(botId);
    if (!record?.gateway) return [];
    const cache = cacheFor(botId);
    if (Date.now() - cache.chatsAt < Math.max(minIntervalMs, cache.chatsBlockMs)) {
      return chatEntries(cache);
    }
    if (cache.chatsPromise) return cache.chatsPromise;
    cache.chatsPromise = (async () => {
      try {
        const chats = await record.gateway.listChats();
        cache.chats = new Map(chats.map((chat) => [chat.chatId, chat.name]));
        cache.chatsBlockMs = 0;
        return chats;
      } catch (error) {
        cache.nameHint = nameHintFrom(error, '读不到群名');
        cache.chatsBlockMs = backoffMs(error);
        logger.warn?.(`[dsh-chat-feishu] 读取群列表失败，群名将退回 id：${error?.message ?? error}`);
        return [];
      } finally {
        cache.chatsAt = Date.now();
        cache.chatsPromise = null;
      }
    })();
    return cache.chatsPromise;
  }

  /** 补一个人名；拿不到就留空。同一个人的并发查询合成一次。 */
  async function userName(botId, openId) {
    const record = runtimes.get(botId);
    if (!record?.gateway || !openId) return '';
    const cache = cacheFor(botId);
    // 缺权限期间不再逐人重试：换个人也照样拿不到，只会把日志刷满。
    if (cache.usersBlockMs > 0 && Date.now() - cache.usersAt < cache.usersBlockMs) {
      return cache.users.get(openId) ?? '';
    }
    const hit = cache.users.get(openId);
    if (hit !== undefined && Date.now() - cache.usersAt < NAME_TTL_MS) return hit;
    const pending = cache.userPromises.get(openId);
    if (pending) return pending;
    const task = (async () => {
      try {
        const name = await record.gateway.getUserName(openId);
        cache.users.set(openId, name);
        cache.usersBlockMs = 0;
        return name;
      } catch (error) {
        cache.nameHint = nameHintFrom(error, '读不到人名');
        cache.usersBlockMs = backoffMs(error);
        logger.warn?.(`[dsh-chat-feishu] 读取用户信息失败，人名将退回 id：${error?.message ?? error}`);
        cache.users.set(openId, '');
        return '';
      } finally {
        cache.usersAt = Date.now();
        cache.userPromises.delete(openId);
      }
    })();
    cache.userPromises.set(openId, task);
    return task;
  }

  /**
   * 平台 id → 名字（`oc_` 群查群名，`ou_` 人查人名）；换不到就返回 null。
   *
   * 为什么要它：访问策略的白名单里存的只有平台 id，设置页上就是一排
   * `ou_4f6a8c0e2b1d9753…`——认不出是谁、也看不出加错了人（真机反馈
   * "群了白名单 只显示id不显示名称，不方便管理"）。
   */
  async function resolveName(botId, id) {
    if (id.startsWith('oc_')) {
      const cached = cacheFor(botId).chats.get(id);
      if (cached) return cached;
      // 缓存里没有这个群（刚被拉进去 / 还没列过）：以更短的间隔重取一次群列表。
      await allChats(botId, { minIntervalMs: 60_000 });
      return cacheFor(botId).chats.get(id) ?? null;
    }
    return (await userName(botId, id)) || null;
  }

  const delivery = Object.freeze({
    /** 主动发文本：群用 chat_id，私聊用用户的 open_id。 */
    async send({ botId, target, text }) {
      const record = runtimes.get(botId);
      if (!record?.gateway || record.phase !== 'running') {
        const error = new Error(`机器人 ${botId} 当前不在线，无法投递。`);
        error.code = 'feishu/bot-offline';
        throw error;
      }
      const { chatId, openId } = target.route ?? {};
      if (!chatId && !openId) {
        const error = new Error('投递目标的 route 既没有 chatId 也没有 openId。');
        error.code = 'chat/bad-target';
        throw error;
      }
      return record.gateway.sendText({ chatId, openId, text });
    },

    /**
     * 主动发文件/图片：图片走 image 消息（有预览），其余走 file 消息。
     *
     * @param options - { botId, target, file: { path, name, size, kind } }。
     */
    async sendFile({ botId, target, file }) {
      const record = runtimes.get(botId);
      if (!record?.gateway || record.phase !== 'running') {
        const error = new Error(`机器人 ${botId} 当前不在线，无法投递。`);
        error.code = 'feishu/bot-offline';
        throw error;
      }
      const { chatId, openId } = target.route ?? {};
      if (!chatId && !openId) {
        const error = new Error('投递目标的 route 既没有 chatId 也没有 openId。');
        error.code = 'chat/bad-target';
        throw error;
      }
      if (file?.kind === 'image') {
        const sent = await record.gateway.sendImage({ chatId, openId, path: file.path });
        return { ...sent, name: file.name, size: file.size, kind: 'image' };
      }
      const sent = await record.gateway.sendFile({
        chatId, openId, path: file.path, name: file.name,
      });
      return { ...sent, kind: 'file' };
    },

    /**
     * 候选目标：机器人**所在的全部群** + 运行时聊过的会话。
     *
     * 群列表来自飞书接口，因此"刚被拉进群、还没说过话"的群也能作为候选被添加；
     * 拿不到权限时退回运行时状态（跟以前一样）。
     */
    async discover({ botId }) {
      const record = runtimes.get(botId);
      const chats = await allChats(botId);
      const groupTargets = chats.map((chat) => targetFor(
        'group',
        chat.chatId,
        chat.name || `群聊 · ${maskAppId(chat.chatId)}`,
      ));
      const sessionTargets = record?.state ? targetsFromState(record.state) : [];
      return [...groupTargets, ...sessionTargets];
    },

    /** 把 hub 持久会话绑定表里的会话键翻成目标（重启后仍有候选）。 */
    targetFromKey,

    /**
     * 给目标补上**人能认出的名字**（群名 / 人名）。
     *
     * 只在渠道里做：hub 不认平台概念。补不到就保持原样（掩码 id）——
     * 权限没开通的机器人不该因为"名字拿不到"就看不到目标。
     */
    async decorateTargets({ botId, targets }) {
      const list = Array.isArray(targets) ? targets : [];
      if (list.length === 0) return list;
      // 群名查不到的（例如刚从会话绑定表来的群）先重取一次群列表，最短间隔一分钟。
      if (list.some((target) => target?.kind === 'group'
        && !cacheFor(botId).chats.has(target.route?.chatId))) {
        await allChats(botId, { minIntervalMs: 60_000 });
      }
      const chats = cacheFor(botId).chats;
      const decorated = [];
      for (const target of list) {
        if (target?.kind === 'group') {
          const name = chats.get(target.route?.chatId);
          decorated.push(name ? { ...target, name } : target);
        } else if (target?.kind === 'direct') {
          const name = await userName(botId, target.route?.openId);
          decorated.push(name ? { ...target, name } : target);
        } else {
          decorated.push(target);
        }
      }
      return decorated;
    },
  });

  return Object.freeze({
    start: startAll,
    delivery,
    async stop() {
      await Promise.all([...runtimes.keys()].map((botId) => stopBot(botId)));
    },
    status,
    configStore,

    endpoints: Object.freeze({
      'connection.status': async () => ({ ok: true, value: await status() }),

      'bot.reconnect': async (payload) => {
        if (typeof payload?.botId !== 'string' || !payload.botId) {
          return { ok: false, error: { code: 'chat/bad-request', message: '需要 botId。', details: {} } };
        }
        await configStore.load();
        const bot = configStore.get(payload.botId);
        if (!bot) {
          return {
            ok: false,
            error: { code: 'feishu/unknown-bot', message: `未找到机器人 ${payload.botId}。`, details: {} },
          };
        }
        await stopBot(bot.id);
        // 手动重连是用户"我刚去开了权限"的信号：清掉名字缓存与缺权限的退避。
        resetNameCache(bot.id);
        const record = await startBot(bot);
        return { ok: true, value: botStatus(record) };
      },

      /**
       * 设这台机器人的属主。
       *
       * `ownerOpenIds: ['*']` = **没有属主**（公开机器人：没有人绕过访问策略）。
       * 改完必须重连：桥在创建时捕获了 `bot` 对象，属主判定用的就是它，重连才会重建。
       */
      'bot.owner.set': async (payload) => {
        const owners = payload?.ownerOpenIds;
        const valid = typeof payload?.botId === 'string' && payload.botId
          && Array.isArray(owners) && owners.length > 0 && owners.length <= MAX_OWNERS
          && owners.every((id) => typeof id === 'string' && OWNER_ID_PATTERN.test(id));
        if (!valid) {
          // 把不合法的值带出来：属主必须是平台 open_id，传成投递目标 id（`p2p_ou_…`）
          // 时只看这句话是查不出来的（真机上踩过）。
          const offending = Array.isArray(owners)
            ? owners.filter((id) => typeof id !== 'string' || !OWNER_ID_PATTERN.test(id))
            : [];
          const detail = offending.length > 0
            ? `不合法的值：${offending.map((id) => JSON.stringify(String(id).slice(0, 48))).join('、')}`
            : 'ownerOpenIds 必须是非空数组。';
          return {
            ok: false,
            error: {
              code: 'chat/bad-request',
              message: `bot.owner.set 需要 { botId, ownerOpenIds }：1–${MAX_OWNERS} 个该应用的 open_id`
                + `（形如 ou_…），或用 ['*'] 表示没有属主。${detail}`,
              details: { offending: offending.map((id) => String(id).slice(0, 48)) },
            },
          };
        }
        await configStore.load();
        const bot = configStore.get(payload.botId);
        if (!bot) {
          return {
            ok: false,
            error: { code: 'feishu/unknown-bot', message: `未找到机器人 ${payload.botId}。`, details: {} },
          };
        }
        const saved = await configStore.saveBot({
          id: bot.id,
          ownerOpenIds: [...new Set(owners.map((id) => id.trim()))],
        });
        // 重连一次：新属主要立刻对"谁能绕过策略"生效，不能等下次重启。
        await stopBot(saved.id);
        const record = await startBot(saved);
        return { ok: true, value: botStatus(record) };
      },

      'bot.delete': async (payload) => {
        if (typeof payload?.botId !== 'string' || payload.confirm !== true) {
          return {
            ok: false,
            error: { code: 'chat/bad-request', message: '删除需要 botId 与 confirm=true。', details: {} },
          };
        }
        await stopBot(payload.botId);
        runtimes.delete(payload.botId);
        await configStore.removeBot(payload.botId);
        return { ok: true, value: { removed: true, botId: payload.botId } };
      },

      /**
       * id → 名字（设置页画白名单用）。
       *
       * 白名单存的是平台 id；只显示 id 的话，一排 `ou_4f6a8c0e…` 里认不出是谁、
       * 也没法确认自己加错了人。查不到就**不放进结果**（界面退回显示 id），
       * 原因放在 `hint` 里，避免"名字没了却不知道为什么"。
       */
      'names.resolve': async (payload) => {
        const raw = Array.isArray(payload?.ids) ? payload.ids : null;
        if (typeof payload?.botId !== 'string' || !payload.botId || raw === null) {
          return {
            ok: false,
            error: {
              code: 'chat/bad-request',
              message: 'names.resolve 需要 { botId, ids: string[] }。',
              details: {},
            },
          };
        }
        await configStore.load();
        if (!configStore.get(payload.botId)) {
          return {
            ok: false,
            error: { code: 'feishu/unknown-bot', message: `未找到机器人 ${payload.botId}。`, details: {} },
          };
        }
        const ids = [...new Set(raw
          .filter((id) => typeof id === 'string' && id.trim())
          .map((id) => id.trim()))];
        const limited = ids.slice(0, MAX_RESOLVE_IDS);
        const pairs = await Promise.all(
          limited.map(async (id) => [id, await resolveName(payload.botId, id)]),
        );
        return {
          ok: true,
          value: {
            names: Object.fromEntries(pairs.filter(([, name]) => Boolean(name))),
            // 名单特别长时只查前 N 个：界面据此说明"还有几个没查"。
            truncated: ids.length > limited.length,
            hint: nameCache.get(payload.botId)?.nameHint ?? null,
          },
        };
      },

      /** 任务过程展示：私聊/群聊两份，原子保存并立即生效。 */
      /**
       * 渠道自带的面板字段（hub 的 `panel.read` 调这里）。
       *
       * 只报**当前会话类型**那一份：卡片是发给某个会话的，同时暴露私聊+群聊两份会让人改错。
       */
      'panel.fields': async (payload) => {
        if (typeof payload?.botId !== 'string' || !payload.botId) {
          return { ok: false, error: { code: 'chat/bad-request', message: 'panel.fields 需要 botId。', details: {} } };
        }
        await configStore.load();
        const bot = configStore.get(payload.botId);
        if (!bot) {
          return { ok: false, error: { code: 'feishu/unknown-bot', message: `未找到机器人 ${payload.botId}。`, details: {} } };
        }
        const values = stepPushValues(bot);
        return {
          ok: true,
          value: {
            // 两份都列出来：改哪一份不由"卡在哪"决定，而由用户选的那个下拉决定。
            fields: STEP_PUSH_FIELDS.map((item) => ({
              field: item.field,
              label: item.label,
              value: values[item.scope],
              options: STEP_PUSH_FIELD_OPTIONS,
            })),
          },
        };
      },

      /**
       * 渠道自带的**动作按钮**（hub 的 `panel.read` 调这里）：卡片上多几个"点一下做事"的按钮。
       *
       * 只给属主：重连会断开并重建长连接（期间消息可能延迟），这是机器人级操作。
       */
      'panel.actions': async (payload) => {
        if (typeof payload?.botId !== 'string' || !payload.botId) {
          return { ok: false, error: { code: 'chat/bad-request', message: 'panel.actions 需要 botId。', details: {} } };
        }
        if (payload.isOwner !== true) return { ok: true, value: { actions: [] } };
        await configStore.load();
        const bot = configStore.get(payload.botId);
        if (!bot) return { ok: false, error: { code: 'feishu/unknown-bot', message: `未找到机器人 ${payload.botId}。`, details: {} } };
        return {
          ok: true,
          value: {
            actions: [{
              action: 'reconnect',
              label: '🔌 重连',
              type: 'default',
              /**
               * 重连会**亲手掐掉正在送回执的那条长连接**：真机上点完卡片显示"已重连"，
               * 飞书却弹一句「目标回调服务超时未响应」——回执没能送出去。
               * 声明成 deferred：桥先应答，再执行（与 /history、/compact 同一条规矩）。
               */
              deferred: true,
              // 原生二次确认：重连会短暂断开长连接，别让误触把机器人踢下线。
              confirm: {
                title: '重连这台机器人？',
                text: '会断开并重建长连接，几秒内收不到消息；刚开通的权限/群列表会重新读取。',
              },
            }],
          },
        };
      },

      /** 执行渠道自带的面板动作（hub 的 `panel.act` 调这里）。 */
      'panel.act': async (payload) => {
        if (typeof payload?.botId !== 'string' || !payload.botId || typeof payload?.action !== 'string') {
          return { ok: false, error: { code: 'chat/bad-request', message: 'panel.act 需要 botId 与 action。', details: {} } };
        }
        if (payload.isOwner !== true) {
          return {
            ok: false,
            error: { code: 'chat/owner-only', message: '重连是机器人级操作，只有属主能做。', details: {} },
          };
        }
        if (payload.action !== 'reconnect') {
          return {
            ok: false,
            error: { code: 'chat/unknown-action', message: `飞书面板没有这个动作：${payload.action}`, details: {} },
          };
        }
        await configStore.load();
        const bot = configStore.get(payload.botId);
        if (!bot) return { ok: false, error: { code: 'feishu/unknown-bot', message: `未找到机器人 ${payload.botId}。`, details: {} } };
        await stopBot(bot.id);
        // 手动重连是用户"我刚去开了权限"的信号：清掉名字缓存与缺权限的退避（与 RPC 那条路同一套）。
        resetNameCache(bot.id);
        const record = await startBot(bot);
        const status = botStatus(record);
        return {
          ok: true,
          value: {
            action: 'reconnect',
            message: status?.connected === true
              ? '已重连（长连接已重建）。'
              : `重连完成，但当前未连上${status?.errorMessage ? `：${status.errorMessage}` : ''}。`,
          },
        };
      },

      /** 改渠道自带的面板字段（hub 的 `panel.apply` 调这里）。 */
      'panel.apply': async (payload) => {
        if (typeof payload?.botId !== 'string' || !payload.botId || typeof payload?.field !== 'string') {
          return { ok: false, error: { code: 'chat/bad-request', message: 'panel.apply 需要 botId 与 field。', details: {} } };
        }
        const target = stepPushTarget(payload.field, payload.conversationType);
        if (!target) {
          return {
            ok: false,
            error: { code: 'chat/unknown-field', message: `飞书面板不支持 ${payload.field}。`, details: {} },
          };
        }
        const allowed = STEP_PUSH_FIELD_OPTIONS.map((item) => item.value);
        if (!allowed.includes(payload.value)) {
          return {
            ok: false,
            error: {
              code: 'chat/bad-request',
              message: `过程展示只能是 ${allowed.join(' / ')}。`,
              details: {},
            },
          };
        }
        await configStore.load();
        const bot = configStore.get(payload.botId);
        if (!bot) {
          return { ok: false, error: { code: 'feishu/unknown-bot', message: `未找到机器人 ${payload.botId}。`, details: {} } };
        }
        const next = {
          direct: target.scope === 'direct' ? payload.value : bot.stepPushDirect,
          group: target.scope === 'group' ? payload.value : bot.stepPushGroup,
        };
        const saved = await configStore.setStepPush(payload.botId, next);
        // 立刻生效：运行期那份 bot 对象要被就地改掉（与设置页那条路一致）。
        patchRuntime(payload.botId, {
          stepPushDirect: saved.stepPushDirect,
          stepPushGroup: saved.stepPushGroup,
        });
        const label = STEP_PUSH_FIELD_OPTIONS.find((item) => item.value === payload.value)?.label ?? payload.value;
        return {
          ok: true,
          value: {
            value: payload.value,
            message: `${target.scope === 'group' ? '群聊' : '私聊'}过程展示已设为「${label}」，立即生效。`,
          },
        };
      },

      'bot.step-push.set': async (payload) => {
        const modes = payload?.stepPush;
        if (typeof payload?.botId !== 'string' || !payload.botId
          || modes === null || typeof modes !== 'object' || Array.isArray(modes)
          || Object.keys(modes).length !== 2
          || typeof modes.direct !== 'string' || typeof modes.group !== 'string') {
          return {
            ok: false,
            error: {
              code: 'chat/bad-request',
              message: 'bot.step-push.set 需要 { botId, stepPush: { direct, group } }。',
              details: {},
            },
          };
        }
        const saved = await configStore.setStepPush(payload.botId, modes);
        patchRuntime(payload.botId, {
          stepPushDirect: saved.stepPushDirect,
          stepPushGroup: saved.stepPushGroup,
        });
        return {
          ok: true,
          value: { stepPush: { direct: saved.stepPushDirect, group: saved.stepPushGroup } },
        };
      },
    }),
  });
}
