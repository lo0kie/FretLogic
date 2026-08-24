<template>
  <!-- 1. 移动分组 Modal -->
  <BaseModal v-model:visible="groupModals.modals.move" title="移动至新分组" @confirm="groupModals.handleMoveChord">
    <div ref="groupContainer" class="move-group-grid no-scrollbar" @keydown="handleKeydown">
      <button
        v-for="group in chordStore.groups"
        :key="group.id"
        v-wave
        v-tooltip="group.id === groupModals.modalData.activeChord?.groupId ? '和弦当前已在此分组中' : ''"
        :disabled="group.id === groupModals.modalData.activeChord?.groupId"
        class="move-target-btn"
        :class="groupModals.getGroupClass(group.id)"
        :title="group.name"
        data-focusable-inline
        @click="groupModals.modalData.moveTargetId = group.id"
      >
        <BaseMarquee class="move-marquee">
          <span class="group-btn-text">{{ group.name }}</span>
          <span class="group-count-text">({{ chordStore.groupChordMap.get(group.id)?.length ?? 0 }})</span>
        </BaseMarquee>
      </button>
    </div>
  </BaseModal>

  <!-- 2. 多指法和弦删除选择 Modal -->
  <BaseModal
    v-model:visible="groupModals.modals.chordVariantsDelete"
    :title="`删除和弦 &quot;${groupModals.modalData.activeGroupCard?.mainChord.chordName}&quot; 的指法`"
    width="w-large"
    :show-footer="false"
  >
    <div class="variants-delete-modal-content">
      <div class="variants-header-row">
        <p class="modal-description-text">
          请点击选择要删除的指法，共
          <strong class="variants-count-highlight">
            {{ groupModals.modalData.activeGroupCard?.variants.length || 0 }}
          </strong>
          个
        </p>
        <ActionButton :primary="isAllVariantsSelected" @click="handleToggleSelectAllVariants">
          {{ isAllVariantsSelected ? '取消全选' : '全选' }}
        </ActionButton>
      </div>
      <div class="variants-checkbox-list no-scrollbar">
        <div
          v-for="variant in groupModals.modalData.activeGroupCard?.variants"
          :key="variant.id"
          v-wave
          class="variant-checkbox-item"
          :class="{
            'is-selected': groupModals.modalData.selectedVariantIds.has(variant.id),
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
          <div class="variant-preview-thumb">
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
      <div class="modal-footer-zone custom-footer">
        <ActionButton variant="ghost" @click="groupModals.modals.chordVariantsDelete = false"> 取消 </ActionButton>
        <div class="actions-right-group">
          <ActionButton danger variant="subtle" @click="groupModals.handleDeleteAllVariants()"> 全部删除 </ActionButton>
          <ActionButton
            danger
            :disabled="groupModals.modalData.selectedVariantIds.size === 0"
            @click="groupModals.handleDeleteSelectedVariants()"
          >
            确认删除所选 ({{ groupModals.modalData.selectedVariantIds.size }})
          </ActionButton>
        </div>
      </div>
    </div>
  </BaseModal>

  <!-- 3. 和弦引用反查 Modal -->
  <BaseModal
    v-model:visible="groupModals.modals.chordReferences"
    :title="`和弦引用 · ${groupModals.modalData.referenceChordName}`"
    width="w-md"
    :show-footer="false"
  >
    <div class="references-body">
      <ul v-if="references.length > 0" class="references-list no-scrollbar">
        <li v-for="item in references" :key="item.song.id">
          <button
            v-wave
            data-focusable-inline
            class="reference-row"
            type="button"
            @click="handleOpenSong(item.song.id)"
          >
            <FileText :size="15" class="reference-icon" />
            <span class="reference-title">{{ item.song.title }}</span>
            <span class="reference-key">{{ computeSongKey(item.song.playKey, item.song.capo) }}调</span>
            <span class="reference-count">{{ item.count }} 处</span>
          </button>
        </li>
      </ul>
      <EmptyState v-else size="sm" :icon="Music" description="暂无歌曲引用此和弦" />
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { useChordStore } from '@/stores/chordStore';
import { globalDarkMode } from '@/stores/globalState';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';
import type { Song } from '@/types';
import ActionButton from '@/components/ActionButton.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import BaseModal from '@/components/BaseModal.vue';
import EmptyState from '@/components/EmptyState.vue';
import Fretboard from '@/components/Fretboard.vue';
import type { useChordGroupModals } from '@/composables/useChordGroupModals';
import { useGridNavigation } from '@/composables/useGridNavigation';
import { computeSongKey } from '@/utils/musicTheory';
import { FileText, Music } from '@lucide/vue';
import { computed, inject, useTemplateRef } from 'vue';
import { useRouter } from 'vue-router';

type GroupModals = ReturnType<typeof useChordGroupModals>;
const groupModals = inject<GroupModals>('groupModals')!;

const router = useRouter();
const chordStore = useChordStore();
const songStore = useSongStore();
const scoreEditor = useScoreEditorStore();

const groupContainer = useTemplateRef<HTMLDivElement>('groupContainer');
const { handleKeydown } = useGridNavigation(3, groupContainer);

const isAllVariantsSelected = computed(() => {
  const variants = groupModals.modalData.activeGroupCard?.variants;
  if (!variants || variants.length === 0) return false;
  return variants.every(v => groupModals.modalData.selectedVariantIds.has(v.id));
});

