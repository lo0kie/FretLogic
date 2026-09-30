<template>
  <!-- 全局浮层容器：同时承载两类反馈，二者共用同一 Teleport、同一锚点与层级。
       宽屏锚在右上角；窄屏（< md）横向改为居中、两侧外边距相等（见 NARROW_CENTER_CLASS）。
       单一 TransitionGroup 渲染「常驻通知在上、瞬时 Toast 在下」的合并序列：
       任意一条增删时，其余卡片（含跨段的 Toast）由 -move 自动平滑补位，无需手动 FLIP。
       调用方仍走 uiStore.message.* / uiStore.notice.*，API 不变。 -->
  <Teleport :disabled="disabledTeleport" to="body">
    <div
      :class="positionClass"
      :style="positionStyle"
      data-overlay-exempt
      class="pointer-events-none fixed z-toast flex max-h-[calc(100vh-2rem)] flex-col gap-md select-none"
    >
      <!-- 合并反馈区域。self-stretch 撑满外层宽度使右边缘恒定（外层 right 锚定不动），
           离场卡片才能以 right 钉位不随容器塌缩漂移；items-end 让卡片保持右对齐。
           窄屏（< md）换成 items-center：外层横向锚点已改成居中（见 NARROW_CENTER_CLASS），
           右对齐会让卡片贴着整幅视口的右缘、左右留白反而更不对称。 -->
      <div
        :aria-label="`系统反馈（通知 ${displayedNotices.length} 条、提示 ${displayedMessages.length} 条）`"
        :class="isMobile ? 'items-center' : 'items-end'"
        @focusin="store.pauseAllTimers()"
        @focusout="handleFeedFocusOut($event)"
        @mouseenter="store.pauseAllTimers()"
        @mouseleave="store.resumeAllTimers()"
        class="pointer-events-none relative flex max-h-[80vh] flex-col gap-sm self-stretch"
        role="region"
      >
        <TransitionGroup :name="transitionName" @before-leave="pinLeavingEl($event)">
          <!-- 常驻通知段：notices 以 unshift 入队（最新在前），数组顺序即展示顺序 -->
          <div
            v-for="notice in displayedNotices"
            :class="notice.message || notice.actionText ? 'items-start' : 'items-center'"
            :key="`notice-${notice.id}`"
            :role="notice.type === 'error' || notice.type === 'warning' ? 'alert' : 'status'"
            class="pointer-events-auto relative flex w-[20rem] max-w-[90vw] shrink-0 gap-sm rounded-xl border border-glass-border bg-surface-panel px-md py-sm text-xs shadow-md transition-all duration-base outline-none"
          >
            <span class="flex shrink-0 items-center justify-center self-center">
              <BaseIcon
                :class="levelClass(notice.type)"
                :name="levelIcon(notice.type)"
                aria-hidden="true"
                icon-size="2xl"
              />
            </span>

            <div class="flex min-w-0 flex-1 shrink-0 flex-col">
              <span class="text-xs/relaxed font-semibold wrap-break-word">{{ notice.title }}</span>
              <span
                v-if="notice.message"
                class="mt-2xs text-2xs/relaxed font-normal wrap-break-word whitespace-pre-line opacity-80"
              >
                {{ notice.message }}
              </span>
              <div v-if="notice.actionText" class="mt-xs flex items-center gap-sm">
                <ActionButton
                  :label="notice.actionText"
                  :loading="isNoticeActionPending(notice.id)"
                  @click="handleNoticeAction(notice)"
                  appearance="subtle"
                  size="sm"
                />
              </div>
            </div>

            <ActionButton
              :aria-label="`关闭通知：${notice.title}`"
              @click="store.dismissNotice(notice.id)"
              icon-only
              appearance="ghost"
              icon="x"
              icon-stroke="bold"
              size="sm"
              title="关闭"
            />
          </div>

          <!-- 瞬时 Toast 段：messages 以 push 入队（最新在末），数组顺序即展示顺序。
               id 空间与 notice 独立，key 加前缀防碰撞 -->
          <div
            v-for="(item, index) in displayedMessages"
            :class="[
              'bg-surface-panel text-fg-title',
              // 有描述时切成多行卡片形态：条件写在分支里，而不是用 ! 去压基类的单行胶囊形态。
              // 宽度上限两档都必须带视口项：浮层是 `fixed`，宽屏档靠 `right-lg` 锚定、可用宽度只有
              // 「视口 − lg」；而卡片在 cross axis 上不 stretch（合并区 `items-end` / 窄屏
              // `items-center`），宽度由自身 max-content 与 max-width 决定、**不受容器宽度约束** ——
              // 上限写成纯 rem（22rem = 489.5px）时，窄屏下它比可用宽度还大，等于没有上限，
              // 卡片会溢出容器（`items-end` 的溢出方向是起始侧，于是贴到屏幕外）。90vw 与常驻通知段同档。
              item.description
                ? 'w-auto max-w-[90vw] items-start rounded-xl py-md'
                : 'max-w-[min(22rem,90vw)] items-center rounded-pill py-sm',
              messageStack && index < displayedMessages.length - 1 ? 'scale-[0.98] opacity-90' : '',
              item.customClass,
            ]"
            :key="`message-${item.id}`"
            :role="item.type === 'error' || item.type === 'warning' ? 'alert' : 'status'"
            class="pointer-events-auto relative flex shrink-0 gap-sm border border-glass-border px-md text-xs font-semibold shadow-md transition-all duration-base outline-none"
          >
            <div :class="item.description ? 'pt-3xs' : 'pt-0.5'" class="flex shrink-0 items-center justify-center">
              <BaseIcon
                :class="messageIconClass(item)"
                :name="messageIconName(item)"
                aria-hidden="true"
                icon-size="xl"
              />
            </div>

            <!-- 文本区：无描述时为单行跑马灯胶囊；有描述时标题单行跑马灯 + 描述换行。
                 v-marquee 内置溢出检测与无缝循环，文本超出容器宽度自动横向滚动，close 紧贴文本区末缘不再被撑远 -->
            <div v-marquee.fade.fast.always.once v-if="!item.description" class="flex min-w-0 flex-1 items-center">
              {{ item.msg }}
            </div>
            <div v-else class="flex min-w-0 flex-1 shrink flex-col">
              <div v-marquee.fade="{ mode: 'always', loopMode: 'continuous' }" class="flex min-w-0 items-center">
                {{ item.msg }}
              </div>
              <span class="mt-2xs text-2xs/relaxed font-normal wrap-break-word whitespace-normal opacity-85">
                {{ item.description }}
              </span>
            </div>

            <ActionButton
              v-if="item.onAction"
              :aria-label="`${item.actionText ?? '确定'}操作`"
              :label="item.actionText"
              :loading="isMessageActionPending(item.id)"
              @click="handleMessageAction(item)"
              compacted
              appearance="text"
              class="self-center"
              size="sm"
            />

            <ActionButton
              v-if="item.closable"
              :class="item.description ? 'self-start pt-3xs' : 'self-center'"
              @click="store.removeMessage(item.id)"
              icon-only
              appearance="ghost"
              aria-label="关闭提示"
              icon="x"
              icon-size="lg"
              icon-stroke="bold"
              size="sm"
              title="关闭"
            />
          </div>
        </TransitionGroup>

        <!-- 通知清空入口：置于合并序列之后，只统计常驻通知。
             对齐跟随合并区：窄屏居中（见 NARROW_CENTER_CLASS），否则会贴在整幅视口的右缘。 -->
        <ActionButton
          v-if="store.notices.length > 1"
          :class="isMobile ? 'self-center' : 'self-end'"
          :label="`清空全部（${store.notices.length}）`"
          @click="store.dismissAllNotices()"
          appearance="ghost"
          class="pointer-events-auto"
          size="sm"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { runBusyAction } from '@/platform/composables/runBusyAction';
