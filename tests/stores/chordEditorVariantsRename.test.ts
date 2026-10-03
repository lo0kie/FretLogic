// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { toChordId } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import { useChordVariants } from '@/domains/chord/workbench/composables/useChordVariants';

import type { Chord, GroupId } from '@/domains/chord/types';

/** 夹具：指定分组下的一个 C 和弦，按给定各弦品位造出不同指法 */
const makeChord = (groupId: GroupId, id: string, frets: number[]): Chord => ({
  id: toChordId(id),
  groupId,
  nameSegments: nameToSegments('C'),
  strings: frets.map(fret => ({ fret, preferFlat: false })),
  fretCount: 4,
  fretOffset: 0,
  tuning: Tuning.STANDARD,
  rootStringIndex: 1,
  createdAt: 100,
  updatedAt: 100,
});

const idsOf = (chords: Chord[]): string[] => chords.map(c => c.id).sort();

/**
 * 多指法分组的名字必须取**库中该实体**的，而不是草稿被改后的名字。
 *
 * 分组索引（`buildMultiFingeringData`）是按库里的和弦名建的，而改名是尚未保存的编辑 —— 拿草稿
 * 的新名字去查，新名字在库里必然还没有同名伙伴，变体列表会在用户打字的过程中整段消失
 * （工作台右侧的指法面板变成空状态，折叠头的「共 N 个」也一起归零）。
 *
 * 这条判据此前没有任何机制在守：两处同源实现（`useChordVariants` 与 `chordEditorStore` 的
 * `currentMultiFingering`）都取了草稿名，改错了不报错、只是看起来不对。
 */
describe('多指法变体按库中实体的名字查', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('草稿改名后变体列表不消失（两处同源判定都不消失）', () => {
    const chordStore = useChordStore();
    const editorStore = useChordEditorStore();
    const group = chordStore.addGroup('分组');
    const a = makeChord(group.id, 'c_a', [-1, 3, 2, 0, 1, 0]);
    const b = makeChord(group.id, 'c_b', [-1, 3, 2, 0, 1, 3]);
    chordStore.savedChordsList = [a, b];

    editorStore.setEditor(a);
    const { variants, hasVariants } = useChordVariants();
    // 前提：这两个同名指法确实构成一个多指法组（否则下面的断言会在错误的前提下变绿）
    expect(hasVariants.value).toBe(true);
    expect(idsOf(variants.value)).toEqual(idsOf([a, b]));

    // 改名：草稿的名字换成 D，但库里那两条仍是 C
    editorStore.draftChord.nameSegments = nameToSegments('D');

    expect(idsOf(variants.value)).toEqual(idsOf([a, b]));
    // setup store 的 getter 已被 pinia 解包，故这里不取 .value
    expect(idsOf(editorStore.currentMultiFingeringChords)).toEqual(idsOf([a, b]));
  });
});
