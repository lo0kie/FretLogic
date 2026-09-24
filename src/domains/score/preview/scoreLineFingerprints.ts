/**
 * 逐行渲染输入指纹：与 scoreRenderCacheKey 的键维度**同源同口径**，但把「歌词整串 + 全部槽位
 * 和弦指纹」这两块整曲级信息拆到行粒度上。用途单一 —— 供「编辑歌词后按页最小重建」判定
 * 哪些行的内容变了、进而哪几页必须重画（见 ScorePreviewPane 的继承分支与 scorePreviewCache.movePages）。
 *
 * 【为什么必须与渲染输入同口径】指纹相同的行会被判为「没变」，其所在页直接复用上一版的页图。
 * 漏掉任何一个影响该行绘制的字段（行文本、行内和弦的乐理指纹、横按标记），产出的就是**静默错图**
 * —— 屏上是上一版的旧内容，而键已经换了，没有任何机制会再纠正它。故这里逐字段对齐
 * services/workerExportService 的 ExportLineItem 构造：行文本取 `lyrics.split('\n')[idx]`，
 * 槽位经 `resolveLineIdAt` 取 lineId，和弦一律折算成 `computeChordFingerprint + computeBarresSignature`
 * （与键里的 refSignatures 同一对函数，连查不到引用时的 `?<id>` 占位都一致）。
 *
 * 【为什么不用 hash】指纹要参与「相等即复用」的判定，碰撞等于错图；而单首几百行 × 几十字符的
 * 纯文本量级远小于页图（同一条目里不足 1%），不值得为省这点内存引入碰撞面。
 */
import { computeChordFingerprint } from '@/domains/chord/theory/theory';
import { computeBarresSignature } from '@/domains/fretboard/model/coordinates';
import { lineSlots, resolveLineIdAt } from '@/domains/score/model/scoreModel';

import type { Chord } from '@/domains/chord/types';
import type { Song } from '@/domains/score/types';

/**
 * 各原始歌词行的渲染输入指纹（下标＝行序号，与 WorkerExportPayload 的 lines[].lineIdx
 * 及缓存条目的 pageLineRanges 同口径）。
 *
 * `song` 为空（未选中乐谱）时返回空数组；歌词为空串时返回 `['']` —— 与渲染侧
 * `lyrics.split('\n')` 的行为一致（空串也是一行），调用方不必为此特判。
 *
 * 单行指纹＝行文本 ｜ 行首和弦 ｜ 逐字符槽位（按字符下标升序）｜ 行尾和弦，四段以不可见字符分隔：
 * 分隔符必须与内容不可能相同，否则「把某个和弦挪到相邻槽位」这类改写会被拼成同一个字符串。
 */
export const buildScoreLineFingerprints = (song: Song | null, chordLookup: Map<string, Chord>): string[] => {
  if (!song) return [];

  /** 单个和弦引用的签名；查不到的引用以 `?<id>` 占位（与键里的兜底同口径，不静默当「没有和弦」） */
  const chordSignature = (chordId: string | null | undefined): string => {
    const chord = chordLookup.get(chordId ?? '');
    return chord ? `${computeChordFingerprint(chord)}:${computeBarresSignature(chord.barres)}` : `?${chordId}`;
  };

  return song.lyrics.split('\n').map((text, index) => {
    const slots = lineSlots(song.chordMap, resolveLineIdAt(song.lineIds, index));
    const charSignature = [...slots.char.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([charIndex, chordId]) => `${charIndex}=${chordSignature(chordId)}`)
      .join(',');
    return [
      text,
      slots.start.map(chordSignature).join(','),
      charSignature,
      slots.end.map(chordSignature).join(','),
    ].join('\u0002');
  });
};
