/** 音频合成 / 音效配置（Tone.js 相关参数） */
export const AUDIO_CONFIG = {
  /** 标准音 A4 频率（Hz） */
  A4_FREQ: 440,
  /** A4 的 MIDI 音符编号（用于音高换算） */
  A4_MIDI_NOTE: 69,

  /** 主音量增益（dB） */
  MAIN_VOLUME_DB: -8,
  /** 混响时长（s） */
  REVERB_DURATION: 1.2,
  /** 混响干湿比 */
  REVERB_WET_GAIN: 0.2,

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
