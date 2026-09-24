/**
 * 颜色令牌源（仓库根 tokens/）的单测。
 *
 * 只锁**口径与不变式**，不锁具体色值：色值属可调配置，写死在断言里每次调色都变成纯噪音
 * （AGENTS 第七节 2）。故下面的期望值全部由输入或声明表自身推导，例如
 * 「整数分子 ÷ 100 落在 x.5 时向偶数取整」「变量名里的 NN 必须等于派生参数」。
 *
 * 末三组是**结构守卫**（同样不锁具体色值，锁的是「改一处忘另一处」的静默失效）：
 * tailwind.css 的 @theme 转发完整性、三主题键集的继承边界、文字色对比度门禁。
 */
import { readFileSync } from 'node:fs';

import { wcagContrast, wcagLuminance } from 'culori';
import { describe, expect, it } from 'vitest';

import { mixRgb, parseRgb } from '../../tokens/color';
import { generateColorTokensCss, resolveColorToken } from '../../tokens/index';
import { formatShadow } from '../../tokens/shadow';
import { THEME_SELECTORS, THEMES } from '../../tokens/themes';

import type { DeclValue, ThemeName } from '../../tokens/types';

const THEME_NAMES = Object.keys(THEMES) as ThemeName[];
const INJECTED_CSS = generateColorTokensCss();
/** 全三主题颜色令牌的并集（用于跨文件的结构校验） */
const ALL_COLOR_TOKENS = new Set(THEME_NAMES.flatMap(name => Object.keys(THEMES[name].declarations)));
const TAILWIND_CSS = readFileSync(new URL('../../src/assets/tailwind.css', import.meta.url), 'utf8');

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

/** 名字里带档位的派生声明：--tint-primary-30 / --shade-danger-12 / --lift-warning-10 */
const SCALE_NAME = /^--(tint|shade|lift)-([a-z]+)-(\d+)$/;

interface ScaleView {
  readonly kind: 'tint' | 'shade' | 'lift';
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
  if (value.kind === 'lift' && matched[1] === 'lift') {
    return { kind: 'lift', source: value.source, family, scale, weight: value.weight };
  }
  return null;
};

