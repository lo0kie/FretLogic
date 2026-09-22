<template>
  <div class="w-full">
    <div
      v-action-card
      v-wave
      v-scroll-into-view.y.once="selected"
      :aria-label
      :aria-pressed="selected"
      :class="
        selected
          ? 'border-tint-primary-45 bg-tint-primary-92 shadow-[0_0_0_1px_rgba(var(--color-primary-rgb),0.25)] hover:border-primary hover:bg-tint-primary-80 hover:shadow-[0_0_0_1px_rgba(var(--color-primary-rgb),0.4)] active:border-tint-primary-45 active:bg-tint-primary-92'
          : menuTarget
            ? 'border-border-base bg-surface-panel-hover active:border-border-base active:bg-surface-panel-hover'
            : 'border-border-light bg-surface-body hover:border-border-base hover:bg-surface-panel-hover active:border-border-base active:bg-surface-panel-hover'
      "
      :data-chord-id="cardData.mainChord.id"
      :data-variant-index="activeVariantIndex"
      :title="getChordName(activeChord, { shorthand: settingsStore.workbenchChordShorthand })"
      @click="handleCardClick()"
      data-focusable-outline
      class="chord-thumb-card relative flex h-[2.2rem] w-full cursor-pointer items-center justify-between rounded-md border px-2 transition-all duration-fast outline-none"
    >
      <!-- 本组件不持有右键菜单：菜单已改为按分组委托（见 GroupSection），卡片只声明
           data-chord-id / data-variant-index 供委托方反查目标。

           ⚠️ 外层那层 .w-full 容器（组件根）不能省、也不能把卡片本体提为根：
           ① 分组网格的 TransitionGroup 要求子组件是单一元素根，容器满足这一点；
           ② 过渡机制会把过渡钩子下推到子组件的**根元素**上（renderComponentRoot 把组件 vnode
              上的钩子写到根元素 vnode），而卡片本体自带 transition-all 与 selected / menu-target
              / hover 一整套状态类 —— 它当根时这些过渡产物直接落在卡片上，表现为「从乐谱切回
              工作台（KeepAlive 激活）时展开组里的卡片集体动一次」。
           本条注释也必须留在根元素**内部**：根元素之前若有注释，dev 模式下注释会被保留成 vnode，
           根随即退化为 fragment —— 那会让本组件在 TransitionGroup 里失去过渡动画，且 attrs
           无法继承（实测：注释在根元素之前会编译出 _Fragment 根，写在元素内部则不会）。 -->
      <BaseBadge
        v-if="cardData.hasVariants"
        :title="variantBadgeTitle"
        :variant="selected ? 'primary' : 'neutral'"
        @click.stop="toggleVariantsDropdown()"
        data-ring-punchout
        appearance="filled"
        class="absolute -top-1 -right-1 z-card cursor-pointer border border-surface-body shadow-sm transition-all duration-fast ease-bounce"
        size="2xs"
      >
        <BaseRollingText
          v-if="selected"
          :text="`${activeVariantIndex + 1}/${cardData.variantCount}`"
          class="tabular-nums"
        />
        <BaseRollingText v-else :text="`${cardData.variantCount}`" class="tabular-nums" />
      </BaseBadge>

      <!-- 触发宿主委托给整张卡（.chord-thumb-card）：和弦名只占卡内一条，与乐谱卡同一套做法 -->
      <div v-marquee.fade="{ trigger: '.chord-thumb-card' }" class="min-w-0 flex-1">
        <span
          v-chord-name="{ chord: activeChord, shorthand: settingsStore.workbenchChordShorthand }"
          :class="selected ? 'text-primary' : 'text-fg-body'"
          class="pointer-events-none text-xs font-bold tracking-tight"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import BaseRollingText from '@/platform/ui/rolling-text/BaseRollingText.vue';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { useSettingsStore } from '@/platform/store/settingsStore';

import type { Chord, GroupedChordCard } from '@/domains/chord/types';

const props = defineProps<{
  cardData: GroupedChordCard;
  /** 本卡是否为当前右键菜单的目标：菜单已改由 GroupSection 委托持有，卡片只承接这一项样式 */
  menuTarget?: boolean;
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

/** 本卡是否为「当前编辑中」：草稿命中本卡任一变体，或编辑中且同名同组（草稿尚未落库时按名匹配）。
 *  判定归卡片自己（与乐谱列表的 SongCard 同口径）—— 此前由列表算出主卡 id 再下发，
 *  且每次判定都要扫一遍组内所有卡片、对每张取一次和弦名。 */
const selected = computed(() => {
  const draft = editorStore.draftChord;
  if (draft.id && props.cardData.variants.some(v => v.id === draft.id)) return true;
  if (!editorStore.isEditing) return false;
  const draftName = getChordName(draft).trim().toLowerCase();
  return (
    Boolean(draftName) &&
    props.cardData.mainChord.groupId === draft.groupId &&
    getChordName(props.cardData.mainChord).trim().toLowerCase() === draftName
  );
});

const localVariantIndex = ref(0);

const activeVariantIndex = computed(() => {
  if (selected.value) {
    const idx = props.cardData.variants.findIndex(v => v.id === editorStore.draftChord.id);
    return idx >= 0 ? idx : localVariantIndex.value;
  }
  return localVariantIndex.value;
});

/** 指法徽标悬停提示：当前展示的第几个指法 */
const variantBadgeTitle = computed(() =>
  selected.value
    ? `第 ${activeVariantIndex.value + 1}/${props.cardData.variantCount} 指法`
    : `${props.cardData.variantCount} 个指法`
);

const activeChord = computed(() => props.cardData.variants[activeVariantIndex.value] ?? props.cardData.mainChord);

/** 用户点击和弦卡：选中当前展示的指法 */
const handleCardClick = () => void emit('select', activeChord.value);

/** 切换到指定下标的指法：激活卡片直接更新编辑器草稿，非激活卡仅切换本地预览 */
const switchVariant = (newIndex: number) => {
  if (selected.value) {
    const target = props.cardData.variants[newIndex];
    if (target) editorStore.setEditor(target);
  } else localVariantIndex.value = newIndex;
};

/** 用户点击计数徽标：循环切换到下一个指法 */
const toggleVariantsDropdown = () => {
  const nextIdx = (activeVariantIndex.value + 1) % props.cardData.variants.length;
  switchVariant(nextIdx);
};

const ariaLabel = computed(() => {
  const name = getChordName(activeChord.value);
  if (!props.cardData.hasVariants) return `和弦 ${name}`;
  return `和弦 ${name}，共 ${props.cardData.variantCount} 种指法`;
});
</script>
