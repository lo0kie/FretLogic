<template>
  <!-- 全局浮层容器：同时承载两类反馈，二者共用同一 Teleport、同一右上角锚点与层级。
       单一 TransitionGroup 渲染「常驻通知在上、瞬时 Toast 在下」的合并序列：
       任意一条增删时，其余卡片（含跨段的 Toast）由 -move 自动平滑补位，无需手动 FLIP。
       调用方仍走 uiStore.message.* / uiStore.notice.*，API 不变。 -->
  <Teleport :disabled="!teleport" to="body">
    <div
      :class="positionClass"
      :style="positionStyle"
      data-overlay-exempt
      class="pointer-events-none fixed z-toast flex max-h-[calc(100vh-2rem)] flex-col gap-md select-none"
    >
      <!-- 合并反馈区域。self-stretch 撑满外层宽度使右边缘恒定（外层 right 锚定不动），
           离场卡片才能以 right 钉位不随容器塌缩漂移；items-end 让卡片保持右对齐 -->
      <div
        :aria-label="`系统反馈（通知 ${displayedNotices.length} 条、提示 ${displayedMessages.length} 条）`"
        @focusin="store.pauseAllTimers()"
        @focusout="handleFeedFocusOut($event)"
        @mouseenter="store.pauseAllTimers()"
        @mouseleave="store.resumeAllTimers()"
        class="pointer-events-none relative flex max-h-[80vh] flex-col items-end gap-sm self-stretch"
        role="region"
      >
        <TransitionGroup :name="transitionName" @before-leave="pinLeavingEl($event)">
          <!-- 常驻通知段：notices 以 unshift 入队（最新在前），数组顺序即展示顺序 -->
          <div
            v-for="notice in displayedNotices"
            :key="`notice-${notice.id}`"
            :role="notice.type === 'error' || notice.type === 'warning' ? 'alert' : 'status'"
            class="pointer-events-auto relative flex w-[20rem] max-w-[90vw] shrink-0 items-start gap-sm rounded-xl border border-glass-border bg-surface-panel px-md py-sm text-xs shadow-md transition-all duration-base outline-none"
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
                  size="sm"
                  variant="subtle"
                />
              </div>
            </div>

            <ActionButton
              :aria-label="`关闭通知：${notice.title}`"
              @click="store.dismissNotice(notice.id)"
              icon-only
              icon="x"
              icon-stroke="bold"
              size="sm"
              title="关闭"
              variant="ghost"
            />
          </div>

          <!-- 瞬时 Toast 段：messages 以 push 入队（最新在末），数组顺序即展示顺序。
               id 空间与 notice 独立，key 加前缀防碰撞 -->
          <div
            v-for="(item, index) in displayedMessages"
            :class="[
              'bg-surface-panel text-fg-title',
              item.description ? 'w-auto! items-start! rounded-xl! py-md!' : '',
              messageStack && index < displayedMessages.length - 1 ? 'scale-[0.98] opacity-90' : '',
              item.customClass,
            ]"
            :key="`message-${item.id}`"
            :role="item.type === 'error' || item.type === 'warning' ? 'alert' : 'status'"
            class="pointer-events-auto relative flex max-w-[22rem] shrink-0 items-center gap-sm rounded-pill border border-glass-border px-lg py-sm text-xs font-semibold shadow-md transition-all duration-base outline-none"
          >
            <div :class="{ 'pt-3xs!': item.description }" class="flex shrink-0 items-center justify-center pt-0.5">
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
              class="self-center"
              size="sm"
              variant="text"
            />

            <ActionButton
              v-if="item.closable"
              :class="item.description ? 'self-start! pt-3xs!' : 'self-center'"
              @click="store.removeMessage(item.id)"
              icon-only
              aria-label="关闭提示"
              icon="x"
              icon-stroke="bold"
              size="sm"
              title="关闭"
              variant="ghost"
            />
          </div>
        </TransitionGroup>

        <!-- 通知清空入口：置于合并序列之后，只统计常驻通知 -->
        <ActionButton
          v-if="store.notices.length > 1"
          :label="`清空全部（${store.notices.length}）`"
          @click="store.dismissAllNotices()"
          class="pointer-events-auto self-end"
          size="sm"
          variant="ghost"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { useUiStore } from '@/platform/store/uiStore';
