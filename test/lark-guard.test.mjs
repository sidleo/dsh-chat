/**
 * 聊天会话里的 lark-cli 门禁：把"身份策略"变成对**模型自己跑的** lark-cli 也有效的约束。
 *
 * 真机背景：机器人被要求"以我的身份发一条消息"时，模型直接用 lark-cli 的 skill + bash 跑
 * `lark-cli im +messages-send --as user …`，绕过了插件自己的调用入口；设置页里
 * 「只用应用身份」那个开关对它毫无作用（第二条消息照样以用户身份发出去了）。
 * 这里钉住门禁的每一条规则，以及"不该管的绝不乱管"。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLarkCliGuard, evaluateLarkSegment, isLocalCommand, segmentRunsLarkCli, splitCommandSegments,
} from '../packages/dsh-chat-feishu/host/lark-guard.mjs';

const silentLogger = { info() {}, warn() {}, error() {} };

const SESSION = 'session-e6fb1928-946a-4f60-82ed-56a6076eb008';
const BOT_ID = 'bot_b6e11ebfaedb4413bf7c5eaa65387204';
const PROFILE = 'dsh-chat-cli_a9fa3aebe7f89cef';

function createGuard({ allowBot = true, allowUser = false, locate, policyFor, channelId = 'feishu' } = {}) {
  return createLarkCliGuard({
    channelId,
    locate: locate ?? ((sessionId) => (sessionId === SESSION ? { channelId: 'feishu', botId: BOT_ID, key: 'p2p:ou_x' } : undefined)),
    // policyFor 收的是 **owner**（{ channelId, botId, key }）而不是 botId：
    // 身份策略分层，"哪个群/哪个人"必须参与解析，只给 botId 会让 A 群的放开泄漏到 B 群。
    policyFor: policyFor
      ?? (async (owner) => (owner?.botId === BOT_ID ? { allowBot, allowUser, profileName: PROFILE } : null)),
    logger: silentLogger,
  });
}

/** 一次 bash 工具调用。 */
function bashCall(command, { sessionId = SESSION } = {}) {
  return {
    name: 'bash',
    arguments: { command },
    agent: sessionId === null ? undefined : { session: { header: { id: sessionId } } },
  };
}

test('分段与识别：只在"真的在执行 lark-cli"的段上做判断', () => {
  assert.deepEqual(splitCommandSegments('a && b || c | d ; e\nf'), ['a ', ' b ', ' c ', ' d ', ' e', 'f']);
  assert.equal(segmentRunsLarkCli('lark-cli im +messages-send'), true);
  assert.equal(segmentRunsLarkCli('/usr/local/bin/lark-cli whoami'), true);
  assert.equal(segmentRunsLarkCli('FOO=1 sudo lark-cli whoami'), true, '赋值与 sudo 前缀不算命令头');
  assert.equal(segmentRunsLarkCli('echo $(lark-cli whoami)'), true, '命令替换里也算');
  // 只是**提到**它：读文档、搜索都不该被拦。
  assert.equal(segmentRunsLarkCli('cat lark-cli.md'), false);
  assert.equal(segmentRunsLarkCli('grep -rn lark-cli docs/'), false);
  assert.equal(segmentRunsLarkCli('echo "lark-cli 怎么用"'), false);
  assert.equal(segmentRunsLarkCli('lark-cli-helper run'), false, 'lark-cli-helper 不是 lark-cli');
});

test('本地子命令：profile / config / whoami / skills 这些不需要显式身份', () => {
  assert.equal(isLocalCommand('lark-cli skills read lark-im'), true);
  assert.equal(isLocalCommand('lark-cli --profile dsh-chat-x whoami'), true);
  assert.equal(isLocalCommand('lark-cli profile list'), true);
  assert.equal(isLocalCommand('lark-cli config strict-mode'), true);
  assert.equal(isLocalCommand('lark-cli im +messages-send --text hi'), false);
  assert.equal(isLocalCommand('lark-cli event consume im.message.receive_v1'), false, '订阅事件要显式身份');
});

