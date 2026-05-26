<template>
  <div class="relative flex flex-col gap-2">
    <label class="text-xs font-black tracking-widest uppercase text-subtitle">Capo</label>
    <div class="relative w-full">
      <GlobalTooltip content="滚动滚轮切换" placement="top">
        <div
          ref="capoWheelRef"
          @click="uiStore.toggleCapoPanel()"
          class="capo-trigger-bar w-full h-10 bg-slate-100 dark:bg-slate-800 font-black text-[14px] px-3 rounded-xl flex items-center justify-between border cursor-pointer select-none hover:bg-slate-200/50 dark:hover:bg-slate-700/60"
        >
          <span class="capo-value-text"
            >{{ chordLabStore.capo }} {{ chordLabStore.capo === 0 ? '(空弦位)' : '品' }}</span
          >
          <svg
            class="w-3 h-3 text-slate-400 transition-transform duration-200"
            :class="{ 'rotate-180': uiStore.isCapoOpen }"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </GlobalTooltip>

      <div v-if="uiStore.isCapoOpen" class="fixed inset-0 z-[40]" @click="uiStore.isCapoOpen = false"></div>

      <Transition
        enter-from-class="opacity-0 translate-y-[-10px]"
        leave-to-class="opacity-0 translate-y-[-10px]"
        enter-active-class="transition duration-200 ease-out"
        leave-active-class="transition duration-200 ease-in"
      >
        <div
          v-if="uiStore.isCapoOpen"
          class="capo-dropdown-box absolute left-0 right-0 mt-1.5 max-h-52 overflow-y-auto no-scrollbar rounded-xl shadow-2xl z-[50] p-1.5 flex flex-col gap-1.5 border"
        >
          <div
            v-for="n in 13"
            :id="'capo-opt-' + (n - 1)"
            :key="n - 1"
            @click="
              chordLabStore.capo = n - 1;
              uiStore.isCapoOpen = false;
            "
            class="capo-item h-10 px-2.5 py-1 rounded-lg flex items-center text-[14px] font-bold cursor-pointer transition-colors"
            :class="{ 'is-selected': chordLabStore.capo === n - 1 }"
          >
            <span class="w-3.5 text-right mr-1">{{ n - 1 }}</span>
            <span>{{ n - 1 === 0 ? '(空弦位)' : '品' }}</span>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useChordLabStore } from '@/stores/chordLabStore';
import { useUiStore } from '@/stores/uiStore';
import { useEventListener } from '@vueuse/core';
import { nextTick, onMounted, ref, watch } from 'vue';

const uiStore = useUiStore();
const chordLabStore = useChordLabStore();
const capoWheelRef = ref<HTMLDivElement | null>(null);

watch(
  () => uiStore.isCapoOpen,
  isOpen => {
    if (isOpen) {
      nextTick(() => {
        const targetElement = document.getElementById(`capo-opt-${chordLabStore.capo}`);
        if (targetElement) {
          targetElement.scrollIntoView({ block: 'center', behavior: 'auto' });
        }
      });
    }
  }
);

const handleWheelCapo = (e: WheelEvent) => {
  e.preventDefault();
  chordLabStore.capo =
    e.deltaY < 0
      ? chordLabStore.capo <= 0
        ? 12
        : chordLabStore.capo - 1
      : chordLabStore.capo >= 12
        ? 0
        : chordLabStore.capo + 1;
};

onMounted(() => {
  if (capoWheelRef.value) useEventListener(capoWheelRef, 'wheel', handleWheelCapo, { passive: false });
});
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.capo-trigger-bar {
  border-color: var(--control-border);
  .capo-value-text {
    color: @text-body;
    opacity: 0.8;
  }
  :global(.dark) & .capo-value-text {
    color: #ffffff !important;
    opacity: 0.9;
  }
}

.capo-dropdown-box {
  .mixin-floating-layer(); // 一键注入悬浮阴影和边框

  .capo-item {
    color: @text-body;
    .mixin-hover-card(); // 一键注入统一的悬浮背景色

    &.is-selected {
      background-color: @brand-primary !important;
      color: white;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
    }
  }
}
</style>
