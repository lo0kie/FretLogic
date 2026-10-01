import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue';

import type { LineData } from '@/domains/score/preview/services/scoreExportCanvas';
import type { ComputedRef, Ref } from 'vue';

export interface UseScoreViewportRenderOptions {
  /** 谱面滚动容器：预加载 / 滚动位置采样 / 落底滚动的入口 */
  scoreZoneRef: Ref<HTMLElement | null>;
  /** 全部行数据（含两侧边和弦）：总行数决定渲染窗口的上限 */
  lyricsLinesWithEdges: ComputedRef<LineData[]>;
  /**
   * 单行的**完整占位高度**（容器局部 px，含该行与其下方那条行间间隙）。
   *
   * 由排列区的排版算式给出（`measureArrangeLineHeight` + 行间 gap），**与实绘同源**：canvas 行
   * 的高度就是它，故离屏行与已挂载行逐像素一致，内容总高不随「哪些行挂进了 DOM」漂移。
   * 逐行调用，故实现必须是纯算术（不许做文本度量）—— 见 measureArrangeLineHeight 的说明。
   */
  lineHeightOf: (lineId: string) => number;
  /** 视觉 px → 容器局部 px（容器带 zoom 时两者差一个倍率） */
  toContainerPx: (visualPx: number) => number;
  /** 容器局部 px → 视觉 px */
  toVisualPx: (containerPx: number) => number;
  /** 手势缩放的沉降窗口是否打开（窗口内一律不补挂） */
  isZoomSettling: () => boolean;
  /** 内容高度变化后刷新边缘滚动按钮的可见性 */
  refreshEdgeVisibility: () => void;
  /** 平滑滚至容器底部（落底会话的驱动） */
  scrollToBottom: (behavior?: unknown) => void;
  /** 读当前歌曲 id：落底循环中途切歌即终止 */
  getActiveSongId: () => string | null;
}

/**
 * 渐进式视口渲染：**哪些行真正挂进 DOM**、其余行怎么以占位高度参与布局，以及三条补挂路径。
 *
 * 两条不变量（改动本文件前先读这两条）：
 * 1. **布局是「前缀 + 空档 + 视口窗口 + 空档 + 尾部」的分段模型**，空档里没有任何 DOM，只按占位
 *    高度撑高。空档高度与「视口落在空档里的哪个位置」两套数**必须同源**（都按 linePlaceholderHeight
 *    累加、已挂载行也不例外），否则两套数会互相漂移。占位高度本身由 `lineHeightOf` 给出 ——
 *    **与实绘同源**（排列区的排版算式），故同一行无论挂没挂都取同一个数。
 *    没有空档时（前缀之外还剩下没挂的行）那一段由宿主挂一枚撑高元素按同一份占位高度撑出
 *    （见 tailPlaceholderHeight）—— 占位不只有「空档的 margin」一处出口，三处出口必须同源，
 *    否则内容总高照样会随分片挂载而变。
 * 2. **手势缩放沉降窗口内一律不补挂**（见 isZoomSettling）—— 提交会改内容总高，补挂会叠在提交帧上。
 *
 * 背景：超大乐谱首屏一次性同步挂载固定 30 行时，主线程被占满约 350ms。故改为「同步挂载最小行数
 * → 按行高补齐到填满视口 → 其余交给滚动哨兵按需扩容」三段式：首帧只承担最小行数的挂载成本，
 * 后续行全部落在后续帧/后续交互里。
 *
 * ⚠️ 行高**不再实测**（canvas 化之前是逐行读 `getBoundingClientRect` 再按「有卡 / 无卡」分档取
 * 最大值）：排列区的行高由排版算式直接给出，实测这条路整体删除。少的不只是几十行代码 ——
 * 「实测值在空档存在期间必须冻结」（否则 scrollHeight 一边滚一边变、落底目标跟着挪）这条约束
 * 一并消失：算式是纯函数，同一行永远给同一个值。
 */
