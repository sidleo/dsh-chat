/**
 * lark-cli 调用器：把"只能用自己的授权"钉成可判定的行为。
 *
 * 这里的每一条都对应一个真机上会出事的方向：
 * - 忘了 `--profile` → lark-cli 用"当前生效"的那份授权（可能是别的机器人、甚至别人的用户身份）；
 * - 省略 `--as` → lark-cli 自己挑身份（lark-shared 原话：不可控）；
 * - 想"重试一下"就去掉 `--profile` → 从"用错授权"升级成"静默用错授权"。
 *
 * **测试绝不真跑 lark-cli**（会动用户真实的 profile），执行器一律注入假替身。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLarkCli, normalizeLarkUserIdentity, profileNameFor,
} from '../packages/dsh-chat-feishu/host/lark-cli.mjs';

const silentLogger = { info() {}, warn() {}, error() {} };

const APP_ID = 'cli_a1b2c3d4e5f6g7h8';
const OTHER_APP_ID = 'cli_zzzzzzzzzzzzzzzz';
const OWN_PROFILE = profileNameFor(APP_ID);
const USER_OPEN_ID = 'ou_2b7e4d1a9c6f3058e2a4b6c8d0f1e3a5';

/** 假执行器：记下每次调用的 argv/env/stdin，并按方法名给出回答。 */
function createFakeRunner(reply) {
  const calls = [];
  const runner = async ({ bin, args, env, cwd, input }) => {
    calls.push({ bin, args, env, cwd, input });
    const answer = reply({ args, env, input, index: calls.length - 1 }) ?? {};
    if (answer.throws) throw answer.throws;
    const stdout = answer.raw !== undefined
      ? answer.raw
      : JSON.stringify(answer.json ?? { ok: true });
    return { code: answer.code ?? 0, stdout, stderr: answer.stderr ?? '' };
  };
  return { runner, calls };
}

/** 默认回答：profile list 里有自己的 profile；whoami 报自己。 */
function defaultReply({
  appId = APP_ID, profileName = OWN_PROFILE, profileList = null, whoami = null, strictMode = null,
} = {}) {
  return ({ args }) => {
    if (args.includes('profile') && args.includes('list')) {
      return {
        json: profileList ?? [{
          name: profileName,
          appId,
          brand: 'feishu',
          user: '张三',
          tokenStatus: 'valid',
          active: false,
          effective: false,
        }],
      };
    }
    if (args.includes('whoami')) {
      const as = args[args.indexOf('--as') + 1];
      if (whoami) return whoami({ as, args });
      return as === 'user'
        ? { json: { appId, identity: 'user', available: true, tokenStatus: 'ready', onBehalfOf: { userName: '张三', openId: USER_OPEN_ID } } }
        : { json: { appId, identity: 'bot', available: true, tokenStatus: 'ready' } };
    }
    if (args.includes('strict-mode')) {
      return strictMode ?? { raw: 'strict-mode: off (source: global (default))\n' };
    }
    if (args.includes('add')) return { json: { ok: true } };
    return { json: { ok: true, data: {} } };
  };
}

function createCli(overrides = {}) {
  const fake = createFakeRunner(overrides.reply ?? defaultReply(overrides.replyOptions));
  const cli = createLarkCli({
    appId: APP_ID,
    brand: 'feishu',
    secretRef: 'DSH_FEISHU_APP_SECRET',
    resolveSecret: overrides.resolveSecret ?? (async () => 'app-secret-value'),
    identityPolicy: overrides.identityPolicy ?? (() => ({ mode: 'bot-only', userOpenId: null })),
    runner: fake.runner,
    spawnStream: overrides.spawnStream,
    logger: silentLogger,
    env: overrides.env ?? { PATH: '/usr/bin', LARK_CHANNEL: '/tmp/other', OPENCLAW_HOME: '/tmp/openclaw' },
  });
  return { cli, ...fake };
}

/** 一次 argv 里出现的 `--profile` 取值（用来断言"到底会用到谁的授权"）。 */
function profilesIn(args) {
  const found = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--profile') found.push(args[index + 1]);
  }
  return found;
}

test('身份策略归一化：认不出来一律 bot-only（保守方向）', () => {
  assert.equal(normalizeLarkUserIdentity('user-allowed'), 'user-allowed');
  assert.equal(normalizeLarkUserIdentity('bot-only'), 'bot-only');
  assert.equal(normalizeLarkUserIdentity('user'), 'bot-only');
  assert.equal(normalizeLarkUserIdentity(undefined), 'bot-only');
  assert.equal(normalizeLarkUserIdentity(true), 'bot-only');
});

