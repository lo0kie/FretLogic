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
import { vAutoHeight } from '@/platform/directives/vAutoHeight';
import { vAutoWidth } from '@/platform/directives/vAutoWidth';

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

/** IntersectionObserver：jsdom 缺失，观测回调立即触发一次 */
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
