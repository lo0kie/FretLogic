<template>
  <BaseModal
    v-model:visible="visibleModel"
    title="选择要绑定的和弦"
    :show-footer="false"
    class="chord-picker-modal"
    width="w-wide"
  >
    <div class="chord-picker-wrapper no-scrollbar" ref="scrollWrapperRef">
      <div class="picker-header-bar">
        <div class="header-controls-left">
          <BaseInput
            v-model="pickerSearchQuery"
            placeholder="搜索和弦..."
            clearable
            size="sm"
            autofocus
            fontSize="xs"
            class="picker-search-input"
            aria-label="搜索和弦"
          >
            <template #prefix>
              <Search class="search-icon" :size="14" stroke-width="2.5" aria-hidden="true" />
            </template>
          </BaseInput>

          <BaseSegmentedControl
            v-model="sortOverride"
            size="sm"
            :options="SORT_RULE_CONFIG"
            @update:model-value="handleSortRuleChange"
          />

          <BaseSelector
            v-if="sortOverride === 'KEY_DEGREE'"
            v-model="tempSortKey"
            size="sm"
            :options="KEY_OPTIONS"
            default-value="C"
            :label-formatter="val => `${val} 调`"
            class="picker-key-selector"
            width="sm"
            @update:model-value="handleSortKeyChange"
          />
        </div>

        <div class="header-controls-right">
          <ActionButton size="sm" variant="subtle" @click="goToWorkbenchToCreate">
            <template #prefix><Plus :size="14" stroke-width="2.5" aria-hidden="true" /></template>
            新建和弦
          </ActionButton>
        </div>
      </div>

      <div class="picker-toolbar">
        <div class="group-select-tabs no-scrollbar">
          <BaseSegmentedControl
            v-model="selectedGroupId"
            :options="groupTabOptions"
            @update:model-value="handleGroupTabChange"
          />
        </div>
      </div>

      <EmptyState v-if="filteredChords.length === 0" description="当前搜索或分组下暂无匹配和弦。" size="lg" />

      <div v-else class="picker-cards-grid-4cols" role="group" aria-label="和弦选择列表">
        <div
          v-wave
          v-for="chord in filteredChords"
          :key="chord.id"
          :ref="el => setCardObserverRef(el, chord.id)"
          role="button"
          :tabindex="isCurrentBound(chord) ? -1 : 0"
          :aria-pressed="isCurrentBound(chord)"
          :aria-disabled="isCurrentBound(chord)"
          :aria-label="`和弦 ${chord.chordName}${isCurrentBound(chord) ? '（当前已绑定）' : ''}`"
          class="picker-chord-card"
          :class="{ 'is-current-bound': isCurrentBound(chord) }"
          @click="!isCurrentBound(chord) && handleSelectChord(chord)"
          @keydown.enter.prevent="!isCurrentBound(chord) && handleSelectChord(chord)"
          @keydown.space.prevent="!isCurrentBound(chord) && handleSelectChord(chord)"
        >
          <span class="card-name">{{ chord.chordName }}</span>

          <Fretboard
            v-if="visibleMap[chord.id]"
            :chord="chord"
            :ref="el => setFretboardMeasureRef(el, chord.fretCount)"
            :interactive="false"
            :scale="PICKER_FRETBOARD_SCALE"
            :is-dark-mode="settingsStore.isDarkMode"
          />
          <div v-else :style="getCalculatedOrCachedSize(chord.fretCount)" />
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script lang="ts">
// 模块级单例缓存：所有 ChordPickerModal 实例共享同一份指板尺寸测量结果
const fretboardSizeCache = reactive<Record<number, { width: string; height: string }>>({});
</script>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseInput from '@/components/BaseInput.vue';
import BaseModal from '@/components/BaseModal.vue';
import BaseSegmentedControl, { type SegmentOption } from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import EmptyState from '@/components/EmptyState.vue';
import Fretboard from '@/components/Fretboard.vue';
import { KEY_OPTIONS, PICKER_FRETBOARD_SCALE, SORT_RULE_CONFIG } from '@/constants';
import { useScoreLinesData } from '@/services/useScoreLinesData';
import { useChordStore } from '@/stores/chordStore';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, GroupSortRule } from '@/types';
import { getPlaceholderSize } from '@/utils/fretboardVisuals';
import { sortChordsByRule } from '@/utils/musicTheory';
import { Plus, Search } from '@lucide/vue';
import { refDebounced } from '@vueuse/core';
import { computed, onBeforeUnmount, reactive, ref, useTemplateRef, watch, type ComponentPublicInstance } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
}>();

const visibleModel = computed({
  get: () => props.visible,
  set: val => emit('update:visible', val),
});

const router = useRouter();
const uiStore = useUiStore();
const chordStore = useChordStore();
const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const { chordsLookupMap } = useScoreLinesData();

