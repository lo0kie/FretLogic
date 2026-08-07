<template>
  <BaseModal v-model:visible="visibleModel" title="数据合并检查 (Merge Check)" :show-footer="false" width="w-lg">
    <div class="merge-modal-content">
      <p class="merge-tip-text">检测到云端与本地数据存在差异，请选择合并策略：</p>
      <div class="comparison-grid">
        <div class="data-side-box local-side">
          <div class="side-header">
            <span class="side-title">💻 本地数据</span>
          </div>
          <div class="side-stats">
            <div class="stat-item">
              和弦数量: <strong>{{ localChordsCount }}</strong>
            </div>
            <div class="stat-item">
              乐谱数量: <strong>{{ localSongsCount }}</strong>
            </div>
          </div>
        </div>
        <div class="data-side-box cloud-side">
          <div class="side-header">
            <span class="side-title">☁️ 云端数据</span>
          </div>
          <div class="side-stats">
            <div class="stat-item">
              和弦数量: <strong>{{ cloudChordsCount }}</strong>
            </div>
            <div class="stat-item">
              乐谱数量: <strong>{{ cloudSongsCount }}</strong>
            </div>
          </div>
        </div>
      </div>
      <div class="strategy-actions-list">
        <div class="strategy-card" @click="handleUnionMerge">
          <div class="strategy-info">
            <div class="strategy-title">增量合并 (Union Set)</div>
            <div class="strategy-desc">取两端和弦与乐谱的并集，仅补充缺失项，绝不删除或修改现有数据（推荐）</div>
          </div>
          <ActionButton size="sm" variant="subtle" primary>合并</ActionButton>
        </div>
        <div class="strategy-card danger-card" @click="handleOverwrite">
          <div class="strategy-info">
            <div class="strategy-title">云端覆盖本地</div>
            <div class="strategy-desc">完全使用云端数据替代本地记录，本地独有的和弦与修改将被清空</div>
          </div>
          <ActionButton size="sm" danger>覆盖</ActionButton>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseModal from '@/components/BaseModal.vue';
import { useGithubSyncService } from '@/services/useGithubSyncService';
import { useChordStore } from '@/stores/chordStore';
import { useSongStore } from '@/stores/songStore';
import type { ImportExportPayload } from '@/types';
import { computed } from 'vue';

const props = defineProps<{
  visible: boolean;
  pendingCloudData: ImportExportPayload | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: val => emit('update:visible', val),
});

const chordStore = useChordStore();
const songStore = useSongStore();
const syncService = useGithubSyncService();

const localChordsCount = computed(() => chordStore.savedChordsList.length);
const localSongsCount = computed(() => songStore.songs.length);
const cloudChordsCount = computed(() => props.pendingCloudData?.chords?.length || 0);
const cloudSongsCount = computed(() => props.pendingCloudData?.songs?.length || 0);

const handleUnionMerge = () => {
  if (!props.pendingCloudData) return;
  syncService.applyUnionSetMerge(props.pendingCloudData);
  visibleModel.value = false;
};

const handleOverwrite = () => {
  if (!props.pendingCloudData) return;
  syncService.applyOverwriteWithCloud(props.pendingCloudData);
  visibleModel.value = false;
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.merge-modal-content {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.merge-tip-text {
  font-size: 0.72rem;
  color: var(--text-disabled);
  margin: 0;
  line-height: 1.4;
}

.comparison-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
}

.data-side-box {
  padding: 0.75rem;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: @radius-md;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.side-header {
  display: flex;
  align-items: center;
}

.side-title {
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--text-title);
}

.side-stats {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.stat-item {
  font-size: 0.68rem;
  color: var(--text-disabled);

  strong {
    color: var(--text-title);
    font-weight: 700;
  }
}

.strategy-actions-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.2rem;
}

.strategy-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  padding: 0.75rem 0.85rem;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: @radius-md;
  cursor: pointer;
  transition: @transition-fast;

  &:hover {
    border-color: var(--color-primary);
    background-color: color-mix(in srgb, var(--color-primary), transparent 94%);
  }

  &.danger-card:hover {
    border-color: var(--color-danger);
    background-color: color-mix(in srgb, var(--color-danger), transparent 94%);
  }
}

.strategy-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
}

.strategy-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-title);
}

.strategy-desc {
  font-size: 0.65rem;
  color: var(--text-disabled);
  line-height: 1.35;
}
</style>
