/**
 * data/sample-backup.json（人工维护的示例备份）的不变式守卫。
 *
 * 这份文件是「导入备份」的示例数据，此前**没有任何引用**——没有任何关卡会碰它，于是它悄悄停在
 * payload v6（琴弦还是二维元组、chordMap 还是扁平结构），且 10 条和弦里有 8 条的 rootStringIndex
 * 标在**不发根音**的弦上。后者不是无伤大雅的标注：rootStringIndex 是根音解析的**首选**来源
 * （chordSearch.resolveChordRootPitch 的第 1 级兜底），导入这份示例后那些和弦的根音与转位判定
 * 会全错，而没有任何一处会报错。
 *
 * 两条不变式都不写死具体数值（rules/06-test-quality-and-self-check.md 的「一」第 2 条），全部由被检数据自身推导：
 *  1. 示例已处于当前 payload 版本：经真实迁移链跑一遍应当**原样返回**。任何人递增
 *     CURRENT_PAYLOAD_VERSION 后忘了更新示例，这条会立刻红——更新方式就是拿它跑一遍
 *     `migratePayloadVersion`（迁移链的产物即新示例，不要手改结构）。
 *  2. 每条和弦的 rootStringIndex 必须落在一根真正发出该和弦根音的弦上——判据用「按标记解析出的
 *     根音」与「按和弦名解析出的根音」必须同值，直接复用被测的解析器，不另写一套音高换算。
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { CURRENT_PAYLOAD_VERSION, migratePayloadVersion } from '@/app/services/validation/payloadMigrations';
import { resolveChordRootPitch } from '@/domains/chord/theory/chordSearch';

import type { ChordOrName } from '@/domains/chord/theory/chordName';
import type { GuitarStringEntity } from '@/domains/fretboard/types';

interface SampleChord extends ChordOrName, Record<string, unknown> {
  id: string;
  strings: GuitarStringEntity[];
  fretOffset: number;
  tuning: string;
  rootStringIndex: number | null;
}

interface SamplePayload extends Record<string, unknown> {
  version: number;
  chords: SampleChord[];
}

const SAMPLE = JSON.parse(
  readFileSync(new URL('../../data/sample-backup.json', import.meta.url), 'utf8')
) as SamplePayload;

describe('示例备份 data/sample-backup.json', () => {
  it('已处于当前 payload 版本：迁移链跑一遍是恒等变换', () => {
    expect(SAMPLE.version).toBe(CURRENT_PAYLOAD_VERSION);
    expect(migratePayloadVersion(SAMPLE)).toEqual(SAMPLE);
  });

  it('每条和弦的 rootStringIndex 都标在真正发出该和弦根音的弦上', () => {
    const offenders: string[] = [];
    for (const chord of SAMPLE.chords) {
      const marked = chord.rootStringIndex;
      if (marked === null) continue;

      const string = chord.strings[marked];
      if (!string || string.fret < 0) {
        offenders.push(`${chord.id}: rootStringIndex=${marked} 指向静音弦或越界下标`);
        continue;
      }

      // 不传 rootStringIndex ⇒ 走「按和弦名解析」；传它 ⇒ 走「按手动标记解析」。两者必须同值，
      // 否则该标记会把一个不发声的和弦音当成根音传下去。
      const byName = resolveChordRootPitch(chord.strings, chord.fretOffset, chord.tuning, chord, null);
      const byMark = resolveChordRootPitch(chord.strings, chord.fretOffset, chord.tuning, chord, marked);
      if (byMark !== byName) offenders.push(`${chord.id}: 标记弦解析出根音 ${byMark}，和弦名解析为 ${byName}`);
    }
    expect(offenders).toEqual([]);
  });
});
