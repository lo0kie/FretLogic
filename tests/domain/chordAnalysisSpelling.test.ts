import { describe, expect, it } from 'vitest';

import {
  analyzeDraftChordGraph,
  applyCandidatePitchSpelling,
  cloneCandidateSegments,
} from '@/domains/chord/theory/chordAnalysis';
import { calcPitchIndex, formatStringLabel, getDefaultPreferFlatForPitch } from '@/domains/chord/theory/pitch';
import { getBaseStringsFor, Tuning } from '@/domains/chord/theory/tuning';

import type { GuitarStringEntity } from '@/platform/types/instrument';

const BASE = getBaseStringsFor(Tuning.STANDARD, 6);

/**
 * 按真实编辑路径构造弦模型：品位落定时的升降号偏好取该音级的乐理默认（与 useFretboardEdits.setStringFret 同口径）。
 * 测试要验的正是「默认写法与所选候选名的写法不一致时，选中候选能否把弦上音名改过来」。
 */
const buildStrings = (frets: number[]): GuitarStringEntity[] =>
  frets.map((fret, sIdx) => ({
    fret,
    preferFlat: fret >= 0 && getDefaultPreferFlatForPitch(calcPitchIndex(sIdx, fret, 0, BASE)),
  }));

/** 走真实链路：按品位建弦 → 识别候选 → 选中指定名的候选 → 返回选中后各弦的音名 */
const labelsAfterSelect = (strings: GuitarStringEntity[], chordName: string): string[] => {
  const graph = analyzeDraftChordGraph(strings, 0, BASE, Tuning.STANDARD, null);
  const candidate = graph?.candidates.find(c => c.chordName === chordName);
  if (!candidate) throw new Error(`候选识别结果里没有 ${chordName}`);

  applyCandidatePitchSpelling(cloneCandidateSegments(candidate)!, candidate.roles, strings, 0, BASE);
  return strings.map((str, sIdx) => formatStringLabel(sIdx, str.fret, str.preferFlat, 0, BASE));
};

describe('选中候选和弦后修正各弦音名的升降号', () => {
  it('自然根音和弦按音级定字母：E 的三音写作 G#，而不是该音级的默认 Ab', () => {
    // 默认表把音级 8 记作 Ab（见 pitch.DEFAULT_PITCH_PREFER_FLAT），但 E 和弦的三音是 G 的三度 ——
    // 必须按「根音字母 + 三度」拼成 G#，否则和弦名与弦上音名互相矛盾。
    expect(labelsAfterSelect(buildStrings([0, 2, 2, 1, 0, 0]), 'E')).toEqual(['E', 'B', 'E', 'G#', 'B', 'E']);
  });

  it('降号根音带动其余各音：Ebm 的五音写作 Gb，而不是该音级的默认 F#', () => {
    expect(labelsAfterSelect(buildStrings([-1, 6, 8, 8, 7, 6]), 'Ebm')).toEqual(['✕', 'Eb', 'Bb', 'Eb', 'Gb', 'Bb']);
  });

  it('升号根音带动其余各音：G#m 的三音写作 D#，而不是该音级的默认 Eb', () => {
    const strings = buildStrings([4, 6, 6, 4, 4, 4]);
    // 用户先把根音切成 G#，候选名随之写作 G#m（音级 8 的根音名取自弦上标签）
    strings[0]!.preferFlat = false;
    expect(labelsAfterSelect(strings, 'G#m')).toEqual(['G#', 'D#', 'G#', 'B', 'D#', 'G#']);
  });

  it('变化扩展音按名字里的音级拼写：C7#9 的增九音是二度 D#，不是小三度 Eb', () => {
    // 音级 3 相对根音 C 既可能是小三度也可能是增九音，按半音差推只能推成 Eb —— 该由识别引擎
    // 给出的声部角色（ninth_sharp）定音级，才与和弦名里的 #9 一致。
    expect(labelsAfterSelect(buildStrings([8, 7, 5, 3, 4, -1]), 'C7#9')).toEqual(['C', 'E', 'G', 'Bb', 'D#', '✕']);
  });
});
