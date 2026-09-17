/**
 * 构建工作区里全部包的 host + client 两半。
 *
 * 用法：node scripts/build-all.mjs
 *
 * @module dsh-chat/build-all
 */

import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');
const builders = ['scripts/build-host.mjs', 'scripts/build-client.mjs'];

const entries = (await readdir(packagesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(packagesDir, entry.name))
  .filter((dir) => existsSync(join(dir, 'package.json')))
  .sort();

if (entries.length === 0) throw new Error('packages/ 下没有可构建的包。');

let failed = 0;
for (const dir of entries) {
  for (const builder of builders) {
    const result = spawnSync(process.execPath, [join(root, builder), dir], {
      cwd: root,
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      failed += 1;
      console.error(`构建失败：${dir} ← ${builder}`);
    }
  }
}

if (failed > 0) {
  console.error(`${failed} 个构建任务失败。`);
  process.exit(1);
}
console.log(`已构建 ${entries.length} 个包（host + client）。`);
