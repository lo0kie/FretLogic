<template>
  <div class="w-full">
    <div
      v-action-card
      v-wave
      v-scroll-into-view.y.delay-220="selected"
      :aria-label
      :aria-pressed="selected"
      :class="
        selected
          ? 'border-tint-primary-45 bg-tint-primary-92 hover:border-primary hover:bg-tint-primary-80 active:border-tint-primary-45 active:bg-tint-primary-92'
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
      <!-- 选中态**只留一条描边**：原先还叠了一圈 `shadow-[0_0_0_1px_rgba(...,0.25)]` 的纯扩散发丝边，
           而它紧贴 `border` 外沿（扩散 0px），两条 1px 线之间没有任何间隙 —— 观感就是「选中的卡片
           有两个外边框」（乐谱列表的 SongCard 同一处同因同改）。选中语义由边框色 + 淡底色 + 和弦名
           字色共同承担，不缺这一圈；悬停的加强改为只提边框色与底色。 -->
      <!-- 选中即把本卡滚入视口：**不能加 .once**（.once 只认挂载那一刻的激活态，分组已展开时
           从搜索框选中本卡不会有任何定位动作），也**必须 .delay-220**（= 折叠体高度过渡时长，
           与设置弹层各分组头同一口径）。两条都是为了不被同一个分组头上的
           `v-scroll-into-view.y.settle.gap-sm` 顶走：分组行在激活时（以及 settle 的首次
           ResizeObserver 回调去抖 150ms 后）会平滑滚到分组头，而卡片挂载 / 激活的定位若先落地，
           随后的分组行滚动就会把视口拉回分组头 —— 表现为「卡片刚定位好又被折叠面板拉回」。
           延迟到过渡结束再定位，既量到稳定布局，也保证这一次定位是最后落地的那个。 -->
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
      <!-- 选中态改走 filled 实底：此前刻意避开 filled 的理由已失效 —— 那版 filled 配
           --text-on-accent（为过「强调色上的文字」对比度门禁、三主题统一取深墨），落在这样一枚
           小微角标上就是一撮黑字；现在 filled 一律走 `bg-<色>-solid` + `--text-on-solid`
           （实心档上的浅色字，过 AA），见 BaseBadge 的 VARIANT_APPEARANCE_MAP 注释。
           未选中档仍是 filled + neutral 的灰实底：它压在缩略图角上，需要实底的边界感才不糊，
           选中时换成 primary 实底（同一枚角标由灰转蓝），不必另换一档形态。 -->
      <BaseBadge
        v-if="cardData.hasVariants"
        :color="selected ? 'primary' : 'neutral'"
        :title="variantBadgeTitle"
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
import { nameKeyOf } from '@/domains/chord/theory/chordIdentity';
import { getChordName } from '@/domains/chord/theory/theory';
import { useSettingsStore } from '@/platform/store/settingsStore';

import type { Chord, GroupedChordCard } from '@/domains/chord/types';

const props = defineProps<{
  cardData: GroupedChordCard;
  /** 本卡是否为当前右键菜单的目标：菜单已改由 GroupSection 委托持有，卡片只承接这一项样式 */
  menuTarget?: boolean;
}>();

/**
 * 只保留 select：delete / move / delete-variants / open-references 四个事件此前由卡片自己抛，
 * 右键菜单改由 GroupSection 的列表级委托持有后卡片不再抛它们（见 props.menuTarget 的说明）——
 * 声明留着只会让调用方以为挂上 `@move` 就能收到事件，而它永远不会触发。
 */
const emit = defineEmits<{
  (e: 'select', chord: Chord): void;
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
  // 草稿必须传**字符串**：nameKeyOf 对对象走按引用缓存，而草稿是加载时 cloneDeep 出来、
  // 之后每次编辑都在原地改的那一份，缓存会把首次算出的键永久钉死（见 chordIdentity 的 nameKeyCache 注释）
  const draftName = nameKeyOf(getChordName(draft));
  return (
    Boolean(draftName) &&
    props.cardData.mainChord.groupId === draft.groupId &&
    nameKeyOf(props.cardData.mainChord) === draftName
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
