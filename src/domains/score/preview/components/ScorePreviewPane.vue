<template>
  <div class="relative flex min-h-0 flex-1 flex-col">
    <!-- 无 activeSong（即将离场/清除选中）：由父级 ScoreView 统一展示「未选择乐谱」，
         这里渲染空占位避免离场渐隐时闪现本面板自身的空提示 -->
    <div v-if="!scoreEditor.activeSong" class="flex flex-1" />

    <!-- 有乐谱但无歌词：预览无内容，展示面板内独立空提示 -->
    <div v-else-if="!hasLyricsText" class="flex flex-1 items-center justify-center">
      <Feedback
        description="请先在“编辑歌词”模式下输入歌词内容，再查看整曲预览"
        icon="file-text"
        size="lg"
        title="暂无预览内容"
      />
    </div>

    <!-- A4 自动分页预览：整曲渲染为若干 A4 页，横向排开，滚轮左右翻页浏览；
         页面超出视口高度（自定义放大）时切换为纵向浏览：禁用横向翻页滚轮、保留双轴滚动，
         滚轮回归竖向滚动以便阅读超高页 -->
    <template v-else>
      <BaseScrollArea
        :scrollbar="previewScrollbar"
        :wheel="{ disabled: isTallerThanViewport, smooth: true, double: true }"
        close-popovers
        axis="both"
        class="relative min-h-0 flex-1 p-lg"
        ref="previewAreaRef"
      >
        <!-- 内容行：够宽时自动水平居中（mx-auto），超宽时 margin 归 0 自然从左侧滚动；
             页面超出视口高度时改为顶部对齐，避免 Flex 居中在负方向裁切掉页面顶部 -->
        <div
          :class="isTallerThanViewport ? 'min-h-full items-start' : 'h-full items-center'"
          class="mx-auto flex w-max gap-lg"
        >
          <!-- 首帧渲染中 -->
          <Feedback v-if="isRendering && pages.length === 0" description="正在生成预览..." size="lg" type="loading" />

          <!-- 渲染失败（无任何页） -->
          <Feedback
            v-else-if="!isRendering && errorMessage && pages.length === 0"
            :description="errorMessage"
            @action="generate(true)"
            action-text="重试"
            size="sm"
            type="error"
          />

          <!-- 分页页流：按缩放模式决定高度（自适应=容器内容盒高，自定义=按百分比等比），横向排列。
               容器首次测量前（containerHeight=0）禁用高度过渡：此时自适应页高回退整页高会先渲染放大尺寸，
               测量完成回落到实际比例——带过渡会回放“从大缩小”的闪动，未测量期禁用后同帧落位无动画 -->
          <!-- content-visibility:auto：屏外页跳过渲染与位图解码（每页 794×1123@DPR2 ≈14MB 解码，
               20 页全部即刻解码峰值可达数百 MB）；contain-intrinsic-size 兜住估算高度防滚动条跳动 -->
          <div
            v-for="(url, index) in pages"
            :class="[
              menuTargetIndex === index ? 'outline-primary' : 'outline-transparent',
              containerHeight > 0
                ? 'transition-[outline,box-shadow,ring-color,height]'
                : 'transition-[outline,box-shadow,ring-color]',
            ]"
            :key="url"
            :style="{
              height: renderedPageHeight,
              contentVisibility: 'auto',
              containIntrinsicSize: `auto ${renderedPageHeight}`,
            }"
            @contextmenu.prevent="handlePageContextMenu($event, index)"
            class="relative block w-auto overflow-hidden rounded-sm shadow-panel ring-1 ring-transparent outline-2 -outline-offset-2 duration-fast ease-out select-none hover:shadow-floating hover:ring-glass-border"
          >
            <img
              :alt="`乐谱预览第 ${index + 1} 页`"
              :src="url"
              class="block h-full w-auto select-none"
              decoding="async"
              draggable="false"
            />

            <!-- 页脚页码合成层：页图不含页码，此处按开关叠加（与导出走同一绘制函数，逐像素同源） -->
            <ScorePageFooter
              v-if="settingsStore.scoreShowFooter"
              :color="footerMarkColor"
              :page-height="previewPageSize.height"
              :page-index="index"
              :page-margin="settingsStore.scorePageMargin"
              :page-width="previewPageSize.width"
              :scale="activePercent / 100"
            />
          </div>
        </div>
      </BaseScrollArea>

      <!-- 右下角缩放胶囊：复用 BaseFloatingPill（sm 紧凑形态），适应开关 + 毛玻璃百分比步进器 -->
      <BaseFloatingPill
        :bottom="'1.5rem'"
        :safe-area-inset="false"
        :z-index="'z-float'"
        disabled-teleport
        align="end"
        aria-label="预览缩放控制"
        position="absolute"
        size="sm"
      >
        <template v-if="!isFitMode">
          <BaseSlider
            v-model="customZoomPercent"
            :default-value="PREVIEW_DEFAULT_ZOOM_PERCENT"
            :formatter="val => `${Math.round(val)}%`"
            :max="PREVIEW_MAX_ZOOM_PERCENT"
            :min="PREVIEW_MIN_ZOOM_PERCENT"
            :show-buttons="false"
            :step="2"
            bordered
            wheel-on-hover
            readout-position="left"
            size="sm"
          />

          <BaseDivider
            class="rounded-full opacity-60"
            color="base"
            length="1rem"
            orientation="vertical"
            thickness="0.125rem"
          />
        </template>

        <BaseCheckbox
          v-model="isFitMode"
          v-tooltip="'自适应窗口高度'"
          buttonized
          icon-only
          aria-label="自适应窗口高度"
          icon="scan"
          size="sm"
          title="自适应窗口高度"
        />
      </BaseFloatingPill>
    </template>

    <!-- 右键单页的上下文菜单：复制 / 下载当前页（零尺寸挂载于根层，不参与滚动内容）；
         标题行展示当前乐谱标题 + 页码 + 当前页图片大小预估 -->
    <BaseMenu
      :items="pageMenuItems"
      :title="menuTitle"
      @close="menuTargetIndex = -1"
      ref="previewMenuRef"
      trigger="contextmenu"
    />
  </div>
