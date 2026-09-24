/**
 * 和弦库持久化层（纯逻辑，与 Pinia / 响应式无关）：整库快照的防抖刷写与启动加载。
 *
 * 与 songStore 的 songPersistence 形态**故意不同**，差异来自数据形状而非风格：
 * - 歌曲按条分片落库，一次变更只脏一条，故那边维护 `dirtySongIds` / `removedSongIds` 脏集合、
 *   刷写时只送 delta，并额外用 PERSIST_MAX_WAIT_MS 给连续编辑封顶；
 * - 和弦库是「分组 + 和弦」两个整列表，全仓变更路径都是**不可变整表替换**（含撤销恢复孤儿收容），
 *   且 chordRepository.save 本身就是「跨两库的单事务 + 按引用 diff」——store 侧不需要脏集合，
 *   一次刷写即整库 diff，因此这里只有纯防抖，不设 maxWait（保持拆分前的既有写盘节奏）。
 *
 * 本模块**不持有**水合门禁：那是 store 的状态（hydrate 读失败时必须保持写回关闭，见其注释），
 * 以 `canPersist` 谓词注入。这样「谁有权写盘」这一决定仍只有 store 一处，任何调用路径都绕不过它。
 */
import { clearPersistFailure, reportPersistFailure } from '@/platform/services/storage';
import { PERSIST_DEBOUNCE_MS } from '@/platform/utils/constants';

import type { ChordLibraryRepository, ChordLibrarySnapshot } from '@/domains/chord/model/chordRepository';

/** 持久化失败上报键：整库单事务写入，读写两侧归到同一语义单元去重（平台层据此统一提示用户） */
const PERSIST_FAILURE_KEY = 'chords';

export interface ChordPersistence {
  /**
   * 安排一次防抖刷写：连续变更只在静默 PERSIST_DEBOUNCE_MS 后写一次。
   * 由 store 的浅 watch 调用（抑制期不调）。
   */
  schedulePersist: () => void;
  /**
   * 立即刷盘：取消挂起的防抖、绕开防抖窗口把当前整库快照写入 IDB。
   * 保存 / 导入 / 退出落盘等关键入口用，返回 Promise 供调用方 `void` 或 await。
   */
  flushNow: () => Promise<void>;
}

export interface ChordPersistenceHandles {
  persistence: ChordPersistence;
  /** 启动加载整库快照（清洗 + 去重由仓储负责；失败已上报，并原样抛出给调用方决定门禁策略） */
  loadSnapshot: () => Promise<ChordLibrarySnapshot>;
}

/**
 * 创建和弦库持久化句柄。
 * @param repository  整库仓储（IDB 跨库单事务）
 * @param getSnapshot 取当前完整快照，**每次刷写时现取**（必须是 toRaw 后的引用，见仓储的按引用 diff）
 * @param canPersist  写回门禁：水合成功前为 false
 */
export const createChordPersistence = (
  repository: ChordLibraryRepository,
  getSnapshot: () => { groups: ChordLibrarySnapshot['groups']; chords: ChordLibrarySnapshot['chords'] },
  canPersist: () => boolean
): ChordPersistenceHandles => {
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const clearFlushTimer = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const flushNow = async (): Promise<void> => {
    // 门禁关着就整体放弃：此时内存里可能是读失败留下的空初值，写回去等于把残缺视图当权威事实落库
    if (!canPersist()) return;
    // 这次写入送的是**全量**快照，挂起的那次防抖已被覆盖，撤掉计时器免掉一次重复的整库 diff
    clearFlushTimer();
    try {
      await repository.save(getSnapshot());
      clearPersistFailure(PERSIST_FAILURE_KEY);
    } catch (error) {
      // 不再静默吞掉：配额超限等写入失败上报到平台层，由装配层统一提示用户
      reportPersistFailure(PERSIST_FAILURE_KEY, error);
    }
  };

  const schedulePersist = () => {
    clearFlushTimer();
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushNow();
    }, PERSIST_DEBOUNCE_MS);
  };

  const loadSnapshot = async (): Promise<ChordLibrarySnapshot> => {
    try {
      return await repository.load();
    } catch (error) {
      reportPersistFailure(PERSIST_FAILURE_KEY, error);
      // 上报之后仍要抛出：读失败时调用方**必须保持写回门禁关闭**，这个决定不能下沉到这里
      throw error;
    }
  };

  return { persistence: { schedulePersist, flushNow }, loadSnapshot };
};