import { useResponsive } from '@/platform/composables/useResponsive';
import { useUiStore } from '@/platform/store/uiStore';
import { MessageType } from '@/platform/types';
import { hasOwn } from '@/platform/utils/common';

import type { Message, Notice, NoticeType } from '@/platform/types';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { Ref } from 'vue';

type FloatPosition = 'top-center' | 'top-right' | 'top-left' | 'bottom-center' | 'bottom-right' | 'bottom-left';

const props = withDefaults(
  defineProps<{
    /** 浮层（通知 + Toast 共用）的屏幕方位，默认右上角 */
    position?: FloatPosition;
    /** 禁用 Teleport，在原地渲染 */
    disabledTeleport?: boolean;
    /** 常驻通知同时展示条数上限；队列本身仍全量保留，关闭前面的会补位 */
    maxCount?: number;
    /** 瞬时 Toast 同时展示条数上限 */
    messageMaxCount?: number;
    /** Toast 是否开启层叠微缩微动效 */
    messageStack?: boolean;
  }>(),
  {
    position: 'top-right',
    disabledTeleport: false,
    maxCount: 4,
    messageMaxCount: 5,
    messageStack: false,
  }
);

const store = useUiStore();
/** 手机档（< md）：与浮层 / 表单 / 预览缩放同一口径（见 useResponsive），本组件只用来切横向锚点 */
const { isMobile } = useResponsive();