test('App ID 形状不对就直接拒绝（连 profile 都不去解析）', () => {
  for (const bad of [undefined, '', 'not-an-app', 'app_1234', ' cli_' + 'x'.repeat(80)]) {
    assert.throws(() => createLarkCli({ appId: bad, logger: silentLogger }), (error) => {
      assert.equal(error.code, 'feishu/lark-cli-appid-required');
      return true;
    });
  }
});

test('发消息：每次调用都带自己的 profile 与 --as bot，且 profile 名由 appId 推出', async () => {
  const { cli, calls } = createCli();
  await cli.sendMessage({ chatId: 'oc_test', text: 'hi' });
  const send = calls.at(-1);
  assert.deepEqual(profilesIn(send.args), [OWN_PROFILE]);
  assert.equal(send.args.at(-2), '--as');
  assert.equal(send.args.at(-1), 'bot');
  assert.ok(send.args.includes('--chat-id') && send.args.includes('oc_test'));
  // `profile list` 必须是**不带** `--profile` 的那一次：发现 profile 时还没有它可用。
  assert.deepEqual(profilesIn(calls[0].args), []);
});

test('省略身份不可控：代表某身份调用的命令一律显式带 --as，绝不省略', async () => {
  const { cli, calls } = createCli();
  await cli.sendMessage({ chatId: 'oc_test', markdown: '**hi**' });
  // 列 profile / 写 strict-mode 这类本地命令不涉及"以谁的名义说话"，其余必须带 --as。
  const local = (args) => (args[0] === 'profile') || (args[0] === 'config' && args[1] === 'strict-mode');
  for (const call of calls.filter((item) => !local(item.args))) {
    assert.ok(call.args.includes('--as'), `缺 --as：${call.args.join(' ')}`);
  }
});

test('策略是 bot-only 时请求用户身份：直接拒绝，且一次都不拉起 lark-cli', async () => {
  const { cli, calls } = createCli({ identityPolicy: () => ({ mode: 'bot-only', userOpenId: USER_OPEN_ID }) });
  await assert.rejects(cli.sendMessage({ chatId: 'oc_test', text: 'hi', as: 'user' }), (error) => {
    assert.equal(error.code, 'feishu/lark-cli-user-not-allowed');
    return true;
  });
  assert.equal(calls.length, 0, '拒绝时不该调用 lark-cli');
});

test('允许了用户身份但没钉住人：同样拒绝（开了也不能糊里糊涂用）', async () => {
  const { cli, calls } = createCli({ identityPolicy: () => ({ mode: 'user-allowed', userOpenId: null }) });
  await assert.rejects(cli.assertIdentity({ as: 'user' }), (error) => {
    assert.equal(error.code, 'feishu/lark-cli-user-not-allowed');
    return true;
  });
  assert.equal(calls.length, 0);
});

test('whoami 报的 appId 不是自己：拒绝，且目标命令一次都没执行', async () => {
  const { cli, calls } = createCli({
    replyOptions: { whoami: () => ({ json: { appId: OTHER_APP_ID, identity: 'bot', available: true } }) },
  });
  await assert.rejects(cli.sendMessage({ chatId: 'oc_test', text: 'hi' }), (error) => {
    assert.equal(error.code, 'feishu/lark-cli-app-mismatch');
    return true;
  });
  const ranSend = calls.some((call) => call.args.includes('+messages-send'));
  assert.equal(ranSend, false, '身份不符时不该真的发消息');
  for (const call of calls) {
    assert.deepEqual(profilesIn(call.args).filter((name) => name !== OWN_PROFILE), [],
      '不许用到别人的 profile');
  }
});

test('lark-cli 里只有别的应用：拿不到 secret 时失败，绝不借用那个 profile', async () => {
  const { cli, calls } = createCli({
    resolveSecret: null,
    replyOptions: { appId: OTHER_APP_ID, profileName: 'other-app-profile' },
  });
  await assert.rejects(cli.ensureProfile(), (error) => {
    assert.equal(error.code, 'feishu/lark-cli-profile-unavailable');
    assert.match(error.message, new RegExp(APP_ID));
    return true;
  });
  for (const call of calls) {
    assert.ok(!profilesIn(call.args).includes('other-app-profile'),
      `用到了别人的 profile：${call.args.join(' ')}`);
  }
});

