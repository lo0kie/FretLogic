<template>
  <!-- 横向滚轮滚动列表：单行固定高度排列全部变体指法；光标驻留其上时双向滚轮均驱动（向下滚到最右
       后由 .auto 边界放行列表下滑，向上则向左回滚）；列表滚动把条带到光标下时 v-wheel-scroll
       自动让位给列表，不会出现「没在条上滚却被联动」的劫持。无 CSS scroll-smooth 避免动量滑动失控 -->
  <BaseScrollArea
    v-if="hasVariants"
    :fade="{ size: 24, flushEps: 4 }"
    :wheel="{ smooth: true, overscroll: 'auto' }"
    close-popovers
    axis="x"
    class="flex w-full items-stretch gap-4 p-1 select-none"
  >
    <div
      v-wave
      v-for="(variant, index) in variants"
      v-scroll-into-view.x.center.keep-alive="isActiveVariant(variant)"
      :class="[
        isActiveVariant(variant)
          ? 'border-primary bg-tint-primary-90! ring-1 ring-primary/40 ring-inset'
          : 'border-border-light bg-surface-body hover:border-border-base hover:bg-surface-panel-hover',
      ]"
      :key="variantKey(variant, index)"
      @click="handleSelectVariant(variant)"
      class="group flex shrink-0 cursor-pointer flex-col items-center rounded-md border-2 p-1.5 transition-colors duration-fast"
    >
      <!-- 指板缩略图：顶部对齐以保证所有卡片的琴枕与空弦基准高度恒定一致 -->
      <div class="flex w-full shrink-0 items-start justify-center overflow-hidden pt-0.5">
        <FretboardCanvas
          :chord="variant"
          :is-dark-mode="isDark"
          :scale="1.8"
          :show-chord-name="false"
          show-bold-nut
          show-fret-numbers
          show-open-string-notes
          class="pointer-events-none"
        />
      </div>
    </div>
  </BaseScrollArea>

  <Feedback
    v-else
    :description="isChordOpened ? '当前和弦暂无其他变体指法。' : '在和弦库选中和弦后，这里会展示该和弦的所有变体指法。'"
    icon="git-branch"
    size="sm"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';

import FretboardCanvas from '@/domains/fretboard/components/FretboardCanvas.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { computeChordFingerprint, getChordName } from '@/domains/chord/theory/theory';
import { isDark } from '@/platform/composables/useTheme';

import type { Chord } from '@/domains/chord/types';

const editorStore = useChordEditorStore();
const chordStore = useChordStore();

const isChordOpened = computed(() => Boolean(editorStore.draftChord.id));

const chordName = computed(() => getChordName(editorStore.draftChord).trim());

/** 获取当前和弦的多指法变体：严格限定在当前分组内查找，不跨分组混入同名指法；
 *  且仅当草稿是库中已保存的和弦（有 id + groupId）时才查找——手动在指板按出的同名
 *  指法不得借 selectedGroupId 回退关联库中和弦，否则变体会被加载并可在点击时覆盖手动输入 */
const variants = computed<Chord[]>(() => {
  const chord = editorStore.draftChord;
  const name = chordName.value;
  if (!chord.id || !chord.groupId || !name) return [];

  const grouped = chordStore.getMultiFingering(chord.groupId, name);
  return grouped?.variants ?? [];
});

const hasVariants = computed(() => variants.value.length > 1);

/** 保证变体稳定 key，避免 DOM 重建导致横向滚动偏移复位 */
const variantKey = (v: Chord, idx: number): string =>
  v.id || `${computeChordFingerprint(v)}_${v.fretOffset ?? 0}_${idx}`;

/** 判断某个变体是否为当前草稿和弦 */
const isActiveVariant = (variant: Chord): boolean => {
  if (variant.id && editorStore.draftChord.id && variant.id === editorStore.draftChord.id) {
    return true;
  }
  return (
    computeChordFingerprint(variant) === computeChordFingerprint(editorStore.draftChord) &&
    variant.fretOffset === editorStore.draftChord.fretOffset
  );
};

/** 切换当前选中的指法变体：激活态变化自动触发卡片上的 v-scroll-into-view.x.center 进行纯横向平滑居中 */
const handleSelectVariant = (variant: Chord) => {
  editorStore.setEditor(variant);
};
</script>
