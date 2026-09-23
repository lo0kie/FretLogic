import { computed, inject, ref, toRaw, watch } from 'vue';

import { defineStore } from 'pinia';

import { useChordStore } from '@/domains/chord/store/chordStore';
import { toChordId, toGroupId } from '@/domains/chord/theory/entityFactories';
import { normalizeChord } from '@/domains/chord/theory/normalizeChord';
import {
  createString,
  getBaseStringsFor,
  getChordName,
  getDefaultTuningForStringCount,
  TUNING_PRESETS,
} from '@/domains/chord/theory/theory';
import { DEFAULT_FRET_COUNT } from '@/domains/fretboard/constants';
import { useStorage } from '@/platform/composables/useStorage';
import { clamp, cloneDeep } from '@/platform/utils/common';
import { STORAGE_KEYS } from '@/platform/utils/constants';

import { mergeAutoBarres, pruneForFretCount, pruneForStringCount, reconcileBarres } from './chordBarreLogic';

import type { BarreEntity, Chord, ChordNameSegments, GuitarStringEntity, StringIndex } from '@/domains/chord/types';
import type { InjectionKey } from 'vue';

export { reconcileBarres } from './chordBarreLogic';

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

/** 空草稿的残留名分片：全静音只能被解析成裸的自然音 C（无性质 / 无扩展 / 无低音），
 *  它不是用户选定的和弦名，草稿态应回填为「未命名」。 */
const isBareNaturalCResidue = (segments: ChordNameSegments): boolean =>
  segments.root[0] === 'C' &&
  segments.root[1] === 0 &&
  !segments.quality &&
  !segments.unknownQuality &&
  !segments.extensions &&
  !segments.bass;

/** 规范化草稿：复用统一的 normalizeChord，并在空白草稿时清理残留 C 分片 */
const normalizeDraftChord = (draft: Chord): Chord => {
  const { chord } = normalizeChord(draft);
  if (!chord.id && Array.isArray(chord.strings) && chord.strings.every(s => s.fret < 0))
    if (chord.nameSegments && isBareNaturalCResidue(chord.nameSegments)) chord.nameSegments = null;

  return chord;
};

/**
 * 草稿 store 的 setup 工厂：同一套草稿逻辑可实例化多份，各自持有独立的和弦草稿。
 * @param persist 草稿与编辑态是否落盘（true：刷新后续编；false：纯内存草稿，销毁即弃）
 */
