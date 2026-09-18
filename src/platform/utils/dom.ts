/**
 * 与「宿主滚动容器」打交道的通用 DOM 度量工具。
 *
 * 这类查询天然要沿祖先链向上看（容器是谁、有多少 padding），属于环境适配而非组件职责。
 * 以往每个需要它的地方各写一份循环（折叠面板的收起补偿、吸附头判定、v-scroll-into-view 指令），
 * 判定口径一旦漂移就各错各的；集中到这里才能保证「谁是滚动容器」只有一个定义。
 */

/** 沿祖先链向上找最近的滚动容器（v-scrollbar 注入的内联 overflow 同样命中） */
export const findScrollParent = (from: HTMLElement, direction: 'x' | 'y' = 'y'): HTMLElement | null => {
  let el = from.parentElement;
  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const overflow = direction === 'x' ? style.overflowX : style.overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return el;
    el = el.parentElement;
  }
  return null;
};

/**
 * 把 CSS 长度（'8px' / 'var(--spacing-sm)' / '0.5rem' …）解析为像素。
 * 借一个临时探针让浏览器完成换算，避免自己维护 rem / 自定义属性 / calc 的解析规则。
 */
export const resolveLengthToPx = (value: string): number => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:0;';
  probe.style.height = value;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return px;
};
