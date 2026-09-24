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
import { SCORE_FOOTER_FONT_WEIGHT } from '@/domains/score/preview/services/footerOverlay';
import { ensureScoreFontsReady, pendingScoreFontWeights } from '@/domains/score/preview/services/scoreFonts';

import { markExportAborted, resetExportAbort, throwIfAborted } from './scoreExportAbort';
import { syncFretboardStyleKey } from './scoreExportFretboard';
import {
  applyLayoutScales,
  EXPORT_JPEG_QUALITY,
  LAYOUT,
  SCORE_BASE_FONT_WEIGHTS,
  setTrimEmptyEdgeFrets,
  wrapScoreLines,
} from './scoreExportLayout';
import {
  composeFooterPage,
  composeFooterPages,
  computePageLineRanges,
  packA4Pages,
  renderA4Page,
  renderLongImageBlob,
} from './scoreExportPages';
import { getHeaderHeight } from './scoreExportRender';

import type { FooterPageOptions } from './scoreExportPages';
import type { ScoreWorkerRequest, WorkerExportMessage } from './scoreExportTypes';

/** 统一的错误信封：页脚合成分支与整谱渲染分支的 `catch` 逐字同形，收在此处一处维护。
 *  本函数只在下方 `typeof self` 守卫内被调用，故调用时 `self` 必然存在。 */
const postError = (err: unknown): void =>
  void self.postMessage({
    type: 'error',
    message: err instanceof Error ? err.message : String(err),
  } as WorkerExportMessage);

/** 分页总数已定（排版结束、逐页出图之前）：主线程据此先铺骨架，不必等第一页出图。
 *  连同**逐页覆盖的歌词行序号**一并回带：主线程要在任何一页画出来之前，用它校验「同内容键下
 *  已在位的那几页是否仍属于本次排版」（页数相同但分页边界挪了也能当场发现，代价为零）。 */
const postPagesPlanned = (total: number, pageLineRanges: number[][]): void =>
  void self.postMessage({ type: 'pages-planned', total, pageLineRanges } as WorkerExportMessage);

/** 单页出图（流式上报）：与随后的 complete 是**同一批** blobs，只是早一步到达，供边出边显示。 */
const postPage = (index: number, blob: Blob): void =>
  void self.postMessage({ type: 'page', index, blob } as WorkerExportMessage);

/** 单页页脚合成图（流式上报）：与 `page` 分开成两条消息 —— 两者在缓存里是两份数据（见 scoreExportTypes） */
const postFooterPage = (index: number, blob: Blob): void =>
  void self.postMessage({ type: 'footer-page', index, blob } as WorkerExportMessage);

/**
 * 「当下这一笔渲染已被作废」标志位与中断点都在 scoreExportAbort（消息入口与分页层共用同一个闸），
 * 本文件只负责在请求边界置位 / 复位，并在自己的 await 边界上查。
 */
