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
          :maxlength="MAX_SINGER_NAME_LENGTH"
          @enter="songModals.handleConfigSong"
          clearable
          width="lg"
        />
      </BaseFormRow>

      <BaseFormRow label="拍号 (Time)">
        <BaseSelector
          v-model="songModals.modalData.timeSignature"
          :options="SONG_TIME_SIGNATURES"
          clearable
          default-value=""
          placeholder="未设置"
        />
      </BaseFormRow>

      <BaseFormRow label="原调 (Original)">
        <KeySelector v-model="songModals.modalData.originalKey" allow-empty />
      </BaseFormRow>

      <BaseFormRow label="指法调 (Play)">
        <KeySelector v-model="songModals.modalData.playKey" />
      </BaseFormRow>

      <BaseFormRow label="演唱调 (Key)">
        <KeySelector v-model="songModals.key.value" />
      </BaseFormRow>

      <BaseFormRow label="变调夹 (Capo)">
        <!-- 上限取交互配置的常量而非字面量 11：域类型 Capo 允许到 12（导入/历史数据可能带 12，
             见 fretboard/types.ts），而交互档位刻意封顶 11（第 12 品与空弦同度，见 MAX_CAPO_LIMIT 说明）。
             写死字面量会让「常量改了这里不跟」成为漂移点；此处对 capo=12 的存量数据按 ± 仍会吸附进 11 档。 -->
        <BaseNumberInput v-model="songModals.modalData.capo" :max="MAX_CAPO_LIMIT" :min="MIN_CAPO_LIMIT" />
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
import { INTERACTION_CONFIG } from '@/domains/fretboard/constants';
import { SONG_TIME_SIGNATURES } from '@/domains/score/constants';
import { SONG_MODALS } from '@/domains/score/library/injectionKeys';
import { injectModalController } from '@/platform/store/useModalController';

const songModals = injectModalController(SONG_MODALS);

/** 表单行统一 Label 宽度：由 BaseForm 容器下发，各行无需重复声明 */
const FORM_LABEL_WIDTH = '6rem';
/** 乐谱名称最大长度（单行展示，过长会把卡片/顶栏挤爆） */
const MAX_SONG_NAME_LENGTH = 15;
/**
 * 歌手名最大长度：与乐谱名**分开一档**。两者不是同一量级——歌名通常是 2~6 字，而乐队名动辄十几字符
 * （The Rolling Stones / Simon & Garfunkel），沿用 15 会把真实歌手名截断。24 覆盖绝大多数乐队名，
 * 且仍是单行展示可承受的长度（展示侧一律走 truncate，不会溢出）。
 */
const MAX_SINGER_NAME_LENGTH = 24;
/** 变调夹交互档位（见模板内说明：与域类型 Capo 的 0..12 不是同一件事） */
const { MAX_CAPO_LIMIT, MIN_CAPO_LIMIT } = INTERACTION_CONFIG;
</script>
