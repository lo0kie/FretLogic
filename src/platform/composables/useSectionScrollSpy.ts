/**
 * 分区滚动定位 + 滚动高亮（scroll spy）：给「长列表按分区标题分段」的滚动容器用。
 *
 * 职责边界（三个动作全部与滚动位置相关，故必须收在一处）：
 * - **定位**：`scrollToSection` 把某分区平滑滚到容器顶部（补偿列表行间距，见其注释）；
 * - **高亮**：`updateActiveSection` 按当前视口反推激活分区；
 * - **冻结**：点选期间的平滑滚动会连续派发 scroll，若不放「按视口反推」停手，刚点下的高亮会被
 *   途经分区逐帧覆盖（表现为高亮来回跳）。落定判定见 freezeSectionSync。
 *
 * 宿主需要注入的只有「容器 / 元素从哪来」——本模块不查 DOM 结构，也不持有分区数据：
 * `sections` 给清单（顺序即滚动顺序，id 与元素上的 `sectionAttribute` 对应），
 * `getSectionEls` 给元素（实现方自行缓存：滚动帧里每帧 querySelectorAll 整棵子树很贵），
 * `onFrame` 是同一合帧内的附带动作（如行窗口重算）。
 *
 * 不持有任何业务依赖：只用滚动几何与 DOM，故放在 platform/composables。
 */
import { computed, nextTick, ref } from 'vue';

import { useRafThrottle } from '@/platform/composables/useRafThrottle';
import { resolveScrollBehavior } from '@/platform/utils/motion';

/** 分区的最小形状：id 用于定位（与 DOM 属性对应），title 用于分段控件文案 */
export interface SectionScrollSpySection {
  id: string;
  title: string;
}

export interface SectionScrollSpyOptions {
  /** 滚动容器（每帧读取，容器可能被 v-if 重建） */
  getScroller: () => HTMLElement | null;
  /** 取当前分区元素（顺序即滚动顺序）；实现方负责缓存与失效重查 */
  getSectionEls: () => HTMLElement[];
  /** 重建元素缓存（分区集合变化 / 容器重建后调用） */
  rebuildEls: () => void;
  /** 分区清单 */
  sections: () => SectionScrollSpySection[];
  /** 分区列表容器：仅用于取 rowGap 做定位补偿；不传则不补偿 */
  getList?: () => HTMLElement | null;
  /** 分区元素的属性名，默认 `data-section-id` */
  sectionAttribute?: string;
  /** 与「算高亮」共用同一 rAF 的附带动作（如可见行窗口重算） */
  onFrame?: () => void;
}

/** 目标位置与当前位置之差在此容差内即视为「无需滚动」：既免去一次空滚动，也避免挂上下一次
 *  永不派发的 scroll 事件（那样冻结状态就没人来解，用户之后的手动滚动高亮会永久停摆） */
const SETTLE_EPSILON_PX = 1;

/** 平滑滚动的兜底解冻时限：scrollend 与轮询两条路都断了也要把推导交还回去 */
const SCROLL_SETTLE_TIMEOUT_MS = 1200;

/** 视为「已在顶部」的 scrollTop 阈值（小于它直接高亮首区，不做逐分区几何比较） */
const TOP_SNAP_PX = 10;
/** 视为「已到底部」的余量：滚动容器底部常有亚像素误差，不给容差会漏判 */
const BOTTOM_SNAP_PX = 6;
/** 分区标题的判定线：分区顶距容器顶在此距离内即算「已滚到该分区」 */
const SECTION_HEAD_LINE_PX = 80;

