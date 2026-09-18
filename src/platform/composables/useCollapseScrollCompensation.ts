import { onBeforeUnmount, watch } from 'vue';

import { COLLAPSE_SCROLL_COMPENSATION_MAX_MS } from '@/platform/utils/constants';
import { findScrollParent } from '@/platform/utils/dom';

import type { Ref } from 'vue';

/**
 * 收起时的滚动位置补偿：折叠体收缩会同时让**吸附头的钉住位置**与**滚动量上限**失真，
 * 两者都在收起这一刻接管，且必须按序执行（头先归位再读钳位门控——归位会改 scrollTop）。
 *
 * ① 头归位（realignStuckHead）：头是段内吸附，展开时钉在吸附线上；段一塌缩，它的静态位置就落到
 *    视窗上方，于是「刚点的那个标题」凭空消失（下意识里它还该钉在原处）。把段顶一次性对齐到头
 *    此刻所钉的位置即可，而且**必须一次到位**：对齐后该段被滚过的距离归零，收起过渡里
 *    「段底 ≥ 吸附线」恒成立，头全程纹丝不动。任何渐进式补偿都只会让头先被顶出去再滑回来，
 *    等过渡结束再补则是一次可见的二次位移——两者都是「抽动」。
 *
 *    归位改的是 scrollTop，视窗整体随之下移「滚进本段的深度」那段距离——用户正看着的行会被换成
 *    段首那几行，观感是「收起前先跳回段首」。故归位同时把**折叠体内容**上移同样的距离：段盒下移
 *    一段位移、内容在盒内上移同一段，两者正好抵消 → 视窗里的内容一动不动，只有折叠体从下沿折起。
 *    位移量直接取吸附判据里那个分离量（头与段顶的距离），未吸附时恒为 0。
 *
 * ② 钳位补偿（下方 tick）：折叠体收缩会同步缩小祖先滚动容器的可滚动量。浏览器的滚动钳位在过渡
 *    期间的每一帧布局后同步执行——只要 scrollTop 越界就瞬时拉回，没有动画，被压缩进 height 过渡
 *    曲线的高速中段，感知为闪现。
 *    原方案「预判收起后上限 + scrollTo(smooth)」防不住过渡过程中的逐帧钳位：原生平滑滚动与 CSS
 *    height 过渡两条时间线互不感知，smooth 启动阶段缓动位移极少，强制钳位总是先一步介入。
 *    现方案：rAF 逐帧读取实时 scrollHeight（随 height 过渡逐帧变化），每一帧抢先于浏览器钳位把
 *    scrollTop 收紧到当前上限——补偿与高度过渡同源同步，逐帧微调视觉上平滑跟随收起节奏，
 *    钳位条件（scrollTop + clientHeight > scrollHeight）永远没有成立的机会。
 *
 * ① 是「吸附」的收尾动作，但它只读自己这一段的几何（段与头的相对位置），由几何本身保证：
 * 头没吸附时该差值为 0、自然不动作；因此放在折叠组件内不会替宿主假设它是吸附的，
 * 未吸附的折叠（弹层、表单里的折叠段）走完全同一条路径得到零副作用。
 *
 * 放在平台层而不是折叠组件内：滚动容器的发现与吸附头口径都是宿主环境相关的事，组件只提供
 * 「折叠头 / 折叠体 / 折叠体内容 三个元素 + 展开态」；容器可由业务显式注入（业务本来就知道
 * 自己的滚动容器），未注入时才沿祖先链查找。
 */
export interface UseCollapseScrollCompensationOptions {
  /** 折叠体元素（height 过渡挂在它上面，同时是内容的裁剪盒） */
  bodyRef: Ref<HTMLElement | null>;
  /** 折叠体**内容**元素（折叠体的子元素）：内容上移的位移目标，见① */
  contentRef: Ref<HTMLElement | null>;
  /** 折叠头元素（吸附时它的位置即吸附线，作为①的归位基准） */
  headRef: Ref<HTMLElement | null>;
  /** 展开态 */
  expanded: Ref<boolean>;
  /** 业务显式注入的滚动容器；缺省时沿祖先链查找 */
  containerRef?: Ref<HTMLElement | null>;
}

/** 吸附/顶出的判定容差（px）：亚像素舍入不该被当作一次吸附 */
const STICK_TOLERANCE_PX = 1;

