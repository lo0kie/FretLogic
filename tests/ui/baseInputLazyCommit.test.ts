import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import BaseInput from '@/platform/ui/input/BaseInput.vue';
import BaseTextarea from '@/platform/ui/input/BaseTextarea.vue';

/**
 * `v-model.lazy` 的提交点契约：输入期间只更新**本地值**（不写 model），change（失焦 / 回车）时才写回。
 *
 * 这条契约此前是坏的：两个文本控件的提交点都只调 `commitLocal`，而它内部是「非 lazy 才写 model」——
 * 于是 lazy 模式下 model **永不写回**（唯一能写的是清空按钮那条显式路径），
 * 与两处注释「change（失焦/回车）：lazy 模式下的提交点，把最终输入写回 model」正相反。
 * 三处 `v-model.lazy` 恰好都挂在 BaseSlider 上（它另有显式的 lazy 写回），故缺陷一直没被撞到。
 */
const mountLazyInput = (initial: string) => {
  const updates: string[] = [];
  const wrapper = mount(BaseInput, {
    props: {
      'modelValue': initial,
      'modelModifiers': { lazy: true },
      'onUpdate:modelValue': (v: string) => void updates.push(v),
    },
  });
  return { wrapper, updates };
};

describe('BaseInput 的 v-model.lazy 提交点', () => {
  it('输入期间不写 model，change 时才写回', async () => {
    const { wrapper, updates } = mountLazyInput('a');
    const input = wrapper.get('input');

    // 打字只发 input：不能用 setValue —— 它会连 change 一起发（VTU 源码里写明是为 v-model.lazy 补的），
    // 而 change 正是本用例要单独验的提交点，两段混在一起就分不出「谁写回了 model」
    (input.element as HTMLInputElement).value = 'abc';
    await input.trigger('input');
    expect(updates).toEqual([]);

    await input.trigger('change');
    expect(updates).toEqual(['abc']);
  });

  it('非 lazy 时每次输入都写回（对照组）', async () => {
    const updates: string[] = [];
    const wrapper = mount(BaseInput, {
      props: { 'modelValue': 'a', 'onUpdate:modelValue': (v: string) => void updates.push(v) },
    });

    await wrapper.get('input').setValue('ab');
    expect(updates).toEqual(['ab']);
  });

  it('BaseTextarea 同款契约（同一个缺陷的孪生）', async () => {
    const updates: string[] = [];
    const wrapper = mount(BaseTextarea, {
      props: {
        'modelValue': 'a',
        'modelModifiers': { lazy: true },
        'onUpdate:modelValue': (v: string) => void updates.push(v),
      },
    });
    const textarea = wrapper.get('textarea');

    (textarea.element as HTMLTextAreaElement).value = 'abc';
    await textarea.trigger('input');
    expect(updates).toEqual([]);

    await textarea.trigger('change');
    expect(updates).toEqual(['abc']);
  });
});
