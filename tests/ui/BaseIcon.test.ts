// 注意：本文件实为 `src/platform/ui/icons/iconSizes.ts` 两个纯函数（resolveIconSize / resolveIconStroke）
// 的单元测试，不含 BaseIcon.vue 渲染断言；文件名与内容不符，暂不改名。
import { describe, expect, it, vi } from 'vitest';

import {
  ICON_SIZE_PRESETS,
  ICON_STROKE_PRESETS,
  resolveIconSize,
  resolveIconStroke,
} from '@/platform/ui/icons/iconSizes';
import { logger } from '@/platform/utils/logger';

import type { IconSizePreset, IconSizeValue, IconStrokePreset, IconStrokeValue } from '@/platform/ui/icons/iconSizes';

describe('resolveIconSize', () => {
  // 「输入形态 → 输出」同一契约的三类输入：档位名查预设表（扩档 2xl / 3xl 一并覆盖）、
  // 裸数字按 px、非档位名字符串原样透传（em / rem 等 CSS 长度）。
  const sizeCases: { label: string; input: IconSizeValue; expected: string }[] = [
    ...(Object.keys(ICON_SIZE_PRESETS) as IconSizePreset[]).map(preset => ({
      label: `档位名 ${preset} 解析为预设 px（取自单一来源）`,
      input: preset,
      expected: `${ICON_SIZE_PRESETS[preset]}px`,
    })),
    { label: '裸数字按 px 处理：22 → 22px', input: 22, expected: '22px' },
    { label: '非档位字符串 1em 原样透传', input: '1em', expected: '1em' },
    { label: '非档位字符串 1.2rem 原样透传', input: '1.2rem', expected: '1.2rem' },
  ];

  it.each(sizeCases)('$label', ({ input, expected }) => {
    expect(resolveIconSize(input)).toBe(expected);
  });

  it('档位名笔误（md 写成 ml）在 DEV 下告警，而非静默回退默认尺寸', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    // 非法档位名既非预设也不像 CSS 长度：值原样返回（浏览器会忽略），但必须留下告警
    expect(resolveIconSize('ml')).toBe('ml');
    expect(warnSpy).toHaveBeenCalledWith('resolveIconSize', expect.stringContaining('ml'));

    // 合法 CSS 长度不得误告警
    warnSpy.mockClear();
    resolveIconSize('1.5rem');
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe('resolveIconStroke', () => {
  // 与尺寸同构的「输入形态 → 输出」契约：档位名查预设表、裸数字按 px、带单位字符串原样透传
  const strokeCases: { label: string; input: IconStrokeValue; expected: string }[] = [
    ...(Object.keys(ICON_STROKE_PRESETS) as IconStrokePreset[]).map(preset => ({
      label: `档位名 ${preset} 解析为预设 px（取自单一来源）`,
      input: preset,
      expected: `${ICON_STROKE_PRESETS[preset]}px`,
    })),
    { label: '数字按 px 处理：3 → 3px', input: 3, expected: '3px' },
    { label: '带单位字符串 2.5px 原样透传', input: '2.5px', expected: '2.5px' },
  ];

  it.each(strokeCases)('$label', ({ input, expected }) => {
    expect(resolveIconStroke(input)).toBe(expected);
  });
});
