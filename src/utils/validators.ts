export const SettingsSchema = {
  safeParse: (data: {
    githubToken: string;
    githubOwner: string;
    githubRepo: string;
    githubBranch: string;
    githubPath: string;
  }) => {
    const issues: { message: string }[] = [];
    const token = data.githubToken.trim();

    const tokenRegex = /^(ghp|github_pat|gho|ghu|ghs|ghr)_[a-zA-Z0-9_]{10,}$/;

    if (!tokenRegex.test(token)) {
      issues.push({ message: 'GitHub Token 格式不合法' });
    }
    if (!data.githubOwner.trim()) {
      issues.push({ message: '账户名称不能为空' });
    }
    if (!data.githubRepo.trim()) {
      issues.push({ message: '仓库名称不能为空' });
    }
    if (!data.githubPath.trim()) {
      issues.push({ message: '备份路径不能为空' });
    }

    return {
      success: issues.length === 0,
      data: {
        githubToken: token,
        githubOwner: data.githubOwner.trim(),
        githubRepo: data.githubRepo.trim(),
        githubBranch: data.githubBranch.trim() || 'master',
        githubPath: data.githubPath.trim(),
      },
      error: {
        issues,
      },
    };
  },
};
