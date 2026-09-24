<template>
  <div v-bind="$attrs" @keydown="handleListKeydown($event)" class="flex flex-col gap-xs p-xs" ref="rootRef">
    <!-- inheritAttrs:false + $attrs 重定向（与 BaseCollapse 同款）：调用方的 class / data-* / aria-* 落到
         列表根容器本体。面板根是真实元素，attrs 只有落在这里才有意义 —— 落不到 Teleport 出去的浮层上。

         ⚠️ 本条注释必须留在**元素内部**：模板根元素之前若有注释，dev 模式下注释会被保留成 vnode，
         根随即退化为 fragment（实测：注释写在根元素之前会编译出 _Fragment 根，写在元素内部则是单元素根）。
         注：此处不可出现 HTML 注释的起止字面量，否则会触发 vue/no-parsing-error 的 nested-comment。 -->
    <template v-if="title">
      <div class="truncate px-md text-2xs leading-tight font-semibold text-fg-disabled select-none">
        {{ title }}
      </div>
      <BaseDivider class="opacity-60" inset="0.25rem" />
    </template>

    <template v-for="(item, index) in resolvedItems" :key="item.label + index">
      <BaseDivider v-if="item.divided" class="my-0.5 opacity-60" inset="0.25rem" />

      <MenuSubmenu
        v-if="item.expandChildren ?? Boolean(item.children?.length || item.content)"
        :item
        :on-select
        :panel-class
        :panel-scrollbar
        :size
        :item-ref-cb="el => setItemEl(el, index)"
        :ref="el => setSubmenuInstance(el, index)"
        @close="handleSubmenuClose(index)"
        @open="handleSubmenuOpen(index)"
      >
        <!-- 子面板里的列表由本组件**自引用**递归渲染（<script setup> 按文件名自引用，无需 import）：
             MenuSubmenu 因此不必 import MenuItems，两文件之间的静态环解开，也不引入异步组件与额外 chunk -->
        <template #children="{ item: childItem }">
          <MenuItems
            :on-select
            :size
            :aria-label="childItem.label"
            :items="childItem.children"
            :model="childItem.model"
            :on-pick="childItem.onPick"
            role="menu"
          />
        </template>
      </MenuSubmenu>

      <MenuRow v-else :item :size :ref="el => setItemEl(el, index)" @activate="handleItemClick(item)">
        <!-- 前导槽只有**一枚**常驻图标：勾选态与条目图标是它的两种形态，靠换 name 切换 ——
             形变引擎等的正是「同一个实例改名」（见 icons/iconMorph.ts）。
             原先写成 v-if / v-else-if 两枚 <BaseIcon>，做不到这件事：Vue 3.5 给 v-if 分支生成隐式
             key（`key: 0` / `key: 1`），两个分支之间切换是**卸载再挂载**，name 从未变化、watch 不触发
             —— 于是登记多少可形变图标都不会动（同步目标子菜单的勾选态即此形态）。
             `icon` 是组件形态时仍走下面的 <component> 分支：没有可换的名字，也就无所谓形变。 -->
        <template #leading>
          <BaseIcon
            v-if="item.leadingIcon"
            :name="item.leadingIcon"
            aria-hidden="true"
            class="shrink-0 opacity-85 transition-opacity duration-fast group-enabled:group-hover:opacity-100"
            icon-size="md"
            icon-stroke="bold"
          />
          <component
            v-else-if="item.icon"
            :is="item.icon"
            aria-hidden="true"
            class="shrink-0 opacity-85 transition-opacity duration-fast group-enabled:group-hover:opacity-100"
            icon-size="md"
            icon-stroke="bold"
          />
        </template>

        <template #trailing>
          <span v-if="item.shortcut" class="ml-3 shrink-0 font-mono text-2xs tracking-tight opacity-45 select-none">
            {{ item.shortcut }}
          </span>
          <!-- 勾选在右：行尾追加 check，不占前导图标槽。这一枚是**独立出现 / 消失**而非换名 ——
               toggle 选中时它凭空出现，没有「上一个图标」可配对，故不参与形变（SidebarLeft 的筛选菜单即此形态）。
               勾选在左（checkPosition 非 right）走的是另一条：`leadingIcon` 在前导槽换名，那一条有形变。 -->
          <BaseIcon
            v-if="item.checked && item.checkPosition === 'right'"
            aria-hidden="true"
            class="ml-3 shrink-0 opacity-85 transition-opacity duration-fast group-enabled:group-hover:opacity-100"
            icon-size="md"
            icon-stroke="bold"
            name="check"
          />
        </template>
      </MenuRow>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onBeforeUpdate, ref, useTemplateRef } from 'vue';