const scrollWrapperRef = useTemplateRef<HTMLElement>('scrollWrapperRef');
const visibleMap = reactive<Record<string, boolean>>({});

// 每张卡片自己的 IntersectionObserver 实例，触发一次后立刻停止并从这里移除
const cardObservers = new Map<string, IntersectionObserver>();

const setCardObserverRef = (el: Element | ComponentPublicInstance | null, chordId: string) => {
  if (!el) {
    // 卡片从 DOM 移除（比如筛选后不再展示），清理掉对应的 observer
    cardObservers.get(chordId)?.disconnect();
    cardObservers.delete(chordId);
    return;
  }

  // 这里绑定的固定是原生 div，不会是组件实例，但类型层面仍需按联合类型收窄
  const domEl = (el as ComponentPublicInstance)?.$el ?? el;
  if (!(domEl instanceof HTMLElement)) return;

  if (visibleMap[chordId] || cardObservers.has(chordId)) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        visibleMap[chordId] = true;
        observer.disconnect();
        cardObservers.delete(chordId);
      }
    },
    { root: scrollWrapperRef.value }
  );

  observer.observe(domEl);
  cardObservers.set(chordId, observer);
};

const clearAllCardObservers = () => {
  cardObservers.forEach(observer => observer.disconnect());
  cardObservers.clear();
};

const setFretboardMeasureRef = (el: Element | ComponentPublicInstance | null, fretCount: number) => {
  if (!el || fretboardSizeCache[fretCount]) return;

  const domEl = (el as ComponentPublicInstance)?.$el ?? el;
  if (!(domEl instanceof HTMLElement)) return;

  const rect = domEl.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    fretboardSizeCache[fretCount] = {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    };
  }
};

const getCalculatedOrCachedSize = (fretCount: number) => {
  if (fretboardSizeCache[fretCount]) return fretboardSizeCache[fretCount];

  const coreSize = getPlaceholderSize(fretCount, PICKER_FRETBOARD_SCALE);
  const coreHeight = parseFloat(coreSize.height);
  const calculatedSize = { width: `100%`, height: `${coreHeight}px` };

  fretboardSizeCache[fretCount] = calculatedSize;
  return calculatedSize;
};

const selectedGroupId = ref<string>('ALL');
const pickerSearchQuery = ref<string>('');

const debouncedPickerQuery = refDebounced(pickerSearchQuery, 150);

const sortOverride = ref<GroupSortRule>('ROOT_PITCH');
const tempSortKey = ref<string>('C');

/** 用户手动切换分组/排序时保存的状态；null 表示尚未手动操作过 */
const savedUserPickerState = ref<{
  groupId: string;
  sortRule: GroupSortRule;
  sortKey: string;
} | null>(null);

const groupTabOptions = computed<SegmentOption<string>[]>(() => {
  const options: SegmentOption<string>[] = [{ label: '全部和弦', value: 'ALL' }];
  chordStore.groups.forEach(g => {
    options.push({ label: g.name, value: g.id });
  });
  return options;
});

/** 纯函数：根据 groupId 计算该分组的默认排序规则，不产生副作用 */
const getDefaultSortForGroup = (groupId: string): { sortRule: GroupSortRule; sortKey: string } => {
  if (groupId === 'ALL') return { sortRule: 'ROOT_PITCH', sortKey: 'C' };
  const targetGroup = chordStore.groups.find(g => g.id === groupId);
  return {
    sortRule: targetGroup?.sortRule || 'ROOT_PITCH',
    sortKey: targetGroup?.sortKey || 'C',
  };
};

/** 显式保存当前分组+排序状态（仅在用户手动操作时调用） */
const saveUserPickerState = () => {
  savedUserPickerState.value = {
    groupId: selectedGroupId.value,
    sortRule: sortOverride.value,
    sortKey: tempSortKey.value,
  };
};

/** 用户手动点击分组 Tab */
const handleGroupTabChange = (newGid: string) => {
  selectedGroupId.value = newGid;
  const { sortRule, sortKey } = getDefaultSortForGroup(newGid);
  sortOverride.value = sortRule;
  tempSortKey.value = sortKey;
  saveUserPickerState();
};

/** 用户手动调整排序方式 */
const handleSortRuleChange = (newRule: GroupSortRule) => {
  sortOverride.value = newRule;
  saveUserPickerState();
};

/** 用户手动调整调性 */
const handleSortKeyChange = (newKey: string) => {
  tempSortKey.value = newKey;
  saveUserPickerState();
};

/** 切换乐谱时，记忆状态重新初始化 */
watch(
  () => scoreEditor.activeSongId,
  () => {
    savedUserPickerState.value = null;
  }
);

