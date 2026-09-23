/**
 * 颜色令牌源（仓库根 tokens/）的单测。
 *
 * 只锁**口径与不变式**，不锁具体色值：色值属可调配置，写死在断言里每次调色都变成纯噪音
 * （AGENTS 第七节 2）。故下面的期望值全部由输入或声明表自身推导，例如
 * 「整数分子 ÷ 100 落在 x.5 时向偶数取整」「变量名里的 NN 必须等于派生参数」。
 */
import { describe, expect, it } from 'vitest';

import { mixRgb, parseRgb } from '../../tokens/color';
import { generateColorTokensCss, resolveColorToken } from '../../tokens/index';
import { formatShadow } from '../../tokens/shadow';
import { THEME_SELECTORS, THEMES } from '../../tokens/themes';

import type { DeclValue, ThemeName } from '../../tokens/types';

const THEME_NAMES = Object.keys(THEMES) as ThemeName[];
const INJECTED_CSS = generateColorTokensCss();

/** 取单通道的混合结果，便于直接对照整数口径 */
const mixChannel = (a: number, b: number, weightB: number): number => mixRgb([a, a, a], [b, b, b], weightB)[0];

/** 主题块正文 → 声明名列表（正文每行形如 `  --bg-main: #f2f2f7;`） */
const declaredNames = (body: string): string[] => {
  const names: string[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) names.push(trimmed.slice(0, trimmed.indexOf(':')));
  }
  return names;
};

describe('颜色混合口径', () => {
  // 这一族锁的是「五成双」而非四舍五入：整数分子 ÷ 100 落在 x.5 时向偶数取整。
  // 之所以不能用 Math.round、更不能用 culori 的浮点插值：HC 的 --tint-borderbase-85 蓝通道真值 41.5，
  // 浮点算出 41.49999999999999，四舍五入得 41——差 1 且无从察觉。故逐条钉住边界两侧。
  it('整数分子 ÷ 100：x.5 向偶数取整，其余常规取整', () => {
    expect(mixChannel(0, 5, 50)).toBe(2); // 250/100 = 2.5 → 2（Math.round 得 3）
    expect(mixChannel(0, 7, 50)).toBe(4); // 350/100 = 3.5 → 4（两侧同结果，作对照）
    expect(mixChannel(0, 9, 50)).toBe(4); // 450/100 = 4.5 → 4（Math.round 得 5）
    expect(mixChannel(0, 255, 33)).toBe(84); // 8415/100 = 84.15 → 84
    expect(mixChannel(255, 0, 33)).toBe(171); // 17085/100 = 170.85 → 171
  });

  it('第三参是后者的占比：两端分别退化为纯 a / 纯 b', () => {
    expect(mixRgb([1, 2, 3], [200, 201, 202], 0)).toEqual([1, 2, 3]);
    expect(mixRgb([1, 2, 3], [200, 201, 202], 100)).toEqual([200, 201, 202]);
    // tint 族的 baseWeight 是「底色占比」，故该值越大越靠近 b，方向反了就整族反色
    expect(mixChannel(0, 255, 85)).toBeGreaterThan(mixChannel(0, 255, 15));
  });

  it('无法解析的颜色串立即抛错：构建期早失败，而不是静默产出坏色值', () => {
    expect(() => parseRgb('not-a-color')).toThrow(/无法解析颜色/);
    expect(() => parseRgb('#zzzzzz')).toThrow();
  });
});

describe('阴影格式化', () => {
  it('几何长度：0 不带单位、非 0 带 px；spread 省略即整段不输出', () => {
    const noSpread = [{ x: 0, y: 1, blur: 3, color: '#000000', alpha: 0.1 }];
    const withSpread = [{ x: 0, y: 0, blur: 0, spread: 1, color: '#000000', alpha: 0.1 }];
    expect(formatShadow(noSpread)).toBe('0 1px 3px rgba(0, 0, 0, 0.1)');
    expect(formatShadow(withSpread)).toBe('0 0 0 1px rgba(0, 0, 0, 0.1)');
  });

  it('多层用逗号连接，颜色统一走 rgba 且 alpha 原样输出（不做定长补零）', () => {
    const layers = [
      { x: 0, y: 1, blur: 3, color: '#000000', alpha: 0.04 },
      { x: 0, y: 4, blur: 12, color: '#007aff', alpha: 0.5 },
    ];
    expect(formatShadow(layers)).toBe('0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 122, 255, 0.5)');
  });
});

describe('令牌生成（generateColorTokensCss）', () => {
  it('每个主题各一个块，块内声明名与键序和该主题的声明表逐条一致', () => {
    for (const name of THEME_NAMES) {
      const start = INJECTED_CSS.indexOf(`\n${THEME_SELECTORS[name]} {`);
      expect(start, `${name} 主题块缺失`).toBeGreaterThan(-1);
      const end = INJECTED_CSS.indexOf('\n}', start);
      expect(end, `${name} 主题块未闭合`).toBeGreaterThan(start);
      const names = declaredNames(INJECTED_CSS.slice(start, end));
      expect(names, `${name} 主题块内的声明名/键序应与声明表一致`).toEqual(Object.keys(THEMES[name].declarations));
    }
  });

  it('不包 @layer：未分层样式才压得过 Tailwind @theme 的同名转发', () => {
    // tailwind.css 里有 `--color-primary: var(--color-primary)` 这类转发；本块一旦进了 @layer，
    // 转发就会胜出并退化成自引用，整族颜色工具类当场失效。这条是级联顺序的硬约束，故显式钉住。
    expect(INJECTED_CSS).not.toContain('@layer');
  });

  it('全量求值不留 undefined / NaN：新增派生算子漏写分支即在此拦下', () => {
    expect(INJECTED_CSS).not.toMatch(/\b(?:undefined|NaN)\b/);
  });

  it('--*-rgb 分量保持「R, G, B」格式：rgba(var(--x-rgb), α) 依赖它，格式变了整条声明会被丢弃', () => {
    const channelDeclarations = [...INJECTED_CSS.matchAll(/^\s+--[\w-]*-rgb: ([^;]+);$/gm)];
    expect(channelDeclarations.length).toBeGreaterThan(0);
    for (const match of channelDeclarations) expect(match[1] ?? '').toMatch(/^\d{1,3}, \d{1,3}, \d{1,3}$/);
  });
});

