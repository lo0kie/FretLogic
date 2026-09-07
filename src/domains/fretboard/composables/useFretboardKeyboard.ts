import { toValue } from 'vue';

import type { MaybeRefOrGetter, Ref } from 'vue';

/** 指板键盘可达性所需的外部依赖：焦点位置、音域边界与三个编辑动作 */
export interface FretboardKeyboardDeps {
  /** 当前键盘焦点所在的弦与品位，键盘导航直接改写它 */
  focusPoint: Ref<{ stringIndex: number; fretIndex: number } | null>;
  /** 指板总品位数：品位移动的上界 */
  fretCount: MaybeRefOrGetter<number>;
  /** 指板总弦数：弦移动的上界（默认 6） */
  stringCount?: MaybeRefOrGetter<number>;
  /** 切换某弦的空弦态（按品位 → 空弦 → 静音 的循环） */
  onToggleOpenString: (stringIndex: number) => void;
  /** 切换某弦某品位的音符：已有则清除，无则按下 */
  onToggleNote: (stringIndex: number, fretIndex: number) => void;
  /** 清除某弦音符（置为静音） */
  onMuteString: (stringIndex: number) => void;
}

/** 仅移动焦点的按键集合：尚无焦点时按下这些键会先给出默认焦点 */
const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];

/** 指板键盘可达性：方向键/Home/End/PageUp/PageDown 移动焦点，Enter/Space 切换音符，Delete/Backspace 静音 */
export function useFretboardKeyboard(deps: FretboardKeyboardDeps) {
  const { focusPoint, fretCount, stringCount } = deps;

  /** 焦点默认落点：落在空弦（品位 0） */
  const defaultFocus = () => ({
    stringIndex: 0,
    fretIndex: 0,
  });

  /** Enter/Space：在焦点品位切换音符；焦点位于空弦区时改为切换空弦态 */
  const handleEnterOrSpace = () => {
    const pt = focusPoint.value;
    if (!pt) return;
    if (pt.fretIndex === 0) {
      deps.onToggleOpenString(pt.stringIndex);
    } else {
      deps.onToggleNote(pt.stringIndex, pt.fretIndex);
    }
  };

  /** Delete/Backspace：清除焦点弦上的音符 */
  const handleDeleteOrBackspace = () => {
    const pt = focusPoint.value;
    if (!pt) return;
    deps.onMuteString(pt.stringIndex);
  };

  const handleKeydown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    const minFret = 0;
    const maxFret = toValue(fretCount);
    const maxString = Math.max(0, (toValue(stringCount) ?? 6) - 1);

    // 尚无焦点时，导航键先把焦点落到默认位置
    if (!focusPoint.value && NAV_KEYS.includes(e.key)) {
      e.preventDefault();
      focusPoint.value = defaultFocus();
      return;
    }

    const current = focusPoint.value
      ? {
          stringIndex: Math.min(maxString, Math.max(0, focusPoint.value.stringIndex)),
          fretIndex: Math.min(maxFret, Math.max(minFret, focusPoint.value.fretIndex)),
        }
      : defaultFocus();

    /** 各按键动作：导航键改写焦点，编辑键派发到外部注入的编辑动作 */
    const keyActions: Record<string, () => void> = {
      'ArrowUp': () => {
        focusPoint.value = { stringIndex: current.stringIndex, fretIndex: Math.max(minFret, current.fretIndex - 1) };
      },
      'ArrowDown': () => {
        focusPoint.value = { stringIndex: current.stringIndex, fretIndex: Math.min(maxFret, current.fretIndex + 1) };
      },
      'ArrowLeft': () => {
        focusPoint.value = { stringIndex: Math.max(0, current.stringIndex - 1), fretIndex: current.fretIndex };
      },
      'ArrowRight': () => {
        focusPoint.value = { stringIndex: Math.min(maxString, current.stringIndex + 1), fretIndex: current.fretIndex };
      },
      'Home': () => {
        focusPoint.value = { stringIndex: 0, fretIndex: current.fretIndex };
      },
      'End': () => {
        focusPoint.value = { stringIndex: maxString, fretIndex: current.fretIndex };
      },
      'PageUp': () => {
        focusPoint.value = { stringIndex: current.stringIndex, fretIndex: minFret };
      },
      'PageDown': () => {
        focusPoint.value = { stringIndex: current.stringIndex, fretIndex: maxFret };
      },
      'Enter': handleEnterOrSpace,
      ' ': handleEnterOrSpace,
      'Delete': handleDeleteOrBackspace,
      'Backspace': handleDeleteOrBackspace,
    };

    const action = keyActions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  return { handleKeydown };
}
