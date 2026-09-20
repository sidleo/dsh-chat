/**
 * 控制面板卡片的**显示项**配置。
 *
 * 为什么会需要：控制面板越长越难用——手机上一屏放不下，而每个人想看的项不一样
 * （只想换模型的人不需要看到"访问策略/任务过程展示"）。所以每一项都能关，
 * 而且**私聊与群聊分开**（群里通常只留模型与命令，私聊才摆全套）。
 *
 * 浏览器安全：host 侧（`panel.read` 按这里的规则过滤）与设置页共用这一份实现，
 * 归一化规则不可能前后端漂移。
 *
 * 归一化的方向：**缺项 = 显示**。显示项配置残缺时把卡片变得更空，是"设置页静默失效"
 * 那一类最难查的问题（用户只会觉得"我明明开着"）；反过来多显示一项只是啰嗦。
 *
 * @module dsh-chat/shared/panel-sections
 */

/** 可关闭的显示项（顺序即设置页顺序；标签由 client 侧按 key 翻译）。 */
export const PANEL_SECTIONS = Object.freeze([
  'model',
  'session',
  'preset',
  'context',
  'policy',
  'fields',
  'actions',
  'commands',
]);

/** 两个作用域：私聊与群聊各一份。 */
export const PANEL_SCOPES = Object.freeze(['direct', 'group']);

function allOn() {
  return Object.fromEntries(PANEL_SECTIONS.map((id) => [id, true]));
}

/**
 * 默认值：全部显示（与加这个配置之前的行为一致）。
 *
 * @returns `{ direct, group }`。
 */
export function defaultPanelSections() {
  return Object.freeze({ direct: Object.freeze(allOn()), group: Object.freeze(allOn()) });
}

/**
 * 容错归一化：只认已知的显示项，缺的与写错的都按"显示"补齐。
 *
 * @param input - 任意历史数据。
 * @returns `{ direct, group }`（每项都是布尔）。
 */
export function normalizePanelSections(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const scopeOf = (value) => {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    // 缺项与写错的都按"显示"补齐（只有明确 false 才关）。
    return Object.fromEntries(
      PANEL_SECTIONS.map((id) => [id, raw[id] !== false]),
    );
  };
  return { direct: scopeOf(source.direct), group: scopeOf(source.group) };
}

/**
 * 取某个会话类型该显示哪些项。
 *
 * 认不出会话类型（渠道没给、会话键也不合约定）时返回**全部显示**：宁可多显示，
 * 也不要因为"不知道这是私聊还是群聊"把用户的设置项全藏起来。
 *
 * @param record - 机器人设置记录（`panelSections` 在其中）。
 * @param conversationType - 'direct' | 'group' | null。
 * @returns `{ [sectionId]: boolean }`。
 */
export function sectionsFor(record, conversationType) {
  if (conversationType !== 'direct' && conversationType !== 'group') return allOn();
  return normalizePanelSections(record?.panelSections)[conversationType];
}
