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
          ref="previewPagesRef"
        >
          <!-- 首帧渲染中：文案按渲染线程上报的阶段分档（等字体子集 / 排版出图），见 loadingDescription。
               骨架槽位一铺开（pendingSlots > 0）就让位 —— 那时已有更精确的「第 n / 共 N 页」读数 -->
          <Feedback
            v-if="isRendering && pages.length === 0 && pendingSlots === 0"
            :description="loadingDescription"
            size="lg"
            type="loading"
          />

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
               20 页全部即刻解码峰值可达数百 MB）。代价是「被跳过的元素宽度不再由内容决定」，故
               页宽必须显式给（见 renderedPageWidth），同时把 contain-intrinsic-size 的两轴都写实，
               让跳过态与渲染态的盒子尺寸逐像素一致 —— 否则页流总长会随「已出图页数」变化，
               横向滚动条一路缩，骨架占位就白铺了 -->
          <!-- key 必须取**序号**而非 url：页脚开关会在两套 URL（合成图 / 无页脚原图）间整体换源，
               按 url 作 key 会让每一页的节点被销毁重建（整屏闪白 + 全部重新解码），
               等于把「开关只换 src」又变成一次整图重绘。按序号复用节点后，换源只改 img 的 src，
               浏览器在新图解码完成前继续显示旧图，切换无缝 -->
          <div
            v-for="(url, index) in pages"
            :class="[
              isPageMenuTarget(index) ? 'outline-primary' : 'outline-transparent',
              containerHeight > 0
                ? 'transition-[outline,box-shadow,ring-color,height,width]'
                : 'transition-[outline,box-shadow,ring-color]',
            ]"
            :key="index"
            :style="{
              height: renderedPageHeight,
              width: renderedPageWidth,
              contentVisibility: 'auto',
              containIntrinsicSize: `${renderedPageWidth} ${renderedPageHeight}`,
            }"
            @contextmenu.prevent="handlePageContextMenu($event, index)"
            class="relative block overflow-hidden rounded-sm shadow-panel ring-1 ring-transparent outline-2 -outline-offset-2 duration-fast ease-out select-none hover:shadow-floating hover:ring-glass-border"
          >
            <!-- 页图：页脚开关打开时 src 指向渲染线程合成好的「带页码」页图，否则指向无页脚原图。
                 两套 URL 同尺寸同坐标系，切换只换 src，不重排、不重渲染乐谱 -->
            <img
              :alt="`乐谱预览第 ${index + 1} 页`"
              :src="url"
              class="block h-full w-auto select-none"
              decoding="async"
              draggable="false"
            />
          </div>

          <!-- 尚未出图的分页槽位（骨架占位）：渲染线程在**排版结束、第 1 页还没画**时就把总页数报回来，
               故骨架从那一刻起就铺开，不必等任何一页完成 —— 超长谱（几十页）的等待因此从「白屏等整批」
               变成「N 个槽位逐个填」。逐页上报按下标递增，故已完成部分恒在数组前段、骨架恒在尾部。
               槽位与页图**共用 renderedPageWidth/Height 同一对取值**，页流总长恒为
               `页数 × 单页宽 + 间距`：填充不过是把等宽盒子换个皮，横向不重排、滚动条不动。
               槽位刻意不带 content-visibility：它没有内容可跳，盒子必须始终按显式尺寸占位 -->
          <div
            v-for="n in pendingSlots"
            :key="`slot-${n}`"
            :style="{ height: renderedPageHeight, width: renderedPageWidth }"
            class="flex items-center justify-center rounded-sm border border-dashed border-border-light bg-surface-panel select-none"
          >
            <span class="text-2xs font-semibold text-fg-muted tabular-nums">
              {{ pages.length + n }} / {{ streamTotal }}
            </span>
          </div>
        </div>
      </BaseScrollArea>

      <!-- 右下角缩放胶囊：复用 BaseFloatingPill（sm 紧凑形态），适应开关 + 毛玻璃百分比步进器 -->
      <BaseFloatingPill
        :safe-area-inset="false"
        disabled-teleport
        align="end"
        aria-label="预览缩放控制"
        bottom="1.5rem"
        position="absolute"
        size="sm"
        z-index="z-float"
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
      :context-trigger-el="previewPagesRef"
      :items="pageMenuItems"
      :title="menuTitle"
      @close="closePageMenu()"
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
  onScopeDispose,
  ref,
  toRef,
  useTemplateRef,
  watch,
} from 'vue';

import { useDebounceFn, useElementSize, useEventListener } from '@vueuse/core';

import BaseCheckbox from '@/platform/ui/checkbox/BaseCheckbox.vue';
import BaseDivider from '@/platform/ui/divider/BaseDivider.vue';
import Feedback from '@/platform/ui/feedback/Feedback.vue';
import BaseFloatingPill from '@/platform/ui/floating-bar/BaseFloatingPill.vue';
import BaseMenu from '@/platform/ui/menu/BaseMenu.vue';
import BaseScrollArea from '@/platform/ui/scroll-area/BaseScrollArea.vue';
import BaseSlider from '@/platform/ui/slider/BaseSlider.vue';
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
import { buildScoreRenderCacheKey } from '@/domains/score/preview/scoreRenderCacheKey';
import {
  buildExportFileName,
  triggerBlobDownload,
  writeBlobToClipboard,
} from '@/domains/score/preview/services/scoreExportCanvas';
import {
  cancelObsoleteInFlightRender,
  isRenderWorkerCold,
  runWorkerExport,
} from '@/domains/score/preview/services/workerExportService';
import { useScoreRenderPayload } from '@/domains/score/preview/useScoreRenderPayload';
import { RENDER_ABORT_MESSAGE } from '@/domains/score/preview/workers/scoreExportWorker/scoreExportTypes';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { useTargetMenu } from '@/platform/ui/menu/useTargetMenu';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';
import { registerCache } from '@/platform/utils/cache';
import { clamp, formatBytes } from '@/platform/utils/common';

