import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 预览缓存的核心不变量是**页 URL 的所有权**：一批页 URL 只能有一个主人，多一个就是泄漏，
 * 少一个就是破图。逐页化之后所有权全归缓存条目，于是「谁在什么时刻回收它」成了最容易改错的地方
 * —— 本文件盯的就是这几条：
 * 1. 写入被拒（条目已是死物）时必须**就地回收**这一页，不能让它悬着；
 * 2. 淘汰到正在屏上展示的那一条时**不即刻回收**（否则当场破图），改由 setCurrentRender 换值时补收；
 * 3. 清空缓存同理：展示项的 URL 也是经 setCurrentRender(null) 才收回的。
 *
 * URL.createObjectURL / revokeObjectURL 在 jsdom 里没有实现，此处换成可观测的桩：URL 本身是
 * 自增字符串，回收记进 revoked 数组 —— 断言「撤了哪些」正是本文件的主题。
 */
let revoked: string[] = [];

beforeEach(() => {
  revoked = [];
  let seq = 0;
  Object.assign(URL, {
    createObjectURL: () => `blob:test/${++seq}`,
    revokeObjectURL: (url: string) => revoked.push(url),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** 每个用例都重新加载模块：缓存、活条目表、展示项都是模块级状态，跨用例会串味 */
const loadModule = async () => {
  vi.resetModules();
  return import('@/domains/score/preview/scorePreviewCache');
};

/** 造一页：blob 是真的（字节数决定配额口径），URL 走上面的桩 */
const makePage = (bytes: number) => {
  const blob = new Blob([new Uint8Array(bytes)]);
  return { url: URL.createObjectURL(blob), blob };
};

describe('预览渲染页缓存', () => {
  it('逐页写入：洞是合法状态，取值器与完整判据如实反映在位页', async () => {
    const { ensureEntry, writePage, inPlaceIndexes, isComplete, pageBlob, pageUrl, entryBytes } = await loadModule();

    const entry = ensureEntry('k', 'song', 3, [[0], [1], [2]], 'a4', 40, '', []);
    expect(entry.total).toBe(3);
    expect(inPlaceIndexes(entry)).toEqual([]);
    expect(isComplete(entry)).toBe(false);
    expect(pageBlob(entry, 0)).toBeUndefined();
    expect(entryBytes(entry)).toBe(0);

    writePage(entry, 0, makePage(10));
    writePage(entry, 2, makePage(30));

    // 第 1 页是洞：页序如实为 [0, 2]，而不是被压缩成 [0, 1]
    expect(inPlaceIndexes(entry)).toEqual([0, 2]);
    expect(isComplete(entry)).toBe(false);
    expect(pageBlob(entry, 1)).toBeUndefined();
    expect(pageBlob(entry, 2)?.size).toBe(30);
    expect(pageUrl(entry, 0)).toBe('blob:test/1');
    // 占用随写入增长（配额口径）：写一格就要重新称重，否则配额越算越少
    expect(entryBytes(entry)).toBe(40);
  });

  it.each([
    {
      label: '页图通道：写入已作废的条目被拒，并就地回收这一页的 URL（不再把死条目复活入账）',
      channel: 'page',
    },
    {
      label: '页脚合成层通道：写入被拒时同样就地回收这一批 URL（不再把死条目复活入账）',
      channel: 'footer',
    },
  ] as const)('$label', async ({ channel }) => {
    const {
      ensureEntry,
      writePage,
      writeFooterPages,
      dropEntry,
      getCachedRender,
      inPlaceIndexes,
      entryBytes,
      footerBytes,
      pageBlob,
    } = await loadModule();

    const entry = ensureEntry('k', 'song', 1, [[0]], 'a4', 40, '', []);
    dropEntry('k');

    const late = makePage(channel === 'footer' ? 4 : 10);
    if (channel === 'footer') writeFooterPages(entry, [late]);
    else writePage(entry, 0, late);

    // 就地回收：不是「标记待回收」而是当场撤 —— 这一页已没有主人，悬着就是泄漏
    expect(revoked).toEqual([late.url]);
    // 被拒的那一格没入账（否则死条目就被复活了）
    expect(inPlaceIndexes(entry)).toEqual([]);
    expect(getCachedRender('k')).toBeNull();

    // 页脚字节计入占用是**另一条契约**，只能在可写的条目上验（被拒的那条已经无账可记）：
    // 合成层是同一批页面的第二份 JPEG，不计就等于把最坏情况按一半报给配额。
    // （合成层随条目离场一并回收由下面「被驱逐但仍展示」那条用例的 dropEntry 断言兜住）
    if (channel === 'footer') {
      const writable = ensureEntry('k2', 'song2', 1, [[0]], 'a4', 40, '', []);
      writePage(writable, 0, makePage(10));
      writeFooterPages(writable, [makePage(4)]);

      expect(footerBytes(writable)).toBe(4);
      expect(entryBytes(writable)).toBe(14);
      expect(pageBlob(writable, 0)?.size).toBe(10);
    }
  });

  it('关掉页脚：只丢非展示项的合成层（URL 当场收回、占用退回页图那一份），展示项留着供零成本切回', async () => {
    const { ensureEntry, writePage, writeFooterPages, setCurrentRender, dropIdleFooterPages, entryBytes } =
      await loadModule();

    const shown = ensureEntry('k0', 'song0', 1, [[0]], 'a4', 40, '', []);
    writePage(shown, 0, makePage(10));
    const shownFooter = makePage(4);
    writeFooterPages(shown, [shownFooter]);
    setCurrentRender(shown);

    const other = ensureEntry('k1', 'song1', 1, [[0]], 'a4', 40, '', []);
    writePage(other, 0, makePage(10));
    const otherFooter = makePage(6);
    writeFooterPages(other, [otherFooter]);
    expect(entryBytes(other)).toBe(16);

    dropIdleFooterPages();

    // 非展示项：合成层丢掉、URL 当场收回，占用退回页图那一份 —— 那批字节不再计入重量，
    // 否则开过页脚的条目重量近乎翻倍，等于把别的歌挤出去
    expect(other.footerPages).toBeUndefined();
    expect(revoked).toContain(otherFooter.url);
    expect(entryBytes(other)).toBe(10);
    // 展示项：留着（开关再打开就是零成本切回，这是该取舍的另一半）
    expect(entryBytes(shown)).toBe(14);
    expect(revoked).not.toContain(shownFooter.url);
  });

  it('淘汰到正在展示的条目：不即刻回收，换值那一刻由 setCurrentRender 补收', async () => {
    const { CACHE_MAX, ensureEntry, writePage, setCurrentRender, getCachedRender } = await loadModule();

    const shown = ensureEntry('k0', 'song0', 1, [[0]], 'a4', 40, '', []);
    const page = makePage(10);
    writePage(shown, 0, page);
    setCurrentRender(shown);

    // 灌满缓存把 k0 挤出去（条数上限从模块里取，不写死；各条用不同 songId，避开「每首最多 3 个版本」那条子上限）
    for (let i = 1; i <= CACHE_MAX; i++) ensureEntry(`k${i}`, `song${i}`, 1, [[0]], 'a4', 40, '', []);

    expect(getCachedRender('k0')).toBeNull();
    // 屏上还在引用它 —— 这一刻撤了就是当场破图
    expect(revoked).not.toContain(page.url);

    setCurrentRender(null);
    expect(revoked).toContain(page.url);
  });

  it('writePage 覆盖在位页：旧页当场回收，条目改指新页', async () => {
    const { ensureEntry, writePage, inPlaceIndexes, pageUrl } = await loadModule();

    const entry = ensureEntry('k', 'song', 1, [[0]], 'a4', 40, '', []);
    const first = makePage(10);
    writePage(entry, 0, first);
    expect(pageUrl(entry, 0)).toBe(first.url);

    // 覆盖同一格：旧页从此无人引用，必须**当场**回收 —— 驱逐是按**当前**数组走一遍，
    // 被换掉的那个已不在数组里，再没有任何回收时机。此前这条路径没有任何用例
    //（既有的「就地回收」用例走的是「条目已丢弃」那条分支），源码里那行 revoke 删掉也全绿。
    const second = makePage(20);
    writePage(entry, 0, second);
    expect(revoked).toEqual([first.url]);
    expect(pageUrl(entry, 0)).toBe(second.url);
    expect(inPlaceIndexes(entry)).toEqual([0]);
    expect(revoked).not.toContain(second.url);
  });

  it('同一内容键已归新对象所有：旧条目的写入被拒，活条目不被挤掉', async () => {
    const { ensureEntry, writePage, setCurrentRender, getCachedRender, inPlaceIndexes } = await loadModule();

    const old = ensureEntry('k', 'song', 1, [[0]], 'a4', 40, '', []);
    const oldPage = makePage(10);
    writePage(old, 0, oldPage);
    setCurrentRender(old);

    // 灌满缓存把它挤出去：它仍在屏上展示，故这一刻只标记「待回收」
    for (let i = 1; i <= 48; i++) ensureEntry(`k${i}`, `song${i}`, 1, [[0]], 'a4', 40, '', []);
    expect(getCachedRender('k')).toBeNull();

    // 同一内容键重建条目 —— 此键自此归新对象所有
    const fresh = ensureEntry('k', 'song', 1, [[0]], 'a4', 40, '', []);
    expect(fresh).not.toBe(old);

    const late = makePage(10);
    writePage(old, 0, late);

    expect(revoked).toContain(late.url);
    expect(getCachedRender('k')).toBe(fresh);
    expect(inPlaceIndexes(fresh)).toEqual([]);
    // 旧条目仍在屏上：它的页 URL 依旧不能撤
    expect(revoked).not.toContain(oldPage.url);
  });

  it('被驱逐但仍展示的条目重新入账后不再算孤儿：换展示项不得撤掉它仍在缓存里的页 URL', async () => {
    const { ensureEntry, writePage, writeFooterPages, setCurrentRender, getCachedRender, isComplete, dropEntry } =
      await loadModule();

    const shown = ensureEntry('k0', 'song0', 1, [[0]], 'a4', 40, '', []);
    const page = makePage(10);
    writePage(shown, 0, page);
    setCurrentRender(shown);

    // 灌满缓存把 k0 挤出去：仍在屏上展示，故这一刻只标记「待回收」
    for (let i = 1; i <= 48; i++) ensureEntry(`k${i}`, `song${i}`, 1, [[0]], 'a4', 40, '', []);
    expect(getCachedRender('k0')).toBeNull();
    expect(revoked).not.toContain(page.url);

    // 它随后又有一条页脚合成层写回来 —— touchEntry 的 else 分支把它重新登记入账
    const footer = makePage(4);
    writeFooterPages(shown, [footer]);
    expect(getCachedRender('k0')).toBe(shown);

    // 换展示项：它此刻在账上、内容完整，URL 一旦撤掉，下次命中就会照 isComplete 为真铺出一屏死链
    setCurrentRender(null);
    expect(revoked).not.toContain(page.url);
    expect(isComplete(shown)).toBe(true);

    // 摘标记不等于放弃回收：它真正离场（不在屏上）时照旧整条回收，不能因此漏一个 URL
    dropEntry('k0');
    expect(revoked).toContain(page.url);
    expect(revoked).toContain(footer.url);
  });

  it('清空缓存：页 URL 全部回收，展示项经 setCurrentRender(null) 一并收回', async () => {
    const { ensureEntry, writePage, setCurrentRender, clearPreviewCache, currentRenderData, getCachedRender } =
      await loadModule();

    const shown = ensureEntry('k0', 'song0', 1, [[0]], 'a4', 40, '', []);
    const page = makePage(10);
    writePage(shown, 0, page);
    setCurrentRender(shown);

    const other = ensureEntry('k1', 'song1', 1, [[0]], 'a4', 40, '', []);
    const otherPage = makePage(10);
    writePage(other, 0, otherPage);

    clearPreviewCache();

    expect(currentRenderData.value).toBeNull();
    expect(getCachedRender('k0')).toBeNull();
    expect(getCachedRender('k1')).toBeNull();
    expect(revoked).toContain(page.url);
    expect(revoked).toContain(otherPage.url);
  });

  it('编辑歌词后按页继承：只有内容变了的行所在页重画，其余页连同 URL 一起转给新条目', async () => {
    const {
      ensureEntry,
      writePage,
      writeFooterPages,
      findInheritSource,
      inheritableIndexes,
      movePages,
      inPlaceIndexes,
      pageUrl,
    } = await loadModule();

    // 上一版：3 页、每页一行，行指纹 a / b / c
    const prev = ensureEntry('v1', 'song', 3, [[0], [1], [2]], 'a4', 40, 'page-level', ['a', 'b', 'c']);
    writePage(prev, 0, makePage(10));
    writePage(prev, 1, makePage(10));
    writePage(prev, 2, makePage(10));
    writeFooterPages(prev, [makePage(4)]);

    // 新版只有第 1 行改了（b → B）
    const source = findInheritSource('song', 'v2', 'page-level', ['a', 'B', 'c']);
    expect(source?.entry).toBe(prev);
    expect(source?.dirtyLines).toEqual([1]);
    // 第 1 行所在的那一页必须重画，第 0 / 2 页可以继承
    expect(inheritableIndexes(prev, source!.dirtyLines)).toEqual([0, 2]);

    const next = ensureEntry('v2', 'song', 3, [[0], [1], [2]], 'a4', 40, 'page-level', ['a', 'B', 'c']);
    // 转移前先把两个源页 URL 取下来：转移后 prev 那两格就空了，只能靠引用比对，
    // 不能写死桩的自增串（桩的序号一改就静默失准）
    const inherited0 = pageUrl(prev, 0);
    const inherited2 = pageUrl(prev, 2);
    movePages(next, prev, [0, 2]);

    // 页 URL 是**转移**而非复制：两个条目各持其半，谁的格子里都不再指向对方的页
    expect(inPlaceIndexes(next)).toEqual([0, 2]);
    expect(inPlaceIndexes(prev)).toEqual([1]);
    expect(pageUrl(next, 0)).toBe(inherited0);
    expect(pageUrl(next, 2)).toBe(inherited2);
    // 页脚合成层随页一并转移，来源条目那几格清空（同一批 URL 不能有两个主人）
    expect(next.footerPages?.[0]?.blob.size).toBe(4);
    expect(prev.footerPages?.[0]).toBeUndefined();
    // 转移不该回收任何 URL —— 撤了就是屏上当场破图
    expect(revoked).toEqual([]);
  });

  // 三条否决输入各对应 findInheritSource 里一个独立的 return null 分支，结论一律是「找不到来源」
  it.each([
    {
      label: '页级段不同：标题 / 设置这类整页共有的输入变了，一页都不能信 ⇒ 一律找不到来源',
      songId: 'song',
      pageLevelKey: 'other-level',
      lineFingerprints: ['b'],
    },
    {
      label: '行指纹一行都没变：键是因 version / 和弦库这类非行级维度变的，无法证明页级内容真的没动 ⇒ 一律找不到来源',
      songId: 'song',
      pageLevelKey: 'page-level',
      lineFingerprints: ['a'],
    },
    {
      label: '不是同一首歌：别的歌的版本不作数 ⇒ 一律找不到来源',
      songId: 'other-song',
      pageLevelKey: 'page-level',
      lineFingerprints: ['b'],
    },
  ])('按页继承的否决条件：$label', async ({ songId, pageLevelKey, lineFingerprints }) => {
    const { ensureEntry, writePage, findInheritSource } = await loadModule();

    const prev = ensureEntry('v1', 'song', 1, [[0]], 'a4', 40, 'page-level', ['a']);
    writePage(prev, 0, makePage(10));

    expect(findInheritSource(songId, 'v2', pageLevelKey, lineFingerprints)).toBeNull();
  });

  it('末尾追加一行：只有多出来的那一行算脏，前面的页照样继承', async () => {
    const { ensureEntry, writePage, findInheritSource, inheritableIndexes } = await loadModule();

    const prev = ensureEntry('v1', 'song', 2, [[0], [1]], 'a4', 40, 'page-level', ['a', 'b']);
    writePage(prev, 0, makePage(10));
    writePage(prev, 1, makePage(10));
    const source = findInheritSource('song', 'v2', 'page-level', ['a', 'b', 'c']);

    expect(source?.dirtyLines).toEqual([2]);
    // 第 2 行落在新版才有的第 3 页上，前两页一个字没动
    expect(inheritableIndexes(prev, source!.dirtyLines)).toEqual([0, 1]);
  });

  it('多版命中取脏行最少的那一版（血缘最近，能继承的页最多）', async () => {
    const { ensureEntry, findInheritSource } = await loadModule();

    ensureEntry('far', 'song', 1, [[0]], 'a4', 40, 'page-level', ['a', 'b', 'c']);
    ensureEntry('near', 'song', 1, [[0]], 'a4', 40, 'page-level', ['a', 'B', 'c']);

    // 与 near 只差第 2 行、与 far 差第 1 与第 2 行 ⇒ 取 near
    const source = findInheritSource('song', 'v3', 'page-level', ['a', 'B', 'C']);
    expect(source?.entry.key).toBe('near');
    expect(source?.dirtyLines).toEqual([2]);
  });

  it('来源条目里是洞的页继承不了（没有图可搬）', async () => {
    const { ensureEntry, writePage, inheritableIndexes } = await loadModule();

    const prev = ensureEntry('v1', 'song', 3, [[0], [1], [2]], 'a4', 40, 'page-level', ['a', 'b', 'c']);
    writePage(prev, 0, makePage(10));

    expect(inheritableIndexes(prev, [2])).toEqual([0]);
  });
});
