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

test('提问元素：已回答部分的容器标题极简 `❓ N/M 已回答`，答完收起但仍可展开', () => {
  const gateway = makeGateway(createFakeSdk());
  const questions = [
    { id: 'q1', header: '选一个', question: '选一个', options: [{ label: 'A' }] },
    { id: 'q2', header: '再选', question: '再选', options: [{ label: 'B' }] },
  ];

  // 一题已答、还有一题要答 → 面板展开，控件在面板外
  const partial = gateway.renderQuestionElements({
    questions, answered: { q1: { selected: ['A'] } }, final: false,
  });
  const panel = partial.elements.find((element) => element.tag === 'collapsible_panel');
  assert.equal(panel.header.title.content, '❓ 1/2 已回答');
  assert.equal(panel.header.title.tag, 'plain_text');
  assert.equal(panel.expanded, true, '还有题要答时展开对照');
  assert.equal(partial.current.id, 'q2');

  // 全部答完 → 面板收起但仍在卡里（真机要求：收起而不是消失）
  const done = gateway.renderQuestionElements({
    questions, answered: { q1: { selected: ['A'] }, q2: { selected: ['B'] } }, final: true,
  });
  assert.equal(done.current, null);
  const donePanel = done.elements.find((element) => element.tag === 'collapsible_panel');
  assert.equal(donePanel.header.title.content, '❓ 2/2 已回答');
  assert.equal(donePanel.expanded, false);
  assert.match(JSON.stringify(donePanel), /A/, '答过的内容还能展开回看');
});
