<template>
  <PromptInputModal
    v-model="songModals.modalData.inputValue"
    v-model:visible="songModals.modals.create"
    :maxlength="MAX_SONG_NAME_LENGTH"
    @confirm="songModals.handleCreateSong"
    placeholder="请输入乐谱名称..."
    title="新建乐谱"
  />

  <BaseModal v-model:visible="songModals.modals.config" @confirm="songModals.handleConfigSong" title="乐谱配置">
    <div class="config-modal-body flex flex-col gap-lg py-xs">
      <BaseFormRow :label-width="FORM_LABEL_WIDTH" label="乐谱名称">
        <BaseInput
          v-focus.select
          v-model="songModals.modalData.title"
          :maxlength="MAX_SONG_NAME_LENGTH"
          @enter="songModals.handleConfigSong"
          clearable
          placeholder="请输入名称"
          width="lg"
        />
      </BaseFormRow>

      <BaseFormRow :label-width="FORM_LABEL_WIDTH" label="指法调 (Play)">
        <KeySelector v-model="songModals.modalData.playKey" width="md" />
      </BaseFormRow>

      <BaseFormRow :label-width="FORM_LABEL_WIDTH" label="演唱调 (Key)">
        <KeySelector v-model="songModals.key.value" width="md" />
      </BaseFormRow>

      <BaseFormRow :label-width="FORM_LABEL_WIDTH" label="变调夹 (Capo)">
        <BaseNumberInput v-model="songModals.modalData.capo" :max="11" :min="0" />
      </BaseFormRow>
      <p class="form-hint mt-xs text-2xs/relaxed text-fg-disabled">
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
    <p class="modal-description-text m-0 text-xs/relaxed font-medium text-fg-body">
      确定要清除该乐谱中的所有已绑定和弦吗？此操作将立即生效。
    </p>
  </BaseModal>
</template>

<script setup lang="ts">
import KeySelector from '@/domains/chord/components/KeySelector.vue';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseInput from '@/platform/ui/input/BaseInput.vue';
import BaseNumberInput from '@/platform/ui/input/BaseNumberInput.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import PromptInputModal from '@/platform/ui/prompt/PromptInputModal.vue';
import { injectModalController } from '@/platform/store/useModalController';

import type { useSongModals } from '@/domains/score/library/composables/useSongModals';

const songModals = injectModalController<ReturnType<typeof useSongModals>>('songModals');

/** 表单行统一 Label 宽度 */
const FORM_LABEL_WIDTH = '5rem';
/** 乐谱名称最大长度 */
const MAX_SONG_NAME_LENGTH = 15;
</script>
