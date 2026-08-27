import type { ChordNameSegments, NoteInput } from '@/types';
import { createLruCache } from '@/utils/core/lruCache';
import { GRAMMAR_TEMPLATES } from './grammar';
import { nameToSegments } from './theory';

export type ChordSlot =
  | 'root'
  | 'third_major'
  | 'third_minor'
  | 'sus2'
  | 'sus4'
  | 'fifth_perfect'
  | 'fifth_dim'
  | 'fifth_aug'
  | 'seventh_minor'
  | 'seventh_major'
  | 'seventh_dim'
  | 'ninth'
  | 'ninth_flat'
  | 'ninth_sharp'
  | 'eleventh'
  | 'eleventh_sharp'
  | 'thirteenth'
  | 'thirteenth_flat'
  | 'sixth'
  | 'slash_bass'
  | 'extra';

export type RoleConfidence = 'core' | 'anchor' | 'optional' | 'extra';

export interface RoleAssignment {
  noteLabel: string;
  pitchIndex: number;
  interval: number;
  role: ChordSlot;
  confidence: RoleConfidence;
}

export interface ChordCandidate {
  chordName: string;
  rootLabel: string;
  rootPitch: number;
  suffix: string;
  category: 'triad' | 'seventh' | 'extended' | 'altered' | 'sus' | 'power';
  roles: RoleAssignment[];
  purity: number;
  extraCount: number;
  score: number;
  tier: 'best' | 'alternative' | 'theoretical';
  segments?: ChordNameSegments;
}

export interface AnalyzeResult {
  candidates: ChordCandidate[];
  bestRootPitch: number;
  best: ChordCandidate | undefined;
  alternatives: ChordCandidate[];
  theoretical: ChordCandidate[];
}

interface SlotDef {
  interval: number;
  role: ChordSlot;
  confidence: RoleConfidence;
}

export interface GrammarTemplate {
  suffix: string;
  category: ChordCandidate['category'];
  baseWeight: number;
  required: SlotDef[];
  optional?: SlotDef[];
  conflicts: number[];
}

interface CompiledTemplate {
  template: GrammarTemplate;
  reqMask: number;
  optMask: number;
  conflictMask: number;
}

const COMPILED_TEMPLATES: CompiledTemplate[] = GRAMMAR_TEMPLATES.map(t => {
  let reqMask = 0;
  for (const r of t.required) reqMask |= 1 << r.interval;
  let optMask = 0;
  if (t.optional) {
    for (const o of t.optional) optMask |= 1 << o.interval;
  }
  let conflictMask = 0;
  for (const c of t.conflicts) conflictMask |= 1 << c;
  return { template: t, reqMask, optMask, conflictMask };
});

const WEIGHTS = {
  PURITY: 0.5,
  BASS: 0.28,
  COMMONNESS: 0.1,
  EXTRA_PENALTY: 0.25,
};

const MIN_PURITY = 0.62;
const BEST_GAP = 6;
const TOP_EVALUATE_LIMIT = 10;

const normalizePitch = (p: number) => ((p % 12) + 12) % 12;

const toIntervalMask = (pitchMask: number, root: number): number => {
  const r = root % 12;
  if (r === 0) return pitchMask & 0xfff;
  return ((pitchMask >>> r) | (pitchMask << (12 - r))) & 0xfff;
};

const POPCOUNT = (() => {
  const t = new Uint8Array(4096);
  for (let i = 0; i < 4096; i++) {
    let n = 0,
      m = i;
    while (m) {
      n += m & 1;
      m >>= 1;
    }
    t[i] = n;
  }
  return t;
})();

const bitCount = (m: number) => POPCOUNT[m & 0xfff] ?? 0;

interface RawHitCandidate {
  template: GrammarTemplate;
  rootPitch: number;
  rootLabel: string;
  intervalMask: number;
  lowestInterval: number;
  isSlash: boolean;
  slashBassLabel: string;
  purity: number;
  extraCount: number;
  score: number;
}

