#!/usr/bin/env node
/**
 * 真 DSH 兼容门禁（`npm run check:dsh`）。
 *
 * 为什么要有它：`npm run check`、`npm run rehearsal` 都是**离线的**——它们验证的是我们自己的
 * 逻辑（契约、引擎、卡片、布局），没有一步真的把插件装进 DSH、让 DSH 把它拉起来。
 * 而"这个插件在当前这台 DSH 上到底还装不装得上、起不起得来、设置页那条线路还通不通"
 * 恰恰是升级 DSH 之后最先坏、又最难从单测里看出来的一件事（manifest / `dsh.bundle` /
 * 注入名 / Connection 路由，任何一处漂移都只在真启动时暴露）。
 * 所以这道门禁**真的启动一次 DSH**：临时 profile 把**三个发布包（hub + 飞书 + 微信）**都装上 →
 * 合成树里三个入口都在且没被 disabled → 起 web → hub 日志就绪 → 客户端插件图里有本插件 →
 * 用设置页一模一样的线路格式打一次 hub 路由（`channel.list`），断言返回的渠道里
 * **同时有 `feishu` 与 `weixin`**。最后一条是关键：渠道包只有 `apply()` 跑完、注册成功才会出现在
 * 那份清单里——hub 单独起来说明不了渠道能不能加载。
 *
 * ⚠️ 临时 `DSH_HOME` 里**没有凭据**，所以渠道只走到"加载 + 注册"就停：不会建真实 Lark 长连接、
 * 不会扫微信码、一个平台也不连。这道门禁验的是"装得上、起得来、接得通"，不是"能跟平台说话"。
 *
 * 安全边界（每一条都是刻意设计的）：
 * - **不碰 `~/.dsh`**：全程 `DSH_HOME=<mkdtemp 出来的临时目录>`，数据、profile、日志都在里面；
 *   收尾删掉（失败时**保留**并把路径打印出来，方便排查）。第 9 步还会断言
 *   DSH 回报的 `dataDir` 确实落在这个临时目录里——"没碰用户数据"是**验过**的，不是承诺的。
 * - **不联网**：子进程一律带 `npm_config_offline=true`（任何一次意外的 registry 请求会直接失败，
 *   而不是悄悄联网）；只有"连本机回环 127.0.0.1"的 HTTP 探测。配方本身（从出厂模板建 profile、
 *   `link:` 装本地包、起 web）实测离线可用。
 * - **不碰 `desktop` profile**：`desktop` 是 CLI 保留的，所以用自建的临时 profile 名。
 * - **进程清理**：子进程 `detached: true` 自成进程组，收尾 `process.kill(-pid, …)` 整组杀
 *   （SIGTERM → 兜底 SIGKILL）；脚本自己异常退出也由 `process.on('exit')` 同步清理。
 *
 * 何时跑它（**不在 `npm run check` 里**：那道门要快、离线、零副作用）：
 * 动过 `package.json` 的 `dsh.bundle` / `dsh.client.inject` / `cordis.patch.yml` / host 接线，
 * 或者**升级了 DSH 之后**，单独跑一次它。本机没装 dsh 时它跳过（退出码 0）——
 * 不让没装 DSH 的机器（CI、别人的开发机）因为这道门禁变红。
 *
 * 用法：`npm run check:dsh`（`DSH_BIN` 可指定 dsh 可执行文件；`DSH_CHAT_COMPAT_KEEP=1` 保留临时目录）。
 * 退出码：全部通过 0；任何一步失败 1；跳过（没装 dsh / 不支持的平台）0。
 *
 * @module dsh-chat/scripts/check-dsh-compat
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, open, readdir, readFile, rm, stat } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

/** 临时 profile 名（**不要**用 `desktop`：那是 CLI 保留的）。 */
const PROFILE = 'compatweb';

/** 每步上限：本机操作 + 起服务，实测总耗时以秒计；有界只是为了"卡住要能说清是第几步"。 */
const STEP_TIMEOUT_MS = 120_000;

/** hub 就绪的等待上限（比其它步宽一点：这是唯一等真实服务起来的步）。 */
const READY_TIMEOUT_MS = 180_000;

/** 收尾时给子进程组的宽限时间（SIGTERM → 这个时间之后 SIGKILL）。 */
const KILL_GRACE_MS = 4_000;

const HUB_PACKAGE = '@sidleo3/dsh-chat';
const HUB_DIR = 'packages/dsh-chat';

