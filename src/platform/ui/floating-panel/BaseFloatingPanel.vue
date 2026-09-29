<template>
  <!-- 通用贴边浮动面板（平台 UI 原语，与业务无关）：
       贴视口右侧悬浮，不进页面布局、不锁滚动、不阻断背景交互，宿主页面无需让位。
       骨架固定为「头部（标题 + 操作区 + 关闭）/ 主体（自适应撑满）/ 底部（可选）」三段，
       内容全部由插槽注入，组件本身不感知任何业务语义。

       两个可选能力由宿主按需开启：
       - intercept：把面板之外的上/右/下三条留白用「透明拦截层」接管指针事件
         （不填色、不穿透到宿主页面），典型用法是宿主存在拖拽落点、不希望落点被页面元素截获；
       - offsetActive：会话期间（如宿主拖拽进行中）面板整体右移只留一截，避免遮挡宿主内容 -->
  <Teleport :disabled="disabledTeleport" :to="teleportTo">
    <!-- 留白拦截层：只铺「上 / 右 / 下」三条空隙条带，不铺面板本体所占区域
         （让位时面板右移，那块区域要露出宿主内容供落点，铺了就挡住落点了）。
         条带完全透明（不填任何颜色、不挡内容），唯一职责是吃掉落在留白上的指针事件：
         外层 pointer-events-none + 条带 pointer-events-auto。
         层级取 screen 级遮罩层 z-scrim：高于顶栏与普通内容、低于面板（动态池 ≥9999）与弹窗/下拉，
         这样条带只管拦事件，不会反压后来的浮层、拖拽幽灵与全局提示 -->
    <div
      v-if="visibleModel && !noIntercept"
      :class="PANEL_GUTTER_CLASS"
      data-floating-panel-scrim
      class="floating-panel-scrim pointer-events-none fixed inset-0 z-scrim"
    >
      <div :style="stripWidthStyle" class="pointer-events-auto absolute top-0 right-0 h-lg" />
      <div class="pointer-events-auto absolute top-0 right-0 bottom-0 w-(--fp-gutter)" />
      <div :style="stripWidthStyle" class="pointer-events-auto absolute right-0 bottom-0 h-lg" />
    </div>

    <Transition @after-leave="handleAfterLeave()" @before-leave="handleBeforeLeave()" appear name="floating-panel">
      <aside
        v-show="visibleModel"
        :aria-label="title || $slots['title'] ? undefined : '浮动面板'"
        :aria-labelledby="title || $slots['title'] ? titleId : undefined"
        :class="[PANEL_CLASS, offsetActive && 'offset-active']"
        :style="panelStyle"
        data-floating-panel
        popover="manual"
        ref="panelRef"
        role="region"
      >
        <div
          v-if="hasHeader && contentMounted"
          class="floating-panel-header flex shrink-0 items-center justify-between gap-md px-lg pt-lg pb-md"
        >
          <slot :title-id name="title">
            <h3 v-if="title" :id="titleId" class="m-0 truncate text-sm/tight font-bold tracking-tight text-fg-title">
              {{ title }}
            </h3>
          </slot>
          <div class="flex shrink-0 items-center gap-sm">
            <slot name="header-extra" />
            <ActionButton
              v-if="!hideClose"
              :aria-label="closeAriaLabel"
              @click="visibleModel = false"
              icon-only
              icon="x"
              icon-stroke="bold"
              size="md"
              variant="ghost"
            />
          </div>
        </div>

        <div v-if="contentMounted" class="floating-panel-body relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <slot />
        </div>

        <div v-if="$slots['footer'] && contentMounted" class="floating-panel-footer flex w-full shrink-0 items-center">
          <slot name="footer" />
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  ref,
  useId,
  useSlots,
  useTemplateRef,
  watch,
} from 'vue';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import { hideFromTopLayer, showInTopLayer } from '@/platform/ui/popover/topLayer';
import { isNumber } from '@/platform/utils/common';

import { registerPanelEscape } from './escapeDispatcher';

