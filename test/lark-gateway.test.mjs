/**
 * 飞书网关的收发原语：上传接口的返回形状最容易踩坑——
 * `im/v1/files`、`im/v1/images` 直接返回 `{ file_key }` / `{ image_key }`，
 * 不像 `im/v1/messages` 那样包一层 `{ code, msg, data }`。真机上就是这么翻的车：
 * 上传其实成功了，代码却读 `data.file_key` 拿到 undefined，报"没有返回 file_key"。
 *
 * 这里用一个假 SDK 把两种形状都钉住。
 */

import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createLarkGateway,
  resolveConnectTimeoutMs,
} from '../packages/dsh-chat-feishu/host/lark-gateway.mjs';

const silentLogger = { info() {}, warn() {}, error() {} };

/** 极简假 SDK：只实现网关用到的那几个方法。 */
function createFakeSdk({ upload = 'data', createReturns = {} } = {}) {
  const calls = { uploadFiles: [], uploadImages: [], created: [], downloads: [] };
  const client = {
    im: {
      v1: {
        file: {
          create: async (payload) => {
            calls.uploadFiles.push(payload);
            if ('fileCreate' in createReturns) return createReturns.fileCreate;
            // 真实 SDK：直接返回 data
            return upload === 'data' ? { file_key: 'file_v3_1' } : { data: { file_key: 'file_v3_1' } };
          },
        },
        image: {
          create: async (payload) => {
            calls.uploadImages.push(payload);
            if ('imageCreate' in createReturns) return createReturns.imageCreate;
            return upload === 'data' ? { image_key: 'img_v3_1' } : { data: { image_key: 'img_v3_1' } };
          },
        },
        message: {
          create: async (payload) => {
            calls.created.push(payload);
            return { code: 0, msg: 'success', data: { message_id: 'om_1' } };
          },
          get: async (payload) => {
            calls.messageGets = calls.messageGets ?? [];
            calls.messageGets.push(payload);
            if ('messageGet' in createReturns) return createReturns.messageGet;
            return {
              code: 0,
              msg: 'success',
              data: {
                items: [{
                  message_id: 'om_parent',
                  msg_type: 'text',
                  sender: { id: 'ou_sender' },
                  body: { content: JSON.stringify({ text: '昨天销售额多少？' }) },
                }],
              },
            };
          },
        },
      },
    },
  };
  const sdk = {
    Client: function Client() { return client; },
    WSClient: function WSClient() {},
    Domain: { Lark: 'lark' },
    LoggerLevel: { info: 3 },
    __calls: calls,
  };
  return sdk;
}

function makeGateway(sdk) {
  return createLarkGateway({
    appId: 'cli_x', appSecret: 'secret', sdk, logger: silentLogger,
  });
}

