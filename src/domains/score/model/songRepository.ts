import { isKeyName } from '@/domains/chord/theory/theory';
import { isCapoValue } from '@/domains/fretboard/model/coordinates';
import { DEFAULT_SCORE_TITLE, isTimeSignatureFormat } from '@/domains/score/constants';
import { plainToChordMap, pruneOrphanChordRefs } from '@/domains/score/model/chordSlots';
import { fallbackLineId, toSongId } from '@/domains/score/model/scoreModel';
import { idb } from '@/platform/services/storage';
import { defineOrderIndex, orderEntitiesByIndex } from '@/platform/services/storage/orderIndex';
import {
  fillMissingTimestamps,
  isNumber,
  isObject,
  isString,
  isValidTimestamp,
  toPlainPersistable,
} from '@/platform/utils/common';
import { logger } from '@/platform/utils/logger';

import type { KeyName } from '@/domains/chord/types';
import type { ChordLineSlots, LineId, Song, SongId } from '@/domains/score/types';

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

export const songRepository: SongRepository = {
  async loadSongs() {
    const [stored, orderMeta] = await Promise.all([idb.getAll('songs'), idb.get('syncMeta', songOrderIndex.key)]);
    // 不传 validChordIds：本域拿不到和弦全集，理由见 sanitizeSongList 的说明
    const sanitized = sanitizeSongList(stored);
    // 索引命中者按索引序输出；索引缺失/漂移的记录追加尾部，绝不因索引损坏而丢歌
    return orderEntitiesByIndex(sanitized, orderMeta?.ids, song => song.id);
  },
  async saveSong(song) {
    // toRaw：store 传入的可能是响应式代理，Proxy 无法被 IDB structuredClone（DataCloneError）
    await idb.put('songs', toPlainPersistable(song));
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
    // 写入与顺序索引仍同事务：同为「新增/更新」语义，失败一起回滚也不会丢掉上面已提交的删除。
    // 顺序索引是派生数据（loadSongs 对索引缺失/漂移的记录追加尾部，绝不因索引损坏丢歌），
    // 因此它随写入一起失败是可接受的。
    await idb.runTx(['songs', 'syncMeta'], get => {
      const songStore = get('songs');
      for (const song of dirtySongs) songStore.put(toPlainPersistable(song));
      if (orderIds) get('syncMeta').put(songOrderIndex.createMeta(orderIds));
    });
  },
};
