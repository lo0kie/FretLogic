<template>
  <div
    class="chord-thumb-card group h-11 pl-3 pr-2 flex items-center justify-between outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
    :class="{ 'is-editing': isEditing }"
    tabindex="0"
    title="💡 左键点击：应用/编辑&#10;💡 右键点击：移动至新分组&#10;💡 按住卡片：拖拽排序"
    @keydown.enter.prevent.stop="e => (e.target as HTMLElement).click()"
    @contextmenu.prevent.stop="$emit('move', chord)"
  >
    <span
      class="chord-name-text text-xs font-black tracking-tight truncate pr-2 block leading-tight pointer-events-none"
    >
      {{ chord.chordName }}
    </span>

    <div
      class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200"
    >
      <button
        @click.stop="$emit('delete', chord)"
        title="删除该和弦"
        class="text-[10px] action-button text-[var(--text-disabled)] hover:text-white w-4 h-4 rounded-full font-black flex items-center justify-center bg-[var(--bg-main)] hover:bg-[var(--color-danger)]"
      >
        ✕
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Chord } from '@/stores/chordLabStore';

defineProps<{ chord: Chord; isEditing: boolean }>();
defineEmits<{
  (e: 'delete', chord: Chord): void;
  (e: 'move', chord: Chord): void; // 向上抛出右键菜单的 move 意图
}>();
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.chord-thumb-card {
  .mixin-interactive-card();
  background-color: var(--bg-body);
  border: @border-solid-light;

  .chord-name-text,
  .action-button {
    transition: @transition-fast;
  }

  &.is-editing {
    background-color: color-mix(in srgb, @primary, transparent 90%);
    border-color: @primary !important;
    box-shadow: @shadow-sm;
    .chord-name-text {
      color: @primary !important;
    }
    .action-button {
      background-color: color-mix(in srgb, @primary, transparent 85%);
    }
  }
}
</style>
