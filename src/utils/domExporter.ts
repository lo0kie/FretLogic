import type { Options } from 'html-to-image/lib/types';
import type { Ref } from 'vue';
import { unref } from 'vue';

export interface ExportOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
  isTransparent?: boolean;
  style?: Record<string, string>;
  filter?: (node: Node) => boolean;
  pixelRatio?: number;
}

/** 1. 辅助计算：根据 DOM 面积计算自适应像素比，防止大图绘制卡死 */
const getCanvasPixelRatio = (el: HTMLElement): number => {
  const w = Math.max(el.scrollWidth, el.clientWidth);
  const h = Math.max(el.scrollHeight, el.clientHeight);
  const area = w * h;

  if (area > 4_000_000) return 1;
  if (area > 2_000_000) return 1.5;
  return Math.min(2, window.devicePixelRatio || 2);
};

/** 2. 样式读取：获取页面主背景色 */
const getDOMBgColor = (): string => {
  return getComputedStyle(document.body).getPropertyValue('--bg-main').trim() || '#f2f2f7';
};

/** 3. 字体加载：带 1.5 秒超时保护的字体就绪等待 */
const waitForFontsReady = async (): Promise<void> => {
  if (!document.fonts) return;
  await Promise.race([document.fonts.ready, new Promise<void>(resolve => setTimeout(resolve, 1500))]);
};

/** 4. 配置构建：将业务 ExportOptions 转为 html-to-image 的 Options 参数 */
const buildHtmlToImageOptions = (el: HTMLElement, exportOptions: ExportOptions): Options => {
  let defaultBgColor: string | undefined = getDOMBgColor();
  let defaultStyle: Record<string, string> = {};

  if (exportOptions.isTransparent) {
    defaultBgColor = undefined;
    defaultStyle = {
      backgroundColor: 'transparent',
      backgroundImage: 'none',
    };
  }

  return {
    quality: 0.95,
    pixelRatio: exportOptions.pixelRatio ?? getCanvasPixelRatio(el),
    cacheBust: false,
    width: exportOptions.width,
    height: exportOptions.height,
    backgroundColor: exportOptions.backgroundColor ?? defaultBgColor,
    style: {
      ...defaultStyle,
      ...exportOptions.style,
      transform: exportOptions.style?.transform ?? 'none',
      borderRadius: '0',
      borderColor: 'transparent',
      borderWidth: '0',
      boxShadow: 'none',
      border: 'none',
    },
    filter: exportOptions.filter,
  };
};

/** 6. DOM 渲染核心：将指定 Element 渲染为 PNG Blob 数据 */
export const renderElementToBlob = async (el: HTMLElement, exportOptions: ExportOptions = {}): Promise<Blob> => {
  const htmlToImage = await import('html-to-image');
  const finalOptions = buildHtmlToImageOptions(el, exportOptions);

  await waitForFontsReady();

  const blob = await htmlToImage.toBlob(el, finalOptions);

  if (!blob) {
    throw new Error('Blob 图片数据生成失败');
  }
  return blob;
};

export const renderElementToCanvas = async (
  el: HTMLElement,
  exportOptions: ExportOptions = {}
): Promise<HTMLCanvasElement> => {
  const htmlToImage = await import('html-to-image');
  const finalOptions = buildHtmlToImageOptions(el, exportOptions);
  await waitForFontsReady();
  return htmlToImage.toCanvas(el, finalOptions);
};

export const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality = 0.95): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Canvas 转 Blob 失败'))), type, quality);
  });

export const writeBlobToClipboard = async (blob: Blob): Promise<void> => {
  if (!navigator.clipboard) throw new Error('当前浏览器环境受限 (需要 HTTPS)，无法调用剪贴板');
  if (!document.hasFocus()) throw new Error('页面已失去焦点，请保持窗口激活后重新尝试');
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
  }
};

/** 7. 导出复制工具：入口函数，只负责提取 DOM 并触发剪贴板复制 */
export const copyElementToClipboard = async (
  target: HTMLElement | Ref<HTMLElement | null | undefined> | null | undefined,
  exportOptions: ExportOptions = {}
): Promise<void> => {
  const el = unref(target);
  if (!el) {
    throw new Error('未找到目标 DOM 节点');
  }
  const blob = await renderElementToBlob(el, exportOptions);
  await writeBlobToClipboard(blob);
};

export const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
