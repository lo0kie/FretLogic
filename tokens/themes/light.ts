/**
 * 浅色主题（:root）颜色声明。
 *
 * 值来源：接管前的 src/assets/tokens.scss :root 块，逐值搬运、未做任何改动。
 * 其中 --bg-panel-subtle 与 --color-primary-rgb 改为派生（口径见各条注释），
 * tint 族由 buildTintDeclarations() 生成。
 */
import { formatRgba, parseRgb } from '../color';
import { buildShadeDeclarations } from '../shade';
import { formatShadow } from '../shadow';
import { buildTintDeclarations } from '../tint';

import type { ThemeSource } from '../types';

/* ===== 局部常量：同一色值被多处引用时只写一次，避免同一 hex 在多行重复 ===== */
const BG_MAIN = '#f2f2f7';
const BG_PANEL = '#fbfbfd';
const BG_PANEL_HOVER = '#ebebef';
const BORDER_LIGHT = '#dcdce1';
const BORDER_BASE = '#d1d1d7';
const COLOR_PRIMARY = '#007aff';
const COLOR_WARNING = '#ff9500';
const WHITE = '#ffffff';
/** 指板/画布的深色描线族（琴枕、音符、横按、静音、空弦圆圈） */
const FB_DARK = '#18181b';
const FB_LINE_GRAY = '#a1a1aa';
/** 暖白：根音文字与空弦根音底共用 */
const FB_WARM = '#fff7ed';
/** 浅色主题的全部投影都是纯黑叠加，重复出现故提取 */
const SHADOW_BLACK = '#000000';

