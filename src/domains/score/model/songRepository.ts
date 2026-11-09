import { isKeyName } from '@/domains/chord/theory/theory';
import { isCapoValue } from '@/domains/fretboard/model/coordinates';
import { DEFAULT_SCORE_TITLE, isTimeSignatureFormat } from '@/domains/score/constants';
import { plainToChordMap, pruneOrphanChordRefs } from '@/domains/score/model/chordSlots';
import { fallbackLineId, toSongId } from '@/domains/score/model/scoreModel';
import { BOOT_PHASES, reportBootProgress, withBootPhase } from '@/platform/services/boot/bootProgress';
import { idb } from '@/platform/services/storage';
import { defineOrderIndex, orderEntitiesByIndex } from '@/platform/services/storage/orderIndex';
import {
  fillMissingTimestamps,
  isNumber,
  isObject,
  isString,
  isValidTimestamp,
  toCloneable,
} from '@/platform/utils/common';
import { logger } from '@/platform/utils/logger';

import type { KeyName } from '@/domains/chord/types';
import type { ChordLineSlots, LineId, Song, SongId } from '@/domains/score/types';

/** 启动占位上这一段的文案（见 platform/services/boot/bootProgress） */
const BOOT_LABEL = '正在加载乐谱';

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord => isObject(value) && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => isString(value) && value.trim().length > 0;

/** 乐观锁版本号：**正整数**（从 1 起，见 DEFAULT_SONG 与 touchSong 的 `?? 1`）。 */
const isSongVersion = (value: unknown): value is number => isNumber(value) && Number.isInteger(value) && value >= 1;

/**
 * 歌词行数：空串算 0 行（与 DEFAULT_SONG 的 `lineIds: []` 一致），其余按 `\n` 拆分。
 * `sanitizeLyricsLine` 只删行内的 `\r` / `\t` / 全角空格，不改变行数，故此处可直接拆原始串。
 */
const countLyricsLines = (lyrics: string): number => (lyrics === '' ? 0 : lyrics.split('\n').length);

/**
 * 行 id 数组清洗：**长度对齐歌词行数、逐位映射**，无效项按下标兜底为 `line_${index}`
 * （与 `resolveLineIdAt` 同源）。
 *
 * 不能用 `.filter()`：`lineIds` 是位置数组（第 i 项对应歌词第 i 行），filter 会把无效项之后的元素
 * 整体前移 —— 每行的 id 与歌词行错位，chordMap 里按 lineId 锚定的槽位全部挂到别的行上；而清洗
 * 结果会被 flush 写回固化，错位从此成为持久状态。
 *
 * 补齐用的是 `resolveLineIdAt` 那枚兜底串，故「读侧补出来的 id」与「运行 / 导出侧兜底出来的 id」
 * 是同一个 —— 按兜底 id 写入的槽位在两端都查得到。
 */
const sanitizeLineIds = (raw: unknown, lyrics: string): LineId[] => {
  const source = Array.isArray(raw) ? raw : [];
  return Array.from({ length: countLyricsLines(lyrics) }, (_, index) => {
    const id: unknown = source[index];
    return isNonEmptyString(id) ? id : fallbackLineId(index);
  }) as LineId[];
};

const sanitizeChordMap = (chordMap: unknown): Map<LineId, ChordLineSlots> =>
  // 兼容旧扁平对象 / 新嵌套对象 / 嵌套 Map 三态；key/value 已通过 plainToChordMap 过滤，品牌收窄信任该过滤
  plainToChordMap(chordMap) as Map<LineId, ChordLineSlots>;

export type SongDraft = Omit<Song, 'createdAt' | 'updatedAt'> & Partial<Pick<Song, 'createdAt' | 'updatedAt'>>;

