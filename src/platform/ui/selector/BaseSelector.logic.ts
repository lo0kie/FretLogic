/**
 * BaseSelector 纯逻辑模块：选项字段访问、值比较与尺寸配置。
 * 与响应式解耦，键名/比较器等依赖通过工厂参数注入，组件内仅保留状态与事件。
 * 下拉高度计算已迁至共享下拉模块（BaseInput 搜索结果面板同用），需用时直接从
 * `platform/ui/dropdown/dropdownPanelHeight` 导入，此处不再转发。
 */
import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';
import { ITEM_TEXT_CLASSES } from '@/platform/ui/dropdown/dropdownPanelHeight';

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

/** 触发器尺寸档位样式表：下拉项的行高与字号已由共享 BaseDropdownItem 按 size 承担，
 *  触发器字号与下拉项共用 ITEM_TEXT_CLASSES，两处不各记一份 */
export const SELECTOR_CONFIG: Record<ControlSize, { triggerClass: string }> = {
  sm: { triggerClass: `${CONTROL_HEIGHT_CLASSES.sm} px-2 ${ITEM_TEXT_CLASSES.sm}` },
  md: { triggerClass: `${CONTROL_HEIGHT_CLASSES.md} px-2.5 ${ITEM_TEXT_CLASSES.md}` },
  lg: { triggerClass: `${CONTROL_HEIGHT_CLASSES.lg} px-3.5 ${ITEM_TEXT_CLASSES.lg}` },
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
