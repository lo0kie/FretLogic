import { calcNoteMidi, getActiveBaseStrings, Tuning } from '@/domains/chord/theory/theory';

import { AUDIO_CONFIG, CHORUS_CONFIG, TIMBRE_PRESETS } from './constants';

import type { TimbrePreset } from './constants';
import type { AudioTimbreId, StrumDirection } from '@/platform/types';

let isEngineInitialized = false;
let initPromise: Promise<void> | null = null;

/** 原生 Web Audio 上下文（懒创建，dispose 时保留以便重建） */
let audioCtx: AudioContext | null = null;

/** 共享效果链节点：逐弦声部 → 声像 → chorusInput → … → destination */
let chorusInput: GainNode | null = null;
let chorusDelay: DelayNode | null = null;
let chorusLfo: OscillatorNode | null = null;
let chorusLfoGain: GainNode | null = null;
let chorusWetGain: GainNode | null = null;
let chorusDryGain: GainNode | null = null;
let chorusOutput: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let reverbInput: GainNode | null = null;
let reverbConvolver: ConvolverNode | null = null;
let reverbWet: GainNode | null = null;
let reverbDry: GainNode | null = null;
let reverbOutput: GainNode | null = null;
let masterGain: GainNode | null = null;

/** 每弦独立声像（立体声摆位）；弦数变化时按需扩容，声像随之重算 */
let stringPanners: (StereoPannerNode | null)[] = [];

/** 当前正在发声的 Note 句柄（用于 releaseSynthNotes 统一释放） */
interface ActiveNote {
  carrier: OscillatorNode;
  modulator: OscillatorNode;
  ampEnv: GainNode;
}
let activeNotes: ActiveNote[] = [];

/** 当前已应用到合成器的音色（初始化时为标准音色，避免重复 set） */
let appliedTimbre: AudioTimbreId = 'standard';
/** 当前已应用到合成器的音量（dB） */
let appliedVolumeDb: number = AUDIO_CONFIG.MAIN_VOLUME_DB;
/** 当前合唱效果开关状态 */
let appliedChorusEnabled = false;
/** 当前混响干湿比 */
let appliedReverbWet: number = AUDIO_CONFIG.REVERB_WET_GAIN;

const MIDI_TO_FREQ_CACHE = new Map<number, number>();

/** MIDI 号转频率，带缓存避免重复换算（公式与 AUDIO_CONFIG 的 A4 基准一致） */
const midiToFreq = (midiNote: number): number => {
  let freq = MIDI_TO_FREQ_CACHE.get(midiNote);
  if (freq === undefined) {
    freq = AUDIO_CONFIG.A4_FREQ * Math.pow(2, (midiNote - AUDIO_CONFIG.A4_MIDI_NOTE) / 12);
    MIDI_TO_FREQ_CACHE.set(midiNote, freq);
  }
  return freq;
};

/** dB → 线性增益 */
const dbToGain = (db: number): number => Math.pow(10, db / 20);

/** 按弦序计算立体声声像：低音弦（弦 0）偏左 → 高音弦偏右，摆幅 PAN_SPREAD */
const panForString = (stringIndex: number, stringCount: number): number => {
  if (stringCount <= 1) return 0;
  return -AUDIO_CONFIG.PAN_SPREAD + (stringIndex / (stringCount - 1)) * 2 * AUDIO_CONFIG.PAN_SPREAD;
};

/** 生成指数衰减白噪声脉冲响应（标准卷积混响 IR；decay 越大尾音越长） */
const createImpulseResponse = (ctx: BaseAudioContext, seconds: number, decayExp: number): AudioBuffer => {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decayExp);
    }
  }
  return buffer;
};

