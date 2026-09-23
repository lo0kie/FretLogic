<template>
  <div
    :class="{ 'cursor-not-allowed select-none': disabled }"
    :style="{ width: resolvedWidth }"
    @focusin="isFocused = true"
    @focusout="isFocused = false"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    class="group relative flex items-center rounded-full"
    ref="rootRef"
  >
    <div
      v-if="hasPrefix"
      :class="currentConfig.prefixClass"
      class="pointer-events-none absolute inset-y-0 flex items-center justify-center text-fg-disabled"
    >
      <slot name="prefix">
        <BaseIcon
          v-if="prefixIcon"
          :name="prefixIcon"
          aria-hidden="true"
          class="shrink-0"
          icon-size="sm"
          icon-stroke="regular"
        />
      </slot>
    </div>

    <input
      v-bind="inputAttrs"
      :autocomplete
      :disabled
      :id
      :inputmode
      :maxlength
      :minlength
      :name
      :pattern
      :placeholder
      :readonly
      :required
      :aria-invalid="invalid || undefined"
      :class="[
        currentConfig.inputClass,
        fontClass,
        stateBorderClasses,
        hasPrefix ? currentConfig.prefixPadding : currentConfig.basePaddingLeft,
      ]"
      :style="{ paddingRight: computedPaddingRight }"
      :type="resolvedType"
      :value="localValue"
      @blur="handleBlur($event)"
      @change="handleChange($event)"
      @click="handleInputClick($event)"
      @compositionend="handleCompositionEnd($event)"
      @compositionstart="handleCompositionStart()"
      @focus="handleFocus($event)"
      @input="handleInput($event)"
      @keydown="wrappedKeydown($event)"
      @keyup.enter="handleEnterKeyup()"
      data-focusable-outline
      class="w-full min-w-0 cursor-text overflow-hidden rounded-full border border-solid bg-surface-body font-[inherit] font-medium text-ellipsis text-fg-title caret-primary transition-all duration-fast outline-none placeholder:truncate placeholder:font-normal placeholder:text-fg-disabled focus:enabled:bg-surface-body disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45 disabled:select-none"
      data-1p-ignore="true"
      data-bwignore="true"
      data-form-type="other"
      data-lpignore="true"
      data-protonpass-ignore="true"
      ref="inputRef"
    />

    <div
      v-if="hasCount || hasSuffix || isClearAvailable"
      class="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1.5"
      ref="rightSlotRef"
    >
      <span
        v-if="showCount && maxlength !== undefined"
        :class="{ 'font-bold text-danger!': isAtLimit }"
        aria-live="polite"
        class="text-2xs font-medium whitespace-nowrap text-fg-disabled transition-all duration-fast"
      >
        {{ localValue?.length ?? 0 }}/{{ maxlength }}
      </span>

      <button
        v-wave
        v-if="isClearAvailable"
        :class="
          clearVisible
            ? 'pointer-events-auto size-4 scale-100 opacity-100'
            : 'pointer-events-none -mr-1.5 h-4 w-0 scale-0 opacity-0'
        "
        :tabindex="clearVisible ? 0 : -1"
        :title="clearVisible ? '清空内容' : undefined"
        @mousedown.stop
        @pointerdown.stop
        @click.stop="handleClear()"
        data-focusable-outline
        class="flex cursor-pointer items-center justify-center overflow-hidden rounded-full border-none bg-surface-panel-hover p-0 text-fg-disabled transition-all duration-200 outline-none hover:bg-danger hover:text-fg-on-accent active:scale-90"
        type="button"
      >
        <BaseIcon icon-size="sm" icon-stroke="bold" name="x" />
      </button>

      <div v-if="isPasswordMode || $slots['suffix']" class="pointer-events-none flex items-center justify-center">
        <slot name="suffix">
          <button
            v-if="isPasswordMode"
            v-wave="{ disabled }"
            :disabled
            :aria-label="showPassword ? '隐藏密码' : '显示密码'"
            :class="
              disabled
                ? 'pointer-events-none opacity-40'
                : 'pointer-events-auto cursor-pointer hover:bg-surface-panel-hover hover:text-fg-title active:scale-90'
            "
            :title="showPassword ? '隐藏密码' : '显示密码'"
            @mousedown.stop
            @pointerdown.stop
            @click.stop="!disabled && (showPassword = !showPassword)"
            data-focusable-outline
            class="flex size-4 items-center justify-center rounded-full border-none bg-transparent p-0 text-fg-disabled transition-all duration-fast outline-none"
            type="button"
          >
            <BaseIcon :name="showPassword ? 'eye' : 'eye-off'" icon-size="xs" />
          </button>
        </slot>
      </div>
    </div>

    <!-- searchable 下拉结果面板：以输入框根元素为虚拟锚点，宽度对齐输入框，内置自适应高度与滚动条外壳，内容由 #search-results 插槽决定 -->
    <BasePopover
      v-if="searchable"
      v-model="resultsOpen"
      :close-on-context-trigger-click="false"
      :context-trigger-el="rootRef"
      :offset-distance="6"
      :panel-style="{ transformOrigin: 'top center' }"
      :virtual-ref="searchVirtualRef"
      match-trigger-width
      aria-label="搜索结果"
      panel-class="base-input-search-panel overflow-hidden"
      panel-radius="xl"
      placement="bottom-start"
      ref="searchPopoverRef"
    >
      <BaseScrollArea
        v-auto-height="{ transition: 'height var(--duration-base) var(--ease-sidebar, var(--bezier-sidebar, ease))' }"
        :class="searchMaxHeightClass"
        :scrollbar="{ showTrack: false, endInset: 8 }"
        :style="{ maxHeight: searchPanelMaxHeight }"
        @mousedown.stop
        @mouseleave="setSearchActiveIndex(-1)"
        axis="y"
        class="overflow-x-hidden"
        ref="searchAreaRef"
      >
        <div class="p-1">
          <!-- 搜索回退态收敛：传入 search-guide-text 即启用托管——「未输入引导 / 正在搜索 / 无结果」
             三态由组件渲染并接管切换，#search-results 插槽只在「有可显示结果」时挂载：
             - 查询为空 → 引导；
             - 有结果（含防抖窗口内的过期结果，渐进收窄不闪）→ 插槽；
             - 无结果且未同步（防抖中）→ 正在搜索；
             - 无结果且已同步 → 无结果。
             未传 search-guide-text 时插槽原样渲染（完全自管，向后兼容） -->
          <Feedback
            v-if="searchFallbackManaged && !searchQueryText"
            :description="searchGuideText"
            class="v-fade-in-quick"
            icon="search"
            key="search-guide"
            size="sm"
          />
          <!-- role 仅在托管结果行时下发：此时子节点全是 BaseDropdownItem（role=option），
               需要 listbox 属主才算合法 ARIA；自管插槽分支的标记由调用方自己负责 -->
          <div
            v-else-if="showSearchSlot"
            :role="searchItems ? 'listbox' : undefined"
            class="v-fade-in-quick flex flex-col gap-0.5"
          >
            <!-- 托管结果行：复用 BaseDropdownItem 的行壳（布局/行高/悬停/光标/选中高亮/点击选中）统一收敛于此，
               行内容由 #search-item 插槽决定；点击行与键盘 Enter 走同一条 select-search-index 路径
               （selectIndex 内部：派发选中 + 收起面板）
               两档高亮必须分开下发：active 只给「当前已选中」（持久，主题色），
               highlighted 只给键盘/悬停光标（瞬态，中性底）——合并成一个 prop 会让划过一行
               看起来与真正选中的那行完全相同（插槽内的对勾是唯一区别，扫视时读不出来） -->
            <template v-if="searchItems">
              <BaseDropdownItem
                v-for="(item, index) in searchItems"
                :active="isSearchItemSelected(item)"
                :highlighted="index === searchActiveIndex"
                :key="index"
                :size="resolvedSize"
                :title="searchItemTitle?.(item)"
                @mouseenter="setSearchActiveIndex(index)"
                @select="selectIndex(index)"
                class="w-full"
              >
                <slot
                  :index
                  :item
                  :active="index === searchActiveIndex"
                  :selected="isSearchItemSelected(item)"
                  name="search-item"
                />
              </BaseDropdownItem>
            </template>
            <!-- 未传 searchItems 的调用方：仍走自管插槽（结果行样式与交互自行负责） -->
            <slot
              v-else
              :active-index="searchActiveIndex"
              :close="closeResults"
              :query="localValue"
              :set-active-index="setSearchActiveIndex"
              name="search-results"
            />
          </div>
          <Feedback
            v-else-if="!searchSynced"
            :description="resolvedSearchLoadingText"
            class="v-fade-in-quick"
            key="search-loading"
            size="sm"
            type="loading"
          />
          <Feedback
            v-else
            :description="resolvedSearchNoResultText"
            class="v-fade-in-quick"
            key="search-no-result"
            size="sm"
            type="search"
          />
        </div>
      </BaseScrollArea>
    </BasePopover>
  </div>
