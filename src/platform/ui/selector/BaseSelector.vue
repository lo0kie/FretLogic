<template>
  <BasePopover
    v-model="isOpen"
    :disabled
    :block="width === 'full'"
    :offset-distance="6"
    match-trigger-width
    panel-class="p-0 overflow-hidden"
    placement="bottom-start"
    ref="popoverRef"
  >
    <template #trigger="{ isOpen: _isOpen }">
      <div
        v-bind="$attrs"
        v-wave="{ disabled }"
        :aria-disabled="disabled || undefined"
        :aria-expanded="_isOpen"
        :aria-labelledby="rowLabelId"
        :class="[
          currentConfig.triggerClass,
          _isOpen ? 'border-primary ring-1 ring-primary' : '',
          disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
        ]"
        :style="{ width: triggerWidthStyle }"
        :tabindex="disabled ? -1 : 0"
        :title="triggerTitle"
        @focusin="triggerFocused = true"
        @focusout="triggerFocused = false"
        @keydown="handleTriggerKeydown($event)"
        @mouseenter="triggerHovered = true"
        @mouseleave="triggerHovered = false"
        data-focusable-outline
        aria-haspopup="listbox"
        class="group relative flex items-center justify-between gap-2 rounded-full border border-border-light bg-surface-body text-fg-title transition-all duration-150 outline-none select-none hover:border-border-base"
        ref="referenceRef"
        role="combobox"
      >
        <span
          :class="[
            isEmpty && placeholder ? 'font-normal text-fg-disabled' : isNonDefault ? 'text-primary' : 'text-fg-title',
          ]"
          class="flex min-w-0 flex-1 items-center gap-sm overflow-hidden font-semibold"
        >
          <slot name="prefix" />
          <BaseIcon
            v-if="typeof currentTriggerIcon === 'string'"
            :name="currentTriggerIcon as IconName"
            aria-hidden="true"
            class="shrink-0 opacity-80"
            icon-size="md"
            icon-stroke="bold"
          />
          <component
            v-else-if="currentTriggerIcon"
            :is="currentTriggerIcon"
            aria-hidden="true"
            class="shrink-0 opacity-80"
            icon-size="md"
            icon-stroke="bold"
          />
          <span class="flex w-full items-center gap-1 overflow-hidden">
            <template v-if="isMultiple && selectedValues.length">
              <span
                v-for="opt in displayedTags"
                :key="String(getOptionValue(opt))"
                class="inline-flex max-w-32 shrink-0 items-center gap-1 rounded-sm bg-tint-primary-90 px-1.5 py-0.5 text-2xs font-bold text-primary"
              >
                <span class="truncate">{{ formattedOption(opt) }}</span>
                <BaseIcon
                  @mousedown.stop.prevent
                  @pointerdown.stop.prevent
                  @click.stop.prevent="handleRemoveTag(opt)"
                  @keydown.enter.prevent.stop="handleRemoveTag(opt)"
                  @keydown.space.prevent.stop="handleRemoveTag(opt)"
                  aria-label="移除选项"
                  class="shrink-0 cursor-pointer opacity-60 hover:text-danger hover:opacity-100"
                  icon-size="xs"
                  icon-stroke="bold"
                  name="x"
                  role="button"
                  tabindex="0"
                  title="移除"
                />
              </span>
              <span
                v-if="collapsedCount > 0"
                class="inline-flex shrink-0 items-center rounded-sm bg-surface-panel-hover px-1.5 py-0.5 text-2xs font-bold text-fg-muted"
              >
                +{{ collapsedCount }}
              </span>
            </template>
            <div v-else v-marquee.fade class="min-w-0 flex-1">
              <slot :rolling-label="BaseRollingText" :selected="modelValue" name="label">
                <BaseRollingText v-if="rollingText" :text="displayText" always-roll class="tabular-nums" />
                <template v-else>{{ displayText }}</template>
              </slot>
            </div>
          </span>
          <slot name="suffix" />
        </span>

        <!-- 尾部只有**一枚**常驻图标：箭头与清空叉是它的两种形态，靠换 name 切换 —— 形变引擎等的
             正是「同一个实例改名」（见 icons/iconMorph.ts）。原先的两个 <BaseIcon> 换 display 的写法
             做不到这件事，理由见 setup 里 clearActionShown 的注释。

             翻转只作用于**箭头形态**：`rotate-180` 的用意是「展开时箭头朝上」，而叉没有方向，
             给它加 180° 只是让整枚图标在形态切换那 200ms 里空转半圈（用户实测「打开时 × 在旋转」）。
             故判据带上 `!clearActionShown` —— 形态是叉时一律不转，两个方向都不会凭空转起来。 -->
        <BaseIcon
          :aria-hidden="clearActionShown ? undefined : 'true'"
          :aria-label="clearActionShown ? '清空选择' : undefined"
          :class="[
            clearActionShown ? 'cursor-pointer hover:text-danger' : '',
            'shrink-0 text-fg-disabled transition duration-200',
            { 'rotate-180': _isOpen && !clearActionShown },
          ]"
          :morph-disable="morphDisabled"
          :name="clearActionShown ? 'x' : 'chevron-down'"
          :role="clearActionShown ? 'button' : undefined"
          :tabindex="clearActionShown ? 0 : undefined"
          :title="clearActionShown ? '清空' : undefined"
          @click="handleTriggerIconActivate($event)"
          @keydown.enter="handleTriggerIconActivate($event)"
          @keydown.space="handleTriggerIconActivate($event)"
          @mousedown="handleTriggerIconPress($event)"
          @pointerdown="handleTriggerIconPress($event)"
          icon-size="md"
          icon-stroke="bold"
        />
      </div>
    </template>

    <template #default="{ close }">
      <div class="dropdown-inner-container relative flex w-full flex-col">
        <div v-if="$slots['header'] || filterable" class="shrink-0 border-b border-glass-border">
          <div v-if="filterable" class="px-2 py-1.5">
            <input
              v-model="searchQuery"
              :aria-label="filterAriaLabel"
              :placeholder="filterPlaceholder"
              @pointerdown.stop
              @keydown.down="handleFilterKeydownDown($event)"
              @keydown.enter="handleFilterKeydownEnter($event, close)"
              data-focusable-outline
              class="h-7 w-full rounded-sm border border-border-light bg-surface-body px-2 text-xs outline-none"
              ref="filterInputRef"
              type="text"
            />
          </div>
          <slot name="header" />
        </div>

        <div class="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
          <BaseScrollArea
            :aria-multiselectable="isMultiple || undefined"
            :class="DROPDOWN_ITEM_GAP_CLASS"
            :fade="{ size: 16, flushEps: 2 }"
            :scrollbar="{ endInset: 8 }"
            :style="{
              maxHeight: dropdownMaxHeight,
              // 空选项时禁止滚动（空占位可能略高于容器，避免出现可滚动的空面板）
              ...(filteredOptions.length === 0 ? { overflow: 'hidden' } : {}),
            }"
            @keydown="handleDropdownKeydown($event, close)"
            axis="y"
            class="flex w-full flex-col p-xs outline-none"
            ref="dropdownAreaRef"
            role="listbox"
            tabindex="-1"
          >
            <div
              v-if="filteredOptions.length === 0"
              class="m-auto flex min-h-22 w-full flex-col items-center justify-center py-6"
            >
              <Feedback :description="filterable ? '无匹配结果' : '暂无选项'" size="sm" />
            </div>
            <template v-else>
              <BaseDropdownItem
                v-for="(entry, index) in filteredEntries"
                :active="isSelected(getOptionValue(entry.option))"
                :disabled="isOptionDisabled(entry.option)"
                :font-black="fontBlackItems"
                :key="entry.key"
                :ref="el => setOptionEl(el, index)"
                :size="resolvedSize"
                :title="getOptionTitle(entry.option)"
                @select="handleSelect(entry.option, close)"
              >
                <template #leading>
                  <!-- 前导图标：选中时由 check **顶替**条目图标（默认行为，见 noCheckOnIcon）。
                       两支刻意都判「条目图标是不是字符串」而不把选中态另立一支 —— 选中前后落在**同一支**，
                       换 name 便走的是同一个 BaseIcon 实例，形变引擎（watch(() => name)）才等得到。
                       若给选中态单开一支 v-if，两支各带编译器注入的自动 key，实例每次都被销毁重建，
                       动画一次都播不出来（观感即瞬切）。 -->
                  <BaseIcon
                    v-if="typeof getOptionIcon(entry.option) === 'string'"
                    :class="checkOnIconOf(entry.option) ? 'shrink-0 text-primary' : 'shrink-0 opacity-80'"
                    :name="leadingIconOf(entry.option) as IconName"
                    aria-hidden="true"
                    icon-size="md"
                    icon-stroke="bold"
                  />
                  <!-- 条目图标是组件：不在可形变名表里、没有可补间的几何，选中态直接换成 check -->
                  <BaseIcon
                    v-else-if="checkOnIconOf(entry.option)"
                    aria-hidden="true"
                    class="shrink-0 text-primary"
                    icon-size="md"
                    icon-stroke="bold"
                    name="check"
                  />
                  <component
                    v-else-if="getOptionIcon(entry.option)"
                    :is="getOptionIcon(entry.option)"
                    aria-hidden="true"
                    class="shrink-0 opacity-80"
                    icon-size="md"
                    icon-stroke="bold"
                  />
                </template>
                <div v-marquee.fade class="min-w-0">
                  <slot :index :option="entry.option" name="option">
                    {{ formattedOption(entry.option) }}
                  </slot>
                </div>
                <template #trailing>
                  <!-- 行尾对勾：勾选已顶到图标位时不再重复出（无图标的选项仍走这里）。trailing 槽在
                       BaseDropdownItem 里是**固定宽**，此处的条件渲染不会让选项文字左右跳动。 -->
                  <BaseIcon
                    v-if="isSelected(getOptionValue(entry.option)) && !checkOnIconOf(entry.option)"
                    aria-hidden="true"
                    class="shrink-0 text-primary"
                    icon-size="md"
                    icon-stroke="bold"
                    name="check"
                  />
                </template>
              </BaseDropdownItem>
            </template>
          </BaseScrollArea>
        </div>

        <slot v-if="$slots['footer']" name="footer" />
      </div>
    </template>
  </BasePopover>
