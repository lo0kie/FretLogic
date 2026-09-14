<template>
  <!-- 通用贴边浮动面板（平台 UI 原语，与业务无关）：
       贴视口右侧悬浮，不进页面布局、不锁滚动、不阻断背景交互，宿主页面无需让位。
       骨架固定为「头部（标题 + 操作区 + 关闭）/ 主体（自适应撑满）/ 底部（可选）」三段，
       内容全部由插槽注入，组件本身不感知任何业务语义。

       两个可选能力由宿主按需开启：
       - intercept：把面板之外的上/右/下三条留白用「透明拦截层」接管指针事件
         （不填色、不穿透到宿主页面），典型用法是宿主存在拖拽落点、不希望落点被页面元素截获；
       - offsetActive：会话期间（如宿主拖拽进行中）面板整体右移只留一截，避免遮挡宿主内容 -->
  <Teleport :disabled="disabledTeleport" :to="teleportTo">
    <!-- 留白拦截层：只铺「上 / 右 / 下」三条空隙条带，不铺面板本体所占区域
         （让位时面板右移，那块区域要露出宿主内容供落点，铺了就挡住落点了）。
         条带完全透明（不填任何颜色、不挡内容），唯一职责是吃掉落在留白上的指针事件：
         外层 pointer-events-none + 条带 pointer-events-auto。
         层级取 screen 级遮罩层 z-scrim：高于顶栏与普通内容、低于面板（动态池 ≥9999）与弹窗/下拉，
         这样条带只管拦事件，不会反压后来的浮层、拖拽幽灵与全局提示 -->
    <div
      v-if="visibleModel && intercept"
      data-floating-panel-scrim
      class="floating-panel-scrim pointer-events-none fixed inset-0 z-scrim"
    >
      <div :style="stripWidthStyle" class="pointer-events-auto absolute top-0 right-0 h-lg" />
      <div class="pointer-events-auto absolute top-0 right-0 bottom-0 w-lg" />
      <div :style="stripWidthStyle" class="pointer-events-auto absolute right-0 bottom-0 h-lg" />
    </div>

    <Transition
      @after-leave="handleAfterLeave()"
      @before-enter="handleBeforeEnter($event)"
      @before-leave="handleBeforeLeave($event)"
      @enter="handleEnter($event)"
      appear
    >
      <aside
        v-if="visibleModel"
        :aria-labelledby="hasHeader ? titleId : undefined"
        :class="PANEL_CLASS"
        :style="panelStyle"
        data-floating-panel
        ref="panelRef"
        role="region"
      >
        <div
          v-if="hasHeader"
          class="floating-panel-header flex shrink-0 items-center justify-between gap-md px-lg pt-lg pb-md"
        >
          <slot :title-id name="title">
            <h3 v-if="title" :id="titleId" class="m-0 truncate text-sm/tight font-bold tracking-tight text-fg-title">
              {{ title }}
            </h3>
          </slot>
          <div class="flex shrink-0 items-center gap-sm">
            <slot name="header-extra" />
            <ActionButton
              v-if="showClose"
              :aria-label="closeAriaLabel"
              @click="visibleModel = false"
              icon-only
              icon="x"
              icon-stroke="bold"
              size="md"
              variant="ghost"
            />
          </div>
        </div>

        <div class="floating-panel-body relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <slot />
        </div>

        <div v-if="$slots['footer']" class="floating-panel-footer flex w-full shrink-0 items-center">
          <slot name="footer" />
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, useSlots, useTemplateRef, watch } from 'vue';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import { acquireFloatingZ, releaseFloatingZ } from '@/platform/ui/popover/floatingZ';

defineOptions({ name: 'BaseFloatingPanel' });

const props = withDefaults(
  defineProps<{
    /** 面板可见性（v-model:visible） */
    visible: boolean;
    /** 面板标题：留空且无 title 插槽时整条头部不渲染（showClose 为真时仍渲染以便关闭） */
    title?: string;
    /** 面板宽度：number 视为 px，字符串（如 "480px" / "40vw"）原样生效；上限恒为 92vw */
    width?: string | number;
    /** 让位会话进行中（如宿主拖拽）：面板整体右移，屏内只保留 offsetVisible 那一段 */
    offsetActive?: boolean;
    /** 让位时留在屏内的宽度，用于露出宿主内容与落点 */
    offsetVisible?: string;
    /** 是否铺「上/右/下」三条透明拦截条带（吃掉留白上的指针事件、不穿透到宿主页面） */
    intercept?: boolean;
    /** 是否显示头部关闭按钮 */
    showClose?: boolean;
    /** 关闭按钮的无障碍标签 */
    closeAriaLabel?: string;
    /** Teleport 挂载目标，默认 'body' */
    teleportTo?: string | HTMLElement;
    /** 禁用 Teleport，在当前父节点就地渲染 */
    disabledTeleport?: boolean;
  }>(),
  {
    title: '',
    width: 480,
    offsetActive: false,
    offsetVisible: '1.25rem',
    intercept: true,
    showClose: true,
    closeAriaLabel: '关闭',
    teleportTo: 'body',
    disabledTeleport: false,
  }
);

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'open'): void;
  (e: 'opened'): void;
  (e: 'close'): void;
  (e: 'closed'): void;
}>();

