/**
 * 和弦草稿的横按（barre）纯逻辑层（与 store 无关）：
 * 音符变化时的横按修正（reconcile）、自动横按合并（merge）、
 * 缩品位 / 减弦数时的越界横按清理（prune）。
 */
import { toGuitarStringsModel } from '@/domains/chord/theory/entityFactories';
import {
  computeBarreCandidates,
  isBarreStillValid,
  normalizeAndMergeBarres,
} from '@/domains/fretboard/model/coordinates';

import type { BarreEntity, GuitarStringEntity, StringIndex } from '@/domains/chord/types';

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
    while (newFrom <= newTo && (newFrets[newFrom] ?? -1) !== oldBarre.fret) newFrom++;

    while (newTo >= newFrom && (newFrets[newTo] ?? -1) !== oldBarre.fret) newTo--;

    // 收缩后为空（全部锚点消失）直接废弃
    if (newFrom > newTo) return;

    const reconciled: BarreEntity = {
      fret: oldBarre.fret,
      fromString: newFrom as StringIndex,
      toString: newTo as StringIndex,
      finger: oldBarre.finger,
    };
    if (isBarreStillValid(newStrings, reconciled)) newBarres.push(reconciled);
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

/**
 * 自动横按合并：保留仍有效的现有横按（含手动标记，如 x13331 的 2 锚点横按），
 * 再叠加「横按品位上真实音符 ≥ 3」的自动候选，按品位+弦范围去重。
 * - ≥3 门槛只约束「自动新增」，不会清掉已有标记；
 * - 已有横按是否保留以 isBarreStillValid 判定（两端锚点 + 无更低品位阻断），
 *   音符被移走导致失效时自然清除，与手动模式 reconcile 语义一致。
 */
export const mergeAutoBarres = (
  strings: GuitarStringEntity[],
  fretCount: number,
  existingBarres: BarreEntity[] | undefined
): BarreEntity[] | undefined => {
  const existing = (existingBarres ?? []).filter(b => isBarreStillValid(strings, b));
  const candidates = computeBarreCandidates(strings, fretCount).filter(c => {
    let noteCount = 0;
    for (let s = c.fromString; s <= c.toString; s++) if (strings[s]?.fret === c.fret) noteCount++;

    return noteCount >= 3;
  });

  return normalizeAndMergeBarres([...existing, ...candidates], strings);
};

/** 缩小时静音越界音符后，同步清理失效的根音标记与越界横按，保持数据自洽。 */
export const pruneForFretCount = (
  state: { strings: GuitarStringEntity[]; rootStringIndex: StringIndex | null; barres?: BarreEntity[] },
  newVal: number,
  oldVal: number
): void => {
  if (newVal >= oldVal) return;
  state.strings.forEach(str => {
    if (str.fret > newVal) str.fret = -1;
  });
  // 根音所在弦被清除时，根标记一并失效
  if (state.rootStringIndex !== null && (state.strings[state.rootStringIndex]?.fret ?? -1) < 0)
    state.rootStringIndex = null;

  // 缩品位时同步清理越界横按
  if (state.barres) {
    const kept = state.barres.filter(b => b.fret <= newVal);
    if (kept.length !== state.barres.length) state.barres = kept.length > 0 ? kept : undefined;
  }
};

/** 减弦数后清理越界的根音标记与横按配置。 */
export const pruneForStringCount = (
  state: { rootStringIndex: StringIndex | null; barres?: BarreEntity[] },
  count: number
): void => {
  if (state.rootStringIndex !== null && state.rootStringIndex >= count) state.rootStringIndex = null;

  if (state.barres) {
    const kept = state.barres.filter(b => b.fromString < count && b.toString < count);
    state.barres = kept.length > 0 ? kept : undefined;
  }
};
