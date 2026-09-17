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

import { resolve } from 'node:path';

import {
  CONTRACT_VERSION, CONTROL_CHANNEL_ID, HOST_SERVICE, HUB_VERSION,
} from '../shared/contract.mjs';
import * as accessPolicy from '../shared/access-policy.mjs';
import * as contextEnhancement from '../shared/context-enhancement.mjs';
import { createBotSettingsStore } from './bot-settings.mjs';
import { createChannelRegistry } from './channel-registry.mjs';
import { createCommandRegistry, registerBuiltinCommands } from './commands.mjs';
import { createDeliveryService } from './delivery.mjs';
import { createGuidanceRegistry } from './guidance.mjs';
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
  if (Object.keys(payload).length !== allowed.length) return false;
  if (!allowed.every((key) => Object.hasOwn(payload, key))) return false;
  if (typeof payload.channelId !== 'string' || !CHANNEL_ID.test(payload.channelId)) return false;
  if (typeof payload.botId !== 'string' || !BOT_ID.test(payload.botId)) return false;
  if (!options.withConfig) return true;
  return payload.config !== null && typeof payload.config === 'object' && !Array.isArray(payload.config);
}

/**
 * Cordis host 插件入口。
 *
 * @param ctx - host 上下文。
 * @param config - 插件配置：{ dataDir, integrationRoot }。
 */
export function apply(ctx, config = {}) {
  const logger = resolveLogger(ctx, 'dsh-chat');
  const integrations = integrationRoot(config.integrationRoot);
  const settings = createBotSettingsStore({ dataDir: hubDataDir(config.dataDir), logger });
  /** 已注册渠道的旧数据目录，供 `maintenance.import-legacy` 重跑导入。 */
  const legacyDirs = new Map();
  const guidance = createGuidanceRegistry();
  const sessionStore = createSessionStore({ dataDir: hubDataDir(config.dataDir), logger });
  /** 人在环交互：agent 的提问/审批送到 IM 里问，答案从 IM 收回来。 */
  const interactions = createInteractionService({ logger });
  const sessions = createSessionBridge({
    ctx, logger, store: sessionStore, guidance, interactions,
  });
  const rpc = createRpcCarrier(ctx, { logger });
  /** 主动投递：hub 持有目标清单与调度，渠道提供"怎么发"与"能发给谁"。 */
  const delivery = createDeliveryService({ settings, logger });

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
      logger: resolveLogger(ctx, `dsh-chat:${channelId}`),
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
      contextEnhancement,
      /** 访问策略：渠道用它判定放行与命令权限（属主绕过由渠道传入 isOwner）。 */
      accessPolicy: Object.freeze({ ...accessPolicy }),
      /** 机器人命令：渠道把入站文本交进来即可，命令实现只在 hub 一份。 */
      commands: Object.freeze({
        handle: (options) => commands.handle(options),
        list: () => commands.list(),
      }),
      guidance,
      sessions,
      /** 渠道接入 IM 回传（提问/审批）：attach({ channelId, botId, send })。 */
      interactions: Object.freeze({
        attach: (options) => interactions.attach(options),
        offer: (options) => interactions.offer(options),
        has: (channelId) => interactions.has(channelId),
      }),
    }),
  });

  // 命令内核：命令操作的都是渠道无关的东西，因此 hub 实现一次、所有渠道复用。
  // agentPresets 是可选服务（某些部署可能没装），用 ctx.get 取、缺失时命令给出提示。
  const optionalAgentPresets = typeof ctx.get === 'function' ? ctx.get('agentPresets') : undefined;
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
    },
  });
  registerBuiltinCommands(commands, { hubVersion: HUB_VERSION });

  /**
   * hub 控制端点：渠道无关、所有渠道共用，因此渠道包不必重复实现。
   *
   * @param method - 方法名。
   * @param payload - 载荷。
   * @returns RPC 结果。
   */
  async function controlHandler(method, payload) {
    if (method === 'channel.list') {
      if (payload !== null && (typeof payload !== 'object' || Array.isArray(payload)
        || Object.keys(payload).length > 0)) {
        return fail('chat/bad-request', 'channel.list 不接受参数。');
      }
      return ok({ contractVersion: CONTRACT_VERSION, channels: registry.list() });
    }
    if (method === 'bot.settings.get') {
      if (!validBotPayload(payload)) return fail('chat/bad-request', 'bot.settings.get 需要 channelId 与 botId。');
      await settings.ready();
      return ok({ settings: settings.read(payload.channelId, payload.botId) });
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
    if (method === 'delivery.remove') {
      if (!validBotPayload(payload, { extra: ['targetId'] }) || typeof payload.targetId !== 'string') {
        return fail('chat/bad-request', 'delivery.remove 需要 { channelId, botId, targetId }。');
      }
      return ok({ removed: await delivery.remove({
        channelId: payload.channelId, botId: payload.botId, targetId: payload.targetId,
      }) });
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
      list: (options) => delivery.list(options),
      save: (options) => delivery.save(options),
      remove: (options) => delivery.remove(options),
      supports: (channelId) => delivery.supports(channelId),
    }),

    contextEnhancement: Object.freeze({ ...contextEnhancement }),
    guidance: Object.freeze({
      publish: (sessionId, text) => guidance.publish(sessionId, text),
      forget: (sessionId) => guidance.forget(sessionId),
    }),
    sessions,
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
