/**
 * 机器人设置页的共享编辑块：**工作区 / Agent 预设 / 访问策略**。
 *
 * 三项都与渠道无关，因此 hub 实现一次，渠道页只负责把它们挂到自己的机器人卡片下
 * （和 `ContextEnhancementEditor` / `DeliveryTargetsEditor` 一样的用法）。
 *
 * 三项都会把"什么时候生效"写在描述里，因为它们的生效时机各不相同：
 * 工作区与预设**只对新建会话生效**（已有会话保持原样），访问策略**立即生效**。
 * 设置页最忌讳"看着像生效了其实没生效"，所以宁可啰嗦一句。
 *
 * @module dsh-chat/client/bot-shared-settings
 */

import * as React from 'react';

import { defaultAccessPolicy, normalizeAccessPolicy } from '../shared/access-policy.mjs';
import { HelpHint } from './help-hint.js';
import { PANEL_SECTIONS, normalizePanelSections } from '../shared/panel-sections.mjs';
import { isInherited, resolveScope, writeScope } from '../shared/scoped-config.mjs';

const h = React.createElement;

function translatorOf(translate) {
  return typeof translate === 'function' ? translate : (key) => key;
}

/** 统一的卡片外壳（与 hub 其它设置块同形态）。 */
/**
 * 统一的卡片外壳。
 *
 * `description` 是**常驻**那一句（会写"只对新建会话生效"这类**影响判断**的话）；
 * `help` 是"想知道再看"的背景说明——收进问号，别让每张卡都背一大段解释
 * （设置页说明文字实测 5000+ 字，把真正要改的控件都挤下去了）。
 *
 * @param props - { title, description, help, actions, children, translate }。
 */
function Card({ title, description, help, actions, children, translate }) {
  const t = translatorOf(translate);
  return h('section', { className: 'dchat-card' },
    h('div', { className: 'dchat-cardHeader' },
      h('div', { className: 'dchat-cardHeading' },
        h('h3', { className: 'dchat-cardTitle' }, title),
        description || help
          ? h('p', { className: 'dchat-cardDescription' },
            description ? h('span', null, description) : null,
            h(HelpHint, { help, translate: t, label: description ?? title }))
          : null),
      actions ? h('div', { className: 'dchat-actions' }, actions) : null),
    children);
}

/** 保存态与失败的统一处理：busy 时锁住控件，失败把原因留在卡片上。 */
function useSaver(onSave) {
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(null);
  const run = React.useCallback(async (next) => {
    setBusy(true);
    setFailed(null);
    try {
      await onSave(next);
      return true;
    } catch (error) {
      setFailed(error?.message ?? String(error));
      return false;
    } finally {
      setBusy(false);
    }
  }, [onSave]);
  return { busy, failed, run };
}

/**
 * 工作区：机器人跑在哪个目录。
 *
 * **长得和下拉一样，但仍然能手打**：候选是这台机器人**用过的**目录（不列全机目录），
 * 而路径必须是任意可输入的——所以不能换成 `<select>`。
 * 早先用的是原生 `<input list>` + `<datalist>`：那个下拉箭头由**浏览器/系统**画，
 * 和页面上其它 `.dchat-select` 的边框、圆角、箭头都不一样（真机反馈"风格不一致"）。
 * 现在自己拼一个外壳：外观与 `.dchat-select` 同一套 token，右侧箭头是自家按钮。
 *
 * 保留"保存"按钮而不是即时保存：路径是手打的，打到一半就提交会把设置改成半个路径。
 */
