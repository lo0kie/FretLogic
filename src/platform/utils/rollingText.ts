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
  ) {
    suffixLen++;
  }
  // 公共前缀：不得越过公共后缀（全等时二者相接，不重叠）
  let prefixLen = 0;
  while (
    prefixLen < old.length - suffixLen &&
    prefixLen < newChars.length - suffixLen &&
    old[prefixLen]!.char === newChars[prefixLen]!
  ) {
    prefixLen++;
  }

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
