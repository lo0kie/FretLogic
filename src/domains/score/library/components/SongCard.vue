<template>
  <div
    v-action-card
    v-wave
    v-scroll-into-view.y="selected"
    :aria-label="selected ? `${row.cardAriaLabel}，已选中` : row.cardAriaLabel"
    :aria-pressed="selected"
    :class="stateClasses"
    :data-song-id="row.song.id"
    :title="row.song.title"
    @click="emit('select')"
    data-focusable-outline
    class="song-card-item group/card w-full cursor-pointer rounded-md border p-sm px-md transition-all duration-fast outline-none"
  >
    <div class="flex w-full flex-col gap-2xs">
      <div class="flex w-full items-center justify-between gap-sm">
        <!-- 触发宿主委托给整张卡片：歌名只占行首一条，鼠标停在同一行的空白处（或徽标一侧）时
             同样该开始滚动 -->
        <div v-marquee.fade="{ trigger: '.song-card-item' }" class="min-w-0 flex-1">
          <span :class="selected ? 'font-bold text-primary' : 'font-semibold text-fg-title'" class="text-xs">
            {{ row.song.title }}
          </span>
        </div>

        <div class="flex shrink-0 items-center gap-xs">
          <!-- 拖拽把手的可发现性线索（与工作台面板列表、侧栏分组头同一套写法）：本卡片整张就是拖拽
             把手（useSortableList 未给 handle，整个 .song-card-item 都可抓），故线索落在行尾。
             常驻会污染整列，故默认 opacity-0，悬停本卡时淡入；图标占位始终保留，不产生布局跳动。
             过渡只留 opacity、位移已去掉，原因见 WorkbenchView 的抓手注释。
             显隐跟随**可拖条件**（手动排序且无筛选）而非仅悬停：其余排序方式下拖动无效，挂一个拖不动
             的把手比不挂更糟。
             可拖条件**走 class 而非 v-if**：v-if 是瞬间增删节点，切换排序方式时抓手会当场消失、没有
             任何淡出（而 hover 淡入是平滑的）。改由 opacity 驱动后消失与出现走同一条过渡；代价是
             图标恒占位 —— 正好让徽标在排序方式切换之间不再左右挪。不可拖时补 pointer-events-none：
             图标虽不可见，仍会吃掉命中测试、把光标变成 grab。
             注：触屏没有 hover，此线索对触屏无效，触屏仍靠长按拖拽。 -->
          <BaseIcon
            :class="draggable ? 'group-hover/card:opacity-100' : 'pointer-events-none'"
            class="shrink-0 cursor-grab text-fg-muted opacity-0 transition-opacity duration-base ease-out"
            icon-size="sm"
            name="grip-vertical"
          />

          <template v-if="row.song.singer">
            <BaseBadge
              :appearance="selected ? 'subtle' : 'filled'"
              :aria-label="`歌手 ${row.song.singer}`"
              :title="`歌手：${row.song.singer}`"
              size="2xs"
              variant="neutral"
            >
              <span class="block max-w-[7rem] truncate">{{ row.song.singer }}</span>
            </BaseBadge>
          </template>

          <template v-else>
            <BaseBadge
              :appearance="selected ? 'subtle' : 'filled'"
              :aria-label="row.keyAriaLabel"
              :title="row.keyTitle"
              size="2xs"
              variant="neutral"
              width="2rem"
            >
              <!-- 「调」走 suffix 显式声明：拼进 name 会让整串解析失败、升降号退化成普通字符 -->
              <span v-chord-name="{ name: row.songKeyText, suffix: '调' }" />
            </BaseBadge>

            <BaseBadge
              :appearance="selected ? 'subtle' : 'filled'"
              :aria-label="`变调夹 capo ${row.song.capo} 品`"
              :title="`变调夹 ${row.song.capo} 品`"
              size="2xs"
              variant="neutral"
              width="2.8rem"
            >
              Capo {{ row.song.capo }}
            </BaseBadge>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import BaseBadge from '@/platform/ui/badge/BaseBadge.vue';
import BaseIcon from '@/platform/ui/icons/BaseIcon.vue';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';

import type { SongItemRow } from './songCardRow';

/**
 * 乐谱卡片（乐谱列表的一行）。
 *
 * 「当前选中」的**判定与呈现都归本组件**：判定读 `scoreEditor.activeSongId`，呈现有 5 处
 * （行底/边框、标题字色字重、三处徽标的 appearance、`aria-pressed`、`v-scroll-into-view`）。
 * 此前这些全部内联在 SongSection 的模板里，同一判定出现 8 次 —— 口径一改要跟着改 8 个地方。
 *
 * 「右键命中行」的底色是**列表级**状态（哪个 id 被单例菜单指着），卡片无从得知，仍由宿主下发。
 * 行状态类三选一（选中 / 右键命中 / 常态）写在这里，基类不再写会被覆盖的那几档 —— 也就不需要 `!`。
 */
const { row, menuTarget = false } = defineProps<{
  /** 列表构建期算好的歌曲行视图模型 */
  row: SongItemRow;
  /** 该行是否为右键菜单当前命中的目标（列表级状态） */
  menuTarget?: boolean;
  /**
   * 本行当前是否可拖拽排序（列表级状态，与 useSortableList 的 enabled 同源）。
   * 只有「手动排序且无筛选」时为真；其余排序方式下拖动无效，卡片据此决定是否显示拖拽把手。
   */
  draggable?: boolean;
}>();
const emit = defineEmits<{ (e: 'select'): void }>();

const scoreEditor = useScoreEditorStore();
/** 当前正在编辑（已打开）的乐谱 */
const selected = computed(() => scoreEditor.activeSongId === row.song.id);

const stateClasses = computed(() => {
  if (selected.value)
    return 'border-tint-primary-60 bg-tint-primary-92 hover:border-primary hover:bg-tint-primary-82 hover:shadow-[0_0_0_1px_var(--color-primary)]';
  if (menuTarget) return 'border-border-base bg-surface-panel-hover';
  return 'border-border-light bg-surface-body hover:border-border-base hover:bg-surface-panel-hover';
});
</script>
