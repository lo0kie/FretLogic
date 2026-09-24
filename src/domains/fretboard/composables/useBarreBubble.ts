import { computed, onBeforeUnmount, ref, toValue, watch } from 'vue';

import {
  isPointInBarre as isPointInBarreOf,
  parseBarreFretFromKey,
} from '@/domains/fretboard/components/FretboardSvg.logic';

import type { DisplayBarre } from '@/domains/fretboard/components/FretboardSvg.logic';
import type { BarreEntity } from '@/domains/fretboard/types';
import type { MaybeRefOrGetter } from 'vue';

/** 指向箭头的方块边长（px）：楔形底宽 `size·√2`、高 `size/√2`，见 BaseArrowPanel */
const BARRE_ARROW_SIZE = 12;

/**
 * 传给 v-wave 的裁剪范围：只在**下方**放开这么多像素，刚好罩住凸出气泡盒的指向箭头。
 *
 * ① 箭尖越出面板 **border-box** 底边 `size/√2`（楔形底边就落在 border-box 边上）；
 * ② 容器自宿主 border-box 起算（补丁按 border-box 撑开，见 patches/v-wave.patch），故容器底边比
 *    border-box 底边低 `bleed`；令 ② ≥ ① 得 `bleed ≥ size/√2`，向上取整留出抗锯齿余量。
 *
 * **裁剪形状不靠这个数字**：只放一个矩形出去会让水波在箭头左右也可见。真正的轮廓由剪影层挂到
 * 宿主上的 `--arrow-panel-clip` 给出（面板 + 箭头一条非凸曲线），补丁优先按它裁 —— 所以这里只需要
 * 「放开多少」，不需要描述形状。
 */
const barreWaveClip = { bottom: Math.ceil(BARRE_ARROW_SIZE / Math.SQRT2) };

/**
 * 指向箭头的样式**不在这里构建**：模板里的 `BaseArrowPanel` 会把面板描边与楔形画成一条连续轮廓
 * （几何见 `platform/ui/popover/arrowPanel.ts`）。本模块只保留箭头的一个尺寸事实 ——
 * `BARRE_ARROW_SIZE`，它同时决定楔形大小与波纹容器的裁剪外扩量（见 `barreWaveClip`）。
 *
 * 换成「一条轮廓」的直接动因：旧实现是「面板描边 + 箭头描边」两条各自抗锯齿的边，接缝处只能靠
 * 把楔形插进面板 1px 去盖；而本气泡整棵子树处在 `Fretboard` 的 `transform: scale(0.85)` 内，
 * 那 1px 视觉上只剩 0.85px，缝一直露着。轮廓合一后接缝不存在，与缩放无关。
 *
 * 顺带解除的两条旧约束（当时为接缝而设）：箭头不必再逐个复刻面板的取色档位，也不必再关心
 * 与波纹容器的层级 —— 它已经不再是「压在面板上的一块」，而是面板轮廓本身。
 */
const barreArrowSize = BARRE_ARROW_SIZE;

/** 气泡锚点几何：横按跨度中心的水平位置、品丝线上方的垂直落点、以及弦号标签 */
export interface BarreBubbleGeometry {
  centerX: number;
  topY: number;
  label: string;
}

export interface UseBarreBubbleOptions {
  /** 展示用横按集合（推导候选 + 已标记合并） */
  displayBarres: MaybeRefOrGetter<DisplayBarre[]>;
  /** 各弦横坐标（与指板网格同源） */
  stringXPositions: MaybeRefOrGetter<number[]>;
  /** 当前弦数：仅用于把弦索引换算成「N～M 弦」标签（索引 0 = 最低音粗弦） */
  stringCount: MaybeRefOrGetter<number>;
  /** 品丝线 Y 坐标换算（与指板网格同源） */
  fretLineY: (fretIndex: number) => number;
  /** 当前 hover 落点（指板逻辑坐标）：气泡的自动激活与「跨度生长时延续」都按它判定 */
  hoverPoint: MaybeRefOrGetter<{ stringIndex: number; fretIndex: number } | null>;
  /** 点击气泡时回调：由宿主派发 toggle-barre。气泡只负责交互状态，不直接改数据 */
  onToggleBarre: (barre: BarreEntity) => void;
}

