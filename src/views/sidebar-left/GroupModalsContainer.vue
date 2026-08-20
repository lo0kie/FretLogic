<template>
  <!-- 1. 新建分组 Modal -->
  <BaseModal v-model:visible="groupModals.modals.create" title="新建分组" @confirm="groupModals.handleCreateGroup">
    <BaseInput
      v-model="groupModals.modalData.inputValue"
      placeholder="请输入分组名称..."
      clearable
      autofocus
      @enter="groupModals.handleCreateGroup"
      :maxlength="15"
    />
  </BaseModal>

  <!-- 2. 重命名分组 Modal -->
  <BaseModal v-model:visible="groupModals.modals.rename" title="修改组名" @confirm="groupModals.handleRenameGroup">
    <BaseInput
      v-model="groupModals.modalData.inputValue"
      placeholder="请输入新名称..."
      autofocus
      clearable
      @enter="groupModals.handleRenameGroup"
      :maxlength="15"
    />
  </BaseModal>

  <!-- 3. 删除分组 Modal -->
  <BaseModal
    v-model:visible="groupModals.modals.delete"
    :title="`删除分组 ${groupModals.modalData.activeGroup?.name}`"
    confirm-type="danger"
    @confirm="groupModals.handleDeleteGroup"
  >
    <p class="modal-description-text">确定要执行此删除操作吗？删除后组内的所有和弦都将清空。</p>
  </BaseModal>

  <!-- 4. 移动分组 Modal -->
  <BaseModal v-model:visible="groupModals.modals.move" title="移动至新分组" @confirm="groupModals.handleMoveChord">
    <div class="move-group-grid no-scrollbar">
      <button
        v-for="group in chordStore.groups"
        :key="group.id"
        v-wave
        v-tooltip="group.id === groupModals.modalData.activeChord?.groupId ? '和弦当前已在此分组中' : ''"
        :disabled="group.id === groupModals.modalData.activeChord?.groupId"
        @click="groupModals.modalData.moveTargetId = group.id"
        class="move-target-btn"
        :class="groupModals.getGroupClass(group.id)"
        :title="group.name"
      >
        <BaseMarquee class="move-marquee">
          <span class="group-btn-text">{{ group.name }}</span>
          <span class="group-count-text">({{ chordStore.groupChordMap.get(group.id)?.length ?? 0 }})</span>
        </BaseMarquee>
      </button>
    </div>
  </BaseModal>

  <!-- 5. 排序配置 Modal -->
  <BaseModal
    v-model:visible="groupModals.modals.sort"
    title="分组和弦排序配置"
    @confirm="groupModals.handleSaveSort"
    width="w-md"
  >
    <div class="sort-modal-body">
      <div class="sort-config-row">
        <label class="config-label">排序规则</label>
        <BaseSegmentedControl v-model="groupModals.modalData.sortRule" :options="SORT_RULE_CONFIG" />
      </div>
      <div class="sort-config-row">
        <label class="config-label">调式设定</label>
        <div class="key-selector-wrapper">
          <BaseSelector
            v-model="groupModals.modalData.sortKey"
            :options="KEY_OPTIONS"
            default-value="C"
            :label-formatter="val => `${val} 调`"
            :disabled="groupModals.modalData.sortRule !== 'KEY_DEGREE'"
          />
        </div>
      </div>
    </div>
  </BaseModal>

  <!-- 6. 多指法和弦删除选择 Modal -->
  <BaseModal
    v-model:visible="groupModals.modals.chordVariantsDelete"
    :title="`删除和弦 &quot;${groupModals.modalData.activeGroupCard?.mainChord.chordName}&quot; 的指法`"
    width="w-large"
    :show-footer="false"
  >
    <div class="variants-delete-modal-content">
      <div class="variants-header-row">
        <p class="modal-description-text">
          请点击选择要删除的指法，共
          <strong class="variants-count-highlight">
            {{ groupModals.modalData.activeGroupCard?.variants.length || 0 }}
          </strong>
          个
        </p>
        <ActionButton :primary="isAllVariantsSelected" @click="handleToggleSelectAllVariants">
          {{ isAllVariantsSelected ? '取消全选' : '全选' }}
        </ActionButton>
      </div>
      <div class="variants-checkbox-list no-scrollbar">
        <div
          v-for="variant in groupModals.modalData.activeGroupCard?.variants"
          :key="variant.id"
          class="variant-checkbox-item"
          :class="{
            'is-selected': groupModals.modalData.selectedVariantIds.has(variant.id),
          }"
          @click="groupModals.toggleVariantSelection(variant.id)"
          @keydown.enter.prevent="groupModals.toggleVariantSelection(variant.id)"
          @keydown.space.prevent="groupModals.toggleVariantSelection(variant.id)"
          role="checkbox"
          :aria-checked="groupModals.modalData.selectedVariantIds.has(variant.id)"
          :aria-label="`指法 Capo ${variant.capo}`"
          tabindex="0"
          data-focusable-inline
          v-wave
        >
          <div class="variant-meta-info">
            <span class="variant-details"> capo {{ variant.capo }} </span>
          </div>
          <div class="variant-preview-thumb">
            <Fretboard
              :bordered="false"
              bg-color="transparent"
              fret-number-size="lg"
              :chord="variant"
              :interactive="false"
              :scale="0.32"
              :is-dark-mode="globalDarkMode"
            />
          </div>
        </div>
      </div>
      <div class="modal-footer-zone custom-footer">
        <ActionButton variant="ghost" @click="groupModals.modals.chordVariantsDelete = false"> 取消 </ActionButton>
        <div class="actions-right-group">
          <ActionButton danger variant="subtle" @click="groupModals.handleDeleteAllVariants()"> 全部删除 </ActionButton>
          <ActionButton
            danger
            :disabled="groupModals.modalData.selectedVariantIds.size === 0"
            @click="groupModals.handleDeleteSelectedVariants()"
          >
            确认删除所选 ({{ groupModals.modalData.selectedVariantIds.size }})
          </ActionButton>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import BaseInput from '@/components/BaseInput.vue';
