/**
 * 写法规则层（`renderQualityFromRules`）与 token 表的一致性对照，以及解析侧的**记号叠合**。
 *
 * 这两件事是同一次改动的两半：「每种和弦都要在语料里写一行」的成因是**两头都只认整配方** ——
 * 渲染侧只查整 AST 的 token（表里没有的组合落到兜底，写法与表内不一致，`augMaj7add9` 曾渲成
 * `M7#59`）；解析侧只允许**一个**基础 token（`+M9` 这种两个记号叠起来的写法一律不认识，
 * 只能逐个列进语料）。
 *
 * 渲染侧量出「表里多少行的首选写法能由规则推出来」，推不出来的**逐条登记**为策展例外；
 * 解析侧断言叠合出来的 AST **槽位**正确，而不是「认得就行」。
 *
 * 【为什么例外用允许清单而不是「等于某个数字」】写法是用户可见的，规则改动很容易让某一行
 * 悄悄换一个写法（`M9#11` 变 `maj9#11` 这种），所以必须钉；但反过来，**新加的** token 也会
 * 落进例外集 —— 用数字会因「加了一条推得出来的 token」而误报。允许清单只会在
 * 「出现一条推不出来、又没登记过的 token」时报红，那正是需要一次显式决定的时候。
 */
import { describe, expect, it } from 'vitest';

import { getChordName } from '@/domains/chord/theory/chordName';
import { QUALITY_TOKENS } from '@/domains/chord/theory/chordQualityAst';
import { parseQualityText, renderQualityFromRules } from '@/domains/chord/theory/chordQualityAstParse';

import type { ChordQualityAst } from '@/domains/chord/theory/chordQualityAst';

/** 取 AST 的关键槽位做断言 —— 只看 `recognized` 的话，「认出来了但认错和弦」会静默通过 */
const slots = (ast: ChordQualityAst): string =>
  [
    ast.third ?? '-',
    ast.fifth ?? '-',
    ast.seventh ?? '-',
    (ast.extensions ?? [])
      .map(n => `${n.accidental === 1 ? '#' : n.accidental === -1 ? 'b' : ''}${n.degree}`)
      .join(','),
  ].join('|');

/**
 * 规则推不出来的 token（按 id）。每一类都写清「为什么规则给不出」，而不是只列个名字。
 *
 * 前四类都是**策展决定**，不是规则能推导的：
 * - `sixNine` / `m6Nine`：`6/9` 是斜杠写法，规则只会拼出 `add69`。
 * - `add2` / `add4` / `madd2` / `madd4`：与 `add9` / `add11` **AST 完全相同**，
 *   只有「用户当初写的是哪个」能区分 —— 规则不读来源，天然给不出，须靠 token id。
 * - `aug9` / `aug13`：增五属和弦这族**表内**选了 `#5` 写法（`9#5` / `13#5`），
 *   而增三和弦/增七和弦那族选了 `aug`（`aug` / `aug7` / `augMaj7`）—— 同一维度两族不同，
 *   属于数据里的既有取舍，规则只能二选一。
 * - `maj9sharp11` / `maj7sharp11`：带 `#11` 的这族**全称也用 `M`**（`M9#11` / `M7#11`），
 *   而其余大七和弦族全称写 `maj`（`maj7` / `maj9`）。
 * - `min9flat5`：只差在**简写** —— 表里 `m7b5` 的简写是 `ø7`，却没给 `m9b5` 配 `ø9`，
 *   于是规则（由 `m7b5` 骨架推出 `ø9`）与表的 `m9b5` 不一致。这条更像是数据漏配，
 *   登记在此以免静默漂移。
 */
const RULE_EXCEPTIONS = new Set([
  'sixNine',
  'm6Nine',
  'add2',
  'add4',
  'madd2',
  'madd4',
  'aug9',
  'aug13',
  'maj9sharp11',
  'maj7sharp11',
  'min9flat5',
]);