/**
 * 三个发布包：hub + 两个渠道。**三个一起装、一起验，缺一个都不算过**。
 *
 * 为什么不能只验 hub：真正会坏的是渠道包——飞书渠道的 host 半要加载 6.5MB 的 Lark SDK bundle、
 * 要 `ctx.inject(['shellEnv'])`、要注册 `tools/pre-execute` 门禁、要注册自己的 RPC 路由；
 * 微信渠道要起 iLink 长轮询那套控制器。这些能不能在目标 DSH 上加载，hub 单独起来说明不了。
 * 最省事又最硬的判据是控制端点那句 `channel.list`：渠道**真的 `apply()` 过、注册进来了**
 * 才会出现在返回的 `channels` 里（中间任何一步炸掉，那个渠道就不在）。
 *
 * ⚠️ 临时 `DSH_HOME` 里**没有凭据**（凭据服务是空的、`integrations/` 是新建的），所以渠道
 * 只走到"加载 + 注册"这一步就停：**不会**建真实 Lark 长连接、**不会**扫微信码、**不连任何平台**。
 * 这道门禁验的是"装得上、起得来、接得通"，不是"能跟平台说话"（那只能真机验）。
 */
const PACKAGES = Object.freeze([
  { id: 'dsh-chat', dir: HUB_DIR },
  { id: 'dsh-chat-feishu', dir: 'packages/dsh-chat-feishu' },
  { id: 'dsh-chat-weixin', dir: 'packages/dsh-chat-weixin' },
]);

/** 渠道 id：`channel.list` 里必须同时出现这两个（与渠道包注册的 id 一致）。 */
const CHANNEL_IDS = Object.freeze(['feishu', 'weixin']);

const results = [];
let stepNo = 0;

/* ------------------------------------------------------------------ 小工具 */

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** 同步睡一小会儿：只给 `process.on('exit')` 用（那里拿不到异步 API）。 */
function sleepSync(ms) {
  const lock = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(lock, 0, 0, ms);
}