export const sanitizeSongEntity = (raw: unknown): SongDraft | null => {
  if (!isRecord(raw)) return null;
  // 只有 id 参与「整条丢弃」的判据（它是主键）；其余字段一律兜底。
  if (typeof raw['id'] !== 'string' || !raw['id']) return null;
  // ⚠️ title 此前也参与丢弃，后果远超「少个标题」：读侧清洗失败的记录**不在内存里**，而云拉 / 导入的
  // 差集是按主键扫描的 —— 会把这条「内存里没有」的记录当成已删除 markSongRemoved 落库。于是一次
  // 读取侧的宽容失败升级成写侧的永久删除。这里降级为兜底 + 告警（不再静默）。
  if (!isString(raw['title']))
    logger.warn('songRepository', '歌曲 title 非字符串，已兜底为默认标题', { id: raw['id'] });

  // 旧持久化数据无 key 字段（v3→v4 把 song.key 并入 playKey，见 payloadMigrations）；按调名守卫收窄
  const legacyKey: KeyName = isKeyName(raw['key']) ? raw['key'] : 'C';
  // 歌词整串提到对象字面量之外：lineIds 的长度要对齐它的行数（见 sanitizeLineIds）
  const lyrics = isString(raw['lyrics']) ? raw['lyrics'] : '';
  const song: SongDraft = {
    id: toSongId(raw['id']),
    title: isString(raw['title']) ? raw['title'] : DEFAULT_SCORE_TITLE,
    lyrics,
    // 旧持久化数据无 singer 字段：清洗层自动补齐空串，无迁移成本
    singer: isString(raw['singer']) ? raw['singer'] : '',
    // 旧持久化数据无 originalKey 字段：同上自动补齐空串；调名守卫兜底防脏调名进表头
    originalKey: isKeyName(raw['originalKey']) ? raw['originalKey'] : '',
    // 旧持久化数据无 timeSignature 字段：自动补齐空串；格式校验兜底防脏数据进表头
    timeSignature: isTimeSignatureFormat(raw['timeSignature']) ? raw['timeSignature'] : '',
    lineIds: sanitizeLineIds(raw['lineIds'], lyrics),
    // playKey 是唯一参与乐理计算的元信息（computeSongKey → transposeChordName），按调名守卫收窄：
    // 此前只判「非空字符串」，脏值能一路进移调
    playKey: isKeyName(raw['playKey']) ? raw['playKey'] : legacyKey,
    capo: isCapoValue(raw['capo']) ? raw['capo'] : 0,
    chordMap: sanitizeChordMap(raw['chordMap']),
    version: isSongVersion(raw['version']) ? raw['version'] : 1,
    ...(isValidTimestamp(raw['createdAt']) ? { createdAt: raw['createdAt'] } : {}),
    ...(isValidTimestamp(raw['updatedAt']) ? { updatedAt: raw['updatedAt'] } : {}),
  };
  return song;
};

export const sanitizeSongs = (songs: unknown): SongDraft[] => {
  if (!Array.isArray(songs)) return [];

  const validSongIds = new Set<string>();
  const out: SongDraft[] = [];
  for (const rawSong of songs) {
    const song = sanitizeSongEntity(rawSong);
    if (!song) continue;
    if (validSongIds.has(song.id)) {
      // 与 title 的处理（本文件上方）同口径：整条记录消失必须留痕，
      // 否则用户报「少了一首歌」时日志里没有任何线索
      logger.warn('songRepository', '重复的歌曲 id 已跳过', { id: song.id });
      continue;
    }
    validSongIds.add(song.id);
    out.push(song);
  }
  return out;
};

/**
 * 清洗歌曲列表并补齐时间戳。
 *
 * `validChordIds` 是**可选**的孤儿剪枝入口：给出和弦 id 全集时，指向不存在和弦的槽位引用会被剪掉
 * （`preserveUnknown: true` 让「引用查不到」与「和弦确实没有」仍可区分）。
 *
 * ⚠️ 生产路径**不传它**，故剪枝目前只在测试里生效 —— 这是刻意的跨层取舍，不是漏接线：
 * `loadSongs` 在 score 域内读 IDB，拿不到 chord 域的和弦全集；而传一个**不完整**的 id 集比不剪更危险
 * （会把「和弦还没读出来」当成「和弦不存在」，剪掉用户真实的槽位绑定）。真要启用它，必须由应用装配层
 * 在**两个库都读完**之后把和弦 id 集传下来（纯函数参数传递，见 `01-refactoring-ban-and-admission.md`
 * 的「关于跨层依赖的处理」），不能在 score 域内反向 import chord 域。
 */
