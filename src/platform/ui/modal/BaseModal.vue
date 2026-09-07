<template>
  <Teleport :disabled="disabledTeleport" :to="teleportTo">
    <Transition
      @after-enter="emit('opened')"
      @after-leave="emit('closed')"
      @before-enter="emit('open')"
      @before-leave="emit('close')"
      name="v-transition-modal"
    >
      <div
        v-bind="$attrs"
        v-if="destroyOnClose ? visible : true"
        v-show="visible"
        :class="overlayAlignClass"
        @click.self="handleMaskClick($event)"
        @mousedown="handleMaskMousedown($event)"
        class="modal-overlay-container fixed inset-0 z-overlay box-border flex overflow-y-auto bg-black/50 p-md"
        ref="overlayRef"
      >
        <!-- 关闭（leave）期间禁用高度接管：expanded 联动 visible，避免退场动画进行中卡片被高度压 0 裁没 -->
        <div
          v-auto-height="{ expanded: visible, disabled: !isAutoHeight || !visible }"
          :aria-label="title || $slots['title'] ? undefined : '对话框'"
          :aria-labelledby="title || $slots['title'] ? titleId : undefined"
          :style="[sizeStyle, topStyle]"
          @click.stop
          @keydown="handleKeydownTrap($event)"
          aria-modal="true"
          class="modal-card relative z-panel box-border flex flex-col overflow-hidden rounded-lg border border-glass-border bg-surface-panel shadow-floating outline-none"
          ref="modalCardRef"
          role="dialog"
          tabindex="-1"
        >
          <div :class="isAutoHeight ? 'h-auto shrink-0' : 'min-h-0 flex-1'" class="flex w-full flex-col">
            <div
              v-if="hasHeader"
              class="modal-header-zone flex min-h-[3.1rem] shrink-0 items-center justify-between gap-lg px-xl pt-xl"
            >
              <slot :title-id name="header">
                <div class="modal-header-left flex min-w-0 flex-1 items-center">
                  <slot :title-id name="title">
                    <h3
                      v-if="title"
                      :title
                      :id="titleId"
                      class="modal-title m-0 truncate text-sm/tight font-bold tracking-tight text-fg-title"
                    >
                      {{ title }}
                    </h3>
                  </slot>
                </div>
                <div class="modal-header-right flex min-h-[1.6rem] shrink-0 items-center gap-sm">
                  <slot name="header-extra" />
                  <ActionButton
                    v-if="showClose"
                    :disabled="confirmLoading"
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
              </slot>
            </div>

            <div
              :class="[
                { 'has-header': hasHeader, 'has-footer': showFooter, 'py-sm': !$slots['default'] },
                isAutoHeight ? 'h-auto max-h-[calc(85vh-8rem)]' : 'min-h-0 flex-1',
              ]"
              class="modal-body-scrollable no-scrollbar box-border flex flex-col overflow-y-auto px-xl py-lg"
            >
              <slot />
            </div>

            <div
              v-if="showFooter"
              class="modal-footer-zone box-border flex w-full shrink-0 items-center justify-end gap-sm px-xl pt-0 pb-xl"
            >
              <slot name="footer">
                <slot name="cancel-btn">
                  <ActionButton
                    :disabled="cancelButtonDisabled || confirmLoading"
                    :label="cancelText"
                    @click="close('cancel')"
                    variant="default"
                  />
                </slot>

                <slot name="confirm-btn">
                  <ActionButton
                    :color="confirmType"
                    :disabled="confirmButtonDisabled || confirmLoading"
                    :label="confirmText"
                    :loading="confirmLoading"
                    @click="handleConfirm()"
                    variant="subtle"
                  />
                </slot>
              </slot>
            </div>
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

import type { ModalCloseReason } from './modalCloseReason';
import type { ThemeColor } from '@/platform/types';

// 全局弹窗层级栈：必须放在模块作用域（<script setup> 体每次实例化都会重新执行），
// 否则每个实例各自持有独立 Set，多层弹窗的 inert 协调与 Esc 栈顶判断都会失效
const activeModalOverlays = new Set<HTMLElement>();
const isClient = typeof document !== 'undefined';

/** 依据弹窗栈顶同步 body 直接子元素的 inert 属性：仅栈顶弹窗可交互 */
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
// （ModalCloseReason 类型在 ./modalCloseReason.ts，<script setup> 内不允许 export）
</script>

