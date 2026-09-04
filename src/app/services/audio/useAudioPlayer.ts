import { ref } from 'vue';

import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import type { Chord } from '@/domains/chord/types';
import type { ScoreChordStep } from '@/domains/score/model/chordSlots';

import { AUDIO_CONFIG } from './constants';
import { disposeSynthEngine, ensureToneReady, releaseSynthNotes, triggerChordStrum } from './synthEngine';

const isPlaying = ref(false);
const isScorePlaying = ref(false);
const currentPlayingStepIndex = ref<number>(-1);

let playTimer: ReturnType<typeof setTimeout> | null = null;
let scorePlaybackTimer: ReturnType<typeof setTimeout> | null = null;

let activeSequence: (ScoreChordStep | Chord)[] = [];
let activeStepIndex = 0;
let activeBpm = 100;
let activeBeatsPerChord = 4;
let activeOnStepCallback: ((index: number) => void) | undefined = undefined;

/** 和弦试听播放器：引擎与播放状态为模块级单例，多个组件共享 */
export function useAudioPlayer() {
  const editorStore = useChordEditorStore();

  /** 播放任意指定和弦实体 */
  const playChord = async (chord: Chord) => {
    if (isPlaying.value) return;
    isPlaying.value = true;
    try {
      const tone = await ensureToneReady();
      if (!tone) {
        isPlaying.value = false;
        return;
      }
      releaseSynthNotes();
      const strumDuration = triggerChordStrum(chord);
      if (strumDuration === 0) {
        isPlaying.value = false;
        return;
      }
      if (playTimer) clearTimeout(playTimer);
      playTimer = setTimeout(
        () => {
          isPlaying.value = false;
        },
        (strumDuration + AUDIO_CONFIG.AUDIO_RELEASE_TAIL) * 1000
      );
    } catch (e) {
      console.error('播放和弦失败:', e);
      isPlaying.value = false;
    }
  };

  /** 从低音到高音扫弦式播放当前草稿和弦，力度/时间带随机 humanize，尾部释放完成后自动复位状态 */
  const playCurrentChord = async () => {
    if (isPlaying.value) return;
    isPlaying.value = true;

    try {
      const tone = await ensureToneReady();
      if (!tone) {
        isPlaying.value = false;
        return;
      }

      releaseSynthNotes();
      const strumDuration = triggerChordStrum(editorStore.draftChord);

      if (strumDuration === 0) {
        isPlaying.value = false;
        return;
      }

      if (playTimer) clearTimeout(playTimer);
      playTimer = setTimeout(
        () => {
          isPlaying.value = false;
        },
        (strumDuration + AUDIO_CONFIG.AUDIO_RELEASE_TAIL) * 1000
      );
    } catch (error) {
      console.error('和弦音频引擎调度失败:', error);
      isPlaying.value = false;
    }
  };

  const playNextScoreStep = () => {
    if (!isScorePlaying.value) return;
    if (activeStepIndex >= activeSequence.length) {
      stopScorePlayback();
      return;
    }

    const currentItem = activeSequence[activeStepIndex]!;
    const chord = 'chord' in currentItem ? currentItem.chord : currentItem;

    currentPlayingStepIndex.value = activeStepIndex;
    activeOnStepCallback?.(activeStepIndex);

    releaseSynthNotes();
    triggerChordStrum(chord);

    activeStepIndex++;
    const stepDurationMs = (60 / activeBpm) * activeBeatsPerChord * 1000;
    scorePlaybackTimer = setTimeout(playNextScoreStep, stepDurationMs);
  };

  /** 开始全曲和弦序进播放 */
  const startScorePlayback = async (
    sequence: (ScoreChordStep | Chord)[],
    options?: {
      bpm?: number;
      beatsPerChord?: number;
      startIndex?: number;
      onStep?: (index: number) => void;
    }
  ) => {
    if (!sequence || sequence.length === 0) return;
    const tone = await ensureToneReady();
    if (!tone) return;

    activeSequence = sequence;
    activeStepIndex = options?.startIndex ?? 0;
    activeBpm = options?.bpm ?? 100;
    activeBeatsPerChord = options?.beatsPerChord ?? 4;
    activeOnStepCallback = options?.onStep;

    isScorePlaying.value = true;
    if (scorePlaybackTimer) clearTimeout(scorePlaybackTimer);
    playNextScoreStep();
  };

  /** 暂停乐谱播放 */
  const pauseScorePlayback = () => {
    isScorePlaying.value = false;
    if (scorePlaybackTimer) {
      clearTimeout(scorePlaybackTimer);
      scorePlaybackTimer = null;
    }
    releaseSynthNotes();
  };

  /** 停止乐谱播放并复位 */
  const stopScorePlayback = () => {
    isScorePlaying.value = false;
    currentPlayingStepIndex.value = -1;
    activeStepIndex = 0;
    if (scorePlaybackTimer) {
      clearTimeout(scorePlaybackTimer);
      scorePlaybackTimer = null;
    }
    releaseSynthNotes();
  };

  /** 销毁音频引擎的全部节点与定时器（HMR/卸载时防泄漏） */
  const disposeAudioEngine = () => {
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
    }
    if (scorePlaybackTimer) {
      clearTimeout(scorePlaybackTimer);
      scorePlaybackTimer = null;
    }
    disposeSynthEngine();
    isPlaying.value = false;
    isScorePlaying.value = false;
    currentPlayingStepIndex.value = -1;
  };

  return {
    isPlaying,
    isScorePlaying,
    currentPlayingStepIndex,
    playChord,
    playCurrentChord,
    startScorePlayback,
    pauseScorePlayback,
    stopScorePlayback,
    disposeAudioEngine,
  };
}
