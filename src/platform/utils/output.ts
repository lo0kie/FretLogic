/**
 * 导出产物生成与输出：Canvas 转 Blob / 文件名构造 / 触发下载，图片合成 PDF，以及图片分页打印。
 *
 * 合并自 canvas.ts + pdf.ts + print.ts：三者是「把渲染结果交付给用户」的同一条链路
 * （转码 → 打包 → 下载/打印），调用方（导出面板、同步服务）通常直接用其中两三个。
 */
import { wait } from '@/platform/utils/common';

// ──────────────────────────── 以下原 canvas.ts ────────────────────────────

/**
 * 通用 Canvas / 下载工具：与任何领域无关的浏览器 DOM 能力，
 * 供乐谱导出、工作台导出、备份下载等场景共同复用（单一来源）。
 * 注：通用延时工具 wait 归 platform/utils/common（本模块只放 canvas 与下载相关能力），
 * 别因为「导出前要等一下」就把异步等待再塞回来。
 */

/** 触发 Blob 下载后延迟释放对象 URL 的时间（ms，留足浏览器启动下载的窗口） */
const URL_REVOKE_DELAY_MS = 1000;

/** Canvas 转 Blob 的 Promise 封装。 */
export const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png', quality = 0.95): Promise<Blob> =>
  new Promise(
    (resolve, reject) =>
      void canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Canvas 转 Blob 失败'))), type, quality)
  );

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
  link.style.display = 'none';
  // 挂载到 DOM 再点击：游离节点直接 click() 在部分浏览器（老 Firefox、部分移动 webview）不触发下载
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), URL_REVOKE_DELAY_MS);
};

// ──────────────────────────── 以下原 pdf.ts ────────────────────────────

/**
 * 极简 PDF 图像容器生成器（零依赖）。
 *
 * 用途：把「已渲染好的整页 JPEG」逐页装进 PDF。各页 JPEG 以 /DCTDecode 原样字节嵌入，
 * 不做二次编码，也无需字体/矢量/压缩表。页面由 /MediaBox 定义尺寸，内容流把对应图片
 * XObject 铺满整页。整个 PDF 以「本地头 + 每页三个对象(xref 精准偏移)」手工拼装。
 *
 * 二进制注意点：
 * - 字节偏移必须精确：每个对象起始位置记入 xref，差一个字节则 PDF 损坏；
 * - JPEG 属二进制流，必须整体字节拷贝（不可 spread 成 number 数组）；
 * - 内容流 /Length 必须等于流内数据的精确字节数。
 */

/** 一页：原始 JPEG 字节 + 像素尺寸（用于 /Width /Height）+ 页面物理尺寸（pt，用于 /MediaBox 与铺满变换） */
export interface PdfImagePage {
  /** 该页完整 JPEG 字节（/DCTDecode 流体） */
  jpeg: Uint8Array;
  /** 图片像素宽（XObject /Width） */
  pixelWidth: number;
  /** 图片像素高（XObject /Height） */
  pixelHeight: number;
  /** 页面物理宽度（PDF pt，逻辑单位） */
  widthPt: number;
  /** 页面物理高度（PDF pt，逻辑单位） */
  heightPt: number;
}

const enc = new TextEncoder();

/**
 * 依据页面列表构建一个 PDF 文件字节。
 * 通用抽离为纯函数：不依赖任何 DOM / 业务层，便于单测与跨环境复用。
 * @param pages 有序页列表（顺序即 PDF 页序）
 * @returns 完整 PDF 的字节内容
 */
