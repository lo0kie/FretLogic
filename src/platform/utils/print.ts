/**
 * 通用「整页图片逐页打印」工具：与任何领域无关的浏览器打印能力（单一来源）。
 *
 * 为什么用隐藏 iframe 而不是 window.open：新窗口会被弹窗拦截器拦下，
 * 且打印后未必自动关闭、留下一个空白标签页；iframe 不弹窗、不在应用 DOM 与样式里留下痕迹，
 * 打印结束即整体移除。
 *
 * 为什么用 DOM API 装配文档而不是 document.write：后者已被 lib.dom 标记弃用，
 * 且其解析语义依赖「调用时机 + 隐式 open/close」；DOM 装配语义确定，也无需拼接 HTML 字符串。
 *
 * 打印保真度的三个关键点（缺一都会出现「白页 / 被缩小 / 多一张空白页」）：
 * 1. `@page` 显式声明纸张物理尺寸与零页边距——刻意用 mm 标准纸型标称值而非 px 换算值，
 *    使页面盒子与真实纸张严格一致，浏览器「适应纸张」的缩放不会产生任何形变；
 * 2. 页容器宽高与纸张严格相等，且 body 内除页容器外别无他物（连节点间空白都不留）：
 *    分页由「整页高度自然对齐页边界」完成，不再叠加强制分页——元素恰好占满一页时，
 *    强制 `break-after: page` 反而会在页面边界上多顶出一张空白页；
 * 3. 必须等所有页图解码完成再触发打印，否则拿到的是尚未绘制的空白文档。
 */
import { wait } from '@/platform/utils/canvas';

/** 等待页图就绪的兜底超时（ms）：图片异常时不至于永远卡在等待 */
const IMAGE_READY_TIMEOUT_MS = 10_000;
/** 页图就绪后到触发打印之间的落定延时（ms）：留出一次布局/绘制回合 */
const PRINT_SETTLE_DELAY_MS = 50;
/** 清理隐藏 iframe 与对象 URL 的兜底超时（ms）：正常路径由 afterprint 触发，部分浏览器不派发该事件 */
const CLEANUP_TIMEOUT_MS = 60_000;

export interface PrintImagePagesOptions {
  /** 纸张宽（mm） */
  pageWidthMm: number;
  /** 纸张高（mm） */
  pageHeightMm: number;
  /** 打印文档标题：部分浏览器「另存为 PDF」时用作默认文件名 */
  title?: string;
}

/** 打印文档样式：纸张尺寸与页容器尺寸两处同源，逐页严格对齐页边界 */
const buildPrintCss = (pageWidthMm: number, pageHeightMm: number): string => `
@page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
/* overflow 兜住亚像素误差，避免页尾溢出顶出空白页 */
.page { width: ${pageWidthMm}mm; height: ${pageHeightMm}mm; overflow: hidden; }
/* 页图与纸张同比例，contain 保证任何情况下都不裁切 */
.page img { display: block; width: 100%; height: 100%; object-fit: contain; }
/* 按原色输出：暗色谱页不被浏览器的省墨策略反色 */
.page img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
`;

/** 装配打印文档：样式 + 逐页图片；body 内只留页容器，不产生任何空白文本节点（空白行盒会干扰精确分页） */
const buildPrintDocument = (doc: Document, urls: string[], pageWidthMm: number, pageHeightMm: number): void => {
  const style = doc.createElement('style');
  style.textContent = buildPrintCss(pageWidthMm, pageHeightMm);
  doc.head.appendChild(style);

  const fragment = doc.createDocumentFragment();
  for (const url of urls) {
    const page = doc.createElement('div');
    page.className = 'page';
    const img = doc.createElement('img');
    img.src = url;
    img.alt = '';
    page.appendChild(img);
    fragment.appendChild(page);
  }
  doc.body.appendChild(fragment);
};

/** 等待文档内所有图片加载 + 解码完成（解码失败不阻断打印，仅失去「首帧即已绘制」的保证） */
const waitForImagesReady = async (doc: Document): Promise<void> => {
  const ready = Array.from(doc.images).map(async img => {
    if (!img.complete) {
      await new Promise<void>(resolve => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });
    }
    try {
      await img.decode();
    } catch {
      // 忽略：部分浏览器/图片格式不支持显式解码，交由打印时的同步绘制兜底
    }
  });
  await Promise.race([Promise.all(ready), wait(IMAGE_READY_TIMEOUT_MS)]);
};

/**
 * 以「一张图片一页」的方式打开系统打印对话框（不产生任何下载文件）。
 * 图片需与 pageWidthMm / pageHeightMm 保持同一宽高比（即整页渲染产物），否则按 contain 居中留白。
 * Promise 在打印对话框已触发后即兑现，不等待用户操作对话框。
 */
export const printImagePages = async (blobs: Blob[], options: PrintImagePagesOptions): Promise<void> => {
  const { pageWidthMm, pageHeightMm, title } = options;
  if (blobs.length === 0) return;

  const urls = blobs.map(blob => URL.createObjectURL(blob));
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  // 隐藏方式取「零尺寸 + 贴右下角」而非 display:none / visibility:hidden：
  // 后者在部分浏览器下不渲染该文档，打印结果为白页
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);

  let isCleaned = false;
  const cleanup = () => {
    if (isCleaned) return;
    isCleaned = true;
    iframe.remove();
    urls.forEach(url => URL.revokeObjectURL(url));
  };

  const view = iframe.contentWindow;
  const doc = view?.document;
  if (!view || !doc) {
    cleanup();
    throw new Error('无法创建打印文档');
  }

  try {
    buildPrintDocument(doc, urls, pageWidthMm, pageHeightMm);
    // 标题走 DOM 赋值：部分浏览器据此推导「另存为 PDF」的默认文件名
    doc.title = title || 'print';
    await waitForImagesReady(doc);
    await wait(PRINT_SETTLE_DELAY_MS);
  } catch (err) {
    cleanup();
    throw err;
  }

  view.addEventListener('afterprint', cleanup, { once: true });
  // 兜底回收：afterprint 未派发（Safari 等）时仍能释放 iframe 与对象 URL
  window.setTimeout(cleanup, CLEANUP_TIMEOUT_MS);
  // print() 在多数浏览器会阻塞主线程直到对话框关闭，故延后一个宏任务触发：
  // 先让调用方的 busy 状态与 loading 提示确定落定，再弹出打印对话框
  window.setTimeout(() => view.print(), 0);
};