</template>

<script setup generic="T = unknown" lang="ts">
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useAttrs,
  useId,
  useSlots,
  useTemplateRef,
  watch,
} from 'vue';

import BaseDropdownItem from '@/platform/ui/dropdown/BaseDropdownItem.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BasePopover from '@/platform/ui/popover/BasePopover.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { CONTROL_HEIGHT_CLASSES } from '@/platform/ui/controlSizes';
import { calcDropdownMaxHeight } from '@/platform/ui/dropdown/dropdownPanelHeight';
import { FORM_CONTROL_CONTEXT_KEY } from '@/platform/ui/form/formControlContext';
import { useFormRowControlId } from '@/platform/ui/form/formRowContext';
import { useSearchResultsPanel } from '@/platform/ui/input/useSearchResultsPanel';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';
import { resolveComponentWidth } from '@/platform/utils/constants';

import type { ComponentSize } from '@/platform/types';
import type { FormControlContext } from '@/platform/ui/form/formControlContext';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { ScrollAreaHandle } from '@/platform/ui/scroll-area/scrollAreaHandle';
import type { FormComponentWidth } from '@/platform/utils/constants';

// P1 审计 N 系：根 div 未关 inheritAttrs 时透传 attrs（aria-label 等）落在 generic 节点，
// 对 AT 不可见；改为显式转发到 <input>（class/style 仍留根节点保持视觉语义不变）
defineOptions({ inheritAttrs: false });
const modelValue = defineModel<string>({ required: true });
const {
  placeholder = '请输入...',
  disabled = false,
  readonly = false,
  clearable = false,
  searchable = false,
  searchItemCount = undefined,
  searchItems = undefined,
  searchItemTitle = undefined,
  searchItemSelected = undefined,
  searchMaxHeightClass = undefined,
  searchMaxItems = 6,
  searchGuideText = undefined,
  searchSynced = true,
  searchLoadingText = undefined,
  searchNoResultText = undefined,
  isPassword = false,
  prefixIcon = undefined,
  size = undefined,
  width = 'md',
  fontSize = 'md',
  autofocus = false,
  type = 'text',
  maxlength = undefined,
  minlength = undefined,
  pattern = undefined,
  inputmode = undefined,
  name = undefined,
  required = false,
  autocomplete = 'off',
  showCount = false,
  trim = false,
  formatter = undefined,
  invalid = false,
  modelModifiers = undefined,
} = defineProps<{
  /** 空内容时显示的占位提示文本 */
  placeholder?: string;
  /** 是否禁用输入框 */
  disabled?: boolean;
  /** 是否只读（可聚焦选中但不可编辑） */
  readonly?: boolean;
  /** 是否显示一键清空按钮（悬停/聚焦且有内容时浮现） */
  clearable?: boolean;
  /** 搜索模式下拉：聚焦/输入时弹出 #search-results 结果面板（浮层由内部 BasePopover 承载，内容完全由插槽决定） */
  searchable?: boolean;
  /** 搜索候选项总数（用于组件内置的键盘上下键循环导航与回车选中） */
  searchItemCount?: number;
  /** 托管结果列表数据源：传入后组件渲染标准化结果行（行外壳样式与选中交互统一收敛，
   *  行内容由 #search-item 插槽决定），并取代 searchItemCount 作为键盘导航的计数来源 */
  searchItems?: readonly T[];
  /** 托管结果行的悬停提示文案生成器（可选项；不传则行无 title） */
  searchItemTitle?: (item: T) => string;
  /** 托管结果行里「当前已选中」的判定（可选项）：命中即常驻高亮，并经 #search-item 的 selected 下发。
   *  与键盘/悬停的活跃项（内部 searchActiveIndex）相互独立 —— 后者在鼠标移出面板时会重置为 -1，
   *  而「当前选中」是宿主的常驻状态（如搜索结果对应编辑器正在编辑的和弦） */
  searchItemSelected?: (item: T) => boolean;
  /** 搜索结果面板最大高度类（自定义封顶时用；有值时接管封顶，不再按 searchMaxItems 自动估算 ——
   *  内联 maxHeight 优先级高于类，两者同时下发会把本项压成空转） */
  searchMaxHeightClass?: string;
  /** 搜索结果面板最多直接可见的结果行数：按「行数 × 行高 + 行距 + 内边距」自动计算面板最大高度，
   *  与下拉选项（BaseSelector）共用同一套高度口径，默认 6 */
  searchMaxItems?: number;
  /** 未输入时的引导文案；传入即启用**回退态托管**——「引导 / 正在搜索 / 无结果」由组件渲染，
   *  #search-results 插槽只在有可显示结果时挂载；未传时插槽原样渲染（完全自管，向后兼容） */
  searchGuideText?: string;
  /** 结果列表是否与当前查询同步（防抖场景：false = 防抖窗口内，旧结果是过期读数）。
   *  仅在托管模式下消费；默认 true（无防抖的调用方无需关心） */
  searchSynced?: boolean;
  /** 「正在搜索」文案，默认 '正在搜索...'；仅在托管模式下消费 */
  searchLoadingText?: string;
  /** 「无结果」文案（可含查询词，由调用方拼好传入）；缺省按查询词生成；仅在托管模式下消费 */
  searchNoResultText?: string;
  /** 密码模式：显示明文/密文切换按钮（type 需为 password） */
  isPassword?: boolean;
  /** 前缀图标名（注册表枚举）：无需包 #prefix slot 即可在输入框左侧渲染图标；传了 #prefix slot 时 slot 优先 */
  prefixIcon?: IconName;
  /** 尺寸档位（影响高度与字号） */
  size?: ComponentSize;
  /** 宽度：预设档位（sm/md/lg/xl/auto/full）或自定义值（数字按 px），默认 md */
  width?: FormComponentWidth;
  /** 文字字号覆写（默认随 size 档位） */
  fontSize?: 'xs' | 'md' | 'lg';
  /** 挂载后自动聚焦 */
  autofocus?: boolean;
  /** 原生 input 类型；password 走 isPasswordMode 的明文/密文切换逻辑 */
  type?: 'text' | 'password' | 'email' | 'search' | 'url' | 'tel' | (string & {});
  /** 最大输入长度；配合 showCount 显示字数统计 */
  maxlength?: number;
  /** 最小输入长度（原生校验） */
  minlength?: number;
  /** 原生正则校验模式 */
  pattern?: string;
  /** 虚拟键盘类型提示（移动端） */
  inputmode?: 'none' | 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url' | 'search';
  /** 原生表单字段名 */
  name?: string;
  /** 原生必填校验标记 */
  required?: boolean;
  /** 原生自动填充行为，默认 'off' */
  autocomplete?: string;
  /** 是否显示字数统计（需同时设置 maxlength） */
  showCount?: boolean;
  /** 失焦或提交时是否自动去除前后空格 */
  trim?: boolean;
  /** 自定义格式化处理函数 */
  formatter?: (val: string) => string;
  /** 校验非法状态（映射到 aria-invalid="true"） */
  invalid?: boolean;
  /** v-model 修饰符载体：vue-tsc 对 defineModel 修饰符未生成 prop 类型，此处显式声明 */
  modelModifiers?: { lazy?: boolean; trim?: boolean };
}>();
const emit = defineEmits<{
  (e: 'enter'): void;
  (e: 'clear'): void;
  (e: 'focus', event: FocusEvent): void;
  (e: 'blur', event: FocusEvent): void;
  (e: 'change', event: Event): void;
  (e: 'click', event: MouseEvent): void;
  /** 搜索模式：通过键盘回车选中某个下标项时派发 */
  (e: 'select-search-index', index: number): void;
}>();
defineSlots<{
  'prefix'?: () => unknown;
  'suffix'?: () => unknown;
  'search-results'?: (props: {
    activeIndex: number;
    close: () => void;
    query: string;
    setActiveIndex: (index: number) => void;
  }) => unknown;
  'search-item'?: (props: { active: boolean; index: number; item: T; selected: boolean }) => unknown;
}>();
const attrs = useAttrs();
const inputAttrs = computed(() => {
  const { class: _cls, style: _style, ...rest } = attrs;
  return rest;
});
const id = useId();
// 上报原生 input 的 id 给所在 BaseFormRow：行的 label 据此输出 for。
// 注意外部传入的 id 无效——模板里 :id 排在 v-bind="inputAttrs" 之后，内部生成的 id 恒定覆盖它，
// 故上报的必须是这里生成的 id，才能与元素实际 id 一致。
useFormRowControlId(() => id);
const slots = useSlots();
/** 尺寸解析：行内 props > BaseForm 注入上下文 > 默认 md */
const controlContext = inject<FormControlContext | null>(FORM_CONTROL_CONTEXT_KEY, null);
const resolvedSize = computed<ComponentSize>(() => size ?? controlContext?.size ?? 'md');

