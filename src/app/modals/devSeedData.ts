/**
 * 开发面板用的大规模测试数据工厂。
 *
 * 只在 dev 运行时被引用。它曾经在 dist 里白带一个 chunk：`v-if="IS_DEV"` 只挡「渲染」，挡不住
 * `defineAsyncComponent(() => import('@/app/modals/DevPanel.vue'))` 这个**模块顶层无条件执行**的
 * 调用 —— 它是不透明调用，Rollup 不能假设其无副作用，动态 import 边因而保留（本模块与 DevPanel
 * 都在其中，且永不会被请求）。TopHeader 现按 `const DevPanel = IS_DEV ? defineAsyncComponent(...)
 * : undefined` 收口，判据在模块顶层即被判死，两块代码才真正不进生产包。**改回无条件写法之前请先
 * 看这段注释。**
 *
 * 生成两类数据：
 *  - **和弦库**：由「根音 × 品质 × 把位窗口」驱动。指法从**音集反推**——每根弦只落在该和弦的
 *    音级上，故音高与和弦名天然自洽，不会产生「标注与实际不一致」的校验警告；同一和弦的不同
 *    (把位, 品数, 根音弦) 组合天然构成多指法变体，用于压测变体面板 / 分组卡片 / 指板位图缓存。
 *  - **乐谱**：按段落组织的谱面（标记行 / 长短歌词句 / 纯和弦行 / 空行）＋ 逐行字符槽位绑定
 *    上一步的和弦 id，用于压测列表滚动、拼音排序、和弦反查歌曲的倒排索引、预览分页渲染与页缓存。
 *
 * 随机数用固定种子的 LCG（不用 Math.random）：同一档位每次生成结果完全一致，便于复现问题。
 */
import { createChord, createGroup } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, segmentsToString, Tuning } from '@/domains/chord/theory/theory';
import { GroupSortRule } from '@/domains/chord/types';
import { charKey, matchLineIds, toSongId } from '@/domains/score/model/scoreModel';
import { generateUUID } from '@/platform/utils/common';

import type { Chord, ChordId, Group } from '@/domains/chord/types';
import type { GuitarStringEntity } from '@/domains/fretboard/types';
import type { SlotKey, Song } from '@/domains/score/types';

/** 六弦标准调弦各弦 MIDI 音高（与 theory 的 TUNING_MAPPING_STANDARD 同序） */
const STRING_MIDI = [40, 45, 50, 55, 59, 64] as const;

const ROOT_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** 品质后缀 → 相对根音的半音音程（覆盖 grammar 里常用的三类音、挂留、六九、变化和弦） */
const QUALITIES: readonly { suffix: string; intervals: readonly number[] }[] = [
  { suffix: '', intervals: [0, 4, 7] },
  { suffix: 'm', intervals: [0, 3, 7] },
  { suffix: '7', intervals: [0, 4, 7, 10] },
  { suffix: 'm7', intervals: [0, 3, 7, 10] },
  { suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { suffix: 'sus2', intervals: [0, 2, 7] },
  { suffix: 'sus4', intervals: [0, 5, 7] },
  { suffix: 'dim', intervals: [0, 3, 6] },
  { suffix: 'aug', intervals: [0, 4, 8] },
  { suffix: '6', intervals: [0, 4, 7, 9] },
  { suffix: 'm6', intervals: [0, 3, 7, 9] },
  { suffix: 'add9', intervals: [0, 2, 4, 7] },
  { suffix: 'madd9', intervals: [0, 2, 3, 7] },
  { suffix: '9', intervals: [0, 2, 4, 7, 10] },
  { suffix: 'm9', intervals: [0, 2, 3, 7, 10] },
  { suffix: 'maj9', intervals: [0, 2, 4, 7, 11] },
  { suffix: '7sus4', intervals: [0, 5, 7, 10] },
  { suffix: 'dim7', intervals: [0, 3, 6, 9] },
  { suffix: 'm7b5', intervals: [0, 3, 6, 10] },
];

const GROUP_NAMES = [
  '流行',
  '民谣',
  '摇滚',
  '爵士',
  '布鲁斯',
  '放克',
  '拉丁',
  '乡村',
  '古典',
  '指弹',
  '弹唱',
  '即兴',
  '基础和弦',
  '进阶和弦',
  '高阶和弦',
  '七和弦',
  '挂留和弦',
  '转位',
  '开放把位',
  '高把位',
  '横按',
  '双横按',
  '练习曲',
  '参考库',
] as const;

const SINGERS = ['测试歌手甲', '测试歌手乙', '测试歌手丙', '测试歌手丁', '民谣小组', '器乐演奏', ''] as const;

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '5/4'] as const;