import BaseDivider from '@/platform/ui/divider/BaseDivider.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';

import MenuRow from './MenuRow.vue';
import MenuSubmenu from './MenuSubmenu.vue';
import { registerSubmenuScrollGuard } from './submenuScrollGuard';

import type { MenuItem } from './types';
import type { ComponentSize } from '@/platform/types';
import type { IconName } from '@/platform/ui/icons/icons.registry';

defineOptions({ inheritAttrs: false });

const {
  items = [],
  title = '',
  size = 'md',
  panelClass = 'context-menu-box',
  panelScrollbar = false,
  model = undefined,
  onPick = undefined,
  onSelect = undefined,
} = defineProps<{
  /** 菜单项数据列表（children 级联项委托给 MenuSubmenu 渲染） */
  items?: MenuItem[];
  /** 顶部分组标题；为空时不渲染标题行与分割线 */
  title?: string;
  /** 菜单尺寸档位 */
  size?: ComponentSize;
  /** 级联子菜单面板样式类 */
  panelClass?: string;
  /** 级联子菜单面板是否用 v-scrollbar 自绘滚动条（透传 MenuSubmenu → BasePopover） */
  panelScrollbar?: boolean;
  /**
   * 本层单选组的当前值：给出后，带 `value` 的菜单项勾选态一律由 `item.value === model`
   * 现算（显式 `checked` 被覆盖）。不带 `value` 的项不受影响 —— 单选项与普通项可同层混排。
   * 不传则完全退回 `item.checked` 语义。
   */
  model?: string;
  /**
   * 本层单选组的选中回调：被点中的项带 `value` 时调用。
   * 顶层由 BaseMenu 接上（转发为 `pick` 事件）；级联子菜单那层由 MenuSubmenu 接上 `item.onPick`。
   */
  onPick?: (value: string) => void;
  /** 菜单项选中回调：由容器统一处理（执行 action、关闭浮层等） */
  onSelect?: (item: MenuItem) => void;
}>();

/**
 * 行渲染用的条目：额外带上**前导槽要显示的图标名**（`icon` 为组件形态时不带，交给模板的 <component> 分支）。
 * 为什么要把它算进条目而不是在模板里分两个分支：见模板 #leading 处的注释 —— 勾选态与条目图标必须是
 * 同一个 BaseIcon 实例上的两次 `name`，分成两个 v-if 分支就成了卸载再挂载。
 */
type MenuRowItem = MenuItem & { leadingIcon?: IconName };

/**
 * 本层实际渲染的菜单项：单选组（传了 `model`）下，把带 `value` 的项的勾选态现算出来。
 * 只覆盖带 `value` 的项 —— 同层的普通项（显式 `checked`、或压根不勾选）原样保留，
 * 因此单选项与普通项可以同层混排。
 *
 * ⚠️ **必须无条件复制并带上 `leadingIcon`**，不能「没变就原样返回」：`leadingIcon` 是本层新加的字段，
 * 调用方给的条目上没有它 —— 一旦早退返回原对象，模板的 `v-if="item.leadingIcon"` 就恒假，整列图标静默消失
 * （2026-09-25 踩过：同步菜单的「推送到云端」「从云端拉取」「同步设置」三行图标一起没了）。
 * 复制不影响调用方：`MenuSubmenu` / `MenuRow` 都只读字段，不比引用。
 */
