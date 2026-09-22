<template>
  <Teleport :disabled="disabledTeleport" :to="teleportTo">
    <Transition
      @after-enter="emit('opened')"
      @after-leave="handleAfterLeave()"
      @before-enter="emit('open')"
      @before-leave="emit('close')"
      name="v-transition-modal"
    >
      <div
        v-bind="$attrs"
        v-if="destroyOnClose ? visible : true"
        v-show="visible"
        :class="overlayAlignClass"
        :style="{ zIndex: overlayZ > 0 ? overlayZ : undefined }"
        @click.self="handleMaskClick($event)"
        @mousedown="handleMaskMousedown($event)"
        class="modal-overlay-container fixed inset-0 z-overlay flex overflow-y-auto bg-overlay p-md"
        ref="overlayRef"
      >
        <!-- 关闭（leave）期间禁用高度接管：expanded 联动 visible，避免退场动画进行中卡片被高度压 0 裁没 -->
        <div
          v-auto-height="{ expanded: visible, disabled: !isAutoHeight || !visible, transition: false }"
          :aria-label="title || $slots['title'] ? undefined : '对话框'"
          :aria-labelledby="title || $slots['title'] ? titleId : undefined"
          :style="[sizeStyle, topStyle]"
          @click.stop
          @keydown="handleKeydownTrap($event)"
          aria-modal="true"
          class="modal-card relative z-panel flex flex-col overflow-hidden rounded-lg border border-glass-border bg-surface-panel shadow-floating outline-none"
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
                    :disabled="closeButtonDisabled || closeLocked"
                    @click="close('close')"
                    icon-only
                    aria-label="关闭"
                    icon="x"
                    icon-inset="sm"
                    icon-size="xl"
                    icon-stroke="bold"
                    size="sm"
                    title="关闭"
                    variant="ghost"
                  />
                </div>
              </slot>
            </div>

            <BaseScrollArea
              :class="[
                {
                  // body 四向 padding 独立推导：贴卡片边缘恒为 xl，与相邻区块之间有内容时 lg、
                  // 空内容垫片时 sm；缺 header/footer 的方向升级为贴边 xl，避免间距塌陷
                  'pt-lg': hasHeader && !!$slots['default'],
                  'pt-sm': hasHeader && !$slots['default'],
                  'pt-xl': !hasHeader,
                  'pb-lg': showFooter && !!$slots['default'],
                  'pb-sm': showFooter && !$slots['default'],
                  'pb-xl': !showFooter,
                },
                isAutoHeight ? 'h-auto max-h-[calc(800px-8rem)]' : 'min-h-0 flex-1',
              ]"
              :fade="false"
              :scrollbar="false"
              axis="y"
              class="modal-body-scrollable flex flex-col px-xl"
            >
              <slot />
            </BaseScrollArea>

            <div
              v-if="showFooter"
              class="modal-footer-zone flex w-full shrink-0 items-center justify-end gap-sm px-xl pt-0 pb-xl"
            >
              <slot name="footer">
                <slot name="cancel-btn">
                  <ActionButton
                    :disabled="cancelButtonDisabled || closeLocked"
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
import { computed, useId, useSlots, useTemplateRef } from 'vue';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import {
  useOverlayCloseGuard,
  useOverlayEscape,
  useOverlayFocusTrap,
  useOverlayMaskClose,
} from '@/platform/ui/overlay/overlayGuards';
import { useOverlayLifecycle } from '@/platform/ui/overlay/overlayLifecycle';
import { isTopOverlay } from '@/platform/ui/overlay/overlayStack';

import type { ModalCloseReason } from './modalCloseReason';
import type { ThemeColor } from '@/platform/types';

// （ModalCloseReason 类型在 ./modalCloseReason.ts，<script setup> 内不允许 export）
</script>