export function WorkspaceEditor({ value, options = [], translate, onSave }) {
  const t = translatorOf(translate);
  const [draft, setDraft] = React.useState(value ?? '');
  const [open, setOpen] = React.useState(false);
  const { busy, failed, run } = useSaver(onSave);
  const fieldId = React.useId?.() ?? 'dchat-workspace';

  React.useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const dirty = (draft ?? '').trim() !== (value ?? '');
  const hasOptions = options.length > 0;
  return h(Card, {
    title: t('工作区'),
    // 常驻只留"影响判断"的那半句（改了什么时候生效）；其余收进帮助。
    description: t('只对新建会话生效'),
    help: [
      t('这个目录决定它能读写哪些文件、以及用哪一份 AGENTS.md。'),
      t('已经建好的会话不受影响——想换目录又想让旧会话跟上，就在那个聊天里点「新会话」。'),
      hasOptions ? t('下拉里是这台机器人用过的目录，也可以直接手打任意路径。') : null,
    ].filter(Boolean),
    actions: h('button', {
      type: 'button',
      className: 'dchat-button',
      disabled: busy || !dirty,
      onClick: () => {
        void run(draft.trim());
      },
    }, busy ? t('保存中…') : t('保存')),
  },
  h('div', { className: 'dchat-scopeGrid' },
    h('div', { className: 'dchat-scopeRow' },
      h('label', { className: 'dchat-scopeLabel', htmlFor: fieldId }, t('目录')),
      /**
       * 外壳 + 输入框 + 箭头。`onBlur` 用 focusout 的冒泡判断焦点是否还在里面，
       * 点列表项时焦点不会跑掉（列表是同一棵树里的按钮）。
       */
      h('div', {
        className: 'dchat-combo',
        onBlur: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        },
        onKeyDown: (event) => {
          if (event.key === 'Escape' && open) {
            event.preventDefault();
            setOpen(false);
          }
        },
      },
      h('input', {
        id: fieldId,
        className: 'dchat-comboInput',
        value: draft,
        disabled: busy,
        placeholder: '/Users/me/project',
        autoComplete: 'off',
        spellCheck: false,
        'aria-expanded': hasOptions ? open : undefined,
        onChange: (event) => setDraft(event.target.value),
      }),
      hasOptions
        ? h('button', {
          type: 'button',
          className: 'dchat-comboArrow',
          disabled: busy,
          'aria-label': t('选择用过的目录'),
          'aria-expanded': open,
          onClick: () => setOpen((v) => !v),
        }, '▾')
        : null,
      // 候选列表：绝对定位（不占位、不撑高卡片），只有展开时才画。
      open && hasOptions
        ? h('div', { className: 'dchat-comboList', role: 'listbox' },
          options.map((path) => h('button', {
            key: path,
            type: 'button',
            role: 'option',
            className: 'dchat-comboOption',
            'aria-selected': path === (draft ?? '').trim(),
            title: path,
            onClick: () => {
              setDraft(path);
              setOpen(false);
            },
          }, path)))
        : null))),
  failed ? h('p', { className: 'dchat-error', role: 'alert' }, failed) : null);
}

/** Agent 预设：用哪套预设。选项少且是枚举，所以选完即存。 */
export function PresetEditor({ value, options = [], translate, onSave }) {
  const t = translatorOf(translate);
  const { busy, failed, run } = useSaver(onSave);
  return h(Card, {
    title: t('Agent 预设'),
    description: t('只对新建会话生效'),
    help: [
      t('预设决定它的人设与能用哪些工具。'),
      t('跟工作区一样只对新建会话生效：改完想让某个聊天用上，在那个聊天里点「新会话」。'),
    ],
    actions: busy ? h('span', { className: 'dchat-status' }, t('保存中…')) : null,
  },
  options.length === 0
    ? h('p', { className: 'dchat-cardDescription' }, t('当前 Host 读不到 Agent Preset 列表。'))
    : h('div', { className: 'dchat-scopeGrid' },
      h('div', { className: 'dchat-scopeRow' },
        h('select', {
          className: 'dchat-select',
          value: value ?? '',
          disabled: busy,
          'aria-label': t('Agent 预设'),
          onChange: (event) => {
            void run(event.target.value || null);
          },
        },
        h('option', { value: '' }, t('跟随 Host 默认')),
        options.map((row) => h('option', { key: row.id, value: row.id },
          `${row.id}${row.name && row.name !== row.id ? ` · ${row.name}` : ''}`))))),
  failed ? h('p', { className: 'dchat-error', role: 'alert' }, failed) : null);
}

