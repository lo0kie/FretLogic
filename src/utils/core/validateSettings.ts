/**
 * 同步设置载荷类型与校验结果结构：GitHub / WebDAV 连接配置的表单校验契约。
 */
export interface GithubSettingsPayload {
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  githubPath: string;
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

export interface ValidationResult<T> {
  isValid: boolean;
  data: T;
  errors: string[];
}

export type SettingsValidationResult = ValidationResult<GithubSettingsPayload>;

/** 校验 GitHub 同步配置：Token 格式（可留空）、账户/仓库/路径非空；返回清洗后的载荷与错误列表。 */
export const validateGithubSettings = (data: GithubSettingsPayload): SettingsValidationResult => {
  const errors: string[] = [];
  const token = data.githubToken.trim();
  const tokenRegex = /^(ghp|github_pat|gho|ghu|ghs|ghr)_[a-zA-Z0-9_]{10,}$/;
  if (token && !tokenRegex.test(token)) {
    errors.push('GitHub Token 格式不合法');
  }
  if (!data.githubOwner.trim()) {
    errors.push('账户名称不能为空');
  }
  if (!data.githubRepo.trim()) {
    errors.push('仓库名称不能为空');
  }
  if (!data.githubPath.trim()) {
    errors.push('备份路径不能为空');
  }

  return {
    isValid: errors.length === 0,
    data: {
      githubToken: token,
      githubOwner: data.githubOwner.trim(),
      githubRepo: data.githubRepo.trim(),
      githubBranch: data.githubBranch.trim() || 'master',
      githubPath: data.githubPath.trim(),
    },
    errors,
  };
};

/** 校验 WebDAV 同步配置：服务器地址与可选代理地址均须为 http(s) URL。 */
export const validateWebdavSettings = (data: WebdavSettingsPayload): ValidationResult<WebdavSettingsPayload> => {
  const errors: string[] = [];
  const serverUrl = data.webdavServerUrl.trim();
  const urlRegex = /^https?:\/\/.+/;
  if (!serverUrl) {
    errors.push('WebDAV 服务器地址不能为空');
  } else if (!urlRegex.test(serverUrl)) {
    errors.push('WebDAV 服务器地址需以 http(s):// 开头');
  }

  const proxyUrl = (data.webdavProxyUrl ?? '').trim();
  if (proxyUrl && !/^https?:\/\/.+/.test(proxyUrl)) {
    errors.push('CORS 代理地址需以 http(s):// 开头');
  }

  return {
    isValid: errors.length === 0,
    data: {
      webdavServerUrl: serverUrl,
      webdavUsername: data.webdavUsername.trim(),
      webdavPassword: data.webdavPassword,
      webdavProxyUrl: proxyUrl,
    },
    errors,
  };
};

/** 校验自建服务器同步配置：接口地址须为 http(s) URL，Token 可选。 */
export const validateServerSettings = (data: ServerSettingsPayload): ValidationResult<ServerSettingsPayload> => {
  const errors: string[] = [];
  const serverUrl = data.serverUrl.trim();
  const urlRegex = /^https?:\/\/.+/;
  if (!serverUrl) {
    errors.push('服务器接口地址不能为空');
  } else if (!urlRegex.test(serverUrl)) {
    errors.push('服务器接口地址需以 http(s):// 开头');
  }

  return {
    isValid: errors.length === 0,
    data: {
      serverUrl,
      serverToken: data.serverToken?.trim() || undefined,
    },
    errors,
  };
};
