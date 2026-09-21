/**
 * 音频播放逻辑实现（懒加载模块，由 useAudioPlayer 状态壳动态 import）：
 * 和弦试听扫弦、持续发声（长按）、乐谱序进 lookahead 调度与合成器引擎（synthEngine）。
 *
 * 独立成模块的原因：WebAudio 合成器整条链路只在用户触发试听时才需要，
 * 静态挂在 TopHeader 上会把它拖进首屏闭包。播放状态 refs 定义在 useAudioPlayer.ts
 * （模块级单例），本模块 import 同一组 refs 读写，两端看到的state完全一致。
 */
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { logger } from '@/platform/utils/logger';

import { AUDIO_CONFIG } from './constants';
import {
  applyChorusEnabled,
  applyTimbre,
  disposeSynthEngine,
  ensureAudioReady,
  getAudioTime,
  releaseSynthNotes,
  setReverbWet,
  setSynthVolume,
  triggerChordStrum,
  triggerChordSustain,
} from './synthEngine';
import { currentPlayingStepIndex, isPlaying, isScorePlaying, isSustaining } from './useAudioPlayer';

import type { ChordStrumOptions } from './synthEngine';
import type { Chord } from '@/domains/chord/types';
import type { ScoreChordStep } from '@/domains/score/model/chordSlots';

// 本模块是懒加载实现（仅由 useAudioPlayer 动态 import），求值必然晚于 app.use(pinia)，
// 故 store 引用在模块加载时取一次即可复用（同 textTransferActions.ts 写法）；每次扫弦都要
// 读一次配置，原先反复 useSettingsStore() 属于重复解析同一份引用。
// 只缓存 store 本身、不往下缓存 settingsStore.audioPlayback：后者是 useStorage 的 ref，
// 值会被外部存储事件整体替换，取早了会读到 stale 对象，故仍在每次调用时读属性。
const settingsStore = useSettingsStore();
const editorStore = useChordEditorStore();

let playTimer: ReturnType<typeof setTimeout> | null = null;
let scorePlaybackTimer: ReturnType<typeof setTimeout> | null = null;
/** 待触发的高亮定时器集合：一个 tick 可排程多步，每步各自持有 timer，不能互相顶掉 */
const pendingHighlightTimers = new Set<ReturnType<typeof setTimeout>>();
const clearHighlightTimers = (): void => {
  for (const timer of pendingHighlightTimers) clearTimeout(timer);
  pendingHighlightTimers.clear();
};
/** 持续发声会话令牌：区分先后两次 startChordSustain，防止 await 窗口内松手再按导致旧调用误触发扫弦 */
let sustainTicket = 0;

let activeSequence: (ScoreChordStep | Chord)[] = [];
let activeStepIndex = 0;
let activeBpm = 100;
let activeBeatsPerChord = 4;
let activeOnStepCallback: ((index: number) => void) | undefined = undefined;
let activeLoop = false;

// ===== 乐谱序进 lookahead 调度 =====
// setTimeout 只负责「提前把音符排进硬件音频时间线」，真正的节拍以 audioCtx.currentTime
// 为唯一真相源：每步以绝对音频时间戳（startTime）排入引擎，主线程卡顿/后台节流只会让
// 排程动作迟到，不会让节拍漂移累积（旧实现每步用相对间隔重新 setTimeout，误差逐拍叠加）。
/** 提前排程窗口（秒）：窗口内的步按绝对时间戳一次性排入引擎 */
const SCORE_LOOKAHEAD_S = 0.3;
/** 排程器轮询间隔（ms）：只需快于 lookahead 窗口即可 */
const SCORE_TICK_MS = 80;
/** 下一首个弦步的音频时间戳（秒） */
let nextStepAudioTime = 0;

const stepDurationSec = (): number => (60 / activeBpm) * activeBeatsPerChord;

/** 从 store 当前值组装扫弦可调参数（音色与音量经 syncEngineToneSettings 同步到引擎） */
const buildStrumOptions = (): ChordStrumOptions => {
  const playback = settingsStore.audioPlayback;
  return {
    delayStep: playback.strumDelayMs / 1000,
    direction: playback.strumDirection,
    velocityMin: playback.humanize ? undefined : AUDIO_CONFIG.STRUM_VELOCITY_FIXED,
    velocityRange: playback.humanize ? undefined : 0,
    // 力度随机开启时同步启用扫弦时序抖动（与力度共用 humanize 开关）
    timingJitter: playback.humanize ? AUDIO_CONFIG.STRUM_TIMING_JITTER : 0,
  };
};

