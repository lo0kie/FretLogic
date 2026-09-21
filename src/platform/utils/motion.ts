/**
 * 动效基础：减弱动效偏好判定、滚动行为解析、transition 字符串增删，以及逐字符翻页的字符对位算法。
 *
 * 合并自 motion.ts + rollingText.ts：rollingText 的对位结果是给过渡动画用的
 * （BaseRollingText 与 v-scrollbar 气泡共用同一份过渡类），与 motion 同属「动效」职责。
 */

// ──────────────────────────── 以下原 motion.ts ────────────────────────────

/**
 * 动效偏好工具：把「系统是否要求减弱动态效果」收敛成单一来源。
 *
 * 为什么需要它：main.scss 的 `@media (prefers-reduced-motion: reduce)` 只能归零 **CSS** 动画
 * 与 `scroll-behavior`，管不住 JS 显式传入的 `behavior: 'smooth'`——那是调用方主动请求的平滑滚动，
 * 其优先级高于 CSS 的 scroll-behavior，因此系统偏好对这类滚动完全失效。
 * 凡是要写 'smooth' 的地方都应先经 resolveScrollBehavior 过滤。
 *
 * 自持 isClient 判定而不从 platform/ui 引入：platform/utils 严禁依赖 platform/ui（eslint zone）。
 */

/** 有无 DOM（SSR / 纯 node 测试环境为 false） */
const hasDom = (): boolean => typeof document !== 'undefined' && typeof window !== 'undefined';

/** 系统是否要求减弱动态效果（无 DOM / 无 matchMedia 环境视为 false） */
export const prefersReducedMotion = (): boolean => {
  if (!hasDom() || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * 按系统偏好收敛滚动行为：请求 'smooth' 但用户要求减弱动效时降级为 'auto'（瞬时跳转），
 * 其余取值原样透传。用于 scrollTo / scrollIntoView / scrollBy 的 behavior 参数。
 */
export const resolveScrollBehavior = (requested: ScrollBehavior = 'auto'): ScrollBehavior =>
  requested === 'smooth' && prefersReducedMotion() ? 'auto' : requested;

// ==================== transition 简写组合 ====================
//
// 同一个元素可能被多个指令共享（典型：BaseScrollArea 根元素同时挂 v-auto-height 与
// v-edge-fade），各自都要写 el.style.transition。整条覆盖会让后写方吞掉先写方的过渡——
// 症状是「A 生效 B 失效」且随触发时序摇摆。这里收敛出按条目组合的单一实现：
// 拆分时必须括号感知（cubic-bezier(...) / var(--x, fallback) 内含逗号，朴素 split 会切碎）。

/** 拆分 transition 简写为条目：顶层逗号分隔，括号内（bezier/var 缺省值）的逗号不分隔 */
const splitTransitionItems = (value: string): string[] => {
  const items: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      const part = value.slice(start, i).trim();
      if (part) items.push(part);
      start = i + 1;
    }
  }
  const tail = value.slice(start).trim();
  if (tail) items.push(tail);
  return items;
};

/** transition 条目的属性名（首个空白前的 token，如 `height` / `--fade-start`） */
const transitionPropertyOf = (item: string): string => item.trim().split(/\s+/)[0] ?? '';

/** 同属性条目是否已存在（用于写入前的幂等判断） */
export const hasTransitionItem = (existing: string, property: string): boolean =>
  splitTransitionItems(existing).some(item => transitionPropertyOf(item) === property);

/**
 * 合并一条 transition 条目：同属性覆盖、其余条目原位保留。
 * 多个指令共享同一元素的 style.transition 时，各自用它追加/更新自己的条目，
 * 不再整条覆盖他人（覆盖 = 吞掉别人的过渡，且随触发时序摇摆生效与否）。
 */
export const mergeTransitionItem = (existing: string, item: string): string => {
  const prop = transitionPropertyOf(item);
  const others = splitTransitionItems(existing).filter(i => transitionPropertyOf(i) !== prop);
  return [...others, item].join(', ');
};

/** 移除指定属性名的 transition 条目（卸载/禁用时回收自己的条目，不碰他人的） */
export const removeTransitionItems = (existing: string, ...properties: string[]): string => {
  const drop = new Set(properties);
  return splitTransitionItems(existing)
    .filter(item => !drop.has(transitionPropertyOf(item)))
    .join(', ');
};

