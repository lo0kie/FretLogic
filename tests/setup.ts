/** 测试全局 setup：注入 fake IndexedDB 与浏览器 API polyfill（jsdom 不内置） */
import { config } from '@vue/test-utils';
import {
  IDBCursor,
  IDBCursorWithValue,
  IDBDatabase,
  IDBFactory,
  IDBIndex,
  IDBKeyRange,
  IDBObjectStore,
  IDBOpenDBRequest,
  IDBRequest,
  IDBTransaction,
  IDBVersionChangeEvent,
  indexedDB,
} from 'fake-indexeddb';

import { vChordName } from '@/domains/chord/directives/vChordName';
import { vAutoHeight } from '@/platform/directives/animation/vAutoHeight';
import { vAutoWidth } from '@/platform/directives/animation/vAutoWidth';

// idb 包在 wrap 层用 `instanceof IDBRequest` 等全局构造器判定请求类型，jsdom 下这些全局不存在，
// 只注入 indexedDB/IDBKeyRange 会抛 ReferenceError: IDBRequest is not defined，故注入全套类全局
Object.defineProperty(globalThis, 'indexedDB', {
  value: indexedDB,
  writable: true,
});

Object.defineProperty(globalThis, 'IDBKeyRange', {
  value: IDBKeyRange,
  writable: true,
});

Object.assign(globalThis, {
  IDBFactory,
  IDBDatabase,
  IDBObjectStore,
  IDBIndex,
  IDBRequest,
  IDBOpenDBRequest,
  IDBTransaction,
  IDBCursor,
  IDBCursorWithValue,
  IDBVersionChangeEvent,
});

/**
 * IntersectionObserver：jsdom 缺失，观测回调**在 observe() 里同步触发一次** isIntersecting: true。
 *
 * 与下面的 ResizeObserver 桩是相反方向的取舍：这里必须给一个「已进视口」的确定值，否则任何惰性渲染
 * （哨兵进视口才扩批 / 才挂载子组件）在 jsdom 下都不会启动，绝大多数交互用例根本跑不起来。
 * 代价是**依赖「尚未进视口」的分支在 jsdom 下测不到**：例如乐谱交互区的「哨兵进视口才扩批」
 * 门禁在本桩下恒放行 —— 要测「未进视口时不扩批」必须改用真实浏览器（Playwright）。
 */
if (!('IntersectionObserver' in globalThis)) {
  class MockIntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin = '0px';
    readonly thresholds: ReadonlyArray<number> = [0];
    private readonly callback: IntersectionObserverCallback;
    private readonly targets = new Set<Element>();

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element) {
      this.targets.add(target);
      this.callback(
        [
          {
            isIntersecting: true,
            target,
            intersectionRatio: 1,
            boundingClientRect: target.getBoundingClientRect(),
            intersectionRect: target.getBoundingClientRect(),
            rootBounds: null,
            time: 0,
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver
      );
    }

    unobserve(target: Element) {
      this.targets.delete(target);
    }

    disconnect() {
      this.targets.clear();
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  Object.defineProperty(globalThis, 'IntersectionObserver', {
    value: MockIntersectionObserver,
    writable: true,
  });
}

/**
 * ResizeObserver：jsdom 同样缺失，而它比 IntersectionObserver 更常被撞上 —— 任何一个浮层 / 滚动区
 * （BasePopover → BaseScrollArea）挂载时都会构造一个。
 *
 * 刻意**不**回调：与上面的 IntersectionObserver 桩不同，这里的回调链是「测量 → 写样式 → 尺寸变化 →
 * 再测量」，在 observe() 里同步触发会直接变成自激循环；而这些回调依赖真实布局（jsdom 的
 * getBoundingClientRect 恒为 0），喂假数据只会让断言建立在假测量上。
 *
 * 后果：jsdom 下**不能**断言依赖实际尺寸的布局结果（滚动条显隐、边缘渐隐、虚拟滚动定位等），
 * 那些场景应改用真实浏览器（Playwright）。本桩只保证「组件能挂载、能响应交互」这一层。
 */
if (!('ResizeObserver' in globalThis)) {
  class MockResizeObserver implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: MockResizeObserver,
    writable: true,
  });
}

