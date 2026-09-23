import { nextTick, onScopeDispose, toValue, watch } from 'vue';

import { logger } from '@/platform/utils/logger';

import type { MaybeRefOrGetter } from 'vue';

/**
 * 贴回后允许逐帧补写的时长。容器（尤其折叠分组）的高度过渡（--duration-base 0.18s）期间
 * 可滚动量还没长到位，此刻写入会被浏览器钳到当前上限，故需要跨帧补写。
 */
const RESTORE_RETRY_MS = 800;

/**
 * 滚动位置记忆（会话级）：把滚动容器的**纵向**位置（scrollTop）按「档位键」记下来，
 * 容器重建、内容换档、乃至消费方组件卸载重挂之后，按同一把键恢复。
 *
 * **记忆必须存在模块级，不能存在组件实例里。** 两个消费方都活在「会消失的容器」中：
 *   · 左栏（SidebarLeft）：两个 section 由 KeepAlive 共用同一个滚动容器，切路由时内容整段换掉，
 *     位置无法随 DOM 天然保持；
 *   · 设置弹层（HeaderConfigPopover）：面板是 BasePopover 的 `v-if="isShown"`（BasePopover.vue:36），
 *     关闭即销毁面板子树，**消费方组件本身被卸载** —— 记忆若写在 `<script setup>` 里会随实例消失。
 *     该组件现有的做法正是把两个滚动位置 `ref` 声明在**模块作用域**的 `<script>` 块里
 *     （见其 283~324 行，与同处声明的分组展开态同一手法）来绕开这一点。
 * 本函数把这条约束收敛到平台层：消费方不必再自己维持一个模块级变量，也不会误写进实例作用域。
 * 记忆按 scope 落在模块级 Map 里，只受页面生命周期约束。
 *
 * **记录方式是持续记录**（在容器上挂 scroll 监听），不是「换档时现读一次」：
 * v-scrollbar 卸载时会摘掉内联 overflow-y，元素的 scrolling box 被销毁、scrollTop 静默归零
 * （根因见 HeaderConfigPopover 的历史说明），那一刻**不派发 scroll** —— 持续记录保住的是
 * 「销毁前最后一个真实位置」，换档时现读只会读到钳位后的 0。
 *
 * 持续记录带来一组必须处理的副作用，都源于「贴回本身也是一次 scrollTop 写入」：
 *
 * 1. **写入的回声不能计入记忆。** 贴回时若容器还没长到能容纳目标位置，浏览器会把写入钳到
 *    当前上限，并照样派发 scroll；持续记录若把这次钳位值记下来，就会把上一次的真实位置
 *    覆盖成钳位值（实测：记忆 600 → 贴回被钳成 57.33 → 记为 57.33 → 下一次只剩 57）。
 *    故写入时记下「实际写进去的值」，紧随其后回报同一个值的 scroll 一律视为回声、不记。
 * 2. **贴回要等到位置真能落下去。** 折叠分组的高度过渡期间可滚动量不足，单次写入必然被钳；
 *    故贴回后逐帧补写，直到落位 / 超时 / 容器换绑 / 用户自行滚动（不与用户抢滚动条）。
 * 3. **换档时先结算旧档位，再贴回新档位。** 两个档位的内容高度不同，新内容一挂上就会把容器
 *    钳到自己的上限；若等到内容渲染完才去读旧档位，读到的是被新内容钳过的值，矮档位会把
 *    高档位记的位置覆盖掉。故旧档位的结算挂在 **pre** 冲刷（内容还是旧的，值可信），
 *    新档位的贴回挂在 **post** 冲刷。
 *
 * **档位键必须覆盖「所有会改变容器内容」的维度**：键太粗（例如只按路由分）会让两个内容高度
 * 不同的视图共用一份记忆，矮的那个一钳位就把高的那份写坏 —— 表现为「换了 tab 之后位置丢了」。
 * 判断方法：容器内容的任何一处渲染分支，都应当被键区分开。
 *
 * 故参数分成两半：`keys` 显式列出**一共要保存几份**（每份是一把键名），`activeKey` 给出
 * **当前在哪一份**。档位空间有限时把 `keys` 写上 —— `activeKey` 的类型随即被收窄成这几把键的
 * 联合，「漏了某个维度」在编译期就过不去（运行时另有一道兜底，见 validateKey）；档位空间开放
 * 时（如左栏按任意路由路径分档）可以不写，此时 `activeKey` 收 `string`。
 * 档位类型只从 `keys` 推（`activeKey` 处套了 `NoInfer`），所以消费方若给 `activeKey` 传
 * `computed`，必须把档位类型标出来，传裸 `computed` 会因为推成 `string` 而报错 —— 这是刻意的：
 * 不钉住来源的话 `K` 会被 `activeKey` 反向推宽，`keys` 就白声明了。
 *
 * 只记纵向 scrollTop：两个消费方都是纵向列表（BaseScrollArea axis="y"）。
 * 双轴场景（ScoreInteractiveArea / ScorePreviewPane 的 detach→attach 复位）语义不同，不在本函数职责内。
 */
