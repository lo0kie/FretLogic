<template>
  <BaseFloatingBar :visible="visible" bottom="1.8rem" #="{ divider }">
    <div class="bar-info-zone">
      <BaseBadge
        :variant="selectedCount > 0 ? 'primary' : 'neutral'"
        :appearance="selectedCount > 0 ? 'filled' : 'subtle'"
        size="xs"
        width="1.5rem"
      >
        {{ selectedCount }}
      </BaseBadge>

      <span class="selected-text-tip">{{ selectedCount > 0 ? '已选择歌词' : '请选择歌词' }}</span>

      <div v-wheel-scroll.smooth class="clickable-indices-list no-scrollbar">
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

    <div class="bar-actions-zone">
      <ActionButton
        v-tooltip="'选中所有歌词'"
        size="sm"
        :variant="isAllSelected ? 'subtle' : 'ghost'"
        :primary="isAllSelected"
        @click="emit('toggle-select-all')"
      >
        全选
      </ActionButton>

      <ActionButton
        v-tooltip="includeMetaBar ? '导出图片将包含歌名/调/Capo 信息' : '导出图片不包含歌曲信息'"
        icon-only
        size="sm"
        :variant="includeMetaBar ? 'subtle' : 'ghost'"
        :primary="includeMetaBar"
        :aria-label="includeMetaBar ? '关闭歌曲信息栏' : '开启歌曲信息栏'"
        @click="includeMetaBar = !includeMetaBar"
      >
        <FileText :size="14" stroke-width="2.5" />
      </ActionButton>

      <ActionButton size="sm" variant="subtle" :disabled="selectedCount === 0" @click="emit('open-export')">
        <template #prefix>
          <Copy :size="14" stroke-width="2.5" aria-hidden="true" />
        </template>
        导出图片
      </ActionButton>
    </div>
  </BaseFloatingBar>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseBadge from '@/components/BaseBadge.vue';
import BaseFloatingBar from '@/components/BaseFloatingBar.vue';
import { FileText } from '@lucide/vue';
withDefaults(
  defineProps<{
    visible?: boolean;
    selectedCount: number;
    sortedIndices: number[];
    isAllSelected: boolean;
  }>(),
  {
    visible: true,
  }
);

const emit = defineEmits<{
  (e: 'remove-index', lineIdx: number): void;
  (e: 'toggle-select-all'): void;
  (e: 'open-export'): void;
}>();

const includeMetaBar = defineModel<boolean>('includeMetaBar', { default: true });
</script>

<style scoped lang="scss">
.bar-info-zone {
  display: flex;
  align-items: center;
  gap: $space-sm;
  font-size: $fs-xs;
  font-weight: 600;
  color: var(--text-title);
  min-width: 0;
}

.selected-text-tip {
  color: var(--text-title);
  white-space: nowrap;
  flex-shrink: 0;
}

.clickable-indices-list {
  display: flex;
  align-items: center;
  gap: $space-xs;
  width: 7.5rem;
  min-width: 7.5rem;
  max-width: 7.5rem;
  min-height: 1.75rem;
  box-sizing: border-box;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  flex-shrink: 0;
  padding: 4px 6px;
}

.bar-actions-zone {
  display: flex;
  align-items: center;
  gap: $space-sm;
  flex-shrink: 0;
}
</style>