</template>

<script lang="ts">
/**
 * 模块级记忆的滚动容器高度：预览页 v-if 重挂载（切 tab 回来）时 ResizeObserver 的异步测量
 * 滞后于首帧渲染，若首帧拿到 0 会令自适应页高回退整页高——页面先放大再回落产生闪动。
 * 用上次会话的测量值兜底，保证重挂载首帧即为正确比例（组件单实例，模块级即实例级）。
 */
</script>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  ref,
  toRef,
  useTemplateRef,
  watch,
} from 'vue';

import { useDebounceFn, useElementSize, useEventListener } from '@vueuse/core';

import ScorePageFooter from '@/domains/score/preview/components/ScorePageFooter.vue';
import BaseCheckbox from '@/platform/ui/checkbox/BaseCheckbox.vue';
import BaseDivider from '@/platform/ui/divider/BaseDivider.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseFloatingPill from '@/platform/ui/floating-bar/BaseFloatingPill.vue';
import BaseMenu from '@/platform/ui/menu/BaseMenu.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import BaseSlider from '@/platform/ui/slider/BaseSlider.vue';
import { computeChordFingerprint } from '@/domains/chord/theory/theory';
import { resolveFretboardCanvasPalette } from '@/domains/fretboard/fretboardCanvasPalette';
import { computeBarresSignature } from '@/domains/fretboard/model/coordinates';
import {
  getScorePageSize,
  PREVIEW_DEFAULT_ZOOM_PERCENT,
  PREVIEW_MAX_ZOOM_PERCENT,
  PREVIEW_MIN_ZOOM_PERCENT,
  PREVIEW_WHEEL_ZOOM_SENSITIVITY,
  SCORE_PREVIEW_DEBOUNCE_MS,
} from '@/domains/score/constants';
import { useScoreLinesData } from '@/domains/score/editor/composables/useScoreLinesData';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import {
  currentRenderData,
  getCachedRender,
  isPreviewRendering,
  putCachedRender,
  readA4PageBlob,
  setCurrentRender,
} from '@/domains/score/preview/scorePreviewCache';
import {
  buildExportFileName,
  triggerBlobDownload,
  writeBlobToClipboard,
} from '@/domains/score/preview/services/scoreExportCanvas';
import { runWorkerExport } from '@/domains/score/preview/services/workerExportService';
import { useScoreRenderPayload } from '@/domains/score/preview/useScoreRenderPayload';
import { activeTheme, isDark } from '@/platform/composables/useTheme';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';
import { formatBytes } from '@/platform/utils/common';

