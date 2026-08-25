import type { GuitarStringsModel } from '@/types';
import { isProxy, isRef, toRaw, unref } from 'vue';

// ===== id: 唯一 id 生成 =====

export const generateUUID = (prefix: string = '', length = 8): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return (prefix ? `${prefix}_` : '') + crypto.randomUUID().slice(0, length);
  }

  const randomStr = Math.random()
    .toString(36)
    .substring(2, 2 + length);
  const timeStr = Date.now().toString(36).slice(-4);
  return (prefix ? `${prefix}_` : '') + (randomStr + timeStr).slice(0, length);
};

// ===== cloneDeep: 深拷贝 =====

/**
 * 健壮的深拷贝：
 * 1. 剥离 Vue 响应式代理（reactive/readonly）
 * 2. 如果遇到 Ref，自动解包（防御性）
 * 3. 优先使用 structuredClone，不支持的浏览器回退 JSON
 */
export function cloneDeep<T>(value: T): T {
  // 1. 原始类型
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // 2. 强制剥离所有层的 Vue 代理（reactive/readonly）
  let raw: unknown = isProxy(value) ? toRaw(value) : value;

  // 3. 防御：如果脱壳后是 Ref，解包成原始值（虽然你代码里没有，但加上没坏处）
  if (isRef(raw)) {
    raw = unref(raw);
    // 解包后可能又是对象，递归一次以确保完全清干净
    return cloneDeep(raw as T);
  }

  // 4. 使用浏览器原生结构化克隆（最快，支持循环引用/Date/RegExp/Map/Set）
  try {
    return structuredClone(raw) as T;
  } catch {
    // 5. 兜底：极少数旧浏览器或遇到不可克隆类型（如 Symbol）
    // 注意：JSON 方法会丢失 Date/RegExp/循环引用，但你的数据不包含这些，完全够用
    return JSON.parse(JSON.stringify(raw)) as T;
  }
}

export function cloneGuitarStrings(strings: GuitarStringsModel): GuitarStringsModel {
  const raw = toRaw(strings);
  return [
    [raw[0][0], raw[0][1]],
    [raw[1][0], raw[1][1]],
    [raw[2][0], raw[2][1]],
    [raw[3][0], raw[3][1]],
    [raw[4][0], raw[4][1]],
    [raw[5][0], raw[5][1]],
  ];
}

// ===== stringDistance: 编辑距离 =====

export const getEditDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // 让较短的字符串对应数组宽度，这样空间占用取两者中较小的一个
  if (a.length < b.length) {
    [a, b] = [b, a];
  }

  const prevRow = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prevRow[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let diag = prevRow[0]; // 相当于原来 matrix[i-1][0]
    prevRow[0] = i; // 变成当前行的 matrix[i][0]

    for (let j = 1; j <= b.length; j++) {
      const temp = prevRow[j]; // 先存住 matrix[i-1][j]，等下要被覆盖
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prevRow[j] = Math.min(
        temp + 1, // matrix[i-1][j] + 1（上方）
        prevRow[j - 1] + 1, // matrix[i][j-1] + 1（左方，这一步已经是本行算好的新值）
        diag + cost // matrix[i-1][j-1] + cost（左上方）
      );
      diag = temp; // 下一轮循环里，diag 要变成这一轮的 temp
    }
  }

  return prevRow[b.length];
};

// ===== lineIdMatcher: 行 id 稳定匹配 =====

const SIMILARITY_THRESHOLD = 0.45;
// 未匹配行数超过该值时（整段替换/大粘贴），逐对编辑距离的成本失控，直接分配新 id
const MAX_SIMILAR_MATCH_LINES = 60;
const createLineId = (): string => 'l_' + generateUUID('', 8);

const matchExactLines = (
  oldLines: string[],
  newLines: string[],
  oldIds: string[]
): { newIds: (string | null)[]; usedOldIndices: Set<number> } => {
  const newIds: Array<string | null> = new Array(newLines.length).fill(null);
  const usedOldIndices = new Set<number>();

  // 1. 按内容分组，记录每种内容对应的旧行下标（保持原有升序）
  const contentToIndices = new Map<string, number[]>();
  for (let j = 0; j < oldLines.length; j++) {
    const line = oldLines[j] ?? '';
    const list = contentToIndices.get(line);
    if (list) list.push(j);
    else contentToIndices.set(line, [j]);
  }

  // 2. 每种内容各自维护一个"消费到第几个了"的游标
  const cursors = new Map<string, number>();

  for (let i = 0; i < newLines.length; i++) {
    const content = newLines[i] ?? '';
    const indices = contentToIndices.get(content);
    if (!indices) continue; // 旧行里压根没有这个内容，跳过

    const cursor = cursors.get(content) ?? 0;
    if (cursor < indices.length) {
      const j = indices[cursor]!;
      const oldId = oldIds[j];
      if (oldId !== undefined) {
        newIds[i] = oldId;
        usedOldIndices.add(j);
        cursors.set(content, cursor + 1);
      }
    }
  }

  return { newIds, usedOldIndices };
};

