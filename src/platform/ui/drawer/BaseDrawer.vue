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
        v-if="preserveOnClose || visible"
        v-show="visible"
        :class="[overlayAlignClass, noMask ? 'pointer-events-none bg-transparent' : 'bg-overlay']"
        :style="{ zIndex: overlayZ > 0 ? overlayZ : undefined }"
        @click.self="handleMaskClick($event)"
        @mousedown="handleMaskMousedown($event)"
        @mouseup="handleMaskMouseup($event)"
        class="drawer-overlay-container fixed inset-0 flex overflow-clip"
        ref="overlayRef"
      >
        <div
          :aria-label="title || $slots['title'] ? undefined : '抽屉'"
          :aria-labelledby="title || $slots['title'] ? titleId : undefined"
          :class="[panelBorderClass, noMask ? 'pointer-events-auto' : '']"
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
                v-if="!hideClose"
                :disabled="closeButtonDisabled || closeLocked"
                @click="close('close')"
                icon-only
                aria-label="关闭"
                icon="x"
                icon-inset="sm"
                icon-size="xl"
                icon-stroke="bold"
                size="sm"
                variant="ghost"
              />
            </div>
          </div>

          <BaseScrollArea
            :class="[
              {
                // body 四向 padding 独立推导（与 BaseModal 同模型）：贴卡片边缘恒为 xl，
                // 顶部有 header 时 header 自带 pb-md、body 只补 pt-sm，叠加后间距适中；缺 header 侧贴边 xl
                'pt-sm': hasHeader,
                'pt-xl': !hasHeader,
                'pb-lg': !!$slots['footer'] && !!$slots['default'],
                'pb-sm': !!$slots['footer'] && !$slots['default'],
                'pb-xl': !$slots['footer'],
              },
            ]"
            axis="both"
            class="drawer-body-scrollable min-h-0 flex-1 px-xl"
          >
            <slot />
          </BaseScrollArea>

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
import { closeAllPopovers } from '@/platform/ui/popover/popoverRegistry';

import type { ModalCloseReason } from '@/platform/ui/modal/modalCloseReason';

/** left/right 抽屉主尺寸为宽度，top/bottom 为主轴高度 */
const MD_DRAWER_SIZE = { main: '480px', max: '90%' };
const DRAWER_SIZE_MAP: Record<string, { main: string; max: string } | undefined> = {
  sm: { main: '380px', max: '85%' },
  md: MD_DRAWER_SIZE,
  lg: { main: '640px', max: '92%' },
  full: { main: '100%', max: '100%' },
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
    /** 隐藏遮罩（非阻断模式：背景可交互，遮罩点击关闭随之失效） */
    noMask?: boolean;
    /** 点击遮罩时保持打开（仅遮罩开启时生效） */
    keepOnMask?: boolean;
    /** 禁用 Esc 键关闭（仅栈顶抽屉响应） */
    noKeyboard?: boolean;
    /** 隐藏右上角关闭（X）按钮 */
    hideClose?: boolean;
    /** 关闭前拦截：返回 false 或 Promise<false> 可阻止关闭（X / 遮罩 / ESC 均生效） */
    beforeClose?: () => boolean | Promise<boolean>;
    /** 仅禁用右上角关闭（X）按钮：视觉置灰且点击无效，不影响遮罩 / ESC */
    closeButtonDisabled?: boolean;
    /** 锁死全部用户关闭路径（X / 遮罩 / ESC）：仅允许父级程序化 visible=false 关闭；
     *  优先级高于 beforeClose，锁定时连 beforeClose 都不进 */
    closeLocked?: boolean;
    /** 关闭时保留内部 DOM（默认关闭即销毁） */
    preserveOnClose?: boolean;
    /** Teleport 挂载目标，默认 'body' */
    teleportTo?: string | HTMLElement;
    /** 禁用 Teleport，在当前父节点就地渲染 */
    disabledTeleport?: boolean;
  }>(),
  {
    title: '',
    placement: 'right',
    size: 'md',
    noMask: false,
    keepOnMask: false,
    noKeyboard: false,
    hideClose: false,
    beforeClose: undefined,
    closeButtonDisabled: false,
    closeLocked: false,
    preserveOnClose: false,
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

const hasHeader = computed(() => Boolean(slots['header-extra'] || slots['title'] || props.title || !props.hideClose));

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
  const preset = typeof raw === 'string' ? DRAWER_SIZE_MAP[raw] : undefined;
  // 未命中预设档位：数字按 px 作主尺寸、字符串按 CSS 值作主尺寸，最大边长统一 90%
  const customMain = typeof raw === 'number' ? `${raw}px` : raw;
  const { main, max } = preset ?? (customMain ? { main: customMain, max: '90%' } : MD_DRAWER_SIZE);
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

// ---------- 共享浮层生命周期与交互守卫（唯一来源：platform/ui/overlay/*） ----------
const close = useOverlayCloseGuard({
  visible,
  isLocked: () => props.closeLocked,
  getBeforeClose: () => props.beforeClose,
  onCancel: reason => emit('cancel', reason),
});

const handleEscape = useOverlayEscape({
  enabled: () => !props.noKeyboard && !props.closeLocked,
  isTop: () => isTopOverlay(overlayRef.value),
  close,
});

const { overlayZ, handleAfterLeave } = useOverlayLifecycle({
  visible,
  overlayRef,
  // 初始焦点落在抽屉面板（带 tabindex="-1"）而非外层遮罩容器：后者不可聚焦，focus() 无效
  panelRef: drawerPanelRef,
  onEscape: handleEscape,
  // 仅遮罩模式参与 body 滚动锁，非遮罩（调色盘）抽屉不锁背景
  locksBody: () => !props.noMask,
  // 打开瞬间收拢全局存量 Popover：抽屉为模态阻断层，不允许被先前浮层压在头上
  onOpen: () => closeAllPopovers(),
  onAfterLeave: () => emit('closed'),
});

const handleKeydownTrap = useOverlayFocusTrap(drawerPanelRef);

const { handleMaskMousedown, handleMaskMouseup, handleMaskClick } = useOverlayMaskClose({
  canClose: () => !props.noMask && !props.keepOnMask && !props.closeLocked,
  close,
});
</script>
