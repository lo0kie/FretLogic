/**
 * v-action-card 指令：为任意「用 div 模拟按钮」的卡片注入整套按钮 A11y 协议。
 *
 * 卡片因 flex 排版 / 子元素交互限制无法使用原生 <button>，此前每个业务卡片都需手写拷贝
 * `role="button"`、`tabindex="0"`、Enter / Space 触发 click 并 `preventDefault` / `stopPropagation`。
 * 本指令将这些协议收敛为一处：
 * - 挂载时自动注入 `role="button"` 与 `tabindex="0"`（已有显式值则保留，避免覆盖业务自定义语义）；
 * - 在捕获阶段把 Enter / Space 键转为 `click` 派发（Space 同时阻止默认滚动），并阻止事件继续
 *   传播，避免重复触发或误触外层容器逻辑；
 * - 命中后依赖卡片自身的 `@click` 处理器完成业务动作，业务层无需再写任何键盘监听。
 *
 * 用法：<div v-action-card @click="handleClick" class="...">…</div>
 * 可选：<div v-action-card="{ disabled }" …>（disabled 为 true 时忽略按键转换）
 */
import type { Directive, DirectiveBinding } from 'vue';

export interface ActionCardOptions {
  /** 禁用态：为 true 时忽略 Enter / Space 按键转换 */
  disabled?: boolean;
}

export type ActionCardBinding = boolean | ActionCardOptions | null | undefined;

const isDisabled = (value?: ActionCardBinding): boolean => {
  if (typeof value === 'object' && value !== null) return value.disabled === true;
  return false;
};

/** 读取挂载/更新时解析好的综合禁用态（修饰符 disabled 或绑定对象 disabled 任一为真即禁用） */
const resolveDisabled = (el: HTMLElement): boolean =>
  Boolean((el as unknown as { __actionCardDisabled?: boolean }).__actionCardDisabled);

const KEYDOWN_HANDLER = 'data-action-card-handler';

/**
 * 捕获阶段按键转换：Enter / Space → click。
 * 只在捕获阶段监听可确保命中唯一的聚焦元素；preventDefault 阻止 Space 滚动，stopPropagation
 * 阻止事件继续冒泡到外层，避免业务 @click 被重复触发。
 */
const handleCardKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  // 仅响应落在宿主自身上的按键：若未来卡片内嵌套了原生按钮/输入框等可聚焦子元素，
  // 子元素自身的 Enter / Space 语义不应被劫持为整卡激活
  if (e.target !== e.currentTarget) return;
  const el = e.currentTarget as HTMLElement;
  if (resolveDisabled(el)) return;
  e.preventDefault();
  e.stopPropagation();
  el.click();
};

export const vActionCard: Directive<HTMLElement, ActionCardBinding> = {
  mounted(el, binding) {
    if (!el.getAttribute('role')) el.setAttribute('role', 'button');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    syncDisabled(el, binding);
    el.addEventListener('keydown', handleCardKeydown, true);
    el.setAttribute(KEYDOWN_HANDLER, 'true');
  },
  updated(el, binding) {
    syncDisabled(el, binding);
  },
  unmounted(el) {
    el.removeEventListener('keydown', handleCardKeydown, true);
    el.removeAttribute(KEYDOWN_HANDLER);
    (el as unknown as { __actionCardDisabled?: boolean }).__actionCardDisabled = undefined;
  },
};

/** 综合修饰符 .disabled 与绑定对象 disabled，缓存解析后的禁用态供捕获阶段处理器读取 */
const syncDisabled = (el: HTMLElement, binding: DirectiveBinding<ActionCardBinding>): void => {
  (el as unknown as { __actionCardDisabled?: boolean }).__actionCardDisabled =
    Boolean(binding.modifiers?.['disabled']) || isDisabled(binding.value);
};
