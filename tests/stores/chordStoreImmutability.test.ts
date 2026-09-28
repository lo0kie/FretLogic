// @vitest-environment jsdom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useChordStore } from '@/domains/chord/store/chordStore';
import { toChordId } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';

import type { Chord, GroupId } from '@/domains/chord/types';

/** 夹具：一个位于指定分组的 C 和弦 */
const makeChordC = (groupId: GroupId): Chord => ({
  id: toChordId('c_c'),
  groupId,
  nameSegments: nameToSegments('C'),
  strings: [
    { fret: -1, preferFlat: false },
    { fret: 3, preferFlat: false },
    { fret: 2, preferFlat: false },
    { fret: 0, preferFlat: false },
    { fret: 1, preferFlat: false },
    { fret: 0, preferFlat: false },
  ],
  fretCount: 4,
  fretOffset: 0,
  tuning: Tuning.STANDARD,
  rootStringIndex: 1,
  createdAt: 100,
  updatedAt: 100,
});

/**
 * 和弦变更必须走**不可变替换**：`chordRepository.save` 的写回 diff 以**引用相等**判变更，
 * `chordStore` 的快照与持久化 watch 同样是浅比较 —— 任何一处原地改（`chord.groupId = …`
 * 这类），都会让那次编辑**静默不落盘**，表现为重开应用后改动消失。
 *
 * 这条约定此前只写在两处注释里（`chordRepository` 的写回 diff、`chordStore` 孤儿收容的
 * 「原地改不会触发快照提交与落盘」），**没有任何机制在守**。本用例是它的锚点：挑一条
 * **会派生新对象**的变更路径（`moveVariantsByName` 要重写 `groupId`），断言旧引用未被就地修改。
 *
 * 刻意**不**拿 `updateChord` 当锚点：它由调用方传入新对象、只替换槽位，原地改与不可变改在它
 * 身上不可区分，测它等于同义反复（见 `rules/06` 的「一」）。
 */
describe('和弦变更的不可变替换约定', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('moveVariantsByName 以新对象替换：旧引用保持原分组，且不再出现在列表里', () => {
    const store = useChordStore();
    const source = store.addGroup('源分组');
    const target = store.addGroup('目标分组');
    const before = makeChordC(source.id);
    store.savedChordsList = [before];
    // 深拷贝一份基线：若实现改成原地改（`before.groupId = …`），下面的比对会变红
    const baseline = JSON.parse(JSON.stringify(before)) as Chord;

    store.moveVariantsByName(source.id, 'C', target.id);

    // ① 旧对象未被就地修改
    expect(before).toEqual(baseline);
    expect(before.groupId).toBe(source.id);
    // ② 列表里已是另一个对象，且分组已改（引用相等 ⇔ 内容相等，写回 diff 才看得见这次变更）
    const after = store.savedChordsList.find(c => c.id === before.id);
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
    expect(after!.groupId).toBe(target.id);
  });
});
