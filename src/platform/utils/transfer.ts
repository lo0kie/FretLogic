/**
 * 数据进出边界：分享链接编解码、同步设置校验、本地文件选取。
 *
 * 合并自 shareLink.ts + validateSettings.ts + filePicker.ts：三者都处在「外部数据进入/离开应用」的关口，
 * 共同点是都要对不可信输入做解析与校验，且调用方多为 transfer / sync 相关服务。
 */

// ──────────────────────────── 以下原 shareLink.ts ────────────────────────────

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
const MAX_SHARE_TOKEN_LENGTH = 24000;

/** 单次 fromCharCode 的字节数：过大数组展开会爆栈，分块转换 */
const CHAR_CHUNK_SIZE = 0x8000;

/** 字节序列 → base64url（去掉 `=` 补位，`+`→`-`、`/`→`_`） */
const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHAR_CHUNK_SIZE)
    binary += String.fromCharCode(...bytes.subarray(i, i + CHAR_CHUNK_SIZE));

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
/**
 * 解压输出上限（字节）：fflate 0.8.3 无 maxSize 选项，故借固定 `out` 缓冲把输出内存锁死，
 * 防解压炸弹（压缩后极小的恶意串可解压出数百 MB，直接撑爆内存）。
 * 真实分享载荷体积极小，8MB 余量充足。
 * 注意：fflate 0.8.3 的 inflateSync(...,{out}) 输出超出缓冲时是**静默截断**（不抛错，
 * 探针实测返回满缓冲）——因此结果恰好填满缓冲时无法与「合法的超大载荷」区分，
 * 按可疑截断处理返回 null（契约：脏输入一律 null）。
 */
const MAX_SHARE_DECODE_BYTES = 8 * 1024 * 1024;

