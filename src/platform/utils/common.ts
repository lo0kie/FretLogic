import { isProxy, isRef, toRaw, unref } from 'vue';

// ===== id: 唯一 id 生成 =====

/**
 * 生成带可选前缀的短随机 id：优先 crypto.randomUUID，不支持时回退「时间戳 + 随机」的十六进制串。
 *
 * 默认长度刻意是 12（48 bit）而不是更短的 8：本函数是全仓 id 生成器，8 个 hex 只有 32 bit，
 * 实体量上万时生日碰撞概率就到 1% 量级；12 位把同类场景压到 10⁻⁵ 以下，而 id 仍足够短。
 *
 * ⚠️ 主路径必须先**剔掉 UUID 的连字符**再截断：UUID 是 8-4-4-4-12 分组，直接 `slice(0, 12)`
 * 取到的第 9 个字符是 `-`，实际只有 11 个 hex（44 bit）—— 与上面那句「12 位 = 48 bit」以及
 * 兜底路径的字符集同时不符；同一字段出现两种字符集时，任何按 hex 校验 id 的地方都只在主路径上失败。
 */
export const generateUUID = (prefix: string = '', length = 12): string => {
  if (typeof crypto !== 'undefined' && isFunction(crypto.randomUUID))
    return (prefix ? `${prefix}_` : '') + crypto.randomUUID().replaceAll(/-/g, '').slice(0, length);

  // 时间戳必须真的进入结果：此前写作 (randomStr + timeStr).slice(0, length)，而 randomStr 本就有
  // length 位，slice 会把时间戳整段切掉——兜底 id 实际退化成纯随机串，时间维度完全没参与。
  // 改为时间戳在前、随机串补足余位；两者一律十六进制，与主路径字符集对齐。
  const timeStr = Date.now().toString(16).slice(-4);
  let randomStr = '';
  if (typeof crypto !== 'undefined' && isFunction(crypto.getRandomValues)) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    crypto.getRandomValues(bytes);
    randomStr = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  } else for (let i = 0; i < length; i += 1) randomStr += Math.floor(Math.random() * 16).toString(16);
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

// ===== isObject: 对象守卫 =====

/**
 * 「非 null 的对象」守卫：`typeof value === 'object' && value !== null` 的具名形式。
 *
 * 收的只是**运行时形状**这一层判断，不是形状本身：`unknown` 经它收窄后仅承诺「不是 null、也不是原始值」，
 * 具体字段仍要逐处读。否定式 `!value || typeof value !== 'object'` 也归它（`!value` 顺手兜掉的
 * undefined / 0 / '' / false 全在「非对象」之内）—— 具名后「是不是对象」只有一种写法，
 * 不必每次重推一遍那串短路。
 *
 * 与 `asRawRecord` 的分工：后者额外排除数组、给出索引签名，只该用在「按宽松记录逐字段读」的数据边界；
 * 本函数连数组一起收，因为调用方常需自己判 `Array.isArray`（例如「对象但不是数组才算配置」），
 * 也常要覆盖数据边界之外的场景（指令绑定值是不是配置对象）。
 *
 * ⚠️ 负分支里 `value` 会被收成 `never` —— 已经确定是对象的类型经谓词否定后无候选可留
 * （`typeof value !== 'object'` 的写法同样如此），故 `if (!isObject(x))` 的块内不要再读 `x` 的属性。
 */
export const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

/**
 * 把外部读来的值当作「宽松记录」读：非对象（null / 原始值）与数组一律给空记录兜底。
 *
 * 用于**数据边界**（备份包、旧格式、JSON 导入）：那里的值只有运行时形状，TS 只看到 `unknown`。
 * 与其在每个字段处 `as unknown as SomeShape`（假装知道形状），不如在这里做一次**带运行时检查**的
 * 收窄，之后按索引签名逐字段读、逐字段 `typeof` 收窄 —— 形状假设只此一处，且它是被检查过的。
 */
export const asRawRecord = (value: unknown): Record<string, unknown> =>
  isObject(value) && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

