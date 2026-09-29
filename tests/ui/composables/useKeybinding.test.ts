/**
 * useKeybinding 的组合键契约测试。
 *
 * 断言的是**项目自己的语义**，不是 tinykeys 的行为 —— 组合键的解析与匹配已交给 tinykeys，
 * 而下列判定原本由本模块自带的解析/匹配代码承担，替换后必须一字不变：
 * - `Mod` 是平台无关修饰键（macOS 认 Meta、其余认 Control），与 tinykeys 的 `$mod` 对齐；
 * - 未列出的修饰键在匹配时要求不存在（Ctrl+Shift+Z 不得命中 Mod+z）；
 * - `ignoreEditable` 只放行**文本类**可编辑目标：checkbox/radio/button 这类非文本 input 不算编辑区
 *   （点过侧栏开关后 Ctrl+Z 仍须生效），tinykeys 的默认 ignore 恰恰会把它们一并放过；
 * - `enabled` 为假时不响应；组件卸载后监听必须摘掉。
 *
 * 上述任一条在替换中悄悄变了，表现都是「某个快捷键突然不灵了」，没有别的信号，故在此钉住。
 *
 * ⚠️ 派发的合成事件必须带 `code`：tinykeys 的 isKeyboardEvent 要求 key / code / getModifierState
 * 三者齐备（防的是自动补全派发的非键盘 Event）。真实浏览器恒带 code，jsdom 构造时须显式给。
 */
import { defineComponent } from 'vue';

import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useKeybinding } from '@/platform/composables/useKeybinding';

/** 平台修饰键：'Mod' 在 macOS 上落 Meta、其余落 Control（与 tinykeys 的 $mod 同一判据） */
const MOD: 'ctrlKey' | 'metaKey' = /Mac|iPod|iPhone|iPad/.test(navigator.platform) ? 'metaKey' : 'ctrlKey';

interface Modifiers {
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/** 本平台的 Mod 按下形态 / 另一个平台的修饰键（用来验证「不认另一个平台的 Mod」） */
const modPressed: Modifiers = MOD === 'ctrlKey' ? { ctrlKey: true } : { metaKey: true };
const otherPlatformModPressed: Modifiers = MOD === 'ctrlKey' ? { metaKey: true } : { ctrlKey: true };

/** 单字符键 → KeyboardEvent.code（'z' → 'KeyZ'），tinykeys 的事件判定要求 code 非空 */
const codeOf = (key: string): string => (key.length === 1 && /[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : key);

/** 从指定目标派发一次 keydown（bubbles 才能冒到 window 上那条监听） */
const pressFrom = (target: EventTarget, key: string, modifiers: Modifiers = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key,
    code: codeOf(key),
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  target.dispatchEvent(event);
  return event;
};

const press = (key: string, modifiers: Modifiers = {}): KeyboardEvent => pressFrom(window, key, modifiers);

/** 在最小组件里注册一次绑定（onMounted 之后监听才生效） */
const mountBinding = (
  keybinding: string | string[],
  handler: (e: KeyboardEvent) => void,
  options?: { preventDefault?: boolean; ignoreEditable?: boolean; enabled?: () => boolean }
) =>
  mount(
    defineComponent({
      setup() {
        useKeybinding(keybinding, handler, options);
        return () => null;
      },
    })
  );

/** 本文件自建的 DOM 目标（可编辑性判定用） */
const scratch: HTMLElement[] = [];
const createInput = (type: string): HTMLInputElement => {
  const input = document.createElement('input');
  input.type = type;
  document.body.append(input);
  scratch.push(input);
  return input;
};

afterEach(() => {
  for (const el of scratch.splice(0)) el.remove();
});

describe('useKeybinding - 组合键匹配', () => {
  it('Mod 只认本平台的修饰键：另一平台的 Mod 不命中', () => {
    const handler = vi.fn();
    const wrapper = mountBinding('Mod+z', handler);

    press('z', modPressed);
    expect(handler).toHaveBeenCalledTimes(1);

    press('z', otherPlatformModPressed);
    expect(handler).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('未列出的修饰键要求不存在：多按 Shift 后 Mod+z 不再命中', () => {
    const handler = vi.fn();
    const wrapper = mountBinding('Mod+z', handler);

    press('z', { ...modPressed, shiftKey: true });
    expect(handler).not.toHaveBeenCalled();

    press('z', modPressed);
    expect(handler).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('一组组合键共用同一个处理器，且命中后默认行为被拦截', () => {
    const handler = vi.fn();
    const wrapper = mountBinding(['Mod+Shift+z', 'Mod+y'], handler);

    const redo = press('z', { ...modPressed, shiftKey: true });
    const alt = press('y', modPressed);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(redo.defaultPrevented).toBe(true);
    expect(alt.defaultPrevented).toBe(true);

    wrapper.unmount();
  });

  it('preventDefault: false 时放行浏览器默认行为', () => {
    const handler = vi.fn();
    const wrapper = mountBinding('Mod+z', handler, { preventDefault: false });

    const event = press('z', modPressed);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);

    wrapper.unmount();
  });
});

describe('useKeybinding - 可编辑目标与门控', () => {
  it('ignoreEditable 只放行文本类可编辑目标：文本输入框不响应，复选框照常响应', () => {
    const handler = vi.fn();
    const wrapper = mountBinding('Mod+z', handler);

    pressFrom(createInput('text'), 'z', modPressed);
    expect(handler).not.toHaveBeenCalled();

    // 非文本类 input 不是编辑区：点过侧栏开关等控件后快捷键仍须生效
    pressFrom(createInput('checkbox'), 'z', modPressed);
    expect(handler).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('enabled 为假时不响应，转真后立即生效', () => {
    const handler = vi.fn();
    let enabled = false;
    const wrapper = mountBinding('Mod+z', handler, { enabled: () => enabled });

    press('z', modPressed);
    expect(handler).not.toHaveBeenCalled();

    enabled = true;
    press('z', modPressed);
    expect(handler).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('卸载后摘掉监听：卸载后再按键不再响应', () => {
    const handler = vi.fn();
    const wrapper = mountBinding('Mod+z', handler);

    press('z', modPressed);
    expect(handler).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    press('z', modPressed);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('未知修饰符在注册期抛错（tinykeys 对认不得的修饰符只会永不匹配，写错即静默失效）', () => {
    expect(() => mountBinding('Foo+z', vi.fn())).toThrow(/未知修饰符/);
  });
});
