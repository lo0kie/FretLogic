/**
 * 横按的段身份（DisplayBarre.key）与浮动气泡的「激活目标」判定。
 *
 * key 方案：`barre-fret-{品位}-{段右端弦}`（见 computeDisplayBarres）——同品的横按段互不相交，
 * 右端弦在同品内唯一，key 即段的身份：同品相邻段的存亡互不顶替彼此的 key。旧版按「同品第几条」
 * 压紧编号，左段消失后右段顶替其 key，Vue keyed diff 复用左段 DOM 节点、transition-all 把右段
 * 从左段几何动画滑过去（11x111 点掉左段一个音，右侧横按无故动画），气泡也随之误锚。
 *
 * 用例各守一侧，互不可替代：① 右段 key 在左段消失后**不得**变化、气泡不得改锚（bug 本体）；
 * ② 同一条的生长**必须**仍被延续（防把校验写成「只认跨度完全相等」而切断形态延展）；③ 指针真的
 * 移到另一条上时必须改锚（防把校验写成「同品只认第一次那条」）；④ 同品同右端的子跨度并存时
 * key 必须消歧。
 */
import { computed, defineComponent, nextTick, ref } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import {
  computeDisplayBarres,
  findContinuedBarre,
  resolveBarreEnterOrigin,
  resolveBarreExitOrigin,
} from '@/domains/fretboard/components/FretboardSvg.logic';
import { useBarreBubble } from '@/domains/fretboard/composables/useBarreBubble';

import type { DisplayBarre } from '@/domains/fretboard/components/FretboardSvg.logic';
import type { BarreEntity, BarreFret, GuitarStringsModel } from '@/domains/fretboard/types';
import type { ComputedRef, Ref } from 'vue';

/** 六弦横坐标（索引 0 = 最低音粗弦，与指板同向落在最左侧），等距 20px 便于口算跨度中心 */
const STRING_X = [0, 20, 40, 60, 80, 100];
const FRET_H = 30;
const FRET_COUNT = 5;

/** 按弦序构造六弦模型（全部不偏好降号） */
const stringsOf = (...frets: number[]): GuitarStringsModel => frets.map(fret => ({ fret, preferFlat: false }));

/** 夹具窄化：横按品位是 branded BarreFret，按 tests/utils/barre.test.ts 的形态集中转换 */
const barre = (fret: number, fromString: number, toString: number): BarreEntity => ({
  fret: fret as BarreFret,
  fromString,
  toString,
});

interface BubbleHarness {
  api: ReturnType<typeof useBarreBubble>;
  displayBarres: ComputedRef<DisplayBarre[]>;
}

/** 挂一块只驱动气泡状态机的宿主：指板几何、悬停落点、展示用横按全部由用例喂 */
const mountBubble = (
  strings: Ref<GuitarStringsModel>,
  hoverPoint: Ref<{ stringIndex: number; fretIndex: number } | null>
): BubbleHarness => {
  const displayBarres = computed(() => computeDisplayBarres(strings.value, [], FRET_COUNT));
  let api!: ReturnType<typeof useBarreBubble>;

  mount(
    defineComponent({
      setup() {
        api = useBarreBubble({
          displayBarres,
          stringXPositions: () => STRING_X,
          stringCount: () => strings.value.length,
          fretLineY: fretIndex => fretIndex * FRET_H,
          hoverPoint: () => hoverPoint.value,
          onToggleBarre: () => {},
        });
        return () => null;
      },
    })
  );

  return { api, displayBarres };
};

