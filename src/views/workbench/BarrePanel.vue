<template>
  <div
    class="transition-[width,min-width] duration-slow ease-sidebar h-auto p-3 bg-bg-panel border border-glass-border rounded-lg flex flex-col box-border overflow-hidden"
    :class="effectiveExpanded ? 'w-[19rem] min-w-[19rem]' : 'w-[14rem] min-w-[14rem]'"
  >
    <div
      class="flex items-center justify-between gap-2 shrink-0 h-7 border-b transition-[border-color,padding-bottom] duration-slow ease-sidebar"
      :class="effectiveExpanded ? 'pb-1.5 border-border-light' : 'pb-0 border-transparent'"
    >
      <div
        class="group flex items-center gap-1.5 -ml-1 pl-1 pr-1.5 py-0.5 rounded-md cursor-pointer hover:bg-bg-panel-hover/50 transition-colors"
        role="button"
        :tabindex="0"
        :aria-expanded="effectiveExpanded"
        :aria-label="effectiveExpanded ? '收起横按标记面板' : '展开横按标记面板'"
        @click="toggleCollapse"
        @keydown.enter.prevent="toggleCollapse"
        @keydown.space.prevent="toggleCollapse"
      >
        <div class="flex items-center justify-center w-5 h-5 rounded-md bg-tint-primary-88 text-primary">
          <MoveHorizontal class="group-hover:hidden" :size="13" :stroke-width="2.5" />
          <Minimize2 v-if="effectiveExpanded" class="hidden group-hover:block" :size="13" :stroke-width="2.5" />
          <Maximize2 v-else class="hidden group-hover:block" :size="13" :stroke-width="2.5" />
        </div>
        <span class="text-xs font-extrabold text-text-title tracking-tight break-keep">横按标记</span>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <ActionButton
          v-tooltip="'自动标记横按'"
          compacted
          variant="ghost"
          size="sm"
          :color="editorStore.autoBarre ? 'primary' : 'default'"
          title="自动标记横按"
          @click="toggleAutoBarre"
        >
          自动
        </ActionButton>
      </div>
    </div>

    <!-- 内容区高度动画：测量内容真实高度写入 height 并过渡，覆盖展开/收起与内容尺寸变化 -->
    <div
      class="overflow-hidden transition-[height] duration-base ease-sidebar flex justify-center items-start"
      :style="{ height: bodyHeight }"
    >
      <!-- 被测量内容宽度瞬时锁定到目标内容区宽度（面板宽 - 卡片左右内边距 p-3 共 1.5rem），
           宽度动画期间不再随面板伸缩而重排，useAutoHeight 测得的高度保持稳定、不抖动 -->
      <div ref="bodyContentRef" class="w-[calc(19rem-1.5rem)]">
        <Transition mode="out-in">
          <div v-if="isExpanded" key="content" class="flex flex-col gap-1 pt-2">
            <div class="flex justify-center py-1 box-border">
              <Fretboard
                :wide-nut="false"
                :chord="editorStore.draftChord"
                :interactive="false"
                :show-pitch-names="false"
                :show-chord-name="false"
                :scale="0.6"
                :barre-pick-mode="true"
                :show-fret-numbers="false"
                :show-open-strings="false"
                :barre-candidates="candidates"
                @barre-click="handleBarreClick"
              />
            </div>
            <p v-if="candidates.length === 0" class="form-hint">
              当前指板没有可横按的弦组：同一品位至少按 2 根弦，且跨距内无空弦/静音。
            </p>
            <p v-else-if="showPitchNamesOn" class="form-hint">显示音名模式下主指板不渲染横按条，关闭后可查看。</p>
            <p v-else class="form-hint">点击指板上的半透明横按条即可标记，再次点击已标记的横按可清除。</p>
          </div>
          <p v-else-if="effectiveExpanded" key="empty" class="form-hint pt-2">
            在指板上按出至少两根弦，即可在此标记横按。
          </p>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/base/ActionButton.vue';
import Fretboard from '@/components/fretboard/Fretboard.vue';
import { useAutoHeight } from '@/composables/ui/useAutoHeight';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { BarreEntity } from '@/types';
import { computeBarreCandidates } from '@/utils/music/chord-fretboard';
import { Maximize2, Minimize2, MoveHorizontal } from '@lucide/vue';
import { computed, ref, useTemplateRef } from 'vue';

const editorStore = useChordEditorStore();
const settingsStore = useSettingsStore();

/** 指板有按音时面板有内容；但无论有无内容，用户都可手动收起/展开
 * （即使无音符也允许展开，空白态给出占位提示）。
 * 初始默认：有内容展开、无内容收起为 14rem 小面板 */
const isExpanded = computed(() => !editorStore.isFretBoardEmpty);

const collapsed = ref(!isExpanded.value);
const effectiveExpanded = computed(() => !collapsed.value);
const toggleCollapse = () => {
  collapsed.value = !collapsed.value;
};

const bodyContentRef = useTemplateRef<HTMLElement>('bodyContentRef');
const { height: bodyHeight } = useAutoHeight(bodyContentRef, effectiveExpanded);

/** 工作台「显示音名」是否开启：开启时主指板不渲染横按条，需要文字提示 */
const showPitchNamesOn = computed(() => settingsStore.workbenchShowPitchNames);

/** 已标记横按列表（支持多条，如双横按和弦） */
const barres = computed<BarreEntity[]>(() => editorStore.draftChord.barres ?? []);

/** 根据当前指板实时计算可标记候选（随指板变化自动刷新） */
const candidates = computed<BarreEntity[]>(() =>
  computeBarreCandidates(editorStore.draftChord.strings, editorStore.draftChord.fretCount)
);

const isSameBarre = (a: BarreEntity, b: BarreEntity) =>
  a.fret === b.fret && a.fromString === b.fromString && a.toString === b.toString;

const isActiveBarre = (b: BarreEntity) => barres.value.some(x => isSameBarre(x, b));

/** 判断两条横按在同一品位且琴弦区间存在重叠（有重叠才互斥替换，无重叠区间允许并存） */
const isOverlapping = (a: BarreEntity, b: BarreEntity) =>
  a.fret === b.fret && Math.max(a.fromString, b.fromString) <= Math.min(a.toString, b.toString);

/** 点击指板上的横按梁：已标记则整条取消；未标记则标记并替换与其琴弦区间重叠的旧横按（无重叠的同品横按保留并存） */
const handleBarreClick = (barre: BarreEntity) => {
  const current = barres.value;
  if (isActiveBarre(barre)) {
    editorStore.setBarres(current.filter(x => !isSameBarre(x, barre)));
  } else {
    editorStore.setBarres([...current.filter(x => !isOverlapping(x, barre)), barre]);
  }
};

/** 切换横按自动标记开关（持久化，由 chordEditorStore 的 autoBarre 负责写入 localStorage） */
const toggleAutoBarre = () => {
  editorStore.autoBarre = !editorStore.autoBarre;
};
</script>
