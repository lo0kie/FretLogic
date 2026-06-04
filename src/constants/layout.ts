// 📐 侧边栏统一物理宽度
export const RIGHT_SIDEBAR_WIDTH = 335;
export const LEFT_SIDEBAR_WIDTH = 335;
export const RIGHT_SIDEBAR_WIDTH_PIXEL = `${RIGHT_SIDEBAR_WIDTH}px`;
export const LEFT_SIDEBAR_WIDTH_PIXEL = `${LEFT_SIDEBAR_WIDTH}px`;

// 📐 虚拟卡片除画布外的垂直宿主填充高 (px)
export const WORKBENCH_LAYOUT = {
  // pt-14(56px) + 标题(16px) + gap(32px) + pb(31px) 的固定物理间距
  BASE_VERTICAL_PADDING: 135,
} as const;
