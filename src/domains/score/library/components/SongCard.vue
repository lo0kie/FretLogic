<template>
  <div
    v-as-button
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
             常驻会污染整列，故可拖时默认 opacity-0、悬停本卡时淡入；图标占位始终保留，不产生布局跳动。
             过渡只留 opacity、位移已去掉，原因见 WorkbenchView 的抓手注释。
             形态跟随**可拖条件**（手动排序且无筛选）而非仅悬停：其余排序方式下拖动无效，挂一个拖不动
             的把手比不挂更糟 —— **唯一的例外是 dragDisabledReason 有值**：那说明本行本该能拖、只是被
             列表长度挡住了（见 SongSection 的 dragDisabledReason），此时把手以禁用态**常驻**并挂上
             原因提示。两种「不可拖」必须分开：一种是「本排序方式下拖拽没有意义」，用户本来就没打算拖，
             藏掉最干净；另一种是「用户以为能拖、却拖不动」，不把话说出来就只能靠猜。
             可拖条件**走 class 而非 v-if**：v-if 是瞬间增删节点，切换排序方式时抓手会当场消失、没有
             任何淡出（而 hover 淡入是平滑的）。改由 opacity 驱动后消失与出现走同一条过渡；代价是
             图标恒占位 —— 正好让徽标在排序方式切换之间不再左右挪。完全隐藏时补 pointer-events-none：
             图标虽不可见，仍会吃掉命中测试、把光标变成 grab；禁用态则保留命中测试 —— 光标 not-allowed
             与那条 tooltip 都要有个可命中的载体（载体是下面那层 span，不是图标自己，理由见其注释）。
             注：触屏没有 hover，此线索对触屏无效，触屏仍靠长按拖拽。 -->
          <!-- 【为什么外面要包一层 span、图标自己恒 pointer-events-none】图标是装饰性的
               （BaseIcon 根节点带 aria-hidden="true"），但它一旦成为**命中目标**就会被浏览器
               夺焦：Chrome 把 svg 当成可聚焦元素，点它会把 document.activeElement 直接落到这个
               aria-hidden 的 svg 上 —— 于是 Chrome 报「Blocked aria-hidden on an element because
               its descendant retained focus」，焦点也从卡片跑到一枚 14px 的装饰图标上。
               实测 `tabindex="-1"` 与 `focusable="false"` 都拦不住（Chrome 对 svg 不认这两个），
               只有让图标**不再被命中**才行 —— 而 cursor 与 tooltip 又都需要一个可命中的载体，
               故把两者挪到外面这层 span 上（盒子与图标同尺寸，锚点几何不变）。
               顺带修掉一条连带症状：右键另一张卡时若焦点被图标抢走，面板会收到 focusout 而先关闭，
               委托随后再打开就成了「重开一个新菜单」而不是平移过去。 -->
          <span
            v-tooltip="dragDisabledReason"
            :class="dragHandleClass"
            class="flex shrink-0 transition-opacity duration-base ease-out"
          >
            <BaseIcon class="pointer-events-none" icon-size="sm" name="grip-vertical" />
          </span>

          <BaseBadge
            v-if="row.song.singer"
            :appearance="selected ? 'subtle' : 'filled'"
            :aria-label="`歌手 ${row.song.singer}`"
            :title="`歌手：${row.song.singer}`"
            color="neutral"
            size="2xs"
          >
            <span class="block max-w-[7rem] truncate">{{ row.song.singer }}</span>
          </BaseBadge>

          <template v-else>
            <BaseBadge
              :appearance="selected ? 'subtle' : 'filled'"
              :aria-label="row.keyAriaLabel"
              :title="row.keyTitle"
              color="neutral"
              size="2xs"
              width="2rem"
            >
              <!-- 「调」走 suffix 显式声明：拼进 name 会让整串解析失败、升降号退化成普通字符 -->
              <span v-chord-name="{ name: row.songKeyText, suffix: '调' }" />
            </BaseBadge>

            <BaseBadge
              :appearance="selected ? 'subtle' : 'filled'"
              :aria-label="`变调夹 capo ${row.song.capo} 品`"
              :title="`变调夹 ${row.song.capo} 品`"
              color="neutral"
              size="2xs"
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
const {
  row,
  menuTarget = false,
  draggable = false,
  dragDisabledReason = '',
} = defineProps<{
  /** 列表构建期算好的歌曲行视图模型 */
  row: SongItemRow;
  /** 该行是否为右键菜单当前命中的目标（列表级状态） */
  menuTarget?: boolean;
  /**
   * 本行当前是否可拖拽排序（列表级状态，与 useSortableList 的 enabled 同源）。
   * 只有「手动排序且无筛选」时为真；其余排序方式下拖动无效，卡片据此决定是否显示拖拽把手。
   */
  draggable?: boolean;
  /**
   * 拖拽不可用的**原因**（列表级状态）。给了就表示「本行本该能拖、只是现在不行」，把手会以禁用态
   * 常驻并把这条文案挂成 tooltip；为空且 `draggable` 为假时，把手照旧完全隐藏 —— 那是「本排序方式下
   * 拖拽没有意义」，没有需要解释的东西（两种状态的区分见模板里把手的注释）。
   */
  dragDisabledReason?: string;
}>();
const emit = defineEmits<{ (e: 'select'): void }>();