export const sanitizeSongList = (songs: unknown[], validChordIds?: Set<string>): Song[] => {
  const drafts = sanitizeSongs(songs);
  const now = Date.now();
  if (!validChordIds) return fillMissingTimestamps(drafts, now);

  return fillMissingTimestamps(
    drafts.map(song => {
      const { map } = pruneOrphanChordRefs(song.chordMap, validChordIds, { preserveUnknown: true });
      return { ...song, chordMap: map as Map<LineId, ChordLineSlots> };
    }),
    now
  );
};

/**
 * 歌曲仓储：IDB（songs 库按歌存单条记录；顺序索引存 syncMeta 的 'song-order' 记录）。
 * IDB getAll 按主键序返回、无法承载手动拖拽顺序，顺序信息独立持久化；索引与歌曲集合
 * 允许短暂不一致（读侧以实际记录为准兜底），批量变更经 flushChanges 单事务原子落库。
 */
export interface SongRepository {
  /** 加载全部歌曲：优先按顺序索引排列，未被索引覆盖的记录追加在尾部 */
  loadSongs(): Promise<Song[]>;
  saveSong(song: Song): Promise<void>;
  /** 以下 id 一律 SongId：品牌只在编译期存在（落库即普通 string），但能挡住把和弦/行 id 误当歌曲 id 传进来 */
  removeSong(id: SongId): Promise<void>;
  /** 写入歌曲顺序索引（syncMeta） */
  saveSongIds(ids: SongId[]): Promise<void>;
  /** 实际存储中的全部歌曲 id（来自主键扫描，不受索引漂移影响；孤儿清理用） */
  listSongIds(): Promise<SongId[]>;
  /**
   * 批量刷写：删除单独一个事务先行提交（配额熔断下仍能释放空间，见实现注释），
   * 脏歌曲与顺序索引（可选）同事务写入。两者不再同生共死 —— 删除必须能在写入失败时存活。
   */
  flushChanges(changes: { removedIds: SongId[]; dirtySongs: Song[]; orderIds?: SongId[] }): Promise<void>;
}

// 顺序索引：与分组同一个成因（见 chordRepository 的 'group-order' 索引）—— getAll 按主键序
// 返回，拖拽顺序独立持久化为 syncMeta 元记录。形状与重排算法由 platform 的 orderIndex 承载。
const songOrderIndex = defineOrderIndex('song-order');

/**
 * 读侧清洗的分片大小。
 *
 * 清洗是同步 CPU（逐歌重建 lineIds、把 chordMap 的普通对象重新物化成嵌套 Map），实测 2000 首 ×
 * 600 行约 2 秒。不分片时这 2 秒是一个长任务：启动占位上的动画整段冻住、标签页点击无响应，而且
 * main.ts 给水合设的兜底超时**根本无法生效** —— 定时器回调排在被占满的主线程之后，轮不到执行，
 * 于是「超时即挂载」这条路径形同虚设。
 *
 * 分片不影响清洗语义：sanitizeSongList 内部的重复 id 去重是**跨记录**判重，而 songs 库的 keyPath
 * 就是 id、toSongId 又是恒等转换，跨记录撞 id 不可能发生，故不存在「分片后漏判」的形态。
 *
 * 导出是为了让测试能把夹具定到「必然跨分片」的尺寸（`SANITIZE_CHUNK_SIZE * 2 + 1`），而不是在断言里
 * 写死一个数字 —— 这个值将来调整时，测试的覆盖力度不会跟着失效。
 */
export const SANITIZE_CHUNK_SIZE = 100;

