// 乐谱与排版领域的**模块清单**：列清本域对外可用的模块，便于人快速了解边界。
// ⚠️ 它**不是导入入口**（见 .github/CONTRIBUTING.md「目录结构」）：跨领域消费一律走深路径，
// 域内新增 / 移动模块时同步维护本清单。此约定同样适用于 chord/index.ts 与 fretboard/index.ts。
export { default as SongSection } from './library/components/SongSection.vue';
export { default as SongModalsContainer } from './library/components/SongModalsContainer.vue';
export * from './library/composables/useSongModals';
export * from './library/store/songStore';
export { default as ScoreView } from './editor/components/ScoreView.vue';
export { default as ScoreInteractiveArea } from './editor/components/ScoreInteractiveArea.vue';
export { default as ChordSlot } from './editor/components/slot/ChordSlot.vue';
export { default as ScoreLyricsEditor } from './editor/components/ScoreLyricsEditor.vue';
export * from './editor/composables/useLyricsDragDrop';
export * from './editor/composables/useScoreLinesData';
export * from './editor/composables/lyrics-drag/useDragAutoScroll';
export * from './editor/composables/lyrics-drag/useDragGhost';
export * from './editor/composables/lyrics-drag/useDragHighlight';
export * from './editor/store/scoreEditorStore';
export { default as ScorePreviewPane } from './preview/components/ScorePreviewPane.vue';
export * from './preview/services/workerExportService';
export * from './preview/services/scoreExportCanvas';
export * from './transfer/textCodec';
export * from './transfer/useTextTransfer';
export * from './model/scoreModel';
export * from './model/chordSlots';
export * from './model/songRepository';
export * from './constants';
export * from './types';