import type { PreviewRenderData } from '@/domains/score/preview/scorePreviewCache';
import type { WorkerRenderStage } from '@/domains/score/preview/workers/scoreExportWorker';
import type { ScrollAreaHandle, ScrollAreaScrollbar } from '@/platform/ui/scroll-area/scrollAreaHandle';

defineOptions({ name: 'ScorePreviewPane' });

// ===== 会话级 A4 分页预览缓存已下沉至 scorePreviewCache 共享模块 =====
let rememberedContainerHeight = 0;

/**
 * 半成品登记表：内容键 → 已被打断、但已出图的前段页（下标＝页序）。「中断后续跑」的基础设施。
 *
 * 【为什么需要它】预览缓存的写入是**整批原子**的（putCachedRender 只在 complete 之后调一次），
 * 于是一轮渲染被中断时，已经画好的前几页除了屏上那几张图之外没有任何去处 —— 下一轮无论是不是
 * 同一首歌，都从第 0 页重画；几十页的长谱来回切一次就白等一整轮。
 *
 * 【两件东西的分工】
 * - screenHoldsPartial：屏上的页流是不是「尚未提交的半成品」。它决定下一轮起手要不要清屏 ——
 *   编辑歌词时屏上挂着的是**已提交**的旧图（必须留着，否则每敲一个字都先闪一屏骨架），
 *   被中断的半成品则必须清掉（它属旧内容，又不归任何缓存条目）。
 * - partialsByKey：被中断的那一轮在此登记已出图的前段，下一轮同键起手接回去当起点 —— 请求带
 *   resumeFrom，渲染线程照常重算排版但跳过这些页的绘制与 JPEG 编码（整笔里最贵的一段）。
 *
 * 【所有权三条规则】页图 URL 只能有一个主人，否则不是泄漏就是破图：
 * 1. 登记表里的条目**从不在屏上** —— 起手接续即 takePartial 出表（所有权移交该轮），
 *    故驱逐 / 覆盖时可以安全地即刻 revoke。严格说这条在「本轮被中断、finally 就地登记」那一刻不成立
 *    （那批页还挂在屏上，要到下一轮起手清屏 / 接续才移出屏面）；之所以仍安全，是因为登记只发生在收尾、
 *    驱逐由登记自身触发，而刚入表的是最近使用，不会被这一次驱逐挑中（trimPartials 另有「至少留一份」兜底）；
 * 2. 本轮若提交成功，那批 URL 归缓存条目，本表不得再持有；
 * 3. 本轮若未提交（被作废 / 失败 / 判废），就地登记回来留给下一轮；判废的则直接回收。
 */
interface PartialRender {
  /** 上次排版得到的总页数：接续前必须与本次 pages-planned 相符，否则前段页序不可信 */
  total: number;
  /** 已出图的页（前段密集，下标＝页序）；url 与 blob 同源，成对移交 */
  pages: { url: string; blob: Blob }[];
  /** 页字节合计（登记时定格）：容量判定用，避免每次驱逐重算 */
  bytes: number;
}

/** 半成品登记的容量：条数与内存配额并列，任一先到即驱逐最旧档（口径同 scorePreviewCache） */
const PARTIAL_MAX_ENTRIES = 4;
const PARTIAL_MAX_BYTES = 32 * 1024 * 1024;

/** 屏上页流是否为「未提交的半成品」（见上）；applyEntry 写入任何正式来源（条目 / 清空）时复位 */
let screenHoldsPartial = false;

/** 组件已销毁：此后不再登记半成品 —— 没人再来接续，登记只会漏掉一批 object URL。
 *  在途轮次收尾时据此改走「就地回收」（见 generate 的 finally） */
let partialsDisposed = false;

const partialsByKey = new Map<string, PartialRender>();
let partialBytesTotal = 0;

/** 回收一组页 URL */
const revokePages = (pages: { url: string }[]) => {
  for (const page of pages) URL.revokeObjectURL(page.url);
};

/** 页字节合计（与预览缓存的称重口径一致：页图 JPEG 就是占用本身） */
const weightOfPages = (pages: { blob: Blob }[]) => pages.reduce((sum, page) => sum + page.blob.size, 0);

/** 摘除一份半成品；revoke 决定是否顺手回收其页 URL（所有权已移交调用方时必须传 false） */
const dropPartial = (key: string, revoke: boolean) => {
  const partial = partialsByKey.get(key);
  if (!partial) return;
  partialsByKey.delete(key);
  partialBytesTotal -= partial.bytes;
  if (revoke) revokePages(partial.pages);
};

/** 取用并摘除：出表即不受容量驱逐管辖，其 URL 由调用方负责转移或回收 */
const takePartial = (key: string): PartialRender | undefined => {
  const partial = partialsByKey.get(key);
  if (!partial) return undefined;
  dropPartial(key, false);
  return partial;
};

/** 驱逐到容量之内：条数与内存配额任一超出即丢最旧档。
 *  内存配额那一路**至少留一份**（口径同 LRU）：单条就超配额的超长谱若也被驱逐，下一轮照样从头重画。 */
const trimPartials = () => {
  while (partialsByKey.size > PARTIAL_MAX_ENTRIES || partialBytesTotal > PARTIAL_MAX_BYTES) {
    const oldest = partialsByKey.keys().next().value;
    if (oldest === undefined || partialsByKey.size <= 1) return;
    dropPartial(oldest, true);
  }
};

