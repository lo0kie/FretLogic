export const copyElementToClipboard = async (selector: string, isTransparent: boolean = true): Promise<void> => {
  const el = document.querySelector(selector) as HTMLElement;
  if (!el) throw new Error('未找到目标 DOM 节点');

  const getBlobPromise = async () => {
    const htmlToImage = await import('html-to-image');

    const exportOptions = isTransparent
      ? {
          style: {
            transform: 'none',
            backgroundColor: 'transparent',
            backgroundImage: 'none',
            borderColor: 'transparent',
            boxShadow: 'none',
          },
          backgroundColor: undefined,
        }
      : {
          style: { transform: 'none' },
          backgroundColor: undefined,
        };

    await htmlToImage.toBlob(el, exportOptions);

    const blob = await htmlToImage.toBlob(el, {
      quality: 0.95,
      pixelRatio: 2,
      cacheBust: true,
      ...exportOptions,
    });
    if (!blob) throw new Error('Blob 图片数据生成失败');
    return blob;
  };

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': getBlobPromise() })]);
  } catch (err) {
    const blob = await getBlobPromise();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
  }
};
