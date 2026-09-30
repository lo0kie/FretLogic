<template>
  <Teleport :disabled="disabledTeleport" :to="teleportTo">
    <Transition
      @after-enter="emit('opened')"
      @after-leave="handleAfterLeave()"
      @before-enter="emit('open')"
      @before-leave="emit('close')"
      name="v-transition-modal"
    >
      <div
        v-bind="$attrs"
        v-if="preserveOnClose || visible"
        v-show="visible"
        :class="overlayAlignClass"
        :style="{ zIndex: overlayZ > 0 ? overlayZ : undefined }"
        @click.self="handleMaskClick($event)"
        @mousedown="handleMaskMousedown($event)"
        @mouseup="handleMaskMouseup($event)"
        class="modal-overlay-container fixed inset-0 z-overlay flex overflow-y-auto bg-overlay p-md"
        ref="overlayRef"
      >
        <!-- 关闭（leave）期间禁用高度接管：expanded 联动 visible，避免退场动画进行中卡片被高度压 0 裁没。
             卡片带视口上限（VIEWPORT_MAX_HEIGHT_CLASS，取值与理由见脚本那份注释）：固定高度那档
             （`height` prop）只有它一条约束；auto-height 档另由下面正文层挂同值上限负责，
             因为 v-auto-height 量的是正文层、量出来的值本身就 ≤ 上限。 -->
        <div
          v-auto-height="{ expanded: visible, disabled: !isAutoHeight || !visible, transition: false }"
          :aria-label="hasOwnTitleEl ? undefined : '对话框'"
          :aria-labelledby="hasOwnTitleEl ? titleId : undefined"
          :class="VIEWPORT_MAX_HEIGHT_CLASS"
          :style="[sizeStyle, topStyle]"
          @click.stop
          @keydown="handleKeydownTrap($event)"
          aria-modal="true"
          class="modal-card relative z-panel flex flex-col overflow-hidden rounded-lg border border-glass-border bg-surface-panel shadow-floating outline-none"
          ref="modalCardRef"
          role="dialog"
          tabindex="-1"
        >
          <!-- auto-height 档：正文层同样带上限，且**保持 shrink-0**。
               上限必须落在这一层而不是只落在卡片上 —— v-auto-height 量的是本层，而卡片的
               overflow-hidden 只裁不滚：本层若不被钳住，内容超出上限时 footer 会被顶到卡片之外、
               直接裁掉（卡片看起来「少了一截」）。挂上限后本层的实高 = min(内容, 上限)，量出来仍是
               真的：内容缩回上限以内时它跟着缩，RO 照常通知 v-auto-height 改卡片高度。
               保留 shrink-0 而不是换成 min-h-0：收缩会让本层的实高变成「卡片当时的高度」，
               v-auto-height 从此量到自己上一帧写下的值（内容变高也不再长高）。
               真正让出空间的是里面那个正文滚动容器 —— 它带 min-h-0，本层被钳住时由它自己滚。 -->
          <div
            :class="[isAutoHeight ? 'h-auto shrink-0' : 'min-h-0 flex-1', isAutoHeight && VIEWPORT_MAX_HEIGHT_CLASS]"
            class="flex w-full flex-col"
          >
            <div
              v-if="hasHeader"
              class="modal-header-zone flex min-h-[3.1rem] shrink-0 items-center justify-between gap-lg px-xl pt-xl"
            >
              <slot :title-id name="header">
                <!-- `overflow-hidden` 是兜底，不是版式：`min-w-0 flex-1` 只让本盒**能被压窄**，
                     压窄之后里面那棵子树照样按自己的宽度画 —— 文字标题自带 `truncate`、收尾会打省略号，
                     而自定义标题（如 `v-chord-name` 渲染的 inline-flex，子项全是 whitespace-nowrap）
                     既不折行也不缩，会直接盖到右侧组（复选框 / 关闭钮）上。
                     这里裁掉越界部分，而不是让它去挤右侧：右侧是操作区，宁可标题少一截也不能点不到。
                     标题要完整显示，得由消费方自己腾地方（见「指法删除」把「全选」挪进正文计数行）。 -->
                <div class="modal-header-left flex min-w-0 flex-1 items-center overflow-hidden">
                  <slot :title-id name="title">
                    <h3
                      v-if="title"
                      :title
                      :id="titleId"
                      class="modal-title m-0 truncate text-sm/tight font-bold tracking-tight text-fg-title"
                    >
                      {{ title }}
                    </h3>
                  </slot>
                </div>
                <div
                  :class="CONTROL_MIN_HEIGHT_CLASSES.sm"
                  class="modal-header-right flex shrink-0 items-center gap-sm"
                >
                  <slot name="header-extra" />
                  <ActionButton
                    v-if="!hideClose"
                    :disabled="closeButtonDisabled || closeLocked"
                    @click="close('close')"
                    icon-only
                    appearance="ghost"
                    aria-label="关闭"
                    icon="x"
                    icon-inset="sm"
                    icon-size="xl"
                    icon-stroke="bold"
                    size="sm"
                    title="关闭"
                  />
                </div>
              </slot>
            </div>

            <!-- 边缘羽化随 axis 默认开启（不写 :fade="false"）：正文是弹窗内容的滚动出口，而
                 `scrollbar="false"` 让自绘滚动条也不出现，羽化是「这一侧还能滚」的唯一线索。
                 与内层滚动区不重复：内容里若另有自带 max-h 的列表（分组列表 / 引用列表），
                 实际滚动的是那个列表、正文不溢出 —— 羽化只在溢出侧显示，两层不会同时出现。 -->
            <BaseScrollArea
              :class="[
                {
                  // body 四向 padding 独立推导：贴卡片边缘恒为 xl，与相邻区块之间有内容时 lg、
                  // 空内容垫片时 sm；缺 header/footer 的方向升级为贴边 xl，避免间距塌陷
                  'pt-lg': hasHeader && !!$slots['default'],
                  'pt-sm': hasHeader && !$slots['default'],
                  'pt-xl': !hasHeader,
                  'pb-lg': !hideFooter && !!$slots['default'],
                  'pb-sm': !hideFooter && !$slots['default'],
                  'pb-xl': hideFooter,
                },
                // min-h-0 恒挂：正文要能在卡片被视口上限钳住时让出空间、由 BaseScrollArea 注入的
                // overflow-y 接管滚动（缘由见上方正文层那段说明）。不挂时 min-height:auto 就等于
                // 内容高度，收缩无从发生 —— footer 会被顶到卡片之外、被 overflow-hidden 裁掉
                'min-h-0',
                isAutoHeight ? 'h-auto max-h-[calc(800px-8rem)]' : 'flex-1',
              ]"
              :scrollbar="false"
              axis="y"
              class="modal-body-scrollable flex flex-col px-xl"
            >
              <slot />
            </BaseScrollArea>

            <!-- 窄屏（< sm，640px）改为**整行堆叠**：按钮行装不下时，`justify-end` 的溢出方向是**左侧**
                 —— 负向溢出既不计入 `scrollWidth`（量不出来），又被卡片的 `overflow-hidden` 裁掉，
                 最左那枚按钮既看不见也点不到；而卡片因自身 `overflow-hidden` 失去自动最小尺寸
                 （该尺寸只在 `overflow: visible` 时生效），会一路缩到视口宽度，窄视口下「装不下」必然发生。
                 用堆叠而不是折行：按钮行天然右对齐，折行会在末行留一枚孤零零的按钮、观感零碎；
                 整行堆叠是移动端弹窗的常规形态。断点取 `sm` 是因为 640px 起卡片恒为 480 档、
                 按钮行必能排成一行。`flex-wrap` 留作最后兜底：真出现比卡片还宽的按钮行时，
                 宁可折行也不要被裁掉。

                 堆叠方向取 `flex-col-reverse` 而非 `flex-col`：DOM 次序恒为「取消 → 确认」
                 （宽屏那一行要的就是这个左右次序），反转后窄屏自上而下变成「确认 → 取消」
                 —— 主要动作排在前面，次要的取消垫底。**不要**为此把 DOM 改成「确认 → 取消」：
                 那会让宽屏变成「确认在左、取消在右」，与全站按钮行的「次要左、主要右」相反。
                 代价是窄屏下 Tab 次序（仍按 DOM：取消 → 确认）与视觉次序相反，这是反转布局的固有取舍；
                 本弹窗的关闭路径还有 X / 遮罩 / Esc，键盘用户不依赖这一行。 -->
            <div
              v-if="!hideFooter"
              class="modal-footer-zone flex w-full shrink-0 flex-wrap items-center justify-end gap-sm px-xl pt-0 pb-xl max-sm:flex-col-reverse max-sm:items-stretch"
            >
              <slot name="footer">
                <slot name="cancel-btn">
                  <ActionButton
                    :disabled="cancelButtonDisabled || closeLocked"
                    :label="cancelText"
                    @click="close('cancel')"
                    appearance="default"
                  />
                </slot>

                <slot name="confirm-btn">
                  <ActionButton
                    :color="confirmColor"
                    :disabled="confirmButtonDisabled || confirmLoading"
                    :label="confirmText"
                    :loading="confirmLoading"
                    @click="handleConfirm()"
                    appearance="subtle"
                  />
                </slot>
              </slot>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts">
