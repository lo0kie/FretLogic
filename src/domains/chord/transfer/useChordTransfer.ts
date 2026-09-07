/**
 * 和弦域文字传递：复制单个和弦到剪贴板 / 从剪贴板解析和弦载入编辑器草稿。
 * 剪贴板读写与 toast 全部收敛于此，组件保持薄；乐谱域的 useTextTransfer 委托本模块提供和弦能力。
 */
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { createChord } from '@/domains/chord/theory/entityFactories';
import { nameToSegments } from '@/domains/chord/theory/theory';
import {
  parseChordFromText,
  parseGroupFromText,
  serializeChordToText,
  serializeGroupToText,
} from '@/domains/chord/transfer/chordTextCodec';
import { GroupSortRule } from '@/domains/chord/types';
import { readTextFromClipboard, writeTextToClipboard } from '@/platform/services/clipboard/clipboard';
import { useUiStore } from '@/platform/store/uiStore';

import type { PortableChord, TextParseReason } from '@/domains/chord/transfer/chordTextCodec';
import type { Chord, Group } from '@/domains/chord/types';

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
    uiStore.toast.warning('无法识别的格式');
  } else if (reason === 'WRONG_TYPE') {
    uiStore.toast.warning(target === '和弦' ? '请到乐谱页粘贴' : '请到和弦页粘贴');
  } else if (reason === 'INVALID_HEADER') {
    uiStore.toast.warning('文字格式版本不匹配');
  } else if (reason === 'INVALID_NAME') {
    uiStore.toast.warning('文字中包含无法解析的和弦名');
  } else {
    uiStore.toast.warning('文字内容格式不完整');
  }
};

/** 和弦域文字传递能力（复制/粘贴单个和弦） */
export function useChordTransfer() {
  const editorStore = useChordEditorStore();
  const chordStore = useChordStore();
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

  /** 复制整个分组到剪贴板：分组名 + 排序规则 + 组内全部和弦（FLGROUP 文本，跨实例可粘贴） */
  const copyGroupText = async (group: Group): Promise<void> => {
    const chords = chordStore.groupChordMap.get(group.id) ?? [];
    try {
      await writeTextToClipboard(serializeGroupToText(group, chords));
      uiStore.toast.success(`已复制分组（${chords.length} 个和弦）到剪贴板`);
    } catch (err) {
      uiStore.toast.error(err instanceof Error ? err.message : '复制失败');
    }
  };

  /** 工作台粘贴：解析文字载入编辑器草稿（切「新建」态，不静默改写库中既有和弦）；
   *  剪贴板为 FLGROUP 分组文本时改走分组导入（新建分组 + 组内全部和弦） */
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
      // 分组文本的魔数不属于和弦分类器，统一落在这里；交给分组解析器分流
      if (result.reason === 'UNKNOWN_FORMAT') {
        await pasteGroupFromClipboard(text);
        return;
      }
      pasteErrorToast(result.reason, '和弦');
      return;
    }
    editorStore.setEditor(buildDraftChordFromPortable(result.data));
    editorStore.saveAsNewChord();
    uiStore.toast.success(`已加载和弦`);
  };

  /** 工作台粘贴分组：FLGROUP 文本 → 新建分组（保留排序规则与调式主音）并导入组内全部和弦 */
  const pasteGroupFromClipboard = async (text: string): Promise<void> => {
    const result = parseGroupFromText(text);
    if (!result.ok) {
      pasteErrorToast(result.reason, '和弦');
      return;
    }
    const { name, sortRule, sortKey, chords } = result.data;
    // 与手动创建路径的重名策略对齐：粘贴导入遇到同名分组时追加序号后缀，避免产生同名歧义
    let finalName = name;
    let suffix = 2;
    while (chordStore.groups.some(g => g.name === finalName)) {
      finalName = `${name} (${suffix++})`;
    }
    const group = chordStore.addGroup(finalName, sortRule);
    if (sortRule === GroupSortRule.KEY_DEGREE && sortKey) chordStore.updateGroupSort(group.id, sortRule, sortKey);
    for (const p of chords) {
      chordStore.addChord(
        createChord({
          nameSegments: nameToSegments(p.name),
          strings: p.strings,
          fretCount: p.fretCount,
          fretOffset: p.fretOffset,
          groupId: group.id,
          tuning: p.tuning,
          rootStringIndex: p.rootStringIndex,
          barres: p.barres,
        })
      );
    }
    uiStore.toast.success(`已导入分组「${finalName}」（${chords.length} 个和弦）`);
  };

  return {
    copyChordText,
    copyChordCardText,
    copyGroupText,
    pasteChordFromClipboard,
  };
}
