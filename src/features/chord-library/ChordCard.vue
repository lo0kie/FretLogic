<template>
  <div class="box-border w-full">
    <ContextMenu :items="menuItems" #="{ isOpen }">
      <div :title="getChordName(activeChord, { shorthand: settingsStore.workbenchChordShorthand })" class="w-full">
        <div
          v-wave
          :aria-label
          :aria-pressed="isActive"
          :class="{
            'bg-tint-primary-92! border-tint-primary-45! hover:bg-tint-primary-80! hover:border-primary! shadow-[0_0_0_1px_rgba(var(--color-primary-rgb),0.25)] hover:shadow-[0_0_0_1px_rgba(var(--color-primary-rgb),0.4)]':
              isActive,
            'bg-bg-panel-hover border-border-base': isOpen,
          }"
          @click="handleCardClick"
          @keydown.enter.prevent.stop="handleCardClick"
          @keydown.space.prevent.stop="handleCardClick"
          @wheel="handleWheelScroll"
          class="duration-fast bg-bg-body border-border-light hover:bg-bg-panel-hover hover:border-border-base active:bg-bg-panel-hover active:border-border-base relative box-border flex h-[2.2rem] w-full cursor-pointer items-center justify-between rounded-md border px-2 transition-all outline-none"
          data-focusable-inline
          role="button"
          tabindex="0"
        >
          <BaseBadge
            v-if="cardData.hasVariants"
            :title="isActive ? '滚轮切换指法' : undefined"
            :variant="isActive ? 'primary' : 'neutral'"
            @click.stop="toggleVariantsDropdown"
            appearance="filled"
            class="z-card border-bg-body duration-fast ease-bounce absolute -top-1.5 -right-1.5 cursor-pointer border shadow-sm transition-all"
            size="xs"
          >
            <span v-if="isActive"> {{ activeVariantIndex + 1 }}/{{ cardData.variantCount }} </span>
            <span v-else> {{ cardData.variantCount }} </span>
          </BaseBadge>

          <div v-marquee class="min-w-0 flex-1">
            <span
              v-chord-name="{ chord: activeChord, shorthand: settingsStore.workbenchChordShorthand }"
              :class="isActive ? 'text-primary' : 'text-text-body'"
              class="pointer-events-none text-xs font-bold tracking-tight"
            />
          </div>
        </div>
      </div>
    </ContextMenu>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';

import BaseBadge from '@/components/ui/BaseBadge.vue';
import ContextMenu from '@/components/ui/context-menu/ContextMenu.vue';
import type { ContextMenuItem } from '@/components/ui/context-menu/ContextMenuItems.vue';
import { getChordName } from '@/services/music/theory';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useSongStore } from '@/stores/songStore';
import type { Chord, GroupedChordCard } from '@/types';

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

/** 用户点击和弦卡：选中当前展示的指法 */
const handleCardClick = () => {
  emit('select', activeChord.value);
};

/** 切换到指定下标的指法：激活卡片直接更新编辑器草稿，非激活卡仅切换本地预览 */
const switchVariant = (newIndex: number) => {
  if (props.isActive) {
    const target = props.cardData.variants[newIndex];
    if (target) editorStore.setEditor(target);
  } else {
    localVariantIndex.value = newIndex;
  }
};

/** 用户点击计数徽标：循环切换到下一个指法 */
const toggleVariantsDropdown = () => {
  const nextIdx = (activeVariantIndex.value + 1) % props.cardData.variants.length;
  switchVariant(nextIdx);
};

let accumulatedDelta = 0;
let lastWheelTime = 0;

/** 滚轮在卡片上累积 deltaY，超过阈值按方向切换上一个/下一个指法（300ms 无滚动则重新累积） */
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
      icon: 'move',
      action: () => emit('move', activeChord.value),
    },
    {
      label: '引用反查',
      icon: 'link-2',
      disabled: !hasReferences,
      action: () => emit('open-references', props.cardData),
    },
    {
      label: '删除和弦',
      icon: 'trash-2',
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
