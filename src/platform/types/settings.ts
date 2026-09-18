export type SyncProviderKind = 'github' | 'gitee' | 'webdav' | 'server';

/** 备份包内经 AES-GCM 加密的敏感凭据块（算法细节见 app/services/backup/backupCrypto.ts） */
export interface EncryptedSecrets {
  /** 格式版本：1 = 无 iter（解密按历史常量 150k）；2 = 随包携带 iter */
  v: number;
  /**
   * PBKDF2 迭代次数（v2 起必填）。解密侧必须读它而不能跟随当前常量，否则一旦调高迭代数，
   * 所有历史备份都会派生出不同密钥、被 GCM 判为损坏（用户只会看到「密码错误」）。
   */
  iter?: number;
  /** PBKDF2 盐（base64） */
  salt: string;
  /** AES-GCM IV（base64） */
  iv: string;
  /** 密文（base64）：明文为 { [字段名]: string } 的 JSON */
  data: string;
}

export interface SyncSettingsBackup {
  syncTarget?: SyncProviderKind;
  /** 加密敏感凭据块：存在时四个 Token/密码字段已被剥离出明文 */
  secrets?: EncryptedSecrets;
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
  /** 预览/导出：是否显示页脚页码 */
  scoreShowFooter?: boolean;
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
