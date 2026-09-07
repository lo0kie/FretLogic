// src/stores/chordEditorStore.ts
import { computed, toRaw, watch } from 'vue';

import { useStorage } from '@vueuse/core';
import { defineStore } from 'pinia';

import { useChordStore } from '@/domains/chord/store/chordStore';
import { toChordId, toGroupId, toGuitarStringsModel } from '@/domains/chord/theory/entityFactories';
import { normalizeChord } from '@/domains/chord/theory/normalizeChord';
import {
  createString,
  DEFAULT_TUNING_MAPPING,
  getChordName,
  getDefaultTuningForStringCount,
  TUNING_PRESETS,
} from '@/domains/chord/theory/theory';
import { DEFAULT_FRET_COUNT } from '@/domains/fretboard/constants';
import {
  computeBarreCandidates,
  isBarreStillValid,
  normalizeAndMergeBarres,
} from '@/domains/fretboard/model/coordinates';
import { cloneDeep } from '@/platform/utils/common';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import type { BarreEntity, Chord, GuitarStringEntity, StringIndex } from '@/domains/chord/types';

/** 构造空白和弦草稿（指定弦数全部静音、匹配默认调弦、3 品窗口），作为编辑器初始态。 */
const createDefaultChord = (stringCount: number = 6): Chord => ({
  id: toChordId(''),
  nameSegments: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  strings: Array.from({ length: stringCount }, () => createString()),
  fretCount: DEFAULT_FRET_COUNT,
  fretOffset: 0,
  tuning: getDefaultTuningForStringCount(stringCount),
  groupId: toGroupId(''),
  rootStringIndex: null,
});

/**
 * 音符变化时精准修正既有横按：外侧锚点被移除则边界向内收缩，剩余范围的有效性
 * 统一复用 isBarreStillValid 判定（范围内出现静音弦/空弦/更低品位即废弃），
 * 保证与 normalizeChord 持久化校验语义一致。
 */
export const reconcileBarres = (
  newFrets: number[],
  oldFrets: number[] | undefined,
  oldBarres: BarreEntity[]
): BarreEntity[] | undefined => {
  const changed = new Set<number>();
  newFrets.forEach((fret, s) => {
    if (fret !== oldFrets?.[s]) changed.add(s);
  });

  if (changed.size === 0) return oldBarres;

  // 以新品位构造临时弦模型，供 isBarreStillValid 做统一校验
  const newStrings = toGuitarStringsModel(newFrets.map((f): [number, boolean] => [f, false]));

  const newBarres: BarreEntity[] = [];

  oldBarres.forEach(oldBarre => {
    let newFrom = oldBarre.fromString;
    let newTo = oldBarre.toString;

    // 智能边界收缩：如果横按最外侧的锚点音符被移除了，自动向内收缩边界
    while (newFrom <= newTo && (newFrets[newFrom] ?? -1) !== oldBarre.fret) {
      newFrom++;
    }
    while (newTo >= newFrom && (newFrets[newTo] ?? -1) !== oldBarre.fret) {
      newTo--;
    }

    // 收缩后为空（全部锚点消失）直接废弃
    if (newFrom > newTo) {
      return;
    }

    const reconciled: BarreEntity = {
      fret: oldBarre.fret,
      fromString: newFrom as StringIndex,
      toString: newTo as StringIndex,
      finger: oldBarre.finger,
    };
    if (isBarreStillValid(newStrings, reconciled)) {
      newBarres.push(reconciled);
    }
  });

  const merged = normalizeAndMergeBarres(newBarres, newStrings);

  const isSame =
    merged &&
    merged.length === oldBarres.length &&
    merged.every((nb, i) => {
      const ob = oldBarres[i];
      return ob && nb.fret === ob.fret && nb.fromString === ob.fromString && nb.toString === ob.toString;
    });

  if (isSame) return oldBarres;
  return merged;
};

/** 规范化草稿：复用统一的 normalizeChord 并在空白草稿时清理残留 C 分片 */ const normalizeDraftChord = (
  draft: Chord
): Chord => {
  const { chord } = normalizeChord(draft);
  if (!chord.id && Array.isArray(chord.strings) && chord.strings.every(s => Array.isArray(s) && s[0] < 0)) {
    if (
      chord.nameSegments &&
      chord.nameSegments.root?.[0] === 'C' &&
      chord.nameSegments.root?.[1] === 0 &&
      !chord.nameSegments.quality &&
      !chord.nameSegments.unknownQuality &&
      !chord.nameSegments.extensions &&
      !chord.nameSegments.bass
    ) {
      chord.nameSegments = null;
    }
  }
  return chord;
};