/** notices 以 unshift 入队（最新在前），故取前 N 条而非末 N 条 */
const displayedNotices = computed(() => (props.maxCount > 0 ? store.notices.slice(0, props.maxCount) : store.notices));
/** messages 以 push 入队（最新在末），取末 N 条 */
const displayedMessages = computed(() => {
  if (!props.messageMaxCount || props.messageMaxCount <= 0) return store.messages;
  return store.messages.slice(-props.messageMaxCount);
});

// ---- 方位/动效：通知与 Toast 共用同一锚点，仅由 position 决定 ----
const POSITION_CLASS_MAP: Record<string, string> = {
  'top-right': 'right-lg items-end',
  'top-left': 'left-lg items-start',
  'bottom-center': 'left-1/2 -translate-x-1/2 items-center',
  'bottom-right': 'right-lg items-end',
  'bottom-left': 'left-lg items-start',
  'top-center': 'left-1/2 -translate-x-1/2 items-center',
};
const positionClassFor = (pos: string) => POSITION_CLASS_MAP[pos] ?? POSITION_CLASS_MAP['top-right'];
const positionStyleFor = (pos: string) =>
  pos.startsWith('bottom')
    ? { bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }
    : { top: 'calc(1rem + env(safe-area-inset-top, 0px))' };
const transitionNameFor = (pos: string) => (pos.startsWith('bottom') ? 'v-transition-slide-up' : 'v-transition-fly-up');

/**
 * 窄屏（< md）下浮层横向**统一改成居中**，两侧外边距相等。
 *
 * 起因：默认档是 `right-lg`（右对齐、右边距恒为 lg），而卡片的宽度由内容决定 —— 短 Toast
 * 的左边距是「视口 − 卡片宽 − lg」，比右边距大得多，窄屏上观感就是「贴着右边、左边空一大片」。
 *
 * `left-1/2` 把盒子钉在视口中线、`-translate-x-1/2` 再左移自身半宽 → 盒子以中线左右对称；
 * 合并区与卡片都由 `items-center` 在中线上居中，两侧留白因此天然相等（= (100vw − 卡片宽) / 2），
 * 与卡片自身宽度无关。
 *
 * `w-full` 是必需项，不是顺手加的：本盒是 `fixed` + 只给 `left`（不给 `right`），按 shrink-to-fit
 * 规则它的**可用宽度只有半个视口**（50vw），而卡片在 cross axis 上不 stretch —— 宽度由自身
 * max-content 与 `max-width` 决定。于是 `max-w-[90vw]` 那个视口项在窄屏会被二次夹到 50vw，
 * 长文字卡片反而比宽屏还窄（这正是历史片段里记下的「`*-center` 档另有隐患」的成因）；
 * `w-full` 把盒子摊成整幅视口，上限交回给卡片自己的 `max-w-*`。
 *
 * 只覆盖横向锚点：纵向方位（top / bottom）与动效仍按 position 走 —— 底部档的
 * `bottom` 定位与 `v-transition-slide-up` 都不受影响。
 */
const NARROW_CENTER_CLASS = 'left-1/2 w-full -translate-x-1/2';

const positionClass = computed(() => (isMobile.value ? NARROW_CENTER_CLASS : positionClassFor(props.position)));
const positionStyle = computed(() => positionStyleFor(props.position));
const transitionName = computed(() => transitionNameFor(props.position));

// ---- 瞬时 Toast：图标语义（按等级着色，与常驻通知 levelClass 同款 token） ----
const MESSAGE_ICON_MAP: Record<MessageType, { name: IconName; iconClass: string }> = {
  loading: { name: 'loader-2', iconClass: 'animate-spin text-primary' },
  success: { name: 'check-circle-2', iconClass: 'text-success' },
  error: { name: 'alert-circle', iconClass: 'text-danger' },
  warning: { name: 'alert-triangle', iconClass: 'text-warning' },
  // info 等级走独立的 --color-info（此前与 loading 一起借 text-primary，于是「中性告知」与「品牌/进行中」
  // 长得一模一样，语义区分丢失）。neutral 是「无语义等级」，保持不染色、只压一档存在感。
  info: { name: 'info', iconClass: 'text-info' },
  neutral: { name: 'info', iconClass: 'opacity-80' },
};
const messageIconName = (item: Message): IconName => {
  if (item.type === MessageType.LOADING && item.spinner === false) return 'info';
  return MESSAGE_ICON_MAP[item.type]?.name ?? 'info';
};
const messageIconClass = (item: Message): string => {
  if (item.type === MessageType.LOADING && item.spinner === false) return 'opacity-80';
  return MESSAGE_ICON_MAP[item.type]?.iconClass ?? '';
};

