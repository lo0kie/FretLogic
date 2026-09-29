/**
 * 同步与偏好设置 store：同步目标（GitHub / Gitee / WebDAV / Server）凭据与路径、应用偏好项。
 * 敏感字段（token/密码）仅驻留内存，不落盘，不参与云同步推送。
 */
import { ref } from 'vue';

import { defineStore } from 'pinia';

import { useStorage } from '@/platform/composables/useStorage';
import { isIdbKvHydrated, onIdbKvHydrated } from '@/platform/services/storage/idbKv';
import { asRawRecord, isBoolean, isNumber, isString } from '@/platform/utils/common';
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

/** 音频播放参数的 JSON 序列化器。刻意保持**纯函数**：迁移只在下方的一次性迁移里做。
 *  写在 read 里等于每次读取都迁一次，而新版百分制刻度上 0 与 1 都是合法取值，
 *  会被反复放大 100 倍（迁移永不下岗）。 */
const audioPlaybackSerializer = {
  read: (raw: string): AudioPlaybackSettings => JSON.parse(raw) as AudioPlaybackSettings,
  write: (v: AudioPlaybackSettings): string => JSON.stringify(v),
};

/**
 * 把「必须等 kv 水合完成才成立」的一次性逻辑挂到正确时机。
 *
 * 未水合时 `useStorage` 读到的全是**出厂默认值**（`kvGet` 一律返回 null，与「键不存在」不可区分），
 * 拿它们跑数据迁移既没做成、又会把「已执行」标记消费掉 —— 标记落盘之后，磁盘上真实的旧值永不迁移。
 * 启动链路有超时兜底（`main.ts` 的 `Promise.race`），所以「store 初始化早于水合完成」是可达路径。
 * `hydrateIdbKv` 完成时会先逐个派发存储事件把 ref 刷成磁盘值，再回调这里，故回调里读到的是真值。
 */
const afterKvHydrated = (run: () => void): void => {
  if (isIdbKvHydrated()) run();
  else onIdbKvHydrated(run);
};

