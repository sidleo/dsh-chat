/**
 * 打包与契约自检。
 *
 * 用法：node scripts/verify-package.mjs
 *
 * 检查项：
 * 1. 必备包齐全（hub + 飞书 + 微信）；
 * 2. 每个包都声明了 dsh.bundle.patch 与 dsh.client.platform=web；
 * 3. cordis.patch.yml 插入的行 id/name 与本包名一致；
 * 4. host / client 两半都已构建，client bundle 的模块 id 等于包名，且**能真的加载**
 *    （按浏览器的 `__ModuleLoader__.load(...)` → `factory(require)` 跑一遍：语法能过
 *    esbuild、却在模块顶层抛错的问题只能在这一层暴露，真机上表现为整个插件加载失败）；
 * 5. 渠道包**不得** import hub 包（契约只经运行期服务，见 CONTRACT.md）；
 * 6. `lark-cli` 只能从唯一入口调用，且那个入口必须钉住自身 appId（见下面第 6 条守门）。
 *
 * @module dsh-chat/verify-package
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');

// 包名带作用域（npm 上 `dsh-chat` 这个裸名已被别人的项目占用）。
const REQUIRED = ['@sidleo3/dsh-chat', '@sidleo3/dsh-chat-feishu', '@sidleo3/dsh-chat-weixin'];
const HUB = '@sidleo3/dsh-chat';

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

/**
 * 去掉注释，只留代码：下面那条守门判的是"代码会不会做危险的事"，
 * 不该被文档里出现 `--global`/`profile use` 这类字样误伤（说明为什么禁止，也是文档的一部分）。
 *
 * @param source - 文件源码。
 * @returns 去掉注释的近似代码文本。
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    // `[^:]` 是为了不把 `https://` 当成行注释起点。
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * 按浏览器加载器的方式跑一遍 client bundle，返回错误描述；能加载则返回 null。
 *
 * 为什么必须真跑：`select is not defined` 这类问题**语法合法**（模板字符串被提前闭合，
 * 后面的片段成了模块顶层的代码），esbuild 与普通单测都拦不住，只有真机加载才报错。
 *
 * @param source - `lib/client.js` 的源码。
 * @param name - 包名，用于错误信息。
 * @returns 错误字符串或 null。
 */
