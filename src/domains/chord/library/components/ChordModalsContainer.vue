<template>
  <BaseModal v-model:visible="groupModals.modals.move" @confirm="groupModals.handleMoveChord" title="移动至新分组">
    <BaseScrollArea
      v-grid-nav="3"
      :fade="false"
      :scrollbar="false"
      axis="y"
      class="grid max-h-[50vh] grid-cols-3 gap-md"
    >
      <!-- 选中态用 tint 浅底 + 强调色文字（本项目通用选中态写法），不用实心 bg-primary：
           实心底会把文字送到 --text-on-accent 上，而该令牌为过「强调色上的文字」对比度门禁已三主题
           统一取深墨，饱和蓝配纯黑过于刺眼。计数此前恒为 text-fg-disabled（浅灰），在实心蓝上是
           2.4:1、在浅底上只有 1.4:1，故选中时一并改用 text-primary。 -->
      <button
        v-wave
        v-for="group in chordStore.groups"
        v-tooltip="group.id === groupModals.modalData.activeChord?.groupId ? '和弦当前已在此分组中' : ''"
        :class="[
          groupModals.modalData.moveTargetId === group.id
            ? 'scale-[1.02] border-primary bg-tint-primary-88 text-primary'
            : 'bg-surface-body text-fg-body hover:border-primary hover:bg-surface-panel-hover active:scale-95',
        ]"
        :disabled="group.id === groupModals.modalData.activeChord?.groupId"
        :key="group.id"
        :title="group.name"
        @click="groupModals.modalData.moveTargetId = group.id"
        data-focusable-outline
        class="flex w-full min-w-0 cursor-pointer items-center rounded-md border border-border-base p-md text-xs font-bold transition-all duration-fast disabled:cursor-not-allowed disabled:border-border-disabled disabled:bg-surface-disabled disabled:text-fg-disabled"
      >
        <!-- 触发宿主委托给整行按钮：分组名只占行首一条，鼠标停在行内空白处（如计数那一侧）时
             同样该开始滚动。该行没有具名类，用 closest('button') 命中的就是这个按钮本身 -->
        <div v-marquee.fade="{ trigger: 'button' }">
          <span> {{ group.name }} </span>
          <span
            :class="groupModals.modalData.moveTargetId === group.id ? 'text-primary' : 'text-fg-disabled'"
            class="pl-1"
          >
            ({{ chordStore.groupChordMap.get(group.id)?.length ?? 0 }})
          </span>
        </div>
      </button>
    </BaseScrollArea>
  </BaseModal>

  <BaseModal v-model:visible="groupModals.modals.chordVariantsDelete" hide-footer width="lg">
    <template #title>
      <span
        v-chord-name="{ name: groupModals.modalData.referenceChordName, prefix: '删除和弦 ', suffix: ' 的指法' }"
        class="font-bold text-fg-title"
      />
    </template>

    <template #header-extra>
      <BaseCheckbox
        :indeterminate="isVariantsIndeterminate"
        :model-value="isAllVariantsSelected"
        @update:model-value="handleToggleSelectAllVariants()"
        label="全选"
        size="sm"
      />
    </template>

    <div class="flex flex-col gap-md">
      <div class="flex items-center justify-between gap-lg">
        <p class="m-0 text-xs/relaxed font-medium text-fg-body">
          请点击选择要删除的指法，共
          <strong class="font-bold text-danger">
            {{ groupModals.modalData.activeGroupCard?.variants.length || 0 }}
          </strong>
          个，已选
          <strong class="font-bold text-danger">
            <BaseRollingText :text="`${groupModals.modalData.selectedVariantIds.size}`" class="tabular-nums" />
          </strong>
          个
        </p>
      </div>

      <BaseScrollArea
        :fade="false"
        :scrollbar="false"
        axis="y"
        class="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-lg p-xs"
      >
        <div
          v-wave
          v-for="variant in groupModals.modalData.activeGroupCard?.variants"
          :aria-checked="groupModals.modalData.selectedVariantIds.has(variant.id)"
          :aria-label="`指法 偏移 ${variant.fretOffset}`"
          :class="{
            'border-danger! bg-tint-danger-90! ring-1 ring-tint-danger-50':
              groupModals.modalData.selectedVariantIds.has(variant.id),
          }"
          :key="variant.id"
          @click="groupModals.toggleVariantSelection(variant.id)"
          @keydown.enter.prevent="groupModals.toggleVariantSelection(variant.id)"
          @keydown.space.prevent="groupModals.toggleVariantSelection(variant.id)"
          data-focusable-outline
          class="relative flex min-w-0 cursor-pointer flex-col items-center justify-center rounded-md border-[1.5px] border-border-light bg-surface-body transition-all duration-fast outline-none select-none hover:-translate-y-px hover:border-border-base hover:bg-surface-panel-hover active:scale-[0.98]"
          role="checkbox"
          tabindex="0"
        >
          <!-- 不画和弦名但预留其版面（reserve-chord-name）→ 几何与和弦库 picker 一致、直接命中同一批
                 位图；组件会裁掉预留段，故缩略图外观与之前完全相同 -->
          <FretboardCanvas :chord="variant" :is-dark-mode="isDark" :scale="1.8" hide-chord-name reserve-chord-name />
        </div>
      </BaseScrollArea>
      <div class="mt-[0.15rem] flex items-center justify-between gap-md border-t border-border-light pt-md pb-xs">
        <ActionButton @click="groupModals.modals.chordVariantsDelete = false" label="取消" variant="ghost" />

        <div class="flex items-center gap-sm">
          <ActionButton
            @click="groupModals.handleDeleteAllVariants()"
            color="danger"
            label="全部删除"
            variant="ghost"
          />

          <ActionButton
            :disabled="groupModals.modalData.selectedVariantIds.size === 0"
            @click="groupModals.handleDeleteSelectedVariants()"
            color="danger"
            label="删除选中"
          />
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import FretboardCanvas from '@/domains/fretboard/components/FretboardCanvas.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseCheckbox from '@/platform/ui/checkbox/BaseCheckbox.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import BaseRollingText from '@/platform/ui/rolling-text/BaseRollingText.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { CHORD_GROUP_MODALS } from '@/domains/chord/library/injectionKeys';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { isDark } from '@/platform/composables/useTheme';
import { injectModalController } from '@/platform/store/useModalController';

const groupModals = injectModalController(CHORD_GROUP_MODALS);

const chordStore = useChordStore();

const isAllVariantsSelected = computed(() => {
  const variants = groupModals.modalData.activeGroupCard?.variants ?? [];
  if (variants.length === 0) return false;
  return variants.every(v => groupModals.modalData.selectedVariantIds.has(v.id));
});

const isVariantsIndeterminate = computed(() => {
  const variants = groupModals.modalData.activeGroupCard?.variants ?? [];
  const selectedCount = variants.filter(v => groupModals.modalData.selectedVariantIds.has(v.id)).length;
  return selectedCount > 0 && selectedCount < variants.length;
});

/** 全选/取消全选待删除的指法 */
const handleToggleSelectAllVariants = () => {
  const variants = groupModals.modalData.activeGroupCard?.variants ?? [];
  if (isAllVariantsSelected.value) variants.forEach(v => groupModals.modalData.selectedVariantIds.delete(v.id));
  else variants.forEach(v => groupModals.modalData.selectedVariantIds.add(v.id));
};
</script>
