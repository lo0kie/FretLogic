import { describe, expect, it } from 'vitest';

import { analyzeChordGraph } from '@/domains/chord/theory/chordEngine';
import { segmentsToString } from '@/domains/chord/theory/theory';

import type { NoteInput } from '@/domains/chord/types';

const note = (stringIndex: number, pitchIndex: number, label: string): NoteInput => ({
  stringIndex,
  pitchIndex,
  label,
});

const cMajor = [note(3, 0, 'C'), note(4, 4, 'E'), note(5, 7, 'G')];
const aMinor = [note(3, 9, 'A'), note(4, 0, 'C'), note(5, 4, 'E')];
// G 属七（G7 = G B D F）：第三个音 pitchIndex 必须是 5（F）——
// 此前写成 10（F#/Gb）却挂着 'F' 标签，音集实为 Gmaj7，断言 'BmMaj7/G' 是纯垃圾输出
const gSeven = [note(3, 7, 'G'), note(4, 11, 'B'), note(5, 5, 'F'), note(6, 2, 'D')];

describe('chord engine boundary', () => {
  it('identifies explicit major, minor and dominant seventh chords', () => {
    expect(analyzeChordGraph(cMajor, 0).best?.chordName).toBe('C');
    expect(analyzeChordGraph(aMinor, 9).best?.chordName).toBe('Am');
    expect(analyzeChordGraph(gSeven, null).best?.chordName).toBe('G7');
  });

  it('keeps slash bass in the chord name', () => {
    const result = analyzeChordGraph([note(2, 4, 'E'), note(3, 0, 'C'), note(4, 4, 'E'), note(5, 7, 'G')], 0);
    expect(result.best?.chordName).toBe('C/E');
    expect(result.bestRootPitch).toBe(0);
  });

  it('returns an empty analysis for no notes', () => {
    const result = analyzeChordGraph([], null);
    expect(result.candidates).toEqual([]);
    expect(result.best).toBeUndefined();
    expect(result.bestRootPitch).toBe(0);
  });

  it('caches identical note sets by reference stability', () => {
    const first = analyzeChordGraph(cMajor, null);
    const second = analyzeChordGraph(cMajor, null);
    expect(second).toBe(first);
  });

  it('缓存键含八度：同一形状的不同八度不得互相命中', () => {
    // 三音的 stringIndex / pitchIndex / label 完全相同，只有 midi 差一个八度：
    // 前者最低音是 C（根位），后者最低音是 E（转位）。bassByPitch 下最低音按完整 MIDI 取，
    // 故二者结论必须不同 —— 键串不含 midi 时第二组会直接命中第一组的缓存。
    const rootLow: NoteInput[] = [
      { stringIndex: 0, pitchIndex: 0, label: 'C', midi: 48 },
      { stringIndex: 1, pitchIndex: 4, label: 'E', midi: 52 },
      { stringIndex: 2, pitchIndex: 7, label: 'G', midi: 55 },
    ];
    const thirdLow: NoteInput[] = [
      { stringIndex: 0, pitchIndex: 0, label: 'C', midi: 60 },
      { stringIndex: 1, pitchIndex: 4, label: 'E', midi: 52 },
      { stringIndex: 2, pitchIndex: 7, label: 'G', midi: 55 },
    ];

    const first = analyzeChordGraph(rootLow, null, true);
    const second = analyzeChordGraph(thirdLow, null, true);

    expect(second).not.toBe(first);
    expect(second.best?.chordName).not.toBe(first.best?.chordName);
    // 同八度重复调用仍须命中同一个对象（键变细不等于把缓存废掉）
    expect(analyzeChordGraph(rootLow, null, true)).toBe(first);
  });

  it('guarantees segments are defined for all candidates', () => {
    // 三条推导路径各取一例：普通三和弦、含延伸音的属七、斜杠低音；低置信候选同样要满足
    const inputs: Array<[NoteInput[], number | null]> = [
      [cMajor, 0],
      [gSeven, null],
      [[note(2, 4, 'E'), note(3, 0, 'C'), note(4, 4, 'E'), note(5, 7, 'G')], 0],
    ];
    for (const [notes, explicitRoot] of inputs) {
      const { candidates, lowConfidence } = analyzeChordGraph(notes, explicitRoot);
      const all = [...candidates, ...lowConfidence];
      expect(all.length).toBeGreaterThan(0);
      for (const c of all) {
        // segments 在类型上是可选字段，本用例的核心契约正是「所有候选（含低置信）都带上了它」——
        // 原先只做 root 的存在性断言（root 是必填元组，任何退化都测不出），改为断语义一致性：
        // segments 必须能无损还原为 chordName（往返契约已由 chordSegments.test.ts 多形态确立）
        expect(c.segments).toBeDefined();
        expect(segmentsToString(c.segments!)).toBe(c.chordName);
      }
    }
  });

  it('favors standard enharmonic root spellings (Bb, Eb) and respects explicit accidental switches', () => {
    // 默认标准音名记谱 (Bb, Eb)
    const bbMajorNotes = [note(1, 10, 'Bb'), note(2, 2, 'D'), note(3, 5, 'F')];
    const bbResult = analyzeChordGraph(bbMajorNotes, null);
    expect(bbResult.best?.chordName).toBe('Bb');
    expect(bbResult.best?.rootLabel).toBe('Bb');

    // Eb major: Eb(3), G(7), Bb(10)
    const ebMajorNotes = [note(1, 3, 'Eb'), note(2, 7, 'G'), note(3, 10, 'Bb')];
    const ebResult = analyzeChordGraph(ebMajorNotes, null);
    expect(ebResult.best?.chordName).toBe('Eb');
    expect(ebResult.best?.rootLabel).toBe('Eb');

    // 未指定音名标签时兜底使用标准音名 (Bb)
    const unlabelledBb = [note(1, 10, ''), note(2, 2, 'D'), note(3, 5, 'F')];
    const unlabelledResult = analyzeChordGraph(unlabelledBb, null);
    expect(unlabelledResult.best?.chordName).toBe('Bb');

    // 当用户主动在琴弦上切换变音记号（切成 A# 或 D#）时，候选列表联动更新
    const aSharpNotes = [note(1, 10, 'A#'), note(2, 2, 'D'), note(3, 5, 'F')];
    const aSharpResult = analyzeChordGraph(aSharpNotes, null);
    expect(aSharpResult.best?.chordName).toBe('A#');
    expect(aSharpResult.best?.rootLabel).toBe('A#');

    const dSharpNotes = [note(1, 3, 'D#'), note(2, 7, 'G'), note(3, 10, 'Bb')];
    const dSharpResult = analyzeChordGraph(dSharpNotes, null);
    expect(dSharpResult.best?.chordName).toBe('D#');
    expect(dSharpResult.best?.rootLabel).toBe('D#');
  });

  it('honors explicit root note label when explicitly specified', () => {
    const dbMajor = [note(1, 1, 'Db'), note(2, 5, 'F'), note(3, 8, 'Ab')];
    const result = analyzeChordGraph(dbMajor, 1);
    expect(result.best?.chordName).toBe('Db');
    expect(result.best?.rootLabel).toBe('Db');
  });

  it('provides low-confidence candidates when purity is below normal threshold instead of returning empty', () => {
    // 4 distinct pitch classes: C(0), F(5), D(2), A(9) with explicit root C(0) on lowest string
    // Csus4 (0, 5) and Csus2 (0, 2) explain 2 of 4 notes -> purity = 0.50 (below MIN_PURITY 0.60, above LOW_PURITY_THRESHOLD 0.45)
    // Previously with MIN_PURITY = 0.62, this yielded 0 candidates.
    const noisyNotes = [note(0, 0, 'C'), note(1, 5, 'F'), note(2, 2, 'D'), note(3, 9, 'A')];
    const result = analyzeChordGraph(noisyNotes, 0);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.lowConfidence.length).toBeGreaterThan(0);
    expect(result.lowConfidence.some(c => c.chordName.startsWith('Csus'))).toBe(true);
  });

  it('233332 指法下能够正确推导出 Bbadd9/F#', () => {
    // 6弦(2品 F# 42), 5弦(3品 C 48), 4弦(3品 F 53), 3弦(3品 Bb 58), 2弦(3品 D 62), 1弦(2品 F# 66)
    const notes = [
      note(0, 42, 'F#'),
      note(1, 48, 'C'),
      note(2, 53, 'F'),
      note(3, 58, 'Bb'),
      note(4, 62, 'D'),
      note(5, 66, 'F#'),
    ];
    const result = analyzeChordGraph(notes, null);
    expect(result.candidates.length).toBeGreaterThan(0);
    const bbCandidate = result.candidates.find(c => c.chordName.startsWith('Bbadd9'));
    expect(bbCandidate).toBeDefined();
    expect(bbCandidate?.chordName).toBe('Bbadd9/F#');

    // 当指定显式根音为 58 (Bb) 时，仍应稳定推导为 Bbadd9/F#
    const resultWithExplicit = analyzeChordGraph(notes, 58);
    const explicitCandidate = resultWithExplicit.candidates.find(c => c.chordName.startsWith('Bbadd9'));
    expect(explicitCandidate).toBeDefined();
    expect(explicitCandidate?.chordName).toBe('Bbadd9/F#');

    // 当用户切音名将 3 弦切为 A# 时，候选列表联动推导出 A#add9/F#
    const notesWithASharp = [
      note(0, 42, 'F#'),
      note(1, 48, 'C'),
      note(2, 53, 'F'),
      note(3, 58, 'A#'),
      note(4, 62, 'D'),
      note(5, 66, 'F#'),
    ];
    const aSharpResult = analyzeChordGraph(notesWithASharp, null);
    const aSharpCandidate = aSharpResult.candidates.find(c => c.chordName.startsWith('A#add9'));
    expect(aSharpCandidate).toBeDefined();
    expect(aSharpCandidate?.chordName).toBe('A#add9/F#');
  });
});
