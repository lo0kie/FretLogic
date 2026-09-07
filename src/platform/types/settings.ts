export type SyncProviderKind = 'github' | 'gitee' | 'webdav' | 'server';

export interface SyncSettingsBackup {
  syncTarget?: SyncProviderKind;
  githubToken?: string;
  githubOwner?: string;
  githubRepo?: string;
  githubBranch?: string;
  githubPath?: string;
  giteeToken?: string;
  giteeOwner?: string;
  giteeRepo?: string;
  giteeBranch?: string;
  giteePath?: string;
  webdavServerUrl?: string;
  webdavUsername?: string;
  webdavPassword?: string;
  webdavUseDefaultProxy?: boolean;
  webdavProxyUrl?: string;
  serverUrl?: string;
  serverToken?: string;
}

export interface AppPreferencesBackup {
  workbenchChordShorthand?: boolean;
  scoreChordShorthand?: boolean;
  scoreLayoutAlign?: 'start' | 'center';
  scoreShowBarre?: boolean;
  scoreLyricsFontWeight?: ScoreLyricsFontWeight;
}

/** 预览/导出歌词字重（细/常规/粗） */
export type ScoreLyricsFontWeight = 'light' | 'regular' | 'bold';

/** 导出预览背景模式（工作台导出面板与 settingsStore 共用） */
export type ExportBgMode = 'transparent' | 'white' | 'dark';

/** 音频试听音色预设 id（预设参数表定义于 app/services/audio/constants.ts） */
export type AudioTimbreId = 'standard' | 'soft' | 'bright' | 'pluck';

/** 扫弦方向：low 低音弦→高音弦（下扫） / high 高音弦→低音弦（上扫） / inside-out 由内向外。
 * 定义在持久化设置类型层，app 层音频引擎与设置存储共用此值域 */
export type StrumDirection = 'low' | 'high' | 'inside-out';

/** 音频试听可调参数（持久化于 settingsStore.audioPlayback） */
export interface AudioPlaybackSettings {
  /** 音色预设 */
  timbre: AudioTimbreId;
  /** 扫弦相邻弦触发间隔（ms） */
  strumDelayMs: number;
  /** 扫弦方向 */
  strumDirection: StrumDirection;
  /** 主音量（dB） */
  volumeDb: number;
  /** 力度随机拟真（关闭后每弦固定力度，时序抖动同步关闭） */
  humanize: boolean;
  /** 混响干湿比（0~100 百分制，默认与 AUDIO_SETTINGS_DEFAULTS.reverbWet 一致） */
  reverbWet: number;
  /** 合唱效果开关（常驻链路，开/关切换 wet） */
  chorusEnabled: boolean;
}
