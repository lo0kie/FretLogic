<template>
  <BaseFloatingBar bottom="1.8rem" #="{ divider }">
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

      <div ref="scrollContainerRef" class="clickable-indices-list no-scrollbar" @wheel.prevent="handleWheelScroll">
        <BaseBadge
          v-for="lineIdx in sortedIndices"
          :key="lineIdx"
          variant="primary"
          appearance="subtle"
          size="xs"
          interactive
          title="点击取消选择该行"
          class="index-badge-item"
          @click="emit('remove-index', lineIdx)"
        >
          <span>{{ lineIdx + 1 }}</span>
          <template #suffix>
            <X :size="10" class="index-clear-icon" aria-hidden="true" />
          </template>
        </BaseBadge>
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
          <Copy :size="14" stroke-width="2.5" />
        </template>
        导出
      </ActionButton>
    </div>
  </BaseFloatingBar>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseBadge from '@/components/BaseBadge.vue';
import BaseFloatingBar from '@/components/BaseFloatingBar.vue';
import { Copy, FileText, X } from '@lucide/vue';
import { useTemplateRef } from 'vue';

defineProps<{
  selectedCount: number;
  sortedIndices: number[];
  isAllSelected: boolean;
}>();

const emit = defineEmits<{
  (e: 'remove-index', lineIdx: number): void;
  (e: 'toggle-select-all'): void;
  (e: 'open-export'): void;
}>();

const scrollContainerRef = useTemplateRef<HTMLElement>('scrollContainerRef');
const includeMetaBar = defineModel<boolean>('includeMetaBar', { default: true });

const handleWheelScroll = (e: WheelEvent) => {
  if (!scrollContainerRef.value) return;
  const scrollDelta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
  scrollContainerRef.value.scrollBy({ left: scrollDelta, behavior: 'smooth' });
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.bar-info-zone {
  display: flex;
  align-items: center;
  gap: @space-sm;
  font-size: @fs-xs;
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
  gap: @space-xs;
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
  scrollbar-width: none;
  -ms-overflow-style: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

.index-badge-item {
  font-family: monospace;

  &:hover {
    background-color: var(--tint-danger-88) !important;
    color: var(--color-danger) !important;
    border-color: var(--tint-danger-75) !important;
  }
}

.index-clear-icon {
  margin-left: 0.15rem;
  opacity: 0.6;
  pointer-events: none;
}

.bar-actions-zone {
  display: flex;
  align-items: center;
  gap: @space-sm;
  flex-shrink: 0;
}
</style>
