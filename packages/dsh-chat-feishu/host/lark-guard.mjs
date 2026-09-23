/**
 * 聊天会话里的 lark-cli 门禁：让「身份策略」真的生效，而不是只写进配置。
 *
 * 为什么需要它（真机踩过）：机器人在飞书里回答"以我的身份发一条消息"时，
 * 模型是用 `lark-cli` 的 skill + bash **直接**跑的：
 *
 *     lark-cli im +messages-send --as user --user-id ou_… --text 测试
 *
 * 这条路径根本不经过本插件的 `host/lark-cli.mjs`（那是插件自己调 lark-cli 的入口），
 * 于是设置页里那个「只用应用身份」的开关**对模型的实际调用没有任何约束力**——
 * 真机上第二条消息照样以用户身份发了出去（会话导出里写得很清楚：`identity: "user"`）。
 *
 * 所以这里在工具执行前拦一道（DSH 的 `tools/pre-execute` 瀑布事件）：
 * **只要这个会话属于某台飞书机器人**，它跑的每一条 lark-cli 命令都必须
 * ① 绑定这台机器人自己的 profile、② 显式写清身份（`--as bot` / `--as user`）——
 * 省略身份时 lark-cli 会自己"看着办"（这台机器上 `auto` 会挑 user，照样是误用）；
 * 策略是「只用应用身份」时再禁用 `--as user`。别处（用户自己的 DSH 会话）一概不管。
 *
 * 另外挡掉三条会改**本机全局状态**、影响这台机器上别人的命令：
 * `profile use`、`config strict-mode --global`、以及 `--use`（建 profile 时顺手切换生效 profile）。
 *
 * @module dsh-chat-feishu/lark-guard
 */

/** 只有模型跑 shell 的工具才需要看门（run_code 之类的复合工具另说，见 README 的已知边界）。 */
const SHELL_TOOLS = Object.freeze(['bash', 'pwsh']);

/**
 * 不碰租户 API、也不需要身份的子命令：它们读的是本机配置或文档，放行。
 *
 * `whoami` 在这里：它就是"告诉我现在是谁"，配上 profile 反而是最该允许的调用。
 */
const LOCAL_SUBCOMMANDS = Object.freeze([
  'profile', 'config', 'whoami', 'skills', 'schema', 'doctor', 'update', 'help', 'version',
]);

/** 会改本机/全局状态的写法（在机器人会话里一律拒绝）。 */
const BANNED_PATTERNS = Object.freeze([
  { pattern: /--use(?![\w-])/, message: '不许带 --use：它会切换这台机器上 lark-cli 的"当前生效 profile"，影响别人的用法' },
  { pattern: /--global(?![\w-])/, message: '不许带 --global：那是把策略写到全局，会影响这台机器上所有应用' },
  { pattern: /profile\s+use(?![\w-])/, message: '不许执行 `profile use`：它是全局开关，会影响这台机器上所有应用' },
  { pattern: /config\s+bind(?![\w-])/, message: '不许执行 `config bind`：那会把 lark-cli 绑到别的 agent 上下文上' },
  { pattern: /config\s+remove(?![\w-])/, message: '不许执行 `config remove`：它会清掉应用配置与令牌' },
  { pattern: /auth\s+logout(?![\w-])/, message: '不许执行 `auth logout`：它会注销这台机器上的登录态' },
]);

/** 取 flag 值时要跳过"值本身"，否则会被误当成子命令。 */
const VALUE_FLAGS = Object.freeze(['--profile', '--as', '--format', '--jq', '-q', '--domain', '--scope', '--output', '--output-dir']);

/**
 * 按 shell 分隔符把一条命令切成若干段（引号内的分隔符不解析——这里是绊线，不是 shell）。
 *
 * @param command - 模型给的命令字符串。
 * @returns 命令段数组。
 */
export function splitCommandSegments(command) {
  return String(command ?? '').split(/&&|\|\||;|\||\n/);
}

/**
 * 这一段是不是在**执行** lark-cli。
 *
 * 为什么不是"字符串里出现 lark-cli 就算"：`grep -rn lark-cli docs/`、`cat lark-cli.md`
 * 这类**提到**它的命令到处都是，按字符串匹配会把正常的读文档/搜索也拦下来。
 * 所以只认"命令位置"：段首（可带 `VAR=x` 赋值与 sudo/env 之类的包装）、
 * 或 `$(…)` / 反引号里的开头；路径写法 `/usr/local/bin/lark-cli` 也算。
 *
 * @param segment - 命令段。
 * @returns 是否在执行 lark-cli。
 */
