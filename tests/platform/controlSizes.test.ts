/**
 * 控件尺寸标尺的一致性锚点。
 *
 * `controlSizes.ts` 里四份字典（PRESETS / HEIGHT_CLASSES / SQUARE_CLASSES / MIN_HEIGHT_CLASSES）
 * 必须**写成字面量**：Tailwind 靠扫描源码取字面量生成工具类，拼字符串不会产出 CSS。
 * 于是「四份同源」不能靠派生保证，只能靠这里逐档断言 —— 改标尺而漏改字典会当场红，
 * 而不是等某处的控件高度悄悄差了一档才被发现（此前没有任何测试把这件事钉住）。
 */
import { describe, expect, it } from 'vitest';

import {
  CONTROL_HEIGHT_CLASSES,
  CONTROL_HEIGHT_PRESETS,
  CONTROL_MIN_HEIGHT_CLASSES,
  CONTROL_SQUARE_CLASSES,
} from '@/platform/ui/controlSizes';

import type { ControlSize } from '@/platform/ui/controlSizes';

const SIZES: ControlSize[] = ['sm', 'md', 'lg'];

describe('控件尺寸标尺', () => {
  it('三份类名字典与 PRESETS 逐档同源', () => {
    for (const size of SIZES) {
      const value = CONTROL_HEIGHT_PRESETS[size];
      expect(value).toBeTruthy();
      expect(CONTROL_HEIGHT_CLASSES[size]).toBe(`h-[${value}]`);
      expect(CONTROL_SQUARE_CLASSES[size]).toBe(`h-[${value}] w-[${value}]`);
      expect(CONTROL_MIN_HEIGHT_CLASSES[size]).toBe(`min-h-[${value}]`);
    }
  });

  it('四份字典的键集合完全一致（加档位时不会只加到其中一份上）', () => {
    // 形参用 object 而不是 Record<string, unknown>：后者要求源类型带索引签名，
    // 而这几份字典都是「已知键的 Record」，直接传会报不可赋值
    const keys = (record: object): string[] => Object.keys(record).sort();
    expect(keys(CONTROL_HEIGHT_CLASSES)).toEqual(keys(CONTROL_HEIGHT_PRESETS));
    expect(keys(CONTROL_SQUARE_CLASSES)).toEqual(keys(CONTROL_HEIGHT_PRESETS));
    expect(keys(CONTROL_MIN_HEIGHT_CLASSES)).toEqual(keys(CONTROL_HEIGHT_PRESETS));
    expect(keys(CONTROL_HEIGHT_PRESETS)).toEqual([...SIZES].sort());
  });
});
