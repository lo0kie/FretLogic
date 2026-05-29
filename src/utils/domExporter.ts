/**
 * @Author likan
 * @Date 2026-05-29 10:35:19
 * @Filepath fret-logic\src\utils\domExporter.ts
 */

/**
 * 将指定的 DOM 元素转换为图片并写入系统剪切板
 * @param selector CSS 选择器
 */
export const copyElementToClipboard = async (selector: string): Promise<void> => {
  const el = document.querySelector(selector) as HTMLElement;
  if (!el) throw new Error('未找到目标 DOM 节点');

  // 🌟 优化：动态导入。只有当用户真正点击“复制”按钮时，浏览器才会发起网络请求下载该库
  const htmlToImage = await import('html-to-image');

  // 🌟 顺手防御：html-to-image 在 Safari 或是加载了外部字体时，首次渲染极易出现“白屏”或“样式丢失”Bug。
  // 最佳实践是先隐式渲染一次作为“预热”（丢弃结果），然后再正式渲染。
  await htmlToImage.toBlob(el, { style: { transform: 'none' } });

  const blob = await htmlToImage.toBlob(el, {
    quality: 0.95,
    pixelRatio: 2,
    cacheBust: true,
    style: { transform: 'none' },
  });

  if (!blob) throw new Error('Blob 图片数据生成失败');

  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
};
