/**
 * dsh-chat Hub：host 侧插件入口。
 *
 * 职责边界（见 CONTRACT.md）：
 * - hub 提供**渠道无关**的一切：渠道注册表、每机器人共享设置、上下文增强引擎、
 *   提示词登记、会话桥、RPC 载体、控制端点；
 * - 渠道包提供**平台相关**的一切：协议客户端、凭据、机器人/会话状态、
 *   渠道专属设置（如飞书的任务过程展示）与自己的设置页。
 *
 * @module dsh-chat/host/plugin
 */

import { stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  CONTRACT_VERSION, CONTROL_CHANNEL_ID, HOST_SERVICE, HUB_VERSION,
} from '../shared/contract.mjs';
import * as accessPolicy from '../shared/access-policy.mjs';
import * as contextEnhancement from '../shared/context-enhancement.mjs';
import {
  enhanceForwardedMessages as enhanceForwardedMessagesFn,
  forwardedMessagesText as forwardedMessagesTextFn,
} from '../shared/forwarded-messages.mjs';
import { enhanceReplyReference as enhanceReplyReferenceFn } from '../shared/reply-reference.mjs';
import { createBotSettingsStore } from './bot-settings.mjs';
import { createChannelRegistry } from './channel-registry.mjs';
import { createCommandRegistry, registerBuiltinCommands } from './commands.mjs';
import { createDeferredDelivery } from './deferred.mjs';
import { createDeliveryService } from './delivery.mjs';
import { channelLogPath, createLogFileSink, withFileSink } from './file-log.mjs';
import { readLogTail } from './log-tail.mjs';
import { normalizeBotModel } from './bot-model.mjs';
import { createPanelService, readModelCatalog, workspaceCandidates } from './panel.mjs';
import { createGuidanceRegistry } from './guidance.mjs';
import { installDeliverableSection, installSourceGuidanceSection } from './prompt-context.mjs';
import { createInteractionService } from './interactions.mjs';
import { createJsonStore } from './json-store.mjs';
import { channelDataDir, hubDataDir, integrationRoot } from './paths.mjs';
import { createRpcCarrier, fail, failFrom, ok } from './rpc.mjs';
import { createSessionStore } from './session-store.mjs';
import { createSessionBridge } from './sessions.mjs';
import { registerChatTools } from './tools.mjs';

export const name = 'dsh-chat-host';

/** hub 需要 DSH 的连接载体、凭据服务与会话网关（modern 路径）。 */
export const inject = ['connection', 'credentials', 'typertGateway'];

const CHANNEL_ID = /^[a-z][a-z0-9-]{1,31}$/;
const BOT_ID = /^[A-Za-z0-9_@.:+-]{1,256}$/;

/**
 * 显式的渠道数据目录覆盖（`config.channelDataDirs`）。
 *
 * @param config - 插件配置。
 * @param channelId - 渠道 id。
 * @returns 绝对路径，或 null。
 */
function channelDataDirOverride(config, channelId) {
  const value = config?.channelDataDirs?.[channelId];
  return typeof value === 'string' && value.trim() ? resolve(value.trim()) : null;
}

function resolveLogger(ctx, scope) {
  const logger = ctx?.logger;
  if (typeof logger === 'function') {
    try {
      return logger(scope);
    } catch {
      // 回落 console。
    }
  }
  return logger ?? console;
}

function provideService(ctx, serviceName, value) {
  if (typeof ctx?.provide === 'function') return ctx.provide(serviceName, value);
  if (typeof ctx?.reflect?.provide === 'function') return ctx.reflect.provide(serviceName, value);
  throw new TypeError('dsh-chat 需要 Cordis 的 provide 能力来发布 dshChat 服务。');
}

function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 校验"某机器人"类载荷：必须**恰好**是 channelId、botId 加上 extra 列出的键。
 *
 * 用"恰好"而不是"至少"是为了让多传/少传的客户端立刻收到 bad-request，而不是被默默忽略。
 *
 * @param payload - 待校验载荷。
 * @param options - { withConfig } 或 { extra: [...] }。
 * @returns 是否合法。
 */
function validBotPayload(payload, options = {}) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const allowed = options.withConfig
    ? ['channelId', 'botId', 'config']
    : ['channelId', 'botId', ...(options.extra ?? [])];
  const keys = Object.keys(payload);
  // 可选字段（如 sendFile 的 name）允许缺席，但绝不允许出现没声明的键。
  if (keys.length < allowed.length - (options.optional?.length ?? 0) || keys.length > allowed.length) {
    return false;
  }
  if (!keys.every((key) => allowed.includes(key))) return false;
  if (!allowed.filter((key) => !options.optional?.includes(key)).every((key) => Object.hasOwn(payload, key))) {
    return false;
  }
  if (typeof payload.channelId !== 'string' || !CHANNEL_ID.test(payload.channelId)) return false;
  if (typeof payload.botId !== 'string' || !BOT_ID.test(payload.botId)) return false;
  if (!options.withConfig) return true;
  return payload.config !== null && typeof payload.config === 'object' && !Array.isArray(payload.config);
}

