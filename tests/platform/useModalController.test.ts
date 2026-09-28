/**
 * useModalController 的「开窗即回落出厂数据」契约。
 *
 * modalData 是所有弹窗共用的单份响应式对象：open 只覆盖传入字段时，上一个弹窗写入的旧值会
 * 泄漏进下一个弹窗（`open('create')` 连一个字段都不传，是最容易踩的形态）。这里锁住三条不变量：
 * 标量字段回落、嵌套对象回落（浅回落会把污染带回升——出厂数据与 modalData 曾共享引用）、
 * patch 覆盖优先于回落。
 */
import { describe, expect, it } from 'vitest';

import { useModalController } from '@/platform/store/useModalController';

describe('useModalController', () => {
  it('open 时回落到出厂数据：上一个弹窗写入的字段不得泄漏进下一个弹窗', () => {
    const { modalData, open, close } = useModalController(
      { rename: false, create: false },
      { activeGroup: { id: 'g0', name: '出厂分组' } as { id: string; name: string }, inputValue: '' }
    );

    open('rename', { activeGroup: { id: 'g1', name: '旧名字' }, inputValue: '旧名字' });
    expect(modalData.inputValue).toBe('旧名字');
    close('rename');

    // 不传 patch 的 open 也必须拿到干净数据（修复前 activeGroup / inputValue 会整份残留）
    open('create');
    expect(modalData.inputValue).toBe('');
    expect(modalData.activeGroup).toEqual({ id: 'g0', name: '出厂分组' });
  });

  it('嵌套对象的改写同样被回落：回落必须来自深拷贝，而非共享引用', () => {
    const { modalData, open } = useModalController({ a: false }, { nested: { deep: '初值' } });

    open('a');
    // 绕开 patch 的原地改写：若 pristine 与 modalData 共享嵌套引用，污染会带进回落源
    modalData.nested.deep = '被污染';
    open('a', { nested: { deep: '新值' } });
    expect(modalData.nested.deep).toBe('新值');

    open('a');
    expect(modalData.nested.deep).toBe('初值');
  });
});
