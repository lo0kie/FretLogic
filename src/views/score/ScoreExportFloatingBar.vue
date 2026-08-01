<template>
  <div class="score-floating-bar">
    <div class="bar-info-zone">
      <!-- 🌟 根据 selectedCount 动态切换暗淡样式类 -->
      <span class="selected-count-badge" :class="{ 'is-zero': selectedCount === 0 }">
        {{ selectedCount }}
      </span>
      <span class="selected-text-tip">{{ selectedCount > 0 ? '已选择行:' : '请选择歌词' }}</span>

      <div ref="scrollContainerRef" class="clickable-indices-list no-scrollbar" @wheel.prevent="handleWheelScroll">
        <button
          v-for="lineIdx in sortedIndices"
          :key="lineIdx"
          class="index-item-btn"
          title="点击取消选择该行"
          @click="emit('remove-index', lineIdx)"
        >
          {{ lineIdx + 1 }}
        </button>
      </div>
    </div>

    <div class="bar-divider"></div>

    <div class="bar-actions-zone">
      <ActionButton size="sm" variant="ghost" @click="emit('toggle-select-all')">
        {{ isAllSelected ? '全不选' : '全选' }}
      </ActionButton>

      <ActionButton
        size="sm"
        variant="subtle"
        :disabled="selectedCount === 0"
        :loading="isExporting"
        @click="emit('copy-image')"
      >
        <template #prefix><Copy :size="14" stroke-width="2.5" /></template>
        复制图片
      </ActionButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import { Copy } from '@lucide/vue';
import { useTemplateRef } from 'vue';

defineProps<{
  selectedCount: number;
  sortedIndices: number[];
  isAllSelected: boolean;
  isExporting: boolean;
}>();

const emit = defineEmits<{
  (e: 'remove-index', lineIdx: number): void;
  (e: 'toggle-select-all'): void;
  (e: 'copy-image'): void;
}>();

const scrollContainerRef = useTemplateRef<HTMLElement>('scrollContainerRef');

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
  align-items: center;
  position: fixed;
  left: 50%;
  bottom: 1.8rem;
  transform: translateX(-50%);
  z-index: 90;
  pointer-events: auto;
  gap: 0.6rem;
  padding: 0.4rem 0.8rem;
  background-color: var(--bg-panel);
  backdrop-filter: blur(30px);
  -webkit-backdrop-filter: blur(30px);
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

.selected-count-badge {
  background-color: var(--color-primary);
  color: #ffffff;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 0.05rem 0.4rem;
  border-radius: 9999px;
  flex-shrink: 0;
  transition: @transition-fast;

  /* 🌟 当没有选中任何行时，将徽章颜色变暗、变柔和，不再那么亮 */
  &.is-zero {
    background-color: var(--bg-panel-hover);
    color: var(--text-disabled);
  }
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
  max-width: 13rem;
  overflow-x: auto;
  overflow-y: hidden;
  white-space: nowrap;
  flex-shrink: 1;
  padding: 0.1rem 0;

  scrollbar-width: none;
  -ms-overflow-style: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.index-item-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.1rem 0.35rem;
  border-radius: 9999px;
  background-color: color-mix(in srgb, var(--color-primary), transparent 88%);
  color: var(--color-primary);
  border: 1px solid color-mix(in srgb, var(--color-primary), transparent 75%);
  font-size: 0.62rem;
  font-weight: 700;
  font-family: monospace;
  cursor: pointer;
  transition: @transition-fast;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover {
    background-color: var(--color-danger);
    color: #ffffff;
    border-color: var(--color-danger);
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
</style>
