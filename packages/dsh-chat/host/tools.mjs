/**
 * 聊天工具（模型可调用）：让 agent 会话自己把结果发到 IM。
 *
 * 为什么放在 hub：投递、目标清单、渠道能力都是 hub 的东西；工具只是它们的
 * 一层模型可见外壳。渠道不需要（也不应该）各自注册一遍。
 *
 * 安全边界（重要）：
 * - `chat_targets` 只读；
 * - `chat_send` **只能发给用户已保存的目标**，不能临时指定任意会话；
 * - `chat_save_target` 只接受渠道自己发现的候选（即该机器人历史上真实对话过的
 *   会话），agent 无法凭空捏造一个投递目标。
 *
 * @module dsh-chat/host/tools
 */

const OUTPUT_TEXT = Object.freeze({
  schema: { type: 'string' },
  render: (_args, value) => [{ type: 'text', text: typeof value === 'string' ? value : String(value) }],
});

const CHANNEL_FIELD = {
  type: 'string',
  description: '渠道 id，例如 feishu（飞书）或 weixin（微信）。省略时先列出已安装的渠道。',
};

const BOT_FIELD = {
  type: 'string',
  description: '机器人/账号 id（在设置页的机器人卡片上可见，例如 bot_1f4c… / wx_0f2d…）。'
    + '省略时列出该渠道下的机器人及其可投递目标。',
};

/** 渲染一行目标。 */
function targetLine(target) {
  const route = Object.entries(target.route).map(([key, value]) => `${key}=${value}`).join(', ');
  return `${target.id}\t${target.kind === 'group' ? '群聊' : '私聊'}\t${target.name || '（未命名）'}\t${route}`
    + `${target.discovered ? '\t候选（需先保存才能发）' : ''}`;
}

function describeTargets(result) {
  if (!result.canSend) return `该渠道不支持主动投递，无法向它发送消息。`;
  if (result.targets.length === 0) {
    return '该机器人还没有可投递的目标：先在设置页里保存一个，或先与它对话过（对话过的会话会被发现为候选）。';
  }
  return [
    `可投递目标（共 ${result.targets.length} 个）：`,
    'id\t类型\t名称\t路由\t状态',
    ...result.targets.map(targetLine),
  ].join('\n');
}

/** 没给 channel_id 时：列出已安装渠道与各自的机器人数，让调用方决定下一步。 */
function describeChannels(entries, botsOf) {
  if (entries.length === 0) return '当前没有安装任何聊天渠道。';
  const lines = entries.map((entry) => {
    const bots = botsOf(entry.id);
    const status = entry.status === 'running'
      ? '运行中'
      : `${entry.status}${entry.error?.code ? `（${entry.error.code}）` : ''}`;
    return `${entry.id}\t${entry.label}\t${status}\t机器人 ${bots.length} 个`;
  });
  return [
    `已安装渠道（共 ${entries.length} 个）：`,
    'id\t名称\t状态\t机器人',
    ...lines,
    '下一步：带上 channel_id 再调一次 chat_targets，即可看到该渠道下的机器人与可投递目标。',
  ].join('\n');
}

/** 没给 bot_id 时：逐个机器人列出可投递目标（机器人数量很少，一次给全）。 */
async function describeBots(channelId, records, delivery) {
  if (records.length === 0) {
    return `${channelId} 下还没有机器人：请先在设置页里添加或登录一个，再来查询可投递目标。`;
  }
  const blocks = [`${channelId} 下的机器人（共 ${records.length} 个）：`];
  for (const record of records) {
    const listed = await delivery.list({ channelId, botId: record.botId });
    blocks.push('', `[${record.botId}]`, describeTargets(listed));
  }
  return blocks.join('\n');
}

/**
 * 注册聊天工具。
 *
 * @param toolCtx - 已注入 `tools` 的 Cordis 上下文。
 * @param options - { delivery, channels, bots, logger }。
 *   `channels.list()` 返回已安装渠道状态；`bots.list(channelId)` 返回该渠道的机器人记录。
 * @returns 注销函数（释放全部工具）。
 */
