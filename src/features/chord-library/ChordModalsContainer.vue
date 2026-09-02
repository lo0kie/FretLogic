<template>
  <BaseModal v-model:visible="groupModals.modals.move" @confirm="groupModals.handleMoveChord" title="移动至新分组">
    <div v-grid-nav="3" class="gap-md no-scrollbar grid max-h-[50vh] grid-cols-3">
      <button
        v-for="group in chordStore.groups"
        v-tooltip="group.id === groupModals.modalData.activeChord?.groupId ? '和弦当前已在此分组中' : ''"
        v-wave
        :class="[
          groupModals.modalData.moveTargetId === group.id
            ? 'bg-primary text-text-on-accent border-primary scale-[1.02]'
            : 'bg-bg-body text-text-body hover:border-primary hover:bg-bg-panel-hover active:scale-95',
        ]"
        :disabled="group.id === groupModals.modalData.activeChord?.groupId"
        :key="group.id"
        :title="group.name"
        @click="groupModals.modalData.moveTargetId = group.id"
        class="p-md border-border-base duration-fast disabled:bg-bg-main disabled:border-border-light disabled:text-text-disabled box-border flex w-full min-w-0 cursor-pointer items-center rounded-md border text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50"
        data-focusable-inline
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
      <ActionButton :color="isAllVariantsSelected ? 'primary' : 'default'" @click="handleToggleSelectAllVariants">
        {{ isAllVariantsSelected ? '取消全选' : '全选' }}
      </ActionButton>
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
          v-for="variant in groupModals.modalData.activeGroupCard?.variants"
          v-wave
          :aria-checked="groupModals.modalData.selectedVariantIds.has(variant.id)"
          :aria-label="`指法 Capo ${variant.capo}`"
          :class="{
            'border-danger! bg-tint-danger-90! ring-danger/50 ring-1': groupModals.modalData.selectedVariantIds.has(
              variant.id
            ),
          }"
          :key="variant.id"
          @click="groupModals.toggleVariantSelection(variant.id)"
          @keydown.enter.prevent="groupModals.toggleVariantSelection(variant.id)"
          @keydown.space.prevent="groupModals.toggleVariantSelection(variant.id)"
          class="pt-md px-sm pb-sm bg-bg-body border-border-light duration-fast hover:border-border-base hover:bg-bg-panel-hover relative box-border flex min-w-0 cursor-pointer flex-col items-center rounded-md border-[1.5px] transition-all outline-none select-none hover:-translate-y-px active:scale-[0.98]"
          data-focusable-inline
          role="checkbox"
          tabindex="0"
        >
          <div class="p-xs pointer-events-none box-border flex w-full items-center justify-center">
            <Fretboard
              :bordered="false"
              :chord="variant"
              :interactive="false"
              :is-dark-mode="globalDarkMode"
              :scale="0.32"
              :show-chord-name="false"
              bg-color="transparent"
              fret-number-size="lg"
            />
          </div>
        </div>
      </div>
      <div class="gap-md pt-md pb-xs border-border-light mt-[0.15rem] flex items-center justify-between border-t">
        <ActionButton @click="groupModals.modals.chordVariantsDelete = false" variant="ghost"> 取消 </ActionButton>
        <div class="gap-sm flex items-center">
          <ActionButton @click="groupModals.handleDeleteAllVariants()" color="danger" variant="subtle">
            全部删除
          </ActionButton>
          <ActionButton
            :disabled="groupModals.modalData.selectedVariantIds.size === 0"
            @click="groupModals.handleDeleteSelectedVariants()"
            color="danger"
          >
            确认删除所选 ({{ groupModals.modalData.selectedVariantIds.size }})
          </ActionButton>
        </div>
      </div>
    </div>
  </BaseModal>

  <BaseModal
    v-model:visible="groupModals.modals.chordReferences"
    :show-footer="false"
    :title="`和弦引用 · ${groupModals.modalData.referenceChordName}`"
    width="w-md"
  >
    <div>
      <ul
        v-if="references.length > 0"
        class="no-scrollbar gap-md m-0 flex max-h-[50vh] list-none flex-col overflow-y-auto p-1"
      >
        <li v-for="item in references" :key="item.song.id">
          <button
            v-wave
            @click="handleOpenSong(item.song.id)"
            class="gap-sm bg-bg-body border-border-light duration-fast hover:bg-bg-panel-hover hover:border-border-base box-border flex w-full cursor-pointer items-center rounded-md border px-3 py-2 text-left transition-all outline-none"
            data-focusable-inline
            type="button"
          >
            <BaseIcon :size="16" class="text-primary shrink-0" name="music" />
            <span class="text-text-title min-w-0 flex-1 truncate text-xs font-semibold">
              {{ item.song.title }}
            </span>
            <BaseBadge appearance="subtle" size="xs" variant="primary"> {{ item.count }} 处 </BaseBadge>
          </button>
        </li>
      </ul>
      <EmptyState v-else description="暂无歌词乐谱引用此和弦" size="sm" />
    </div>
  </BaseModal>
</template>

<script lang="ts" setup>
import { computed, inject } from 'vue';
import { useRouter } from 'vue-router';

import Fretboard from '@/components/fretboard/Fretboard.vue';
import ActionButton from '@/components/ui/ActionButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseIcon from '@/components/ui/BaseIcon.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import type { useChordGroupModals } from '@/features/chord-library/composables/useChordGroupModals';
import { getChordName } from '@/services/music/theory';
import { useChordStore } from '@/stores/chordStore';
import { globalDarkMode } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';
import type { Song } from '@/types';

type GroupModals = ReturnType<typeof useChordGroupModals>;
const groupModals = inject<GroupModals>('groupModals')!;

const router = useRouter();
const chordStore = useChordStore();
const songStore = useSongStore();
const scoreEditor = useScoreEditorStore();

const isAllVariantsSelected = computed(() => {
  const variants = groupModals.modalData.activeGroupCard?.variants ?? [];
  if (variants.length === 0) return false;
  return variants.every(v => groupModals.modalData.selectedVariantIds.has(v.id));
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

const references = computed<{ song: Song; count: number }[]>(() => {
  const ids = groupModals.modalData.referenceChordIds;
  if (!ids || ids.length === 0) return [];
  return songStore.getChordReferences(ids);
});

/** 用户点击引用列表中的乐谱：打开该乐谱、关闭弹窗并跳转到乐谱页 */
const handleOpenSong = (songId: string) => {
  scoreEditor.setActiveSong(songId);
  groupModals.modals.chordReferences = false;
  router.push('/score');
};
</script>
