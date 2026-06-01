// 馃专 音频引擎参数 (Audio Core Engine Constants)
export const AUDIO_CONFIG = {
  MAIN_VOLUME: 0.4, // 混音器主增益量
  REVERB_DURATION: 2.0, // 空间卷积混响持续时长 (秒)
  REVERB_WET_GAIN: 0.25, // 湿音（混响音）反馈增益
  COMPRESSOR_THRESHOLD: -14, // 动态压缩器阈值 (dB)，锁死多弦共振破音
  COMPRESSOR_KNEE: 30, // 压缩拐点弯曲度
  COMPRESSOR_RATIO: 12, // 压缩压缩比率
  COMPRESSOR_ATTACK: 0.003, // 🌟 核心补齐：压缩器启动侵入时间 (秒)
  COMPRESSOR_RELEASE: 0.25, // 🌟 核心补齐：压缩器释放衰减时间 (秒)
  STRUM_DELAY_STEP: 0.08, // 工业级扫弦时差阻尼 (80ms 逐根拨弦)
  AUDIO_RELEASE_TAIL: 1.4, // 音频计划释放的安全尾迹时长 (秒)
} as const;

// 馃专 指板手感物理阻尼参数 (Interaction Physics Constants)
export const INTERACTION_CONFIG = {
  MUTING_COOL_DOWN: 200, // 移动端滑动或快速切音的防抖冷却时间 (毫秒)
  WHEEL_THRESHOLD: 40, // 鼠标滚轮切换 Capo 的敏锐度阈值
  MAX_CAPO_LIMIT: 12, // 吉他最高有效品位平移限制
  MIN_CAPO_LIMIT: 0, // 空弦基础位
} as const;

// 馃专 响应式画布物理比例映射 (Fretboard Physical Scale Map)
export const FRETBOARD_SCALE_MAP: Record<number, number> = {
  3: 1.0, // 三品：正常无缩放比例
  4: 0.92, // 四品：物理长宽自适应压缩 92%
  5: 0.85, // 五品：高密度压缩至 85% 防止溢出屏幕
} as const;

// 馃专 虚拟卡片除画布外的垂直宿主填充高 (px)
export const WORKBENCH_LAYOUT = {
  BASE_VERTICAL_PADDING: 135, // pt-14(56px) + 标题(16px) + gap(32px) + pb(31px) 的固定物理间距
} as const;
