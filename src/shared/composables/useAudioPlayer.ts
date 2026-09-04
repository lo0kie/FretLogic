import { ref } from 'vue';

import type * as Tone from 'tone';

import { calcNoteMidi, getActiveBaseStrings, Tuning } from '@/services/music/theory';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import type { Chord } from '@/types';
import { AUDIO_CONFIG } from '@/utils/core/constants';
import type { ScoreChordStep } from '@/utils/score/chordSlots';

const isPlaying = ref(false);
const isScorePlaying = ref(false);
const currentPlayingStepIndex = ref<number>(-1);

let isEngineInitialized = false;
let initPromise: Promise<void> | null = null;
let guitarSynth: Tone.PolySynth | null = null;
let reverbNode: Tone.Reverb | null = null;
let compressorNode: Tone.Compressor | null = null;
let playTimer: ReturnType<typeof setTimeout> | null = null;
let scorePlaybackTimer: ReturnType<typeof setTimeout> | null = null;
let ToneModule: typeof Tone | null = null;

let activeSequence: (ScoreChordStep | Chord)[] = [];
let activeStepIndex = 0;
let activeBpm = 100;
let activeBeatsPerChord = 4;
let activeOnStepCallback: ((index: number) => void) | undefined = undefined;

const MIDI_TO_FREQ_CACHE = new Map<number, number>();

/** MIDI 号转频率，带缓存避免重复换算 */
const getFrequencyFromMidi = (midiNote: number, toneInstance: typeof Tone): number => {
  let freq = MIDI_TO_FREQ_CACHE.get(midiNote);
  if (freq === undefined) {
    freq = toneInstance.Frequency(midiNote, 'midi').toFrequency();
    MIDI_TO_FREQ_CACHE.set(midiNote, freq);
  }
  return freq;
};

/** 懒加载 tone 并构建吉他合成器链（合成器→压缩→混响→输出）；并发调用共享同一个初始化 Promise */
const initAudioEngine = async () => {
  if (isEngineInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!ToneModule) {
      ToneModule = await import('tone');
    }

    reverbNode = new ToneModule.Reverb({
      decay: AUDIO_CONFIG.REVERB_DURATION,
      wet: AUDIO_CONFIG.REVERB_WET_GAIN,
    });

    await reverbNode.generate();

    compressorNode = new ToneModule.Compressor({
      threshold: AUDIO_CONFIG.COMPRESSOR_THRESHOLD,
      knee: AUDIO_CONFIG.COMPRESSOR_KNEE,
      ratio: AUDIO_CONFIG.COMPRESSOR_RATIO,
      attack: AUDIO_CONFIG.COMPRESSOR_ATTACK,
      release: AUDIO_CONFIG.COMPRESSOR_RELEASE,
    });

    guitarSynth = new ToneModule.PolySynth(ToneModule.FMSynth, {
      harmonicity: AUDIO_CONFIG.SYNTH_HARMONICITY,
      modulationIndex: AUDIO_CONFIG.SYNTH_MODULATION_INDEX,
      oscillator: { type: 'triangle' },
      modulation: { type: 'sine' },
      envelope: {
        attack: AUDIO_CONFIG.ENV_ATTACK,
        decay: AUDIO_CONFIG.ENV_DECAY,
        sustain: AUDIO_CONFIG.ENV_SUSTAIN,
        release: AUDIO_CONFIG.ENV_RELEASE,
      },
    });

    guitarSynth.volume.value = AUDIO_CONFIG.MAIN_VOLUME_DB;
    guitarSynth.chain(compressorNode, reverbNode, ToneModule.Destination);

    isEngineInitialized = true;
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
};

/** 确保 Tone 引擎已启动并初始化完成 */
const ensureToneReady = async (): Promise<typeof Tone | null> => {
  if (!ToneModule) {
    ToneModule = await import('tone');
  }
  if (ToneModule.getContext().state !== 'running') {
    await ToneModule.start();
  }
  await initAudioEngine();
  return ToneModule;
};

/**
 * 扫弦触发多弦发声核心函数
 * @param chord 任意包含 strings, fretOffset, tuning 的和弦模型
 * @param startTime 音频上下文开始触发的时间戳
 * @param toneModule Tone.js 模块引用
 * @returns 扫弦发声整体占用时间（秒）
 */
const triggerChordStrum = (
  chord: {
    strings: Array<[number, boolean]>;
    fretOffset: number;
    tuning: Tuning | string;
  },
  startTime: number,
  toneModule: typeof Tone
): number => {
  if (!guitarSynth) return 0;
  const baseStrings = getActiveBaseStrings((chord.tuning as Tuning) || Tuning.STANDARD);
  let strumDelay = 0;
  let notesTriggered = 0;

  for (let sIdx = 0; sIdx < chord.strings.length; sIdx++) {
    const targetStr = chord.strings[sIdx];
    if (!targetStr || targetStr[0] < 0) continue;

    const currentMidiNote = calcNoteMidi(sIdx, targetStr[0], chord.fretOffset, baseStrings);
    const frequency = getFrequencyFromMidi(currentMidiNote, toneModule);

    const triggerTime = startTime + strumDelay;
    const humanizeVelocity = AUDIO_CONFIG.STRUM_VELOCITY_MIN + Math.random() * AUDIO_CONFIG.STRUM_VELOCITY_RANGE;

    guitarSynth.triggerAttackRelease(frequency, AUDIO_CONFIG.ENV_RELEASE, triggerTime, humanizeVelocity);

    strumDelay += AUDIO_CONFIG.STRUM_DELAY_STEP;
    notesTriggered++;
  }

  return notesTriggered > 0 ? strumDelay : 0;
};

/** 和弦试听播放器：引擎与播放状态为模块级单例，多个组件共享 */
export function useAudioPlayer() {
  const editorStore = useChordEditorStore();

  /** 播放任意指定和弦实体 */
  const playChord = async (chord: Chord) => {
    if (isPlaying.value) return;
    isPlaying.value = true;
    try {
      const tone = await ensureToneReady();
      if (!tone || !guitarSynth) {
        isPlaying.value = false;
        return;
      }
      guitarSynth.releaseAll();
      const strumDuration = triggerChordStrum(chord, tone.now(), tone);
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
      if (!tone || !guitarSynth) {
        isPlaying.value = false;
        return;
      }

      guitarSynth.releaseAll();
      const strumDuration = triggerChordStrum(editorStore.draftChord, tone.now(), tone);

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

    if (ToneModule && guitarSynth) {
      guitarSynth.releaseAll();
      triggerChordStrum(chord, ToneModule.now(), ToneModule);
    }

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
    if (!tone || !guitarSynth) return;

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
    guitarSynth?.releaseAll();
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
    guitarSynth?.releaseAll();
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
    if (guitarSynth) {
      guitarSynth.releaseAll();
      guitarSynth.dispose();
      guitarSynth = null;
    }
    if (reverbNode) {
      reverbNode.dispose();
      reverbNode = null;
    }
    if (compressorNode) {
      compressorNode.dispose();
      compressorNode = null;
    }
    isEngineInitialized = false;
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
