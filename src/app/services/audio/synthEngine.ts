import { calcNoteMidi, getActiveBaseStrings, Tuning } from '@/domains/chord/theory/theory';

import { AUDIO_CONFIG, CHORUS_CONFIG, TIMBRE_PRESETS } from './constants';

import type { TimbrePreset } from './constants';
import type { AudioTimbreId, StrumDirection } from '@/platform/types';
import type * as Tone from 'tone';

let isEngineInitialized = false;
let initPromise: Promise<void> | null = null;
let chorusNode: Tone.Chorus | null = null;
let reverbNode: Tone.Reverb | null = null;
let compressorNode: Tone.Compressor | null = null;
let ToneModule: typeof Tone | null = null;
/** 当前已应用到合成器的音色（初始化时为标准音色，避免重复 set） */
let appliedTimbre: AudioTimbreId = 'standard';
/** 当前已应用到合成器的音量（dB） */
let appliedVolumeDb: number = AUDIO_CONFIG.MAIN_VOLUME_DB;
/** 当前合唱效果开关状态 */
let appliedChorusEnabled = false;
/** 当前混响干湿比 */
let appliedReverbWet: number = AUDIO_CONFIG.REVERB_WET_GAIN;

/**
 * 每弦独立声部：吉他物理上每弦同时只能发一音，用 N 个单音 FMSynth 替代 PolySynth，
 * 换取逐弦声像（立体声摆位）与逐弦触发能力。声部经各自 Panner 汇入合唱→压缩→混响→输出。
 * 声部数量按需扩容以兼容多弦调弦（7 弦/8 弦等，见 TUNING_PRESETS），冗余声部保留复用。
 */
interface StringVoice {
  synth: Tone.FMSynth;
  panner: Tone.Panner;
}

let stringVoices: (StringVoice | null)[] = [];

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

/** 按弦序计算立体声声像：低音弦（弦 0）偏左 → 高音弦偏右，摆幅 PAN_SPREAD */
const panForString = (stringIndex: number, stringCount: number): number => {
  if (stringCount <= 1) return 0;
  return -AUDIO_CONFIG.PAN_SPREAD + (stringIndex / (stringCount - 1)) * 2 * AUDIO_CONFIG.PAN_SPREAD;
};

/** 创建单弦声部并接入效果链：声部 → 声像 → 合唱 → 压缩 → 混响 → 输出 */
const createStringVoice = (preset: TimbrePreset, stringIndex: number, stringCount: number): StringVoice => {
  const synth = new ToneModule!.FMSynth({
    harmonicity: preset.harmonicity,
    modulationIndex: preset.modulationIndex,
    oscillator: { type: preset.oscillatorType },
    modulation: { type: preset.modulationType },
    envelope: { ...preset.envelope },
  });
  const panner = new ToneModule!.Panner(panForString(stringIndex, stringCount));
  const voice: StringVoice = { synth, panner };
  synth.volume.value = appliedVolumeDb;
  synth.chain(voice.panner, chorusNode!, compressorNode!, reverbNode!, ToneModule!.Destination);
  return voice;
};

/** 释放并销毁全部弦声部 */
const disposeStringVoices = (): void => {
  for (const voice of stringVoices) {
    if (!voice) continue;
    voice.synth.triggerRelease();
    voice.synth.dispose();
    voice.panner.dispose();
  }
  stringVoices = [];
};

/** 当前声部数量（随调弦弦数按需扩容，初始 6 = 标准调弦） */
let activeVoiceCount = 6;

/** 用指定音色重建 count 个弦声部（重建保证 FMSynth 参数完整生效，set 对参数继承不可靠） */
const rebuildStringVoices = (preset: TimbrePreset, count: number): void => {
  if (!ToneModule || !chorusNode || !compressorNode || !reverbNode) return;
  disposeStringVoices();
  stringVoices = Array.from({ length: count }, (_, i) => createStringVoice(preset, i, count));
  activeVoiceCount = count;
};

