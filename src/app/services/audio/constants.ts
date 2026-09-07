import { AUDIO_SETTINGS_DEFAULTS } from '@/platform/utils/constants';

import type { AudioTimbreId } from '@/platform/types';

/** 音频（Tone.js 相关参数）配置 */
export const AUDIO_CONFIG = {
  /** 标准音 A4 频率（Hz） */
  A4_FREQ: 440,
  /** A4 的 MIDI 音符编号（用于音高换算） */
  A4_MIDI_NOTE: 69,

  /** 主音量增益（dB）：默认值真源在 platform/utils 的 AUDIO_SETTINGS_DEFAULTS */
  MAIN_VOLUME_DB: AUDIO_SETTINGS_DEFAULTS.volumeDb,
  /** 混响时长（s） */
  REVERB_DURATION: 1.2,
  /** 混响干湿比（0~1）：默认值真源在 platform/utils 的 AUDIO_SETTINGS_DEFAULTS（存百分制，此处换算为干湿比） */
  REVERB_WET_GAIN: AUDIO_SETTINGS_DEFAULTS.reverbWet / 100,

  /** 压缩器阈值（dB） */
  COMPRESSOR_THRESHOLD: -14,
  /** 压缩器膝点（dB） */
  COMPRESSOR_KNEE: 30,
  /** 压缩比 */
  COMPRESSOR_RATIO: 12,
  /** 压缩器起音时间（s） */
  COMPRESSOR_ATTACK: 0.003,
  /** 压缩器释音时间（s） */
  COMPRESSOR_RELEASE: 0.25,

  /** 扫弦时相邻弦触发间隔（s） */
  STRUM_DELAY_STEP: 0.06,
  /** 音符释放后额外静音等待（s，防止尾音截断） */
  AUDIO_RELEASE_TAIL: 0.6,
  /** 扫弦力度随机区间：下限（0~1，模拟不同力度） */
  STRUM_VELOCITY_MIN: 0.78,
  /** 扫弦力度随机区间：宽度（0~1，叠加下限构成上限） */
  STRUM_VELOCITY_RANGE: 0.22,
  /** 力度随机关闭时的固定力度（0~1） */
  STRUM_VELOCITY_FIXED: 0.9,
  /** 时序 humanize：每弦延迟抖动幅度（delayStep 的比例，0~1；humanize 开启时生效） */
  STRUM_TIMING_JITTER: 0.35,
  /** 立体声声像摆幅：6 弦（低）-PAN_SPREAD → 1 弦（高）+PAN_SPREAD（-1~1） */
  PAN_SPREAD: 0.4,

  /** 合成器泛音比 */
  SYNTH_HARMONICITY: 1.5,
  /** 合成器调制指数 */
  SYNTH_MODULATION_INDEX: 2.5,
  /** 包络起音时间（s） */
  ENV_ATTACK: 0.004,
  /** 包络衰减时间（s） */
  ENV_DECAY: 0.12,
  /** 包络延音电平（0~1） */
  ENV_SUSTAIN: 0.28,
  /** 包络释音时间（s） */
  ENV_RELEASE: 0.5,
} as const;

/** 音色预设参数：载波/调制波类型、harmonicity / modulationIndex / 包络（FMSynth 语义） */
export interface TimbrePreset {
  /** 显示名 */
  label: string;
  /** 载波振荡器类型 */
  oscillatorType: 'sine' | 'triangle' | 'square' | 'sawtooth';
  /** 调制振荡器类型 */
  modulationType: 'sine' | 'triangle' | 'square' | 'sawtooth';
  /** 合成器泛音比 */
  harmonicity: number;
  /** 合成器调制指数 */
  modulationIndex: number;
  /** 包络（起音 / 衰减 / 延音电平 / 释音，单位秒） */
  envelope: { attack: number; decay: number; sustain: number; release: number };
  /**
   * 调制指数衰减（可选）：模拟拨弦"击发亮、随即变暗"的物理特征。
   * 每次触发时 modulationIndex 从预设的 modulationIndex（峰值）指数滑落到 floor，耗时 time 秒。
   * 缺省表示调制指数全程恒定（普通持续型音色）。
   */
  modulationDecay?: { floor: number; time: number };
}

/**
 * 音色预设表：store 中只存 timbre id，实际参数查此表。
 * 'standard' 即初始出厂音色，其值引用 AUDIO_CONFIG 对应常量，保证单一来源。
 * 声明顺序必须在 AUDIO_CONFIG 之后（其 standard 档引用其常量值）。
 * 各档参数刻意拉开差距（含波形类型），避免听感雷同。
 */
export const TIMBRE_PRESETS: Record<AudioTimbreId, TimbrePreset> = {
  standard: {
    label: '标准',
    oscillatorType: 'triangle',
    modulationType: 'sine',
    harmonicity: AUDIO_CONFIG.SYNTH_HARMONICITY,
    modulationIndex: AUDIO_CONFIG.SYNTH_MODULATION_INDEX,
    envelope: {
      attack: AUDIO_CONFIG.ENV_ATTACK,
      decay: AUDIO_CONFIG.ENV_DECAY,
      sustain: AUDIO_CONFIG.ENV_SUSTAIN,
      release: AUDIO_CONFIG.ENV_RELEASE,
    },
  },
  soft: {
    label: '柔和',
    oscillatorType: 'sine',
    modulationType: 'sine',
    harmonicity: 1.0,
    modulationIndex: 0.6,
    envelope: { attack: 0.012, decay: 0.3, sustain: 0.4, release: 1.0 },
  },
  bright: {
    label: '明亮',
    oscillatorType: 'triangle',
    modulationType: 'square',
    harmonicity: 4.0,
    modulationIndex: 10,
    envelope: { attack: 0.002, decay: 0.08, sustain: 0.18, release: 0.3 },
  },
  pluck: {
    label: '拨弦',
    oscillatorType: 'triangle',
    modulationType: 'sine',
    harmonicity: 2.0,
    // 击发瞬间调制指数拉高（亮音头），随后快速滑落，模拟弦振动高频先衰减的物理特征
    modulationIndex: 10,
    modulationDecay: { floor: 0.7, time: 0.16 },
    // 延音电平 0：包络自然衰减到静音，如同真实拨弦不做持续激励
    envelope: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.28 },
  },
} as const;

/** 合唱效果参数（常驻链路，开/关通过 wet 切换，避免重构效果链） */
export const CHORUS_CONFIG = {
  /** LFO 频率（Hz） */
  FREQUENCY: 1.5,
  /** 调制深度（0~1） */
  DEPTH: 0.5,
  /** 延迟时间（ms） */
  DELAY_MS: 3.5,
} as const;