describe('派生族的口径', () => {
  it('名字里的族与档位必须与派生参数一致，且不许用手写字面量顶替派生', () => {
    for (const name of THEME_NAMES) {
      const declarations = THEMES[name].declarations;
      const keys = Object.keys(declarations).filter(key => SCALE_NAME.test(key));
      expect(keys.length, `${name} 主题没有抽出任何 tint / shade / lift 档`).toBeGreaterThan(0);
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

  it('lift 一律比源色亮、shade 一律比源色深：方向反了就是整族倒挂，而其它断言照样通过', () => {
    // 这两族都以**绝对色**为锚点（lift 配纯白、shade 配纯黑），存在的全部意义就是
    // 「悬停一律更亮、按下一律更深，且不随主题底色漂移」。若把锚点改反（例如让 lift 配纯黑），
    // 三个主题的交互态会同时反向退化，而上面「名字与档位一致」「跨主题同口径」两条断言**全都照样通过** ——
    // 方向是它们唯一锁不住的那个维度，故单独钉一条。明度由 culori 现算，不写死任何色值。
    const luminance = (name: ThemeName, key: string): number => Number(wcagLuminance(resolveColorToken(name, key)));

    const failures: string[] = [];
    for (const name of THEME_NAMES) {
      for (const [key, value] of Object.entries(THEMES[name].declarations)) {
        const derived = readScale(key, value);
        if (!derived) continue;
        const source = luminance(name, derived.source);
        const result = luminance(name, key);
        if (derived.kind === 'lift' && result <= source)
          failures.push(`${name}: ${key} 未比源色 ${derived.source} 更亮`);
        if (derived.kind === 'shade' && result >= source)
          failures.push(`${name}: ${key} 未比源色 ${derived.source} 更深`);
      }
    }
    expect(failures, '这些提亮 / 压深档的方向与族语义相反').toEqual([]);
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

/* ============================================================
 * 结构守卫（改一处忘另一处会**静默**失效的三处，故各钉一条）
 * ============================================================ */

/** 从 tailwind.css 的 @theme 块里抽出「主题键 → 被转发的令牌」 */
const readThemeForwards = (): Map<string, string> => {
  const start = TAILWIND_CSS.indexOf('@theme {');
  const block = start === -1 ? '' : TAILWIND_CSS.slice(start, TAILWIND_CSS.indexOf('\n}', start));
  const forwards = new Map<string, string>();
  for (const match of block.matchAll(/^\s+(--[\w-]+):\s*var\((--[\w-]+)\);/gm))
    forwards.set(match[1] ?? '', match[2] ?? '');
  return forwards;
};

const THEME_FORWARDS = readThemeForwards();

/** 颜色令牌被转发成的那批主题键（spacing / z-index 等非颜色键指向 tokens.scss，不在本文件范围） */
const forwardedColorTargets = (): Set<string> =>
  new Set([...THEME_FORWARDS].filter(([key]) => key.startsWith('--color-')).map(([, target]) => target));

describe('tailwind.css 的 @theme 转发（颜色令牌 → 工具类）', () => {
  it('每条颜色转发的目标都是真实存在的颜色令牌：指向落空时工具类静默失效', () => {
    // var() 落空不报错也不告警，只是让工具类算出一个空值（元素回落继承色）——纯静默失效，故常驻守卫。
    // 反向（新增令牌忘了转发）见下一条：tailwind.css 的注释记着「曾因此漏掉 5 处」。
    expect(THEME_FORWARDS.size, '未解析到任何 @theme 转发——解析口径可能已失效').toBeGreaterThan(0);
    const dangling = [...THEME_FORWARDS]
      .filter(([key, target]) => key.startsWith('--color-') && !ALL_COLOR_TOKENS.has(target))
      .map(([key, target]) => `${key} → ${target}`);
    expect(dangling, '这些 @theme 转发指向了不存在的颜色令牌').toEqual([]);
  });

  it('@theme 里不许出现带兜底值的转发：兜底会把「令牌不存在」偷偷变成「用了另一个颜色」', () => {
    // readThemeForwards 只认 `var(--x);` 整串，于是 `var(--x, #fff)` 这类转发行会被**静默跳过**：
    // 守卫少看一条，正是它要防的那类静默失效。两条路——放宽正则（等于承认兜底写法合法），
    // 或把写法钉死。选后者：兜底值会让「令牌拼错」退化成「悄悄用了另一个颜色」，
    // 而隔壁那条「指向落空即静默失效」的守卫正是为拦它而存在的，留个兜底后门等于把它拆掉。
    // 实测当前 tailwind.css 零条命中，故这是一条纯预防性断言（防的是将来顺手补兜底）。
    const start = TAILWIND_CSS.indexOf('@theme {');
    const block = start === -1 ? '' : TAILWIND_CSS.slice(start, TAILWIND_CSS.indexOf('\n}', start));
    const withFallback = [...block.matchAll(/^\s+(--[\w-]+):\s*var\([^)]*,/gm)].map(match => match[1] ?? '');
    expect(withFallback, '这些 @theme 转发带了兜底值——要么补上令牌本体再转发，要么别兜底').toEqual([]);
  });

  it('tint / shade / lift 族整族齐备：三族是业务侧取实色的唯一入口，漏一档即该档取不到', () => {
    // 按族名整族对账（--tint-x-30 ⇔ --color-tint-x-30）。新增一档 tint 却忘了转发，
    // 症状与注释里记的那 5 处完全一样：不报错、不生效、静默回落继承色。
    // lift 族与 shade 同源（绝对色锚点），三个族都必须整族转发。
    const targets = forwardedColorTargets();
    const missing = [...ALL_COLOR_TOKENS].filter(name => /^--(?:tint|shade|lift)-/.test(name) && !targets.has(name));
    expect(missing, '这些 tint / shade / lift 档没有转发成工具类').toEqual([]);
  });
});

/** 只在 :root 声明、dark 与 HC 都刻意继承同一档的令牌（理由见 light.ts 对应注释） */
const ROOT_ONLY_TOKENS = new Set(['--switch-thumb-bg', '--switch-thumb-shadow', '--export-paper', '--export-checker']);

/** 在 .dark 覆盖、而 HC 刻意不覆盖以回落**明色档**的令牌（理由见 light.ts 的 --fb-barre-rgb 注释） */
const HC_INHERITS_LIGHT_TOKENS = new Set(['--fb-barre-rgb']);

describe('三主题键集的继承边界', () => {
  it(':root 是继承基底：每个颜色令牌都必须在 light 里声明', () => {
    // dark / HC 缺档时唯一的取值来源就是 :root，故基底不许有洞
    const missing = [...ALL_COLOR_TOKENS].filter(name => !(name in THEMES.light.declarations));
    expect(missing, '这些令牌只在 dark / HC 里声明——另两个主题无从继承').toEqual([]);
  });

  it('dark 与 HC 的覆盖范围有明确白名单：新增令牌漏主题即失败，而不是静默继承', () => {
    // 继承是刻意设计（light.ts 注释里的「不随主题变化的两组」），但它此前只靠注释维系：
    // 往 dark 加一条却忘了 HC，HC 下就会静默取到深色主题的值——这类偏差肉眼极难发现。
    const darkMissing = [...ALL_COLOR_TOKENS].filter(
      name => !ROOT_ONLY_TOKENS.has(name) && !(name in THEMES.dark.declarations)
    );
    expect(darkMissing, '这些令牌在 light 有、dark 缺，且不在「只在 :root 声明」白名单里').toEqual([]);

    // HC 不挂 .dark class（见 useTheme 的 apply），故它缺档时回落的是 :root 明色档 —— 这正是
    // --fb-barre-rgb 想要的效果；其余令牌若漏档就是失误，必须显式登记进白名单。
    const hcMissing = [...ALL_COLOR_TOKENS].filter(
      name =>
        !ROOT_ONLY_TOKENS.has(name) &&
        !HC_INHERITS_LIGHT_TOKENS.has(name) &&
        !(name in THEMES['high-contrast'].declarations)
    );
    expect(hcMissing, '这些令牌在 light 有、HC 缺，且不在白名单里').toEqual([]);
  });
});

/** 正文层级：title > body > muted。--text-disabled 刻意不在列——WCAG 1.4.3 对失效控件豁免 */
const READABLE_TEXT_TOKENS = ['--text-title', '--text-body', '--text-muted'];

/** 文字可能落到的实色底（全部是实色，故可直接算对比度） */
const TEXT_BACKDROP_TOKENS = [
  '--bg-main',
  '--bg-body',
  '--bg-panel',
  '--bg-panel-hover',
  '--bg-panel-subtle',
  '--bg-elevated',
  '--bg-surface',
];

/** 语义强调色：--text-on-accent 只服务这五种底（info 为 2026-09-24 对标成熟 UI 库补齐的第五色） */
const ACCENT_TOKENS = ['--color-primary', '--color-success', '--color-warning', '--color-danger', '--color-info'];

/**
 * 为承载白字而压深的实心档：--text-on-solid 只服务这三条底（缺一即授权无门禁）。
 * 命名约定是 `--color-<族>-solid`，源色即同名去掉 `-solid` —— 下一条断言靠这个约定反查源色。
 * warning / info 刻意不在列：亮黄压深到白字够用会变成深橄榄色、毁掉警示语义（见 light.ts 该条注释）。
 */
const SOLID_STOP_TOKENS = ['--color-primary-solid', '--color-success-solid', '--color-danger-solid'];

/** 指板圆点上的字色与其底：圆点底是颜色令牌；根音圆点的底是 tokens.scss 的 --fb-root = --color-warning */
const FRETBOARD_LABEL_PAIRS = [
  ['--fb-dot-text', '--fb-dot'],
  ['--fb-root-text', '--color-warning'],
] as const;

/**
 * 逐对算 WCAG 比值，返回全部未达 4.5 的组合（一次报全，而不是撞上第一个就停）。
 * 比值由 culori 算、不手抄字面量：色值属可调配置，钉死数字每次调色都变成噪音（AGENTS 第七节 2）。
 */
const belowAA = (pairs: readonly (readonly [string, string])[]): string[] => {
  const failures: string[] = [];
  for (const [foreground, backdrop] of pairs)
    for (const theme of THEME_NAMES) {
      const ratio = wcagContrast(resolveColorToken(theme, foreground), resolveColorToken(theme, backdrop));
      if (ratio < 4.5) failures.push(`${theme}: ${foreground} 落在 ${backdrop} 上仅 ${ratio.toFixed(2)}:1`);
    }
  return failures;
};

describe('文字对比度门禁（WCAG AA 4.5:1）', () => {
  it('三档正文色 × 七种落底全部 ≥ 4.5:1', () => {
    // 这条口径此前只写在 light.ts / dark.ts 的注释里（「按 WCAG AA 4.5 反推」），而注释挑的「最坏底」
    // 是 --bg-main —— 实际最坏的是更深的 --bg-panel-hover：light 的 --text-muted 因此差 0.04 没到线。
    // 注释无人执行，故改成可执行断言：最坏组合逐一算过，调色越线即失败。
    const pairs = READABLE_TEXT_TOKENS.flatMap(text => TEXT_BACKDROP_TOKENS.map(bg => [text, bg] as const));
    expect(belowAA(pairs)).toEqual([]);
  });

  it('强调色上的文字：五种底全过，故 --text-on-accent 三主题一律取深墨', () => {
    // 此前三主题里有两主题用白字：白字落 success 只有 2.2:1、落 warning 只有 1.4:1，连大字下限 3:1
    // 都保不住；黑字在全部「强调色 × 主题」组合上都更优，高对比主题原本就是黑字。此断言防它回退成白字。
    // 底由四色扩为五色（2026-09-24 补 --color-info）后，新色一并纳入本门禁 —— 加色不加守卫等于没加。
    expect(belowAA(ACCENT_TOKENS.map(accent => ['--text-on-accent', accent] as const))).toEqual([]);
  });

  it('实心档上的浅色字：与浅底上的深墨是相反方向的两支，不许塌成同一支', () => {
    // 令牌集里「强调色上的字」有两支：--text-on-accent 服务强调色的**浅底**（tint 族），
    // --text-on-solid 服务强调色的**实心档**。此前只有前者，于是实心底只能配深墨，而这正是
    // 「深墨压饱和色」的眩光来源；补上后者，实心档（按钮 / 勾选框 / 徽章 filled）才有墨可配。
    //
    // 判据取「在强调色实心底上，深墨的比值必然高于浅墨」—— 这是两支各自取档方向的直接后果，
    // 也是它们不许互换、不许取同值的守门条件。比值由 culori 现算，不写死任何色值。
    // 实测（亮色主题）白字落四色：primary 4.02 / danger 3.55 / success 2.22 / warning 2.20 ——
    // 浅墨**在常规强调色上**过不了 AA，故它不配常规强调色（只配 --color-<族>-solid，由下一条把关），
    // 常规强调色上的墨一律取本条的深墨。本断言只锁方向，门槛交给下一条。
    const failures: string[] = [];
    for (const theme of THEME_NAMES)
      for (const accent of ACCENT_TOKENS) {
        const dark = wcagContrast(resolveColorToken(theme, '--text-on-accent'), resolveColorToken(theme, accent));
        const light = wcagContrast(resolveColorToken(theme, '--text-on-solid'), resolveColorToken(theme, accent));
        if (dark <= light)
          failures.push(`${theme}: ${accent} 上深墨 ${dark.toFixed(2)} 未高于浅墨 ${light.toFixed(2)}`);
      }
    expect(failures).toEqual([]);
  });

  it('实心档上的浅色字：三族 × 三主题全部 ≥ 4.5:1，且实心档必须比源色更深', () => {
    // 这一条落地的是 2026-09-24 之前只写在注释里的授权 —— --text-on-solid 只许配 `--color-<族>-solid`。
    // 当时没有任何门禁执行它，而勾选框的 color 默认档就是 primary、checkedClass 恒带 text-fg-on-solid：
    // 于是 HC 下那个勾选图形长期停在 2.62:1（低于非文本下限 3:1），无人报错、也无人察觉。
    // 现在实心档由 solid 算子按「白字恰好过 AA」的门槛反推，本条负责证明它真的过、并防它被改浅。
    expect(belowAA(SOLID_STOP_TOKENS.map(stop => ['--text-on-solid', stop] as const))).toEqual([]);

    // 方向是比值断言锁不住的那一半：源色本身够深时，即使实心档没压深也照样能过 4.5:1，
    // 而「实心档」这个身份要求它**必须**比源色深（否则它只是个改了名的强调色）。
    const shallower: string[] = [];
    for (const stop of SOLID_STOP_TOKENS) {
      const accent = stop.replace(/-solid$/, '');
      for (const theme of THEME_NAMES) {
        const stopLuminance = Number(wcagLuminance(resolveColorToken(theme, stop)));
        const accentLuminance = Number(wcagLuminance(resolveColorToken(theme, accent)));
        if (stopLuminance >= accentLuminance) shallower.push(`${theme}: ${stop} 未比源色 ${accent} 更深`);
      }
    }
    expect(shallower, '实心档没有压深——它存在的理由就是压深到白字可读').toEqual([]);
  });

  it('指板圆点上的文字：底的明度决定取白还是取黑，两种底不许再共用同一个令牌', () => {
    // --fb-dot 在亮色主题是较暗的饱和蓝（白字更清楚），在暗色与 HC 是中性蓝（黑字更清楚）；
    // 根音圆点的底是 --color-warning（暖橙，取深墨）。三种底的取档方向不同，此前 --text-on-accent
    // 一个令牌同时服务它们，只能顾一头。tokens.scss 的 --fb-root 引用能否解析由 designTokens 另守。
    expect(belowAA(FRETBOARD_LABEL_PAIRS)).toEqual([]);
  });
});
