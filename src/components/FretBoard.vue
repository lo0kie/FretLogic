<script setup lang="ts">
import { inject } from 'vue';

interface Props {
  capo?: number;
  fretCount?: number; // 展示的总品数 (4 或 5)
}

// 长度为 6 的数组，-1表示X，0表示空弦，>0表示品位
const selectedFrets = defineModel<number[]>('selectedFrets', { required: true });
const isDarkMode = inject<Boolean>('isDarkMode');

const props = withDefaults(defineProps<Props>(), {
  capo: 0,
  fretCount: 4,
  isDarkMode: false,
});

const emit = defineEmits<{
  (e: 'update:fret', stringIdx: number, fret: number): void;
  (e: 'toggle:open', stringIdx: number): void;
}>();

// --- 坐标计算常量与方法 ---
const STR_SPACING = 76; // 弦间距
const OFFSET_X = 38; // 起始 X 偏移

const getStrX = (sIdx: number) => OFFSET_X + sIdx * STR_SPACING;

// --- 逻辑辅助 ---
// 这里仅占位，实际业务逻辑（音名计算、根音判断）建议从父组件传入或通过 Composable 引入
const getNoteLabel = (sIdx: number, fret: number) => {
  // 保持你原有的音名获取逻辑
  return '';
};

const checkIfRootNote = (sIdx: number, fret: number) => {
  // 保持你原有的根音判断逻辑
  return false;
};

// 交互处理：将坐标转化为具体的 弦/品 索引
const handleFretClick = (e: PointerEvent) => {
  const svg = e.currentTarget as HTMLElement;
  const rect = svg.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // 计算哪根弦 (0-5)
  const stringIdx = Math.round((x - OFFSET_X) / STR_SPACING);
  // 计算哪个品 (1-fretCount)
  const fret = Math.ceil((y - 60) / 120);

  if (stringIdx >= 0 && stringIdx < 6 && fret >= 1 && fret <= props.fretCount) {
    emit('update:fret', stringIdx, fret);
  }
};
</script>

<template>
  <div class="fretboard-scaler" :class="{ 'scale-down': fretCount === 5 }">
    <div
      class="fretboard-svg-container"
      :style="{ height: fretCount === 4 ? '560px' : '680px' }"
      @pointerdown="handleFretClick"
    >
      <svg
        width="456"
        :height="fretCount === 4 ? 560 : 680"
        :viewBox="fretCount === 4 ? '0 0 456 560' : '0 0 456 680'"
        style="overflow: visible"
      >
        <!-- 弦 (Strings) -->
        <line
          v-for="s in 6"
          :key="'str-' + s"
          :x1="getStrX(s - 1)"
          y1="60"
          :x2="getStrX(s - 1)"
          :y2="60 + fretCount * 120"
          stroke="var(--fret-color)"
          stroke-width="3.5"
        />

        <!-- 品丝 (Frets) -->
        <line
          v-for="f in fretCount + 1"
          :key="'fret-' + f"
          x1="38"
          :y1="60 + (f - 1) * 120"
          x2="418"
          :y2="60 + (f - 1) * 120"
          stroke="var(--fret-color)"
          stroke-width="5.5"
        />

        <!-- 琴枕 (Nut) -->
        <rect x="37" y="52" width="382" height="10" :fill="isDarkMode ? '#f1f5f9' : '#0f172a'" />

        <!-- Capo 标记 -->
        <text
          v-if="capo > 0"
          x="20"
          y="180"
          text-anchor="end"
          dominant-baseline="central"
          font-size="28"
          font-weight="900"
          :fill="isDarkMode ? '#fbbf24' : '#d97706'"
          style="font-style: italic"
        >
          {{ capo }} fr
        </text>

        <!-- 指型圆点与音名 -->
        <template v-for="(fret, sIdx) in selectedFrets" :key="'dot-' + sIdx">
          <g v-if="fret > 0 && fret <= fretCount">
            <circle
              :cx="getStrX(sIdx)"
              :cy="60 + (fret - 1) * 120 + 60"
              r="28"
              :fill="checkIfRootNote(sIdx, fret) ? 'var(--warning-color)' : 'var(--primary-color)'"
            />
            <text
              :x="getStrX(sIdx)"
              :y="60 + (fret - 1) * 120 + 68"
              text-anchor="middle"
              fill="white"
              font-size="22"
              font-weight="900"
            >
              {{ getNoteLabel(sIdx, fret) }}
            </text>
          </g>
        </template>
      </svg>

      <!-- 顶部空弦/静音切换控制 -->
      <div class="absolute top-[-20px] left-0 w-full grid grid-cols-6">
        <div v-for="sIdx in 6" :key="'os-' + sIdx" class="h-[60px] flex items-center justify-center">
          <div
            @click.stop="emit('toggle:open', sIdx - 1)"
            class="toggle-btn"
            :class="selectedFrets[sIdx - 1] === -1 ? 'is-muted' : 'is-open'"
          >
            {{ selectedFrets[sIdx - 1] === -1 ? '✕' : getNoteLabel(sIdx - 1, 0) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
@import '@/styles/variables.less';

.fretboard-scaler {
  transition: transform 0.3s ease;
  transform-origin: top center;
  &.scale-down {
    transform: scale(0.9); // 品数多时稍微缩小防溢出
  }
}

.fretboard-svg-container {
  position: relative;
  margin: 0 auto;
  user-select: none;
  touch-action: none; // 防止移动端滚动干扰
}

.toggle-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 900;
  cursor: pointer;
  transition: all 0.2s;
  .active-press(); // 复用 variables.less 中的混合

  &.is-muted {
    border-color: @danger-color;
    color: @danger-color;
    background: fade(@danger-color, 10%);
  }

  &.is-open {
    border-color: @primary-color;
    color: @primary-color;
  }
}
</style>
