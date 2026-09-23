/**
 * lark-cli 的**唯一调用入口**：把"只能用自己的授权"变成结构，而不是纪律。
 *
 * 背景：lark-cli 允许在同一台机器上登录**多个应用**（`~/.lark-cli/config.json` 的 `apps[]`），
 * 并且有一个**全局可变的"生效 profile"**（`profile use` 会改它）。谁不显式指定 profile，
 * 谁就是在用来路不明的那一份授权——对机器人来说这是致命的：它可能以**另一个机器人**、
 * 甚至**另一个人的用户身份**说话。
 *
 * 所以这里定死四条：
 * ① **只有本模块可以拉起 `lark-cli`**（`scripts/verify-package.mjs` 的守门会强制）；
 * ② 每次调用都必然带 `--profile <本应用在 lark-cli 里的那份 profile>`——找不到就失败，
 *    **绝不回退**到当前生效 profile（lark-cli 自己也会以退出码 3 + `error.field === '--profile'` 拒绝）。
 *    **profile 是按 appId 唯一的**（真机实测：`profile add` 同 appId 会被 lark-cli 拒——
 *    `each profile must have a unique app-id`），所以身份策略**不能**靠改它的
 *    `strict-mode` / `default-as` 来实现（那份 profile 用户自己也在用）。
 *    身份由这里逐次核对 + 调用方显式声明，模型自己跑的那条路由 `lark-guard.mjs` 兜底；
 * ③ 身份（`--as`）由 intent 显式声明，**绝不省略**（省略时 lark-cli 会自己"看着办"，不可控）；
 * ④ 用 `--as user` 需要该机器人在设置页显式开启，且**钉住用户**：`whoami` 报回来的
 *    `appId` / `onBehalfOf.openId` 与预期不符就失败，**目标命令一次都不执行**。
 *
 * 另外：子进程环境里会剔除 `LARK_CHANNEL` / `OPENCLAW_HOME` / `HERMES_HOME`——它们会让
 * lark-cli 把配置切到别的"workspace"（实测 `OPENCLAW_HOME=/tmp/x lark-cli config show`
 * 直接报 `openclaw context detected but lark-cli is not bound to it`），与这里的 pin 互相打架。
 *
 * @module dsh-chat-feishu/lark-cli
 */

import { spawn } from 'node:child_process';

/** 身份策略取值：只用应用身份，或允许该应用在 lark-cli 里登录的那个用户。 */
export const LARK_IDENTITY_MODES = Object.freeze(['bot-only', 'user-allowed']);

/** App ID 的合法形状（与控制器同一份判据）。 */
const APP_ID_PATTERN = /^cli_[A-Za-z0-9_-]{4,64}$/;

/**
 * 会改写 lark-cli "workspace" 的环境变量：决不让它们影响我们的子进程。
 * 只在这一个子进程里剔除，不碰宿主环境。
 */
const WORKSPACE_ENV_KEYS = Object.freeze(['LARK_CHANNEL', 'OPENCLAW_HOME', 'HERMES_HOME']);

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * 归一化身份策略：**保守方向**——认不出来一律 `bot-only`。
 *
 * @param value - 任意历史值。
 * @returns 'bot-only' | 'user-allowed'。
 */
export function normalizeLarkUserIdentity(value) {
  return value === 'user-allowed' ? 'user-allowed' : 'bot-only';
}

/**
 * 本机器人在 lark-cli 里的 profile 名**兜底值**（只在"还没有 profile、我们要新建"时用）。
 *
 * lark-cli 自己就按 appId 命名（一个应用一份 profile），所以这里也用它；
 * 但**权威的名字永远来自 `lark-cli profile list`**——用户可能当初起了别的名字。
 *
 * @param appId - 飞书 App ID。
 * @returns profile 名。
 */
export function profileNameFor(appId) {
  return cleanString(appId) ?? 'unknown';
}

function larkError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