/**
 * 机器人默认模型：**还没有会话时**（新聊天、或刚点过「新会话」）用哪个模型。
 *
 * 为什么要这一栏：模型选择在 DSH 里是**会话级**的（`session/selectModel` 必须带 sessionId），
 * 没有会话时无处可写；只能存成机器人级默认、等建会话时应用（与工作区/预设同一条口径）。
 * 两个下拉：模型 + 推理等级（等级依赖所选模型，所以跟着走）。
 */
export function ModelEditor({ value, options = [], hostDefault = null, failures = [], translate, onSave }) {
  const t = translatorOf(translate);
  const { busy, failed, run } = useSaver(onSave);

  const current = value ?? null;
  const selected = current
    ? options.find((item) => item.provider === current.provider && item.model === current.model) ?? null
    : null;
  const effortOptions = selected?.efforts ?? [];
  const hostText = hostDefault ? `${hostDefault.provider}/${hostDefault.model}` : null;

  const save = (patch) => {
    if (patch === null) {
      void run(null);
      return;
    }
    const provider = patch.provider ?? current?.provider ?? '';
    const model = patch.model ?? current?.model ?? '';
    const reasoningEffort = Object.hasOwn(patch, 'reasoningEffort')
      ? patch.reasoningEffort
      : (current?.reasoningEffort ?? null);
    void run({ provider, model, reasoningEffort: reasoningEffort || null });
  };

  const modelSelect = h('div', { className: 'dchat-scopeRow' },
    h('label', { className: 'dchat-scopeLabel' }, t('模型')),
    h('select', {
      className: 'dchat-select',
      value: selected?.value ?? '',
      disabled: busy,
      'aria-label': t('默认模型'),
      onChange: (event) => {
        const next = options.find((item) => item.value === event.target.value);
        if (!next) {
          save(null);
          return;
        }
        // 换模型时重置推理等级：等级是模型自己的能力，跨模型沿用会给出不支持的取值。
        save({ provider: next.provider, model: next.model, reasoningEffort: null });
      },
    },
    h('option', { value: '' }, hostText ? `${t('跟随 Host 默认')}（${hostText}）` : t('跟随 Host 默认')),
    options.map((item) => h('option', { key: item.value, value: item.value },
      `${item.value}${item.name && item.name !== item.model ? ` · ${item.name}` : ''}`))));

  const effortSelect = h('div', { className: 'dchat-scopeRow' },
    h('label', { className: 'dchat-scopeLabel' }, t('推理等级')),
    effortOptions.length === 0
      ? h('p', { className: 'dchat-cardDescription' },
        current ? t('这个模型没有可选的推理等级。') : t('先选一个模型。'))
      : h('select', {
        className: 'dchat-select',
        value: current?.reasoningEffort ?? '',
        disabled: busy,
        'aria-label': t('推理等级'),
        onChange: (event) => {
          save({ reasoningEffort: event.target.value || null });
        },
      },
      h('option', { value: '' }, t('模型默认')),
      effortOptions.map((effort) => h('option', { key: effort.id, value: effort.id },
        `${effort.id}${effort.label && effort.label !== effort.id ? ` · ${effort.label}` : ''}`))));

  const failureNote = failures.length > 0
    ? h('p', { className: 'dchat-cardDescription' }, t('部分 provider 读取失败：')
      + failures.map((item) => `${item.id || item.name}（${item.message}）`).join('；'))
    : null;
  const body = options.length === 0
    ? h('p', { className: 'dchat-cardDescription' }, t('当前 Host 读不到模型目录。'))
    : h('div', { className: 'dchat-scopeGrid' }, modelSelect, effortSelect);

  return h(Card, {
    title: t('默认模型'),
    description: t('新会话用它'),
    help: [
      t('选完对「下一条消息新建的会话」生效，已经建好的会话不变。'),
      t('会话建好之后还能单独改：在聊天里发 /menu，或用 /model。'),
      t('推理等级是模型自己的能力，换模型会重置。'),
    ],
    actions: busy ? h('span', { className: 'dchat-status' }, t('保存中…')) : null,
  },
  failureNote,
  body,
  failed ? h('p', { className: 'dchat-error', role: 'alert' }, failed) : null);
}

