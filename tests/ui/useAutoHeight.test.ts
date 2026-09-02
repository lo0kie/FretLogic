import { nextTick, ref } from 'vue';

import { describe, expect, it } from 'vitest';

import { useAutoHeight } from '@/shared/composables/useAutoHeight';

describe('useAutoHeight composable', () => {
  it('正确实测高度并写入 px 字符串', async () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetHeight', { value: 320, configurable: true });
    Object.defineProperty(el, 'scrollHeight', { value: 320, configurable: true });

    const contentRef = ref<HTMLElement | null>(el);
    const expanded = ref(true);

    const { height, sync } = useAutoHeight(contentRef, expanded);
    sync();

    expect(height.value).toBe('320px');
  });

  it('收起时高度置为 0px，重新展开时能正确恢复实测高度', async () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetHeight', { value: 320, configurable: true });
    Object.defineProperty(el, 'scrollHeight', { value: 320, configurable: true });

    const contentRef = ref<HTMLElement | null>(el);
    const expanded = ref(true);

    const { height, sync } = useAutoHeight(contentRef, expanded);
    sync();
    expect(height.value).toBe('320px');

    // 收起
    expanded.value = false;
    await nextTick();
    expect(height.value).toBe('0px');

    // 重新展开（即使高度数值与收起前一致，也应正确恢复为 320px）
    expanded.value = true;
    await nextTick();
    expect(height.value).toBe('320px');
  });

  it('内容高度变化大于阈值时平滑更新高度', async () => {
    const el = document.createElement('div');
    Object.defineProperty(el, 'offsetHeight', { value: 200, configurable: true });
    Object.defineProperty(el, 'scrollHeight', { value: 200, configurable: true });

    const contentRef = ref<HTMLElement | null>(el);
    const expanded = ref(true);

    const { height, sync } = useAutoHeight(contentRef, expanded);
    sync();
    expect(height.value).toBe('200px');

    // 内容增加
    Object.defineProperty(el, 'offsetHeight', { value: 450, configurable: true });
    Object.defineProperty(el, 'scrollHeight', { value: 450, configurable: true });
    sync();

    expect(height.value).toBe('450px');
  });
});
