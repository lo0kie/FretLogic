<template>
  <div class="app-shell">
    <!-- 顶部栏 -->
    <header class="app-shell-header">
      <slot name="header" />
    </header>

    <!-- 主体：侧栏 + 内容 -->
    <div class="app-shell-body">
      <!-- 左侧栏（桌面常驻 / 移动端抽屉） -->
      <slot name="left-sidebar" />

      <!-- 主内容区 -->
      <main class="app-shell-main">
        <slot />
      </main>

      <!-- 右侧上下文面板（可选） -->
      <aside v-if="$slots['right-sidebar']" class="app-shell-right">
        <slot name="right-sidebar" />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
// 应用壳：提供三栏（header / left-sidebar / main / right-sidebar）语义布局。
// 移动端由外部 slot 决定如何呈现抽屉（遮罩/过渡由使用者组合）。
</script>

<style scoped lang="scss">
.app-shell {
  width: 100vw;
  min-width: $app-min-width;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.app-shell-header {
  flex: none;
}

.app-shell-body {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  overflow: hidden;
}

.app-shell-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.app-shell-right {
  flex: none;
  border-left: 1px solid var(--separator);
  background: var(--bg-panel);
}
</style>
