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
}
