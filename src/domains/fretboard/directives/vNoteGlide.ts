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
 * - 曲线与时长由调用方给定：`--bezier-sidebar` 从宿主的计算样式**现读**再编译，JS 侧不新增
 *   cubic-bezier 字面量；**不要换弹簧** —— 这类动画是沿弦滑到目标品位，过冲会先越过一格再退回，
 *   观感上像按错了品位；
 * - 减弱动效（prefers-reduced-motion）下直接就位，不播过程。
 *
 * ⚠️ 位移**相同**的那一批不参与错峰：调用方里存在「整块骨架位移」这种所有元素同幅移动的场景，
 * 而与之配对的反向抵消元素必须与容器**逐帧同步**（两边同长同曲线时恒等相消）—— 错峰会让那些元素
 * 跟着容器漂。判据取「各元素位移是否一致」，与调用方是谁无关。
 */
import { animate, stagger } from 'animejs';

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
/** 视为「没动」的阈值（px）：小于它的位移不参与补间，也不占错峰位 */
const NOTE_GLIDE_EPSILON_PX = 0.5;
/** 相邻元素起手的间隔（ms） */
const NOTE_GLIDE_GAP_MS = 18;

/** 各元素当前渲染位置：补间起点取它，故打断重起时天然从当前帧续上 */
const positions = new WeakMap<Element, NoteGlideTarget>();
/** 在途补间（按宿主记）：下一次位移先取消它 */
const anims = new WeakMap<Element, JSAnimation>();

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

/** 从宿主计算样式里现读曲线令牌并编译（读不到就退化为线性） */
const readGlideEase = (el: Element): ((t: number) => number) | string => {
  const raw = getComputedStyle(el).getPropertyValue('--bezier-sidebar').trim();
  return raw ? (compileEasing(raw) ?? 'linear') : 'linear';
};

/** 收集这一轮真的需要动的元素（没动的不参与，也不占错峰位） */
const collectMoves = (el: Element, targets: NoteGlideTarget[]): GlideMove[] => {
  const moves: GlideMove[] = [];
  Array.from(el.children).forEach((child, i) => {
    const target = targets[i];
    const current = positions.get(child);
    if (!target || !current) return;
    const delta = Math.abs(target.x - current.x) + Math.abs(target.y - current.y);
    if (delta < NOTE_GLIDE_EPSILON_PX) return;
    moves.push({ el: child, x: current.x, y: current.y, toX: target.x, toY: target.y, delta });
  });
  return moves;
};

export const vNoteGlide: Directive<SVGGElement, NoteGlideBinding> = {
  mounted(el, binding) {
    const targets = binding.value ?? [];
    Array.from(el.children).forEach((child, i) => {
      const target = targets[i];
      if (target) writePosition(child, target.x, target.y);
    });
  },

  updated(el, binding) {
    const moves = collectMoves(el, binding.value ?? []);
    if (moves.length === 0) return;

    // 取消在途补间：位置已逐帧写回 positions，故下面这批从当前帧起手
    anims.get(el)?.cancel();

    if (prefersReducedMotion()) {
      moves.forEach(move => writePosition(move.el, move.toX, move.toY));
      return;
    }

    // 位移一致的整块挪动不参与错峰（见文件头那条警告）；否则按位移量从大到小起手
    const uniform = moves.every(move => Math.abs(move.delta - moves[0]!.delta) < NOTE_GLIDE_EPSILON_PX);
    const order = moves.map((_, i) => i).sort((a, b) => moves[b]!.delta - moves[a]!.delta);

    const anim = animate(moves, {
      // 逐元素给目标：第一个参数是补间对象本身（此处不用），第二个是它在 moves 里的下标。
      // anime 的函数值签名不带参数类型：第一个必须显式标（否则隐式 any），第二个靠默认值推成 number。
      x: (_move: unknown, i = 0) => moves[i]!.toX,
      y: (_move: unknown, i = 0) => moves[i]!.toY,
      duration: NOTE_GLIDE_MS,
      delay: uniform ? 0 : stagger(NOTE_GLIDE_GAP_MS, { from: order, start: 0 }),
      ease: readGlideEase(el),
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
  },
};
