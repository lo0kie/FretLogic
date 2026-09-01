/**
 * 同步与偏好设置 store：同步目标（GitHub / WebDAV）凭据与路径、应用偏好项。
 * 敏感字段（token/密码）仅驻留内存，不参与云同步推送。
 */
import type { SyncProviderKind } from '@/services/sync/provider';
import type { AppPreferencesBackup, SyncSettingsBackup } from '@/types';
import { GITHUB_SYNC_CONFIG, STORAGE_KEYS } from '@/utils/core/constants';
import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSettingsStore = defineStore('settings', () => {
  const syncTarget = useStorage<SyncProviderKind>(STORAGE_KEYS.SYNC_TARGET, 'server');

  // GitHub 同步配置（默认由 GITHUB_SYNC_CONFIG 提供仓库与环境分支）
  const githubToken = ref('');
  const githubOwner = useStorage(STORAGE_KEYS.GH_OWNER, GITHUB_SYNC_CONFIG.DEFAULT_OWNER);
  const githubRepo = useStorage(STORAGE_KEYS.GH_REPO, GITHUB_SYNC_CONFIG.DEFAULT_REPO);
  const githubBranch = useStorage(STORAGE_KEYS.GH_BRANCH, GITHUB_SYNC_CONFIG.DEFAULT_BRANCH);
  const githubPath = useStorage(STORAGE_KEYS.GH_PATH, GITHUB_SYNC_CONFIG.DEFAULT_PATH);
  const githubBranches = useStorage(STORAGE_KEYS.GH_BRANCHES, <Array<string>>[]);

  // WebDAV 同步配置（支持选择使用预设代理或自定义代理）
  const webdavServerUrl = useStorage(STORAGE_KEYS.WEBDAV_SERVER_URL, '');
  const webdavUsername = useStorage(STORAGE_KEYS.WEBDAV_USERNAME, '');
  const webdavPassword = useStorage(STORAGE_KEYS.WEBDAV_PASSWORD, '');
  const webdavUseDefaultProxy = useStorage(STORAGE_KEYS.WEBDAV_USE_DEFAULT_PROXY, true);
  const webdavProxyUrl = useStorage(STORAGE_KEYS.WEBDAV_PROXY_URL, '');

  // 线上服务器同步配置
  const serverUrl = useStorage(STORAGE_KEYS.SERVER_URL, '');
  const serverToken = ref('');

  // 工作台乐理显示偏好
  const workbenchChordShorthand = useStorage<boolean>(STORAGE_KEYS.WORKBENCH_CHORD_SHORTHAND, false);
  const workbenchShowPitchNames = useStorage<boolean>(STORAGE_KEYS.WORKBENCH_SHOW_PITCH_NAMES, true);

  // 乐谱乐理显示偏好
  const scoreChordShorthand = useStorage<boolean>(STORAGE_KEYS.SCORE_CHORD_SHORTHAND, false);
  const scoreShowPitchNames = useStorage<boolean>(STORAGE_KEYS.SCORE_SHOW_PITCH_NAMES, true);

  /** 从备份包恢复同步配置（导入备份/云端拉取时调用）。分支缓存随旧配置失效。 */
  const applySyncBackup = (sync?: SyncSettingsBackup) => {
    if (!sync) return;
    if (sync.syncTarget === 'github' || sync.syncTarget === 'webdav' || sync.syncTarget === 'server') {
      syncTarget.value = sync.syncTarget;
    }
    if (typeof sync.githubToken === 'string') githubToken.value = sync.githubToken;
    if (typeof sync.githubOwner === 'string') githubOwner.value = sync.githubOwner;
    if (typeof sync.githubRepo === 'string') githubRepo.value = sync.githubRepo;
    if (typeof sync.githubBranch === 'string') githubBranch.value = sync.githubBranch;
    if (typeof sync.githubPath === 'string') githubPath.value = sync.githubPath;
    if (typeof sync.webdavServerUrl === 'string') webdavServerUrl.value = sync.webdavServerUrl;
    if (typeof sync.webdavUsername === 'string') webdavUsername.value = sync.webdavUsername;
    if (typeof sync.webdavPassword === 'string') webdavPassword.value = sync.webdavPassword;
    if (typeof sync.webdavUseDefaultProxy === 'boolean') webdavUseDefaultProxy.value = sync.webdavUseDefaultProxy;
    if (typeof sync.webdavProxyUrl === 'string') webdavProxyUrl.value = sync.webdavProxyUrl;
    if (typeof sync.serverUrl === 'string') serverUrl.value = sync.serverUrl;
    if (typeof sync.serverToken === 'string') serverToken.value = sync.serverToken;
    githubBranches.value = [];
  };

  /** 从备份包恢复偏好设置（导入备份/云端拉取时调用）。仅覆盖包中携带的字段。 */
  const applyPreferencesBackup = (prefs?: AppPreferencesBackup) => {
    if (!prefs) return;
    if (typeof prefs.workbenchChordShorthand === 'boolean')
      workbenchChordShorthand.value = prefs.workbenchChordShorthand;
    if (typeof prefs.workbenchShowPitchNames === 'boolean')
      workbenchShowPitchNames.value = prefs.workbenchShowPitchNames;
    if (typeof prefs.scoreChordShorthand === 'boolean') scoreChordShorthand.value = prefs.scoreChordShorthand;
    if (typeof prefs.scoreShowPitchNames === 'boolean') scoreShowPitchNames.value = prefs.scoreShowPitchNames;
  };

  return {
    syncTarget,
    githubToken,
    githubOwner,
    githubRepo,
    githubBranch,
    githubPath,
    githubBranches,
    webdavServerUrl,
    webdavUsername,
    webdavPassword,
    webdavUseDefaultProxy,
    webdavProxyUrl,
    serverUrl,
    serverToken,
    workbenchChordShorthand,
    workbenchShowPitchNames,
    scoreChordShorthand,
    scoreShowPitchNames,
    applySyncBackup,
    applyPreferencesBackup,
  };
});
