/**
 * Web Worker: 纯数据驱动的 OffscreenCanvas 离屏乐谱渲染引擎。
 * 100% 运行在后台 Worker 线程，主线程 0ms 阻塞。
 * 支持绘制完整的吉他指板图、升降号上标和弦名、等粗横按、品丝对齐品号、紧随歌词排版及 A4 满页 Space-Between 垂直均分对齐。
 *
 * 【本文件的职责边界】拆分后这里只剩「请求解析 + 两类请求的分派 + 公开 API 重导出」：
 * 排版度量在 scoreExportLayout、指板光栅化在 scoreExportFretboard、行与表头绘制在 scoreExportRender、
 * 分页与编码在 scoreExportPages。依赖严格单向：
 *   types ← layout ← {fretboard, render} ← pages ← 本文件
 */

import { getScorePageSize } from '@/domains/score/constants';

import { syncFretboardStyleKey } from './scoreExportFretboard';
import { applyLayoutScales, EXPORT_JPEG_QUALITY, LAYOUT, wrapScoreLines } from './scoreExportLayout';
import {
  composeFooterPages,
  computePageLineRanges,
  packA4Pages,
  renderA4Page,
  renderLongImageBlob,
} from './scoreExportPages';
import { getHeaderHeight } from './scoreExportRender';

import type { ScoreWorkerRequest, WorkerExportMessage } from './scoreExportTypes';

if (typeof self !== 'undefined')
  self.onmessage = async (e: MessageEvent<ScoreWorkerRequest>) => {
    const payload = e.data;

    // 页脚合成请求：只做「贴图 + 画页码 + 重编码」，与整谱渲染共用渲染线程（服务层同一队列串行下发）
    if (payload.kind === 'footer-compose') {
      try {
        const blobs = await composeFooterPages(payload);
        self.postMessage({ type: 'complete', blobs } as WorkerExportMessage);
      } catch (err) {
        self.postMessage({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        } as WorkerExportMessage);
      }
      return;
    }

    try {
      const {
        title,
        singer = '',
        keyText,
        capoText,
        timeSignatureText = '',
        lines,
        mode,
        colors,
        layoutAlign,
        fontScale = 100,
        fretboardScale = 100,
        showBarre = true,
        ignoreEmptySpace: ignoreEmptySpaceMode = false,
        lyricsFontWeight: lyricsFontWeightMode = 'regular',
        exportQuality = EXPORT_JPEG_QUALITY,
        pageMargin = LAYOUT.PAGE_MARGIN,
        pageSize = 'a4',
      } = payload;

      // 导出单页尺寸：按档位解析宽高（A4 / A5 / Letter），仅 A4 分页模式使用
      const { width: pageW, height: pageH } = getScorePageSize(pageSize);

      // 歌词字重映射为 canvas 数值字重（light 300 / regular 400 / bold 700）
      const lyricsFontWeight = lyricsFontWeightMode === 'light' ? 300 : lyricsFontWeightMode === 'bold' ? 700 : 400;

      // 导出 JPEG 压缩质量：限制在 [0.3, 1] 区间（对应「导出质量」设置 30~100）
      const jpegQuality = Math.min(1, Math.max(0.3, exportQuality));

      // 排列和弦配置的缩放参数先于任何布局计算生效
      applyLayoutScales(fontScale, fretboardScale);

      // 样式纪元（主题配色 + 缩放后几何）变化即清空指板位图缓存：旧位图画法已不成立，
      // 留着只会被 LRU 顶替而白占内存（缩放滑块连续拖动会产生一串新纪元）
      syncFretboardStyleKey(colors);

      const blobs: Blob[] = [];
      // a4 模式下每页覆盖的原始歌词行序号；normal 模式不产出
      let pageLineRanges: number[][] | undefined;

      if (mode === 'a4') {
        // ===== 单页分页模式（尺寸按档位 A4 / A5 / Letter） =====
        const contentHeight = pageH - pageMargin * 2;
        const headerH = getHeaderHeight(Boolean(singer));
        const availWidth = pageW - pageMargin * 2;

        // 1. 超长行软折行 → 2. 动态装箱分页（整句跨页保护 + 页首空行优化）
        const allSegments = wrapScoreLines(lines, availWidth, ignoreEmptySpaceMode);
        const pages = packA4Pages(allSegments, contentHeight, headerH);

        // 每页覆盖的原始歌词行序号（升序去重）
        pageLineRanges = computePageLineRanges(pages);

        for (let pIdx = 0; pIdx < pages.length; pIdx++) {
          const blob = await renderA4Page({
            pageSegments: pages[pIdx]!,
            isFirstPage: pIdx === 0,
            isFullPage: pIdx < pages.length - 1,
            title,
            singer,
            keyText,
            capoText,
            timeSignatureText,
            canvasW: pageW,
            canvasH: pageH,
            pageMargin,
            colors,
            layoutAlign: layoutAlign ?? 'start',
            showBarre,
            lyricsFontWeight,
            jpegQuality,
            ignoreEmptySpace: ignoreEmptySpaceMode,
          });
          blobs.push(blob);

          self.postMessage({
            type: 'progress',
            percent: Math.round(((pIdx + 1) / pages.length) * 100),
          } as WorkerExportMessage);
        }
      } else {
        // ===== 普通长图模式（画布宽度自适应实际最宽行，左右对称 pageMargin 页边距，彻底消除右侧空白） =====
        const blob = await renderLongImageBlob(
          lines,
          title,
          singer,
          keyText,
          capoText,
          timeSignatureText,
          colors,
          layoutAlign ?? 'start',
          showBarre,
          lyricsFontWeight,
          jpegQuality,
          pageMargin,
          ignoreEmptySpaceMode
        );
        blobs.push(blob);

        self.postMessage({ type: 'progress', percent: 100 } as WorkerExportMessage);
      }

      self.postMessage({ type: 'complete', blobs, pageLineRanges } as WorkerExportMessage);
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      } as WorkerExportMessage);
    }
  };

// ── 公开 API 重导出：保持与本文件拆分前完全一致，现有 import 不受影响 ──
export type {
  ExportCharItem,
  ExportChordData,
  ExportLineItem,
  FooterComposePayload,
  RenderSegment,
  ScoreWorkerRequest,
  WorkerExportMessage,
  WorkerExportPayload,
} from './scoreExportTypes';
export { getCharColumnWidth, wrapScoreLines } from './scoreExportLayout';
