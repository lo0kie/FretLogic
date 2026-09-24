<template>
  <canvas :aria-label :style="canvasStyle" class="pointer-events-none block select-none" ref="canvasRef" role="img" />
</template>

<script lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { getChordName } from '@/domains/chord/theory/theory';
import {
  CHORD_NAME_EDGE_PAD,
  computeFretboardLayout,
  nutIsDrawn,
  renderFretboardBody,
  renderFretboardChordName,
  renderFretboardFretMarks,
  resolveFretWindow,
} from '@/domains/fretboard/components/renderFretboardCanvas';
import { resolveFretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';
import { absoluteFretOffsetOf } from '@/domains/fretboard/model/fretGeometry';
import { activeTheme } from '@/platform/composables/useTheme';
import { createLruCache } from '@/platform/utils/cache';
import { observeVisibility } from '@/platform/utils/common';

import type { Chord } from '@/domains/chord/types';
import type { RenderFretboardOptions } from '@/domains/fretboard/components/renderFretboardCanvas';
import type { CSSProperties } from 'vue';

/**
 * 指板位图缓存 —— 必须声明在模块作用域（普通 <script>），不能写进 <script setup>：
 * <script setup> 的每条语句都会被编译进 setup()，在那里声明会退化成「每个组件实例各持一份缓存」，
 * 而实例卸载时既不反注册也不清空 → 注册表按同名聚合成百上千条、位图被闭包钉住无法回收。
 * 放模块级后所有实例共享同一份。
 *
 * 缓存内容是**主体层**（网格线 / 空弦静音标记 / 横按梁 / 按弦圆点，见 renderFretboardBody）。
 * 它的 key 里没有和弦名、简写，也没有显示尺寸，因为：
 *  1. 名字属「名字层」、品号与弦枕属「品号层」，每次绘制现画。改名、切「符号简写」、
 *     换品位窗口都不再作废位图 —— 原先「切简写整屏重画、128 名额被死条目吃满」
 *     就是这么来的；
 *  2. **「画不画名字」与「名字占不占位」是两件事**：前者属名字层，后者才是几何。要隐藏名字的
 *     消费方（变体面板 / 和弦库模态框）传 show-chord-name=false + reserve-chord-name，几何便与
 *     picker 完全一致 → 命中同一批条目；本组件再按 layout.nameReserveH 裁掉预留段，视觉不变。
 *     （不传 reserve-chord-name 时缺省跟随 showChordName，即改造前的紧凑几何，故既有调用零影响。）
 *     **几何类开关（含品位窗口）不必逐列进 key**：key 的几何段直接由布局产物拼出（见 getCacheKey），
 *     弦枕位就是几何 —— 弦枕画了才占位（判据见 nutIsDrawn），零品窗口那张图比偏移窗口那张多一条
 *     弦枕、网格顶与整图高度都不同，布局值随之变、key 自然跟着变。这是「空弦标记上下两段留白在
 *     所有窗口里都同值」的代价：换来的是偏移窗口不再凭空多出一整条弦枕的空白；
 *  3. 位图按固定参考分辨率（CACHE_PX_PER_UNIT）渲染，显示时由 drawImage 缩放到目标尺寸。
 *     于是同一指板状态只有一张位图：picker（1.6×）/ 乐谱**编辑器槽位**（1.4×缩放）/ 工作台导出
 *     面板与变体面板，无论各自显示多大都命中同一批条目 —— 条目数 = 指法数，而不是
 *     「指法 × 尺寸档数」，尺寸维度带来的整屏换血（拖缩放滑杆 = 120 写 + 120 淘汰）随之消失。
 *     （唯一例外：工作台导出面板把配色钉死在背景上，应用主题与背景明暗不一致时是另一张图。）
 * 容量 256：条目数 = 指法数（尺寸维度已被合并掉），故这里实际是「同时被画过的指法数上限」。
 * 单个乐库的指法量级（几百）之下留足余量，配合固定参考分辨率，稳态即命中全满、不再抖动。
 * 代价是内存上限随容量线性上升：单条 5 品指板约 0.38MB（口径见 REFERENCE_DISPLAY_SCALE），
 * 256 条封顶约 98MB（实测平均指板更小，约 280KB/条 → 约 70MB）。本参数是「抗淘汰」的、
 * 不是「省内存」的；要压内存请动 REFERENCE_DISPLAY_SCALE，不要靠缩小容量去换 churn。
 *
 * 【只服务主线程 DOM 侧，与乐谱「导出 / 分页预览」不是同一实例】
 * 乐谱分页预览与导出由渲染线程整页渲染（scoreExportWorker 的 fretboardRasterCache），
 * 那边位图是「主体 + 和弦名 + 品号」整条光栅，键里必须带和弦名、fretOffset 与「和弦缩放」后的
 * 几何，再与页面 PIXEL_RATIO 1:1 贴图；本缓存相反 —— 只存主体层（名字层/品号层每次现画）、
 * 固定参考分辨率存一份、显示时缩放。两者粒度都不同，故同一指板在两侧各光栅化一次、各占一份内存，
 * 互不命中，这是当前设计的结果。主线程消费方：ChordPickerPanel / ChordModalsContainer /
 * ChordSlot（乐谱编辑器槽位，与和弦库真共享）/ WorkbenchExportPanel / WorkbenchVariantsPanel。
 *
 * 【内存配额】位图缓存另设一条字节口径上限，与上面的条数上限**并列**生效，任一先到即驱逐。
 *
 * 补这条口径的原因：条数只说得出「同时画过多少张」，说不出「占了多少内存」。单条按 w×h×4 算，
 * 5 品指板约 0.38MB、24 品指板能到 2MB 以上（差一个量级），于是同样 256 条，真实占用可在
 * 70MB 到 500MB 之间漂 —— 配额把天花板钉在字节上，条目多大都不越界。
 *
 * 96MiB 的来由：约等于上面「容量 256」那段估出的最坏值（256 条 × 单条 5 品 0.38MB ≈ 98MB）。
 * 实测平均约 280KB/条（256 条 ≈ 70MB），故常规尺寸下配额**不介入**、不新增淘汰；
 * 只有条目显著偏大（长品窗 / 高 DPR）时才提前挡一刀。它是一道显式的内存天花板，
 * 不是一次「顺手压内存」的收紧 —— 要主动降内存仍请动 REFERENCE_DISPLAY_SCALE，
 * 不要靠调小本值去换 churn（理由见上）。
 */
const BITMAP_CACHE_MAX_BYTES = 96 * 1024 * 1024;

const bitmapCache = createLruCache<ImageBitmap | HTMLCanvasElement>(256, {
  name: '指板位图',
  // 位图本体即解码后的 RGBA 像素：w×h×4 字节（开发面板字节读数 + 内存配额口径）
  weigh: (_, item) => item.width * item.height * 4,
  maxBytes: BITMAP_CACHE_MAX_BYTES,
  onEvict: (_key, item) => {
    if ('close' in item && typeof item.close === 'function') item.close();
  },
});

// 本模块被 HMR 替换时即刻归还旧缓存里的位图（close 底层内存），但**不反注册**：
// HMR 未必会让已挂载的组件实例重建（找不到实例时 reload 被跳过），它可能继续用旧模块闭包里的
// 这份缓存读写 —— 一旦反注册，那之后的写入就全部进不了开发面板（表现为「指板位图永远是 0」）。
// 注册表那边另有一道闸门：新实例登记时把同名旧条目移出，故不会残留重复条目。
if (import.meta.hot) import.meta.hot.dispose(() => bitmapCache.clear());

/** 设备像素比下限：低于此值的屏幕也按此倍数渲染，保证 1x 屏的线条不发虚 */
const DPR_FLOOR = 2.5;
/**
 * 位图参考分辨率（物理像素 / 逻辑像素）：与「当前显示多大」无关，显示时再缩放到目标尺寸。
 *
 * **这是全模块唯一一处「用清晰度换内存」的旋钮**，因为位图内存按本值的**平方**增长：
 * 由 1.6（4.0 px/单位）降到 1.4（3.5）后，单张 5 品指板 0.5MB → 0.38MB，
 * 256 条封顶 128MB → 98MB，**省 23%**；代价是各消费方由「接近 1:1」转为轻量上采样：
 *  - 乐谱编辑器槽位（1.4）：恰好 1:1，零重采样；
 *  - picker（1.6，唯一「一屏 120 张」的消费方）：约 1.14 倍；
 *  - 工作台 / 变体弹窗 / 导出预览（1.8）：约 1.29 倍；
 *  - 乐谱槽位到「和弦缩放 150%」时（1.4 × 1.5 = 2.1）：约 1.5 倍 —— 线条略软，肉眼基本无感。
 *
 * **继续往下只有一档可走（1.2 / 3.0 px/单位，再省 26%），之后就得不偿失**：
 * 判据是「缓存分辨率 ≥ DPR_FLOOR × 消费方缩放」，低于即全线上采样。
 * 最细的元素是**网格线（1 逻辑px）**，它在本值下只有 3.5 物理px；
 * 降到 1.2 后 picker 要放大 1.33 倍、工作台 1.5 倍，网格线的抗锯齿过渡带开始被肉眼分辨
 * （圆点 7.6px 直径、横按梁、弦枕都还富余 2 倍以上，不受影响）；
 * 降到 1.0（2.5）时槽位也要放大 1.4 倍，线条会出现「雾感」，不建议。
 * 上采样本身走的是高质量插值（合成时 imageSmoothingQuality='high'），不会出现断裂或锯齿。
 * 若哪天觉出糊，把本值调回 1.6（内存 +31%）或 1.8（+65%）。
 */
const REFERENCE_DISPLAY_SCALE = 1.4;
const CACHE_PX_PER_UNIT = DPR_FLOOR * REFERENCE_DISPLAY_SCALE;
</script>

<script setup lang="ts">
interface Props {
  chord: Chord;
  /**
   * 显示倍率（默认 1 = 基准尺寸）—— **纯 CSS 侧的整体放大/缩小**。
   *
   * 它只改画布元素的 CSS 宽高与合成变换：位图与三层绘制始终按几何给出的基准单位画，
   * 再整体缩放到目标尺寸（位图另按固定参考分辨率存档，见 REFERENCE_DISPLAY_SCALE）。
   * 因此**没有任何几何量随它变化** —— 想改指板本身的留白/字号，改基准几何，不要在这里乘系数。
   */
  scale?: number;
  isDarkMode?: boolean;
  /** 显式指板配色主题（缺省读取当前应用主题；导出面板传此值以固定匹配其背景，独立于应用明暗） */
  theme?: 'light' | 'dark' | 'high-contrast';
  shorthand?: boolean;
  /** 是否显示和弦名（默认 true） */
  showChordName?: boolean;
  /**
   * 隐藏和弦名时是否仍**预留**名字版面（默认 false = 紧凑）。
   *
   * 传 true 时画布几何与「显示和弦名」逐像素一致，主体层位图因此与 picker 等显示名字的消费方
   * 共用同一批条目（名字像素本就不在主体层）；多出的顶部空白由本组件自行裁掉，故视觉不变。
   * 判据是 `showChordName || reserveChordName`（不能用 `?? ` 回退：Vue 会把未传的 boolean prop
   * 归一成 false，与显式传 false 无法区分），故本项仅对隐藏名字的消费方有意义。
   */
  reserveChordName?: boolean;
  /** 是否显示空弦○与静音×标记（默认 true） */
  showOpenStringNotes?: boolean;
  /** 是否显示左侧品号数字（默认 true） */
  showFretNumbers?: boolean;
  /** 是否显示加粗弦枕（默认 true；false 时为普通品丝线条粗细） */
  showBoldNut?: boolean;
  /** 是否绘制大横按（默认 true；false 时隐藏横按梁，仅保留按弦圆点） */
  showBarre?: boolean;
  /**
   * 是否忽略首末的空品格（默认 **false = 画满 fretCount 列的全指板**）。
   *
   * 必须由消费方**显式传入**才生效；开启后按实际用到的品位范围收紧品窗（不低于 MIN_FRET_COUNT 列）。
   * 属几何量（改变网格列数与窗口起点），故由 fretWindow 统一喂给布局、位图键与绘制三处。
   */
  trimEmptyEdgeFrets?: boolean;
  /** 懒绘制：挂载后不立即绘制，等元素滚入视口才首绘一次；后续参数变化正常重绘。
   *  DOM 尺寸始终由本组件按 scale/fretCount 计算确定，无需外部占位与测量 */
  lazy?: boolean;
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
  showChordName: true,
  showOpenStringNotes: true,
  showFretNumbers: true,
  showBoldNut: true,
  showBarre: true,
  trimEmptyEdgeFrets: false,
  lazy: false,
  mutableChord: false,
});