import type { PreviewRenderData } from '@/domains/score/preview/scorePreviewCache';
import type { MenuItem } from '@/platform/ui/menu/types';
import type { ScrollAreaHandle, ScrollAreaScrollbar } from '@/platform/ui/scroll-area/scrollAreaHandle';

defineOptions({ name: 'ScorePreviewPane' });

// ===== 会话级 A4 分页预览缓存已下沉至 scorePreviewCache 共享模块 =====
let rememberedContainerHeight = 0;

/** 当前展示页流对应的渲染数据（含各页字节数 + 长图产物）：切歌/生成时由 applyEntry 同步更新，
 *  右键菜单标题直接读数；同时写入共享缓存供 TopHeader 下载菜单复用，避免重复渲染 */
const applyEntry = (data: PreviewRenderData | null) => {
  setCurrentRender(data);
  pages.value = data ? data.a4Urls : [];
};

const scoreEditor = useScoreEditorStore();
const settingsStore = useSettingsStore();
const uiStore = useUiStore();
const { chordsLookupMap } = useScoreLinesData();

const hasLyricsText = computed(() => Boolean(scoreEditor.activeSong?.lyrics?.trim()));

// Worker 渲染载荷统一构建（全曲行索引 + 设置项读取），与 TopHeader 导出共享同一来源
const { getAllLineIndices, buildRenderPayload, composePageFooter } = useScoreRenderPayload();

/** 整曲全部行索引：预览始终覆盖全曲（不随选中行变化） */
const allLineIndices = computed<number[]>(() => getAllLineIndices());

const pages = ref<string[]>([]);
const isRendering = ref(false);
const errorMessage = ref('');
let runToken = 0;
let currentContentKey = '';
let isPaneActive = true;

/** 「更新中」常驻 LOADING Message：仅在实际渲染（已有页面）时弹出，渲染结束统一移除。
 *  LOADING 型不自动销毁，故用 id 手动 remove；首次构建（无页）仍由内容区居中加载框承担，不弹 Message */
let updateMessageId: number | null = null;
const showUpdateMessage = () => {
  if (updateMessageId === null) {
    updateMessageId = uiStore.message.loading('预览更新中…', { closable: false });
  }
};
const dismissUpdateMessage = () => {
  if (updateMessageId !== null) {
    uiStore.removeMessage(updateMessageId);
    updateMessageId = null;
  }
};

/** 内容缓存键：内容/调式/标题/变调夹/暗色/简写任一变化即视为失效并重新渲染。
 *  「显示页脚」刻意不在键内：页脚是独立合成层（见 services/footerOverlay），
 *  开关只影响叠在页图之上的页码层，既不该触发重渲染，也不该为同一首歌多存一份缓存。 */
const buildContentKey = () => {
  const song = scoreEditor.activeSong;
  if (!song) return '';

  // 以「当前乐谱各槽位实际引用的和弦渲染指纹」作为和弦维度：任一槽位引用的和弦姿势/名称变化
  // 都使键失效。不能只按 chordsLookupMap（整个和弦库）的数量判定——排列「库中已存在」的和弦时
  // 库数量不变，会命中旧的渲染缓存导致预览不更新。查不到的和弦以 ?<id> 占位兜底。
  const refSignatures: string[] = [];
  for (const slots of song.chordMap.values()) {
    for (const chordId of [...slots.char.values(), ...slots.start, ...slots.end]) {
      const chord = chordsLookupMap.value.get(chordId ?? '');
      // 指纹不含 barres，须并拼横按签名（与 scoreExportCanvas 同构）：
      // 否则仅改横按时键不变，预览/右键下载/PDF/ZIP 全部陈旧
      refSignatures.push(
        chord ? `${computeChordFingerprint(chord)}:${computeBarresSignature(chord.barres)}` : `?${chordId}`
      );
    }
  }
  refSignatures.sort();

  // timeSignature 参与谱面绘制（页眉拍号标记），必须入键——否则改拍号只靠 _v${song.version}
  // 侥幸失效（改拍号会 touchSong bump version，但键维度完整性不应依赖这条间接保证）
  return `${song.id}_${song.title}_${song.singer}_${song.playKey}_ok${song.originalKey}_ts${song.timeSignature}_c${song.capo}_v${song.version}_${song.lyrics}_d${isDark.value}_sh${settingsStore.scoreChordShorthand}_br${settingsStore.scoreShowBarre ? 1 : 0}_al${settingsStore.scoreLayoutAlign}_fw${settingsStore.scoreLyricsFontWeight}_q${settingsStore.scoreExportQuality}_pm${settingsStore.scorePageMargin}_ps${settingsStore.scorePageSize}_fz${scoreEditor.previewFontScale}_fb${scoreEditor.previewFretboardScale}_ies${settingsStore.scoreIgnoreEmptySpace ? 1 : 0}_ref${refSignatures.length}_${refSignatures.join('|')}`;
};

