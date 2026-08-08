export interface SettingsPayload {
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  githubPath: string;
}

export interface SettingsValidationResult {
  isValid: boolean;
  data: SettingsPayload;
  errors: string[];
}

export const validateSettings = (data: SettingsPayload): SettingsValidationResult => {
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