/** 有界的 Promise：超时抛可读错误（含"第 N 步"），绝不让脚本挂死。 */
function withTimeout(promise, timeoutMs, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label}超时（${Math.round(timeoutMs / 1000)} 秒内没有完成）`));
    }, timeoutMs);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/** 记一步：抛错 = 这一步失败，后续步骤继续跑（一次看全，与 rehearsal.mjs 同风格）。 */
async function step(title, run, timeoutMs = STEP_TIMEOUT_MS) {
  stepNo += 1;
  const index = stepNo;
  try {
    const detail = await withTimeout(Promise.resolve().then(run), timeoutMs, `第 ${index} 步（${title}）`);
    results.push({ index, title, ok: true, detail: detail ?? '' });
    console.log(`✅ ${index}. ${title}${detail ? `\n   ${detail}` : ''}`);
  } catch (error) {
    const message = error?.message ?? String(error);
    results.push({ index, title, ok: false, detail: message });
    console.log(`❌ ${index}. ${title}\n   ${message}`);
    if (process.env.DSH_CHAT_COMPAT_DEBUG) console.log(error?.stack ?? '');
  }
}

/** 跳过（不是失败）：没装 DSH / 平台不支持时用它，退出码仍是 0。 */
function skip(reason) {
  console.log(`⏭️  跳过真机兼容门禁：${reason}`);
}

/* ------------------------------------------------------------------ 子进程 */

/** 本进程正在跑的 dsh 子进程（收尾要整组杀掉）。 */
const children = new Set();
let tempHome = null;

/** 子进程环境：**只**加我们自己的东西，其余照旧（PATH 里可能没有 node，所以用 process.execPath 拉起）。 */
function childEnv() {
  return {
    ...process.env,
    DSH_HOME: tempHome,
    // 钉成离线：配方本身不需要网络，把"意外的 registry 请求"变成一次响亮的失败。
    npm_config_offline: 'true',
    npm_config_audit: 'false',
    npm_config_fund: 'false',
  };
}

/** 整组杀：子进程是 detached（自成进程组），负 pid 才能带走它拉起的孙进程。 */
function killGroup(child, signal) {
  if (!child || typeof child.pid !== 'number') return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // 已经退了就算了。
    }
  }
}

/**
 * 拉起 dsh。
 *
 * `detached: true` 不是为了"后台常驻"，而是为了**自成进程组**——`dsh web` 会再拉起子进程，
 * 只杀直接子进程会留下一堆孤儿（真机上表现为端口被占、临时目录删不掉）。
 */
function spawnDsh(bin, args, { viaNode = true } = {}) {
  const command = viaNode ? process.execPath : bin;
  const argv = viaNode ? [bin, ...args] : args;
  const child = spawn(command, argv, {
    env: childEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

/** 跑一条 dsh 命令并收下输出；超时/出错都整组杀掉。 */
function runDsh(bin, args, { timeoutMs = STEP_TIMEOUT_MS, label = 'dsh', viaNode = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnDsh(bin, args, { viaNode });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killGroup(child, 'SIGTERM');
      setTimeout(() => killGroup(child, 'SIGKILL'), 500).unref?.();
      reject(new Error(`${label} 超时（${Math.round(timeoutMs / 1000)} 秒）`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`${label} 起不来：${error?.message ?? error}`));
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

/* ------------------------------------------------------------------ dsh 定位 */

/** 读文件头：判断这个 dsh 是 node 脚本（要 `node <bin>`）还是可执行文件（直接跑）。 */
async function looksLikeNodeScript(path) {
  try {
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(64);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const head = buffer.subarray(0, bytesRead).toString('utf8');
      return head.startsWith('#!') && /\bnode\b/.test(head);
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

async function isExecutableFile(path) {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

/**
 * 优先 `DSH_BIN` → `~/.local/bin/dsh` → PATH 里的 `dsh`；找不到返回 null。
 *
 * `DSH_BIN` 指错时不静默忽略：**说出来**再继续找（否则"我明明指定了那一份、它却用了别的"
 * 是最难查的那类误导）。
 */
async function locateDsh() {
  const candidates = [];
  const configured = process.env.DSH_BIN?.trim();
  if (configured) {
    if (await isExecutableFile(configured)) candidates.push({ source: 'DSH_BIN', path: configured });
    else console.log(`⚠️  忽略 DSH_BIN=${configured}（不是一个可读的普通文件），继续按默认位置找。`);
  }
  candidates.push({ source: '~/.local/bin/dsh', path: join(process.env.HOME ?? '', '.local', 'bin', 'dsh') });
  for (const dir of String(process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    candidates.push({ source: 'PATH', path: join(dir, 'dsh') });
  }
  for (const candidate of candidates) {
    if (!candidate.path || !existsSync(candidate.path)) continue;
    if (!await isExecutableFile(candidate.path)) continue;
    return { ...candidate, viaNode: await looksLikeNodeScript(candidate.path) };
  }
  return null;
}

/* ------------------------------------------------------------------ 网络（只有本机回环） */

/** 空闲端口：listen 0 让内核挑一个再关掉（配方要求，避免和用户正在跑的 DSH 撞端口）。 */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** 最小 cookie 罐：index 那次 GET 会下发鉴权 cookie，后面的 POST 必须带上。 */
class CookieJar {
  #cookies = new Map();

  absorb(response) {
    const list = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [];
    for (const raw of list) {
      const [pair] = String(raw).split(';');
      const index = pair.indexOf('=');
      if (index > 0) this.#cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }

  header() {
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

/** 打开设置页（带 token 的那个 URL）：跟随重定向，把 cookie 收进罐子。 */
async function openIndex(url, jar, timeoutMs = 30_000) {
  let current = url;
  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: jar.header() ? { cookie: jar.header() } : {},
    });
    jar.absorb(response);
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      await response.arrayBuffer();
      current = new URL(location, current).toString();
      continue;
    }
    return response;
  }
  throw new Error('打开设置页时重定向次数过多');
}

/**
 * 用设置页完全相同的线路格式打一次 hub 路由。
 *
 * @param origin - 裸源（`http://127.0.0.1:<port>`）：**不能**带 token 查询串，
 *   否则打到的是 `/?token=…/api/…` 这条静态路径上（实测就是一个 405 空体）。
 */
async function callControl(origin, jar, method, payload, rpcId) {
  const response = await fetch(`${origin}/api/dsh-chat/control`, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: { 'content-type': 'application/json', cookie: jar.header() },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method: 'dsh-chat/control',
      payload: { method, payload },
    }),
  });
  const body = await response.text();
  return { status: response.status, body };
}

/* ------------------------------------------------------------------ 主流程 */

/**
 * 本仓库 hub 包的 package.json 版本。
 *
 * 用来和**运行期自报**的 `hubVersion` 对账：两者不一致只有两种可能——`HUB_VERSION` 写漂了，
 * 或者 `packages/dsh-chat/lib/` 还是旧构建（改了源码忘了 `npm run build`）。两种都该红。
 */
async function hubManifestVersion() {
  const text = await readFile(join(HUB_DIR, 'package.json'), 'utf8');
  return JSON.parse(text).version;
}

