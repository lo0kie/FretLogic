<template>
  <canvas
    :style="{ height: `${stripCssHeight}px` }"
    aria-hidden="true"
    class="pointer-events-none absolute inset-x-0 bottom-0 w-full"
    ref="canvasRef"
  />
</template>

<script setup lang="ts">
/**
 * 预览页脚合成层：透明画布浮在页图之上，只画「第 X 页」。
 *
 * 页脚不进页面栅格（见 services/footerOverlay 的说明），所以切换「显示页脚」只影响这一层：
 * 挂载/卸载 + 重绘一行字，零 Worker 渲染、零缓存条目。
 * 绘制走与导出完全相同的 drawFooterMark（同字号/字重/色值/坐标），保证预览与导出逐像素同源。
 *
 * 画布只覆盖**底部页边距条带**（高 = pageMargin 逻辑 px），不是整页：
 * 此前 backing store = 整页 × (scale·dpr)²，却只画一行 12px 文字、clearRect 整页——
 * 70% 缩放 DPR2 下每页 ≈7MB 位图 × 20 页全是浪费。条带化后每页 ≈0.7MB 量级。
 * 绘制仍用整页逻辑坐标（变换里平移掉条带顶以上的部分），drawFooterMark 零改动。
 */
import { computed, onMounted, useTemplateRef, watch } from 'vue';

import { drawFooterMark } from '@/domains/score/preview/services/footerOverlay';

const props = defineProps<{
  /** 页序号（从 0 起） */
  pageIndex: number;
  /** 页面逻辑宽高（px @96dpi，与渲染坐标系一致） */
  pageWidth: number;
  pageHeight: number;
  /** 显示缩放比：显示 CSS 尺寸 / 逻辑尺寸（= 预览缩放百分比 / 100） */
  scale: number;
  /** 页边距（px，逻辑坐标系）：页码基线落在本条带内的底部页边距中线上 */
  pageMargin: number;
  /** 页码文字色（同导出配色的弱化文字色） */
  color: string;
}>();

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');

/** 条带高度（CSS px）= 页边距逻辑高 × 显示缩放 */
const stripCssHeight = computed(() => props.pageMargin * props.scale);

/**
 * 重绘：画布分辨率取「显示尺寸 × 设备像素比」保证任意缩放下清晰；
 * 变换 = 逻辑 px → 设备 px 的缩放，再向下平移「条带顶以上的页高」，
 * 使 drawFooterMark 收到的仍是完整页逻辑坐标（与导出侧零差异）。
 */
const draw = () => {
  const el = canvasRef.value;
  if (!el) return;

  const ratio = props.scale * Math.max(1, window.devicePixelRatio || 1);
  const deviceW = Math.max(1, Math.round(props.pageWidth * ratio));
  const deviceH = Math.max(1, Math.round(props.pageMargin * ratio));
  if (el.width !== deviceW || el.height !== deviceH) {
    el.width = deviceW;
    el.height = deviceH;
  }

  const ctx = el.getContext('2d');
  if (!ctx) return;
  const effective = deviceW / props.pageWidth;
  const stripTopLogical = props.pageHeight - props.pageMargin;
  ctx.setTransform(effective, 0, 0, effective, 0, -stripTopLogical * effective);
  // clearRect 用条带的设备像素矩形（变换已被上面的平移覆盖，换算回条带本地坐标清屏）
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, deviceW, deviceH);
  ctx.restore();
  drawFooterMark(ctx, {
    pageIndex: props.pageIndex,
    width: props.pageWidth,
    height: props.pageHeight,
    pageMargin: props.pageMargin,
    color: props.color,
  });
};

onMounted(draw);
watch(() => [props.pageIndex, props.pageWidth, props.pageHeight, props.scale, props.pageMargin, props.color], draw);
</script>
