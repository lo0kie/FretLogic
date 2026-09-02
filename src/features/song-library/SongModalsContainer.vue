<template>
  <BaseModal v-model:visible="songModals.modals.create" @confirm="songModals.handleCreateSong" title="新建乐谱">
    <BaseInput
      v-focus
      v-model="songModals.modalData.inputValue"
      :maxlength="MAX_SONG_NAME_LENGTH"
      @enter="songModals.handleCreateSong"
      clearable
      placeholder="请输入乐谱名称..."
    />
  </BaseModal>

  <BaseModal v-model:visible="songModals.modals.config" @confirm="songModals.handleConfigSong" title="乐谱配置">
    <div class="config-modal-body gap-lg py-xs flex flex-col">
      <BaseFormRow :label-width="FORM_LABEL_WIDTH" label="乐谱名称">
        <BaseInput
          v-focus.select
          v-model="songModals.modalData.title"
          :maxlength="MAX_SONG_NAME_LENGTH"
          @enter="songModals.handleConfigSong"
          clearable
          placeholder="请输入名称"
        />
      </BaseFormRow>

      <BaseFormRow :label-width="FORM_LABEL_WIDTH" label="指法调 (Play)">
        <BaseSelector v-model="songModals.modalData.playKey" :options="KEY_OPTIONS" default-value="C">
          <template #label="{ selected }">
            <span v-chord-name="{ name: `${selected}调` }" />
          </template>

          <template #option="{ option }">
            <span v-chord-name="{ name: `${option}调` }" />
          </template>
        </BaseSelector>
      </BaseFormRow>

      <BaseFormRow :label-width="FORM_LABEL_WIDTH" label="演唱调 (Key)">
        <BaseSelector v-model="songModals.key.value" :options="KEY_OPTIONS" default-value="C">
          <template #label="{ selected }">
            <span v-chord-name="{ name: `${selected}调` }" />
          </template>

          <template #option="{ option }">
            <span v-chord-name="{ name: `${option}调` }" />
          </template>
        </BaseSelector>
      </BaseFormRow>

      <BaseFormRow :label-width="FORM_LABEL_WIDTH" label="变调夹 (Capo)">
        <BaseNumberInput v-model="songModals.modalData.capo" :max="11" :min="0" />
      </BaseFormRow>
      <p class="form-hint text-2xs text-text-disabled mt-xs leading-relaxed">
        提示：在此处修改调式不会触发已排布和弦的自动移调。如需整体移调请使用顶部工具栏。
      </p>
    </div>
  </BaseModal>

  <BaseModal
    v-model:visible="songModals.modals.clear"
    @confirm="songModals.handleClearChords"
    confirm-type="danger"
    title="清除所有和弦"
  >
    <p class="modal-description-text text-text-body m-0 text-xs leading-relaxed font-medium">
      确定要清除该乐谱中的所有已绑定和弦吗？此操作将立即生效。
    </p>
  </BaseModal>
</template>

<script lang="ts" setup>
import { inject } from 'vue';

import BaseFormRow from '@/components/ui/BaseFormRow.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseNumberInput from '@/components/ui/BaseNumberInput.vue';
import BaseSelector from '@/components/ui/BaseSelector.vue';
import type { useSongModals } from '@/features/song-library/composables/useSongModals';
import { KEY_OPTIONS } from '@/services/music/theory';

type SongModals = ReturnType<typeof useSongModals>;
const songModals = inject<SongModals>('songModals')!;

/** 表单行统一 Label 宽度 */
const FORM_LABEL_WIDTH = '5rem';
/** 乐谱名称最大长度 */
const MAX_SONG_NAME_LENGTH = 15;
</script>