<script setup lang="ts">
defineOptions({ inheritAttrs: false });
const visible = defineModel<boolean>('visible', { required: true });
const props = withDefaults(
  defineProps<{
    /** 弹窗标题（配合默认 footer 或独立使用） */
    title?: string;
    /** 宽度预设档位（sm 380 / md 480 / lg 640 / xl 840 / 2xl 1080 / full 1320 px），
     *  也支持自定义：number 视为 px，字符串如 "520px" 直接生效 */
    width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | (string & {}) | number;
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
    /** 禁用右上角关闭（X）按钮（仅影响 X，不阻塞遮罩/ESC/取消关闭） */
    closeButtonDisabled?: boolean;
    /** 锁定关闭：禁用所有用户关闭路径（X / 取消 / 遮罩 / ESC），仅允许父级程序化置 v-model 关闭 */
    closeLocked?: boolean;
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
    width: 'md',
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
    closeButtonDisabled: false,
    closeLocked: false,
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

const isCentered = computed(() => props.centered && props.top === undefined);

const overlayAlignClass = computed(() => {
  if (isCentered.value) return 'items-center justify-center';

  return 'items-start justify-center';
});

const topStyle = computed(() => {
  if (props.top !== undefined) {
    const t = typeof props.top === 'number' ? `${props.top}px` : props.top;
    return { marginTop: t };
  }
  if (!props.centered) return { marginTop: '96px' };

  return {};
});

// 预设尺寸映射（语义档位，全固定像素，不随视口变化）
const WIDTH_MAP: Record<string, string> = {
  'sm': '380px',
  'md': '480px',
  'lg': '640px',
  'xl': '840px',
  '2xl': '1080px',
  'full': '1320px',
};
const HEIGHT_MAP: Record<string, string> = {
  'h-auto': 'auto',
  'h-sm': '320px',
  'h-md': '480px',
  'h-lg': '640px',
  'h-xl': '800px',
  'h-full': '800px',
};

const sizeStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {};
  const w = props.width;
  if (typeof w === 'number') style['width'] = `${w}px`;
  else if (w) style['width'] = WIDTH_MAP[w] ?? w;

  const h = props.height;
  if (typeof h === 'number') style['height'] = `${h}px`;
  else if (h && HEIGHT_MAP[h]) {
    // 'auto' 不写死高度：交由 v-auto-height 测量内容并过渡
    if (HEIGHT_MAP[h] !== 'auto') style['height'] = HEIGHT_MAP[h];
  } else if (typeof h === 'string' && h) style['height'] = h;
  return style;
});

const hasHeader = computed(() =>
  Boolean(slots['header'] || slots['header-extra'] || slots['title'] || props.title || props.showClose)
);

// ---------- 共享浮层生命周期与交互守卫（唯一来源：platform/ui/overlay/*） ----------
const close = useOverlayCloseGuard({
  visible,
  isLocked: () => props.closeLocked,
  getBeforeClose: () => props.beforeClose,
  onCancel: reason => emit('cancel', reason),
});

const handleEscape = useOverlayEscape({
  enabled: () => props.keyboard && !props.closeLocked,
  isTop: () => isTopOverlay(overlayRef.value),
  close,
});

const { overlayZ, handleAfterLeave } = useOverlayLifecycle({
  visible,
  overlayRef,
  // 初始焦点落在对话框卡片（带 tabindex="-1"）而非外层遮罩容器：后者不可聚焦，focus() 无效
  panelRef: modalCardRef,
  onEscape: handleEscape,
  locksBody: () => true,
  onAfterLeave: () => emit('closed'),
});

const handleKeydownTrap = useOverlayFocusTrap(modalCardRef);

const { handleMaskMousedown, handleMaskClick } = useOverlayMaskClose({
  canClose: () => props.closeOnMask && !props.closeLocked,
  close,
});

/** 确认按钮：loading 中防重复，派发 confirm */
const handleConfirm = () => {
  if (props.confirmLoading) return; // 防止重复触发
  emit('confirm');
};
</script>