</template>

<script lang="ts">
// 双 script 块的 SFC 视为同一模块：import 必须整体置于第一个块顶部（import/first），
// 下方 <script setup> 直接复用这些绑定；<script setup> 内禁止 export，
// 对外的类型导出也只能放在本块
import { computed, inject, nextTick, onBeforeUpdate, ref, useAttrs, useTemplateRef, watch } from 'vue';

import BaseDropdownItem from '@/platform/ui/dropdown/BaseDropdownItem.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import BasePopover from '@/platform/ui/popover/BasePopover.vue';
import BaseRollingText from '@/platform/ui/rolling-text/BaseRollingText.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { calcDropdownMaxHeight, DROPDOWN_ITEM_GAP_CLASS } from '@/platform/ui/dropdown/dropdownPanelHeight';
import { FORM_CONTROL_CONTEXT_KEY } from '@/platform/ui/form/formControlContext';
import { useFormRowLabelId, useFormRowLabelPress } from '@/platform/ui/form/formRowContext';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';
import { createOptionHelpers, SELECTOR_CONFIG } from '@/platform/ui/selector/BaseSelector.logic';
import { resolveComponentWidth } from '@/platform/utils/constants';

import type { ComponentSize } from '@/platform/types';
import type { FormControlContext } from '@/platform/ui/form/formControlContext';
import type { IconName } from '@/platform/ui/icons/icons.registry';
import type { ScrollAreaHandle } from '@/platform/ui/scroll-area/scrollAreaHandle';
import type { BaseSelectorOption, OptionValue, SelectorFieldNames } from '@/platform/ui/selector/BaseSelector.logic';
import type { FormComponentWidth } from '@/platform/utils/constants';
import type { Component } from 'vue';

