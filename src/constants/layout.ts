/** 左侧栏宽度（px） */
export const LEFT_SIDEBAR_WIDTH = 344;
/** 左侧栏宽度（px 字符串形式，供 CSS 绑定） */
export const LEFT_SIDEBAR_WIDTH_PIXEL = `${LEFT_SIDEBAR_WIDTH}px`;

/** 工作台布局配置 */
export const WORKBENCH_LAYOUT = {
  /** 指板画布之外的固定垂直内边距（px，为和弦名区/操作区预留空间） */
  BASE_VERTICAL_PADDING: 135,
} as const;

/** 表单组件三档高度映射（rem，sm/md/lg） */
export const FORM_COMPONENT_HEIGHT_MAP = {
  sm: '1.5rem', // 小档高度
  md: '1.75rem', // 中档/默认高度
  lg: '2.2rem', // 大档高度
} as const;

/** 小档高度（= FORM_COMPONENT_HEIGHT_MAP.sm） */
export const HEIGHT_SM = FORM_COMPONENT_HEIGHT_MAP.sm;
/** 中档高度（= FORM_COMPONENT_HEIGHT_MAP.md） */
export const HEIGHT_MD = FORM_COMPONENT_HEIGHT_MAP.md;
/** 大档高度（= FORM_COMPONENT_HEIGHT_MAP.lg） */
export const HEIGHT_LG = FORM_COMPONENT_HEIGHT_MAP.lg;

/** 间距 token（rem，与 tokens.module.less 的 @space-* 保持一致，供脚本侧计算使用） */
export const SPACE_REM = {
  /** @space-2xs */
  XS_2: 0.125,
  /** @space-xs */
  XS: 0.25,
} as const;
