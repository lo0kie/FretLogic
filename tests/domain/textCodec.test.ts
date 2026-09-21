import { describe, expect, it } from 'vitest';

import { QUALITY_TOKENS } from '@/domains/chord/theory/chordQualityAst';
import { createChord } from '@/domains/chord/theory/entityFactories';
import { nameToSegments, Tuning } from '@/domains/chord/theory/theory';
import {
  parseChordFromText,
  parseSongFromText,
  serializeChordToText,
  serializeSongToText,
} from '@/domains/score/transfer/textCodec';

import type { Chord, ChordId } from '@/domains/chord/types';
import type { BarreEntity, GuitarStringsModel } from '@/domains/fretboard/types';
import type { ChordLineSlots, LineId, Song } from '@/domains/score/types';

/** 构造测试和弦：默认标准调弦 6 弦、3 品、根音 5 弦 */
const makeChord = (name: string, strings: GuitarStringsModel, barres?: BarreEntity[]): Chord =>
  createChord({
    nameSegments: nameToSegments(name),
    strings,
    fretCount: 3,
    groupId: 'g_test',
    tuning: Tuning.STANDARD,
    rootStringIndex: 5,
    ...(barres ? { barres } : {}),
  });

/** 构造含三处槽位的测试乐谱，返回乐谱与按 id 反查和弦的 resolver */
const makeSong = (): { song: Song; byId: Map<ChordId, Chord> } => {
  const chordC = makeChord('C', [
    { fret: -1, preferFlat: false },
    { fret: 3, preferFlat: false },
    { fret: 2, preferFlat: false },
    { fret: 0, preferFlat: false },
    { fret: 1, preferFlat: false },
    { fret: 0, preferFlat: false },
  ]);
  const chordAm = makeChord('Am', [
    { fret: -1, preferFlat: false },
    { fret: 0, preferFlat: false },
    { fret: 2, preferFlat: false },
    { fret: 2, preferFlat: false },
    { fret: 1, preferFlat: false },
    { fret: 0, preferFlat: false },
  ]);
  const chordG = makeChord('G', [
    { fret: 3, preferFlat: false },
    { fret: 2, preferFlat: false },
    { fret: 0, preferFlat: false },
    { fret: 0, preferFlat: false },
    { fret: 0, preferFlat: false },
    { fret: 3, preferFlat: false },
  ]);
  const byId = new Map<ChordId, Chord>([
    [chordC.id, chordC],
    [chordAm.id, chordAm],
    [chordG.id, chordG],
  ]);
  const chordMap = new Map<LineId, ChordLineSlots>();
  const ensureLine = (lineId: string): ChordLineSlots => {
    let slots = chordMap.get(lineId as LineId);
    if (!slots) {
      slots = { char: new Map(), start: [], end: [] };
      chordMap.set(lineId as LineId, slots);
    }
    return slots;
  };
  // 三处槽位：行 l1 行首 C、行 l1 字符 2 处 Am、行 l2 行首 G
  const l1 = ensureLine('l1');
  l1.start[0] = chordC.id;
  l1.char.set(2, chordAm.id);
  ensureLine('l2').start[0] = chordG.id;
  return {
    song: {
      id: 's_test' as Song['id'],
      title: '测试歌',
      singer: '',
      originalKey: '',
      timeSignature: '',
      lyrics: '第一行歌词\n第二行歌词',
      lineIds: ['l1' as Song['lineIds'][number], 'l2' as Song['lineIds'][number]],
      playKey: 'C',
      capo: 0,
      chordMap,
      version: 1,
      createdAt: 0,
      updatedAt: 0,
    },
    byId,
  };
};

