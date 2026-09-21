/**
 * 浮层面板的 Esc 关闭全局分发器。
 *
 * 背景：`BaseFloatingPanel` 此前在每次「面板转为可见」时各挂一条 window keydown 监听，
 * 每条只判「焦点是否在自己面板内」。多个面板同时可见时，**谁响应 Esc 取决于监听注册顺序**，
 * 而不是视觉上的层叠顺序——语义不确定；若出现嵌套，外层面板因 `contains(focus)` 同样成立
 * 也会一起关掉。
 *
 * 现收敛为：全局唯一一条 keydown 监听 + 面板登记表。响应者 = 登记面板中**包含当前焦点**且
 * **内联层号最高**的那一个。层号来自与 Popover / 抽屉共享的浮层池（见 `popover/floatingZ`，
 * 面板把它写在自己的内联 style 上），因此「Esc 关掉最上面那个」与视觉层叠一致。
 *
 * 保留原有语义：**非模态面板不抢占宿主页面的 Esc** —— 焦点不在任何登记面板内时直接不处理。
 *
 * 与 `platform/ui/focus-ring/focusRingOverlay.ts` 同模式（全局行为只接线一处、消费方只做声明），
 * 差别是**惰性挂接**：只有真的有面板可见时才需要这条监听，登记表清空即摘除。
 */
interface PanelEscapeEntry {
  /** 面板根元素（其内联 `style.zIndex` 即浮层池分配的层号） */
  el: HTMLElement;
  /** 请求关闭该面板 */
  close: () => void;
}

const entries = new Map<HTMLElement, PanelEscapeEntry>();
/** 当前那条全局监听的摘除函数；null 表示未挂接 */
let detachKeydown: (() => void) | null = null;

/** 读面板的内联层号；未取号（0 / 非法）按 0 处理，参与比较时自然排到已取号者之后 */
const zIndexOf = (el: HTMLElement): number => {
  const z = Number.parseInt(el.style.zIndex, 10);
  return Number.isFinite(z) ? z : 0;
};

const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  const active = document.activeElement;
  if (!(active instanceof Node)) return;

  let picked: PanelEscapeEntry | null = null;
  for (const entry of entries.values()) {
    if (!entry.el.isConnected) continue;
    if (!entry.el.contains(active)) continue;
    // >= 让「同层号」取后登记（后打开）者：Map 按插入顺序遍历，后者即视觉上的后者
    if (!picked || zIndexOf(entry.el) >= zIndexOf(picked.el)) picked = entry;
  }
  picked?.close();
};

const attachKeydown = () => {
  if (detachKeydown || typeof window === 'undefined') return;
  window.addEventListener('keydown', onKeydown);
  detachKeydown = () => {
    window.removeEventListener('keydown', onKeydown);
    detachKeydown = null;
  };
};

/**
 * 登记一个可见面板，返回注销函数（面板不可见 / 组件卸载时调用）。
 * 首次登记挂接全局监听；最后一名注销后监听随之摘除。
 */
export const registerPanelEscape = (entry: PanelEscapeEntry): (() => void) => {
  entries.set(entry.el, entry);
  attachKeydown();
  return () => {
    entries.delete(entry.el);
    if (entries.size === 0) detachKeydown?.();
  };
};