/** 构建共享效果链：chorus → compressor → reverb → master → destination */
const buildEffectChain = (): void => {
  const ctx = audioCtx!;

  // 混响：卷积 + 干湿交叉淡入（wet 由 appliedReverbWet 控制）
  const ir = createImpulseResponse(ctx, AUDIO_CONFIG.REVERB_DURATION, 2.5);
  reverbConvolver = ctx.createConvolver();
  reverbConvolver.buffer = ir;
  reverbWet = ctx.createGain();
  reverbWet.gain.value = appliedReverbWet;
  reverbDry = ctx.createGain();
  reverbDry.gain.value = 1 - appliedReverbWet;
  reverbInput = ctx.createGain();
  reverbOutput = ctx.createGain();
  reverbInput.connect(reverbDry);
  reverbDry.connect(reverbOutput);
  reverbInput.connect(reverbConvolver);
  reverbConvolver.connect(reverbWet);
  reverbWet.connect(reverbOutput);

  // 压缩器：参数直接取自 AUDIO_CONFIG
  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = AUDIO_CONFIG.COMPRESSOR_THRESHOLD;
  compressor.knee.value = AUDIO_CONFIG.COMPRESSOR_KNEE;
  compressor.ratio.value = AUDIO_CONFIG.COMPRESSOR_RATIO;
  compressor.attack.value = AUDIO_CONFIG.COMPRESSOR_ATTACK;
  compressor.release.value = AUDIO_CONFIG.COMPRESSOR_RELEASE;

  // 合唱：DelayNode + LFO 调制 delayTime，常驻链路通过 wet/dry 切换开关
  const baseDelay = CHORUS_CONFIG.DELAY_MS / 1000;
  chorusInput = ctx.createGain();
  chorusDelay = ctx.createDelay(0.05);
  chorusDelay.delayTime.value = baseDelay;
  chorusLfo = ctx.createOscillator();
  chorusLfo.type = 'sine';
  chorusLfo.frequency.value = CHORUS_CONFIG.FREQUENCY;
  chorusLfoGain = ctx.createGain();
  chorusLfoGain.gain.value = CHORUS_CONFIG.DEPTH * baseDelay;
  chorusLfo.connect(chorusLfoGain);
  chorusLfoGain.connect(chorusDelay.delayTime);
  chorusWetGain = ctx.createGain();
  chorusWetGain.gain.value = appliedChorusEnabled ? 1 : 0;
  chorusDryGain = ctx.createGain();
  chorusDryGain.gain.value = appliedChorusEnabled ? 0 : 1;
  chorusOutput = ctx.createGain();
  chorusInput.connect(chorusDryGain);
  chorusDryGain.connect(chorusOutput);
  chorusInput.connect(chorusDelay);
  chorusDelay.connect(chorusWetGain);
  chorusWetGain.connect(chorusOutput);
  chorusLfo.start();

  // 主音量（dB → 线性增益）置于效果链末端、destination 之前
  masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(appliedVolumeDb);

  // 串联：chorus → compressor → reverb → master → destination
  chorusOutput.connect(compressor);
  compressor.connect(reverbInput);
  reverbOutput.connect(masterGain);
  masterGain.connect(ctx.destination);
};

/** 确保弦声部数量覆盖当前乐器的弦数（多弦调弦按需扩容），并按弦数重算全部声像 */
const ensureStringVoices = (count: number): void => {
  if (!audioCtx || !chorusInput) return;
  while (stringPanners.length < count) {
    const panner = audioCtx.createStereoPanner();
    panner.pan.value = panForString(stringPanners.length, count);
    panner.connect(chorusInput);
    stringPanners.push(panner);
  }
  for (let i = 0; i < stringPanners.length; i++) {
    const panner = stringPanners[i];
    if (panner) panner.pan.value = i < count ? panForString(i, count) : 0;
  }
};

/**
 * 触发单音：构建 FM 合成图（载波 + 调制 → 频率，ADSR 幅度包络），接入指定弦的声像。
 * @param sustain 为 true 时仅起音并保持延音（由 releaseSynthNotes 释放），否则按 duration 自动释放。
 */
