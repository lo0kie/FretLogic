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

/**
 * `sizeOf`：离屏行的**虚拟占位尺寸**。它此前没有用例，而占位与实绘不一致正是滚动跳动的直接成因
 * —— 占位偏小则内容总高偏小（滚不到底），偏大则行进入视口时反向缩回。
 */
describe('虚拟占位尺寸 sizeOf', () => {
  const geometry = createFretboardGeometry(1, true);

  it('占位宽度与实绘板宽一致（不一致就是滚动跳动的直接成因）', () => {
    for (const stringCount of [4, 6, 7])
      expect(geometry.sizeOf({ stringCount, fretCount: 5 }).width).toBe(geometry.boardWidth(stringCount));
  });

  it('同一组开关重复调用命中缓存（返回同一对象）；开关变了才重算', () => {
    const a = geometry.sizeOf({ stringCount: 6, fretCount: 5 });
    const b = geometry.sizeOf({ stringCount: 6, fretCount: 5 });
    // 缓存命中：连对象都是同一个（缓存里存的就是这个对象）
    expect(b).toBe(a);

    // 不画和弦名 ⇒ 不预留名字位 ⇒ 高度变小（键里含这两个开关，故不会命中上一条的缓存）
    const noName = geometry.sizeOf({ stringCount: 6, fretCount: 5, showChordName: false });
    expect(noName).not.toBe(a);
    expect(noName.height).toBeLessThan(a.height);

    // 只预留名字位、不画字：高度与「画字」一致（预留与绘制是两件事），但键不同 ⇒ 另一个条目
    const reserveOnly = geometry.sizeOf({ stringCount: 6, fretCount: 5, showChordName: false, reserveChordName: true });
    expect(reserveOnly.height).toBe(a.height);
  });
});
