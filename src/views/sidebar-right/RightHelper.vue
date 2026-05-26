<template>
  <div class="helper-action-box flex flex-col gap-2">
    <label class="plate-label text-xs font-black tracking-widest uppercase text-subtitle">系统辅助</label>

    <div class="flex flex-col gap-4">
      <ActionButton
        @click="playCurrentChord"
        :disabled="isFretBoardEmpty || isPlaying"
        class="w-full h-9 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all duration-200 bg-main hover:bg-slate-50 dark:hover:bg-slate-800/50 text-body active:scale-[0.98]"
        :class="{ 'opacity-50 cursor-not-allowed': isFretBoardEmpty || isPlaying }"
      >
        <span v-if="isFretBoardEmpty">请添加指板音</span>

        <template v-else>
          <span class="text-sm leading-none">{{ isPlaying ? '⏳' : '🔊' }}</span>
          <span>{{ isPlaying ? '正在试听...' : '试听当前和弦' }}</span>
        </template>
      </ActionButton>

      <div class="fret-shift flex flex-col gap-2 p-3 rounded-xl border bg-slate-50/50 dark:bg-slate-900/20">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-subtitle tracking-wider">指型整体平移</span>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <ActionButton
            @click="handleShiftFret('down')"
            :disabled="isShiftDownDisabled"
            class="h-8 rounded-lg border flex items-center justify-center gap-1 text-xs font-bold transition-all duration-200 bg-main hover:bg-slate-50 dark:hover:bg-slate-800/50 text-body active:scale-[0.98]"
            :class="{ 'opacity-30 cursor-not-allowed text-slate-400': isShiftDownDisabled }"
          >
            <span class="text-xs leading-none rotate-90">◀</span>
            <span>上移</span>
          </ActionButton>

          <ActionButton
            @click="handleShiftFret('up')"
            :disabled="isShiftUpDisabled"
            class="h-8 rounded-lg border flex items-center justify-center gap-1 text-xs font-bold transition-all duration-200 bg-main hover:bg-slate-50 dark:hover:bg-slate-800/50 text-body active:scale-[0.98]"
            :class="{ 'opacity-30 cursor-not-allowed text-slate-400': isShiftUpDisabled }"
          >
            <span>下移</span>
            <span class="text-xs leading-none rotate-90">▶</span>
          </ActionButton>
        </div>
      </div>

      <ActionButton
        @click="uiStore.copyFretBoardToClipboard('#fretBoard-capture-area')"
        :disabled="uiStore.isCopying"
        class="w-full h-9 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all duration-200"
        :class="[
          uiStore.isCopying
            ? 'bg-slate-100 dark:bg-slate-800 opacity-50 cursor-not-allowed text-slate-400'
            : 'bg-main hover:bg-slate-50 dark:hover:bg-slate-800/50 text-body active:scale-[0.98]',
        ]"
      >
        <span class="text-sm leading-none">{{ uiStore.isCopying ? '⌛' : '📸' }}</span>
        <span>{{ uiStore.isCopying ? '正在导出...' : '复制当前到剪切板' }}</span>
      </ActionButton>

      <ActionButton
        @click="chordLabStore.isDarkMode = !chordLabStore.isDarkMode"
        class="w-full h-9 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all duration-200 bg-main hover:bg-slate-50 dark:hover:bg-slate-800/50 text-body active:scale-[0.98]"
      >
        <span class="text-sm leading-none">
          {{ chordLabStore.isDarkMode ? '🌙' : '☀️' }}
        </span>
        <span>
          {{ chordLabStore.isDarkMode ? '深色模式' : '浅色模式' }}
        </span>
      </ActionButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import { useChordLabStore } from '@/stores/chordLabStore'; // 引入数据主脑
import { useUiStore } from '@/stores/uiStore';
import { computed, ref } from 'vue'; // 🌟 引入 ref 模块

const uiStore = useUiStore();
const chordLabStore = useChordLabStore(); // 实例化数据主脑

