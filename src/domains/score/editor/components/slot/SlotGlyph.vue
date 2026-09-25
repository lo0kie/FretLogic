<template>
  <span :class="[SLOT_GLYPH_CLASS, slotGlyphColorClass(char)]">{{ slotGlyphText(char) }}</span>
</template>

<script setup lang="ts">
import { SLOT_GLYPH_CLASS, slotGlyphColorClass, slotGlyphText } from './slotStyles';

/**
 * 槽的字符层：谱面里「一个槽位」底部那一行字形。
 *
 * 类串与文本变换都在 `slotStyles.ts`（单一来源）——谱面里数量占绝对多数的**瘦槽位**
 * （未绑和弦的普通字符槽）为了省下两个组件实例，在 `ScoreInteractiveArea` 里内联了同一个
 * `<span>` 与同一批类串，不再挂本组件。故本组件现在的消费方只剩和弦槽与添加槽（外加边缘槽）。
 *
 * 与外壳（SlotShell）的分工不变：外壳管槽的盒子——骨架、内外布局、状态类、共有事件与落点视觉；
 * 字符归这里。两者互不 import：用得到字形的槽把本组件放进外壳的 `#char` 位。
 *
 * 不传 char 时渲染空字形、但占住同一行高度：行首 / 行尾的边缘槽靠它与字符槽等高对齐
 * （高度取自同一个 min-h，故随 --score-font-scale 同步缩放）。
 *
 * hover 染色（指针划过槽时字形染主题色、拖拽中不染）由下面的 scoped 样式表达，且它是
 * `:global()` 的——**整条选择器不带 scoped 属性，内联字形同样命中**，故不需要第二份。
 */
defineOptions({ name: 'SlotGlyph' });

defineProps<{
  /** 槽内字符（含空格与 `|` / `｜` 分隔符）；不传则渲染空字形，只占住字符行高度 */
  char?: string;
}>();
</script>

<style scoped lang="scss">
/* 指针划过槽时字形染主题色；拖拽中不染——落点边框要抢注意力，字形再变色就是噪音。
   刻意写成「只在非拖拽时才成立」，而不是「拖拽时把颜色覆盖回基础色」：基础色有 title / muted
   两档（由 slotStyles 的 slotGlyphColorClass 二选一），一个 color 值表达不了，覆盖式写法得再引
   一个标记类才分得清。
   特异性 (0,4,1) 稳压两个基础色工具类的 (0,1,0)，胜出者不依赖 Tailwind 编译顺序。
   ⚠️ :global() 必须把**整条选择器**包进去——写成「:global(前缀) + 后缀选择器」时 scoped 插件
   会把后缀整段丢掉（详见 ChordSlot 的样式注释）。
   也正因为整条是全局的，`ScoreInteractiveArea` 里**内联的瘦槽位字形**（同样带 .char-text）
   自动命中本规则，不必、也不该再写第二份。 */
:global(body:not(.is-global-dragging) .group:hover .char-text) {
  color: var(--color-primary);
}
</style>
