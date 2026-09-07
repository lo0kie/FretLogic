<template>
  <div
    v-wheel-scroll.smooth
    v-bind="forwardAttrs"
    :class="[
      'base-editable-text',
      'border-none bg-transparent caret-primary outline-none select-text',
      placeholderClasses,
      attrClass,
    ]"
    :contenteditable="disabled ? 'false' : 'plaintext-only'"
    :data-placeholder="placeholder"
    @blur="handleBlur()"
    @compositionend="handleCompositionEnd()"
    @compositionstart="handleCompositionStart()"
    @focus="handleFocus()"
    @input="handleInput()"
    @keydown="handleKeydown($event)"
    ref="editorRef"
    role="textbox"
    spellcheck="false"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useAttrs, watch } from 'vue';

/**
 * 通用行内可编辑文本（contenteditable）：
 * 封装 contenteditable + 占位符 + 聚焦/失焦 + Enter 提交 / Esc 取消 + 超长截断与光标末尾维持 +
 * 失焦选区回收 + 内置 v-wheel-scroll（超长横向平移）等底层交互协议。
 * 业务层只关心「提交了哪个文本 / 是否取消」，不触碰任何 DOM/Selection。
 */
defineOptions({ name: 'BaseEditableText', inheritAttrs: false });

/** 当前文本（v-model） */
const modelValue = defineModel<string>({ required: true });

const props = withDefaults(
  defineProps<{
    /** 最大长度；超长自动截断并把光标维持到末尾 */
    maxlength?: number;
    /** 空内容时的占位符（:empty::before 渲染）；未传则不显示占位 */
    placeholder?: string;
    /** 是否禁用编辑 */
    disabled?: boolean;
  }>(),
  { maxlength: undefined, placeholder: undefined, disabled: false }
);

const emit = defineEmits<{
  (e: 'update:editing', value: boolean): void;
  /** 失焦（点击其它区域或按 Enter）时提交当前文本 */
  (e: 'commit', value: string): void;
  /** 按 Esc 取消编辑：组件已把内容恢复为 modelValue，该次失焦不会再触发 commit */
  (e: 'cancel'): void;
}>();

const attrs = useAttrs();
const { class: attrClass, ...restAttrs } = attrs;
const forwardAttrs = restAttrs;

const editorRef = ref<HTMLDivElement | null>(null);

/** 当前是否聚焦（编辑态）：父级据此暂停外部数据对内容的同步覆盖 */
const isEditing = ref(false);
/** Esc 取消标记：置位后紧随的 blur 不派发 commit */
const isCancelling = ref(false);

/** 读取当前文本内容 */
const readText = (): string => editorRef.value?.textContent ?? '';

/** 写入文本内容；空串直接清空子节点，保证 :empty 命中以显示占位符 */
const setText = (value: string) => {
  const el = editorRef.value;
  if (!el) return;
  if (!value.trim() && el.innerHTML !== '') {
    el.innerHTML = '';
    return;
  }
  if (el.textContent !== value) el.textContent = value;
};

/** 将光标折叠到文本末尾（超长截断后维持尾部输入位置） */
const moveCaretToEnd = () => {
  const el = editorRef.value;
  if (!el) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
};

/** 外部 modelValue 变化（非编辑态）时同步到 DOM，如撤销/重做或切换对象后回填 */
watch(modelValue, value => {
  if (!isEditing.value) setText(value);
});

// 关键：immediate watch 在 setup 阶段执行时 editorRef 尚未挂载（为 null），setText 是空操作；
// 若 modelValue 此后不再变化，DOM 不会被回填（典型：刷新后草稿名已就绪，input 却空白）。
// 因此元素真正挂载后再按 modelValue 回填一次，保证初始即显示正确文本。
onMounted(() => {
  setText(modelValue.value);
});

const handleFocus = () => {
  if (isEditing.value) return;
  isEditing.value = true;
  isCancelling.value = false;
  emit('update:editing', true);
};

/** IME 组合输入守卫：拼音合成期间不截断、不派发中间态，compositionend 后统一提交 */
const isComposing = ref(false);

const handleCompositionStart = () => {
  isComposing.value = true;
};

const handleCompositionEnd = () => {
  isComposing.value = false;
  // 合成结束后按普通输入派发一次最终文本
  handleInput();
};

const handleInput = () => {
  // 合成期间跳过：避免未上屏的拼音串写入 v-model，且截断会摧毁进行中的 IME 会话
  if (isComposing.value) return;
  const el = editorRef.value;
  if (!el) return;
  let text = el.textContent ?? '';
  if (props.maxlength !== undefined && text.length > props.maxlength) {
    text = text.slice(0, props.maxlength);
    setText(text);
    moveCaretToEnd();
  }
  if (!text.trim() && el.innerHTML !== '') el.innerHTML = '';
  modelValue.value = text;
};

const handleKeydown = (e: KeyboardEvent) => {
  // 阻断冒泡：内容可编辑嵌套在可聚焦父容器内时，避免父级全局键盘逻辑在输入期间响应
  e.stopPropagation();
  // IME 合成期间 Enter 用于确认候选词，不得当作提交
  if (isComposing.value) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    editorRef.value?.blur();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    isCancelling.value = true;
    // 内容回滚到外部 modelValue（即取消本次输入）；父级侧值未变化，无需再写回
    setText(modelValue.value);
    emit('cancel');
    editorRef.value?.blur();
  }
};

/** 失焦：回收嵌套可聚焦父容器内的文字选区（避免高亮残留），提交文本或（Esc 取消时）不提交 */
const handleBlur = () => {
  const el = editorRef.value;
  if (el) {
    const selection = window.getSelection();
    if (selection && selection.anchorNode && el.contains(selection.anchorNode)) {
      selection.removeAllRanges();
    }
  }
  isEditing.value = false;
  emit('update:editing', false);
  if (isCancelling.value) {
    isCancelling.value = false;
    setText(modelValue.value);
    return;
  }
  // 部分浏览器失焦先于 compositionend：DOM 中仍是未上屏的拼音组合串，直接提交会污染模型。
  // 此处按取消处理——回滚到 modelValue，待浏览器随后派发 compositionend 时再正常提交。
  if (isComposing.value) {
    isComposing.value = false;
    setText(modelValue.value);
    return;
  }
  const text = readText();
  modelValue.value = text;
  emit('commit', text);
};

/** 占位符样式类（仅空内容时经 :empty::before 显示） */
const placeholderClasses = computed(() =>
  props.placeholder
    ? [
        'empty:before:text-fg-disabled empty:before:pointer-events-none empty:before:content-[attr(data-placeholder)] empty:before:font-bold empty:before:opacity-35',
      ]
    : []
);
</script>
