import { describe, expect, it } from 'vitest';

import { createFretboardGeometry } from '@/domains/fretboard/model/fretboardGeometry';
import { SCORE_EXPORT_CONFIG } from '@/domains/score/constants';
import { getGlyphAdvanceWidth, getWordKern, wrapScoreLines } from '@/domains/score/preview/workers/scoreExportWorker';
import {
  applyLayoutScales,
  beginLyricFlow,
  drawFormattedChordName,
  EXPORT_CHORD_NAME_DESCENT_RATIO,
  fbGeometry,
  fretboardBoxWidth,
  getChordsGroupWidth,
  lyricFlowWidth,
  placeLyricChar,
  reserveBeforeEndChords,
} from '@/domains/score/preview/workers/scoreExportWorker/scoreExportLayout';
import { renderScoreLine } from '@/domains/score/preview/workers/scoreExportWorker/scoreExportRender';

import type {
  ExportCharItem,
  ExportChordData,
  ExportLineItem,
  RenderSegment,
  ThemeColors,
} from '@/domains/score/preview/workers/scoreExportWorker/scoreExportTypes';

/** 按「续行缩进 + 段首和弦组 + 逐字推进 + 段尾和弦组」独立重算段宽（渲染侧宽度定义）。
 *  逐字推进走 placeLyricChar，与折行端共用同一套原语 —— 这里独立的是「把段宽重新走一遍」，
 *  不是把规则抄第二遍。
 *  对齐量（`justifyGap`）按绘制端同一口径传入：只摊在「本字之后还有字」的空隙上，
 *  于是 `seg.width` 里那段撑开量能被独立复算出来（否则这条不变量会在对齐段上假红）。 */
const recomputeSegmentWidth = (seg: RenderSegment): number => {
  // 折减只发生在**段内相邻对**之间：跨段的两个字各在新行，不再相邻
  // 第二参续行标记与绘制端同口径传入：续行首字的图不占列，漏传会让首字位置差一截
  const flow = beginLyricFlow(seg.startChords, seg.isContinuation);
  for (let i = 0; i < seg.chars.length; i++) {
    const item = seg.chars[i]!;
    const prev = seg.chars[i - 1];
    const extraPitch = i < seg.chars.length - 1 ? seg.justifyGap : 0;
    placeLyricChar(flow, item, prev ? getWordKern(prev, item) : 0, extraPitch);
  }
  const endChordsW = getChordsGroupWidth(seg.endChords);
  if (endChordsW > 0) reserveBeforeEndChords(flow);
  return (
    (seg.isContinuation ? SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT : 0) +
    (endChordsW > 0 ? flow.x + endChordsW : lyricFlowWidth(flow))
  );
};

/** 重放一段的逐字落位（与 recomputeSegmentWidth 同一条路径）：返回各字的字形中心，以及**每个字落位后**
 *  flow 里的图中心 —— 挂图的那一字取到的就是它那张图的中心（绘制端正是这么取的）。
 *  对齐量与绘制端同口径传入，否则重放出的位置不是屏上真实位置。 */
const replayFlow = (seg: RenderSegment): { centers: number[]; figureCenters: number[] } => {
  const flow = beginLyricFlow(seg.startChords, seg.isContinuation);
  const centers: number[] = [];
  const figureCenters: number[] = [];
  for (let i = 0; i < seg.chars.length; i++) {
    const item = seg.chars[i]!;
    const prev = seg.chars[i - 1];
    const extraPitch = i < seg.chars.length - 1 ? seg.justifyGap : 0;
    centers.push(placeLyricChar(flow, item, prev ? getWordKern(prev, item) : 0, extraPitch));
    figureCenters.push(flow.figureCenter);
  }
  return { centers, figureCenters };
};

/** 量一段字符的**字形中心**（相对段首）：排版规则的可观测面，供「有和弦 / 无和弦」两种排法对照。
 *  必须经 wrapScoreLines 走一遍 —— 词块锚定是**行级预扫描**的结果（见 markWordBlockCenters），
 *  直接摆一条流会跳过它，把词块里的图当成普通挂图字算（撑边距那一档）。 */
const glyphCentersOf = (chars: ExportCharItem[]): number[] => {
  const [seg] = wrapScoreLines([{ lineIdx: 0, chars }], 5000);
  return seg ? replayFlow(seg).centers : [];
};

const makeChord = (chordName: string): ExportChordData => ({
  chordName,
  strings: [[0, true]],
  fretCount: 4,
  rootStringIndex: 0,
});

const toChars = (text: string): ExportCharItem[] => text.split('').map(char => ({ char }));

/** 替身的量宽口径：一个字符 = 字号 × 本比例。真实等宽字体的推进宽同样与字号成正比，故「宽度对字号
 *  近似线性」这条贴合求解的收敛前提在替身上照样成立。 */
const FAKE_CHAR_RATIO = 0.6;

/**
 * 极简 2D 上下文替身：只服务「按字号量宽 + 记录画了什么、画在哪」这两件事。
 *
 * 和弦名的绘制路径只用到 `font` 赋值、`measureText().width`、`fillStyle` / `textAlign` 赋值与
 * `fillText`，故替身足够 —— 它要判的是**降级链走了哪一级**（画的是完整名还是简写名、字号有没有被
 * 缩），不是字形本身。`font` 是访问器：字号从字体串里解出来，绘制端与量宽端因此共用同一个读数。
 * 落笔坐标也一并记下：行首提示符要判的是「画在缩进留白里」，只看画了什么不够。
 * `globalAlpha` 记的是**落笔那一刻**的值（提示符靠它压一档亮度），故要跟 `fillText` / `stroke` 同步取。
 *
 * 折行提示符是一条**折线**（不是字形），故另记一路 `strokes`：路径点序列 + 落笔时的线宽与 alpha。
 * 折线要判的是「竖臂起在哪、横臂收到哪、线宽是多少」，这些都在路径点上，只记「画了一笔」不够。
 */
