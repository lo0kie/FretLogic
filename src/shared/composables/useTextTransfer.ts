/**
 * 文字传递服务：把和弦 / 乐谱复制为文字到剪贴板，或从剪贴板文字导入。
 * 乐谱导入始终新建一首乐谱；文字中未入库的和弦自动生成并归入「{乐谱名}{时间戳}」分组。
 * 剪贴板读写与 toast 全部收敛于此，组件保持薄。
 */
import { computeChordFingerprint, getChordName, nameToSegments } from '@/services/music/theory';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { useChordStore } from '@/stores/chordStore';
import { useScoreEditorStore } from '@/stores/scoreEditorStore';
import { useSongStore } from '@/stores/songStore';
import { useUiStore } from '@/stores/uiStore';
import type { Chord, ChordId, SlotKey, Song } from '@/types';
import { readTextFromClipboard, writeTextToClipboard } from '@/utils/core/clipboard';
import { formatLocalTimestampForFile, matchLineIds, sanitizeLyricsText } from '@/utils/core/common';
import { DEFAULT_SCORE_TITLE } from '@/utils/core/constants';
import { toCapo } from '@/utils/music/chord-fretboard';
import { createChord } from '@/utils/music/entityFactories';
import { charKey, chordSlotKey } from '@/utils/score/scoreModel';
import {
  parseChordFromText,
  parseSongFromText,
  serializeChordToText,
  serializeSongToText,
  type PortableChord,
  type PortableSong,
  type TextParseReason,
} from '@/utils/score/textCodec';

export function useTextTransfer() {
  const editorStore = useChordEditorStore();
  const chordStore = useChordStore();
  const songStore = useSongStore();
  const scoreEditor = useScoreEditorStore();
  const uiStore = useUiStore();

  /** 从便携和弦载荷构建编辑器草稿：置空 id/groupId，供用户审阅后保存 */
  const buildDraftChord = (p: PortableChord): Chord =>
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

  /** 解析失败按原因分流提示 */
  const pasteErrorToast = (reason: TextParseReason, target: '和弦' | '乐谱') => {
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
    editorStore.setEditor(buildDraftChord(result.data));
    editorStore.saveAsNewChord();
    uiStore.toast.success(`已加载和弦`);
  };

  /** 复制当前乐谱为文字到剪贴板 */
  const copySongText = async (song: Song | null): Promise<void> => {
    if (!song) return;
    try {
      const resolver = new Map(chordStore.savedChordsList.map(c => [c.id, c]));
      await writeTextToClipboard(serializeSongToText(song, id => resolver.get(id)));
      uiStore.toast.success(`已复制乐谱到剪贴板`);
    } catch (err) {
      uiStore.toast.error(err instanceof Error ? err.message : '复制失败');
    }
  };

  /** 按名字+指法精确复用库中和弦；未命中则生成新和弦并归入指定分组（惰性建组） */
  const findOrCreateChordInLibrary = (p: PortableChord, groupName: string): { chordId: ChordId; created: boolean } => {
    const draft = buildDraftChord(p);
    const targetFp = computeChordFingerprint(draft);
    let existing = chordStore.savedChordsList.find(
      c => getChordName(c) === p.name && c.tuning === p.tuning && computeChordFingerprint(c) === targetFp
    );
    // 降级匹配：智能歌词谱导入（无指法数据）时，优先复用库中同名且同调弦的和弦
    if (!existing) {
      existing = chordStore.savedChordsList.find(c => getChordName(c) === p.name && c.tuning === p.tuning);
    }
    if (existing) return { chordId: existing.id, created: false };

    // 同名分组已存在则复用，避免重复粘贴产生空分组
    let group = chordStore.groups.find(g => g.name === groupName);
    if (!group) group = chordStore.addGroup(groupName);
    const chord = createChord({
      nameSegments: nameToSegments(p.name),
      strings: p.strings,
      fretCount: p.fretCount,
      fretOffset: p.fretOffset,
      groupId: group.id,
      tuning: p.tuning,
      rootStringIndex: p.rootStringIndex,
      barres: p.barres,
    });
    chordStore.addChord(chord);
    return { chordId: chord.id, created: true };
  };

  /** 把解析出的乐谱载荷落地：始终新建乐谱 + 按需生成缺失和弦并分组 */
  const importPortableSong = (p: PortableSong) => {
    const lyrics = sanitizeLyricsText(p.lyrics);
    const title = p.title.trim() || DEFAULT_SCORE_TITLE;
    const playKey = /^[A-Ga-g][#b]?$/.test(p.playKey) ? p.playKey : 'C';
    const capo = toCapo(p.capo);

    const newSong = songStore.createSong(title);
    const lines = lyrics.split('\n');
    const lineIds = matchLineIds([], lines, []);
    const importGroupName = `${title}${formatLocalTimestampForFile()}`;

    const chordMap = new Map<SlotKey, ChordId>();
    let createdCount = 0;
    for (const slot of p.slots) {
      if (slot.lineIdx >= lineIds.length) continue;
      const lineId = lineIds[slot.lineIdx]!;
      if (slot.type === 'char' && slot.index >= lines[slot.lineIdx]!.length) continue;
      const { chordId, created } = findOrCreateChordInLibrary(slot.chord, importGroupName);
      if (created) createdCount++;
      const key = slot.type === 'char' ? charKey(lineId, slot.index) : chordSlotKey(lineId, slot.type, slot.index);
      chordMap.set(key, chordId);
    }

    if (createdCount > 0) chordStore.flushChordsToStorage();

    songStore.updateSongMeta(newSong.id, { lyrics, lineIds, playKey, capo, chordMap });
    scoreEditor.setActiveSong(newSong.id);
    scoreEditor.activeTab = 'edit';

    if (!lyrics) uiStore.toast.warning('导入的乐谱没有歌词内容');
    let msg = `已导入乐谱`;
    if (createdCount > 0) msg += `，已自动生成 ${createdCount} 个新和弦，归入分组「${importGroupName}」`;
    uiStore.toast.success(msg);
  };

  /** 乐谱粘贴：解析文字并始终新建一首乐谱 */
  const pasteSongFromClipboard = async (): Promise<void> => {
    let text: string;
    try {
      text = await readTextFromClipboard();
    } catch (err) {
      uiStore.toast.error(err instanceof Error ? err.message : '读取剪贴板失败');
      return;
    }
    const result = parseSongFromText(text);
    if (!result.ok) {
      pasteErrorToast(result.reason, '乐谱');
      return;
    }
    importPortableSong(result.data);
  };

  return {
    copyChordText,
    copyChordCardText,
    pasteChordFromClipboard,
    copySongText,
    pasteSongFromClipboard,
  };
}
