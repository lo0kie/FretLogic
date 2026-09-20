import { describe, expect, it } from 'vitest';

import { analyzeChordGraph } from '@/domains/chord/theory/chordEngine';
import { astToKey, QUALITY_TOKENS } from '@/domains/chord/theory/chordQualityAst';
import {
  compositeTokens,
  preferredHit,
  recognizeByIntervals,
  selfCheckCoverage,
} from '@/domains/chord/theory/chordRecognitionAst';
import { isValidChordName, nameToSegments, segmentsToString } from '@/domains/chord/theory/theory';

import type { NoteInput } from '@/domains/chord/types';

const note = (stringIndex: number, pitchIndex: number, label: string): NoteInput => ({
  stringIndex,
  pitchIndex,
  label,
});

/** 相对根音的半音集合 → 识别器首选命中的 tokenId */
const preferredId = (semitones: readonly number[]): string | undefined =>
  preferredHit(recognizeByIntervals(semitones))?.tokenId;

/**
 * 和弦识别语料库：把散落在开发过程中的「实测踩到的 case」收敛成可回归的基线。
 *
 * 覆盖：组合候选（Gm7add11——本轮之前只能退化成 Gm11）、半减七、sus、强力和弦、
 * C6 vs Cadd13 的同音集取舍、`m7add11` / `m711` 双写法的 segments 形态、
 * 以及「组合候选不与 token 表重复」的结构不变量。
 * 下次改动识别候选生成或权重规则时，先跑这里。
 */
