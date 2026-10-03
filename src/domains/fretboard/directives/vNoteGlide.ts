/**
 * v-note-glide 指令：让一组「一弦一音符」的元素沿琴弦滑到新位置，**按位移量**错峰。
 *
 * 【为什么不是「弦序 × 固定间隔」那种假交错】两件事：
 * ① 要读出来的信息是「哪几根弦真的动了、动了多远」—— 固定弦序会让第 6 弦永远等 90ms，哪怕它只挪
 *    一品，真正变化的那几根反而被序号噪声冲淡；
 * ② 连点两次和弦时，第二次必须**从当前帧重新起手**（取消在途补间、以此刻的插值位置为起点），
 *    而不是把目标值换掉、延迟重新计一遍。
 *
 * 【契约】绑定值是**每弦的目标位置**（与子元素同序的 `{ x, y }[]`，单位 px）：
 * - 挂载时直接就位，不播动画（首帧不是「移动」）；
 * - 更新时只对**真的动了**的子元素（Δ ≥ 0.5px）起补间，并按位移量从大到小错峰；
 * - **目标值逐值没变的重渲染一律不动在途补间**（见 `updated` 里那条早退）：宿主随 hover / 拖拽逐帧
 *   重渲染，若每次重渲染都重起，音符会在落位前被反复拉回快段，观感就是「落位前卡一下」；
 * - **打断在途补间的那种重定向，时长按距离缩短**（全新的一次仍取满时长）：否则拖拽段（只吃到缓动
 *   起步段，速度 ≈ 4× 平均）与落位段（跑完整条曲线，速度 ≈ 1×）之间会有一次几倍的速度骤降，
 *   读起来就是「落位前突然变慢」。见 `updated` 里 `duration` 的说明；
 * - 曲线与时长由调用方给定：离散变化走 `--bezier-sidebar`（从 `:root` 的计算样式**现读**再编译），
 *   拖拽中的重定向走 `linear`（理由见 updated 里 ease 的说明），JS 侧不新增
 *   cubic-bezier 字面量；**不要换弹簧** —— 这类动画是沿弦滑到目标品位，过冲会先越过一格再退回，
 *   观感上像按错了品位；
 * - 减弱动效（prefers-reduced-motion）下直接就位，不播过程。
 *
 * ⚠️ 位移**相同**的那一批不参与错峰：调用方里存在「整块骨架位移」这种所有元素同幅移动的场景，
 * 而与之配对的反向抵消元素必须与容器**逐帧同步**（两边同长同曲线时恒等相消）—— 错峰会让那些元素
 * 跟着容器漂。判据取「各元素位移是否一致」，与调用方是谁无关。
 */
import { animate } from 'animejs';

import { isClient } from '@/platform/utils/common';
import { compileEasing, prefersReducedMotion } from '@/platform/utils/motion';

import type { JSAnimation } from 'animejs';
import type { Directive } from 'vue';

/** 目标位置（px） */
export interface NoteGlideTarget {
  x: number;
  y: number;
}

export type NoteGlideBinding = NoteGlideTarget[] | null | undefined;

/** 单段滑行时长（ms）：与调用方原来的 CSS 过渡同档（`$duration-base`） */
const NOTE_GLIDE_MS = 180;
/** 重定向补间的时长下限（ms）：再短就会被压进一两帧，读成「瞬跳」而不是「落位」 */
const NOTE_GLIDE_MIN_MS = 60;
/** 视为「没动」的阈值（px）：小于它的位移不参与补间，也不占错峰位 */
const NOTE_GLIDE_EPSILON_PX = 0.5;
/** 相邻元素起手的间隔（ms） */
const NOTE_GLIDE_GAP_MS = 18;

/** 各元素当前渲染位置：补间起点取它，故打断重起时天然从当前帧续上 */
const positions = new WeakMap<Element, NoteGlideTarget>();
/** 在途补间（按宿主记）：下一次位移先取消它 */
const anims = new WeakMap<Element, JSAnimation>();
/**
 * 上一次**真正起过补间**的目标（按宿主记）。
 *
 * 用途只有一个：认出「值没变的重渲染」并原样跳过（见 `updated` 里那条早退）。
 * 只有起过补间才登记 —— 若把「算出来没动」的那次也记上，登记的就成了「本应到达的位置」而不是
 * 「在途补间正奔向的位置」，早退会把一份没人执行的目标当成已受理。
 */