const handleToggleSelectAllVariants = () => {
  const variants = groupModals.modalData.activeGroupCard?.variants;
  if (!variants) return;
  if (isAllVariantsSelected.value) {
    groupModals.modalData.selectedVariantIds.clear();
  } else {
    variants.forEach(v => groupModals.modalData.selectedVariantIds.add(v.id));
  }
};

interface ChordReferenceItem {
  song: Song;
  count: number;
}

const references = computed<ChordReferenceItem[]>(() => {
  const ids = new Set(groupModals.modalData.referenceChordIds);
  if (ids.size === 0) return [];
  const result: ChordReferenceItem[] = [];
  for (const song of songStore.songs) {
    let count = 0;
    for (const boundId of Object.values(song.chordMap)) {
      if (ids.has(boundId)) count++;
    }
    if (count > 0) result.push({ song, count });
  }
  return result;
});

const handleOpenSong = (songId: string) => {
  scoreEditor.setActiveSong(songId);
  groupModals.modals.chordReferences = false;
  router.push('/score');
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.modal-description-text {
  font-size: @fs-xs;
  font-weight: 500;
  line-height: 1.6;
  color: var(--text-body);
  margin: 0;
}

.move-group-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: @space-md;
  overflow-y: auto;
  max-height: 50vh;
  padding: @space-xs;
  box-sizing: border-box;
}

.move-target-btn {
  width: 100%;
  padding: @space-md @space-md;
  border-radius: @radius-md;
  font-size: @fs-xs;
  font-weight: 700;
  border: 1px solid var(--border-base);
  display: flex;
  align-items: center;
  min-width: 0;
  box-sizing: border-box;
  cursor: pointer;
  transition: @transition-fast;

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: var(--bg-main);
    border-color: var(--border-light);
    color: var(--text-disabled);
    :global(.dark) & {
      background-color: #272729;
      color: #77787a;
    }
  }

  &.is-selected {
    background-color: var(--color-primary);
    color: var(--text-on-accent);
    border-color: var(--color-primary);
    transform: scale(1.02);
  }

  &:active:not(.is-disabled) {
    transform: scale(0.95);
  }

  &.is-normal {
    background-color: var(--bg-body);
    color: var(--text-body);

    &:hover {
      border-color: @primary;
      background-color: var(--bg-panel-hover);
    }
  }
}

.move-marquee {
  min-width: 0;
  width: 100%;

  .group-btn-text {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-count-text {
    font-size: @fs-2xs;
    font-weight: 600;
    opacity: 0.65;
    white-space: nowrap;
    font-family: monospace;
  }
}

.variants-delete-modal-content {
  display: flex;
  flex-direction: column;
  gap: @space-md;
}

.variants-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: @space-lg;
}

.variants-checkbox-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: @space-lg;
  max-height: 52vh;
  overflow-y: auto;
  padding: @space-xs;
  box-sizing: border-box;
}

.variant-checkbox-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: @space-md @space-sm @space-sm;
  background-color: var(--bg-body);
  border: 1.5px solid var(--border-light);
  border-radius: @radius-md;
  cursor: pointer;
  user-select: none;
  transition:
    background-color @duration-fast ease,
    border-color @duration-fast ease,
    box-shadow @duration-fast ease,
    transform @duration-fast ease;
  box-sizing: border-box;
  outline: none;
  min-width: 0;

  &:hover {
    border-color: var(--border-base);
    background-color: var(--bg-panel-hover);
    transform: translateY(-1px);
  }

  &:active {
    transform: scale(0.98);
  }

  &.is-selected {
    border-color: var(--color-danger);
    background-color: var(--tint-danger-90);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-danger), transparent 50%);
  }

  :deep(*) {
    cursor: inherit !important;
    pointer-events: inherit !important;
  }
}

.variants-count-highlight {
  color: var(--color-danger);
  font-weight: 700;
}

.variant-preview-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: @space-xs;
  pointer-events: none;
  box-sizing: border-box;
}

.custom-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: @space-md;
  padding: @space-md 0 @space-xs;
  border-top: 1px solid var(--border-light);
  margin-top: 0.15rem;
}

.actions-right-group {
  display: flex;
  align-items: center;
  gap: @space-sm;
  flex-shrink: 0;
}

.references-body {
  max-height: 60vh;
  overflow-y: auto;
  padding: @space-xs;
  box-sizing: border-box;
}

.references-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: @space-sm;
}

.reference-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: @space-sm;
  padding: @space-sm @space-md;
  border: 1px solid var(--border-light);
  border-radius: @radius-md;
  background-color: var(--bg-body);
  cursor: pointer;
  text-align: left;
  color: var(--text-body);
  transition:
    background-color @duration-fast ease,
    border-color @duration-fast ease;

  &:hover {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-base);
  }
}

.reference-icon {
  flex: none;
  color: var(--text-muted);
}

.reference-title {
  flex: 1;
  min-width: 0;
  font-size: @fs-xs;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reference-key {
  flex: none;
  font-size: @fs-2xs;
  font-weight: 700;
  color: @primary;
  background-color: var(--tint-primary-88);
  padding: @space-xs @space-sm;
  border-radius: @radius-pill;
}

.reference-count {
  flex: none;
  font-size: @fs-2xs;
  color: var(--text-muted);
}
</style>
