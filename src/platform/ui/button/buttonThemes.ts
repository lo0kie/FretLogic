/**
 * ActionButton 主题映射（单一来源）
 *
 * ActionButton 与 BaseCheckbox buttonized 形态共用同一份色板与尺寸，
 * 避免视觉样式复制后随 ActionButton 演进而漂移。
 *
 * 【宿主差异说明】主题串内含 `hover:enabled:` 前缀（button 原生的 :enabled 语义，
 * 禁用态不响应 hover）。当复用宿主不是原生 button（如 BaseCheckbox 的 label）时，
 * 该前缀不会命中，需按宿主转换：
 *   - button（ActionButton）：直接使用，保持禁用不 hover 的原语义
 *   - label（BaseCheckbox）：把 `hover:enabled:` 替换为 `hover:`；禁用态单独移除 hover 段
 */
import { CONTROL_HEIGHT_CLASSES, CONTROL_SQUARE_CLASSES } from '@/platform/ui/controlSizes';

import type { ThemeColor } from '@/platform/types';

export type ButtonThemeType = ThemeColor;

/** 普通（default）变体：尺寸高度/内边距/字号 */
export const BUTTON_SIZE_MAP: Record<string, string> = {
  sm: `${CONTROL_HEIGHT_CLASSES.sm} gap-xs px-md text-xs`,
  md: `${CONTROL_HEIGHT_CLASSES.md} gap-sm px-lg text-xs`,
  lg: `${CONTROL_HEIGHT_CLASSES.lg} gap-sm px-xl text-sm`,
};

/** 紧凑模式尺寸：左右内边距减半，同时缩小与首尾图标的 gap；高度/字号保持与原尺寸一致 */
export const BUTTON_COMPACTED_SIZE_MAP: Record<string, string> = {
  sm: `${CONTROL_HEIGHT_CLASSES.sm} gap-2xs px-[0.4rem] text-xs`,
  md: `${CONTROL_HEIGHT_CLASSES.md} gap-xs px-[0.6rem] text-xs`,
  lg: `${CONTROL_HEIGHT_CLASSES.lg} gap-xs px-[0.8rem] text-sm`,
};

/** icon-only 方形尺寸 */
export const BUTTON_ICON_ONLY_SIZE_MAP: Record<string, string> = {
  sm: `p-0! ${CONTROL_SQUARE_CLASSES.sm} aspect-square`,
  md: `p-0! ${CONTROL_SQUARE_CLASSES.md} aspect-square`,
  lg: `p-0! ${CONTROL_SQUARE_CLASSES.lg} aspect-square`,
};

export const BUTTON_LOADER_SIZE_MAP: Record<string, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export const BUTTON_ROUNDED_MAP: Record<string, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-pill',
};

/** text 变体（纯文字按钮） */
export const BUTTON_TEXT_THEME_MAP: Record<ButtonThemeType, string> = {
  primary: 'text-primary hover:enabled:bg-surface-panel-hover',
  danger: 'text-danger hover:enabled:bg-surface-panel-hover',
  warning: 'text-warning hover:enabled:bg-surface-panel-hover',
  success: 'text-success hover:enabled:bg-surface-panel-hover',
  default: 'text-fg-body hover:enabled:bg-surface-panel-hover',
};

/** ghost 变体（透明底 + 主题色前景）。悬停前景取 SOLID SHADES 档（= 该语义色与纯黑 88:12 混合），
 *  原先由 `color-mix(in srgb, … 88%, black)` 在工具类里现算，比例散落在字符串里且产物色值无法审查。
 *
 *  `default` 的静止前景取 --text-muted，**不是** --text-disabled：后者正是禁用列写的前景色
 *  （见下方 BUTTON_DISABLED_THEME_MAP），静止档取它 = 「启用态与禁用态同一个颜色」——
 *  顶栏那一排 ghost 图标按钮（复制 / 粘贴 / 导出 / 设置 / GitHub）禁用前后肉眼分不出来，就是这一条。
 *  且静止档是**启用中的可交互图标**，受 WCAG 1.4.11（非文本 3:1）约束，--text-disabled 在亮色
 *  主题下只有 1.63:1，本就够不着；抬到 muted 后 light 5.20:1 / dark 5.93:1 双双达标。
 *  于是这一族形成 disabled < 静止(muted) < 悬停(body) 三级，禁用列才有得可降。 */
