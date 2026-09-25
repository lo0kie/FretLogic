// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { resolveOverlayParent } from '@/platform/directives/vScrollbar/scrollbarOverlay';

/**
 * overlay 挂载点的解析（v-scrollbar 的 overlayParent）。
 *
 * 覆盖三种写法与两条回落口径 —— 这里锁的是「挂到哪」这一个决定，与滚动逻辑无关，
 * 但它错了的表现同样是静默的：滚动条画在别的元素里（几何按那个容器换算），或者干脆不挂。
 */
const buildTree = () => {
  const outer = document.createElement('div');
  outer.className = 'outer';
  const middle = document.createElement('div');
  middle.className = 'middle';
  const host = document.createElement('div');
  host.className = 'host';
  outer.appendChild(middle);
  middle.appendChild(host);
  document.body.appendChild(outer);
  return { outer, middle, host };
};

describe('v-scrollbar overlay 挂载点解析', () => {
  it('不给 overlayParent 时回落到宿主父元素', () => {
    const { middle, host } = buildTree();
    expect(resolveOverlayParent(host, {})).toBe(middle);
    // 显式传 null 与省略等价（模板里 `overlayParent: null` 是常见的条件写法）
    expect(resolveOverlayParent(host, { overlayParent: null })).toBe(middle);
  });

  it('元素与函数写法：函数返回空时同样回落父元素', () => {
    const { outer, middle, host } = buildTree();
    expect(resolveOverlayParent(host, { overlayParent: outer })).toBe(outer);
    expect(resolveOverlayParent(host, { overlayParent: () => outer })).toBe(outer);
    // 模板 ref 挂载时未就绪的典型形态：此刻必须退化成默认形态而不是不挂
    expect(resolveOverlayParent(host, { overlayParent: () => null })).toBe(middle);
    expect(resolveOverlayParent(host, { overlayParent: () => undefined })).toBe(middle);
  });

  // .middle 行已删：它的返回值与「回落父元素」同形，断不出选择器分支是否真的命中
  it('选择器写法：委托给命中的最近祖先', () => {
    const { outer, host } = buildTree();
    expect(resolveOverlayParent(host, { overlayParent: '.outer' })).toBe(outer);
  });

  it('选择器命中不到时回落父元素', () => {
    const { middle, host } = buildTree();
    expect(resolveOverlayParent(host, { overlayParent: '.does-not-exist' })).toBe(middle);
  });

  it('宿主自身命中选择器时不返回自身：滚动条不能挂进滚动容器内部', () => {
    // closest() 含自身。若从宿主起解析，把传给宿主的 class 写进选择器就会让 overlay 落进滚动容器 ——
    // absolute 子元素锚在 padding box 上，宿主一滚它就跟着内容走（拇指当场失效），
    // 还会混进宿主的直接子元素被尺寸观察逐个登记。故起点取父元素：自身命中不算数，退化成默认形态。
    const { middle, host } = buildTree();
    expect(resolveOverlayParent(host, { overlayParent: '.host' })).toBe(middle);
  });
});
