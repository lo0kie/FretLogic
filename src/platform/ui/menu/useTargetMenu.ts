import { computed, nextTick, ref, shallowRef } from 'vue';

import type { MenuItem } from '@/platform/ui/menu/types';
import type { Ref } from 'vue';

/** 右键目标菜单需要的最小菜单能力：BaseMenu 的实例能力是它的超集，故其模板 ref 可直接传入。
 *  **不**把它做成类型参数 —— composable 内部只用 `openMenuAt`，不关心具体是哪个组件的实例类型；
 *  做成泛型反而会逼调用方把每个类型参数都写全（TS 在「部分显式提供类型参数」时要求其余有默认值）。 */
interface MenuHandle {
  openMenuAt: (clientX: number, clientY: number) => unknown;
}

/**
 * 右键「目标菜单」接线：把「命中哪个目标 → 该目标的菜单项 → 在光标处打开」收成一处。
 *
 * **右键菜单一律用它**（无论菜单项是否随目标变化）—— 目标无关的固定项菜单传一个忽略参数的
 * builder 即可，于是这类菜单只有一种接线方式，调用方不再各写一遍三段式。
 * 按钮 / 悬停触发的菜单不适用：那些菜单项在**渲染期**就要求值（面板渲染时即消费），
 * 形态是 `computed<MenuItem[]>` 内联字面量 + `model` / `pick` 派生，与「打开期才求值」是两回事。
 *
 * 三个不变量集中在此：
 * ① **无目标 → 空数组**：BaseMenu 的 `openMenuAt` 以 `!items?.length` 拒绝打开，故「目标未命中」
 *    与「菜单不可用」天然同义，不需要额外的可用性开关；反过来，凡要「拒绝打开」的场合，
 *    让 builder 返回空数组即可。
 * ② **必须等 nextTick**：`openMenuAt` 内部先判 items 是否为空，而 items 由本次命中的目标派生；
 *    目标写进 ref 后要等响应式更新把它同步进 BaseMenu 的 props，否则会被上一次（或空）的 items 拦下。
 * ③ **关闭后保留目标**：避免淡出途中菜单项被清空导致内容闪断；打开态单独跟踪（`isOpen`），
 *    供「菜单正针对我」这类高亮判据使用。
 *
 * @param buildItems 由目标构建菜单项（目标为 `null` 时不会被调用）。**目标标识而非目标对象**更稳：
 *   若对象会在业务路径上被整体替换（如分组重命名走 map + 展开），builder 内按 id 现查才不会拿到陈旧引用。
 * @param menuRef BaseMenu 的模板 ref（只用到 `openMenuAt`）。类型是**结构化的最小契约**，
 *   因此 `useTemplateRef<InstanceType<typeof BaseMenu>>` 与 `ref<InstanceType<typeof BaseMenu> | null>`
 *   两种形态都能直接传入，调用方不必改写自己的 ref 声明。
 */
export const useTargetMenu = <T>(buildItems: (target: T) => MenuItem[], menuRef: Readonly<Ref<MenuHandle | null>>) => {
  /** 最近一次命中的目标（关闭后保留，见 ③） */
  const target = shallowRef<T | null>(null);
  /** 菜单是否打开 —— 仅用于还原原先 BaseMenu 的 isOpen 作用域槽给的那点样式 */
  const isOpen = ref(false);

  /** 菜单项：无目标时为空数组（见 ①） */
  const items = computed<MenuItem[]>(() => (target.value === null ? [] : buildItems(target.value)));

  /** 记录目标并在光标处打开（目标先写、打开前等一拍，见 ②） */
  const openAt = (e: MouseEvent, next: T): void => {
    target.value = next;
    isOpen.value = true;
    void nextTick().then(() => void menuRef.value?.openMenuAt(e.clientX, e.clientY));
  };

  /** 关闭态收敛：只清 isOpen，目标保留（见 ③） */
  const close = (): void => {
    isOpen.value = false;
  };

  return { target, isOpen, items, openAt, close };
};
