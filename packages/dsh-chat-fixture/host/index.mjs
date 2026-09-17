/**
 * dsh-chat-fixture（host 侧）：**仅用于契约验证**的假渠道，不随产品发布。
 *
 * 它存在的意义是证明"新增聊天软件只需新增插件包、hub 零改动"：
 * 本包只依赖 CONTRACT.md 描述的服务与 deps，并通过它们验证
 * 上下文增强解析、每机器人设置读写、RPC 分派三条主链路。
 *
 * @module dsh-chat-fixture/host
 */

export const name = 'dsh-chat-fixture-host';

export const inject = ['dshChat'];

const EXPECTED_CONTRACT = 1;

const CHANNEL_ID = 'fixture';

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
      `dsh-chat-fixture 需要 dsh-chat 契约 v${EXPECTED_CONTRACT}，当前 hub 提供 v${String(actual)}。`,
    );
  }

  ctx.effect(() => service.registerChannel({
    id: CHANNEL_ID,
    label: '试用渠道',
    order: 90,
    async createChannel(deps) {
      const startedAt = new Date().toISOString();
      return {
        async start() {
          deps.logger.info?.('[dsh-chat-fixture] 假渠道已启动');
        },
        async stop() {},
        endpoints: {
          'connection.status': async () => ({
            ok: true,
            value: { channel: CHANNEL_ID, phase: 'running', startedAt, dataDir: deps.dataDir },
          }),

          /** 回显，用于验证 client → hub → 渠道 endpoints 的连通性。 */
          echo: async (payload) => ({ ok: true, value: { echo: payload ?? null, startedAt } }),

          /** 验证 hub 持有的每机器人设置存储。 */
          'settings.roundtrip': async (payload) => {
            const { botId, patch } = payload ?? {};
            if (typeof botId !== 'string' || !botId) {
              return { ok: false, error: { code: 'fixture/bad-request', message: '需要 botId。', details: {} } };
            }
            const saved = await deps.storage.write(botId, patch ?? { contextEnhancement: null });
            return { ok: true, value: { saved, read: deps.storage.read(botId) } };
          },

          /** 验证上下文增强引擎经服务暴露给渠道，且解析行为一致。 */
          'context.resolve': async (payload) => {
            const { config, conversationType, identity } = payload ?? {};
            const scope = deps.contextEnhancement.resolveContextScope(
              config,
              conversationType,
              identity ?? {},
            );
            if (!scope) return { ok: true, value: { scope: null, text: null } };
            const snapshot = deps.contextEnhancement.captureContextEnhancement({
              botId: 'fixture-bot',
              channel: CHANNEL_ID,
              readConfig: () => config,
            }, conversationType, identity ?? {});
            const text = deps.contextEnhancement.enhanceContent('你好', snapshot, () => ({
              senderId: identity?.senderId,
              chatId: identity?.chatId,
            }));
            return { ok: true, value: { scope, text } };
          },
        },
      };
    },
  }), 'dsh-chat-fixture: 注册假渠道');
}
