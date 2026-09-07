/**
 * 同步与偏好设置 store：同步目标（GitHub / Gitee / WebDAV / Server）凭据与路径、应用偏好项。
 * 敏感字段（token/密码）仅驻留内存，不参与云同步推送。
 */
import { ref } from 'vue';

import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';

import {
  AUDIO_SETTINGS_DEFAULTS,
  GITEE_SYNC_CONFIG,
  GITHUB_SYNC_CONFIG,
  STORAGE_KEYS,
} from '@/platform/utils/constants';

import type {
  AppPreferencesBackup,
  AudioPlaybackSettings,
  ExportBgMode,
  ScoreLyricsFontWeight,
  SyncProviderKind,
  SyncSettingsBackup,
} from '@/platform/types';

/** 音频播放参数序列化器：读取时迁移旧版混响干湿比（0~1）为百分制（0~100） */
const audioPlaybackSerializer = {
  read: (raw: string): AudioPlaybackSettings => {
    const parsed = JSON.parse(raw) as Partial<AudioPlaybackSettings>;
    // 旧版干湿比上限 1，新版百分制默认 20（下限可为 0），值 < 2 必为旧版小数
    if (typeof parsed.reverbWet === 'number' && parsed.reverbWet < 2) {
      parsed.reverbWet = parsed.reverbWet * 100;
    }
    return parsed as AudioPlaybackSettings;
  },
  write: (v: AudioPlaybackSettings): string => JSON.stringify(v),
};

