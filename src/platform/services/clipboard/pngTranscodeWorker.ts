/**
 * PNG 转码 Worker：把任意图片 Blob（剪贴板场景是导出的 JPEG 长图）解码后重编码为 PNG。
 *
 * 为什么放 Worker：Chrome 的 ClipboardItem 仅支持写入 image/png，导出的 JPEG 长图必须
 * 转码一次。长图可达上亿像素（实测 1978×63959，PNG 约 84MB），这条「解码 → 重绘 → PNG
 * 编码」链路在主线程会把页面冻住数秒；挪进 Worker 后主线程只收最终 Blob
 * （postMessage 对 Blob 按引用传递，零拷贝），UI 全程不掉帧。
 */
export interface PngTranscodeRequest {
  blob: Blob;
}

export interface PngTranscodeResponse {
  ok: boolean;
  png?: Blob;
  message?: string;
}

self.onmessage = async (e: MessageEvent<PngTranscodeRequest>) => {
  const { blob } = e.data;
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('无法初始化画布上下文');
      ctx.drawImage(bitmap, 0, 0);
      const png = await canvas.convertToBlob({ type: 'image/png' });
      self.postMessage({ ok: true, png } satisfies PngTranscodeResponse);
    } finally {
      bitmap.close();
    }
  } catch (err) {
    self.postMessage({
      ok: false,
      message: err instanceof Error ? err.message : 'PNG 转码失败',
    } satisfies PngTranscodeResponse);
  }
};
