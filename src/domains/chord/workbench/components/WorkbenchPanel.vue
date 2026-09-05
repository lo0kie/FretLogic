<template>
  <div
    :class="
      effectiveExpanded
        ? 'w-[19rem] min-w-[19rem]'
        : isCompact
          ? 'w-[calc(2.85rem_+_2px)] min-w-[calc(2.85rem_+_2px)]'
          : 'w-[14rem] min-w-[14rem]'
    "
    @focusin="isFocusWithin = true"
    @focusout="isFocusWithin = false"
    @mouseenter="isPointerOver = true"
    @mouseleave="isPointerOver = false"
    class="duration-slow ease-sidebar transition-[width,min-width]"
  >
    <!-- 收起系（圆球 + hover 摊开卡）两态同高：标题栏 min-h 1.6rem + 内边距 1.25rem + 边框 2px
         = 2.85rem + 2px ≈ 65.4px（根字号 22.25px）。圆球宽高即此值 → 正圆；hover 高度与之相等，
         鼠标移入移出只变宽度、高度恒定 → 无高度跳变、也不需要高度过渡。圆角取直径一半；
         不用 rounded-full（9999px 与 rounded-lg 插值时生硬）。 -->
    <div
      :class="
        effectiveExpanded
          ? 'rounded-lg p-3'
          : isCompact
            ? 'justify-center rounded-[calc(1.425rem_+_1px)] p-2.5'
            : 'rounded-lg p-2.5'
      "
      class="bg-bg-panel border-glass-border z-panel duration-slow ease-sidebar @container pointer-events-auto relative box-border flex w-full flex-col overflow-hidden border transition-[border-radius,padding]"
    >
      <!-- 收起态标题栏锁最小高 1.6rem（= 分段控件高度 COMPACTED_SIZE_MAP.sm.wrapper 与圆球高度公式的
           1.6rem 项一致）：分段控件/标题文字用 v-show 显隐（display 不可过渡），锁高后其显隐不再影响高度，
           圆球与 hover 两态标题栏恒同高。收起时无底边框（border-b-0），与展开态的 1px 底边区分 -->
      <div
        :class="[
          effectiveExpanded ? 'border-border-light pb-1.5' : 'border-b-0 pb-0',
          isCompact ? 'justify-center' : 'justify-between',
          'workbench-panel-header duration-slow ease-sidebar flex shrink-0 items-center gap-2 border-b transition-[border-color,padding-bottom]',
          CONTROL_MIN_HEIGHT_CLASSES.sm,
        ]"
      >
        <div
          :class="isCompact ? '' : '-ml-1 gap-1.5 py-0.5 pr-1.5 pl-1'"
          class="duration-slow ease-sidebar flex items-center transition-[padding,margin]"
        >
          <div class="bg-tint-primary-88 text-primary flex h-5 w-5 shrink-0 items-center justify-center rounded-md">
            <BaseIcon :name="icon" icon-size="sm" icon-stroke="regular" />
          </div>
          <span v-show="!isCompact" class="text-text-title text-xs font-extrabold tracking-tight break-keep">
            {{ title }}
          </span>
        </div>

        <!-- 面板行为三态：自动（有内容才展开）/ 始终展开 / 始终收起 -->
        <BaseSegmentedControl
          v-model="mode"
          v-show="!isCompact"
          :aria-label="resolvedModeAriaLabel"
          :options="PANEL_MODE_LABEL"
          compacted
          size="sm"
        />
      </div>

      <!-- 内容区高度动画：测量内容真实高度写入 height 并过渡，覆盖展开/收起与内容自身尺寸变化。
           内层宽度锁定为展开态内容宽度（19rem - 卡片左右内边距共 1.5rem），
           宽度动画期间内容不随面板伸缩重排/压窄 → 高度稳定不抖动 -->
      <div v-auto-height="effectiveExpanded" class="duration-base ease-sidebar overflow-hidden transition-[height]">
        <div class="w-[calc(19rem-1.5rem)]">
          <slot :effective-expanded />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import { CONTROL_MIN_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';

import { PANEL_MODE_LABEL, usePanelMode } from '../composables/usePanelMode.ts';

defineOptions({ name: 'WorkbenchPanel' });

/**
 * 工作台侧栏面板外壳：统一宽度/高度展开收起动画 + 标题栏 + 三态行为切换。
 * 三态（自动 / 展开 / 收起）由 usePanelMode 驱动并持久化；各面板只需提供图标、标题、
 * 持久化键与 auto 模式的展开依据，具体内容通过默认插槽传入。
 *
 * 收起态有两层形态：默认收成仅含图标的圆形按钮（省空间），hover / 键盘聚焦时摊开为小卡片
 * （14rem，含标题与三态切换），不丢操作入口。
 */
const { icon, title, storageKey, hasContent, modeAriaLabel } = defineProps<{
  /** 标题栏前置图标（收起为圆形时即整个按钮的内容） */
  icon: IconName;
  /** 面板标题 */
  title: string;
  /** 展开状态持久化键（沿用各面板历史 *_COLLAPSED 键位） */
  storageKey: string;
  /** auto 模式的展开依据（惰性求值，仅 auto 模式下参与判定） */
  hasContent: () => boolean;
  /** 三态切换的无障碍标签；省略时默认取「{title}面板行为」 */
  modeAriaLabel?: string;
}>();

/** 三态行为状态机：auto 跟随 hasContent，expanded / collapsed 为常开 / 常闭 */
const { mode, effectiveExpanded } = usePanelMode(storageKey, () => hasContent());

const isPointerOver = ref(false);
const isFocusWithin = ref(false);

/** 收起态的紧凑圆形形态：仅保留图标；hover 或键盘聚焦时摊开为小卡片 */
const isCompact = computed(() => !effectiveExpanded.value && !isPointerOver.value && !isFocusWithin.value);

const resolvedModeAriaLabel = computed(() => modeAriaLabel ?? `${title}面板行为`);
</script>