export function registerChatTools(toolCtx, { delivery, channels, bots, logger = console } = {}) {
  if (typeof toolCtx?.tools?.register !== 'function') {
    throw new TypeError('注册聊天工具需要 Cordis 的 tools 服务。');
  }
  if (!delivery?.send) throw new TypeError('注册聊天工具需要投递服务。');
  const listChannels = () => (typeof channels?.list === 'function' ? channels.list() : []);
  const listBots = (channelId) => (typeof bots?.list === 'function' ? bots.list(channelId) : []);
  const disposers = [];

  disposers.push(toolCtx.tools.register({
    name: 'chat_targets',
    description: '查询某个聊天机器人可以主动投递的会话（已保存的目标 + 从历史会话发现的候选）。'
      + '省略 channel_id 先列出已安装渠道；省略 bot_id 列出该渠道的机器人与目标。'
      + '需要把结果发到飞书/微信时，先用它确认目标 id。',
    parameters: {
      type: 'object',
      properties: { channel_id: CHANNEL_FIELD, bot_id: BOT_FIELD },
      additionalProperties: false,
    },
    output: OUTPUT_TEXT,
    async execute(args) {
      const channelId = typeof args.channel_id === 'string' && args.channel_id.trim()
        ? args.channel_id.trim() : null;
      const botId = typeof args.bot_id === 'string' && args.bot_id.trim() ? args.bot_id.trim() : null;
      if (!channelId) return describeChannels(listChannels(), listBots);
      if (!listChannels().some((entry) => entry.id === channelId)) {
        return `没有安装名为 ${channelId} 的渠道。已安装：`
          + `${listChannels().map((entry) => entry.id).join('、') || '（无）'}。`;
      }
      if (!botId) return describeBots(channelId, listBots(channelId), delivery);
      return describeTargets(await delivery.list({ channelId, botId }));
    },
  }));

  disposers.push(toolCtx.tools.register({
    name: 'chat_send',
    description: '把一段文本主动发送到指定聊天机器人的指定会话（目标必须已在设置里保存）。'
      + '适合把报表、任务结果推给用户。返回发送结果；失败会说明原因。',
    parameters: {
      type: 'object',
      properties: {
        channel_id: CHANNEL_FIELD,
        bot_id: BOT_FIELD,
        target_id: {
          type: 'string',
          description: 'chat_targets 列出的目标 id（只能是已保存的目标，不能是候选）。',
        },
        text: { type: 'string', description: '要发送的正文（纯文本）。' },
      },
      required: ['channel_id', 'bot_id', 'target_id', 'text'],
      additionalProperties: false,
    },
    output: OUTPUT_TEXT,
    async execute(args) {
      try {
        const result = await delivery.send({
          channelId: args.channel_id,
          botId: args.bot_id,
          targetId: args.target_id,
          text: args.text,
        });
        const messageId = result?.messageId ?? result?.providerMessageIds?.[0] ?? null;
        return `已发送到 ${args.target_id}${messageId ? `（消息 id ${messageId}）` : ''}。`;
      } catch (error) {
        // 工具报错要能指导下一步动作，而不是只抛一个码。
        if (error?.code === 'chat/unknown-target') {
          return `目标 ${args.target_id} 还没有保存，无法发送。`
            + '先用 chat_targets 查看候选，再用 chat_save_target 保存，或请用户到设置页保存。';
        }
        return `发送失败：${error?.code ?? ''} ${error?.message ?? String(error)}`.trim();
      }
    },
  }));

  disposers.push(toolCtx.tools.register({
    name: 'chat_save_target',
    description: '把一个"候选"会话保存为可投递目标（只能保存 chat_targets 里标记为候选的目标，'
      + '即该机器人历史上真实对话过的会话）。保存后即可用 chat_send 发送。',
    parameters: {
      type: 'object',
      properties: {
        channel_id: CHANNEL_FIELD,
        bot_id: BOT_FIELD,
        target_id: { type: 'string', description: 'chat_targets 里标记为候选的目标 id。' },
        name: { type: 'string', description: '给这个目标起的名字（可选）。' },
      },
      required: ['channel_id', 'bot_id', 'target_id'],
      additionalProperties: false,
    },
    output: OUTPUT_TEXT,
    async execute(args) {
      const listed = await delivery.list({ channelId: args.channel_id, botId: args.bot_id });
      const candidate = listed.targets.find((t) => t.id === args.target_id);
      if (!candidate) {
        return `没有找到候选 ${args.target_id}（已保存的目标无需重复保存）。`;
      }
      if (!candidate.discovered) {
        return `目标 ${args.target_id} 已经保存过了。`;
      }
      const saved = await delivery.save({
        channelId: args.channel_id,
        botId: args.bot_id,
        target: {
          id: candidate.id,
          name: args.name ?? candidate.name,
          kind: candidate.kind,
          route: candidate.route,
        },
      });
      logger.info?.(`[dsh-chat] agent 保存了投递目标 ${saved.id}（${args.channel_id}/${args.bot_id}）`);
      return `已保存目标 ${saved.id}（${saved.kind === 'group' ? '群聊' : '私聊'} · ${saved.name || '未命名'}），现在可以用 chat_send 发送。`;
    },
  }));

  return () => {
    for (const dispose of disposers.reverse()) {
      try {
        dispose?.();
      } catch (error) {
        logger.warn?.(`[dsh-chat] 注销聊天工具失败：${error?.message ?? error}`);
      }
    }
  };
}
