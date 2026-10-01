/**
 * 槽位和弦引用的内容签名：查得到实体取 `computeChordContentSignature`，查不到以 `?<id>` 占位。
 *
 * 「查不到引用时怎么兜底」是缓存失效正确性的一部分（占位口径不一致会把「引用悬空」判成「内容没变」，
 * 屏上回吐旧图），故**全仓只此一处**：消费方 scoreRenderCacheKey（渲染缓存键的槽位段）、
 * scoreLineFingerprints（逐行渲染指纹）、scoreExportCanvas（边和弦的记忆化键）、
 * useLineChordSignatures（行级绑定签名）一律走本函数。
 *
 * 此前这几处各持一份逐字相同的闭包，其中 scoreExportCanvas 那份的兜底还写成了 `'-'` —— 同一个问题的
 * 第二份答案，改一处漏一处就是上面那种静默错图。
 */
import { computeChordContentSignature } from '@/domains/chord/model/chordContentSignature';

import type { Chord } from '@/domains/chord/types';

/** 单个和弦引用的签名；查不到的引用以 `?<id>` 占位（不静默当「没有和弦」） */
export const chordRefSignatureOf = (chordLookup: Map<string, Chord>, chordId: string | null | undefined): string => {
  const chord = chordLookup.get(chordId ?? '');
  return chord ? computeChordContentSignature(chord) : `?${chordId}`;
};