describe('和弦写法规则层', () => {
  it('推不出来的写法只能是登记过的策展例外', () => {
    const unexpected: string[] = [];
    let reproduced = 0;

    for (const token of QUALITY_TOKENS) {
      const wantedFull = token.spellings[0]!;
      const wantedShort = token.shorthand ?? wantedFull;
      const okFull = renderQualityFromRules(token.ast, false) === wantedFull;
      const okShort = renderQualityFromRules(token.ast, true) === wantedShort;
      if (okFull && okShort) reproduced++;
      else if (!RULE_EXCEPTIONS.has(token.id))
        unexpected.push(
          `${token.id}：全称 表=${JSON.stringify(wantedFull)} 规则=${JSON.stringify(renderQualityFromRules(token.ast, false))}；` +
            `简写 表=${JSON.stringify(wantedShort)} 规则=${JSON.stringify(renderQualityFromRules(token.ast, true))}`
        );
    }

    expect(unexpected, '出现未登记的例外：要么补规则，要么登记原因').toEqual([]);
    // 规则覆盖应当占绝大多数 —— 明显偏低说明规则退化了（而不是「又多了几条例外」）
    expect(reproduced).toBeGreaterThanOrEqual(QUALITY_TOKENS.length - RULE_EXCEPTIONS.size);
  });

  it('规则②有前提：堆叠不完整时不得借用更高的度数名', () => {
    // `m7` + 11（无九音）若并成 `m11`，就把「没有九音」说成了「有九音」—— 音集不同，是语义错误
    const m711 = getChordName({ chordName: 'Gm711' }, { shorthand: true });
    const m11 = getChordName({ chordName: 'Gm11' }, { shorthand: true });
    expect(m711).not.toBe(m11);
    // 两种写法各自往返：合并渲染不能把用户写的形态吃掉
    expect(getChordName({ chordName: 'Gm711' })).toBe('Gm711');
    expect(getChordName({ chordName: 'Gm7add11' })).toBe('Gm7add11');
    // 堆叠完整时（有九音）才借 `11` 这个名字
    expect(getChordName({ chordName: 'Gm9add11' }, { shorthand: true })).toBe('Gm11');
  });

  it('同一和弦的两种书写收敛到同一**简写**（性质整词 vs 性质 + 扩展音）', () => {
    // 修复前：前者走规则层得 `+M9`、后者走 token 得 `+M79`，同一批音两种简写
    const whole = getChordName({ chordName: 'GaugMaj7add9' }, { shorthand: true });
    const split = getChordName({ chordName: 'GM7#59' }, { shorthand: true });
    expect(whole).toBe(split);
    expect(whole).toBe('G+M9');
    // 全称**不**收敛，这是契约而不是缺陷：全称回显用户写法（见 segmentsToString 的注释），
    // 故整性质写法原样保留、分片写法按分片拼回
    expect(getChordName({ chordName: 'GaugMaj7add9' })).toBe('GaugMaj7add9');
    expect(getChordName({ chordName: 'GM7#59' })).toBe('GM7#59');
  });

  it('扩展音后缀：add 只出现在无七音时，6 不写 add', () => {
    // 无七音 → add（三和弦加九音）
    expect(
      renderQualityFromRules({ third: 'maj3', fifth: 'perf5', extensions: [{ degree: '9', accidental: 0 }] })
    ).toBe('add9');
    // 有七音 → 七音位被九音吸收，不写 add
    expect(
      renderQualityFromRules({
        third: 'maj3',
        fifth: 'perf5',
        seventh: 'min7',
        extensions: [{ degree: '9', accidental: 0 }],
      })
    ).toBe('9');
    // 六音不是堆叠出来的度数：既不吃 add、也不吸收七音位
    expect(
      renderQualityFromRules({ third: 'maj3', fifth: 'perf5', extensions: [{ degree: '6', accidental: 0 }] })
    ).toBe('6');
    expect(
      renderQualityFromRules({
        third: 'maj3',
        fifth: 'perf5',
        seventh: 'min7',
        extensions: [{ degree: '6', accidental: 0 }],
      })
    ).toBe('76');
  });

  it('变化音不参与吸收：7#9 / 7b13 保留七音位', () => {
    expect(
      renderQualityFromRules({
        third: 'maj3',
        fifth: 'perf5',
        seventh: 'min7',
        extensions: [{ degree: '9', accidental: 1 }],
      })
    ).toBe('7#9');
    expect(
      renderQualityFromRules({
        third: 'maj3',
        fifth: 'perf5',
        seventh: 'min7',
        extensions: [{ degree: '13', accidental: -1 }],
      })
    ).toBe('7b13');
  });
});