export const LIGHT_THEME: ThemeSource = {
  name: 'light',
  base: BG_MAIN,
  declarations: {
    /* ===== 背景（实色：原为半透明玻璃面板，按页面底色合成去掉透明） ===== */
    '--bg-main': BG_MAIN,
    '--bg-body': WHITE,
    '--bg-panel': BG_PANEL,
    '--bg-panel-hover': BG_PANEL_HOVER,
    /* 面板上一档的浅填充（统计小格、勾选框选中、分段控件悬停）：= panel-hover 以 50% 合成到 panel 上 */
    '--bg-panel-subtle': { kind: 'mix', a: '--bg-panel-hover', b: '--bg-panel', weightB: 50 },
    '--bg-elevated': BG_PANEL,
    '--bg-surface': BG_PANEL,

    /* ===== 边框 / 分隔（实色：按面板底色合成去掉透明） ===== */
    '--glass-border': '#dfdfe3',
    '--border-light': BORDER_LIGHT,
    '--border-base': BORDER_BASE,
    '--control-border': BORDER_BASE,
    '--separator': BORDER_LIGHT,

    /* ===== 文字（由深到浅四档：title > body > muted > disabled） ===== */
    '--text-title': '#1c1c1e',
    '--text-body': '#3a3a3c',
    /* muted 承担次级文案（说明 / 标签 / 行号）。原值 #8e8e93（systemGray）在亮底上仅 2.92:1，
       明显淡于深色的 6.05:1 与高对比的 9.62:1，故压深：与 bg-main 4.75:1 / 面板 5.13:1 /
       纯白 5.30:1 —— 取的是「在最深的亮色底 bg-main 上仍过 WCAG AA 4.5」的最浅一档，
       既保住四档层次，也维持 systemGray 家族的色偏（b − r = 5，与 title / body 一致）。 */
    '--text-muted': '#6b6b70',
    '--text-disabled': '#c7c7cc',

    /* ===== 功能色 ===== */
    '--color-primary': COLOR_PRIMARY,
    /* primary 的 R, G, B 分量，供 rgba(var(--color-primary-rgb), α) 使用（由常色派生，不再手抄） */
    '--color-primary-rgb': { kind: 'rgbChannels', source: '--color-primary' },
    '--color-success': '#34c759',
    /* 其余三个功能色同样给出分量：供「同色带 alpha」的强调投影消费（不透明时直接取功能色令牌）。
       此前 buttonThemes / ChordAnalysisPanel 里手抄了这三个色的 rgb 分量。 */
    '--color-success-rgb': { kind: 'rgbChannels', source: '--color-success' },
    '--color-warning': COLOR_WARNING,
    '--color-warning-rgb': { kind: 'rgbChannels', source: '--color-warning' },
    '--color-danger': '#ff3b30',
    '--color-danger-rgb': { kind: 'rgbChannels', source: '--color-danger' },
    /* 强调色（按钮 / 徽章 / 标签）上的文字 */
    '--text-on-accent': WHITE,

    /* ===== 指板画布调色板（跟随主题切换的绘制色） ===== */
    '--fb-line': FB_LINE_GRAY,
    '--fb-line-dim': '#d4d4d8',
    '--fb-nut': FB_DARK,
    '--fb-note': '#0f172a',
    '--fb-hover': WHITE,
    '--fb-label': '#475569',
    '--fb-dot': '#2563eb',
    /* 横按梁的蓝色 R, G, B 分量：SVG 的 fill/stroke 无法直接取 var() 色值（要按 α 分层），
       故以 `rgba(var(--fb-barre-rgb), α)` 消费。暗色档见 .dark；高对比主题不覆盖、沿用本档
       （与接管前一致：接管前只有明/暗两档，高对比主题按「非暗」取本值）。 */
    '--fb-barre-rgb': '59, 130, 246',
    '--fb-root-text': FB_WARM,
    '--fb-open-bg': '#ebf4ff',
    '--fb-open-border': '#b3d7ff',
    '--fb-open-root-bg': FB_WARM,
    '--fb-open-root-border': '#fed7aa',
    '--fb-open-muted-bg': '#ffefee',
    '--fb-open-muted-border': '#ffc4c1',

    /* ===== 离屏指板画布 / 导出图配色 ===== */
    '--fbc-bg': BG_PANEL,
    '--fbc-sub-text': '#71717a',
    '--fbc-divider': '#e4e4e7',
    '--fbc-line': FB_LINE_GRAY,
    '--fbc-nut': FB_DARK,
    '--fbc-note': FB_DARK,
    '--fbc-open': FB_DARK,
    '--fbc-barre': FB_DARK,
    '--fbc-mute': FB_DARK,

    /* 原先这里还有 --theme-btn-color / --theme-btn-bg / --root-glow 三个声明：
       全仓（src/、src/assets/、scripts/、tests/）零消费者，已删除——留着只会让「改主题时要不要同步它们」
       变成一个每次都要重新判断的假问题。 */

    /* ===== 不随主题变化的两组：只在 :root 声明，另两个主题不覆盖、由继承取到同一档 ===== */
    /* 滑块把手：明暗主题下都成立的白把手（暗底上也要它「浮」在轨道上方），故不按主题分档。
       阴影同理不分档——把手很小，投影是「浮起」的唯一线索，比 --shadow-xs 明显得多。 */
    '--switch-thumb-bg': WHITE,
    '--switch-thumb-shadow': formatShadow([{ x: 0, y: 1, blur: 3, color: SHADOW_BLACK, alpha: 0.25 }]),
    /* 导出物底色：导出图 / 下载 PNG 是交付物、不参与主题切换，故三主题同值。
       --export-paper 既是白底导出与白底预览的底色，也是「透明」棋盘的浅格；--export-checker 是深格。 */
    '--export-paper': WHITE,
    '--export-checker': '#cccccc',

    /* ===== 阴影（更轻、更清晰） ===== */
    '--shadow-sm': formatShadow([
      { x: 0, y: 1, blur: 3, color: SHADOW_BLACK, alpha: 0.04 },
      { x: 0, y: 1, blur: 2, color: SHADOW_BLACK, alpha: 0.06 },
    ]),
    '--shadow-md': formatShadow([
      { x: 0, y: 4, blur: 12, color: SHADOW_BLACK, alpha: 0.06 },
      { x: 0, y: 1, blur: 3, color: SHADOW_BLACK, alpha: 0.04 },
    ]),
    '--shadow-lg': formatShadow([
      { x: 0, y: 10, blur: 24, color: SHADOW_BLACK, alpha: 0.08 },
      { x: 0, y: 4, blur: 8, color: SHADOW_BLACK, alpha: 0.04 },
    ]),
    '--shadow-xl': formatShadow([
      { x: 0, y: 16, blur: 36, color: SHADOW_BLACK, alpha: 0.1 },
      { x: 0, y: 6, blur: 12, color: SHADOW_BLACK, alpha: 0.05 },
    ]),
    '--shadow-panel': formatShadow([
      { x: 0, y: 8, blur: 24, color: SHADOW_BLACK, alpha: 0.06 },
      { x: 0, y: 2, blur: 6, color: SHADOW_BLACK, alpha: 0.04 },
    ]),
    '--shadow-floating': formatShadow([
      { x: 0, y: 20, blur: 48, color: SHADOW_BLACK, alpha: 0.12 },
      { x: 0, y: 8, blur: 16, color: SHADOW_BLACK, alpha: 0.06 },
    ]),
    '--shadow-xs': formatShadow([{ x: 0, y: 1, blur: 2, color: SHADOW_BLACK, alpha: 0.05 }]),

    /* 遮罩底色：全项目**唯一**保留半透明的通道。遮罩的职责就是「透出下层、把注意力压到弹层上」，
       实色化后弹层直接变成一块看不见背景的板子（亮色下发灰发白、暗色下纯黑），语义就没了 ——
       故本值不接受 SOLID TINTS 口径，三主题取值一律 rgba(0, 0, 0, 0.5)。
       业务侧仍不得写 x/NN 半透明工具类；遮罩一律走 bg-overlay（即本变量），alpha 只许封装在这里。 */
    '--overlay-bg': formatRgba(parseRgb('#000000'), 0.5),

    /* ===== 自绘滚动条拇指配色 =====
       不复用 --text-disabled / --text-muted：暗色下后者因无障碍对比度被提亮，两态会几乎同色。
       三档必须齐备——高对比缺档会回落本处亮色值，在近黑底上表现为「悬停反而变暗」，方向与 .dark 相反。 */
    '--v-scrollbar-thumb': '#c7c7cc',
    '--v-scrollbar-thumb-hover': '#8e8e93',

    /* ===== SOLID TINTS：半透明强调色的实色替身（口径见 ../tint.ts） ===== */
    ...buildTintDeclarations(),

    /* ===== SOLID SHADES：强调色的压深档（口径见 ../shade.ts） =====
       替掉原先散落在 buttonThemes 里的 `color-mix(色 88%, black)` 现算。 */
    ...buildShadeDeclarations(),
  },
};