/** 登记一份半成品（同键旧档直接作废，故登记即刷新为最近使用）：登记后按容量驱逐最旧档 */
const depositPartial = (key: string, pages: { url: string; blob: Blob }[], total: number) => {
  dropPartial(key, true);
  const bytes = weightOfPages(pages);
  partialsByKey.set(key, { total, pages, bytes });
  partialBytesTotal += bytes;
  trimPartials();
};

// 半成品压着的是整页 JPEG（可到几十 MB），故与预览缓存同样登记进开发面板的内存读数 ——
// 否则这块占用在面板上完全不可见，正是「内存去哪了」最难查的那种
const unregisterPartialCache = registerCache({
  name: '预览半成品页',
  limit: PARTIAL_MAX_ENTRIES,
  maxBytes: PARTIAL_MAX_BYTES,
  size: () => partialsByKey.size,
  bytes: () => partialBytesTotal,
  clear: () => {
    for (const key of [...partialsByKey.keys()]) dropPartial(key, true);
  },
});

/** 界面上这条登记表随组件存亡：页图 object URL 不会因组件销毁自动回收（非 KeepAlive 休眠时） */
onScopeDispose(() => {
  partialsDisposed = true;
  for (const key of [...partialsByKey.keys()]) dropPartial(key, true);
  unregisterPartialCache();
});

/** 当前展示页流对应的渲染数据（含各页字节数 + 长图产物）：切歌/生成时由 applyEntry 同步更新，
 *  右键菜单标题直接读数；同时写入共享缓存供 TopHeader 下载菜单复用，避免重复渲染 */
const applyEntry = (data: PreviewRenderData | null) => {
  // 屏上换成了正式来源（缓存条目）或清空：不再是「未提交的半成品」
  screenHoldsPartial = false;
  setCurrentRender(data);
  applyDisplayUrls(data);
  void ensureFooterComposed(data);
};

/**
 * 页流展示源：页脚打开且合成层已就绪时用「带页码」页图，否则用无页脚原图。
 * 合成层是懒生成的，未就绪的短暂窗口内先按无页脚展示，合成完成后再切一次。
 */
const applyDisplayUrls = (data: PreviewRenderData | null) => {
  pages.value = !data ? [] : settingsStore.scoreShowFooter && data.footerUrls ? data.footerUrls : data.a4Urls;
};

/** 已在途的页脚合成条目：开关连点 / 重复调用不会对同一批页面并发合成 */
const footerComposeInFlight = new WeakSet<PreviewRenderData>();

/**
 * 页脚合成层（懒生成）：页面栅格不含页码，开关打开时向渲染线程请求一次
 * 「贴回整页 → 画页码 → 重编码」，结果按条目缓存在 footerUrls 上。
 * 于是开关页脚**不触发任何乐谱重渲染**——首次打开合成一次，之后来回切只是换展示源。
 *
 * 合成与整谱渲染共用渲染线程的同一条串行队列，故本条目的合成必定先于「下一次渲染完成」结束；
 * 而缓存驱逐只发生在渲染完成写入时 —— 因此不存在「合成在途时条目已被驱逐、产出的 URL 无人回收」。
 *
 * **可作废**：判据是「发起时那首歌已不是当前歌」。切歌后这份合成连归属都换了人（结果只会入库给
 * 一首不再展示的谱），却要逐页贴图 + 重编码、还占着新歌渲染前面的队列位置，故交给渲染线程中断，
 * 见下方 isObsolete。同一首改内容**不**作废：结果仍属该歌，合成完了照样能用。
 * @param data 目标渲染条目；缺省 / 已合成 / 页脚未开 / 无页面时直接返回
 */