/** 弹窗打开逻辑：两条分支各自独立赋值，互不依赖，不依赖任何联动 watcher */
watch(
  () => props.visible,
  val => {
    if (!val) return;

    pickerSearchQuery.value = '';
    Object.keys(fretboardSizeCache).forEach(key => delete fretboardSizeCache[Number(key)]);
    clearAllCardObservers();

    const currentSlotKey = scoreEditor.selectedSlotKey;
    const boundChordId = currentSlotKey !== null ? scoreEditor.activeSong?.chordMap[currentSlotKey] : null;
    const boundChord = boundChordId ? chordsLookupMap.value.get(boundChordId) : null;

    if (boundChord && boundChord.groupId) {
      // 场景 1：点击有和弦的文字 → 分组=和弦分组，排序=分组默认排序，不写入记忆状态
      selectedGroupId.value = boundChord.groupId;
      const { sortRule, sortKey } = getDefaultSortForGroup(boundChord.groupId);
      sortOverride.value = sortRule;
      tempSortKey.value = sortKey;
    } else if (savedUserPickerState.value) {
      // 场景 2a：点击无和弦的文字，且有记忆状态 → 恢复记忆
      selectedGroupId.value = savedUserPickerState.value.groupId;
      sortOverride.value = savedUserPickerState.value.sortRule;
      tempSortKey.value = savedUserPickerState.value.sortKey;
    } else {
      // 场景 2b：点击无和弦的文字，首次进入 → 默认 ALL + ROOT_PITCH/C
      selectedGroupId.value = 'ALL';
      sortOverride.value = 'ROOT_PITCH';
      tempSortKey.value = 'C';
    }
  }
);

const currentBoundChordId = computed(() => {
  if (scoreEditor.selectedSlotKey === null || !scoreEditor.activeSong?.chordMap) return null;
  return scoreEditor.activeSong.chordMap[scoreEditor.selectedSlotKey] || null;
});

const isCurrentBound = (chord: Chord) => {
  const boundId = currentBoundChordId.value;
  if (!boundId) return false;
  return chord.id === boundId || chord.fingerprint === boundId;
};

const filteredChords = computed(() => {
  let list =
    selectedGroupId.value === 'ALL'
      ? chordStore.savedChordsList
      : chordStore.savedChordsList.filter(c => c.groupId === selectedGroupId.value);

  const query = debouncedPickerQuery.value.trim().toLowerCase();
  if (query) {
    list = list.filter(c => c.chordName.toLowerCase().includes(query));
  }

  const activeGroup = chordStore.groups.find(g => g.id === selectedGroupId.value);
  const effectiveKey = sortOverride.value === 'KEY_DEGREE' ? tempSortKey.value : activeGroup?.sortKey;

  return sortChordsByRule(list, sortOverride.value, effectiveKey);
});

const handleSelectChord = (chord: Chord) => {
  if (scoreEditor.selectedSlotKey !== null && scoreEditor.activeSong) {
    scoreEditor.setSlotChord(scoreEditor.selectedSlotKey, chord);
  }
  visibleModel.value = false;
};

const goToWorkbenchToCreate = () => {
  visibleModel.value = false;
  router.push('/');
  uiStore.toast.info('请在工作台创建和弦，保存后即可在乐谱中使用');
};

onBeforeUnmount(() => {
  clearAllCardObservers();
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

:deep(.chord-picker-modal .modal-card) {
  width: 56rem !important;
  max-width: 95vw;
}

.chord-picker-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  max-height: 68vh;
  overflow-y: auto;
}

.picker-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.header-controls-left {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  gap: 0.8rem;
}

.header-controls-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.picker-search-input {
  width: 100%;
  max-width: 14rem;
}

.search-icon {
  color: var(--text-disabled);
}

.picker-key-selector {
  width: 5.5rem;
}

.picker-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--border-light);
  padding-bottom: 0.6rem;
}

.group-select-tabs {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  overflow-x: auto;
  padding: 0.1rem;
}

.picker-cards-grid-4cols {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.85rem;
}

.picker-chord-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.6rem;
  background-color: var(--bg-body);
  border: 1px solid var(--border-light);
  border-radius: @radius-md;
  cursor: pointer;
  transition: @transition-fast;
  outline: none;

  :deep(*) {
    cursor: inherit !important;
    pointer-events: inherit !important;
  }

  &:hover,
  &:focus-visible {
    border-color: var(--color-primary);
    transform: translateY(-2px);
    box-shadow: @shadow-md;
  }

  &:focus-visible {
    box-shadow: @focus-ring-primary;
  }

  &.is-current-bound {
    background-color: color-mix(in srgb, @primary, transparent 88%);
    border-color: @primary;
    box-shadow: @focus-ring-primary;
    cursor: default !important;
    pointer-events: none !important;

    .card-name {
      color: @primary;
    }
  }
}

.card-name {
  font-size: 0.8rem;
  font-weight: 800;
  line-height: 1.2rem;
  height: 1.2rem;
  color: var(--text-title);
  margin-bottom: 0.25rem;
}
</style>
