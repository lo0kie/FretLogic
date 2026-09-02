<template>
  <BaseFloatingBar :visible bottom="1.8rem">
    <div class="bar-actions-zone gap-sm flex shrink-0 items-center">
      <BaseCheckbox
        v-tooltip="'选中所有歌词'"
        :indeterminate="isIndeterminate"
        :model-value="isAllSelected"
        @update:model-value="emit('toggle-select-all')"
        label="全选"
        size="sm"
      />

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
import BaseCheckbox from '@/components/ui/BaseCheckbox.vue';
import BaseFloatingBar from '@/components/ui/BaseFloatingBar.vue';
import BaseIcon from '@/components/ui/BaseIcon.vue';

const {
  visible = true,
  selectedCount,
  isAllSelected,
  isIndeterminate = false,
} = defineProps<{
  visible?: boolean;
  selectedCount: number;
  isAllSelected: boolean;
  isIndeterminate?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-select-all'): void;
  (e: 'open-export'): void;
}>();

const includeMetaBar = defineModel<boolean>('includeMetaBar', { default: true });
/** 图片是否包含歌名/调/Capo 信息的提示 */
const includeMetaTooltip = computed(() =>
  includeMetaBar.value ? '导出图片将包含歌名/调/Capo 信息' : '导出图片不包含歌曲信息'
);
</script>
