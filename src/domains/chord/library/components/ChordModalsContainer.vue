<template>
  <BaseModal v-model:visible="groupModals.modals.move" @confirm="groupModals.handleMoveChord" title="移动至新分组">
    <div v-grid-nav="3" class="gap-md no-scrollbar grid max-h-[50vh] grid-cols-3">
      <button
        v-wave
        v-for="group in chordStore.groups"
        v-tooltip="group.id === groupModals.modalData.activeChord?.groupId ? '和弦当前已在此分组中' : ''"
        :class="[
          groupModals.modalData.moveTargetId === group.id
            ? 'bg-primary text-text-on-accent border-primary scale-[1.02]'
            : 'bg-bg-body text-text-body hover:border-primary hover:bg-bg-panel-hover active:scale-95',
        ]"
        :disabled="group.id === groupModals.modalData.activeChord?.groupId"
        :key="group.id"
        :title="group.name"
        @click="groupModals.modalData.moveTargetId = group.id"
        data-focusable-inline
        class="p-md border-border-base duration-fast disabled:bg-bg-main disabled:border-border-light disabled:text-text-disabled box-border flex w-full min-w-0 cursor-pointer items-center rounded-md border text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50"
      >
        <div v-marquee>
          <span> {{ group.name }} </span>
          <span class="text-text-disabled pl-1">({{ chordStore.groupChordMap.get(group.id)?.length ?? 0 }})</span>
        </div>
      </button>
    </div>
  </BaseModal>

  <BaseModal
    v-model:visible="groupModals.modals.chordVariantsDelete"
    :show-footer="false"
    :title="deleteVariantsTitle"
    width="w-large"
  >
    <template #header-extra>
      <BaseCheckbox
        :indeterminate="isVariantsIndeterminate"
        :model-value="isAllVariantsSelected"
        @update:model-value="handleToggleSelectAllVariants"
        label="全选"
        size="sm"
      />
    </template>

    <div class="gap-md flex flex-col">
      <div class="gap-lg flex items-center justify-between">
        <p class="text-text-body m-0 text-xs leading-relaxed font-medium">
          请点击选择要删除的指法，共
          <strong class="text-danger font-bold">
            {{ groupModals.modalData.activeGroupCard?.variants.length || 0 }}
          </strong>
          个
        </p>
      </div>
      <div
        class="no-scrollbar gap-lg p-xs box-border grid max-h-[52vh] grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] overflow-y-auto"
      >
        <div
          v-wave
          v-for="variant in groupModals.modalData.activeGroupCard?.variants"
          :aria-checked="groupModals.modalData.selectedVariantIds.has(variant.id)"
          :aria-label="`指法 偏移 ${variant.fretOffset}`"
          :class="{
            'border-danger! bg-tint-danger-90! ring-danger/50 ring-1': groupModals.modalData.selectedVariantIds.has(
              variant.id
            ),
          }"
          :key="variant.id"
          @click="groupModals.toggleVariantSelection(variant.id)"
          @keydown.enter.prevent="groupModals.toggleVariantSelection(variant.id)"
          @keydown.space.prevent="groupModals.toggleVariantSelection(variant.id)"
          data-focusable-inline
          class="pt-md px-sm pb-sm bg-bg-body border-border-light duration-fast hover:border-border-base hover:bg-bg-panel-hover relative box-border flex min-w-0 cursor-pointer flex-col items-center rounded-md border-[1.5px] transition-all outline-none select-none hover:-translate-y-px active:scale-[0.98]"
          role="checkbox"
          tabindex="0"
        >
          <div class="p-xs pointer-events-none box-border flex w-full items-center justify-center">
            <FretboardCanvas
              :chord="variant"
              :chord-name-scale="0.8"
              :is-dark-mode="isDark"
              :scale="1.8"
              :show-chord-name="false"
            />
          </div>
        </div>
      </div>
      <div class="gap-md pt-md pb-xs border-border-light mt-[0.15rem] flex items-center justify-between border-t">
        <ActionButton @click="groupModals.modals.chordVariantsDelete = false" label="取消" variant="ghost" />

        <div class="gap-sm flex items-center">
          <ActionButton
            @click="groupModals.handleDeleteAllVariants()"
            color="danger"
            label="全部删除"
            variant="ghost"
          />

          <ActionButton
            :disabled="groupModals.modalData.selectedVariantIds.size === 0"
            @click="groupModals.handleDeleteSelectedVariants()"
            color="danger"
            label="删除选中"
          />
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { useChordGroupModals } from '@/domains/chord/library/composables/useChordGroupModals';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getChordName } from '@/domains/chord/theory/theory';
import FretboardCanvas from '@/domains/fretboard/components/FretboardCanvas.vue';
import { isDark } from '@/platform/composables/useTheme';
import { injectModalController } from '@/platform/store/useModalController';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseCheckbox from '@/platform/ui/checkbox/BaseCheckbox.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';

const groupModals = injectModalController<ReturnType<typeof useChordGroupModals>>('groupModals');

const chordStore = useChordStore();

const isAllVariantsSelected = computed(() => {
  const variants = groupModals.modalData.activeGroupCard?.variants ?? [];
  if (variants.length === 0) return false;
  return variants.every(v => groupModals.modalData.selectedVariantIds.has(v.id));
});

const isVariantsIndeterminate = computed(() => {
  const variants = groupModals.modalData.activeGroupCard?.variants ?? [];
  const selectedCount = variants.filter(v => groupModals.modalData.selectedVariantIds.has(v.id)).length;
  return selectedCount > 0 && selectedCount < variants.length;
});

/** 删除指法弹窗标题：拼接主和弦名 */
const deleteVariantsTitle = computed(
  () => `删除和弦 "${getChordName(groupModals.modalData.activeGroupCard?.mainChord)}" 的指法`
);

/** 全选/取消全选待删除的指法 */
const handleToggleSelectAllVariants = () => {
  const variants = groupModals.modalData.activeGroupCard?.variants ?? [];
  if (isAllVariantsSelected.value) {
    variants.forEach(v => groupModals.modalData.selectedVariantIds.delete(v.id));
  } else {
    variants.forEach(v => groupModals.modalData.selectedVariantIds.add(v.id));
  }
};
</script>
