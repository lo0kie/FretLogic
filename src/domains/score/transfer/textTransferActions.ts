/**
 * 乐谱域文字传递服务实现（懒加载模块，由 useTextTransfer 状态壳动态 import）：
 * 复制乐谱到剪贴板、从剪贴板导入、生成分享链接、单和弦复制/粘贴委托。
 *
 * 独立成模块的原因：textCodec / useChordTransfer / shareLink 压缩编码等链路只在用户
 * 触发复制/粘贴/分享时才需要；ScoreView / SongSection 等路由块引用的是状态壳，
 * 不影响首屏闭包。store 与和弦域传递能力在模块加载时初始化一次（均无生命周期钩子）。
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
import { DEFAULT_SCORE_TITLE, isValidTimeSignature } from '@/domains/score/constants';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { charKey, chordSlotKey, matchLineIds, sanitizeLyricsText } from '@/domains/score/model/scoreModel';
import { parseSongFromText, serializeSongToText } from '@/domains/score/transfer/textCodec';
import { readTextFromClipboard, writeTextToClipboard } from '@/platform/services/clipboard/clipboard';
import { useUiStore } from '@/platform/store/uiStore';
import { ROUTE_PATHS } from '@/platform/utils/constants';
import { buildShareUrl, encodeShareToken, resolveTransferPayload } from '@/platform/utils/shareLink';

import type { PasteSongOutcome } from './useTextTransfer';
import type { ChordId } from '@/domains/chord/types';
import type { PortableChord, PortableSong } from '@/domains/score/transfer/textCodec';
import type { SlotKey, Song } from '@/domains/score/types';

const chordStore = useChordStore();
const songStore = useSongStore();
const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();

// 和弦域能力委托：单和弦复制/粘贴（编解码、剪贴板与 toast 细节收敛在 chord/transfer）
const { copyChordText, copyChordCardText, pasteChordFromClipboard } = useChordTransfer();

export { copyChordCardText, copyChordText, pasteChordFromClipboard };

/**
 * 乐谱载荷构建：`复制乐谱` 与 `分享链接` 共用这一份，两处不得各拼一次。
 * 载荷为 FLSONG 文本，内嵌所引用和弦的完整指法数据——收件方无需依赖发送方的和弦库即可还原。
 */
const buildSongPayload = (song: Song): string => {
  const resolver = new Map(chordStore.savedChordsList.map(c => [c.id, c]));
  return serializeSongToText(song, id => resolver.get(id));
};

/** 乐谱 → 传递载体 token（剪贴板与分享地址共用的唯一载体） */
const buildSongToken = (song: Song): Promise<string> => encodeShareToken(buildSongPayload(song));

/** 复制当前乐谱到剪贴板（载体：裸 token，可在另一实例粘贴导入） */
export const copySongText = async (song: Song | null): Promise<void> => {
  if (!song) return;
  try {
    await writeTextToClipboard(await buildSongToken(song));
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
export const importPortableSong = (p: PortableSong) => {
  const lyrics = sanitizeLyricsText(p.lyrics);
  const title = p.title.trim() || DEFAULT_SCORE_TITLE;
  const playKey = /^[A-Ga-g][#b]?$/.test(p.playKey) ? p.playKey : 'C';
  // 原调同 playKey 口径校验：非法格式回退未设置（''），防止脏文本注入展示层
  const originalKey = /^[A-Ga-g][#b]?$/.test(p.originalKey) ? p.originalKey : '';
  // 拍号同口径校验：非「数字/数字」格式回退未设置（''）
  const timeSignature = isValidTimeSignature(p.timeSignature) ? p.timeSignature : '';
  const capo = toCapo(p.capo);

  const newSong = songStore.createSong(title);
  const lines = lyrics.split('\n');
  const lineIds = matchLineIds([], lines, []).lineIds;
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

  songStore.updateSongMeta(newSong.id, {
    lyrics,
    lineIds,
    playKey,
    capo,
    chordMap,
    singer: p.singer ?? '',
    originalKey,
    timeSignature,
  });
  scoreEditor.setActiveSong(newSong.id);
  scoreEditor.activeTab = 'edit';

  if (!lyrics) uiStore.toast.warning('导入的乐谱没有歌词内容');
  let msg = `已导入乐谱`;
  if (createdCount > 0) msg += `并创建 ${createdCount} 个和弦`;
  uiStore.toast.success(msg);
};

/**
 * 乐谱粘贴：读取剪贴板 → 载体归一 → 解析。含结构信号（内嵌和弦/指令/标题）直接建谱返回 imported；
 * 无结构的纯歌词返回 needsConfirm，由调用方弹出确认后回调 importPortableSong 落地。
 */
export const pasteSongFromClipboard = async (): Promise<PasteSongOutcome> => {
  let raw: string;
  try {
    raw = await readTextFromClipboard();
  } catch (err) {
    uiStore.toast.error(err instanceof Error ? err.message : '读取剪贴板失败');
    return { status: 'none' };
  }
  // 载体归一：分享地址 / 裸 token / 手写歌词 都收敛成同一份文本，之后一律按纯文本处理
  const resolved = await resolveTransferPayload(raw);
  if (resolved.status === 'empty') {
    uiStore.toast.warning('剪贴板为空');
    return { status: 'none' };
  }
  if (resolved.status === 'broken') {
    uiStore.toast.warning('传递内容已损坏，无法解析');
    return { status: 'none' };
  }
  const result = parseSongFromText(resolved.payload);
  if (!result.ok) {
    pasteErrorToast(result.reason, '乐谱');
    return { status: 'none' };
  }
  const { needsConfirm, ...portable } = result.data;
  if (needsConfirm) return { status: 'needsConfirm', portable };
  importPortableSong(portable);
  return { status: 'imported' };
};

/**
 * 生成并复制乐谱分享链接（token 外面包一层地址，链接打开后自动导入为一首新乐谱）。
 * 与「复制乐谱」共用同一个载体构建函数（`buildSongToken`），差别只在是否套地址外壳；
 * 链接里带的是完整谱面与指法数据，收件方无需依赖发送方的和弦库即可还原。
 */
export const shareSongLink = async (song: Song | null): Promise<void> => {
  if (!song) return;
  try {
    await writeTextToClipboard(buildShareUrl(ROUTE_PATHS.SCORE, await buildSongToken(song)));
    uiStore.toast.success(`已复制乐谱「${song.title}」的分享链接`);
  } catch (err) {
    uiStore.toast.error(err instanceof Error ? err.message : '生成分享链接失败');
  }
};
