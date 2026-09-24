<template>
  <!-- 槽盒子的几何与各状态样式统一写在下面这一个 class 串里（本组件是唯一一份：改槽的留白只改这一行）：
       · 基类 ── p-0.5：所有槽统一四边同一留白（原先内容槽「横向 0.5rem / 纵向 0」与字符槽「四边
         0.125rem」两档）。min-w-0 / min-h-0 显式归零：min-* 初始值 auto 与长度之间无法插值，
         归零后 transition-all 的撑开 / 收拢才真实生效；box-content 恒定 content-box，避免收拢时
         宽度口径翻转造成离散跳变。
       · 动效一律取 tokens 的令牌，不写裸值：duration-fast（--duration-fast = 0.1s）+
         ease-standard（--ease-standard → --bezier-standard）。撑开 / 收拢、落点提示层的显隐、
         拖拽源虚化共用同一条过渡，改手感只改令牌（此前这里写的是裸的
         cubic-bezier(0.25,0.1,0.25,1)，与宿主行过渡各写一份同值不同源）。
       · 状态一律写成 [&.状态类]: 变体，而不是把值塞进 :class 三元 ── 这类选择器带两个类、特异性
         (0,2,0)，稳压基类里的同名工具类（min-w-0 / min-h-0 / outline-none），胜出者不依赖
         Tailwind 的编译顺序：这正是原先这些规则写进 scoped 样式的理由。代价是基类几何
         （p-0.5 / min-*）现在是普通工具类，宿主透传同名类会按编译顺序胜出——当前三个调用点
         都不传布局类，故无实际影响。
       · is-content-slot ── 内容槽（指板图卡 /「+」）才要「内容 ↔ 字符行」的最小间距；字符槽不挂
         这个类：它内容层是空的，留间距没有视觉收益，却会把整行撑高（字符行贴底且定高，
         行高＝间距＋字符行）。
       · is-left-adjacent ── 与左邻和弦紧邻时补一点左外边距。
       · is-drop-line ── 本槽所在行是当前拖拽的活动落点行：撑开成足够大的落位目标（字符槽与添加槽
         共用），尺寸走基类的 transition-all，撑开与收拢双向往返均平滑。
       · is-drop-line-vacant ── 连字符层都没有的一格再补一圈虚线：它撑开后仍只有一个小「+」，缺
         「这里是个落点」的语言，虚线（标记 / 占位）正好补上；有字形的槽撑开本身已够显眼，
         再加框就是噪音。圆角沿用基类 rounded-sm —— 此前这一档由宿主传 rounded-md，被基类按
         Tailwind 编译顺序压掉（实测 .rounded-sm 排在 .rounded-md 之后），从未生效。
       · is-picker-target ── 与「拖拽落点」（模板首部那层 2px 实线主题色边框）刻意用不同视觉语言：
         落点是跟随指针的瞬时态、要抢注意力；本状态是面板开启期间一直挂着的「待写入」标记，要沉得住。
         故用虚线（读作「标记 / 占位」）+ 收敛的实色 tint（半透明会透出下层底色——谱面行本身还有
         hover 底色——同一标记叠在不同底色上深浅漂移）。outline 不参与布局，槽位间距为 0 也不会
         顶开邻槽；-2px 内收让虚线落在槽位内沿，不压到邻槽。
         ⚠️ 这三条 outline longhand 必须带 ! ── 槽根挂着 data-focusable-outline，而聚焦环模块
         （focusRingOverlay）在 main.ts 装配时会注入一条 `outline:none !important` 规则
         （选择器即该属性标记，画布画的环替代原生 outline）。!important 无视特异性，所以不带 ! 的
         outline-* 会被那条规则整体吃掉（outline 简写含 style/width/color 三个 longhand），
         虚线永远画不出来。这与本文件 is-dragging-source 那两条带 ! 的理由同类。
         outline-offset 不属 outline 简写、不会被重置，带 ! 只为与同类保持一致。
       · is-press-arming / is-dragging-source ── 由拖拽系统按 [data-slot-key] 直接 classList 增删，
         故只能写在下面这份静态类名上、不能塞进 :class 绑定（见下方与拖拽系统的契约）。
         前者是触摸长按等待期的按压反馈（源槽渐显主色描边并轻微放大）；后者是拖拽源高亮外边框，
         引 tokens 的 --focus-ring 令牌（聚焦外环由 JS 注入的 data-focusable-outline 承担，两者互不干扰）。 -->
  <div
    v-action-card
    v-wave="{}"
    :aria-label
    :title
    :class="{
      'is-drop-line': isDropLine,
      'is-drop-line-vacant': isDropLine && isVacantSlot,
      'is-picker-target': isPickerTarget,
      'is-content-slot': hasContent,
      'is-left-adjacent': leftChordGap,
    }"
    :data-slot-key="slotKey"
    @click="handleSlotClick($event)"
    @focusin="handleFocusIn($event)"
    @focusout="handleFocusOut($event)"
    @keydown.backspace="emit('remove', $event)"
    @keydown.delete="emit('remove', $event)"
    @pointerdown="handlePointerDown($event)"
    data-focusable-outline
    class="char-box group relative box-content flex min-h-0 min-w-0 cursor-pointer [touch-action:pan-x_pan-y] flex-col items-center justify-start self-stretch rounded-sm p-0.5 transition-all duration-fast ease-standard outline-none hover:bg-tint-primary-88 [&.is-content-slot]:gap-xs [&.is-dragging-source]:opacity-35! [&.is-dragging-source]:shadow-(--focus-ring)! [&.is-drop-line]:min-h-[108px] [&.is-drop-line]:min-w-[58px] [&.is-drop-line-vacant]:border [&.is-drop-line-vacant]:border-dashed [&.is-drop-line-vacant]:border-border-light [&.is-left-adjacent]:ml-[0.15rem] [&.is-picker-target]:outline-2! [&.is-picker-target]:-outline-offset-2! [&.is-picker-target]:outline-(--tint-primary-45)! [&.is-picker-target]:outline-dashed! [&.is-press-arming]:scale-[1.04] [&.is-press-arming]:shadow-[0_0_0_2px_var(--color-primary)]"
    ref="rootRef"
  >
    <!-- 拖拽落点提示（本槽是当前落点时的装饰层）：只给一圈主题色边框、不铺底色、不遮挡字符。
         直接画在骨架里——它只服务这一处，本身也只是一个绝对定位的 div，单抽组件只是多一层实例化；
         `inset-[2px]` 以本根元素（relative）为参照，故它挂在根下，与内部三层怎么排无关。
         过渡由类切换承担、不套 <Transition>：每个槽位都要多实例化 Transition + BaseTransition 两个
         组件，纯装饰性提示不值得付这个开销；且原 enter/leave 的 scale 两端都是 100%，实际只有
         opacity 在变，故 transition-property 收敛为 opacity,visibility。
         visibility 与 opacity 同过渡：淡出结束后才转 hidden，既不建层叠上下文也不参与命中。
         层级 z-3 低于操作按钮层 z-card(5)：拖拽中操作按钮被抑制为 opacity-0 + pointer-events-none，
         且本层自身 pointer-events-none，二者无交互冲突。 -->
    <div
      :class="isDropTarget ? 'visible opacity-100' : 'invisible opacity-0'"
      aria-hidden="true"
      class="pointer-events-none absolute inset-[2px] z-3 rounded-[5px] border-2 border-primary transition-[opacity,visibility] duration-fast"
    />

    <!-- 操作层（悬停/聚焦才浮现的删除钮等）：绝对定位，不参与槽内排版。
         经插槽注入而不是内建，是因为「有内容才有关闭/删除」属宿主语义，本组件只负责
         「什么时候算激活」——以 active 下发，宿主自行决定给什么。 -->
    <slot :active="isActive" name="overlay" />

    <!-- 内容层：指板图 / 添加按钮由宿主经默认插槽放入；对齐差异走 contentClass（组件不预设变体） -->
    <div :class="contentClass" class="chord-display-slot flex w-full flex-1 justify-center">
      <slot :active="isActive" />
    </div>

    <!-- 字符位：字形本身归 SlotGlyph（外壳不认识字符，既不接收 char 也不判断要不要留白），
         这里只给它在外壳骨架里的固定位置——最后一个 flex 子项，贴底。没有字符层的槽
         （如添加槽）这一位就是空的，骨架随之少一行，正是它该有的样子。
         拖拽态随插槽参数一并下发：字形在拖拽中要抑制 hover 染色，而「是否正在拖拽」这个事实
         的源头在本组件（宿主传进来的 isDragActive），由这里统一转发——宿主不必再自己取一遍
         传给字形，此前瘦槽位就是漏了这一步，导致拖拽中它仍在染主题色。
         参数名不用 isDragActive：宿主解构插槽参数时会遮蔽同名的 prop（vue/no-template-shadow）。 -->
    <slot :drag-active="isDragActive" name="char" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useSlots, useTemplateRef } from 'vue';