/** 解析 stdout 里的 JSON；不是 JSON 就返回 null（lark-cli 出错时也可能给纯文本）。 */
function parseJson(text) {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 默认执行器：数组形式参数 + 关闭 shell（**没有 shell 注入面**）。
 *
 * @param options - { bin, args, env, cwd, input }。
 * @returns { code, stdout, stderr }。
 */
function defaultRunner({ bin, args, env, cwd, input }) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env, cwd, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout?.setEncoding?.('utf8');
    child.stderr?.setEncoding?.('utf8');
    child.stdout?.on?.('data', (chunk) => { stdout += chunk; });
    child.stderr?.on?.('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
    if (input === undefined || input === null) child.stdin?.end?.();
    else child.stdin?.end?.(input);
  });
}

/**
 * 创建某台机器人的 lark-cli 调用器。
 *
 * @param options - 配置：
 *   - `appId`：本机器人的 App ID（必填，形状不对直接拒绝）；
 *   - `brand`：`feishu` | `lark`（自建 profile 时用）；
 *   - `secretRef` / `resolveSecret`：自建 profile 时取 App Secret（只经 stdin 传给 lark-cli）；
 *   - `identityPolicy`：**函数**，每次调用时现读（设置页改完立刻生效，不必重连）；
 *   - `runner`：执行器（测试注入假替身，**测试绝不真跑 lark-cli**）；
 *   - `env` / `cwd` / `bin` / `logger`。
 * @returns 调用器：`inspect` / `listProfiles` / `ensureProfile` / `whoami` / `assertIdentity` /
 *   `sendMessage` / `replyMessage` / `consumeEvents` / `profileName`。
 */