// 键名/选项/绑值类型以 BaseSelector.logic.ts 为唯一来源，此处 re-export 保持既有从 .vue 导入的路径兼容
export type { BaseSelectorOption, OptionValue, SelectorFieldNames };
</script>

<script setup generic="O extends object | string | number, M extends boolean = false, V = OptionValue<O>" lang="ts">
type AnyOption = O;

defineOptions({ inheritAttrs: false });

const modelValue = defineModel<M extends true ? V[] : V>({ required: true });

const {
  options,
  size = undefined,
  width = 'md',
  placeholder = '请选择...',
  icon = undefined,
  clearable = false,
  disabled = false,
  displayItems = 6,
  defaultValue = undefined,
  fontBlackItems = false,
  formatOption = undefined,
  multiple = false as M,
  maxTagCount = undefined,
  collapseTags = false,
  fieldNames = undefined,
  filterable = false,
  filterPlaceholder = '搜索...',
  filterAriaLabel = '搜索选项',
  filterMethod = undefined,
  valueComparator = undefined,
  highlightNonDefault = false,
  keepOpenOnSelect = false,
  noCheckOnIcon = false,
  /** 触发器选中标签是否启用翻页动画：true 时整段标签随文案变化翻滚；false = 普通文本 */
  rollingText = false,
} = defineProps<{
  /** 选项列表：对象数组（label/value 等字段）或原始值数组。
   *  元素类型 O 即绑值类型的推导来源（见 OptionValue）。两点约束取舍：
   *  - 用 `object` 而非 `Record<string, unknown>`：后者要求隐式索引签名，而**接口声明的选项类型
   *    （如 BaseSelectorOption）拿不到它**，传进来会报 “Index signature is missing”；
   *  - 声明为 readonly：可以直接传 `as const` / readonly 常量表，不必再由调用方展开拷贝一份。 */
  options: readonly O[];
  /** 尺寸档位：sm/md/lg */
  size?: ComponentSize;
  /** 触发器宽度：预设档位（sm/md/lg/xl/auto/full）或具体 CSS 宽度值，默认 md */
  width?: FormComponentWidth;
  /** 未选中时的占位提示文本 */
  placeholder?: string;
  /** 触发器前缀图标（不传则自动取当前选中项的 icon） */
  icon?: IconName | Component;
  /** 是否显示清空按钮 */
  clearable?: boolean;
  /** 禁用整个选择器 */
  disabled?: boolean;
  /** 下拉面板不滚动时直接可见的选项数量（决定面板最大高度） */
  displayItems?: number;
  /** 默认值：清空时回退到该值，多选形态为数组 */
  defaultValue?: M extends true ? V[] : V;
  /** 选项文字是否统一加重（未选中项以 font-black 呈现） */
  fontBlackItems?: boolean;
  /** 自定义选项展示文本（仅原始值选项；对象选项走 fieldNames.label） */
  formatOption?: (option: AnyOption) => string;
  /** 多选模式：绑定值为数组，选中项以 Tag 形式展示 */
  multiple?: M;
  /** 多选模式下最多展示的 Tag 数量 */
  maxTagCount?: number;
  /** 多选模式下是否折叠超出的 Tag 为 +N */
  collapseTags?: boolean;
  /** 对象选项的字段名映射（label/value/disabled/icon） */
  fieldNames?: SelectorFieldNames;
  /** 是否在面板顶部显示搜索过滤输入框 */
  filterable?: boolean;
  /** 搜索过滤输入框的占位提示文本 */
  filterPlaceholder?: string;
  /**
   * 搜索过滤输入框的无障碍名。该输入框没有可见标签，而 placeholder 不能充当无障碍名
   * （读屏可读性差、一旦输入即消失），故必须显式给出 aria-label；需要更具体时由调用方覆盖。
   */
  filterAriaLabel?: string;
  /** 自定义过滤函数（默认按展示文本包含关键字过滤） */
  filterMethod?: (query: string, option: AnyOption) => boolean;
  /** 自定义值相等比较器 */
  valueComparator?: (a: V, b: V) => boolean;
  /** 是否启用"非默认值高亮"：true（默认）保持原行为 —— 传了 defaultValue 且当前值偏离时标签高亮；
   *  false 则关闭该高亮，标签恒用默认文字色。仅控制高亮，不影响清空按钮的判定 */
  highlightNonDefault?: boolean;
  /** 单选选中后是否保持面板打开（默认 false 选中即关；用于快捷切换场景，Esc/点外部仍可关闭） */
  keepOpenOnSelect?: boolean;
  /**
   * 选中项是否**不**把对勾顶到前导图标位。
   *
   * 默认 false ⇒ 开启「勾选落在图标位」：选项传了 `icon` 且处于选中态时，对勾**顶替该项图标**出现在
   * 前导槽，同时行尾不再重复出对勾 —— 与菜单那套 `checkPosition` 的默认档同一观感。传上本属性则退回
   * 旧观感：图标恒在前导槽，对勾回到行尾。
   *
   * 取「不」这一向而不是 `checkOnIcon = true`：默认开的开关用正向命名时，模板里唯一写法是
   * `:check-on-icon="false"`；反向命名后能写成无值的 `no-check-on-icon`，与全项目其它布尔属性同一种读法。
   *
   * 只在选项**带图标**时起作用：没有图标的选项前导槽本就空着，对勾挪过去等于在行首凭空冒出来 ——
   * 这类选项恒走行尾，使「有图标 / 无图标」两种选项的勾选位置都落在「一项一个位置」的读法上。
   */
  noCheckOnIcon?: boolean;
  /** 触发器选中标签是否启用翻页动画：true 时整段标签随文案变化翻滚；false = 普通文本 */
  rollingText?: boolean;
}>();

