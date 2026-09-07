import { defineComponent, nextTick, ref } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import BasePopover from '@/platform/ui/popover/BasePopover.vue';

import type { Ref } from 'vue';

// @vitest-environment jsdom

/**
 * 嵌套浮层层级规则：
 * - 后打开者在上（子浮层 > 父面板）
 * - 父面板 bring-to-front（鼠标移回面板置顶）时，不得反超面板内打开中的子浮层
 */
describe('BasePopover 嵌套层级', () => {
  const getHosts = () => Array.from(document.querySelectorAll<HTMLElement>('.popover-floating-host'));

  let parentOpen!: Ref<boolean>;
  let childOpen!: Ref<boolean>;

  const mountNested = () => {
    const wrapper = mount(
      defineComponent({
        components: { BasePopover },
        setup() {
          parentOpen = ref(false);
          childOpen = ref(false);
          return { parentOpen, childOpen };
        },
        template: `
          <div>
            <BasePopover v-model="parentOpen" trigger="hover" aria-label="parent">
              <template #trigger>
                <button data-test="parent-trigger">PT</button>
              </template>
              <div data-test="parent-panel">
                <BasePopover v-model="childOpen" trigger="click" aria-label="child">
                  <template #trigger>
                    <button data-test="child-trigger">CT</button>
                  </template>
                  <div data-test="child-panel">child</div>
                </BasePopover>
              </div>
            </BasePopover>
          </div>
        `,
      }),
      { attachTo: document.body }
    );
    return { wrapper };
  };

  it('子浮层打开后高于父面板；父面板置顶时不反超子浮层', async () => {
    vi.useRealTimers();
    mountNested();
    await nextTick();

    parentOpen.value = true;
    await nextTick();
    await new Promise(r => setTimeout(r, 30));
    await nextTick();
    expect(getHosts().length).toBe(1);

    childOpen.value = true;
    await nextTick();
    await new Promise(r => setTimeout(r, 30));
    await nextTick();

    const hosts = getHosts();
    expect(hosts.length).toBe(2);
    const parentZ = Number(hosts[0].style.zIndex);
    const childZ = Number(hosts[1].style.zIndex);
    expect(childZ).toBeGreaterThan(parentZ);

    // 鼠标移回父面板 → handlePanelMouseEnter → bring-to-front：父面板层号必须仍低于子浮层
    hosts[0].querySelector<HTMLElement>('.popover-panel')!.dispatchEvent(new MouseEvent('mouseenter'));
    await nextTick();
    await new Promise(r => setTimeout(r, 10));

    const parentZAfter = Number(getHosts()[0].style.zIndex);
    const childZAfter = Number(getHosts()[1].style.zIndex);
    expect(parentZAfter).toBeLessThan(childZAfter);

    document.querySelectorAll('.popover-floating-host').forEach(h => h.remove());
    document.body.innerHTML = '';
  });
});
