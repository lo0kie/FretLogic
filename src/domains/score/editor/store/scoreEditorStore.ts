/**
 * 乐谱编辑器 store：当前编辑歌曲的歌词 / 和弦槽位 / 谱面状态管理，
 * 含撤销-重做历史栈（见 useScoreHistory）、调性变换（transpose/capo）与编辑态持久化。
 */
import { computed, ref, watch } from 'vue';

import { debounceFilter } from '@vueuse/core';
import { defineStore } from 'pinia';

import { useChordStore } from '@/domains/chord/store/chordStore';
import { toChordId } from '@/domains/chord/theory/entityFactories';
import { areChordsEnharmonicallyEquivalent, getChordName, transposeChordEntity } from '@/domains/chord/theory/theory';
import {
  ARRANGE_VIEW_MAX_ZOOM_PERCENT,
  ARRANGE_VIEW_MIN_ZOOM_PERCENT,
  SCORE_SCALE_MAX_PERCENT,
  SCORE_SCALE_MIN_PERCENT,
} from '@/domains/score/constants';
import { useSongStore } from '@/domains/score/library/store/songStore';
import {
  garbageCollectChordMap,
  parseSlotKey,
  restoreChordAtSlot,
  shiftCharSlotsForEditedLines,
} from '@/domains/score/model/chordSlots';
import { countLyricUnits } from '@/domains/score/model/lyricUnits';
import { collectChordBearingLineIndices, matchLineIds, sanitizeLyricsText } from '@/domains/score/model/scoreModel';
import { useStorage } from '@/platform/composables/useStorage';
import { kvRemove, kvSet } from '@/platform/services/storage/idbKv';
import { clamp, generateUUID } from '@/platform/utils/common';
import { PERSIST_DEBOUNCE_MS, PERSIST_MAX_WAIT_MS, STORAGE_KEYS } from '@/platform/utils/constants';

import { useScoreHistory } from './useScoreHistory';

import type { Chord, ChordId } from '@/domains/chord/types';
import type { ChordLineSlots, LineId, SlotKey, Song, SongId } from '@/domains/score/types';

/**
 * 百分制缩放值序列化器：读取时迁移旧版倍率（0.6~1.5）为百分制，写回按百分制原样存储。
 *
 * 读侧必须兜脏值：`Number('')` 是 0、`Number('abc')` 是 NaN，两者都会直进布局算式与滑块
 *（0 让内容塌成一条线、NaN 让整个算式变 NaN）。但兜住「非数」还不够 —— 持久化里可能存着**数值
 * 合法、量纲却坏了**的值（如 5000），它会一路直通布局算式与容器 `zoom`（字号 50 倍、界面直接炸）。
 * 故读取结果一律夹到该维度的合法区间。
 *
 * 区间**按维度取**，不取一个共用值：本序列化器同时服务字号 / 和弦缩放（滑块 60~150）与排列区界面
 * 倍率（手势 50~200），两者合法域不同 —— 取并集会让「字号被夹到 200」这种越界值重新流回界面。
 *
 * @param min 该维度百分制下限（含）
 * @param max 该维度百分制上限（含）
 */
const SCALE_PERCENT_DEFAULT = 100;
const createPercentScaleSerializer = (min: number, max: number) => ({
  read: (raw: string): number => {
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0) return SCALE_PERCENT_DEFAULT;
    // 旧版倍率上限 1.5，新版百分制下限 60，值 < 2 必为旧版倍率
    return clamp(v < 2 ? v * 100 : v, min, max);
  },
  write: (v: number): string => String(v),
});

/** 乐谱页主 Tab：编辑歌词 / 排列和弦 / 预览（URL tab 参数的合法值域） */
export type ScoreActiveTab = 'edit' | 'interactive' | 'preview';

/**
 * updateLyrics 的结果反馈。store 层不直接弹 message（domain 层不反向依赖 UI 状态），
 * 由调用方按此决定是否提示用户。
 */
export interface UpdateLyricsResult {
  /** 未匹配行数超阈值、模糊匹配被整体跳过：这些行拿到新 id 并丢掉原有和弦（大段粘贴场景） */
  skippedSimilarMatch: boolean;
}

