// @vitest-environment jsdom
import { nextTick } from 'vue';

import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it, vi } from 'vitest';

import { chordRepository } from '@/domains/chord/model/chordRepository';
import { useChordStore } from '@/domains/chord/store/chordStore';

/**
 * 单测用例各建一份 pinia，退出落盘注册表（模块级 Set）却跨用例共享 —— 本文件只放这一条用例，
 * 保证注册表里始终只有本用例那一个 store，断言才不会被上一条用例遗留的回调污染。
 */
describe('chordStore 退出落盘回调的注销', () => {
  it('store 作用域销毁后注销退出落盘回调：pagehide 不再触发写库', async () => {
    const saveSpy = vi.spyOn(chordRepository, 'save');
    try {
      setActivePinia(createPinia());
      const chordStore = useChordStore();
      // 必须真水合：写回门禁关着时 persistAll 本就空转，测不出注销与否
      await chordStore.hydrate();

      // 对照：销毁前 pagehide 确实会触发落盘（否则下面的静默可能只是「监听压根没挂上」）
      window.dispatchEvent(new Event('pagehide'));
      await nextTick();
      expect(saveSpy).toHaveBeenCalledTimes(1);

      chordStore.$dispose();
      saveSpy.mockClear();
      window.dispatchEvent(new Event('pagehide'));
      await nextTick();

      expect(saveSpy).not.toHaveBeenCalled();
    } finally {
      saveSpy.mockRestore();
    }
  });
});