// 🌟 核心物理锁：标记当前是否正处于发声期
const isPlaying = ref(false);

const isFretBoardEmpty = computed(() => chordLabStore.selectedFrets.every(sIdx => (sIdx ?? -1) < 0));

// ==========================================
// 🌟 核心新增：整体指型平移算法防爆守卫
// ==========================================

// 动态监控：如果有任何实体按点已经撞在了 1 品边界上，则强行禁用“向低品位平移”
const isShiftDownDisabled = computed(() => {
  return isFretBoardEmpty.value || chordLabStore.selectedFrets.some(fret => fret === 1);
});

// 动态监控：如果有任何实体按点已经撞在了当前视窗的最大品格边框上，则强行禁用“向高品位平移”
const isShiftUpDisabled = computed(() => {
  return isFretBoardEmpty.value || chordLabStore.selectedFrets.some(fret => fret === chordLabStore.fretCount);
});

/**
 * 核心平移引擎：执行单向半音矩阵推演
 */
const handleShiftFret = (direction: 'up' | 'down') => {
  if (isFretBoardEmpty.value) return;

  if (direction === 'up') {
    // 再次保底卡死：防止通过非法手段触发
    if (chordLabStore.selectedFrets.some(fret => fret === chordLabStore.fretCount)) return;

    // 实体圆圈整体品位 +1，空弦(0)和静音(-1)在琴颈顶部保持完好不动
    chordLabStore.selectedFrets = chordLabStore.selectedFrets.map(fret => (fret > 0 ? fret + 1 : fret));

    // 🌟 联动：如果之前手动右键标记了主音圆圈，由于弦没有换（只是品往右移），rootMark 数字无需变动，黄色高亮完美保留！
  } else {
    if (chordLabStore.selectedFrets.some(fret => fret === 1)) return;

    // 实体圆圈整体品位 -1
    chordLabStore.selectedFrets = chordLabStore.selectedFrets.map(fret => (fret > 0 ? fret - 1 : fret));
  }

  uiStore.showToast(`🎵 和弦指型已完成整体平移`);
};

// ==========================================
// 🌟 原生 Web Audio API 扫弦听觉引擎
// ==========================================

/**
 * 🌟 纯原生硬核外挂：现场数学合成混响脉冲响应（替代 Tone.Reverb）
 * @param ctx 浏览器音频上下文
 * @param seconds 衰减时间（对齐你的 2.0 秒）
 */
const createReverbBuffer = (ctx: AudioContext, seconds: number) => {
  const rate = ctx.sampleRate;
  const len = rate * seconds;
  const buffer = ctx.createBuffer(2, len, rate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < len; i++) {
      // 指数自然衰减白噪声，像素级还原木质琴箱的自然吸音回响
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
  }
  return buffer;
};

/**
 * 🌟 完美高低音顺序规整版：和弦扫弦听觉引擎
 */