const decodeShareToken = async (token: string): Promise<string | null> => {
  const bytes = base64UrlToBytes(token);
  if (!bytes || bytes.length === 0) return null;
  // 长度前置判：原始压缩串异常长直接拒绝（解压炸弹压缩后体积极小，此举为分配内存双保险）
  if (bytes.length > MAX_SHARE_DECODE_BYTES) return null;
  try {
    const { inflateSync, strFromU8 } = await import('fflate');
    // 借 out 缓冲约束输出内存；恰好填满缓冲视为截断（见上方注释），拒绝而不是吐半截内容
    const decompressed = inflateSync(bytes, { out: new Uint8Array(MAX_SHARE_DECODE_BYTES) });
    if (decompressed.length >= MAX_SHARE_DECODE_BYTES) return null;
    return strFromU8(decompressed);
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
const extractShareToken = (raw: string): string | null => {
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

// ──────────────────────────── 以下原 validateSettings.ts ────────────────────────────

/**
 * 同步设置载荷类型与校验结果结构：GitHub / Gitee / WebDAV 连接配置的表单校验契约。
 */
export interface GithubSettingsPayload {
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  githubPath: string;
}

export interface GiteeSettingsPayload {
  giteeToken: string;
  giteeOwner: string;
  giteeRepo: string;
  giteeBranch: string;
  giteePath: string;
}

export interface WebdavSettingsPayload {
  webdavServerUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavProxyUrl?: string;
}

export interface ServerSettingsPayload {
  serverUrl: string;
  serverToken?: string;
}

/**
 * 校验结果：成功与失败是两个分支，而不是「一个 `data: T` 走天下」。
 *
 * 为什么必须区分：`validateByRules` 对「必填但留空」的字段写入的是 `undefined`，所以**失败分支
 * 的 data 并不满足 T**（T 的必填字段声明为 string）。若统一声明成 `data: T`，等于让类型系统
 * 替运行时撒谎——调用方漏判 `isValid` 就会拿到 undefined，而编译器一声不吭。
 * 改成判别式联合后，「先判 isValid，再用 data」由编译器强制，失败分支只能看见 `Partial<T>`。
 */
export type ValidationResult<T> =
  { isValid: true; data: T; errors: string[] } | { isValid: false; data: Partial<T>; errors: string[] };

/** 字段校验规则：声明式描述单个配置项如何清洗与校验，核心据此统一跑流程。 */
interface FieldRule {
  /** 源载荷字段名 */
  key: string;
  /** 清洗后写入的目标字段名（默认与 key 相同） */
  as?: string;
  /** 是否必填：留空时推送 requiredMsg */
  required?: boolean;
  requiredMsg?: string;
  /** 格式校验：正则，或「合法判定」谓词（返回 true 表示合法） */
  pattern?: RegExp | ((value: string) => boolean);
  patternMsg?: string;
  /** 仅当字段非空时才做 pattern 校验（如可选 Token） */
  patternOnlyIfFilled?: boolean;
  /** 留空时的兜底默认值（如分支名缺省 master） */
  defaultOnEmpty?: string;
  /** 清洗方式：trim（默认）/ none（原样，密码）/ trimOrUndefined（空转 undefined） */
  transform?: 'trim' | 'none' | 'trimOrUndefined';
}

const applyTransform = (rule: FieldRule, raw: unknown): string | undefined => {
  if (rule.transform === 'none') return raw == null ? undefined : (raw as string);

  const trimmed = raw == null ? '' : String(raw).trim();
  if (rule.transform === 'trimOrUndefined') return trimmed || undefined;

  return trimmed;
};

const isPatternValid = (pattern: NonNullable<FieldRule['pattern']>, value: string): boolean =>
  typeof pattern === 'function' ? pattern(value) : pattern.test(value);

/**
 * 通用校验核心：纯函数，取值与规则均由调用方显式传入，自身不设默认值。
 * 返回清洗后的字段表与错误列表；4 个 provider 校验器皆为它的薄壳。
 */
const validateByRules = (
  payload: Record<string, unknown>,
  rules: readonly FieldRule[]
): { errors: string[]; data: Record<string, string | undefined> } => {
  const errors: string[] = [];
  const data: Record<string, string | undefined> = {};

  for (const rule of rules) {
    const cleaned = applyTransform(rule, payload[rule.key]);
    const checkValue = cleaned ?? '';

    if (rule.required && !checkValue) {
      if (rule.requiredMsg) errors.push(rule.requiredMsg);
    } else if (rule.pattern && (!rule.patternOnlyIfFilled || checkValue))
      if (!isPatternValid(rule.pattern, checkValue) && rule.patternMsg) errors.push(rule.patternMsg);

    const isEmpty = checkValue === '';
    data[rule.as ?? rule.key] = isEmpty && rule.defaultOnEmpty !== undefined ? rule.defaultOnEmpty : cleaned;
  }

  return { errors, data };
};

/**
 * 包一层对外契约：薄壳校验器调用它即可，无需关心核心实现。
 *
 * 断言按分支收口：只有 errors 为空时才把 data 断言为 T——这时的 T 是**真**的（每个必填字段
 * 都非空、每条 pattern 都通过）；失败分支只断言到 Partial<T>，与运行时实际的「部分字段为
 * undefined」一致。断言无法消除（T 是泛型、规则表是运行时数据，编译器无从推导），
 * 但被压缩到唯一一处、且每个分支各自成立。
 */
const buildResult = <T>(payload: T, rules: readonly FieldRule[]): ValidationResult<T> => {
  const { errors, data } = validateByRules(payload as Record<string, unknown>, rules);
  if (errors.length === 0) return { isValid: true, data: data as unknown as T, errors };

  return { isValid: false, data: data as unknown as Partial<T>, errors };
};

const URL_PATTERN = /^https?:\/\/.+/;
const GITHUB_TOKEN_PATTERN = /^(ghp|github_pat|gho|ghu|ghs|ghr)_[a-zA-Z0-9_]{10,}$/;
const GITEE_TOKEN_VALID = (value: string): boolean => value.length >= 10 && !/\s/.test(value);

const GITHUB_RULES: FieldRule[] = [
  {
    key: 'githubToken',
    pattern: GITHUB_TOKEN_PATTERN,
    patternMsg: 'GitHub Token 格式不合法',
    patternOnlyIfFilled: true,
  },
  { key: 'githubOwner', required: true, requiredMsg: '账户名称不能为空' },
  { key: 'githubRepo', required: true, requiredMsg: '仓库名称不能为空' },
  { key: 'githubBranch', defaultOnEmpty: 'master' },
  { key: 'githubPath', required: true, requiredMsg: '备份路径不能为空' },
];

const GITEE_RULES: FieldRule[] = [
  { key: 'giteeToken', pattern: GITEE_TOKEN_VALID, patternMsg: 'Gitee Token 格式不合法', patternOnlyIfFilled: true },
  { key: 'giteeOwner', required: true, requiredMsg: '账户名称不能为空' },
  { key: 'giteeRepo', required: true, requiredMsg: '仓库名称不能为空' },
  { key: 'giteeBranch', defaultOnEmpty: 'master' },
  { key: 'giteePath', required: true, requiredMsg: '备份路径不能为空' },
];

const WEBDAV_RULES: FieldRule[] = [
  {
    key: 'webdavServerUrl',
    required: true,
    requiredMsg: 'WebDAV 服务器地址不能为空',
    pattern: URL_PATTERN,
    patternMsg: 'WebDAV 服务器地址需以 http(s):// 开头',
    patternOnlyIfFilled: true,
  },
  { key: 'webdavUsername' },
  { key: 'webdavPassword', transform: 'none' },
  {
    key: 'webdavProxyUrl',
    pattern: URL_PATTERN,
    patternMsg: 'CORS 代理地址需以 http(s):// 开头',
    patternOnlyIfFilled: true,
  },
];

const SERVER_RULES: FieldRule[] = [
  {
    key: 'serverUrl',
    required: true,
    requiredMsg: '服务器接口地址不能为空',
    pattern: URL_PATTERN,
    patternMsg: '服务器接口地址需以 http(s):// 开头',
    patternOnlyIfFilled: true,
  },
  { key: 'serverToken', transform: 'trimOrUndefined' },
];

/** 校验 GitHub 同步配置：Token 格式（可留空）、账户/仓库/路径非空；返回清洗后的载荷与错误列表。 */
export const validateGithubSettings = (data: GithubSettingsPayload): ValidationResult<GithubSettingsPayload> =>
  buildResult(data, GITHUB_RULES);

/**
 * 校验 Gitee 同步配置：Token 可选（公开仓库拉取无需 Token），填写时才做格式粗检
 * （Gitee 私人令牌无固定前缀）；owner/仓库/路径非空。
 */
export const validateGiteeSettings = (data: GiteeSettingsPayload): ValidationResult<GiteeSettingsPayload> =>
  buildResult(data, GITEE_RULES);

/** 校验 WebDAV 同步配置：服务器地址与可选代理地址均须为 http(s) URL。 */
export const validateWebdavSettings = (data: WebdavSettingsPayload): ValidationResult<WebdavSettingsPayload> =>
  buildResult(data, WEBDAV_RULES);

/** 校验自建服务器同步配置：接口地址须为 http(s) URL，Token 可选。 */
export const validateServerSettings = (data: ServerSettingsPayload): ValidationResult<ServerSettingsPayload> =>
  buildResult(data, SERVER_RULES);

// ──────────────────────────── 以下原 filePicker.ts ────────────────────────────

/**
 * 纯函数式文件选择 API：业务层无需再在模版挂隐藏 <input type="file"> 节点。
 *
 * 优先级：
 * 1. 现代 Chromium 系浏览器的 File System Access API（showOpenFilePicker）——返回文件句柄，
 *    无需任何 DOM 节点，也只能在用户手势（点击）中调用，与导入按钮天然契合；
 * 2. 其它环境降级为动态创建 <input type="file"> 触发原生选择框，change 后经微任务把该节点
 *    从 DOM 移除并做空引用回收（避免隐藏节点长期驻留 / 同一文件二次选择失效）。
 *
 * 统一返回 Promise<File | null>：用户取消或选择失败返回 null，业务层 handle 后直接判空即走。
 */

export interface PickFileOptions {
  /** 接受的 MIME 类型 / 扩展名列表（传给 <input accept>），如 '.json'、'application/json' */
  accept?: string;
}

/** 判定浏览器是否具备 File System Access API（隐式 Feature Detection，避免直接引用未定义全局） */
const supportsShowOpenFilePicker = (): boolean =>
  typeof window !== 'undefined' &&
  typeof (window as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function';

/** 常见扩展名 → MIME 映射：showOpenFilePicker 的 types 需要显式 MIME，不能直接给扩展名 */
const EXTENSION_MIME_MAP: Record<string, string> = {
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.xml': 'application/xml',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * 由 accept 推导 showOpenFilePicker 的 types 配置：
 * - MIME 式 accept（含 '/'）直接作为键；
 * - 扩展名式 accept 查映射表得到 MIME；未知扩展名返回 null（省略 types，退化为不过滤，由业务层校验）。
 */
const derivePickerTypes = (accept: string): { description?: string; accept: Record<string, string[]> }[] | null => {
  const acceptMap: Record<string, string[]> = {};
  for (const token of accept
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)) {
    if (token.includes('/')) {
      (acceptMap[token] ??= []).push(token);
      continue;
    }
    const ext = token.startsWith('.') ? token.toLowerCase() : `.${token.toLowerCase()}`;
    const mime = EXTENSION_MIME_MAP[ext];
    // 未知扩展名不做猜测：返回 null 表示无法可靠构造 types，省略过滤
    if (!mime) return null;
    (acceptMap[mime] ??= []).push(ext);
  }
  if (Object.keys(acceptMap).length === 0) return null;
  return [{ accept: acceptMap }];
};

/** 动态创建并触发隐藏文件输入，change 后移除节点并清空 value，供同一文件重复选择 */
const pickViaInput = (options: PickFileOptions): Promise<File | null> =>
  new Promise(resolve => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    if (options.accept) input.accept = options.accept;
    // 必须先用 CSS 隐藏再 append 到文档，点击前不可见、点击后不可残留
    input.className = 'hidden absolute';
    input.style.display = 'none';
    document.body.appendChild(input);

    // 结果只落定一次：change / cancel / 旧环境 focus 兜底三方竞争，先到先得
    let settled = false;
    const cleanup = () => {
      // 微任务回收：先清空 value（允许同一文件重复选择），再从 DOM 移除并释放引用
      queueMicrotask(() => {
        input.value = '';
        input.remove();
      });
    };
    const settle = (value: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onWindowFocus);
      resolve(value);
      cleanup();
    };

    input.addEventListener('change', () => {
      const files = input.files ? Array.from(input.files) : [];
      settle(files[0] ?? null);
    });
    // 现代浏览器在选择框被取消（按 Esc / 关闭）时派发 cancel
    input.addEventListener('cancel', () => settle(null));

    // 旧环境兜底：取消选择框不派发 cancel 也不派发 change，Promise 会永久挂起。
    // 选择框关闭必然伴随窗口重新聚焦，聚焦后延时仍无结果则视为取消（给 change 留出竞速窗口）。
    const onWindowFocus = () => {
      window.setTimeout(() => settle(null), 1000);
    };
    window.addEventListener('focus', onWindowFocus, { once: true });

    input.click();
  });

/**
 * 打开系统文件选择框（单选）并返回所选 File。
 * - File System Access API 环境原生返回 File（句柄 getFile），取消返回 null；
 * - 其它环境（或 API 调用抛错）降级为动态 input，取消 / 无选返回 null。
 */
export async function pickFile(options: PickFileOptions = {}): Promise<File | null> {
  const { accept } = options;

  // 优先：File System Access API（仅限用户手势中调用；本函数默认在点击处理里触发）
  if (supportsShowOpenFilePicker())
    try {
      const picker = (
        window as unknown as {
          showOpenFilePicker: (config?: {
            multiple?: boolean;
            types?: { description?: string; accept: Record<string, string[]> }[];
          }) => Promise<{ getFile: () => Promise<File> }[]>;
        }
      ).showOpenFilePicker;
      const types = accept ? derivePickerTypes(accept) : null;
      const handles = await picker({ multiple: false, ...(types ? { types } : {}) });
      if (!handles?.length) return null;
      const [first] = handles;
      if (!first) return null;
      const file = await first.getFile();
      return file;
    } catch (err) {
      // 仅「用户取消」返回 null（等价于关闭选择框）；其它异常（如缺手势/参数非法）降级到
      // 动态 input 兜底，避免静默失败导致「点击导入无任何反应」
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      return pickViaInput({ accept });
    }

  // 降级：动态 input 触发
  return pickViaInput({ accept });
}