export interface UseScrollMemoryOptions<K extends string = string> {
  /** 命名空间：把模块级缓存按消费方隔开，不同容器即使档位键同名也不会互相覆盖 */
  scope: string;
  /**
   * 档位全集：显式声明「一共要保存几份」，每份是一把键名（如 `['score:edit', 'workbench']`）。
   * 声明后：① `activeKey` 被收窄成这几把键的联合，漏维度编译期即报错；② 各档位先建出槽位，
   * 调试时记忆表一眼看全量；③ 重复键会报警（按一份处理）。档位空间开放时可不写。
   *
   * 「不可重复」只能在运行时查：`K` 取的是元素**联合**，`['a', 'a']` 与 `['a']` 是同型，
   * 类型层根本看不见那次重复（所以别指望条件类型来兜，只能声明时报一条）。
   */
  keys?: readonly K[];
  /**
   * 当前所在档位：值变化即切档。
   *
   * 外面套一层 `NoInfer` 把 `K` 的推断来源**钉死在 `keys` 上**：否则 `activeKey` 会反过来把
   * `K` 推宽 —— 传一个没标类型的 `computed` 过来是 `ComputedRef<string>`，`K` 就跟着变成
   * `string`，`keys` 白声明、约束被架空（且不会报任何错，最难发现的那种）。钉住之后，
   * 消费方的 `computed` 必须标出档位类型（如 `computed<PanelKey>(…)`）才通得过。
   */
  activeKey: MaybeRefOrGetter<NoInfer<K>>;
  /** 滚动容器元素（通常是 useScrollAreaElement 的结果） */
  target: MaybeRefOrGetter<HTMLElement | null | undefined>;
}

export interface ScrollMemoryHandle {
  /**
   * 把当前档位的位置贴回容器。供「容器几何被外部时机破坏后又恢复」的场景补一次
   * （如侧栏收起时容器尺寸归零、位置被浏览器钳掉，重开时贴回）。
   *
   * 内部已含两次同步写入（立即一次 + 下一 tick 一次）与随后的逐帧补写 ——
   * 换档时内容整段重挂，位置若只在内容长出来之前写，会被浏览器按当时（更小的）可滚动量钳回去。
   */
  restore: () => void;
}

/** 模块级记忆：scope → (档位键 → scrollTop) */
const STORES = new Map<string, Map<string, number>>();

/** 取（必要时创建）某 scope 的记忆表。不用 `let` + 收窄：捕获到闭包里后收窄会失效 */
const storeOf = (scope: string): Map<string, number> => {
  const existing = STORES.get(scope);
  if (existing) return existing;
  const created = new Map<string, number>();
  STORES.set(scope, created);
  return created;
};

