/**
 * 机器人命令内核（hub 所有，渠道共用）。
 *
 * 命令操作的都是渠道无关的东西（会话绑定、模型、推理等级、Agent Preset、
 * 渠道与机器人状态），所以实现一次即可让所有渠道复用；渠道只负责"把文本交进来、
 * 把回复发出去"。
 *
 * @module dsh-chat/host/commands
 */

import * as accessPolicy from '../shared/access-policy.mjs';
import { CONTRACT_VERSION } from '../shared/contract.mjs';

/** 命令名前缀。 */
const PREFIX = '/';

/** 一行的最大长度（列表类输出不至于刷屏）。 */
const MAX_LINE = 120;

function line(text) {
  const value = String(text ?? '').replace(/\s+$/u, '');
  return value.length > MAX_LINE ? `${value.slice(0, MAX_LINE)}…` : value;
}

/** 历史回看里每条消息的字符上限（避免一条命令刷屏）。 */
const MAX_HISTORY_CHARS = 160;

function clip(text) {
  const value = String(text ?? '').replace(/\s+/gu, ' ').trim();
  return value.length > MAX_HISTORY_CHARS ? `${value.slice(0, MAX_HISTORY_CHARS)}…` : value;
}

/** 把 `provider/model` 之外的空格参数拆开，保留引号内的整体。 */
function parseArgs(text) {
  const raw = text.slice(1);
  const match = /^(\S+)\s*(.*)$/su.exec(raw);
  if (!match) return { name: '', args: [] };
  const name = match[1].toLowerCase();
  const rest = match[2].trim();
  if (!rest) return { name, args: [] };
  const args = rest.match(/"[^"]*"|\S+/gu) ?? [];
  return { name, args: args.map((arg) => (arg.startsWith('"') && arg.endsWith('"') ? arg.slice(1, -1) : arg)) };
}

/** 数字序号（1 起）→ 下标。 */
function indexOf(value) {
  if (!/^\d{1,3}$/u.test(value)) return null;
  const index = Number(value) - 1;
  return index >= 0 ? index : null;
}

/**
 * 创建命令注册表。
 *
 * @param options - { logger, services }，services 为 { sessions, bots, channels, agentPresets }。
 * @returns { register, handle, list, names }。
 */
export function createCommandRegistry({ logger = console, services = {} } = {}) {
  /** @type {Map<string, object>} */
  const commands = new Map();
  const aliasIndex = new Map();

  function register(definition) {
    const { name, summary, usage, scope = 'both', execute } = definition;
    if (!/^[a-z][a-z0-9-]{0,31}$/u.test(name ?? '')) {
      throw new TypeError(`命令名不合法：${String(name)}`);
    }
    if (typeof execute !== 'function') throw new TypeError(`命令 ${name} 缺少 execute。`);
    if (commands.has(name)) throw new Error(`命令 ${name} 重复注册。`);
    const record = Object.freeze({
      name,
      summary: String(summary ?? ''),
      usage: usage ?? `/${name}`,
      scope,
      execute,
      aliases: Object.freeze([...(definition.aliases ?? [])]),
    });
    commands.set(name, record);
    for (const alias of record.aliases) aliasIndex.set(alias, name);
    return () => {
      if (commands.get(name) !== record) return;
      commands.delete(name);
      for (const alias of record.aliases) aliasIndex.delete(alias);
    };
  }

  function lookup(name) {
    return commands.get(name) ?? commands.get(aliasIndex.get(name));
  }

  /**
   * 解析并执行一条命令。
   *
   * @param options - {
   *   text, channelId, botId, key, conversationType, senderId,
   *   channelLabel?, botLabel?,
   * }。
   * @returns `{ handled, reply }`；不是命令时 handled=false。
   */
  async function handle(options) {
    const text = typeof options?.text === 'string' ? options.text.trim() : '';
    if (!text.startsWith(PREFIX)) return { handled: false };
    const { name, args } = parseArgs(text);
    const command = lookup(name);
    if (!command) {
      return {
        handled: true,
        reply: `未知命令 ${PREFIX}${name}。发送 ${PREFIX}help 查看可用命令。`,
      };
    }
    if (command.scope !== 'both' && command.scope !== options.conversationType) {
      return { handled: true, reply: `命令 ${PREFIX}${command.name} 不能在当前会话类型下使用。` };
    }
    const context = {
      ...options,
      args,
      rawArgs: args.join(' '),
      services,
      log: logger,
    };
    try {
      const reply = await command.execute(context);
      return { handled: true, reply: reply ?? '' };
    } catch (error) {
      const message = error?.message ?? String(error);
      logger.warn?.(`[dsh-chat] 命令 ${command.name} 执行失败：${message}`);
      return { handled: true, reply: `命令执行失败：${message}` };
    }
  }

  /** @returns 当前可用命令（按名字排序）。 */
  function list() {
    return Object.freeze([...commands.values()].sort((left, right) => left.name.localeCompare(right.name)));
  }

  return { register, handle, list, names: () => [...commands.keys()] };
}

