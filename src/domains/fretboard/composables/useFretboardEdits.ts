/**
 * 指板弦数据的编辑出口：对 strings / rootStringIndex 的每一次写入都经这里，宿主只负责「何时触发」。
 *
 * 从 `useFretboardInteraction` 里切出来的判据是**职责而不是行数**：这一段是唯一会改写模型的地方，
 * 而它上面挂着一组容易被改坏的乐理默认（品位决定初始升降号、根音单点标记、一弦一音）。
 * 单独成文件之后，「谁改了模型」一眼可数。
 */
import {
  calcPitchIndex,
  canTogglePitchAccidental,
  getActiveBaseStrings,
  getDefaultPreferFlatForPitch,
  isOpen,
} from '@/domains/chord/theory/theory';
import { MUTED_FRET } from '@/domains/fretboard/constants';
import { cloneGuitarStrings } from '@/platform/utils/common';

import type { FretboardProps } from '@/domains/fretboard/components/Fretboard.vue';
import type { GuitarStringEntity, GuitarStringsModel } from '@/domains/fretboard/types';

export interface FretboardEditsApi {
  /** 统一的弦数据更新出口 */
  emitStringsUpdate: (
    mutator: (cloned: GuitarStringsModel) => void,
    resolveRoot?: (currentRoot: number | null, cloned: GuitarStringsModel) => number | null
  ) => void;
  /** 切换某弦是否为根音（单点标记） */
  emitToggleRootString: (sIdx: number) => void;
  /** 设置某弦品位（并按乐理默认复位升降号） */
  setStringFret: (str: GuitarStringEntity, fret: number, sIdx: number) => void;
  /** 设为可用音符并标记为主音 */
  setAvailableAndRoot: (sIdx: number, fret: number) => void;
  /** 循环切换某弦状态：按品位 → 空弦 → 静音 */
  toggleOpenString: (sIdx: number) => void;
  /** 切换某弦某品位的音符（指针点击与键盘 Enter 共用） */
  toggleNoteAt: (sIdx: number, fret: number) => void;
  /** 清除某弦音符（置为静音），键盘 Delete/Backspace 使用 */
  muteString: (sIdx: number) => void;
  /** 切换某弦的升降号偏好（如 C#/Db），仅在该位置允许变体时生效 */
  togglePitchAccidental: (sIdx: number) => void;
}

export const useFretboardEdits = (
  props: FretboardProps,
  onStringsChange: (strings: GuitarStringsModel) => void,
  onRootStringChange?: (index: number | null) => void
): FretboardEditsApi => {
  /** 统一的弦数据更新出口：克隆当前模型交给 mutator 修改后上报，并可选地由 resolveRoot 重算根音弦 */
  const emitStringsUpdate: FretboardEditsApi['emitStringsUpdate'] = (mutator, resolveRoot) => {
    const cloned = cloneGuitarStrings(props.chord.strings);
    mutator(cloned);
    onStringsChange(cloned);
    if (resolveRoot && onRootStringChange) {
      const nextRoot = resolveRoot(props.chord.rootStringIndex, cloned);
      if (nextRoot !== props.chord.rootStringIndex) onRootStringChange(nextRoot);
    }
  };

  /** 切换某弦是否为根音（单点标记：只保留该弦，或清空为 null） */
  const emitToggleRootString = (sIdx: number) => {
    if (!onRootStringChange) return;
    const next = props.chord.rootStringIndex === sIdx ? null : sIdx;
    if (next !== props.chord.rootStringIndex) onRootStringChange(next);
  };

  /** 设置某弦品位，并按乐理默认赋予初始升降号状态（如 10 为 Bb, 3 为 Eb）。
   *  清除/移动音符时一并复位为新品位的乐理默认。 */
  const setStringFret = (str: GuitarStringEntity, fret: number, sIdx: number) => {
    str.fret = fret;
    if (fret >= 0) {
      const pitch = calcPitchIndex(sIdx, fret, props.chord.fretOffset, getActiveBaseStrings(props.chord.tuning));
      str.preferFlat = getDefaultPreferFlatForPitch(pitch);
    } else str.preferFlat = false;
  };

  /** 右击空白处/禁用空弦：直接设为可用(对应品位或空弦)并设为主音 */
  const setAvailableAndRoot = (sIdx: number, fret: number) =>
    void emitStringsUpdate(
      cloned => {
        const str = cloned[sIdx];
        if (str) setStringFret(str, fret, sIdx);
      },
      () => sIdx
    );

  /** 循环切换某弦状态：按品位 → 空弦 → 静音 */
  const toggleOpenString = (sIdx: number) =>
    void emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (!str) return;
      if (str.fret > 0) setStringFret(str, 0, sIdx);
      else if (isOpen(str)) setStringFret(str, -1, sIdx);
      else setStringFret(str, 0, sIdx);
    });

  /** 切换某弦某品位的音符：该品位已有音符则清除为静音，否则按下到该品位 */
  const toggleNoteAt = (sIdx: number, fret: number) =>
    void emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (!str) return;
      if (str.fret === fret) setStringFret(str, MUTED_FRET, sIdx);
      else setStringFret(str, fret, sIdx);
    });

  /** 清除某弦音符（置为静音） */
  const muteString = (sIdx: number) =>
    void emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (str) setStringFret(str, -1, sIdx);
    });

  /** 切换某弦的升降号偏好：仅在该位置允许变体时生效 */
  const togglePitchAccidental = (sIdx: number) =>
    void emitStringsUpdate(cloned => {
      const str = cloned[sIdx];
      if (
        str &&
        canTogglePitchAccidental(sIdx, str.fret, props.chord.fretOffset, getActiveBaseStrings(props.chord.tuning))
      )
        str.preferFlat = !str.preferFlat;
    });

  return {
    emitStringsUpdate,
    emitToggleRootString,
    setStringFret,
    setAvailableAndRoot,
    toggleOpenString,
    toggleNoteAt,
    muteString,
    togglePitchAccidental,
  };
};
