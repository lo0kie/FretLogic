/**
 * 导入/导出服务：备份包的文件下载、文件解析（含老版本迁移与清洗）、导入应用。
 */
import { validateImportExportPayload } from '@/services/validation/payload';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { ImportExportPayload } from '@/types';
import { buildBackupPayload } from '@/utils/core/buildBackupPayload';
import { serializeForStorage } from '@/utils/core/common';
import { wait } from '@/utils/score/score-export';

/** 备份内容勾选项：和弦（含分组）/ 乐谱 / 同步配置 / 偏好设置 */
export interface BackupSelection {
  chords: boolean;
  songs: boolean;
  syncSettings: boolean;
  preferences: boolean;
}

export const FULL_BACKUP_SELECTION: BackupSelection = {
  chords: true,
  songs: true,
  syncSettings: true,
  preferences: true,
};

/** 导入/导出服务入口：提供备份文件解析、按勾选应用导入、按勾选导出下载三个动作 */
export function useImportExportService() {
  const chordStore = useChordStore();
  const songStore = useSongStore();
  const uiStore = useUiStore();
  const settingsStore = useSettingsStore();

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
    if (selection.chords || selection.songs) useChordEditorStore().resetEditor();
  };

  /** 解析备份文件为经校验清洗的 payload（失败抛错并 toast，由调用方决定后续流程） */
  const parseBackupFile = async (file: File): Promise<ImportExportPayload> => {
    const loadingId = uiStore.toast.loading('正在解析并恢复数据...');
    await wait(30);
    try {
      const resultStr = (await file.text()).trim();
      if (!resultStr) throw new Error('文件内容为空');
      const imported = JSON.parse(resultStr);
      const { isValid, payload, warnings } = validateImportExportPayload(imported);
      if (!isValid || !payload) throw new Error('Import verification failed');
      if (warnings && warnings.length > 0) {
        uiStore.toast.warning(`导入时已自动清理部分数据：${warnings.join('；')}`);
      }
      return payload;
    } catch (err) {
      console.error('备份解析拦截:', err);
      uiStore.toast.error('文件非标准备份或核心数据已损坏');
      throw err;
    } finally {
      uiStore.removeToast(loadingId);
    }
  };

  /** 按勾选导出备份文件；返回是否真正导出成功（供调用方决定是否关闭弹窗） */
  const triggerFullExport = (selection: BackupSelection = FULL_BACKUP_SELECTION): boolean => {
    const payload = buildBackupPayload({ selection });
    if (!payload) {
      uiStore.toast.error('当前本地缓存存在严重破损数据，请检查控制台');
      return false;
    }
    // 没有任何实质内容时不执行导出：无实体数据 且 未勾选同步配置/偏好设置
    const hasEntities =
      (selection.chords && (payload.groups.length > 0 || payload.chords.length > 0)) ||
      (selection.songs && payload.songs.length > 0);
    const hasNonEntity = selection.syncSettings || selection.preferences;
    if (!hasEntities && !hasNonEntity) {
      uiStore.toast.warning('没有可导出的数据，请先创建分组、和弦或乐谱');
      return false;
    }
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = new Date(now.getTime() - tzOffset).toISOString().slice(0, -1);
    const dateStr = localISOTime.replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const link = document.createElement('a');
    const blob = new Blob([serializeForStorage(payload)], {
      type: 'application/json',
    });
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = `FretLogic备份_${dateStr}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    uiStore.toast.success('备份已下载');
    return true;
  };

  return {
    parseBackupFile,
    applyImportSelection,
    triggerFullExport,
  };
}