/** 引擎就绪后同步音色与音量到合成器（幂等，值未变化时引擎内部跳过） */
const syncEngineToneSettings = () => {
  const playback = settingsStore.audioPlayback;
  applyTimbre(playback.timbre);
  setSynthVolume(playback.volumeDb);
  setReverbWet(playback.reverbWet / 100);
  applyChorusEnabled(playback.chorusEnabled);
};

/** 单次扫弦公共管线：引擎就绪 → 同步音色 → 释放旧音 → 扫弦 → 尾部释放后复位 isPlaying。 */
const strumOnce = async (chord: Chord, failLabel: string) => {
  try {
    const ready = await ensureAudioReady();
    if (!ready) {
      isPlaying.value = false;
      return;
    }
    syncEngineToneSettings();
    releaseSynthNotes();
    const strumDuration = triggerChordStrum(chord, buildStrumOptions());
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
    logger.error('audio', failLabel, e);
    isPlaying.value = false;
  }
};

/** 播放任意指定和弦实体 */
export const playChord = async (chord: Chord) => {
  if (isPlaying.value) return;
  isPlaying.value = true;
  await strumOnce(chord, '播放和弦失败:');
};

/** 从低音到高音扫弦式播放当前草稿和弦，力度/时间带随机 humanize，尾部释放完成后自动复位状态 */
export const playCurrentChord = async () => {
  // 不做 isPlaying 早退：释放尾窗口内的重复点击应立即重新扫弦（开头会先释放旧音，不会叠音），
  // 否则点击会被保护窗口静默吞掉，表现为「要点两下才播放」
  isPlaying.value = true;
  await strumOnce(editorStore.draftChord, '和弦音频引擎调度失败:');
};

// ===== 持续发声（长按试听）：triggerAttack 保持延音，松开后统一释放 =====

/** 开始持续发声（引擎就绪后按扫弦序 triggerAttack，各弦保持延音） */
export const startChordSustain = async (chord: Chord) => {
  if (isSustaining.value || isPlaying.value) return;
  isSustaining.value = true;
  const ticket = ++sustainTicket;
  try {
    const ready = await ensureAudioReady();
    // await 窗口内的状态复检：松手（stopChordSustain 复位）、再次按住（ticket 已被新会话接管）
    // 或切换为播放时，本会话不得再起音——否则会出现「停止后才发声且无人释放」的失控延音/双扫弦
    if (!ready || sustainTicket !== ticket || !isSustaining.value || isPlaying.value) {
      // 仅当仍是本会话时才复位状态，避免误清新会话
      if (sustainTicket === ticket) isSustaining.value = false;
      return;
    }
    syncEngineToneSettings();
    releaseSynthNotes();
    triggerChordSustain(chord, buildStrumOptions());
  } catch (error) {
    logger.error('audio', '持续发声启动失败', error);
    if (sustainTicket === ticket) isSustaining.value = false;
  }
};

/** 停止持续发声（释放全部延音音符） */
export const stopChordSustain = () => {
  if (!isSustaining.value) return;
  releaseSynthNotes();
  isSustaining.value = false;
};

