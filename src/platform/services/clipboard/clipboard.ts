/**
 * 文本剪贴板封装：能力检测 + 页面失焦检查 + 权限错误转中文引导。
 * 与 score-export.ts 的 writeBlobToClipboard（图片）风格一致，面向纯文本。
 */

/** 构造带 cause 的错误（lib 不含 ErrorOptions，手动挂 cause 满足 preserve-caught-error） */
const withCause = (message: string, cause: unknown): Error => {
  const error = new Error(message) as Error & { cause?: unknown };
  error.cause = cause;
  return error;
};

/** 把剪贴板权限/安全类错误映射为中文引导提示 */
const clipboardErrorHint = (err: unknown): string => {
  if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
    return '剪贴板权限被拒绝，请在浏览器设置中允许，或改用 Ctrl+C / Ctrl+V';
  }
  return err instanceof Error ? err.message : '未知错误';
};

/** 写入文本到剪贴板；不支持/失焦/权限拒绝时抛中文错误 */
export const writeTextToClipboard = async (text: string): Promise<void> => {
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
    throw new Error('当前浏览器环境不支持复制文本到剪贴板');
  }
  if (!document.hasFocus()) {
    throw new Error('页面已失去焦点，请保持窗口激活后重新尝试');
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    throw withCause(`复制失败：${clipboardErrorHint(err)}`, err);
  }
};

/** 从剪贴板读取文本；不支持/权限拒绝/为空时抛中文错误 */
export const readTextFromClipboard = async (): Promise<string> => {
  if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
    throw new Error('当前浏览器环境不支持读取剪贴板');
  }
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch (err) {
    throw withCause(`读取剪贴板失败：${clipboardErrorHint(err)}`, err);
  }
  if (!text) throw new Error('剪贴板中没有文本内容');
  return text;
};

/** Canvas 转 Blob 的 Promise 封装 */
const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality = 0.95): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Canvas 转 Blob 失败'))), type, quality);
  });

/** 将任意图片 Blob 解码后重编码为 PNG Blob（JPEG→PNG 剪贴板降级用），失败保留原始异常 */
const reencodeAsPng = async (blob: Blob): Promise<Blob> => {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法初始化画布上下文');
    ctx.drawImage(bitmap, 0, 0);
    return await canvasToBlob(canvas, 'image/png');
  } finally {
    bitmap.close();
  }
};

/**
 * 复制图片 Blob 到剪贴板；环境不支持或页面失焦时抛错。
 * 注意：ClipboardItem 的键必须与 blob.type 完全一致，浏览器会校验类型匹配，
 * 伪造 MIME 键只会得到 NotAllowedError（类型不匹配）。因此当首选 MIME 写入失败时，
 * 唯一可靠的降级是把图片真正转码为 PNG（剪贴板事实标准）再重试，而非改声明。
 */
export const writeBlobToClipboard = async (blob: Blob): Promise<void> => {
  if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
    throw new Error('当前浏览器环境不支持复制图片到剪贴板');
  }
  if (!document.hasFocus()) {
    throw new Error('页面已失去焦点，请保持窗口激活后重新尝试');
  }

  const writeItem = (item: Blob, mime: string) => navigator.clipboard.write([new ClipboardItem({ [mime]: item })]);

  const mimeType = blob.type || 'image/png';
  try {
    await writeItem(blob, mimeType);
    return;
  } catch (originalErr) {
    // 已是最兼容的 PNG 且写入仍失败（权限/焦点等），无可降级空间，直接抛出
    if (mimeType === 'image/png') {
      throw withCause(`复制图片失败：${clipboardErrorHint(originalErr)}`, originalErr);
    }
    // 非 PNG（如 Worker 导出的 image/jpeg）且首选写入被拒：转码为 PNG 后重试一次
    try {
      const pngBlob = await reencodeAsPng(blob);
      await writeItem(pngBlob, 'image/png');
    } catch {
      throw withCause(`复制图片失败：${clipboardErrorHint(originalErr)}`, originalErr);
    }
  }
};
