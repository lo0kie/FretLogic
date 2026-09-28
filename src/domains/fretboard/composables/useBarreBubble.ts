import { computed, onBeforeUnmount, ref, toValue, watch } from 'vue';

import {
  isPointInBarre as isPointInBarreOf,
  parseBarreFretFromKey,
} from '@/domains/fretboard/components/FretboardSvg.logic';

import type { DisplayBarre } from '@/domains/fretboard/components/FretboardSvg.logic';
import type { BarreEntity } from '@/domains/fretboard/types';
import type { MaybeRefOrGetter } from 'vue';

/** 气泡锚点几何：横按跨度中心的水平位置、品丝线上方的垂直落点、以及弦号标签 */
export interface BarreBubbleGeometry {
  centerX: number;
  topY: number;
  label: string;
}

/**
 * 一枚待渲染的气泡：横按本体 + 锚点几何 + 是否可见。
 *
 * `key` 的取法**分两档**（见 `bubbleItems`），不是随便取的稳定标识 —— 它决定
 * 「同一枚气泡换横按时是复用同一个 DOM 节点、还是销毁重建」，直接关系到滑动过渡在不在。
 */
export interface BarreBubbleItem {
  key: string;
  barre: DisplayBarre;
  geometry: BarreBubbleGeometry;
  visible: boolean;
}

/**
 * 悬停档那条气泡的渲染 key：**常量**。
 *
 * 悬停档只有一条气泡在飞，它在横按之间切换时必须是**同一个 DOM 节点**（靠 left/top 过渡滑过去）——
 * key 若取横按 key，每次换横按都会卸载重建，滑动过渡直接断掉。常量 key 表达的就是「这一枚始终是它」。
 */
const HOVER_BUBBLE_KEY = 'active';

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
  /**
   * 常驻模式：为真时**不依赖指针落点**，**每条横按各挂一枚气泡**、恒常显示。
   *
   * 给没有悬停能力的设备用（判据 `(hover: hover)`，与 TopHeader 的 canHover、vTooltip 同源）：
   * 触屏上气泡永远不会被悬停激活，「标记横按」这个功能等于不可达 —— 故这类设备改为常驻，
   * 让手机上也能点到。**一条横按一枚**：有几条渲染几条（互不相邻的横按段各占一条，6 弦上最多三条），
   * 它们分处不同品位、不会互相压住；触屏也没有「把指针移到另一条上」这个动作。
   */
  alwaysShow?: MaybeRefOrGetter<boolean>;
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
 *
 * 对外给的是**一份气泡列表**（`bubbleItems`）而不是单枚气泡：悬停档至多一条（换横按时复用同一个
 * DOM 节点），常驻档一条横按一条 —— 组装口径见该 computed 的注释。
 */
