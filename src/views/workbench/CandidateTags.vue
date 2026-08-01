<template>
  <div class="section-block candidates-section">
    <div class="section-label">推荐候选</div>
    <div class="candidate-tags no-scrollbar" :style="isMobile && customHeight ? { height: `${customHeight}px` } : {}">
      <template v-if="candidates.length > 0">
        <button
          v-for="(candidate, index) in candidates"
          :key="index"
          class="candidate-badge"
          :class="{ 'is-active': activeChordName === candidate.chordName }"
          @click="emit('select-candidate', candidate)"
        >
          {{ candidate.chordName }}
        </button>
      </template>

      <div v-else class="empty-candidate-placeholder">
        <span class="empty-candidate-text">暂无匹配和弦</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CandidateResult } from '@/types';

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

.candidate-badge {
  padding: 0.22rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.68rem;
  font-weight: 600;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  color: var(--text-body);
  cursor: pointer;
  transition: @transition-fast;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);

  &:active,
  &:hover {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-base);
    color: var(--text-title);
  }

  &:active {
    transform: scale(0.92);
  }

  &.is-active {
    background-color: var(--color-primary);
    color: #ffffff;
    border-color: transparent;
    transform: scale(1.04);
    box-shadow: 0 3px 10px color-mix(in srgb, var(--color-primary), transparent 50%);
  }
}

.empty-candidate-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0.4rem 0;
  border-radius: @radius-md;
  background-color: var(--bg-body);
  border: 1px dashed var(--border-light);
  box-sizing: border-box;
}

.empty-candidate-text {
  font-size: 0.62rem;
  font-weight: 500;
  color: var(--text-disabled);
  letter-spacing: -0.01em;
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

  .candidate-badge {
    font-size: 0.78rem;
    padding: 0.32rem 0.7rem;
  }

  .empty-candidate-placeholder {
    padding: 0.6rem 0;
  }

  .empty-candidate-text {
    font-size: 0.75rem;
  }
}
</style>
