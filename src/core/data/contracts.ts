/**
 * v2 数据契约（IndexedDB 持久化格式）。
 *
 * 设计目标：
 * - 与 UI 解耦的纯数据模型，可独立序列化；
 * - 版本化（DATA_CONTRACT_VERSION），结构变更时通过迁移升级而非静默破坏；
 * - 所有字段显式可空，避免运行时隐式 undefined。
 */
import type { Chord, Group, Song } from '@/types';

/** 当前数据契约版本。任何破坏性结构变更递增此值并补迁移。 */
export const DATA_CONTRACT_VERSION = 2;

/** 和弦库数据切片（IDB `chords` + `groups` 对象库的内容） */
export interface ChordLibrarySlice {
  version: number;
  groups: Group[];
  chords: Chord[];
}

/** 曲库数据切片（IDB `songs` 对象库的内容） */
export interface SongLibrarySlice {
  version: number;
  songs: Song[];
}

/** 应用设置（IDB `settings` 键值库） */
export interface AppSettings {
  /** GitHub 同步配置 */
  github: {
    owner: string;
    repo: string;
    branch: string;
    path: string;
  };
  /** 谱面视图偏好 */
  score: {
    fontScale: number;
    fretboardScale: number;
    scrollSpeed: number;
  };
  /** 界面偏好 */
  ui: {
    leftOpen: boolean;
    editable: boolean;
    theme: 'light' | 'dark' | 'auto';
  };
}

/** GitHub 同步元信息（IDB `syncMeta` 键值库） */
export interface SyncMeta {
  lastSyncAt: string | null;
  lastPushedSha: string | null;
  lastPulledSha: string | null;
}

/** settings/syncMeta 键名 */
export const SETTINGS_KEY = 'app';
export const SYNC_META_KEY = 'sync';

/** 创建默认设置 */
export function createDefaultSettings(): AppSettings {
  return {
    github: { owner: '', repo: '', branch: 'master', path: 'backup/chords.json' },
    score: { fontScale: 1, fretboardScale: 1, scrollSpeed: 1 },
    ui: { leftOpen: true, editable: true, theme: 'auto' },
  };
}

/** 创建默认同步元信息 */
export function createDefaultSyncMeta(): SyncMeta {
  return { lastSyncAt: null, lastPushedSha: null, lastPulledSha: null };
}
