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

const getCanvasPixelRatio = (el: HTMLElement): number => {
  const w = Math.max(el.scrollWidth, el.clientWidth);
  const h = Math.max(el.scrollHeight, el.clientHeight);
  const area = w * h;
  if (area > 4_000_000) return 1;
  if (area > 2_000_000) return 1.5;
  return Math.min(2, window.devicePixelRatio || 2);
};

const getDOMBgColor = (): string => {
  const isDark = document.documentElement.classList.contains('dark');
  return isDark ? '#18181a' : '#f2f2f7';
};

const waitForFontsReady = async (): Promise<void> => {
  if (!document.fonts) return;
  await Promise.race([document.fonts.ready, new Promise<void>(resolve => setTimeout(resolve, 1500))]);
};

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
  if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
    throw new Error('当前浏览器环境不支持复制图片到剪贴板');
  }
  if (!document.hasFocus()) {
    throw new Error('页面已失去焦点，请保持窗口激活后重新尝试');
  }
  const mimeType = blob.type || 'image/png';
  try {
    await navigator.clipboard.write([new ClipboardItem({ [mimeType]: blob })]);
  } catch {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': Promise.resolve(blob) })]);
    }
  }
};

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
