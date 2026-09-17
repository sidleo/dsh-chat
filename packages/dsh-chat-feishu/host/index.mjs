/**
 * dsh-chat-feishu（host 侧）：把飞书渠道注册进 hub。
 *
 * 本包**不 import hub 包**，只依赖运行期契约：
 * - 服务名 `dshChat`、契约版本 `dsh-chat.contractVersion`（见仓库 CONTRACT.md）；
 * - `deps` 提供 logger / credentials / dataDir / storage / contextEnhancement /
 *   guidance / sessions，与 `reportStatus`；
 * - 实例的 `endpoints` 表即 `/api/dsh-chat/feishu` 的方法表，返回值用
 *   `{ ok:true, value }` / `{ ok:false, error }`。
 *
 * P0 只有骨架（注册 + 状态端点）；凭据、配置、长连接、桥接见 P2。
 *
 * @module dsh-chat-feishu/host
 */

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
    order: 20,
    legacy: { dir: 'dsh-feishu' },
    async createChannel(deps) {
      deps.logger.info?.('[dsh-chat-feishu] 渠道已注册（P0 骨架，协议实现在 P2）');
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
              bots: [],
              note: '飞书协议实现将在 P2 提供。',
            },
          }),
        },
      };
    },
  }), 'dsh-chat-feishu: 注册渠道');
}
