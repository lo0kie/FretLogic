/**
 * 深色主题（.dark）颜色声明。
 *
 * 值来源：接管前的 src/assets/tokens.scss .dark 块，逐值搬运、未做任何改动。
 * 段落顺序按本目录统一结构排列（背景 → 边框 → 文字 → 功能色 → 指板 → 画布 → 其他 →
 * 阴影 → 遮罩 → 滚动条 → tint），与旧文件逐行顺序不完全相同，但不影响任何输出取值。
 */
import { formatRgba, parseRgb } from '../color';
import { buildShadeDeclarations } from '../shade';
import { formatShadow } from '../shadow';
import { buildTintDeclarations } from '../tint';

import type { ThemeSource } from '../types';

/* ===== 局部常量：同一色值被多处引用时只写一次 ===== */
const BLACK = '#000000';
const WHITE = '#ffffff';
const PANEL = '#1c1c1e';
const PANEL_HOVER = '#2c2c2e';
const BORDER_BASE = '#3a3a3d';
/** 深底上的浅色描线族（琴枕、音符、横按、静音、空弦圆圈） */
const FB_LIGHT = '#f4f4f5';
const GRID_LINE = '#52525b';

export const DARK_THEME: ThemeSource = {
  name: 'dark',
  base: '#1a1a1c',
  declarations: {
    /* ===== 背景 ===== */
    '--bg-main': BLACK,
    '--bg-body': PANEL,
    '--bg-panel': PANEL,
    '--bg-panel-hover': PANEL_HOVER,
    /* 面板上一档的浅填充：= panel-hover 以 50% 合成到 panel 上 */
    '--bg-panel-subtle': { kind: 'mix', a: '--bg-panel-hover', b: '--bg-panel', weightB: 50 },
    '--bg-elevated': PANEL,
    '--bg-surface': PANEL_HOVER,

    /* ===== 边框 / 分隔 ===== */
    '--glass-border': PANEL_HOVER,
    '--border-light': '#343437',
    '--border-base': BORDER_BASE,
    '--control-border': BORDER_BASE,
    '--separator': BORDER_BASE,

    /* ===== 文字 ===== */
    '--text-title': '#f5f5f7',
    '--text-body': '#ebebf5',
    '--text-muted': '#98989d',
    /* 暗色下需满足 4.5:1 对比（axe color-contrast）：#636366 在深底上仅 2.9:1，提升至 #8e8e96（≈5.3:1） */
    '--text-disabled': '#8e8e96',

    /* ===== 功能色 ===== */
    '--color-primary': '#0a84ff',
    '--color-primary-rgb': { kind: 'rgbChannels', source: '--color-primary' },
    '--color-success': '#30d158',
    '--color-success-rgb': { kind: 'rgbChannels', source: '--color-success' },
    '--color-warning': '#ffd60a',
    '--color-warning-rgb': { kind: 'rgbChannels', source: '--color-warning' },
    '--color-danger': '#ff453a',
    '--color-danger-rgb': { kind: 'rgbChannels', source: '--color-danger' },
    '--text-on-accent': WHITE,

    /* ===== 指板画布调色板 ===== */
    '--fb-line': GRID_LINE,
    '--fb-line-dim': '#3f3f46',
    '--fb-nut': FB_LIGHT,
    '--fb-note': WHITE,
    '--fb-hover': '#28282a',
    '--fb-label': '#e2e8f0',
    '--fb-dot': '#3b82f6',
    /* 横按梁的蓝色分量（口径见 light.ts；暗色档比亮色档亮一档，与接管前一致） */
    '--fb-barre-rgb': '96, 165, 250',
    '--fb-root-text': '#29323d',
    '--fb-open-bg': '#182737',
    '--fb-open-border': '#144477',
    '--fb-open-root-bg': '#2d2012',
    '--fb-open-root-border': '#6b4712',
    '--fb-open-muted-bg': '#351f20',
    '--fb-open-muted-border': '#762b28',

    /* ===== 离屏指板画布 / 导出图配色 ===== */
    '--fbc-bg': '#18181a',
    '--fbc-sub-text': '#a1a1aa',
    '--fbc-divider': '#27272a',
    '--fbc-line': GRID_LINE,
    '--fbc-nut': FB_LIGHT,
    '--fbc-note': FB_LIGHT,
    '--fbc-open': FB_LIGHT,
    '--fbc-barre': FB_LIGHT,
    '--fbc-mute': FB_LIGHT,

    /* 原先这里还有 --theme-btn-color / --theme-btn-bg / --root-glow 三个声明：
       全仓（src/、src/assets/、scripts/、tests/）零消费者，已删除——留着只会让「改主题时要不要同步它们」
       变成一个每次都要重新判断的假问题。 */

    /* ===== 阴影：黑色投影 + 一圈极淡白描边（深底上靠描边分层，纯投影读不出来） ===== */
    '--shadow-sm': formatShadow([
      { x: 0, y: 1, blur: 3, color: BLACK, alpha: 0.4 },
      { x: 0, y: 0, blur: 0, spread: 1, color: WHITE, alpha: 0.04 },
    ]),
    '--shadow-md': formatShadow([
      { x: 0, y: 4, blur: 14, color: BLACK, alpha: 0.45 },
      { x: 0, y: 0, blur: 0, spread: 1, color: WHITE, alpha: 0.05 },
    ]),
    '--shadow-lg': formatShadow([
      { x: 0, y: 12, blur: 28, color: BLACK, alpha: 0.5 },
      { x: 0, y: 0, blur: 0, spread: 1, color: WHITE, alpha: 0.06 },
    ]),
    '--shadow-xl': formatShadow([
      { x: 0, y: 20, blur: 40, color: BLACK, alpha: 0.55 },
      { x: 0, y: 0, blur: 0, spread: 1, color: WHITE, alpha: 0.06 },
    ]),
    '--shadow-panel': formatShadow([
      { x: 0, y: 10, blur: 28, color: BLACK, alpha: 0.5 },
      { x: 0, y: 0, blur: 0, spread: 1, color: WHITE, alpha: 0.05 },
    ]),
    '--shadow-floating': formatShadow([
      { x: 0, y: 24, blur: 56, color: BLACK, alpha: 0.6 },
      { x: 0, y: 8, blur: 20, color: BLACK, alpha: 0.4 },
      { x: 0, y: 0, blur: 0, spread: 1, color: WHITE, alpha: 0.06 },
    ]),
    '--shadow-xs': formatShadow([{ x: 0, y: 1, blur: 2, color: BLACK, alpha: 0.3 }]),

    /* 遮罩：与 :root 同口径，三主题取值一致（唯一保留半透明的通道，理由见 light.ts） */
    '--overlay-bg': formatRgba(parseRgb(BLACK), 0.5),

    /* 滚动条拇指：三档必须齐备，缺档会回落 :root 的亮色值（见 light.ts 说明） */
    '--v-scrollbar-thumb': '#55555a',
    '--v-scrollbar-thumb-hover': '#a3a3ab',

    /* ===== SOLID TINTS：源色取本主题自己的语义色（口径见 ../tint.ts） ===== */
    ...buildTintDeclarations(),

    /* ===== SOLID SHADES：源色取本主题自己的语义色（口径见 ../shade.ts） ===== */
    ...buildShadeDeclarations(),
  },
};