export function createLarkCli({
  appId,
  brand = 'feishu',
  secretRef = null,
  resolveSecret = null,
  identityPolicy = () => ({ mode: 'bot-only', userOpenId: null }),
  runner = defaultRunner,
  spawnStream = spawn,
  logger = console,
  env = process.env,
  cwd = undefined,
  bin = 'lark-cli',
} = {}) {
  const ownAppId = cleanString(appId);
  if (!ownAppId || !APP_ID_PATTERN.test(ownAppId)) {
    throw larkError(
      'feishu/lark-cli-appid-required',
      `lark-cli 调用器需要一个合法的 App ID（收到 ${JSON.stringify(appId ?? null)}）。`,
    );
  }
  const managedName = profileNameFor(ownAppId);
  /** 进程内缓存：解析出的 profile（一个进程只解析一次）。 */
  let resolved = null;
  let resolving = null;

  /**
   * 现读身份策略：设置页改完这一条立刻生效。
   *
   * 策略是**分层**的（全局 / 私聊 / 群聊 / 指定群与人），调用方（`identityPolicy`）
   * 负责按当前会话解析好再交进来；这里只做兜底归一化，并兼容两种形态：
   * - 新：`{ bot, user, userOpenId }`（已解析的作用域）；
   * - 旧：`{ mode: 'bot-only' | 'user-allowed', userOpenId }`（本地升级中途/测试替身）。
   *
   * **保守方向**：认不出来一律"只允许 bot"，绝不因为解析失败而放开用户身份。
   */
  function policy() {
    let value;
    try {
      value = typeof identityPolicy === 'function' ? identityPolicy() : identityPolicy;
    } catch (error) {
      logger.warn?.(`[dsh-chat-feishu] 读取 lark-cli 身份策略失败：${error?.message ?? error}`);
      value = null;
    }
    const legacyMode = typeof value?.mode === 'string' ? normalizeLarkUserIdentity(value.mode) : null;
    const user = value?.user === true || legacyMode === 'user-allowed';
    return {
      bot: value?.bot === true || value?.bot === undefined,
      user,
      userOpenId: cleanString(value?.userOpenId),
    };
  }

  /** 子进程环境：剔除会切 workspace 的变量，并关掉两类提示（免得 JSON 里混 `_notice`）。 */
  function childEnv() {
    const next = { ...env };
    for (const key of WORKSPACE_ENV_KEYS) delete next[key];
    next.LARKSUITE_CLI_NO_UPDATE_NOTIFIER = '1';
    next.LARKSUITE_CLI_NO_SKILLS_NOTIFIER = '1';
    return next;
  }

  /**
   * 跑一条命令（**参数由本模块拼**，调用方没有"传任意 argv"的入口）。
   *
   * @param args - 已经拼好的参数（不含 `--profile`，它由这里统一注入）。
   * @param options - { input, allowPlainText, pin }。`pin: false` **只给发现/创建 profile 用**：
   *   那两条命令必须在"还不知道该用哪个 profile"时跑（`profile list` 是全局列表，
   *   `profile add` 是新建），给它们带上一个尚不存在的 profile 名只会被 lark-cli 拒掉。
   * @returns lark-cli 的 JSON 结果。
   */
  async function exec(args, { input = null, allowPlainText = false, pin = true } = {}) {
    // `--profile` 是 lark-cli 的**根持久 flag**：写在子命令前，任何子命令都吃它。
    const argv = pin ? ['--profile', resolved?.name ?? managedName, ...args] : [...args];
    let result;
    try {
      result = await runner({ bin, args: argv, env: childEnv(), cwd, input });
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw larkError('feishu/lark-cli-missing', `没找到 lark-cli（${bin}），无法完成这次调用。`, { cause: error });
      }
      throw larkError('feishu/lark-cli-failed', `调 lark-cli 失败：${error?.message ?? error}`, { cause: error });
    }
    const payload = parseJson(result?.stdout);
    if (allowPlainText && payload === null && result?.code === 0) {
      return { plain: String(result?.stdout ?? '').trim(), stderr: String(result?.stderr ?? '') };
    }
    if (payload?.ok === false) throw describeFailure(payload.error, result, argv);
    if (result?.code !== 0) {
      const fromStderr = parseJson(result?.stderr);
      throw describeFailure(fromStderr?.error, result, argv);
    }
    if (payload === null) {
      throw larkError('feishu/lark-cli-failed', `lark-cli 没有返回可解析的 JSON（${argv.join(' ')}）。`, {
        stderr: String(result?.stderr ?? '').slice(0, 400),
      });
    }
    return payload;
  }

  /**
   * 把 lark-cli 的错误信封翻译成可读的手册错误。
   *
   * 两条硬规矩：**`--profile` 相关的失败一律不许重试/去掉 flag 再试**；
   * **退出码 10（高风险确认门禁）绝不自动补 `--yes`**——那是用户的决定。
   */
  function describeFailure(error, result, argv) {
    const type = cleanString(error?.type);
    const subtype = cleanString(error?.subtype);
    const hint = cleanString(error?.hint);
    const field = cleanString(error?.field);
    const code = cleanString(error?.message) ?? 'lark-cli 调用失败';
    if (field === '--profile' || subtype === 'not_configured') {
      return larkError(
        'feishu/lark-cli-profile-unavailable',
        `lark-cli 里没有这台机器人（${ownAppId}）对应的 profile：${code}`,
        {
          hint: hint ?? `请先执行 lark-cli profile add --name ${managedName} --app-id ${ownAppId} --app-secret-stdin`,
          appId: ownAppId,
        },
      );
    }
    if (result?.code === 10 || error?.risk === 'high-risk-write') {
      return larkError('feishu/lark-cli-needs-confirmation', `这条 lark-cli 命令需要用户显式确认：${code}`, {
        hint: hint ?? null,
        action: error?.action ?? null,
      });
    }
    return larkError('feishu/lark-cli-failed', `调 lark-cli 失败（${type ?? 'unknown'}${subtype ? `/${subtype}` : ''}）：${code}`, {
      hint: hint ?? null,
      argv: argv.join(' '),
      exitCode: result?.code ?? null,
    });
  }

  /** 列出本机 lark-cli 的全部 profile（只读）。 */
  async function listProfiles() {
    // 注意：`profile list` **没有** `--json`（这版是默认 JSON 输出，加 flag 会报 unknown flag）。
    const payload = await exec(['profile', 'list'], { pin: false });
    const list = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
    return list.map((item) => ({
      name: cleanString(item?.name),
      appId: cleanString(item?.appId),
      brand: cleanString(item?.brand),
      user: cleanString(item?.user),
      tokenStatus: cleanString(item?.tokenStatus),
      active: item?.active === true,
      effective: item?.effective === true,
    }));
  }

  /**
   * 找到本应用在 lark-cli 里的那份 profile：**按 appId**（不认名字）。
   *
   * 为什么不能另建一份"插件专用 profile"（真机实测踩到）：
   * `lark-cli profile add --app-id <已存在的 appId>` 会被直接拒——
   * `app-id "cli_…" is already used by profile "cli_…"; each profile must have a unique app-id`。
   * 也就是说**一个应用在这个 CLI 里只有一份 profile**，名字是用户当初起的（多数就是 appId）。
   * 于是插件既不能另开一份、也不该去改那一份的 `strict-mode` / `default-as`
   * （用户自己也在用它做别的 user 身份的事），身份只能靠**逐次核对 + 门禁**保证。
   *
   * @returns profile 记录或 null。
   */
  async function findProfile() {
    const list = await listProfiles();
    return list.find((item) => item.appId === ownAppId) ?? null;
  }

  /**
   * 解析（必要时创建）本机器人专用的 profile。
   *
   * 创建只在**真的要调用**时发生（懒），且：**不带 `--use`**、不碰任何别人的 profile。
   *
   * @returns 解析出的 profile 记录。
   */
  async function ensureProfile() {
    if (resolved) return resolved;
    if (resolving) return resolving;
    resolving = (async () => {
      const found = await findProfile();
      if (found) {
        resolved = found;
        return resolved;
      }
      if (typeof resolveSecret !== 'function' || !cleanString(secretRef)) {
        throw larkError(
          'feishu/lark-cli-profile-unavailable',
          `lark-cli 里没有 ${ownAppId} 的 profile，且当前拿不到 App Secret，无法为它新建。`,
          { hint: `请执行 lark-cli profile add --name ${ownAppId} --app-id ${ownAppId} --app-secret-stdin` },
        );
      }
      const secret = await resolveSecret(secretRef);
      if (!cleanString(secret)) {
        throw larkError(
          'feishu/lark-cli-profile-unavailable',
          `lark-cli 里没有 ${ownAppId} 的 profile，且 DSH 里这台机器人的 App Secret 读不到。`,
          { hint: '到设置页重新接入这台机器人（填 App ID + App Secret），或手工 lark-cli profile add。' },
        );
      }
      try {
        // App Secret 只走 stdin；**绝不 `--use`**（那会改全局生效 profile，影响用户别的用法）。
        await exec(
          ['profile', 'add', '--name', managedName, '--app-id', ownAppId, '--brand', brand, '--app-secret-stdin'],
          { input: secret, pin: false },
        );
      } catch (error) {
        // 真机上出现过这一类：lark-cli 说 app-id 已被某个 profile 占用（一个 app 只有一份 profile）。
        // 再查一次：查到了就用它（那本来就是本应用的那一份），查不到才把原错误抛出去。
        const again = await findProfile().catch(() => null);
        if (!again) throw error;
        resolved = again;
        return resolved;
      }
      const created = await findProfile();
      if (!created) {
        throw larkError(
          'feishu/lark-cli-profile-unavailable',
          `lark-cli 说 profile 建好了，但列表里读不到 ${ownAppId}。`,
          { hint: '查看 lark-cli profile list；若确实是权限/钥匙串问题，请手工执行 profile add。' },
        );
      }
      resolved = created;
      logger.info?.(`[dsh-chat-feishu] lark-cli 里为 ${ownAppId} 新建了 profile ${created.name}`);
      return resolved;
    })();
    try {
      return await resolving;
    } finally {
      resolving = null;
    }
  }

  /**
   * `whoami`：问 lark-cli"你现在到底是谁"。
   *
   * **故意不走身份策略**：设置页要能先探到"当前登录的是谁"，才能把它钉下来；
   * 而且它只读身份信息，不碰任何用户资源（真正代表用户操作的是 intent，那里才判策略）。
   */
  async function whoami({ as = 'bot' } = {}) {
    await ensureProfile();
    return exec(['whoami', '--json', '--as', as]);
  }

  /**
   * 断言"这次调用真的是以本机器人的身份"。
   *
   * 不满足就抛错，**并且绝不继续执行目标命令**——这是"绝对禁止用别的机器人授权"的落点。
   *
   * @param options - { as }。
   * @returns whoami 的结果。
   */
  async function assertIdentity({ as = 'bot' } = {}) {
    if (as !== 'bot' && as !== 'user') {
      throw larkError('feishu/lark-cli-bad-identity', `身份只能是 bot 或 user（收到 ${JSON.stringify(as)}）。`);
    }
    // 两个开关各自独立：只用应用身份时 `--as bot` 也必须被允许，
    // 而"都不允许"的场合（用户显式关掉了 bot）要在这里挡下，不能默认放行。
    if (as === 'bot' && !policy().bot) {
      throw larkError(
        'feishu/lark-cli-bot-not-allowed',
        '当前场合没有开启「允许以应用身份调用 lark-cli」（身份策略是分层的，就近覆盖），已拒绝这次调用。',
        { hint: '到设置页 → 这台机器人 → 「lark-cli 身份」里为该场合开启应用身份。' },
      );
    }
    if (as === 'user') {
      const current = policy();
      if (!current.user) {
        throw larkError(
          'feishu/lark-cli-user-not-allowed',
          '当前场合没有开启「允许以用户身份调用 lark-cli」（身份策略是分层的：全局 / 私聊 / 群聊 / 指定群与指定人，就近覆盖），已拒绝这次调用。',
          { hint: '到设置页 → 这台机器人 → 「lark-cli 身份」里为该场合开启用户身份。' },
        );
      }
      if (!current.userOpenId) {
        throw larkError(
          'feishu/lark-cli-user-not-allowed',
          '这台机器人虽然允许用户身份，但没有钉住具体用户，已拒绝这次调用。',
          { hint: '到设置页重新开启一次「允许用户身份」，让插件记录下当前登录的用户。' },
        );
      }
      await ensureProfile();
    }
    const info = await whoami({ as });
    if (cleanString(info?.appId) !== ownAppId) {
      throw larkError(
        'feishu/lark-cli-app-mismatch',
        `lark-cli 实际生效的应用是 ${info?.appId ?? '<未知>'}，不是本机器人的 ${ownAppId}；已拒绝这次调用。`,
        { hint: '检查 lark-cli profile list；本插件只会用 appId 与自身一致的那个 profile。' },
      );
    }
    if (as === 'bot' && cleanString(info?.identity) !== 'bot') {
      throw larkError(
        'feishu/lark-cli-identity-mismatch',
        `lark-cli 实际身份是 ${info?.identity ?? '<未知>'}，不是 bot；已拒绝这次调用。`,
      );
    }
    if (as === 'user') {
      const actual = cleanString(info?.onBehalfOf?.openId);
      const expected = policy().userOpenId;
      if (cleanString(info?.identity) !== 'user' || actual !== expected) {
        throw larkError(
          'feishu/lark-cli-user-mismatch',
          `lark-cli 里的用户身份是 ${actual ?? '<未知>'}，不是这台机器人钉住的 ${expected ?? '<未钉住>'}；已拒绝这次调用。`,
          { hint: '在 lark-cli 里重新登录正确的人，或到设置页重新开启一次「允许用户身份」。' },
        );
      }
    }
    if (info?.available === false) {
      throw larkError(
        'feishu/lark-cli-identity-unavailable',
        `lark-cli 的 ${as} 身份当前不可用（${cleanString(info?.tokenStatus) ?? '未知状态'}）。`,
      );
    }
    return info;
  }

  /** 只读体检：给设置页看"现在到底会是谁"。**不建 profile、不写任何东西**。 */
  async function inspect() {
    const current = policy();
    const checkedAt = new Date().toISOString();
    let profile = null;
    try {
      const found = await findProfile();
      if (found) {
        // 只读路径也走同一份解析结果，避免设置页看到的状态与真实调用不一致。
        resolved = resolved ?? found;
        profile = found;
      }
    } catch (error) {
      return Object.freeze({
        policy: current,
        profile: null,
        identity: null,
        checkedAt,
        error: { code: error?.code ?? 'feishu/lark-cli-failed', message: error?.message ?? String(error) },
      });
    }
    if (!profile) {
      return Object.freeze({ policy: current, profile: { found: false, name: managedName }, identity: null, checkedAt });
    }
    const identity = { bot: null, user: null };
    for (const as of ['bot', 'user']) {
      try {
        identity[as] = await whoami({ as });
      } catch (error) {
        identity[as] = { error: { code: error?.code ?? 'feishu/lark-cli-failed', message: error?.message ?? String(error) } };
      }
    }
    return Object.freeze({
      policy: current,
      profile: Object.freeze({ found: true, ...profile }),
      identity: Object.freeze(identity),
      checkedAt,
    });
  }

  /** 只允许 bot/user 两种身份，且 intent 必须显式给。 */
  async function guard(as) {
    return assertIdentity({ as });
  }

  /**
   * 发消息（`im +messages-send`）。
   *
   * @param params - { chatId, text | markdown | content, msgType, idempotencyKey, dryRun, as }。
   */
  async function sendMessage(params = {}) {
    const chatId = cleanString(params.chatId);
    if (!chatId) throw larkError('feishu/lark-cli-bad-request', 'sendMessage 需要 chatId。');
    const body = contentArgs(params);
    await guard(params.as ?? 'bot');
    const args = ['im', '+messages-send', '--chat-id', chatId, ...body];
    if (cleanString(params.msgType)) args.push('--msg-type', params.msgType);
    if (cleanString(params.idempotencyKey)) args.push('--idempotency-key', params.idempotencyKey);
    if (params.dryRun === true) args.push('--dry-run');
    return exec(withAs(args, params.as ?? 'bot'));
  }

  /**
   * 回复消息（`im +messages-reply`）。
   *
   * @param params - { messageId, text | markdown | content, replyInThread, dryRun, as }。
   */
  async function replyMessage(params = {}) {
    const messageId = cleanString(params.messageId);
    if (!messageId) throw larkError('feishu/lark-cli-bad-request', 'replyMessage 需要 messageId。');
    const body = contentArgs(params);
    await guard(params.as ?? 'bot');
    const args = ['im', '+messages-reply', '--message-id', messageId, ...body];
    if (params.replyInThread === true) args.push('--reply-in-thread');
    if (params.dryRun === true) args.push('--dry-run');
    return exec(withAs(args, params.as ?? 'bot'));
  }

  /**
   * 消费事件（`event consume <key>`）：**返回子进程句柄**，流式读由调用方负责。
   *
   * 这里仍然把 `--profile` / `--as` 钉死——入站事件也必须来自**本机器人**那条长连接。
   *
   * @param params - { key, maxEvents, timeoutSeconds, as }。
   * @returns 子进程句柄（已带 pin 好的参数与环境）。
   */
  async function consumeEvents(params = {}) {
    const key = cleanString(params.key);
    if (!key || !/^[A-Za-z0-9._]+$/.test(key)) {
      throw larkError('feishu/lark-cli-bad-request', `consumeEvents 的事件名不合法：${JSON.stringify(params.key ?? null)}。`);
    }
    const as = params.as ?? 'bot';
    await guard(as);
    const args = ['event', 'consume', key, '--as', as];
    if (Number.isInteger(params.maxEvents) && params.maxEvents > 0) args.push('--max-events', String(params.maxEvents));
    if (Number.isInteger(params.timeoutSeconds) && params.timeoutSeconds > 0) {
      args.push('--timeout', `${params.timeoutSeconds}s`);
    }
    const argv = ['--profile', (resolved ?? { name: managedName }).name, ...args];
    return spawnStream(bin, argv, { env: childEnv(), cwd, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  }

  function withAs(args, as) {
    return [...args, '--as', as];
  }

  function contentArgs(params) {
    const given = ['text', 'markdown', 'content'].filter((field) => cleanString(params[field]));
    if (given.length !== 1) {
      throw larkError('feishu/lark-cli-bad-request', 'text / markdown / content 必须且只能给一个。');
    }
    const field = given[0];
    return [`--${field}`, params[field]];
  }

  return Object.freeze({
    appId: ownAppId,
    profileName: managedName,
    inspect,
    listProfiles,
    ensureProfile,
    whoami,
    assertIdentity,
    sendMessage,
    replyMessage,
    consumeEvents,
  });
}