/**
 * Popover API：jsdom 完全不实现 —— 没有 `popover` IDL 属性、没有 showPopover / hidePopover，
 * 也不认识 `:popover-open` 伪类（nwsapi 遇到未知伪类直接抛 SyntaxError）。
 *
 * 浮层宿主自 2026-09-29 起改由 top-layer 承担层叠来源，缺这套桩会让 tests/ui 下所有涉及浮层
 * （BasePopover / BaseFloatingPanel / vTooltip）的用例整片假红，故它是那次迁移的前置条件。
 *
 * 桩的口径：
 * - 打开态落在**真实属性** `data-popover-open` 上，而不是私有 WeakSet —— 伪类匹配要靠它翻译；
 * - `:popover-open` 由 matches / closest / querySelector(All) 的入参改写成 `[data-popover-open]`；
 * - `beforetoggle`（可取消）与 `toggle` 按规范次序派发，`togglePopover(force)` 支持强制开关；
 * - `showPopover` 在「未连接 / 不是 popover」时抛 InvalidStateError，`hidePopover` 对已关闭者是空操作
 *   —— 与规范一致，不按「状态不符一律抛」实现（产品侧另有幂等包装，见 platform/ui/popover/topLayer）。
 *
 * 桩**不**模拟 top-layer 的层叠顺序，也不模拟 UA 的 `[popover]:not(:popover-open) { display: none }`：
 * 前者在 jsdom 里没有对应概念，后者由宿主的 v-if 承担 —— 断言不应建立在这两条之上。
 */
const POPOVER_OPEN_ATTR = 'data-popover-open';

/** 把 `:popover-open` 翻译成等价的属性选择器；不含该伪类时原样返回（避免全量选择器都走一次替换） */
const rewritePopoverPseudo = (selector: string): string =>
  selector.includes(':popover-open') ? selector.replaceAll(':popover-open', `[${POPOVER_OPEN_ATTR}]`) : selector;

/** 派发 beforetoggle（可取消）/ toggle，返回是否未被取消（取消则不改变状态） */
const dispatchToggleEvents = (el: HTMLElement, newState: 'open' | 'closed'): boolean => {
  const oldState = newState === 'open' ? 'closed' : 'open';
  const before = new Event('beforetoggle', { cancelable: true });
  Object.defineProperties(before, { newState: { value: newState }, oldState: { value: oldState } });
  if (!el.dispatchEvent(before)) return false;

  if (newState === 'open') el.setAttribute(POPOVER_OPEN_ATTR, '');
  else el.removeAttribute(POPOVER_OPEN_ATTR);

  const toggled = new Event('toggle');
  Object.defineProperties(toggled, { newState: { value: newState }, oldState: { value: oldState } });
  el.dispatchEvent(toggled);
  return true;
};

// typeof 守卫：本文件被两个 vitest project 共用，而 node 环境（logic project）里没有 HTMLElement ——
// 缺了它，logic project 会在收集阶段就抛 ReferenceError，整套 domain / data / stores 用例整片假红
if (typeof HTMLElement !== 'undefined' && !('popover' in HTMLElement.prototype)) {
  /** 元素是否已处于 popover 打开态（桩的判据，与 `:popover-open` 同源） */
  const isPopoverOpen = (el: HTMLElement): boolean => el.hasAttribute(POPOVER_OPEN_ATTR);

  Object.defineProperties(HTMLElement.prototype, {
    popover: {
      configurable: true,
      get(this: HTMLElement): string | null {
        const raw = this.getAttribute('popover');
        if (raw === null) return null;
        return raw === 'manual' ? 'manual' : 'auto';
      },
      set(this: HTMLElement, value: unknown) {
        if (value === null || value === undefined || value === false) this.removeAttribute('popover');
        else this.setAttribute('popover', value === 'manual' ? 'manual' : 'auto');
      },
    },
    showPopover: {
      configurable: true,
      writable: true,
      value(this: HTMLElement) {
        if (!this.isConnected || this.getAttribute('popover') === null)
          throw new DOMException('元素未连接或不带 popover 属性', 'InvalidStateError');
        // 规范：已在打开态时直接返回（不是抛错）
        if (!isPopoverOpen(this)) dispatchToggleEvents(this, 'open');
      },
    },
    hidePopover: {
      configurable: true,
      writable: true,
      value(this: HTMLElement) {
        if (!this.isConnected) throw new DOMException('元素未连接', 'InvalidStateError');
        if (isPopoverOpen(this)) dispatchToggleEvents(this, 'closed');
      },
    },
    togglePopover: {
      configurable: true,
      writable: true,
      value(this: HTMLElement, force?: boolean) {
        if (force === true || (force === undefined && !isPopoverOpen(this))) this.showPopover();
        else this.hidePopover();
        return isPopoverOpen(this);
      },
    },
  });

  // 选择器引擎不认识 `:popover-open`，各入口一并翻译。只包一层入参改写，
  // 其余语义（无效选择器抛 SyntaxError 等）原样透传。
  type ElementSelectorMethod = 'matches' | 'closest' | 'querySelector' | 'querySelectorAll';
  type DocumentSelectorMethod = 'querySelector' | 'querySelectorAll';

  const patchSelector = (proto: Element | Document, method: ElementSelectorMethod | DocumentSelectorMethod): void => {
    // 联合类型无法用四方法联合键直接索引（TS7053）；交叉视图让四个键都可见。
    // 运行时安全：matches/closest 只在 Element.prototype 上注册（见下方调用点）
    const host = proto as Element & Document;
    const original = host[method] as unknown as (this: Element, selector: string) => unknown;
    Object.defineProperty(host, method, {
      configurable: true,
      writable: true,
      value(this: Element, selector: string) {
        return original.call(this, rewritePopoverPseudo(selector));
      },
    });
  };

  for (const method of ['matches', 'closest', 'querySelector', 'querySelectorAll'] as const)
    patchSelector(Element.prototype, method);
  for (const method of ['querySelector', 'querySelectorAll'] as const) patchSelector(Document.prototype, method);
}