const createFakeCtx = (): {
  ctx: OffscreenCanvasRenderingContext2D;
  drawn: { text: string; size: number; x: number; y: number; alpha: number }[];
  strokes: { points: { x: number; y: number }[]; lineWidth: number; alpha: number }[];
} => {
  const drawn: { text: string; size: number; x: number; y: number; alpha: number }[] = [];
  const strokes: { points: { x: number; y: number }[]; lineWidth: number; alpha: number }[] = [];
  let sizePx = 0;
  // 折线路径累积区：beginPath 清空、各段命令追加、stroke 时连同当前线宽与 alpha 一起落账
  let path: { x: number; y: number }[] = [];
  const ctx = {
    fillStyle: '',
    textAlign: '',
    globalAlpha: 1,
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    measureText: (text: string) => ({ width: text.length * sizePx * FAKE_CHAR_RATIO }),
    fillText: (text: string, x: number, y: number) =>
      void drawn.push({ text, size: sizePx, x, y, alpha: ctx.globalAlpha }),
    beginPath: () => void (path = []),
    moveTo: (x: number, y: number) => void path.push({ x, y }),
    lineTo: (x: number, y: number) => void path.push({ x, y }),
    // 二次曲线只记**终点**：折角的圆化量是观感修正，断言关心的是两臂的端点
    quadraticCurveTo: (_cx: number, _cy: number, x: number, y: number) => void path.push({ x, y }),
    stroke: () => void strokes.push({ points: [...path], lineWidth: ctx.lineWidth, alpha: ctx.globalAlpha }),
  };
  Object.defineProperty(ctx, 'font', {
    get: () => `bold ${sizePx}px Fake`,
    set: (value: string) => {
      sizePx = Number.parseFloat(/([\d.]+)px/.exec(value)?.[1] ?? '0');
    },
  });

  return { ctx: ctx as unknown as OffscreenCanvasRenderingContext2D, drawn, strokes };
};

