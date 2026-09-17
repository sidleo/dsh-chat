import { createRequire as __dshCreateRequire } from 'node:module';
import { dirname as __dshDirname } from 'node:path';
import { fileURLToPath as __dshFileURLToPath } from 'node:url';
const require = __dshCreateRequire(import.meta.url);
const __filename = __dshFileURLToPath(import.meta.url);
const __dirname = __dshDirname(__filename);

// packages/dsh-chat-feishu/host/index.mjs
var name = "dsh-chat-feishu-host";
var inject = ["dshChat"];
var EXPECTED_CONTRACT = 1;
var CHANNEL_ID = "feishu";
function apply(ctx) {
  const service = ctx.dshChat;
  const actual = service?.contractVersion;
  if (actual !== EXPECTED_CONTRACT) {
    throw new Error(
      `dsh-chat-feishu \u9700\u8981 dsh-chat \u5951\u7EA6 v${EXPECTED_CONTRACT}\uFF0C\u5F53\u524D hub \u63D0\u4F9B v${String(actual)}\uFF1B\u8BF7\u5347\u7EA7 dsh-chat \u6216\u5B89\u88C5\u5339\u914D\u7248\u672C\u7684\u6E20\u9053\u63D2\u4EF6\uFF08\u89C1 CONTRACT.md\uFF09\u3002`
    );
  }
  ctx.effect(() => service.registerChannel({
    id: CHANNEL_ID,
    label: "\u98DE\u4E66",
    order: 20,
    legacy: { dir: "dsh-feishu" },
    async createChannel(deps) {
      deps.logger.info?.("[dsh-chat-feishu] \u6E20\u9053\u5DF2\u6CE8\u518C\uFF08P0 \u9AA8\u67B6\uFF0C\u534F\u8BAE\u5B9E\u73B0\u5728 P2\uFF09");
      return {
        async start() {
        },
        async stop() {
        },
        endpoints: {
          "connection.status": async () => ({
            ok: true,
            value: {
              channel: CHANNEL_ID,
              phase: "skeleton",
              contractVersion: EXPECTED_CONTRACT,
              dataDir: deps.dataDir,
              bots: [],
              note: "\u98DE\u4E66\u534F\u8BAE\u5B9E\u73B0\u5C06\u5728 P2 \u63D0\u4F9B\u3002"
            }
          })
        }
      };
    }
  }), "dsh-chat-feishu: \u6CE8\u518C\u6E20\u9053");
}
export {
  apply,
  inject,
  name
};
