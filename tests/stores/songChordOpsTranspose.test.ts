/**
 * `remapTransposedChordMap` 的 `chordCreator` 分支。
 *
 * 这条分支此前**没有任何用例**（`tests/` 下 0 引用）：全曲移调时「库里找不到同名替代」的和弦
 * 要由它现场造出来，而造出来的 id 必须回填进新 chordMap —— 改坏它的表现是移调后槽位仍指向旧和弦
 * （和弦名变了、指法没变），或同一和弦被重复创建多份。
 *
 * 纯函数，直接喂 Map 断言，不挂 store。
 */
import { describe, expect, it, vi } from 'vitest';

import { createChord } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { remapTransposedChordMap } from '@/domains/score/library/store/songChordOps';

import type { Chord, ChordId } from '@/domains/chord/types';
import type { ChordLineSlots, LineId } from '@/domains/score/types';

const makeChord = (name: string): Chord =>
  createChord({
    nameSegments: nameToSegments(name),
    strings: [
      { fret: -1, preferFlat: false },
      { fret: 3, preferFlat: false },
      { fret: 2, preferFlat: false },
      { fret: 0, preferFlat: false },
      { fret: 1, preferFlat: false },
      { fret: 0, preferFlat: false },
    ],
    fretCount: 3,
    groupId: 'g_test',
    tuning: Tuning.STANDARD,
    rootStringIndex: 5,
  });

/** 一条行、三处槽位都指向同一个和弦：用来验证「同一个 chordId 只解析一次」的缓存 */
const oneLine = (chordId: ChordId): Map<LineId, ChordLineSlots> =>
  new Map<LineId, ChordLineSlots>([
    [
      'l1' as LineId,
      {
        char: new Map([
          [0, chordId],
          [2, chordId],
        ]),
        start: [chordId],
        end: [],
      },
    ],
  ]);

describe('remapTransposedChordMap：全曲移调的和弦重映射', () => {
  it('库里找到同名替代时复用它，且**不调**创建器', () => {
    const original = makeChord('C');
    const replacement = makeChord('D');
    const creator = vi.fn((_o: Chord, targetName: string) => makeChord(targetName));

    const next = remapTransposedChordMap(oneLine(original.id), 2, {
      chordResolver: id => (id === original.id ? original : undefined),
      chordFinder: () => replacement,
      chordCreator: creator,
    });

    expect(creator).not.toHaveBeenCalled();
    expect([...next.get('l1' as LineId)!.char.values()]).toEqual([replacement.id, replacement.id]);
    expect(next.get('l1' as LineId)!.start).toEqual([replacement.id]);
  });

  it('无匹配时用创建器造新和弦；同一个 chordId 的三处引用**只创建一次**', () => {
    const original = makeChord('C');
    const created: Chord[] = [];
    const creator = (_originalChord: Chord, targetName: string): Chord => {
      const chord = makeChord(targetName);
      created.push(chord);
      return chord;
    };
    const input = oneLine(original.id);

    const next = remapTransposedChordMap(input, 2, {
      chordResolver: id => (id === original.id ? original : undefined),
      chordCreator: creator,
    });

    // 缓存：三处引用同一个原 id ⇒ 只造一条（否则同一和弦会被重复登记进库）
    expect(created).toHaveLength(1);
    expect([...next.get('l1' as LineId)!.char.values()]).toEqual([created[0]!.id, created[0]!.id]);
    expect(next.get('l1' as LineId)!.start).toEqual([created[0]!.id]);

    // 纯函数：入参 Map 与其中的 slots 都没被改动
    expect([...input.get('l1' as LineId)!.char.values()]).toEqual([original.id, original.id]);
    expect(input.get('l1' as LineId)!.start).toEqual([original.id]);
  });

  it('既无匹配也没给创建器时保留原 chordId（不静默丢绑定）', () => {
    const original = makeChord('C');

    const next = remapTransposedChordMap(oneLine(original.id), 2, {
      chordResolver: id => (id === original.id ? original : undefined),
    });

    expect(next.get('l1' as LineId)!.char.get(0)).toBe(original.id);
    expect(next.get('l1' as LineId)!.char.get(2)).toBe(original.id);
  });

  it('解析不到原和弦时原样保留该 id', () => {
    const original = makeChord('C');

    const next = remapTransposedChordMap(oneLine(original.id), 2, { chordResolver: () => undefined });

    expect(next.get('l1' as LineId)!.char.get(0)).toBe(original.id);
  });
});