// ===== 值 / 类型守卫 =====

/**
 * 本组守卫只做一件事：把内联的 `typeof` / 空值判定收成**具名谓词**。它们刻意不替调用方决定业务口径
 * ——「空字符串算不算没有值」「NaN 算不算数」「空数组算不算空」都是各调用点的判断，混进名字里只会制造误读。
 *
 * 具名的收益有三条：
 * ① 收窄后的类型与判定写在同一个签名里。读 `isString(x)` 的人不必反推 `typeof x === 'string'`
 *    会把 `x` 收窄成什么，也不必担心写法抄错（`typeof x === 'String'` 这类笔误不会报错，只会恒假）；
 * ② 全仓同一件事只有一种写法，`grep` 得到的是全集而不是若干近似写法。仓内 `typeof x === 'string'`
 *    上百处、`=== 'number'` 数十处，此前每一处都要重读一遍才知道它收窄成什么；
 * ③ 判定与用法相邻，不会出现「先 `typeof` 判过、几行之后再用」时被中间代码改坏的情况。
 *
 * 刻意**不**提供这几个 —— 原生已有等价物，包一层只会多一次跳转、并让读者多查一次定义：
 * - `isArray` → `Array.isArray`（仓内 71 处，语义与性能都已是标准答案）；
 * - `isFinite` / `isInteger` → `Number.isFinite` / `Number.isInteger`；
 * - `isNaN` → `Number.isNaN`（不要退回全局 `isNaN`，它先做 ToNumber，`'abc'` 会被判成 NaN）；
 * - `isEmpty` → `.length === 0` 在数组 / 字符串 / Map / 类数组上语义各不相同，凑成一个名字反而制造误读；
 * - `isPlainObject` → 已由 `asRawRecord`（带兜底的收窄）与本文件的 `isObject` 覆盖。
 */

/** 值是否为 `undefined`。正向的补集用 `isPresent`，两者配合可让「缺失」与「有值」两条分支都收窄 */
export const isUndefined = (value: unknown): value is undefined => value === undefined;

/**
 * 值是否为 `null` 或 `undefined`（「空」的统一口径）。
 *
 * 与 `value == null` 等价，但**刻意不写松散相等**：`==` 在本仓属 lint 关注项，且 `== null` 的可读性
 * 依赖读者记得「只有 null / undefined 与 null 松散相等」这条冷知识。取反分支会收窄成 `T`，
 * 故 `if (isNil(x)) return;` 之后不必再补一次非空断言。
 */
export const isNil = (value: unknown): value is null | undefined => value === null || value === undefined;

/**
 * 值是否既非 `null` 也非 `undefined`（`isNil` 的补集），用于早退守卫。
 *
 * `if (!isPresent(x)) return;` 之后 `x` 已被收窄成 `T`，不必再写 `if (x === null || x === undefined)`
 * 那串两段式判定；写成 `!isNil(x)` 也行，但正向判据在守卫位置读起来更顺。
 */
export const isPresent = <T>(value: T | null | undefined): value is T => value !== null && value !== undefined;

/** 值是否为字符串。空串也算 —— 要排除空串请在调用点补 `.length > 0`，那是业务口径不是类型口径 */
export const isString = (value: unknown): value is string => typeof value === 'string';

/**
 * 值是否为数字。
 *
 * **不排除 `NaN`**：`typeof NaN === 'number'` 是语言事实，本函数只回答「类型是不是 number」。
 * 要「有限数」用 `Number.isFinite`，要「正整数时间戳」用本文件的 `isValidTimestamp` ——
 * 把这三件事塞进同一个名字，正是「判定看起来通过、值却是 NaN」这类 bug 的来源。
 */
export const isNumber = (value: unknown): value is number => typeof value === 'number';

/** 值是否为布尔 */
export const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/**
 * 值是否为函数。
 *
 * 形参类型取 `never[]` 而非 `unknown[]`：谓词只承诺「这是个函数」，不承诺它的签名 ——
 * 收窄成 `unknown[]` 会让收窄后的 `f(a, b)` 仍报「参数不匹配」，等于把判定做成假收窄；
 * `never[]` 是唯一对所有具体函数类型都成立、又不反向限制调用方的形参类型。
 */
