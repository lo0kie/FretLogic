/**
 * 和弦内容签名 —— **指纹 : 横按签名**，两种口径共用一处实现。
 *
 * 【为什么必须收成一处】`computeChordFingerprint` 只覆盖和弦名、调弦与逐弦品位，**不含横按**；
 * `computeBarresSignature` 又只管横按。于是「和弦内容是否相同」这件事在每个消费点都要把两者
 * 并拼一次，此前散在八处各写一遍，任何一处漏掉横按就退化成**静默丢数据**：
 * 渲染侧表现为「改了横按仍命中旧图 / 旧行」，数据侧表现为「同指法不同横按被判成重复而丢一条」。
 * 收成一处后，「参与判等的字段」只在这里定义一次。
 *
 * 【为什么落在 chord/model 而不是 score】它是**和弦内容**的派生量，与乐谱排版无关。
 * 消费方目前分居两侧（score 域问「画出来变了吗」，chord 域问「是不是同一条」），
 * 放在和弦域可让两边都复用而不必触碰 `chord ↛ score` 这条隔离线。
 *
 * 【两种口径，差别只在横按的 finger】与 `computeBarresSignature` 的两档一一对应，不可互换：
 * - **渲染口径**（{@link computeChordContentSignature}，不含 finger）：横按的**标指**变化不改变
 *   图形，纳入只会让预览 / 导出缓存无谓失效。消费方：scoreRenderCacheKey、scoreLineFingerprints、
 *   scoreExportCanvas、useLineChordSignatures。
 * - **判等 / 去重口径**（{@link computeChordContentKey}，含 finger）：「同指法但横按标指不同」
 *   是两条不同的和弦，必须判不等，否则导入 / 保存 / 读库去重会静默丢一条（N3 / D26 / N4）。
 *   消费方：chordLibraryImport、useChordTransfer、chordDraftValidation、useWorkbenchRouteSync、
 *   chordMergeOps、chordRepository。
 *
 * 选错口径的代价不对称：判等处用渲染口径会丢数据，渲染处用判等口径只是多几次无谓重渲 ——
 * 拿不准时按消费方所属域选（数据侧取 key，画面侧取 signature）。
 */
import { computeChordFingerprint } from '@/domains/chord/theory/theory';
import { computeBarresSignature } from '@/domains/fretboard/model/coordinates';

import type { ChordDraft } from '@/domains/chord/types';

/**
 * 两种口径共用的拼接实现。
 *
 * 入参收 `ChordDraft` 而非 `Chord`：本模块的消费方既有已落库实体也有未落库草稿，
 * 两者只差时间戳，而时间戳与「和弦内容」无关（`Chord` 天然满足 `ChordDraft`）。
 */
const contentSignatureOf = (chord: ChordDraft, withFinger: boolean): string =>
  `${computeChordFingerprint(chord)}:${computeBarresSignature(chord.barres, { withFinger })}`;

/**
 * **渲染口径**的内容签名（`指纹:横按`，不含 finger）：供「画进图里的东西变了吗」的判等使用。
 *
 * 只处理**拿到的**和弦；「引用查不到」的兜底（各消费方是 `?<id>` 还是 `-`）由调用方负责 ——
 * 那是各自键结构的占位约定，不属于和弦内容。
 */
export const computeChordContentSignature = (chord: ChordDraft): string => contentSignatureOf(chord, false);

/**
 * **判等 / 去重口径**的内容键（`指纹:横按`，含 finger）：两条和弦的记录键相同即视为同一条。
 *
 * 组内还带别的维度（如 groupId）时，把它拼在本键之前即可（见 chordRepository.dedupeChordsByFingerprint）。
 */
export const computeChordContentKey = (chord: ChordDraft): string => contentSignatureOf(chord, true);

/**
 * 两条和弦记录的内容是否完全相同（判等 / 去重口径，见 {@link computeChordContentKey}）。
 *
 * 与 `areBarresEqual` 是同一套分层：键的实现一处、判等只是键相等。需要在一批候选里反复比对时
 * 请自行预计算键，不要在循环里调本函数 —— 那会把同一侧的键重算 N 遍。
 */
export const areChordContentsEqual = (a: ChordDraft, b: ChordDraft): boolean =>
  computeChordContentKey(a) === computeChordContentKey(b);