/** lazy 修饰符：打字期间只更新本地显示值，change/blur 等提交点才写回 model */
const isLazy = computed(() => Boolean(modelModifiers?.lazy));
/** .trim 修饰符与 trim prop 同义：提交时去首尾空格 */
const isTrimEnabled = computed(() => trim || Boolean(modelModifiers?.trim));
/** 本地即时值：lazy 模式下打字中间态先落在这里，避免逐键写回 model（初值为一次性快照，后续由 watch 同步；AST 规则误报豁免） */
// eslint-disable-next-line vue/no-ref-object-reactivity-loss
const localValue = ref<string>(modelValue.value);
// 外部 model 变化时同步本地显示值（lazy 期间不写 model，无回环风险）
watch(modelValue, v => {
  localValue.value = v;
});
/** 统一写入入口：总是更新本地显示值；非 lazy 时同步写回 model */
const commitLocal = (val: string) => {
  localValue.value = val;
  if (!isLazy.value) modelValue.value = val;
};

const inputRef = useTemplateRef<HTMLInputElement>('inputRef');
const rootRef = useTemplateRef<HTMLDivElement>('rootRef');
const searchPopoverRef = useTemplateRef<InstanceType<typeof BasePopover>>('searchPopoverRef');
const showPassword = ref(false);