defineOptions({ name: 'BaseFloatingPanel' });

/** 面板可见性（v-model:visible）：模型声明即 props 声明，勿再在 defineProps 里重复写一份 */
const visibleModel = defineModel<boolean>('visible', { required: true });

const props = withDefaults(
  defineProps<{
    /** 面板标题：留空且无 title 插槽时整条头部不渲染（关闭按钮开启时仍渲染以便关闭） */
    title?: string;
    /** 面板宽度：number 视为 px，字符串（如 "480px" / "40vw"）原样生效；上限恒为「视口 − 2×左右留白」（见 PANEL_MAX_WIDTH） */
    width?: string | number;
    /** 让位会话进行中（如宿主拖拽）：面板整体右移，屏内只保留 offsetVisible 那一段 */
    offsetActive?: boolean;
    /** 让位时留在屏内的宽度，用于露出宿主内容与落点 */
    offsetVisible?: string;
    /** 关闭「上/右/下」三条透明拦截条带（关闭后留白上的指针事件会穿透到宿主页面） */
    noIntercept?: boolean;
    /** 隐藏头部关闭按钮 */
    hideClose?: boolean;
    /** 关闭按钮的无障碍标签 */
    closeAriaLabel?: string;
    /** Teleport 挂载目标，默认 'body' */
    teleportTo?: string | HTMLElement;
    /** 禁用 Teleport，在当前父节点就地渲染 */
    disabledTeleport?: boolean;
    /** 关闭后保留内容挂载（不卸载插槽）以保留内部状态（滚动位置 / 输入等）；默认关闭（即卸载） */
    preserveOnClose?: boolean;
  }>(),
  {
    title: '',
    width: 480,
    offsetActive: false,
    offsetVisible: '1.25rem',
    noIntercept: false,
    hideClose: false,
    closeAriaLabel: '关闭',
    teleportTo: 'body',
    disabledTeleport: false,
    preserveOnClose: false,
  }
);

const emit = defineEmits<{
  (e: 'open'): void;
  (e: 'opened'): void;
  (e: 'close'): void;
  (e: 'closed'): void;
}>();

defineSlots<{
  /** 主内容 */
  'default'?: () => unknown;
  /** 标题内容；缺省渲染 title 文本。回传标题元素 id，供宿主自行拼 aria-labelledby */
  'title'?: (props: { titleId: string }) => unknown;
  /** 头部右侧附加内容，渲染在关闭按钮之前 */
  'header-extra'?: () => unknown;
  /** 底部操作区（缺省不渲染底栏） */
  'footer'?: () => unknown;
}>();

const slots = useSlots();
const panelRef = useTemplateRef<HTMLElement>('panelRef');
const titleId = `base-floating-panel-title-${useId()}`;

const hasHeader = computed(() => Boolean(props.title || slots['title'] || slots['header-extra'] || !props.hideClose));

/** 面板宽度（number 视为 px） */
const cssWidth = computed(() => (isNumber(props.width) ? `${props.width}px` : props.width));

/**
 * 面板左右留白 `--fp-gutter` 的**唯一来源**：宽屏一档 `lg`（1rem），窄屏（< md）收到 `sm`（0.5rem）。
 *
 * 同一份值供三处消费，任一处另写一份都会与其余两处错位：
 * ① 面板自身的 `right` 偏移（见 PANEL_CLASS 的 `right-(--fp-gutter)`）；
 * ② 宽度上限（见 PANEL_MAX_WIDTH）；
 * ③ 拦截条带的宽度（见 stripWidthStyle 与那条竖带）。
 *
 * 变量同时挂在**面板与拦截层两个根**上：两者是 Teleport 到同一父节点下的兄弟，谁也继承不到谁 ——
 * 条带要用这个值，就得自己有一份。故这一串写成常量、两处引用，而不是各写一遍字面量。
 *
 * 窄屏收窄的口径与预览区 / 排列区的窄屏留白同源（都是 `lg → sm`，见 ScorePreviewPane 的
 * `max-md:p-sm` 与 ScoreInteractiveArea 的 `max-md:pl-sm`）：手机视口上 1rem 的左右留白
 * 白白吃掉四十余像素的面板宽度。
 */
