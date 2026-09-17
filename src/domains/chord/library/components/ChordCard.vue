<template>
  <div class="w-full">
    <BaseMenu #="{ isOpen }" :items="menuItems" trigger="contextmenu">
      <!-- 和弦库分组内的和弦卡片跟随简写设置（其余场景一律完整名） -->
      <div :title="getChordName(activeChord, { shorthand: settingsStore.workbenchChordShorthand })" class="w-full">
        <div
          v-action-card
          v-wave
          :aria-label
          :aria-pressed="isActive"
          :class="{
            'border-tint-primary-45! bg-tint-primary-92! shadow-[0_0_0_1px_rgba(var(--color-primary-rgb),0.25)] hover:border-primary! hover:bg-tint-primary-80! hover:shadow-[0_0_0_1px_rgba(var(--color-primary-rgb),0.4)]':
              isActive,
            'border-border-base bg-surface-panel-hover': isOpen,
          }"
          @click="handleCardClick()"
          data-focusable-inline
          class="chord-thumb-card relative flex h-[2.2rem] w-full cursor-pointer items-center justify-between rounded-md border border-border-light bg-surface-body px-2 transition-all duration-fast outline-none hover:border-border-base hover:bg-surface-panel-hover active:border-border-base active:bg-surface-panel-hover"
        >
          <BaseBadge
            v-if="cardData.hasVariants"
            :title="variantBadgeTitle"
            :variant="isActive ? 'primary' : 'neutral'"
            @click.stop="toggleVariantsDropdown()"
            appearance="filled"
            class="absolute -top-1 -right-1 z-card cursor-pointer border border-surface-body shadow-sm transition-all duration-fast ease-bounce"
            size="2xs"
          >
            <BaseRollingText
              v-if="isActive"
              :text="`${activeVariantIndex + 1}/${cardData.variantCount}`"
              class="tabular-nums"
            />
            <BaseRollingText v-else :text="`${cardData.variantCount}`" class="tabular-nums" />
          </BaseBadge>

          <div v-marquee.fade class="min-w-0 flex-1">
            <span
              v-chord-name="{ chord: activeChord, shorthand: settingsStore.workbenchChordShorthand }"
              :class="isActive ? 'text-primary' : 'text-fg-body'"
              class="pointer-events-none text-xs font-bold tracking-tight"
            />
          </div>
        </div>
      </div>
    </BaseMenu>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';

import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import BaseMenu from '@/platform/ui/menu/BaseMenu.vue';
import BaseRollingText from '@/platform/ui/rolling-text/BaseRollingText.vue';
import { CHORD_REFERENCE_LOOKUP } from '@/domains/chord/library/injectionKeys';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { useChordTransfer } from '@/domains/chord/transfer/useChordTransfer';
import { useSettingsStore } from '@/platform/store/settingsStore';

import type { Chord, GroupedChordCard } from '@/domains/chord/types';
import type { MenuItem } from '@/platform/ui/menu/types';

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
const { copyChordCardText, shareChordLink } = useChordTransfer();
// 引用反查能力由应用层注入（桥接乐谱域）；未注入时按无引用处理
const lookupChordReferences = inject(CHORD_REFERENCE_LOOKUP, () => 0);

const localVariantIndex = ref(0);

const activeVariantIndex = computed(() => {
  if (props.isActive) {
    const idx = props.cardData.variants.findIndex(v => v.id === editorStore.draftChord.id);
    return idx >= 0 ? idx : localVariantIndex.value;
  }
  return localVariantIndex.value;
});

/** 指法徽标悬停提示：当前展示的第几个指法 */
const variantBadgeTitle = computed(() =>
  props.isActive
    ? `第 ${activeVariantIndex.value + 1}/${props.cardData.variantCount} 指法`
    : `${props.cardData.variantCount} 个指法`
);

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

const menuItems = computed<MenuItem[]>(() => {
  const variantIds = props.cardData.variants.map(v => v.id);
  const hasReferences = lookupChordReferences(variantIds) > 0;
  // 复制：多指法时展开为级联子菜单逐指法复制，单指法不展开直接复制当前展示的指法

  return [
    {
      label: '复制和弦',
      icon: 'copy',
      expandChildren: props.cardData.hasVariants,
      action: () => void copyChordCardText(activeChord.value),
      children: props.cardData.variants.map((variant, index) => ({
        label: `指法 ${index + 1}`,
        icon: 'copy',
        action: () => void copyChordCardText(variant),
      })),
    },
    {
      // 分享：单指法直接分享当前展示的指法，多指法与「复制和弦」一致展开逐个分享
      label: '分享和弦',
      icon: 'share-2',
      expandChildren: props.cardData.hasVariants,
      action: () => void shareChordLink(activeChord.value),
      children: props.cardData.variants.map((variant, index) => ({
        label: `指法 ${index + 1}`,
        icon: 'share-2',
        action: () => void shareChordLink(variant),
      })),
    },
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
  return `和弦 ${name}，共 ${props.cardData.variantCount} 种指法`;
});
</script>