const scoreEditor = useScoreEditorStore();
/** 当前正在编辑（已打开）的乐谱 */
const selected = computed(() => scoreEditor.activeSongId === row.song.id);

/**
 * 拖拽把手的三种形态（判据与 SongSection 的 isDragEnabled / dragDisabledReason 同源）：
 * 可拖 → 悬停本卡淡入 + `grab`；本该可拖但被列表长度挡住 → **常驻**的半透明禁用态 + `not-allowed` +
 * tooltip；本排序方式下拖拽无意义 → 完全隐藏。
 *
 * 禁用态为什么是 `opacity-40` 而不是 `text-fg-disabled`：后者是**失效控件**的前景色，本仓门禁明确把
 * 它排除在正文三档之外，落在卡片底上亮色只有 1.68:1 —— 那是给「已经点了、结果不能用」的控件收尾用
 * 的，而这里恰恰相反：这枚图标**必须被看见**，用户才会去 hover 它、读到那条原因。半透明+禁用光标
 * 是本仓表达「看得见但不可用」的既有写法（见 BaseDropdownItem 的 DISABLED_CLASS）。
 *
 * 禁用态**常驻**、不像可拖态那样等悬停：可拖态的常驻会污染整列（那是纯粹的装饰线索），而禁用态本身
 * 就是「这里原本能拖」的全部可见证据 —— 藏到悬停之后，用户不 hover 卡片就还是什么都不知道。
 *
 * 三态都靠 class 切换、图标恒占位，理由见模板注释（v-if 会让切换没有淡出，且图标一旦真的消失，
 * 徽标会跟着左右挪）。
 */
const dragHandleClass = computed(() => {
  if (draggable) return 'cursor-grab text-fg-muted opacity-0 group-hover/card:opacity-100';
  if (dragDisabledReason) return 'cursor-not-allowed text-fg-muted opacity-40';
  return 'pointer-events-none text-fg-muted opacity-0';
});

/**
 * 选中态**只留一条描边**：原先悬停时还叠了一圈 `shadow-[0_0_0_1px_...]` 的纯扩散发丝边，
 * 而它紧贴 `border` 外沿（扩散 0px），两条 1px 线之间没有任何间隙 —— 观感就是「选中的卡片
 * 有两个外边框」。选中语义由边框色 + 淡底色 + 标题字色字重三处共同承担，不缺这一圈；
 * 悬停的加强改为只提边框色与底色，同样能读出「已选中且正被指着」。
 */
const stateClasses = computed(() => {
  if (selected.value) return 'border-tint-primary-60 bg-tint-primary-92 hover:border-primary hover:bg-tint-primary-82';
  if (menuTarget) return 'border-border-base bg-surface-panel-hover';
  return 'border-border-light bg-surface-body hover:border-border-base hover:bg-surface-panel-hover';
});
</script>
