import type * as Tone from 'tone';

import { calcNoteMidi, getActiveBaseStrings, Tuning } from '@/domains/chord/theory/theory';

import { AUDIO_CONFIG } from './constants';

let isEngineInitialized = false;
let initPromise: Promise<void> | null = null;
let guitarSynth: Tone.PolySynth | null = null;
let reverbNode: Tone.Reverb | null = null;
let compressorNode: Tone.Compressor | null = null;
let ToneModule: typeof Tone | null = null;

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

/** 懒加载 Tone.js 并构建吉他合成器链（合成器→压缩→混响→输出）；并发调用共享同一个初始化 Promise */
export const initAudioEngine = async (): Promise<void> => {
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

/** 确保 Tone 引擎已启动并初始化完成，返回 Tone 模块引用 */
export const ensureToneReady = async (): Promise<typeof Tone | null> => {
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
 * @param chord 包含 strings, fretOffset, tuning 的和弦模型
 * @param startTime 音频上下文开始触发的时间戳（秒）
 * @returns 扫弦发声整体占用时间（秒）
 */
export const triggerChordStrum = (
  chord: {
    strings: Array<[number, boolean]>;
    fretOffset: number;
    tuning: Tuning | string;
  },
  startTime?: number
): number => {
  if (!guitarSynth || !ToneModule) return 0;
  const triggerBaseTime = startTime ?? ToneModule.now();
  const baseStrings = getActiveBaseStrings((chord.tuning as Tuning) || Tuning.STANDARD);
  let strumDelay = 0;
  let notesTriggered = 0;

  for (let sIdx = 0; sIdx < chord.strings.length; sIdx++) {
    const targetStr = chord.strings[sIdx];
    if (!targetStr || targetStr[0] < 0) continue;

    const currentMidiNote = calcNoteMidi(sIdx, targetStr[0], chord.fretOffset, baseStrings);
    const frequency = getFrequencyFromMidi(currentMidiNote, ToneModule);

    const triggerTime = triggerBaseTime + strumDelay;
    const humanizeVelocity = AUDIO_CONFIG.STRUM_VELOCITY_MIN + Math.random() * AUDIO_CONFIG.STRUM_VELOCITY_RANGE;

    guitarSynth.triggerAttackRelease(frequency, AUDIO_CONFIG.ENV_RELEASE, triggerTime, humanizeVelocity);

    strumDelay += AUDIO_CONFIG.STRUM_DELAY_STEP;
    notesTriggered++;
  }

  return notesTriggered > 0 ? strumDelay : 0;
};

/** 释放当前全部正在发声的琴弦音符 */
export const releaseSynthNotes = (): void => {
  guitarSynth?.releaseAll();
};

/** 销毁底层音频引擎全部节点与状态 */
export const disposeSynthEngine = (): void => {
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
};
