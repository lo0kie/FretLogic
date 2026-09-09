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
  const offsets = new Map<number, number>();

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
    offsets.set(num, size);
    pushText(`${num} 0 obj\n`);
  };
  const endObj = (): void => {
    pushText('endobj\n');
  };
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
    startObj(contentObj);
    pushText(`<< /Length ${cm.length} >>\nstream\n`);
    pushBytes(enc.encode(cm));
    pushText('\nendstream\n');
    endObj();
  }

  // xref 表：从 0 号 FREE 项到对象总数，随后 trailer/startxref
  const xrefOffset = size;
  const total = count * 3 + 2;
  const lines: string[] = [`xref`, `0 ${total + 1}`];
  lines.push(`0000000000 65535 f `);
  for (let obj = 1; obj <= total; obj++) {
    lines.push(`${String(offsets.get(obj)).padStart(10, '0')} 00000 n `);
  }
  lines.push(`trailer`, `<< /Size ${total + 1} /Root 1 0 R >>`, `startxref`, `${xrefOffset}`, `%%EOF`);
  pushText(lines.join('\n') + '\n');

  // 合并所有分段为一个连续 Uint8Array
  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(totalLength);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}
