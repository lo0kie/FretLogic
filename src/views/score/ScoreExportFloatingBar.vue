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
          closable
          title="点击取消选择该行"
          @click="emit('remove-index', lineIdx)"
          @close="emit('remove-index', lineIdx)"
          class="index-badge-item"
        >
          {{ lineIdx + 1 }}
        </BaseBadge>
      </div>
    </div>

    <div class="bar-divider"></div>

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
        icon-only
        v-tooltip="includeMetaBar ? '导出图片将包含歌名/调/Capo 信息' : '导出图片不包含歌曲信息'"
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
import ActionButton from '@/components/ActionButton.vue';
import BaseBadge from '@/components/BaseBadge.vue';
import { Copy, FileText } from '@lucide/vue';
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

.score-floating-bar {
  display: flex;
  position: fixed;
  left: 50%;
  bottom: 1.8rem;
  transform: translateX(-50%);
  z-index: 90;
  pointer-events: auto;
  gap: 0.6rem;
  padding: 0.4rem 0.8rem;
  background-color: var(--bg-panel);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid var(--glass-border);
  border-radius: 9999px;
  box-shadow: @shadow-floating;
  box-sizing: border-box;
}

.bar-info-zone {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
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
  gap: 0.25rem;
  /* 固定槽位：有没有索引都一样宽 */
  width: 7.5rem;
  min-width: 7.5rem;
  max-width: 7.5rem;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  flex-shrink: 0; /* 不要被挤扁 */
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
    background-color: color-mix(in srgb, var(--color-danger), transparent 88%) !important;
    color: var(--color-danger) !important;
    border-color: color-mix(in srgb, var(--color-danger), transparent 75%) !important;
  }
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
  gap: 0.4rem;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .score-floating-bar {
    bottom: 1rem;
    padding: 0.25rem 0.5rem;
    gap: 0.35rem;
    max-width: calc(100vw - 1.5rem);
  }

  .bar-info-zone {
    gap: 0.25rem;
  }

  /* 移动端隐藏提示文案以节省横向空间 */
  .selected-text-tip {
    display: none;
  }

  /* 缩小已选索引槽位宽度 */
  .clickable-indices-list {
    width: 5.5rem;
    min-width: 5.5rem;
    max-width: 5.5rem;
  }

  .bar-actions-zone {
    gap: 0.25rem;
  }
}
</style>
