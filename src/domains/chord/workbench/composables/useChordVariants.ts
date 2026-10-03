import { computed } from 'vue';

import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { getChordName } from '@/domains/chord/theory/theory';

import type { Chord } from '@/domains/chord/types';

/**
 * 当前草稿和弦在同一分组内的多指法变体。
 *
 * 为什么抽成 composable：有两个消费方，且必须共用同一份判定——
 * - 变体面板渲染卡片列表；
 * - 工作台折叠头的 description 显示「共 N 个」总数。
 * 列表是横向滚动的，边缘渐隐（BaseScrollArea 的 fade）提示很弱：变体数只比可视区宽一点点时
 * 渐隐几乎看不出来，用户会以为「就这么多」而漏看后面的变体。标题上给出总数即可消除这个误判。
 * 若两处各写一份判定，标题数与实际卡片数会随时间漂移。
 *
 * 严格限定在当前分组内查找，不跨分组混入同名指法；且仅当草稿是库中已保存的和弦
 * （有 id + groupId）时才查找——手动在指板按出的同名指法不得借 selectedGroupId 回退关联
 * 库中和弦，否则变体会被加载并可在点击时覆盖手动输入。
 */
export const useChordVariants = () => {
  const editorStore = useChordEditorStore();
  const chordStore = useChordStore();

  const chordName = computed(() => getChordName(editorStore.draftChord).trim());

  const variants = computed<Chord[]>(() => {
    const chord = editorStore.draftChord;
    if (!chord.id || !chord.groupId) return [];

    // 分组用的名字取**库中该实体**的，不取草稿的当前名：多指法分组是按库里的名字建的，而改名是
    // 尚未保存的编辑 —— 用草稿的新名字去查，新名字在库里必然还没有同名伙伴，列表于是整段消失
    // （每敲一个字消失一次）。id 在改名前后不变，是同一个实体的稳定身份。
    //
    // 库中查不到才回落到草稿自己的名字：「另存为新和弦」的草稿带着一个尚未入库的新 id，那种情形
    // 下按名字找同名指法正是原行为，不该被这次修复一并改掉。
    const saved = chordStore.chordsLookupMap.get(chord.id);
    const name = getChordName(saved ?? chord).trim();
    if (!name) return [];

    const grouped = chordStore.getMultiFingering(chord.groupId, name);
    return grouped?.variants ?? [];
  });

  /** 只有 1 个（或 0 个）变体时没有「还有更多」的问题，列表本身也不渲染 */
  const hasVariants = computed(() => variants.value.length > 1);

  return { chordName, variants, hasVariants };
};
