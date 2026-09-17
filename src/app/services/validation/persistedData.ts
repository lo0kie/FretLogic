// 直连 chordRepository 而非 @/domains/chord 门面：门面 re-export 了 WorkbenchView 等懒加载
// 组件（其 useSortableList → sortablejs），桶导入会把整条组件链拖回首屏闭包，破坏分块预算
import {
  dedupeChordsByFingerprint,
  fillMissingTimestamps,
  sanitizeChordEntity,
  sanitizeChords,
  sanitizeGroupEntity,
  sanitizeGroups,
} from '@/domains/chord/model/chordRepository';
import { pruneOrphanChordRefs } from '@/domains/score/model/chordSlots';
import { sanitizeSongEntity, sanitizeSongs } from '@/domains/score/model/songRepository';

import type { GroupDraft, Timestamped } from '@/domains/chord/model/chordRepository';
import type { Group } from '@/domains/chord/types';
import type { SongDraft } from '@/domains/score/model/songRepository';

export {
  dedupeChordsByFingerprint,
  fillMissingTimestamps,
  sanitizeChordEntity,
  sanitizeGroupEntity,
  sanitizeSongEntity,
  type GroupDraft,
  type SongDraft,
  type Timestamped,
};

/**
 * 清洗持久化数据（旧存储转录 / 导入备份等启动入口共用）：
 * 分组/和弦/歌曲逐层清洗补齐时间戳；和弦指向不存在分组时剔除；
 * 歌曲内指向不存在和弦的引用剪除（未知和弦 id 因快照可能缺失而保留）。
 */
export const sanitizePersistedData = (data: { groups?: unknown; chords?: unknown | null; songs?: unknown }) => {
  const now = Date.now();
  const groups = fillMissingTimestamps(sanitizeGroups(data.groups), now) as Group[];
  const hasChordSnapshot = data.chords !== null;
  const chords = fillMissingTimestamps(sanitizeChords(data.chords, new Set(groups.map(group => group.id))), now);
  const validChordIds = new Set(chords.map(chord => chord.id));
  const songs = fillMissingTimestamps(
    hasChordSnapshot
      ? sanitizeSongs(data.songs).map(song => {
          const { map } = pruneOrphanChordRefs(song.chordMap, validChordIds, { preserveUnknown: true });
          return { ...song, chordMap: map };
        })
      : sanitizeSongs(data.songs),
    now
  );

  return { groups, chords, songs };
};
