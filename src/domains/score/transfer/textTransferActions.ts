/**
 * 乐谱域文字传递服务实现（懒加载模块，由 useTextTransfer 状态壳动态 import）：
 * 复制乐谱到剪贴板、从剪贴板导入、生成分享链接、单和弦复制/粘贴委托。
 *
 * 独立成模块的原因：textCodec / useChordTransfer / shareLink 压缩编码等链路只在用户
 * 触发复制/粘贴/分享时才需要；ScoreView / SongSection 等路由块引用的是状态壳，
 * 不影响首屏闭包。store 与和弦域传递能力在模块加载时初始化一次（均无生命周期钩子）。
 */
import { storeToRefs } from 'pinia';

import { useChordStore } from '@/domains/chord/store/chordStore';
import { computeChordFingerprint, getChordName } from '@/domains/chord/theory/theory';
import { chordFromPortable } from '@/domains/chord/transfer/chordTextCodec';
import {
  buildDraftChordFromPortable,
  pasteErrorMessage,
  useChordTransfer,
} from '@/domains/chord/transfer/useChordTransfer';
import { toCapo } from '@/domains/fretboard/model/coordinates';
import { DEFAULT_SCORE_TITLE, isValidTimeSignature } from '@/domains/score/constants';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { useSongStore } from '@/domains/score/library/store/songStore';
import { bindNewChordToSlot } from '@/domains/score/model/chordSlots';
import { charKey, chordSlotKey, matchLineIds, sanitizeLyricsText } from '@/domains/score/model/scoreModel';
import { parseSongFromText, serializeSongToText } from '@/domains/score/transfer/textCodec';
import { runBusyAction } from '@/platform/composables/runBusyAction';
import { readTextFromClipboard, writeTextToClipboard } from '@/platform/services/clipboard/clipboard';
import { useUiStore } from '@/platform/store/uiStore';
import { ROUTE_PATHS } from '@/platform/utils/constants';
import { buildShareUrl, encodeShareToken, resolveTransferPayload } from '@/platform/utils/transfer';

import type { PasteSongOutcome } from './useTextTransfer';
import type { ChordId } from '@/domains/chord/types';
import type { PortableChord, PortableSong } from '@/domains/score/transfer/textCodec';
import type { ChordLineSlots, LineId, Song } from '@/domains/score/types';

const chordStore = useChordStore();
const songStore = useSongStore();
const scoreEditor = useScoreEditorStore();
const uiStore = useUiStore();
// 剪贴板防重入锁的唯一写方（与和弦域动作实现同一口径）：调用方不得再各自包一层
const { isCopying } = storeToRefs(uiStore);

// 和弦域能力委托：单和弦复制/粘贴（编解码、剪贴板与 message 细节收敛在 chord/transfer）
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
  await runBusyAction({
    busy: isCopying,
    errorFallback: '复制失败',
    successText: '已复制乐谱到剪贴板',
    run: async () => writeTextToClipboard(await buildSongToken(song)),
  });
};