const searchAreaRef = useTemplateRef<ScrollAreaHandle>('searchAreaRef');
/** 搜索结果面板滚动容器元素（焦点归属判定与活跃项滚动需要原生能力） */
const searchScrollRef = useScrollAreaElement(searchAreaRef);

// ─── searchable 下拉：开合 / 全局焦点收起 / 键盘导航 / 虚拟锚点抽离至 useSearchResultsPanel ───
const {
  resultsOpen,
  searchActiveIndex,
  searchVirtualRef,
  openResults,
  closeResults,
  selectIndex,
  setSearchActiveIndex,
  resetActiveIndex,
  handleKeydown,
} = useSearchResultsPanel({
  isSearchable: () => searchable,
  isDisabled: () => disabled,
  isReadonly: () => readonly,
  rootRef,
  inputRef,
  scrollEl: searchScrollRef,
  itemCount: () => resolvedSearchItemCount.value,
  // 与下方 handleKeydown 的 Enter 判定同口径（isComposing ref 声明在输入同步段，此处只传取值器）
  isComposing: () => isComposing.value,
  onSelectActive: index => emit('select-search-index', index),
});

/** 结果条目数：托管列表模式取 items 长度，否则退回计数 prop */
const resolvedSearchItemCount = computed(() => (searchItems ? searchItems.length : (searchItemCount ?? 0)));

