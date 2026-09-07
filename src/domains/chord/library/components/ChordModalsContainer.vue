<template>
  <BaseModal v-model:visible="groupModals.modals.move" @confirm="groupModals.handleMoveChord" title="移动至新分组">
    <div v-grid-nav="3" class="no-scrollbar grid max-h-[50vh] grid-cols-3 gap-md">
      <button
        v-wave
        v-for="group in chordStore.groups"
        v-tooltip="group.id === groupModals.modalData.activeChord?.groupId ? '和弦当前已在此分组中' : ''"
        :class="[
          groupModals.modalData.moveTargetId === group.id
            ? 'scale-[1.02] border-primary bg-primary text-fg-on-accent'
            : 'bg-surface-body text-fg-body hover:border-primary hover:bg-surface-panel-hover active:scale-95',
        ]"
        :disabled="group.id === groupModals.modalData.activeChord?.groupId"
        :key="group.id"
        :title="group.name"
        @click="groupModals.modalData.moveTargetId = group.id"
        data-focusable-inline
        class="box-border flex w-full min-w-0 cursor-pointer items-center rounded-md border border-border-base p-md text-xs font-bold transition-all duration-fast disabled:cursor-not-allowed disabled:border-border-light disabled:bg-surface-main disabled:text-fg-disabled disabled:opacity-50"
      >
        <div v-marquee.fade>
          <span> {{ group.name }} </span>
          <span class="pl-1 text-fg-disabled">({{ chordStore.groupChordMap.get(group.id)?.length ?? 0 }})</span>
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
        @update:model-value="handleToggleSelectAllVariants()"
        label="全选"
        size="sm"
      />
    </template>

    <div class="flex flex-col gap-md">
      <div class="flex items-center justify-between gap-lg">
        <p class="m-0 text-xs/relaxed font-medium text-fg-body">
          请点击选择要删除的指法，共
          <strong class="font-bold text-danger">
            {{ groupModals.modalData.activeGroupCard?.variants.length || 0 }}
          </strong>
          个
        </p>
      </div>
      <div
        class="no-scrollbar box-border grid max-h-[52vh] grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-lg overflow-y-auto p-xs"
      >
        <div
          v-wave
          v-for="variant in groupModals.modalData.activeGroupCard?.variants"
          :aria-checked="groupModals.modalData.selectedVariantIds.has(variant.id)"
          :aria-label="`指法 偏移 ${variant.fretOffset}`"
          :class="{
            'border-danger! bg-tint-danger-90! ring-1 ring-danger/50': groupModals.modalData.selectedVariantIds.has(
              variant.id
            ),
          }"
          :key="variant.id"
          @click="groupModals.toggleVariantSelection(variant.id)"
          @keydown.enter.prevent="groupModals.toggleVariantSelection(variant.id)"
          @keydown.space.prevent="groupModals.toggleVariantSelection(variant.id)"
          data-focusable-inline
          class="relative box-border flex min-w-0 cursor-pointer flex-col items-center rounded-md border-[1.5px] border-border-light bg-surface-body px-sm pt-md pb-sm transition-all duration-fast outline-none select-none hover:-translate-y-px hover:border-border-base hover:bg-surface-panel-hover active:scale-[0.98]"
          role="checkbox"
          tabindex="0"
        >
          <div class="pointer-events-none box-border flex w-full items-center justify-center p-xs">
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
      <div class="mt-[0.15rem] flex items-center justify-between gap-md border-t border-border-light pt-md pb-xs">
        <ActionButton @click="groupModals.modals.chordVariantsDelete = false" label="取消" variant="ghost" />

        <div class="flex items-center gap-sm">
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

import FretboardCanvas from '@/domains/fretboard/components/FretboardCanvas.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseCheckbox from '@/platform/ui/checkbox/BaseCheckbox.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { isDark } from '@/platform/composables/useTheme';
import { injectModalController } from '@/platform/store/useModalController';

import type { useChordGroupModals } from '@/domains/chord/library/composables/useChordGroupModals';

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
