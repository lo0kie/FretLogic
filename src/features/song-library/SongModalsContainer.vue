<template>
  <BaseModal v-model:visible="songModals.modals.create" title="新建乐谱" @confirm="songModals.handleCreateSong">
    <BaseInput
      v-model="songModals.modalData.inputValue"
      v-focus
      placeholder="请输入乐谱名称..."
      clearable
      :maxlength="MAX_SONG_NAME_LENGTH"
      @enter="songModals.handleCreateSong"
    />
  </BaseModal>

  <BaseModal v-model:visible="songModals.modals.config" title="乐谱配置" @confirm="songModals.handleConfigSong">
    <div class="config-modal-body flex flex-col gap-lg py-xs">
      <BaseFormRow label="乐谱名称" :label-width="FORM_LABEL_WIDTH">
        <BaseInput
          v-model="songModals.modalData.title"
          v-focus.select
          placeholder="请输入名称"
          clearable
          :maxlength="MAX_SONG_NAME_LENGTH"
          @enter="songModals.handleConfigSong"
        />
      </BaseFormRow>

      <BaseFormRow label="指法调 (Play)" :label-width="FORM_LABEL_WIDTH">
        <BaseSelector v-model="songModals.modalData.playKey" :options="KEY_OPTIONS" default-value="C">
          <template #label="{ selected }">
            <span v-chord-name="{ name: `${selected}调` }" />
          </template>

          <template #option="{ option }">
            <span v-chord-name="{ name: `${option}调` }" />
          </template>
        </BaseSelector>
      </BaseFormRow>

      <BaseFormRow label="演唱调 (Key)" :label-width="FORM_LABEL_WIDTH">
        <BaseSelector v-model="songModals.key.value" :options="KEY_OPTIONS" default-value="C">
          <template #label="{ selected }">
            <span v-chord-name="{ name: `${selected}调` }" />
          </template>

          <template #option="{ option }">
            <span v-chord-name="{ name: `${option}调` }" />
          </template>
        </BaseSelector>
      </BaseFormRow>

      <BaseFormRow label="变调夹 (Capo)" :label-width="FORM_LABEL_WIDTH">
        <BaseNumberInput v-model="songModals.modalData.capo" :min="0" :max="11" />
      </BaseFormRow>
      <p class="form-hint text-2xs text-text-disabled leading-relaxed mt-xs">
        提示：在此处修改调式不会触发已排布和弦的自动移调。如需整体移调请使用顶部工具栏。
      </p>
    </div>
  </BaseModal>

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
import BaseFormRow from '@/components/ui/BaseFormRow.vue';
import BaseInput from '@/components/ui/BaseInput.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseNumberInput from '@/components/ui/BaseNumberInput.vue';
import BaseSelector from '@/components/ui/BaseSelector.vue';
import type { useSongModals } from '@/features/song-library/composables/useSongModals';
import { KEY_OPTIONS } from '@/utils/music/musicTheory';
import { inject } from 'vue';

type SongModals = ReturnType<typeof useSongModals>;
const songModals = inject<SongModals>('songModals')!;

/** 表单行统一 Label 宽度 */
const FORM_LABEL_WIDTH = '5rem';
/** 乐谱名称最大长度 */
const MAX_SONG_NAME_LENGTH = 15;
</script>
