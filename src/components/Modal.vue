<template>
  <div class="fixed inset-0 z-[2000] flex items-center justify-center p-4">
    <div
      class="modal-overlay absolute inset-0 bg-slate-950/40 dark:bg-slate-950/60"
      @click="uiStore.modalShow = false"
    ></div>

    <div class="modal-card rounded-xl w-80 p-6 relative z-10 animate-modal-in">
      <h3 class="text-xs font-black mb-4 opacity-40 uppercase tracking-widest text-title-style">
        {{ uiStore.modalTitle }}
      </h3>

      <template v-if="uiStore.modalType === 'createGroup' || uiStore.modalType === 'renameGroup'">
        <input
          v-model="uiStore.modalInput"
          ref="inputRef"
          @keyup.enter="uiStore.handleModalConfirm"
          type="text"
          class="modal-input-field w-full rounded-2xl px-4 py-3 text-sm font-bold outline-none mb-4"
          placeholder="请输入..."
        />
      </template>

      <p v-else class="text-sm font-semibold mb-6 opacity-80 leading-relaxed text-body-style">
        确定执行此删除操作吗？组内所有和弦都将被清空。
      </p>

      <div class="flex gap-2 w-full">
        <ActionButton @click="uiStore.modalShow = false"> 取消 </ActionButton>

        <ActionButton
          @click="uiStore.handleModalConfirm"
          :danger="uiStore.modalType === 'deleteGroup'"
          :primary="uiStore.modalType !== 'deleteGroup'"
        >
          确认
        </ActionButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue'; // 🌟 引入核心公共动作按钮
import { useUiStore } from '@/stores/uiStore';
import { onMounted, ref } from 'vue';

const uiStore = useUiStore();
const inputRef = ref<HTMLInputElement | null>(null);

onMounted(() => {
  // 当弹窗激活且为输入框模式时，自动获取焦点提升无鼠标操作体验
  if (['createGroup', 'renameGroup'].includes(uiStore.modalType)) {
    inputRef.value?.focus();
  }
});
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.modal-card {
  // 🌟 核心复用：直接套用悬浮层 Mixin，接管背景变体、控件边框、圆角以及深色模式的景深阴影
  .mixin-floating-layer();
}

.modal-input-field {
  background-color: var(--bg-panel);
  border: 1px solid var(--control-border);
  color: @text-title;
  transition: all 0.2s @bezier-standard;

  &:focus {
    border-color: @brand-primary;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12); // 聚焦时优雅的空气蓝外发光
  }
}

// 补充字色血脉
.text-title-style {
  color: @text-title;
}
.body-style {
  color: @text-body;
}

// 配合系统标准阻尼缓动注入的进入动画
.animate-modal-in {
  animation: modalSlideIn 0.25s @bezier-standard;
}

@keyframes modalSlideIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>
