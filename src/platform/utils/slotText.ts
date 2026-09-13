/**
 * 槽位文本提取与悬停提示兜底：供 ActionButton / BaseBadge 等有默认插槽文案的 UI 组件复用。
 * 纯字符串/VNode 处理，不依赖任何上层模块。
 */

/** 递归提取 VNode 数组中的纯文本并 trim：跳过组件节点，仅收拢字符串文本 */
export function extractSlotText(nodes: unknown[]): string {
  let text = '';
  for (const node of nodes) {
    if (typeof node === 'string' || typeof node === 'number') {
      text += node;
    } else if (node && typeof node === 'object' && 'children' in node) {
      const { children } = node as { children?: unknown };
      if (typeof children === 'string') text += children;
      else if (Array.isArray(children)) text += extractSlotText(children);
    }
  }
  return text.trim();
}

/**
 * 统一的悬停提示回退规则：显式文案 > 主文案(label/content) > 默认插槽纯文本。
 * @param explicit 显式传入的提示文本（title 等）
 * @param primary 组件主文本字段（字数/内容），缺省时再回退默认插槽
 * @param defaultNodes 默认插槽的 VNode 数组
 */
export function resolveTextTitle(
  explicit: string | undefined,
  primary: string | number | undefined,
  defaultNodes: unknown[]
): string | undefined {
  return (
    explicit ?? (primary !== undefined ? String(primary) : undefined) ?? (extractSlotText(defaultNodes) || undefined)
  );
}