test('自建 profile：secret 只走 stdin、不带 --use，建完只给自己设 strict-mode', async () => {
  // 第一次 list 为空；add 之后再 list 要能看到（否则会判成"建好了却读不到"）。
  let added = false;
  const fake = createFakeRunner(({ args }) => {
    if (args.includes('list')) {
      return { json: added ? [{ name: OWN_PROFILE, appId: APP_ID, brand: 'feishu' }] : [] };
    }
    if (args.includes('add')) {
      added = true;
      return { json: { ok: true } };
    }
    if (args.includes('strict-mode')) return { raw: 'strict-mode: off (source: global (default))\n' };
    if (args.includes('whoami')) return { json: { appId: APP_ID, identity: 'bot', available: true, tokenStatus: 'ready' } };
    return { json: { ok: true } };
  });
  const cli = createLarkCli({
    appId: APP_ID,
    secretRef: 'DSH_FEISHU_APP_SECRET',
    resolveSecret: async () => 'app-secret-value',
    identityPolicy: () => ({ mode: 'bot-only', userOpenId: null }),
    runner: fake.runner,
    logger: silentLogger,
  });
  await cli.ensureProfile();
  const add = fake.calls.find((call) => call.args.includes('add'));
  assert.ok(add, '没有调用 profile add');
  assert.ok(add.args.includes('--app-secret-stdin'));
  assert.ok(!add.args.includes('--use'), 'profile add 不许带 --use（会切换全局生效 profile）');
  assert.equal(add.input, 'app-secret-value', 'secret 必须经 stdin 传');
  for (const call of fake.calls) {
    assert.ok(!call.args.includes('app-secret-value'), 'secret 不许出现在 argv 里');
    assert.ok(!JSON.stringify(call.args).includes('--global'), 'strict-mode 不许写全局');
  }
  const strict = fake.calls.find((call) => call.args.includes('strict-mode') && call.args.includes('bot'));
  assert.ok(strict, 'bot-only 策略下应给自己那个 profile 设 strict-mode=bot');
  assert.deepEqual(profilesIn(strict.args), [OWN_PROFILE]);
});

test('profile 名被别的应用占用：失败并说明，不覆盖别人的 profile', async () => {
  const { cli } = createCli({
    reply: ({ args }) => {
      if (args.includes('list')) {
        return { json: [{ name: OWN_PROFILE, appId: OTHER_APP_ID, brand: 'feishu' }] };
      }
      return { json: { ok: true } };
    },
  });
  await assert.rejects(cli.ensureProfile(), (error) => {
    assert.equal(error.code, 'feishu/lark-cli-profile-unavailable');
    assert.match(error.message, /占用/);
    return true;
  });
});

test('profile 半路消失（lark-cli 报 field=--profile）：按不可用失败，不重试、不降级', async () => {
  const { cli, calls } = createCli({
    reply: ({ args }) => {
      if (args.includes('list')) return { json: [{ name: OWN_PROFILE, appId: APP_ID, brand: 'feishu' }] };
      if (args.includes('whoami')) {
        return {
          code: 3,
          json: {
            ok: false,
            error: { type: 'config', subtype: 'not_configured', field: '--profile', message: 'profile not found' },
          },
        };
      }
      return { json: { ok: true } };
    },
  });
  await assert.rejects(cli.whoami({ as: 'bot' }), (error) => {
    assert.equal(error.code, 'feishu/lark-cli-profile-unavailable');
    assert.ok(error.hint, '要给出可照做的命令');
    return true;
  });
  const whoamiCalls = calls.filter((call) => call.args.includes('whoami'));
  assert.equal(whoamiCalls.length, 1, '这类失败不许重试');
});

test('子进程环境：剔除会切 workspace 的变量，关掉两类提示噪声', async () => {
  const { cli, calls } = createCli();
  await cli.sendMessage({ chatId: 'oc_test', text: 'hi' });
  const { env } = calls.at(-1);
  for (const key of ['LARK_CHANNEL', 'OPENCLAW_HOME', 'HERMES_HOME']) {
    assert.equal(key in env, false, `${key} 不该传给 lark-cli`);
  }
  assert.equal(env.LARKSUITE_CLI_NO_UPDATE_NOTIFIER, '1');
  assert.equal(env.LARKSUITE_CLI_NO_SKILLS_NOTIFIER, '1');
  assert.equal(env.PATH, '/usr/bin', '其余环境照旧继承');
});

