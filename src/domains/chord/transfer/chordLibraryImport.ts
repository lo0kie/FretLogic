/**
 * 便携和弦 → 和弦库落地：按「名字 + 调弦 + 指纹」复用库中已有和弦，未命中则生成新和弦并归入指定分组
 * （同名分组惰性复用，避免重复导入产生空分组）。
 *
 * 为什么住在这里（chord/transfer）而不是调用方那一侧：这是**和弦库的入库规则**，不是乐谱排版规则。
 * 乐谱域的文本导入（score/transfer/textTransferActions）只是它的一个调用方 —— 按 useChordTransfer.ts
 * 文件头「乐谱域的 useTextTransfer 委托本模块提供和弦能力」的口径，和弦侧的落地策略应集中在
 * chord/transfer，由调用方复用，而不是各写一份。
 *
 * 调用前需保证已有 active pinia（store 在本函数体内取用，不在模块顶层）。
 */
import { useChordStore } from '@/domains/chord/store/chordStore';
import { computeChordFingerprint, getChordName } from '@/domains/chord/theory/theory';
import { areBarresEqual } from '@/domains/fretboard/model/coordinates';

import { chordFromPortable } from './chordTextCodec';
import { buildDraftChordFromPortable } from './useChordTransfer';

import type { PortableChord } from './chordTextCodec';
import type { ChordId } from '@/domains/chord/types';

export const findOrCreateChordInLibrary = (
  p: PortableChord,
  groupName: string
): { chordId: ChordId; created: boolean } => {
  const chordStore = useChordStore();
  const draft = buildDraftChordFromPortable(p);
  const targetFp = computeChordFingerprint(draft);
  // 判等口径必须与另外三处一致（useChordTransfer.landPortableChord 的 N4 修复、
  // chordDraftValidation 的 D26 去重、chordRepository 的读库去重签名）：指纹不含 barres，
  // 漏比横按会把「同指法不同横按」误判为已存在，导入后横按静默丢失。
  let existing = chordStore.savedChordsList.find(
    c =>
      getChordName(c) === p.name &&
      c.tuning === p.tuning &&
      computeChordFingerprint(c) === targetFp &&
      areBarresEqual(c.barres, draft.barres)
  );
  // 降级匹配：智能歌词谱导入（无指法数据）时，优先复用库中同名且同调弦的真实和弦；
  // 排除「全静音」占位和弦（本次导入首批无指法槽位可能已建出的 -1 占位），否则后续真实指法会被误复用顶掉。
  // 注：这条降级分支服务的是**乐谱文本导入**链路（只有它会出现「有和弦名、无指法」的槽位），
  // 和弦域自身的粘贴路径不会走到这里。
  // 门槛必须显式限定为「本次载荷确实没有指法」：否则一条**携带指法**、只是库中暂无同款的和弦
  // 会落到这里，复用一条指法完全不同的同名和弦（指法数据被静默丢弃）。
  const hasNoFingering = !draft.strings.some(s => s.fret >= 0);
  if (!existing && hasNoFingering)
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
