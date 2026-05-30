<template>
  <div ref="triggerRef" class="relative inline-block w-full" @mouseenter="onEnter" @mouseleave="onLeave">
    <slot></slot>

    <Teleport to="body">
      <Transition name="tooltip-native">
        <div
          v-if="show && content"
          ref="tooltipRef"
          class="tooltip-box fixed whitespace-nowrap px-3 py-1.5 font-black rounded-lg z-[9999] text-xs shadow-xl pointer-events-none"
          :style="tooltipStyle"
        >
          {{ content }}
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, reactive, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    content?: string;
    placement?: 'top' | 'bottom' | 'left' | 'right' | 'bottom-end';
  }>(),
  { placement: 'top' }
);

const show = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLElement | null>(null); // 🌟 新增：Tooltip 自身的引用

// 🌟 初始状态将不透明度设为 0，防止坐标计算那 1 帧发生尴尬的闪烁
const tooltipStyle = reactive({
  top: '0px',
  left: '0px',
  transform: 'translateX(-50%)',
  opacity: 0,
});

const onEnter = async () => {
  show.value = true;
  await nextTick();

  if (triggerRef.value && tooltipRef.value) {
    const rect = triggerRef.value.getBoundingClientRect();
    const tooltipHeight = tooltipRef.value.offsetHeight; // 🌟 实时动态获取 Tooltip 的高度

    // 计算完成后再放开不透明度
    tooltipStyle.opacity = 1;

    if (props.placement === 'top') {
      tooltipStyle.left = `${rect.left + rect.width / 2}px`;
      // 🌟 动态解法：按钮顶部物理坐标 - Tooltip 自身高度 - 自定义间距(8px)
      tooltipStyle.top = `${rect.top - tooltipHeight - 8}px`;
      tooltipStyle.transform = `translateX(-50%)`;
    } else if (props.placement === 'bottom') {
      tooltipStyle.left = `${rect.left + rect.width / 2}px`;
      tooltipStyle.top = `${rect.bottom + 8}px`;
      tooltipStyle.transform = `translateX(-50%)`;
    } else if (props.placement === 'left') {
      tooltipStyle.left = `${rect.left - 8}px`;
      tooltipStyle.top = `${rect.top + rect.height / 2}px`;
      tooltipStyle.transform = `translate(-100%, -50%)`;
    } else if (props.placement === 'right') {
      tooltipStyle.left = `${rect.right + 8}px`;
      tooltipStyle.top = `${rect.top + rect.height / 2}px`;
      tooltipStyle.transform = `translateY(-50%)`;
    } else if (props.placement === 'bottom-end') {
      tooltipStyle.left = `${rect.right}px`;
      tooltipStyle.top = `${rect.bottom + 8}px`;
      tooltipStyle.transform = `translateX(-100%)`;
    }
  }
};

const onLeave = () => {
  show.value = false;
};
</script>

<style scoped lang="less">
.tooltip-box {
  background-color: #0f172a;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.1);
  /* 🌟 这里仅保留颜色和不透明度的渐变，切勿对 top/left 加 transition，否则高刷屏上跟随滑动会有严重的物理拖影 */
  transition:
    opacity 0.15s ease-out,
    fill 0.15s ease;
}

.tooltip-native-enter-active,
.tooltip-native-leave-active {
  transition: opacity 0.15s ease-out;
}
.tooltip-native-enter-from,
.tooltip-native-leave-to {
  opacity: 0 !important;
}
</style>
