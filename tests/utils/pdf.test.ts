import { describe, expect, it } from 'vitest';

import { buildImagePdf } from '@/platform/utils/pdf';

import type { PdfImagePage } from '@/platform/utils/pdf';

/** 造一个最小的“JPEG”——仅用于验证 PDF 字节结构层面，不做真实 jpeg 解码 */
const fakeJpeg = (size: number): Uint8Array => Uint8Array.from({ length: size }, (_, i) => (i + 1) & 0xff);

/** 把 PDF 字节按 latin1 解码便于字符串断言（PDF 头部/xref 均为 ASCII） */
const toLatin1 = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

/** 断言 bytes 中包含完整的 subArray（Uint8Array.includes 只判单元素，不判定子数组） */
const containsSubarray = (bytes: Uint8Array, subArray: Uint8Array): boolean => {
  if (subArray.length === 0) return true;
  outer: for (let i = 0; i <= bytes.length - subArray.length; i++) {
    if (bytes[i] !== subArray[0]) continue;
    for (let j = 1; j < subArray.length; j++) {
      if (bytes[i + j] !== subArray[j]!) continue outer;
    }
    return true;
  }
  return false;
};

describe('buildImagePdf 极简 PDF 图像容器生成器', () => {
  it('单页 PDF：生成合法骨架且图片/内容流长度精确', () => {
    const jpeg = fakeJpeg(37);
    const pdf = buildImagePdf([{ jpeg, pixelWidth: 794, pixelHeight: 1123, widthPt: 596, heightPt: 842 }]);
    const text = toLatin1(pdf);

    // 文件头与对象总数
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    // 单页 → 1 Catalog + 1 Pages + 1 Page + 1 Image + 1 Content = 5 个对象
    expect(text).toContain('xref\n0 6\n');

    // 图片 XObject：/DCTDecode 与精确字节长度，且原始 JPEG 字节确实内嵌
    expect(text).toContain('/Subtype /Image /Width 794 /Height 1123');
    expect(text).toContain('/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length 37');
    expect(containsSubarray(pdf, jpeg)).toBe(true);

    // 内容流长度等于 q … cm /Im1 Do Q 的精确字节数
    expect(text).toContain('cm /Im1 Do Q');

    // 结尾有 startxref 与 %%EOF
    expect(text).toMatch(/startxref\n\d+\n%%EOF\n?$/);
  });

  it('多页 PDF：/Count 与 /Kids 页序一致，每个对象偏移可被 xref 精确定位', () => {
    const pages: PdfImagePage[] = [
      { jpeg: fakeJpeg(10), pixelWidth: 100, pixelHeight: 200, widthPt: 100, heightPt: 200 },
      { jpeg: fakeJpeg(20), pixelWidth: 200, pixelHeight: 400, widthPt: 200, heightPt: 400 },
    ];
    const pdf = buildImagePdf(pages);
    const text = toLatin1(pdf);

    // 两页 → 2*3 + 2 = 8 个对象
    expect(text).toContain('xref\n0 9\n');
    expect(text).toContain('/Count 2');
    // 页序 Kids 与 Page 对象编号
    expect(text).toContain('/Kids [3 0 R 6 0 R]');

    const start = text.match(/startxref\n(\d+)\n%%EOF\n?$/);
    expect(start).not.toBeNull();
    const xrefOffset = Number(start![1]);
    // startxref 指向 “xref” 关键字起始
    expect(text.slice(xrefOffset).startsWith('xref')).toBe(true);

    // 从 xref 抽出每个对象偏移，验证偏移处正是 “N 0 obj”
    const xrefBody = text.slice(xrefOffset);
    const xrefLines = xrefBody.split('\n');
    // 第 3 行起为对象条目（跳过 “xref” 与 “0 9”）
    const objLines = xrefLines.slice(2, 9 + 2);
    // 0 号 FREE 项
    expect(objLines[0]).toContain('65535 f');
    // 1..8 号对象：偏移处均应命中 “N 0 obj”
    for (let idx = 1; idx < objLines.length; idx++) {
      const m = objLines[idx]!.match(/^(\d{10}) (\d{5}) n /);
      expect(m).not.toBeNull();
      const offset = Number(m![1]);
      const expected = `${idx} 0 obj`;
      expect(text.slice(offset, offset + expected.length)).toBe(expected);
    }
  });

  it('空页列表：返回最小但仍以 %PDF 开头的文档', () => {
    const pdf = buildImagePdf([]);
    expect(toLatin1(pdf).startsWith('%PDF-1.4')).toBe(true);
  });
});