async function main() {
  console.log('dsh-chat 真 DSH 兼容门禁：真启动一次本机装着的 DSH（临时 DSH_HOME + 临时 profile）\n');
  console.log('范围：三个包（hub + 飞书 + 微信）装包兼容预检 → 合成树 → 起 web → hub 日志就绪 →');
  console.log('      客户端插件图 → 设置页 RPC 线路 → channel.list 里两个渠道都真的注册进来了。');
  console.log('边界：不碰 ~/.dsh、不联网（子进程 npm_config_offline）、临时 home 无凭据因此**不连任何平台**、');
  console.log('      不碰 desktop profile；收尾杀掉自己起的整个进程组。');
  console.log('何时跑：动过 dsh.bundle / dsh.client.inject / cordis.patch.yml / host 接线，或升级 DSH 之后。\n');

  if (process.platform === 'win32') {
    skip('本脚本只支持 macOS / Linux（进程组语义与 shell 环境不同）。');
    return;
  }

  const dsh = await locateDsh();
  if (!dsh) {
    skip('未找到 dsh（找过 DSH_BIN、~/.local/bin/dsh、PATH）；本机没装 DSH 时这道门禁无从跑起。');
    console.log('  装好 DSH 后再跑：`npm run check:dsh`（或用 DSH_BIN 指定可执行文件）。');
    return;
  }

  const expectedVersion = await hubManifestVersion();
  console.log(`dsh：${dsh.path}（来自 ${dsh.source}${dsh.viaNode ? '，按 node 脚本拉起' : ''}）`);
  console.log(`待装包（${PACKAGES.length} 个）：${PACKAGES.map((pkg) => pkg.dir).join('、')}`
    + `（hub 版本 ${expectedVersion}）\n`);

  tempHome = await mkdtemp(join(tmpdir(), 'dsh-chat-compat-'));
  const logsDir = join(tempHome, 'integrations', 'dsh-chat', 'logs');
  const hubLog = join(logsDir, 'hub.log');
  console.log(`临时 DSH_HOME：${tempHome}（凭据服务是空的 → 渠道只加载/注册，不连真实平台）\n`);

  const args = (extra) => ['--profile', PROFILE, ...extra];
  // dsh 可能是 node 脚本（`~/.local/bin/dsh` 就是），也可能是自带解释器的可执行文件：
  // 统一在 locateDsh 里判过一次，之后所有调用都照那个结论拉起。
  const viaNode = dsh.viaNode;
  const runDshCmd = (argv, options) => runDsh(dsh.path, argv, { viaNode, ...options });

  // ① 从出厂模板建 profile：不改用户的任何 profile，也不需要 pnpm install / 网络。
  await step('从出厂模板建临时 profile 并打印合成树（离线）', async () => {
    const run = await runDshCmd(args(['--from-default-profile', 'web', '--dump-config']), {
      label: '建 profile', timeoutMs: STEP_TIMEOUT_MS,
    });
    if (run.code !== 0) {
      throw new Error(`exit=${run.code}${run.signal ? ` signal=${run.signal}` : ''}｜${tail(run.stderr || run.stdout)}`);
    }
    if (!run.stdout.includes('@deepseek-ai/dsh-base')) {
      throw new Error(`合成树里没有出厂模板的内容（输出 ${run.stdout.length} 字节）：${tail(run.stdout)}`);
    }
    return `${PROFILE} 建好，合成树 ${run.stdout.split('\n').filter(Boolean).length} 行`;
  });

  // ② 装包（三个）：这一步同时验证**安装前兼容性预检**通过（`evaluatePluginCompatibility`
  //    只读 peerDependencies），以及每个包的 `dsh.bundle.patch` 都被识别
  //    （包名会被自动追加进 profile 的 `dsh.profile.bundles`）。
  await step(`三个包逐个装进临时 profile（${PACKAGES.map((pkg) => pkg.id).join(' / ')}）`, async () => {
    const installed = [];
    for (const pkg of PACKAGES) {
      const dir = join(process.cwd(), pkg.dir);
      const name = `@sidleo3/${pkg.id}`;
      const run = await runDshCmd(['plugin', '--profile', PROFILE, 'add', dir], {
        label: `装 ${pkg.id}`, timeoutMs: STEP_TIMEOUT_MS,
      });
      if (run.code !== 0) {
        throw new Error(`${pkg.id} 装不上：exit=${run.code}｜${tail(run.stderr || run.stdout)}`);
      }
      const output = `${run.stdout}\n${run.stderr}`;
      if (!output.includes(`+ ${name}`)) {
        throw new Error(`${pkg.id} 没看到装包成功那行（+ ${name}）：${tail(output)}`);
      }
      installed.push({ pkg, name, line: output.split('\n').find((row) => row.includes(`+ ${name}`))?.trim() ?? '' });
    }
    const manifest = JSON.parse(await readFile(join(tempHome, 'profiles', PROFILE, 'package.json'), 'utf8'));
    const bundles = manifest?.dsh?.profile?.bundles;
    const missing = installed.filter(({ name }) => !Array.isArray(bundles) || !bundles.includes(name));
    if (missing.length > 0) {
      throw new Error(`装完但 dsh.profile.bundles 里缺 ${missing.map((row) => row.name).join('、')}`
        + `（bundle patch 没被识别？）：${JSON.stringify(bundles)}`);
    }
    return `${installed.map((row) => row.line).join('；\n   ')}；三个都写进了 dsh.profile.bundles`;
  });

  // ③ 合成树里三个包都必须真有、且**都不是 disabled**（disabled = 接线被跳过，插件等于没装）。
  await step('合成树里三个包都在、且都没有被 disabled', async () => {
    const run = await runDshCmd(args(['--dump-config']), { label: 'dump-config' });
    if (run.code !== 0) {
      throw new Error(`exit=${run.code}｜${tail(run.stderr || run.stdout)}`);
    }
    const lines = run.stdout.split('\n');
    const found = [];
    for (const pkg of PACKAGES) {
      const name = `@sidleo3/${pkg.id}`;
      const idLine = lines.findIndex((row) => new RegExp(`^\\s*-\\s*id:\\s*${pkg.id}\\s*$`).test(row));
      if (idLine < 0) throw new Error(`合成树里没有 \`- id: ${pkg.id}\`：${tail(run.stdout)}`);
      // 只取这一项的 YAML 块：到下一个 `- ` 行为止（`disabled:` 就在这里判，别看着别处的 disabled 报错）。
      const block = [];
      for (let index = idLine; index < lines.length; index += 1) {
        if (index > idLine && /^\s*-\s/.test(lines[index])) break;
        block.push(lines[index]);
      }
      const text = block.join('\n');
      if (!text.includes(`'${name}'`) && !text.includes(`"${name}"`)) {
        throw new Error(`${pkg.id} 那一项不是 ${name}：${text}`);
      }
      const disabled = block.find((row) => /^\s*disabled:/.test(row));
      if (disabled) throw new Error(`${pkg.id} 被禁用了（${disabled.trim()}）——接线不会生效：${text}`);
      found.push(`${pkg.id} 无 disabled`);
    }
    return `\`- id: ${PACKAGES.map((pkg) => pkg.id).join('\` / \`- id: ')}\` 都在，都没有 disabled`;
  });

  // ④ 真起 web：第一行会打印带 token 的地址（token 是本地鉴权用的，不打印到我们的输出里）。
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  /** 带 token 的入口地址：**只**用它开设置页（token 是查询串，后面的 RPC 必须打裸 origin）。 */
  let entryUrl = null;
  /** ⑥ 取回来的 index HTML：⑥b 要从里面的插件图里取本插件的 bundle url。 */
  let indexHtml = null;
  await step(`启动 dsh web（127.0.0.1:${port}）并拿到带 token 的地址`, async () => {
    const booted = spawnDsh(dsh.path, args(['--port', String(port), '--no-open']), { viaNode });
    let output = '';
    booted.stdout.on('data', (chunk) => { output += chunk; });
    booted.stderr.on('data', (chunk) => { output += chunk; });
    let exited = null;
    booted.once('exit', (code, signal) => { exited = { code, signal }; });
    const urlPattern = /dsh web:\s*(http:\/\/127\.0\.0\.1:(\d+)\/\?token=[A-Za-z0-9._~-]+)/;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const match = urlPattern.exec(output);
      if (match) {
        if (Number(match[2]) !== port) throw new Error(`报的端口不是我们要的：${match[2]} ≠ ${port}`);
        entryUrl = match[1];
        return `${origin}/?token=***（stdout 首行）`;
      }
      if (exited) throw new Error(`dsh 起来就退了：exit=${exited.code}｜${tail(output)}`);
      await sleep(200);
    }
    throw new Error(`60 秒内没打印出 \`dsh web: http://…\`：${tail(output)}`);
  });

  // ⑤ 等 hub 自己报就绪：证明 host 半**真的被 DSH 加载并跑起来了**（而不只是文件在那）。
  await step('hub 日志出现「hub 已就绪（契约 v1）」（host 半真的跑起来了）', async () => {
    if (!entryUrl) throw new Error('上一步没拿到地址，跳过等待（先修上面那条）');
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let lastSeen = '';
    while (Date.now() < deadline) {
      if (existsSync(hubLog)) {
        const text = await readFile(hubLog, 'utf8').catch(() => '');
        const match = /hub 已就绪（契约 v\d+）/.exec(text);
        if (match) return `${hubLog} 里出现「${match[0]}」`;
        lastSeen = text.trim().split('\n').slice(-1)[0] ?? '';
      }
      if (Date.now() + 500 > deadline) break;
      await sleep(500);
    }
    throw new Error(`${Math.round(READY_TIMEOUT_MS / 1000)} 秒内 ${hubLog} 没出现就绪行`
      + `${lastSeen ? `（最后一行：${lastSeen}）` : '（文件都没出现）'}`);
  }, READY_TIMEOUT_MS + 5_000);

  // ⑥ 客户端插件图 + **客户端 bundle 真的能取到、且语法能解析**。
  //
  //    ⚠️ 这两件事必须分开断言（对抗性审查指出的证据强度问题）：
  //    index HTML 里那个插件图是 **host 侧合成**的——`@deepseek-ai/dsh-client-modules` 按
  //    `ctx.loader.entries()` 扫 `dsh.client`、把 bootInjections 塞进 index，**只校验 `exports`
  //    里有 `./client`，从不读 bundle 内容**；bundle 是浏览器之后按 `url` 去拉的。
  //    所以"图里有本插件"只证明**注册与引用链成立**，`lib/client.js` 语法坏掉照样绿——
  //    而"bundle 解析失败 → 页面白屏"正是本项目踩过的坑（styles.js 模板字符串里放了反引号那次）。
  //    因此这里再补两道：① 真按 url 拉一次 bundle（HTTP 200 + 非空）；② `node --check` 三个
  //    client 产物（离线、不依赖浏览器，挡语法级错误）。
  const jar = new CookieJar();
  await step('带 token 打开设置页：200，且客户端插件图里有本插件', async () => {
    if (!entryUrl) throw new Error('还没起起来（先修上面那条）');
    const response = await openIndex(entryUrl, jar);
    if (response.status !== 200) {
      await response.arrayBuffer();
      throw new Error(`index 返回 HTTP ${response.status}（期望 200）`);
    }
    const html = await response.text();
    const needle = `"id":"${HUB_PACKAGE}"`;
    if (!html.includes(needle)) {
      throw new Error(`index HTML（${html.length} 字节）里没有 ${needle}：客户端半没注册上`);
    }
    indexHtml = html;
    return `HTTP 200，index ${html.length} 字节，含 ${needle}`;
  });

  // ⑥b 真拉一次客户端 bundle：`<origin>/plugins/??<包>/client.js` 必须 200 且非空。
  await step('真拉一次客户端 bundle：HTTP 200 且非空（不是只看插件图）', async () => {
    if (!entryUrl || !indexHtml) throw new Error('还没起起来（先修上面那条）');
    // 从 index 的插件图里取本插件的 url（形如 `plugins/??@sidleo3/dsh-chat/client.js&rev=…`）。
    const row = new RegExp(`\\{[^{}]*"id":"${HUB_PACKAGE}"[^{}]*\\}`).exec(indexHtml)?.[0] ?? '';
    const url = /"url":"([^"]+)"/.exec(row)?.[1];
    if (!url) throw new Error('index 插件图里取不到本插件的 url（形状变了？）');
    const response = await fetch(new URL(url, entryUrl), {
      headers: { cookie: jar.header() },
      signal: AbortSignal.timeout(STEP_TIMEOUT_MS),
    });
    const body = await response.text();
    if (response.status !== 200) throw new Error(`${url} 返回 HTTP ${response.status}（期望 200）`);
    if (body.trim() === '') throw new Error(`${url} 取回来是空的`);
    return `${url} → HTTP 200，${body.length} 字节`;
  });

  // ⑥c 三个 client 产物的语法自检（离线）：挡住"改了源码忘了 build""模板字符串里放反引号"这类
  //    会让**整个 bundle** 解析失败的故障。用 `node --check`（仓库里 client 产物是 ESM）。
  await step('三个 client 产物语法自检（node --check）', async () => {
    const dirs = PACKAGES.map((pkg) => pkg.dir);
    const checked = [];
    for (const dir of dirs) {
      const file = join(process.cwd(), dir, 'lib', 'client.js');
      if (!existsSync(file)) throw new Error(`缺少构建产物 ${dir}/lib/client.js（先 npm run build）`);
      const code = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--check', file], { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        child.stderr.on('data', (chunk) => { stderr += chunk; });
        child.once('error', reject);
        child.once('exit', (exitCode) => (exitCode === 0
          ? resolve(0)
          : reject(new Error(`${dir}/lib/client.js 语法检查失败（exit=${exitCode}）：${tail(stderr)}`))));
      });
      if (code !== 0) throw new Error(`${dir}/lib/client.js 语法检查失败`);
      checked.push(`${dir}/lib/client.js`);
    }
    return checked.join('、');
  });


  // ⑦ 设置页那条线路：格式与 `client/rpc.js` 完全一致（同一个信封、同一个端点、同一套 cookie 鉴权）。
  await step('设置页线路（信封格式完全相同）：hub 路由通、返回结构化信封', async () => {
    if (!entryUrl) throw new Error('还没起起来（先修上面那条）');
    const { status, body } = await callControl(origin, jar, 'channels.list', {}, 'probe-1');
    if (status !== 200) throw new Error(`HTTP ${status}（期望 200）｜${tail(body)}`);
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error(`响应不是 JSON（说明没打到我们的路由上）：${tail(body)}`);
    }
    if (parsed?.type !== 'server-response' || parsed?.rpcId !== 'probe-1') {
      throw new Error(`信封形状不对（期望 type=server-response / rpcId=probe-1）：${tail(body)}`);
    }
    if (!Object.hasOwn(parsed, 'result')) throw new Error(`信封里没有 result：${tail(body)}`);
    // 业务错误是**预期**的（`channels.list` 不是控制端点的方法）；但错误码必须是 `chat/` 前缀——
    // 那是我们自己的处理器给的，说明线路真的落到了插件上（未注册的路由是 404 "not found"）。
    const code = parsed.result?.ok === false ? parsed.result.error?.code : null;
    if (parsed.result?.ok === false && !String(code).startsWith('chat/')) {
      throw new Error(`result.error.code=${code} 不是我们的业务错误码（线路可能没落到插件上）：${tail(body)}`);
    }
    return `HTTP 200 + {type:'server-response', rpcId:'probe-1', result:${code ? `错误 ${code}（预期）` : '成功'}}`;
  });

  // ⑧ **这道门禁最硬的一条**：真实业务调用 `channel.list`（设置页首屏就是这么问左栏渠道清单的）。
  //    它一口气验四件事：
  //    ① RPC 线路通（路由 + 鉴权 + cookie + 信封）；
  //    ② hub 活着并真的处理了请求（`result.ok === true`）；
  //    ③ **两个渠道包真的加载并注册成功了**——渠道只有 `apply()` 跑完、`registerChannel` 过，
  //       才会出现在 `channels` 里；少任何一个（Lark SDK 加载失败、`ctx.inject(['shellEnv'])`
  //       对不上、RPC 路由注册冲突…）这里就是红的。hub 单独起来证明不了这一条；
  //    ④ 版本面自校验：运行期自报的 `hubVersion` == 本仓库 `packages/dsh-chat/package.json`
  //       的版本（漂了、或者 `lib/` 是旧构建都会红）。
  //    顺带断言 `dataDir` 落在临时 DSH_HOME 里——"没碰用户 ~/.dsh" 是**验过**的，不是承诺的。
  //
  //    payload 传 `null`：`channel.list` 的入参校验是"允许 null 或空对象，其余一律 fail"
  //    （`plugin.mjs` 的 `controlHandler`），所以 null 合法且最省事。
  await step('真实业务调用（channel.list）：feishu 与 weixin 都注册进来了 + 版本对账', async () => {
    if (!entryUrl) throw new Error('还没起起来（先修上面那条）');
    const { status, body } = await callControl(origin, jar, 'channel.list', null, 'probe-2');
    if (status !== 200) throw new Error(`HTTP ${status}（期望 200）｜${tail(body)}`);
    const parsed = JSON.parse(body);
    const value = parsed?.result?.ok === true ? parsed.result.value : null;
    if (!value) throw new Error(`channel.list 没成功：${tail(body)}`);
    if (value.hubPackage !== HUB_PACKAGE) {
      throw new Error(`运行期自报的包名是 ${value.hubPackage}（期望 ${HUB_PACKAGE}）`);
    }
    const ids = Array.isArray(value.channels) ? value.channels.map((entry) => entry?.id) : null;
    if (!ids) throw new Error(`channels 不是数组：${tail(body)}`);
    // 必须**同时**有这两个（不是"至少有一个"，那样退化成"只要 hub 活着就绿"）。
    const missing = CHANNEL_IDS.filter((id) => !ids.includes(id));
    if (missing.length > 0) {
      throw new Error(`channel.list 里缺渠道 ${missing.join('、')}——对应的渠道包没加载或没注册上`
        + `（实际：${JSON.stringify(ids)}）`);
    }
    if (value.hubVersion !== expectedVersion) {
      throw new Error(`运行期自报 hubVersion=${value.hubVersion}，而 ${HUB_DIR}/package.json 是 ${expectedVersion}`
        + '（HUB_VERSION 漂了，或者 lib/ 是旧构建——记得 npm run build）');
    }
    if (typeof value.dataDir !== 'string' || !value.dataDir.startsWith(tempHome)) {
      throw new Error(`dataDir=${value.dataDir} 不在临时 DSH_HOME（${tempHome}）里——这道门禁不许碰用户的 ~/.dsh`);
    }
    return `hubVersion=${value.hubVersion}，信道 ${ids.join('、')} 都在（共 ${ids.length} 个），`
      + `dataDir 在临时 home 内`;
  });

  // ⑨ 渠道日志落盘：渠道 deps 一建起来就会有它自己的日志文件，这是"渠道 host 半真的跑过"的
  //    第二份证据（与 `channel.list` 相互独立：一个是内存里的注册表，一个是磁盘上的产物）。
  await step('两个渠道的日志文件都落在临时 DSH_HOME 里（渠道 host 半真的跑了）', async () => {
    const expected = ['hub.log', ...CHANNEL_IDS.map((id) => `${id}.log`)];
    const missing = expected.filter((name) => !existsSync(join(logsDir, name)));
    if (missing.length > 0) {
      const present = existsSync(logsDir) ? (await readdir(logsDir)).join('、') : '（日志目录都没有）';
      throw new Error(`缺少 ${missing.join('、')}（现有：${present}）`);
    }
    return `${logsDir} 下 ${expected.join('、')} 都在`;
  });
}

