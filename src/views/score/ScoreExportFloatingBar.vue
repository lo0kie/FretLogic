<template>
  <div class="score-floating-bar">
    <div class="bar-info-zone">
      <!-- 🌟 改用 BaseBadge 表示已选行数计数 -->
      <BaseBadge
        :variant="selectedCount > 0 ? 'primary' : 'neutral'"
        :appearance="selectedCount > 0 ? 'filled' : 'subtle'"
        size="xs"
      >
        {{ selectedCount }}
      </BaseBadge>

      <span class="selected-text-tip">{{ selectedCount > 0 ? '已选择行:' : '请选择歌词' }}</span>

      <div ref="scrollContainerRef" class="clickable-indices-list no-scrollbar" @wheel.prevent="handleWheelScroll">
        <!-- 🌟 已选索引按钮改用交互式 BaseBadge，并带关闭图标与 Hover 效果 -->
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
      <ActionButton size="sm" variant="ghost" :primary="isAllSelected" @click="emit('toggle-select-all')">
        全选
      </ActionButton>

      <GlobalTooltip
        :content="includeMetaBar ? '导出图片将包含歌名/调/Capo 信息' : '导出图片不包含歌曲信息'"
        placement="top"
      >
        <ActionButton
          size="sm"
          variant="ghost"
          icon-only
          :active="includeMetaBar"
          :aria-label="includeMetaBar ? '关闭歌曲信息栏' : '开启歌曲信息栏'"
          @click="includeMetaBar = !includeMetaBar"
        >
          <FileText :size="14" stroke-width="2.5" />
        </ActionButton>
      </GlobalTooltip>

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
import BaseBadge from '@/components/BaseBadge.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { Copy, FileText } from '@lucide/vue';
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
</style>
