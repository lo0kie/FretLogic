// src/types/chord.ts
import { TuningEnum } from '@/utils/musicTheory';

/**
 * ⚡ 纯净的 TypeScript 原生接口实体定义（完美保留全项目编译类型推断）
 */
export interface GuitarStringEntity {
  fret: number;
  preferFlat: boolean;
  isRoot: boolean;
}

export type GuitarStringsModel = [
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
  GuitarStringEntity,
];

export interface Chord {
  id: string;
  chordName: string;
  strings: GuitarStringsModel;
  fretCount: 3 | 4 | 5;
  capo: number;
  groupId: string;
  tuning: TuningEnum;
}

export interface Group {
  id: string;
  name: string;
  collapsed: boolean;
}

export interface ImportExportPayload {
  groups: Group[];
  chords: Chord[];
}

/**
 * 原生正则表单平替校验器，完美兼容 github_pat 与经典 ghp Token 资产
 */
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

    // 原生经典与Pat双正则匹配
    const tokenRegex = /^ghp_[a-zA-Z0-9]{36}$|^github_pat_[a-zA-Z0-9_]{82}$/;

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
