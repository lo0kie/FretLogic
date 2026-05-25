<template>
  <div
    class="w-full text-center transition-transform duration-300"
    :style="{ transform: `translateY(${['3%', '5%', '9%'][chordLabStore.fretCount - 3]})` }"
  >
    <input
      v-model="chordLabStore.currentChordName"
      type="text"
      spellcheck="false"
      class="input-chord-name"
      placeholder="CHORD"
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
  color: @text-title; // 🌟 修复：用标准主色取代 --text-main
  caret-color: @brand-primary;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  text-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);

  &:focus {
    transform: scale(1.02);
    text-shadow: 0 4px 20px rgba(37, 99, 235, 0.15);
  }

  &::placeholder {
    color: #cbd5e1;
    font-weight: 700;
    opacity: 0.6;
  }
}

.dark {
  .input-chord-name {
    text-shadow: 0 0 20px rgba(37, 99, 235, 0.2);
    &::placeholder {
      color: #475569;
      opacity: 0.8;
    }
  }
}
</style>
