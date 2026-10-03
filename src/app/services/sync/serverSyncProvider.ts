import { serializeForStorage } from '@/platform/utils/common';
import { CLOUD_SYNC_CONFIG } from '@/platform/utils/constants';

import { computePayloadMaxUpdatedAt, computePayloadMd5 } from './payloadChecksum';
import { SyncError } from './provider';
import {
  buildApiError,
  createSyncProviderBase,
  extractApiErrorDetail,
  probeExistsByHead,
  probeIfMatchEtag,
  readSyncMeta,
} from './syncBase';

import type { ServerSyncConfig, SyncProvider } from './provider';

/** 非 2xx 的错误文案前缀（自建服务器用 `paren` 后缀风格，与 GitHub / Gitee 的「：」区分开） */
const SERVER_ERROR_PREFIX = '服务器返回错误状态码';

/**
 * 线上服务器（Custom Server / Cloudflare Worker D1）同步 provider。
 *
 * 由 Vite 构建环境注入服务地址与环境标识，无需用户在界面配置 Token 或接口地址。
 * 根据构建环境自动分发至对应的开发 / 生产数据库。
 *
 * 协议约定：
 *  - pull(): GET ${serverUrl}，返回 ImportExportPayload JSON。
 *  - push(): POST ${serverUrl}，携带 Content-Type: application/json 与 JSON 字符串体。
 *  - testConnection(): GET ${serverUrl} 探测连通性；已配置 Token 时再请求 /auth-check 校验写鉴权，
 *    据此区分「仅可读取」与「可上传」两种结论。
 */

/** 创建线上服务器同步 provider：pull 走 GET、push 走 POST，环境标识随请求头分发。
 *  token 在上传（push）请求与测试连接的鉴权探测（/auth-check）上携带，纯拉取保持公开
 *  （与同步设置面板"仅推送需 Token"一致）。 */
