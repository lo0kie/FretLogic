<template>
  <div class="score-floating-bar">
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
          {{ lineIdx + 1 }}
          <template #suffix>
            <X :size="10" class="index-clear-icon" aria-hidden="true" />
          </template>
        </BaseBadge>
      </div>
    </div>

    <div class="bar-divider" />

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
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/ui/components/ActionButton.vue';
import BaseBadge from '@/ui/components/BaseBadge.vue';
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
const includeMetaBar = defineModel<boolean>('includeMetaBar', {
  default: true,
});

const handleWheelScroll = (e: WheelEvent) => {
  if (!scrollContainerRef.value) return;
  const scrollDelta = e.deltaY !== 0 ? e.deltaY : e.deltaX;

  scrollContainerRef.value.scrollBy({ left: scrollDelta, behavior: 'smooth' });
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.score-floating-bar {
  display: flex;
  position: fixed;
  left: 50%;
  bottom: 1.8rem;
  transform: translateX(-50%);
  z-index: var(--z-fab);
  pointer-events: auto;
  gap: @space-md;
  padding: @space-sm @space-md;
  background-color: var(--bg-panel);
  backdrop-filter: var(--blur-lg);
  -webkit-backdrop-filter: var(--blur-lg);
  border: 1px solid var(--glass-border);
  border-radius: @radius-pill;
  box-shadow: @shadow-floating;
  box-sizing: border-box;
}

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
  /* 固定槽位：有没有索引都一样宽 */
  width: 7.5rem;
  min-width: 7.5rem;
  max-width: 7.5rem;
  /* 固定高度槽位：空列表与有索引时高度一致，避免选中索引导致浮条整体跳动 */
  min-height: 1.75rem;
  box-sizing: border-box;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  flex-shrink: 0; /* 不要被挤扁 */
  /* 竖向留 4px = 聚焦环外扩宽，刚好不裁切；空/有索引都占同一高度 */
  padding: 4px 6px;
  /* 可选：空列表时也能看清是一块区域 */
  /* min-height: 1.25rem; */
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

/* 索引上的 X 仅作视觉提示，点击交给整个 Badge 自身 */
.index-clear-icon {
  margin-left: 0.15rem;
  opacity: 0.6;
  pointer-events: none;
}

.bar-divider {
  width: 1px;
  height: 1rem;
  background-color: var(--border-base);
  opacity: 0.6;
  flex-shrink: 0;
}

.bar-actions-zone {
  display: flex;
  align-items: center;
  gap: @space-sm;
  flex-shrink: 0;
}
</style>