/**
 * 确保弦声部数量覆盖当前乐器的弦数（多弦调弦按需扩容）：
 * 不足时以当前音色补建；随后按当前弦数重算全部声部的声像（pan 随弦数分布变化）。
 */
const ensureStringVoices = (count: number): void => {
  if (!ToneModule || !chorusNode || !compressorNode || !reverbNode) return;
  const preset = TIMBRE_PRESETS[appliedTimbre];
  while (stringVoices.length < count) {
    stringVoices.push(createStringVoice(preset, stringVoices.length, count));
  }
  for (let i = 0; i < stringVoices.length; i++) {
    const voice = stringVoices[i];
    if (voice) voice.panner.pan.value = i < count ? panForString(i, count) : 0;
  }
  activeVoiceCount = Math.max(activeVoiceCount, count);
};

/** 懒加载 Tone.js 并构建吉他合成器链（弦声部→合唱→压缩→混响→输出）；并发调用共享同一个初始化 Promise */
export const initAudioEngine = async (): Promise<void> => {
  if (isEngineInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!ToneModule) {
      ToneModule = await import('tone');
    }

    reverbNode = new ToneModule.Reverb({
      decay: AUDIO_CONFIG.REVERB_DURATION,
      wet: appliedReverbWet,
    });

    await reverbNode.generate();

    compressorNode = new ToneModule.Compressor({
      threshold: AUDIO_CONFIG.COMPRESSOR_THRESHOLD,
      knee: AUDIO_CONFIG.COMPRESSOR_KNEE,
      ratio: AUDIO_CONFIG.COMPRESSOR_RATIO,
      attack: AUDIO_CONFIG.COMPRESSOR_ATTACK,
      release: AUDIO_CONFIG.COMPRESSOR_RELEASE,
    });

    // 合唱常驻效果链：开关通过 wet 切换（避免重构效果链），LFO 常开以保证开启即有效
    chorusNode = new ToneModule.Chorus({
      frequency: CHORUS_CONFIG.FREQUENCY,
      delayTime: CHORUS_CONFIG.DELAY_MS,
      depth: CHORUS_CONFIG.DEPTH,
      wet: appliedChorusEnabled ? 1 : 0,
    });
    chorusNode.start();

    rebuildStringVoices(TIMBRE_PRESETS.standard, 6);

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
 * 构建扫弦的弦序（纯函数）：按方向返回弦索引的触发顺序。
 * inside-out 从中音弦开始向两侧交替展开（如 6 弦：2,3,1,4,0,5）。
 */
export const buildStrumOrder = (count: number, direction: StrumDirection): number[] => {
  if (count <= 0) return [];
  if (direction === 'high') {
    return Array.from({ length: count }, (_, i) => count - 1 - i);
  }
  if (direction === 'inside-out') {
    const mid = Math.floor((count - 1) / 2);
    const order: number[] = [mid];
    for (let offset = 1; offset < count; offset++) {
      const up = mid + offset;
      const down = mid - offset;
      if (up < count) order.push(up);
      if (down >= 0) order.push(down);
    }
    return order;
  }
  return Array.from({ length: count }, (_, i) => i);
};

/** 扫弦触发可调参数：未提供的项回退 AUDIO_CONFIG 常量 */
export interface ChordStrumOptions {
  /** 音频上下文起始时间戳（秒），缺省为当前时刻 */
  startTime?: number;
  /** 相邻弦触发间隔（秒） */
  delayStep?: number;
  /** 扫弦方向（缺省下扫） */
  direction?: StrumDirection;
  /** 力度随机下限（0~1） */
  velocityMin?: number;
  /** 力度随机宽度（0~1），0 表示固定力度 */
  velocityRange?: number;
  /** 时序抖动幅度（delayStep 的比例 0~1；0 表示精确等间隔） */
  timingJitter?: number;
}

/** 按方向构建触发顺序并逐弦触发核心循环的公共前置：解析可调参数 */
const resolveStrumParams = (options?: ChordStrumOptions, tuning: Tuning | string = Tuning.STANDARD) => {
  const baseStrings = getActiveBaseStrings(tuning as Tuning);
  return {
    baseStrings,
    delayStep: options?.delayStep ?? AUDIO_CONFIG.STRUM_DELAY_STEP,
    velocityMin: options?.velocityMin ?? AUDIO_CONFIG.STRUM_VELOCITY_MIN,
    velocityRange: options?.velocityRange ?? AUDIO_CONFIG.STRUM_VELOCITY_RANGE,
    timingJitter: options?.timingJitter ?? 0,
    triggerBaseTime: options?.startTime ?? ToneModule!.now(),
  };
};

/**
 * 为支持 modulationDecay 的音色（如拨弦）在触发时刻调度调制指数滑落：
 * 从预设峰值指数衰减到 floor，模拟拨弦音头亮、随后泛音变暗的物理特征。
 */
const scheduleModulationDecay = (voice: StringVoice, preset: TimbrePreset, triggerTime: number): void => {
  const decay = preset.modulationDecay;
  if (!decay) return;
  const modIndex = voice.synth.modulationIndex;
  modIndex.cancelScheduledValues(triggerTime);
  modIndex.setValueAtTime(preset.modulationIndex, triggerTime);
  modIndex.exponentialRampToValueAtTime(decay.floor, triggerTime + decay.time);
};

/**
 * 扫弦触发多弦发声核心函数
 * @param chord 包含 strings, fretOffset, tuning 的和弦模型
 * @param options 可调参数（间隔 / 方向 / 力度与时序随机），缺省回退内置常量
 * @returns 扫弦发声整体占用时间（秒）
 */
export const triggerChordStrum = (
  chord: {
    strings: [number, boolean][];
    fretOffset: number;
    tuning: Tuning | string;
  },
  options?: ChordStrumOptions
): number => {
  if (!guitarReady()) return 0;
  ensureStringVoices(chord.strings.length);
  const { baseStrings, delayStep, velocityMin, velocityRange, timingJitter, triggerBaseTime } = resolveStrumParams(
    options,
    chord.tuning
  );
  const order = buildStrumOrder(chord.strings.length, options?.direction ?? 'low');
  let strumDelay = 0;
  let notesTriggered = 0;

  for (const sIdx of order) {
    const targetStr = chord.strings[sIdx];
    if (!targetStr || targetStr[0] < 0) continue;
    const voice = stringVoices[sIdx];
    if (!voice) continue;

    const currentMidiNote = calcNoteMidi(sIdx, targetStr[0], chord.fretOffset, baseStrings);
    const frequency = getFrequencyFromMidi(currentMidiNote, ToneModule!);

    const triggerTime = triggerBaseTime + strumDelay;
    const humanizeVelocity = velocityMin + Math.random() * velocityRange;

    scheduleModulationDecay(voice, TIMBRE_PRESETS[appliedTimbre], triggerTime);
    voice.synth.triggerAttackRelease(frequency, AUDIO_CONFIG.ENV_RELEASE, triggerTime, humanizeVelocity);

    // 时序 humanize：每步延迟在 ±jitter 比例内抖动（jitter=0 时精确等间隔）
    strumDelay += delayStep * (1 + (Math.random() * 2 - 1) * timingJitter);
    notesTriggered++;
  }

  return notesTriggered > 0 ? strumDelay : 0;
};

/**
 * 持续发声：按扫弦顺序触发各弦并保持延音（不自动释放），配合 releaseSynthNotes 停止。
 * @returns 实际触发的弦数
 */
export const triggerChordSustain = (
  chord: {
    strings: [number, boolean][];
    fretOffset: number;
    tuning: Tuning | string;
  },
  options?: ChordStrumOptions
): number => {
  if (!guitarReady()) return 0;
  ensureStringVoices(chord.strings.length);
  const { baseStrings, delayStep, velocityMin, velocityRange, timingJitter, triggerBaseTime } = resolveStrumParams(
    options,
    chord.tuning
  );
  const order = buildStrumOrder(chord.strings.length, options?.direction ?? 'low');
  let strumDelay = 0;
  let notesTriggered = 0;

  for (const sIdx of order) {
    const targetStr = chord.strings[sIdx];
    if (!targetStr || targetStr[0] < 0) continue;
    const voice = stringVoices[sIdx];
    if (!voice) continue;

    const currentMidiNote = calcNoteMidi(sIdx, targetStr[0], chord.fretOffset, baseStrings);
    const frequency = getFrequencyFromMidi(currentMidiNote, ToneModule!);

    scheduleModulationDecay(voice, TIMBRE_PRESETS[appliedTimbre], triggerBaseTime + strumDelay);
    voice.synth.triggerAttack(frequency, triggerBaseTime + strumDelay, velocityMin + Math.random() * velocityRange);

    strumDelay += delayStep * (1 + (Math.random() * 2 - 1) * timingJitter);
    notesTriggered++;
  }

  return notesTriggered;
};

/** 引擎是否已就绪（弦声部与 Tone 模块均可用） */
const guitarReady = (): boolean => Boolean(ToneModule && stringVoices.some(v => v !== null));

/** 用指定预设重建全部弦声部（保持当前声部数量） */
const applyTimbrePreset = (preset: TimbrePreset): void => {
  rebuildStringVoices(preset, activeVoiceCount);
};

/** 热切换音色预设（按 id 查 TIMBRE_PRESETS；与当前音色相同或引擎未就绪时跳过） */
export const applyTimbre = (timbreId: AudioTimbreId): void => {
  // 引擎未就绪时不得写入 appliedTimbre：否则初始化后会被幂等短路，
  // 导致用户所选音色永不生效（与其他 set/apply 系列的就绪守卫保持一致）
  if (timbreId === appliedTimbre || !guitarReady()) return;
  const preset = TIMBRE_PRESETS[timbreId];
  if (!preset) return;
  applyTimbrePreset(preset);
  appliedTimbre = timbreId;
};

/** 热更新主音量（dB；与当前值相同或引擎未就绪时跳过） */
export const setSynthVolume = (volumeDb: number): void => {
  if (!guitarReady() || volumeDb === appliedVolumeDb) return;
  for (const voice of stringVoices) {
    if (voice) voice.synth.volume.value = volumeDb;
  }
  appliedVolumeDb = volumeDb;
};

/** 热更新混响干湿比（0~1；与当前值相同或引擎未就绪时跳过） */
export const setReverbWet = (wet: number): void => {
  // 防御非法值流入 Tone 参数层（setValueAtTime(undefined/NaN) 会直接抛错中断播放链路）
  if (!Number.isFinite(wet) || wet < 0 || wet > 1) return;
  if (!reverbNode || wet === appliedReverbWet) return;
  reverbNode.wet.value = wet;
  appliedReverbWet = wet;
};

/** 热切换合唱效果开关（常驻链路，通过 wet 切换；与当前状态相同或引擎未就绪时跳过） */
export const applyChorusEnabled = (enabled: boolean): void => {
  if (!chorusNode || enabled === appliedChorusEnabled) return;
  chorusNode.wet.value = enabled ? 1 : 0;
  appliedChorusEnabled = enabled;
};

/** 释放当前全部正在发声的琴弦音符 */
export const releaseSynthNotes = (): void => {
  for (const voice of stringVoices) {
    voice?.synth.triggerRelease();
  }
};

/** 销毁底层音频引擎全部节点与状态 */
export const disposeSynthEngine = (): void => {
  disposeStringVoices();
  if (chorusNode) {
    chorusNode.dispose();
    chorusNode = null;
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
  appliedTimbre = 'standard';
  appliedVolumeDb = AUDIO_CONFIG.MAIN_VOLUME_DB;
  appliedChorusEnabled = false;
  appliedReverbWet = AUDIO_CONFIG.REVERB_WET_GAIN;
};