const canvasRef = ref<HTMLCanvasElement | null>(null);

/**
 * 实际品窗：开启收紧时按「实际用到的品位范围」收紧（不低于 MIN_FRET_COUNT 列），否则原样取 fretCount。
 *
 * 布局、位图键、绘制三处共用这一份。位图键里放的是**收紧结果**而非开关本身，于是几何本就无空列
 * 可裁的指法在切换开关时 key 不变、位图不重渲 —— 这就是「阻止本身没有空品格的指法重渲染」的落点。
 */
const fretWindow = computed(() => resolveFretWindow(props.chord, props.trimEmptyEdgeFrets));
const fretCount = computed(() => fretWindow.value.drawFretCount);

/** 名字位是否预留：显示名字时必然预留（几何即现状），隐藏名字时由 reserveChordName 显式要求 */
const reserveName = computed(() => props.showChordName || props.reserveChordName);

/**
 * 本图是否真的画出加粗弦枕（= 显示开关 且 绝对品位偏移落在零品窗口，判据见 nutIsDrawn）。
 *
 * 它进几何：弦枕画了才占位，不画时指板顶（与整张图）上移一条弦枕 —— 空弦标记到指板顶那段留白
 * 因此与上方的同值。绝对偏移要用**收紧后**的首列右移量，否则「收紧到不再从第 1 品开始」的指法
 * 会按未收紧的窗口误判成画弦枕（绘制侧 drawNut 读的正是同一个绝对偏移）。
 */