function fastSoftScore(
  purity: number,
  extraCount: number,
  isSlash: boolean,
  lowestInterval: number,
  explicitRoot: boolean,
  template: GrammarTemplate
): number {
  let bassScore = 1.0;

  if (isSlash) {
    if (explicitRoot) {
      bassScore = 1.0;
    } else {
      const bassInCore = template.required.some(r => r.interval === lowestInterval);
      const bassInOpt = template.optional?.some(r => r.interval === lowestInterval) ?? false;

      if (bassInCore) {
        bassScore = 0.78;
      } else if (bassInOpt) {
        bassScore = 0.68;
      } else if (template.category === 'triad' || template.category === 'power') {
        bassScore = 0.55;
      } else {
        bassScore = 0.35;
      }
    }
  }

  const commonness = template.baseWeight / 200;
  const extraPenalty = Math.min(extraCount * WEIGHTS.EXTRA_PENALTY, 0.75);

  let naturalBonus = 0;
  if (!isSlash && purity >= 0.95) {
    naturalBonus = 0.04;
  }

  const total =
    purity * WEIGHTS.PURITY + bassScore * WEIGHTS.BASS + commonness * WEIGHTS.COMMONNESS - extraPenalty + naturalBonus;

  return Math.round(total * 1000) / 10;
}

function populateRoles(hit: RawHitCandidate, labelByPitch: (string | undefined)[]): ChordCandidate {
  const { rootPitch, rootLabel, intervalMask, lowestInterval, isSlash, slashBassLabel, template } = hit;
  const roles: RoleAssignment[] = [];
  const usedIntervals = new Set<number>();

  for (const req of template.required) {
    const p = (rootPitch + req.interval) % 12;
    roles.push({
      noteLabel: labelByPitch[p] || '',
      pitchIndex: p,
      interval: req.interval,
      role: req.role,
      confidence: req.confidence,
    });
    usedIntervals.add(req.interval);
  }

  if (template.optional) {
    for (const opt of template.optional) {
      if (intervalMask & (1 << opt.interval) && !usedIntervals.has(opt.interval)) {
        const p = (rootPitch + opt.interval) % 12;
        roles.push({
          noteLabel: labelByPitch[p] || '',
          pitchIndex: p,
          interval: opt.interval,
          role: opt.role,
          confidence: opt.confidence,
        });
        usedIntervals.add(opt.interval);
      }
    }
  }

  if (isSlash && !usedIntervals.has(lowestInterval)) {
    const p = (rootPitch + lowestInterval) % 12;
    roles.push({
      noteLabel: labelByPitch[p] || '',
      pitchIndex: p,
      interval: lowestInterval,
      role: 'slash_bass',
      confidence: 'optional',
    });
    usedIntervals.add(lowestInterval);
  }

  for (let i = 0; i < 12; i++) {
    if (intervalMask & (1 << i) && !usedIntervals.has(i)) {
      const p = (rootPitch + i) % 12;
      roles.push({
        noteLabel: labelByPitch[p] || '',
        pitchIndex: p,
        interval: i,
        role: 'extra',
        confidence: 'extra',
      });
    }
  }

  const chordName = `${rootLabel}${template.suffix}${slashBassLabel}`;

  return {
    chordName,
    rootLabel,
    rootPitch,
    suffix: template.suffix,
    category: template.category,
    roles,
    purity: hit.purity,
    extraCount: hit.extraCount,
    score: hit.score,
    tier: 'theoretical',
    segments: nameToSegments(chordName) ?? undefined,
  };
}

function assignTiers(candidates: ChordCandidate[]): void {
  if (candidates.length === 0) return;
  const bestScore = candidates[0]!.score;

  for (const c of candidates) {
    const gap = bestScore - c.score;
    if (gap <= 0.5) c.tier = 'best';
    else if (gap <= BEST_GAP) c.tier = 'alternative';
    else c.tier = 'theoretical';
  }
}

const cache = createLruCache<AnalyzeResult>(80);

