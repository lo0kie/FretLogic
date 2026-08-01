import { Ref, unref } from 'vue';

export const copyElementToClipboard = async (
  target: HTMLElement | Ref<HTMLElement | null | undefined> | null | undefined,
  isTransparent: boolean = true
): Promise<void> => {
  const el = unref(target);

  if (!el) throw new Error('未找到目标 DOM 节点');
  if (!navigator.clipboard) {
    throw new Error('当前浏览器环境受限 (需要 HTTPS)，无法调用剪贴板');
  }

  // 🌟 1. 检测是否为乐谱容器（包含滚动条的长页面）
  const isScoreZone = el.classList.contains('interactive-score-zone');

  const getBlobPromise = async () => {
    const htmlToImage = await import('html-to-image');

    // 获取元素完全展开后的物理宽高（解决截断问题）
    const fullWidth = Math.max(el.scrollWidth, el.clientWidth);
    const fullHeight = Math.max(el.scrollHeight, el.clientHeight);

    // 🌟 2. 区分乐谱导出与普通指板导出
    const exportOptions = isScoreZone
      ? {
          // 乐谱强制使用全长宽高 + 实色背景
          width: fullWidth,
          height: fullHeight,
          style: {
            transform: 'none',
            overflow: 'visible',
            height: `${fullHeight}px`,
            maxHeight: 'none',
            backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-main') || '#f2f2f7',
          },
          backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg-main') || '#f2f2f7',
          filter: (domNode: Node) => {
            // 过滤掉行首尾的 "+和弦" 辅助按钮
            if (domNode instanceof HTMLElement && domNode.classList.contains('add-btn-slot')) {
              return false;
            }
            return true;
          },
        }
      : isTransparent
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

    // 预热缓存
    await htmlToImage.toBlob(el, exportOptions);

    // 生成高清 Blob 图像
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

export const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
