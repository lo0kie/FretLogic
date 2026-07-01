<template>
  <div class="helper-action-box flex flex-col gap-2">
    <label class="text-xs font-black uppercase tracking-widest" style="color: var(--text-disabled)"> 系统辅助 </label>

    <div class="flex flex-col gap-4">
      <div class="grid grid-cols-2 gap-2">
        <GlobalTooltip content="生成指板高清切图（背景透明，适合做谱）" placement="top">
          <ActionButton
            @click="chordService.exportFretboardImage('#fretBoard-capture-area', true)"
            :disabled="uiStore.isCopying"
            class="text-xs"
          >
            <span>{{ uiStore.isCopying ? '导出中...' : '复制 (透明)' }}</span>
          </ActionButton>
        </GlobalTooltip>

        <GlobalTooltip content="生成完整工作台切图（带卡片底纹，适合分享）" placement="top">
          <ActionButton
            @click="chordService.exportFretboardImage('#fretBoard-capture-area', false)"
            :disabled="uiStore.isCopying"
            class="text-xs"
          >
            <span>{{ uiStore.isCopying ? '导出中...' : '复制 (带底色)' }}</span>
          </ActionButton>
        </GlobalTooltip>
      </div>

      <div class="helper-inner-panel flex flex-col gap-2 p-3 rounded-xl">
        <div class="flex items-center justify-between">
          <span class="text-[12px] font-bold tracking-wider" style="color: var(--text-muted)"> 指型整体品位平移 </span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <GlobalTooltip content="将指板上按下的所有音符往高品位（琴桥方向）推移" placement="top">
            <ActionButton
              @click="handleShiftFret('down')"
              :disabled="isShiftDownDisabled"
              class="h-8 rounded-lg text-xs"
            >
              <ChevronUp :size="18" stroke-width="3" class="mr-2" />
              <span>上移</span>
            </ActionButton>
          </GlobalTooltip>
          <GlobalTooltip content="将指板上按下的所有音符往低品位（琴头方向）推移" placement="top">
            <ActionButton @click="handleShiftFret('up')" :disabled="isShiftUpDisabled" class="h-8 rounded-lg text-xs">
              <span>下移</span>
              <ChevronDown :size="18" stroke-width="3" class="ml-2" />
            </ActionButton>
          </GlobalTooltip>
        </div>
      </div>

      <ActionButton @click="playCurrentChord" :disabled="editorStore.isFretBoardEmpty || isPlaying">
        <span v-if="editorStore.isFretBoardEmpty">请在左侧指板添加有效音符</span>
        <template v-else>
          <component :is="isPlaying ? Square : Play" class="mr-2" :size="18" stroke-width="3" />
          <span>{{ isPlaying ? '正在试听...' : '试听当前和弦' }}</span>
        </template>
      </ActionButton>

      <ActionButton @click="executeToggleThemeWithAnimation($event)">
        <component :is="settingsStore.isDarkMode ? Moon : Sun" class="mr-2" :size="18" stroke-width="3" />
        <span>{{ settingsStore.isDarkMode ? '深色模式' : '浅色模式' }}</span>
      </ActionButton>

      <div class="helper-inner-panel flex flex-col p-3 rounded-xl">
        <div class="flex items-center justify-between">
          <span class="text-[12px] font-bold tracking-wider pb-2" style="color: var(--text-muted)"> 云端同步配置 </span>
        </div>

        <input
          v-model="settingsStore.githubToken"
          type="text"
          placeholder="GitHub Token (ghp_...)"
          class="helper-sync-input helper-sync-crypto-input w-full text-xs mb-2"
          data-bitwarden-ignore
          autocomplete="off"
        />

        <div class="grid grid-cols-2 gap-2">
          <input
            v-model="settingsStore.githubOwner"
            type="text"
            placeholder="用户名 (Owner)"
            class="helper-sync-input w-full text-xs"
            data-bitwarden-ignore
            autocomplete="off"
          />
          <input
            v-model="settingsStore.githubRepo"
            type="text"
            placeholder="仓库名 (Repo)"
            class="helper-sync-input w-full text-xs"
            data-bitwarden-ignore
            autocomplete="off"
          />
        </div>

        <div class="grid grid-cols-2 gap-2 pt-1 mt-1">
          <GlobalTooltip content="从 GitHub 下载并覆盖本地所有数据" placement="top">
            <ActionButton @click="handleManualPull" warning class="h-8 rounded-lg text-xs">
              <CloudDownload :size="15" stroke-width="3" class="mr-1.5" />
              <span>云端拉取</span>
            </ActionButton>
          </GlobalTooltip>

          <GlobalTooltip content="将本地数据强制推送到 GitHub" placement="top">
            <ActionButton @click="handleManualPush" primary class="h-8 rounded-lg text-xs">
              <CloudUpload :size="15" stroke-width="3" class="mr-1.5" />
              <span>强制同步</span>
            </ActionButton>
          </GlobalTooltip>
        </div>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <Transition
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
      enter-active-class="transition duration-200 ease-out"
      leave-active-class="transition duration-200 ease-in"
    >
      <div v-if="isPullConfirmOpen" class="fixed inset-0 z-[2000] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-950/40 dark:bg-slate-950/60" @click="isPullConfirmOpen = false"></div>

        <div class="modal-card w-80 p-6 relative z-10 animate-modal-in flex flex-col max-h-[80vh]">
          <h3 class="text-xs font-black mb-4 opacity-40 uppercase tracking-widest text-title shrink-0">
            ⚠️ 高危操作确认
          </h3>

          <p class="text-sm font-semibold mb-6 opacity-80 leading-relaxed text-body">
            从云端拉取数据将<span class="text-[var(--color-danger)] font-black">完全覆盖</span
            >您本地的所有和弦与分组记录，且此操作不可撤销！ <br /><br />您确定要继续吗？
          </p>

          <div class="flex gap-2 w-full shrink-0">
            <ActionButton @click="isPullConfirmOpen = false">取消</ActionButton>
            <ActionButton @click="confirmPull" :danger="true">确认覆盖</ActionButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import ActionButton from '@/components/ActionButton.vue';