describe('记号叠合（解析侧）', () => {
  it('两个记号叠起来能解析成正确的和弦，而不是「认出来了但认错」', () => {
    // `+M9` = `+`(aug) 与 `M9`(maj9) 两块：增五来自前者、大七与九音来自后者。
    // 断言槽位而不是 recognized —— 只看 recognized 的话，增五被后者抹掉也会静默通过。
    expect(slots(parseQualityText('+M9').ast)).toBe('maj3|aug5|maj7|9');
    // 顺序反过来是同一批音（`#5` 是 `aug` 的拼写）
    expect(slots(parseQualityText('M9#5').ast)).toBe('maj3|aug5|maj7|9');
    expect(slots(parseQualityText('+Δ9').ast)).toBe('maj3|aug5|maj7|9');
    expect(slots(parseQualityText('+M13').ast)).toBe('maj3|aug5|maj7|9,11,13');
    expect(slots(parseQualityText('+7b9').ast)).toBe('maj3|aug5|min7|b9');
  });

  it('后续片段只贡献它明确断言的部分，不带默认值去覆盖前者', () => {
    // `M9` 的 `third: maj3` / `fifth: perf5` 是默认值而非断言；让它们参与覆盖就会抹掉 `+` 的增五。
    // 这条是本轮实测撞出来的：初版直接 `mergeAst`，`+M9` 解析成 {大三, 纯五, 大七, 九音}。
    const merged = parseQualityText('+M9').ast;
    expect(merged.fifth).toBe('aug5');
    // 默认值本身仍要在（首个片段没给三音时由后续片段补齐）
    expect(merged.third).toBe('maj3');
    // 反向顺序不能得出不同和弦
    expect(slots(parseQualityText('M9#5').ast)).toBe(slots(merged));
  });

  it('原先认得出来的写法结果不变（叠合是纯增量）', () => {
    // 整词命中仍走提前返回
    expect(parseQualityText('m7b5').tokenId).toBe('halfDim7');
    expect(parseQualityText('M7#5').tokenId).toBe('augMaj7');
    // 单片段 + 后缀的老走法
    expect(slots(parseQualityText('7b9b13').ast)).toBe('maj3|perf5|min7|b9,b13');
    expect(slots(parseQualityText('sus4add9').ast)).toBe('none|perf5|-|9');
    expect(slots(parseQualityText('maj9(no3)').ast)).toBe('maj3|perf5|maj7|9');
    // 「只有后缀」的写法仍退回大三和弦
    expect(slots(parseQualityText('#9').ast)).toBe('maj3|perf5|-|#9');
  });

  it('认不出来的多片段返回 null，而不是死循环或半个和弦', () => {
    expect(parseQualityText('blues').recognized).toBe(false);
    expect(parseQualityText('xyz').recognized).toBe(false);
    expect(parseQualityText('m7b5zz').recognized).toBe(false);
  });

  it('叠合出来的写法与整配方写法收敛到同一简写', () => {
    // 三个写法指向同一批音，简写必须一致 —— 这正是最初那条 `GM7#59` 的成因
    const names = ['G+Δ9', 'G+M9', 'GM9#5'];
    const shorts = names.map(n => getChordName({ chordName: n }, { shorthand: true }));
    expect(new Set(shorts).size).toBe(1);
    expect(shorts[0]).toBe('G+M9');
  });
});
