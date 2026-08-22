<template>
  <g
    :class="[interactive ? 'note-interactive' : 'note-disabled', { 'is-pressed-hidden': isPressed }]"
    :tabindex="interactive ? -1 : undefined"
    :aria-label="ariaLabel"
    @click.stop="interactive && $emit('click', $event)"
    @dblclick.prevent.stop="interactive && $emit('toggle-pitch')"
  >
    <!-- 统一的外边框环（Hover / Focus / 键盘聚焦） -->
    <circle
      v-if="isHovered || isFocused"
      :cx="x"
      :cy="y"
      :r="NOTE_DISPLAY.FINGER_OUTLINE_RADIUS"
      :fill="hoverFillColor"
      stroke="var(--color-primary)"
      :stroke-width="NOTE_DISPLAY.FINGER_OUTLINE_WIDTH"
      class="note-outline-ring"
    />

    <!-- 音符主体（未按品被隐藏时显示） -->
    <template v-if="!isPressed">
      <circle
        :cx="x"
        :cy="y"
        :r="NOTE_DISPLAY.FINGER_DOT_RADIUS"
        :fill="noteBgColor"
        :stroke="noteStrokeColor"
        :stroke-width="noteStrokeWidth"
        class="note-circle"
        :class="{ 'is-root-glow': isRoot }"
      />

      <text
        :x="x"
        :y="y"
        text-anchor="middle"
        dy="0.36em"
        :font-size="NOTE_DISPLAY.FINGER_FONT_SIZE"
        font-weight="600"
        :fill="noteTextColor"
        class="note-text"
        style="pointer-events: none"
        aria-hidden="true"
      >
        <template v-if="isMuted"> ✕ </template>
        <template v-else>
          <tspan>{{ label }}</tspan>
          <tspan
            v-if="isAccidental"
            class="note-accidental"
            :font-size="String(Math.round(NOTE_DISPLAY.FINGER_FONT_SIZE * NOTE_DISPLAY.ACCIDENTAL_SCALE))"
            :dy="String(-NOTE_DISPLAY.FINGER_FONT_SIZE * NOTE_DISPLAY.ACCIDENTAL_RAISE_RATIO)"
          >
            {{ preferFlat ? 'b' : '#' }}
          </tspan>
        </template>
      </text>
    </template>

    <!-- 始终存在的透明命中区：即便按品隐藏(is-pressed)也保留可点击区域，
         使弦内有品内音符时仍可点击空弦音切换回空弦/静音 -->
    <circle
      class="note-hit-area"
      :cx="x"
      :cy="y"
      :r="NOTE_DISPLAY.FINGER_DOT_RADIUS"
      fill="transparent"
      style="pointer-events: all"
    />
  </g>
</template>

<script setup lang="ts">
import { FRETBOARD_COLORS, NOTE_DISPLAY } from '@/constants';
import { getFingerColor, getFingerTextColor } from '@/utils/fretboardVisuals';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    x: number;
    y: number;
    label?: string;
    isAccidental?: boolean;
    preferFlat?: boolean;
    isRoot?: boolean;
    isOpenString?: boolean;
    isMuted?: boolean;
    isPressed?: boolean;
    isDarkMode?: boolean;
    interactive?: boolean;
    isHovered?: boolean;
    isFocused?: boolean;
    ariaLabel?: string;
  }>(),
  {
    label: '',
    isAccidental: false,
    preferFlat: false,
    isRoot: false,
    isOpenString: false,
    isMuted: false,
    isPressed: false,
    isDarkMode: false,
    interactive: true,
    isHovered: false,
    isFocused: false,
    ariaLabel: '',
  }
);

defineEmits<{
  (e: 'click', event: MouseEvent): void;
  (e: 'toggle-pitch'): void;
}>();

const hoverFillColor = computed(() => 'var(--fb-hover)');

const noteBgColor = computed(() => {
  if (props.isRoot) {
    return props.isDarkMode ? FRETBOARD_COLORS.rootDark : FRETBOARD_COLORS.rootLight;
  }
  if (props.isOpenString) {
    if (props.isMuted) {
      return props.isDarkMode ? '#351f20' : '#ffefee';
    }
    return props.isDarkMode ? '#182737' : '#ebf4ff';
  }
  return getFingerColor(props.isRoot, props.isDarkMode);
});

const noteStrokeColor = computed(() => {
  if (props.isRoot) return 'transparent';
  if (props.isOpenString) {
    if (props.isMuted) {
      return props.isDarkMode ? '#762b28' : '#ffc4c1';
    }
    return props.isDarkMode ? '#144477' : '#b3d7ff';
  }
  return 'transparent';
});

const noteStrokeWidth = computed(() => (props.isOpenString && !props.isRoot ? 2 : 0));

const noteTextColor = computed(() => {
  if (props.isRoot) {
    return getFingerTextColor(true, props.isDarkMode);
  }
  if (props.isOpenString) {
    if (props.isMuted) {
      return 'var(--color-danger)';
    }
    return 'var(--color-primary)';
  }
  return getFingerTextColor(false, props.isDarkMode);
});
</script>

<style scoped lang="less">
@import '@/assets/tokens.module.less';

.note-interactive {
  cursor: pointer;
  pointer-events: auto;
  outline: none;

  &:hover .note-outline-ring {
    opacity: 1;
  }
}

.note-disabled {
  cursor: default;
  pointer-events: none;
  outline: none;
}

.is-pressed-hidden {
  // 当按品隐藏时，自身主体不显示，但如果有 hover / focus，外圈依然可见
  .note-circle,
  .note-text {
    display: none;
  }
}

.note-circle {
  transition:
    filter @duration-fast ease,
    fill @duration-fast ease,
    stroke @duration-fast ease;
  filter: var(--finger-shadow);

  &.is-root-glow {
    filter: var(--root-glow);
  }
}

.note-text {
  font-family: 'Helvetica Neue', Arial, sans-serif;
  transition: fill @duration-fast ease;
  user-select: none;
}

.note-outline-ring {
  pointer-events: none;
  transition:
    fill @duration-fast ease,
    stroke @duration-fast ease;
}

.note-hit-area {
  pointer-events: all;
}
</style>
