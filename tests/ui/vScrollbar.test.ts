/* eslint-disable vue/one-component-per-file -- 指令测试需为每个用例声明独立的宿主组件 */
import { defineComponent } from 'vue';

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';

import { computeThumbGeometry, END_INSET, vScrollbar } from '@/platform/directives/vScrollbar';

describe('computeThumbGeometry（拇指几何）', () => {
  it('内容不足一屏：拇指尺寸为 0（隐藏）', () => {
    expect(computeThumbGeometry(500, 800, 0, 24)).toEqual({ thumbSize: 0, thumbOffset: 0 });
  });

  it('正常比例：拇指长度按可见占比收缩，位置按滚动进度映射', () => {
    // scroll 1000 / client 500 → 拇指 250（比例 0.5），滚到 250（一半）→ 偏移 125
    const { thumbSize, thumbOffset } = computeThumbGeometry(1000, 500, 250, 24);
    expect(thumbSize).toBe(250);
    expect(thumbOffset).toBe(125);
  });

  it('极长内容：拇指被最小尺寸钳制，位置按钳制后的轨道映射', () => {
    // scroll 100000 / client 500 → 自然拇指 2.5px，钳制为 24
    const geo = computeThumbGeometry(100000, 500, 50000, 24);
    expect(geo.thumbSize).toBe(24);
    // 滚动进度 50%，最大偏移 = 500 - 24 = 476 → 476/2 = 238，Math.round 进位为 239
    expect(geo.thumbOffset).toBe(239);
  });

  it('行程与可滚动量不一致时按 scrollable 映射：滚到底拇指占满行程', () => {
    // 行程 496（client 500 两端内缩 2），真实可滚动量 500（scroll 1000 - client 500）
    const geo = computeThumbGeometry(1000, 496, 500, 24, 500);
    expect(geo.thumbSize).toBe(246);
    // 滚到底：偏移必须等于行程上限 496 - 246 = 250（不得残留行程缺口）
    expect(geo.thumbOffset).toBe(250);
  });

  it('clientLength 为 0 时返回隐藏（防除零）', () => {
    expect(computeThumbGeometry(1000, 0, 0, 24)).toEqual({ thumbSize: 0, thumbOffset: 0 });
  });
});

const mountHost = (options: Record<string, unknown> = {}, _model?: unknown, modifiers = '') => {
  const optionsJson = JSON.stringify(options);
  const modAttr = modifiers ? `.${modifiers.split(' ').join('.')}` : '';
  const TestComponent = defineComponent({
    directives: { scrollbar: vScrollbar },
    template: `
      <div style="height:100px;overflow-y:auto;position:relative;" v-scrollbar${modAttr}='${optionsJson}'>
        <div style="height:1000px;">content</div>
      </div>
    `,
  });
  return mount(TestComponent, { attachTo: document.body });
};

