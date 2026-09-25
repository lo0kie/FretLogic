/**
 * 音频播放器**状态壳**（对外动作 API 与拆分前完全一致）：
 * - 播放状态 refs 是模块级单例，定义在本模块（多个组件/懒加载实现共享同一份）；
 * - 播放动作（扫弦/延音/乐谱序进调度）的完整实现在 audioPlayback.ts，经动态 import 懒加载，
 *   避免把 WebAudio 合成器引擎（synthEngine）拖进首屏闭包 —— 只有用户触发试听时才拉取。
 */
import { ref } from 'vue';

import type { Chord } from '@/domains/chord/types';
import type { ScoreChordStep } from '@/domains/score/model/chordSlots';

// 播放状态 refs 导出：懒加载实现模块（audioPlayback.ts）import 同一组单例读写
export const isPlaying = ref(false);
export const isScorePlaying = ref(false);
export const isSustaining = ref(false);
export const currentPlayingStepIndex = ref<number>(-1);

/**
 * 「动作已受理、播放状态尚未接管」：由本模块（随首屏加载）在**动作发起当刻**同步置位，
 * 懒加载动作结算后再复位。宿主 UI 据此立刻给出反馈（顶栏试听按钮即置灰并换成停止图标）。
 *
 * 为什么需要它：isPlaying / isSustaining 都由 audioPlayback 置位，而那个模块是动态 import 的 ——
 * 首次点击要等 chunk 下载 + 模块求值完成才翻转，此前按钮既不置灰也不换图标，整段等待看起来就像页面卡住。
 * 预取（preloadAudioPlayback）只能把这段窗口压小、压不到零（idle 回调尚未轮到，或弱网下 chunk 还没到）；
 * 把「已受理」这一步留在状态壳里，反馈才与 chunk 无关。
 */
export const isAudioPreparing = ref(false);

/** 懒加载播放逻辑实现（见 audioPlayback.ts 文件头注释） */
const loadPlayback = () => import('./audioPlayback');

/** 懒加载实现的模块类型（供 runPlayback 标注回调入参，避免在类型位写 import()） */
type PlaybackModule = Awaited<ReturnType<typeof loadPlayback>>;

/** 未结算的动作数：并发动作（试听与乐谱序进重叠、连点）不得互相顶掉这个标志 */
let pendingAudioActions = 0;

/**
 * 懒加载动作的统一入口：**先同步置「已受理」，再等 chunk 就绪并执行，最后无论成败都结算**。
 *
 * 置位必须发生在 loadPlayback() 之前 —— 那正是「反馈不依赖 chunk」的全部意义所在；而 isPlaying
 * 等真实播放状态只能等模块求值完才翻转，两者接力覆盖整段窗口（受理窗口在前，播放状态接手在后）。
 *
 * 只用于**点击类播放动作**（试听 / 乐谱序进）。两类动作刻意不走这里：
 * - `startChordSustain` / `stopChordSustain`：受理标志会驱动宿主按钮的禁用态，而按钮一禁用，
 *   ActionButton 的「禁用即中止长按」就当场补发 hold-end —— 持续发声刚起就被自己掐掉。
 *   长按路径的即时反馈因此只能来自真实状态（isSustaining），这是取舍不是遗漏。
 * - `disposeAudioEngine`：卸载与 HMR 的清理动作，没有对应的 UI 反馈窗口。
 */
const runPlayback = (action: (module: PlaybackModule) => void | Promise<void>): Promise<void> => {
  isAudioPreparing.value = true;
  pendingAudioActions += 1;
  const settle = (): void => {
    pendingAudioActions -= 1;
    if (pendingAudioActions === 0) isAudioPreparing.value = false;
  };
  return loadPlayback().then(action).finally(settle);
};

/**
 * 预取播放逻辑实现模块（只拉取不执行）：
 * 供宿主 UI 挂载 / 空闲时机调用，把 WebAudio 合成器链路的 chunk 下载
 * 提前到用户点击试听之前，消除首次点击的反馈死区。
 */
export const preloadAudioPlayback = (): Promise<unknown> => loadPlayback();

/** 和弦试听播放器：引擎与播放状态为模块级单例，多个组件共享 */
export function useAudioPlayer() {
  return {
    isPlaying,
    isScorePlaying,
    currentPlayingStepIndex,
    isSustaining,
    isAudioPreparing,
    playChord: (chord: Chord) => runPlayback(m => m.playChord(chord)),
    playCurrentChord: () => runPlayback(m => m.playCurrentChord()),
    startChordSustain: (chord: Chord) => loadPlayback().then(m => m.startChordSustain(chord)),
    stopChordSustain: () => loadPlayback().then(m => m.stopChordSustain()),
    startScorePlayback: (
      sequence: (ScoreChordStep | Chord)[],
      options?: {
        bpm?: number;
        beatsPerChord?: number;
        startIndex?: number;
        onStep?: (index: number) => void;
        loop?: boolean;
      }
    ) => runPlayback(m => m.startScorePlayback(sequence, options)),
    pauseScorePlayback: () => runPlayback(m => m.pauseScorePlayback()),
    stopScorePlayback: () => runPlayback(m => m.stopScorePlayback()),
    disposeAudioEngine: () => loadPlayback().then(m => m.disposeAudioEngine()),
  };
}
