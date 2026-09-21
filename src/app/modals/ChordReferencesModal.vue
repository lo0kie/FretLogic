<template>
  <BaseModal v-model:visible="groupModals.modals.chordReferences" :show-footer="false">
    <template #title>
      <!-- 前缀文本走 prefix 显式声明：拼进 name 会让整串解析失败、升降号退化成普通字符 -->
      <span
        v-chord-name="{ name: groupModals.modalData.referenceChordName, prefix: '和弦引用 ' }"
        class="font-bold text-fg-title"
      />
    </template>

    <BaseScrollArea
      v-if="references.length > 0"
      :fade="false"
      :scrollbar="false"
      axis="y"
      class="m-0 flex max-h-[50vh] list-none flex-col gap-md p-1"
      tag="ul"
    >
      <li v-for="item in references" :key="item.song.id">
        <button
          v-wave
          @click="handleOpenSong(item.song.id)"
          data-focusable-outline
          class="flex w-full cursor-pointer items-center gap-sm rounded-md border border-border-light bg-surface-body px-3 py-2 text-left transition-all duration-fast outline-none hover:border-border-base hover:bg-surface-panel-hover"
          type="button"
        >
          <BaseIcon class="shrink-0 text-primary" icon-size="md" name="music" />
          <span class="min-w-0 flex-1 truncate text-xs font-semibold text-fg-title">
            {{ item.song.title }}
          </span>
          <BaseBadge :title="`${item.count} 处引用`" appearance="subtle" size="xs" variant="primary">
            {{ item.count }} 处
          </BaseBadge>
        </button>
      </li>
    </BaseScrollArea>
    <Feedback v-else description="暂无歌词乐谱引用此和弦" size="sm" />
  </BaseModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { useRouter } from 'vue-router';

import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { buildScoreQuery } from '@/domains/score/editor/composables/useScoreRouteSync';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { injectModalController } from '@/platform/store/useModalController';
import { ROUTE_PATHS } from '@/platform/utils/constants';

import type { useChordGroupModals } from '@/domains/chord/library/composables/useChordGroupModals';
import type { Song } from '@/domains/score/types';

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
  // 直接落到带参完整 URL：推裸路径会让乐谱页的镜像 watcher 立刻回写补参数，多出一次导航
  void router.push({ path: ROUTE_PATHS.SCORE, query: buildScoreQuery(songId, scoreEditor.activeTab) });
};
</script>