/** 按名字+指法精确复用库中和弦；未命中则生成新和弦并归入指定分组（惰性建组） */
const findOrCreateChordInLibrary = (p: PortableChord, groupName: string): { chordId: ChordId; created: boolean } => {
  const draft = buildDraftChordFromPortable(p);
  const targetFp = computeChordFingerprint(draft);
  let existing = chordStore.savedChordsList.find(
    c => getChordName(c) === p.name && c.tuning === p.tuning && computeChordFingerprint(c) === targetFp
  );
  // 降级匹配：智能歌词谱导入（无指法数据）时，优先复用库中同名且同调弦的真实和弦；
  // 排除「全静音」占位和弦（本次导入首批无指法槽位可能已建出的 -1 占位），否则后续真实指法会被误复用顶掉
  if (!existing)
    existing = chordStore.savedChordsList.find(
      c => getChordName(c) === p.name && c.tuning === p.tuning && c.strings.some(s => s.fret >= 0)
    );

  if (existing) return { chordId: existing.id, created: false };

  // 同名分组已存在则复用，避免重复粘贴产生空分组
  let group = chordStore.groups.find(g => g.name === groupName);
  if (!group) group = chordStore.addGroup(groupName);
  const chord = chordFromPortable(p, group.id);
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
  const { lineIds } = matchLineIds([], lines, []);
  const importGroupName = title;

  const chordMap = new Map<LineId, ChordLineSlots>();
  let createdCount = 0;
  for (const slot of p.slots) {
    if (slot.lineIdx >= lineIds.length) continue;
    const lineId = lineIds[slot.lineIdx]!;
    if (slot.type === 'char' && slot.index >= lines[slot.lineIdx]!.length) continue;
    const { chordId, created } = findOrCreateChordInLibrary(slot.chord, importGroupName);
    if (created) createdCount++;
    const key = slot.type === 'char' ? charKey(lineId, slot.index) : chordSlotKey(lineId, slot.type, slot.index);
    bindNewChordToSlot(chordMap, key, chordId);
  }

  if (createdCount > 0) void chordStore.persistAll();

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

  if (!lyrics) uiStore.message.warning('导入的乐谱没有歌词内容');
  let msg = `已导入乐谱`;
  if (createdCount > 0) msg += `并创建 ${createdCount} 个和弦`;
  uiStore.message.success(msg);
};

/**
 * 乐谱粘贴：读取剪贴板 → 载体归一 → 解析。含结构信号（内嵌和弦/指令/标题）直接建谱返回 imported；
 * 无结构的纯歌词返回 needsConfirm，由调用方弹出确认后回调 importPortableSong 落地。
 */
export const pasteSongFromClipboard = async (): Promise<PasteSongOutcome> => {
  // runBusyAction 仅用作互斥守卫（提示分支由动作内部各自负责）：重入或异常时返回 null，
  // 对调用方与「没读到可用内容」同义
  const outcome = await runBusyAction({
    busy: isCopying,
    errorFallback: '粘贴失败',
    run: async (): Promise<PasteSongOutcome> => {
      let raw: string;
      try {
        raw = await readTextFromClipboard();
      } catch (err) {
        uiStore.message.error(err instanceof Error ? err.message : '读取剪贴板失败');
        return { status: 'none' };
      }
      // 载体归一：分享地址 / 裸 token / 手写歌词 都收敛成同一份文本，之后一律按纯文本处理
      const resolved = await resolveTransferPayload(raw);
      if (resolved.status === 'empty') {
        uiStore.message.warning('剪贴板为空');
        return { status: 'none' };
      }
      if (resolved.status === 'broken') {
        uiStore.message.warning('传递内容已损坏，无法解析');
        return { status: 'none' };
      }
      const result = parseSongFromText(resolved.payload);
      if (!result.ok) {
        pasteErrorMessage(result.reason, '乐谱');
        return { status: 'none' };
      }
      const { needsConfirm, ...portable } = result.data;
      if (needsConfirm) return { status: 'needsConfirm', portable };
      importPortableSong(portable);
      return { status: 'imported' };
    },
  });
  return outcome ?? { status: 'none' };
};

/**
 * 生成并复制乐谱分享链接（token 外面包一层地址，链接打开后自动导入为一首新乐谱）。
 * 与「复制乐谱」共用同一个载体构建函数（`buildSongToken`），差别只在是否套地址外壳；
 * 链接里带的是完整谱面与指法数据，收件方无需依赖发送方的和弦库即可还原。
 */
export const shareSongLink = async (song: Song | null): Promise<void> => {
  if (!song) return;
  await runBusyAction({
    busy: isCopying,
    errorFallback: '生成分享链接失败',
    successText: `已复制乐谱「${song.title}」的分享链接`,
    run: async () => writeTextToClipboard(buildShareUrl(ROUTE_PATHS.SCORE, await buildSongToken(song))),
  });
};
