/**
 * 乐理内核的属性测试（fast-check）。
 *
 * 与 `chordCorpus.test.ts` 的分工：语料库钉的是**历次回归现场**（手挑的、每条带 `why` 的用例），
 * 本文件钉的是**规则本身** —— 把断言从「这几条写法」推广到「任意写法 / 任意字段组合」。
 * 两者互补：语料库说得清「哪个坑填过」，属性测试说得清「这条规则在没试过的输入上还成不成立」。
 *
 * 为什么值得单开一个属性文件：这里的被测空间是**组合**的 —— 64 个性质 token × 17 种根音写法 ×
 * 斜杠低音 × 八组 AST 字段，手写枚举只能覆盖到作者想到的那几格。而「13 蕴含 9」「omitThird
 * 真的撤掉三音」这类跨字段规则只在特定组合下才生效，随机组合比手挑更容易撞上。
 *
 * 断言选取口径：只写**实现没有构造保证**的性质 —— 跨字段交互、名字层往返、移调不变量。
 * 「`all` 是升序无重复的」这种由 `Set` + `sort` 直接保证的形态不写：那是把实现重抄一遍，
 * 改实现时它跟着改，永远绿，属于 `06-test-quality-and-self-check.md` 的「一」所禁的同义反复。
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  astToKey,
  chordQualityAstToIntervals,
  normalizeAst,
  QUALITY_TOKENS,
} from '@/domains/chord/theory/chordQualityAst';
import { parseQualityText } from '@/domains/chord/theory/chordQualityAstParse';
import {
  getChordName,
  isValidChordName,
  nameToSegments,
  transposeChordName,
  transposePitch,
} from '@/domains/chord/theory/theory';

import type {
  ChordQualityAst,
  ExtensionDegree,
  FifthDegree,
  SeventhDegree,
  SusDegree,
  ThirdDegree,
} from '@/domains/chord/theory/chordQualityAst';
import type { AccidentalType } from '@/domains/chord/types';

/**
 * 跑数：默认 100。这里调到 300 —— 被测函数都是纯计算（无 IO、无挂载），300 次仍在毫秒级，
 * 而组合空间（尤其 `extensions` 的四元组）需要更高密度才容易撞上边界。
 */
const NUM_RUNS = 300;

// ==================== 生成器 ====================

/** 三音 / 五音 / 七音 / 挂留的取值域 —— 直接列字面量而不是从 AST 类型反射，改动时类型检查会拦下 */
const arbAst: fc.Arbitrary<ChordQualityAst> = fc.record({
  third: fc.constantFrom<ThirdDegree>('maj3', 'min3', 'none'),
  fifth: fc.constantFrom<FifthDegree>('perf5', 'dim5', 'aug5', 'none'),
  seventh: fc.constantFrom<SeventhDegree>('maj7', 'min7', 'dim7', 'none'),
  sus: fc.constantFrom<SusDegree>('sus4', 'sus2', 'none'),
  // 上限 4 而不是 2：`C13b9#11` 这类多张力写法是真实存在的，长度受限会把「多个扩展音同音撞车」
  // 的那条规则（还原音与核心同音则不算扩展）压到几乎撞不上
  extensions: fc.array(
    fc.record({
      degree: fc.constantFrom<ExtensionDegree>('6', '9', '11', '13'),
      accidental: fc.constantFrom<AccidentalType>(0, 1, -1),
    }),
    { maxLength: 4 }
  ),
  omitThird: fc.boolean(),
  omitFifth: fc.boolean(),
});

/** 根音写法：只取单升降号的规范拼写 —— 双升降号（`Cbb`）不是本项目的音名域，生成它等于测别的输入域 */
const ROOT_SPELLINGS = [
  'C',
  'C#',
  'Db',
  'D',
  'D#',
  'Eb',
  'E',
  'F',
  'F#',
  'Gb',
  'G',
  'G#',
  'Ab',
  'A',
  'A#',
  'Bb',
  'B',
] as const;

/** token 表的全部原始写法（含简写与符号形态），是解析器承诺接受的那一集 */
const QUALITY_SPELLINGS: readonly string[] = QUALITY_TOKENS.flatMap(t => t.spellings);

