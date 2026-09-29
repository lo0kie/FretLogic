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

/** GitHub 同步后端配置 */
export interface GithubSyncBackup {
  kind: 'github';
  token?: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

/** Gitee 同步后端配置 */
export interface GiteeSyncBackup {
  kind: 'gitee';
  token?: string;
  owner: string;
  repo: string;
  branch: string;
  path: string;
}

/** WebDAV 同步后端配置 */
export interface WebdavSyncBackup {
  kind: 'webdav';
  serverUrl: string;
  username?: string;
  password?: string;
  useDefaultProxy?: boolean;
  proxyUrl?: string;
}

/** 线上服务器同步后端配置 */
export interface ServerSyncBackup {
  kind: 'server';
  serverUrl?: string;
  token?: string;
}

/** 备份包内同步配置：按 kind 判别联合，编译器强制各分支字段配套（不再允许 syncTarget:'webdav' 携带 github* 字段） */
export type SyncSettingsBackup = GithubSyncBackup | GiteeSyncBackup | WebdavSyncBackup | ServerSyncBackup;

/** 携带加密凭据块的同步配置（加密后 token/password 被剥离出明文区，secret 块随包携带） */
export type EncryptedSyncSettingsBackup = SyncSettingsBackup & {
  secrets?: EncryptedSecrets;
};

export interface AppPreferencesBackup {
  workbenchChordShorthand?: boolean;
  scoreChordShorthand?: boolean;
  scoreLayoutAlign?: 'start' | 'center';
  scoreShowBarre?: boolean;
  /** 指板位图是否忽略首末的空品格（按实际用到的品位收紧品窗，不低于 MIN_FRET_COUNT 列） */
  scoreTrimEmptyEdgeFrets?: boolean;
  scoreLyricsFontWeight?: ScoreLyricsFontWeight;
  /** 预览/导出：是否显示页脚页码 */
  scoreShowFooter?: boolean;
  /** 预览/导出：连续的无和弦空格是否压缩为一个（整行更紧凑） */
  scoreIgnoreEmptySpace?: boolean;
  /** 预览/导出：歌词折行时是否在续行行首画折线提示（纯绘制开关，不影响排版） */
  scoreShowWrappedLineMark?: boolean;
}

/** 预览/导出歌词字重（细/常规/粗） */
export type ScoreLyricsFontWeight = 'light' | 'regular' | 'bold';

/**
 * 预览/导出标准单页尺寸档位 id（a4 / a5 / letter）。
 *
 * **定义在平台层而非 `domains/score/constants`**：它是持久化设置的值域（`settingsStore` 用
 * `useStorage<ScorePageSizeId>` 存它），而 `platform` 不得反向 import `domains`。
 * `SCORE_PAGE_SIZE_PRESETS`（尺寸/标签等展示数据，属乐谱域）用 `satisfies` 对齐本类型 ——
 * 依赖方向因此单向：域表向平台值域对齐，而不是平台去引域表。
 *
 * 有了它，`getScorePageSize` / worker 载荷 / `getA4Blobs` 的回传值不必再各自退化成 `string`
 * —— 此前联合只在 preset 表里隐式存在、没被导出，取用点只能写 `string`，写错档位 id
 * 只会在运行时静默回落到 A4。
 */
export type ScorePageSizeId = 'a4' | 'a5' | 'letter';

/** 预览/导出页边距档位（px @96dpi，对应 A4 标准 10/15/20mm；与 `SCORE_PAGE_MARGIN_PRESETS` 逐项对应） */
export type ScorePageMargin = 38 | 56 | 76;

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