export const useSectionScrollSpy = (options: SectionScrollSpyOptions) => {
  const sectionAttribute = options.sectionAttribute ?? 'data-section-id';

  /** 当前激活分区 id：由列表滚动位置推导（顶部=首区、底部=末区、否则最靠近容器顶部的分区） */
  const activeSectionId = ref<string | null>(null);

  /**
   * 点选期间冻结「滚动推导高亮」的状态机。
   *
   * 为什么需要它：底部定位条有两套写入 activeSectionId 的来源 —— 用户点选（明确意图，应立刻生效）
   * 与 scroll 事件按视口反推（随滚动连续变化）。平滑滚动会连续派发 scroll，若不放后者停手，
   * 刚点下的高亮会在滚动途中被途经分区的判定逐帧覆盖、抵达目标才回来，表现为「高亮不连贯」。
   *
   * 解冻条件取「滚动落定」而非固定时长：scrollend 为主（Chromium 支持），
   * rAF 轮询重读 scrollTop 为辅（老引擎缺该事件时兜底），超时兜底第三条，
   * 三条都断裂会留下永久冻结，故宁可早解也不晚解。
   */
  let frozen = false;
  /** 上一次轮询读到的 scrollTop；NaN = 本轮尚未轮询过（保证首帧一定判为「变了」，见 pollScrollSettled） */
  let lastPolledTop = Number.NaN;
  let settleRafId = 0;
  let settleTimerId: ReturnType<typeof setTimeout> | null = null;
  /**
   * scrollend 监听挂在哪一个元素上。摘除必须从这个**同一个**元素摘 —— 原先摘除时现取
   * `options.getScroller()`，而冻结期间滚动容器完全可能被重建（切页 / 换档位），
   * 那时新元素上没有这条监听，摘除静默失效、旧元素上的监听永远留着（泄漏 + 未来误触发）。
   */
  let frozenScroller: HTMLElement | null = null;

  const release = () => {
    frozen = false;
    // 一并作废轮询基线：下一轮冻结必须重新建立，否则会拿上一轮的位置当「没变」的证据
    lastPolledTop = Number.NaN;
    if (settleRafId) {
      cancelAnimationFrame(settleRafId);
      settleRafId = 0;
    }
    if (settleTimerId !== null) {
      clearTimeout(settleTimerId);
      settleTimerId = null;
    }
    // scrollend 必须显式摘除：三条解冻路径谁先到都算数，若由轮询/超时先解冻而把这条留着，
    // 它会在未来某次滚动结束时才触发（那时早已解冻，属残留监听）。摘的是挂上去的那个元素。
    frozenScroller?.removeEventListener('scrollend', release);
    frozenScroller = null;
  };

  /**
   * 轮询等待滚动落定：连续两帧 scrollTop 不变即认为到位。
   *
   * 基线取「上一次轮询读到的值」而非 freeze 那一刻的值 —— 后者等价于只比一帧：平滑滚动的
   * 首帧往往还没产生位移（浏览器要到下一次合成才动），会被当场判成「已经停住」而解冻，
   * 冻结等于没生效（高亮照样被途经分区逐帧覆盖）。
   */
  const pollScrollSettled = () => {
    const el = options.getScroller();
    if (!frozen || !el) {
      release();
      return;
    }
    if (el.scrollTop === lastPolledTop) {
      release();
      // 落定后再按最终视口补算一次：滚动途中被冻结的推导在此归位，高亮与视口严格一致
      updateActiveSection();
      return;
    }
    lastPolledTop = el.scrollTop;
    settleRafId = requestAnimationFrame(pollScrollSettled);
  };

  const freeze = () => {
    const el = options.getScroller();
    if (!el) return;
    release();
    frozen = true;
    settleRafId = requestAnimationFrame(pollScrollSettled);
    settleTimerId = setTimeout(release, SCROLL_SETTLE_TIMEOUT_MS);
    // scrollend 是首选信号：它精确对应「滚动真的停了」，比轮询与超时都更早、更准。
    // 不用 { once: true } —— 解冻要能把这条监听摘干净（见 release）
    frozenScroller = el;
    el.addEventListener('scrollend', release);
  };

  /** 底部定位分段控制的选项：每个分区一段 */
  const sectionOptions = computed(() => options.sections().map(s => ({ label: s.title, value: s.id })));

  /**
   * 底部定位分段控制的模型：读侧跟随当前激活分区（列表滚动 → 高亮段同步移动）；
   * 写侧点击/键盘切换时平滑滚动到该分区。
   * 只单向「滚动 → 状态」在上游写入 activeSectionId，此处 set 只触发滚动，不回写状态，避免与 scroll 事件形成回环。
   */
  const activeSectionValue = computed({
    get: () => activeSectionId.value ?? options.sections()[0]?.id ?? '',
    set: (sectionId: string) => {
      if (sectionId) scrollToSection(sectionId);
    },
  });

  /**
   * 点击底部定位分段控制的某一段：平滑滚动到该分区并将其标记为激活。
   *
   * 滚动期间必须**冻结**滚动推导：本函数的 scrollTo 会连续派发
   * scroll，若放 updateActiveSection 每帧按视口重算，刚点下的高亮会在滚动途中被中间分区的
   * 判定逐帧改掉，直到抵达目标才回来 —— 视觉上就是「高亮不连贯、来回跳」。
   * 点选是明确的用户意图，滚动途中它说了算；落定后才交还给滚动推导。
   */
  const scrollToSection = (sectionId: string) => {
    const scrollEl = options.getScroller();
    if (!scrollEl) return;
    const target = scrollEl.querySelector<HTMLElement>(`[${sectionAttribute}="${sectionId}"]`);
    if (!target) return;

    activeSectionId.value = sectionId;
    freeze();

    // 不用 scrollIntoView(block:'start')：它把分区顶齐到滚动容器最顶端，吞掉了分区列表
    // 的 gap-xl 间距，视觉上多滚一段。改为手动定位：目标绝对偏移减去列表行间距（gap），
    // 让分区标题落定后上方仍保留与其他分区一致的间距
    const list = options.getList?.();
    const gap = list ? parseFloat(getComputedStyle(list).rowGap) || 0 : 0;
    const top = target.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop - gap;

    // 目标已在当前视口顶部（含容差）：不会产生任何滚动，也就没有 scroll / scrollend 事件来解冻，
    // 必须就地解冻，否则下一次用户手动滚动的高亮会永久停摆
    if (Math.abs(top - scrollEl.scrollTop) <= SETTLE_EPSILON_PX) {
      release();
      return;
    }

    scrollEl.scrollTo({ top, behavior: resolveScrollBehavior('smooth') });
  };

  /** 按滚动位置计算当前应高亮的分区：顶部取首区、底部取末区，否则取最接近容器顶部的分区 */
  const updateActiveSection = () => {
    // 点选平滑滚动途中：本函数每帧都会被 scroll 唤起，但此期间高亮由用户意图说了算，
    // 按视口重算只会把点选的段改掉（高亮不连贯的成因，见 freeze 的说明）
    if (frozen) return;

    const sections = options.sections();
    const scrollEl = options.getScroller();
    if (!scrollEl || sections.length === 0) {
      activeSectionId.value = null;
      return;
    }

    if (scrollEl.scrollTop <= TOP_SNAP_PX) {
      activeSectionId.value = sections[0]!.id;
      return;
    }

    if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - BOTTOM_SNAP_PX) {
      activeSectionId.value = sections[sections.length - 1]!.id;
      return;
    }

    // 分区元素走宿主的缓存（计数守卫兜底重查），不再每帧 querySelectorAll
    const els = options.getSectionEls();
    if (els.length === 0) {
      activeSectionId.value = sections[0]!.id;
      return;
    }

    const containerRect = scrollEl.getBoundingClientRect();
    let currentId: string | null = null;

    for (const sec of els) {
      const rect = sec.getBoundingClientRect();
      if (rect.top - containerRect.top <= SECTION_HEAD_LINE_PX) currentId = sec.getAttribute(sectionAttribute);
    }

    activeSectionId.value = currentId ?? sections[0]!.id;
  };

  /** 滚动事件按帧合帧：每帧只做一次激活分区计算 + 宿主注册的附带动作（可见行窗口更新） */
  const { schedule: scheduleUpdate, cancel: cancelPendingUpdate } = useRafThrottle(() => {
    updateActiveSection();
    options.onFrame?.();
  });
  const handleScroll = () => scheduleUpdate();

  /** 滚动区回到顶部，并同步高亮第一个分区 */
  const resetScrollTop = () => {
    const scrollEl = options.getScroller();
    if (scrollEl) scrollEl.scrollTop = 0;
    const sections = options.sections();
    if (sections.length > 0) activeSectionId.value = sections[0]!.id;

    nextTick(() => updateActiveSection());
  };

  /** 分区集合变化：把失效的激活分区收敛回首区（空集合则清空） */
  const syncSections = () => {
    const sections = options.sections();
    if (sections.length > 0) {
      if (!sections.some(s => s.id === activeSectionId.value)) activeSectionId.value = sections[0]!.id;
    } else activeSectionId.value = null;
  };

  /** 挂上滚动监听并做一次初算（面板打开时调用；随后宿主通常还要跑一次 onFrame） */
  const activate = () => {
    options.getScroller()?.addEventListener('scroll', handleScroll, { passive: true });
    options.rebuildEls();
    updateActiveSection();
    // 收敛到有效分区，而不是无条件覆写成首区：updateActiveSection 已按当前视口算出该高亮哪一节，
    // 无条件写首区会把它当场盖掉 —— 表现为「面板一打开，高亮总跳回第一项」（滚动位置明明在下面）
    syncSections();
  };

  /** 元素缓存失效后重算一次（分区重排、容器尺寸落定后调用） */
  const refresh = () => {
    options.rebuildEls();
    updateActiveSection();
  };

  /**
   * 停止滚动推导：摘监听、取消已排队的合帧回调、解冻。
   *
   * 取消排队回调是必需的：面板关闭后若还跑一次「算高亮」，读的是 display:none 下的零矩形，
   * 白算且可能把状态写成空。解冻也不能跨开关存活：留着冻结态的话，下次打开后滚动推导会停摆。
   */
  const stop = () => {
    options.getScroller()?.removeEventListener('scroll', handleScroll);
    cancelPendingUpdate();
    release();
  };

  /** 停止推导并清空激活分区（面板关闭时调用） */
  const deactivate = () => {
    stop();
    activeSectionId.value = null;
  };

  // 只导出宿主真正消费的成员：scrollToSection / updateActiveSection / handleScroll / cancelPendingUpdate
  // 都是内部装配件（分别被 activeSectionValue 的 setter、rAF 合帧、activate / stop 使用），不外露
  return {
    activeSectionId,
    sectionOptions,
    activeSectionValue,
    resetScrollTop,
    syncSections,
    activate,
    refresh,
    stop,
    deactivate,
  };
};
