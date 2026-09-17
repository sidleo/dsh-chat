/**
 * 把一个包的 host 半边打成 `lib/index.js`（ESM / Node 22）。
 *
 * 用法：node scripts/build-host.mjs packages/dsh-chat
 *
 * @module dsh-chat/build-host
 */

import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { build } from 'esbuild';

const packageDir = resolve(process.argv[2] ?? '');
if (!packageDir) throw new Error('用法：node scripts/build-host.mjs <packageDir>');

const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
const entryPoint = join(packageDir, 'host/index.mjs');
const outputPath = join(packageDir, 'lib/index.js');

/**
 * host 侧外置依赖：由 profile 的 node_modules 在运行期解析。
 * 想改成"打进 bundle"的依赖写在包的 `dsh.build.external` 里（写全量外置清单）。
 * 飞书 SDK 默认打包进来：它的长连接实现需要与我们的网关代码同版本演进，
 * 运行时再去 profile 里解析一个版本不一致的副本更容易出问题。
 */
const DEFAULT_EXTERNAL = ['undici', 'qrcode'];
const EXTERNAL = manifest.dsh?.build?.external ?? DEFAULT_EXTERNAL;

await mkdir(dirname(outputPath), { recursive: true });
await build({
  entryPoints: [entryPoint],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  mainFields: ['module', 'main'],
  external: EXTERNAL.flatMap((name) => [name, `${name}/*`]),
  outfile: outputPath,
  banner: {
    js: [
      "import { createRequire as __dshCreateRequire } from 'node:module';",
      "import { dirname as __dshDirname } from 'node:path';",
      "import { fileURLToPath as __dshFileURLToPath } from 'node:url';",
      'const require = __dshCreateRequire(import.meta.url);',
      'const __filename = __dshFileURLToPath(import.meta.url);',
      'const __dirname = __dshDirname(__filename);',
    ].join('\n'),
  },
  sourcemap: false,
  minify: process.env.NODE_ENV === 'production',
  legalComments: 'eof',
  logLevel: 'warning',
});

console.log(`Wrote ${outputPath}`);
