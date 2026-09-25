/**
 * 谱面槽位的**视觉类名单一来源**。
 *
 * 槽位有两套实现共享同一份视觉，两者的类串全部取自本模块：
 * 1. `SlotShell.vue` —— 组件壳，供和弦槽（`ChordSlot`）与添加槽（`AddSlot`）使用；
 * 2. `ScoreInteractiveArea.vue` 里**内联的瘦槽位** —— 未绑和弦的普通字符槽。它是谱面里数量
 *    占绝对多数的那一类（一行二十来个字符就是二十来个槽，长谱面可达数千个），每个都挂两个
 *    组件实例（外壳 + 字形）是挂载成本的大头，故它不走组件、直接内联。
 *
 * 于是「改槽的几何 / 状态视觉」只改本文件一处，两套实现同时生效 —— 这正是内联瘦槽位能被接受的
 * 前提：**类名不复制**。骨架（根 → 落点提示层 → 字形）在两边各自的模板里，层数有变时两处都要动，
 * 这是「不为省一个空 div 而给瘦槽位再挂一个组件」付的代价，写在这里以免下次误判。
 *
 * 字形「非拖拽时染主题色」那条规则**不在本模块**：它是 `SlotGlyph.vue` 的 `:global()` 选择器，
 * 而 `:global()` 整条不带 scoped 属性、本就是全局的 —— 内联字形带同一个 `.char-text` 即命中，
 * 不需要、也不该再写第二份。改那条染色仍只改 `SlotGlyph.vue` 一处。
 */

/**
 * 槽根（`.char-box`）的静态类串：盒子几何、过渡，以及全部状态变体。
 *
 * 状态一律写成 `[&.状态类]:` 变体而不是把值塞进 `:class` 三元 —— 这类选择器带两个类、特异性
 * (0,2,0)，稳压基类里的同名工具类（`min-w-0` / `min-h-0` / `outline-none`），胜出者不依赖
 * Tailwind 的编译顺序。代价是基类几何（`p-0.5` / `min-*`）现在是普通工具类，宿主透传同名类
 * 会按编译顺序胜出 —— 当前三个调用点都不传布局类，故无实际影响。
 *
 * ⚠️ `is-picker-target` 的三条 outline longhand 必须带 `!`：槽根挂着 `data-focusable-outline`，
 * 而聚焦环模块（`focusRingOverlay`）在 `main.ts` 装配时会注入一条 `outline:none !important`
 * 规则（选择器即该属性标记，画布画的环替代原生 outline）。`!important` 无视特异性，所以不带 `!`
 * 的 `outline-*` 会被那条规则整体吃掉（`outline` 简写含 style/width/color 三个 longhand），
 * 虚线永远画不出来。这与 `is-dragging-source` 那两条带 `!` 的理由同类。
 *
 * `is-press-arming` / `is-dragging-source` 由拖拽系统按 `[data-slot-key]` 直接 `classList` 增删，
 * 故只能挂在这份**静态**类串上（不能挪进 `:class` 绑定，也不能把根元素换成别的节点）——
 * 否则长按 / 拖拽期间静默失去反馈（无报错）。
 */
export const SLOT_SHELL_CLASS =
  'char-box group relative box-content flex min-h-0 min-w-0 cursor-pointer [touch-action:pan-x_pan-y] flex-col items-center justify-start self-stretch rounded-sm p-0.5 transition-all duration-fast ease-standard outline-none hover:bg-tint-primary-88 [&.is-content-slot]:gap-xs [&.is-dragging-source]:opacity-35! [&.is-dragging-source]:shadow-(--focus-ring)! [&.is-drop-line]:min-h-[108px] [&.is-drop-line]:min-w-[58px] [&.is-drop-line-vacant]:border [&.is-drop-line-vacant]:border-dashed [&.is-drop-line-vacant]:border-border-light [&.is-left-adjacent]:ml-[0.15rem] [&.is-picker-target]:outline-2! [&.is-picker-target]:-outline-offset-2! [&.is-picker-target]:outline-(--tint-primary-45)! [&.is-picker-target]:outline-dashed! [&.is-press-arming]:scale-[1.04] [&.is-press-arming]:shadow-[0_0_0_2px_var(--color-primary)]';

