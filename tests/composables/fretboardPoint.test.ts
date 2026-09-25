import { describe, expect, it } from 'vitest';

import { calculateFretboardPoint } from '@/domains/fretboard/composables/useFretboardLayout';
import { INTERACTIVE_GEOMETRY } from '@/domains/fretboard/model/interactiveGeometry';

import type { FretboardPointCalculationParams } from '@/domains/fretboard/composables/useFretboardLayout';

describe('calculateFretboardPoint', () => {
  const defaultBoardRect = {
    left: 100,
    top: 50,
    width: INTERACTIVE_GEOMETRY.boardWidth(6), // 1:1 缩放
    height: 500,
  };

  const defaultParams: FretboardPointCalculationParams = {
    clientX: 100 + INTERACTIVE_GEOMETRY.leftPad, // 恰好在第 0 弦
    clientY: 50 + 200,
    boardRect: defaultBoardRect,
    rawHeight: 500,
    // 顶部两段为本用例自带的固定夹具值（反算逻辑只读它们，与真实几何无关）
    contentTopOffset: 180, // 和弦名区 100 + 空弦区 80
    chordNameZoneHeight: 100,
    fretCount: 3,
  };

  /** 板内偏移 → 客户端坐标：整体缩放 scale 倍后，横纵偏移同步等比放大 */
  const offsetToClient = (offsetX: number, offsetY: number, scale: number) => ({
    clientX: 100 + offsetX * scale,
    clientY: 50 + offsetY * scale,
  });

  /** 板尺寸：宽度随弦数走，高度随缩放倍数走 */
  const boardRectFor = (stringCount: number, scale: number) => ({
    left: 100,
    top: 50,
    width: INTERACTIVE_GEOMETRY.boardWidth(stringCount) * scale,
    height: 500 * scale,
  });

  /** 命中类用例：同一条「坐标 → 弦 + 品」反算规则，取值不同 */
  it.each([
    {
      label: '第 0 弦，y 刚好在 1 品中心 (180 + 50 = 230)',
      stringCount: 6,
      scale: 1,
      offsetX: INTERACTIVE_GEOMETRY.leftPad,
      offsetY: 230,
      expected: { stringIndex: 0, fretIndex: 1 },
    },
    {
      label: '纵向落 1 品：180 < y <= 280',
      stringCount: 6,
      scale: 1,
      offsetX: INTERACTIVE_GEOMETRY.leftPad,
      offsetY: 220,
      expected: { stringIndex: 0, fretIndex: 1 },
    },
    {
      label: '纵向落 2 品：280 < y <= 380',
      stringCount: 6,
      scale: 1,
      offsetX: INTERACTIVE_GEOMETRY.leftPad,
      offsetY: 320,
      expected: { stringIndex: 0, fretIndex: 2 },
    },
    {
      label: '纵向落 3 品：380 < y <= 480',
      stringCount: 6,
      scale: 1,
      offsetX: INTERACTIVE_GEOMETRY.leftPad,
      offsetY: 420,
      expected: { stringIndex: 0, fretIndex: 3 },
    },
    {
      label: '整体放大 2 倍后按缩放比等比反算第 1 弦 1 品',
      stringCount: 6,
      scale: 2,
      offsetX: INTERACTIVE_GEOMETRY.leftPad + INTERACTIVE_GEOMETRY.stringSpacing,
      offsetY: 230,
      expected: { stringIndex: 1, fretIndex: 1 },
    },
  ])('$label', ({ stringCount, scale, offsetX, offsetY, expected }) => {
    const res = calculateFretboardPoint({
      ...defaultParams,
      ...offsetToClient(offsetX, offsetY, scale),
      boardRect: boardRectFor(stringCount, scale),
      stringCount,
    });
    expect(res).not.toBeNull();
    expect(res?.stringIndex).toBe(expected.stringIndex);
    expect(res?.fretIndex).toBe(expected.fretIndex);
  });

  it('横向按最近弦四舍五入吸附：半弦距内归本弦，越过半弦距进位到下一弦', () => {
    const half = INTERACTIVE_GEOMETRY.stringSpacing / 2;
    const pointAt = (clientX: number) => calculateFretboardPoint({ ...defaultParams, clientX, clientY: 50 + 230 });

    for (let s = 0; s < 6; s++) {
      const stringX = 100 + INTERACTIVE_GEOMETRY.leftPad + s * INTERACTIVE_GEOMETRY.stringSpacing;
      // 尚未越过半弦距：四舍五入向下，仍落在本弦
      expect(pointAt(stringX + half - 1)?.stringIndex).toBe(s);
      // 越过半弦距：四舍五入向上进位；末弦进位即越界返回 null
      const past = pointAt(stringX + half + 1);
      if (s < 5) expect(past?.stringIndex).toBe(s + 1);
      else expect(past).toBeNull();
    }
  });

  it('横向超出有效弦范围时应返回 null', () => {
    // 过于靠左（小于第 0 弦半个弦距以上）—— 守住 stringIndex < 0 的左越界分支
    const leftOut = calculateFretboardPoint({
      ...defaultParams,
      clientX: 100 + INTERACTIVE_GEOMETRY.leftPad - INTERACTIVE_GEOMETRY.stringSpacing,
    });
    expect(leftOut).toBeNull();

    // 过于靠右（超过第 5 弦半个弦距以上）
    const rightOut = calculateFretboardPoint({
      ...defaultParams,
      clientX: 100 + INTERACTIVE_GEOMETRY.leftPad + 6 * INTERACTIVE_GEOMETRY.stringSpacing,
    });
    expect(rightOut).toBeNull();
  });

  it('点击顶部和弦名区域时不应触发交互 (返回 null)', () => {
    const inChordNameZone = calculateFretboardPoint({
      ...defaultParams,
      clientY: 50 + 50, // y = 50 < chordNameZoneHeight (100)
    });
    expect(inChordNameZone).toBeNull();
  });

  it('点击空弦区域时应返回 0 品 (fretIndex = 0)', () => {
    const inOpenStringZone = calculateFretboardPoint({
      ...defaultParams,
      clientY: 50 + 140, // 100 <= y <= 180
    });
    expect(inOpenStringZone).not.toBeNull();
    expect(inOpenStringZone?.fretIndex).toBe(0);
  });

  it('纵向超出最大品数时应返回 null', () => {
    // 超过 3 品 (y > 480)
    const outOfFrets = calculateFretboardPoint({
      ...defaultParams,
      fretCount: 3,
      clientY: 50 + 490,
    });
    expect(outOfFrets).toBeNull();
  });

  it('boardRect 尺寸为 0 时安全防御返回 null', () => {
    const zeroWidth = calculateFretboardPoint({
      ...defaultParams,
      boardRect: { ...defaultBoardRect, width: 0 },
    });
    expect(zeroWidth).toBeNull();

    const zeroHeight = calculateFretboardPoint({
      ...defaultParams,
      boardRect: { ...defaultBoardRect, height: 0 },
    });
    expect(zeroHeight).toBeNull();
  });

  /** 多弦用例：末弦可命中，越过末弦一律封顶为 null（杜绝超出弦数的幽灵弦） */
  it.each([
    { label: '4 弦乐器（如尤克里里/贝斯）：末弦 index 3', stringCount: 4 },
    { label: '7 弦重型吉他：末弦 index 6（第 7 根琴弦）', stringCount: 7 },
  ])('$label', ({ stringCount }) => {
    const lastIndex = stringCount - 1;
    const boardRect = boardRectFor(stringCount, 1);
    const atOffsetX = (offsetX: number) =>
      calculateFretboardPoint({
        ...defaultParams,
        ...offsetToClient(offsetX, 230, 1),
        boardRect,
        stringCount,
      });

    // 命中末弦
    const res = atOffsetX(INTERACTIVE_GEOMETRY.leftPad + lastIndex * INTERACTIVE_GEOMETRY.stringSpacing);
    expect(res?.stringIndex).toBe(lastIndex);
    expect(res?.fretIndex).toBe(1);

    // 越过末弦（点击再下一根弦的位置）应越界返回 null
    expect(atOffsetX(INTERACTIVE_GEOMETRY.leftPad + stringCount * INTERACTIVE_GEOMETRY.stringSpacing)).toBeNull();
  });
});