export const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === 'function';

/**
 * 对象**自身**（不含原型链）是否拥有该键 —— `Object.hasOwn` 的具名形式，
 * 且**带类型收窄**：真分支把 `key` 收成 `keyof T`，于是「查表命中」之后可以直接索引，
 * 不必再补 `MAP[key as keyof typeof MAP]` 这类断言（`iconSizes` 的两张档位表、`constants` 的
 * 表单宽度表各因此去掉一处）。
 *
 * 为什么值得单独命名：这条长写法在仓内有近十处（音名简写表、音高表、图标注册表、尺寸与描边预设表、
 * 表单宽度表、同步 provider 元表、字节估算的 `for...in` 过滤…），每处都在回答同一个问题 ——
 * 「按原型链查表会命中 `constructor` / `toString` 这类继承键，故必须只看自身属性」。
 * 名字一立，这个理由只需写一遍；而手抄 `Object.prototype.hasOwnProperty.call(obj, key)` 的长串里，
 * 任何一处漏掉 `.call` 的 `obj` 都会静默失效（`hasOwnProperty(key)` 变成在 window 上查）——
 * 那正是它当初值得收口的实际风险，换成 `Object.hasOwn` 后连这个陷阱本身也不存在了。
 *
 * 形参收 `object` 而非 `Record<string, unknown>`：数组、Map、类实例的自有属性判定同样成立，
 * 收窄成「字符串索引的记录」会把一半调用点挡在门外、逼它们就地断言。
 *
 * ⚠️ 收窄成 `keyof T` 的前提是 `T` 的键集不比运行时实际键集更窄。传**裸 `object`** 时
 * `keyof T` 是 `never`，真分支会把 `key` 收成 `never`（此后连 `key.length` 都报错）——
 * 需要遍历自身键的调用点（如 `estimateValueBytes` 的 `for...in`）请把对象声明成带索引签名的
 * 记录再传，不要传裸 `object`。
 */
export const hasOwn = <T extends object>(object: T, key: PropertyKey): key is keyof T => Object.hasOwn(object, key);

// ===== 运行环境 =====

/**
 * 是否运行在带 DOM 的环境里（浏览器 / jsdom；SSR 与纯 node 环境为 false）。
 *
 * 这是全仓**唯一**的判定来源。此前它有三份各自为政的定义：`platform/ui/overlay/overlayStack` 与
 * `platform/directives/vTooltip` 各写了一遍 `typeof document !== 'undefined'`，`platform/utils/motion`
 * 又因为「platform/utils 不得依赖 platform/ui」这条 zone 而自持一份（还多带了个 window 判断）。
 * 唯一来源落在这里之后那条 zone 反而不再是障碍 —— 它禁止的是 utils 依赖上层，没禁止上层依赖 utils。
 *
 * 只判 `document`：document 是 window 的属性，document 存在则 window 必然存在（Web Worker 里两者都不存在），
 * 故不必也不该再判一次 window。
 */
export const isClient = typeof document !== 'undefined';

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

/**
 * 与 `serializeForStorage` 对称的宽松读取入口：字符串 → `JSON.parse`，任何失败返回 `undefined`。
 *
 * 输入可能来自 localStorage / sessionStorage / kv 镜像等外部边界：空值（null / 空串）与坏 JSON
 * 在调用方眼里是同一件事 —— 「解析不出值」，故统一折叠成 `undefined`，由调用方按各自口径兜底
 * （缺省对象 / 判损坏 / 跳过该键）。不吞非解析类异常：调用方的 try-catch 若还包着 storage 读取
 * 本身（隐私模式下访问即抛），仍由它自己兜。
 */
export const parseJsonSafe = (raw: string | null | undefined): unknown => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
};

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

// ===== base64: UTF-8 安全的 base64 编解码（替代 js-base64）=====

