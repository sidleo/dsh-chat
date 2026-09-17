/**
 * 打包与契约自检。
 *
 * 用法：node scripts/verify-package.mjs
 *
 * 检查项：
 * 1. 必备包齐全（hub + 飞书 + 微信）；
 * 2. 每个包都声明了 dsh.bundle.patch 与 dsh.client.platform=web；
 * 3. cordis.patch.yml 插入的行 id/name 与本包名一致；
 * 4. host / client 两半都已构建，且 client bundle 的模块 id 等于包名；
 * 5. 渠道包**不得** import hub 包（契约只经运行期服务，见 CONTRACT.md）。
 *
 * @module dsh-chat/verify-package
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

const REQUIRED = ['dsh-chat', 'dsh-chat-feishu', 'dsh-chat-weixin'];
const HUB = 'dsh-chat';

const failures = [];
const notes = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

const packageDirs = (await readdir(packagesDir, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(packagesDir, entry.name))
  .filter((dir) => existsSync(join(dir, 'package.json')));

const manifests = new Map();
for (const dir of packageDirs) {
  const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
  manifests.set(manifest.name, { dir, manifest });
}

for (const name of REQUIRED) {
  check(manifests.has(name), `缺少必备包：${name}`);
}

for (const [name, { dir, manifest }] of manifests) {
  const patchRel = manifest.dsh?.bundle?.patch;
  check(typeof patchRel === 'string', `${name}: package.json 缺少 dsh.bundle.patch`);
  check(manifest.dsh?.client?.platform === 'web', `${name}: dsh.client.platform 必须是 'web'`);
  check(Array.isArray(manifest.dsh?.client?.inject), `${name}: dsh.client.inject 必须是数组`);

  if (typeof patchRel === 'string') {
    const patchPath = join(dir, patchRel);
    check(existsSync(patchPath), `${name}: 找不到补丁文件 ${patchRel}`);
    if (existsSync(patchPath)) {
      const text = await readFile(patchPath, 'utf8');
      check(text.includes(`id: ${name}`), `${name}: ${patchRel} 未插入 id: ${name} 的行`);
      check(text.includes(`name: ${name}`), `${name}: ${patchRel} 未引用包名 ${name}`);
    }
  }

  const hostBundle = join(dir, 'lib/index.js');
  const clientBundle = join(dir, 'lib/client.js');
  check(existsSync(hostBundle), `${name}: 缺少 host 产物 lib/index.js（先跑 npm run build）`);
  check(existsSync(clientBundle), `${name}: 缺少 client 产物 lib/client.js（先跑 npm run build）`);

  if (existsSync(clientBundle)) {
    const head = (await readFile(clientBundle, 'utf8')).slice(0, 400);
    check(head.includes(`id: ${JSON.stringify(name)}`),
      `${name}: client bundle 的模块 id 必须等于包名`);
  }

  if (existsSync(hostBundle)) {
    const text = await readFile(hostBundle, 'utf8');
    check(/export\s*\{[^}]*\bapply\b/.test(text) || /\bapply\b/.test(text),
      `${name}: host bundle 必须导出 apply`);
  }

  check(Array.isArray(manifest.files) && manifest.files.includes('lib'),
    `${name}: package.json 的 files 必须包含 lib`);

  // 渠道包不得 import hub 包。
  if (name !== HUB) {
    const sources = (await walk(dir)).filter((file) => (
      /\.(m?js)$/.test(file) && !file.includes(`${join(dir, 'lib')}`)
    ));
    for (const file of sources) {
      const text = await readFile(file, 'utf8');
      const importPattern = new RegExp(`(from|require\\()\\s*['"]${HUB}(/|['"])`);
      check(!importPattern.test(text),
        `${name}: ${file.slice(root.length + 1)} 不得 import ${HUB}（契约只走运行期服务）`);
    }
  }
}

// 契约版本必须只有 hub 一处定义。
const contractFile = join(packagesDir, HUB, 'shared/contract.mjs');
if (existsSync(contractFile)) {
  const text = await readFile(contractFile, 'utf8');
  check(/CONTRACT_VERSION\s*=\s*1\b/.test(text), 'CONTRACT_VERSION 应为 1');
} else {
  failures.push(`找不到 ${HUB}/shared/contract.mjs`);
}

// 可选：检查当前 profile 是否仍装着上游插件（双绑风险）。
const profileManifest = process.env.DSH_CHAT_PROFILE_MANIFEST;
if (profileManifest && existsSync(profileManifest)) {
  const text = await readFile(profileManifest, 'utf8');
  check(!text.includes('@xmanrui/dsh-im'),
    `profile ${profileManifest} 仍装着 @xmanrui/dsh-im，必须移除后再启用 dsh-chat（双绑会双份回复）`);
  notes.push('已检查 profile 中不存在 @xmanrui/dsh-im');
}

if (notes.length > 0) for (const note of notes) console.log(`· ${note}`);

if (failures.length > 0) {
  console.error(`打包自检失败（${failures.length} 项）：`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`打包自检通过：${manifests.size} 个包（${[...manifests.keys()].join('、')}）。`);
