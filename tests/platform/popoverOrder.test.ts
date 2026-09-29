/**
 * 浮层层叠顺序登记表 + popover 测试桩的不变量。
 *
 * 背景（2026-09-29 迁移）：非模态浮层的层叠来源由「自管 z-index」改为浏览器 top-layer，
 * 层号池（原 platform/ui/popover/floatingZ.ts）随之删除。浏览器不暴露「读取 top-layer 顺序」的 API，
 * 而 top-layer 的排列规则恰好是「进入的先后」，于是顺序必须自记 —— 本用例钉的就是那份登记表。
 *
 * 与之同批落地的是 tests/setup.ts 里的 popover 桩：jsdom 不实现这套 API，浮层用例（含本文件）
 * 全部建立在它之上，故桩本身的行为也在这里钉住 —— 桩坏掉时应当在这里报红，而不是在几十个
 * 组件用例里以「:popover-open 永远为假」的形式静默失真。
 */
import { effectScope, shallowRef } from 'vue';

import { describe, expect, it } from 'vitest';

import { globalFloatingReferenceMap, openedPopovers, usePopoverOrder } from '@/platform/ui/popover/usePopoverOrder';

import type { VirtualElement } from '@floating-ui/dom';

/**
 * 造一个「宿主元素 + 锚点」的浮层实例，并返回可手动释放的 API。
 * 用 effectScope 包住 watch 的注册（composable 本身不注册 onScopeDispose，卸载清理由消费方调 dispose）。
 */
const makeLayer = (referenceEl: HTMLElement | null = null) => {
  const scope = effectScope();
  const el = document.createElement('div');
  const floatingEl = shallowRef<HTMLElement | null>(el);
  const reference = shallowRef<HTMLElement | VirtualElement | null>(referenceEl);
  const api = scope.run(() => usePopoverOrder({ floatingEl, reference }));
  if (!api) throw new Error('effectScope.run 未返回 composable 结果');

  const release = () => {
    api.dispose();
    scope.stop();
  };
  return { api, el, floatingEl, reference, release };
};

describe('浮层层叠顺序登记表', () => {
  it('最上层取登记表中最后一个打开条目（后进 top-layer 者在上）', () => {
    const a = makeLayer();
    const b = makeLayer();

    a.api.acquireOrder();
    expect(a.api.isTopmostOpenLayer(), '唯一打开者即最上层').toBe(true);

    b.api.acquireOrder();
    expect(b.api.isTopmostOpenLayer()).toBe(true);
    expect(a.api.isTopmostOpenLayer(), '后登记者压住先登记者').toBe(false);

    a.release();
    b.release();
  });

  it('摘掉最上层后，先登记者重新成为最上层', () => {
    const a = makeLayer();
    const b = makeLayer();
    a.api.acquireOrder();
    b.api.acquireOrder();

    b.api.releaseOrder();
    expect(a.api.isTopmostOpenLayer()).toBe(true);
    expect(openedPopovers.has(b.api.ownLayerEntry), '摘登记必须同时出表').toBe(false);

    a.release();
    b.release();
  });

  it('重复登记会把条目重新排到表尾（Set.add 不改变插入位置）', () => {
    // 复现真实路径：离场动画未结束就被重新打开，@after-leave 不触发、登记尚未摘除，
    // 此时若直接 add，条目会停在旧次序上，「后开者在上」静默失效。
    const a = makeLayer();
    const b = makeLayer();
    a.api.acquireOrder();
    b.api.acquireOrder();
    expect(a.api.isTopmostOpenLayer()).toBe(false);

    a.api.acquireOrder();
    expect(a.api.isTopmostOpenLayer()).toBe(true);
    expect(b.api.isTopmostOpenLayer()).toBe(false);

    a.release();
    b.release();
  });

  it('dispose 摘除打开态登记，不留幽灵条目', () => {
    // 幽灵条目（open:true 却已关闭）会让后续浮层的「我是不是最上层」恒判假，Esc 逐个失效。
    const a = makeLayer();
    const b = makeLayer();
    a.api.acquireOrder();
    b.api.acquireOrder();

    b.api.dispose();
    expect(openedPopovers.has(b.api.ownLayerEntry)).toBe(false);
    expect(b.api.isOrderOwned()).toBe(false);
    expect(a.api.isTopmostOpenLayer()).toBe(true);

    a.release();
    b.release();
  });

  it('锚点引用映射按宿主登记（子浮层链归属判定沿它逐级上溯）', () => {
    const trigger = document.createElement('button');
    const layer = makeLayer(trigger);

    expect(layer.api.ownLayerEntry.el).toBe(layer.el);
    expect(globalFloatingReferenceMap.get(layer.el), '真实触发元素应登记进映射').toBe(trigger);

    layer.release();
  });

  it('虚拟锚点不写入引用映射（它没有对应的触发元素）', () => {
    const virtual = { getBoundingClientRect: () => new DOMRect(0, 0, 0, 0) } as VirtualElement;
    const layer = makeLayer(null);
    layer.reference.value = virtual;
    expect(layer.api.ownLayerEntry.el).toBe(layer.el);
    expect(globalFloatingReferenceMap.get(layer.el)).toBeUndefined();

    layer.release();
  });
});

