/**
 * 高对比主题（[data-theme='high-contrast']）颜色声明。
 *
 * 值来源：接管前的 src/assets/tokens.scss [data-theme='high-contrast'] 块，逐值搬运。
 * 段落顺序按本目录统一结构排列，不影响输出取值。
 *
 * 本主题只覆盖语义色，不覆盖布局 / 动效 / 层级；未覆盖的变量由 :root 继承
 * （故这里没有 bubble-* 等条目）。
 */
import { formatRgba, parseRgb } from '../color';
import { buildLiftDeclarations } from '../lift';
import { buildShadeDeclarations } from '../shade';
import { formatShadow } from '../shadow';
import { buildTintDeclarations } from '../tint';

import type { ThemeSource } from '../types';

/* ===== 局部常量：同一色值被多处引用时只写一次 ===== */
const BLACK = '#000000';
const WHITE = '#ffffff';
const PANEL = '#121214';
const PANEL_HOVER = '#1e1e22';
const BORDER_BASE = '#6b6b76';
const BORDER_LIGHT = '#4a4a52';
/** 次级中性色：文字 / 网格线 / 滚动条拇指悬停共用同一档 */
const NEUTRAL = '#b9b9c4';
/** 与深色主题同值的中性档（次要网格线） */
const NEUTRAL_DIM = '#8e8e96';

