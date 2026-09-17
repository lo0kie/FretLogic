/**
 * 音频播放器**状态壳**（对外 API 与拆分前完全一致）：
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

/** 懒加载播放逻辑实现（见 audioPlayback.ts 文件头注释） */
const loadPlayback = () => import('./audioPlayback');

/** 和弦试听播放器：引擎与播放状态为模块级单例，多个组件共享 */
export function useAudioPlayer() {
  return {
    isPlaying,
    isScorePlaying,
    currentPlayingStepIndex,
    isSustaining,
    playChord: (chord: Chord) => loadPlayback().then(m => m.playChord(chord)),
    playCurrentChord: () => loadPlayback().then(m => m.playCurrentChord()),
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
    ) => loadPlayback().then(m => m.startScorePlayback(sequence, options)),
    pauseScorePlayback: () => loadPlayback().then(m => m.pauseScorePlayback()),
    stopScorePlayback: () => loadPlayback().then(m => m.stopScorePlayback()),
    disposeAudioEngine: () => loadPlayback().then(m => m.disposeAudioEngine()),
  };
}