const resolvedItems = computed<MenuRowItem[]>(() =>
  items.map(item => {
    const checked = model !== undefined && item.value !== undefined ? item.value === model : item.checked;
    // 勾选在左时 check 占据前导槽（替换条目图标），勾选在右时前导槽仍留给条目图标
    const leadingIcon =
      checked && item.checkPosition !== 'right' ? 'check' : typeof item.icon === 'string' ? item.icon : undefined;
    return { ...item, checked, leadingIcon };
  })
);

const itemEls = ref<(HTMLButtonElement | null)[]>([]);

/** 收集菜单项 DOM（函数式 ref）：行已抽成 MenuRow 子组件，函数式 ref 到手的是它 defineExpose 的对象
 *  （含 root），需解包出真正的根按钮元素，菜单的键盘导航才能 focus() */
const setItemEl = (el: unknown, index: number) => {
  const node = el && typeof el === 'object' && 'root' in el ? (el as { root?: HTMLElement }).root : el;
  if (node instanceof HTMLButtonElement) itemEls.value[index] = node;
};

type MenuSubmenuInstance = InstanceType<typeof MenuSubmenu>;
/** 收集级联子面板实例（函数式 ref），供兄弟互斥关闭 */
const submenuInstances = ref<(MenuSubmenuInstance | null)[]>([]);
const setSubmenuInstance = (el: unknown, index: number) => {
  submenuInstances.value[index] = (el as MenuSubmenuInstance | null) ?? null;
};

onBeforeUpdate(() => {
  itemEls.value = [];
  submenuInstances.value = [];
});

/** 级联兄弟互斥：任一子面板打开即关闭上一个打开的兄弟子面板。
 *  兄弟被「点击钉住」后 hover 离开不再自行关闭（pinned 早退），不做互斥会出现
 *  两个子菜单同时展开；close 幂等，重复关闭无副作用 */
let lastOpenSubmenuIndex = -1;
/** 滚动收起后的打开抑制窗口（ms）：惯性/连续滚动期间，迟到的 hover 打开会被下一个
 *  scroll 事件立刻收掉，表现为预览闪一下又消失。窗口内的 open 在同一调用栈内同步关闭——
 *  open+close 不产生任何一次绘制，肉眼无闪烁；窗口过后悬停恢复正常打开 */
const SCROLL_SUPPRESS_OPEN_MS = 250;
let lastScrollClosedAt = 0;
// —— 菜单滚动时收起已展开的级联子面板 ——
// 滚轮滚动不派发 mouseover/mouseleave：指针停在原地、列表内容滚走，已展开的子面板会跟着触发元素
// 被 floating-ui 重新定位到视口上/下边缘之外，直到指针移到另一个条目才被互斥关闭。故需在捕获阶段
// 监听滚动（scroll 不冒泡，但捕获阶段会沿祖先链传播），滚动容器是本层菜单面板（含本层根节点）时收起。
//
// 监听收敛在 submenuScrollGuard 的全局登记表里：**只在有子面板展开时登记、收起即注销**。
// 此前是每个菜单实例各挂一条常驻 window 监听——每个和弦卡片都带一个菜单，监听数随卡片数线性增长，
// 而绝大多数实例当时并没有展开的子面板，handler 首行即空转返回。
const rootRef = useTemplateRef<HTMLElement>('rootRef');
/** 本层「有子面板展开」期间持有的滚动守卫注销函数 */
let unregisterScrollGuard: (() => void) | null = null;

/** 展开子面板时登记滚动守卫（同一次展开期间幂等，只登记一条） */
const retainScrollGuard = () => {
  if (unregisterScrollGuard) return;
  const root = rootRef.value;
  if (!root) return;
  unregisterScrollGuard = registerSubmenuScrollGuard({ root, close: () => closeAllSubmenus(true) });
};