async function boundSession(context) {
  const { services, channelId, botId, key } = context;
  return services.sessions?.bindings?.get?.(channelId, botId, key)?.sessionId ?? null;
}

async function modelCatalog(context) {
  const catalog = await context.services.sessions.invoke('session', 'modelCatalog', {});
  const rows = [];
  for (const group of catalog?.groups ?? []) {
    for (const model of group.models ?? []) {
      rows.push({
        provider: group.provider ?? group.providerId,
        providerName: group.providerName ?? group.displayName ?? group.provider,
        model: model.id ?? model.model,
        name: model.name ?? model.id,
        efforts: model.reasoning?.efforts ?? [],
        defaultEffort: model.reasoning?.defaultEffort ?? null,
      });
    }
  }
  return { catalog, rows };
}

function findModel(rows, token) {
  const byIndex = indexOf(token);
  if (byIndex !== null) return rows[byIndex] ?? null;
  const [provider, model] = String(token).split('/');
  if (!provider || !model) return null;
  return rows.find((row) => row.provider === provider && row.model === model) ?? null;
}

/**
 * 注册内置命令。
 *
 * @param registry - 命令注册表。
 * @param options - { hubVersion }。
 */
export function registerBuiltinCommands(registry, { hubVersion = '0.0.1' } = {}) {
  registry.register({
    name: 'help',
    aliases: ['h'],
    summary: '显示机器人支持的命令与用法',
    execute: () => {
      const rows = registry.list().map((command) => line(`${command.usage} — ${command.summary}`));
      return ['可用命令：', ...rows].join('\n');
    },
  });

  /** 当前会话类型对应的策略作用域键。 */
  const scopeKeyOf = (context) => (context.conversationType === 'group' ? 'group' : 'direct');
  const scopeLabelOf = (context) => (context.conversationType === 'group' ? '群聊' : '私聊');

  /** 读当前策略（没有就按默认：仅名单、命令默认不允许）。 */
  function currentPolicy(context) {
    const record = context.services.bots.read(context.channelId, context.botId);
    return accessPolicy.normalizeAccessPolicy(record.accessPolicy)
      ?? accessPolicy.defaultAccessPolicy();
  }

  /** 改一个作用域的名单；返回**完整**策略（保存路径要求两段都在）。 */
  function withAllowlist(context, mutate) {
    const policy = currentPolicy(context);
    const key = scopeKeyOf(context);
    const scope = policy[key];
    return {
      ...policy,
      [key]: {
        ...scope,
        allowlist: { users: mutate(scope.allowlist.users) },
        open: {
          ...scope.open,
          // 名单变动时同步清掉 open 里的例外，避免"已移除却还能执行命令"。
          commandPermissionOverrides: mutate(scope.open.commandPermissionOverrides),
        },
      },
    };
  }

  registry.register({
    name: 'whoami',
    summary: '查看你的平台标识、是否属主，以及本次消息的访问判定',
    execute: (context) => {
      const decision = accessPolicy.evaluateAccess({
        policy: currentPolicy(context),
        conversationType: context.conversationType,
        senderIds: [context.senderId],
        isOwner: context.isOwner === true,
      });
      return [
        `你的平台 id：${context.senderId ?? '未知'}`,
        `是否属主：${context.isOwner === true ? '是' : '否'}`,
        `当前会话：${scopeLabelOf(context)}`,
        `本次判定：${decision.allowed ? '放行' : '拦截'}（${decision.reason}）`,
        context.isOwner === true
          ? `属主始终可用。用 ${PREFIX}allow 查看/维护${scopeLabelOf(context)}名单。`
          : null,
      ].filter(Boolean).join('\n');
    },
  });

  registry.register({
    name: 'allow',
    summary: '查看或维护当前会话类型的访问名单（仅属主）',
    usage: '/allow [平台id] [--commands]',
    execute: async (context) => {
      if (context.isOwner !== true) return '只有属主能维护访问名单。';
      const scope = scopeKeyOf(context);
      const { policy } = { policy: currentPolicy(context) };
      const id = context.args.find((arg) => !arg.startsWith('--'));
      if (!id) {
        const users = policy[scope].allowlist.users;
        if (users.length === 0) return `${scopeLabelOf(context)}名单是空的（当前只有属主可用）。`;
        return [
          `${scopeLabelOf(context)}名单（${users.length} 人）：`,
          ...users.map((user, index) => line(
            `${index + 1}. ${user.id}${user.canExecuteCommands ? '（可执行命令）' : ''}`,
          )),
          `用 ${PREFIX}allow <平台id> [--commands] 添加，${PREFIX}deny <平台id> 移除。`,
        ].join('\n');
      }
      const withCommands = context.args.includes('--commands');
      const next = withAllowlist(context, (users) => [
        ...users.filter((user) => user.id !== id),
        { id, canExecuteCommands: withCommands },
      ]);
      await context.services.bots.write(context.channelId, context.botId, {
        accessPolicy: accessPolicy.validateAccessPolicy(next),
      });
      return `已把 ${id} 加入${scopeLabelOf(context)}名单${withCommands ? '（允许执行命令）' : ''}。`;
    },
  });

  registry.register({
    name: 'deny',
    summary: '把某人移出当前会话类型的访问名单（仅属主）',
    usage: '/deny <平台id>',
    execute: async (context) => {
      if (context.isOwner !== true) return '只有属主能维护访问名单。';
      const id = context.args[0];
      if (!id) return `用法：${PREFIX}deny <平台id>`;
      const before = currentPolicy(context);
      const next = withAllowlist(context, (users) => users.filter((user) => user.id !== id));
      const key = scopeKeyOf(context);
      const removed = before[key].allowlist.users.some((user) => user.id === id)
        || before[key].open.commandPermissionOverrides.some((user) => user.id === id);
      if (!removed) return `${id} 本来就不在${scopeLabelOf(context)}名单里。`;
      await context.services.bots.write(context.channelId, context.botId, {
        accessPolicy: accessPolicy.validateAccessPolicy(next),
      });
      return `已把 ${id} 移出${scopeLabelOf(context)}名单。`;
    },
  });

  registry.register({
    name: 'version',
    summary: '查看 dsh-chat 插件版本',
    execute: () => `dsh-chat ${hubVersion}（渠道契约 v${CONTRACT_VERSION}）`,
  });

  registry.register({
    name: 'status',
    summary: '查看当前机器人、会话与运行状态',
    execute: async (context) => {
      const { services, channelId, botId, key } = context;
      const channel = services.channels?.list?.().find((item) => item.id === channelId);
      const record = services.bots?.read?.(channelId, botId) ?? {};
      const bound = services.sessions?.bindings?.get?.(channelId, botId, key);
      let running = null;
      if (bound?.sessionId) {
        running = await context.services.sessions.isRunning(bound.sessionId).catch(() => null);
      }
      return [
        `渠道：${channel?.label ?? channelId}（${channel?.status ?? '未知'}）`,
        `机器人：${context.botLabel ?? botId}`,
        `会话：${bound?.sessionId ?? '未绑定（发一条消息即可创建）'}`,
        `运行中：${running === null ? '未知' : running ? '是' : '否'}`,
        `工作区：${record.workspace ?? '未设置'}`,
        `模型：${record.model ? `${record.model.providerId ?? record.model.provider}/${record.model.modelId ?? record.model.model}` : '跟随 Host 默认'}`,
        `Agent Preset：${record.agentPreset ?? '跟随 Host 默认'}`,
      ].join('\n');
    },
  });

  registry.register({
    name: 'new',
    summary: '解除当前聊天的会话绑定，下一条消息开启新会话',
    execute: async (context) => {
      await context.services.sessions.reset({
        channelId: context.channelId, botId: context.botId, key: context.key,
      });
      return '已解除当前会话绑定，下一条消息将开启新会话。';
    },
  });

  registry.register({
    name: 'stop',
    summary: '停止当前聊天正在运行的任务',
    execute: async (context) => {
      const sessionId = await boundSession(context);
      if (!sessionId) return '当前聊天还没有绑定会话。';
      const result = await context.services.sessions.cancel({
        channelId: context.channelId, botId: context.botId, key: context.key,
      });
      return result?.accepted ? '已请求停止当前任务。' : '当前没有正在运行的任务。';
    },
  });

  registry.register({
    name: 'compact',
    summary: '压缩当前会话的上下文（会话太长时用）',
    execute: async (context) => {
      const sessionId = await boundSession(context);
      if (!sessionId) return '当前聊天还没有会话（先发一条消息即可创建）。';
      const result = await context.services.sessions.runCommand({
        channelId: context.channelId,
        botId: context.botId,
        key: context.key,
        line: '/compact',
      });
      if (!result?.matched) {
        return '当前部署没有注册 /compact 命令（需要在 profile 里启用压缩插件）。';
      }
      if (result.kind === 'success') {
        return `✅ 上下文已压缩。${result.text ? `\n${result.text}` : ''}`;
      }
      return `⚠️ 压缩未完成：${result.text || '未知原因'}`;
    },
  });

  registry.register({
    name: 'history',
    summary: '回看最近几轮对话',
    usage: '/history [轮数]',
    execute: async (context) => {
      const requested = indexOf(context.args[0]);
      const turns = requested === null ? 5 : Math.min(requested + 1, 20);
      const { messages } = await context.services.sessions.history({
        channelId: context.channelId,
        botId: context.botId,
        key: context.key,
        // 一轮大致对应"用户 + 助手"两条消息，多取几条保证凑得齐。
        maxMessages: turns * 2 + 2,
      });
      if (messages.length === 0) return '这个会话还没有对话历史。';
      const lines = [];
      let index = 0;
      for (const message of messages) {
        if (message.role === 'user') {
          index += 1;
          lines.push(`${index}. 你：${line(clip(message.text))}`);
        } else {
          lines.push(`   bot：${line(clip(message.text))}`);
        }
      }
      return [`最近 ${index} 轮（最多回看 20 轮）：`, ...lines].join('\n');
    },
  });

  registry.register({
    name: 'session',
    summary: '查看当前会话；带会话 id 时切换绑定',
    usage: '/session [会话id]',
    execute: async (context) => {
      const { services } = context;
      if (context.args.length === 0) {
        const bound = services.sessions.bindings.get(context.channelId, context.botId, context.key);
        if (!bound) return '当前聊天未绑定会话（发一条消息即可创建）。';
        const running = await services.sessions.isRunning(bound.sessionId).catch(() => null);
        return `当前会话：${bound.sessionId}${running ? '（运行中）' : ''}`;
      }
      const target = context.args[0];
      const exists = await services.sessions.sessionExists(target).catch(() => false);
      if (!exists) return `找不到会话 ${target}。`;
      await services.sessions.bindings.bind(context.channelId, context.botId, context.key, {
        sessionId: target,
      });
      return `已切换到会话 ${target}。`;
    },
  });

  registry.register({
    name: 'models',
    summary: '按序号列出当前可用的模型',
    execute: async (context) => {
      const { rows } = await modelCatalog(context);
      if (rows.length === 0) return '当前 Host 没有可用模型。';
      const body = rows.map((row, index) => line(
        `${index + 1}. ${row.provider}/${row.model}${row.name && row.name !== row.model ? `（${row.name}）` : ''}`
        + `${row.efforts.length > 0 ? ` · 推理等级 ${row.efforts.map((effort) => effort.id).join('/')}` : ''}`,
      ));
      return ['可用模型：', ...body, `用 /model <序号或 provider/模型id> [推理等级] 切换。`].join('\n');
    },
  });

  registry.register({
    name: 'model',
    summary: '查看或切换当前会话使用的模型',
    usage: '/model [序号或 provider/模型id] [推理等级]',
    execute: async (context) => {
      const sessionId = await boundSession(context);
      if (context.args.length === 0) {
        if (!sessionId) return '当前聊天还没有会话；先发一条消息，或用 /model 在已有会话里切换。';
        const rows = await context.services.sessions.invoke('session', 'list', { _request: {} }).catch(() => null);
        const item = rows?.items?.find((entry) => entry.sessionId === sessionId);
        const selection = item?.projections?.values?.modelSelection;
        return selection
          ? `当前模型：${selection.provider}/${selection.model}${selection.reasoningEffort ? `（推理等级 ${selection.reasoningEffort}）` : ''}`
          : '当前会话没有显式选择模型（跟随 Host 默认）。';
      }
      if (!sessionId) return '当前聊天还没有会话，无法切换模型；先发一条消息。';
      const { rows } = await modelCatalog(context);
      const target = findModel(rows, context.args[0]);
      if (!target) return `找不到模型 ${context.args[0]}；用 /models 查看可用列表。`;
      const effort = context.args[1];
      if (effort && !target.efforts.some((item) => item.id === effort)) {
        return `模型 ${target.provider}/${target.model} 不支持推理等级 ${effort}。`;
      }
      const selected = await context.services.sessions.invoke('session', 'selectModel', {
        request: {
          sessionId,
          provider: target.provider,
          model: target.model,
          ...(effort ? { reasoningEffort: effort } : {}),
        },
      });
      const value = selected?.selected ?? {};
      return `已切换为 ${value.provider ?? target.provider}/${value.model ?? target.model}`
        + `${value.reasoningEffort ? `（推理等级 ${value.reasoningEffort}）` : ''}。`;
    },
  });

  registry.register({
    name: 'reasonings',
    aliases: ['reasoninglist'],
    summary: '列出当前模型支持的推理等级',
    execute: async (context) => {
      const { rows } = await modelCatalog(context);
      const sessionId = await boundSession(context);
      const current = rows.find((row) => row.efforts.length > 0) ?? rows[0];
      if (!current) return '当前 Host 没有可用模型。';
      const efforts = current.efforts.length > 0 ? current.efforts : [];
      if (efforts.length === 0) return `模型 ${current.provider}/${current.model} 不支持推理等级。`;
      return [
        `模型 ${current.provider}/${current.model} 支持的推理等级：`,
        ...efforts.map((effort, index) => line(`${index + 1}. ${effort.id}${effort.label ? `（${effort.label}）` : ''}`)),
        `默认：${current.defaultEffort ?? '—'}`,
        `用 /reasoning <序号或等级id> 切换，/reasoning --default 恢复默认。`,
        sessionId ? '' : '（当前聊天还没有会话，切换会在有会话后生效。）',
      ].filter(Boolean).join('\n');
    },
  });

  registry.register({
    name: 'reasoning',
    summary: '查看或切换当前模型的推理等级',
    usage: '/reasoning [序号或等级id|--default]',
    execute: async (context) => {
      const sessionId = await boundSession(context);
      if (context.args.length === 0) {
        if (!sessionId) return '当前聊天还没有会话。';
        const list = await context.services.sessions.invoke('session', 'list', { _request: {} }).catch(() => null);
        const item = list?.items?.find((entry) => entry.sessionId === sessionId);
        const selection = item?.projections?.values?.modelSelection;
        if (!selection) return '当前会话没有显式选择模型。';
        return `当前模型 ${selection.provider}/${selection.model}，推理等级 ${selection.reasoningEffort ?? '（默认）'}。`;
      }
      if (!sessionId) return '当前聊天还没有会话，无法切换推理等级；先发一条消息。';
      const list = await context.services.sessions.invoke('session', 'list', { _request: {} }).catch(() => null);
      const item = list?.items?.find((entry) => entry.sessionId === sessionId);
      const selection = item?.projections?.values?.modelSelection;
      if (!selection) return '当前会话没有显式选择模型，无法单独设置推理等级。';
      const { rows } = await modelCatalog(context);
      const current = rows.find((row) => row.provider === selection.provider && row.model === selection.model);
      if (!current) return '当前模型不在可用列表里。';
      if (context.args[0] === '--default') {
        await context.services.sessions.invoke('session', 'selectModel', {
          request: { sessionId, provider: current.provider, model: current.model },
        });
        return `已恢复 ${current.provider}/${current.model} 的默认推理等级${current.defaultEffort ? `（${current.defaultEffort}）` : ''}。`;
      }
      const index = indexOf(context.args[0]);
      const effort = index !== null ? current.efforts[index]?.id : context.args[0];
      if (!effort || !current.efforts.some((item2) => item2.id === effort)) {
        return `找不到推理等级 ${context.args[0]}；用 /reasonings 查看可用列表。`;
      }
      await context.services.sessions.invoke('session', 'selectModel', {
        request: {
          sessionId, provider: current.provider, model: current.model, reasoningEffort: effort,
        },
      });
      return `已切换推理等级为 ${effort}。`;
    },
  });

  registry.register({
    name: 'presets',
    aliases: ['presetlist'],
    summary: '列出当前 Host 可用的 Agent Preset',
    execute: async (context) => {
      const presets = context.services.agentPresets;
      if (!presets?.remoteExportList) return '当前 Host 不支持读取 Agent Preset 列表。';
      const { presets: rows } = await presets.remoteExportList();
      if (!rows || rows.length === 0) return '当前 Host 没有可用 Agent Preset。';
      const record = context.services.bots.read(context.channelId, context.botId);
      return [
        '可用 Agent Preset：',
        ...rows.map((row, index) => line(
          `${index + 1}. ${row.id}${row.isDefault ? '（Host 默认）' : ''}`
          + `${record.agentPreset === row.id ? '（当前机器人）' : ''}`
          + `${row.name && row.name !== row.id ? ` · ${row.name}` : ''}`,
        )),
        '用 /preset <序号或 id> 设置，/preset --default 跟随 Host 默认。',
      ].join('\n');
    },
  });

  registry.register({
    name: 'preset',
    summary: '查看或设置当前机器人的 Agent Preset（对新会话生效）',
    usage: '/preset [序号或 id|--default]',
    execute: async (context) => {
      const { services } = context;
      const record = services.bots.read(context.channelId, context.botId);
      if (context.args.length === 0) {
        return record.agentPreset
          ? `当前机器人 Agent Preset：${record.agentPreset}`
          : '当前机器人跟随 Host 默认 Agent Preset。';
      }
      if (context.args[0] === '--default') {
        await services.bots.write(context.channelId, context.botId, { agentPreset: null });
        return '已清除机器人级 Agent Preset，之后的新会话跟随 Host 默认。';
      }
      if (!services.agentPresets?.remoteExportList) return '当前 Host 不支持设置 Agent Preset。';
      const { presets: rows } = await services.agentPresets.remoteExportList();
      const index = indexOf(context.args[0]);
      const target = index !== null ? rows[index]?.id : context.args[0];
      if (!target || !rows.some((row) => row.id === target)) {
        return `找不到 Agent Preset ${context.args[0]}；用 /presets 查看列表。`;
      }
      await services.bots.write(context.channelId, context.botId, { agentPreset: target });
      return `已设置 Agent Preset 为 ${target}；当前聊天需要先发送 /new，再发一条消息才会用新预设创建会话。`;
    },
  });
}