/**
 * Cordis host 插件入口。
 *
 * @param ctx - host 上下文。
 * @param config - 插件配置：{ dataDir, integrationRoot, deferred? }。
 *   `deferred` 可选地覆盖延迟交付的三个时间窗（`firstCheckMs / intervalMs / maxAgeMs`）——
 *   默认 1 分钟 / 30 秒 / 30 分钟；编排演练或排查时可以用小值把整条链路跑完。
 */
export function apply(ctx, config = {}) {
  const baseLogger = resolveLogger(ctx, 'dsh-chat');
  const integrations = integrationRoot(config.integrationRoot);
  const logsDir = join(hubDataDir(config.dataDir), 'logs');
  /** hub 与每个渠道各一份日志文件：出故障时不必再靠用户终端滚屏回忆。 */
  const hubLog = createLogFileSink({ path: channelLogPath(logsDir, 'hub') });
  const logger = withFileSink({ logger: baseLogger, sink: hubLog, scope: 'dsh-chat' });
  const settings = createBotSettingsStore({ dataDir: hubDataDir(config.dataDir), logger });
  /** 已注册渠道的旧数据目录，供 `maintenance.import-legacy` 重跑导入。 */
  const legacyDirs = new Map();
  const guidance = createGuidanceRegistry();
  /**
   * 增强提示词注入到哪里：`system`（默认，DSH 的系统提示词段）或 `prefix`（拼在消息前面）。
   *
   * 默认走系统提示词——提示词是"对模型的长期指令"，不该混进用户轮次（每轮重复、还可能被
   * 当成用户说的话）。Host 没有 `systemPrompt` 服务时自动退回 `prefix`，功能不丢。
   */
  const guidanceTarget = config.guidanceTarget === 'prefix' ? 'prefix' : 'system';
  /** 提示词段是否已经装上（只在装上之后才从消息前缀里去掉提示词块）。 */
  let guidanceInSystemPrompt = false;
  let guidanceFallbackWarned = false;
  /**
   * 尽力把"增强提示词"装成系统提示词段。
   *
   * 服务是**可选依赖**：Cordis 的 `inject` 只能声明必选，声明了会让"没装
   * dsh-system-prompt 的部署"整块加载不了；所以这里运行期探测 + 每次用之前重试一次
   * （服务晚到也能装上）。装不上就退回前缀注入，**只告警一次**，功能不丢。
   */
  function ensureGuidanceSection() {
    if (guidanceInSystemPrompt) return true;
    if (guidanceTarget !== 'system') return false;
    if (installSourceGuidanceSection(ctx, guidance, { logger })) {
      guidanceInSystemPrompt = true;
      return true;
    }
    if (!guidanceFallbackWarned) {
      guidanceFallbackWarned = true;
      logger.warn?.('[dsh-chat] 当前 Host 没有可用的 systemPrompt 服务：增强提示词退回'
        + '"拼在消息前缀"的老路（功能不丢，但会跟着每条消息进会话）。');
    }
    return false;
  }
  ensureGuidanceSection();

  /**
   * 「交付文件要显式 `present`」那段说明（与增强提示词分开：那是用户内容，这是机制）。
   *
   * 真机踩过（会话 75cffe0f）：模型把 SQL 写到磁盘、在答案里写了路径，却没调 `present`
   * → 插件手里没有交付声明，用户什么文件也没收到。与增强提示词同样的"服务可能晚到"处理：
   * 每次用之前重试一次、只告警一次。
   */
  let deliverableSectionInstalled = false;
  let deliverableWarned = false;
  function ensureDeliverableSection() {
    if (deliverableSectionInstalled) return true;
    if (installDeliverableSection(ctx, {
      // 同步判定"这个会话是不是我们的聊天会话"：绑在某个渠道机器人上就是。
      isChatSession: (sessionId) => sessionStore.locate(sessionId) != null,
      logger,
    })) {
      deliverableSectionInstalled = true;
      return true;
    }
    if (!deliverableWarned) {
      deliverableWarned = true;
      logger.warn?.('[dsh-chat] 当前 Host 没有可用的 systemPrompt 服务：'
        + '「交付文件要显式 present」这条说明注入不了（文件仍能交付，只是模型可能不知道）。');
    }
    return false;
  }

  /** 会话桥用的登记表：publish 之前再试一次装段（服务可能晚于本插件就绪）。 */
  const guidanceForBridge = Object.freeze({
    publish(sessionId, text) {
      ensureGuidanceSection();
      ensureDeliverableSection();
      guidance.publish(sessionId, text);
    },
    get: (sessionId) => guidance.get(sessionId),
    forget: (sessionId) => guidance.forget(sessionId),
  });

  /**
   * 给渠道用的上下文增强引擎 = 引擎 + 一个**包装过的 `enhanceContent`**。
   *
   * 包装只做一件事：提示词已经在系统提示词段里时**不把它再拼进消息正文**
   * （同一段提示词两处都出现 → 用户看到的还是"走的消息"）。
   * **渠道 deps 与 `dshChat.contextEnhancement` 必须是同一个对象**：真机上翻过一次车——
   * 服务面给了包装版、渠道 deps 给的是原始模块，于是"渠道照旧拼提示词"，
   * 而测试与演练都在调服务面那份，谁都发现不了。
   */
  const contextEnhancementService = Object.freeze({
    ...contextEnhancement,
    enhanceContent: (content, snapshot, sourceFactory) => contextEnhancement.enhanceContent(
      content,
      snapshot,
      sourceFactory,
      { includeGuidance: !ensureGuidanceSection() },
    ),
  });
  const sessionStore = createSessionStore({ dataDir: hubDataDir(config.dataDir), logger });
  // 提示词段是按会话现算的，装上就行；服务不在/晚到时的告警与重试见 ensureDeliverableSection。
  ensureDeliverableSection();
  /** 人在环交互：agent 的提问/审批送到 IM 里问，答案从 IM 收回来。 */
  const interactions = createInteractionService({ logger });
  /**
   * 延迟交付：`ask()` 判定超时后登记一条记录，之后有界复查会话终态、拿到结果补发。
   *
   * `probe` 由会话桥提供（只读叶子字段），`deliver` 由渠道在建桥时按 channel/bot 注册。
   * 这里先建服务、再建会话桥：闭包是懒执行的，不构成循环依赖。
   */
  const deferred = createDeferredDelivery({
    dataDir: hubDataDir(config.dataDir),
    logger,
    // 时间窗可按部署调整（默认 1 分钟 / 30 秒 / 30 分钟）：演练脚本用小值把补发链路跑完。
    ...(config.deferred && typeof config.deferred === 'object' ? config.deferred : {}),
    probe: async ({ record }) => sessions.probeTurn({
      channelId: record.channelId,
      botId: record.botId,
      key: record.key,
      sessionId: record.sessionId,
    }),
  });
  const sessions = createSessionBridge({
    ctx, logger, store: sessionStore, settings, guidance: guidanceForBridge, interactions, deferred,
  });
  const rpc = createRpcCarrier(ctx, { logger });
  /** 主动投递：hub 持有目标清单与调度，渠道提供"怎么发"与"能发给谁"。 */
  const delivery = createDeliveryService({ settings, sessionStore, logger });
  /**
   * 控制面板：IM 卡片要的"当前值 + 可选项 + 应用某个选择"。
   * agentPresets 是可选服务（某些部署没装），用 ctx.get 取、缺失时按"没有预设"处理。
   */
  const optionalAgentPresets = typeof ctx.get === 'function' ? ctx.get('agentPresets') : undefined;
  const panel = createPanelService({
    settings, sessions, sessionStore, agentPresets: optionalAgentPresets, logger,
    /**
     * 渠道自带的面板字段（飞书的「任务过程展示」）走这条：hub 不认识渠道语义，
     * 只把 `panel.fields` / `panel.apply` 透传给渠道，渠道没实现就当没有这类设置。
     */
    channelRpc: (channelId, method, payload) => registry.handleRpc(channelId, method, payload),
  });

  function storageFor(channelId) {
    return Object.freeze({
      read: (botId) => settings.read(channelId, botId),
      write: (botId, patch) => settings.write(channelId, botId, patch),
      list: () => settings.list(channelId),
    });
  }

  const registry = createChannelRegistry({
    logger,
    rpc,
    onDelivery: (channelId, provider) => delivery.attach(channelId, provider),
    /**
     * 渠道注册后按 `legacy.dir` 做一次性旧设置导入（只读旧文件，绝不改写）。
     * 旧数据目录沿用 dsh-im 的命名，因此用户现有绑定与设置零迁移。
     */
    onRegistered: (channelId, legacy) => {
      const overridden = channelDataDirOverride(config, channelId);
      if (overridden) {
        // 隔离调试/双实例：既不做真实目录的旧设置导入，也不写导入标记，
        // 否则会把真实来源记成"已导入"，等真正迁移时反而跳过。
        legacyDirs.set(channelId, overridden);
        return;
      }
      if (!legacy?.dir) return;
      const dir = channelDataDir(legacy.dir, integrations);
      legacyDirs.set(channelId, dir);
      void settings.importLegacy(channelId, dir).catch((error) => {
        logger.warn?.(`[dsh-chat] 渠道 ${channelId} 旧设置导入失败：${error?.message ?? error}`);
      });
    },
    createDeps: (channelId, definition) => Object.freeze({
      channelId,
      // 渠道的每一行日志同时进 <channelId>.log，排查时我能直接读文件。
      logger: withFileSink({
        logger: resolveLogger(ctx, `dsh-chat:${channelId}`),
        sink: createLogFileSink({ path: channelLogPath(logsDir, channelId) }),
        scope: `dsh-chat-${channelId}`,
      }),
      credentials: ctx.credentials,
      /**
       * 渠道历史数据目录（沿用 dsh-im 命名，保证零重绑）。
       * `config.channelDataDirs[channelId]` 可显式覆盖——隔离调试或想同时跑两份时用。
       */
      dataDir: channelDataDirOverride(config, channelId)
        ?? (definition.legacy?.dir
          ? channelDataDir(definition.legacy.dir, integrations)
          : hubDataDir(config.dataDir)),
      resolveDataDir: (name) => channelDataDir(name, integrations),
      storage: storageFor(channelId),
      /**
       * 渠道自建存储用的 JSON 文档工厂：原子写、首次覆盖备份、串行队列、变更订阅
       * 由 hub 统一实现，渠道不必各写一遍。
       */
      createJsonStore,
      /** 读取设置前先 await 它，避免启动竞态读到空文档。 */
      ready: () => settings.ready(),
      contextEnhancement: contextEnhancementService,
      /**
       * 延迟交付：渠道建桥时注册"怎么把补发内容发回这个会话"。
       * `register({ channelId, botId, deliver })`，`deliver({ key, text, record })`。
       */
      deferred: Object.freeze({ register: (options) => deferred.register(options) }),
      /**
       * 引用回复：渠道只把平台字段映射成 `reply`（正文/类型/文件名/发送者/消息 id），
       * 拼装（标签、限长、安全转义、读不到时的标记）由 hub 实现一次、所有渠道复用。
       */
      replyReference: Object.freeze({ enhanceReplyReference: enhanceReplyReferenceFn }),
      /**
       * 合并转发：渠道把外壳 id 与查回来的原始条目交给 hub，展开（建树、限深限条、
       * 标签渲染）由 hub 实现一次、所有渠道复用。
       */
      forwardedMessages: Object.freeze({
        enhanceForwardedMessages: enhanceForwardedMessagesFn,
        forwardedMessagesText: forwardedMessagesTextFn,
      }),
      /** 访问策略：渠道用它判定放行与命令权限（属主绕过由渠道传入 isOwner）。 */
      accessPolicy: Object.freeze({ ...accessPolicy }),
      /** 机器人命令：渠道把入站文本交进来即可，命令实现只在 hub 一份。 */
      commands: Object.freeze({
        handle: (options) => commands.handle(options),
        list: () => commands.list(),
      }),
      guidance,
      sessions,
      /**
       * 控制面板：渠道的可交互卡片用它读"当前值 + 可选项"、并应用用户的选择。
       * `read({channelId, botId, key})` / `apply({channelId, botId, key, field, value})`。
       */
      panel,
      /** 渠道接入 IM 回传（提问/审批）：attach({ channelId, botId, send })。 */
      interactions: Object.freeze({
        attach: (options) => interactions.attach(options),
        offer: (options) => interactions.offer(options),
        has: (channelId) => interactions.has(channelId),
      }),
    }),
  });

  // 命令内核：命令操作的都是渠道无关的东西，因此 hub 实现一次、所有渠道复用。
  const commands = createCommandRegistry({
    logger,
    services: {
      sessions,
      bots: {
        read: (channelId, botId) => settings.read(channelId, botId),
        write: (channelId, botId, patch) => settings.write(channelId, botId, patch),
      },
      channels: { list: () => registry.list() },
      agentPresets: optionalAgentPresets,
      // `/diag`：把设置页那份诊断现场用文字回出来（手机上排查不必开电脑）。
      diagnostics: { read: () => collectDiagnostics() },
      // `/menu` 用它取"当前值 + 可选项"，卡片据此渲染下拉、渠道不必自己拼状态。
      panel,
    },
  });
  registerBuiltinCommands(commands, { hubVersion: HUB_VERSION, listCommands: () => commands.list() });

  /**
   * hub 控制端点：渠道无关、所有渠道共用，因此渠道包不必重复实现。
   *
   * @param method - 方法名。
   * @param payload - 载荷。
   * @returns RPC 结果。
   */
  /**
   * 自助排查的"一屏现场"：每台机器人的连接状态与最近错误 + 日志尾部。
   *
   * 抽成函数是因为**两条路要用同一份数据**：设置页的 `diagnostics.read` 与聊天里的 `/diag`
   * （手机上排查时不想开电脑）。只取叶子字段，前端/命令都不碰 host 的活对象。
   */
  async function collectDiagnostics() {
    const entries = registry.list();
    const channels = await Promise.all(entries.map(async (entry) => {
      const result = await registry.handleRpc(entry.id, 'connection.status', {});
      return {
        id: entry.id,
        label: entry.label,
        version: entry.version ?? null,
        status: entry.status,
        error: entry.error ?? null,
        bots: result?.ok === true ? (result.value?.bots ?? []) : [],
        statusError: result?.ok === true ? null : (result.error?.message ?? '状态读取失败'),
      };
    }));
    const logs = await Promise.all(['hub', ...entries.map((entry) => entry.id)]
      .map((logName) => readLogTail(channelLogPath(logsDir, logName))));
    /**
     * 待补发的延迟交付记录：超时之后那一轮还没跑完时，这里会有记录。
     * 只取叶子字段（渠道/会话键/会话/登记时刻），别把内部的活对象透出去。
     */
    const deferredRecords = deferred.list().map((row) => ({
      channelId: row.channelId,
      botId: row.botId,
      key: row.key,
      sessionId: row.sessionId,
      turn: row.turn,
      timedOutAt: row.timedOutAt,
      attempts: row.attempts,
      lastError: row.lastError,
    }));
    return {
      dataDir: hubDataDir(config.dataDir),
      logDir: logsDir,
      channels,
      deferred: deferredRecords,
      logs,
    };
  }

  async function controlHandler(method, payload) {
    if (method === 'channel.list') {
      if (payload !== null && (typeof payload !== 'object' || Array.isArray(payload)
        || Object.keys(payload).length > 0)) {
        return fail('chat/bad-request', 'channel.list 不接受参数。');
      }
      return ok({
        contractVersion: CONTRACT_VERSION,
        // 「版本与更新」面板要的三个层次：hub 版本、渠道契约版本、各渠道包版本。
        hubVersion: HUB_VERSION,
        hubPackage: '@sidleo3/dsh-chat',
        dataDir: hubDataDir(config.dataDir),
        logDir: logsDir,
        channels: registry.list(),
      });
    }
    if (method === 'diagnostics.read') {
      if (payload !== null && (typeof payload !== 'object' || Array.isArray(payload)
        || Object.keys(payload).length > 0)) {
        return fail('chat/bad-request', 'diagnostics.read 不接受参数。');
      }
      // 日志读不到不算失败（只返回 exists:false 的那一项）。
      return ok(await collectDiagnostics());
    }
    if (method === 'bot.settings.get') {
      if (!validBotPayload(payload)) return fail('chat/bad-request', 'bot.settings.get 需要 channelId 与 botId。');
      await settings.ready();
      return ok({ settings: settings.read(payload.channelId, payload.botId) });
    }
    if (method === 'bot.panel-sections.set') {
      if (!validBotPayload(payload, { extra: ['sections'] })) {
        return fail('chat/bad-request', 'bot.panel-sections.set 需要 channelId、botId 与 sections。');
      }
      try {
        const saved = await settings.write(payload.channelId, payload.botId, {
          panelSections: payload.sections,
        });
        return ok({ panelSections: saved.panelSections });
      } catch (error) {
        return failFrom(error, 'chat/panel-sections-failed');
      }
    }

    if (method === 'bot.context-enhancement.set') {
      if (!validBotPayload(payload, { withConfig: true })) {
        return fail('chat/bad-request', 'bot.context-enhancement.set 需要 channelId、botId 与 config。');
      }
      try {
        const config2 = contextEnhancement.validateContextConfig(payload.config);
        const saved = await settings.write(payload.channelId, payload.botId, {
          contextEnhancement: config2,
        });
        return ok({ contextEnhancement: saved.contextEnhancement });
      } catch (error) {
        return failFrom(error, 'chat/context-enhancement-failed');
      }
    }
    /**
     * 机器人设置页要用的"可选项"：这台机器人用过的目录、当前 Host 可用的 Agent Preset。
     * 渠道页据此渲染下拉，不必各自去查 DSH。
     */
    if (method === 'bot.settings.options') {
      if (!validBotPayload(payload)) {
        return fail('chat/bad-request', 'bot.settings.options 需要 channelId 与 botId。');
      }
      await settings.ready();
      const record = settings.read(payload.channelId, payload.botId);
      // 目录候选来自这台机器人**用过的**工作区（会话绑定表），而不是全机器的目录列表——
      // 少而准，且不会把别的项目的路径泄漏到无关机器人的设置页。
      // 与 IM 卡片上的工作区下拉共用同一个函数，避免两处逻辑漂移。
      const workspacePaths = workspaceCandidates({
        record, sessionStore, channelId: payload.channelId, botId: payload.botId,
      });
      let presets = [];
      if (typeof optionalAgentPresets?.remoteExportList === 'function') {
        try {
          presets = (await optionalAgentPresets.remoteExportList())?.presets ?? [];
        } catch (error) {
          logger.warn?.(`[dsh-chat] 读取 Agent Preset 列表失败：${error?.message ?? error}`);
        }
      }
      /**
       * 模型目录：设置页的「默认模型」栏要用它渲染下拉。
       * 与聊天里那块面板同一个来源（`readModelCatalog`），失败只记 warn —— 读不到时
       * 那一栏退化成"读不到模型目录"，不阻塞设置页其它部分。
       */
      let models = [];
      let hostDefault = null;
      let modelFailures = [];
      try {
        const catalog = await readModelCatalog(sessions, logger);
        models = catalog.options;
        hostDefault = catalog.hostDefault;
        modelFailures = catalog.failures;
      } catch (error) {
        logger.warn?.(`[dsh-chat] 读取模型列表失败：${error?.message ?? error}`);
        modelFailures = [{ id: '', name: '模型目录', message: String(error?.message ?? error) }];
      }
      return ok({
        workspacePaths,
        presets,
        models,
        hostDefault,
        modelFailures,
        current: {
          workspace: record.workspace ?? null,
          agentPreset: record.agentPreset ?? null,
          accessPolicy: record.accessPolicy ?? null,
          model: normalizeBotModel(record.model),
        },
      });
    }
    if (method === 'bot.workspace.set') {
      if (!validBotPayload(payload, { extra: ['workspace'] })) {
        return fail('chat/bad-request', 'bot.workspace.set 需要 channelId、botId 与 workspace。');
      }
      const raw = payload.workspace;
      if (raw !== null && typeof raw !== 'string') {
        return fail('chat/bad-request', 'workspace 只能是绝对路径或 null。');
      }
      if (raw === null || !raw.trim()) {
        const saved = await settings.write(payload.channelId, payload.botId, { workspace: null });
        return ok({ workspace: saved.workspace ?? null });
      }
      // 存绝对路径：相对路径会跟着 dsh 的启动目录变，排查时最难查。
      const target = resolve(raw.trim());
      let info;
      try {
        info = await stat(target);
      } catch (error) {
        return fail('chat/workspace-invalid', `目录不存在或读不到：${target}（${error?.code ?? error?.message}）`);
      }
      if (!info.isDirectory()) return fail('chat/workspace-invalid', `不是目录：${target}`);
      const saved = await settings.write(payload.channelId, payload.botId, { workspace: target });
      return ok({ workspace: saved.workspace ?? null });
    }
    if (method === 'bot.agent-preset.set') {
      if (!validBotPayload(payload, { extra: ['agentPreset'] })) {
        return fail('chat/bad-request', 'bot.agent-preset.set 需要 channelId、botId 与 agentPreset。');
      }
      const raw = payload.agentPreset;
      if (raw !== null && typeof raw !== 'string') {
        return fail('chat/bad-request', 'agentPreset 只能是预设 id 或 null。');
      }
      const target = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
      if (target && typeof optionalAgentPresets?.remoteExportList === 'function') {
        // 先跟当前 Host 的预设列表对账：存一个不存在的 id，只会在下次建会话时才炸。
        let known = [];
        try {
          known = ((await optionalAgentPresets.remoteExportList())?.presets ?? []).map((row) => row.id);
        } catch (error) {
          return fail('chat/preset-unavailable', `读不到 Agent Preset 列表：${error?.message ?? error}`);
        }
        if (!known.includes(target)) {
          return fail('chat/unknown-preset', `当前 Host 没有这个 Agent Preset：${target}`);
        }
      }
      const saved = await settings.write(payload.channelId, payload.botId, { agentPreset: target });
      return ok({ agentPreset: saved.agentPreset ?? null });
    }
    if (method === 'bot.model.set') {
      if (!validBotPayload(payload, { extra: ['model'] })) {
        return fail('chat/bad-request', 'bot.model.set 需要 channelId、botId 与 model。');
      }
      const raw = payload.model;
      if (raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
        return fail('chat/bad-request', 'model 只能是 { provider, model, reasoningEffort? } 或 null。');
      }
      const target = raw === null ? null : normalizeBotModel(raw);
      if (raw !== null && !target) {
        return fail('chat/bad-request', 'model 需要非空的 provider 与 model。');
      }
      if (target) {
        /**
         * 先跟当前 Host 的模型目录对账（与 Agent Preset 同一条口径）。
         *
         * 读不到目录时**放行**：这条路的入口是设置页的下拉，值本来就来自目录；
         * 而"读不到"不该把用户已经选好的东西判成非法（聊天里那条路是另一套语义）。
         */
        try {
          const { options } = await readModelCatalog(sessions, logger);
          if (options.length > 0) {
            const found = options.find((item) => item.provider === target.provider && item.model === target.model);
            if (!found) {
              return fail('chat/unknown-model', `当前 Host 没有这个模型：${target.provider}/${target.model}`);
            }
            if (target.reasoningEffort && !found.efforts.some((effort) => effort.id === target.reasoningEffort)) {
              return fail('chat/unknown-effort',
                `模型 ${found.value} 不支持推理等级 ${target.reasoningEffort}。`);
            }
          }
        } catch (error) {
          logger.warn?.(`[dsh-chat] 校验机器人默认模型时读不到模型目录，按原值保存：${error?.message ?? error}`);
        }
      }
      const saved = await settings.write(payload.channelId, payload.botId, { model: target });
      return ok({ model: normalizeBotModel(saved.model) });
    }
    if (method === 'bot.access-policy.set') {
      if (!validBotPayload(payload, { extra: ['policy'] })) {
        return fail('chat/bad-request', 'bot.access-policy.set 需要 channelId、botId 与 policy。');
      }
      try {
        // 用与 host 拦消息时**同一份**校验，避免"设置页存得进、运行时判非法"。
        const policy = payload.policy === null ? null : accessPolicy.validateAccessPolicy(payload.policy);
        const saved = await settings.write(payload.channelId, payload.botId, { accessPolicy: policy });
        return ok({ accessPolicy: saved.accessPolicy ?? null });
      } catch (error) {
        return failFrom(error, 'chat/access-policy-failed');
      }
    }
    /**
     * 把某个会话类型放宽到「任何人可用」（只改那一份，另一份与名单照旧）。
     *
     * 用途只有一个：「新建机器人接入」刚加进来的机器人**还没有属主**（属主要从"聊过的会话"
     * 里选，而新机器人一个人都没聊过），默认的 allowlist + 空名单 = 谁都进不来，属主自己
     * 也没法跟它说上第一句话。于是接入流程把私聊放宽，让属主先聊一句、再把自己设为属主。
     *
     * 策略的形状与默认值都在 hub（`defaultAccessPolicy`），所以这一步也必须由 hub 做：
     * 渠道包不许 import hub 的模块，让渠道去拼一个完整 policy 等于把形状知识复制出去。
     */
    if (method === 'bot.access-policy.open-scope') {
      if (!validBotPayload(payload, { extra: ['conversationType'] })) {
        return fail('chat/bad-request',
          'bot.access-policy.open-scope 需要 channelId、botId 与 conversationType。');
      }
      if (!accessPolicy.ACCESS_CONVERSATION_TYPES.includes(payload.conversationType)) {
        return fail('chat/bad-request',
          `conversationType 只能是 ${accessPolicy.ACCESS_CONVERSATION_TYPES.join(' / ')}。`);
      }
      try {
        await settings.ready();
        const current = settings.read(payload.channelId, payload.botId)?.accessPolicy ?? null;
        const base = current ?? accessPolicy.defaultAccessPolicy();
        const next = {
          ...base,
          [payload.conversationType]: { ...base[payload.conversationType], mode: 'open' },
        };
        const saved = await settings.write(payload.channelId, payload.botId, {
          accessPolicy: accessPolicy.validateAccessPolicy(next),
        });
        return ok({ accessPolicy: saved.accessPolicy ?? null });
      } catch (error) {
        return failFrom(error, 'chat/access-policy-failed');
      }
    }
    /**
     * 该机器人聊过的会话（带人能认出的名字），给"指定用户/指定群"这类选择器用。
     *
     * 复用投递那套：hub 的持久会话绑定表 + 渠道的发现与 `decorateTargets`，
     * 因此名字与投递列表一致，也不必让渠道页各自去查平台。
     */
    if (method === 'bot.conversations') {
      if (!validBotPayload(payload)) {
        return fail('chat/bad-request', 'bot.conversations 需要 channelId 与 botId。');
      }
      try {
        const listed = await delivery.list({ channelId: payload.channelId, botId: payload.botId });
        return ok({
          conversations: listed.targets.map((target) => ({
            id: target.id,
            name: target.name ?? target.id,
            kind: target.kind,
            route: target.route,
            saved: target.discovered !== true,
          })),
        });
      } catch (error) {
        return failFrom(error, 'chat/conversations-failed');
      }
    }
    if (method === 'maintenance.import-legacy') {
      const valid = payload !== null && typeof payload === 'object' && !Array.isArray(payload)
        && Object.keys(payload).length === 2
        && typeof payload.channelId === 'string' && CHANNEL_ID.test(payload.channelId)
        && typeof payload.force === 'boolean';
      if (!valid) {
        return fail('chat/bad-request', 'maintenance.import-legacy 需要 { channelId, force }。');
      }
      const dir = legacyDirs.get(payload.channelId);
      if (!dir) return fail('chat/no-legacy', `渠道 ${payload.channelId} 没有声明旧数据目录。`);
      try {
        return ok(await settings.importLegacy(payload.channelId, dir, { force: payload.force }));
      } catch (error) {
        return failFrom(error, 'chat/import-failed');
      }
    }
    if (method === 'delivery.list') {
      if (!validBotPayload(payload)) return fail('chat/bad-request', 'delivery.list 需要 channelId 与 botId。');
      return ok(await delivery.list({ channelId: payload.channelId, botId: payload.botId }));
    }
    if (method === 'delivery.save') {
      if (!isPlainRecord(payload) || typeof payload.channelId !== 'string'
        || typeof payload.botId !== 'string' || !isPlainRecord(payload.target)) {
        return fail('chat/bad-request', 'delivery.save 需要 { channelId, botId, target }。');
      }
      try {
        const saved = await delivery.save({
          channelId: payload.channelId, botId: payload.botId, target: payload.target,
        });
        return ok({ target: saved });
      } catch (error) {
        return failFrom(error, 'chat/delivery-save-failed');
      }
    }
    if (method === 'delivery.target.rename') {
      if (!validBotPayload(payload, { extra: ['targetId', 'name'] }) || typeof payload.targetId !== 'string'
        || typeof payload.name !== 'string') {
        return fail('chat/bad-request', 'delivery.target.rename 需要 { channelId, botId, targetId, name }。');
      }
      try {
        const renamed = await delivery.rename({
          channelId: payload.channelId, botId: payload.botId,
          targetId: payload.targetId, name: payload.name,
        });
        return ok({ target: renamed });
      } catch (error) {
        return failFrom(error, 'chat/delivery-rename-failed');
      }
    }
    if (method === 'delivery.remove') {
      if (!validBotPayload(payload, { extra: ['targetId'] }) || typeof payload.targetId !== 'string') {
        return fail('chat/bad-request', 'delivery.remove 需要 { channelId, botId, targetId }。');
      }
      return ok({ removed: await delivery.remove({
        channelId: payload.channelId, botId: payload.botId, targetId: payload.targetId,
      }) });
    }
    if (method === 'delivery.sendFile') {
      if (!validBotPayload(payload, { extra: ['targetId', 'path', 'name'], optional: ['name'] })
        || typeof payload.targetId !== 'string'
        || typeof payload.path !== 'string'
        || (payload.name !== undefined && typeof payload.name !== 'string')) {
        return fail('chat/bad-request', 'delivery.sendFile 需要 { channelId, botId, targetId, path, name? }。');
      }
      try {
        return ok(await delivery.sendFile({
          channelId: payload.channelId,
          botId: payload.botId,
          targetId: payload.targetId,
          path: payload.path,
          name: payload.name,
        }));
      } catch (error) {
        return failFrom(error, 'chat/delivery-failed');
      }
    }
    if (method === 'delivery.send') {
      if (!validBotPayload(payload, { extra: ['targetId', 'text'] })
        || typeof payload.targetId !== 'string'
        || typeof payload.text !== 'string') {
        return fail('chat/bad-request', 'delivery.send 需要 { channelId, botId, targetId, text }。');
      }
      try {
        return ok(await delivery.send({
          channelId: payload.channelId,
          botId: payload.botId,
          targetId: payload.targetId,
          text: payload.text,
        }));
      } catch (error) {
        return failFrom(error, 'chat/delivery-failed');
      }
    }
    return fail('chat/unknown-method', `控制端点不支持 ${method}。`);
  }

  void settings.ready().catch((error) => {
    logger.warn?.(`[dsh-chat] 初始化每机器人设置失败：${error?.message ?? error}`);
  });
  void sessionStore.ready().catch((error) => {
    logger.warn?.(`[dsh-chat] 初始化会话绑定表失败：${error?.message ?? error}`);
  });

  const service = Object.freeze({
    contractVersion: CONTRACT_VERSION,

    /**
     * 渠道包注册自己的实现。
     *
     * @param definition - { id, label, order, createChannel, legacy? }。
     * @returns 同步注销函数。
     */
    registerChannel: (definition) => registry.register(definition),

    /** 渠道注册表：只读视图 + 进程内分派（诊断/CLI 用，省掉走浏览器 RPC）。 */
    channels: Object.freeze({
      list: () => registry.list(),
      subscribe: (listener) => registry.subscribe(listener),
      call: (channelId, method, payload, signal) => registry.handleRpc(
        channelId, method, payload, signal,
      ),
    }),

    /** 每机器人设置的磁盘文档就绪信号；渠道读取设置前应 await 它。 */
    ready: () => settings.ready(),

    bots: Object.freeze({
      read: (channelId, botId) => settings.read(channelId, botId),
      write: (channelId, botId, patch) => settings.write(channelId, botId, patch),
      list: (channelId) => settings.list(channelId),
      subscribe: (listener) => settings.subscribe(listener),
      storageFor,
    }),

    /** 机器人命令：渠道把入站文本交进来，拿回要回复的文本。 */
    commands: Object.freeze({
      handle: (options) => commands.handle(options),
      list: () => commands.list(),
    }),

    /** 主动投递：定时任务/脚本用 `send` 把结果推到指定会话。 */
    delivery: Object.freeze({
      send: (options) => delivery.send(options),
      sendFile: (options) => delivery.sendFile(options),
      list: (options) => delivery.list(options),
      save: (options) => delivery.save(options),
      remove: (options) => delivery.remove(options),
      supports: (channelId) => delivery.supports(channelId),
      supportsFile: (channelId) => delivery.supportsFile(channelId),
    }),

    contextEnhancement: contextEnhancementService,
    /** 延迟交付：渠道注册发送器；`list()` 供诊断查看待交付记录。 */
    deferred: Object.freeze({
      register: (options) => deferred.register(options),
      list: () => deferred.list(),
    }),
    /** 引用回复的拼装函数（服务面同样暴露一份，渠道按需取用）。 */
    replyReference: Object.freeze({ enhanceReplyReference: enhanceReplyReferenceFn }),
    /** 合并转发的展开函数（服务面同样暴露一份，渠道按需取用）。 */
    forwardedMessages: Object.freeze({
      enhanceForwardedMessages: enhanceForwardedMessagesFn,
      forwardedMessagesText: forwardedMessagesTextFn,
    }),
    guidance: Object.freeze({
      publish: (sessionId, text) => guidanceForBridge.publish(sessionId, text),
      forget: (sessionId) => guidanceForBridge.forget(sessionId),
    }),
    sessions,
    /**
     * 控制面板（服务面同样暴露一份）：渠道的可交互卡片用它读"当前值 + 可选项"、
     * 并应用用户的选择。`read({channelId,botId,key})` / `apply({channelId,botId,key,field,value})`。
     */
    panel,
  });

  ctx.effect(() => {
    const disposeProvide = provideService(ctx, HOST_SERVICE, service);
    return () => {
      registry.disposeAll();
      rpc.disposeAll();
      if (typeof disposeProvide === 'function') disposeProvide();
    };
  }, 'dsh-chat: host service');

  ctx.effect(() => rpc.register(CONTROL_CHANNEL_ID, controlHandler), 'dsh-chat: control rpc');

  // 模型可调用工具：让 agent 会话自己把结果发到 IM。`tools` 是可选服务（没有 agent
  // 的部署可能没有它），因此按"依赖出现即注册、消失即注销"的方式挂载；若上下文根本
  // 不支持 inject，要留下可见的日志，不能让能力悄悄缺席。
  if (typeof ctx.inject === 'function') {
    ctx.inject(['tools'], (toolCtx) => {
      toolCtx.effect(
        () => registerChatTools(toolCtx, {
          delivery,
          // agent 需要先"发现"渠道与机器人，才能拿到投递目标，因此把只读视图一并给它。
          channels: { list: () => registry.list() },
          bots: { list: (channelId) => settings.list(channelId) },
          logger,
        }),
        'dsh-chat: agent tools',
      );
    });
  } else {
    logger.warn?.('[dsh-chat] 当前上下文不支持 ctx.inject，'
      + 'chat_targets/chat_send/chat_save_target 未注册（agent 无法主动发消息）。');
  }

  // 审批与提问是 agent 作用域的 waterfall 事件，hub 在 root 上参与并把它们交给
  // 对应渠道（按会话绑定定位）；不属于本插件的会话一律 next() 让给浏览器 UI。
  ctx.effect(() => sessions.installInteractionRelays(), 'dsh-chat: 审批与提问回传');

  logger.info?.(`[dsh-chat] hub 已就绪（契约 v${CONTRACT_VERSION}），等待渠道插件注册。`);
}
