import { ref } from 'vue';

import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useSettingsStore } from '@/platform/store/settingsStore';

import { AUDIO_CONFIG } from './constants';
import {
  applyChorusEnabled,
  applyTimbre,
  disposeSynthEngine,
  ensureToneReady,
  releaseSynthNotes,
  setReverbWet,
  setSynthVolume,
  triggerChordStrum,
  triggerChordSustain,
} from './synthEngine';

import type { ChordStrumOptions } from './synthEngine';
import type { Chord } from '@/domains/chord/types';
import type { ScoreChordStep } from '@/domains/score/model/chordSlots';

const isPlaying = ref(false);
const isScorePlaying = ref(false);
const isSustaining = ref(false);
const currentPlayingStepIndex = ref<number>(-1);

let playTimer: ReturnType<typeof setTimeout> | null = null;
let scorePlaybackTimer: ReturnType<typeof setTimeout> | null = null;
/** 持续发声会话令牌：区分先后两次 startChordSustain，防止 await 窗口内松手再按导致旧调用误触发扫弦 */
let sustainTicket = 0;

let activeSequence: (ScoreChordStep | Chord)[] = [];
let activeStepIndex = 0;
let activeBpm = 100;
let activeBeatsPerChord = 4;
let activeOnStepCallback: ((index: number) => void) | undefined = undefined;
let activeLoop = false;

/** 和弦试听播放器：引擎与播放状态为模块级单例，多个组件共享 */
export function useAudioPlayer() {
  const editorStore = useChordEditorStore();
  const settingsStore = useSettingsStore();

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
    applyTimbre(settingsStore.audioPlayback.timbre);
    setSynthVolume(settingsStore.audioPlayback.volumeDb);
    setReverbWet(settingsStore.audioPlayback.reverbWet / 100);
    applyChorusEnabled(settingsStore.audioPlayback.chorusEnabled);
  };

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
      console.error('播放和弦失败:', e);
      isPlaying.value = false;
    }
  };

  /** 从低音到高音扫弦式播放当前草稿和弦，力度/时间带随机 humanize，尾部释放完成后自动复位状态 */
  const playCurrentChord = async () => {
    // 不做 isPlaying 早退：释放尾窗口内的重复点击应立即重新扫弦（开头会先释放旧音，不会叠音），
    // 否则点击会被保护窗口静默吞掉，表现为「要点两下才播放」
    isPlaying.value = true;

    try {
      const tone = await ensureToneReady();
      if (!tone) {
        isPlaying.value = false;
        return;
      }

      syncEngineToneSettings();
      releaseSynthNotes();
      const strumDuration = triggerChordStrum(editorStore.draftChord, buildStrumOptions());

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

  // ===== 持续发声（长按试听）：triggerAttack 保持延音，松开后统一释放 =====

  /** 开始持续发声（引擎就绪后按扫弦序 triggerAttack，各弦保持延音） */
  const startChordSustain = async (chord: Chord) => {
    if (isSustaining.value || isPlaying.value) return;
    isSustaining.value = true;
    const ticket = ++sustainTicket;
    try {
      const tone = await ensureToneReady();
      // await 窗口内的状态复检：松手（stopChordSustain 复位）、再次按住（ticket 已被新会话接管）
      // 或切换为播放时，本会话不得再起音——否则会出现「停止后才发声且无人释放」的失控延音/双扫弦
      if (!tone || sustainTicket !== ticket || !isSustaining.value || isPlaying.value) {
        // 仅当仍是本会话时才复位状态，避免误清新会话
        if (sustainTicket === ticket) isSustaining.value = false;
        return;
      }
      syncEngineToneSettings();
      releaseSynthNotes();
      triggerChordSustain(chord, buildStrumOptions());
    } catch (error) {
      console.error('持续发声启动失败:', error);
      if (sustainTicket === ticket) isSustaining.value = false;
    }
  };

  /** 停止持续发声（释放全部延音音符） */
  const stopChordSustain = () => {
    if (!isSustaining.value) return;
    releaseSynthNotes();
    isSustaining.value = false;
  };

  const playNextScoreStep = () => {
    if (!isScorePlaying.value) return;
    if (activeStepIndex >= activeSequence.length) {
      if (!activeLoop) {
        stopScorePlayback();
        return;
      }
      activeStepIndex = 0; // 循环模式：回到序列开头继续
    }

    const currentItem = activeSequence[activeStepIndex]!;
    const chord = 'chord' in currentItem ? currentItem.chord : currentItem;

    currentPlayingStepIndex.value = activeStepIndex;
    activeOnStepCallback?.(activeStepIndex);

    syncEngineToneSettings();
    releaseSynthNotes();
    triggerChordStrum(chord, buildStrumOptions());

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
      /** 播放到末尾后从头循环（默认 false） */
      loop?: boolean;
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
    activeLoop = options?.loop ?? false;

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
    activeLoop = false;
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
    isSustaining.value = false;
    currentPlayingStepIndex.value = -1;
  };

  return {
    isPlaying,
    isScorePlaying,
    currentPlayingStepIndex,
    isSustaining,
    playChord,
    playCurrentChord,
    startChordSustain,
    stopChordSustain,
    startScorePlayback,
    pauseScorePlayback,
    stopScorePlayback,
    disposeAudioEngine,
  };
}
