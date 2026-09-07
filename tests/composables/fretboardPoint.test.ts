import { describe, expect, it } from 'vitest';

import { calculateFretboardPoint } from '@/domains/fretboard/composables/useFretboardLayout';
import { CANVAS_CONFIG } from '@/domains/fretboard/constants';

import type { FretboardPointCalculationParams } from '@/domains/fretboard/composables/useFretboardLayout';

describe('calculateFretboardPoint', () => {
  const defaultBoardRect = {
    left: 100,
    top: 50,
    width: CANVAS_CONFIG.BOARD_WIDTH, // 1:1 缩放
    height: 500,
  };

  const defaultParams: FretboardPointCalculationParams = {
    clientX: 100 + CANVAS_CONFIG.OFFSET_X_LEFT, // 恰好在第 0 弦
    clientY: 50 + 200,
    boardRect: defaultBoardRect,
    rawHeight: 500,
    contentTopOffset: 180, // 和弦名区 100 + 空弦区 80
    chordNameZoneHeight: 100,
    fretCount: 3,
  };

  it('有效坐标应正确反算第 0 弦及对应品位', () => {
    // 弦 0，y 刚好在 1 品中心 (180 + 50 = 230)
    const res = calculateFretboardPoint({
      ...defaultParams,
      clientX: 100 + CANVAS_CONFIG.OFFSET_X_LEFT,
      clientY: 50 + 230,
    });
    expect(res).not.toBeNull();
    expect(res?.stringIndex).toBe(0);
    expect(res?.fretIndex).toBe(1);
  });

  it('能够正确计算所有 6 根弦的索引并实现就近四舍五入吸附', () => {
    for (let s = 0; s < 6; s++) {
      const stringX = 100 + CANVAS_CONFIG.OFFSET_X_LEFT + s * CANVAS_CONFIG.STRING_SPACING;
      // 稍微偏右 5px 仍能吸附到当前弦
      const res = calculateFretboardPoint({
        ...defaultParams,
        clientX: stringX + 5,
        clientY: 50 + 230,
      });
      expect(res?.stringIndex).toBe(s);
    }
  });

  it('横向超出有效弦范围时应返回 null', () => {
    // 过于靠左（小于第 0 弦半个弦距以上）
    const leftOut = calculateFretboardPoint({
      ...defaultParams,
      clientX: 100 + CANVAS_CONFIG.OFFSET_X_LEFT - CANVAS_CONFIG.STRING_SPACING,
    });
    expect(leftOut).toBeNull();

    // 过于靠右（超过第 5 弦半个弦距以上）
    const rightOut = calculateFretboardPoint({
      ...defaultParams,
      clientX: 100 + CANVAS_CONFIG.OFFSET_X_LEFT + 6 * CANVAS_CONFIG.STRING_SPACING,
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

  it('纵向品格索引根据品高正确划分', () => {
    // 品高 100，contentTopOffset = 180
    // 1 品：180 < y <= 280
    const fret1 = calculateFretboardPoint({
      ...defaultParams,
      clientY: 50 + 220,
    });
    expect(fret1?.fretIndex).toBe(1);

    // 2 品：280 < y <= 380
    const fret2 = calculateFretboardPoint({
      ...defaultParams,
      clientY: 50 + 320,
    });
    expect(fret2?.fretIndex).toBe(2);

    // 3 品：380 < y <= 480
    const fret3 = calculateFretboardPoint({
      ...defaultParams,
      clientY: 50 + 420,
    });
    expect(fret3?.fretIndex).toBe(3);
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

  it('支持缩放场景下的坐标等比反算', () => {
    // 整体放大 2 倍
    const scaledBoardRect = {
      left: 100,
      top: 50,
      width: CANVAS_CONFIG.BOARD_WIDTH * 2,
      height: 500 * 2,
    };
    const res = calculateFretboardPoint({
      ...defaultParams,
      boardRect: scaledBoardRect,
      // 客户端坐标相应乘以 2 后的偏移
      clientX: 100 + (CANVAS_CONFIG.OFFSET_X_LEFT + CANVAS_CONFIG.STRING_SPACING) * 2,
      clientY: 50 + 230 * 2,
    });
    expect(res?.stringIndex).toBe(1);
    expect(res?.fretIndex).toBe(1);
  });

  it('支持 4 弦乐器（如尤克里里/贝斯）的坐标反算与边界防御', () => {
    const stringCount = 4;
    const boardWidth =
      CANVAS_CONFIG.OFFSET_X_LEFT + (stringCount - 1) * CANVAS_CONFIG.STRING_SPACING + CANVAS_CONFIG.OFFSET_X_LEFT;
    const boardRect = { left: 100, top: 50, width: boardWidth, height: 500 };

    // 命中第 3 弦（最后一根弦）
    const lastStringX = 100 + CANVAS_CONFIG.OFFSET_X_LEFT + 3 * CANVAS_CONFIG.STRING_SPACING;
    const res = calculateFretboardPoint({
      ...defaultParams,
      boardRect,
      stringCount,
      clientX: lastStringX,
      clientY: 50 + 230,
    });
    expect(res?.stringIndex).toBe(3);

    // 超过第 3 弦（点击原本 6 弦吉他第 4 弦位置）应越界返回 null
    const outStringX = 100 + CANVAS_CONFIG.OFFSET_X_LEFT + 4 * CANVAS_CONFIG.STRING_SPACING;
    const outRes = calculateFretboardPoint({
      ...defaultParams,
      boardRect,
      stringCount,
      clientX: outStringX,
      clientY: 50 + 230,
    });
    expect(outRes).toBeNull();
  });

  it('支持 7 弦重型吉他的第 6 弦（第 7 根琴弦）坐标反算', () => {
    const stringCount = 7;
    const boardWidth =
      CANVAS_CONFIG.OFFSET_X_LEFT + (stringCount - 1) * CANVAS_CONFIG.STRING_SPACING + CANVAS_CONFIG.OFFSET_X_LEFT;
    const boardRect = { left: 100, top: 50, width: boardWidth, height: 500 };

    // 命中第 6 弦（第 7 根琴弦）
    const seventhStringX = 100 + CANVAS_CONFIG.OFFSET_X_LEFT + 6 * CANVAS_CONFIG.STRING_SPACING;
    const res = calculateFretboardPoint({
      ...defaultParams,
      boardRect,
      stringCount,
      clientX: seventhStringX,
      clientY: 50 + 230,
    });
    expect(res?.stringIndex).toBe(6);
    expect(res?.fretIndex).toBe(1);
  });
});
