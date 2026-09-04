/**
 * BaseIcon 尺寸五档预设（px）。
 *
 * 档位语义（由小到大）：
 * - xs: 微型 —— 徽标内 / 滚动指示 / tag 移除 / 密码可见性等紧凑小图标
 * - sm: 小 —— 输入框内联（清空/眼睛）、滑块步进、Toast 关闭等常规内联图标
 * - md: 中 —— 菜单项 / 下拉选项 / 单元格工具 / Toast 类型等标准图标
 * - lg: 大 —— 重点操作、列表内主操作图标
 * - xl: 特大 —— icon-only 主按钮（顶栏 / 侧栏）图标
 *
 * 模板与样式一律通过档位名引用，禁止散落魔法数字；需要微调整体观感时只改本表。
 */
export const ICON_SIZE_PRESETS = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
} as const;

export type IconSizePreset = keyof typeof ICON_SIZE_PRESETS;
