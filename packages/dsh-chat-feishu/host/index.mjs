/**
 * dsh-chat-feishu（host 侧）：把飞书渠道注册进 hub。
 *
 * 本包**不 import hub 包**，只依赖运行期契约（见仓库 CONTRACT.md）。
 *
 * @module dsh-chat-feishu/host
 */

import { createFeishuController } from './controller.mjs';

/** 渠道包版本：设置页的「版本与更新」面板用它，`npm run check` 会与 package.json 对账。 */
const CHANNEL_VERSION = '0.0.1';

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
