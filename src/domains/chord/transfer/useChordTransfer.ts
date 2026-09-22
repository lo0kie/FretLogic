/**
 * 和弦域文字传递：复制单个和弦/分组到剪贴板、从剪贴板载入，以及「分享链接」的生成与落地。
 *
 * 四条入口共用**一种载体**（token：载荷文本 + 压缩编码，见 platform/utils/transfer），
 * 复制与分享的差别只是外壳——复制投放到剪贴板（裸 token），分享在 token 外套一层地址：
 * - 生成侧：`buildChordPayload` / `buildGroupPayload`（载荷）→ `buildChordToken` / `buildGroupToken`（载体）
 *   是唯一来源，复制与分享都调它，不允许自行拼装或自行编码；
 * - 消费侧：`resolveTransferPayload` 把「地址 / 裸 token / 旧版纯文本」归一成同一份载荷文本，
 *   再由 `landPortableChord` / `applyPortableGroup` 这一个落地实现处理，
 *   剪贴板粘贴与打开链接的差别只在显式参数（`persist`：粘贴只载入草稿，链接直接入库）。
 * 新增入口时请复用这两组函数，勿另起一份拼装/落地代码。
 *
 * 剪贴板读写、message 与 isCopying 防重入锁全部收敛于此，组件保持薄；
 * 调用方（工具栏、卡片/分组菜单）不要再各自包一层锁——两套写方必然漏掉一个入口。
 * 乐谱域的 useTextTransfer 委托本模块提供和弦能力。
 */
import { storeToRefs } from 'pinia';

import { useChordEditorStore } from '@/domains/chord/store/chordEditorStore';
import { useChordStore } from '@/domains/chord/store/chordStore';
import { computeChordFingerprint, getChordName } from '@/domains/chord/theory/theory';
import {
  chordFromPortable,
  parseChordFromText,
  parseGroupFromText,
  serializeChordToText,
  serializeGroupToText,
} from '@/domains/chord/transfer/chordTextCodec';
import { GroupSortRule } from '@/domains/chord/types';
import { areBarresEqual } from '@/domains/fretboard/model/coordinates';
import { runBusyAction } from '@/platform/composables/runBusyAction';
import { readTextFromClipboard, writeTextToClipboard } from '@/platform/services/clipboard/clipboard';
import { useUiStore } from '@/platform/store/uiStore';
import { ROUTE_PATHS } from '@/platform/utils/constants';
import { buildShareUrl, encodeShareToken, resolveTransferPayload } from '@/platform/utils/transfer';

import type { PortableChord, PortableGroup, TextParseReason } from '@/domains/chord/transfer/chordTextCodec';
import type { Chord, Group } from '@/domains/chord/types';

/** 分享链接落地的和弦收容分组名（PortableChord 不含 groupId，落地时统一归入此组，同名分组直接复用） */
const SHARED_CHORD_GROUP_NAME = '分享';

/** 从便携和弦载荷构建编辑器草稿：归属分组置空，供用户审阅后保存（乐谱导入链路复用） */
export const buildDraftChordFromPortable = (p: PortableChord): Chord => chordFromPortable(p, '');

/** 解析失败按原因分流提示（和弦/乐谱共用） */
export const pasteErrorMessage = (reason: TextParseReason, target: '和弦' | '乐谱') => {
  const uiStore = useUiStore();
  if (reason === 'UNKNOWN_FORMAT') uiStore.message.warning('无法识别的格式');
  else if (reason === 'WRONG_TYPE') uiStore.message.warning(target === '和弦' ? '请到乐谱页粘贴' : '请到和弦页粘贴');
  else if (reason === 'INVALID_HEADER') uiStore.message.warning('文字格式版本不匹配');
  else if (reason === 'INVALID_NAME') uiStore.message.warning('文字中包含无法解析的和弦名');
  else uiStore.message.warning('文字内容格式不完整');
};