/** 歌词词库：两字词为主，随机拼接成行 */
const WORDS = [
  '夜色',
  '人间',
  '远方',
  '归途',
  '灯塔',
  '潮汐',
  '山谷',
  '长风',
  '回忆',
  '流年',
  '星河',
  '旧梦',
  '街道',
  '窗口',
  '雨声',
  '清晨',
  '黄昏',
  '海岸',
  '列车',
  '旅人',
  '麦田',
  '灯火',
  '信笺',
  '琴弦',
  '旋律',
  '回声',
  '晴空',
  '云影',
  '约定',
  '青春',
  '沉默',
  '告别',
  '重逢',
  '依然',
  '缓缓',
  '轻轻',
  '走过',
  '唱起',
  '想着',
  '看着',
] as const;

/** 固定种子 LCG：结果可复现，便于照着同一份数据排查问题 */
const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const pick = <T>(list: readonly T[], rng: () => number): T => list[Math.floor(rng() * list.length)]!;

/**
 * 某根弦在给定把位窗口内能弹出目标音级的全部品位。
 * 与 calcNoteMidi 的语义对齐：品位 0 恒为空弦（不随 fretOffset 移动），1..fretCount 额外加偏移。
 */
const candidateFrets = (stringIndex: number, pitchClass: number, offset: number, fretCount: number): number[] => {
  const base = STRING_MIDI[stringIndex]!;
  const frets: number[] = [];
  if (base % 12 === pitchClass) frets.push(0);
  for (let fret = 1; fret <= fretCount; fret++) {
    if ((base + fret + offset) % 12 === pitchClass) frets.push(fret);
  }
  return frets;
};

/**
 * 按音集反推一个原位指法：最低发声弦必须是根音所在弦（故其下各弦静音），
 * 其余音级尽量各占一根弦以保证和弦完整，剩余弦随机补音（补出来的仍是本和弦音级）。
 * 无解（根音在窗口内放不下）或发声弦不足 3 根时返回 null。
 */
const buildFingering = (
  rootPitch: number,
  intervals: readonly number[],
  offset: number,
  fretCount: number,
  rootString: number,
  preferFlat: boolean,
  rng: () => number
): GuitarStringEntity[] | null => {
  const pitchClasses = intervals.map(interval => (rootPitch + interval) % 12);
  const strings: GuitarStringEntity[] = Array.from({ length: 6 }, () => [-1, preferFlat] as GuitarStringEntity);

  const rootFrets = candidateFrets(rootString, rootPitch, offset, fretCount);
  if (rootFrets.length === 0) return null;
  strings[rootString] = [pick(rootFrets, rng), preferFlat];

  for (const pitchClass of pitchClasses) {
    if (pitchClass === rootPitch) continue;
    for (let s = rootString + 1; s < 6; s++) {
      if (strings[s]![0] !== -1) continue;
      const frets = candidateFrets(s, pitchClass, offset, fretCount);
      if (frets.length === 0) continue;
      strings[s] = [pick(frets, rng), preferFlat];
      break;
    }
  }

  for (let s = rootString + 1; s < 6; s++) {
    if (strings[s]![0] !== -1) continue;
    if (rng() < 0.45) continue; // 静音：让数据里同时存在完整与稀疏的按法
    const pool: number[] = [];
    for (const pitchClass of pitchClasses) {
      for (const fret of candidateFrets(s, pitchClass, offset, fretCount)) {
        if (!pool.includes(fret)) pool.push(fret);
      }
    }
    if (pool.length > 0) strings[s] = [pick(pool, rng), preferFlat];
  }

  return strings.filter(s => s[0] >= 0).length >= 3 ? strings : null;
};

const fingeringSignature = (strings: GuitarStringEntity[], offset: number, fretCount: number): string =>
  `${offset}/${fretCount}/${strings.map(s => s[0]).join(',')}`;

/** 规模档位：从「中等」到「极端」，覆盖常规到极限压力（持久化已迁 IDB，不再受 5MB 配额约束） */
export interface DevTestDataScale {
  key: string;
  label: string;
  /** 每个「根音 × 品质」尝试生成的把位变体数（重复与无解会被丢弃） */
  variantsPerQuality: number;
  songCount: number;
  /** 每首乐谱的总行数区间（含段落标记行与空行，非纯歌词行） */
  linesPerSong: readonly [number, number];
  groupCount: number;
}

export const DEV_TEST_SCALES: readonly DevTestDataScale[] = [
  { key: 'medium', label: '中等', variantsPerQuality: 3, songCount: 120, linesPerSong: [30, 56], groupCount: 12 },
  { key: 'large', label: '大', variantsPerQuality: 9, songCount: 300, linesPerSong: [40, 80], groupCount: 18 },
  { key: 'huge', label: '巨大', variantsPerQuality: 20, songCount: 420, linesPerSong: [28, 56], groupCount: 24 },
  {
    key: 'extreme',
    label: '极端',
    variantsPerQuality: 20,
    songCount: 90,
    linesPerSong: [160, 240],
    groupCount: 24,
  },
];

