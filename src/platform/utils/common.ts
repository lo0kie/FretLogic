import { isProxy, isRef, toRaw, unref } from 'vue';

// ===== id: 唯一 id 生成 =====

/** 生成带可选前缀的短随机 id：优先 crypto.randomUUID，不支持时回退随机串 + 时间戳。 */
export const generateUUID = (prefix: string = '', length = 8): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return (prefix ? `${prefix}_` : '') + crypto.randomUUID().slice(0, length);

  // 时间戳必须真的进入结果：此前写作 (randomStr + timeStr).slice(0, length)，而 randomStr 本就有
  // length 位，slice 会把时间戳整段切掉——兜底 id 实际退化成纯随机串，时间维度完全没参与。
  // 改为时间戳在前、随机串补足余位。
  const timeStr = Date.now().toString(36).slice(-4);
  const randomStr = Math.random().toString(36).substring(2);
  return (prefix ? `${prefix}_` : '') + (timeStr + randomStr).slice(0, length);
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
  if (value === null || typeof value !== 'object') return value;

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
 * 深度转 plain：逐层剥离 Vue 响应式代理，产出可被 IDB structuredClone 的普通对象/数组/Map。
 * 与 cloneDeep 的差异：保留 Map/Set 类型（structuredClone 原生支持），且不做 JSON 回退
 * （JSON 会把 Map 变 {}，静默丢数据）。写入 IndexedDB 前必须经此转换——Proxy 无法被克隆。
 */
export function toPlainPersistable<T>(value: T): T {
  // 断言只此一处：实现全程在 unknown 上作业（见 plainClone），对外只承诺「输入 T，产出等价 T」
  return plainClone(value) as T;
}

/**
 * 把外部读来的值当作「宽松记录」读：非对象（null / 原始值）与数组一律给空记录兜底。
 *
 * 用于**数据边界**（备份包、旧格式、JSON 导入）：那里的值只有运行时形状，TS 只看到 `unknown`。
 * 与其在每个字段处 `as unknown as SomeShape`（假装知道形状），不如在这里做一次**带运行时检查**的
 * 收窄，之后按索引签名逐字段读、逐字段 `typeof` 收窄 —— 形状假设只此一处，且它是被检查过的。
 */
export const asRawRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/**
 * `toPlainPersistable` 的实现体：逐层剥离响应式代理，产出普通值。
 *
 * 分两层是为了**把断言收口到一处**：递归的每一层都知道自己产出什么，但那是实现细节，
 * 不值得在每一层都对外声明一次（旧写法每层一个 `as unknown as T`，5 处）；
 * 真正的类型承诺只有公开签名那一条，故只在那一处断言。
 */
function plainClone(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  // 到这里 value 已收窄为 object，toRaw 的泛型据此保形，无需断言
  const raw: object = isProxy(value) ? toRaw(value) : value;
  if (isRef(raw)) return plainClone(unref(raw));
  // 回调显式标返回类型：被展开进 new Map(...) 的表达式不在返回位置上，上下文类型传不进去
  if (raw instanceof Map) return new Map([...raw].map(([k, v]): [unknown, unknown] => [k, plainClone(v)]));
  if (raw instanceof Set) return new Set([...raw].map(v => plainClone(v)));
  if (raw instanceof Date || raw instanceof RegExp) return raw;
  if (Array.isArray(raw)) return raw.map(v => plainClone(v));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = plainClone(v);

  return out;
}

/**
 * 持久化/备份/同步专用 JSON 序列化：把嵌套的 Map（如 Song.chordMap）转为普通对象。
 * 直接 JSON.stringify(Map) 会得到 {}，造成静默数据丢失。
 */
export const serializeForStorage = (value: unknown): string =>
  JSON.stringify(value, (_key, val) => (val instanceof Map ? Object.fromEntries(val) : val));

/** 克隆琴弦模型：剥响应式代理后逐弦复制（兼容对象 {fret,preferFlat} 与旧二维元组），得到纯净的可写副本。 */
export function cloneGuitarStrings<T extends readonly unknown[]>(strings: T): T {
  const raw = toRaw(strings) as readonly unknown[];
  return raw.map(s => {
    if (Array.isArray(s)) return [s[0], s[1]] as [number, boolean];
    const obj = s as { fret?: number; preferFlat?: boolean };
    return { fret: obj.fret, preferFlat: obj.preferFlat };
  }) as unknown as T;
}

// ===== stringDistance: 编辑距离 =====

