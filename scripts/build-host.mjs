/**
 * 把一个包的 host 半边打成 `lib/index.js`（ESM / Node 22）。
 *
 * 用法：node scripts/build-host.mjs packages/dsh-chat
 *
 * @module dsh-chat/build-host
 */

import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { build } from 'esbuild';

const packageDir = resolve(process.argv[2] ?? '');
if (!packageDir) throw new Error('用法：node scripts/build-host.mjs <packageDir>');

const entryPoint = join(packageDir, 'host/index.mjs');
const outputPath = join(packageDir, 'lib/index.js');

/**
 * host 侧外置依赖：由 profile 的 node_modules 在运行期解析。
 * 渠道包用到时把依赖写进自己的 package.json 即可。
 */
const EXTERNAL = [
  '@larksuiteoapi/node-sdk',
  'qrcode',
  'undici',
];

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
