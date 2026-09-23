import { createRequire as __dshCreateRequire } from 'node:module';
import { dirname as __dshDirname } from 'node:path';
import { fileURLToPath as __dshFileURLToPath } from 'node:url';
const require = __dshCreateRequire(import.meta.url);
const __filename = __dshFileURLToPath(import.meta.url);
const __dirname = __dshDirname(__filename);

// packages/dsh-chat-fixture/host/index.mjs
var name = "dsh-chat-fixture-host";
var inject = ["dshChat"];
var EXPECTED_CONTRACT = 1;
var CHANNEL_ID = "fixture";
function apply(ctx) {
  const service = ctx.dshChat;
  const actual = service?.contractVersion;
  if (actual !== EXPECTED_CONTRACT) {
    throw new Error(
      `dsh-chat-fixture \u9700\u8981 dsh-chat \u5951\u7EA6 v${EXPECTED_CONTRACT}\uFF0C\u5F53\u524D hub \u63D0\u4F9B v${String(actual)}\u3002`
    );
  }
  ctx.effect(() => service.registerChannel({
    id: CHANNEL_ID,
    label: "\u8BD5\u7528\u6E20\u9053",
    order: 90,
    async createChannel(deps) {
      const startedAt = (/* @__PURE__ */ new Date()).toISOString();
      return {
        async start() {
          deps.logger.info?.("[dsh-chat-fixture] \u5047\u6E20\u9053\u5DF2\u542F\u52A8");
        },
        async stop() {
        },
        endpoints: {
          "connection.status": async () => ({
            ok: true,
            value: {
              channel: CHANNEL_ID,
              phase: "running",
              startedAt,
              dataDir: deps.dataDir,
              // 契约能力自检：hub 漏给任何一个依赖，这里就会露出来。
              capabilities: {
                ready: typeof deps.ready === "function",
                storage: typeof deps.storage?.read === "function",
                contextEnhancement: typeof deps.contextEnhancement?.enhanceContent === "function",
                replyReference: typeof deps.replyReference?.enhanceReplyReference === "function",
                forwardedMessages: typeof deps.forwardedMessages?.enhanceForwardedMessages === "function",
                deferred: typeof deps.deferred?.register === "function",
                accessPolicy: typeof deps.accessPolicy?.evaluateAccess === "function",
                commands: typeof deps.commands?.handle === "function",
                createJsonStore: typeof deps.createJsonStore === "function",
                guidance: typeof deps.guidance?.publish === "function",
                sessionsAsk: typeof deps.sessions?.ask === "function",
                sessionsBindings: typeof deps.sessions?.bindings?.adopt === "function",
                interactions: typeof deps.interactions?.offer === "function",
                panel: typeof deps.panel?.read === "function"
              }
            }
          }),
          /** 回显，用于验证 client → hub → 渠道 endpoints 的连通性。 */
          echo: async (payload) => ({ ok: true, value: { echo: payload ?? null, startedAt } }),
          /** 验证 hub 持有的每机器人设置存储。 */
          "settings.roundtrip": async (payload) => {
            const { botId, patch } = payload ?? {};
            if (typeof botId !== "string" || !botId) {
              return { ok: false, error: { code: "fixture/bad-request", message: "\u9700\u8981 botId\u3002", details: {} } };
            }
            const saved = await deps.storage.write(botId, patch ?? { contextEnhancement: null });
            return { ok: true, value: { saved, read: deps.storage.read(botId) } };
          },
          /** 验证上下文增强引擎经服务暴露给渠道，且解析行为一致。 */
          "context.resolve": async (payload) => {
            const { config, conversationType, identity } = payload ?? {};
            const scope = deps.contextEnhancement.resolveContextScope(
              config,
              conversationType,
              identity ?? {}
            );
            if (!scope) return { ok: true, value: { scope: null, text: null } };
            const snapshot = deps.contextEnhancement.captureContextEnhancement({
              botId: "fixture-bot",
              channel: CHANNEL_ID,
              readConfig: () => config
            }, conversationType, identity ?? {});
            const text = deps.contextEnhancement.enhanceContent("\u4F60\u597D", snapshot, () => ({
              senderId: identity?.senderId,
              chatId: identity?.chatId
            }));
            return { ok: true, value: { scope, text } };
          }
        }
      };
    }
  }), "dsh-chat-fixture: \u6CE8\u518C\u5047\u6E20\u9053");
}
export {
  apply,
  inject,
  name
};