describe('vScrollbar 指令', () => {
  it('挂载后隐藏原生滚动条并创建双轴拇指（无修饰符默认 x+y，各轴按溢出显隐）', () => {
    const w = mountHost();
    expect(w.find('.v-scrollbar-host').exists()).toBe(true);
    // 无修饰符 / 无 direction → 同时创建横、纵两枚拇指与轨道
    expect(document.querySelectorAll('.v-scrollbar-thumb')).toHaveLength(2);
    expect(document.querySelectorAll('.v-scrollbar-track')).toHaveLength(2);
    // 宿主仅有纵向溢出（无横向溢出）→ 纵向拇指可见并钉在可视区，横向拇指结构性隐藏（off）
    const yThumb = document.querySelector('.v-scrollbar-thumb--y') as HTMLElement;
    const xThumb = document.querySelector('.v-scrollbar-thumb--x') as HTMLElement;
    expect(yThumb).not.toBeNull();
    // 期望值从 END_INSET 常量推导，避免写死像素导致调参即碎
    expect(yThumb.getAttribute('style')).toContain(`top: ${END_INSET}px`);
    expect(xThumb.classList.contains('v-scrollbar-thumb--off')).toBe(true);
    w.unmount();
  });

  it('direction=x：只创建横向拇指（--x），不创建纵向拇指', () => {
    const w = mountHost({ direction: 'x' });
    const thumbs = document.querySelectorAll('.v-scrollbar-thumb--x');
    expect(thumbs.length).toBe(1);
    w.unmount();
  });

  it('direction=y（显式指定）：只创建纵向拇指', () => {
    const w = mountHost({ direction: 'y' });
    // overlay 挂在宿主父元素（组件根之外），需查 document
    expect(document.querySelectorAll('.v-scrollbar-thumb')).toHaveLength(1);
    expect(document.querySelector('.v-scrollbar-thumb--x')).toBeNull();
    w.unmount();
  });

  it('no-track 修饰符：只创建拇指、不创建轨道（拇指-only 模式）', () => {
    const w = mountHost({}, undefined, 'y no-track');
    expect(document.querySelectorAll('.v-scrollbar-thumb')).toHaveLength(1);
    expect(document.querySelectorAll('.v-scrollbar-track')).toHaveLength(0);
    w.unmount();
  });

  it('showTrack=false 选项与 .no-track 修饰符等价', () => {
    const w = mountHost({ direction: 'y', showTrack: false });
    expect(document.querySelectorAll('.v-scrollbar-thumb')).toHaveLength(1);
    expect(document.querySelectorAll('.v-scrollbar-track')).toHaveLength(0);
    w.unmount();
  });

  it('endInset 选项：按指定像素内缩首尾留白，避免大圆角容器端部被裁切', () => {
    const w = mountHost({ direction: 'y', endInset: 8 });
    const yThumb = document.querySelector('.v-scrollbar-thumb--y') as HTMLElement;
    expect(yThumb).not.toBeNull();
    expect(yThumb.getAttribute('style')).toContain('top: 8px');
    w.unmount();
  });

  it('horizontal 修饰符：单枚水平拇指', () => {
    const TestComponent = defineComponent({
      directives: { scrollbar: vScrollbar },
      template: `
        <div style="height:100px;width:200px;overflow-x:auto;position:relative;" v-scrollbar.horizontal>
          <div style="width:1000px;height:50px;">content</div>
        </div>
      `,
    });
    const w = mount(TestComponent, { attachTo: document.body });
    const thumb = document.querySelector('.v-scrollbar-thumb') as HTMLElement | null;
    expect(thumb).not.toBeNull();
    expect(thumb!.className).toContain('v-scrollbar-thumb--x');
    // jsdom 无布局几何，长度轴（width）由内容滚动尺寸驱动（此处为 0 属预期）
    expect(thumb!.getAttribute('style')).toContain('width: 0px');
    w.unmount();
  });

  it('vertical + horizontal 修饰符同写：双轴同时启用（两枚拇指）', () => {
    const TestComponent = defineComponent({
      directives: { scrollbar: vScrollbar },
      template: `
        <div style="height:100px;width:200px;overflow:auto;position:relative;" v-scrollbar.vertical.horizontal>
          <div style="width:1000px;height:1000px;">content</div>
        </div>
      `,
    });
    const w = mount(TestComponent, { attachTo: document.body });
    expect(document.querySelectorAll('.v-scrollbar-thumb')).toHaveLength(2);
    expect(document.querySelector('.v-scrollbar-thumb--x')).not.toBeNull();
    expect(document.querySelector('.v-scrollbar-thumb--y')).not.toBeNull();
    w.unmount();
  });

  it('无可滚动区域时轨道与拇指一起隐藏', () => {
    const TestComponent = defineComponent({
      directives: { scrollbar: vScrollbar },
      template: `
        <div style="height:100px;overflow-y:auto;position:relative;" v-scrollbar>
          <div style="height:50px;">short</div>
        </div>
      `,
    });
    const w = mount(TestComponent, { attachTo: document.body });
    const track = document.querySelector('.v-scrollbar-track') as HTMLElement;
    const thumb = document.querySelector('.v-scrollbar-thumb') as HTMLElement;
    expect(track.style.display).toBe('none');
    expect(thumb.classList.contains('v-scrollbar-thumb--off')).toBe(true);
    w.unmount();
  });

  it('autoHide=false 时拇指常显', () => {
    const w = mountHost({ autoHide: false });
    const thumb = document.querySelector('.v-scrollbar-thumb') as HTMLElement;
    expect(thumb.classList.contains('v-scrollbar-thumb--visible')).toBe(true);
    w.unmount();
  });

  it('悬停宿主显示拇指且常显，离开后 autoHide 计时结束才隐藏（fake timers）', () => {
    vi.useFakeTimers();
    try {
      const w = mountHost({ autoHide: 50 });
      const thumb = document.querySelector('.v-scrollbar-thumb') as HTMLElement;
      const host = w.find('.v-scrollbar-host').element as HTMLElement;
      expect(thumb.classList.contains('v-scrollbar-thumb--visible')).toBe(false);
      host.dispatchEvent(new Event('mouseenter'));
      expect(thumb.classList.contains('v-scrollbar-thumb--visible')).toBe(true);
      // 悬停期间不隐藏
      vi.advanceTimersByTime(200);
      expect(thumb.classList.contains('v-scrollbar-thumb--visible')).toBe(true);
      // 离开后开始倒计时
      host.dispatchEvent(new Event('mouseleave'));
      vi.advanceTimersByTime(60);
      expect(thumb.classList.contains('v-scrollbar-thumb--visible')).toBe(false);
      w.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('卸载时清理拇指与宿主类', () => {
    document.querySelectorAll('.v-scrollbar-host').forEach(el => el.remove());
    const w = mountHost();
    expect(document.querySelector('.v-scrollbar-host')).not.toBeNull();
    w.unmount();
    expect(document.querySelector('.v-scrollbar-host')).toBeNull();
    expect(document.querySelector('.v-scrollbar-track')).toBeNull();
    expect(document.querySelector('.v-scrollbar-thumb')).toBeNull();
  });

  it('全局样式仅注入一次', () => {
    const w1 = mountHost();
    const w2 = mountHost({ theme: 'primary' });
    expect(document.querySelectorAll('#v-scrollbar-style')).toHaveLength(1);
    w1.unmount();
    w2.unmount();
  });
});
