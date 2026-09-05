<template>
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
            data-focusable-inline
            class="gap-sm bg-bg-body border-border-light duration-fast hover:bg-bg-panel-hover hover:border-border-base box-border flex w-full cursor-pointer items-center rounded-md border px-3 py-2 text-left transition-all outline-none"
            type="button"
          >
            <BaseIcon class="text-primary shrink-0" icon-size="md" name="music" />
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

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import type { useChordGroupModals } from '@/domains/chord/library/composables/useChordGroupModals';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import type { Song } from '@/domains/score/types';
import { injectModalController } from '@/platform/store/useModalController';
import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import EmptyState from '@/platform/ui/feedback/EmptyState.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';

// 引用反查是「和弦 × 乐谱」的跨领域特性，弹窗由应用层承载：
// 复用侧边栏注入的 groupModals 控制器，数据查询与跳转在此处合法地依赖两个领域。
const groupModals = injectModalController<ReturnType<typeof useChordGroupModals>>('groupModals');

const router = useRouter();
const songStore = useSongStore();
const scoreEditor = useScoreEditorStore();

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
