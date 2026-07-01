<template>
  <div ref="capoContainerRef" class="relative flex flex-col gap-2">
    <label class="text-xs font-black tracking-widest uppercase" style="color: var(--text-disabled)">
      Capo (把位平移)
    </label>

    <div class="relative w-full">
      <GlobalTooltip class="w-full" content="点击展开或滚动滑轮切换" placement="top">
        <div
          ref="capoWheelRef"
          @click="uiStore.toggleCapoPanel()"
          class="capo-trigger-bar flex items-center justify-between px-3 select-none group"
          :class="{ 'is-active': uiStore.isCapoOpen }"
        >
          <span
            class="font-black flex items-center gap-2"
            :class="[editorStore.capo !== 0 ? 'text-[var(--color-primary)] text-[16px]' : 'text-title text-[14px]']"
          >
            {{ editorStore.capo }} {{ editorStore.capo === 0 ? '(空弦位)' : '品' }}
          </span>

          <!-- 悬停时显示的清除按钮 -->
          <X
            v-if="editorStore.capo !== 0"
            :size="18"
            :stroke-width="3"
            class="hidden group-hover:block text-[var(--text-disabled)] hover:!text-[var(--color-danger)] transition-colors"
            @click.stop="
              editorStore.capo = 0;
              uiStore.isCapoOpen = false;
            "
          />
          <ChevronDown
            :size="18"
            :stroke-width="3"
            style="color: var(--text-disabled)"
            class="transition-transform duration-200"
            :class="[{ 'rotate-180': uiStore.isCapoOpen }, editorStore.capo !== 0 ? 'group-hover:hidden' : '']"
          />
        </div>
      </GlobalTooltip>

      <Transition
        enter-from-class="opacity-0 translate-y-[-8px]"
        leave-to-class="opacity-0 translate-y-[-8px]"
        enter-active-class="transition duration-200 ease-out"
        leave-active-class="transition duration-200 ease-in"
      >
        <div
          v-if="uiStore.isCapoOpen"
          class="capo-dropdown-box absolute left-0 right-0 mt-1.5 max-h-52 overflow-y-auto no-scrollbar z-[50] p-1.5 flex flex-col gap-1"
        >
          <div
            v-for="n in 13"
            :id="'capo-opt-' + (n - 1)"
            :key="n - 1"
            @click="
              editorStore.capo = n - 1;
              uiStore.isCapoOpen = false;
            "
            class="capo-item h-10 px-2.5 py-0.5 flex items-center text-[13px] font-bold"
            :class="{ 'is-selected': editorStore.capo === n - 1 }"
          >
            <span class="w-4 text-right mr-1.5 font-black">{{ n - 1 }}</span>
            <span>{{ n - 1 === 0 ? '(空弦位)' : '品' }}</span>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useEditorStore } from '@/stores/editorStore';
import { useUiStore } from '@/stores/uiStore';
import { ChevronDown, X } from '@lucide/vue';
import { onClickOutside, useEventListener } from '@vueuse/core';
import { nextTick, onMounted, ref, watch } from 'vue';

const uiStore = useUiStore();
const capoWheelRef = ref<HTMLDivElement | null>(null);
const capoContainerRef = ref<HTMLDivElement | null>(null);
const editorStore = useEditorStore();

onClickOutside(capoContainerRef, () => {
  if (uiStore.isCapoOpen) uiStore.isCapoOpen = false;
});

watch(
  () => uiStore.isCapoOpen,
  isOpen => {
    if (isOpen) {
      nextTick(() => {
        const targetElement = document.getElementById(`capo-opt-${editorStore.capo}`);
        if (targetElement) targetElement.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      });
    }
  }
);

let wheelAccumulator = 0;
const WHEEL_THRESHOLD = 40;

const handleWheelCapo = (e: WheelEvent) => {
  e.preventDefault();
  wheelAccumulator += e.deltaY;
  if (Math.abs(wheelAccumulator) < WHEEL_THRESHOLD) return;

  // 取消越界滚动触发，锁定边界 [0, 12]
  if (wheelAccumulator < 0) editorStore.capo = Math.max(0, editorStore.capo - 1);
  else editorStore.capo = Math.min(12, editorStore.capo + 1);

  wheelAccumulator = 0;
};

onMounted(() => {
  if (capoWheelRef.value) useEventListener(capoWheelRef, 'wheel', handleWheelCapo, { passive: false });
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.capo-trigger-bar {
  .mixin-input-base();
  height: 2.5rem;
  border-radius: @radius-lg;
  cursor: pointer;
  background-color: var(--bg-body);
  transition:
    border-color @transition-fast,
    box-shadow @transition-fast;

  &.is-active {
    border-color: @primary;
    box-shadow: @focus-ring-primary;
  }
}

.capo-dropdown-box {
  .mixin-floating-layer();
}

.capo-item {
  .mixin-interactive-card();
  color: var(--text-body);
  &.is-selected {
    background-color: color-mix(in srgb, @primary, transparent 90%) !important;
    color: @primary !important;
    border-color: color-mix(in srgb, @primary, transparent 70%);
  }
}
</style>