/** lookahead 排程器：把 lookahead 窗口内的步按绝对音频时间戳排入引擎，UI 高亮按同刻对齐 */
const scheduleScoreSteps = () => {
  scorePlaybackTimer = null;
  if (!isScorePlaying.value) return;
  const now = getAudioTime();

  // 后台节流导致 tick 严重迟到时的追帧：错过的步静默跳过（不补爆音），游标直接追到当下
  while (nextStepAudioTime < now - SCORE_LOOKAHEAD_S) {
    if (activeStepIndex >= activeSequence.length) {
      if (!activeLoop) {
        stopScorePlayback();
        return;
      }
      activeStepIndex = 0;
    }
    activeStepIndex += 1;
    nextStepAudioTime += stepDurationSec();
  }

  // 排程窗口内的步：以绝对时间戳精确触发，节拍精度由音频硬件时钟保证
  while (nextStepAudioTime < now + SCORE_LOOKAHEAD_S) {
    if (activeStepIndex >= activeSequence.length) {
      if (!activeLoop) {
        stopScorePlayback();
        return;
      }
      activeStepIndex = 0; // 循环模式：回到序列开头继续
    }

    const stepIndex = activeStepIndex;
    const currentItem = activeSequence[stepIndex]!;
    const chord = 'chord' in currentItem ? currentItem.chord : currentItem;

    triggerChordStrum(chord, { ...buildStrumOptions(), startTime: nextStepAudioTime });

    // UI 高亮与回调按音频时间对齐（排程提前量与音频起点之差）
    const highlightDelayMs = Math.max(0, (nextStepAudioTime - now) * 1000);
    const highlightTimer = setTimeout(() => {
      pendingHighlightTimers.delete(highlightTimer);
      if (!isScorePlaying.value) return;
      currentPlayingStepIndex.value = stepIndex;
      activeOnStepCallback?.(stepIndex);
    }, highlightDelayMs);
    pendingHighlightTimers.add(highlightTimer);

    activeStepIndex = stepIndex + 1;
    nextStepAudioTime += stepDurationSec();
  }

  // 下一轮 tick：贴近「下一即将排程步越过 lookahead 窗口」的时刻
  const nextNow = getAudioTime();
  const delayMs = Math.max(SCORE_TICK_MS, (nextStepAudioTime - SCORE_LOOKAHEAD_S - nextNow) * 1000);
  scorePlaybackTimer = setTimeout(scheduleScoreSteps, delayMs);
};

/** 开始全曲和弦序进播放 */
export const startScorePlayback = async (
  sequence: (ScoreChordStep | Chord)[],
  options?: {
    bpm?: number;
    beatsPerChord?: number;
    startIndex?: number;
    onStep?: (index: number) => void;
    /** 播放到末尾后从头循环（默认 false） */
    loop?: boolean;
  }
) => {
  if (!sequence || sequence.length === 0) return;
  // 重入互斥：上一次序进仍在播时直接开新一轮会叠音（两套 lookahead 排程并行），
  // 先停掉旧会话（含释放旧音、清定时器）再起
  if (isScorePlaying.value) stopScorePlayback();
  const ready = await ensureAudioReady();
  if (!ready) return;

  activeSequence = sequence;
  activeStepIndex = options?.startIndex ?? 0;
  activeBpm = options?.bpm ?? 100;
  activeBeatsPerChord = options?.beatsPerChord ?? 4;
  activeOnStepCallback = options?.onStep;
  activeLoop = options?.loop ?? false;

  isScorePlaying.value = true;
  if (scorePlaybackTimer) {
    clearTimeout(scorePlaybackTimer);
    scorePlaybackTimer = null;
  }
  clearHighlightTimers();
  syncEngineToneSettings();
  // 首步稍微留出起振余量，随后进入 lookahead 排程循环
  nextStepAudioTime = getAudioTime() + 0.12;
  scheduleScoreSteps();
};

/** 暂停乐谱播放 */
export const pauseScorePlayback = () => {
  isScorePlaying.value = false;
  if (scorePlaybackTimer) {
    clearTimeout(scorePlaybackTimer);
    scorePlaybackTimer = null;
  }
  clearHighlightTimers();
  releaseSynthNotes();
};

/** 停止乐谱播放并复位 */
export const stopScorePlayback = () => {
  isScorePlaying.value = false;
  currentPlayingStepIndex.value = -1;
  activeStepIndex = 0;
  activeLoop = false;
  if (scorePlaybackTimer) {
    clearTimeout(scorePlaybackTimer);
    scorePlaybackTimer = null;
  }
  clearHighlightTimers();
  releaseSynthNotes();
};

/** 销毁音频引擎的全部节点与定时器（HMR/卸载时防泄漏） */
export const disposeAudioEngine = () => {
  if (playTimer) {
    clearTimeout(playTimer);
    playTimer = null;
  }
  if (scorePlaybackTimer) {
    clearTimeout(scorePlaybackTimer);
    scorePlaybackTimer = null;
  }
  clearHighlightTimers();
  disposeSynthEngine();
  isPlaying.value = false;
  isScorePlaying.value = false;
  isSustaining.value = false;
  currentPlayingStepIndex.value = -1;
};
