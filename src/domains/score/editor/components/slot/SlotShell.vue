<template>
  <!-- 槽盒子的全部视觉（基类几何、状态变体、落点提示层、字形）都是 `slot/slotStyles.ts` 里的
       类串，本组件只负责把它们组装到骨架上 —— 因为谱面里数量占绝对多数的**瘦槽位**
       （未绑和弦的普通字符槽）为了省下两个组件实例，在 `ScoreInteractiveArea` 里内联了同一套
       骨架与同一批类串。改槽的留白 / 状态视觉一律改 `slotStyles.ts`，两套实现同时生效。
       骨架层数（根 → 落点提示层 → 内容层 → 字形）是两边唯一的重复：瘦槽位没有内容，
       故它的模板里省掉内容层，其余同形。 -->
  <div
    v-action-card
    v-wave="{}"
    :aria-label
    :title
    :class="[
      SLOT_SHELL_CLASS,
      slotShellStateClass({
        isDropLine,
        isDropLineVacant: isVacantSlot,
        isPickerTarget,
        isContentSlot: hasContent,
        isLeftAdjacent: leftChordGap,
      }),
    ]"
    :data-slot-key="slotKey"
    @focusin="handleFocusIn($event)"
    @focusout="handleFocusOut($event)"
    data-focusable-outline
  >
    <!-- 拖拽落点提示（本槽是当前落点时的装饰层）：类串与显隐判据都在 slotStyles.ts，
         内联瘦槽位用的是同一份。 -->
    <div :class="[SLOT_DROP_LAYER_CLASS, slotDropLayerStateClass(isDropTarget)]" aria-hidden="true" />

    <!-- 操作层（悬停/聚焦才浮现的删除钮等）：绝对定位，不参与槽内排版。
         经插槽注入而不是内建，是因为「有内容才有关闭/删除」属宿主语义。
         「什么时候算激活」不再由本组件以插槽参数下发，改由宿主自己用 group-hover /
         group-focus-within 表达——见组件说明里的「为什么激活态必须是 CSS」。 -->
    <slot name="overlay" />

    <!-- 内容层：指板图 / 添加按钮由宿主经默认插槽放入；对齐差异走 contentClass（组件不预设变体） -->
    <div :class="contentClass" class="chord-display-slot flex w-full flex-1 justify-center">
      <slot />
    </div>

    <!-- 字符位：字形本身归 SlotGlyph（外壳不认识字符，既不接收 char 也不判断要不要留白），
         这里只给它在外壳骨架里的固定位置——最后一个 flex 子项，贴底。没有字符层的槽
         （如添加槽）这一位就是空的，骨架随之少一行，正是它该有的样子。
         不带任何插槽参数：此前这里下发 drag-active 供字形抑制 hover 染色，那条链路已整段删除
         （改由 body.is-global-dragging 在 SlotGlyph 的 scoped 样式里判定）——它是宿主侧每行
         v-memo 的依赖之一，留着就等于「起拖/松手各让所有已渲染行重渲一次」。 -->
    <slot name="char" />
  </div>
</template>

<script setup lang="ts">
import { useSlots } from 'vue';

import { SLOT_DROP_LAYER_CLASS, SLOT_SHELL_CLASS, slotDropLayerStateClass, slotShellStateClass } from './slotStyles';

import type { SlotKey } from '@/domains/score/types';

