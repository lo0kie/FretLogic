<template>
  <BaseModal v-model:visible="isMergeModalOpen" title="数据合并检查 (Merge Check)" :show-footer="false" width="w-lg">
    <div class="merge-modal-content">
      <p class="merge-tip-text">检测到云端与本地数据存在差异，请选择合并策略：</p>

      <!-- 数据差异对照卡片 -->
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

      <!-- 策略选择按钮区 -->
      <div class="strategy-actions-list">
        <div class="strategy-card" @click="syncService.applyUnionSetMerge()">
          <div class="strategy-info">
            <div class="strategy-title">增量合并 (Union Set)</div>
            <div class="strategy-desc">取两端和弦与乐谱的并集，仅补充缺失项，绝不删除或修改现有数据（推荐）</div>
          </div>
          <ActionButton size="sm" variant="subtle">合并</ActionButton>
        </div>

        <div class="strategy-card danger-card" @click="syncService.applyOverwriteWithCloud()">
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
import { computed } from 'vue';

const chordStore = useChordStore();
const songStore = useSongStore();
const syncService = useGithubSyncService();

const isMergeModalOpen = syncService.isMergeModalOpen;

const localChordsCount = computed(() => chordStore.savedChordsList.length);
const localSongsCount = computed(() => songStore.songs.length);

const cloudChordsCount = computed(() => syncService.pendingCloudData.value?.chords?.length || 0);
const cloudSongsCount = computed(() => syncService.pendingCloudData.value?.songs?.length || 0);
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.merge-modal-content {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

.merge-tip-text {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--text-body);
  margin: 0;
}

.comparison-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.6rem;
}

.data-side-box {
  padding: 0.6rem 0.8rem;
  border-radius: @radius-md;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);

  .side-header {
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text-title);
    margin-bottom: 0.4rem;
  }

  .side-stats {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.68rem;
    color: var(--text-disabled);

    strong {
      color: var(--text-title);
    }
  }
}

.strategy-actions-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.4rem;
}

.strategy-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 0.85rem;
  border-radius: @radius-md;
  border: 1px solid var(--border-light);
  background-color: var(--bg-body);
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
  padding-right: 0.8rem;

  .strategy-title {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-title);
  }

  .strategy-desc {
    font-size: 0.62rem;
    color: var(--text-disabled);
    line-height: 1.35;
  }
}
</style>