export function buildImagePdf(pages: PdfImagePage[]): Uint8Array {
  const count = pages.length;
  if (count === 0) return enc.encode('%PDF-1.4\n%%EOF');

  const chunks: Uint8Array[] = [];
  let size = 0;
  // 对象编号从 1 连续递增，用稀疏数组按下标存偏移（替代 Map，省去装箱/哈希开销）
  const offsets: number[] = [];

  /** 追加 ASCII 文本（全 ASCII，字节长 == 字符串长） */
  const pushText = (text: string): void => {
    const bytes = enc.encode(text);
    chunks.push(bytes);
    size += bytes.length;
  };
  /** 追加二进制块（JPEG 流等） */
  const pushBytes = (bytes: Uint8Array): void => {
    chunks.push(bytes);
    size += bytes.length;
  };
  /** 开启一个对象：记录其字节起始偏移并写入对象头 */
  const startObj = (num: number): void => {
    offsets[num] = size;
    pushText(`${num} 0 obj\n`);
  };
  const endObj = (): void => void pushText('endobj\n');
  /** 数值序列化：整数直接输出，否则保留两位小数 */
  const num = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(2));

  pushText('%PDF-1.4\n');

  // 对象 1：Catalog；对象 2：Pages 树（Kid 依页序为 3,6,9,…）
  startObj(1);
  pushText('<< /Type /Catalog /Pages 2 0 R >>\n');
  endObj();

  startObj(2);
  const kids = Array.from({ length: count }, (_, i) => `${3 + 3 * i} 0 R`).join(' ');
  pushText(`<< /Type /Pages /Kids [${kids}] /Count ${count} >>\n`);
  endObj();

  // 每页三个对象：Page（含 MediaBox/Resources/Contents）→ 图片 XObject → 内容流
  for (let i = 0; i < count; i++) {
    const page = pages[i]!;
    const pageObj = 3 + 3 * i;
    const imageObj = pageObj + 1;
    const contentObj = pageObj + 2;
    const wPt = num(page.widthPt);
    const hPt = num(page.heightPt);

    // Page 对象：MediaBox 与铺满变换使用同一物理尺寸，图片坐标铺满整页
    startObj(pageObj);
    pushText(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt} ${hPt}] ` +
        `/Resources << /XObject << /Im1 ${imageObj} 0 R >> >> /Contents ${contentObj} 0 R >>\n`
    );
    endObj();

    // 图片 XObject：JPEG 原样字节，精确声明 /Length
    startObj(imageObj);
    pushText(
      `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`
    );
    pushBytes(page.jpeg);
    pushText('\nendstream\n');
    endObj();

    // 内容流：把单位正方形缩放到 MediaBox 并贴图铺满
    // eslint-disable-next-line better-tailwindcss/no-duplicate-classes -- PDF 变换矩阵需多个“0”坐标操作数，非 Tailwind 类名
    const cm = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im1 Do Q`;
    // 只编码一次：/Length 必须写「流内数据的精确字节数」，用编码结果兜底（cm 当前全 ASCII，
    // 字符长 == 字节长，但不依赖该假设，未来混入非 ASCII 字符也不会损坏 PDF）
    const cmBytes = enc.encode(cm);
    startObj(contentObj);
    pushText(`<< /Length ${cmBytes.length} >>\nstream\n`);
    pushBytes(cmBytes);
    pushText('\nendstream\n');
    endObj();
  }

  // xref 表：从 0 号 FREE 项到对象总数，随后 trailer/startxref
  const xrefOffset = size;
  const total = count * 3 + 2;
  const lines: string[] = [`xref`, `0 ${total + 1}`];
  lines.push(`0000000000 65535 f `);
  for (let obj = 1; obj <= total; obj++) lines.push(`${String(offsets[obj]).padStart(10, '0')} 00000 n `);

  lines.push(`trailer`, `<< /Size ${total + 1} /Root 1 0 R >>`, `startxref`, `${xrefOffset}`, `%%EOF`);
  pushText(`${lines.join('\n')}\n`);

  // 合并所有分段为一个连续 Uint8Array（size 全程增量维护，无需再遍历 chunks 求和）
  const out = new Uint8Array(size);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

// ──────────────────────────── 以下原 print.ts ────────────────────────────

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
    if (!img.complete)
      await new Promise<void>(resolve => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });

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