export const HIGH_CONTRAST_THEME: ThemeSource = {
  name: 'high-contrast',
  base: '#1a1a1c',
  declarations: {
    /* ===== 背景 ===== */
    '--bg-main': BLACK,
    '--bg-body': '#0a0a0c',
    '--bg-panel': PANEL,
    '--bg-panel-hover': PANEL_HOVER,
    /* 面板上一档的浅填充：= panel-hover 以 50% 合成到 panel 上 */
    '--bg-panel-subtle': { kind: 'mix', a: '--bg-panel-hover', b: '--bg-panel', weightB: 50 },
    '--bg-elevated': '#1a1a1e',
    '--bg-surface': '#1a1a1e',
    /* 失效控件的底 / 描边：口径见 light.ts 同名条目（派生公式三主题一致，取值随各主题的底自动变） */
    '--bg-disabled': { kind: 'mix', a: '--bg-panel-hover', b: '--bg-body', weightB: 50 },

    /* ===== 边框 / 分隔（HC 靠边框而非阴影区分层次，故边框取纯白 / 高明度） ===== */
    '--glass-border': WHITE,
    '--border-light': BORDER_LIGHT,
    '--border-base': BORDER_BASE,
    '--control-border': BORDER_BASE,
    '--separator': BORDER_LIGHT,
    '--border-disabled': { kind: 'mix', a: '--border-light', b: '--bg-body', weightB: 50 },

    /* ===== 文字 ===== */
    '--text-title': WHITE,
    '--text-body': '#f2f2f7',
    '--text-muted': NEUTRAL,
    /* 失效文字：与 .dark 同口径（--text-muted 朝纯黑压深 35%），本主题 #b9b9c4 → #78787f
       （落面板 4.27:1）。比值仍高于 .dark 的 2.84:1 —— 本主题整体要求更高对比，这一档随
       --text-muted 自动保持相应比例，不另设绝对值。理由（含 axe 豁免）见 dark.ts 同名条目。 */
    '--text-disabled': { kind: 'shade', source: '--text-muted', weight: 35 },

    /* ===== 功能色（比 .dark 更亮一档：HC 的底色更浅、又要求更高对比） ===== */
    '--color-primary': '#3da5ff',
    '--color-primary-rgb': { kind: 'rgbChannels', source: '--color-primary' },
    '--color-success': '#3ddc84',
    '--color-success-rgb': { kind: 'rgbChannels', source: '--color-success' },
    '--color-warning': '#ffd60a',
    '--color-warning-rgb': { kind: 'rgbChannels', source: '--color-warning' },
    '--color-danger': '#ff6961',
    /* 第五个语义色：取值口径见 light.ts 同名条目（同为 iOS systemTeal；本主题的强调色一律取该族
       最亮档 —— 它自身要求更高对比，故深墨在其上为 13.17:1） */
    '--color-info': '#6fdcf0',
    /* 实心档：口径见 light.ts 同名条目（由 solid 算子按「白字过 AA」的门槛反推压深量）。
       本主题的强调色一律取该族最亮档（它自身要求更高对比），故白字在其上最差（primary 2.62:1），
       压深量也是三主题里最大的 —— 但这不是「按主题手工覆盖」，门槛与另两主题完全相同。 */
    '--color-primary-solid': { kind: 'solid', source: '--color-primary' },
    '--color-success-solid': { kind: 'solid', source: '--color-success' },
    '--color-danger-solid': { kind: 'solid', source: '--color-danger' },
    '--text-on-accent': BLACK,

    /* 实心强调色底上的浅色字：授权范围与理由见 light.ts 同名条目 —— 只配 `--color-<族>-solid`，
       配常规强调色一律走 --text-on-accent 深墨（本主题的深墨在强调色上是 13.17:1 那一档）。
       此前本条目自述「本主题不要消费本令牌」，却无任何门禁落地，而勾选框的默认档就是 primary ——
       实心底一承载文字/图形就只能吃这一条，自述与消费面因此长期不符（2026-09-24 补实心档后消解）。 */
    '--text-on-solid': WHITE,

    /* ===== 指板画布调色板（对齐 .dark：深底白字，网格线取 HC 自身更高的档） ===== */
    '--fb-line': NEUTRAL_DIM,
    '--fb-line-dim': BORDER_LIGHT,
    '--fb-nut': WHITE,
    '--fb-note': WHITE,
    '--fb-hover': '#2a2a2e',
    '--fb-label': '#e2e8f0',
    '--fb-dot': '#3b82f6',
    /* 音符圆点上的字色：本主题的圆点与 .dark 同为 #3b82f6，取黑字（见 dark.ts） */
    '--fb-dot-text': BLACK,
    '--fb-root-text': '#29323d',
    '--fb-open-bg': '#182737',
    '--fb-open-border': '#144477',
    '--fb-open-root-bg': '#2d2012',
    '--fb-open-root-border': '#6b4712',
    '--fb-open-muted-bg': '#351f20',
    '--fb-open-muted-border': '#762b28',

    /* ===== 离屏指板画布 / 导出图配色 ===== */
    '--fbc-bg': '#0a0a0c',
    '--fbc-sub-text': '#d4d4dc',
    '--fbc-divider': '#3a3a42',
    '--fbc-line': NEUTRAL_DIM,
    '--fbc-nut': WHITE,
    '--fbc-note': WHITE,
    '--fbc-open': WHITE,
    '--fbc-barre': WHITE,
    '--fbc-mute': WHITE,

    /* ===== 阴影：HC 靠边框而非阴影区分层次，阴影加深保证可见 ===== */
    '--shadow-sm': formatShadow([
      { x: 0, y: 1, blur: 3, color: BLACK, alpha: 0.8 },
      { x: 0, y: 0, blur: 0, spread: 1, color: WHITE, alpha: 0.18 },
    ]),
    '--shadow-md': formatShadow([
      { x: 0, y: 4, blur: 14, color: BLACK, alpha: 0.85 },
      { x: 0, y: 0, blur: 0, spread: 1, color: WHITE, alpha: 0.2 },
    ]),
    '--shadow-lg': formatShadow([
      { x: 0, y: 12, blur: 28, color: BLACK, alpha: 0.9 },
      { x: 0, y: 0, blur: 0, spread: 1, color: WHITE, alpha: 0.22 },
    ]),
    '--shadow-xl': formatShadow([
      { x: 0, y: 20, blur: 40, color: BLACK, alpha: 0.95 },
      { x: 0, y: 0, blur: 0, spread: 1, color: WHITE, alpha: 0.22 },
    ]),
    '--shadow-panel': formatShadow([
      { x: 0, y: 10, blur: 28, color: BLACK, alpha: 0.9 },
      { x: 0, y: 0, blur: 0, spread: 1, color: WHITE, alpha: 0.2 },
    ]),
    '--shadow-floating': formatShadow([
      { x: 0, y: 24, blur: 56, color: BLACK, alpha: 0.95 },
      { x: 0, y: 0, blur: 0, spread: 1, color: WHITE, alpha: 0.22 },
    ]),
    '--shadow-xs': formatShadow([{ x: 0, y: 1, blur: 2, color: BLACK, alpha: 0.7 }]),

    /* 遮罩：与前两主题取值一致（不改观感） */
    '--overlay-bg': formatRgba(parseRgb(BLACK), 0.5),

    /* 滚动条拇指：取本主题既有的 text-muted / border-base 档，比 .dark 亮一档，
       悬停方向与 .dark 一致（变亮）。此前 HC 缺档会回落 :root 亮色值 → 近黑底上「悬停反而变暗」。 */
    '--v-scrollbar-thumb': BORDER_BASE,
    '--v-scrollbar-thumb-hover': NEUTRAL,

    /* ===== SOLID TINTS：源色取本主题自己的语义色，同一 NN 档因此比 .dark 亮一档 =====
       注：panelhover 两档同样走合成公式。接管前它们是手工提亮值（比合成值亮约 12/255）——
       接管后如需更强的悬停跳变，正确做法是调整本主题的源色 --bg-panel-hover，
       而不是在 tint 上另存一份偏离公式的取值（那会让同族同档在不同主题下口径不一）。 */
    ...buildTintDeclarations(),

    /* ===== SOLID SHADES：源色取本主题自己的语义色（口径见 ../shade.ts） ===== */
    ...buildShadeDeclarations(),

    /* ===== LIFT：源色取本主题自己的语义色（口径见 ../lift.ts）；与 SHADES 同为绝对色锚点 ===== */
    ...buildLiftDeclarations(),
  },
};