/** 把策略归一化成编辑器用的草稿（缺字段按"保守方向"填充，与运行期一致）。 */
function toDraft(value) {
  /**
   * 底色：**三层都在**，且"继承"要原样保留成 `null`。
   *
   * ⚠️ 不能把继承层展开成一份副本——那样一进设置页就等于"这一层被单独设置了"，
   * 用户还没动手就已经丢了继承关系（改全局时它不再跟着变）。
   */
  const policy = normalizeAccessPolicy(value) ?? defaultAccessPolicy();
  const scopeOf = (scope) => ({
    mode: scope?.mode === 'open' ? 'open' : 'allowlist',
    defaultCanExecuteCommands: scope?.open?.defaultCanExecuteCommands === true,
    // 不在界面上编辑，但必须原样带回去，否则保存一次就把已有例外清空了。
    commandPermissionOverrides: Array.isArray(scope?.open?.commandPermissionOverrides)
      ? scope.open.commandPermissionOverrides
      : [],
    users: Array.isArray(scope?.allowlist?.users) ? scope.allowlist.users : [],
  });
  const overrideOf = (scope) => (scope === null || scope === undefined ? null : scopeOf(scope));
  return {
    global: scopeOf(policy.global),
    direct: overrideOf(policy.direct),
    group: overrideOf(policy.group),
  };
}

/**
 * 草稿 → 保存用的策略。
 *
 * 继承层（`null`）要保持 `null`——展开成对象就变成"单独设置"了。
 * 保存路径要求三层完整，所以 global 一定给一份。
 */
function fromDraft(draft) {
  const scopeOf = (scope) => ({
    mode: scope.mode,
    open: {
      defaultCanExecuteCommands: scope.defaultCanExecuteCommands,
      commandPermissionOverrides: scope.commandPermissionOverrides,
    },
    allowlist: { users: scope.users },
  });
  const overrideOf = (scope) => (scope === null || scope === undefined ? null : scopeOf(scope));
  return {
    global: scopeOf(draft.global),
    direct: overrideOf(draft.direct),
    group: overrideOf(draft.group),
  };
}

/**
 * 一个层（全局 / 私聊 / 群聊）的编辑块。
 *
 * `label` 传 null 就**不画标签**：只有一个会话类型的渠道（微信）上，"私聊"两个字
 * 是纯冗余——整页的访问策略管的就是那一种会话。
 */
