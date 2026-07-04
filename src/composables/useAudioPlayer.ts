import { AUDIO_CONFIG } from '@/constants/audio';
import { useEditorStore } from '@/stores/editorStore';
import type { PolySynth } from 'tone';
import { onBeforeUnmount, ref } from 'vue';

const isPlaying = ref(false);
let isEngineInitialized = false;
let guitarSynth: PolySynth | null = null;
let playTimer: ReturnType<typeof setTimeout> | null = null;
let ToneInstance: typeof import('tone') | null = null;

export function useAudioPlayer() {
  const editorStore = useEditorStore();

  const initAudioEngine = async (): Promise<typeof import('tone')> => {
    if (!ToneInstance) {
      ToneInstance = await import('tone');
    }

    if (isEngineInitialized) return ToneInstance;

    await ToneInstance.start();

    const reverb = new ToneInstance.Reverb({
      decay: AUDIO_CONFIG.REVERB_DURATION,
      wet: AUDIO_CONFIG.REVERB_WET_GAIN,
    });

    await reverb.generate();

    const compressor = new ToneInstance.Compressor({
      threshold: AUDIO_CONFIG.COMPRESSOR_THRESHOLD,
      knee: AUDIO_CONFIG.COMPRESSOR_KNEE,
      ratio: AUDIO_CONFIG.COMPRESSOR_RATIO,
      attack: AUDIO_CONFIG.COMPRESSOR_ATTACK,
      release: AUDIO_CONFIG.COMPRESSOR_RELEASE,
    });

    guitarSynth = new ToneInstance.PolySynth(ToneInstance.FMSynth, {
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
    guitarSynth.chain(compressor, reverb, ToneInstance.Destination);

    isEngineInitialized = true;
    return ToneInstance;
  };

  const playCurrentChord = async () => {
    if (isPlaying.value) return;

    isPlaying.value = true;

    try {
      const tone = await initAudioEngine();

      if (!guitarSynth) {
        isPlaying.value = false;
        return;
      }

      guitarSynth.releaseAll();

      const stringsSnapshot = editorStore.strings.map(s => ({ fret: s.fret, preferFlat: s.preferFlat }));
      const capoOffset = editorStore.capo > 0 ? editorStore.capo : 0;

      let strumDelay = 0;
      const now = tone.now();

      for (let sIdx = 0; sIdx <= 5; sIdx++) {
        const targetStr = stringsSnapshot[sIdx];

        if (targetStr.fret < 0) continue;

        const guitarMidiBase = editorStore.activeBaseStrings[sIdx];
        const actualOffset = targetStr.fret > 0 ? capoOffset : 0;
        const currentMidiNote = guitarMidiBase + targetStr.fret + actualOffset;

        const frequency = tone.Frequency(currentMidiNote, 'midi').toFrequency();

        const triggerTime = now + strumDelay;
        const humanizeVelocity = 0.82 + Math.random() * 0.18;

        guitarSynth.triggerAttackRelease(frequency, AUDIO_CONFIG.ENV_RELEASE, triggerTime, humanizeVelocity);

        strumDelay += AUDIO_CONFIG.STRUM_DELAY_STEP;
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

  onBeforeUnmount(() => {});

  return { isPlaying, playCurrentChord };
}