function rawAnalyze(notes: NoteInput[], explicitRootPitch: number | null): AnalyzeResult {
  if (notes.length === 0) {
    return {
      candidates: [],
      bestRootPitch: 0,
      best: undefined,
      alternatives: [],
      theoretical: [],
    };
  }

  let pitchMask = 0;
  const lowestNote = notes.reduce((min, n) => (n.stringIndex < min.stringIndex ? n : min), notes[0]!);
  const labelByPitch: (string | undefined)[] = new Array(12);

  for (const n of notes) {
    const p = normalizePitch(n.pitchIndex);
    pitchMask |= 1 << p;
    if (labelByPitch[p] === undefined) labelByPitch[p] = n.label;
  }

  const totalInputNotes = bitCount(pitchMask);
  const rootPitches: number[] = [];

  if (explicitRootPitch !== null) {
    rootPitches.push(normalizePitch(explicitRootPitch));
  } else {
    for (let p = 0; p < 12; p++) {
      if (pitchMask & (1 << p)) rootPitches.push(p);
    }
  }

  const rawHits: RawHitCandidate[] = [];

  for (const rootPitch of rootPitches) {
    const rootLabel = labelByPitch[rootPitch] || '';
    const intervalMask = toIntervalMask(pitchMask, rootPitch);
    const lowestInterval = normalizePitch(lowestNote.pitchIndex - rootPitch);
    const isSlash = normalizePitch(lowestNote.pitchIndex) !== rootPitch;
    const slashBassLabel = isSlash ? `/${lowestNote.label}` : '';

    for (const comp of COMPILED_TEMPLATES) {
      if ((intervalMask & comp.conflictMask) !== 0) continue;
      if ((intervalMask & comp.reqMask) !== comp.reqMask) continue;

      let explainedMask = intervalMask & (comp.reqMask | comp.optMask);
      if (isSlash) explainedMask |= intervalMask & (1 << lowestInterval);

      const explainedCount = bitCount(explainedMask);
      const purity = totalInputNotes === 0 ? 0 : explainedCount / totalInputNotes;

      if (purity < MIN_PURITY) continue;

      const extraCount = totalInputNotes - explainedCount;
      const score = fastSoftScore(
        purity,
        extraCount,
        isSlash,
        lowestInterval,
        explicitRootPitch !== null,
        comp.template
      );

      rawHits.push({
        template: comp.template,
        rootPitch,
        rootLabel,
        intervalMask,
        lowestInterval,
        isSlash,
        slashBassLabel,
        purity,
        extraCount,
        score,
      });
    }
  }

  rawHits.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const topHits: RawHitCandidate[] = [];
  for (const h of rawHits) {
    const name = `${h.rootLabel}${h.template.suffix}${h.slashBassLabel}`;
    if (!seen.has(name)) {
      seen.add(name);
      topHits.push(h);
      if (topHits.length >= TOP_EVALUATE_LIMIT) break;
    }
  }

  const uniqueCandidates: ChordCandidate[] = topHits.map(h => populateRoles(h, labelByPitch));

  assignTiers(uniqueCandidates);

  const bestRootPitch =
    uniqueCandidates.length > 0 ? uniqueCandidates[0]!.rootPitch : normalizePitch(lowestNote.pitchIndex);

  const best = uniqueCandidates.find(c => c.tier === 'best');
  const alternatives = uniqueCandidates.filter(c => c.tier === 'alternative');
  const theoretical = uniqueCandidates.filter(c => c.tier === 'theoretical');

  return {
    candidates: uniqueCandidates,
    bestRootPitch,
    best,
    alternatives,
    theoretical,
  };
}

export function analyzeChordGraph(notes: NoteInput[], explicitRootPitch: number | null = null): AnalyzeResult {
  if (notes.length === 0) {
    return {
      candidates: [],
      bestRootPitch: 0,
      best: undefined,
      alternatives: [],
      theoretical: [],
    };
  }

  let key = `${explicitRootPitch ?? 'auto'}:`;
  for (const n of notes) {
    key += `${n.stringIndex}_${n.pitchIndex}_${n.label}|`;
  }

  const hit = cache.get(key);
  if (hit) return hit;

  const result = rawAnalyze(notes, explicitRootPitch);

  cache.set(key, result);
  return result;
}