/** 和弦域文字传递能力（复制/粘贴单个和弦） */
export function useChordTransfer() {
  const editorStore = useChordEditorStore();
  const chordStore = useChordStore();
  const uiStore = useUiStore();
  // 剪贴板防重入锁：唯一写方是本模块与乐谱域的动作实现（原先由 TopHeader 外挂 withTransferLock，
  // 卡片/分组菜单绕过它直接调用同一批动作，双击即并发两次剪贴板写）
  const { isCopying } = storeToRefs(uiStore);

  // ---- 载体：复制与分享共用同一份 token（载荷 + 压缩编码），分享只是在 token 外面再包一层地址。
  //      两个入口都不允许自行拼装载荷或自行编码 ----

  /** 单和弦载荷 → FLCHORD 文本（自包含指法数据） */
  const buildChordPayload = (chord: Chord): string => serializeChordToText(chord);

  /** 分组载荷 → FLGROUP 文本（分组元信息 + 组内全部和弦，保序） */
  const buildGroupPayload = (group: Group, chords: Chord[]): string => serializeGroupToText(group, chords);

  /** 单和弦 → 传递载体 token（剪贴板与分享地址共用的唯一载体） */
  const buildChordToken = (chord: Chord): Promise<string> => encodeShareToken(buildChordPayload(chord));

  /** 分组 → 传递载体 token */
  const buildGroupToken = (group: Group, chords: Chord[]): Promise<string> =>
    encodeShareToken(buildGroupPayload(group, chords));

  /** 复制单个和弦到剪贴板（载体：裸 token，可在另一实例粘贴导入） */
  const copyChordText = async (chord: Chord): Promise<void> =>
    void (await runBusyAction({
      busy: isCopying,
      errorFallback: '复制失败',
      successText: '已复制和弦到剪贴板',
      run: async () => writeTextToClipboard(await buildChordToken(chord)),
    }));

  /** 和弦卡片右键「复制」：复用单和弦复制 */
  const copyChordCardText = copyChordText;

  /** 复制整个分组到剪贴板（载体：裸 token，含分组元信息与组内全部和弦） */
  const copyGroupText = async (group: Group): Promise<void> => {
    const chords = chordStore.groupChordMap.get(group.id) ?? [];
    await runBusyAction({
      busy: isCopying,
      errorFallback: '复制失败',
      successText: `已复制分组（${chords.length} 个和弦）到剪贴板`,
      run: async () => writeTextToClipboard(await buildGroupToken(group, chords)),
    });
  };

  /** 工作台粘贴：解析文字载入编辑器草稿（切「新建」态，不静默改写库中既有和弦）；
   *  剪贴板为 FLGROUP 分组文本时改走分组导入（新建分组 + 组内全部和弦） */
  const pasteChordFromClipboard = async (): Promise<void> =>
    void (await runBusyAction({
      busy: isCopying,
      errorFallback: '粘贴失败',
      run: async () => {
        let raw: string;
        try {
          raw = await readTextFromClipboard();
        } catch (err) {
          uiStore.message.error(err instanceof Error ? err.message : '读取剪贴板失败');
          return;
        }
        // 载体归一：分享地址 / 裸 token / 旧版纯文本都收敛成同一份载荷文本，之后一律按纯文本处理
        const resolved = await resolveTransferPayload(raw);
        if (resolved.status === 'empty') {
          uiStore.message.warning('剪贴板为空');
          return;
        }
        if (resolved.status === 'broken') {
          uiStore.message.warning('传递内容已损坏，无法解析');
          return;
        }
        const result = parseChordFromText(resolved.payload);
        if (!result.ok) {
          // 分组文本的魔数不属于和弦分类器，统一落在这里；交给分组解析器分流
          if (result.reason === 'UNKNOWN_FORMAT') {
            await pasteGroupFromClipboard(resolved.payload);
            return;
          }
          pasteErrorMessage(result.reason, '和弦');
          return;
        }
        // 剪贴板粘贴与分享链接共用同一落地实现，只是深度不同（粘贴不落库）
        landPortableChord(result.data, false);
      },
    }));

  /**
   * 便携分组载荷落地：新建分组（保留排序规则与调式主音）并导入组内全部和弦。
   * 与手动创建路径的重名策略对齐：遇到同名分组时追加序号后缀，避免产生同名歧义。
   * 不含提示，供「剪贴板粘贴」与「分享链接」两条入口共用。
   */
  const applyPortableGroup = (payload: PortableGroup): { name: string; chords: number } => {
    const { name, sortRule, sortKey, chords } = payload;
    let finalName = name;
    let suffix = 2;
    while (chordStore.groups.some(g => g.name === finalName)) finalName = `${name} (${suffix++})`;

    const group = chordStore.addGroup(finalName, sortRule);
    if (sortRule === GroupSortRule.KEY_DEGREE && sortKey) chordStore.updateGroupSort(group.id, sortRule, sortKey);
    for (const p of chords) chordStore.addChord(chordFromPortable(p, group.id));

    // 批量写入属关键动作：立即同步落盘，避免整批数据停在 400ms 防抖窗口内被刷新吃掉
    if (chords.length > 0) void chordStore.persistAll();
    return { name: finalName, chords: chords.length };
  };

  /** 分组导入统一入口（剪贴板粘贴与分享链接共用）：落地并提示 */
  const importSharedGroup = (p: PortableGroup): void => {
    const { name, chords } = applyPortableGroup(p);
    uiStore.message.success(`已导入分组「${name}」（${chords} 个和弦）`);
  };

  /** 工作台粘贴分组：FLGROUP 文本 → 新建分组（保留排序规则与调式主音）并导入组内全部和弦 */
  const pasteGroupFromClipboard = async (text: string): Promise<void> => {
    const result = parseGroupFromText(text);
    if (!result.ok) {
      pasteErrorMessage(result.reason, '和弦');
      return;
    }
    importSharedGroup(result.data);
  };

  /**
   * 便携和弦载荷落地（剪贴板粘贴与分享链接共用同一实现）。
   * 两条入口只有「落地深度」一处差异，故做成显式参数而非两份代码，避免日后各自漂移：
   * - persist=false（剪贴板粘贴）：仅载入编辑器草稿，不静默改写库——库里是用户自己的资产，粘贴只是取用；
   * - persist=true（打开分享链接）：同指纹（同名 + 同调弦 + 同指法）已在库中则直接复用，否则新建并归入
   *   「分享」分组（同名分组复用，不重复建组），并选中展开 + 同步落盘——打开分享链接是明确的
   *   「收下这个和弦」意图，让它直接出现在库里比多一步手动保存更符合预期。
   */
  const landPortableChord = (p: PortableChord, persist: boolean): void => {
    if (!persist) {
      editorStore.setEditor(buildDraftChordFromPortable(p));
      editorStore.saveAsNewChord();
      uiStore.message.success(`已加载和弦`);
      return;
    }

    const draft = buildDraftChordFromPortable(p);
    // N4：判等必须含横按——computeChordFingerprint 不含 barres，而 chordTextCodec 写侧
    // 明确携带 BARRES:；漏比会把「同指法不同横按」误判为已存在，分享导入后横按静默丢失
    const sameBarres = (c: Chord): boolean => areBarresEqual(c.barres, draft.barres);
    const existing = chordStore.savedChordsList.find(
      c =>
        getChordName(c) === p.name &&
        c.tuning === p.tuning &&
        computeChordFingerprint(c) === computeChordFingerprint(draft) &&
        sameBarres(c)
    );
    if (existing) {
      chordStore.selectAndExpandGroup(existing.groupId);
      editorStore.setEditor(existing);
      uiStore.message.success(`已载入分享的和弦「${getChordName(existing)}」`);
      return;
    }

    const group =
      chordStore.groups.find(g => g.name === SHARED_CHORD_GROUP_NAME) ?? chordStore.addGroup(SHARED_CHORD_GROUP_NAME);
    const chord = chordFromPortable(p, group.id);
    chordStore.addChord(chord);
    void chordStore.persistAll();
    chordStore.selectAndExpandGroup(group.id);
    editorStore.setEditor(chord);
    uiStore.message.success(`已从分享链接导入和弦「${getChordName(chord)}」`);
  };

  /** 分享链接消费入口（shareLinkBridge 专用）：落库 + 选中展开 */
  const importSharedChord = (p: PortableChord): void => landPortableChord(p, true);

  /** 生成并复制和弦分享链接（token 外面包一层地址，链接打开后自动导入该和弦） */
  const shareChordLink = async (chord: Chord): Promise<void> =>
    void (await runBusyAction({
      busy: isCopying,
      errorFallback: '生成分享链接失败',
      successText: `已复制和弦「${getChordName(chord)}」的分享链接`,
      run: async () => writeTextToClipboard(buildShareUrl(ROUTE_PATHS.WORKBENCH, await buildChordToken(chord))),
    }));

  /** 生成并复制分组分享链接（token 外面包一层地址，链接打开后自动导入该分组及其全部和弦） */
  const shareGroupLink = async (group: Group): Promise<void> => {
    const chords = chordStore.groupChordMap.get(group.id) ?? [];
    await runBusyAction({
      busy: isCopying,
      errorFallback: '生成分享链接失败',
      successText: `已复制分组「${group.name}」的分享链接`,
      run: async () => writeTextToClipboard(buildShareUrl(ROUTE_PATHS.WORKBENCH, await buildGroupToken(group, chords))),
    });
  };

  return {
    copyChordText,
    copyChordCardText,
    copyGroupText,
    pasteChordFromClipboard,
    shareChordLink,
    shareGroupLink,
    importSharedChord,
    importSharedGroup,
  };
}
