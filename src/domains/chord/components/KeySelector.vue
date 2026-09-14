<template>
  <BaseSelector
    v-model="modelValue"
    :disabled
    :size
    :width
    :default-value="allowEmpty ? '' : 'C'"
    :highlight-non-default="false"
    :options="selectorOptions"
    clearable
  >
    <template #label="{ selected }">
      <span v-if="selected === ''" class="text-fg-disabled">未设置</span>
      <!-- 「调」走 suffix 显式声明：拼进 name 会让整串解析失败、升降号退化成普通字符 -->
      <span v-else v-chord-name="{ name: selected, suffix: '调' }" />
    </template>

    <template #option="{ option }">
      <span v-if="option === ''" class="text-fg-muted">未设置</span>
      <span v-else v-chord-name="{ name: option, suffix: '调' }" />
    </template>
  </BaseSelector>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import BaseSelector from '@/platform/ui/selector/BaseSelector.vue';
import { KEY_OPTIONS } from '@/domains/chord/theory/theory';

import type { ComponentSize } from '@/platform/types';

const modelValue = defineModel<string>({ required: true });

/**
 * 调式选择器：封装「BaseSelector + KEY_OPTIONS + 调名和弦样式双插槽」样板，
 * 供排序配置 / 乐谱指法调、演唱调等场景复用。
 */
const props = defineProps<{
  disabled?: boolean;
  /** 尺寸档位：sm/md/lg；不传时由 BaseSelector 回落到 BaseForm 上下文或默认 md */
  size?: ComponentSize;
  width?: string;
  /** 是否允许「未设置」空值选项（值 ''）：用于原调等可留空的调性字段 */
  allowEmpty?: boolean;
}>();

/** allowEmpty 时在选项首位插入空值「未设置」项；KEY_OPTIONS 为字符串数组，'' 即空值。
 *  default-value 传 '' 而非标签文案「未设置」：它是清空按钮的回退值与偏离判定基准，
 *  传文案会把非法调名 '未设置' 写进 modelValue */
const selectorOptions = computed(() => (props.allowEmpty ? ['', ...KEY_OPTIONS] : KEY_OPTIONS));
</script>