export interface DevTestDataSet {
  groups: Group[];
  chords: Chord[];
  songs: Song[];
  /**
   * 预估数据体积（字节）：按 JSON 字符数 × 2 的上界估计，仅作为数据规模的粗略参照
   * （持久化已迁 IDB，实际磁盘占用由浏览器引擎编码决定）。
   */
  estimatedBytes: number;
}

const jsonChars = (value: unknown): number =>
  JSON.stringify(value, (_key, val: unknown) => (val instanceof Map ? Object.fromEntries(val) : val)).length;

const buildGroups = (count: number): Group[] =>
  Array.from({ length: count }, (_, index) =>
    createGroup(GROUP_NAMES[index % GROUP_NAMES.length]!, GroupSortRule.ROOT_PITCH)
  );

const buildChords = (groups: Group[], scale: DevTestDataScale): Chord[] => {
  const rng = createRng(0x5eed0001);
  const chords: Chord[] = [];
  const seen = new Set<string>();

  for (let rootPitch = 0; rootPitch < 12; rootPitch++) {
    for (const quality of QUALITIES) {
      const nameSegments = nameToSegments(`${ROOT_NAMES[rootPitch]!}${quality.suffix}`);
      if (!nameSegments) continue;

      for (let attempt = 0; attempt < scale.variantsPerQuality; attempt++) {
        const fretOffset = Math.floor(rng() * 8); // 0..7：覆盖零品与高把位窗口
        const fretCount = (3 + Math.floor(rng() * 3)) as 3 | 4 | 5;
        const rootString = Math.floor(rng() * 4); // 0..3：根音落在低音四弦之一
        const preferFlat = rng() < 0.5;

        const strings = buildFingering(
          rootPitch,
          quality.intervals,
          fretOffset,
          fretCount,
          rootString,
          preferFlat,
          rng
        );
        if (!strings) continue;

        const signature = fingeringSignature(strings, fretOffset, fretCount);
        if (seen.has(signature)) continue;
        seen.add(signature);

        chords.push(
          createChord({
            nameSegments,
            strings,
            fretCount,
            fretOffset: fretOffset as Chord['fretOffset'],
            groupId: groups[Math.floor(rng() * groups.length)]!.id,
            tuning: Tuning.STANDARD,
            rootStringIndex: rootString,
          })
        );
      }
    }
  }

  return chords;
};

/** 段落标记行：真实谱面里主歌 / 副歌的起手标注，本身不绑和弦 */
const SECTION_MARKERS = ['[主歌]', '[副歌]', '[预副歌]', '[桥段]', '[前奏]', '[间奏]', '[尾奏]'] as const;

/** 纯和弦行里相邻和弦名之间的空格数（槽位按字符下标绑定，故需固定间距以对齐） */
const CHORD_LINE_GAP = 2;

/** 可绑定到谱面的和弦引用（纯和弦行需要把名字写进文本，故要带名字） */
interface ChordRef {
  id: ChordId;
  name: string;
}

/**
 * 生成期的谱面行描述。
 *
 * 只描述「这一行是什么」以及（纯和弦行）各和弦名落在第几个字符上；真正的槽位绑定在拿到
 * lineId 之后才做，故这里不出现 SlotKey。
 */
interface SeedLine {
  text: string;
  kind: 'marker' | 'blank' | 'lyric' | 'chord';
  /** 纯和弦行专用：与 chords 同序，值为该和弦名在 text 中的起始字符下标 */
  offsets?: number[];
  chords?: ChordRef[];
}

const buildLyricLine = (rng: () => number, minWords: number, maxWords: number): string => {
  const wordCount = minWords + Math.floor(rng() * (maxWords - minWords + 1));
  let line = '';
  for (let i = 0; i < wordCount; i++) line += pick(WORDS, rng);
  return line;
};

/** 纯和弦行进（间奏 / 扫弦提示行）：文本即和弦名，槽位落在每个和弦名的首字符上 */
const buildChordLine = (rng: () => number, chordRefs: readonly ChordRef[]): SeedLine => {
  const count = 3 + Math.floor(rng() * 4);
  const refs = Array.from({ length: count }, () => pick(chordRefs, rng));
  const offsets: number[] = [];
  let cursor = 0;
  const parts = refs.map(ref => {
    offsets.push(cursor);
    cursor += ref.name.length + CHORD_LINE_GAP;
    return ref.name;
  });
  return { text: parts.join(' '.repeat(CHORD_LINE_GAP)), kind: 'chord', offsets, chords: refs };
};

