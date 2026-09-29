/**
 * 浮动横按气泡的「激活目标」判定 —— 同品两条互不相邻横按（`11x11x`）之间的认领边界。
 *
 * 背景：`DisplayBarre.key` 只编码品位与该品第几条（见 computeDisplayBarres），序号是**压紧**的 ——
 * 同品靠左那条一旦消失，靠右那条的 key 就前移顶上（`barre-fret-1-1` → `barre-fret-1`），与气泡记着的
 * 「上一条」撞车。只比 key 的话，气泡会把另一条横按认成「同一条还在」，平移到它上方、再随延迟隐藏消失
 * （点掉左侧的 11 之后气泡跑到右侧的 11 上去）。
 *
 * 三条用例各守一侧，互不可替代：① 不同条之间**不得**被认领（bug 本体）；② 同一条的生长**必须**仍被延续
 * （防把校验写成「只认跨度完全相等」而切断形态延展）；③ 指针真的移到另一条上时必须改锚（防把校验写成
 * 「同品只认第一次那条」）。
 */
import { computed, defineComponent, nextTick, ref } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import { computeDisplayBarres } from '@/domains/fretboard/components/FretboardSvg.logic';
import { useBarreBubble } from '@/domains/fretboard/composables/useBarreBubble';

import type { DisplayBarre } from '@/domains/fretboard/components/FretboardSvg.logic';
import type { GuitarStringsModel } from '@/domains/fretboard/types';
import type { ComputedRef, Ref } from 'vue';

/** 六弦横坐标（索引 0 = 最低音粗弦，与指板同向落在最左侧），等距 20px 便于口算跨度中心 */
const STRING_X = [0, 20, 40, 60, 80, 100];
const FRET_H = 30;
const FRET_COUNT = 5;

/** 按弦序构造六弦模型（全部不偏好降号） */
const stringsOf = (...frets: number[]): GuitarStringsModel => frets.map(fret => ({ fret, preferFlat: false }));

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

    // 夹具自检：1 品确实拆成 0-1 与 3-4 两段，且左段占的是「该品第 0 条」这个会被顶替的 key
    expect(displayBarres.value.map(b => [b.key, b.fromString, b.toString])).toEqual([
      ['barre-fret-1', 0, 1],
      ['barre-fret-1-1', 3, 4],
    ]);

    api.handleBarreMouseEnter(displayBarres.value[0]!);
    await nextTick();
    expect(api.bubbleItems.value[0]?.geometry.centerX).toBe(10); // (0 + 20) / 2
    expect(api.bubbleItems.value[0]?.visible).toBe(true);

    // 点掉左段第 0 弦的音符：左段只剩一个音、不再构成横按，右段升为该品第 0 条
    strings.value = stringsOf(-1, 1, -1, 1, 1, -1);
    await nextTick();

    expect(displayBarres.value.map(b => b.key)).toEqual(['barre-fret-1']);

    // 气泡锚点必须留在左段原位，而不是跟着被顶替的 key 跳到右段中心（60 + 80) / 2 = 70
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
});