const emit = defineEmits<{
  (e: 'change', value: M extends true ? V[] : V): void;
  (e: 'clear'): void;
  (e: 'removeTag', option: AnyOption, value: V): void;
}>();
const attrs = useAttrs();
/** 尺寸解析优先级：行内 size props > BaseForm 下发的 FormControlContext > 默认 md */
const controlContext = inject<FormControlContext | null>(FORM_CONTROL_CONTEXT_KEY, null);
const resolvedSize = computed<ComponentSize>(() => size ?? controlContext?.size ?? 'md');
/** 所在 BaseFormRow 的标签 id：触发器是 role=combobox 的 div，label 的 for 指不到，只能靠 aria-labelledby 关联 */
const rowLabelId = useFormRowLabelId();
/** 选项访问器：字段名映射 / 比较器 / 格式化注入到纯逻辑工厂（见 BaseSelector.logic.ts） */
const {
  getOptionLabel,
  getOptionValue,
  isOptionDisabled,
  getOptionIcon,
  equalsValue,
  formattedOption,
  getOptionTitle,
} = createOptionHelpers<V>({
  labelKey: fieldNames?.label ?? 'label',
  valueKey: fieldNames?.value ?? 'value',
  disabledKey: fieldNames?.disabled ?? 'disabled',
  iconKey: fieldNames?.icon ?? 'icon',
  formatOption,
  valueComparator,
});

const selectedOption = computed(() => {
  if (isMultiple.value) return undefined;
  return options.find(opt => equalsValue(getOptionValue(opt), modelValue.value as V));
});

const currentTriggerIcon = computed<IconName | Component | undefined>(() => {
  if (icon) return icon;
  if (!isMultiple.value && selectedOption.value) return getOptionIcon(selectedOption.value);

  return undefined;
});

const isOpen = ref(false);
const dropdownAreaRef = useTemplateRef<ScrollAreaHandle>('dropdownAreaRef');
/** 下拉选项滚动容器元素（键盘导航 / 滚动到选中项需要原生能力） */
const dropdownRef = useScrollAreaElement(dropdownAreaRef);
const referenceRef = useTemplateRef<HTMLElement>('referenceRef');

/**
 * 标签交互委托（③，见 formRowContext）：点所在 BaseFormRow 的标签，等同于按在触发器上。
 *
 * 为什么必须由本组件自己开面板：触发器是 role=combobox 的 div，不是可标签化元素 —— 行标签既不能用
 * for 指向它（Chrome 只认 input / select / textarea / button 那几类），也包不住它（两者是兄弟节点），
 * 故行标签已退化为 <span>（见 BaseFormRow 的 labelTag），点它不会有任何浏览器默认行为。
 * 传 selfActivating: true 即为此：行据此才肯把「退化为 span 的标签」的委托也接过来，并给出可点击
 * 光标；与上面 useFormRowLabelId 同属「非可标签化控件如何接进行」的两半（② 取名 / ③ 激活）。
 *
 * **两个时机刻意分开登记，不可并成一个**（这是修过的缺陷）：
 *  - `press`（pointerdown）只补波纹 —— 墨水必须与按在触发器上一样在指针落下那刻就晕开；
 *  - `activate`（click）才开面板 —— 与点触发器本身同路（BasePopover 的触发区也是 @click），
 *    于是「按住标签往外一拖再松手」不会开面板，与直接点触发器的手感一致。
 *    曾把两者一起塞进 press，结果是**一按就开**：与点触发器的时机不一致，且无法用「拖走松手」取消。
 *
 * 开面板走与键盘同一条路（handleTriggerKeydown 也是直接置 isOpen）—— isOpen 是本组件自己的
 * ref（仅把 v-model 让给 BasePopover），不是父组件的绑定值，直接写不牵动上层；BasePopover 侧对
 * model 的 watch 会照常分配层级并重新定位。刻意**不**改用 `referenceRef.click()`：那会冒泡到
 * BasePopover 触发区去 toggle（下面「只开不关」会失效），且若运行时给合成 click 的 detail 恰为 0，
 * 还会在波纹元素上**再补出第二圈波纹**（波纹已在按下时补过）。
 *
 * 只开不关，不做 toggle：标签不是触发器，而「面板开着时按标签」在**捕获阶段**就会被 BasePopover 的
 * 外点关闭先置为 false（它的 outside 监听挂在 window 捕获阶段），此处再 toggle 会把刚关掉的面板又翻
 * 回来，且结果随先前开合而漂移；恒置 true 则无论先前开合，结果都是「打开」，与键盘口径一致。
 *
 * 波纹补法与 BaseSwitch / BaseCheckbox 同源：往波纹元素补一个 detail=0 且**不冒泡**的合成 click，
 * 命中指令给键盘 / 合成激活预留的那条分支（只认 detail===0，且不校验 isTrusted），以元素中心为圆心、
 * 不等抬起。不冒泡另有一层必要：冒泡会抵达 BasePopover 触发区的 @click 去 toggle，与「只开不关」冲突。
 *
 * 波纹那一侧不必判 disabled：指令内部的 wave() 会自己拦（与本组件直接点击的守卫同源）；
 * 但「开面板」这个动作没有任何默认拦截，必须判（触发器上的 tabindex 在禁用时已关掉，若这里漏判，
 * 键盘进不来、鼠标反倒能开，属明显的自相矛盾）。
 */
useFormRowLabelPress(() => void referenceRef.value?.dispatchEvent(new MouseEvent('click', { bubbles: false })), {
  selfActivating: true,
  activate: () => {
    if (disabled) return;
    isOpen.value = true;
  },
});

const optionEls = ref<(HTMLElement | null)[]>([]);
const filterInputRef = useTemplateRef<HTMLInputElement>('filterInputRef');
const searchQuery = ref('');

/** 收集选项 DOM（函数式 ref），供键盘导航聚焦使用。
 *  下拉项已抽成 BaseDropdownItem 子组件，函数式 ref 到手的是它 defineExpose 的对象（含 root），
 *  需解包出真正的根按钮元素再存入，才能被 handleDropdownKeydown / scrollToSelected 调用 focus() */
