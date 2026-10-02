import { computed, ref } from 'vue';

import { useScoreExport } from '@/app/layouts/useScoreExport';
import { useAudioPlayer } from '@/app/services/audio/useAudioPlayer';
import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { getChordName } from '@/domains/chord/theory/theory';
import { isArrangeCanvasBuilding } from '@/domains/score/editor/arrangeCanvasBusy';
import { useScoreEditorStore } from '@/domains/score/editor/store/scoreEditorStore';
import { isPreviewRendering } from '@/domains/score/preview/scorePreviewCache';
import { useTextTransfer } from '@/domains/score/transfer/useTextTransfer';
import { useUiStore } from '@/platform/store/uiStore';

import type { PortableSong } from '@/domains/score/transfer/textCodec';
import type { PasteSongOutcome } from '@/domains/score/transfer/useTextTransfer';

/**
 * 顶栏**文档操作区**（工作台：试听 / 复制 / 粘贴；乐谱：复制文字 / 粘贴 / 复制长图 / 下载）的
 * 禁用判据、提示文案与 handler。
 *
 * 三条不变量（改动本文件前先读这三条）：
 * 1. **禁用判据与提示文案同序同数** —— 每个按钮一对 computed（`isXxxDisabled` + `xxxTooltip`），
 *    提示按「原因 → 动作」两段写，原因分支与判据的分支一一对应。判据加一条、提示就跟着加一条，
 *    不会出现「按钮已禁用、提示还写着点它会怎样」的自相矛盾。
 * 2. **窄屏折叠进「更多」菜单的项与顶栏按钮完全同源** —— 同一个判据、同一份文案、同一个 handler，
 *    折叠只是换承载形态，不复制逻辑（见 useHeaderLayout 的 isActionFold）。
 * 3. **导出链路的三处出口共用 `canExportScore`**（复制长图按钮、下载菜单、下载触发按钮）——
 *    它们依赖同一份产物，判据分开写迟早出现「长图能复制、下载却禁用」这类不一致。
 */