export function createServerSyncProvider(config?: Partial<ServerSyncConfig>): SyncProvider {
  const serverUrl = (config?.serverUrl?.trim() || CLOUD_SYNC_CONFIG.SERVER_URL).trim();
  const serverToken = config?.token?.trim();
  /** 独立校验元数据载体：后端 `/meta` 端点返回小对象 {md5, updatedAt}，推送前的判等与冲突判定只拉这份最小数据 */
  const metaUrl = `${serverUrl.replace(/\/+$/, '')}/meta`;
  /** 写鉴权探测端点：后端 `/auth-check` 只校验 Token、不落库，供测试连接区分有无 Token 时使用 */
  const authCheckUrl = `${serverUrl.replace(/\/+$/, '')}/auth-check`;

  const baseHeaders: Record<string, string> = {
    'X-Environment': CLOUD_SYNC_CONFIG.MODE,
  };

  const { request, decodePayload } = createSyncProviderBase({
    baseHeaders,
    defaultUrl: serverUrl,
    classifyNetworkError: err => {
      const detail = err instanceof Error ? err.message : String(err);
      return new SyncError('NETWORK', `请求服务器失败：请检查网络或地址有效性。底层错误：${detail}`);
    },
  });

  return {
    async pull() {
      const response = await request({ method: 'GET' });
      if (response.status === 404) throw new SyncError('FILE_NOT_FOUND', '服务端暂无已保存的数据');
      if (!response.ok) throw await buildApiError(response, SERVER_ERROR_PREFIX, 'paren');
      return decodePayload(response);
    },
    async exists() {
      return probeExistsByHead(request, SERVER_ERROR_PREFIX, 'paren');
    },
    async push(payload, meta) {
      // 校验元数据（md5/updatedAt）随本次 POST 以 query 提交，后端落库供 `/meta` 轻量读取；
      // 数据体仍是干净的 schema 序列化，meta 不内嵌。
      // md5 复用调用方算好的值（syncActions 在 fetchMeta 防线处已算过一次），
      // 此处不再为拼 query 把整包重新 stringify——缺省时才自算兜底
      const resolvedMeta = meta ?? {
        md5: computePayloadMd5(payload),
        updatedAt: computePayloadMaxUpdatedAt(payload),
      };
      // 分隔符与百分号编码交给原生 URL：源地址已带 query 时 URLSearchParams 自己按 `&` 追加
      //（原写法靠 `includes('?')` 手工取舍，遇到以 `?` 结尾的源地址会拼出 `?&md5=`）。
      // md5 是十六进制、updatedAt 是整数，URLSearchParams 的 urlencoded 序列化与
      // encodeURIComponent 对这两个值逐字节一致，故服务端读到的 query 不变。
      // 地址非法时 new URL 抛的是原生 TypeError，会被上层兜成「云端操作失败，请检查网络或配置信息」——
      // 定位信息全丢。这里就地归一化为 SyncError，把「是配置问题」讲清楚。
      let pushUrl: URL;
      try {
        pushUrl = new URL(serverUrl);
      } catch {
        throw new SyncError('REQUEST_FAILED', '自建服务器地址无效，请在同步设置中检查');
      }
      pushUrl.searchParams.set('md5', resolvedMeta.md5);
      pushUrl.searchParams.set('updatedAt', String(resolvedMeta.updatedAt));
      // 条件写（If-Match）：推送前探测当前 ETag，携带后若服务端数据已被其他设备更新，
      // 服务器将以 412 拒绝写入，避免后写静默覆盖前写（走下方 CONFLICT 分支）。
      // 这是「协议层」防线，与 syncActions 里 fetchMeta 比对的「逻辑层」防线互补：
      // 后者只在推送前那一刻生效，两次请求之间仍可能被并发写入插入，这一层正好补上该窗口。
      // 服务端（worker/index.mjs 的 POST 分支）已实现 If-Match 比对；拿不到 ETag 时
      // （旧版 Worker / 第三方服务器 / 探测失败）仍退化为无条件写，与历史行为一致。
      const ifMatch = await probeIfMatchEtag(request, serverToken ? { Authorization: `Bearer ${serverToken}` } : {});
      const response = await request(
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(serverToken ? { Authorization: `Bearer ${serverToken}` } : {}),
            ...(ifMatch ? { 'If-Match': ifMatch } : {}),
          },
          body: serializeForStorage(payload),
        },
        pushUrl.toString()
      );
      if (response.status === 412) throw new SyncError('CONFLICT', '服务端数据已被其他设备更新，请先拉取最新数据');

      if (!response.ok) throw await buildApiError(response, SERVER_ERROR_PREFIX, 'paren');
      const etag = response.headers.get('ETag') ?? Date.now().toString();
      return { sha: etag };
    },
    async fetchMeta() {
      const response = await request({ method: 'GET' }, metaUrl);
      if (response.status === 404) return null; // 云端无 meta（旧数据/从未上传）
      if (!response.ok) throw await buildApiError(response, SERVER_ERROR_PREFIX, 'paren');
      return readSyncMeta(() => response.json());
    },
    async pushMeta() {
      // server 为单写入口：md5/updatedAt 已在 push 的 query 里提交，无独立的 meta 写请求
    },
    async testConnection(): Promise<string> {
      const response = await request({ method: 'GET' });
      const envLabel = CLOUD_SYNC_CONFIG.IS_DEV ? '开发环境' : '生产环境';
      if (!response.ok && response.status !== 404) throw await buildApiError(response, SERVER_ERROR_PREFIX, 'paren');
      // 404 表示服务端在线但尚无存档，与 200 同属「已连通」
      const reach = response.status === 404 ? `${envLabel}在线，暂无存档` : `已连通${envLabel}`;

      // 未配置 Token：只验证只读可达，明确告知无法上传（push 需 Bearer 鉴权）
      if (!serverToken) return `${reach}，未配置 Token（只读）`;

      // 已配置 Token：额外校验写鉴权。走独立的 /auth-check（只校验、不落库），
      // 不能用真实 POST 探测——那会往 sync_data / sync_history 写一份测试快照，污染历史版本
      const authRes = await request(
        { method: 'GET', headers: { Authorization: `Bearer ${serverToken}` } },
        authCheckUrl
      );
      if (authRes.ok) {
        // 解析失败或缺少 authorized 标记都算未授权：旧版 Worker 没有该端点，
        // 请求会被通用 GET 分支接走，返回的是数据包而非鉴权结果
        const authorized = await authRes
          .json()
          .then((body: { authorized?: unknown }) => body.authorized === true)
          .catch(() => false);
        if (authorized) return `${reach}，Token 有效，可上传`;
        throw new SyncError('REQUEST_FAILED', 'Worker 未支持鉴权探测，请重新部署');
      }
      const detail = await extractApiErrorDetail(authRes);
      throw new SyncError(
        'REQUEST_FAILED',
        authRes.status === 401
          ? `Token 无效，无法上传${detail ? `（${detail}）` : ''}`
          : `Token 校验失败（HTTP ${authRes.status}）`
      );
    },
  };
}