const ensureFooterComposed = async (data: PreviewRenderData | null) => {
  if (!data || !settingsStore.scoreShowFooter || data.footerUrls || data.a4Blobs.length === 0) return;
  if (footerComposeInFlight.has(data)) return;
  footerComposeInFlight.add(data);
  // 发起时的歌曲 id（判据见函数头）。不读内容键：内容键在切歌与同歌改内容两种情况下都会变，
  // 而只有前者该作废 —— 用 id 才分得开。
  const songId = scoreEditor.activeSong?.id;
  try {
    // 纸张档位与页边距按条目记录值传（非实时设置）：改设置在途窗口内两者可能不一致
    const composed = await composePageFooter(data.a4Blobs, undefined, data.pageSize, data.pageMargin, {
      isObsolete: () => scoreEditor.activeSong?.id !== songId,
    });
    data.footerUrls = composed.map(blob => URL.createObjectURL(blob));
    data.footerBlobs = composed;
    // 该条目仍是当前展示项才刷新页流；已被换走的只入库，切回时直接复用
    if (currentRenderData.value === data) applyDisplayUrls(data);
  } catch (err) {
    // 被切歌作废（非失败）：结果本就没人要，静默收工 —— 否则切一次歌就弹一句「页脚合成失败」。
    // 判据是渲染线程中断点与服务层排队作废共用的同一条文案常量（见 RENDER_ABORT_MESSAGE）。
    if (err instanceof Error && err.message === RENDER_ABORT_MESSAGE) return;
    // 合成失败（如环境不支持 OffscreenCanvas）退回无页脚展示，不打断预览
    uiStore.message.warning('页脚合成失败，已按无页脚显示');
  } finally {
    footerComposeInFlight.delete(data);
  }
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
/**
 * 本轮流式分页的槽位总数（渲染线程排版结束后上报；0 = 未知，即不铺骨架）。
 * 只作展示读数：尾部据此铺 `pendingSlots` 个占位，每出一页填一个。
 */
const streamTotal = ref(0);

/**
 * 渲染线程当前阶段：只用于分档加载文案。取值有两个来源 ——
 *
 * 1. **每轮起手先定档**（见 generate）：渲染线程还不存在时按「正在加载字体」起，其余按「正在生成预览」。
 *    这一档是**首帧**就生效的，不依赖消息能不能赶在合成之前到达：字体子集命中 HTTP 缓存时只有几十毫秒，
 *    靠 worker 事后上报常常整段落在同一帧里、一次都画不出来（见 workerExportService 的 isRenderWorkerCold）。
 * 2. **worker 的实时上报**（onStage）：线程已存在但本次仍要取字体时才补报 fonts —— 典型是歌词字重改用
 *    Light，那是 worker 生命周期内第一次请求 300 这档，1MB，足够看清。命中装载缓存则不上报（见 scoreFonts
 *    的 pendingScoreFontWeights），此时「正在生成预览」本就是实话。
 *
 * 【为什么不做「每轮归零 + token 过滤」】stage 描述的是**渲染线程此刻在干什么**，不是某一轮的私有进度。
 * 渲染线程是串行的，正在执行的完全可能是上一轮（新一轮还在队列里排队）—— 按 token 过滤会把它的上报
 * 全部丢掉。首次进预览就会踩到：激活触发一次生成，SCORE_PREVIEW_DEBOUNCE_MS 防抖又触发一次，后者的
 * 归零把「正在加载字体」抹回「正在生成预览」，而紧接着字体下载完成的那次上报又被 token 丢掉 ——
 * 于是整个下载期间显示的都是「正在生成预览」。
 */
const renderStage = ref<WorkerRenderStage>('render');

/** 居中加载框文案：按阶段分档，别让「在等网络取字体」与「在排版出图」共用同一句含糊提示 */
const LOADING_DESCRIPTION: Record<WorkerRenderStage, string> = {
  fonts: '正在加载字体…',
  render: '正在生成预览…',
};
const loadingDescription = computed(() => LOADING_DESCRIPTION[renderStage.value]);

let runToken = 0;
let currentContentKey = '';
/**
 * 在途轮次的内容键（'' = 空闲）：同一内容键只允许有一轮在跑，重复触发直接复用在途轮次（见 generate 起手）。
 *
 * 【为什么必须有】切歌时同一个 id 变化会触发**两条**路径：id watch 同步起一轮；而内容键 computed 也随之变化，
 * 防抖 watch 在 150ms 后再起一轮。同一内容键的第二轮会把第一轮的在途结果整份作废（token 换代 ⇒ 回调被丢、
 * 完成时直接 return 不写缓存），于是白跑一整轮渲染（切歌耗时翻倍），而且第二轮起手若发现页流已有内容，
 * 还会把第一轮已流式上屏的页连同其 URL 一起撤掉 —— 肉眼就是「切歌时图片闪一下」。
 */
let inFlightContentKey = '';
let isPaneActive = true;

/** 「更新中」常驻 LOADING Message：仅在实际渲染（已有页面）时弹出，渲染结束统一移除。
 *  LOADING 型不自动销毁，故用 id 手动 remove；首次构建（无页）仍由内容区居中加载框承担，不弹 Message */
let updateMessageId: number | null = null;
const showUpdateMessage = () => {
  if (updateMessageId === null) updateMessageId = uiStore.message.loading('预览更新中…', { closable: false });
};
const dismissUpdateMessage = () => {
  if (updateMessageId !== null) {
    uiStore.removeMessage(updateMessageId);
    updateMessageId = null;
  }
};

/**
 * 采纳一份已渲染缓存：把页流交给展示层、认下内容键、退出渲染态，并撤掉「更新中」Message。
 *
 * 三处调用点（generate 的命中早退、切歌 watch、onActivated 唤醒守卫）此前各写一遍这几行，
 * 且只有第一处带 `dismissUpdateMessage()`。统一带上不改变行为：它按 id 移除且幂等，
 * 另两处调用前都已由 `cancelPendingExport()` 撤掉提示（切歌与 onDeactivated 各一处）。
 */
const adoptCachedRender = (entry: PreviewRenderData, contentKey: string): void => {
  // 同键半成品对已就位的完整条目再无意义（条目覆盖全部页），顺手回收：它可能压着几十 MB 页图，
  // 白等到容量驱逐才释放
  dropPartial(contentKey, true);
  applyEntry(entry);
  currentContentKey = contentKey;
  isRendering.value = false;
  errorMessage.value = '';
  dismissUpdateMessage();
};

/** 内容缓存键：失效维度与整曲长图导出同源（见 scoreRenderCacheKey），任一处加维度另一处自动跟上 */
const buildContentKey = () => buildScoreRenderCacheKey(scoreEditor.activeSong, chordsLookupMap.value);

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
    adoptCachedRender(cached, contentKey);
    return;
  }

  // 同一内容键已有在途轮次：复用它，不再另起一轮（见 inFlightContentKey 的说明）。
  // force（重试按钮）不受此限：用户点重试就是要重跑，与「重复触发」是两回事。
  if (!force && inFlightContentKey === contentKey) return;

  const token = ++runToken;
  // 本轮起跑 ⇒ 上一轮（若有）随之作废，连渲染线程上的那一笔一并中断：不中断的话它会跑完剩下的页，
  // 白占渲染线程、把本轮挡在后面整整一轮（这是「切歌后比首次渲染还慢」的主要来源之一）。
  cancelObsoleteInFlightRender();
  inFlightContentKey = contentKey;
  isRendering.value = true;
  isPreviewRendering.value = true;
  errorMessage.value = '';

  // 「起手时屏上是否有**已提交的旧图**」：既是「旧图继续显示、整批换新」的判据，也是「更新中」Message
  // 该不该弹的判据。必须在下方任何改写 pages 的动作之前拍快照 —— 续跑分支会立刻把接回来的前段页填进
  // pages，拿那之后的 pages 去判，会把「本轮自己的前段」误当成「正在被更新的旧内容」（切歌后接续半成品
  // 就此白弹一次提示）；screenHoldsPartial 为真说明屏上那批是上一轮被打断的半成品，同样不算「旧内容」。
  const hadCommittedPages = pages.value.length > 0 && !screenHoldsPartial;

  // ---- 半成品接续（中断后续跑）----
  // 同一内容键上一次被打断时已出图的页登记在 partialsByKey 里，接回来当本轮的前段：请求带上
  // resumeFrom，渲染线程照常重算排版，但跳过这些页的绘制与 JPEG 编码（整笔里最贵的一段）、只补剩下的。
  // 只有两种情形不接续：force（用户点重试就是要从零重跑）、同键没有半成品（首次预览）。
  // takePartial 是**取用即出表**：所有权移交本轮，此后由下方的提交 / 登记 / 回收三条出口负责。
  const partial = force ? undefined : takePartial(contentKey);
  const run = {
    /** 本轮派发时声明的续跑起点（＝接回来的前段页数） */
    resumeFrom: partial ? partial.pages.length : 0,
    /** 本轮计划总页数：先沿用半成品记录的读数，收到 pages-planned 后改以渲染线程报的为准 */
    total: partial ? partial.total : 0,
    /** 本轮页累加器（下标＝页序，前段密集）：起手是接回来的前段，之后由 onPage 逐页补 */
    pages: partial ? partial.pages : [],
    /** 本轮已判废（前段页序与本轮排版不符 / 续跑结果拼不齐）：既不入缓存，也不登记为半成品 */
    discarded: false,
    /** 本轮已把页 URL 交割给缓存条目（所有权已转移，收尾时不得再回收或登记） */
    committed: false,
  };
  if (partial) {
    // 前段立刻上屏：它们本就是这首歌、这套排版下的图，没有理由让用户重新等一遍；
    // streamTotal 也先按它的读数铺骨架尾巴，等 pages-planned 再校正
    pages.value = partial.pages.map(page => page.url);
    streamTotal.value = partial.total;
    screenHoldsPartial = true;
  } else {
    // 屏上是上一轮被打断的半成品而本轮不接续它（内容已变 / 强制重跑）：清空，免得旧内容留在屏上。
    // 屏上若是**已提交**的旧图则不动 —— 那要保持「旧图继续显示、整批换新」（见下方 canStream）
    if (screenHoldsPartial) pages.value = [];
    screenHoldsPartial = false;
    streamTotal.value = 0;
  }
  // 本轮是否走流式填充（骨架 + 逐页上屏）：起手无「已提交的旧图」时启用 —— 首次预览 / 切歌后 /
  // 接续续跑三种。编辑歌词那种增量更新不走（旧图继续显示、整批换新），否则每敲一个字都先闪一屏骨架。
  const canStream = pages.value.length === 0 || run.resumeFrom > 0;
  // 加载文案的起点：渲染线程还没建立（本会话第一次预览 / 空闲回收后 / 异常废弃）时，本次请求必然要下载
  // 字体子集，于是**首帧**就按「正在加载字体」起，不等 worker 那条上报 —— 上报要等线程跑起来，而命中 HTTP
  // 缓存时子集解析只有几十毫秒，往往整段落在同一帧里，一次都画不出来（见 isRenderWorkerCold）。
  // 只做「升级」，绝不在这把它改回 render：本函数仍可能在上一轮正下载字体时被再次调用（内容变了 ⇒ 键不同、
  // 不走上面的复用分支），而「线程不冷」只说明它已存在、不代表它此刻不在取字体 —— 强行改回就等于把刚亮起的
  // 提示抹掉。假值也无需在此清理：worker 处理任何一个渲染请求，都会在字体 await 之后无条件上报一次 render，
  // 稳态值自然回到 render。唯一的例外是「本轮根本到不了 worker」的失败路径，由下方 catch 显式复位。
  if (isRenderWorkerCold()) renderStage.value = 'fonts';
  // 只有「屏上挂着已提交旧图、本轮整批换新」才弹「更新中」Message：首次构建（无页）留给内容区居中
  // 加载框，续跑接续（屏上就是本轮接回来的前段）留给骨架尾巴 —— 两者都不该多出一条常驻提示
  if (hadCommittedPages) showUpdateMessage();
  /**
   * 判废本轮接续的前段，并立刻从零重跑一轮（前段页序与本轮排版不符、或续跑结果拼不齐时走这里）。
   *
   * 内容键是「前段还属于这套排版」的唯一凭据：一旦它与排版结果脱钩（键漏了某个影响分页的维度），
   * 前段页图就属于另一套排版，硬拼会把旧页贴到新谱上 —— 宁可重跑。本轮标 discarded，收尾时既不提交
   * 也不登记（前段已就地回收）。
   */
  const restartFromScratch = () => {
    run.discarded = true;
    revokePages(run.pages);
    run.pages = [];
    pages.value = [];
    screenHoldsPartial = false;
    streamTotal.value = 0;
    // force：既不吃缓存、也不接续半成品（半成品刚被判废，下一轮不该再碰上它）
    void generate(true);
  };

  try {
    // isObsolete 双重职责：排队中的过期渲染在开跑前即被判废；已开跑的那一笔也靠它作判据被中断
    //（见本轮起手与 cancelPendingExport 里的 cancelObsoleteInFlightRender）
    const a4Result = await runWorkerExport(buildRenderPayload('a4', song, run.resumeFrom), {
      isObsolete: () => token !== runToken,
      // 阶段镜像不做 token 过滤：正在占用渲染线程的可能就是上一轮（见 renderStage 声明处）
      onStage: stage => {
        renderStage.value = stage;
      },
      // 页数一到就铺骨架：这是流式渲染的**第一拍**，早于任何一页出图（纯排版阶段结束即有）。
      // 本轮若已有真图在展示（canStream=false）则忽略：那种情况整批换新，不闪骨架
      onPagesPlanned: total => {
        if (token !== runToken) return;
        // 接续的前段必须与本次排版同页数：不符说明内容键漏了某个影响分页的维度，前段页序已不可信
        if (run.resumeFrom > 0 && total !== run.total) {
          restartFromScratch();
          return;
        }
        run.total = total;
        if (canStream) streamTotal.value = total;
      },
      // 每出一页立刻上屏（下标＝页序，到达顺序即渲染顺序）。URL 在这里建、并留给缓存条目复用，
      // 不在 complete 时重建（重建会让每张图重新取 blob 解码 → 整屏白闪）
      onPage: (index, blob) => {
        if (!canStream || token !== runToken) return;
        const url = URL.createObjectURL(blob);
        run.pages[index] = { url, blob };
        pages.value[index] = url;
        // 屏上现在挂着的是「未提交的页」：下一轮若不吃这一批，得先把它们清掉
        screenHoldsPartial = true;
      },
    });
    if (token !== runToken) return;
    // 空批不等于失败：接回来的前段若已铺满整轮（resumeFrom 等于总页数），渲染线程本就不产出任何新页
    // —— 循环 [resumeFrom, 总页数) 空转、blobs 为空是正常收尾。只有「既没回新页、手上也没有前段」
    // 才是真的什么都没画出来。
    if (a4Result.blobs.length === 0 && run.pages.length === 0) throw new Error('未能生成有效的预览数据');

    // ---- 结果拼装：前段（run.pages，含接回来的） + 尾段（渲染线程只回了 resumeFrom 之后的页）----
    const resumed = a4Result.resumedFrom;
    const totalPages = resumed + a4Result.blobs.length;
    // 每一格都必须到位：前段由接续 seed，尾段由 onPage 逐页填。缺格只可能是渲染线程少报了一页，
    // 那种错位页流会让「复制本页」静默拿错页 —— 宁可判废重跑；resumed 与派发值不符同理。
    let aligned = resumed === run.resumeFrom && run.pages.length === totalPages;
    for (let i = 0; aligned && i < totalPages; i++) aligned = Boolean(run.pages[i]);

    if (run.resumeFrom > 0 && !aligned) {
      // 续跑拼不齐：前段页图无从补齐（a4Result 只带尾段），整段判废重跑
      restartFromScratch();
      return;
    }
    if (!aligned) {
      // 非续跑（屏上挂着已提交的旧图、本轮不流式）走整批路径：此刻才第一次建 URL。
      // 已上屏的那批（理论上不该出现，见上）本身就不完整，就地回收
      revokePages(run.pages);
      run.pages = [];
    }

    // 页 URL 一律**沿用**流式过程中已上屏的那批（换新 URL = 整屏重新解码白闪）；非流式才由 blobs 现建
    const a4Urls = aligned ? run.pages.map(page => page.url) : a4Result.blobs.map(blob => URL.createObjectURL(blob));
    // 各页原始 Blob 与字节数随渲染数据一并缓存（Blob 此刻就在内存，直接取用免二次 fetch）：
    // 接续回来的那几页也在其中 —— 它们被登记保存，正是为了有朝一日以完整条目身份入缓存
    const a4Blobs = aligned ? run.pages.map(page => page.blob) : a4Result.blobs;
    const a4Sizes = a4Blobs.map(blob => blob.size);

    const entry: PreviewRenderData = {
      a4Urls,
      a4Sizes,
      a4Blobs,
      pageSize: settingsStore.scorePageSize,
      pageMargin: settingsStore.scorePageMargin,
    };
    run.committed = true;
    // 登记表里同键若还留着别的（更早一轮被作废时登记的、与本条目 URL 无交集的那份），一并作废：
    // 它的内容已被本条目取代，留着既不会被接续，又要等容量驱逐才回收
    dropPartial(contentKey, true);
    currentContentKey = contentKey;
    putCachedRender(contentKey, entry, song.id);
    applyEntry(entry);
  } catch (err) {
    if (token === runToken) {
      errorMessage.value = err instanceof Error ? err.message : '预览生成失败';
      // 流式路径可能已把前几页放上屏：错误态要看得见，就地清空页流。那几页的 URL **不在这里回收**
      // —— 由下方 finally 登记成半成品，留给下一轮续跑（用户点重试即从这批页接上）。
      // 非流式（旧图还在展示）不动 —— 那有「更新中」Message 提示失败。
      if (canStream) {
        pages.value = [];
        screenHoldsPartial = false;
      }
      // 「fonts」这一档是**单向闩**：它只在 worker 走到字体 await 之后的那次无条件上报里才会被改回
      // render（见 renderStage 声明处）。本轮若在到达 worker 之前就失败 —— OffscreenCanvas 不可用、
      // 排队期间被判作废、或 worker onerror 被丢弃 —— 那次上报永远不会来，闩就一直停在 fonts。
      // 本轮既已终结，复位到稳态值。
      renderStage.value = 'render';
    }
  } finally {
    // 本轮的页图所有权在此了结，三条出口互斥：
    // - 已提交：URL 已随缓存条目交割，什么都不做；
    // - 判废：前段页序不可信，就地回收；
    // - 其余（被作废 / 渲染失败）：登记成半成品留给下一轮同键续跑 —— 「中断后不再全量重建」的落点。
    //   组件已销毁时不登记（没人再来接续），改走就地回收，否则那批 object URL 会一直悬着。
    if (!run.committed) {
      const reclaim = run.discarded || partialsDisposed;
      if (reclaim) revokePages(run.pages);
      else if (run.pages.length > 0 && run.total > 0) depositPartial(contentKey, run.pages, run.total);
    }
    // 本轮登记的键只在「仍归本轮所有」时才清：token 换代说明已有更新的轮次接手，它可能登记的正是同一个键，
    // 替它清掉会让第三轮重复触发再起一轮（force 重试与在途轮次同键时就会走到这里）
    if (inFlightContentKey === contentKey && token === runToken) inFlightContentKey = '';
    if (token === runToken) {
      // 本轮已终结：撤掉骨架尾巴（成功的已由 applyEntry 换成整批真图，失败的页流已清空）
      streamTotal.value = 0;
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
  // 不 revoke：屏上的页 URL 要么归缓存条目（切回预览可复用，内存由 LRU 容量控制），要么属于这一轮
  // 被中断的半成品 —— 后者由它自己的 finally 登记回 partialsByKey，留给下一轮同键续跑。
  // 屏上那几张也不在这里撤：撤回会让还在显示的页变破图；留待下一轮 generate 起手决定接续还是清屏。
  // 骨架尾巴则随本轮终结即刻收起。
  runToken++;
  // token 已换代 ⇒ 在途的预览轮次其 isObsolete 此刻必为真，顺势中断它：切歌时上一首没画完的页没必要
  // 再画，新歌也不必排它后面等一整轮（渲染线程没有抢占能力，不中断就只能等它自己跑完）。
  // 在途的若是页脚合成，判据不靠 token 而靠「发起时那首歌已不是当前歌」（见 ensureFooterComposed），
  // 两者都归这一次调用一并处理 —— 它们都是「前一首的派生工作」，且都占着新歌前面的队列位置。
  cancelObsoleteInFlightRender();
  // 在途轮次的登记同作废：否则「切走再切回同一首歌」时，同键的新一轮会被 generate 误判成重复触发而不起跑
  inFlightContentKey = '';
  streamTotal.value = 0;
  isRendering.value = false;
  isPreviewRendering.value = false;
  dismissUpdateMessage();
};

// ===== 单页右键菜单：复制 / 下载当前页图 =====
const previewMenuRef = ref<InstanceType<typeof BaseMenu> | null>(null);
/**
 * 单页右键菜单：目标为**页码**。
 * 菜单项在打开时按该页码构建 —— copyPage / downloadPage 声明在本行下方，闭包到右键那一刻才求值，
 * 故无先后依赖；且 action 捕获的是**打开时的页码**，不再回头读「当前目标」。
 * 无目标时为空数组（BaseMenu 据此拒绝打开）；「必须等 nextTick」「关闭后保留目标」由 useTargetMenu 保证。
 */
const {
  target: menuTargetIndex,
  isOpen: isPageMenuOpen,
  items: pageMenuItems,
  openAt: openPageMenuAt,
  close: closePageMenu,
} = useTargetMenu<number>(
  index => [
    { label: '复制本页', icon: 'copy', action: () => void copyPage(index) },
    { label: '下载本页', icon: 'download', action: () => void downloadPage(index) },
  ],
  previewMenuRef
);

/** 页面「菜单正针对我」的描边判据：菜单关闭即失效，故与 isOpen 合判（不能只看目标） */
const isPageMenuTarget = (index: number): boolean => isPageMenuOpen.value && menuTargetIndex.value === index;

/**
 * 右键「触发区域」＝页面行容器（透传给 BaseMenu 的 contextTriggerEl，机制见该 prop 注释）。
 *
 * 本菜单是挂在预览根层的单例、默认插槽为空，不报触发区域时，右键页面会被外点判定的捕获阶段
 * 先关掉，随后 handlePageContextMenu 里的 openMenuAt 只能走首次打开 —— 表现为菜单重放入场动画，
 * 而不是复用同一实例从旧坐标滑到新坐标。
 *
 * 该容器同时被用作浮层锚点，供平台「锚点随所在滚动容器滚动而关闭」的机制识别（它在预览滚动区内）。
 */
const previewPagesRef = useTemplateRef<HTMLElement>('previewPagesRef');
/**
 * 各页图片字节数：直接读共享缓存 currentRenderData（含 a4Sizes），不另立缓存结构，
 * 随预览渲染/切歌同步刷新、随 LRU 驱逐回收。
 */

/** 当前右键页的字节数，未取回前为 null（currentRenderData 由 applyEntry 在切歌/生成时同步设定） */
const menuPageSize = computed(() => {
  const i = menuTargetIndex.value;
  const data = currentRenderData.value;
  return data && i !== null && i >= 0 && i < data.a4Sizes.length ? data.a4Sizes[i] : null;
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
 * 预览滚动时收起单页右键菜单：右键菜单弹出期间滚动预览，菜单应随内容一起消失，避免悬在错位位置。
 * 菜单锚点是 previewPagesRef（页面行容器，落在预览滚动区内），平台的「锚点随所在滚动容器滚动而关闭」
 * 本可覆盖；这里保留直接监听作同源的即时保障，不依赖注册表的遍历时机。
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
    customZoomPercent.value = clamp(val, PREVIEW_MIN_ZOOM_PERCENT, PREVIEW_MAX_ZOOM_PERCENT);
  },
});

