/**
 * 飞书「扫码新建」时预填给用户的应用清单：权限、事件订阅、卡片回调。
 *
 * 为什么要有这个文件：SDK 的 `registerApp` 支持 `addons`，它把清单**预填进扫码后的确认页**
 * ——用户在飞书里扫一下、在确认页点一次确认，这些权限就一起开通了；不带它就只能建出一个
 * 什么权限都没有的空应用，用户还得自己去开放平台逐个勾选（本仓库早期就是这样，
 * 真机上表现为"扫码建好了、一发消息就缺权限"，只能靠设置页那串开通链接救场）。
 *
 * ⚠️ 两条平台口径（照 `@larksuiteoapi/node-sdk` 1.73.0 README 的「一键创建应用」节）：
 * - **平台只校验数据形状、不校验权限点是否存在**：写错的 id 会被确认页**静默忽略**，
 *   "明明声明了、怎么还是没权限"就是这么来的。改这份清单必须对着开放平台权限目录核实，
 *   不能凭印象拼 id。
 * - `addons` 只能**增量叠加公开配置**（应用/用户身份权限、事件、回调）；事件**订阅方式（长连接）**、
 *   回调地址、加密 key 属敏感配置，传不了，仍要在开放平台里人工确认。
 *
 * 清单口径 = **本渠道代码真的会调的接口**（见 `lark-gateway.mjs`），不"顺手多要"：
 * 多要来的数据面（通讯录全员、云文档、日历）只会扩大暴露面，也让管理员更难批。
 *
 * @module dsh-chat-feishu/app-manifest
 */

/**
 * 租户（应用身份）权限：每一行都对应 `lark-gateway.mjs` 里一处真实调用，
 * 删掉哪一行就会出现对应的"缺权限"降级（表情打不上 / 白名单只有 id / 图片发不出）。
 */
export const FEISHU_APP_TENANT_SCOPES = Object.freeze([
  // 收消息（事件 `im.message.receive_v1` 的准入权限，三个场景各一条）
  'im:message.p2p_msg:readonly', // 私聊消息
  'im:message.group_at_msg:readonly', // 群里 @ 机器人
  'im:message.group_at_msg.include_bot:readonly', // 群里其它机器人 @ 机器人
  // 消息本身
  'im:message:readonly', // 读消息正文 / 下载消息里的图片与文件
  'im:message:send_as_bot', // 发消息、回消息、更新卡片
  'im:message.reactions:write_only', // 「在做了」表情（缺了不致命，但表情一直打不上）
  // 资源
  'im:resource', // 上传机器人要发的图片 / 文件
  // 把 id 换成名字（白名单、投递目标；查不到时设置页只能显示一串 ou_…）
  'im:chat:readonly', // 群名、群成员
  'contact:user.base:readonly', // 人名
]);

/** 收消息事件（长连接推过来的就是它）。 */
export const FEISHU_APP_EVENTS = Object.freeze(['im.message.receive_v1']);

/** 卡片回调（卡片上的按钮/下拉点了之后要靠它回来；缺了就是"点了没反应"）。 */
export const FEISHU_APP_CALLBACKS = Object.freeze(['card.action.trigger']);

/** 预填到确认页的应用信息（扫码的人仍可在页面上改）。`{user}` 会换成扫码人的名字。 */
export const FEISHU_APP_PRESET = Object.freeze({
  name: '{user} 的 DSH 助手',
  desc: '连接飞书与 DeepSeek Harness，在聊天里使用 AI 助手。',
});

/**
 * 扫码新建时交给 SDK `registerApp` 的参数。
 *
 * `createOnly: true` 是**安全项**：没有它，落地页会让用户选"创建新应用 / 更新已有应用"，
 * 误选一台正在用的应用并确认，就会去改那台应用的配置（这条路是"新建"，不该碰别人的应用）。
 */
export const FEISHU_SCAN_REGISTER_OPTIONS = Object.freeze({
  createOnly: true,
  appPreset: FEISHU_APP_PRESET,
  addons: Object.freeze({
    // `preset: false` = 不要平台的默认模板，从「仅机器人能力、无业务权限」起，
    // 确认页上就只是上面声明的这几项（默认模板里有什么、版本间会不会变，我们不去猜）。
    preset: false,
    scopes: Object.freeze({ tenant: FEISHU_APP_TENANT_SCOPES }),
    events: Object.freeze({ items: Object.freeze({ tenant: FEISHU_APP_EVENTS }) }),
    callbacks: Object.freeze({ items: FEISHU_APP_CALLBACKS }),
  }),
});