const triggerNote = (
  frequency: number,
  startTime: number,
  duration: number,
  velocity: number,
  preset: TimbrePreset,
  panner: StereoPannerNode,
  sustain: boolean
): void => {
  const ctx = audioCtx!;
  const carrier = ctx.createOscillator();
  carrier.type = preset.oscillatorType;
  carrier.frequency.setValueAtTime(frequency, startTime);

  const modulator = ctx.createOscillator();
  modulator.type = preset.modulationType;
  modulator.frequency.setValueAtTime(preset.harmonicity * frequency, startTime);

  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(Math.max(0.0001, preset.modulationIndex), startTime);
  modulator.connect(modGain);
  modGain.connect(carrier.frequency);

  const ampEnv = ctx.createGain();
  ampEnv.gain.setValueAtTime(0.0001, startTime);
  carrier.connect(ampEnv);
  ampEnv.connect(panner);

  // ADSR 幅度包络：attack → peak，decay → sustain*peak
  const peak = Math.max(0.0001, velocity);
  const { attack, decay, sustain: sustainLevel, release } = preset.envelope;
  ampEnv.gain.linearRampToValueAtTime(peak, startTime + attack);
  ampEnv.gain.linearRampToValueAtTime(Math.max(0.0001, sustainLevel * peak), startTime + attack + decay);

  // 调制指数衰减（拨弦音头亮、随后变暗）：modulationIndex(峰值) → floor
  if (preset.modulationDecay) {
    modGain.gain.setValueAtTime(Math.max(0.0001, preset.modulationIndex), startTime);
    modGain.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, preset.modulationDecay.floor),
      startTime + preset.modulationDecay.time
    );
  }

  carrier.start(startTime);
  modulator.start(startTime);

  let stopAt: number;
  if (sustain) {
    // 延音保持：不自动释放，交由 releaseSynthNotes；用极远停止时间占位
    stopAt = startTime + 1e9;
  } else {
    const releaseStart = startTime + Math.max(duration, attack + decay);
    ampEnv.gain.setValueAtTime(Math.max(0.0001, sustainLevel * peak), releaseStart);
    ampEnv.gain.linearRampToValueAtTime(0.0001, releaseStart + release);
    stopAt = releaseStart + release + 0.02;
  }
  carrier.stop(stopAt);
  modulator.stop(stopAt);

  const note: ActiveNote = { carrier, modulator, ampEnv };
  carrier.onended = () => {
    try {
      carrier.disconnect();
      modulator.disconnect();
      modGain.disconnect();
      ampEnv.disconnect();
    } catch {
      /* 已断开 */
    }
    const idx = activeNotes.indexOf(note);
    if (idx >= 0) activeNotes.splice(idx, 1);
  };
  activeNotes.push(note);
};

