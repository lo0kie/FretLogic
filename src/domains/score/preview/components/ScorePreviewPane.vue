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
               骨架槽位一铺开（页流非空）就让位 —— 那时已有更精确的「第 n / 共 N 页」读数 -->
          <Feedback
            v-if="isRendering && pageSlots.length === 0"
            :description="loadingDescription"
            size="lg"
            type="loading"
          />

          <!-- 渲染失败（无任何页） -->
          <Feedback
            v-else-if="!isRendering && errorMessage && pageSlots.length === 0"
            :description="errorMessage"
            @action="generate(true)"
            action-text="重试"
            size="sm"
            type="error"
          />

          <!-- 分页页流：**一格一页**，在位的页出图、未就位的页出骨架（下标＝页序，洞是合法状态）。
               骨架从 pages-planned（纯排版结束、第 1 页还没画）那一刻起就铺开：超长谱的等待因此从
               「白屏等整批」变成「N 个槽位逐个填」。槽位与页图**共用 renderedPageWidth/Height 同一对
               取值**，页流总长恒为 `页数 × 单页宽 + 间距`：填充不过是把等宽盒子换个皮，横向不重排、
               滚动条不动。
               容器首次测量前（containerHeight=0）禁用高度过渡：此时自适应页高回退整页高会先渲染放大尺寸，
               测量完成回落到实际比例——带过渡会回放“从大缩小”的闪动，未测量期禁用后同帧落位无动画 -->
          <!-- content-visibility:auto：屏外页跳过渲染与位图解码（每页 794×1123@DPR2 ≈14MB 解码，
               20 页全部即刻解码峰值可达数百 MB）。代价是「被跳过的元素宽度不再由内容决定」，故
               页宽必须显式给（见 renderedPageWidth），同时把 contain-intrinsic-size 的两轴都写实，
               让跳过态与渲染态的盒子尺寸逐像素一致 —— 否则页流总长会随「已出图页数」变化，
               横向滚动条一路缩，骨架占位就白铺了。骨架格没有内容可跳，这层开销对它恒为零 -->
          <!-- key 必须取**序号**而非 url：页脚开关会在两套 URL（合成图 / 无页脚原图）间整体换源，
               按 url 作 key 会让每一页的节点被销毁重建（整屏闪白 + 全部重新解码），
               等于把「开关只换 src」又变成一次整图重绘。按序号复用节点后，换源只改 img 的 src，
               浏览器在新图解码完成前继续显示旧图，切换无缝 -->
          <div
            v-for="(url, index) in pageSlots"
            :class="[
              url
                ? 'block overflow-hidden rounded-sm shadow-panel ring-1 ring-transparent hover:shadow-floating hover:ring-glass-border'
                : 'flex items-center justify-center rounded-sm border border-dashed border-border-light bg-surface-panel',
              url && isPageMenuTarget(index) ? 'outline-primary' : 'outline-transparent',
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
            @contextmenu="handlePageContextMenu($event, index)"
            class="relative outline-2 -outline-offset-2 duration-fast ease-out select-none"
          >
            <!-- 页图：页脚开关打开时 src 指向渲染线程合成好的「带页码」页图，否则指向无页脚原图。
                 两套 URL 同尺寸同坐标系，切换只换 src，不重排、不重渲染乐谱 -->
            <img
              v-if="url"
              :alt="`乐谱预览第 ${index + 1} 页`"
              :src="url"
              class="block h-full w-auto select-none"
              decoding="async"
              draggable="false"
            />
            <!-- 尚未出图的槽位：读数恒按**总页数**报，与页流长度一致 -->
            <span v-else class="text-2xs font-semibold text-fg-muted tabular-nums">
              {{ index + 1 }} / {{ pageSlots.length }}
            </span>
          </div>
        </div>
      </BaseScrollArea>

      <!-- 右下角缩放胶囊：复用 BaseFloatingPill（sm 紧凑形态），适应开关 + 毛玻璃百分比步进器。
           胶囊右对齐（`align="end"`）、内容按左边缘排布，而 `v-auto-width` 会补间胶囊宽度 —— 补间期间
           容器宽度在变、流内内容仍贴左边缘，尾部控件于是被横着拖过被收起内容的整段宽度（点一下「适应」
           开关它自己就跳走）。位移靠布局消掉，两处：
           ① 滑杆组整组包进一个**可收缩的裁剪盒**（`min-w-0 shrink overflow-hidden`）：宽度由 flex 从
              容器宽度反算，展开时被逐帧撑开、内容逐帧露出来，与容器补间天然同步；它全程是「被裁掉 /
              被露出」而不是被压扁。
           ② 尾部开关包在 `shrink-0` 里，配合胶囊的 `justify-end` 钉在右边缘：容器再窄也先压裁剪盒，
              不动开关。开关在两态的绝对位置本来就相同（都贴右边缘），位移只出现在补间的中途帧。
           残留：开启「适应」那一向滑杆组是被摘掉的，滑杆本身仍瞬隐（那是「一组内容消失」的固有一步，
           要连它淡出得再套一层进出场过渡）。 -->
      <BaseFloatingPill
        disabled-teleport
        no-safe-area-inset
        align="end"
        aria-label="预览缩放控制"
        bottom="1.5rem"
        class="justify-end"
        position="absolute"
        size="sm"
        z-index="z-float"
      >
        <div v-if="!isFitMode" class="flex min-w-0 shrink items-center gap-xs overflow-hidden">
          <!-- 两个子项都 shrink-0：裁剪盒收缩时它们保持原尺寸、由裁剪盒裁掉，而不是被 flex 压扁
               （滑杆被压扁会连轨道一起缩窄，那是变形不是收起） -->
          <BaseSlider
            v-model="customZoomPercent"
            :default-value="PREVIEW_DEFAULT_ZOOM_PERCENT"
            :formatter="val => `${Math.round(val)}%`"
            :max="PREVIEW_MAX_ZOOM_PERCENT"
            :min="PREVIEW_MIN_ZOOM_PERCENT"
            :step="2"
            hide-buttons
            wheel-on-hover
            class="shrink-0"
            readout-position="left"
            size="sm"
          />

          <BaseDivider
            class="shrink-0 rounded-full opacity-60"
            color="base"
            length="1rem"
            orientation="vertical"
            thickness="0.125rem"
          />
        </div>

        <!-- BaseCheckbox 的模板是 v-if/v-else 双根，class 不会自动落到内部节点上，故由这层包住承担 shrink-0 -->
        <div class="flex shrink-0 items-center">
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
        </div>
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
 * 滚动容器高度的记忆（变量本体在 `<script setup>` 里，见 rememberedContainerHeight）：
 * 预览页 v-if 重挂载（切 tab 回来）时 ResizeObserver 的异步测量滞后于首帧渲染，若首帧拿到 0
 * 会令自适应页高回退整页高——页面先放大再回落产生闪动。用上次测量值兜底，保证重挂载首帧即正确比例。
 *
 * 记忆是**实例级**（`<script setup>` 的局部变量）而不是模块级，这是刻意的：
 * 它要覆盖的场景是模板内的 v-if 重挂载，那不会重跑 setup，实例级足够；而组件真被整体卸载再挂载时
 * 记忆自然丢失 —— 首帧回退测量值，测量结果下一帧即到，自愈且不残留上一个实例的状态。
 * （此前本注释声称「模块级」，与代码不符：模块级要声明在本块，而本块的内容先于 setup 的 import，
 * 会触发 import/first。）
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
import { buildScoreLineFingerprints } from '@/domains/score/preview/scoreLineFingerprints';
import {
  currentRenderData,
  dropEntry,
  dropIdleFooterPages,
  ensureEntry,
  findInheritSource,
  getCachedRender,
  inheritableIndexes,
  inPlaceIndexes,
  isComplete,
  isPreviewRendering,
  movePages,
  pageBlob,
  pageUrl,
  setCurrentRender,
  writeFooterPages,
  writePage,
} from '@/domains/score/preview/scorePreviewCache';
import { buildScorePageLevelKey, buildScoreRenderCacheKey } from '@/domains/score/preview/scoreRenderCacheKey';
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
import { activeTheme } from '@/platform/composables/useTheme';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';
import { useTargetMenu } from '@/platform/ui/menu/useTargetMenu';
import { useScrollAreaElement } from '@/platform/ui/scroll-area/scrollAreaHandle';
import { clamp, formatBytes } from '@/platform/utils/common';

