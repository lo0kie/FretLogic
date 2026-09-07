/**
 * 乐谱域文字传递服务：把乐谱复制为文字到剪贴板，或从剪贴板文字导入（始终新建一首乐谱）。
 * 文字中未入库的和弦自动生成并归入「{乐谱名}」分组。
 * 单和弦的复制/粘贴能力委托和弦域 useChordTransfer（编解码、剪贴板与 toast 收敛在 chord/transfer）。
 */
import { useChordStore } from '@/domains/chord/store/chordStore';
import { createChord } from '@/domains/chord/theory/entityFactories';
import { computeChordFingerprint, getChordName, nameToSegments } from '@/domains/chord/theory/theory';
import {
  buildDraftChordFromPortable,
  pasteErrorToast,
  useChordTransfer,
} from '@/domains/chord/transfer/useChordTransfer';
import { toCapo } from '@/domains/fretboard/model/coordinates';
import { DEFAULT_SCORE_TITLE } from '@/domains/score/constants';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { charKey, chordSlotKey, matchLineIds, sanitizeLyricsText } from '@/domains/score/model/scoreModel';
import { parseSongFromText, serializeSongToText } from '@/domains/score/transfer/textCodec';
import { readTextFromClipboard, writeTextToClipboard } from '@/platform/services/clipboard/clipboard';
import { useUiStore } from '@/platform/store/uiStore';

import type { ChordId } from '@/domains/chord/types';
import type { PortableChord, PortableSong } from '@/domains/score/transfer/textCodec';
import type { SlotKey, Song } from '@/domains/score/types';

/** 乐谱粘贴结果：imported 已建谱 | needsConfirm 无结构纯歌词需用户确认 | none 无操作（读取失败/无法识别） */
export type PasteSongOutcome =
  { status: 'imported' } | { status: 'needsConfirm'; portable: PortableSong } | { status: 'none' };

export function useTextTransfer() {
  const chordStore = useChordStore();
  const songStore = useSongStore();
  const scoreEditor = useScoreEditorStore();
  const uiStore = useUiStore();

  // 和弦域能力委托：单和弦复制/粘贴（编解码、剪贴板与 toast 细节收敛在 chord/transfer）
  const { copyChordText, copyChordCardText, pasteChordFromClipboard } = useChordTransfer();

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
    const draft = buildDraftChordFromPortable(p);
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
    const importGroupName = title;

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
    if (createdCount > 0) msg += `并创建 ${createdCount} 个和弦`;
    uiStore.toast.success(msg);
  };

  /**
   * 乐谱粘贴：读取剪贴板并解析。含结构信号（内嵌和弦/指令/标题）直接建谱返回 imported；
   * 无结构的纯歌词返回 needsConfirm，由调用方弹出确认后回调 importPortableSong 落地。
   */
  const pasteSongFromClipboard = async (): Promise<PasteSongOutcome> => {
    let text: string;
    try {
      text = await readTextFromClipboard();
    } catch (err) {
      uiStore.toast.error(err instanceof Error ? err.message : '读取剪贴板失败');
      return { status: 'none' };
    }
    const result = parseSongFromText(text);
    if (!result.ok) {
      pasteErrorToast(result.reason, '乐谱');
      return { status: 'none' };
    }
    const { needsConfirm, ...portable } = result.data;
    if (needsConfirm) return { status: 'needsConfirm', portable };
    importPortableSong(portable);
    return { status: 'imported' };
  };

  /** 复制当前乐谱的纯歌词文本到剪贴板（不含和弦标记，与「复制乐谱」的带谱文本区分） */
  const copyLyricsText = async (song: Song | null): Promise<void> => {
    if (!song) return;
    try {
      await writeTextToClipboard(song.lyrics ?? '');
      uiStore.toast.success('已复制歌词到剪贴板');
    } catch (err) {
      uiStore.toast.error(err instanceof Error ? err.message : '复制失败');
    }
  };

  /**
   * 纯文本粘贴进歌词编辑器：读剪贴板原文并覆盖当前乐谱歌词。
   * 与 pasteSongFromClipboard 的区别：不解析和弦、不新建乐谱、不动和弦库，只把原文填进编辑器。
   * 超长行无需在此处理——歌词编辑器的 localLyrics watch 会逐行截断后回写。
   */
  const pasteLyricsToEditor = async (): Promise<void> => {
    const songId = scoreEditor.activeSongId;
    if (!songId) return;
    let text: string;
    try {
      text = await readTextFromClipboard();
    } catch (err) {
      uiStore.toast.error(err instanceof Error ? err.message : '读取剪贴板失败');
      return;
    }
    if (!text.trim()) {
      uiStore.toast.warning('剪贴板没有文本内容');
      return;
    }
    scoreEditor.updateLyrics(text, songId);
    uiStore.toast.success('已粘贴到歌词编辑器');
  };

  return {
    copyChordText,
    copyChordCardText,
    pasteChordFromClipboard,
    copySongText,
    pasteSongFromClipboard,
    importPortableSong,
    copyLyricsText,
    pasteLyricsToEditor,
  };
}