describe('横按气泡的激活目标：跨条与跨度的认领边界', () => {
  it('同品两段横按：点掉左段一个音后，气泡不得改锚到右段', async () => {
    const strings = ref(stringsOf(1, 1, -1, 1, 1, -1));
    const hoverPoint = ref<{ stringIndex: number; fretIndex: number } | null>({ stringIndex: 0, fretIndex: 1 });
    const { api, displayBarres } = mountBubble(strings, hoverPoint);

    // 夹具自检：1 品确实拆成 0-1 与 3-4 两段，key 按段右端弦编码、互不依赖对方存亡
    expect(displayBarres.value.map(b => [b.key, b.fromString, b.toString])).toEqual([
      ['barre-fret-1-1', 0, 1],
      ['barre-fret-1-4', 3, 4],
    ]);

    api.handleBarreMouseEnter(displayBarres.value[0]!);
    await nextTick();
    expect(api.bubbleItems.value[0]?.geometry.centerX).toBe(10); // (0 + 20) / 2
    expect(api.bubbleItems.value[0]?.visible).toBe(true);

    // 点掉左段第 0 弦的音符：左段只剩一个音、不再构成横按。
    // 回归锚点（bug 本体）：旧压紧序号方案里右段会顶替成 barre-fret-1、复用左段 DOM 节点，
    // transition-all 让右段从左段几何动画滑过去（感知为「右侧横按无故动画」）
    strings.value = stringsOf(-1, 1, -1, 1, 1, -1);
    await nextTick();

    expect(displayBarres.value.map(b => b.key)).toEqual(['barre-fret-1-4']);

    // 气泡锚点必须留在左段原位淡出，而不是跳到右段中心（60 + 80) / 2 = 70
    expect(api.bubbleItems.value[0]?.geometry.centerX).toBe(10);
    expect(api.bubbleItems.value[0]?.visible).toBe(false);
  });

  it('同一条横按跨度生长时气泡仍随其延续', async () => {
    const strings = ref(stringsOf(1, 1, -1, -1, -1, -1));
    const hoverPoint = ref<{ stringIndex: number; fretIndex: number } | null>({ stringIndex: 0, fretIndex: 1 });
    const { api, displayBarres } = mountBubble(strings, hoverPoint);

    api.handleBarreMouseEnter(displayBarres.value[0]!);
    await nextTick();
    expect(api.bubbleItems.value[0]?.geometry.centerX).toBe(10);

    // 弦 2 补上同品音：跨度 0-1 长到 0-2，key 不变，气泡应跟着新跨度的中心走
    strings.value = stringsOf(1, 1, 1, -1, -1, -1);
    await nextTick();

    expect(api.bubbleItems.value[0]?.geometry.centerX).toBe(20); // (0 + 40) / 2
    expect(api.bubbleItems.value[0]?.visible).toBe(true);
  });

  it('指针移到同品另一段上时气泡改锚到那一段', async () => {
    const strings = ref(stringsOf(1, 1, -1, 1, 1, -1));
    const hoverPoint = ref<{ stringIndex: number; fretIndex: number } | null>({ stringIndex: 0, fretIndex: 1 });
    const { api, displayBarres } = mountBubble(strings, hoverPoint);

    api.handleBarreMouseEnter(displayBarres.value[0]!);
    await nextTick();
    expect(api.bubbleItems.value[0]?.geometry.centerX).toBe(10);

    // 悬停落点（唯一由指针驱动的量）移到右段，激活目标随 `syncBarreHover` 一并改锚
    hoverPoint.value = { stringIndex: 3, fretIndex: 1 };
    await nextTick();

    expect(api.bubbleItems.value[0]?.geometry.centerX).toBe(70); // (60 + 80) / 2
    expect(api.bubbleItems.value[0]?.visible).toBe(true);
  });

  it('同品同右端的子跨度并存时 key 追加 fromString 消歧', () => {
    // 标记 [4,5] 是候选 [3,5] 的子跨度（两端均在 1 品、跨度内无更低品位）——右端弦相同，
    // 仅按右端弦编码会撞 key（Vue 会告警 duplicate key 且节点复用错乱），追加 fromString 消歧
    const strings = ref(stringsOf(-1, -1, -1, 1, 1, 1));
    const marked = [barre(1, 4, 5)];
    const display = computeDisplayBarres(strings.value, marked, FRET_COUNT);

    expect(display.map(b => [b.key, b.fromString, b.toString, b.isMarked])).toEqual([
      ['barre-fret-1-5-3', 3, 5, false],
      ['barre-fret-1-5-4', 4, 5, true],
    ]);
  });
});

