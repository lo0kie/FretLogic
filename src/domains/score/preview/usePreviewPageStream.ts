/**
 * 预览页流：屏上页流的展示源、页脚叠加层，以及两者的落账。
 *
 * 从 `ScorePreviewPane.vue` 里切出来，判据是这一整块**只与「屏上该显示什么」有关**：它不碰渲染线程、
 * 不碰缓存键、不碰轮次令牌，只把缓存条目翻译成两组 URL（含洞）。宿主因此只剩「什么时候换条目」。
 *
 * 【页脚是叠加层，不是页图的第二份】页图（`pages`）恒为无页脚原图；页码是**独立的一层**
 * （`footerBands`，透明 PNG 条带，下标＝页序）。模板把叠加层绝对定位在页图底部、按「显示页脚」
 * 开关决定挂不挂 —— 于是开关页脚 = 一次 CSS 显隐，既不重编码也不重渲染乐谱（见 ensureFooterBands）。
 *
 * 三条容易被改坏的不变量，各自见其下注释：
 * ① 页 URL 的所有权全在缓存条目，本模块只持有引用（并记下这批引用取自哪一条，见 displayEntry）；
 * ② 页脚层是缓存里与页图并列的**第二份**数据，落账必须经 writeFooterPages（重新称重）；
 * ③ 页脚条带的作废判据是**歌曲 id** 而不是内容键。
 */
import { computed, ref, shallowRef } from 'vue';

import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { createPageUrl, releasePageUrl } from '@/domains/score/preview/previewBlobUrls';
import {
  currentRenderData,
  inPlaceIndexes,
  pageBlob,
  pageUrl,
  setCurrentRender,
  writeFooterPages,
} from '@/domains/score/preview/scorePreviewCache';
import { RENDER_ABORT_MESSAGE } from '@/domains/score/preview/workers/scoreExportWorker/scoreExportTypes';
import { useSettingsStore } from '@/platform/store/settingsStore';
import { useUiStore } from '@/platform/store/uiStore';

import type { PreviewPage, PreviewRenderData } from '@/domains/score/preview/scorePreviewCache';
import type { useScoreRenderPayload } from '@/domains/score/preview/useScoreRenderPayload';

type ComposeFooterBands = ReturnType<typeof useScoreRenderPayload>['composeFooterBands'];

export interface PreviewPageStreamOptions {
  /** 页脚条带服务（来自 useScoreRenderPayload）：预览叠加层，见 ensureFooterBands */
  composeFooterBands: ComposeFooterBands;
  /** 当前预览渲染的超采样比（叠加层须按它出像素才能与页图对齐，见 PREVIEW_RENDER_RATIO） */
  renderRatio: number;
}

