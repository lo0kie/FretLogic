import { describe, expect, it } from 'vitest';

import { baseGeometryFor, createFretboardGeometry } from '@/domains/fretboard/model/fretboardGeometry';

describe('指板几何装配', () => {
  it('尺寸按 scale 等比派生', () => {
    const base = createFretboardGeometry(1, true);
    const doubled = createFretboardGeometry(2, true);

    expect(doubled.stringSpacing).toBeCloseTo(base.stringSpacing * 2);
    expect(doubled.leftPad).toBeCloseTo(base.leftPad * 2);
    expect(doubled.fretHeight).toBeCloseTo(base.fretHeight * 2);
  });

  it('画弦枕的那张图比不画的更高：多出整整一条弦枕', () => {
    const withNut = baseGeometryFor(true);
    const withoutNut = baseGeometryFor(false);

    expect(withNut.boardBoxHeight(4) - withoutNut.boardBoxHeight(4)).toBeCloseTo(withNut.nutHeight);
  });

  it('画不画弦枕只影响纵向：横向尺寸两张图完全相同', () => {
    const withNut = baseGeometryFor(true);
    const withoutNut = baseGeometryFor(false);

    expect(withoutNut.stringSpacing).toBeCloseTo(withNut.stringSpacing);
    expect(withoutNut.leftPad).toBeCloseTo(withNut.leftPad);
    expect(withoutNut.boardWidth(6)).toBeCloseTo(withNut.boardWidth(6));
  });

  it('同选项重复取尺寸命中缓存（同一引用），不同选项各自成档', () => {
    const geometry = createFretboardGeometry(1, true);
    const opts = { stringCount: 6, fretCount: 4 };

    expect(geometry.sizeOf(opts)).toBe(geometry.sizeOf({ ...opts }));
    expect(geometry.sizeOf(opts)).not.toBe(geometry.sizeOf({ stringCount: 6, fretCount: 5 }));
  });

  it('预留名字位时网格顶更低（名字区把指板压下去一段）', () => {
    const geometry = createFretboardGeometry(1, true);

    const withName = geometry.topSkeleton({ reserveName: true }).gridTop;
    const withoutName = geometry.topSkeleton({ reserveName: false }).gridTop;

    expect(withName).toBeGreaterThan(withoutName);
  });

  it('板宽随弦数增长，单弦按下限一段弦距计', () => {
    const geometry = createFretboardGeometry(1, true);

    expect(geometry.boardWidth(7)).toBeGreaterThan(geometry.boardWidth(6));
    expect(geometry.boardWidth(1)).toBeGreaterThan(geometry.leftPad * 2);
  });
});
