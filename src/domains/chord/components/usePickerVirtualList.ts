import { computed, nextTick, onBeforeUnmount, onDeactivated, useTemplateRef, watch } from 'vue';

import { useRowWindowing } from '@/platform/composables/useRowWindowing';
import { useSectionScrollSpy } from '@/platform/composables/useSectionScrollSpy';
import { useStickyHeads } from '@/platform/composables/useStickyHeads';
import { observeResize } from '@/platform/utils/dom';

import { buildPickerRowPlan, getPickerGridGapPx } from './ChordPickerPanel.logic';

import type { ChordPickerSection } from './ChordPickerPanel.logic';
import type { Chord } from '@/domains/chord/types';
import type { VirtualSectionPlan } from '@/platform/composables/useRowWindowing';
import type { ComputedRef, Ref } from 'vue';

export interface UsePickerVirtualListOptions {
  /** 列表滚动容器元素 */
  scrollWrapperRef: Ref<HTMLElement | null>;
  /** 分区集合（由选择态派生） */
  chordSections: ComputedRef<ChordPickerSection[]>;
  /** 网格列数：行切分随它变，跨过阈值后必须重算窗口 */
  pickerGridCols: ComputedRef<number>;
  /** 卡片缩放（指板画布倍率）：行规划要按它算卡片高度 */
  pickerScale: number;
}

/**
 * 分区列表的**网格行虚拟化 + 滚动定位 / 高亮 + 吸顶 + 键盘边缘导航**。
 *
 * 三条不变量（改动本文件前先读这三条）：
 * 1. **分区壳（标题行）常驻，只有网格「行」参与窗口化** —— 分区滚动定位与滚动高亮联动都依赖真实 DOM；
 *    未挂载的行由行规划（纯几何高度）预留空间，滚动条与行位置因此不跳。
 * 2. **窗口与高亮共用同一个 rAF**（经 useSectionScrollSpy 的 onFrame 注册），不各自挂 scroll 监听。
 * 3. **元素查询每帧至多做一次**：分区壳常驻，元素集合只在「分区增删」与「列表被 v-if 重建」两类事件上变，
 *    由计数守卫发现不符即重查，其余帧零 DOM 查询。
 * 4. **窗口只在容器有排版高度时计算**：面板被「模态让位」隐藏（display:none，见 BaseFloatingPanel）
 *    或宿主被 KeepAlive 停用期间，一切几何都是零矩形、scrollTop 也恒读成 0 —— 那时算出的窗口会把
 *    已挂载行裁到「每区头一两行」，而恢复显示不派发 scroll，列表就停在那个残缺窗口上（看起来像整段
 *    消失）。故隐藏态保留上一次有效窗口，恢复由容器尺寸观察补算一次（见 updateWindow 与文件末尾）。
 *
 * 性能背景：卡片挂载是选择器的性能大头（卡片壳 + ActionButton + FretboardCanvas 的整套 setup，
 * 实测 ~0.8ms/张：775 卡全量挂载单帧 ~600ms，且与位图缓存冷热无关）。
 */
