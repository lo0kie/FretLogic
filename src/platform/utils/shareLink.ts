/**
 * 跨实例传递载体编解码：把文本载荷（FLSONG / FLGROUP / FLCHORD，见 TEXT_FORMAT）压缩后
 * 编码为 URL 安全串（下称 token），供「复制」「分享」「粘贴」「打开链接」四条入口共用。
 *
 * 载体只有一种，形态有两种——token 是数据本体，地址只是它的可点击外壳：
 * - 「复制」→ 剪贴板放**裸 token**；
 * - 「分享」→ 剪贴板放 `#/score?s=<token>` / `#/workbench?s=<token>`；
 * - 「粘贴」与「打开链接」→ 都经 `resolveTransferPayload` 解析：地址 / 裸 token / 任意纯文本。
 * 于是「复制/粘贴」与「分享/打开」不是两套方案，而是同一套载体的两个投放口。
 *
 * 设计取舍：
 * - 载荷仍是既有文字编码（魔数 + 版本 + 字段校验），token 只是它的压缩外壳，
 *   不引入第二套数据模型；
 * - 压缩后体积约 1/3~1/5（常规乐谱 1~2KB），且是无空白的单行串——
 *   纯文本载荷（FLGROUP 的 `;` `|` 紧凑行）经 IM 转发被自动折行即整体解析失败，token 天然免疫；
 * - deflate + base64url：URL 安全字符集更大、串更短，且原始 base64 的
 *   `+` `/` `=` 在查询串里会被二次转义或误解析，url 变体天然规避（`-` `_` 无需转义）；
 * - 压缩库（fflate）走**动态导入**，与「下载为 Zip」同一策略：静态引入会把它塞进首屏 chunk；
 *   为避免每次粘贴普通文本都触发加载，解析前先用纯字符串判形（见 `extractShareToken`）拦一道。
 */

/** 分享链接的数据参数名（形如 `#/score?s=xxx`） */
export const SHARE_LINK_PARAM = 's';

/**
 * 分享 token 长度上限（字符）。
 * URL 本身可到 MB 级，但地址栏可读性、IM 转发与部分客户端的链接截断阈值都远小于此；
 * 超限时宁可明确报错，也不生成一条大概率被截断、打开即失败的链接。
 */
export const MAX_SHARE_TOKEN_LENGTH = 24000;

/** 单次 fromCharCode 的字节数：过大数组展开会爆栈，分块转换 */
const CHAR_CHUNK_SIZE = 0x8000;

/** 字节序列 → base64url（去掉 `=` 补位，`+`→`-`、`/`→`_`） */
const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHAR_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHAR_CHUNK_SIZE));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** base64url → 字节序列；含非法字符时返回 null（不抛错） */
const base64UrlToBytes = (token: string): Uint8Array | null => {
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
};

/** DEFLATE + base64url（压缩库加载失败时抛中文错误，避免把英文 chunk 加载错误透到界面） */
const compressToToken = async (payload: string): Promise<string> => {
  try {
    const { deflateSync, strToU8 } = await import('fflate');
    return bytesToBase64Url(deflateSync(strToU8(payload), { level: 9 }));
  } catch {
    throw new Error('分享数据编码失败，请稍后重试');
  }
};

/** 文本载荷 → 载体 token；超长时抛错（调用方据此提示用户；复制与分享共用同一口径） */
export const encodeShareToken = async (payload: string): Promise<string> => {
  const token = await compressToToken(payload);
  if (token.length > MAX_SHARE_TOKEN_LENGTH) throw new Error('内容过大，无法生成分享数据');
  return token;
};

/**
 * 载体 token → 文本载荷。
 * 对任意脏输入（非法 base64、非法 deflate 流、压缩库加载失败）一律返回 null，不抛错：
 * 输入来自 URL 参数或用户剪贴板，必须假设它可能被截断、篡改或过期。
 */
export const decodeShareToken = async (token: string): Promise<string | null> => {
  const bytes = base64UrlToBytes(token);
  if (!bytes || bytes.length === 0) return null;
  try {
    const { inflateSync, strFromU8 } = await import('fflate');
    return strFromU8(inflateSync(bytes));
  } catch {
    return null;
  }
};

