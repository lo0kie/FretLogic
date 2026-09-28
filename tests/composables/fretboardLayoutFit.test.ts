/**
 * `useFretboardLayout` 的**贴合缩放**回归测试（工作台窄屏适配的几何侧）。
 *
 * 被测契约只有一条：`realScaledWidth === min(整图自然宽, 可用宽度)`，且缩放对整张图
 * **宽高同乘一个因子**（只压宽度会把图撑胖）。可用宽度缺省 / 非正数一律视为「不缩」——
 * 宿主在首帧还没量到宽度时会传 0，把它当成可用宽度会把整张图缩没。
 *
 * 自然宽不写死：它是「几何给出的板宽 × 按品数那一档」，两个因子都是源码里的单一来源，
 * 写死数字等于把 FRETBOARD_SCALE_MAP 与基准几何各抄一份到断言里。
 */
import { ref } from 'vue';

import { describe, expect, it } from 'vitest';

import { useFretboardLayout } from '@/domains/fretboard/composables/useFretboardLayout';
import { fretboardScaleOf } from '@/domains/fretboard/constants';
import { INTERACTIVE_GEOMETRY } from '@/domains/fretboard/model/interactiveGeometry';

const STRING_COUNT = 6;

/** 未做贴合缩放时整张图的宽度（= 板宽 × 按品数那一档） */
const naturalWidth = (fretCount: number): number =>
  INTERACTIVE_GEOMETRY.boardWidth(STRING_COUNT) * fretboardScaleOf(fretCount);

describe('useFretboardLayout 贴合可用宽度', () => {
  it('装不下时缩到可用宽度，且宽高同乘一个因子', () => {
    const fretCount = 3;
    const available = naturalWidth(fretCount) / 2;
    const layout = useFretboardLayout(fretCount, { stringCount: STRING_COUNT, fitWidth: available });

    expect(layout.realScaledWidth.value).toBeCloseTo(available, 6);
    // 纵向必须是同一个因子：只压宽度会让图变胖（留白不动、网格被压扁）
    expect(layout.realScaledHeight.value).toBeCloseTo(layout.rawHeight.value * layout.fretboardScale.value, 6);
    expect(layout.fretboardScale.value).toBeCloseTo(fretboardScaleOf(fretCount) / 2, 6);
  });

  it('装得下时按品数档位原样 —— 只缩不放，不放大到填满', () => {
    const fretCount = 3;
    const layout = useFretboardLayout(fretCount, {
      stringCount: STRING_COUNT,
      fitWidth: naturalWidth(fretCount) * 3,
    });

    expect(layout.fretboardScale.value).toBeCloseTo(fretboardScaleOf(fretCount), 6);
    expect(layout.realScaledWidth.value).toBeCloseTo(naturalWidth(fretCount), 6);
  });

  it('缺省 / 0 / 负数一律视为不缩（宿主首帧还没量到宽度）', () => {
    for (const fitWidth of [undefined, 0, -1]) {
      const layout = useFretboardLayout(3, { stringCount: STRING_COUNT, fitWidth });
      expect(layout.realScaledWidth.value).toBeCloseTo(naturalWidth(3), 6);
    }
  });

  it('可用宽度落在两档之间：装得下的走档位、装不下的收到可用宽度', () => {
    // 取相邻两档自然宽的中点，保证这一次循环里两条分支都跑到；不写死数字，
    // 几何或档位表一调，中点仍落在两档之间
    const available = (naturalWidth(4) + naturalWidth(5)) / 2;
    for (const fretCount of [3, 4, 5] as const) {
      const layout = useFretboardLayout(fretCount, { stringCount: STRING_COUNT, fitWidth: available });
      expect(layout.realScaledWidth.value).toBeCloseTo(Math.min(naturalWidth(fretCount), available), 6);
    }
  });

  it('可用宽度变化时跟着重算（宿主 resize 的路径）', () => {
    const available = ref(naturalWidth(3) * 2);
    const layout = useFretboardLayout(3, { stringCount: STRING_COUNT, fitWidth: available });

    expect(layout.realScaledWidth.value).toBeCloseTo(naturalWidth(3), 6);
    available.value = 300;
    expect(layout.realScaledWidth.value).toBeCloseTo(300, 6);
  });
});
