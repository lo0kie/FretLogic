<template>
  <Teleport :to="teleportTo" :disabled="disabledTeleport">
    <Transition
      name="v-transition-modal"
      @before-enter="emit('open')"
      @after-enter="emit('opened')"
      @before-leave="emit('close')"
      @after-leave="emit('closed')"
    >
      <div
        v-if="destroyOnClose ? visible : true"
        v-show="visible"
        v-bind="$attrs"
        ref="overlayRef"
        class="modal-overlay-container fixed inset-0 z-overlay flex p-md box-border bg-black/50 overflow-y-auto"
        :class="overlayAlignClass"
        @mousedown="handleMaskMousedown"
        @click.self="handleMaskClick"
      >
        <div
          ref="modalCardRef"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="title || $slots['title'] ? titleId : undefined"
          :aria-label="title || $slots['title'] ? undefined : '对话框'"
          tabindex="-1"
          class="modal-card relative z-panel flex flex-col box-border bg-bg-panel border border-glass-border rounded-lg shadow-floating outline-none transition-[width,height] duration-base"
          :style="[sizeStyle, topStyle]"
          @click.stop
          @keydown="handleKeydownTrap"
        >
          <div v-if="hasHeader" class="modal-header-zone pt-xl px-xl shrink-0 flex items-center justify-between gap-lg">
            <slot name="header" :title-id>
              <div class="modal-header-left flex items-center min-w-0 flex-1">
                <slot name="title" :title-id>
                  <h3
                    v-if="title"
                    :id="titleId"
                    class="modal-title text-sm font-bold tracking-tight text-text-title m-0 whitespace-nowrap overflow-hidden text-ellipsis"
                    :title
                  >
                    {{ title }}
                  </h3>
                </slot>
              </div>
              <div class="modal-header-right flex items-center gap-sm shrink-0">
                <slot name="header-extra" />
                <ActionButton
                  v-if="showClose"
                  variant="ghost"
                  size="sm"
                  icon-only
                  aria-label="关闭"
                  class="!p-1.5"
                  @click="close('close')"
                >
                  <X :size="20" :stroke-width="3" />
                </ActionButton>
              </div>
            </slot>
          </div>

          <div
            class="modal-body-scrollable px-xl py-lg flex-1 min-h-0 overflow-y-auto box-border no-scrollbar flex flex-col"
            :class="{ 'has-header': hasHeader, 'has-footer': showFooter, 'py-sm': !$slots['default'] }"
          >
            <slot />
          </div>

          <div
            v-if="showFooter"
            class="modal-footer-zone pb-xl px-xl pt-0 shrink-0 flex items-center justify-end gap-sm w-full box-border"
          >
            <slot name="footer">
              <slot name="cancel-btn">
                <ActionButton
                  variant="default"
                  size="md"
                  :disabled="cancelButtonDisabled || confirmLoading"
                  @click="close('cancel')"
                >
                  {{ cancelText }}
                </ActionButton>
              </slot>
              <slot name="confirm-btn">
                <ActionButton
                  variant="subtle"
                  :color="confirmType"
                  size="md"
                  :loading="confirmLoading"
                  :disabled="confirmButtonDisabled || confirmLoading"
                  @click="handleConfirm"
                >
                  {{ confirmText }}
                </ActionButton>
              </slot>
            </slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts">
// 全局弹窗层级栈：必须放在模块作用域（<script setup> 体每次实例化都会重新执行），
// 否则每个实例各自持有独立 Set，多层弹窗的 inert 协调与 Esc 栈顶判断都会失效
const activeModalOverlays = new Set<HTMLElement>();
const isClient = typeof document !== 'undefined';

/** 关闭来源：cancel=底部取消按钮 / close=右上角X / mask=点击蒙层 / esc=键盘ESC */
export type ModalCloseReason = 'cancel' | 'close' | 'mask' | 'esc';

const updateGlobalInertState = () => {
  if (!isClient) return;
  const currentTopOverlay = Array.from(activeModalOverlays).pop();

  document.body.childNodes.forEach(node => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (currentTopOverlay && el === currentTopOverlay) {
      el.removeAttribute('inert');
    } else if (activeModalOverlays.size > 0) {
      el.setAttribute('inert', '');
    } else {
      el.removeAttribute('inert');
    }
  });
};
</script>

