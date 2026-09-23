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

/** 段名：交付文件的机制说明（与用户可配置的增强提示词分开）。 */
export const DELIVERABLE_SECTION = 'dsh-chat:deliverables';

/** 段顺序：紧跟增强提示词（400）之后、第一方政策（500+）之前。 */
export const DELIVERABLE_ORDER = 405;

/**
 * 「文件怎么才能发出去」这一段。
 *
 * 真机现场（会话 75cffe0f）：机器人把 SQL 写到磁盘、在答案里写了路径，还给了
 * `[前日销售额查询_20260924.sql](sql/前日销售额查询_20260924.sql)` 这样的**相对链接**，
 * 却**没有调用 `present`** —— 插件手里一份交付声明都没有，用户什么文件也没收到，
 * 聊天里那个相对链接同样点不开。模型**不知道**"只有 present 才会真的发文件"这件事，
 * 所以把机制明说。
 *
 * 为什么单独一段、不并进增强提示词：那一段是**用户可配置的内容**（登记表里有值才渲染），
 * 而这是**机制说明**——只要会话绑在我们某个聊天上就该有，与用户怎么配上下文增强无关。
 *
 * @param ctx - Cordis host 上下文。
 * @param options - { isChatSession, logger }：`isChatSession(sessionId)` 必须**同步**返回布尔。
 * @returns 是否真的装上了（false = 当前 Host 没有 `systemPrompt`）。
 */
export function installDeliverableSection(ctx, { isChatSession, logger = console } = {}) {
  const systemPrompt = typeof ctx?.get === 'function' ? ctx.get('systemPrompt') : ctx?.systemPrompt;
  if (!systemPrompt || typeof systemPrompt.section !== 'function') return false;
  const text = (context) => {
    const sessionId = sessionIdOf(context);
    if (!sessionId) return '';
    let own = false;
    try {
      own = isChatSession?.(sessionId) === true;
    } catch {
      return '';
    }
    if (!own) return '';
    return [
      '把文件交给用户的**唯一**方式是：在**当轮**调用 `present`，在 `files` 里给出文件的**绝对路径**——'
        + '插件会把声明的文件作为附件单独发到这个聊天里。',
      '只在回复里写路径、或写成 `[名字](相对路径)` 这种链接，**一个字节都发不出去**（聊天里的相对链接也点不开）。',
      '所以这轮产出了用户可能要用的文件（报表 / SQL / 图表 / 导出…）就 `present` 一下；'
        + '临时中间文件不用声明，别刷屏。',
    ].join('\n');
  };
  const register = () => systemPrompt.section({
    name: DELIVERABLE_SECTION,
    order: DELIVERABLE_ORDER,
    text,
  });
  try {
    if (typeof ctx?.effect === 'function') ctx.effect(register, 'dsh-chat: 交付文件说明段');
    else register();
  } catch (error) {
    logger.warn?.(`[dsh-chat] 注册交付文件说明段失败：${error?.message ?? error}`);
    return false;
  }
  logger.info?.('[dsh-chat] 交付文件说明已注入系统提示词段（只有本插件的聊天会话有）。');
  return true;
}
