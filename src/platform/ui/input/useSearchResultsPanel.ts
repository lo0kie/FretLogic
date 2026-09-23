import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { resolveScrollBehavior } from '@/platform/utils/motion';

import type { VirtualElement } from '@floating-ui/dom';
import type { Ref } from 'vue';

interface UseSearchResultsPanelOptions {
  /** 是否开启 searchable 模式 */
  isSearchable: () => boolean;
  isDisabled: () => boolean;
  isReadonly: () => boolean;
  /** 输入框根元素（虚拟锚点定位基准） */
  rootRef: Ref<HTMLDivElement | null>;
  /** 输入框原生 input（焦点归属豁免判定） */
  inputRef: Ref<HTMLInputElement | null>;
  /** 结果面板滚动容器（焦点归属判定与活跃项滚动需要原生能力）；null = 面板未挂载 */
  scrollEl: Ref<HTMLElement | null>;
  /** 结果项总数（键盘导航的环绕边界） */
  itemCount: () => number;
  /**
   * 宿主自己的合成态（BaseInput 的 isComposing ref）。必须与 `e.isComposing` 一起读：
   * 个别输入法不置 `e.isComposing`，只读事件字段会在这些输入法下于合成期抢走 ↓/↑。
   */
  isComposing?: () => boolean;
  /** Enter 选中活跃项（宿主派发 select-search-index） */
  onSelectActive: (index: number) => void;
}

/**
 * searchable 下拉结果面板：开合状态、全局焦点监听收起、键盘导航（环绕式上下移动 +
 * Enter 选中 + Escape 关闭）、活跃项滚动定位、虚拟锚点。
 * 「选中即收起」统一由 selectIndex 承担（鼠标点击行与键盘 Enter 同一条路径）。
 * 结果渲染与选中业务语义留在宿主，本 composable 只拥有面板的「开合与导航」时序。
 */
export function useSearchResultsPanel(options: UseSearchResultsPanelOptions) {
  const { isSearchable, isDisabled, isReadonly, rootRef, inputRef, scrollEl, itemCount, isComposing, onSelectActive } =
    options;

  const resultsOpen = ref(false);
  /** 键盘导航的活跃项下标；-1 = 无活跃项 */
  const searchActiveIndex = ref(-1);

  /** 锚点虚拟元素：每次定位实时读取根元素矩形，随输入框尺寸/位置自动跟随 */
  const searchVirtualRef = computed<VirtualElement | null>(() => {
    if (!isSearchable()) return null;
    return { getBoundingClientRect: () => rootRef.value?.getBoundingClientRect() ?? new DOMRect() };
  });

  const closeResults = () => {
    resultsOpen.value = false;
    searchActiveIndex.value = -1;
  };

  /**
   * 选中并收起：**结果行的鼠标点击与键盘 Enter 共用这一条路径**（先派发选中、再收起面板）。
   *
   * 收起必须显式发生，不能指望「焦点离开」顺带关掉：点进面板时焦点与指针都还在合法区域内，
   * 三条兜底全部会放行 —— 本文件的 handleGlobalFocusIn 对面板内容豁免（正是为了等这次点击
   * 选中）、BasePopover 的面板 focusout 受 isPointerDown / isPointerInside 守卫、外点关闭
   * 也因「按下面板内部」不成立。宿主的选中回调只处理自己的查询词与业务状态，不掌握面板开合。
   */
  const selectIndex = (index: number) => {
    onSelectActive(index);
    closeResults();
  };

  // ─── 面板打开期间的全局焦点监听 ───
  // Tab 移动焦点、点击外部时收起面板：仅靠 input blur 单点判定不够——焦点进入面板内
  // 结果按钮（Teleport 于 body）或清空/眼睛按钮后再离开时已无 blur 可监听，面板会残留。
  // 捕获式 focusin 覆盖任意起点的焦点迁移：焦点落到输入框自身或面板内（等待键盘/点击
  // 选中）时豁免，落到其它任何位置（含清空/眼睛按钮、组件外）即收起。
  const handleGlobalFocusIn = (e: FocusEvent) => {
    const { target } = e;
    if (!(target instanceof Node)) return;
    // 组件根内部的焦点迁移（input / 清空 / 眼睛按钮）不收起：点清空时焦点先落到按钮、
    // handleClear 再把焦点还给 input，若按「按钮在面板外」收起会经历关闭→重开的闪动；
    // 焦点真正迁出组件根时依旧会被本监听捕获并收起
    if (rootRef.value?.contains(target) || target === inputRef.value) return;
    if (scrollEl.value?.contains(target)) return;
    closeResults();
  };

  watch(resultsOpen, open => {
    if (typeof document === 'undefined') return;
    if (open) document.addEventListener('focusin', handleGlobalFocusIn, true);
    else document.removeEventListener('focusin', handleGlobalFocusIn, true);
  });

  /** 聚焦或输入时展开结果面板；禁用/只读不弹 */
  const openResults = () => {
    if (!isSearchable() || isDisabled() || isReadonly()) return;
    resultsOpen.value = true;
  };

  const setSearchActiveIndex = (index: number) => {
    searchActiveIndex.value = index;
  };

  /** 输入内容变化时重置活跃项（旧下标对新结果列表已无意义）；由宿主在 localValue 的 watch 里调用 */
  const resetActiveIndex = () => {
    searchActiveIndex.value = -1;
  };

  const scrollActiveItemIntoView = () =>
    void nextTick(() => {
      if (!scrollEl.value || searchActiveIndex.value < 0) return;
      const items = scrollEl.value.querySelectorAll<HTMLElement>('button, [role="button"], [data-search-item]');
      const activeEl = items[searchActiveIndex.value];
      activeEl?.scrollIntoView({ block: 'nearest', behavior: resolveScrollBehavior('smooth') });
    });

  /** 键盘导航：↓/↑ 环绕移动活跃项，Enter 选中，Escape 收起面板 */
  const handleKeydown = (e: KeyboardEvent) => {
    // IME 合成期一律放行：↓/↑ 正是输入法翻候选词的键，preventDefault 会把翻页整段吞掉，
    // 中文输入法下搜索面板一开就没法选词。Enter 由 BaseInput 的 enterComposingKeydown 兜住
    // （合成期 Enter 只确认候选词，不派发 enter）。
    // 判据必须与 BaseInput 完全一致：`e.isComposing || 宿主 ref` —— 个别输入法不置 e.isComposing，
    // 只读事件字段会在这些输入法下仍然抢键（此前注释自称「两处同口径」，实际只读了一半）。
    if (e.isComposing || isComposing?.()) return;
    if (!isSearchable() || !resultsOpen.value) return;
    const count = itemCount();
    if (count > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        searchActiveIndex.value = (searchActiveIndex.value + 1) % count;
        scrollActiveItemIntoView();
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        searchActiveIndex.value = (searchActiveIndex.value - 1 + count) % count;
        scrollActiveItemIntoView();
        return;
      }
      if (e.key === 'Enter' && searchActiveIndex.value >= 0) {
        e.preventDefault();
        selectIndex(searchActiveIndex.value);
        return;
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeResults();
    }
  };

  onBeforeUnmount(() => {
    if (typeof document !== 'undefined') document.removeEventListener('focusin', handleGlobalFocusIn, true);
  });

  return {
    resultsOpen,
    searchActiveIndex,
    searchVirtualRef,
    openResults,
    closeResults,
    selectIndex,
    setSearchActiveIndex,
    resetActiveIndex,
    handleKeydown,
  };
}