function ScopeBlock({ scopeKey, label, scope, busy, t, onChange, names = null }) {
  const [entry, setEntry] = React.useState('');
  const inputId = `dchat-policy-${scopeKey}`;
  /** 名单里那串 id 是谁：渠道换来的名字，换不到就只有 id（不编名字）。 */
  const nameOf = (id) => names?.[id] ?? null;

  const update = (patch) => onChange({ ...scope, ...patch });
  const addUser = () => {
    const id = entry.trim();
    if (!id) return;
    setEntry('');
    if (scope.users.some((user) => user.id === id)) return;
    update({ users: [...scope.users, { id, canExecuteCommands: false }] });
  };

  /** `allowlist` 模式：逐条名单 + 追加输入。 */
  const allowlist = h(React.Fragment, null,
    scope.users.length > 0
      ? h('ul', { className: 'dchat-list' }, scope.users.map((user) => h('li', {
        key: user.id,
        className: 'dchat-listItem',
      },
      // 名字 + id：只显示 id 时，"这条是谁"在设置页上根本认不出来（真机反馈）；
      // 但 id 才是判定用的那个值，所以两个都留（与「属主」那一行同一个形态）。
      h('span', { className: 'dchat-policyEntry' },
        nameOf(user.id) ? h('span', { className: 'dchat-policyName' }, nameOf(user.id)) : null,
        h('code', { className: 'dchat-code' }, user.id)),
      h('span', { className: 'dchat-actions' },
        h('label', { className: 'dchat-check' },
          h('input', {
            type: 'checkbox',
            checked: user.canExecuteCommands === true,
            disabled: busy,
            onChange: (event) => update({
              users: scope.users.map((item) => (item.id === user.id
                ? { ...item, canExecuteCommands: event.target.checked }
                : item)),
            }),
          }),
          h('span', null, t('可执行命令'))),
        h('button', {
          type: 'button',
          className: 'dchat-button dchat-buttonDanger',
          disabled: busy,
          onClick: () => update({ users: scope.users.filter((item) => item.id !== user.id) }),
        }, t('移除'))))))
      // 空名单的含义已在卡片头的问号里说过，这里不再重复一遍。
      : null,
    h('div', { className: 'dchat-actions' },
      h('input', {
        id: inputId,
        className: 'dchat-input',
        value: entry,
        disabled: busy,
        placeholder: t('对方的平台 id，回车添加'),
        autoComplete: 'off',
        spellCheck: false,
        onChange: (event) => setEntry(event.target.value),
        onKeyDown: (event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          addUser();
        },
      }),
      h('button', {
        type: 'button',
        className: 'dchat-button',
        disabled: busy || !entry.trim(),
        onClick: addUser,
      }, t('添加'))));

  /** `open` 模式：只暴露"默认能不能执行命令"。 */
  const openScope = h('label', { className: 'dchat-check' },
    h('input', {
      type: 'checkbox',
      checked: scope.defaultCanExecuteCommands,
      disabled: busy,
      onChange: (event) => update({ defaultCanExecuteCommands: event.target.checked }),
    }),
    h('span', null, t('允许执行命令')));

  return h('div', { className: 'dchat-scopeRow' },
    h('div', { className: 'dchat-policyHead' },
      label ? h('label', { className: 'dchat-scopeLabel', htmlFor: inputId }, label) : null,
      h('select', {
        className: 'dchat-select',
        value: scope.mode,
        disabled: busy,
        'aria-label': label ? `${label} ${t('访问模式')}` : t('访问模式'),
        onChange: (event) => update({ mode: event.target.value }),
      },
      h('option', { value: 'allowlist' }, t('仅名单内可用')),
      h('option', { value: 'open' }, t('任何人可用')))),
    scope.mode === 'open' ? openScope : allowlist);
}

/**
 * 访问策略：谁能跟机器人说话、谁能执行命令。
 *
 * 改一项存一次（策略是开关/名单，没有"改到一半"的中间态）。
 * 校验用的是与 host 拦消息时**同一份** `access-policy.mjs`。
 *
 * @param props - {
 *   value, translate, onSave, names?, namesHint?, scope?, showInheritance?, ownerHint?,
 * }。
 *   `names` 是渠道换回来的「id → 名字」（`names.resolve`）；渠道不给就只显示 id。
 *   `namesHint` 是"名字为什么没换到"（多为缺权限），有就说明，免得用户以为功能坏了。
 *   `scope` 是要编辑的那一层（全局/私聊/群聊），由**页面级的场合切换器**决定；缺省全局。
 *   `showInheritance`：**只有一个会话类型的渠道**（微信只有私聊）传 false——
 *   那一层要么是唯一生效的一份、要么继承自一个用户看不到也改不了的"全局"，
 *   再说"继承全局 / 恢复继承"只会让人去找一个页面上不存在的东西。
 *   `ownerHint`：属主**不可配置**的渠道（微信的属主 = 扫码绑定的人）用它说明属主是谁；
 *   不给就退回 hub 的中性说法（不回退到"去某张卡里设置"——那是页面结构，hub 不该知道）。
 */
