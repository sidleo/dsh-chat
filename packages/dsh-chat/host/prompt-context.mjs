/**
 * 把"本会话的增强提示词"注入成**系统提示词的一段**（而不是拼在用户消息前面）。
 *
 * 背景：`dsh-chat` 早先是把提示词块 `<dsh_im_source_guidance>…</dsh_im_source_guidance>`
 * 拼在飞书那条消息的正文前面，于是它成了**用户轮次的内容**——每轮重复、占用户消息的上下文、
 * 还可能被模型当成"用户说的话"。现在改成 DSH 的系统提示词段（system 角色），
 * 用户消息里只剩真正的来源块 `<dsh_im_source>{…}</dsh_im_source>`。
 *
 * 作用域：段是**全局注册**的，但文本是**按 agent 求值**的（`AssembleContext.agent`），
 * 所以只有我们自己的会话（`guidance` 登记表里有值的那种）才会渲染出内容——
 * 这台 Host 上其它会话（Web 聊天、子代理…）拿到的还是空字符串，等价于没这一段。
 * 不用 `agent.ctx` 逐 agent 注册：全局一份 + 按 agent 过滤更简单，也不会随 agent 生死来回注册。
 *
 * 顺序：400——排在部署 persona（0）之后、第一方政策（500+）与工具指导（1000+）之前。
 * 这类"在这个群里该怎么说话"的上下文不该盖过第一方政策，所以放在它们前面。
 *
 * @module dsh-chat/host/prompt-context
 */

/** 段名（全局唯一；同名重复注册会抛）。 */
export const SOURCE_GUIDANCE_SECTION = 'dsh-chat:source-guidance';

/** 段顺序（见文件头的取舍）。 */
export const SOURCE_GUIDANCE_ORDER = 400;

/**
 * 从一次组装的上下文里取会话 id。
 *
 * `AssembleContext.agent` 由 `dsh-agent` 扩展提供；诊断类组装可能没有 agent。
 *
 * @param context - 组装上下文 `{ agent? }`。
 * @returns 会话 id 或 null。
 */
function sessionIdOf(context) {
  const agent = context?.agent;
  const id = agent?.id ?? agent?.session?.id;
  return typeof id === 'string' && id ? id : null;
}

/**
 * 注册"增强提示词"这一段。
 *
 * @param ctx - Cordis host 上下文。
 * @param guidance - `createGuidanceRegistry()` 的登记表。
 * @param options - { logger }。
 * @returns 是否真的装上了（false = 当前 Host 没有 `systemPrompt`，调用方要退回前缀注入）。
 */
export function installSourceGuidanceSection(ctx, guidance, { logger = console } = {}) {
  const systemPrompt = typeof ctx?.get === 'function' ? ctx.get('systemPrompt') : ctx?.systemPrompt;
  if (!systemPrompt || typeof systemPrompt.section !== 'function') return false;
  const register = () => systemPrompt.section({
    name: SOURCE_GUIDANCE_SECTION,
    order: SOURCE_GUIDANCE_ORDER,
    // 文本按 agent 现算：登记表里没有这个会话就返回空，空段在渲染时会被丢掉。
    text: (context) => {
      const sessionId = sessionIdOf(context);
      return (sessionId && guidance.get(sessionId)) || '';
    },
  });
  try {
    if (typeof ctx?.effect === 'function') ctx.effect(register, 'dsh-chat: 增强提示词段');
    else register();
  } catch (error) {
    // 注册失败（ctx 已销毁 / 同名段已存在）：当作没装上，由调用方退回前缀注入。
    logger.warn?.(`[dsh-chat] 注册增强提示词段失败：${error?.message ?? error}`);
    return false;
  }
  logger.info?.('[dsh-chat] 增强提示词走系统提示词段（按会话生效，不再拼进用户消息）。');
  return true;
}