const NO_UPDATE_WARNING: UpdateLyricsResult = { skippedSimilarMatch: false };

/**
 * 「可撤销的清除和弦」的精确快照：被清掉的那个和弦与它原来的槽位。
 *
 * 粒度取「被删掉的那一份」而不是整首歌面状态：删除与撤销之间可能夹着别的编辑（notice 是常驻的，
 * 用户随时可能回来点它），整首覆盖会把那些编辑一并抹掉。见 {@link restoreDeletedSlot}。
 */
export interface DeletedSlotSnapshot {
  /**
   * 删除发生时正在编辑的乐谱。
   *
   * 必须随快照一起带走：通知是常驻的，用户完全可能先切歌再回来点「撤销」—— 那时若按 activeSong
   * 定位，旧歌的槽位键会写进新歌的 chordMap。与 ScoreLyricsEditor 的 `boundSongId` 锁同一成因。
   */
  songId: SongId;
  slotKey: SlotKey;
  chordId: ChordId;
}

/**
 * 「可撤销的删行」的精确快照：该行的位置、文本、lineId 与它被删前的槽位表。
 *
 * `slots` 必须是**深克隆**：删除会原地改写这些容器（`shiftCharSlotsForEditedLines` 就地增删
 * `char` 条目），只留引用的话快照会跟着当前状态一起变。见 {@link restoreDeletedLine}。
 */
export interface DeletedLineSnapshot {
  /** 删除发生时正在编辑的乐谱；理由见 {@link DeletedSlotSnapshot.songId} */
  songId: SongId;
  lineIdx: number;
  lineId: LineId;
  lineText: string;
  /** 该行被删前的槽位表；缺省表示这一行本就没有绑和弦 */
  slots?: ChordLineSlots;
}

