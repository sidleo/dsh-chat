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
 * @returns { record, phase, error, reload, saveContextEnhancement }。
 */
export function useBotSettings({ connection, channelId, botId, enabled = true }) {
  const [state, setState] = React.useState({ phase: 'idle', record: null, error: null });
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

  return {
    record: state.record,
    phase: state.phase,
    error: state.error,
    reload: load,
    saveContextEnhancement,
  };
}
