import { computed } from 'vue';

import { computeChordContentSignature } from '@/domains/chord/model/chordContentSignature';
import { charKey, chordSlotKey } from '@/domains/score/model/scoreModel';

import type { Chord } from '@/domains/chord/types';
import type { ChordLineSlots } from '@/domains/score/types';
import type { ComputedRef } from 'vue';

export interface UseLineChordSignaturesOptions {
  /** 全库和弦查找表（id / 指纹双键）：签名里要取和弦**内容**，光有 id 不够（理由见下面 computed 的说明） */
  chordsLookupMap: ComputedRef<Map<string, Chord>>;
  /** 当前乐谱的槽位绑定表（未选歌时为空） */
  getChordMap: () => ReadonlyMap<string, ChordLineSlots> | undefined;
}

/**
 * 行级和弦绑定签名（v-memo 行级派生量）：lineId → 该行全部槽位绑定 `key=指纹:横按;` 的排序串。
 *
 * v-memo 此前直接依赖 `activeSong.chordMap` 引用——任何一处绑定变更（哪怕别的行）都会换新
 * Map，让**所有**已渲染行的 memo 全部失效、逐行重跑 getCharChord。改为行级签名后：
 * - 绑定变更时本 computed O(绑定数) 重建一次；
 * - 每行 memo 只比较自己的签名字符串（引用相等即命中），未受影响行全部缓存命中。
 * 行内 getCharChord 仍实时读取 chordMap（渲染期取值），满足「删依赖会显示陈旧和弦」的约束——
 * 签名保证「本行任一绑定变化 ⇒ 该行 memo 失效 ⇒ 重渲染时读到新值」。
 *
 * **签名必须含和弦内容（指纹 + 横按），不能只有 id。** chordMap 存的是 id，而「改和弦库里的和弦
 * 内容」（改名 / 改指法 / 改横按）既不会让 chordMap 换引用，也不会让字符槽那侧的 `lineData.chars`
 * 换引用（chars 只按行文本缓存，与和弦无关；行首 / 行尾边和弦走的是另一条**已含内容**的缓存，
 * 见 scoreExportCanvas 的 prevEdgeChordsCache 签名）。只写 id 时，绑在字符槽上的和弦被编辑后
 * 全部 v-memo 依赖都原样命中 ⇒ 该行不重渲染 ⇒ 槽位上的和弦名停在旧内容上。
 * 口径与渲染侧对齐：本签名、scoreExportCanvas 的签名、scoreLineFingerprints 一律走
 * `computeChordContentSignature`（指纹 + 横按）。
 */
export function useLineChordSignatures({ chordsLookupMap, getChordMap }: UseLineChordSignaturesOptions) {
  const lineChordSignatures = computed(() => {
    const map = getChordMap();
    const sigs = new Map<string, string>();
    if (!map) return sigs;
    /** 单个和弦引用的签名；查不到时以 `?<id>` 占位（与渲染侧同一兜底口径，不静默当「没有和弦」） */
    const chordSignature = (chordId: string): string => {
      const chord = chordsLookupMap.value.get(chordId);
      return chord ? computeChordContentSignature(chord) : `?${chordId}`;
    };
    const perLine = new Map<string, string[]>();
    const pushToken = (lineId: string, token: string) => {
      const list = perLine.get(lineId);
      if (list) list.push(token);
      else perLine.set(lineId, [token]);
    };
    for (const [lineId, slots] of map) {
      // v7 嵌套结构：chordMap 为 Map<LineId, ChordLineSlots>，char 是 Map<index, chordId>，
      // start/end 是 chordId[]。原实现误把 lineId 当 slotKey 解构，parseSlotKey 恒 null，
      // 导致签名永远为空、v-memo 永不失效、绑定改动不刷新（P0 审计 #3）。
      for (const [index, chordId] of slots.char) {
        if (!chordId) continue;
        pushToken(lineId, `${charKey(lineId, index)}=${chordSignature(chordId)};`);
      }
      slots.start.forEach((chordId, index) => {
        if (chordId) pushToken(lineId, `${chordSlotKey(lineId, 'start', index)}=${chordSignature(chordId)};`);
      });
      slots.end.forEach((chordId, index) => {
        if (chordId) pushToken(lineId, `${chordSlotKey(lineId, 'end', index)}=${chordSignature(chordId)};`);
      });
    }
    for (const [lineId, entries] of perLine) sigs.set(lineId, entries.sort().join(''));

    return sigs;
  });

  /**
   * 本行有没有绑上和弦（决定行内会不会渲染指板图卡）。直接复用上面的行级签名：签名只在有绑定时
   * 才写入 token，故「签名非空」等价于「本行至少有一个绑定」，不必再按 chordMap 走一遍。
   * 消费方是离屏行占位高度的分档（见 .line-row 的 is-chord-row）。
   */
  const lineHasChord = (lineId: string): boolean => (lineChordSignatures.value.get(lineId)?.length ?? 0) > 0;

  return { lineChordSignatures, lineHasChord };
}