export function useBarreBubble(options: UseBarreBubbleOptions) {
  const { displayBarres, stringXPositions, stringCount, fretLineY, hoverPoint, alwaysShow, onToggleBarre } = options;

  /** 指位是否落在横按范围内（纯函数见 FretboardSvg.logic.ts） */
  const isPointInBarre = (pt: { stringIndex: number; fretIndex: number } | null, b: BarreEntity) =>
    isPointInBarreOf(pt, b);

  const activeHoveredBarreKey = ref<string | null>(null);
  const isBubbleMounted = ref(false);
  let barreHideTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 当前被 hover 激活的横按对象（响应式随 displayBarres 变化同步更新，并在横按延伸时平滑延续避免 DOM 销毁重建）。
   *
   * **常驻档恒为 null**：那条档位下整段 hover 状态机都不参与 —— 指针落点在这类设备上本就是手势的
   * 副产物（触屏抬起后不会再有 pointerleave 收尾），按它判定只会让气泡时有时无；气泡改为
   * **逐条枚举** displayBarres（见 bubbleItems），不存在「当前这一条」这个概念。
   */
  const activeHoveredBarre = computed<DisplayBarre | null>(() => {
    if (toValue(alwaysShow)) return null;

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

  /** 指针是否落在气泡本体上（原始态；对外语义见 isBubbleHovered） */
  const isBubblePointerInside = ref(false);
  const isBubbleElementHovered = ref(false);

  /**
   * 气泡本体的悬停态 —— 宿主据此决定「空品位预览环」要不要让位（气泡浮在指板上方，
   * 指针停在气泡上时 hover 坐标会滞留在原格，环会误留在原地）。
   *
   * **常驻档恒为假**：那条档位下气泡一直挂在指板上，指针停上去是常态而不是「正悬停在气泡上」；
   * 更要紧的是触屏抬起后浏览器**不会再补 pointerleave**，一次点按就会把这个标志永久钉成真，
   * 预览环从此再不出现。故它只承认悬停档。
   */
  const isBubbleHovered = computed(() => !toValue(alwaysShow) && isBubblePointerInside.value);

  const handleBubblePointerEnter = () => {
    isBubblePointerInside.value = true;
    isBubbleElementHovered.value = true;
    if (barreHideTimer) {
      clearTimeout(barreHideTimer);
      barreHideTimer = null;
    }
  };

  const handleBubblePointerLeave = () => {
    isBubblePointerInside.value = false;
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

  /**
   * 点击某枚气泡：派发切换事件，由于响应式计算，气泡内容将实时切换已标记/未标记。
   *
   * 横按由**调用方逐枚传回**（而不是取「当前激活的那一条」）：常驻档下同时挂着好几枚气泡，
   * 「当前激活」在那条档位上根本不存在（见 activeHoveredBarre）。
   */
  const handleBarreBubbleClick = (barre: BarreEntity) => onToggleBarre(barre);

  /** 单条横按的气泡锚点几何：两弦中心水平位置、品丝线上方 4px 的垂直落点（远离音符、由箭头指向下方） */
  const geometryOf = (b: DisplayBarre): BarreBubbleGeometry => {
    const xs = toValue(stringXPositions);
    const xLeft = xs[b.fromString] ?? 0;
    const xRight = xs[b.toString] ?? 0;
    return {
      centerX: (xLeft + xRight) / 2,
      topY: fretLineY(b.fret - 1) + 4,
      // 弦号按**实际弦数**换算（索引 0 = 最低音粗弦）：写死 6 会在 7/8 弦等非 6 弦指法上整体报错弦号
      label: `${toValue(stringCount) - b.fromString}～${toValue(stringCount) - b.toString}弦`,
    };
  };

  /** 当前 hover 激活横按的几何（悬停档至多一条；常驻档不参与，气泡逐条枚举） */
  const hoveredBarreGeometry = computed<BarreBubbleGeometry | null>(() => {
    const b = activeHoveredBarre.value;
    return b ? geometryOf(b) : null;
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

  /**
   * 渲染用气泡条目 —— 两档的差异只在「条目从哪来」与「key 取什么」：
   *
   * - **悬停档**：至多一条，且 key 取常量 `HOVER_BUBBLE_KEY`。同一枚气泡在横按之间切换时因此复用
   *   同一个 DOM 节点、靠 left/top 过渡滑过去（与 activeHoveredBarre 里「跨度生长平滑延续」是同一条
   *   口径：key 一变就销毁重建，过渡直接断掉）。离开动画期间仍给出这一条、只是 `visible` 转假，
   *   节点留在原地播完离场（几何取 cached*，不闪到左上角）。
   * - **常驻档**：一条横按一条，key 取横按 key —— 节点随**横按本体**存亡，别的横按增删不会把它重建。
   *   互不相邻的横按段各占一条（6 弦上最多三条），分处不同品位、不会互相压住。
   *
   * 常驻档不看 isBubbleMounted：挂载态那套是给「悬停激活 → 延迟隐藏」的进出场用的，
   * 常驻档的存亡只由 displayBarres 决定（横按被删或取消标记，气泡随之消失）。
   */
  /** 常驻档的一条气泡：恒可见，key 随**横按本体**（别的横按增删不会把它重建） */
  const alwaysShownItemOf = (barre: DisplayBarre): BarreBubbleItem => ({
    key: barre.key,
    barre,
    geometry: geometryOf(barre),
    visible: true,
  });

  const bubbleItems = computed<BarreBubbleItem[]>(() => {
    if (toValue(alwaysShow)) return toValue(displayBarres).map(alwaysShownItemOf);

    const barre = displayBubbleBarre.value;
    const geometry = displayBubbleGeometry.value;
    if (!isBubbleMounted.value || !barre || !geometry) return [];

    return [{ key: HOVER_BUBBLE_KEY, barre, geometry, visible: Boolean(activeHoveredBarre.value) }];
  });

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
    bubbleItems,
    isBubbleHovered,
    handleBubbleAfterLeave,
    handleBubblePointerEnter,
    handleBubblePointerLeave,
    handleBarreMouseEnter,
    handleBarreMouseLeave,
    handleBarreBubbleClick,
  };
}