describe('横按入场 / 退场锚点：展开方向由既有音符端决定', () => {
  it('入场：两端都已有音符（1x1 点中间补成 111）→ 从中点向两边展开', () => {
    const prev = stringsOf(1, -1, 1);
    expect(resolveBarreEnterOrigin(prev, barre(1, 0, 2))).toBe('center center');
  });

  it('入场：仅 from 端已有音符（1 → 11）→ 从左向右展开', () => {
    const prev = stringsOf(1, -1, -1);
    expect(resolveBarreEnterOrigin(prev, barre(1, 0, 1))).toBe('left center');
  });

  it('入场：仅 to 端已有音符（x1 → x11）→ 从右向左展开', () => {
    const prev = stringsOf(-1, 1, -1);
    expect(resolveBarreEnterOrigin(prev, barre(1, 0, 1))).toBe('right center');
  });

  it('入场：两端都是新放的（首帧挂载）→ 退回默认左起', () => {
    expect(resolveBarreEnterOrigin(stringsOf(-1, -1, -1), barre(1, 0, 2))).toBe('left center');
  });

  it('退场：两端音符仍在（111 → 1x1，中点被移走破坏连贯性）→ 向中点收缩淡出', () => {
    const strings = stringsOf(1, -1, 1);
    expect(resolveBarreExitOrigin(strings, barre(1, 0, 2))).toBe('center center');
  });

  it('退场：仅 from 端音符还在（11 → 1x）→ 向左端收缩', () => {
    const strings = stringsOf(1, -1, -1);
    expect(resolveBarreExitOrigin(strings, barre(1, 0, 1))).toBe('left center');
  });

  it('退场：仅 to 端音符还在（11 → x1）→ 向右端收缩', () => {
    const strings = stringsOf(-1, 1, -1);
    expect(resolveBarreExitOrigin(strings, barre(1, 0, 1))).toBe('right center');
  });

  it('退场：两端音符都没了 → 原地淡出', () => {
    const strings = stringsOf(-1, -1, -1);
    expect(resolveBarreExitOrigin(strings, barre(1, 0, 2))).toBe('center center');
  });
});

describe('findContinuedBarre：段身份延续判定（右端弦变化的生长 / 收缩）', () => {
  /** 直接构造上一代展示横按（key 按新方案编码，仅延续判定用，格式不影响判定） */
  const displayOf = (fret: number, fromString: number, toString: number): DisplayBarre => ({
    ...barre(fret, fromString, toString),
    isMarked: false,
    key: `barre-fret-${fret}-${toString}`,
  });

  it('右端弦变化（0-1 → 0-2，向高音弦侧生长）识别为同一条的延续', () => {
    const prev = [displayOf(1, 0, 1)];
    expect(findContinuedBarre(prev, displayOf(1, 0, 2))).toEqual(prev[0]);
  });

  it('左端弦变化（2-4 → 1-4，向低音弦侧生长）同样识别为延续', () => {
    const prev = [displayOf(1, 2, 4)];
    expect(findContinuedBarre(prev, displayOf(1, 1, 4))).toEqual(prev[0]);
  });

  it('右缘收缩（0-2 → 0-1）识别为延续', () => {
    const prev = [displayOf(1, 0, 2)];
    expect(findContinuedBarre(prev, displayOf(1, 0, 1))).toEqual(prev[0]);
  });

  it('同品但不相交的段（另一条横按）不是延续', () => {
    const prev = [displayOf(1, 0, 1)];
    expect(findContinuedBarre(prev, displayOf(1, 3, 4))).toBeNull();
  });

  it('不同品位的横按不是延续', () => {
    const prev = [displayOf(1, 0, 1)];
    expect(findContinuedBarre(prev, displayOf(2, 0, 1))).toBeNull();
  });
});