/** 搜索结果面板最大高度：可见行数 × 行高 + 行距 + 内边距 自动估算，
 *  与下拉选项面板（BaseSelector）共用同一套高度口径，行数由 searchMaxItems 控制。
 *  searchMaxHeightClass 有值时整体交回类控制 —— 内联 maxHeight 优先级高于类，
 *  两者同时下发会把自定义封顶类压成空转 */
const searchPanelMaxHeight = computed(() =>
  searchMaxHeightClass
    ? undefined
    : calcDropdownMaxHeight({
        optionCount: resolvedSearchItemCount.value,
        displayItems: searchMaxItems,
        // 面板纵向内边距合计：结果容器内层的 p-1 = 0.25rem × 2（与下拉面板的 p-xs 不同，不能共用）
        paddingRem: 0.25 * 2,
        size: resolvedSize.value,
      })
);

const handleInputClick = (e: MouseEvent) => {
  openResults();
  emit('click', e);
};

/** searchable 面板的 keydown 已把 Enter 用于选中活跃项时，keyup 不再派发 enter（避免一键两事） */
let searchEnterConsumed = false;
/**
 * 本次 Enter 的 keydown 是否落在 IME 合成期。
 *
 * 必须在 keydown 时定格：Enter 也是「确认候选词」的键，合成期按下后浏览器先派发 compositionend
 * 再补 keyup —— keyup 到达时 isComposing 已复位，实时读它判不出来，于是拼音输入法里选词那一下
 * 会顺带派发 enter（宿主当成提交）。用标记把 keydown 的判定带到 keyup，与浏览器的事件顺序无关。
 * 同目录 BaseEditableText 写在 keydown 里直接 return（`:162` 合成期 Enter 不得当作提交），
 * 本组件以 keyup 派发 enter，故改用该标记落地同一口径（P1 审计 #10）。
 */