/** 页面显示高度（px，布局真值）：自适应态 = 容器内容盒高，自定义态 = 自定义百分比换算高。
 * 不在自适应态写 '100%'——% 与 px 混合插值不可靠会导致切换时高度闪跳；同为 px 后过渡平滑且两态数值同源 */
const renderedPageHeightPx = computed(() =>
  isFitMode.value ? fitPageHeight.value : pageHeightAt(customZoomPercent.value)
);

/** 页面渲染高度（内联样式）：真值统一由 renderedPageHeightPx 提供，此处只做单位拼接 */
const renderedPageHeight = computed(() => `${renderedPageHeightPx.value}px`);

/**
 * 页面渲染宽度（内联样式）：按纸型比例由显示高度换算。**页图与骨架槽位共用这一份**。
 *
 * 【为什么宽高都必须显式给，不能只给高、让页图自己撑】页图的 `h-full w-auto` 本该由
 * 「显示高 × 纸型比」推出宽度，但这条推导在两处会失效：
 * 1. 屏外页被 content-visibility:auto 跳过渲染，跳过态下宽度取 contain-intrinsic-size 的占位值；
 *    旧写法 `auto <页高>` 里那个长度**同时作用于两轴**，等于拿页高当页宽（A4 下约大 40%）。
 *    后果正是「骨架占位白铺」：每出一页，新页在屏外先按占位宽（≈页高）占位、比它替换掉的槽位
 *    宽一截，页流总长随填充逐页增长、横向滚动条一路变短。
 * 2. 图片解码未完成、或纸型设置与在途渲染的档位不一致时，intrinsic 尺寸本身也不可靠。
 * 显式给宽后盒子尺寸不再依赖内容，跳过态与渲染态逐像素一致；页流总长恒为
 * `页数 × 单页宽 + 间距`，填充与滚动都不再改变它。
 *
 * 宽度仍由页高换算而非独立常量：自适应态下页高随容器变，页宽必须同步等比，否则纸型会变形。
 */
