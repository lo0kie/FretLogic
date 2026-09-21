/**
 * 乐谱 Worker 渲染载荷的统一构建入口。
 * 预览面板（ScorePreviewPane）与 TopHeader 导出（useScoreExport）此前各自维护一份
 * 逐字相同的 15 参 payload 构造与全曲行索引逻辑，现收敛于此：设置项/编辑器状态读取单处维护，
 * 两侧只按模式取用。
 */
import { resolveFretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';
import { useScoreLinesData } from '@/domains/score/editor/composables/useScoreLinesData';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { clamp } from '@/platform/utils/common';

import { prepareWorkerExportPayload, runWorkerFooterCompose } from './services/workerExportService';

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
   * song 缺省取当前活动乐谱；两者皆空即「无谱可渲染」，在此处显式失败，不留给下游解引用。
   */
  const buildRenderPayload = (mode: 'normal' | 'a4', song?: Song): WorkerExportPayload => {
    const target = song ?? scoreEditor.activeSong;
    if (!target) throw new Error('当前没有打开的乐谱，无法渲染预览/导出');
    return prepareWorkerExportPayload({
      song: target,
      selectedIndices: getAllLineIndices(),
      chordsLookupMap: chordsLookupMap.value,
      mode,
      shorthand: settingsStore.scoreChordShorthand,
      layoutAlign: settingsStore.scoreLayoutAlign,
      // 预览 / 导出维度：与排列和弦编辑视图的排版缩放各存一份，互不干扰
      fontScale: scoreEditor.previewFontScale,
      fretboardScale: scoreEditor.previewFretboardScale,
      showBarre: settingsStore.scoreShowBarre,
      lyricsFontWeight: settingsStore.scoreLyricsFontWeight,
      exportQualityPct: settingsStore.scoreExportQuality,
      pageMarginPx: settingsStore.scorePageMargin,
      pageSize: settingsStore.scorePageSize,
      ignoreEmptySpace: settingsStore.scoreIgnoreEmptySpace,
    });
  };

  /**
   * 页脚合成：页面栅格不含页脚（见 services/footerOverlay），开关打开时在渲染线程按需叠加。
   * 关闭时原样返回，零额外开销；开关本身不参与预览缓存的内容键，故切换不重渲染、不新增缓存条目。
   * @param pageIndexes 各页真实页序号（缺省按数组下标）
   * @param pageSizeOverride 页图实际使用的纸张档位：缓存命中路径必须传渲染时档位，
   *        缺省才读实时设置——改档位的在途窗口内两者可能不一致
   * @param pageMarginOverride 页边距同上：页图与页脚必须同边距合成，重渲染在途窗口内
   *        读实时值会按两套边距产出错位页脚（P1 审计 N 系）
   */
  const composePageFooter = (
    blobs: Blob[],
    pageIndexes?: number[],
    pageSizeOverride?: string,
    pageMarginOverride?: number
  ): Promise<Blob[]> => {
    if (!settingsStore.scoreShowFooter || blobs.length === 0) return Promise.resolve(blobs);
    return runWorkerFooterCompose({
      pages: blobs,
      pageIndexes,
      pageSize: pageSizeOverride ?? settingsStore.scorePageSize,
      pageMargin: pageMarginOverride ?? settingsStore.scorePageMargin,
      // 页脚文字色与页面渲染同源（同一套 --fbc-* 变量），保证预览合成层与导出图一致
      color: resolveFretboardCanvasPalette().SUB_TEXT,
      // 与页面渲染同质量档位（百分制转 0.3~1）
      exportQuality: clamp(settingsStore.scoreExportQuality / 100, 0.3, 1),
    });
  };

  return { getAllLineIndices, buildRenderPayload, composePageFooter };
};
