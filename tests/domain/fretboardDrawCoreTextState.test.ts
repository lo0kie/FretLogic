import { describe, expect, it } from 'vitest';

import { drawMeasuredChordName } from '@/domains/fretboard/fretboardDrawCore';

import type { MeasuredChordToken } from '@/domains/fretboard/fretboardDrawCore';

/**
 * 和弦名层的**基线契约**：本层按「传入的 baselineY 就是基线」绘制（= `alphabetic`），
 * 而 canvas 的 `textBaseline` 是**跨调用存活**的画布级状态 —— 上游若把它留在别的值上
 * （排列区的行号用 `'middle'` 居中），名字就会整体下移半个字高，并且只在「画布尺寸没变、
 * 只是重绘」时暴露：改 `canvas.width` 会把画布状态一并重置，名字又自己回到正确位置，
 * 表现为「拖动后正常、鼠标一动就错位」。
 *
 * 故本层必须**自己**把基线声明清楚，不依赖任何环境状态 —— 本用例锁的就是这一条。
 */
const makeCtx = (textBaseline: CanvasTextBaseline) => {
  const drawn: { text: string; x: number; y: number }[] = [];
  const ctx = {
    textBaseline,
    textAlign: 'start' as CanvasTextAlign,
    font: '',
    fillStyle: '',
    fillText(text: string, x: number, y: number) {
      drawn.push({ text, x, y });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, drawn };
};

const token = (text: string, width: number): MeasuredChordToken => ({
  text,
  isAccidental: false,
  width,
  font: 'bold 14px system-ui',
});

describe('drawMeasuredChordName 的基线契约', () => {
  it('上游把 textBaseline 留在 middle 时，本层仍显式回到 alphabetic', () => {
    const { ctx } = makeCtx('middle');

    drawMeasuredChordName(ctx, 100, 20, [token('C', 10)], 0, '#000');

    expect(ctx.textBaseline).toBe('alphabetic');
  });

  it('按各分片宽度整体居中于 centerX，纵坐标取传入的基线', () => {
    const { ctx, drawn } = makeCtx('alphabetic');

    // 两片总宽 30，centerX = 100 ⇒ 首片左沿 85、次片左沿 97（逐片累加，不重算居中）
    drawMeasuredChordName(ctx, 100, 20, [token('C', 12), token('m7', 18)], -4, '#000');

    expect(drawn.map(d => [d.text, d.x, d.y])).toEqual([
      ['C', 85, 20],
      ['m7', 97, 20],
    ]);
  });
});