/** 响应式内容键：内容/排版任一依赖变化即重算，作为「重渲染触发」的单一 watch 源 */
const reactiveContentKey = computed(() => buildContentKey());

/** 整曲渲染：Worker 离屏渲染 A4 分页（预览展示 / 右键下载本页 / Header 的 PDF·ZIP 下载均复用此结果），
 *  结果一次写入共享缓存，UI 层（预览页流 / 右键菜单 / Header 下载菜单）直接读数，不再各算各的 */
const generate = async (force = false) => {
  const song = scoreEditor.activeSong;
  if (!song || allLineIndices.value.length === 0) {
    applyEntry(null);
    currentContentKey = '';
    return;
  }

  // 读响应式内容键（computed 缓存）：同一 tick 内已被 watch 求值过则直接取用，不再重建整串
  const contentKey = reactiveContentKey.value;

  // 命中缓存：直接展示已渲染的页流（同内容来回切换/重进预览标签零重复渲染）
  const cached = getCachedRender(contentKey);
  if (!force && cached && cached.a4Urls.length > 0) {
    applyEntry(cached);
    currentContentKey = contentKey;
    isRendering.value = false;
    errorMessage.value = '';
    dismissUpdateMessage();
    return;
  }

  const token = ++runToken;
  isRendering.value = true;
  isPreviewRendering.value = true;
  errorMessage.value = '';
  // 已有页面的增量更新才弹「更新中」Message；首次构建（无页）留给内容区居中加载框
  if (pages.value.length > 0) showUpdateMessage();
  try {
    // isObsolete：连续编辑期间的过期渲染在排队阶段即被判废，不占用渲染线程
    const a4Result = await runWorkerExport(buildRenderPayload('a4'), {
      isObsolete: () => token !== runToken,
    });
    if (token !== runToken) return;
    if (a4Result.blobs.length === 0) throw new Error('未能生成有效的预览数据');

    const a4Urls = a4Result.blobs.map(blob => URL.createObjectURL(blob));
    // 各页字节数与原始 Blob 随渲染数据一并缓存：生成时 Blob 即在内存，直接取用免二次 fetch
    const a4Sizes = a4Result.blobs.map(blob => blob.size);

    const entry: PreviewRenderData = {
      a4Urls,
      a4Sizes,
      a4Blobs: a4Result.blobs,
      pageSize: settingsStore.scorePageSize,
      pageMargin: settingsStore.scorePageMargin,
    };
    currentContentKey = contentKey;
    putCachedRender(contentKey, entry, song.id);
    applyEntry(entry);
  } catch (err) {
    if (token === runToken) {
      errorMessage.value = err instanceof Error ? err.message : '预览生成失败';
    }
  } finally {
    if (token === runToken) {
      isRendering.value = false;
      isPreviewRendering.value = false;
      dismissUpdateMessage();
    }
  }
};

const debouncedGenerate = useDebounceFn(() => generate(), SCORE_PREVIEW_DEBOUNCE_MS);

/** 作废进行中的异步导出：runToken 自增使过期 token 的回写被丢弃；切歌/切走与真卸载共用 */
const cancelPendingExport = () => {
  debouncedGenerate.cancel();
  // 不 revoke：页 URL 已写入模块级缓存，切回预览可复用；内存由 LRU 容量控制
  runToken++;
  isRendering.value = false;
  isPreviewRendering.value = false;
  dismissUpdateMessage();
};

