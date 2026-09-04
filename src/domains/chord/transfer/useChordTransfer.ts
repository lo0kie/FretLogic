/**
 * 和弦域文字传递：复制单个和弦到剪贴板 / 从剪贴板解析和弦载入编辑器草稿。
 * 剪贴板读写与 toast 全部收敛于此，组件保持薄；乐谱域的 useTextTransfer 委托本模块提供和弦能力。
 */
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { createChord } from '@/domains/chord/theory/entityFactories';
import { nameToSegments } from '@/domains/chord/theory/theory';
import {
  parseChordFromText,
  serializeChordToText,
  type PortableChord,
  type TextParseReason,
} from '@/domains/chord/transfer/chordTextCodec';
import type { Chord } from '@/domains/chord/types';
import { readTextFromClipboard, writeTextToClipboard } from '@/platform/services/clipboard/clipboard';
import { useUiStore } from '@/platform/store/uiStore';

/** 从便携和弦载荷构建编辑器草稿：置空 id/groupId，供用户审阅后保存（乐谱导入链路复用） */
export const buildDraftChordFromPortable = (p: PortableChord): Chord =>
  createChord({
    nameSegments: nameToSegments(p.name),
    strings: p.strings,
    fretCount: p.fretCount,
    fretOffset: p.fretOffset,
    groupId: '',
    tuning: p.tuning,
    rootStringIndex: p.rootStringIndex,
    barres: p.barres,
    id: '',
  });

/** 解析失败按原因分流提示（和弦/乐谱共用） */
export const pasteErrorToast = (reason: TextParseReason, target: '和弦' | '乐谱') => {
  const uiStore = useUiStore();
  if (reason === 'UNKNOWN_FORMAT') {
    uiStore.toast.warning('剪贴板内容不是 Fret Logic 可识别的格式');
  } else if (reason === 'WRONG_TYPE') {
    uiStore.toast.warning(target === '和弦' ? '这是乐谱文本，请到乐谱页粘贴' : '这是和弦文本，请到和弦页粘贴');
  } else if (reason === 'INVALID_HEADER') {
    uiStore.toast.warning('文字格式版本不匹配，请用相同版本的应用生成');
  } else if (reason === 'INVALID_NAME') {
    uiStore.toast.warning('文字中包含无法解析的和弦名');
  } else {
    uiStore.toast.warning('文字内容格式不完整');
  }
};

/** 和弦域文字传递能力（复制/粘贴单个和弦） */
export function useChordTransfer() {
  const editorStore = useChordEditorStore();
  const uiStore = useUiStore();

  /** 复制单个和弦为文字到剪贴板 */
  const copyChordText = async (chord: Chord): Promise<void> => {
    try {
      await writeTextToClipboard(serializeChordToText(chord));
      uiStore.toast.success(`已复制和弦到剪贴板`);
    } catch (err) {
      uiStore.toast.error(err instanceof Error ? err.message : '复制失败');
    }
  };

  /** 和弦卡片右键「复制」：复用单和弦复制 */
  const copyChordCardText = copyChordText;

  /** 工作台粘贴：解析文字载入编辑器草稿（切「新建」态，不静默改写库中既有和弦） */
  const pasteChordFromClipboard = async (): Promise<void> => {
    let text: string;
    try {
      text = await readTextFromClipboard();
    } catch (err) {
      uiStore.toast.error(err instanceof Error ? err.message : '读取剪贴板失败');
      return;
    }
    const result = parseChordFromText(text);
    if (!result.ok) {
      pasteErrorToast(result.reason, '和弦');
      return;
    }
    editorStore.setEditor(buildDraftChordFromPortable(result.data));
    editorStore.saveAsNewChord();
    uiStore.toast.success(`已加载和弦`);
  };

  return {
    copyChordText,
    copyChordCardText,
    pasteChordFromClipboard,
  };
}
