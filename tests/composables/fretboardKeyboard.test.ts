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
  it('在 4 弦乐器（如尤克里里）上，ArrowRight 与 End 边界严格受控于第 4 弦（index 3）', () => {
    const focusPoint = ref<{ stringIndex: number; fretIndex: number } | null>(null);
    const fretCount = ref(5);
    const stringCount = ref(4);
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

    // 首次按导航键，落入默认点 (0, 0)
    handleKeydown(createKeyboardEvent('ArrowRight'));
    expect(focusPoint.value).toEqual({ stringIndex: 0, fretIndex: 0 });

    // 连续按 ArrowRight 向右移弦
    handleKeydown(createKeyboardEvent('ArrowRight'));
    expect(focusPoint.value).toEqual({ stringIndex: 1, fretIndex: 0 });
    handleKeydown(createKeyboardEvent('ArrowRight'));
    expect(focusPoint.value).toEqual({ stringIndex: 2, fretIndex: 0 });
    handleKeydown(createKeyboardEvent('ArrowRight'));
    expect(focusPoint.value).toEqual({ stringIndex: 3, fretIndex: 0 });

    // 再次按 ArrowRight 不得超过 index 3（杜绝幽灵弦 4 和 5）
    handleKeydown(createKeyboardEvent('ArrowRight'));
    expect(focusPoint.value).toEqual({ stringIndex: 3, fretIndex: 0 });

    // 按 End 键直接跳到最后一弦（index 3）
    focusPoint.value = { stringIndex: 0, fretIndex: 2 };
    handleKeydown(createKeyboardEvent('End'));
    expect(focusPoint.value).toEqual({ stringIndex: 3, fretIndex: 2 });
  });

  it('在 8 弦乐器上，ArrowRight 与 End 可以正常导航到第 7、8 弦（最高 index 7）', () => {
    const focusPoint = ref<{ stringIndex: number; fretIndex: number } | null>({ stringIndex: 5, fretIndex: 1 });
    const fretCount = ref(5);
    const stringCount = ref(8);
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

    // 从第 6 弦（index 5）向右移动到第 7 弦（index 6）与第 8 弦（index 7）
    handleKeydown(createKeyboardEvent('ArrowRight'));
    expect(focusPoint.value).toEqual({ stringIndex: 6, fretIndex: 1 });
    handleKeydown(createKeyboardEvent('ArrowRight'));
    expect(focusPoint.value).toEqual({ stringIndex: 7, fretIndex: 1 });

    // 8 弦上限，不能再增加
    handleKeydown(createKeyboardEvent('ArrowRight'));
    expect(focusPoint.value).toEqual({ stringIndex: 7, fretIndex: 1 });

    // 按 Home 跳回第 1 弦（index 0），按 End 跳到第 8 弦（index 7）
    handleKeydown(createKeyboardEvent('Home'));
    expect(focusPoint.value).toEqual({ stringIndex: 0, fretIndex: 1 });
    handleKeydown(createKeyboardEvent('End'));
    expect(focusPoint.value).toEqual({ stringIndex: 7, fretIndex: 1 });
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
});