/**
 * 槽外壳：谱面里「一个槽位」的通用形态——根元素、三段骨架（操作层 / 内容层 / 字符位）、
 * 槽盒子的全部内外几何（外边距、撑开尺寸、内边距、内容↔字符层的间距）、焦点进出策略
 * 与全部落点视觉（撑开尺寸、空槽虚线框，以及落点边框提示本身——它就画在本组件模板首部，
 * 见那段注释）。**类串本身不在这里**：单一来源是 `slotStyles.ts`，见该模块说明。
 *
 * 点击 / 按下 / Delete 已不在本组件监听：一行就有二十多个槽、长谱面可达千级，逐槽各挂一份
 * 监听器与闭包是纯开销，改由宿主 ScoreInteractiveArea 在行列表容器上按 `[data-slot-key]`
 * 委托分发（该寻址属性挂在每个槽的根元素上，本组件是其中一个挂载点，见下方与拖拽系统的契约）。
 * 焦点进出仍在此监听——宿主里只有添加槽要用它把焦点转交给「+」按钮，本组件自己已不需要焦点状态。
 *
 * 为什么激活态必须是 CSS（不再以插槽参数下发）：每个槽根都挂着 v-wave，而该指令在 pointerdown
 * 里要读一次 getBoundingClientRect —— 只要此刻样式是脏的，这一次读就会迫使浏览器当场把失效的
 * 样式与布局全部结清（实测 ~33ms 的强制重排）。而「指针划过槽」若由响应式状态驱动，每次划过都要
 * 写一次 DOM（操作层换类），正好把样式弄脏、且就发生在按下之前。改由 group-hover /
 * group-focus-within 表达后，划过不再产生任何 DOM 写入，那次读就落在干净的样式上。
 * 附带收益：本组件不再需要 useElementHover，每个内容槽少挂 2 个 pointer 监听器。
 * 抑制（拖拽中不浮现操作层）改由 body.is-global-dragging 承担，同样不经过本组件的状态。
 *
 * 边界：本组件只服务**有内容**的槽，多出来的由下层经插槽提供：
 * - 和弦槽 / 胖槽（ChordSlot）放指板图卡片、删除钮，以及字符层（不传字符即行首 / 行尾的边缘槽）；
 * - 添加槽（AddSlot）只放「+」按钮——没有字符层，故它这一格在落点行上会多一圈虚线。
 * 字符本身不归这里：字形由 SlotGlyph 提供，外壳既不接收 char、也不判断要不要留白。
 *
 * **瘦槽位（未配和弦的普通字符槽）不再走本组件**：它是谱面里数量占绝对多数的一类
 * （一行二十来个字符就是二十来个槽），每个都挂「外壳 + 字形」两个实例是行挂载成本的大头，
 * 故改由 ScoreInteractiveArea 内联同一套骨架（省掉只服务内容的空内容层）。代价是骨架层数在两处
 * 各写一遍 —— 但**类串仍只有 slotStyles 一份**，改留白 / 状态视觉依旧只改一处。
 * 这也意味着「外壳只有这一份」的初衷从「收口 DOM」改为「收口类名」：状态漂移的防线在类串上。
 *
 * 与拖拽系统的契约（不能改）：根元素必须带 `data-slot-key`，且 `is-dragging-source` /
 * `is-press-arming` 等状态类由 useLyricsDragDrop 按 `[data-slot-key]` 直接 classList 增删，
 * 故这两类的样式只能写在 `SLOT_SHELL_CLASS` 这份**静态**类串里（改成 :class 绑定、
 * 或把根元素换成别的节点，都会静默失效——无报错，只是长按/拖拽期间不再有反馈）。
 * 内联瘦槽位同样受这条契约约束。
 */
defineOptions({ name: 'SlotShell' });

withDefaults(
  defineProps<{
    slotKey: SlotKey;
    ariaLabel?: string;
    title?: string;
    /** 与左侧相邻和弦是否紧邻：为真时补一点左外边距，避免两张指板图卡几乎贴在一起。
     *  宿主只回答「是不是紧邻」这个事实，间距值归本组件的 .is-left-adjacent */
    leftChordGap?: boolean;
    /** 内容层的附加类（当前唯一差异是对齐：字符/边缘槽 items-start、添加槽 items-center） */
    contentClass?: string;
    /** 本槽所在行是当前拖拽的活动落点行：该状态的全部视觉由外壳统一给出——
     *  槽撑开成可落位的大目标，完全空的一格再补一圈虚线框（见 .is-drop-line 注释） */
    isDropLine?: boolean;
    /** 本槽为当前拖拽落点：渲染落点边框提示 */
    isDropTarget?: boolean;
    /** 本槽为选器和弦面板目标：渲染「待写入」高亮 */
    isPickerTarget?: boolean;
  }>(),
  { contentClass: 'items-start' }
);

const emit = defineEmits<{
  (e: 'focusin', event: FocusEvent): void;
  (e: 'focusout', event: FocusEvent): void;
}>();

const slots = useSlots();
/**
 * 宿主往槽里放了什么：default = 内容（和弦槽的指板图卡 / 添加槽的「+」按钮），
 * overlay = 悬停才浮现的操作层（删除钮），char = 字符层（SlotGlyph）。三者都是结构性事实，
 * 故整份判据取 setup 时的插槽快照、不额外开 prop（用法的插槽结构都是静态声明的，运行期不会
 * 增删具名插槽）：
 * - hasContent：内容层与字符层之间要不要留间距；
 * - isVacantSlot：完全空的一格（连字符层都没有），落点行上要额外补一圈虚线框。
 */
// 插槽名一律方括号取值：useSlots() 的返回类型是带索引签名的 Slots，
// tsconfig 开了 noPropertyAccessFromIndexSignature，点号取值会被 TS4111 拦下（与全站写法一致）
const hasContent = Boolean(slots['default']);
const isVacantSlot = !slots['char'];

/** 焦点进出原样转发给宿主（宿主里只有添加槽要用它把焦点转交给「+」按钮）：
 *  本组件自己已不需要焦点状态——激活态整份归 CSS，见组件说明 */
const handleFocusIn = (e: FocusEvent) => emit('focusin', e);
const handleFocusOut = (e: FocusEvent) => emit('focusout', e);
</script>
