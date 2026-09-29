/**
 * PNG 转码 Worker：把任意图片 Blob（剪贴板场景是导出的 JPEG 长图）解码后重编码为 PNG。
 *
 * 为什么放 Worker：Chrome 的 ClipboardItem 仅支持写入 image/png，导出的 JPEG 长图必须
 * 转码一次。长图可达上亿像素（实测 1978×63959，PNG 约 84MB），这条「解码 → 重绘 → PNG
 * 编码」链路在主线程会把页面冻住数秒；挪进 Worker 后主线程只收最终 Blob
 * （postMessage 对 Blob 按引用传递，零拷贝），UI 全程不掉帧。
 *
 * 对外契约由 comlink 的 `expose` 承载：主线程 `wrap` 之后直接 `await transcode(blob)`，
 * 失败以异常抛出（comlink 会把 worker 侧抛出的 Error 连同 message / stack 还原到主线程），
 * 不必再自建 `{ ok, png, message }` 这类结果信封。
 */
import { expose } from 'comlink';

export interface PngTranscodeWorker {
  /** 解码任意图片 Blob 并重编码为 PNG */
  transcode(blob: Blob): Promise<Blob>;
}

const transcode = async (blob: Blob): Promise<Blob> => {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法初始化画布上下文');
    ctx.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob({ type: 'image/png' });
  } finally {
    bitmap.close();
  }
};

expose({ transcode } satisfies PngTranscodeWorker);