const renderedPageWidth = computed(
  () => `${Math.round(renderedPageHeightPx.value * (previewPageSize.value.width / previewPageSize.value.height))}px`
);

/** 尚未出图的骨架槽位数（总页数已知时为正；未知 / 已完成时为 0，尾部不占位） */
const pendingSlots = computed(() => Math.max(0, streamTotal.value - pages.value.length));

/**
 * 页脚开关：只切页流展示源，**不重渲染乐谱**（页脚不进内容键，也不进缓存条目）。
 * 首次打开由 ensureFooterComposed 向渲染线程请求一次合成，结果按条目缓存，之后来回切零开销。
 * 页码文字色随主题变化：主题是内容键维度，换主题会整谱重渲 → 新条目 → 合成层按新配色重新生成。
 */
watch(
  () => settingsStore.scoreShowFooter,
  () => {
    const data = currentRenderData.value;
    applyDisplayUrls(data);
    void ensureFooterComposed(data);
  }
);

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

/** 右键某页：把命中的页码交给 useTargetMenu 在光标处打开（单页大小已在共享缓存 currentRenderData 中，无需额外取数） */
const handlePageContextMenu = (e: MouseEvent, index: number) => void openPageMenuAt(e, index);

// ===== 页码读数：挂在横向滚动条上的滚动气泡 =====
/** 页码读数自动淡出时延（ms）：滚动停顿超过该时长即淡出。
 *  这是气泡自身的节奏；滚动条先淡出时（未悬停 → autoHide 400ms）会把读数一并收起，
 *  悬停期间拇指常显、才轮到这里的 1200ms 生效——两者不会再各走各的 */
