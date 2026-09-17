<template>
  <canvas aria-hidden="true" class="pointer-events-none absolute inset-0 h-full w-full" ref="canvasRef" />
</template>

<script setup lang="ts">
/**
 * 预览页脚合成层：透明画布浮在页图之上，只画「第 X 页」。
 *
 * 页脚不进页面栅格（见 services/footerOverlay 的说明），所以切换「显示页脚」只影响这一层：
 * 挂载/卸载 + 重绘一行字，零 Worker 渲染、零缓存条目。
 * 绘制走与导出完全相同的 drawFooterMark（同字号/字重/色值/坐标），保证预览与导出逐像素同源。
 */
import { onMounted, useTemplateRef, watch } from 'vue';

import { drawFooterMark } from '@/domains/score/preview/services/footerOverlay';

const props = defineProps<{
  /** 页序号（从 0 起） */
  pageIndex: number;
  /** 页面逻辑宽高（px @96dpi，与渲染坐标系一致） */
  pageWidth: number;
  pageHeight: number;
  /** 显示缩放比：显示 CSS 尺寸 / 逻辑尺寸（= 预览缩放百分比 / 100） */
  scale: number;
  /** 页边距（px，逻辑坐标系） */
  pageMargin: number;
  /** 页码文字色（同导出配色的弱化文字色） */
  color: string;
}>();

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');

/**
 * 重绘：画布分辨率取「显示尺寸 × 设备像素比」保证任意缩放下清晰；
 * 变换按实际生效比（设备宽 / 逻辑宽）设定，绘制内容仍用逻辑 px。
 */
const draw = () => {
  const el = canvasRef.value;
  if (!el) return;

  const ratio = props.scale * Math.max(1, window.devicePixelRatio || 1);
  const deviceW = Math.max(1, Math.round(props.pageWidth * ratio));
  const deviceH = Math.max(1, Math.round(props.pageHeight * ratio));
  if (el.width !== deviceW || el.height !== deviceH) {
    el.width = deviceW;
    el.height = deviceH;
  }

  const ctx = el.getContext('2d');
  if (!ctx) return;
  const effective = deviceW / props.pageWidth;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, deviceW, deviceH);
  ctx.setTransform(effective, 0, 0, effective, 0, 0);
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
