// src/constants/print.ts
/** A4 纸张宽度（px @96dpi，210mm） */
export const A4_WIDTH_PX = 794; // 210mm @96dpi
/** A4 纸张高度（px @96dpi，297mm） */
export const A4_HEIGHT_PX = 1123; // 297mm @96dpi
/** A4 页边距（px，≈15mm） */
export const A4_MARGIN_PX = 56; // ≈15mm 页边距
/** A4 内容区宽度（= 纸宽 - 左右页边距） */
export const A4_CONTENT_WIDTH = A4_WIDTH_PX - A4_MARGIN_PX * 2;
/** A4 内容区高度（= 纸高 - 上下页边距） */
export const A4_CONTENT_HEIGHT = A4_HEIGHT_PX - A4_MARGIN_PX * 2;
