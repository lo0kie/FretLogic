/**
 * 和弦身份判定：**指纹**（重复和弦判定）与**归一化名称键**（同名变体归并）。
 *
 * 为什么单独成模块：这两件事是同一个问题的一体两面 —— 「两条和弦记录是不是同一个东西」。
 * 指纹按「名称 + 品位偏移 + 品位数 + 调弦 + 转位 + 根音标记 + 逐弦品位与升降偏好」判等，
 * 名称键则只按「去空格小写的和弦名」判等（同名多指法归并用的粗判据）。此前两者分居两处、
 * 文件名与职责都不相符：
 *   - 指纹住在 `bassConsistency.ts`（一个讲「斜杠低音一致性」的模块）；
 *   - 名称键住在 `store/chordGrouping.ts`（一个讲「分组卡片视图模型」的 store 层模块）。
 * 于是「改指纹口径时要动哪个文件」只能靠 grep 找。现在同一处定义、同一处导出。
 *
 * 两个缓存都随函数一起搬来，且都是「按对象引用 + 廉价输入签名核对」的形态：
 * 详见各自下方注释 —— 这条约定不是性能优化，是**正确性**要求（草稿对象会被就地改写）。
 */
import { getChordName } from './chordName';
import { computeIsInverted } from './chordSearch';

import type { ChordOrName } from './chordName';
import type { Tuning } from './tuning';
import type { ChordNameSegments } from '@/domains/chord/types';
import type { GuitarStringsModel } from '@/domains/fretboard/types';

/**
 * 指纹缓存：键为对象引用，值额外存一份**廉价输入签名**。
 *
 * 为什么不能只按引用缓存：指纹按对象引用记忆时，任何「就地改写同一个和弦对象」的调用方
 * 都会读到被钉死的旧指纹。草稿正是这种对象——useChordDraftEditing（strings[i] / fretOffset /
 * nameSegments / rootStringIndex）、ChordAnalysisPanel（rootStringIndex / nameSegments）与
 * editorStore.setBarres 全部原地改同一个 draftChord；而 WorkbenchVariantsPanel 的
 * isActiveVariant 会在渲染期提前求值、把旧指纹钉住，随后 useWorkbenchRouteSync 的 isDraftDirty
 * 读到陈旧值 ⇒ 脏草稿被判成干净，URL 回灌直接覆盖未保存编辑。
 * 故读缓存前先用同一批输入重算一次签名核对：签名只覆盖「便宜可取」的那部分输入，
 * 真正昂贵的 computeIsInverted 仍然走缓存。
 */
interface ChordFingerprintCacheEntry {
  sig: string;
  fp: string;
}

const chordFingerprintCache = new WeakMap<object, ChordFingerprintCacheEntry>();

/**
 * 计算和弦指纹（名称:品位偏移:品位数:调弦:是否转位:根音标记:逐弦品位+升降偏好），
 * 用于重复和弦判定；结果按对象引用 WeakMap 缓存，读前用输入签名核对是否已被就地改写
 * （见 chordFingerprintCache 的说明）。
 */
export const computeChordFingerprint = (chord: {
  chordName?: string;
  nameSegments?: ChordNameSegments | null;
  fretOffset?: number;
  fretCount: number;
  tuning: Tuning | string;
  strings: GuitarStringsModel;
  rootStringIndex: number | null;
}): string => {
  const offset = chord.fretOffset ?? 0;
  const name = getChordName(chord).trim();
  const strSig = chord.strings.map(s => `${s.fret}_${s.preferFlat ? 1 : 0}`).join('|');
  // 签名覆盖 computeIsInverted 的全部入参（strings 逐弦 + fretOffset + tuning + 名称 +
  // rootStringIndex），故签名一致即可安全复用上次算出的 isInverted。
  // 它**就是 `fp` 去掉「是否转位」那一段**（该位由其余输入唯一决定，见 computeIsInverted），
  // 两串因此必须同步改：日后往指纹里加字段，这里也要加，否则缓存会拿旧指纹当新的返回。
  const sig = `${name}:${offset}:${chord.fretCount}:${chord.tuning}:${String(chord.rootStringIndex)}:${strSig}`;

  const cached = chordFingerprintCache.get(chord);
  if (cached !== undefined && cached.sig === sig) return cached.fp;

  const isInverted = computeIsInverted(chord.strings, offset, chord.tuning, chord, chord.rootStringIndex);
  const fp = `${name}:${offset}:${chord.fretCount}:${chord.tuning}:${isInverted ? 1 : 0}:${String(chord.rootStringIndex)}:${strSig}`;
  chordFingerprintCache.set(chord, { sig, fp });

  return fp;
};

/** 归一化名称键缓存：键只由和弦自身内容决定，按对象引用缓存即可。
 *  前提与 theory.ts 的 sortMetaCache / chordAliasCache 相同——和弦库的保存路径总是产出新对象，
 *  且撤销恢复的孤儿收容已改为不可变更新。
 *  **注意**：该前提对「编辑器草稿」不成立（草稿是加载时 cloneDeep 出的一份副本，之后每次编辑都在
 *  原地改它），故草稿不能走本缓存——computeChordFingerprint 就曾因同样的假设读到被钉死的旧指纹，
 *  现已改为读前校验输入签名（见上面的 chordFingerprintCache）。此处调用方目前只传
 *  已保存实体与名称字符串，暂不受影响；若日后要传草稿，须同样加校验。
 *  收益点：buildMultiFingeringData 与 buildGroupedChordCards 会对同一批和弦各算一次 nameKeyOf
 *  （千级库 = 3000+ 次 getChordName 拼接 + trim + toLowerCase），缓存后第二次起直接命中。 */
const nameKeyCache = new WeakMap<object, string>();

/** 计算和弦的归一化名称键（去空格、转小写），用于同名变体的分组匹配。 */
export function nameKeyOf(chordOrName: string | ChordOrName): string {
  if (typeof chordOrName === 'string') return chordOrName.trim().toLowerCase();
  const cached = nameKeyCache.get(chordOrName);
  if (cached !== undefined) return cached;
  const key = getChordName(chordOrName).trim().toLowerCase();
  nameKeyCache.set(chordOrName, key);
  return key;
}
