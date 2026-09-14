<template>
  <Teleport :disabled="disabledTeleport" :to="teleportTo">
    <Transition
      :name="transitionName"
      @after-enter="emit('opened')"
      @after-leave="handleAfterLeave()"
      @before-enter="emit('open')"
      @before-leave="emit('close')"
    >
      <div
        v-bind="$attrs"
        v-if="destroyOnClose ? visible : true"
        v-show="visible"
        :class="[overlayAlignClass, mask ? 'bg-black/50' : 'pointer-events-none bg-transparent']"
        :style="{ zIndex: floatingZ }"
        @click.self="handleMaskClick($event)"
        @mousedown="handleMaskMousedown($event)"
        class="drawer-overlay-container fixed inset-0 flex overflow-hidden"
        ref="overlayRef"
      >
        <div
          :aria-labelledby="title || $slots['title'] ? titleId : undefined"
          :class="[panelBorderClass, mask ? '' : 'pointer-events-auto']"
          :style="panelSizeStyle"
          @click.stop
          @keydown="handleKeydownTrap($event)"
          aria-modal="true"
          class="drawer-panel relative z-panel flex flex-col overflow-hidden border-glass-border bg-surface-panel shadow-floating outline-none"
          ref="drawerPanelRef"
          role="dialog"
          tabindex="-1"
        >
          <div
            v-if="hasHeader"
            class="drawer-header-zone relative z-10 flex min-h-[3.1rem] shrink-0 items-center justify-between gap-lg px-xl pt-lg pb-md"
          >
            <div class="drawer-header-left flex min-w-0 flex-1 items-center">
              <slot :title-id name="title">
                <h3
                  v-if="title"
                  :title
                  :id="titleId"
                  class="drawer-title m-0 truncate text-sm/tight font-bold tracking-tight text-fg-title"
                >
                  {{ title }}
                </h3>
              </slot>
            </div>
            <div class="drawer-header-right flex min-h-[1.6rem] shrink-0 items-center gap-sm">
              <slot name="header-extra" />
              <ActionButton
                v-if="showClose"
                @click="close('close')"
                icon-only
                aria-label="关闭"
                class="p-1.5!"
                icon="x"
                icon-size="xl"
                icon-stroke="bold"
                size="sm"
                variant="ghost"
              />
            </div>
          </div>

          <div
            v-edge-fade
            v-scrollbar
            :class="[
              {
                // body 四向 padding 独立推导（与 BaseModal 同模型）：贴卡片边缘恒为 xl，
                // 与相邻区块之间有内容时 lg、空内容垫片时 sm；缺 header/footer 的方向升级为贴边 xl
                'pt-lg': hasHeader && !!$slots['default'],
                'pt-sm': hasHeader && !$slots['default'],
                'pt-xl': !hasHeader,
                'pb-lg': !!$slots['footer'] && !!$slots['default'],
                'pb-sm': !!$slots['footer'] && !$slots['default'],
                'pb-xl': !$slots['footer'],
              },
            ]"
            class="drawer-body-scrollable no-scrollbar min-h-0 flex-1 overflow-y-auto px-xl"
          >
            <slot />
          </div>

          <div
            v-if="$slots['footer']"
            class="drawer-footer-zone relative z-10 flex w-full shrink-0 items-center justify-center gap-sm px-xl pt-md pb-lg"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts">
// 双 script 块的 SFC 视为同一模块：import 必须整体置于第一个块顶部（import/first），
// 下方 <script setup> 直接复用这些绑定
import { computed, nextTick, onBeforeUnmount, ref, useId, useSlots, useTemplateRef, watch } from 'vue';

import { useEventListener, useScrollLock } from '@vueuse/core';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import {
  hasActiveOverlays,
  isClient,
  isTopOverlay,
  registerOverlay,
  unregisterOverlay,
} from '@/platform/ui/overlay/overlayStack';
import { acquireFloatingZ, releaseFloatingZ } from '@/platform/ui/popover/floatingZ';
import { closeAllPopovers } from '@/platform/ui/popover/popoverRegistry';

import type { ModalCloseReason } from '@/platform/ui/modal/modalCloseReason';

/** 尺寸档位映射：值格式「主尺寸|最大尺寸」。left/right 抽屉主尺寸为宽度，top/bottom 为主轴高度 */
const DRAWER_SIZE_MAP: Record<string, string> = {
  sm: '380px|85%',
  md: '480px|90%',
  lg: '640px|92%',
  full: '100%|100%',
};
</script>

<script setup lang="ts">
defineOptions({ inheritAttrs: false });

const visible = defineModel<boolean>('visible', { required: true });