/**
 * 单次 `fromCharCode` 的字节数：展开成实参的数组过大（约 6.5 万起）会超出调用栈上限。
 *
 * 与 `transfer.ts`、`app/services/backup/backupCrypto.ts` 共用同一分块口径 —— 三处都是
 * 「Uint8Array → base64」，任一处漏了分块，就只在那条路径上、且只在数据够大时才崩
 * （本地小样本测不出来）。分块与两处循环因此收在下面两个函数里，别再各写一遍。
 */
const BASE64_CHUNK_SIZE = 0x8000;

/** 字节序列 → 标准 base64（`+` / `/` 字母表，带 `=` 补位）；分块理由见 BASE64_CHUNK_SIZE */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE)
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));

  return btoa(binary);
};

/**
 * 标准 base64 → 字节序列。非法输入按 `atob` 的原样抛错（不在这里吞），
 * 由调用方按自己的边界口径决定降级方式 —— 各调用点的容错要求并不一致：
 * base64DecodeUtf8 / base64UrlToBytes 返回 null，backupCrypto 让异常穿透。
 */
export const base64ToBytes = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/**
 * UTF-8 安全的 base64 编码，与原 js-base64 的 `Base64.encode` 行为一致。
 * 分块处理，避免超长字符串在展开为参数时超出调用栈限制。
 */
export const base64EncodeUtf8 = (str: string): string => bytesToBase64(new TextEncoder().encode(str));

/**
 * UTF-8 安全的 base64 解码，与原 js-base64 的 `Base64.decode` 行为一致，但**脏输入不抛**：
 * 输入可能来自云端响应 / 剪贴板等外部边界，非法 base64 返回 null（与 transfer.ts 的
 * decodeShareToken 同一口径），由调用方决定报什么错 —— 此前 atob 的 InvalidCharacterError
 * 会原样穿透到界面，用户看到的是一段无法读的浏览器原文。
 */
export const base64DecodeUtf8 = (b64: string): string | null => {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(b64);
  } catch {
    return null;
  }
  // fatal 必须开：非 fatal 的 TextDecoder 会把不合法的 UTF-8 字节替换成 U+FFFD 后照常返回字符串，
  // 于是「这段载荷根本不是本应用的文本」会被当成一次成功解码传下去 —— 同步侧的损坏护栏
  // （payloadChecksum 之外还有 syncBase 对解压结果的可读性判定）就此被绕过，坏数据一路进到清洗层。
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
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

// ===== clamp / range / 层叠次序 =====

/** 数值夹取：把 value 限制在 [min, max] 区间内 */
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * 取登记表中**最后一个**满足判据的条目（省略判据即取最后一条）；空表或全不满足返回 `undefined`。
 *
 * 这条「插入序即层叠序，取最后一名」的规则在本仓有三份实现，且三份都在回答同一个问题
 * ——「谁在最上层」：模态阻断栈（`overlayStack` 的 `Array.from(set).pop()`）、
 * 打开中浮层登记表（`usePopoverOrder` 的手写 for 循环）、浮层面板 Esc 登记表
 * （`escapeDispatcher` 的「遍历时不断覆盖 picked」）。差别只在集合类型（Set / Map.values()）
 * 与判据（无 / `open` / 「包含当前焦点且仍在文档中」），规则本身逐字相同。
 *
 * 浏览器不暴露「读取 top-layer 顺序」的 API（理由见 `usePopoverOrder` 的文件头），顺序只能自记，
 * 于是这条规则注定要在多个登记表上重复出现 —— 收在这里，至少让「最后一个」只有一个定义，
 * 不至于哪一处写成第一个才发现。
 *
 * 不引 `Array.prototype.findLast`：它需要先 `Array.from` 拷一份（本函数直接吃 Iterable），
 * 且 `lib` 停在 ES2022、类型上并不存在。
 */
export const lastMatching = <T>(entries: Iterable<T>, match?: (entry: T) => boolean): T | undefined => {
  let found: T | undefined;
  for (const entry of entries) if (!match || match(entry)) found = entry;
  return found;
};

