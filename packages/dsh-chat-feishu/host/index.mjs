/**
 * dsh-chat-feishu（host 侧）：把飞书渠道注册进 hub。
 *
 * 本包**不 import hub 包**，只依赖运行期契约（见仓库 CONTRACT.md）。
 *
 * 除了注册渠道，这里还接三个 DSH 层的能力，**只针对本渠道的聊天会话**：
 * ① `tools/pre-execute` 门禁：会话里模型自己跑的 lark-cli 必须绑定本机器人的 profile、
 *    并按身份策略显式写 `--as`（否则"只用应用身份"那个开关对模型毫无约束力）；
 * ② `shellEnv` 事实：把本机器人的 profile 名与身份策略暴露成 `DSH_CHAT_LARK_*`；
 * ③ 系统提示词段：让模型一上手就带对参数（门禁是兜底，不是主要交互）。
 *
 * @module dsh-chat-feishu/host
 */

import { createFeishuController } from './controller.mjs';

/** 渠道包版本：设置页的「版本与更新」面板用它，`npm run check` 会与 package.json 对账。 */
const CHANNEL_VERSION = '0.0.5';

export const name = 'dsh-chat-feishu-host';

/** 只依赖 hub 服务；hub 未就绪时 Cordis 会自动挂起等待。 */
export const inject = ['dshChat'];

/** 本渠道编译期声明的契约版本，激活时与 hub 对账。 */
const EXPECTED_CONTRACT = 1;

const CHANNEL_ID = 'feishu';

/**
 * Cordis host 插件入口。
 *
 * @param ctx - host 上下文。
 */
export function apply(ctx) {
  const service = ctx.dshChat;
  const actual = service?.contractVersion;
  if (actual !== EXPECTED_CONTRACT) {
    throw new Error(
      `dsh-chat-feishu 需要 dsh-chat 契约 v${EXPECTED_CONTRACT}，当前 hub 提供 v${String(actual)}；`
      + '请升级 dsh-chat 或安装匹配版本的渠道插件（见 CONTRACT.md）。',
    );
  }

  /**
   * 渠道实例起来后才有的两个查询：会话归属与门禁。
   * 事件监听在 apply 时就注册好（渠道还没起来时直接放行），避免"插件加载顺序"决定有没有门禁。
   */
  let chatOwnership = null;
  let larkGuard = null;
  /** 提示词段的补装入口（真正的安装在本函数末尾；先声明再注册监听，避免顺序上的坑）。 */
  let ensureIdentitySection = () => false;

  ctx.on('tools/pre-execute', async (exec, next) => {
    // 提示词段要是当初没装上（systemPrompt 服务晚到），这里顺手补一次。
    ensureIdentitySection?.();
    if (!larkGuard) return next();
    let decision = null;
    try {
      decision = await larkGuard.evaluate(exec);
    } catch (error) {
      // 门禁自己出错时**放行**并记日志：它是行为绊线，不是安全沙箱；
      // 但绝不静默——出错这件事必须留下痕迹。
      ctx.logger?.warn?.(`[dsh-chat-feishu] lark-cli 门禁判断失败，已放行：${error?.message ?? error}`);
    }
    if (decision) return decision;
    return next();
  });

  // 会话级环境事实：模型在聊天会话里直接能拿到"该用哪个 profile、什么身份策略"。
  registerShellFacts(ctx, () => chatOwnership);

  ensureIdentitySection = installLarkIdentitySection(ctx, () => chatOwnership);

  ctx.effect(() => service.registerChannel({
    id: CHANNEL_ID,
    label: '飞书',
    version: CHANNEL_VERSION,
    order: 20,
    legacy: { dir: 'dsh-feishu' },
    async createChannel(deps) {
      const controller = createFeishuController({ deps, logger: deps.logger });
      // 启动放到后台：一个机器人连不上不该拖住整个 Host 启动。
      void controller.start().catch((error) => {
        deps.reportStatus('failed', error);
        deps.logger.error?.(`[dsh-chat-feishu] 启动失败：${error?.message ?? error}`);
      });
      chatOwnership = controller.chatOwnership;
      larkGuard = controller.larkGuard;
      return {
        async stop() {
          await controller.stop();
        },
        endpoints: controller.endpoints,
        // hub 用它把"主动投递"接到该渠道上。
        delivery: controller.delivery,
      };
    },
  }), 'dsh-chat-feishu: 注册渠道');
}

/**
 * 注册「本机器人的 lark-cli 身份策略」这段系统提示词。
 *
 * 为什么要有：门禁能把错的挡下来，但每挡一次模型就白跑一步。先说清楚规矩，
 * 模型一上手就写对（`--profile <name> … --as bot`），门禁只当兜底。
 *
 * 没有 `systemPrompt` 服务的部署（或服务晚到）只告警一次，功能不丢——与 hub 的
 * `prompt-context.mjs` 同一条口径：服务晚到会在下次请求前重试装上。
 *
 * @param ctx - host 上下文。
 * @param ownershipOf - 返回 `chatOwnership` 的取值函数（渠道实例起来前为 null）。
 * @returns 无。
 */