// ──────────────────────────── 以下原 rollingText.ts ────────────────────────────

/**
 * 逐字符翻页的「字符对位」：纯函数，不碰 DOM、不依赖 Vue。
 *
 * 为什么单独抽出来：逐字符翻页有两个消费者——
 *  - 组件 BaseRollingText（`<Transition>` + 响应式 cells 驱动）；
 *  - v-scrollbar 的滚动气泡读数（指令内部构建的纯 DOM 节点，没有 Vue 实例，手工切换过渡类驱动）。
 * 对位规则本身很细（见 alignRollCells 的注释：窗口 key 必须跨变化稳定，否则整段错位翻滚或什么都不翻），
 * 两处各写一套必然各自踩同一批坑，故算法收在此处共用；两边只负责各自的「怎么把单元变成动画」。
 */

/** 翻页的字符单元：key 是跨文本变化的稳定标识，供窗口节点复用（未变字符不重挂、不翻页） */
export interface RollCell {
  key: number;
  char: string;
}

/** 对位结果：新的单元序列 + 下一个可用 key（调用方持有自增游标，本函数因此保持无状态） */
export interface RollAlignment {
  cells: RollCell[];
  nextKey: number;
}

/**
 * 对位新旧文本的字符单元序列：按「公共前缀 + 公共后缀」对齐。
 *
 * 关键约束（两个消费者共用，改动前先读这段）：
 * 窗口节点的 key 必须跨变化**稳定**——翻页动画靠内层以字符值为 key 触发，
 * 窗口一旦重挂载（新 key），内层就是初始渲染，不会播翻页。因此：
 *  - 前后缀匹配的字符沿用旧 cell（key 与字符都不变 → 窗口与内容双静止）；
 *  - 中间变化的字符**按位复用旧 cell 的 key**、只替换字符 → 外层窗口不重挂，内层 key 变化 → 翻页；
 *  - 中间多出的新槽位（长度增长）才分配新 key（新窗口初始渲染，内容直接出现，不翻页）。
 * 这样「9/30 → 10/30」里首槽 '9'→'1' 翻页、"/30" 原位静止；按下标对位的写法会让整体右移、
 * 未变字符集体错位翻滚，而「变化字符给全新 key」的写法会让窗口重挂、什么都不翻。
 *
 * @param old 上一次的单元序列（首次渲染传空数组）
 * @param next 新文本
 * @param startKey 新槽位可用的起始 key
 */
export const alignRollCells = (old: readonly RollCell[], next: string, startKey: number): RollAlignment => {
  // 按码点切分而非按 UTF-16 单元切分：代理对（表情/生僻字）必须整体作为一个字符翻页
  const newChars = Array.from(next);

  // 公共后缀：从两端末尾逐字比较（长度变化时后缀通常不变，先算它才能锁住尾段）
  let suffixLen = 0;
  while (
    suffixLen < old.length &&
    suffixLen < newChars.length &&
    old[old.length - 1 - suffixLen]!.char === newChars[newChars.length - 1 - suffixLen]!
  )
    suffixLen++;

  // 公共前缀：不得越过公共后缀（全等时二者相接，不重叠）
  let prefixLen = 0;
  while (
    prefixLen < old.length - suffixLen &&
    prefixLen < newChars.length - suffixLen &&
    old[prefixLen]!.char === newChars[prefixLen]!
  )
    prefixLen++;

  const keptPrefix = old.slice(0, prefixLen);
  const keptSuffix = old.slice(old.length - suffixLen);
  const oldMiddle = old.slice(prefixLen, old.length - suffixLen);
  let key = startKey;
  const inserted: RollCell[] = newChars
    .slice(prefixLen, newChars.length - suffixLen)
    // 有旧槽位就复用其 key（同窗口内换字 → 内层翻页）；多出的才是全新槽位
    .map((char, i) => (i < oldMiddle.length ? { key: oldMiddle[i]!.key, char } : { key: key++, char }));

  return { cells: [...keptPrefix, ...inserted, ...keptSuffix], nextKey: key };
};