const lastTargets = new WeakMap<Element, NoteGlideTarget[]>();

/** 单元素位移描述：补间对象就是它自己（`x` / `y` 逐帧被改，再由 onUpdate 写到宿主上） */
interface GlideMove extends NoteGlideTarget {
  el: Element;
  toX: number;
  toY: number;
  delta: number;
}

const writePosition = (el: Element, x: number, y: number): void => {
  (el as SVGGElement).style.transform = `translate(${x}px, ${y}px)`;
  positions.set(el, { x, y });
};

/**
 * 令牌曲线的编译与缓存。
 *
 * 令牌的唯一定义处是 tokens.scss 的 `:root`，故从 `:root` 的计算样式现读（与宿主是否在文档树里无关），
 * 再编译成三次贝塞尔求值函数；读不到或编译失败就退化为 `linear`。
 *
 * 缓存的是**编译结果**：`compileEasing` 每次都新建一个贝塞尔求值函数，而这条读法在换和弦时每次都要跑，
 * 逐次重编译是白费。键取原始令牌串，令牌不变就一直复用。
 */
let cachedEaseRaw: string | null = null;
let cachedEase: ((t: number) => number) | string = 'linear';
const readGlideEase = (): ((t: number) => number) | string => {
  if (!isClient) return 'linear';
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--bezier-sidebar').trim();
  if (raw === cachedEaseRaw) return cachedEase;
  cachedEaseRaw = raw;
  cachedEase = raw ? (compileEasing(raw) ?? 'linear') : 'linear';
  return cachedEase;
};

/**
 * 给还没有起点记录的子元素补写一次初始位置（运行时新增的子元素，`mounted` 时它还不存在）。
 * 不补的话它没有 transform、会被画在 SVG (0,0)，且因「无起点」永不进 moves，后续也修不回来。
 *
 * 必须与「目标是否变化」解耦、独立于下面那条早退执行：弦数变化但目标值恰好没变的重渲染
 * （例如换调弦后各弦品位未变）同样会新增子元素，漏补就是新弦的音符停在原点。
 */
const seedMissingPositions = (el: Element, targets: NoteGlideTarget[]): void => {
  const children = Array.from(el.children);
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    const target = targets[i];
    if (target && !positions.has(child)) writePosition(child, target.x, target.y);
  }
};

/** 两组目标是否逐值相同（含长度）。判等用严格相等而不是 epsilon：
 *  目标是由同一批几何输入现算的，输入没变时逐位相同；差一点点就说明真的动了，该走补间。 */
const isSameTargets = (prev: readonly NoteGlideTarget[] | undefined, next: readonly NoteGlideTarget[]): boolean => {
  if (!prev || prev.length !== next.length) return false;
  for (let i = 0; i < next.length; i++) {
    const a = prev[i]!;
    const b = next[i]!;
    if (a.x !== b.x || a.y !== b.y) return false;
  }

  return true;
};

/** 收集这一轮真的需要动的元素（没动的不参与，也不占错峰位） */
const collectMoves = (el: Element, targets: NoteGlideTarget[]): GlideMove[] => {
  const moves: GlideMove[] = [];
  Array.from(el.children).forEach((child, i) => {
    const target = targets[i];
    if (!target) return;
    const current = positions.get(child);
    // 起点由 seedMissingPositions 补齐，这里再判一次只是防御（两处都幂等）
    if (!current) return;
    const delta = Math.abs(target.x - current.x) + Math.abs(target.y - current.y);
    if (delta < NOTE_GLIDE_EPSILON_PX) return;
    moves.push({ el: child, x: current.x, y: current.y, toX: target.x, toY: target.y, delta });
  });
  return moves;
};

