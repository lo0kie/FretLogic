<template>
  <!-- 横向滚轮滚动列表：单行固定高度排列全部变体指法；光标驻留其上时双向滚轮均驱动（向下滚到最右
       后本列表先吃满当前这轮连续滚动，停手再滚才由 .auto 边界放行、交外层纵向容器接手，且接手后
       本轮余下事件含反向回滑都不再被列表收回——见 v-wheel-scroll 的 edgeLock；向上则向左回滚）；
       列表滚动把条带到光标下时 v-wheel-scroll 自动让位给列表，不会出现「没在条上滚却被联动」的劫持。
       无 CSS scroll-smooth 避免动量滑动失控 -->
  <BaseScrollArea
    v-if="hasVariants"
    :fade="{ size: 24, flushEps: 4 }"
    :wheel="{ smooth: true, overscroll: 'auto' }"
    close-popovers
    axis="x"
    class="flex w-full items-stretch gap-lg select-none"
  >
    <div
      v-wave
      v-for="(variant, index) in variants"
      v-scroll-into-view.x.center.keep-alive="isActiveVariant(variant)"
      :class="[
        isActiveVariant(variant)
          ? 'border-primary bg-tint-primary-90! ring-1 ring-tint-primary-60 ring-inset'
          : 'border-border-light bg-surface-body hover:border-border-base hover:bg-surface-panel-hover',
      ]"
      :key="variantKey(variant, index)"
      @click="handleSelectVariant(variant)"
      class="group flex shrink-0 cursor-pointer flex-col items-center justify-center rounded-md border-2 p-1.5 transition-colors duration-fast"
    >
      <!-- 指板缩略图：**垂直居中**（卡片在容器 items-stretch 下被拉成等高，故居中的是缩略图自身）。
           取舍：同一分组里各变体的 fretCount 可以不同（3/4/5 品），FretboardCanvas 的高度随品数变，
           于是「等高卡片 + 居中」之后，各卡的琴枕 / 空弦基准线**不再逐卡对齐** —— 这是有意的观感选择
           （居中让不同品数的卡片在视觉重心上更均衡），不是被漏掉的约束；若要恢复「琴枕基准跨卡恒定」，
           把本元素的 justify-center 改成 justify-start 即可，无需其它改动（旧版的 items-start 壳已删）。
           不画和弦名但仍预留其版面（reserve-chord-name）→ 几何与和弦库 picker 逐像素一致，
           直接命中同一批位图；组件会把预留段裁掉，故卡片外观与之前完全相同 -->
      <FretboardCanvas
        :chord="variant"
        :is-dark-mode="isDark"
        :scale="1.8"
        hide-chord-name
        reserve-chord-name
        class="pointer-events-none"
      />
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
import { computeChordFingerprint } from '@/domains/chord/theory/theory';
import { useChordVariants } from '@/domains/chord/workbench/composables/useChordVariants';
import { isDark } from '@/platform/composables/useTheme';

import type { Chord } from '@/domains/chord/types';

const editorStore = useChordEditorStore();

const isChordOpened = computed(() => Boolean(editorStore.draftChord.id));

/** 多指法变体与「是否有变体」：判定与折叠头的「共 N 个」总数共用同一份来源
 *（见 useChordVariants 的说明），避免标题数与实际卡片数漂移 */
const { variants, hasVariants } = useChordVariants();

/** 保证变体稳定 key，避免 DOM 重建导致横向滚动偏移复位 */
const variantKey = (v: Chord, idx: number): string =>
  v.id || `${computeChordFingerprint(v)}_${v.fretOffset ?? 0}_${idx}`;

/** 判断某个变体是否为当前草稿和弦 */
const isActiveVariant = (variant: Chord): boolean => {
  if (variant.id && editorStore.draftChord.id && variant.id === editorStore.draftChord.id) return true;

  return (
    computeChordFingerprint(variant) === computeChordFingerprint(editorStore.draftChord) &&
    variant.fretOffset === editorStore.draftChord.fretOffset
  );
};

/** 切换当前选中的指法变体：激活态变化自动触发卡片上的 v-scroll-into-view.x.center 进行纯横向平滑居中 */
const handleSelectVariant = (variant: Chord) => void editorStore.setEditor(variant);
</script>