export function AccessPolicyEditor({
  value, translate, onSave, names = null, namesHint = null, scope = 'global',
  showInheritance = true, ownerHint = null,
}) {
  const t = translatorOf(translate);
  const [draft, setDraft] = React.useState(() => toDraft(value));
  const { busy, failed, run } = useSaver(onSave);

  React.useEffect(() => {
    setDraft(toDraft(value));
  }, [value]);

  const commit = React.useCallback(async (next) => {
    setDraft(next);
    const saved = await run(fromDraft(next));
    if (!saved) setDraft(toDraft(value)); // 失败回滚到外部真值
  }, [run, value]);

  /**
   * 只画**当前层**那一块（原来私聊/群聊并排两块，是五个分叉项里的第二种画法）。
   *
   * 编辑"私聊/群聊"时底板取**当前生效**的那一份（可能是从全局继承来的）：
   * 用户看到什么就改什么，改完这一层就变成覆盖。其余层原样带回去。
   */
  const inherits = scope !== 'global' && (draft[scope] === null || draft[scope] === undefined);
  const activeDraft = scope === 'global' ? draft.global : (draft[scope] ?? draft.global);
  const scopeLabel = scope === 'global' ? t('全局') : (scope === 'group' ? t('群聊') : t('私聊'));

  return h(Card, {
    title: t('访问策略'),
    description: t('改动立即生效'),
    help: [
      // ⚠️ 这里**不许引用页面结构**（"去某张卡里设置"）：hub 组件不知道各渠道页上有哪些卡，
      // 微信就没有「属主」卡（它的属主是扫码绑定的人，不可改），那样写会把用户指向不存在的东西。
      ownerHint ?? t('属主不需要进名单：消息与命令都直接放行。'),
      t('「仅名单内可用」+ 空名单 = 只有属主能说话。想给某个人开门，把他的平台 id 加进名单。'),
      t('「任何人可用」表示这个场合里谁都进得来。'),
      t('名单里的人可以额外勾「可执行命令」；不勾就只能对话，不能跑 / 开头的命令。'),
    ],
    actions: h('div', { className: 'dchat-actions' },
      showInheritance && !inherits && scope !== 'global'
        ? h('button', {
          type: 'button',
          className: 'dchat-button dchat-buttonLink',
          disabled: busy,
          onClick: () => { void commit({ ...draft, [scope]: null }); },
        }, t('恢复继承全局'))
        : null,
      busy ? h('span', { className: 'dchat-status' }, t('保存中…')) : null),
  },
  showInheritance && inherits
    ? h('p', { className: 'dchat-layerNote' },
      h('span', { className: 'dchat-layerBadge' }, t('继承全局')),
      t('现在跟随「全局」那一份；在这里改任何一项，就会变成这个场合的单独设置。'))
    : null,
  h('div', { className: 'dchat-policyGrid' },
    h(ScopeBlock, {
      scopeKey: scope,
      // 只有一个会话类型时不画标签（"私聊"是冗余的）。
      label: showInheritance ? scopeLabel : null,
      scope: activeDraft,
      busy,
      t,
      names,
      // 在"继承中"的层上改 = 建立覆盖（以生效值为底板），其余层原样保留。
      onChange: (next) => { void commit({ ...draft, [scope]: next }); },
    })),
  namesHint ? h('p', { className: 'dchat-cardDescription' }, namesHint.message ?? String(namesHint)) : null,
  failed ? h('p', { className: 'dchat-error', role: 'alert' }, failed) : null);
}

/**
 * 属主：**属主绕过所有访问策略**（消息与命令都不看名单），所以这是权限面，不是普通设置。
 *
 * `owners` 里的 `*` 表示**没有属主**（公开机器人）——不是"人人都是属主"。
 * 设置页只做三件事：看清现在是谁、从"它聊过的会话"里选一个人设为属主、清空回无属主。
 * 保存后渠道会重连一次，属主立刻生效。
 *
 * @param props - {
 *   owners: string[], wildcard: boolean, candidates: [{ id, name }],
 *   busy?: boolean, translate, onSave(owners: string[]),
 * }。
 * @returns React 元素。
 */
