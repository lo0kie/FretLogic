/**
 * useSortableList 的「子树滚动偏移」快照 / 回填。
 *
 * Sortable 换位与落定后的 keyed diff 都靠 `insertBefore` 搬 DOM：被搬的节点先脱离文档再插回去，
 * 整棵子树随之失去 box，而**按规范没有 box 时 `scrollLeft` / `scrollTop` 一律读作 0** —— 重新插入后
 * 偏移从 0 重新开始。整个过程**不派发 `scroll` 事件**（`useScrollMemory.ts` 的文件头记着同一件事，
 * `HeaderConfigPopover.vue` 里「摘掉内联 `overflow` 即丢 `scrollTop`」是同源的另一处）。
 *
 * 于是任何靠「自身 `scroll` / `ResizeObserver` / `MutationObserver`」重测的消费者都感知不到这次静默复位，
 * 只能停在旧值上：`v-edge-fade` 的 `--fade-start` 会留在上一步滚动时写下的值上 —— 位置已经回到最左、
 * 羽化却还在。祖先被搬动这件事没有任何原生 API 可观察，所以这里不去追信号，而是**在搬动前后保住值本身**：
 * 起拖时记下子树里真正被滚动的元素，每次搬完 DOM 按元素引用写回。位置没变，所有消费者自然正确。
 *
 * 同一件事还有第二个受害面：**拖拽影像的克隆**。`cloneNode` 同样不复制滚动状态（副本里每个元素都从 0
 * 开始），影像上那条滚到一半的条带会显示成贴左，与它旁边的原位元素不一致 —— 见 `mirrorScrollOffsets`。
 *
 * 与 order.ts 同取向：无闭包依赖的纯函数，容器 / 快照全部显式入参。
 */

/** 一处被记录下来的滚动偏移（只收非 0 的轴，见 captureScrollOffsets） */
export interface ScrollOffsetSnapshot {
  el: HTMLElement;
  left: number;
  top: number;
}

/**
 * 记录容器**子树**里所有实际发生了滚动的元素。
 *
 * 只收非 0 的轴：值为 0 的轴写回 0 是空操作，收进来只会让回填多写几次 DOM。
 * 不含容器自身 —— 被搬动的是它的子元素，容器自己的滚动偏移不受影响。
 *
 * 全程只有读、中间没有写，故这一遍遍历只触发一次布局（首读强制 flush，其后复用同一份）。
 *
 * @returns 快照；容器不存在时为空数组
 */
export const captureScrollOffsets = (container: HTMLElement | null): ScrollOffsetSnapshot[] => {
  if (!container) return [];
  const snapshots: ScrollOffsetSnapshot[] = [];
  for (const el of Array.from(container.querySelectorAll<HTMLElement>('*'))) {
    const { scrollLeft: left, scrollTop: top } = el;
    if (left === 0 && top === 0) continue;
    snapshots.push({ el, left, top });
  }
  return snapshots;
};

/**
 * 把被搬动静默清零的偏移写回。
 *
 * **只在该轴当前读到 0 时才写**，而不是无条件覆盖快照值：
 * - 搬动确实把它清零了 → 写回原值，这正是要修的那件事；
 * - 压根没被搬动（大多数 onChange 只搬一两张卡，其余元素的偏移原封不动）→ 跳过，不产生写入；
 * - 拖拽期间用户自己滚了一下 → 当前值非 0，跳过，不跟用户抢值。
 *
 * 值确实变了才会派发 `scroll`，这正是我们要的：`v-scrollbar` 的拇指、`v-edge-fade` 的羽化
 * 都靠这条事件重新同步。
 *
 * 跳过已脱离文档的元素：拖拽期间列表可能被增删 / 被 Vue 换掉整批节点，对脱离文档的元素赋值
 * 不会生效（它没有 box），且位置在那批节点上本就无意义。
 */
export const restoreScrollOffsets = (snapshots: ScrollOffsetSnapshot[]): void => {
  for (const { el, left, top } of snapshots) {
    if (!el.isConnected) continue;
    if (left !== 0 && el.scrollLeft === 0) el.scrollLeft = left;
    if (top !== 0 && el.scrollTop === 0) el.scrollTop = top;
  }
};

/**
 * 把 source 子树里被滚动的偏移**配对**到结构相同的 target 上，返回的快照元素引用指向 target。
 *
 * 用于拖拽影像的克隆（见 preview.ts 的 buildPreviewNode）：`cloneNode` 不复制滚动状态，副本里
 * 每个元素都从 0 开始，影像上那条滚到一半的条带会显示成贴左 —— 与它旁边的原位元素不一致。
 *
 * **配对与写回必须分两步**，两条都是硬约束：
 * - **配对要赶在任何改动两侧结构的清理之前**。影像是先克隆、再摘副本里的波纹容器
 *   （`WAVE_CONTAINER_SELECTOR`），两侧的子元素数量随即不再相等，之后再按序配对会整体错位。
 * - **写回要等 target 挂进文档之后**。没有 box 的元素写 `scrollLeft` / `scrollTop` 是空操作，
 *   值不会留到挂载那一刻，所以这里只产出配对，由调用方挂载后再交给 restoreScrollOffsets。
 *   （restoreScrollOffsets 的 `isConnected` 守卫正好把这条约束钉死。）
 *
 * @returns 配对后的快照（元素指向 target 的节点）；两侧元素数量不等时返回空数组，不猜配对
 */
export const mirrorScrollOffsets = (source: HTMLElement, target: HTMLElement): ScrollOffsetSnapshot[] => {
  const sources = source.querySelectorAll<HTMLElement>('*');
  const targets = target.querySelectorAll<HTMLElement>('*');
  if (sources.length !== targets.length) return [];
  const snapshots: ScrollOffsetSnapshot[] = [];
  sources.forEach((from, index) => {
    const { scrollLeft: left, scrollTop: top } = from;
    if (left === 0 && top === 0) return;
    const el = targets[index];
    if (el !== undefined) snapshots.push({ el, left, top });
  });
  return snapshots;
};
