/**
 * 非颜色令牌层（src/assets/tokens.scss + token-vars.scss）的单测。
 *
 * 与 tests/tokens/colorTokens.test.ts 的分工：那份管**颜色**（仓库根 tokens/ 的声明表）；
 * 这份管另一半——tokens.scss 的 z-index / 动效 / 模糊度量、token-vars.scss 的 SCSS 变量层，
 * 以及「同一个 CSS 变量只在一边定义」这条跨文件不变式。
 *
 * 同样只锁口径与不变式，不锁具体数值：期望值来自注释里写明的层次关系，或由声明表自身推导。
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { FLOATING_Z_BASE, FLOATING_Z_CEILING } from '@/platform/ui/popover/floatingZ';

import { THEMES } from '../../tokens/themes';

import type { ThemeName } from '../../tokens/types';

const TOKENS_SCSS = new URL('../../src/assets/tokens.scss', import.meta.url);
const TOKEN_VARS_SCSS = new URL('../../src/assets/token-vars.scss', import.meta.url);
const BASE_ICON_VUE = new URL('../../src/platform/ui/icons/BaseIcon.vue', import.meta.url);

/** 色值字面量判据：出现即意味着该值归 tokens/（口径写在 tokens.scss 头部注释里） */
const COLOR_LITERAL = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\bcolor-mix\(/i;

/** 读 SCSS 令牌文件，剥掉块注释后取「变量名 → 值」（同名声明取最后一次） */
const readDeclarations = (url: URL): Map<string, string> => {
  const source = readFileSync(url, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations = new Map<string, string>();
  for (const rawLine of source.split('\n')) {
    const matched = /^(--[\w-]+)\s*:\s*(.+);$/.exec(rawLine.trim());
    const [, name, value] = matched ?? [];
    if (name && value) declarations.set(name, value);
  }
  return declarations;
};

const SCSS_DECLARATIONS = readDeclarations(TOKENS_SCSS);
const COLOR_DECLARATIONS = new Set(
  (Object.keys(THEMES) as ThemeName[]).flatMap(name => Object.keys(THEMES[name].declarations))
);

/** 取 tokens.scss 里某个 z-index 令牌的数值；缺失/非整数直接抛错（解析口径失效时立刻可见） */
const zOf = (name: string): number => {
  const value = SCSS_DECLARATIONS.get(name);
  if (value === undefined) throw new Error(`tokens.scss 未声明 ${name}`);
  const z = Number(value);
  if (!Number.isInteger(z)) throw new Error(`${name} 不是整数：${value}`);
  return z;
};

/** 秒 / 毫秒两种写法都接受，统一转成 ms；解析不了直接抛错（口径失效时立刻可见） */
const durationMsOf = (value: string): number => {
  const seconds = /^([\d.]+)s$/.exec(value);
  if (seconds) return Number(seconds[1]) * 1000;
  const millis = /^([\d.]+)ms$/.exec(value);
  if (millis) return Number(millis[1]);
  throw new Error(`无法解析时长令牌：${value}`);
};

/** 逐个断言后者严格高于前者 */
const expectAscending = (zNames: readonly string[]): void => {
  for (let i = 1; i < zNames.length; i++) {
    const lower = zNames[i - 1] ?? '';
    const upper = zNames[i] ?? '';
    expect(zOf(upper), `${upper} 必须高于 ${lower}`).toBeGreaterThan(zOf(lower));
  }
};

describe('tokens.scss：颜色边界（颜色一律归仓库根 tokens/）', () => {
  it('值里不得出现任何色值字面量（#hex / rgb() / hsl() / color-mix()）', () => {
    expect(SCSS_DECLARATIONS.size, '未解析到任何声明——解析口径可能已失效').toBeGreaterThan(0);
    for (const [name, value] of SCSS_DECLARATIONS) {
      expect(value, `${name} 的值里出现了色值字面量，应归 tokens/`).not.toMatch(COLOR_LITERAL);
    }
  });

  it('var() 引用都能解析到声明：本文件内或 tokens/ 的颜色表', () => {
    // var() 落空不会报错，只会让属性退化为继承值 / initial —— 拼错一个变量名是纯静默失效，故常驻守卫
    const declared = new Set([...SCSS_DECLARATIONS.keys(), ...COLOR_DECLARATIONS]);
    const references = new Set(
      [...SCSS_DECLARATIONS.values()].flatMap(value => [...value.matchAll(/var\((--[\w-]+)/g)].map(m => m[1] ?? ''))
    );
    expect(references.size, '未解析到任何 var() 引用——解析口径可能已失效').toBeGreaterThan(0);
    expect([...references].filter(name => !declared.has(name))).toEqual([]);
  });

  it('与 tokens/ 的颜色声明表不相交：同一个 CSS 变量只在一边定义', () => {
    expect(COLOR_DECLARATIONS.size, '未读到任何颜色声明——解析口径可能已失效').toBeGreaterThan(0);
    const collisions = [...SCSS_DECLARATIONS.keys()].filter(name => COLOR_DECLARATIONS.has(name));
    expect(collisions, '同名变量两处各定义一份，最终取值由层叠顺序决定——正是本目录要消除的双源').toEqual([]);
  });
});

describe('token-vars.scss：只允许 SCSS 变量，不得落地成 CSS 规则', () => {
  it('不声明任何 CSS 自定义属性，也不含色值字面量', () => {
    // 该文件经 vite additionalData 注入每个 <style scoped>：一旦出现 CSS 声明就会在每个组件里复制一份，
    // 且 :root 这类顶层规则会被 scoped 改写为永不适配的 :root[data-v-x]（死规则）。
    const source = readFileSync(TOKEN_VARS_SCSS, 'utf8');
    expect(source).not.toMatch(/^\s*--[\w-]+\s*:/m);
    expect(source).not.toMatch(COLOR_LITERAL);
  });
});

describe('z-index 令牌的层次不变式', () => {
  it('层次阶梯由低到高逐级严格递增（tokens.scss 注释的枚举顺序即层次）', () => {
    expectAscending(['--z-base', '--z-content', '--z-inner', '--z-card', '--z-panel', '--z-float']);
  });

  it('注释明写的不变式：滚动条三档 < 吸附头 < 操作条，且吸附头高于 z-float', () => {
    expectAscending(['--z-scrollbar-track', '--z-scrollbar-thumb', '--z-scrollbar-bubble', '--z-sticky', '--z-fab']);
    expect(zOf('--z-sticky'), '吸附头必须高于面板内浮起元件，否则滚动中的标题会被浮起元件盖住').toBeGreaterThan(
      zOf('--z-float')
    );
  });

  it('移动端遮罩链：顶栏 < 遮罩 < 抽屉', () => {
    expectAscending(['--z-header', '--z-scrim', '--z-sidebar-top']);
  });

  it('浮层动态池与静态高层的衔接：--z-menu 即池基准，池上限仍低于 --z-top / --z-toast', () => {
    // floatingZ.ts 的注释明写「基准对应 tokens.scss 的 --z-menu」、上限「为 --z-top / --z-toast 留出安全边界」，
    // 这两条原本只靠注释维系（改一处没人拦）；这里把它们变成可执行断言。
    expect(zOf('--z-menu'), '池基准必须等于 --z-menu，否则浮层会与右键菜单/下拉互相穿插').toBe(FLOATING_Z_BASE);
    expect(FLOATING_Z_CEILING, '池上限须高于基准，否则递增没有空间').toBeGreaterThan(FLOATING_Z_BASE);
    expect(zOf('--z-top'), '最高静态层必须高于池上限，否则拖拽幽灵/导出抽屉会被浮层压住').toBeGreaterThan(
      FLOATING_Z_CEILING
    );
    expect(zOf('--z-toast'), '全局提示必须高于一切').toBeGreaterThan(zOf('--z-top'));
  });
});

describe('动效时长的跨文件同档关系', () => {
  it('BaseIcon 的形变时长与 --duration-base 同档（同一档两处写，改一处必须改另一处）', () => {
    // BaseIcon.vue 的注释自述「与 tokens 的 --duration-base 同档」，但那只是注释约定：
    // 改任一处都不会红，而两者一旦不同档，图标形变就会与同一处控件的色 / 边过渡一前一后。
    // 这里把它变成可执行断言。判据是「同档」而不是「等于某个数」—— 数值本身不写死。
    const matched = /MORPH_DURATION_MS\s*=\s*(\d+)/.exec(readFileSync(BASE_ICON_VUE, 'utf8'));
    expect(matched, 'BaseIcon.vue 里没找到 MORPH_DURATION_MS 的字面量声明——解析口径可能已失效').not.toBeNull();

    const declared = SCSS_DECLARATIONS.get('--duration-base');
    expect(declared, 'tokens.scss 未声明 --duration-base').toBeDefined();

    expect(Number(matched?.[1]), 'MORPH_DURATION_MS 与 --duration-base 已不同档').toBe(durationMsOf(declared ?? ''));
  });
});