export function useScoreViewportRender({
  scoreZoneRef,
  lyricsLinesWithEdges,
  lineHeightOf,
  toContainerPx,
  toVisualPx,
  isZoomSettling,
  refreshEdgeVisibility,
  scrollToBottom,
  getActiveSongId,
}: UseScoreViewportRenderOptions) {
  // —— 渐进式视口渲染参数 ——
  /** 首屏同步挂载的最小行数：只保证首帧一定有内容，不追求填满视口（补齐由 ensureSufficientRenderedLines 完成） */
  const MIN_INITIAL_RENDER_LINE_COUNT = 8;
  /** 单次扩容行数：取小批量以摊平滚动中的单帧挂载成本（大批量会在滚动时制造长任务） */
  const RENDER_BATCH_SIZE = 10;
  /** 视口之外额外预渲染的像素高度：首屏补齐目标，也是滚动预加载的基准窗口 */
  const VIEWPORT_PRELOAD_PX = 400;
  /** 滚动哨兵提前触发距离：必须小于 VIEWPORT_PRELOAD_PX，否则首屏挂载后哨兵立刻命中、白白多扩容一批 */
  const SENTINEL_ROOT_MARGIN_PX = 200;
  /** 滚动兜底扩容阈值：剩余可滚动距离小于该值时立即扩容。故意大于预加载窗口，用于快速拖拽滚动条时不露白 */
  const SCROLL_PRELOAD_THRESHOLD_PX = 800;
  /**
   * 「大位移帧」判定阈值(px)：本帧位移吃掉整个预加载窗口时，补挂的提前量当场作废（见 handleScroll）。
   * 取 `VIEWPORT_PRELOAD_PX` 而不是某个经验值 —— 补挂预留的就是这个窗口，一帧走完它，
   * 挂进去的行下一帧就在视口外了。正常滚轮（约 100px/帧）与触摸板惯性都远低于此值，不会误伤。
   */
  const SCROLL_BULK_DELTA_PX = VIEWPORT_PRELOAD_PX;
  /** 「已贴底」的判定余量(px)：滚动容器底部常有亚像素误差，不给容差会漏判（与 useSectionScrollSpy 同口径） */
  const BOTTOM_SNAP_PX = 6;
  /** 补底轮次上限：每轮「重量行高 + 落一次底 + 等它停稳」，用完仍未贴底就收手，绝不无限滚 */
  const BOTTOM_CHASE_MAX_ROUNDS = 4;
  /** 「滚动到底部」建尾部窗口时一次挂载的行数：覆盖视口一屏多，即落地后用户真正会看的那一段 */
  const TAIL_RENDER_ROWS = 12;

  /**
   * 「滚动到底部」的滚动动画是否进行中。声明在**全部消费方之前**：扩容哨兵与滚动兜底
   * （expandNextBatch / handleScroll）都排在会话逻辑之前，却都要按它让路 —— 动画期间补挂会改内容高度、
   * 把动画目标挪走。用普通变量而非 ref：它只在循环内部被读写，不驱动任何渲染。
   */
  let isExpandingToBottom = false;

  /**
   * 上一次已应用渲染窗口的歌曲 id：切歌（含 KeepAlive 复用实例）时据此重置全部窗口状态。
   * 也是落底循环的终止判据 —— 中途切歌即收手，交由切歌路径重置。
   */
  let lastRenderedSongId = getActiveSongId();

  const renderedLineCount = ref(MIN_INITIAL_RENDER_LINE_COUNT);

  /**
   * 尾部窗口的行数（从末尾数）。>0 时布局变成「前缀 + 空档 + 尾部」三段：前缀仍是
   * [0, renderedLineCount)，尾部是末尾那几十行，中间那段**不挂进 DOM**、只按占位高度撑高（见 gapMarginOf）。
   * 这是「滚动到底部」不必等整份乐谱挂完的全部原因 —— 它要的只是末尾那一屏真实内容，
   * 中途滚过去的那些行根本不需要存在。
   */
  const tailLineCount = ref(0);

  /**
   * 视口窗口：用户把视口拖进空档里时，围绕视口挂的那一小段真实行。
   *
   * 三段模型只能表达「从头挂到 R」与「挂末尾 T 行」两个窗口 —— 视口落在空档中间时**两侧都够不着**，
   * 于是拖滚动条到中间永远是一片空白（本窗口解决的正是这个）。加上它之后布局变成
   * 「前缀 + 空档 + 视口窗口 + 空档 + 尾部」，视口落在哪都能有真实内容，与普通虚拟列表同构。
   * 只保留一段：新窗口与旧窗口取并集（见 placeViewportWindow），用户在同一段空档里来回滚时不反复拆挂。
   */
  const viewportWindow = ref<{ start: number; count: number } | null>(null);

  /** 尾部窗口首行的下标（未启用尾部窗口时等于总行数，此时没有任何行会被判为「空档承载行」） */
  const tailStartIndex = computed(() => {
    const total = lyricsLinesWithEdges.value.length;
    return tailLineCount.value > 0 ? Math.max(renderedLineCount.value, total - tailLineCount.value) : total;
  });

  /** 是否还有没挂进 DOM 的空档。空档存在期间补挂改走 expandGap（视口位置驱动） */
  const hasGap = computed(() => tailLineCount.value > 0 || viewportWindow.value !== null);

  /**
   * 单行的占位高度（容器局部 px）：**直接取 `lineHeightOf`** —— 排列区的排版算式，含行间间隙。
   *
   * 它是三处占位出口共用的唯一来源（见文件头不变量 ①）：空档的 margin-top、撑高元素的 height、
   * 「视口落在空档里哪个位置」的估算，全部按本函数逐行累加，同一行无论挂没挂都取同一个数。
   *
   * 间隙算在本行头上（而不是单列一项）：行在布局里就是「行高 + 它下面那条间隙」，挂进来一行、
   * 长出来的正好是这一整份；未挂载段按本值累加，两边的账才对得上。
   *
   * ⚠️ 本账**不含**下面两笔，故「内容总高在分片挂载期间恒定」是**近似**而非严格恒等 —— 差额有界、
   * 且都出现在「空档出现」那一瞬间，量级远小于一屏（前者 32px、后者一条行间间隙）：
   * ① 扩容哨兵（宿主模板里的 `.h-8` = 32px）：只在「还没有空档」时挂在末尾，空档一出现即摘除，
   *    总高随之短 32px；
   * ② 末行之后那条行间间隙：逐行计入意味着 N 行含 N 条间隙，而 DOM 里的 flex `gap` 只出现在相邻
   *    子项之间（哨兵与撑高元素也是子项），差一条 `lineGapPx`（桌面 6px / 窄屏 2px）。
   * 抹平这两笔要把哨兵高度也纳入三处出口（宿主那两处 DOM 出口 + 本文件的估算出口），属独立改动。
   */
  const linePlaceholderHeight = (lineId: string): number => lineHeightOf(lineId);

  /**
   * 某一段行（[start, end)）按占位高度估算的高度。
   *
   * 已挂载的行也按占位高度算 —— 空档高度与「视口落在空档里的哪个位置」两套数必须同源，
   * 同一行无论挂没挂、在估算里高度一致，两套数才不会互相漂移。
   */
  const placeholderHeightBetween = (start: number, end: number): number => {
    const lines = lyricsLinesWithEdges.value;
    let height = 0;
    for (let i = Math.max(0, start); i < end && i < lines.length; i++)
      height += linePlaceholderHeight(lines[i]!.lineId);
    return height;
  };

  /**
   * 最后一段已挂载行的**末沿**（行下标，左闭右开）：已挂载段里最靠下的那一处的结束位置。
   *
   * 尾部窗口存在时它一路挂到末尾（末沿 = 总行数）；否则是视口窗口的末沿；再否则是前缀的末沿。
   * 它就是「撑高元素该代表的那一段」的起点 —— 见 tailPlaceholderHeight。
   */
  const lastRenderedEnd = computed(() => {
    if (tailLineCount.value > 0) return lyricsLinesWithEdges.value.length;
    const win = viewportWindow.value;
    if (win) return win.start + win.count;
    return renderedLineCount.value;
  });

  /**
   * 还没挂进 DOM 的那一段（[lastRenderedEnd, 总行数)）的占位高度（容器局部 px）——
   * 宿主把它挂成末尾一枚撑高元素，**内容总高因此在分片挂载期间恒定**：挂进来一行，它就矮一行。
   *
   * 没有它时内容总高只等于已挂载的那几行（末沿之后那一段在 DOM 里根本没有代表），每补一批就长
   * 一截、滚动条拇指一路缩 —— 用户看到的「一边滚一边变短」正是这个，与占位高度算得准不准无关。
   *
   * ⚠️ **它代表的是「末沿之后」，不只是「前缀之后」**：三段模型里，视口窗口**下方**那一段只能由
   * 尾部窗口首行的 margin-top 撑出（见 gapMarginOf）—— 而尾部窗口只在「滚动到底部」那条路上才立。
   * 靠拖滚动条进空档时窗口下方是空的，于是窗口每跟着视口挪一格、末沿之后那一段就没人代表，
   * 内容总高当场短一截、滚动位置被夹回去 —— 「拖到底部再慢慢往上滚，中间那一段永远不出现」
   * 就是这个。把撑高元素接到末沿之后，窗口下方那段也有代表，两种窗口形态下都成立。
   */
  const tailPlaceholderHeight = computed(() => {
    const total = lyricsLinesWithEdges.value.length;
    const end = lastRenderedEnd.value;
    if (end >= total) return 0;
    return placeholderHeightBetween(end, total);
  });

  /** 已挂进 DOM 的一段行区间（左闭右开） */
  interface RenderedRange {
    start: number;
    end: number;
  }

  /** 已挂进 DOM 的行区间（升序、互不相接）：前缀 + 可选的视口窗口 + 尾部 */
  const renderedRanges = (): RenderedRange[] => {
    const ranges = [{ start: 0, end: renderedLineCount.value }];
    const win = viewportWindow.value;
    if (win) ranges.push({ start: win.start, end: win.start + win.count });
    if (tailLineCount.value > 0) ranges.push({ start: tailStartIndex.value, end: lyricsLinesWithEdges.value.length });
    return ranges;
  };

  /**
   * 前缀窗口能长到哪：有视口窗口时不能长过它的起点 —— 两段重叠会让同一行在 visibleLines 里
   * 出现两次（重复 key），且空档承载行的 margin 会落在被前缀吃掉的那一行上。
   * 现读而不缓存：调用方之间隔着 await，期间可能有停稳补挂把窗口插进来。
   */
  const prefixLimit = (): number => viewportWindow.value?.start ?? lyricsLinesWithEdges.value.length;

  /**
   * 承载空档那一行的上外边距：把未挂载的那一段按占位高度撑出来。
   *
   * 至多两处承载行：视口窗口的首行承载它上面那段空档，尾部窗口的首行承载它与前一段之间的空档。
   *
   * 之所以挂成「首行的 margin-top」而不是在两段之间插一个空档元素：本行是 `v-memo` 的缓存单元，
   * 要插兄弟节点就得把整个 v-for 包进 `<template>`（整块缩进随之全变），而 margin 只给这一行加一个绑定。
   * 它在 v-memo 依赖表里也占一行，写的是本函数的**返回值** —— 除承载行外恒为 undefined，
   * 故空档缩短时只有承载行与新承载行两行失效，其余行照旧命中缓存。
   */
  const gapMarginOf = (lineIdx: number): string | undefined => {
    const win = viewportWindow.value;
    if (win && lineIdx === win.start) {
      const above = placeholderHeightBetween(renderedLineCount.value, win.start);
      return above > 0 ? `${above}px` : undefined;
    }
    if (tailLineCount.value > 0 && lineIdx === tailStartIndex.value) {
      const above = placeholderHeightBetween(
        win ? win.start + win.count : renderedLineCount.value,
        tailStartIndex.value
      );
      return above > 0 ? `${above}px` : undefined;
    }
    return undefined;
  };

  /** 当前挂进 DOM 的歌词行：前缀 + 视口窗口 + 尾部（其余是空档，不渲染） */
  const visibleLines = computed(() => {
    const lines = lyricsLinesWithEdges.value;
    const prefix = lines.slice(0, renderedLineCount.value);
    const tailStart = tailStartIndex.value;
    const tail = tailStart < lines.length ? lines.slice(tailStart) : [];
    const win = viewportWindow.value;
    if (!win) return tail.length > 0 ? [...prefix, ...tail] : prefix;
    return [...prefix, ...lines.slice(win.start, win.start + win.count), ...tail];
  });

  const sentinelRef = useTemplateRef<HTMLElement>('sentinelRef');
  let sentinelObserver: IntersectionObserver | null = null;

  /**
   * 视口渲染扩容：扩容哨兵可见 / 滚动接近底部时追加渲染行数。
   *
   * 两种情况下**一律不接**，由别的机制接管：
   * - 「滚动到底部」的滚动动画进行中（isExpandingToBottom）：此时补挂会改内容高度、把动画目标挪走；
   * - 空档存在时（hasGap）：本函数的触发条件是「接近**容器**底部」，而那时容器的底部是尾部（或视口
   *   窗口）的底部、与前缀无关，照旧走会把前缀挂到不需要的位置上 —— 还会长过视口窗口的起点、
   *   让同一行在 visibleLines 里出现两次。那一段由 expandGap 按视口位置驱动。
   */
  const expandNextBatch = () => {
    if (isExpandingToBottom || hasGap.value) return;
    // 手势缩放的沉降窗口内**一律不补挂** —— 这里是全部补挂路径的收口（扩容哨兵与两条滚动兜底
    // 都经它），故闸门设在这一处。口径与代价见 useViewZoomSettle 的 markViewZoomSettling。
    if (isZoomSettling()) return;
    if (renderedLineCount.value < lyricsLinesWithEdges.value.length)
      renderedLineCount.value = Math.min(
        lyricsLinesWithEdges.value.length,
        renderedLineCount.value + RENDER_BATCH_SIZE
      );
  };

  /** 建立/重建 IntersectionObserver：观察扩容哨兵，接近底部时静默扩容 */
  const setupSentinelObserver = () => {
    if (sentinelObserver) {
      sentinelObserver.disconnect();
      sentinelObserver = null;
    }
    if (typeof IntersectionObserver === 'undefined') return;
    const root = scoreZoneRef.value;
    const sentinel = sentinelRef.value;
    if (!root || !sentinel) return;
    sentinelObserver = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) expandNextBatch();
      },
      {
        root,
        rootMargin: `${SENTINEL_ROOT_MARGIN_PX}px 0px`,
      }
    );
    sentinelObserver.observe(sentinel);
  };

  /** 断开扩容哨兵观察（幂等）：失活 / 卸载时调用 */
  const disposeSentinelObserver = () => {
    if (sentinelObserver) {
      sentinelObserver.disconnect();
      sentinelObserver = null;
    }
  };

  watch(sentinelRef, () => void setupSentinelObserver());

  /** 同一首歌内编辑歌词导致行数缩减时钳制渲染窗口：
   *  renderedLineCount 只在切歌时重置（onActivated / activeSongId watch），歌内删行后窗口
   *  会大于实际行数（slice 天然安全，但「扩容进度」被白保留）。主动收缩窗口（滚完即减）
   *  需要配合滚动锚定，否则内容高度变化会让滚动条跳动——那属体验决策，未实施。 */
  watch(
    () => lyricsLinesWithEdges.value.length,
    total => {
      if (renderedLineCount.value > total) renderedLineCount.value = total;
      // 尾部窗口同样要收缩：两段加起来不能超过总行数（否则空档高度算成负数）
      if (tailLineCount.value > total - renderedLineCount.value)
        tailLineCount.value = Math.max(0, total - renderedLineCount.value);
      // 视口窗口同理：行数缩到「整份都已挂载」（前缀已含全部行）时整段丢弃，否则会出现重复行；
      // 缩到窗口底下时钳掉（否则 slice 越界、空档高度算成负数）。上限取 0 即「不许有窗口」
      const win = viewportWindow.value;
      const winLimit = renderedLineCount.value >= total ? 0 : tailStartIndex.value;
      if (win && win.start >= winLimit) viewportWindow.value = null;
      else if (win && win.start + win.count > winLimit)
        viewportWindow.value = { start: win.start, count: winLimit - win.start };
    }
  );

  /** 确保首屏已渲染的行数足以填满视口（高分屏或大视口下自动补齐），并在不足时按批兜底扩容 */
  const ensureSufficientRenderedLines = async () => {
    await nextTick();
    const el = scoreZoneRef.value;
    if (!el || el.clientHeight === 0) return;
    // 按首行的占位高度把渲染窗口补齐到「视口 + 预加载」，避免为填满视口而多挂载一整批行
    const [firstLine] = lyricsLinesWithEdges.value;
    const rowHeight = firstLine ? lineHeightOf(firstLine.lineId) : 0;
    if (rowHeight > 0) {
      // rowHeight 是容器局部 px，视口高度是视觉 px：换算到同一尺度再算行数（见 toVisualPx）
      const needed = Math.ceil((el.clientHeight + VIEWPORT_PRELOAD_PX) / toVisualPx(rowHeight));
      if (needed > renderedLineCount.value) renderedLineCount.value = Math.min(prefixLimit(), needed);
      await nextTick();
    }
    // 兜底：行高估算偏低（超矮行 / 极端窄视口）时继续按批扩容，直到内容真的能滚动
    while (renderedLineCount.value < prefixLimit() && el.scrollHeight <= el.clientHeight) {
      renderedLineCount.value = Math.min(prefixLimit(), renderedLineCount.value + RENDER_BATCH_SIZE);
      await nextTick();
    }
    // 内容高度（scrollHeight）变化不会触发 ResizeObserver/scroll，须在此处显式重算边缘
    //（覆盖长→短乐谱切歌后 FAB 不消失、短→长后顶/底部按钮不出现等场景）
    await nextTick();
    refreshEdgeVisibility();
  };

  onMounted(() => void ensureSufficientRenderedLines());

  /**
   * 把 [from, to) 挂成真实行：与前缀 / 尾部相接就并进去（不留空档），否则成为视口窗口。
   * 与已有的视口窗口取并集 —— 挂载是最贵的一步，用户在同一段空档里来回滚时不该反复拆挂。
   */
  const placeViewportWindow = (from: number, to: number) => {
    const total = lyricsLinesWithEdges.value.length;
    const win = viewportWindow.value;
    let start = from;
    let end = to;
    // 相接（含恰好相邻）就取并集：相邻却不合并，会让同一段行在两次补挂之间被拆掉再挂一遍
    if (win && win.start <= end && start <= win.start + win.count) {
      start = Math.min(start, win.start);
      end = Math.max(end, win.start + win.count);
    }
    // 与前缀相接 ⇒ 并进前缀
    if (start <= renderedLineCount.value) {
      renderedLineCount.value = Math.max(renderedLineCount.value, end);
      viewportWindow.value = null;
      // 前缀一路吃到尾部 ⇒ 整份乐谱都在 DOM 里了，退回普通的前缀窗口（没有空档可言）
      if (tailLineCount.value > 0 && renderedLineCount.value >= tailStartIndex.value) {
        renderedLineCount.value = total;
        tailLineCount.value = 0;
      }
      return;
    }
    // 与尾部相接 ⇒ 并进尾部
    if (tailLineCount.value > 0 && end >= tailStartIndex.value) {
      tailLineCount.value = total - start;
      viewportWindow.value = null;
      return;
    }
    viewportWindow.value = { start, count: end - start };
  };

  /**
   * 把视口那一截补成真实行，返回是否补了。
   *
   * 空档里没有任何 DOM，视口落进去就是一片空白 —— 补的量只按「视口 + 上下预加载窗口」算，
   * 与视口在空档里陷得多深无关：拖到空档正中间也只挂一屏多，不会把从空档上沿到视口那几百行
   * 一起挂进来（那正是「拖着滚动条一路卡」的老病根）。
   */
  const fillGapAtViewport = (el: HTMLElement): boolean => {
    const lines = lyricsLinesWithEdges.value;
    const total = lines.length;
    // 视口边界取视觉 px，下面累加的是容器局部 px（见 linePlaceholderHeight），故先换算到局部尺度
    const coverTop = toContainerPx(Math.max(0, el.scrollTop - VIEWPORT_PRELOAD_PX));
    const coverBottom = toContainerPx(el.scrollTop + el.clientHeight + VIEWPORT_PRELOAD_PX);

    const ranges = renderedRanges();
    let offset = 0;
    let index = 0;
    let next = 0;
    while (index < total) {
      const range = ranges[next];
      // 已挂载的一段（或已被越过的段）：跳过，只累加它的高度。
      // 判据用 `>=` 而不是 `===`：万一区间表的升序 / 不重叠前提被破坏，这里也不能原地打转
      if (range && index >= range.start) {
        next += 1;
        for (; index < range.end; index++) offset += linePlaceholderHeight(lines[index]!.lineId);
        continue;
      }
      // 未挂载的一段（空档）：整体累加，顺带记下「视口 + 预加载」落在哪几行
      const gapEnd = range ? range.start : total;
      const gapTop = offset;
      // 本段已在「视口 + 预加载」之下 ⇒ 它和它之后的每一段都在下面，没有需要补的了
      if (gapTop >= coverBottom) return false;
      let from = -1;
      let to = -1;
      for (; index < gapEnd; index++) {
        offset += linePlaceholderHeight(lines[index]!.lineId);
        if (from < 0 && offset > coverTop) from = index;
        if (to < 0 && offset >= coverBottom) to = index + 1;
      }
      if (offset <= coverTop) continue; // 本段整个在「视口 + 预加载」之上（在下面的那些已提前返回）
      placeViewportWindow(from < 0 ? gapEnd - 1 : from, to < 0 ? gapEnd : to);
      return true;
    }
    return false;
  };

  /**
   * 让视口落在真实行上（空档里没有 DOM，视口落进去就是一片空白）。
   *
   * 视口在空档边缘时，补出来的这一截会与前缀 / 尾部相接、直接并进去；落在空档中间时成为独立的
   * 「视口窗口」，空档随之被切成两段。至多两段空档可能与视口相交（视口横跨视口窗口的上下沿时），
   * 故跑两趟；每趟挂完布局都会变，所以每趟都按当前布局重算。
   *
   * 位置判断用估算而非量 DOM：全部按占位高度累加（已挂载的行也按同一口径），与空档高度的算法同源，
   * 故「空档在哪」与「视口落在空档里的哪个位置」两套数不会互相漂移。
   */
  const expandGap = (el: HTMLElement) => {
    for (let pass = 0; pass < 2; pass++) if (!fillGapAtViewport(el)) return;
  };

  /**
   * 滚动帧里的补挂。两种形态的代价差着量级，故分两档：
   *
   * - **有空档：每帧都按视口位置补**（expandGap）。空档里没有任何 DOM，视口滚进去就是一片空白，
   *   而按位置补要遍历全部行、还会挂进新行 —— 恰恰是这份开销换来了「滚到哪都有内容」。改成
   *   「停稳再补」会让慢速滚动一路看着空白：拖到底部再慢慢往上滚，中间那一段永远不出现。
   *   这条是空档模型本来的行为，不要收。
   * - **没有空档：只做廉价判据**（一次 scrollHeight 读 + 原来的「剩余可滚距离」判据，不挂载）。
   *   挂载交给扩容哨兵按距离分批触发。若在这里也按视口位置补，每帧都会重算渲染窗口、挂进新行
   *   （视口每前进一点、窗口下沿就前进一点），等于把挂载摊成每帧一次长任务，观感是一路掉帧。
   */
  const expandOnScrollFrame = (el: HTMLElement) => {
    if (hasGap.value) {
      expandGap(el);
      return;
    }
    const remainingScroll = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remainingScroll < SCROLL_PRELOAD_THRESHOLD_PX) expandNextBatch();
  };

  /**
   * 按当前视口位置补挂（两种窗口形态各有一套判据）：
   * - 有空档时由空档位置驱动 —— 前缀那套「剩余可滚距离」在此不成立，容器的底部是尾部 / 视口窗口的底部；
   * - 没有空档时再补一次按视口位置的扩容。
   *
   * 没有空档也要补的理由：未挂载段现在有撑高元素占着（见 tailPlaceholderHeight），快拖滚动条停稳后
   * 视口可能正落在它里面 —— 那时「剩余可滚距离」还很大（撑高元素自己就占着），下面那条按剩余距离的
   * 判据命中不了，只有按视口位置补才补得上。视口还在已挂载段里时，expandGap 自己会判出「要补的那
   * 一段在上方之外」并原样返回。
   *
   * ⚠️ **本函数只服务一次性时机**（滚动停稳 / 手势缩放沉降收口），不进滚动帧 —— 见 expandOnScrollFrame。
   */
  const expandAtViewport = (el: HTMLElement) => {
    if (!hasGap.value) expandGap(el);
    expandOnScrollFrame(el);
  };

  /** 上一帧的滚动位置：用来识别大位移帧（见 handleScroll） */
  let lastScrollTop = 0;
  /** 「滚动停下后补一次」的轮询句柄：切歌 / 失活 / 卸载时取消 */
  let settleExpandRafId: number | null = null;

  /**
   * 滚动停下后补一次挂载。
   *
   * `scroll` 只在滚动期间派发，停下之后不再来一发，而大位移帧被跳过的那些补挂得有人收口。
   * 用 rAF 轮询「连续两帧 `scrollTop` 不变」当作停下（与落底补底同口径，同样不引 `scrollend`：
   * 本处生命周期也完全自持）。停稳后调用方那一帧的位移为 0，不会再被判成大位移帧。
   */
  const scheduleExpandOnScrollSettle = () => {
    if (settleExpandRafId !== null) return;
    let lastTop = scoreZoneRef.value?.scrollTop ?? 0;
    const tick = () => {
      settleExpandRafId = null;
      const el = scoreZoneRef.value;
      if (!el || isExpandingToBottom) return;
      // 还在滚：继续等它停稳
      if (el.scrollTop !== lastTop) {
        lastTop = el.scrollTop;
        settleExpandRafId = requestAnimationFrame(tick);
        return;
      }
      // 沉降窗口内不补挂（闸门见 expandNextBatch），采样点照常推进（同 handleScroll）
      if (isZoomSettling()) {
        lastScrollTop = el.scrollTop;
        return;
      }
      lastScrollTop = el.scrollTop;
      // 停稳是**一次性**时机：这里才允许走按视口位置补那条重路子（见 expandAtViewport 的警告）。
      // 未挂载段现在有撑高元素占着，快拖把视口丢进它里面时「剩余可滚距离」还很大，
      // 只有按位置补才补得上 —— 而这时滚动已经停了，挂载长任务不会叠在滚动帧上。
      expandAtViewport(el);
    };
    settleExpandRafId = requestAnimationFrame(tick);
  };

  /** 取消「滚动停下后补一次」的轮询（幂等）：切歌 / 失活 / 卸载时调用 */
  const cancelSettleExpand = () => {
    if (settleExpandRafId !== null) {
      cancelAnimationFrame(settleExpandRafId);
      settleExpandRafId = null;
    }
  };

  /**
   * 滚动过程中的补挂：快速拖拽滚动条或大幅度滚动时的兜底预加载扩容。
   *
   * **大位移帧一律不补挂。** 补挂的语义是「提前挂还没进视口的行」——一帧走掉整个预加载窗口时，
   * 本帧挂进去的行下一帧就在视口外了，白付一次挂载长任务（一行含指板图卡约十几毫秒）；
   * 而拖滚动条拇指恰恰是「每帧都超阈值」，于是每帧一批连起来就是一路卡。
   * 用户真正停下来时由 `scheduleExpandOnScrollSettle` 补一次，视口不会停在未挂载的内容上。
   *
   * **帧内只做廉价判据**（见 expandOnScrollFrame）：挂载本身交给扩容哨兵按距离分批触发，
   * 而不是每帧按视口位置重算一次渲染窗口 —— 后者每帧都会挂进新行，等于把挂载摊成每帧一次长任务。
   *
   * **手势缩放期间同样一律不补挂**，由沉降窗口收口（见 useViewZoomSettle 的 markViewZoomSettling）。
   */
  const handleScroll = () => {
    const el = scoreZoneRef.value;
    if (!el || renderedLineCount.value >= lyricsLinesWithEdges.value.length) return;
    // 「滚动到底部」的滚动动画进行中：补挂会改内容高度、把动画目标挪走
    if (isExpandingToBottom) return;
    // 沉降窗口内不补挂（闸门见 expandNextBatch），也无需起「等停稳」的轮询。
    // 采样点照常推进，否则收口后的第一帧会被误判成大位移帧、白等一轮
    if (isZoomSettling()) {
      lastScrollTop = el.scrollTop;
      return;
    }

    const delta = Math.abs(el.scrollTop - lastScrollTop);
    lastScrollTop = el.scrollTop;
    if (delta >= SCROLL_BULK_DELTA_PX) {
      scheduleExpandOnScrollSettle();
      return;
    }

    // 滚动帧里只走廉价判据（见 expandOnScrollFrame）—— 按视口位置补那条路留到停稳 / 沉降收口，
    // 每帧都跑会把挂载摊成每帧一次长任务，一路掉帧
    expandOnScrollFrame(el);
  };

  /** 「滚动到底部」补底循环句柄：切歌/失活/卸载时取消，防止悬挂 rAF 继续滚动并干扰视口 */
  let expandToBottomRafId: number | null = null;
  /** 会话 Promise 的 resolve 句柄：取消路径（切歌/失活/卸载）下也必须落定 Promise，避免 await 方永久挂起 */
  let expandToBottomResolve: (() => void) | null = null;
  /**
   * 落底阶段状态：null = 还没采到第一次滚动位置。
   * - `lastTop`：上一帧的 `scrollTop`（判定这一帧有没有位移）；
   * - `moved`：本轮 `scrollTo` 之后是否**确实见过位移**。平滑滚动刚发起的那一两帧 `scrollTop`
   *   还没变，把它当成「已停稳」就会立刻补一次跳转 —— 那正是「一点就瞬间到底部」；
   * - `still`：连续没动的帧数，攒够两帧才算停稳；
   * - `rounds`：已补次数。
   */
  let bottomChase: { rounds: number; lastTop: number; moved: boolean; still: number } | null = null;

  /** 结束「滚动到底部」会话（幂等）：清状态并落定 Promise */
  const finishExpandToBottom = () => {
    isExpandingToBottom = false;
    bottomChase = null;
    const pendingResolve = expandToBottomResolve;
    expandToBottomResolve = null;
    pendingResolve?.();
  };

  /** 停止「滚动到底部」循环（幂等），并落定未决的 Promise */
  const cancelExpandToBottom = () => {
    if (expandToBottomRafId !== null) {
      cancelAnimationFrame(expandToBottomRafId);
      expandToBottomRafId = null;
    }
    finishExpandToBottom();
  };

  /** 取消全部未决补挂（落底循环 + 停稳轮询）：切歌 / 失活 / 卸载时调用，幂等 */
  const cancelPendingExpansion = () => {
    cancelExpandToBottom();
    cancelSettleExpand();
  };

  /**
   * 若歌曲已变，重置渐进式渲染的全部窗口状态，返回是否发生了重置。
   *
   * 渲染窗口锚在**行下标**上：前缀行数、尾部行数、视口窗口的起止都只在同一首歌内成立，换歌即失效
   *（复用固定 key 的组件实例时尤其明显 —— 实例不重建，这些 ref 会原样留着指向新歌的另一处内容）。
   * 滚动采样点（lastScrollTop）随之归零：新歌的 scrollTop 与上一首没有可比性，留着会让第一帧被误判
   * 成大位移帧。
   */
  const syncSongState = (): boolean => {
    const songId = getActiveSongId();
    if (lastRenderedSongId === songId) return false;
    lastRenderedSongId = songId;
    renderedLineCount.value = MIN_INITIAL_RENDER_LINE_COUNT;
    tailLineCount.value = 0;
    // 视口窗口同样归零：它锚在旧歌的行下标上，留着会指向新歌的另一处内容
    viewportWindow.value = null;
    cancelSettleExpand();
    lastScrollTop = 0;
    return true;
  };

  /**
   * 点击「滚动到底部」悬浮按钮。
   *
   * **只挂末尾一屏多，中间那段不挂。** 早先的写法是把整份乐谱分帧挂进 DOM、挂完再落底 ——
   * 长乐谱要等好几秒，而用户点的是「滚到底部」，不是「等我把整份乐谱造出来」。现在把渲染窗口切成
   * 「前缀 + 空档 + 尾部」三段（见 tailLineCount），只补挂末尾 TAIL_RENDER_ROWS 行真实内容，
   * 中间未挂载的那段由空档按占位高度撑高，于是**点下去当帧就开始滚**，不必等。
   * 中途滚过去的那一段是空档（背景色），这是本方案明码标价的代价。
   *
   * **落底目标天然稳定**：占位高度由排版算式给出（纯函数，同一行永远同一个值），
   * 不像 canvas 化之前那样需要「先量一次再在空档期间冻结」—— 算式没有「量」这一步。
   *
   * 落底之后仍要**补底**：落底会把底部那批行挂成真实行，若某些行的算式高度与实际渲染有出入，
   * 内容总高仍可能微变，而 `scrollTo` 的 top 在发起那一刻就被钳死，于是可能停在半路。
   * 故落底之后等它停稳、还没贴底就再平滑补一次，有限轮后收手。
   * 补底一律用平滑滚动：跨度大也是「补估算差」，用瞬时跳过去正是用户否掉的那种观感。
   */
  const handleScrollToBottom = (): Promise<void> =>
    new Promise(resolve => {
      if (isExpandingToBottom) {
        resolve();
        return;
      }
      isExpandingToBottom = true;
      // 登记落定句柄：切歌/失活/卸载触发的 cancelExpandToBottom 会调用它，保证 Promise 必然落定
      expandToBottomResolve = resolve;
      bottomChase = null;

      const total = lyricsLinesWithEdges.value.length;
      // 先退回「只有前缀」的形态再切尾部窗口 —— 两次状态变更落在同一帧，不会闪。
      // 视口窗口一并清掉：它与尾部窗口互斥，留着会让空档被切成两段、落底目标算不准。
      tailLineCount.value = 0;
      viewportWindow.value = null;

      // 只补末尾那一屏多。补完若已经接上前缀（短乐谱），就直接退回普通的前缀窗口 ——
      // 那时 DOM 里本来就是整份乐谱，没有空档可言，滚动也照旧是全程真实内容
      tailLineCount.value = Math.min(TAIL_RENDER_ROWS, Math.max(0, total - renderedLineCount.value));
      if (renderedLineCount.value + tailLineCount.value >= total) {
        renderedLineCount.value = total;
        tailLineCount.value = 0;
      }

      const step = () => {
        expandToBottomRafId = null;
        // 中途切歌：立即终止，交由切歌 watch 重置渲染行数与视口
        if (lastRenderedSongId !== getActiveSongId()) {
          cancelExpandToBottom();
          return;
        }
        const el = scoreZoneRef.value;
        if (!el) {
          finishExpandToBottom();
          return;
        }

        const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
        const chase = (bottomChase ??= { rounds: 0, lastTop: el.scrollTop, moved: false, still: 0 });

        // 先更新采样：这一帧有没有位移
        if (el.scrollTop !== chase.lastTop) {
          chase.moved = true;
          chase.still = 0;
        } else chase.still += 1;
        chase.lastTop = el.scrollTop;

        // 贴底即收工。这一条要排在「停稳」判定之前：已经在底部时压根不会有位移，等不到 moved
        if (remaining <= BOTTOM_SNAP_PX) {
          finishExpandToBottom();
          return;
        }

        // 只有「确实滚过、且连续两帧没动」才算停稳 —— 平滑滚动刚发起的那一两帧 scrollTop 也还没变，
        // 把它当成停稳就会立刻补一次跳转，那正是「一点就瞬间到底部」
        if (chase.moved && chase.still >= 2) {
          if (chase.rounds >= BOTTOM_CHASE_MAX_ROUNDS) {
            finishExpandToBottom();
            return;
          }
          chase.rounds += 1;
          chase.moved = false;
          chase.still = 0;
          scrollToBottom('smooth');
        }
        // 也可能是「还在滚」：不重发 scrollTo（重发会不断重置平滑滚动的进度），只更新采样点
        expandToBottomRafId = requestAnimationFrame(step);
      };

      // 窗口切好、DOM 落定后立刻起滚：这一次的滚动本身就是反馈，不再有「先挂完」的那段等待
      void nextTick().then(() => {
        if (!isExpandingToBottom) return;
        scrollToBottom('smooth');
        expandToBottomRafId = requestAnimationFrame(step);
      });
    });

  return {
    renderedLineCount,
    visibleLines,
    gapMarginOf,
    hasGap,
    tailPlaceholderHeight,
    handleScroll,
    handleScrollToBottom,
    expandNextBatch,
    expandAtViewport,
    ensureSufficientRenderedLines,
    setupSentinelObserver,
    disposeSentinelObserver,
    cancelPendingExpansion,
    syncSongState,
  };
}
