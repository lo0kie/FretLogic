/**
 * 共享下拉项的尺寸基准：行高 / 文字档位 / 面板高度，同时服务于 BaseSelector 的下拉项与
 * BaseInput 的搜索结果行。
 * 行高统一由 ControlSize 尺寸标尺换算；文字档位与触发器共用同一份（见 ITEM_TEXT_CLASSES）；
 * 面板最大高度按「可见行(displayItems) × 行高 + 行距 + 内边距」估算。
 *
 * 内边距刻意**不设默认值**：两处面板的内层内边距本就不同（下拉面板是 p-xs = 0.75rem，
 * 搜索结果面板是 p-1 = 0.5rem），写死一个默认值就会让另一处多算 —— 而多算的表现是
 * 「结果数超过可见行数时，下一行露出几像素」，不留心看不出来。故强制调用方按自己的面板结构给出。
 */
import { CONTROL_HEIGHT_PRESETS } from '@/platform/ui/controlSizes';
import { clamp } from '@/platform/utils/common';

import type { ControlSize } from '@/platform/ui/controlSizes';

/** 行高（rem）：数值直接由尺寸标尺换算，避免与 CONTROL_HEIGHT_PRESETS 各记一份 */
const ITEM_HEIGHT: Record<ControlSize, number> = {
  sm: Number.parseFloat(CONTROL_HEIGHT_PRESETS.sm),
  md: Number.parseFloat(CONTROL_HEIGHT_PRESETS.md),
  lg: Number.parseFloat(CONTROL_HEIGHT_PRESETS.lg),
};
/**
 * 下拉项之间的行距**类名**：消费方模板直接用它，不再各写一遍 `gap-0.5`。
 *
 * 与 GAP_REM 同源（数值由本字面量反推），故两者不会漂移。必须是字面量：Tailwind 靠扫描源码
 * 取字面量生成工具类，拼字符串不会产出 CSS（同 ITEM_TEXT_CLASSES）。
 */
export const DROPDOWN_ITEM_GAP_CLASS = 'gap-0.5';

/**
 * 面板行间距（rem）：由上面的类名反推 —— Tailwind 间距刻度的步长是 0.25rem，
 * 故 `gap-0.5` = 0.5 × 0.25rem = 0.125rem。改行距只改类名一处。
 */
const GAP_REM = Number.parseFloat(DROPDOWN_ITEM_GAP_CLASS.slice('gap-'.length)) * 0.25;

/**
 * 下拉项文字档位：size 变则触发器与下拉项一起变（BaseSelector 的 SELECTOR_CONFIG 亦引用此处，
 * 两处不各记一份字号）。
 *
 * 必须是字面量类名：Tailwind 靠扫描源码取字面量生成工具类，拼字符串不会产出对应 CSS。
 */
export const ITEM_TEXT_CLASSES: Record<ControlSize, string> = {
  sm: 'text-2xs',
  md: 'text-xs',
  lg: 'text-xs',
};

/** 面板最大高度：按「显示行数 × 行高 + 行距 + 内边距」估算（rem 字符串） */
export const calcDropdownMaxHeight = (opts: {
  /** 实际结果/选项总数：决定封顶行数不会超过真实数量 */
  optionCount: number;
  /** 最多直接可见的行数（预览 N 行），缺省封顶逻辑在调用方完成 */
  displayItems: number;
  size: ControlSize;
  /** 面板自身纵向内边距合计（rem，上下相加）：必须与面板真实结构一致，见文件头 */
  paddingRem: number;
}): string => {
  const { optionCount, displayItems, size, paddingRem } = opts;
  if (optionCount === 0) return '6rem';
  const visibleCount = clamp(displayItems, 1, optionCount);
  const total = visibleCount * ITEM_HEIGHT[size] + (visibleCount - 1) * GAP_REM + paddingRem;
  return `${total}rem`;
};