describe('乐谱排版与折行引擎算法测试', () => {
  it('半角字符与全角汉字字宽区分准确', () => {
    const hanziWidth = getGlyphAdvanceWidth({ char: '我' });
    const englishWidth = getGlyphAdvanceWidth({ char: 'a' });
    const numberWidth = getGlyphAdvanceWidth({ char: '1' });
    const barWidth = getGlyphAdvanceWidth({ char: '|' });
    const fullBarWidth = getGlyphAdvanceWidth({ char: '｜' });
    const spaceWidth = getGlyphAdvanceWidth({ char: ' ' });

    expect(hanziWidth).toBe(SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH);
    expect(fullBarWidth).toBe(SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH);
    expect(spaceWidth).toBe(SCORE_EXPORT_CONFIG.SPACE_CHAR_WIDTH);
    // 半角英文、数字与小节竖线宽度严格小于全角汉字宽度
    expect(englishWidth).toBeLessThan(hanziWidth);
    expect(numberWidth).toBeLessThan(hanziWidth);
    expect(barWidth).toBeLessThan(hanziWidth);
    // 半角 ASCII 共用同一字宽（实现按 code <= 127 判定），比例约三分之二
    // （字形典型推进宽 + 与全角汉字相同的字间隙）——
    // 只钉「半角互等 + 比例落在带宽内」，不把实现里的具体系数抄进断言
    expect(englishWidth).toBe(numberWidth);
    expect(englishWidth).toBe(barWidth);
    expect(englishWidth / hanziWidth).toBeGreaterThan(0.5);
    expect(englishWidth / hanziWidth).toBeLessThan(0.7);
  });

  it('中文避头尾规则生效：标点符号不得单独出现在新行开头', () => {
    // 构造刚好在逗号处超宽的歌词
    // 比如：一二三四五，六七八
    // 如果切在 "，"，避头尾机制应将 "五" 连同 "，" 一起借入新行，或者避免 "，" 孤立作为行首
    const chars = '一二三四五，六七八九十'.split('').map(char => ({ char }));
    const line: ExportLineItem = {
      lineIdx: 0,
      chars,
    };

    // 设置宽度刚好让 "一二三四五" 达到临界值
    const singleCharW = SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH;
    const testWidth = singleCharW * 5 + 5; // 只能容纳 5 个字

    const segments = wrapScoreLines([line], testWidth);
    expect(segments.length).toBeGreaterThan(1);

    // 严禁任何第二段或续行的第一个字符为逗号
    for (let i = 1; i < segments.length; i++) {
      const firstChar = segments[i]?.chars[0]?.char;
      // 注：原先此处还有 `expect(firstChar).not.toBe('。')`，已删——本用例输入是
      // '一二三四五，六七八九十'，整串不含句号，该断言不可能失败；若要覆盖句号需另造输入
      expect(firstChar).not.toBe('，');
    }
  });

  it('空行能够正确作为独立段落保留并标记为单段', () => {
    const emptyLine: ExportLineItem = {
      lineIdx: 0,
      chars: [],
    };
    const segments = wrapScoreLines([emptyLine], 500);
    expect(segments.length).toBe(1);
    expect(segments[0]?.isLastSubLine).toBe(true);
    expect(segments[0]?.chars.length).toBe(0);
  });

  it('预计算段宽与逐字符重算一致：覆盖软折行、避头尾回借、孤字回借与首尾边和弦', () => {
    const singleCharW = SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH;
    const narrowWidth = singleCharW * 5 + 5; // 每行只容得下 5 个字，逼出多段
    const startChords = [makeChord('C'), makeChord('G')];
    const endChords = [makeChord('Am')];

    const cases: ExportLineItem[] = [
      // 1) 常规软折行 + 段首 / 段尾边和弦
      { lineIdx: 0, chars: toChars('一二三四五六七八九十'), startChords, endChords },
      // 2) 避头尾回借：逗号不得成为行首，末字被回借给下一段
      { lineIdx: 1, chars: toChars('一二三四五，六七八九十'), endChords },
      // 3) 孤字回借：6 字行在 5 字可用宽下末段只剩 1 字，须从上一段（5 字 > 2）回借一字
      { lineIdx: 2, chars: toChars('一二三四五六'), endChords },
      // 4) 空行仅带边和弦：无字符也要把和弦组宽度计入
      { lineIdx: 3, chars: [], endChords },
    ];

    const segments = wrapScoreLines(cases, narrowWidth);
    expect(segments.length).toBeGreaterThan(cases.length);

    // 核心不变量：预计算宽度必须与逐字符重算一致（两处回借的扣减也在其中）
    for (const seg of segments) {
      expect(seg.width).toBe(recomputeSegmentWidth(seg));
    }

    // 回借分支的账要平：按原顺序拼回必须与原句完全一致，不丢字、不重复、不乱序
    for (const line of cases) {
      const rebuilt = segments
        .filter(seg => seg.lineIdx === line.lineIdx)
        .flatMap(seg => seg.chars.map(item => item.char))
        .join('');
      expect(rebuilt).toBe(line.chars.map(item => item.char).join(''));
    }

    // 避头尾回借生效：逗号所在句的每一段段首都不是禁止行首标点
    for (const seg of segments.filter(seg => seg.lineIdx === 1)) {
      expect(seg.chars[0]?.char).not.toBe('，');
    }

    // 孤字回借生效：末段由 1 字变为 2 字，前段相应让出一字
    expect(segments.filter(seg => seg.lineIdx === 2).map(seg => seg.chars.length)).toEqual([4, 2]);
  });

  it('词内折减：连续半角字符之间的间距收掉一整个字间隙，词界与全角字不受影响', () => {
    const gap = SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH - SCORE_EXPORT_CONFIG.LYRICS_FONT_SIZE;
    // 词内折减 = **一整个**字间隙（2026-09-29 口径变更，此前是半个）：词内相邻两字的可视间隙归零，
    // 只剩字形推进宽 + `wordCharAdvance` 取整余下的 0.5px
    const wordKern = gap;
    const letterW = getGlyphAdvanceWidth({ char: 'a' });

    // 词内相邻两字：折减一整个字间隙
    expect(getWordKern({ char: 'a' }, { char: 'b' })).toBe(wordKern);
    // 词界（空格）两侧都不折减：词与词之间的距离与改前逐像素相同
    expect(getWordKern({ char: 'a' }, { char: ' ' })).toBe(0);
    expect(getWordKern({ char: ' ' }, { char: 'b' })).toBe(0);
    // 词内标点 / 数字算词内：don't、capo 2、rock-'n'-roll 不该在标点两侧松开
    expect(getWordKern({ char: 'n' }, { char: "'" })).toBe(wordKern);
    expect(getWordKern({ char: '2' }, { char: '3' })).toBe(wordKern);
    // 歌词分隔符与全角汉字算词界
    expect(getWordKern({ char: 'a' }, { char: '|' })).toBe(0);
    expect(getWordKern({ char: '我' }, { char: 'a' })).toBe(0);
    // 挂和弦不豁免折减（2026-09-28 口径变更）：和弦图不再撑宽字符格，图与图的间隔另由推挤保证
    expect(getWordKern({ char: 'a', chord: makeChord('C') }, { char: 'b' })).toBe(wordKern);
    expect(getWordKern({ char: 'a' }, { char: 'b', chord: makeChord('C') })).toBe(wordKern);

    // 词内中心距 = 字宽 − 折减，仍**大于字形自身的推进宽**（Sarasa Mono 子集的 ASCII 推进宽恒为
    // 0.5em）—— 收紧不得越过这条线，越过即相邻字母相碰
    expect(letterW - wordKern).toBeGreaterThan(SCORE_EXPORT_CONFIG.LYRICS_FONT_SIZE * 0.5);

    // 段宽 = Σ字宽 − Σ词内折减：3 个字母的词比逐字字宽之和少 2 个字间隙
    const [seg] = wrapScoreLines([{ lineIdx: 0, chars: toChars('abc') }], 5000);
    expect(seg?.width).toBe(letterW * 3 - wordKern * 2);
    expect(seg?.width).toBe(recomputeSegmentWidth(seg!));

    // 汉字夹在词中间：汉字两侧仍是全间距，只有半角字之间收
    const [mixed] = wrapScoreLines([{ lineIdx: 0, chars: toChars('ab我cd') }], 5000);
    expect(mixed?.width).toBe(letterW * 4 - wordKern * 2 + SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH);
  });

  it('词块内连续字母不被和弦图撑开：字距与有没有和弦无关', () => {
    const wordKern = SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH - SCORE_EXPORT_CONFIG.LYRICS_FONT_SIZE;
    const letterW = getGlyphAdvanceWidth({ char: 'a' });

    const plain = glyphCentersOf(toChars('ab'));
    const chordOnFirst = glyphCentersOf([{ char: 'a', chord: makeChord('A6') }, { char: 'b' }]);

    // 词内间距只由字宽与折减决定 —— 这正是「连续字母是一个整体」的全部含义。
    // 旧口径下这里会变成「近一整个指板框宽」（字被居中到装得下整张图的宽格里）。
    expect(plain[1]! - plain[0]!).toBe(letterW - wordKern);
    expect(chordOnFirst[1]! - chordOnFirst[0]!).toBe(plain[1]! - plain[0]!);

    // 和弦图只把整段右推（图不越出段首），不把后一字推到图的右侧
    expect(chordOnFirst[0]!).toBeGreaterThan(plain[0]!);
    expect(chordOnFirst[1]! - chordOnFirst[0]!).toBeLessThan(fretboardBoxWidth() / 2);

    // 相邻两字都挂和弦（块内两张图 ⇒ 不锚定块中心，各占一列）：图与图之间恒留 CHORD_COLUMN_EXTRA_PAD
    // （中心距 = 框宽 + pad），不叠不贴
    const bothChords = glyphCentersOf([
      { char: 'a', chord: makeChord('A') },
      { char: 'b', chord: makeChord('B') },
    ]);
    expect(bothChords[1]! - bothChords[0]!).toBe(fretboardBoxWidth() + SCORE_EXPORT_CONFIG.CHORD_COLUMN_EXTRA_PAD);

    // 段首那张图占**一整列**（框宽 + pad，图两侧各 pad/2），段宽即这一列宽
    const [single] = wrapScoreLines([{ lineIdx: 0, chars: [{ char: 'a', chord: makeChord('A') }] }], 5000);
    expect(single!.width).toBe(fretboardBoxWidth() + SCORE_EXPORT_CONFIG.CHORD_COLUMN_EXTRA_PAD);
    expect(single!.width).toBe(recomputeSegmentWidth(single!));
  });

  it('正常字符挂图撑开左右边距：图两侧各留 pad/2，不压左右邻居', () => {
    const pad = SCORE_EXPORT_CONFIG.CHORD_COLUMN_EXTRA_PAD;
    const charW = SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH;
    // 「我」不挂图、「别」挂图、「旋」不挂图：汉字不成词块 ⇒ 走「正常字符」那一档（撑整列）
    const [seg] = wrapScoreLines(
      [{ lineIdx: 0, chars: [{ char: '我' }, { char: '别', chord: makeChord('C') }, { char: '旋' }] }],
      5000
    );
    const flow = replayFlow(seg!);

    // 前一字不动（左半由挂图那一字自己让出），图仍居中于本字
    expect(flow.centers[0]).toBe(charW / 2);
    expect(flow.figureCenters[1]).toBeCloseTo(flow.centers[1]!);

    // 图两侧各留 pad/2：左边缘 = 前一字格右端 + pad/2，下一字格左端 = 图右边缘 + pad/2
    const figureLeft = flow.figureCenters[1]! - fretboardBoxWidth() / 2;
    const figureRight = flow.figureCenters[1]! + fretboardBoxWidth() / 2;
    expect(figureLeft).toBeCloseTo(charW + pad / 2);
    expect(flow.centers[2]! - charW / 2).toBeCloseTo(figureRight + pad / 2);

    // 挂图那一字占满一整列（框宽 + pad）：下一字比「不挂图」时正好远出一列
    const [plain] = wrapScoreLines([{ lineIdx: 0, chars: [{ char: '我' }, { char: '别' }, { char: '旋' }] }], 5000);
    const plainCenters = replayFlow(plain!).centers;
    expect(flow.centers[2]! - plainCenters[2]!).toBeCloseTo(fretboardBoxWidth() + pad - charW);

    // 边距不改变「量到的宽 = 画出来的宽」这条不变量
    expect(seg!.width).toBe(recomputeSegmentWidth(seg!));
  });

  it('和弦图落在词块中心：连续字母视为一个整体，图在它们中间', () => {
    const word = (text: string): ExportCharItem[] => text.split('').map(char => ({ char }));

    // 5 个字母的词、和弦挂在首字母：图落在词中心 = 第 3 个字母的字形中心（5 字词的中间）
    const hello = word('hello');
    hello[0]!.chord = makeChord('C');
    const [helloSeg] = wrapScoreLines([{ lineIdx: 0, chars: hello }], 5000);
    const helloFlow = replayFlow(helloSeg!);
    expect(helloFlow.figureCenters[0]).toBeCloseTo((helloFlow.centers[0]! + helloFlow.centers[4]!) / 2);
    // 词中心即第 3 个字（下标 2）的字形中心 —— 两种读法同值，钉住「图在它们中间」的确切含义
    expect(helloFlow.figureCenters[0]).toBeCloseTo(helloFlow.centers[2]!);

    // 偶数长度的词（2 字）：中心落在两字之间，图中心 = 两字字形中心的中点
    const a6 = word('A6');
    a6[0]!.chord = makeChord('A6');
    const [a6Seg] = wrapScoreLines([{ lineIdx: 0, chars: a6 }], 5000);
    const a6Flow = replayFlow(a6Seg!);
    expect(a6Flow.figureCenters[0]).toBeCloseTo((a6Flow.centers[0]! + a6Flow.centers[1]!) / 2);

    // 和弦挂在词的**第二个**字上：图仍在词中心（图属于整个词，不跟着它那一字走），
    // 且推挤由块首字一次算定、整块一起右移 —— 两字间距与挂首字时逐像素相同，词不会被图掰开
    const a6Tail = word('A6');
    a6Tail[1]!.chord = makeChord('A6');
    const [a6TailSeg] = wrapScoreLines([{ lineIdx: 0, chars: a6Tail }], 5000);
    const a6TailFlow = replayFlow(a6TailSeg!);
    expect(a6TailFlow.figureCenters[1]).toBeCloseTo((a6TailFlow.centers[0]! + a6TailFlow.centers[1]!) / 2);
    expect(a6TailFlow.centers[1]! - a6TailFlow.centers[0]!).toBe(a6Flow.centers[1]! - a6Flow.centers[0]!);
    // 词内字距仍**小于**独立一个半角字符的字宽（= 词内折减仍在生效）：
    // 「单词的字母之间的间距应比正常字符少」这条不因图落在词中间而失效
    expect(a6TailFlow.centers[1]! - a6TailFlow.centers[0]!).toBeLessThan(getGlyphAdvanceWidth({ char: 'A' }));

    // 汉字不参与词块：图仍锚定它自己那个字的字形中心（与改前一致）
    const hanzi: ExportCharItem[] = [{ char: '告' }, { char: '别', chord: makeChord('C') }, { char: '旋' }];
    const [hanziSeg] = wrapScoreLines([{ lineIdx: 0, chars: hanzi }], 5000);
    const hanziFlow = replayFlow(hanziSeg!);
    expect(hanziFlow.figureCenters[1]).toBeCloseTo(hanziFlow.centers[1]!);

    // 块内两张图：都落在一个中心上只会互相挤开，故保持「各锚定自己那个字」+ 推挤（中心距 = 框宽 + pad）
    const both: ExportCharItem[] = [
      { char: 'A', chord: makeChord('A') },
      { char: '6', chord: makeChord('A6') },
    ];
    const [bothSeg] = wrapScoreLines([{ lineIdx: 0, chars: both }], 5000);
    const bothFlow = replayFlow(bothSeg!);
    expect(bothFlow.figureCenters[0]).toBeCloseTo(bothFlow.centers[0]!);
    expect(bothFlow.figureCenters[1]).toBeCloseTo(bothFlow.centers[1]!);
    expect(bothFlow.centers[1]! - bothFlow.centers[0]!).toBe(
      fretboardBoxWidth() + SCORE_EXPORT_CONFIG.CHORD_COLUMN_EXTRA_PAD
    );

    // 词块锚定不改变「量到的宽 = 画出来的宽」这条不变量
    for (const seg of [helloSeg!, a6Seg!, a6TailSeg!, hanziSeg!, bothSeg!])
      expect(seg.width).toBe(recomputeSegmentWidth(seg));
  });

  it('段尾图与行尾边和弦组不叠：入列前把游标推过段尾那张图', () => {
    const chord = makeChord('C');
    const endChords = [makeChord('Am')];
    const endChordsW = getChordsGroupWidth(endChords);

    const [withEnd] = wrapScoreLines([{ lineIdx: 0, chars: [{ char: 'a', chord }], endChords }], 5000);
    // 段尾那张图：中心 = 字形中心，恒宽 = 框宽
    const figureRight = glyphCentersOf([{ char: 'a', chord }])[0]! + fretboardBoxWidth() / 2;
    // 边和弦组第一张图的左边缘 = 组起点 + 段间间隔（组起点 = 段宽 − 组宽，见 reserveBeforeEndChords）。
    // 刻意**不**再加半个框宽：`drawFretboard` 收的是**左边缘**（行内那一路传的就是 `centerX − 框宽/2`），
    // 边和弦组这一路直接传 `flow.x + EDGE_CHORD_SECTION_GAP`；多算半框宽会让下面那条「不叠」的
    // 断言凭空松掉半个框宽 —— 松掉的正是它要守的那段安全距离。
    const endChordLeft = withEnd!.width - endChordsW + SCORE_EXPORT_CONFIG.EDGE_CHORD_SECTION_GAP;

    expect(endChordLeft).toBeGreaterThanOrEqual(figureRight + SCORE_EXPORT_CONFIG.CHORD_COLUMN_EXTRA_PAD);
    expect(withEnd!.width).toBe(recomputeSegmentWidth(withEnd!));

    // 对照：段尾不挂和弦时边和弦组紧接游标，不被无谓推远
    const [plain] = wrapScoreLines([{ lineIdx: 0, chars: toChars('a'), endChords }], 5000);
    expect(plain!.width - endChordsW).toBe(getGlyphAdvanceWidth({ char: 'a' }));
    expect(plain!.width).toBe(recomputeSegmentWidth(plain!));
  });

  it('词内折减在两条回借路径上的账要平：避头尾回借与孤字回借', () => {
    // 40px 宽：'a','b' 之后 ','（禁则行首字符）放不下 ⇒ 触发避头尾回借，'b' 随 ',' 一起进下一段。
    // 回借会改掉两处相邻关系（本段少一对、下一段多一对），两段的折减都要跟着重算
    const punctuation = wrapScoreLines([{ lineIdx: 0, chars: toChars('ab,cdef') }], 40);
    expect(punctuation.length).toBeGreaterThan(1);
    for (const seg of punctuation) {
      expect(seg.width).toBe(recomputeSegmentWidth(seg));
      expect(seg.chars[0]?.char).not.toBe(',');
    }
    expect(punctuation.flatMap(seg => seg.chars.map(i => i.char)).join('')).toBe('ab,cdef');

    // 窄宽（「9 个字母放得下、第 10 个放不下」那一档）：10 个字母先折成 9 + 1，
    // 末段孤字再从上一段回借一个 ⇒ 8 + 2。宽度按**词内中心距**（字宽 − 一整个字间隙）取，
    // 不写死像素 —— 折减口径一变，这个档位跟着走
    const orphanPitch =
      getGlyphAdvanceWidth({ char: 'a' }) -
      (SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH - SCORE_EXPORT_CONFIG.LYRICS_FONT_SIZE);
    const orphanWidth = orphanPitch * 9 + 1;
    const orphan = wrapScoreLines([{ lineIdx: 0, chars: toChars('abcdefghij') }], orphanWidth);
    for (const seg of orphan) expect(seg.width).toBe(recomputeSegmentWidth(seg));
    expect(orphan.map(seg => seg.chars.length)).toEqual([8, 2]);
    expect(orphan.flatMap(seg => seg.chars.map(i => i.char)).join('')).toBe('abcdefghij');
  });

  it('忽略空格档：连续的无和弦空格压缩为一个，单格与挂和弦的空格不受影响', () => {
    const spaceW = SCORE_EXPORT_CONFIG.SPACE_CHAR_WIDTH;
    // 「我␣␣爱␣␣␣你␣(挂和弦)」：两段连续空格（2 格 / 3 格），末尾一个挂和弦的空格
    const chars: ExportCharItem[] = [
      { char: '我' },
      { char: ' ' },
      { char: ' ' },
      { char: '爱' },
      { char: ' ' },
      { char: ' ' },
      { char: ' ' },
      { char: '你' },
      { char: ' ', chord: makeChord('C') },
    ];
    const line: ExportLineItem = { lineIdx: 0, chars };

    const plain = wrapScoreLines([line], 5000);
    const compressed = wrapScoreLines([line], 5000, true);

    // 关档（默认）：一个字符一格，空格照旧占位
    expect(plain[0]?.chars).toHaveLength(chars.length);
    // 开档：两段连续空格各留一格，挂和弦的那格原样保留（压掉它等于丢掉和弦图）⇒ 9 − 3 = 6
    expect(compressed[0]?.chars.map(item => item.char)).toEqual(['我', ' ', '爱', ' ', '你', ' ']);
    expect(compressed[0]?.chars[5]?.chord).toEqual(makeChord('C'));
    // 段宽是压缩后的**实际占用**：差值恰为省下的三格空格宽，而不是把空壳字符留着让宽度虚高
    expect(plain[0]!.width - compressed[0]!.width).toBe(spaceW * 3);
    expect(compressed[0]?.width).toBe(recomputeSegmentWidth(compressed[0]!));
  });

  it('折行两端对齐：除本行末段外各段把字距均摊撑开、右边界顶到可用宽', () => {
    const charW = SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH;
    const maxWidth = charW * 5 + 5; // 首行 5 字、续行 3 字（缩进占掉两个字格），逼出多段

    const segments = wrapScoreLines([{ lineIdx: 0, chars: toChars('一二三四五六七八九十') }], maxWidth, false, true);
    expect(segments.length).toBeGreaterThan(1);

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      // 量到的宽 = 画出来的宽：对齐量必须同时进两处口径
      expect(seg.width).toBe(recomputeSegmentWidth(seg));

      if (i < segments.length - 1) {
        // 除末段外都撑开：右边界（含续行缩进）正好落到可用宽上，即整行右侧齐平
        expect(seg.isLastSubLine).toBe(false);
        expect(seg.justifyGap).toBeGreaterThan(0);
        expect(seg.width).toBeCloseTo(maxWidth);
        // 摊的是「可用宽 − 本段自然宽」，**均分到每个字间空隙**（n 字有 n − 1 个空隙）。
        // 自然宽按同一套原语、把对齐量置 0 独立重算（段首边和弦组 / 词内折减都算进去）
        const indent = seg.isContinuation ? SCORE_EXPORT_CONFIG.WRAPPED_LINE_INDENT : 0;
        const target = maxWidth - indent; // 本段**内容**的可用宽（缩进在段外另加）
        const natural = recomputeSegmentWidth({ ...seg, justifyGap: 0 }) - indent; // 本段内容的自然宽
        expect(seg.justifyGap).toBeCloseTo((target - natural) / (seg.chars.length - 1));
      } else {
        // 末行不拉伸：保持自然字距，右边界自然参差
        expect(seg.isLastSubLine).toBe(true);
        expect(seg.justifyGap).toBe(0);
        expect(seg.width).toBeLessThan(maxWidth);
      }
    }

    // 没折过的行只有一段、它自己就是末段 ⇒ 完全不受对齐影响（单行歌词的版面零变化）
    const [single] = wrapScoreLines([{ lineIdx: 0, chars: toChars('一二三') }], maxWidth, false, true);
    expect(single!.justifyGap).toBe(0);
    expect(single!.width).toBe(recomputeSegmentWidth(single!));

    // 单字段（孤字段）没有空隙可摊：不拉伸 —— 撑满整行只会把那个字推到行中间
    const [orphan] = wrapScoreLines([{ lineIdx: 0, chars: toChars('一') }], maxWidth, false, true);
    expect(orphan!.justifyGap).toBe(0);

    // 对齐量必须计入**词块字距**：块内那张图仍要落在块中心，而不是按未撑开的字距偏到左边
    const word: ExportCharItem[] = toChars('hello一二三四五');
    word[0]!.chord = makeChord('C');
    const [wordSeg] = wrapScoreLines([{ lineIdx: 0, chars: word }], maxWidth, false, true);
    expect(wordSeg!.justifyGap).toBeGreaterThan(0); // 首段（本行非末段）确实被撑开
    const wordFlow = replayFlow(wordSeg!);
    const helloLen = 'hello'.length;
    expect(wordFlow.figureCenters[0]).toBeCloseTo((wordFlow.centers[0]! + wordFlow.centers[helloLen - 1]!) / 2);
    expect(wordSeg!.width).toBe(recomputeSegmentWidth(wordSeg!));

    // 长图 / estimate 那一档不传 justify：可用宽在那里是**上限**而非目标（画布宽由最宽行反推），
    // 折行段因此保持自然字距 —— 对齐会把每一折行撑到上限、把画布顶到上限宽
    const [plainFirst] = wrapScoreLines([{ lineIdx: 0, chars: toChars('一二三四五六七八九十') }], maxWidth);
    expect(plainFirst!.justifyGap).toBe(0);
    expect(plainFirst!.width).toBe(recomputeSegmentWidth(plainFirst!));
  });

  it('折行续行首字的和弦不占列：续行首字落在缩进位上，与上一续行左对齐', () => {
    const charW = SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH;
    const maxWidth = charW * 5 + 5; // 首行 5 字、续行 3 字

    // 「六」是第一个续行的首字，挂和弦
    const chars = toChars('一二三四五六七八九十');
    chars[5]!.chord = makeChord('C');
    const segs = wrapScoreLines([{ lineIdx: 0, chars }], maxWidth, false, true);
    expect(segs.map(seg => seg.chars.length)).toEqual([5, 3, 2]);

    const second = replayFlow(segs[1]!);
    // 续行首字：字形左边缘**落在段首**（0）—— 没有 chordFigureMargin 的左半推挤，图直接居中于本字
    expect(second.centers[0]! - charW / 2).toBeCloseTo(0);
    expect(second.figureCenters[0]!).toBeCloseTo(second.centers[0]!);
    // 两条续行的首字因此左对齐：段宽都含同一份续行缩进，段内相对位置同为 0
    expect(replayFlow(segs[2]!).centers[0]! - charW / 2).toBeCloseTo(0);

    // 对照：**首行**（非续行）的首字挂图仍占一整列 —— 图探出去落在**页边距**里，
    // 那是真的越出版心，不是续行缩进那段留白，故这一档不放开
    const headChars = toChars('一二三四五六');
    headChars[0]!.chord = makeChord('C');
    const [headSeg] = wrapScoreLines([{ lineIdx: 0, chars: headChars }], maxWidth, false, true);
    const head = replayFlow(headSeg!);
    expect(head.centers[0]! - charW / 2).toBeGreaterThan(0);
    expect(head.figureCenters[0]!).toBeCloseTo(head.centers[0]!);

    // 量到的宽 = 画出来的宽：首字这一档同样要在两处口径里一致（recompute 按 isContinuation 置位）
    for (const seg of [...segs, headSeg!]) expect(seg.width).toBe(recomputeSegmentWidth(seg));
  });

  it('折行续行行首的提示符是一条弱一档的折线：只对续行画、落在缩进留白里、不进任何排版量', () => {
    // 布局是「一次渲染一份」的模块级状态、会被别的用例按缩放重算过：本用例按出厂值断言坐标，先归位
    applyLayoutScales(100, 100);
    const charW = SCORE_EXPORT_CONFIG.REGULAR_CHAR_WIDTH;
    const maxWidth = charW * 5 + 5;
    const segments = wrapScoreLines([{ lineIdx: 0, chars: toChars('一二三四五六七八九十') }], maxWidth);
    const colors = { TEXT: '#111', SUB_TEXT: '#999' } as unknown as ThemeColors;
    const {
      WRAPPED_LINE_INDENT: indent,
      WRAPPED_LINE_MARK_SIZE: size,
      WRAPPED_LINE_MARK_STROKE: stroke,
    } = SCORE_EXPORT_CONFIG;
    // 无和弦的段：歌词基线 = 段顶 + 字号（见 renderScoreLine 的 textBaselineY）
    const baselineY = SCORE_EXPORT_CONFIG.LYRICS_FONT_SIZE;
    const markLeft = 100 - indent;

    // 续行：画一条折线，方框左下角落在「段首 − 续行缩进」× 歌词基线上
    const cont = createFakeCtx();
    renderScoreLine(cont.ctx, segments[1]!, 100, 0, colors, true, 400);
    expect(cont.strokes).toHaveLength(1);
    const mark = cont.strokes[0]!;
    // 竖臂起于方框左上、横臂终于方框右下：两臂等长，折角在左下（形状是 L，不是箭头）
    expect(mark.points[0]).toEqual({ x: markLeft, y: baselineY - size });
    expect(mark.points.at(-1)).toEqual({ x: markLeft + size, y: baselineY });
    expect(mark.points.slice(0, 2).every(p => p.x === markLeft)).toBe(true);
    expect(mark.points.slice(-2).every(p => p.y === baselineY)).toBe(true);
    // 线宽取「比正文粗一档」那一档
    expect(mark.lineWidth).toBeCloseTo(stroke);
    // 整条落在缩进段里：横臂右端仍在段首之前，撞不到首字（首字字形中心在段首 + 半字宽处）
    expect(markLeft + size).toBeLessThan(100);

    // 弱一档画：次级色之外再压一道 alpha（次级色在暗色主题下与正文亮度差得太小）。
    // 画完必须还原 —— alpha 是绘制状态、不随 strokeStyle 复位，漏还原会让同一行后面的歌词整体变淡
    expect(mark.alpha).toBeCloseTo(SCORE_EXPORT_CONFIG.WRAPPED_LINE_MARK_ALPHA);
    expect(mark.alpha).toBeLessThan(1);
    expect(cont.drawn.length).toBeGreaterThan(0);
    expect(cont.drawn.every(d => d.alpha === 1)).toBe(true);

    // 首行（非续行）不画：它是整行的开头，没有「上一行」可提示
    const head = createFakeCtx();
    renderScoreLine(head.ctx, segments[0]!, 100, 0, colors, true, 400);
    expect(head.strokes).toHaveLength(0);

    // 设置里关掉「折行提示」即不画：它只是少这一笔，版面逐像素不变（故关掉不触发任何重排）
    const off = createFakeCtx();
    renderScoreLine(off.ctx, segments[1]!, 100, 0, colors, true, 400, undefined, false);
    expect(off.strokes).toHaveLength(0);

    // 不占排版空间：提示符不在字符流里 —— 故不进字宽累加、不进折行判定、不进两端对齐的段宽
    for (const seg of segments) expect(seg.width).toBe(recomputeSegmentWidth(seg));
  });

  it('导出和弦名大于基准，降部由空弦区上 padding 让出：名字位置不动，与标记之间仍隔一份基准留白', () => {
    applyLayoutScales(100, 100);
    const g = fbGeometry();
    const base = createFretboardGeometry(g.scale);
    /** 名字的**墨迹底线**（降部底线）= 基线 + 降部深度：降部整段探到名字区外，故它是这条口径的可观测面 */
    const inkBottom = (geo: { chordNameBaselineY: number; chordNameFontSize: number }): number =>
      geo.chordNameBaselineY + EXPORT_CHORD_NAME_DESCENT_RATIO * geo.chordNameFontSize;
    /** 空弦标记（圆点 / 叉号）的墨迹上沿 = 名字区底边 + 空弦区上 padding */
    const markerTop = (geo: { chordNameBlockH: number; markerPadTop: number }): number =>
      geo.chordNameBlockH + geo.markerPadTop;

    // 需求：预览 / 导出图里的和弦名比屏幕指板**大一号**
    expect(g.chordNameFontSize).toBeGreaterThan(base.chordNameFontSize);

    // 名字的**位置**不重载：基线仍由基准给出（钉在名字区底边），故降部底线落在名字区底边**下方**
    // 一个降部深度处 —— 基准字号下 2.85、本侧 1.5 倍下 4.28，都超出基准的上 padding 2.38，
    // 这正是「j / g 下伸过多」：尾巴探进空弦标记里。
    expect(g.chordNameBaselineY).toBeCloseTo(base.chordNameBaselineY);
    expect(inkBottom(g)).toBeGreaterThan(g.chordNameBlockH);
    expect(inkBottom(g)).toBeGreaterThan(markerTop(base));

    // 空间由上 padding 让出：它按降部深度加厚，标记上沿随之被推到降部底线之下，
    // 两者之间于是仍隔着**基准那一份**留白（降部吃掉的只是补给它的那一截）
    expect(g.markerPadTop).toBeGreaterThan(base.markerPadTop);
    expect(markerTop(g)).toBeGreaterThan(inkBottom(g));
    expect(markerTop(g) - inkBottom(g)).toBeCloseTo(base.markerPadTop);
    // 下 padding 不跟着变：加厚只为容纳降部，空弦区下方那段留白与基准一致
    expect(g.markerPadBottom).toBeCloseTo(base.markerPadBottom);
  });

  it('和弦名放不下时的降级链：先转简写，简写也放不下才缩字号', () => {
    applyLayoutScales(100, 100);
    const baseSize = fbGeometry().chordNameFontSize;
    /** 替身的量宽口径（见 createFakeCtx）：一个字符 = 字号 × 比例 */
    const unit = baseSize * FAKE_CHAR_RATIO;
    const full = 'Cmaj7'; // 5 字符
    const compact = 'CM7'; // 3 字符
    const textOf = (drawn: { text: string }[]): string => drawn.map(d => d.text).join('');
    const sizeOf = (drawn: { size: number }[]): number => Math.max(...drawn.map(d => d.size));

    // 1. 完整名放得下：原字号、画完整名
    const fits = createFakeCtx();
    drawFormattedChordName(fits.ctx, 0, 0, full, '#000', full.length * unit, compact);
    expect(textOf(fits.drawn)).toBe(full);
    expect(sizeOf(fits.drawn)).toBeCloseTo(baseSize);

    // 2. 完整名放不下、简写名放得下：改画简写，**字号不动**（名字变短，而不是变小）
    const switched = createFakeCtx();
    drawFormattedChordName(switched.ctx, 0, 0, full, '#000', (full.length - 1) * unit, compact);
    expect(textOf(switched.drawn)).toBe(compact);
    expect(sizeOf(switched.drawn)).toBeCloseTo(baseSize);

    // 3. 连简写也放不下：仍画简写，但缩字号到放得下为止
    const shrunk = createFakeCtx();
    const shrunkMax = (compact.length - 1) * unit;
    drawFormattedChordName(shrunk.ctx, 0, 0, full, '#000', shrunkMax, compact);
    expect(textOf(shrunk.drawn)).toBe(compact);
    const shrunkSize = sizeOf(shrunk.drawn);
    expect(shrunkSize).toBeLessThan(baseSize);
    // 贴合确实成立：缩完之后量到的宽不再超出可用宽
    expect(compact.length * shrunkSize * FAKE_CHAR_RATIO).toBeLessThanOrEqual(shrunkMax);

    // 4. 简写名比完整名**更长**时，缩字号贴合的是完整名（取更窄的那个，不盲从「简写」二字）
    const longerCompact = createFakeCtx();
    drawFormattedChordName(longerCompact.ctx, 0, 0, 'Caug', '#000', 3 * unit, 'Caugment');
    expect(textOf(longerCompact.drawn)).toBe('Caug');

    // 5. 简写名与完整名同值（缺省档下多数名字如此）不构成降级：没有第二个候选，只能缩字号
    const same = createFakeCtx();
    drawFormattedChordName(same.ctx, 0, 0, full, '#000', 3 * unit, full);
    expect(textOf(same.drawn)).toBe(full);
    expect(sizeOf(same.drawn)).toBeLessThan(baseSize);

    // 6. 不传 maxWidth：按全局字号原样绘制 —— 没有可用宽就判不出「放不下」，也就没有降级
    const noLimit = createFakeCtx();
    drawFormattedChordName(noLimit.ctx, 0, 0, full, '#000');
    expect(textOf(noLimit.drawn)).toBe(full);
    expect(sizeOf(noLimit.drawn)).toBeCloseTo(baseSize);
  });
});
