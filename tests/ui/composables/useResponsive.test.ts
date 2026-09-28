/**
 * useResponsive 的阈值契约测试。
 *
 * 断言的是**项目自己的两个决策**，不是 vueuse 的行为：`isMobile` 的判据是 `< md`、抽屉化 / 顶栏收纳的
 * 判据是 `< lg`。这两个数是「谁在什么宽度下换形态」的唯一出处（`TopHeader` / `SidebarLeft` / `App.vue`
 * 都读它），改档位时必须有地方红一次 —— 否则只会表现为「某个宽度下顶栏开始重叠」这种要靠人肉发现的回归。
 * （`TopHeader` 的收纳档 2026-09-28 从 `< md` 改到 `< lg`：宽档下两组各占半幅、右组内容实测 490px，
 * 半幅装不下，768~900px 两组会压在一起。故 1023/1024 那条边界断言现在同时钉住顶栏收纳。）
 *
 * jsdom 不实现 `matchMedia`（vueuse 的断点全建立在它之上），故本文件自带一份**视口宽度可控**的桩：
 * 只解析 `(min-width: Npx)` / `(max-width: Npx)` 两种子句（vueuse 的 tailwind 预设只产出这两种形态），
 * 并在宽度变化时按真实语义派发带 `matches` 的 change 事件（vueuse 的处理器读的就是 `event.matches`），
 * 使「跟随视口变化」这一条也测得到。
 */
import { effectScope } from 'vue';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useResponsive } from '@/platform/composables/useResponsive';

type Listener = (event: { matches: boolean }) => void;

interface MediaQueryListStub {
  readonly media: string;
  readonly matches: boolean;
  addEventListener: (type: string, listener: Listener) => void;
  removeEventListener: (type: string, listener: Listener) => void;
  addListener: (listener: Listener) => void;
  removeListener: (listener: Listener) => void;
  /** 桩自有：宽度变化时重新判定并通知（真实 MQL 由浏览器做这件事） */
  notify: () => void;
}

let currentWidth = 0;
const created: MediaQueryListStub[] = [];

/** 只认 vueuse 断点实际产出的两种子句；不匹配任何子句的查询一律 false（如 prefers-* 查询） */
const evaluateQuery = (query: string, width: number): boolean => {
  const clauses = [...query.matchAll(/\((min|max)-width:\s*([\d.]+)px\)/g)];
  if (clauses.length === 0) return false;
  return clauses.every(([, kind, value]) => (kind === 'min' ? width >= Number(value) : width <= Number(value)));
};

const createStub = (query: string): MediaQueryListStub => {
  const listeners = new Set<Listener>();
  const stub: MediaQueryListStub = {
    media: query,
    get matches() {
      return evaluateQuery(query, currentWidth);
    },
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
    addListener: listener => void listeners.add(listener),
    removeListener: listener => void listeners.delete(listener),
    notify: () => listeners.forEach(listener => listener({ matches: stub.matches })),
  };
  created.push(stub);
  return stub;
};

/** 改视口宽度并通知所有已建立的媒体查询（只在本文件内生效，jsdom 环境按文件隔离） */
const resizeTo = (width: number): void => {
  currentWidth = width;
  created.forEach(stub => stub.notify());
};

/**
 * 在当前 effect scope 内取一份响应式状态：`useResponsive` 内部会 `tryOnScopeDispose` 注册清理，
 * 脱离 scope 调用会触发 vueuse 的警告；用完即停，避免跨用例残留媒体查询监听。
 */
const withResponsive = <T>(fn: (r: ReturnType<typeof useResponsive>) => T): T => {
  const scope = effectScope();
  try {
    const responsive = scope.run(() => useResponsive());
    if (!responsive) throw new Error('useResponsive 未返回');
    return fn(responsive);
  } finally {
    scope.stop();
  }
};

beforeEach(() => {
  created.length = 0;
  currentWidth = 1280;
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: createStub });
});

afterEach(() => {
  created.length = 0;
});

describe('useResponsive 的阈值', () => {
  it('桌面档：两个判据都关（1280px）', () => {
    withResponsive(r => {
      expect(r.isMobile.value).toBe(false);
      expect(r.isDrawerMode.value).toBe(false);
    });
  });

  it('平板档：只有抽屉判据开（1000px，落在 768~1023）', () => {
    resizeTo(1000);
    withResponsive(r => {
      expect(r.isDrawerMode.value).toBe(true);
      expect(r.isMobile.value).toBe(false);
    });
  });

  it('手机档：两个判据都开（700px）', () => {
    resizeTo(700);
    withResponsive(r => {
      expect(r.isMobile.value).toBe(true);
      expect(r.isDrawerMode.value).toBe(true);
    });
  });

  it('边界翻转：isMobile 在 767/768 之间、isDrawerMode 在 1023/1024 之间', () => {
    withResponsive(r => {
      resizeTo(768);
      expect(r.isMobile.value).toBe(false);
      resizeTo(767);
      expect(r.isMobile.value).toBe(true);

      resizeTo(1024);
      expect(r.isDrawerMode.value).toBe(false);
      resizeTo(1023);
      expect(r.isDrawerMode.value).toBe(true);
    });
  });

  it('跟随视口变化：同一次订阅内跨档即时翻转', () => {
    withResponsive(r => {
      expect(r.isDrawerMode.value).toBe(false);
      resizeTo(600);
      expect(r.isDrawerMode.value).toBe(true);
      expect(r.isMobile.value).toBe(true);
      resizeTo(1440);
      expect(r.isDrawerMode.value).toBe(false);
    });
  });
});