// 双 script 块的 SFC 视为同一模块：import 必须整体置于第一个块顶部（import/first），
// 下方 <script setup> 直接复用这些绑定
import { computed, useId, useSlots, useTemplateRef } from 'vue';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { CONTROL_MIN_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';
import {
  useOverlayCloseGuard,
  useOverlayEscape,
  useOverlayFocusTrap,
  useOverlayMaskClose,
} from '@/platform/ui/overlay/overlayGuards';
import { useOverlayLifecycle } from '@/platform/ui/overlay/overlayLifecycle';
import { isTopOverlay } from '@/platform/ui/overlay/overlayStack';
import { closeAllPopovers } from '@/platform/ui/popover/popoverRegistry';
import { isNumber, isString } from '@/platform/utils/common';

import type { ModalCloseReason } from './modalCloseReason';
import type { ThemeColor } from '@/platform/types';

// （ModalCloseReason 类型在 ./modalCloseReason.ts，<script setup> 内不允许 export）
</script>

<script setup lang="ts">
defineOptions({ inheritAttrs: false });
const visible = defineModel<boolean>('visible', { required: true });
const props = withDefaults(
  defineProps<{
    /** 弹窗标题（配合默认 footer 或独立使用） */
    title?: string;
    /** 宽度预设档位（sm 380 / md 480 / lg 640 / xl 840 / 2xl 1080 / full 1320 px），
     *  也支持自定义：number 视为 px，字符串如 "520px" 直接生效 */
    width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | (string & {}) | number;
    /** 高度预设别名或自定义值：number 视为 px，字符串原样生效 */
    height?: 'h-auto' | 'h-sm' | 'h-md' | 'h-lg' | 'h-xl' | 'h-full' | (string & {}) | number;
    /** 隐藏底部按钮区（取消/确认） */
    hideFooter?: boolean;
    /** 隐藏右上角关闭（X）按钮 */
    hideClose?: boolean;
    /** 取消按钮文案 */
    cancelText?: string;
    /** 确认按钮文案 */
    confirmText?: string;
    /** 确认按钮语义色（如 primary / danger，见 ThemeColor） */
    confirmColor?: ThemeColor;
    /** 点击蒙层时保持打开 */
    keepOnMask?: boolean;
    /** 禁用 Esc 键关闭；禁用后仅能通过遮罩/按钮关闭 */
    noKeyboard?: boolean;
    /** 确认按钮 Loading 态：为 true 时确认按钮显示加载并禁止重复触发，同时屏蔽遮罩/ESC 关闭 */
    confirmLoading?: boolean;
    /** 禁用确认按钮（不阻塞遮罩/ESC 关闭） */
    confirmButtonDisabled?: boolean;
    /** 禁用取消按钮 */
    cancelButtonDisabled?: boolean;
    /** 禁用右上角关闭（X）按钮（仅影响 X，不阻塞遮罩/ESC/取消关闭） */
    closeButtonDisabled?: boolean;
    /** 锁定关闭：禁用所有用户关闭路径（X / 取消 / 遮罩 / ESC），仅允许父级程序化置 v-model 关闭 */
    closeLocked?: boolean;
    /** 关闭前拦截：返回 false 或 Promise<false> 可阻止关闭（取消按钮、遮罩、ESC、X 均生效） */
    beforeClose?: () => boolean | Promise<boolean>;
    /** Teleport 挂载目标，默认 'body' */
    teleportTo?: string | HTMLElement;
    /** 禁用 Teleport，在当前父节点就地渲染 */
    disabledTeleport?: boolean;
    /** 顶部对齐展示（默认垂直居中） */
    topAligned?: boolean;
    /** 自定义顶部距离（如 "100px" 或 100），传入后自动顶部对齐 */
    top?: string | number;
    /** 关闭时保留内部 DOM（默认关闭即销毁） */
    preserveOnClose?: boolean;
  }>(),
  {
    title: '',
    width: 'md',
    height: 'h-auto',
    hideFooter: false,
    hideClose: false,
    cancelText: '取消',
    confirmText: '确认',
    confirmColor: 'primary',
    keepOnMask: false,
    noKeyboard: false,
    confirmLoading: false,
    confirmButtonDisabled: false,
    cancelButtonDisabled: false,
    closeButtonDisabled: false,
    closeLocked: false,
    teleportTo: 'body',
    disabledTeleport: false,
    topAligned: false,
    top: undefined,
    preserveOnClose: false,
  }
);
const emit = defineEmits<{
  (e: 'confirm'): void;
  /** 关闭时携带来源（取消按钮/X/蒙层/ESC），程序化置 visible=false 不触发 */
  (e: 'cancel', reason: ModalCloseReason): void;
  (e: 'open'): void;
  (e: 'opened'): void;
  (e: 'close'): void;
  (e: 'closed'): void;
}>();

defineSlots<{
  /** 主内容 */
  'default'?: () => unknown;
  /** 整条头部；提供后不再渲染内置标题行 */
  'header'?: (props: { titleId: string }) => unknown;
  /** 标题内容；缺省渲染 title 文本。回传标题元素 id，供宿主自行拼 aria-labelledby */
  'title'?: (props: { titleId: string }) => unknown;
  /** 头部右侧附加内容，渲染在关闭按钮之前 */
  'header-extra'?: () => unknown;
  /** 底部操作区；缺省渲染内置取消/确认按钮 */
  'footer'?: () => unknown;
  /** 底栏取消按钮内容 */
  'cancel-btn'?: () => unknown;
  /** 底栏确认按钮内容 */
  'confirm-btn'?: () => unknown;
}>();

const slots = useSlots();
const overlayRef = useTemplateRef<HTMLDivElement>('overlayRef');
const modalCardRef = useTemplateRef<HTMLDivElement>('modalCardRef');
const titleId = `base-modal-title-${useId()}`;

// 自适应高度与过渡：未指定固定高度时实时同步内部内容尺寸并平滑过渡
const isAutoHeight = computed(() => {
  const h = props.height;
  if (!h || h === 'h-auto') return true;
  if (isString(h) && HEIGHT_MAP[h]?.startsWith('auto')) return true;
  return false;
});

const isCentered = computed(() => !props.topAligned && props.top === undefined);

const overlayAlignClass = computed(() => {
  if (isCentered.value) return 'items-center justify-center';

  return 'items-start justify-center';
});

const topStyle = computed(() => {
  if (props.top !== undefined) {
    const t = isNumber(props.top) ? `${props.top}px` : props.top;
    return { marginTop: t };
  }
  if (props.topAligned) return { marginTop: '96px' };

  return {};
});

// 预设尺寸映射（语义档位，全固定像素，不随视口变化）
const WIDTH_MAP: Record<string, string> = {
  'sm': '380px',
  'md': '480px',
  'lg': '640px',
  'xl': '840px',
  '2xl': '1080px',
  'full': '1320px',
};
const HEIGHT_MAP: Record<string, string> = {
  'h-auto': 'auto',
  'h-sm': '320px',
  'h-md': '480px',
  'h-lg': '640px',
  'h-xl': '800px',
  'h-full': '800px',
};

/**
 * 弹窗高度的**视口上限**：`100dvh` 减掉遮罩容器那一圈 `p-md`（遮罩是 `fixed inset-0` + `p-md`，
 * 它的内容盒高度就是这个值）。卡片与正文层共用这一份，两处的分工见模板注释。
 *
 * 取 `dvh` 而不是 `vh`：移动端 `vh` 是**大**视口（地址栏收起时的高度），按它限高，地址栏一展开
 * 卡片照样超出屏幕；dvh 跟着当前可视高度走。
 *
 * 不做「仅窄屏」的宽度断点：视口够高时这条上限根本够不着（弹窗高度由内容与正文那条 800px − 8rem
 * 里更紧的一条决定），只有视口真被压矮时才接管 —— 而「窗口够宽但够矮」（手机横屏、桌面窗口拖矮）
 * 用宽度断点正好漏掉。
 */
const VIEWPORT_MAX_HEIGHT_CLASS = 'max-h-[calc(100dvh-2*var(--spacing-md))]';

const sizeStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {};
  const w = props.width;
  if (isNumber(w)) style['width'] = `${w}px`;
  else if (w) style['width'] = WIDTH_MAP[w] ?? w;

  const h = props.height;
  if (isNumber(h)) style['height'] = `${h}px`;
  else if (h && HEIGHT_MAP[h]) {
    // 'auto' 不写死高度：交由 v-auto-height 测量内容并过渡
    if (HEIGHT_MAP[h] !== 'auto') style['height'] = HEIGHT_MAP[h];
  } else if (isString(h) && h) style['height'] = h;
  return style;
});

