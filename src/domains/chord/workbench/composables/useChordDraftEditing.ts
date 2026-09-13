import { computed } from 'vue';

import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { getChordName, nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { DEFAULT_FRET_COUNT } from '@/domains/fretboard/constants';
import { toFretOffset, toStringIndex } from '@/domains/fretboard/model/coordinates';

import type { ChordNameSegments } from '@/domains/chord/types';
import type { BarreEntity, GuitarStringsModel, StringIndex } from '@/domains/fretboard/types';

/**
 * 和弦草稿编辑：把 Fretboard 的交互事件统一写入 editorStore.draftChord，
 * 并在任一编辑操作后把草稿标记为「创建中」。
 * 工作台视图与选器和弦抽屉共用同一套写入逻辑，避免两处漂移。
 */
export const useChordDraftEditing = () => {
  const editorStore = useChordEditorStore();

  /** 任一编辑操作把草稿标记为「创建中」（编辑已有和弦时不重复标记） */
  const markCreating = () => {
    if (!editorStore.isEditing) editorStore.isCreating = true;
  };

  /** 用户在指板上调整品位偏移后写入草稿 */
  const handleFretOffsetUpdate = (offset: number) => {
    editorStore.draftChord.fretOffset = toFretOffset(offset);
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

  return {
    editorStore,
    handleFretOffsetUpdate,
    handleStringsChange,
    handleRootStringChange,
    handleChordNameChange,
    handleNameSegmentsChange,
    handleBarresChange,
  };
};

/**
 * 和弦草稿保存态：驱动保存操作栏的可用性（与 WorkbenchFloatingBar 语义一致）。
 * · isPristine：草稿与全新空白状态一致（未做任何编辑），隐藏/禁用保存相关操作
 * · isSaveDisabled：缺和弦名或指板为空，不允许保存
 */
export const useChordDraftSaveState = () => {
  const editorStore = useChordEditorStore();

  const isPristine = computed(() => {
    const cleanName = getChordName(editorStore.draftChord).trim();
    return (
      !editorStore.isEditing &&
      cleanName === '' &&
      editorStore.isFretBoardEmpty &&
      editorStore.draftChord.fretOffset === 0 &&
      editorStore.draftChord.fretCount === DEFAULT_FRET_COUNT &&
      editorStore.draftChord.tuning === Tuning.STANDARD
    );
  });

  const isSaveDisabled = computed(() => {
    const cleanName = getChordName(editorStore.draftChord).trim();
    return !cleanName || editorStore.isFretBoardEmpty;
  });

  return { isPristine, isSaveDisabled };
};
