/**
 * 槽位和弦引用的内容签名：查得到实体取 `computeChordContentSignature`，查不到以 `?<id>` 占位。
 *
 * scoreRenderCacheKey（渲染缓存键的槽位段）与 scoreLineFingerprints（逐行渲染指纹）此前各持一份
 * 逐字相同的 4 行闭包 —— 「查不到引用时怎么兜底」是缓存失效正确性的一部分（占位口径不一致会把
 * 「引用悬空」判成「内容没变」，屏上回吐旧图），必须单处维护，见 scoreRenderCacheKey 文件头。
 */
import { computeChordContentSignature } from '@/domains/chord/model/chordContentSignature';

import type { Chord } from '@/domains/chord/types';

/** 单个和弦引用的签名；查不到的引用以 `?<id>` 占位（不静默当「没有和弦」） */
export const chordRefSignatureOf = (chordLookup: Map<string, Chord>, chordId: string | null | undefined): string => {
  const chord = chordLookup.get(chordId ?? '');
  return chord ? computeChordContentSignature(chord) : `?${chordId}`;
};