import GlobalTooltip from '@/components/GlobalTooltip.vue';
import { useAudioPlayer } from '@/composables/useAudioPlayer';
import { useChordService } from '@/services/useChordService';
import { useGithubSyncService } from '@/services/useGithubSyncService';
import { useChordStore } from '@/stores/chordStore';
import { useEditorStore } from '@/stores/editorStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUiStore } from '@/stores/uiStore';
import type { GuitarStringsModel } from '@/types';
import { ChevronDown, ChevronUp, CloudDownload, CloudUpload, Moon, Play, Square, Sun } from '@lucide/vue';
import { computed, ref, toRaw } from 'vue';

const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const editorStore = useEditorStore();
const chordStore = useChordStore();
const chordService = useChordService();
const { syncToGithub, pullFromGithub } = useGithubSyncService();
const { isPlaying, playCurrentChord } = useAudioPlayer();

// 控制拉取弹窗显隐的状态
const isPullConfirmOpen = ref(false);

const hasNoPressedFrets = computed(() => !editorStore.strings.some(s => s.fret > 0));

const isShiftDownDisabled = computed(
  () => editorStore.isFretBoardEmpty || hasNoPressedFrets.value || editorStore.strings.some(s => s.fret === 1)
);

const isShiftUpDisabled = computed(
  () =>
    editorStore.isFretBoardEmpty ||
    hasNoPressedFrets.value ||
    editorStore.strings.some(s => s.fret === editorStore.fretCount)
);

const executeToggleThemeWithAnimation = (event?: MouseEvent) => {
  const rootEl = document.documentElement;
  rootEl.setAttribute('theme-changing', 'true');

  const disableChangingAttribute = () => {
    setTimeout(() => {
      rootEl.removeAttribute('theme-changing');
    }, 350);
  };

  const isSupportViewTransition = 'startViewTransition' in document;
  if (!isSupportViewTransition || !event) {
    settingsStore.isDarkMode = !settingsStore.isDarkMode;
    disableChangingAttribute();
    return;
  }

  const x = event.clientX;
  const y = event.clientY;
  const endRadius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  const transition = (document as any).startViewTransition(() => {
    settingsStore.isDarkMode = !settingsStore.isDarkMode;
  });

  transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
      },
      {
        duration: 350,
        easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        pseudoElement: '::view-transition-new(root)',
      }
    );
  });

  transition.finished.then(() => {
    disableChangingAttribute();
  });
};

const handleShiftFret = (direction: 'up' | 'down') => {
  if (editorStore.isFretBoardEmpty || hasNoPressedFrets.value) return;

  const newStrings = structuredClone(toRaw(editorStore.strings)) as GuitarStringsModel;

  if (direction === 'up') {
    if (newStrings.some(s => s.fret === editorStore.fretCount)) return;
    newStrings.forEach(s => {
      if (s.fret > 0) s.fret += 1;
    });
  } else {
    if (newStrings.some(s => s.fret === 1)) return;
    newStrings.forEach(s => {
      if (s.fret > 0) s.fret -= 1;
    });
  }

  editorStore.strings = newStrings;
  uiStore.showToast('🎸 和弦指型已完成整体平移');
};

const handleManualPush = () => {
  syncToGithub({
    groups: chordStore.groups,
    chords: chordStore.savedChordsList,
  });
};

const handleManualPull = () => {
  isPullConfirmOpen.value = true;
};

// 弹窗中点击确认后执行的方法
const confirmPull = () => {
  pullFromGithub();
  isPullConfirmOpen.value = false;
};
</script>

<style scoped lang="less">
@import '@/assets/tokens.less';

.helper-inner-panel {
  background-color: var(--bg-body);
  border: @border-solid-base;
}

.helper-sync-input {
  .mixin-input-base();
  height: 2rem;
  @apply cursor-pointer font-bold py-0;

  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

.helper-sync-crypto-input {
  -webkit-text-security: disc !important;
}

/* 引入与全局 Modal 组件一致的悬浮卡片样式 */
.modal-card {
  .mixin-floating-layer();
}
</style>