const hasHeader = computed(() =>
  Boolean(slots['header'] || slots['header-extra'] || slots['title'] || props.title || !props.hideClose)
);

/**
 * 带 `titleId` 的那个内置 `<h3>` 是否真的会渲染 —— 只有它渲染时 `aria-labelledby` 才指向一个
 * 存在的元素。用了 `#title` 插槽就由调用方接管头部，内置 `<h3>`（连同它的 `titleId`）不再存在：
 * 此时若仍下发 `aria-labelledby`，指向的是一个不存在的 id，对话框等于**没有可访问名**。
 * 故「有无标题」不能按 `title || $slots['title']` 判，得按「内置标题元素是否落地」判：
 * 插槽那条路径回落到 `aria-label="对话框"`（通用名，但至少存在），而不是两边都关掉。
 * 插槽作用域里给了 `title-id`，调用方想拿到具体名字就把它绑到自己的标题元素上。
 */
const hasOwnTitleEl = computed(() => Boolean(props.title) && !slots['title']);

// ---------- 共享浮层生命周期与交互守卫（唯一来源：platform/ui/overlay/*） ----------
const close = useOverlayCloseGuard({
  visible,
  isLocked: () => props.closeLocked,
  getBeforeClose: () => props.beforeClose,
  onCancel: reason => emit('cancel', reason),
});

