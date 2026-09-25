<template>
  <!-- 剪影层：把面板描边与指向箭头画成**一条连续轮廓**（几何与配色见 arrowPanel.ts）。
       必须由模板渲染而不是由 TS 往面板里追加节点 —— 面板的 children 归 Vue 的补丁锚点管，
       外来节点会让 insertBefore 抛 NotFoundError。 -->
  <svg :class="ARROW_PANEL_CLASS" :style="ARROW_PANEL_STYLE" aria-hidden="true" height="100%" ref="svgRef" width="100%">
    <!-- 填充在前、轮廓在后：楔形底边向面板内多伸的一截会压在描边之上，由轮廓重新盖回描边色。
         发丝边（宿主 box-shadow 里那圈纯扩散环，深色 / 高对比主题才有）夹在两者中间：
         它与本体那一圈重合，同时顺着楔形绕过去 —— 少了它，本体是两道边而箭头只有一道。 -->
    <path ref="fillRef" />
    <path fill="none" ref="rimRef" stroke-linejoin="round" />
    <path fill="none" ref="outlineRef" stroke-linejoin="round" />
  </svg>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';

import {
  ARROW_PANEL_CLASS,
  ARROW_PANEL_SIZE,
  ARROW_PANEL_STYLE,
  paintArrowPanel,
  syncArrowPanel,
} from '@/platform/ui/popover/arrowPanel';

import type { ArrowPanelPaths, ArrowPanelSync } from '@/platform/ui/popover/arrowPanel';
import type { ArrowSide } from '@/platform/ui/popover/arrowPanelPath';

/**
 * 带箭头容器的剪影层：**直接放进面板内部**（面板自己照旧声明 `bg-*` / `border-*` / 圆角，
 * 剪影复刻它们并画成带箭头的形状）。
 *
 * 两条硬约束：
 * 1. 必须是面板的**直接子节点** —— 宿主由自身的 `parentElement` 认领，不需要额外传引用；
 * 2. 面板必须**不裁剪**（`overflow: visible`）—— 楔形本来就在盒子之外。
 *
 * 放在面板内部同样是被迫的：面板的进出场过渡（`v-transition-scale` 等）作用在面板自身，
 * 剪影若挂在兄弟位置就不会跟着缩放淡入。
 */
const {
  side,
  center = null,
  size = ARROW_PANEL_SIZE,
} = defineProps<{
  /** 箭头贴哪条边（面板朝锚点的那条） */
  side: ArrowSide;
  /** 箭头中心沿该边的位置（px）：上下边取 x、左右边取 y；缺省该边中点 */
  center?: number | null;
  /** 箭头方块边长（px），决定楔形底宽 `size·√2` 与高 `size/√2` */
  size?: number;
}>();

const svgRef = useTemplateRef<SVGSVGElement>('svgRef');
const fillRef = useTemplateRef<SVGPathElement>('fillRef');
const rimRef = useTemplateRef<SVGPathElement>('rimRef');
const outlineRef = useTemplateRef<SVGPathElement>('outlineRef');

/** 宿主 = 剪影层的直接父元素（即面板） */
const host = (): HTMLElement | null => svgRef.value?.parentElement ?? null;

let sync: ArrowPanelSync | null = null;

const paths = (): ArrowPanelPaths | null => {
  const fill = fillRef.value;
  const rim = rimRef.value;
  const outline = outlineRef.value;
  return fill && rim && outline ? { fill, rim, outline } : null;
};

const repaint = () => {
  const target = paths();
  const panel = host();
  if (!target || !panel || !sync) return;
  paintArrowPanel(target, panel, sync.box(), { side, center: center ?? undefined }, size);
};

const unbind = () => {
  if (!sync) return;
  // 剪影往宿主上写的 --arrow-panel-clip（供 v-wave 裁剪）要随剪影一起摘掉：
  // 原生入口 arrowPanel.ts 的 destroy() 同样清，两条路径口径必须一致 —— 否则一旦出现
  // 「面板留着、箭头先摘」（面板复用 / 箭头条件渲染）的消费方，水波就会按一个已经
  // 不存在的轮廓裁剪。onBeforeUnmount 阶段元素尚未从 DOM 摘除，parentElement 仍可读。
  sync.destroy();
  sync = null;
  host()?.style.removeProperty('--arrow-panel-clip');
};

/** 绑定宿主：先画一次，再接管尺寸与配色变化 */
const bind = () => {
  unbind();
  const panel = host();
  if (!panel) return;
  sync = syncArrowPanel({ measure: panel, paint: panel }, repaint);
  repaint();
};

onMounted(bind);
// side 会随 flip 变、center 会随实际落点变；两者都只影响路径，不必重绑宿主
watch([() => side, () => center, () => size], repaint);
onBeforeUnmount(unbind);
</script>
