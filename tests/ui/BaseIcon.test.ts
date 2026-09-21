import { describe, expect, it, vi } from 'vitest';

import {
  ICON_SIZE_PRESETS,
  ICON_STROKE_PRESETS,
  resolveIconSize,
  resolveIconStroke,
} from '@/platform/ui/icons/iconSizes';
import { logger } from '@/platform/utils/logger';

import type { IconSizePreset, IconStrokePreset } from '@/platform/ui/icons/iconSizes';

describe('resolveIconSize', () => {
  it('档位名解析为 px（取自预设表单一来源，扩档 2xl / 3xl 一并覆盖）', () => {
    for (const preset of Object.keys(ICON_SIZE_PRESETS) as IconSizePreset[])
      expect(resolveIconSize(preset)).toBe(`${ICON_SIZE_PRESETS[preset]}px`);

    // 扩档确实到「插图级」：3xl 明显大于常规 md（防止扩档被误填成同值）
    expect(ICON_SIZE_PRESETS['3xl']).toBeGreaterThan(ICON_SIZE_PRESETS.md);
  });

  it('裸数字按 px 处理', () => {
    expect(resolveIconSize(22)).toBe('22px');
  });

  it('非档位字符串原样透传（em / rem 等 CSS 长度）', () => {
    expect(resolveIconSize('1em')).toBe('1em');
    expect(resolveIconSize('1.2rem')).toBe('1.2rem');
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
  it('档位名解析为 px（取自预设表单一来源）', () => {
    for (const preset of Object.keys(ICON_STROKE_PRESETS) as IconStrokePreset[])
      expect(resolveIconStroke(preset)).toBe(`${ICON_STROKE_PRESETS[preset]}px`);
  });

  it('数字按 px 处理，带单位字符串原样透传', () => {
    expect(resolveIconStroke(3)).toBe('3px');
    expect(resolveIconStroke('2.5px')).toBe('2.5px');
  });
});
