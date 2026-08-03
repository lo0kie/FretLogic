export const LEFT_SIDEBAR_WIDTH = 335;
export const LEFT_SIDEBAR_WIDTH_PIXEL = `${LEFT_SIDEBAR_WIDTH}px`;

export const WORKBENCH_LAYOUT = {
  BASE_VERTICAL_PADDING: 135,
} as const;

export const FORM_COMPONENT_HEIGHT_MAP = {
  sm: '1.5rem', // 小档高度
  md: '1.75rem', // 中档/默认高度
  lg: '2.2rem', // 大档高度
} as const;

export const HEIGHT_SM = FORM_COMPONENT_HEIGHT_MAP.sm;
export const HEIGHT_MD = FORM_COMPONENT_HEIGHT_MAP.md;
export const HEIGHT_LG = FORM_COMPONENT_HEIGHT_MAP.lg;

// 尺寸类型导出
export type FormComponentSize = keyof typeof FORM_COMPONENT_HEIGHT_MAP;
