<template>
  <div class="section-block candidates-section">
    <div class="section-label">推荐候选</div>
    <div
      ref="tagsContainerRef"
      class="candidate-tags no-scrollbar"
      :style="isMobile && customHeight ? { height: `${customHeight}px` } : {}"
      @keydown="handleKeydown"
    >
      <template v-if="candidates.length > 0">
        <BaseBadge
          v-wave
          v-for="candidate in candidates"
          :key="candidate.chordName"
          :variant="activeChordName === candidate.chordName ? 'primary' : 'neutral'"
          :appearance="activeChordName === candidate.chordName ? 'filled' : 'subtle'"
          interactive
          class="candidate-badge-item"
          @click="emit('select-candidate', candidate)"
        >
          {{ candidate.chordName }}
        </BaseBadge>
      </template>

      <EmptyState v-else description="暂无匹配和弦" size="sm" bordered />
    </div>
  </div>
</template>

<script setup lang="ts">
import BaseBadge from '@/components/BaseBadge.vue';
import EmptyState from '@/components/EmptyState.vue';
import { useGridNavigation } from '@/services/useGridNavigation';
import type { CandidateResult } from '@/types';
import { useTemplateRef } from 'vue';

defineProps<{
  candidates: CandidateResult[];
  activeChordName: string;
  isMobile: boolean;
  customHeight?: number;
}>();

const emit = defineEmits<{
  (e: 'select-candidate', candidate: CandidateResult): void;
}>();

const tagsContainerRef = useTemplateRef<HTMLElement>('tagsContainerRef');
const { handleKeydown } = useGridNavigation(undefined, tagsContainerRef);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.section-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.section-label {
  font-size: 0.58rem;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.02em;
  padding-left: 0.2rem;
  flex-shrink: 0;
}

.candidate-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  align-content: flex-start;
  gap: 0.35rem;
  max-height: 4.2rem;
  overflow-y: auto;
  flex-shrink: 0;
  padding: 0.1rem;
}

.candidate-badge-item {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);

  &.variant-primary {
    transform: scale(1.02);
  }
}

@media (max-width: 768px) {
  .candidates-section {
    flex: 2;
  }

  .candidate-tags {
    max-height: none;
    overflow-y: auto;
    box-sizing: border-box;
    gap: 0.35rem;
  }
}
</style>