import { MessageType } from '@/platform/types';

import type { Message, Notice, NoticeType } from '@/platform/types';
import type { IconName } from '@/platform/ui/icons/icons.registry';

type FloatPosition = 'top-center' | 'top-right' | 'top-left' | 'bottom-center' | 'bottom-right' | 'bottom-left';

const props = withDefaults(
  defineProps<{
    /** 浮层（通知 + Toast 共用）的屏幕方位，默认右上角 */
    position?: FloatPosition;
    /** 是否 Teleport 到 body；设为 false 时在原地渲染 */
    teleport?: boolean;
    /** 常驻通知同时展示条数上限；队列本身仍全量保留，关闭前面的会补位 */
    maxCount?: number;
    /** 瞬时 Toast 同时展示条数上限 */
    messageMaxCount?: number;
    /** Toast 是否开启层叠微缩微动效 */
    messageStack?: boolean;
  }>(),
  {
    position: 'top-right',
    teleport: true,
    maxCount: 4,
    messageMaxCount: 5,
    messageStack: false,
  }
);

const store = useUiStore();

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

const positionClass = computed(() => positionClassFor(props.position));
const positionStyle = computed(() => positionStyleFor(props.position));
const transitionName = computed(() => transitionNameFor(props.position));

// ---- 瞬时 Toast：图标语义（按等级着色，与常驻通知 levelClass 同款 token） ----
const MESSAGE_ICON_MAP: Record<MessageType, { name: IconName; iconClass: string }> = {
  loading: { name: 'loader-2', iconClass: 'animate-spin text-primary' },
  success: { name: 'check-circle-2', iconClass: 'text-success' },
  error: { name: 'alert-circle', iconClass: 'text-danger' },
  warning: { name: 'alert-triangle', iconClass: 'text-warning' },
  info: { name: 'info', iconClass: 'text-primary' },
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
  info: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
};
const levelIcon = (type: NoticeType): IconName => LEVEL_ICON_MAP[type] ?? 'info';
const levelClass = (type: NoticeType): string => LEVEL_CLASS_MAP[type] ?? 'text-primary';

// ---- 操作按钮 pending 防重复点击（Toast 与通知各自独立集合，避免 id 碰撞误禁用） ----
const pendingMessageIds = ref<Set<number>>(new Set());
const isMessageActionPending = (id: number) => pendingMessageIds.value.has(id);

const pendingNoticeIds = ref<Set<number>>(new Set());
const isNoticeActionPending = (id: number) => pendingNoticeIds.value.has(id);

/** Toast 动作：成功移除；失败保留原条并补弹错误提示避免误判成功 */
const handleMessageAction = async (item: Message) => {
  if (!item.onAction || isMessageActionPending(item.id)) return;
  pendingMessageIds.value.add(item.id);
  try {
    await item.onAction();
    store.removeMessage(item.id);
  } catch (err) {
    console.error('[Message] Action execution failed:', err);
    store.message.error('操作失败，请重试');
  } finally {
    pendingMessageIds.value.delete(item.id);
  }
};

/** 通知动作：成功移除；失败保留便于重试 */
const handleNoticeAction = async (notice: Notice) => {
  if (!notice.onAction || isNoticeActionPending(notice.id)) return;
  pendingNoticeIds.value.add(notice.id);
  try {
    await notice.onAction();
    store.dismissNotice(notice.id);
  } catch (err) {
    console.error('[Notification] Action execution failed:', err);
  } finally {
    pendingNoticeIds.value.delete(notice.id);
  }
};

/** 反馈容器焦点移出（非内部子元素间移动）时恢复 Toast 销毁计时，满足 WCAG 2.2.1 可暂停 */
const handleFeedFocusOut = (e: FocusEvent) => {
  const container = e.currentTarget as HTMLElement | null;
  if (container && !container.contains(e.relatedTarget as Node | null)) {
    store.resumeAllTimers();
  }
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