const props = withDefaults(
  defineProps<{
    /** 抽屉标题（title 插槽可自定义，header-extra 追加头部右侧内容） */
    title?: string;
    /** 弹出方位：right 右侧（默认）/ left 左侧 / top 顶部 / bottom 底部 */
    placement?: 'right' | 'left' | 'top' | 'bottom';
    /** 主尺寸档位或自定义值：left/right 控制宽度，top/bottom 控制高度；
     *  number 视为 px，字符串（如 "520px" / "40%"）原样生效 */
    size?: 'sm' | 'md' | 'lg' | 'full' | (string & {}) | number;
    /** 是否显示遮罩；false 时为非阻断模式（背景可交互，遮罩点击关闭随之失效） */
    mask?: boolean;
    /** 点击遮罩是否关闭（仅 mask 开启时生效），默认 true */
    closeOnMask?: boolean;
    /** 是否允许 Esc 键关闭（仅栈顶抽屉响应），默认 true */
    keyboard?: boolean;
    /** 是否显示右上角关闭（X）按钮，默认 true */
    showClose?: boolean;
    /** 关闭前拦截：返回 false 或 Promise<false> 可阻止关闭（X / 遮罩 / ESC 均生效） */
    beforeClose?: () => boolean | Promise<boolean>;
    /** 关闭时是否彻底销毁内部 DOM，默认 true */
    destroyOnClose?: boolean;
    /** Teleport 挂载目标，默认 'body' */
    teleportTo?: string | HTMLElement;
    /** 禁用 Teleport，在当前父节点就地渲染 */
    disabledTeleport?: boolean;
  }>(),
  {
    title: '',
    placement: 'right',
    size: 'md',
    mask: true,
    closeOnMask: true,
    keyboard: true,
    showClose: true,
    beforeClose: undefined,
    destroyOnClose: true,
    teleportTo: 'body',
    disabledTeleport: false,
  }
);

const emit = defineEmits<{
  /** 关闭时携带来源（X / 蒙层 / ESC），程序化置 visible=false 不触发 */
  (e: 'cancel', reason: ModalCloseReason): void;
  (e: 'open'): void;
  (e: 'opened'): void;
  (e: 'close'): void;
  (e: 'closed'): void;
}>();

const slots = useSlots();
const overlayRef = useTemplateRef<HTMLDivElement>('overlayRef');
const drawerPanelRef = useTemplateRef<HTMLDivElement>('drawerPanelRef');
const titleId = `base-drawer-title-${useId()}`;

const hasHeader = computed(() => Boolean(slots['header-extra'] || slots['title'] || props.title || props.showClose));

// ---------- 层级联动：与 Popover / ContextMenu / Selector 下拉共享同一动态层池 ----------
// 打开时取「当前最高占用 + 1」：后开的抽屉必定压住已开的抽屉与浮层；
// 抽屉内容里再打开 Popover 会分配到更高层号，天然盖在抽屉之上（与 Modal 内弹层行为一致）
const floatingZ = ref(0);

const overlayAlignClass = computed(() => {
  switch (props.placement) {
    case 'left':
      return 'items-stretch justify-start';
    case 'top':
      return 'items-start justify-stretch';
    case 'bottom':
      return 'items-end justify-stretch';
    default:
      return 'items-stretch justify-end';
  }
});

/** 过渡动画名：与 transitions.scss 的 .v-drawer-* 类对应 */
const transitionName = computed(() => `v-drawer-${props.placement}`);

const isHorizontal = computed(() => props.placement === 'left' || props.placement === 'right');

const panelSizeStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {};
  const raw = props.size;
  let main: string;
  let max: string;
  if (typeof raw === 'number') {
    main = `${raw}px`;
    max = '90%';
  } else if (raw && DRAWER_SIZE_MAP[raw]) {
    const parts = DRAWER_SIZE_MAP[raw].split('|');
    main = parts[0]!;
    max = parts[1]!;
  } else if (raw) {
    main = raw;
    max = '90%';
  } else {
    main = DRAWER_SIZE_MAP['md']!;
    max = '90%';
  }
  if (isHorizontal.value) {
    style['width'] = main;
    style['maxWidth'] = max;
  } else {
    style['height'] = main;
    style['maxHeight'] = max;
  }
  return style;
});

/** 方位差异化边框：贴边一侧不描边（不引入 scoped style，颜色走 tokens 的 border-glass-border） */
const panelBorderClass = computed(() => {
  switch (props.placement) {
    case 'left':
      return 'border-y border-r border-l-0';
    case 'top':
      return 'border-x border-b border-t-0';
    case 'bottom':
      return 'border-x border-t border-b-0';
    default:
      return 'border-y border-l border-r-0';
  }
});

// ---------- 滚动锁与 Esc ----------
const isBodyLocked = isClient ? useScrollLock(document.body) : ref(false);

