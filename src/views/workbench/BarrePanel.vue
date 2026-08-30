<template>
  <div class="w-full h-auto p-3 bg-bg-panel border border-glass-border rounded-lg flex flex-col gap-2 box-border">
    <!-- 面板头部：固定高度，图标/标题/状态垂直居中 -->
    <div class="flex items-center justify-between gap-2 shrink-0 h-7 border-b border-border-light pb-1.5">
      <div class="flex items-center gap-1.5">
        <div class="flex items-center justify-center w-5 h-5 rounded-md bg-tint-primary-88 text-primary">
          <MoveHorizontal :size="13" :stroke-width="2.5" />
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

    <EmptyState
      v-if="editorStore.isFretBoardEmpty"
      size="sm"
      :icon="MoveHorizontal"
      description="在指板上按音以标记横按"
    />

    <div v-else class="flex flex-col gap-1">
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
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/base/ActionButton.vue';
import EmptyState from '@/components/base/EmptyState.vue';
import Fretboard from '@/components/fretboard/Fretboard.vue';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { BarreEntity } from '@/types';
import { computeBarreCandidates } from '@/utils/music/chord-fretboard';
import { MoveHorizontal } from '@lucide/vue';
import { computed } from 'vue';

const editorStore = useChordEditorStore();
const settingsStore = useSettingsStore();

/** 工作台「显示音名」是否开启：开启时主指板不渲染横按条，需要文字提示 */
const showPitchNamesOn = computed(() => settingsStore.workbenchShowPitchNames);

/** 已标记横按列表（支持多条，如双横按和弦） */
const barres = computed<BarreEntity[]>(() => editorStore.draftChord.barres ?? []);

/** 根据当前指板实时计算可标记候选（随指板变化自动刷新） */
const candidates = computed<BarreEntity[]>(() =>
  computeBarreCandidates(editorStore.draftChord.strings, editorStore.draftChord.fretCount)
);

const isActiveBarre = (b: BarreEntity) =>
  barres.value.some(x => x.fret === b.fret && x.fromString === b.fromString && x.toString === b.toString);

/** 点击指板上的横按梁：已标记则整条取消；未标记则标记并替换同品位的旧横按（同一品位只保留一条） */
const handleBarreClick = (barre: BarreEntity) => {
  const current = barres.value;
  if (isActiveBarre(barre)) {
    editorStore.setBarres(
      current.filter(
        x => !(x.fret === barre.fret && x.fromString === barre.fromString && x.toString === barre.toString)
      )
    );
  } else {
    editorStore.setBarres([...current.filter(x => x.fret !== barre.fret), barre]);
  }
};

/** 切换横按自动标记开关（持久化，由 chordEditorStore 的 autoBarre 负责写入 localStorage） */
const toggleAutoBarre = () => {
  editorStore.autoBarre = !editorStore.autoBarre;
};
</script>
