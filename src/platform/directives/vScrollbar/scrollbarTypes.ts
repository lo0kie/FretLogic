/**
 * v-scrollbar 的公开类型与导出常量。
 *
 * 从 vScrollbar.ts 抽出（原 33~128、147、149、317、319 行）。
 * 纯声明、零依赖：被 geometry / roll / core / 各行为模块共同引用，不反向依赖任何实现，
 * 因此放在依赖图最底层，天然无环。
 */

export interface ScrollbarOptions {
  /** 轨道/拇指 overlay 的挂载容器：默认取宿主父元素。
   *  Vue 托管的容器（其子节点由 v-if/Transition 动态切换，如浮层面板宿主）必须显式传入一个
   *  独立的、模板内无子节点的稳定容器——把外来节点追加进 Vue 会 diff 的容器，
   *  会破坏补丁锚点（切换子节点时触发 insertBefore NotFoundError） */
  overlayParent?: HTMLElement | null | (() => HTMLElement | null | undefined);
  /** 是否启用指令；false 时整体惰性——不注入变量桥、不挂 overlay、不注册状态（默认 true）。
   *  供「指令必须常驻模板、启用与否由运行时 prop 决定」的宿主（如 BasePopover 面板）使用，
   *  避免在 <Transition> 内用 v-if/v-else 双分支切换指令挂载（会触发锚点补丁错误） */
  enabled?: boolean;
  /** 生效轴向：'y' 纵向 / 'x' 横向；与 vScrollIntoView 的 direction 约定一致。
   *  省略（且无方向修饰符）时默认启用双轴（x+y），各轴仅在确有溢出时显示，对齐原生滚动条限制 */
  direction?: 'x' | 'y';
  /** 闲置后自动隐藏拇指的毫秒数；false 表示常显。默认 400 */
  autoHide?: number | false;
  /** 拇指最小长度（px），默认 32 */
  minThumbSize?: number;
  /** 轨道点击行为：page 翻页滚动 / jump 直接跳到点击位 / none 无响应。默认 'page' */
  trackClick?: 'page' | 'jump' | 'none';
  /** 是否渲染轨道（拇指仍保留）；亦可直接用 `.no-track` 修饰符开启拇指-only 模式。默认 true */
  showTrack?: boolean;
  /** 轨道与拇指行程的首尾留白（px），默认 4；遇到大圆角容器时可适当增大（如 8）避免拇指端部被 overflow:hidden 裁切 */
  endInset?: number;
  /** 轨道与拇指距容器边缘的视觉间距（px），默认 4 */
  edgeOffset?: number;
  /** 滚动气泡提示：true 默认档（滚动进度百分比）/ false·省略 关闭（默认关，避免改变既有滚动区观感）/
   *  选项对象自定义文案与观感，见 ScrollbarBubbleOptions */
  bubble?: boolean | ScrollbarBubbleOptions;
  /** 每次滚动回调：携带位置与双轴进度（原生 scroll 事件只有裸位置、无进度与手势判定，此处集中提供） */
  onScroll?: (detail: ScrollbarScrollDetail) => void;
}

/**
 * 滚动气泡提示：滚动期间在滚动条旁浮出一枚读数气泡，随拇指中位移动，带指向滚动条的箭头，
 * 读数变化时逐字符翻页，闲置后随滚动条一起淡出——生命周期以滚动条的可见期为上界（拇指隐藏即一并收起，见 setThumbsVisible）。
 *
 * 触发与「拇指常显 / 轨道悬停显形」解耦——气泡只在发生滚动时出现，单纯把鼠标移进滚动区不会弹提示，
 * 避免每一次指向滚动区都糊上一块读数。且只认所属轴（见 axis）：双轴可滚的宿主里滚另一轴时读数没变，
 * 那时显形等于展示一份陈旧读数。默认读数取所属轴的滚动进度百分比。
 */