/**
 * 环境修补：关掉 undici 的「响应体流终结器」（`streamRegistry`）。
 *
 * 起因：`tests/data/` 下三条 `pull()` 用例在**全量跑测**下必现
 * `Body is unusable: Body has already been read`，而任何子集跑法都不复现。这句是 undici 对
 * 「流已加锁」与「流已被读」共用的文案，本身不含「是谁先动的体」—— 给原型挂探针记下每条体流的
 * **首个消费者**，拿到的栈是：
 *
 *   ReadableStream.cancel ← node:internal/deps/undici/undici ← FinalizationRegistry.cleanupSome
 *
 * 对照 undici 源码，这是它唯一一处「在终结器回调里取消体流」的地方：
 *
 *   streamRegistry = new FinalizationRegistry(weakRef => {
 *     const stream = weakRef.deref();
 *     if (stream && !stream.locked && !isDisturbed(stream) && !isErrored(stream)) {
 *       stream.cancel('Response object has been garbage collected').catch(noop);
 *     }
 *   });
 *
 * 登记点有两处：`Response.prototype.clone()` 登记**被克隆的那个响应**（持有值是该响应体流的
 * WeakRef），`fromInnerResponse()` 登记新建的响应。而 msw 的 mock 响应链上，「调用方拿到的那个响应」
 * 与若干中间 Response **共用同一条体流** —— `new Response(stream)` 不 tee、直接别名（实测
 * `new Response(s).body === s`），于是链上任何一环被 GC，取消都可能落在调用方**还没读**的那条流上。
 * 全量跑测时堆更脏，`decodePayload` 里那次冷动态 import（约 250ms、分配量大）会触发 major GC，
 * 正好把中间对象收走 —— 这同时解释了「失败恒为该文件内第一个 `pull()`」（唯一付冷 import 的那次）
 * 与「子集跑法不复现」。生产环境没有这条别名：真实 fetch 的响应体只由应用自己持有，应用活着就
 * 轮不到终结器碰它。
 *
 * 因此这里**在测试进程里让 undici 不再登记这类体流终结器**：判据取登记时的形态（持有值是
 * ReadableStream，或其 WeakRef 指向 ReadableStream），不依赖 undici 的文案，也不影响其他
 * FinalizationRegistry 使用者。副作用仅限测试环境 —— 被放弃的 mock 响应体流不再由 GC 兜底取消，
 * 而测试里没有真实连接需要释放。
 */
if (typeof FinalizationRegistry !== 'undefined' && typeof ReadableStream !== 'undefined') {
  /** undici 的登记形态：`register(响应对象, new WeakRef(响应体流))` */
  const holdsResponseStream = (heldValue: unknown): boolean => {
    const value = heldValue instanceof WeakRef ? heldValue.deref() : heldValue;
    return value instanceof ReadableStream;
  };

  const originalRegister = FinalizationRegistry.prototype.register;

  FinalizationRegistry.prototype.register = function (
    this: FinalizationRegistry<unknown>,
    target: object,
    heldValue: unknown,
    unregisterToken?: object
  ): void {
    if (holdsResponseStream(heldValue)) return;
    originalRegister.call(this, target, heldValue, unregisterToken);
  };
}

config.global.directives = {
  ...config.global.directives,
  'wave': () => {},
  'tooltip': () => {},
  'chord-name': vChordName,
  'chordName': vChordName,
  'auto-width': vAutoWidth,
  'autoWidth': vAutoWidth,
  'auto-height': vAutoHeight,
  'autoHeight': vAutoHeight,
};
