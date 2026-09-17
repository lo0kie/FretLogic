import type { GrammarTemplate } from './chordEngine.ts';

/**
 * 和弦模板表。
 *
 * 【三音可省不变量】扩展和弦（9 / 11 / 13 家族）的身份由「7 音 + 扩展音」决定，三音只负责
 * 区分大小调，可以缺席。因此大小调成对的模板必须同时允许三音缺席——一侧把三音写成
 * optional（或干脆不收，如 `11`），另一侧写成 required，就会出现「同一音集只推导得出大调名、
 * 推导不出小调名」的不对称（例：E F# A D 曾只有 E11、没有 Em11）。
 * 成对关系：`11` ↔ `m11`、`9` ↔ `m9`、`13` ↔ `m13`、`Maj9` ↔ `mMaj9`。
 *
 * 【成对模板的 baseWeight 必须相等】三音缺席时两者会同时命中且纯度、外音数完全相同，
 * 于是按数组顺序（大调 / 属和弦一侧排在前面）决定默认读法；若小调一侧权重更高，
 * 它会把 best 从小调读法抢走（13 家族曾出现 185 vs 180 这种倒挂）。
 */
export const GRAMMAR_TEMPLATES: GrammarTemplate[] = [
  {
    suffix: '',
    category: 'triad',
    baseWeight: 100,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [1, 3, 5, 6, 8, 10, 11],
  },
  {
    suffix: 'm',
    category: 'triad',
    baseWeight: 100,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 3, role: 'third_minor', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [1, 4, 5, 6, 8, 10, 11],
  },
  {
    suffix: 'dim',
    category: 'triad',
    baseWeight: 70,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 6, role: 'fifth_dim', confidence: 'core' },
    ],
    conflicts: [4, 7, 8, 10, 11],
  },
  {
    suffix: 'aug',
    category: 'triad',
    baseWeight: 70,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 8, role: 'fifth_aug', confidence: 'core' },
    ],
    conflicts: [3, 6, 7, 10, 11],
  },
  {
    suffix: 'sus4',
    category: 'sus',
    baseWeight: 80,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 5, role: 'sus4', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [3, 4],
  },
  {
    suffix: 'sus2',
    category: 'sus',
    baseWeight: 80,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 2, role: 'sus2', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [3, 4],
  },
  {
    suffix: '5',
    category: 'power',
    baseWeight: 50,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 7, role: 'fifth_perfect', confidence: 'core' },
    ],
    conflicts: [1, 2, 3, 4, 5, 6, 8, 9, 10, 11],
  },
  {
    suffix: '6',
    category: 'triad',
    baseWeight: 110,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 9, role: 'sixth', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [3, 10, 11],
  },
  {
    suffix: 'm6',
    category: 'triad',
    baseWeight: 110,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 9, role: 'sixth', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [4, 10, 11],
  },
  {
    suffix: 'add9',
    category: 'triad',
    baseWeight: 100,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [3, 10, 11],
  },
  {
    suffix: 'madd9',
    category: 'triad',
    baseWeight: 100,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [4, 10, 11],
  },
  {
    suffix: 'add11',
    category: 'triad',
    baseWeight: 105,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 5, role: 'eleventh', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [3, 10, 11],
  },
  {
    suffix: 'madd11',
    category: 'triad',
    baseWeight: 105,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 5, role: 'eleventh', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [4, 10, 11],
  },
  {
    suffix: '6/9',
    category: 'triad',
    baseWeight: 120,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 9, role: 'sixth', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [3, 10, 11],
  },
  {
    suffix: 'm6/9',
    category: 'triad',
    baseWeight: 120,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 9, role: 'sixth', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [4, 10, 11],
  },
  {
    suffix: '7',
    category: 'seventh',
    baseWeight: 130,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [3, 11],
  },
  {
    suffix: 'Maj7',
    category: 'seventh',
    baseWeight: 130,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 11, role: 'seventh_major', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [3, 10],
  },
  {
    suffix: 'm7',
    category: 'seventh',
    baseWeight: 130,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [4, 11],
  },
  {
    suffix: 'mMaj7',
    category: 'seventh',
    baseWeight: 120,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 11, role: 'seventh_major', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [4, 10],
  },
  {
    suffix: 'm7b5',
    category: 'seventh',
    baseWeight: 120,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 6, role: 'fifth_dim', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
    ],
    conflicts: [4, 7, 11],
  },
  {
    suffix: 'dim7',
    category: 'seventh',
    baseWeight: 120,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 6, role: 'fifth_dim', confidence: 'core' },
      { interval: 9, role: 'seventh_dim', confidence: 'core' },
    ],
    conflicts: [4, 7, 10, 11],
  },
  {
    suffix: 'dimMaj7',
    category: 'seventh',
    baseWeight: 115,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 6, role: 'fifth_dim', confidence: 'core' },
      { interval: 11, role: 'seventh_major', confidence: 'core' },
    ],
    conflicts: [4, 10],
  },
  {
    suffix: '7sus4',
    category: 'sus',
    baseWeight: 110,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 5, role: 'sus4', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [3, 4],
  },
  {
    suffix: '7sus2',
    category: 'sus',
    baseWeight: 110,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 2, role: 'sus2', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [3, 4],
  },
  {
    suffix: '9',
    category: 'extended',
    baseWeight: 160,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'core' },
    ],
    // 三音可省（见文件头不变量）：9 与 Maj9 只差七音（b7 / maj7），而 Maj9 一直把三音写成
    // optional: anchor，属和弦这一侧没有理由更严。三音从 required 移到 optional（保留 core）
    // 后，三音在场时角色集、纯度、外音数、baseWeight 全不变，只有「无三音的音集能否被 9 家族
    // 解释」发生变化。必须与 m9 同时放开，否则无三音音集（如 C D G Bb）会变成只有 Cm9、
    // 没有 C9，比不改更糟；两者 baseWeight 相同且 9 在数组中靠前，默认仍取 X9。
    optional: [
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 7, role: 'fifth_perfect', confidence: 'anchor' },
    ],
    conflicts: [3, 11],
  },
  {
    suffix: 'Maj9',
    category: 'extended',
    baseWeight: 160,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 11, role: 'seventh_major', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'core' },
    ],
    optional: [
      { interval: 4, role: 'third_major', confidence: 'anchor' },
      { interval: 7, role: 'fifth_perfect', confidence: 'anchor' },
    ],
    conflicts: [3, 10],
  },
  {
    suffix: 'm9',
    category: 'extended',
    baseWeight: 160,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'core' },
    ],
    // 三音可省（见文件头不变量）：与 9 成对，两侧同时把三音放进 optional 并保留 core。
    // 三音在场时解释力与结论不变；无三音时 9 与 m9 两解并存，按数组顺序默认取 X9。
    // conflicts [4] 仍在：带大三音的音集不会落入 m9。
    optional: [
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 7, role: 'fifth_perfect', confidence: 'anchor' },
    ],
    conflicts: [4, 11],
  },
  {
    suffix: 'mMaj9',
    category: 'extended',
    // 权重与 Maj9 拉平（原为 165）：理由同 m13。165 与 Maj9 的 160 原本不构成竞争
    // （conflicts [4] / [3] 互斥），降权不影响带三音的音集。
    baseWeight: 160,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 11, role: 'seventh_major', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'core' },
    ],
    // 三音可省（见文件头不变量）：与 Maj9 成对——Maj9 把大三音写成 optional: anchor，
    // 原先 mMaj9 却把 b3 列为必选，于是 E B D# F#（无三音的大九和弦）只能出 EMaj9、
    // 出不来 EmMaj9。三音在场时解释力与结论不变。
    optional: [
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 7, role: 'fifth_perfect', confidence: 'anchor' },
    ],
    conflicts: [4, 10],
  },
  {
    suffix: 'm9b5',
    category: 'extended',
    baseWeight: 150,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 6, role: 'fifth_dim', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'core' },
    ],
    conflicts: [4, 7, 11],
  },
  {
    suffix: '9sus4',
    category: 'sus',
    baseWeight: 150,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 5, role: 'sus4', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [3, 4],
  },
  {
    suffix: '11',
    category: 'extended',
    baseWeight: 170,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 5, role: 'eleventh', confidence: 'core' },
    ],
    optional: [
      // 大三音与 m11 的 b3 成对：conflicts 只拦 b3，说明大三音是允许出现的和弦音，
      // 那就必须能解释它，不能让它在纯度里被算成外音（原实现使 C E Bb F 这种标准 11 和弦
      // 的 E 记作外音、纯度只有 0.75）。三音在不在场都不影响无三音音集的读法。
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'optional' },
      { interval: 7, role: 'fifth_perfect', confidence: 'anchor' },
    ],
    conflicts: [3],
  },
  {
    suffix: 'm11',
    category: 'extended',
    baseWeight: 170,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 5, role: 'eleventh', confidence: 'core' },
    ],
    // 三音可省略：11 和弦的三音本就常被省掉——`11` 模板自己也不要求三音，只在 conflicts 里
    // 拦下 b3（把「小三音」这一路划给 m11）。原先把 b3 列为必选，于是同一套无三音按法
    // （如 E F# A D：根音 + 9 + 11 + b7）只能出 E11、出不来 Em11。
    // 把 b3 放进 optional（保留 core 置信度）后：有三音时解释力与结论不变，
    // 无三音时 11 与 m11 两解并存；conflicts [4] 仍在，m11 不会吞掉带大三音的和弦。
    optional: [
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'optional' },
      { interval: 7, role: 'fifth_perfect', confidence: 'anchor' },
    ],
    conflicts: [4],
  },
  {
    suffix: '13',
    category: 'extended',
    baseWeight: 180,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 9, role: 'thirteenth', confidence: 'core' },
    ],
    optional: [
      { interval: 2, role: 'ninth', confidence: 'optional' },
      { interval: 4, role: 'third_major', confidence: 'anchor' },
      { interval: 7, role: 'fifth_perfect', confidence: 'anchor' },
    ],
    conflicts: [3],
  },
  {
    suffix: 'm13',
    category: 'extended',
    // 权重与 13 拉平（原为 185）：无三音时两者同时命中且纯度相同，靠数组顺序取 13；
    // 若 m13 权重更高会把 best 抢成 Xm13。185 与 13 的 180 原本从不竞争（conflicts [4] / [3]
    // 互斥），降权不影响任何带三音的音集——与 m13 可能同场的 9(#11) / Maj9(#11)（均 185）
    // 也因互斥（m13 拦大三音、它们拦 b7）永不共存。
    baseWeight: 180,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 9, role: 'thirteenth', confidence: 'core' },
    ],
    // 三音可省（见文件头不变量）：与 13 成对——13 早就把大三音写成 optional: anchor，
    // 原先 m13 却把 b3 列为必选，于是 E B D F# A（无三音的 13 和弦）只能出 E13、出不来 Em13。
    optional: [
      { interval: 3, role: 'third_minor', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'optional' },
      { interval: 7, role: 'fifth_perfect', confidence: 'anchor' },
    ],
    conflicts: [4],
  },
  {
    suffix: 'Maj13',
    category: 'extended',
    baseWeight: 180,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 11, role: 'seventh_major', confidence: 'core' },
      { interval: 9, role: 'thirteenth', confidence: 'core' },
    ],
    optional: [
      { interval: 2, role: 'ninth', confidence: 'optional' },
      { interval: 4, role: 'third_major', confidence: 'anchor' },
      { interval: 7, role: 'fifth_perfect', confidence: 'anchor' },
    ],
    conflicts: [3],
  },
  {
    suffix: '13sus4',
    category: 'sus',
    baseWeight: 190,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 5, role: 'sus4', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 9, role: 'thirteenth', confidence: 'core' },
    ],
    optional: [
      { interval: 2, role: 'ninth', confidence: 'optional' },
      { interval: 7, role: 'fifth_perfect', confidence: 'anchor' },
    ],
    conflicts: [3, 4],
  },
  {
    suffix: '7(#9)',
    category: 'altered',
    baseWeight: 150,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 3, role: 'ninth_sharp', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [11],
  },
  {
    suffix: '7(b9)',
    category: 'altered',
    baseWeight: 150,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 1, role: 'ninth_flat', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [11],
  },
  {
    suffix: '7(#5)',
    category: 'altered',
    baseWeight: 140,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 8, role: 'fifth_aug', confidence: 'core' },
    ],
    conflicts: [3, 7, 11],
  },
  {
    suffix: '7(b5)',
    category: 'altered',
    baseWeight: 140,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 6, role: 'fifth_dim', confidence: 'core' },
    ],
    conflicts: [3, 7, 11],
  },
  {
    suffix: 'Maj7(#5)',
    category: 'altered',
    baseWeight: 140,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 11, role: 'seventh_major', confidence: 'core' },
      { interval: 8, role: 'fifth_aug', confidence: 'core' },
    ],
    conflicts: [3, 7, 10],
  },
  {
    suffix: 'Maj7(b5)',
    category: 'altered',
    baseWeight: 140,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 11, role: 'seventh_major', confidence: 'core' },
      { interval: 6, role: 'fifth_dim', confidence: 'core' },
    ],
    conflicts: [3, 7, 10],
  },
  {
    suffix: '7(#11)',
    category: 'altered',
    baseWeight: 170,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 6, role: 'eleventh_sharp', confidence: 'core' },
    ],
    optional: [
      { interval: 7, role: 'fifth_perfect', confidence: 'anchor' },
      { interval: 2, role: 'ninth', confidence: 'optional' },
    ],
    conflicts: [3, 11],
  },
  {
    suffix: 'Maj7(#11)',
    category: 'altered',
    baseWeight: 170,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 11, role: 'seventh_major', confidence: 'core' },
      { interval: 6, role: 'eleventh_sharp', confidence: 'core' },
    ],
    optional: [
      { interval: 7, role: 'fifth_perfect', confidence: 'anchor' },
      { interval: 2, role: 'ninth', confidence: 'optional' },
    ],
    conflicts: [3, 10],
  },
  {
    suffix: '9(#11)',
    category: 'altered',
    baseWeight: 185,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'core' },
      { interval: 6, role: 'eleventh_sharp', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [3, 11],
  },
  {
    suffix: 'Maj9(#11)',
    category: 'altered',
    baseWeight: 185,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 11, role: 'seventh_major', confidence: 'core' },
      { interval: 2, role: 'ninth', confidence: 'core' },
      { interval: 6, role: 'eleventh_sharp', confidence: 'core' },
    ],
    optional: [{ interval: 7, role: 'fifth_perfect', confidence: 'anchor' }],
    conflicts: [3, 10],
  },
  {
    suffix: '13(#11)',
    category: 'altered',
    baseWeight: 195,
    required: [
      { interval: 0, role: 'root', confidence: 'core' },
      { interval: 4, role: 'third_major', confidence: 'core' },
      { interval: 10, role: 'seventh_minor', confidence: 'core' },
      { interval: 9, role: 'thirteenth', confidence: 'core' },
      { interval: 6, role: 'eleventh_sharp', confidence: 'core' },
    ],
    optional: [
      { interval: 2, role: 'ninth', confidence: 'optional' },
      { interval: 7, role: 'fifth_perfect', confidence: 'anchor' },
    ],
    conflicts: [3],
  },
];
