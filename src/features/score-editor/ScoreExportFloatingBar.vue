<template>
  <BaseFloatingBar :visible #="{ divider }" bottom="1.8rem">
    <div class="bar-info-zone gap-sm text-text-title flex min-w-0 items-center text-xs font-semibold">
      <BaseBadge
        :appearance="selectedCount > 0 ? 'filled' : 'subtle'"
        :variant="selectedCount > 0 ? 'primary' : 'neutral'"
        size="xs"
        width="1.5rem"
      >
        {{ selectedCount }}
      </BaseBadge>

      <span class="selected-text-tip text-text-title shrink-0 whitespace-nowrap">
        {{ selectedCount > 0 ? '已选择歌词' : '请选择歌词' }}
      </span>

      <div
        v-wheel-scroll.smooth
        class="clickable-indices-list no-scrollbar gap-xs box-border flex min-h-[1.75rem] w-[7.5rem] max-w-[7.5rem] min-w-[7.5rem] shrink-0 items-center overflow-x-auto overflow-y-hidden px-1.5 py-1 whitespace-nowrap"
      >
        <BaseBadge
          v-for="lineIdx in sortedIndices"
          :content="lineIdx + 1"
          :key="lineIdx"
          @click="emit('remove-index', lineIdx)"
          appearance="subtle"
          hover-close
          size="xs"
          title="点击取消选择该行"
          variant="primary"
          width="1.5rem"
        />
      </div>
    </div>

    <component :is="divider" />

    <div class="bar-actions-zone gap-sm flex shrink-0 items-center">
      <ActionButton
        v-tooltip="'选中所有歌词'"
        :color="isAllSelected ? 'primary' : 'default'"
        :variant="isAllSelected ? 'subtle' : 'ghost'"
        @click="emit('toggle-select-all')"
        size="sm"
      >
        全选
      </ActionButton>

      <ActionButton
        v-tooltip="includeMetaTooltip"
        :aria-label="includeMetaBar ? '关闭歌曲信息栏' : '开启歌曲信息栏'"
        :color="includeMetaBar ? 'primary' : 'default'"
        :variant="includeMetaBar ? 'subtle' : 'ghost'"
        @click="includeMetaBar = !includeMetaBar"
        icon-only
        size="sm"
      >
        <BaseIcon :size="14" :stroke-width="2.5" name="file-text" />
      </ActionButton>

      <ActionButton :disabled="selectedCount === 0" @click="emit('open-export')" size="sm" variant="subtle">
        <template #prefix>
          <BaseIcon :size="14" :stroke-width="2.5" aria-hidden="true" name="copy" />
        </template>
        导出图片
      </ActionButton>
    </div>
  </BaseFloatingBar>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

import ActionButton from '@/components/ui/ActionButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseFloatingBar from '@/components/ui/BaseFloatingBar.vue';
import BaseIcon from '@/components/ui/BaseIcon.vue';

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
