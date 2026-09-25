import { describe, expect, it } from 'vitest';

import { getChordDegree } from '@/domains/chord/theory/theory';

import type { ChordOrName } from '@/domains/chord/theory/theory';

interface DegreeCase {
  label: string;
  chord: string;
  key: string;
  degree: number;
  roman: string;
  isDiatonic: boolean;
}

describe('调式和弦级数推导 (Roman Numerals)', () => {
  describe('C 大调自然级数 (Diatonic Major)', () => {
    // 同一条规则「根音 → 级数码表 + 性质/扩展 → roman」的不同取值：
    // 前 9 行是自然七和弦与三和弦，后 4 行是扩展性质的后缀拼装。
    const majorCases: DegreeCase[] = [
      { label: 'C 主三和弦 → I', chord: 'C', key: 'C', degree: 1, roman: 'I', isDiatonic: true },
      { label: 'Dm 上主音 → ii', chord: 'Dm', key: 'C', degree: 2, roman: 'ii', isDiatonic: true },
      { label: 'Em 中音 → iii', chord: 'Em', key: 'C', degree: 3, roman: 'iii', isDiatonic: true },
      { label: 'F 下属音 → IV', chord: 'F', key: 'C', degree: 4, roman: 'IV', isDiatonic: true },
      { label: 'G 属音 → V', chord: 'G', key: 'C', degree: 5, roman: 'V', isDiatonic: true },
      { label: 'G7 属七 → V7', chord: 'G7', key: 'C', degree: 5, roman: 'V7', isDiatonic: true },
      { label: 'Am 下中音 → vi', chord: 'Am', key: 'C', degree: 6, roman: 'vi', isDiatonic: true },
      { label: 'Bdim 导音三和弦 → vii°', chord: 'Bdim', key: 'C', degree: 7, roman: 'vii°', isDiatonic: true },
      { label: 'Bm7b5 半减七 → viiø7', chord: 'Bm7b5', key: 'C', degree: 7, roman: 'viiø7', isDiatonic: true },
      { label: 'Cmaj7 大七 → Imaj7', chord: 'Cmaj7', key: 'C', degree: 1, roman: 'Imaj7', isDiatonic: true },
      { label: 'Dm7 小七 → ii7', chord: 'Dm7', key: 'C', degree: 2, roman: 'ii7', isDiatonic: true },
      { label: 'Gsus4 挂四 → Vsus4', chord: 'Gsus4', key: 'C', degree: 5, roman: 'Vsus4', isDiatonic: true },
      { label: 'Cadd9 加九 → Iadd9', chord: 'Cadd9', key: 'C', degree: 1, roman: 'Iadd9', isDiatonic: true },
    ];

    it.each(majorCases)('$label', ({ chord, key, degree, roman, isDiatonic }) => {
      expect(getChordDegree(chord, key)).toEqual({ roman, degree, isDiatonic });
    });
  });

  describe('根音在调内的副属七与调式借用 (Root-in-key Secondary/Modal)', () => {
    // 判据是两层取与：根音落在调内音级（interval 表）**且**和弦全部构成音都落在调内音阶上。
    // 故「根音在调内、和弦内部却含离调音」的算离调 —— C 大调里 E7 含 G#、A7 含 C#、
    // D7 含 F#、Fm 含 Ab，它们正是副属七与调式借用，不该与 I / IV / V 同判。
    // 根音离调（bVII/bVI/bIII）本就在第一层为 false，两层取与后仍为 false。
    // 实现仍不产出 V/vi 这类功能标注——roman 只有级数一段。
    const secondaryCases: DegreeCase[] = [
      { label: 'E7 副属（含 G# 离调）→ III7', chord: 'E7', key: 'C', degree: 3, roman: 'III7', isDiatonic: false },
      { label: 'A7 副属（含 C# 离调）→ VI7', chord: 'A7', key: 'C', degree: 6, roman: 'VI7', isDiatonic: false },
      { label: 'D7 副属（含 F# 离调）→ II7', chord: 'D7', key: 'C', degree: 2, roman: 'II7', isDiatonic: false },
      { label: 'Bb 借用 bVII（根音离调）', chord: 'Bb', key: 'C', degree: 7, roman: 'bVII', isDiatonic: false },
      { label: 'Fm 借用 iv（含 Ab 离调）', chord: 'Fm', key: 'C', degree: 4, roman: 'iv', isDiatonic: false },
      { label: 'Ab 借用 bVI（根音离调）', chord: 'Ab', key: 'C', degree: 6, roman: 'bVI', isDiatonic: false },
      { label: 'Eb 借用 bIII（根音离调）', chord: 'Eb', key: 'C', degree: 3, roman: 'bIII', isDiatonic: false },
    ];

    it.each(secondaryCases)('$label', ({ chord, key, degree, roman, isDiatonic }) => {
      expect(getChordDegree(chord, key)).toEqual({ roman, degree, isDiatonic });
    });
  });

  describe('小调自然级数 (Minor Key)', () => {
    const minorCases: DegreeCase[] = [
      { label: 'Am 主三和弦 → i', chord: 'Am', key: 'Am', degree: 1, roman: 'i', isDiatonic: true },
      { label: 'Bdim 上主音减三 → ii°', chord: 'Bdim', key: 'Am', degree: 2, roman: 'ii°', isDiatonic: true },
      { label: 'C 中音 → III', chord: 'C', key: 'Am', degree: 3, roman: 'III', isDiatonic: true },
      { label: 'Dm 下属音 → iv', chord: 'Dm', key: 'Am', degree: 4, roman: 'iv', isDiatonic: true },
      { label: 'Em 属音 → v', chord: 'Em', key: 'Am', degree: 5, roman: 'v', isDiatonic: true },
      // 升七级导音（G#）并入调内掩码：它是和声小调的属音三音，E7 因此仍是调内和弦。
      // 对照大调：同一个 E7 在 C 大调里含 G# 即离调（见上一组）。
      {
        label: 'E7 和声小调属七（G# 计入调内）→ V7',
        chord: 'E7',
        key: 'Am',
        degree: 5,
        roman: 'V7',
        isDiatonic: true,
      },
      // 升六级（旋律小调）**不**并入：根音 D 在调内，但 F# 不在，故判离调——
      // 与根音判据（MINOR_INTERVAL_MAP 的 #VI 为 false）保持同一口径
      { label: 'D7 含升六（F#）→ IV7（离调）', chord: 'D7', key: 'Am', degree: 4, roman: 'IV7', isDiatonic: false },
      { label: 'F 下中音 → VI', chord: 'F', key: 'Am', degree: 6, roman: 'VI', isDiatonic: true },
      { label: 'G 自然小调七级 → VII', chord: 'G', key: 'Am', degree: 7, roman: 'VII', isDiatonic: true },
      // 11 半音是自然小调 VII（G）的等音上方：G# 属升七级导音，不在自然小调音阶内
      {
        label: 'G#dim 升七级导音 → #vii°（离调）',
        chord: 'G#dim',
        key: 'Am',
        degree: 7,
        roman: '#vii°',
        isDiatonic: false,
      },
    ];

    it.each(minorCases)('$label', ({ chord, key, degree, roman, isDiatonic }) => {
      expect(getChordDegree(chord, key)).toEqual({ roman, degree, isDiatonic });
    });
  });

  describe('转位斜杠和弦低音级数（大调 / 小调对照）', () => {
    // 低音级数走**本调音阶**的度数表：同一和弦 Dm/C 在 Am 与 C 下低音级数不同。
    const slashCases: Array<{ label: string; chord: string; key: string; roman: string }> = [
      // C/E 在 C 大调中是 I/3
      { label: 'C 大调 C/E → I/3', chord: 'C/E', key: 'C', roman: 'I/3' },
      // G/B 在 C 大调中是 V/7
      { label: 'C 大调 G/B → V/7', chord: 'G/B', key: 'C', roman: 'V/7' },
      // 低音 C 距 A 为小三度：自然小调里是 III 级（大调度数表会错判成 II 级）
      { label: 'A 小调 Dm/C → iv/3（走自然小调度数表）', chord: 'Dm/C', key: 'Am', roman: 'iv/3' },
      // 大调路径不受影响：C 大调中 Dm/C 的低音 C 仍是 I 级
      { label: 'C 大调 Dm/C → ii/1（同一和弦在大调下的对照行）', chord: 'Dm/C', key: 'C', roman: 'ii/1' },
    ];

    it.each(slashCases)('$label', ({ chord, key, roman }) => {
      expect(getChordDegree(chord, key).roman).toBe(roman);
    });
  });

  describe('扩展与复合性质全覆盖（修复 romanSuffix 静默丢失）', () => {
    // 同一条规则「扩展/复合性质的 romanSuffix 不再被静默丢弃」的全部取值：
    // 9~13 家族、add 家族（除 add9 外此前丢失）、6 与 6/9、aug7 及其他复合性质。
    const suffixCases: Array<{ label: string; chord: string; key: string; roman: string }> = [
      { label: 'C9 → I9', chord: 'C9', key: 'C', roman: 'I9' },
      { label: 'Cm9 → i9', chord: 'Cm9', key: 'C', roman: 'i9' },
      { label: 'C11 → I11', chord: 'C11', key: 'C', roman: 'I11' },
      { label: 'Cm11 → i11', chord: 'Cm11', key: 'C', roman: 'i11' },
      { label: 'C13 → I13', chord: 'C13', key: 'C', roman: 'I13' },
      { label: 'Cm13 → i13', chord: 'Cm13', key: 'C', roman: 'i13' },
      { label: 'Cmaj9 → Imaj9', chord: 'Cmaj9', key: 'C', roman: 'Imaj9' },
      { label: 'Cmaj11 → Imaj11', chord: 'Cmaj11', key: 'C', roman: 'Imaj11' },
      { label: 'Cmaj13 → Imaj13', chord: 'Cmaj13', key: 'C', roman: 'Imaj13' },
      { label: 'Am9（A 小调）→ i9', chord: 'Am9', key: 'Am', roman: 'i9' },
      { label: 'Cadd2 → Iadd2（add 家族此前丢失）', chord: 'Cadd2', key: 'C', roman: 'Iadd2' },
      { label: 'Cadd11 → Iadd11（add 家族此前丢失）', chord: 'Cadd11', key: 'C', roman: 'Iadd11' },
      { label: 'Cadd13 → Iadd13（add 家族此前丢失）', chord: 'Cadd13', key: 'C', roman: 'Iadd13' },
      { label: 'C6 → I6', chord: 'C6', key: 'C', roman: 'I6' },
      { label: 'Cm6 → im6', chord: 'Cm6', key: 'C', roman: 'im6' },
      { label: 'C6/9 → I6/9', chord: 'C6/9', key: 'C', roman: 'I6/9' },
      { label: 'C69 → I6/9（与 6/9 同形写法）', chord: 'C69', key: 'C', roman: 'I6/9' },
      { label: 'Caug7 → I+7', chord: 'Caug7', key: 'C', roman: 'I+7' },
      { label: 'C7alt → Ialt', chord: 'C7alt', key: 'C', roman: 'Ialt' },
      { label: 'Cm7(b5) → iø7', chord: 'Cm7(b5)', key: 'C', roman: 'iø7' },
      { label: 'CmMaj7 → imMaj7', chord: 'CmMaj7', key: 'C', roman: 'imMaj7' },
      // dim 三和弦是小三度，遵循 theory.ts「减和弦用小写罗马数字」通则，与 vii° / ii° / iø7 一致
      { label: 'CdimMaj7 → i°Maj7（减和弦用小写级数码）', chord: 'CdimMaj7', key: 'C', roman: 'i°Maj7' },
      { label: 'CaugMaj7 → I+Maj7', chord: 'CaugMaj7', key: 'C', roman: 'I+Maj7' },
    ];

    it.each(suffixCases)('$label', ({ chord, key, roman }) => {
      expect(getChordDegree(chord, key).roman).toBe(roman);
    });

    it('旧格式分片（quality m7 + extensions 里的 b5）经重解析后仍判为半减七', () => {
      // 历史持久化数据里存在 { quality: 'm7', extensions: [[5, -1]] } 这种分片。
      // getChordDegree 走的是「渲染成串 → parseChordName → nameToSegments」，旧分片渲染出的
      // 字符串与新分片完全相同（都是 "Am7b5"），重解析时必然被合成为 quality 'm7b5'。
      // 也就是说旧格式在这里会被自动矫正，级数侧无需再对 suffix 补一条正则兜底。
      const legacySegments: ChordOrName = {
        nameSegments: { root: ['A', 0], quality: 'm7', extensions: [[5, -1]] },
      };
      expect(getChordDegree(legacySegments, 'C').roman).toBe('viø7');
      expect(getChordDegree('Am7b5', 'C').roman).toBe('viø7');
    });
  });
});
