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

import { defaultAccessPolicy } from '../shared/access-policy.mjs';
import { PANEL_SECTIONS, normalizePanelSections } from '../shared/panel-sections.mjs';

const h = React.createElement;

function translatorOf(translate) {
  return typeof translate === 'function' ? translate : (key) => key;
}

/** 统一的卡片外壳（与 hub 其它设置块同形态）。 */
function Card({ title, description, actions, children }) {
  return h('section', { className: 'dchat-card' },
    h('div', { className: 'dchat-cardHeader' },
      h('div', { className: 'dchat-cardHeading' },
        h('h3', { className: 'dchat-cardTitle' }, title),
        description ? h('p', { className: 'dchat-cardDescription' }, description) : null),
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
 * 输入框 + `datalist` 候选（候选来自这台机器人**用过的**目录，不列全机目录）。
 * 这里保留"保存"按钮而不是即时保存：路径是手打的，打到一半就提交会把设置改成半个路径。
 */
export function WorkspaceEditor({ value, options = [], translate, onSave }) {
  const t = translatorOf(translate);
  const [draft, setDraft] = React.useState(value ?? '');
  const { busy, failed, run } = useSaver(onSave);
  const fieldId = React.useId?.() ?? 'dchat-workspace';

  React.useEffect(() => {
    setDraft(value ?? '');
  }, [value]);

  const dirty = (draft ?? '').trim() !== (value ?? '');
  return h(Card, {
    title: t('工作区'),
    description: t('机器人跑在哪个目录：能读写哪些文件、用哪份 AGENTS.md。只对新建会话生效。'),
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
      h('input', {
        id: fieldId,
        className: 'dchat-input',
        list: `${fieldId}-options`,
        value: draft,
        disabled: busy,
        placeholder: '/Users/me/project',
        autoComplete: 'off',
        spellCheck: false,
        onChange: (event) => setDraft(event.target.value),
      }),
      h('datalist', { id: `${fieldId}-options` },
        options.map((path) => h('option', { key: path, value: path }))),
      options.length > 0
        ? h('p', { className: 'dchat-cardDescription' }, t('下拉里是这台机器人用过的目录。'))
        : null)),
  failed ? h('p', { className: 'dchat-error', role: 'alert' }, failed) : null);
}

/** Agent 预设：用哪套预设。选项少且是枚举，所以选完即存。 */
export function PresetEditor({ value, options = [], translate, onSave }) {
  const t = translatorOf(translate);
  const { busy, failed, run } = useSaver(onSave);
  return h(Card, {
    title: t('Agent 预设'),
    description: t('这个机器人用哪套 Agent 预设（人设与工具集）。只对新建会话生效。'),
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
    description: t('还没有会话时用哪个模型：选完对下一条消息新建的会话生效。会话内还能单独改（面板的模型下拉）。'),
    actions: busy ? h('span', { className: 'dchat-status' }, t('保存中…')) : null,
  },
  failureNote,
  body,
  failed ? h('p', { className: 'dchat-error', role: 'alert' }, failed) : null);
}

/** 把策略归一化成编辑器用的草稿（缺字段按"保守方向"填充，与运行期一致）。 */
function toDraft(value) {
  const base = value ?? defaultAccessPolicy();
  const scopeOf = (scope) => ({
    mode: scope?.mode === 'open' ? 'open' : 'allowlist',
    defaultCanExecuteCommands: scope?.open?.defaultCanExecuteCommands === true,
    // 不在界面上编辑，但必须原样带回去，否则保存一次就把已有例外清空了。
    commandPermissionOverrides: Array.isArray(scope?.open?.commandPermissionOverrides)
      ? scope.open.commandPermissionOverrides
      : [],
    users: Array.isArray(scope?.allowlist?.users) ? scope.allowlist.users : [],
  });
  return { direct: scopeOf(base.direct), group: scopeOf(base.group) };
}

function fromDraft(draft) {
  const scopeOf = (scope) => ({
    mode: scope.mode,
    open: {
      defaultCanExecuteCommands: scope.defaultCanExecuteCommands,
      commandPermissionOverrides: scope.commandPermissionOverrides,
    },
    allowlist: { users: scope.users },
  });
  return { direct: scopeOf(draft.direct), group: scopeOf(draft.group) };
}

/** 一个作用域（私聊 / 群聊）的编辑块。 */
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
      : h('p', { className: 'dchat-cardDescription' }, t('名单为空时只有属主可用。')),
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
      h('label', { className: 'dchat-scopeLabel', htmlFor: inputId }, label),
      h('select', {
        className: 'dchat-select',
        value: scope.mode,
        disabled: busy,
        'aria-label': `${label} ${t('访问模式')}`,
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
 * @param props - { value, translate, onSave, names?, namesHint? }。
 *   `names` 是渠道换回来的「id → 名字」（`names.resolve`）；渠道不给就只显示 id。
 *   `namesHint` 是"名字为什么没换到"（多为缺权限），有就说明，免得用户以为功能坏了。
 */
export function AccessPolicyEditor({ value, translate, onSave, names = null, namesHint = null }) {
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

  return h(Card, {
    title: t('访问策略'),
    description: t('谁能跟机器人说话、谁能执行命令。改动立即生效；属主始终可用。'),
    actions: busy ? h('span', { className: 'dchat-status' }, t('保存中…')) : null,
  },
  h('div', { className: 'dchat-policyGrid' },
    h(ScopeBlock, {
      scopeKey: 'direct', label: t('私聊'), scope: draft.direct, busy, t, names,
      onChange: (next) => { void commit({ ...draft, direct: next }); },
    }),
    h(ScopeBlock, {
      scopeKey: 'group', label: t('群聊'), scope: draft.group, busy, t, names,
      onChange: (next) => { void commit({ ...draft, group: next }); },
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
    description: t('属主不需要进白名单：消息与命令都直接放行。这里改完会重连一次，立刻生效。'),
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
 * 选完即存（没有保存按钮，与 `ScopedModeEditor` 同一条理由），失败回滚并就地说明。
 *
 * @param props - {
 *   value: { direct: {…}, group: {…} } | null, disabled, saving, error,
 *   translate, onSave(next),
 * }。
 * @returns React 元素。
 */
export function PanelSectionsEditor({
  value = null, disabled = false, saving = false, error = null, translate, onSave,
}) {
  const t = translatorOf(translate);
  const sections = PANEL_SECTIONS;
  const scopes = [{ key: 'direct', label: '私聊' }, { key: 'group', label: '群聊' }];
  const [draft, setDraft] = React.useState(() => normalizePanelSections(value));
  const [pending, setPending] = React.useState(null);
  const [failed, setFailed] = React.useState(null);
  const locked = disabled || saving || pending !== null;

  React.useEffect(() => {
    if (pending !== null) return;
    setDraft((current) => (JSON.stringify(current) === JSON.stringify(normalizePanelSections(value))
      ? current
      : normalizePanelSections(value)));
  }, [value, pending]);

  const toggle = async (scopeKey, sectionId, nextChecked) => {
    if (locked) return;
    const next = {
      ...draft,
      [scopeKey]: { ...draft[scopeKey], [sectionId]: nextChecked },
    };
    setDraft(next);
    setFailed(null);
    setPending(`${scopeKey}:${sectionId}`);
    try {
      await onSave(next);
    } catch (cause) {
      setDraft(normalizePanelSections(value));
      setFailed(cause?.message ?? String(cause));
    } finally {
      setPending(null);
    }
  };

  const header = h('div', { className: 'dchat-panelSectionsHead' },
    h('span', { className: 'dchat-scopeLabel' }, t('显示项')),
    scopes.map((scope) => h('span', {
      key: scope.key, className: 'dchat-scopeLabel',
    }, t(scope.label))));

  const rows = sections.map((sectionId) => h('div', {
    key: sectionId, className: 'dchat-panelSectionsRow',
  },
  h('span', { className: 'dchat-panelSectionsName' }, t(PANEL_SECTION_LABELS[sectionId])),
  scopes.map((scope) => h('label', {
    key: scope.key,
    className: 'dchat-panelSectionsCheck',
    title: `${t(PANEL_SECTION_LABELS[sectionId])} · ${t(scope.label)}`,
  }, h('input', {
    type: 'checkbox',
    checked: draft[scope.key]?.[sectionId] !== false,
    disabled: locked,
    'aria-label': `${t(PANEL_SECTION_LABELS[sectionId])} · ${t(scope.label)}`,
    onChange: (event) => {
      void toggle(scope.key, sectionId, event.target.checked);
    },
  })))));

  return h(Card, {
    title: t('控制面板显示项'),
    description: t('只影响 /menu 发出来的那张卡片：关掉的项不显示，功能照旧（私聊与群聊分别设置）。'),
    actions: pending !== null ? h('span', { className: 'dchat-status' }, t('保存中…')) : null,
  },
  h('div', { className: 'dchat-panelSections' }, header, rows),
  failed || error ? h('p', { className: 'dchat-error', role: 'alert' }, failed ?? error) : null);
}
