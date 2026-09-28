<template>
  <!-- ── 按钮/下拉分支：hover | click，委托 BasePopover 原生 trigger slot 管理开关与定位 ── -->
  <BasePopover
    v-if="isRadioTrigger"
    v-model="isOpen"
    :disabled
    :hover-close-delay
    :hover-open-delay
    :offset-distance
    :panel-class
    :placement
    :trigger
    :auto-focus="false"
    :panel-scrollbar="resolvedPanelScrollbar"
    :panel-style="resolvedPanelStyle"
    @close="handlePopoverClose()"
    aria-label="菜单"
    ref="popoverRef"
  >
    <template #trigger="{ isOpen: slotIsOpen, pinToggle }">
      <slot v-bind="$attrs" :pin-toggle :is-open="slotIsOpen" name="trigger" />
    </template>

    <div :class="panelInnerClass" @keydown="handleMenuKeydown($event)" ref="menuBoxRef" role="menu" tabindex="-1">
      <MenuItems
        :items
        :model
        :panel-class
        :size
        :title
        :on-pick="handlePick"
        :on-select="handleItemSelect"
        :panel-scrollbar="resolvedPanelScrollbar"
        ref="itemsRef"
      />
    </div>
  </BasePopover>

  <!-- ── 右键分支：contextmenu，手动虚拟锚点 + openMenuAt；包裹层只拦右键，不拦 click ── -->
  <template v-else>
    <div
      :class="{ 'cursor-default': disabled }"
      @contextmenu="handleContextMenu($event)"
      class="context-menu-trigger-wrapper contents"
      ref="triggerWrapperRef"
    >
      <!-- $attrs 以插槽 props 下发（本层是 display:contents，class 落在这里对布局无效）：
           调用方用 `#="{ isOpen, ...rest }"` 收下，再 `v-bind="rest"` 落到自己触发器的目标元素上 -->
      <slot v-bind="$attrs" :is-open />
    </div>

    <BasePopover
      v-model="isOpen"
      :disabled
      :keep-on-context-trigger-click
      :offset-distance
      :panel-class
      :placement
      :virtual-ref
      :auto-focus="false"
      :context-trigger-el="contextTriggerEl ?? triggerWrapperRef"
      :panel-scrollbar="resolvedPanelScrollbar"
      :panel-style="resolvedPanelStyle"
      @close="handlePopoverClose()"
      aria-label="菜单"
      ref="popoverRef"
    >
      <div :class="panelInnerClass" @keydown="handleMenuKeydown($event)" ref="menuBoxRef" role="menu" tabindex="-1">
        <MenuItems
          :items
          :model
          :panel-class
          :size
          :title
          :on-pick="handlePick"
          :on-select="handleItemSelect"
          :panel-scrollbar="resolvedPanelScrollbar"
          ref="itemsRef"
        />
      </div>
    </BasePopover>
  </template>
</template>

<script lang="ts">
// 双 script 块：imports 整体置于首个块顶部（import/first），跨实例单例声明于模块作用域。
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';

import MenuItems from '@/platform/ui/menu/MenuItems.vue';
import BasePopover from '@/platform/ui/popover/BasePopover.vue';
import { CONTROL_HEIGHT_PRESETS } from '@/platform/ui/controlSizes';
import { createVirtualElementRect } from '@/platform/ui/popover/floatingCore';
import { CONTEXT_MENU_REPOSITION_DURATION_MS, CONTEXT_MENU_REPOSITION_EASING } from '@/platform/utils/constants';
import { prefersReducedMotion } from '@/platform/utils/motion';

import type { ComponentSize } from '@/platform/types';
import type { MenuItem } from '@/platform/ui/menu/types';
import type { Placement } from '@floating-ui/dom';
import type { CSSProperties } from 'vue';

// 模块级互斥：一组菜单同时只允许打开一个（打开新菜单时只关其他菜单，非关闭所有浮层）。
// 必须放在模块作用域而非 <script setup> 体，否则每个实例各持一份、跨实例互斥失效。
const mutexCloseRef = ref<((reason?: string) => void) | null>(null);
</script>