export function useHeaderDocActions() {
  const editorStore = useChordEditorStore();
  const scoreEditor = useScoreEditorStore();
  const uiStore = useUiStore();
  const { isPlaying, isSustaining, isAudioPreparing, playCurrentChord, startChordSustain, stopChordSustain } =
    useAudioPlayer();

  const { copyChordText, pasteChordFromClipboard, copySongText, pasteSongFromClipboard, importPortableSong } =
    useTextTransfer();

  /** 乐谱「预览」导出动作与下载菜单标题（长图/PDF/Zip + 尺寸预估），逻辑见 useScoreExport.ts */
  const { isPreviewExportMode, handleScoreExport, downloadExportMenuItems, downloadMenuTitle } = useScoreExport();

  /** 「预览导出产物已就绪」判据：预览 tab、非渲染中 / 复制中、有歌词。
   *  由乐谱页三个出口共用 —— 复制长图按钮、下载菜单、下载触发按钮：三者依赖的是同一份产物，
   *  判据分开写迟早会出现「长图能复制、下载却禁用」这类不一致。
   *  菜单侧漏禁更糟：按钮已禁用而菜单仍可 hover 展开时，会弹出面板并给按钮套上「打开中」的强调样式 */
  const canExportScore = computed(
    () => isPreviewExportMode.value && !uiStore.isCopying && !isPreviewRendering.value && scoreEditor.hasLyrics
  );

  /**
   * 预览渲染中（且当前就在预览 tab）：复制乐谱文字 / 粘贴乐谱都与导出链路共用同一条渲染线程，
   * 分页图尚未出全时暂禁，避免与导出竞态。
   * 判据只在此处写一份、两个按钮共用 —— 分开写迟早冒出「粘贴能用、复制却禁用」这类不一致。
   * 注意渲染标记只在预览 tab 参与判断：后台残留的渲染不该禁用其他 tab 的动作。
   */
  const isPreviewBusy = computed(() => isPreviewExportMode.value && isPreviewRendering.value);

  /**
   * 顶栏构建指示条的状态：**谱面的 canvas 正在出图** —— 预览页的分页图渲染中，或排列区的
   * 行画布正在重排重绘。
   *
   * 与 `isPreviewBusy` 的分工：后者是**动作禁用判据**（只在预览 tab 参与判断 —— 后台残留的渲染
   * 不该禁用别的 tab 的动作）；本条只驱动一个纯视觉指示条，故两个 tab 的构建都算 ——
   * 用户在哪个 tab 都该看得见「谱面正在出图」。
   */
  const isScoreCanvasBuilding = computed(() => isPreviewRendering.value || isArrangeCanvasBuilding.value);

  /** 无结构纯歌词「确认兜底」：待确认的载荷 + 确认弹窗开关 */
  const pendingLyricsImport = ref<PortableSong | null>(null);
  const isLyricsImportConfirmOpen = ref(false);

  /** 工作台可复制条件：指板非空且已解析出和弦名 */
  const canCopyChord = computed(() => !editorStore.isFretBoardEmpty && Boolean(getChordName(editorStore.draftChord)));

  // ===== 文档操作区各按钮的禁用判据与提示 =====
  // 每个按钮一对 computed：禁用判据（驱动 :disabled）+ 提示（驱动 v-tooltip）。
  // 提示按「原因 → 动作」两段写，原因分支与判据的分支**同序同数** —— 判据加一条、提示就跟着加一条，
  // 两处永远对得上，不会出现「按钮已经禁用、提示还写着点它会怎样」的自相矛盾。

  /** 试听按钮的图标判据：已受理 / 正在播放 / 正在持续发声都显示「停止」形。
   *  受理窗口（isAudioPreparing）必须在内 —— 首次点击要等懒加载的音频实现 chunk 到位才翻转
   *  isPlaying，不含它则点击后按钮毫无变化，整段等待看起来就像页面卡住。 */
  const isPlayActive = computed(() => isPlaying.value || isSustaining.value || isAudioPreparing.value);

  /** 工作台·试听：指板为空（无可试听的内容）或已进入播放态。
   *  「已受理但尚未起音」的那一小段窗口按播放态处理，不给中间文案 —— 点击当刻就是播放态的样子。
   *  禁用判据刻意**不含 isSustaining**：长按持续发声期间按钮必须保持可用 —— 一旦被禁用，
   *  ActionButton 的「禁用即中止长按」会当场补发 hold-end，持续发声刚起就被自己掐掉。
   *  同理 isAudioPreparing 只由点击路径置位、延音路径不碰它（见 useAudioPlayer 的 runPlayback）。 */
  const isPlayDisabled = computed(() => editorStore.isFretBoardEmpty || isAudioPreparing.value || isPlaying.value);

  /** 工作台·试听提示（原因分支与禁用判据同序同数：指板为空 → 播放中） */
  const playChordTooltip = computed(() => {
    if (editorStore.isFretBoardEmpty) return '指板为空，暂无可试听的和弦';
    if (isAudioPreparing.value || isPlaying.value) return '正在播放中';
    return '播放/试听当前和弦（长按持续发声）';
  });

  /** 工作台·复制当前和弦：防重入锁期间，或指板为空 / 解不出和弦名 */
  const isCopyChordDisabled = computed(() => uiStore.isCopying || !canCopyChord.value);

  /** 工作台·复制当前和弦提示（`!canCopyChord` 的两种情形各自给原因） */
  const copyChordTooltip = computed(() => {
    if (uiStore.isCopying) return '正在复制中';
    if (editorStore.isFretBoardEmpty) return '指板为空，没有可复制的和弦';
    if (!getChordName(editorStore.draftChord)) return '当前指板识别不出和弦名';
    return '复制当前和弦';
  });

  /** 工作台·粘贴和弦：仅防重入锁（剪贴板内容在读取时才知道是否可用，不预先禁用） */
  const isPasteChordDisabled = computed(() => uiStore.isCopying);

  /** 工作台·粘贴和弦提示 */
  const pasteChordTooltip = computed(() => (uiStore.isCopying ? '正在复制中' : '从剪切板粘贴'));

  /** 乐谱·复制文字：防重入锁 + 未打开乐谱 + 预览渲染中（与粘贴同源，见 isPreviewBusy）。
   *  判据与 tab 无关（含「预览」tab 也可用），只有「正在渲染」这一条临时禁用 */
  const isCopyScoreTextDisabled = computed(() => uiStore.isCopying || !scoreEditor.activeSong || isPreviewBusy.value);

  /** 乐谱·复制文字提示 */
  const copyScoreTextTooltip = computed(() => {
    if (uiStore.isCopying) return '正在复制中';
    if (!scoreEditor.activeSong) return '请先打开一首乐谱';
    if (isPreviewBusy.value) return '预览渲染中，暂不可复制';
    return '复制乐谱文字';
  });

  /** 乐谱·粘贴乐谱：防重入锁 + 预览渲染中（与复制文字同源，见 isPreviewBusy） */
  const isPasteScoreDisabled = computed(() => uiStore.isCopying || isPreviewBusy.value);

  /** 乐谱·粘贴乐谱提示 */
  const pasteScoreTooltip = computed(() => {
    if (uiStore.isCopying) return '正在复制中';
    if (isPreviewBusy.value) return '预览渲染中，暂不可粘贴';
    return '从剪切板粘贴';
  });

  /** 乐谱·导出产物不可用的原因（空串 = 可用）。
   *  复制长图与下载依赖同一份产物、共用同一条判据 canExportScore，故原因文案也只写一份 ——
   *  分开写迟早冒出「长图能复制、下载却禁用」时两处提示各说各话。
   *  原因分支与 canExportScore 的四项同序同数。 */
  const exportScoreBlockReason = computed(() => {
    if (!isPreviewExportMode.value) return '切换到「预览」标签页后可用';
    if (uiStore.isCopying) return '正在复制中';
    if (isPreviewRendering.value) return '预览渲染中，请稍候';
    if (!scoreEditor.hasLyrics) return '乐谱暂无歌词，无可导出的内容';
    return '';
  });

  /** 乐谱·复制长图提示 */
  const copyScoreImageTooltip = computed(() => exportScoreBlockReason.value || '复制整曲长图');

  /** 乐谱·下载提示：**仅在禁用时**给原因 —— 该菜单 hover 即展开面板，
   *  可用时再弹一层提示会与面板叠在一起（其余按钮没有这层顾虑，可用时照常说明动作） */
  const downloadScoreTooltip = computed(() => (canExportScore.value ? '' : exportScoreBlockReason.value));

  /** 工作台：复制当前编辑的和弦文字到剪贴板 */
  const handleCopyChord = () => void copyChordText(editorStore.draftChord);

  /**
   * 粘贴 / 复制被拒的令牌：各自被拒时 +1，绑在顶栏对应那枚按钮上（`v-shake`）—— 剪贴板为空、
   * 内容损坏、格式不认识、贴错页面、剪贴板写不进去、长图渲染失败都无法预判，反馈就落在刚点下去
   * 的那枚按钮上。提示（toast）由动作实现发出，这里只补那一下视觉定位。
   */
  const pasteChordRejectTick = ref(0);
  const pasteSongRejectTick = ref(0);
  const copyScoreTextRejectTick = ref(0);
  const copyScoreImageRejectTick = ref(0);

  /** 工作台：从剪贴板文字载入编辑器草稿（切「新建」态） */
  const handlePasteChord = async (): Promise<void> => {
    if (!(await pasteChordFromClipboard())) pasteChordRejectTick.value += 1;
  };

  /** 乐谱：复制当前乐谱文字到剪贴板（写不进剪贴板即被拒） */
  const handleCopySong = async (): Promise<void> => {
    if (!(await copySongText(scoreEditor.activeSong))) copyScoreTextRejectTick.value += 1;
  };

  /** 乐谱：复制整曲长图（渲染 / 转码 / 剪贴板任一环失败都算被拒）。判据用 null：按钮在
   *  `canExportScore` 为真时才是可点的，此时拿到 null 只可能是执行失败（见 scoreExportActions） */
  const handleCopyScoreImage = async (): Promise<void> => {
    if ((await handleScoreExport('copy')) === null) copyScoreImageRejectTick.value += 1;
  };

  /** 乐谱：从剪贴板文字导入（始终新建一首乐谱）；无结构纯歌词先弹「确认兜底」交给用户决定。
   *  互斥由动作实现负责（重入时返回 none，不会落地也不会确认） */
  const handlePasteSong = async (): Promise<void> => {
    const outcome: PasteSongOutcome = await pasteSongFromClipboard();
    if (outcome.status === 'none') pasteSongRejectTick.value += 1;
    if (outcome.status !== 'needsConfirm') return;
    pendingLyricsImport.value = outcome.portable;
    isLyricsImportConfirmOpen.value = true;
  };

  /** 用户确认「仍按纯歌词导入」后落地建谱 */
  const handleConfirmLyricsImport = () => {
    const portable = pendingLyricsImport.value;
    if (portable) importPortableSong(portable);
    isLyricsImportConfirmOpen.value = false;
    pendingLyricsImport.value = null;
  };

  return {
    editorStore,
    isPlayActive,
    isPlayDisabled,
    playChordTooltip,
    playCurrentChord,
    startChordSustain,
    stopChordSustain,
    isCopyChordDisabled,
    copyChordTooltip,
    handleCopyChord,
    isPasteChordDisabled,
    pasteChordTooltip,
    handlePasteChord,
    pasteChordRejectTick,
    isCopyScoreTextDisabled,
    copyScoreTextTooltip,
    handleCopySong,
    copyScoreTextRejectTick,
    isPasteScoreDisabled,
    pasteScoreTooltip,
    handlePasteSong,
    pasteSongRejectTick,
    canExportScore,
    copyScoreImageTooltip,
    downloadScoreTooltip,
    handleScoreExport,
    handleCopyScoreImage,
    copyScoreImageRejectTick,
    downloadExportMenuItems,
    downloadMenuTitle,
    isLyricsImportConfirmOpen,
    handleConfirmLyricsImport,
    isScoreCanvasBuilding,
  };
}