<script setup lang="ts">
import { X } from '@lucide/vue';
import { useEventListener, useScrollLock } from '@vueuse/core';
import { computed, onBeforeUnmount, ref, useId, useSlots, useTemplateRef, watch } from 'vue';
import ActionButton from './ActionButton.vue';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    title?: string;
    /** 预设别名或任意自定义值：number 视为 px，字符串如 "520px" 直接生效 */
    width?: 'w-sm' | 'w-md' | 'w-80' | 'w-lg' | 'w-large' | 'w-xl' | 'w-wide' | 'w-full' | (string & {}) | number;
    height?: 'h-auto' | 'h-sm' | 'h-md' | 'h-lg' | 'h-xl' | 'h-full' | (string & {}) | number;
    showFooter?: boolean;
    /** 是否显示右上角关闭（X）按钮，默认 true */
    showClose?: boolean;
    cancelText?: string;
    confirmText?: string;
    confirmType?: 'primary' | 'danger' | 'warning' | 'default';
    closeOnMask?: boolean;
    /** 是否允许 Esc 键关闭，默认 true；关闭后仅能通过遮罩/按钮关闭 */
    keyboard?: boolean;
    /** 确认按钮 Loading 态：为 true 时确认按钮显示加载并禁止重复触发，同时屏蔽遮罩/ESC 关闭 */
    confirmLoading?: boolean;
    /** 禁用确认按钮（不阻塞遮罩/ESC 关闭） */
    confirmButtonDisabled?: boolean;
    /** 禁用取消按钮 */
    cancelButtonDisabled?: boolean;
    /** 关闭前拦截：返回 false 或 Promise<false> 可阻止关闭（取消按钮、遮罩、ESC、X 均生效） */
    beforeClose?: () => boolean | Promise<boolean>;
    /** Teleport 挂载目标，默认 'body' */
    teleportTo?: string | HTMLElement;
    /** 禁用 Teleport，在当前父节点就地渲染 */
    disabledTeleport?: boolean;
    /** 垂直方向是否居中展示，默认 true */
    centered?: boolean;
    /** 自定义顶部距离（如 "100px" 或 100），传入后自动顶部对齐 */
    top?: string | number;
    /** 关闭时是否彻底销毁内部 DOM，默认 true */
    destroyOnClose?: boolean;
  }>(),
  {
    title: '',
    width: 'w-80',
    height: 'h-auto',
    showFooter: true,
    showClose: true,
    cancelText: '取消',
    confirmText: '确认',
    confirmType: 'primary',
    closeOnMask: true,
    keyboard: true,
    confirmLoading: false,
    confirmButtonDisabled: false,
    cancelButtonDisabled: false,
    teleportTo: 'body',
    disabledTeleport: false,
    centered: true,
    top: undefined,
    destroyOnClose: true,
  }
);

const emit = defineEmits<{
  (e: 'confirm'): void;
  /** 关闭时携带来源（取消按钮/X/蒙层/ESC），程序化置 visible=false 不触发 */
  (e: 'cancel', reason: ModalCloseReason): void;
  (e: 'open'): void;
  (e: 'opened'): void;
  (e: 'close'): void;
  (e: 'closed'): void;
}>();

const slots = useSlots();
const visible = defineModel<boolean>('visible', { required: true });
const overlayRef = useTemplateRef<HTMLDivElement>('overlayRef');
const modalCardRef = useTemplateRef<HTMLDivElement>('modalCardRef');
const titleId = `base-modal-title-${useId()}`;

// SSR 安全：服务端无 document，降级为普通 ref，避免运行时崩溃
const isBodyLocked = isClient ? useScrollLock(document.body) : ref(false);

const isCentered = computed(() => props.centered && props.top === undefined);

const overlayAlignClass = computed(() => {
  if (isCentered.value) {
    return 'items-center justify-center';
  }
  return 'items-start justify-center';
});

const topStyle = computed(() => {
  if (props.top !== undefined) {
    const t = typeof props.top === 'number' ? `${props.top}px` : props.top;
    return { marginTop: t };
  }
  if (!props.centered) {
    return { marginTop: '10vh' };
  }
  return {};
});

// 预设尺寸映射：width|maxWidth / height|maxHeight
const WIDTH_MAP: Record<string, string> = {
  'w-sm': '380px|90vw',
  'w-md': '480px|90vw',
  'w-80': '480px|90vw',
  'w-lg': '640px|90vw',
  'w-large': '840px|90vw',
  'w-xl': '840px|90vw',
  'w-wide': '1080px|92vw',
  'w-full': '1320px|95vw',
};
const HEIGHT_MAP: Record<string, string> = {
  'h-auto': 'auto|80vh',
  'h-sm': '320px|80vh',
  'h-md': '480px|80vh',
  'h-lg': '640px|85vh',
  'h-xl': '800px|90vh',
  'h-full': '90vh|90vh',
};

const sizeStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {};
  const w = props.width;
  if (typeof w === 'number') {
    style['width'] = `${w}px`;
    style['maxWidth'] = '90vw';
  } else if (w && WIDTH_MAP[w]) {
    const parts = WIDTH_MAP[w].split('|');
    if (parts[0]) style['width'] = parts[0];
    if (parts[1]) style['maxWidth'] = parts[1];
  } else if (typeof w === 'string' && w) {
    style['width'] = w;
  }
  const h = props.height;
  if (typeof h === 'number') {
    style['height'] = `${h}px`;
    style['maxHeight'] = '90vh';
  } else if (h && HEIGHT_MAP[h]) {
    const parts = HEIGHT_MAP[h].split('|');
    if (parts[0]) style['height'] = parts[0];
    if (parts[1]) style['maxHeight'] = parts[1];
  } else if (typeof h === 'string' && h) {
    style['height'] = h;
  }
  return style;
});

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const hasHeader = computed(() =>
  Boolean(slots['header'] || slots['header-extra'] || slots['title'] || props.title || props.showClose)
);

let stopKeydownListener: (() => void) | null = null;
const clearListeners = () => {
  stopKeydownListener?.();
  stopKeydownListener = null;
};

// 仅当自身位于弹窗栈顶时才响应 Esc，避免一次按键同时关闭所有层叠弹窗
const isTopOverlay = () => {
  if (!overlayRef.value) return false;
  // 刚打开还未入栈（setTimeout 入队间隙）时视为栈顶
  if (!activeModalOverlays.has(overlayRef.value)) return true;
  return Array.from(activeModalOverlays).pop() === overlayRef.value;
};

const handleEscape = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  if (!props.keyboard || !isTopOverlay()) return;
  close('esc');
};

watch(
  visible,
  async isOpen => {
    if (!isOpen) {
      clearListeners();
      if (overlayRef.value) {
        activeModalOverlays.delete(overlayRef.value);
        updateGlobalInertState();
      }
      isBodyLocked.value = activeModalOverlays.size > 0;
    } else {
      isBodyLocked.value = true;
      stopKeydownListener = useEventListener(window, 'keydown', handleEscape);
      // 待 DOM 挂载后加入激活栈
      setTimeout(() => {
        if (overlayRef.value) {
          activeModalOverlays.add(overlayRef.value);
          updateGlobalInertState();
        }
      }, 0);
    }
  },
  { immediate: true }
);

const handleKeydownTrap = (e: KeyboardEvent) => {
  if (e.key !== 'Tab' || !modalCardRef.value) return;
  const focusables = Array.from(modalCardRef.value.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  if (focusables.length === 0) {
    modalCardRef.value.focus();
    return;
  }
  const firstEl = focusables[0]!;
  const lastEl = focusables[focusables.length - 1]!;
  if (e.shiftKey) {
    if (document.activeElement === firstEl || document.activeElement === modalCardRef.value) {
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

onBeforeUnmount(() => {
  clearListeners();
  if (overlayRef.value) {
    activeModalOverlays.delete(overlayRef.value);
    updateGlobalInertState();
  }
  isBodyLocked.value = activeModalOverlays.size > 0;
});

// 统一关闭入口：加载中禁止关闭，并支持 beforeClose 拦截；reason 标识关闭来源
const close = async (reason: ModalCloseReason = 'cancel') => {
  if (props.confirmLoading) return;
  if (props.beforeClose) {
    const ok = await props.beforeClose();
    if (ok === false) return;
  }
  emit('cancel', reason);
  visible.value = false;
};

const handleConfirm = () => {
  if (props.confirmLoading) return; // 防止重复触发
  emit('confirm');
};

let mousedownTarget: EventTarget | null = null;
const handleMaskMousedown = (e: MouseEvent) => {
  mousedownTarget = e.target;
};
const handleMaskClick = (e: MouseEvent) => {
  if (props.closeOnMask && e.target === e.currentTarget && mousedownTarget === e.currentTarget) {
    close('mask');
  }
  mousedownTarget = null;
};
</script>
