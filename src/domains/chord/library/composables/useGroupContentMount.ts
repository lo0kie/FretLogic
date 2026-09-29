import { onBeforeUnmount, reactive, ref, watch } from 'vue';

import { useChordStore } from '@/domains/chord/store/chordStore';
import { createChunkedMount } from '@/platform/composables/useChunkedMount';
import { COLLAPSE_CONTENT_RETENTION_MS } from '@/platform/utils/constants';

import type { Group } from '@/domains/chord/types';
import type { ComponentPublicInstance } from 'vue';

/**
 * 分组内容的挂载门控：把「整库和弦全量常驻」压到「单组、且单组也分帧补齐」。
 *
 * 侧栏是全应用唯一「把整库和弦全部挂出来」的地方：单展开模式下只有一组可见可交互，其余分组的卡片
 * 网格常驻纯属浪费（千级和弦库 = 上万个节点），且这份浪费要按帧付账——开合分组的高度过渡会让承载
 * 它们的滚动容器每帧重排重绘，于是节点越多越掉帧（与和弦引擎、位图缓存无关的独立瓶颈）。
 * 做法：只有展开组渲染卡片；收起方向给一个保留窗口，让内容陪高度过渡走完再卸载（保留裁切观感），
 * 展开方向不需要窗口（本来就要渲染）。节点量因此从「全库」降到「单组」。
 *
 * 单组全量仍是百级卡片（huge 档每组 ~190 张，每张含 BaseMenu 等整套 setup），一帧内全量挂载
 * 就是展开瞬间的掉帧来源。于是再拆一层**分块**：展开方向每帧补挂一批直到挂满（展开高度过渡
 * 期间内容自上而下揭示，补挂发生在视口外或过渡未揭示到的行，视觉无感）；收起方向在保留窗口
 * 到期（折叠体已收到 0、内容不可见）后每帧卸一批。补挂/卸载期间关闭 TransitionGroup 动画
 * （前缀换成无样式的类名），只保留用户增删和弦时的真实增删动画，并**同时挂起折叠体的高度测量**
 * （body-hold）—— 后者不是为了动画，而是为了「载入即展开」的刷新路径：那时 initial-auto 让
 * 折叠体第一帧就是自然高度，没有 0→N 过渡可供补挂藏在后面，逐批写 px 会当场被看见成一段渐次
 * 长高。挂起期写 auto（内容出现即到位、高度不参与过渡），刷新观感收敛为「展开到位 + 一次定位」。
 * ⚠️ 挂起**只对「载入即展开」那一组生效**（见 holdGroupId）：手动展开的补挂有 0→N 过渡可藏，
 * 无差别挂起会把那段过渡一起抹掉。
 *
 * 三条不变量：
 * ① **保留窗口的 watch 必须 `flush: 'sync'`**（理由见该 watch 的注释）—— 默认 pre 冲刷下
 *    收起首帧就是「未展开且未保留」，卡片被整体卸载，只剩空箱收起。
 * ② **「载入即展开」是唯一挂起高度测量的路径**，判据是 `immediate` 那一趟（旧值为 undefined）；
 *    任何一次真实开合都把 holdGroupId 置回 null。
 * ③ **rAF 循环不必手工收尾**：createChunkedMount 随组件作用域销毁（onScopeDispose）自动清理；
 *    这里 onBeforeUnmount 只负责保留窗口的定时器与集合。
 */