/** 槽根的状态位（与上面静态类串里的 `[&.状态类]:` 变体一一对应） */
export interface SlotShellState {
  /** 本槽所在行是当前拖拽的活动落点行：撑开成足够大的落位目标 */
  isDropLine?: boolean;
  /** 连字符层都没有的一格（如添加槽）：落点行上再补一圈虚线框 */
  isDropLineVacant?: boolean;
  /** 本槽为选器和弦面板的当前目标：渲染「待写入」高亮 */
  isPickerTarget?: boolean;
  /** 槽里有内容（指板图卡 /「+」）：内容层与字符层之间要留间距 */
  isContentSlot?: boolean;
  /** 与左侧相邻和弦紧邻：补一点左外边距 */
  isLeftAdjacent?: boolean;
}

/**
 * 槽根的状态类。`is-drop-line-vacant` 的合取（落点行 **且** 空格）收在这里，
 * 免得两套实现各写一遍 `&&`、漏一处就出现「同一个标记两种样子」。
 */
export const slotShellStateClass = (state: SlotShellState): Record<string, boolean> => ({
  'is-drop-line': Boolean(state.isDropLine),
  'is-drop-line-vacant': Boolean(state.isDropLine && state.isDropLineVacant),
  'is-picker-target': Boolean(state.isPickerTarget),
  'is-content-slot': Boolean(state.isContentSlot),
  'is-left-adjacent': Boolean(state.isLeftAdjacent),
});

/**
 * 落点提示层（槽根下那层绝对定位的装饰框）的静态类串。
 *
 * 只给一圈主题色边框、不铺底色、不遮挡字符；`inset-[2px]` 以槽根（relative）为参照，故它挂在
 * 根下、与内部三层怎么排无关。过渡由类切换承担、不套 `<Transition>`：每个槽位都要多实例化
 * Transition + BaseTransition 两个组件，纯装饰性提示不值得付这个开销；且原 enter/leave 的 scale
 * 两端都是 100%，实际只有 opacity 在变，故 `transition-property` 收敛为 opacity,visibility。
 * `visibility` 与 `opacity` 同过渡：淡出结束后才转 hidden，既不建层叠上下文也不参与命中。
 */
export const SLOT_DROP_LAYER_CLASS =
  'pointer-events-none absolute inset-[2px] z-3 rounded-[5px] border-2 border-primary transition-[opacity,visibility] duration-fast';

/**
 * 落点提示层的显隐类。
 *
 * 参数可省：槽的 `isDropTarget` 是可选 prop（调用方不传即「不是落点」），模板里读出来就是
 * `boolean | undefined`，收成 `boolean` 会让每个未传该 prop 的调用点都过不了 `strict` 的实参检查。
 * 与 `slotShellStateClass` 的状态位同为可选、`undefined` 一律按 `false` 处理，两处口径一致。
 */
export const slotDropLayerStateClass = (isDropTarget?: boolean): string =>
  isDropTarget ? 'visible opacity-100' : 'invisible opacity-0';

/**
 * 字形（`.char-text`）的静态类串。
 *
 * 贴底（`mt-auto`）与 hover 染色（依赖槽根上的 `.group`）都是这一行的固有行为。高度取自
 * `min-h` 且随 `--score-font-scale` 同步缩放：不传字符时渲染空字形、但占住同一行高度，
 * 行首 / 行尾的边缘槽靠它与字符槽等高对齐。
 */
export const SLOT_GLYPH_CLASS =
  'char-text mt-auto inline-flex min-h-[calc(1.15rem*var(--score-font-scale,1))] items-center justify-center px-0.5 text-[calc(var(--score-font-scale,1)*0.875rem)]/[1.15rem] whitespace-pre transition-all duration-fast';

/** 歌词换行分隔符（`|` / 全角 `｜`）：视觉上当标点处理，不当正文字 */
export const isLyricSeparator = (char?: string): boolean => char === '|' || char === '｜';

/** 字形配色档：分隔符降为常规字重 + 次级色，其余是标题色 */
export const slotGlyphColorClass = (char?: string): string =>
  isLyricSeparator(char) ? 'font-normal text-fg-muted' : 'font-semibold text-fg-title';

/** 字形文本：空格用不换行空格撑宽（普通空格会被折叠）；无字符时为空串，但 `min-h` 仍在 */
export const slotGlyphText = (char?: string): string => {
  if (char === undefined) return '';
  return char === ' ' ? '\u00A0' : char;
};
