import type { ChordId, KeyName } from '@/domains/chord/types';
import type { Brand } from '@/platform/types';
import type { Capo } from '@/platform/types/instrument';

/** 乐谱 id */
export type SongId = Brand<string, 'SongId'>;

/** 谱面槽位 key（如 line_x_start_0），由 scoreModel 的构建函数产生 */
export type SlotKey = Brand<string, 'SlotKey'>;

export type { Capo };

/** 谱面行 id（品牌字符串，防与其他 string 混用；由 matchLineIds 生成） */
export type LineId = Brand<string, 'LineId'>;

/**
 * 某行谱面的和弦槽位（v7 起 chordMap 按行分组）：
 * - `char`：字符槽位 index -> 和弦 id（index 受该行文本长度约束）
 * - `start` / `end`：行首 / 行尾的有序边和弦 id 列表
 * 引用完整性由结构天然表达：删除某行即删除整条 `Map<LineId, ChordLineSlots>` 键，僵尸槽位在结构上不可能存在。
 */
export interface ChordLineSlots {
  char: Map<number, ChordId>;
  start: ChordId[];
  end: ChordId[];
}

export interface Song {
  id: SongId;
  title: string;
  /** 歌手（纯展示元数据，空串表示无；不参与指纹/乐理计算） */
  singer: string;
  /** 原调（歌曲原始调性，'' 表示未设置；不参与乐理计算，仅展示与导出表头） */
  originalKey: KeyName | '';
  /** 拍号（如 4/4、6/8，'' 表示未设置；纯展示元数据，不参与乐理计算）。
   *  刻意**不收窄**到 `SONG_TIME_SIGNATURES`：导入的文本谱里 `9/8` 这类合法但未列入预设的拍号很常见，
   *  收窄会让它们在清洗/导入时静默变空串。接受口径是格式校验（`isTimeSignatureFormat`），
   *  预设联合（`SongTimeSignature`）只用于下拉与筛选。 */
  timeSignature: string;
  lyrics: string;
  lineIds: LineId[];
  /** 指法调（参与乐理计算：演唱调 = playKey 升 capo 半音，见 computeSongKey）。
   *  收窄到 `KeyName` 后，清洗层 / 文本导入 / 移调回写三处外部入口都必须过 `isKeyName` ——
   *  此前只做 `isString && 非空`，任何字符串都能落库并进 `transposeChordName`。 */
  playKey: KeyName;
  capo: Capo;
  /** 按行分组的和弦槽位：lineId -> { char, start, end }；内存中用 Map，持久化/同步时序列化为嵌套普通对象 */
  chordMap: Map<LineId, ChordLineSlots>;
  /** 乐观锁版本号；清洗层与工厂保证补齐 */
  version: number;
  /** 创建时间戳（毫秒）；清洗层保证补齐 */
  createdAt: number;
  /** 最后更新时间戳（毫秒）；清洗层保证补齐 */
  updatedAt: number;
}
