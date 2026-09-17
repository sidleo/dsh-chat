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

import { createLarkGateway } from '../packages/dsh-chat-feishu/host/lark-gateway.mjs';

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
