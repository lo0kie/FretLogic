import { computed } from 'vue';

import { toPositionLength } from './floatingPositions';

/** 浮层定位相关 props（BaseFab / BaseFloatingPill 共用子集） */
export interface FloatingPositionProps {
  /** 定位方式：'fixed' (相对于视口) | 'absolute' (相对于父级定位上下文) */
  position?: 'fixed' | 'absolute';
  /** 自定义 z-index，支持数字或 Tailwind 类名 */
  zIndex?: number | string;
  /** 距顶部距离；数值自动补齐 px。与 bottom 互斥，传 top 时忽略 bottom */
  top?: string | number;
  /** 距底部距离；数值自动补齐 px */
  bottom?: string | number;
  /** 距左侧距离；数值自动补齐 px */
  left?: string | number;
  /** 距右侧距离；数值自动补齐 px */
  right?: string | number;
  /** 关闭底部安全区叠加（env(safe-area-inset-bottom)） */
  noSafeAreaInset?: boolean;
}

/**
 * 浮层定位样式（BaseFab / BaseFloatingPill 共用）：
 * - positionClass：fixed/absolute 定位类
 * - zIndexClass：zIndex 为 Tailwind 类名时生效
 * - positionStyle：top/bottom（bottom 叠加安全区）、left/right 定位与数字型 zIndex 内联样式
 *   各定位值经 toPositionLength 统一转 px/校验（非法字符串开发期告警）
 */
export function useFloatingPosition(props: FloatingPositionProps, scope: string) {
  const positionClass = computed(() => (props.position === 'absolute' ? 'absolute' : 'fixed'));

  const zIndexClass = computed(() => (typeof props.zIndex === 'string' ? props.zIndex : ''));

  const positionStyle = computed<Record<string, string | number>>(() => {
    const style: Record<string, string | number> = {};
    // 垂直：优先 top，否则 bottom（叠加底部安全区）
    if (props.top !== undefined) style['top'] = toPositionLength(props.top, scope);
    else if (props.bottom !== undefined) {
      const b = toPositionLength(props.bottom, scope);
      style['bottom'] = props.noSafeAreaInset ? b : `calc(${b} + env(safe-area-inset-bottom, 0px))`;
    }
    // 水平：显式 left/right 时钉边，否则交由 alignClass 决定
    if (props.left !== undefined) style['left'] = toPositionLength(props.left, scope);
    else if (props.right !== undefined) style['right'] = toPositionLength(props.right, scope);

    if (typeof props.zIndex === 'number') style['zIndex'] = props.zIndex;

    return style;
  });

  return { positionClass, zIndexClass, positionStyle };
}
