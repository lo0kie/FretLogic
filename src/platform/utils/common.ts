import { isProxy, isRef, toRaw, unref } from 'vue';

// ===== id: 唯一 id 生成 =====

/** 生成带可选前缀的短随机 id：优先 crypto.randomUUID，不支持时回退随机串 + 时间戳。 */
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
    // 注意：JSON 方法会丢失 Date/RegExp/循环引用，但你的数据不包含这些，完全够用；
    // Map（chordMap）必须转普通对象，否则会静默变成 {}
    return JSON.parse(JSON.stringify(raw, (_key, val) => (val instanceof Map ? Object.fromEntries(val) : val))) as T;
  }
}

/**
 * 持久化/备份/同步专用 JSON 序列化：把嵌套的 Map（如 Song.chordMap）转为普通对象。
 * 直接 JSON.stringify(Map) 会得到 {}，造成静默数据丢失。
 */
export const serializeForStorage = (value: unknown): string =>
  JSON.stringify(value, (_key, val) => (val instanceof Map ? Object.fromEntries(val) : val));

/** 克隆琴弦模型：剥响应式代理后逐弦复制 [品位, 升降偏好] 元组，得到纯净的可写副本。 */
export function cloneGuitarStrings<T extends [number, boolean][]>(strings: T): T {
  const raw = toRaw(strings);
  return raw.map(s => [s[0], s[1]]) as unknown as T;
}

// ===== stringDistance: 编辑距离 =====

/** 计算 Levenshtein 编辑距离；用滚动单行数组实现，空间 O(短串长度)。 */
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

// ===== observeVisibility: 共享可见性观察 =====

/**
 * 共享 IntersectionObserver：同一 root 下的大量元素（谱面字符槽、选择器卡片等）
 * 复用同一个 observer 实例，避免每个元素各建一个 observer 的开销。
 * 按 root 元素维度复用；root 传 null 表示使用视口。
 */
type VisibilityCallback = (visible: boolean) => void;

const observersByRoot = new Map<Element | null, IntersectionObserver>();
const elementCallbacks = new WeakMap<Element, VisibilityCallback>();

/** 取（或创建）绑定到指定 root 的共享 IntersectionObserver 实例。 */
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

// ===== clamp / 时间戳 =====

/** 数值夹取：把 value 限制在 [min, max] 区间内 */
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * 本地时间戳 → 文件名安全串（如 2026-09-03_10-05-33）。
 * 用 getTimezoneOffset 换算为本地时间再格式化，避免 toISOString 的 UTC 偏差；
 * 并剔除冒号等文件名非法字符，供备份等导出文件命名使用。
 */
export const formatLocalTimestampForFile = (date: Date = new Date()): string => {
  const tzOffset = date.getTimezoneOffset() * 60000;
  const localISOTime = new Date(date.getTime() - tzOffset).toISOString().slice(0, -1);
  return localISOTime.replace(/T/, '_').replace(/:/g, '-').split('.')[0] ?? '';
};
