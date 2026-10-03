import { base64DecodeUtf8, isFunction, isNumber, isObject, isString } from '@/platform/utils/common';
import { MAX_PAYLOAD_BYTES } from '@/platform/utils/constants';

import { SyncError } from './provider';

import type { SyncMeta } from './provider';
import type { ImportExportPayload } from '@/app/types';

/**
 * 同步 provider 共享基类（模板方法）：抽走四个 provider 完全对称的
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

/**
 * 同步提交信息模板（GitHub / Gitee 共用，带时间戳便于区分提交）。
 *
 * 时间戳取 `toISOString()` 而不是 `toLocaleString()`：后者不带 locale / options 时输出随运行
 * 环境的默认 locale 变（同一台机器上是 `2026/9/29 13:47:53`，别的语言环境是另一种写法），
 * 而这条信息会落进云端的提交历史、由别的设备与别的时区的人读 —— 形态必须稳定可读。
 */
export const buildSyncCommitMessage = (): string => `Auto sync fret-logic data: ${new Date().toISOString()}`;

/**
 * GitHub / Gitee 共用的 base64 信封解码：解析 {content} → 去换行 → base64 解码。
 * 内容缺失时抛 INVALID_CLOUD_DATA，避免各自 readRaw 各写一份逐字相同的实现。
 */
export const decodeBase64Envelope = async (response: Response): Promise<string> => {
  const body = await response.json();
  if (!body.content) throw new SyncError('INVALID_CLOUD_DATA', '云端文件内容为空');
  // base64 非法（云端文件被截断/篡改）按内容损坏处理，而不是让 atob 的 InvalidCharacterError
  // 原样穿透 —— 调用方的错误提示需要能读的中文，不是浏览器原文
  const decoded = base64DecodeUtf8(String(body.content).replaceAll(/\n/g, ''));
  if (decoded === null) throw new SyncError('INVALID_CLOUD_DATA', '云端文件内容不是合法的 base64 数据');
  return decoded;
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
    if (isString(detail) && detail) return detail.slice(0, 120);
    return '';
  } catch {
    return '';
  }
};

/**
 * 「：详情」形式的错误后缀——Gitee 与 GitHub 两家的文案格式相同，故共用这一份。
 * 无详情时返回空串（拼接后不留孤立标点）。自建服务器用「 (…)」形态，不走本函数。
 */
export const describeApiError = async (response: Response): Promise<string> =>
  formatApiErrorDetail(await extractApiErrorDetail(response));

/**
 * 错误详情 → 文案后缀。与异步版本分开提供：调用方若需要先拿详情原文做判定
 * （如 GitHub 靠 message 里是否出现 `sha` 区分「版本冲突」与「请求体校验失败」），
 * 只能读一次 body，读完再拼接，不能二次调用 {@link describeApiError}。
 */
export const formatApiErrorDetail = (detail: string): string => (detail ? `：${detail}` : '');

/**
 * 非 2xx 响应的统一错误构造：`REQUEST_FAILED` + 状态码 +（按风格）详情后缀。
 *
 * 为什么返回 SyncError 而不是自己 `throw`：调用方大多是「函数末尾兜底抛」的形态
 * （如 `exists()` 先判 ok / 404，剩下的才算错），由调用方写 `throw await buildApiError(...)`
 * 既保住 TS 的返回路径完整性（不必在末尾补一个不可达 return），也不牺牲可读性。
 *
 * 三种后缀风格**刻意不统一**——它们是用户可见的定位信息，统一属行为变化：
 * - `colon`：`<prefix>：<状态码>：<详情>`（GitHub / Gitee）
 * - `paren`：`<prefix> <状态码> (<详情>)`（自建服务器）
 * - `plain`：`<prefix>：<状态码>`（WebDAV，不读响应体）
 *
 * `plain` 不读体是有意的：WebDAV 的错误体可能是 XML / 二进制，读了也拼不出有用信息，
 * 反而多一次 body 消费。
 */
export type ApiErrorStyle = 'colon' | 'paren' | 'plain';

