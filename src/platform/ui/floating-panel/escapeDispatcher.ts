import { useEventListener } from '@vueuse/core';

import { isClient, lastMatching } from '@/platform/utils/common';

/**
 * 浮层面板的 Esc 关闭全局分发器。
 *
 * 背景：`BaseFloatingPanel` 此前在每次「面板转为可见」时各挂一条 window keydown 监听，
 * 每条只判「焦点是否在自己面板内」。多个面板同时可见时，**谁响应 Esc 取决于监听注册顺序**，
 * 而不是视觉上的层叠顺序——语义不确定；若出现嵌套，外层面板因 `contains(focus)` 同样成立
 * 也会一起关掉。
 *
 * 现收敛为：全局唯一一条 keydown 监听 + 面板登记表。响应者 = 登记面板中**包含当前焦点**、
 * 且**登记次序最靠后**的那一个。
 *
 * 为什么次序可以直接当层叠次序用：面板本体的层叠来源已改为浏览器 top-layer
 * （`popover="manual"`，见 2026-09-29 的迁移），而 top-layer 的排列规则就是「进入的先后」。
 * 本表在面板**进入 top-layer 之后**登记、在关闭时注销，故插入序即进层次序 ——
 * 与 `usePopoverOrder` 的打开中浮层登记表同源同口径（那边服务于 BasePopover 的 Esc 判定）。
 * 迁移前这里读的是面板内联 `style.zIndex`（由已删除的层号池写入），层号既不复存在，
 * 也不再需要：浏览器不暴露「读取 top-layer 顺序」的 API，顺序只能自记。
 *
 * 保留原有语义：**非模态面板不抢占宿主页面的 Esc** —— 焦点不在任何登记面板内时直接不处理。
 *
 * 与 `platform/ui/focus-ring/focusRingOverlay.ts` 同模式（全局行为只接线一处、消费方只做声明），
 * 差别是**惰性挂接**：只有真的有面板可见时才需要这条监听，登记表清空即摘除。
 */
interface PanelEscapeEntry {
  /** 面板根元素 */
  el: HTMLElement;
  /** 请求关闭该面板 */
  close: () => void;
}

const entries = new Map<HTMLElement, PanelEscapeEntry>();
/** 当前那条全局监听的摘除函数；null 表示未挂接 */
let detachKeydown: (() => void) | null = null;

const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  const active = document.activeElement;
  if (!(active instanceof Node)) return;

  // Map 按插入序遍历；「最后一个命中者」即后进 top-layer 的面板（规则见 lastMatching，与
  // 模态阻断栈、打开中浮层登记表同源）
  lastMatching(entries.values(), entry => entry.el.isConnected && entry.el.contains(active))?.close();
};

const attachKeydown = () => {
  if (detachKeydown || !isClient) return;
  // useEventListener 的 immediate 分支是同步注册的（flush: 'post' 只影响后续重跑），故这里的
  // 「首次登记即挂接」时序与手写 addEventListener 一致；返回值即摘除句柄
  detachKeydown = useEventListener(window, 'keydown', onKeydown);
};

/**
 * 登记一个可见面板，返回注销函数（面板不可见 / 组件卸载时调用）。
 * 首次登记挂接全局监听；最后一名注销后监听随之摘除。
 *
 * 先删后插是必需的：`Map.set` 对已存在的键**不改变插入位置**，而「插入序即层叠序」正是本表的
 * 全部语义 —— 面板关闭再打开（或同一实例二次进 top-layer）若不重新入队，它会永远停在旧次序上，
 * Esc 就会一直选中错误的那一层。
 */
export const registerPanelEscape = (entry: PanelEscapeEntry): (() => void) => {
  entries.delete(entry.el);
  entries.set(entry.el, entry);
  attachKeydown();
  return () => {
    entries.delete(entry.el);
    if (entries.size > 0) return;
    // 摘除句柄自己不会把 detachKeydown 复位（useEventListener 只负责摘监听），
    // 不复位会让下一次 attachKeydown 因「已有句柄」而早退，全局监听再也挂不上
    detachKeydown?.();
    detachKeydown = null;
  };
};
