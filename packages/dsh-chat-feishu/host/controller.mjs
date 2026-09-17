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
 *   `internals` 可注入 sdk / createGateway（测试用）。
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

  async function startBot(bot) {
    const existing = runtimes.get(bot.id);
    if (existing?.phase === 'running' || existing?.phase === 'starting') return existing;

    const record = {
      bot,
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
      const bridge = createFeishuBridge({ bot, deps, gateway, state, logger });
      record.gateway = gateway;
      record.bridge = bridge;
      await gateway.connect({
        onMessage: (event) => bridge.accept(event),
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
      id: bot.id,
      name: bot.botName ?? null,
      appIdMasked: maskAppId(bot.appId),
      domain: bot.domain,
      state: record.phase,
      error: record.error ?? null,
      errorMessage: record.errorMessage ?? null,
      connected: record.gateway?.isConnected?.() === true,
      ownerCount: bot.ownerOpenIds.length,
      groupResponseMode: bot.groupResponseMode,
      groupTopicReply: bot.groupTopicReply,
      stepPush: Object.freeze({ direct: bot.stepPushDirect, group: bot.stepPushGroup }),
      handled: bridgeStatus.handled,
      lastHandledAt: bridgeStatus.lastHandledAt ?? null,
      // 处理消息的失败必须能被设置页看到：终端日志之外，这是唯一的现场。
      lastError: bridgeStatus.lastError ?? null,
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
  function patchRuntime(botId, patch) {
    const record = runtimes.get(botId);
    if (record) record.bot = Object.freeze({ ...record.bot, ...patch });
  }

  async function startAll() {
    await configStore.load();
    const bots = configStore.list();
    logger.info?.(`[dsh-chat-feishu] 发现 ${bots.length} 个已配置机器人`);
    await Promise.all(bots.map((bot) => startBot(bot)));
  }

  /** 会话键 → 可投递目标（`p2p:ou_x` / `group:oc_y`）。 */
  function targetsFromState(state) {
    const ids = (value) => value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
    const targets = [];
    for (const key of Object.keys(state?.sessions?.() ?? {})) {
      const [kind, id] = key.split(':', 2);
      if (!id) continue;
      if (kind === 'p2p') {
        targets.push({
          id: ids(key),
          name: `私聊 · ${maskAppId(id)}`,
          kind: 'direct',
          route: { openId: id },
        });
      } else if (kind === 'group') {
        targets.push({
          id: ids(key),
          name: `群聊 · ${maskAppId(id)}`,
          kind: 'group',
          route: { chatId: id },
        });
      }
    }
    return targets;
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

    /** 从该机器人的会话记录里发现候选目标。 */
    async discover({ botId }) {
      const record = runtimes.get(botId);
      if (!record?.state) return [];
      return targetsFromState(record.state);
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
        const record = await startBot(bot);
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

      /** 任务过程展示：私聊/群聊两份，原子保存并立即生效。 */
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
