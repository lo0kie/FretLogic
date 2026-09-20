/**
 * 导入/导出服务：备份包的文件下载、文件解析（含老版本迁移与清洗）、导入应用。
 */
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { runBusyAction } from '@/platform/composables/runBusyAction';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { triggerBlobDownload } from '@/platform/utils/canvas';
import { formatLocalTimestampForFile, serializeForStorage, wait } from '@/platform/utils/common';

import { decryptSyncSettingsSecrets, encryptSyncSettingsSecrets } from './backupCrypto';
import { FULL_BACKUP_SELECTION } from './backupSelection';
import { buildBackupPayloadResult } from './buildBackupPayload';

import type { EncryptedSyncSettingsBackup, ImportExportPayload } from '@/app/types';
import type { BackupSelection } from '@/app/types/payload';

export type { BackupSelection };

// 常量本体在零依赖的 backupSelection.ts（避免壳层模块为取常量引入整个服务），此处 re-export 兼容旧引用
export { FULL_BACKUP_SELECTION };

/** 导入/导出服务入口：提供备份文件解析、按勾选应用导入、按勾选导出下载三个动作 */
export function useImportExportService() {
  const chordStore = useChordStore();
  const songStore = useSongStore();
  const uiStore = useUiStore();
  const settingsStore = useSettingsStore();
  const editorStore = useChordEditorStore();

  /** 按勾选把清洗后的 payload 覆盖写入本地（入参是 validateImportExportPayload 的全新对象图，可直接接管） */
  const applyImportSelection = (data: ImportExportPayload, selection: BackupSelection) => {
    if (selection.chords) {
      chordStore.replaceAllData({
        groups: data.groups,
        chords: data.chords,
      });
      chordStore.selectedGroupId = null;
    }
    if (selection.songs) songStore.overwriteSongs(data.songs);
    if (selection.syncSettings) settingsStore.applySyncBackup(data.syncSettings);
    if (selection.preferences) settingsStore.applyPreferencesBackup(data.preferences);
    // 覆盖实体数据后清空指板编辑草稿（全部静音），避免残留旧指法
    if (selection.chords || selection.songs) editorStore.resetEditor();
  };

  /** 解析备份文件为经校验清洗的 payload（失败 message 提示并重抛，由调用方决定后续流程） */
  const parseBackupFile = (file: File): Promise<ImportExportPayload> =>
    runBusyAction({
      loadingText: '正在解析并恢复数据...',
      run: async () => {
        await wait(30);
        // payload 校验模块（含 zod）动态加载：解析只发生在用户导入时，保持其离开首屏闭包
        const { parseAndValidatePayload } = await import('@/app/services/validation/payload');
        // 上限保护：超大文件 file.text() 全量入内存 + parseAndValidatePayload 内部再克隆会峰值 2~3 倍，
        // 无上限会被恶意/损坏文件撑爆内存（S6）。50MB 远超正常备份体积
        const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
        if (file.size > MAX_BACKUP_BYTES) throw new Error('备份文件过大（上限 50MB）');
        const result = parseAndValidatePayload(await file.text());
        if (result.error || !result.payload) throw new Error(`备份解析失败：${result.error}`);
        if (result.warnings && result.warnings.length > 0) {
          uiStore.message.warning(`导入时已自动清理部分数据：${result.warnings.join('；')}`);
        }
        return result.payload;
      },
      onError: err => {
        console.error('备份解析拦截:', err);
        uiStore.message.error('文件非标准备份或核心数据已损坏');
      },
      rethrowError: true,
    }) as Promise<ImportExportPayload>;

  /** 按勾选导出备份文件；返回是否真正导出成功（供调用方决定是否关闭弹窗）。
   * 勾选同步配置时必须提供导出密码：四个凭据字段（Token/密码）将以 AES-GCM 加密进包，
   * 明文不再落地；导入方需输入同一密码解密。 */
  const triggerFullExport = async (
    selection: BackupSelection = FULL_BACKUP_SELECTION,
    secretsPassphrase?: string
  ): Promise<boolean> => {
    const { payload, issues, warnings } = await buildBackupPayloadResult({ selection });
    if (!payload) {
      const reason = issues.length > 0 ? `：${issues.slice(0, 2).join('; ')}` : '，请检查控制台';
      uiStore.message.error(`当前本地缓存存在严重破损数据${reason}`);
      return false;
    }
    if (warnings.length > 0) {
      uiStore.message.warning(`数据清洗提示：${warnings.slice(0, 2).join('; ')}`);
    }
    // 凭据加密：有明文敏感字段却未提供密码时拒绝导出（防止用户误产出明文凭据文件）
    let finalPayload = payload;
    // 成功文案依据：encryptSyncSettingsSecrets 只在包内真有明文敏感字段时才产出 secrets 块，
    // 本机无凭据时它原样返回（无 secrets 键）——此时「凭据已加密」是撒谎
    let credentialsEncrypted = false;
    if (selection.syncSettings && payload.syncSettings) {
      if (!secretsPassphrase) {
        uiStore.message.error('导出同步配置需要设置导出密码，用于加密备份中的 Token / 密码');
        return false;
      }
      try {
        const encrypted = await encryptSyncSettingsSecrets(payload.syncSettings, secretsPassphrase);
        credentialsEncrypted = encrypted.secrets !== undefined;
        finalPayload = { ...payload, syncSettings: encrypted };
      } catch (err) {
        console.error('凭据加密失败:', err);
        uiStore.message.error('凭据加密失败，已取消导出');
        return false;
      }
    }
    // 没有任何实质内容时不执行导出：无实体数据 且 未勾选同步配置/偏好设置
    const hasEntities =
      (selection.chords && (finalPayload.groups.length > 0 || finalPayload.chords.length > 0)) ||
      (selection.songs && finalPayload.songs.length > 0);
    const hasNonEntity = selection.syncSettings || selection.preferences;
    if (!hasEntities && !hasNonEntity) {
      uiStore.message.warning('没有可导出的数据，请先创建分组、和弦或乐谱');
      return false;
    }
    // 下载逻辑与导出图一致：统一走 triggerBlobDownload（创建 URL → a.click → 延时 revoke）
    const blob = new Blob([serializeForStorage(finalPayload)], {
      type: 'application/json',
    });
    triggerBlobDownload(blob, `FretLogic备份_${formatLocalTimestampForFile()}.json`);
    uiStore.message.success(credentialsEncrypted ? '备份已下载（凭据已加密）' : '备份已下载');
    return true;
  };

  /** 解密备份包同步配置中的加密凭据块，把还原出的明文字段合并回 syncSettings（就地替换）。
   * 解密失败抛错（统一文案），由调用方决定是否保持导入流程。 */
  const revealEncryptedSyncSettings = async (
    settings: EncryptedSyncSettingsBackup,
    passphrase: string
  ): Promise<void> => {
    if (!settings.secrets) return;
    const secrets = await decryptSyncSettingsSecrets(settings.secrets, passphrase);
    // 还原明文：必须按 kind 映射回判别联合各自的敏感字段（token / password），而非原样
    // Object.assign 到 githubToken / webdavPassword 等扁平键——后者 applySyncBackup 根本不读，
    // 会导致四个凭据在导入后全部为空（P0 审计 #2）。
    // settings 已是判别联合（EncryptedSyncSettingsBackup），switch(kind) 收窄到具体分支后
    // token / password 均为该分支的已知字段，可直接赋值——无需断言到 Record<string, unknown>。
    // secrets 是解密结果 Record<string, string>，索引访问须用 []（noPropertyAccessFromIndexSignature）
    switch (settings.kind) {
      case 'github':
        if (typeof secrets['githubToken'] === 'string') settings.token = secrets['githubToken'];
        break;
      case 'gitee':
        if (typeof secrets['giteeToken'] === 'string') settings.token = secrets['giteeToken'];
        break;
      case 'webdav':
        if (typeof secrets['webdavPassword'] === 'string') settings.password = secrets['webdavPassword'];
        break;
      case 'server':
        if (typeof secrets['serverToken'] === 'string') settings.token = secrets['serverToken'];
        break;
    }
    delete settings.secrets;
  };

  return {
    parseBackupFile,
    applyImportSelection,
    triggerFullExport,
    revealEncryptedSyncSettings,
  };
}
