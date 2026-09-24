<template>
  <!-- 形变中：自绘 svg，path 的 d 逐帧由补间给出（线段登记表见 iconMorph.ts、通用兜底见 iconMorphFlubber.ts）。
       只在「可补间、且正在补间」时走这一支 —— 其余情况一律渲染图标组件本身，
       故本分支不会改变任何图标的既有渲染结果。补间首尾两帧与两侧图标的几何逐子路径等价，
       故与组件分支互相切换时不会有跳变。 -->
  <svg
    v-bind="{ 'aria-hidden': 'true', ...$attrs }"
    v-if="morphPaths"
    :class="['base-icon shrink-0 align-middle', { 'animate-spin': spin }]"
    :data-icon-stroke="iconStroke !== undefined ? '' : undefined"
    :style="customStyle"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-width="2"
    viewBox="0 0 24 24"
  >
    <path v-for="(d, i) in morphPaths" :d :key="i" />
  </svg>

  <component
    v-bind="{ 'aria-hidden': 'true', ...$attrs }"
    v-else-if="resolvedComponent"
    :class="['base-icon shrink-0 align-middle', { 'animate-spin': spin }]"
    :data-icon-stroke="iconStroke !== undefined ? '' : undefined"
    :is="resolvedComponent"
    :style="customStyle"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch, watchEffect } from 'vue';

import { EASE_STANDARD } from '@/platform/utils/constants';
import { logger } from '@/platform/utils/logger';
import { compileEasing, prefersReducedMotion } from '@/platform/utils/motion';

import { morphPairOf, morphSegments, pairSegments, segmentToPath } from './iconMorph';
import { ICON_REGISTRY, MORPHABLE_ICON_NAMES } from './icons.registry';
import { resolveIconSize, resolveIconStroke } from './iconSizes';

import type { MorphPair } from './iconMorph';
import type * as IconMorphModule from './iconMorphFlubber';
import type { IconName } from './icons.registry';
import type { IconSizeValue, IconStrokeValue } from './iconSizes';
import type { CSSProperties } from 'vue';

export interface BaseIconProps {
  /** 图标名称（具备完整的 TypeScript 自动补全提示） */
  name: IconName;
  /**
   * 图标尺寸（默认 '1em'，跟随所在行字号）：
   * - 预设档位：'xs'(12) | 'sm'(14) | 'md'(16) | 'lg'(18) | 'xl'(20) | '2xl'(26) | '3xl'(38)，见 ICON_SIZE_PRESETS
   * - 数字（如 22）：自动转换为 22px（非常规档位例外）
   * - 其它字符串（如 '14px', '1.2rem'）：直接生效
   *
   * 命名带 icon 前缀，以区别于各业务组件的 `size`（组件自身尺寸档位）。
   */
  iconSize?: IconSizeValue;
  /**
   * 图标描边粗细（针对 Lucide 等描边类图标）：
   * - 预设档位：'thin'(2.2) | 'regular'(2.5) | 'bold'(3)，见 ICON_STROKE_PRESETS
   * - 数字（如 3）：自动转换为 px
   * - 字符串（如 '2.5px'）：直接生效
   */
  iconStroke?: IconStrokeValue;
  /** 图标颜色，默认 currentColor */
  color?: string;
  /** 旋转角度（如 90, 180） */
  rotate?: number;
  /** 是否添加旋转动画（用于加载中状态） */
  spin?: boolean;
  /**
   * 是否**关闭**图标名变化时的**线条级形变**（默认 false，即形变默认开）：形变会让旧图标的笔画
   * 就地变形为新图标，而不是把旧图标换掉、新图标出现。
   *
   * 形变分两档，按优先级取用：
   * - **登记档**（`iconMorph.ts`）：人工登记的段级配对，几何精确，覆盖少数几对；
   * - **通用档**（`iconMorphFlubber.ts`）：只要两个图标都登记了原始 SVG（`MORPHABLE_ICON_NAMES`），
   *   就按 flubber 的形状匹配补间。
   * 两档都未命中时直接切换 —— 少一个动画，不能少一个图标。
   *
   * 取「关闭」这一向而不是 `morph = true`：默认开的开关用正向命名时，唯一的写法是 `:morph="false"`，
   * 而默认关的开关在模板里能写成无值的 `morph-disable` —— 与全项目其它布尔属性同一种读法。
   */
  morphDisable?: boolean;
}

// 两个分支各自手动绑 $attrs（且默认 aria-hidden 必须可被调用方覆盖），关掉自动继承以免同一批
// attrs 被绑两次 —— 两次绑定会让 class 在元素上重复一份（mergeProps 对 class 是拼接而非覆盖）。
defineOptions({ inheritAttrs: false });

const {
  name,
  iconSize = '1em',
  iconStroke = undefined,
  color = undefined,
  rotate = undefined,
  spin = false,
  morphDisable = false,
} = defineProps<BaseIconProps>();