export const useChordEditorStore = defineStore('editor', () => {
  const chordStore = useChordStore();
  const draftChord = useStorage<Chord>(STORAGE_KEYS.EDITING_DRAFT, createDefaultChord(), localStorage);
  draftChord.value = normalizeDraftChord(draftChord.value);
  const isEditing = useStorage(STORAGE_KEYS.IS_EDITING, false);
  const isCreating = useStorage(STORAGE_KEYS.IS_CREATING, false);

  const autoBarre = useStorage(STORAGE_KEYS.AUTO_BARRE, true);

  const isFretBoardEmpty = computed(() => draftChord.value.strings.every(s => s[0] < 0));
  const activeBaseStrings = computed(() => TUNING_PRESETS[draftChord.value.tuning]?.mapping || DEFAULT_TUNING_MAPPING);

  /** 数据层兜底：主音绝不指向禁用的弦。
   *  任何写入路径（右键设根、设弦状态、缩品位、加载和弦等）只要把 rootStringIndex 落到
   *  静音弦（fret < 0）上，立刻清空。这样数据里永远不存在“禁用的弦=主音”的垃圾状态，
   *  渲染层只需做相等判断，无需再在视图里掩盖不一致。 */
  watch(
    () => [draftChord.value.rootStringIndex, draftChord.value.strings.map(s => s[0])] as const,
    () => {
      const idx = draftChord.value.rootStringIndex;
      if (idx !== null && (draftChord.value.strings[idx]?.[0] ?? -1) < 0) {
        draftChord.value.rootStringIndex = null;
      }
    },
    { deep: true }
  );

  /** 多指法：只查 chordStore，nameKey 规则不在这里重复 */
  const currentMultiFingering = computed(() => {
    const chord = draftChord.value;
    const name = getChordName(chord);
    if (!chord.id || !chord.groupId || !name) return null;
    return chordStore.getMultiFingering(chord.groupId, name);
  });

  const isMultiFingering = computed(() => currentMultiFingering.value?.hasVariants ?? false);
  const currentMultiFingeringChords = computed<Chord[]>(() => currentMultiFingering.value?.variants ?? []);
  const currentMultiFingeringIndex = computed(() => {
    if (!isMultiFingering.value) return 0;
    const index = currentMultiFingeringChords.value.findIndex(c => c.id === draftChord.value.id);
    return index >= 0 ? index : 0;
  });

  /** 切换到指定索引的多指法变体：将其实体克隆进草稿并切换为编辑态。 */
  const setMultiFingeringIndex = (index: number) => {
    const chord = currentMultiFingeringChords.value[index];
    if (!chord) return;
    draftChord.value = cloneDeep(toRaw(chord));
    isCreating.value = false;
    isEditing.value = true;
  };

  /** 设置指板可视品位数；缩小时静音越界音符，并联动清理失效的根音标记与横按。 */
  const setFretCount = (newVal: Chord['fretCount']) => {
    const oldVal = draftChord.value.fretCount;
    draftChord.value.fretCount = newVal;
    if (newVal < oldVal) {
      draftChord.value.strings.forEach(str => {
        if (str[0] > newVal) {
          str[0] = -1;
        }
      });
      // 根音所在弦被清除时，根标记一并失效
      if (
        draftChord.value.rootStringIndex !== null &&
        (draftChord.value.strings[draftChord.value.rootStringIndex]?.[0] ?? -1) < 0
      ) {
        draftChord.value.rootStringIndex = null;
      }
      // 缩品位时同步清理越界横按，保持数据自洽
      if (draftChord.value.barres) {
        const kept = draftChord.value.barres.filter(b => b.fret <= newVal);
        if (kept.length !== draftChord.value.barres.length) {
          draftChord.value.barres = kept.length > 0 ? kept : undefined;
        }
      }
    }
  };

  const stringCount = computed(() => draftChord.value.strings.length);

  /** 设置琴弦数量（3~10 弦，典型覆盖 4 弦尤克里里/贝斯、6 弦吉他、7/8 弦重金属） */
  const setStringCount = (targetCount: number) => {
    const count = Math.min(10, Math.max(3, Math.round(targetCount)));
    const current = draftChord.value.strings;
    if (current.length === count) return;

    let nextStrings: GuitarStringEntity[];
    if (count > current.length) {
      const added: GuitarStringEntity[] = Array.from({ length: count - current.length }, () => createString());
      nextStrings = [...current, ...added];
    } else {
      nextStrings = current.slice(0, count);
    }
    draftChord.value.strings = nextStrings;

    // 调弦方案自动联动：若当前调弦方案与新弦数不匹配，自动选用该弦数对应的默认调弦方案
    const currPreset = TUNING_PRESETS[draftChord.value.tuning];
    if (!currPreset || currPreset.stringCount !== count) {
      draftChord.value.tuning = getDefaultTuningForStringCount(count);
    }

    // 清理越界的根音标记
    if (draftChord.value.rootStringIndex !== null && draftChord.value.rootStringIndex >= count) {
      draftChord.value.rootStringIndex = null;
    }

    // 清理越界的横按配置
    if (draftChord.value.barres) {
      const kept = draftChord.value.barres.filter(b => b.fromString < count && b.toString < count);
      draftChord.value.barres = kept.length > 0 ? kept : undefined;
    }
  };

  /** 设置显式横按列表（undefined / 空数组表示清除横按标记）；不改变自动横按开关状态 */
  const setBarres = (barres: BarreEntity[] | undefined) => {
    if (!barres || barres.length === 0) {
      if (draftChord.value.barres !== undefined) draftChord.value.barres = undefined;
      return;
    }
    draftChord.value.barres = barres;
  };
  // 程序性整体替换（加载/重置和弦）时跳过横按清除，避免误清已保存的横按
  let isProgrammaticStringsChange = false;

  /**
   * 自动横按合并：保留仍有效的现有横按（含手动标记，如 x13331 的 2 锚点横按），
   * 再叠加「横按品位上真实音符 ≥ 3」的自动候选，按品位+弦范围去重。
   * - ≥3 门槛只约束「自动新增」，不会清掉已有标记；
   * - 已有横按是否保留以 isBarreStillValid 判定（两端锚点 + 无更低品位阻断），
   *   音符被移走导致失效时自然清除，与手动模式 reconcile 语义一致。
   */
  const mergeAutoBarres = (): BarreEntity[] | undefined => {
    const strings = draftChord.value.strings;
    const existing = (draftChord.value.barres ?? []).filter(b => isBarreStillValid(strings, b));
    const candidates = computeBarreCandidates(strings, draftChord.value.fretCount).filter(c => {
      let noteCount = 0;
      for (let s = c.fromString; s <= c.toString; s++) {
        if (strings[s]?.[0] === c.fret) noteCount++;
      }
      return noteCount >= 3;
    });

    return normalizeAndMergeBarres([...existing, ...candidates], strings);
  };

  // 指板音符变化时，精准保留未受影响的横按
  watch(
    () => draftChord.value.strings.map(s => s[0]),
    (newFrets, oldFrets) => {
      if (isProgrammaticStringsChange) {
        return;
      }

      if (autoBarre.value) {
        // 自动横按：保留仍有效的现有横按 + 叠加 ≥3 音符的自动候选（见 mergeAutoBarres）
        draftChord.value.barres = mergeAutoBarres();
        return;
      }

      const oldBarres = draftChord.value.barres;
      if (!oldBarres || oldBarres.length === 0) {
        return;
      }

      // 删除了 draftChord.value.fretCount，现在只传 4 个参数
      const result = reconcileBarres(newFrets, oldFrets, oldBarres);

      if (result !== oldBarres) {
        draftChord.value.barres = result;
      }
    },
    { flush: 'sync' }
  );

  watch(
    autoBarre,
    isAuto => {
      if (isAuto && !isFretBoardEmpty.value) {
        // 切换到自动横按：不清掉已有标记，只叠加满足 ≥3 音符门槛的自动候选
        draftChord.value.barres = mergeAutoBarres();
      }
    },
    { flush: 'sync' }
  );

  /** 加载已有和弦进编辑器（克隆为草稿，切换为编辑态）；程序性替换不触发横按重算。 */
  const setEditor = (chord: Chord) => {
    isProgrammaticStringsChange = true;
    isCreating.value = false;
    isEditing.value = true;
    draftChord.value = cloneDeep(toRaw(chord));
    isProgrammaticStringsChange = false;
  };

  /** 从和弦库重新加载当前草稿对应的原始数据（草稿丢失/脏污时的恢复入口）。 */
  const initEditor = () => {
    if (!draftChord.value.id) return;
    const original = chordStore.savedChordsList.find(c => c.id === draftChord.value.id);
    if (original) setEditor(original);
    else resetEditor();
  };

  /** 重置编辑器为空白草稿，退出编辑/新建状态。 */
  const resetEditor = () => {
    isProgrammaticStringsChange = true;
    draftChord.value = createDefaultChord();
    isProgrammaticStringsChange = false;
    isCreating.value = false;
    isEditing.value = false;
  };

  /** 以当前草稿为模板另存为新和弦：清空 id 并切换为新建态。 */
  const saveAsNewChord = () => {
    draftChord.value = { ...draftChord.value, id: toChordId('') };
    isEditing.value = false;
    isCreating.value = true;
  };

  return {
    draftChord,
    autoBarre,
    isEditing,
    isCreating,
    isFretBoardEmpty,
    activeBaseStrings,
    isMultiFingering,
    currentMultiFingeringChords,
    currentMultiFingeringIndex,
    stringCount,
    setStringCount,
    setFretCount,
    setBarres,
    setEditor,
    initEditor,
    resetEditor,
    saveAsNewChord,
    setMultiFingeringIndex,
  };
});
