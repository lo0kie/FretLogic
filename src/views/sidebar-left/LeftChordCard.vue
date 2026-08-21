<template>
  <GlobalContextMenu :items="menuItems" #="{ isOpen }">
    <div
      class="chord-card-frame"
      v-memo="[
        cardData.mainChord.id,
        activeChord.id,
        computeChordFingerprint(activeChord),
        cardData.variantCount,
        isActive,
        cardData.hasVariants,
        isOpen,
      ]"
      :title="activeChord.chordName"
    >
      <div
        v-wave
        class="chord-thumb-card"
        :class="{
          'is-editing': isActive,
          'is-context-open': isOpen,
        }"
        role="button"
        tabindex="0"
        :aria-pressed="isActive"
        :aria-label="ariaLabel"
        @click="handleCardClick"
        @wheel="handleWheelScroll"
        @keydown.enter.prevent.stop="handleCardClick"
        @keydown.space.prevent.stop="handleCardClick"
        data-focusable-inline
      >
        <BaseBadge
          v-if="cardData.hasVariants"
          :variant="isActive ? 'primary' : 'neutral'"
          appearance="filled"
          size="xs"
          class="variant-badge-badge"
          :title="isActive ? '滚轮切换指法' : undefined"
          @click.stop="toggleVariantsDropdown"
        >
          <span v-if="isActive">{{ activeVariantIndex + 1 }}/{{ cardData.variantCount }}</span>
          <span v-else>{{ cardData.variantCount }}</span>
        </BaseBadge>

        <BaseMarquee class="chord-marquee-wrapper">
          <span class="chord-name-text">{{ activeChord.chordName }}</span>
        </BaseMarquee>
      </div>
    </div>
  </GlobalContextMenu>
</template>

<script setup lang="ts">
import BaseBadge from '@/components/BaseBadge.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import GlobalContextMenu, { type ContextMenuItem } from '@/components/GlobalContextMenu.vue';
import { useEditorStore } from '@/stores/chordEditorStore';
import type { Chord, GroupedChordCard } from '@/types';
import { computeChordFingerprint } from '@/utils/musicTheory';
import { Move, Trash2 } from '@lucide/vue';
import { computed, ref } from 'vue';

const props = defineProps<{
  cardData: GroupedChordCard;
  isActive: boolean;
}>();

const emit = defineEmits<{
  (e: 'delete', chord: Chord): void;
  (e: 'move', chord: Chord): void;
  (e: 'select', chord: Chord): void;
  (e: 'delete-variants', cardData: GroupedChordCard): void;
}>();

const editorStore = useEditorStore();

// 滚轮切换指法的增量阈值：鼠标滚轮一格（±100+）立即切换，触控板惯性按累积量切换
const WHEEL_SWITCH_THRESHOLD = 60;

/** 未激活时的本地预览索引；激活后索引以 store 为准 */
const localVariantIndex = ref(0);

const activeVariantIndex = computed(() => {
  if (props.isActive) {
    const idx = props.cardData.variants.findIndex(v => v.id === editorStore.draftChord.id);
    return idx >= 0 ? idx : localVariantIndex.value;
  }
  return localVariantIndex.value;
});

const activeChord = computed(() => {
  return props.cardData.variants[activeVariantIndex.value] ?? props.cardData.mainChord;
});

const handleCardClick = () => {
  emit('select', activeChord.value);
};

const switchVariant = (nextIdx: number) => {
  const targetChord = props.cardData.variants[nextIdx] ?? props.cardData.mainChord;
  localVariantIndex.value = nextIdx;
  emit('select', targetChord);
};

const toggleVariantsDropdown = () => {
  if (!props.cardData.hasVariants) return;
  const nextIdx = (activeVariantIndex.value + 1) % props.cardData.variantCount;
  switchVariant(nextIdx);
};

let wheelAccumulator = 0;

