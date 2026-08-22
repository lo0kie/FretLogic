<template>
  <div class="section-block candidates-section">
    <div class="section-label">推荐候选</div>
    <div ref="tagsContainerRef" class="candidate-tags no-scrollbar" @keydown="handleKeydown">
      <template v-if="candidates.length > 0">
        <BaseBadge
          v-for="candidate in candidates"
          :key="candidate.chordName"
          v-wave="{ disabled: !isGlobalEditable }"
          :variant="activeChordName === candidate.chordName ? 'primary' : 'neutral'"
          :appearance="activeChordName === candidate.chordName ? 'filled' : 'subtle'"
          :interactive="isGlobalEditable"
          class="candidate-badge-item"
          size="sm"
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
import BaseBadge from '@/ui/components/BaseBadge.vue';
import EmptyState from '@/ui/components/EmptyState.vue';
import { useGridNavigation } from '@/ui/composables/useGridNavigation';
import { isGlobalEditable } from '@/stores/globalState';
import type { CandidateResult } from '@/types';
import { useTemplateRef } from 'vue';

defineProps<{
  candidates: CandidateResult[];
  activeChordName: string;
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
  gap: @space-sm;
}

.section-label {
  font-size: @fs-2xs;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

.candidate-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  align-content: flex-start;
  gap: @space-xs;
  max-height: 5rem;
  overflow-y: auto;
  min-height: 0;
  flex-shrink: 0;
  padding: @space-xs;
}

.candidate-badge-item {
  box-shadow: var(--shadow-xs);

  &.variant-primary {
    transform: scale(1.02);
  }
}
</style>