import type { PreviewPage, PreviewRenderData } from '@/domains/score/preview/scorePreviewCache';
import type { WorkerRenderStage } from '@/domains/score/preview/workers/scoreExportWorker';
import type { ScrollAreaHandle, ScrollAreaScrollbar } from '@/platform/ui/scroll-area/scrollAreaHandle';

defineOptions({ name: 'ScorePreviewPane' });

// ===== 会话级 A4 分页预览缓存已下沉至 scorePreviewCache 共享模块 =====
/** 上次测量到的滚动容器高度（实例级记忆，理由见上方 `<script>` 块的说明） */
let rememberedContainerHeight = 0;

/**
 * 【为什么这里没有「半成品登记表」了】逐页化之后，**缓存条目自己就是半成品登记表**：页在画出来的
 * 那一刻就写进条目（见 scorePreviewCache 的 writePage），条目允许有洞。于是「渲染被中断」不再等于
 * 「这一轮的产物全部作废」—— 已画好的页留在条目里，下一轮同内容键重发时带上 havePages 跳过它们。
 * 本组件只负责展示与派发，不再持有任何页 URL（所有权全在条目，屏上那批也一样）。
 */

/** 当前展示页流对应的渲染数据：切歌/生成时由 applyEntry 同步更新，
 *  右键菜单标题直接读数；同时写入共享缓存供 TopHeader 下载菜单复用，避免重复渲染 */
const applyEntry = (data: PreviewRenderData | null) => {
  setCurrentRender(data);
  applyDisplayUrls(data);
  void ensureFooterComposed(data);
};

/**
 * 页流展示源：页脚打开且**该页**合成层已就绪时用「带页码」页图，否则用无页脚原图。
 * 合成层逐页懒生成（见 ensureFooterComposed），故这里也逐页取源：尚未合成的页先按无页脚展示，
 * 合成完成后再切一次。**洞**（该页未出图）保持 undefined，由模板铺骨架。
 */
const applyDisplayUrls = (data: PreviewRenderData | null) => {
  if (!data) {
    pages.value = [];
    return;
  }
  const footer = settingsStore.scoreShowFooter ? data.footerPages : undefined;
  pages.value = Array.from({ length: data.total }, (_, index) => footer?.[index]?.url ?? pageUrl(data, index));
};

/**
 * 采纳一页页脚合成图：先落账到条目（页图与页脚层在缓存里是**两份**数据，关掉开关时回落页图），
 * 再在该条目正被展示时就地换上带页码的源。
 *
 * 只改一格而不是整表重算（applyDisplayUrls）：两个生产者都会高频调它 —— 整谱渲染逐页顺带合成、
 * 页脚合成分支逐页回传 —— 整表重算等于每页都把全部槽位重建一遍。
 *
 * @param live 该条目此刻就是屏上的页流来源。渲染流式路径传 canStream：那一刻 currentRenderData
 *        还没被换成本轮条目（换值发生在整轮收尾的 applyEntry），拿它比对会恒假、页码又得等到最后。
 *        合成路径传 currentRenderData 比对（那条路径上条目确实已是展示项）。
 */
const adoptFooterPage = (data: PreviewRenderData, index: number, blob: Blob, live: boolean) => {
  // 稠密数组（fill）：稀疏数组的 every / map 会跳过洞，而这里的洞正是「该页还没合成页脚」
  const footerPages: (PreviewPage | undefined)[] = data.footerPages ?? new Array(data.total).fill(undefined);
  footerPages[index] = { url: URL.createObjectURL(blob), blob };
  // 必须经 writeFooterPages 落账（重新称重），不能直接赋值：LRU 的字节合计只在写入时更新
  writeFooterPages(data, footerPages);
  if (live) pages.value[index] = footerPages[index]!.url;
};

