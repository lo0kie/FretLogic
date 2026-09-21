/**
 * 乐谱导出动作实现（懒加载模块，由 useScoreExport 状态壳动态 import）：
 * - 长图复制 / 下载（normal 模式）
 * - A4 分页 Zip 下载
 * - A4 分页 PDF 下载
 * - 预览打印
 *
 * 独立成模块的原因：workerExportService / useScoreRenderPayload / pdf / print 等渲染链路
 * 只在用户点击导出时才需要，静态挂在 TopHeader 上会把整条链拖进首屏闭包
 * （见 useScoreExport 的动态 import 注释）。store 与 payload 上下文在模块首次加载时
 * 初始化一次（所依赖的 composable 均只读 store/computed，无生命周期钩子，可在组件外调用）。
 */
import { storeToRefs } from 'pinia';

import {
  DEFAULT_SCORE_TITLE,
  getScorePageSize,
  getScorePageSizeMm,
  SCORE_EXPORT_CONFIG,
} from '@/domains/score/constants';
import { useScoreLinesData } from '@/domains/score/editor/composables/useScoreLinesData';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { currentRenderData, readA4PageBlob } from '@/domains/score/preview/scorePreviewCache';
import { buildScoreRenderCacheKey } from '@/domains/score/preview/scoreRenderCacheKey';
import { runWorkerExport } from '@/domains/score/preview/services/workerExportService';
import { useScoreRenderPayload } from '@/domains/score/preview/useScoreRenderPayload';
import { runBusyAction } from '@/platform/composables/runBusyAction';
import { reencodeAsPng, writeBlobToClipboard } from '@/platform/services/clipboard/clipboard';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { buildExportFileName, buildImagePdf, printImagePages, triggerBlobDownload } from '@/platform/utils/output';

import type { PdfImagePage } from '@/platform/utils/output';

const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const { isCopying } = storeToRefs(useUiStore());
// Worker 渲染载荷统一构建（全曲行索引 + 设置项读取），与预览面板共享同一来源
const { getAllLineIndices, buildRenderPayload, composePageFooter } = useScoreRenderPayload();
const { chordsLookupMap } = useScoreLinesData();

/**
 * 长图结果单槽缓存：复制→下载这类连击（内容未变）直接复用上一次渲染产物，
 * 省掉一次约 2s 的 Worker 渲染。键即预览面板使用的同一个 `buildScoreRenderCacheKey`
 * （同一份维度清单，见 scoreRenderCacheKey），任一维度变化即未命中并覆盖重渲染——
 * 只留最新一份，长图体积大（可达几十 MB）不宜多槽。
 *
 * 同一份产物另外按需缓存一份 PNG（见 longImagePngBlob）：
 * Chrome 的 ClipboardItem 只接受 image/png，而 Worker 渲染产物恒为 JPEG，
 * 复制必须先转码。此前转码结果从不缓存，于是「下载复用 JPEG 秒开、复制每次重解重编码整张长图」，
 * 两种操作对同一份产物表现出完全不同的耗时。
 */
let longImageCacheKey = '';
let longImageCacheBlob: Blob | null = null;
/** 长图 PNG 副本的键：与 longImageCacheKey 同口径，不同即视为失效（换歌/换设置后不会张冠李戴） */
let longImagePngKey = '';
let longImagePngBlob: Blob | null = null;

/**
 * 预览 tab 的导出：整曲经 Worker 离屏渲染为一张长图（normal 模式），
 * 再按操作写入剪贴板或触发浏览器下载。
 */
export const handleScoreExport = (op: 'copy' | 'download') => {
  const song = scoreEditor.activeSong;
  if (!song || getAllLineIndices().length === 0) return Promise.resolve(null);

  return runBusyAction({
    busy: isCopying,
    loadingText: '正在渲染整曲长图...',
    logPrefix: 'Score export error:',
    errorFallback: '导出失败',
    run: async () => {
      // 复制取 PNG 副本：剪贴板只吃 PNG，转码结果按内容键缓存（重复复制不再重解重编码整张长图）
      if (op === 'copy') {
        await writeBlobToClipboard(await getLongImagePng());
        return '成功复制至系统剪贴板';
      }
      // 下载直接用渲染产出的 JPEG：不额外付一次转码，也不额外占一份 PNG
      const blob = await getLongImageBlob();
      triggerBlobDownload(blob, `${buildExportFileName(song.title || '')}.jpg`);
      return '已开始下载';
    },
    successText: message => message,
  });
};

