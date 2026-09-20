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
  if (rule.transform === 'none') {
    return raw == null ? undefined : (raw as string);
  }
  const trimmed = raw == null ? '' : String(raw).trim();
  if (rule.transform === 'trimOrUndefined') {
    return trimmed ? trimmed : undefined;
  }
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
    } else if (rule.pattern && (!rule.patternOnlyIfFilled || checkValue)) {
      if (!isPatternValid(rule.pattern, checkValue) && rule.patternMsg) {
        errors.push(rule.patternMsg);
      }
    }

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
  if (errors.length === 0) {
    return { isValid: true, data: data as unknown as T, errors };
  }
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