const boldNut = computed(() =>
  nutIsDrawn(props.showBoldNut, absoluteFretOffsetOf(props.chord.fretOffset, fretWindow.value.leadTrim))
);

const layout = computed(() =>
  computeFretboardLayout({
    stringCount: props.chord.strings?.length || 6,
    fretCount: fretCount.value,
    showChordName: props.showChordName,
    reserveChordName: reserveName.value,
    showOpenStringNotes: props.showOpenStringNotes,
    showFretNumbers: props.showFretNumbers,
    boldNut: boldNut.value,
  })
);
const baseWidth = computed(() => layout.value.width);
const baseHeight = computed(() => layout.value.height);

/**
 * 顶部需裁掉的「预留名字位」高度（逻辑px；常规显隐组合下为 名字区块高 - 顶部留白，即名字字号，
 * 也就是名字内容那一段 —— 两套布局的顶部留白同为上下留白（EDGE_PAD），差额只剩名字本身）。
 * 位图按预留布局存档（与显示名字的消费方同源），这里把多出的空白裁掉，视觉与本组件改造前一致。
 */
const nameReserveH = computed(() => layout.value.nameReserveH);
/** 可见高度 = 位图高度 − 预留空白；位图/各层坐标系都按它收敛 */
const visibleHeight = computed(() => baseHeight.value - nameReserveH.value);

