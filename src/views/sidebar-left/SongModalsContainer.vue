<template>
  <!-- 1. 新建乐谱 Modal -->
  <BaseModal v-model:visible="songModals.modals.create" title="新建乐谱" @confirm="songModals.handleCreateSong">
    <BaseInput
      v-model="songModals.modalData.inputValue"
      placeholder="请输入乐谱名称..."
      clearable
      autofocus
      @enter="songModals.handleCreateSong"
      :maxlength="15"
    />
  </BaseModal>

  <!-- 2. 乐谱综合配置 Modal -->
  <BaseModal v-model:visible="songModals.modals.config" title="乐谱配置" @confirm="songModals.handleConfigSong">
    <div class="config-modal-body">
      <div class="config-row">
        <label class="config-label">乐谱名称</label>
        <div class="control-wrapper">
          <BaseInput
            v-model="songModals.modalData.title"
            placeholder="请输入名称"
            clearable
            autofocus
            size="sm"
            @enter="songModals.handleConfigSong"
            :maxlength="15"
          />
        </div>
      </div>

      <div class="config-row">
        <label class="config-label">指法调 (Play)</label>
        <div class="control-wrapper">
          <BaseSelector
            v-model="songModals.modalData.playKey"
            :options="KEY_OPTIONS"
            default-value="C"
            :labelFormatter="val => `${val} 调`"
          />
        </div>
      </div>

      <!-- 🌟 直接 v-model 绑定暴露出名字为 key 的 computed -->
      <div class="config-row">
        <label class="config-label">演唱调 (Key)</label>
        <div class="control-wrapper">
          <BaseSelector
            v-model="songModals.key.value"
            :options="KEY_OPTIONS"
            default-value="C"
            :labelFormatter="val => `${val} 调`"
          />
        </div>
      </div>

      <div class="config-row">
        <label class="config-label">变调夹 (Capo)</label>
        <div class="control-wrapper">
          <BaseNumberInput v-model="songModals.modalData.capo" :min="0" :max="11" />
        </div>
      </div>
      <p class="config-help-text">注：在此处修改调式不会触发已排布和弦的自动移调。如需整体移调请使用顶部工具栏。</p>
    </div>
  </BaseModal>

  <!-- 3. 清除和弦确认 Modal -->
  <BaseModal
    v-model:visible="songModals.modals.clear"
    title="清除所有和弦"
    confirm-type="danger"
    @confirm="songModals.handleClearChords"
  >
    <p class="modal-description-text">确定要清除该乐谱中的所有已绑定和弦吗？此操作将立即生效。</p>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseInput from '@/components/BaseInput.vue';
import BaseModal from '@/components/BaseModal.vue';
import BaseNumberInput from '@/components/BaseNumberInput.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import { KEY_OPTIONS } from '@/constants';
import { useSongModals } from '@/services/useSongModals';

defineProps<{
  songModals: ReturnType<typeof useSongModals>;
}>();
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.modal-description-text {
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.6;
  color: var(--text-body);
  margin: 0;
}

.config-modal-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.2rem 0;
}

.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.2rem;
}

.config-label {
  width: 5rem;
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-title);
  white-space: nowrap;
}

.control-wrapper {
  flex: 1;
  max-width: 11rem;
}

.config-help-text {
  font-size: 0.65rem;
  color: var(--text-disabled);
  margin: 0.5rem 0 0 0;
  line-height: 1.4;
}
</style>