export interface ScrollbarBubbleOptions {
  /** 是否启用；对象形式下显式传 false 可关闭（省略即开启） */
  enabled?: boolean;
  /**
   * 文案生成：入参为本次滚动明细（位置 + 双轴进度 + 是否用户手势），返回气泡文本。
   * 返回值按纯文本写入（textContent，不解析 HTML），故可安全承载外部数据。
   * 默认显示所属轴进度百分比（如 "42%"）；宿主可据此渲染「第 3 组 · 42%」等自算读数。
   */
  format?: (detail: ScrollbarScrollDetail) => string;
  /** 气泡所属轴（同时也是读数归属轴）：默认取启用轴中的 'y'（只有横向滚动条时回落 'x'）。
   *  只有该轴真的位移时气泡才显形——见 ScrollbarBubbleOptions 的说明 */
  axis?: 'x' | 'y';
  /** 气泡与滚动条之间的间距（px），默认 12；箭头由气泡朝滚动条一侧探出，占其中的一小段 */
  offset?: number;
  /** 观感档位：'sm' 紧凑读数（默认，对齐 v-tooltip 的 compact）/ 'md' 放大一档（字号与留白各进一级） */
  size?: ScrollbarBubbleSize;
  /** 读数变化时逐字符翻页（旧字上滑离场、新字自下滑入），复用 BaseRollingText 的对位算法与过渡类。
   *  默认开。变化密集时（如逐帧跳字的百分比读数）自动退化为直接换字——逐帧重启过渡只会变成持续抖动；
   *  长文案（读数本身比气泡宽、依赖省略号收敛）也建议关掉：翻页要求逐字成格，省略号的表现会打折。 */
  roll?: boolean;
  /** 闲置后自动淡出的毫秒数；false 表示不按自身节奏倒计时。
   *  默认跟随 autoHide（与滚动条同步淡出）；autoHide 为 false（拇指常显）时回落 1200ms。
   *  注意与拇指 autoHide 独立计时：气泡自身时限再长也活不过滚动条，拇指一隐藏即被一并收起 */
  hideDelay?: number | false;
  /** 仅在用户滚动手势（滚轮 / 拖拽拇指 / 轨道点击）引发的滚动中显示，
   *  过滤掉程序化 scrollTo、布局钳位、选中项 scrollIntoView 等非手势滚动；默认 false */
  onlyInteractive?: boolean;
}

/** 气泡观感档位：'sm' 紧凑读数（默认）/ 'md' 放大一档；两档在 vScrollbar.scss 里各有一条规则（.v-scrollbar-bubble--sm / --md） */
export type ScrollbarBubbleSize = 'sm' | 'md';

export type ScrollbarBinding = ScrollbarOptions | null | undefined;

/** v-scrollbar 滚动回调 onScroll 的事件详情：位置与各轴进度（0~1，无溢出时恒为 0） */
export interface ScrollbarScrollDetail {
  scrollTop: number;
  scrollLeft: number;
  /** 纵向最大可滚动量（scrollHeight - clientHeight，可能为 0） */
  maxScrollTop: number;
  /** 横向最大可滚动量（scrollWidth - clientWidth，可能为 0） */
  maxScrollLeft: number;
  /** 纵向滚动进度 0~1（无纵向溢出时恒 0） */
  progressY: number;
  /** 横向滚动进度 0~1（无横向溢出时恒 0） */
  progressX: number;
  /** 本次滚动是否由用户交互发起（最近一次用户手势落在 SCROLL_INTERACTIVE_WINDOW_MS 窗口内）：
   *  用户手势含宿主内 pointerdown / wheel、拇指拖拽、轨道点击与长按跟随（后两者持续补打点，
   *  故整个手势过程恒为 true）；false 表示布局钳位 / 程序化设位（如调整字号、内容增删、scrollTo），
   *  消费端可据此过滤掉非用户触发的滚动信号 */
  interactive: boolean;
}

/** 轴向修饰符：v-scrollbar.vertical / v-scrollbar.horizontal（x/y 为别名）；
 * `.no-track` 隐藏轨道只留拇指（拇指-only 模式） */
export type ScrollbarModifiers = 'vertical' | 'horizontal' | 'x' | 'y' | 'no-track' | (string & Record<never, never>);

/** 滚动气泡与滚动条之间的默认间距（px）；导出供测试从常量推导期望值 */
export const BUBBLE_OFFSET = 12;
/** 气泡指向箭头的边长（px，按档位取）：随气泡高度成比例——小气泡挂 12px 大箭头会盖住读数 */
export const BUBBLE_ARROW_SIZE: Record<ScrollbarBubbleSize, number> = { sm: 8, md: 10 };
/** 粗细方向上轨道/拇指距容器边缘的视觉偏移（px）；导出供测试从常量推导期望值 */
export const EDGE_OFFSET = 4;
/** 轨道与拇指行程的首尾留白（px）；导出供测试从常量推导期望值 */
export const END_INSET = 4;
