<template>
  <div
    class="w-full text-center transition-transform duration-300"
    :style="{
      transform: `translateY(${['3%', '5%', '9%'][chordLabStore.fretCount - 3]})`,
    }"
  >
    <input
      v-model="chordLabStore.currentChordName"
      type="text"
      spellcheck="false"
      placeholder="CHORD"
      class="input-chord-name w-full text-center font-black bg-transparent border-none outline-none tracking-tight cursor-pointer select-none caret-[#2563eb] transition-all duration-300"
      :class="{ 'is-empty': !chordLabStore.currentChordName }"
    />
  </div>
</template>

<script setup lang="ts">
import { useChordLabStore } from '@/stores/chordLabStore';

const chordLabStore = useChordLabStore();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.input-chord-name {
  font-size: 3.5rem;
  letter-spacing: -0.04em;

  // 1. 默认有文字时的状态：浅色模式物理锁死为深色 Slate 900
  color: #0f172a;
  text-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);

  &:focus {
    transform: scale(1.02);
    text-shadow: 0 4px 20px rgba(37, 99, 235, 0.15);
  }

  // 🌟 2. 核心绝杀防线：当输入框为空（显示 Placeholder）时，直接强行把 input 本身的 color 改成置灰 Hex 色
  // 这样 html-to-image 就算丢失了 placeholder 伪元素，抓取主 color 时也刚好是准确的浅灰色！
  &.is-empty {
    color: #cbd5e1 !important;
    text-shadow: none;
  }

  // 3. 浅色模式下原本的伪元素依然保留，确保页面运行时体验完美
  &::placeholder {
    color: #cbd5e1;
    font-weight: 700;
    opacity: 1;
  }

  // ==========================================================================
  // 🌙 深色模式（Dark）硬编码防御层
  // ==========================================================================
  :global(.dark) & {
    color: #f8fafc; // 有字时高亮白

    // 当输入框为空时，深色模式下 input 的 color 强制降维锁死为 Slate 600
    &.is-empty {
      color: #475569 !important;
      text-shadow: none;
    }

    &::placeholder {
      color: #475569;
    }
  }
}
</style>