<script setup lang="ts">
// inheritAttrs:false + 把 $attrs 经**插槽 props** 下发（两个分支的触发器插槽各绑一次，见模板）：
// 本组件没有能承接 attrs 的单一 DOM 落点 ——
//   ① 触发器始终由调用方经插槽自带（isRadioTrigger 分支是 `trigger` 插槽，contextmenu 分支是默认插槽）；
//   ② contextmenu 分支的包裹层是 `display: contents`（不生成盒子），class 落上去对布局无效，
//      aria-* 落在 contents 元素上在辅助技术里也不可靠；
//   ③ 面板是 Teleport 到 body 的浮层，调用方的 class 更不该落到那里。
// 故把 attrs 作为插槽 props 交给调用方，由它决定落到自己触发器的哪个元素上：
// `#="{ isOpen, ...rest }"` + 在目标元素上 `v-bind="rest"`。
defineOptions({ name: 'BaseMenu', inheritAttrs: false });

const {
  items,
  model = undefined,
  trigger = 'hover',
  placement: placementProp = undefined,
  size = 'md',
  title = '',
  disabled = false,
  hoverOpenDelay = 50,
  hoverCloseDelay = undefined,
  offsetDistance = 6,
  panelClass = 'context-menu-box',
  panelStyle = {},
  keepOnContextTriggerClick = false,
  panelScrollbar = false,
  maxVisibleItems = undefined,
  contextTriggerEl = null,
} = defineProps<{
  /** 菜单项数据列表（支持 children 级联子菜单） */
  items: MenuItem[];
  /**
   * 单选组：本层当前值。给出后，带 `value` 的菜单项勾选态由 `item.value === model` 现算，
   * 点击时抛 `pick` 事件 —— 调用方只需描述「有哪些项」，勾选与点击都不必逐项手写。
   * 不传则完全退回 `item.checked` / `item.action` 语义。
   */
  model?: string;
  /** 触发方式：hover（悬停，含点击钉住） | click（左键点击） | contextmenu（右键） */
  trigger?: 'hover' | 'click' | 'contextmenu';
  /** 浮层相对锚点的定位方位；默认 contextmenu→bottom-start（鼠标坐标），其余→bottom-end */
  placement?: Placement;
  /** 菜单尺寸档位 */
  size?: ComponentSize;
  /** 顶部分组标题；为空时不渲染标题行与分割线（透传给 MenuItems） */
  title?: string;
  /** 是否禁用菜单：禁用时不响应触发 */
  disabled?: boolean;
  /** hover 触发时移入后延时打开的毫秒数（仅按钮/下拉分支） */
  hoverOpenDelay?: number;
  /** hover 触发时移出后延时关闭的毫秒数（仅按钮/下拉分支） */
  hoverCloseDelay?: number;
  /** 浮层与锚点之间的间距（px） */
  offsetDistance?: number;
  /** 附加到浮层面板上的类名 */
  panelClass?: string;
  /** 附加到浮层面板上的内联样式 */
  panelStyle?: CSSProperties;
  /** 右键分支：左键点击触发区内部时保持打开 */
  keepOnContextTriggerClick?: boolean;
  /**
   * 右键分支：承载右键的「触发区域」元素。
   *
   * 默认退化为内部包裹层（.context-menu-trigger-wrapper），它只包住默认插槽 —— 于是「插槽为空」
   * 的用法（菜单单例挂在列表外、右键由容器 contextmenu 委托处理的列表级场景）判定恒为区域外。
   * BasePopover 的全局 contextmenu 走**捕获阶段**，早于容器上的委托处理，会先把菜单关掉，
   * 委托再调用 openMenuAt 时 wasOpen 已是 false → 表现为菜单重放入场动画，而不是复用同一实例
   * 从旧坐标滑到新坐标。这类用法必须把真实容器传进来。
   */
  contextTriggerEl?: HTMLElement | null;
  /** 面板与级联子面板是否用 v-scrollbar 自绘滚动条（替换原生滚动条）；透传 BasePopover / MenuItems */
  panelScrollbar?: boolean;
  /**
   * 面板最多完整显示多少项，超出部分滚动查看（`undefined` / ≤ 0 即不限）。
   *
   * N 按「行高 × N + 项间距 + 标题行 + 分割线」折算成面板的 `max-height`（每一项都取自
   * MenuItems / MenuRow 实际用的那些 token，不另抄一份数字），并**自动开启自绘滚动条** ——
   * 被动模式下原生滚动条是被隐藏的，溢出内容会被静默截断、看不出还能滚。
   *
   * 数的是**菜单项**：标题行与 `divided` 的分割线作为独立的 flex 子节点另计，
   * 所以「N 项完整可见」是准的，不是近似。
   */
  maxVisibleItems?: number;
}>();

