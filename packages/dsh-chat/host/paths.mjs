/**
 * host 侧路径解析。所有 dsh-chat 数据都放在 DSH_HOME/integrations 下，
 * 渠道自己的历史目录（dsh-feishu / dsh-weixin）继续沿用，保证零重绑。
 *
 * @module dsh-chat/host/paths
 */

import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** @returns DSH_HOME（未设置时回落 ~/.dsh）。 */
export function dshHome() {
  const configured = process.env.DSH_HOME;
  return configured && configured.trim() ? resolve(configured.trim()) : join(homedir(), '.dsh');
}

/**
 * hub 自己的数据目录。
 *
 * @param configured - 插件配置里的 dataDir。
 * @returns 绝对路径。
 */
export function hubDataDir(configured) {
  return configured && String(configured).trim()
    ? resolve(String(configured).trim())
    : join(dshHome(), 'integrations', 'dsh-chat');
}

/**
 * 某个渠道的历史数据目录（沿用 dsh-im 的目录名）。
 *
 * @param name - 目录名，如 'dsh-feishu'。
 * @param integrationRoot - integrations 根目录（默认 DSH_HOME/integrations）。
 * @returns 绝对路径。
 */
export function channelDataDir(name, integrationRoot) {
  return join(integrationRoot ?? join(dshHome(), 'integrations'), name);
}

/**
 * integrations 根目录；测试可用配置覆盖，避免碰到真实用户数据。
 *
 * @param configured - 插件配置里的 integrationRoot。
 * @returns 绝对路径。
 */
export function integrationRoot(configured) {
  return configured && String(configured).trim()
    ? resolve(String(configured).trim())
    : join(dshHome(), 'integrations');
}