let enterComposingKeydown = false;
const wrappedKeydown = (e: KeyboardEvent) => {
  // isComposing ref 声明在下方输入同步段（两处都读，兼容个别不置 e.isComposing 的输入法）
  if (e.key === 'Enter') enterComposingKeydown = e.isComposing || isComposing.value;
  searchEnterConsumed = e.key === 'Enter' && searchable && resultsOpen.value && searchActiveIndex.value >= 0;
  handleKeydown(e);
};
const handleEnterKeyup = () => {
  // 合成期的 Enter 只用于确认候选词，不得当作提交
  if (enterComposingKeydown) {
    enterComposingKeydown = false;
    return;
  }
  if (searchEnterConsumed) {
    searchEnterConsumed = false;
    return;
  }
  emit('enter');
};

watch(localValue, () => void resetActiveIndex());

const isPasswordMode = computed(() => isPassword || type === 'password');

// ─── 搜索回退态托管：引导 / 正在搜索 / 无结果 三态的可见性判据 ───
/** 实时查询词（trim 后）：三态切换的基准 */
const searchQueryText = computed(() => localValue.value?.trim() ?? '');
/** 托管开关：传了引导文案即接管三态；未传时插槽原样渲染（向后兼容） */
const searchFallbackManaged = computed(() => searchable && searchGuideText !== undefined);
/** 「当前已选中」判定：宿主不传时恒为 false（只影响常驻高亮，与键盘/悬停的活跃项无关） */
const isSearchItemSelected = (item: T): boolean => searchItemSelected?.(item) ?? false;
/** 结果插槽是否挂载：托管模式下「查询非空且有结果（含防抖窗口内的过期结果）」；
 *  过期结果保留展示是实现「渐进收窄不闪」的关键——精修查询词时旧列表保持到新结果就绪 */
const showSearchSlot = computed(
  () => !searchFallbackManaged.value || (searchQueryText.value !== '' && resolvedSearchItemCount.value > 0)
);
const resolvedSearchLoadingText = computed(() => searchLoadingText ?? '正在搜索...');
const resolvedSearchNoResultText = computed(() => searchNoResultText ?? `未找到与“${searchQueryText.value}”相关的内容`);

// 密码框模式下默认隐藏明文（'password'），点击眼睛时切换至 'text'
const resolvedType = computed(() => {
  if (isPasswordMode.value) return showPassword.value ? 'text' : 'password';

  return type;
});

const isAtLimit = computed(() => Boolean(maxlength) && (localValue.value?.length ?? 0) >= (maxlength as number));

// 边框/焦点环配色按校验状态二选一，避免两组同权重 Tailwind 类共存时由 CSS 顺序决定胜者。
// 聚焦态只由 ring 指示：ring 是不占布局的 box-shadow、紧贴 1px 边框外侧，
// 若再叠 focus:border-* 变色就会呈现「实线边框 + 半透明环」两道圈（双边框）
const stateBorderClasses = computed(() =>
  invalid ? 'border-danger hover:enabled:border-danger' : 'border-border-light hover:enabled:border-border-base'
);

const isClearAvailable = computed(() => clearable && !disabled && !readonly);
const hasCount = computed(() => showCount && maxlength !== undefined);
const hasSuffix = computed(() => Boolean(slots['suffix']) || isPasswordMode.value);

// 清空按钮仅在「有内容 且（悬停输入框 或 输入框聚焦）」时才可见；
// 不可见时塌缩为 w-0（不占任何布局位），故输入框文本不被预留空间挤占，也不会与省略号重叠
const isHovered = ref(false);
const isFocused = ref(false);
const clearVisible = computed(
  () => isClearAvailable.value && Boolean(localValue.value) && (isHovered.value || isFocused.value)
);

