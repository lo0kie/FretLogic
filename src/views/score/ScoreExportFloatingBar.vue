<template>
  <BaseFloatingBar :visible bottom="1.8rem" #="{ divider }">
    <div class="bar-info-zone flex items-center gap-sm text-xs font-semibold text-text-title min-w-0">
      <BaseBadge
        :variant="selectedCount > 0 ? 'primary' : 'neutral'"
        :appearance="selectedCount > 0 ? 'filled' : 'subtle'"
        size="xs"
        width="1.5rem"
      >
        {{ selectedCount }}
      </BaseBadge>

      <span class="selected-text-tip text-text-title whitespace-nowrap shrink-0">
        {{ selectedCount > 0 ? '已选择歌词' : '请选择歌词' }}
      </span>

      <div
        v-wheel-scroll.smooth
        class="clickable-indices-list no-scrollbar flex items-center gap-xs w-[7.5rem] min-w-[7.5rem] max-w-[7.5rem] min-h-[1.75rem] box-border overflow-x-auto overflow-y-hidden whitespace-nowrap shrink-0 py-1 px-1.5"
      >
        <BaseBadge
          v-for="lineIdx in sortedIndices"
          :key="lineIdx"
          :content="lineIdx + 1"
          variant="primary"
          appearance="subtle"
          size="xs"
          width="1.5rem"
          hover-close
          title="点击取消选择该行"
          @click="emit('remove-index', lineIdx)"
        />
      </div>
    </div>

    <component :is="divider" />

    <div class="bar-actions-zone flex items-center gap-sm shrink-0">
      <ActionButton
        v-tooltip="'选中所有歌词'"
        size="sm"
        :variant="isAllSelected ? 'subtle' : 'ghost'"
        :color="isAllSelected ? 'primary' : 'default'"
        @click="emit('toggle-select-all')"
      >
        全选
      </ActionButton>

      <ActionButton
        v-tooltip="includeMetaTooltip"
        icon-only
        size="sm"
        :variant="includeMetaBar ? 'subtle' : 'ghost'"
        :color="includeMetaBar ? 'primary' : 'default'"
        :aria-label="includeMetaBar ? '关闭歌曲信息栏' : '开启歌曲信息栏'"
        @click="includeMetaBar = !includeMetaBar"
      >
        <FileText :size="14" :stroke-width="2.5" />
      </ActionButton>

      <ActionButton size="sm" variant="subtle" :disabled="selectedCount === 0" @click="emit('open-export')">
        <template #prefix>
          <Copy :size="14" :stroke-width="2.5" aria-hidden="true" />
        </template>
        导出图片
      </ActionButton>
    </div>
  </BaseFloatingBar>
</template>

<script setup lang="ts">
import ActionButton from '@/components/base/ActionButton.vue';
import BaseBadge from '@/components/base/BaseBadge.vue';
import BaseFloatingBar from '@/components/base/BaseFloatingBar.vue';
import { Copy, FileText } from '@lucide/vue';
import { computed } from 'vue';

const {
  visible = true,
  selectedCount,
  sortedIndices,
  isAllSelected,
} = defineProps<{
  visible?: boolean;
  selectedCount: number;
  sortedIndices: number[];
  isAllSelected: boolean;
}>();

const emit = defineEmits<{
  (e: 'remove-index', lineIdx: number): void;
  (e: 'toggle-select-all'): void;
  (e: 'open-export'): void;
}>();

const includeMetaBar = defineModel<boolean>('includeMetaBar', { default: true });
/** 图片是否包含歌名/调/Capo 信息的提示 */
const includeMetaTooltip = computed(() =>
  includeMetaBar.value ? '导出图片将包含歌名/调/Capo 信息' : '导出图片不包含歌曲信息'
);
</script>
