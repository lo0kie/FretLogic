import { describe, expect, it } from 'vitest';

import {
  captureScrollOffsets,
  mirrorScrollOffsets,
  restoreScrollOffsets,
} from '@/platform/composables/useSortableList/scrollOffsets';

/**
 * 子树滚动偏移保全的回归测试。
 *
 * 钉的是「Sortable 搬 DOM ⇒ 子树里被滚动的元素偏移静默归零、且不发 `scroll` 事件」这条链路上
 * 我们自己那一段：**收哪些、回填哪些、不碰哪些**。
 *
 * 断言对象是「偏移的值」，不是任何 DOM 细节：jsdom 无布局，但把 `scrollLeft` / `scrollTop`
 * 当普通可读写属性存着（赋值与回读一致），正好够表达「搬动前 300 → 搬动后 0 → 回填回 300」。
 */

/** 造一个已发生过滚动的子元素：把值写进去即算滚过 */
const scrolledChild = (parent: HTMLElement, left = 0, top = 0): HTMLElement => {
  const el = document.createElement('div');
  el.scrollLeft = left;
  el.scrollTop = top;
  parent.append(el);
  return el;
};

/** 造一个已挂进文档的容器 + 一张卡片，返回卡片供继续挂内容 */
const makeContainer = (): { container: HTMLElement; card: HTMLElement } => {
  const container = document.createElement('div');
  const card = document.createElement('div');
  container.append(card);
  // 必须真的挂进文档：回填会跳过脱离文档的元素（见 restoreScrollOffsets），
  // 只 createElement 的话整份快照都会被跳过，用例就变成空跑
  document.body.append(container);
  return { container, card };
};

describe('captureScrollOffsets', () => {
  it('只收子树里偏移非 0 的元素，不含容器自身', () => {
    const { container, card } = makeContainer();
    container.scrollLeft = 500; // 容器自身滚了：被搬动的是它的子元素，它自己不受影响，不该被收
    const strip = scrolledChild(card, 300);
    scrolledChild(card, 0, 0); // 没滚过
    const vertical = scrolledChild(card, 0, 80); // 只滚了纵向，同样要收

    const snapshots = captureScrollOffsets(container);
    expect(snapshots.map(snapshot => snapshot.el)).toEqual([strip, vertical]);
    expect(snapshots.map(snapshot => [snapshot.left, snapshot.top])).toEqual([
      [300, 0],
      [0, 80],
    ]);
  });

  it('容器不存在时给出空快照', () => {
    expect(captureScrollOffsets(null)).toEqual([]);
  });
});

describe('restoreScrollOffsets', () => {
  it('搬动把偏移清零后，按元素引用写回原值', () => {
    const { container, card } = makeContainer();
    const strip = scrolledChild(card, 300);
    const snapshots = captureScrollOffsets(container);

    strip.scrollLeft = 0; // 模拟 insertBefore 搬卡片：子树失去 box，偏移归零
    restoreScrollOffsets(snapshots);

    expect(strip.scrollLeft).toBe(300);
  });

  it('当前值非 0 时不覆盖：拖拽期间用户自己滚过的位置不会被抢回', () => {
    const { container, card } = makeContainer();
    const strip = scrolledChild(card, 300);
    const snapshots = captureScrollOffsets(container);

    strip.scrollLeft = 480; // 拖拽期间用户把它滚到了别处
    restoreScrollOffsets(snapshots);

    expect(strip.scrollLeft).toBe(480);
  });

  it('跳过已脱离文档的元素', () => {
    const { container, card } = makeContainer();
    const strip = scrolledChild(card, 300);
    const snapshots = captureScrollOffsets(container);

    card.remove(); // 拖拽期间列表被重渲染，快照里的节点已不在文档里
    strip.scrollLeft = 0;
    restoreScrollOffsets(snapshots);

    expect(strip.scrollLeft).toBe(0); // 没有 box 的元素写了也不生效，索性不写
  });
});

describe('mirrorScrollOffsets', () => {
  it('按文档序把源子树的偏移配对到结构相同的副本上', () => {
    const { card } = makeContainer();
    scrolledChild(card, 300); // 横向
    scrolledChild(card, 0, 120); // 纵向：两个不同的值才能看出配对有没有错位

    const clone = card.cloneNode(true) as HTMLElement;
    const offsets = mirrorScrollOffsets(card, clone);
    document.body.append(clone); // 副本挂进文档之后才写得进去
    restoreScrollOffsets(offsets);

    const cloned = clone.querySelectorAll<HTMLElement>('*');
    expect([cloned[0]?.scrollLeft, cloned[1]?.scrollTop]).toEqual([300, 120]);
  });

  it('两侧元素数量不等时不给配对', () => {
    const { card } = makeContainer();
    scrolledChild(card, 300);
    const clone = card.cloneNode(true) as HTMLElement;
    clone.append(document.createElement('span')); // 结构已不同源（如副本里摘掉了波纹容器）

    expect(mirrorScrollOffsets(card, clone)).toEqual([]);
  });
});