// 仅当自身位于阻断层栈顶时才响应 Esc，避免一次按键同时关闭所有层叠抽屉
const isTopDrawer = () => isTopOverlay(overlayRef.value);

/** Esc 关闭：keyboard 开启且自身为栈顶时生效 */
const handleEscape = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  if (!props.keyboard || !isTopDrawer()) return;
  close('esc');
};

let stopKeydownListener: (() => void) | null = null;
/** 解绑全局键盘监听 */
const clearListeners = () => {
  stopKeydownListener?.();
  stopKeydownListener = null;
};

// ---------- 开关生命周期 ----------
watch(
  visible,
  async isOpen => {
    if (!isOpen) {
      clearListeners();
      if (overlayRef.value) {
        unregisterOverlay(overlayRef.value);
      }
      // 仅遮罩模式参与 body 滚动锁，非遮罩（调色盘）抽屉不锁背景
      isBodyLocked.value = props.mask && hasActiveOverlays() > 0;
    } else {
      // 打开瞬间收拢全局存量 Popover：抽屉为模态阻断层，不允许被先前浮层压在头上
      closeAllPopovers();
      // 滚动锁仅在遮罩模式下生效：mask=false 为调色盘模式，背景（谱面区）须可正常滚动与点击
      isBodyLocked.value = props.mask;
      stopKeydownListener = useEventListener(window, 'keydown', handleEscape);
      // 层号在打开瞬间即刻分配（早于内容渲染）：保证与并发打开的浮层时序严格一致
      floatingZ.value = acquireFloatingZ();
      // 待 DOM 挂载后加入激活栈（语义与 BaseModal 一致：nextTick 保证入栈顺序与 watch 触发顺序一致）
      void nextTick(() => {
        if (overlayRef.value) {
          registerOverlay(overlayRef.value);
        }
      });
    }
  },
  { immediate: true }
);

/** 离场动画结束：释放层号供后续浮层复用，并派发 closed */
const handleAfterLeave = () => {
  if (floatingZ.value) {
    releaseFloatingZ(floatingZ.value);
    floatingZ.value = 0;
  }
  emit('closed');
};

// ---------- Tab 焦点圈定：在抽屉内首个/末个可聚焦元素间循环 ----------
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const handleKeydownTrap = (e: KeyboardEvent) => {
  if (e.key !== 'Tab' || !drawerPanelRef.value) return;
  const focusables = Array.from(drawerPanelRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (focusables.length === 0) {
    drawerPanelRef.value.focus();
    return;
  }
  const firstEl = focusables[0]!;
  const lastEl = focusables[focusables.length - 1]!;
  if (e.shiftKey) {
    if (document.activeElement === firstEl || document.activeElement === drawerPanelRef.value) {
      e.preventDefault();
      lastEl.focus();
    }
  } else {
    if (document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  }
};

// ---------- 统一关闭入口：beforeClose 拦截 + 防重入（与 BaseModal 语义一致） ----------
let closePending = false;
const close = async (reason: ModalCloseReason = 'cancel') => {
  // beforeClose 执行期间防重入：遮罩 / X / Esc 并发触发时只放行一次请求，
  // 避免异步 beforeClose（二次确认 / 远端校验）被重复拉起
  if (closePending) return;
  if (props.beforeClose) {
    closePending = true;
    try {
      const ok = await props.beforeClose();
      if (ok === false) return; // 拦截：放弃本次关闭，closePending 由 finally 复位
    } finally {
      closePending = false;
    }
  }
  emit('cancel', reason);
  visible.value = false;
};

let mousedownTarget: EventTarget | null = null;
/** 记录按下位置：仅「按下与松开都在遮罩上」才视为点击遮罩 */
const handleMaskMousedown = (e: MouseEvent) => {
  mousedownTarget = e.target;
};
/** 遮罩点击关闭：校验按下/松开目标一致，避免从抽屉内拖拽出来误关 */
const handleMaskClick = (e: MouseEvent) => {
  if (props.mask && props.closeOnMask && e.target === e.currentTarget && mousedownTarget === e.currentTarget) {
    close('mask');
  }
  mousedownTarget = null;
};

onBeforeUnmount(() => {
  clearListeners();
  if (overlayRef.value) {
    unregisterOverlay(overlayRef.value);
  }
  // 仅遮罩模式参与 body 滚动锁
  isBodyLocked.value = props.mask && hasActiveOverlays() > 0;
  // 兜底释放层号：抽屉在离场动画完成前被卸载（如父组件销毁）时 after-leave 不会触发
  if (floatingZ.value) {
    releaseFloatingZ(floatingZ.value);
    floatingZ.value = 0;
  }
});
</script>