const cssWidth = computed(() => Math.round(baseWidth.value * props.scale));
const cssHeight = computed(() => Math.round(visibleHeight.value * props.scale));

const canvasStyle = computed<CSSProperties>(() => ({
  width: `${cssWidth.value}px`,
  height: `${cssHeight.value}px`,
}));

const displayChordName = computed(() => getChordName(props.chord, { shorthand: props.shorthand }));
const ariaLabel = computed(() => `吉他和弦 ${displayChordName.value}`);

// 画布配色：从 tokens.scss 的 --fbc-* 变量运行时解析（canvas 2D 无法直接消费 var()）；
// 传了显式 theme 则按其解析（导出面板固定背景配色），否则读取当前应用主题（含 high-contrast）
const resolveThemeColors = () =>
  props.theme ? resolveFretboardCanvasPalette(props.theme) : resolveFretboardCanvasPalette();
const themeColors = ref(resolveThemeColors());

/** 三层共用的渲染选项：合成时按层分别调用，故集中构造一次 */
const renderOptions = computed<RenderFretboardOptions>(() => ({
  chord: props.chord,
  colors: themeColors.value,
  shorthand: props.shorthand,
  showChordName: props.showChordName,
  // 名字可用宽度（逻辑 px）＝画布宽 − 两侧留白。本组件是**固定尺寸**的缩略图：宽度由布局
  // （弦数 × 品数）定死，picker 三列网格、谱面行内槽位都靠这套等宽几何对齐，不能因为某个名字
  // 太长就把画布加宽（那会顶开整列 / 让歌词字符错位）。故这里把可用宽交给名字层**缩字号贴合**，
  // 而不是像导出 PNG 那样按名字宽度扩画布 —— 两边口径不同是有意的，理由见 CHORD_NAME_EDGE_PAD。
  // 主体层与品号层不读本项（它只影响名字层），与 reserveChordName 一样不参与位图键。
  chordNameMaxWidth: baseWidth.value - CHORD_NAME_EDGE_PAD * 2,
  showOpenStringNotes: props.showOpenStringNotes,
  showFretNumbers: props.showFretNumbers,
  showBoldNut: props.showBoldNut,
  showBarre: props.showBarre,
  trimEmptyEdgeFrets: props.trimEmptyEdgeFrets,
}));