describe('和弦识别语料库（回归基线）', () => {
  it('组合候选：Gm7add11 能从指法音集反推（此前只会退化成虚报九音的 Gm11）', () => {
    // G Bb D F C → 相对根音半音 [0,3,7,10,5]
    const hits = recognizeByIntervals([0, 3, 7, 10, 5], { allowMissing: 1, maxExtra: 3 });
    const composite = compositeTokens().find(c => c.suffix === 'm7add11');
    expect(composite).toBeDefined();

    const hit = hits.find(h => h.tokenId === composite!.id);
    expect(hit).toBeDefined();
    expect(hit!.composite).toBe(true);
    // 贴合度：五个音全部被解释（purity 1）、没有虚报（inflation 0）
    expect(hit!.purity).toBe(1);
    expect(hit!.inflation).toBe(0);

    // 原生 min11 同样解释全部音，但声明了缺席的九音 → 虚报 1，排在组合候选之后
    const min11 = hits.find(h => h.tokenId === 'min11');
    expect(min11).toBeDefined();
    expect(min11!.inflation).toBeGreaterThan(hit!.inflation);
    expect(preferredHit(hits)?.tokenId).toBe(composite!.id);

    // 引擎级：最佳候选的名字与文本输入同形（Gm7add11），根音为 G
    const result = analyzeChordGraph([
      note(0, 43, 'G'),
      note(1, 46, 'A#'),
      note(2, 50, 'D'),
      note(3, 53, 'F'),
      note(4, 60, 'C'),
    ]);
    expect(result.bestRootPitch % 12).toBe(7);
    expect(result.best?.chordName).toBe('Gm7add11');
  });

  it('防过度泛化：纯三和弦上不凭空冒出组合候选，基础读法稳定胜出', () => {
    // C E G：能叠加的 add 音（9/11/13 → 半音 2/5/9）都不在音集里 → 不产生任何组合候选
    const triad = recognizeByIntervals([0, 4, 7]);
    expect(triad.some(h => h.composite)).toBe(false);
    expect(preferredId([0, 4, 7])).toBe('major');

    // C E G A：six 是 token 表里的原生配方，压过同音集的其它写法（历史坑：曾被读成 Cadd13）
    expect(preferredId([0, 4, 7, 9])).toBe('six');
  });

  it('历史坑点：半减七 / 挂留 / 强力和弦不被同音集的别的读法挤掉', () => {
    expect(preferredId([0, 3, 6, 10])).toBe('halfDim7'); // m7b5（b5 与张力音语法同形）
    expect(preferredId([0, 5, 7])).toBe('sus4'); // 无三音：按挂留读，而非 no3
    expect(preferredId([0, 7])).toBe('power'); // 根音 + 五音 = 强力和弦
  });

  it('双写法：m7add11（quality 整词）与 m711（quality + extensions）同音不同形，均合法且各自往返', () => {
    const whole = nameToSegments('Gm7add11');
    expect(whole?.quality).toBe('m7add11');
    expect(whole?.extensions).toBeUndefined();
    expect(segmentsToString(whole!)).toBe('Gm7add11');

    const split = nameToSegments('Gm711');
    expect(split?.quality).toBe('m7');
    expect(split?.extensions).toEqual([[11, 0]]);
    expect(segmentsToString(split!)).toBe('Gm711');

    expect(isValidChordName('Gm7add11')).toBe(true);
    expect(isValidChordName('Gm711')).toBe(true);
  });

  it('防垃圾候选：强力和弦的五音不可缺席；与配方已有音同音的叠加不生成', () => {
    // {C,E,G}（C 低音）：E5 / G5 的五音缺席，此前借「五音可省 + 低音豁免」在引擎层冒出 E5/C、G5/C
    const result = analyzeChordGraph([note(0, 48, 'C'), note(1, 52, 'E'), note(2, 55, 'G')]);
    const names = result.candidates.map(c => c.chordName);
    expect(names).not.toContain('E5/C');
    expect(names).not.toContain('G5/C');
    // sus4 的四音恰为十一度：sus4 + add11 同音冗余，不生成该组合候选
    expect(names).not.toContain('Gsus4add11/C');
    expect(compositeTokens().some(c => c.suffix === 'sus4add11')).toBe(false);
    // 真正的强力和弦（根音 + 五音齐全）不受影响；同音过滤不误伤 sus4 + add13（E 是独立的一块音）
    expect(names).toContain('C5');
    expect(compositeTokens().some(c => c.suffix === 'sus4add13')).toBe(true);
    expect(preferredId([0, 7])).toBe('power');
  });

  it('识别覆盖自检:每个 token 的配方展开音集都能被识别回自己(非 notationOnly 全量)', () => {
    // 识别器自带的覆盖率报告此前没有任何测试调用——这里把它锁死:
    // token 表里每个可识别配方(排除 no3/no5/9sus2 这类纯记谱写法)展开出的音集,
    // 必须能被识别引擎找回自己的 tokenId。任何候选生成 / 签名构建的回归都会在这里爆。
    const { total, recovered, failures } = selfCheckCoverage();
    expect(failures).toEqual([]);
    expect(recovered).toBe(total);
    expect(total).toBe(QUALITY_TOKENS.filter(t => t.notationOnly !== true).length);
  });

  it('斜杠低音不参与色彩音组成：仅由低音撑起的延伸音候选被拒绝', () => {
    // {C,G,B,F} 低音 C：11 度就是低音本身，不得读出 G7add11/C（应回归惯例的 G7/C）
    const result = analyzeChordGraph([note(0, 48, 'C'), note(1, 55, 'G'), note(2, 59, 'B'), note(3, 53, 'F')]);
    const names = result.candidates.map(c => c.chordName);
    expect(names).not.toContain('G7add11/C');
    expect(names).not.toContain('Gaug7add11/C');
    expect(names).not.toContain('G7b5add11/C');
    // 纯度优先排序后：惯例读法 G7/C（p1.00，低音豁免）压过丢音的 Csus4（p0.75）
    expect(names).toContain('G7/C');
    expect(result.best?.chordName).toBe('G7/C');
    // 边界：低音仍可占据 core 槽位——挂留属 core（G7sus4/C 存活），转位（C/E，三音在低音）不受此限
    expect(names).toContain('G7sus4/C');
    const inversion = analyzeChordGraph([note(0, 52, 'E'), note(1, 55, 'G'), note(2, 60, 'C')]);
    expect(inversion.best?.chordName).toBe('C/E');
    // 七音同属 core 骨架（根-三-五-七）：{D,B,G#,E} = E7 第三转位（七音在低音）→ E7/D 是唯一
    // 四音各归其位的读法（p1.00/extra0；其余候选全为退化：Bm6/D p0.75、Bdim7add11/D 等）
    const thirdInversion = analyzeChordGraph([note(0, 50, 'D'), note(1, 56, 'G#'), note(2, 59, 'B'), note(3, 64, 'E')]);
    expect(thirdInversion.best?.chordName).toBe('E7/D');
  });

  it('纯度优先：四音全保的转位读法压过丢音的根音位读法（{A,G#,B,E} → E/A 而非 Asus2）', () => {
    // {A,B,E,G#} 无三音：maj9/minMaj9 被「三音必须在场」正确拒绝（二者在识别器里同分并列，
    // 不能断言 C# 还是 C）。Asus2（p0.75）会把大七度 G# 当 extra 丢掉；E/A（p1.00）四音全保
    // ——纯度优先排序后 E/A 胜出，G# 不再被忽略。Asus2 仍作为备选存在。
    const result = analyzeChordGraph([note(0, 45, 'A'), note(1, 56, 'G#'), note(2, 59, 'B'), note(3, 64, 'E')]);
    const names = result.candidates.map(c => c.chordName);
    expect(names).toContain('E/A');
    expect(names).toContain('Asus2');
    expect(result.best?.chordName).toBe('E/A');
  });

  it('引擎级：完整 Amaj9 指法 → Amaj9（与 no3 组对照：缺三音时才退化成 E/A）', () => {
    // {A,C#,E,G#,B} 五音全在:Amaj9(p1.00) 压过 E6/A、C#m7/A 等同集相对读法
    const result = analyzeChordGraph([
      note(0, 45, 'A'),
      note(1, 49, 'C#'),
      note(2, 52, 'E'),
      note(3, 56, 'G#'),
      note(4, 59, 'B'),
    ]);
    expect(result.best?.chordName).toBe('Amaj9');
  });

  it('13 和弦省音:吉他声位与 shell 声位都能读出 C13(归因模型的合法省略)', () => {
    // 吉他声位 x35355 = {C,G,Bb,E,A}:省 9、11(13 系的合法可省音)——此前被
    // 「半数实例化门槛」拒掉,垃圾相对读法 Gm6/9/C 胜出
    const guitar = analyzeChordGraph([
      note(0, 48, 'C'),
      note(1, 55, 'G'),
      note(2, 58, 'Bb'),
      note(3, 64, 'E'),
      note(4, 69, 'A'),
    ]);
    expect(guitar.best?.chordName).toBe('C13');
    // shell = {C,Bb,E,A}:省 5、9、11 —— 同样应读出 C13(此前是 Am/C)
    const shell = analyzeChordGraph([note(0, 48, 'C'), note(1, 58, 'Bb'), note(2, 64, 'E'), note(3, 69, 'A')]);
    expect(shell.best?.chordName).toBe('C13');
    // 缺 13 音本身的声位不得叫 C13:{C,E,G,Bb,F} → dom13 因「名字来源(13)缺席」被拒 ✓。
    // 该声位的精确名是 C7add11(dom11 缺九音被拒也是正确的),但它跌出 TOP_EVALUATE_LIMIT
    // 截断线,故只锁否定面:不叫 C13、不叫 Am/C / Gm6/9/C 这类相对读法垃圾。
    const no13 = analyzeChordGraph([note(0, 48, 'C'), note(1, 55, 'G'), note(2, 58, 'Bb'), note(3, 65, 'F')]);
    const no13Names = no13.candidates.map(c => c.chordName);
    expect(no13Names).not.toContain('C13');
    expect(no13Names).not.toContain('Gm6/9/C');
    expect(no13Names).not.toContain('Am/C');
    // C9 声位不得被 C11 抢名:{C,E,G,Bb,D} → C9(11 在 C9 里可省,但 11 是 C11 的名字来源,
    // 缺了它 C11 不成立;而 C9 的九音在场)
    const c9 = analyzeChordGraph([
      note(0, 48, 'C'),
      note(1, 52, 'E'),
      note(2, 55, 'G'),
      note(3, 58, 'Bb'),
      note(4, 62, 'D'),
    ]);
    expect(c9.best?.chordName).toBe('C9');
  });

  it('结构不变量：组合候选不与 token 表任何配方的 AST 等价（生成期已去重）', () => {
    const tokenKeys = new Set(QUALITY_TOKENS.map(t => astToKey(t.ast)));
    const ids = new Set<string>();
    for (const c of compositeTokens()) {
      expect(tokenKeys.has(astToKey(c.ast))).toBe(false);
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
    }
  });
});