export const BUTTON_GHOST_THEME_MAP: Record<ButtonThemeType, string> = {
  primary: 'text-primary hover:enabled:bg-surface-panel-hover hover:enabled:text-shade-primary-12',
  danger: 'text-danger hover:enabled:bg-surface-panel-hover hover:enabled:text-shade-danger-12',
  warning: 'text-warning hover:enabled:bg-surface-panel-hover hover:enabled:text-shade-warning-12',
  success: 'text-success hover:enabled:bg-surface-panel-hover hover:enabled:text-shade-success-12',
  default: 'text-fg-muted hover:enabled:bg-surface-panel-hover hover:enabled:text-fg-body',
};

/** subtle 变体（浅色底 + 主题色前景）—— buttonized 选中/勾选态复用 */
export const BUTTON_SUBTLE_THEME_MAP: Record<ButtonThemeType, string> = {
  primary: 'border-tint-primary-90 bg-tint-primary-90 text-primary hover:enabled:bg-tint-primary-80',
  danger: 'border-tint-danger-90 bg-tint-danger-90 text-danger hover:enabled:bg-tint-danger-80',
  warning: 'border-tint-warning-90 bg-tint-warning-90 text-warning hover:enabled:bg-tint-warning-80',
  success: 'border-tint-success-88 bg-tint-success-88 text-success hover:enabled:bg-tint-success-82',
  default: 'border-border-light bg-surface-panel-hover text-fg-body hover:enabled:bg-border-base',
};

/** default 变体（常态底）。四种语义色一律「浅底 + 发丝描边 + 同色前景」：实心底会把文字送到
 *  --text-on-accent 上，而该令牌为过「强调色上的文字」对比度门禁已三主题统一取深墨，
 *  深墨压饱和强调色即「对比度过高」的观感。danger / warning 早前已是此口径，本次把
 *  primary / success 补齐；此后 default 与 subtle 仅差一档 tint 与边框。
 *  描边取 border-border-light（项目统一的静止发丝档，见 BaseInput / BaseSelector / BaseTextarea）；
 *  浅底没有描边就只剩一块无界的色斑，与后者同用一档才能与全站控件对齐。
 *  悬停档取各家族实有的下一档（primary 无 78 取 80，success 无 78/80 取 82）。 */
export const BUTTON_DEFAULT_THEME_MAP: Record<ButtonThemeType, string> = {
  primary: 'border-border-light bg-tint-primary-88 text-primary hover:enabled:bg-tint-primary-80',
  danger: 'border-border-light bg-tint-danger-88 text-danger hover:enabled:bg-tint-danger-78',
  warning: 'border-border-light bg-tint-warning-88 text-warning hover:enabled:bg-tint-warning-78',
  success: 'border-border-light bg-tint-success-88 text-success hover:enabled:bg-tint-success-82',
  default:
    'border-border-light bg-surface-body text-fg-body hover:enabled:border-border-base hover:enabled:bg-surface-panel-hover hover:enabled:text-fg-title hover:enabled:shadow-xs',
};

/**
 * 禁用列 —— **必须按变体给，一条通用串会错**。
 *
 * 禁用态改用「令牌三件套」（底 --bg-disabled / 描边 --border-disabled / 前景 --text-disabled），
 * 取代原先整元素 `disabled:opacity-35`：透明度是**相对**的，它把底、描边、文字、图标按同一比例
 * 一起压淡，既无法单独控制，观感又随所处底色漂移——同一个 35% 压在亮底与暗底上不是同一件事，
 * 且深色主题下会把文字压到近乎不可读。三件套则各档各司其职、且可被对比度门禁审查。
 *
 * 为什么不能一条通用串：变体分两类，能上底色的只有一类。
 *  - 有自有填充面的（default 浅底 / subtle 浅底）：三件套全上。
 *  - 透明底的（ghost 幽灵 / text 纯文字）：本就没有填充面，只能收前景色。给它硬套
 *    `disabled:bg-surface-disabled` 会凭空多出一块色斑，而这两种变体的全部信息量就在前景色上。
 *
 * 前景这一路不必额外照顾图标：BaseIcon 缺省取 currentColor，随本列自动继承，不再需要靠透明度
 * 把图标一起压淡。同理也不再需要为「禁用时不响应 hover」额外做补偿 —— 主题串里的悬停段都带
 * `:enabled`，原生 disabled 的 button 本就不匹配。
 */
export const BUTTON_DISABLED_THEME_MAP: Record<'default' | 'subtle' | 'ghost' | 'text', string> = {
  default: 'disabled:border-border-disabled disabled:bg-surface-disabled disabled:text-fg-disabled',
  subtle: 'disabled:border-border-disabled disabled:bg-surface-disabled disabled:text-fg-disabled',
  ghost: 'disabled:text-fg-disabled',
  text: 'disabled:text-fg-disabled',
};