export function useCollapseScrollCompensation(options: UseCollapseScrollCompensationOptions) {
  let rafId: number | null = null;
  let cleanup: (() => void) | null = null;

  const stop = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    cleanup?.();
    cleanup = null;
  };

  const resolveContainer = (): HTMLElement | null => {
    const injected = options.containerRef?.value;
    if (injected) return injected;
    const body = options.bodyRef.value;
    return body ? findScrollParent(body) : null;
  };

  /**
   * ① 把吸附中的头按回吸附线，同时让折叠体内容留在原处（原理见文件头注释）。
   *
   * 判定全用几何、不引入「谁在吸附」的集合：头是 sticky 时「被顶起」等价于**段的静态上沿低于头
   * 自身的位置**——吸附偏移一旦生效两者必然分离；未吸附时两者重合、差值为 0 自然不动。
   * 基准取头自身而非「容器上沿 + 间隙」：吸附间隙由业务经 class 下发（侧栏为负值，用来吃掉容器
   * padding 带），这里再复算一份必然与它漂移。
   *
   * 段底已升到头下方（用户早滚过该段）时不介入：那已不属于「头被吸附后消失在视窗上方」，
   * 把头拉回来是「跳回段首」，是另一回事。
   *
   * 归位（scrollTop）与内容上移（transform）必须成对下发：只归位是把视窗整体往下带 depth 像素，
   * 用户正看着的行被换成段首那几行；只上移则头还留在视窗外。位移目标取折叠体的**内容子元素**
   * 而非折叠体本身——折叠体是随 height 过渡收缩的裁剪盒，动它会连带把裁剪边界上移，
   * 折起过程中段底与下一段之间会露出一条 depth 像素的空白带。
   */
  const realignStuckHead = (container: HTMLElement, head: HTMLElement, content: HTMLElement | null) => {
    // 段的静态上沿即头的静态位置：头是 sticky，其包含块就是折叠段本体
    const section = head.closest<HTMLElement>('[data-collapse]');
    if (!section) return;
    const sectionRect = section.getBoundingClientRect();
    const headRect = head.getBoundingClientRect();
    // 段顶落在吸附线上方多少 = 用户滚进本段多深；未吸附时两者重合，取不到正值
    const depth = headRect.top - sectionRect.top;
    if (depth < STICK_TOLERANCE_PX) return;
    if (sectionRect.bottom <= headRect.bottom + STICK_TOLERANCE_PX) return;
    container.scrollTop -= depth;
    // 内容元素取不到时（理论不可达）退化为「只归位」：头仍在吸附线上，但视窗会跳回段首
    if (content) content.style.transform = `translateY(${-depth}px)`;
  };

  watch(options.expanded, (open, prevOpen) => {
    // 展开方向无需补偿；收起途中被重新展开时停掉仍在运行的上一轮循环
    if (!prevOpen || open) {
      stop();
      // 撤销上一轮收起留下的内容位移：此刻折叠体高度为 0、内容本就不显示，撤销看不见；
      // 等它重新长出来时位置已经是对的（内容位移不参与布局，也不会影响高度重测）
      options.contentRef.value?.style.removeProperty('transform');
      return;
    }
    const container = resolveContainer();
    const body = options.bodyRef.value;
    if (!container || !body) return;

    // ① 头先归位（会改 scrollTop，故必须先于下面的门控读数）
    const head = options.headRef.value;
    if (head) realignStuckHead(container, head, options.contentRef.value);

    // ② 钳位补偿的门控与循环
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollTop <= 0) return;
    // 预判量仅用作「是否需要补偿」的门控（watch 先于渲染冲刷，量到的是收起前状态）：
    // 收起后的可滚动上限若仍不小于当前 scrollTop，全程不会触发钳位，无需启动逐帧循环
    const maxScrollAfter = Math.max(0, scrollHeight - body.offsetHeight - clientHeight);
    if (scrollTop <= maxScrollAfter) return;

    stop(); // 兜底：清掉可能残留的上一轮循环

    // height 实际过渡的元素就是折叠体本体（transition-[height] 挂在其上），在其上监听收尾；
    // 同元素若有其他属性过渡（opacity 等）会多次触发 transitionend，按 propertyName 过滤
    const handleTransitionEnd = (e: TransitionEvent) => {
      if (e.target !== body || e.propertyName !== 'height') return;
      // 末帧布局与最后一次 rAF 之间可能还差 ≤1px，收尾补一次钳位再停
      const liveMax = Math.max(0, container.scrollHeight - container.clientHeight);
      if (container.scrollTop > liveMax) container.scrollTop = liveMax;
      stop();
    };
    body.addEventListener('transitionend', handleTransitionEnd);
    cleanup = () => body.removeEventListener('transitionend', handleTransitionEnd);

    const startedAt = performance.now();
    const tick = () => {
      rafId = null;
      const liveMax = Math.max(0, container.scrollHeight - container.clientHeight);
      if (container.scrollTop > liveMax) container.scrollTop = liveMax;
      // 兜底上限：过渡被禁用（如 prefers-reduced-motion）时 transitionend 永不触发，循环不能无限空转
      if (performance.now() - startedAt >= COLLAPSE_SCROLL_COMPENSATION_MAX_MS) {
        stop();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  });

  onBeforeUnmount(stop);
}
