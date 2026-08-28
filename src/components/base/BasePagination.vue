<template>
  <nav
    v-if="pageCount > 0 && !(hideOnSinglePage && isSinglePage)"
    class="inline-flex items-center justify-center gap-sm box-border select-none"
    aria-label="分页导航"
  >
    <!-- 首页按钮 -->
    <ActionButton
      v-if="showFirstLast && !simple"
      variant="ghost"
      icon-only
      :size="size"
      :disabled="disabled || atFirst"
      aria-label="第一页"
      title="第一页"
      @click="handleFirst"
    >
      <ChevronsLeft :size="iconSize" />
    </ActionButton>

    <!-- 上一页按钮 -->
    <ActionButton
      variant="ghost"
      icon-only
      :size="size"
      :disabled="disabled || atFirst"
      aria-label="上一页"
      title="上一页"
      @click="handlePrev"
    >
      <ChevronLeft :size="iconSize" />
    </ActionButton>

    <!-- 页码说明文本 / 精简模式 -->
    <span class="pagination-label text-xs text-text-secondary whitespace-nowrap select-none font-medium">
      {{ displayText }}
    </span>

    <!-- 快速跳页输入框 -->
    <input
      v-if="showJumper && !simple"
      ref="jumperRef"
      v-model="jumperValue"
      type="number"
      inputmode="numeric"
      class="pagination-jumper w-16 h-7 px-1 text-center text-xs rounded border border-border-light bg-bg-body outline-none focus:border-primary focus:ring-1 focus:ring-primary/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-semibold text-text-title"
      :placeholder="String(humanCurrentPage)"
      :min="1"
      :max="pageCount"
      aria-label="跳转到页码"
      @keydown.enter="commitJumper"
      @blur="commitJumper"
    />

    <!-- 下一页按钮 -->
    <ActionButton
      variant="ghost"
      icon-only
      :size="size"
      :disabled="disabled || atLast"
      aria-label="下一页"
      title="下一页"
      @click="handleNext"
    >
      <ChevronRight :size="iconSize" />
    </ActionButton>

    <!-- 尾页按钮 -->
    <ActionButton
      v-if="showFirstLast && !simple"
      variant="ghost"
      icon-only
      :size="size"
      :disabled="disabled || atLast"
      aria-label="最后一页"
      title="最后一页"
      @click="handleLast"
    >
      <ChevronsRight :size="iconSize" />
    </ActionButton>

    <!-- 每页条数选择器 -->
    <select
      v-if="pageSizes && pageSizes.length > 0 && !simple"
      class="pagination-page-size text-xs h-7 px-1.5 rounded border border-border-light bg-bg-body text-text-title font-medium outline-none cursor-pointer focus:border-primary focus:ring-1 focus:ring-primary/50"
      :value="pageSizeModel"
      :disabled="disabled"
      aria-label="每页条数"
      @change="handlePageSizeChange"
    >
      <option v-for="s in pageSizes" :key="s" :value="s">{{ s }} 条/页</option>
    </select>
  </nav>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@lucide/vue';
import { computed, ref, useTemplateRef } from 'vue';
import ActionButton from './ActionButton.vue';

const props = withDefaults(
  defineProps<{
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

const handleFirst = () => {
  if (props.disabled || atFirst.value) return;
  setPage(0, 'first');
};

const handleLast = () => {
  if (props.disabled || atLast.value) return;
  const maxChunk = Math.ceil(pageCount.value / props.step) - 1;
  const newIdx = Math.min(pageCount.value - 1, maxChunk * props.step);
  setPage(newIdx, 'last');
};

const handlePrev = () => {
  if (props.disabled || atFirst.value) return;
  const chunk = Math.floor(idx.value / props.step);
  const newIdx = Math.max(0, (chunk - 1) * props.step);
  setPage(newIdx, 'prev');
};

const handleNext = () => {
  if (props.disabled || atLast.value) return;
  const chunk = Math.floor(idx.value / props.step);
  const maxChunk = Math.ceil(pageCount.value / props.step) - 1;
  const newIdx = Math.min(pageCount.value - 1, Math.min(maxChunk, chunk + 1) * props.step);
  setPage(newIdx, 'next');
};

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

const handlePageSizeChange = (e: Event) => {
  const target = e.target as HTMLSelectElement;
  const newSize = parseInt(target.value, 10);
  if (!isNaN(newSize)) {
    pageSizeModel.value = newSize;
    emit('pageSizeChange', newSize);
  }
};
</script>
