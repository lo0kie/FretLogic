/**
 * 通用「一维扁平行列表」虚拟化：`@tanstack/vue-virtual` 在本项目内的收口。
 *
 * 适用场景：一个滚动容器里有一串行，行高可以不等，行长什么样、点一下干什么由宿主决定。
 * 机制只回答三件事：当前视口（± overscan）该渲染哪些行、每行的纵向偏移是多少、占位总高是多少。
 *
 * 为什么不在各处直接调 `@tanstack/vue-virtual`：几件每次都一样的接线收在一处 ——
 *   1. **阈值开关**：行数不到 `minRows` 就不虚拟化（`enabled` 为假，宿主走原来的全量渲染）。
 *      这不是省事，而是保住那些依赖「所有行都在 DOM 里」的能力 —— 拖拽排序按容器 children
 *      反推新顺序、FLIP 重排要读每个子元素的 rect、键盘方向键要能跨行找下一个可聚焦项。
 *      常见规模（几十行）本来就不卡，没必要为它们换掉这套机制。
 *   2. **内核按需加载**：`@tanstack/virtual-core` 约 11KB gzip，而首屏预算只剩几 KB
 *      （见 scripts/check-bundle.mjs 的 INITIAL_BUDGET_KB）—— 静态引入会让首屏直接超预算。
 *      与 sortablejs 同一处理（见 useSortableList 顶部的动态 import 注释）：只有列表真的长到
 *      需要虚拟化时才去取那个 chunk。**类型导入仍是静态的**（`import type` 编译期擦除，不进产物）。
 *   3. **行 key 与行高的取值口径**：缺省按下标，宿主给了身份就按宿主给的（`getKey` 决定
 *      已测高度能否在数据重排后复用 —— 按下标做 key 时重排会让实测高度错配到别的行）。
 *   4. **行元素的高度实测**：不实测的话，高度不定的行会把滚动条总高与后续行的偏移一起算错。
 *
 * 与 `useRowWindowing` 的分工：那个面向「分区 × 网格行」的二维结构（和弦选择器面板），
 * 分区壳常驻、只有网格行参与窗口化，且窗口按分区逐个算；本模块面向一维扁平行，
 * 行与行之间没有常驻的壳，窗口是**一段连续区间**。
 *
 * 用法（宿主要给的三样：滚动容器、行数据、行高估值）：
 *
 *   const { enabled, items, totalSize, measureRow } = useVirtualRows({
 *     scrollElement: () => scrollRef.value,
 *     rows: myRows,
 *     estimateSize: row => (row.type === 'group' ? 22 : 46),
 *     getKey: row => row.key,
 *     gap: 8,
 *   });
 *
 * 模板侧的行元素必须带上 `:data-index="entry.index"`（`measureElement` 靠它反查下标）并把
 * `:ref="measureRow"` 绑上，否则高度实测收不到。
 */
import { computed, effectScope, onScopeDispose, ref, shallowRef, toValue, watch } from 'vue';

import type { Range, Virtualizer } from '@tanstack/vue-virtual';
import type { ComputedRef, EffectScope, MaybeRefOrGetter, Ref, ShallowRef } from 'vue';

/** 滚动定位的对齐方式（与 virtual-core 的 ScrollAlignment 同集合，那边未导出该类型） */
export type VirtualScrollAlign = 'start' | 'center' | 'end' | 'auto';

/** 一条待渲染的行：虚拟化算出的位置 + 宿主自己的行数据 */
export interface VirtualRowEntry<T> {
  /** 行身份（来自 `getKey`，缺省为下标），供模板 :key 用 */
  key: string;
  /** 行下标：行元素必须把它写进 data-index，实测高度靠它回填 */
  index: number;
  /** 行顶相对列表内容顶部的偏移（px），宿主据此 translateY 定位 */
  start: number;
  row: T;
}