export const usePreviewPageStream = ({ composeFooterBands, renderRatio }: PreviewPageStreamOptions) => {
  const scoreEditor = useScoreEditorStore();
  const settingsStore = useSettingsStore();
  const uiStore = useUiStore();

  /**
   * 【为什么这里没有「半成品登记表」了】逐页化之后，**缓存条目自己就是半成品登记表**：页在画出来的
   * 那一刻就写进条目（见 scorePreviewCache 的 writePage），条目允许有洞。于是「渲染被中断」不再等于
   * 「这一轮的产物全部作废」—— 已画好的页留在条目里，下一轮同内容键重发时带上 havePages 跳过它们。
   * 本模块只负责展示与派发，不持有任何页 URL（所有权全在条目，屏上那批也一样）。
   */
  /** 屏上页流：下标＝页序，值为该页的展示 URL；**未就位的页为 undefined（洞）**。
   *  洞是合法状态（被打断的那一轮、渲染进行中的尾巴），模板据此在该格铺骨架。 */
  const pages = ref<(string | undefined)[]>([]);

  /**
   * 屏上页脚的**叠加层** URL（下标＝页序，未生成 / 已生成但为洞时为 undefined）：
   * 透明 PNG 条带，模板按 `scoreShowFooter` 决定挂不挂。与 `pages`（页图）是两份**并列**数据，
   * 不再像早先那样二选一 —— 开关页脚因此只是显隐一层，零 Worker 调用、零重编码。
   */
  const footerBands = ref<(string | undefined)[]>([]);

  /** 从条目取各页叠加层 URL（稠密数组，长度＝total；未生成的格为 undefined） */
  const footerBandUrlsOf = (data: PreviewRenderData): (string | undefined)[] =>
    Array.from({ length: data.total }, (_, index) => data.footerPages?.[index]?.url);

  /**
   * 屏上页流**当前的归属条目** —— `pages` 里那些 URL 是从哪一条条目取来的。
   *
   * 页 URL 的唯一主人始终是缓存条目（本模块只持引用），但「复制本页 / 下载本页」要取的是
   * **屏上这一页**，就只能从归属条目取：`currentRenderData` 要等整轮收尾的 applyEntry 才换值，
   * 流式渲染期间它还是上一轮那条（首次预览时干脆是 null）—— 照它取会拿到上一首的同页、或取不到，
   * 于是用户看到的是「页明明已经画出来了，复制却要等整轮渲染完」。
   *
   * 两条写入路径各管一段：整批换源（applyDisplayUrls）与逐页上屏（adoptStreamingEntry）。
   */
  const displayEntry = shallowRef<PreviewRenderData | null>(null);

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
   * 页流展示源：**恒为无页脚页图**。
   *
   * 【为什么不再按开关切源】早先这里是「页脚打开且该页合成层就绪时用带页码页图，否则用原图」——
   * 那条路径的合成层是**整页重编码的 JPEG**（解码 + 重编码 ~30ms/页），开关页脚因此很贵。现在页脚
   * 是独立的**透明条带叠加层**（见 footerBands），页图这一层恒不变，叠加层由模板按开关显隐，
   * 两者在 DOM 里各占一个 <img>，切换只是 CSS —— 本函数因此不再需要读 scoreShowFooter 了。
   *
   * 归谁只能有一个答案，两条写入路径（本函数与 adoptStreamingEntry）都必须写。
   */
  const applyDisplayUrls = (data: PreviewRenderData | null) => {
    displayEntry.value = data;
    if (!data) {
      pages.value = [];
      footerBands.value = [];
      return;
    }
    pages.value = Array.from({ length: data.total }, (_, index) => pageUrl(data, index));
    footerBands.value = footerBandUrlsOf(data);
  };

  /**
   * 采纳本轮条目为屏上页流的归属（流式路径在 pages-planned 时调用；传 null 表示屏上不再归它）。
   *
   * 与 applyDisplayUrls 的分工：那条走**整批换源**（收尾 / 命中缓存），本条走**逐页上屏** ——
   * 流式期间页一画出来就进 pages，而整轮收尾的 applyDisplayUrls 还没到，屏上这批页已经归本轮条目了。
   * 两者都只改归属，页 URL 的所有权仍在条目。
   */
  const adoptStreamingEntry = (data: PreviewRenderData | null): void => {
    displayEntry.value = data;
  };

  /**
   * 屏上第 index 页所在的条目 —— 「复制本页 / 下载本页」与右键菜单的页大小读数共用的取值口径。
   *
   * 先认**归属条目**，再退到 `currentRenderData`（后者只在「屏上挂着别的内容键的旧图」那条整批换新
   * 路径上才是屏上的来源）。两道都按「**该条目手里真有这一页**」筛，而不是只认第一个非空条目：
   * 归属是引用层面的记账，真取页时仍以条目自己有没有这格为准 —— 记账一旦滞后，也不会把空页当
   * 有效页报出去。
   */
  const entryOfDisplayedPage = (index: number): PreviewRenderData | null =>
    [displayEntry.value, currentRenderData.value].find(
      (entry): entry is PreviewRenderData => entry !== null && pageBlob(entry, index) !== undefined
    ) ?? null;

  /**
   * 采纳一页页脚**叠加层**：先落账到条目（页图与叠加层在缓存里是**两份**数据），
   * 再在该条目正被展示时就地挂上该页的叠加层 URL。
   *
   * 只改一格而不是整表重算（applyDisplayUrls）：整谱渲染逐页顺带产出、条带分支逐页回传，
   * 整表重算等于每页都把全部槽位重建一遍。
   *
   * @param live 该条目此刻就是屏上的页流来源。渲染流式路径传 canStream：那一刻 currentRenderData
   *        还没被换成本轮条目（换值发生在整轮收尾的 applyEntry），拿它比对会恒假、页码又得等到最后。
   */
  const adoptFooterBand = (data: PreviewRenderData, index: number, blob: Blob, live: boolean) => {
    // 稠密数组（fill）：稀疏数组的 every / map 会跳过洞，而这里的洞正是「该页还没产出叠加层」
    const footerPages: (PreviewPage | undefined)[] = data.footerPages ?? new Array(data.total).fill(undefined);
    // 覆盖已有格时先回收被换掉的那个 object URL：叠加层的 URL 只在「被替换」或「条目被驱逐 / 被丢弃」
    // 两个时机回收，而驱逐是按**当前**数组走一遍 —— 被换掉的那个从此无人引用，也就再没有回收时机。
    const replaced = footerPages[index];
    const nextPage = { url: createPageUrl(blob), blob };
    footerPages[index] = nextPage;
    if (replaced && replaced !== nextPage) releasePageUrl(replaced.url);
    // 必须经 writeFooterPages 落账（重新称重），不能直接赋值：LRU 的字节合计只在写入时更新。
    // 被拒（isWritable 为假）时它已就地回收了这一页的 URL —— 此时绝不能再把 URL 铺上屏，
    // 否则叠加层里出现的是已 revoke 的地址（破图）。
    if (!writeFooterPages(data, footerPages)) return;
    if (live) footerBands.value[index] = nextPage.url;
  };

  /** 已在途的页脚条带条目：开关连点 / 重复调用不会对同一批页面并发产出 */
  const footerBandInFlight = new WeakSet<PreviewRenderData>();

  /**
   * 页脚**叠加层**（懒生成）：页面栅格不含页码，开关打开时向渲染线程请求一次
   * 「只画页码、产出透明 PNG 条带」，结果按条目逐页缓存在 footerPages 上。
   *
   * 与早先的「整页合成」相比：那条要解码页图 + 重编码整页 JPEG（实测 ~30ms/页），本条只新建一张
   * 「页宽 × 页脚带高」的透明画布、画一行字（实测 ~0.7ms / 7KB/页）—— 便宜约两个数量级。
   * 于是「首次打开页脚」这一下几乎无感，之后来回切更是纯 CSS 显隐（页图与叠加层各占一层，
   * 都不变，只是叠加层挂不挂）。
   *
   * **可作废**：判据是「发起时那首歌已不是当前歌」。切歌后这份叠加层连归属都换了人，占着队列
   * 也没人看，故交给渲染线程中断（见 isObsolete）。同一首改内容**不**作废。
   * @param data 目标渲染条目；缺省 / 页脚未开 / 该条目已无缺叠加层的在位页时直接返回
   */
  const ensureFooterBands = async (data: PreviewRenderData | null) => {
    if (!data || !settingsStore.scoreShowFooter || footerBandInFlight.has(data)) return;
    // 判据是「**缺哪几页**」而不是「有没有产出过」：条目允许有洞、也允许在渲染中逐页长出新页，
    // 只看一个布尔标志的话，一轮渲染补齐的后几页会永远拿不到页码
    const inPlace = inPlaceIndexes(data);
    const missing = inPlace.filter(index => !data.footerPages?.[index]);
    if (missing.length === 0) return;
    footerBandInFlight.add(data);
    // 发起时的歌曲 id（判据见函数头）。不读内容键：内容键在切歌与同歌改内容两种情况下都会变，
    // 而只有前者该作废 —— 用 id 才分得开。
    const songId = scoreEditor.activeSong?.id;
    try {
      // 纸张档位与页边距按条目记录值传（非实时设置）：改设置在途窗口内两者可能不一致。
      // 比按**当前预览渲染比**传：叠加层与页图必须同比出像素，否则字被拉伸（见 PREVIEW_RENDER_RATIO）。
      const bands = await composeFooterBands(missing, data.pageSize, data.pageMargin, renderRatio, {
        isObsolete: () => scoreEditor.activeSong?.id !== songId,
        onFooterBand: (index, blob) => adoptFooterBand(data, index, blob, currentRenderData.value === data),
      });
      // 兜底：逐页回调一个都没到（或漏了某页）时，才用整批结果补齐尚未落账的那些页。
      // 已落账的页必须跳过 —— 同一页再建一个 object URL，旧的那个就再无人回收。
      const live = currentRenderData.value === data;
      missing.forEach((index, k) => {
        const blob = bands[k];
        if (blob && !data.footerPages?.[index]) adoptFooterBand(data, index, blob, live);
      });
    } catch (err) {
      // 被切歌作废（非失败）：结果本就没人要，静默收工 —— 否则切一次歌就弹一句「页脚生成失败」。
      // 判据是渲染线程中断点与服务层排队作废共用的同一条文案常量（见 RENDER_ABORT_MESSAGE）。
      if (err instanceof Error && err.message === RENDER_ABORT_MESSAGE) return;
      // 生成失败（如环境不支持 OffscreenCanvas）退回无页脚展示，不打断预览
      uiStore.message.warning('页脚生成失败，已按无页脚显示');
    } finally {
      footerBandInFlight.delete(data);
    }
  };

  /** 当前展示页流对应的渲染数据：切歌/生成时同步更新，右键菜单标题直接读数；
   *  同时写入共享缓存供 TopHeader 下载菜单复用，避免重复渲染 */
  const applyEntry = (data: PreviewRenderData | null) => {
    setCurrentRender(data);
    applyDisplayUrls(data);
    void ensureFooterBands(data);
  };

  return {
    pages,
    footerBands,
    streamTotal,
    pageSlots,
    displayEntry,
    applyEntry,
    applyDisplayUrls,
    adoptStreamingEntry,
    entryOfDisplayedPage,
    adoptFooterBand,
    ensureFooterBands,
  };
};