/**
 * 移调属性专用的写法池：排除首字符是变音记号（`#` / `b` / `♯` / `♭`）的那批。
 *
 * 原因不是「它们不合法」，而是它们与根音的变音记号**共享同一个字符位**：`#5` / `b9` / `#11`
 * 紧跟根音书写时，词法切分点会随根音拼写一起移动。`transposeChordName('Db#5', -13)` 拼出的是
 * `'C#5'` —— 而 `'C#5'` 再解析时 `C#` 被当成根音，音集从 `{0,4,8}` 变成 `{0,7}`。
 *
 * 这是 `transposeChordName` 的真实缺陷（下方 `it.todo` 记着），但它属于**词法层**，
 * 与本文件要锁的移调不变量是两件事。把它留在池里只会让每一条移调属性在随机输入上随机红，
 * 报错指向「音集漂移」而不是「后缀与根音撞位」，反而盖住真正的原因。
 */
const TRANSPOSABLE_SPELLINGS: readonly string[] = QUALITY_SPELLINGS.filter(s => !/^[#b♯♭]/.test(s));

const arbNameFrom = (spellings: readonly string[]): fc.Arbitrary<string> =>
  fc
    .tuple(fc.constantFrom(...ROOT_SPELLINGS), fc.constantFrom(...spellings))
    .map(([root, quality]) => `${root}${quality}`);

/** 随机合法和弦名：根音 × token 写法（全集，用于名字层往返） */
const arbChordName = arbNameFrom(QUALITY_SPELLINGS);

/** 随机合法和弦名（移调属性专用池，见 `TRANSPOSABLE_SPELLINGS`） */
const arbTransposableName = arbNameFrom(TRANSPOSABLE_SPELLINGS);

// ==================== 取音集 ====================

/**
 * 取一个和弦名展开后的音集（相对根音的半音，升序）。
 *
 * 用 `parseQualityText` 而非 `chordQualityAstOfName`：后者对**空性质串返回 null**，而裸三和弦
 * （`C`）恰恰是「性质为空串且识别成功」，走后者会把最基础的输入判成解析失败。
 */
const pitchSetOfName = (name: string): number[] | null => {
  const segs = nameToSegments(name);
  if (!segs) return null;
  const parsed = parseQualityText(segs.quality ?? '');
  return parsed.recognized ? chordQualityAstToIntervals(parsed.ast).all : null;
};

// ==================== 一、AST 展开的音集 ====================

describe('性质 AST 展开（属性）', () => {
  it('任意 AST 展开出的音集恒含根音，且每个音都落在 [0, 11]', () => {
    fc.assert(
      fc.property(arbAst, ast => {
        const { all } = chordQualityAstToIntervals(ast);
        // 根音恒在场：它是「相对根音的半音集合」这一表示法的定义域前提，缺了它整条识别链路失义
        expect(all).toContain(0);
        for (const semitone of all) {
          expect(Number.isInteger(semitone)).toBe(true);
          expect(semitone).toBeGreaterThanOrEqual(0);
          expect(semitone).toBeLessThanOrEqual(11);
        }
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('撤掉三音 / 五音只会让音集变小，不会凭空新增音', () => {
    // 单调性。`omitThird` / `omitFifth` 若在实现里被写成「撤掉后再补个默认值」，就会凭空多出音，
    // 而这种错在固定用例上几乎看不出来 —— 多出来的音通常恰好是别处也有的音。
    fc.assert(
      fc.property(arbAst, ast => {
        const plain = chordQualityAstToIntervals(ast).all;
        const noThird = chordQualityAstToIntervals({ ...ast, omitThird: true }).all;
        const noFifth = chordQualityAstToIntervals({ ...ast, omitFifth: true }).all;
        for (const semitone of noThird) expect(plain).toContain(semitone);
        for (const semitone of noFifth) expect(plain).toContain(semitone);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('omitThird 与 third:none 在展开层完全等价', () => {
    // 这两者的差别只在**渲染与识别**：`Cno3` 要渲染回 `Cno3` 而不是退化成 `C5`（语料库锁这条）。
    // 但在「展开成音集」这一层，两者都是「三音不在场」，必须完全一致 —— 这正是
    // `chordQualityAstToIntervals` 注释里那句「两者音集相同但含义不同」的可检验形态。
    fc.assert(
      fc.property(arbAst, ast => {
        const omitted = chordQualityAstToIntervals({ ...ast, third: 'maj3', omitThird: true });
        const none = chordQualityAstToIntervals({ ...ast, third: 'none' });
        expect(omitted).toEqual(none);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('声明的三音 / 五音 / 七音 / 挂留音恒反映到音集里', () => {
    fc.assert(
      fc.property(arbAst, ast => {
        const { all } = chordQualityAstToIntervals(ast);
        if (ast.third === 'maj3' && !ast.omitThird) expect(all).toContain(4);
        if (ast.third === 'min3' && !ast.omitThird) expect(all).toContain(3);
        if (ast.fifth === 'perf5' && !ast.omitFifth) expect(all).toContain(7);
        if (ast.fifth === 'dim5' && !ast.omitFifth) expect(all).toContain(6);
        if (ast.fifth === 'aug5' && !ast.omitFifth) expect(all).toContain(8);
        if (ast.seventh === 'maj7') expect(all).toContain(11);
        if (ast.seventh === 'min7') expect(all).toContain(10);
        if (ast.seventh === 'dim7') expect(all).toContain(9);
        if (ast.sus === 'sus4') expect(all).toContain(5);
        if (ast.sus === 'sus2') expect(all).toContain(2);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('13 的累积语义：核心已有七音时，声明 13 必然带出九音', () => {
    // `C13` = 7 + 9 + 11 + 13，这条累积规则只在「核心有七音」时生效 —— 否则 `Cadd13` / `C6`
    // 会被误补成 C9。两个方向都要锁：有七音时必须补，没七音时必须不补。
    fc.assert(
      fc.property(arbAst, ast => {
        const declares13 = (ast.extensions ?? []).some(e => e.degree === '13' && e.accidental === 0);
        if (!declares13) return;

        const declares9 = (ast.extensions ?? []).some(e => e.degree === '9');
        const { all } = chordQualityAstToIntervals(ast);
        const hasSeventh = ast.seventh === 'min7' || ast.seventh === 'maj7';
        // 九音的半音值是 2（`DEGREE_SEMITONES['9']`）
        if (hasSeventh && !declares9) expect(all).toContain(2);
        // 反向：核心没有七音时不得凭空补九音。断言前先排掉「别的字段自己就会产生 2」的情形 ——
        // 会产出 2 半音的只有挂二（sus2）与还原九音两者，三音 / 五音 / 七音 / omit 都不产 2。
        if (!hasSeventh && !declares9 && ast.sus !== 'sus2') expect(all).not.toContain(2);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('normalizeAst 只补默认值，不改变展开出的音集与比较键', () => {
    // `normalizeAst` 被识别层与渲染层共用（补 `'none'` 便于比较）。它一旦顺手改了字段语义
    // （比如把 `third: 'none'` 当成缺省去补个默认三音），下游全部静默错位 —— 这条把它钉在「纯补默认」上。
    fc.assert(
      fc.property(arbAst, ast => {
        expect(chordQualityAstToIntervals(normalizeAst(ast))).toEqual(chordQualityAstToIntervals(ast));
        // 幂等：归一化两次与一次同键（比较键是下游缓存与去重的依据）
        expect(astToKey(normalizeAst(normalizeAst(ast)))).toBe(astToKey(normalizeAst(ast)));
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ==================== 二、名字层往返 ====================

describe('和弦名往返（属性）', () => {
  it('token 表里的任意写法配任意根音都判合法，且展开得出音集', () => {
    // 前置条件断言：它同时是「生成器没有喂进非法输入」的自检，也是 token 表的覆盖面自检 ——
    // 表里任何一条写法只要解析不出音集，整张 token 表就有一条是死的，这里立刻暴露。
    fc.assert(
      fc.property(arbChordName, name => {
        expect(isValidChordName(name), `${name} 应判合法`).toBe(true);
        expect(pitchSetOfName(name), `${name} 应能展开出音集`).not.toBeNull();
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('渲染是幂等的：规范写法再渲染一次不变', () => {
    // 「渲染」是收敛到规范形态的运算，规范形态必须是它的不动点。不成立意味着同一个和弦会在缓存里
    // 反复改写（渲染 → 存 → 再渲染 → 又变），而这在语料库的固定用例上不一定撞得到。
    fc.assert(
      fc.property(arbChordName, name => {
        const once = getChordName({ chordName: name });
        expect(getChordName({ chordName: once })).toBe(once);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('渲染不改变音集，且渲染结果仍然合法', () => {
    fc.assert(
      fc.property(arbChordName, name => {
        const rendered = getChordName({ chordName: name });
        expect(pitchSetOfName(rendered), `${name} → ${rendered} 后音集漂移`).toEqual(pitchSetOfName(name));
        expect(isValidChordName(rendered), `${name} → ${rendered} 后判非法`).toBe(true);
      }),
      { numRuns: NUM_RUNS }
    );
  });
});

// ==================== 三、移调不变量 ====================

describe('移调不变量（属性）', () => {
  it('0 / +12 / -12 位移给出同一个规范形态，且该形态是不动点', () => {
    // 三种位移在模 12 下是同一个运算，必须落到同一个名字上 —— `spellPitch` 的升降号偏好若对不同
    // 位移分支不一致（例如给 0 走短路、给 ±12 走通用分支），这条立刻红。
    //
    // 不写成「恒等于原写法」：`Cm9(b5)` 位移 0 会得到 `Cm9b5` —— 括号收敛是**渲染层的有意行为**
    // （同一个和弦不得在缓存里各占一条键，见语料库断言二），移调顺路收敛属预期而非缺陷。
    fc.assert(
      fc.property(arbTransposableName, name => {
        const zero = transposeChordName(name, 0);
        expect(transposeChordName(name, 12), `${name} 的 +12 位移`).toBe(zero);
        expect(transposeChordName(name, -12), `${name} 的 -12 位移`).toBe(zero);
        expect(transposeChordName(zero, 0), `${zero} 的 0 位移`).toBe(zero);
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('任意位移后仍判合法，且音集不随位移改变', () => {
    // 音集是**相对根音**的半音集合，移调整体平移根音与全部和弦音，相对关系不变 ——
    // 所以移调后音集必须逐位相同。这条能抓住「移调动了后缀」或「拼出的音名解析不回来」。
    fc.assert(
      fc.property(arbTransposableName, fc.integer({ min: -24, max: 24 }), (name, semitones) => {
        const moved = transposeChordName(name, semitones);
        expect(isValidChordName(moved), `${name} 位移 ${semitones} → ${moved} 应判合法`).toBe(true);
        expect(pitchSetOfName(moved), `${name} 位移 ${semitones} → ${moved} 音集漂移`).toEqual(pitchSetOfName(name));
      }),
      { numRuns: NUM_RUNS }
    );
  });

  it('transposePitch 构成模 12 的交换群', () => {
    // 三个公理各自独立：单位元、逆元（负位移必须真的回得来 —— 这是 `((x + n) % 12 + 12) % 12`
    // 那个双重取模存在的唯一理由）、结合律。JS 的 `%` 对负数返回负值，写漏一层取模就只在这条上红。
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 11 }),
        fc.integer({ min: -48, max: 48 }),
        fc.integer({ min: -48, max: 48 }),
        (pitch, a, b) => {
          expect(transposePitch(pitch, 0)).toBe(pitch);
          expect(transposePitch(transposePitch(pitch, a), -a)).toBe(pitch);
          expect(transposePitch(transposePitch(pitch, a), b)).toBe(transposePitch(pitch, a + b));
          const shifted = transposePitch(pitch, a);
          expect(shifted).toBeGreaterThanOrEqual(0);
          expect(shifted).toBeLessThanOrEqual(11);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  // 已知缺陷，未修：`transposeChordName` 拼出的名字可能解析不回来。
  // 后缀以变音记号起头时（`#5` / `b9` / `#11`），移调改变根音拼写会让这个记号被重新切给根音：
  // `Db#5` 位移 -13 → `C#5`，而 `C#5` = `C#` + `5`（强力和弦），音集从 `{0,4,8}` 变成 `{0,7}`。
  // 触发条件是「后缀以变音记号起头」且「移调后根音拼写变化」，两者同时成立才炸，故日常难撞。
  // 修它要动 `src/domains/chord/theory/transpose.ts`（属 `02-protected-zones.md` 的保护区），
  // 已在回复中提示，未擅自改动。
  it.todo('已知缺陷：后缀以变音记号起头时，移调后的根音拼写与后缀首字符词法合并（Db#5 -13 → C#5）');
});
