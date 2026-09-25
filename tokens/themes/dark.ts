/**
 * 深色主题（.dark）颜色声明。
 *
 * 值来源：接管前的 src/assets/tokens.scss .dark 块，逐值搬运、未做任何改动。
 * 段落顺序按本目录统一结构排列（背景 → 边框 → 文字 → 功能色 → 指板 → 画布 → 其他 →
 * 阴影 → 遮罩 → 滚动条 → tint），与旧文件逐行顺序不完全相同，但不影响任何输出取值。
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
    /* 失效控件的底：**本主题不能沿用亮色口径**。亮色下 --bg-panel-hover 只比 --bg-body 略浅，
       取两者之间即「洗淡」；暗色下方向相反 —— panel-hover(#2c2c2e) 比 body(#1c1c1e) 更亮，
       同一公式混出 #242426，反而**亮过**它所落的面板底与页面底(#000)，禁用控件于是成了「高亮斑」
       而不是「被压暗的控件」。
       故暗色改取「面板底朝页面底压深一半」= #0e0e0f：落在面板之下、仍是可辨的实体块，
       与描边 --border-disabled 合起来仍是「有控件、但已失效」。 */
    '--bg-disabled': { kind: 'mix', a: '--bg-panel', b: '--bg-main', weightB: 50 },

    /* ===== 边框 / 分隔 ===== */
    '--glass-border': PANEL_HOVER,
    '--border-light': '#343437',
    '--border-base': BORDER_BASE,
    '--control-border': BORDER_BASE,
    '--separator': BORDER_BASE,
    '--border-disabled': { kind: 'mix', a: '--border-light', b: '--bg-body', weightB: 50 },

    /* ===== 文字 ===== */
    '--text-title': '#f5f5f7',
    '--text-body': '#ebebf5',
    '--text-muted': '#98989d',
    /* 失效文字：由 --text-muted 朝纯黑压深 35%（本主题 #98989d → #636366，落面板 2.84:1）。
       必须**明显低于** muted —— 此前这里是 #8e8e96（落面板 5.23:1），与 muted 的 5.93:1 只差
       0.04 亮度，失效文字读起来和次级文字一样重，「失效」这个状态就没有视觉承载了。
       那个值当初是为过 axe 的 color-contrast 提上来的，但**规范并不要求**：WCAG 1.4.3 明确豁免
       失效控件，本仓自己的门禁也据此把 --text-disabled 排除在正文三档之外（见
       tests/tokens/colorTokens.test.ts 的 READABLE_TEXT_TOKENS）。两者不可兼得，此处取
       「失效就该看起来失效」；代价是 axe 的 color-contrast 会对禁用控件报一项，属已知豁免。
       写成派生而不是写死 #636366：这样它永远跟着 --text-muted 走，不会哪天又被单独提亮回去。 */
    '--text-disabled': { kind: 'shade', source: '--text-muted', weight: 35 },

    /* ===== 功能色 ===== */
    '--color-primary': '#0a84ff',
    '--color-primary-rgb': { kind: 'rgbChannels', source: '--color-primary' },
    '--color-success': '#30d158',
    '--color-success-rgb': { kind: 'rgbChannels', source: '--color-success' },
    '--color-warning': '#ffd60a',
    '--color-warning-rgb': { kind: 'rgbChannels', source: '--color-warning' },
    '--color-danger': '#ff453a',
    /* 第五个语义色：取值口径见 light.ts 同名条目（色相同为 iOS systemTeal，本主题取该族的暗色档） */
    '--color-info': '#40c8e0',
    /* 实心档：口径见 light.ts 同名条目（由 solid 算子按「白字过 AA」的门槛反推压深量）。
       本主题三种强调色白字比值 3.65 / 2.02 / 3.41，全都过不了正文线，故压深量明显大于亮色主题。 */
    '--color-primary-solid': { kind: 'solid', source: '--color-primary' },
    '--color-success-solid': { kind: 'solid', source: '--color-success' },
    '--color-danger-solid': { kind: 'solid', source: '--color-danger' },
    /* 强调色（按钮 / 徽章 / 标签）上的文字：与亮色主题同口径取黑字，实测黑字落
       primary 5.76 / success 10.39 / warning 14.88 / danger 6.16 / info 10.56，
       白字只有 3.65 / 2.02 / 1.41 / 3.41 / 1.99。
       本令牌只服务语义强调色，指板音符圆点的字色另见 --fb-dot-text。 */
    '--text-on-accent': BLACK,

    /* 实心强调色底上的浅色字：授权范围与理由见 light.ts 同名条目 —— 只配 `--color-<族>-solid`，
       配常规强调色一律走 --text-on-accent 深墨。本主题四种强调色比亮色更高饱和，白字在其上更不保。 */
    '--text-on-solid': WHITE,

    /* ===== 指板画布调色板 ===== */
    '--fb-line': GRID_LINE,
    '--fb-line-dim': '#3f3f46',
    '--fb-nut': FB_LIGHT,
    '--fb-note': WHITE,
    '--fb-hover': '#28282a',
    '--fb-label': '#e2e8f0',
    '--fb-dot': '#3b82f6',
    /* 音符圆点上的字色：圆点与 HC 同为中性蓝 #3b82f6，黑字 5.71:1 优于白字 3.68:1
       （亮色主题的圆点更深、取的是白字，见 light.ts） */
    '--fb-dot-text': BLACK,
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

    /* ===== LIFT：源色取本主题自己的语义色（口径见 ../lift.ts）；与 SHADES 同为绝对色锚点，
       故本主题的提亮档与 :root 走的是同一支公式，不会「朝各自底色靠」 ===== */
    ...buildLiftDeclarations(),
  },
};