const slots = useSlots();
const panelRef = useTemplateRef<HTMLElement>('panelRef');
const titleId = `base-floating-panel-title-${useId()}`;

const hasHeader = computed(() => Boolean(props.title || slots['title'] || slots['header-extra'] || props.showClose));

const visibleModel = computed({
  get: () => props.visible,
  set: val => emit('update:visible', val),
});

/** 面板宽度（number 视为 px） */
const cssWidth = computed(() => (typeof props.width === 'number' ? `${props.width}px` : props.width));

/** 拦截条带宽度与面板实际占位对齐（面板上限 92vw），再各让出一档间距 */
const stripWidthStyle = computed(() => ({ width: `calc(min(${cssWidth.value}, 92vw) + 1rem)` }));

// ---------- 浮动层级：与 Popover / 抽屉共享同一动态层池 ----------
// 打开时取「当前最高占用 + 1」：在本面板内打开的浮层（下拉、气泡）与后开的弹窗必定压住本面板
const floatingZ = ref(0);

/**
 * 进场/出场相位：closed = 完全右移出屏（起点/终点），open = 归位。
 * 进场由响应式驱动（元素仍在树中，样式可被 patch）；出场必须直接写 DOM，见下方钩子说明。
 */
const animPhase = ref<'closed' | 'open'>('open');

/** 三种位移端点：屏外（进出场）、让位、归位。共用同一 transform 通道 */
const OFFSCREEN_TRANSFORM = 'translateX(calc(100% + 1rem))';

/** 归位态位移：让位会话期间右移只留一截，否则完全归位 */
const restTransform = () => (props.offsetActive ? `translateX(calc(100% - ${props.offsetVisible}))` : 'translateX(0)');

const panelStyle = computed(() => ({
  zIndex: floatingZ.value,
  width: cssWidth.value,
  maxWidth: '92vw',
  transform: animPhase.value === 'closed' ? OFFSCREEN_TRANSFORM : restTransform(),
}));

const PANEL_CLASS =
  'floating-panel fixed top-lg right-lg bottom-lg flex flex-col overflow-hidden rounded-lg border border-border-light bg-surface-panel shadow-floating transition-transform duration-slow ease-out';

/** 直接写元素内联 transform（Transition 钩子内使用） */
const writePanelTransform = (el: Element, value: string) => {
  if (el instanceof HTMLElement) el.style.transform = value;
};

/**
 * 出场：必须直接操作 DOM。
 *
 * Transition 的离场元素已从 vnode 树中摘除，组件重渲染不会再 patch 它——
 * 只改 animPhase（响应式）不会反映到 DOM，元素既不产生 transform 过渡（出场动画消失），
 * 又要等 Vue 兜底超时才被移除。故此处同时写 DOM 与相位（相位保证复挂载时初值正确）。
 */
const handleBeforeLeave = (el: Element) => {
  animPhase.value = 'closed';
  writePanelTransform(el, OFFSCREEN_TRANSFORM);
  emit('close');
};

/** 进场：元素仍在树中，DOM 直写与相位双管齐下——相位让进场窗口内的重渲染维持屏外初值，不被 patch 回屏内而掐断动画 */
const handleBeforeEnter = (el: Element) => {
  animPhase.value = 'closed';
  writePanelTransform(el, OFFSCREEN_TRANSFORM);
};

/** 进场收尾：切到归位（让位中则为右移位置），浏览器从屏外过渡到该位置形成右侧滑入 */
const handleEnter = (el: Element) => {
  animPhase.value = 'open';
  writePanelTransform(el, restTransform());
};

/** 离场动画结束：释放层号供后续浮层复用，并派发 closed */
const handleAfterLeave = () => {
  if (floatingZ.value) {
    releaseFloatingZ(floatingZ.value);
    floatingZ.value = 0;
  }
  emit('closed');
};

/** Esc 关闭：仅当焦点在面板内时响应（非模态面板不抢占宿主页面的 Esc） */
const handleEscape = (e: KeyboardEvent) => {
  if (e.key !== 'Escape' || !visibleModel.value) return;
  const panel = panelRef.value;
  if (panel && document.activeElement && panel.contains(document.activeElement)) {
    visibleModel.value = false;
  }
};

watch(
  () => props.visible,
  async val => {
    if (!val) {
      window.removeEventListener('keydown', handleEscape);
      // 层号在离场动画结束后释放（见 handleAfterLeave）；此处不释放，避免离场期间被后续浮层抢占层号
      return;
    }
    floatingZ.value = acquireFloatingZ();
    window.addEventListener('keydown', handleEscape);
    emit('open');
    await nextTick();
    emit('opened');
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscape);
  // 兜底释放层号：面板在离场动画完成前被卸载时 after-leave 不会触发
  if (floatingZ.value) {
    releaseFloatingZ(floatingZ.value);
    floatingZ.value = 0;
  }
});
</script>
