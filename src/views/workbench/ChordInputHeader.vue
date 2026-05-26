<template>
  <div
    class="w-full text-center transition-transform"
    :style="{
      transform: `translateY(${['3%', '5%', '9%'][chordLabStore.fretCount - 3]})`,
      transitionDuration: '300ms',
    }"
  >
    <input
      v-model="chordLabStore.currentChordName"
      type="text"
      spellcheck="false"
      class="input-chord-name"
      placeholder="CHORD"
      :style="{
        color: !chordLabStore.currentChordName ? (chordLabStore.isDarkMode ? '#475569' : '#cbd5e1') : '',
      }"
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
  width: 100%;
  text-align: center;
  font-weight: 900;
  background: transparent;
  border: none;
  outline: none;
  font-size: 3.5rem;
  letter-spacing: -0.04em;

  // 🌟 原生血脉相连：直接消费会自适应深浅模式的 var(--text-title)
  color: @text-title;
  caret-color: @brand-primary;

  // 🌟 曲线收拢：统一接入系统级标准缓动
  transition: all 0.3s @bezier-standard;
  text-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);

  &:focus {
    transform: scale(1.02);
    text-shadow: 0 4px 20px rgba(37, 99, 235, 0.15);
  }

  // 🌟 终极优化：合并深浅色占位符逻辑，物理对齐物理琴弦色
  &::placeholder {
    color: @fret-color;
    font-weight: 700;
    opacity: 0.6;
    transition: color 0.25s @bezier-standard;
  }
}
</style>