test('规则本身：缺 profile / 缺身份 / 未放开 user 时用 user，都被拒且说清怎么改', () => {
  const missingProfile = evaluateLarkSegment({
    segment: `lark-cli im +messages-send --as user --text 测试`,
    profileName: PROFILE,
    allowBot: true,
    allowUser: false,
  });
  assert.match(missingProfile, /没有绑定本机器人在 lark-cli 里的 profile/);
  assert.match(missingProfile, new RegExp(PROFILE), '要告诉模型正确的 profile 名');

  const missingIdentity = evaluateLarkSegment({
    segment: `lark-cli --profile ${PROFILE} im +messages-send --text 测试`,
    profileName: PROFILE,
    allowBot: true,
    allowUser: false,
  });
  assert.match(missingIdentity, /没有显式写身份/);

  const userNotAllowed = evaluateLarkSegment({
    segment: `lark-cli --profile ${PROFILE} im +messages-send --as user --text 测试`,
    profileName: PROFILE,
    allowBot: true,
    allowUser: false,
  });
  assert.match(userNotAllowed, /没有允许用户身份/);

  assert.equal(evaluateLarkSegment({
    segment: `lark-cli --profile ${PROFILE} im +messages-send --as bot --text 测试`,
    profileName: PROFILE,
    allowBot: true,
    allowUser: false,
  }), null);
  assert.equal(evaluateLarkSegment({
    segment: `lark-cli --profile=${PROFILE} im +messages-send --as user --text 测试`,
    profileName: PROFILE,
    allowBot: true,
    allowUser: true,
  }), null, '允许用户身份时放行');
  assert.equal(evaluateLarkSegment({
    segment: `lark-cli --profile ${PROFILE} skills read lark-im`,
    profileName: PROFILE,
    allowBot: true,
    allowUser: false,
  }), null, '本地命令不需要 --as');
});

test('规则本身：两个开关各自独立——只开 user 时 --as bot 同样被拒', () => {
  const botDenied = evaluateLarkSegment({
    segment: `lark-cli --profile ${PROFILE} im +messages-send --as bot --text 测试`,
    profileName: PROFILE,
    allowBot: false,
    allowUser: true,
  });
  assert.match(botDenied, /没有允许应用身份/);

  const userOk = evaluateLarkSegment({
    segment: `lark-cli --profile ${PROFILE} im +messages-send --as user --text 测试`,
    profileName: PROFILE,
    allowBot: false,
    allowUser: true,
  });
  assert.equal(userOk, null, '只开 user 时用户身份照常可用');

  // 都不允许：两种身份都拒（不能因为"默认放行 bot"而漏掉）。
  for (const as of ['bot', 'user']) {
    assert.ok(evaluateLarkSegment({
      segment: `lark-cli --profile ${PROFILE} im +messages-send --as ${as} --text x`,
      profileName: PROFILE,
      allowBot: false,
      allowUser: false,
    }), `都不允许时 --as ${as} 应被拒`);
  }
});

test('会改本机全局状态的写法一律拒绝（profile use / --use / --global / auth logout）', () => {
  for (const segment of [
    `lark-cli profile use ${PROFILE}`,
    `lark-cli profile add --name ${PROFILE} --app-id cli_x --use`,
    `lark-cli --profile ${PROFILE} config strict-mode bot --global`,
    'lark-cli config bind --source openclaw',
    'lark-cli config remove',
    `lark-cli --profile ${PROFILE} auth logout`,
  ]) {
    const reason = evaluateLarkSegment({ segment, profileName: PROFILE, allowBot: true, allowUser: false });
    assert.ok(reason, `应拒绝：${segment}`);
  }
});

test('门禁：不是聊天会话 / 不是本渠道 / 不是 shell 工具，一概不管', async () => {
  const guard = createGuard();
  assert.equal(await guard.evaluate({ name: 'read', arguments: { file_path: 'x' } }), null);
  assert.equal(await guard.evaluate(bashCall('lark-cli im +messages-send --as user', { sessionId: 'session-other' })), null,
    '别人（比如用户自己的 DSH 会话）跑 lark-cli 不管');
  assert.equal(await guard.evaluate(bashCall('lark-cli im +messages-send --as user', { sessionId: null })), null);
  assert.equal(await guard.evaluate(bashCall('echo hi')), null, '不含 lark-cli 的命令不管');
  const otherChannel = createGuard({ channelId: 'weixin' });
  assert.equal(await otherChannel.evaluate(bashCall('lark-cli im +messages-send --as user')), null,
    '别的渠道的会话不该被飞书的门禁管');
});

test('门禁：真机那次调用会被拦下（缺 profile 且用了 user）', async () => {
  const guard = createGuard();
  const decision = await guard.evaluate(bashCall(
    'lark-cli im +messages-send --as user --user-id ou_57e2802e4fd41d50e86eaf9ef59c125a --text "测试" 2>&1 | head -40',
  ));
  assert.equal(decision?.kind, 'deny');
  assert.match(decision.reason, new RegExp(PROFILE));
  assert.equal(decision.botId, BOT_ID);
});