test('用户身份匹配：钉住的人对得上才放行，对不上就拒绝且不发消息', async () => {
  const policy = () => ({ mode: 'user-allowed', userOpenId: USER_OPEN_ID });
  const ok = createCli({ identityPolicy: policy });
  await ok.cli.sendMessage({ chatId: 'oc_test', text: 'hi', as: 'user' });
  const sent = ok.calls.at(-1);
  assert.equal(sent.args.at(-1), 'user');
  assert.deepEqual(profilesIn(sent.args), [OWN_PROFILE]);

  const mismatch = createCli({
    identityPolicy: policy,
    replyOptions: {
      whoami: ({ as }) => (as === 'user'
        ? { json: { appId: APP_ID, identity: 'user', available: true, onBehalfOf: { openId: 'ou_someone_else' } } }
        : { json: { appId: APP_ID, identity: 'bot', available: true } }),
    },
  });
  await assert.rejects(mismatch.cli.sendMessage({ chatId: 'oc_test', text: 'hi', as: 'user' }), (error) => {
    assert.equal(error.code, 'feishu/lark-cli-user-mismatch');
    return true;
  });
  assert.equal(mismatch.calls.some((call) => call.args.includes('+messages-send')), false);
});

test('参数不合法：抛可读错误且零调用（不给"拼错参数就真跑一次"的机会）', async () => {
  const { cli, calls } = createCli();
  await assert.rejects(cli.sendMessage({ chatId: 'oc_test' }), (error) => {
    assert.equal(error.code, 'feishu/lark-cli-bad-request');
    return true;
  });
  await assert.rejects(cli.sendMessage({ chatId: 'oc_test', text: 'a', markdown: 'b' }), (error) => {
    assert.equal(error.code, 'feishu/lark-cli-bad-request');
    return true;
  });
  await assert.rejects(cli.consumeEvents({ key: 'bad key!' }), (error) => {
    assert.equal(error.code, 'feishu/lark-cli-bad-request');
    return true;
  });
  assert.equal(calls.length, 0);
});

test('流式消费事件：同样钉住 profile 与身份，且不经 shell', async () => {
  const spawned = [];
  const { cli } = createCli({
    spawnStream: (bin, args, options) => {
      spawned.push({ bin, args, options });
      return { pid: 4242 };
    },
  });
  const child = await cli.consumeEvents({ key: 'im.message.receive_v1', maxEvents: 3, timeoutSeconds: 30 });
  assert.equal(child.pid, 4242);
  const call = spawned.at(-1);
  assert.deepEqual(profilesIn(call.args), [OWN_PROFILE]);
  assert.equal(call.args[call.args.indexOf('--as') + 1], 'bot');
  assert.ok(call.args.includes('--max-events') && call.args.includes('3'));
  assert.ok(call.args.includes('--timeout') && call.args.includes('30s'));
  assert.equal(call.options.shell, false, '绝不走 shell');
});

test('只读体检：profile 不在时如实回 found=false，且不建 profile、不写任何东西', async () => {
  const { cli, calls } = createCli({
    reply: ({ args }) => {
      if (args.includes('list')) return { json: [{ name: 'other', appId: OTHER_APP_ID, brand: 'feishu' }] };
      return { json: { ok: true } };
    },
  });
  const info = await cli.inspect();
  assert.equal(info.profile.found, false);
  assert.equal(info.profile.name, OWN_PROFILE, '要告诉用户"会去建哪个名字的 profile"');
  assert.equal(calls.some((call) => call.args.includes('add')), false, '体检不许写盘');
  assert.equal(calls.some((call) => call.args.includes('whoami')), false);
});

test('只读体检：profile 在时报告 appId 与两个身份', async () => {
  const { cli } = createCli();
  const info = await cli.inspect();
  assert.equal(info.profile.found, true);
  assert.equal(info.profile.appId, APP_ID);
  assert.equal(info.identity.bot.identity, 'bot');
  assert.equal(info.identity.user.onBehalfOf.openId, USER_OPEN_ID);
  assert.deepEqual(info.policy, { mode: 'bot-only', userOpenId: null });
});

test('没装 lark-cli：给一句能照做的错误，而不是 ENOENT 原样抛', async () => {
  const { cli } = createCli({
    reply: () => {
      const error = new Error('spawn lark-cli ENOENT');
      error.code = 'ENOENT';
      return { throws: error };
    },
  });
  await assert.rejects(cli.whoami({ as: 'bot' }), (error) => {
    assert.equal(error.code, 'feishu/lark-cli-missing');
    return true;
  });
});
