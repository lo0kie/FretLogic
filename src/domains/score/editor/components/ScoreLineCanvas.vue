<template>
  <canvas :data-line-index="lineId" :style="canvasStyle" aria-hidden="true" class="block select-none" ref="canvasRef" />
</template>

<script setup lang="ts">
import { computed, onMounted, useTemplateRef, watch } from 'vue';

import { paintArrangeLine } from '@/domains/score/editor/render/arrangeLinePainter';
import { activeTheme } from '@/platform/composables/useTheme';
import { isClient } from '@/platform/utils/common';

import type { ArrangeLineLayout } from '@/domains/score/editor/render/arrangeLineLayout';
import type { ArrangeLineVisualState, ArrangePaintOptions } from '@/domains/score/editor/render/arrangeLinePainter';
import type { CSSProperties } from 'vue';

/**
 * 排列和弦区的**一行 canvas**：一行一张画布，行内的一切（行号、字符、指板图卡、两枚「+」、
 * 行末删除钮、以及各种高亮态）都画在这一张上。
 *
 * 分工：几何归 `arrangeLineLayout`（同一份矩形表也用于命中测试，故「点得中」与「看得见」同源），
 * 笔触归 `arrangeLinePainter`；本组件只做三件事 —— 挂画布、按依赖重绘、把尺寸交给 CSS。
 *
 * 为什么行宽高走 CSS px 而不用 `width: 100%`：排版是**按容器实际宽算出来的**（内容宽不足时行被
 * 拉伸到容器宽，见 layoutArrangeLine），canvas 的位图宽度必须与这个逻辑宽一致；让 CSS 再拉伸一次
 * 只会让位图与坐标错位（绘制坐标与命中坐标都按逻辑 px 记）。
 *
 * 键盘可达性**已随 canvas 化移除**：canvas 里没有可聚焦的槽位元素，行内不再有 Tab 序列、
 * 不再有 `Enter` / `Delete` 键路径（该需求由用户明确下达）。
 */
defineOptions({ name: 'ScoreLineCanvas' });

const props = defineProps<{
  /** 行 id（`data-line-index`）：拖拽几何与滚动位置存档都按它寻址 */
  lineId: string;
  /** 本行的排版产物（宿主缓存后传入，同一行内容不变时引用稳定） */
  layout: ArrangeLineLayout;
  /** 本行的视觉状态 */
  state: ArrangeLineVisualState;
  /** 绘制参数（字号 / 卡倍率 / 显示开关） */
  paint: ArrangePaintOptions;
}>();

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');

/**
 * 设备像素比上限。
 *
 * 行 canvas 是**逐行常驻**的（视口内几十行同时存在），位图内存 = 宽 × 高 × dpr² × 4B：
 * 3 倍屏下一张 900×180 的行就是 5.8MB，几十行会顶到几百 MB。封到 2 倍：肉眼几乎无差，内存减半。
 */
const DPR_CAP = 2;

const canvasStyle = computed<CSSProperties>(() => ({
  width: `${props.layout.width}px`,
  height: `${props.layout.height}px`,
}));

/** 重绘：尺寸变了才重设位图（改 `width` / `height` 会清空画布并重置变换） */
const draw = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const { width, height } = props.layout;
  if (width <= 0 || height <= 0) return;

  const dpr = isClient ? Math.min(window.devicePixelRatio || 1, DPR_CAP) : 1;
  const physicalWidth = Math.round(width * dpr);
  const physicalHeight = Math.round(height * dpr);
  if (canvas.width !== physicalWidth) canvas.width = physicalWidth;
  if (canvas.height !== physicalHeight) canvas.height = physicalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  paintArrangeLine(ctx, props.layout, props.state, props.paint);
};

onMounted(() => draw());

// 三个入参都是宿主算好的对象（内容变化时才换引用），加上主题 —— 主题切换要重解析配色重绘。
// 不做深监听：`state` / `layout` 的字段级变化一律由宿主重建对象表达（那是它本来就有的语义）。
watch([() => props.layout, () => props.state, () => props.paint, activeTheme], () => draw());
</script>
