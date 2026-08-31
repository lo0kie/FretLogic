<template>
  <BasePopover
    v-model="visible"
    :trigger
    :placement
    :disabled
    :hover-open-delay
    :hover-close-delay
    :show-arrow="true"
    :auto-focus="trigger === 'click' && !disabled"
    :offset-distance="10"
    :teleport-to
    :disabled-teleport
    :aria-label="title"
    :panel-class="'popconfirm-panel'"
    :panel-style="{ width: resolvedWidth }"
    @open="emit('open')"
    @close="emit('close')"
  >
    <template #trigger="slotProps">
      <slot name="trigger" v-bind="slotProps" />
    </template>

    <slot :close="closePopover" :confirm="handleConfirm">
      <div class="popconfirm-body flex items-start gap-sm px-md py-md box-border">
        <component
          :is="resolvedIcon"
          v-if="resolvedIcon"
          class="popconfirm-icon shrink-0 mt-2px"
          :size="15"
          :stroke-width="2"
        />

        <div class="popconfirm-text flex-1 min-w-0">
          <p class="popconfirm-title text-xs font-semibold text-text-title leading-relaxed m-0">{{ title }}</p>
          <p v-if="description" class="popconfirm-description text-2xs text-text-muted leading-relaxed mt-1 mb-0">
            {{ description }}
          </p>

          <div class="popconfirm-actions flex items-center justify-end gap-sm mt-sm" :class="{ 'mt-2': !description }">
            <slot name="actions" :confirm="handleConfirm" :close="closePopover">
              <ActionButton
                v-if="showCancel"
                variant="ghost"
                size="sm"
                :disabled="confirmLoading"
                @click="handleCancel"
              >
                {{ cancelText }}
              </ActionButton>
              <ActionButton
                variant="subtle"
                size="sm"
                :color="confirmColor"
                :loading="confirmLoading"
                :disabled="confirmDisabled || confirmLoading"
                @click="handleConfirm"
              >
                {{ confirmText }}
              </ActionButton>
            </slot>
          </div>
        </div>
      </div>
    </slot>
  </BasePopover>
</template>

<script setup lang="ts">
import ActionButton from '@/components/base/ActionButton.vue';
import BasePopover from '@/components/base/BasePopover.vue';
import type { Placement } from '@floating-ui/vue';
import { AlertTriangle, Info } from '@lucide/vue';
import { computed, type Component } from 'vue';

/**
 * BasePopconfirm 气泡提示/确认卡：
 * hover 或 click 触发，在触发元素上方（默认）弹出「提示文字 + 操作按钮」的轻量确认层。
 * 基于 BasePopover 封装，自动继承其全部边界处理（箭头定位翻转、点击外部/ESC 关闭、
 * hover 移入面板不关闭、z-index 单例分配、滚动层级约束等）。
 *
 * 确认关闭语义：
 * - 同步确认（默认）：点击确认后立即关闭面板；
 * - 异步确认：传 closeOnConfirm=false（面板保持打开），配合 v-model:visible 与 confirmLoading
 *   外部全程控制——onConfirm 中置 confirmLoading=true 进入 loading（按钮禁用防重复），
 *   任务完成后置回 false 并将 visible 置 false 关闭面板。
 */
const {
  title,
  description = '',
  trigger = 'hover',
  placement = 'top',
  tone = 'default',
  showIcon = true,
  icon = null,
  confirmText = '确认',
  cancelText = '取消',
  showCancel = true,
  confirmDisabled = false,
  confirmLoading = false,
  closeOnConfirm = true,
  width = 240,
  disabled = false,
  hoverOpenDelay = 150,
  hoverCloseDelay = 120,
  teleportTo = 'body',
  disabledTeleport = false,
} = defineProps<{
  /** 提示文字（必填），同时作为面板的 aria-label */
  title: string;
  /** 次要说明文字（可选） */
  description?: string;
  /** 触发方式：hover 悬停提示（默认）| click 点击确认 */
  trigger?: 'hover' | 'click';
  /** 弹出方位，默认在触发元素上方 */
  placement?: Placement;
  /** 语义色调：决定图标与确认按钮配色 */
  tone?: 'default' | 'info' | 'warning' | 'danger';
  /** 是否显示语义图标（default 色调无图标） */
  showIcon?: boolean;
  /** 自定义图标组件（覆盖 tone 默认图标） */
  icon?: Component | null;
  confirmText?: string;
  cancelText?: string;
  /** 是否显示取消按钮（纯提示卡可关掉，仅留确认/知道了） */
  showCancel?: boolean;
  /** 确认按钮禁用态 */
  confirmDisabled?: boolean;
  /** 确认按钮 loading：loading 中保持面板打开，结束后自动关闭（见 closeOnConfirm） */
  confirmLoading?: boolean;
  /** 点击确认后是否关闭面板（confirmLoading 期间强制保持打开） */
  closeOnConfirm?: boolean;
  /** 面板宽度（number 视为 px） */
  width?: number | string;
  /** 禁用整个气泡（触发与弹出均失效） */
  disabled?: boolean;
  /** hover 模式打开延迟（ms） */
  hoverOpenDelay?: number;
  /** hover 模式关闭延迟（ms）：留出移入面板的间隙 */
  hoverCloseDelay?: number;
  teleportTo?: string | HTMLElement;
  disabledTeleport?: boolean;
}>();

const emit = defineEmits<{
  /** 点击确认；面板是否关闭由 closeOnConfirm / confirmLoading 决定 */
  (e: 'confirm'): void;
  (e: 'cancel'): void;
  (e: 'open'): void;
  (e: 'close'): void;
}>();

const visible = defineModel<boolean>('visible', { default: false });

/** tone → 图标映射（GlobalToast 同套图标语言） */
const TONE_ICONS: Record<string, Component | null> = {
  default: null,
  info: Info,
  warning: AlertTriangle,
  danger: AlertTriangle,
};

const resolvedIcon = computed(() => (showIcon ? (icon ?? TONE_ICONS[tone] ?? null) : null));

const confirmColor = computed(() => (tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'primary'));

const resolvedWidth = computed(() => (typeof width === 'number' ? `${width}px` : width));

const closePopover = () => {
  visible.value = false;
};

const handleConfirm = () => {
  if (confirmDisabled) return;
  emit('confirm');
  if (closeOnConfirm) closePopover();
};

const handleCancel = () => {
  emit('cancel');
  closePopover();
};

defineExpose({
  open: () => {
    visible.value = true;
  },
  close: closePopover,
});
</script>
