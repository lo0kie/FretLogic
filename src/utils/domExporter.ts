import type { Options } from 'html-to-image/lib/types';
import type { Ref } from 'vue';
import { unref } from 'vue';

const getBodyBgColor = (): string => {
  return getComputedStyle(document.body).getPropertyValue('--bg-main').trim() || '#f2f2f7';
};

const resolvePixelRatio = (el: HTMLElement): number => {
  const w = Math.max(el.scrollWidth, el.clientWidth);
  const h = Math.max(el.scrollHeight, el.clientHeight);
  const area = w * h;

  if (area > 4_000_000) return 1;
  if (area > 2_000_000) return 1.5;
  return Math.min(2, window.devicePixelRatio || 2);
};

const waitFonts = async () => {
  if (!document.fonts) return;
  await Promise.race([document.fonts.ready, new Promise<void>(resolve => setTimeout(resolve, 1500))]);
};

export interface ExportOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
  isTransparent?: boolean;
  style?: Record<string, string>;
  filter?: (node: Node) => boolean;
}

export const renderElementToBlob = async (el: HTMLElement, exportOptions: ExportOptions = {}): Promise<Blob> => {
  const htmlToImage = await import('html-to-image');

  let defaultBgColor: string | undefined = getBodyBgColor();
  let defaultStyle: Record<string, string> = { transform: 'none' };

  if (exportOptions.isTransparent) {
    defaultBgColor = undefined;
    defaultStyle = {
      transform: 'none',
      backgroundColor: 'transparent',
      backgroundImage: 'none',
      borderColor: 'transparent',
      boxShadow: 'none',
    };
  }

  const finalOptions: Options = {
    quality: 0.95,
    pixelRatio: resolvePixelRatio(el),
    cacheBust: false,
    width: exportOptions.width,
    height: exportOptions.height,
    backgroundColor: exportOptions.backgroundColor ?? defaultBgColor,
    style: {
      ...defaultStyle,
      ...exportOptions.style,
    },
    filter: exportOptions.filter,
  };

  await waitFonts();

  const blob = await htmlToImage.toBlob(el, finalOptions);

  if (!blob) throw new Error('Blob 图片数据生成失败');
  return blob;
};

export const copyElementToClipboard = async (
  target: HTMLElement | Ref<HTMLElement | null | undefined> | null | undefined,
  optionsOrTransparent: boolean | ExportOptions = true
): Promise<void> => {
  const el = unref(target);
  if (!el) throw new Error('未找到目标 DOM 节点');
  if (!navigator.clipboard) {
    throw new Error('当前浏览器环境受限 (需要 HTTPS)，无法调用剪贴板');
  }
  if (!document.hasFocus()) {
    throw new Error('页面已失去焦点，请保持窗口激活后重新尝试');
  }

  const exportOptions: ExportOptions =
    typeof optionsOrTransparent === 'boolean' ? { isTransparent: optionsOrTransparent } : optionsOrTransparent;

  const blob = await renderElementToBlob(el, exportOptions);

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  } catch {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })]);
  }
};

export const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