describe('popover 测试桩（jsdom 缺这套 API，全部浮层用例的前提）', () => {
  /** 造一个已连接、带 popover 属性的元素 */
  const makePopoverEl = (value = 'manual') => {
    const el = document.createElement('div');
    el.setAttribute('popover', value);
    document.body.appendChild(el);
    return el;
  };

  /** 断言某次调用抛 InvalidStateError（桩与规范一致：未连接 / 不是 popover 时抛） */
  const expectInvalidState = (fn: () => void) => {
    let caught: unknown = null;
    try {
      fn();
    } catch (error) {
      caught = error;
    }
    expect(caught, '应抛 InvalidStateError').toBeInstanceOf(DOMException);
    expect((caught as DOMException).name).toBe('InvalidStateError');
  };

  it('showPopover / hidePopover 反映到 :popover-open，重复调用是空操作', () => {
    const el = makePopoverEl();

    expect(el.matches(':popover-open')).toBe(false);
    el.showPopover();
    expect(el.matches(':popover-open')).toBe(true);
    el.showPopover();
    expect(el.matches(':popover-open'), '已在打开态时重复 show 不改变状态').toBe(true);
    el.hidePopover();
    expect(el.matches(':popover-open')).toBe(false);
    el.hidePopover();
    expect(el.matches(':popover-open'), '已在关闭态时重复 hide 不改变状态').toBe(false);

    el.remove();
  });

  it('未连接或不带 popover 属性时 showPopover 抛 InvalidStateError', () => {
    // 产品侧靠 platform/ui/popover/topLayer 的幂等包装挡掉这条路径（宿主已被 v-if 摘掉时
    // showPopover 抛在渲染回调里会打断整条调用栈），故这里钉住「桩确实会抛」这个前提。
    const detached = document.createElement('div');
    detached.setAttribute('popover', 'manual');
    expectInvalidState(() => detached.showPopover());

    const attached = document.createElement('div');
    document.body.appendChild(attached);
    expectInvalidState(() => attached.showPopover());
    attached.remove();
  });

  it('togglePopover(force) 按 force 定向，beforetoggle 被取消则不改变状态', () => {
    const el = makePopoverEl();
    const states: string[] = [];
    el.addEventListener('toggle', (e: Event) => states.push(String((e as Event & { newState?: string }).newState)));

    expect(el.togglePopover(true)).toBe(true);
    expect(el.matches(':popover-open')).toBe(true);
    expect(el.togglePopover(false)).toBe(false);
    expect(el.matches(':popover-open')).toBe(false);
    expect(states, '每次真实状态变化都应派发 toggle').toEqual(['open', 'closed']);

    el.addEventListener('beforetoggle', (e: Event) => e.preventDefault(), { once: true });
    el.showPopover();
    expect(el.matches(':popover-open'), 'beforetoggle 被取消时不得进层').toBe(false);

    el.remove();
  });
});