const playCurrentChord = async () => {
  // 🌟 互斥守卫：如果正在发声，直接无条件拦截，坚决不破坏原有时间轴
  if (isPlaying.value) return;

  // 🌟 触发加锁
  isPlaying.value = true;

  // 确保音频上下文和混响器完全就绪 (改回原生原生 AudioContext)
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    isPlaying.value = false;
    return;
  }
  const ctx = new AudioContextClass();

  // 建立原生总线网络：和弦并联 -> 混响/干声混合节点 -> 喇叭
  const mainMixer = ctx.createGain();
  mainMixer.gain.setValueAtTime(0.4, ctx.currentTime); // 整体防爆音主音量控制

  const convolver = ctx.createConvolver();
  convolver.buffer = createReverbBuffer(ctx, 2.0); // 完美对齐 2.0秒 衰减

  const wetGain = ctx.createGain();
  wetGain.gain.setValueAtTime(0.3, ctx.currentTime); // 完美对齐 30% 混响湿声占比

  // 焊接干湿声并联电路
  mainMixer.connect(ctx.destination); // 干声直接去喇叭
  mainMixer.connect(convolver); // 混响副路
  convolver.connect(wetGain);
  wetGain.connect(ctx.destination); // 湿声去喇叭

  const fretsSnapshot = [...chordLabStore.selectedFrets].reverse();
  const capoOffset = chordLabStore.capo > 0 ? chordLabStore.capo : 0;

  let strumDelay = 0;

  // 从 6 弦（低音）向 1 弦（高音）梯级扫描
  for (let sIdx = 5; sIdx >= 0; sIdx--) {
    const fretVal = fretsSnapshot[sIdx];

    // 严格边界过滤：小于 0 的（比如 -1 的 ✕ 禁弹弦）直接跳过，绝对不准漏音
    if ((fretVal ?? -1) < 0) continue;

    const guitarMidiBase = [64, 59, 55, 50, 45, 40][sIdx];

    // 🌟 核心自救修复：引入乐理熔断机制
    const actualCapoOffset = fretVal > 0 ? capoOffset : 0;

    // 绝对半音数 = 该弦物理基准音高 + 实际按品 + 变调夹偏移
    const absoluteHalfTones = guitarMidiBase + fretVal + actualCapoOffset;
    const frequency = 440 * Math.pow(2, (absoluteHalfTones - 69) / 12);

    // 🌟 原生时间轴对齐
    const triggerTime = ctx.currentTime + strumDelay;

    // 🌟 原生 FM 合成器电路克隆（主音振荡器 + 调制振荡器）
    const oscMain = ctx.createOscillator();
    const oscMod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const stringGain = ctx.createGain();

    // 配置调频参数（像素级克隆 Tone.js 的 FMSynth 属性）
    oscMain.type = 'triangle'; // 主音三角波
    oscMain.frequency.setValueAtTime(frequency, triggerTime);

    oscMod.type = 'sine'; // 调制波正弦波
    oscMod.frequency.setValueAtTime(frequency * 1.5, triggerTime); // harmonicity: 1.5
    modGain.gain.setValueAtTime(frequency * 2.5, triggerTime); // modulationIndex: 2.5

    // 🌟 精密微调声学包络
    const attackTime = 0.005;
    const decayTime = 0.15;
    const sustainLevel = 0.3;
    const holdDuration = 0.2;
    const releaseTime = 1.0;

    const envStartTime = triggerTime;
    const envAttackEndTime = envStartTime + attackTime;
    const envDecayEndTime = envAttackEndTime + decayTime;
    const envReleaseStartTime = envStartTime + holdDuration;
    const envReleaseEndTime = envReleaseStartTime + releaseTime;

    stringGain.gain.setValueAtTime(0, envStartTime);
    stringGain.gain.linearRampToValueAtTime(1.0, envAttackEndTime);
    stringGain.gain.linearRampToValueAtTime(sustainLevel, envDecayEndTime);
    stringGain.gain.setValueAtTime(sustainLevel, envReleaseStartTime);
    stringGain.gain.exponentialRampToValueAtTime(0.0001, envReleaseEndTime);

    // 焊接单音调频网络
    oscMod.connect(modGain);
    modGain.connect(oscMain.frequency);
    oscMain.connect(stringGain);
    stringGain.connect(mainMixer);

    // 定点引爆
    oscMain.start(envStartTime);
    oscMod.start(envStartTime);
    oscMain.stop(envReleaseEndTime);
    oscMod.stop(envReleaseEndTime);

    strumDelay += 0.2;
  }

  const totalChordDuration = (strumDelay + 0.2 + 1.0) * 1000;

  setTimeout(() => {
    isPlaying.value = false;
    ctx.close();
  }, totalChordDuration);
};
</script>

<style scoped lang="less">
@import '@/assets/styles/tokens.less';

.helper-action-box {
  button {
    border-color: var(--control-border);
    color: @text-body;

    &:not(:disabled):hover {
      border-color: @brand-primary;
      color: @brand-primary;
    }
  }
}

.fret-shift {
  border-color: var(--control-border);
}
</style>