// ===== 单页右键菜单：复制 / 下载当前页图 =====
const previewMenuRef = ref<InstanceType<typeof BaseMenu> | null>(null);
const menuTargetIndex = ref(-1);
/**
 * 各页图片字节数：直接读共享缓存 currentRenderData（含 a4Sizes），不另立缓存结构，
 * 随预览渲染/切歌同步刷新、随 LRU 驱逐回收。
 */

/** 当前右键页的字节数，未取回前为 null（currentRenderData 由 applyEntry 在切歌/生成时同步设定） */
const menuPageSize = computed(() => {
  const i = menuTargetIndex.value;
  const data = currentRenderData.value;
  return data && i >= 0 && i < data.a4Sizes.length ? data.a4Sizes[i] : null;
});

/** 右键菜单标题：当前页图片大小预估 */
const menuTitle = computed(() => {
  const cur = menuPageSize.value != null ? formatBytes(menuPageSize.value) : '…';
  return `预估文件 ${cur}`;
});

/** 预览横向滚动容器元素（尺寸测量 / 缩放滚轮绑定 / 滚动位置存取都需要元素本身） */
const previewAreaRef = useTemplateRef<ScrollAreaHandle>('previewAreaRef');
const previewScrollRef = useScrollAreaElement(previewAreaRef);
/**
 * 预览滚动时收起单页右键菜单：该菜单锚点是零尺寸 contextmenu 包裹层，挂在预览根层（BaseScrollArea 之外），
 * 平台 closePopovers 机制按「锚点是否在滚动区内」精确关闭收不到它，故在此手动联动。
 * 右键菜单弹出期间滚动预览，菜单应随内容一起消失，避免悬在错位位置。
 */
const closeMenuOnPreviewScroll = () => previewMenuRef.value?.closeMenu('preview-scroll');
watch(previewScrollRef, (el, prev) => {
  prev?.removeEventListener('scroll', closeMenuOnPreviewScroll);
  el?.addEventListener('scroll', closeMenuOnPreviewScroll);
});
onBeforeUnmount(() => previewScrollRef.value?.removeEventListener('scroll', closeMenuOnPreviewScroll));
/** 滚动位置存档：双轴，纵向浏览（放大超高模式）切 Tab 后同样回位；
 *  本面板以固定 key 跨歌复用实例，切歌时由渲染重置流程归零 */
let savedScroll = { top: 0, left: 0 };

// ===== 缩放控制：自适应满高 + 自定义百分比（Ctrl+滚轮/捏合/步进器三通道） =====
/** 是否为自适应模式：页面满高贴合滚动容器，随窗口缩放（持久化于 settingsStore，切歌保留） */
const isFitMode = toRef(settingsStore, 'previewFitMode');
/** 自定义缩放百分比（离开自适应模式后生效，持久化于 settingsStore 保留用户偏好） */
const customZoomPercent = toRef(settingsStore, 'previewZoomPercent');

/** 滚动容器可视高度（px）：自适应百分比与超高判定的基准 */
const { height: measuredContainerHeight } = useElementSize(previewScrollRef);
/** 测量结果写回模块级记忆，供下次重挂载的首帧使用 */
watch(measuredContainerHeight, h => {
  if (h > 0) rememberedContainerHeight = h;
});
/** 滚动容器可视高度（px，content-box）：自适应页高与超高判定的基准（重挂载首帧用记忆值兜底） */
const containerHeight = computed(() => measuredContainerHeight.value || rememberedContainerHeight);

/** 当前选中的单页尺寸（按 settingsStore.scorePageSize 档位解析，未命中回退 A4）；预览页高/超高判定以此为基准 */
const previewPageSize = computed(() => getScorePageSize(settingsStore.scorePageSize));

/** 单页在指定百分比下的显示高度（px，取整到整像素）：百分比只是对外读数，布局真值一律走 px */
const pageHeightAt = (percent: number): number => Math.round((previewPageSize.value.height * percent) / 100);

/** 视口可用高度（px，向下取整）：自适应目标高与超高判定共用同一个取整值。
 *  取整方向必须向下——目标高恒 ≤ 真实内容盒高，页面才不会因不足 1px 的越界被判超高 */
const availableHeight = computed(() => Math.floor(containerHeight.value));