// ---- 常驻通知：等级着色 ----
const LEVEL_ICON_MAP: Record<NoticeType, IconName> = {
  info: 'info',
  success: 'check-circle-2',
  warning: 'alert-triangle',
  error: 'alert-circle',
};
const LEVEL_CLASS_MAP: Record<NoticeType, string> = {
  // info 取独立的 --color-info：此前与 primary 同色，让「中性告知」看起来像「品牌主色强调的」，
  // 而通知里已经有 success / warning / error 三支语义色，唯独 info 没有自己的档 —— 属于令牌缺失。
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
};
// `type` 运行时来自 props，TS 的联合类型拦不住模板里的动态绑定 —— 裸查表会把 `constructor`
// 这类继承键命中成 `Object`（truthy，`?? 'info'` 兜不住）。只看自身属性。
const levelIcon = (type: NoticeType): IconName => (hasOwn(LEVEL_ICON_MAP, type) ? LEVEL_ICON_MAP[type] : 'info');
const levelClass = (type: NoticeType): string =>
  hasOwn(LEVEL_CLASS_MAP, type) ? LEVEL_CLASS_MAP[type] : 'text-primary';

// ---- 操作按钮 pending 防重复点击（Toast 与通知各自独立集合，避免 id 碰撞误禁用） ----
const pendingMessageIds = ref<Set<number>>(new Set());
const isMessageActionPending = (id: number) => pendingMessageIds.value.has(id);

const pendingNoticeIds = ref<Set<number>>(new Set());
const isNoticeActionPending = (id: number) => pendingNoticeIds.value.has(id);

/**
 * 把「按条目的 pending 集合」接成 runBusyAction 认得的忙碌位（见其 `lock` 选项）。
 * 忙碌态是分条的（只有被点的那条转圈），一个共享布尔位表达不了，故用判据 + 置位这一对。
 * 集合是响应式的，增删即驱动按钮的 loading。
 */
const pendingLock = (pending: Ref<Set<number>>, id: number) => ({
  isBusy: () => pending.value.has(id),
  setBusy: (busy: boolean) => {
    if (busy) pending.value.add(id);
    else pending.value.delete(id);
  },
});

/**
 * Toast 动作：成功移除；失败保留原条并补弹错误提示避免误判成功。
 * 守卫与「置位 / 复位」交给 runBusyAction（返回 null = 重入被挡下或执行失败，两种都不该移除该条）。
 */
const handleMessageAction = async (item: Message) => {
  // 先取出再判空：`item.onAction` 是可选属性，收进局部常量后闭包里的类型收窄才成立
  const action = item.onAction;
  if (!action) return;
  const done = await runBusyAction({
    lock: pendingLock(pendingMessageIds, item.id),
    run: async () => void (await action()),
    onError: err => {
      console.error('[Message] Action execution failed:', err);
      store.message.error('操作失败，请重试');
    },
  });
  if (done !== null) store.removeMessage(item.id);
};

/** 通知动作：成功移除；失败保留便于重试（不补弹提示——原条仍在，提示是冗余噪音） */
const handleNoticeAction = async (notice: Notice) => {
  const action = notice.onAction;
  if (!action) return;
  const done = await runBusyAction({
    lock: pendingLock(pendingNoticeIds, notice.id),
    run: async () => void (await action()),
    onError: err => console.error('[Notification] Action execution failed:', err),
  });
  if (done !== null) store.dismissNotice(notice.id);
};

/** 反馈容器焦点移出（非内部子元素间移动）时恢复 Toast 销毁计时，满足 WCAG 2.2.1 可暂停 */
const handleFeedFocusOut = (e: FocusEvent) => {
  const container = e.currentTarget as HTMLElement | null;
  if (container && !container.contains(e.relatedTarget as Node | null)) store.resumeAllTimers();
};

/** 离场卡片钉位：TransitionGroup 离场即转 absolute，此时依赖 flex「静态位置」不可靠——
 *  末条离场会让区域/外层右锚定容器瞬间塌缩，静态位置被推到屏幕右缘（表现为向右横跳）。
 *  区域 self-stretch（右边缘恒定），故在离开前按「区域右边缘」采点：
 *  用显式 right/top 钉回原位，宽度一并钉死，转 absolute 后只走 translateY 飞出。 */
const pinLeavingEl = (el: Element) => {
  const node = el as HTMLElement;
  const parent = node.offsetParent as HTMLElement | null;
  if (!parent) return;
  node.style.left = 'auto';
  node.style.right = `${parent.offsetWidth - node.offsetLeft - node.offsetWidth}px`;
  node.style.top = `${node.offsetTop}px`;
  node.style.width = `${node.offsetWidth}px`;
};
</script>
