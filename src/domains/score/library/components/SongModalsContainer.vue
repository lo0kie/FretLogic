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
    <BaseForm :label-width="FORM_LABEL_WIDTH" class="config-modal-body py-xs" gap="lg">
      <BaseFormRow label="乐谱名称">
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

      <BaseFormRow label="歌手">
        <BaseInput
          v-model="songModals.modalData.singer"
          :maxlength="MAX_SONG_NAME_LENGTH"
          @enter="songModals.handleConfigSong"
          clearable
          width="lg"
        />
      </BaseFormRow>

      <BaseFormRow label="拍号 (Time)">
        <BaseSelector
          v-model="songModals.modalData.timeSignature"
          :default-value="''"
          :options="[...SONG_TIME_SIGNATURES]"
          clearable
          placeholder="未设置"
          width="md"
        />
      </BaseFormRow>

      <BaseFormRow label="原调 (Original)">
        <KeySelector v-model="songModals.modalData.originalKey" allow-empty width="md" />
      </BaseFormRow>

      <BaseFormRow label="指法调 (Play)">
        <KeySelector v-model="songModals.modalData.playKey" width="md" />
      </BaseFormRow>

      <BaseFormRow label="演唱调 (Key)">
        <KeySelector v-model="songModals.key.value" width="md" />
      </BaseFormRow>

      <BaseFormRow label="变调夹 (Capo)">
        <BaseNumberInput v-model="songModals.modalData.capo" :max="11" :min="0" />
      </BaseFormRow>

      <p class="form-hint mt-xs text-2xs/relaxed text-fg-disabled">
        提示：在此处修改调式不会触发已排布和弦的自动移调。如需整体移调请使用顶部工具栏。
      </p>
    </BaseForm>
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
import BaseForm from '@/platform/ui/form/BaseForm.vue';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseInput from '@/platform/ui/input/BaseInput.vue';
import BaseNumberInput from '@/platform/ui/input/BaseNumberInput.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import PromptInputModal from '@/platform/ui/prompt/PromptInputModal.vue';
import BaseSelector from '@/platform/ui/selector/BaseSelector.vue';
import { SONG_TIME_SIGNATURES } from '@/domains/score/constants';
import { injectModalController } from '@/platform/store/useModalController';

import type { useSongModals } from '@/domains/score/library/composables/useSongModals';

const songModals = injectModalController<ReturnType<typeof useSongModals>>('songModals');

/** 表单行统一 Label 宽度：由 BaseForm 容器下发，各行无需重复声明 */
const FORM_LABEL_WIDTH = '6rem';
/** 乐谱名称最大长度 */
const MAX_SONG_NAME_LENGTH = 15;
</script>
