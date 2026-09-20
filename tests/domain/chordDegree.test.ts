import { describe, expect, it } from 'vitest';

import { getChordDegree } from '@/domains/chord/theory/theory';

import type { ChordOrName } from '@/domains/chord/theory/theory';

describe('调式和弦级数推导 (Roman Numerals)', () => {
  describe('C 大调自然级数 (Diatonic Major)', () => {
    it('标准自然七和弦与三和弦推导', () => {
      expect(getChordDegree('C', 'C')).toEqual({ roman: 'I', degree: 1, isDiatonic: true });
      expect(getChordDegree('Dm', 'C')).toEqual({ roman: 'ii', degree: 2, isDiatonic: true });
      expect(getChordDegree('Em', 'C')).toEqual({ roman: 'iii', degree: 3, isDiatonic: true });
      expect(getChordDegree('F', 'C')).toEqual({ roman: 'IV', degree: 4, isDiatonic: true });
      expect(getChordDegree('G', 'C')).toEqual({ roman: 'V', degree: 5, isDiatonic: true });
      expect(getChordDegree('G7', 'C')).toEqual({ roman: 'V7', degree: 5, isDiatonic: true });
      expect(getChordDegree('Am', 'C')).toEqual({ roman: 'vi', degree: 6, isDiatonic: true });
      expect(getChordDegree('Bdim', 'C')).toEqual({ roman: 'vii°', degree: 7, isDiatonic: true });
      expect(getChordDegree('Bm7b5', 'C')).toEqual({ roman: 'viiø7', degree: 7, isDiatonic: true });
    });

    it('扩展和弦属性正确拼装', () => {
      expect(getChordDegree('Cmaj7', 'C')).toEqual({ roman: 'Imaj7', degree: 1, isDiatonic: true });
      expect(getChordDegree('Dm7', 'C')).toEqual({ roman: 'ii7', degree: 2, isDiatonic: true });
      expect(getChordDegree('Gsus4', 'C')).toEqual({ roman: 'Vsus4', degree: 5, isDiatonic: true });
      expect(getChordDegree('Cadd9', 'C')).toEqual({ roman: 'Iadd9', degree: 1, isDiatonic: true });
    });
  });

  describe('根音在调内的副属七与借用三和弦 (Root-in-key Secondary/Modal)', () => {
    it('常见副属和弦 (Secondary Dominants)', () => {
      // 注意：getChordDegree 的 isDiatonic 只按「根音是否落在调内音级」判定，
      // 不分析和弦内部离调音（E7 的 G# 已离调但仍算 isDiatonic: true），
      // 也不产出 V/vi 这类功能标注——roman 只有 III7 一段
      expect(getChordDegree('E7', 'C')).toEqual({ roman: 'III7', degree: 3, isDiatonic: true });
      expect(getChordDegree('A7', 'C')).toEqual({ roman: 'VI7', degree: 6, isDiatonic: true });
      expect(getChordDegree('D7', 'C')).toEqual({ roman: 'II7', degree: 2, isDiatonic: true });
    });

    it('常见调式借用和弦 (Modal Interchange)', () => {
      // 根音离调（bVII/bVI/bIII）→ isDiatonic: false；Fm 根音 F 是调内 IV 级 → true
      // （小三度 Ab 的离调性同样不参与判定，见上一用例的口径说明）
      expect(getChordDegree('Bb', 'C')).toEqual({ roman: 'bVII', degree: 7, isDiatonic: false });
      expect(getChordDegree('Fm', 'C')).toEqual({ roman: 'iv', degree: 4, isDiatonic: true });
      expect(getChordDegree('Ab', 'C')).toEqual({ roman: 'bVI', degree: 6, isDiatonic: false });
      expect(getChordDegree('Eb', 'C')).toEqual({ roman: 'bIII', degree: 3, isDiatonic: false });
    });

    it('转位斜杠和弦低音级数', () => {
      // C/E 在 C 大调中是 I/3
      expect(getChordDegree('C/E', 'C').roman).toBe('I/3');
      // G/B 在 C 大调中是 V/7
      expect(getChordDegree('G/B', 'C').roman).toBe('V/7');
    });
  });

  describe('小调自然级数 (Minor Key)', () => {
    it('A 自然小调 / 和声小调常见和弦', () => {
      expect(getChordDegree('Am', 'Am')).toEqual({ roman: 'i', degree: 1, isDiatonic: true });
      expect(getChordDegree('Bdim', 'Am')).toEqual({ roman: 'ii°', degree: 2, isDiatonic: true });
      expect(getChordDegree('C', 'Am')).toEqual({ roman: 'III', degree: 3, isDiatonic: true });
      expect(getChordDegree('Dm', 'Am')).toEqual({ roman: 'iv', degree: 4, isDiatonic: true });
      expect(getChordDegree('Em', 'Am')).toEqual({ roman: 'v', degree: 5, isDiatonic: true });
      expect(getChordDegree('E7', 'Am')).toEqual({ roman: 'V7', degree: 5, isDiatonic: true });
      expect(getChordDegree('F', 'Am')).toEqual({ roman: 'VI', degree: 6, isDiatonic: true });
      expect(getChordDegree('G', 'Am')).toEqual({ roman: 'VII', degree: 7, isDiatonic: true });
    });
  });

  describe('扩展与复合性质全覆盖（修复 romanSuffix 静默丢失）', () => {
    it('9~13 和弦后缀不再丢失', () => {
      expect(getChordDegree('C9', 'C').roman).toBe('I9');
      expect(getChordDegree('Cm9', 'C').roman).toBe('i9');
      expect(getChordDegree('C11', 'C').roman).toBe('I11');
      expect(getChordDegree('Cm11', 'C').roman).toBe('i11');
      expect(getChordDegree('C13', 'C').roman).toBe('I13');
      expect(getChordDegree('Cm13', 'C').roman).toBe('i13');
      expect(getChordDegree('Cmaj9', 'C').roman).toBe('Imaj9');
      expect(getChordDegree('Cmaj11', 'C').roman).toBe('Imaj11');
      expect(getChordDegree('Cmaj13', 'C').roman).toBe('Imaj13');
      expect(getChordDegree('Am9', 'Am').roman).toBe('i9');
    });

    it('add 家族（除 add9 外此前丢失）', () => {
      expect(getChordDegree('Cadd2', 'C').roman).toBe('Iadd2');
      expect(getChordDegree('Cadd11', 'C').roman).toBe('Iadd11');
      expect(getChordDegree('Cadd13', 'C').roman).toBe('Iadd13');
    });

    it('6 与 6/9 和弦', () => {
      expect(getChordDegree('C6', 'C').roman).toBe('I6');
      expect(getChordDegree('Cm6', 'C').roman).toBe('im6');
      expect(getChordDegree('C6/9', 'C').roman).toBe('I6/9');
      expect(getChordDegree('C69', 'C').roman).toBe('I6/9');
    });

    it('aug7 / 复合性质（此前丢失或错判）', () => {
      expect(getChordDegree('Caug7', 'C').roman).toBe('I+7');
      expect(getChordDegree('C7alt', 'C').roman).toBe('Ialt');
      expect(getChordDegree('Cm7(b5)', 'C').roman).toBe('iø7');
      expect(getChordDegree('CmMaj7', 'C').roman).toBe('imMaj7');
      // dim 三和弦是小三度，遵循 theory.ts「减和弦用小写罗马数字」通则，与 vii° / ii° / iø7 一致
      expect(getChordDegree('CdimMaj7', 'C').roman).toBe('i°Maj7');
      expect(getChordDegree('CaugMaj7', 'C').roman).toBe('I+Maj7');
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
