/**
 * @Author likan
 * @Date 2026-05-29 10:35:19
 * @Filepath fret-logic\src\utils\domExporter.ts
 */

import * as htmlToImage from 'html-to-image';

/**
 * 将指定的 DOM 元素转换为图片并写入系统剪切板
 * @param selector CSS 选择器
 */
export const copyElementToClipboard = async (selector: string): Promise<void> => {
  const el = document.querySelector(selector) as HTMLElement;
  if (!el) throw new Error('未找到目标 DOM 节点');

  const blob = await htmlToImage.toBlob(el, {
    quality: 0.95,
    pixelRatio: 2,
    cacheBust: true,
    style: { transform: 'none' },
  });

  if (!blob) throw new Error('Blob 图片数据生成失败');

  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
};