export interface UseVirtualRowsOptions<T> {
  /**
   * 滚动容器元素（宿主下发）。为空时不渲染任何行 —— 容器尚未就绪时窗口算不出来，
   * 此时渲染整表等于把虚拟化整个作废。
   */
  scrollElement: MaybeRefOrGetter<HTMLElement | null | undefined>;
  /** 行数据，顺序即渲染顺序 */
  rows: MaybeRefOrGetter<readonly T[]>;
  /** 行高估值（px）：**只用于尚未实测过的行**，实测之后一律以实测为准 */
  estimateSize: (row: T, index: number) => number;
  /**
   * 行身份。强烈建议给 —— 缺省按下标做 key，而数据重排（换排序方式、筛选）后同一个下标会
   * 指向另一行，已缓存的高度实测值随之错配，滚动条总高要等到这些行重新渲染才自愈。
   */
  getKey?: (row: T, index: number) => string | number;
  /** 行间距（px）。走虚拟化器自己的 gap 而不是在行元素上留外边距：后者会被算进实测高度，
   *  末行因此多出一段空白，且实测值与估值口径分叉。 */
  gap?: number;
  /** 视口上下各多渲染的行数，滚动无感的缓冲。缺省 8 */
  overscan?: number;
  /** 低于这个行数不虚拟化（`enabled` 为假）。缺省 0：任何行数都虚拟化 */
  minRows?: number;
  /**
   * 额外强制渲染的行下标（除默认窗口之外）。
   *
   * 用于「窗口之外、但必须真实存在于 DOM 里」的行 —— 典型是列表滚动条的气泡读数按
   * `querySelector` 现查段落小标题行，那类行若被挡在窗口外，读数就会跳到下一段。
   * 只该返回极少数下标（每多挂一行就多一份挂载成本）。
   */
  pinIndexes?: (range: { startIndex: number; endIndex: number }, rows: readonly T[]) => number[];
}

export interface UseVirtualRowsResult<T> {
  /** 是否启用虚拟化（行数达到 minRows 且内核可用）。为假时 `items` 为空，宿主应走全量渲染 */
  enabled: ComputedRef<boolean>;
  /** 当前应渲染的行（已带上宿主的数据）。内核尚未就绪时为空数组 */
  items: ComputedRef<VirtualRowEntry<T>[]>;
  /** 列表占位总高（px）：外层容器按它撑开 */
  totalSize: ComputedRef<number>;
  /** 行元素的 ref 回调：绑到行元素上，交给虚拟化器实测高度 */
  measureRow: (el: unknown) => void;
  /** 把某一行滚进视口（行尚未渲染时唯一的定位手段） */
  scrollToIndex: (index: number, align?: VirtualScrollAlign) => void;
  /** 某一行当前是否在渲染窗口内（据此决定该用指令滚动还是 `scrollToIndex`） */
  isIndexRendered: (index: number) => boolean;
}

