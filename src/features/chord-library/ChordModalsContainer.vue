<template>
  <BaseModal v-model:visible="groupModals.modals.move" title="移动至新分组" @confirm="groupModals.handleMoveChord">
    <div v-grid-nav="3" class="grid grid-cols-3 gap-md no-scrollbar max-h-[50vh]">
      <button
        v-for="group in chordStore.groups"
        :key="group.id"
        v-wave
        v-tooltip="group.id === groupModals.modalData.activeChord?.groupId ? '和弦当前已在此分组中' : ''"
        :disabled="group.id === groupModals.modalData.activeChord?.groupId"
        class="w-full p-md rounded-md text-xs font-bold border border-border-base flex items-center min-w-0 box-border cursor-pointer transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-bg-main disabled:border-border-light disabled:text-text-disabled"
        :class="[
          groupModals.modalData.moveTargetId === group.id
            ? 'bg-primary text-text-on-accent border-primary scale-[1.02]'
            : 'bg-bg-body text-text-body hover:border-primary hover:bg-bg-panel-hover active:scale-95',
        ]"
        :title="group.name"
        data-focusable-inline
        @click="groupModals.modalData.moveTargetId = group.id"
      >
        <div v-marquee>
          <span> {{ group.name }} </span>
          <span class="pl-1 text-text-disabled">({{ chordStore.groupChordMap.get(group.id)?.length ?? 0 }})</span>
        </div>
      </button>
    </div>
  </BaseModal>

  <BaseModal
    v-model:visible="groupModals.modals.chordVariantsDelete"
    :title="deleteVariantsTitle"
    width="w-large"
    :show-footer="false"
  >
    <template #header-extra>
      <ActionButton :color="isAllVariantsSelected ? 'primary' : 'default'" @click="handleToggleSelectAllVariants">
        {{ isAllVariantsSelected ? '取消全选' : '全选' }}
      </ActionButton>
    </template>

    <div class="flex flex-col gap-md">
      <div class="flex items-center justify-between gap-lg">
        <p class="text-xs font-medium leading-relaxed text-text-body m-0">
          请点击选择要删除的指法，共
          <strong class="text-danger font-bold">
            {{ groupModals.modalData.activeGroupCard?.variants.length || 0 }}
          </strong>
          个
        </p>
      </div>
      <div
        class="no-scrollbar grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-lg max-h-[52vh] overflow-y-auto p-xs box-border"
      >
        <div
          v-for="variant in groupModals.modalData.activeGroupCard?.variants"
          :key="variant.id"
          v-wave
          class="relative flex flex-col items-center pt-md px-sm pb-sm bg-bg-body border-[1.5px] border-border-light rounded-md cursor-pointer select-none box-border outline-none min-w-0 transition-all duration-fast hover:border-border-base hover:bg-bg-panel-hover hover:-translate-y-px active:scale-[0.98]"
          :class="{
            '!border-danger !bg-tint-danger-90 ring-1 ring-danger/50': groupModals.modalData.selectedVariantIds.has(
              variant.id
            ),
          }"
          role="checkbox"
          :aria-checked="groupModals.modalData.selectedVariantIds.has(variant.id)"
          :aria-label="`指法 Capo ${variant.capo}`"
          tabindex="0"
          data-focusable-inline
          @click="groupModals.toggleVariantSelection(variant.id)"
          @keydown.enter.prevent="groupModals.toggleVariantSelection(variant.id)"
          @keydown.space.prevent="groupModals.toggleVariantSelection(variant.id)"
        >
          <div class="flex items-center justify-center w-full p-xs pointer-events-none box-border">
            <Fretboard
              :bordered="false"
              bg-color="transparent"
              fret-number-size="lg"
              :chord="variant"
              :interactive="false"
              :scale="0.32"
              :is-dark-mode="globalDarkMode"
              :show-chord-name="false"
            />
          </div>
        </div>
      </div>
      <div class="flex items-center justify-between gap-md pt-md pb-xs border-t border-border-light mt-[0.15rem]">
        <ActionButton variant="ghost" @click="groupModals.modals.chordVariantsDelete = false"> 取消 </ActionButton>
        <div class="flex items-center gap-sm">
          <ActionButton color="danger" variant="subtle" @click="groupModals.handleDeleteAllVariants()">
            全部删除
          </ActionButton>
          <ActionButton
            color="danger"
            :disabled="groupModals.modalData.selectedVariantIds.size === 0"
            @click="groupModals.handleDeleteSelectedVariants()"
          >
            确认删除所选 ({{ groupModals.modalData.selectedVariantIds.size }})
          </ActionButton>
        </div>
      </div>
    </div>
  </BaseModal>

  <BaseModal
    v-model:visible="groupModals.modals.chordReferences"
    :title="`和弦引用 · ${groupModals.modalData.referenceChordName}`"
    width="w-md"
    :show-footer="false"
  >
    <div>
      <ul
        v-if="references.length > 0"
        class="no-scrollbar flex flex-col gap-md max-h-[50vh] overflow-y-auto m-0 p-1 list-none"
      >
        <li v-for="item in references" :key="item.song.id">
          <button
            v-wave
            data-focusable-inline
            class="flex items-center gap-sm w-full py-2 px-3 rounded-md bg-bg-body border border-border-light text-left cursor-pointer outline-none box-border transition-all duration-fast hover:bg-bg-panel-hover hover:border-border-base"
            type="button"
            @click="handleOpenSong(item.song.id)"
          >
            <Music class="shrink-0 text-primary" :size="16" />
            <span class="flex-1 min-w-0 truncate text-xs font-semibold text-text-title">
              {{ item.song.title }}
            </span>
            <BaseBadge size="xs" variant="primary" appearance="subtle"> {{ item.count }} 处 </BaseBadge>
          </button>
        </li>
      </ul>
      <EmptyState v-else description="暂无歌词乐谱引用此和弦" size="sm" />
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ui/ActionButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import Fretboard from '@/components/fretboard/Fretboard.vue';
import type { useChordGroupModals } from '@/features/chord-library/composables/useChordGroupModals';
import { useChordStore } from '@/stores/chordStore';
import { globalDarkMode } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';
import type { Song } from '@/types';
import { getChordName } from '@/utils/music/musicTheory';
import { Music } from '@lucide/vue';
import { computed, inject } from 'vue';
import { useRouter } from 'vue-router';

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
