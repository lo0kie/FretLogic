import { parseAndValidatePayload } from '@/app/services/validation/payload';
import { base64DecodeUtf8 } from '@/platform/utils/common';

import { SyncError } from './provider.ts';

import type { ImportExportPayload } from '@/app/types';

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
  /** 从响应体读取原始字符串：GitHub/Gitee 走 base64 信封解码，其余默认纯文本 */
  readRaw?: (response: Response) => Promise<string>;
}

/** 同步请求统一超时（毫秒）：各 provider 不再各自声明，直接使用该默认值。 */
export const SYNC_TIMEOUT_MS = 15000;

/** 同步提交信息模板（GitHub / Gitee 共用，带本地时间戳便于区分提交） */
export const buildSyncCommitMessage = (): string => `Auto sync fret-logic data: ${new Date().toLocaleString()}`;

/**
 * GitHub / Gitee 共用的 base64 信封解码：解析 {content} → 去换行 → base64 解码。
 * 内容缺失时抛 INVALID_CLOUD_DATA，避免各自 readRaw 各写一份逐字相同的实现。
 */
export const decodeBase64Envelope = async (response: Response): Promise<string> => {
  const body = await response.json();
  if (!body.content) throw new SyncError('INVALID_CLOUD_DATA', '云端文件内容为空');
  return base64DecodeUtf8(String(body.content).replace(/\n/g, ''));
};

/**
 * 提取错误响应中的说明文字（{"message": ...} 或 {"error": ...}，message 优先），
 * 用于区分 401 是令牌无效还是权限不足等。返回纯文本（不带标点前缀），
 * 由各调用方按自己的文案格式拼接（Gitee 用「：」、自建服务器用「 (…)」）；截断至 120 字符。
 */
export const extractApiErrorDetail = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown };
    const detail = body.message ?? body.error;
    if (typeof detail === 'string' && detail) return detail.slice(0, 120);
    return '';
  } catch {
    return '';
  }
};

/** 创建共享基类实例：返回统一的请求函数与响应体解码校验函数，差异点由 deps 注入。 */
export function createSyncProviderBase(deps: SyncBaseDeps) {
  const TIMEOUT_MS = SYNC_TIMEOUT_MS;
  const buildUrl = deps.buildUrl ?? ((url: string) => url);
  const classifyNetworkError =
    deps.classifyNetworkError ??
    ((err: unknown) => new SyncError('NETWORK', err instanceof Error ? err.message : '网络请求失败'));
  /** 默认按纯文本读取响应体（server / WebDAV 无需注入） */
  const readRaw = deps.readRaw ?? (async (response: Response) => response.text());

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

  /** 读取响应原文并解析为 JSON，再经导入校验；解析或校验失败均抛 INVALID_CLOUD_DATA。 */
  const decodePayload = async (response: Response): Promise<ImportExportPayload> => {
    const result = parseAndValidatePayload(await readRaw(response));
    if (result.error === 'EMPTY') {
      throw new SyncError('INVALID_CLOUD_DATA', '云端数据为空');
    }
    if (result.error === 'INVALID_JSON') {
      throw new SyncError('INVALID_CLOUD_DATA', '云端数据不是合法的 JSON');
    }
    if (result.error === 'INVALID_SCHEMA' || !result.payload) {
      throw new SyncError('INVALID_CLOUD_DATA', '云端数据格式校验失败');
    }
    return result.payload;
  };

  return { request, decodePayload };
}
