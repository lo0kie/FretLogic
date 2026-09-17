/**
 * 乐谱导出动作实现（懒加载模块，由 useScoreExportActions 状态壳动态 import）：
 * - 长图复制 / 下载（normal 模式）
 * - A4 分页 Zip 下载
 * - A4 分页 PDF 下载
 * - 预览打印
 *
 * 独立成模块的原因：workerExportService / useScoreRenderPayload / pdf / print 等渲染链路
 * 只在用户点击导出时才需要，静态挂在 TopHeader 上会把整条链拖进首屏闭包
 * （见 useScoreExportActions 的动态 import 注释）。store 与 payload 上下文在模块首次加载时
 * 初始化一次（所依赖的 composable 均只读 store/computed，无生命周期钩子，可在组件外调用）。
 */
import { storeToRefs } from 'pinia';

import { DEFAULT_SCORE_TITLE, getScorePageSize, getScorePageSizeMm } from '@/domains/score/constants';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { currentRenderData, readA4PageBlob } from '@/domains/score/preview/scorePreviewCache';
import { runWorkerExport } from '@/domains/score/preview/services/workerExportService';
import { useScoreRenderPayload } from '@/domains/score/preview/useScoreRenderPayload';
import { runBusyAction } from '@/platform/composables/runBusyAction';
import { writeBlobToClipboard } from '@/platform/services/clipboard/clipboard';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { buildExportFileName, triggerBlobDownload } from '@/platform/utils/canvas';
import { buildImagePdf } from '@/platform/utils/pdf';
import { printImagePages } from '@/platform/utils/print';

import type { PdfImagePage } from '@/platform/utils/pdf';

const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const { isCopying } = storeToRefs(useUiStore());
// Worker 渲染载荷统一构建（全曲行索引 + 设置项读取），与预览面板共享同一来源
const { getAllLineIndices, buildRenderPayload, composePageFooter } = useScoreRenderPayload();

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
      const blob = await getLongImageBlob();
      if (op === 'copy') {
        await writeBlobToClipboard(blob);
        return '成功复制至系统剪贴板';
      }
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

      // 每页为已压缩的 JPEG，Zip 内采用 store(level 0) 直接归档，避免重复压缩耗时
      const files: Record<string, Uint8Array> = {};
      const base = buildExportFileName(song.title || '');
      for (let i = 0; i < blobs.length; i++) {
        const buf = await blobs[i]!.arrayBuffer();
        files[`${base}_第${i + 1}页.jpg`] = new Uint8Array(buf);
      }
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
      // 取整会在长宽比上引入不必要的亚像素形变
      const { width, height } = getScorePageSize(settingsStore.scorePageSize);
      const wPt = (width * 72) / 96;
      const hPt = (height * 72) / 96;

      // 手写极简 PDF 图像容器：各页 JPEG 以 /DCTDecode 原样嵌入，零二次编码、零依赖
      const pages: PdfImagePage[] = [];
      for (const blob of blobs) {
        pages.push({
          jpeg: new Uint8Array(await blob.arrayBuffer()),
          pixelWidth: width,
          pixelHeight: height,
          widthPt: wPt,
          heightPt: hPt,
        });
      }
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
    // 刻意不给成功提示：紧接着弹出的系统打印对话框本身就是结果反馈，再叠一条 toast 只会抢焦点
    run: async () => {
      const blobs = await getA4Blobs();
      if (blobs.length === 0) throw new Error('未能生成有效的打印页');
      // 纸张尺寸按当前档位解析为 mm 标准纸型：与页图物理比例严格一致，打印时不被缩放
      const { widthMm, heightMm } = getScorePageSizeMm(settingsStore.scorePageSize);
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
    return composePageFooter(cached.filter((blob): blob is Blob => blob !== null));
  }
  const { blobs } = await runWorkerExport(buildRenderPayload('a4'));
  if (blobs.length === 0) throw new Error('未能生成有效的导出图片');
  return composePageFooter(blobs);
};

/** 取长图 Blob（「下载为长图」按需渲染，预览不预渲染长图，故每次都走 Worker） */
const getLongImageBlob = async (): Promise<Blob> => {
  const { blobs } = await runWorkerExport(buildRenderPayload('normal'));
  if (blobs.length === 0) throw new Error('未能生成有效的导出图片');
  return blobs[0]!;
};
