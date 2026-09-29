<template>
  <BaseScrollArea
    v-grid-nav="{ cols }"
    :scrollbar="false"
    axis="y"
    class="grid max-h-[50vh] grid-cols-2 gap-md md:grid-cols-3"
  >
    <!-- 分组网格选择器：「移动至新分组」（chordStore 的 moveVariantsByName 流程）与「选择保存分组」
         （抽屉新建流程）两处共用。此前是两份平行实现，注释各自声称「逐档取齐」却已分叉
         （一处两档列数、一处恒三列），本组件即为此而抽。
         受控组件：选中态走 defineModel（v-model 双向绑定，不自行声明 modelValue prop），
         选中语义（移动目标 / 保存目标）归属调用方。

         列数两档：窄屏（< md，768px）2 列、其余 3 列 —— 与脚本的 cols 同步。
         3 列在手机上每格只剩约 100px，分组名与计数挤成一团（和弦选择面板此前同样从 3 列收到 2 列）。
         必须与 v-grid-nav 的换行基数一致：它是按列数做加减换行的，列数写错方向键会跨列跳。
         阈值同源：useResponsive 的 isMobile 是 `< md`（768px），与 `md:` 变体同一个断点。

         边缘羽化随 axis 默认开启（不写 :fade="false"）：分组多到超出 max-h-[50vh] 时上下两端的分组行
         被裁断，而本层刻意关掉了自绘滚动条（网格里挂一条会挤掉一列），羽化就成了「上面/下面还有内容」
         的唯一线索。与侧栏分组列表（SidebarLeft 的 scroll-body，未写 :fade 即同一档）取齐。

         选中态用 tint 浅底 + 强调色文字（本项目通用选中态写法），不用实心 bg-primary：
         实心底会把文字送到 --text-on-accent 上，而该令牌为过「强调色上的文字」对比度门禁已三主题
         统一取深墨，饱和蓝配纯黑过于刺眼。计数此前恒为 text-fg-disabled（浅灰），在实心蓝上是
         2.4:1、在浅底上只有 1.4:1，故选中时一并改用 text-primary —— 它必须与分组名同档才读得出来。 -->
    <button
      v-wave
      v-for="group in groups"
      v-tooltip="group.id === activeGroupId ? (activeTooltip ?? '') : ''"
      :class="[
        modelValue === group.id
          ? 'scale-[1.02] border-primary bg-tint-primary-88 text-primary'
          : 'bg-surface-body text-fg-body hover:border-primary hover:bg-surface-panel-hover active:scale-95',
      ]"
      :disabled="disableActive && group.id === activeGroupId"
      :key="group.id"
      :title="group.name"
      @click="selectGroup(group.id)"
      data-focusable-outline
      class="flex w-full min-w-0 cursor-pointer items-center rounded-md border border-border-base p-md text-xs font-bold transition-all duration-fast disabled:cursor-not-allowed disabled:border-border-disabled disabled:bg-surface-disabled disabled:text-fg-disabled"
    >
      <!-- 触发宿主委托给整行按钮：分组名只占行首一条，鼠标停在行内空白处（如计数那一侧）时
           同样该开始滚动。该行没有具名类，用 closest('button') 命中的就是这个按钮本身 -->
      <div v-marquee.fade="{ trigger: 'button' }">
        <span> {{ group.name }} </span>
        <span :class="modelValue === group.id ? 'text-primary' : 'text-fg-disabled'" class="pl-1">
          ({{ chordsByGroup.get(group.id)?.length ?? 0 }})
        </span>
      </div>
    </button>
  </BaseScrollArea>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { useResponsive } from '@/platform/composables/useResponsive';

import type { Chord, Group, GroupId } from '@/domains/chord/types';

/** 当前选中（移动目标 / 保存目标）的分组 id：受控双向绑定，选中语义归属调用方 */
const modelValue = defineModel<string>({ required: true });

defineProps<{
  /** 全部分组，按调用方给定的既有顺序渲染 */
  groups: readonly Group[];
  /** 分组 id → 名下和弦列表，仅用于显示计数 */
  chordsByGroup: ReadonlyMap<string, readonly Chord[]>;
  /** 当前所属分组：命中时显示 activeTooltip，并可被 disableActive 禁用 */
  activeGroupId?: string;
  /** activeGroupId 命中时的悬浮提示文案（两处语义不同：移动 / 保存） */
  activeTooltip?: string;
  /**
   * 是否禁用 activeGroupId 那一项：移动流程禁用（移过去是 no-op，useChordGroupModals 另有一道二次守卫），
   * 保存流程不禁用（那是草稿的默认值，本就是合法选择）。
   */
  disableActive?: boolean;
}>();

/** 选中某个分组：只把 id 写回 v-model，具体含义由调用方决定 */
const selectGroup = (id: GroupId) => {
  modelValue.value = id;
};

const { isMobile } = useResponsive();

/**
 * 网格列数：窄屏 2 列、其余 3 列。
 * 必须与模板上的 `grid-cols-2 md:grid-cols-3` 逐档对齐 —— 它是 v-grid-nav 的换行基数
 * （方向键按 `± cols` 找上下行），两处不一致时方向键会跨列跳。
 * 阈值同源：useResponsive 的 isMobile 是 `< md`（768px），与 `md:` 变体同一个断点。
 */
const cols = computed(() => (isMobile.value ? 2 : 3));
</script>
