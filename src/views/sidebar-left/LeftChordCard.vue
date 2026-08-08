<template>
  <GlobalContextMenu ref="contextMenuRef" :items="menuItems">
    <div class="chord-card-frame" :title="`${cardData.mainChord.chordName} ${dotTitle}`">
      <div
        v-wave
        class="chord-thumb-card"
        :class="{
          'is-editing': isEditing,
          'is-context-open': isMenuOpen,
          'has-variants': cardData.hasVariants,
          'is-swapping': isSwapping,
        }"
        role="button"
        tabindex="0"
        :aria-pressed="isEditing"
        :aria-label="`和弦 ${cardData.mainChord.chordName}${cardData.hasVariants ? `（共 ${cardData.variantCount} 种指法${isEditing ? '，已激活，滚轮可切换' : ''}）` : ''}`"
        @click="handleCardClick"
        @wheel="handleWheelScroll"
        @keydown.enter.prevent.stop="handleCardClick"
        @keydown.space.prevent.stop="handleCardClick"
      >
        <!-- 左上角：状态标识圆点 -->
        <span
          v-if="hasDot"
          class="status-dot"
          :class="{
            'is-root-normal': hasRoot && !isInverted,
            'is-root-inverted': hasRoot && isInverted,
            'is-rootless-inverted': !hasRoot && isInverted,
            'is-rootless-normal': !hasRoot && !isInverted,
          }"
          :title="dotTitle"
          :aria-label="dotTitle"
        ></span>

        <!-- 右上角：变体指法数量 Badge -->
        <BaseBadge
          v-if="cardData.hasVariants"
          :variant="isEditing ? 'primary' : 'neutral'"
          appearance="filled"
          size="xs"
          class="variant-badge-badge"
          :title="isEditing ? '滚轮切换指法' : undefined"
          @click.stop="toggleVariantsDropdown"
        >
          {{ cardData.variantCount }}
        </BaseBadge>

        <BaseMarquee class="chord-marquee-wrapper">
          <span class="chord-name-text">
            {{ cardData.mainChord.chordName }}
          </span>
        </BaseMarquee>
      </div>
    </div>
  </GlobalContextMenu>
</template>

<script setup lang="ts">
import BaseBadge from '@/components/BaseBadge.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import GlobalContextMenu, { type ContextMenuItem } from '@/components/GlobalContextMenu.vue';
import type { Chord, GroupedChordCard } from '@/types';
import { Move, Trash2 } from '@lucide/vue';
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';

const props = defineProps<{
  cardData: GroupedChordCard;
  isEditing: boolean;
}>();

const emit = defineEmits<{
  (e: 'delete', chord: Chord): void;
  (e: 'move', chord: Chord): void;
  (e: 'select', chord: Chord): void;
  (e: 'delete-variants', cardData: GroupedChordCard): void;
}>();

const activeVariantIndex = ref(0);

watch(
  () => props.cardData.mainChord.id,
  () => {
    activeVariantIndex.value = 0;
  }
);

const activeChord = computed(() => props.cardData.variants[activeVariantIndex.value] || props.cardData.mainChord);

const contextMenuRef = useTemplateRef<InstanceType<typeof GlobalContextMenu>>('contextMenuRef');
const isMenuOpen = computed(() => contextMenuRef.value?.isOpen ?? false);

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

const toggleVariantsDropdown = () => {
  if (!props.cardData.hasVariants) return;
  triggerSwapAnimation();
  activeVariantIndex.value = (activeVariantIndex.value + 1) % props.cardData.variantCount;
  emit('select', activeChord.value);
};

const handleWheelScroll = (e: WheelEvent) => {
  if (!props.cardData.hasVariants || !props.isEditing) return;
  e.preventDefault();
  e.stopPropagation();

  triggerSwapAnimation();

  const total = props.cardData.variantCount;
  if (e.deltaY > 0) {
    activeVariantIndex.value = (activeVariantIndex.value + 1) % total;
  } else if (e.deltaY < 0) {
    activeVariantIndex.value = (activeVariantIndex.value - 1 + total) % total;
  }
  emit('select', activeChord.value);
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
const isInverted = computed(() => activeChord.value.isInverted);
const hasDot = ref(true);

const dotTitle = computed(() => {
  const rootText = hasRoot.value ? '有根音' : '无根音';
  const invertText = isInverted.value ? ' + 转位和弦' : '';
  return `${rootText}${invertText}`;
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
  height: 2rem;
  padding-left: 0.6rem;
  padding-right: 0.6rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  box-sizing: border-box;
  cursor: pointer;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: @radius-md;
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
    background-color: color-mix(in srgb, @primary, var(--bg-body) 88%);
    border-color: @primary;

    .chord-name-text {
      color: @primary;
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
  min-width: 0.85rem;
  height: 0.85rem;
  padding: 0 0.2rem;
  border-radius: 9999px;
  font-size: 0.52rem;
  font-weight: 800;
  line-height: 1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  cursor: pointer;
  transition: transform @duration-fast ease;
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
  width: 0.3rem;
  height: 0.3rem;
  border-radius: 50%;
  flex-shrink: 0;
  box-sizing: border-box;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);

  // 1. 有根音 + 无转位 -> 主题色
  &.is-root-normal {
    background-color: var(--color-primary);
  }

  // 2. 有根音 + 有转位 -> 主题色与 Warn 各一半 (渐变)
  &.is-root-inverted {
    background: linear-gradient(135deg, var(--color-primary) 50%, var(--color-warning) 50%);
  }

  // 3. 无根音 + 有转位 -> Warn
  &.is-rootless-inverted {
    background-color: var(--color-warning);
  }

  // 4. 无根音 + 无转位 -> Danger (红色)
  &.is-rootless-normal {
    background-color: var(--color-danger);
  }
}

/* 移动端尺寸微调 */
@media (max-width: 768px) {
  .status-dot {
    top: -0.3rem;
    left: -0.3rem;
    width: 0.62rem;
    height: 0.62rem;
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
    padding-left: 0.75rem;
    padding-right: 0.75rem;
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
    top: -0.3rem;
    left: -0.3rem;
    width: 0.62rem;
    height: 0.62rem;
  }
}
</style>