const emit = defineEmits<{
  (e: 'select', item: MenuItem): void;
  /** 单选组：被点中的项带 `value` 时抛出，参数即该项的 value（`select` 仍照常抛） */
  (e: 'pick', value: string): void;
  (e: 'close'): void;
}>();

/** 尺寸 → 类名静态映射：避免模板字符串拼接（Tailwind/扫描器无法识别动态拼接的类） */
const MENU_SIZE_CLASS: Record<ComponentSize, string> = {
  sm: 'context-menu-size-sm',
  md: 'context-menu-size-md',
  lg: 'context-menu-size-lg',
};

const isOpen = ref(false);
const x = ref(0);
const y = ref(0);

const popoverRef = useTemplateRef<InstanceType<typeof BasePopover>>('popoverRef');
const menuBoxRef = useTemplateRef<HTMLElement>('menuBoxRef');
const itemsRef = useTemplateRef<InstanceType<typeof MenuItems>>('itemsRef');
const triggerWrapperRef = useTemplateRef<HTMLElement>('triggerWrapperRef');

const isRadioTrigger = computed(() => trigger === 'hover' || trigger === 'click');

const placement = computed<Placement>(
  () => placementProp || (trigger === 'contextmenu' ? 'bottom-start' : 'bottom-end')
);

const menuSizeClass = computed(() => MENU_SIZE_CLASS[size] ?? MENU_SIZE_CLASS.md);

/** 面板内层类名：尺寸 + 内部布局（模板内两个分支共用同一段类名数组） */
const panelInnerClass = computed(() => [menuSizeClass.value, 'context-menu-inner flex flex-col gap-xs outline-none']);

/**
 * 菜单列表的纵向几何（rem）：项间距取 MenuItems 根节点的 `gap-xs`、上下内边距取它的 `p-xs` ——
 * 两者同为 0.375rem，故合并成「几段 0.375rem」来算。
 */
const MENU_LIST_GAP = '0.375rem';
/** 标题行高：MenuItems 的 `text-2xs leading-tight` → 0.625rem × 1.25。
 *  `--text-2xs` 没有配对的 line-height，行高只由 `leading-tight` 给出 */
const MENU_TITLE_HEIGHT = '0.78125rem';
/** 分割线占位：BaseDivider 自身 1px + `my-0.5`（上下各 0.125rem）；标题下那条与列表内那条同高 */
const MENU_DIVIDER_BLOCK = '0.25rem + 1px';
/** 面板上下描边各 1px */
const MENU_PANEL_BORDER_PX = 2;

/**
 * 「最多显示 N 项」折算成面板的 max-height。
 *
 * 必须把**标题行与分割线**一并算进来 —— 它们不是背景装饰，而是列表这个 flex 列里真实的子节点，
 * 每个子节点之间都要吃掉一个 `gap-xs`。前 N 项的可见高度 =
 *   上下内边距 2 段 + 子节点间距 (子节点数 − 1) 段 + N × 行高
 *   + 标题行高 + 1px（标题下那条线）
 *   + 列表内每个 `divided` 项的 (0.25rem + 1px)
 *   + 面板上下描边 2px
 * 漏掉标题或分割线的间距，算出来的就是「第 N 项刚好被裁掉一截」的高度。
 *
 * 用 calc 拼 rem、而不是先算成 px：项目根字号是 22.25px 而非 16px，只有 rem 才跟着根字号走；
 * 行高也直接引用 CONTROL_HEIGHT_PRESETS（与 MenuRow 的 `h-[...]` 同一个来源），不另抄一份数字。
 * 折算的前提是面板自身不带内边距 —— 调用方往 panelClass 里塞 padding 会让它失准。
 */
