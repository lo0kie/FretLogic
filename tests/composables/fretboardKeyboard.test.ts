import { ref } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import { useFretboardKeyboard } from '@/domains/fretboard/composables/useFretboardKeyboard';

const createKeyboardEvent = (key: string): KeyboardEvent => {
  return {
    key,
    preventDefault: vi.fn(),
    target: null,
  } as unknown as KeyboardEvent;
};

describe('useFretboardKeyboard 多弦乐器动态键盘导航', () => {
  /** 同一条「弦间导航受控于 stringCount」规则，只换弦数 */
  it.each([
    { label: '在 4 弦乐器（如尤克里里）上，ArrowRight 与 End 边界严格受控于第 4 弦（index 3）', stringCount: 4 },
    { label: '在 8 弦乐器上，ArrowRight 与 End 可以正常导航到第 7、8 弦（最高 index 7）', stringCount: 8 },
  ])('$label', ({ stringCount }) => {
    const focusPoint = ref<{ stringIndex: number; fretIndex: number } | null>(null);
    const fretCount = ref(5);
    const onToggleOpenString = vi.fn();
    const onToggleNote = vi.fn();
    const onMuteString = vi.fn();

    const { handleKeydown } = useFretboardKeyboard({
      focusPoint,
      fretCount,
      stringCount: ref(stringCount),
      onToggleOpenString,
      onToggleNote,
      onMuteString,
    });

    const lastIndex = stringCount - 1;

    // 首次按导航键，落入默认点 (0, 0)
    handleKeydown(createKeyboardEvent('ArrowRight'));
    expect(focusPoint.value).toEqual({ stringIndex: 0, fretIndex: 0 });

    // 连续按 ArrowRight 逐弦右移，一路走到末弦
    for (let step = 1; step <= lastIndex; step++) {
      handleKeydown(createKeyboardEvent('ArrowRight'));
      expect(focusPoint.value).toEqual({ stringIndex: step, fretIndex: 0 });
    }

    // 再次按 ArrowRight 不得超过末弦（杜绝超出弦数的幽灵弦）
    handleKeydown(createKeyboardEvent('ArrowRight'));
    expect(focusPoint.value).toEqual({ stringIndex: lastIndex, fretIndex: 0 });

    // 按 End 键直接跳到末弦，品位保持不变
    focusPoint.value = { stringIndex: 0, fretIndex: 2 };
    handleKeydown(createKeyboardEvent('End'));
    expect(focusPoint.value).toEqual({ stringIndex: lastIndex, fretIndex: 2 });

    // 按 Home 键跳回第 1 弦（index 0），品位保持不变
    handleKeydown(createKeyboardEvent('Home'));
    expect(focusPoint.value).toEqual({ stringIndex: 0, fretIndex: 2 });
  });

  it('Enter / Space 与 Delete 操作正确派发', () => {
    const focusPoint = ref<{ stringIndex: number; fretIndex: number } | null>({ stringIndex: 1, fretIndex: 0 });
    const fretCount = ref(5);
    const stringCount = ref(6);
    const onToggleOpenString = vi.fn();
    const onToggleNote = vi.fn();
    const onMuteString = vi.fn();

    const { handleKeydown } = useFretboardKeyboard({
      focusPoint,
      fretCount,
      stringCount,
      onToggleOpenString,
      onToggleNote,
      onMuteString,
    });

    // 0 品按 Enter 派发切换空弦态
    handleKeydown(createKeyboardEvent('Enter'));
    expect(onToggleOpenString).toHaveBeenCalledWith(1);

    // 非 0 品按 Space 派发切换按品音符
    focusPoint.value = { stringIndex: 2, fretIndex: 3 };
    handleKeydown(createKeyboardEvent(' '));
    expect(onToggleNote).toHaveBeenCalledWith(2, 3);

    // 按 Delete 派发静音
    handleKeydown(createKeyboardEvent('Delete'));
    expect(onMuteString).toHaveBeenCalledWith(2);
  });

  it('品位导航在 0..fretCount 之间钳制，不产生负品也不越出品窗', () => {
    const focusPoint = ref<{ stringIndex: number; fretIndex: number } | null>({ stringIndex: 0, fretIndex: 0 });
    const { handleKeydown } = useFretboardKeyboard({
      focusPoint,
      fretCount: ref(4),
      stringCount: ref(6),
      onToggleOpenString: vi.fn(),
      onToggleNote: vi.fn(),
      onMuteString: vi.fn(),
    });

    // 已在 0 品：ArrowUp 不得越到 -1（负品会渲染成幽灵品，也会被当成静音之外的第三种态）
    handleKeydown(createKeyboardEvent('ArrowUp'));
    expect(focusPoint.value).toEqual({ stringIndex: 0, fretIndex: 0 });

    // 已在上界：ArrowDown 不得越出 fretCount
    focusPoint.value = { stringIndex: 0, fretIndex: 4 };
    handleKeydown(createKeyboardEvent('ArrowDown'));
    expect(focusPoint.value).toEqual({ stringIndex: 0, fretIndex: 4 });
  });

  it('焦点已是越界值时，导航按键先把它钳回窗口内再移动', () => {
    // 弦索引可能被外部改到超界值（换弦数 / 恢复草稿等路径）。钳制必须发生在按键动作**之前**：
    // 否则 99 会一路带着走（99 - 1 仍是越界值），焦点永远回不到合法区域。
    // 品位方向不用这条测：各导航键自己就带 Math.min/max 边界（见上一条）。
    const focusPoint = ref<{ stringIndex: number; fretIndex: number } | null>({ stringIndex: 99, fretIndex: 2 });
    const { handleKeydown } = useFretboardKeyboard({
      focusPoint,
      fretCount: ref(4),
      stringCount: ref(6),
      onToggleOpenString: vi.fn(),
      onToggleNote: vi.fn(),
      onMuteString: vi.fn(),
    });

    handleKeydown(createKeyboardEvent('ArrowLeft'));
    // 先钳到末弦（index 5）再左移一格 ⇒ 4；不先钳制的话会得到 98
    expect(focusPoint.value).toEqual({ stringIndex: 4, fretIndex: 2 });
  });

  it('焦点在输入框内时键盘导航整体让路：不改焦点、也不吞掉按键', () => {
    // 搜索框 / 歌名输入框里按方向键必须留给输入框自己（移动光标），否则在输入时指板焦点会被一起带走
    const focusPoint = ref<{ stringIndex: number; fretIndex: number } | null>({ stringIndex: 1, fretIndex: 2 });
    const onToggleNote = vi.fn();
    const { handleKeydown } = useFretboardKeyboard({
      focusPoint,
      fretCount: ref(4),
      stringCount: ref(6),
      onToggleOpenString: vi.fn(),
      onToggleNote,
      onMuteString: vi.fn(),
    });

    const preventDefault = vi.fn();
    const event = {
      key: 'ArrowRight',
      preventDefault,
      target: { tagName: 'INPUT' } as unknown as HTMLElement,
    } as unknown as KeyboardEvent;
    handleKeydown(event);

    expect(focusPoint.value).toEqual({ stringIndex: 1, fretIndex: 2 });
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