/** 自适应模式下的页面显示高度（px）：直接取滚动容器的内容盒高，即内容行 h-full 的高度，
 *  图片满高贴合、上下不再空档。
 *  刻意不经「换算百分比 → 再乘回页高」的取整回环：该回环有最多 ±0.5%（A4 约 ±6px）的误差，
 *  会把页高推过内容盒高而被判超高 → 切顶部对齐 + 禁用横向翻页滚轮，此时原生纵向又无可滚距离，
 *  滚轮彻底失灵。旧写法靠 PREVIEW_FIT_PADDING（上下合计 48px）兜住这段误差，代价是自适应态下
 *  图片恒比满高的行矮 48px（每侧 24px）——现由向下取整从构造上保证不越界，留白回归容器自身 py-4。
 *  容器尚未测量（0）时回退整页高：宁可按 100% 渲染等测量落地，压成 0 高更糟。
 *  下限与自定义态同源（MIN 百分比）：视口极矮时不把页面压成一条线，交由超高判定转纵向浏览 */
const fitPageHeight = computed(() => {
  if (availableHeight.value <= 0) return previewPageSize.value.height;
  return Math.max(pageHeightAt(PREVIEW_MIN_ZOOM_PERCENT), availableHeight.value);
});

/** 自适应态的等效百分比：由实际显示高度反推，只作读数与页脚画布的栅格分辨率，不参与布局 */
const fitZoomPercent = computed(() => Math.round((fitPageHeight.value / previewPageSize.value.height) * 100));

/**
 * 当前生效的缩放百分比（供 Ctrl+滚轮读写与页脚画布的栅格清晰度）：
 * 读：自适应态取等效百分比；写：滚轮缩放自动解除自适应并写入自定义值
 */
const activePercent = computed<number>({
  get: () => (isFitMode.value ? fitZoomPercent.value : customZoomPercent.value),
  set: val => {
    isFitMode.value = false;
    customZoomPercent.value = Math.min(PREVIEW_MAX_ZOOM_PERCENT, Math.max(PREVIEW_MIN_ZOOM_PERCENT, val));
  },
});

/** 页面显示高度（px，布局真值）：自适应态 = 容器内容盒高，自定义态 = 自定义百分比换算高。
 * 不在自适应态写 '100%'——% 与 px 混合插值不可靠会导致切换时高度闪跳；同为 px 后过渡平滑且两态数值同源 */
const renderedPageHeightPx = computed(() =>
  isFitMode.value ? fitPageHeight.value : pageHeightAt(customZoomPercent.value)
);

/** 页面渲染高度（内联样式）：真值统一由 renderedPageHeightPx 提供，此处只做单位拼接 */
const renderedPageHeight = computed(() => `${renderedPageHeightPx.value}px`);

/** 页脚页码层的文字色：取值同导出配色的弱化文字色（页图会因主题变化重渲，两者同步） */
const footerMarkColor = ref(resolveFretboardCanvasPalette().SUB_TEXT);
// 主题切换后重新解析 --fbc-*；仅靠 isDark 接不住 light ↔ high-contrast（两者都算非 dark）
watch(activeTheme, () => {
  footerMarkColor.value = resolveFretboardCanvasPalette().SUB_TEXT;
});

/** 页面是否超出视口可用高度：决定顶部对齐、纵向滚动浏览与禁用横向翻页滚轮。
 *  判据是「实际显示高度 > 真实内容盒高」——两侧同为 px、无百分比取整回环，故不会抖动；
 *  自适应态由 availableHeight 的向下取整从构造上保证不越界，仅容器矮到触 MIN 下限时为真。
 *  判据里不得再对内容盒高做任何内边距修正：containerHeight 已是 content-box（排除 p-6 内边距），
 *  旧写法在这里多扣一次内边距，把「页面尚能放下、无纵向溢出」的一段放大倍率误判为超高——
 *  该区间 v-wheel-scroll 被禁用而原生又无纵向可滚距离，滚轮完全无响应（横向翻页失灵）。
 *  也不留正向容差：真实溢出哪怕 1px 也须切顶部对齐（items-center 会在负方向裁掉页面顶部） */
const isTallerThanViewport = computed(() => renderedPageHeightPx.value > containerHeight.value);

/** Ctrl+滚轮 / 触控板捏合：拦截浏览器页面缩放，按 deltaY 平滑换算预览百分比 */
useEventListener(
  previewScrollRef,
  'wheel',
  (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const raw = activePercent.value - e.deltaY * PREVIEW_WHEEL_ZOOM_SENSITIVITY;
    activePercent.value = Math.round(raw);
  },
  { passive: false }
);

