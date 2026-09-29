<template>
  <canvas :aria-label :style="canvasStyle" class="pointer-events-none block select-none" ref="canvasRef" role="img" />
</template>

<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from 'vue';

import {
  renderFretboardBody,
  renderFretboardChordName,
  renderFretboardFretMarks,
} from '@/domains/fretboard/components/renderFretboardCanvas';
import { computeBarresSignature } from '@/domains/fretboard/model/coordinates';
import { activeTheme } from '@/platform/composables/useTheme';
import { isClient } from '@/platform/utils/common';

import { DPR_FLOOR, getFretboardBoardLayer } from './fretboardBitmapCache';
import { useFretboardCanvasGeometry } from './useFretboardCanvasGeometry';
import { useFretboardCanvasTheme } from './useFretboardCanvasTheme';

import type { Chord } from '@/domains/chord/types';

interface Props {
  chord: Chord;
  /**
   * 显示倍率（默认 1 = 基准尺寸）—— **纯 CSS 侧的整体放大/缩小**。
   *
   * 它只改画布元素的 CSS 宽高与合成变换：位图与三层绘制始终按几何给出的基准单位画，
   * 再整体缩放到目标尺寸（位图另按固定参考分辨率存档，见 fretboardBitmapCache 的
   * REFERENCE_DISPLAY_SCALE）。
   * 因此**没有任何几何量随它变化** —— 想改指板本身的留白/字号，改基准几何，不要在这里乘系数。
   */
  scale?: number;
  isDarkMode?: boolean;
  /** 显式指板配色主题（缺省读取当前应用主题；导出面板传此值以固定匹配其背景，独立于应用明暗） */
  theme?: 'light' | 'dark' | 'high-contrast';
  shorthand?: boolean;
  /** 隐藏和弦名（默认显示） */
  hideChordName?: boolean;
  /**
   * 隐藏和弦名时是否仍**预留**名字版面（默认 false = 紧凑）。
   *
   * 传 true 时画布几何与「显示和弦名」逐像素一致，主体层位图因此与 picker 等显示名字的消费方
   * 共用同一批条目（名字像素本就不在主体层）；多出的顶部空白由本组件自行裁掉，故视觉不变。
   * 判据是 `!hideChordName || reserveChordName`（不能用 `?? ` 回退：Vue 会把未传的 boolean prop
   * 归一成 false，与显式传 false 无法区分），故本项仅对隐藏名字的消费方有意义。
   */
  reserveChordName?: boolean;
  /** 隐藏空弦○与静音×标记（默认显示） */
  hideOpenStringNotes?: boolean;
  /** 隐藏左侧品号数字（默认显示） */
  hideFretNumbers?: boolean;
  /** 隐藏加粗弦枕（默认显示；隐藏时为普通品丝线条粗细） */
  hideBoldNut?: boolean;
  /** 隐藏大横按（默认绘制；隐藏时只剩按弦圆点） */
  hideBarre?: boolean;
  /**
   * 是否忽略首末的空品格（默认 **false = 画满 fretCount 列的全指板**）。
   *
   * 必须由消费方**显式传入**才生效；开启后按实际用到的品位范围收紧品窗（不低于 MIN_FRET_COUNT 列）。
   * 属几何量（改变网格列数与窗口起点），故由 useFretboardCanvasGeometry 的 fretWindow 统一喂给
   * 布局、位图键与绘制三处。
   */
  trimEmptyEdgeFrets?: boolean;
  /**
   * `chord` 是否会被**就地修改**（引用不变、字段被逐个改写），需要深监听才能捕获。
   *
   * 默认 false：和弦库的保存路径总是**整对象替换**（filter/map 产出新对象、编辑走 cloneDeep 副本），
   * 引用变化即可判定重绘，浅比较足够。此组件在乐谱编辑器里按槽位数量实例化（成百个实例），
   * 深监听会让每个实例在 setup 与每次触发时都深度遍历整棵 chord（strings/barres/名字段），
   * 纯属白付且随实例数线性放大 —— 而 traverse 换来的信息（就地改写）在库里根本不存在。
   *
   * 只有把「会被原地编辑的草稿对象」直接传进来的消费方（工作台导出预览传 draftChord）才需置真。
   */
  mutableChord?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  scale: 1.0,
  isDarkMode: false,
  shorthand: false,
  hideChordName: false,
  hideOpenStringNotes: false,
  hideFretNumbers: false,
  hideBoldNut: false,
  hideBarre: false,
  trimEmptyEdgeFrets: false,
  mutableChord: false,
});

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');

