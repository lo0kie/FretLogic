import type { Chord, Group, Song } from '@/types';
import { GroupSortRule } from '@/types';
import { normalizeChord, pruneOrphanChordRefs } from '@/utils/chord-fretboard';
import { FRET_COUNTS } from '@/utils/constants';
import { computeChordFingerprint, Tuning } from '@/utils/musicTheory';

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord => !!value && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const isBoundedNumber = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const isValidStringEntity = (value: unknown): value is [number, boolean] => {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    value[0] >= -1 &&
    typeof value[1] === 'boolean'
  );
};

const sanitizeGroups = (groups: unknown): Group[] => {
  if (!Array.isArray(groups)) return [];

  return groups
    .filter((group): group is RawRecord => {
      if (!isRecord(group)) return false;
      return typeof group.id === 'string' && typeof group.name === 'string';
    })
    .map((group): Group => {
      const sortRule = Object.values(GroupSortRule).includes(group.sortRule as GroupSortRule)
        ? (group.sortRule as GroupSortRule)
        : GroupSortRule.ROOT_PITCH;
      const hasValidSortKey =
        sortRule === GroupSortRule.KEY_DEGREE && typeof group.sortKey === 'string' && !!group.sortKey;

      return {
        id: group.id as string,
        name: group.name as string,
        sortRule,
        ...(hasValidSortKey ? { sortKey: group.sortKey as string } : {}),
      };
    });
};

const resolveRootStringIndex = (chord: RawRecord): number | null => {
  const index = chord.rootStringIndex;
  if (!isBoundedNumber(index, 0, 5) || !Array.isArray(chord.strings)) return null;

  const stringEntity = chord.strings[index];
  return Array.isArray(stringEntity) && typeof stringEntity[0] === 'number' && stringEntity[0] >= 0 ? index : null;
};

const sanitizeChords = (chords: unknown, validGroupIds: Set<string>): Chord[] => {
  if (!Array.isArray(chords)) return [];

  const sanitizedChords: Chord[] = [];
  const seenFingerprints = new Set<string>();

  for (const rawChord of chords) {
    if (!isRecord(rawChord)) continue;
    if (typeof rawChord.id !== 'string') continue;
    if (!rawChord.chordName && !rawChord.nameSegments) continue;
    if (typeof rawChord.groupId !== 'string' || !validGroupIds.has(rawChord.groupId)) continue;
    if (!Array.isArray(rawChord.strings) || rawChord.strings.length !== 6) continue;
    if (!rawChord.strings.every(isValidStringEntity)) continue;

    const draft: Chord = {
      ...(rawChord as unknown as Chord),
      nameSegments: (rawChord.nameSegments as Chord['nameSegments']) ?? null,
      fretCount: FRET_COUNTS.includes(rawChord.fretCount as Chord['fretCount'])
        ? (rawChord.fretCount as Chord['fretCount'])
        : 3,
      capo: isBoundedNumber(rawChord.capo, 0, 12) ? rawChord.capo : 0,
      tuning: Object.values(Tuning).includes(rawChord.tuning as Tuning) ? (rawChord.tuning as Tuning) : Tuning.STANDARD,
      rootStringIndex: resolveRootStringIndex(rawChord),
    };
    const { chord } = normalizeChord(draft);
    const fingerprint = `${chord.groupId}::${computeChordFingerprint(chord)}`;
    if (seenFingerprints.has(fingerprint)) continue;

    seenFingerprints.add(fingerprint);
    sanitizedChords.push(chord);
  }

  return sanitizedChords;
};

const sanitizeChordMap = (chordMap: unknown): Record<string, string> => {
  if (!isRecord(chordMap)) return {};

  const entries: [string, string][] = [];

  for (const [key, chordId] of Object.entries(chordMap)) {
    if (isNonEmptyString(key) && isNonEmptyString(chordId)) entries.push([key, chordId]);
  }

  return Object.fromEntries(entries);
};

const sanitizeSongs = (songs: unknown): Song[] => {
  if (!Array.isArray(songs)) return [];

  const validSongIds = new Set<string>();

  return songs.flatMap((rawSong): Song[] => {
    if (!isRecord(rawSong)) return [];
    if (typeof rawSong.id !== 'string' || !rawSong.id || validSongIds.has(rawSong.id)) return [];
    if (typeof rawSong.title !== 'string') return [];

    const legacyKey = typeof rawSong.key === 'string' && rawSong.key ? rawSong.key : 'C';
    const song: Song = {
      id: rawSong.id,
      title: rawSong.title,
      lyrics: typeof rawSong.lyrics === 'string' ? rawSong.lyrics : '',
      lineIds: Array.isArray(rawSong.lineIds) ? rawSong.lineIds.filter(isNonEmptyString) : [],
      playKey: typeof rawSong.playKey === 'string' && rawSong.playKey ? rawSong.playKey : legacyKey,
      capo: isBoundedNumber(rawSong.capo, 0, 12) ? rawSong.capo : 0,
      chordMap: sanitizeChordMap(rawSong.chordMap),
      version: typeof rawSong.version === 'number' && Number.isFinite(rawSong.version) ? rawSong.version : 1,
    };

    validSongIds.add(song.id);
    return [song];
  });
};

export const sanitizePersistedData = (data: { groups?: unknown; chords?: unknown | null; songs?: unknown }) => {
  const groups = sanitizeGroups(data.groups);
  const hasChordSnapshot = data.chords !== null;
  const chords = sanitizeChords(data.chords, new Set(groups.map(group => group.id)));
  const validChordIds = new Set(chords.map(chord => chord.id));
  const songs = hasChordSnapshot
    ? sanitizeSongs(data.songs).map(song => {
        const { map } = pruneOrphanChordRefs(song.chordMap, validChordIds, { preserveUnknown: true });
        return { ...song, chordMap: map };
      })
    : sanitizeSongs(data.songs);

  return { groups, chords, songs };
};