/** 输出尾部若干行（报错时贴证据用）。 */
function tail(text, lines = 12) {
  const rows = String(text ?? '').trim().split('\n');
  return rows.slice(-lines).join('\n');
}

/** 这个 pid 还活着吗（`kill(pid, 0)`：ESRCH = 已经回收了）。 */
function isAlive(pid) {
  if (typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 收尾：整组杀掉子进程（SIGTERM → 宽限 → SIGKILL），必要时删掉临时 DSH_HOME。 */
async function cleanup() {
  for (const child of [...children]) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    killGroup(child, 'SIGTERM');
  }
  if (children.size > 0) {
    await sleep(300);
    for (const child of [...children]) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      killGroup(child, 'SIGKILL');
    }
  }
}

/** 收尾自检的标题（它也是一条会红的断言，不是打印一句就算）。 */
const CLEANUP_TITLE = '收尾：自己起的 dsh 进程组已全部回收，无残留进程';

async function main2() {
  try {
    await main();
  } finally {
    await cleanup();
    // 再等一小会儿：进程刚被杀，日志句柄可能还在收尾（立刻删会冒出误导性的 ENOENT）。
    await sleep(200);

    /**
     * ⑩ 收尾自检：**自己起的进程必须真的回收**。
     *
     * 孤儿 dsh 会占着端口、还让人以为门禁没跑完（下次跑时"端口被占/临时目录删不掉"）。
     * 这里是门禁的一部分，所以它会红、会算进结果——不是打印一句就算了。
     */
    const survivors = [...children].filter((child) => isAlive(child.pid));
    const cleanupIndex = results.length + 1;
    if (survivors.length === 0) {
      results.push({ index: cleanupIndex, title: CLEANUP_TITLE, ok: true, detail: '' });
      console.log(`✅ ${cleanupIndex}. ${CLEANUP_TITLE}\n   进程组 SIGTERM→SIGKILL 后一个都没剩`);
    } else {
      const detail = `还有 ${survivors.length} 个 dsh 子进程没退：pid ${survivors.map((row) => row.pid).join('、')}`;
      results.push({ index: cleanupIndex, title: CLEANUP_TITLE, ok: false, detail });
      console.log(`❌ ${cleanupIndex}. ${CLEANUP_TITLE}\n   ${detail}`);
    }

    const failed = results.filter((row) => !row.ok);
    const keep = failed.length > 0 || process.env.DSH_CHAT_COMPAT_KEEP === '1';
    if (tempHome) {
      if (keep) {
        console.log(`\n临时 DSH_HOME 保留在：${tempHome}（${failed.length > 0 ? '有失败步骤' : 'DSH_CHAT_COMPAT_KEEP=1'}）`);
        console.log(`  排查入口：${join(tempHome, 'integrations', 'dsh-chat', 'logs', 'hub.log')}`);
      } else {
        await rm(tempHome, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
      }
    }
    if (results.length > 0) {
      console.log(`\n门禁结果：${results.length - failed.length}/${results.length} 通过`
        + `${failed.length > 0 ? `，失败：${failed.map((row) => `第 ${row.index} 步 ${row.title}`).join('、')}` : ''}`);
    }
    if (failed.length > 0) process.exitCode = 1;
  }
}

/**
 * 异常退出（未捕获异常 / 被 Ctrl-C）也要收拾干净：这里只能同步做，
 * 所以 SIGTERM → 同步等一小会儿 → SIGKILL（临时目录留着，路径由上层打印）。
 */
process.on('exit', () => {
  for (const child of [...children]) {
    killGroup(child, 'SIGTERM');
  }
  if (children.size > 0) {
    sleepSync(Math.min(KILL_GRACE_MS, 1_000));
    for (const child of [...children]) {
      killGroup(child, 'SIGKILL');
    }
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n收到 ${signal}，收尾中……`);
    process.exitCode = 130;
    // 交给下面的 finally / 'exit' 处理器清理。
    process.exit();
  });
}

main2().catch((error) => {
  console.error(`\n门禁没能跑起来（这一步之前就崩了）：${error?.message ?? error}`);
  if (tempHome) console.error(`临时 DSH_HOME（保留）：${tempHome}`);
  if (process.env.DSH_CHAT_COMPAT_DEBUG) console.error(error?.stack ?? '');
  process.exitCode = 1;
});