// 右内边距预留：输入框右侧叠加了字数统计 / 清空按钮 / 密码眼睛等绝对定位元素，
// 需为其预留空间，否则计数文本会与输入框文本（含省略号）重叠。
// 直接用 ResizeObserver 测量「右侧叠加容器的真实渲染宽度」（含计数/清空/眼睛及其间 gap），
// 这是屏幕上的真实占宽，不依赖逐项估算，可覆盖字体异步加载变宽、字数增减、isAtLimit 加粗等场景。
const PR_BASE: Record<string, number> = { sm: 4, md: 6, lg: 8 };
const RIGHT_OFFSET = 8; // 叠加容器绝对定位在 right-2（8px）

const rightSlotRef = useTemplateRef<HTMLDivElement>('rightSlotRef');
// 首帧用估算兜底（clearable 按「常显清空」取最大值，预留偏宽更安全），挂载后实测纠正，避免首帧闪一下
const rightSlotWidth = ref(
  (() => {
    if (!(hasCount.value || hasSuffix.value || isClearAvailable.value)) return 0;
    const widths: number[] = [];
    if (hasCount.value && maxlength !== undefined) widths.push((String(maxlength).length * 2 + 1) * 6 + 12);
    if (isClearAvailable.value) widths.push(16); // 清空 w-4
    if (hasSuffix.value) widths.push(16); // 眼睛 w-4
    if (widths.length === 0) return 0;
    return widths.reduce((s, w) => s + w, 0) + (widths.length - 1) * 6;
  })()
);

/** 实测右侧叠加容器渲染宽度，纠正首帧估算的预留值 */
const measureRightSlot = () => {
  if (rightSlotRef.value) rightSlotWidth.value = rightSlotRef.value.offsetWidth;
};

// 字数 / maxlength / 清空显隐 / 后缀变化都可能改变右侧叠加宽度，重测（无 RO 环境兜底）
watch(
  () => [localValue.value?.length ?? 0, maxlength, clearVisible.value, hasSuffix.value, hasCount.value] as const,
  () => nextTick(measureRightSlot)
);

const computedPaddingRight = computed(() => {
  const base = PR_BASE[resolvedSize.value] ?? 10;
  // 叠加容器实测宽度 + right-2 偏移（8px）+ 文本间隙 base，即为距输入框右缘的总预留
  return `${base + (rightSlotWidth.value > 0 ? rightSlotWidth.value + RIGHT_OFFSET : 0)}px`;
});

const INPUT_CONFIG: Record<
  'sm' | 'md' | 'lg',
  {
    inputClass: string;
    basePaddingLeft: string;
    prefixClass: string;
    prefixPadding: string;
  }
> = {
  sm: {
    inputClass: `${CONTROL_HEIGHT_CLASSES.sm}`,
    basePaddingLeft: 'pl-2',
    prefixClass: 'left-2',
    prefixPadding: 'pl-6',
  },
  md: {
    inputClass: `${CONTROL_HEIGHT_CLASSES.md}`,
    basePaddingLeft: 'pl-2.5',
    prefixClass: 'left-2.5',
    prefixPadding: 'pl-7',
  },
  lg: {
    inputClass: `${CONTROL_HEIGHT_CLASSES.lg}`,
    basePaddingLeft: 'pl-3',
    prefixClass: 'left-3',
    prefixPadding: 'pl-8',
  },
};

const currentConfig = computed(() => INPUT_CONFIG[resolvedSize.value] ?? INPUT_CONFIG.md);
/** 是否存在前缀区（#prefix slot 优先，其次 prefix-icon prop）：决定容器显隐与输入框左内边距 */
const hasPrefix = computed(() => Boolean(slots['prefix']) || Boolean(prefixIcon));
const resolvedWidth = computed(() => resolveComponentWidth(width) ?? '100%');

const FONT_SIZE_CLASS: Record<string, string> = {
  xs: 'text-xs',
  md: 'text-xs',
  lg: 'text-sm',
};
const fontClass = computed(() => FONT_SIZE_CLASS[fontSize] ?? 'text-xs');

const isComposing = ref(false);

/** 应用 trim 与 formatter 后写回模型，并同步 DOM 值 */
const formatAndCommit = (raw: string) => {
  let val = raw;
  if (isTrimEnabled.value) val = val.trim();

  if (formatter) val = formatter(val);

  commitLocal(val);
  if (inputRef.value && inputRef.value.value !== val) inputRef.value.value = val;
};