/** 懒创建音频上下文并构建吉他合成器链（弦声部→合唱→压缩→混响→输出）；并发调用共享同一初始化 Promise */
export const initAudioEngine = async (): Promise<void> => {
  if (isEngineInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!audioCtx) {
      const Ctor =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    buildEffectChain();
    ensureStringVoices(6);

    isEngineInitialized = true;
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
};

/** 确保引擎已初始化完成；返回就绪状态（供调用方做就绪判断） */
export const ensureAudioReady = async (): Promise<boolean> => {
  await initAudioEngine();
  return isEngineInitialized;
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
    triggerBaseTime: options?.startTime ?? audioCtx!.currentTime,
  };
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
  const preset = TIMBRE_PRESETS[appliedTimbre];
  let strumDelay = 0;
  let notesTriggered = 0;

  for (const sIdx of order) {
    const targetStr = chord.strings[sIdx];
    if (!targetStr || targetStr[0] < 0) continue;
    const panner = stringPanners[sIdx];
    if (!panner) continue;

    const currentMidiNote = calcNoteMidi(sIdx, targetStr[0], chord.fretOffset, baseStrings);
    const frequency = midiToFreq(currentMidiNote);

    const triggerTime = triggerBaseTime + strumDelay;
    const humanizeVelocity = velocityMin + Math.random() * velocityRange;

    triggerNote(frequency, triggerTime, AUDIO_CONFIG.ENV_RELEASE, humanizeVelocity, preset, panner, false);

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
  const preset = TIMBRE_PRESETS[appliedTimbre];
  let strumDelay = 0;
  let notesTriggered = 0;

  for (const sIdx of order) {
    const targetStr = chord.strings[sIdx];
    if (!targetStr || targetStr[0] < 0) continue;
    const panner = stringPanners[sIdx];
    if (!panner) continue;

    const currentMidiNote = calcNoteMidi(sIdx, targetStr[0], chord.fretOffset, baseStrings);
    const frequency = midiToFreq(currentMidiNote);

    triggerNote(
      frequency,
      triggerBaseTime + strumDelay,
      0,
      velocityMin + Math.random() * velocityRange,
      preset,
      panner,
      true
    );

    strumDelay += delayStep * (1 + (Math.random() * 2 - 1) * timingJitter);
    notesTriggered++;
  }

  return notesTriggered;
};

/** 引擎是否已就绪（上下文、效果链与弦声部均可用） */
const guitarReady = (): boolean =>
  Boolean(audioCtx && isEngineInitialized && chorusInput && compressor && reverbInput && stringPanners.length > 0);

/** 热切换音色预设（按 id 查 TIMBRE_PRESETS；与当前音色相同或引擎未就绪时跳过）。
 *  原生实现无需重建持久节点：下次触发即按新预设参数起音。 */
export const applyTimbre = (timbreId: AudioTimbreId): void => {
  if (timbreId === appliedTimbre || !guitarReady()) return;
  if (!TIMBRE_PRESETS[timbreId]) return;
  appliedTimbre = timbreId;
};

/** 热更新主音量（dB；与当前值相同或引擎未就绪时跳过） */
export const setSynthVolume = (volumeDb: number): void => {
  if (!guitarReady() || volumeDb === appliedVolumeDb) return;
  if (masterGain) masterGain.gain.value = dbToGain(volumeDb);
  appliedVolumeDb = volumeDb;
};

/** 热更新混响干湿比（0~1；与当前值相同或引擎未就绪时跳过） */
export const setReverbWet = (wet: number): void => {
  // 防御非法值流入 Web Audio 参数层（setValueAtTime(undefined/NaN) 会直接抛错中断播放链路）
  if (!Number.isFinite(wet) || wet < 0 || wet > 1) return;
  if (!reverbWet || !reverbDry || wet === appliedReverbWet) return;
  reverbWet.gain.value = wet;
  reverbDry.gain.value = 1 - wet;
  appliedReverbWet = wet;
};

/** 热切换合唱效果开关（常驻链路，通过 wet/dry 切换；与当前状态相同或引擎未就绪时跳过） */
export const applyChorusEnabled = (enabled: boolean): void => {
  if (!chorusWetGain || !chorusDryGain || enabled === appliedChorusEnabled) return;
  chorusWetGain.gain.value = enabled ? 1 : 0;
  chorusDryGain.gain.value = enabled ? 0 : 1;
  appliedChorusEnabled = enabled;
};

/** 释放当前全部正在发声的琴弦音符 */
export const releaseSynthNotes = (): void => {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const notes = activeNotes;
  activeNotes = [];
  for (const n of notes) {
    try {
      n.ampEnv.gain.cancelScheduledValues(now);
      n.ampEnv.gain.setTargetAtTime(0.0001, now, 0.02);
      n.carrier.stop(now + 0.1);
      n.modulator.stop(now + 0.1);
    } catch {
      /* 已停止 */
    }
  }
};

/** 销毁底层音频引擎全部节点与状态 */
export const disposeSynthEngine = (): void => {
  releaseSynthNotes();
  const disconnectAll = (node: AudioNode | null): void => {
    if (!node) return;
    try {
      node.disconnect();
    } catch {
      /* 已断开 */
    }
  };
  try {
    chorusLfo?.stop();
  } catch {
    /* 已停止 */
  }
  disconnectAll(chorusInput);
  disconnectAll(chorusDelay);
  disconnectAll(chorusLfo);
  disconnectAll(chorusLfoGain);
  disconnectAll(chorusWetGain);
  disconnectAll(chorusDryGain);
  disconnectAll(chorusOutput);
  disconnectAll(compressor);
  disconnectAll(reverbInput);
  disconnectAll(reverbConvolver);
  disconnectAll(reverbWet);
  disconnectAll(reverbDry);
  disconnectAll(reverbOutput);
  disconnectAll(masterGain);
  for (const p of stringPanners) disconnectAll(p);

  chorusInput = null;
  chorusDelay = null;
  chorusLfo = null;
  chorusLfoGain = null;
  chorusWetGain = null;
  chorusDryGain = null;
  chorusOutput = null;
  compressor = null;
  reverbInput = null;
  reverbConvolver = null;
  reverbWet = null;
  reverbDry = null;
  reverbOutput = null;
  masterGain = null;
  stringPanners = [];
  isEngineInitialized = false;
  appliedTimbre = 'standard';
  appliedVolumeDb = AUDIO_CONFIG.MAIN_VOLUME_DB;
  appliedChorusEnabled = false;
  appliedReverbWet = AUDIO_CONFIG.REVERB_WET_GAIN;
};
