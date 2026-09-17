/**
 * 把一个包的 client 半边打成 `lib/client.js`（CJS + DSH 模块加载器包装）。
 *
 * 用法：node scripts/build-client.mjs packages/dsh-chat
 *
 * @module dsh-chat/build-client
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { build } from 'esbuild';

const packageDir = resolve(process.argv[2] ?? '');
if (!packageDir) throw new Error('用法：node scripts/build-client.mjs <packageDir>');

const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'));
const loaderId = manifest.name;
const outputPath = join(packageDir, 'lib/client.js');

const result = await build({
  entryPoints: [join(packageDir, 'client/index.js')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome100'],
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  write: false,
  minify: process.env.NODE_ENV === 'production',
  legalComments: 'none',
  logLevel: 'warning',
});

const bundled = result.outputFiles?.[0]?.text;
if (!bundled) throw new Error('esbuild 未产出 client bundle');

// DSH 的浏览器模块系统按 id 注册每个插件的 bundle（id 必须等于包名）。
const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(loaderId)},
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${bundled}
    return module.exports;
  }
});
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, wrapped, 'utf8');
console.log(`Wrote ${outputPath}`);