const setOptionEl = (el: unknown, index: number) => {
  const node = el && typeof el === 'object' && 'root' in el ? (el as { root?: HTMLElement }).root : el;
  if (node instanceof HTMLElement) optionEls.value[index] = node;
};

onBeforeUpdate(() => {
  optionEls.value = [];
});

// 选项增删后渐隐遮罩由 v-edge-fade 的 MutationObserver 自动重测，无需手动同步

const isMultiple = computed(() => multiple);

const currentConfig = computed(() => SELECTOR_CONFIG[resolvedSize.value] ?? SELECTOR_CONFIG.md);

/** 读取选项展示文本 / 绑值 / 禁用态 / 比较等纯函数由 createOptionHelpers 工厂提供 */

const selectedValues = computed<V[]>(() =>
  isMultiple.value
    ? Array.isArray(modelValue.value)
      ? (modelValue.value as unknown as V[])
      : []
    : [modelValue.value as unknown as V]
);

/** 某值是否处于选中态（多选在集合中查找，单选直接比较） */
const isSelected = (val: V): boolean => selectedValues.value.some(v => equalsValue(v, val));

/**
 * 该选项此刻是否把对勾顶到前导图标位：三个条件缺一不可 —— 开关未被关掉、该项**带图标**、该项已选中。
 *
 * 「带图标」是必要条件而不是顺带判一下：没有图标的选项前导槽本就空着，对勾挪过去等于在行首凭空冒出来，
 * 与行尾那套读法冲突；两者并存还会让「同一份选项列表里勾选位置各不相同」。
 */
const checkOnIconOf = (option: AnyOption): boolean =>
  !noCheckOnIcon && getOptionIcon(option) !== undefined && isSelected(getOptionValue(option));

/**
 * 该选项前导槽实际渲染的图标：勾选顶替时为 `check`，其余情况是条目自己的图标。
 *
 * ⚠️ 只在**模板的同一支**里把名字从条目图标换成 `check`（见下方 #leading 的注释），
 * 换的是同一个 `BaseIcon` 实例的 `name` —— 这是「选中那一下」能补间而不是瞬切的前提，
 * 也是本项目形变引擎（`watch(() => name)`）唯一认得的触发方式。
 */
const leadingIconOf = (option: AnyOption): IconName | Component | undefined =>
  checkOnIconOf(option) ? 'check' : getOptionIcon(option);

const filteredOptions = computed(() => {
  if (!filterable || !searchQuery.value.trim()) return options;
  const q = searchQuery.value.trim().toLowerCase();
  return options.filter(opt => {
    if (filterMethod) return filterMethod(q, opt);
    return getOptionLabel(opt).toLowerCase().includes(q);
  });
});

/**
 * 过滤结果行：附带完整 options 中的原始下标作为稳定 key。
 * filterable 时行序随关键字变动，若用「过滤后的行内下标」作 key，Vue 会按位复用错位 DOM，
 * 焦点所在的旧行节点会被填进另一个选项的内容（键盘导航定位与实际可见项脱节）。
 * 原始下标不随过滤变化，能保证行与选项一一对应。
 */
const filteredEntries = computed(() => {
  const list = filteredOptions.value;
  if (list === options)
    // 未过滤 / 非 filterable：行序即原始序，下标即稳定 key
    return list.map((option, index) => ({ option, key: index }));

  // 已过滤：按引用回查原始下标（选项列表通常为常驻数组且规模小，indexOf 成本可忽略）
  return list.map(option => ({ option, key: options.indexOf(option) }));
});

const selectedOptions = computed(() => options.filter(opt => isSelected(getOptionValue(opt))));

const maxTags = computed(() => {
  if (maxTagCount !== undefined) return maxTagCount;
  if (collapseTags) return 1;
  return Infinity;
});

const displayedTags = computed(() => selectedOptions.value.slice(0, maxTags.value));
const collapsedCount = computed(() => Math.max(0, selectedOptions.value.length - maxTags.value));

const isEmpty = computed(() =>
  isMultiple.value
    ? selectedValues.value.length === 0
    : modelValue.value === undefined || modelValue.value === null || modelValue.value === ''
);

/** 当前值是否已偏离 defaultValue：仅描述值状态，与是否高亮无关（共清空按钮判定使用） */
const isNonDefaultValue = computed(() => {
  if (defaultValue === undefined) return false;
  if (isMultiple.value) {
    // 多选按集合语义比较（忽略勾选顺序）：长度不等即偏离；否则双向逐项 equalsValue。
    // equalsValue 对数组会落到 JSON.stringify 的字符串比较，顺序敏感——['a','b'] 与 ['b','a']
    // 在多选下语义等价，若按字符串比较会把清空按钮/高亮状态误判为"已偏离默认值"。
    const current = selectedValues.value;
    const fallback = Array.isArray(defaultValue) ? (defaultValue as unknown as V[]) : [];
    if (current.length !== fallback.length) return true;
    return !fallback.every(dv => current.some(v => equalsValue(v, dv)));
  }
  return !equalsValue(modelValue.value as V, defaultValue as V);
});

/** 标签是否高亮：由 highlightNonDefault 开关控制，开启时仅在值偏离 defaultValue 时高亮 */
const isNonDefault = computed(() => highlightNonDefault && isNonDefaultValue.value);

const canClear = computed(() => {
  if (isEmpty.value) return false;
  if (defaultValue !== undefined) return isNonDefaultValue.value;

  // 未声明 defaultValue 时：多选能回退到空集合，单选没有可表示的空值（模型类型不含 undefined），
  // 故不给单选清空入口 —— 详见 handleClear 的说明
  return isMultiple.value;
});

