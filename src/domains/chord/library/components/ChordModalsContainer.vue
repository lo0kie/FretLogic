<template>
  <BaseModal v-model:visible="groupModals.modals.move" @confirm="groupModals.handleMoveChord" title="移动至新分组">
    <!-- 分组网格与抽屉的新建保存流程共用同一个组件（GroupPickerGrid）：列数两档、必须与 v-grid-nav
         的换行基数对齐、边缘羽化是唯一滚动线索、选中态为何用 tint 浅底而非实心 bg-primary，
         这些口径全部收在该组件内，此处不再各写一份（此前两份平行实现的注释已因此分叉）。
         两处真实的语义差异由 props 承担：提示文案不同、且移动流程要禁用「当前所属分组」那一项。 -->
    <GroupPickerGrid
      v-model="groupModals.modalData.moveTargetId"
      :active-group-id="groupModals.modalData.activeChord?.groupId"
      :chords-by-group="chordStore.groupChordMap"
      :groups="chordStore.groups"
      disable-active
      active-tooltip="和弦当前已在此分组中"
    />
  </BaseModal>

  <BaseModal v-model:visible="groupModals.modals.chordVariantsDelete" hide-footer width="lg">
    <template #title>
      <!-- 窄屏（< sm）把指令给的 `inline-flex` 改回 `block`：指令那套 `inline-flex` + 子项全
           `whitespace-nowrap` 装不下时既不折行也不缩，只会被外层硬裁（连省略号都没有）。
           改 block 后子项按行内排版，`truncate` 才收得出省略号 —— 与外壳默认标题（h3 自带 `truncate`）
           同一种收尾；≥ sm 保持 `inline-flex` 不动，宽屏几何逐像素不变。 -->
      <span
        v-chord-name="{ name: groupModals.modalData.referenceChordName, prefix: '删除和弦 ', suffix: ' 的指法' }"
        class="font-bold text-fg-title max-sm:block max-sm:truncate"
      />
    </template>

    <template #header-extra>
      <!-- 窄屏（< sm）把「全选」让给正文的计数行（见下方同名实例）。
           本弹窗标题是 v-chord-name 渲染的 inline-flex，子项全 `whitespace-nowrap`：装不下时
           既不折行也不缩，外壳只能把它裁掉 —— 于是标题会少掉小半截（实测标题内容宽 239px，
           而 320~414px 下左盒与「全选」+ 关闭钮同排只剩 85~179px）。腾出这一行后标题独占整行，
           「全选」也正好落在「共 N 个，已选 M 个」旁边。两处实例互补（`max-sm:hidden` / `sm:hidden`），
           任何宽度下恰好只显示一枚；控件完全受控、props 同源（脚本的 selectAllProps），不存在两份状态。
           外面包一层 span 是为了让 `hidden` 说了算：BaseCheckbox 的根自带 display 类，而构建 CSS 里
           `.hidden` 排在 `.inline-flex` 之前，直接写在它身上会被后者盖掉。 -->
      <span class="max-sm:hidden">
        <BaseCheckbox v-bind="selectAllProps" />
      </span>
    </template>

    <div class="flex flex-col gap-md">
      <div class="flex items-center justify-between gap-lg">
        <!-- 宽度耦合必须断开，否则窄屏下切换全选会让这一行的行高跳变、复选框跟着上下跳：
             本行高度 = max(文本行数, 右侧那一格的 strut)，而 `items-center` 让复选框随行高重新居中；
             文本的换行数取决于它的可用宽度 = 行宽 − gap − 右格宽度，右格宽度原本是内容宽度
             （max-content），勾选态把「全选」切成 `font-medium`（BaseCheckbox 的 labelClass）
             → 宽度 +1px → 左侧可用宽度 −1px → 文本在临界处换行数跳变（实测：文本内容宽度 +2px
             时，右格被反向挤压 −1.53px，两者互相牵制）。
             两处一起钉死：文本 `flex-1 min-w-0` 让它的宽度完全由行宽决定（不再参与收缩分配），
             右格 `w-[3.25rem] shrink-0` 固定占位 —— 文本可用宽度恒定、行数恒定、行高恒定，
             复选框不再随勾选态移动。3.25rem 是「勾选框 + 间距 + 全选二字」的实测宽度（≈64px）
             再留一点余量。 -->
        <p class="m-0 min-w-0 flex-1 text-xs/relaxed font-medium text-fg-body">
          请点击选择要删除的指法，共
          <strong class="font-bold text-danger">
            {{ groupModals.modalData.activeGroupCard?.variants.length || 0 }}
          </strong>
          个，已选
          <strong class="font-bold text-danger">
            <BaseRollingText :text="`${groupModals.modalData.selectedVariantIds.size}`" class="tabular-nums" />
          </strong>
          个
        </p>

        <!-- 窄屏专属的「全选」：与 header-extra 那枚互补，理由见该处注释 -->
        <span class="flex w-[3.25rem] shrink-0 justify-end sm:hidden">
          <BaseCheckbox v-bind="selectAllProps" />
        </span>
      </div>

      <!-- 列数：**恒定 3 列**，装不下就横向滚动（390px 手机上网格宽 ≈443px、可视区 ≈271px）。
           3 列的下界由**画布宽度**定：卡内指板是固定几何、不随列宽收缩（6 弦基准宽 72px ×
           scale 1.8 ≈ 130px，算式见 FretboardCanvas 的 layout.width），列宽小于它（再加卡片两侧
           1.5px 边框 = 133px）就横向溢出卡片、盖到相邻卡片上。
           轨道取 `minmax(min-content, 1fr)`，而不是 Tailwind `grid-cols-3` 的 `minmax(0, 1fr)`：
           后者的 0 下界会把轨道压得比画布还窄，画布就从卡片里挤出去了。这里的取舍是**宁可网格横向
           溢出、由滚动条兜住，也不缩指板** —— 宽屏（弹窗 640px）下网格内宽 554.6px > 3×133 +
           2×gap-lg(22.25) = 443.5px，三列照旧铺满、根本不触发滚动；只有弹窗被视口压窄
           （≲ 562px）时才需要横滚 —— 3 列要的 443.5px 反推回视口正是 562px（卡宽 = 视口 −
           2×p-md，正文内宽再各去 px-xl 与 p-xs 那两道留白）。
           横滚落在本层（`axis="x"`）而不是弹窗正文那一层：正文要管纵向，混在一处会让「共 N 个，
           已选 M 个」那一行跟着横向漂走。自绘滚动条随 axis 默认开启（这里刻意不再写
           `:scrollbar="false"`）—— 它是「右边还有内容」的唯一可见线索。 -->
      <BaseScrollArea axis="x" class="grid grid-cols-[repeat(3,minmax(min-content,1fr))] gap-lg p-xs">
        <div
          v-wave
          v-for="variant in groupModals.modalData.activeGroupCard?.variants"
          :aria-checked="groupModals.modalData.selectedVariantIds.has(variant.id)"
          :aria-label="`指法 偏移 ${variant.fretOffset}`"
          :class="{
            'border-danger! bg-tint-danger-90! ring-1 ring-tint-danger-50':
              groupModals.modalData.selectedVariantIds.has(variant.id),
          }"
          :key="variant.id"
          @click="groupModals.toggleVariantSelection(variant.id)"
          @keydown.enter.prevent="groupModals.toggleVariantSelection(variant.id)"
          @keydown.space.prevent="groupModals.toggleVariantSelection(variant.id)"
          data-focusable-outline
          class="relative flex min-w-0 cursor-pointer flex-col items-center justify-center rounded-md border-[1.5px] border-border-light bg-surface-body transition-all duration-fast outline-none select-none hover:-translate-y-px hover:border-border-base hover:bg-surface-panel-hover active:scale-[0.98]"
          role="checkbox"
          tabindex="0"
        >
          <!-- 不画和弦名但预留其版面（reserve-chord-name）→ 几何与和弦库 picker 一致、直接命中同一批
                 位图；组件会裁掉预留段，故缩略图外观与之前完全相同。
                 scale 取 1.8（与工作台同档，也是本弹窗改造前的档位）：6 弦画布 130px，三列网格
                 每格 133px（含两侧 1.5px 边框）刚好放得下 —— 宽屏弹窗 640px 下网格内宽 554.6px、
                 三列合计 443.5px，余量 111px；窄屏装不下时由上层横向滚动兜住（见上方列数说明），
                 不再靠缩指板换列数。
                 1.8 相对位图参考分辨率 1.4 是 1.29 倍上采样，线条略软、肉眼无感；1.4 虽与位图 1:1
                 零重采样，但会把画布收到 101px —— 那是「两列时代」为了塞进窄列付的代价，宽屏下
                 没有理由再付（口径见 fretboardBitmapCache 的 REFERENCE_DISPLAY_SCALE）。 -->
          <FretboardCanvas :chord="variant" :is-dark-mode="isDark" :scale="1.8" hide-chord-name reserve-chord-name />
        </div>
      </BaseScrollArea>
      <!-- 窄屏（< sm）改为堆叠，与 BaseModal 的 footer 同一条理由：这一行是自绘的（不走外壳 footer），
           且 `justify-between` 在负剩余空间下退化为 flex-start，溢出跑到**右侧**被卡片裁掉 ——
           320~414px 下右边的「全部删除」「删除选中」都点不到。堆叠只落在这一行的外层：
           「取消」独占一行，内层动作组的两枚删除钮仍并排、各分一半宽度（`*:grow`），
           拆成三行会让两枚成对的删除操作被拆散。最窄档（320px）下这两枚加起来仍超过行宽，
           由内层自己的 `flex-wrap` 兜底折行，而不是被裁掉。
           内层不要再写 `ml-auto`：单行时右对齐已由外层的 `justify-between` 负责，而在堆叠下
           它会挡住拉伸（交叉轴的自动外边距会让子项退回内容宽度、不铺满），`grow` 随之失效。
           堆叠方向取 `flex-col-reverse`（与 BaseModal 的 footer 同一口径）：DOM 仍是「取消 → 删除钮组」
           —— 宽屏那一行要的就是这个左右次序，反转后窄屏自上而下变成「删除钮组 → 取消」，
           主要动作在前、次要的取消垫底。 -->
      <div
        class="mt-[0.15rem] flex flex-wrap items-center justify-between gap-md border-t border-border-light pt-md pb-xs max-sm:flex-col-reverse max-sm:items-stretch"
      >
        <ActionButton @click="groupModals.modals.chordVariantsDelete = false" label="取消" variant="ghost" />

        <div class="flex flex-wrap items-center gap-sm max-sm:*:grow">
          <ActionButton
            @click="groupModals.handleDeleteAllVariants()"
            color="danger"
            label="全部删除"
            variant="ghost"
          />

          <ActionButton
            :disabled="groupModals.modalData.selectedVariantIds.size === 0"
            @click="groupModals.handleDeleteSelectedVariants()"
            color="danger"
            label="删除选中"
          />
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import GroupPickerGrid from '@/domains/chord/library/components/GroupPickerGrid.vue';
import FretboardCanvas from '@/domains/fretboard/components/FretboardCanvas.vue';
import ActionButton from '@/platform/ui/button/ActionButton.vue';
import BaseCheckbox from '@/platform/ui/checkbox/BaseCheckbox.vue';
import BaseModal from '@/platform/ui/modal/BaseModal.vue';
import BaseRollingText from '@/platform/ui/rolling-text/BaseRollingText.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import { CHORD_GROUP_MODALS } from '@/domains/chord/library/injectionKeys';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { isDark } from '@/platform/composables/useTheme';
import { injectModalController } from '@/platform/store/useModalController';