const menuMaxHeight = (opts: {
  size: ComponentSize;
  count: number;
  hasTitle: boolean;
  /** 前 count 项里带 `divided` 的条数：分割线只渲染在项**之前**，可见范围之外的不计入 */
  dividedCount: number;
}): string => {
  const { size, count, hasTitle, dividedCount } = opts;
  const rowHeight = CONTROL_HEIGHT_PRESETS[size] ?? CONTROL_HEIGHT_PRESETS.md;
  // 列表的子节点：标题行 + 标题分割线 + 每项（该项的分割线 + 行本身）
  const childCount = (hasTitle ? 2 : 0) + count + dividedCount;
  // 子节点间距是 childCount − 1 段、上下内边距是 2 段，合起来 childCount + 1 段
  const terms = [`${childCount + 1} * ${MENU_LIST_GAP}`, `${count} * ${rowHeight}`];
  if (dividedCount > 0) terms.push(`${dividedCount} * (${MENU_DIVIDER_BLOCK})`);
  if (hasTitle) terms.push(MENU_TITLE_HEIGHT, '1px');
  terms.push(`${MENU_PANEL_BORDER_PX}px`);

  return `calc(${terms.join(' + ')})`;
};

/** 面板样式：给了 maxVisibleItems 才追加 max-height，其余情况原样透传调用方的 panelStyle */
const resolvedPanelStyle = computed<CSSProperties>(() => {
  const count = maxVisibleItems ?? 0;
  if (count <= 0) return panelStyle;

  return {
    ...panelStyle,
    maxHeight: menuMaxHeight({
      size,
      count,
      hasTitle: Boolean(title),
      dividedCount: items.slice(0, count).filter(item => item.divided).length,
    }),
  };
});

/** 面板滚动条：给了 maxVisibleItems 就自动开启 —— 被动模式下原生滚动条被隐藏，
 *  溢出内容会被静默截断、看不出还能滚（见 BasePopover 的 panelScrollbar 注释） */
const resolvedPanelScrollbar = computed(() => panelScrollbar || (maxVisibleItems ?? 0) > 0);

/** 右键分支专用虚拟锚点：以鼠标坐标构造定位点 */
const virtualRef = computed(() => (trigger === 'contextmenu' ? createVirtualElementRect(x.value, y.value) : null));

/** 关闭本菜单并清理全局互斥记录 */
const closeMenu = (reason = 'unmarked') => void popoverRef.value?.close(`menu:${reason}`);

/** 互斥登记：打开时关掉其他菜单并登记自己，关闭时清空指向自己的登记 */
watch(isOpen, val => {
  if (val) {
    if (mutexCloseRef.value && mutexCloseRef.value !== closeMenu) mutexCloseRef.value('mutex-by-other-menu');

    mutexCloseRef.value = closeMenu;
  } else if (mutexCloseRef.value === closeMenu) mutexCloseRef.value = null;
});

/**
 * 打开后自动聚焦面板内首个可用项（三态通用）。
 *
 * 必须等**两拍**：BasePopover 的打开 watcher 自身也要 `await nextTick()` 才置 isShown，且它在本组件
 * 之后注册（父先于子），于是第一拍后 isShown 才置真、面板要到再下一拍才渲染完成 —— 只等一拍时
 * itemsRef 仍是 null，这段聚焦一直是空转：键盘打开菜单后焦点留在触发器上，菜单对纯键盘用户
 * 等于不可操作。
 */
watch(isOpen, async val => {
  if (val) {
    await nextTick();
    await nextTick();
    itemsRef.value?.focusFirstItem();
  }
});

/** 菜单关闭回调：清互斥登记，并向父级转发关闭事件 */
const handlePopoverClose = () => {
  if (mutexCloseRef.value === closeMenu) mutexCloseRef.value = null;

  emit('close');
};

/** 单选组选中值：转发给调用方（由 MenuItems 的 onPick 触发，级联子层则走 item.onPick 不上抛） */
const handlePick = (value: string) => emit('pick', value);

/** 菜单项选中：向上派发 → 执行动作 → 非 keepOpen 项关闭浮层 */
const handleItemSelect = (item: MenuItem) => {
  emit('select', item);
  item.action?.();
  if (!item.keepOpen) closeMenu('item-select');
};

/** 浮层宿主：floating-ui 把定位 transform 写在 `[data-floating-layer]` 这层上（面板是它的子节点） */
const floatingHostEl = (): HTMLElement | null =>
  menuBoxRef.value?.closest<HTMLElement>('[data-floating-layer]') ?? null;

/** 在途的换锚点位移（同一实例同时最多一条）：下一次换锚点前先让它落到终点 */
let repositionAnim: Animation | null = null;

/** 收束在途位移到终点：finish 后宿主的 transform 回到 floating-ui 写的那份，量到的才是真落点 */
const finishReposition = () => {
  repositionAnim?.finish();
  repositionAnim = null;
};

