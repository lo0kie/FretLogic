<script setup lang="ts">
const text = defineModel('text', { type: String, required: true });
</script>

<template>
  <input ref="nameInput" v-model="text" type="text" spellcheck="false" class="input-minimal" placeholder="和弦名称" />
</template>

<style scoped lang="less">
.input-minimal {
  width: 100%;
  text-align: center;
  font-weight: 900;
  background: transparent;
  border: none;
  outline: none;
  font-size: 4rem;
  color: var(--text-color);
  transition: transform 0.4s ease;
  line-height: 1.1;
  transform: translateY(-10px);
}
</style>