// 无障碍契约：图标默认是装饰性的（模板里 aria-hidden 默认 'true'），但**必须允许调用方覆盖**。
// 模板用 `v-bind="{ 'aria-hidden': 'true', ...$attrs }"`——默认值在前、$attrs 在后，
// 显式传入的 aria-hidden / role / tabindex 才能生效。此前写成静态 aria-hidden="true" 且排在
// v-bind="$attrs" 之后，调用方传什么都盖不住它：图标被永久移出无障碍树，即便外面配了
// role="button" + tabindex 也只是「可聚焦但对辅助技术不存在」（BaseSelector 的标签删除按钮即此形态）。
const resolvedComponent = computed(() => ICON_REGISTRY[name] || null);

// 未注册的图标名（拼写错误 / 后端动态返回的图标名强转为 IconName）会静默渲染成空白，
// 既看不出"没传"也看不出"传错"，排查成本极高——开发期显式告警。
// 用 watchEffect 而非 setup 内一次性判断：图标名可能随数据动态变化。
if (import.meta.env.DEV)
  watchEffect(() => {
    if (name && !resolvedComponent.value)
      logger.warn('BaseIcon', `图标名 "${name}" 未在 ICON_REGISTRY 中注册，图标不会渲染`);
  });

const customStyle = computed<CSSProperties>(() => {
  const style: CSSProperties = {};

  // iconSize 默认 '1em'，恒有值——原 `!== undefined` 判断恒真且易误导为"存在不设尺寸的路径"，故直接解析
  const formattedSize = resolveIconSize(iconSize);
  style.width = formattedSize;
  style.height = formattedSize;
  style.fontSize = formattedSize;

  if (iconStroke !== undefined) style.strokeWidth = resolveIconStroke(iconStroke);

  if (color) style.color = color;

  if (rotate !== undefined) style.transform = `rotate(${rotate}deg)`;

  return style;
});

/**
 * 形变时长（ms）：与 tokens 的 --duration-base 同档 —— 图标形变属于局部状态切换，
 * 与同一处控件的背景色 / 边框过渡同时长，两者才不会一前一后。
 */
const MORPH_DURATION_MS = 180;

/**
 * 补间缓动：编译 constants.ts 的 EASE_STANDARD（与 --bezier-standard 同一条曲线）。
 * 在模块级编译一次复用 —— 曲线是常量，没有理由让每个实例各跑一遍牛顿迭代。
 *
 * 为什么必须自己求值而不能交给 CSS：补间改的是 SVG 的 d 属性，而 d 不是可插值属性
 * （CSS d 插值 Firefox 至今不支持），transition 驱动不了它。
 */
const MORPH_EASING = compileEasing(EASE_STANDARD);

/** 正在补间的来源；null = 不补间（渲染图标组件本身） */
type MorphSource =
  { kind: 'segments'; pairs: readonly MorphPair[] } | { kind: 'flubber'; morph: IconMorphModule.IconMorphRuntime };

const morphSource = shallowRef<MorphSource | null>(null);
/** 补间进度：0 = 起点，1 = 终点。非补间期恒为 1（终态） */
const progress = ref(1);

const morphPaths = computed<string[] | null>(() => {
  const source = morphSource.value;
  if (!source) return null;
  return source.kind === 'segments'
    ? morphSegments(source.pairs, progress.value).map(segmentToPath)
    : source.morph.at(progress.value);
});

/**
 * flubber 引擎模块：懒加载一次并缓存。
 *
 * 为什么必须懒加载：flubber 打包 18.6KB gzip（外加图标原始 SVG），而首屏预算只剩约 30KB，
 * 静态引入即可能被 `pnpm build:budget` 拦下。因此本模块**只经动态 `import()` 进入**。
 *
 * 代价是「chunk 还没到就发生了形变」这一次会退化成直接切换，故有 {@link loadMorphEngine} 的预热：
 * 首屏挂着的可形变图标提前把它拉下来。
 *
 * 模块类型取自上面那条 `import type * as`（而非 `typeof import('…')`——后者被
 * `@typescript-eslint/consistent-type-imports` 禁止）。两条都不会产生运行时 import，
 * 动态 `import()` 仍是进入该 chunk 的唯一入口。
 */
type MorphEngineModule = typeof IconMorphModule;

let morphEngine: MorphEngineModule | null = null;
let morphEngineLoading = false;

const loadMorphEngine = (): MorphEngineModule | null => {
  if (!morphEngine && !morphEngineLoading) {
    morphEngineLoading = true;
    void import('./iconMorphFlubber')
      .then(module => {
        morphEngine = module;
      })
      // 加载失败（离线 / chunk 404）按「不形变」处理：引擎保持 null，标志复位后下次可重试
      .catch(() => undefined)
      .finally(() => {
        morphEngineLoading = false;
      });
  }
  return morphEngine;
};

