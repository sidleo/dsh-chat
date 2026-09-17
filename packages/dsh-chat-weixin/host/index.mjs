/**
 * dsh-chat-weixin（host 侧）：把微信渠道注册进 hub。
 *
 * 本包**不 import hub 包**，只依赖运行期契约（见仓库 CONTRACT.md）。
 * P0 只有骨架；iLink 协议客户端与桥接见 P3。
 *
 * @module dsh-chat-weixin/host
 */

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
    order: 10,
    legacy: { dir: 'dsh-weixin' },
    async createChannel(deps) {
      deps.logger.info?.('[dsh-chat-weixin] 渠道已注册（P0 骨架，协议实现在 P3）');
      return {
        async start() {},
        async stop() {},
        endpoints: {
          'connection.status': async () => ({
            ok: true,
            value: {
              channel: CHANNEL_ID,
              phase: 'skeleton',
              contractVersion: EXPECTED_CONTRACT,
              dataDir: deps.dataDir,
              accounts: [],
              note: '微信 iLink 协议实现将在 P3 提供。',
            },
          }),
        },
      };
    },
  }), 'dsh-chat-weixin: 注册渠道');
}