export const buildApiError = async (
  response: Response,
  prefix: string,
  style: ApiErrorStyle = 'colon'
): Promise<SyncError> => {
  if (style === 'plain') return new SyncError('REQUEST_FAILED', `${prefix}：${response.status}`);

  const detail = await extractApiErrorDetail(response);
  const text =
    style === 'paren'
      ? `${prefix} ${response.status}${detail ? ` (${detail})` : ''}`
      : `${prefix}：${response.status}${formatApiErrorDetail(detail)}`;
  return new SyncError('REQUEST_FAILED', text);
};

/**
 * 探测远端文件是否存在并取回 blob sha（更新远端文件时必需）。
 *
 * 返回 `''` 表示「远端还没有这个文件」（HTTP 404）或「响应体是数组」（Gitee 对不存在的文件
 * 可能回 200 + `[]`，此时拿不到 sha）——调用方据此走「新建」分支。
 * 其余非 2xx 一律抛 REQUEST_FAILED：GitHub / Gitee 的 push 与 pushMeta 四处探测逐字相同，
 * 差异只有前缀文案。
 */
export const probeRemoteSha = async (response: Response, prefix: string): Promise<string> => {
  if (response.ok) {
    const body: unknown = await response.json();
    if (Array.isArray(body)) return '';
    return String((body as { sha?: unknown } | null)?.sha ?? '');
  }
  if (response.status === 404) return '';
  throw await buildApiError(response, prefix);
};

/**
 * 从响应体读取同步 meta（`{ md5, updatedAt }`）：四个 provider 此前各写一遍同一段 typeof 守卫 +
 * 双 null 兜底，唯一差别是取体方式（`response.json()`，或解 base64 信封后再 `JSON.parse`）。
 * 这段守卫是**协议事实**（meta 文件可能被手改、截断或为空），不是某家的实现细节，故收在此处。
 *
 * @param readBody 取体函数。**取体必须留在 thunk 内**：`decodeBase64Envelope` 会在信封为空时抛
 *                 INVALID_CLOUD_DATA，原先它就在 try 内，抛错被吞成「无 meta」；挪到 thunk 外会变成向上抛。
 */
export const readSyncMeta = async (readBody: () => Promise<unknown>): Promise<SyncMeta | null> => {
  try {
    const raw = await readBody();
    if (!isObject(raw)) return null;
    const { md5, updatedAt } = raw as { md5?: unknown; updatedAt?: unknown };
    if (isString(md5) && isNumber(updatedAt)) return { md5, updatedAt };
    return null;
  } catch {
    return null; // meta 损坏视为无 meta，引导重传
  }
};

/**
 * 把「请求超时」延长到响应体读完为止。
 *
 * `fetch` 在**响应头到达**时就 resolve，若那一刻就清掉定时器，超时其实只管到了响应头：
 * 「先给头、后把 body 挂住」的服务器（代理、限流网关、半死连接很常见）会让 `response.text()` /
 * `response.json()` 永久悬停，调用方既等不到数据也等不到超时。这里接管取体入口（text / json），
 * 读完才清定时器；超时中断抛出的 AbortError 与响应头阶段的超时口径统一，一律映射为 TIMEOUT。
 *
 * 不读体的调用方（HEAD 探测、只看 status 的路径）没有清理点：定时器到期后 abort 一个已完成的
 * 响应是空操作，不影响已拿到的结果，最多多留一个定时器到到期。
 */