// 配色解析与「配色来源变化即重绘」收在 composable 里（含 light ↔ high-contrast 那条只能靠
// activeTheme 接住的路径）；本组件只声明它从哪些 props 读配色来源
const { themeColors } = useFretboardCanvasTheme({
  theme: () => props.theme,
  isDarkMode: () => props.isDarkMode,
  onRedraw: () => draw(),
});

// 几何、CSS 尺寸、三层渲染选项与无障碍文案：纯派生，不依赖配色之外的外部状态
const {
  layout,
  baseWidth,
  baseHeight,
  nameReserveH,
  cssWidth,
  cssHeight,
  canvasStyle,
  ariaLabel,
  renderOptions,
  bodyRenderOptions,
} = useFretboardCanvasGeometry(props, () => themeColors.value);

/**
 * 位图 key：**只含主体层的输入** —— 指板状态（品位/横按/弦数）+ 配色主题 + **几何产物**。
 *
 * 几何那一段不逐位列开关，而是直接拼布局产物（宽 / 高 / 网格顶 / 首弦 x / 空弦标记位）：
 * 凡影响画布几何的开关（预留名字位 / 空弦标记 / 品号 / 是否画弦枕 / 品窗收紧）都必然改变
 * 这几个数之一，故**新增一个几何开关时不必回来补 key**。此前是把这些开关连品窗列数、首列右移量、
 * 弦枕状态逐一抄进 key，等于把「哪些开关进几何」写了第二遍 —— 漏一项就会命中错误位图。
 *
 * 仍须显式进 key 的只剩**不影响几何、只影响内容**的一项：hideBarre（画不画横按梁）。
 * 刻意不进 key 的两项（进了就等于把「显示」当成「内容」）：
 *  - 和弦名 / 简写：只影响名字层，属显示层文本；
 *  - 显示尺寸（scale）：位图按固定参考分辨率存档，显示时缩放，故与目标尺寸无关。
 * th 段记「实际生效的配色主题」：未显式指定时跟随应用主题，否则 light 与 high-contrast
 * 会共用同一 key，切主题时命中旧缓存、配色不更新。
 *
 * 曾经还有一段 `${isDarkMode ? 1 : 0}`，已删：位图配色只由 th 段（resolveFretboardCanvasPalette）
 * 决定，isDark 本身是 `activeTheme !== 'light'` 的派生量，三个取值与 th 一一对应，信息量为零；
 * 留着反而咬人 —— 不传 isDarkMode 的消费方（默认 false）在暗色应用下会为同一张位图多存一条。
 *
 * 横按段取 `computeBarresSignature`（唯一的横按签名实现）：它先按「品:起弦-止弦」逐条规范化再**排序**，
 * 故同一组横按无论数组顺序如何都落成同一个键。此前手写的 `join('|')` 不排序，语义相同的指法会算出
 * 两个键、白占两份位图（缺省档不含 finger —— 标指只画在气泡层，不进位图）。
 */
function getCacheKey(): string {
  const c = props.chord;
  const strings = c.strings ?? [];
  const strSig = strings.map(s => s.fret).join(',');
  const barreSig = computeBarresSignature(c.barres);
  const l = layout.value;
  const geomSig = `${l.width},${l.height},${l.gridTop},${l.startStrX},${l.markerCenterY}`;
  return `${strings.length || 6}_${geomSig}_${strSig}_${barreSig}_th${props.theme ?? activeTheme.value}_b${props.hideBarre ? 0 : 1}`;
}

