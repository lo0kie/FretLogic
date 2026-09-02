import { validateImportExportPayload } from '@/services/validation/payload';
import type { ImportExportPayload } from '@/types';

import { SyncError } from './provider';

/**
 * 同步 provider 共享基类（模板方法）：抽走两个 provider 完全对称的
 * 「超时控制 + AbortError→TIMEOUT + 网络错误分类」和「响应体→JSON→校验」逻辑。
 * 各 provider 只通过 deps 注入差异点：请求头、URL 构造、网络错误分类、原始响应读取。
 */
export interface SyncBaseDeps {
  baseHeaders?: Record<string, string>;
  /** GET 默认地址；也可传函数以延迟求值 */
  defaultUrl: string | (() => string);
  /** 实际请求前对 URL 做转换（如 WebDAV 经 CORS 代理转发） */
  buildUrl?: (url: string) => string;
  /** 网络/CORS 模糊错误的细分类别（默认全部归为 NETWORK） */
  classifyNetworkError?: (err: unknown) => SyncError;
  /** 从响应体读取原始字符串：GitHub 走 base64 解码，WebDAV 走纯文本 */
  readRaw: (response: Response) => Promise<string>;
  timeoutMs?: number;
}

/** 创建共享基类实例：返回统一的请求函数与响应体解码校验函数，差异点由 deps 注入。 */
export function createSyncProviderBase(deps: SyncBaseDeps) {
  const TIMEOUT_MS = deps.timeoutMs ?? 15000;
  const buildUrl = deps.buildUrl ?? ((url: string) => url);
  const classifyNetworkError =
    deps.classifyNetworkError ??
    ((err: unknown) => new SyncError('NETWORK', err instanceof Error ? err.message : '网络请求失败'));

  /** 发起请求：默认 GET 地址可延迟求值；超时中断映射为 TIMEOUT，网络错误按 deps 细分类别。 */
  const request = async (init: RequestInit, url?: string): Promise<Response> => {
    const target = url ?? (typeof deps.defaultUrl === 'function' ? deps.defaultUrl() : deps.defaultUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(buildUrl(target), {
        ...init,
        headers: { ...deps.baseHeaders, ...(init.headers as Record<string, string>) },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new SyncError('TIMEOUT', '请求超时');
      }
      throw classifyNetworkError(err);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  /** 读取响应原文并解析为 JSON，再经导入校验；JSON 或校验失败均抛 INVALID_CLOUD_DATA。 */
  const decodePayload = async (response: Response): Promise<ImportExportPayload> => {
    const raw = await deps.readRaw(response);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new SyncError('INVALID_CLOUD_DATA', '云端数据不是合法的 JSON');
    }
    const result = validateImportExportPayload(parsed);
    if (!result.isValid || !result.payload) {
      throw new SyncError('INVALID_CLOUD_DATA', '云端数据格式校验失败');
    }
    return result.payload;
  };

  return { request, decodePayload };
}
