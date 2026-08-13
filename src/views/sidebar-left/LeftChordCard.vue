<template>
  <GlobalContextMenu :items="menuItems" #="{ isOpen }">
    <div
      class="chord-card-frame"
      v-memo="[
        cardData.mainChord.id,
        activeChord.id,
        activeChord.fingerprint,
        cardData.variantCount,
        isActive,
        cardData.hasVariants,
        isSwapping,
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
          'has-variants': cardData.hasVariants,
          'is-swapping': isSwapping,
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
        <span
          v-if="hasDot"
          class="status-dot"
          :class="{
            'is-root-normal': hasRoot && !isInverted,
            'is-root-inverted': hasRoot && isInverted,
            'is-rootless-inverted': !hasRoot && isInverted,
            'is-rootless-normal': !hasRoot && !isInverted,
          }"
          :title="activeChord.chordName"
          :aria-label="activeChord.chordName"
        ></span>

        <BaseBadge
          v-if="cardData.hasVariants"
          :variant="isActive ? 'primary' : 'neutral'"
          appearance="filled"
          size="xs"
          class="variant-badge-badge"
          :width="isActive ? '1.6rem' : '1.2rem'"
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
import { Move, Trash2 } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';

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

const isSwapping = ref(false);
let swapTimer: ReturnType<typeof setTimeout> | null = null;

const triggerSwapAnimation = async () => {
  if (swapTimer) {
    clearTimeout(swapTimer);
    swapTimer = null;
  }
  isSwapping.value = false;
  await nextTick();
  isSwapping.value = true;
  swapTimer = setTimeout(() => {
    isSwapping.value = false;
    swapTimer = null;
  }, 200);
};

const switchVariant = (nextIdx: number) => {
  triggerSwapAnimation();
  const targetChord = props.cardData.variants[nextIdx] ?? props.cardData.mainChord;
  localVariantIndex.value = nextIdx;
  emit('select', targetChord);
};

const toggleVariantsDropdown = () => {
  if (!props.cardData.hasVariants) return;
  const nextIdx = (activeVariantIndex.value + 1) % props.cardData.variantCount;
  switchVariant(nextIdx);
};

const handleWheelScroll = (e: WheelEvent) => {
  if (!props.cardData.hasVariants || !props.isActive) return;
  e.preventDefault();
  e.stopPropagation();
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

const hasRoot = computed(() => activeChord.value.strings.some(s => s.fret >= 0 && s.isRoot));
const isInverted = computed(() => !!activeChord.value.isInverted);
const hasDot = true;

const ariaLabel = computed(() => {
  const name = activeChord.value.chordName;
  if (!props.cardData.hasVariants) return `和弦 ${name}`;
  const parts = [`和弦 ${name}`, `共 ${props.cardData.variantCount} 种指法`];
  if (props.isActive) parts.push('已激活，滚轮可切换');
  return parts.join('，');
});

onBeforeUnmount(() => {
  if (swapTimer) clearTimeout(swapTimer);
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

  &.has-variants {
    box-shadow: var(--shadow-sm);

    &::before {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      background-color: var(--bg-body);
      border: 1px solid var(--border-light);
      border-radius: inherit;
      pointer-events: none;
      box-shadow: var(--shadow-sm);
      transform: translate(4px, 3px) rotate(0.6deg);
      transition:
        transform 0.18s @bezier-standard,
        border-color @duration-fast ease,
        background-color @duration-fast ease;
    }

    &:not(.is-swapping):hover::before,
    &:not(.is-swapping).is-context-open::before {
      transform: translate(6px, 5px) rotate(2deg);
      border-color: var(--border-base);
    }

    &.is-editing::before {
      border-color: color-mix(in srgb, @primary, transparent 40%);
      background-color: color-mix(in srgb, @primary, var(--bg-body) 94%);
    }

    &.is-swapping::before {
      transition: none;
      animation: cardSwapAnimate 0.2s cubic-bezier(0.22, 1.2, 0.36, 1) both;
    }
  }

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

@keyframes cardSwapAnimate {
  0% {
    transform: translate(6px, 5px) rotate(2deg);
  }
  40% {
    transform: translate(0, 0) rotate(0);
  }
  100% {
    transform: translate(6px, 5px) rotate(2deg);
  }
}

.variant-badge-badge {
  position: absolute;
  top: -0.28rem;
  right: -0.28rem;
  z-index: 5;
  height: 0.85rem;
  padding: 0 0.2rem;
  border-radius: 9999px;
  font-size: 0.52rem;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition:
    transform @duration-fast ease,
    box-shadow @duration-fast ease;
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

.status-dot {
  position: absolute;
  top: 0.25rem;
  left: 0.25rem;
  z-index: 5;
  display: inline-block;
  border-radius: 50%;
  flex-shrink: 0;
  box-sizing: border-box;
  transition: box-shadow @duration-fast ease;
  width: 0.32rem;
  height: 0.32rem;
  box-shadow: 0 0 0 1.5px color-mix(in srgb, currentColor, transparent 65%);

  &.is-root-normal {
    background-color: var(--color-primary);
  }
  &.is-root-inverted {
    background: linear-gradient(135deg, var(--color-primary) 50%, var(--color-warning) 50%);
  }
  &.is-rootless-inverted {
    background-color: var(--color-warning);
  }
  &.is-rootless-normal {
    background-color: var(--color-danger);
  }
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
    top: -0.35rem;
    right: -0.35rem;
    left: auto;
    min-width: 1.1rem;
    height: 1.1rem;
    font-size: 0.65rem;
  }

  .chord-name-text {
    font-size: 0.85rem;
  }

  .status-dot {
    top: 0.25rem;
    left: 0.25rem;
    width: 0.62rem;
    height: 0.62rem;
  }
}
</style>