/**
 * 主体层专用选项：只多一项 reserveChordName（= 预留名字位）。
 *
 * 名字层与品号层**不能**带上它 —— 它们直接画进可见画布，必须按「实际可见布局」定位
 * （名字不画则紧凑），而位图会被裁掉预留段后才贴，故两者恰好对齐。
 */
const bodyRenderOptions = computed<RenderFretboardOptions>(() => ({
  ...renderOptions.value,
  reserveChordName: reserveName.value,
}));

const getDpr = () => {
  const userDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.max(userDpr, DPR_FLOOR);
};

/**
 * 位图 key：**只含主体层的输入** —— 指板状态（品位/横按/弦数）+ 配色主题 + **几何产物**。
 *
 * 几何那一段不逐位列开关，而是直接拼布局产物（宽 / 高 / 网格顶 / 首弦 x / 空弦标记位）：
 * 凡影响画布几何的开关（预留名字位 / 空弦标记 / 品号 / 是否画弦枕 / 品窗收紧）都必然改变
 * 这几个数之一，故**新增一个几何开关时不必回来补 key**。此前是把这些开关连品窗列数、首列右移量、
 * 弦枕状态逐一抄进 key，等于把「哪些开关进几何」写了第二遍 —— 漏一项就会命中错误位图。
 *
 * 仍须显式进 key 的只剩**不影响几何、只影响内容**的一项：showBarre（画不画横按梁）。
 * 刻意不进 key 的两项（进了就等于把「显示」当成「内容」）：
 *  - 和弦名 / 简写：只影响名字层，属显示层文本；
 *  - 显示尺寸（scale）：位图按固定参考分辨率存档，显示时缩放，故与目标尺寸无关。
 * th 段记「实际生效的配色主题」：未显式指定时跟随应用主题，否则 light 与 high-contrast
 * 会共用同一 key，切主题时命中旧缓存、配色不更新。
 *
 * 曾经还有一段 `${isDarkMode ? 1 : 0}`，已删：位图配色只由 th 段（resolveFretboardCanvasPalette）
 * 决定，isDark 本身是 `activeTheme !== 'light'` 的派生量，三个取值与 th 一一对应，信息量为零；
 * 留着反而咬人 —— 不传 isDarkMode 的消费方（默认 false）在暗色应用下会为同一张位图多存一条。
 */
function getCacheKey(): string {
  const c = props.chord;
  const strings = c.strings ?? [];
  const strSig = strings.map(s => s.fret).join(',');
  const barreSig = (c.barres ?? []).map(b => `${b.fret}:${b.fromString}-${b.toString}`).join('|');
  const l = layout.value;
  const geomSig = `${l.width},${l.height},${l.gridTop},${l.startStrX},${l.markerCenterY}`;
  return `${strings.length || 6}_${geomSig}_${strSig}_${barreSig}_th${props.theme ?? activeTheme.value}_b${props.showBarre ? 1 : 0}`;
}

/**
 * 取主体层位图源：命中直接返回；未命中则按参考分辨率新画一张离屏画布，
 * 本次绘制先用这张画布（与随后落地的位图逐像素同源，故无闪烁），
 * 同时异步转成 ImageBitmap 入缓存 —— ImageBitmap 更利于反复 drawImage，
 * 且淘汰时 onEvict 的 close() 能立即归还底层内存。
 */