const PANEL_GUTTER_CLASS = '[--fp-gutter:var(--spacing-lg)] max-md:[--fp-gutter:var(--spacing-sm)]';

/**
 * 面板宽度上限：**视口宽减去左右各一份留白**（留白档位见 PANEL_GUTTER_CLASS）。
 *
 * 面板贴的是 `right-(--fp-gutter)`，上限若只按视口取一个比例（此前是 `92vw`），
 * 窄视口下面板吃满上限时右侧留一份留白、左侧只剩 `8vw − 留白` —— 两侧不等
 * （390px 视口：右 22.25px、左 8.95px，观感就是「左边贴边、右边空一截」）。
 * 取「视口 − 2×留白」后，上限生效时面板左右各恰好一份留白，与贴边那一份同值、左右对称；
 * 宽视口下这条上限够不着，仍是宿主声明的 width。
 *
 * 与 `right` 走**同一个** `--fp-gutter`：改留白档位时不会分叉（写死 `1rem` 就会）。
 * 消费两处必须同源 —— 面板自身与拦截条带（见 stripWidthStyle），否则条带与面板实际占位错位。
 */
const PANEL_MAX_WIDTH = 'calc(100vw - 2 * var(--fp-gutter))';

/** 拦截条带宽度与面板实际占位对齐（面板上限见 PANEL_MAX_WIDTH），再让出右侧那一份留白 */
const stripWidthStyle = computed(() => ({
  width: `calc(min(${cssWidth.value}, ${PANEL_MAX_WIDTH}) + var(--fp-gutter))`,
}));

// ---------- 层叠：与 Popover / 抽屉共享同一条 top-layer 顺序 ----------
// 面板本体带 `popover="manual"`（见模板），层叠来源是浏览器 top-layer 而不是我们分配的层号：
// 打开时它进层，面板内后打开的浮层（下拉、气泡）天然在它之上；关闭时（离场动画结束后）出层。

/**
 * 内容挂载态：控制插槽是否真正渲染（卸载即销毁内部状态）。
 * 初始仅在已打开时挂载；打开前不渲染以省成本。
 * 打开（watch 可见性）即挂载；关闭后仅当 preserveOnClose 关闭时才卸载（handleAfterLeave 里置 false），
 * 否则保留挂载、仅由 v-show 隐藏，内部状态（滚动位置 / 输入）得以保留。
 */
// 有意取一次初始快照：contentMounted 只表示「内容挂载过没有」，此后由开关变化单向前推，
// 不跟随 visible 回退（关掉时是否卸载由 preserveOnClose 决定）
// eslint-disable-next-line vue/no-ref-object-reactivity-loss
const contentMounted = ref(visibleModel.value);

/**
 * 面板内联样式：尺寸与让位偏移 CSS 变量。
 * 注意这里**没有 z-index**：层叠已交给 top-layer（面板上的 `popover="manual"`），
 * 再写一层 z 号只会让「谁压谁」出现两个来源。
 * transform 同样故意不走这里——inline style 优先级高于 class，会把
 * <Transition> 的 enter-from / leave-to 端点 class 压住、掐断进出场动画。
 * 三种位移端点（屏外 / 归位 / 让位）全部由底部 scoped 样式的 class 规则表达。
 */
const panelStyle = computed(() => ({
  width: cssWidth.value,
  maxWidth: PANEL_MAX_WIDTH,
  ...(props.offsetActive ? { '--fp-offset-visible': props.offsetVisible } : {}),
}));

const PANEL_CLASS = `floating-panel fixed top-lg ${PANEL_GUTTER_CLASS} right-(--fp-gutter) bottom-lg flex flex-col overflow-hidden rounded-lg border border-border-light bg-surface-panel shadow-floating transition-transform duration-slow ease-out`;

