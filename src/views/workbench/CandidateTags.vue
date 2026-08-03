<template>
  <div class="section-block candidates-section">
    <div class="section-label">推荐候选</div>
    <div class="candidate-tags no-scrollbar" :style="isMobile && customHeight ? { height: `${customHeight}px` } : {}">
      <template v-if="candidates.length > 0">
        <!-- 🌟 改用 BaseBadge 替换手写 button -->
        <BaseBadge
          v-wave
          v-for="(candidate, index) in candidates"
          :key="index"
          :variant="activeChordName === candidate.chordName ? 'primary' : 'neutral'"
          :appearance="activeChordName === candidate.chordName ? 'filled' : 'subtle'"
          :size="isMobile ? 'sm' : 'xs'"
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
import BaseBadge from '@/components/BaseBadge.vue'; // 🌟 引入 BaseBadge
import EmptyState from '@/components/EmptyState.vue';
import type { CandidateResult } from '@/types';

defineProps<{
  candidates: CandidateResult[];
  activeChordName: string;
  isMobile: boolean;
  customHeight?: number;
}>();

const emit = defineEmits<{
  (e: 'select-candidate', candidate: CandidateResult): void;
}>();
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
  color: var(--text-disabled);
  letter-spacing: 0.02em;
  padding-left: 0.2rem;
  flex-shrink: 0;
}

.candidate-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28rem;
  max-height: 3.8rem;
  overflow-y: auto;
  flex-shrink: 0;
  padding: 0.1rem;
}

.candidate-badge-item {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);

  &.variant-primary {
    transform: scale(1.04);
  }
}

@media (max-width: 768px) {
  .candidates-section {
    flex: 1.8;
  }

  .candidate-tags {
    max-height: none;
    overflow-y: auto;
    box-sizing: border-box;
    gap: 0.35rem;
  }
}
</style>