export function segmentRunsLarkCli(segment) {
  const wrappers = new Set(['sudo', 'env', 'time', 'command', 'nohup', 'nice', 'caffeinate']);
  for (const part of String(segment ?? '').split(/\$\(|`/)) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    let index = 0;
    while (index < tokens.length
      && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index]) || wrappers.has(tokens[index]))) index += 1;
    if (index >= tokens.length) continue;
    const head = tokens[index].replace(/^[({!]+/, '');
    if (head === 'lark-cli' || /(^|\/)lark-cli$/.test(head)) return true;
  }
  return false;
}

/** 取某个 flag 的全部取值（同时认 `--flag value` 与 `--flag=value`）。 */
function flagValues(text, flag) {
  const values = [];
  const pattern = new RegExp(`${flag}[=\\s]+("[^"]*"|'[^']*'|\\S+)`, 'g');
  for (const match of String(text).matchAll(pattern)) {
    values.push(match[1].replace(/^["']|["']$/g, ''));
  }
  return values;
}

/**
 * 这段命令是不是"本地子命令"（不需要身份，也不碰租户 API）。
 *
 * @param segment - 命令段。
 * @returns 是否本地。
 */
export function isLocalCommand(segment) {
  const text = String(segment ?? '');
  if (/(^|\s)(--help|-h|--version)(\s|$)/.test(text)) return true;
  const tokens = text.split(/\s+/).filter(Boolean);
  const start = tokens.findIndex((token) => /(^|\/)lark-cli$/.test(token.replace(/^[({!]+/, '')));
  if (start < 0) return false;
  for (let index = start + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (VALUE_FLAGS.includes(token)) {
      index += 1;
      continue;
    }
    if (VALUE_FLAGS.some((flag) => token.startsWith(`${flag}=`))) continue;
    if (token.startsWith('-')) continue;
    const head = token.replace(/[^\w-]/g, '');
    // `event consume`：订阅事件同样要显式身份（它不是本地命令）。
    return LOCAL_SUBCOMMANDS.includes(head);
  }
  return false;
}

/**
 * 检查一段 lark-cli 命令是否符合本机器人的身份策略。
 *
 * @param options - { segment, profileName, allowBot, allowUser }：该**场合**解析出来的两个开关
 *   （分层就近覆盖的结果，由调用方按会话算好；门禁自己不做继承判断）。
 * @returns 拒绝原因；合规时返回 null。
 */
export function evaluateLarkSegment({ segment, profileName, allowBot = true, allowUser = false }) {
  const text = String(segment ?? '');
  for (const banned of BANNED_PATTERNS) {
    if (banned.pattern.test(text)) {
      return `这台机器人的会话里${banned.message}。请改用：\`lark-cli --profile ${profileName} <子命令> --as bot\`。`;
    }
  }
  if (!flagValues(text, '--profile').includes(profileName)) {
    return '这条 lark-cli 命令没有绑定本机器人在 lark-cli 里的 profile。'
      + '不带 profile 时 lark-cli 会用这台机器上"当前生效"的那份授权——那可能是别的应用、'
      + `甚至别人的账号。请写成：\`lark-cli --profile ${profileName} <子命令> --as bot\`。`;
  }
  if (isLocalCommand(text)) return null;
  const identities = flagValues(text, '--as');
  if (identities.length === 0) {
    return '这条 lark-cli 命令没有显式写身份，lark-cli 会自己挑（这台机器上会挑成用户身份）。'
      + `请显式加上 \`--as bot\`（代表这台应用自己）；${
        allowUser
          ? '要以某个人的身份操作时才用 `--as user`。'
          : '当前场合只允许应用身份，`--as user` 会被拒绝。'}`;
  }
  if (identities.includes('user') && !allowUser) {
    return '当前场合的 lark-cli 身份策略没有允许用户身份（策略是分层的：全局 / 私聊 / 群聊 / 指定群与指定人，就近覆盖），'
      + '这次调用用了 `--as user`，已拒绝。请改用 `--as bot`；'
      + '要允许用户身份，到设置页 → 这台机器人 → 「lark-cli 身份」里为这个场合开启。';
  }
  // 反过来也要挡：用户显式关掉应用身份的场合，`--as bot` 同样不该放行。
  if (identities.includes('bot') && !allowBot) {
    return '当前场合的 lark-cli 身份策略没有允许应用身份（就近覆盖的结果），这次调用用了 `--as bot`，已拒绝。'
      + '到设置页 → 这台机器人 → 「lark-cli 身份」里检查这个场合的配置。';
  }
  return null;
}

/**
 * 造一个门禁：接在 DSH 的 `tools/pre-execute` 瀑布上。
 *
 * @param options - 依赖：
 *   - `locate(sessionId)`：这个会话属于哪个 (渠道, 机器人, 会话键)（hub 的会话绑定表）；
 *   - `policyFor(owner)`：该**会话**的 lark-cli 身份策略
 *     `{ allowBot, allowUser, profileName }`（拿不到返回 null）。**入参是 owner 而不是 botId**：
 *     身份策略是分层的，"哪个群/哪个人"必须参与解析，只给 botId 会让 A 群的放开泄漏到 B 群；
 *   - `channelId`：只管本渠道的会话（别的渠道的会话一概不管）；
 *   - `logger`：拒绝要留日志（静默拦截是最难查的故障形态）。
 * @returns `{ evaluate(exec) }`：返回 null = 放行，否则返回 `{ kind:'deny', reason }`。
 *   两个依赖都可以是异步的（读取设置前要先 await 落盘文档就绪）。
 */
export function createLarkCliGuard({ locate, policyFor, channelId, logger = console } = {}) {
  async function evaluate(exec) {
    if (typeof locate !== 'function' || typeof policyFor !== 'function') return null;
    const toolName = typeof exec?.name === 'string' ? exec.name : '';
    if (!SHELL_TOOLS.includes(toolName)) return null;
    const args = exec?.arguments;
    const command = typeof args?.command === 'string'
      ? args.command
      : typeof args?.script === 'string' ? args.script : null;
    if (!command || !segmentRunsLarkCli(command)) return null;
    const sessionId = exec?.agent?.session?.header?.id;
    if (typeof sessionId !== 'string' || !sessionId) return null;
    const owner = await locate(sessionId);
    if (!owner || (channelId !== undefined && owner.channelId !== channelId)) return null;
    // 把整个 owner 交出去：策略要按会话键（群/私聊）解析，botId 不够。
    const policy = await policyFor(owner);
    /**
     * 拿不到策略（不是本渠道的聊天会话 / 机器人已不在配置里）时**维持放行**：
     * 那种情况分不清"该管"还是"不该管"，误拦会把正常用法一起打死。
     */
    if (!policy) return null;
    /**
     * 有策略但**解析不到 profile**（本机没装 lark-cli，或拉起 dsh 的环境 PATH 里没有它）时
     * **必须失败关闭**：没有 profile 就没法核对"这条命令绑的是本应用自己的授权"，
     * 放行等于回到"用这台机器上当前生效的那份授权说话"——那正是本项目要堵死的事。
     * 唯一的例外是本机自查类命令（`profile list` / `whoami` / `--help` …）：它们不碰租户 API、
     * 也不需要身份，留着让模型能自己诊断。
     */
    if (!policy.profileName) {
      for (const segment of splitCommandSegments(command)) {
        if (!segmentRunsLarkCli(segment)) continue;
        if (isLocalCommand(segment)) continue;
        const reason = '本会话解析不到这台飞书机器人在 lark-cli 里的 profile'
          + '（本机没装 lark-cli，或拉起 dsh 的环境里 PATH 没有它），无法核对"这条命令用的是本应用自己的授权"，'
          + '因此拒绝执行。请让 dsh 在 PATH 含 `~/.local/bin` 的环境下启动，或先用 `lark-cli profile list` 自查；'
          + '本机自查类命令（profile list / whoami / --help）仍然放行。';
        logger.warn?.(`[dsh-chat-feishu] 拦下一条 lark-cli 调用（${owner.botId} / 会话 ${sessionId}）：`
          + `${reason}｜命令：${segment.trim().slice(0, 200)}`);
        return { kind: 'deny', reason, botId: owner.botId };
      }
      return null;
    }
    for (const segment of splitCommandSegments(command)) {
      if (!segmentRunsLarkCli(segment)) continue;
      const reason = evaluateLarkSegment({
        segment,
        profileName: policy.profileName,
        allowBot: policy.allowBot !== false,
        allowUser: policy.allowUser === true,
      });
      if (reason) {
        logger.warn?.(`[dsh-chat-feishu] 拦下一条 lark-cli 调用（${owner.botId} / 会话 ${sessionId}）：`
          + `${reason}｜命令：${segment.trim().slice(0, 200)}`);
        return { kind: 'deny', reason, botId: owner.botId };
      }
    }
    return null;
  }

  return { evaluate };
}