/**
 * 满时长对应的「一整格滑行」距离基准（px）：按宿主记，**只增不减**。
 *
 * 用来把「打断在途补间的那种重定向」的时长按距离缩短（见 updated）。取「本宿主上出现过的最大
 * 位移」当基准，是因为它与调用方给的满时长天然对齐（一次换和弦的最大位移就是满时长该覆盖的距离），
 * 又不必让指令 import 任何几何模型 —— 指令不知道品距，也不该知道（见文件头的分层说明）。
 */
const glideReference = new WeakMap<Element, number>();

export const vNoteGlide: Directive<SVGGElement, NoteGlideBinding> = {
  mounted(el, binding) {
    const targets = binding.value ?? [];
    Array.from(el.children).forEach((child, i) => {
      const target = targets[i];
      if (target) writePosition(child, target.x, target.y);
    });
  },

  updated(el, binding) {
    const targets = binding.value ?? [];
    // 先补齐运行时新增子元素的起点（与目标是否变化无关，见 seedMissingPositions）
    seedMissingPositions(el, targets);

    // 目标与上一次**起过补间**的那一份逐值相同 ⇒ 在途补间本来就是奔它去的，绝不能掐掉重起。
    //
    // 为什么必须有这一条：本组件（FretboardSvg）随 hover / 拖拽**逐帧重渲染**，而指令的 `updated`
    // 在每次重渲染都会跑 —— 不看值就重起，等于把在途那一段从当前帧按满时长（180ms）重新加速一遍。
    // 曲线 --bezier-sidebar 是 cubic-bezier(0.2, 0.8, 0.2, 1)：起步极快、尾段极慢，于是这一下在
    // **落位前几帧**最显眼 —— 音符眼看要停稳，又被拉回快段重走一遍，观感就是「落位前卡一下」。
    // 手指停在同一品上时 hover 仍在动，这种重渲染每帧都有，故音符会反复被拽回去、迟迟不落位。
    if (isSameTargets(lastTargets.get(el), targets)) return;

    const moves = collectMoves(el, targets);
    if (moves.length === 0) return;

    // 是否**打断**在途补间：只有拖拽中的重定向会命中，换和弦（上一段已播完）不会
    const retarget = anims.get(el) !== undefined;

    // 取消在途补间：位置已逐帧写回 positions，故下面这批从当前帧起手
    anims.get(el)?.cancel();
    // 登记「在途补间正奔向的目标」：只在这一刻登记 —— 上面两处早退都没起补间，不该被记成已受理
    lastTargets.set(
      el,
      targets.map(target => ({ x: target.x, y: target.y }))
    );

    if (prefersReducedMotion()) {
      moves.forEach(move => writePosition(move.el, move.toX, move.toY));
      return;
    }

    // 距离基准（只增不减）：本宿主上出现过的最大位移
    const maxDelta = moves.reduce((acc, move) => Math.max(acc, move.delta), 0);
    const reference = Math.max(glideReference.get(el) ?? 0, maxDelta);
    glideReference.set(el, reference);

    /**
     * 时长：**重定向按距离缩短，全新的一次保持满时长**。
     *
     * 为什么必须按距离缩短：时长此前是定值 180ms，与走多远无关，于是两段的**速度**天差地别。
     * 拖拽时每一帧都在重定向，而每次重定向都从当前帧重放曲线 —— 音符只吃到缓动最陡的起步段，
     * 实测每帧推进 `ease'(0) · 帧时 / 时长 · 剩余距离`，即每帧走掉剩余距离的一大半，
     * 速度 ≈ 4× 平均；一旦松手、不再重定向，那一次补间要跑完整条曲线，速度回落到平均 1×。
     * 两段之间就是一次**几倍的速度骤降** —— 用户描述的「落位前突然变慢」正是它。
     *
     * 按距离缩短之后，`位移 / 时长` 在每一轮里都是同一个比值（都等于 `基准 / 满时长`），
     * 于是「拖拽中」与「落位那一下」的每帧推进量相同，两段速度连续，落位读起来是自然的减速。
     * 下限 `NOTE_GLIDE_MIN_MS` 兜住极小位移：再短就会被压进一两帧，读成「瞬跳」而不是「落位」。
     */
    const duration = retarget
      ? Math.min(NOTE_GLIDE_MS, Math.max(NOTE_GLIDE_MIN_MS, Math.round((NOTE_GLIDE_MS * maxDelta) / reference)))
      : NOTE_GLIDE_MS;

    // 位移一致的整块挪动不参与错峰（见文件头那条警告）；否则按位移量从大到小起手。
    const uniform = moves.every(move => Math.abs(move.delta - moves[0]!.delta) < NOTE_GLIDE_EPSILON_PX);
    // **重定向（拖拽中的连续重定目标）同样不参与错峰**：错峰是给「一次离散变化」用的读法 ——
    // 让人看清哪几根弦动了、动了多远（文件头第 ① 条）。而拖拽是连续跟手：每一帧都重定目标、
    // 每一次都按当帧的剩余位移重排名次，而剩余位移又随上一帧的推进量变化，名次于是逐帧抖动，
    // 同一根弦这一帧排第 0（立即起手）、下一帧可能排到第 5（等 90ms）—— 单根弦的位移因此变成
    // 「走一大步 → 停几帧 → 再走一大步」的顿挫。落位那一下尤其明显：剩余位移最小的那根弦名次
    // 最靠后，眼看别的弦都停了，它还要先等一格错峰才开始动，读起来正是「突然变慢」。
    const stagger = !uniform && !retarget;
    const order = moves.map((_, i) => i).sort((a, b) => moves[b]!.delta - moves[a]!.delta);
    // 下标 → 错峰位次（order 的反查表）。animejs 4.x 的 `stagger(ms, { from: [...] })` 只在
    // grid 模式读数组形式的 from，普通数组是**静默空操作**（延迟退化成按子元素序）——正是文件头
    // 第 ① 条批判的「按弦序错峰」。故这里改用 delay 函数自行换算位次。
    const orderRank = new Map(order.map((moveIndex, rank) => [moveIndex, rank] as const));

    const anim = animate(moves, {
      // 逐元素给目标：第一个参数是补间对象本身（此处不用），第二个是它在 moves 里的下标。
      // anime 的函数值签名不带参数类型：第一个必须显式标（否则隐式 any），第二个靠默认值推成 number。
      x: (_move: unknown, i = 0) => moves[i]!.toX,
      y: (_move: unknown, i = 0) => moves[i]!.toY,
      duration,
      delay: stagger ? (_move: unknown, i = 0) => (orderRank.get(i) ?? 0) * NOTE_GLIDE_GAP_MS : 0,
      // 曲线分两档，判据是「这次是不是在跟手」：
      // - 离散变化（换和弦，上一段已播完）走令牌曲线：即刻起步 + 单调减速，落位有减速感；
      // - 重定向（拖拽中，上一段还没播完）走 **linear**。理由是实测出来的：目标是**逐品跳变**的，
      //   而减速曲线每次重起都把距离的一大半压进第一帧（实测单格 25px 有 54% 落在首帧），随后
      //   尾段几乎不动；下一个品位的跳变到来时又从「几乎不动」骤然回到「一大跳」—— 逐帧位移于是
      //   变成 `13.6 → 5.2 → 2.6 → 1.5 → 0.9 → 0.5 → 0.35 → 6.8 → 7.8` 的**锯齿**（峰谷比 22×），
      //   观感就是「整排整排切换时一顿一顿」。线性下每帧推进量恒定（实测 2.1~3.5，峰谷比 1.7×），
      //   音符与手指同速跟手；落位那一下的剩余距离已被跟手压得很小，线性收尾看不出突兀。
      ease: retarget ? 'linear' : readGlideEase(),
      onUpdate: () => moves.forEach(move => writePosition(move.el, move.x, move.y)),
      onComplete: () => {
        moves.forEach(move => writePosition(move.el, move.toX, move.toY));
        if (anims.get(el) === anim) anims.delete(el);
      },
    });
    anims.set(el, anim);
  },

  unmounted(el) {
    anims.get(el)?.cancel();
    anims.delete(el);
    // 与 anims 一起清：元素被复用再挂载时，残留的「上次目标」会让第一次 updated 误判成
    // 「值没变」而跳过（虽然 mounted 已把位置写到同一处，但留着这份跨实例状态没有理由）
    lastTargets.delete(el);
    glideReference.delete(el);
  },
};