const handleWheelScroll = (e: WheelEvent) => {
  if (!props.cardData.hasVariants || !props.isActive) return;
  e.preventDefault();
  e.stopPropagation();
  // 触控板惯性滚动事件频率极高，累积增量达到阈值才切换一次指法
  if (Math.sign(e.deltaY) !== Math.sign(wheelAccumulator)) wheelAccumulator = 0;
  wheelAccumulator += e.deltaY;
  if (Math.abs(wheelAccumulator) < WHEEL_SWITCH_THRESHOLD) return;
  wheelAccumulator = 0;
  const total = props.cardData.variantCount;
  const cur = activeVariantIndex.value;
  let nextIdx = cur;
  if (e.deltaY > 0) nextIdx = (cur + 1) % total;
  else if (e.deltaY < 0) nextIdx = (cur - 1 + total) % total;
  if (nextIdx !== cur) switchVariant(nextIdx);
};

const menuItems = computed<ContextMenuItem[]>(() => [
  {
    label: '移动',
    icon: Move,
    action: () => emit('move', activeChord.value),
  },
  {
    label: '删除',
    icon: Trash2,
    danger: true,
    action: () => {
      if (props.cardData.hasVariants) {
        emit('delete-variants', props.cardData);
      } else {
        emit('delete', activeChord.value);
      }
    },
  },
]);

const ariaLabel = computed(() => {
  const name = activeChord.value.chordName;
  if (!props.cardData.hasVariants) return `和弦 ${name}`;
  const parts = [`和弦 ${name}`, `共 ${props.cardData.variantCount} 种指法`];
  if (props.isActive) parts.push('已激活，滚轮可切换');
  return parts.join('，');
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.chord-card-frame {
  box-sizing: border-box;
}

.chord-thumb-card {
  height: 2.25rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  box-sizing: border-box;
  cursor: pointer;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: @radius-md;
  outline: none;
  transition:
    background-color @duration-fast ease,
    border-color @duration-fast ease,
    box-shadow @duration-fast ease;

  &:hover,
  &:active,
  &.is-context-open {
    background-color: var(--bg-panel-hover);
    border-color: var(--border-base);
  }

  &.is-editing {
    background-color: color-mix(in srgb, var(--color-primary), var(--bg-body) 93%);
    border-color: color-mix(in srgb, var(--color-primary), transparent 45%);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-primary), transparent 75%);

    .chord-name-text {
      color: @primary;
    }

    &:hover,
    &:active,
    &.is-context-open {
      background-color: color-mix(in srgb, @primary, var(--bg-body) 78%);
      border-color: @primary;
      box-shadow: 0 0 0 1px color-mix(in srgb, @primary, transparent 60%);
    }
  }
}

.variant-badge-badge {
  position: absolute;
  top: -0.32rem;
  right: -0.32rem;
  z-index: 5;
  height: 0.9rem;
  min-width: 0.9rem;
  padding: 0 0.26rem;
  border-radius: 9999px;
  font-size: 0.58rem;
  font-weight: 700;
  line-height: 1;
  box-shadow: var(--shadow-sm);
  /* 用卡片同底色描边与卡片分离，避免悬浮感缺失 */
  border: 1px solid var(--bg-body);
  cursor: pointer;
  transition:
    transform @duration-fast @bezier-bounce,
    box-shadow @duration-fast ease,
    background-color @duration-fast ease;
}

.chord-marquee-wrapper {
  flex: 1;
  min-width: 0;
}

.chord-name-text {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1;
  pointer-events: none;
  color: var(--text-body);
}

@media (max-width: 768px) {
  .chord-card-frame,
  .chord-thumb-card {
    touch-action: pan-y !important;
    -webkit-user-drag: none !important;
    user-select: none !important;
  }

  .chord-thumb-card {
    height: 2.75rem;
    padding-left: 1.1rem;
    padding-right: 1.1rem;
    border-radius: @radius-lg;
  }

  .variant-badge-badge {
    top: -0.4rem;
    right: -0.4rem;
    left: auto;
    min-width: 1.05rem;
    height: 1.05rem;
    font-size: 0.66rem;
  }

  .chord-name-text {
    font-size: 0.85rem;
  }
}
</style>
