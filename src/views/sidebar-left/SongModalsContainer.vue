<template>
  <!-- 1. 新建乐谱 Modal -->
  <BaseModal v-model:visible="songModals.modals.create" title="新建乐谱" @confirm="songModals.handleCreateSong">
    <BaseInput
      v-model="songModals.modalData.inputValue"
      v-focus
      placeholder="请输入乐谱名称..."
      clearable
      :maxlength="15"
      @enter="songModals.handleCreateSong"
    />
  </BaseModal>

  <!-- 2. 乐谱综合配置 Modal -->
  <BaseModal v-model:visible="songModals.modals.config" title="乐谱配置" @confirm="songModals.handleConfigSong">
    <div class="config-modal-body">
      <BaseFormRow label="乐谱名称" label-width="5rem">
        <div class="control-wrapper">
          <BaseInput
            v-model="songModals.modalData.title"
            v-focus.select
            placeholder="请输入名称"
            clearable
            :maxlength="15"
            @enter="songModals.handleConfigSong"
          />
        </div>
      </BaseFormRow>

      <BaseFormRow label="指法调 (Play)" label-width="5rem">
        <div class="control-wrapper">
          <BaseSelector
            v-model="songModals.modalData.playKey"
            :options="KEY_OPTIONS"
            default-value="C"
            :label-formatter="val => `${val} 调`"
          />
        </div>
      </BaseFormRow>

      <BaseFormRow label="演唱调 (Key)" label-width="5rem">
        <div class="control-wrapper">
          <BaseSelector
            v-model="songModals.key.value"
            :options="KEY_OPTIONS"
            default-value="C"
            :label-formatter="val => `${val} 调`"
          />
        </div>
      </BaseFormRow>

      <BaseFormRow label="变调夹 (Capo)" label-width="5rem">
        <div class="control-wrapper">
          <BaseNumberInput v-model="songModals.modalData.capo" :min="0" :max="11" />
        </div>
      </BaseFormRow>
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
import BaseFormRow from '@/components/BaseFormRow.vue';
import BaseInput from '@/components/BaseInput.vue';
import BaseModal from '@/components/BaseModal.vue';
import BaseNumberInput from '@/components/BaseNumberInput.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import type { useSongModals } from '@/composables/useSongModals';
import { KEY_OPTIONS } from '@/utils/musicTheory';
import { inject } from 'vue';

type SongModals = ReturnType<typeof useSongModals>;
const songModals = inject<SongModals>('songModals')!;
</script>

<style scoped lang="scss">
.modal-description-text {
  font-size: $fs-xs;
  font-weight: 500;
  line-height: 1.6;
  color: var(--text-body);
  margin: 0;
}

.config-modal-body {
  display: flex;
  flex-direction: column;
  gap: $space-lg;
  padding: $space-xs 0;
}

.control-wrapper {
  flex: 1;
  max-width: 11rem;
}

.config-help-text {
  font-size: $fs-2xs;
  color: var(--text-disabled);
  margin: 0.5rem 0 0 0;
  line-height: 1.4;
}
</style>
