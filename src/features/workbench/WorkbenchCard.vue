<template>
  <div
    class="bg-bg-panel/90 border-glass-border shadow-panel py-xl px-2xl duration-slow ease-sidebar hover:border-border-base pointer-events-auto relative flex shrink-0 flex-col items-center justify-evenly rounded-md border backdrop-blur-lg transition-all hover:shadow-lg"
  >
    <div class="z-base relative flex w-full shrink-0 justify-center">
      <Fretboard
        :chord="editorStore.draftChord"
        :is-dark-mode="globalDarkMode"
        :scale="1.0"
        @update:barres="handleBarresChange"
        @update:capo="handleCapoUpdate"
        @update:chord-name="handleChordNameChange"
        @update:name-segments="handleNameSegmentsChange"
        @update:root-string-index="handleRootStringChange"
        @update:strings="handleStringsChange"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import Fretboard from '@/components/fretboard/Fretboard.vue';
import { nameToSegments } from '@/services/music/theory';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { globalDarkMode } from '@/stores/globalState';
import type { BarreEntity, ChordNameSegments, GuitarStringsModel, StringIndex } from '@/types';
import { toCapo, toStringIndex } from '@/utils/music/chord-fretboard';

const editorStore = useChordEditorStore();

/** 任一编辑操作都会把草稿标记为「创建中」，仅当非编辑态时生效 */
const markCreating = () => {
  if (!editorStore.isEditing) editorStore.isCreating = true;
};

/** 用户在指板上调整 Capo 后写入草稿 */
const handleCapoUpdate = (capo: number) => {
  editorStore.draftChord.capo = toCapo(capo);
  markCreating();
};

/** 用户按弦变化后同步整份按弦模型到草稿 */
const handleStringsChange = (strings: GuitarStringsModel) => {
  strings.forEach((str, i) => {
    editorStore.draftChord.strings[i] = [str[0], str[1]];
  });
  markCreating();
};

/** 用户切换根音弦后写入草稿（目标弦无按音时视为取消根音） */
const handleRootStringChange = (index: number | null) => {
  const validIndex: StringIndex | null =
    index !== null && (editorStore.draftChord.strings[index]?.[0] ?? -1) >= 0 ? toStringIndex(index) : null;
  editorStore.draftChord.rootStringIndex = validIndex;
  markCreating();
};

/** 用户输入和弦名后解析为音名段写入草稿（清空名则置空） */
const handleChordNameChange = (name: string) => {
  const segs = name ? nameToSegments(name) : null;
  editorStore.draftChord.nameSegments = segs;
  markCreating();
};

/** 用户编辑音名段后写入草稿 */
const handleNameSegmentsChange = (segments: ChordNameSegments | null) => {
  editorStore.draftChord.nameSegments = segments;
  markCreating();
};

/** 用户在指板上点击横按切换标记后同步到草稿 */
const handleBarresChange = (barres: BarreEntity[] | undefined) => {
  editorStore.setBarres(barres);
  markCreating();
};
</script>