describe('textCodec 和弦往返', () => {
  it('普通和弦（含静音/空弦/按品）往返一致', () => {
    const chord = makeChord('Am7', [
      { fret: -1, preferFlat: false },
      { fret: 0, preferFlat: false },
      { fret: 2, preferFlat: false },
      { fret: 2, preferFlat: false },
      { fret: 1, preferFlat: false },
      { fret: 0, preferFlat: false },
    ]);
    const result = parseChordFromText(serializeChordToText(chord));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe('Am7');
    expect(result.data.tuning).toBe(Tuning.STANDARD);
    expect(result.data.strings).toEqual(chord.strings);
    expect(result.data.rootStringIndex).toBe(5);
  });

  // 原此处三条「和弦编解码」用例（横按与升降号往返 / 乐谱文本误贴 WRONG_TYPE / 垃圾文本 UNKNOWN_FORMAT）
  // 已删：本文件经 @/domains/score/transfer/textCodec 访问的和弦 API 是 chord 域实现的**纯转发**
  // （见 textCodec.ts:19-26「转发以兼容既有导入路径」），与 chordTextCodec.test.ts 的同名用例
  // 测的是同一份代码，且后者断言更完整（逐弦 strings / fretOffset / rootStringIndex 一并校验）

  it('非法调弦回退默认并补足弦数', () => {
    const text = ['FLCHORD 1', 'NAME:C', 'TUNING:BOGUS', 'FRETS:3', 'OFFSET:0', 'ROOT:5', 'STRINGS:-1,0|3,0'].join(
      '\n'
    );
    const result = parseChordFromText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.tuning).toBe(Tuning.STANDARD);
    expect(result.data.strings).toHaveLength(6);
    // 未提供的弦补为静音
    expect(result.data.strings[5]).toEqual({ fret: -1, preferFlat: false });
  });

  it('CRLF 换行的和弦文本仍能解析', () => {
    const chord = makeChord('Am7', [
      { fret: -1, preferFlat: false },
      { fret: 0, preferFlat: false },
      { fret: 2, preferFlat: false },
      { fret: 2, preferFlat: false },
      { fret: 1, preferFlat: false },
      { fret: 0, preferFlat: false },
    ]);
    const result = parseChordFromText(serializeChordToText(chord).replace(/\n/g, '\r\n'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe('Am7');
  });
});

describe('textCodec 乐谱往返', () => {
  it('歌词与 char/start/end 槽位往返一致', () => {
    const { song, byId } = makeSong();
    const result = parseSongFromText(serializeSongToText(song, id => byId.get(id)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.title).toBe('测试歌');
    expect(result.data.lyrics).toBe('第一行歌词\n第二行歌词');
    expect(result.data.slots).toHaveLength(3);
    // 阅读顺序：行0行首 -> 行0字符 -> 行1行首
    expect(result.data.slots[0]).toMatchObject({ lineIdx: 0, type: 'start', index: 0 });
    expect(result.data.slots[0]?.chord.name).toBe('C');
    expect(result.data.slots[1]).toMatchObject({ lineIdx: 0, type: 'char', index: 2 });
    expect(result.data.slots[1]?.chord.name).toBe('Am');
    expect(result.data.slots[2]).toMatchObject({ lineIdx: 1, type: 'start', index: 0 });
    expect(result.data.slots[2]?.chord.name).toBe('G');
  });

  it('空歌词乐谱往返一致', () => {
    const { song, byId } = makeSong();
    const empty: Song = { ...song, lyrics: '', lineIds: [], chordMap: new Map() };
    const result = parseSongFromText(serializeSongToText(empty, id => byId.get(id)));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lyrics).toBe('');
    expect(result.data.slots).toHaveLength(0);
  });

  it('和弦文本粘到乐谱解析返回 WRONG_TYPE', () => {
    const chord = makeChord('C', [
      { fret: -1, preferFlat: false },
      { fret: 3, preferFlat: false },
      { fret: 2, preferFlat: false },
      { fret: 0, preferFlat: false },
      { fret: 1, preferFlat: false },
      { fret: 0, preferFlat: false },
    ]);
    const result = parseSongFromText(serializeChordToText(chord));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('WRONG_TYPE');
  });

  it('CRLF 换行的乐谱文本仍能解析出歌词', () => {
    const { song, byId } = makeSong();
    const crlf = serializeSongToText(song, id => byId.get(id)).replace(/\n/g, '\r\n');
    const result = parseSongFromText(crlf);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lyrics).toBe('第一行歌词\n第二行歌词');
    expect(result.data.slots).toHaveLength(3);
  });

  it('字典化输出格式紧凑：和弦定义仅出现一次，SLOTS 仅引用别名', () => {
    const { song, byId } = makeSong();
    const serialized = serializeSongToText(song, id => byId.get(id));
    expect(serialized).toContain('CHORDS:');
    expect(serialized).toContain('C=C;STANDARD;');
    expect(serialized).toContain('Am=Am;STANDARD;');
    expect(serialized).toContain('SLOTS:');
    expect(serialized).toContain('0:start:0:C');
    expect(serialized).toContain('0:char:2:Am');
  });

  it('兼容旧版内联和弦指法槽位文本解析', () => {
    const legacyText = [
      'FLSONG 1',
      'TITLE:老歌',
      'PLAYKEY:G',
      'CAPO:2',
      'LYRICS:',
      '测试旧版歌词',
      'CHORDS:',
      '0:char:2:C;STANDARD;3;0;4;-1,0|3,0|2,0|0,0|1,0|0,0',
    ].join('\n');
    const result = parseSongFromText(legacyText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.title).toBe('老歌');
    expect(result.data.playKey).toBe('G');
    expect(result.data.capo).toBe(2);
    expect(result.data.slots).toHaveLength(1);
    expect(result.data.slots[0]?.chord.name).toBe('C');
  });

  it('智能宽容导入：内嵌 [C] [G] 方括号和弦记号的普通吉他谱文本', () => {
    const rawExternalText = [
      '{title: 晴天}',
      '{key: G}',
      '{capo: 1}',
      '[C]故事的小黄花 从出生那年[G]就飘着',
      '[Am]童年的荡秋千 随记忆一直[F]晃到现在',
    ].join('\n');
    const result = parseSongFromText(rawExternalText);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.title).toBe('晴天');
    expect(result.data.playKey).toBe('G');
    expect(result.data.capo).toBe(1);
    expect(result.data.lyrics).toBe('故事的小黄花 从出生那年就飘着\n童年的荡秋千 随记忆一直晃到现在');
    expect(result.data.slots).toHaveLength(4);
    expect(result.data.slots[0]).toMatchObject({ lineIdx: 0, type: 'start', index: 0 });
    expect(result.data.slots[0]?.chord.name).toBe('C');
    expect(result.data.slots[1]).toMatchObject({ lineIdx: 0, type: 'char', index: 12 });
    expect(result.data.slots[1]?.chord.name).toBe('G');
    expect(result.data.slots[2]).toMatchObject({ lineIdx: 1, type: 'start', index: 0 });
    expect(result.data.slots[2]?.chord.name).toBe('Am');
    expect(result.data.slots[3]).toMatchObject({ lineIdx: 1, type: 'char', index: 12 });
    expect(result.data.slots[3]?.chord.name).toBe('F');
  });

  it('智能宽容导入：纯多行歌词文本导入', () => {
    const plainLyrics = ['白日依山尽', '黄河入海流', '欲穷千里目', '更上一层楼'].join('\n');
    const result = parseSongFromText(plainLyrics);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lyrics).toBe(plainLyrics);
    expect(result.data.slots).toHaveLength(0);
  });

  it('智能宽容导入：支持大小写混写和弦标记（如 [CMaj7]、[Cadd9]、[Csus4]、[G/B]）', () => {
    const textWithMixedCaseChords = '[CMaj7]海风吹过[Cadd9]海浪[Csus4]涌起[G/B]';
    const result = parseSongFromText(textWithMixedCaseChords);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lyrics).toBe('海风吹过海浪涌起');
    expect(result.data.slots).toHaveLength(4);
    expect(result.data.slots[0]?.chord.name).toBe('CMaj7');
    expect(result.data.slots[1]?.chord.name).toBe('Cadd9');
    expect(result.data.slots[2]?.chord.name).toBe('Csus4');
    expect(result.data.slots[3]?.chord.name).toBe('G/B');
  });

  it('智能宽容导入：引擎全部输出写法均能通过方括号标记正确抓取并生成槽位', () => {
    // 原为遍历 `GRAMMAR_TEMPLATES`（47 条手写模板）；引擎候选来源已换成 token 表，
    // 故取每个 token 的首选写法（即引擎会输出的写法），覆盖面由 47 条扩大到 63 条。
    for (const token of QUALITY_TOKENS) {
      const chordName = `C${token.spellings[0]!}`;
      const line = `歌词[${chordName}]片段`;
      const result = parseSongFromText(`{title: 测试}\n${line}`);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.data.lyrics).toBe('歌词片段');
      expect(result.data.slots).toHaveLength(1);
      expect(result.data.slots[0]?.chord.name).toBe(chordName);
    }
  });

  it('智能宽容导入：保留非和弦方括号标记（如 [Chorus]、[Verse]），不误识别为和弦', () => {
    const text = '[Chorus]\n[C]此时此刻[G]阳光明媚';
    const result = parseSongFromText(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lyrics).toBe('[Chorus]\n此时此刻阳光明媚');
    expect(result.data.slots).toHaveLength(2);
    expect(result.data.slots[0]?.chord.name).toBe('C');
    expect(result.data.slots[1]?.chord.name).toBe('G');
  });

  it('singer 序列化为 SINGER: 行并往返一致；无 singer 的旧格式解析为空串', () => {
    const { song, byId } = makeSong();
    const withSinger: Song = { ...song, singer: '周杰伦' };
    const serialized = serializeSongToText(withSinger, id => byId.get(id));
    expect(serialized).toContain('SINGER:周杰伦');

    const result = parseSongFromText(serialized);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.singer).toBe('周杰伦');

    // 旧格式文本无 SINGER 行：解析结果 singer 为空串（向后兼容）
    const legacy = parseSongFromText(serializeSongToText(song, id => byId.get(id)));
    expect(legacy.ok).toBe(true);
    if (!legacy.ok) return;
    expect(legacy.data.singer).toBe('');
  });

  it('智能宽容导入：ChordPro {artist:} / {singer:} 指令识别为歌手', () => {
    const raw = ['{title: 晴天}', '{artist: 周杰伦}', '{singer: 周杰伦}', '故事的小黄花', '童年的荡秋千'].join('\n');
    const result = parseSongFromText(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.singer).toBe('周杰伦');
    expect(result.data.lyrics).toBe('故事的小黄花\n童年的荡秋千');
  });

  it('智能宽容导入：首行 歌手：xxx 识别为歌手并视为结构信号', () => {
    const raw = ['歌手：周杰伦', '第一行歌词', '第二行歌词'].join('\n');
    const result = parseSongFromText(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.singer).toBe('周杰伦');
    expect(result.data.needsConfirm).toBe(false);
    expect(result.data.lyrics).toBe('第一行歌词\n第二行歌词');
  });
});