/** 右键某页：记录目标页码并在光标处打开上下文菜单（单页大小已在共享缓存 currentRenderData 中，无需额外取数） */
const handlePageContextMenu = (e: MouseEvent, index: number) => {
  menuTargetIndex.value = index;
  void previewMenuRef.value?.openMenuAt(e.clientX, e.clientY);
};

// ===== 页码读数：挂在横向滚动条上的滚动气泡 =====
/** 页码读数自动淡出时延（ms）：滚动停顿超过该时长即淡出。
 *  这是气泡自身的节奏；滚动条先淡出时（未悬停 → autoHide 400ms）会把读数一并收起，
 *  悬停期间拇指常显、才轮到这里的 1200ms 生效——两者不会再各走各的 */
const PAGE_HINT_AUTO_HIDE_MS = 1200;
/** 读数（`当前页 / 总页数`，1 基）：把横向可滚动距离均分为总页数段，落点在第几段就是第几页 ——
 *  progress=0 为首页、progress=1 为末页，每跨过 1/total 的进度即进一页。
 *  页流等宽等距排列，故进度与页序线性对应；末页单独 clamp，避免 progress 取到 1 时越界 */
const pageHintFromProgress = (progressX: number): string => {
  const total = pages.value.length;
  if (total <= 0) return '';
  return `${Math.min(total, Math.floor(progressX * total) + 1)} / ${total}`;
};

/** 横向滚动条气泡：读数随拇指中位移动，滚动时浮现、闲置后淡出。
 *  与拇指同一判据 —— 无横向可滚余量（单页 / 页流窄于视口）时结构性隐藏，
 *  不会留下「没有滚动条却挂着页码」的孤悬读数。
 *  axis 既是读数归属也是触发条件：只有横向滚动才浮现（纵向滚动时读数并没变，指令不显形）；
 *  读数变化走逐字符翻页（bubble.roll 默认开），「3 / 12 → 4 / 12」只有数字翻动、"/ 12" 保持静止。
 *  format 只在滚动时读取 pages，故 computed 不因页数变化而重建（引用稳定，指令侧只做替换不重建滚动条） */
const previewScrollbar = computed<ScrollAreaScrollbar>(() => ({
  bubble: {
    axis: 'x',
    hideDelay: PAGE_HINT_AUTO_HIDE_MS,
    format: ({ progressX }) => pageHintFromProgress(progressX),
  },
}));

/** 读取指定页的原始 Blob（统一走缓存模块的 object URL 读回）。
 *  缓存页面不含页脚，故按开关合成后再交给剪贴板 / 下载，产物与预览所见一致。 */
const fetchPageBlob = async (index: number): Promise<Blob | null> => {
  const url = pages.value[index];
  if (!url) return null;
  const blob = await readA4PageBlob(url);
  if (!blob) return null;
  // 页脚按缓存渲染时的纸张档位与边距合成，不读实时设置（改设置在途窗口内两者可能不一致）
  const [composed] = await composePageFooter(
    [blob],
    [index],
    currentRenderData.value?.pageSize,
    currentRenderData.value?.pageMargin
  );
  return composed ?? blob;
};

/** 复制指定页到系统剪贴板（JPEG 不兼容时自动转 PNG 写入） */
const copyPage = async (index: number) => {
  const blob = await fetchPageBlob(index);
  if (!blob) {
    uiStore.message.warning('该页数据不可用（可能尚未渲染完成），请稍后重试');
    return;
  }
  try {
    await writeBlobToClipboard(blob);
    uiStore.message.success('已复制当前页到剪贴板');
  } catch (err) {
    uiStore.message.error(err instanceof Error ? err.message : '复制失败');
  }
};

/** 下载指定页为独立图片文件 */
const downloadPage = async (index: number) => {
  const blob = await fetchPageBlob(index);
  if (!blob) {
    uiStore.message.warning('该页数据不可用（可能尚未渲染完成），请稍后重试');
    return;
  }
  const baseName = buildExportFileName(scoreEditor.activeSong?.title || '');
  triggerBlobDownload(blob, `${baseName}_${index + 1}.jpg`);
  uiStore.message.success('已开始下载');
};

