/**
 * @Author likan
 * @Date 2026-05-29 10:35:19
 * @Filepath fret-logic\src\utils\domExporter.ts
 */

export const copyElementToClipboard = async (selector: string): Promise<void> => {
  const el = document.querySelector(selector) as HTMLElement;
  if (!el) throw new Error('未找到目标 DOM 节点');

  // 🌟 将生成过程封装为返回 Blob 的 Promise 函数
  const getBlobPromise = async () => {
    const htmlToImage = await import('html-to-image');
    await htmlToImage.toBlob(el, { style: { transform: 'none' } }); // 预热引擎防白屏
    const blob = await htmlToImage.toBlob(el, {
      quality: 0.95,
      pixelRatio: 2,
      cacheBust: true,
      style: { transform: 'none' },
    });
    if (!blob) throw new Error('Blob 图片数据生成失败');
    return blob;
  };

  try {
    // 🌟 修复 Bug 2 (首选方案)：直接传递 Promise 给 ClipboardItem
    // 这样浏览器就会认定操作是由用户的"点击"立即发起的，Safari / iOS 测试完美通过！
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': getBlobPromise(),
      }),
    ]);
  } catch (err) {
    // 🌟 降级方案：对于极其老旧、不支持 Promise 载体的 Chrome 浏览器，退回普通 Await 模式
    const blob = await getBlobPromise();
    await navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob,
      }),
    ]);
  }
};