export function useScrollMemory<K extends string = string>(options: UseScrollMemoryOptions<K>): ScrollMemoryHandle {
  const store = storeOf(options.scope);

  /** 当前档位键。返回字符串而非数组，故 watch 的相等判定按值生效 ——
   *  数组每次求值都是新引用，直接 watch 会被判为「一直变化」而反复误触发贴回 */
  const currentKey = (): string => toValue(options.activeKey);
  const element = () => toValue(options.target) ?? null;

  const { keys } = options;
  /** 声明的档位全集（已去重）；未声明则不做越界校验。
   *  显式标 `Set<string>` 而非 `Set<K>`：`validateKey` 拿的是运行时求出的 `string` 去 `has`，
   *  而 `Set<K>.has` 只收 `K`（K 是调用方推出来的字面量联合）——收窄在这里只会挡住自己的校验代码。
   *
   *  去重、找重复、预建槽位并作一趟：任一把键再次出现即为重复声明（多半是复制粘贴漏改，
   *  而它恰好会造出「两个视图共用一份记忆」——正是本函数最想防的那类错）；未访问过的档位
   *  也先建出槽位，让记忆表一眼看全量，而不是「访问过才有」。
   *
   *  判存在用 `if (keys)` 而非 `keys?.length`：「声明为空数组」是有效声明，得到的是**非 null
   *  的空集合**，于是任何 activeKey 都会被 validateKey 判越界；写成 `?.length` 会把「声明为空」
   *  悄悄降级成「完全不校验」。 */
  let declaredKeys: Set<string> | null = null;

  if (keys) {
    declaredKeys = new Set<string>();
    const duplicated: string[] = [];

    for (const key of keys) {
      if (declaredKeys.has(key)) duplicated.push(key);
      else declaredKeys.add(key);
      if (!store.has(key)) store.set(key, 0);
    }

    if (duplicated.length > 0)
      logger.warn('scrollMemory', `keys 里有重复档位：${duplicated.join('、')}（重复项共用同一份记忆）`, {
        scope: options.scope,
        declaredKeys: [...declaredKeys],
      });
  }

  /** 已报过警的档位键：同一把键反复进出（如来回切 tab）只报一次，避免刷屏 */
  const warnedKeys = new Set<string>();

  /** 越界兜底：`activeKey` 的类型本已被 `keys` 收窄，但键若来自 `string`（JS 调用方、
   *  或从 `any` 宽化来的动态值）就绕过了类型约束。越界意味着该档位没有独立记忆，会与别的
   *  档位共用一份 —— 矮的那个一钳位就把高的写坏，表现为「换了 tab 位置就丢」，故响亮报出来。 */
  const validateKey = (key: string): void => {
    if (!declaredKeys || declaredKeys.has(key) || warnedKeys.has(key)) return;
    warnedKeys.add(key);
    logger.warn('scrollMemory', `档位键「${key}」不在 keys 声明内，该档位没有独立的滚动记忆`, {
      scope: options.scope,
      activeKey: key,
      declaredKeys: [...declaredKeys],
    });
  };
  validateKey(currentKey());

  /** 最近一次程序化写入的实际值（可能已被浏览器钳位）：用于识别「自己写入的回声」 */
  let selfWritten: number | null = null;
  /** 本次贴回窗口内用户是否已自行滚动：是则放弃补写，不与用户抢滚动条 */
  let userScrolled = false;
  /** 进行中的补写帧句柄 */
  let retryFrame: number | null = null;

  const stopRetry = (): void => {
    if (retryFrame !== null) cancelAnimationFrame(retryFrame);
    retryFrame = null;
  };

  /** 同步写入一次（无记录则归 0：该档位从未被访问过，从头开始才是对的） */
  const apply = (): void => {
    const el = element();
    if (!el) return;
    const remembered = store.get(currentKey()) ?? 0;
    if (el.scrollTop !== remembered) {
      el.scrollTop = remembered;
      // 记「实际写进去的值」而非 remembered：被钳位时两者不同，回声按实际值识别
      selfWritten = el.scrollTop;
    }
  };

  /**
   * 贴回后逐帧补写，直到位置真正落下去。终止条件（任一满足即停）：
   * 已落位 / 超过 RESTORE_RETRY_MS / 容器换绑（新容器有自己的贴回）/ 用户自行滚动。
   */
  const retryUntilLanded = (): void => {
    stopRetry();
    const el = element();
    const remembered = store.get(currentKey()) ?? 0;
    if (!el || remembered === 0 || el.scrollTop === remembered) return;
    const deadline = performance.now() + RESTORE_RETRY_MS;
    const step = (): void => {
      retryFrame = null;
      const node = element();
      if (node !== el || userScrolled || performance.now() > deadline) return;
      if (node.scrollTop === remembered) return;
      node.scrollTop = remembered;
      selfWritten = node.scrollTop;
      retryFrame = requestAnimationFrame(step);
    };
    retryFrame = requestAnimationFrame(step);
  };

  const restore = (): void => {
    userScrolled = false;
    apply();
    void nextTick(apply);
    retryUntilLanded();
  };

  const save = (): void => {
    const el = element();
    if (!el) return;
    // 自己写入的回声（含被钳位后的值）不计入记忆：否则「内容还没长高时贴回」
    // 会把上一次的真实位置覆盖成钳位值，记忆就此丢失且不可自愈
    if (selfWritten !== null && el.scrollTop === selfWritten) return;
    selfWritten = null;
    userScrolled = true;
    store.set(currentKey(), el.scrollTop);
  };

  // 容器换绑（含首次绑定）：挂上持续记录，并把该档位的位置贴回去。
  // post 冲刷保证「元素已进 DOM、内容已渲染」；immediate 那次在 setup 期执行，
  // 此时模板 ref 尚未绑定（element() 为 null），真正的绑定由随后的冲刷触发。
  let detachScroll: (() => void) | null = null;
  watch(
    element,
    el => {
      stopRetry();
      detachScroll?.();
      detachScroll = null;
      if (!el) return;
      el.addEventListener('scroll', save, { passive: true });
      detachScroll = () => el.removeEventListener('scroll', save);
      restore();
    },
    { immediate: true, flush: 'post' }
  );

  // 换档：**先**把容器当前位置结算给旧档位（pre 冲刷 ⇒ 此刻内容还是旧档位的，值可信），
  // **再**在新内容渲染后贴回新档位（post 冲刷）。
  //
  // 顺序不能反：两个档位的内容高度不同，新内容一挂上就会把容器钳到自己的上限。若等到 post
  // 才去「读一下旧档位」，读到的已经是被新内容钳过的值 —— 矮档位（如乐谱页「排列和弦」tab
  // 比「预览」tab 少几组设置）会把高档位记的位置覆盖掉。这正是「换了 tab 之后位置丢了」的成因。
  watch(
    currentKey,
    (key, previousKey) => {
      validateKey(key);
      const el = element();
      if (el) store.set(previousKey, el.scrollTop);
    },
    { flush: 'pre' }
  );

  // 新内容渲染完成后再贴回（内容在同一轮更新里被换掉，故同样要 post 冲刷）
  watch(currentKey, () => void restore(), { flush: 'post' });

  onScopeDispose(() => {
    stopRetry();
    detachScroll?.();
    detachScroll = null;
  });

  return { restore };
}
