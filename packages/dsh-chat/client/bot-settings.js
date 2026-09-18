/**
 * 渠道页共用的每机器人设置读取/保存钩子。
 *
 * 让每个渠道页都能用三行接好"工作区/模型/预设/上下文增强"这类 hub 持有的设置，
 * 而不必各自实现 RPC、加载态与错误处理。
 *
 * @module dsh-chat/client/bot-settings
 */

import * as React from 'react';

import { callControlRpc, unwrapRpc } from './rpc.js';

/**
 * 读取并保存某个机器人的共享设置。
 *
 * @param options - { connection, channelId, botId, enabled }。
 * @returns {
 *   record, phase, error, options, loadOptions, reload,
 *   saveContextEnhancement, saveWorkspace, saveAgentPreset, saveAccessPolicy,
 * }。
 */
export function useBotSettings({ connection, channelId, botId, enabled = true }) {
  const [state, setState] = React.useState({ phase: 'idle', record: null, error: null });
  /** 设置页的可选项（工作区候选、Agent Preset 列表），按需加载。 */
  const [options, setOptions] = React.useState(null);
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = React.useCallback(async () => {
    if (!enabled || !connection || !channelId || !botId) return;
    setState((current) => ({ ...current, phase: 'loading', error: null }));
    try {
      const result = await callControlRpc(connection, 'bot.settings.get', { channelId, botId });
      const value = unwrapRpc(result);
      if (aliveRef.current) setState({ phase: 'ready', record: value.settings, error: null });
    } catch (error) {
      if (aliveRef.current) setState({ phase: 'error', record: null, error });
    }
  }, [connection, channelId, botId, enabled]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /** 读一次可选项（进设置页时调一次即可）。 */
  const loadOptions = React.useCallback(async () => {
    if (!enabled || !connection || !channelId || !botId) return null;
    try {
      const result = await callControlRpc(connection, 'bot.settings.options', { channelId, botId });
      const value = unwrapRpc(result);
      if (aliveRef.current) setOptions(value);
      return value;
    } catch {
      // 可选项读不到不该让整页报错：对应编辑器退化成"手动输入"。
      if (aliveRef.current) setOptions({ workspacePaths: [], presets: [] });
      return null;
    }
  }, [connection, channelId, botId, enabled]);

  const saveContextEnhancement = React.useCallback(async (config) => {
    const result = await callControlRpc(connection, 'bot.context-enhancement.set', {
      channelId,
      botId,
      config,
    });
    const value = unwrapRpc(result);
    if (aliveRef.current) {
      setState((current) => ({
        ...current,
        phase: 'ready',
        record: { ...(current.record ?? {}), contextEnhancement: value.contextEnhancement },
      }));
    }
    return value.contextEnhancement;
  }, [connection, channelId, botId]);

  /** 通用单字段保存：调端点、把返回值并回 record。 */
  const saveField = React.useCallback(async (method, body, key) => {
    const result = await callControlRpc(connection, method, { channelId, botId, ...body });
    const value = unwrapRpc(result);
    if (aliveRef.current) {
      setState((current) => ({
        ...current,
        phase: 'ready',
        record: { ...(current.record ?? {}), [key]: value[key] ?? null },
      }));
    }
    return value[key] ?? null;
  }, [connection, channelId, botId]);

  const saveWorkspace = React.useCallback(
    (workspace) => saveField('bot.workspace.set', { workspace }, 'workspace'),
    [saveField],
  );
  const saveAgentPreset = React.useCallback(
    (agentPreset) => saveField('bot.agent-preset.set', { agentPreset }, 'agentPreset'),
    [saveField],
  );
  const saveAccessPolicy = React.useCallback(
    (policy) => saveField('bot.access-policy.set', { policy }, 'accessPolicy'),
    [saveField],
  );

  return {
    record: state.record,
    phase: state.phase,
    error: state.error,
    options,
    loadOptions,
    reload: load,
    saveContextEnhancement,
    saveWorkspace,
    saveAgentPreset,
    saveAccessPolicy,
  };
}

/**
 * 该机器人聊过的会话（带人能认出的名字）。
 *
 * 供"指定用户 / 指定群"这类需要填平台 id 的地方做选择器——用户不该被要求记住 `ou_xxx`。
 * 数据与投递列表同源（hub 的持久绑定 + 渠道发现 + 渠道解析的名字）。
 *
 * @param options - { connection, channelId, botId, enabled }。
 * @returns { conversations, phase, error }。
 */
export function useConversations({ connection, channelId, botId, enabled = true }) {
  const [state, setState] = React.useState({ phase: 'idle', conversations: [], error: null });
  const aliveRef = React.useRef(true);

  React.useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = React.useCallback(async () => {
    if (!enabled || !connection || !channelId || !botId) return;
    setState((current) => ({ ...current, phase: 'loading' }));
    try {
      const result = await callControlRpc(connection, 'bot.conversations', { channelId, botId });
      const value = unwrapRpc(result);
      if (aliveRef.current) {
        setState({ phase: 'ready', conversations: value.conversations ?? [], error: null });
      }
    } catch (error) {
      // 选择器只是方便：取不到就退回手填 id，不打扰用户。
      if (aliveRef.current) setState({ phase: 'error', conversations: [], error });
    }
  }, [connection, channelId, botId, enabled]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