<script setup lang="ts">
defineOptions({ inheritAttrs: false });
const visible = defineModel<boolean>('visible', { required: true });
const props = withDefaults(
  defineProps<{
    /** 弹窗标题（配合默认 footer 或独立使用） */
    title?: string;
    /** 预设别名或任意自定义值：number 视为 px，字符串如 "520px" 直接生效 */
    width?: 'w-sm' | 'w-md' | 'w-80' | 'w-lg' | 'w-large' | 'w-xl' | 'w-wide' | 'w-full' | (string & {}) | number;
    /** 高度预设别名或自定义值：number 视为 px，字符串原样生效 */
    height?: 'h-auto' | 'h-sm' | 'h-md' | 'h-lg' | 'h-xl' | 'h-full' | (string & {}) | number;
    /** 是否渲染底部按钮区（取消/确认），默认 true */
    showFooter?: boolean;
    /** 是否显示右上角关闭（X）按钮，默认 true */
    showClose?: boolean;
    /** 取消按钮文案 */
    cancelText?: string;
    /** 确认按钮文案 */
    confirmText?: string;
    /** 确认按钮主题色（如 primary / danger） */
    confirmType?: ThemeColor;
    /** 点击蒙层是否关闭弹窗，默认 true */
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
const overlayRef = useTemplateRef<HTMLDivElement>('overlayRef');
const modalCardRef = useTemplateRef<HTMLDivElement>('modalCardRef');
const titleId = `base-modal-title-${useId()}`;

// 自适应高度与过渡：未指定固定高度时实时同步内部内容尺寸并平滑过渡
const isAutoHeight = computed(() => {
  const h = props.height;
  if (!h || h === 'h-auto') return true;
  if (typeof h === 'string' && HEIGHT_MAP[h]?.startsWith('auto')) return true;
  return false;
});

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
    if (parts[0] === 'auto') {
      // 自适应高度由 v-auto-height 动态测量与过渡
    } else if (parts[0]) {
      style['height'] = parts[0];
    }
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
/** 解绑全局键盘监听 */
const clearListeners = () => {
  stopKeydownListener?.();
  stopKeydownListener = null;
};

// 仅当自身位于弹窗栈顶时才响应 Esc，避免一次按键同时关闭所有层叠弹窗
const isTopOverlay = () => {
  if (!overlayRef.value) return false;
  // 刚打开还未完成 nextTick 入栈（DOM 已挂载但尚未登记）时视为栈顶
  if (!activeModalOverlays.has(overlayRef.value)) return true;
  return Array.from(activeModalOverlays).pop() === overlayRef.value;
};

/** Esc 关闭：keyboard 开启且自身为栈顶时生效 */
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
      // 待 DOM 挂载后加入激活栈。用 nextTick（渲染冲刷后的微任务）而非裸 setTimeout(0)（下一个宏任务）：
      // 语义更贴合「DOM 已更新」，且多个弹窗几乎同时打开时，入栈顺序与各 watch 的触发顺序严格一致，
      // 不会因宏任务排队时机与其它异步逻辑交织而错序。
      void nextTick(() => {
        if (overlayRef.value) {
          activeModalOverlays.add(overlayRef.value);
          updateGlobalInertState();
        }
      });
    }
  },
  { immediate: true }
);

/** Tab 焦点圈定：在弹窗内首个/末个可聚焦元素间循环 */
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
let closePending = false;
const close = async (reason: ModalCloseReason = 'cancel') => {
  // beforeClose 执行期间防重入：遮罩 / X / Esc 并发触发（或二次确认期间再次点击）时，
  // 只让一次请求进入拦截，避免异步 beforeClose（二次确认 / 远端校验）被重复拉起。
  // 拦截成功放行后可见性同步置 false，组件随即卸载/隐藏，不再有新的点击窗口。
  if (closePending || props.confirmLoading) return;
  if (props.beforeClose) {
    closePending = true;
    try {
      const ok = await props.beforeClose();
      if (ok === false) return; // 拦截：放弃本次关闭，closePending 由 finally 复位，允许下次重试
    } finally {
      closePending = false;
    }
  }
  emit('cancel', reason);
  visible.value = false;
};

/** 确认按钮：loading 中防重复，派发 confirm */
const handleConfirm = () => {
  if (props.confirmLoading) return; // 防止重复触发
  emit('confirm');
};

let mousedownTarget: EventTarget | null = null;
/** 记录按下位置：仅「按下与松开都在蒙层上」才视为点击蒙层 */
const handleMaskMousedown = (e: MouseEvent) => {
  mousedownTarget = e.target;
};
/** 蒙层点击关闭：校验按下/松开目标一致，避免从弹窗内拖拽出来误关 */
const handleMaskClick = (e: MouseEvent) => {
  if (props.closeOnMask && e.target === e.currentTarget && mousedownTarget === e.currentTarget) {
    close('mask');
  }
  mousedownTarget = null;
};
</script>