const pageMenuItems = computed<MenuItem[]>(() => [
  {
    label: '复制本页',
    icon: 'copy',
    action: () => {
      void copyPage(menuTargetIndex.value);
    },
  },
  {
    label: '下载本页',
    icon: 'download',
    action: () => {
      void downloadPage(menuTargetIndex.value);
    },
  },
]);

/**
 * 监听当前歌曲 ID 切换：
 * 属于离散的用户选择行为，绝不走 150ms 防抖；
 * - 若目标歌曲命中缓存：立即同步切图，实现 0ms 瞬间切换；
 * - 若未命中缓存：立即清空旧图进入 loading 态，绝不带着上一张乐谱等待异步渲染；
 * - 同步重置翻页滚动位置至起始点。
 */
watch(
  () => scoreEditor.activeSong?.id,
  (newId, oldId) => {
    if (newId === oldId) return;
    cancelPendingExport();
    savedScroll = { top: 0, left: 0 };
    if (previewScrollRef.value) {
      previewScrollRef.value.scrollTop = 0;
      previewScrollRef.value.scrollLeft = 0;
    }

    if (!scoreEditor.activeSong || !hasLyricsText.value) {
      applyEntry(null);
      currentContentKey = '';
      return;
    }

    // 仅在当前处于预览标签激活状态时，切歌才同步触发导出生成；
    // 若在编辑歌词或排列和弦标签休眠（已失活），绝不在后台抢跑 Worker 耗能，待切回预览标签时（onActivated）由唤醒守卫按需生成
    if (!isPaneActive) {
      applyEntry(null);
      currentContentKey = '';
      return;
    }

    const contentKey = reactiveContentKey.value;
    const cached = getCachedRender(contentKey);
    // 缓存命中直接消费，重新生成由 generate 完成后消费
    if (cached && cached.a4Urls.length > 0) {
      applyEntry(cached);
      currentContentKey = contentKey;
      isRendering.value = false;
      errorMessage.value = '';
    } else {
      applyEntry(null);
      currentContentKey = '';
      void generate();
    }
  }
);

/**
 * 监听当前歌曲内部内容与排版微调：
 * 走 150ms 防抖重渲染，避免用户编辑歌词/切换开关时高频触发导出。
 * 激活判定必须放在**监视源**（isPaneActive && reactiveContentKey 的 computed）：
 * 放回调里时 computed 仍会作为 watch 源被求值——KeepAlive 休眠的预览面板在用户于
 * 编辑标签打字期间，每次键入都要 O(槽位) 算指纹+横按签名+排序+含全歌词的字符串拼接，
 * 算完再丢弃（对照上方切歌 watch 的同款修法）。
 */
const activeContentKey = computed(() => (isPaneActive ? reactiveContentKey.value : ''));
watch(
  activeContentKey,
  key => {
    if (!key) return;
    debouncedGenerate();
  },
  { immediate: false }
);

onActivated(async () => {
  isPaneActive = true;
  const contentKey = reactiveContentKey.value;
  // 唤醒守卫：如果休眠（在其他 Tab）期间切过歌或改过内容，先与已渲染内容比对
  if (contentKey !== currentContentKey) {
    const cached = contentKey ? getCachedRender(contentKey) : null;
    if (cached && cached.a4Urls.length > 0) {
      applyEntry(cached);
      currentContentKey = contentKey;
      isRendering.value = false;
      errorMessage.value = '';
    } else {
      applyEntry(null);
      currentContentKey = '';
      await generate();
    }
  } else if (pages.value.length === 0 && hasLyricsText.value) {
    await generate();
  }

  await nextTick();
  // 恢复滚动位置（双轴）：浏览器在 detach→attach 时清零 scrollTop/scrollLeft，与「排列」区同源问题
  const el = previewScrollRef.value;
  if (el && (savedScroll.top !== 0 || savedScroll.left !== 0)) {
    el.scrollTop = savedScroll.top;
    el.scrollLeft = savedScroll.left;
  }
});

onDeactivated(() => {
  isPaneActive = false;
  cancelPendingExport();
  // 保存双轴滚动位置（实例级变量，跨歌复用实例，切歌时随渲染重置归零）
  const el = previewScrollRef.value;
  if (el) savedScroll = { top: el.scrollTop, left: el.scrollLeft };
});

onBeforeUnmount(cancelPendingExport);
</script>