function getBoardLayer(): CanvasImageSource | null {
  const cacheKey = getCacheKey();
  const cached = bitmapCache.get(cacheKey);
  if (cached) return cached;

  const layer = document.createElement('canvas');
  layer.width = Math.max(1, Math.round(baseWidth.value * CACHE_PX_PER_UNIT));
  layer.height = Math.max(1, Math.round(baseHeight.value * CACHE_PX_PER_UNIT));
  const ctx = layer.getContext('2d');
  if (!ctx) return null;

  ctx.scale(CACHE_PX_PER_UNIT, CACHE_PX_PER_UNIT);
  // 用 bodyRenderOptions（带 reserveChordName）：位图始终按「预留名字位」的几何存档，
  // 无论本消费方画不画名字 —— 这是与 picker 共用同一批条目的关键
  renderFretboardBody(ctx, bodyRenderOptions.value);

  if (typeof createImageBitmap === 'function')
    // 离屏画布在此之后不再被本实例引用的内容改写，故无需复核 key：它与 key 一一对应。
    // 但要防「同一 key 有两个 promise 在途」（同一帧内该实例被绘制两次，前一张位图尚未落地）：
    // 若后落地者直接覆盖，LRU 会 onEvict 掉前一张 —— 而前一张可能已被别的命中路径 drawImage 过，
    // 已 close 的 ImageBitmap 再用于绘制会抛 InvalidStateError（指板整块不显示）。
    // 保留先落地者、把后来者关掉。用 has 判断（不计数），免得把这类探测算进面板的命中率。
    void createImageBitmap(layer)
      .then(bmp => {
        if (bitmapCache.has(cacheKey)) {
          bmp.close();
          return;
        }
        bitmapCache.set(cacheKey, bmp);
      })
      .catch(() => {
        if (!bitmapCache.has(cacheKey)) bitmapCache.set(cacheKey, layer);
      });
  else
    // 不支持 createImageBitmap 的环境（如部分老浏览器）：直接把画布当位图源
    bitmapCache.set(cacheKey, layer);

  return layer;
}

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
  const boardLayer = getBoardLayer();
  if (boardLayer) ctx.drawImage(boardLayer, 0, -trim, baseWidth.value, baseHeight.value);
  else renderFretboardBody(ctx, { ...opts, reserveChordName: false }); // 兜底：按可见布局直画

  renderFretboardFretMarks(ctx, opts);
  ctx.restore();
}

// 懒绘制状态：lazy 模式下首绘前为 false，期间参数变化不触发绘制（画了也看不见）
const hasDrawn = ref(!props.lazy);
let stopLazyObserver: (() => void) | null = null;

onMounted(() => {
  if (!props.lazy) {
    draw();
    return;
  }
  // 滚入视口才首绘；IntersectionObserver 会考虑祖先滚动容器的裁剪，
  // 故无需向调用方索要滚动根。首绘后停止观察，后续重绘走 watch 与 LRU 缓存
  const el = canvasRef.value;
  if (!el) {
    hasDrawn.value = true;
    draw();
    return;
  }
  stopLazyObserver = observeVisibility(el, visible => {
    if (!visible) return;
    stopLazyObserver?.();
    stopLazyObserver = null;
    hasDrawn.value = true;
    draw();
  });
});

onBeforeUnmount(() => {
  stopLazyObserver?.();
  stopLazyObserver = null;
});

// 主题切换时重新解析配色再重绘（应用主题变化经 isDarkMode 联动；显式 theme 由导出面板传入）
watch([() => props.isDarkMode, () => props.theme], () => {
  themeColors.value = resolveThemeColors();
  if (hasDrawn.value) draw();
});

// 未显式指定 theme 时配色跟随应用主题。仅靠 isDarkMode 监听接不住 light ↔ high-contrast：
// 两者都算「非 dark」，isDarkMode 不变，但 --fbc-* 与 high-contrast 配色是不同的。
// 显式指定了 theme 的场合（导出面板固定白/暗底）不受应用主题影响，故跳过。
watch(activeTheme, () => {
  if (props.theme) return;
  themeColors.value = resolveThemeColors();
  if (hasDrawn.value) draw();
});

// 尺寸（scale）变化也在其中：位图与尺寸无关，故这里只重画名字/品号层 + 缩放贴图。
// deep 只在 mutableChord 时开启：默认的「引用变化即重绘」对整对象替换的库内和弦完全够用，
// 而 deep 会让每个实例在 setup 与每次触发时深度遍历整棵 chord（详见 mutableChord 的说明）。
watch(
  [
    () => props.chord,
    () => props.scale,
    () => props.shorthand,
    () => props.showChordName,
    () => props.reserveChordName,
    () => props.showOpenStringNotes,
    () => props.showFretNumbers,
    () => props.showBoldNut,
    () => props.showBarre,
    // 收紧空品格改变品窗几何（列数与窗口起点）⇒ 必须重绘。缺这一条时开关只在
    // 强制重建（刷新 / KeepAlive 重挂载）后才生效 —— 键变了但没人触发 draw()
    () => props.trimEmptyEdgeFrets,
  ],
  () => {
    if (!hasDrawn.value) return;
    draw();
  },
  { deep: props.mutableChord }
);
</script>
