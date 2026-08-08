// src/constants/print.ts
export const A4_WIDTH_PX = 794; // 210mm @96dpi
export const A4_HEIGHT_PX = 1123; // 297mm @96dpi
export const A4_MARGIN_PX = 56; // ≈15mm 页边距
export const A4_CONTENT_WIDTH = A4_WIDTH_PX - A4_MARGIN_PX * 2;
export const A4_CONTENT_HEIGHT = A4_HEIGHT_PX - A4_MARGIN_PX * 2;
// 最终位图 = 794*3 × 1123*3 ≈ 2382×3369，约等于 288dpi 印刷级分辨率
export const A4_EXPORT_PIXEL_RATIO = 3;