/** 离场开始：派发 close（位移端点已由 Transition 的 leave-to class 接管） */
const handleBeforeLeave = () => void emit('close');

/** 离场动画结束：出 top-layer，并派发 closed */
const handleAfterLeave = () => {
  // 出层必须晚于动画：popover 一旦不再是 `:popover-open`，UA 的
  // `[popover]:not(:popover-open) { display: none }` 会立刻接管，动画被掐断在半路
  hideFromTopLayer(panelRef.value);
  // preserveOnClose 关闭时此处才真正卸载内容；开启时内容始终保留
  if (!props.preserveOnClose) contentMounted.value = false;
  emit('closed');
};

/**
 * 全局 Esc 分发器中的登记句柄。关闭动作交给分发器统一裁决（「含当前焦点且内联层号最高」的那个面板），
 * 因此这里只声明「本面板可见 + 如何关闭」，不再各自挂一条 window keydown。
 * 非模态面板不抢占宿主页面的 Esc —— 焦点不在任何登记面板内时分发器直接不处理，与原语义一致。
 */
let unregisterEscape: (() => void) | null = null;

/** 登记本面板参与 Esc 关闭（幂等） */
const retainEscape = () => {
  if (unregisterEscape) return;
  const el = panelRef.value;
  if (!el) return;
  unregisterEscape = registerPanelEscape({ el, close: () => (visibleModel.value = false) });
};

/** 释放 Esc 登记（面板不可见 / 组件卸载时） */
const releaseEscape = () => {
  unregisterEscape?.();
  unregisterEscape = null;
};

watch(
  () => visibleModel.value,
  async val => {
    if (!val) {
      releaseEscape();
      // 出 top-layer 在离场动画结束后（见 handleAfterLeave）；此处不出层，
      // 否则动画第一帧就被 UA 的 display:none 掐掉
      return;
    }
    contentMounted.value = true;
    emit('open');
    await nextTick();
    // 进 top-layer：面板是 v-show 的常驻节点，等这一 tick 让 v-show 摘掉 display:none，
    // 元素处于渲染态后再进层（顺序与 BasePopover 一致：先上屏、再进层、再定位）
    showInTopLayer(panelRef.value);
    // 登记排在 nextTick 之后：面板根节点此时才上屏。分发器按「顺序登记表里最后一个仍打开的
    // 面板」挑出响应者，故登记次序必须与进入 top-layer 的先后一致
    retainEscape();
    emit('opened');
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  releaseEscape();
  // 兜底出层：面板在离场动画完成前被卸载时 after-leave 不会触发
  hideFromTopLayer(panelRef.value);
});

/**
 * KeepAlive 停用：宿主页面被缓存切走时摘掉 Esc 登记 —— 面板随页面一起被缓存，
 * 而登记句柄仍指着它，切过去的新页面上按 Esc 会被分发器选中一个根本没在屏幕上的面板。
 * top-layer 状态刻意不动：面板随页面一起被缓存，重新激活时 `showInTopLayer` 是幂等的
 * （已在层内即空操作），出层仍只由 after-leave 与卸载兜底两条路径掌握。
 */
onDeactivated(() => releaseEscape());

/** 重新激活：若仍处于打开态（缓存期间没被关掉）则补回 Esc 登记，幂等 */
onActivated(() => {
  if (visibleModel.value) retainEscape();
});
</script>

<style scoped lang="scss">
.floating-panel {
  // 静止态归位
  transform: translateX(0);

  // 让位会话：右移只留一截（偏移量由 :style 注入的 --fp-offset-visible 变量提供）
  &.offset-active {
    transform: translateX(calc(100% - var(--fp-offset-visible)));
  }

  // 进出场端点：完全右移出屏。
  // 双类特异性压过上面两条静止态规则；Transition 移除 enter-from / 追加 leave-to 即滑入/滑出，
  // 过渡本体沿用 PANEL_CLASS 的 transition-transform duration-slow
  &.floating-panel-enter-from,
  &.floating-panel-leave-to {
    transform: translateX(calc(100% + 1rem));
  }
}
</style>