const PAGE_HINT_AUTO_HIDE_MS = 1200;
/** 读数（`当前页 / 总页数`，1 基）：把横向可滚动距离均分为总页数段，落点在第几段就是第几页 ——
 *  progress=0 为首页、progress=1 为末页，每跨过 1/total 的进度即进一页。
 *  页流等宽等距排列，故进度与页序线性对应；末页单独 clamp，避免 progress 取到 1 时越界。
 *  流式渲染期间取**计划总数**（骨架也算进页流占位，分母须是最终页数而非已出图页数） */
const pageHintFromProgress = (progressX: number): string => {
  const total = streamTotal.value > 0 ? streamTotal.value : pages.value.length;
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

/** 读取指定页的 Blob（统一走缓存模块的 object URL 读回）。
 *  缓存页面不含页脚，故按开关合成后再交给剪贴板 / 下载，产物与预览所见一致。 */
const fetchPageBlob = async (index: number): Promise<Blob | null> => {
  const data = currentRenderData.value;
  // 取**无页脚原图**的 URL：pages 里可能是合成后的带页码图，拿它再合成会叠两行页码
  const rawUrl = data?.a4Urls[index];
  if (!rawUrl) return null;
  // 页脚合成层已就绪（预览开着页脚时）直接复用同一份 Blob，免去重复合成；未就绪才现合成
  const composed = settingsStore.scoreShowFooter ? data?.footerBlobs?.[index] : undefined;
  if (composed) return composed;
  const blob = await readA4PageBlob(rawUrl);
  if (!blob) return null;
  // 页脚按缓存渲染时的纸张档位与边距合成，不读实时设置（改设置在途窗口内两者可能不一致）
  const [result] = await composePageFooter([blob], [index], data?.pageSize, data?.pageMargin);
  return result ?? blob;
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
    if (cached && cached.a4Urls.length > 0) adoptCachedRender(cached, contentKey);
    else {
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
    if (cached && cached.a4Urls.length > 0) adoptCachedRender(cached, contentKey);
    else {
      applyEntry(null);
      currentContentKey = '';
      await generate();
    }
  } else if (pages.value.length === 0 && hasLyricsText.value) await generate();

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