const withBodyTimeout = (response: Response, timeoutId: ReturnType<typeof setTimeout>): Response => {
  const clear = (): void => clearTimeout(timeoutId);
  const toTimeout = (err: unknown): unknown =>
    err instanceof Error && err.name === 'AbortError' ? new SyncError('TIMEOUT', '请求超时') : err;
  const readText = response.text.bind(response);
  const readJson = response.json.bind(response);
  // 显式标成 Response 自身的方法类型：取体入口是重载/泛型形态，直接赋裸箭头函数容易在
  // 不同的 lib 声明（lib.dom 与 undici-types）之间出现签名不匹配
  const textWithTimeout: Response['text'] = async () => {
    try {
      return await readText();
    } catch (err) {
      throw toTimeout(err);
    } finally {
      clear();
    }
  };
  const jsonWithTimeout: Response['json'] = async () => {
    try {
      return await readJson();
    } catch (err) {
      throw toTimeout(err);
    } finally {
      clear();
    }
  };
  response.text = textWithTimeout;
  response.json = jsonWithTimeout;
  return response;
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
    const target = url ?? (isFunction(deps.defaultUrl) ? deps.defaultUrl() : deps.defaultUrl);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(buildUrl(target), {
        ...init,
        headers: { ...deps.baseHeaders, ...(init.headers as Record<string, string>) },
        signal: controller.signal,
      });
      // 定时器**刻意不在这里清理**：超时必须覆盖取体阶段，清理责任交给 withBodyTimeout
      return withBodyTimeout(response, timeoutId);
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') throw new SyncError('TIMEOUT', '请求超时');

      throw classifyNetworkError(err);
    }
  };

  /** 读取响应原文并解析为 JSON，再经导入校验；解析或校验失败均抛 INVALID_CLOUD_DATA。 */
  const decodePayload = async (response: Response): Promise<ImportExportPayload> => {
    // payload 校验模块（含 zod）动态加载：仅拉取数据时才需要，保持其离开首屏闭包
    const { parseAndValidatePayload } = await import('@/app/services/validation/payload');
    const raw = await readRaw(response);
    // 体积闸门与文件导入侧共用同一常量（MAX_PAYLOAD_BYTES）：云端数据同样是不可信输入，
    // 而 parseAndValidatePayload 内部还会再克隆一份（峰值 2~3 倍），无上限时一个被篡改的
    // 超大包即可把标签页撑爆。此前只有文件导入侧设了这道闸门。
    if (raw.length > MAX_PAYLOAD_BYTES) throw new SyncError('INVALID_CLOUD_DATA', '云端数据体积超出上限');

    const result = parseAndValidatePayload(raw);
    if (result.error === 'EMPTY') throw new SyncError('INVALID_CLOUD_DATA', '云端数据为空');

    if (result.error === 'INVALID_JSON') throw new SyncError('INVALID_CLOUD_DATA', '云端数据不是合法的 JSON');

    if (result.error === 'INVALID_SCHEMA' || !result.payload)
      throw new SyncError('INVALID_CLOUD_DATA', '云端数据格式校验失败');

    return result.payload;
  };

  return { request, decodePayload };
}

/** 共享请求函数签名：由 createSyncProviderBase 产出，供 exists / If-Match 探测等共享 helper 复用。 */
export type SyncRequest = (init: RequestInit, url?: string) => Promise<Response>;

/**
 * exists() 的共享探测：HEAD → 404 即 false / ok 即 true / 405（不支持 HEAD）回退 GET 再判，
 * 其余非 2xx 按 prefix 与 style 抛 REQUEST_FAILED。WebDAV 与自建 server 的这段 11 行逐字相同，
 * 差异只有错误文案风格（WebDAV plain、server paren），故下沉为共享 helper 参数化。
 */
export const probeExistsByHead = async (
  request: SyncRequest,
  prefix: string,
  style: ApiErrorStyle
): Promise<boolean> => {
  const head = await request({ method: 'HEAD' });
  if (head.status === 404) return false;
  if (head.ok) return true;
  // 部分服务器不支持 HEAD，回退到 GET 判断
  if (head.status === 405) {
    const getRes = await request({ method: 'GET' });
    if (getRes.status === 404) return false;
    return getRes.ok;
  }
  throw await buildApiError(head, prefix, style);
};

/**
 * 推送前的 If-Match ETag 探测：HEAD 取当前 ETag，仅接受强验证器（弱 ETag W/ 前缀不能用于条件写）；
 * 探测失败不阻断推送——退化为无条件写，与历史行为一致。
 * WebDAV 与自建 server 的这段同构，差异只有 server 的 HEAD 需按有无 Token 携带认证头（经 headers 注入）。
 */
export const probeIfMatchEtag = async (
  request: SyncRequest,
  headers?: Record<string, string>
): Promise<string | undefined> => {
  try {
    const head = await request({ method: 'HEAD', headers });
    if (head.ok) {
      const etag = head.headers.get('ETag');
      // If-Match 仅接受强验证器，弱 ETag（W/ 前缀）不能用于条件写
      if (etag && !etag.startsWith('W/')) return etag;
    }
  } catch {
    // 探测失败不阻断推送
  }
  return undefined;
};