/** 预览 tab 的分页导出为 Zip：经 Worker 离屏渲染为 A4 分页图片，再打包为一个 zip 文件下载 */
export const handleScoreExportZip = () => {
  const song = scoreEditor.activeSong;
  if (!song || getAllLineIndices().length === 0) return Promise.resolve(null);

  return runBusyAction({
    busy: isCopying,
    loadingText: '正在渲染分页图片并打包...',
    logPrefix: 'Score export zip error:',
    errorFallback: '导出失败',
    run: async () => {
      const blobs = await getA4Blobs();
      if (blobs.length === 0) throw new Error('未能生成有效的导出图片');

      // 每页为已压缩的 JPEG，Zip 内采用 store(level 0) 直接归档，避免重复压缩耗时；
      // 各页 buffer 并行读取（独立 Blob，串行 await 纯属等待叠加）
      const files: Record<string, Uint8Array> = {};
      const base = buildExportFileName(song.title || '');
      const buffers = await Promise.all(blobs.map(blob => blob.arrayBuffer()));
      buffers.forEach((buf, i) => {
        files[`${base}_第${i + 1}页.jpg`] = new Uint8Array(buf);
      });
      // 动态导入 fflate：不进首屏 chunk，仅点击「下载为分页 Zip」时拉取
      const { zipSync } = await import('fflate');
      const zipData = zipSync(files, { level: 0 });
      triggerBlobDownload(new Blob([zipData], { type: 'application/zip' }), `${base}.zip`);
      return '已开始下载';
    },
    successText: message => message,
  });
};

/** 预览 tab 的分页导出为 PDF：经 Worker 渲染 A4 分页图片后，把每页 JPEG 原样嵌入 PDF 后下载 */
export const handleScoreExportPdf = () => {
  const song = scoreEditor.activeSong;
  if (!song || getAllLineIndices().length === 0) return Promise.resolve(null);

  return runBusyAction({
    busy: isCopying,
    loadingText: '正在渲染分页图片并生成 PDF...',
    logPrefix: 'Score export pdf error:',
    errorFallback: '导出失败',
    run: async () => {
      const blobs = await getA4Blobs();
      if (blobs.length === 0) throw new Error('未能生成有效的导出图片');

      // 页面物理尺寸：worker 以 96dpi 点阵渲染，PDF 采用 pt(72dpi)，进行 0.75 = 72/96 换算；
      // 像素尺寸用于图片 XObject 的 /Width /Height，物理尺寸用于 MediaBox 与铺满变换。
      // 保留浮点（buildImagePdf 序列化时统一 toFixed(2)）：PDF 坐标支持小数，
      // 取整会在长宽比上引入不必要的亚像素形变。
      // 纸张档位取**页图实际渲染时的档位**（缓存 entry 记录），而非实时设置——
      // 否则改档位的在途窗口内导出会把新档位尺寸贴到旧档位页图上
      const renderPageSize = currentRenderData.value?.pageSize ?? settingsStore.scorePageSize;
      const { width, height } = getScorePageSize(renderPageSize);
      const wPt = (width * 72) / 96;
      const hPt = (height * 72) / 96;

      // R5：JPEG 实际像素随 DPR 缩放（如 DPR=2 时 1588×2246），而逻辑 px 是 794×1123——
      // XObject /Width /Height 必须声明固有像素，否则与位图 2 倍失真（严格 RIP 会降采样）。
      // Worker 页位图尺寸恒为「逻辑尺寸 × PIXEL_RATIO」（Worker 无 DPR，常量缩放），
      // 直接计算即可——此前为读宽高把首页整页 JPEG 解码一遍，纯浪费
      const pixelWidth = Math.round(width * SCORE_EXPORT_CONFIG.PIXEL_RATIO);
      const pixelHeight = Math.round(height * SCORE_EXPORT_CONFIG.PIXEL_RATIO);

      // 手写极简 PDF 图像容器：各页 JPEG 以 /DCTDecode 原样嵌入，零二次编码、零依赖。
      // 各页 buffer 并行读取（独立 Blob，串行 await 纯属等待叠加）
      const buffers = await Promise.all(blobs.map(blob => blob.arrayBuffer()));
      const pages: PdfImagePage[] = buffers.map(buf => ({
        jpeg: new Uint8Array(buf),
        pixelWidth,
        pixelHeight,
        widthPt: wPt,
        heightPt: hPt,
      }));
      const pdfData = buildImagePdf(pages);
      const base = buildExportFileName(song.title || '');
      // pdfData 为 Uint8Array<ArrayBufferLike>，切片得到精确长度的 ArrayBuffer 以匹配 BlobPart
      triggerBlobDownload(new Blob([pdfData.slice()], { type: 'application/pdf' }), `${base}.pdf`);
      return '已开始下载';
    },
    successText: message => message,
  });
};

