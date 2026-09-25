import { describe, expect, it } from 'vitest';

import { baseGeometryFor, createFretboardGeometry } from '@/domains/fretboard/model/fretboardGeometry';

/** 派生关系表的一行：'≈' 锁死等比 / 等值，'>' 只锁单调方向（不写死具体差值） */
type DerivedCase = { label: string; relation: '≈' | '>'; actual: () => number; expected: () => number };

describe('指板几何装配', () => {
  const base = createFretboardGeometry(1, true);
  const doubled = createFretboardGeometry(2, true);
  const withNut = baseGeometryFor(true);
  const withoutNut = baseGeometryFor(false);

  it('画弦枕的那张图比不画的更高：多出整整一条弦枕', () => {
    expect(withNut.boardBoxHeight(4) - withoutNut.boardBoxHeight(4)).toBeCloseTo(withNut.nutHeight);
  });

  /**
   * 同一装配的派生关系表：尺寸随 scale 等比、显隐只影响自己那一段（隐藏的元素不占位）。
   * 逐行对应一条派生关系，含「画不画弦枕只影响纵向」的横向三项与预留名字位那一项。
   */
  it.each<DerivedCase>([
    {
      label: '弦距按 scale 等比派生',
      relation: '≈',
      actual: () => doubled.stringSpacing,
      expected: () => base.stringSpacing * 2,
    },
    {
      label: '左侧留白按 scale 等比派生',
      relation: '≈',
      actual: () => doubled.leftPad,
      expected: () => base.leftPad * 2,
    },
    {
      label: '品高按 scale 等比派生',
      relation: '≈',
      actual: () => doubled.fretHeight,
      expected: () => base.fretHeight * 2,
    },
    {
      label: '画不画弦枕只影响纵向：弦距相同',
      relation: '≈',
      actual: () => withoutNut.stringSpacing,
      expected: () => withNut.stringSpacing,
    },
    {
      label: '画不画弦枕只影响纵向：左侧留白相同',
      relation: '≈',
      actual: () => withoutNut.leftPad,
      expected: () => withNut.leftPad,
    },
    {
      label: '画不画弦枕只影响纵向：板宽相同（6 弦）',
      relation: '≈',
      actual: () => withoutNut.boardWidth(6),
      expected: () => withNut.boardWidth(6),
    },
    {
      label: '预留名字位时网格顶更低（名字区把指板压下去一段）',
      relation: '>',
      actual: () => base.topSkeleton({ reserveName: true }).gridTop,
      expected: () => base.topSkeleton({ reserveName: false }).gridTop,
    },
  ])('$label', ({ relation, actual, expected }) => {
    const value = actual();
    if (relation === '>') expect(value).toBeGreaterThan(expected());
    else expect(value).toBeCloseTo(expected());
  });
});
