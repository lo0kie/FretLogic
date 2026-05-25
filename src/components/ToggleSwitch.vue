<template>
  <div
    class="flex items-center justify-between px-3 h-10 rounded-xl border border-slate-100 dark:border-slate-800/60 control-bordered select-none relative"
  >
    <span class="text-xs font-bold opacity-80 switch-label">{{ label }}</span>

    <button
      ref="switchTrackRef"
      @click="handleTrackClick"
      class="switch-track w-10 h-6 rounded-full p-1 border flex items-center touch-none relative"
      :class="{ 'is-active': modelValue }"
    >
      <div
        ref="switchThumbRef"
        class="switch-thumb bg-white w-4 h-4 rounded-full shadow-sm absolute left-1"
        :class="{ 'is-moved': modelValue }"
      ></div>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { onMounted, ref } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  label: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();

const switchTrackRef = ref<HTMLButtonElement | null>(null);

let isDragging = false;
let isPointerDown = false;
let startX = 0;

const handleTrackClick = () => {
  if (!isDragging) {
    emit('update:modelValue', !props.modelValue);
  }
};

const onPointerDown = (e: PointerEvent) => {
  if (!switchTrackRef.value) return;
  isPointerDown = true;
  isDragging = false;
  startX = e.clientX;
  switchTrackRef.value.setPointerCapture(e.pointerId);
};

const onPointerMove = (e: PointerEvent) => {
  if (!isPointerDown) return;

  const deltaX = e.clientX - startX;
  if (Math.abs(deltaX) > 4) {
    isDragging = true;
    if (deltaX > 8 && !props.modelValue) {
      emit('update:modelValue', true);
    } else if (deltaX < -8 && props.modelValue) {
      emit('update:modelValue', false);
    }
  }
};

const onPointerUp = (e: PointerEvent) => {
  isPointerDown = false;
  if (switchTrackRef.value) {
    switchTrackRef.value.releasePointerCapture(e.pointerId);
  }
  setTimeout(() => {
    isDragging = false;
  }, 0);
};

onMounted(() => {
  if (switchTrackRef.value) {
    useEventListener(switchTrackRef, 'pointerdown', onPointerDown);
    useEventListener(switchTrackRef, 'pointermove', onPointerMove);
    useEventListener(switchTrackRef, 'pointerup', onPointerUp);
  }
});
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.switch-label {
  color: var(--text-main);
}

.switch-track {
  // 默认浅色/未激活下的背景和边框
  background-color: #cbd5e1;
  border-color: var(--control-border);
  /* 轨道变色动画，使用标准的 ease-in-out */
  transition:
    background-color 0.25s ease-in-out,
    border-color 0.25s ease-in-out;

  &.is-active {
    background-color: @brand-primary; // 优先使用全局强调色
    border-color: @brand-primary;
  }

  /* 圆点本身的物理移动动效 */
  .switch-thumb {
    transform: translateX(0);
    /* 🌟 使用 cubic-bezier 赋予它一点自然的弹性滑行质感，而不是死板的匀速线性 */
    transition: transform 0.25s cubic-bezier(0.25, 1, 0.5, 1);

    &.is-moved {
      transform: translateX(18px); // 精准对应原 4 品宽度的平移距离
    }
  }
}

/* 深色模式下的轨道未激活底色微调，防止看不清 */
.dark {
  .switch-track {
    background-color: #475569;

    &.is-active {
      background-color: @brand-primary;
      border-color: @brand-primary;
    }
  }
}
</style>
