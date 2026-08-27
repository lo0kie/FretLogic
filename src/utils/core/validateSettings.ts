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

export interface ValidationResult<T> {
  isValid: boolean;
  data: T;
  errors: string[];
}

export type SettingsValidationResult = ValidationResult<GithubSettingsPayload>;

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