/**
 * 在指定坐标打开菜单：先互斥关闭其他菜单，再定位、打开并聚焦首个可用项。
 * 已打开时换锚点要平滑滑到新落点（首次打开走 Transition 入场）。
 */
/**
 * 在指定坐标打开菜单：先互斥关闭其他菜单，再定位、打开并聚焦首个可用项。
 * 已打开时换锚点要平滑滑到新落点（首次打开走 Transition 入场）。
 *
 * @returns 是否真的打开了。被拒（disabled / 无可用项）时返回 false —— 调用方（useTargetMenu）
 *   据此复位自己的「打开态」，否则那个状态在拒绝路径上没有任何复位时机。
 */
const openMenuAt = async (clientX: number, clientY: number): Promise<boolean> => {
  if (disabled || !items?.length) return false;
  const wasOpen = isOpen.value;
  const host = wasOpen ? floatingHostEl() : null;

  finishReposition();
  // 旧落点必须在改坐标之前量：x/y 一改，定位就开始重算了
  const prevRect = host?.getBoundingClientRect() ?? null;

  x.value = clientX;
  y.value = clientY;
  isOpen.value = true;

  await nextTick();
  // 等新坐标真的算出来再量落点：update 是 fire-and-forget，只调它的话量到的仍是旧 transform
  await popoverRef.value?.compute();
  // 再等一次：坐标是经 floatingStyles 这个 computed 落到宿主 style 上的，中间隔一次渲染 flush
  await nextTick();

  if (prevRect && host) animateReposition(host, prevRect);
  return true;
};

/**
 * 换位动画：对浮层宿主做 FLIP 位移（从旧落点偏移归零），尊重系统减弱动态效果偏好。
 *
 * 位移取**宿主前后落点之差**，不能取锚点坐标之差：flip（翻转）与 shift（限位）都会改变
 * 「面板相对锚点的偏移」，那时锚点差值不再等于面板位移 —— 面板会先从错误的位置起跑再滑过去。
 * 视口下缘右键、面板翻到光标上方时最明显：按锚点差值算，起点会被再抬高整整一个「锚点位移」。
 *
 * 这里刻意用 rect（含 transform）而非 offset 链：与 vScrollbar 的 getHostOffset 正好相反 ——
 * 那里要避开 transform（过渡期的中间态会让 overlay 偏），而宿主的**定位本身就是 transform**，
 * 量到的才是它此刻真实落点。量之前先 finish 在途动画，正是为了避开「量到中间态」。
 */
const animateReposition = (host: HTMLElement, prevRect: DOMRect) => {
  // 偏好查询走 platform/utils/motion（单一来源），不在此处另写 matchMedia
  if (prefersReducedMotion()) return;

  const nextRect = host.getBoundingClientRect();
  const dx = prevRect.left - nextRect.left;
  const dy = prevRect.top - nextRect.top;
  if (dx === 0 && dy === 0) return;

  repositionAnim = host.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
    composite: 'add', // floating-ui 用 transform 定位宿主，动画必须叠加而非替换，否则会瞬移到原点
    duration: CONTEXT_MENU_REPOSITION_DURATION_MS,
    easing: CONTEXT_MENU_REPOSITION_EASING,
  });
};

/** 右键事件入口：阻断默认菜单并在鼠标位置打开（右键分支专用） */
const handleContextMenu = (e: MouseEvent) => {
  if (disabled) return;
  e.preventDefault();
  e.stopPropagation();
  void openMenuAt(e.clientX, e.clientY);
};

/**
 * 面板键盘：仅 Tab 关闭（三态通用）。
 *
 * ↑↓ 与 → 都不在这里处理 —— 面板经 Teleport 后不在子面板的 @keydown 之内，而这里取行元素
 * 只能取到**顶层**列表的：子面板里按 ↑↓ 会因「焦点不在顶层行上」而把焦点弹回顶层第一项。
 * 那两组键已下沉到 MenuItems 的列表根上，由各层在自己的行集合里处理（见其 handleListKeydown）。
 */
const handleMenuKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    closeMenu('keydown-tab');
  }
};

onBeforeUnmount(() => {
  if (mutexCloseRef.value === closeMenu) mutexCloseRef.value = null;
});

defineExpose({ openMenuAt, closeMenu });
</script>
