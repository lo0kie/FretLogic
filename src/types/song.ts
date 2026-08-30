import type { Brand, Capo, ChordId, SlotKey, SongId } from './chord';

/** 谱面行 id（品牌字符串，防与其他 string 混用；由 matchLineIds 生成） */
export type LineId = Brand<string, 'LineId'>;

export interface Song {
  id: SongId;
  title: string;
  lyrics: string;
  lineIds: LineId[];
  playKey: string;
  capo: Capo;
  /** 槽位 key -> 和弦 id；内存中用 Map（size/has/delete 更直接），持久化/同步时序列化为普通对象 */
  chordMap: Map<SlotKey, ChordId>;
  /** 乐观锁版本号；清洗层与工厂保证补齐 */
  version: number;
  /** 创建时间戳（毫秒）；清洗层保证补齐 */
  createdAt: number;
  /** 最后更新时间戳（毫秒）；清洗层保证补齐 */
  updatedAt: number;
}