/** 单条 token 的最小长度（字符）：短于此长度的串不可能承载任何载荷，用于把普通文本挡在解码分支之外 */
const MIN_TOKEN_LENGTH = 32;

/** token 字符集：base64url（末尾 `=` 补位已在编码时去掉）。刻意不含空白与换行——文本载荷必含其一 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

/** 地址形态的 token 取值（同时覆盖 `?s=` 与 hash 内 `?s=`；`s` 即 SHARE_LINK_PARAM） */
const SHARE_PARAM_PATTERN = new RegExp(`[?&]${SHARE_LINK_PARAM}=([A-Za-z0-9_-]{${MIN_TOKEN_LENGTH},})`);

/**
 * 从任意粘贴内容中提取 token 候选：整串是 token，或串中含分享地址（IM 转发常带前后文字与标点）。
 * 纯字符串判定，不触发压缩库加载；不像 token 时返回 null。
 */
export const extractShareToken = (raw: string): string | null => {
  const text = raw.trim();
  if (text.length >= MIN_TOKEN_LENGTH && TOKEN_PATTERN.test(text)) return text;
  return SHARE_PARAM_PATTERN.exec(text)?.[1] ?? null;
};

/** 载荷载体：token 为本应用生成的压缩串（含地址形态）| plain 为任意纯文本（含人手写的歌词） */
export type TransferCarrier = 'token' | 'plain';

export type TransferResolveResult =
  { status: 'ok'; payload: string; carrier: TransferCarrier } | { status: 'broken' } | { status: 'empty' };

/**
 * 统一载体解析：「粘贴剪贴板」与「打开链接」共用这一个入口，输入是用户手里的任意文本。
 *
 * 顺序刻意是**先 token、后纯文本**：
 * - 只有形如 token 的输入才会进入解码（压缩库动态导入），普通文本载荷零额外开销；
 * - 整串判形通过却解不开（截断 / 篡改 / 换过压缩实现）判为 broken，**不回退成纯文本**——
 *   否则半截 token 会被当成歌词静默吞进库里；
 * - 判形不通过的输入，再试一次「剥离空白后判形」：IM / 邮件 / 笔记转发长串时常插入软换行，
 *   这层能把被折行的 token 或地址救回来。注意这一步**只做恢复、不做拦截**——恢复失败即照原样
 *   按纯文本返回，故「由英文单词与空格组成的歌词」不会被误判成损坏内容；
 * - 其余输入一律按 plain 原样返回，保住两条能力：直接粘「无结构歌词文本」建谱、
 *   以及旧版本发出的纯文本载荷（历史剪贴板 / 聊天记录）仍可导入。
 */
export const resolveTransferPayload = async (raw: string): Promise<TransferResolveResult> => {
  if (!raw.trim()) return { status: 'empty' };

  const token = extractShareToken(raw);
  if (token) {
    const payload = await decodeShareToken(token);
    return payload ? { status: 'ok', payload, carrier: 'token' } : { status: 'broken' };
  }

  // 折行恢复：仅在「去掉空白后确实像 token」时才多付一次解码，且失败即回落到纯文本
  const compact = raw.replace(/\s+/g, '');
  if (compact !== raw) {
    const compactToken = extractShareToken(compact);
    if (compactToken) {
      const payload = await decodeShareToken(compactToken);
      if (payload) return { status: 'ok', payload, carrier: 'token' };
    }
  }

  return { status: 'ok', payload: raw, carrier: 'plain' };
};

/**
 * 以当前页面为基准拼装分享链接：hash 路由承载目标页，token 置于该页 query。
 * 基于 location.href 而非硬编码 origin，可自动适配子路径部署与开发服务器端口。
 */
export const buildShareUrl = (routePath: string, token: string): string => {
  const url = new URL(window.location.href);
  url.hash = `${routePath}?${SHARE_LINK_PARAM}=${token}`;
  return url.toString();
};