/** 收起子面板时释放滚动守卫（登记表清空后全局监听随之摘除） */
const releaseScrollGuard = () => {
  unregisterScrollGuard?.();
  unregisterScrollGuard = null;
};

const handleSubmenuOpen = (index: number) => {
  if (Date.now() - lastScrollClosedAt < SCROLL_SUPPRESS_OPEN_MS) {
    submenuInstances.value[index]?.close();
    return;
  }
  if (lastOpenSubmenuIndex !== -1 && lastOpenSubmenuIndex !== index)
    submenuInstances.value[lastOpenSubmenuIndex]?.close();

  lastOpenSubmenuIndex = index;
  retainScrollGuard();
};

/** 收起本层当前展开的子面板，并复位互斥游标；byScroll 时登记抑制窗口起点 */
const closeAllSubmenus = (byScroll = false) => {
  if (lastOpenSubmenuIndex === -1) return;
  submenuInstances.value[lastOpenSubmenuIndex]?.close();
  lastOpenSubmenuIndex = -1;
  releaseScrollGuard();
  if (byScroll) lastScrollClosedAt = Date.now();
};

/**
 * 子面板自行收起（点选、外部点击、Esc、← 键）时由 MenuSubmenu 上抛：
 * 复位互斥游标并释放滚动守卫。
 *
 * 为什么必须有这条：此前只认「父级主动关」一条路径（closeAllSubmenus），子面板自己收起后
 * lastOpenSubmenuIndex 仍指着那个已关闭的实例、守卫也仍登记着 —— 全局滚动监听于是继续挂着，
 * 而它一触发就会对着空气调 closeAllSubmenus(true) 并记下抑制窗口，症状是「子面板被外部点击
 * 关掉之后，随手滚一下页面，再悬停同级子项就再也展不开」。
 *
 * 与 closeAllSubmenus 的先后顺序无关：两条路径都会把游标清成 -1，后到的按 index 不等直接早退。
 */
const handleSubmenuClose = (index: number) => {
  if (lastOpenSubmenuIndex !== index) return;
  lastOpenSubmenuIndex = -1;
  releaseScrollGuard();
};

// 卸载兜底释放：子面板展开期间组件被卸载（菜单随浮层一起销毁）时 closeAllSubmenus 不会跑到，
// 守卫会连同已脱离文档的 root 一起留在登记表里
onBeforeUnmount(releaseScrollGuard);

/** 菜单项点击 / 回车：禁用态忽略 → 上抛给容器 → 本层若是单选组则回调选中值 */
const handleItemClick = (item: MenuItem) => {
  if (item.disabled) return;
  onSelect?.(item);
  if (item.value !== undefined) onPick?.(item.value);
};

/**
 * 列表键盘入口：→ 展开当前聚焦行的级联子面板并把焦点交给它（← 由子面板那层自行处理并归还焦点）。
 *
 * 为什么挂在这里而不是面板上：面板（BaseMenu 的 role="menu" 容器）只处理 ↑↓/Tab，而子面板经
 * Teleport 到 body 后不再落在它的 @keydown 之内，子菜单项对键盘就永远没有入口。挂在本层列表根上
 * 则顶层与各级子面板一视同仁（子面板里的列表同样是本组件的递归实例）。
 */
const handleListKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'ArrowRight') return;
  const index = itemEls.value.findIndex(el => el === document.activeElement);
  const instance = index >= 0 ? submenuInstances.value[index] : null;
  if (!instance) return; // 焦点不在行上，或该行不是级联项
  e.preventDefault();
  e.stopPropagation();
  void instance.openAndFocusFirst();
};

/** 聚焦第一个可用菜单项 */
const focusFirstItem = () => {
  const first = itemEls.value.find(el => el && !el.disabled);
  first?.focus();
};

defineExpose({
  itemEls,
  focusFirstItem,
});
</script>