// confirmLoading 一并屏蔽 ESC 与遮罩关闭（见 props 文档）：导出/提交进行中关掉弹窗，
// 重开时 open() 会把业务 busy 标记回落 pristine，同一份数据会被并发提交两次
const handleEscape = useOverlayEscape({
  enabled: () => !props.noKeyboard && !props.closeLocked && !props.confirmLoading,
  isTop: () => isTopOverlay(overlayRef.value),
  close,
});

const { overlayZ, handleAfterLeave } = useOverlayLifecycle({
  visible,
  overlayRef,
  // 初始焦点落在对话框卡片（带 tabindex="-1"）而非外层遮罩容器：后者不可聚焦，focus() 无效
  panelRef: modalCardRef,
  onEscape: handleEscape,
  locksBody: () => true,
  // 打开瞬间收拢全局存量 Popover（与 BaseDrawer 同口径）：弹窗仍是 z-index 路径，而非模态浮层已改走
  // top-layer —— top-layer 恒在一切 z-index 之上，先开着的菜单 / 下拉若留着，会浮在弹窗之上。
  // 收拢后「模态之上不残留浮层」这条既有保证得以维持。
  onOpen: () => closeAllPopovers(),
  onAfterLeave: () => emit('closed'),
});

const handleKeydownTrap = useOverlayFocusTrap(modalCardRef);

const { handleMaskMousedown, handleMaskMouseup, handleMaskClick } = useOverlayMaskClose({
  canClose: () => !props.keepOnMask && !props.closeLocked && !props.confirmLoading,
  close,
});

/** 确认按钮：loading 中防重复，派发 confirm */
const handleConfirm = () => {
  if (props.confirmLoading) return; // 防止重复触发
  emit('confirm');
};
</script>
