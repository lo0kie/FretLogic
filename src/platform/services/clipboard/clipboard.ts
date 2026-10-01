/**
 * 文本剪贴板封装：能力检测 + 页面失焦检查 + 权限错误转中文引导。
 * 与 score-export.ts 的 writeBlobToClipboard（图片）风格一致，面向纯文本。
 */

import { wrap } from 'comlink';

import { isFunction } from '@/platform/utils/common';
import { canvasToBlob, drawBitmapToPngBlob } from '@/platform/utils/output';

import type { PngTranscodeWorker } from './pngTranscodeWorker';

/** 构造带 cause 的错误（cause 由 Error 自带的可选属性承载） */
const withCause = (message: string, cause: unknown): Error => {
  const error = new Error(message);
  error.cause = cause;
  return error;
};

/** 把剪贴板权限/安全类错误映射为中文引导提示 */
const clipboardErrorHint = (err: unknown): string => {
  if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'SecurityError'))
    return '剪贴板权限被拒绝，请在浏览器设置中允许';

  return err instanceof Error ? err.message : '未知错误';
};

/** 写入文本到剪贴板；不支持/失焦/权限拒绝时抛中文错误 */
export const writeTextToClipboard = async (text: string): Promise<void> => {
  if (!navigator.clipboard || !isFunction(navigator.clipboard.writeText))
    throw new Error('当前浏览器环境不支持复制文本到剪贴板');

  if (!document.hasFocus()) throw new Error('页面已失去焦点，请保持窗口激活后重新尝试');

  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    throw withCause(`复制失败：${clipboardErrorHint(err)}`, err);
  }
};

/** 从剪贴板读取文本；不支持/权限拒绝/为空时抛中文错误 */
export const readTextFromClipboard = async (): Promise<string> => {
  if (!navigator.clipboard || !isFunction(navigator.clipboard.readText))
    throw new Error('当前浏览器环境不支持读取剪贴板');

  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch (err) {
    throw withCause(`读取剪贴板失败：${clipboardErrorHint(err)}`, err);
  }
  if (!text) throw new Error('剪贴板中没有文本内容');
  return text;
};

/**
 * PNG 转码 Worker 版：解码、重绘与编码全部在独立线程，主线程零阻塞
 * （长图上亿像素在主线程会把页面冻住数秒，见 pngTranscodeWorker.ts 头注释）。
 * 一次性 Worker：每次转码新建、用完即毁——转码是低频操作，常驻反而白占内存。
 *
 * 消息往返交给 comlink（`wrap` 代理 `transcode`），本函数只留两条 comlink 管不到的兜底：
 * 它既不监听 Worker 的 error 事件（脚本加载失败时那笔调用会永远悬着），也没有超时概念。
 * 两条兜底都收在 finish 里，保证任一路径都以 terminate 收尾。
 */
const reencodeAsPngInWorker = (blob: Blob): Promise<Blob> => {
  let worker: Worker;
  try {
    worker = new Worker(new URL('./pngTranscodeWorker', import.meta.url), { type: 'module' });
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error('PNG 转码线程创建失败'));
  }

  return new Promise<Blob>((resolve, reject) => {
    const finish = (fn: () => void) => {
      clearTimeout(timer);
      worker.terminate();
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error('PNG 转码超时（120s）'))), 120_000);
    worker.onerror = event => void finish(() => void reject(new Error(event.message || 'PNG 转码线程异常')));
    wrap<PngTranscodeWorker>(worker)
      .transcode(blob)
      .then(
        png => finish(() => resolve(png)),
        err => finish(() => reject(err instanceof Error ? err : new Error('PNG 转码失败')))
      );
  });
};

/**
 * 将任意图片 Blob 解码后重编码为 PNG Blob（JPEG→PNG 剪贴板降级用），失败保留原始异常。
 *
 * 优先走转码 Worker（见 reencodeAsPngInWorker）：解码与编码都在后台线程，主线程零阻塞。
 * Worker 不可用（创建失败/超时/转码异常）时退回主线程 OffscreenCanvas——慢但能出结果。
 *
 * 对外导出：长图这类大产物每次复制都转码一遍代价过高（解码 + 重绘 + 重编码整张图），
 * 调用方可自行缓存转码结果（见 scoreExportActions 的长图单槽缓存）。
 */
export const reencodeAsPng = async (blob: Blob): Promise<Blob> => {
  try {
    return await reencodeAsPngInWorker(blob);
  } catch {
    // Worker 不可用：静默回退主线程路径（慢但可用）
  }
  const bitmap = await createImageBitmap(blob);
  try {
    // Worker 不可用的主线程回退：环境支持 OffscreenCanvas 就走共享绘制段（drawBitmapToPngBlob），
    // 否则退回 document canvas + canvasToBlob —— 慢但能出结果
    if (typeof OffscreenCanvas !== 'undefined') return await drawBitmapToPngBlob(bitmap);

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
  if (!navigator.clipboard || !isFunction(navigator.clipboard.write) || typeof ClipboardItem === 'undefined')
    throw new Error('当前浏览器环境不支持复制图片到剪贴板');

  if (!document.hasFocus()) throw new Error('页面已失去焦点，请保持窗口激活后重新尝试');

  const writeItem = (item: Blob, mime: string) => navigator.clipboard.write([new ClipboardItem({ [mime]: item })]);

  const mimeType = blob.type || 'image/png';
  // Chrome 的 ClipboardItem 仅支持 image/png 写入。优先用官方探测（ClipboardItem.supports）
  // 直接判定：不支持首选类型时不必先走一次注定失败的 write（异常往返）再降级，先转码再写入
  const supportsType = (mime: string): boolean =>
    isFunction(ClipboardItem.supports) ? ClipboardItem.supports(mime) : true;

  if (supportsType(mimeType))
    try {
      await writeItem(blob, mimeType);
      return;
    } catch (originalErr) {
      // 已是最兼容的 PNG 且写入仍失败（权限/焦点等），无可降级空间，直接抛出
      if (mimeType === 'image/png') throw withCause(`复制图片失败：${clipboardErrorHint(originalErr)}`, originalErr);

      // 非 PNG 且首选写入被拒：转码为 PNG 后重试一次
      try {
        const pngBlob = await reencodeAsPng(blob);
        await writeItem(pngBlob, 'image/png');
      } catch {
        throw withCause(`复制图片失败：${clipboardErrorHint(originalErr)}`, originalErr);
      }
      return;
    }

  // 探测明确不支持首选类型（如 Chrome 下的 image/jpeg）：直接转码为 PNG 再写入
  try {
    const pngBlob = await reencodeAsPng(blob);
    await writeItem(pngBlob, 'image/png');
  } catch (err) {
    throw withCause(`复制图片失败：${clipboardErrorHint(err)}`, err);
  }
};