const createChordEditorSetup = (persist: boolean) => () => {
  const chordStore = useChordStore();
  const draftChord = persist
    ? useStorage<Chord>(STORAGE_KEYS.EDITING_DRAFT, createDefaultChord())
    : ref(createDefaultChord());
  draftChord.value = normalizeDraftChord(draftChord.value);
  const isEditing = persist ? useStorage(STORAGE_KEYS.IS_EDITING, false) : ref(false);
  const isCreating = persist ? useStorage(STORAGE_KEYS.IS_CREATING, false) : ref(false);
  // 自动横按是全局偏好（头部配置面板统一切换），不随草稿实例分裂：所有实例共用同一存储键
  const autoBarre = useStorage(STORAGE_KEYS.AUTO_BARRE, true);

  const isFretBoardEmpty = computed(() => draftChord.value.strings.every(s => s.fret < 0));
  // 按草稿实际弦数解析基准弦：9/10 弦（无调弦预设）原先会落回 6 弦映射，
  // 第 7 根起音高静默塌成 0，分析面板与转位判定随之失真
  const activeBaseStrings = computed(() => getBaseStringsFor(draftChord.value.tuning, draftChord.value.strings.length));

  /** 数据层兜底：主音绝不指向禁用的弦。
   *  任何写入路径（右键设根、设弦状态、缩品位、加载和弦等）只要把 rootStringIndex 落到
   *  静音弦（fret < 0）上，立刻清空。这样数据里永远不存在“禁用的弦=主音”的垃圾状态，
   *  渲染层只需做相等判断，无需再在视图里掩盖不一致。
   *
   *  watch 源取「根音下标 + 各弦品位」的字符串签名而非 deep 遍历整个草稿：
   *  回调只读这两项，字符串签名足以判定，且拖动时每帧 `strings` 都被换新数组、
   *  深层遍历整份草稿（含调弦映射、横按列表等与此无关的字段）纯属浪费。 */
  watch(
    () => {
      const chord = draftChord.value;
      return `${chord.rootStringIndex ?? ''}|${chord.strings.map(s => s.fret).join(',')}`;
    },
    () => {
      const idx = draftChord.value.rootStringIndex;
      if (idx !== null && (draftChord.value.strings[idx]?.fret ?? -1) < 0) draftChord.value.rootStringIndex = null;
    }
  );

  /** 候选应用前的根音弦快照（内存态；undefined = 当前无快照）。取消候选时用它还原根音弦，
   *  避免「点候选 → 再点取消」把用户手动设置的根音一并清掉。 */
  let preCandidateRootStringIndex: StringIndex | null | undefined = undefined;

  /** 应用和弦候选前快照当前根音弦（assignRootString 会改写 rootStringIndex，须先记录原值） */
  const snapshotRootBeforeCandidate = () => {
    preCandidateRootStringIndex = draftChord.value.rootStringIndex;
  };

  /** 取消和弦候选：把根音弦还原到快照值（含还原为「无根音」），无快照则保持不动 */
  const restoreRootOnCandidateCancel = () => {
    if (preCandidateRootStringIndex === undefined) return;
    draftChord.value.rootStringIndex = preCandidateRootStringIndex;
    preCandidateRootStringIndex = undefined;
  };

  /** 丢弃根音快照：手动改根音或整体替换草稿后快照已过期，取消候选不再回退根音 */
  const discardRootSnapshot = () => {
    preCandidateRootStringIndex = undefined;
  };

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
    // 与 setEditor / resetEditor 同款：**整体替换草稿**必须挂程序性标记，否则下面那条
    // 「指板音符变化」watcher（flush: 'sync'）会把变体自带的横按当作用户改弦而重算/清除。
    isProgrammaticStringsChange = true;
    draftChord.value = cloneDeep(toRaw(chord));
    isProgrammaticStringsChange = false;
    isCreating.value = false;
    isEditing.value = true;
  };

  /** 设置指板可视品位数；缩小时静音越界音符，并联动清理失效的根音标记与横按。 */
  const setFretCount = (newVal: Chord['fretCount']) => {
    const oldVal = draftChord.value.fretCount;
    draftChord.value.fretCount = newVal;
    pruneForFretCount(draftChord.value, newVal, oldVal);
  };

  const stringCount = computed(() => draftChord.value.strings.length);

  /** 设置琴弦数量（3~10 弦，典型覆盖 4 弦尤克里里/贝斯、6 弦吉他、7/8 弦重金属） */
  const setStringCount = (targetCount: number) => {
    const count = clamp(Math.round(targetCount), 3, 10);
    const current = draftChord.value.strings;
    if (current.length === count) return;

    let nextStrings: GuitarStringEntity[];
    if (count > current.length) {
      const added: GuitarStringEntity[] = Array.from({ length: count - current.length }, () => createString());
      nextStrings = [...current, ...added];
    } else nextStrings = current.slice(0, count);

    draftChord.value.strings = nextStrings;

    // 调弦方案自动联动：若当前调弦方案与新弦数不匹配，自动选用该弦数对应的默认调弦方案
    const currPreset = TUNING_PRESETS[draftChord.value.tuning];
    if (!currPreset || currPreset.stringCount !== count)
      draftChord.value.tuning = getDefaultTuningForStringCount(count);

    // 清理越界的根音标记与横按配置
    pruneForStringCount(draftChord.value, count);
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

  /** 自动横按合并：保留仍有效的现有横按，再叠加「横按品位上真实音符 ≥ 3」的自动候选（逻辑见 chordBarreLogic）。 */
  const mergeAutoBarresIntoDraft = (): BarreEntity[] | undefined =>
    mergeAutoBarres(draftChord.value.strings, draftChord.value.fretCount, draftChord.value.barres);

  // 指板音符变化时，精准保留未受影响的横按
  watch(
    () => draftChord.value.strings.map(s => s.fret),
    (newFrets, oldFrets) => {
      if (isProgrammaticStringsChange) return;

      if (autoBarre.value) {
        // 自动横按：保留仍有效的现有横按 + 叠加 ≥3 音符的自动候选（见 chordBarreLogic）
        draftChord.value.barres = mergeAutoBarresIntoDraft();
        return;
      }

      const oldBarres = draftChord.value.barres;
      if (!oldBarres || oldBarres.length === 0) return;

      // 删除了 draftChord.value.fretCount，现在只传 4 个参数
      const result = reconcileBarres(newFrets, oldFrets, oldBarres);

      if (result !== oldBarres) draftChord.value.barres = result;
    },
    { flush: 'sync' }
  );

  watch(
    autoBarre,
    isAuto => {
      if (isAuto && !isFretBoardEmpty.value)
        // 切换到自动横按：不清掉已有标记，只叠加满足 ≥3 音符门槛的自动候选
        draftChord.value.barres = mergeAutoBarresIntoDraft();
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
    discardRootSnapshot();
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
    discardRootSnapshot();
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
    snapshotRootBeforeCandidate,
    restoreRootOnCandidateCancel,
    discardRootSnapshot,
  };
};

/** 工作台草稿（全局唯一、落盘持久化）：工作台视图与全局服务（音频/同步/导入导出/URL 镜像）统一消费 */
export const useChordEditorStore = defineStore('editor', createChordEditorSetup(true));

/** 选器和弦抽屉草稿（纯内存）：与工作台草稿完全隔离——抽屉内编辑/新建不再改动工作台指板，
 *  工作台的编辑也不会串进抽屉；抽屉关闭后草稿随之丢弃，不留残留持久化键 */
export const useDrawerChordEditorStore = defineStore('editor-drawer', createChordEditorSetup(false));

/** 草稿 store 实例类型：两个实例同构，取联合以容纳不同 $id 字面量，便于跨实例传递（provide 的抽屉实例） */
export type ChordEditorStore = ReturnType<typeof useChordEditorStore> | ReturnType<typeof useDrawerChordEditorStore>;

/** 注入键：抽屉把自己的草稿实例 provide 给子树（和弦候选面板等），替代全局单例解析 */
export const CHORD_EDITOR_STORE_KEY: InjectionKey<ChordEditorStore> = Symbol('chord-editor-store');

/** 解析当前生效的草稿 store：祖先 provide 了独立实例（抽屉）则用之，否则回落到工作台草稿。
 *  注意：provide 只对其子树可见，同组件内 provide 后 inject 不到——抽屉自身需把实例显式传给 composable */
export const useActiveChordEditorStore = (): ChordEditorStore =>
  inject(CHORD_EDITOR_STORE_KEY, undefined) ?? useChordEditorStore();