/**
 * 浮动横按操作气泡：悬停横按梁时浮现「标记 / 取消标记」气泡的整套局部状态机。
 *
 * 从 FretboardSvg.vue 抽出（原 :483~675）。抽出的判据是**它自带完整的局部状态机**——
 * 悬停激活键、延迟隐藏计时器、挂载态、以及为「离开动画期间不脱位」而缓存的上一次有效几何，
 * 这四组状态只服务于气泡自身，与指板渲染无关；组件里只留模板接线与几何/样式转发。
 *
 * 三条容易被改坏的不变量，各自见其下注释：
 * ① `activeHoveredBarre` 在横按跨度生长时要**平滑延续**同品横按，绝不返回 null
 *    （返回 null 会让 DOM 销毁重建，移位过渡直接断掉）；
 * ② 挂载态只由 `handleBubbleAfterLeave`（离开动画播完）置 false，且置之前必须复检是否已重新移入；
 * ③ 展示用横按与几何走 `cached*` 兜底，离开动画期间**不得清空**（清空会把节点闪到左上角 0,0）。
 */
export function useBarreBubble(options: UseBarreBubbleOptions) {
  const { displayBarres, stringXPositions, stringCount, fretLineY, hoverPoint, onToggleBarre } = options;

  /** 指位是否落在横按范围内（纯函数见 FretboardSvg.logic.ts） */
  const isPointInBarre = (pt: { stringIndex: number; fretIndex: number } | null, b: BarreEntity) =>
    isPointInBarreOf(pt, b);

  const activeHoveredBarreKey = ref<string | null>(null);
  const isBubbleMounted = ref(false);
  let barreHideTimer: ReturnType<typeof setTimeout> | null = null;

  /** 当前被 hover 激活的横按对象（响应式随 displayBarres 变化同步更新，并在横按延伸时平滑延续避免 DOM 销毁重建） */
  const activeHoveredBarre = computed<DisplayBarre | null>(() => {
    if (activeHoveredBarreKey.value) {
      const direct = toValue(displayBarres).find(b => b.key === activeHoveredBarreKey.value);
      if (direct) return direct;

      // 关键优化：音符连续点按时横按弦跨度扩展（例如从 0..1 延伸到 0..2），新旧 key 不一致但属于同一品位横按的连续生长
      // 此时平滑延续当前品位的最新横按，绝不返回 null 触发 DOM 节点销毁重建，确保 CSS 移位平滑过渡
      //
      // 这里踩过两个坑，都不是「写法不够好」，而是**判定从未按预期生效**：
      // ① 品位曾用 `split('-')[1]` 解析，而 key 形如 `barre-fret-5`——下标 1 取到的是字面量
      //    `'fret'`，`Number('fret') === NaN`，`b.fret === NaN` 恒为 false，整条分支形同不存在。
      //    改由 key 的定义方 `parseBarreFretFromKey` 解析，格式变更时不会再静默退化。
      // ② 谓词曾写成 `(... && isPointInBarre(...)) || true`，`|| true` 使它退化为「同品取第一条」，
      //    可能延续到同品的另一条横按（同一品可以并存多条）。现按注释原意收敛为「同品且光标仍落在
      //    该横按跨度内」：跨度只向相邻弦生长，光标既然原本在原跨度内，就必然落在新跨度内。
      const oldFret = parseBarreFretFromKey(activeHoveredBarreKey.value);
      const pt = toValue(hoverPoint);
      const continued =
        oldFret === null ? undefined : toValue(displayBarres).find(b => b.fret === oldFret && isPointInBarre(pt, b));
      if (continued) return continued;
    }

    // 若光标当前落在任一横按上，自动匹配激活
    const hover = toValue(hoverPoint);
    if (hover) {
      const matched = toValue(displayBarres).find(b => isPointInBarre(hover, b));
      if (matched) return matched;
    }

    return null;
  });

  // 在合法的 watcher 生命周期内同步最新 key 与挂载生命周期，杜绝 computed 内产生 side-effect
  watch(
    activeHoveredBarre,
    b => {
      if (b) {
        isBubbleMounted.value = true;
        activeHoveredBarreKey.value = b.key;
      }
    },
    { immediate: true }
  );

  /** 内层离开动画完全播放完毕后，才安全卸载外层定位容器，绝不提前卸载打断动画 */
  const handleBubbleAfterLeave = () => {
    // 核心防御：若离开动画播放期间用户重新移入了横按，绝不可把挂载状态置为 false！
    if (activeHoveredBarre.value) return;
    isBubbleMounted.value = false;
  };

  const isBubbleHovered = ref(false);
  const isBubbleElementHovered = ref(false);

  const handleBubblePointerEnter = () => {
    isBubbleHovered.value = true;
    isBubbleElementHovered.value = true;
    if (barreHideTimer) {
      clearTimeout(barreHideTimer);
      barreHideTimer = null;
    }
  };

  const handleBubblePointerLeave = () => {
    isBubbleHovered.value = false;
    isBubbleElementHovered.value = false;
    handleBarreMouseLeave();
  };

  const handleBarreMouseEnter = (barre: DisplayBarre) => {
    if (barreHideTimer) {
      clearTimeout(barreHideTimer);
      barreHideTimer = null;
    }
    isBubbleMounted.value = true;
    activeHoveredBarreKey.value = barre.key;
  };

  /** 离开横按区域：只有在鼠标确实不在该横按区域内、且不在气泡本体上时，才延迟隐藏 */
  const handleBarreMouseLeave = () => {
    // 如果鼠标依然悬停在气泡上，或仍处于该横按琴弦跨度内，绝不关闭
    if (isBubbleHovered.value) return;
    if (activeHoveredBarre.value && isPointInBarre(toValue(hoverPoint), activeHoveredBarre.value)) return;

    if (barreHideTimer) clearTimeout(barreHideTimer);
    barreHideTimer = setTimeout(() => {
      if (isBubbleHovered.value) return;
      if (activeHoveredBarre.value && isPointInBarre(toValue(hoverPoint), activeHoveredBarre.value)) return;
      activeHoveredBarreKey.value = null;
      barreHideTimer = null;
    }, 200);
  };

  /** 点击浮动气泡：派发切换事件，由于响应式计算，气泡内容将实时切换已标记/未标记 */
  const handleBarreBubbleClick = () => {
    if (activeHoveredBarre.value) onToggleBarre(activeHoveredBarre.value);
  };

  /** 悬浮气泡几何定位：处于该横按所在两弦中心水平位置，垂直上移至品丝线上方，远离音符并由箭头指向下方 */
  const hoveredBarreGeometry = computed<BarreBubbleGeometry | null>(() => {
    const b = activeHoveredBarre.value;
    if (!b) return null;
    const xs = toValue(stringXPositions);
    const xLeft = xs[b.fromString] ?? 0;
    const xRight = xs[b.toString] ?? 0;
    const centerX = (xLeft + xRight) / 2;
    const topY = fretLineY(b.fret - 1) + 4;
    return {
      centerX,
      topY,
      // 弦号按**实际弦数**换算（索引 0 = 最低音粗弦）：写死 6 会在 7/8 弦等非 6 弦指法上整体报错弦号
      label: `${toValue(stringCount) - b.fromString}～${toValue(stringCount) - b.toString}弦`,
    };
  });

  // 缓存最后一次有效的横按数据与坐标，确保在 Transition 离开动画播放期间，DOM 节点的 left/top 不被清空导致闪现到左上角 (0, 0)
  const cachedBarre = ref<DisplayBarre | null>(null);
  const cachedGeometry = ref<BarreBubbleGeometry | null>(null);

  watch(
    [activeHoveredBarre, hoveredBarreGeometry] as const,
    ([b, geo]) => {
      if (b) cachedBarre.value = b;
      if (geo) cachedGeometry.value = geo;
    },
    { immediate: true }
  );

  /** 用于渲染展示的气泡数据（即使在离开动画期间也稳定持有最后一刻的状态，绝不闪现脱位） */
  const displayBubbleBarre = computed(() => activeHoveredBarre.value ?? cachedBarre.value);
  const displayBubbleGeometry = computed(() => hoveredBarreGeometry.value ?? cachedGeometry.value);

  const syncBarreHover = () => {
    if (isBubbleHovered.value) return;
    const pt = toValue(hoverPoint);
    if (!pt) {
      handleBarreMouseLeave();
      return;
    }
    const matched = toValue(displayBarres).find(b => isPointInBarre(pt, b));
    if (matched) handleBarreMouseEnter(matched);
    else handleBarreMouseLeave();
  };

  // hover 坐标仅两个数字，用字符串签名判等即可：deep 遍历对象换不来额外信息，
  // 而签名能让「指针在同一格内移动」不再重复跑一遍横按命中查找（syncBarreHover 内含 find 遍历）
  watch(() => {
    const pt = toValue(hoverPoint);
    return pt ? `${pt.stringIndex},${pt.fretIndex}` : '';
  }, syncBarreHover);
  watch(() => toValue(displayBarres), syncBarreHover, { flush: 'post' });

  // 延迟隐藏计时器归本模块所有，卸载时必须一并撤掉：否则组件销毁后仍会跑一次
  // 「读已失效的 ref + 可能触发状态写入」的回调（原实现在组件侧漏了这条清理）
  onBeforeUnmount(() => {
    if (barreHideTimer) {
      clearTimeout(barreHideTimer);
      barreHideTimer = null;
    }
  });

  return {
    activeHoveredBarre,
    isBubbleMounted,
    displayBubbleBarre,
    displayBubbleGeometry,
    barreArrowSize,
    barreWaveClip,
    isBubbleHovered,
    handleBubbleAfterLeave,
    handleBubblePointerEnter,
    handleBubblePointerLeave,
    handleBarreMouseEnter,
    handleBarreMouseLeave,
    handleBarreBubbleClick,
  };
}