/**
 * 落盘分片大小：`flushChanges` 每片一个事务。
 *
 * 【为什么必须分片】原先 `dirtySongs` 全部塞进**一个** IDB 事务。一次事务内的 N 次 `put` 会在
 * 事务提交时并行 structured clone 全部记录 —— 顶满规模（2000 首 × 600 行）实测单这一步就要数秒，
 * 且全程占着主线程（structured clone 在主线程跑），期间页面完全不动。开发面板「顶满并覆盖」的
 * 长卡顿主要来自这里，不是生成。
 *
 * 【为什么分片后不能只靠事务的异步性】分片把「一次几秒的长任务」拆成多个中任务，但每个事务的
 * 排队与提交仍在同一个任务里连续发生 —— 必须在片与片之间显式让出事件循环（见 yieldToEventLoop），
 * 浏览器才有机会插进来绘制、响应点击。否则分片只是把一段长卡顿换成 N 段连续卡顿，观感一样。
 *
 * 【为什么不像读取那样要求原子】写入的分片粒度只影响「一次刷写分几个事务」，不影响语义：
 * 中途失败时 `songPersistence.flushOnce` 会把**整批**重新登记回脏集合（见其 catch），
 * 下次刷写重放整个 delta，不会留下「前一半写了、后一半没写」的持久状态。
 *
 * 【片大小为什么不敏感】实测 200 / 500 / 全量一事务的总耗时几乎一致（±0.5%），
 * IDB 的 structured clone 成本与事务边界无关；分片在这里的唯一作用是**给让出制造落点**，
 * 故取一个能稳定制造落点的值即可，不必调优。
 */
export const FLUSH_CHUNK_SIZE = 200;

/**
 * 让出一次事件循环。用 setTimeout 而不是 queueMicrotask / `await Promise.resolve()`：微任务在同一个
 * 任务里连续排空，不给浏览器插进来绘制的机会，等于没让。
 */
const yieldToEventLoop = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

