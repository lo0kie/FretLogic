import type { Options } from 'html-to-image/lib/types';
import type { Ref } from 'vue';
import { unref } from 'vue';

const getBodyBgColor = (): string => {
  return getComputedStyle(document.body).getPropertyValue('--bg-main').trim() || '#f2f2f7';
};

const getScoreExportOptions = (el: HTMLElement): Options => {
  const fullWidth = Math.max(el.scrollWidth, el.clientWidth);
  const fullHeight = Math.max(el.scrollHeight, el.clientHeight);
  const bgColor = getBodyBgColor();

  return {
    width: fullWidth,
    height: fullHeight,
    style: {
      transform: 'none',
      overflow: 'visible',
      height: `${fullHeight}px`,
      maxHeight: 'none',
      backgroundColor: bgColor,
    },
    backgroundColor: bgColor,
    filter: (domNode: Node) => {
      return !(domNode instanceof HTMLElement && domNode.classList.contains('add-btn-slot'));
    },
  };
};

const getFretboardExportOptions = (isTransparent: boolean): Options => {
  if (isTransparent) {
    return {
      style: {
        transform: 'none',
        backgroundColor: 'transparent',
        backgroundImage: 'none',
        borderColor: 'transparent',
        boxShadow: 'none',
      },
      backgroundColor: undefined,
    };
  }

  return {
    style: { transform: 'none' },
    backgroundColor: undefined,
  };
};

const renderElementToBlob = async (el: HTMLElement, isTransparent: boolean): Promise<Blob> => {
  const htmlToImage = await import('html-to-image');
  const isScoreZone = el.classList.contains('interactive-score-zone');

  const baseOptions = isScoreZone ? getScoreExportOptions(el) : getFretboardExportOptions(isTransparent);

  if (document.fonts) {
    await document.fonts.ready;
  }

  const blob = await htmlToImage.toBlob(el, {
    quality: 0.95,
    pixelRatio: 2,
    cacheBust: true,
    ...baseOptions,
  });

  if (!blob) throw new Error('Blob 图片数据生成失败');
  return blob;
};

export const copyElementToClipboard = async (
  target: HTMLElement | Ref<HTMLElement | null | undefined> | null | undefined,
  isTransparent: boolean = true
): Promise<void> => {
  const el = unref(target);

  if (!el) throw new Error('未找到目标 DOM 节点');
  if (!navigator.clipboard) {
    throw new Error('当前浏览器环境受限 (需要 HTTPS)，无法调用剪贴板');
  }
  if (!document.hasFocus()) {
    throw new Error('页面已失去焦点，请保持窗口激活后重新尝试');
  }

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderElementToBlob(el, isTransparent) })]);
  } catch (err) {
    const blob = await renderElementToBlob(el, isTransparent);
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  }
};

export const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
