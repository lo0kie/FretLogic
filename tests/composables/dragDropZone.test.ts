import { describe, expect, it } from 'vitest';

import { resolveDropAction, resolveDropZone } from '@/domains/score/editor/composables/lyrics-drag/dropZone';

import type { DropZone } from '@/domains/score/editor/composables/lyrics-drag/dropZone';

const rect = (top: number, height: number) => ({ top, height });

describe('resolveDropZone', () => {
  const r = rect(100, 40); // 中点 y = 120，迟滞带 = max(2, 40*0.12=4.8) = 4.8

  it('中点之上判定为上半区', () => {
    expect(resolveDropZone(r, 110, null)).toBe('top');
  });

  it('中点之下判定为下半区', () => {
    expect(resolveDropZone(r, 130, null)).toBe('bottom');
  });

  it('迟滞带内保持上一个分区', () => {
    // 中点 120，迟滞带约 ±4.8：115~125 内沿用 prevZone
    expect(resolveDropZone(r, 124, 'top')).toBe('top');
    expect(resolveDropZone(r, 116, 'bottom')).toBe('bottom');
  });

  it('迟滞带内且无上一次分区时落入最近侧', () => {
    expect(resolveDropZone(r, 119, null)).toBe('top');
    expect(resolveDropZone(r, 121, null)).toBe('bottom');
  });

  it('越过迟滞带后正常切换分区', () => {
    expect(resolveDropZone(r, 126, 'top')).toBe('bottom');
    expect(resolveDropZone(r, 114, 'bottom')).toBe('top');
  });

  it('迟滞带随格高按比例放大（更高的格子防抖更稳）', () => {
    const tall = rect(100, 120); // 中点 160，迟滞带 = 120*0.12 = 14.4
    expect(resolveDropZone(tall, 170, 'top')).toBe('top');
    expect(resolveDropZone(tall, 175, 'top')).toBe('bottom');
  });

  it('过矮的格子保持 2px 下限', () => {
    const tiny = rect(100, 8); // 中点 104，迟滞带 = max(2, 0.96) = 2
    expect(resolveDropZone(tiny, 104.5, 'top')).toBe('top');
    expect(resolveDropZone(tiny, 107, 'top')).toBe('bottom');
  });
});

describe('resolveDropAction', () => {
  const cases: Array<[DropZone, boolean, string]> = [
    ['top', true, 'swap'],
    ['bottom', true, 'replace'],
    ['top', false, 'copy'],
    ['bottom', false, 'move'],
  ];
  it.each(cases)('zone=%s occupied=%s → %s', (zone, occupied, expected) => {
    expect(resolveDropAction(zone, occupied)).toBe(expected);
  });
});
