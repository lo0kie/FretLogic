import { ref } from 'vue';

import type * as Tone from 'tone';

import { calcNoteMidi } from '@/services/music/theory';
import { useChordEditorStore } from '@/stores/chordEditorStore';
import { AUDIO_CONFIG } from '@/utils/core/constants';

const isPlaying = ref(false);
let isEngineInitialized = false;
let initPromise: Promise<void> | null = null;
let guitarSynth: Tone.PolySynth | null = null;
let reverbNode: Tone.Reverb | null = null;
let compressorNode: Tone.Compressor | null = null;
let playTimer: ReturnType<typeof setTimeout> | null = null;
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

/** 和弦试听播放器：引擎与播放状态为模块级单例，多个组件共享 */
export function useAudioPlayer() {
  const editorStore = useChordEditorStore();

  /** 从低音到高音扫弦式播放当前草稿和弦，力度/时间带随机 humanize，尾部释放完成后自动复位状态 */
  const playCurrentChord = async () => {
    if (isPlaying.value) return;

    isPlaying.value = true;

    try {
      if (!ToneModule) {
        ToneModule = await import('tone');
      }

      if (ToneModule.getContext().state !== 'running') {
        await ToneModule.start();
      }

      await initAudioEngine();

      if (!guitarSynth) {
        isPlaying.value = false;
        return;
      }

      guitarSynth.releaseAll();

      const stringsSnapshot = editorStore.draftChord.strings.map(s => [...s] as [number, boolean]);

      let strumDelay = 0;
      let notesTriggered = 0;
      const now = ToneModule.now();

      for (let sIdx = 0; sIdx <= 5; sIdx++) {
        const targetStr = stringsSnapshot[sIdx];
        if (!targetStr || targetStr[0] < 0) continue;

        const currentMidiNote = calcNoteMidi(
          sIdx,
          targetStr[0],
          editorStore.draftChord.capo,
          editorStore.activeBaseStrings
        );

        const frequency = getFrequencyFromMidi(currentMidiNote, ToneModule);

        const triggerTime = now + strumDelay;
        const humanizeVelocity = AUDIO_CONFIG.STRUM_VELOCITY_MIN + Math.random() * AUDIO_CONFIG.STRUM_VELOCITY_RANGE;

        guitarSynth.triggerAttackRelease(frequency, AUDIO_CONFIG.ENV_RELEASE, triggerTime, humanizeVelocity);

        strumDelay += AUDIO_CONFIG.STRUM_DELAY_STEP;
        notesTriggered++;
      }

      if (notesTriggered === 0) {
        isPlaying.value = false;
        return;
      }

      if (playTimer) clearTimeout(playTimer);

      playTimer = setTimeout(
        () => {
          isPlaying.value = false;
        },
        (strumDelay + AUDIO_CONFIG.AUDIO_RELEASE_TAIL) * 1000
      );
    } catch (error) {
      console.error('和弦音频引擎调度失败:', error);
      isPlaying.value = false;
    }
  };

  /** 销毁音频引擎的全部节点与定时器（HMR/卸载时防泄漏） */
  const disposeAudioEngine = () => {
    if (playTimer) {
      clearTimeout(playTimer);
      playTimer = null;
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
  };

  return { isPlaying, playCurrentChord, disposeAudioEngine };
}