test('门禁：未放开 user 时即使补了 profile，--as user 仍然被拒；放开后才放行', async () => {
  const closed = createGuard({ allowBot: true, allowUser: false });
  const denied = await closed.evaluate(bashCall(`lark-cli --profile ${PROFILE} im +messages-send --as user --text x`));
  assert.equal(denied?.kind, 'deny');
  assert.match(denied.reason, /没有允许用户身份/);

  const open = createGuard({ allowBot: true, allowUser: true });
  assert.equal(
    await open.evaluate(bashCall(`lark-cli --profile ${PROFILE} im +messages-send --as user --text x`)),
    null,
  );
});

test('门禁：策略按**会话**解析——A 群放开的用户身份不会泄漏到 B 群', async () => {
  const A = 'session-group-a';
  const B = 'session-group-b';
  const guard = createLarkCliGuard({
    channelId: 'feishu',
    locate: (sessionId) => (sessionId === A || sessionId === B
      ? { channelId: 'feishu', botId: BOT_ID, key: sessionId === A ? 'group:oc_A' : 'group:oc_B' }
      : undefined),
    // 真控制器里这一步是 resolveLarkIdentity(...)：只有 oc_A 配了"允许用户身份"。
    policyFor: async (owner) => ({
      allowBot: true,
      allowUser: owner.key === 'group:oc_A',
      profileName: PROFILE,
    }),
    logger: silentLogger,
  });
  const command = `lark-cli --profile ${PROFILE} im +messages-send --as user --text x`;
  assert.equal(await guard.evaluate(bashCall(command, { sessionId: A })), null, 'A 群放行');
  const denied = await guard.evaluate(bashCall(command, { sessionId: B }));
  assert.equal(denied?.kind, 'deny', 'B 群没配，必须拦下——这是分层策略最容易漏的地方');
  assert.match(denied.reason, /没有允许用户身份/);
});

test('门禁：复合命令逐个检查（前面那段合规，后面那段照样拦）', async () => {
  const guard = createGuard();
  const decision = await guard.evaluate(bashCall(
    `lark-cli --profile ${PROFILE} skills read lark-im && lark-cli im +messages-send --text 测试`,
  ));
  assert.equal(decision?.kind, 'deny', '第二段没带 profile/身份，必须拦');
});

test('门禁：策略从运行期读（改完设置立刻生效，不用重启）', async () => {
  let allowUser = false;
  const guard = createGuard({ policyFor: async () => ({ allowBot: true, allowUser, profileName: PROFILE }) });
  const command = `lark-cli --profile ${PROFILE} im +messages-send --as user --text x`;
  assert.equal((await guard.evaluate(bashCall(command)))?.kind, 'deny');
  allowUser = true;
  assert.equal(await guard.evaluate(bashCall(command)), null, '设置页一改，下一次调用就按新策略判');
});

test('门禁：拿不到策略时不动手（避免误拦一切）', async () => {
  const guard = createGuard({ policyFor: async () => null });
  assert.equal(await guard.evaluate(bashCall('lark-cli im +messages-send --as user --text x')), null);
});

/**
 * 真机现场：拉起 dsh 的环境 PATH 里没有 `~/.local/bin` → 解析 profile 失败 →
 * 策略是 `{ profileName: null }`。这时**不能放行**（放行 = 用这台机器上当前生效的那份授权说话），
 * 但本机自查类命令要留着，否则模型连"为什么失败"都查不了。
 */
test('门禁：有策略但解析不到 profile 时失败关闭（只放本机自查命令）', async () => {
  const guard = createGuard({
    policyFor: async () => ({ allowBot: true, allowUser: true, profileName: null }),
  });
  const denied = await guard.evaluate(bashCall('lark-cli im +messages-send --as bot --text x'));
  assert.equal(denied?.kind, 'deny', '没有 profile 就不能保证"只用本应用自己的授权"');
  assert.match(denied.reason, /解析不到这台飞书机器人在 lark-cli 里的 profile/);
  assert.match(denied.reason, /~\/\.local\/bin/, '要给出可行动的修法');
  assert.equal(await guard.evaluate(bashCall('lark-cli profile list')), null, '本机自查命令仍然放行');
  assert.equal(await guard.evaluate(bashCall('lark-cli --help')), null);
  assert.equal(await guard.evaluate(bashCall('echo hi')), null, '不是 lark-cli 的命令不管');
});