export const songRepository: SongRepository = {
  async loadSongs() {
    // 读取阶段用时长估算顶住（区间的前 10%）：`idb.getAll` 是一次不可分割的调用，拿不到
    // 「已读多少条」，只报 label 会让条儿在顶满规模的数百毫秒里停在原地不动。
    // 估算在下面第一片清洗上报真实读数时立刻被接管，故它只覆盖读取这一段。
    const readPhase = withBootPhase(BOOT_PHASES.songs, BOOT_LABEL, 600);
    // 先报「正在读取」再 await：读本身在顶满规模下就要数百毫秒，期间占位若还停在上一阶段的
    // 读数，用户看到的是一个不动的数字 + 一条不动的条儿，与卡死无法区分
    reportBootProgress({ label: BOOT_LABEL, phase: BOOT_PHASES.songs, done: 0, total: 0 });
    const [stored, orderMeta] = await Promise.all([
      idb.getAll('songs').finally(() => readPhase.stop()),
      idb.get('syncMeta', songOrderIndex.key),
    ]);
    // 分片清洗 + 片间让出事件循环（理由见 SANITIZE_CHUNK_SIZE）。分片只切输入，不传 validChordIds：
    // 本域拿不到和弦全集，理由见 sanitizeSongList 的说明
    const sanitized: Song[] = [];
    const total = stored.length;
    for (let offset = 0; offset < total; offset += SANITIZE_CHUNK_SIZE) {
      sanitized.push(...sanitizeSongList(stored.slice(offset, offset + SANITIZE_CHUNK_SIZE)));
      // 进度口径是「已清洗多少首」而不是「已读多少」：清洗才是这一段里真正耗时的部分，
      // 用读取字节数做分母会让进度条在清洗阶段长时间停住
      reportBootProgress({
        label: BOOT_LABEL,
        phase: BOOT_PHASES.songs,
        done: Math.min(offset + SANITIZE_CHUNK_SIZE, total),
        total,
      });
      if (offset + SANITIZE_CHUNK_SIZE < total) await yieldToEventLoop();
    }
    // 索引命中者按索引序输出；索引缺失/漂移的记录追加尾部，绝不因索引损坏而丢歌
    return orderEntitiesByIndex(sanitized, orderMeta?.ids, song => song.id);
  },
  async saveSong(song) {
    // store 传入的可能是响应式代理（Proxy 无法被 IDB structuredClone），且展开复制来的对象还会
    // 带着**嵌套**代理 —— 故用 toCloneable 而不是裸 toRaw。理由与 flushChanges 同源（见那里的长注释）
    await idb.put('songs', toCloneable(song));
  },
  async removeSong(id) {
    await idb.delete('songs', id);
  },
  async saveSongIds(ids) {
    await idb.put('syncMeta', songOrderIndex.createMeta(ids));
  },
  async listSongIds() {
    const keys = await idb.getAllKeys('songs');
    // IDB 主键天然是裸 string：这里是整条链唯一的品牌注入点，不再把裸 string 漏给调用方
    return keys.filter((key): key is string => isString(key)).map(toSongId);
  },
  async flushChanges({ removedIds, dirtySongs, orderIds }) {
    // 删除**先单独落一个事务**：配额熔断时 put/add 会抛错并使整个事务 abort（见 idb.withQuotaGuard /
    // runTx），若删除与写入同事务，删除会被连带回滚 —— 而删除正是用户释放空间、恢复可写的唯一手段，
    // 熔断于是变成不可自愈的死锁。删除类操作在熔断下放行，所以这一步必定提交。
    if (removedIds.length > 0)
      await idb.runTx(['songs'], get => {
        const songStore = get('songs');
        for (const id of removedIds) songStore.delete(id);
      });

    if (dirtySongs.length === 0 && !orderIds) return;
    // 【顺序索引必须先单独落】它与 dirtySongs 原先同事务，但分片之后 dirtySongs 会跨多个事务，
    // 再挂在这串事务的最后一个上会让「索引已写、某些歌还没写」的窗口变得更长。索引是派生数据
    // （loadSongs 对索引缺失/漂移的记录追加尾部，绝不因索引损坏丢歌），独立成事务既不损语义，
    // 也让「最后一首歌写完」成为整个刷写完成的唯一信号（见下方 return）。
    if (orderIds) await idb.runTx(['syncMeta'], get => void get('syncMeta').put(songOrderIndex.createMeta(orderIds)));
    if (dirtySongs.length === 0) return;

    // 分片写入：每片一个事务，片间让出事件循环（理由见 FLUSH_CHUNK_SIZE）。
    //
    // 【为什么是 toCloneable 而不是 toPlainPersistable】toPlainPersistable 是**无条件**的整图深克隆：
    // 实测 2000 首 × 600 行要 2065ms，而 IDB 收到值后自己还会 structured clone 一遍（实测 3.1s）
    // —— 那次才是必需的 copy，前面这次是纯重复劳动，占了整条落盘链路的三分之一。
    // toCloneable 只修「可克隆性」这一件事：**惰性**下钻、全 raw 的子树原引用带过
    // （实测顶满规模 34ms，与 toPlainPersistable 差一个数量级）。
    //
    // 【为什么不是裸 toRaw】`toRaw` 只剥顶层，而代理会藏在两个「只看本层发现不了」的位置：
    //   ① 展开复制 `{ ...reactiveSong }` 留下的嵌套代理；
    //   ② **raw 容器里的代理** —— Vue 深层响应式是读时按需包代理，`toRaw(map)` 只让 Map 自己变 raw，
    //      里面装的 reactive 槽位对象一个都不会跟着变 raw。`chordMap` 这种「Map 套槽位对象」的结构
    //      正是这一条，漏掉即整批落盘静默失败（IDB 抛 DataCloneError，被 flushOnce 的 catch 吞成重试）。
    //（回归覆盖见 tests/platform/toCloneable.test.ts 的两条形态用例、tests/ui/songStoreCrossSong.test.ts
    // 的「落盘后第 2 首的和弦必须原样保留」、tests/stores/songStoreReorder.test.ts 的「传入新对象时退回逐首标脏」。）
    for (let offset = 0; offset < dirtySongs.length; offset += FLUSH_CHUNK_SIZE) {
      const chunk = dirtySongs.slice(offset, offset + FLUSH_CHUNK_SIZE).map(toCloneable);
      await idb.runTx(['songs'], get => {
        const songStore = get('songs');
        for (const song of chunk) songStore.put(song);
      });
      // 已是最后一片时不再让出：让出一次要多等一个宏任务，而这次刷写马上就要返回了
      if (offset + FLUSH_CHUNK_SIZE < dirtySongs.length) await yieldToEventLoop();
    }
  },
};
