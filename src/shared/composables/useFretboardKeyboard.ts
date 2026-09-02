import type { ComputedRef, Ref } from 'vue';

/** 指板键盘可达性所需的外部依赖：交互开关、焦点位置、音域边界与三个编辑动作 */
export interface FretboardKeyboardDeps {
  /** 是否处于可编辑的交互态：非交互态下忽略全部按键 */
  interactive: Ref<boolean> | ComputedRef<boolean>;
  /** 当前键盘焦点所在的弦与品位，键盘导航直接改写它 */
  focusPoint: Ref<{ stringIndex: number; fretIndex: number } | null>;
  /** 是否显示空弦区：决定最小品位与默认焦点落点 */
  showOpenStrings: Ref<boolean> | ComputedRef<boolean>;
  /** 指板总品位数：品位移动的上界 */
  fretCount: Ref<number> | ComputedRef<number>;
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
  const { interactive, focusPoint, showOpenStrings, fretCount } = deps;

  /** 焦点默认落点：显示空弦区时落在空弦（品位 0），否则落在首品 */
  const defaultFocus = () => ({
    stringIndex: 0,
    fretIndex: showOpenStrings.value ? 0 : 1,
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
    if (!interactive.value) return;

    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    const minFret = showOpenStrings.value ? 0 : 1;
    const maxFret = fretCount.value;

    // 尚无焦点时，导航键先把焦点落到默认位置
    if (!focusPoint.value && NAV_KEYS.includes(e.key)) {
      e.preventDefault();
      focusPoint.value = defaultFocus();
      return;
    }

    const current = focusPoint.value ?? defaultFocus();

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
        focusPoint.value = { stringIndex: Math.min(5, current.stringIndex + 1), fretIndex: current.fretIndex };
      },
      'Home': () => {
        focusPoint.value = { stringIndex: 0, fretIndex: current.fretIndex };
      },
      'End': () => {
        focusPoint.value = { stringIndex: 5, fretIndex: current.fretIndex };
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