const matchSimilarLines = (
  oldLines: string[],
  newLines: string[],
  oldIds: string[],
  newIds: (string | null)[],
  usedOldIndices: Set<number>
): void => {
  for (let i = 0; i < newLines.length; i++) {
    if (newIds[i] !== null) continue;

    const newLen = newLines[i]?.length ?? 0;
    let bestMatchIdx = -1;
    let minDistance = Infinity;

    for (let j = 0; j < oldLines.length; j++) {
      if (usedOldIndices.has(j)) continue;

      const oldLine = oldLines[j] ?? '';
      const newLine = newLines[i] ?? '';
      const oldLen = oldLine.length;
      const maxLength = Math.max(oldLen, newLen) || 1;

      // 不用真的去算这一对昂贵的编辑距离
      const lengthDiff = Math.abs(oldLen - newLen);
      const maxPossibleSimilarity = 1 - lengthDiff / maxLength;
      if (maxPossibleSimilarity < SIMILARITY_THRESHOLD) continue;

      const dist = getEditDistance(oldLine, newLine);
      const similarity = 1 - dist / maxLength;

      if (similarity >= SIMILARITY_THRESHOLD && dist < minDistance) {
        minDistance = dist;
        bestMatchIdx = j;
        if (dist === 0) break; // 已经是最好情况，不会有更小的距离了，提前退出内层循环
      }
    }

    if (bestMatchIdx !== -1) {
      const oldId = oldIds[bestMatchIdx];
      if (oldId !== undefined) {
        newIds[i] = oldId;
        usedOldIndices.add(bestMatchIdx);
      }
    }
  }
};

const assignNewIds = (newIds: (string | null)[]): string[] => {
  return newIds.map(id => id || createLineId());
};

export const matchLineIds = (oldLines: string[], newLines: string[], oldLineIds: string[]): string[] => {
  const { newIds, usedOldIndices } = matchExactLines(oldLines, newLines, oldLineIds);
  const unmatchedCount = newIds.reduce((count, id) => (id === null ? count + 1 : count), 0);
  if (unmatchedCount <= MAX_SIMILAR_MATCH_LINES) {
    matchSimilarLines(oldLines, newLines, oldLineIds, newIds, usedOldIndices);
  }
  return assignNewIds(newIds);
};

// ===== sanitizeLyricsText: 歌词文本清洗 =====

export const sanitizeLyricsText = (lyrics: string): string => {
  return lyrics
    .split('\n')
    .map(line =>
      line
        .replace(/[\t\r]+/g, '')
        .replace(/\u3000/g, ' ')
        .trim()
    )
    .join('\n');
};

// ===== observeVisibility: 共享可见性观察 =====

/**
 * 共享 IntersectionObserver：同一 root 下的大量元素（谱面字符槽、选择器卡片等）
 * 复用同一个 observer 实例，避免每个元素各建一个 observer 的开销。
 * 按 root 元素维度复用；root 传 null 表示使用视口。
 */
type VisibilityCallback = (visible: boolean) => void;

const observersByRoot = new Map<Element | null, IntersectionObserver>();
const elementCallbacks = new WeakMap<Element, VisibilityCallback>();

const getObserverForRoot = (root: Element | null): IntersectionObserver => {
  let observer = observersByRoot.get(root);
  if (!observer) {
    observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          elementCallbacks.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { root }
    );
    observersByRoot.set(root, observer);
  }
  return observer;
};

/**
 * 观察元素可见性，返回停止观察的清理函数。
 * 回调可能被多次调用（滚动进出视口），调用方自行决定何时 stop。
 */
export function observeVisibility(el: Element, cb: VisibilityCallback, root?: Element | null): () => void {
  const observer = getObserverForRoot(root ?? null);
  elementCallbacks.set(el, cb);
  observer.observe(el);
  return () => {
    elementCallbacks.delete(el);
    observer.unobserve(el);
  };
}

// ===== base64: UTF-8 安全的 base64 编解码（替代 js-base64）=====

/**
 * UTF-8 安全的 base64 编码，与原 js-base64 的 `Base64.encode` 行为一致。
 * 分块处理，避免超长字符串在展开为参数时超出调用栈限制。
 */
export const base64EncodeUtf8 = (str: string): string => {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

/** UTF-8 安全的 base64 解码，与原 js-base64 的 `Base64.decode` 行为一致。 */
export const base64DecodeUtf8 = (b64: string): string => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};