const groupModals = injectModalController(CHORD_GROUP_MODALS);

const chordStore = useChordStore();

const isAllVariantsSelected = computed(() => {
  const variants = groupModals.modalData.activeGroupCard?.variants ?? [];
  if (variants.length === 0) return false;
  return variants.every(v => groupModals.modalData.selectedVariantIds.has(v.id));
});

const isVariantsIndeterminate = computed(() => {
  const variants = groupModals.modalData.activeGroupCard?.variants ?? [];
  const selectedCount = variants.filter(v => groupModals.modalData.selectedVariantIds.has(v.id)).length;
  return selectedCount > 0 && selectedCount < variants.length;
});

/** 全选/取消全选待删除的指法 */
const handleToggleSelectAllVariants = () => {
  const variants = groupModals.modalData.activeGroupCard?.variants ?? [];
  if (isAllVariantsSelected.value) variants.forEach(v => groupModals.modalData.selectedVariantIds.delete(v.id));
  else variants.forEach(v => groupModals.modalData.selectedVariantIds.add(v.id));
};

/**
 * 「全选」复选框的绑定：同一枚控件在窄屏与宽屏分处两行（见模板注释），两处共用这一份。
 * 控件是完全受控的，props / 事件同源即等价于同一枚控件 —— 不必也不该维护第二份状态。
 */
const selectAllProps = computed(() => ({
  'indeterminate': isVariantsIndeterminate.value,
  'modelValue': isAllVariantsSelected.value,
  'label': '全选',
  'size': 'sm' as const,
  'onUpdate:modelValue': handleToggleSelectAllVariants,
}));
</script>