import BaseMarquee from '@/components/BaseMarquee.vue';
import BaseModal from '@/components/BaseModal.vue';
import BaseSegmentedControl from '@/components/BaseSegmentedControl.vue';
import BaseSelector from '@/components/BaseSelector.vue';
import Fretboard from '@/components/Fretboard.vue';
import { KEY_OPTIONS, SORT_RULE_CONFIG } from '@/utils/musicTheory';
import { useChordGroupModals } from '@/services/useChordGroupModals';
import { useChordStore } from '@/stores/chordStore';
import { globalDarkMode } from '@/stores/globalState';
import { computed } from 'vue';

const props = defineProps<{
  groupModals: ReturnType<typeof useChordGroupModals>;
}>();

const chordStore = useChordStore();

const isAllVariantsSelected = computed(() => {
  const variants = props.groupModals.modalData.activeGroupCard?.variants;

  if (!variants || variants.length === 0) return false;
  return variants.every(v => props.groupModals.modalData.selectedVariantIds.has(v.id));
});

const handleToggleSelectAllVariants = () => {
  const variants = props.groupModals.modalData.activeGroupCard?.variants;

  if (!variants) return;

  if (isAllVariantsSelected.value) {
    props.groupModals.modalData.selectedVariantIds.clear();
  } else {
    variants.forEach(v => props.groupModals.modalData.selectedVariantIds.add(v.id));
  }
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.module';

.modal-description-text {
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.6;
  color: var(--text-body);
  margin: 0;
}

.move-group-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
  overflow-y: auto;
  max-height: 50vh;
  padding: 0.1rem;
  box-sizing: border-box;
}

.move-target-btn {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border-radius: @radius-md;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid var(--border-base);
  display: flex;
  align-items: center;
  min-width: 0;
  box-sizing: border-box;
  cursor: pointer;
  transition: @transition-fast;

  &.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background-color: var(--bg-main);
    border-color: var(--border-light);
    color: var(--text-disabled);
    :global(.dark) & {
      background-color: rgba(255, 255, 255, 0.05);
      color: rgba(255, 255, 255, 0.4);
    }
  }

  &.is-selected {
    background-color: var(--color-primary);
    color: #ffffff;
    border-color: var(--color-primary);
    transform: scale(1.02);
  }

  &:active:not(.is-disabled) {
    transform: scale(0.95);
  }

  &.is-normal {
    background-color: var(--bg-body);
    color: var(--text-body);

    &:hover {
      border-color: @primary;
      background-color: var(--bg-panel-hover);
    }
  }
}

.move-marquee {
  min-width: 0;
  width: 100%;

  .group-btn-text {
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-count-text {
    font-size: 0.65rem;
    font-weight: 600;
    opacity: 0.65;
    white-space: nowrap;
    font-family: monospace;
  }
}

.sort-modal-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.2rem 0;
}

.sort-config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.config-label {
  width: 4.2rem;
  flex-shrink: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-title);
  white-space: nowrap;
}

.key-selector-wrapper {
  width: 8rem;
  flex-shrink: 0;
}

.variants-delete-modal-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.variants-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.variants-checkbox-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: 1rem;
  max-height: 52vh;
  overflow-y: auto;
  padding: 0.15rem;
  box-sizing: border-box;
}

.variant-checkbox-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.65rem 0.5rem 0.55rem;
  background-color: var(--bg-body);
  border: 1.5px solid var(--border-light);
  border-radius: @radius-md;
  cursor: pointer;
  user-select: none;
  transition:
    background-color @duration-fast ease,
    border-color @duration-fast ease,
    box-shadow @duration-fast ease,
    transform @duration-fast ease;
  box-sizing: border-box;
  outline: none;
  min-width: 0;

  &:hover {
    border-color: var(--border-base);
    background-color: var(--bg-panel-hover);
    transform: translateY(-1px);
  }

  &:active {
    transform: scale(0.98);
  }

  &.is-selected {
    border-color: var(--color-danger);
    background-color: color-mix(in srgb, var(--color-danger), transparent 90%);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-danger), transparent 50%);
  }

  :deep(*) {
    cursor: inherit !important;
    pointer-events: inherit !important;
  }
}

.variants-count-highlight {
  color: var(--color-danger);
  font-weight: 700;
}

.variant-preview-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 0.5rem 0.25rem;
  pointer-events: none;
  box-sizing: border-box;
}

.variant-meta-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  min-width: 0;

  .variant-details {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-body);
    text-align: center;
    line-height: 1.3;
  }
}

.custom-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 0 0.1rem;
  border-top: 1px solid var(--border-light);
  margin-top: 0.15rem;
}

.actions-right-group {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-shrink: 0;
}

@media (max-width: 768px) {
  .variants-checkbox-list {
    gap: 0.8rem;
  }
}
</style>