export function useGroupContentMount({ isGroupContentOpen }: { isGroupContentOpen: (group: Group) => boolean }) {
  const chordStore = useChordStore();

  const contentOuterComponentEls = new Map<number, ComponentPublicInstance | Element | null>();

  /** 按索引登记/注销分组内容组件的实例引用 */
  const setContentOuterRef = (el: Element | ComponentPublicInstance | null, index: number) => {
    if (el) contentOuterComponentEls.set(index, el);
    else contentOuterComponentEls.delete(index);
  };

  /** 处在「收起动画保留窗口」内的分组 id（这些组的内容继续挂载，供高度过渡逐帧裁切） */
  const retainedGroupIds = reactive(new Set<string>());
  /** 各保留分组的到期定时器：重复登记按 id 去重，重新展开时即刻取消 */
  const retentionTimers = new Map<string, number>();

  /** 组内容是否渲染：展开中，或仍在收起动画的保留窗口内 */
  const isGroupContentRenderable = (group: Group): boolean =>
    isGroupContentOpen(group) || retainedGroupIds.has(group.id);

  // ---------- 分块挂载 / 分块卸载（通用机制见 platform/composables/useChunkedMount） ----------
  /**
   * 每帧补挂/卸载的卡片数（3 列 × 4 行）。
   *
   * 原值 36（3 列 × 12 行）与真实单卡成本不匹配：单张 ChordCard 热态约 1.25ms、冷态约 3.3ms
   * （每卡常驻 ChordCard + BaseMenu + BasePopover 三个组件），一帧 16.7ms 的预算只容得下约 5~13 张，
   * 而首批 36 张实测构成单个 111~120ms 主线程长任务 + 116~124ms 掉帧，即分块机制没起到摊平作用。
   * 收敛到 12 后单帧批次落在预算内，代价是填充由 2 帧变 4 帧（补挂发生在高度过渡未揭示到的行，视觉无感；
   * 载入即展开的刷新路径没有那段过渡可藏，由 body-hold 挂起高度测量兜住 —— 见上方挂载门控注释）。
   */
  const MOUNT_BATCH = 12;

  const chunked = createChunkedMount<string>(MOUNT_BATCH);

  /**
   * 「载入即展开」的那一组（`immediate` 那一趟记下）：**只有它**的首批补齐需要挂起折叠体的高度测量。
   *
   * 为什么必须分路径：补挂窗口对每一次展开都存在（`startFill` 就调在展开的同步 watcher 里），
   * 而挂起期写的是 `auto` —— 没有可插值的起点，0→N 的展开过渡会一并消失。手动展开时折叠体正是从
   * `0px` 起走那段过渡、分批补挂藏在它未揭示到的行里，本来就看不见；只有「载入即展开」这条路径
   * （`initial-auto` 让折叠体首帧就是自然高度）没有过渡可藏，逐批写 px 才会被看见成渐次长高。
   * 故无差别开启等于用「抹掉开合动画」去换一个只在该路径存在的问题。
   *
   * 任何一次开合（收起 / 换一组）都把它置回 null —— 那一组此后走正常的开合过渡。
   * 补挂结束不必单独清：判据里带着 `isFilling`，补挂一停就不再挂起。
   */
  const holdGroupId = ref<string | null>(null);

  /** 本组折叠体的高度测量是否需要挂起：仅「载入即展开」那一组、且其首批补齐仍在进行中 */
  const holdBodyOf = (groupId: string): boolean => groupId === holdGroupId.value && chunked.isFilling(groupId);

  /** 展开方向的分块补挂：从当前限额起每帧补一批，直到挂满（挂满后移除限额回全量渲染） */
  const startFill = (groupId: string) =>
    chunked.startFill(
      groupId,
      () => chordStore.groupChordMap.get(groupId)?.length ?? 0,
      // 补挂途中被收起：循环停摆，保留窗口/卸载循环接管后续
      () => chordStore.isGroupExpanded(groupId)
    );

  /** 收起方向保留窗口到期后的分块卸载：折叠体已收到 0、内容不可见，每帧卸一批直到清空 */
  const startDrain = (groupId: string) =>
    chunked.startDrain(
      groupId,
      () => chordStore.groupChordMap.get(groupId)?.length ?? 0,
      key => {
        retainedGroupIds.delete(key);
        retentionTimers.delete(key);
      }
    );

  /** 登记保留窗口：到点后不再一次性卸载，转入分块卸载循环 */
  const retainGroupContent = (groupId: string) => {
    retainedGroupIds.add(groupId);
    const pending = retentionTimers.get(groupId);
    if (pending !== undefined) clearTimeout(pending);
    retentionTimers.set(
      groupId,
      window.setTimeout(() => {
        retentionTimers.delete(groupId);
        if (chordStore.isGroupExpanded(groupId)) {
          retainedGroupIds.delete(groupId);
          return;
        }
        startDrain(groupId);
      }, COLLAPSE_CONTENT_RETENTION_MS)
    );
  };

  /** 释放保留窗口：重新展开同一组时取消待释放的定时器，避免窗口在展开态下把内容卸掉 */
  const releaseGroupContent = (groupId: string) => {
    const pending = retentionTimers.get(groupId);
    if (pending !== undefined) {
      clearTimeout(pending);
      retentionTimers.delete(groupId);
    }
    retainedGroupIds.delete(groupId);
  };

  /**
   * 展开组切换 → 给「刚被收起的那一组」登记保留窗口，并让新展开组从首批开始分块补挂。
   *
   * **必须 flush: 'sync'**：保留窗口要赶在「状态变更引发的这次渲染」之前登记好。本组件的更新任务
   * id 小于 setup 期创建的 watcher，默认 pre 冲刷下更新先出队 —— 收起首帧就是「未展开且未保留」，
   * 卡片会被整体卸载，只剩空箱收起。同步触发点落在状态写入处，必然先于渲染。
   *
   * 同步监听而不是改事件回调：状态也可能由路由回灌、搜索结果选中、导入/删除分组等路径写入，
   * 这些路径都不过组件的点击回调。
   *
   * immediate：组件挂载时已处于展开态的分组（载入即展开 / 路由回灌）同样从首批开始补挂——
   * 限额在**首次渲染前**生效，避免「全量渲染后再裁剪回填」的闪烁。它同时也是「载入即展开」的
   * 唯一判据：那一趟展开的那一组记进 holdGroupId（只有它的首批补齐要挂起高度测量）。
   */
  watch(
    () => chordStore.expandedGroupId,
    (expandedId, prevExpandedId) => {
      if (prevExpandedId && prevExpandedId !== expandedId) retainGroupContent(prevExpandedId);
      // 载入即展开 = `immediate` 那一趟（旧值为 undefined）。除此之外的任何一次开合都意味着该组
      // 此后走正常的开合过渡，挂起窗口随之关闭（见 holdGroupId 的说明）
      holdGroupId.value = prevExpandedId === undefined && expandedId ? expandedId : null;
      if (expandedId) {
        releaseGroupContent(expandedId);
        startFill(expandedId);
      }
    },
    { flush: 'sync', immediate: true }
  );

  onBeforeUnmount(() => {
    for (const timer of retentionTimers.values()) clearTimeout(timer);
    retentionTimers.clear();
    retainedGroupIds.clear();
    // 分块循环的 rAF 由 createChunkedMount 随组件作用域销毁自动清理（onScopeDispose）
  });

  return { chunked, isGroupContentRenderable, holdBodyOf, setContentOuterRef };
}
