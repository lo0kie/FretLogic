<template>
  <div class="w-full box-border">
    <ContextMenu :items="menuItems" #="{ isOpen }">
      <div class="w-full" :title="getChordName(activeChord, { shorthand: settingsStore.workbenchChordShorthand })">
        <div
          v-wave
          class="w-full h-[2.2rem] px-2 flex items-center justify-between relative box-border cursor-pointer rounded-md outline-none transition-all duration-fast bg-bg-body border border-border-light hover:bg-bg-panel-hover hover:border-border-base active:bg-bg-panel-hover active:border-border-base"
          :class="{
            '!bg-tint-primary-92 !border-tint-primary-45 shadow-[0_0_0_1px_rgba(var(--color-primary-rgb),0.25)] hover:!bg-tint-primary-80 hover:!border-primary hover:shadow-[0_0_0_1px_rgba(var(--color-primary-rgb),0.4)]':
              isActive,
            'bg-bg-panel-hover border-border-base': isOpen,
          }"
          role="button"
          tabindex="0"
          :aria-pressed="isActive"
          :aria-label
          data-focusable-inline
          @click="handleCardClick"
          @wheel="handleWheelScroll"
          @keydown.enter.prevent.stop="handleCardClick"
          @keydown.space.prevent.stop="handleCardClick"
        >
          <BaseBadge
            v-if="cardData.hasVariants"
            :variant="isActive ? 'primary' : 'neutral'"
            appearance="filled"
            size="xs"
            class="absolute -top-1.5 -right-1.5 z-card border border-bg-body shadow-sm cursor-pointer transition-all duration-fast ease-bounce"
            :title="isActive ? '滚轮切换指法' : undefined"
            @click.stop="toggleVariantsDropdown"
          >
            <span v-if="isActive"> {{ activeVariantIndex + 1 }}/{{ cardData.variantCount }} </span>
            <span v-else> {{ cardData.variantCount }} </span>
          </BaseBadge>

          <div v-marquee class="flex-1 min-w-0">
            <ChordNameDisplay
              :chord="activeChord"
              :shorthand="settingsStore.workbenchChordShorthand"
              class="text-xs font-bold tracking-tight pointer-events-none"
              :class="isActive ? 'text-primary' : 'text-text-body'"
            />
          </div>
        </div>
      </div>
    </ContextMenu>
  </div>
</template>

<script setup lang="ts">
import BaseBadge from '@/components/base/BaseBadge.vue';
import ContextMenu from '@/components/context-menu/ContextMenu.vue';
import type { ContextMenuItem } from '@/components/context-menu/ContextMenuItems.vue';
import ChordNameDisplay from '@/components/fretboard/ChordNameDisplay.vue';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSongStore } from '@/stores/songStore';
import type { Chord, GroupedChordCard } from '@/types';
import { getChordName } from '@/utils/music/musicTheory';
import { Link2, Move, Trash2 } from '@lucide/vue';
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
  (e: 'open-references', cardData: GroupedChordCard): void;
}>();

const editorStore = useChordEditorStore();
const settingsStore = useSettingsStore();
const songStore = useSongStore();

const WHEEL_SWITCH_THRESHOLD = 60;

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

const switchVariant = (newIndex: number) => {
  if (props.isActive) {
    const target = props.cardData.variants[newIndex];
    if (target) editorStore.setEditor(target);
  } else {
    localVariantIndex.value = newIndex;
  }
};

const toggleVariantsDropdown = () => {
  const nextIdx = (activeVariantIndex.value + 1) % props.cardData.variants.length;
  switchVariant(nextIdx);
};

let accumulatedDelta = 0;
let lastWheelTime = 0;

const handleWheelScroll = (e: WheelEvent) => {
  if (!props.cardData.hasVariants) return;
  e.preventDefault();
  e.stopPropagation();

  const now = Date.now();
  if (now - lastWheelTime > 300) accumulatedDelta = 0;
  lastWheelTime = now;

  accumulatedDelta += e.deltaY;
  if (Math.abs(accumulatedDelta) < WHEEL_SWITCH_THRESHOLD) return;

  const step = accumulatedDelta > 0 ? 1 : -1;
  accumulatedDelta = 0;

  const count = props.cardData.variants.length;
  const nextIdx = (activeVariantIndex.value + step + count) % count;
  switchVariant(nextIdx);
};

const menuItems = computed<ContextMenuItem[]>(() => {
  const variantIds = props.cardData.variants.map(v => v.id);
  const hasReferences = songStore.getChordReferences(variantIds).length > 0;
  return [
    {
      label: '移动分组',
      icon: Move,
      action: () => emit('move', activeChord.value),
    },
    {
      label: '引用反查',
      icon: Link2,
      disabled: !hasReferences,
      action: () => emit('open-references', props.cardData),
    },
    {
      label: '删除和弦',
      icon: Trash2,
      danger: true,
      action: () => {
        if (props.cardData.hasVariants) {
          emit('delete-variants', props.cardData);
        } else {
          emit('delete', props.cardData.mainChord);
        }
      },
    },
  ];
});

const ariaLabel = computed(() => {
  const name = getChordName(activeChord.value);
  if (!props.cardData.hasVariants) return `和弦 ${name}`;
  const parts = [`和弦 ${name}`, `共 ${props.cardData.variantCount} 种指法`];
  if (props.isActive) parts.push('已激活，滚轮可切换');
  return parts.join('，');
});
</script>
