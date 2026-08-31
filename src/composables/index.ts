/**
 * composables 公共出口：按 score（谱面）、fretboard（指法板）、app（应用级服务）分组导出。
 */
// Score Composables
export * from './score/useAutoScroll';
export * from './score/useLineSelection';
export * from './score/useLyricsDragDrop';
export * from './score/useScoreExportPreview';
export * from './score/useScoreLinesData';

// Fretboard Composables
export * from './fretboard/useAudioPlayer';
export * from './fretboard/useChordActions';
export * from './fretboard/useFretboardInteraction';
export * from './fretboard/useFretboardLayout';

// App & Service Composables
export * from './app/useChordGroupModals';
export * from './app/useImportExportService';
export * from './app/useSongModals';
export * from './app/useSyncService';
export * from './app/useTheme';