/**
 * 按段落组织谱面：标记行 → 若干歌词行（其间穿插短句行与纯和弦行）→ 空行，循环至行数达标。
 *
 * 目的是让测试数据覆盖真实谱面的全部行形态：空行（行高坍塌 / 分页）、标记行（无和弦绑定的
 * 长文本行）、短句行（行内槽位密集）、纯和弦行（字符下标与和弦名对齐）。
 */
const buildSongLines = (rng: () => number, chordRefs: readonly ChordRef[], targetLines: number): SeedLine[] => {
  const lines: SeedLine[] = [];
  let markerIndex = Math.floor(rng() * SECTION_MARKERS.length);

  while (lines.length < targetLines) {
    lines.push({ text: SECTION_MARKERS[markerIndex % SECTION_MARKERS.length]!, kind: 'marker' });
    markerIndex++;

    const sectionLines = 3 + Math.floor(rng() * 6);
    for (let i = 0; i < sectionLines && lines.length < targetLines; i++) {
      const roll = rng();
      if (roll < 0.12) lines.push(buildChordLine(rng, chordRefs));
      else if (roll < 0.34) lines.push({ text: buildLyricLine(rng, 2, 4), kind: 'lyric' });
      else lines.push({ text: buildLyricLine(rng, 5, 11), kind: 'lyric' });
    }

    if (lines.length < targetLines) lines.push({ text: '', kind: 'blank' });
  }

  return lines;
};

const buildSongs = (chords: Chord[], scale: DevTestDataScale, baseTime: number): Song[] => {
  // 没有和弦可绑时直接返回空集，避免槽位绑定取到 undefined
  if (chords.length === 0) return [];

  const chordRefs: ChordRef[] = [];
  for (const chord of chords) {
    if (!chord.nameSegments) continue;
    const name = segmentsToString(chord.nameSegments);
    if (name) chordRefs.push({ id: chord.id, name });
  }
  if (chordRefs.length === 0) return [];

  const rng = createRng(0x5eed0002);
  const songs: Song[] = [];

  for (let index = 0; index < scale.songCount; index++) {
    const targetLines = scale.linesPerSong[0] + Math.floor(rng() * (scale.linesPerSong[1] - scale.linesPerSong[0] + 1));
    const seedLines = buildSongLines(rng, chordRefs, targetLines);
    const lines = seedLines.map(line => line.text);
    const lyrics = lines.join('\n');
    const lineIds = matchLineIds([], lines, []).lineIds;

    // 逐行绑定字符槽位：纯和弦行按和弦名首字符对齐，歌词行随机落 1~3 个，
    // 标记行与空行不绑（与真实谱面一致——那两类行上不会有和弦）
    const chordMap = new Map<SlotKey, ChordId>();
    for (let line = 0; line < seedLines.length; line++) {
      const seedLine = seedLines[line]!;
      const lineId = lineIds[line];
      if (!lineId) continue;

      if (seedLine.kind === 'chord') {
        seedLine.chords?.forEach((ref, i) => {
          const at = seedLine.offsets?.[i];
          if (at !== undefined) chordMap.set(charKey(lineId, at), ref.id);
        });
        continue;
      }

      if (seedLine.kind === 'marker' || seedLine.text.length === 0) continue;
      // 一行 1~3 个：贴近真实谱面密度，同时压住 chordMap 体积（单条槽位 key 近百字节）
      const bindCount = 1 + Math.floor(rng() * 3);
      for (let bind = 0; bind < bindCount; bind++) {
        chordMap.set(charKey(lineId, Math.floor(rng() * seedLine.text.length)), pick(chordRefs, rng).id);
      }
    }

    const title = `${pick(WORDS, rng)}${pick(WORDS, rng)}·压测 ${String(index + 1).padStart(4, '0')}`;
    const createdAt = baseTime + index * 1000;

    songs.push({
      id: toSongId(`s_${generateUUID().slice(0, 8)}`),
      title,
      singer: pick(SINGERS, rng),
      originalKey: pick(ROOT_NAMES, rng),
      timeSignature: pick(TIME_SIGNATURES, rng),
      lyrics,
      playKey: pick(ROOT_NAMES, rng),
      capo: Math.floor(rng() * 6) as Song['capo'],
      chordMap,
      lineIds,
      version: 1,
      createdAt,
      updatedAt: createdAt,
    });
  }

  return songs;
};

/** 按档位生成一整套测试数据（同步 CPU 计算，大档位下会有数百毫秒阻塞） */
export const buildDevTestData = (scale: DevTestDataScale): DevTestDataSet => {
  const baseTime = Date.now() - scale.songCount * 1000;
  const groups = buildGroups(scale.groupCount);
  const chords = buildChords(groups, scale);
  const songs = buildSongs(chords, scale, baseTime);

  return {
    groups,
    chords,
    songs,
    estimatedBytes: (jsonChars(groups) + jsonChars(chords) + jsonChars(songs)) * 2,
  };
};