export const useSettingsStore = defineStore('settings', () => {
  const syncTarget = useStorage<SyncProviderKind>(STORAGE_KEYS.SYNC_TARGET, 'gitee');

  // GitHub 同步配置（默认由 GITHUB_SYNC_CONFIG 提供仓库与环境分支）
  const githubToken = ref('');
  const githubOwner = useStorage(STORAGE_KEYS.GH_OWNER, GITHUB_SYNC_CONFIG.DEFAULT_OWNER);
  const githubRepo = useStorage(STORAGE_KEYS.GH_REPO, GITHUB_SYNC_CONFIG.DEFAULT_REPO);
  const githubBranch = useStorage(STORAGE_KEYS.GH_BRANCH, GITHUB_SYNC_CONFIG.DEFAULT_BRANCH);
  const githubPath = useStorage(STORAGE_KEYS.GH_PATH, GITHUB_SYNC_CONFIG.DEFAULT_PATH);

  // Gitee 同步配置（默认由 GITEE_SYNC_CONFIG 提供仓库与分支）
  const giteeToken = ref('');
  const giteeOwner = useStorage(STORAGE_KEYS.GE_OWNER, GITEE_SYNC_CONFIG.DEFAULT_OWNER);
  const giteeRepo = useStorage(STORAGE_KEYS.GE_REPO, GITEE_SYNC_CONFIG.DEFAULT_REPO);
  const giteeBranch = useStorage(STORAGE_KEYS.GE_BRANCH, GITEE_SYNC_CONFIG.DEFAULT_BRANCH);
  const giteePath = useStorage(STORAGE_KEYS.GE_PATH, GITEE_SYNC_CONFIG.DEFAULT_PATH);

  // 一次性纠正早期 Gitee 预设的遗留值（曾沿用 GitHub 的 lo0kie/FretLogic，分支固定 master）。
  // 必须带「已执行」标记：纠正判据与**用户的合法取值**重合 —— Gitee 仓库的默认分支本就是 master，
  // 无标记就会每次初始化都改写一遍，把用户手填的 master 抹成 data-sync，
  // 与 transfer.ts 里 giteeBranch 的 defaultOnEmpty: 'master' 直接对撞。
  //
  // ⚠️ 与下面那条混响刻度迁移一样，**必须等 kv 水合完成才跑**：未水合时 useStorage 读到的全是
  // 出厂默认值（kvGet 一律返回 null），迁移既没做成、又会把「已执行」标记消费掉 ——
  // 标记落盘之后，磁盘上真实的旧值永不迁移。启动链路有超时兜底（main.ts 的 Promise.race），
  // 所以「store 初始化早于水合完成」是可达路径，不是理论情况。
  const giteePresetMigrated = useStorage<boolean>(STORAGE_KEYS.GITEE_PRESET_MIGRATED, false);
  afterKvHydrated(() => {
    if (giteePresetMigrated.value) return;
    if (giteeOwner.value === 'lo0kie') giteeOwner.value = GITEE_SYNC_CONFIG.DEFAULT_OWNER;
    if (giteeRepo.value === 'FretLogic') giteeRepo.value = GITEE_SYNC_CONFIG.DEFAULT_REPO;
    if (giteeBranch.value === 'master') giteeBranch.value = GITEE_SYNC_CONFIG.DEFAULT_BRANCH;
    giteePresetMigrated.value = true;
  });

  // WebDAV 同步配置（支持选择使用预设代理或自定义代理）
  const webdavServerUrl = useStorage(STORAGE_KEYS.WEBDAV_SERVER_URL, '');
  const webdavUsername = useStorage(STORAGE_KEYS.WEBDAV_USERNAME, '');
  // WebDAV 密码统一为纯内存态（与 githubToken/giteeToken/serverToken 一致，不落盘）；
  // 历史版本曾把密码落盘，旧数据转录时该键被排除、不进 kv 库（见 migrateLegacy.ts）
  const webdavPassword = ref('');
  const webdavUseDefaultProxy = useStorage(STORAGE_KEYS.WEBDAV_USE_DEFAULT_PROXY, true);
  const webdavProxyUrl = useStorage(STORAGE_KEYS.WEBDAV_PROXY_URL, '');

  // 线上服务器同步配置
  const serverUrl = useStorage(STORAGE_KEYS.SERVER_URL, '');
  // 服务器 Token：与 GitHub/Gitee/WebDAV 密码一致，仅驻留内存，不落盘
  const serverToken = ref('');

  // 工作台乐理显示偏好
  const workbenchChordShorthand = useStorage<boolean>(STORAGE_KEYS.WORKBENCH_CHORD_SHORTHAND, false);

  // 乐谱乐理显示偏好
  const scoreChordShorthand = useStorage<boolean>(STORAGE_KEYS.SCORE_CHORD_SHORTHAND, false);

  // 乐谱排版对齐偏好（start 起始位置 / center 居中对齐）
  const scoreLayoutAlign = useStorage<'start' | 'center'>(STORAGE_KEYS.SCORE_LAYOUT_ALIGN, 'start');

  // 乐谱乐理显示偏好：是否绘制大横按（排列和弦/预览共用）
  const scoreShowBarre = useStorage<boolean>(STORAGE_KEYS.SCORE_SHOW_BARRE, true);
  // 指板位图是否忽略首末的空品格（排列和弦/预览共用）。缺省 false = 画满 fretCount 列的全指板，
  // 与既有视觉零差异；开启后按实际用到的品位收紧品窗（不低于 MIN_FRET_COUNT 列）
  const scoreTrimEmptyEdgeFrets = useStorage<boolean>(STORAGE_KEYS.SCORE_TRIM_EMPTY_EDGE_FRETS, false);

  // 预览/导出：是否显示页脚页码（仅 A4 分页预览生效）
  const scoreShowFooter = useStorage<boolean>(STORAGE_KEYS.SCORE_SHOW_FOOTER, true);

  // 预览/导出：忽略连续空格（canvas 中连续的无和弦空格压缩为一个，整行更紧凑）
  const scoreIgnoreEmptySpace = useStorage<boolean>(STORAGE_KEYS.SCORE_IGNORE_EMPTY_SPACE, false);

  // 预览/导出：歌词字重（light 细 / regular 常规 / bold 粗）
  const scoreLyricsFontWeight = useStorage<ScoreLyricsFontWeight>(STORAGE_KEYS.SCORE_LYRICS_FONT_WEIGHT, 'regular');

  // 预览/导出：JPEG 压缩质量百分比（30~100，默认 95；设备级，不随偏好备份同步）
  const scoreExportQuality = useStorage<number>(STORAGE_KEYS.SCORE_EXPORT_QUALITY, 95);

  // 预览/导出：页边距（px，标准档位 窄/标准/宽，默认 56px 标准 15mm；设备级，不随偏好备份同步）
  const scorePageMargin = useStorage<38 | 56 | 76>(STORAGE_KEYS.SCORE_PAGE_MARGIN, 56);

  // 预览/导出：标准单页尺寸档位（a4 / a5 / letter，默认 a4；设备级，不随偏好备份同步）
  const scorePageSize = useStorage<'a4' | 'a5' | 'letter'>(STORAGE_KEYS.SCORE_PAGE_SIZE, 'a4');

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
    { mergeDefaults: true, serializer: audioPlaybackSerializer }
  );

  // 一次性把旧版混响干湿比（0~1 小数）迁到百分制。必须一次性：新版刻度上 0 与 1 都是合法取值，
  // 每次初始化都按「< 2 就放大 100 倍」判会把用户手调的 1 变成 100（迁移永不下岗）。
  // 同样等 kv 水合完成（理由见上方 gitee 那条）。
  const audioWetScaleMigrated = useStorage<boolean>(STORAGE_KEYS.AUDIO_WET_SCALE_MIGRATED, false);
  afterKvHydrated(() => {
    if (audioWetScaleMigrated.value) return;
    if (isNumber(audioPlayback.value.reverbWet) && audioPlayback.value.reverbWet < 2)
      audioPlayback.value.reverbWet *= 100;
    audioWetScaleMigrated.value = true;
  });

  /** 从备份包恢复同步配置（导入备份/云端拉取时调用）。 */
  const applySyncBackup = (sync?: SyncSettingsBackup) => {
    if (!sync) return;
    // 兼容旧备份：v7 前为平铺 { syncTarget, githubToken, ... } 形态。
    // 旧形态只有运行时形状（`SyncSettingsBackup` 里没有这些字段），故按宽松记录读、逐字段 typeof 收窄，
    // 而不是就地断言出那 18 个字段（见 platform/utils/common 的 asRawRecord）
    const legacy = asRawRecord(sync);
    if (!('kind' in sync) && legacy['syncTarget']) {
      const t = legacy['syncTarget'];
      if (t === 'github' || t === 'gitee' || t === 'webdav' || t === 'server') syncTarget.value = t;
      if (isString(legacy['githubToken'])) githubToken.value = legacy['githubToken'];
      if (isString(legacy['githubOwner'])) githubOwner.value = legacy['githubOwner'];
      if (isString(legacy['githubRepo'])) githubRepo.value = legacy['githubRepo'];
      if (isString(legacy['githubBranch'])) githubBranch.value = legacy['githubBranch'];
      if (isString(legacy['githubPath'])) githubPath.value = legacy['githubPath'];
      if (isString(legacy['giteeToken'])) giteeToken.value = legacy['giteeToken'];
      if (isString(legacy['giteeOwner'])) giteeOwner.value = legacy['giteeOwner'];
      if (isString(legacy['giteeRepo'])) giteeRepo.value = legacy['giteeRepo'];
      if (isString(legacy['giteeBranch'])) giteeBranch.value = legacy['giteeBranch'];
      if (isString(legacy['giteePath'])) giteePath.value = legacy['giteePath'];
      if (isString(legacy['webdavServerUrl'])) webdavServerUrl.value = legacy['webdavServerUrl'];
      if (isString(legacy['webdavUsername'])) webdavUsername.value = legacy['webdavUsername'];
      if (isString(legacy['webdavPassword'])) webdavPassword.value = legacy['webdavPassword'];
      if (isBoolean(legacy['webdavUseDefaultProxy'])) webdavUseDefaultProxy.value = legacy['webdavUseDefaultProxy'];
      if (isString(legacy['webdavProxyUrl'])) webdavProxyUrl.value = legacy['webdavProxyUrl'];
      if (isString(legacy['serverUrl'])) serverUrl.value = legacy['serverUrl'];
      if (isString(legacy['serverToken'])) serverToken.value = legacy['serverToken'];
      return;
    }
    // 新结构：按 kind 判别联合分支恢复
    switch (sync.kind) {
      case 'github':
        syncTarget.value = 'github';
        if (isString(sync.token)) githubToken.value = sync.token;
        if (isString(sync.owner)) githubOwner.value = sync.owner;
        if (isString(sync.repo)) githubRepo.value = sync.repo;
        if (isString(sync.branch)) githubBranch.value = sync.branch;
        if (isString(sync.path)) githubPath.value = sync.path;
        break;
      case 'gitee':
        syncTarget.value = 'gitee';
        if (isString(sync.token)) giteeToken.value = sync.token;
        if (isString(sync.owner)) giteeOwner.value = sync.owner;
        if (isString(sync.repo)) giteeRepo.value = sync.repo;
        if (isString(sync.branch)) giteeBranch.value = sync.branch;
        if (isString(sync.path)) giteePath.value = sync.path;
        break;
      case 'webdav':
        syncTarget.value = 'webdav';
        if (isString(sync.serverUrl)) webdavServerUrl.value = sync.serverUrl;
        if (isString(sync.username)) webdavUsername.value = sync.username;
        if (isString(sync.password)) webdavPassword.value = sync.password;
        if (isBoolean(sync.useDefaultProxy)) webdavUseDefaultProxy.value = sync.useDefaultProxy;
        if (isString(sync.proxyUrl)) webdavProxyUrl.value = sync.proxyUrl;
        break;
      case 'server':
        syncTarget.value = 'server';
        if (isString(sync.serverUrl)) serverUrl.value = sync.serverUrl;
        if (isString(sync.token)) serverToken.value = sync.token;
        break;
    }
  };

  /** 从备份包恢复偏好设置（导入备份/云端拉取时调用）。仅覆盖包中携带的字段。 */
  const applyPreferencesBackup = (prefs?: AppPreferencesBackup) => {
    if (!prefs) return;
    if (isBoolean(prefs.workbenchChordShorthand)) workbenchChordShorthand.value = prefs.workbenchChordShorthand;
    if (isBoolean(prefs.scoreChordShorthand)) scoreChordShorthand.value = prefs.scoreChordShorthand;
    if (prefs.scoreLayoutAlign === 'start' || prefs.scoreLayoutAlign === 'center')
      scoreLayoutAlign.value = prefs.scoreLayoutAlign;
    if (isBoolean(prefs.scoreShowBarre)) scoreShowBarre.value = prefs.scoreShowBarre;
    if (isBoolean(prefs.scoreTrimEmptyEdgeFrets)) scoreTrimEmptyEdgeFrets.value = prefs.scoreTrimEmptyEdgeFrets;
    if (isBoolean(prefs.scoreShowFooter)) scoreShowFooter.value = prefs.scoreShowFooter;
    if (isBoolean(prefs.scoreIgnoreEmptySpace)) scoreIgnoreEmptySpace.value = prefs.scoreIgnoreEmptySpace;
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
    giteeToken,
    giteeOwner,
    giteeRepo,
    giteeBranch,
    giteePath,
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
    scoreTrimEmptyEdgeFrets,
    scoreShowFooter,
    scoreIgnoreEmptySpace,
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
