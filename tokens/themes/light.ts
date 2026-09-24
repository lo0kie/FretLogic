/**
 * 浅色主题（:root）颜色声明。
 *
 * 值来源：接管前的 src/assets/tokens.scss :root 块，逐值搬运、未做任何改动。
 * 其中 --bg-panel-subtle 与 --color-primary-rgb 改为派生（口径见各条注释），
 * tint 族由 buildTintDeclarations() 生成。
 */
import { formatRgba, parseRgb } from '../color';
import { buildLiftDeclarations } from '../lift';
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
/** 强调色底上的墨色：五个强调色在本主题下都偏亮，实测黑字全面优于白字（见 --text-on-accent 注释） */
const ON_ACCENT_INK = '#000000';
/** 指板/画布的深色描线族（琴枕、音符、横按、静音、空弦圆圈） */
const FB_DARK = '#18181b';
const FB_LINE_GRAY = '#a1a1aa';
/** 暖白：空弦根音圆点的底（--fb-open-root-bg） */
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
    /* 失效控件的底：= 面板悬停底与页面底各半。此前没有这一档，禁用态一律靠整元素
       `opacity-30~50` 淡化 —— 透明度会把边框、文字、图标一起压淡，既无法单独控制，又在不同主题下
       观感不一（它是相对底色的）。Element Plus 与 Ant Design 都为此单列（`--el-disabled-bg-color` /
       `colorBgContainerDisabled`），故补齐三件套：底（本条）+ 描边（--border-disabled）+
       文字（--text-disabled，早已存在）。 */
    '--bg-disabled': { kind: 'mix', a: '--bg-panel-hover', b: '--bg-body', weightB: 50 },

    /* ===== 边框 / 分隔（实色：按面板底色合成去掉透明） ===== */
    '--glass-border': '#dfdfe3',
    '--border-light': BORDER_LIGHT,
    '--border-base': BORDER_BASE,
    '--control-border': BORDER_BASE,
    '--separator': BORDER_LIGHT,
    /* 失效控件的描边：比静止发丝档 --border-light 再淡半档（= 发丝档与页面底各半） */
    '--border-disabled': { kind: 'mix', a: '--border-light', b: '--bg-body', weightB: 50 },

    /* ===== 文字（由深到浅四档：title > body > muted > disabled） ===== */
    '--text-title': '#1c1c1e',
    '--text-body': '#3a3a3c',
    /* muted 承担次级文案（说明 / 标签 / 行号）。原值 #8e8e93（systemGray）在亮底上仅 2.92:1，
       明显淡于深色的 6.05:1 与高对比的 9.62:1，故压深。
       取档依据是「最坏落底上仍过 WCAG AA 4.5」——注意最坏底**不是** --bg-main，而是本主题里
       最深的文字落底 --bg-panel-hover（#ebebef）：旧值 #6b6b70 在其上只有 4.46:1，差一点点没到线。
       现取再深一档 #6a6a6f：面板悬停 4.52:1 / 面板 5.20:1 / 主底 4.82:1 / 纯白 5.38:1，
       既保住四档层次，也维持 systemGray 家族的色偏（b − r = 5，与 title / body 一致）。
       这组数字由 tests/tokens/colorTokens.test.ts 的对比度门禁常驻看住，不再只写在注释里。 */
    '--text-muted': '#6a6a6f',
    '--text-disabled': '#c7c7cc',

    /* ===== 功能色 ===== */
    '--color-primary': COLOR_PRIMARY,
    /* primary 的 R, G, B 分量，供 rgba(var(--color-primary-rgb), α) 使用（由常色派生，不再手抄） */
    '--color-primary-rgb': { kind: 'rgbChannels', source: '--color-primary' },
    '--color-success': '#34c759',
    /* 另外两个功能色同样给出分量：供「同色带 alpha」的强调投影消费（不透明时直接取功能色令牌）。
       此前 buttonThemes / ChordAnalysisPanel 里手抄了这两个色的 rgb 分量。
       danger 不给分量：全仓没有「danger 色带 alpha」的投影消费方（零引用），
       留着只会让「改主题时要不要同步它」变成每次都要重新判断的假问题。 */
    '--color-success-rgb': { kind: 'rgbChannels', source: '--color-success' },
    '--color-warning': COLOR_WARNING,
    '--color-warning-rgb': { kind: 'rgbChannels', source: '--color-warning' },
    '--color-danger': '#ff3b30',
    /* 第五个语义色（Element Plus 与 Ant Design 都有 info，此前本项目只有四个）。取值是实测选定的：
       iOS systemIndigo 系**不达标** —— 亮/暗主题深墨只有 3.72 / 4.15，过不了本目录的 AA 门禁；
       Element 的灰蓝 #909399 虽达标，但彩度只有 0.01，**它就是个灰**，与既有 --text-disabled 无法区分，
       拿它当 info 修不掉「提示态被渲染成失效灰」这个缺陷。可用色相只剩青（约 211°）与紫（约 280°），
       紫离 primary 的 257° 只差 23°、会读成「另一个品牌蓝」，故取青（iOS systemTeal）。
       不给 -rgb 分量：全仓没有「info 色带 alpha」的投影消费方（与 danger 同理，见下条注释）。 */
    '--color-info': '#30b0c7',
    /* 实心档：把该族语义色压深到「白字过 AA（4.5:1）」的档位，供**实心底要承载文字**的场合
       （徽章 filled / 勾选框勾选态）使用。口径见 ../types.ts 的 solid 算子 —— 压深量由对比度门槛
       反推，不是按主题手挑的值，故三主题写的是同一句话、算出的深度各不相同。
       为什么必须有这一档：白字落在**常规**强调色上先天不够（本主题 primary 4.02 / danger 3.55 /
       success 2.22 / warning 2.20），实心底一旦要放字就只能配深墨，而深墨压饱和色正是「对比度过高」
       的眩光来源 —— 这一档把「实心底 + 白字」这条路真正打开。
       warning 刻意不声明：亮黄的白字上限约 1.9:1，压深到够用会把它压成深橄榄色、毁掉警示语义；
       它的实心底一律配 --text-on-accent 深墨（≈9.6:1），这也是「警示底配深墨」的通行做法。 */
    '--color-primary-solid': { kind: 'solid', source: '--color-primary' },
    '--color-success-solid': { kind: 'solid', source: '--color-success' },
    '--color-danger-solid': { kind: 'solid', source: '--color-danger' },
    /* 强调色（按钮 / 徽章 / 标签）上的文字。五个强调色在本主题下都偏亮，实测**黑字全面优于白字**：
       白字落 primary 4.02:1 / success 2.22:1 / warning 2.20:1 / danger 3.55:1 / info 2.57:1，连大字下限 3:1
       都有三处保不住；黑字分别 5.23 / 9.46 / 9.55 / 5.92 / 8.16，五档全过 AA 正文线。
       高对比主题原本就是黑字，这里向它对齐。
       注意本令牌只服务「语义强调色」这五种底 —— 指板音符圆点另有 --fb-dot-text，
       那里的底是饱和蓝，反而是白字更清楚，共用一个令牌必然顾此失彼。 */
    '--text-on-accent': ON_ACCENT_INK,

    /* 实心强调色底上的浅色字（徽章 filled / 勾选框勾选态）。
       与上一条是**同一族底、相反方向的两种墨**：--text-on-accent 服务「强调色的浅底」（tint 族），
       本条服务「强调色的**实心档**」。
       ⚠️ 授权范围只到实心档为止：本令牌配的底必须是 `--color-<族>-solid`（= 压深到白字过 AA 的那一档）。
       白字落在**常规**强调色上先天不够（primary 4.02 / danger 3.55 / success 2.22 / warning 2.20），
       凡「实心底要承载文字」的场合都先换底色、再用本令牌；底色是常规强调色时一律走 --text-on-accent 深墨。
       warning 没有实心档（理由见上一条），故它的实心底一律配深墨。
       这条授权由 tests/tokens/colorTokens.test.ts 的「实心档上的浅色字」执行：三族 × 三主题全部 ≥ 4.5:1。 */
    '--text-on-solid': WHITE,

    /* ===== 指板画布调色板（跟随主题切换的绘制色） ===== */
    '--fb-line': FB_LINE_GRAY,
    '--fb-line-dim': '#d4d4d8',
    '--fb-nut': FB_DARK,
    '--fb-note': '#0f172a',
    '--fb-hover': WHITE,
    '--fb-label': '#475569',
    '--fb-dot': '#2563eb',
    /* 音符圆点上的字色：本主题的圆点是较暗的饱和蓝，白字 5.17:1 优于黑字 4.06:1 ——
       与「强调色上用黑字」相反，故与 --text-on-accent 分开取档（见该条注释）。 */
    '--fb-dot-text': WHITE,
    /* 横按梁的蓝色 R, G, B 分量：SVG 的 fill/stroke 无法直接取 var() 色值（要按 α 分层），
       故以 `rgba(var(--fb-barre-rgb), α)` 消费。暗色档见 .dark；高对比主题不覆盖、沿用本档
       （与接管前一致：接管前只有明/暗两档，高对比主题按「非暗」取本值）。 */
    '--fb-barre-rgb': '59, 130, 246',
    /* 根音圆点上的字色：圆点底色是 --fb-root = --color-warning（暖橙），暖白在其上只有 2.07:1，
       故取深墨 —— 与 .dark / HC 同值（同一底色、同一最优墨色）。 */
    '--fb-root-text': '#29323d',
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
       不复用 --text-disabled / --text-muted：两者是**文字**层级档（失效文字连对比度门禁都豁免），
       而拇指是 UI 面，要的是三主题各自撑起「静止 / 悬停」两档可见区分，取值口径本就不同。
       三档必须齐备——高对比缺档会回落本处亮色值，在近黑底上表现为「悬停反而变暗」，方向与 .dark 相反。 */
    '--v-scrollbar-thumb': '#c7c7cc',
    '--v-scrollbar-thumb-hover': '#8e8e93',

    /* ===== SOLID TINTS：半透明强调色的实色替身（口径见 ../tint.ts） ===== */
    ...buildTintDeclarations(),

    /* ===== SOLID SHADES：强调色的压深档（口径见 ../shade.ts） =====
       替掉原先散落在 buttonThemes 里的 `color-mix(色 88%, black)` 现算；另含实心档的按下档 -20。 */
    ...buildShadeDeclarations(),

    /* ===== LIFT：强调色的提亮档（口径见 ../lift.ts） =====
       替掉实心档悬停的 `group-hover:brightness-105` 现算；与 SHADES 一样用绝对色锚点，不随主题漂移。 */
    ...buildLiftDeclarations(),
  },
};
