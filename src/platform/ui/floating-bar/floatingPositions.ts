import { isNumber } from '@/platform/utils/common';
import { isCssLength } from '@/platform/utils/dom';
import { logger } from '@/platform/utils/logger';

/**
 * 浮动元素水平对齐 → 距边 class。BaseFloatingPill / BaseFab 共用：
 * 两个组件曾各维护一份完全相同的映射表，统一调整对齐边距只改本表即可。
 */
export const ALIGN_CLASS_MAP: Record<'start' | 'end' | 'center', string> = {
  start: 'right-auto left-4',
  end: 'right-4 left-auto',
  center: 'right-0 left-0 mx-auto',
};

const warnedValues = new Set<string>();

/**
 * 开发期校验浮动定位值：数值视为 px，仅校验字符串形态。
 * 非合法 CSS 长度 / calc() 的字符串会让浏览器**静默忽略整条定位声明**（如 bottom 失效直接贴底），
 * 无任何报错提示、极难排查——按 `scope:value` 去重后告警。
 */
export const warnIfInvalidPositionValue = (scope: string, value: string): void => {
  if (!import.meta.env.DEV) return;
  const v = value.trim();
  // 长度形态与图标尺寸那边同源（见 isCssLength）；`auto` 与 `calc()` 是定位值独有的合法形态
  if (v === 'auto' || isCssLength(v) || /^calc\(.+\)$/i.test(v)) return;
  const key = `${scope}:${value}`;
  if (warnedValues.has(key)) return;
  warnedValues.add(key);
  logger.warn(scope, `定位值 "${value}" 不是合法 CSS 长度，浏览器会静默忽略该条定位声明`);
};

/** 定位值转 CSS 长度：数值补 px；字符串原样放行并附带格式校验 */
export const toPositionLength = (value: string | number, scope: string): string => {
  if (isNumber(value)) return `${value}px`;
  warnIfInvalidPositionValue(scope, value);
  return value;
};