/**
 * 预览 tab 的打印：与 PDF 导出同源（复用预览已渲染的分页图 + 页脚合成），
 * 区别是不产出任何文件，直接把各页图片交给系统打印对话框逐页打印。
 */
export const handleScorePrint = () => {
  const song = scoreEditor.activeSong;
  if (!song || getAllLineIndices().length === 0) return Promise.resolve(null);

  return runBusyAction({
    busy: isCopying,
    loadingText: '正在渲染分页图片并准备打印...',
    logPrefix: 'Score print error:',
    errorFallback: '打印失败',
    // 刻意不给成功提示：紧接着弹出的系统打印对话框本身就是结果反馈，再叠一条 message 只会抢焦点
    run: async () => {
      const blobs = await getA4Blobs();
      if (blobs.length === 0) throw new Error('未能生成有效的打印页');
      // 纸张尺寸按**页图实际渲染时的档位**解析（与 PDF 导出同口径，见 handleScoreExportPdf 注释）：
      // 取 currentRenderData 记录的 pageSize，而非实时设置——否则改档位的在途窗口内打印会把新档位
      // 尺寸贴到旧档位页图上，导致纸张与图比例不一致、打印被缩放（P1 审计：打印 vs PDF 纸张来源不一致）
      const renderPageSize = currentRenderData.value?.pageSize ?? settingsStore.scorePageSize;
      const { widthMm, heightMm } = getScorePageSizeMm(renderPageSize);
      await printImagePages(blobs, {
        pageWidthMm: widthMm,
        pageHeightMm: heightMm,
        title: song.title || DEFAULT_SCORE_TITLE,
      });
      return null;
    },
  });
};

/**
 * 直接从预览共享缓存取已渲染的 Blob，避免重复触发 Worker 渲染：
 * 预览面板在渲染/切歌时已把 A4 分页产物写入 scorePreviewCache，
 * 下载菜单的预估尺寸与三种导出均复用该结果，仅缓存缺失时回退重新渲染。
 * 缓存中的页面栅格不含页脚（页脚是独立合成层，见 services/footerOverlay），
 * 故此处统一按「显示页脚」开关合成一次：开关关闭时为零开销的原样返回。
 */
/** 取 A4 分页 Blob（PDF / ZIP 导出复用预览已渲染结果 + 按需合成页脚） */
const getA4Blobs = async (): Promise<Blob[]> => {
  const data = currentRenderData.value;
  if (data && data.a4Urls.length > 0) {
    const cached = await Promise.all(data.a4Urls.map(readA4PageBlob));
    // 必须把幸存页的真实下标传给页脚合成：只传过滤后数组会让少一页之后的所有页码整体前移
    const pageIndexes = cached.reduce<number[]>((acc, blob, idx) => {
      if (blob !== null) acc.push(idx);
      return acc;
    }, []);
    return composePageFooter(
      cached.filter((blob): blob is Blob => blob !== null),
      pageIndexes,
      data.pageSize,
      data.pageMargin
    );
  }
  const { blobs } = await runWorkerExport(buildRenderPayload('a4'));
  if (blobs.length === 0) throw new Error('未能生成有效的导出图片');
  return composePageFooter(blobs);
};

/** 取长图 Blob：优先命中单槽缓存（复制后紧接着下载即复用同一份产物），未命中才走 Worker 渲染 */
const getLongImageBlob = async (): Promise<Blob> => {
  const key = buildScoreRenderCacheKey(scoreEditor.activeSong, chordsLookupMap.value);
  if (key && key === longImageCacheKey && longImageCacheBlob) return longImageCacheBlob;

  const { blobs } = await runWorkerExport(buildRenderPayload('normal'));
  if (blobs.length === 0) throw new Error('未能生成有效的导出图片');
  longImageCacheKey = key;
  longImageCacheBlob = blobs[0]!;
  return longImageCacheBlob;
};

/**
 * 取长图的 PNG 副本（仅复制用）：命中同键缓存则直接返回，否则由 JPEG 转码一次并记账。
 *
 * 转码在独立线程完成（见 clipboard.reencodeAsPng），但整张长图的解码 + 重绘 + 重编码仍是
 * 实打实的一次全图处理——不缓存就会每次复制都重来一遍，而下载同一份产物却是秒开。
 * 必须先取 JPEG 再比对键：取 JPEG 的过程中可能刚重渲染过，键此时才是最新的。
 */
const getLongImagePng = async (): Promise<Blob> => {
  const jpeg = await getLongImageBlob();
  if (longImagePngBlob && longImagePngKey === longImageCacheKey) return longImagePngBlob;

  const png = await reencodeAsPng(jpeg);
  longImagePngKey = longImageCacheKey;
  longImagePngBlob = png;
  return png;
};