import { useElementHover } from '@vueuse/core';

import type { SlotKey } from '@/domains/score/types';

/**
 * 槽外壳：谱面里「一个槽位」的通用形态——根元素、三段骨架（操作层 / 内容层 / 字符位）、
 * 槽盒子的全部内外几何（外边距、撑开尺寸、内边距、内容↔字符层的间距）、共有事件策略
 * （点击拦截、按下、Delete / Backspace、焦点进出）与全部落点视觉（撑开尺寸、空槽虚线框，
 * 以及落点边框提示本身——它就画在本组件模板首部，见那段注释）。
 *
 * 边界：三个用法共有的都收在这里，多出来的由下层经插槽提供：
 * - 瘦槽位（ScoreInteractiveArea 里未配和弦的字符）只放字符层；
 * - 和弦槽 / 胖槽（ChordSlot）放指板图卡片、删除钮，以及字符层（不传字符即行首 / 行尾的边缘槽）；
 * - 添加槽（AddSlot）只放「+」按钮——没有字符层，故它这一格在落点行上会多一圈虚线。
 * 字符本身不归这里：字形由 SlotGlyph 提供，外壳既不接收 char、也不判断要不要留白。
 *
 * 抽出来的动因：此前谱面瘦槽位（ScoreInteractiveArea 内联 DOM）与和弦槽（ChordSlot）各写一份
 * 外壳 + 交互 + 样式，改一处状态（如面板目标高亮）要同步两遍，漏一边就出现"同一个标记两种样子"。
 * 现在外壳只有这一份，派生用法只提供内容，不复制壳。
 *
 * 与拖拽系统的契约（不能改）：根元素必须带 `data-slot-key`，且 `is-dragging-source` /
 * `is-press-arming` 等状态类由 useLyricsDragDrop 按 `[data-slot-key]` 直接 classList 增删，
 * 故这两类的样式只能写在根元素的静态类名里（模板首部那份 [&.状态类]: 变体），改成 :class 绑定、
 * 或把根元素换成别的节点，都会静默失效（无报错，只是长按/拖拽期间不再有反馈）。
 */
