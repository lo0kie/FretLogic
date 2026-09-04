import { describe, expect, it } from 'vitest';

import { getChordDegree } from '@/domains/chord/theory/theory';

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

  describe('常用副属和弦与离调和弦 (Non-diatonic / Secondary)', () => {
    it('常见副属和弦 (Secondary Dominants)', () => {
      // E7 在 C 大调中是 V/vi (III7)
      expect(getChordDegree('E7', 'C')).toEqual({ roman: 'III7', degree: 3, isDiatonic: true });
      // A7 在 C 大调中是 V/ii (VI7)
      expect(getChordDegree('A7', 'C')).toEqual({ roman: 'VI7', degree: 6, isDiatonic: true });
      // D7 在 C 大调中是 V/V (II7)
      expect(getChordDegree('D7', 'C')).toEqual({ roman: 'II7', degree: 2, isDiatonic: true });
    });

    it('常见调式借用和弦 (Modal Interchange)', () => {
      // Bb 在 C 大调中是 bVII
      expect(getChordDegree('Bb', 'C')).toEqual({ roman: 'bVII', degree: 7, isDiatonic: false });
      // Fm 在 C 大调中是 iv (小下属和弦)
      expect(getChordDegree('Fm', 'C')).toEqual({ roman: 'iv', degree: 4, isDiatonic: true });
      // Ab 在 C 大调中是 bVI
      expect(getChordDegree('Ab', 'C')).toEqual({ roman: 'bVI', degree: 6, isDiatonic: false });
      // Eb 在 C 大调中是 bIII
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
});