/**
 * 触发器尾部那枚图标的形态开关：**不可清空**时恒为展开箭头；可清空时，悬停、聚焦 或 **浮层在途**期间
 * 一律**就地**张开成清空叉（任一成立即保持清空形态，不缩回箭头）。
 *
 * 为什么必须由 JS 状态驱动、而不能再像原来那样交给 CSS：形态切换靠的是**换 BaseIcon 的 name**
 * （形变引擎 `watch(() => name)` 等的就是「同一个实例改名」，几何表见 icons/iconMorph.ts），
 * 而 CSS 改不了属性 —— 原先是两个 <BaseIcon> 靠 `group-hover:` / `group-focus-within:` 换 display，
 * 两个 name 都是写死的常量，引擎一次也等不到；且 display 本身不可过渡，换的瞬间没有任何中间态。
 *
 * hover / focus 都挂在**触发器根**上而不是这枚图标自己，以与原 `group-hover` / `group-focus-within`
 * 的命中范围一致：悬停触发器任意位置即出清空叉，不必精确指到图标。focus 用会冒泡的
 * focusin/focusout，一并覆盖「根自身获得焦点」与「焦点再 Tab 到图标上」两种情形
 * （同一次焦点转移里的 focusout → focusin 落在同一批微任务内，不会闪出一次多余的形态切换）。
 *
 * ⚠️ **`popoverInFlight` 这一支不能省**：面板一打开，焦点就被移进面板里的选项/搜索框（那是 teleport 出去的
 * 独立浮层，不在触发器内），指针也多半已经离开触发器去点选项 —— 只认 hover/focus 的话，清空叉会在
 * 打开的那一瞬间缩回箭头，而此刻恰恰是最需要「清空」入口的时候（面板已展开、值还没改）。
 */
const triggerHovered = ref(false);
const triggerFocused = ref(false);

/** BasePopover 的公开实例：这里只取它的 isMounted（判据见 popoverInFlight） */
const popoverRef = useTemplateRef<InstanceType<typeof BasePopover>>('popoverRef');

/**
 * 浮层生命周期是否在途：从打开那一拍起（`isOpen`），直到离场动画收尾、浮层宿主离开 DOM。
 *
 * 为什么要盯到离场收尾，而不是面板「不算打开」为止：`BasePopover.close()` 一瞬就把 `isOpen`
 * 置假，而它把焦点归还给触发器是在**离场动画结束**（`handleAfterLeave` → `restoreFocus`）。
 * 这中间约一个动画时长的空档里，hover / focus / isOpen 三者全假 ⇒ 清空叉先缩回箭头、焦点一回来
 * 又张开成叉，肉眼看到的是一次抖动（用户实测「按 Esc 关闭会从 × 变一下再变回 ×」）。
 *
 * ⚠️ **判据必须取 popover 的 isMounted，不能取面板内部的模板 ref**：后者随面板 **vnode 卸载**
 * 置空，而 vnode 卸载发生在离场动画**开始**（渲染器先 `unmountChildren`、再 `remove(vnode)`，
 * 只有后者会把 DOM 元素留到过渡结束）—— 于是整个离场窗口里那个 ref 已是 null、面板却还在屏幕上，
 * 判据中途翻假，抖动原样回来（本组件曾如此实现，2026-09-25 修正）。`isMounted` 的存活区间恰好
 * 就是「宿主仍在 DOM」。判据：「离场期间」这类窗口只能由掌握该生命周期的层给出，组件内的 ref
 * 不构成「还在屏幕上」的证明。
 */
const popoverInFlight = computed(() => isOpen.value || (popoverRef.value?.isMounted ?? false));

/** 清空形态是否上屏：`canClear` 是值侧的硬前提 —— 没有可回退的值时，开着面板也不该出清空叉 */
const clearActionShown = computed(
  () =>
    clearable && canClear.value && !disabled && (triggerHovered.value || triggerFocused.value || popoverInFlight.value)
);

/**
 * 形变只走**悬停**这一路：只要键盘焦点可能落在这枚图标上（`triggerFocused` 且指针不在触发器上），
 * 由换形态引出的补间就不播、直落终态。
 *
 * 原因在 BaseIcon 的渲染结构：补间期间它走「自绘 svg」分支、结束再切回「图标组件」分支，
 * **两次都要替换 DOM 节点**。而这枚图标在聚焦路径下正是个 tab 停靠点（触发器获得焦点后它才显形、
 * 也才可 Tab 到），键盘用户完全可能在上一次形变结束前就 Tab 到它身上 —— 节点一被替换，焦点即掉回 body。
 * 悬停路径没有这个隐患：鼠标按下已被拦下（见 handleTriggerIconPress），这枚图标不会因点击获得焦点；
 * 且这一支**进出两个方向都照常补间**（判据里带 `!triggerHovered`，否则鼠标移开时名也会换回箭头，
 * 却被一并判成「不补间」，就成了「进来有动画、出去瞬切」）。
 */
const morphDisabled = computed(() => triggerFocused.value && !triggerHovered.value);

const presetWidth = computed(() => resolveComponentWidth(width) ?? '100%');

/**
 * 触发器宽度样式。auto 宽度模式下由动画逻辑临时接管为具体像素值，
 * 动画结束后回归 undefined（交还给 presetWidth 的 auto），从而实现宽度自动过渡。
 */
const animatingWidth = ref<string | undefined>(undefined);
const triggerWidthStyle = computed(() => animatingWidth.value ?? presetWidth.value);

const triggerTitle = computed(() => {
  const explicit = attrs['title'];
  return typeof explicit === 'string' && explicit ? explicit : displayText.value || undefined;
});

const displayText = computed(() => {
  if (isMultiple.value) {
    if (!selectedValues.value.length) return placeholder;
    return `已选 ${selectedValues.value.length} 项`;
  }
  if (isEmpty.value) return placeholder;
  const currentOption = options.find(opt => isSelected(getOptionValue(opt)));
  if (currentOption !== undefined) return formattedOption(currentOption);

  return String(modelValue.value ?? '');
});