if (typeof self !== 'undefined')
  self.onmessage = async (e: MessageEvent<ScoreWorkerRequest>) => {
    const payload = e.data;

    // 中断请求：只置标志位，不进入下面两条渲染分支，也不产生任何回报（被中断的那笔自己报 error）
    if (payload.kind === 'cancel') {
      markExportAborted();
      return;
    }
    // 任何一个真实请求起跑都先复位：cancel 只针对「下发那一刻在跑的那一笔」，不得误伤后到者
    resetExportAbort();

    // 页脚合成请求：只做「贴图 + 画页码 + 重编码」，与整谱渲染共用渲染线程（服务层同一队列串行下发）
    if (payload.kind === 'footer-compose') {
      try {
        // 页码文字也走乐谱字体栈（见 services/footerOverlay），故本分支同样要先装字体：页图会被预览
        // 缓存留着，所以合成请求可能在渲染之后很久才到，而 Worker 空闲 60s 即被回收 —— 冷启动时若
        // 只依赖渲染分支的装载，页码就会按回落字体画出来。
        await ensureScoreFontsReady([SCORE_FOOTER_FONT_WEIGHT]);
        const blobs = await composeFooterPages(payload, (index, blob) => postFooterPage(index, blob));
        // 页脚合成不走 havePages（每次都是用户显式发起的完整合成）：blobs 与入参 pages 同序，
        // 故页序就是入参的 pageIndexes（缺省即下标）—— 上面逐页上报用的是同一个值。
        const renderedPages = payload.pages.map((_, i) => payload.pageIndexes?.[i] ?? i);
        self.postMessage({ type: 'complete', blobs, renderedPages } as WorkerExportMessage);
      } catch (err) {
        postError(err);
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
        trimEmptyEdgeFrets = false,
        ignoreEmptySpace: ignoreEmptySpaceMode = false,
        lyricsFontWeight: lyricsFontWeightMode = 'regular',
        exportQuality = EXPORT_JPEG_QUALITY,
        pageMargin = LAYOUT.PAGE_MARGIN,
        pageSize = 'a4',
        havePages = [],
        embedFooterPages = false,
      } = payload;

      // 导出单页尺寸：按档位解析宽高（A4 / A5 / Letter），仅 A4 分页模式使用
      const { width: pageW, height: pageH } = getScorePageSize(pageSize);

      // 歌词字重映射为 canvas 数值字重（light 300 / regular 400 / bold 700）
      const lyricsFontWeight = lyricsFontWeightMode === 'light' ? 300 : lyricsFontWeightMode === 'bold' ? 700 : 400;

      // 乐谱字体（随包分发的 Sarasa 子集，整张谱共用一份族栈）就绪后再进入排版：量宽（measureText）与
      // 绘制必须用同一份字体，否则首次导出会按回落字体量宽、再按注册后的字体绘制，列宽与字形对不上。
      // 只装载本次会用到的字重：固定部分来自 SCORE_BASE_FONT_WEIGHTS（标题 / 和弦名 / 元信息），歌词
      // 字重随导出参数变化 —— Light 仅在歌词选 light 时才请求，默认导出不为它多下 1MB
      //（见 services/scoreFonts）。页脚那档不在这里：它由上面的页脚合成分支自己装载。
      const fontWeights = [...SCORE_BASE_FONT_WEIGHTS, lyricsFontWeight];
      // 阶段上报（供主线程把「等字体」与「出图」分开提示）：只在本线程尚未装载过该字重时才报 fonts ——
      // 命中装载缓存时 ensureScoreFontsReady 会立刻返回，报了反而让主线程闪一帧「正在加载字体」又跳回去。
      // 页脚合成分支不报阶段：那条路径没有居中加载提示的消费方，且合成本身无独立阶段名。
      if (pendingScoreFontWeights(fontWeights).length > 0)
        self.postMessage({ type: 'stage', stage: 'fonts' } as WorkerExportMessage);
      await ensureScoreFontsReady(fontWeights);
      // 字体是整笔渲染里最长的两次 await 之一（1MB × 字重），回来先查一次：作废的请求不必再排版
      throwIfAborted();
      self.postMessage({ type: 'stage', stage: 'render' } as WorkerExportMessage);

      // 导出 JPEG 压缩质量：限制在 [0.3, 1] 区间（对应「导出质量」设置 30~100）
      const jpegQuality = Math.min(1, Math.max(0.3, exportQuality));

      // 排列和弦配置的缩放参数先于任何布局计算生效
      applyLayoutScales(fontScale, fretboardScale);
      // 品窗收紧档位与布局缩放同为「一次渲染一份」的模块级状态：在消息入口一次设定，
      // 之后行内容高（装箱链）与指板绘制读的是同一份，不会各算一套
      setTrimEmptyEdgeFrets(trimEmptyEdgeFrets);

      // 样式纪元（主题配色 + 缩放后几何）变化即清空指板位图缓存：旧位图画法已不成立，
      // 留着只会被 LRU 顶替而白占内存（缩放滑块连续拖动会产生一串新纪元）
      syncFretboardStyleKey(colors);

      const blobs: Blob[] = [];
      // a4 模式下每页覆盖的原始歌词行序号；normal 模式不产出
      let pageLineRanges: number[][] | undefined;
      // 本次实际画出来的页序（与 blobs 同序）：被 havePages 跳过的页不在其中。调用方据此把 blobs
      // 逐页归位，而不是假定它们从第 0 页起连续 —— 逐页化之后「洞」是常态。
      const renderedPages: number[] = [];
      // 调用方声明「这几页的图已在我手上」（同内容键）：直接跳过它们的绘制与 JPEG 编码 ——
      // 那是整笔渲染里最贵的一段。这里只认页序，页数与逐页内容是否仍与本次排版一致，由调用方
      // 按 pages-planned 回带的行范围自己判定（见 scoreExportTypes 的 havePages）。
      const have = new Set(havePages);

      if (mode === 'a4') {
        // ===== 单页分页模式（尺寸按档位 A4 / A5 / Letter） =====
        const contentHeight = pageH - pageMargin * 2;
        const headerH = getHeaderHeight(Boolean(singer));
        const availWidth = pageW - pageMargin * 2;

        // 1. 超长行软折行 → 2. 动态装箱分页（整句跨页保护 + 页首空行优化）
        const allSegments = wrapScoreLines(lines, availWidth, ignoreEmptySpaceMode);
        const pages = packA4Pages(allSegments, contentHeight, headerH);

        // 排版段（折行 + 装箱）是纯同步的，消息在此期间送不进来、查也查不出新值；但**进入排版之前**
        // 的那次字体 await 是真会等 macrotask 的（冷启动要下 1MB 子集），cancel 完全可能已经送达。
        // 故装箱一结束立刻查一次：已作废的这一笔不必再算行序、更不该让主线程为它铺一屏骨架。
        throwIfAborted();

        // 每页覆盖的原始歌词行序号（升序去重）
        pageLineRanges = computePageLineRanges(pages);

        // 预览开着页脚时逐页顺带合成（见 WorkerExportPayload.embedFooterPages）：
        // 页码色与页脚合成分支同源（导出配色 SUB_TEXT），质量与页面渲染同档
        const footerOpts: FooterPageOptions = {
          width: pageW,
          height: pageH,
          pageMargin,
          color: colors.SUB_TEXT,
          quality: jpegQuality,
        };

        // 页数先报出去：装箱是纯排版、逐页出图才是耗时大头，故「有 N 页」这件事远早于「第 1 页画好」。
        // 主线程收到即铺 N 个骨架槽位，之后每出一页填一个 —— 超长谱不必再等整批。
        // 行范围与页数同批送出：调用方要靠它校验自己那份已在位的页序是否仍属于本次排版，不符即整段
        // 从零重跑（内容键漏了某个影响分页的维度时，这是唯一的兜底）。
        postPagesPlanned(pages.length, pageLineRanges);

        for (let pIdx = 0; pIdx < pages.length; pIdx++) {
          // 调用方手上已有这一页：本轮它根本没有活儿可干（不绘制、不编码、不产生 await 边界）
          if (have.has(pIdx)) continue;
          // 每页开画前查一次：拦住「上一页编码期间（或更早）被作废」—— 切歌后这一笔的产物必然丢弃，
          // 没必要把剩下的页继续画完、继续占着渲染线程。中断只能落在 await 边界上，逐页的
          // convertToBlob 就是本循环仅有的边界（循环末尾那次见下）。
          throwIfAborted();
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
          // 编码期间完全可能刚收到 cancel（那一页的 await 就是消息能送进来的窗口）：这一页已无人要，
          // 不必克隆过线程再让主线程按 token 丢掉 —— 中断在这里比拖到下一轮页边界更省一次结构化克隆
          throwIfAborted();
          blobs.push(blob);
          renderedPages.push(pIdx);
          // 出一页报一页（与上面那句「页数先报」配对）：主线程收到即把对应骨架换成真图
          postPage(pIdx, blob);
          // 顺带合成页脚（预览专用）：页脚层与页图在缓存里是两份数据，故两个都发 —— 页图先发
          // （页面立刻上屏），页脚层随后到（页码随即补上）。整批另起一笔合成的老做法会让页码
          // 等到整谱渲染**结束之后**才开始出现（两者共用同一张整页画布，不可能并行）。
          // 顺序 await 是硬约束：并行会互相清掉对方的画布内容。
          if (embedFooterPages) {
            throwIfAborted();
            postFooterPage(pIdx, await composeFooterPage(blob, pIdx, footerOpts));
          }
        }
      } else {
        // ===== 普通长图模式（画布宽度自适应实际最宽行，左右对称 pageMargin 页边距，彻底消除右侧空白） =====
        // 长图恒为一页，故这里没有「先报总数」的信息价值；两条上报只为与分页模式的调用口径统一，
        // 消费方不必按模式分支判断「会不会收到流式消息」。行范围给空数组：长图不分页，无行序可谈。
        postPagesPlanned(1, []);
        if (!have.has(0)) {
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
          renderedPages.push(0);
          postPage(0, blob);
        }
      }

      self.postMessage({
        type: 'complete',
        blobs,
        renderedPages,
        pageLineRanges,
      } as WorkerExportMessage);
    } catch (err) {
      postError(err);
    }
  };

// ── 公开 API 重导出：保持与本文件拆分前完全一致，现有 import 不受影响 ──
export type {
  CancelRenderRequest,
  ExportCharItem,
  ExportChordData,
  ExportLineItem,
  FooterComposePayload,
  RenderSegment,
  ScoreWorkerRequest,
  WorkerExportMessage,
  WorkerExportPayload,
  WorkerRenderStage,
} from './scoreExportTypes';
export { getCharColumnWidth, wrapScoreLines } from './scoreExportLayout';
