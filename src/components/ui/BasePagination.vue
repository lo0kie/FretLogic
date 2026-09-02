<template>
  <nav
    v-if="pageCount > 0 && !(hideOnSinglePage && isSinglePage)"
    aria-label="分页导航"
    class="gap-sm box-border inline-flex items-center justify-center select-none"
  >
    <ActionButton
      v-if="showFirstLast && !simple"
      :disabled="disabled || atFirst"
      :size
      @click="handleFirst"
      aria-label="第一页"
      icon-only
      title="第一页"
      variant="ghost"
    >
      <BaseIcon :size="iconSize" name="chevrons-left" />
    </ActionButton>

    <ActionButton
      :disabled="disabled || atFirst"
      :size
      @click="handlePrev"
      aria-label="上一页"
      icon-only
      title="上一页"
      variant="ghost"
    >
      <BaseIcon :size="iconSize" name="chevron-left" />
    </ActionButton>

    <span class="pagination-label text-text-secondary text-xs font-medium whitespace-nowrap select-none">
      {{ displayText }}
    </span>

    <input
      v-if="showJumper && !simple"
      v-model="jumperValue"
      :max="pageCount"
      :min="1"
      :placeholder="String(humanCurrentPage)"
      @blur="commitJumper"
      @keydown.enter="commitJumper"
      aria-label="跳转到页码"
      class="pagination-jumper border-border-light bg-bg-body focus:border-primary focus:ring-primary/50 text-text-title h-7 w-16 [appearance:textfield] rounded border px-1 text-center text-xs font-semibold outline-none focus:ring-1 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      inputmode="numeric"
      ref="jumperRef"
      type="number"
    />

    <ActionButton
      :disabled="disabled || atLast"
      :size
      @click="handleNext"
      aria-label="下一页"
      icon-only
      title="下一页"
      variant="ghost"
    >
      <BaseIcon :size="iconSize" name="chevron-right" />
    </ActionButton>

    <ActionButton
      v-if="showFirstLast && !simple"
      :disabled="disabled || atLast"
      :size
      @click="handleLast"
      aria-label="最后一页"
      icon-only
      title="最后一页"
      variant="ghost"
    >
      <BaseIcon :size="iconSize" name="chevrons-right" />
    </ActionButton>

    <select
      v-if="pageSizes && pageSizes.length > 0 && !simple"
      :disabled
      :value="pageSizeModel"
      @change="handlePageSizeChange"
      aria-label="每页条数"
      class="pagination-page-size border-border-light bg-bg-body text-text-title focus:border-primary focus:ring-primary/50 h-7 cursor-pointer rounded border px-1.5 text-xs font-medium outline-none focus:ring-1"
    >
      <option v-for="s in pageSizes" :key="s" :value="s">{{ s }} 条/页</option>
    </select>
  </nav>
</template>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';

import BaseIcon from '@/components/ui/BaseIcon.vue';

import ActionButton from './ActionButton.vue';

const props = withDefaults(
  defineProps<{
    /** 总页数（注意：不是总条数）；组件直接以页码为模型，总条数请在业务侧换算后再传入 */
    total: number;
    step?: number;
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    /** 索引基准：0 表示 modelValue 为 0 起始（如数组下标），1 表示 1 起始（通用分页页码）。默认 0。 */
    base?: 0 | 1;
    /** 每页条数（双向绑定或展示属性） */
    pageSize?: number;
    /** 每页条数备选列表，传入后渲染下拉选择框，如 [10, 20, 50, 100] */
    pageSizes?: number[];
    /** 是否显示页码快速跳转输入框 */
    showJumper?: boolean;
    /** 是否显示首页与尾页快捷跳转按钮 */
    showFirstLast?: boolean;
    /** 极简模式：仅展示箭头与页码，隐藏跳转器与条数选择 */
    simple?: boolean;
    /** 仅一页（total <= step）时是否隐藏整个分页器 */
    hideOnSinglePage?: boolean;
    formatter?: (current: number, total: number) => string;
  }>(),
  {
    step: 1,
    size: 'md',
    disabled: false,
    base: 0,
    showJumper: false,
    showFirstLast: false,
    simple: false,
    hideOnSinglePage: false,
    pageSizes: undefined,
  }
);

// 主页码双向绑定
const modelValue = defineModel<number>({ required: true });
// 每页条数双向绑定
const pageSizeModel = defineModel<number>('pageSize', { default: 10 });

const emit = defineEmits<{
  (e: 'change', value: number): void;
  (e: 'prev', value: number): void;
  (e: 'next', value: number): void;
  (e: 'first', value: number): void;
  (e: 'last', value: number): void;
  (e: 'jump', value: number): void;
  (e: 'pageSizeChange', size: number): void;
}>();