export function installLarkIdentitySection(ctx, ownershipOf) {
  let installed = false;
  let warned = false;

  /**
   * 段文本按会话现算：不是聊天会话就返回空串（空段在渲染时被丢掉），
   * 所以这段只在"本渠道的聊天会话"里出现。
   *
   * 必须**同步**：`dsh-system-prompt` 的 `text` 类型就是 `string | ((ctx) => string)`。
   */
  const text = (context) => {
    const agent = context?.agent;
    const sessionId = agent?.id ?? agent?.session?.id;
    const lookup = ownershipOf();
    if (typeof sessionId !== 'string' || !sessionId || typeof lookup !== 'function') return '';
    let owner = null;
    try {
      owner = lookup(sessionId);
    } catch (error) {
      ctx.logger?.warn?.(`[dsh-chat-feishu] 读会话归属失败：${error?.message ?? error}`);
      return '';
    }
    if (!owner) return '';
    const userAllowed = owner.mode === 'user-allowed';
    return [
      `本会话属于飞书机器人「${owner.botName ?? owner.botId}」，它在 lark-cli 里的身份策略是`
        + `${userAllowed ? '「允许用户身份」' : '「只用应用身份」'}。`,
      '在这个会话里运行 lark-cli 的硬规矩（门禁会检查，违反直接拒绝）：',
      `1. 必须带 \`--profile ${owner.profileName}\`——这是这台机器人自己的 profile。`,
      '   不带 profile 时 lark-cli 会用这台机器上"当前生效"的那份授权，可能是别的应用甚至别人的账号。',
      `2. 必须显式写身份：\`--as bot\`（代表这台应用自己）${userAllowed
        ? '；要代表某个人的身份操作时才用 `--as user`。'
        : '；本机器人只允许应用身份，`--as user` 会被拒绝。'}`,
      '3. 不要用 `profile use` / `--use` / `config strict-mode --global` / `auth logout`——',
      '   它们会改这台机器上 lark-cli 的全局状态，影响别人的用法。',
      `profile 名也在环境变量 \`DSH_CHAT_LARK_PROFILE\` 里（身份策略在 \`DSH_CHAT_LARK_IDENTITY\`）。`,
    ].join('\n');
  };

  const tryInstall = () => {
    if (installed) return true;
    const systemPrompt = typeof ctx.get === 'function' ? ctx.get('systemPrompt') : ctx.systemPrompt;
    if (!systemPrompt || typeof systemPrompt.section !== 'function') return false;
    const register = () => systemPrompt.section({
      name: 'dsh-chat-feishu:lark-cli-identity',
      order: 410,
      text,
    });
    try {
      if (typeof ctx.effect === 'function') ctx.effect(register, 'dsh-chat-feishu: lark-cli 身份策略段');
      else register();
      installed = true;
      ctx.logger?.info?.('[dsh-chat-feishu] 已注册 lark-cli 身份策略提示词段（按会话生效）。');
      return true;
    } catch (error) {
      // 同名段已存在 / ctx 已销毁：当作没装上，只告警一次，绝不影响其它功能。
      ctx.logger?.warn?.(`[dsh-chat-feishu] 注册 lark-cli 身份策略提示词段失败：${error?.message ?? error}`);
      return false;
    }
  };

  if (!tryInstall() && !warned) {
    warned = true;
    ctx.logger?.warn?.('[dsh-chat-feishu] 当前 Host 没有可用的 systemPrompt 服务：'
      + 'lark-cli 身份策略只会以门禁方式生效（模型不会被提前告知）——服务晚到会在下一次工具调用前补装。');
  }
  return tryInstall;
}

/**
 * 注册会话级的 `DSH_CHAT_LARK_*` 环境事实（只有本渠道的聊天会话才拿得到）。
 *
 * 为什么要有：模型在会话里要知道"该用哪个 profile、身份策略是什么"，才能一次写对命令。
 * 环境事实与提示词段两条路都给，是因为模型既可能读提示词、也可能直接 `echo $DSH_CHAT_LARK_PROFILE`。
 *
 * 导出是为了让单测能在没有渠道实例的情况下验证取值（不需要真控制器）。
 *
 * @param ctx - host 上下文。
 * @param ownershipOf - 返回 `chatOwnership(sessionId)` 的取值函数。
 * @returns 无。
 */
export function registerShellFacts(ctx, ownershipOf) {
  ctx.inject(['shellEnv'], (shellCtx) => {
    shellCtx.shellEnv.register({
      name: 'dsh-chat-feishu',
      variables: {
        DSH_CHAT_LARK_PROFILE: {
          description: '这台飞书机器人在 lark-cli 里的专用 profile 名；调 lark-cli 时必须用 --profile 指定它。',
        },
        DSH_CHAT_LARK_IDENTITY: {
          description: '这台机器人的 lark-cli 身份策略：bot-only（只允许应用身份）或 user-allowed（允许以该 profile 登录的用户身份）。',
        },
      },
      resolve: (execution) => {
        const sessionId = execution?.agent?.session?.header?.id;
        const lookup = ownershipOf();
        if (!sessionId || typeof lookup !== 'function') return {};
        let owner = null;
        try {
          owner = lookup(sessionId);
        } catch (error) {
          ctx.logger?.warn?.(`[dsh-chat-feishu] 读会话归属失败（会话环境事实）：${error?.message ?? error}`);
          return {};
        }
        if (!owner) return {};
        return {
          DSH_CHAT_LARK_PROFILE: owner.profileName,
          DSH_CHAT_LARK_IDENTITY: owner.mode,
        };
      },
    });
  });
}