const getDpr = () => {
  const userDpr = isClient ? window.devicePixelRatio || 1 : 1;
  return Math.max(userDpr, DPR_FLOOR);
};

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;

  const dpr = getDpr();
  const w = cssWidth.value;
  const h = cssHeight.value;
  if (w <= 0 || h <= 0) return;

  const physicalWidth = Math.round(w * dpr);
  const physicalHeight = Math.round(h * dpr);

  if (canvas.width !== physicalWidth) canvas.width = physicalWidth;
  if (canvas.height !== physicalHeight) canvas.height = physicalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, physicalWidth, physicalHeight);

  // 三层合成：名字层 → 主体层（位图，缩放到目标尺寸） → 品号层。
  // 逻辑坐标下绘制，故整体按 dpr × scale 缩放；位图按参考分辨率存档，由 drawImage 缩放到位
  ctx.save();
  ctx.scale(dpr * props.scale, dpr * props.scale);

  const opts = renderOptions.value;
  renderFretboardChordName(ctx, opts);

  // 位图按「预留名字位」的几何存档，贴图时整体上移 nameReserveH —— 目标矩形仍是位图原尺寸，
  // 多出的顶部由画布边界自然裁掉（位图不上移的那部分画在 y<0）。
  // 注意 dHeight 必须用 baseHeight：若改成 visibleHeight，drawImage 会把整张位图纵向压缩到该高度，
  // 指板就「被压扁」了（曾踩过）。名字层/品号层本就按可见（紧凑）布局绘制，故三层严丝合缝
  const trim = nameReserveH.value;
  const boardLayer = getFretboardBoardLayer({
    cacheKey: getCacheKey(),
    baseWidth: baseWidth.value,
    baseHeight: baseHeight.value,
    bodyOptions: bodyRenderOptions.value,
  });
  if (boardLayer) ctx.drawImage(boardLayer, 0, -trim, baseWidth.value, baseHeight.value);
  else {
    // 兜底（拿不到 2d 上下文）：必须与位图路径**逐像素等价** —— 位图按「预留名字位」的几何存档、
    // 再整体上移 trim 贴出，故这里也要用 bodyRenderOptions（带 reserveChordName）并施加同一段 -trim。
    // 此前传 `{ ...opts, reserveChordName: false }` 走紧凑布局，而显示名字时 trim 恰为 0
    // （nameReserveH 只在「预留但未绘制」时非零），兜底主体就比位图与品号层高出一个名字块。
    ctx.save();
    ctx.translate(0, -trim);
    renderFretboardBody(ctx, bodyRenderOptions.value);
    ctx.restore();
  }

  renderFretboardFretMarks(ctx, opts);
  ctx.restore();
}

onMounted(() => draw());

// 尺寸（scale）变化也在其中：位图与尺寸无关，故这里只重画名字/品号层 + 缩放贴图。
// deep 只在 mutableChord 时开启：默认的「引用变化即重绘」对整对象替换的库内和弦完全够用，
// 而 deep 会让每个实例在 setup 与每次触发时深度遍历整棵 chord（详见 mutableChord 的说明）。
// 配色相关的两条重绘触发在 useFretboardCanvasTheme 里，不在本列表内。
watch(
  [
    () => props.chord,
    () => props.scale,
    () => props.shorthand,
    () => props.hideChordName,
    () => props.reserveChordName,
    () => props.hideOpenStringNotes,
    () => props.hideFretNumbers,
    () => props.hideBoldNut,
    () => props.hideBarre,
    // 收紧空品格改变品窗几何（列数与窗口起点）⇒ 必须重绘。缺这一条时开关只在
    // 强制重建（刷新 / KeepAlive 重挂载）后才生效 —— 键变了但没人触发 draw()
    () => props.trimEmptyEdgeFrets,
  ],
  () => void draw(),
  { deep: props.mutableChord }
);
</script>