export function OwnerEditor({ owners = [], wildcard = false, candidates = [], translate, onSave }) {
  const t = translatorOf(translate);
  const [picked, setPicked] = React.useState('');
  const { busy, failed, run } = useSaver(onSave);
  const nameOf = (id) => candidates.find((item) => item.id === id)?.name ?? null;
  const people = candidates.filter((item) => !owners.includes(item.id));

  return h(Card, {
    title: t('属主'),
    description: t('改完会重连一次'),
    help: [
      t('属主不需要进白名单：消息与命令都直接放行，也不看访问策略。'),
      t('从"它聊过的会话"里挑一个人设为属主；清空后没有任何人绕过访问策略。'),
    ],
    actions: busy ? h('span', { className: 'dchat-status' }, t('保存中…')) : null,
  },
  h('div', { className: 'dchat-scopeGrid' },
    wildcard || owners.length === 0
      ? h('p', { className: 'dchat-cardDescription' }, t('当前没有属主：没有人绕过访问策略，谁能用完全由下面的「访问策略」决定。'))
      : h('ul', { className: 'dchat-list' }, owners.map((id) => h('li', {
        key: id,
        className: 'dchat-listItem',
      },
      // 名字 + id：id 用等宽块（可省略号），避免一行被 35 字符的 open_id 撑爆。
      h('span', null,
        nameOf(id) ? `${nameOf(id)} ` : null,
        h('code', { className: 'dchat-code' }, id)),
      h('span', { className: 'dchat-actions' },
        h('button', {
          type: 'button',
          className: 'dchat-button dchat-buttonDanger',
          disabled: busy,
          onClick: () => {
            void run([...owners.filter((item) => item !== id)]);
          },
        }, t('移除')))))),
    h('div', { className: 'dchat-actions' },
      h('select', {
        className: 'dchat-select',
        value: picked,
        disabled: busy || people.length === 0,
        'aria-label': t('从会话里选一个人设为属主'),
        onChange: (event) => setPicked(event.target.value),
      },
      h('option', { value: '' },
        people.length === 0 ? t('没有可选的会话（先和机器人聊一次）') : t('从会话里选一个人设为属主')),
      people.map((item) => h('option', { key: item.id, value: item.id }, item.name))),
      h('button', {
        type: 'button',
        className: 'dchat-button',
        disabled: busy || !picked,
        onClick: () => {
          setPicked('');
          void run([...owners.filter((item) => item !== '*'), picked]);
        },
      }, t('设为属主')),
      h('button', {
        type: 'button',
        className: 'dchat-button',
        disabled: busy || (wildcard && owners.length === 1),
        title: t('清空后没有人绕过访问策略'),
        onClick: () => {
          void run(['*']);
        },
      }, t('清空（无属主）')))),
  failed ? h('p', { className: 'dchat-error', role: 'alert' }, failed) : null);
}

/** 显示项的中文标签（键交给渠道字典翻译）。 */
const PANEL_SECTION_LABELS = Object.freeze({
  model: '模型与推理等级',
  session: '会话',
  preset: 'Agent 预设与工作区',
  context: '上下文增强（本会话）',
  policy: '访问策略（本会话）',
  fields: '渠道设置（任务过程展示等）',
  actions: '渠道动作按钮（重连等）',
  commands: '命令按钮（新会话/状态/诊断…）',
});

/**
 * 控制面板卡片的显示项：**私聊与群聊分开**，逐项开关。
 *
 * 为什么值得做：面板越长越难用——手机上要滑好几屏，而"只想换个模型"的人在群里
 * 并不需要看到访问策略与任务过程展示。这里是纯粹的**显示**配置，关掉不影响任何功能
 * （命令、策略、上下文增强都照旧生效，只是不画在那张卡上）。
 *
 * **三层**：`global` 是底板，`direct`/`group` 可以「继承全局」或「单独设置」。
 * 场合由**页面级的场合切换器**决定（本组件只画当前那一层），
 * 切到"全局"时编辑的是大家共用的那一份。
 *
 * 选完即存（没有保存按钮，与 `ScopedModeEditor` 同一条理由），失败回滚并就地说明。
 *
 * @param props - {
 *   value: { global: {…}, direct: {…}|null, group: {…}|null } | null,
 *   disabled, saving, error, translate, onSave(next), scope,
 * }。
 * @returns React 元素。
 */
