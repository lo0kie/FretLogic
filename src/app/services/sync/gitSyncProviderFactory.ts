import { base64EncodeUtf8, serializeForStorage } from '@/platform/utils/common';

import { SyncError } from './provider';
import {
  buildApiError,
  createSyncProviderBase,
  decodeBase64Envelope,
  describeApiError,
  probeRemoteSha,
  readSyncMeta,
} from './syncBase';

import type { SyncProvider } from './provider';
import type { SyncRequest } from './syncBase';

/**
 * git-host（GitHub / Gitee）provider 的差异点。两家的 pull / exists / fetchMeta / pushMeta /
 * testConnection 五个方法逐字同构（push 因冲突判定与状态码细节各家不同，留在各 provider），
 * 参照 payload.ts 的 gitBranchSchema<K> 泛型工厂模式，把差异点参数化后收敛到这一份实现。
 */
export interface GitSyncProviderDeps {
  /** 传给共享骨架的请求头：GitHub `Authorization: Bearer`、Gitee `Authorization: token`，由调用方按家构造 */
  baseHeaders?: Record<string, string>;
  /** GET 默认地址（可延迟求值）：pull / exists / push 探测走它，拼接保持各家现状（GitHub 不编码 ref、Gitee 编码） */
  defaultUrl: string | (() => string);
  /** 用户可见的主机标签（'GitHub' / 'Gitee'），用于 testConnection 成功文案 */
  hostLabel: string;
  /** 是否已配置 Token：testConnection 成功文案据此区分（与 config.token 同值） */
  hasToken: boolean;
  /** 数据文件读写非 2xx 的错误文案前缀 */
  errorPrefix: string;
  /** meta 写入非 2xx 的专用文案前缀 */
  metaErrorPrefix: string;
  /** meta 文件读取地址（带分支 ref，拼接逐字节保持各家现状） */
  metaFetchUrl: string;
  /** meta 文件写入地址（裸地址，不带 ref） */
  metaWriteUrl: string;
  /** testConnection 的仓库探测地址 */
  repoProbeUrl: string;
  /** 创建/更新方法分流：GitHub 恒 PUT（单 PUT 自动创建），Gitee 依有无 sha 分 POST/PUT */
  writeMethod: (hasSha: boolean) => 'PUT' | 'POST';
  /**
   * meta 写入请求体：字段顺序保留各家现状（GitHub message 在前、Gitee content 在前），
   * 确保请求体字节不变。encoded 为 base64 后的 meta 内容，sha 为探测到的远端 blob sha（无则空串）。
   */
  buildMetaWriteBody: (encoded: string, sha: string) => string;
}

/**
 * 创建 git-host 同步 provider 的五个共享方法，并交还共享请求函数：
 * push 与 push 的冲突判定逻辑各家不同，由调用方用 `request` 自行实现后与本结果合并。
 */
export function createGitSyncProviderMethods(
  deps: GitSyncProviderDeps
): Omit<SyncProvider, 'push'> & { request: SyncRequest } {
  const { request, decodePayload } = createSyncProviderBase({
    baseHeaders: deps.baseHeaders,
    defaultUrl: deps.defaultUrl,
    readRaw: decodeBase64Envelope,
  });

  return {
    request,
    async pull() {
      const response = await request({ method: 'GET' });
      if (response.status === 404) throw new SyncError('FILE_NOT_FOUND', '云端文件不存在');
      if (!response.ok) throw await buildApiError(response, deps.errorPrefix);
      return decodePayload(response);
    },
    async exists() {
      const response = await request({ method: 'GET' });
      if (response.ok) return true;
      if (response.status === 404) return false;
      throw await buildApiError(response, deps.errorPrefix);
    },
    async fetchMeta() {
      const response = await request({ method: 'GET' }, deps.metaFetchUrl);
      if (response.status === 404) return null; // 旧数据/从未上传：无独立 meta
      if (!response.ok) throw await buildApiError(response, deps.errorPrefix);
      return readSyncMeta(async () => JSON.parse(await decodeBase64Envelope(response)));
    },
    async pushMeta(meta) {
      // 探测必须带 ref（T1 同源修复）：不带 ref 时读默认分支，目标分支已有 meta 会被误判
      // （GitHub 误判有无 sha，Gitee 误判 200+[] 拿不到 sha → POST 新建必失败）
      const existing = await request({ method: 'GET' }, deps.metaFetchUrl);
      const sha = await probeRemoteSha(existing, deps.errorPrefix);

      const response = await request(
        {
          method: deps.writeMethod(sha !== ''),
          headers: { 'Content-Type': 'application/json' },
          body: deps.buildMetaWriteBody(base64EncodeUtf8(serializeForStorage(meta)), sha),
        },
        deps.metaWriteUrl
      );
      if (!response.ok) throw await buildApiError(response, deps.metaErrorPrefix);
    },
    async testConnection(): Promise<string> {
      // 仅探测仓库可达性与 Token 有效性，不依赖 branch/path（分支与文件路径由「查询分支」/拉取负责）
      const response = await request({ method: 'GET' }, deps.repoProbeUrl);
      if (response.ok)
        return deps.hasToken
          ? `${deps.hostLabel} 仓库可达，Token 有效`
          : `${deps.hostLabel} 仓库可达（公开仓库，未配置 Token）`;

      if (response.status === 401)
        throw new SyncError('REQUEST_FAILED', `Token 无效或已过期${await describeApiError(response)}`);
      if (response.status === 404)
        throw new SyncError(
          'REQUEST_FAILED',
          deps.hasToken ? '仓库不存在，或 Token 无该仓库权限' : '仓库不存在或为私有仓库（私有需配置 Token）'
        );

      throw await buildApiError(response, deps.errorPrefix);
    },
  };
}
