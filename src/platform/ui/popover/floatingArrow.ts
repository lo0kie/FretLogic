import type { CSSProperties } from 'vue';

type StaticSide = 'top' | 'bottom' | 'left' | 'right';

/**
 * 浮层箭头（45° 旋转方块）各 staticSide 下保留的两条边框。
 * 裁掉与面板相接侧的边，避免与面板边框形成双线接缝。
 * 以 vTooltip 调校后的查表行为为准，Popover/Tooltip 统一使用。
 */
const ARROW_KEEP_BORDERS: Record<StaticSide, ['top' | 'bottom', 'left' | 'right']> = {
  top: ['top', 'left'],
  bottom: ['bottom', 'right'],
  left: ['bottom', 'left'],
  right: ['top', 'right'],
};

const OPPOSITE_SIDE: Record<StaticSide, StaticSide> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

/**
 * 只保留朝外楔形的 clip-path（在未旋转的方块坐标系上裁剪，随元素一起旋转 45°）。
 * 保留的正好是 ARROW_KEEP_BORDERS 对应两条边围出的三角：
 * 半透明玻璃面板（backdrop-blur）挡不住箭头插入面板内的部分，必须物理裁掉，
 * 否则插入侧的边框会透过面板隐约可见。
 */
const ARROW_CLIP: Record<StaticSide, string> = {
  top: 'polygon(0 0, 100%  0 100%)', // 左上三角（尖朝上，保留 top+left 边）
  bottom: 'polygon(100% 0, 100% 100%, 0 100%)', // 右下三角（尖朝下，保留 bottom+right 边）
  left: 'polygon(0 0, 0 100%, 100% 100%)', // 左下三角（尖朝左，保留 bottom+left 边）
  right: 'polygon(0 0, 100%   100%)', // 右上三角（尖朝右，保留 top+right 边）
};

export interface FloatingArrowStyleInput {
  /** floating-ui arrow middleware 输出的 x 坐标 */
  arrowX?: number | null;
  /** floating-ui arrow middleware 输出的 y 坐标 */
  arrowY?: number | null;
  /** floating-ui 计算后的最终 placement */
  placement: string | undefined;
  /** 箭头背景（与面板背景同源，玻璃拟态下需带 blur） */
  background: string;
  /** 箭头边框色（与面板边框同源） */
  borderColor: string;
  /** 面板若有 backdrop-blur，箭头必须同步，否则半透明背景下面板与箭头出现色差 */
  backdropFilter?: string;
  /** 箭头相对面板的堆叠层级，默认 0（垫在面板之下） */
  zIndex?: number;
  /** 箭头方块边长（px），默认 8；贴边偏移自动按 -(size/2 - 1) 计算 */
  size?: number;
  borderWidth?: number;
}

/**
 * 构建浮层箭头的样式：方块旋转 45°（默认 8px，可传 size 调整，楔形顶部自动插入面板 1px），
 * 由 floating-ui arrow middleware 提供定位，按 placement 决定贴边方向与保留的边框。
 * BasePopover（声明式绑定）与 vTooltip（命令式赋值）共用，保证两者的箭头渲染完全一致。
 */
export function buildFloatingArrowStyle({
  arrowX,
  arrowY,
  placement,
  background,
  borderColor,
  backdropFilter,
  zIndex = 0,
  size = 12,
  borderWidth = 0, // 新增默认值 0
}: FloatingArrowStyleInput): CSSProperties {
  const activeSide = (placement ?? 'top').split('-')[0] as StaticSide;
  const staticSide = OPPOSITE_SIDE[activeSide];
  const [keepA, keepB] = ARROW_KEEP_BORDERS[staticSide];

  // 1. 修正 X/Y 轴坐标，抵消父容器边框带来的内缩
  const finalX = arrowX != null ? arrowX - borderWidth : null;
  const finalY = arrowY != null ? arrowY - borderWidth : null;

  // 2. 原本插入量是 +1px (压住抗锯齿缝隙)。
  // 加入 borderWidth 后，需要额外往外推 borderWidth 的距离，把原点对齐回 border-box 边缘。
  const offsetPos = -(size / 2) + 1 - borderWidth;

  return {
    position: 'absolute',
    width: `${size}px`,
    height: `${size}px`,
    pointerEvents: 'none',
    zIndex,
    background,
    borderRadius: '2px',
    borderStyle: 'solid',
    borderColor,
    transform: 'rotate(45deg)',
    clipPath: ARROW_CLIP[staticSide],
    backdropFilter,
    WebkitBackdropFilter: backdropFilter,
    left: finalX != null ? `${finalX}px` : '',
    top: finalY != null ? `${finalY}px` : '',
    right: '',
    bottom: '',
    [staticSide]: `${offsetPos}px`,
    borderTopWidth: keepA === 'top' ? '1px' : '0px',
    borderBottomWidth: keepA === 'bottom' ? '1px' : '0px',
    borderLeftWidth: keepB === 'left' ? '1px' : '0px',
    borderRightWidth: keepB === 'right' ? '1px' : '0px',
  } as CSSProperties;
}
