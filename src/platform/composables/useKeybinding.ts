import { onActivated, onBeforeUnmount, onDeactivated, onMounted } from 'vue';

/**
 * 声明式全局快捷键绑定（注册用 Vue 3.x 正式 API，无弃用 API）。
 *
 * 与未显式命名的方式区别：本组合式函数统一管理 keydown 监听的生命周期——
 * 自动跟随组件激活状态（KeepAlive 用 onActivated/onDeactivated；普通组件用 onMounted/onBeforeUnmount），
 * 同一实例在生命周期内只注册一份监听，激活/挂载与失活/卸载间幂等增删，杜绝重复/泄漏。
 *
 * 快捷键写法：单个（'Mod+z'）或数组（['Mod+Shift+z', 'Mod+y']），以 '+' 连接，支持修饰符：
 * - 'Mod'：平台无关修饰键（macOS 为 Cmd/meta，其余为 Ctrl）
 * - 'Ctrl'/'Shift'/'Alt'/'Meta'：显式修饰键
 * - 未列出的修饰键在匹配时要求不存在（严格精确匹配，避免 Ctrl+Shift+Z 同时命中 Mod+z 与 Mod+Shift+z）
 *
 * 默认能力：
 * - ignoreEditable=true：焦点落在 input/textarea/contentEditable 时放行原生输入，不拦截；业务无需手动判焦点
 * - preventDefault=true：命中后拦截浏览器默认行为（如页面缩放失焦的 Ctrl+Z）
 *
 * @param keybinding 单个或一组快捷键组合
 * @param handler 命中且通过 enabled 门控后的回调
 * @param options.preventDefault 命中后是否阻止默认行为（默认 true）
 * @param options.stopPropagation 命中后是否停止冒泡（默认 false）
 * @param options.ignoreEditable 焦点在可编辑元素内是否放行（默认 true）
 * @param options.enabled 额外启用门控（如 activeSong 存在才生效）
 */
export function useKeybinding(
  keybinding: string | string[],
  handler: (e: KeyboardEvent) => void,
  options: {
    preventDefault?: boolean;
    stopPropagation?: boolean;
    ignoreEditable?: boolean;
    enabled?: () => boolean;
  } = {}
): void {
  const { preventDefault = true, stopPropagation = false, ignoreEditable = true, enabled } = options;

  const combos = (Array.isArray(keybinding) ? keybinding : [keybinding]).map(parseCombo);

  const handleKeydown = (e: KeyboardEvent) => {
    // 焦点在可编辑元素内时放行原生输入（输入法 / 撤销历史由各输入控件自己处理）
    if (ignoreEditable && isEditableTarget(e.target)) return;
    // 业务门控：未通过（如当前无 activeSong）时不响应
    if (enabled && !enabled()) return;

    const combo = combos.find(
      c =>
        c.ctrl === e.ctrlKey &&
        c.shift === e.shiftKey &&
        c.alt === e.altKey &&
        c.meta === e.metaKey &&
        e.key.toLowerCase() === c.key
    );
    if (!combo) return;

    if (preventDefault) e.preventDefault();
    if (stopPropagation) e.stopPropagation();
    handler(e);
  };

  // 幂等注册：onMounted + onActivated 共用一个 active 标记，避免 KeepAlive 首挂时重复添加
  let active = false;
  const add = () => {
    if (active) return;
    active = true;
    window.addEventListener('keydown', handleKeydown);
  };
  const remove = () => {
    if (!active) return;
    active = false;
    window.removeEventListener('keydown', handleKeydown);
  };

  onMounted(add);
  onActivated(add);
  onDeactivated(remove);
  onBeforeUnmount(remove);
}

/** 解析 'Mod+Shift+z' 之类的组合写法为精确匹配结构 */
interface KeyCombo {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

/** 平台判定：macOS（含 iOS）上 Mod 映射为 meta，其余映射为 ctrl；解析期落定 */
const isMacPlatform = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod|Macintosh/i.test(navigator.platform);

/** 将单个组合串解析为确定性的修饰符/按键结构；无法解析时抛错提醒调用方 */
const parseCombo = (input: string): KeyCombo => {
  const parts = input.split('+').map(s => s.trim());
  if (parts.length === 0) throw new Error(`[useKeybinding] 非法快捷键：${input}`);

  const keyToken = parts[parts.length - 1] ?? '';
  if (!keyToken) throw new Error(`[useKeybinding] 非法快捷键（缺少按键）：${input}`);

  // 'Mod' 是平台无关修饰键：在解析期按目标平台落定到其在 KeyboardEvent 上对应的实键标志，
  // 之后统一用「各标志 === 实际按键状态」做严格精确匹配，避免把 meta/ctrl 双判定搞混。
  const isMac = isMacPlatform();
  const combo: KeyCombo = { ctrl: false, shift: false, alt: false, meta: false, key: keyToken.toLowerCase() };

  for (const token of parts.slice(0, -1)) {
    const t = token.toLowerCase();
    if (t === 'mod') {
      if (isMac) combo.meta = true;
      else combo.ctrl = true;
    } else if (t === 'ctrl' || t === 'control') {
      combo.ctrl = true;
    } else if (t === 'shift') {
      combo.shift = true;
    } else if (t === 'alt' || t === 'option') {
      combo.alt = true;
    } else if (t === 'meta' || t === 'cmd' || t === 'command' || t === 'win') {
      combo.meta = true;
    } else {
      throw new Error(`[useKeybinding] 未知修饰符 "${token}"（快捷键：${input}）`);
    }
  }

  return combo;
};

/** 判断事件目标是否为可编辑元素（input / textarea / contenteditable） */
const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return true;
  return target.isContentEditable;
};