export const useScoreEditorStore = defineStore('scoreEditor', () => {
  const songStore = useSongStore();
  const chordStore = useChordStore();
  // 选中乐谱仅内存态：URL `?id=` 是唯一数据源（可分享 / 可后退），kv 镜像只维护一个
  // 「最近编辑乐谱」指针供裸访问入口冷启动回灌，不再双写完整选中态。
  const activeSongId = ref<string | null>(null);
  // 当前标签页仅内存态：URL `?tab=` 全权接管（刷新由 URL 恢复，裸访问回落到 edit 默认）
  const activeTabRef = ref<ScoreActiveTab>('edit');
  // 缩放以百分制存储（100 = 100%），序列化处迁移旧版倍率（0.6~1.5）为百分制。
  // 分两个维度各存一份：**预览 / 导出** 与 **排列和弦（编辑视图）** 互不干扰 —— 编辑时要大字号看谱、
  // 出图时要另一套排版比例，共用一份就会「调好编辑区，导出的图跟着变」。
  // 预览维度沿用旧键，老用户的既有设置继续生效。
  const previewFontScale = useStorage(STORAGE_KEYS.SCORE_FONT_SCALE, 100, {
    eventFilter: debounceFilter(PERSIST_DEBOUNCE_MS, { maxWait: PERSIST_MAX_WAIT_MS }),
    serializer: createPercentScaleSerializer(SCORE_SCALE_MIN_PERCENT, SCORE_SCALE_MAX_PERCENT),
  });
  const previewFretboardScale = useStorage(STORAGE_KEYS.SCORE_FRETBOARD_SCALE, 100, {
    eventFilter: debounceFilter(PERSIST_DEBOUNCE_MS, { maxWait: PERSIST_MAX_WAIT_MS }),
    serializer: createPercentScaleSerializer(SCORE_SCALE_MIN_PERCENT, SCORE_SCALE_MAX_PERCENT),
  });
  // 排列和弦维度用新键，默认值取预览维度的当前值：拆分后两侧都与原设置一致，不会「一夜回到 100%」
  const arrangeFontScale = useStorage(STORAGE_KEYS.SCORE_ARRANGE_FONT_SCALE, previewFontScale.value, {
    eventFilter: debounceFilter(PERSIST_DEBOUNCE_MS, { maxWait: PERSIST_MAX_WAIT_MS }),
    serializer: createPercentScaleSerializer(SCORE_SCALE_MIN_PERCENT, SCORE_SCALE_MAX_PERCENT),
  });
  const arrangeFretboardScale = useStorage(STORAGE_KEYS.SCORE_ARRANGE_FRETBOARD_SCALE, previewFretboardScale.value, {
    eventFilter: debounceFilter(PERSIST_DEBOUNCE_MS, { maxWait: PERSIST_MAX_WAIT_MS }),
    serializer: createPercentScaleSerializer(SCORE_SCALE_MIN_PERCENT, SCORE_SCALE_MAX_PERCENT),
  });
  // 排列和弦的「界面缩放」：双指捏合 / Ctrl+滚轮手势写入的整块倍率（见 usePinchZoom）。
  // **单独一维**而不是把手势同时写进那两条 arrange 缩放：那两条是用户各自调好的「字与指板谁大谁小」
  // 的比例，手势要的是「整个界面一起放大」—— 只在其上叠一个整体倍率，两者的大小关系才不被手势改写。
  // 它**不进** effectiveFontScale / effectiveFretboardScale：那两条走的是节点级尺寸（字号 CSS 变量、
  // 指板画布尺寸），而界面倍率走**容器级 CSS `zoom`**（见 ScoreInteractiveArea 的 viewZoom）——
  // 逐个节点缩放要在捏合中每帧重渲每个和弦槽、重画每块指板画布（用户实测「很卡」），
  // 容器级 zoom 由浏览器一次缩放已渲染的结果，子组件一个都不重渲。两处都乘就成了双重缩放。
  const arrangeViewZoom = useStorage(STORAGE_KEYS.SCORE_ARRANGE_VIEW_ZOOM, 100, {
    eventFilter: debounceFilter(PERSIST_DEBOUNCE_MS, { maxWait: PERSIST_MAX_WAIT_MS }),
    // 这一维的合法域来自手势上下限（50~200），与上面四条字号 / 和弦缩放的 60~150 不同
    serializer: createPercentScaleSerializer(ARRANGE_VIEW_MIN_ZOOM_PERCENT, ARRANGE_VIEW_MAX_ZOOM_PERCENT),
  });
  /** 编辑视图（排列和弦）实际生效的缩放：ScoreInteractiveArea 的排版与 canvas 绘制消费（不含界面倍率） */
  const effectiveFontScale = computed(() => arrangeFontScale.value);
  const effectiveFretboardScale = computed(() => arrangeFretboardScale.value);

  const activeSong = computed<Song | null>(() => {
    if (!activeSongId.value) return null;
    return songStore.songs.find(s => s.id === activeSongId.value) || null;
  });

  const hasLyrics = computed(() => Boolean(activeSong.value?.lyrics && activeSong.value.lyrics.trim().length > 0));

  const activeTab = computed({
    get: () => {
      // 防御 storage 中遗留未知值：仅接受三个合法标签
      const current = activeTabRef.value;
      if (current !== 'edit' && current !== 'interactive' && current !== 'preview') return 'edit';
      if (!hasLyrics.value) return 'edit';
      return current;
    },
    set: (val: ScoreActiveTab) => {
      if (val !== 'edit' && !hasLyrics.value) {
        activeTabRef.value = 'edit';
        return;
      }
      activeTabRef.value = val;
    },
  });

  // ---- 撤销-重做历史栈（机制见 useScoreHistory） ----
  const {
    recordHistory,
    undo,
    redo,
    handleSongChange: handleHistorySongChange,
  } = useScoreHistory({
    getActiveSong: () => activeSong.value,
    applyState: (id, state) => songStore.updateSongMeta(id, state),
    /**
     * 快照离栈（redo 分支被截断 / 超出容量 / 切换歌曲）→ 该步在库里自动新建的和弦再也回不到，
     * 逐个确认「已无任何乐谱引用」后回收。不记这笔账的话「移调 → 撤销」会把每次自动建弦
     * 永久留在用户和弦库里并跟着备份走。删除一律走 chordStore.removeChords（其删除事件由
     * 应用层桥接负责解绑），本 store 不自行改写别的域的数据结构。
     */
    onSnapshotsDiscarded: states => {
      const created = states.flatMap(s => s.createdChords ?? []);
      const orphans = created.filter(c => songStore.getChordReferences([c.id]).length === 0);
      if (orphans.length > 0) chordStore.removeChords(orphans);
    },
  });

  watch(activeSong, newSong => handleHistorySongChange(newSong), { immediate: true });

  /** 设置当前编辑的歌曲 id（仅内存）；URL `?id=` 负责刷新/深链恢复。 */
  const setActiveSong = (id: string | null) => {
    activeSongId.value = id;
  };

  // 「最近编辑乐谱」冷启动指针：URL 无选歌参数（裸访问）时作为回灌种子；
  // 取消选中（id 为 null）时同步清除指针，否则用户已主动取消的选择会在刷新后被回灌复活。
  // 指针为 kv 镜像同步读写（IDB 落盘），useScoreRouteSync 冷启动回灌经 kvGet 读取。
  watch(activeSongId, id => {
    if (id) kvSet(STORAGE_KEYS.LAST_SONG_ID, id);
    else kvRemove(STORAGE_KEYS.LAST_SONG_ID);
  });

  // 记录「最近的乐谱主 Tab」冷启动指针：仅当存在激活歌曲且当前为主 Tab（非 edit）时写入，
  // 供裸入口刷新后随 LAST_SONG 一并回灌（URL 仍是唯一数据源）；取消选中或回退到 edit 时清理，
  // 避免刷新后误恢复一个当前不再有效的 Tab。
  watch([activeSongId, () => activeTab.value], ([songId, tab]) => {
    if (songId && tab && tab !== 'edit') kvSet(STORAGE_KEYS.LAST_ACTIVE_TAB, tab);
    else kvRemove(STORAGE_KEYS.LAST_ACTIVE_TAB);
  });

  /**
   * 更新歌词。songId 缺省时为当前激活歌曲。
   * 提供 songId 参数是为了让防抖/异步提交在"调度时"锁定目标歌曲（见 ScoreLyricsEditor 的 commitLyrics），
   * 避免切换歌曲后旧的挂起回调把上一首的歌词错误写入当前歌曲（会连带清空其和弦，即跨歌联动根因）。
   *
   * 和弦跟随：lineId 保住只说明「还是同一条行」，行内字符位置可能已整体挪动，故按编辑对齐平移
   * 字符槽位下标（见 shiftCharSlotsForEditedLines），再回收消失行与下标越界的槽位。
   */
  const updateLyrics = (lyrics: string, songId?: string): UpdateLyricsResult => {
    const target = songId ? (songStore.songs.find(s => s.id === songId) ?? null) : activeSong.value;
    if (!target) return NO_UPDATE_WARNING;
    const sanitizedLyrics = sanitizeLyricsText(lyrics);
    if (sanitizedLyrics === target.lyrics) return NO_UPDATE_WARNING;
    // 仅在编辑的正是当前激活歌曲时才记录撤销历史，避免历史栈混入非激活歌曲的变更
    if (activeSong.value?.id === target.id) recordHistory();
    const oldLines = target.lyrics.split('\n');
    const newLines = sanitizedLyrics.split('\n');
    const oldIds = target.lineIds ?? [];
    // 内容相同的重复行无法从文本区分，故把「哪些旧行带和弦」交给匹配器做保守偏好
    // （见 collectChordBearingLineIndices）：存活行优先认领带和弦的那一条，
    // 避免它认领到被删行的 id、随后 garbageCollectChordMap 把带和弦的那条整行清掉
    const preferredOldIndices = collectChordBearingLineIndices(oldIds, target.chordMap);
    const { lineIds: newIds, skippedSimilarMatch } = matchLineIds(oldLines, newLines, oldIds, preferredOldIndices);
    // 先平移、再回收：顺序不能反 —— 越界判定按新行长进行，平移后越界的槽位会在同一步被清掉
    const shifted = shiftCharSlotsForEditedLines(target.chordMap, oldLines, newLines, oldIds, newIds);
    const { map: collectedChordMap, changed: collected } = garbageCollectChordMap(
      shifted.map,
      newIds,
      // 行长按槽位单元数（码点）报给回收器：它拿这个数判越界，口径必须与行模型一致
      //（按 `.length` 会让含代理对的行多算一格，越界槽位逃过回收，成为看不见也删不掉的幽灵绑定）
      newLines.map(countLyricUnits)
    );
    const chordMapChanged = shifted.changed || collected;
    songStore.updateSongMeta(target.id, {
      lyrics: sanitizedLyrics,
      lineIds: newIds,
      chordMap: chordMapChanged ? (collectedChordMap as Map<LineId, ChordLineSlots>) : target.chordMap,
    });
    if (activeSong.value?.id === target.id) recordHistory();
    if (activeSong.value?.id === target.id && !sanitizedLyrics.trim()) activeTabRef.value = 'edit';

    return { skippedSimilarMatch };
  };

  /** 为当前歌曲的歌词字符槽位设置和弦，并记录撤销历史。 */
  const setSlotChord = (slotKey: SlotKey, chord: Chord) => {
    if (!activeSong.value) return;
    recordHistory();
    songStore.setCharChord(activeSong.value.id, slotKey, chord.id);
    recordHistory();
  };

  /** 移除当前歌曲指定槽位上的和弦，并记录撤销历史。 */
  const removeSlotChord = (slotKey: SlotKey) => {
    if (!activeSong.value) return;
    recordHistory();
    songStore.removeCharChord(activeSong.value.id, slotKey);
    recordHistory();
  };

  /**
   * 把被清除的和弦按**精确快照**插回它原来的槽位，并记录撤销历史。
   *
   * 为什么不是「弹撤销历史栈顶」：排列区的删除通知是**常驻**的（撤销入口随 toast 飘走就没了），
   * 用户完全可能先做别的编辑、隔一会儿再回来点「撤销」—— 那时栈顶早已不是这次清除，弹栈顶会撤掉
   * 那次编辑、而清除照旧。与「删指法 / 删分组 / 删乐谱」三处同一条口径：各记精确快照、按原位写回，
   * 删除与撤销之间夹着的其它改动一概不受影响。
   *
   * 返回是否真的还原了：目标乐谱已被删除、或槽位键不可解析时为 `false` —— 调用方据此不报
   * 「已恢复」的成功提示（常驻通知可能在目标已消失之后才被点到）。
   */
  const restoreDeletedSlot = (snapshot: DeletedSlotSnapshot): boolean => {
    // 目标按快照里的 songId 定位，**不是**点击「撤销」那一刻的 activeSong：通知是常驻的，用户完全
    // 可能先切歌再回来点它 —— 按 activeSong 定位会把旧歌的槽位键写进新歌的 chordMap。
    const song = songStore.songs.find(s => s.id === snapshot.songId);
    if (!song) return false;
    const chordMap = new Map(song.chordMap);
    // 键不可解析时不改动数据，也不推历史（与 setCharChord 的守卫同款）
    if (!restoreChordAtSlot(chordMap, snapshot.slotKey, snapshot.chordId)) return false;
    // 历史栈只属于当前活跃歌：目标不是它时推快照会把另一首歌的状态混进本歌的栈（撤销即写错歌），故跳过
    const isActive = song.id === activeSong.value?.id;
    if (isActive) recordHistory();
    songStore.updateSongMeta(song.id, { chordMap });
    if (isActive) recordHistory();
    return true;
  };

  /**
   * 把被删掉的一行按**精确快照**还原，并记录撤销历史。
   *
   * 歌词文本、行序与该行的槽位表必须**同一次写入**：只补文本的话这一行会被重新匹配到一个新
   * lineId，而原来绑在它上面的和弦是按旧 lineId 存的（删除时已随垃圾回收清掉）—— 和弦就回不来了。
   * 行序按原下标插回；撤销前若夹着别的增删行，原下标先钳进合法范围（其余行不受影响）。
   *
   * 目标按快照里的 songId 定位、返回是否真的还原（理由同 {@link restoreDeletedSlot}）。
   */
  const restoreDeletedLine = (snapshot: DeletedLineSnapshot): boolean => {
    const song = songStore.songs.find(s => s.id === snapshot.songId);
    if (!song) return false;
    const lines = song.lyrics.split('\n');
    const lineIds = [...song.lineIds];
    const at = Math.min(Math.max(snapshot.lineIdx, 0), lines.length);
    lines.splice(at, 0, snapshot.lineText);
    lineIds.splice(at, 0, snapshot.lineId);
    const chordMap = new Map(song.chordMap);
    if (snapshot.slots) chordMap.set(snapshot.lineId, snapshot.slots);
    const isActive = song.id === activeSong.value?.id;
    if (isActive) recordHistory();
    songStore.updateSongMeta(song.id, { lyrics: lines.join('\n'), lineIds, chordMap });
    if (isActive) recordHistory();
    return true;
  };

  /** 拖拽来源是 DOM data-slot-key（不可信边界）：必须能被 parseSlotKey 完整解析才收窄为 SlotKey
   *  （原实现只判 `line_` 前缀，畸形键如 `line_foo_bar` 会被放行到 store 层；与槽位解析共用同一套判据） */
  const isSlotKey = (value: string): value is SlotKey => parseSlotKey(value) !== null;

  /** 交换两个槽位的和弦绑定（拖拽互换），并记录撤销历史。 */
  const swapSlotChords = (sourceKey: string, targetKey: string) => {
    if (!activeSong.value || sourceKey === targetKey) return;
    if (!isSlotKey(sourceKey) || !isSlotKey(targetKey)) return;
    recordHistory();
    songStore.swapSongSlotChords(activeSong.value.id, sourceKey, targetKey);
    recordHistory();
  };

  /** 对当前编辑歌曲进行移调（包含撤销栈记录与和弦库复用/自动补充） */
  const transposeActiveSong = (semitones: number) => {
    if (!activeSong.value || semitones === 0) return;
    recordHistory();
    // 本步自动新建的和弦随「移调后」快照登记：redo 分支作废时由历史栈回收钩子清走，
    // 否则「移调 → 撤销」会把这套指法永久留在库里并跟着备份走
    const createdInStep: Chord[] = [];
    songStore.transposeSong(activeSong.value.id, semitones, {
      chordResolver: id => chordStore.savedChordsList.find(c => c.id === id),
      chordFinder: (targetName, originalChord) =>
        chordStore.savedChordsList.find(c => {
          if (c.tuning !== originalChord.tuning || c.strings.length !== originalChord.strings.length) return false;
          // 等音异名视为命中：移调按记谱习惯选升降号，与库里既有指法的拼写未必一致
          // （如 C +3 得 Eb，库里存的是 D#），若只做字符串全等，既有的同音指法永远匹配不上，
          // 每次移调都会再造一套同音异名的和弦。
          const name = getChordName(c);
          return name === targetName || areChordsEnharmonicallyEquivalent(name, targetName);
        }),
      chordCreator: originalChord => {
        const created = transposeChordEntity(originalChord, semitones, {
          mode: 'update_name',
          newId: toChordId(`c_${generateUUID().slice(0, 12)}`),
        });
        chordStore.addChord(created);
        createdInStep.push(created);
        return created;
      },
    });
    recordHistory(undefined, createdInStep);
  };

  /** 增减当前歌曲的变调夹品位（包含撤销栈保护） */
  const transposeActiveCapo = (deltaCapo: number) => {
    if (!activeSong.value || deltaCapo === 0) return;
    recordHistory();
    songStore.transposeSongCapo(activeSong.value.id, deltaCapo);
    recordHistory();
  };

  return {
    activeSongId,
    activeTab,
    activeSong,
    hasLyrics,
    setActiveSong,
    updateLyrics,
    setSlotChord,
    removeSlotChord,
    restoreDeletedSlot,
    restoreDeletedLine,
    swapSlotChords,
    transposeActiveSong,
    transposeActiveCapo,
    previewFontScale,
    previewFretboardScale,
    arrangeFontScale,
    arrangeFretboardScale,
    arrangeViewZoom,
    effectiveFontScale,
    effectiveFretboardScale,
    // 供编辑域外的合法变更入口（如「清空乐谱和弦」弹窗）在同一套撤销栈上记录历史
    recordHistory,
    undo,
    redo,
  };
});
