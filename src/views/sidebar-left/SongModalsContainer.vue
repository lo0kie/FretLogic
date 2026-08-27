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
    <div class="config-modal-body flex flex-col gap-lg py-xs">
      <BaseFormRow label="乐谱名称" label-width="5rem">
        <BaseInput
          v-model="songModals.modalData.title"
          v-focus.select
          placeholder="请输入名称"
          clearable
          :maxlength="15"
          @enter="songModals.handleConfigSong"
        />
      </BaseFormRow>

      <BaseFormRow label="指法调 (Play)" label-width="5rem">
        <BaseSelector
          v-model="songModals.modalData.playKey"
          :options="KEY_OPTIONS"
          default-value="C"
          :format-option="(val: any) => `${val} 调`"
        />
      </BaseFormRow>

      <BaseFormRow label="演唱调 (Key)" label-width="5rem">
        <BaseSelector
          v-model="songModals.key.value"
          :options="KEY_OPTIONS"
          default-value="C"
          :format-option="(val: any) => `${val} 调`"
        />
      </BaseFormRow>

      <BaseFormRow label="变调夹 (Capo)" label-width="5rem">
        <BaseNumberInput v-model="songModals.modalData.capo" :min="0" :max="11" />
      </BaseFormRow>
      <p class="form-hint text-2xs text-text-disabled leading-relaxed mt-xs">
        提示：在此处修改调式不会触发已排布和弦的自动移调。如需整体移调请使用顶部工具栏。
      </p>
    </div>
  </BaseModal>

  <!-- 3. 清除和弦确认 Modal -->
  <BaseModal
    v-model:visible="songModals.modals.clear"
    title="清除所有和弦"
    confirm-type="danger"
    @confirm="songModals.handleClearChords"
  >
    <p class="modal-description-text text-xs font-medium leading-relaxed text-text-body m-0">
      确定要清除该乐谱中的所有已绑定和弦吗？此操作将立即生效。
    </p>
  </BaseModal>
</template>

<script setup lang="ts">
import BaseFormRow from '@/components/base/BaseFormRow.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import BaseNumberInput from '@/components/base/BaseNumberInput.vue';
import BaseSelector from '@/components/base/BaseSelector.vue';
import type { useSongModals } from '@/composables/app/useSongModals';
import { KEY_OPTIONS } from '@/utils/music/musicTheory';
import { inject } from 'vue';

type SongModals = ReturnType<typeof useSongModals>;
const songModals = inject<SongModals>('songModals')!;
</script>