export const useSettingsStore = defineStore('settings', () => {
  const syncTarget = useStorage<SyncProviderKind>(STORAGE_KEYS.SYNC_TARGET, 'gitee');

  // GitHub 同步配置（默认由 GITHUB_SYNC_CONFIG 提供仓库与环境分支）
  const githubToken = ref('');
  const githubOwner = useStorage(STORAGE_KEYS.GH_OWNER, GITHUB_SYNC_CONFIG.DEFAULT_OWNER);
  const githubRepo = useStorage(STORAGE_KEYS.GH_REPO, GITHUB_SYNC_CONFIG.DEFAULT_REPO);
  const githubBranch = useStorage(STORAGE_KEYS.GH_BRANCH, GITHUB_SYNC_CONFIG.DEFAULT_BRANCH);
  const githubPath = useStorage(STORAGE_KEYS.GH_PATH, GITHUB_SYNC_CONFIG.DEFAULT_PATH);
  const githubBranches = useStorage(STORAGE_KEYS.GH_BRANCHES, <string[]>[]);

  // Gitee 同步配置（默认由 GITEE_SYNC_CONFIG 提供仓库与分支）
  const giteeToken = ref('');
  const giteeOwner = useStorage(STORAGE_KEYS.GE_OWNER, GITEE_SYNC_CONFIG.DEFAULT_OWNER);
  const giteeRepo = useStorage(STORAGE_KEYS.GE_REPO, GITEE_SYNC_CONFIG.DEFAULT_REPO);
  const giteeBranch = useStorage(STORAGE_KEYS.GE_BRANCH, GITEE_SYNC_CONFIG.DEFAULT_BRANCH);
  const giteePath = useStorage(STORAGE_KEYS.GE_PATH, GITEE_SYNC_CONFIG.DEFAULT_PATH);
  const giteeBranches = useStorage(STORAGE_KEYS.GE_BRANCHES, <string[]>[]);

  // 迁移一次性兼容：早期 Gitee 预设曾沿用 GitHub 值（lo0kie/FretLogic）且分支固定 master，
  // useStorage 的持久化值优先于新默认，故在此把历史遗留值纠正到新预设（分支按 dev/prod 分流）
  if (giteeOwner.value === 'lo0kie') giteeOwner.value = GITEE_SYNC_CONFIG.DEFAULT_OWNER;
  if (giteeRepo.value === 'FretLogic') giteeRepo.value = GITEE_SYNC_CONFIG.DEFAULT_REPO;
  if (giteeBranch.value === 'master') giteeBranch.value = GITEE_SYNC_CONFIG.DEFAULT_BRANCH;

  // WebDAV 同步配置（支持选择使用预设代理或自定义代理）
  const webdavServerUrl = useStorage(STORAGE_KEYS.WEBDAV_SERVER_URL, '');
  const webdavUsername = useStorage(STORAGE_KEYS.WEBDAV_USERNAME, '');
  // WebDAV 密码统一为纯内存态（与 githubToken/giteeToken/serverToken 一致，不落盘 localStorage）
  const webdavPassword = ref('');
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEYS.WEBDAV_PASSWORD);
  }
  const webdavUseDefaultProxy = useStorage(STORAGE_KEYS.WEBDAV_USE_DEFAULT_PROXY, true);
  const webdavProxyUrl = useStorage(STORAGE_KEYS.WEBDAV_PROXY_URL, '');

  // 线上服务器同步配置
  const serverUrl = useStorage(STORAGE_KEYS.SERVER_URL, '');
  const serverToken = ref('');

  // 工作台乐理显示偏好
  const workbenchChordShorthand = useStorage<boolean>(STORAGE_KEYS.WORKBENCH_CHORD_SHORTHAND, false);

  // 乐谱乐理显示偏好
  const scoreChordShorthand = useStorage<boolean>(STORAGE_KEYS.SCORE_CHORD_SHORTHAND, false);

  // 乐谱排版对齐偏好（start 起始位置 / center 居中对齐）
  const scoreLayoutAlign = useStorage<'start' | 'center'>(STORAGE_KEYS.SCORE_LAYOUT_ALIGN, 'start');

  // 乐谱乐理显示偏好：是否绘制大横按（排列和弦/预览共用）
  const scoreShowBarre = useStorage<boolean>(STORAGE_KEYS.SCORE_SHOW_BARRE, true);

  // 预览/导出：歌词字重（light 细 / regular 常规 / bold 粗）
  const scoreLyricsFontWeight = useStorage<ScoreLyricsFontWeight>(STORAGE_KEYS.SCORE_LYRICS_FONT_WEIGHT, 'regular');

  // 预览/导出：JPEG 压缩质量百分比（30~100，默认 95；设备级，不随偏好备份同步）
  const scoreExportQuality = useStorage<number>(STORAGE_KEYS.SCORE_EXPORT_QUALITY, 95);

  // 预览/导出：页边距（px，标准档位 窄/标准/宽，默认 56px 标准 15mm；设备级，不随偏好备份同步）
  const scorePageMargin = useStorage<number>(STORAGE_KEYS.SCORE_PAGE_MARGIN, 56);

  // 预览/导出：标准单页尺寸档位（a4 / a5 / letter，默认 a4；设备级，不随偏好备份同步）
  const scorePageSize = useStorage<string>(STORAGE_KEYS.SCORE_PAGE_SIZE, 'a4');

  // 预览显示偏好（设备级，不随偏好备份同步）：自适应满高 / 自定义缩放百分比
  const previewFitMode = useStorage<boolean>(STORAGE_KEYS.SCORE_PREVIEW_FIT_MODE, true);
  const previewZoomPercent = useStorage<number>(STORAGE_KEYS.SCORE_PREVIEW_ZOOM_PERCENT, 100);

  // 工作台导出背景偏好（设备级，不随偏好备份同步）
  const workbenchExportBg = useStorage<ExportBgMode>(STORAGE_KEYS.WORKBENCH_EXPORT_BG, 'transparent');

  // 音频试听可调参数（音色 / 弦间间隔 / 扫弦方向 / 音量 / 力度随机；默认值即初始出厂值）
  // mergeDefaults: 旧版本持久化对象缺新增字段（如 reverbWet/chorusEnabled）时与默认值合并，避免 undefined 流入音频引擎
  const audioPlayback = useStorage<AudioPlaybackSettings>(
    STORAGE_KEYS.AUDIO_PLAYBACK,
    {
      timbre: 'standard',
      strumDelayMs: AUDIO_SETTINGS_DEFAULTS.strumDelayMs,
      strumDirection: 'low',
      volumeDb: AUDIO_SETTINGS_DEFAULTS.volumeDb,
      humanize: true,
      reverbWet: AUDIO_SETTINGS_DEFAULTS.reverbWet,
      chorusEnabled: false,
    },
    undefined,
    { mergeDefaults: true, serializer: audioPlaybackSerializer }
  );

  /** 从备份包恢复同步配置（导入备份/云端拉取时调用）。分支缓存随旧配置失效。 */
  const applySyncBackup = (sync?: SyncSettingsBackup) => {
    if (!sync) return;
    if (
      sync.syncTarget === 'github' ||
      sync.syncTarget === 'gitee' ||
      sync.syncTarget === 'webdav' ||
      sync.syncTarget === 'server'
    ) {
      syncTarget.value = sync.syncTarget;
    }
    if (typeof sync.githubToken === 'string') githubToken.value = sync.githubToken;
    if (typeof sync.githubOwner === 'string') githubOwner.value = sync.githubOwner;
    if (typeof sync.githubRepo === 'string') githubRepo.value = sync.githubRepo;
    if (typeof sync.githubBranch === 'string') githubBranch.value = sync.githubBranch;
    if (typeof sync.githubPath === 'string') githubPath.value = sync.githubPath;
    if (typeof sync.giteeToken === 'string') giteeToken.value = sync.giteeToken;
    if (typeof sync.giteeOwner === 'string') giteeOwner.value = sync.giteeOwner;
    if (typeof sync.giteeRepo === 'string') giteeRepo.value = sync.giteeRepo;
    if (typeof sync.giteeBranch === 'string') giteeBranch.value = sync.giteeBranch;
    if (typeof sync.giteePath === 'string') giteePath.value = sync.giteePath;
    if (typeof sync.webdavServerUrl === 'string') webdavServerUrl.value = sync.webdavServerUrl;
    if (typeof sync.webdavUsername === 'string') webdavUsername.value = sync.webdavUsername;
    if (typeof sync.webdavPassword === 'string') webdavPassword.value = sync.webdavPassword;
    if (typeof sync.webdavUseDefaultProxy === 'boolean') webdavUseDefaultProxy.value = sync.webdavUseDefaultProxy;
    if (typeof sync.webdavProxyUrl === 'string') webdavProxyUrl.value = sync.webdavProxyUrl;
    if (typeof sync.serverUrl === 'string') serverUrl.value = sync.serverUrl;
    if (typeof sync.serverToken === 'string') serverToken.value = sync.serverToken;
    githubBranches.value = [];
    giteeBranches.value = [];
  };

  /** 从备份包恢复偏好设置（导入备份/云端拉取时调用）。仅覆盖包中携带的字段。 */
  const applyPreferencesBackup = (prefs?: AppPreferencesBackup) => {
    if (!prefs) return;
    if (typeof prefs.workbenchChordShorthand === 'boolean')
      workbenchChordShorthand.value = prefs.workbenchChordShorthand;
    if (typeof prefs.scoreChordShorthand === 'boolean') scoreChordShorthand.value = prefs.scoreChordShorthand;
    if (prefs.scoreLayoutAlign === 'start' || prefs.scoreLayoutAlign === 'center')
      scoreLayoutAlign.value = prefs.scoreLayoutAlign;
    if (typeof prefs.scoreShowBarre === 'boolean') scoreShowBarre.value = prefs.scoreShowBarre;
    if (
      prefs.scoreLyricsFontWeight === 'light' ||
      prefs.scoreLyricsFontWeight === 'regular' ||
      prefs.scoreLyricsFontWeight === 'bold'
    )
      scoreLyricsFontWeight.value = prefs.scoreLyricsFontWeight;
  };

  return {
    syncTarget,
    githubToken,
    githubOwner,
    githubRepo,
    githubBranch,
    githubPath,
    githubBranches,
    giteeToken,
    giteeOwner,
    giteeRepo,
    giteeBranch,
    giteePath,
    giteeBranches,
    webdavServerUrl,
    webdavUsername,
    webdavPassword,
    webdavUseDefaultProxy,
    webdavProxyUrl,
    serverUrl,
    serverToken,
    workbenchChordShorthand,
    scoreChordShorthand,
    scoreLayoutAlign,
    scoreShowBarre,
    scoreLyricsFontWeight,
    scoreExportQuality,
    scorePageMargin,
    scorePageSize,
    previewFitMode,
    previewZoomPercent,
    workbenchExportBg,
    audioPlayback,
    applySyncBackup,
    applyPreferencesBackup,
  };
});
