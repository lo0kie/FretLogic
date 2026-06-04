// 🎵 音频引擎核心参数 (Audio Core Engine Constants)
export const AUDIO_CONFIG = {
  MAIN_VOLUME: 0.4, // 混音器主增益量
  REVERB_DURATION: 2.0, // 空间卷积混响持续时长 (秒)
  REVERB_WET_GAIN: 0.25, // 湿音（混响音）反馈增益
  COMPRESSOR_THRESHOLD: -14, // 动态压缩器阈值(dB)，锁死多弦共振破音
  COMPRESSOR_KNEE: 30, // 压缩拐点弯曲度
  COMPRESSOR_RATIO: 12, // 压缩比率
  COMPRESSOR_ATTACK: 0.003, // 压缩器启动侵入时间 (秒)
  COMPRESSOR_RELEASE: 0.25, // 压缩器释放衰减时间 (秒)
  STRUM_DELAY_STEP: 0.08, // 工业级扫弦时差阻尼 (80ms 逐根拨弦)
  AUDIO_RELEASE_TAIL: 1.4, // 音频计划释放的安全尾迹时长 (秒)
} as const;