/** 输入同步：输入法合成期间跳过（由 compositionend 统一提交） */
const handleInput = (e: Event) => {
  if (isComposing.value) return;
  openResults();
  const targetVal = (e.target as HTMLInputElement).value;
  if (formatter) formatAndCommit(targetVal);
  else commitLocal(targetVal);
};

/** change（失焦/回车）：lazy 模式下的提交点，把最终输入写回 model */
const handleChange = (e: Event) => {
  if (isLazy.value) formatAndCommit((e.target as HTMLInputElement).value);
  emit('change', e);
};

/** 进入输入法合成态：暂停输入同步 */
const handleCompositionStart = () => {
  isComposing.value = true;
};

/** 合成结束：提交最终文本（走 trim / formatter） */
const handleCompositionEnd = (e: Event) => {
  isComposing.value = false;
  openResults();
  const targetVal = (e.target as HTMLInputElement).value;
  formatAndCommit(targetVal);
};

/** 聚焦：searchable 模式展开结果面板并透传 focus 事件 */
const handleFocus = (e: FocusEvent) => {
  openResults();
  emit('focus', e);
};

/** 失焦：补提交合成中 / 未 trim 的内容，并派发 blur */
const handleBlur = (e: FocusEvent) => {
  // 若在输入法合成状态下直接失焦，同步最新的 DOM Native Value
  if (isComposing.value) {
    isComposing.value = false;
    const targetVal = (e.target as HTMLInputElement).value;
    formatAndCommit(targetVal);
  } else if (isTrimEnabled.value) formatAndCommit((e.target as HTMLInputElement).value);

  emit('blur', e);
};

/** 清空内容：重置模型与 DOM 值，补发 input / change 事件并保持聚焦（清空为显式操作，lazy 下也立即提交） */
const handleClear = () => {
  localValue.value = '';
  modelValue.value = '';
  emit('clear');
  if (inputRef.value) {
    inputRef.value.value = '';
    inputRef.value.dispatchEvent(new Event('input', { bubbles: true }));
    inputRef.value.dispatchEvent(new Event('change', { bubbles: true }));
    inputRef.value.focus();
  }
};

// 持续追踪右侧叠加容器真实宽度的观察器（覆盖字体异步加载变宽、字数增减、isAtLimit 加粗、清空显隐等场景）
let rightSlotObserver: ResizeObserver | undefined;
// searchable 模式：锚点是虚拟元素（实时读根元素矩形），floating-ui 不会自动观察它，
// 根元素尺寸变化时需手动触发浮层重定位
let rootSizeObserver: ResizeObserver | undefined;

onMounted(() => {
  // 挂载后测量右侧叠加容器真实宽度，纠正首帧估算值，避免长 maxlength 下重叠
  nextTick(measureRightSlot);
  // ResizeObserver 在叠加容器宽度变化时（如 web font 替换 fallback 字体后变宽、清空按钮显隐）自动重测，
  // 防止「首帧用偏窄 fallback 字体测量 → 字体换上后变宽 → 预留不足 → 文本与计数重叠」的回归
  if (typeof ResizeObserver !== 'undefined' && rightSlotRef.value) {
    rightSlotObserver = new ResizeObserver(() => measureRightSlot());
    rightSlotObserver.observe(rightSlotRef.value);
  }
  // 兜底：异步字体加载完成后再测一次
  if (typeof document !== 'undefined' && 'fonts' in document)
    document.fonts.ready.then(measureRightSlot).catch(() => undefined);

  if (autofocus) nextTick(() => inputRef.value?.focus());

  if (searchable && rootRef.value && typeof ResizeObserver !== 'undefined') {
    rootSizeObserver = new ResizeObserver(() => searchPopoverRef.value?.update());
    rootSizeObserver.observe(rootRef.value);
  }
});

onBeforeUnmount(() => {
  rightSlotObserver?.disconnect();
  rootSizeObserver?.disconnect();
});

// 暴露实例方法供父组件直接调用
defineExpose({
  focus: () => inputRef.value?.focus(),
  blur: () => inputRef.value?.blur(),
  select: () => inputRef.value?.select(),
  inputRef,
  /** searchable 模式：手动开合结果面板 */
  openSearch: openResults,
  closeSearch: closeResults,
  searchActiveIndex,
  setSearchActiveIndex,
});
</script>