test('上传文件：两种返回形状都要能拿到 file_key，并按扩展名给 file_type', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-chat-lark-'));
  try {
    const xlsx = join(dir, '日报.xlsx');
    await writeFile(xlsx, Buffer.alloc(128, 1));

    for (const shape of ['data', 'wrapped']) {
      const sdk = createFakeSdk({ upload: shape });
      const result = await makeGateway(sdk).sendFile({ openId: 'ou_1', path: xlsx, name: '日报.xlsx' });
      assert.equal(result.messageId, 'om_1', shape);
      assert.equal(result.fileKey, 'file_v3_1', shape);
      assert.equal(result.size, 128, shape);
      assert.equal(sdk.__calls.uploadFiles[0].data.file_type, 'xls', '.xlsx 要走 xls');
      assert.equal(sdk.__calls.uploadFiles[0].data.file_name, '日报.xlsx');
      assert.ok(sdk.__calls.uploadFiles[0].data.file, '要传文件流');
      assert.equal(sdk.__calls.created[0].data.msg_type, 'file');
      assert.equal(sdk.__calls.created[0].params.receive_id_type, 'open_id');
      assert.deepEqual(JSON.parse(sdk.__calls.created[0].data.content), { file_key: 'file_v3_1' });
    }

    // 群聊走 chat_id；未知扩展名回落 stream
    const txt = join(dir, 'note.txt');
    await writeFile(txt, 'hi');
    const sdk2 = createFakeSdk();
    await makeGateway(sdk2).sendFile({ chatId: 'oc_1', path: txt, name: 'note.txt' });
    assert.equal(sdk2.__calls.uploadFiles[0].data.file_type, 'stream');
    assert.equal(sdk2.__calls.created[0].params.receive_id_type, 'chat_id');
    assert.equal(sdk2.__calls.created[0].data.receive_id, 'oc_1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('上传图片：返回形状同样两种都认，消息类型是 image', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-chat-lark-'));
  try {
    const png = join(dir, 'chart.png');
    await writeFile(png, Buffer.from([0x89, 0x50]));
    for (const shape of ['data', 'wrapped']) {
      const sdk = createFakeSdk({ upload: shape });
      const result = await makeGateway(sdk).sendImage({ openId: 'ou_1', path: png });
      assert.equal(result.messageId, 'om_1', shape);
      assert.equal(result.imageKey, 'img_v3_1', shape);
      assert.equal(sdk.__calls.uploadImages[0].data.image_type, 'message');
      assert.equal(sdk.__calls.created[0].data.msg_type, 'image');
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('上传没给 key：抛可读错误，绝不假装发送成功', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-chat-lark-'));
  try {
    const file = join(dir, 'a.txt');
    await writeFile(file, 'x');
    const sdk = createFakeSdk({ createReturns: { fileCreate: { code: 99, msg: 'boom' } } });
    await assert.rejects(
      () => makeGateway(sdk).sendFile({ openId: 'ou_1', path: file }),
      (error) => error.code === 'feishu/upload-failed' && /没有返回 file_key/.test(error.message),
    );
    assert.equal(sdk.__calls.created.length, 0, '上传失败就不能再发消息');

    const sdk2 = createFakeSdk({ createReturns: { imageCreate: null } });
    await assert.rejects(
      () => makeGateway(sdk2).sendImage({ openId: 'ou_1', path: file }),
      (error) => error.code === 'feishu/upload-failed',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('提问元素：已答的给"提问 · 题 → 答案"行，未答的给面板外的控件', () => {
  const gateway = makeGateway(createFakeSdk());
  const questions = [
    { id: 'q1', header: '选一个', question: '选一个', options: [{ label: 'A' }] },
    { id: 'q2', header: '再选', question: '再选', options: [{ label: 'B' }] },
  ];

  // 一题已答、还有一题要答 → 已答成行（给工具面板用），控件在面板外
  const partial = gateway.renderQuestionElements({
    questions, answered: { q1: { selected: ['A'] } }, final: false,
  });
  assert.deepEqual(partial.rows, [{ id: 'q1', text: '提问 · 选一个 → A' }]);
  assert.equal(partial.current.id, 'q2');
  assert.ok(partial.elements.some((element) => element.tag === 'button'), '未答的题给控件');

  // 全部答完 → 只有行，没有控件
  const done = gateway.renderQuestionElements({
    questions, answered: { q1: { selected: ['A'] }, q2: { selected: ['B'] } }, final: true,
  });
  assert.equal(done.current, null);
  assert.equal(done.elements.length, 0, '答完不再有控件');
  assert.deepEqual(done.rows.map((row) => row.id), ['q1', 'q2']);
  assert.match(done.rows[1].text, /再选 → B/);
});

test('授权元素：待处理给按钮，决定后给工具面板行', () => {
  const gateway = makeGateway(createFakeSdk());
  const request = { id: 'approval-1', toolName: 'bash', reason: '刷新 yh_bigdata 登录态' };

  const pending = gateway.renderApprovalElements({ request });
  assert.equal(pending.current.id, 'approval-1');
  assert.equal(pending.rows.length, 0);
  const buttons = pending.elements.filter((element) => element.tag === 'button');
  assert.deepEqual(buttons.map((button) => button.text.content), ['允许一次', '拒绝']);
  assert.deepEqual(
    buttons.map((button) => button.behaviors[0].value.decision),
    ['allowed-once', 'rejected'],
  );
  assert.deepEqual(
    buttons.map((button) => button.behaviors[0].value.approvalId),
    ['approval-1', 'approval-1'],
  );

  const done = gateway.renderApprovalElements({ request, decision: 'allowed-once' });
  assert.deepEqual(done.rows, [{ id: 'approval-1', text: '授权 · bash → 已允许' }]);
  assert.equal(done.current, null);
  assert.deepEqual(done.elements, []);
});

test('独立提问卡：已答的行自己组成 `❓ N/M 已回答` 折叠面板，默认收起可展开', async () => {
  const sdk = createFakeSdk();
  const gateway = makeGateway(sdk);
  const questions = [
    { id: 'q1', header: '选一个', question: '选一个', options: [{ label: 'A' }] },
    { id: 'q2', header: '再选', question: '再选', options: [{ label: 'B' }] },
  ];

  await gateway.sendQuestionsCard({
    openId: 'ou_1', questions,
    answered: { q1: { selected: ['A'] }, q2: { selected: ['B'] } }, final: true,
  });
  const card = JSON.parse(sdk.__calls.created.at(-1).data.content);
  const panel = card.body.elements.find((element) => element.tag === 'collapsible_panel');
  assert.equal(panel.header.title.content, '❓ 2/2 已回答');
  assert.equal(panel.header.title.tag, 'plain_text');
  assert.equal(panel.expanded, false, '答完默认收起');
  assert.match(JSON.stringify(panel), /提问 · 选一个 → A/, '收起也能展开回看');
});

test('交付物：一条消息，图片在上、文件在附件区，正文不含任何文字', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-chat-lark-deliver-'));
  try {
    const md = join(dir, 'report.md');
    const csv = join(dir, 'data.csv');
    const png = join(dir, 'chart.png');
    await writeFile(md, '# report', 'utf8');
    await writeFile(csv, 'a,b\n', 'utf8');
    await writeFile(png, Buffer.from([0x89, 0x50]));

    const sdk = createFakeSdk();
    const gateway = makeGateway(sdk);
    const result = await gateway.sendDeliverables({
      chatId: 'oc_1',
      items: [
        // 故意把文件放在图片前面：渲染顺序必须被重排成"图片在前、文件在后"
        { path: md, description: '测试笔记' },
        { path: csv },
        { path: png, name: 'chart.png' },
      ],
    });

    assert.deepEqual(result.files, ['report.md', 'data.csv']);
    assert.deepEqual(result.images, ['chart.png']);
    assert.deepEqual(result.failed, []);

    // 只发了一条消息
    assert.equal(sdk.__calls.created.length, 1);
    const created = sdk.__calls.created[0];
    assert.equal(created.data.msg_type, 'post');
    const content = JSON.parse(created.data.content);
    // 图片按图片发（正文里的 img），并且排在前面
    assert.deepEqual(content.zh_cn.content, [[{ tag: 'img', image_key: 'img_v3_1' }]]);
    assert.equal(sdk.__calls.uploadImages.length, 1, '图片走图片上传，不走文件上传');
    // 文件在附件区（附件区渲染在正文下面 → 图片在上、文件在下）
    assert.deepEqual(content.files, [{ key: 'file_v3_1' }, { key: 'file_v3_1' }]);
    assert.doesNotMatch(JSON.stringify(content), /report\.md|测试笔记/, '不要文件名/描述文字');

    // 全部失败时不发空消息
    const broken = createFakeSdk({ createReturns: { fileCreate: {} } });
    const empty = await makeGateway(broken).sendDeliverables({
      chatId: 'oc_1', items: [{ path: md }],
    });
    assert.equal(empty.messageId, null);
    assert.equal(empty.failed.length, 1);
    assert.equal(broken.__calls.created.length, 0, '什么都没发出去就不要发空消息');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('延迟更新：Card 1.0 必须带 open_ids、2.0 不用；两者都打到 card/update', async () => {
  const sdk = createFakeSdk();
  const requests = [];
  // 假 SDK 的 Client 实例挂 domain/request（真实 SDK 的 Client 就是这两个能力）。
  const original = sdk.Client;
  sdk.Client = function Client() {
    const instance = original();
    instance.domain = 'https://open.feishu.cn';
    instance.request = async (payload) => {
      requests.push(payload);
      return { code: 0, msg: 'success', data: {} };
    };
    return instance;
  };
  const gateway = makeGateway(sdk);

  // 2.0：不需要 open_ids。
  await gateway.updateCard({
    token: 'tk1',
    card: { schema: '2.0', header: {}, body: { elements: [] } },
  });
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /\/open-apis\/interactive\/v1\/card\/update$/);
  assert.equal(requests[0].data.token, 'tk1');
  assert.equal(requests[0].data.card.open_ids, undefined);

  // 1.0：带 open_ids 才发得出去（飞书要求，否则 300090）。
  await gateway.updateCard({
    token: 'tk2',
    card: { header: {}, elements: [] },
    openIds: ['ou_operator'],
  });
  assert.deepEqual(requests[1].data.card.open_ids, ['ou_operator']);

  // 1.0 忘了 open_ids：本地就拦住，并且给的是可读原因。
  await assert.rejects(
    () => gateway.updateCard({ token: 'tk3', card: { header: {}, elements: [] } }),
    (error) => error.code === 'feishu/missing-open-ids',
  );
  // 没有 token 也不行（调用方应退回 patchCard 或新发一张）。
  await assert.rejects(
    () => gateway.updateCard({ token: '', card: { schema: '2.0' } }),
    (error) => error.code === 'feishu/no-card-token',
  );
});

test('网关：读被引用消息的正文（文字 / 富文本 / 媒体只给类型与文件名）', async () => {
  const sdk = createFakeSdk();
  const gateway = makeGateway(sdk);

  const text = await gateway.getMessageText({ messageId: 'om_parent' });
  assert.deepEqual(text, {
    messageId: 'om_parent',
    senderId: 'ou_sender',
    kind: 'text',
    text: '昨天销售额多少？',
    fileName: null,
  });

  // 富文本：只取文字部分，链接取 href。
  sdk.__calls.messageGets = [];
  const sdkPost = createFakeSdk({
    createReturns: {
      messageGet: {
        code: 0,
        msg: 'success',
        data: {
          items: [{
            message_id: 'om_post',
            msg_type: 'post',
            sender: { id: 'ou_a' },
            body: { content: JSON.stringify({ content: [[{ tag: 'text', text: '看这个' }, { tag: 'a', href: 'https://x' }]] }) },
          }],
        },
      },
    },
  });
  const post = await makeGateway(sdkPost).getMessageText({ messageId: 'om_post' });
  assert.equal(post.text, '看这个 https://x');

  // 媒体：不下载历史附件，只给类型与文件名。
  const sdkImage = createFakeSdk({
    createReturns: {
      messageGet: {
        code: 0,
        msg: 'success',
        data: {
          items: [{
            message_id: 'om_img',
            msg_type: 'image',
            sender: { id: 'ou_b' },
            body: { content: JSON.stringify({ image_key: 'img_x' }) },
          }],
        },
      },
    },
  });
  const image = await makeGateway(sdkImage).getMessageText({ messageId: 'om_img' });
  assert.equal(image.kind, 'image');
  assert.equal(image.text, '');
  assert.equal(image.fileName, null);

  // 读不到（被删除/无权限）：抛错，由调用方转成"引用内容不可用"。
  const sdkGone = createFakeSdk({
    createReturns: { messageGet: { code: 230002, msg: 'message not found' } },
  });
  await assert.rejects(
    () => makeGateway(sdkGone).getMessageText({ messageId: 'om_gone' }),
    (error) => /读取被引用的消息|message not found/.test(error.message),
  );
});

test('网关：读合并转发的原始条目（扁平数组，子消息靠 upper_message_id 指回父级）', async () => {
  const items = [
    { message_id: 'om_merge', msg_type: 'merge_forward' },
    {
      message_id: 'om_sub',
      upper_message_id: 'om_merge',
      msg_type: 'text',
      body: { content: JSON.stringify({ text: '被合并进来的话' }) },
    },
  ];
  const sdk = createFakeSdk({
    createReturns: { messageGet: { code: 0, msg: 'success', data: { items } } },
  });
  const fetched = await makeGateway(sdk).getMessageItems({ messageId: 'om_merge' });
  assert.deepEqual(fetched, items);
  // 打的是同一个接口：路径里带的必须是那条外壳消息的 id。
  assert.deepEqual(sdk.__calls.messageGets.at(-1), { path: { message_id: 'om_merge' } });

  // 没有 items 时给空数组（调用方靠"空"决定给"没有可读内容"标记，而不是崩掉）。
  const sdkEmpty = createFakeSdk({
    createReturns: { messageGet: { code: 0, msg: 'success', data: {} } },
  });
  assert.deepEqual(await makeGateway(sdkEmpty).getMessageItems({ messageId: 'om_x' }), []);

  // 业务失败（HTTP 200 + code!==0）必须抛，不能把失败当"这包是空的"。
  const sdkFail = createFakeSdk({
    createReturns: { messageGet: { code: 230002, msg: 'message not found' } },
  });
  await assert.rejects(
    () => makeGateway(sdkFail).getMessageItems({ messageId: 'om_gone' }),
    (error) => /message not found/.test(error.message),
  );

  await assert.rejects(
    () => makeGateway(createFakeSdk()).getMessageItems({ messageId: '' }),
    (error) => error instanceof TypeError,
  );
});

/**
 * 启动等待的判据：等的是**首个成功握手信号**，不是"第一次尝试的结果"。
 *
 * 真机现场（`~/.dsh/integrations/dsh-chat/logs/feishu.log`，2026-10-05）：
 *   ENOTFOUND open.feishu.cn → SDK 自己 `reconnect` → 3 秒后 ws client ready
 * 而旧实现抢在第 3 秒之前用 15s 计时器判了「启动失败」，把这台本来会自愈的机器人掐了。
 * 下面这组用例把"抖动必须自愈"与"真失败必须报错"两条都钉死。
 */

/** 可编排的假 WSClient：由用例决定 onReady / onError 何时、以什么顺序触发。 */
function createScriptedSdk(script) {
  const created = [];
  function WSClient(options) {
    created.push(options);
    return {
      start() {
        return Promise.resolve().then(() => script(options, created.length));
      },
    };
  }
  return {
    Client: function Client() { return { im: { v1: {} } }; },
    WSClient,
    EventDispatcher: function EventDispatcher() { return { register: () => ({}) }; },
    Domain: { Lark: 'lark' },
    LoggerLevel: { info: 3 },
    __created: created,
  };
}

test('瞬时抖动必须自愈：先 onError 再 onReconnected，connect() 要以成功收尾', async () => {
  const sdk = createScriptedSdk((options) => {
    // 模拟 SDK 的重连过程：第一次握手失败 → 自己重试 → 成功。
    options.onError(new Error('getaddrinfo ENOTFOUND open.feishu.cn'));
    options.onReconnecting?.();
    options.onReconnected?.();
  });
  const gateway = createLarkGateway({
    appId: 'cli_x', appSecret: 'secret', sdk, logger: silentLogger,
  });

  await gateway.connect({}); // 旧实现会在这里抛「长连接失败」并把连接掐掉
  assert.equal(gateway.isConnected(), true, '自愈之后必须算作已连接');
  assert.equal(gateway.lastError(), null, '连上之后不该再留着上一次的错误');
});

test('终态失败（start 直接抛错）仍要如实报出去，不能假装连上', async () => {
  const sdk = createScriptedSdk(() => { throw new Error('凭据形状不对'); });
  const gateway = createLarkGateway({
    appId: 'cli_x', appSecret: 'secret', sdk, logger: silentLogger,
  });

  await assert.rejects(() => gateway.connect({}), /凭据形状不对/);
  assert.equal(gateway.isConnected(), false);
});

test('等待上限到点要报失败，并把最近一次底层错误带进消息里', async () => {
  // 一直不成功：既没有 onReady，也没有 onReconnected。
  const sdk = createScriptedSdk((options) => {
    options.onError(new Error('getaddrinfo ENOTFOUND open.feishu.cn'));
  });
  const gateway = createLarkGateway({
    // 传 60 会被下限钳到 1s（见上面的参数用例），这里正好顺带证明下限真的生效。
    appId: 'cli_x', appSecret: 'secret', sdk, logger: silentLogger, connectTimeoutMs: 60,
  });

  await assert.rejects(
    () => gateway.connect({}),
    (error) => {
      assert.equal(error.code, 'feishu/connect-timeout');
      // "失败必须可见"：光说"未就绪"没法让人判断是网络还是配置。
      assert.match(error.message, /ENOTFOUND/);
      assert.match(error.message, /DSH_CHAT_FEISHU_CONNECT_TIMEOUT_MS/);
      return true;
    },
  );
  assert.equal(gateway.isConnected(), false);
});

test('超时参数：不传走默认，非法值被忽略，越界值被钳制', () => {
  const cases = [
    { raw: undefined, expect: 150_000 },
    { raw: null, expect: 150_000 },
    { raw: '', expect: 150_000 },
    { raw: 'abc', expect: 150_000 },
    { raw: '1500', expect: 1_500 },
    { raw: 2_500, expect: 2_500 },
    { raw: '1', expect: 1_000 },          // 低于下限 → 钳到 1s
    { raw: '99999999', expect: 900_000 }, // 高于上限 → 钳到 15min
  ];
  for (const { raw, expect } of cases) {
    assert.equal(resolveConnectTimeoutMs(raw), expect, `raw=${String(raw)}`);
  }
});