const jumperRef = useTemplateRef<HTMLInputElement>('jumperRef');
const jumperValue = ref('');
const isJumping = ref(false);

const ICON_SIZE_MAP: Record<'sm' | 'md' | 'lg', number> = {
  sm: 13,
  md: 15,
  lg: 18,
};
const iconSize = computed(() => ICON_SIZE_MAP[props.size] ?? 15);

const pageCount = computed(() => Math.max(0, Math.floor(props.total)));
const isSinglePage = computed(() => pageCount.value <= Math.max(1, props.step));

// 0 起始内部索引，限制在 [0, pageCount-1]
const idx = computed(() => {
  const raw = modelValue.value - props.base;
  return Math.min(Math.max(0, raw), Math.max(0, pageCount.value - 1));
});

const humanCurrentPage = computed(() => idx.value + 1);
const atFirst = computed(() => idx.value <= 0);
const atLast = computed(() => idx.value + props.step >= pageCount.value);

const displayText = computed(() => {
  const start = humanCurrentPage.value;
  const end = Math.min(idx.value + props.step, pageCount.value);
  const rangeStr = props.step > 1 ? ` ${start}-${end}` : '';
  const sizeStr =
    !props.simple && props.pageSize && (!props.pageSizes || props.pageSizes.length === 0)
      ? ` · 每页 ${props.pageSize} 条`
      : '';
  if (props.formatter) return props.formatter(start, pageCount.value);
  if (props.simple) return `${start} / ${pageCount.value}`;
  return `第 ${start}${rangeStr} / ${pageCount.value} 页${sizeStr}`;
});

type PageChangeAction = 'prev' | 'next' | 'first' | 'last' | 'jump';

/** 统一翻页入口：写回模型（含 base 偏移）并按动作派发对应事件 */
const setPage = (newIdx: number, action: PageChangeAction) => {
  const newVal = newIdx + props.base;
  if (newVal === modelValue.value) return;
  modelValue.value = newVal;
  emit('change', newVal);
  if (action === 'prev') emit('prev', newVal);
  else if (action === 'next') emit('next', newVal);
  else if (action === 'first') emit('first', newVal);
  else if (action === 'last') emit('last', newVal);
  else if (action === 'jump') emit('jump', newVal);
};

/** 跳转首页 */
const handleFirst = () => {
  if (props.disabled || atFirst.value) return;
  setPage(0, 'first');
};

/** 跳转末页：对齐到最后一个页组起点 */
const handleLast = () => {
  if (props.disabled || atLast.value) return;
  const maxChunk = Math.ceil(pageCount.value / props.step) - 1;
  const newIdx = Math.min(pageCount.value - 1, maxChunk * props.step);
  setPage(newIdx, 'last');
};

/** 上一页组（按 step 前移） */
const handlePrev = () => {
  if (props.disabled || atFirst.value) return;
  const chunk = Math.floor(idx.value / props.step);
  const newIdx = Math.max(0, (chunk - 1) * props.step);
  setPage(newIdx, 'prev');
};

/** 下一页组（不越界） */
const handleNext = () => {
  if (props.disabled || atLast.value) return;
  const chunk = Math.floor(idx.value / props.step);
  const maxChunk = Math.ceil(pageCount.value / props.step) - 1;
  const newIdx = Math.min(pageCount.value - 1, Math.min(maxChunk, chunk + 1) * props.step);
  setPage(newIdx, 'next');
};

/** 提交跳转输入：clamp 到有效页码范围，isJumping 防抖避免重复提交 */
const commitJumper = () => {
  if (isJumping.value || !jumperValue.value.trim()) {
    jumperValue.value = '';
    return;
  }
  isJumping.value = true;
  const n = parseInt(jumperValue.value, 10);
  jumperValue.value = '';
  jumperRef.value?.blur();

  if (!isNaN(n)) {
    // 限制在人类直觉范围 1 到 pageCount 之间
    const clamped = Math.min(pageCount.value, Math.max(1, n));
    setPage(clamped - 1, 'jump');
  }

  setTimeout(() => {
    isJumping.value = false;
  }, 50);
};

/** 每页条数变更：写回绑定并派发 pageSizeChange */
const handlePageSizeChange = (e: Event) => {
  const target = e.target as HTMLSelectElement;
  const newSize = parseInt(target.value, 10);
  if (!isNaN(newSize)) {
    pageSizeModel.value = newSize;
    emit('pageSizeChange', newSize);
  }
};
</script>
