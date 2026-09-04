/**
 * 通用 Canvas / 下载工具：与任何领域无关的浏览器 DOM 能力，
 * 供乐谱导出、工作台导出、备份下载等场景共同复用（单一来源）。
 */

/** 触发 Blob 下载后延迟释放对象 URL 的时间（ms，留足浏览器启动下载的窗口） */
const URL_REVOKE_DELAY_MS = 1000;

/** Canvas 转 Blob 的 Promise 封装。 */
export const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality = 0.95): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Canvas 转 Blob 失败'))), type, quality);
  });

/** 延时工具（默认 0ms），用于导出前等待一帧渲染。 */
export const wait = (ms = 0) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** 标题转安全文件名：剔除路径非法字符与多余空白，供下载命名使用。 */
export const buildExportFileName = (title: string): string => {
  const cleaned = title
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return cleaned || 'score';
};

/** 触发单个 Blob 的浏览器下载，稍后释放对象 URL。 */
export const triggerBlobDownload = (blob: Blob, filename: string): void => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), URL_REVOKE_DELAY_MS);
};