const dropdownMaxHeight = computed(() =>
  calcDropdownMaxHeight({
    optionCount: filteredOptions.value.length,
    displayItems,
    // 面板纵向内边距合计：下拉容器的 p-xs = 0.375rem × 2（与搜索结果面板的 p-1 不同，不能共用）
    paddingRem: 0.375 * 2,
    size: resolvedSize.value,
  })
);

/** auto 宽度模式下，选项文案变化（标签宽度随之变化）时平滑过渡触发器宽度 */
let widthAnim: Animation | undefined;

const animateTriggerWidth = () => {
  const el = referenceRef.value;
  if (!el || width !== 'auto') return;
  if (widthAnim) widthAnim.cancel();
  // 1) 捕获变更前宽度并锁定，使新文案渲染后宽度不跳变
  const fromWidth = el.getBoundingClientRect().width;
  animatingWidth.value = `${fromWidth}px`;
  nextTick(() => {
    // 2) 新文案已渲染且宽度仍锁定为 fromWidth，临时释放测量目标自然宽度
    const prevTransition = el.style.transition;
    el.style.transition = 'none';
    const savedWidth = el.style.width;
    el.style.width = 'auto';
    const toWidth = el.getBoundingClientRect().width;
    el.style.width = savedWidth;
    el.style.transition = prevTransition;
    if (Math.abs(toWidth - fromWidth) < 0.5) {
      // 宽度无变化，无需动画，直接回到自适应
      animatingWidth.value = undefined;
      return;
    }
    // 3) 用 WAAPI 显式播放宽度过渡：不依赖 CSS 过渡的起点提交时机，
    //    规避增长方向（如切到最宽的「线上服务器」）transition 不触发导致宽度直跳的问题
    widthAnim = el.animate([{ width: `${fromWidth}px` }, { width: `${toWidth}px` }], {
      duration: 150,
      easing: 'ease',
      fill: 'forwards',
    });
    // 4) 动画结束后交还 auto（toWidth 即 auto 宽度，无回弹）；
    //    期间关闭 CSS 过渡，避免 revert 触发二次宽度过渡或回弹闪烁
    widthAnim.onfinish = () => {
      el.style.transition = 'none';
      el.style.width = 'auto';
      animatingWidth.value = undefined;
      widthAnim?.cancel();
      requestAnimationFrame(() => {
        el.style.transition = '';
      });
    };
  });
};

watch(displayText, () => {
  if (width !== 'auto') return;
  animateTriggerWidth();
});

/**
 * 写入 modelValue 并派发 change 的唯一出口。
 *
 * `multiple` 只活在类型层（`M extends boolean`）：运行时它就是个普通 prop，所以「写入形态与
 * multiple 一致」编译器无从保证，这里必然需要一次断言。原先 `as unknown as M extends true ?
 * V[] : V` 在 4 个调用点各写一遍——改错任何一处都不会被发现，值类型等于零保护；集中到此后
 * 只剩一处，并在开发期校验形态：多选却写单值、单选却写数组，都会立刻在控制台点名，而不是等
 * 下游按错误形态消费（把单值当数组取 .length、把数组当单值比较，都是静默出错）。
 *
 * 想把它升级为**编译期**保护，只能改组件 API（拆成单选/多选两个组件，或把 (multiple, modelValue)
 * 收成一个判别联合 prop）——那是一次对外契约变更，不属于本轮修复范围。
 *
 * `source` 仅用于告警文案，指向调用点。
 */
const commitValue = (value: V | V[] | undefined, source: string): void => {
  if (import.meta.env.DEV && value !== undefined) {
    const expectsArray = isMultiple.value;
    if (Array.isArray(value) !== expectsArray)
      console.warn(
        `[BaseSelector] ${source}：写入值与 multiple=${String(isMultiple.value)} 形态不符（期望${expectsArray ? '数组' : '单值'}）`,
        value
      );
  }
  const typed = value as unknown as M extends true ? V[] : V;
  modelValue.value = typed;
  emit('change', typed);
};

/** 选择选项：多选切换勾选，单选写值后关闭面板（keepOpenOnSelect 时保持面板打开便于连续切换） */
const handleSelect = (option: AnyOption, close: () => void) => {
  if (isOptionDisabled(option)) return;
  const val = getOptionValue(option);
  if (isMultiple.value) {
    const arr = selectedValues.value.slice();
    const i = arr.findIndex(v => equalsValue(v, val));
    if (i >= 0) arr.splice(i, 1);
    else arr.push(val);
    commitValue(arr, 'handleSelect');
  } else {
    commitValue(val, 'handleSelect');
    if (!keepOpenOnSelect) close();
  }
};

/** 移除多选 Tag：从选中集合剔除并派发 change / removeTag */
const handleRemoveTag = (option: AnyOption) => {
  if (disabled || isOptionDisabled(option)) return;
  const val = getOptionValue(option);
  commitValue(
    selectedValues.value.filter(v => !equalsValue(v, val)),
    'handleRemoveTag'
  );
  emit('removeTag', option, val);
};

/** 清空选择：回退到 defaultValue（多选为空数组）并派发 change / clear；
 *  无论 keepOpenOnSelect 如何，清空都关闭面板（清空即结束本次选择交互）。
 *
 *  单选且未声明 defaultValue 时直接返回：模型类型是 `M extends true ? V[] : V`，**不含 undefined**
 *  （消费方按非空消费，例如直接把值传给 `Tuning` 这类字面量联合字段），此处写 undefined 等于把一个
 *  类型上不存在的状态塞给调用方。该场景下的清空入口已由 canClear 一并关掉，故这里是不可达兜底。 */
const handleClear = () => {
  if (disabled) return;
  if (defaultValue === undefined && !isMultiple.value) return;
  commitValue(defaultValue !== undefined ? defaultValue : [], 'handleClear');
  emit('clear');
  isOpen.value = false;
};