/** 可形变图标名集合：判断「是否值得预热引擎」必须同步可得，故名单本身留在首屏模块里 */
const MORPHABLE = new Set<string>(MORPHABLE_ICON_NAMES);

// 首屏就存在的可形变图标（如顶栏的同步目标图标）提前预热，使**第一次**切图标就有动画。
// 名单外的图标不预热：绝大多数会话从头到尾不会发生形变，不该为它付这 18.6KB。
if (MORPHABLE.has(name)) loadMorphEngine();

let rafId = 0;

const stopAnimation = (): void => {
  if (rafId !== 0) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
};

const runMorph = (source: MorphSource): void => {
  // 减弱动效偏好下不播：形变是纯装饰，用户明确要求减弱时不该仍逐帧跑。
  // 缓动编译失败（EASE_STANDARD 被改成不支持的写法）同样不播 —— 宁可没动画，不可卡在中间态。
  // 两者都表现为「不设 morphSource」，于是直接渲染图标组件本身、落点就是终态。
  const easing = MORPH_EASING;
  if (!easing || prefersReducedMotion()) return;

  morphSource.value = source;
  progress.value = 0;

  // 起点取**首帧的时间戳**，不取 performance.now()：rAF 的 now 与 performance.now() 按规范同源于
  // timeOrigin，但并非所有环境都真的对齐（jsdom 下两者相差上千毫秒），混用会让首帧算出负进度、
  // 几何被外推到画面之外。两端取同一个时钟就没有这个前提。
  let startedAt = 0;
  const step = (now: number): void => {
    if (startedAt === 0) startedAt = now;
    const raw = Math.min(1, (now - startedAt) / MORPH_DURATION_MS);
    progress.value = easing(raw);
    if (raw < 1) rafId = requestAnimationFrame(step);
    else {
      rafId = 0;
      // 终态与目标图标的几何逐子路径等价，故切回组件分支不会闪
      morphSource.value = null;
    }
  };
  rafId = requestAnimationFrame(step);
};

// 形变由**图标名变化**驱动（调用方只需换 name，不必声明两个图标与开关值）。
// 挂载时不补间：初次渲染没有「上一个图标」，也没有补间的必要。
watch(
  () => name,
  (next, prev) => {
    // 形变途中又换名：线段档以**当前这一帧的段**为起点重新配对（直接沿用登记表的起点段会跳回起点图标）。
    // flubber 档不做续接 —— 那需要把任意点环重新配成一条新通道，收益远不抵复杂度；停到当前帧重新起手即可。
    const inFlight =
      morphSource.value?.kind === 'segments' ? morphSegments(morphSource.value.pairs, progress.value) : null;
    stopAnimation();
    morphSource.value = null;

    if (morphDisable || prev === undefined || prev === next) return;

    const pairs = morphPairOf(prev, next);
    if (pairs) {
      runMorph({
        kind: 'segments',
        pairs: inFlight
          ? pairSegments(
              inFlight,
              pairs.map(([, to]) => to)
            )
          : pairs,
      });
      return;
    }

    const fromMorphable = MORPHABLE.has(prev);
    const toMorphable = MORPHABLE.has(next);
    // 两端都在名表外：这条变化与形变无关，不必惊动这个异步 chunk
    if (!fromMorphable && !toMorphable) return;

    // 只要有一端在名表里就预热：这一次仍可能播不了（chunk 还没到），下一次一定来得及
    const engine = loadMorphEngine();
    if (!fromMorphable || !toMorphable) return;

    const morph = engine?.createIconMorph(prev, next) ?? null;
    if (morph) runMorph({ kind: 'flubber', morph });
  }
);

onBeforeUnmount(stopAnimation);
</script>

<!-- 注意：本块**不可加 scoped**。
     规则要作用于图标子组件渲染的 SVG 内部元素（g/path/line…），而 scoped 会把作用域属性
     追加到末位选择器上，那些内部节点并不携带 BaseIcon 的 scope id —— 加了即整条规则失效、
     描边粗细覆盖全部失灵。故保持全局；碰撞风险由 `.base-icon[data-icon-stroke]` 双条件
     限定（需同时命中 class 与本组件独有的 data 标记），实际上足够特异。 -->
<style>
/* Lucide 等描边图标把 stroke-width 写死在内部 path/g 的 SVG presentation attribute 上，
   根元素上的 CSS stroke-width 因优先级低于该 attribute 而传不下去——导致 BaseIcon 的
   strokeWidth 看似无效。这里当根显式声明了描边粗细（data-icon-stroke 标记）时，
   强制内部所有容器与描边元素（包含 g 分组）从根继承该值。 */
.base-icon[data-icon-stroke] :is(g, path, line, polyline, circle, ellipse, rect, polygon) {
  stroke-width: inherit !important;
}
</style>