/** 计算 Levenshtein 编辑距离；用滚动单行数组实现，空间 O(短串长度)。 */
export const getEditDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // 让较短的字符串对应数组宽度，这样空间占用取两者中较小的一个
  if (a.length < b.length) [a, b] = [b, a];

  const prevRow = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prevRow[j] = j;

  for (let i = 1; i <= a.length; i++) {
    let [diag] = prevRow; // 相当于原来 matrix[i-1][0]
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

/** 单个共享 observer 及其专属回调表：回调按 root 维度隔离，同一元素被不同 root 观察时互不覆盖 */
interface SharedVisibilityObserver {
  observer: IntersectionObserver;
  callbacks: WeakMap<Element, VisibilityCallback>;
}

const sharedObservers = new Map<Element | null, SharedVisibilityObserver>();

/** 取（或创建）绑定到指定 root 的共享 IntersectionObserver 实例及其回调表。 */
const getObserverForRoot = (root: Element | null): SharedVisibilityObserver => {
  let shared = sharedObservers.get(root);
  if (!shared) {
    const callbacks = new WeakMap<Element, VisibilityCallback>();
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) callbacks.get(entry.target)?.(entry.isIntersecting);
      },
      { root }
    );
    shared = { observer, callbacks };
    sharedObservers.set(root, shared);
  }
  return shared;
};

/**
 * 观察元素可见性，返回停止观察的清理函数。
 * 回调可能被多次调用（滚动进出视口），调用方自行决定何时 stop。
 * 同一元素可被不同 root 各自观察，回调互不干扰；同一元素在同一 root 下重复观察以最后一次为准。
 */
export function observeVisibility(el: Element, cb: VisibilityCallback, root?: Element | null): () => void {
  const shared = getObserverForRoot(root ?? null);
  shared.callbacks.set(el, cb);
  shared.observer.observe(el);
  return () => {
    shared.callbacks.delete(el);
    shared.observer.unobserve(el);
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
  for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));

  return btoa(binary);
};

/** UTF-8 安全的 base64 解码，与原 js-base64 的 `Base64.decode` 行为一致。 */
export const base64DecodeUtf8 = (b64: string): string => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
};

// ===== wait: 宏任务延时 =====

/**
 * 延时工具（默认 0ms）：Promise 化的 setTimeout。
 *
 * 与 nextTick 的分工：nextTick 让出的是微任务队列（等 Vue 的 flush 队列结算完），本函数让出的
 * 是「宏任务」边界 —— 事件循环会把微任务队列排空到不再产生新微任务之后才执行它，因此可以用来
 * 等待一串自延迟的响应式级联彻底跑完（见 useScoreHistory 的撤销结算窗口）。
 * 注意它并不等于「等一帧渲染」，后者用 requestAnimationFrame。
 */
export const wait = (ms = 0): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// ===== clamp / 时间戳 =====

/** 数值夹取：把 value 限制在 [min, max] 区间内 */
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

// ===== formatBytes: 字节数 → 人类可读尺寸 =====
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;

  const unitIdx = Math.min(Math.floor(Math.log2(bytes) / 10), UNITS.length - 1);
  const value = bytes / 1024 ** unitIdx;

  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${UNITS[unitIdx]}`;
};

// ===== estimateValueBytes: JS 值内存占用粗估（开发面板用） =====
/** 估算深度上限：足够覆盖业务数据结构，深树/环状引用不会拖慢面板 */
const ESTIMATE_MAX_DEPTH = 6;

/**
 * 粗略估算单个 JS 值的内存占用（字节）。口径：字符串按 UTF-16 每字符 2 字节、
 * 数值 8 字节、布尔 4 字节，数组与普通对象按结构递归累加（对象含键名）；
 * 类实例（ImageBitmap、DOM、Map/Set 等原生对象）不做估算计 0——这类资源请由调用方
 * 自行给出精确口径（如位图 w×h×4）。
 *
 * 仅用于开发面板的相对参考，非精确统计；环状引用与超深结构按 0 截断。
 */
export const estimateValueBytes = (value: unknown, depth = 0, seen?: Set<object>): number => {
  if (value == null) return 0;

  const type = typeof value;
  if (type === 'string') return (value as string).length * 2;
  if (type === 'number' || type === 'bigint') return 8;
  if (type === 'boolean') return 4;
  if (type !== 'object') return 0; // function / symbol 不计
  if (depth >= ESTIMATE_MAX_DEPTH) return 0;

  const object = value as object;
  const guard = seen ?? new Set<object>();
  if (guard.has(object)) return 0; // 环状引用
  guard.add(object);

  let total = 8; // 对象头近似
  if (Array.isArray(object)) {
    for (const item of object) total += estimateValueBytes(item, depth + 1, guard);
    return total;
  }

  // 只处理普通对象（字面量/JSON 反序列化结果）；类实例不猜内部布局
  const proto: unknown = Object.getPrototypeOf(object);
  if (proto !== Object.prototype && proto !== null) return total;
  // for...in + hasOwnProperty 而非 Object.entries：后者每层都要分配一个 [key, value] 数组，
  // 面对上千条目的缓存结构（开发面板逐条估算）会产生大量短命数组
  for (const key in object) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
    total += key.length * 2 + estimateValueBytes((object as Record<string, unknown>)[key], depth + 1, guard);
  }
  return total;
};

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