export const useVirtualRows = <T>(options: UseVirtualRowsOptions<T>): UseVirtualRowsResult<T> => {
  const { gap = 0, overscan = 8, minRows = 0 } = options;

  const resolveRows = (): readonly T[] => toValue(options.rows);

  /**
   * 内核取不到（chunk 加载失败）时置位，把 `enabled` 拉回假 —— 退回宿主的全量渲染。
   * 不这么做的话，宿主会停在「虚拟化分支 + 空窗口」上，列表整片空白，比慢一点糟得多。
   */
  const isKernelUnavailable = ref(false);

  const enabled = computed(() => !isKernelUnavailable.value && resolveRows().length >= minRows);

  /**
   * 内核里的默认窗口提取函数。它是**运行期**值（随动态 import 一起到），故先留空、
   * 加载完成时回填；`rangeExtractor` 只在虚拟化器存在之后才会被调用，回填前走不到这里。
   */
  let extractDefaultRange: ((range: Range) => number[]) | null = null;

  /** 默认窗口 + 宿主指定的强制行；必须排序后返回（虚拟化器按下标升序铺偏移） */
  const extractRange = (range: Range): number[] => {
    const indexes = new Set(extractDefaultRange ? extractDefaultRange(range) : []);
    const pinned = options.pinIndexes?.({ startIndex: range.startIndex, endIndex: range.endIndex }, resolveRows());
    if (pinned) for (const index of pinned) indexes.add(index);
    return [...indexes].sort((a, b) => a - b);
  };

  const virtualizerOptions = computed(() => ({
    count: enabled.value ? resolveRows().length : 0,
    getScrollElement: () => toValue(options.scrollElement) ?? null,
    estimateSize: (index: number) => {
      const row = resolveRows()[index];
      return row === undefined ? 0 : options.estimateSize(row, index);
    },
    getItemKey: (index: number) => {
      const row = resolveRows()[index];
      if (row === undefined) return index;
      return options.getKey ? options.getKey(row, index) : index;
    },
    gap,
    overscan,
    rangeExtractor: extractRange,
  }));

  /**
   * 内核返回的那个 ref **本身**（不是它的 `.value`）。
   *
   * 不能拆开只留实例：内核每次重算窗口是靠在那个 ref 上 triggerRef 来通知 Vue 的，
   * 只存 `.value` 就把通知通道丢了 —— 界面会停在首帧的窗口上，滚动不再更新任何行。
   */
  const kernel: ShallowRef<Ref<Virtualizer<HTMLElement, Element>> | null> = shallowRef(null);

  /** 取当前虚拟化器实例（未就绪时为空） */
  const instance = (): Virtualizer<HTMLElement, Element> | null => kernel.value?.value ?? null;

  /** 内核所在的作用域：异步续跑里注册的 watcher 得有个归属，卸载时一并停掉 */
  let kernelScope: EffectScope | null = null;

  watch(
    enabled,
    isEnabled => {
      if (!isEnabled || kernelScope) return;
      const scope = effectScope(true);
      kernelScope = scope;
      void import('@tanstack/vue-virtual')
        .then(module => {
          // 加载期间作用域可能已被顶替（组件销毁后重建等）：旧的那次直接作废
          if (kernelScope !== scope) return;
          extractDefaultRange = module.defaultRangeExtractor;
          // 必须在 scope.run 内调用：useVirtualizer 内部要 onScopeDispose 注册清理，
          // 异步续跑时组件作用域早已退出，直接调用拿不到归属（还会触发 Vue 的告警）
          scope.run(() => {
            kernel.value = module.useVirtualizer<HTMLElement, Element>(virtualizerOptions);
          });
        })
        .catch(() => {
          if (kernelScope === scope) isKernelUnavailable.value = true;
        });
    },
    { immediate: true }
  );

  onScopeDispose(() => {
    kernelScope?.stop();
    kernelScope = null;
  });

  const items = computed<VirtualRowEntry<T>[]>(() => {
    const virtualizer = instance();
    if (!virtualizer) return [];
    const rows = resolveRows();
    const out: VirtualRowEntry<T>[] = [];
    for (const item of virtualizer.getVirtualItems()) {
      const row = rows[item.index];
      // 行数据与窗口区间在同一个 tick 内更新，理论上不会错配；下标越界时跳过而不是渲染 undefined
      if (row === undefined) continue;
      out.push({ key: String(item.key), index: item.index, start: item.start, row });
    }
    return out;
  });

  const totalSize = computed(() => instance()?.getTotalSize() ?? 0);

  const measureRow = (el: unknown): void => instance()?.measureElement(el as Element | null);

  const scrollToIndex = (index: number, align: VirtualScrollAlign = 'auto'): void =>
    instance()?.scrollToIndex(index, { align });

  const isIndexRendered = (index: number): boolean =>
    instance()
      ?.getVirtualItems()
      .some(item => item.index === index) ?? false;

  return { enabled, items, totalSize, measureRow, scrollToIndex, isIndexRendered };
};