/**
 * 生成 `[start, end)` 的整数序列（`end <= start` 时为空数组）。
 *
 * 只用来表达「一段连续的整数」，不是「造 n 个元素」—— 后者请继续用
 * `Array.from({ length: n }, () => createX())`，那种写法里索引只是计数器的副产物。
 * 反过来，`Array.from({ length: n }, (_, i) => i)` 这类「索引即结果」的写法本函数能替掉：
 * 长度 n 只是 `start`/`end` 的差，写成区间后「从哪到哪」直接可读，
 * 也不必再靠 `(_, i) =>` 的占位参数说明前一个参数没用。
 *
 * 半开区间（不含 end）是刻意的：与 slice / 循环条件 `<` 同一口径，
 * 相邻两段首尾相接时不会重叠。
 */
export const range = (start: number, end: number): number[] => {
  const out: number[] = [];
  for (let i = start; i < end; i += 1) out.push(i);
  return out;
};

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
  if (isNil(value)) return 0;

  const type = typeof value;
  if (type === 'string') return (value as string).length * 2;
  if (type === 'number' || type === 'bigint') return 8;
  if (type === 'boolean') return 4;
  if (type !== 'object') return 0; // function / symbol 不计
  if (depth >= ESTIMATE_MAX_DEPTH) return 0;

  // 声明成带索引签名的记录而不是裸 `object`：下面 `hasOwn(object, key)` 的收窄结果是 `keyof T`，
  // 裸 `object` 的 `keyof` 是 `never`，真分支里 `key` 会被收成 `never`、连 `key.length` 都报错。
  const object = value as Record<string, unknown>;
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
  // for...in + hasOwn 而非 Object.entries：后者每层都要分配一个 [key, value] 数组，
  // 面对上千条目的缓存结构（开发面板逐条估算）会产生大量短命数组
  for (const key in object) {
    if (!hasOwn(object, key)) continue;
    total += key.length * 2 + estimateValueBytes(object[key], depth + 1, guard);
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
  return localISOTime.replace(/T/, '_').replaceAll(/:/g, '-').split('.')[0] ?? '';
};

// ===== 记录时间戳 =====

/**
 * 带时间戳的记录：清洗草稿落成实体前，两个字段都可能缺（由 `fillMissingTimestamps` 补齐）。
 * 刻意只描述这两个可选字段 —— 它是「清洗期形态」，不是某个实体。
 */
export interface Timestamped {
  createdAt?: number;
  updatedAt?: number;
}

/** 合法时间戳：正有限数（0 与负数一律视为「未设」，交给补齐逻辑） */
export const isValidTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/**
 * 给缺时间戳的记录补上合法值：已有值原样保留，缺失值按「游标 + 1」递增补齐。
 *
 * 为什么递增而不是统一填 `now`：同一批里若都填同一个值，批内先后就丢了 —— 列表按 updatedAt
 * 排序会退化成不稳定序。游标从 `now` 起算、遇已有值抬到其上，故补齐值恒为「本批最新之后」。
 *
 * 归平台层而非某个域的仓储模块：它只依赖 `Timestamped` 这一形状，和弦 / 乐谱 / 备份载荷三处都在用；
 * 原先定义在 `chord/model/chordRepository` 里，迫使乐谱域与 app 层**跨域 import 一个仓储模块**才拿到它
 * （而仓储模块该导出的是仓储）。
 */
export const fillMissingTimestamps = <T extends Timestamped>(
  items: T[],
  now: number
): (T & Required<Timestamped>)[] => {
  let cursor = now;

  return items.map(item => {
    cursor = isValidTimestamp(item.createdAt) ? Math.max(cursor, item.createdAt) : cursor + 1;

    const createdAt = isValidTimestamp(item.createdAt) ? item.createdAt : cursor;
    const updatedAt = isValidTimestamp(item.updatedAt) ? item.updatedAt : createdAt;

    return { ...item, createdAt, updatedAt } as T & Required<Timestamped>;
  });
};