function loadClientBundle(source, name) {
  // 依赖（react 等）在 Node 里不存在；这里只关心"模块顶层能不能跑完"，
  // 所以 require 一律给一个什么都能取的占位对象。
  const stub = new Proxy(function () {}, { get: () => stub, apply: () => stub });
  let definition = null;
  const context = createContext({
    window: { __ModuleLoader__: { load: (value) => { definition = value; } } },
    console,
  });
  try {
    runInContext(source, context, { filename: `${name}/lib/client.js` });
    if (!definition) throw new Error('没有调用 window.__ModuleLoader__.load');
    definition.factory(() => stub);
    return null;
  } catch (error) {
    return `${error?.constructor?.name ?? 'Error'}: ${error?.message ?? error}`;
  }
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
      // name 必须指向本包（作用域包要带引号：YAML 里 @ 是保留字符）；id 只用于定向补丁，非空即可。
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      check(new RegExp(`name:\\s*['\"]?${escaped}['\"]?`).test(text),
        `${name}: ${patchRel} 未引用包名 ${name}`);
      check(/id:\s*\S+/.test(text), `${name}: ${patchRel} 缺少插件行 id`);
    }
  }

  const hostBundle = join(dir, 'lib/index.js');
  const clientBundle = join(dir, 'lib/client.js');
  check(existsSync(hostBundle), `${name}: 缺少 host 产物 lib/index.js（先跑 npm run build）`);
  check(existsSync(clientBundle), `${name}: 缺少 client 产物 lib/client.js（先跑 npm run build）`);

  if (existsSync(clientBundle)) {
    const source = await readFile(clientBundle, 'utf8');
    const head = source.slice(0, 400);
    check(head.includes(`id: ${JSON.stringify(name)}`),
      `${name}: client bundle 的模块 id 必须等于包名`);
    const loadError = loadClientBundle(source, name);
    check(loadError === null,
      `${name}: client bundle 加载失败（浏览器里会表现为整个插件加载失败）——${loadError}`);
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

/**
 * 6. `lark-cli` 只能从唯一入口调用（`dsh-chat-feishu/host/lark-cli.mjs`）。
 *
 * 为什么用"谁引入 node:child_process"当判据：lark-cli 是**外部可执行文件**，只有拉起子进程
 * 才可能在别的授权下说话。而那个入口自己强制 `--profile <本机器人 appId>` + `--as`，
 * 并且宁可失败也不回退——所以"不许别处再拉子进程"就等于"不许别处再用别的授权"。
 *
 * 顺带钉住三件会改**别人状态**的事：`--use`（切换生效 profile）、`--global`（把策略写全局）、
 * `shell: true`（走 shell 就有了拼命令的余地）。
 */
const LARK_CLI_ENTRY = 'packages/dsh-chat-feishu/host/lark-cli.mjs';
for (const file of await walk(packagesDir)) {
  if (!/\.(m?js)$/.test(file)) continue;
  const relative = file.slice(root.length + 1);
  if (relative === LARK_CLI_ENTRY) continue;
  if (relative.includes(`${sep}lib${sep}`)) continue;
  const text = await readFile(file, 'utf8');
  check(!/from\s+['"]node:child_process['"]|require\(\s*['"]node:child_process['"]/.test(text),
    `${relative} 不该引入 node:child_process：调 lark-cli 只能走 ${LARK_CLI_ENTRY}`);
}
if (!existsSync(join(root, LARK_CLI_ENTRY))) {
  failures.push(`找不到 ${LARK_CLI_ENTRY}（lark-cli 的唯一入口）`);
} else {
  const entryCode = stripComments(await readFile(join(root, LARK_CLI_ENTRY), 'utf8'));
  check(entryCode.includes("'--profile'"),
    `${LARK_CLI_ENTRY} 必须显式注入 --profile（否则会用到 lark-cli 当前生效的那份授权）`);
  check(entryCode.includes("'--as'"),
    `${LARK_CLI_ENTRY} 必须显式注入 --as（省略身份时 lark-cli 会自己挑，不可控）`);
  for (const banned of ["'--use'", "'--global'", "'profile', 'use'", "'auth', 'logout'", 'shell: true']) {
    check(!entryCode.includes(banned), `${LARK_CLI_ENTRY} 里不许出现 ${banned}`);
  }
}

// 契约版本必须只有 hub 一处定义。
// 注意用**目录**而不是包名拼路径：作用域包名里带 `/`，拼出来不是一个目录。
const hubDir = manifests.get(HUB)?.dir ?? join(packagesDir, 'dsh-chat');
const contractFile = join(hubDir, 'shared/contract.mjs');
if (existsSync(contractFile)) {
  const text = await readFile(contractFile, 'utf8');
  check(/CONTRACT_VERSION\s*=\s*1\b/.test(text), 'CONTRACT_VERSION 应为 1');
} else {
  failures.push(`找不到 ${HUB} 的 shared/contract.mjs`);
}

// 渠道声明的 CHANNEL_VERSION 必须与自己的 package.json 一致。
// 设置页的「版本与更新」面板直接显示这个常量，漂移了会给出错误的版本信息。
for (const [name, { dir, manifest }] of manifests) {
  if (name === HUB || name === 'dsh-chat-fixture') continue;
  const indexFile = join(dir, 'host', 'index.mjs');
  if (!existsSync(indexFile)) continue;
  const text = await readFile(indexFile, 'utf8');
  const declared = /const CHANNEL_VERSION = '([^']+)'/.exec(text)?.[1];
  check(declared !== undefined, `${name}: host/index.mjs 需声明 CHANNEL_VERSION（版本与更新面板要用）`);
  if (declared !== undefined) {
    check(declared === manifest.version,
      `${name}: CHANNEL_VERSION=${declared} 与 package.json 的 ${manifest.version} 不一致`);
  }
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