defineOptions({ name: 'SlotShell' });

const props = withDefaults(
  defineProps<{
    slotKey: SlotKey;
    ariaLabel?: string;
    title?: string;
    /** 与左侧相邻和弦是否紧邻：为真时补一点左外边距，避免两张指板图卡几乎贴在一起。
     *  宿主只回答「是不是紧邻」这个事实，间距值归本组件的 .is-left-adjacent */
    leftChordGap?: boolean;
    /** 内容层的附加类（当前唯一差异是对齐：字符/边缘槽 items-start、添加槽 items-center） */
    contentClass?: string;
    /** 全局拖拽中：让操作层恒不激活（避免拖动经过时弹删除钮盖住落点）。
     *  字形自身的 hover 染色归 SlotGlyph 的 isDragActive，与外壳无关 */
    isDragActive?: boolean;
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
  /** 槽被激活（点击，或经 v-action-card 转换的 Enter / Space）：是否拦截默认行为由宿主决定 */
  (e: 'click', event: MouseEvent): void;
  /** 槽本体按下（内部按钮起手不算）：宿主据此登记拖拽会话 */
  (e: 'pointerdown', event: PointerEvent): void;
  /** Delete / Backspace：是否响应由宿主判断（无内容的槽不该拦截该键） */
  (e: 'remove', event: KeyboardEvent): void;
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
 * - hasContent / hasOverlay：要不要建立 hover 追踪——会响应激活态的东西都来自宿主放的内容；
 *   谱面里绝大多数槽是纯字符槽（一行 20+ 个），只放了个字符层：此前无差别挂 useElementHover，
 *   等于给每个字符槽常驻 2 个 pointer 监听器、并在指针划过时写一次响应式状态触发重渲染，
 *   而字符层的 hover 视觉本来就由 CSS 承担（hover:bg-tint-primary-88 / group-hover:text-primary）；
 * - isVacantSlot：完全空的一格（连字符层都没有），落点行上要额外补一圈虚线框。
 */
// 插槽名一律方括号取值：useSlots() 的返回类型是带索引签名的 Slots，
// tsconfig 开了 noPropertyAccessFromIndexSignature，点号取值会被 TS4111 拦下（与全站写法一致）
const hasContent = Boolean(slots['default']);
const hasOverlay = Boolean(slots['overlay']);
const isVacantSlot = !slots['char'];

const rootRef = useTemplateRef<HTMLElement>('rootRef');
const isHovered = hasContent || hasOverlay ? useElementHover(rootRef) : ref(false);
const isFocused = ref(false);

/** 激活态（hover 或聚焦）：下发给操作层插槽，宿主据此决定删除钮等是否浮现 */
const isActive = computed(() => (isHovered.value || isFocused.value) && !props.isDragActive);

/**
 * 槽被点击：先拦下冒泡与默认行为，再把事件交给宿主决定打开什么。
 * 这是三个用法共有的策略——此前和弦槽与添加槽各写一遍、字符槽没写，同一个操作在两处行为不同。
 */
const handleSlotClick = (event: MouseEvent) => {
  event.stopPropagation();
  event.preventDefault();
  emit('click', event);
};

/** 仅当焦点真正离开本槽子树时才取消激活（焦点在槽内按钮间移动不该关闭操作层） */
const handleFocusIn = (e: FocusEvent) => {
  isFocused.value = true;
  emit('focusin', e);
};
const handleFocusOut = (e: FocusEvent) => {
  const next = e.relatedTarget as Node | null;
  if (next && rootRef.value?.contains(next)) return;
  isFocused.value = false;
  emit('focusout', e);
};

/** 按下槽本体：排除内部按钮起手（按钮已 stopPropagation，这里再按标签兜一层） */
const handlePointerDown = (e: PointerEvent) => {
  if ((e.target as HTMLElement).closest('button')) return;
  emit('pointerdown', e);
};
</script>