/** 已在途的页脚合成条目：开关连点 / 重复调用不会对同一批页面并发合成 */
const footerComposeInFlight = new WeakSet<PreviewRenderData>();

/**
 * 页脚合成层（懒生成）：页面栅格不含页码，开关打开时向渲染线程请求一次
 * 「贴回整页 → 画页码 → 重编码」，结果按条目逐页缓存在 footerPages 上。
 * 于是开关页脚**不触发任何乐谱重渲染**——首次打开合成一次，之后来回切只是换展示源。
 *
 * 合成与整谱渲染共用渲染线程的同一条串行队列，故本条目的合成必定先于「下一次渲染完成」结束；
 * 而缓存驱逐只发生在渲染完成写入时 —— 因此不存在「合成在途时条目已被驱逐、产出的 URL 无人回收」。
 *
 * **可作废**：判据是「发起时那首歌已不是当前歌」。切歌后这份合成连归属都换了人（结果只会入库给
 * 一首不再展示的谱），却要逐页贴图 + 重编码、还占着新歌渲染前面的队列位置，故交给渲染线程中断，
 * 见下方 isObsolete。同一首改内容**不**作废：结果仍属该歌，合成完了照样能用。
 * @param data 目标渲染条目；缺省 / 页脚未开 / 该条目已无缺页脚的在位页时直接返回
 */
