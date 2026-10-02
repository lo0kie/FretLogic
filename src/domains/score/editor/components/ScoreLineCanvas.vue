<template>
  <canvas :data-line-index="lineId" :style="canvasStyle" aria-hidden="true" class="block select-none" ref="canvasRef" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';

import { arrangeCanvasDpr } from '@/domains/score/editor/render/arrangeLineLayout';
import { paintArrangeLine, resolveArrangePalette } from '@/domains/score/editor/render/arrangeLinePainter';
import {
  cancelArrangeLinePaint,
  scheduleArrangeLinePaint,
} from '@/domains/score/editor/services/arrangeLinePaintQueue';
import { activeTheme } from '@/platform/composables/useTheme';

import type { ArrangeLineLayout } from '@/domains/score/editor/render/arrangeLineLayout';
import type {
  ArrangeLineVisualState,
  ArrangePaintOptions,
  ArrangePalette,
} from '@/domains/score/editor/render/arrangeLinePainter';
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
 * 设备像素比与上限统一取自排版侧的 `arrangeCanvasDpr`（见其说明）：行宽高在那边按它
 * 量化到设备像素网格，绘制侧的位图尺寸必须用同一个值，两边才逐像素对齐。行 canvas 是
 * **逐行常驻**的（视口内几十行同时存在），上限封在 3 倍也是为了把位图内存压住。
 */

const canvasStyle = computed<CSSProperties>(() => ({
  width: `${props.layout.width}px`,
  height: `${props.layout.height}px`,
}));

/**
 * 绘制走模块级单例**队列**（`editor/services/arrangeLinePaintQueue`）：**不能**在组件里存队列 ——
 * `<script setup>` 的顶层代码按实例执行，每行一条自带队列等于「一屏几十条单任务队列」，
 * 分片与视窗优先取消全部失效（详见该服务文件头）。
 */
/** 只认本实例最后一次请求：重绘连发时旧任务排在队里，轮到它时已被更新的一次取代（实例级，不进队列） */
let latestPaintRequest = 0;

/** 本实例最近一次请求的键：卸载时只取消它，不动同一行后来的请求（见队列的 pendingByKey） */
let latestPaintKey = '';

/** 卸载即离屏：把这一条从队列里撤掉（父级只挂载视窗内的行，见队列文件头「为什么要取消」） */
onBeforeUnmount(() => cancelArrangeLinePaint(latestPaintKey));

/** 画这一行：清屏 / 变换口径（设备像素清整张位图 + 行局部逻辑坐标含 DPR）都在这里定 */
const paintLine = (canvas: HTMLCanvasElement, dpr: number) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintArrangeLine(ctx, props.layout, props.state, props.paint);
};

/**
 * 首帧占位：任务要等轮到本片才执行（见队列的 PAINT_SLICE_SIZE），在那之前这一行是空白的 ——
 * 先写一行浅色「正在渲染」，真画上去时整张位图被覆盖，不会残留。
 *
 * 用 `palette.lineText`（即 `--text-muted`）取色，不另写颜色字面量；字号跟排列区字号缩放走，
 * 与行内其它文字同档。字体栈只用通用 `sans-serif`：这行字存在的时间通常只有一帧到几十毫秒，
 * 为占位去引整套乐谱字体配置不划算。
 */
const paintRenderingPlaceholder = (ctx: CanvasRenderingContext2D, dpr: number, palette: ArrangePalette) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = palette.lineText;
  ctx.font = `${Math.round(12 * props.paint.fontScale)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('正在渲染', props.layout.width / 2, props.layout.height / 2);
};

/** 这一行是否已经出过图（首次轮到本片画完置真）：决定还要不要写「正在渲染」占位 */
const hasPainted = ref(false);

/** 重绘：尺寸变了才重设位图（改 `width` / `height` 会清空画布并重置变换） */
const draw = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const { width, height } = props.layout;
  if (width <= 0 || height <= 0) return;

  // 倍率含排列区的视图缩放（见 arrangeCanvasDpr 的 extraScale）：行 canvas 的 CSS 尺寸不带它，
  // 渲染时由外层 CSS `zoom` 放大，故位图要按同一个倍率加密度，放大后才不糊 —— 排版侧的量化网格
  // 用的是同一个值（layout 里已体现），两边必须同源，否则位图与 CSS 盒差出亚像素、右缘留残影。
  const dpr = arrangeCanvasDpr(props.paint.viewZoom);
  const physicalWidth = Math.round(width * dpr);
  const physicalHeight = Math.round(height * dpr);

  // 清屏走**设备像素坐标**清整张位图：按 CSS 坐标 clearRect(0, 0, width, height) 时，
  // 浮点坐标会触发抗锯齿清除 —— 位图边缘那 1 行像素永远残留上一帧的一点颜色。行高 × dpr
  // 常是分数（48.4px × 2 = 96.8，位图取整 97 行），悬停填充的底边就这样在最后一行越积越实，
  // 指针移开后也不消失 —— 观感即「有些行底下有一条 canvas 画的下划线」。排版侧已把行宽高
  // 量化到设备像素网格（arrangeLineLayout），这里是第二道保险：无论如何都清满整张位图。
  const resizeBitmap = () => {
    if (canvas.width !== physicalWidth) canvas.width = physicalWidth;
    if (canvas.height !== physicalHeight) canvas.height = physicalHeight;
  };

  const requestId = ++latestPaintRequest;

  // 位图尺寸必须先设好**再**写占位：占位是画在位图里的，位图还是默认的 300×150 时，
  // 画在 layout.width / 2 处的文字落在位图之外，被直接裁掉 —— 观感就是「占位没出现、整行空白」。
  // （轮到本片画之前还会再调一次，那是为尺寸在等待期间变化兜底，同尺寸时是空操作。）
  resizeBitmap();

  // 只在**这一行还没出过图**时写占位：悬停移动等重绘也会走这里，每次都写会闪成一片；
  // 出过图之后再改内容就让它短暂停在旧画面上 —— 那比「一动指针就闪」好得多。
  if (!hasPainted.value) {
    const placeholderCtx = canvas.getContext('2d');
    if (placeholderCtx) paintRenderingPlaceholder(placeholderCtx, dpr, resolveArrangePalette());
  }

  latestPaintKey = scheduleArrangeLinePaint(props.lineId, () => {
    // 组件已卸载，或期间又发起了更新的一次重绘：丢弃这一次
    if (!canvasRef.value || requestId !== latestPaintRequest) return;
    resizeBitmap();
    paintLine(canvasRef.value, dpr);
    hasPainted.value = true;
  });
};

onMounted(() => draw());

// 三个入参都是宿主算好的对象（内容变化时才换引用），加上主题 —— 主题切换要重解析配色重绘。
// 不做深监听：`state` / `layout` 的字段级变化一律由宿主重建对象表达（那是它本来就有的语义）。
watch([() => props.layout, () => props.state, () => props.paint, activeTheme], () => draw());
</script>
