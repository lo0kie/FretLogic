import { onActivated, onBeforeUnmount, onDeactivated, onMounted } from 'vue';

import { tinykeys } from 'tinykeys';

import { isEditableTarget } from '@/platform/utils/dom';

/**
 * 声明式全局快捷键绑定（组合键的解析与匹配交给 tinykeys，本函数只管生命周期与业务门控）。
 *
 * 与未显式命名的方式区别：本组合式函数统一管理 keydown 监听的生命周期——
 * 自动跟随组件激活状态（KeepAlive 用 onActivated/onDeactivated；普通组件用 onMounted/onBeforeUnmount），
 * 同一实例在生命周期内只注册一份监听，激活/挂载与失活/卸载间幂等增删，杜绝重复/泄漏。
 *
 * 快捷键写法：单个（'Mod+z'）或数组（['Mod+Shift+z', 'Mod+y']），以 '+' 连接，支持修饰符：
 * - 'Mod'：平台无关修饰键（macOS 为 Cmd/meta，其余为 Ctrl）—— 翻译成 tinykeys 的 `$mod`
 * - 'Ctrl'/'Shift'/'Alt'/'Meta'：显式修饰键，接受 'Control'/'Option'/'Cmd'/'Command'/'Win' 等别名
 * - 未列出的修饰键在匹配时要求不存在（tinykeys 是精确匹配，故 Ctrl+Shift+Z 不会同时命中 Mod+z 与
 *   Mod+Shift+z）
 *
 * 按键名（'+' 之后那一段）原样交给 tinykeys：它按 `KeyboardEvent.key`（大小写不敏感）匹配，
 * 也认 `KeyboardEvent.code`，故 'z' 与 'KeyZ' 两种写法都成立。
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

  const handleKeydown = (e: KeyboardEvent) => {
    // 业务门控：未通过（如当前无 activeSong）时不响应。放在匹配之后与放在匹配之前等价 ——
    // 匹配是纯判定，没有副作用；ignoreEditable 那条则必须早于匹配（由 tinykeys 的 ignore 承担）
    if (enabled && !enabled()) return;

    if (preventDefault) e.preventDefault();
    if (stopPropagation) e.stopPropagation();
    handler(e);
  };

  /** 绑定表：键序即优先级（tinykeys 命中首个匹配项即停，与原先 combos.find 的短路同序） */
  const bindings: Record<string, (e: KeyboardEvent) => void> = {};
  for (const combo of Array.isArray(keybinding) ? keybinding : [keybinding])
    bindings[toTinykeysBinding(combo)] = handleKeydown;

  // 幂等注册：onMounted + onActivated 共用一个解绑槽，避免 KeepAlive 首挂时重复绑定
  let unsubscribe: (() => void) | null = null;
  const add = () => {
    if (unsubscribe) return;
    unsubscribe = tinykeys(window, bindings, {
      // 可编辑目标放行用本项目的 isEditableTarget（platform/utils/dom，唯一口径），不用 tinykeys 的
      // 默认判据：后者对 input/select/textarea 一律忽略，而这里刻意把 checkbox/radio/button 这类
      // **非文本** input 排除在外 —— 点过侧栏开关等控件后 Ctrl+Z 仍应生效
      ignore: ignoreEditable ? e => isEditableTarget(e.target) : () => false,
    });
  };
  const remove = () => {
    unsubscribe?.();
    unsubscribe = null;
  };

  onMounted(add);
  onActivated(add);
  onDeactivated(remove);
  onBeforeUnmount(remove);
}

/** 修饰符别名 → tinykeys 认得的键名；'mod' 落到平台无关的 `$mod`（macOS 为 Meta，其余为 Control） */
const MODIFIER_ALIASES: Record<string, string> = {
  mod: '$mod',
  ctrl: 'Control',
  control: 'Control',
  shift: 'Shift',
  alt: 'Alt',
  option: 'Alt',
  meta: 'Meta',
  cmd: 'Meta',
  command: 'Meta',
  win: 'Meta',
};

/**
 * 把 'Mod+Shift+z' 之类的组合写法翻译成 tinykeys 的绑定串（如 '$mod+Shift+z'）。
 *
 * 只做修饰符的**大小写归一与别名展开**，按键名原样透传：tinykeys 内部按
 * `["Shift","Meta","Alt","Control"]` 逐字比对 `getModifierState(mod)`，大小写不对即静默不匹配，
 * 故归一这一步不能省。
 *
 * 未知修饰符直接抛错：tinykeys 对认不得的修饰符只会「永不匹配」，写错的快捷键会无声失效 ——
 * 这类静默失败比一个启动期异常难查得多。
 */
const toTinykeysBinding = (input: string): string => {
  const parts = input.split('+').map(s => s.trim());
  const keyToken = parts.at(-1) ?? '';
  if (!keyToken) throw new Error(`[useKeybinding] 非法快捷键（缺少按键）：${input}`);

  return [...parts.slice(0, -1).map(token => resolveModifier(token, input)), keyToken].join('+');
};

/** 修饰符别名解析；未知即抛错（理由见 toTinykeysBinding） */
const resolveModifier = (token: string, input: string): string => {
  const resolved = MODIFIER_ALIASES[token.toLowerCase()];
  if (!resolved) throw new Error(`[useKeybinding] 未知修饰符 "${token}"（快捷键：${input}）`);

  return resolved;
};
