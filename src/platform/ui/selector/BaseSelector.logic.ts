/**
 * BaseSelector 纯逻辑模块：选项字段访问、值比较、尺寸配置与下拉高度计算。
 * 与响应式解耦，键名/比较器等依赖通过工厂参数注入，组件内仅保留状态与事件。
 */
import { CONTROL_HEIGHT_CLASSES, CONTROL_HEIGHT_PRESETS } from '@/platform/ui/controlSizes';
import { clamp } from '@/platform/utils/common';

import type { ControlSize } from '@/platform/ui/controlSizes';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { Component } from 'vue';

/** 选项字段名映射（label/value/disabled/icon） */
export interface SelectorFieldNames {
  label?: string;
  value?: string;
  disabled?: string;
  icon?: string;
}

export interface BaseSelectorOption<V = unknown> {
  label: string;
  value: V;
  disabled?: boolean;
  icon?: IconName | Component;
  [key: string]: unknown;
}

/** 从选项类型中提取对应的绑值类型 */
export type OptionValue<Opt> = Opt extends { value: infer V } ? V : Opt;

/** 尺寸档位样式表：触发器与下拉选项共用一套高度基线 */
export const SELECTOR_CONFIG: Record<'sm' | 'md' | 'lg', { triggerClass: string; itemClass: string }> = {
  sm: { triggerClass: `${CONTROL_HEIGHT_CLASSES.sm} px-2 text-2xs`, itemClass: `${CONTROL_HEIGHT_CLASSES.sm}` },
  md: { triggerClass: `${CONTROL_HEIGHT_CLASSES.md} px-2.5 text-xs`, itemClass: `${CONTROL_HEIGHT_CLASSES.md}` },
  lg: { triggerClass: `${CONTROL_HEIGHT_CLASSES.lg} px-3.5 text-xs`, itemClass: `${CONTROL_HEIGHT_CLASSES.lg}` },
};

/** 下拉面板行高（rem）：数值直接由尺寸标尺换算，避免与 CONTROL_HEIGHT_PRESETS 各记一份高度 */
export const ITEM_HEIGHT: Record<ControlSize, number> = {
  sm: Number.parseFloat(CONTROL_HEIGHT_PRESETS.sm),
  md: Number.parseFloat(CONTROL_HEIGHT_PRESETS.md),
  lg: Number.parseFloat(CONTROL_HEIGHT_PRESETS.lg),
};
/** 面板行间距与纵向内边距（rem）：与行高一起构成下拉面板总高 */
export const GAP_REM = 0.125;
export const PADDING_REM = 0.375 * 2;

/** 下拉面板最大高度：按可见选项数与尺寸档位估算（rem 字符串） */
export const calcDropdownMaxHeight = (opts: {
  optionCount: number;
  displayItems: number;
  size: 'sm' | 'md' | 'lg';
}): string => {
  const { optionCount, displayItems, size } = opts;
  if (optionCount === 0) return '6rem';
  const visibleCount = clamp(displayItems, 1, optionCount);
  const total = visibleCount * ITEM_HEIGHT[size] + (visibleCount - 1) * GAP_REM + PADDING_REM;
  return `${total}rem`;
};

interface OptionHelperOptions<V> {
  labelKey: string;
  valueKey: string;
  disabledKey: string;
  iconKey: string;
  /** 选项展示文本自定义（仅原始值选项）；never 参数实现逆变安全，兼容任意具体选项类型 */
  formatOption?: (option: never) => string;
  /** 值相等比较器 */
  valueComparator?: (a: V, b: V) => boolean;
}

/** 选项访问器工厂：注入字段名与比较器，返回一组纯函数 */
export const createOptionHelpers = <V>(opts: OptionHelperOptions<V>) => {
  const { labelKey, valueKey, disabledKey, iconKey, formatOption, valueComparator } = opts;

  /** 读取选项展示文本：对象选项走 labelKey，原始值直接字符串化 */
  const getOptionLabel = (option: unknown): string => {
    if (option !== null && typeof option === 'object' && labelKey in option)
      return String((option as Record<string, unknown>)[labelKey]);

    return String(option);
  };

  /** 读取选项绑值：对象选项走 valueKey，原始值即其自身 */
  const getOptionValue = (option: unknown): V => {
    if (option !== null && typeof option === 'object' && valueKey in option)
      return (option as Record<string, unknown>)[valueKey] as V;

    return option as V;
  };

  /** 读取选项禁用态（原始值恒为可选项） */
  const isOptionDisabled = (option: unknown): boolean =>
    option !== null && typeof option === 'object' && Boolean((option as Record<string, unknown>)[disabledKey]);

  /** 读取选项图标：仅对象选项且对应字段存在时返回 */
  const getOptionIcon = (option: unknown): IconName | Component | undefined => {
    if (option !== null && typeof option === 'object' && iconKey in option)
      return (option as Record<string, unknown>)[iconKey] as IconName | Component | undefined;

    return undefined;
  };

  /** 对象类型 value 高性能稳健比较：优先使用主键/比较器，避免每次全量 JSON.stringify */
  const equalsValue = (a: V, b: V): boolean => {
    if (valueComparator) return valueComparator(a, b);
    if (Object.is(a, b)) return true;
    if (a == null || b == null) return false;

    if (typeof a === 'object' && typeof b === 'object') {
      const aRecord = a as Record<string, unknown>;
      const bRecord = b as Record<string, unknown>;
      if (valueKey in aRecord && valueKey in bRecord) return Object.is(aRecord[valueKey], bRecord[valueKey]);

      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch {
        return false;
      }
    }
    return String(a) === String(b);
  };

  /** 选项展示文本：原始值选项支持 formatOption 自定义，其余走 label 字段 */
  const formattedOption = (option: unknown): string => {
    if (formatOption && (typeof option === 'string' || typeof option === 'number'))
      return (formatOption as (o: string | number) => string)(option);

    return getOptionLabel(option);
  };

  /** 选项行 tooltip：显式 title 字段优先，未指定时用展示文本（与行内一致，含 formatter） */
  const getOptionTitle = (option: unknown): string | undefined => {
    if (option !== null && typeof option === 'object' && 'title' in option) {
      const t = (option as Record<string, unknown>)['title'];
      if (typeof t === 'string' && t) return t;
    }
    return formattedOption(option) || undefined;
  };

  return {
    getOptionLabel,
    getOptionValue,
    isOptionDisabled,
    getOptionIcon,
    equalsValue,
    formattedOption,
    getOptionTitle,
  };
};
