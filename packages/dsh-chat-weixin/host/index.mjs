/**
 * dsh-chat-weixin（host 侧）：把微信渠道注册进 hub。
 *
 * 本包**不 import hub 包**，只依赖运行期契约（见仓库 CONTRACT.md）。
 *
 * @module dsh-chat-weixin/host
 */

import { createWeixinController } from './controller.mjs';

/** 渠道包版本：设置页的「版本与更新」面板用它，`npm run check` 会与 package.json 对账。 */
const CHANNEL_VERSION = '0.0.1';

export const name = 'dsh-chat-weixin-host';

export const inject = ['dshChat'];

const EXPECTED_CONTRACT = 1;

const CHANNEL_ID = 'weixin';

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
      `dsh-chat-weixin 需要 dsh-chat 契约 v${EXPECTED_CONTRACT}，当前 hub 提供 v${String(actual)}；`
      + '请升级 dsh-chat 或安装匹配版本的渠道插件（见 CONTRACT.md）。',
    );
  }

  ctx.effect(() => service.registerChannel({
    id: CHANNEL_ID,
    label: '微信',
    version: CHANNEL_VERSION,
    order: 10,
    legacy: { dir: 'dsh-weixin' },
    async createChannel(deps) {
      const controller = createWeixinController({ deps, logger: deps.logger });
      void controller.start().catch((error) => {
        deps.reportStatus('failed', error);
        deps.logger.error?.(`[dsh-chat-weixin] 启动失败：${error?.message ?? error}`);
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
  }), 'dsh-chat-weixin: 注册渠道');
}