export function usePickerVirtualList({
  scrollWrapperRef,
  chordSections,
  pickerGridCols,
  pickerScale,
}: UsePickerVirtualListOptions) {
  /** 正常滚动时的预挂载缓冲（px）：视口上下各多挂一段，滚动无感 */
  const OVERSCAN_PX = 260;

  /** 每个分区的行规划（行高 / 行偏移 / 网格总高）；通用切分机制见 useRowWindowing */
  const sectionPlans = computed<VirtualSectionPlan<Chord>[]>(() =>
    buildPickerRowPlan(chordSections.value, pickerGridCols.value, pickerScale)
  );

  const sectionsListRef = useTemplateRef<HTMLElement>('sectionsListRef');

  /* ---- 滚动帧的元素缓存 ----
     分区壳常驻，元素集合只在「分区增删」与「列表被 v-if 重建」两类事件上变，却原本每滚动帧
     各查一遍：updateWindow 查一次 .picker-cards-grid、updateActiveSection 再查一次 [data-section-id]，
     而两次查询都要遍历整棵子树（含已挂载卡片的全部节点）。改为查一次、缓存复用：
     计数守卫发现分区数与缓存不符即重查，其余帧零 DOM 查询。 */
  const sectionElsCache: HTMLElement[] = [];
  const gridElsCache: HTMLElement[] = [];

  /** 重建分区 / 网格元素缓存：分区集合变化、面板打开时调用（计数守卫也会兜底调它） */
  const rebuildSectionEls = () => {
    sectionElsCache.length = 0;
    gridElsCache.length = 0;
    const list = sectionsListRef.value;
    if (!list) return;
    for (const el of list.querySelectorAll<HTMLElement>('[data-section-id]')) sectionElsCache.push(el);
    for (const el of list.querySelectorAll<HTMLElement>('.picker-cards-grid')) gridElsCache.push(el);
  };

  /** 计数守卫：分区数与缓存不符（含列表刚从空态重建）就重查，否则直接用缓存 */
  const ensureSectionEls = () => {
    if (sectionElsCache.length !== chordSections.value.length) rebuildSectionEls();
  };

  /** 本帧实际使用的预挂载缓冲（px） */
  let frameOverscanPx = OVERSCAN_PX;
  /** 上一次观测到的 scrollTop（NaN = 尚未观测，首帧按「无位移」处理） */
  let observedScrollTop = Number.NaN;
  /** 上一次读到的「容器是否有排版高度」：false = 上次没量到（隐藏态，或还没量过 —— 后者见 everLaidOut） */
  let containerLaidOut = false;
  /**
   * 是否成功量到过排版高度。
   *
   * 只让「量到过、现在又归零」判为隐藏态：jsdom 里 clientHeight 恒为 0，若把「从未量到」也当成
   * 隐藏，任何挂载本面板的用例都会拿到空窗口。
   */
  let everLaidOut = false;

  /** 分区行窗口化：滚动时重算各分区可见行区间 [first, last]，分区壳常驻、网格行按窗口挂载 */
  const { updateWindow: updateRowWindow, visibleRows } = useRowWindowing<Chord>({
    getScroller: () => scrollWrapperRef.value,
    getList: () => sectionsListRef.value,
    getPlans: () => sectionPlans.value,
    gridSelector: '.picker-cards-grid',
    // 回传缓存：窗口计算每帧都要按顺序取各分区网格元素，走缓存省掉一次子树查询
    getGridEls: () => {
      ensureSectionEls();
      return gridElsCache;
    },
    // 传函数：缓冲量每帧现读，供下面按本帧位移自适应
    overscanPx: () => frameOverscanPx,
  });

  /**
   * 按本帧位移决定缓冲量，再重算行窗口。
   *
   * 大位移帧 —— 点「滚动到顶部/底部」的平滑滚动（原生时长与距离基本无关，长列表下约 1600px/帧）、
   * 拖滚动条拇指、快速滚轮甩动 —— 里预挂的行下一帧就被甩出视口，挂载成本（~0.8ms/张）纯属白付，
   * 而每帧挂载数 ≈ 总卡数 / 30，这正是「数据量大时滚到顶/底明显掉帧」的成因。
   * 位移已吃掉整个缓冲时收成 0：窗口只剩视口本身（约 3 行 ≈ 9 张），观感无变化 ——
   * 缓冲本就是「提前挂还没进视口的行」，一帧走两行以上时那些行根本来不及被看见。
   * 慢速滚动（滚轮约 100px/帧）恒为 OVERSCAN_PX。
   *
   * 只在 scrollTop 真的变了才重判：同一帧内本函数可能被多处调用（滚动合帧 / 分区变化 / 开关面板），
   * 后几次位移为 0，若逐次重判会把刚收缩的窗口又撑回去，等于没收缩。
   */
  const updateWindow = () => {
    // 隐藏态（面板被模态让位 / 宿主被 KeepAlive 停用）：clientHeight 为 0、scrollTop 也恒读成 0。
    // 此刻照算出来的是「每区头一两行」这种残缺区间，且会顺手把 observedScrollTop 基线污染成 0；
    // 恢复显示既不派发 scroll、也不重跑 visible 那条 watch，列表就永久停在那片空白上。
    // 保留上一次有效窗口，恢复由文件末尾的尺寸观察补算（判据见 everLaidOut 的说明）。
    const scroller = scrollWrapperRef.value;
    const laidOut = (scroller?.clientHeight ?? 0) > 0;
    if (everLaidOut && !laidOut) return;
    if (laidOut) everLaidOut = true;
    const scrollTop = scroller?.scrollTop ?? 0;
    if (scrollTop !== observedScrollTop) {
      const delta = Number.isNaN(observedScrollTop) ? 0 : Math.abs(scrollTop - observedScrollTop);
      frameOverscanPx = delta > OVERSCAN_PX ? 0 : OVERSCAN_PX;
      observedScrollTop = scrollTop;
    }
    containerLaidOut = laidOut;
    updateRowWindow();
  };

  /** 复位位移基线：面板打开时不论上次停在哪，首帧都按「无位移」给足缓冲 */
  const resetScrollBaseline = () => {
    observedScrollTop = Number.NaN;
  };

  /** 分区标题吸顶：与侧栏和弦库分组、设置弹层、开发者面板同源 ——
   *  发现滚动容器、监听滚动与尺寸变化、批量判定哪些头被顶在吸附线上、按吸附头实测高度
   *  让开容器顶部羽化带（否则吸附中的标题会被顶部羽化冲淡）统一交给 useStickyHeads；
   *  头/段的 DOM 结构用面板自己的类名钩子，id 用 data-head-section-id（不与分区定位的
   *  data-section-id 争用同一属性）。 */
  const { headBind } = useStickyHeads({
    listRef: sectionsListRef,
    headSelector: '.picker-section-header',
    idAttribute: 'data-head-section-id',
    sectionSelector: '.picker-section-block',
    // 吸附线 = 容器可视上沿：头的 top 由 headBind 取容器 padding 的负值抵消，头顶不留缝隙
    offset: '0px',
    fadeOffset: true,
  });

  /**
   * 吸附头的接线：headBind 一次给全「id 钩子 + 定位（sticky / top / z）+ 滚动容器」，
   * 其中 `scroll-container` 是喂给 BaseCollapse 的**组件 prop**（另外三处宿主都是折叠组件，
   * 折叠头用它做收起时的滚动补偿）。本面板的头是普通 div、没有这条 prop 可接 ——
   * 直接 v-bind 会把它落成一个值为 "[object HTMLElement]" 的 DOM 属性，故此处摘掉，其余照旧。
   */
  const pickerHeadBind = (id: string) => {
    const { 'scroll-container': _unusedForPlainDiv, ...rest } = headBind(id);
    return rest;
  };

  /** 吸顶分区标题的实测高度（px）：键盘导航把目标行顶到容器上沿时要按它让位。
   *  只在「方向键到窗口边缘」这条按键路径上求值，不进滚动帧，故直接量一次即可 */
  const getStickyHeadPx = (): number =>
    sectionsListRef.value?.querySelector<HTMLElement>('.picker-section-header')?.offsetHeight ?? 0;

  /**
   * 分区滚动定位 + 滚动高亮：定位（点底部段平滑滚到该分区）、高亮（按视口反推激活分区）、
   * 点选期间的「冻结推导」状态机全部在 useSectionScrollSpy 里（平台通用件，只依赖滚动几何）。
   * 本处只注入「容器 / 元素从哪来」与「同一合帧里的附带动作」：
   * - 元素走本组件的滚动帧缓存（分区壳常驻，只有分区增删与容器重建会失效）；
   * - 附带动作是行窗口重算 —— 它与算高亮共用同一 rAF，故必须由本组件注册进 onFrame，
   *   而不是各自挂一个 scroll 监听。
   */
  const {
    activeSectionId,
    sectionOptions,
    activeSectionValue,
    resetScrollTop,
    syncSections,
    activate,
    refresh,
    stop,
    deactivate,
  } = useSectionScrollSpy({
    getScroller: () => scrollWrapperRef.value,
    getList: () => sectionsListRef.value,
    getSectionEls: () => {
      ensureSectionEls();
      return sectionElsCache;
    },
    rebuildEls: rebuildSectionEls,
    sections: () => chordSections.value,
    onFrame: () => updateWindow(),
  });

  watch(
    chordSections,
    () => {
      // 分区集合变化：先收敛失效的激活分区（高亮不能停在已消失的分区上），
      // 再重查元素缓存并重算窗口与高亮 —— 顺序不能反，否则这一帧仍按旧元素算
      syncSections();
      nextTick(() => {
        refresh();
        updateWindow();
      });
    },
    { immediate: true }
  );

  /**
   * 列数变化（跨过 565px 阈值）后必须重算行窗口：行切分随列数变，而窗口里缓存的 [first, last]
   * 是**旧行号** —— 3 列切出的行数少于 2 列，退回 2 列后仍按旧区间 slice，视口下半段的行就不会
   * 被挂载（表现为分区内整片空白）。分区集合没变，故不必 syncSections（那是「分区增删」的事）。
   * 尺寸观察者接不住这一档：它只同步滚动状态，不重算窗口（见 useRowWindowing 的 getPlans 说明）。
   *
   * 重算必须**等 DOM 落到新列数之后**（与上面分区集合那条同一条理由）：行规划随列数变，
   * 而窗口的 [first, last] 是行号，`refresh()` / `updateWindow()` 又都要量新行的实际高度 ——
   * 同步跑时网格还是旧列数的节点，量到的是旧行，新列所需的下半段行照样不会被挂载。
   */
  watch(
    pickerGridCols,
    () =>
      void nextTick(() => {
        refresh();
        updateWindow();
      })
  );

  /**
   * 隐藏 → 显示 的补算（与上面两条 watch 是同一族：几何变了必须重算窗口）。
   *
   * 触发源不是 visible：弹层（模态 / 抽屉）打开时 BaseFloatingPanel 走「模态让位」把面板整块
   * 隐藏（display:none），而面板自己的 visible 从头到尾没变 —— 那条 watch 不会再跑；恢复显示的
   * 这一次 display 翻转也不派发 scroll。于是隐藏期间算出的残缺窗口（见 updateWindow 的守卫）
   * 会永久留着，用户看到的就是「从和弦抽屉保存完回到列表，列表整段空白」。
   *
   * 判据取容器高度 0 ↔ 非 0 的翻转，且只在恢复方向补算：隐藏态下 refresh 读的是零矩形，
   * 算高亮只会写成空（与 deactivate / ChordPickerPanel.onActivated 两处的口径一致）。
   */
  watch(
    scrollWrapperRef,
    (scroller, _previous, onCleanup) => {
      if (!scroller) return;
      containerLaidOut = scroller.clientHeight > 0;
      if (containerLaidOut) everLaidOut = true;
      onCleanup(
        observeResize(scroller, entry => {
          const laidOut = entry.contentRect.height > 0;
          if (laidOut === containerLaidOut) return;
          containerLaidOut = laidOut;
          if (!laidOut) return;
          everLaidOut = true;
          refresh();
          updateWindow();
        })
      );
    },
    // post：等这一帧 DOM 补丁落定（容器入文档）再观察，量到的才是真实排版值
    { flush: 'post' }
  );

  /**
   * 键盘导航到窗口边缘的兜底：网格里只挂了可见行，方向键在已渲染卡片间找不到下一张时由
   * v-arrow-nav 的 onEdge 回调到这里。按行规划的几何直接算出目标行应到的滚动位置并滚动
   * （目标行尚未挂载，不能 scrollIntoView），窗口随滚动更新后再聚焦目标卡。
   */
  const handleNavEdge = (key: string, currentEl: HTMLElement) => {
    if (key !== 'ArrowDown' && key !== 'ArrowUp') return;
    const scroller = scrollWrapperRef.value;
    const list = sectionsListRef.value;
    if (!scroller || !list) return;
    const { chordId } = currentEl.dataset;
    if (!chordId) return;
    const sectionIndex = chordSections.value.findIndex(section => section.chords.some(c => c.id === chordId));
    const plan = sectionPlans.value[sectionIndex];
    if (!plan) return;
    const fromRow = plan.rows.findIndex(row => row.items.some(c => c.id === chordId));
    if (fromRow < 0) return;
    const colIndex = plan.rows[fromRow]!.items.findIndex(c => c.id === chordId);
    const targetRowIndex = key === 'ArrowDown' ? fromRow + 1 : fromRow - 1;
    const targetRow = plan.rows[targetRowIndex];
    if (!targetRow) return;
    const target = targetRow.items[Math.min(colIndex, targetRow.items.length - 1)];
    if (!target) return;
    const gridEl = list.querySelectorAll<HTMLElement>('.picker-cards-grid')[sectionIndex];
    if (!gridEl) return;
    const scRect = scroller.getBoundingClientRect();
    const rowScreenTop = gridEl.getBoundingClientRect().top + targetRow.top;
    const margin = getPickerGridGapPx();
    if (key === 'ArrowDown' && rowScreenTop + targetRow.height > scRect.bottom)
      scroller.scrollTop += rowScreenTop + targetRow.height - scRect.bottom + margin;
    else if (key === 'ArrowUp' && rowScreenTop < scRect.top)
      // 向上时额外让开吸顶的分区标题：只留行间距会把目标行顶到标题底下，而卡片顶部的和弦名
      // 正是画在那一带（分区标题吸在容器上沿，遮挡带恒为头高）
      scroller.scrollTop -= scRect.top - rowScreenTop + margin + getStickyHeadPx();

    // 两跳 rAF：滚动事件合帧 → 窗口更新渲染 → 目标卡可查询。偶尔仍未就绪再退避一帧重试
    const focusTarget = (retry = true) => {
      const el = list.querySelector<HTMLElement>(`[data-chord-id="${target.id}"]`);
      if (el) el.focus({ preventScroll: true });
      else if (retry) requestAnimationFrame(() => focusTarget(false));
    };
    requestAnimationFrame(() => requestAnimationFrame(() => focusTarget()));
  };

  // 停用即停：KeepAlive 把宿主缓存起来后，列表不该继续挂滚动监听、跑合帧回调。
  // **重新激活刻意不在这里配对 `activate`** —— 本模块不知道面板是否可见，而隐藏态下 activate 会把
  // 高亮算成空（几何全是零矩形）。故由宿主在 onActivated 里按 visible 决定是否接回
  //（见 ChordPickerPanel 的 wakeVirtualList）。
  onDeactivated(stop);

  onBeforeUnmount(stop);

  return {
    sectionsListRef,
    sectionPlans,
    visibleRows,
    pickerHeadBind,
    activeSectionId,
    sectionOptions,
    activeSectionValue,
    resetScrollTop,
    updateWindow,
    resetScrollBaseline,
    activate,
    refresh,
    deactivate,
    handleNavEdge,
  };
}