/** 名字里带档位的派生声明：--tint-primary-30 / --shade-danger-12 */
const SCALE_NAME = /^--(tint|shade)-([a-z]+)-(\d+)$/;

interface ScaleView {
  readonly kind: 'tint' | 'shade';
  readonly source: string;
  readonly family: string;
  readonly scale: number;
  readonly weight: number;
}

/**
 * 抽出「名字里带档位的派生声明」。
 * 名字带档位却是手写字面量、或族前缀与算子类型不符（--tint-* 配 shade 算子）时返回 null，由调用方断言失败。
 */
const readScale = (key: string, value: DeclValue | undefined): ScaleView | null => {
  const matched = SCALE_NAME.exec(key);
  if (!matched || value === undefined || typeof value === 'string') return null;
  const family = matched[2] ?? '';
  const scale = Number(matched[3]);
  if (value.kind === 'tint' && matched[1] === 'tint') {
    return { kind: 'tint', source: value.source, family, scale, weight: value.baseWeight };
  }
  if (value.kind === 'shade' && matched[1] === 'shade') {
    return { kind: 'shade', source: value.source, family, scale, weight: value.weight };
  }
  return null;
};

describe('派生族的口径', () => {
  it('名字里的族与档位必须与派生参数一致，且不许用手写字面量顶替派生', () => {
    for (const name of THEME_NAMES) {
      const declarations = THEMES[name].declarations;
      const keys = Object.keys(declarations).filter(key => SCALE_NAME.test(key));
      expect(keys.length, `${name} 主题没有抽出任何 tint/shade 档`).toBeGreaterThan(0);
      for (const key of keys) {
        const derived = readScale(key, declarations[key]);
        expect(derived, `${name} 的 ${key} 不是对应档位的派生声明`).not.toBeNull();
        expect(derived?.weight, `${key} 的档位与名字里的 NN 不一致`).toBe(derived?.scale);
      }
    }
  });

  it('同一族同一档在三个主题下共用同一档位表与同一源色令牌，口径不随主题漂移', () => {
    const profileOf = (theme: (typeof THEMES)[ThemeName]): Record<string, string> => {
      const byFamily = new Map<string, { source: string; scales: number[] }>();
      for (const [key, value] of Object.entries(theme.declarations)) {
        const derived = readScale(key, value);
        if (!derived) continue;
        const family = `${derived.kind}:${derived.family}`;
        const group = byFamily.get(family);
        if (group) group.scales.push(derived.scale);
        else byFamily.set(family, { source: derived.source, scales: [derived.scale] });
      }
      const profile: Record<string, string> = {};
      for (const [family, group] of byFamily) {
        const scales = [...group.scales].sort((a, b) => a - b).join(',');
        profile[family] = `${group.source}@${scales}`;
      }
      return profile;
    };

    let baseline: { readonly name: string; readonly profile: Record<string, string> } | null = null;
    for (const name of THEME_NAMES) {
      const profile = profileOf(THEMES[name]);
      if (baseline === null) {
        expect(Object.keys(profile).length, `${name} 未抽出任何 tint/shade 族`).toBeGreaterThan(0);
        baseline = { name, profile };
        continue;
      }
      expect(profile, `${name} 的 tint/shade 口径与 ${baseline.name} 不一致`).toEqual(baseline.profile);
    }
  });
});

describe('按名查询（resolveColorToken）', () => {
  it('派生声明查到的是算出的实色，且与注入 CSS 里那份取值同源', () => {
    const value = resolveColorToken('light', '--tint-primary-20');
    expect(value).toMatch(/^#[0-9a-f]{6}$/);
    expect(INJECTED_CSS).toContain(`--tint-primary-20: ${value};`);
  });

  it('未声明的变量名立即抛错：拼错即失败，而不是把 undefined 漏进 PWA manifest', () => {
    expect(() => resolveColorToken('light', '--not-a-token')).toThrow(/未定义颜色变量/);
  });
});

describe('实色化边界（半透明的唯一例外）', () => {
  it('除遮罩与阴影族外，颜色值一律是实色 hex：不得出现 rgba() / color-mix()', () => {
    // 本次迁移的核心口径就是「半透明强调色一律换成实色 tint」。两处例外是被明确定义的：
    // 遮罩 --overlay-bg（它的语义就是透出下层）与阴影族（本就靠 alpha 分层、值由 formatShadow 产出）。
    // 其余任何一条又长出 alpha 或现算混合，都意味着实色化被悄悄回退——故逐条扫全三主题。
    const translucent: string[] = [];
    for (const name of THEME_NAMES) {
      for (const key of Object.keys(THEMES[name].declarations)) {
        if (key === '--overlay-bg' || /shadow|glow/.test(key)) continue;
        if (/rgba?\(|color-mix\(/i.test(resolveColorToken(name, key))) translucent.push(`${name} 的 ${key}`);
      }
    }
    expect(translucent, '这些颜色又变回半透明 / 现算混合了').toEqual([]);
  });
});
