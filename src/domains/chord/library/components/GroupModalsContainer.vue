<template>
  <PromptInputModal
    v-model="groupModals.modalData.inputValue"
    v-model:visible="groupModals.modals.create"
    :maxlength="MAX_GROUP_NAME_LENGTH"
    @confirm="groupModals.handleCreateGroup"
    placeholder="请输入分组名称..."
    title="新建分组"
  />

  <PromptInputModal
    v-model="groupModals.modalData.inputValue"
    v-model:visible="groupModals.modals.rename"
    :maxlength="MAX_GROUP_NAME_LENGTH"
    @confirm="groupModals.handleRenameGroup"
    select-on-focus
    placeholder="请输入新名称..."
    title="修改组名"
  />

  <BaseModal
    v-model:visible="groupModals.modals.delete"
    :title="deleteGroupTitle"
    @confirm="groupModals.handleDeleteGroup"
    confirm-type="danger"
  >
    <p class="modal-description-text m-0 text-xs/relaxed font-medium text-fg-body">
      确定要执行此删除操作吗？删除后组内的所有和弦都将清空。
    </p>
  </BaseModal>

  <BaseModal v-model:visible="groupModals.modals.sort" @confirm="groupModals.handleSaveSort" title="和弦排序">
    <BaseForm :gap="formGap" :label-width="formLabelWidth" :size="formControlSize" class="sort-modal-body py-xs">
      <BaseFormRow label="排序规则">
        <BaseSegmentedControl
          v-model="groupModals.modalData.sortRule"
          :compacted="isMobile"
          :options="SORT_RULE_CONFIG"
          width="auto"
        />
      </BaseFormRow>

      <BaseFormRow label="调式设定">
        <KeySelector
          v-model="groupModals.modalData.sortKey"
          :disabled="groupModals.modalData.sortRule !== 'KEY_DEGREE'"
          :width="sortKeyWidth"
        />
      </BaseFormRow>
    </BaseForm>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import KeySelector from '@/domains/chord/components/KeySelector.vue';
import BaseForm from '@/platform/ui/form/BaseForm.vue';
import BaseFormRow from '@/platform/ui/form/BaseFormRow.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import PromptInputModal from '@/platform/ui/prompt/PromptInputModal.vue';
import BaseSegmentedControl from '@/platform/ui/segmented/BaseSegmentedControl.vue';
import { CHORD_GROUP_MODALS } from '@/domains/chord/library/injectionKeys';
import { SORT_RULE_CONFIG } from '@/domains/chord/theory/theory';
import { useResponsive } from '@/platform/composables/useResponsive';
import { injectModalController } from '@/platform/store/useModalController';

import type { ComponentSize } from '@/platform/types';

const groupModals = injectModalController(CHORD_GROUP_MODALS);

/** 表单行统一 Label 宽度：由 BaseForm 容器下发，各行无需重复声明 */
const FORM_LABEL_WIDTH = '4.2rem';
/** 窄屏下的 Label 宽度：与控件尺寸档同步收一档，把省下的横向空间让给控件 */
const FORM_LABEL_WIDTH_NARROW = '3.6rem';

const { isMobile } = useResponsive();

/**
 * 排序弹窗的紧凑度：窄屏下标签列、行距、控件尺寸档整体收一档，两枚控件各自再收一层。
 *
 * 两枚控件是**定宽**的（分段控件按内容自适应、调式选择器 8rem 档），桌面档下
 * 「4.2rem 标签列 + 两枚定宽控件」在 480px 卡片里绰绰有余，窄屏把标签列与控件同时收窄后
 * 仍会顶出控件列（360px 档最紧），故：
 * - 分段控件开 compacted（三个选项的内边距各收一档，横向省下约 33px）；
 * - 调式选择器在窄屏改为填满控件列（其 8rem 默认档本身就比 360px 档的控件列宽）。
 *
 * 与「不按视口切布局」不冲突 —— 收的是标尺（一行多宽 / 多高），行数与行结构不变。
 * 桌面档一律取改动前的原值，故宽屏渲染逐像素不变。
 */
const formLabelWidth = computed(() => (isMobile.value ? FORM_LABEL_WIDTH_NARROW : FORM_LABEL_WIDTH));
const formGap = computed<'md' | 'lg'>(() => (isMobile.value ? 'md' : 'lg'));
const formControlSize = computed<ComponentSize>(() => (isMobile.value ? 'sm' : 'md'));
/** 调式选择器宽度：窄屏填满控件列（'full' 档同时把外层 popover 置为 block）；桌面档不传，交给控件自己的默认档位 */
const sortKeyWidth = computed(() => (isMobile.value ? 'full' : undefined));

/** 分组名称最大长度 */
const MAX_GROUP_NAME_LENGTH = 15;

/** 删除分组弹窗标题：拼接被删分组名。
 *  分组缺失时退到不带名字的标题 —— 弹窗由宿主打开，而「打开」与「分组此刻仍在」之间没有保证
 *（分组完全可能在弹窗开着的时候被别处删掉），直接拼可选链会渲染出「删除分组 undefined」。 */
const deleteGroupTitle = computed(() => {
  const name = groupModals.modalData.activeGroup?.name;
  return name ? `删除分组 ${name}` : '删除分组';
});
</script>