const ensureFooterComposed = async (data: PreviewRenderData | null) => {
  if (!data || !settingsStore.scoreShowFooter || footerComposeInFlight.has(data)) return;
  // 判据是「**缺哪几页**」而不是「有没有合成过」：条目允许有洞、也允许在渲染中逐页长出新页，
  // 只看一个布尔标志的话，一轮渲染补齐的后几页会永远拿不到页码
  const inPlace = inPlaceIndexes(data);
  const missing = inPlace.filter(index => !data.footerPages?.[index]);
  if (missing.length === 0) return;
  footerComposeInFlight.add(data);
  // 发起时的歌曲 id（判据见函数头）。不读内容键：内容键在切歌与同歌改内容两种情况下都会变，
  // 而只有前者该作废 —— 用 id 才分得开。
  const songId = scoreEditor.activeSong?.id;
  try {
    // 纸张档位与页边距按条目记录值传（非实时设置）：改设置在途窗口内两者可能不一致
    // 逐页落账 + 逐页换源：整批一次落账会让页码在全部页合成完那一刻一起跳出来（14 页实测 ≈ 400ms），
    // 而单页合成只有 ~22ms。逐页写就能让第 1 页的页码立刻到位；被中断时已落账的页留在条目里，
    // 比整批作废更省（那几页的解码 + 编码成本已经付过了）。
    const composed = await composePageFooter(
      missing.map(index => pageBlob(data, index)!),
      missing,
      data.pageSize,
      data.pageMargin,
      {
        isObsolete: () => scoreEditor.activeSong?.id !== songId,
        onFooterPage: (index, blob) => adoptFooterPage(data, index, blob, currentRenderData.value === data),
      }
    );
    // 兜底：逐页回调一个都没到（或漏了某页）时，才用整批结果补齐尚未落账的那些页。
    // 已落账的页必须跳过 —— 同一页再建一个 object URL，旧的那个就再无人回收。
    const live = currentRenderData.value === data;
    missing.forEach((index, k) => {
      const blob = composed[k];
      if (blob && !data.footerPages?.[index]) adoptFooterPage(data, index, blob, live);
    });
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

/** 屏上页流：下标＝页序，值为该页的展示 URL；**未就位的页为 undefined（洞）**。
 *  洞是合法状态（被打断的那一轮、渲染进行中的尾巴），模板据此在该格铺骨架。
 *  这里只持有引用 —— 页 URL 的所有权全在缓存条目（见 scorePreviewCache 的文件头） */
const pages = ref<(string | undefined)[]>([]);
const isRendering = ref(false);
const errorMessage = ref('');
/**
 * 本轮**计划总页数**（渲染线程排版结束后上报；0 = 未知）。
 * 页流槽位数取它与「已到位页数」的较大者，故它一到就铺满骨架格。
 */
const streamTotal = ref(0);

/** 页流槽位（下标＝页序）：值是该页的展示 URL，未就位的页为 undefined（洞 → 骨架格）。
 *  长度取「计划总页数」与「已到位数组长度」的较大者：pages-planned 之前 streamTotal 为 0，
 *  此时靠已到位页数兜底（缓存命中后直接展示的场景）。 */
const pageSlots = computed<(string | undefined)[]>(() => {
  const count = Math.max(streamTotal.value, pages.value.length);
  return Array.from({ length: count }, (_, index) => pages.value[index]);
});

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

/** 收起本轮渲染态：骨架格、「渲染中」标志与「更新中」提示一起复位。
 *  generate 的收尾（token 仍属本轮时）与「无内容可渲染」的早退共用它 —— 后者在进入 try/finally
 *  之前就返回了，没有别的收尾会替它复位（见 generate 起手的说明）。 */
const resetRenderState = () => {
  streamTotal.value = 0;
  isRendering.value = false;
  isPreviewRendering.value = false;
  dismissUpdateMessage();
};

/**
 * 采纳一份已渲染缓存：把页流交给展示层、认下内容键、退出渲染态，并撤掉「更新中」Message。
 * 条目**允许有洞**：这里照常展示（未就位的页由模板铺骨架），是否继续补齐由调用方判断。
 *
 * 三处调用点（generate 的命中早退、切歌 watch、onActivated 唤醒守卫）此前各写一遍这几行，
 * 且只有第一处带 `dismissUpdateMessage()`。统一带上不改变行为：它按 id 移除且幂等，
 * 另两处调用前都已由 `cancelPendingExport()` 撤掉提示（切歌与 onDeactivated 各一处）。
 */
const adoptCachedRender = (entry: PreviewRenderData, contentKey: string): void => {
  applyEntry(entry);
  currentContentKey = contentKey;
  isRendering.value = false;
  // isPreviewRendering 是顶栏（禁用导出按钮 / 「预览渲染中，请稍候」）读的**共享**标志，必须与
  // isRendering 同进同出：采纳缓存即「退出渲染态」，这里若只清 isRendering，被作废的那一轮
  // （token 已换代 ⇒ 它的 finally 刻意不再复位）留下的 true 就永远没人收 —— 顶栏从此恒显「渲染中」、
  // 导出按钮永久禁用。generate 起手的命中早退会走到这里，那条路径同样绕开了 try/finally。
  isPreviewRendering.value = false;
  errorMessage.value = '';
  dismissUpdateMessage();
};

/** 内容缓存键：失效维度与整曲长图导出同源（见 scoreRenderCacheKey），任一处加维度另一处自动跟上 */
const buildContentKey = () => buildScoreRenderCacheKey(scoreEditor.activeSong, chordsLookupMap.value);

/** 响应式内容键：内容/排版任一依赖变化即重算，作为「重渲染触发」的单一 watch 源 */
const reactiveContentKey = computed(() => buildContentKey());

/**
 * 键的页级段（见 scoreRenderCacheKey.buildScorePageLevelKey）：标题 / 歌者 / 调性 / 主题 / 各项排版
 * 设置这一批「整页共有、与具体某一行无关」的维度。与 lineFingerprints 一起构成「上一版能否按页
 * 继承」的两道判据（见 generate 的继承分支）。
 */
const pageLevelKey = computed(() => buildScorePageLevelKey(scoreEditor.activeSong));

/**
 * 各原始歌词行的渲染输入指纹（下标＝行序号）：编辑歌词后按页最小重建的判据，见 generate。
 * 与内容键同源同口径，但拆到行粒度 —— 改排版设置时它不重算（只依赖歌曲内容与和弦库）。
 */
const lineFingerprints = computed(() => buildScoreLineFingerprints(scoreEditor.activeSong, chordsLookupMap.value));

/**
 * 条目里已在位的那几页是否仍属于本次排版：页数与逐页行范围逐项相等。
 *
 * 内容键是「已在位页还属于这套排版」的**唯一凭据**，但它可能漏掉某个影响分页的维度（键与排版结果
 * 脱钩）；pages-planned 回带的行范围是渲染线程刚算出来的权威读数，两者不符即判废重画。
 */
const sameLayout = (data: PreviewRenderData, total: number, pageLineRanges: number[][]): boolean => {
  if (data.total !== total || data.pageLineRanges.length !== pageLineRanges.length) return false;
  return pageLineRanges.every((range, index) => {
    const prev = data.pageLineRanges[index];
    return prev !== undefined && prev.length === range.length && prev.every((line, k) => line === range[k]);
  });
};

/** 整曲渲染：Worker 离屏渲染 A4 分页（预览展示 / 右键下载本页 / Header 的 PDF·ZIP 下载均复用此结果），
 *  结果**逐页写入共享缓存条目**，UI 层（预览页流 / 右键菜单 / Header 下载菜单）直接读数，不再各算各的。
 *
 *  页的复用有两条路径，都不必重画：① 同内容键的半成品（上一轮被打断，洞由 havePages 跳过）；
 *  ② 编辑歌词后上一版中内容未受影响的那几页（内容键已换代，靠页级段 + 行指纹找出它们，见下方
 *  inheritSource）。两条路径都只影响「本轮派发哪些页不画」，页的落账与上屏机制完全一致。
 *  @param force 忽略缓存与在途轮次，从零重跑（重试按钮 / 收尾发现条目有洞时的自愈）
 *  @param streamOnReplace 屏上挂着**另一内容键**的旧图时也逐页覆盖上屏（见下方 canStream）：
 *         只有「改排版设置」那条来路传 true —— 旧图是按旧设置画的，留着它没有意义 */
const generate = async (force = false, streamOnReplace = false) => {
  const song = scoreEditor.activeSong;
  if (!song || allLineIndices.value.length === 0) {
    applyEntry(null);
    currentContentKey = '';
    // 本行在进入 try/finally **之前**就返回了，没有任何收尾会替这一轮复位渲染态。若上一轮是被
    // invalidateInFlightRender 作废的（token 已换代，它的 finally 刻意不再动这些标志），
    // isRendering / isPreviewRendering / streamTotal 会永远停在 true —— 顶栏一直显示「渲染中」、
    // 骨架格一直挂着，且此后没有任何一轮会来收（早退不设 token，下一轮照样早退）。
    // 无内容可渲染是本轮的**终态**，必须在这里自己收干净。
    resetRenderState();
    return;
  }

  // 读响应式内容键（computed 缓存）：同一 tick 内已被 watch 求值过则直接取用，不再重建整串
  const contentKey = reactiveContentKey.value;

  // 命中缓存：条目里只要有**任何一页**在位就先展示（同内容来回切换 / 重进预览标签零重复渲染）。
  // 完整条目到此即收工；有洞的继续往下走 —— 那些洞正是本轮的活儿（上一轮被打断时留下的）。
  const cached = force ? null : getCachedRender(contentKey);
  if (cached && inPlaceIndexes(cached).length > 0) {
    adoptCachedRender(cached, contentKey);
    if (isComplete(cached)) return;
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

  // 「屏上是否正挂着**本内容键**的条目」：是则本轮直接往它里面填页、逐页上屏（含骨架格）。
  // 屏上是空（首次预览 / 切歌后）也走流式；屏上若是**另一内容键**的旧图则默认整批换新
  // —— 那种情况要保持「旧图继续显示、收尾一次换上」，否则页流一清就是一屏骨架。
  // 必须在下方任何改写 pages 的动作之前拍快照：本轮接手的条目会立刻把页填进 pages。
  const showingOwnEntry = currentRenderData.value !== null && currentContentKey === contentKey;
  /**
   * 本轮是否逐页上屏。三条来路：
   * - 屏上是空（首次预览 / 切歌后）⇒ 流式：骨架格铺满，逐页填；
   * - 屏上正挂着**本内容键**的条目 ⇒ 流式：续跑，或页脚开关重开的那一轮（已在位页由 havePages 跳过）；
   * - 屏上挂着**另一内容键**的旧图 ⇒ 默认整批换新（旧图是上一版**完整**的图，留着比半新半旧可读），
   *   唯独「改排版设置」那条来路（streamOnReplace）例外 —— 旧图是按**旧设置**画的，留着它没有意义，
   *   用户正盯着预览调字号/和弦缩放，逐格换成新页才有反馈，不该等整篇重建完才换图。
   */
  const canStream = pages.value.length === 0 || showingOwnEntry || streamOnReplace;
  /** 「屏上挂着**别人**的旧图」：该弹「更新中」Message（首屏加载框与骨架格各管一边）。
   *  逐页覆盖时也弹：过渡期间屏上是半新半旧，这条提示正是那副样子的说明 */
  const hadCommittedPages = pages.value.length > 0 && !showingOwnEntry;

  /**
   * 「上一版能否按页继承」（编辑歌词后的最小重建）：命中不到同键条目时，在同歌的旧版本里找一版
   * 页级段相同、且只有若干行内容变了的条目 —— 那些行没覆盖到的页本轮不必重画。
   *
   * 【为什么是乐观声明】havePages 必须在**派发前**给出，而「继承来的那几页是否仍属于本次排版」
   * 只能等 pages-planned 回带行范围才知道。故这里按来源条目自己的 pageLineRanges 先声明出去，
   * 排版结果一到立刻用 sameLayout 复核，不符即整段判废重跑（见 onPagesPlanned）—— 最坏情况
   * 白跑一轮排版，与本功能存在之前「一律整谱重画」的代价相同，不会更坏。
   */
  const fingerprints = lineFingerprints.value;
  const inheritSource =
    force || cached ? null : findInheritSource(song.id, contentKey, pageLevelKey.value, fingerprints);
  const inheritIndexes = inheritSource ? inheritableIndexes(inheritSource.entry, inheritSource.dirtyLines) : [];

  /**
   * 本轮派发给渲染线程的 havePages：条目里**已在位**的页由渲染线程跳过绘制与 JPEG 编码 ——
   * 那是整笔渲染里最贵的一段。force 恒为空数组：用户点重试就是要从零重跑，本轮也刻意不吃缓存。
   * 无同键条目时退而用继承页（上一版中内容未受影响的那几页，同样是「我手上已有图」）。
   */
  const havePages = cached ? inPlaceIndexes(cached) : inheritIndexes;
  /** 本轮页落账的条目（pages-planned 时定格）：在此之前没有任何页可写 */
  let entry: PreviewRenderData | null = null;

  // 加载文案的起点：渲染线程还没建立（本会话第一次预览 / 空闲回收后 / 异常废弃）时，本次请求必然要下载
  // 字体子集，于是**首帧**就按「正在加载字体」起，不等 worker 那条上报 —— 上报要等线程跑起来，而命中 HTTP
  // 缓存时子集解析只有几十毫秒，往往整段落在同一帧里，一次都画不出来（见 isRenderWorkerCold）。
  // 只做「升级」，绝不在这把它改回 render：本函数仍可能在上一轮正下载字体时被再次调用（内容变了 ⇒ 键不同、
  // 不走上面的复用分支），而「线程不冷」只说明它已存在、不代表它此刻不在取字体 —— 强行改回就等于把刚亮起的
  // 提示抹掉。假值也无需在此清理：worker 处理任何一个渲染请求，都会在字体 await 之后无条件上报一次 render，
  // 稳态值自然回到 render。唯一的例外是「本轮根本到不了 worker」的失败路径，由下方 catch 显式复位。
  if (isRenderWorkerCold()) renderStage.value = 'fonts';
  // 只有「屏上挂着已提交旧图、本轮整批换新」才弹「更新中」Message：首次构建（无页）留给内容区居中
  // 加载框，同键续跑（屏上就是本轮要接着填的那个条目）留给骨架格 —— 两者都不该多出一条常驻提示
  if (hadCommittedPages) showUpdateMessage();

  /**
   * 判废本轮已接手的页并立刻从零重跑一轮。三条触发路径：
   * - 已在位的页与本次排版不符（见 sameLayout）：那几页属于另一套排版，硬拼会把旧页贴到新谱上；
   * - 按页继承的来源与本次排版不符：同上，只是「那几页」来自上一版而非本键的在途页；
   * - 收尾时发现条目仍有洞（声明已在位的那几页已从条目里消失，或渲染线程少画了页）：页流错位会让
   *   「复制本页」静默拿错页。
   * force ⇒ 不吃缓存、不声明 havePages ⇒ 全页重画，故必然收敛，不会来回重跑。
   */
  const restartFromScratch = () => void generate(true);

  try {
    // isObsolete 双重职责：排队中的过期渲染在开跑前即被判废；已开跑的那一笔也靠它作判据被中断
    //（见本轮起手与 cancelPendingExport 里的 cancelObsoleteInFlightRender）
    await runWorkerExport(buildRenderPayload('a4', song, havePages, settingsStore.scoreShowFooter), {
      isObsolete: () => token !== runToken,
      // 阶段镜像不做 token 过滤：正在占用渲染线程的可能就是上一轮（见 renderStage 声明处）
      onStage: stage => {
        renderStage.value = stage;
      },
      // 页数一到就**定格条目**：页数、逐页行范围、纸张档位与页边距一次写死（被打断的条目照样要在屏上
      // 展示、照样可能被导出消费，而 complete 永远不会来），骨架也在此刻铺满 —— 这是流式渲染的
      // **第一拍**，早于任何一页出图（纯排版阶段结束即有）。
      // 本轮屏上若是别的键的旧图（canStream=false）则只定格、不铺骨架：那种情况整批换新，不闪骨架。
      onPagesPlanned: (total, pageLineRanges) => {
        if (token !== runToken) return;
        // 已在位的那几页必须仍属于本次排版：不符说明内容键漏了某个影响分页的维度，宁可整段判废重跑
        if (cached && inPlaceIndexes(cached).length > 0 && !sameLayout(cached, total, pageLineRanges)) {
          dropEntry(contentKey);
          if (showingOwnEntry) applyEntry(null);
          restartFromScratch();
          return;
        }
        // 继承同理，且这一条更该当场判掉：来源条目与本次排版不一致说明那几行的改动挪动了分页边界，
        // 继承来的页会贴到错的页位上。渲染线程已按 havePages 跳过那几页（声明在排版之前，无从预知），
        // 只能整段判废重跑 —— 代价与本功能存在之前「一律整谱重画」完全相同。
        if (inheritSource && !sameLayout(inheritSource.entry, total, pageLineRanges)) {
          restartFromScratch();
          return;
        }
        entry = ensureEntry(
          contentKey,
          song.id,
          total,
          pageLineRanges,
          settingsStore.scorePageSize,
          settingsStore.scorePageMargin,
          pageLevelKey.value,
          fingerprints
        );
        // 排版已确认与来源逐页一致：把那几页的页图与页脚合成层接收过来（渲染线程跳过的那几页
        // 正是在这里补齐 —— 收尾的 isComplete 校验要求条目无洞）
        if (inheritSource) movePages(entry, inheritSource.entry, inheritIndexes);
        if (canStream) {
          streamTotal.value = total;
          // 逐页覆盖时屏上可能还挂着上一版的尾巴（本轮页数更少）：页数一到就截到新总数 ——
          // 不截的话多出来的格子会一直挂着旧页图，要等收尾 applyEntry 才消失。只丢引用、不撤 URL：
          // 那几张仍归旧条目所有（它此刻还是展示项，撤了屏上就是破图）
          if (pages.value.length > total) pages.value = pages.value.slice(0, total);
        }
      },
      // 每出一页先落账到条目、再上屏（下标＝页序，到达顺序即渲染顺序）。URL 在这里建、随页一起进条目，
      // 不在 complete 时重建（重建会让每张图重新取 blob 解码 → 整屏白闪）。
      // **不论屏上是否在流式展示都写条目**：条目是页唯一的家 —— 「被打断的那一轮已画好的页」
      // 正是靠它留下来，给下一轮同键续跑。
      onPage: (index, blob) => {
        if (token !== runToken || !entry) return;
        writePage(entry, index, { url: URL.createObjectURL(blob), blob });
        if (canStream) pages.value[index] = pageUrl(entry, index);
      },
      // 逐页页脚层（本轮开了页脚时渲染线程顺带合成）：与 onPage 是同一页的两份数据，紧跟其后到达。
      // 落账 + 就地换源都在 adoptFooterPage 里；live 传 canStream 而非 currentRenderData 比对 ——
      // 流式期间 currentRenderData 还是上一轮那条（换值在整轮收尾的 applyEntry），拿它比对会恒假。
      onFooterPage: (index, blob) => {
        if (token !== runToken || !entry) return;
        adoptFooterPage(entry, index, blob, canStream);
      },
    });
    if (token !== runToken) return;
    // 条目必须已定格且**至少有一页**：前者说明 pages-planned 到了（请求若在抵达 worker 前就被判废则不到），
    // 后者排掉「渲染线程一页都没画出来」。两者都是真的什么都没画出来，按失败处理。
    // 空批本身不等于失败：本轮声明的在位页若已铺满整轮（havePages 覆盖全部页），渲染线程本就不产出新页。
    const target = entry;
    if (!target || inPlaceIndexes(target).length === 0) throw new Error('未能生成有效的预览数据');
    // 收尾校验：一轮成功收尾后条目必须**无洞** —— 声明已在位的页应仍在条目里（条目在途中被驱逐或被
    // 同键新对象取代时会丢），其余每一页都由本轮画出来。缺任何一格都是错位页流（「复制本页」会静默
    // 拿错页），宁可整段判废重跑（见 restartFromScratch）。
    if (!isComplete(target)) {
      restartFromScratch();
      return;
    }

    currentContentKey = contentKey;
    // 页已在渲染过程中逐页落账，这里只需把屏上页流与条目对齐 —— 非流式路径正是靠这一步整批换新
    applyEntry(target);
  } catch (err) {
    if (token === runToken) {
      errorMessage.value = err instanceof Error ? err.message : '预览生成失败';
      // 流式路径可能已把前几页放上屏：错误态要看得见，就地清空页流。那几页的 URL **不在这里回收**
      // —— 它们归缓存条目所有，下一轮同键重试（用户点「重试」）直接接着用，不必重画。
      // 非流式（旧图还在展示）不动 —— 那有「更新中」Message 提示失败。
      if (canStream) pages.value = [];
      // 「fonts」这一档是**单向闩**：它只在 worker 走到字体 await 之后的那次无条件上报里才会被改回
      // render（见 renderStage 声明处）。本轮若在到达 worker 之前就失败 —— OffscreenCanvas 不可用、
      // 排队期间被判作废、或 worker onerror 被丢弃 —— 那次上报永远不会来，闩就一直停在 fonts。
      // 本轮既已终结，复位到稳态值。
      renderStage.value = 'render';
    }
  } finally {
    // 页图所有权全在缓存条目，收尾**没有任何 URL 要交接或回收** —— 这正是逐页化换来的简化。
    // 本轮登记的键只在「仍归本轮所有」时才清：token 换代说明已有更新的轮次接手，它可能登记的正是同一个键，
    // 替它清掉会让第三轮重复触发再起一轮（force 重试与在途轮次同键时就会走到这里）
    if (inFlightContentKey === contentKey && token === runToken) inFlightContentKey = '';
    // 本轮已终结：收起骨架格（成功的已由 applyEntry 换成条目里的页，失败的页流已清空）
    if (token === runToken) resetRenderState();
  }
};

const debouncedGenerate = useDebounceFn(
  (streamOnReplace = false) => generate(false, streamOnReplace),
  SCORE_PREVIEW_DEBOUNCE_MS
);

/**
 * 作废在途轮次并中断渲染线程上那一笔，**但不重开、也不动 UI 状态**。
 *
 * 与 cancelPendingExport 的分工：那一位归「切歌 / 切走 / 卸载」用，连骨架格、「更新中」提示与
 * 计划页数一起收掉（接下来不一定还有活儿）；这里只掐掉**已无人要的那一轮**，因为调用方紧接着
 * 就会开新一轮 —— 骨架、计划页数、提示都该原样留着，一收一放只会闪一下。
 *
 * 【为什么内容一变就得**立刻**调，而不是等防抖到点】防抖（SCORE_PREVIEW_DEBOUNCE_MS）只该延后
 * 「开新一轮」（连续编辑合并成一次），不该让旧轮在这段窗口里继续画：键已换代，它剩下的页注定被
 * token 丢掉，却仍占着渲染线程，让新一轮排在它后面 —— 用户看到的就是「改了设置，旧构建照常跑完
 * 才开始新的重建」。切歌早已是这个待遇（见 cancelPendingExport），这里把它补齐给设置与内容变更。
 *
 * 本函数只负责作废，**不撤销任何页 URL**：屏上的页全部归缓存条目（在途轮次已画好的页照样留着，
 * 供新一轮同键续跑），本组件一个 URL 都不持有。
 */
const invalidateInFlightRender = () => {
  runToken++;
  // token 已换代 ⇒ 在途轮次的 isObsolete 此刻必为真，服务层据此才肯中断（它按任务自带的判据决定，
  // 不会误伤用户正等着的导出，见 cancelObsoleteInFlightRender）
  cancelObsoleteInFlightRender();
  // 登记一并作废：否则新一轮同键起手会被 generate 误判成「重复触发」而不起跑
  inFlightContentKey = '';
};

/** 作废进行中的异步导出：runToken 自增使过期 token 的回写被丢弃；切歌/切走与真卸载共用 */
const cancelPendingExport = () => {
  debouncedGenerate.cancel();
  // 不 revoke 任何页 URL：屏上的页全部归缓存条目（切回预览可复用，内存由 LRU 容量控制），
  // 本组件一个 URL 都不持有。屏上那几张也不在这里撤：撤回会让还在显示的页变破图；
  // 留待下一轮 generate 起手决定接续（同键）还是整批换新。骨架格则随本轮终结即刻收起。
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

/** 当前右键页的字节数，未取回前为 null（currentRenderData 由 applyEntry 在切歌/生成时同步设定）。
 *  该页尚未出图（洞）时同样为 null */
const menuPageSize = computed(() => {
  const index = menuTargetIndex.value;
  const data = currentRenderData.value;
  return data && index !== null ? (pageBlob(data, index)?.size ?? null) : null;
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

/**
 * 缓存被**外部**清空（开发面板「清空预览缓存」）时同步撤下页流：那批页 URL 已随清空回收，
 * 留在屏上就是整屏破图。正常的换源路径（applyEntry）本就会改写 pages，此处只兜外部清空这一种；
 * 同一 tick 内若紧接着又 applyEntry(新条目)，watch 回调拿到的是最新值，不会误清。
 */
watch(currentRenderData, data => {
  if (!data) pages.value = [];
});

/**
 * 页脚开关：只切页流展示源，**不重渲染乐谱**（页脚不进内容键，也不进缓存条目的页图）。
 * 首次打开由 ensureFooterComposed 向渲染线程请求一次合成，结果按条目缓存，之后来回切零开销。
 * 页码文字色随主题变化：主题是内容键维度，换主题会整谱重渲 → 新条目 → 合成层按新配色重新生成。
 *
 * 【构建在途时开关怎么办】在途轮次是按**发起那一刻**的开关值派发的（embedFooterPages）：
 * - 轮次「不开页脚」而开关被打开 ⇒ 它跑完也拿不到页码，页码只能等它结束后另起一笔合成；
 * - 轮次「开页脚」而开关被关掉 ⇒ 剩下每一页都白算一次页脚层。
 * 两种情况都是「派发参数已与当前设置不符」，故与切歌同待遇：作废在途轮次、按新开关值重开一轮
 * （不开页脚时它只是白跑，开了页脚时它连页码都补不上，而合成只能排在同一队列的它后面）。
 * 重开那一轮起手就会把**已在位的页**交给 havePages 跳过，而缺页脚的那几页由 generate 命中分支里的
 * ensureFooterComposed 先排进队列（同一条队列 FIFO，合成先跑）——于是页码逐页到位，而不是等整谱
 * 构建完再补一遍。
 */
watch(
  () => settingsStore.scoreShowFooter,
  show => {
    const data = currentRenderData.value;
    // 只在「在途轮次就是当前内容键那一轮」时重开：别的键在途说明内容也变了，那条路径自会重开，
    // 这里再插一轮只会多跑一遍。页脚合成在途（inFlightContentKey 为空）也不算 —— 那笔合成正是
    // 本次开关要的产物，作废它等于白扔。
    if (inFlightContentKey !== '' && inFlightContentKey === reactiveContentKey.value) {
      invalidateInFlightRender();
      debouncedGenerate();
    }
    applyDisplayUrls(data);
    void ensureFooterComposed(data);
    // 关掉页脚：其余条目的合成层此后多半再也用不到，却照旧计入缓存重量（weightOf 把两层相加），
    // 在 96MiB / 48 条的配额下等于把别的歌挤出去。展示项留着（开关再打开零成本切回），
    // 别的条目真要用到时重合成一次（~22ms/页）—— 见 scorePreviewCache 的 dropIdleFooterPages。
    if (!show) dropIdleFooterPages();
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

/** 右键某页：把命中的页码交给 useTargetMenu 在光标处打开（单页大小已在共享缓存 currentRenderData 中，无需额外取数）。
 *  骨架格（该页尚未出图）不拦右键 —— 没有图可复制/下载，原生菜单照旧可用 */
const handlePageContextMenu = (e: MouseEvent, index: number) => {
  if (!pages.value[index]) return;
  e.preventDefault();
  void openPageMenuAt(e, index);
};

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

/** 读取指定页的 Blob（页图与原始 Blob 同存于缓存条目，零成本直取）。
 *  缓存页不含页脚，故按开关合成后再交给剪贴板 / 下载，产物与预览所见一致。 */
const fetchPageBlob = async (index: number): Promise<Blob | null> => {
  const data = currentRenderData.value;
  if (!data) return null;
  // 取**无页脚原图**：footerPages 里是合成后的带页码图，拿它再合成会叠两行页码
  const raw = pageBlob(data, index);
  if (!raw) return null;
  // 页脚合成层已就绪（预览开着页脚时）直接复用同一份 Blob，免去重复合成；未就绪才现合成
  const composed = settingsStore.scoreShowFooter ? data.footerPages?.[index]?.blob : undefined;
  if (composed) return composed;
  // 页脚按缓存渲染时的纸张档位与边距合成，不读实时设置（改设置在途窗口内两者可能不一致）
  const [result] = await composePageFooter([raw], [index], data.pageSize, data.pageMargin);
  return result ?? raw;
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
    // 完整条目直接消费；有洞的（上一轮被打断）交给 generate —— 它会先把已有的页放上屏、再补缺的几页；
    // 无命中则立即清空进 loading 态，绝不带着上一张乐谱等待异步渲染
    if (cached && isComplete(cached)) adoptCachedRender(cached, contentKey);
    else {
      if (!cached) {
        applyEntry(null);
        currentContentKey = '';
      }
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

/**
 * 上一次「屏上这批页图」的生效主题。
 *
 * 用来把同一条重渲触发链上的**两条来路分开**：换主题与改排版都经 activeContentKey（主题本身
 * 就是内容键的一个维度），但屏上遗留物的性质完全不同 ——
 * - 同主题改排版：旧图只是版式旧了，配色仍然正确，逐页覆盖成新页期间留着有参考价值（用户正盯着调）；
 * - 换主题：旧图的**整套配色**（纸底 + 墨色）都错了，逐页覆盖期间两套配色同屏，看着像渲染坏了。
 *   故换主题要先把旧图从屏上撤掉（页流清空、铺骨架），再逐页铺新的。
 *
 * 休眠期间（activeContentKey 为空、watcher 早退）刻意**不消费**：那时并不重渲，
 * 标记必须留给 onActivated 的唤醒守卫，否则切回预览时屏上会一直留着旧主题的图。
 */
let lastRenderTheme = activeTheme.value;
const consumeThemeChange = (): boolean => {
  const changed = activeTheme.value !== lastRenderTheme;
  lastRenderTheme = activeTheme.value;
  return changed;
};

watch(
  activeContentKey,
  key => {
    if (!key) return;
    // 键一变，在途那一轮（若是别的键）就已无人要：**立刻**作废并中断，不等这 150ms 防抖到点 ——
    // 与切歌同待遇（见 invalidateInFlightRender）。防抖只负责延后「开新一轮」，不该让旧轮继续画
    // 它注定被丢掉的页，还让新一轮排在它后面。在途就是本键时不动：那是「首次激活时 onActivated
    // 与防抖各起一轮」的重复触发，交给 generate 起手的复用分支收工即可。
    if (inFlightContentKey !== '' && inFlightContentKey !== key) invalidateInFlightRender();
    // 面板激活时键变了 ⇒ 来路是**改排版设置**或**换主题**（歌词/元数据/切歌都发生在别的标签，
    // 那会先失活；切歌另有自己的 watch）：
    // - 改排版：传「逐页覆盖」，让屏上旧图被逐格换成新页 —— 用户正盯着预览调字号/缩放，
    //   要的是马上看到新排版，而不是等整篇重建完才一次换图；
    // - 换主题：旧图整套配色都错了，不能留。先撤空页流（旧图当场消失、模板铺骨架）再重渲，
    //   缓存命中即整批换上新图，未命中则逐页流式铺（pages 已空 ⇒ generate 的 canStream 为真）。
    if (consumeThemeChange()) {
      applyEntry(null);
      currentContentKey = '';
      debouncedGenerate();
    } else debouncedGenerate(true);
  },
  { immediate: false }
);

onActivated(async () => {
  isPaneActive = true;
  // 休眠期间换过主题：屏上留着的页图整套配色都是错的，必须撤掉、不能靠逐页覆盖慢慢换。
  // 在读 contentKey 之前消费，好让下面的比对分支一并把它当作「需要重建」处理。
  const themeChanged = consumeThemeChange();
  const contentKey = reactiveContentKey.value;
  // 唤醒守卫：如果休眠（在其他 Tab）期间切过歌、改过内容或换过主题，先与已渲染内容比对
  if (contentKey !== currentContentKey || themeChanged) {
    const cached = contentKey ? getCachedRender(contentKey) : null;
    // 缓存里已有该主题的完整一套：整批换上新图，比「撤空再逐页铺」更快也更稳
    if (cached && isComplete(cached)) adoptCachedRender(cached, contentKey);
    else {
      // 无缓存要撤空进 loading；换主题时缓存有洞（不完整）同样撤空 ——
      // 留着旧配色的图与新页同屏，正是这次要消灭的现象
      if (!cached || themeChanged) {
        applyEntry(null);
        currentContentKey = '';
      }
      await generate();
    }
    // 键没变但屏上条目不完整（休眠期间那一轮被中断，缺页留在条目里）：同样要把缺的页补上
  } else if ((!currentRenderData.value || !isComplete(currentRenderData.value)) && hasLyricsText.value)
    await generate();

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