export function PanelSectionsEditor({
  value = null, disabled = false, saving = false, error = null, translate, onSave,
  scope = 'global', showInheritance = true, available = null,
}) {
  const t = translatorOf(translate);
  /**
   * 只列这个渠道**真的会画**的显示项。
   *
   * 渠道没有卡片面板时整张卡都不该出现（微信的 /menu 发的是文本），那种情况由渠道页直接不挂本组件；
   * 这里管的是"有卡片、但其中某几段渠道不产生"（例如没有 `panel.fields` 就没有「渠道设置」）。
   */
  const sections = Array.isArray(available) && available.length > 0
    ? PANEL_SECTIONS.filter((id) => available.includes(id))
    : PANEL_SECTIONS;
  const [pending, setPending] = React.useState(null);
  const [failed, setFailed] = React.useState(null);
  const locked = disabled || saving || pending !== null;

  /**
   * 完整值（三层都在）与"当前层**实际生效**的那一份"。
   *
   * 生效值走 `resolveScope`（与运行期同一个回落函数）——界面显示的勾选状态
   * 必须就是运行期真正会用的那份，否则就是"看着开着其实关着"。
   */
  const full = normalizePanelSections(value);
  const mine = resolveScope(full, scope) ?? full.global;
  /**
   * 当前层是不是"继承全局"。
   *
   * 全局层自身不算继承（它就是被继承的那个）；私聊/群聊为 `null` 时是继承。
   */
  const inherits = scope !== 'global' && isInherited(full, scope);

  const toggle = async (sectionId, nextChecked) => {
    if (locked) return;
    /**
     * 在"继承中"的层上勾一下 = **建立一份覆盖**（以当前生效的那份为底板）。
     *
     * 这是用户最容易误解的一步，所以下面有一行显式提示"改动会变成单独设置"：
     * 展开成一份完整副本而不是只存这一项，才能表达"这一层从此自己说了算"。
     */
    const next = writeScope(full, scope, { ...mine, [sectionId]: nextChecked });
    setFailed(null);
    setPending(sectionId);
    try {
      await onSave(next);
    } catch (cause) {
      setFailed(cause?.message ?? String(cause));
    } finally {
      setPending(null);
    }
  };

  /** 把当前层改回"继承全局"（丢掉这一层的覆盖）。 */
  const revertToInherit = async () => {
    if (locked) return;
    setFailed(null);
    setPending('inherit');
    try {
      await onSave(writeScope(full, scope, null));
    } catch (cause) {
      setFailed(cause?.message ?? String(cause));
    } finally {
      setPending(null);
    }
  };

  const scopeLabel = scope === 'global' ? t('全局') : (scope === 'group' ? t('群聊') : t('私聊'));

  const rows = sections.map((sectionId) => h('div', {
    key: sectionId, className: 'dchat-panelSectionsRow',
  },
  h('label', {
    className: 'dchat-panelSectionsCheck',
    title: t(PANEL_SECTION_LABELS[sectionId]),
  }, h('input', {
    type: 'checkbox',
    checked: mine[sectionId] !== false,
    disabled: locked,
    'aria-label': `${t(PANEL_SECTION_LABELS[sectionId])} · ${scopeLabel}`,
    onChange: (event) => {
      void toggle(sectionId, event.target.checked);
    },
  }),
  h('span', { className: 'dchat-panelSectionsName' }, t(PANEL_SECTION_LABELS[sectionId])))));

  return h(Card, {
    title: t('控制面板显示项'),
    description: t('只影响 /menu 那张卡片'),
    help: [
      t('关掉的项不显示在卡片上，但功能照旧（策略、上下文增强都还在生效）。'),
    ],
    actions: h('div', { className: 'dchat-actions' },
      // 「恢复继承」只在真有覆盖时出现——没覆盖时它是个点了没反应的按钮。
      showInheritance && !inherits && scope !== 'global'
        ? h('button', {
          type: 'button',
          className: 'dchat-button dchat-buttonLink',
          disabled: locked,
          onClick: () => { void revertToInherit(); },
        }, t('恢复继承全局'))
        : null,
      pending !== null ? h('span', { className: 'dchat-status' }, t('保存中…')) : null),
  },
  /**
   * 继承状态必须**说出来**：正在继承时下面这些勾选框显示的是全局那一份，
   * 用户不知道的话会以为"我明明在这里关了，怎么又开了"。
   */
  inherits
    ? h('p', { className: 'dchat-layerNote' },
      h('span', { className: 'dchat-layerBadge' }, t('继承全局')),
      t('现在跟随「全局」那一份；在这里改任何一项，就会变成这个场合的单独设置。'))
    : null,
  h('div', { className: 'dchat-panelSections' }, rows),
  failed || error ? h('p', { className: 'dchat-error', role: 'alert' }, failed ?? error) : null);
}
