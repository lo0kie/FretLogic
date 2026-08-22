// Chords feature 公共出口（迁移中：当前重新导出旧位置以保证向后兼容）
// 完整迁移计划见 docs/plans/2026-08-22-fret-logic-rewrite-design.md
export { useChordStore } from '../../stores/chordStore';
export { useChordActions } from '../../ui/composables/useChordActions';
export { useChordGroupModals } from '../../ui/composables/useChordGroupModals';
export type { Chord, Group } from '../../types';
