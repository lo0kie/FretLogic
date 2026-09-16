/**
 * 乐谱 Worker 渲染载荷的统一构建入口。
 * 预览面板（ScorePreviewPane）与 TopHeader 导出（useScoreExportActions）此前各自维护一份
 * 逐字相同的 15 参 payload 构造与全曲行索引逻辑，现收敛于此：设置项/编辑器状态读取单处维护，
 * 两侧只按模式取用。
 */
import { useScoreLinesData } from '@/domains/score/editor/composables/useScoreLinesData';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSettingsStore } from '@/platform/store/settingsStore';

import { prepareWorkerExportPayload } from './services/workerExportService';

import type { WorkerExportPayload } from './workers/scoreExportWorker';
import type { Song } from '@/domains/score/types';

export const useScoreRenderPayload = () => {
  const scoreEditor = useScoreEditorStore();
  const settingsStore = useSettingsStore();
  const { chordsLookupMap } = useScoreLinesData();

  /** 整曲全部歌词行索引（预览/导出始终覆盖全曲，不随选中行变化） */
  const getAllLineIndices = (): number[] => {
    const lyrics = scoreEditor.activeSong?.lyrics;
    if (!lyrics) return [];
    return Array.from({ length: lyrics.split('\n').length }, (_, i) => i);
  };

  /**
   * 统一构造 Worker 渲染载荷（a4 分页 / normal 长图共用同一组设置项）。
   * song 缺省取当前活动乐谱（调用方需自行保证非空，或先经 getAllLineIndices 判空）。
   */
  const buildRenderPayload = (mode: 'normal' | 'a4', song: Song = scoreEditor.activeSong!): WorkerExportPayload =>
    prepareWorkerExportPayload({
      song,
      selectedIndices: getAllLineIndices(),
      chordsLookupMap: chordsLookupMap.value,
      mode,
      shorthand: settingsStore.scoreChordShorthand,
      layoutAlign: settingsStore.scoreLayoutAlign,
      fontScale: scoreEditor.fontScale,
      fretboardScale: scoreEditor.fretboardScale,
      showBarre: settingsStore.scoreShowBarre,
      lyricsFontWeight: settingsStore.scoreLyricsFontWeight,
      exportQualityPct: settingsStore.scoreExportQuality,
      pageMarginPx: settingsStore.scorePageMargin,
      pageSize: settingsStore.scorePageSize,
      showFooter: settingsStore.scoreShowFooter,
      ignoreEmptySpace: settingsStore.scoreIgnoreEmptySpace,
    });

  return { getAllLineIndices, buildRenderPayload };
};
