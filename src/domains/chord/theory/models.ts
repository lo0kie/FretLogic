import { isMuted } from '@/domains/chord/theory/theory';

import type { Chord, Group } from '@/domains/chord/types';

export const ChordRecord = {
  id: (chord: Chord): string => chord.id,
  isActive: (chord: Chord): boolean => chord.strings.some(string => string[0] >= 0),
  isMuted,
};

export const GroupRecord = {
  id: (group: Group): string => group.id,
};