/**
 * 触发器尾部图标被激活（点击 / Enter / Space）：只有处于清空形态时才吞掉事件并清空。
 *
 * 为什么不能把 `.stop.prevent` 写在模板修饰符上：修饰符是无条件生效的，一旦写上，
 * **箭头形态**下的点击也会被拦掉 —— 而点箭头正是「开合面板」的常规路径（此时它只是触发器的一部分，
 * 该继续冒泡给 BasePopover 的触发区）。故改为在 handler 内按当前形态判定。
 */
const handleTriggerIconActivate = (e: Event) => {
  if (!clearActionShown.value) return;
  e.stopPropagation();
  e.preventDefault();
  handleClear();
};

/**
 * 同上，拦的是按下事件：触发器根上挂着 v-wave，清空形态下放行会在清空键底下再补一圈波纹
 * （原写法即如此）；preventDefault 一并沿用，使点清空不夺取焦点。箭头形态一律放行，
 * 与点触发器其它位置的手感一致。
 */
const handleTriggerIconPress = (e: Event) => {
  if (!clearActionShown.value) return;
  e.stopPropagation();
  e.preventDefault();
};

/** 触发器键盘：方向键 / 回车 / 空格打开面板 */
const handleTriggerKeydown = (e: KeyboardEvent) => {
  if (disabled) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (!isOpen.value) isOpen.value = true;
  }
};

/**
 * 过滤框的两个键处理都要在合成期放行 —— ↓/↑ 是输入法翻候选词、Enter 是确认候选词，
 * 一旦 `preventDefault` 就会把翻页整段吞掉、并在确认候选词时顺带选中首个选项。
 *
 * 因此 `.prevent` 不能留在模板修饰符上（修饰符无法按条件生效），改由 handler 内先行判定。
 * 与搜索面板同口径（见 useSearchResultsPanel.handleKeydown）；那边 Enter 在 keyup 才派发，
 * 需用「keydown 定格标记」兜住，这里过滤框自身即合成目标、`e.isComposing` 可靠，不必复制那套。
 */

/** 搜索框按 ↓：聚焦首个可用选项 */
const handleFilterKeydownDown = (e: KeyboardEvent) => {
  if (e.isComposing) return;
  e.preventDefault();
  const firstValidIndex = filteredOptions.value.findIndex(o => !isOptionDisabled(o));
  if (firstValidIndex !== -1) optionEls.value[firstValidIndex]?.focus();
};

/** 搜索框按回车：直接选中首个可用选项 */
const handleFilterKeydownEnter = (e: KeyboardEvent, close: () => void) => {
  if (e.isComposing) return;
  e.preventDefault();
  const firstValid = filteredOptions.value.find(o => !isOptionDisabled(o));
  if (firstValid) handleSelect(firstValid, close);
};

/** 列表键盘导航：跳过禁用项，↑ 在顶部时回到搜索框，Esc / Tab 关闭 */
const handleDropdownKeydown = (e: KeyboardEvent, close: () => void) => {
  const elements = optionEls.value;
  if (!elements || elements.length === 0) return;

  const currentIndex = elements.findIndex(el => el === document.activeElement);

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    let nextIndex = currentIndex + 1;
    while (nextIndex < filteredOptions.value.length && isOptionDisabled(filteredOptions.value[nextIndex]!)) nextIndex++;

    if (nextIndex < filteredOptions.value.length) elements[nextIndex]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (currentIndex === 0 && filterable) {
      filterInputRef.value?.focus();
      return;
    }
    let prevIndex = currentIndex - 1;
    while (prevIndex >= 0 && isOptionDisabled(filteredOptions.value[prevIndex]!)) prevIndex--;

    if (prevIndex >= 0) elements[prevIndex]?.focus();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  } else if (e.key === 'Tab') {
    // 显式拦截原生 Tab：面板经 Teleport 挂在 body 下，若放任浏览器默认焦点移动，
    // 焦点可能落在「即将随面板卸载的列表节点」上，导致焦点意外掉回 document.body。
    // 改由手动把焦点交还触发器，面板关闭后的下一次 Tab 自然前进到下一个控件。
    e.preventDefault();
    close();
    referenceRef.value?.focus();
  }
};

watch(
  () => disabled,
  isDisabled => {
    if (isDisabled) isOpen.value = false;
  }
);

watch(isOpen, opened => {
  if (opened) {
    if (filterable) searchQuery.value = '';
    scrollToSelected();
  }
});

// 选项变化时无需重测渐隐：子元素增删由 v-edge-fade 的 MutationObserver 捕获（原 nextTick(syncEdgeFades) 已随 composable 移除）

// 打开后：将焦点移入列表（或搜索框），确保键盘方向键从当前/首个有效项开始定位
const scrollToSelected = async () => {
  await nextTick();
  requestAnimationFrame(() => {
    const container = dropdownRef.value;
    if (!container) return;

    if (filterable) filterInputRef.value?.focus();
    else {
      const list = filteredOptions.value;
      const activeIdx = list.findIndex(o => isSelected(getOptionValue(o)));
      const targetIdx = activeIdx !== -1 ? activeIdx : 0;
      const targetElement = optionEls.value[targetIdx];
      if (targetElement) {
        const containerRect = container.getBoundingClientRect();
        const itemRect = targetElement.getBoundingClientRect();
        // 间距对齐 v-edge-fade.y 的 size:16：低于该值选中项落在上下渐隐遮罩区内，观感如同贴边
        const gapOffset = 16;
        if (itemRect.top - gapOffset < containerRect.top)
          container.scrollTop -= containerRect.top - itemRect.top + gapOffset;
        else if (itemRect.bottom + gapOffset > containerRect.bottom)
          container.scrollTop += itemRect.bottom - containerRect.bottom + gapOffset;

        // focus 原生的 focus scrolling 以「恰好可见 = 零间距」为准，会在面板 scale 过渡期间
        // （rect 为缩放中坐标，滚动计算失真）把刚定位好的选项重滚成贴边——焦点必须与滚动解耦
        targetElement.focus({ preventScroll: true });
      }
    }
  });
};
</script>
